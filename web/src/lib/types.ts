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
