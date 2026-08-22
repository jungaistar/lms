/* ===========================================================================
   SVG 인포그래픽 모음
   ---------------------------------------------------------------------------
   슬라이드에 들어가는 그림은 전부 여기서 SVG 문자열로 만든다.
   색은 『창업과 기업가 정신』 자료의 값을 그대로 옮긴 것이다 (theme.css 와 같다).
   SVG 안에서는 CSS 변수가 안 통하므로 리터럴로 둔다.

   같은 그림이 한 문서에 여러 번 들어가므로 id 는 반드시 uid() 로 만들 것 —
   겹치면 url(#…) 과 <textPath href> 가 첫 번째 것으로 몰린다.
   =========================================================================== */

const C = {
  cyan: '#00A5DE', blue400: '#4BA3E3', blue500: '#0071CE', blue: '#005BAC',
  blue700: '#0B4E8A', navy: '#17365D', navy900: '#002A55',
  soft: '#DEEBF7', soft2: '#F2F7FC', soft3: '#E4F0FA', line: '#9DC3E6', line2: '#D4DCE6',
  red: '#C00000', redTint: '#FDF3F3', orange: '#ED7D31', gold: '#D9A441',
  ink: '#3B3838', ink2: '#63666B', ink3: '#8A8F96', white: '#FFFFFF',
};

const KR = 'Noto Sans KR, sans-serif';
const NUM = 'Outfit, sans-serif';
const EMO = 'Noto Color Emoji, sans-serif';

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
export function stripes(w = 1280, h = 26) {
  const g1 = uid('stg'), g2 = uid('stg'), g3 = uid('stg');
  const grad = (id, col) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient>`;
  return `<svg class="stripes" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <defs>${grad(g1, C.blue)}${grad(g2, C.blue500)}${grad(g3, C.blue400)}</defs>
  <rect x="0" y="2"  width="${w * 0.58}" height="4" fill="url(#${g1})"/>
  <rect x="0" y="10" width="${w * 0.40}" height="4" fill="url(#${g2})"/>
  <rect x="0" y="18" width="${w * 0.28}" height="4" fill="url(#${g3})"/>
</svg>`;
}

/* ------------------------------------------------------------ 챕터 원형 배지 */
export function chapterBadge(no, label = '') {
  const arc = uid('chArc');
  /* 원의 왼쪽 절반은 슬라이드 밖으로 나간다. 보이는 오른쪽 위를 따라
     C H A P T E R 이 돌아간다 — 글자가 잘리지 않게 viewBox 위를 띄웠다. */
  return `<svg class="fig" viewBox="0 -18 116 138" aria-hidden="true">
  <defs><path id="${arc}" d="M48.9 -1.1 A64 64 0 0 1 88.2 86.6" fill="none"/></defs>
  <circle cx="30" cy="60" r="56" fill="#F4F5F7"/>
  <text font-family="${NUM}" font-size="11" font-weight="600" fill="${C.white}" letter-spacing="1.2">
    <textPath href="#${arc}" startOffset="50%" text-anchor="middle">C H A P T E R</textPath>
  </text>
  <text x="30" y="${label ? 60 : 74}" text-anchor="middle" font-family="${NUM}" font-size="38" font-weight="700" fill="${C.navy}">${no}</text>
  ${label ? `<text x="30" y="94" text-anchor="middle" font-family="${KR}" font-size="19" font-weight="800" fill="${C.navy}">${label}</text>` : ''}
</svg>`;
}

/* ------------------------------------------------------ 1. 성적 평가 도넛 */
export function gradeDonut(parts = []) {
  const cx = 236, cy = 236, ro = 168, ri = 92, gap = 1.6;
  const tone = [C.blue, C.blue500, C.blue400, '#7DB9E8'];
  let a = 0;
  const seg = parts.map((p, i) => {
    const span = (p.pct / 100) * 360;
    const o = { a0: a, a1: a + span, fill: tone[i % tone.length], label: p.label, pct: p.pct };
    a += span;
    return o;
  });
  const rad = (d) => ((d - 90) * Math.PI) / 180;

  const paths = seg.map((s) =>
    `<path d="${ring(cx, cy, ro, ri, s.a0 + gap, s.a1 - gap)}" fill="${s.fill}"/>`).join('\n  ');

  const labels = seg.map((s) => {
    const mid = (s.a0 + s.a1) / 2, r = (ro + ri) / 2;
    const x = cx + r * Math.cos(rad(mid)), y = cy + r * Math.sin(rad(mid));
    const lines = s.label.split('\n');
    const y0 = y - (lines.length * 15) + 6;
    return lines.map((t, i) =>
      `<text x="${x.toFixed(1)}" y="${(y0 + i * 19).toFixed(1)}" text-anchor="middle" font-family="${KR}" font-size="14" font-weight="800" fill="${C.white}">${t}</text>`
    ).join('') +
      `<text x="${x.toFixed(1)}" y="${(y0 + lines.length * 19).toFixed(1)}" text-anchor="middle" font-family="${NUM}" font-size="16" font-weight="700" fill="${C.white}">${s.pct}%</text>`;
  }).join('\n  ');

  const total = parts.reduce((n, p) => n + p.pct, 0);
  return `<svg class="fig" viewBox="0 0 472 472" role="img" aria-label="성적 구성비 ${parts.map((p) => `${p.label.replace(/\n/g, ' ')} ${p.pct}퍼센트`).join(', ')}">
  ${paths}
  ${labels}
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="${NUM}" font-size="52" font-weight="700" fill="${C.navy}">${total}</text>
  <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-family="${KR}" font-size="15" font-weight="700" fill="${C.ink2}">총점</text>
</svg>`;
}

/* --------------------------------------- 2·3. 네 칸 카드 (교과 목표 · 수업 목표) */
function quadCards(items) {
  const W = 1120, H = 300, cw = (W - 22) / 2, ch = (H - 20) / 2;
  const cells = items.map((it, i) => {
    const x = (i % 2) * (cw + 22), y = Math.floor(i / 2) * (ch + 20);
    const lines = it.slice(2);
    return `<g transform="translate(${x},${y})">
    <rect width="${cw}" height="${ch}" fill="${C.soft2}" stroke="${C.line}"/>
    <text x="26" y="52" font-family="${EMO}" font-size="30">${it[1]}</text>
    <text x="72" y="42" font-family="${KR}" font-size="16" font-weight="800" fill="${C.blue}">${it[0]}</text>
    ${lines.map((t, k) =>
      `<text x="72" y="${72 + k * 27}" font-family="${KR}" font-size="18" font-weight="${k === lines.length - 1 ? 700 : 500}" fill="${k === lines.length - 1 ? C.navy : C.ink}">${t}</text>`
    ).join('')}
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="${items.map((i) => i.slice(2).join(' ')).join(' / ')}">
  ${cells}
</svg>`;
}

export const goals4 = (items = []) => quadCards(items);
export const outcomes4 = (items = []) => quadCards(items);

/* ----------------------------------------------- 4. 행복한 삶 → 직업 → 역량 */
export function happiness() {
  const g = uid('hg');
  return `<svg class="fig" viewBox="0 0 560 330" role="img" aria-label="행복한 삶으로 가는 첫 걸음은 취업과 경력개발">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.blue}"/>
  </linearGradient></defs>
  <circle cx="280" cy="90" r="70" fill="url(#${g})"/>
  <text x="280" y="78" text-anchor="middle" font-family="${EMO}" font-size="32">😊</text>
  <text x="280" y="118" text-anchor="middle" font-family="${KR}" font-size="23" font-weight="800" fill="${C.white}">행복한 삶</text>

  <path d="M280 168 V198" stroke="${C.line}" stroke-width="3"/>
  <path d="M274 194 l6 10 6-10z" fill="${C.blue500}"/>

  <g transform="translate(140,206)">
    <rect width="280" height="46" fill="${C.soft}" stroke="${C.line}"/>
    <text x="140" y="31" text-anchor="middle" font-family="${KR}" font-size="19" font-weight="800" fill="${C.blue}">직업 = 자아실현의 공간</text>
  </g>
  <path d="M280 252 V276" stroke="${C.line}" stroke-width="3"/>

  <g font-family="${KR}" font-size="18" font-weight="700" fill="${C.navy}">
    <g transform="translate(14,278)"><rect width="164" height="44" fill="${C.white}" stroke="${C.line2}"/><text x="82" y="29" text-anchor="middle">나의 강점</text></g>
    <g transform="translate(198,278)"><rect width="164" height="44" fill="${C.white}" stroke="${C.line2}"/><text x="82" y="29" text-anchor="middle">흥미</text></g>
    <g transform="translate(382,278)"><rect width="164" height="44" fill="${C.white}" stroke="${C.line2}"/><text x="82" y="29" text-anchor="middle">가치관</text></g>
  </g>
</svg>`;
}

/* ------------------------------------------------------- 5. 과제 제출 타임라인 */
export function submitTimeline(d = {}) {
  const due = d.due || '3. 10, 23:59:59';
  const cls = d.lecture || '3. 11, 11:00';
  const arc = uid('tl');
  return `<svg class="fig" viewBox="0 0 1120 300" role="img" aria-label="과제물 제출 일시는 강의일 하루 전 ${due} 까지, 본 강의는 ${cls}">
  <line x1="150" y1="150" x2="1040" y2="150" stroke="${C.soft}" stroke-width="14" stroke-linecap="round"/>
  <path d="M1044 150 l-26 -14 v28z" fill="${C.soft}"/>

  <g transform="translate(58,112)">
    <path d="M38 0 l7 9 11-4 -2 12 11 5 -9 8 5 11 -12-1 -3 12 -9-8 -9 8 -3-12 -12 1 5-11 -9-8 11-5 -2-12 11 4z" fill="${C.blue400}"/>
    <text x="38" y="43" text-anchor="middle" font-family="${NUM}" font-size="15" font-weight="700" fill="${C.white}">ex</text>
  </g>

  <g>
    <circle cx="360" cy="150" r="17" fill="${C.red}"/>
    <text x="360" y="108" text-anchor="middle" font-family="${NUM}" font-size="25" font-weight="700" fill="${C.red}">${due}</text>
    <text x="360" y="205" text-anchor="middle" font-family="${KR}" font-size="21" font-weight="800" fill="${C.red}">과제물 제출 일시</text>
  </g>
  <g>
    <circle cx="800" cy="150" r="17" fill="${C.gold}"/>
    <text x="800" y="108" text-anchor="middle" font-family="${NUM}" font-size="25" font-weight="600" fill="${C.ink}">${cls}</text>
    <text x="800" y="205" text-anchor="middle" font-family="${KR}" font-size="21" font-weight="800" fill="${C.ink}">본 강의</text>
  </g>

  <path id="${arc}" d="M790 232 Q580 312 372 244" fill="none" stroke="#C87B72" stroke-width="4"/>
  <path d="M372 244 l22 -2 -12 -14z" fill="#C87B72"/>
  <text x="580" y="288" text-anchor="middle" font-family="${KR}" font-size="18" font-weight="800" fill="#B0655C">강의일 하루 전까지</text>
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
    const y = i * 72, last = i === steps.length - 1;
    return `<g transform="translate(0,${y})">
    <rect x="0" y="0" width="640" height="58" fill="${last ? C.soft : C.white}" stroke="${last ? C.blue : C.line2}" stroke-width="${last ? 2 : 1}"/>
    <rect x="0" y="0" width="6" height="58" fill="${last ? C.blue : C.blue400}"/>
    <circle cx="38" cy="29" r="17" fill="${last ? C.blue : C.blue500}"/>
    <text x="38" y="36" text-anchor="middle" font-family="${NUM}" font-size="18" font-weight="700" fill="${C.white}">${s[0]}</text>
    <text x="70" y="26" font-family="${KR}" font-size="20" font-weight="800" fill="${C.navy}">${s[1]}</text>
    <text x="70" y="47" font-family="${KR}" font-size="15" font-weight="600" fill="${C.ink2}">${s[2]}</text>
    ${last ? '' : `<path d="M320 60 l-8 0 8 10 8-10z" fill="${C.line}"/>`}
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 640 348" role="img" aria-label="고용24에서 대학생 진로준비도검사까지 가는 다섯 단계">
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
    const x = (i % 2) * 320, y = Math.floor(i / 2) * 152, sel = c[3];
    return `<g transform="translate(${x},${y})">
    <rect x="6" y="6" width="298" height="134" fill="${sel ? C.soft2 : C.white}" stroke="${sel ? C.red : C.line2}" stroke-width="${sel ? 2.5 : 1}"/>
    <rect x="22" y="22" width="${22 + c[0].length * 15}" height="26" rx="13" fill="${C.soft}" stroke="${C.line}"/>
    <text x="33" y="40" font-family="${KR}" font-size="14" font-weight="700" fill="${C.blue}">${c[0]}</text>
    <text x="22" y="76" font-family="${KR}" font-size="19" font-weight="800" fill="${C.navy}">${c[1]}</text>
    <rect x="150" y="98" width="140" height="30" fill="${sel ? C.blue : C.blue500}"/>
    <text x="220" y="118" text-anchor="middle" font-family="${KR}" font-size="15" font-weight="700" fill="${C.white}">검사 실시 (${c[2]})</text>
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 630 300" role="img" aria-label="고용24 직업심리검사 목록에서 대학생 진로준비도검사를 고른다">
  ${out}
</svg>`;
}

/* ------------------------------------------------- 8. 생성형 AI 사용 흐름 */
export function aiFlow() {
  const steps = [
    ['STEP 1', 'AI 초안', '생성형 AI 사용', '허용',        C.soft2, C.line,  C.navy,  C.blue],
    ['STEP 2', '재해석 · 변형', '그대로 쓰지 않는다', '필수', C.soft,  C.line,  C.navy,  C.blue],
    ['STEP 3', '핵심 · 결론', '아이디어 · 최종 분석', '사람이 직접 작성', C.blue, C.blue, C.white, '#FFE14D'],
  ];
  const out = steps.map((s, i) => {
    const x = i * 172;
    return `<g transform="translate(${x},0)">
    <text x="76" y="14" text-anchor="middle" font-family="${NUM}" font-size="13" font-weight="700" letter-spacing="1" fill="${C.blue500}">${s[0]}</text>
    <rect x="0" y="26" width="152" height="86" fill="${s[4]}" stroke="${s[5]}" stroke-width="1.5"/>
    <text x="76" y="56" text-anchor="middle" font-family="${KR}" font-size="19" font-weight="800" fill="${s[6]}">${s[1]}</text>
    <text x="76" y="79" text-anchor="middle" font-family="${KR}" font-size="13" font-weight="600" fill="${s[6] === C.white ? '#CFE6F7' : C.ink2}">${s[2]}</text>
    <text x="76" y="99" text-anchor="middle" font-family="${KR}" font-size="14" font-weight="800" fill="${s[7]}">${s[3]}</text>
    ${i === steps.length - 1 ? '' : `<path d="M156 62 l14 7 -14 7z" fill="${C.blue500}"/><path d="M152 69 h8" stroke="${C.blue500}" stroke-width="3"/>`}
  </g>`;
  }).join('\n  ');
  return `<svg class="fig" viewBox="0 0 500 116" role="img" aria-label="1단계 AI 초안 허용, 2단계 재해석·변형 필수, 3단계 핵심과 결론은 사람이 직접 작성">
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
  outcomes4:      { title: '수업 목표 달성 네 가지',    src: '1주차 원본 7쪽' },
  happiness:      { title: '행복한 삶과 진로',        src: '1주차 원본 5쪽' },
  submitTimeline: { title: '과제물 제출 타임라인',      src: '1주차 원본 13쪽' },
  work24Path:     { title: '고용24 접속 경로',        src: '1주차 원본 21·22쪽' },
  testCards:      { title: '직업심리검사 목록',        src: '1주차 원본 23쪽' },
  aiFlow:         { title: '생성형 AI 사용 흐름',      src: '이번에 추가' },
};

/* 자료 전체에 되풀이되는 장식 요소 */
export const MOTIFS = {
  stripes:      { title: '3중 스트라이프',   src: '학교 자료 공통', make: () => stripes(1280, 26) },
  chapterBadge: { title: '챕터 원형 배지',   src: '학교 자료 공통', make: () => chapterBadge(1),
                  frameBg: 'linear-gradient(90deg,#00A5DE,#005BAC)' },
  headerBar:    { title: '헤더 그라디언트 띠', src: '학교 자료 공통', make: headerBar },
  wordmark:     { title: 'dima 워드마크',    src: '학교 자료 공통', make: wordmark },
};

function headerBar() {
  const g = uid('hdr');
  return `<svg viewBox="0 0 1280 56" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset=".52" stop-color="${C.blue500}"/><stop offset="1" stop-color="${C.blue}"/>
  </linearGradient></defs>
  <rect width="1280" height="56" fill="url(#${g})"/>
  <rect x="44" y="11" width="150" height="34" fill="${C.navy900}" fill-opacity=".30" stroke="#FFF100" stroke-width="2"/>
  <text x="119" y="34" text-anchor="middle" font-family="${KR}" font-size="18" font-weight="800" fill="${C.white}">섹션 이름</text>
</svg>`;
}

function wordmark() {
  return `<svg viewBox="0 0 220 96" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="76" font-family="${NUM}" font-size="84" font-weight="800" letter-spacing="-4.6" fill="${C.navy}">dima</text>
  <circle cx="43" cy="14" r="8" fill="${C.navy}"/>
</svg>`;
}
