import { writeFileSync } from 'node:fs';
import {
  columnName,
  crc32,
  safeFileName,
  safeSheetName,
  toCsv,
  xlsxBytes,
} from '../src/lib/exporters.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

// ── CSV ──────────────────────────────────────────────────────
check('CSV: 기본', toCsv([['a', 'b'], [1, 2]]) === 'a,b\r\n1,2');
check('CSV: 쉼표는 따옴표로 감싼다', toCsv([['박,민수']]) === '"박,민수"');
check('CSV: 따옴표는 두 번 쓴다', toCsv([['최"가"은']]) === '"최""가""은"');
check('CSV: 줄바꿈도 감싼다', toCsv([['가\n나']]) === '"가\n나"');
check('CSV: null 은 빈 칸', toCsv([[null, undefined, '']]) === ',,');
check('CSV: 한글 그대로', toCsv([['자원관리능력']]) === '자원관리능력');

// ── 보조 함수 ────────────────────────────────────────────────
check('열 이름 A', columnName(0) === 'A');
check('열 이름 Z', columnName(25) === 'Z');
check('열 이름 AA', columnName(26) === 'AA');
check('열 이름 AB', columnName(27) === 'AB');
check('열 이름 BA', columnName(52) === 'BA');

check('시트명: 금지문자 제거', safeSheetName('출석/현황[1]') === '출석 현황 1');
check('시트명: 31자 제한', safeSheetName('가'.repeat(40)).length === 31);
check('시트명: 빈 값은 Sheet1', safeSheetName('///') === 'Sheet1');
check('파일명: 금지문자 제거', safeFileName('자원관리능력:출석') === '자원관리능력_출석');

// CRC32 — 알려진 값으로 검증한다 ("123456789" → 0xCBF43926)
check(
  'CRC32 표준값',
  crc32(new TextEncoder().encode('123456789')) === 0xcbf43926,
  crc32(new TextEncoder().encode('123456789')).toString(16),
);

// ── XLSX 바이트 구조 ─────────────────────────────────────────
const bytes = xlsxBytes([
  {
    name: '출결일지',
    rows: [
      ['학번', '성명', '출석', '지각', '결석', '비율'],
      ['202113032', '홍길동', 28, 1, 1, 0.93],
      ['202247046', '박,민수', 30, 0, 0, 1],
    ],
  },
  { name: '감점', rows: [['학번', '항목', '건수', '점수'], ['202113032', '태도 불량', 2, 4]] },
]);

check('XLSX: PK 서명으로 시작', bytes[0] === 0x50 && bytes[1] === 0x4b, [bytes[0], bytes[1]]);
check('XLSX: 크기가 0 이 아님', bytes.length > 800, bytes.length);

const text = new TextDecoder().decode(bytes);
check('XLSX: 필수 파트 [Content_Types]', text.includes('[Content_Types].xml'));
check('XLSX: 필수 파트 workbook', text.includes('xl/workbook.xml'));
check('XLSX: 필수 파트 sheet1', text.includes('xl/worksheets/sheet1.xml'));
check('XLSX: 시트 2개', text.includes('xl/worksheets/sheet2.xml'));
check('XLSX: 시트 이름 반영', text.includes('name="출결일지"'));
check('XLSX: 숫자는 v 로', text.includes('<v>28</v>'));
check('XLSX: 문자열은 inlineStr 로', text.includes('t="inlineStr"'));
check('XLSX: 쉼표 든 이름 보존', text.includes('박,민수'));
check('XLSX: 중앙 디렉터리 끝 서명', text.includes('PK'));

// 실제 파일로 떨어뜨려 엑셀이 열 수 있는지 따로 확인한다 (check_xlsx.ps1)
const out = process.env.XLSX_OUT;
if (out) {
  writeFileSync(out, bytes);
  console.log(`xlsx 파일 저장: ${out} (${bytes.length} bytes)`);
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
