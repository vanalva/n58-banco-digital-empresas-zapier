/* N58 · Laboratorio de variantes (review page only, never production).
   Each <div data-n58-lab="Nombre"> holds several <div data-n58-lab-variant="Etiqueta">.
   A strip under each section (built here, reusing the .n58-gallery-arrow chevrons)
   steps through them. All variants render on first paint so the flwr marquee / arch gallery engines
   can measure; after load the inactive ones are hidden and a resize re-measures.
   Picks persist in the URL (?v=hero:3,talleres:2) so the URL is the selection. */
(function () {
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-n58-lab]'));
  if (!groups.length) return;
  /* Icons resolve from this script's own URL: a '../assets/' literal breaks once the build
     flattens pages/ to the site root (the deployed lab showed no arrows). */
  var me = document.currentScript || document.querySelector('script[src*="n58-lab.js"]');
  var icons = new URL('images/icons/', me ? me.src : location.href).href;
  var arrows = { prev: icons + 'left-arrow-green.svg', next: icons + 'right-arrow-green.svg' };

  function key(g) { return g.getAttribute('data-n58-lab-key'); }
  function readPicks() {
    var out = {};
    var m = /[?&]v=([^&]+)/.exec(location.search);
    if (m) decodeURIComponent(m[1]).split(',').forEach(function (p) {
      var kv = p.split(':'); if (kv.length === 2) out[kv[0]] = parseInt(kv[1], 10) - 1;
    });
    return out;
  }
  function writePicks() {
    var parts = groups.map(function (g) { return key(g) + ':' + (g._i + 1); });
    var url = location.pathname + '?v=' + parts.join(',') + location.hash;
    try { history.replaceState(null, '', url); } catch (e) {}
  }

  function moveSlots(variant) {
    Array.prototype.forEach.call(variant.querySelectorAll('[data-n58-lab-slot]'), function (slot) {
      var name = slot.getAttribute('data-n58-lab-slot');
      var node = document.querySelector('[data-n58-lab-slotted="' + name + '"]');
      if (node && node.parentNode !== slot) slot.appendChild(node);
    });
  }

  function show(g, i, initial) {
    var n = g._variants.length;
    g._i = (i + n) % n;
    g._variants.forEach(function (v, j) {
      if (initial) return;
      v.hidden = j !== g._i;
    });
    moveSlots(g._variants[g._i]);
    g._count.textContent = (g._i + 1) + ' / ' + n;
    g._label.textContent = g._variants[g._i].getAttribute('data-n58-lab-variant');
    if (!initial) {
      writePicks();
      window.dispatchEvent(new Event('resize'));
    }
  }

  var picks = readPicks();
  groups.forEach(function (g) {
    g._variants = Array.prototype.slice.call(g.querySelectorAll(':scope > [data-n58-lab-variant]'));
    var bar = document.createElement('div');
    bar.className = 'n58-lab_bar';
    bar.innerHTML =
      '<div class="n58-lab_bar-inner f-mode-dark">' +
        '<button type="button" class="n58-gallery-arrow" data-dir="-1" aria-label="Variante anterior"><img class="n58-gallery-arrow_img" src="' + arrows.prev + '" alt="" aria-hidden="true"></button>' +
        '<span class="n58-lab_bar-text"><span class="f-text-tiny f-text-color-accent n58-lab_bar-name"></span><span class="f-text-small f-text-color-strong n58-lab_bar-label"></span></span>' +
        '<span class="f-text-tiny f-text-color-muted n58-lab_bar-count"></span>' +
        '<button type="button" class="n58-gallery-arrow" data-dir="1" aria-label="Variante siguiente"><img class="n58-gallery-arrow_img" src="' + arrows.next + '" alt="" aria-hidden="true"></button>' +
      '</div>';
    g.appendChild(bar);
    bar.querySelector('.n58-lab_bar-name').textContent = g.getAttribute('data-n58-lab');
    g._label = bar.querySelector('.n58-lab_bar-label');
    g._count = bar.querySelector('.n58-lab_bar-count');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-dir]');
      if (!b) return;
      /* The section above changes height; keep the bar where the pointer is. */
      var before = bar.getBoundingClientRect().top;
      show(g, g._i + parseInt(b.getAttribute('data-dir'), 10));
      /* Lazy images in the new option keep changing its height for a moment. */
      var until = Date.now() + 1500;
      (function hold() {
        var d = bar.getBoundingClientRect().top - before;
        if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: 'instant' });
        if (Date.now() < until) requestAnimationFrame(hold);
      })();
    });
    var start = picks[key(g)];
    show(g, typeof start === 'number' && start >= 0 && start < g._variants.length ? start : 0, true);
  });

  /* Engines measured with everything visible; now collapse to one variant each. */
  function settle() {
    groups.forEach(function (g) { show(g, g._i); });
    document.documentElement.setAttribute('data-n58-lab-ready', '');
  }
  if (document.readyState === 'complete') setTimeout(settle, 700);
  else window.addEventListener('load', function () { setTimeout(settle, 700); });
})();
