-- ════════════════════════════════════════════════════════════════
--  2026학년도 2학기 과목 설정 — 채워 넣고 한 번만 실행한다
--
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 실행한다.
--  교수 계정으로 로그인한 상태여야 owner_id 가 제대로 들어간다.
--
--  ⚠ TODO: 아래 course_seed 의 title 4줄이 비어 있다. 실제 과목명으로 바꾼 뒤 실행할 것.
--     자원관리개발 · 문화콘텐츠창업 두 과목만 확정 상태다.
--
--  과목별로 다른 점
--   · 자원관리개발  — 상호평가 안 함 (peer_assessment=false, peer_pct=0)
--   · 문화콘텐츠창업 — 팀 프로젝트 (project_mode='team')
--   · 나머지 네 과목 — 상호평가 하고, 개인 프로젝트
-- ════════════════════════════════════════════════════════════════

begin;

with course_seed(title, join_code, peer_assessment, project_mode,
                 attendance_pct, task_pct, midterm_pct, final_pct, peer_pct) as (
  values
    -- 상호평가 없음 → 그 몫(10)을 과제로 돌린다
    ('자원관리개발',        'RES2602',  false, 'individual', 20, 40, 20, 20,  0),
    -- 팀 프로젝트 + 상호평가(팀 기여도가 핵심)
    ('문화콘텐츠창업',      'CUL2602',  true,  'team',       20, 30, 20, 20, 10),
    -- ↓ TODO: 나머지 네 과목명으로 바꿀 것. 수업코드도 겹치지 않게 정한다.
    ('TODO-과목3',          'SUB2603',  true,  'individual', 20, 30, 20, 20, 10),
    ('TODO-과목4',          'SUB2604',  true,  'individual', 20, 30, 20, 20, 10),
    ('TODO-과목5',          'SUB2605',  true,  'individual', 20, 30, 20, 20, 10),
    ('TODO-과목6',          'SUB2606',  true,  'individual', 20, 30, 20, 20, 10)
),
ins_course as (
  insert into courses (owner_id, term, title, join_code, peer_assessment, project_mode)
  select auth.uid(), '202620', s.title, s.join_code, s.peer_assessment, s.project_mode
    from course_seed s
  on conflict (join_code) do update
     set title           = excluded.title,
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
  select id from courses where owner_id = auth.uid() and term = '202620'
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

commit;

-- 확인
select c.title, c.join_code, c.peer_assessment, c.project_mode,
       p.attendance_pct, p.task_pct, p.midterm_pct, p.final_pct, p.peer_pct,
       (select count(*) from course_weeks w where w.course_id = c.id) as weeks
  from courses c
  left join grade_policies p on p.course_id = c.id
 where c.owner_id = auth.uid() and c.term = '202620'
 order by c.title;
