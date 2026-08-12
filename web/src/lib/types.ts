export type ActivityKind = 'presentation' | 'discussion' | 'team_contribution' | 'peer_review';
export type ActivityStatus = 'draft' | 'open' | 'closed' | 'finalized';

export const KIND_LABEL: Record<ActivityKind, string> = {
  presentation: '발표 상호평가',
  discussion: '토론 참여 평가',
  team_contribution: '팀 기여도 평가',
  peer_review: '과제 동료 첨삭',
};

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  draft: '준비중',
  open: '진행중',
  closed: '마감',
  finalized: '확정',
};

/** 팀 기여도는 루브릭이 아니라 100점 배분 방식이라 평가 화면이 다르다. */
export const isRubricKind = (k: ActivityKind) => k !== 'team_contribution';

/**
 * 화면 표시용. 실제 권한 판정은 서버(DB의 is_admin())가 한다 —
 * 이 상수를 고쳐도 남의 회원 목록은 볼 수 없다.
 */
export const ADMIN_EMAIL = 'radical8566@gmail.com';

export type MemberStatus = 'pending' | 'approved' | 'suspended';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  suspended: '정지',
};

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  affiliation: string | null;
  role: 'admin' | 'teacher';
  status: MemberStatus;
  note: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface Member extends Profile {
  course_count: number;
  student_count: number;
  last_sign_in: string | null;
}

export interface Course {
  id: string;
  owner_id: string;
  term: string;
  title: string;
  class_no: string | null;
  join_code: string;
  ext_course_id: string | null;
  ext_class_no: string | null;
  /** 아래 셋은 0006 마이그레이션에서 추가됐다. 과목마다 운영 방식이 다르다. */
  peer_assessment: boolean;
  project_mode: ProjectMode;
  ext_lms_url: string | null;
  /** 0010 — 학생이 들어오는 방식. 옛 줄에는 없어서 옵션으로 둔다. */
  entry_mode?: EntryMode;
}

// ── 학생 입장 (0010) ─────────────────────────────────────────
export type EntryMode = 'code' | 'approval';

export const ENTRY_MODE_LABEL: Record<EntryMode, string> = {
  code: '수업코드 + 학번',
  approval: '이메일 · 학번 · 이름 + 승인',
};

/** 'none' 은 표에 줄이 없는 상태 — 아직 한 번도 신청하지 않았다. */
export type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected';

export const ACCESS_STATUS_LABEL: Record<AccessStatus, string> = {
  none: '미신청',
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '거절',
};

/** access_list() RPC 가 돌려주는 한 줄. 명단 전원이 나온다. */
export interface AccessRow {
  student_id: string;
  student_no: string;
  name: string;
  team_name: string | null;
  email: string | null;
  status: AccessStatus;
  requested_at: string | null;
  decided_at: string | null;
  last_login_at: string | null;
}

export interface Student {
  id: string;
  course_id: string;
  student_no: string;
  name: string;
  team_id: string | null;
  active: boolean;
}

export interface Team {
  id: string;
  course_id: string;
  name: string;
}

export interface Rubric {
  id: string;
  course_id: string;
  title: string;
}

export interface RubricItem {
  id: string;
  rubric_id: string;
  ord: number;
  label: string;
  description: string | null;
  max_score: number;
  weight: number;
}

export interface Activity {
  id: string;
  course_id: string;
  kind: ActivityKind;
  title: string;
  instruction: string | null;
  rubric_id: string | null;
  target_kind: 'student' | 'team';
  opens_at: string | null;
  closes_at: string | null;
  evaluators_per_target: number;
  show_scores_to_students: boolean;
  show_comments_to_students: boolean;
  max_points: number;
  normalize: 'none' | 'trim' | 'zscore';
  participation_penalty: number;
  status: ActivityStatus;
  /** 0009 — 프로젝트 사전/결과 평가 구분. 옛 줄에는 없어서 옵션으로 둔다. */
  phase?: EvalPhase;
}

export interface Target {
  id: string;
  activity_id: string;
  student_id: string | null;
  team_id: string | null;
  title: string;
  content: string | null;
  ord: number;
}

export interface MyTask {
  activity_id: string;
  activity_kind: ActivityKind;
  activity_title: string;
  closes_at: string | null;
  assignment_id: string;
  target_id: string;
  target_title: string;
  submitted: boolean;
}

export interface ResultRow {
  id: string;
  activity_id: string;
  student_id: string;
  raw_score: number | null;
  adjusted_score: number | null;
  participation_rate: number | null;
  final_score: number | null;
  evaluator_count: number | null;
  override_score: number | null;
  note: string | null;
  status: 'draft' | 'approved';
}

// ════════════════════════════════════════════════════════════
//  수업 운영 (주차 · 공지 · 자료 · 과제 · 출석 · 성적)
//  DB 는 supabase/migrations/0006_course_ops.sql
// ════════════════════════════════════════════════════════════

export type ProjectMode = 'none' | 'individual' | 'team';

export const PROJECT_MODE_LABEL: Record<ProjectMode, string> = {
  none: '프로젝트 없음',
  individual: '개인 프로젝트',
  team: '팀 프로젝트',
};

export interface CourseWeek {
  id: string;
  course_id: string;
  week_no: number;
  title: string;
  summary: string | null;
  syllabus: string | null;
  starts_on: string | null;
  ends_on: string | null;
  published: boolean;
  ext_ref: string | null;
  synced_at: string | null;
  locked: boolean;
}

export interface CourseSession {
  id: string;
  week_id: string;
  session_no: number;
  topic: string | null;
  meets_on: string | null;
  minutes: number | null;
}

export interface Notice {
  id: string;
  course_id: string;
  week_id: string | null;
  title: string;
  body: string | null;
  pinned: boolean;
  published_at: string | null;
  locked: boolean;
}

export type MaterialKind = 'link' | 'file' | 'video' | 'doc' | 'syllabus';

export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  link: '링크',
  file: '파일',
  video: '영상',
  doc: '문서',
  syllabus: '강의계획서',
};

export interface Material {
  id: string;
  course_id: string;
  week_id: string | null;
  title: string;
  kind: MaterialKind;
  url: string | null;
  note: string | null;
  ord: number;
  published: boolean;
  locked: boolean;
}

export type TaskMode = 'individual' | 'team';
export type TaskStatus = 'draft' | 'open' | 'closed';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  draft: '준비중',
  open: '진행중',
  closed: '마감',
};

export interface Task {
  id: string;
  course_id: string;
  week_id: string | null;
  title: string;
  instruction: string | null;
  mode: TaskMode;
  max_points: number;
  opens_at: string | null;
  due_at: string | null;
  allow_late: boolean;
  late_penalty: number;
  status: TaskStatus;
  locked: boolean;
}

/** 학교 LMS 가 알려 준 제출 상태. 값이 있으면 submitted_at 보다 이걸 먼저 믿는다. */
export type ExtSubmitState = 'submitted' | 'late' | 'missing';

export const EXT_STATE_LABEL: Record<ExtSubmitState, string> = {
  submitted: '제출',
  late: '지각 제출',
  missing: '미제출',
};

export interface TaskSubmission {
  id: string;
  task_id: string;
  student_id: string | null;
  team_id: string | null;
  body: string | null;
  url: string | null;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
  /** 0009 — 학교 LMS 연동 */
  origin?: 'local' | 'ext_lms';
  ext_state?: ExtSubmitState | null;
  ext_synced_at?: string | null;
}

export type AttendanceStatusValue = 'present' | 'late' | 'absent' | 'excused' | 'early_leave';

export interface AttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatusValue;
  checked_in_at: string | null;
  source: 'heyyoung' | 'manual';
  note: string | null;
}

export type ExamKind = 'midterm' | 'final' | 'quiz' | 'other';

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  midterm: '중간고사',
  final: '기말고사',
  quiz: '쪽지시험',
  other: '기타',
};

export interface Exam {
  id: string;
  course_id: string;
  kind: ExamKind;
  title: string;
  max_points: number;
  held_on: string | null;
  ord: number;
}

export interface ExamScore {
  exam_id: string;
  student_id: string;
  score: number | null;
  note: string | null;
}

export interface GradePolicy {
  course_id: string;
  attendance_pct: number;
  task_pct: number;
  midterm_pct: number;
  final_pct: number;
  peer_pct: number;
  late_credit: number;
  excused_credit: number;
  absence_limit: number;
  /** 0007 — 감점으로 만드는 기타 성적 */
  etc_pct: number;
  etc_base: number;
}

export interface FinalGrade {
  id: string;
  course_id: string;
  student_id: string;
  attendance_pts: number | null;
  task_pts: number | null;
  midterm_pts: number | null;
  final_pts: number | null;
  peer_pts: number | null;
  etc_pts: number | null;
  deduction_total: number | null;
  total: number | null;
  letter: string | null;
  sessions_total: number | null;
  sessions_credited: number | null;
  absence_rate: number | null;
  over_absence: boolean;
  override_total: number | null;
  note: string | null;
  status: 'draft' | 'approved';
  computed_at: string;
}

// ── 감점 요소 · 기타 성적 (0007) ─────────────────────────────
export type DeductionSource =
  | 'manual'
  | 'attendance_late'
  | 'attendance_early_leave'
  | 'attendance_absent'
  | 'task_missing'
  | 'task_late';

export const DEDUCTION_SOURCE_LABEL: Record<DeductionSource, string> = {
  manual: '직접 입력',
  attendance_late: '출결에서 자동 (지각)',
  attendance_early_leave: '출결에서 자동 (조퇴)',
  attendance_absent: '출결에서 자동 (결석)',
  task_missing: '과제에서 자동 (미제출)',
  task_late: '과제에서 자동 (지각 제출)',
};

export interface DeductionKind {
  id: string;
  course_id: string;
  code: string;
  label: string;
  points: number;
  source: DeductionSource;
  ord: number;
  active: boolean;
}

export interface DeductionRow {
  id: string;
  kind_id: string;
  student_id: string;
  count: number;
  note: string | null;
  occurred_on: string | null;
}

/** deduction_summary() RPC 가 돌려주는 한 줄. */
export interface DeductionSummaryRow {
  student_id: string;
  kind_id: string;
  code: string;
  label: string;
  cnt: number;
  points: number;
  subtotal: number;
}

// ════════════════════════════════════════════════════════════
//  설문 · 프로젝트 평가 단계 · 대시보드 (0009)
// ════════════════════════════════════════════════════════════

export type SurveyStatus = 'draft' | 'open' | 'closed';

export const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: '준비중',
  open: '진행중',
  closed: '마감',
};

export type QuestionKind = 'scale' | 'choice' | 'text';

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  scale: '점수 (1~N)',
  choice: '보기 중 하나',
  text: '서술',
};

export interface Survey {
  id: string;
  course_id: string;
  week_id: string | null;
  title: string;
  intro: string | null;
  anonymous: boolean;
  opens_at: string | null;
  closes_at: string | null;
  status: SurveyStatus;
  created_at: string;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  ord: number;
  label: string;
  kind: QuestionKind;
  choices: string[] | null;
  scale_max: number;
  required: boolean;
}

/** survey_summary() RPC 가 돌려주는 한 줄. */
export interface SurveySummaryRow {
  question_id: string;
  label: string;
  kind: QuestionKind;
  scale_max: number;
  answers: number;
  avg_num: number | null;
  breakdown: Record<string, number>;
  texts: string[];
}

export type EvalPhase = 'none' | 'pre' | 'result';

export const PHASE_LABEL: Record<EvalPhase, string> = {
  none: '단계 없음',
  pre: '프로젝트 사전평가',
  result: '프로젝트 결과평가',
};

/** project_eval_summary() 한 줄 — 대상 × 루브릭 항목. */
export interface ProjectEvalRow {
  activity_id: string;
  activity_title: string;
  target_id: string;
  target_label: string;
  team_id: string | null;
  student_id: string | null;
  item_id: string;
  item_label: string;
  item_max: number;
  item_weight: number;
  avg_score: number | null;
  raters: number;
}

/** project_eval_totals() 한 줄 — 대상별 총점·등수. */
export interface ProjectEvalTotal {
  activity_id: string;
  activity_title: string;
  target_id: string;
  target_label: string;
  team_id: string | null;
  student_id: string | null;
  raters: number;
  avg_total: number | null;
  rank_no: number;
}

/** course_overview() 가 돌려주는 숫자 묶음. */
export interface CourseOverview {
  students: number;
  teams: number;
  weeks: number;
  weeks_open: number;
  sessions: number;
  notices: number;
  materials: number;
  tasks: number;
  tasks_open: number;
  surveys: number;
  surveys_open: number;
  activities: number;
  activities_open: number;
  sessions_blank: number;
  attendance_marked: number;
  late: number;
  absent: number;
  deduction_total: number;
  grades_computed: number;
  grades_approved: number;
  last_task_sync: string | null;
}

export interface AttendanceRequestRow {
  id: string;
  course_id: string;
  student_id: string | null;
  applicant: string | null;
  kind: 'appeal' | 'excused';
  week_no: number | null;
  session_no: number | null;
  original: string | null;
  reason: string | null;
  result_raw: string | null;
  result: string | null;
  applied_at: string | null;
}
