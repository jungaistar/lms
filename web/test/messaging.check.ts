/**
 * 문자 · 알림 만들기 점검.
 *
 * 여기서 틀리면 학생 199명에게 잘못된 것이 나간다. 그래서 눈으로 보기 전에
 * 글자로 확인한다.
 *
 *   · iOS 와 안드로이드는 `sms:` 문법이 **반대**다. 틀리면 본문이 사라진다
 *   · 메일 받는 사람은 **반드시 숨은참조(BCC)** 여야 한다. 참조로 나가면
 *     학생끼리 서로의 이메일 주소를 보게 된다
 *   · 번호 없는 사람이 조용히 섞여 들어가면 안 된다
 *   · 모르는 자리표시자를 지워 버리면 이상한 문장이 그대로 나간다
 *
 * 실행: npx tsx test/messaging.check.ts
 */

import {
  applyFilter,
  buildGmailLink,
  buildMailtoLink,
  buildSmsLink,
  isAppleDevice,
  isPersonalized,
  phoneList,
  renderTemplate,
  smsBytes,
  smsKind,
  type MessagePerson,
  type TargetRow,
} from '../src/lib/messaging';

let pass = 0;
let fail = 0;

function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${label}\n      받은 값 ${g}\n      기대값 ${w}`);
}

const person = (n: string, phone: string | null, email: string | null = null): MessagePerson => ({
  studentId: `id-${n}`, studentNo: `2024580${n}`, name: `학생${n}`, phone, email,
});

// ── ① 자리표시자 ────────────────────────────────────────────
{
  const ctx = { name: '김민준', studentNo: '202458001', course: '문화예술콘텐츠창업', date: '2026-09-01' };
  eq('이름 치환', renderTemplate('{이름} 학생', ctx), '김민준 학생');
  eq('여러 개 치환', renderTemplate('{과목} {날짜} {학번} {이름}', ctx),
    '문화예술콘텐츠창업 2026-09-01 202458001 김민준');
  eq('같은 것이 두 번 나와도 다 바뀐다', renderTemplate('{이름}아 {이름}아', ctx), '김민준아 김민준아');

  // 모르는 자리표시자는 그대로 둔다. 지워 버리면 오타가 조용히 사라져
  // 교수는 잘 나간 줄 알고 이상한 문장을 보내게 된다.
  eq('모르는 자리표시자는 남긴다', renderTemplate('{연락처} 로', ctx), '{연락처} 로');
}

{
  eq('이름이 들어가면 개인화', isPersonalized('{이름} 학생'), true);
  eq('학번이 들어가도 개인화', isPersonalized('{학번}'), true);
  // 과목·날짜는 모두에게 같은 값이라 한 통으로 묶을 수 있다.
  eq('과목만으로는 개인화 아님', isPersonalized('{과목} 안내'), false);
  eq('날짜만으로는 개인화 아님', isPersonalized('{날짜} 휴강'), false);
  eq('자리표시자 없음', isPersonalized('내일 휴강입니다'), false);
}

// ── ② 문자 길이 ─────────────────────────────────────────────
{
  eq('한글은 2바이트', smsBytes('가나다'), 6);
  eq('영문·숫자는 1바이트', smsBytes('abc123'), 6);
  eq('섞인 것', smsBytes('가a'), 3);
  eq('45자까지는 단문', smsKind('가'.repeat(45)), 'SMS');
  eq('46자부터는 장문', smsKind('가'.repeat(46)), 'LMS');
}

// ── ③ 번호 목록 ─────────────────────────────────────────────
{
  const people = [person('01', '010-1111-1111'), person('02', null), person('03', '010-3333-3333')];

  eq('한 줄에 하나', phoneList(people, 'lines'), '010-1111-1111\n010-3333-3333');
  eq('쉼표로 이어서', phoneList(people, 'comma'), '010-1111-1111, 010-3333-3333');
  eq('하이픈 없이', phoneList(people, 'digits'), '01011111111\n01033333333');
  // 번호 없는 사람이 빈 줄로 섞이면 헤이영이 그 줄에서 멈춘다.
  eq('번호 없는 사람은 빠진다', phoneList(people, 'lines').split('\n').length, 2);
  eq('아무도 없으면 빈 글자', phoneList([], 'lines'), '');
}

// ── ④ 문자 링크 — iOS 와 안드로이드가 반대다 ────────────────
{
  const people = [person('01', '010-1111-1111'), person('02', '010-2222-2222')];

  eq('애플 — 앰퍼샌드', buildSmsLink(people, '안녕', true),
    'sms:01011111111,01022222222&body=%EC%95%88%EB%85%95');
  eq('안드로이드 — 물음표', buildSmsLink(people, '안녕', false),
    'sms:01011111111,01022222222?body=%EC%95%88%EB%85%95');

  eq('본문이 없으면 번호만', buildSmsLink(people, '', true), 'sms:01011111111,01022222222');
  eq('번호 없는 사람은 빠진다', buildSmsLink([person('03', null)], '안녕', true), 'sms:&body=%EC%95%88%EB%85%95');

  // 하이픈을 남기면 기기가 번호를 못 읽는 경우가 있다.
  eq('하이픈은 지운다', buildSmsLink([person('01', '010-1111-1111')], '', false), 'sms:01011111111');
}

// ── ⑤ 메일 — 받는 사람은 반드시 숨은참조 ────────────────────
{
  const people = [person('01', null, 'a@x.ac.kr'), person('02', null, 'b@x.ac.kr'), person('03', null, null)];
  const link = buildMailtoLink(people, '안내', '본문');

  eq('mailto 로 시작', link.startsWith('mailto:?'), true);
  eq('참조(cc)가 아니라 숨은참조(bcc)', link.includes('bcc='), true);
  eq('to= 로 새어 나가지 않는다', /[?&]to=/.test(link), false);
  eq('cc= 로 새어 나가지 않는다', /[?&]cc=/.test(link), false);

  const q = new URLSearchParams(link.slice('mailto:?'.length));
  eq('숨은참조 두 명', q.get('bcc'), 'a@x.ac.kr,b@x.ac.kr');
  eq('제목', q.get('subject'), '안내');
  eq('본문', q.get('body'), '본문');
}

{
  // 구글 메일 웹 작성 — 노트북에서 지메일을 브라우저로 쓰는 경우
  const link = buildGmailLink([person('01', null, 'a@x.ac.kr')], '안내', '본문');
  eq('지메일 작성 주소', link.startsWith('https://mail.google.com/mail/?'), true);
  const q = new URLSearchParams(new URL(link).search);
  eq('지메일 · 작성 모드', q.get('view'), 'cm');
  eq('지메일 · 숨은참조', q.get('bcc'), 'a@x.ac.kr');
  eq('지메일 · to 로 새지 않는다', q.get('to'), null);
  eq('지메일 · 제목', q.get('su'), '안내');
}

// ── ⑥ 기기 판단 ─────────────────────────────────────────────
{
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36';
  const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const ipadOld = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

  eq('아이폰', isAppleDevice(iphone), true);
  eq('아이패드 (옛 UA)', isAppleDevice(ipadOld), true);
  eq('맥북', isAppleDevice(mac), true);
  eq('안드로이드 폰', isAppleDevice(android), false);
  eq('안드로이드 태블릿', isAppleDevice(androidTablet), false);

  // 요즘 아이패드 사파리는 자기를 맥이라고 말한다. 터치 지원까지 봐야 갈린다.
  const ipadNew = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  eq('아이패드 (맥으로 위장한 UA)', isAppleDevice(ipadNew, 'MacIntel', 5), true);
}

// ── ⑦ 대상 거르기 ───────────────────────────────────────────
{
  const rows: TargetRow[] = [
    { student_id: 'a', student_no: '1', name: '가', phone: '010-1', email: null, att_status: 'absent', absent_cnt: 4, team_name: null },
    { student_id: 'b', student_no: '2', name: '나', phone: null, email: 'b@x', att_status: 'late', absent_cnt: 1, team_name: null },
    { student_id: 'c', student_no: '3', name: '다', phone: '010-3', email: null, att_status: null, absent_cnt: 0, team_name: null },
    { student_id: 'd', student_no: '4', name: '라', phone: '010-4', email: null, att_status: 'early_leave', absent_cnt: 3, team_name: null },
  ];

  eq('전체', applyFilter(rows, 'all').length, 4);
  eq('번호 있음', applyFilter(rows, 'has_phone').map((r) => r.student_id), ['a', 'c', 'd']);
  eq('번호 없음', applyFilter(rows, 'no_phone').map((r) => r.student_id), ['b']);
  eq('그날 결석', applyFilter(rows, 'absent_today').map((r) => r.student_id), ['a']);
  // 조퇴도 지각 쪽으로 묶는다 — 연락할 이유가 같다.
  eq('그날 지각 · 조퇴', applyFilter(rows, 'late_today').map((r) => r.student_id), ['b', 'd']);
  eq('그날 미표시', applyFilter(rows, 'unmarked_today').map((r) => r.student_id), ['c']);
  eq('누적 결석 3회 이상', applyFilter(rows, 'absent_many', 3).map((r) => r.student_id), ['a', 'd']);
  eq('누적 결석 4회 이상', applyFilter(rows, 'absent_many', 4).map((r) => r.student_id), ['a']);
}

// ── 결과 ─────────────────────────────────────────────────────
console.log(`문자 · 알림 — 통과 ${pass} · 실패 ${fail}`);
if (fail > 0) process.exit(1);
