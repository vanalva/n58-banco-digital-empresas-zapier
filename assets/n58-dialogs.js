/* N58 dialogs - one shared helper for every modal <dialog> on the site.
   Loaded synchronously in <head> (before any inline script captures showModal).

   1. SETTLE GATE. Dialogs the visitor did not ask for (scroll-triggered popups,
      the first-visit anti-fraud modal) wait until the page has been still for
      SETTLE_MS before opening. On iOS a modal that appears during momentum scroll
      swallows the first tap (it only stops the scroll), so the X needed two taps.
      A scroll-triggered dialog whose scroll position falls back above its
      threshold before the page settles is dropped (and re-armed).
   2. SCROLL LOCK while any modal is open: .n58-scroll-locked on <html> and <body>
      (CSS in project.css), scroll position preserved and restored, touch drags
      on the backdrop blocked (iOS), content that scrolls inside a dialog still
      scrolls. Refcount-free: unlocks when no :modal dialog remains. */
(function () {
  if (window.__n58Dialogs || typeof HTMLDialogElement === 'undefined') return;
  window.__n58Dialogs = true;

  var SETTLE_MS = 300;
  var LOCK = 'n58-scroll-locked';
  var root = document.documentElement;

  /* ---- scroll activity ---- */
  var lastMove = 0, touching = false, timer = 0, pending = [];
  function now() { return Date.now(); }
  function settled() { return !touching && now() - lastMove >= SETTLE_MS; }
  function arm(ms) {
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }
  function activity() {
    lastMove = now();
    if (pending.length) arm(SETTLE_MS);
  }
  window.addEventListener('scroll', activity, { passive: true });
  window.addEventListener('wheel', activity, { passive: true });
  window.addEventListener('touchmove', activity, { passive: true });
  window.addEventListener('touchstart', function () { touching = true; activity(); }, { passive: true });
  function touchEnd() { touching = false; activity(); }
  window.addEventListener('touchend', touchEnd, { passive: true });
  window.addEventListener('touchcancel', touchEnd, { passive: true });
  /* scrollend = the browser says momentum is over; settle sooner, still debounced. */
  document.addEventListener('scrollend', function () {
    if (pending.length && !touching) arm(120);
  });

  function gated(d) {
    return d.getAttribute('data-flwr-target') === 'antifraud' ||
      /(^|\s)scroll(\s|$)/.test(d.getAttribute('data-flwr-trigger') || '');
  }
  function threshold(d) {
    if (!/(^|\s)scroll(\s|$)/.test(d.getAttribute('data-flwr-trigger') || '')) return 0;
    return parseInt(d.getAttribute('data-flwr-scroll-threshold') || '200', 10);
  }
  function rearm(d) {
    setTimeout(function () {
      if (window.flwr && window.flwr.scrollDialog && window.flwr.scrollDialog.reset) {
        try { window.flwr.scrollDialog.reset(d); } catch (e) {}
      }
    }, 0);
  }
  function flush() {
    if (!settled()) { arm(SETTLE_MS - (now() - lastMove) + 20); return; }
    var list = pending; pending = [];
    list.forEach(function (d) {
      if (d.open || !d.isConnected) return;
      var y = window.scrollY || window.pageYOffset || 0;
      if (y < threshold(d)) { rearm(d); return; }
      if (anyModal()) { rearm(d); return; }
      open(d);
    });
  }

  /* ---- scroll lock ---- */
  var savedY = 0, locked = false;
  function lock() {
    if (locked) return;
    locked = true;
    savedY = window.scrollY || window.pageYOffset || 0;
    root.classList.add(LOCK);
    if (document.body) document.body.classList.add(LOCK);
  }
  function unlock() {
    if (!locked) return;
    locked = false;
    root.classList.remove(LOCK);
    if (document.body) document.body.classList.remove(LOCK);
    if ((window.scrollY || window.pageYOffset || 0) !== savedY) {
      window.scrollTo({ top: savedY, left: 0, behavior: 'instant' });
    }
  }
  function anyModal() { return !!document.querySelector('dialog:modal'); }
  document.addEventListener('close', function () { if (!anyModal()) unlock(); }, true);
  /* Safety net for dialogs closed without a close event. */
  new MutationObserver(function () { if (locked && !anyModal()) unlock(); })
    .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['open'] });

  /* iOS: overflow:hidden alone leaks touch scrolling. Block drags that are not
     inside a dialog's own scrollable content. */
  function scrollableWithin(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
      if (el.tagName === 'DIALOG') return false;
    }
    return false;
  }
  document.addEventListener('touchmove', function (e) {
    if (!locked || !e.cancelable || e.touches.length > 1) return;
    if (!scrollableWithin(e.target)) e.preventDefault();
  }, { passive: false });

  /* ---- showModal wrapper ---- */
  var nativeShow = HTMLDialogElement.prototype.showModal;
  function open(d) {
    nativeShow.call(d);
    lock();
  }
  HTMLDialogElement.prototype.showModal = function () {
    var d = this;
    if (d.open) return;
    if (gated(d) && !settled()) {
      if (pending.indexOf(d) < 0) pending.push(d);
      arm(SETTLE_MS);
      return;
    }
    open(d);
  };
  /* Dialogs opened with the non-modal show()/open attribute are not locked. */
})();

/* Footer copyright year: every [data-n58-year] shows the current year. */
(function () {
  function setYear() {
    var year = String(new Date().getFullYear());
    var nodes = document.querySelectorAll('[data-n58-year]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = year;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setYear);
  else setYear();
})();

/* Safety net: external links, downloads and PDFs always open in a new tab.
   Rule: absolute http(s) to another host, any file (.pdf/.doc(x)/.xls(x)/.zip...
   or a non-page file under assets/), or an anchor with [download]. Never for
   page links, #anchors, tel:, mailto: or sms:. Runs on load and on content that
   is injected later (Modo lectura renders fetched documents). */
(function () {
  var SELF = { 'www.n58bancodigital.com': 1, 'n58bancodigital.com': 1 };
  var FILE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv)$/i;
  function needsTab(a) {
    var h = a.getAttribute('href');
    if (!h || /^(#|tel:|mailto:|sms:|javascript:|data:)/i.test(h)) return false;
    var m = /^(?:https?:)?\/\/([^\/:?#]+)/i.exec(h);
    if (m && !SELF[m[1].toLowerCase()]) return true;
    var path = h.split(/[?#]/)[0];
    if (FILE.test(path)) return true;
    if (/(^|\/)assets\//.test(path) && !/\.html?$/i.test(path) && /\.\w{2,5}$/.test(path)) return true;
    return a.hasAttribute('download');
  }
  function fix(root) {
    var list = (root || document).querySelectorAll('a[href]');
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!needsTab(a)) continue;
      if (!a.getAttribute('target')) a.setAttribute('target', '_blank');
      if (a.getAttribute('target') === '_blank') {
        var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
        if (rel.indexOf('noopener') < 0) { rel.push('noopener'); a.setAttribute('rel', rel.join(' ')); }
      }
    }
  }
  function start() {
    fix(document);
    if (window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () {
        if (queued) return;
        queued = true;
        setTimeout(function () { queued = false; fix(document); }, 50);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
