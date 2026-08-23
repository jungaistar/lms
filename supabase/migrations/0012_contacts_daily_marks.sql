-- ════════════════════════════════════════════════════════════════
--  연락처(전화번호) · 일자별 수업 기록
--
--  두 가지를 넣는다.
--
--   ① student_contacts — 헤이영에서 받아 온 전화번호
--   ② session_marks    — 회차(=수업 날짜)마다 남기는 수업태도 · 과제 점수
--
--  ─────────────────────────────────────────────────────────────
--  왜 전화번호를 students 에 안 넣나
--
--    students 에는 student_peer_read 정책이 있다 (0002_rls.sql).
--    같은 과목 학생이면 명단 전체를 읽을 수 있다는 뜻이다 —
--    팀 기여도 배분과 발표 대상 표시에 이름·팀이 필요해서 그렇게 두었다.
--
--    거기에 phone 칸을 더하면 **학생 한 명이 로그인하는 순간 같은 반
--    30여 명의 전화번호를 통째로 읽어 간다.** 화면에서 감추는 것으로는
--    못 막는다 — PostgREST 에 직접 요청하면 그대로 나온다.
--
--    그래서 표를 쪼갠다. student_contacts 에는 **학생용 정책을 아예
--    만들지 않는다.** 정책이 없으면 RLS 가 켜진 표는 아무것도 안 내준다.
--    이것은 '점수를 학생에게 노출하지 않는다' 와 같은 방식의 방어다.
--
--  ─────────────────────────────────────────────────────────────
--  왜 수업태도 · 과제 점수를 attendance 에 안 넣나
--
--    attendance 에는 attendance_student_read 가 있다. 본인 출결은
--    본인이 본다. 거기에 점수 칸을 더하면 학생이 자기 태도 점수를 읽는다.
--    확정된 정책은 '점수 비공개' 다. 그래서 표를 따로 둔다 —
--    session_marks 에도 학생용 정책은 없다.
--
--    출결(attendance)과 점수(session_marks)는 같은 (session_id, student_id)
--    를 열쇠로 쓰므로 화면에서는 한 줄로 붙여 보여 주면 된다.
--
--  ─────────────────────────────────────────────────────────────
--  '각 일자' 는 course_sessions 다
--
--    회차 한 줄에 meets_on(수업 날짜)이 붙어 있다. 날짜를 새로 만들지 않고
--    이미 있는 회차에 매단다. 그래야 출결·성적 산출이 한 축을 같이 본다.
-- ════════════════════════════════════════════════════════════════

-- ── ① 연락처 ─────────────────────────────────────────────────
create table if not exists student_contacts (
  student_id     uuid primary key references students(id) on delete cascade,
  -- 정책에서 과목을 다시 조회하지 않으려고 들고 있는다.
  course_id      uuid not null references courses(id) on delete cascade,

  -- 정규화한 번호 (숫자만 남기고 010-1234-5678 꼴로 다시 짠 것).
  -- 마스킹된 번호는 여기 넣지 않는다 — 걸 수 없는 번호이기 때문이다.
  phone          text,
  -- 헤이영 화면·파일에 있던 원문. 010-****-5678 처럼 마스킹된 것도 그대로 둔다.
  -- 사람이 나중에 "이 줄은 아직 마스킹 해제를 안 했구나" 를 알아보는 근거다.
  phone_raw      text,
  -- 원문이 마스킹되어 있었는가. true 면 phone 은 비어 있다.
  masked         boolean not null default false,

  -- 보호자 · 비상 연락처. 헤이영에 있으면 받아 두고 없으면 빈다.
  guardian_phone text,
  note           text,

  source         text not null default 'heyyoung'
                 check (source in ('heyyoung', 'manual')),
  updated_at     timestamptz not null default now()
);

comment on table student_contacts is
  '학생 전화번호. 교수만 읽는다 — 학생용 RLS 정책을 만들지 말 것. '
  'students 에 붙이면 student_peer_read 때문에 같은 반 전원에게 새어 나간다.';
comment on column student_contacts.masked is
  '헤이영에서 마스킹 해제를 안 한 채 받아 온 줄. 화면에서 따로 세어 보여 준다.';

create index if not exists student_contacts_course_idx on student_contacts(course_id);

-- ── ② 일자별 수업 기록 ───────────────────────────────────────
create table if not exists session_marks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references course_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,

  -- 수업태도 점수. 0 ~ mark_policies.attitude_max.
  -- null 은 '아직 안 매김' 이다. 0(최하점)과 다르다.
  attitude   numeric check (attitude >= 0),
  -- 그날 과제 점수. 0 ~ mark_policies.task_max.
  task       numeric check (task >= 0),
  note       text,

  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

comment on table session_marks is
  '회차(=수업 날짜)마다 남기는 수업태도 · 과제 점수. 교수만 읽고 쓴다 — '
  '학생용 RLS 정책을 만들지 말 것. 확정된 정책은 점수 비공개다.';

create index if not exists session_marks_session_idx on session_marks(session_id);
create index if not exists session_marks_student_idx on session_marks(student_id);

-- 고칠 때마다 updated_at 이 따라 오게 한다. 화면에서 "언제 고쳤나" 를 보여 준다.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists session_marks_touch on session_marks;
create trigger session_marks_touch before update on session_marks
  for each row execute function touch_updated_at();

drop trigger if exists student_contacts_touch on student_contacts;
create trigger student_contacts_touch before update on student_contacts
  for each row execute function touch_updated_at();

-- ── ③ 만점 · 기본값 ──────────────────────────────────────────
-- 수업태도와 과제 만점은 과목마다 다르다. 성적 구성비(grade_policies)와
-- 성격이 달라서 표를 따로 둔다 — 구성비는 합이 100 이어야 한다는
-- CHECK 가 걸려 있어 칸을 더하면 그 제약을 건드리게 된다.
create table if not exists mark_policies (
  course_id    uuid primary key references courses(id) on delete cascade,
  -- 만점이 10 이하면 화면이 숫자 입력 대신 버튼을 그린다.
  attitude_max numeric not null default 5 check (attitude_max > 0 and attitude_max <= 100),
  task_max     numeric not null default 5 check (task_max     > 0 and task_max     <= 100),
  -- 아무 표시도 없는 칸을 집계에서 어떻게 볼 것인가.
  --   skip  = 안 매긴 날은 평균에서 빼고 센다 (기본)
  --   zero  = 안 매긴 날은 0 점으로 본다
  unmarked     text not null default 'skip' check (unmarked in ('skip', 'zero')),
  updated_at   timestamptz not null default now()
);

comment on column mark_policies.unmarked is
  '안 매긴 칸의 뜻. skip 이면 평균에서 제외, zero 면 0점. 결석한 날을 0점으로 '
  '깎을지 말지가 과목마다 달라서 고르게 두었다.';

drop trigger if exists mark_policies_touch on mark_policies;
create trigger mark_policies_touch before update on mark_policies
  for each row execute function touch_updated_at();

-- ════════════════════════════════════════════════════════════
--  RLS — 교수만
--
--  세 표 모두 학생용 정책이 없다. 정책이 하나도 없는 표는 RLS 아래에서
--  아무 줄도 내주지 않는다. 학생 토큰으로 요청하면 빈 배열이 온다.
-- ════════════════════════════════════════════════════════════

alter table student_contacts enable row level security;
alter table session_marks    enable row level security;
alter table mark_policies    enable row level security;

drop policy if exists contact_owner_all on student_contacts;
create policy contact_owner_all on student_contacts
  for all using (owns_course(course_id)) with check (owns_course(course_id));

drop policy if exists mark_owner_all on session_marks;
create policy mark_owner_all on session_marks
  for all using (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)))
  with check (exists (
        select 1 from course_sessions cs join course_weeks w on w.id = cs.week_id
         where cs.id = session_id and owns_course(w.course_id)));

drop policy if exists markpol_owner_all on mark_policies;
create policy markpol_owner_all on mark_policies
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ════════════════════════════════════════════════════════════
--  집계 — 점수 계산은 DB 함수에서만 한다
--
--  화면이 칸을 세어 합계를 만들면, 화면을 고칠 때마다 셈이 달라진다.
--  성적으로 넘어가는 값은 여기 한 군데서만 만든다.
-- ════════════════════════════════════════════════════════════

-- ── 학생 한 명의 학기 누계 ───────────────────────────────────
create or replace function session_mark_summary(p_course uuid)
returns table (
  student_id     uuid,
  student_no     text,
  name           text,
  -- 회차 수
  sessions_total int,
  -- 태도
  attitude_marked int,
  attitude_sum   numeric,
  attitude_avg   numeric,
  attitude_pct   numeric,   -- 만점 대비 백분율 (0~100)
  -- 과제
  task_marked    int,
  task_sum       numeric,
  task_avg       numeric,
  task_pct       numeric,
  -- 출결 (같은 축이라 함께 센다)
  present_cnt    int,
  late_cnt       int,
  absent_cnt     int,
  excused_cnt    int,
  early_leave_cnt int
)
language sql
stable
security definer
set search_path = public
as $$
  with pol as (
    select
      coalesce((select attitude_max from mark_policies where course_id = p_course), 5) as attitude_max,
      coalesce((select task_max     from mark_policies where course_id = p_course), 5) as task_max,
      coalesce((select unmarked     from mark_policies where course_id = p_course), 'skip') as unmarked
  ),
  sess as (
    select cs.id
      from course_sessions cs
      join course_weeks w on w.id = cs.week_id
     where w.course_id = p_course
  ),
  roster as (
    -- security definer 라 RLS 를 건너뛴다. 그래서 여기서 직접 막는다 —
    -- 이 한 줄이 없으면 남의 과목 id 를 넣어 부르는 것으로 명단이 새어 나간다.
    select s.id, s.student_no, s.name
      from students s
     where s.course_id = p_course and s.active and owns_course(p_course)
  ),
  -- 로스터 × 회차를 모두 편 뒤 기록을 붙인다.
  -- unmarked='zero' 인 과목에서 "안 적은 날" 을 0 점으로 세려면
  -- 없는 줄까지 있어야 하기 때문이다.
  grid as (
    select r.id as sid, se.id as ses_id, m.attitude, m.task
      from roster r
      cross join sess se
      left join session_marks m on m.session_id = se.id and m.student_id = r.id
  ),
  scored as (
    select
      g.sid,
      count(g.attitude)::int as att_marked,
      count(g.task)::int as tsk_marked,
      sum(case when g.attitude is not null then g.attitude
               when pol.unmarked = 'zero'  then 0 end) as att_sum,
      sum(case when g.task     is not null then g.task
               when pol.unmarked = 'zero'  then 0 end) as tsk_sum,
      -- 평균의 분모. skip 이면 매긴 칸만, zero 면 전체 회차.
      case when pol.unmarked = 'zero' then count(*) else nullif(count(g.attitude), 0) end as att_n,
      case when pol.unmarked = 'zero' then count(*) else nullif(count(g.task),     0) end as tsk_n
      from grid g cross join pol
     group by g.sid, pol.unmarked
  ),
  att as (
    select a.student_id, a.status, count(*)::int as cnt
      from attendance a
     where a.session_id in (select id from sess)
     group by a.student_id, a.status
  )
  select
    r.id, r.student_no, r.name,
    (select count(*)::int from sess),
    coalesce(sc.att_marked, 0),
    round(coalesce(sc.att_sum, 0), 2),
    round(coalesce(sc.att_sum, 0) / nullif(sc.att_n, 0), 2),
    round(100 * coalesce(sc.att_sum, 0) / nullif(sc.att_n * pol.attitude_max, 0), 1),
    coalesce(sc.tsk_marked, 0),
    round(coalesce(sc.tsk_sum, 0), 2),
    round(coalesce(sc.tsk_sum, 0) / nullif(sc.tsk_n, 0), 2),
    round(100 * coalesce(sc.tsk_sum, 0) / nullif(sc.tsk_n * pol.task_max, 0), 1),
    coalesce((select cnt from att where att.student_id = r.id and att.status = 'present'),     0),
    coalesce((select cnt from att where att.student_id = r.id and att.status = 'late'),        0),
    coalesce((select cnt from att where att.student_id = r.id and att.status = 'absent'),      0),
    coalesce((select cnt from att where att.student_id = r.id and att.status = 'excused'),     0),
    coalesce((select cnt from att where att.student_id = r.id and att.status = 'early_leave'), 0)
  from roster r
  cross join pol
  left join scored sc on sc.sid = r.id
  order by r.student_no
$$;

comment on function session_mark_summary(uuid) is
  '일자별 기록의 학기 누계. 화면과 내보내기가 모두 이 함수만 본다.';

revoke all on function session_mark_summary(uuid) from public, anon;
grant execute on function session_mark_summary(uuid) to authenticated;

-- ── 한 회차를 한 번에 저장 ───────────────────────────────────
--  화면에서 버튼을 누를 때마다 한 줄씩 보내면 왕복이 너무 잦다.
--  '전원 출석' 같은 일괄 조작은 이 함수로 한 번에 보낸다.
--
--  p_rows 는 이런 모양이다:
--    [{"student_id":"…","attitude":4,"task":5,"note":null}, …]
--  칸이 없으면 그 값은 건드리지 않고, null 을 명시하면 지운다.
create or replace function save_session_marks(p_session uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cid      uuid;
  affected int := 0;
begin
  select w.course_id into cid
    from course_sessions cs join course_weeks w on w.id = cs.week_id
   where cs.id = p_session;

  if cid is null then
    raise exception '회차를 찾을 수 없습니다.';
  end if;
  if not owns_course(cid) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  -- 명단 밖 학생이 섞여 들어오면 통째로 거부한다. 조용히 버리면
  -- 교수는 저장됐다고 믿는데 몇 명이 빠져 있게 된다.
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
     where not exists (
       select 1 from students s
        where s.id = (e ->> 'student_id')::uuid and s.course_id = cid)
  ) then
    raise exception '이 과목 명단에 없는 학생이 들어 있습니다.';
  end if;

  insert into session_marks (session_id, student_id, attitude, task, note)
  select
    p_session,
    (e ->> 'student_id')::uuid,
    nullif(e ->> 'attitude', '')::numeric,
    nullif(e ->> 'task', '')::numeric,
    nullif(e ->> 'note', '')
  from jsonb_array_elements(p_rows) e
  on conflict (session_id, student_id) do update
    set attitude   = excluded.attitude,
        task       = excluded.task,
        note       = excluded.note,
        updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end $$;

comment on function save_session_marks(uuid, jsonb) is
  '한 회차의 수업태도 · 과제 점수를 한 번에 저장한다. 명단 밖 학생이 있으면 통째로 거부한다.';

revoke all on function save_session_marks(uuid, jsonb) from public, anon;
grant execute on function save_session_marks(uuid, jsonb) to authenticated;

-- ── 연락처 한꺼번에 넣기 ─────────────────────────────────────
--  p_rows: [{"student_id":"…","phone":"010-1234-5678","phone_raw":"…","masked":false}, …]
--
--  마스킹된 줄이 이미 있는 번호를 덮어쓰지 않게 한다. 헤이영 엑셀다운은
--  대개 마스킹된 채로 나오는데, 그걸 나중에 한 번 더 올리면 애써 풀어 둔
--  번호가 다시 ****로 덮인다. 실제로 밟기 쉬운 자리라 DB 에서 막는다.
create or replace function save_student_contacts(p_course uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int := 0;
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) e
     where not exists (
       select 1 from students s
        where s.id = (e ->> 'student_id')::uuid and s.course_id = p_course)
  ) then
    raise exception '이 과목 명단에 없는 학생이 들어 있습니다.';
  end if;

  insert into student_contacts (student_id, course_id, phone, phone_raw, masked, guardian_phone, note, source)
  select
    (e ->> 'student_id')::uuid,
    p_course,
    nullif(e ->> 'phone', ''),
    nullif(e ->> 'phone_raw', ''),
    coalesce((e ->> 'masked')::boolean, false),
    nullif(e ->> 'guardian_phone', ''),
    nullif(e ->> 'note', ''),
    coalesce(nullif(e ->> 'source', ''), 'heyyoung')
  from jsonb_array_elements(p_rows) e
  on conflict (student_id) do update
    set
      -- 새 값이 마스킹이면 이미 풀어 둔 번호를 지키고, 아니면 덮어쓴다.
      phone          = case when excluded.masked and student_contacts.phone is not null
                            then student_contacts.phone else excluded.phone end,
      phone_raw      = case when excluded.masked and student_contacts.phone is not null
                            then student_contacts.phone_raw else excluded.phone_raw end,
      masked         = case when excluded.masked and student_contacts.phone is not null
                            then false else excluded.masked end,
      guardian_phone = coalesce(excluded.guardian_phone, student_contacts.guardian_phone),
      note           = coalesce(excluded.note, student_contacts.note),
      source         = excluded.source,
      updated_at     = now();

  get diagnostics affected = row_count;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'save_contacts', p_course,
          jsonb_build_object('rows', affected));

  return affected;
end $$;

comment on function save_student_contacts(uuid, jsonb) is
  '연락처를 한꺼번에 넣는다. 마스킹된 값이 이미 풀어 둔 번호를 덮지 않는다.';

revoke all on function save_student_contacts(uuid, jsonb) from public, anon;
grant execute on function save_student_contacts(uuid, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
--  확인 — 세 칸이 모두 이름을 보여 주면 성공이다
-- ════════════════════════════════════════════════════════════
select
  to_regclass('public.student_contacts') as "0012_연락처",
  to_regclass('public.session_marks')    as "0012_일자별기록",
  to_regclass('public.mark_policies')    as "0012_만점";
