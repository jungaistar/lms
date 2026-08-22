/* ===========================================================================
   SVG 인포그래픽 모음
   ---------------------------------------------------------------------------
   슬라이드에 들어가는 그림은 전부 여기서 SVG 문자열로 만든다. 색은 원본
   디자인의 값을 리터럴로 박는다 (SVG 는 CSS 변수를 못 읽는 자리가 있다).
   =========================================================================== */

const C = {
  cyan: '#0A9EE0', cyanLight: '#41B6E6', blue: '#0070C0', blueDeep: '#0057A0',
  navy: '#0B2A4A', soft: '#DCE9F8', soft2: '#EDF4FC', line: '#9DC3E6',
  amber: '#FFD78F', amberLine: '#E8A33D', red: '#C00000', ink: '#16181D',
  ink2: '#3D4450', ink3: '#6B7280', white: '#FFFFFF', grey: '#D9E2EC',
};

/* 한 HTML 문서에 같은 그림이 여러 번 들어간다. id 가 겹치면 <textPath href>
   와 gradient 참조가 첫 번째 것으로 몰리므로 부를 때마다 번호를 붙인다. */
let seq = 0;
const uid = (base) => `${base}${++seq}`;

/* 도넛 조각 하나의 path — 바깥 반지름 ro, 안쪽 ri, 각도는 도(度) */
function ring(cx, cy, ro, ri, a0, a1) {
  const rad = (d) => ((d - 90) * Math.PI) / 180;
  const p = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x1, y1] = p(ro, a0), [x2, y2] = p(ro, a1);
  const [x3, y3] = p(ri, a1), [x4, y4] = p(ri, a0);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${ro} ${ro} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}` +
         `L${x3.toFixed(2)} ${y3.toFixed(2)}A${ri} ${ri} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}

/* --------------------------------------------------- 3중 스트라이프 (시그니처) */
export function stripes(w = 1280, h = 30) {
  const g1 = uid('stg'), g2 = uid('stg'), g3 = uid('stg');
  return `<svg class="stripes" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="${g1}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${g2}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${g3}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.cyanLight}"/><stop offset="1" stop-color="${C.cyanLight}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="2"  width="${w * 0.62}" height="4" fill="url(#${g1})"/>
  <rect x="0" y="11" width="${w * 0.42}" height="5" fill="url(#${g2})"/>
  <rect x="0" y="21" width="${w * 0.31}" height="5" fill="url(#${g3})"/>
</svg>`;
}

/* ------------------------------------------------------------ 챕터 반원 배지 */
export function chapterBadge(no) {
  const arc = uid('chArc');
  return `<svg class="fig" viewBox="0 0 120 216" aria-hidden="true">
  <defs><path id="${arc}" d="M29 14.4 A98 98 0 0 1 97.3 96.2" fill="none"/></defs>
  <path d="M0 22 A86 86 0 0 1 0 194 Z" fill="#EDEFF2"/>
  <text font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#FFFFFF" letter-spacing="0.8">
    <textPath href="#${arc}" startOffset="50%" text-anchor="middle">C H A P T E R</textPath>
  </text>
  <text x="40" y="128" text-anchor="middle" font-family="Outfit, sans-serif" font-size="46" font-weight="700" fill="#3D4450">${no}</text>
</svg>`;
}

/* ------------------------------------------------------ 1. 성적 평가 도넛 */
export function gradeDonut() {
  const cx = 235, cy = 250, ro = 158, ri = 60, g = 2.4;
  const seg = [
    { a0: 0,   a1: 108, label: ['출석', '30%'],            fill: C.white, stroke: C.line, text: C.red,  bold: true },
    { a0: 108, a1: 180, label: ['중간 시험', '(조별발표)', '20%'], fill: C.soft2, stroke: C.line, text: C.blueDeep },
    { a0: 180, a1: 252, label: ['기말시험', '20%'],         fill: C.white, stroke: C.line, text: C.blueDeep },
    { a0: 252, a1: 360, label: ['과제물,', '수업태도', '30%'],  fill: C.soft2, stroke: C.line, text: C.blueDeep },
  ];
  const rad = (d) => ((d - 90) * Math.PI) / 180;
  const paths = seg.map((s) =>
    `<path d="${ring(cx, cy, ro, ri, s.a0 + g, s.a1 - g)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="2"/>`
  ).join('\n  ');
  const labels = seg.map((s) => {
    const mid = (s.a0 + s.a1) / 2, r = (ro + ri) / 2 + 12;
    const x = cx + r * Math.cos(rad(mid)), y = cy + r * Math.sin(rad(mid));
    const y0 = y - ((s.label.length - 1) * 13);
    return s.label.map((t, i) =>
      `<text x="${x.toFixed(1)}" y="${(y0 + i * 27).toFixed(1)}" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="${s.bold ? 25 : 21}" font-weight="${s.bold ? 800 : 700}" fill="${s.text}">${t}</text>`
    ).join('');
  }).join('\n  ');

  return `<svg class="fig" viewBox="0 0 470 470" role="img" aria-label="성적 평가 비율: 출석 30퍼센트, 중간시험 조별발표 20퍼센트, 기말시험 20퍼센트, 과제물과 수업태도 30퍼센트">
  <rect x="6" y="6" width="458" height="458" rx="10" fill="#EEF4FC" stroke="${C.line}"/>
  ${paths}
  ${labels}
  <g transform="translate(258,18)">
    <rect width="200" height="62" rx="6" fill="${C.blue}"/>
    <text x="18" y="40" font-family="Outfit, sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">+</text>
    <text x="50" y="38" font-family="Noto Sans KR, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">취·창업 및 진로상담</text>
  </g>
  <path d="M330 88 l9 22 24 2 -18 16 5 24 -20-13 -20 13 5-24 -18-16 24-2z" fill="#FFE14D" stroke="${C.amberLine}" stroke-width="2"/>
</svg>`;
}

/* -------------------------------------------------------- 2. 교과 목표 4단 */
export function goals4(items = []) {
  const rows = items.map((it, i) => {
    const y = 8 + i * 96;
    return `<g transform="translate(0,${y})">
    <rect x="0" y="0" width="1120" height="82" rx="10" fill="${i % 2 ? C.soft2 : C.white}" stroke="${C.line}"/>
    <rect x="0" y="0" width="7" height="82" rx="3" fill="${C.blue}"/>
    <circle cx="52" cy="41" r="25" fill="${C.blue}"/>
    <text x="52" y="49" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="800" fill="#FFFFFF">${it[0]}</text>
    <text x="94" y="35" font-family="Noto Sans KR, sans-serif" font-size="22" font-weight="600" fill="${C.ink2}">${it[1]}</text>
    <text x="94" y="65" font-family="Noto Sans KR, sans-serif" font-size="22" font-weight="700" fill="${C.navy}">${it[2]}</text>
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 1120 392" role="img" aria-label="교과 목표 네 가지">
  ${rows}
</svg>`;
}

/* --------------------------------------------- 3. 수업 목표 달성 4가지 계단 */
export function outcomes4(items = []) {
  const cols = items.map((it, i) => {
    const x = i * 285, h = 190 + i * 34, y = 300 - h;
    return `<g transform="translate(${x},0)">
    <rect x="10" y="${y}" width="262" height="${h}" rx="12" fill="${C.white}" stroke="${C.line}" stroke-width="2"/>
    <rect x="10" y="${y}" width="262" height="46" rx="12" fill="${C.blue}"/>
    <rect x="10" y="${y + 30}" width="262" height="16" fill="${C.blue}"/>
    <text x="141" y="${y + 31}" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF">${it[0]}</text>
    <text x="141" y="${y + 100}" text-anchor="middle" font-family="Noto Color Emoji, sans-serif" font-size="38">${it[1]}</text>
    <text x="141" y="${y + 140}" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="600" fill="${C.ink2}">${it[2]}</text>
    <text x="141" y="${y + 166}" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="700" fill="${C.navy}">${it[3]}</text>
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 1140 316" role="img" aria-label="한 학기를 마치면 달성하는 네 가지 목표">
  <path d="M0 306 H1140" stroke="${C.line}" stroke-width="2"/>
  ${cols}
</svg>`;
}

/* ----------------------------------------------- 4. 행복한 삶 → 직업 → 역량 */
export function happiness() {
  const g = uid('hg');
  return `<svg class="fig" viewBox="0 0 560 330" role="img" aria-label="행복한 삶으로 가는 첫 걸음은 취업과 경력개발">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.blue}"/>
    </linearGradient>
  </defs>
  <circle cx="280" cy="92" r="72" fill="url(#${g})"/>
  <text x="280" y="80" text-anchor="middle" font-family="Noto Color Emoji, sans-serif" font-size="34">😊</text>
  <text x="280" y="120" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">행복한 삶</text>

  <path d="M280 172 V200" stroke="${C.line}" stroke-width="3"/>
  <path d="M274 196 l6 10 6-10z" fill="${C.blue}"/>

  <g transform="translate(140,208)">
    <rect width="280" height="46" rx="23" fill="${C.soft}" stroke="${C.line}"/>
    <text x="140" y="31" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="20" font-weight="800" fill="${C.blueDeep}">직업 = 자아실현의 공간</text>
  </g>

  <g font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="700" fill="${C.navy}">
    <g transform="translate(14,278)">
      <rect width="164" height="44" rx="10" fill="${C.white}" stroke="${C.line}"/>
      <text x="82" y="29" text-anchor="middle">나의 강점</text>
    </g>
    <g transform="translate(198,278)">
      <rect width="164" height="44" rx="10" fill="${C.white}" stroke="${C.line}"/>
      <text x="82" y="29" text-anchor="middle">흥미</text>
    </g>
    <g transform="translate(382,278)">
      <rect width="164" height="44" rx="10" fill="${C.white}" stroke="${C.line}"/>
      <text x="82" y="29" text-anchor="middle">가치관</text>
    </g>
  </g>
  <path d="M280 254 V272" stroke="${C.line}" stroke-width="3"/>
</svg>`;
}

/* ------------------------------------------------------- 5. 과제 제출 타임라인 */
export function submitTimeline() {
  return `<svg class="fig" viewBox="0 0 1120 210" role="img" aria-label="과제물 제출 일시는 강의 하루 전 23시 59분 59초까지">
  <line x1="74" y1="120" x2="1060" y2="120" stroke="${C.line}" stroke-width="6" stroke-linecap="round"/>
  <path d="M1060 120 l-22 -11 v22z" fill="${C.blue}"/>

  <g transform="translate(180,0)">
    <rect x="0" y="16" width="330" height="76" rx="10" fill="${C.amber}" stroke="${C.amberLine}" stroke-width="2"/>
    <text x="165" y="46" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="800" fill="#4A3208">과제물 제출 마감</text>
    <text x="165" y="76" text-anchor="middle" font-family="Outfit, sans-serif" font-size="24" font-weight="700" fill="#4A3208">3. 10.  23:59:59</text>
    <circle cx="165" cy="120" r="14" fill="${C.amberLine}" stroke="#FFFFFF" stroke-width="4"/>
    <text x="165" y="166" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="18" font-weight="700" fill="${C.ink3}">강의 하루 전</text>
  </g>

  <g transform="translate(650,0)">
    <rect x="0" y="16" width="330" height="76" rx="10" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>
    <text x="165" y="46" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="800" fill="${C.blueDeep}">본 강의</text>
    <text x="165" y="76" text-anchor="middle" font-family="Outfit, sans-serif" font-size="24" font-weight="700" fill="${C.blueDeep}">3. 11.  11:00</text>
    <circle cx="165" cy="120" r="14" fill="${C.blue}" stroke="#FFFFFF" stroke-width="4"/>
    <text x="165" y="166" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="18" font-weight="700" fill="${C.ink3}">수업 시작</text>
  </g>
  <text x="18" y="100" font-family="Noto Sans KR, sans-serif" font-size="17" font-weight="700" fill="${C.ink3}">예시</text>
</svg>`;
}

/* ------------------------------------------------------- 6. 고용24 접속 경로 */
export function work24Path() {
  const steps = [
    ['1', '고용24 접속', 'work24.go.kr'],
    ['2', '취업지원', '상단 메뉴'],
    ['3', '직업심리검사', '취업가이드 안'],
    ['4', '대학생 진로준비도검사', '검사 대상: 대학생'],
    ['5', '검사 실시 (20분)', '결과 캡처 → LMS 제출'],
  ];
  const rows = steps.map((s, i) => {
    const y = i * 74;
    const last = i === steps.length - 1;
    return `<g transform="translate(0,${y})">
    <rect x="0" y="0" width="640" height="60" rx="10" fill="${last ? C.amber : C.white}" stroke="${last ? C.amberLine : C.line}" stroke-width="2"/>
    <circle cx="34" cy="30" r="18" fill="${last ? '#B4741A' : C.blue}"/>
    <text x="34" y="38" text-anchor="middle" font-family="Outfit, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${s[0]}</text>
    <text x="66" y="27" font-family="Noto Sans KR, sans-serif" font-size="21" font-weight="800" fill="${last ? '#4A3208' : C.navy}">${s[1]}</text>
    <text x="66" y="49" font-family="Noto Sans KR, sans-serif" font-size="16" font-weight="600" fill="${last ? '#6B4A10' : C.ink3}">${s[2]}</text>
    ${last ? '' : `<path d="M320 62 l-8 0 8 10 8-10z" fill="${C.line}"/>`}
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 640 360" role="img" aria-label="고용24에서 대학생 진로준비도검사까지 가는 다섯 단계">
  ${rows}
</svg>`;
}

/* --------------------------------------------------- 7. 진로준비도 검사 카드 */
export function testCards() {
  const cards = [
    ['진로(취업)준비도', '진로준비진단검사(찾아Dream)', '2분', false],
    ['진로준비도', '대학생진로준비도검사', '20분', true],
    ['역량', '창업적성검사', '20분', false],
    ['흥미', '직업흥미탐색검사(간편형)', '5분', false],
  ];
  const out = cards.map((c, i) => {
    const x = (i % 2) * 320, y = Math.floor(i / 2) * 152;
    const sel = c[3];
    return `<g transform="translate(${x},${y})">
    <rect x="6" y="6" width="298" height="134" rx="10" fill="#FFFFFF" stroke="${sel ? C.red : C.grey}" stroke-width="${sel ? 3 : 1.5}"/>
    <rect x="22" y="22" width="${22 + c[0].length * 15}" height="26" rx="13" fill="${C.soft2}" stroke="${C.line}"/>
    <text x="${33}" y="40" font-family="Noto Sans KR, sans-serif" font-size="14" font-weight="700" fill="${C.blueDeep}">${c[0]}</text>
    <text x="22" y="76" font-family="Noto Sans KR, sans-serif" font-size="19" font-weight="800" fill="${C.navy}">${c[1]}</text>
    <rect x="150" y="98" width="140" height="30" rx="6" fill="${sel ? C.blue : '#4A5DBE'}"/>
    <text x="220" y="118" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="15" font-weight="700" fill="#FFFFFF">검사 실시 (${c[2]})</text>
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 630 300" role="img" aria-label="고용24 직업심리검사 목록에서 대학생 진로준비도검사를 고른다">
  ${out}
</svg>`;
}

/* ------------------------------------------------- 8. 생성형 AI 사용 흐름 */
export function aiFlow() {
  const steps = [
    ['🤖', '초안', 'AI 사용 허용', C.soft2, C.line, C.blueDeep],
    ['🧠', '재해석 · 발전', '사람이 변형한다', C.soft, C.line, C.blueDeep],
    ['✍️', '핵심 · 결론', '반드시 사람이 직접', C.amber, C.amberLine, '#4A3208'],
    ['🔖', '출처 · 프롬프트', '반드시 명시한다', '#FFFFFF', C.red, C.red],
  ];
  const out = steps.map((s, i) => {
    const x = i * 272;
    return `<g transform="translate(${x},0)">
    <rect x="0" y="10" width="248" height="150" rx="14" fill="${s[3]}" stroke="${s[4]}" stroke-width="2"/>
    <text x="124" y="64" text-anchor="middle" font-family="Noto Color Emoji, sans-serif" font-size="38">${s[0]}</text>
    <text x="124" y="104" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="23" font-weight="800" fill="${s[5]}">${s[1]}</text>
    <text x="124" y="133" text-anchor="middle" font-family="Noto Sans KR, sans-serif" font-size="17" font-weight="600" fill="${C.ink2}">${s[2]}</text>
    ${i === steps.length - 1 ? '' : `<path d="M252 78 l14 7 -14 7z" fill="${C.blue}"/><path d="M248 85 h8" stroke="${C.blue}" stroke-width="3"/>`}
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 1090 174" role="img" aria-label="생성형 AI 사용 흐름: 초안은 AI, 재해석과 핵심 결론은 사람, 출처와 프롬프트는 반드시 명시">
  ${out}
</svg>`;
}

export const FIGURES = {
  gradeDonut, goals4, outcomes4, happiness,
  submitTimeline, work24Path, testCards, aiFlow,
};

/* 홀로 쓸 수 있는 .svg 파일로 뽑을 때 붙이는 설명 — dist/svg/ 로 나간다 */
export const FIGURE_META = {
  gradeDonut:     { title: '성적 평가 구성비',        src: '1주차 원본 9쪽' },
  goals4:         { title: '교과 목표 네 가지',        src: '1주차 원본 6쪽' },
  outcomes4:      { title: '수업 목표 달성 네 단계',    src: '1주차 원본 7쪽' },
  happiness:      { title: '행복한 삶과 진로',        src: '1주차 원본 5쪽' },
  submitTimeline: { title: '과제물 제출 타임라인',      src: '1주차 원본 13쪽' },
  work24Path:     { title: '고용24 접속 경로',        src: '1주차 원본 21·22쪽' },
  testCards:      { title: '직업심리검사 목록',        src: '1주차 원본 23쪽' },
  aiFlow:         { title: '생성형 AI 사용 흐름',      src: '이번에 추가' },
};

/* 자료 전체에 되풀이되는 장식 요소 (2주차 자료의 시각 언어) */
export const MOTIFS = {
  stripes:      { title: '3중 스트라이프',  src: '2주차 디자인', make: () => stripes(1280, 30) },
  chapterBadge: { title: '챕터 반원 배지',  src: '2주차 디자인', make: () => chapterBadge(1),
                  frameBg: 'linear-gradient(100deg,#0A9EE0,#0070C0)' },   // 흰 호 글자가 보이도록
  headerBar:    { title: '헤더 그라디언트 띠', src: '2주차 디자인', make: headerBar },
  wordmark:     { title: 'dima 워드마크',   src: '2주차 디자인', make: wordmark },
};

function headerBar() {
  return `<svg viewBox="0 0 1280 74" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset=".46" stop-color="#0086CE"/><stop offset="1" stop-color="${C.blue}"/>
  </linearGradient></defs>
  <rect width="1280" height="74" fill="url(#hdr)"/>
</svg>`;
}

function wordmark() {
  return `<svg viewBox="0 0 220 96" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="76" font-family="Outfit, Arial, sans-serif" font-size="84" font-weight="800" letter-spacing="-3.8" fill="${C.navy}">dima</text>
  <circle cx="45" cy="14" r="8" fill="${C.navy}"/>
</svg>`;
}
