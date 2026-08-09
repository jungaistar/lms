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
}

export type AttendanceStatusValue = 'present' | 'late' | 'absent' | 'excused';

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
