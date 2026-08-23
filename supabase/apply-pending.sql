-- ════════════════════════════════════════════════════════════════
--  0006 ~ 0012 를 한 번에 올리는 파일
--
--  왜 있나 — 일곱 파일을 순서대로 붙여 넣다 보면 하나를 빠뜨리거나 순서가
--  꼬이기 쉽다. 실제로 두 번 그랬다. 이 파일 하나만 통째로 복사해
--  Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run 하면 된다.
--
--  **몇 번을 돌려도 안전하다.** 표는 create table if not exists,
--  정책은 drop policy if exists 를 앞에 두었고, 제약과 트리거도 마찬가지다.
--  이미 올라가 있어도 그냥 다시 지나간다.
--
--  맨 끝에 확인 질의와 스키마 캐시 갱신이 붙어 있다. Run 뒤에 나오는 표에서
--  여섯 칸이 모두 이름을 보여 주면 성공이다. null 이 있으면 그 위 오류를 볼 것.
--
--  ⚠️ 이 파일로도 **Edge Function 은 배포되지 않는다.** 학생 로그인을 새 방식
--     으로 바꾸려면 student-login 을 따로 배포해야 한다 (docs/11-migrate.md 3-2 ③).
--
--  ⚠️ 손으로 고치지 말 것. migrations/ 의 원본을 고치고 다시 만든다:
--       cd supabase && node concat-pending.mjs
-- ════════════════════════════════════════════════════════════════

-- ▼▼▼ 0006_course_ops.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  수업 운영 + 최종 성적 산출
--
--  지금까지 이 저장소는 "상호평가" 하나만 다뤘다. 실제 수업을 돌리려면
--  주차 · 공지 · 자료 · 과제 · 출석이 같은 곳에 있어야 하고, 마지막에
--  그것들을 하나의 성적으로 합쳐야 한다. 이 마이그레이션이 그 부분이다.
--
--  확정된 공개 정책 (2026-08-10)
--   · 과제 점수 · 출석은 **본인 것만** 학생에게 보인다
--   · 상호평가 원점수(results) · 시험 점수 · 최종 성적은 학생에게 비공개
--     → 정책을 아예 만들지 않는 방식으로 막는다. 화면에서 숨기지 않는다.
--
--  학교 LMS(dima)는 원본이고 이쪽이 사본이다. 가져온 행은 ext_ref 로
--  원본을 가리키고, 사람이 여기서 고친 행은 locked = true 로 덮어쓰기를 막는다.
-- ════════════════════════════════════════════════════════════════

-- ── 과목 설정 ────────────────────────────────────────────────
-- 과목마다 상호평가를 하는지, 프로젝트를 개인으로 하는지 팀으로 하는지가 다르다.
alter table courses
  add column if not exists peer_assessment boolean not null default true,
  add column if not exists project_mode text not null default 'individual',
  add column if not exists ext_lms_url text;

alter table courses drop constraint if exists courses_project_mode_check;
alter table courses add constraint courses_project_mode_check
  check (project_mode in ('none', 'individual', 'team'));

comment on column courses.peer_assessment is '학생 상호평가 사용 여부. false 면 성적 구성에서 peer_pct 가 0 이어야 한다.';
comment on column courses.project_mode is 'none=프로젝트 없음 / individual=개인 프로젝트 / team=팀 프로젝트';
comment on column courses.ext_lms_url is '학교 LMS 주차 목록 주소. 가져오기의 원본이다.';

-- ── 주차 ─────────────────────────────────────────────────────
create table if not exists course_weeks (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  week_no    int  not null check (week_no between 1 and 20),
  title      text not null,
  summary    text,
  syllabus   text,                     -- 주차별 강의계획
  starts_on  date,
  ends_on    date,
  published  boolean not null default false,
  ext_ref    text,                     -- 학교 LMS 쪽 식별자
  synced_at  timestamptz,              -- 마지막으로 가져온 시각
  locked     boolean not null default false,  -- true 면 가져오기가 덮어쓰지 않는다
  created_at timestamptz not null default now(),
  unique (course_id, week_no)
);

-- 한 주에 차시가 여러 번인 과목이 있어서 출석은 주차가 아니라 회차에 붙인다.
create table if not exists course_sessions (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references course_weeks(id) on delete cascade,
  session_no int  not null check (session_no between 1 and 10),
  topic      text,
  meets_on   date,
  minutes    int,
  created_at timestamptz not null default now(),
  unique (week_id, session_no)
);

-- ── 공지 · 자료 ──────────────────────────────────────────────
create table if not exists notices (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  week_id      uuid references course_weeks(id) on delete set null,
  title        text not null,
  body         text,
  pinned       boolean not null default false,
  published_at timestamptz,            -- null 이면 초안
  ext_ref      text,
  locked       boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists materials (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  week_id    uuid references course_weeks(id) on delete set null,
  title      text not null,
  kind       text not null default 'link'
             check (kind in ('link', 'file', 'video', 'doc', 'syllabus')),
  url        text,
  note       text,
  ord        int  not null default 0,
  published  boolean not null default true,
  ext_ref    text,
  locked     boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 과제 ─────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  week_id      uuid references course_weeks(id) on delete set null,
  title        text not null,
  instruction  text,
  -- 개인 과제인지 팀 과제인지. 과목의 project_mode 와는 별개로 과제마다 정한다.
  mode         text not null default 'individual' check (mode in ('individual', 'team')),
  max_points   numeric not null default 100 check (max_points > 0),
  opens_at     timestamptz,
  due_at       timestamptz,
  allow_late   boolean not null default true,
  -- 지각 제출 감점 비율(0~1). 0.2 면 만점의 20% 를 깎는다.
  late_penalty numeric not null default 0 check (late_penalty between 0 and 1),
  status       text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  ext_ref      text,
  locked       boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists task_submissions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  student_id   uuid references students(id) on delete cascade,
  team_id      uuid references teams(id) on delete cascade,
  body         text,
  url          text,
  submitted_at timestamptz,
  -- 채점 결과. 학생은 본인 것만 읽는다 (확정된 공개 정책).
  score        numeric check (score >= 0),
  feedback     text,
  graded_at    timestamptz,
  updated_at   timestamptz not null default now(),
  constraint task_sub_one_owner check ((student_id is null) <> (team_id is null))
);

create unique index if not exists task_sub_student_uniq
  on task_submissions (task_id, student_id) where student_id is not null;
create unique index if not exists task_sub_team_uniq
  on task_submissions (task_id, team_id) where team_id is not null;

-- 과제 만점을 넘는 점수를 막는다. CHECK 로는 다른 테이블을 못 봐서 트리거로 처리.
create or replace function check_task_score_range() returns trigger
language plpgsql as $$
declare mx numeric;
begin
  if new.score is null then return new; end if;
  select max_points into mx from tasks where id = new.task_id;
  if new.score > mx then
    raise exception '점수 %는 이 과제의 만점 %를 넘습니다.', new.score, mx;
  end if;
  return new;
end $$;

drop trigger if exists trg_check_task_score on task_submissions;
create trigger trg_check_task_score
before insert or update on task_submissions
for each row execute function check_task_score_range();

-- ── 출석 (헤이영) ────────────────────────────────────────────
create table if not exists attendance (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references course_sessions(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  status        text not null check (status in ('present', 'late', 'absent', 'excused')),
  checked_in_at timestamptz,
  -- heyyoung = 헤이영 파일에서 가져옴 / manual = 교수가 직접 입력
  source        text not null default 'manual' check (source in ('heyyoung', 'manual')),
  note          text,
  updated_at    timestamptz not null default now(),
  unique (session_id, student_id)
);

-- 헤이영 파일을 올린 이력. 같은 파일을 두 번 올렸는지 확인하는 용도.
create table if not exists attendance_imports (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  filename    text,
  file_hash   text,                    -- 내용 sha256
  row_count   int,
  matched     int,                     -- 학번이 명단과 맞은 행
  unmatched   jsonb,                   -- 못 맞춘 행 (학번·이름만)
  imported_at timestamptz not null default now()
);

-- ── 시험 ─────────────────────────────────────────────────────
create table if not exists exams (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  kind       text not null check (kind in ('midterm', 'final', 'quiz', 'other')),
  title      text not null,
  max_points numeric not null default 100 check (max_points > 0),
  held_on    date,
  ord        int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists exam_scores (
  exam_id    uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score      numeric check (score >= 0),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);

-- ── 성적 구성비 ──────────────────────────────────────────────
create table if not exists grade_policies (
  course_id       uuid primary key references courses(id) on delete cascade,
  attendance_pct  numeric not null default 20 check (attendance_pct  >= 0),
  task_pct        numeric not null default 30 check (task_pct        >= 0),
  midterm_pct     numeric not null default 20 check (midterm_pct     >= 0),
  final_pct       numeric not null default 20 check (final_pct       >= 0),
  peer_pct        numeric not null default 10 check (peer_pct        >= 0),
  -- 출석 인정 비율. 지각은 0.5회, 인정결석은 1회로 친다.
  late_credit     numeric not null default 0.5 check (late_credit    between 0 and 1),
  excused_credit  numeric not null default 1   check (excused_credit between 0 and 1),
  -- 결석률이 이 값을 넘으면 총점과 무관하게 F. 학칙상 보통 1/4.
  absence_limit   numeric not null default 0.25 check (absence_limit between 0 and 1),
  updated_at      timestamptz not null default now(),
  constraint grade_pct_sum
    check (attendance_pct + task_pct + midterm_pct + final_pct + peer_pct = 100)
);

comment on constraint grade_pct_sum on grade_policies is
  '구성비 합은 항상 100 이어야 한다. 상호평가를 안 하는 과목은 peer_pct 를 0 으로 두고 나머지에 나눠 준다.';

-- ── 최종 성적 ────────────────────────────────────────────────
create table if not exists final_grades (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references courses(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  attendance_pts    numeric,      -- 구성비를 반영한 환산 점수
  task_pts          numeric,
  midterm_pts       numeric,
  final_pts         numeric,
  peer_pts          numeric,
  total             numeric,
  letter            text,
  -- 진단용 원자료
  sessions_total    int,
  sessions_credited numeric,
  absence_rate      numeric,
  over_absence      boolean not null default false,
  override_total    numeric,      -- 교수가 손으로 덮어쓴 총점
  note              text,
  status            text not null default 'draft' check (status in ('draft', 'approved')),
  computed_at       timestamptz not null default now(),
  unique (course_id, student_id)
);

-- ── 인덱스 ───────────────────────────────────────────────────
create index if not exists course_weeks_course_idx    on course_weeks(course_id, week_no);
create index if not exists course_sessions_week_idx   on course_sessions(week_id, session_no);
create index if not exists notices_course_idx         on notices(course_id, published_at desc);
create index if not exists materials_course_idx       on materials(course_id, ord);
create index if not exists tasks_course_idx           on tasks(course_id, due_at);
create index if not exists task_sub_task_idx          on task_submissions(task_id);
create index if not exists attendance_session_idx     on attendance(session_id);
create index if not exists attendance_student_idx     on attendance(student_id);
create index if not exists exam_scores_student_idx    on exam_scores(student_id);
create index if not exists final_grades_course_idx    on final_grades(course_id);

-- ════════════════════════════════════════════════════════════
--  RLS
-- ════════════════════════════════════════════════════════════

alter table course_weeks        enable row level security;
alter table course_sessions     enable row level security;
alter table notices             enable row level security;
alter table materials           enable row level security;
alter table tasks               enable row level security;
alter table task_submissions    enable row level security;
alter table attendance          enable row level security;
alter table attendance_imports  enable row level security;
alter table exams               enable row level security;
alter table exam_scores         enable row level security;
alter table grade_policies      enable row level security;
alter table final_grades        enable row level security;

-- 주차가 학생에게 보이는가 (하위 정책에서 재사용)
create or replace function week_visible(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_weeks w
     where w.id = wid and w.course_id = jwt_course_id() and w.published
  )
$$;

-- 과제가 학생에게 보이는가
create or replace function task_visible(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t
     where t.id = tid and t.course_id = jwt_course_id() and t.status <> 'draft'
  )
$$;

create or replace function task_open(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t
     where t.id = tid
       and t.status = 'open'
       and (t.opens_at is null or now() >= t.opens_at)
       and (t.due_at  is null or now() <= t.due_at or t.allow_late)
  )
$$;

-- 학생이 속한 팀 (팀 과제 제출용)
create or replace function jwt_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.team_id from students s where s.id = jwt_student_id()
$$;

-- ── 주차 · 회차 ──────────────────────────────────────────────
drop policy if exists week_owner_all on course_weeks;
create policy week_owner_all on course_weeks
  for all using (owns_course(course_id)) with check (owns_course(course_id));
drop policy if exists week_student_read on course_weeks;
create policy week_student_read on course_weeks
  for select using (in_course(course_id) and published);

drop policy if exists session_owner_all on course_sessions;
create policy session_owner_all on course_sessions
  for all using (exists (select 1 from course_weeks w where w.id = week_id and owns_course(w.course_id)))
  with check (exists (select 1 from course_weeks w where w.id = week_id and owns_course(w.course_id)));
drop policy if exists session_student_read on course_sessions;
create policy session_student_read on course_sessions
  for select using (week_visible(week_id));

-- ── 공지 · 자료 ──────────────────────────────────────────────
drop policy if exists notice_owner_all on notices;
create policy notice_owner_all on notices
  for all using (owns_course(course_id)) with check (owns_course(course_id));
drop policy if exists notice_student_read on notices;
create policy notice_student_read on notices
  for select using (in_course(course_id) and published_at is not null and published_at <= now());

drop policy if exists material_owner_all on materials;
create policy material_owner_all on materials
  for all using (owns_course(course_id)) with check (owns_course(course_id));
drop policy if exists material_student_read on materials;
create policy material_student_read on materials
  for select using (in_course(course_id) and published);

-- ── 과제 ─────────────────────────────────────────────────────
drop policy if exists task_owner_all on tasks;
create policy task_owner_all on tasks
  for all using (owns_course(course_id)) with check (owns_course(course_id));
drop policy if exists task_student_read on tasks;
create policy task_student_read on tasks
  for select using (in_course(course_id) and status <> 'draft');

-- 학생은 **본인(또는 자기 팀) 제출물만** 읽고 쓴다.
-- score / feedback 도 여기서 함께 보인다 — 과제 점수는 본인 공개가 확정 정책이다.
drop policy if exists task_sub_owner_all on task_submissions;
create policy task_sub_owner_all on task_submissions
  for all using (exists (select 1 from tasks t where t.id = task_id and owns_course(t.course_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and owns_course(t.course_id)));

drop policy if exists task_sub_student_read on task_submissions;
create policy task_sub_student_read on task_submissions
  for select using (
    task_visible(task_id)
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  );

drop policy if exists task_sub_student_insert on task_submissions;
create policy task_sub_student_insert on task_submissions
  for insert with check (
    task_open(task_id)
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  );

-- 채점 뒤에는 학생이 못 고친다. 점수·피드백 칸을 학생이 건드리는 것도 막는다.
drop policy if exists task_sub_student_update on task_submissions;
create policy task_sub_student_update on task_submissions
  for update using (
    task_open(task_id)
    and graded_at is null
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  )
  with check (
    score is null and feedback is null and graded_at is null
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  );

-- ── 출석 ─────────────────────────────────────────────────────
drop policy if exists attendance_owner_all on attendance;
create policy attendance_owner_all on attendance
  for all using (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)))
  with check (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)));

-- 본인 출결만 읽는다. 남의 출결은 못 본다.
drop policy if exists attendance_student_read on attendance;
create policy attendance_student_read on attendance
  for select using (student_id = jwt_student_id());

drop policy if exists attimport_owner_all on attendance_imports;
create policy attimport_owner_all on attendance_imports
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ── 시험 ─────────────────────────────────────────────────────
-- 시험 일정은 학생도 본다. 점수(exam_scores)는 학생 정책이 없다 = 비공개.
drop policy if exists exam_owner_all on exams;
create policy exam_owner_all on exams
  for all using (owns_course(course_id)) with check (owns_course(course_id));
drop policy if exists exam_student_read on exams;
create policy exam_student_read on exams
  for select using (in_course(course_id));

drop policy if exists exam_score_owner_all on exam_scores;
create policy exam_score_owner_all on exam_scores
  for all using (exists (select 1 from exams e where e.id = exam_id and owns_course(e.course_id)))
  with check (exists (select 1 from exams e where e.id = exam_id and owns_course(e.course_id)));

-- ── 성적 ─────────────────────────────────────────────────────
-- grade_policies / final_grades 는 학생 정책이 없다 = 한 줄도 못 읽는다.
drop policy if exists grade_policy_owner_all on grade_policies;
create policy grade_policy_owner_all on grade_policies
  for all using (owns_course(course_id)) with check (owns_course(course_id));

drop policy if exists final_grade_owner_all on final_grades;
create policy final_grade_owner_all on final_grades
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ════════════════════════════════════════════════════════════
--  최종 성적 산출
--
--  출석 · 과제 · 중간 · 기말 · 상호평가를 grade_policies 의 구성비로 합친다.
--  클라이언트가 보낸 총점을 저장하는 경로는 만들지 않는다 (규칙 3).
-- ════════════════════════════════════════════════════════════
create or replace function compute_final_grades(p_course uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  pol       grade_policies%rowtype;
  peer_on   boolean;
  n_sessions int;
  affected  int;
begin
  if not owns_course(p_course) then
    raise exception '이 과목의 성적을 계산할 권한이 없습니다.';
  end if;

  select * into pol from grade_policies where course_id = p_course;
  if not found then
    -- 구성비를 안 만들어 뒀으면 기본값으로 하나 깔아 준다.
    insert into grade_policies(course_id) values (p_course)
    returning * into pol;
  end if;

  select peer_assessment into peer_on from courses where id = p_course;

  select count(*) into n_sessions
    from course_sessions cs join course_weeks w on w.id = cs.week_id
   where w.course_id = p_course;

  with
  -- 출석: 회차별 인정 비율을 더해 전체 회차로 나눈다.
  att as (
    select s.id as student_id,
           coalesce(sum(case a.status
                          when 'present' then 1
                          when 'late'    then pol.late_credit
                          when 'excused' then pol.excused_credit
                          else 0 end), 0) as credited,
           coalesce(sum(case when a.status = 'absent' then 1 else 0 end), 0) as absent_cnt
      from students s
      left join attendance a on a.student_id = s.id
      left join course_sessions cs on cs.id = a.session_id
      left join course_weeks w on w.id = cs.week_id and w.course_id = p_course
     where s.course_id = p_course and s.active
     group by s.id
  ),
  -- 과제: 팀 과제는 팀 제출물 점수를 팀원 전원에게 준다.
  tsk as (
    select s.id as student_id,
           sum(t.max_points)                        as possible,
           sum(coalesce(sub.score, 0))              as earned
      from students s
      cross join tasks t
      left join task_submissions sub
             on sub.task_id = t.id
            and ((t.mode = 'individual' and sub.student_id = s.id)
              or (t.mode = 'team'       and sub.team_id    = s.team_id))
     where s.course_id = p_course and s.active
       and t.course_id = p_course and t.status <> 'draft'
     group by s.id
  ),
  -- 시험: 같은 종류가 여러 개면 만점 합 대비 획득 합으로 본다.
  exm as (
    select s.id as student_id,
           sum(case when e.kind = 'midterm' then e.max_points else 0 end) as mid_possible,
           sum(case when e.kind = 'midterm' then coalesce(sc.score, 0) else 0 end) as mid_earned,
           sum(case when e.kind = 'final'   then e.max_points else 0 end) as fin_possible,
           sum(case when e.kind = 'final'   then coalesce(sc.score, 0) else 0 end) as fin_earned
      from students s
      cross join exams e
      left join exam_scores sc on sc.exam_id = e.id and sc.student_id = s.id
     where s.course_id = p_course and s.active
       and e.course_id = p_course and e.kind in ('midterm', 'final')
     group by s.id
  ),
  -- 상호평가: 확정(approved)된 활동 결과만 쓴다. 0~100 스케일의 평균.
  peer as (
    select s.id as student_id,
           avg(r.final_score) as pct
      from students s
      left join results r on r.student_id = s.id and r.status = 'approved'
      left join activities a on a.id = r.activity_id and a.course_id = p_course
     where s.course_id = p_course and s.active
     group by s.id
  ),
  calc as (
    select
      s.id as student_id,
      n_sessions as sessions_total,
      att.credited as sessions_credited,
      case when n_sessions = 0 then 0 else att.absent_cnt::numeric / n_sessions end as absence_rate,
      case when n_sessions = 0 then pol.attendance_pct
           else round(pol.attendance_pct * least(att.credited / n_sessions, 1), 2) end as attendance_pts,
      case when coalesce(tsk.possible, 0) = 0 then pol.task_pct
           else round(pol.task_pct * least(tsk.earned / tsk.possible, 1), 2) end as task_pts,
      case when coalesce(exm.mid_possible, 0) = 0 then pol.midterm_pct
           else round(pol.midterm_pct * least(exm.mid_earned / exm.mid_possible, 1), 2) end as midterm_pts,
      case when coalesce(exm.fin_possible, 0) = 0 then pol.final_pct
           else round(pol.final_pct * least(exm.fin_earned / exm.fin_possible, 1), 2) end as final_pts,
      case when not peer_on then pol.peer_pct          -- 상호평가를 안 하는 과목은 만점 처리
           when peer.pct is null then pol.peer_pct     -- 아직 확정된 결과가 없으면 만점 처리
           else round(pol.peer_pct * least(peer.pct / 100, 1), 2) end as peer_pts
      from students s
      join att  on att.student_id = s.id
      left join tsk  on tsk.student_id  = s.id
      left join exm  on exm.student_id  = s.id
      left join peer on peer.student_id = s.id
     where s.course_id = p_course and s.active
  ),
  scored as (
    select c.*,
           round(c.attendance_pts + c.task_pts + c.midterm_pts + c.final_pts + c.peer_pts, 2) as total,
           (c.absence_rate > pol.absence_limit) as over_absence
      from calc c
  ),
  upserted as (
    insert into final_grades (
      course_id, student_id, attendance_pts, task_pts, midterm_pts, final_pts, peer_pts,
      total, letter, sessions_total, sessions_credited, absence_rate, over_absence, computed_at
    )
    select
      p_course, sc.student_id, sc.attendance_pts, sc.task_pts, sc.midterm_pts, sc.final_pts, sc.peer_pts,
      sc.total,
      case when sc.over_absence then 'F'
           when sc.total >= 95 then 'A+'
           when sc.total >= 90 then 'A0'
           when sc.total >= 85 then 'B+'
           when sc.total >= 80 then 'B0'
           when sc.total >= 75 then 'C+'
           when sc.total >= 70 then 'C0'
           when sc.total >= 65 then 'D+'
           when sc.total >= 60 then 'D0'
           else 'F' end,
      sc.sessions_total, sc.sessions_credited, round(sc.absence_rate, 4), sc.over_absence, now()
      from scored sc
    on conflict (course_id, student_id) do update set
      attendance_pts    = excluded.attendance_pts,
      task_pts          = excluded.task_pts,
      midterm_pts       = excluded.midterm_pts,
      final_pts         = excluded.final_pts,
      peer_pts          = excluded.peer_pts,
      total             = excluded.total,
      letter            = excluded.letter,
      sessions_total    = excluded.sessions_total,
      sessions_credited = excluded.sessions_credited,
      absence_rate      = excluded.absence_rate,
      over_absence      = excluded.over_absence,
      computed_at       = now()
    -- 교수가 확정(approved)한 줄은 다시 계산하지 않는다.
    where final_grades.status = 'draft'
    returning 1
  )
  select count(*) into affected from upserted;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'compute_final_grades', p_course,
          jsonb_build_object('rows', affected, 'sessions', n_sessions));

  return affected;
end $$;

revoke all on function compute_final_grades(uuid) from public, anon;
grant execute on function compute_final_grades(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ▼▼▼ 0007_deductions_heyyoung.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  감점 요소 · 기타 성적 · 헤이영 연동 보강
--
--  2026-08-10 에 헤이영(campus.heyoung.co.kr) 세 화면을 로그인 상태에서
--  직접 확인하고 맞춘 스키마다. 추측이 아니다.
--
--   · 강좌별 출석관리   /admin/screen/HCO0301M01
--       학생 한 명이 한 행, 주차마다 교시 열이 붙는 **가로형 행렬**이다.
--       범례: - 미정 / O 출석 / ◎ 유고결석 / △ 지각 / X 결석 / □ 조퇴
--       ※ ◎ 는 출석이 아니라 유고결석이다. 헷갈리면 유고결석이 출석이 된다.
--   · 출결이의신청 관리 /screen/HAP0602M01
--   · 유고결석 신청 관리 /screen/HAP0604M01
--
--  헤이영의 "N주차 M번째" 는 이쪽의 course_weeks.week_no + course_sessions.session_no
--  와 그대로 대응한다.
-- ════════════════════════════════════════════════════════════════

-- ── 조퇴 추가 ────────────────────────────────────────────────
-- 헤이영에 조퇴(□)가 있는데 기존 enum 에 없었다.
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('present', 'late', 'absent', 'excused', 'early_leave'));

-- ── 헤이영 식별자 ────────────────────────────────────────────
-- 헤이영 교과목번호는 '50035-Y1' 꼴. 학교 LMS 의 ext_course_id 안에도 들어 있지만
-- (202610UN00·50035·67672·Y1) 파일을 과목에 붙일 때 바로 쓰려고 따로 둔다.
alter table courses
  add column if not exists heyyoung_code text;

comment on column courses.heyyoung_code is
  '헤이영 교과목번호-분반 (예: 50035-Y1). 출석 파일을 과목에 붙일 때 쓴다.';

-- ── 출결 이의신청 / 유고결석 신청 ────────────────────────────
-- 헤이영 목록을 그대로 복제한다. 처리는 헤이영에서 하고 이쪽은 근거 보관용이다.
create table if not exists attendance_requests (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  -- 명단과 못 맞춘 경우를 위해 원본 이름을 남긴다.
  applicant    text,
  kind         text not null check (kind in ('appeal', 'excused')),
  week_no      int,
  session_no   int,
  -- 헤이영 '출석구분' (결석 · 지각 …)
  original     text,
  -- 유고결석의 '사유구분' (단순질병 · 수강정정 …). 이의신청에는 없다.
  reason       text,
  -- 헤이영 '처리여부' 원문. '답변완료( 출석 )' 처럼 결과가 괄호에 들어 있다.
  result_raw   text,
  -- 위에서 뽑아낸 결과. null 이면 아직 판정 못 함.
  result       text check (result in ('present', 'excused', 'absent', 'late', 'pending')),
  applied_at   timestamptz,
  imported_at  timestamptz not null default now(),
  unique (course_id, kind, applicant, week_no, session_no, applied_at)
);

create index if not exists att_req_course_idx on attendance_requests(course_id, kind);

-- ── 감점 요소 ────────────────────────────────────────────────
-- 지각 · 태도불량 · 과제미제출 · 과제 늦게제출 처럼 "한 번에 몇 점씩 깎는" 항목.
-- 과목마다 목록과 점수가 다르므로 과목별로 정의한다.
create table if not exists deduction_kinds (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  code       text not null,                 -- late · attitude · task_missing · task_late …
  label      text not null,                 -- 화면에 보이는 이름
  points     numeric not null default 1 check (points >= 0),  -- 1건당 깎는 점수
  -- 자동으로 세어 줄 수 있는 항목인지. 수동 입력만 받는 항목은 manual.
  source     text not null default 'manual'
             check (source in ('manual', 'attendance_late', 'attendance_early_leave',
                               'task_missing', 'task_late')),
  ord        int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, code)
);

comment on column deduction_kinds.source is
  'manual 이면 사람이 건수를 넣고, 나머지는 출결·과제에서 자동으로 센다.';

-- 사람이 직접 넣는 감점 기록 (태도불량 등)
create table if not exists deductions (
  id         uuid primary key default gen_random_uuid(),
  kind_id    uuid not null references deduction_kinds(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  count      numeric not null default 1 check (count >= 0),
  note       text,
  occurred_on date,
  created_at timestamptz not null default now()
);

create index if not exists deductions_student_idx on deductions(student_id);

-- ── 기타 성적(감점) 비율 ─────────────────────────────────────
-- 구성비 합 CHECK 를 다시 만든다. etc_pct 가 늘어났기 때문이다.
alter table grade_policies
  add column if not exists etc_pct numeric not null default 0 check (etc_pct >= 0),
  -- 기타 항목의 만점. 여기서 감점을 빼서 점수를 만든다.
  add column if not exists etc_base numeric not null default 100 check (etc_base > 0);

alter table grade_policies drop constraint if exists grade_pct_sum;
alter table grade_policies add constraint grade_pct_sum
  check (attendance_pct + task_pct + midterm_pct + final_pct + peer_pct + etc_pct = 100);

comment on column grade_policies.etc_base is
  '기타 성적의 만점. 감점 합계를 여기서 빼고 0 미만으로는 내려가지 않는다.';

-- final_grades 에 기타 항목을 붙인다.
alter table final_grades
  add column if not exists etc_pts numeric,
  add column if not exists deduction_total numeric;

-- ── RLS ──────────────────────────────────────────────────────
alter table attendance_requests enable row level security;
alter table deduction_kinds     enable row level security;
alter table deductions          enable row level security;

drop policy if exists att_req_owner_all on attendance_requests;
create policy att_req_owner_all on attendance_requests
  for all using (owns_course(course_id)) with check (owns_course(course_id));

drop policy if exists ded_kind_owner_all on deduction_kinds;
create policy ded_kind_owner_all on deduction_kinds
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- 감점 항목 이름은 학생도 봐야 왜 깎였는지 안다. 점수(points)까지 보인다.
drop policy if exists ded_kind_student_read on deduction_kinds;
create policy ded_kind_student_read on deduction_kinds
  for select using (in_course(course_id) and active);

-- 감점 기록은 **본인 것만** 보인다. 과제 점수·출결과 같은 수준으로 공개한다.
drop policy if exists ded_owner_all on deductions;
create policy ded_owner_all on deductions
  for all using (exists (
        select 1 from deduction_kinds k where k.id = kind_id and owns_course(k.course_id)))
  with check (exists (
        select 1 from deduction_kinds k where k.id = kind_id and owns_course(k.course_id)));

drop policy if exists ded_student_read on deductions;
create policy ded_student_read on deductions
  for select using (student_id = jwt_student_id());

-- ── 과목마다 기본 감점 항목을 깔아 주는 도우미 ───────────────
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
    (p_course, 'attitude',     '태도 불량',      2, 'manual',                 2),
    (p_course, 'task_missing', '과제 미제출',    5, 'task_missing',           3),
    (p_course, 'task_late',    '과제 지각 제출', 2, 'task_late',              4)
  on conflict (course_id, code) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function seed_deduction_kinds(uuid) from public, anon;
grant execute on function seed_deduction_kinds(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  학생별 감점 합계
--
--  자동 항목(지각·조퇴·과제미제출·과제지각)은 출결·과제에서 직접 세고,
--  manual 항목은 deductions 표를 더한다. 화면에서 계산하지 않는다.
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
  -- 출결에서 자동으로 세는 항목
  att as (
    select a.student_id, a.status, count(*)::numeric as cnt
      from attendance a
      join course_sessions cs on cs.id = a.session_id
      join course_weeks w on w.id = cs.week_id
     where w.course_id = p_course and a.status in ('late', 'early_leave')
     group by a.student_id, a.status
  ),
  -- 과제에서 자동으로 세는 항목
  tsk as (
    select s.id as student_id,
           count(*) filter (
             where sub.id is null or sub.submitted_at is null
           )::numeric as missing,
           count(*) filter (
             where sub.submitted_at is not null and t.due_at is not null
               and sub.submitted_at > t.due_at
           )::numeric as late_cnt
      from students s
      cross join tasks t
      left join task_submissions sub
             on sub.task_id = t.id
            and ((t.mode = 'individual' and sub.student_id = s.id)
              or (t.mode = 'team'       and sub.team_id    = s.team_id))
     where s.course_id = p_course and s.active
       and t.course_id = p_course and t.status <> 'draft'
     group by s.id
  ),
  -- 사람이 직접 넣은 기록
  man as (
    select d.kind_id, d.student_id, sum(d.count) as cnt
      from deductions d
      join kinds k on k.id = d.kind_id
     group by d.kind_id, d.student_id
  )
  select r.id, k.id, k.code, k.label,
         coalesce(
           case k.source
             when 'attendance_late'        then (select cnt from att where att.student_id = r.id and att.status = 'late')
             when 'attendance_early_leave' then (select cnt from att where att.student_id = r.id and att.status = 'early_leave')
             when 'task_missing'           then (select missing  from tsk where tsk.student_id = r.id)
             when 'task_late'              then (select late_cnt from tsk where tsk.student_id = r.id)
             else (select cnt from man where man.kind_id = k.id and man.student_id = r.id)
           end, 0) as cnt,
         k.points,
         coalesce(
           case k.source
             when 'attendance_late'        then (select cnt from att where att.student_id = r.id and att.status = 'late')
             when 'attendance_early_leave' then (select cnt from att where att.student_id = r.id and att.status = 'early_leave')
             when 'task_missing'           then (select missing  from tsk where tsk.student_id = r.id)
             when 'task_late'              then (select late_cnt from tsk where tsk.student_id = r.id)
             else (select cnt from man where man.kind_id = k.id and man.student_id = r.id)
           end, 0) * k.points as subtotal
    from roster r
    cross join kinds k
$$;

revoke all on function deduction_summary(uuid) from public, anon;
grant execute on function deduction_summary(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  최종 성적 재정의 — 기타(감점) 항목 추가
--
--  기타 = etc_pct × max(etc_base - 감점합, 0) / etc_base
--  감점은 0 아래로 내려가지 않는다. 마이너스 성적이 나오면 안 되기 때문이다.
-- ════════════════════════════════════════════════════════════
create or replace function compute_final_grades(p_course uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  pol        grade_policies%rowtype;
  peer_on    boolean;
  n_sessions int;
  affected   int;
begin
  if not owns_course(p_course) then
    raise exception '이 과목의 성적을 계산할 권한이 없습니다.';
  end if;

  select * into pol from grade_policies where course_id = p_course;
  if not found then
    insert into grade_policies(course_id) values (p_course) returning * into pol;
  end if;

  select peer_assessment into peer_on from courses where id = p_course;

  select count(*) into n_sessions
    from course_sessions cs join course_weeks w on w.id = cs.week_id
   where w.course_id = p_course;

  with
  att as (
    select s.id as student_id,
           coalesce(sum(case a.status
                          when 'present'     then 1
                          when 'late'        then pol.late_credit
                          when 'early_leave' then pol.late_credit
                          when 'excused'     then pol.excused_credit
                          else 0 end), 0) as credited,
           coalesce(sum(case when a.status = 'absent' then 1 else 0 end), 0) as absent_cnt
      from students s
      left join attendance a on a.student_id = s.id
      left join course_sessions cs on cs.id = a.session_id
      left join course_weeks w on w.id = cs.week_id and w.course_id = p_course
     where s.course_id = p_course and s.active
     group by s.id
  ),
  tsk as (
    select s.id as student_id,
           sum(t.max_points)           as possible,
           sum(coalesce(sub.score, 0)) as earned
      from students s
      cross join tasks t
      left join task_submissions sub
             on sub.task_id = t.id
            and ((t.mode = 'individual' and sub.student_id = s.id)
              or (t.mode = 'team'       and sub.team_id    = s.team_id))
     where s.course_id = p_course and s.active
       and t.course_id = p_course and t.status <> 'draft'
     group by s.id
  ),
  exm as (
    select s.id as student_id,
           sum(case when e.kind = 'midterm' then e.max_points else 0 end)          as mid_possible,
           sum(case when e.kind = 'midterm' then coalesce(sc.score, 0) else 0 end) as mid_earned,
           sum(case when e.kind = 'final'   then e.max_points else 0 end)          as fin_possible,
           sum(case when e.kind = 'final'   then coalesce(sc.score, 0) else 0 end) as fin_earned
      from students s
      cross join exams e
      left join exam_scores sc on sc.exam_id = e.id and sc.student_id = s.id
     where s.course_id = p_course and s.active
       and e.course_id = p_course and e.kind in ('midterm', 'final')
     group by s.id
  ),
  peer as (
    select s.id as student_id, avg(r.final_score) as pct
      from students s
      left join results r on r.student_id = s.id and r.status = 'approved'
      left join activities a on a.id = r.activity_id and a.course_id = p_course
     where s.course_id = p_course and s.active
     group by s.id
  ),
  ded as (
    select d.student_id, sum(d.subtotal) as total
      from deduction_summary(p_course) d
     group by d.student_id
  ),
  calc as (
    select
      s.id as student_id,
      n_sessions as sessions_total,
      att.credited as sessions_credited,
      case when n_sessions = 0 then 0 else att.absent_cnt::numeric / n_sessions end as absence_rate,
      coalesce(ded.total, 0) as deduction_total,
      case when n_sessions = 0 then pol.attendance_pct
           else round(pol.attendance_pct * least(att.credited / n_sessions, 1), 2) end as attendance_pts,
      case when coalesce(tsk.possible, 0) = 0 then pol.task_pct
           else round(pol.task_pct * least(tsk.earned / tsk.possible, 1), 2) end as task_pts,
      case when coalesce(exm.mid_possible, 0) = 0 then pol.midterm_pct
           else round(pol.midterm_pct * least(exm.mid_earned / exm.mid_possible, 1), 2) end as midterm_pts,
      case when coalesce(exm.fin_possible, 0) = 0 then pol.final_pct
           else round(pol.final_pct * least(exm.fin_earned / exm.fin_possible, 1), 2) end as final_pts,
      case when not peer_on then pol.peer_pct
           when peer.pct is null then pol.peer_pct
           else round(pol.peer_pct * least(peer.pct / 100, 1), 2) end as peer_pts,
      round(pol.etc_pct * greatest(pol.etc_base - coalesce(ded.total, 0), 0) / pol.etc_base, 2) as etc_pts
      from students s
      join att  on att.student_id = s.id
      left join tsk  on tsk.student_id  = s.id
      left join exm  on exm.student_id  = s.id
      left join peer on peer.student_id = s.id
      left join ded  on ded.student_id  = s.id
     where s.course_id = p_course and s.active
  ),
  scored as (
    select c.*,
           round(c.attendance_pts + c.task_pts + c.midterm_pts + c.final_pts + c.peer_pts + c.etc_pts, 2) as total,
           (c.absence_rate > pol.absence_limit) as over_absence
      from calc c
  ),
  upserted as (
    insert into final_grades (
      course_id, student_id, attendance_pts, task_pts, midterm_pts, final_pts, peer_pts,
      etc_pts, deduction_total, total, letter,
      sessions_total, sessions_credited, absence_rate, over_absence, computed_at
    )
    select
      p_course, sc.student_id, sc.attendance_pts, sc.task_pts, sc.midterm_pts, sc.final_pts, sc.peer_pts,
      sc.etc_pts, sc.deduction_total, sc.total,
      case when sc.over_absence then 'F'
           when sc.total >= 95 then 'A+'
           when sc.total >= 90 then 'A0'
           when sc.total >= 85 then 'B+'
           when sc.total >= 80 then 'B0'
           when sc.total >= 75 then 'C+'
           when sc.total >= 70 then 'C0'
           when sc.total >= 65 then 'D+'
           when sc.total >= 60 then 'D0'
           else 'F' end,
      sc.sessions_total, sc.sessions_credited, round(sc.absence_rate, 4), sc.over_absence, now()
      from scored sc
    on conflict (course_id, student_id) do update set
      attendance_pts    = excluded.attendance_pts,
      task_pts          = excluded.task_pts,
      midterm_pts       = excluded.midterm_pts,
      final_pts         = excluded.final_pts,
      peer_pts          = excluded.peer_pts,
      etc_pts           = excluded.etc_pts,
      deduction_total   = excluded.deduction_total,
      total             = excluded.total,
      letter            = excluded.letter,
      sessions_total    = excluded.sessions_total,
      sessions_credited = excluded.sessions_credited,
      absence_rate      = excluded.absence_rate,
      over_absence      = excluded.over_absence,
      computed_at       = now()
    where final_grades.status = 'draft'
    returning 1
  )
  select count(*) into affected from upserted;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'compute_final_grades', p_course,
          jsonb_build_object('rows', affected, 'sessions', n_sessions));

  return affected;
end $$;

revoke all on function compute_final_grades(uuid) from public, anon;
grant execute on function compute_final_grades(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ▼▼▼ 0008_fix_task_submission_insert.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  학생이 제출물을 만들면서 점수를 스스로 넣는 길을 막는다
--
--  0006 의 UPDATE 정책은 with check 로 score / feedback / graded_at 이
--  null 인지 확인하는데, **INSERT 정책에는 그 조건이 빠져 있었다.**
--  그래서 학생이 처음 제출할 때 score: 100 을 함께 보내면 그대로 저장됐다.
--  (한 번 저장되고 나면 UPDATE 로는 못 고치지만, 이미 늦다)
--
--  화면에서 그 칸을 안 보내는 것으로는 막은 게 아니다. anon key 와 자기
--  세션만 있으면 브라우저 콘솔에서 바로 넣을 수 있다. 정책에서 막아야 한다.
-- ════════════════════════════════════════════════════════════════

drop policy if exists task_sub_student_insert on task_submissions;

create policy task_sub_student_insert on task_submissions
  for insert with check (
    task_open(task_id)
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
    -- 채점 칸은 교수만 채운다. 학생이 보내면 정책에서 걸린다.
    and score is null
    and feedback is null
    and graded_at is null
  );

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ▼▼▼ 0009_admin_console.sql ▼▼▼

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

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ▼▼▼ 0010_student_access.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  학생 입장 방식 바꾸기 — 수업코드 → 이메일 + 학번 + 이름 + 교수 승인
--
--  왜 바꾸나
--    수업코드는 한 번 새어 나가면 막을 방법이 없다. 단톡방에 올라가면
--    수강생이 아닌 사람도 학번만 알면 들어온다.
--    새 방식은 **명단에 있는 사람**만, 그리고 **교수가 승인한 뒤에만** 들어온다.
--
--  어떻게 도나
--    ① 학생이 이메일 · 학번 · 이름을 넣는다 (수업코드 없음)
--    ② 학번 + 이름으로 명단을 대조한다. 못 맞추면 거기서 끝이다
--    ③ 맞으면 승인 대기 줄이 생긴다
--    ④ 교수가 '입장 승인' 화면에서 승인한다
--    ⑤ 그 뒤부터 같은 이메일 · 학번 · 이름으로 들어온다
--
--  이메일은 승인 뒤 **두 번째 열쇠**가 된다. 승인된 줄의 이메일과 다르면
--  들여보내지 않는다. 미리 승인해 둔 줄(이메일 없음)은 첫 로그인 때 묶인다.
--
--  판정은 전부 Edge Function(service_role) 이 한다. 학생 토큰으로는
--  이 표를 읽을 수 없다 — 남이 승인됐는지도 알 수 없어야 한다.
-- ════════════════════════════════════════════════════════════════

-- ── 과목마다 입장 방식을 고른다 ──────────────────────────────
-- 기본은 새 방식이다. 옛 방식으로 돌리고 싶은 과목만 'code' 로 바꾼다.
alter table courses
  add column if not exists entry_mode text not null default 'approval'
      check (entry_mode in ('code', 'approval'));

comment on column courses.entry_mode is
  'code = 수업코드 + 학번 (옛 방식) / approval = 이메일 + 학번 + 이름 + 교수 승인';

-- ── 입장 신청과 승인 ─────────────────────────────────────────
create table if not exists student_access (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,
  -- 학생이 낸 이메일. 미리 승인해 둔 줄은 비어 있고 첫 로그인 때 채워진다.
  email        text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz,
  decided_at   timestamptz,
  note         text,
  -- 마지막으로 들어온 시각. 교수가 "아직 한 번도 안 들어온 학생" 을 볼 수 있게.
  last_login_at timestamptz,
  unique (course_id, student_id)
);

create index if not exists student_access_course_idx on student_access(course_id, status);

comment on table student_access is
  '학생 입장 신청과 승인. 판정은 Edge Function 이 service_role 로 한다.';

alter table student_access enable row level security;

drop policy if exists sa_owner_all on student_access;
create policy sa_owner_all on student_access
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- 학생 정책은 만들지 않는다. 남이 승인됐는지 알 필요가 없고,
-- 자기 상태는 로그인 응답으로 받는다. 화면에서 가리는 방식이 아니다.

-- ── 명단에 없는 사람이 시도한 기록 ───────────────────────────
-- 표를 따로 만들지 않고 audit_log 에 남긴다. 교수가 "누가 못 들어왔나" 를
-- 확인할 수 있어야 하지만, 아무나 줄을 만들 수 있게 하면 스팸이 된다.
-- (Edge Function 이 넣는다. 이 마이그레이션은 자리만 확인한다.)

-- ════════════════════════════════════════════════════════════
--  교수용 — 일괄 승인
--
--  방식을 바꾸는 순간 전원이 대기 상태가 되면 수업이 멈춘다.
--  명단을 미리 통째로 승인해 두면 학생은 첫 로그인에 바로 들어온다.
--  그때 이메일이 묶인다.
-- ════════════════════════════════════════════════════════════
create or replace function approve_all_access(p_course uuid)
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

  insert into student_access (course_id, student_id, status, decided_at)
  select p_course, s.id, 'approved', now()
    from students s
   where s.course_id = p_course and s.active
  on conflict (course_id, student_id) do update
    set status = 'approved',
        decided_at = now()
    where student_access.status <> 'approved';

  get diagnostics n = row_count;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'approve_all_access', p_course,
          jsonb_build_object('rows', n));

  return n;
end $$;

revoke all on function approve_all_access(uuid) from public, anon;
grant execute on function approve_all_access(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 입장 현황 한 줄로 읽기
--
--  명단 전원이 나온다. 아직 신청하지 않은 학생도 'none' 으로 보여야
--  "누가 아직 안 들어왔는지" 를 알 수 있다.
-- ════════════════════════════════════════════════════════════
create or replace function access_list(p_course uuid)
returns table (
  student_id    uuid,
  student_no    text,
  name          text,
  team_name     text,
  email         text,
  status        text,
  requested_at  timestamptz,
  decided_at    timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.student_no, s.name, t.name,
         a.email,
         coalesce(a.status, 'none'),
         a.requested_at, a.decided_at, a.last_login_at
    from students s
    left join teams t on t.id = s.team_id
    left join student_access a on a.student_id = s.id and a.course_id = p_course
   where s.course_id = p_course
     and s.active
     and owns_course(p_course)
   order by
     -- 처리할 것이 위로 온다
     case coalesce(a.status, 'none')
       when 'pending' then 0 when 'none' then 1
       when 'rejected' then 2 else 3 end,
     s.student_no
$$;

revoke all on function access_list(uuid) from public, anon;
grant execute on function access_list(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 한 명 승인 / 거절 / 되돌리기
--
--  화면에서 student_access 를 직접 고칠 수도 있지만, 아직 줄이 없는
--  학생(미리 승인)까지 한 길로 처리하려고 함수로 둔다.
-- ════════════════════════════════════════════════════════════
create or replace function set_access_status(
  p_course uuid, p_student uuid, p_status text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception '알 수 없는 상태입니다: %', p_status;
  end if;
  if not exists (select 1 from students where id = p_student and course_id = p_course) then
    raise exception '이 과목의 학생이 아닙니다.';
  end if;

  insert into student_access (course_id, student_id, status, decided_at, note)
  values (p_course, p_student, p_status, now(), p_note)
  on conflict (course_id, student_id) do update
    set status = excluded.status,
        decided_at = now(),
        note = coalesce(excluded.note, student_access.note);

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'set_access_status', p_course,
          jsonb_build_object('student_id', p_student, 'status', p_status));
end $$;

revoke all on function set_access_status(uuid, uuid, text, text) from public, anon;
grant execute on function set_access_status(uuid, uuid, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 승인된 이메일 풀기
--
--  학생이 이메일을 잘못 넣고 승인받았거나 메일 주소가 바뀐 경우.
--  이메일만 비우면 다음 로그인 때 새 주소가 다시 묶인다.
-- ════════════════════════════════════════════════════════════
create or replace function clear_access_email(p_course uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  update student_access set email = null
   where course_id = p_course and student_id = p_student;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'clear_access_email', p_course,
          jsonb_build_object('student_id', p_student));
end $$;

revoke all on function clear_access_email(uuid, uuid) from public, anon;
grant execute on function clear_access_email(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ▼▼▼ 0011_student_grade_dept.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  명단에 학년 · 학과를 담는다
--
--  왜 필요한가
--    학교 LMS(lms.dima.ac.kr) 의 '성적산출/결과' 화면이 내주는 한 줄은
--      NO · 학과 · 학년 · 학번 · 이름 · …
--    이다. 지금까지는 학번과 이름만 받고 학과 · 학년을 버렸다.
--
--    그런데 이 두 값이 실제로 쓰인다.
--      · 팀 편성 — 6개 과목 모두 2학년과 3학년이 섞여 있고, 학과도 제각각이다.
--        같은 학과끼리 몰리지 않게 짜려면 표에 학과가 보여야 한다.
--      · 동명이인 — 한 과목 안에서도 이름이 겹친다(박소정 등). 학과가 있으면
--        교수가 표에서 바로 구분한다.
--
--  왜 nullable 인가
--    엑셀에서 학번 · 이름만 긁어 붙이는 경로를 계속 살려 둔다.
--    그 경로로 들어온 학생은 두 칸이 비어 있을 뿐, 나머지는 똑같이 동작한다.
--
--  앱은 이 열이 없어도 돈다
--    RosterTab 의 명단 반영은 열이 없으면(PGRST204) 학번 · 이름만으로
--    한 번 더 시도한다. 이 마이그레이션을 아직 안 올린 상태에서도
--    명단을 넣을 수 있게 하려는 것이다.
-- ════════════════════════════════════════════════════════════════

alter table students
  add column if not exists grade smallint,
  add column if not exists dept  text;

comment on column students.grade is '학년 (학교 LMS 기준). 엑셀로 넣은 학생은 비어 있을 수 있다.';
comment on column students.dept  is '학과 / 계열. 팀 편성 때 같은 학과가 몰리지 않게 보려고 둔다.';

-- 명단 화면은 학년 → 학번 순으로 자주 훑는다.
create index if not exists students_course_grade_idx
  on students (course_id, grade);

notify pgrst, 'reload schema';

-- ▼▼▼ 0012_contacts_session_marks.sql ▼▼▼

-- ════════════════════════════════════════════════════════════════
--  연락처(교수 전용) · 일자별 기록(출결 · 수업태도 · 과제)
--
--  두 가지를 넣는다.
--
--  ① student_contacts — 학생 연락처
--  ② session_marks    — 회차(일자)마다의 수업태도 · 과제 점수
--
--
--  ── 왜 전화번호를 students 에 넣지 않는가 ──────────────────────
--
--  0002_rls.sql 의 정책이 이렇게 되어 있다.
--
--      create policy student_peer_read on students
--        for select using (in_course(course_id));
--
--  같은 과목 학생이면 **명단의 모든 줄을 통째로 읽는다.** 상호평가 화면이
--  누구를 평가하는지 이름을 보여 줘야 해서 일부러 열어 둔 것이다.
--
--  RLS 는 행 단위라 칸 하나만 가릴 수 없다. students 에 phone 을 더하면
--  anon key 와 자기 세션만 있는 학생이 브라우저 콘솔에서
--
--      supabase.from('students').select('name, phone')
--
--  로 **같은 반 전원의 전화번호를 받아 간다.** 화면에서 안 보여 주는 것은
--  막은 게 아니다. 그래서 연락처는 별도 표로 떼고, 학생용 정책을 아예
--  만들지 않는다 — CLAUDE.md 2번(권한은 RLS 에서)과 같은 방식이다.
--
--
--  ── 왜 마스킹된 번호를 저장하지 않는가 ────────────────────────
--
--  헤이영은 목록에서 번호를 010-****-5678 로 가린다. 이름을 눌러 마스킹을
--  풀어야 실제 번호가 나온다. 가린 채로 내려받은 파일을 그대로 넣으면
--  "번호가 있다" 고 표시되면서 실제로는 걸 수 없는 값이 쌓인다.
--
--  화면에서도 거르지만 DB 에서도 막는다 — CHECK 가 숫자와 붙임표만 받는다.
--  별표가 하나라도 있으면 저장 자체가 실패한다.
--
--
--  ── 일자별 기록 (session_marks) ──────────────────────────────
--
--  출결은 이미 attendance 에 있다(학생이 본인 것만 본다 — 확정된 정책).
--  여기에 더해 회차마다 수업태도 · 과제 점수를 남긴다.
--
--  이 표에는 **학생용 정책을 만들지 않는다.** 교수만 읽고 쓴다.
--  CLAUDE.md 1번(점수를 학생에게 노출하지 않는다)을 데이터 계층에서 지킨다.
--
--  왜 attendance 에 칸을 더하지 않았나 — attendance 에는
--  attendance_student_read(본인 것 읽기) 정책이 있다. 거기에 점수 칸을
--  더하면 학생이 자기 태도 점수를 그대로 읽어 간다. 표를 나눠야 막힌다.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
--  ① 연락처
-- ════════════════════════════════════════════════════════════

create table if not exists student_contacts (
  student_id uuid primary key references students(id) on delete cascade,
  -- 010-1234-5678 로 정규화해서 넣는다. 마스킹(*)은 CHECK 가 막는다.
  phone      text,
  -- heyyoung = 헤이영 명단에서 가져옴 / manual = 교수가 직접 고침
  source     text not null default 'manual' check (source in ('heyyoung', 'manual')),
  note       text,
  updated_at timestamptz not null default now(),
  constraint student_contacts_phone_shape
    check (phone is null or phone ~ '^[0-9]{2,4}-[0-9]{3,4}-[0-9]{4}$')
);

comment on table  student_contacts is
  '학생 연락처. students 에 두면 student_peer_read 때문에 같은 반 전원이 읽는다. 그래서 뗐다.';
comment on column student_contacts.phone is
  '010-1234-5678 형태. 마스킹된 값(010-****-5678)은 CHECK 가 거부한다.';

-- ════════════════════════════════════════════════════════════
--  ② 일자별 기록
-- ════════════════════════════════════════════════════════════

-- 만점은 과목마다 다르다. 10 이하로 두면 화면이 숫자 입력이 아니라
-- 버튼으로 그린다 (CLAUDE.md 화면 작업 규칙).
alter table courses
  add column if not exists mark_attitude_max smallint not null default 10,
  add column if not exists mark_task_max     smallint not null default 10;

do $$ begin
  alter table courses add constraint courses_mark_attitude_max_check
    check (mark_attitude_max between 1 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table courses add constraint courses_mark_task_max_check
    check (mark_task_max between 1 and 100);
exception when duplicate_object then null; end $$;

comment on column courses.mark_attitude_max is '일자별 수업태도 점수의 만점.';
comment on column courses.mark_task_max     is '일자별 과제 점수의 만점. tasks.max_score(과제별 만점)와 다른 값이다.';

create table if not exists session_marks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references course_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  -- 둘 다 null 을 허용한다. "아직 안 매김" 과 "0점" 은 다른 뜻이다.
  attitude   numeric(5,2),
  task       numeric(5,2),
  note       text,
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

comment on table session_marks is
  '회차(일자)별 수업태도 · 과제 점수. 학생용 RLS 정책이 없다 = 학생은 못 읽는다.';

create index if not exists session_marks_session_idx on session_marks(session_id);
create index if not exists session_marks_student_idx on session_marks(student_id);

-- ── 값 검사 ──────────────────────────────────────────────────
--
-- 두 가지를 본다.
--   1. 회차와 학생이 **같은 과목**인가 — 다른 과목 학생을 붙이면 집계가 샌다
--   2. 점수가 0 ~ 만점 안인가
--
-- 클라이언트가 보낸 값을 그대로 믿지 않는다 (CLAUDE.md 3번).
create or replace function check_session_mark() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s_course uuid;
  m_course uuid;
  a_max    smallint;
  t_max    smallint;
begin
  select w.course_id into s_course
    from course_sessions cs join course_weeks w on w.id = cs.week_id
   where cs.id = new.session_id;

  select st.course_id into m_course from students st where st.id = new.student_id;

  if s_course is null or m_course is null or s_course <> m_course then
    raise exception '회차와 학생의 과목이 다릅니다.';
  end if;

  select c.mark_attitude_max, c.mark_task_max into a_max, t_max
    from courses c where c.id = s_course;

  if new.attitude is not null and (new.attitude < 0 or new.attitude > a_max) then
    raise exception '수업태도 점수는 0 ~ % 사이여야 합니다.', a_max;
  end if;
  if new.task is not null and (new.task < 0 or new.task > t_max) then
    raise exception '과제 점수는 0 ~ % 사이여야 합니다.', t_max;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_check_session_mark on session_marks;
create trigger trg_check_session_mark
before insert or update on session_marks
for each row execute function check_session_mark();

-- ════════════════════════════════════════════════════════════
--  RLS — 둘 다 교수 전용
-- ════════════════════════════════════════════════════════════

alter table student_contacts enable row level security;
alter table session_marks    enable row level security;

-- 연락처: 그 학생이 속한 과목의 주인만.
drop policy if exists contact_owner_all on student_contacts;
create policy contact_owner_all on student_contacts
  for all using (exists (
        select 1 from students st where st.id = student_id and owns_course(st.course_id)))
  with check (exists (
        select 1 from students st where st.id = student_id and owns_course(st.course_id)));

-- 일자별 기록: 그 회차가 속한 과목의 주인만.
drop policy if exists session_mark_owner_all on session_marks;
create policy session_mark_owner_all on session_marks
  for all using (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)))
  with check (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)));

-- 학생용 정책은 **일부러 없다.** 여기에 정책을 더하지 말 것.
-- 화면에서 감추는 방식으로 바꾸지 말 것.

-- ════════════════════════════════════════════════════════════
--  집계 — 학생별 합계 · 평균
--
--  성적 산출(compute_final_grades)에는 아직 넣지 않는다. 구성비 합이
--  100 으로 CHECK 되어 있어 항목을 늘리면 기존 과목의 구성비가 전부
--  깨진다. 이 함수는 화면에서 "누가 얼마나 쌓였나" 를 보는 용도다.
-- ════════════════════════════════════════════════════════════

create or replace function session_mark_summary(p_course uuid)
returns table (
  student_id   uuid,
  marked       int,      -- 점수가 하나라도 매겨진 회차 수
  attitude_sum numeric,
  attitude_avg numeric,
  task_sum     numeric,
  task_avg     numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not owns_course(p_course) then
    raise exception '권한이 없습니다.';
  end if;

  return query
  select st.id,
         count(m.id) filter (where m.attitude is not null or m.task is not null)::int,
         coalesce(sum(m.attitude), 0),
         round(avg(m.attitude), 2),
         coalesce(sum(m.task), 0),
         round(avg(m.task), 2)
    from students st
    left join session_marks m on m.student_id = st.id
   where st.course_id = p_course
   group by st.id;
end $$;

revoke all on function session_mark_summary(uuid) from public;
grant execute on function session_mark_summary(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
--  확인 — 여섯 칸이 모두 이름을 보여 주면 성공이다
-- ════════════════════════════════════════════════════════════
select
  to_regclass('public.course_weeks')      as "0006_주차",
  to_regclass('public.deduction_kinds')   as "0007_감점",
  to_regclass('public.surveys')           as "0009_설문",
  to_regclass('public.student_access')    as "0010_입장",
  to_regclass('public.student_contacts')  as "0012_연락처",
  to_regclass('public.session_marks')     as "0012_일자별";
