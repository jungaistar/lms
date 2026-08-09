/**
 * 사이트 표기 정보 — **여기 한 곳만 고치면 사이트 전체 표기가 바뀐다.**
 *
 * 화면에 찍히는 문자열일 뿐이다. 권한·소유권 판정과는 아무 관계가 없다
 * (그건 DB의 RLS 와 `is_admin()` 이 한다). 이 파일을 고쳐도 남의 과목은 열리지 않는다.
 *
 * 학교/기관이 바뀌면 `ORG` 와 `OWNER`, `CONTACT` 만 갈아끼우면 된다.
 */

export const ORG = {
  /** 국문 정식 명칭 */
  name: '직업미래연구소',
  /** 로고 옆에 얹는 영문 표기 (대문자 + 자간 넓게 쓰인다) */
  nameEn: 'JOB FUTURE INSTITUTE',
  /** 로고 심볼에 들어갈 한 글자 */
  mark: '직',
} as const;

export const SERVICE = {
  /** 이 웹앱의 이름 */
  name: '동료평가 학습보조 시스템',
  nameEn: 'PEER ASSESSMENT SYSTEM',
  /** 히어로 아래 한 줄 설명 */
  summary:
    '발표 상호평가 · 토론 참여 · 팀 기여도 · 과제 동료 첨삭을 한 곳에서 하고, 결과를 성적으로 정리합니다.',
} as const;

export const OWNER = {
  name: '정동엽',
  nameEn: 'Jung Dong Yeop',
  degree: '직업학박사',
  role: '직업미래연구소 소장',
  affiliation: '동아방송예술대학교 창의융합교양학부 겸임교수',
} as const;

/**
 * 공개 연락처. 학생에게 노출할 값만 둔다.
 * 빈 문자열로 두면 그 항목은 화면에서 사라진다 — 지우지 말고 비워 둘 것.
 *
 * 휴대폰 번호는 일부러 비워 두었다. 학생 전원에게 공개되는 화면이라
 * 개인 번호 대신 이메일과 연구소 홈으로 받는다.
 */
export const CONTACT: { email: string; phone: string; site: string; siteLabel: string } = {
  email: 'radical8566@gmail.com',
  phone: '',
  site: 'https://jdy.dreamitbiz.com',
  siteLabel: '직업미래연구소',
};

/** 푸터의 바로가기 목록 */
export const EXTERNAL_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: '직업미래연구소', href: 'https://jdy.dreamitbiz.com' },
  { label: '연구 블로그', href: 'https://jungaistar.github.io' },
];

export const COPYRIGHT = `© ${new Date().getFullYear()} ${ORG.name} (Job Future Institute). All rights reserved.`;

/**
 * 학생용 안내 문구. 로그인 화면과 랜딩에서 함께 쓰인다.
 * 학기마다 바뀌는 말은 여기서 고친다.
 */
export const NOTICE = {
  student: '수업 중에 알려드린 수업코드와 본인 학번으로 들어옵니다. 가입 절차는 없습니다.',
  privacy: '평가는 익명으로 처리되며, 점수는 어떤 화면에서도 학생에게 공개되지 않습니다.',
} as const;
