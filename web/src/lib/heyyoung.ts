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
