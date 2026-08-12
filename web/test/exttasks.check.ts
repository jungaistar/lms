import {
  matchByStudentNo,
  parseTaskCounts,
  parseTaskDetail,
} from '../src/lib/extTasks.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

// ════════════════════════════════════════════════════════════
//  ① 학생별 과제 — 제출수 n/N
//
//  실제 화면(lms.dima.ac.kr 과제관리 → 학생별 과제)에서 긁으면
//  "NO 학교명 학년 학번 이름 핸드폰 제출수 조회" 순서로 붙는다.
// ════════════════════════════════════════════════════════════
const COUNTS_TAB = [
  'NO\t학교명\t학년\t학번\t이름\t핸드폰\t제출수\t조회',
  '1\t학부\t3\t202126002\t고재욱\t\t3/3\t조회',
  '2\t학부\t3\t202415002\t고채연\t\t2/3\t조회',
  '3\t학부\t3\t202427005\t김서현\t\t0/3\t조회',
].join('\n');

{
  const r = parseTaskCounts(COUNTS_TAB);
  check('제출수: 머리글 빼고 3줄', r.rows.length === 3, r.rows.length);
  check('제출수: 분모가 같으면 총 과제 수', r.total === 3, r.total);
  check('제출수: 학번', r.rows[0]?.studentNo === '202126002', r.rows[0]);
  check('제출수: 이름', r.rows[0]?.name === '고재욱', r.rows[0]?.name);
  check('제출수: 다 낸 학생 미제출 0', r.rows[0]?.missing === 0);
  check('제출수: 하나 안 낸 학생 미제출 1', r.rows[1]?.missing === 1);
  check('제출수: 하나도 안 낸 학생 미제출 3', r.rows[2]?.missing === 3);
  check('제출수: 머리글은 못 읽은 줄로 세지 않는다', r.skipped.length === 0, r.skipped);
}

// 브라우저에서 표를 긁으면 탭 대신 여러 칸 공백이 오기도 한다.
{
  const r = parseTaskCounts('1   학부   3   202126002   고재욱      3/3   조회');
  check('제출수: 여러 칸 공백도 읽는다', r.rows.length === 1 && r.rows[0]?.submitted === 3, r.rows);
}

// 분모가 섞이면 사람이 확인해야 한다 — 조용히 하나로 정하지 않는다.
{
  const r = parseTaskCounts('202126002\t고재욱\t3/3\n202415002\t고채연\t2/4');
  check('제출수: 분모가 다르면 total 은 null', r.total === null, r.total);
}

// 이상한 값은 버리고 왜 버렸는지 남긴다.
{
  const r = parseTaskCounts('202126002\t고재욱\t5/3\n202415002\t고채연\t2/3');
  check('제출수: 분자가 분모보다 크면 버린다', r.rows.length === 1, r.rows);
  check('제출수: 버린 이유를 남긴다', r.skipped.length === 1 && r.skipped[0]?.line === 1, r.skipped);
}

{
  const r = parseTaskCounts('202126002\t고재욱\t조회');
  check('제출수: n/N 이 없으면 버린다', r.rows.length === 0 && r.skipped.length === 1, r);
}

// ════════════════════════════════════════════════════════════
//  ② 과제별 제출 목록 — 학번 · 제출일시 · 상태
// ════════════════════════════════════════════════════════════
const DUE = new Date('2026-03-16T23:59:00').toISOString();

{
  const text = [
    '학번\t이름\t제출일시',
    '202126002\t고재욱\t2026-03-16 21:04',
    '202415002\t고채연\t2026-03-17 09:12',
    '202439003\t권시온\t미제출',
  ].join('\n');
  const r = parseTaskDetail(text, DUE);

  check('제출목록: 3줄', r.rows.length === 3, r.rows.length);
  check('제출목록: 마감 전이면 제출', r.rows[0]?.state === 'submitted', r.rows[0]);
  check('제출목록: 마감 뒤면 지각', r.rows[1]?.state === 'late', r.rows[1]);
  check('제출목록: 미제출 낱말을 읽는다', r.rows[2]?.state === 'missing', r.rows[2]);
  check('제출목록: 미제출에는 시각을 붙이지 않는다', r.rows[2]?.submittedAt === null, r.rows[2]);
  check('제출목록: 제출일시를 ISO 로', typeof r.rows[0]?.submittedAt === 'string', r.rows[0]?.submittedAt);
}

// 마감이 없으면 지각을 가릴 수 없다 — 낸 것은 전부 제출로 둔다.
{
  const r = parseTaskDetail('202126002\t고재욱\t2026-03-17 09:12', null);
  check('제출목록: 마감이 없으면 지각으로 몰지 않는다', r.rows[0]?.state === 'submitted', r.rows[0]);
}

// 파일이 상태를 직접 알려 주면 그쪽을 먼저 믿는다.
{
  const r = parseTaskDetail('202126002\t고재욱\t2026-03-16 21:04\t지각', DUE);
  check('제출목록: 상태 낱말이 마감 비교를 이긴다', r.rows[0]?.state === 'late', r.rows[0]);
}

// "미제출" 이 "제출" 로 잡히면 안 된다.
{
  const r = parseTaskDetail('202126002\t고재욱\t미제출', DUE);
  check('제출목록: 미제출을 제출로 읽지 않는다', r.rows[0]?.state === 'missing', r.rows[0]);
}

// 날짜만 있으면 그날 자정으로 본다 → 마감(23:59)보다 이르므로 제출.
{
  const r = parseTaskDetail('202126002\t고재욱\t2026.03.16', DUE);
  check('제출목록: 점으로 쓴 날짜도 읽는다', r.rows[0]?.state === 'submitted', r.rows[0]);
}

{
  const r = parseTaskDetail('이름만 있는 줄', DUE);
  check('제출목록: 학번 없는 줄은 버린다', r.rows.length === 0 && r.skipped.length === 1, r);
}

// ════════════════════════════════════════════════════════════
//  명단 맞추기 — 학번만 본다
// ════════════════════════════════════════════════════════════
{
  const roster = [
    { id: 'a', student_no: '202126002', name: '고재욱' },
    { id: 'b', student_no: '202415002', name: '고채연' },
    { id: 'c', student_no: '202427005', name: '김서현' },
  ];
  const rows = [
    { studentNo: '202126002' },
    { studentNo: '202415002' },
    { studentNo: '999999999' },
  ];
  const m = matchByStudentNo(rows, roster);

  check('맞추기: 맞은 줄 2', m.matched.length === 2, m.matched.length);
  check('맞추기: 명단에 없는 학번 1', m.unmatched.length === 1, m.unmatched);
  check('맞추기: 붙여넣기에 안 나온 학생 1', m.missing.length === 1 && m.missing[0]?.id === 'c', m.missing);
  check('맞추기: 학생 id 를 붙인다', m.matched[0]?.studentId === 'a', m.matched[0]);
}

// 명단 학번에 공백이 섞여 있어도 맞아야 한다.
{
  const m = matchByStudentNo([{ studentNo: '202126002' }], [
    { id: 'a', student_no: ' 202126002 ', name: '고재욱' },
  ]);
  check('맞추기: 공백을 무시한다', m.matched.length === 1, m);
}

console.log(`\n통과 ${pass} · 실패 ${fail}\n`);
if (fail > 0) process.exit(1);
