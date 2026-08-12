-- ════════════════════════════════════════════════════════════════
--  관리자 콘솔 — 설문 · 프로젝트 평가 단계 · 학교 LMS 과제 현황 · 결석 감점
--
--  2026-08-12. 두 화면을 로그인 상태로 직접 보고 맞춘 것이다. 추측이 아니다.
--
--   · rest.dreamitbiz.com /admin/*   왼쪽 "관리자 메뉴" 14 항목
--       대시보드 · 수강생 관리 · 명단 대조 · 자료 관리 · 과제 관리 ·
--       출석 관리 · 학습평가 성적 · PBL 항목별 점수 · 공지사항 · 팀 편성 ·
--       프로젝트 사전평가 집계표/등수표 · 프로젝트 결과평가 집계표/등수표
--   · lms.dima.ac.kr 강의실 왼쪽 메뉴
--       강의홈 · 주/회차 관리 · 과목공지 · 학습자료실 · 과제관리 ·
--       설문등록/결과조회 · 성적산출/결과 …
--     그중 과제관리 > 학생별 과제 화면이 "학번 · 이름 · 제출수(n/N)" 표다.
--     지각 여부는 과제별 채점 화면에만 있다. 그래서 두 모양을 모두 받는다.
--
--  이 파일이 만드는 것
--   1. 결석을 기타(감점) 항목으로 쓸 수 있게 한다
--   2. 학교 LMS 에서 받아온 과제 제출 상태를 담을 칸
--   3. deduction_summary 를 그 상태까지 보도록 다시 쓴다
--   4. 설문 (등록 · 응답 · 집계)
--   5. 활동에 평가 단계(사전/결과)를 붙이고 집계표 RPC 를 만든다
--   6. 대시보드 한 번에 읽기
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
--  1. 결석 감점
--
--  결석은 출석 점수에서 이미 깎인다. 그런데 사용자는 기타 항목에서도
--  결석을 따로 세고 있어서 항목으로 쓸 수 있게 열어 둔다.
--  기본값은 0 점이다 — 켜 두기만 하고 이중 감점이 되지 않게 한다.
-- ════════════════════════════════════════════════════════════
alter table deduction_kinds drop constraint if exists deduction_kinds_source_check;
alter table deduction_kinds add constraint deduction_kinds_source_check
  check (source in ('manual', 'attendance_late', 'attendance_early_leave',
                    'attendance_absent', 'task_missing', 'task_late'));

-- ════════════════════════════════════════════════════════════
--  2. 학교 LMS 과제 제출 상태
--
--  학교 LMS 가 원본이다. 이쪽은 사본이라 "언제 냈는지" 를 모를 때가 있다
--  (학생별 과제 화면은 제출 건수만 준다). 그래서 상태를 직접 적어 둔다.
--  submitted_at 을 지어내지 않는 이유 — 지어낸 시각이 나중에 근거로 쓰인다.
-- ════════════════════════════════════════════════════════════
alter table task_submissions
  add column if not exists origin text not null default 'local'
      check (origin in ('local', 'ext_lms')),
  add column if not exists ext_state text
      check (ext_state in ('submitted', 'late', 'missing')),
  add column if not exists ext_synced_at timestamptz;

comment on column task_submissions.origin is
  'local = 이 사이트에서 낸 것 / ext_lms = 학교 LMS 현황을 가져온 것';
comment on column task_submissions.ext_state is
  '학교 LMS 가 알려 준 상태. 값이 있으면 submitted_at 보다 이걸 먼저 믿는다.';

-- 학교 LMS 에서 현황을 가져온 이력. 언제 무엇을 반영했는지 남긴다.
create table if not exists task_sync_log (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,
  -- roster = 학생별 과제(제출수) 표 / detail = 과제별 제출 목록
  shape       text not null check (shape in ('roster', 'detail')),
  row_count   int,
  matched     int,
  submitted   int,
  late        int,
  missing     int,
  unmatched   jsonb,
  synced_at   timestamptz not null default now()
);

create index if not exists task_sync_course_idx on task_sync_log(course_id, synced_at desc);

alter table task_sync_log enable row level security;

drop policy if exists task_sync_owner_all on task_sync_log;
create policy task_sync_owner_all on task_sync_log
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ════════════════════════════════════════════════════════════
--  3. 기본 감점 항목 — 결석을 끼워 넣는다
-- ════════════════════════════════════════════════════════════
create or replace function seed_deduction_kinds(p_course uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  insert into deduction_kinds (course_id, code, label, points, source, ord)
  values
    (p_course, 'late',         '지각',          1, 'attendance_late',        0),
    (p_course, 'early_leave',  '조퇴',          1, 'attendance_early_leave', 1),
    -- 출석 점수에서 이미 깎이므로 기본 0 점. 쓰려면 점수를 올린다.
    (p_course, 'absent',       '결석',          0, 'attendance_absent',      2),
    (p_course, 'attitude',     '태도 불량',      2, 'manual',                 3),
    (p_course, 'task_missing', '과제 미제출',    5, 'task_missing',           4),
    (p_course, 'task_late',    '과제 지각 제출', 2, 'task_late',              5)
  on conflict (course_id, code) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function seed_deduction_kinds(uuid) from public, anon;
grant execute on function seed_deduction_kinds(uuid) to authenticated;

-- 이미 항목을 깔아 둔 과목에도 결석 항목을 하나씩 넣어 준다.
insert into deduction_kinds (course_id, code, label, points, source, ord)
select c.id, 'absent', '결석', 0, 'attendance_absent', 2
  from courses c
 where exists (select 1 from deduction_kinds k where k.course_id = c.id)
on conflict (course_id, code) do nothing;

-- ════════════════════════════════════════════════════════════
--  4. 학생별 감점 합계 — 결석과 학교 LMS 상태를 함께 본다
--
--  과제 판정 우선순위
--    ① ext_state (학교 LMS 가 직접 알려 준 것)
--    ② submitted_at 과 due_at 비교
--    ③ 줄이 없으면 미제출
-- ════════════════════════════════════════════════════════════
create or replace function deduction_summary(p_course uuid)
returns table (
  student_id uuid,
  kind_id    uuid,
  code       text,
  label      text,
  cnt        numeric,
  points     numeric,
  subtotal   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with kinds as (
    select * from deduction_kinds where course_id = p_course and active
  ),
  roster as (
    select id from students where course_id = p_course and active
  ),
  att as (
    select a.student_id, a.status, count(*)::numeric as cnt
      from attendance a
      join course_sessions cs on cs.id = a.session_id
      join course_weeks w on w.id = cs.week_id
     where w.course_id = p_course and a.status in ('late', 'early_leave', 'absent')
     group by a.student_id, a.status
  ),
  -- 과제 한 칸의 최종 판정
  tstate as (
    select s.id as student_id,
           coalesce(
             sub.ext_state,
             case when sub.submitted_at is null then 'missing'
                  when t.due_at is not null and sub.submitted_at > t.due_at then 'late'
                  else 'submitted' end
           ) as state
      from students s
      cross join tasks t
      left join task_submissions sub
             on sub.task_id = t.id
            and ((t.mode = 'individual' and sub.student_id = s.id)
              or (t.mode = 'team'       and sub.team_id    = s.team_id))
     where s.course_id = p_course and s.active
       and t.course_id = p_course and t.status <> 'draft'
  ),
  tsk as (
    select student_id,
           count(*) filter (where state = 'missing')::numeric as missing,
           count(*) filter (where state = 'late')::numeric    as late_cnt
      from tstate
     group by student_id
  ),
  man as (
    select d.kind_id, d.student_id, sum(d.count) as cnt
      from deductions d
      join kinds k on k.id = d.kind_id
     group by d.kind_id, d.student_id
  ),
  -- 같은 식을 두 번 쓰지 않으려고 건수를 먼저 만든다.
  counted as (
    select r.id as student_id, k.id as kind_id, k.code, k.label, k.points,
           coalesce(
             case k.source
               when 'attendance_late'        then (select cnt from att where att.student_id = r.id and att.status = 'late')
               when 'attendance_early_leave' then (select cnt from att where att.student_id = r.id and att.status = 'early_leave')
               when 'attendance_absent'      then (select cnt from att where att.student_id = r.id and att.status = 'absent')
               when 'task_missing'           then (select missing  from tsk where tsk.student_id = r.id)
               when 'task_late'              then (select late_cnt from tsk where tsk.student_id = r.id)
               else (select cnt from man where man.kind_id = k.id and man.student_id = r.id)
             end, 0) as cnt
      from roster r
      cross join kinds k
  )
  select student_id, kind_id, code, label, cnt, points, cnt * points as subtotal
    from counted
$$;

revoke all on function deduction_summary(uuid) from public, anon;
grant execute on function deduction_summary(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  5. 설문
--
--  학교 LMS 의 "설문등록/결과조회" 자리다.
--  기본은 익명이다. 익명일 때 교수는 **합계만** 본다 —
--  survey_answers 에 교수용 정책을 아예 만들지 않고,
--  집계 함수(security definer)만 통과시킨다. 화면에서 가리는 게 아니다.
-- ════════════════════════════════════════════════════════════
create table if not exists surveys (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  week_id    uuid references course_weeks(id) on delete set null,
  title      text not null,
  intro      text,
  anonymous  boolean not null default true,
  opens_at   timestamptz,
  closes_at  timestamptz,
  status     text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists survey_course_idx on surveys(course_id);

create table if not exists survey_questions (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  ord       int not null default 0,
  label     text not null,
  -- scale = 1~N 점 / choice = 보기 중 하나 / text = 서술
  kind      text not null default 'scale' check (kind in ('scale', 'choice', 'text')),
  choices   text[],
  scale_max int not null default 5 check (scale_max between 2 and 10),
  required  boolean not null default true
);

create index if not exists survey_q_idx on survey_questions(survey_id, ord);

create table if not exists survey_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references surveys(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (survey_id, student_id)
);

create table if not exists survey_answers (
  response_id uuid not null references survey_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  value_num   numeric,
  value_text  text,
  primary key (response_id, question_id)
);

alter table surveys          enable row level security;
alter table survey_questions enable row level security;
alter table survey_responses enable row level security;
alter table survey_answers   enable row level security;

drop policy if exists survey_owner_all     on surveys;
drop policy if exists survey_student_read  on surveys;
drop policy if exists survey_q_owner_all    on survey_questions;
drop policy if exists survey_q_student_read on survey_questions;
drop policy if exists survey_resp_owner_read on survey_responses;
drop policy if exists survey_resp_student_rw on survey_responses;
drop policy if exists survey_ans_student_rw  on survey_answers;

create policy survey_owner_all on surveys
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- 준비중 설문은 학생에게 내려가지 않는다.
create policy survey_student_read on surveys
  for select using (in_course(course_id) and status <> 'draft');

create policy survey_q_owner_all on survey_questions
  for all using (exists (select 1 from surveys s where s.id = survey_id and owns_course(s.course_id)))
  with check (exists (select 1 from surveys s where s.id = survey_id and owns_course(s.course_id)));

create policy survey_q_student_read on survey_questions
  for select using (exists (
    select 1 from surveys s
     where s.id = survey_id and in_course(s.course_id) and s.status <> 'draft'));

-- 교수는 "누가 냈는지" 는 본다 (미응답자 독촉이 필요하다).
-- 익명 설문이라도 **답 내용** 은 survey_answers 정책이 없어서 못 읽는다.
create policy survey_resp_owner_read on survey_responses
  for select using (exists (
    select 1 from surveys s where s.id = survey_id and owns_course(s.course_id)));

create policy survey_resp_student_rw on survey_responses
  for all using (student_id = jwt_student_id())
  with check (student_id = jwt_student_id()
    and exists (select 1 from surveys s
                 where s.id = survey_id and in_course(s.course_id) and s.status = 'open'));

create policy survey_ans_student_rw on survey_answers
  for all using (exists (
        select 1 from survey_responses r
         where r.id = response_id and r.student_id = jwt_student_id()))
  with check (exists (
        select 1 from survey_responses r
         where r.id = response_id and r.student_id = jwt_student_id()));

-- ── 집계 ─────────────────────────────────────────────────────
-- 익명이든 아니든 이 함수만 통과한다. 서술형은 답을 그대로 돌려주되
-- 누가 썼는지는 붙이지 않는다.
create or replace function survey_summary(p_survey uuid)
returns table (
  question_id uuid,
  label       text,
  kind        text,
  scale_max   int,
  answers     int,
  avg_num     numeric,
  breakdown   jsonb,
  texts       jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with own as (
    select s.id from surveys s where s.id = p_survey and owns_course(s.course_id)
  )
  select q.id,
         q.label,
         q.kind,
         q.scale_max,
         count(a.response_id)::int,
         round(avg(a.value_num), 2),
         -- 척도·객관식은 값별 건수
         coalesce(
           (select jsonb_object_agg(t.k, t.n)
              from (select coalesce(a2.value_num::text, a2.value_text) as k, count(*) as n
                      from survey_answers a2
                     where a2.question_id = q.id
                       and (a2.value_num is not null or a2.value_text is not null)
                     group by 1) t),
           '{}'::jsonb),
         -- 서술형만 원문. 순서를 섞어 제출 순서로 사람을 짚지 못하게 한다.
         case when q.kind = 'text' then coalesce(
                (select jsonb_agg(x.value_text order by md5(x.response_id::text))
                   from survey_answers x
                  where x.question_id = q.id and x.value_text is not null), '[]'::jsonb)
              else '[]'::jsonb end
    from survey_questions q
    left join survey_answers a on a.question_id = q.id
   where q.survey_id in (select id from own)
   group by q.id, q.label, q.kind, q.scale_max, q.ord
   order by q.ord
$$;

revoke all on function survey_summary(uuid) from public, anon;
grant execute on function survey_summary(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  6. 프로젝트 사전평가 · 결과평가
--
--  활동에 단계를 붙인다. 같은 루브릭으로 학기 초(사전)와 학기 말(결과)을
--  두 번 평가하고 그 둘을 나란히 놓는 것이 집계표다.
-- ════════════════════════════════════════════════════════════
alter table activities
  add column if not exists phase text not null default 'none'
      check (phase in ('none', 'pre', 'result'));

comment on column activities.phase is
  'pre = 프로젝트 사전평가 / result = 결과평가 / none = 단계 없는 일반 활동';

-- ── 항목별 집계 (긴 형태) ────────────────────────────────────
create or replace function project_eval_summary(p_course uuid, p_phase text)
returns table (
  activity_id   uuid,
  activity_title text,
  target_id     uuid,
  target_label  text,
  team_id       uuid,
  student_id    uuid,
  item_id       uuid,
  item_label    text,
  item_max      numeric,
  item_weight   numeric,
  avg_score     numeric,
  raters        int
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.title, tg.id, tg.title, tg.team_id, tg.student_id,
         ri.id, ri.label, ri.max_score, ri.weight,
         round(avg(es.score), 2),
         count(distinct e.id)::int
    from activities a
    join targets tg      on tg.activity_id = a.id
    join rubric_items ri on ri.rubric_id = a.rubric_id
    left join assignments asg on asg.target_id = tg.id
    left join evaluations e   on e.assignment_id = asg.id and e.submitted_at is not null
    left join evaluation_scores es on es.evaluation_id = e.id and es.rubric_item_id = ri.id
   where a.course_id = p_course
     and a.phase = p_phase
     and owns_course(a.course_id)
   group by a.id, a.title, tg.id, tg.title, tg.team_id, tg.student_id,
            ri.id, ri.label, ri.max_score, ri.weight, ri.ord, tg.ord
   order by a.title, tg.ord, ri.ord
$$;

revoke all on function project_eval_summary(uuid, text) from public, anon;
grant execute on function project_eval_summary(uuid, text) to authenticated;

-- ── 대상별 총점과 등수 ───────────────────────────────────────
create or replace function project_eval_totals(p_course uuid, p_phase text)
returns table (
  activity_id    uuid,
  activity_title text,
  target_id      uuid,
  target_label   text,
  team_id        uuid,
  student_id     uuid,
  raters         int,
  avg_total      numeric,
  rank_no        int
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select a.id as activity_id, a.title as activity_title,
           tg.id as target_id, tg.title as target_label,
           tg.team_id, tg.student_id,
           count(distinct e.id)::int as raters,
           round(avg(e.raw_total), 2) as avg_total
      from activities a
      join targets tg on tg.activity_id = a.id
      left join assignments asg on asg.target_id = tg.id
      left join evaluations e   on e.assignment_id = asg.id and e.submitted_at is not null
     where a.course_id = p_course
       and a.phase = p_phase
       and owns_course(a.course_id)
     group by a.id, a.title, tg.id, tg.title, tg.team_id, tg.student_id
  )
  select b.*,
         rank() over (partition by b.activity_id order by b.avg_total desc nulls last)::int
    from base b
   order by b.activity_title, rank() over (partition by b.activity_id order by b.avg_total desc nulls last)
$$;

revoke all on function project_eval_totals(uuid, text) from public, anon;
grant execute on function project_eval_totals(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════
--  7. 대시보드 — 한 번에 읽기
--
--  화면에서 표 열 개를 따로 세면 요청이 열 번 나간다. 한 번으로 줄인다.
-- ════════════════════════════════════════════════════════════
create or replace function course_overview(p_course uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not owns_course(p_course) then '{}'::jsonb else jsonb_build_object(
    'students',   (select count(*) from students where course_id = p_course and active),
    'teams',      (select count(*) from teams where course_id = p_course),
    'weeks',      (select count(*) from course_weeks where course_id = p_course),
    'weeks_open', (select count(*) from course_weeks where course_id = p_course and published),
    'sessions',   (select count(*) from course_sessions cs
                     join course_weeks w on w.id = cs.week_id where w.course_id = p_course),
    'notices',    (select count(*) from notices where course_id = p_course),
    'materials',  (select count(*) from materials where course_id = p_course),
    'tasks',      (select count(*) from tasks where course_id = p_course),
    'tasks_open', (select count(*) from tasks where course_id = p_course and status = 'open'),
    'surveys',    (select count(*) from surveys where course_id = p_course),
    'surveys_open', (select count(*) from surveys where course_id = p_course and status = 'open'),
    'activities', (select count(*) from activities where course_id = p_course),
    'activities_open', (select count(*) from activities where course_id = p_course and status = 'open'),
    -- 출결이 아직 안 찍힌 회차. 수업은 했는데 출석부가 비어 있는 상태다.
    'sessions_blank', (select count(*) from course_sessions cs
                         join course_weeks w on w.id = cs.week_id
                        where w.course_id = p_course
                          and not exists (select 1 from attendance a where a.session_id = cs.id)),
    'attendance_marked', (select count(*) from attendance a
                            join course_sessions cs on cs.id = a.session_id
                            join course_weeks w on w.id = cs.week_id
                           where w.course_id = p_course),
    'late',    (select count(*) from attendance a
                  join course_sessions cs on cs.id = a.session_id
                  join course_weeks w on w.id = cs.week_id
                 where w.course_id = p_course and a.status = 'late'),
    'absent',  (select count(*) from attendance a
                  join course_sessions cs on cs.id = a.session_id
                  join course_weeks w on w.id = cs.week_id
                 where w.course_id = p_course and a.status = 'absent'),
    'deduction_total', (select coalesce(sum(subtotal), 0) from deduction_summary(p_course)),
    'grades_computed', (select count(*) from final_grades where course_id = p_course),
    'grades_approved', (select count(*) from final_grades where course_id = p_course and status = 'approved'),
    'last_task_sync',  (select max(synced_at) from task_sync_log where course_id = p_course)
  ) end
$$;

revoke all on function course_overview(uuid) from public, anon;
grant execute on function course_overview(uuid) to authenticated;
