/**
 * 헤이영 연락처 파서 점검.
 *
 * 실제로 밟게 되는 자리를 그대로 시험한다.
 *   · 엑셀다운은 연락처가 **마스킹된 채로** 나온다 (010-****-5678)
 *   · 엑셀이 앞자리 0 을 먹는다 (01012345678 → 1012345678)
 *   · 학번(9자리 숫자)을 전화번호로 읽으면 안 된다
 *   · '보호자연락처' 열이 '연락처' 로도 걸려 학생 번호를 덮으면 안 된다
 *
 * 실행: npx tsx test/contacts.check.ts
 */

import {
  parseContacts,
  matchContacts,
  normalizePhone,
  readPhoneCell,
  isMasked,
} from '../src/lib/contacts';

let pass = 0;
let fail = 0;

function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${label}\n      받은 값 ${g}\n      기대값 ${w}`);
}

// ── ① 번호 정규화 ───────────────────────────────────────────
{
  eq('하이픈 그대로', normalizePhone('010-1234-5678'), '010-1234-5678');
  eq('붙여 쓴 11자리', normalizePhone('01012345678'), '010-1234-5678');
  eq('점 구분', normalizePhone('010.1234.5678'), '010-1234-5678');
  eq('공백 구분', normalizePhone('010 1234 5678'), '010-1234-5678');
  eq('국가번호 +82', normalizePhone('+82 10-1234-5678'), '010-1234-5678');
  eq('국가번호 0082', normalizePhone('0082-10-1234-5678'), '010-1234-5678');

  // 엑셀이 앞자리 0 을 먹은 경우 — 엑셀다운을 CSV 로 다시 저장하면 늘 이렇게 나온다.
  eq('엑셀이 먹은 0 (010)', normalizePhone('1012345678'), '010-1234-5678');
  eq('엑셀이 먹은 0 (011)', normalizePhone('1123456789'), '011-2345-6789');

  eq('옛 10자리 011', normalizePhone('011-234-5678'), '011-234-5678');
  eq('서울 02 (8자리)', normalizePhone('0212345678'), '02-1234-5678');
  eq('지역번호 031', normalizePhone('031-123-4567'), '031-123-4567');

  eq('빈 칸', normalizePhone(''), null);
  eq('말이 안 되는 값', normalizePhone('없음'), null);
  eq('자릿수 모자람', normalizePhone('010-123'), null);
}

// ── ② 마스킹 ────────────────────────────────────────────────
{
  eq('가운데 마스킹', isMasked('010-****-5678'), true);
  eq('뒤 마스킹', isMasked('010-1234-****'), true);
  eq('● 로 가린 것', isMasked('010-●●●●-5678'), true);
  eq('멀쩡한 번호', isMasked('010-1234-5678'), false);

  // 마스킹된 줄은 번호로 받지 않는다. 원문만 남긴다.
  eq('마스킹 줄은 phone 이 null', readPhoneCell('010-****-5678'), {
    phone: null, phoneRaw: '010-****-5678', masked: true,
  });
  eq('멀쩡한 줄', readPhoneCell(' 010-1234-5678 '), {
    phone: '010-1234-5678', phoneRaw: '010-1234-5678', masked: false,
  });
  eq('빈 칸', readPhoneCell('  '), { phone: null, phoneRaw: null, masked: false });
}

// ── ③ 헤이영 엑셀다운 (머리글 있음 · 마스킹된 상태) ─────────
{
  const csv = [
    '번호,학번,성명,학과,학년,연락처',
    '1,202458001,김민준,실용음악과,2,010-****-5678',
    '2,202458002,이서연,연기과,3,010-****-1111',
    '3,202458003,박도윤,방송기술과,2,010-****-2222',
  ].join('\n');

  const r = parseContacts(csv);
  eq('엑셀다운 · 줄 수', r.rows.length, 3);
  eq('엑셀다운 · 머리글 인식', r.mapping, {
    studentNo: '학번', name: '성명', phone: '연락처', guardianPhone: null,
  });
  eq('엑셀다운 · 첫 줄', r.rows[0], {
    studentNo: '202458001', name: '김민준',
    phone: null, phoneRaw: '010-****-5678', masked: true, guardianPhone: null,
  });
  eq('엑셀다운 · 마스킹 수', r.maskedCount, 3);
  eq('엑셀다운 · 못 읽은 줄 없음', r.skipped.length, 0);
}

// ── ④ 마스킹 해제한 뒤 붙여넣기 (머리글 없음) ───────────────
{
  const pasted = [
    '202458001\t김민준\t010-1234-5678',
    '202458002\t이서연\t01099998888',
    '202458003\t박도윤\t1055556666', // 엑셀이 0 을 먹은 줄
  ].join('\n');

  const r = parseContacts(pasted);
  eq('붙여넣기 · 줄 수', r.rows.length, 3);
  eq('붙여넣기 · 번호 정규화', r.rows.map((x) => x.phone), [
    '010-1234-5678', '010-9999-8888', '010-5555-6666',
  ]);
  eq('붙여넣기 · 마스킹 없음', r.maskedCount, 0);
  eq('붙여넣기 · 이름', r.rows.map((x) => x.name), ['김민준', '이서연', '박도윤']);
}

// ── ⑤ 학번을 전화번호로 읽으면 안 된다 ──────────────────────
{
  // 번호 칸이 아예 없는 줄. 학번(9자리)이 번호로 새어 들어가면 안 된다.
  const r = parseContacts('202458001\t김민준');
  eq('번호 없는 줄 · 학번은 읽는다', r.rows[0]!.studentNo, '202458001');
  eq('번호 없는 줄 · 번호는 비어 있다', r.rows[0]!.phone, null);
  eq('번호 없는 줄 · 원문도 비어 있다', r.rows[0]!.phoneRaw, null);
}

// ── ⑥ 보호자 연락처가 학생 번호를 덮으면 안 된다 ────────────
{
  const csv = [
    '학번,성명,연락처,보호자연락처',
    '202458001,김민준,010-1111-2222,010-3333-4444',
  ].join('\n');

  const r = parseContacts(csv);
  eq('보호자 열 · 머리글', r.mapping, {
    studentNo: '학번', name: '성명', phone: '연락처', guardianPhone: '보호자연락처',
  });
  eq('보호자 열 · 학생 번호', r.rows[0]!.phone, '010-1111-2222');
  eq('보호자 열 · 보호자 번호', r.rows[0]!.guardianPhone, '010-3333-4444');
}

{
  // 열 순서가 뒤집혀도 학생 번호를 보호자 번호로 바꿔 읽으면 안 된다.
  const csv = [
    '학번,성명,보호자연락처,휴대전화',
    '202458001,김민준,010-3333-4444,010-1111-2222',
  ].join('\n');
  const r = parseContacts(csv);
  eq('열이 뒤집힌 경우 · 학생 번호', r.rows[0]!.phone, '010-1111-2222');
  eq('열이 뒤집힌 경우 · 보호자 번호', r.rows[0]!.guardianPhone, '010-3333-4444');
}

// ── ⑦ 못 읽은 줄은 알려 준다 ────────────────────────────────
{
  const csv = [
    '학번,성명,연락처',
    '202458001,김민준,010-1234-5678',
    '202458002,이서연,없음',            // 번호 칸은 있는데 못 읽음
    '머리글도 학번도 아닌 줄',
  ].join('\n');

  const r = parseContacts(csv);
  eq('못 읽은 번호를 세운다', r.skipped.some((s) => s.reason.includes('전화번호를 못 읽음')), true);
  eq('학번 없는 줄도 세운다', r.skipped.some((s) => s.reason.includes('학번을 못 찾음')), true);
  // 못 읽었어도 학생 줄은 살린다 — 번호만 비워 두면 나중에 채울 수 있다.
  eq('번호를 못 읽어도 줄은 남는다', r.rows.length, 2);
  eq('못 읽은 줄의 번호는 null', r.rows[1]!.phone, null);
}

// ── ⑧ 같은 학번이 두 번 나오면 뒷줄은 버린다 ────────────────
{
  const csv = [
    '학번,성명,연락처',
    '202458001,김민준,010-1111-1111',
    '202458001,김민준,010-2222-2222',
  ].join('\n');
  const r = parseContacts(csv);
  eq('중복 학번 · 줄 수', r.rows.length, 1);
  eq('중복 학번 · 앞줄을 남긴다', r.rows[0]!.phone, '010-1111-1111');
  eq('중복 학번 · 알려 준다', r.skipped[0]!.reason.includes('이미 나옴'), true);
}

// ── ⑨ 명단 대조 ─────────────────────────────────────────────
{
  const roster = [
    { id: 's1', student_no: '202458001', name: '김민준' },
    { id: 's2', student_no: '202458002', name: '이서연' },
    { id: 's3', student_no: '202458003', name: '박도윤' },
  ];
  const { rows } = parseContacts([
    '학번,성명,연락처',
    '202458001,김민준,010-1111-1111',
    '202458002,이 서연,010-2222-2222',   // 공백만 다름 — 다름으로 보지 않는다
    '202458009,남의학생,010-9999-9999',  // 명단에 없음
  ].join('\n'));

  const m = matchContacts(rows, roster);
  eq('대조 · 맞은 수', m.matched.length, 2);
  eq('대조 · 명단에 없음', m.unmatched.map((r) => r.studentNo), ['202458009']);
  eq('대조 · 파일에 안 나온 학생', m.missing.map((r) => r.id), ['s3']);
  eq('대조 · 공백 차이는 이름 불일치가 아니다', m.nameMismatch.length, 0);
}

{
  const roster = [{ id: 's1', student_no: '202458001', name: '김민준' }];
  const { rows } = parseContacts('학번,성명,연락처\n202458001,다른이름,010-1111-1111');
  const m = matchContacts(rows, roster);
  eq('대조 · 이름이 다르면 알려 준다', m.nameMismatch.length, 1);
  // 막지는 않는다. 표기 차이가 실제로 있어서 눈으로 보고 넘기게 한다.
  eq('대조 · 이름이 달라도 맞은 것으로 센다', m.matched.length, 1);
}

// ── 헤이영 푸시 「수신자 추가」 표 ────────────────────────────
// 2026-08-23 에 이 표를 실제로 붙여넣어 보고 만든 검사다.
//
//   이름 · 학번/교번 · 학과 · 학년 · 전화번호
//   이*현  202134032  영화예술과  3 학년  0105769****
//
// 여기서 **학과가 이름 자리에 들어가던 버그**를 잡았다. 이름이 마스킹돼
// 있으면(`이*현`) 이름 칸을 버리고 학번 다음 칸인 학과를 집었다.
{
  const head = '이름\t학번/교번\t학과\t학년\t전화번호';
  const r = parseContacts(
    head + '\n이*현\t202134032\t영화예술과\t3 학년\t0105769****\n오*헌\t202136033\t기악과\t2 학년\t0105437****',
  );
  eq('수신자추가 · 줄 수', r.rows.length, 2);
  eq('수신자추가 · 학과를 이름으로 집지 않는다', r.rows.map((x) => x.name), ['이*현', '오*헌']);
  eq('수신자추가 · 마스킹은 번호로 안 받는다', r.rows.map((x) => x.phone), [null, null]);
  eq('수신자추가 · 마스킹 수를 센다', r.maskedCount, 2);
}

{
  // 마스킹을 끄면 그대로 번호가 들어온다.
  const head = '이름\t학번/교번\t학과\t학년\t전화번호';
  const r = parseContacts(head + '\n이동현\t202134032\t영화예술과\t3 학년\t01057691234');
  eq('수신자추가 · 해제하면 이름', r.rows[0]!.name, '이동현');
  eq('수신자추가 · 해제하면 번호', r.rows[0]!.phone, '010-5769-1234');
  eq('수신자추가 · 해제하면 masked=false', r.rows[0]!.masked, false);
}

{
  // 머리글 없이 본문만 긁어 붙이는 경우. 이때도 학과를 집으면 안 된다.
  const r = parseContacts('이동현\t202134032\t영화예술과\t3 학년\t01057691234');
  eq('머리글 없음 · 이름', r.rows[0]!.name, '이동현');
  eq('머리글 없음 · 번호', r.rows[0]!.phone, '010-5769-1234');
}

{
  // 학과가 이름보다 앞에 오는 모양(학교 LMS 성적산출 표)도 학과를 안 집는다.
  const r = parseContacts('영화예술과\t3\t202134032\t이동현\t010-5769-1234');
  eq('학과 먼저 · 이름', r.rows[0]!.name, '이동현');
}

{
  // 학년 칸을 이름으로 집지 않는다.
  const r = parseContacts('202134032\t3 학년\t01057691234');
  eq('학년은 이름이 아니다', r.rows[0]!.name, null);
}

// ── 결과 ─────────────────────────────────────────────────────
console.log(`연락처 파서 — 통과 ${pass} · 실패 ${fail}`);
if (fail > 0) process.exit(1);
