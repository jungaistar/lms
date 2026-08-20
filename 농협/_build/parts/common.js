/* ==========================================================================
   농협사료 클론 실습 — 공용 스크립트
   프레임워크 없이 표준 DOM API 만 쓴다. 빌드 시 <script> 안으로 인라인 삽입.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* --- 1) 현재 페이지 메뉴에 활성 표시 --------------------------------- */
  function markActiveMenu() {
    var key = document.body.dataset.page;
    if (!key) return;
    var li = $('.gnb > ul > li[data-key="' + key + '"]');
    if (li) {
      li.classList.add('is-active');
      li.querySelector('a').setAttribute('aria-current', 'page');
    }
  }

  /* --- 2) 모바일 서랍 메뉴 --------------------------------------------- */
  function initNavToggle() {
    var btn = $('.nav-toggle');
    var nav = $('#gnb');
    if (!btn || !nav) return;

    function setOpen(open) {
      btn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      // 서랍이 열린 동안 뒤 본문이 스크롤되지 않게 잠근다
      document.body.style.overflow = open ? 'hidden' : '';
      $('.sr-only', btn).textContent = open ? '전체 메뉴 닫기' : '전체 메뉴 열기';
    }

    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });

    // ESC 로 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        btn.focus();
      }
    });

    // 메뉴 안 링크를 누르면 닫기
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    // 데스크톱 폭으로 돌아오면 잠금 해제
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (m) {
      if (m.matches) setOpen(false);
    });
  }

  /* --- 3) 스크롤 등장 애니메이션 ---------------------------------------- */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    // IntersectionObserver 를 못 쓰는 환경이면 그냥 다 보여준다
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);          // 한 번만 실행
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { io.observe(el); });
  }

  /* --- 4) 숫자 카운트업 ------------------------------------------------- */
  function initCounters() {
    var nums = $$('[data-count]');
    if (!nums.length || !('IntersectionObserver' in window)) {
      nums.forEach(function (el) { el.textContent = el.dataset.count; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var target = Number(el.dataset.count);
        var dur = 1100, t0 = performance.now();
        (function step(now) {
          var p = Math.min((now - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);           // easeOutCubic
          el.textContent = Math.round(target * eased).toLocaleString('ko-KR');
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* --- 5) 푸터 관련 사이트 select --------------------------------------- */
  function initFamilySelect() {
    var sel = $('[data-family]');
    if (!sel) return;
    sel.addEventListener('change', function () {
      if (sel.value) location.href = sel.value;
    });
  }

  /* --- 6) 서브 페이지 좌측 메뉴 → 좁은 화면에서 select ------------------- */
  function initSubNavSelect() {
    var nav = $('.sub-nav');
    if (!nav) return;
    var links = $$('.sub-nav ul a');
    if (!links.length) return;

    // 같은 배열(DOM)에서 만들어 쓴다 — 좁은 화면용 마크업을 따로 두지 않는다
    var wrap = document.createElement('div');
    wrap.className = 'sub-nav__select';
    var sel = document.createElement('select');
    sel.className = 'select';
    sel.setAttribute('aria-label', '하위 메뉴 이동');

    links.forEach(function (a) {
      var op = document.createElement('option');
      op.value = a.getAttribute('href');
      op.textContent = a.textContent.trim();
      if (a.classList.contains('is-active')) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener('change', function () { location.hash = sel.value.replace(/^.*#/, '#'); });

    wrap.appendChild(sel);
    nav.appendChild(wrap);
  }

  /* --- 7) sticky 헤더 높이만큼 앵커 위치 보정 --------------------------- */
  function initAnchorOffset() {
    var header = $('.header');
    if (!header) return;
    document.documentElement.style.scrollPaddingTop = (header.offsetHeight + 12) + 'px';
  }

  /* --- 8) 아코디언 (FAQ · 게시판 상세 공용) ------------------------------ */
  function initAccordion() {
    $$('.acc').forEach(function (acc) {
      var single = acc.dataset.single === 'true';   // 한 번에 하나만 열기
      $$('.acc__btn', acc).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') === 'true';
          if (single && !open) {
            $$('.acc__btn', acc).forEach(function (b) {
              b.setAttribute('aria-expanded', 'false');
              document.getElementById(b.getAttribute('aria-controls'))
                      .classList.remove('is-open');
            });
          }
          btn.setAttribute('aria-expanded', String(!open));
          document.getElementById(btn.getAttribute('aria-controls'))
                  .classList.toggle('is-open', !open);
        });
      });
    });
  }

  /* --- 실행 ------------------------------------------------------------- */
  function boot() {
    markActiveMenu();
    initNavToggle();
    initReveal();
    initCounters();
    initFamilySelect();
    initSubNavSelect();
    initAnchorOffset();
    initAccordion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 페이지별 스크립트가 쓸 수 있게 최소한만 노출한다
  window.NH = { $: $, $$: $$ };
})();
