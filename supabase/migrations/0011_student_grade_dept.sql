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
