/**
 * 확인된 엔드포인트 정의. 상세 설명은 docs/02-endpoints.md 참고.
 *
 * 여기에는 **조회 엔드포인트만** 존재한다.
 * 저장/수정 엔드포인트는 파라미터가 확인되지 않았으므로 추가하지 말 것.
 * 쓰기는 src/automation/ 의 브라우저 자동화 경로로만 수행한다.
 */

export type Method = 'GET' | 'POST';

export interface Endpoint {
  readonly method: Method;
  readonly path: string;
  /** 이 엔드포인트가 반드시 요구하는 파라미터 이름 */
  readonly requires: readonly string[];
  readonly note?: string;
}

const ep = (method: Method, path: string, requires: readonly string[] = [], note?: string): Endpoint =>
  ({ method, path, requires, note });

export const ENDPOINTS = {
  // ── 전역 / 세션 ────────────────────────────────────────
  sessionInfo: ep('POST', '/lms/common/select/getSessionInfo.dunet', [], '세션 생존 확인'),
  myCourses: ep('POST', '/lms/myLecture/doListView.dunet', [], '담당 과목 목록 — course_id 수집 시작점'),

  // ── 강의실 ────────────────────────────────────────────
  classroom: ep('POST', '/lms/class/classroom/doViewClassRoom.dunet', ['course_id', 'class_no']),
  classroomNew: ep('POST', '/lms/class/classroom/doViewClassRoom_new.dunet', ['course_id', 'class_no']),
  coursePlan: ep('GET', '/lms/class/coursePlan/doListView.dunet', ['course_id', 'class_no']),
  courseContents: ep('GET', '/lms/class/course/manage/doListCourseContents.dunet', ['course_id', 'class_no']),
  studyCondition: ep('GET', '/lms/class/studyCondition/doStudyListView.dunet', ['course_id', 'class_no'], '진도율·참여율'),

  // ── 게시판 (동일 엔드포인트 + board_no 로 구분) ──────────
  boardList: ep('GET', '/lms/class/boardItem/doListView.dunet', ['course_id', 'class_no', 'board_no']),

  // ── 과제 ──────────────────────────────────────────────
  reportList: ep('GET', '/lms/class/report/prof/doListView.dunet', ['course_id', 'class_no'], '주차별 과제 목록'),
  reportMarkList: ep('POST', '/lms/class/report/prof/doMarkView.dunet', ['course_id', 'class_no', 'report_no'], '학생별 제출 여부 + 현재 점수'),
  reportSubmission: ep(
    'GET',
    '/lms/class/report/prof/doFormReportMark.dunet',
    ['course_id', 'class_no', 'report_no', 'report_seq', 'user_no', 'gubun'],
    '제출 내용·첨부·코멘트·현재 점수. gubun=mark',
  ),

  // ── 성적 ──────────────────────────────────────────────
  scoreList: ep('POST', '/lms/class/courseScoreManage/doListView.dunet', ['course_id', 'class_no']),
  scoreStudents: ep('POST', '/lms/common/courseScoreManage/doListCourseStudent.dunet', ['course_id', 'class_no'], '학생 그리드 데이터 — 성적표 핵심'),
  scorePageInfo: ep('POST', '/lms/common/courseScoreManage/doGetPageInfo.dunet', ['course_id', 'class_no'], '평가항목·가중치 메타데이터'),

  // ── 기타 활동 ─────────────────────────────────────────
  quizList: ep('GET', '/lms/class/exam/manage/doListView.dunet', ['course_id', 'class_no']),
  surveyList: ep('GET', '/lms/class/survey/control/doListView.dunet', ['course_id', 'class_no']),
  surveyApplyCount: ep('POST', '/lms/class/survey/control/doGetSurveyApplyCnt.dunet', ['course_id', 'class_no']),
  discussList: ep('GET', '/lms/class/discuss/prof/doListView.dunet', ['course_id', 'class_no']),
  teamProjectList: ep('GET', '/lms/class/teamproject/prof/doListView.dunet', ['course_id', 'class_no']),
  assistList: ep('GET', '/lms/class/assist/prof/doListView.dunet', ['course_id', 'class_no']),
} as const satisfies Record<string, Endpoint>;

/** 게시판 종류별 board_no. 네 게시판이 같은 엔드포인트를 공유한다. */
export const BOARD_NO = {
  notice: 7, // 공지사항
  archive: 6, // 자료실
  qna: 5, // 질문답변
  free: 20, // 자유게시판
} as const;

export type BoardKind = keyof typeof BOARD_NO;

/**
 * ⛔ 미확인 — 절대 구현하지 말 것.
 * 개별 점수 저장 / 일괄 수정 / 성적 확정.
 * 파라미터와 서버측 검증 로직을 파악하지 못했으며, 잘못 호출하면 성적이 손상된다.
 * 이 작업들은 src/automation/submitScores.ts 의 브라우저 경로로 수행한다.
 */
export const UNVERIFIED_WRITE_ENDPOINTS = Object.freeze([
  'doSaveReportMark.dunet (추정)',
  '점수 일괄 수정 (미상)',
  '성적 확정 (미상)',
]);
