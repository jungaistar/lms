/**
 * 헤이영 수강생 명단에서 전화번호 읽기.
 *
 * 헤이영(campus.heyoung.co.kr)에는 공개 API 가 없다. 그래서 두 길로 받는다.
 *
 *  ① 강좌별 출석관리 → 교과목명 → **엑셀다운**
 *       학번 · 성명 · 학과 · 학년 · 연락처 가 한 줄에 들어 있다.
 *       다만 **연락처가 마스킹된 채로 나온다** — 010-****-5678 꼴이다.
 *
 *  ② 화면에서 학생 이름을 눌러 **마스킹 해제**한 뒤 그 줄을 긁어 붙여넣기
 *       한 명씩 풀어야 하므로 여러 줄을 모아 붙여넣는 길도 열어 둔다.
 *
 * 그래서 이 파일이 하는 일은 셋이다.
 *   · 어느 칸이 전화번호인지 생김새로 찾는다 (머리글 이름에만 기대지 않는다)
 *   · 마스킹된 번호를 **마스킹됐다고 표시만 하고 번호로는 안 받는다**
 *   · 엑셀이 갉아먹은 앞자리 0 을 되살린다
 *
 * 네트워크도 DB 도 건드리지 않는 순수 함수만 둔다. 그대로 시험할 수 있다.
 */

import { splitCells, findStudentNo } from './extTasks';

export interface ContactRow {
  /** 학번. 명단과 맞추는 유일한 열쇠다. */
  studentNo: string;
  name: string | null;
  /**
   * 정규화한 번호 (010-1234-5678). 마스킹된 줄은 null 이다 —
   * 걸 수 없는 번호를 저장해 두면 나중에 "번호가 있다" 고 착각하게 된다.
   */
  phone: string | null;
  /** 파일·화면에 있던 원문. 마스킹된 것도 그대로 남긴다. */
  phoneRaw: string | null;
  masked: boolean;
  /** 보호자 · 비상 연락처. 헤이영에 있으면 받고 없으면 null. */
  guardianPhone: string | null;
}

export interface SkippedContact {
  line: number;
  reason: string;
  text: string;
}

export interface ContactParseResult {
  rows: ContactRow[];
  skipped: SkippedContact[];
  /** 마스킹된 채로 들어온 줄 수. 화면에서 "아직 N명 남았습니다" 로 쓴다. */
  maskedCount: number;
  /** 머리글에서 찾아낸 열 이름. 오인식을 사람이 바로 알아채게 보여 준다. */
  mapping: {
    studentNo: string | null;
    name: string | null;
    phone: string | null;
    guardianPhone: string | null;
  };
}

// ── 머리글 별칭 ──────────────────────────────────────────────
// 공백·괄호·기호를 지우고 소문자로 바꾼 뒤 비교한다.
const ALIASES = {
  studentNo: ['학번', '학생번호', '학번호', 'studentno', 'studentid', 'sid'],
  name: ['이름', '성명', '학생명', '학생이름', 'name'],
  phone: [
    '연락처', '전화번호', '휴대전화', '휴대폰', '핸드폰', '휴대폰번호',
    '전화', '학생연락처', '본인연락처', 'phone', 'mobile', 'tel', 'hp',
  ],
  guardianPhone: [
    '보호자연락처', '보호자전화', '보호자', '학부모연락처', '학부모', '비상연락처',
    'guardian', 'emergency',
  ],
} as const;

const normalizeHeader = (s: string) =>
  s.replace(/^﻿/, '').replace(/[\s()[\]{}·.\-_/]/g, '').toLowerCase();

/**
 * 학과처럼 생긴 칸. `roster.ts` 와 같은 규칙이다.
 *
 * 이게 없으면 **학과가 이름 자리에 들어간다.** 2026-08-23 에 헤이영
 * 푸시 `수신자 추가` 표(이름 · 학번/교번 · 학과 · 학년 · 전화번호)를
 * 붙여넣어 보고 알았다 — 이름이 마스킹돼 있으면(`이*현`) 이름 칸을
 * 버리고 학번 다음 칸인 **학과**를 이름으로 집었다.
 */
const DEPT = /^[가-힣A-Za-z0-9()\-·[\]]{1,}(과|계열|학부|전공)$/;

/** 학년 칸. "3" 도 "3학년" 도 이름이 아니다. */
const GRADE_CELL = /^[1-6]\s*(학년)?$/;

/**
 * 마스킹된 이름도 이름으로 본다 — `이*현` · `오**`.
 *
 * 마스킹된 이름은 DB 에 쓰지 않는다(`save_student_contacts()` 는 이름을
 * 건드리지 않는다). 그래도 화면에는 보여 준다. 교수가 명단과 눈으로
 * 맞춰 볼 때 학과보다는 `이*현` 이 훨씬 쓸모 있다.
 */
const NAME_CELL = /^[가-힣A-Za-z][가-힣A-Za-z\s*●✱]{1,19}$/;

const looksLikeContactName = (c: string | undefined): c is string =>
  !!c && NAME_CELL.test(c.trim()) && !DEPT.test(c.trim()) && !GRADE_CELL.test(c.trim());

/**
 * 이름 고르기.
 *
 * 머리글이 이름 칸을 짚어 주면 그 칸을 **그대로** 쓴다 (마스킹돼 있어도).
 * 머리글이 없으면 학번 뒤 → 앞 순서로 훑되 학과 · 학년 칸은 건너뛴다.
 */
function pickContactName(cells: string[], studentNo: string | null, nameAt: number): string | null {
  if (nameAt >= 0) {
    const c = (cells[nameAt] ?? '').trim();
    if (c && !DEPT.test(c) && !GRADE_CELL.test(c)) return c;
  }
  const at = studentNo ? cells.indexOf(studentNo) : -1;
  if (at >= 0) {
    for (let i = at + 1; i < cells.length; i += 1) {
      const c = (cells[i] ?? '').trim();
      if (looksLikeContactName(c)) return c;
    }
    for (let i = at - 1; i >= 0; i -= 1) {
      const c = (cells[i] ?? '').trim();
      if (looksLikeContactName(c)) return c;
    }
    return null;
  }
  return cells.map((c) => (c ?? '').trim()).find(looksLikeContactName) ?? null;
}

/**
 * 마스킹 기호.
 *
 * 헤이영은 * 를 쓰지만 화면을 긁어 오면 ● 나 ✱ 가 섞이는 일이 있다.
 * 하나라도 들어 있으면 마스킹된 것으로 본다.
 */
const MASK_CHARS = /[*✱●○◦·xX＊]/;

/** 번호로 볼 만한 칸인가. 숫자가 최소 7개는 있어야 한다. */
const looksLikePhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  // 학번(9자리 숫자만)과 헷갈리면 안 된다. 구분자나 마스킹 기호가 있거나,
  // 0 또는 +82 로 시작해야 번호로 본다.
  if (/^\d+$/.test(v.trim())) return /^0/.test(v.trim()) || /^1[01]\d{8}$/.test(v.trim());
  return /[-.\s+()]/.test(v) || MASK_CHARS.test(v);
};

/**
 * 번호를 010-1234-5678 꼴로 다시 짠다. 못 알아보면 null.
 *
 * 엑셀이 갉아먹은 앞자리 0 을 되살리는 자리이기도 하다 —
 * 연락처 열을 '숫자' 서식으로 저장하면 01012345678 이 1012345678 로 줄어든다.
 * 실제로 엑셀다운을 CSV 로 다시 저장하면 늘 이렇게 나온다.
 */
export function normalizePhone(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;

  // 국가번호 +82 / 0082 → 0
  v = v.replace(/^\+?82[-.\s]*/, '0').replace(/^0082[-.\s]*/, '0');

  const d = v.replace(/\D/g, '');
  if (!d) return null;

  // 앞자리 0 이 떨어진 휴대폰 번호를 되살린다.
  //   1012345678(10자리) → 01012345678
  //   1112345678 · 1612345678 … (011·016·017·018·019)
  const restored = /^1[016789]\d{8}$/.test(d) ? `0${d}` : d;

  // 휴대폰 11자리 — 010-1234-5678
  if (/^01[016789]\d{8}$/.test(restored)) {
    return `${restored.slice(0, 3)}-${restored.slice(3, 7)}-${restored.slice(7)}`;
  }
  // 옛 휴대폰 10자리 — 011-234-5678
  if (/^01[16789]\d{7}$/.test(restored)) {
    return `${restored.slice(0, 3)}-${restored.slice(3, 6)}-${restored.slice(6)}`;
  }
  // 서울 지역번호 02
  if (/^02\d{7,8}$/.test(restored)) {
    const rest = restored.slice(2);
    return `02-${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  // 그 밖의 지역번호 (031 · 051 …)
  if (/^0\d{9,10}$/.test(restored)) {
    const rest = restored.slice(3);
    return `${restored.slice(0, 3)}-${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return null;
}

/** 마스킹된 번호인가. 010-****-5678 · 010-12**-**78 둘 다 잡는다. */
export const isMasked = (raw: string) => MASK_CHARS.test(raw);

/**
 * 번호 칸 하나를 읽는다.
 *
 * 마스킹된 줄은 **번호로 받지 않는다.** 원문만 남겨 두고 masked 를 세운다.
 * 그래야 화면이 "아직 N명은 마스킹 해제를 안 했습니다" 라고 말해 줄 수 있다.
 */
export function readPhoneCell(raw: string): { phone: string | null; phoneRaw: string | null; masked: boolean } {
  const v = raw.trim();
  if (!v) return { phone: null, phoneRaw: null, masked: false };
  if (isMasked(v)) return { phone: null, phoneRaw: v, masked: true };
  return { phone: normalizePhone(v), phoneRaw: v, masked: false };
}

// ════════════════════════════════════════════════════════════
//  파일 / 붙여넣기 읽기
// ════════════════════════════════════════════════════════════

/**
 * 머리글이 있는 표(헤이영 엑셀다운)와 머리글 없는 붙여넣기를 **같은 함수로** 읽는다.
 *
 * 머리글을 찾으면 열 이름으로 고르고, 못 찾으면 칸의 생김새로 고른다.
 * 헤이영 화면 구성이 버전마다 달라서 열 위치를 세면 곧 깨지기 때문이다.
 */
export function parseContacts(text: string): ContactParseResult {
  const rows: ContactRow[] = [];
  const skipped: SkippedContact[] = [];
  const mapping: ContactParseResult['mapping'] = {
    studentNo: null, name: null, phone: null, guardianPhone: null,
  };

  const lines = text.split(/\r?\n/);

  // ── 머리글 찾기 ──────────────────────────────────────────
  // 학번 열과 연락처 열이 함께 있는 첫 줄을 머리글로 본다.
  let headerAt = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 20); i += 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCells(line);
    const norm = cells.map(normalizeHeader);
    const hasNo = norm.some((h) => ALIASES.studentNo.some((a) => h === a || h.includes(a)));
    const hasPhone = norm.some((h) => ALIASES.phone.some((a) => h === a || h.includes(a)));
    if (hasNo && hasPhone) { headerAt = i; headers = cells; break; }
  }

  const col = (key: keyof typeof ALIASES): number => {
    if (headerAt < 0) return -1;
    const norm = headers.map(normalizeHeader);
    // 보호자 열이 '연락처' 를 품고 있어서, 정확히 맞는 것을 먼저 본다.
    const exact = norm.findIndex((h) => ALIASES[key].some((a) => h === a));
    if (exact >= 0) return exact;
    return norm.findIndex((h) => ALIASES[key].some((a) => h.includes(a)));
  };

  const noAt = col('studentNo');
  const nameAt = col('name');
  let phoneAt = col('phone');
  const guardAt = col('guardianPhone');

  // '연락처' 한 낱말이 보호자 열에도 걸려 같은 칸을 가리키면 학생 열을 다시 찾는다.
  if (phoneAt >= 0 && phoneAt === guardAt) {
    const norm = headers.map(normalizeHeader);
    phoneAt = norm.findIndex(
      (h, i) => i !== guardAt && ALIASES.phone.some((a) => h.includes(a)),
    );
  }

  if (headerAt >= 0) {
    mapping.studentNo = noAt >= 0 ? (headers[noAt] ?? null) : null;
    mapping.name = nameAt >= 0 ? (headers[nameAt] ?? null) : null;
    mapping.phone = phoneAt >= 0 ? (headers[phoneAt] ?? null) : null;
    mapping.guardianPhone = guardAt >= 0 ? (headers[guardAt] ?? null) : null;
  }

  const seen = new Set<string>();

  for (let i = headerAt + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const line = raw.trim();
    const cells = splitCells(line).map((c) => c.replace(/^["']|["']$/g, '').trim());

    // 학번 — 머리글이 있으면 그 칸을, 없으면 생김새로.
    const fromCol = noAt >= 0 ? (cells[noAt] ?? '').replace(/\s/g, '') : '';
    const studentNo = /^\d{6,12}$/.test(fromCol) ? fromCol : findStudentNo(cells);
    if (!studentNo) {
      skipped.push({ line: i + 1, reason: '학번을 못 찾음', text: line.slice(0, 80) });
      continue;
    }
    const no = studentNo.replace(/\s/g, '');
    if (seen.has(no)) {
      skipped.push({ line: i + 1, reason: `학번 ${no} 이 앞줄에 이미 나옴`, text: line.slice(0, 80) });
      continue;
    }

    // 이름 — 없어도 넘어간다. 맞추는 열쇠는 학번이다.
    // 학과를 이름으로 집지 않는 것이 요점이다 (pickContactName 주석 참고).
    const name = pickContactName(cells, studentNo, nameAt);

    // 전화번호 — 머리글이 있으면 그 칸을, 없으면 번호처럼 생긴 칸 중 학번이 아닌 것.
    const phoneCell =
      phoneAt >= 0 && (cells[phoneAt] ?? '').trim()
        ? (cells[phoneAt] ?? '').trim()
        : cells.find((c, idx) => idx !== cells.indexOf(studentNo) && looksLikePhone(c)) ?? '';

    const read = readPhoneCell(phoneCell);

    // 번호 칸은 있는데 읽지 못한 경우는 알려 준다. 조용히 버리면
    // 교수는 다 들어간 줄 알고 넘어간다.
    if (phoneCell && !read.masked && !read.phone) {
      skipped.push({
        line: i + 1,
        reason: `전화번호를 못 읽음 — "${phoneCell}"`,
        text: line.slice(0, 80),
      });
    }

    const guardCell = guardAt >= 0 ? (cells[guardAt] ?? '').trim() : '';
    const guard = guardCell && !isMasked(guardCell) ? normalizePhone(guardCell) : null;

    seen.add(no);
    rows.push({
      studentNo: no,
      name,
      phone: read.phone,
      phoneRaw: read.phoneRaw,
      masked: read.masked,
      guardianPhone: guard,
    });
  }

  return { rows, skipped, maskedCount: rows.filter((r) => r.masked).length, mapping };
}

// ════════════════════════════════════════════════════════════
//  명단 대조
// ════════════════════════════════════════════════════════════

export interface ContactRosterEntry {
  id: string;
  student_no: string;
  name: string;
}

export interface ContactMatchResult {
  matched: Array<{ row: ContactRow; studentId: string; rosterName: string }>;
  /** 명단에 없는 학번. 다른 분반 파일을 올린 경우가 대부분이다. */
  unmatched: ContactRow[];
  /** 파일에 안 나온 명단 학생. 빠진 사람이 있는지 보여 준다. */
  missing: ContactRosterEntry[];
  /**
   * 학번은 맞는데 이름이 다른 줄.
   *
   * 막지는 않는다 — 헤이영과 학교 LMS 의 표기가 다른 경우가 실제로 있다
   * (공백 · 한자 이름). 다만 다른 과목 파일을 잘못 올린 신호이기도 해서
   * 적재 전에 눈으로 보게 한다.
   */
  nameMismatch: Array<{ row: ContactRow; rosterName: string }>;
}

const squash = (s: string) => s.replace(/\s/g, '');

/** 파일에서 읽은 줄을 명단과 맞춘다. 맞추는 열쇠는 학번뿐이다. */
export function matchContacts(rows: ContactRow[], roster: ContactRosterEntry[]): ContactMatchResult {
  const byNo = new Map(roster.map((r) => [squash(r.student_no), r]));

  const matched: ContactMatchResult['matched'] = [];
  const unmatched: ContactRow[] = [];
  const nameMismatch: ContactMatchResult['nameMismatch'] = [];
  const hit = new Set<string>();

  for (const row of rows) {
    const found = byNo.get(squash(row.studentNo));
    if (!found) { unmatched.push(row); continue; }
    hit.add(found.id);
    matched.push({ row, studentId: found.id, rosterName: found.name });
    if (row.name && squash(row.name) !== squash(found.name)) {
      nameMismatch.push({ row, rosterName: found.name });
    }
  }

  return {
    matched,
    unmatched,
    missing: roster.filter((r) => !hit.has(r.id)),
    nameMismatch,
  };
}
