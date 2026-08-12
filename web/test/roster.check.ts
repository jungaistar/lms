/**
 * 명단 붙여넣기 파서 점검.
 *
 * 실제로 깨졌던 자리를 그대로 시험한다.
 *   · 학교 LMS 성적표를 긁으면 맨 앞 NO 칸(1·2·3…)이 학년으로 읽혔다
 *   · "점 / 추가점수 저장 / 출석미달" 이 팀 이름으로 읽혔다
 *   · 머리글 "NO 학과 학년 학번 이름" 이 학생 한 명으로 들어왔다
 *
 * 실행: npx tsx test/roster.check.ts
 */

import { parseRoster } from '../src/lib/roster';

let pass = 0;
let fail = 0;

function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${label}\n      받은 값 ${g}\n      기대값 ${w}`);
}

// ── ① 엑셀에서 직접 — 예전부터 쓰던 길 ─────────────────────
{
  const rows = parseRoster('202458001\t김민준\t1조\n202458002\t이서연\t1조\n202458003\t박도윤\t2조');
  eq('엑셀 3칸 · 줄 수', rows.length, 3);
  eq('엑셀 3칸 · 첫 줄', rows[0], {
    student_no: '202458001', name: '김민준', team: '1조', grade: null, dept: null,
  });
}

{
  const rows = parseRoster('202458001 김민준');
  eq('학번·이름만', rows[0], {
    student_no: '202458001', name: '김민준', team: null, grade: null, dept: null,
  });
}

{
  // 팀 이름이 그냥 "1" 인 경우도 살아야 한다 (학년으로 읽히면 안 된다).
  const rows = parseRoster('202458001\t김민준\t1');
  eq('숫자 팀 이름', rows[0]!.team, '1');
  eq('숫자 팀 이름 · 학년 아님', rows[0]!.grade, null);
}

// ── ② 학교 LMS '성적산출/결과' 표를 그대로 긁은 줄 ──────────
{
  const line = '1\t성악(보컬)과\t3\t201936083\t전예찬\t\t점\t추가점수 저장\t출석미달';
  const rows = parseRoster(line);
  eq('학교 LMS · 한 줄', rows[0], {
    student_no: '201936083', name: '전예찬', team: null, grade: 3, dept: '성악(보컬)과',
  });
}

{
  // NO 와 학년이 같은 숫자일 때 — 예전에 NO 를 학년으로 읽었다.
  const rows = parseRoster('3\t기악과\t3\t202136046\t한대윤\t\t점\t추가점수 저장\t출석미달');
  eq('NO 와 학년이 같은 숫자', rows[0]!.grade, 3);
  eq('NO 를 팀으로 읽지 않음', rows[0]!.team, null);
}

{
  // NO 가 두 자리로 커져도 학년은 바로 앞칸이다.
  const rows = parseRoster('25\t영화예술과\t2\t202513030\t이예지\t\t점\t추가점수 저장\t출석미달');
  eq('두 자리 NO · 학년', rows[0]!.grade, 2);
  eq('두 자리 NO · 학과', rows[0]!.dept, '영화예술과');
}

{
  // 영문·기호가 섞인 학과, '계열' 로 끝나는 학과.
  const rows = parseRoster(
    '13\tK-POP과\t3\t202348006\t김유빈\n3\t실용음악계열\t3\t202136119\t최고도',
  );
  eq('K-POP과', rows[0]!.dept, 'K-POP과');
  eq('실용음악계열', rows[1]!.dept, '실용음악계열');
}

{
  // 머리글 줄은 학생이 되면 안 된다.
  const text = [
    'NO 학과 학년 학번 이름 총점 가산점 최종 점수 비고 비율',
    '1\t성악(보컬)과\t3\t201936083\t전예찬',
  ].join('\n');
  eq('머리글 제외', parseRoster(text).length, 1);
}

{
  // 브라우저에서 긁으면 탭 대신 여러 칸 공백이 오기도 한다.
  const rows = parseRoster('1   성악(보컬)과   3   201936083   전예찬');
  eq('여러 칸 공백', rows[0]!.student_no, '201936083');
  eq('여러 칸 공백 · 이름', rows[0]!.name, '전예찬');
}

// ── ③ 우리가 내보내는 파일 — 학번 이름 학년 학과 ────────────
{
  const rows = parseRoster('202113032\t이기성\t3\t영상제작과');
  eq('우리 TSV', rows[0], {
    student_no: '202113032', name: '이기성', team: null, grade: 3, dept: '영상제작과',
  });
}

{
  // "3학년" 처럼 적어도 받는다.
  const rows = parseRoster('202113032\t이기성\t3학년\t영상제작과');
  eq('N학년 표기', rows[0]!.grade, 3);
}

// ── ④ '학부' 함정 — 이름 자리에 들어오면 안 되는 낱말 ────────
{
  const rows = parseRoster('1\t학부\t3\t202126002\t고재욱\t\t3/3\t조회');
  eq('학부를 이름으로 읽지 않음', rows[0]!.name, '고재욱');
  eq('학부는 학과도 아님', rows[0]!.dept, null);
}

// ── ⑤ 실제 6과목 명단이 통째로 들어올 때 ────────────────────
{
  const y5 = [
    '1\t성악(보컬)과\t3\t201936083\t전예찬\t\t점\t추가점수 저장\t출석미달',
    '2\t방송극작과\t3\t202126002\t고재욱\t\t점\t추가점수 저장\t출석미달',
    '3\t기악과\t3\t202136046\t한대윤\t\t점\t추가점수 저장\t출석미달',
    '25\t영화예술과\t2\t202513030\t이예지\t\t점\t추가점수 저장\t출석미달',
  ].join('\n');
  const rows = parseRoster(y5);
  eq('여러 줄 · 개수', rows.length, 4);
  eq('여러 줄 · 팀 없음', rows.every((r) => r.team === null), true);
  eq('여러 줄 · 학년 모두 읽음', rows.map((r) => r.grade), [3, 3, 3, 2]);
  eq('여러 줄 · 학번 모두 9자리', rows.every((r) => /^\d{9}$/.test(r.student_no)), true);
}

console.log(`\n명단 파서: ${pass}개 통과${fail ? `, ${fail}개 실패` : ''}`);
process.exit(fail ? 1 : 0);
