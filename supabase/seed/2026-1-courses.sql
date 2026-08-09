-- ════════════════════════════════════════════════════════════════
--  2026학년도 1학기 6과목 설정 — 한 번만 실행한다
--
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 실행한다.
--
--  ⚠ SQL Editor 는 postgres 역할로 도는지라 auth.uid() 가 NULL 이다.
--     그래서 owner_id 를 auth.uid() 로 넣으면 NOT NULL 위반으로 통째로 실패한다.
--     아래 teacher_id() 가 이메일로 교수 계정을 찾아 준다.
--     ▸ 교수 이메일이 다르면 TEACHER_EMAIL 한 줄만 고치면 된다.
--     ▸ 그 이메일로 먼저 회원가입해 두어야 한다 (auth.users 에 있어야 찾는다).
--
--  과목명·분반·ext_course_id 는 2026-08-10 에 학교 LMS(lms.dima.ac.kr) 강의 목록에서
--  직접 확인한 값이다. 추측이 아니다.
--
--  ⚠ 학기 표기: 학교 LMS 기준으로 이 여섯 과목은 **2026-1학기(202610)** 다.
--     2학기에 같은 과목을 다시 맡으면 term 과 ext_course_id 를 그때 값으로 바꾼다.
--
--  과목별로 다른 점
--   · 자원관리능력        — 상호평가 안 함 (peer_assessment=false, peer_pct=0)
--   · 문화예술콘텐츠창업  — Y5·Y6 두 분반, 둘 다 팀 프로젝트 (project_mode='team')
--   · 나머지 과목         — 상호평가 하고, 개인 프로젝트
--
--  프로젝트는 여섯 과목 모두 한다. 상호평가만 자원관리능력이 빠진다.
-- ════════════════════════════════════════════════════════════════

begin;

-- ── 교수 계정 찾기 ───────────────────────────────────────────
-- SQL Editor(postgres) 에서는 auth.uid() 가 NULL 이라 이메일로 찾는다.
-- 앱에서 로그인한 채로 돌리는 경우에는 auth.uid() 를 그대로 쓴다.
create or replace function teacher_id() returns uuid
language plpgsql stable
set search_path = public, auth
as $$
declare
  uid uuid;
  TEACHER_EMAIL constant text := 'radical8566@gmail.com';   -- ◀ 필요하면 이 줄만 고친다
begin
  uid := auth.uid();
  if uid is not null then return uid; end if;

  select id into uid from auth.users where lower(email) = lower(TEACHER_EMAIL) limit 1;
  if uid is null then
    raise exception '교수 계정(%)을 찾지 못했습니다. 먼저 그 이메일로 회원가입해 주세요.', TEACHER_EMAIL;
  end if;
  return uid;
end $$;

with course_seed(title, class_no, join_code, ext_course_id, peer_assessment, project_mode,
                 attendance_pct, task_pct, midterm_pct, final_pct, peer_pct) as (
  values
    -- 상호평가 없음 → 그 몫(10)을 과제로 돌린다. 프로젝트는 한다.
    ('자원관리능력',       'Y1', 'RES26Y1', '202610UN005003567672Y1', false, 'individual', 20, 40, 20, 20,  0),
    ('1인예술과창업실무',  'Y2', 'ART26Y2', '202610UN006071715152Y2', true,  'individual', 20, 30, 20, 20, 10),
    ('취업과경력개발',     'Y3', 'CAR26Y3', '202610UN006013515152Y3', true,  'individual', 20, 30, 20, 20, 10),
    ('창업과기업가정신',   'Y4', 'ENT26Y4', '202610UN003005015152Y4', true,  'individual', 20, 30, 20, 20, 10),
    -- 같은 과목의 두 분반. 둘 다 팀 프로젝트 + 상호평가(팀 기여도가 핵심).
    -- 분반마다 수업코드가 달라야 학생이 자기 반으로 들어온다.
    ('문화예술콘텐츠창업', 'Y5', 'CUL26Y5', '202610UN006071667672Y5', true,  'team',       20, 30, 20, 20, 10),
    ('문화예술콘텐츠창업', 'Y6', 'CUL26Y6', '202610UN006071667672Y6', true,  'team',       20, 30, 20, 20, 10)
),
ins_course as (
  insert into courses (owner_id, term, title, class_no, join_code,
                       ext_course_id, ext_class_no, peer_assessment, project_mode)
  select teacher_id(), '202610', s.title, s.class_no, s.join_code,
         s.ext_course_id, s.class_no, s.peer_assessment, s.project_mode
    from course_seed s
  on conflict (join_code) do update
     set title           = excluded.title,
         class_no        = excluded.class_no,
         ext_course_id   = excluded.ext_course_id,
         ext_class_no    = excluded.ext_class_no,
         peer_assessment = excluded.peer_assessment,
         project_mode    = excluded.project_mode
  returning id, join_code
)
insert into grade_policies (course_id, attendance_pct, task_pct, midterm_pct, final_pct, peer_pct)
select c.id, s.attendance_pct, s.task_pct, s.midterm_pct, s.final_pct, s.peer_pct
  from ins_course c
  join course_seed s on s.join_code = c.join_code
on conflict (course_id) do update
   set attendance_pct = excluded.attendance_pct,
       task_pct       = excluded.task_pct,
       midterm_pct    = excluded.midterm_pct,
       final_pct      = excluded.final_pct,
       peer_pct       = excluded.peer_pct,
       updated_at     = now();

-- ── 15주 × 1회차 뼈대 ────────────────────────────────────────
-- 주차를 미리 깔아 두면 공지·자료·과제를 바로 주차에 붙일 수 있다.
-- 회차가 주 2회인 과목은 나중에 course_sessions 에 2번을 더 넣는다.
with my_courses as (
  select id from courses where owner_id = teacher_id() and term = '202610'
),
ins_week as (
  insert into course_weeks (course_id, week_no, title)
  select c.id, w.n, w.n || '주차'
    from my_courses c cross join generate_series(1, 15) as w(n)
  on conflict (course_id, week_no) do nothing
  returning id
)
insert into course_sessions (week_id, session_no)
select id, 1 from ins_week
on conflict (week_id, session_no) do nothing;

-- ── 시험: 모든 과목이 8주차 중간, 15주차 기말 ────────────────
-- 주차 제목에도 표시해 두면 주차 화면에서 바로 보인다.
update course_weeks w
   set title = w.week_no || '주차 — 중간고사'
  from courses c
 where c.id = w.course_id and c.owner_id = teacher_id() and c.term = '202610'
   and w.week_no = 8 and w.title = '8주차';

update course_weeks w
   set title = w.week_no || '주차 — 기말고사'
  from courses c
 where c.id = w.course_id and c.owner_id = teacher_id() and c.term = '202610'
   and w.week_no = 15 and w.title = '15주차';

insert into exams (course_id, kind, title, max_points, ord)
select c.id, e.kind, e.title, 100, e.ord
  from courses c
  cross join (values ('midterm', '중간고사 (8주차)', 0),
                     ('final',   '기말고사 (15주차)', 1)) as e(kind, title, ord)
 where c.owner_id = teacher_id() and c.term = '202610'
   and not exists (select 1 from exams x where x.course_id = c.id and x.kind = e.kind);

-- ── 감점 항목 기본값 ─────────────────────────────────────────
-- 지각 · 조퇴 · 태도불량 · 과제미제출 · 과제 지각제출.
-- 점수는 과목의 '감점' 화면에서 바꿀 수 있다.
--
-- seed_deduction_kinds() 를 부르지 않고 직접 넣는다. 그 함수는 owns_course()
-- 로 소유자를 확인하는데 SQL Editor 에서는 auth.uid() 가 NULL 이라 걸린다.
insert into deduction_kinds (course_id, code, label, points, source, ord)
select c.id, k.code, k.label, k.points, k.source, k.ord
  from courses c
  cross join (values
    ('late',         '지각',           1, 'attendance_late',        0),
    ('early_leave',  '조퇴',           1, 'attendance_early_leave', 1),
    ('attitude',     '태도 불량',      2, 'manual',                 2),
    ('task_missing', '과제 미제출',    5, 'task_missing',           3),
    ('task_late',    '과제 지각 제출', 2, 'task_late',              4)
  ) as k(code, label, points, source, ord)
 where c.owner_id = teacher_id() and c.term = '202610'
on conflict (course_id, code) do nothing;

-- ── 헤이영 교과목번호 ────────────────────────────────────────
-- ext_course_id 안에 이미 들어 있지만(202610UN00·50035·67672·Y1)
-- 출석 파일을 과목에 붙일 때 바로 쓰려고 꺼내 둔다.
update courses set heyyoung_code = v.code
  from (values ('RES26Y1', '50035-Y1'),
               ('ART26Y2', '60717-Y2'),
               ('CAR26Y3', '60135-Y3'),
               ('ENT26Y4', '30050-Y4'),
               ('CUL26Y5', '60716-Y5'),
               ('CUL26Y6', '60716-Y6')) as v(join_code, code)
 where courses.join_code = v.join_code and courses.owner_id = teacher_id();

commit;

-- 확인
select c.title, c.class_no, c.join_code, c.peer_assessment, c.project_mode,
       p.attendance_pct, p.task_pct, p.midterm_pct, p.final_pct, p.peer_pct,
       (select count(*) from course_weeks w where w.course_id = c.id) as weeks
  from courses c
  left join grade_policies p on p.course_id = c.id
 where c.owner_id = teacher_id() and c.term = '202610'
 order by c.title, c.class_no nulls first;

-- 임시 도우미는 지운다. 앱 권한 판단과는 무관하지만 남겨 둘 이유가 없다.
drop function if exists teacher_id();
