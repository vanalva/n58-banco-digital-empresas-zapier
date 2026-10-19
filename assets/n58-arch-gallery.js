(function () {
  if (!window.requestAnimationFrame || !window.getComputedStyle) return;

  var mobileMq = window.matchMedia ? window.matchMedia('(max-width: 991px)') : null;
  function parseLength(value) {
    var raw = (value || '').trim();
    if (!raw) return 0;
    if (raw.slice(-2) === 'px') return parseFloat(raw) || 0;
    if (raw.slice(-3) === 'rem') {
      var rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return (parseFloat(raw) || 0) * rootSize;
    }
    return parseFloat(raw) || 0;
  }

  function initArch(wrap) {
    if (!wrap.querySelector('.n58-arch-slide')) return;

    var active = false;
    var rafId = 0;

    /* Query the live slide set every frame, NOT once at init. The flwr marquee
       clones each slide AFTER this script runs (to build its seamless loop), and
       clones are cloneNode(true) snapshots that freeze whatever --arch-* values
       the original held at clone time. If we only animate the originals captured
       at init, every clone stays frozen mid-arc and reads as a displaced card
       that doesn't follow the curve. Re-querying picks up clones (and survives
       the marquee re-cloning on resize). */
    function getSlides() {
      return wrap.querySelectorAll('.n58-arch-slide');
    }

    function setRestState() {
      var slides = getSlides();
      for (var i = 0; i < slides.length; i++) {
        slides[i].style.setProperty('--arch-y', '0px');
        slides[i].style.setProperty('--arch-rot', '0deg');
        slides[i].style.setProperty('--arch-scale', '1');
      }
    }

    function frame() {
      rafId = 0;

      if (mobileMq && mobileMq.matches) {
        setRestState();
        return;
      }

      var styles = getComputedStyle(wrap);
      var lift = parseLength(styles.getPropertyValue('--arch-lift')) || 88;
      var radiusF = parseFloat(styles.getPropertyValue('--arch-radius-f')) || 1;
      var scaleMax = parseFloat(styles.getPropertyValue('--arch-scale-max')) || 0.04;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
      var viewportCenter = viewportWidth / 2;
      /* True circle geometry: every card center sits on a ring of radius R
         whose center is below the apex; rotation is the card's angle on the
         ring (tangent), so the row reads as one coherent circular fan. */
      var radius = radiusF * viewportWidth;

      var slides = getSlides();
      for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];
        var rect = slide.getBoundingClientRect();
        if (rect.right < -rect.width || rect.left > viewportWidth + rect.width) continue;

        var slideCenter = rect.left + rect.width / 2;
        var dx = slideCenter - viewportCenter;
        var s = Math.max(-0.95, Math.min(0.95, dx / radius));
        var angle = Math.asin(s);
        var drop = radius * (1 - Math.cos(angle));
        var y = drop - lift;
        var rot = angle * (180 / Math.PI);
        var scale = 1 + Math.max(0, (Math.cos(angle) - 0.9) / 0.1) * scaleMax;

        slide.style.setProperty('--arch-y', y.toFixed(2) + 'px');
        slide.style.setProperty('--arch-rot', rot.toFixed(2) + 'deg');
        slide.style.setProperty('--arch-scale', scale.toFixed(4));
      }

      if (!active) return;
      rafId = window.requestAnimationFrame(frame);
    }

    function stop() {
      active = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function start() {
      if (active && rafId) return;
      active = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    }

    function refresh() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (active) start();
      else frame();
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) start();
        else stop();
      }, { threshold: 0.1 });
      observer.observe(wrap);
    } else {
      start();
    }

    if (mobileMq) {
      if (mobileMq.addEventListener) mobileMq.addEventListener('change', refresh);
      else if (mobileMq.addListener) mobileMq.addListener(refresh);
    }
    window.addEventListener('resize', refresh, { passive: true });
    frame();
  }

  /* TOUCH / MOBILE (<=991px): the gallery script re-parents the cards into a native
     scroll-snap scroller (.n58-gallery-scroller), so there is no marquee wrap to
     measure. Same circle geometry, driven by the scroller's own scrollLeft, which is
     exactly what finger drag, momentum, snap and the idle drift all move. Transform
     only (CSS vars -> .is-arch rule), one rAF loop, only while the scroller is on
     screen, and no radial at all under prefers-reduced-motion. */
  function initTouchArch(sc) {
    var cards = Array.prototype.slice.call(sc.querySelectorAll('.n58-gallery-card'));
    if (!cards.length) return;
    var prm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var centers = [], halfW = 0, active = false, rafId = 0, lastKey = '';
    cards.forEach(function (c) { c.classList.add('is-arch'); });

    function measure() {
      rest(); /* measure untransformed boxes, not the arced ones */
      var sr = sc.getBoundingClientRect();
      var base = sc.scrollLeft;
      centers = cards.map(function (c) {
        var r = c.getBoundingClientRect();
        return r.left - sr.left + base + r.width / 2;
      });
      halfW = (cards[0].getBoundingClientRect().width || 300) / 2;
      lastKey = '';
    }
    function rest() {
      for (var i = 0; i < cards.length; i++) {
        cards[i].style.setProperty('--arch-y', '0px');
        cards[i].style.setProperty('--arch-rot', '0deg');
        cards[i].style.setProperty('--arch-scale', '1');
      }
    }
    function frame() {
      rafId = 0;
      if (prm && prm.matches) { rest(); return; }
      var x = sc.scrollLeft;
      var key = x.toFixed(1);
      if (key !== lastKey) {
        lastKey = key;
        var styles = getComputedStyle(sc);
        var lift = parseLength(styles.getPropertyValue('--arch-lift')) || 24;
        var radiusF = parseFloat(styles.getPropertyValue('--arch-radius-f')) || 3;
        var scaleMax = parseFloat(styles.getPropertyValue('--arch-scale-max')) || 0.03;
        var vw = sc.clientWidth || window.innerWidth || 1;
        var mid = x + vw / 2;
        var radius = radiusF * vw;
        for (var i = 0; i < cards.length; i++) {
          var dx = centers[i] - mid;
          if (dx < -vw - halfW * 2 || dx > vw + halfW * 2) continue;
          var sn = Math.max(-0.95, Math.min(0.95, dx / radius));
          var angle = Math.asin(sn);
          var y = radius * (1 - Math.cos(angle)) - lift;
          var scale = 1 + Math.max(0, (Math.cos(angle) - 0.9) / 0.1) * scaleMax;
          cards[i].style.setProperty('--arch-y', y.toFixed(2) + 'px');
          cards[i].style.setProperty('--arch-rot', (angle * (180 / Math.PI)).toFixed(2) + 'deg');
          cards[i].style.setProperty('--arch-scale', scale.toFixed(4));
        }
      }
      if (active) rafId = window.requestAnimationFrame(frame);
    }
    function start() { if (active && rafId) return; active = true; if (!rafId) rafId = window.requestAnimationFrame(frame); }
    function stop() { active = false; if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; } }

    measure();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { if (en[0] && en[0].isIntersecting) start(); else stop(); }, { threshold: 0.05 }).observe(sc);
    } else start();
    var remeasure = function () { measure(); if (!active) frame(); };
    window.addEventListener('resize', remeasure, { passive: true });
    window.addEventListener('load', remeasure);
    if (prm && prm.addEventListener) prm.addEventListener('change', function () { lastKey = ''; frame(); });
    frame();
  }

  /* The scroller is built by the mobile init script during DOMContentLoaded, after
     this deferred file has run, so wait for it. */
  function waitForScroller(tries) {
    var sc = document.querySelector('.n58-gallery-scroller');
    if (sc) { initTouchArch(sc); return; }
    if (tries < 50) setTimeout(function () { waitForScroller(tries + 1); }, 100);
  }

  function run() {
    if (mobileMq && mobileMq.matches) waitForScroller(0);
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.n58-arch-marquee'));
    if (!wraps.length) return;
    for (var i = 0; i < wraps.length; i++) initArch(wraps[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
