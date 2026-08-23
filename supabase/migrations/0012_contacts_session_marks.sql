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
