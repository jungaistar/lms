#!/usr/bin/env node
/* ===========================================================================
   HTML 슬라이드에서 '실제로 그려진 자리'를 뽑아낸다
   ---------------------------------------------------------------------------
   브라우저가 잡아 놓은 좌표를 그대로 읽어 dist/layout.json 으로 내보낸다.
   build_pptx.py 가 이 좌표대로 파워포인트 도형을 놓는다 — 그래서 PPTX 가
   HTML 과 한 픽셀도 어긋나지 않는다.

   사용법:  node materials/pptx/extract-layout.mjs [크로미움 경로]
   =========================================================================== */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DECK = join(ROOT, 'dist', '1주차_오리엔테이션.html');
const OUT = join(ROOT, 'dist', 'layout.json');

if (!existsSync(DECK)) {
  console.error(`먼저 빌드하세요: node materials/build.mjs\n  없는 파일: ${DECK}`);
  process.exit(1);
}

/* 크로미움 찾기: 인자 → 환경변수 → playwright 기본 → 흔한 자리 */
function candidates() {
  const out = [process.argv[2], process.env.CHROMIUM_PATH].filter(Boolean);
  const pool = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(pool)) {
      if (d.startsWith('chromium-')) out.push(join(pool, d, 'chrome-linux', 'chrome'));
    }
  } catch { /* 없으면 넘어간다 */ }
  return out.concat([
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]);
}

async function launch() {
  const first = process.argv[2] || process.env.CHROMIUM_PATH;
  if (!first) {
    try { return await chromium.launch(); } catch { /* 아래에서 찾아본다 */ }
  }
  for (const p of candidates()) {
    if (p && existsSync(p)) {
      try { return await chromium.launch({ executablePath: p }); } catch { /* 다음 후보 */ }
    }
  }
  console.error('크로미움을 찾지 못했습니다. `npx playwright install chromium` 을 한 번 돌리거나,\n' +
                '  node materials/pptx/extract-layout.mjs <크로미움 실행파일 경로> 로 알려주세요.');
  process.exit(1);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(pathToFileURL(DECK).href, { waitUntil: 'load' });
await page.waitForTimeout(1500);

/* 확대/축소를 끄고 원본 1280×720 좌표로 읽는다 */
await page.evaluate(() => {
  document.querySelectorAll('.frame > .slide').forEach((s) => { s.style.transform = 'none'; });
});
await page.waitForTimeout(400);

const data = await page.evaluate(() => {
  const num = (v) => parseFloat(v) || 0;
  const hex = (rgb) => {
    const m = /rgba?\(([^)]+)\)/.exec(rgb || '');
    if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
    if (a !== undefined && a < 0.04) return null;
    return [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const EMOJI = /\p{Extended_Pictographic}/u;

  /* 목록 앞의 표식(::before)은 진짜 요소가 아니라 CSS 로 그린 것이다.
     좌표를 읽을 수 없으므로 클래스를 보고 우리가 아는 규칙대로 되살린다. */
  function marker(li, ul, box, cs) {
    const fs = num(cs.fontSize);
    const cls = ul.className;
    if (cls.includes('list--check')) return { kind: 'glyph', ch: '✓', x: box.x, y: box.y, size: 18, color: '0071CE', bold: true };
    if (cls.includes('list--dot')) return { kind: 'circle', x: box.x + 5, y: box.y + fs * 0.55, d: 7, fill: '0071CE' };
    if (cls.includes('list--num')) {
      const n = [...ul.children].indexOf(li) + 1;
      return { kind: 'circle', x: box.x, y: box.y + 1, d: 27, fill: '005BAC',
               text: String(n), size: 15, color: 'FFFFFF' };
    }
    return { kind: 'glyph', ch: '➢', x: box.x, y: box.y - 1, size: 17, color: '0071CE', bold: true };
  }

  const slides = [];
  document.querySelectorAll('.frame > .slide').forEach((slide) => {
    const S = slide.getBoundingClientRect();
    const rel = (r) => ({ x: r.left - S.left, y: r.top - S.top, w: r.width, h: r.height });
    const nodes = [];
    const push = (n) => { if (n) nodes.push(n); };

    /* --- 글 묶음: 자식 노드를 훑어 서식 조각(run)으로 나눈다 -------------- */
    function runs(el) {
      const out = [];
      const walk = (node, inherit) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 3) {
            const t = c.textContent;
            if (t.trim() || (out.length && t === ' ')) out.push({ ...inherit, text: t });
          } else if (c.nodeType === 1) {
            if (c.tagName === 'BR') { out.push({ ...inherit, text: '\n' }); continue; }
            const s = getComputedStyle(c);
            if (c.classList.contains('emo')) {
              const r = rel(c.getBoundingClientRect());
              push({ type: 'emoji', ...r, char: c.textContent.trim() });
              continue;                       // 이모지는 그림으로 따로 놓는다
            }
            walk(c, {
              bold: num(s.fontWeight) >= 600,
              size: num(s.fontSize),
              color: hex(s.color) || inherit.color,
              font: s.fontFamily,
            });
          }
        }
      };
      const s = getComputedStyle(el);
      walk(el, { bold: num(s.fontWeight) >= 600, size: num(s.fontSize), color: hex(s.color) || '16181D', font: s.fontFamily });
      return out.filter((r) => r.text !== '');
    }

    /* 첫 글자가 실제로 놓인 자리와 줄 수 — Range 로 직접 잰다.
       이모지가 앞에 붙거나 ::before 막대가 자리를 차지하면 글이 밀린다. */
    function textMetrics(el) {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      /* 앞에 붙은 이모지는 따로 그림으로 놓으므로 글의 시작점 계산에서 뺀다 */
      for (const c of el.childNodes) {
        if (c.nodeType === 3 && !c.textContent.trim()) continue;
        if (c.nodeType === 1 && c.classList && c.classList.contains('emo')) { rng.setStartAfter(c); continue; }
        break;
      }
      const rects = [...rng.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) return { startX: null, startY: null, lines: 1 };
      const top = Math.min(...rects.map((r) => r.top));
      const first = rects.filter((r) => r.top < top + 2);
      const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
      const l = Math.min(...first.map((r) => r.left));
      const rgt = Math.max(...first.map((r) => r.right));
      return {
        startX: l - S.left,
        startY: top - S.top,
        textX: l - S.left,
        textW: rgt - l,
        textH: Math.max(...first.map((r) => r.height)),
        lines: tops.length,
      };
    }

    function textNode(el, box, extra = {}) {
      const s = getComputedStyle(el);
      const rs = runs(el);
      if (!rs.length) return null;
      const m = textMetrics(el);
      const padL = num(s.paddingLeft);
      const centered = s.textAlign === 'center' || s.textAlign === 'right';
      return {
        type: 'text', ...box,
        runs: rs,
        align: s.textAlign === 'start' ? 'left' : s.textAlign,
        size: num(s.fontSize),
        lineHeight: num(s.lineHeight) || num(s.fontSize) * 1.4,
        color: hex(s.color) || '16181D',
        padL: m.startX !== null && !centered ? Math.max(padL, m.startX - box.x) : padL,
        padR: num(s.paddingRight),
        padT: m.startY !== null ? Math.max(0, m.startY - box.y) : num(s.paddingTop),
        padB: num(s.paddingBottom),
        lines: m.lines,
        textX: m.textX, textW: m.textW, textH: m.textH,
        /* 폭이 글에 맞춰 줄어드는 요소인지 — 이런 자리는 파워포인트에서
           글꼴 너비가 조금만 넓어도 줄이 접힌다. 여유를 줘야 한다. */
        shrink: s.position === 'absolute' && (s.left === 'auto' || s.right === 'auto'),
        tracking: num(s.letterSpacing),
        ...extra,
      };
    }

    /* linear-gradient(<각도>, 색 위치, …) → 파워포인트 그라디언트 채움 */
    function gradient(css) {
      if (!css || !css.startsWith('linear-gradient')) return null;
      const body = css.slice(css.indexOf('(') + 1, css.lastIndexOf(')'));
      const parts = [];
      let depth = 0, cur = '';
      for (const ch of body) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
      }
      parts.push(cur.trim());
      let angle = 180;
      if (/^-?[\d.]+deg$/.test(parts[0])) angle = parseFloat(parts.shift());
      else if (/^to /.test(parts[0])) {
        const dir = parts.shift();
        angle = { 'to right': 90, 'to left': 270, 'to top': 0, 'to bottom': 180 }[dir] ?? 180;
      }
      const stops = parts.map((p, i) => {
        const m = /^(rgba?\([^)]*\)|#[0-9a-f]+)\s*([\d.]+%)?$/i.exec(p);
        if (!m) return null;
        const col = m[1].startsWith('#') ? m[1].slice(1).toUpperCase() : hex(m[1]);
        const al = /rgba\(/.test(m[1]) ? parseFloat(m[1].split(',')[3]) : 1;
        const pos = m[2] ? parseFloat(m[2]) / 100 : i / Math.max(1, parts.length - 1);
        return col ? { color: col, pos, alpha: isNaN(al) ? 1 : al } : null;
      }).filter(Boolean);
      return stops.length >= 2 ? { angle, stops } : null;
    }

    function boxNode(el, box) {
      const s = getComputedStyle(el);
      const fill = hex(s.backgroundColor);
      const grad = gradient(s.backgroundImage);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({
        side: k.toLowerCase(),
        w: num(s[`border${k}Width`]),
        color: hex(s[`border${k}Color`]),
        style: s[`border${k}Style`],
      })).filter((b) => b.w > 0 && b.style !== 'none');

      /* border-image (목차 줄의 사라지는 밑줄) 도 테두리로 친다 */
      const bi = gradient(s.borderImageSource);
      if (bi && !sides.length && num(s.borderBottomWidth) > 0) {
        sides.push({ side: 'bottom', w: num(s.borderBottomWidth), color: bi.stops[0].color, style: 'solid', fade: true });
      }

      const uniform = sides.length === 4 && sides.every((b) => b.w === sides[0].w && b.color === sides[0].color);
      if (!fill && !grad && !sides.length) return null;
      return {
        type: 'box', ...box,
        bgImage: el.dataset ? el.dataset.bg : undefined,
        fill, grad,
        stroke: uniform ? sides[0].color : null,
        strokeW: uniform ? sides[0].w : 0,
        rules: uniform ? [] : sides,
        radius: num(s.borderTopLeftRadius),
        dashed: s.borderTopStyle === 'dashed',
      };
    }

    /* --- SVG: 안에 그려진 낱개 도형을 화면 좌표로 뽑는다 ------------------ */
    function svgNode(svg) {
      const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
      const r = rel(svg.getBoundingClientRect());
      const k = Math.min(r.w / vb[2], r.h / vb[3]);          // preserveAspectRatio: meet
      const ox = r.x + (r.w - vb[2] * k) / 2 - vb[0] * k;
      const oy = r.y + (r.h - vb[3] * k) / 2 - vb[1] * k;
      const T = (x, y) => ({ x: ox + x * k, y: oy + y * k });

      /* fill="url(#id)" 를 실제 그라디언트로 풀어 둔다 */
      const grads = {};
      svg.querySelectorAll('linearGradient').forEach((lg) => {
        const gx = (k, d) => parseFloat(lg.getAttribute(k) ?? d);
        const deg = Math.atan2(gx('y2', 0) - gx('y1', 0), gx('x2', 1) - gx('x1', 0)) * 180 / Math.PI;
        const stops = [...lg.querySelectorAll('stop')].map((st) => ({
          color: (st.getAttribute('stop-color') || '#000').replace('#', '').toUpperCase(),
          pos: parseFloat(st.getAttribute('offset') ?? 0),
          alpha: parseFloat(st.getAttribute('stop-opacity') ?? 1),
        }));
        grads[lg.id] = { angle: deg + 90, stops };   // CSS 각도 규약으로 맞춘다
      });
      const refGrad = (v) => {
        const m = /^url\(#(.+)\)$/.exec(v || '');
        return m ? grads[m[1]] || null : null;
      };

      const items = [];
      const walkG = (g, tx, ty) => {
        for (const c of g.children) {
          const tag = c.tagName.toLowerCase();
          if (tag === 'defs') continue;
          if (tag === 'g') {
            const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(c.getAttribute('transform') || '');
            walkG(c, tx + (m ? +m[1] : 0), ty + (m ? +m[2] : 0));
            continue;
          }
          const a = (n, d) => { const v = c.getAttribute(n); return v === null ? d : v; };
          const fill = a('fill', null);
          const stroke = a('stroke', null);
          const sw = parseFloat(a('stroke-width', '1')) * k;
          const clean = (col) => (col && col !== 'none' && !col.startsWith('url(')
            ? col.replace('#', '').toUpperCase() : null);
          const gfill = refGrad(fill);

          if (tag === 'rect') {
            const p = T(+a('x', 0) + tx, +a('y', 0) + ty);
            items.push({ shape: 'rect', x: p.x, y: p.y, w: +a('width', 0) * k, h: +a('height', 0) * k,
              rx: +a('rx', 0) * k, fill: clean(fill), grad: gfill, stroke: clean(stroke), strokeW: sw,
              opacity: parseFloat(a('opacity', '1')) });
          } else if (tag === 'circle') {
            const rr = +a('r', 0) * k;
            const p = T(+a('cx', 0) + tx, +a('cy', 0) + ty);
            items.push({ shape: 'oval', x: p.x - rr, y: p.y - rr, w: rr * 2, h: rr * 2,
              fill: clean(fill), grad: gfill, stroke: clean(stroke), strokeW: sw });
          } else if (tag === 'line') {
            const p1 = T(+a('x1', 0) + tx, +a('y1', 0) + ty);
            const p2 = T(+a('x2', 0) + tx, +a('y2', 0) + ty);
            items.push({ shape: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: clean(stroke), strokeW: sw });
          } else if (tag === 'text') {
            const bb = rel(c.getBoundingClientRect());
            const anchor = a('text-anchor', 'start');
            const tp = c.querySelector('textPath');
            if (tp && tp.getNumberOfChars) {
              const chars = [];
              for (let ci = 0; ci < tp.getNumberOfChars(); ci++) {
                const ch = tp.textContent[ci];
                if (!ch || ch === ' ') continue;
                const ext = tp.getExtentOfChar(ci);
                const p0 = T(ext.x + ext.width / 2 + tx, ext.y + ext.height / 2 + ty);
                chars.push({ ch, cx: p0.x, cy: p0.y, rot: tp.getRotationOfChar(ci) });
              }
              items.push({ shape: 'arctext', chars,
                size: +a('font-size', 14) * k, bold: +a('font-weight', 400) >= 600,
                color: clean(fill) || 'FFFFFF' });
              continue;
            }
            items.push({ shape: 'text', x: bb.x, y: bb.y, w: bb.w, h: bb.h,
              text: c.textContent, anchor,
              size: +a('font-size', 16) * k,
              bold: +a('font-weight', 400) >= 600,
              color: clean(fill) || '16181D',
              emoji: EMOJI.test(c.textContent) });
          } else if (tag === 'path') {
            const d = a('d', '');
            const bb = rel(c.getBBox ? c.getBoundingClientRect() : c.getBoundingClientRect());
            items.push({ shape: 'path', d, tx, ty, k, ox, oy,
              x: bb.x, y: bb.y, w: bb.w, h: bb.h,
              fill: clean(fill), grad: gfill, stroke: clean(stroke), strokeW: sw });
          }
        }
      };
      const root = svg.querySelector('x-dc') || svg;
      walkG(root, 0, 0);
      return { type: 'svg', ...r, name: (svg.getAttribute('aria-label') || ''), items };
    }

    /* --- 표 ------------------------------------------------------------ */
    function tableNode(tbl) {
      const box = rel(tbl.getBoundingClientRect());
      const rows = [];
      tbl.querySelectorAll('tr').forEach((tr) => {
        const cells = [];
        tr.querySelectorAll('th,td').forEach((td) => {
          const s = getComputedStyle(td);
          cells.push({
            ...rel(td.getBoundingClientRect()),
            head: td.tagName === 'TH',
            runs: runs(td),
            align: s.textAlign === 'start' ? 'left' : s.textAlign,
            size: num(s.fontSize),
            fill: hex(s.backgroundColor) || hex(getComputedStyle(tr).backgroundColor),
            color: hex(s.color) || '16181D',
          });
        });
        const trs = getComputedStyle(tr);
        rows.push({ cells, current: tr.classList.contains('is-current'),
          shadow: trs.boxShadow && trs.boxShadow !== 'none' });
      });
      return { type: 'table', ...box, rows };
    }

    /* --- 훑기 ---------------------------------------------------------- */
    const SKIP = new Set(['SCRIPT', 'STYLE']);
    function visit(el) {
      if (SKIP.has(el.tagName)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const box = rel(el.getBoundingClientRect());
      if (box.w <= 0 || box.h <= 0) return;

      if (el.tagName === 'SVG' || el instanceof SVGSVGElement) { push(svgNode(el)); return; }
      if (el.tagName === 'TABLE') { push(tableNode(el)); return; }

      push(boxNode(el, box));

      if (el.tagName === 'LI' && el.classList.contains('rule')) {
        const n = [...el.parentElement.children].indexOf(el) + 1;
        push({ type: 'marker', kind: 'circle', x: box.x + 12, y: box.y + 11, d: 24,
               fill: '005BAC', text: String(n), size: 14, color: 'FFFFFF' });
      } else if (el.tagName === 'LI') {
        const ul = el.closest('ul,ol');
        push({ type: 'marker', ...marker(el, ul, box, cs) });
      }
      if (el.classList.contains('wordmark')) {
        const cs2 = getComputedStyle(el);
        const m = textMetrics(el);
        push({ type: 'text', ...box, runs: [{ text: el.textContent, bold: true,
                 size: num(cs2.fontSize), color: hex(cs2.color) || 'FFFFFF', font: 'Outfit' }],
               align: 'left', size: num(cs2.fontSize),
               lineHeight: num(cs2.fontSize), color: hex(cs2.color) || 'FFFFFF',
               padL: 0, padR: 0, padT: Math.max(0, (m.startY ?? box.y) - box.y), padB: 0,
               lines: 1, textX: m.textX, textW: m.textW, textH: m.textH,
               tracking: num(cs2.letterSpacing), nowrap: true });
        const i = el.querySelector('i');
        if (i) {
          const r = rel(i.getBoundingClientRect());
          const fs = num(getComputedStyle(el).fontSize);
          const d = fs * 0.19;
          push({ type: 'marker', kind: 'circle', x: r.x + r.w / 2 - d / 2, y: r.y - fs * 0.26,
                 d, fill: hex(getComputedStyle(el).color) || 'FFFFFF' });
        }
      }

      if (el.classList.contains('wordmark')) return;

      /* 글만 든 잎사귀면 글 묶음으로 끝낸다 */
      const hasBlockChild = [...el.children].some((c) => {
        if (c.classList.contains('wordmark')) return true;
        const d = getComputedStyle(c).display;
        return d !== 'inline' && !c.classList.contains('emo') && c.tagName !== 'BR';
      });
      if (!hasBlockChild) { push(textNode(el, box)); return; }
      for (const c of el.children) visit(c);
    }

    const sc = getComputedStyle(slide);
    const after = getComputedStyle(slide, '::after');
    push({ type: 'bg', x: 0, y: 0, w: S.width, h: S.height,
           fill: hex(sc.backgroundColor) || 'F2F4F7',
           grad: gradient(after.backgroundImage) });

    for (const c of slide.children) visit(c);
    slides.push({
      index: +slide.dataset.index,
      kind: slide.dataset.kind,
      name: slide.dataset.name,
      /* 본문 슬라이드 바탕에 깔리는 캠퍼스 사진 (::before 라 좌표가 없다) */
      campus: ['content', 'toc'].includes(slide.dataset.kind)
        ? { x: 0, y: parseFloat(getComputedStyle(slide).getPropertyValue('--dc-head-h')) || 56,
            w: S.width, h: S.height }
        : null,
      nodes,
    });
  });
  return slides;
});

await browser.close();
writeFileSync(OUT, JSON.stringify({ w: 1280, h: 720, slides: data }, null, 1));
const counts = data.reduce((a, s) => { a += s.nodes.length; return a; }, 0);
console.log(`✓ layout.json — 슬라이드 ${data.length}장, 도형 ${counts}개`);
