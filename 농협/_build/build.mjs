/* ==========================================================================
   농협사료 클론 실습 — 빌드 스크립트
   --------------------------------------------------------------------------
   _build/parts/*  (공용 CSS · JS · 헤더 · 푸터)
   _build/pages/*  (페이지별 조각)
        ↓  합친다
   농협/*.html     (CSS · JS 가 전부 <style> · <script> 안에 들어간 단일 파일)

   실행:  node _build/build.mjs
   외부 패키지를 쓰지 않는다. Node 18 이상이면 그대로 돈다.
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(BUILD, '..');            // 농협/
const read  = (p) => readFileSync(p, 'utf8');

/* --- 공용 조각 ---------------------------------------------------------- */
const sharedCss = read(join(BUILD, 'parts/style.css'));
const sharedJs  = read(join(BUILD, 'parts/common.js'));
const header    = read(join(BUILD, 'parts/header.html'));
const footer    = read(join(BUILD, 'parts/footer.html'));

/* --- 페이지 조각 파서 ---------------------------------------------------- */
// <!--@meta {...}--> · <!--@style--> … <!--@/style--> 형태의 구역을 잘라낸다
function section(src, name) {
  const re = new RegExp(`<!--@${name}-->([\\s\\S]*?)<!--@/${name}-->`);
  const m  = src.match(re);
  return m ? m[1].trim() : '';
}
function meta(src) {
  const m = src.match(/<!--@meta([\s\S]*?)-->/);
  if (!m) throw new Error('@meta 구역이 없습니다');
  return JSON.parse(m[1].trim());
}

/* --- 탭 아이콘 (외부 요청 없이 인라인 SVG data URI) ---------------------- */
// 탭 제목 바로 옆에 붙는 자리라 글자를 넣지 않는다 — 도형만.
const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#00A651"/>' +
    '<path d="M16 6c5 3 8 6.5 8 11a8 8 0 0 1-16 0c0-4.5 3-8 8-11Z" fill="#fff" opacity=".92"/>' +
    '<path d="M16 11v12" stroke="#00A651" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>'
  );

/* --- 한 페이지 조립 ------------------------------------------------------ */
function buildPage(file) {
  const src  = read(join(BUILD, 'pages', file));
  const m    = meta(src);
  const css  = section(src, 'style');
  const body = section(src, 'body');
  const js   = section(src, 'script');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<title>${m.title}</title>
<meta name="description" content="${m.desc}">
<meta property="og:title" content="${m.title}">
<meta property="og:description" content="${m.desc}">
<meta property="og:type" content="website">
<link rel="icon" href="${favicon}">
<style>
${sharedCss}

/* ===== 이 페이지에만 쓰는 스타일 ===== */
${css}
</style>
<noscript><style>
/* 스크립트가 꺼져 있으면 등장 애니메이션 대상이 영영 안 보인다 — 그때는 그냥 보여 준다 */
.reveal{opacity:1 !important; transform:none !important}
</style></noscript>
</head>
<body data-page="${m.key}">

${header}

<main id="main">
${body}
</main>

${footer}

<script>
${sharedJs}
</script>
${js ? `<script>\n${js}\n</script>` : ''}
</body>
</html>
`;
}

/* --- 전체 실행 ----------------------------------------------------------- */
const pages = readdirSync(join(BUILD, 'pages')).filter((f) => f.endsWith('.html')).sort();
let total = 0;

for (const file of pages) {
  const html = buildPage(file);
  const out  = join(ROOT, basename(file));
  writeFileSync(out, html, 'utf8');
  total += html.length;
  console.log(`  ✓ ${basename(file).padEnd(16)} ${(html.length / 1024).toFixed(1)} KB`);
}

console.log(`\n${pages.length}개 페이지, 합계 ${(total / 1024).toFixed(1)} KB`);
console.log('브라우저로 농협/index.html 을 바로 열면 된다 (서버 없이 동작).');
