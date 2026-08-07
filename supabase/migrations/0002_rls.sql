-- ════════════════════════════════════════════════════════════════
--  RLS — 누가 무엇을 볼 수 있는가
--
--  핵심 규칙
--   1. 교수는 자기 과목 안의 모든 것을 볼 수 있다.
--   2. 학생은 자기 수업 안의 것만 보고, 자기가 쓴 평가만 수정한다.
--   3. 학생은 evaluations / results 를 **직접 읽을 수 없다** (점수 비공개).
--      코멘트는 my_feedback() RPC 가 평가자 신원과 점수를 뺀 채로만 내보낸다.
-- ════════════════════════════════════════════════════════════════

-- ── JWT 클레임 헬퍼 ─────────────────────────────────────────
-- 학생 토큰에는 student_id / course_id 클레임이 들어 있다 (student-login Edge Function).
create or replace function jwt_student_id() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'student_id', ''), '')::uuid
$$;

create or replace function jwt_course_id() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'course_id', ''), '')::uuid
$$;

-- security definer — 정책 안에서 courses 를 다시 조회할 때 RLS 재귀를 피한다.
create or replace function owns_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from courses c where c.id = cid and c.owner_id = auth.uid())
$$;

create or replace function in_course(cid uuid) returns boolean
language sql stable as $$
  select jwt_course_id() = cid
$$;

-- 활동이 지금 제출 가능한 상태인가
create or replace function activity_open(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from activities a
     where a.id = aid
       and a.status = 'open'
       and (a.opens_at  is null or now() >= a.opens_at)
       and (a.closes_at is null or now() <= a.closes_at)
  )
$$;

-- 학생에게 보여도 되는 활동인가 (초안은 감춘다)
create or replace function activity_visible(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from activities a
     where a.id = aid and a.course_id = jwt_course_id() and a.status <> 'draft'
  )
$$;

alter table courses           enable row level security;
alter table teams             enable row level security;
alter table students          enable row level security;
alter table rubrics           enable row level security;
alter table rubric_items      enable row level security;
alter table activities        enable row level security;
alter table targets           enable row level security;
alter table assignments       enable row level security;
alter table evaluations       enable row level security;
alter table evaluation_scores enable row level security;
alter table contributions     enable row level security;
alter table discussion_posts  enable row level security;
alter table results           enable row level security;
alter table audit_log         enable row level security;

-- ── 과목 ─────────────────────────────────────────────────────
create policy course_owner_all on courses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy course_student_read on courses
  for select using (in_course(id));

-- ── 팀 / 학생 명단 ───────────────────────────────────────────
-- 학생도 같은 수업 명단(이름·팀)은 봐야 한다. 팀 기여도 배분과 발표 대상 표시에 필요.
create policy team_owner_all on teams
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy team_student_read on teams
  for select using (in_course(course_id));

create policy student_owner_all on students
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy student_peer_read on students
  for select using (in_course(course_id));

-- ── 루브릭 ───────────────────────────────────────────────────
create policy rubric_owner_all on rubrics
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy rubric_student_read on rubrics
  for select using (in_course(course_id));

create policy rubric_item_owner_all on rubric_items
  for all using (exists (select 1 from rubrics r where r.id = rubric_id and owns_course(r.course_id)))
  with check (exists (select 1 from rubrics r where r.id = rubric_id and owns_course(r.course_id)));
create policy rubric_item_student_read on rubric_items
  for select using (exists (select 1 from rubrics r where r.id = rubric_id and in_course(r.course_id)));

-- ── 활동 ─────────────────────────────────────────────────────
create policy activity_owner_all on activities
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy activity_student_read on activities
  for select using (in_course(course_id) and status <> 'draft');

-- ── 평가 대상 ────────────────────────────────────────────────
create policy target_owner_all on targets
  for all using (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)))
  with check (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)));
create policy target_student_read on targets
  for select using (activity_visible(activity_id));

-- ── 배정 ─────────────────────────────────────────────────────
create policy assignment_owner_all on assignments
  for all using (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)))
  with check (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)));
-- 학생은 **자기에게 배정된 것만** 본다. 남이 누구를 평가하는지는 볼 수 없다.
create policy assignment_student_read on assignments
  for select using (evaluator_id = jwt_student_id());

-- ── 평가 ─────────────────────────────────────────────────────
-- 학생은 자기가 쓴 평가만 읽고 쓴다. 남이 자기를 어떻게 평가했는지는 절대 못 읽는다.
create policy evaluation_owner_all on evaluations
  for all using (exists (
        select 1 from assignments s join activities a on a.id = s.activity_id
         where s.id = assignment_id and owns_course(a.course_id)))
  with check (exists (
        select 1 from assignments s join activities a on a.id = s.activity_id
         where s.id = assignment_id and owns_course(a.course_id)));

create policy evaluation_student_rw on evaluations
  for select using (exists (
        select 1 from assignments s where s.id = assignment_id and s.evaluator_id = jwt_student_id()));

create policy evaluation_student_insert on evaluations
  for insert with check (exists (
        select 1 from assignments s
         where s.id = assignment_id
           and s.evaluator_id = jwt_student_id()
           and activity_open(s.activity_id)));

create policy evaluation_student_update on evaluations
  for update using (exists (
        select 1 from assignments s
         where s.id = assignment_id
           and s.evaluator_id = jwt_student_id()
           and activity_open(s.activity_id)))
  with check (exists (
        select 1 from assignments s
         where s.id = assignment_id and s.evaluator_id = jwt_student_id()));

create policy evalscore_owner_read on evaluation_scores
  for select using (exists (
        select 1 from evaluations e join assignments s on s.id = e.assignment_id
                 join activities a on a.id = s.activity_id
         where e.id = evaluation_id and owns_course(a.course_id)));

create policy evalscore_student_all on evaluation_scores
  for all using (exists (
        select 1 from evaluations e join assignments s on s.id = e.assignment_id
         where e.id = evaluation_id and s.evaluator_id = jwt_student_id()))
  with check (exists (
        select 1 from evaluations e join assignments s on s.id = e.assignment_id
         where e.id = evaluation_id
           and s.evaluator_id = jwt_student_id()
           and activity_open(s.activity_id)));

-- ── 팀 기여도 ────────────────────────────────────────────────
create policy contrib_owner_all on contributions
  for all using (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)))
  with check (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)));

create policy contrib_student_rw on contributions
  for select using (evaluator_id = jwt_student_id());
create policy contrib_student_write on contributions
  for insert with check (evaluator_id = jwt_student_id() and activity_open(activity_id));
create policy contrib_student_update on contributions
  for update using (evaluator_id = jwt_student_id() and activity_open(activity_id))
  with check (evaluator_id = jwt_student_id());

-- ── 토론 ─────────────────────────────────────────────────────
-- 토론은 공개 활동이므로 같은 수업 학생끼리 서로 글을 읽는다.
create policy post_owner_all on discussion_posts
  for all using (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)))
  with check (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)));
create policy post_student_read on discussion_posts
  for select using (activity_visible(activity_id));
create policy post_student_write on discussion_posts
  for insert with check (author_id = jwt_student_id() and activity_open(activity_id));

-- ── 결과 ─────────────────────────────────────────────────────
-- 학생 정책이 아예 없다 = 학생은 results 를 한 줄도 읽을 수 없다. (점수 비공개)
create policy result_owner_all on results
  for all using (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)))
  with check (exists (select 1 from activities a where a.id = activity_id and owns_course(a.course_id)));

create policy audit_owner_read on audit_log
  for select using (course_id is null or owns_course(course_id));
