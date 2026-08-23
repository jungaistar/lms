/**
 * 출석부에서 회차 만들기 계획 점검.
 *
 * 2026-08-23 에 6과목을 손으로 세워 보고 나서 만든 검사다. 그날 회차가 0개라
 * 출석부를 올려도 붙일 자리가 없었고, 주차 탭에서 15주 × 2교시를 과목마다
 * 손으로 만들어야 했다. 파일 안에 주차 · 교시 · 날짜가 다 있는데도 그랬다.
 *
 * 실행: npx tsx test/plan-sessions.check.ts
 */

import { planSessions, parseHeyYoungMatrix } from '../src/lib/heyyoung';

let pass = 0;
let fail = 0;

function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${label}\n      받은 값 ${g}\n      기대값 ${w}`);
}

const cols = (spec: Array<[number, number, string | null]>) =>
  spec.map(([week, session, date]) => ({ week, session, date }));

// ── ① 아무것도 없는 과목 — 전부 만들어야 한다 ────────────────
{
  const plan = planSessions({
    columns: cols([[1, 1, '2026-08-24'], [1, 2, '2026-08-24'], [2, 1, '2026-08-31'], [2, 2, '2026-08-31']]),
    weeks: [],
    sessions: [],
  });
  eq('빈 과목 · 만들 회차 수', plan.missing.length, 4);
  eq('빈 과목 · 만들 주차', plan.newWeekNos, [1, 2]);
  eq('빈 과목 · 첫 회차', plan.missing[0], { week: 1, session: 1, date: '2026-08-24' });
  eq('빈 과목 · 채울 수업일 없음', plan.blankDates.length, 0);
}

// ── ② 주차는 있고 회차가 1개뿐 — 2교시만 만든다 ──────────────
{
  const plan = planSessions({
    columns: cols([[1, 1, '2026-08-24'], [1, 2, '2026-08-24']]),
    weeks: [{ id: 'w1', week_no: 1 }],
    sessions: [{ id: 's1', week_id: 'w1', session_no: 1, meets_on: '2026-08-24' }],
  });
  eq('1교시만 있을 때 · 만들 회차', plan.missing, [{ week: 1, session: 2, date: '2026-08-24' }]);
  eq('1교시만 있을 때 · 새 주차 없음', plan.newWeekNos, []);
}

// ── ③ 수업일이 비어 있으면 채운다 ────────────────────────────
{
  const plan = planSessions({
    columns: cols([[1, 1, '2026-08-24']]),
    weeks: [{ id: 'w1', week_no: 1 }],
    sessions: [{ id: 's1', week_id: 'w1', session_no: 1, meets_on: null }],
  });
  eq('빈 수업일은 채운다', plan.blankDates, [{ id: 's1', date: '2026-08-24' }]);
  eq('빈 수업일 · 만들 것 없음', plan.missing.length, 0);
}

// ── ④ 적어 둔 수업일은 덮지 않는다 ───────────────────────────
{
  // 보강으로 날짜를 옮겨 둔 경우다. 파일보다 사람 쪽이 옳다.
  const plan = planSessions({
    columns: cols([[7, 1, '2026-12-07']]),
    weeks: [{ id: 'w7', week_no: 7 }],
    sessions: [{ id: 's7', week_id: 'w7', session_no: 1, meets_on: '2026-10-12' }],
  });
  eq('적어 둔 수업일은 그대로', plan.blankDates, []);
}

// ── ⑤ 날짜를 못 읽은 열이면 채울 것이 없다 ───────────────────
{
  const plan = planSessions({
    columns: cols([[1, 1, null]]),
    weeks: [{ id: 'w1', week_no: 1 }],
    sessions: [{ id: 's1', week_id: 'w1', session_no: 1, meets_on: null }],
  });
  eq('날짜 없는 열 · 채우지 않는다', plan.blankDates, []);
  eq('날짜 없는 열 · 만들 것도 없다', plan.missing.length, 0);
}

// ── ⑥ week 0 (머리글 오인식) 은 버린다 ───────────────────────
{
  const plan = planSessions({ columns: cols([[0, 1, null], [1, 1, '2026-08-24']]), weeks: [], sessions: [] });
  eq('week 0 은 버린다', plan.missing, [{ week: 1, session: 1, date: '2026-08-24' }]);
}

// ── ⑦ 남는 회차는 건드리지 않는다 ────────────────────────────
{
  // 파일에 없는 16주차가 이미 있어도 지우거나 손대지 않는다. 계획에 안 들어간다.
  const plan = planSessions({
    columns: cols([[1, 1, '2026-08-24']]),
    weeks: [{ id: 'w1', week_no: 1 }, { id: 'w16', week_no: 16 }],
    sessions: [
      { id: 's1', week_id: 'w1', session_no: 1, meets_on: '2026-08-24' },
      { id: 's16', week_id: 'w16', session_no: 1, meets_on: null },
    ],
  });
  eq('파일에 없는 회차 · 만들 것 없음', plan.missing.length, 0);
  eq('파일에 없는 회차 · 수업일도 안 건드림', plan.blankDates, []);
}

// ── ⑧ 실제 출석부 모양 — 15주 × 2교시 30개 ───────────────────
{
  const head = '순번,학과,학년,학번,성명,주,' + Array.from({ length: 15 }, (_, i) => `${i + 1}주,${i + 1}주`).join(',');
  const mon = ',,,,,월,' + Array.from({ length: 15 }, () => '08,08').join(',');
  const day = ',,,,,일,' + Array.from({ length: 15 }, (_, i) => `${String(i + 1).padStart(2, '0')},${String(i + 1).padStart(2, '0')}`).join(',');
  const dow = ',,,,,요일,' + Array.from({ length: 15 }, () => '월,월').join(',');
  const gyo = ',,,,,교시,' + Array.from({ length: 15 }, () => '03,04').join(',');
  const row = '1,영화예술과,3,202134032,이동현,,' + Array.from({ length: 30 }, () => '').join(',');
  const text = [head, mon, day, dow, gyo, row].join('\n');

  const m = parseHeyYoungMatrix(text, 2026);
  eq('실제 모양 · 열 30개', m.columns.length, 30);

  const plan = planSessions({ columns: m.columns, weeks: [], sessions: [] });
  eq('실제 모양 · 회차 30개를 만든다', plan.missing.length, 30);
  eq('실제 모양 · 주차 15개를 만든다', plan.newWeekNos.length, 15);
  eq('실제 모양 · 마지막이 15주 2교시', plan.missing[29]?.week + ':' + plan.missing[29]?.session, '15:2');
}

console.log(`\n회차 계획: ${pass}개 통과${fail ? `, ${fail}개 실패` : ''}`);
process.exit(fail ? 1 : 0);
