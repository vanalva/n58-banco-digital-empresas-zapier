/* ═══════════════════════════════════════════════════════════════════════════
   N58 navbar — adapts to the surface behind it
   ───────────────────────────────────────────────────────────────────────────
   The bar is fixed, so it floats over whatever happens to be under it. It ships
   dark (cream on ink) and disappears the moment a light section scrolls beneath
   — the Documentos Legales hero being the obvious case.

   This decides what is behind the bar and toggles `.is-light` on the wrapper.
   The CSS side (project.css, "LIGHT-SECTION NAVBAR") re-points the navbar's
   component tokens to ink and lets borders and icons follow currentColor, so a
   single class flips the whole bar.

   Three passes, in order of confidence:

     1. Section geometry — the deepest <section>/<footer> straddling the bar's
        bottom edge. Cheap, and right for the common case.
     2. Mode ancestry — hit-test near the left gutter (clear of centred overlays
        like the FX pill) and walk up to the nearest f-mode-* element.
     3. Background luminance — the first ancestor with a non-transparent
        background wins. This is what covers the gaps BETWEEN sections, where
        the page's own baseline colour is all there is.

   Geometry rather than hit-testing alone, because a hit test at the bar's edge
   lands on the dropdown backdrop whenever a menu is open, and the backdrop
   belongs to no section — which would flip the bar mid-interaction.

   Any element can force the answer with data-n58-navbar="light|dark".
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var nav = document.querySelector('.flwr_navbar_wrap');
  if (!nav) return;

  var MODED = '.f-mode-dark, .f-mode-light';
  var SECTIONS = 'section, footer, [data-n58-navbar], ' + MODED;
  var IGNORE = '.flwr_navbar_wrap, .flwr_navbar_dropdown_backdrop, .alan-fab, .n58-fx-bar';

  function deepestSectionAt(y) {
    var nodes = document.querySelectorAll(SECTIONS);
    var hit = null;
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i];
      if (nav.contains(s) || s.contains(nav)) continue;
      var r = s.getBoundingClientRect();
      if (!r.height || r.top > y || r.bottom <= y) continue;
      // A bare f-mode-* block (e.g. a dark photo bleed inside a light wrapper)
      // only counts when it spans the viewport; small dark cards must not flip the bar.
      if (s.matches(MODED) && r.width < innerWidth * 0.9) continue;
      // Prefer the most nested match: it describes the surface, not the wrapper.
      if (!hit || hit.contains(s)) hit = s;
    }
    return hit;
  }

  function elementAt(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (nav.contains(e) || (e.closest && e.closest(IGNORE))) continue;
      return e;
    }
    return null;
  }

  function opaqueBackgroundOf(el) {
    for (var e = el; e && e !== document.documentElement; e = e.parentElement) {
      var bg = getComputedStyle(e).backgroundColor;
      var m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      var parts = m[1].split(',').map(parseFloat);
      if (parts.length > 3 && parts[3] < 0.5) continue;   // see-through: keep going
      return parts;
    }
    var root = getComputedStyle(document.documentElement).backgroundColor.match(/rgba?\(([^)]+)\)/);
    return root ? root[1].split(',').map(parseFloat) : null;
  }

  function isDarkColor(rgb) {
    if (!rgb) return true;
    // Rec. 601 luma is plenty for a light/dark decision.
    var luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luma < 0.5;
  }

  function modeOf(el) {
    if (!el) return null;
    var flagged = el.closest && el.closest('[data-n58-navbar]');
    if (flagged) return flagged.getAttribute('data-n58-navbar') === 'light' ? 'light' : 'dark';
    var moded = el.closest && el.closest('.f-mode-dark, .f-mode-light');
    if (moded) return moded.classList.contains('f-mode-dark') ? 'dark' : 'light';
    return null;
  }

  // Layout bottom of the bar, NOT getBoundingClientRect().bottom: auto-hide slides
  // the bar up with a transform, and a rect read mid-slide (or while hidden) lands
  // above the viewport, finds no section, and falls through to the page's cream
  // baseline — the bar then came back light over a dark hero.
  function barBottom() {
    return (parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight;
  }

  function behindIsDark() {
    var r = nav.getBoundingClientRect();
    var y = barBottom() + 2;              // just inside whatever sits below

    var sec = deepestSectionAt(y);
    var mode = modeOf(sec);
    if (mode) return mode === 'dark';

    // Left gutter: clear of the centred FX pill and other floating chrome.
    var el = elementAt(Math.max(8, r.left + 24), y) || elementAt(r.left + r.width / 2, y);
    mode = modeOf(el);
    if (mode) return mode === 'dark';

    return isDarkColor(opaqueBackgroundOf(el || document.body));
  }

  var raf = 0;
  function update() {
    raf = 0;
    nav.classList.toggle('is-light', !behindIsDark());
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('load', schedule);          // late media can reflow sections
  // iOS: the toolbar showing/hiding changes the visible height without a window resize, and fonts
  // change link heights after first paint, so re-measure on both.
  if (window.visualViewport) visualViewport.addEventListener('resize', update);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  addEventListener('load', update);
  document.addEventListener('toggle', update, true);
  update();
})();

/* Full-screen menu: one card open at a time.
   The flwr runtime owns open/close (dialog) and each card's expand/collapse
   ([data-flwr="collapse"] toggles .is-open + aria-expanded on its trigger). It has no
   "exclusive" mode, so this listener closes the OTHER cards first; the runtime then
   toggles the tapped one. Closing the menu collapses everything, so it reopens clean.
   The menu itself is always dark, so it no longer mirrors the navbar's light mode. */
(function () {
  'use strict';
  var menu = document.getElementById('n58-menu');
  if (!menu) return;
  var CARD = '[data-flwr="collapse"]';

  function collapse(card) {
    card.classList.remove('is-open');
    var t = card.querySelector('[data-flwr-target="trigger"]');
    if (t) t.setAttribute('aria-expanded', 'false');
  }

  menu.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-flwr-target="trigger"]');
    if (!trigger || !menu.contains(trigger)) return;
    var card = trigger.closest(CARD);
    var cards = menu.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) if (cards[i] !== card) collapse(cards[i]);
  });

  menu.addEventListener('close', function () {
    var cards = menu.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) collapse(cards[i]);
  });
})();

/* Full-screen menu: a bottom sheet on NATIVE scroll-snap, plus the close machinery that works in every mode.
   Snap mode: the dialog holds a full-height scroller (.n58-fsmenu_scroller, snap type y mandatory) with a
   transparent spacer on top and the sheet below; invisible marker elements are the snap points: CLOSED
   (scrollTop 0), DEFAULT (sheet at content height, capped, with the whole card list clear of the CTA strip) and
   FULL (sheet top ~6svh). There is deliberately no gesture code for moving the sheet: the browser tracks the finger.
   This script (1) measures the layout from real rects and writes two CSS variables, re-measuring whenever fonts,
   viewport or card heights change, (2) parks the scroller on DEFAULT the moment the dialog opens, (3) below DEFAULT
   slides the CTA strip down with the sheet and fades the scrim, (4) dismisses a pull-down from the gesture's own
   deltas / release velocity, and (5) ANIMATES EVERY CLOSE (X, tap on the overlay, Esc, pull-down): the sheet and
   the strip retract downward together, the scrim fades, and only then dialog.close() runs.
   Overlay taps are decided by geometry (the tap point vs the sheet's and the strip's rects), never by event target.
   Safeguards: without scroll-snap / scrollTo, or if this code throws, the dialog gets .is-static-sheet (plain
   non-draggable sheet); the close machinery still works there; if anything in it throws the dialog is closed at
   once, so the menu can always be closed. */
(function () {
  'use strict';
  var menu = document.getElementById('n58-menu');
  if (!menu) return;
  var scroller = menu.querySelector('.n58-fsmenu_scroller');
  var sheet = menu.querySelector('.n58-fsmenu_sheet');
  var head = menu.querySelector('.n58-fsmenu_head');
  var links = menu.querySelector('.n58-fsmenu_links');
  var base = menu.querySelector('.n58-fsmenu_foot');
  var handle = menu.querySelector('.n58-fsmenu_handle');
  var body = menu.querySelector('.n58-fsmenu_scrollbody');
  var content = menu.querySelector('.n58-fsmenu_content');
  var isStatic = false;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var DISMISS_MS = 240;
  var closing = false, closeTimer = 0, safetyTimer = 0, tappedAt = 0;
  var geo = { d: 0, f: 0, e: 0, v: 0 };
  var applied = { y: -1, s: -1 };
  var alanbox = menu.querySelector('.n58-fsmenu_alanbox');
  var alanbtn = menu.querySelector('.n58-fsmenu_alanbtn');
  var alanFits = false, alanP = -1, openChatAfterClose = false;

  // ---------- animated close (every path) ----------
  function resetClose() {
    clearTimeout(closeTimer); clearTimeout(safetyTimer); closing = false;
    try {
      if (scroller) { scroller.style.scrollSnapType = ''; scroller.style.overflowY = ''; }
      menu.classList.remove('is-dismissing'); menu.classList.remove('is-pulling');
      if (content) { content.classList.remove('is-dismissing'); content.style.removeProperty('--n58-dismiss-y'); content.style.removeProperty('--n58-foot-y'); }
      menu.style.removeProperty('--n58-scrim');
    } catch (_) {}
    applied = { y: -1, s: -1 };
  }
  function hardClose() {
    clearTimeout(closeTimer); clearTimeout(safetyTimer);
    try { if (menu.open) menu.close(); } catch (_) {}
    try { document.body.style.overflow = ''; } catch (_) {}
  }
  // Retract the sheet + strip downward together (reverse of the open slide), fade the scrim, then close.
  function retractClose(why) {
    if (!menu.open) return;
    if (closing) { if (why === 'esc') hardClose(); return; }
    closing = true;

    try {
      clearTimeout(settleTimer); if (raf) { cancelAnimationFrame(raf); raf = 0; }
      var V = window.innerHeight || 0;
      var sr = sheet.getBoundingClientRect(), fr = base.getBoundingClientRect();
      var need = Math.max(V - sr.top, V - fr.top) + 16;
      if (!isFinite(need) || need <= 0) need = V + 16;
      if (!isStatic && scroller) { scroller.style.scrollSnapType = 'none'; scroller.style.overflowY = 'hidden'; }   // freeze momentum
      if (reduce.matches) { hardClose(); return; }
      menu.classList.remove('is-pulling');
      menu.classList.add('is-dismissing'); content.classList.add('is-dismissing');
      void content.offsetHeight;                                   // commit the start values so the transition runs
      content.style.setProperty('--n58-dismiss-y', Math.ceil(need) + 'px');
      menu.style.setProperty('--n58-scrim', '0');
      closeTimer = setTimeout(hardClose, DISMISS_MS + 30);
      safetyTimer = setTimeout(hardClose, DISMISS_MS + 800);       // whatever happens, the menu closes
    } catch (err) {
      hardClose();
    }
  }
  menu.addEventListener('close', function () {
    resetClose(); if (!isStatic) { try { onClosed(); } catch (_) {} }
    if (openChatAfterClose) {
      openChatAfterClose = false;
      // Same trigger the floating button uses, in every build (Vanny in full, the Zapier panel in empresas-zapier).
      setTimeout(function () { try { var fab = document.querySelector('.alan-fab'); if (fab) fab.click(); } catch (_) {} }, 80);
    }
  });
  if (alanbtn) alanbtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (!document.querySelector('.alan-fab')) return;
    openChatAfterClose = true;
    retractClose('alan');
  });

  // X: intercepted in the capture phase so the runtime's instant close never runs first.
  // Overlay tap: geometry, never targets. Taps outside both the sheet and the CTA strip are overlay taps.
  function inRect(r, x, y) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function overlayHit(x, y) {
    var sr = sheet.getBoundingClientRect(), fr = base.getBoundingClientRect();
    if (!sr.width || !sr.height) return false;                      // not laid out: never guess
    return !inRect(sr, x, y) && !inRect(fr, x, y);
  }
  menu.addEventListener('click', function (e) {
    try {
      if (!menu.open) return;
      if (Date.now() - tappedAt < 700) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (closing) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      var x = e.target && e.target.closest && e.target.closest('.n58-menu-close');
      if (x) { e.preventDefault(); e.stopImmediatePropagation(); retractClose('x'); return; }
      if (e.clientX === 0 && e.clientY === 0) return;               // keyboard-synthesised click: no position, not an overlay tap
      if (overlayHit(e.clientX, e.clientY)) { e.preventDefault(); e.stopImmediatePropagation(); retractClose('overlay'); return; }
    } catch (err) { hardClose(); }
  }, true);
  // Same decision on touchend, with a tiny-movement guard, in case iOS never synthesises a click on a non-interactive layer.
  var tap = null;
  menu.addEventListener('touchstart', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    tap = t ? { x: t.clientX, y: t.clientY, t: Date.now(), moved: false } : null;
  }, { capture: true, passive: true });
  menu.addEventListener('touchmove', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (tap && t && Math.sqrt(Math.pow(t.clientX - tap.x, 2) + Math.pow(t.clientY - tap.y, 2)) >= 10) tap.moved = true;
  }, { capture: true, passive: true });
  menu.addEventListener('touchend', function (e) {
    try {
      var tp = tap; tap = null;
      var t = e.changedTouches && e.changedTouches[0];
      if (!tp || !t || tp.moved || Date.now() - tp.t > 600 || !menu.open || closing) return;
      if (overlayHit(t.clientX, t.clientY)) {
        if (e.cancelable) e.preventDefault();                       // no ghost click on the page underneath
        tappedAt = Date.now();

        retractClose('overlay');
      }
    } catch (err) { hardClose(); }
  }, { capture: true, passive: false });
  // Esc: animate instead of the browser's instant close.
  menu.addEventListener('cancel', function (e) {
    try {
      if (closing) { e.preventDefault(); hardClose(); return; }
      e.preventDefault(); retractClose('esc');
    } catch (err) { hardClose(); }
  });

  // ---------- static fallback ----------
  function goStatic() {
    if (isStatic) return;
    isStatic = true;
    menu.classList.add('is-static-sheet');
    try {
      if (content) content.style.removeProperty('--n58-foot-y');
      menu.style.removeProperty('--n58-scrim');
      menu.classList.remove('is-pulling');
      if (scroller) { scroller.style.removeProperty('--n58-snap-d'); scroller.style.scrollSnapType = ''; scroller.style.overflowY = ''; scroller.scrollTop = 0; }
    } catch (_) {}
  }
  var settleTimer = 0, raf = 0;
  function onClosed() {}                                             // replaced below in snap mode

  if (!scroller || !sheet || !head || !links || !base || !handle || !body || !content) { goStatic(); return; }
  var canSnap = false;
  try {
    canSnap = !!(window.CSS && CSS.supports && CSS.supports('scroll-snap-type', 'y mandatory'))
      && ('scrollTo' in Element.prototype) && ('MutationObserver' in window) && ('requestAnimationFrame' in window);
  } catch (_) { canSnap = false; }
  if (!canSnap) { goStatic(); return; }

  // ---------- snap mode ----------
  var FULL_TOP = 0.06;      // FULL snap leaves this share of the viewport above the sheet
  var CAP = 0.88;           // DEFAULT sheet top never above 12% of the viewport
  var GAP = 20;             // clear space between the last card's bottom and the CTA strip's top edge (>= step--4 + its rounded top)
  var CLOSE_AT = 6;         // scrollTop at or below this = fully pulled down
  var DISMISS_PULL = 72, DISMISS_V = 0.5;
  var openedAt = 0, restS = 0, lastClientH = 0, samples = [], gesture = null;
  function guard(fn) {
    return function () {
      if (isStatic) return;
      try { return fn.apply(this, arguments); } catch (err) { goStatic(); }
    };
  }
  function nearest() {
    var s = scroller.scrollTop, best = 'closed', bd = Math.abs(s);
    [['default', geo.d], ['full', geo.f], ['end', geo.e]].forEach(function (p) { var d = Math.abs(s - p[1]); if (d < bd - 0.5) { bd = d; best = p[0]; } });
    return bd <= 8 ? best : 'moving';
  }
  function lastCard() {
    var kids = links.children;
    for (var i = kids.length - 1; i >= 0; i--) if (kids[i].offsetHeight > 0) return kids[i];
    return null;
  }

  // Layout -> CSS variables, from real rects. D puts the sheet so the whole card list ends GAP above the strip.
  function measure() {
    var v = scroller.clientHeight;
    if (!v || !isFinite(v)) return false;
    var bottom = base.offsetHeight;
    if (!bottom) return false;
    var sr = sheet.getBoundingClientRect(), card = lastCard();
    var cardBottomRel = card ? card.getBoundingClientRect().bottom - sr.top : head.offsetHeight + links.offsetHeight;
    if (!isFinite(cardBottomRel) || cardBottomRel <= 0) cardBottomRel = head.offsetHeight + links.offsetHeight;
    var want = Math.ceil(cardBottomRel + GAP + bottom);                     // scrollTop at which the card list clears the strip
    var d = Math.min(want, Math.round(v * CAP));
    scroller.style.setProperty('--n58-bottom-space', bottom + 'px');
    scroller.style.setProperty('--n58-snap-d', d + 'px');
    geo.v = v; geo.d = d; geo.f = Math.round(v * (1 - FULL_TOP));
    geo.e = Math.max(0, scroller.scrollHeight - v);
    lastClientH = v;
    measureAlan(cardBottomRel);
    return true;
  }
  // The AlaN block shows only if it fits completely in the free space under the last card at FULL (sheet min-height
  // minus the card list), with ALAN_PAD of breathing room above and below. Re-measured with everything else (card expand /
  // collapse, resize, URL-bar changes). A page without the floating chat button has nothing to open: hidden too.
  var ALAN_PAD = 12;   // px of breathing room above and below the block (the block is compact: robot ~84px + button)
  function measureAlan(cardBottomRel) {
    if (!alanbox || !alanbtn) return;
    var fits = false;
    try {
      if (document.querySelector('.alan-fab')) {
        var minH = parseFloat(getComputedStyle(sheet).minHeight) || 0;
        var boxH = alanbox.offsetHeight;
        var free = minH - cardBottomRel;
        fits = boxH > 0 && free >= boxH + 2 * ALAN_PAD;
        if (fits) alanbox.style.setProperty('--n58-alan-top', Math.round(cardBottomRel + (free - boxH) / 2) + 'px');
      }
    } catch (_) { fits = false; }
    alanFits = fits;
    setAlan(alanP < 0 ? 0 : alanP, true);
  }
  function setAlan(p, force) {
    if (!alanbox || !alanbtn) return;
    if (!alanFits) p = 0;
    if (reduce.matches) p = p >= 0.98 ? 1 : 0;
    if (!force && Math.abs(p - alanP) < 0.004) return;
    alanP = p;
    alanbox.style.setProperty('--n58-alan-p', p.toFixed(3));
    var on = alanFits && p > 0.01, usable = alanFits && p > 0.6;
    alanbox.classList.toggle('is-on', on);
    if (usable) { alanbox.removeAttribute('inert'); alanbox.removeAttribute('aria-hidden'); alanbtn.removeAttribute('tabindex'); }
    else { alanbox.setAttribute('inert', ''); alanbox.setAttribute('aria-hidden', 'true'); alanbtn.setAttribute('tabindex', '-1'); }
  }
  function ensureMeasured() { if (!geo.d || !isFinite(geo.d) || scroller.clientHeight !== lastClientH) return measure(); return true; }
  function jump(top) {
    var prev = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollTop = top;
    scroller.style.scrollBehavior = prev;
  }
  function defaultS() { return geo.d > 0 ? geo.d : (restS || 0); }

  // Below DEFAULT the CTA strip rides down with the sheet (1:1) and the scrim fades in proportion.
  function apply() {
    raf = 0;
    if (!menu.open || closing) return;
    if (!ensureMeasured()) return;                       // this frame only: never give up permanently
    var s = scroller.scrollTop, d = defaultS();
    if (!d) return;
    var y = Math.max(0, d - s), sc = Math.max(0, Math.min(1, s / d));
    if (y !== applied.y) { content.style.setProperty('--n58-foot-y', y.toFixed(1) + 'px'); applied.y = y; }
    if (sc !== applied.s) { menu.style.setProperty('--n58-scrim', sc.toFixed(3)); applied.s = sc; }
    menu.classList.toggle('is-pulling', s < d - 0.5);
    setAlan(geo.f > geo.d ? Math.max(0, Math.min(1, (s - geo.d) / (geo.f - geo.d))) : 0);
  }

  // Park on DEFAULT synchronously with the dialog opening; keep re-asserting while the first layouts settle.
  var onOpen = guard(function () {
    openedAt = Date.now(); restS = 0; gesture = null; samples = [];
    resetClose();
    handle.setAttribute('aria-expanded', 'false'); handle.setAttribute('aria-label', 'Expandir menú');
    void scroller.offsetHeight;                          // make sure the freshly shown dialog has been laid out
    geo.d = 0; lastClientH = 0;
    if (measure()) { jump(geo.d); apply(); }
    // showModal() focuses the first control (the handle), which can scroll the scroller to reveal it; iOS can report
    // zero heights in the first frames; with reduced motion the first measurement can land before layout settles.
    var tries = 0;
    (function fix() {
      if (isStatic || !menu.open || closing) return;
      var young = Date.now() - openedAt < 350;
      try {
        var ok = ensureMeasured();
        if (ok && (young || tries < 8) && Math.abs(scroller.scrollTop - geo.d) > 2 && !gesture) { measure(); jump(geo.d); apply(); }
        if (ok && !gesture && Date.now() - openedAt > 300) restS = geo.d;
      } catch (_) { goStatic(); return; }
      if (++tries < 40 && Date.now() - openedAt < 700) requestAnimationFrame(fix);
    })();
    // late re-measures: fonts, URL bar, slow layout
    [200, 600, 1200, 2500].forEach(function (ms) { setTimeout(guard(function () { if (menu.open && !closing && !gesture) remeasure(); }), ms); });

    try { menu.focus({ preventScroll: true }); } catch (_) {}
  });
  onClosed = guard(function () { clearTimeout(settleTimer); if (raf) { cancelAnimationFrame(raf); raf = 0; } samples = []; gesture = null; });
  new MutationObserver(function () { if (menu.open) onOpen(); }).observe(menu, { attributes: true, attributeFilter: ['open'] });

  // Anything that can change heights: re-measure; if the sheet was parked on DEFAULT, keep it there.
  var remeasure = guard(function () {
    if (!menu.open || closing) return;
    var was = nearest(), oldD = geo.d, oldS = scroller.scrollTop;
    if (!measure()) return;
    if (!gesture && (was === 'default' || Math.abs(oldS - oldD) <= 8 || !oldD)) {
      if (Math.abs(scroller.scrollTop - geo.d) > 1) scroller.scrollTo({ top: geo.d, behavior: reduce.matches || Date.now() - openedAt < 1500 ? 'auto' : 'smooth' });
    }
    apply();
  });
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { remeasure(); });
    ro.observe(links); ro.observe(base); ro.observe(head); ro.observe(scroller);
  }
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('orientationchange', function () { setTimeout(remeasure, 300); });
  addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { remeasure(); });
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { remeasure(); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', remeasure); }

  // ---------- pull-down dismissal from the gesture's own deltas ----------
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function sample() {
    var t = now();
    samples.push({ t: t, s: scroller.scrollTop });
    while (samples.length > 2 && t - samples[0].t > 120) samples.shift();
  }
  function releaseVelocity() {                               // downward-positive px/ms over the last ~100ms
    var t = now();
    var recent = samples.filter(function (p) { return t - p.t <= 110; });
    if (recent.length < 2) return 0;
    var a = recent[0], b = recent[recent.length - 1];
    return b.t > a.t ? (a.s - b.s) / (b.t - a.t) : 0;
  }
  scroller.addEventListener('touchstart', guard(function () {
    ensureMeasured();
    var s0 = scroller.scrollTop, d = defaultS();
    gesture = { s0: s0, atOrBelowDefault: !d || s0 <= d + 4, t0: Date.now() };
    samples = []; sample();
  }), { passive: true });
  scroller.addEventListener('touchmove', function () { if (gesture) sample(); }, { passive: true });
  var onTouchEnd = guard(function (e) {
    var g = gesture; gesture = null;
    if (!g || closing || !menu.open || Date.now() - openedAt < 450) return;
    sample();
    var s1 = scroller.scrollTop, v = releaseVelocity(), delta = g.s0 - s1;      // + = the sheet moved down
    var d = defaultS(), branch = 'snap-back';
    if (g.atOrBelowDefault && delta > DISMISS_PULL) branch = 'dismiss(delta ' + Math.round(delta) + ')';
    else if (v > DISMISS_V && (g.atOrBelowDefault || (d && s1 <= d + 4))) branch = 'dismiss(velocity ' + v.toFixed(2) + ')';
    else if (d && d - s1 > DISMISS_PULL) branch = 'dismiss(geo ' + Math.round(d - s1) + ')';

    if (branch.indexOf('dismiss') === 0) retractClose('pull');
  });
  scroller.addEventListener('touchend', onTouchEnd, { passive: true });
  scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // Extra safety: reaching the end of the scroll / scroll idle also close (animated, though the sheet is already gone).
  var closeIfPulledDown = function (why) {
    if (!menu.open || closing || Date.now() - openedAt < 450) return false;
    if (scroller.scrollTop <= CLOSE_AT) { retractClose('pulled-' + why); return true; }
    return false;
  };
  var settled = guard(function () {
    clearTimeout(settleTimer);
    if (closeIfPulledDown('settled')) return;
    if (!menu.open || closing) return;
    var expanded = scroller.scrollTop > (geo.d + geo.f) / 2;
    handle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    handle.setAttribute('aria-label', expanded ? 'Contraer menú' : 'Expandir menú');
  });
  var firstScroll = true;
  scroller.addEventListener('scroll', guard(function () {
    if (closing) return;
    if (firstScroll) { firstScroll = false; ensureMeasured(); }
    if (menu.open && Date.now() - openedAt < 800 && !geo.d) measure();
    sample();
    if (!raf) raf = requestAnimationFrame(guard(apply));
    if (scroller.scrollTop <= 1 && closeIfPulledDown('end')) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settled, 120);
  }), { passive: true });
  if ('onscrollend' in window) scroller.addEventListener('scrollend', function () { settled(); });

  // Handle: toggle DEFAULT <-> FULL with a smooth scroll (instant with reduced motion).
  handle.addEventListener('click', guard(function () {
    measure();
    var s = scroller.scrollTop;
    var target = s < (geo.d + geo.f) / 2 ? geo.f : geo.d;
    scroller.scrollTo({ top: target, behavior: reduce.matches ? 'auto' : 'smooth' });
  }));
})();
