/**
 * 주차별 미제출 · 미출석 명단.
 *
 * 교수가 실제로 하는 일은 "이번 주에 누가 안 냈고 누가 안 왔는지 뽑아서
 * 연락하는 것" 하나다. 그런데 그 정보가 지금은 세 화면에 흩어져 있다 —
 * 과제는 `과제 관리`, 출결은 `출석 관리`, 번호는 `연락처 관리`.
 * 주차를 하나 고르면 그 셋을 한 표로 합쳐 주는 것이 이 파일의 일이다.
 *
 * 화면(React)과 떼어 둔 이유는 하나다 — **판정 규칙을 시험할 수 있게** 하려고.
 * "기록이 없는 것"과 "결석으로 찍은 것"을 섞으면 안 되는데, 그 경계가
 * 화면 안에 있으면 눈으로 볼 수밖에 없다.
 */

export type TaskMissState = 'missing' | 'late';
export type AbsenceState = 'absent' | 'late' | 'unmarked';

export const TASK_MISS_LABEL: Record<TaskMissState, string> = {
  missing: '미제출',
  late: '지각 제출',
};

export const ABSENCE_LABEL: Record<AbsenceState, string> = {
  absent: '결석',
  late: '지각',
  unmarked: '출결 미기록',
};

/** 명단 한 줄. 연락처는 붙어 있을 수도 없을 수도 있다. */
export interface WeeklyStudent {
  id: string;
  student_no: string;
  name: string;
  grade?: number | null;
  dept?: string | null;
  /** 정규화된 번호. 마스킹돼 들어온 줄은 null 이다. */
  phone?: string | null;
  /** 헤이영 원문(010-****-5678 처럼 가려진 것 포함). */
  phone_raw?: string | null;
  masked?: boolean;
}

export interface WeeklyTask {
  id: string;
  title: string;
  week_id: string | null;
  due_at: string | null;
}

export interface WeeklySubmission {
  task_id: string;
  student_id: string | null;
  submitted_at: string | null;
  ext_state?: 'submitted' | 'late' | 'missing' | null;
}

export interface WeeklySession {
  id: string;
  week_id: string;
  session_no: number;
  meets_on: string | null;
}

export interface WeeklyAttendance {
  session_id: string;
  student_id: string;
  status: 'present' | 'late' | 'absent' | 'excused' | 'early_leave';
}

export interface TaskMissRow {
  student: WeeklyStudent;
  taskId: string;
  taskTitle: string;
  state: TaskMissState;
}

export interface AbsenceRow {
  student: WeeklyStudent;
  sessionId: string;
  sessionNo: number;
  meetsOn: string | null;
  state: AbsenceState;
}

/**
 * 번호를 화면·파일에 어떻게 적을지 한 곳에서 정한다.
 * 마스킹된 채로 들어온 번호를 "없음" 으로 적으면 헤이영에서 이미 받아 온
 * 줄을 또 받으러 가게 된다. 그래서 가려진 원문은 원문대로 보여 준다.
 */
export function phoneText(s: WeeklyStudent): string {
  if (s.phone) return s.phone;
  if (s.phone_raw) return s.phone_raw;
  return '';
}

/** 연락이 실제로 되는 번호가 있는가. 문자·전화 대상 세기에 쓴다. */
export const hasReachablePhone = (s: WeeklyStudent): boolean => !!s.phone;

/**
 * 그 주차 과제를 안 낸 사람.
 *
 * 판정 순서가 중요하다. 학교 LMS 가 알려 준 `ext_state` 가 있으면 그것을
 * 먼저 믿는다 — 우리가 마감시각을 잘못 넣었을 때보다 정확하다.
 * `ext_state` 가 없을 때만 `submitted_at` 유무로 가른다.
 *
 * 제출물 줄이 아예 없는 학생도 **미제출로 센다.** 동기화를 안 돌린 주차와
 * 정말로 안 낸 것을 구별하지 못하는 것은 사실이라, 화면에서 "제출현황을
 * 한 번도 안 받은 과제" 를 따로 알려 주는 것으로 보완한다.
 */
export function taskMisses(
  students: WeeklyStudent[],
  tasks: WeeklyTask[],
  submissions: WeeklySubmission[],
): TaskMissRow[] {
  const rows: TaskMissRow[] = [];
  for (const task of tasks) {
    const byStudent = new Map<string, WeeklySubmission>();
    for (const s of submissions) {
      if (s.task_id === task.id && s.student_id) byStudent.set(s.student_id, s);
    }
    for (const student of students) {
      const sub = byStudent.get(student.id);
      const state = judgeTask(sub);
      if (state) rows.push({ student, taskId: task.id, taskTitle: task.title, state });
    }
  }
  return rows;
}

function judgeTask(sub: WeeklySubmission | undefined): TaskMissState | null {
  if (!sub) return 'missing';
  if (sub.ext_state === 'missing') return 'missing';
  if (sub.ext_state === 'late') return 'late';
  if (sub.ext_state === 'submitted') return null;
  return sub.submitted_at ? null : 'missing';
}

/**
 * 그 주차 수업에 안 온 사람.
 *
 * `unmarked`(줄이 아예 없음)를 결석과 **따로 둔다.** 출석을 아직 안 부른
 * 회차를 결석 명단에 넣어 학생에게 연락하면 그것으로 신뢰를 잃는다.
 * 화면에서 둘을 갈라 보여 주고, 기본 내보내기에는 결석·지각만 담는다.
 */
export function absences(
  students: WeeklyStudent[],
  sessions: WeeklySession[],
  rows: WeeklyAttendance[],
): AbsenceRow[] {
  const out: AbsenceRow[] = [];
  for (const session of sessions) {
    const byStudent = new Map<string, WeeklyAttendance>();
    for (const r of rows) {
      if (r.session_id === session.id) byStudent.set(r.student_id, r);
    }
    for (const student of students) {
      const hit = byStudent.get(student.id);
      const state: AbsenceState | null = !hit
        ? 'unmarked'
        : hit.status === 'absent'
          ? 'absent'
          : hit.status === 'late'
            ? 'late'
            : null; // present · excused · early_leave 는 부르지 않는다
      if (state) {
        out.push({
          student,
          sessionId: session.id,
          sessionNo: session.session_no,
          meetsOn: session.meets_on,
          state,
        });
      }
    }
  }
  return out;
}

export interface WeeklyStudentSummary {
  student: WeeklyStudent;
  taskMissing: number;
  taskLate: number;
  absent: number;
  attendLate: number;
  unmarked: number;
  /** 연락할 이유가 하나라도 있는가 (미기록은 세지 않는다). */
  needsContact: boolean;
}

/** 학생 한 명당 한 줄로 접는다. 연락처 명단은 이 모양이라야 쓸 수 있다. */
export function summarize(
  students: WeeklyStudent[],
  misses: TaskMissRow[],
  absents: AbsenceRow[],
): WeeklyStudentSummary[] {
  const base = new Map<string, WeeklyStudentSummary>();
  for (const student of students) {
    base.set(student.id, {
      student,
      taskMissing: 0,
      taskLate: 0,
      absent: 0,
      attendLate: 0,
      unmarked: 0,
      needsContact: false,
    });
  }
  for (const m of misses) {
    const row = base.get(m.student.id);
    if (!row) continue;
    if (m.state === 'missing') row.taskMissing += 1;
    else row.taskLate += 1;
  }
  for (const a of absents) {
    const row = base.get(a.student.id);
    if (!row) continue;
    if (a.state === 'absent') row.absent += 1;
    else if (a.state === 'late') row.attendLate += 1;
    else row.unmarked += 1;
  }
  for (const row of base.values()) {
    row.needsContact = row.taskMissing > 0 || row.taskLate > 0 || row.absent > 0 || row.attendLate > 0;
  }
  return [...base.values()];
}
