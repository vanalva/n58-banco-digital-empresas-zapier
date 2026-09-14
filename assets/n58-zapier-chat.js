/* n58-zapier-chat.js — Zapier Interfaces chatbot, in-page panel.
 *
 * Ships ONLY in the "empresas-zapier" version of this site. The base site (and
 * the "empresas" prototype) load https://vanny.chat/vanny-widget.js at this
 * exact script slot instead; the version swaps the src, so nothing here reaches
 * a build that still runs Vanny. See .flowriter-versions.json.
 *
 * ── WHY A HAND-BUILT IFRAME (and not Zapier's web-component embed) ───────────
 * This mirrors what the published Webflow site already does: OUR chrome around
 * a raw iframe of the bot, injected lazily on first click (n58.pages.dev/js/
 * sections/chatbot-loader.js). Zapier's own popup would drop a second, Zapier-
 * branded launcher in the same corner as the AlaN FAB and ignore the site's
 * theme. Owning the container is also the ONLY way to offer move + fullscreen:
 * Vanny renders those controls INSIDE its embed and posts drag/fullscreen
 * events out to the host script. Zapier's iframe posts nothing and is
 * cross-origin, so the affordances have to live in our frame instead.
 *
 * Nothing loads until the first click — the iframe is built once and kept.
 */
(function () {
  'use strict';

  var BOT_URL = 'https://interfaces.zapier.com/embed/chatbot/cmc1x2kxk001k4i9jbygtrl5e';
  var LOCK_CLASS = 'n58-zapier-open';
  var SHEET_MQ = '(max-width: 767px)';
  var DRAG_THRESHOLD = 4;   /* px of movement before a press becomes a drag */
  var EDGE = 8;             /* keep the panel this far inside the viewport */

  var fabs = [].slice.call(document.querySelectorAll('.alan-fab'));
  if (!fabs.length) return;

  var root = null;      /* .n58-zapier wrapper */
  var panel = null;     /* .n58-zapier_panel   */
  var head = null;      /* .n58-zapier_head — the drag handle */
  var expandBtn = null;
  var lastFocus = null;
  var isFull = false;
  var dragPos = null;   /* {left, top} once the visitor has moved the panel */

  function isSheet() {
    return window.matchMedia && window.matchMedia(SHEET_MQ).matches;
  }
  function isOpen() {
    return !!(root && !root.hidden && root.classList.contains('is-open'));
  }

  /* The page behind only locks while the panel actually covers it — as a sheet
     on phones, or fullscreen. Derived from state rather than set at open time,
     so crossing the breakpoint mid-session lands right in BOTH directions. */
  function syncLock() {
    document.documentElement.classList.toggle(LOCK_CLASS, isOpen() && (isSheet() || isFull));
  }

  /* The panel parks directly above the FAB, so it has to know how tall the FAB
     is. Measured rather than hardcoded: the notch button's height follows the
     type scale and changes between breakpoints. */
  function syncOffset() {
    if (!root) return;
    var visible = fabs.filter(function (el) { return el.offsetParent !== null; });
    var fab = visible[0] || fabs[0];
    var h = fab ? fab.getBoundingClientRect().height : 0;
    root.style.setProperty('--n58-zapier-fab-h', (h || 44) + 'px');
  }

  function icon(markup) {
    var wrap = document.createElement('span');
    wrap.className = 'n58-zapier_ico';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + markup + '</svg>';
    return wrap;
  }

  /* Reuse the site's close control verbatim. The two notched cream bars are
     <img>s already present on every page (the fullscreen menu uses them), so
     cloning one keeps the build's asset rewriting intact — a hardcoded path in
     a JS string would not be rerooted when pages flatten to the web root. */
  function buildClose() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'n58-modal-close n58-zapier_btn';
    btn.setAttribute('aria-label', 'Cerrar');

    var box = document.createElement('span');
    box.className = 'n58-close-x';
    box.setAttribute('aria-hidden', 'true');

    var source = document.querySelector('.n58-close-x_bar, img[src$="menu-bar-cream.svg"]');
    for (var i = 1; i <= 2; i++) {
      var bar;
      if (source) {
        bar = source.cloneNode(true);
        bar.removeAttribute('loading');
      } else {
        bar = document.createElement('span');
      }
      bar.className = 'n58-close-x_bar n58-close-x_bar--' + i;
      bar.setAttribute('alt', '');
      box.appendChild(bar);
    }
    btn.appendChild(box);
    btn.addEventListener('click', close);
    return btn;
  }

  function buildExpand() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'n58-modal-close n58-zapier_btn n58-zapier_expand';
    btn.appendChild(icon(
      '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
      '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'
    ));
    btn.addEventListener('click', toggleFull);
    return btn;
  }

  function setFull(next) {
    isFull = !!next;
    root.classList.toggle('is-full', isFull);
    expandBtn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
    var label = isFull ? 'Salir de pantalla completa' : 'Pantalla completa';
    expandBtn.setAttribute('aria-label', label);
    expandBtn.title = label;
    /* Fullscreen centres itself; a dragged position would fight that. Drop the
       inline offsets while full, put them back on the way out. */
    if (isFull) clearPos(); else applyPos();
    syncLock();
  }
  function toggleFull() { setFull(!isFull); }

  function clearPos() {
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
  }

  /* Re-pin a dragged panel, clamped so a resize can never strand it offscreen.
     Fullscreen and the phone sheet own their own geometry, so both reset. */
  function applyPos() {
    if (!dragPos || isFull || isSheet()) { clearPos(); return; }
    var b = panel.getBoundingClientRect();
    var maxLeft = Math.max(EDGE, window.innerWidth - b.width - EDGE);
    var maxTop = Math.max(EDGE, window.innerHeight - b.height - EDGE);
    root.style.left = Math.min(Math.max(dragPos.left, EDGE), maxLeft) + 'px';
    root.style.top = Math.min(Math.max(dragPos.top, EDGE), maxTop) + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  /* Drag by the header. Pointer capture is taken on the first move past a
     threshold, NEVER on pointerdown — capturing immediately swallows the click
     that the buttons sitting in the same handle still need. */
  function wireDrag() {
    var start = null;

    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || isFull || isSheet()) return;
      if (e.target.closest('button')) return;        /* let the controls click */
      var b = panel.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: b.left, top: b.top, id: e.pointerId, on: false };
    });

    head.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!start.on) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        start.on = true;
        root.classList.add('is-dragging');
        try { head.setPointerCapture(start.id); } catch (err) {}
      }
      dragPos = { left: start.left + dx, top: start.top + dy };
      applyPos();
    });

    var end = function (e) {
      if (!start || (e && e.pointerId !== start.id)) return;
      if (start.on) {
        root.classList.remove('is-dragging');
        try { head.releasePointerCapture(start.id); } catch (err) {}
      }
      start = null;
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  function build() {
    root = document.createElement('div');
    /* NO mode class here. f-mode-* makes flwr paint an opaque surface, and this
       wrapper is a bare positioning frame with no radius — that square fill sat
       behind the rounded panel and ate its bottom corners. The mode belongs on
       the panel, the element that actually renders a surface (same as
       <dialog class="antifraud-dialog f-mode-dark"> elsewhere on the site). */
    root.className = 'n58-zapier';
    root.hidden = true;

    panel = document.createElement('div');
    /* .antifraud-dialog carries the shared dark-modal surface; only the
       chat-specific layout is added by .n58-zapier_panel. */
    panel.className = 'n58-zapier_panel antifraud-dialog f-mode-dark';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Chatear con AlaN');
    panel.tabIndex = -1;   /* focus target on open; kept out of the tab order */

    head = document.createElement('div');
    head.className = 'n58-zapier_head';
    var title = document.createElement('span');
    title.className = 'n58-zapier_title f-text-small';
    title.textContent = 'AlaN';
    head.appendChild(title);
    expandBtn = buildExpand();
    head.appendChild(expandBtn);
    head.appendChild(buildClose());

    var frameWrap = document.createElement('div');
    frameWrap.className = 'n58-zapier_frame';

    var frame = document.createElement('iframe');
    frame.src = BOT_URL;
    frame.title = 'AlaN — asistente de N58';
    frame.setAttribute('allow', 'clipboard-write *');
    frame.className = 'n58-zapier_iframe';
    frameWrap.appendChild(frame);

    /* Same badge strip the published site lays over this embed's footer. */
    var mask = document.createElement('div');
    mask.className = 'n58-zapier_badge';
    mask.setAttribute('aria-hidden', 'true');
    frameWrap.appendChild(mask);

    panel.appendChild(head);
    panel.appendChild(frameWrap);
    root.appendChild(panel);

    /* Tapping the dimmed area closes the sheet on phones and the fullscreen
       scrim on desktop. Otherwise the wrapper is inert (pointer-events: none)
       and this never fires. */
    root.addEventListener('click', function (e) { if (e.target === root) close(); });

    /* MUST mount inside the [data-flwr] wrapper, not on <body>. Every rule in
       project.css is scoped `[data-flwr] .x`, and the theme tokens (surface,
       text) plus the f-mode-* classes are declared on that wrapper — a panel
       parked on <body> silently loses all of its styling and renders light. */
    (document.querySelector('[data-flwr]') || document.body).appendChild(root);
    setFull(false);
    wireDrag();
    syncOffset();
  }

  function open() {
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    syncOffset();
    applyPos();
    /* Next frame, so the transition has a "closed" state to run from. */
    requestAnimationFrame(function () {
      root.classList.add('is-open');
      fabs.forEach(function (el) { el.setAttribute('aria-expanded', 'true'); });
      syncLock();
      /* Focus the panel itself, not the close button: a programmatic focus() on
         a real control draws the focus-visible ring even for a mouse click.
         .antifraud-dialog already suppresses its own outline. */
      panel.focus({ preventScroll: true });
    });
  }

  function close() {
    if (!isOpen()) return;
    root.classList.remove('is-open');
    fabs.forEach(function (el) { el.setAttribute('aria-expanded', 'false'); });
    setTimeout(function () {
      if (!root.classList.contains('is-open')) root.hidden = true;
    }, 260);
    document.documentElement.classList.remove(LOCK_CLASS);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function toggle(e) {
    /* The FAB is an <a> pointing at the bot on every page but the home page —
       that href is the no-JS fallback. With JS, the panel wins. */
    e.preventDefault();
    if (isOpen()) close(); else open();
  }

  fabs.forEach(function (el) {
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-haspopup', 'dialog');
    el.addEventListener('click', toggle);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (!isOpen()) return;
    if (isFull) setFull(false);   /* step out of fullscreen before closing */
    else close();
  });

  window.addEventListener('resize', function () {
    syncOffset();
    applyPos();
    syncLock();
  });
})();
