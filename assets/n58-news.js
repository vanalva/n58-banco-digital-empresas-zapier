/* Novedades carousel: native scroll-snap scroller, infinite, one card per step.
   Same engine family as the mobile "Tu banco en cada momento" gallery: the browser
   owns drag, momentum and snapping (compositor scroll), JS only clones the set,
   re-centres it invisibly while idle, and drives arrows / dots / autoplay.
   Mouse gets a small pointer-drag helper (native scrollers do not drag with a mouse). */
(function () {
  var root = document.querySelector('[data-n58-news]');
  if (!root) return;
  var wrap = root.querySelector('.n58-news_wrap');
  var track = root.querySelector('.n58-news_track');
  if (!wrap || !track || !track.children.length) return;

  var dotsEl = root.querySelector('[data-n58-news-dots]');
  var prevBtn = root.querySelector('[data-flwr-target="prev"]');
  var nextBtn = root.querySelector('[data-flwr-target="next"]');
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceMq && reduceMq.matches); }

  var origs = Array.prototype.slice.call(track.children);
  var n = origs.length;

  /* 3 sets: [clones][originals][clones]. Only the middle set is the "home" set. */
  function cloneSet(before) {
    var frag = document.createDocumentFragment();
    origs.forEach(function (s) {
      var c = s.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.classList.add('is-clone');
      Array.prototype.forEach.call(c.querySelectorAll('a, button, input, select, textarea, [tabindex]'), function (el) {
        el.setAttribute('tabindex', '-1');
      });
      frag.appendChild(c);
    });
    if (before) track.insertBefore(frag, track.firstChild);
    else track.appendChild(frag);
  }
  cloneSet(true);
  cloneSet(false);
  var slides = Array.prototype.slice.call(track.children);
  var total = slides.length;
  Array.prototype.forEach.call(track.querySelectorAll('img'), function (img) { img.setAttribute('draggable', 'false'); });

  var lefts = [], setW = 0;
  function measure() {
    lefts = slides.map(function (s) { return s.offsetLeft; });
    setW = lefts[n] - lefts[0];
  }
  function nearest() {
    var x = wrap.scrollLeft, best = 0, bd = Infinity;
    for (var i = 0; i < total; i++) {
      var d = Math.abs(lefts[i] - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---- dots ---- */
  var dots = [];
  if (dotsEl) {
    for (var i = 0; i < n; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'n58-news_dot-btn';
      b.setAttribute('aria-label', 'Ir a la novedad ' + (i + 1));
      var d = document.createElement('span');
      d.className = 'n58-gallery-dot';
      d.setAttribute('aria-hidden', 'true');
      b.appendChild(d);
      (function (idx) { b.addEventListener('click', function () { userAct(); goReal(idx); }); })(i);
      dotsEl.appendChild(b);
      dots.push(b);
    }
  }
  var lastReal = -1, dotRaf = 0;
  function updateDots() {
    dotRaf = 0;
    if (!dots.length || !lefts.length) return;
    var real = nearest() % n;
    if (real === lastReal) return;
    lastReal = real;
    for (var i = 0; i < dots.length; i++) {
      var on = i === real;
      dots[i].firstChild.classList.toggle('is-active', on);
      dots[i].setAttribute('aria-current', on ? 'true' : 'false');
    }
  }

  /* ---- navigation ---- */
  var animTarget = -1, animTimer = 0;
  function scrollToIdx(t) {
    animTarget = t;
    clearTimeout(animTimer);
    animTimer = setTimeout(function () { animTarget = -1; }, 900);
    /* snap-stop would end a multi-card glide at the first card; drop snap for it */
    if (Math.abs(t - nearest()) > 1) wrap.classList.add('is-jumping');
    wrap.scrollTo({ left: lefts[t], behavior: reduced() ? 'auto' : 'smooth' });
  }
  function baseIdx() { return animTarget >= 0 ? animTarget : nearest(); }
  function go(delta) {
    var cur = baseIdx();
    /* keep headroom: re-home first when we are not mid-glide and near an end */
    if (animTarget < 0 && (cur < 2 || cur > total - 3)) { recenter(true); cur = nearest(); }
    var t = Math.max(0, Math.min(total - 1, cur + delta));
    scrollToIdx(t);
  }
  function goReal(j) {
    var cur = baseIdx();
    var base = Math.floor(cur / n) * n + j, best = base;
    [base - n, base, base + n].forEach(function (c) {
      if (c >= 0 && c < total && Math.abs(c - cur) < Math.abs(best - cur)) best = c;
    });
    scrollToIdx(best);
  }
  if (prevBtn) prevBtn.addEventListener('click', function () { userAct(); go(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { userAct(); go(1); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { userAct(); go(1); }
    else if (e.key === 'ArrowLeft') { userAct(); go(-1); }
  });

  /* ---- invisible re-centre onto the middle set (snap positions repeat every setW) ---- */
  var touching = false, dragging = false, lastScroll = 0, settleTimer = 0;
  function recenter(force) {
    if (!setW) return;
    if (!force && (touching || dragging)) return;
    var cur = nearest();
    if (cur < n) wrap.scrollLeft += setW;
    else if (cur >= 2 * n) wrap.scrollLeft -= setW;
  }
  function settle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      if (touching || dragging) return;
      if (Date.now() - lastScroll < 120) { settle(); return; }
      animTarget = -1;
      wrap.classList.remove('is-jumping');
      recenter(false);
      updateDots();
    }, 140);
  }
  wrap.addEventListener('scroll', function () {
    lastScroll = Date.now();
    if (!dotRaf) dotRaf = requestAnimationFrame(updateDots);
    settle();
  }, { passive: true });
  wrap.addEventListener('touchstart', function () { touching = true; userAct(); }, { passive: true });
  wrap.addEventListener('touchend', function () { touching = false; settle(); }, { passive: true });
  wrap.addEventListener('touchcancel', function () { touching = false; settle(); }, { passive: true });

  /* ---- mouse drag (pointerType mouse only; touch/pen stay native) ---- */
  var dragX = 0, dragStart = 0, dragMoved = false, vel = 0, lastX = 0, lastT = 0, dragStartIdx = 0;
  wrap.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true; dragMoved = false; userAct();
    dragX = e.clientX; dragStart = wrap.scrollLeft; vel = 0; lastX = e.clientX; lastT = performance.now();
    dragStartIdx = baseIdx();
    animTarget = -1;
    wrap.classList.add('is-dragging');
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - dragX;
    if (!dragMoved && Math.abs(dx) > 5) dragMoved = true;
    if (!dragMoved) return;
    var now = performance.now();
    var dt = now - lastT;
    if (dt > 0) vel = 0.8 * vel + 0.2 * ((e.clientX - lastX) / dt);
    lastX = e.clientX; lastT = now;
    wrap.scrollLeft = dragStart - dx;
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    var moved = dragMoved;
    var travelled = dragStart - wrap.scrollLeft;
    wrap.classList.remove('is-dragging');
    if (!moved) return;
    var cur = nearest();
    /* one card per gesture: a flick or a drag past ~1/4 of the card steps once */
    var w = slides[cur] ? slides[cur].offsetWidth : 300;
    var step = 0;
    if (vel < -0.35 || travelled > w * 0.25) step = 1;
    else if (vel > 0.35 || travelled < -w * 0.25) step = -1;
    var t = dragStartIdx + step;
    if (step === 0) t = cur;
    t = Math.max(0, Math.min(total - 1, t));
    /* snap is still off for this frame: restore it, then glide */
    scrollToIdx(t);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  /* a drag must not activate a link/button under the cursor */
  wrap.addEventListener('click', function (e) {
    if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
  }, true);
  wrap.addEventListener('dragstart', function (e) { e.preventDefault(); });

  /* ---- autoplay: one card every 2.8s; pauses on interaction, hover, focus, off-screen, hidden tab ---- */
  var INTERVAL = 2800, PAUSE_AFTER_USER = 4500;
  var lastUser = 0, hovering = false, focused = false, visible = true;
  function userAct() { lastUser = Date.now(); }
  root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
  root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hovering = false; });
  root.addEventListener('focusin', function () { focused = true; });
  root.addEventListener('focusout', function () { focused = false; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.25 }).observe(wrap);
  }
  setInterval(function () {
    if (reduced() || document.hidden || !visible || hovering || focused || touching || dragging) return;
    if (Date.now() - lastUser < PAUSE_AFTER_USER) return;
    go(1);
  }, INTERVAL);

  /* ---- boot + resize ---- */
  function home(real) {
    measure();
    wrap.scrollLeft = lefts[n + (real || 0)];
    lastReal = -1;
    updateDots();
  }
  requestAnimationFrame(function () { home(0); });
  window.addEventListener('load', function () { home(nearest() % n); });
  var lastW = wrap.clientWidth;
  window.addEventListener('resize', function () {
    var w = wrap.clientWidth;
    if (w === lastW) return;
    lastW = w;
    var real = nearest() % n;
    home(real);
  }, { passive: true });
})();
