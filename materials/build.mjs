#!/usr/bin/env node
/* ===========================================================================
   학습자료 빌드
   ---------------------------------------------------------------------------
     week01/slides.mjs (내용 한 벌)
        ├─ dist/<slug>.md      Markdown (Marp 호환 — 슬라이드로 바로 변환된다)
        ├─ dist/<slug>.html    HTML 슬라이드 (발표 · 인쇄 · 브라우저 편집)
        └─ dist/canvas/*.dc.html + canvas.json   디자인 캔버스 아트보드

   사용법:  node materials/build.mjs [week01]
   =========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES, FIGURE_META, MOTIFS } from './figures.mjs';
import { stripes, chapterBadge } from './figures.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const week = process.argv[2] || 'week01';
const { meta, slides } = await import(`./${week}/slides.mjs`);

const FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&family=Outfit:wght@600;700;800&family=Noto+Color+Emoji&display=swap';

/* 그림을 Markdown 으로 옮길 때 쓰는 설명 — 그림이 나르는 정보를 글로 남긴다 */
const FIGURE_MD = {
  happiness: '**[인포그래픽]** 행복한 삶 ← 직업(자아실현의 공간) ← 나의 강점 · 흥미 · 가치관',
  goals4: '**[인포그래픽]** 교과 목표 네 가지 — 아래 목록과 같은 내용',
  outcomes4: '**[인포그래픽]** 수업 목표 달성 네 단계 — 아래 목록과 같은 내용',
  gradeDonut: '**[인포그래픽]** 성적 구성비 도넛 — 출석 30% · 중간시험(조별발표) 20% · 기말시험 20% · 과제물/수업태도 30% (＋ 취·창업 및 진로상담)',
  submitTimeline: '**[인포그래픽]** 과제물 제출 타임라인 — 예) 마감 3.10. 23:59:59 → 본 강의 3.11. 11:00',
  work24Path: '**[인포그래픽]** 고용24 접속 경로 — ① 고용24 접속(work24.go.kr) → ② 취업지원 → ③ 직업심리검사 → ④ 대학생 진로준비도검사 → ⑤ 검사 실시(20분), 결과 캡처 후 LMS 제출',
  testCards: '**[인포그래픽]** 직업심리검사 목록 — 진로준비진단검사(찾아Dream, 2분) / **대학생진로준비도검사(20분)** / 창업적성검사(20분) / 직업흥미탐색검사 간편형(5분)',
  aiFlow: '**[인포그래픽]** 초안(AI 허용) → 재해석·발전(사람) → 핵심·결론(반드시 사람) → 출처·프롬프트(반드시 명시)',
};

/* ------------------------------------------------------------------ 인라인 */
const EMOJI = /\p{Extended_Pictographic}️?/gu;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineHTML(s) {
  let out = esc(s);
  out = out.replace(EMOJI, (m) => `<i class="emo">${m}</i>`);
  out = out.replace(/\*\*(.+?)\*\*/g, '<b class="strong">$1</b>');
  out = out.replace(/!!(.+?)!!/g, '<em class="em">$1</em>');
  return out.replace(/\n/g, '<br>');
}

function inlineMD(s) {
  const strong = (_, inner, after) =>
    (/[\p{L}\p{N}]/u.test(after) && !/[\p{L}\p{N}]$/u.test(inner))
      ? `<strong>${inner}</strong>${after}`   // ‘…’** 뒤에 조사가 붙는 자리
      : `**${inner}**${after}`;
  return String(s)
    .replace(/!!(.+?)!!/g, '**$1**')
    .replace(/\*\*(.+?)\*\*(.?)/gu, strong)
    .replace(/\n/g, '<br>');
}

/* ------------------------------------------------------------ 블록 → HTML */
function blockHTML(b) {
  switch (b.t) {
    case 'h':
      return `<h3 class="h-sub">${inlineHTML(b.text)}</h3>`;
    case 'p':
      return `<p class="p${b.lg ? ' p--lg' : ''}">${inlineHTML(b.text)}</p>`;
    case 'ul': {
      const cls = { check: ' list--check', arrow: ' list--arrow', num: ' list--num' }[b.style] || '';
      return `<ul class="list${cls}">${b.items.map((i) => `<li>${inlineHTML(i)}</li>`).join('')}</ul>`;
    }
    case 'callout': {
      const tone = { line: ' callout--line', blue: ' callout--blue', red: ' callout--red' }[b.tone] || '';
      const emo = b.emoji ? `<i class="emo">${b.emoji}</i>` : '';
      return `<p class="callout${tone}">${emo}${inlineHTML(b.text)}</p>`;
    }
    case 'note':
      return `<p class="note">${inlineHTML(b.text)}</p>`;
    case 'link':
      return `<a class="linkbox" href="${esc(b.href)}" target="_blank" rel="noopener">` +
             `<i class="emo">🔗</i><span class="linkbox__body">` +
             `<b class="linkbox__label">${inlineHTML(b.label)}</b>` +
             `<span class="linkbox__url">${esc(b.href)}</span></span></a>`;
    case 'card':
      return cardHTML(b, false);
    case 'cards':
      return `<div class="cards cards--${b.cols || 3}">${b.items.map((i) => cardHTML(i, b.soft)).join('')}</div>`;
    case 'fig':
      return `<div class="fig-wrap"${b.max ? ` style="max-height:${b.max}px"` : ''}>${FIGURES[b.name](b.data)}</div>`;
    case 'table':
      return tableHTML(b);
    case 'cols': {
      const ratio = { 'wide-left': ' slide__cols--wide-left', 'wide-right': ' slide__cols--wide-right' }[b.ratio] || '';
      const side = (bs) => `<div class="stack">${bs.map(blockHTML).join('')}</div>`;
      return `<div class="slide__cols${ratio}">${side(b.left)}${side(b.right)}</div>`;
    }
    default:
      throw new Error(`알 수 없는 블록: ${b.t}`);
  }
}

function cardHTML(c, soft) {
  const bits = [];
  if (c.emoji) bits.push(`<span class="card__emo emo">${c.emoji}</span>`);
  if (c.badge) bits.push(`<span class="card__badge">${esc(c.badge)}</span>`);
  bits.push(`<span class="card__title">${inlineHTML(c.title)}</span>`);
  if (c.text) bits.push(`<span class="card__text">${inlineHTML(c.text)}</span>`);
  return `<div class="card${soft ? ' card--soft' : ''}">${bits.join('')}</div>`;
}

function tableHTML(b) {
  const cols = b.cols ? `<colgroup>${b.cols.map((c) => `<col class="${c}">`).join('')}</colgroup>` : '';
  const head = `<thead><tr>${b.head.map((h) => `<th>${inlineHTML(h)}</th>`).join('')}</tr></thead>`;
  const body = b.rows.map((r, ri) => {
    const cur = b.current === ri ? ' class="is-current"' : '';
    const cells = r.map((c, ci) => {
      const cls = [];
      if (b.center) cls.push('c');
      if (b.firstCol === 'head' && ci === 0) cls.push('c');
      const mark = b.taskCol === ci && c ? ' class="mark"' : '';
      const inner = mark ? `<span${mark}>${inlineHTML(c)}</span>` : inlineHTML(c);
      return `<td${cls.length ? ` class="${cls.join(' ')}"` : ''}>${inner}</td>`;
    }).join('');
    return `<tr${cur}>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tbl ${b.className || ''}">${cols}${head}<tbody>${body}</tbody></table></div>`;
}

/* ------------------------------------------------------------- 슬라이드 셸 */
const WORDMARK = (dark) => `<span class="wordmark${dark ? ' wordmark--dark' : ''}">d<i>i</i>ma</span>`;

function slideHTML(s, n) {
  const attrs = `id="s${String(n).padStart(2, '0')}" data-index="${n}" data-kind="${s.kind}" data-name="${esc(s.name)}"`;
  const no = `<span class="slide__no">${n}</span>`;

  if (s.kind === 'cover') {
    return `<section class="slide slide--cover" ${attrs}>
  <div class="cover__band"></div>
  <div class="cover__stripes">${stripes()}</div>
  <div class="cover__inner" data-edit>
    <p class="cover__course">${esc(s.course)}</p>
    <h1 class="cover__title">${esc(s.title)}</h1>
  </div>
  <div class="cover__mark">${WORDMARK(false)}</div>
  <div class="cover__meta" data-edit><b>${esc(s.dept)}</b><span>${esc(s.professor)}</span></div>
</section>`;
  }

  if (s.kind === 'toc') {
    const rows = s.items.map((it, i) => `<li class="toc__row">
      <span class="toc__no">${i + 1}</span>
      <span class="toc__label">${inlineHTML(it)}</span>
    </li>`).join('');
    return `<section class="slide slide--toc" ${attrs}>
  <header class="slide__head"><span class="slide__eyebrow"></span>${WORDMARK(false)}</header>
  <div class="slide__body" data-edit>
    <h2 class="toc__title">목차 <span class="toc__bar">|</span> <span class="toc__en">CONTENTS</span></h2>
    <ol class="toc">${rows}</ol>
  </div>
  ${no}
</section>`;
  }

  if (s.kind === 'chapter') {
    return `<section class="slide slide--chapter" ${attrs}>
  <div class="chapter__band"></div>
  <div class="chapter__stripes">${stripes()}</div>
  <div class="chapter__badge">${chapterBadge(s.no)}</div>
  <h2 class="chapter__title" data-edit>${esc(s.title)}</h2>
  <p class="chapter__sub" data-edit>${esc(s.sub)}</p>
  <div class="chapter__mark">${WORDMARK(true)}</div>
  ${no}
</section>`;
  }

  if (s.kind === 'closing') {
    return `<section class="slide slide--closing" ${attrs}>
  <div class="cover__band" style="height:100%"></div>
  <h2 class="closing__title" data-edit>${esc(s.title)}</h2>
  ${no}
</section>`;
  }

  if (s.kind === 'next') {
    return `<section class="slide slide--next" ${attrs}>
  <div class="chapter__band"></div>
  <div class="chapter__stripes">${stripes()}</div>
  <div class="chapter__badge">${chapterBadge(s.no)}</div>
  <p class="next__lines" data-edit>${s.lines.map(esc).join('<br>')}</p>
  <h2 class="next__title" data-edit>${esc(s.title)}</h2>
  <p class="next__sub" data-edit>${esc(s.sub)}</p>
  <div class="chapter__mark">${WORDMARK(true)}</div>
  ${no}
</section>`;
  }

  /* content */
  const eyebrow = s.plain
    ? `<span class="slide__section slide__section--plain">${esc(s.section)}</span>`
    : `${s.chapNo ? `<span class="slide__chapno">${s.chapNo}</span>` : ''}<span class="slide__section">${esc(s.section)}</span>`;
  const lede = s.lede ? `<h2 class="slide__lede">${inlineHTML(s.lede)}</h2>` : '';
  return `<section class="slide slide--content${s.dense ? ' is-dense' : ''}${s.tiny ? ' is-tiny' : ''}" ${attrs}>
  <header class="slide__head"><span class="slide__eyebrow">${eyebrow}</span>${WORDMARK(false)}</header>
  <div class="slide__body" data-edit>
    ${lede}
    ${s.blocks.map(blockHTML).join('\n    ')}
  </div>
  ${no}
</section>`;
}

/* ----------------------------------------------------------- 블록 → Markdown */
function blockMD(b, out) {
  switch (b.t) {
    case 'h': out.push(`### ${inlineMD(b.text)}`, ''); break;
    case 'p': out.push(inlineMD(b.text), ''); break;
    case 'note': out.push(`<small>${inlineMD(b.text)}</small>`, ''); break;
    case 'ul':
      b.items.forEach((i, k) => out.push(`${b.style === 'num' ? `${k + 1}.` : '-'} ${inlineMD(i)}`));
      out.push('');
      break;
    case 'callout':
      out.push(`> ${b.emoji ? b.emoji + ' ' : ''}${inlineMD(b.text).replace(/<br>/g, ' ')}`, '');
      break;
    case 'link': out.push(`- [${inlineMD(b.label)}](${b.href})`, ''); break;
    case 'card': cardMD(b, out); break;
    case 'cards': b.items.forEach((c) => cardMD(c, out)); break;
    case 'fig':
      out.push(`> ${FIGURE_MD[b.name]}`, '');
      if (b.data) {
        b.data.forEach((row) => {
          const [label, ...rest] = row;
          const body = rest.filter((t) => !/^\p{Extended_Pictographic}/u.test(t)).join(' ');
          out.push(`- **${label}** ${inlineMD(body)}`);
        });
        out.push('');
      }
      break;
    case 'table': tableMD(b, out); break;
    case 'cols': b.left.forEach((x) => blockMD(x, out)); b.right.forEach((x) => blockMD(x, out)); break;
    default: throw new Error(`알 수 없는 블록: ${b.t}`);
  }
}

function cardMD(c, out) {
  const head = `${c.emoji ? c.emoji + ' ' : ''}**${inlineMD(c.title)}**${c.badge ? ` \`${c.badge}\`` : ''}`;
  out.push(`- ${head}`);
  if (c.text) String(c.text).split('\n').forEach((l) => out.push(`  - ${inlineMD(l)}`));
  out.push('');
}

function tableMD(b, out) {
  out.push(`| ${b.head.map(inlineMD).join(' | ')} |`);
  out.push(`| ${b.head.map(() => '---').join(' | ')} |`);
  b.rows.forEach((r) => out.push(`| ${r.map((c) => inlineMD(c) || ' ').join(' | ')} |`));
  out.push('');
}

function slideMD(s, n, out) {
  out.push(`<!-- 슬라이드 ${n} · ${s.name} -->`);
  if (s.kind === 'cover') {
    out.push(`# ${s.title}`, '', `**${s.course}**`, '', `${s.dept} · ${s.professor}`, '');
    return;
  }
  if (s.kind === 'toc') {
    out.push('## 목차 | CONTENTS', '');
    s.items.forEach((it, i) => out.push(`${i + 1}. ${inlineMD(it)}`));
    out.push('');
    return;
  }
  if (s.kind === 'chapter') {
    out.push(`## CHAPTER ${s.no} — ${s.title}`, '', `_${s.sub}_`, '');
    return;
  }
  if (s.kind === 'closing') { out.push(`## ${s.title}`, ''); return; }
  if (s.kind === 'next') {
    out.push(`## ${s.title}`, '', `**${s.sub}**`, '', s.lines.map((l) => `_${l}_`).join(' '), '');
    return;
  }
  const dup = s.lede && (s.lede.includes(s.section) || s.section.includes(s.lede));
  const tail = s.lede && !dup ? ` — ${s.lede}` : '';
  const head = `## ${s.chapNo ? `${s.chapNo}. ` : ''}${dup ? s.lede : s.section}${tail}`;
  out.push(head, '');
  s.blocks.forEach((b) => blockMD(b, out));
}

/* ------------------------------------------------------------------ 산출물 */
const css = readFileSync(join(ROOT, 'theme.css'), 'utf8');

const EXTRA_CSS = `
/* --- 목차 --------------------------------------------------------------- */
.toc__title { font-size: 44px; font-weight: 800; color: #3D4450; letter-spacing: -.03em; display: flex; align-items: baseline; gap: 16px; }
.toc__bar { color: #9DC3E6; font-weight: 400; }
.toc__en { font-family: var(--dc-num); font-size: 27px; font-weight: 600; color: #6B7280; letter-spacing: .02em; }
.toc { list-style: none; margin: 22px 0 0; padding: 0 0 0 96px; display: flex; flex-direction: column; gap: 6px; }
.toc__row { display: flex; align-items: baseline; gap: 14px; padding-bottom: 6px; border-bottom: 2px solid; border-image: linear-gradient(90deg, #0A9EE0, rgba(10,158,224,0)) 1; }
.toc__no { font-family: var(--dc-num); font-size: 52px; font-weight: 600; color: #41B6E6; line-height: 1; min-width: 44px; }
.toc__label { font-size: 27px; font-weight: 800; color: #4A5260; letter-spacing: -.02em; }

/* --- 빽빽한 슬라이드 (나머지는 theme.css) ---------------------------------- */
.slide.is-dense .cards { gap: 11px; }
.slide.is-dense .card { padding: 12px 14px; gap: 4px; }
.slide.is-dense .card__title { font-size: 20px; }
.slide.is-dense .card__text { font-size: 16px; line-height: 1.38; }
.slide.is-dense .card__emo { font-size: 24px; }
.tbl--grade td { font-size: 20px; font-weight: 700; padding: 8px; }

/* --- 주차별 강의 계획 표: 15줄 한 화면 ------------------------------------- */
.slide .tbl.tbl--plan { font-size: 15px; line-height: 1.3; table-layout: fixed; }
.slide .tbl.tbl--plan th { padding: 6px 10px; font-size: 16px; }
.slide .tbl.tbl--plan td { padding: 3px 10px; }
.tbl--plan col.subject { width: 64%; }
.tbl--plan col.task { width: 36%; }
`;

const PAGE_CSS = `
/* ===== 뷰어 · 편집기 (인쇄에서는 전부 사라진다) ============================ */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #E8EBF0; color: #16181D;
  font-family: var(--dc-sans);
  padding: 74px 0 60px;
}
.bar {
  position: fixed; inset: 0 0 auto 0; z-index: 50; height: 58px;
  display: flex; align-items: center; gap: 10px; padding: 0 18px;
  background: rgba(11,42,74,.96); color: #fff;
  backdrop-filter: blur(6px);
}
.bar__title { font-weight: 800; font-size: 17px; letter-spacing: -.01em; margin-right: auto; }
.bar__title small { display: block; font-weight: 500; font-size: 12px; opacity: .72; }
.btn {
  appearance: none; border: 1px solid rgba(255,255,255,.28); border-radius: 8px;
  background: rgba(255,255,255,.08); color: #fff;
  font: inherit; font-size: 14px; font-weight: 700;
  min-height: 40px; padding: 0 14px; cursor: pointer;
}
.btn:hover { background: rgba(255,255,255,.18); }
.btn[aria-pressed="true"] { background: #0A9EE0; border-color: #0A9EE0; }
.bar select {
  font: inherit; font-size: 14px; min-height: 40px; max-width: 240px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,.28);
  background: rgba(255,255,255,.08); color: #fff; padding: 0 10px;
}
.bar select option { color: #16181D; }

.deck { display: flex; flex-direction: column; gap: 26px; padding: 26px 18px; margin: 0 auto; max-width: 1320px; }
.frame {
  position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
  background: #fff; border-radius: 10px;
  box-shadow: 0 2px 4px rgba(11,42,74,.10), 0 12px 30px rgba(11,42,74,.14);
}
.frame > .slide { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.frame__tag {
  position: absolute; left: 0; top: -22px; font-size: 12px; font-weight: 700;
  color: #55627A; letter-spacing: .02em;
}

/* 발표 모드 */
body.is-present { padding: 0; background: #0B1220; overflow: hidden; }
body.is-present .bar { background: rgba(11,18,32,.9); }
body.is-present .deck { padding: 0; max-width: none; height: 100vh; justify-content: center; }
body.is-present .frame { display: none; border-radius: 0; box-shadow: none; }
body.is-present .frame.is-live { display: block; width: 100vw; height: 100vh; aspect-ratio: auto; }
body.is-present .frame__tag { display: none; }

/* 편집 모드 */
body.is-edit [data-edit] { outline: 2px dashed rgba(10,158,224,.55); outline-offset: 3px; }
body.is-edit [data-edit]:focus-within { outline-color: #0070C0; outline-style: solid; }
.hint {
  max-width: 1320px; margin: 0 auto; padding: 0 18px 8px;
  font-size: 13px; color: #55627A;
}

@media (max-width: 900px) {
  .bar { flex-wrap: wrap; height: auto; padding: 8px 12px; gap: 8px; }
  body { padding-top: 108px; }
  .bar__title { width: 100%; margin-right: 0; }
  .btn, .bar select { font-size: 16px; }
}

/* ===== 인쇄 · PDF ========================================================= */
@page { size: 1280px 720px; margin: 0; }
@media print {
  body { background: #fff; padding: 0; }
  .bar, .hint, .frame__tag { display: none !important; }
  .deck { gap: 0; padding: 0; max-width: none; }
  .frame {
    width: 1280px; height: 720px; aspect-ratio: auto;
    border-radius: 0; box-shadow: none; break-after: page; page-break-after: always;
  }
  .frame:last-child { break-after: auto; page-break-after: auto; }
  .frame > .slide { transform: none !important; }
  .slide { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

const SCRIPT = `
(function () {
  var deck = document.getElementById('deck');
  var frames = Array.prototype.slice.call(deck.querySelectorAll('.frame'));
  var live = 0;
  var KEY = 'lm:${meta.slug}';

  /* 1280px 원본을 실제 폭에 맞춰 축소한다 */
  function fit() {
    frames.forEach(function (f) {
      var s = f.querySelector('.slide');
      if (!s) return;
      s.style.transform = 'scale(' + (f.clientWidth / 1280) + ')';
    });
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(deck);
  fit();
  document.fonts && document.fonts.ready.then(fit);

  /* 편집 내용 복원 */
  function edits() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function restore() {
    var saved = edits(), n = 0;
    Object.keys(saved).forEach(function (id) {
      var el = document.querySelector('[data-edit-id="' + id + '"]');
      if (el) { el.innerHTML = saved[id]; n++; }
    });
    if (n) status(n + '개 영역에 저장해 둔 편집 내용을 되살렸습니다.');
  }
  function save(el) {
    var saved = edits();
    saved[el.dataset.editId] = el.innerHTML;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); status('저장됨 · ' + new Date().toLocaleTimeString('ko-KR')); }
    catch (e) { status('브라우저 저장에 실패했습니다.'); }
  }
  function status(t) { document.getElementById('hint').textContent = t; }

  document.querySelectorAll('[data-edit]').forEach(function (el, i) {
    el.dataset.editId = 'e' + i;
    el.addEventListener('blur', function () { if (document.body.classList.contains('is-edit')) save(el); }, true);
  });
  restore();

  /* 발표 모드 */
  function show(i) {
    live = Math.max(0, Math.min(frames.length - 1, i));
    frames.forEach(function (f, k) { f.classList.toggle('is-live', k === live); });
    document.getElementById('jump').value = String(live);
    if (document.body.classList.contains('is-present')) fit();
    else frames[live].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function present(on) {
    document.body.classList.toggle('is-present', on);
    document.getElementById('present').setAttribute('aria-pressed', String(on));
    show(live); fit();
  }
  document.getElementById('present').addEventListener('click', function () {
    present(!document.body.classList.contains('is-present'));
  });
  document.getElementById('edit').addEventListener('click', function () {
    var on = !document.body.classList.contains('is-edit');
    document.body.classList.toggle('is-edit', on);
    this.setAttribute('aria-pressed', String(on));
    document.querySelectorAll('[data-edit]').forEach(function (el) { el.contentEditable = on ? 'true' : 'false'; });
    status(on ? '글자를 눌러 바로 고칠 수 있습니다. 고친 내용은 이 브라우저에 저장됩니다.' : '편집을 껐습니다.');
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('이 브라우저에 저장한 편집 내용을 모두 지우고 원본으로 돌아갑니다.')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  });
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  document.getElementById('jump').addEventListener('change', function () { show(Number(this.value)); });

  document.addEventListener('keydown', function (e) {
    if (document.body.classList.contains('is-edit')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { show(live + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(live - 1); e.preventDefault(); }
    if (e.key === 'Escape') present(false);
    if (e.key === 'f' || e.key === 'F') present(true);
  });
})();
`;

function buildHTML() {
  const frames = slides.map((s, i) => `<div class="frame">
  <span class="frame__tag">${i + 1}. ${esc(s.name)}${s.added ? ' · 추가' : ''}</span>
  ${slideHTML(s, i + 1)}
</div>`).join('\n');

  const opts = slides.map((s, i) => `<option value="${i}">${i + 1}. ${esc(s.name)}</option>`).join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.docTitle)}</title>
<meta name="description" content="${esc(meta.course)} ${meta.week}주차 학습자료 — ${esc(meta.title)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
${EXTRA_CSS}
${PAGE_CSS}
</style>
</head>
<body>
<header class="bar">
  <div class="bar__title">${esc(meta.docTitle)}<small>${esc(meta.dept)} · ${esc(meta.professor)}</small></div>
  <select id="jump" aria-label="슬라이드 이동">${opts}</select>
  <button class="btn" id="present" type="button" aria-pressed="false">발표 (F)</button>
  <button class="btn" id="edit" type="button" aria-pressed="false">편집</button>
  <button class="btn" id="print" type="button">인쇄 · PDF</button>
  <button class="btn" id="reset" type="button">원본</button>
</header>
<p class="hint" id="hint">← → 로 넘깁니다. ‘편집’을 켜면 글자를 눌러 바로 고칠 수 있고, 고친 내용은 이 브라우저에 남습니다.</p>
<main class="deck" id="deck">
${frames}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function buildMD() {
  const out = [];
  out.push('---', 'marp: true', 'theme: default', 'paginate: true', `title: ${meta.docTitle}`, '---', '');
  out.push(`<!-- ${meta.docTitle} · 자동 생성물입니다. 내용은 materials/${week}/slides.mjs 를 고치세요. -->`, '');
  slides.forEach((s, i) => {
    if (i) out.push('---', '');
    slideMD(s, i + 1, out);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/* --------------------------------------------------- 디자인 캔버스 아트보드 */
function buildCanvas(dir) {
  const files = [];
  slides.forEach((s, i) => {
    const file = i === 0 ? 'Main.dc.html' : `Slide${String(i + 1).padStart(2, '0')}.dc.html`;
    const doc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"><\/script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${FONTS}">
  <style>
  html, body { margin: 0; padding: 0; background: #E8EBF0; }
  a { color: #0057A0; } a:hover { color: #0A9EE0; }
${css}
${EXTRA_CSS}
  </style>
</helmet>
${slideHTML(s, i + 1)}
</x-dc>
</body>
</html>
`;
    writeFileSync(join(dir, file), doc);
    files.push({ file, name: s.name });
  });

  const PER_ROW = 4, W = 1280, H = 720, GX = 140, GY = 220;
  const canvas = {
    artboards: files.map((f, i) => ({
      file: f.file,
      title: `${i + 1}. ${f.name}`,
      x: (i % PER_ROW) * (W + GX),
      y: Math.floor(i / PER_ROW) * (H + GY),
      w: W, h: H, print: 'fixed',
    })),
    annotations: [{
      id: 'brief', x: 0, y: -180, w: 720,
      text: '제1강 오리엔테이션 — 1주차 원본 내용을 그대로 두고 2주차 자료의 디자인을 입혔습니다.\n마지막에서 두 번째 아트보드가 이번에 추가한 「생성형 AI 사용 지침」 한 장입니다.',
    }],
    launch: { view: 'canvas' },
  };
  writeFileSync(join(dir, 'canvas.json'), JSON.stringify(canvas, null, 2));
  return files.length;
}

/* ------------------------------------------------- 홀로 쓰는 .svg 파일 모음 */
function buildSVG(dir) {
  /* 데이터를 받아 그리는 그림은 실제 쓰이는 값으로 뽑는다 */
  const SAMPLE = {};
  for (const s of slides) {
    for (const b of (s.blocks || [])) {
      const flat = b.t === 'cols' ? [...b.left, ...b.right] : [b];
      for (const x of flat) if (x.t === 'fig' && x.data) SAMPLE[x.name] = x.data;
    }
  }
  const wrap = (body, title, src) => {
    const withNS = body.includes('xmlns=')
      ? body
      : body.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${title} — ${src} -->\n` +
      withNS.replace(' class="fig"', '').replace(' class="stripes"', '');
  };
  const made = [];
  for (const [name, fn] of Object.entries(FIGURES)) {
    const m = FIGURE_META[name] || { title: name, src: '' };
    writeFileSync(join(dir, `${name}.svg`), wrap(fn(SAMPLE[name]), m.title, m.src));
    made.push({ file: `${name}.svg`, ...m, kind: '인포그래픽' });
  }
  for (const [name, m] of Object.entries(MOTIFS)) {
    writeFileSync(join(dir, `${name}.svg`), wrap(m.make(), m.title, m.src));
    made.push({ file: `${name}.svg`, title: m.title, src: m.src, kind: '장식 요소' });
  }

  const rows = made.map((m) => `  <figure class="item">
    <div class="frame"><img src="${m.file}" alt="${esc(m.title)}"></div>
    <figcaption><b>${esc(m.title)}</b><span>${esc(m.kind)} · ${esc(m.src)}</span><code>${m.file}</code></figcaption>
  </figure>`).join('\n');

  writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.docTitle)} — 그림 요소</title>
<link rel="stylesheet" href="${FONTS}">
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 40px 24px 64px; background: #F2F4F7; color: #16181D;
         font-family: "Noto Sans KR", "Pretendard", sans-serif; }
  h1 { max-width: 1200px; margin: 0 auto 6px; font-size: 30px; letter-spacing: -.02em; }
  p.sub { max-width: 1200px; margin: 0 auto 30px; color: #6B7280; font-size: 16px; }
  .grid { max-width: 1200px; margin: 0 auto; display: grid; gap: 22px;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .item { margin: 0; background: #fff; border: 1px solid #D9E2EC; border-radius: 12px; overflow: hidden; }
  .frame { display: grid; place-items: center; padding: 18px; min-height: 170px; background: #FAFCFF; }
  .frame img { max-width: 100%; max-height: 220px; }
  figcaption { padding: 14px 16px 16px; border-top: 1px solid #EEF2F7;
               display: flex; flex-direction: column; gap: 4px; }
  figcaption b { font-size: 17px; }
  figcaption span { font-size: 13px; color: #6B7280; }
  figcaption code { font-size: 13px; color: #0057A0; }
</style></head>
<body>
  <h1>그림 요소 — ${esc(meta.docTitle)}</h1>
  <p class="sub">원본 PDF 안의 그림을 SVG 로 다시 그린 것입니다. 파일 하나하나를 그대로 가져다 쓸 수 있습니다.</p>
  <div class="grid">
${rows}
  </div>
</body></html>
`);
  return made.length;
}

/* --------------------------------------------------------------------- 실행 */
const dist = join(ROOT, 'dist');
const canvasDir = join(dist, 'canvas');
rmSync(canvasDir, { recursive: true, force: true });
mkdirSync(canvasDir, { recursive: true });

const svgDir = join(dist, 'svg');
rmSync(svgDir, { recursive: true, force: true });
mkdirSync(svgDir, { recursive: true });

writeFileSync(join(dist, `${meta.slug}.md`), buildMD());
writeFileSync(join(dist, `${meta.slug}.html`), buildHTML());
writeFileSync(join(dist, 'slides.json'), JSON.stringify({ meta, slides }, null, 2));
const n = buildCanvas(canvasDir);
const g = buildSVG(svgDir);

console.log(`✓ ${meta.slug}.md`);
console.log(`✓ ${meta.slug}.html   (슬라이드 ${slides.length}장)`);
console.log(`✓ slides.json        (PPTX 빌더가 읽는 내용)`);
console.log(`✓ canvas/            (아트보드 ${n}개 + canvas.json)`);
console.log(`✓ svg/               (그림 ${g}개 + index.html)`);
