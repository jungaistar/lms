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
