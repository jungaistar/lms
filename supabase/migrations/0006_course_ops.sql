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
create policy week_owner_all on course_weeks
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy week_student_read on course_weeks
  for select using (in_course(course_id) and published);

create policy session_owner_all on course_sessions
  for all using (exists (select 1 from course_weeks w where w.id = week_id and owns_course(w.course_id)))
  with check (exists (select 1 from course_weeks w where w.id = week_id and owns_course(w.course_id)));
create policy session_student_read on course_sessions
  for select using (week_visible(week_id));

-- ── 공지 · 자료 ──────────────────────────────────────────────
create policy notice_owner_all on notices
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy notice_student_read on notices
  for select using (in_course(course_id) and published_at is not null and published_at <= now());

create policy material_owner_all on materials
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy material_student_read on materials
  for select using (in_course(course_id) and published);

-- ── 과제 ─────────────────────────────────────────────────────
create policy task_owner_all on tasks
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy task_student_read on tasks
  for select using (in_course(course_id) and status <> 'draft');

-- 학생은 **본인(또는 자기 팀) 제출물만** 읽고 쓴다.
-- score / feedback 도 여기서 함께 보인다 — 과제 점수는 본인 공개가 확정 정책이다.
create policy task_sub_owner_all on task_submissions
  for all using (exists (select 1 from tasks t where t.id = task_id and owns_course(t.course_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and owns_course(t.course_id)));

create policy task_sub_student_read on task_submissions
  for select using (
    task_visible(task_id)
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  );

create policy task_sub_student_insert on task_submissions
  for insert with check (
    task_open(task_id)
    and (student_id = jwt_student_id() or (team_id is not null and team_id = jwt_team_id()))
  );

-- 채점 뒤에는 학생이 못 고친다. 점수·피드백 칸을 학생이 건드리는 것도 막는다.
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
create policy attendance_owner_all on attendance
  for all using (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)))
  with check (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)));

-- 본인 출결만 읽는다. 남의 출결은 못 본다.
create policy attendance_student_read on attendance
  for select using (student_id = jwt_student_id());

create policy attimport_owner_all on attendance_imports
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ── 시험 ─────────────────────────────────────────────────────
-- 시험 일정은 학생도 본다. 점수(exam_scores)는 학생 정책이 없다 = 비공개.
create policy exam_owner_all on exams
  for all using (owns_course(course_id)) with check (owns_course(course_id));
create policy exam_student_read on exams
  for select using (in_course(course_id));

create policy exam_score_owner_all on exam_scores
  for all using (exists (select 1 from exams e where e.id = exam_id and owns_course(e.course_id)))
  with check (exists (select 1 from exams e where e.id = exam_id and owns_course(e.course_id)));

-- ── 성적 ─────────────────────────────────────────────────────
-- grade_policies / final_grades 는 학생 정책이 없다 = 한 줄도 못 읽는다.
create policy grade_policy_owner_all on grade_policies
  for all using (owns_course(course_id)) with check (owns_course(course_id));

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
