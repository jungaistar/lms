import type { Course } from '../lib/types';

/**
 * 과목 관리 콘솔의 왼쪽 메뉴.
 *
 * 짜임새는 rest.dreamitbiz.com 의 "관리자 메뉴" 를 그대로 따랐고,
 * 과목 안의 항목 이름은 학교 LMS(lms.dima.ac.kr) 강의실 메뉴를 따랐다.
 * 두 곳을 로그인 상태로 직접 보고 옮긴 것이다.
 *
 * 여기서 항목을 감추는 것은 **화면 정리일 뿐**이다.
 * 권한은 전부 RLS 가 판단한다 — 이 파일을 고쳐도 남의 과목은 열리지 않는다.
 */
export type MenuKey =
  | 'dashboard'
  | 'roster'
  | 'match'
  | 'access'
  | 'contacts'
  | 'teams'
  | 'weeks'
  | 'weekly'
  | 'notices'
  | 'materials'
  | 'tasks'
  | 'tasksync'
  | 'surveys'
  | 'attendance'
  | 'daily'
  | 'live'
  | 'message'
  | 'deduction'
  | 'rubric'
  | 'activity'
  | 'pre'
  | 'result'
  | 'grades';

export interface MenuItem {
  key: MenuKey;
  label: string;
  icon: IconName;
  /** 메뉴 아래 붙는 한 줄 설명. 좁은 화면에서는 감춘다. */
  hint?: string;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export type IconName =
  | 'chart'
  | 'people'
  | 'compare'
  | 'key'
  | 'team'
  | 'calendar'
  | 'megaphone'
  | 'folder'
  | 'pencil'
  | 'sync'
  | 'poll'
  | 'check'
  | 'phone'
  | 'grid'
  | 'bolt'
  | 'send'
  | 'minus'
  | 'ruler'
  | 'star'
  | 'flag'
  | 'trophy'
  | 'award';

export function buildMenu(course: Course): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      title: '현황',
      items: [{ key: 'dashboard', label: '대시보드', icon: 'chart', hint: '과목 전체를 한 눈에' }],
    },
    {
      title: '수강생',
      items: [
        { key: 'roster', label: '수강생 관리', icon: 'people', hint: '명단 · 제외 · 복귀' },
        { key: 'match', label: '명단 대조', icon: 'compare', hint: '학교 LMS 명단과 맞추기' },
        { key: 'access', label: '입장 승인', icon: 'key', hint: '이메일 · 학번 · 이름 대조' },
        { key: 'contacts', label: '연락처 관리', icon: 'phone', hint: '헤이영 전화번호 · 가입 이메일' },
        { key: 'teams', label: '팀 편성', icon: 'team', hint: '팀 만들기 · 배정' },
      ],
    },
    {
      title: '수업 운영',
      items: [
        { key: 'weeks', label: '주/회차 관리', icon: 'calendar', hint: '주차 · 회차 · 공개' },
        { key: 'weekly', label: '주차별 명단', icon: 'grid', hint: '미제출 · 결석 · 전화번호' },
        { key: 'notices', label: '과목 공지', icon: 'megaphone' },
        { key: 'materials', label: '자료 관리', icon: 'folder', hint: '학습자료실 · 강의계획서' },
        { key: 'tasks', label: '과제 관리', icon: 'pencil', hint: '출제 · 채점' },
        { key: 'tasksync', label: '과제 제출현황', icon: 'sync', hint: '학교 LMS 에서 가져오기' },
        { key: 'surveys', label: '설문 등록 · 결과', icon: 'poll' },
      ],
    },
    {
      title: '출결 · 기타',
      items: [
        { key: 'attendance', label: '출석 관리', icon: 'check', hint: '출결일지 · 헤이영' },
        { key: 'daily', label: '일자별 기록', icon: 'grid', hint: '출결 · 수업태도 · 과제를 날짜별로' },
        { key: 'live', label: '수업 중 체크', icon: 'bolt', hint: '지각 · 태도를 그 자리에서' },
        { key: 'message', label: '문자 · 알림', icon: 'send', hint: '헤이영 문자 · 메일 · 카톡' },
        { key: 'deduction', label: '기타 · 감점', icon: 'minus', hint: '기타 점수를 만드는 항목' },
      ],
    },
  ];

  if (course.peer_assessment) {
    groups.push({
      title: '상호평가',
      items: [
        { key: 'rubric', label: '루브릭', icon: 'ruler' },
        { key: 'activity', label: '평가 활동', icon: 'star' },
      ],
    });
  }

  if (course.project_mode !== 'none') {
    groups.push({
      title: '프로젝트',
      items: [
        { key: 'pre', label: '사전평가 집계표', icon: 'flag', hint: '항목별 평균 · 등수' },
        { key: 'result', label: '결과평가 집계표', icon: 'trophy', hint: '항목별 평균 · 등수' },
      ],
    });
  }

  groups.push({
    title: '성적',
    items: [{ key: 'grades', label: '학습평가 성적', icon: 'award', hint: '구성비 · 산출 · 확정' }],
  });

  return groups;
}

/** 모든 그룹을 훑어 키가 살아 있는지 본다. 주소에 이상한 값이 와도 튕기지 않게. */
export function isMenuKey(groups: MenuGroup[], key: string): key is MenuKey {
  return groups.some((g) => g.items.some((i) => i.key === key));
}
