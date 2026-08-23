/**
 * 전화번호 읽기 · 정규화.
 *
 * 왜 따로 있나 —
 * 헤이영은 명단 화면에서 번호를 **가려서** 보여 준다. 010-****-5678 처럼.
 * 이름을 눌러 마스킹을 풀어야 실제 번호가 나온다. 그런데 목록을 그대로
 * 엑셀로 내려받으면 **가려진 채로** 내려온다.
 *
 * 그 값을 그냥 저장하면 최악이다 — 화면에는 "번호 있음" 으로 보이는데
 * 실제로는 걸 수 없다. 급한 일로 학생에게 연락해야 할 때 그제서야 안다.
 * 그래서 가려진 값은 **저장하지 않고 몇 명인지 알려 준다.**
 * DB 의 student_contacts_phone_shape CHECK 가 같은 것을 한 번 더 막는다.
 *
 * 네트워크도 DB 도 건드리지 않는 순수 함수만 둔다. 그대로 검사할 수 있다.
 */

export type PhoneFail = 'empty' | 'masked' | 'shape';

export type PhoneResult =
  | { ok: true; phone: string }
  | { ok: false; reason: PhoneFail; raw: string };

export const PHONE_FAIL_LABEL: Record<PhoneFail, string> = {
  empty: '비어 있음',
  masked: '가려진 번호 (마스킹 해제 필요)',
  shape: '번호 형식이 아님',
};

/**
 * 마스킹에 쓰이는 글자.
 *
 * 헤이영은 별표를 쓰지만 학교·버전마다 다르다. 실제로 본 것과, 같은
 * 자리에 흔히 쓰는 것을 함께 넣었다. 하나라도 있으면 가려진 값으로 본다.
 */
const MASK_CHARS = /[*＊xX·•●○#○♦◆■□]/;

/** 유니코드 붙임표 · 전각 숫자를 보통 글자로 되돌린다. 엑셀이 자주 섞어 준다. */
function toAscii(raw: string): string {
  return raw
    .replace(/[‐-―−﹘﹣－]/g, '-') // ‐ ‑ ‒ – — − ﹘ ﹣ －
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); // ０-９
}

/**
 * 번호 한 개를 010-1234-5678 꼴로 만든다.
 *
 * 받는 모양
 *   01012345678 · 010-1234-5678 · 010 1234 5678 · 010.1234.5678
 *   +82 10-1234-5678 · +8210-1234-5678   (국가번호는 0 으로 되돌린다)
 *   011-123-4567 (옛 번호) · 02-123-4567 · 031-1234-5678 (유선)
 *
 * 되돌려주지 않는 모양
 *   가려진 번호 → reason 'masked'
 *   그 밖에     → reason 'shape'
 */
export function normalizePhone(raw: string): PhoneResult {
  const src = toAscii(String(raw ?? '')).trim();
  if (!src) return { ok: false, reason: 'empty', raw };

  // 가려진 값을 먼저 본다. 별표를 지우고 나면 "숫자가 모자란다" 로만 보여
  // 진짜 이유가 사라지기 때문이다.
  if (MASK_CHARS.test(src)) return { ok: false, reason: 'masked', raw };

  // 국가번호. +82 10… / 0082-10… 둘 다 0 으로 되돌린다.
  const intl = src.replace(/^\+?0{0,2}82[-\s.]?/, '0');
  const withLead = /^0/.test(intl) ? intl : `0${intl}`;

  const digits = withLead.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'shape', raw };
  if (!/^0/.test(digits)) return { ok: false, reason: 'shape', raw };

  // 휴대전화 — 010 은 11자리, 011/016/017/018/019 는 10 또는 11자리.
  if (/^01[016789]/.test(digits)) {
    if (digits.length === 11) return { ok: true, phone: `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` };
    if (digits.length === 10) return { ok: true, phone: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` };
    return { ok: false, reason: 'shape', raw };
  }

  // 서울 — 02 는 지역번호가 두 자리다.
  if (digits.startsWith('02')) {
    if (digits.length === 10) return { ok: true, phone: `02-${digits.slice(2, 6)}-${digits.slice(6)}` };
    if (digits.length === 9) return { ok: true, phone: `02-${digits.slice(2, 5)}-${digits.slice(5)}` };
    return { ok: false, reason: 'shape', raw };
  }

  // 그 밖의 지역번호 · 070 등 — 세 자리.
  if (digits.length === 11) return { ok: true, phone: `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` };
  if (digits.length === 10) return { ok: true, phone: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` };

  return { ok: false, reason: 'shape', raw };
}

/**
 * 이 칸이 전화번호 자리인가.
 *
 * 명단 붙여넣기에서 쓴다. **학번과 갈라내는 것이 목적이다** —
 * findStudentNo 는 "6~12자리 숫자" 를 학번으로 보는데, 붙임표 없는
 * 휴대전화(01012345678)도 11자리 숫자다. 열 순서가 "이름 휴대폰 학번" 인
 * 파일에서는 전화번호가 학번으로 뽑혀 명단이 통째로 어긋난다.
 *
 * 그래서 여기서는 **휴대전화 모양만** 참으로 본다. 유선번호까지 받으면
 * 학번(9자리, 20…/19… 로 시작)과 겹칠 여지가 생긴다.
 * 가려진 값도 참이다 — 전화번호 자리인 것은 맞고, 저장만 안 한다.
 */
export function isPhoneCell(cell: string): boolean {
  const v = toAscii(String(cell ?? '')).trim();
  if (!v) return false;

  if (MASK_CHARS.test(v)) {
    // 가려져 있어도 "01" 로 시작하고 숫자·마스킹만으로 이뤄져야 한다.
    return /^(\+?82[-\s.]?)?0?1[016789][-\s.]?[0-9*＊xX·•●○#♦◆■□]{2,4}[-\s.]?[0-9*＊xX·•●○#♦◆■□]{4}$/.test(v);
  }

  const digits = v.replace(/^\+?0{0,2}82[-\s.]?/, '0').replace(/\D/g, '');
  if (!/^01[016789]/.test(digits)) return false;
  return digits.length === 10 || digits.length === 11;
}
