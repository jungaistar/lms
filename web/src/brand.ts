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
  /**
   * 로고 심볼에 들어갈 한 글자.
   * **빈 문자열이면 심볼을 아예 그리지 않는다** — 지우지 말고 비워 둘 것.
   */
  mark: '',
} as const;

export const SERVICE = {
  /** 이 웹앱의 이름 */
  name: '상호평가 학습관리시스템',
  nameEn: 'PEER ASSESSMENT LMS',
  /** 히어로 아래 한 줄 설명 */
  summary:
    '발표 상호평가와 팀 기여도 평가를 한 곳에서 하고, 결과를 성적으로 정리합니다.',
} as const;

/**
 * 개설 과목. 홈에서 학생이 자기 수업을 골라 들어오는 입구다.
 *
 * `key` 는 홈 → 로그인으로 넘길 때만 쓰는 **힌트**다. 과목 id 도 수업코드도
 * 아니라서 밖에 드러나도 아무것도 열리지 않는다. 로그인한 뒤 서버가 명단에서
 * 찾아 준 과목이 여럿일 때 이 힌트로 하나를 미리 골라 줄 뿐이다.
 *
 * **어느 수업에 들어갈 수 있는지는 여기가 정하지 않는다.** 명단에 있고 교수가
 * 승인한 과목만 열린다 — 판정은 Edge Function 과 RLS 가 한다.
 * 과목이 바뀌면 이 배열만 고친다.
 */
export const COURSES: ReadonlyArray<{
  key: string;
  title: string;
  classNo: string;
  en: string;
  desc: string;
}> = [
  {
    key: 'art',
    title: '1인예술과창업실무',
    classNo: 'Y2',
    en: 'SOLO ART BUSINESS',
    desc: '혼자 활동하는 예술가가 자기 일을 사업으로 세우는 과정을 다룹니다.',
  },
  {
    key: 'ent',
    title: '창업과기업가정신',
    classNo: 'Y4',
    en: 'ENTREPRENEURSHIP',
    desc: '문제를 찾아 사업으로 옮기는 과정과 기업가로서의 태도를 익힙니다.',
  },
  {
    key: 'res',
    title: '자원관리능력',
    classNo: 'Y1',
    en: 'RESOURCE MANAGEMENT',
    desc: '시간 · 예산 · 사람 · 물적 자원을 계획하고 나누는 법을 다룹니다.',
  },
  {
    key: 'car',
    title: '취업과경력개발',
    classNo: 'Y3',
    en: 'CAREER DEVELOPMENT',
    desc: '자기 이해에서 시작해 목표 직무까지 이어지는 경력 설계를 합니다.',
  },
  {
    key: 'cul5',
    title: '문화예술콘텐츠창업',
    classNo: 'Y5',
    en: 'CULTURE CONTENTS STARTUP',
    desc: '문화예술 콘텐츠를 팀 프로젝트로 기획하고 사업 모델까지 만듭니다.',
  },
  {
    key: 'cul6',
    title: '문화예술콘텐츠창업',
    classNo: 'Y6',
    en: 'CULTURE CONTENTS STARTUP',
    desc: '문화예술 콘텐츠를 팀 프로젝트로 기획하고 사업 모델까지 만듭니다.',
  },
];

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
  // 학생 전원에게 보이는 화면이라 개인 이메일은 싣지 않는다.
  // 문의는 연구소 홈으로 받는다. 다시 싣고 싶으면 여기만 채우면 된다.
  email: '',
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
  student:
    '이메일 · 학번 · 이름을 넣으면 교수님이 올린 명단과 맞춰 봅니다. ' +
    '처음이면 승인을 기다린 뒤 들어오고, 그 다음부터는 바로 들어옵니다.',
  privacy: '평가는 익명으로 처리되며, 점수는 어떤 화면에서도 학생에게 공개되지 않습니다.',
} as const;
