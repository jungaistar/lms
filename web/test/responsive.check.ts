/**
 * 반응형 규칙이 살아 있는지 검사한다.
 *
 * 왜 필요한가 — 이 저장소에서 실제로 두 번 조용히 깨졌다.
 *
 *   ① `input[type='text']` 만 잡는 선택자 탓에 **type 을 안 적은 입력 칸**이
 *      테두리도 너비도 없이 글자 옆에 붙었다. 데스크톱에서도 티가 안 났다.
 *   ② 화면 코드에 `fontSize: 14` 가 인라인으로 박혀 있어서 아이폰 사파리가
 *      입력할 때마다 화면을 확대했다. 한 번 확대되면 되돌아오지 않는다.
 *
 * 둘 다 눈으로 보기 전에는 몰랐다. 그래서 CSS 를 글자로 읽어 규칙이 남아
 * 있는지 확인한다. 브라우저를 띄우지 않으므로 CI 에서도 돈다.
 *
 * 눈으로 보는 확인은 이걸로 대신할 수 없다 —
 * `npm run build && npm run responsive` 로 실제 폭에서 보는 절차는 그대로다.
 */
import { readFileSync } from 'node:fs';

/**
 * 주석을 먼저 걷어낸다.
 *
 * 이걸 빼먹었더니 검사가 **주석에 적힌 규칙 이름**을 보고 통과했다.
 * 실제 선택자를 지워도 "왜 필요한지" 적어 둔 주석이 남아 있어서 초록불이 떴다.
 * 검사가 스스로를 속인 것이라 잡아 두는 게 맞다.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, why?: string) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name}${why ? `\n      ${why}` : ''}`);
  }
}

/** 공백을 눌러서 비교한다 — 줄바꿈이나 들여쓰기가 바뀌어도 통과해야 한다. */
const flat = css.replace(/\s+/g, ' ');
const flatHtml = html.replace(/\s+/g, ' ');

/**
 * `@media (max-width: N)` 블록의 알맹이를 꺼낸다.
 * 중첩이 없는 파일이라 중괄호를 세어 짝을 맞추면 충분하다.
 */
function mediaBlock(maxWidth: number): string {
  const head = `@media (max-width: ${maxWidth}px)`;
  let out = '';
  let from = 0;
  for (;;) {
    const at = css.indexOf(head, from);
    if (at < 0) break;
    let i = css.indexOf('{', at);
    let depth = 0;
    const start = i;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out += css.slice(start, i);
    from = i;
  }
  return out.replace(/\s+/g, ' ');
}

const m900 = mediaBlock(900);
const m640 = mediaBlock(640);

// ════════════════════════════════════════════════════════════
//  화면 폭 선언
// ════════════════════════════════════════════════════════════
check(
  'viewport meta 가 있다',
  /name="viewport"/.test(flatHtml) && /width=device-width/.test(flatHtml),
  'width=device-width 가 없으면 폰이 980px 짜리 데스크톱 화면을 축소해서 보여 준다.',
);
check(
  '노치 대응(viewport-fit=cover)',
  /viewport-fit=cover/.test(flatHtml),
  '아이폰 노치·홈바 영역까지 배경이 차게 하려면 필요하다.',
);

// ════════════════════════════════════════════════════════════
//  입력 칸 — 두 번 깨졌던 자리
// ════════════════════════════════════════════════════════════
check(
  "type 을 안 적은 input 도 스타일을 받는다",
  /input:not\(\[type\]\)/.test(flat),
  "`<input value={x} />` 처럼 type 을 안 적은 칸은 input[type='text'] 에 안 걸린다. " +
    'input:not([type]) 를 지우면 그런 칸이 전부 민짜가 된다.',
);

check(
  '입력 기본 글자가 16px 이상이다',
  /font-size: 16px;[^}]*\/\* iOS/.test(css) || /font-size: 16px;/.test(flat),
  'iOS 사파리는 16px 미만 입력에 포커스가 가면 화면을 확대한다.',
);

check(
  '좁은 화면에서 입력 글자를 16px 로 강제한다',
  /input, select, textarea \{ font-size: 16px !important; \}/.test(m900),
  '화면 코드에 인라인으로 박힌 14px 를 되돌리는 규칙이다. ' +
    '이게 없으면 아이폰에서 입력할 때마다 화면이 확대된다.',
);

check(
  '좁은 화면에서 누르는 대상이 44px 이상이다',
  /min-height: 44px/.test(m900),
  '손가락으로 누르는 대상은 44px 이상이어야 한다.',
);

// ════════════════════════════════════════════════════════════
//  관리자 메뉴 — 900px 에서 세로 메뉴 ↔ select
// ════════════════════════════════════════════════════════════
check(
  '넓은 화면 기본은 세로 메뉴다',
  /\.admin-shell \{[^}]*grid-template-columns: 232px/.test(flat),
  '901px 이상에서는 왼쪽 세로 메뉴 + 본문이다.',
);
check(
  '좁은 화면에서 세로 메뉴를 감춘다',
  /\.admin-nav \{ display: none; \}/.test(m900),
  '가로로 눕히면 18개 중 3개만 보인다. 실제로 그래서 못 썼다.',
);
check(
  '좁은 화면에서 select 를 띄운다',
  /\.admin-picker \{ display: block;/.test(m900),
  'iOS·안드로이드가 자기 피커를 띄워 준다. optgroup 으로 그룹 이름도 남는다.',
);
check(
  'select 는 넓은 화면에서 감춰져 있다',
  /\.admin-picker \{ display: none; \}/.test(flat),
  '기본은 감춤이고 900px 이하에서만 켠다. 반대로 두면 데스크톱에 둘 다 나온다.',
);
check(
  '좁은 화면에서 본문이 한 칸으로 떨어진다',
  /\.admin-shell \{ grid-template-columns: minmax\(0, 1fr\)/.test(m900),
  '메뉴 자리를 비우고 본문이 폭을 다 쓴다.',
);

// ════════════════════════════════════════════════════════════
//  수업 중 체크 — 서서 손가락으로 누르는 화면
// ════════════════════════════════════════════════════════════
check(
  '폰에서 한 학생이 두 줄로 떨어진다',
  /\.live-row \.who \{ flex: 1 1 100%; \}/.test(m640),
  '이름 줄과 출결 버튼 줄을 나눈다. 한 줄에 몰면 버튼이 글자만큼 작아진다.',
);
check(
  '폰에서 출결 버튼이 폭을 고르게 나눈다',
  /\.live-row > \.btn-row > \.btn-sm \{ flex: 1 1 0;/.test(m640),
  '다섯 개가 한 줄에 고르게 놓여야 누를 수 있다.',
);

// ════════════════════════════════════════════════════════════
//  넓은 표 — 본문이 옆으로 밀리면 안 된다
// ════════════════════════════════════════════════════════════
check(
  '표는 자기 상자 안에서만 가로로 스크롤한다',
  /\.table-wrap \{ overflow-x: auto;/.test(flat),
  '이게 없으면 열이 많은 표 때문에 페이지 전체가 옆으로 밀린다.',
);
check(
  '집계표는 첫 열을 붙여 둔다',
  /\.pivot th:first-child, \.pivot td:first-child \{ position: sticky/.test(flat),
  '가로로 밀 때 누구 줄인지 보이지 않으면 표를 읽을 수 없다.',
);

// ════════════════════════════════════════════════════════════
//  격자 — 폭에 따라 열 수가 알아서 바뀐다
// ════════════════════════════════════════════════════════════
for (const [name, sel] of [
  ['개설 과목', '.course-grid'],
  ['숫자 타일', '.stat-grid'],
] as const) {
  check(
    `${name} 격자가 폭에 맞춰 접힌다`,
    new RegExp(`\\${sel} \\{[^}]*repeat\\(auto-fill, minmax\\(`).test(flat),
    `${sel} 에 고정 열 수를 박으면 좁은 화면에서 칸이 찌그러진다.`,
  );
}
check(
  '학생·교수 카드가 폰에서 작아진다',
  /\.role-art \{ width: 80px/.test(mediaBlock(560)),
  '그림이 108px 그대로면 360px 화면에서 두 장이 안 들어간다.',
);

// ════════════════════════════════════════════════════════════
//  본문이 가로로 밀리지 않는다
// ════════════════════════════════════════════════════════════
check(
  '컨테이너가 폭을 넘지 않는다',
  /\.container \{ width: 100%; max-width:/.test(flat),
  'max-width 없이 고정 width 를 주면 좁은 화면에서 페이지가 밀린다.',
);

/**
 * 가장 좁은 기기(360px)에서 본문을 밀어낼 만한 고정 폭이 있는지 훑는다.
 * `min-width` 가 360 을 넘는 규칙은 표(`table`)처럼 스크롤 상자 안에 든
 * 것만 허용한다.
 */
const wideMinWidths = [...css.matchAll(/([^{}]+)\{[^}]*min-width:\s*(\d{3,})px/g)]
  .map((m) => ({ sel: m[1]!.trim().split('\n').pop()!.trim(), px: Number(m[2]) }))
  .filter((r) => r.px > 360)
  .filter((r) => r.sel !== 'table'); // .table-wrap 이 스크롤을 받아 준다

check(
  '360px 를 넘기는 고정 폭이 없다',
  wideMinWidths.length === 0,
  `본문을 밀어낼 수 있는 규칙: ${wideMinWidths.map((r) => `${r.sel} (${r.px}px)`).join(', ')}`,
);

console.log(`\n통과 ${pass} · 실패 ${fail}\n`);
if (fail > 0) process.exit(1);
