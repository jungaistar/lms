-- ────────────────────────────────────────────────────────────
--  옛 명단(2026-08-12 반영분 199명)을 지우고 2026-2학기 명단만 남긴다.
--
--  Supabase SQL Editor 에 붙여넣고, ①먼저 미리보기 두 개만 돌린 뒤
--  숫자가 맞으면 ②삭제를 돌린다. 한꺼번에 RUN 하지 말 것.
--
--  주소창이 supabase.com/dashboard/project/aujvpcpjpgxghxmsheur 인지
--  먼저 확인하라. 다른 프로젝트에서 돌리면 아무 일도 일어나지 않는다.
--
--  가르는 기준은 created_at 이다.
--    2026-08-12 에 들어간 199명  → 지운다
--    2026-08-23 에 들어간 195명  → 남긴다
--  두 무리는 학번이 한 명도 겹치지 않는다(확인함). 날짜로 갈라도 안전하다.
-- ────────────────────────────────────────────────────────────

-- ① 미리보기 A — 과목별로 몇 명이 지워지고 몇 명이 남는가
--    지워질 수가 34 · 30 · 33 · 34 · 35 · 33 (합 199) 이어야 한다.
select c.title,
       c.section,
       count(*) filter (where s.created_at <  date '2026-08-20') as 지울명단,
       count(*) filter (where s.created_at >= date '2026-08-20') as 남길명단,
       count(*)                                                  as 지금
  from students s
  join courses  c on c.id = s.course_id
 where c.owner_id = (select id from auth.users where email = 'radical8566@gmail.com')
 group by c.title, c.section
 order by c.section;

-- ① 미리보기 B — 지울 학생에게 딸린 것이 있는가
--    전부 0 이어야 한다. 하나라도 0 이 아니면 삭제와 함께 사라지므로
--    거기서 멈추고 무엇이 딸렸는지 먼저 볼 것.
with old as (
  select s.id
    from students s
    join courses  c on c.id = s.course_id
   where c.owner_id = (select id from auth.users where email = 'radical8566@gmail.com')
     and s.created_at < date '2026-08-20'
)
select
  (select count(*) from assignments       where evaluator_id in (select id from old)) as 배정,
  (select count(*) from targets           where student_id   in (select id from old)) as 평가대상,
  (select count(*) from contributions     where evaluator_id in (select id from old)
                                             or ratee_id     in (select id from old)) as 기여도,
  (select count(*) from discussion_posts  where author_id    in (select id from old)) as 토론글,
  (select count(*) from results           where student_id   in (select id from old)) as 집계결과,
  (select count(*) from task_submissions  where student_id   in (select id from old)) as 과제제출,
  (select count(*) from attendance        where student_id   in (select id from old)) as 출결,
  (select count(*) from exam_scores       where student_id   in (select id from old)) as 시험점수,
  (select count(*) from final_grades      where student_id   in (select id from old)) as 최종성적,
  (select count(*) from deductions        where student_id   in (select id from old)) as 감점,
  (select count(*) from survey_responses  where student_id   in (select id from old)) as 설문응답,
  (select count(*) from student_access    where student_id   in (select id from old)) as 입장승인;

-- ────────────────────────────────────────────────────────────
-- ② 삭제 — 위 두 개를 보고 숫자가 맞을 때만 이 아래를 돌린다.
--    되돌릴 수 없다.
-- ────────────────────────────────────────────────────────────

begin;

delete from students s
 using courses c
 where c.id = s.course_id
   and c.owner_id = (select id from auth.users where email = 'radical8566@gmail.com')
   and s.created_at < date '2026-08-20';

-- 지운 뒤 과목별 인원. 35 · 30 · 35 · 35 · 30 · 30 (합 195) 이어야 한다.
select c.title, c.section, count(*) as 인원
  from students s
  join courses  c on c.id = s.course_id
 where c.owner_id = (select id from auth.users where email = 'radical8566@gmail.com')
 group by c.title, c.section
 order by c.section;

-- 숫자가 맞으면 commit, 이상하면 rollback 을 대신 돌린다.
commit;
-- rollback;
