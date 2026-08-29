import {
  absences,
  hasReachablePhone,
  phoneText,
  summarize,
  taskMisses,
  type WeeklyAttendance,
  type WeeklySession,
  type WeeklyStudent,
  type WeeklySubmission,
  type WeeklyTask,
} from '../src/lib/weekly.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

const S = (id: string, no: string, name: string, extra: Partial<WeeklyStudent> = {}): WeeklyStudent =>
  ({ id, student_no: no, name, ...extra });

const 강하니 = S('s1', '202534001', '강하니', { phone: '010-1111-2222', dept: '영화예술과', grade: 2 });
const 김나현 = S('s2', '202527036', '김나현', { phone: null, phone_raw: '010-****-3333', masked: true });
const 오민석 = S('s3', '202211120', '오민석');
const roster = [강하니, 김나현, 오민석];

// ════════════════════════════════════════════════════════════
//  과제 미제출
// ════════════════════════════════════════════════════════════
const task: WeeklyTask = { id: 't1', title: '1주차 과제', week_id: 'w1', due_at: '2026-08-28T23:59:00Z' };

{
  const subs: WeeklySubmission[] = [
    { task_id: 't1', student_id: 's1', submitted_at: '2026-08-25T10:17:00Z', ext_state: 'submitted' },
    { task_id: 't1', student_id: 's2', submitted_at: null, ext_state: 'missing' },
    // 오민석은 줄이 아예 없다
  ];
  const rows = taskMisses(roster, [task], subs);
  check('과제: 낸 사람은 안 뽑힌다', !rows.some((r) => r.student.id === 's1'), rows);
  check('과제: ext_state=missing 은 미제출', rows.some((r) => r.student.id === 's2' && r.state === 'missing'));
  check('과제: 줄이 없으면 미제출', rows.some((r) => r.student.id === 's3' && r.state === 'missing'));
  check('과제: 모두 두 명', rows.length === 2, rows.length);
}

{
  // ext_state 가 submitted 인데 submitted_at 이 비어도 낸 것으로 본다 (학교 LMS 를 먼저 믿는다)
  const subs: WeeklySubmission[] = [{ task_id: 't1', student_id: 's1', submitted_at: null, ext_state: 'submitted' }];
  const rows = taskMisses([강하니], [task], subs);
  check('과제: ext_state 가 submitted_at 보다 우선', rows.length === 0, rows);
}

{
  const subs: WeeklySubmission[] = [{ task_id: 't1', student_id: 's1', submitted_at: null, ext_state: 'late' }];
  const rows = taskMisses([강하니], [task], subs);
  check('과제: 지각은 따로 표시', rows[0]?.state === 'late', rows[0]);
}

{
  // ext_state 가 없는 로컬 제출물은 submitted_at 으로 가른다
  const subs: WeeklySubmission[] = [{ task_id: 't1', student_id: 's1', submitted_at: '2026-08-26T00:00:00Z' }];
  check('과제: ext_state 없으면 submitted_at 으로 판정', taskMisses([강하니], [task], subs).length === 0);
  const none: WeeklySubmission[] = [{ task_id: 't1', student_id: 's1', submitted_at: null }];
  check('과제: submitted_at 이 비면 미제출', taskMisses([강하니], [task], none)[0]?.state === 'missing');
}

{
  // 다른 과제의 제출물이 섞여 들어오면 안 된다
  const subs: WeeklySubmission[] = [{ task_id: 'OTHER', student_id: 's1', submitted_at: '2026-08-25T10:00:00Z' }];
  const rows = taskMisses([강하니], [task], subs);
  check('과제: 다른 과제 제출물은 안 센다', rows[0]?.state === 'missing', rows);
}

// ════════════════════════════════════════════════════════════
//  미출석
// ════════════════════════════════════════════════════════════
const ses: WeeklySession[] = [
  { id: 'x1', week_id: 'w1', session_no: 1, meets_on: '2026-08-24' },
  { id: 'x2', week_id: 'w1', session_no: 2, meets_on: '2026-08-26' },
];

{
  const att: WeeklyAttendance[] = [
    { session_id: 'x1', student_id: 's1', status: 'present' },
    { session_id: 'x1', student_id: 's2', status: 'absent' },
    { session_id: 'x1', student_id: 's3', status: 'late' },
    // x2 는 아직 아무도 안 불렀다
  ];
  const rows = absences(roster, ses, att);
  check('출결: 출석은 안 뽑힌다', !rows.some((r) => r.sessionId === 'x1' && r.student.id === 's1'), rows);
  check('출결: 결석', rows.some((r) => r.sessionId === 'x1' && r.student.id === 's2' && r.state === 'absent'));
  check('출결: 지각', rows.some((r) => r.sessionId === 'x1' && r.student.id === 's3' && r.state === 'late'));
  check(
    '출결: 안 부른 회차는 미기록 — 결석이 아니다',
    rows.filter((r) => r.sessionId === 'x2').every((r) => r.state === 'unmarked'),
    rows.filter((r) => r.sessionId === 'x2'),
  );
  check('출결: 미기록은 명단 전원', rows.filter((r) => r.state === 'unmarked').length === 3);
}

{
  const att: WeeklyAttendance[] = [
    { session_id: 'x1', student_id: 's1', status: 'excused' },
    { session_id: 'x1', student_id: 's2', status: 'early_leave' },
  ];
  const rows = absences([강하니, 김나현], [ses[0]!], att);
  check('출결: 공결·조퇴는 연락 대상이 아니다', rows.length === 0, rows);
}

// ════════════════════════════════════════════════════════════
//  한 줄로 접기
// ════════════════════════════════════════════════════════════
{
  const misses = taskMisses(roster, [task], [
    { task_id: 't1', student_id: 's1', submitted_at: '2026-08-25T10:17:00Z', ext_state: 'submitted' },
  ]);
  const abs = absences(roster, [ses[0]!], [
    { session_id: 'x1', student_id: 's1', status: 'present' },
    { session_id: 'x1', student_id: 's2', status: 'absent' },
    { session_id: 'x1', student_id: 's3', status: 'present' },
  ]);
  const sum = summarize(roster, misses, abs);
  const by = (id: string) => sum.find((r) => r.student.id === id)!;

  check('요약: 명단 전원이 한 줄씩', sum.length === 3, sum.length);
  check('요약: 다 한 학생은 연락 대상 아님', by('s1').needsContact === false, by('s1'));
  check('요약: 미제출 + 결석', by('s2').taskMissing === 1 && by('s2').absent === 1, by('s2'));
  check('요약: 미제출만 있어도 연락 대상', by('s3').needsContact === true && by('s3').absent === 0, by('s3'));
}

{
  const sum = summarize(
    [강하니],
    [],
    absences([강하니], [ses[1]!], []), // 미기록만
  );
  check('요약: 미기록만 있으면 연락 대상이 아니다', sum[0]?.needsContact === false && sum[0]?.unmarked === 1, sum[0]);
}

// ════════════════════════════════════════════════════════════
//  전화번호 표시
// ════════════════════════════════════════════════════════════
check('번호: 정규화된 번호를 그대로', phoneText(강하니) === '010-1111-2222');
check('번호: 마스킹된 원문은 원문대로 보여 준다', phoneText(김나현) === '010-****-3333');
check('번호: 아무것도 없으면 빈 칸', phoneText(오민석) === '');
check('번호: 연락 가능한 번호만 센다', hasReachablePhone(강하니) && !hasReachablePhone(김나현));

console.log(`weekly.check: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
