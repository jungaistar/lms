import { parseHeyYoungMatrix, parseHeyYoungRequests } from '../src/lib/heyyoung.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

// ── 가로형 출석부 ────────────────────────────────────────────
// 실제 화면과 같은 모양: 머리글 5줄, 주차마다 교시 2칸, 병합은 빈 칸으로 풀린다.
const matrix = [
  '2026학년도 1학기 출석부,,,,,,,,,,',
  '순번,학과,학년,학번,성명,주,1주,,2주,,3주,',
  ',,,,,월,03,,03,,03,',
  ',,,,,일,09,,16,,23,',
  ',,,,,요일,월,월,월,월,월,월',
  ',,,,,교시,03,04,03,04,03,04',
  '1,영상제작과,3,202113032,홍길동,,O,O,O,O,◎,◎',
  '2,방송기술과,3,202256038,"박,민수",,O,O,X,X,△,□',
  '3,영화예술과,3,202334022,최은,,-,-,O,O,O,?',
  '합계,,,,,,,,,,',
  '오류행,,,,,,O,O,,,,',
].join('\n');

const m = parseHeyYoungMatrix(matrix, 2026);

check('행렬: 학생 3명', m.students.length === 3, m.students.length);
check('행렬: 열 6개(3주×2교시)', m.columns.length === 6, m.columns);
check(
  '행렬: 주차·교시 매김',
  JSON.stringify(m.columns.map((c) => `${c.week}-${c.session}`)) ===
    JSON.stringify(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']),
  m.columns.map((c) => `${c.week}-${c.session}`),
);
check('행렬: 날짜 조립 (병합 이어받기)', m.columns[0]?.date === '2026-03-09', m.columns[0]);
check('행렬: 2주차 날짜', m.columns[2]?.date === '2026-03-16', m.columns[2]);

const s1 = m.students[0]!;
check('행렬: 학번', s1.studentNo === '202113032');
check('행렬: O 는 출석', s1.cells[0]?.status === 'present');
check(
  '행렬: ◎ 는 유고결석 (출석 아님)',
  s1.cells[4]?.status === 'excused' && s1.cells[5]?.status === 'excused',
  s1.cells.map((c) => c.status),
);

const s2 = m.students[1]!;
check('행렬: 따옴표 안 쉼표 이름', s2.name === '박,민수', s2.name);
check('행렬: X 는 결석', s2.cells[2]?.status === 'absent');
check('행렬: △ 는 지각', s2.cells[4]?.status === 'late');
check('행렬: □ 는 조퇴', s2.cells[5]?.status === 'early_leave');

const s3 = m.students[2]!;
check('행렬: - (미정) 은 넣지 않는다', s3.cells.length === 3, s3.cells.length);
check('행렬: 모르는 기호는 unknownSymbols 에 남는다', m.unknownSymbols['?'] === 1, m.unknownSymbols);
check('행렬: 학번 없는 합계 줄은 조용히 넘긴다', !m.skipped.some((s) => s.text.startsWith('합계')), m.skipped);
check('행렬: 기호는 있는데 학번이 없으면 반드시 보고', m.skipped.some((s) => s.reason.includes('학번 칸이 비어')), m.skipped);

// 탭 구분 + 학번만 있고 성명이 없는 경우
const tsv = [
  '순번\t학번\t주\t1주\t',
  '\t\t월\t03\t',
  '\t\t일\t09\t',
  '\t\t교시\t03\t04',
  '1\t202113032\t\tO\tX',
].join('\n');
const t = parseHeyYoungMatrix(tsv, 2026);
check('행렬 TSV: 학생 1명', t.students.length === 1, t.students.length);
check('행렬 TSV: 성명 없으면 null', t.students[0]?.name === null);
check('행렬 TSV: 2칸 읽음', t.students[0]?.cells.length === 2, t.students[0]?.cells);

check('행렬: 빈 파일이어도 터지지 않음', parseHeyYoungMatrix('').students.length === 0);
check('행렬: 학번 열이 없으면 빈 결과', parseHeyYoungMatrix('가,나\n1,2').students.length === 0);

// ── 이의신청 / 유고결석 목록 ─────────────────────────────────
const appeal = [
  'No,교과목명(과목번호-분반),출석일자,출석구분,신청자,신청일시,처리여부',
  '1,문화예술콘텐츠창업(60716-Y6),14주차 2번째 [1],결석,주성원,2026-06-16 10:52:19,답변완료',
  '2,자원관리능력(50035-Y1),6주차 1번째 [1],결석,조혜나,2026-05-04 16:43:18,답변완료( 출석 )',
].join('\n');

const a = parseHeyYoungRequests(appeal);
check('이의신청: 2행', a.rows.length === 2, a.rows.length);
check('이의신청: 과목코드 추출', a.rows[0]?.courseCode === '60716-Y6', a.rows[0]?.courseCode);
check('이의신청: 주차·교시 추출', a.rows[0]?.week === 14 && a.rows[0]?.session === 2, a.rows[0]);
check('이의신청: 괄호 없으면 result null', a.rows[0]?.result === null, a.rows[0]?.result);
check('이의신청: 답변완료( 출석 ) → present', a.rows[1]?.result === 'present', a.rows[1]?.result);
check('이의신청: 신청자', a.rows[1]?.applicant === '조혜나');

const excused = [
  'No,교과목명(과목번호-분반),출석일자,출석구분,사유구분,신청자,신청일시,처리여부',
  '1,자원관리능력(50035-Y1),10주차 2번째 [1],결석,단순질병,이수빈,2026-06-19 18:57:26,답변완료( 출석 )',
  '2,자원관리능력(50035-Y1),9주차 1번째 [1],결석,수강정정,이수빈,2026-06-19 18:56:32,답변완료( 결석 )',
].join('\n');

const e = parseHeyYoungRequests(excused);
check('유고결석: 사유구분 읽음', e.rows[0]?.reason === '단순질병', e.rows[0]?.reason);
check('유고결석: ( 출석 ) → present', e.rows[0]?.result === 'present');
check('유고결석: ( 결석 ) → absent', e.rows[1]?.result === 'absent', e.rows[1]?.result);
check('유고결석: 과목코드', e.rows[1]?.courseCode === '50035-Y1');

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
