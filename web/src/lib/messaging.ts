/**
 * 학생에게 알리기 — 문안 만들기와 기기 링크.
 *
 * 이 저장소는 문자를 직접 쏘지 않는다. 헤이영에 공개 API 가 없고,
 * 문자발송 화면이 무엇을 POST 하는지는 추측이기 때문이다 —
 * 잘못 쏘면 199명에게 잘못된 문자가 나간다. 그래서 여기까지만 한다.
 *
 *   · 문안에 이름 · 학번을 끼워 넣는다
 *   · 헤이영 문자발송 화면에 **그대로 붙일 수 있는 모양**으로 번호를 낸다
 *   · 교수 기기의 문자앱 · 메일앱 · 공유 시트를 여는 링크를 만든다
 *
 * 마지막 것이 기기 종류를 가리지 않는 이유는 `sms:` · `mailto:` 가
 * 브라우저 표준이기 때문이다. 아이폰 · 안드로이드 · 아이패드 · 맥에서
 * 각자의 기본 앱이 열린다. 다만 **문자앱만은 iOS 와 안드로이드의
 * 문법이 다르다** — 아래 buildSmsLink 가 그것을 가른다.
 *
 * 네트워크도 DB 도 건드리지 않는 순수 함수만 둔다.
 */

export type SendChannel = 'heyyoung' | 'sms' | 'email' | 'share' | 'copy';

export const CHANNEL_LABEL: Record<SendChannel, string> = {
  heyyoung: '헤이영 문자',
  sms: '기기 문자앱',
  email: '메일',
  share: '공유(카톡 등)',
  copy: '복사',
};

export interface MessagePerson {
  studentId: string;
  studentNo: string;
  name: string;
  phone: string | null;
  email: string | null;
}

// ════════════════════════════════════════════════════════════
//  문안 만들기
// ════════════════════════════════════════════════════════════

/** 문안에 쓸 수 있는 자리표시자. 화면에 그대로 안내로 내건다. */
export const PLACEHOLDERS = ['{이름}', '{학번}', '{과목}', '{날짜}'] as const;

export interface RenderContext {
  name: string;
  studentNo: string;
  course: string;
  date: string;
}

/**
 * 자리표시자를 채운다.
 *
 * 모르는 자리표시자는 **그대로 둔다.** 조용히 지우면 "{연락처}" 같은 오타가
 * 문자에서 사라져 버려, 교수는 잘 나간 줄 알고 이상한 문장을 보내게 된다.
 */
export function renderTemplate(body: string, ctx: RenderContext): string {
  return body
    .replaceAll('{이름}', ctx.name)
    .replaceAll('{학번}', ctx.studentNo)
    .replaceAll('{과목}', ctx.course)
    .replaceAll('{날짜}', ctx.date);
}

/** 문안이 사람마다 달라지는가. 달라지면 한 통으로 못 묶는다. */
export const isPersonalized = (body: string) =>
  PLACEHOLDERS.some((p) => p !== '{과목}' && p !== '{날짜}' && body.includes(p));

/**
 * 문자 길이 셈.
 *
 * SMS 는 한글 45자(90바이트)까지가 단문이고 그 위는 LMS(장문)로 넘어간다.
 * 요금이 달라지므로 교수에게 보여 준다. 정확한 과금은 통신사가 정하지만
 * EUC-KR 기준 바이트 수가 실무에서 쓰는 셈이다 — 한글 2바이트, 나머지 1바이트.
 */
export function smsBytes(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}

/** 90바이트 이하면 단문(SMS), 넘으면 장문(LMS). */
export const smsKind = (text: string): 'SMS' | 'LMS' => (smsBytes(text) <= 90 ? 'SMS' : 'LMS');

// ════════════════════════════════════════════════════════════
//  번호 목록 — 헤이영 문자발송 화면에 붙일 모양
// ════════════════════════════════════════════════════════════

export type PhoneListStyle = 'lines' | 'comma' | 'digits';

export const PHONE_STYLE_LABEL: Record<PhoneListStyle, string> = {
  lines: '한 줄에 하나',
  comma: '쉼표로 이어서',
  digits: '하이픈 없이 한 줄에 하나',
};

/**
 * 번호만 뽑아 한 덩이 글자로 만든다.
 *
 * 헤이영 문자발송 화면이 어느 모양을 받는지는 화면마다 다르다.
 * 그래서 세 가지를 다 내주고 교수가 고르게 한다 — 추측해서 하나로 고정하면
 * 안 붙는 화면에서 손으로 옮겨 적게 된다.
 *
 * 번호가 없는 사람은 조용히 빠진다. 그 수는 화면이 따로 세어 보여 준다.
 */
export function phoneList(people: MessagePerson[], style: PhoneListStyle = 'lines'): string {
  const nums = people.map((p) => p.phone).filter((p): p is string => !!p);
  if (style === 'comma') return nums.join(', ');
  if (style === 'digits') return nums.map((n) => n.replace(/\D/g, '')).join('\n');
  return nums.join('\n');
}

// ════════════════════════════════════════════════════════════
//  기기 링크
// ════════════════════════════════════════════════════════════

/**
 * 애플 기기인가.
 *
 * 아이패드 사파리는 최근 버전에서 자기를 맥이라고 말한다("MacIntel").
 * 그래서 터치 지원 여부까지 함께 본다. 여기서 갈리는 건 문자 링크 문법
 * 하나뿐이라 틀려도 크게 다치지는 않지만, 틀리면 문자앱에 본문이 안 들어간다.
 */
export function isAppleDevice(ua: string, platform = '', maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh|Mac OS X/i.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

/**
 * 문자앱을 여는 링크.
 *
 * iOS 는 `sms:번호&body=...`, 안드로이드는 `sms:번호?body=...` 다.
 * 물음표와 앰퍼샌드가 반대라 하나로 못 쓴다 — 잘못 쓰면 본문이 통째로
 * 사라지거나 번호에 붙어 버린다.
 *
 * 받는 사람이 많으면 기기가 잘라 버린다. 한 번에 몇 명까지 되는지는
 * 기기·통신사마다 달라서 여기서 막지 않고, 화면이 경고만 한다.
 */
export function buildSmsLink(people: MessagePerson[], body: string, apple: boolean): string {
  const nums = people.map((p) => p.phone).filter((p): p is string => !!p).map((n) => n.replace(/\D/g, ''));
  const to = nums.join(',');
  const sep = apple ? '&' : '?';
  return `sms:${to}${body ? `${sep}body=${encodeURIComponent(body)}` : ''}`;
}

/**
 * 메일앱을 여는 링크.
 *
 * 받는 사람은 **전부 숨은참조(BCC)** 로 넣는다. 참조로 넣으면 학생 199명이
 * 서로의 이메일 주소를 보게 된다. 그건 개인정보를 뿌리는 것이다.
 */
export function buildMailtoLink(people: MessagePerson[], subject: string, body: string): string {
  const to = people.map((p) => p.email).filter((e): e is string => !!e).join(',');
  const q = new URLSearchParams();
  if (to) q.set('bcc', to);
  if (subject) q.set('subject', subject);
  if (body) q.set('body', body);
  return `mailto:?${q.toString()}`;
}

/**
 * 구글 메일(웹) 작성 창을 여는 링크.
 *
 * 노트북에서 지메일을 브라우저로 쓰는 경우가 많다. mailto: 는 그럴 때
 * 엉뚱한 메일앱을 열거나 아무것도 안 열린다. 이 링크는 바로 지메일 작성 창을 연다.
 * 여기서도 받는 사람은 숨은참조다.
 */
export function buildGmailLink(people: MessagePerson[], subject: string, body: string): string {
  const to = people.map((p) => p.email).filter((e): e is string => !!e).join(',');
  const q = new URLSearchParams({ view: 'cm', fs: '1' });
  if (to) q.set('bcc', to);
  if (subject) q.set('su', subject);
  if (body) q.set('body', body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** 헤이영 문자발송 화면. 사람이 로그인해서 여는 자리다 — 이쪽이 대신 쏘지 않는다. */
export const HEYYOUNG_SMS_URL = 'https://campus.heyoung.co.kr/admin/screen/HCO0301M01';

// ════════════════════════════════════════════════════════════
//  대상 거르기
// ════════════════════════════════════════════════════════════

export type TargetFilter =
  | 'all'
  | 'has_phone'
  | 'no_phone'
  | 'absent_today'
  | 'late_today'
  | 'unmarked_today'
  | 'absent_many';

export const FILTER_LABEL: Record<TargetFilter, string> = {
  all: '전체',
  has_phone: '번호 있는 사람',
  no_phone: '번호 없는 사람',
  absent_today: '고른 날짜에 결석',
  late_today: '고른 날짜에 지각',
  unmarked_today: '고른 날짜에 미표시',
  absent_many: '누적 결석이 잦은 사람',
};

export interface TargetRow {
  student_id: string;
  student_no: string;
  name: string;
  phone: string | null;
  email: string | null;
  att_status: string | null;
  absent_cnt: number;
  team_name: string | null;
}

/** 거르기 하나를 적용한다. 화면이 아니라 여기서 판단해야 시험할 수 있다. */
export function applyFilter(rows: TargetRow[], filter: TargetFilter, absentMin = 3): TargetRow[] {
  switch (filter) {
    case 'has_phone': return rows.filter((r) => !!r.phone);
    case 'no_phone': return rows.filter((r) => !r.phone);
    case 'absent_today': return rows.filter((r) => r.att_status === 'absent');
    case 'late_today': return rows.filter((r) => r.att_status === 'late' || r.att_status === 'early_leave');
    case 'unmarked_today': return rows.filter((r) => r.att_status === null);
    case 'absent_many': return rows.filter((r) => r.absent_cnt >= absentMin);
    default: return rows;
  }
}
