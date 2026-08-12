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

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
--
--  이걸 빼먹으면 SQL 은 분명히 올라갔는데 앱에서는
--  "Could not find the table 'public.xxx' in the schema cache" 가 계속 난다.
--  PostgREST 는 표·함수 목록을 캐시에 들고 있고, 대시보드 SQL Editor 로
--  DDL 을 돌렸을 때 그 캐시가 곧바로 갱신되지 않는 경우가 있다.
--  실제로 2026-08-12 에 이것 때문에 "안 올라갔다" 고 오판했다.
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';
