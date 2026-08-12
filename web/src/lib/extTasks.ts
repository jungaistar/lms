/**
 * 학교 LMS(*.dunet) 과제 현황 읽기.
 *
 * 학교 LMS 가 원본이고 이쪽이 사본이다. 과제 화면에는 두 가지 모양이 있다.
 *
 *  ① 학생별 과제 (과제관리 → 학생별 과제)
 *       NO  학교명  학년  학번        이름   핸드폰  제출수  조회
 *       1   학부    3    202126002   고재욱          3/3     조회
 *     → 학생마다 "몇 개 중 몇 개 냈는지" 만 준다. 어느 과제인지도, 늦었는지도 모른다.
 *
 *  ② 과제별 제출 목록 (과제관리(출제/채점) → 채점하기)
 *       학번        이름   제출일시              상태
 *       202126002   고재욱  2026-03-16 21:04      제출
 *     → 과제 하나에 대해 누가 언제 냈는지 준다. 마감과 비교해 지각을 가릴 수 있다.
 *
 * 브라우저에서 표를 긁어 붙이면 칸이 탭이나 여러 칸 공백으로 갈린다.
 * 엑셀에서 받아 붙이면 탭이다. 둘 다 같은 길로 읽는다.
 *
 * 학번만 열쇠로 쓴다 — 이름은 동명이인·개명 때문에 못 믿는다.
 */

import { normalizeDate, normalizeTime, type SkippedRow } from './heyyoung';

export type ExtState = 'submitted' | 'late' | 'missing';

/** 한 줄을 칸으로 가른다. 탭 → 여러 칸 공백 → 쉼표 순서로 본다. */
export function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((c) => c.trim());
  if (line.includes(',')) return line.split(',').map((c) => c.trim());
  return line.split(/\s+/).map((c) => c.trim());
}

/** 학번으로 볼 만한 칸. 학교 학번은 9자리지만 6자리 이상이면 받는다. */
const STUDENT_NO = /^\d{6,12}$/;

/** 한글 이름. 성만 두 글자인 경우까지 보려고 2~6자로 잡는다. */
const KOREAN_NAME = /^[가-힣]{2,6}$/;

/**
 * 이름처럼 생겼지만 이름이 아닌 낱말.
 *
 * 학교 LMS 표에는 학번 앞에 "학부 · 3" 같은 칸이 붙는다. 이걸 거르지 않으면
 * 모든 학생 이름이 "학부" 가 된다 — 실제로 그렇게 나왔다.
 */
const NOT_A_NAME = new Set([
  '학부', '대학', '대학교', '학과', '전공', '본교', '분교', '계열',
  '학년', '학번', '이름', '성명', '구분', '학생', '교수', '조교', '청강',
  '재학', '휴학', '졸업', '제출', '미제출', '지각', '결석', '출석',
  '조회', '보기', '채점', '완료', '없음',
]);

export function findStudentNo(cells: string[]): string | null {
  return cells.find((c) => STUDENT_NO.test(c.replace(/\s/g, ''))) ?? null;
}

const looksLikeName = (c: string | undefined): c is string =>
  !!c && KOREAN_NAME.test(c) && !NOT_A_NAME.has(c);

/**
 * 학번 칸을 기준으로 이름을 고른다.
 *
 * 학교 LMS 표는 예외 없이 **학번 다음 칸이 이름**이다. 그래서 뒤쪽을 먼저 본다.
 * "이름 학번" 순서로 붙여넣는 경우가 있어 없으면 앞쪽도 훑는다.
 */
export function pickName(cells: string[], studentNo: string | null): string | null {
  const at = studentNo ? cells.indexOf(studentNo) : -1;
  if (at < 0) return cells.find(looksLikeName) ?? null;

  // 인덱스로 꺼낸 값은 타입이 좁혀지지 않아 한 번 받아서 본다.
  for (let i = at + 1; i < cells.length; i += 1) {
    const c = cells[i];
    if (looksLikeName(c)) return c;
  }
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = cells[i];
    if (looksLikeName(c)) return c;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  ① 학생별 과제 — "제출수 n/N"
// ════════════════════════════════════════════════════════════

export interface CountRow {
  studentNo: string;
  name: string | null;
  submitted: number;
  total: number;
  /** 못 낸 개수. 이 숫자가 그대로 감점 건수가 된다. */
  missing: number;
  line: number;
}

export interface CountParseResult {
  rows: CountRow[];
  skipped: SkippedRow[];
  /** 줄마다 분모가 같으면 그 값. 다르면 null — 사람이 확인해야 한다. */
  total: number | null;
}

/** "3/3" · "0 / 3" · "3분의 3" 아닌 것은 안 받는다. */
const COUNT_CELL = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;

export function parseTaskCounts(text: string): CountParseResult {
  const rows: CountRow[] = [];
  const skipped: SkippedRow[] = [];

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    const cells = splitCells(line);
    const studentNo = findStudentNo(cells);
    if (!studentNo) {
      // 머리글 줄만 조용히 넘긴다 — '학번' 이라고 적혀 있는 줄이 머리글이다.
      // 그 밖에 학번이 없는 줄은 왜 못 읽었는지 남긴다. 조용히 사라지면
      // 표를 반만 긁어 왔다는 걸 알아챌 방법이 없다.
      if (!line.includes('학번')) {
        skipped.push({ line: i + 1, reason: '학번을 못 찾음', text: line });
      }
      return;
    }

    const countCell = cells.find((c) => COUNT_CELL.test(c));
    if (!countCell) {
      skipped.push({ line: i + 1, reason: '제출수(n/N)를 못 찾음', text: line });
      return;
    }

    const m = COUNT_CELL.exec(countCell)!;
    const submitted = Number(m[1]);
    const total = Number(m[2]);
    if (total === 0 || submitted > total) {
      skipped.push({ line: i + 1, reason: `제출수 "${countCell}" 가 이상함`, text: line });
      return;
    }

    rows.push({
      studentNo: studentNo.replace(/\s/g, ''),
      name: pickName(cells, studentNo),
      submitted,
      total,
      missing: total - submitted,
      line: i + 1,
    });
  });

  const totals = new Set(rows.map((r) => r.total));
  return { rows, skipped, total: totals.size === 1 ? [...totals][0]! : null };
}

// ════════════════════════════════════════════════════════════
//  ② 과제별 제출 목록 — 학번 · 제출일시 또는 상태
// ════════════════════════════════════════════════════════════

export interface DetailRow {
  studentNo: string;
  name: string | null;
  /** 파일이 상태를 직접 알려 준 경우. 없으면 제출일시로 판정한다. */
  state: ExtState | null;
  /** ISO 문자열. 날짜만 있으면 그날 자정으로 본다. */
  submittedAt: string | null;
  raw: string;
  line: number;
}

export interface DetailParseResult {
  rows: DetailRow[];
  skipped: SkippedRow[];
}

/** 상태 낱말. 긴 것부터 봐야 "미제출" 이 "제출" 로 잡히지 않는다. */
const STATE_WORDS: Array<[ExtState, RegExp]> = [
  ['missing', /미제출|안냄|없음|불참|^x$|^X$|^-$/],
  ['late', /지각|늦음|late|기한후|마감후/i],
  ['submitted', /제출|완료|submitted|^o$|^O$|^○$/],
];

function readState(cell: string): ExtState | null {
  const v = cell.replace(/\s/g, '');
  if (!v) return null;
  for (const [state, re] of STATE_WORDS) if (re.test(v)) return state;
  return null;
}

/** "2026-03-16 21:04" · "2026.03.16 오후 9:04" · "2026/3/16" 을 ISO 로. */
function readWhen(cells: string[]): string | null {
  for (const cell of cells) {
    const date = normalizeDate(cell);
    if (!date) continue;
    const time = normalizeTime(cell) ?? '00:00';
    const iso = new Date(`${date}T${time}:00`);
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  return null;
}

/**
 * 과제 하나에 대한 제출 목록을 읽는다.
 *
 * `dueAt` 을 주면 제출일시와 비교해 지각을 스스로 가른다.
 * 파일에 상태 낱말이 있으면 그쪽을 먼저 믿는다 — 학교 LMS 가 자기 규칙으로
 * 이미 판정한 것이라 우리가 마감시각을 잘못 넣었을 때보다 정확하다.
 */
export function parseTaskDetail(text: string, dueAt?: string | null): DetailParseResult {
  const rows: DetailRow[] = [];
  const skipped: SkippedRow[] = [];
  const due = dueAt ? new Date(dueAt).getTime() : null;

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    const cells = splitCells(line);
    const studentNo = findStudentNo(cells);
    if (!studentNo) {
      if (!line.includes('학번')) {
        skipped.push({ line: i + 1, reason: '학번을 못 찾음', text: line });
      }
      return;
    }

    const name = pickName(cells, studentNo);
    const submittedAt = readWhen(cells);

    // 학번·이름 칸에서 상태를 읽지 않도록 나머지 칸만 본다.
    let state: ExtState | null = null;
    for (const c of cells) {
      if (c === studentNo || c === name) continue;
      const s = readState(c);
      if (s) { state = s; break; }
    }

    if (!state) {
      if (submittedAt === null) state = 'missing';
      else if (due !== null) state = new Date(submittedAt).getTime() > due ? 'late' : 'submitted';
      else state = 'submitted';
    }

    rows.push({
      studentNo: studentNo.replace(/\s/g, ''),
      name,
      state,
      // 미제출인데 시각이 딸려 오면 그 시각은 버린다. 근거가 어긋나면 안 된다.
      submittedAt: state === 'missing' ? null : submittedAt,
      raw: line,
      line: i + 1,
    });
  });

  return { rows, skipped };
}

/** 학번으로 명단과 맞춘다. 이름은 보지 않는다. */
export function matchByStudentNo<T extends { studentNo: string }>(
  rows: T[],
  roster: Array<{ id: string; student_no: string; name: string }>,
): {
  matched: Array<{ row: T; studentId: string }>;
  unmatched: T[];
  /** 붙여넣기에 한 줄도 안 나온 학생. 미제출 후보다. */
  missing: Array<{ id: string; student_no: string; name: string }>;
} {
  const byNo = new Map(roster.map((s) => [s.student_no.replace(/\s/g, ''), s]));
  const seen = new Set<string>();
  const matched: Array<{ row: T; studentId: string }> = [];
  const unmatched: T[] = [];

  for (const row of rows) {
    const hit = byNo.get(row.studentNo);
    if (!hit) { unmatched.push(row); continue; }
    matched.push({ row, studentId: hit.id });
    seen.add(hit.id);
  }

  return { matched, unmatched, missing: roster.filter((s) => !seen.has(s.id)) };
}
