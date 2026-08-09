/**
 * 헤이영 출석 파일(CSV/TSV) 읽기.
 *
 * 헤이영은 출석 기록을 화면으로 보여주고 엑셀로 내려받게 해 준다. API 가 없으므로
 * 교수가 내려받은 파일을 그대로 올리는 방식이다. 엑셀(.xlsx) 은 브라우저에서 바로 못 읽어
 * "다른 이름으로 저장 → CSV" 를 거친다. 이 파일은 그 CSV 를 읽는 순수 함수만 담는다 —
 * 네트워크도 DB 도 건드리지 않아서 그대로 테스트할 수 있다.
 *
 * 헤이영 화면 구성이 학교마다·버전마다 달라서 머리글 이름을 하나로 못 박지 않고
 * 별칭 목록으로 찾는다. 못 찾은 열은 raw 에 그대로 남겨 두어 나중에 확인할 수 있게 한다.
 */

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '인정결석',
};

export interface HeyYoungRow {
  /** 학번. 명단과 맞추는 유일한 열쇠다. */
  studentNo: string;
  name: string | null;
  /** YYYY-MM-DD. 회차를 찾는 데 쓴다. */
  date: string | null;
  /** 체크인 시각 (HH:MM). 날짜와 합쳐 timestamp 로 만든다. */
  time: string | null;
  status: AttendanceStatus;
  /** 원본 상태 문자열. 매핑이 틀렸을 때 사람이 확인할 수 있게 남긴다. */
  statusRaw: string;
  raw: Record<string, string>;
}

export interface SkippedRow {
  line: number;
  reason: string;
  text: string;
}

export interface HeyYoungParseResult {
  rows: HeyYoungRow[];
  headers: string[];
  skipped: SkippedRow[];
  /** 머리글에서 찾아낸 열 이름. 화면에 보여 주면 사용자가 오인식을 바로 알아챈다. */
  mapping: {
    studentNo: string | null;
    name: string | null;
    date: string | null;
    time: string | null;
    status: string | null;
  };
}

// ── 머리글 별칭 ──────────────────────────────────────────────
// 공백·괄호를 지우고 소문자로 바꾼 뒤 비교한다.
const ALIASES = {
  studentNo: ['학번', '학생번호', '학번호', 'studentno', 'studentid', 'sid', '사번'],
  name: ['이름', '성명', '학생명', 'name', '학생이름'],
  date: ['날짜', '일자', '출석일', '수업일', '출결일자', 'date', '일시'],
  time: ['체크인', '체크인시각', '체크인시간', '입실시간', '입실시각', '출석시각', '시간', 'time'],
  status: ['상태', '출결', '출결상태', '출석상태', '구분', 'status', '출결현황'],
} as const;

const normalizeHeader = (s: string) =>
  s
    .replace(/^﻿/, '')
    .replace(/[\s()[\]{}·.\-_/]/g, '')
    .toLowerCase();

// ── 상태 매핑 ────────────────────────────────────────────────
// 앞쪽이 더 구체적이어야 한다. '인정결석' 을 '결석' 보다 먼저 봐야 하기 때문이다.
const STATUS_RULES: Array<[AttendanceStatus, string[]]> = [
  ['excused', ['인정결석', '공결', '병결', '사유', '출석인정', 'excused', 'exempt']],
  ['late', ['지각', '조퇴', 'late', 'tardy']],
  ['present', ['출석', '정상', '참석', 'present', 'attend', 'ok', 'o']],
  ['absent', ['결석', '미출석', '불참', 'absent', 'x']],
];

/** 헤이영이 쓰는 표기를 우리 상태값으로 옮긴다. 못 알아보면 null. */
export function mapStatus(raw: string): AttendanceStatus | null {
  const v = raw.replace(/\s/g, '').toLowerCase();
  if (!v) return null;
  for (const [status, words] of STATUS_RULES) {
    if (words.some((w) => v.includes(w))) return status;
  }
  return null;
}

/** 2026-08-09 / 2026.8.9 / 2026/08/09 / 20260809 을 모두 YYYY-MM-DD 로 만든다. */
export function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const parts = v.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (parts) {
    const year = parts[1] ?? '';
    const month = (parts[2] ?? '').padStart(2, '0');
    const day = (parts[3] ?? '').padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

/** 09:05 / 9:5 / 오전 9:05 / 오후 1:30 을 HH:MM 으로 만든다. */
export function normalizeTime(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const m = v.match(/(오전|오후|am|pm)?\s*(\d{1,2})\s*[:시]\s*(\d{1,2})/i);
  if (!m) return null;

  const marker = (m[1] ?? '').toLowerCase();
  let hour = Number(m[2]);
  const min = Number(m[3]);
  if (hour > 23 || min > 59) return null;

  if ((marker === '오후' || marker === 'pm') && hour < 12) hour += 12;
  if ((marker === '오전' || marker === 'am') && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ── CSV 읽기 ─────────────────────────────────────────────────
/**
 * 따옴표 안의 쉼표·줄바꿈·이중따옴표를 제대로 처리하는 최소 CSV 파서.
 * 라이브러리를 넣지 않은 이유는 이 파일이 브라우저로 그대로 나가기 때문이다.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const src = text.replace(/^﻿/, '');

  while (i < src.length) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 첫 줄에서 쉼표·탭·세미콜론 중 가장 많이 쓰인 것을 구분자로 본다. */
function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  const counts = [',', '\t', ';'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  const best = counts[0];
  return best && best.n > 0 ? best.d : ',';
}

/**
 * 머리글이 첫 줄이 아닐 수 있다 (헤이영이 위에 제목·기간을 얹어 준다).
 * 학번처럼 보이는 열이 있는 첫 줄을 머리글로 잡는다.
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const cells = rows[i];
    if (!cells) continue;
    const normalized = cells.map(normalizeHeader);
    const hasKey = normalized.some((h) => ALIASES.studentNo.includes(h as never));
    if (hasKey) return i;
  }
  return 0;
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  // 정확히 같은 이름 우선, 없으면 포함 관계로 찾는다.
  const exact = normalized.findIndex((h) => aliases.includes(h as never));
  if (exact >= 0) return exact;
  return normalized.findIndex((h) => h !== '' && aliases.some((a) => h.includes(a)));
}

/**
 * 헤이영 CSV 한 개를 읽어 출결 행 목록으로 만든다.
 *
 * 학번이 없거나 상태를 알아볼 수 없는 줄은 버리지 않고 skipped 에 이유와 함께 남긴다 —
 * 조용히 사라지면 출석이 빠진 걸 아무도 모른 채 성적이 나가기 때문이다.
 */
export function parseHeyYoungCsv(text: string): HeyYoungParseResult {
  const delimiter = detectDelimiter(text);
  const table = parseDelimited(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''));

  if (table.length === 0) {
    return {
      rows: [],
      headers: [],
      skipped: [],
      mapping: { studentNo: null, name: null, date: null, time: null, status: null },
    };
  }

  const headerIdx = findHeaderRow(table);
  const headers = (table[headerIdx] ?? []).map((h) => h.trim());

  const col = {
    studentNo: findColumn(headers, ALIASES.studentNo),
    name: findColumn(headers, ALIASES.name),
    date: findColumn(headers, ALIASES.date),
    time: findColumn(headers, ALIASES.time),
    status: findColumn(headers, ALIASES.status),
  };

  const rows: HeyYoungRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = headerIdx + 1; i < table.length; i += 1) {
    const cells = table[i];
    if (!cells) continue;
    const lineNo = i + 1;
    const text_ = cells.join(delimiter === '\t' ? ' | ' : delimiter);

    const at = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');

    const studentNo = at(col.studentNo).replace(/\s/g, '');
    if (!studentNo) {
      skipped.push({ line: lineNo, reason: '학번 칸이 비어 있음', text: text_ });
      continue;
    }
    if (!/^[0-9A-Za-z-]+$/.test(studentNo)) {
      skipped.push({ line: lineNo, reason: `학번 형식이 아님: ${studentNo}`, text: text_ });
      continue;
    }

    const statusRaw = at(col.status);
    const status = mapStatus(statusRaw);
    if (!status) {
      skipped.push({
        line: lineNo,
        reason: statusRaw ? `알 수 없는 출결 표기: ${statusRaw}` : '출결 칸이 비어 있음',
        text: text_,
      });
      continue;
    }

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = (cells[idx] ?? '').trim();
    });

    rows.push({
      studentNo,
      name: at(col.name) || null,
      date: normalizeDate(at(col.date)),
      time: normalizeTime(at(col.time)),
      status,
      statusRaw,
      raw,
    });
  }

  return {
    rows,
    headers,
    skipped,
    mapping: {
      studentNo: headers[col.studentNo] ?? null,
      name: headers[col.name] ?? null,
      date: headers[col.date] ?? null,
      time: headers[col.time] ?? null,
      status: headers[col.status] ?? null,
    },
  };
}

// ── 명단 대조 ────────────────────────────────────────────────
export interface RosterEntry {
  id: string;
  student_no: string;
  name: string;
}

export interface MatchResult {
  matched: Array<{ row: HeyYoungRow; studentId: string }>;
  /** 명단에 없는 학번. 청강생이거나 학번을 잘못 적은 경우다. */
  unmatched: HeyYoungRow[];
  /** 파일에 한 줄도 안 나온 학생. 결석 처리 후보다. */
  missing: RosterEntry[];
}

/**
 * 파일의 행을 수업 명단과 맞춘다.
 * 학번만 본다 — 이름은 동명이인·개명 때문에 열쇠로 쓰지 않는다.
 */
export function matchRoster(rows: HeyYoungRow[], roster: RosterEntry[]): MatchResult {
  const byNo = new Map(roster.map((s) => [s.student_no.replace(/\s/g, ''), s]));
  const seen = new Set<string>();

  const matched: MatchResult['matched'] = [];
  const unmatched: HeyYoungRow[] = [];

  for (const row of rows) {
    const hit = byNo.get(row.studentNo);
    if (hit) {
      matched.push({ row, studentId: hit.id });
      seen.add(hit.id);
    } else {
      unmatched.push(row);
    }
  }

  return { matched, unmatched, missing: roster.filter((s) => !seen.has(s.id)) };
}

// ════════════════════════════════════════════════════════════
//  헤이영 "강좌별 출석관리" 출석부 — 가로형 행렬
//
//  실제 화면(/admin/screen/HCO0301M01)은 학생 한 명이 한 행이고
//  주차마다 교시 열이 붙는다. 위쪽에 머리글이 여러 줄 겹쳐 있다.
//
//    순번 | 학과 | 학년 | 학번 | 성명 | 주  | 1주    | 2주    | …
//                                      월  | 03 03  | 03 03  | …
//                                      일  | 09 09  | 16 16  | …
//                                      요일| 월 월  | 월 월  | …
//                                      교시| 03 04  | 03 04  | …
//
//  범례 (2026-08-10 에 화면에서 그대로 확인)
//    - 미정 · O 출석 · ◎ 유고결석 · △ 지각 · X 결석 · □ 조퇴
//  ※ ◎ 는 출석이 아니라 **유고결석**이다. 뒤집으면 유고결석이 출석이 된다.
// ════════════════════════════════════════════════════════════

export type MatrixStatus = AttendanceStatus | 'early_leave';

export const MATRIX_SYMBOL: Record<string, MatrixStatus> = {
  O: 'present',
  o: 'present',
  '○': 'present',   // ○
  '◯': 'present',   // ◯
  '◎': 'excused',   // ◎
  '◉': 'excused',   // ◉
  '△': 'late',      // △
  '▲': 'late',      // ▲
  X: 'absent',
  x: 'absent',
  '✕': 'absent',    // ✕
  '×': 'absent',    // ×
  '□': 'early_leave', // □
  '■': 'early_leave', // ■
};

export interface MatrixCell {
  /** 1부터. 머리글의 "N주" 에서 읽는다. */
  week: number;
  /** 그 주차 안에서 몇 번째 교시인지. 1부터. */
  session: number;
  status: MatrixStatus;
  /** 머리글의 월·일로 만든 날짜. 알 수 없으면 null. */
  date: string | null;
  symbol: string;
}

export interface MatrixStudent {
  studentNo: string;
  name: string | null;
  cells: MatrixCell[];
}

export interface MatrixParseResult {
  students: MatrixStudent[];
  /** 열 하나가 어떤 주차·교시·날짜인지. 화면에 보여 주면 오인식을 바로 알아챈다. */
  columns: Array<{ week: number; session: number; date: string | null }>;
  skipped: SkippedRow[];
  /** 뜻을 모르는 기호와 등장 횟수. 비어 있지 않으면 사람이 확인해야 한다. */
  unknownSymbols: Record<string, number>;
}

/** 병합된 칸은 내보내기에서 빈 칸이 되므로 왼쪽 값을 이어서 채운다. */
function forwardFill(cells: string[]): string[] {
  const out: string[] = [];
  let last = '';
  for (const c of cells) {
    const v = (c ?? '').trim();
    if (v) last = v;
    out.push(last);
  }
  return out;
}

/**
 * 헤이영 출석부(CSV/TSV)를 읽는다.
 *
 * 머리글이 몇 줄인지, 병합이 어떻게 풀리는지가 내보내기 설정에 따라 달라져서
 * 줄 번호를 못 박지 않는다. "학번" 이 있는 줄을 기준으로 잡고
 * 그 언저리에서 주 / 월 / 일 줄을 이름으로 찾는다.
 */
export function parseHeyYoungMatrix(text: string, year?: number): MatrixParseResult {
  const delimiter = detectDelimiter(text);
  const table = parseDelimited(text, delimiter);
  const skipped: SkippedRow[] = [];
  const unknownSymbols: Record<string, number> = {};

  const headerIdx = table.findIndex((r) => r.some((c) => normalizeHeader(c) === '학번'));
  if (headerIdx < 0) return { students: [], columns: [], skipped, unknownSymbols };

  const header = table[headerIdx] ?? [];
  const noCol = header.findIndex((c) => normalizeHeader(c) === '학번');
  const nameCol = header.findIndex((c) => ['성명', '이름'].includes(normalizeHeader(c)));

  // 학번·성명 오른쪽에 주 / 월 / 일 / 요일 / 교시 라벨만 담긴 열이 하나 더 있다.
  // 그 열까지가 머리글이고 **그 다음 열부터** 출결 칸이다.
  // 이걸 놓치면 열이 한 칸씩 밀려 1주차가 통째로 사라진다.
  const LABELS = ['주', '주차', '월', '일', '요일', '교시'];
  const searchFrom = Math.max(0, headerIdx - 4);
  const searchTo = Math.min(table.length, headerIdx + 8);
  const afterName = Math.max(noCol, nameCol) + 1;

  let labelCol = -1;
  for (let c = afterName; c < afterName + 3 && labelCol < 0; c += 1) {
    for (let i = searchFrom; i < searchTo; i += 1) {
      if (LABELS.includes(normalizeHeader(table[i]?.[c] ?? ''))) { labelCol = c; break; }
    }
  }

  const firstDataCol = labelCol >= 0 ? labelCol + 1 : afterName;

  /** 머리글 언저리에서 라벨로 줄을 찾는다. */
  const findRow = (labels: string[]): string[] | null => {
    for (let i = searchFrom; i < searchTo; i += 1) {
      const row = table[i];
      if (!row) continue;
      if (row.slice(0, firstDataCol).some((c) => labels.includes(normalizeHeader(c)))) return row;
    }
    return null;
  };

  const weekRow = findRow(['주', '주차']);
  const monthRow = findRow(['월']);
  const dayRow = findRow(['일']);

  const width = Math.max(...table.map((r) => r.length));
  const weeks = forwardFill((weekRow ?? []).slice(firstDataCol, width));
  const months = forwardFill((monthRow ?? []).slice(firstDataCol, width));
  const days = forwardFill((dayRow ?? []).slice(firstDataCol, width));

  // 열마다 주차·교시를 매긴다. 같은 주차가 이어지면 교시를 1, 2 … 로 센다.
  const columns: MatrixParseResult['columns'] = [];
  let prevWeek = -1;
  let sessionNo = 0;
  for (let i = 0; i < weeks.length; i += 1) {
    const m = (weeks[i] ?? '').match(/(\d{1,2})\s*주/);
    if (!m) {
      columns.push({ week: 0, session: 0, date: null });
      continue;
    }
    const week = Number(m[1]);
    if (week !== prevWeek) {
      prevWeek = week;
      sessionNo = 1;
    } else {
      sessionNo += 1;
    }

    const mm = (months[i] ?? '').match(/\d{1,2}/)?.[0];
    const dd = (days[i] ?? '').match(/\d{1,2}/)?.[0];
    const y = year ?? new Date().getFullYear();
    const date = mm && dd ? `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : null;

    columns.push({ week, session: sessionNo, date });
  }

  const students: MatrixStudent[] = [];
  for (let r = headerIdx + 1; r < table.length; r += 1) {
    const row = table[r];
    if (!row) continue;
    const studentNo = (row[noCol] ?? '').trim().replace(/\s/g, '');
    if (!studentNo) {
      // 합계·구분선 같은 줄은 그냥 넘긴다. 다만 출결 기호가 들어 있는데 학번이
      // 비어 있다면 진짜 데이터가 사라지는 것이므로 반드시 알린다.
      const hasSymbols = row.slice(firstDataCol).some((c) => MATRIX_SYMBOL[(c ?? '').trim()]);
      if (hasSymbols) {
        skipped.push({
          line: r + 1,
          reason: '출결 기호가 있는데 학번 칸이 비어 있음',
          text: row.join(',').slice(0, 80),
        });
      }
      continue;
    }
    if (!/^[0-9A-Za-z-]+$/.test(studentNo)) {
      skipped.push({ line: r + 1, reason: `학번 형식이 아님: ${studentNo}`, text: row.join(',').slice(0, 80) });
      continue;
    }

    const cells: MatrixCell[] = [];
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      if (!col || col.week === 0) continue;
      const symbol = (row[firstDataCol + i] ?? '').trim();
      if (!symbol || symbol === '-') continue; // 미정은 넣지 않는다
      const status = MATRIX_SYMBOL[symbol];
      if (!status) {
        unknownSymbols[symbol] = (unknownSymbols[symbol] ?? 0) + 1;
        continue;
      }
      cells.push({ week: col.week, session: col.session, status, date: col.date, symbol });
    }

    students.push({
      studentNo,
      name: nameCol >= 0 ? (row[nameCol] ?? '').trim() || null : null,
      cells,
    });
  }

  return { students, columns: columns.filter((c) => c.week > 0), skipped, unknownSymbols };
}

// ── 이의신청 / 유고결석 목록 ─────────────────────────────────
export interface RequestRow {
  /** '50035-Y1' — 교과목명 뒤 괄호에서 꺼낸다. */
  courseCode: string | null;
  week: number | null;
  session: number | null;
  original: string | null; // 출석구분 — 결석 · 지각 …
  reason: string | null;   // 유고결석의 사유구분 — 단순질병 · 수강정정 …
  applicant: string | null;
  appliedAt: string | null;
  resultRaw: string | null;
  /** 처리여부 괄호 안의 결과. '답변완료( 출석 )' → present */
  result: MatrixStatus | 'pending' | null;
}

/**
 * 출결이의신청(/screen/HAP0602M01) · 유고결석(/screen/HAP0604M01) 목록을 읽는다.
 * 두 화면은 '사유구분' 열이 있고 없고만 다르다.
 */
export function parseHeyYoungRequests(text: string): { rows: RequestRow[]; skipped: SkippedRow[] } {
  const delimiter = detectDelimiter(text);
  const table = parseDelimited(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  const skipped: SkippedRow[] = [];

  const headerIdx = table.findIndex((r) => r.some((c) => normalizeHeader(c).includes('교과목명')));
  if (headerIdx < 0) return { rows: [], skipped };

  const header = (table[headerIdx] ?? []).map(normalizeHeader);
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const cSubject = col('교과목명');
  const cDate = col('출석일자');
  const cKind = col('출석구분');
  const cReason = col('사유구분');
  const cWho = col('신청자');
  const cWhen = col('신청일시');
  const cResult = col('처리여부');

  const rows: RequestRow[] = [];
  for (let i = headerIdx + 1; i < table.length; i += 1) {
    const r = table[i];
    if (!r) continue;
    const at = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '');

    const subject = at(cSubject);
    if (!subject) continue;

    // '문화예술콘텐츠창업(60716-Y5)' 에서 과목코드만 꺼낸다
    const codeMatch = subject.match(/\(([0-9]{4,6}-[A-Za-z0-9]+)\)/);
    // '14주차 2번째' → week 14, session 2
    const dm = at(cDate).match(/(\d{1,2})\s*주차\s*(\d{1,2})?/);

    const resultRaw = at(cResult);
    const inParens = resultRaw.match(/\(([^)]*)\)/)?.[1]?.trim() ?? '';
    let result: RequestRow['result'] = null;
    if (inParens) {
      result = mapStatus(inParens) ?? (inParens.includes('조퇴') ? 'early_leave' : null);
    }
    if (!result && /접수|대기|처리중/.test(resultRaw)) result = 'pending';

    rows.push({
      courseCode: codeMatch?.[1] ?? null,
      week: dm?.[1] ? Number(dm[1]) : null,
      session: dm?.[2] ? Number(dm[2]) : null,
      original: at(cKind) || null,
      reason: at(cReason) || null,
      applicant: at(cWho) || null,
      appliedAt: at(cWhen) || null,
      resultRaw: resultRaw || null,
      result,
    });
  }

  return { rows, skipped };
}
