-- ────────────────────────────────────────────────────────────
--  0011 만 따로 실행하고, 됐는지 같은 화면에서 바로 확인한다.
--  Supabase SQL Editor 에 이 파일 전체를 붙여넣고 RUN.
--
--  프로젝트가 맞는지 먼저 보라 — 주소창이
--    supabase.com/dashboard/project/aujvpcpjpgxghxmsheur
--  여야 한다. 다른 프로젝트에서 돌리면 아무 일도 일어나지 않는다.
-- ────────────────────────────────────────────────────────────

alter table students
  add column if not exists grade smallint,
  add column if not exists dept  text;

comment on column students.grade is '학년 (학교 LMS 기준).';
comment on column students.dept  is '학과 / 계열. 팀 편성 때 쓴다.';

create index if not exists students_course_grade_idx
  on students (course_id, grade);

notify pgrst, 'reload schema';

-- ── 확인 ─────────────────────────────────────────────────────
-- 아래가 두 줄(grade · dept)을 내놓아야 성공이다.
-- 0줄이면 위 alter 가 안 돈 것이다.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'students'
   and column_name in ('grade', 'dept')
 order by column_name;
