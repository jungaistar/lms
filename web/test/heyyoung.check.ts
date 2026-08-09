import {
  parseHeyYoungCsv,
  matchRoster,
  mapStatus,
  normalizeDate,
  normalizeTime,
} from '../src/lib/heyyoung.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

// ── 값 정규화 ────────────────────────────────────────────────
check('상태: 인정결석은 결석보다 먼저 매칭', mapStatus('인정결석') === 'excused');
check('상태: 결석', mapStatus('결석') === 'absent');
check('상태: 지각', mapStatus('지각') === 'late');
check('상태: 출석', mapStatus('출석') === 'present');
check('상태: 공백 포함', mapStatus(' 출 석 ') === 'present');
check('상태: 모르는 값은 null', mapStatus('보류') === null);

check('날짜: 하이픈', normalizeDate('2026-08-09') === '2026-08-09');
check('날짜: 점', normalizeDate('2026.8.9') === '2026-08-09');
check('날짜: 슬래시', normalizeDate('2026/08/09') === '2026-08-09');
check('날짜: 한글', normalizeDate('2026년 8월 9일') === '2026-08-09');
check('날짜: 붙여쓰기', normalizeDate('20260809') === '2026-08-09');
check('날짜: 쓰레기값은 null', normalizeDate('없음') === null);

check('시각: 24시간', normalizeTime('09:05') === '09:05');
check('시각: 한자리', normalizeTime('9:5') === '09:05');
check('시각: 오후', normalizeTime('오후 1:30') === '13:30');
check('시각: 오전 12시는 00시', normalizeTime('오전 12:10') === '00:10');
check('시각: 오후 12시는 그대로', normalizeTime('오후 12:10') === '12:10');
check('시각: 한글 시', normalizeTime('9시 5') === '09:05');

// ── 표준 CSV ─────────────────────────────────────────────────
const basic = ['학번,이름,날짜,체크인,상태', '20250101,홍길동,2026-09-02,09:01,출석', '20250102,김철수,2026-09-02,09:15,지각', '20250103,이영희,2026-09-02,,결석'].join('\n');

const r1 = parseHeyYoungCsv(basic);
check('기본: 3행', r1.rows.length === 3, r1.rows.length);
check('기본: 버려진 줄 없음', r1.skipped.length === 0, r1.skipped);
check('기본: 학번 열 인식', r1.mapping.studentNo === '학번');
check('기본: 상태 매핑', r1.rows.map((r) => r.status).join(',') === 'present,late,absent');
check('기본: 결석은 시각 null', r1.rows[2].time === null);

// ── BOM + CRLF + 위쪽 제목줄 + 따옴표 안 쉼표 ────────────────
const messy =
  '\ufeff"출결 현황 (2026-09-02 ~ 2026-12-19)"\r\n' +
  '"학교","동아방송예술대학교"\r\n' +
  '\r\n' +
  '"학번","성명","일자","입실시간","출결상태","비고"\r\n' +
  '"20250101","홍길동","2026.09.02","오전 9:01","출석","정상"\r\n' +
  '"20250104","박,민수","2026.09.02","오전 9:40","지각","교통 지연"\r\n' +
  '"20250105","최""가"" 은","2026.09.02","","인정결석","공결원 제출"\r\n';

const r2 = parseHeyYoungCsv(messy);
check('지저분: 머리글을 4번째 줄에서 찾음', r2.mapping.studentNo === '학번', r2.mapping);
check('지저분: 3행', r2.rows.length === 3, r2.rows.length);
check('지저분: 따옴표 안 쉼표 보존', r2.rows[1].name === '박,민수', r2.rows[1].name);
check('지저분: 이중따옴표 이스케이프', r2.rows[2].name === '최"가" 은', r2.rows[2].name);
check('지저분: 오전 9:01 → 09:01', r2.rows[0].time === '09:01', r2.rows[0].time);
check('지저분: 인정결석 → excused', r2.rows[2].status === 'excused');
check('지저분: 원본 열 보존', r2.rows[1].raw['비고'] === '교통 지연', r2.rows[1].raw);

// ── 탭 구분 ──────────────────────────────────────────────────
const tsv = ['학번\t이름\t날짜\t상태', '20250101\t홍길동\t2026-09-09\t출석'].join('\n');
const r3 = parseHeyYoungCsv(tsv);
check('TSV: 구분자 자동 인식', r3.rows.length === 1 && r3.rows[0].studentNo === '20250101', r3.rows);

// ── 나쁜 줄은 버리지 않고 이유를 남긴다 ──────────────────────
const dirty = [
  '학번,이름,날짜,상태',
  ',홍길동,2026-09-02,출석',
  '합계,,,',
  '20250101,홍길동,2026-09-02,보류',
  '20250102,김철수,2026-09-02,출석',
].join('\n');
const r4 = parseHeyYoungCsv(dirty);
check('불량: 정상 1행만 통과', r4.rows.length === 1, r4.rows.length);
check('불량: 3줄이 이유와 함께 남음', r4.skipped.length === 3, r4.skipped);
check(
  '불량: 학번 없음 사유',
  r4.skipped[0].reason.includes('학번'),
  r4.skipped[0],
);
check(
  '불량: 알 수 없는 출결 사유에 원본 표기 포함',
  r4.skipped[2].reason.includes('보류'),
  r4.skipped[2],
);

// ── 명단 대조 ────────────────────────────────────────────────
const roster = [
  { id: 'a', student_no: '20250101', name: '홍길동' },
  { id: 'b', student_no: '20250102', name: '김철수' },
  { id: 'c', student_no: '20250199', name: '결석생' },
];
const m = matchRoster(r1.rows, roster);
check('대조: 2명 매칭', m.matched.length === 2, m.matched.length);
check('대조: 명단에 없는 학번 1건', m.unmatched.length === 1 && m.unmatched[0].studentNo === '20250103');
check('대조: 파일에 안 나온 학생 1명', m.missing.length === 1 && m.missing[0].id === 'c', m.missing);

// ── 빈 파일 ──────────────────────────────────────────────────
const r5 = parseHeyYoungCsv('');
check('빈 파일: 터지지 않음', r5.rows.length === 0 && r5.skipped.length === 0);

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
