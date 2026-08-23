/**
 * `apply-pending.sql` 을 다시 만든다.
 *
 * 대시보드 SQL Editor 에 일곱 파일을 순서대로 붙여 넣다 보면 하나를 빠뜨리거나
 * 순서가 꼬인다. 실제로 두 번 그랬다. 한 덩어리로 묶어 두면 그럴 일이 없다.
 *
 * migrations/ 의 원본을 고쳤으면 이걸 다시 돌린다:
 *   cd supabase && node concat-pending.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  '0006_course_ops.sql',
  '0007_deductions_heyyoung.sql',
  '0008_fix_task_submission_insert.sql',
  '0009_admin_console.sql',
  '0010_student_access.sql',
  '0011_student_grade_dept.sql',
  '0012_contacts_session_marks.sql',
];

const HEADER = `-- ════════════════════════════════════════════════════════════════
--  0006 ~ 0012 를 한 번에 올리는 파일
--
--  왜 있나 — 일곱 파일을 순서대로 붙여 넣다 보면 하나를 빠뜨리거나 순서가
--  꼬이기 쉽다. 실제로 두 번 그랬다. 이 파일 하나만 통째로 복사해
--  Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run 하면 된다.
--
--  **몇 번을 돌려도 안전하다.** 표는 create table if not exists,
--  정책은 drop policy if exists 를 앞에 두었고, 제약과 트리거도 마찬가지다.
--  이미 올라가 있어도 그냥 다시 지나간다.
--
--  맨 끝에 확인 질의와 스키마 캐시 갱신이 붙어 있다. Run 뒤에 나오는 표에서
--  여섯 칸이 모두 이름을 보여 주면 성공이다. null 이 있으면 그 위 오류를 볼 것.
--
--  ⚠️ 이 파일로도 **Edge Function 은 배포되지 않는다.** 학생 로그인을 새 방식
--     으로 바꾸려면 student-login 을 따로 배포해야 한다 (docs/11-migrate.md 3-2 ③).
--
--  ⚠️ 손으로 고치지 말 것. migrations/ 의 원본을 고치고 다시 만든다:
--       cd supabase && node concat-pending.mjs
-- ════════════════════════════════════════════════════════════════
`;

const FOOTER = `
-- ════════════════════════════════════════════════════════════
--  확인 — 여섯 칸이 모두 이름을 보여 주면 성공이다
-- ════════════════════════════════════════════════════════════
select
  to_regclass('public.course_weeks')      as "0006_주차",
  to_regclass('public.deduction_kinds')   as "0007_감점",
  to_regclass('public.surveys')           as "0009_설문",
  to_regclass('public.student_access')    as "0010_입장",
  to_regclass('public.student_contacts')  as "0012_연락처",
  to_regclass('public.session_marks')     as "0012_일자별";
`;

const body = FILES.map(
  (f) => `\n-- ▼▼▼ ${f} ▼▼▼\n\n${readFileSync(new URL(`migrations/${f}`, import.meta.url), 'utf8').trimEnd()}\n`,
).join('');

writeFileSync(new URL('apply-pending.sql', import.meta.url), HEADER + body + FOOTER);
console.log(`apply-pending.sql 을 다시 만들었습니다 (${FILES.length}개 파일).`);
