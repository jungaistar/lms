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

create policy att_req_owner_all on attendance_requests
  for all using (owns_course(course_id)) with check (owns_course(course_id));

create policy ded_kind_owner_all on deduction_kinds
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- 감점 항목 이름은 학생도 봐야 왜 깎였는지 안다. 점수(points)까지 보인다.
create policy ded_kind_student_read on deduction_kinds
  for select using (in_course(course_id) and active);

-- 감점 기록은 **본인 것만** 보인다. 과제 점수·출결과 같은 수준으로 공개한다.
create policy ded_owner_all on deductions
  for all using (exists (
        select 1 from deduction_kinds k where k.id = kind_id and owns_course(k.course_id)))
  with check (exists (
        select 1 from deduction_kinds k where k.id = kind_id and owns_course(k.course_id)));

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
