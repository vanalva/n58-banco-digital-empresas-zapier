/* ============================================================================
   flwr runtime — vanilla JS controllers for behaviors that CSS can't express.
   Self-initializes on DOMContentLoaded. All behaviors are gated by data
   attributes — no element with the attribute = no work done. Safe to load
   on any page.

   Conventions:
     [data-flwr-trigger~="scroll"]              opens a <dialog> at scroll depth
     [data-flwr-scroll-threshold="<px>"]        per-instance trigger depth
     [data-flwr-scroll-once="true|false"]       fire only once (default true)
     [data-flwr-target="next"]                  cycles its closest card-stack
     [data-flwr-target="prev"]                  reverses its closest card-stack

   Public API on window.flwr:
     flwr.cardStack.next(stackEl)
     flwr.cardStack.prev(stackEl)
     flwr.scrollDialog.refresh()                 re-scan DOM for new dialogs
     flwr.scrollEngine.refresh()/items()         Safari scroll-driven animation engine (see its section)
     flwr.<controller>.init(scope?)             hydrate (idempotent, see below)
     flwr.<controller>.destroy(scope?)          tear down what init() created
     flwr.init(scope?)                           every controller, boot order
     flwr.destroy(scope?)                        every controller, reverse order

   Lifecycle (v1.2):
     - init() is idempotent. Each controller remembers the elements it has
       hydrated (a WeakMap per controller, nothing is written to the DOM) and
       skips them on the next call, so a CMS re-render or a canvas live-edit
       can call init() again and only the new markup binds. Controllers that
       delegate on document/window (cardStack, collapse, cardOverlay's
       outside-click, scrollDialog's scroll) bind once per scope.
     - destroy(scope) removes every listener, rAF, timeout and observer the
       controller created for elements inside scope (all of them when scope
       is omitted), forgets the ready marks, and undoes the DOM the hydration
       wrote: marquee clones and text-fill sizing, vertical-text wrappers,
       list chips and item display, search highlights, Swiper and Leaflet
       hydration (their own destroy), inline styles and a11y shims (tabindex,
       role, aria-checked) the runtime added. It deliberately leaves
       interaction state alone (aria-expanded, aria-selected, hidden panels,
       data-flwr-state, is-open/is-active, closed banners) so init() after
       destroy() resumes from where the user was; and it keeps the
       scroll-dialog fired-once memory (flwr.scrollDialog.reset() clears it).
       Document/window-level bindings only fall on a full destroy().
     - Pages that never call destroy() behave exactly as before.

   Size: ~118 KB source, ~49.5 KB minified, ~16 KB gzipped (the 1.7.1 scroll
   engine is ~7.2 KB min, ~3.2 KB gz of that). 23 controllers run in
   sequence from init(). Optional peers: Swiper (flwr_swiper_*) and Leaflet
   (flwr_map_*) are hydrated when present on window; nothing else is required.
   v1.2: each controller runs through runController() so one failure is
   logged ([flwr] <name> failed) and the rest still initialize; navbar closes
   on Escape with focus return; non-native toggles/card-stack/overlay/collapse
   triggers are keyboard-operable (role=switch, aria-checked, Enter/Space).
   Not yet provided: a document-level observer for late-rendered (CMS)
   markup — call flwr.init(newRoot) after inserting it.
   ============================================================================ */

(function () {
  'use strict';

  /* -- lifecycle registry ----------------------------------------------- */
  /* One registry per controller: `owned` maps a hydrated element (or the
     scope/window a delegated binding was made on) to its "unit"; a unit
     holds every listener, rAF, timeout, observer and DOM undo that the
     hydration created. init() skips owned elements; destroy() kills units
     and drops their owned entry so a later init() rebuilds from scratch. */

  var registry = {};

  function ctrl(name) {
    return registry[name] || (registry[name] = { name: name, owned: new WeakMap(), units: [] });
  }

  function unit(c, owner) {
    var u = {
      owner: owner || null,
      dead: false,
      _ls: [], _raf: {}, _to: {}, _obs: [], _undo: [], _seen: new WeakMap()
    };
    u.on = function (target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      u._ls.push([target, type, fn, opts]);
      return fn;
    };
    u.off = function (target, type, fn, opts) {
      target.removeEventListener(type, fn, opts);
      for (var i = u._ls.length - 1; i >= 0; i--) {
        var l = u._ls[i];
        if (l[0] === target && l[1] === type && l[2] === fn) { u._ls.splice(i, 1); break; }
      }
    };
    u.raf = function (fn) {
      var id = requestAnimationFrame(function (ts) { delete u._raf[id]; fn(ts); });
      u._raf[id] = 1;
      return id;
    };
    u.cancelRaf = function (id) { cancelAnimationFrame(id); delete u._raf[id]; };
    u.timeout = function (fn, ms) {
      var id = setTimeout(function () { delete u._to[id]; fn(); }, ms);
      u._to[id] = 1;
      return id;
    };
    u.clearTimeout = function (id) { clearTimeout(id); delete u._to[id]; };
    u.observe = function (observer) { u._obs.push(observer); return observer; };
    u.undo = function (fn) { u._undo.push(fn); };
    /* Record-once DOM snapshots. The first snap() per (element, key) stores
       how to put the prior value back; destroy() replays them in reverse.
       The setters below snap then write, so hot paths can snap once at init
       and keep writing directly afterwards. */
    u.snap = function (el, key) {
      var seen = u._seen.get(el);
      if (!seen) { seen = {}; u._seen.set(el, seen); }
      if (seen[key]) return;
      seen[key] = 1;
      var kind = key.slice(0, key.indexOf(':') + 1 || key.length);
      var name = key.slice(kind.length);
      var prior, priority;
      if (kind === 'attr:') {
        prior = el.getAttribute(name);
        u._undo.push(function () { if (prior === null) el.removeAttribute(name); else el.setAttribute(name, prior); });
      } else if (kind === 'style:') {
        prior = el.style.getPropertyValue(name);
        priority = el.style.getPropertyPriority(name);
        u._undo.push(function () { if (prior) el.style.setProperty(name, prior, priority); else el.style.removeProperty(name); });
      } else if (kind === 'class:') {
        prior = el.classList.contains(name);
        u._undo.push(function () { el.classList.toggle(name, prior); });
      } else if (key === 'text') {
        prior = el.textContent;
        u._undo.push(function () { el.textContent = prior; });
      } else if (key === 'html') {
        prior = el.innerHTML;
        u._undo.push(function () { el.innerHTML = prior; });
      }
    };
    u.attr = function (el, name, value) { u.snap(el, 'attr:' + name); el.setAttribute(name, value); };
    u.style = function (el, prop, value) { u.snap(el, 'style:' + prop); el.style.setProperty(prop, value); };
    u.cls = function (el, name, on) { u.snap(el, 'class:' + name); el.classList.toggle(name, on); };
    u.text = function (el, value) { u.snap(el, 'text'); el.textContent = value; };
    c.units.push(u);
    if (owner) c.owned.set(owner, u);
    return u;
  }

  function killUnit(c, u) {
    u.dead = true;
    var i;
    for (i = 0; i < u._ls.length; i++) {
      var l = u._ls[i];
      try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (_) {}
    }
    u._ls = [];
    for (i in u._raf) cancelAnimationFrame(+i);
    u._raf = {};
    for (i in u._to) clearTimeout(+i);
    u._to = {};
    for (i = 0; i < u._obs.length; i++) { try { u._obs[i].disconnect(); } catch (_) {} }
    u._obs = [];
    for (i = u._undo.length - 1; i >= 0; i--) {
      try { u._undo[i](); } catch (err) { console.warn('[flwr] ' + c.name + ' undo failed', err); }
    }
    u._undo = [];
    if (u.owner && c.owned.get(u.owner) === u) c.owned.delete(u.owner);
  }

  function inScope(owner, scope) {
    if (!scope || scope === document) return true;
    if (!owner) return false;
    if (owner === scope) return true;
    return !!(owner.nodeType && scope.contains && scope.contains(owner));
  }

  function destroyController(name, scope) {
    var c = registry[name];
    if (!c) return;
    var keep = [];
    for (var i = 0; i < c.units.length; i++) {
      var u = c.units[i];
      if (inScope(u.owner, scope)) killUnit(c, u); else keep.push(u);
    }
    c.units = keep;
  }

  /* Units whose element left the document (a CMS re-render replaced it)
     are torn down on the next init() so their loops and listeners do not
     outlive the markup. Only elements are pruned; document/window units
     stay. */
  function pruneDetached(c) {
    var keep = [];
    for (var i = 0; i < c.units.length; i++) {
      var u = c.units[i];
      var o = u.owner;
      if (o && o.nodeType === 1 && o.isConnected === false) killUnit(c, u); else keep.push(u);
    }
    c.units = keep;
  }

  /* Look up (or open) the controller registry at the top of every init. */
  function begin(name) {
    var c = ctrl(name);
    pruneDetached(c);
    return c;
  }

  /* Delegated controllers (cardStack, collapse) listen once per scope. A
     scope already covered by a bound ancestor (init(section) after the
     document boot) gets a records-only unit so exactly one listener pair
     sees any click; a wider scope retires the narrower bindings inside it.
     Returns { unit, bound } — bound means "do not add listeners". */
  function delegatedUnit(c, scope) {
    var own = c.owned.get(scope);
    if (own) return { unit: own, bound: true };
    var i, o;
    for (i = 0; i < c.units.length; i++) {
      o = c.units[i].owner;
      if (o && o !== scope && c.units[i]._ls.length && (o === document || (o.contains && o.contains(scope)))) {
        return { unit: unit(c, scope), bound: true };
      }
    }
    var keep = [];
    for (i = 0; i < c.units.length; i++) {
      o = c.units[i].owner;
      if (o && o.nodeType === 1 && scope.contains(o)) killUnit(c, c.units[i]); else keep.push(c.units[i]);
    }
    c.units = keep;
    return { unit: unit(c, scope), bound: false };
  }

  /* -- keyboard helpers ------------------------------------------------- */
  /* Shared by the keyboard shims below. Native controls already turn
     Enter/Space into a click, so the shims skip them and only patch
     non-native click targets (div/span/article). */

  function isNativeControl(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    return t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' ||
      t === 'SUMMARY' || (t === 'A' && el.hasAttribute('href'));
  }
  function ensureFocusable(el, u) {
    if (!isNativeControl(el) && !el.hasAttribute('tabindex')) {
      if (u) u.attr(el, 'tabindex', '0'); else el.setAttribute('tabindex', '0');
    }
  }
  function isActivateKey(e) {
    return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
  }

  /* -- card stack ------------------------------------------------------- */

  function getStackList(wrap) {
    return wrap && wrap.querySelector('.flwr_card_stack_list');
  }

  /* Apply --_card-stack---index inline based on each slide's position.
     Last DOM child gets index 0 (top of stack), then 1, 2, 3 deeper.
     Index >= max-depth fades to opacity 0 (handled by CSS fallback too).
     With a unit, the first write per slide is recorded for destroy(). */
  function indexStack(wrap, u) {
    var list = getStackList(wrap);
    if (!list) return;
    var slides = list.children;
    var n = slides.length;
    for (var i = 0; i < n; i++) {
      if (u) u.style(slides[i], '--_card-stack---index', String(n - 1 - i));
      else slides[i].style.setProperty('--_card-stack---index', String(n - 1 - i));
    }
  }

  /* Read the wind-up duration from the wrap's computed style so the JS timer
     stays in sync with --_component---card-stack--wind-up-duration. Falls back
     to 240ms if the var is unset (matches the token default). */
  function getWindUpMs(wrap) {
    var raw = getComputedStyle(wrap)
      .getPropertyValue('--_component---card-stack--wind-up-duration')
      .trim();
    if (!raw) return 240;
    if (raw.slice(-2) === 'ms') return parseFloat(raw) || 240;
    if (raw.slice(-1) === 's')  return (parseFloat(raw) || 0.24) * 1000;
    return parseFloat(raw) || 240;
  }

  function nextCard(wrap) {
    var list = getStackList(wrap);
    if (!list) return;
    var top = list.lastElementChild;
    if (!top || top.classList.contains('is-moving-back')) return;
    /* Step 1 — wind up: top card translates OPPOSITE the peek direction
       briefly, like a hand drawing a card out before tucking it under. */
    top.classList.add('is-moving-back');
    /* Step 2 — re-parent to the front of the DOM list (= deepest in stack)
       after wind-up completes. Natural transition between indices slides
       every card to its new layer position. */
    setTimeout(function () {
      top.classList.remove('is-moving-back');
      list.insertBefore(top, list.firstElementChild);
      indexStack(wrap);
    }, getWindUpMs(wrap));
  }

  function prevCard(wrap) {
    var list = getStackList(wrap);
    if (!list) return;
    var first = list.firstElementChild;
    if (!first) return;
    /* Move first DOM child to last (= bring deepest card to top). Natural
       transition slides it forward from peek position to front. */
    list.appendChild(first);
    indexStack(wrap);
  }

  /* Bring any deeper card to the top of the stack. Animation handled by the
     natural CSS transition between layer indices — clicked card slides
     forward from its peek position to translate(0, 0). Cards in front of it
     shift back one layer. */
  function moveToTop(wrap, slide) {
    var list = getStackList(wrap);
    if (!list || !slide || slide.parentElement !== list) return;
    if (slide === list.lastElementChild) return; /* already on top */
    list.appendChild(slide);
    indexStack(wrap);
  }

  function initCardStacks(root) {
    var scope = root || document;
    var c = begin('cardStack');
    /* One unit per scope: the delegated listeners bind once, the per-call
       indexing below stays (it is idempotent and picks up new stacks). */
    var du = delegatedUnit(c, scope);
    var bound = du.bound, u = du.unit;
    /* Index every stack on the page so depth is correct from first paint */
    var wraps = scope.querySelectorAll('.flwr_card_stack_wrap');
    for (var i = 0; i < wraps.length; i++) {
      indexStack(wraps[i], u);
      /* Keyboard: non-native click targets (article slides, div nav) get a
         tab stop so the delegated keydown below can reach them. */
      var targets = wraps[i].querySelectorAll('.flwr_card_stack_slide, [data-flwr-target="next"], [data-flwr-target="prev"]');
      for (var k = 0; k < targets.length; k++) ensureFocusable(targets[k], u);
    }
    if (bound) return;

    /* Shared activation logic for click + keyboard. Any slide is clickable:
         - top slide  → cycle back (wind-up + tuck under)
         - any deeper → slide forward to the top
       Buttons with data-flwr-target="next"/"prev" still work as explicit nav.
       Returns true when the target belonged to a card stack. */
    function activateStackTarget(target) {
      var slide = target.closest && target.closest('.flwr_card_stack_slide');
      if (slide) {
        var wrap = slide.closest('.flwr_card_stack_wrap');
        if (wrap) {
          var list = slide.parentElement;
          if (slide === list.lastElementChild) {
            nextCard(wrap);
          } else {
            moveToTop(wrap, slide);
          }
          return true;
        }
      }
      var nextBtn = target.closest && target.closest('[data-flwr-target="next"]');
      if (nextBtn) {
        var wrapN = nextBtn.closest('.flwr_card_stack_wrap');
        if (wrapN) nextCard(wrapN);
        return !!wrapN;
      }
      var prevBtn = target.closest && target.closest('[data-flwr-target="prev"]');
      if (prevBtn) {
        var wrapP = prevBtn.closest('.flwr_card_stack_wrap');
        if (wrapP) prevCard(wrapP);
        return !!wrapP;
      }
      return false;
    }

    /* Single delegated click handler. */
    u.on(scope, 'click', function (e) {
      activateStackTarget(e.target);
    });
    /* Enter/Space on a focused non-native target mirrors the click. Native
       buttons already synthesize a click, so they are skipped to avoid a
       double activation. */
    u.on(scope, 'keydown', function (e) {
      if (!isActivateKey(e) || isNativeControl(e.target)) return;
      if (activateStackTarget(e.target)) e.preventDefault();
    });
  }

  /* -- scroll-triggered dialogs ----------------------------------------- */

  var scrollDialogs = [];
  var scrollFired = new WeakSet();

  function scanScrollDialogs() {
    scrollDialogs = Array.prototype.slice.call(
      document.querySelectorAll('dialog[data-flwr-trigger~="scroll"]')
    );
  }

  function checkScrollDialogs() {
    if (!scrollDialogs.length) return;
    var y = window.scrollY || window.pageYOffset || 0;
    for (var i = 0; i < scrollDialogs.length; i++) {
      var d = scrollDialogs[i];
      var fireOnce = d.dataset.flwrScrollOnce !== 'false';
      if (fireOnce && scrollFired.has(d)) continue;
      var threshold = parseInt(d.dataset.flwrScrollThreshold || '200', 10);
      if (y >= threshold && typeof d.showModal === 'function' && !d.open) {
        try { d.showModal(); } catch (err) { /* already open or invalid state */ }
        if (fireOnce) scrollFired.add(d);
      }
    }
  }

  function initScrollDialogs() {
    var c = begin('scrollDialog');
    scanScrollDialogs();
    if (!scrollDialogs.length) return;
    /* The window scroll listener binds once; later calls only re-scan. */
    if (!c.owned.has(window)) {
      var u = unit(c, window);
      u.on(window, 'scroll', checkScrollDialogs, { passive: true });
      u.undo(function () { scrollDialogs = []; });
    }
    /* Run once at load in case page is already scrolled past threshold */
    checkScrollDialogs();
  }

  /* -- marquee ---------------------------------------------------------- */
  /* Adapted from Alttura. Custom GPU-friendly infinite scroller with optional
     text-fill scaling, hover-pause, hover-ease, drag-to-scrub, prefers-
     reduced-motion respect. Runs only on [data-flwr="marquee"]. */

  function attr(el, name, fallback) {
    var v = el.getAttribute(name);
    return v === null ? fallback : v;
  }
  function attrBool(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v === null) return fallback;
    return v === 'true';
  }

  function initMarquee(wrap, u) {
    if (!u) {
      var c = begin('marquee');
      if (c.owned.has(wrap)) return;
      u = unit(c, wrap);
    }
    var track = wrap.querySelector('.flwr_marquee_track');
    if (!track) return;

    var dirRTL          = attrBool(wrap, 'data-flwr-marquee-direction', false);
    var speedMs         = parseInt(attr(wrap, 'data-flwr-marquee-speed', '20000'), 10) || 20000;
    var hoverPause      = attrBool(wrap, 'data-flwr-marquee-hover-pause', true);
    var hoverEase       = attrBool(wrap, 'data-flwr-marquee-hover-ease', true);
    var respectPRM      = attrBool(wrap, 'data-flwr-marquee-respect-prm', true);
    var draggable       = attrBool(wrap, 'data-flwr-marquee-draggable', false);
    var scaleText       = attrBool(wrap, 'data-flwr-marquee-scale-text', false);
    var textMultiplier  = parseFloat(attr(wrap, 'data-flwr-marquee-text-width-multiplier', '2')) || 2;

    var prm = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduceMotion = respectPRM && prm.matches;

    /* Smart text-fill — duplicate single item to fill multiplier × parent
       width, then scale font-size so each item matches the target width. */
    function setupTextFill() {
      if (!scaleText) return;
      var originals = [].filter.call(track.children, function (n) {
        return !n.classList.contains('marquee-clone');
      });

      function waitForWidth(cb, attempts) {
        attempts = attempts || 0;
        var w = wrap.offsetWidth;
        if (w > 0) { cb(w); return; }
        if (attempts > 100) return;
        u.raf(function () { waitForWidth(cb, attempts + 1); });
      }

      if (originals.length === 1) {
        var autoClones = [];
        u.undo(function () {
          for (var i = 0; i < autoClones.length; i++) {
            if (autoClones[i].parentNode) autoClones[i].parentNode.removeChild(autoClones[i]);
          }
        });
        waitForWidth(function () {
          for (var i = 0; i < Math.ceil(textMultiplier) + 2; i++) {
            var clone = originals[0].cloneNode(true);
            clone.setAttribute('data-auto-duplicate', 'true');
            track.appendChild(clone);
            autoClones.push(clone);
          }
        });
      }
      [].forEach.call(track.children, function (item) {
        if (item.classList.contains('marquee-clone')) return;
        u.cls(item, 'flwr_marquee_item', true);
        u.cls(item, 'is-text-fill', true);
      });

      function adjustFont() {
        var parentW = wrap.offsetWidth;
        if (parentW === 0) {
          u.raf(function () { u.raf(adjustFont); });
          return;
        }
        [].forEach.call(track.children, function (item) {
          if (item.classList.contains('marquee-clone')) return;
          var target = parentW * textMultiplier;
          var textEl = item.querySelector('p,h1,h2,h3,h4,h5,h6,span,div') || item;
          var measure = textEl.cloneNode(true);
          measure.style.cssText = 'position:absolute;visibility:hidden;width:auto;display:inline-block;white-space:nowrap;';
          document.body.appendChild(measure);
          var curW = measure.offsetWidth;
          var curFs = parseFloat(getComputedStyle(measure).fontSize);
          document.body.removeChild(measure);
          if (curW > 0) {
            var newFs = (target / curW) * curFs;
            u.style(textEl, 'font-size', newFs + 'px');
          }
        });
      }

      waitForWidth(adjustFont);
      u.timeout(adjustFont, 100);
      u.timeout(adjustFont, 300);
      if (document.fonts) document.fonts.ready.then(function () { if (!u.dead) adjustFont(); });
      var rt;
      u.on(window, 'resize', function () {
        u.clearTimeout(rt);
        rt = u.timeout(adjustFont, 150);
      });
    }
    setupTextFill();

    /* Animation engine — measure track, clone for seamless wrap, RAF loop */
    var packDistance = 0;
    var offset = 0;
    var targetVx = 0;
    var currentVx = 0;
    var playing = true;
    var dragging = false;
    var lastPx = 0;
    var rafId = 0;
    var lastT = 0;

    /* destroy(): the track transform goes back to its authored value and
       the seam clones are removed (measureAndClone also drops any that were
       there before the first measure, so those cannot be put back). */
    u.snap(track, 'style:transform');
    u.undo(function () {
      [].forEach.call(track.querySelectorAll('.marquee-clone'), function (n) { n.remove(); });
    });

    function measureAndClone() {
      [].forEach.call(track.querySelectorAll('.marquee-clone'), function (n) { n.remove(); });
      var items = [].filter.call(track.children, function (n) { return !n.classList.contains('marquee-clone'); });
      if (!items.length) return 0;
      var first = items[0];
      var last = items[items.length - 1];
      /* Measure with rects, not offsetLeft/offsetWidth: those are undefined on
         SVGElement, so an inline <svg> item (e.g. an inlined separator icon)
         poisoned dist with NaN — NaN passed the <=0 guard, produced NaN clone
         counts (zero clones) and NaN speed, freezing the marquee. Both rects
         share the track's transform, so the difference is translation-safe. */
      var fr = first.getBoundingClientRect();
      var lr = last.getBoundingClientRect();
      /* The wrap period is item[0] -> its clone: the item set PLUS the one
         column-gap flex puts between the last original and the first clone.
         Without it the loop resets one gap short every cycle and the track
         hitches sideways. The default track spaces items with padding (gap 0),
         so this only matters when an author sets gap on the track. */
      var trackCS = getComputedStyle(track);
      var trackGap = parseFloat(trackCS.columnGap || trackCS.gap) || 0;
      var dist = Math.round(lr.right - fr.left + trackGap);
      if (!(dist > 0)) return 0;
      /* Clone enough full sets to cover the viewport plus one wrap span, so the
         seam is never visible even when one item set is narrower than the
         marquee (e.g. a short ticker). */
      var copies = Math.max(2, Math.ceil(wrap.offsetWidth / dist) + 1);
      var k, i;
      for (k = 0; k < copies; k++) {
        items.forEach(function (n) {
          var c = n.cloneNode(true);
          c.classList.add('marquee-clone');
          track.appendChild(c);
        });
      }
      if (dirRTL) {
        for (k = 0; k < copies; k++) {
          for (i = items.length - 1; i >= 0; i--) {
            var c2 = items[i].cloneNode(true);
            c2.classList.add('marquee-clone');
            track.insertBefore(c2, track.firstChild);
          }
        }
      }
      offset = dirRTL ? -dist + 0.001 : -0.001;
      track.style.transform = 'translate3d(' + offset + 'px,0,0)';
      return dist;
    }
    function setSpeed() {
      var cycle = reduceMotion ? Math.max(1, speedMs) * 3 : Math.max(1, speedMs);
      var v = packDistance / cycle;
      targetVx = dirRTL ? v : -v;
      if (!hoverEase) currentVx = targetVx;
    }
    function wrapOff(span) {
      if (dirRTL) {
        while (offset >= 0)    offset -= span;
        while (offset < -span) offset += span;
      } else {
        while (offset <= -span) offset += span;
        while (offset > 0)      offset -= span;
      }
    }
    function tick(now) {
      if (!lastT) lastT = now;
      var dt = Math.min(now - lastT, 100);
      lastT = now;
      if (hoverEase) currentVx += (targetVx - currentVx) * 0.15;
      var vx = hoverEase ? currentVx : targetVx;
      if ((playing && !dragging) || hoverEase) {
        offset += vx * dt;
        if (packDistance > 0) wrapOff(packDistance);
        track.style.transform = 'translate3d(' + Math.round(offset) + 'px,0,0)';
      }
      rafId = u.raf(tick);
    }
    function start() { u.cancelRaf(rafId); lastT = 0; rafId = u.raf(tick); }
    function pause() { playing = false; targetVx = 0; if (!hoverEase) currentVx = 0; }
    function resume() { playing = true; setSpeed(); }

    if (hoverPause && !(window.matchMedia && window.matchMedia('(hover: none)').matches)) { /* touch: no hover-pause (iOS hover-first double tap) */
      u.on(wrap, 'mouseenter', function () { if (!dragging) pause(); });
      u.on(wrap, 'mouseleave', function () { if (!dragging) resume(); });
    }
    if (draggable) {
      /* Let the browser own vertical panning (page scroll); JS only handles a
         clearly-horizontal drag. Previously pointerdown set touch-action:none and
         captured the pointer immediately, so a vertical scroll swipe that started
         over the marquee was hijacked and scrubbed sideways — the marquee glitched
         instead of the page scrolling. touch-action:pan-y tells the browser to
         keep handling vertical scroll and only hand JS the horizontal gestures. */
      u.style(wrap, 'touch-action', 'pan-y');
      u.undo(function () { wrap.classList.remove('is-dragging'); });
      var moved = 0;
      u.on(wrap, 'click', function (e) {
        if (moved > 3) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      u.on(wrap, 'pointerdown', function (e) {
        var startX = e.clientX || 0, startY = e.clientY || 0;
        lastPx = startX; moved = 0;
        var engaged = false;
        function mv(ev) {
          var x = ev.clientX || 0, y = ev.clientY || 0;
          if (!engaged) {
            var dX = Math.abs(x - startX), dY = Math.abs(y - startY);
            if (dX < 6 && dY < 6) return;         // wait for an intentional gesture
            if (dY > dX) { cleanup(); return; }   // vertical intent → let the page scroll
            // horizontal intent → take over scrubbing
            engaged = true; dragging = true;
            wrap.classList.add('is-dragging');
            pause();
            try { wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); } catch (_) {}
          }
          var dx = x - lastPx; lastPx = x;
          moved += Math.abs(dx);
          offset += dx;
          if (packDistance > 0) wrapOff(packDistance);
          track.style.transform = 'translate3d(' + offset + 'px,0,0)';
        }
        function up() {
          if (engaged) {
            dragging = false;
            wrap.classList.remove('is-dragging');
            resume();
          }
          cleanup();
        }
        function cleanup() {
          u.off(window, 'pointermove', mv);
          u.off(window, 'pointerup', up);
          u.off(window, 'pointercancel', up);
        }
        u.on(window, 'pointermove', mv);
        u.on(window, 'pointerup', up);
        u.on(window, 'pointercancel', up);
      });
    }

    var rt;
    function rebuild() { packDistance = measureAndClone(); setSpeed(); }
    function debounced() { u.clearTimeout(rt); rt = u.timeout(rebuild, 120); }
    u.on(window, 'resize', debounced, { passive: true });

    function waitAssets() {
      var imgs = track.querySelectorAll('img');
      var pending = imgs.length;
      return new Promise(function (res) {
        if (!pending) return res();
        [].forEach.call(imgs, function (im) {
          if (im.complete) { if (--pending === 0) res(); }
          else {
            u.on(im, 'load',  function () { if (--pending === 0) res(); }, { once: true });
            u.on(im, 'error', function () { if (--pending === 0) res(); }, { once: true });
          }
        });
      });
    }
    waitAssets().then(function () {
      if (u.dead) return;
      function check() {
        if (wrap.offsetWidth > 0 && wrap.offsetHeight > 0) {
          rebuild();
          start();
        } else u.raf(check);
      }
      check();
    });
  }

  function initMarquees(scope) {
    var c = begin('marquee');
    var wraps = (scope || document).querySelectorAll('[data-flwr="marquee"]');
    [].forEach.call(wraps, function (w, i) {
      if (c.owned.has(w)) return;
      /* The unit opens at schedule time so destroy() can cancel the stagger. */
      var u = unit(c, w);
      u.timeout(function () { initMarquee(w, u); }, i * 150);
    });
  }

  /* -- swiper wrapper --------------------------------------------------- */
  /* Hydrates [data-flwr="swiper"] elements onto Swiper.js if present.
     Reads config from data-flwr-swiper-* attributes. Adapted from Alttura. */

  function initSwipers(scope) {
    if (typeof window.Swiper === 'undefined') return;
    var c = begin('swiper');
    var wraps = (scope || document).querySelectorAll('[data-flwr="swiper"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);
      var el = wrap.querySelector('.flwr_swiper_wrap');
      var listEl = wrap.querySelector('.flwr_swiper_track');
      if (!el || !listEl) return;
      u.cls(el, 'swiper', true);
      u.cls(listEl, 'swiper-wrapper', true);
      [].forEach.call(listEl.children, function (ch) {
        u.cls(ch, 'swiper-slide', true);
        u.cls(ch, 'flwr_swiper_slide', true);
      });

      var followFinger     = attrBool(wrap, 'data-flwr-swiper-follow-finger', true);
      var freeMode         = attrBool(wrap, 'data-flwr-swiper-free-mode', false);
      var mousewheel       = attrBool(wrap, 'data-flwr-swiper-mousewheel', false);
      var slideToClicked   = attrBool(wrap, 'data-flwr-swiper-slide-to-clicked', false);
      var loop             = attrBool(wrap, 'data-flwr-swiper-loop', false);
      var autoplay         = attrBool(wrap, 'data-flwr-swiper-autoplay', false);
      var speed            = parseInt(attr(wrap, 'data-flwr-swiper-speed', '600'), 10) || 600;
      var autoplayDelay    = parseInt(attr(wrap, 'data-flwr-swiper-autoplay-delay', '4000'), 10) || 4000;
      /* The track spaces slides with CSS gap (--_component---swiper--gap). Swiper 8
         leaves CSS gap out of its snap grid, so rendered slides and drag/navigation
         positions drift apart. Measure the gap, hand it to Swiper as spaceBetween,
         and zero the CSS gap so it is not applied twice. */
      var trackCS          = window.getComputedStyle(listEl);
      var swiperGap        = parseFloat(trackCS.columnGap || trackCS.gap) || 0;
      u.style(listEl, 'column-gap', '0px');
      u.style(listEl, 'row-gap', '0px');

      var nextBtn = wrap.querySelector('[data-flwr-target="next"] button, [data-flwr-target="next"]');
      var prevBtn = wrap.querySelector('[data-flwr-target="prev"] button, [data-flwr-target="prev"]');
      var paginationEl = wrap.querySelector('[data-flwr-target="pagination"]');
      if (paginationEl) { u.snap(paginationEl, 'html'); u.cls(paginationEl, 'flwr_swiper_pagination', true); }
      if (nextBtn) { u.cls(nextBtn, 'flwr_swiper_arrow', true); u.cls(nextBtn, 'is-next', true); }
      if (prevBtn) { u.cls(prevBtn, 'flwr_swiper_arrow', true); u.cls(prevBtn, 'is-prev', true); }

      var config = {
        slidesPerView: 'auto',
        grabCursor: true,
        followFinger: followFinger,
        freeMode: freeMode,
        slideToClickedSlide: slideToClicked,
        speed: speed,
        loop: loop,
        loopAdditionalSlides: 10,
        spaceBetween: swiperGap,
        watchOverflow: true,
        slideActiveClass: 'is-active',
        slideDuplicateActiveClass: 'is-active',
        keyboard: { enabled: true, onlyInViewport: true }
      };
      if (mousewheel) config.mousewheel = { forceToAxis: true };
      if (nextBtn || prevBtn) config.navigation = { nextEl: nextBtn, prevEl: prevBtn };
      if (paginationEl) {
        config.pagination = {
          el: paginationEl,
          bulletClass: 'flwr_swiper_bullet',
          bulletActiveClass: 'is-active',
          bulletElement: 'button',
          clickable: true
        };
      }
      if (autoplay) {
        config.autoplay = {
          delay: autoplayDelay,
          disableOnInteraction: false,
          pauseOnMouseEnter: true
        };
      }
      try {
        var sw = new window.Swiper(el, config);
        /* Swiper's own teardown: listeners, loop duplicates, its classes and
           inline styles (deleteInstance + cleanStyles). */
        u.undo(function () { try { if (sw && !sw.destroyed) sw.destroy(true, true); } catch (_) {} });
      } catch (err) {
        console.warn('[flwr] swiper init failed', err);
      }
    });
  }

  /* -- map (Leaflet) ---------------------------------------------------- */
  /* Hydrates [data-flwr="map"] onto Leaflet if window.L is present. */

  var TILE_URLS = {
    light:   'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  };

  function initMap(wrap) {
    var c = begin('map');
    if (c.owned.has(wrap)) return;
    hydrateMap(wrap, unit(c, wrap));
  }

  function hydrateMap(wrap, u) {
    var canvas = wrap.querySelector('.flwr_map_canvas');
    if (!canvas) return;
    /* Not laid out yet (hidden tab, collapsed section): retry on the same
       unit so destroy() cancels the retry too. */
    if (canvas.offsetHeight === 0) { u.timeout(function () { hydrateMap(wrap, u); }, 200); return; }

    var theme = attr(wrap, 'data-flwr-map-theme', 'dark');
    var tileUrl = TILE_URLS[theme] || TILE_URLS.dark;
    var locItems = wrap.querySelectorAll('.flwr_map_location');
    var locations = [];
    [].forEach.call(locItems, function (it) {
      var lat = parseFloat(it.getAttribute('data-flwr-map-lat'));
      var lng = parseFloat(it.getAttribute('data-flwr-map-lng'));
      if (isNaN(lat) || isNaN(lng)) return;
      locations.push({
        lat: lat, lng: lng,
        name:    it.getAttribute('data-flwr-map-name') || '',
        address: it.getAttribute('data-flwr-map-address') || '',
        url:     it.getAttribute('data-flwr-map-url') || ''
      });
    });
    if (!locations.length) return;

    var actionBtn = wrap.querySelector('.flwr_map_action');
    if (actionBtn) { u.snap(actionBtn, 'attr:href'); u.style(actionBtn, 'display', 'none'); }
    var L = window.L;
    var centerLat = locations.reduce(function (s, l) { return s + l.lat; }, 0) / locations.length;
    var centerLng = locations.reduce(function (s, l) { return s + l.lng; }, 0) / locations.length;
    var map = L.map(canvas, {
      center: [centerLat, centerLng],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: false
    });
    /* Leaflet's own teardown removes its panes, controls and listeners —
       all but the container 'scroll' hook map.remove() forgets (Leaflet
       1.9.4), which is dropped through its public DomEvent API. */
    u.undo(function () {
      try { map.remove(); } catch (_) {}
      try { if (L.DomEvent && map._onScroll) L.DomEvent.off(canvas, 'scroll', map._onScroll, map); } catch (_) {}
    });
    /* ctrl+wheel to zoom (avoids hijacking page scroll) */
    u.on(canvas, 'wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) map.zoomIn(); else map.zoomOut();
      }
    }, { passive: false });
    L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap', subdomains: 'abcd', maxZoom: 20 }).addTo(map);

    var icon = L.divIcon({ className: 'flwr_map_marker', iconSize: [20, 20], iconAnchor: [10, 10] });
    var activeMarker = null;
    function reset() {
      if (activeMarker && activeMarker._icon) activeMarker._icon.classList.remove('is-active');
      activeMarker = null;
      if (actionBtn) actionBtn.style.display = 'none';
      if (locations.length > 1) {
        map.fitBounds(L.latLngBounds(locations.map(function (l) { return [l.lat, l.lng]; })), { padding: [50, 50] });
      }
    }
    function select(marker, loc) {
      if (activeMarker && activeMarker !== marker && activeMarker._icon) activeMarker._icon.classList.remove('is-active');
      activeMarker = marker;
      if (marker._icon) marker._icon.classList.add('is-active');
      if (actionBtn && loc.url) {
        actionBtn.setAttribute('href', loc.url);
        actionBtn.style.display = 'inline-block';
      }
      map.setView([loc.lat, loc.lng], 16, { animate: true, duration: 0.6 });
    }
    locations.forEach(function (loc) {
      var m = L.marker([loc.lat, loc.lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="flwr_map_popup_title">' + loc.name + '</div>' +
        '<div class="flwr_map_popup_address">' + loc.address + '</div>',
        { closeButton: true, maxWidth: 280, offset: [0, -10] }
      );
      m.on('click', function () { select(m, loc); m.openPopup(); });
      m.on('mouseover', function () { if (activeMarker !== m) m.openPopup(); });
      m.on('mouseout',  function () { if (activeMarker !== m) m.closePopup(); });
    });
    map.on('popupclose', function (e) { if (activeMarker && e.popup._source === activeMarker) reset(); });
    map.on('click', function (e) {
      if (e.originalEvent.target.classList.contains('leaflet-container') ||
          e.originalEvent.target.classList.contains('leaflet-tile')) reset();
    });
    if (locations.length > 1) {
      map.fitBounds(L.latLngBounds(locations.map(function (l) { return [l.lat, l.lng]; })), { padding: [50, 50] });
    } else {
      map.setView([locations[0].lat, locations[0].lng], 14);
    }
    u.timeout(function () { map.invalidateSize(); }, 250);
  }

  function initMaps(scope) {
    if (typeof window.L === 'undefined') return;
    var wraps = (scope || document).querySelectorAll('[data-flwr="map"]');
    [].forEach.call(wraps, initMap);
  }

  /* -- scrubber --------------------------------------------------------- */
  /* Hover X position → image-sequence frame, with cross-fade between
     adjacent frames. Touch supported. Adapted from Alttura's tod-scrubber. */

  function initScrubber(root) {
    var c = begin('scrubber');
    if (c.owned.has(root)) return;
    var u = unit(c, root);
    var layers = [].slice.call(root.querySelectorAll('.flwr_scrubber_layer'));
    if (!layers.length) return;
    layers.forEach(function (l, i) { u.style(l, 'opacity', i === 0 ? '1' : '0'); });

    function setFrame(progress) {
      var idx = progress * (layers.length - 1);
      var lo = Math.floor(idx);
      var hi = Math.min(layers.length - 1, Math.ceil(idx));
      var t = idx - lo;
      layers.forEach(function (el, i) {
        if (i === lo) el.style.opacity = (1 - t).toString();
        else if (i === hi) el.style.opacity = t.toString();
        else el.style.opacity = '0';
      });
    }
    function move(e) {
      var rect = root.getBoundingClientRect();
      var clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) || 0;
      var p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setFrame(p);
    }
    u.on(root, 'mousemove', move);
    u.on(root, 'mouseenter', move);
    u.on(root, 'touchstart', move, { passive: true });
    u.on(root, 'touchmove', move, { passive: true });
    u.on(root, 'mouseleave', function () { setFrame(0); });
    setFrame(0);
  }

  function initScrubbers(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="scrubber"]');
    [].forEach.call(wraps, initScrubber);
  }

  /* -- tabs (incl. vertical + title-swap) ------------------------------ */
  /* Pure-vanilla tab controller. Reads aria-selected / aria-controls, clicks
     update [aria-selected] + .is-active on triggers and panels. Optional
     title-swap mode animates a heading element via --_tabs-swap---progress. */

  function initTabs(scope) {
    var c = begin('tabs');
    var wraps = (scope || document).querySelectorAll('[data-flwr="tabs"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);
      var triggers = wrap.querySelectorAll('.flwr_tabs_trigger');
      var panels   = wrap.querySelectorAll('.flwr_tabs_panel');
      var swapTitle = wrap.querySelector('.flwr_tabs_swap_title');
      var swapInner = swapTitle && swapTitle.querySelector('.flwr_tabs_swap_title_inner');

      function activate(idx, opts) {
        opts = opts || {};
        [].forEach.call(triggers, function (t, i) {
          var on = i === idx;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.classList.toggle('is-active', on);
        });
        [].forEach.call(panels, function (p, i) {
          var on = i === idx;
          p.classList.toggle('is-active', on);
          p.hidden = !on;
        });
        if (swapTitle && swapInner && triggers[idx] && !opts.skipSwap) {
          /* Animate: slide current title out, swap content, slide new in */
          swapTitle.classList.add('is-entering');
          u.raf(function () {
            swapInner.textContent = triggers[idx].dataset.flwrTabsTitle ||
              triggers[idx].textContent.trim();
            u.raf(function () {
              swapTitle.classList.remove('is-entering');
            });
          });
        }
      }

      [].forEach.call(triggers, function (t, i) {
        u.on(t, 'click', function () { activate(i); });
        u.on(t, 'keydown', function (e) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); triggers[(i + 1) % triggers.length].focus(); }
          if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); triggers[(i - 1 + triggers.length) % triggers.length].focus(); }
        });
      });

      /* Find initial active trigger or default to 0 */
      var initial = 0;
      [].forEach.call(triggers, function (t, i) {
        if (t.getAttribute('aria-selected') === 'true' || t.classList.contains('is-active')) initial = i;
      });
      activate(initial, { skipSwap: true });
      if (swapTitle && swapInner && triggers[initial]) {
        swapInner.textContent = triggers[initial].dataset.flwrTabsTitle ||
          triggers[initial].textContent.trim();
      }
      if (swapTitle) u.undo(function () { swapTitle.classList.remove('is-entering'); });

      /* Expose .activate(idx) for programmatic control */
      wrap.__flwrActivate = activate;
      u.undo(function () { delete wrap.__flwrActivate; });
    });
  }

  /* -- document search (TreeWalker highlight) -------------------------- */
  /* Marks all text matches inside [data-flwr-search-target] as
     <mark class="flwr_search_highlight">. Prev/Next cycle through matches.
     Optional per-tab match counters via [data-flwr-search-tab-counter]. */

  function initSearch(scope) {
    var c = begin('search');
    var wraps = (scope || document).querySelectorAll('[data-flwr="search"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);
      var input    = wrap.querySelector('.flwr_search_input');
      var clearBtn = wrap.querySelector('.flwr_search_clear_btn');
      var prevBtn  = wrap.querySelector('.flwr_search_nav_btn[data-flwr-target="prev"]');
      var nextBtn  = wrap.querySelector('.flwr_search_nav_btn[data-flwr-target="next"]');
      var counter  = wrap.querySelector('.flwr_search_match_counter');
      var nav      = wrap.querySelector('.flwr_search_navigation');
      var targetSel = wrap.getAttribute('data-flwr-search-target');
      var target   = targetSel ? document.querySelector(targetSel) : document.body;
      if (!input || !target) return;

      var currentIdx = -1;
      var marks = [];

      function clearMarks() {
        [].forEach.call(target.querySelectorAll('.flwr_search_highlight'), function (m) {
          var p = m.parentNode;
          while (m.firstChild) p.insertBefore(m.firstChild, m);
          p.removeChild(m);
          p.normalize();
        });
        marks = [];
        currentIdx = -1;
      }

      function highlightAll(term) {
        clearMarks();
        if (!term) return;
        var lower = term.toLowerCase();
        var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;
            var p = node.parentNode;
            if (!p || p.closest && p.closest('.flwr_search_bar, script, style, .flwr_search_highlight')) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.toLowerCase().indexOf(lower) >= 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        });
        var nodes = [];
        var n; while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(function (node) {
          var text = node.nodeValue;
          var lt = text.toLowerCase();
          var i = 0, last = 0;
          var frag = document.createDocumentFragment();
          while ((i = lt.indexOf(lower, last)) !== -1) {
            if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
            var mark = document.createElement('mark');
            mark.className = 'flwr_search_highlight';
            mark.textContent = text.slice(i, i + lower.length);
            frag.appendChild(mark);
            marks.push(mark);
            last = i + lower.length;
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          node.parentNode.replaceChild(frag, node);
        });
      }

      function updateCounter() {
        if (counter) {
          counter.textContent = marks.length === 0
            ? '0'
            : (currentIdx + 1) + ' / ' + marks.length;
        }
        if (nav) nav.classList.toggle('is-active', input.value.length > 0);
      }
      function setCurrent(i) {
        if (!marks.length) { currentIdx = -1; updateCounter(); return; }
        marks.forEach(function (m) { m.classList.remove('is-current'); });
        currentIdx = ((i % marks.length) + marks.length) % marks.length;
        var cur = marks[currentIdx];
        cur.classList.add('is-current');
        cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
        updateCounter();
      }
      function search() {
        var q = input.value.trim();
        highlightAll(q);
        if (marks.length) setCurrent(0); else updateCounter();
      }

      u.on(input, 'input', search);
      if (clearBtn) u.on(clearBtn, 'click', function () { input.value = ''; search(); input.focus(); });
      if (prevBtn) u.on(prevBtn, 'click', function () { setCurrent(currentIdx - 1); });
      if (nextBtn) u.on(nextBtn, 'click', function () { setCurrent(currentIdx + 1); });
      u.on(input, 'keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          setCurrent(currentIdx + (e.shiftKey ? -1 : 1));
        }
      });
      /* destroy(): highlights out, counter and nav state back. */
      if (counter) u.snap(counter, 'text');
      if (nav) u.snap(nav, 'class:is-active');
      u.undo(clearMarks);
      updateCounter();
    });
  }

  /* -- swiper thumbnails (extends existing initSwipers) ---------------- */
  /* Re-uses Swiper.thumbs API. If [data-flwr-swiper-thumbs="true"] is set
     on the wrap, the runtime hydrates a SECOND Swiper for the thumbs
     track and wires .thumbs.swiper between main and thumbs. */

  function initSwiperThumbs(scope) {
    if (typeof window.Swiper === 'undefined') return;
    var c = begin('swiperThumbs');
    var wraps = (scope || document).querySelectorAll('[data-flwr="swiper"][data-flwr-swiper-thumbs="true"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);
      var thumbsWrap = wrap.querySelector('[data-flwr-target="thumbs"]');
      if (!thumbsWrap) return;
      u.cls(thumbsWrap, 'swiper', true);
      var thumbsTrack = thumbsWrap.querySelector('.flwr_swiper_thumbs_track');
      if (thumbsTrack) u.cls(thumbsTrack, 'swiper-wrapper', true);
      [].forEach.call(thumbsWrap.querySelectorAll('.flwr_swiper_thumb'), function (t) {
        u.cls(t, 'swiper-slide', true);
      });
      var thumbsSw = new window.Swiper(thumbsWrap, {
        slidesPerView: 'auto',
        spaceBetween: 8,
        watchSlidesProgress: true,
        slideToClickedSlide: true
      });
      u.undo(function () { try { if (!thumbsSw.destroyed) thumbsSw.destroy(true, true); } catch (_) {} });
      /* Store on wrap so the main initSwipers can pick it up — but we
         actually need to inject thumbs config BEFORE main Swiper init.
         Easier: re-init the main with thumbs config now. */
      var mainEl = wrap.querySelector('.flwr_swiper_wrap.swiper');
      if (mainEl && mainEl.swiper) {
        /* Swiper instance already created — use thumbs.swiper setter via params */
        try {
          mainEl.swiper.thumbs = mainEl.swiper.thumbs || {};
          mainEl.swiper.thumbs.swiper = thumbsSw;
          mainEl.swiper.thumbs.init && mainEl.swiper.thumbs.init();
          mainEl.swiper.thumbs.update && mainEl.swiper.thumbs.update(true);
        } catch (_) {}
      }
    });
  }

  /* -- full-screen menu ------------------------------------------------- */
  /* Wraps native <dialog> with showModal()/close() + scroll lock. */

  function initFullscreenMenu(scope) {
    var c = begin('fullscreenMenu');
    var menus = (scope || document).querySelectorAll('[data-flwr="fullscreen-menu"]');
    [].forEach.call(menus, function (menu) {
      if (c.owned.has(menu)) return;
      var u = unit(c, menu);
      /* Buttons elsewhere on the page can open this menu via
         [data-flwr-target="fullscreen-menu-trigger"][data-flwr-menu-id="<id>"] */
      var id = menu.id;
      if (id) {
        var triggers = document.querySelectorAll('[data-flwr-target="fullscreen-menu-trigger"][data-flwr-menu-id="' + id + '"]');
        [].forEach.call(triggers, function (t) {
          u.on(t, 'click', function () {
            try { menu.showModal(); document.body.style.overflow = 'hidden'; } catch (_) {}
          });
        });
      }
      /* Close buttons inside */
      [].forEach.call(menu.querySelectorAll('[data-flwr-target="close"]'), function (cl) {
        u.on(cl, 'click', function () { menu.close(); document.body.style.overflow = ''; });
      });
      /* Click on backdrop / media slot closes too */
      u.on(menu, 'click', function (e) {
        if (e.target === menu) { menu.close(); document.body.style.overflow = ''; }
      });
      u.on(menu, 'close', function () { document.body.style.overflow = ''; });
    });
  }

  /* -- toggle switches (position + bulb variants) ---------------------- */
  /* Click any .flwr_toggle_wrap.is-position or .is-bulb to flip its state.
     Optional [data-flwr-toggle-href] for navigation after toggle. */

  function initToggles(scope) {
    var c = begin('toggle');
    var wraps = (scope || document).querySelectorAll('.flwr_toggle_wrap.is-position, .flwr_toggle_wrap.is-bulb');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);
      /* Keyboard/ARIA shim — only for wraps that are not a native control
         and do not wrap a real <input>. Native <button> wraps (styleguide
         is-bulb) and <label><input></label> wraps are left untouched. */
      var innerInput = wrap.querySelector('input');
      var shim = !isNativeControl(wrap) && !innerInput;
      if (shim) {
        if (!wrap.hasAttribute('role')) u.attr(wrap, 'role', 'switch');
        ensureFocusable(wrap, u);
      }
      function isOn() {
        if (wrap.classList.contains('is-position')) {
          return (wrap.getAttribute('data-position') || 'left') === 'right';
        }
        return (wrap.getAttribute('data-flwr-state') || '').indexOf('checked') >= 0;
      }
      /* aria-checked is only valid on switch/checkbox roles — sync it there
         (always true for shimmed wraps, opt-in via role= for native ones). */
      function syncAria() {
        var role = wrap.getAttribute('role');
        if (role !== 'switch' && role !== 'checkbox') return;
        u.attr(wrap, 'aria-checked', isOn() ? 'true' : 'false');
      }
      function activate() {
        if (wrap.classList.contains('is-position')) {
          var pos = wrap.getAttribute('data-position') || 'left';
          var newPos = pos === 'left' ? 'right' : 'left';
          wrap.setAttribute('data-position', newPos);
        } else {
          var s = wrap.getAttribute('data-flwr-state') || '';
          var on = s.indexOf('checked') >= 0;
          wrap.setAttribute('data-flwr-state', on ? '' : 'checked');
        }
        syncAria();
        var href = wrap.getAttribute('data-flwr-toggle-href');
        if (href) setTimeout(function () { window.location.href = href; }, 300);
      }
      u.on(wrap, 'click', activate);
      if (shim) {
        u.on(wrap, 'keydown', function (e) {
          if (!isActivateKey(e) || isNativeControl(e.target)) return;
          if (e.key !== 'Enter') e.preventDefault(); /* Space would scroll */
          activate();
        });
      }
      syncAria();
    });
  }

  /* -- card overlay (click trigger) ------------------------------------ */
  /* For .flwr_card_overlay_wrap.is-trigger-click — clicking the corner
     toggles [data-flwr-state="open"] on the wrap. Hover trigger is CSS-only. */

  function initCardOverlays(scope) {
    var c = begin('cardOverlay');
    var corners = (scope || document).querySelectorAll('.flwr_card_overlay_wrap.is-trigger-click .flwr_card_overlay_corner');
    [].forEach.call(corners, function (corner) {
      if (c.owned.has(corner)) return;
      var u = unit(c, corner);
      function toggle() {
        var wrap = corner.closest('.flwr_card_overlay_wrap');
        if (!wrap) return;
        var s = wrap.getAttribute('data-flwr-state') || '';
        wrap.setAttribute('data-flwr-state', s.indexOf('open') >= 0 ? '' : 'open');
      }
      u.on(corner, 'click', function (e) {
        e.stopPropagation();
        toggle();
      });
      /* Keyboard shim for non-native corners (a <button> corner already
         turns Enter/Space into the click above). */
      if (!isNativeControl(corner)) {
        ensureFocusable(corner, u);
        u.on(corner, 'keydown', function (e) {
          if (!isActivateKey(e) || isNativeControl(e.target)) return;
          e.preventDefault();
          toggle();
        });
      }
    });
    /* Click outside closes any open card-overlay click-triggered cards.
       One document listener for the page, however often init() runs. */
    if (!c.owned.has(document)) {
      unit(c, document).on(document, 'click', function (e) {
        var openCards = document.querySelectorAll('.flwr_card_overlay_wrap.is-trigger-click[data-flwr-state~="open"]');
        [].forEach.call(openCards, function (card) {
          if (!card.contains(e.target)) card.setAttribute('data-flwr-state', '');
        });
      });
    }
  }

  /* -- navbar (dropdowns, mobile menu, scroll detect) ------------------ */

  function initNavbars(scope) {
    var c = begin('navbar');
    var wraps = (scope || document).querySelectorAll('[data-flwr="navbar"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);

      /* Dropdowns. Click toggles by default (keyboard + touch friendly). With
         data-flwr-navbar-trigger="hover" they also open on hover and focus, with a
         short close delay that bridges the gap between trigger and menu. */
      var hoverMode = wrap.getAttribute('data-flwr-navbar-trigger') === 'hover';
      var ddCloseTimer;
      var ddReturningFocus = false; /* Escape hands focus back to the trigger; that focusin must not reopen */
      var dropdowns = wrap.querySelectorAll('.flwr_navbar_dropdown');
      var ddTriggers = []; /* parallel to dropdowns; null when no trigger */
      /* Single open/close path shared by click + Escape. */
      function setDropdown(dd, trigger, willOpen) {
        /* Close siblings */
        [].forEach.call(dropdowns, function (other) { if (other !== dd) other.setAttribute('data-flwr-state', ''); });
        dd.setAttribute('data-flwr-state', willOpen ? 'open' : '');
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      }
      [].forEach.call(dropdowns, function (dd, i) {
        var trigger = dd.querySelector('.flwr_navbar_dropdown_trigger');
        ddTriggers[i] = trigger || null;
        if (!trigger) return;
        /* Hover mode: the pointer already opened the menu on its way to the trigger,
           so a mouse click there must not toggle it shut under the cursor. Keyboard
           (no pointerdown) and touch clicks still toggle. */
        var lastPointer = '';
        if (hoverMode) u.on(trigger, 'pointerdown', function (e) { lastPointer = e.pointerType || ''; });
        u.on(trigger, 'click', function (e) {
          e.stopPropagation();
          var s = dd.getAttribute('data-flwr-state') || '';
          var isOpen = s.indexOf('open') >= 0;
          var byMouse = lastPointer === 'mouse';
          lastPointer = '';
          if (hoverMode && byMouse && isOpen) return;
          setDropdown(dd, trigger, !isOpen);
        });
        if (hoverMode) {
          /* the close timer is shared by every dropdown in this navbar */
          var enter = function () { u.clearTimeout(ddCloseTimer); setDropdown(dd, trigger, true); };
          var leave = function () {
            u.clearTimeout(ddCloseTimer);
            ddCloseTimer = u.timeout(function () { setDropdown(dd, trigger, false); }, 180);
          };
          u.on(dd, 'mouseenter', enter);
          u.on(dd, 'mouseleave', leave);
          u.on(dd, 'focusin', function () { if (!ddReturningFocus) enter(); });
          u.on(dd, 'focusout', function (e) { if (!dd.contains(e.relatedTarget)) setDropdown(dd, trigger, false); });
        }
      });
      u.on(document, 'click', function (e) {
        if (!wrap.contains(e.target)) {
          [].forEach.call(dropdowns, function (dd) { dd.setAttribute('data-flwr-state', ''); });
        }
      });

      /* Mobile hamburger */
      var ham = wrap.querySelector('.flwr_navbar_hamburger');
      /* Single open/close path shared by click + Escape. */
      function setMenu(open) {
        wrap.setAttribute('data-flwr-state', open ? 'menu-open' : '');
        if (ham) ham.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (ham) {
        u.on(ham, 'click', function () {
          var s = wrap.getAttribute('data-flwr-state') || '';
          setMenu(s.indexOf('menu-open') < 0);
        });
      }

      /* Escape: close an open dropdown (focus → its trigger), else close the
         mobile menu (focus → hamburger). Document-level so it works wherever
         focus sits; no-op unless THIS navbar has something open. */
      u.on(document, 'keydown', function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        for (var i = 0; i < dropdowns.length; i++) {
          var dd = dropdowns[i];
          if (ddTriggers[i] && (dd.getAttribute('data-flwr-state') || '').indexOf('open') >= 0) {
            setDropdown(dd, ddTriggers[i], false);
            ddReturningFocus = true;
            ddTriggers[i].focus();
            ddReturningFocus = false;
            return;
          }
        }
        if (ham && (wrap.getAttribute('data-flwr-state') || '').indexOf('menu-open') >= 0) {
          setMenu(false);
          ham.focus();
        }
      });

      /* Close mobile menu on link click */
      [].forEach.call(wrap.querySelectorAll('.flwr_navbar_mobile_link'), function (a) {
        u.on(a, 'click', function () { wrap.setAttribute('data-flwr-state', ''); });
      });

      /* Banner close */
      [].forEach.call(wrap.querySelectorAll('.flwr_navbar_banner_close'), function (b) {
        u.on(b, 'click', function () {
          var banner = b.closest('.flwr_navbar_banner');
          if (banner) banner.style.display = 'none';
        });
      });

      /* Scroll detection — adds .is-scrolled past 16px */
      /* v1.1: rAF-throttled — at most one class-write per frame (standard
         ticking pattern), avoids layout thrash on high-frequency scroll. */
      var navScrollTicking = false;
      /* data-flwr-navbar-scroll="auto-hide": also toggle .is-hidden — hide while
         scrolling down past 16px, show while scrolling up, always show at the top.
         The matching CSS lives in components.css (auto-hide block). */
      var navAutoHide = wrap.getAttribute('data-flwr-navbar-scroll') === 'auto-hide';
      var navLastY = window.scrollY || 0;
      if (navAutoHide) u.snap(wrap, 'class:is-hidden');
      function applyScrollState() {
        navScrollTicking = false;
        var y = window.scrollY || 0;
        wrap.classList.toggle('is-scrolled', y > 16);
        if (navAutoHide) {
          if (y <= 16) wrap.classList.remove('is-hidden');
          else if (y > navLastY + 4) wrap.classList.add('is-hidden');
          else if (y < navLastY - 4) wrap.classList.remove('is-hidden');
        }
        navLastY = y;
      }
      function onScroll() {
        if (navScrollTicking) return;
        navScrollTicking = true;
        u.raf(applyScrollState);
      }
      u.on(window, 'scroll', onScroll, { passive: true });
      u.snap(wrap, 'class:is-scrolled');
      applyScrollState();
    });
  }

  /* -- collapse (height-auto accordion) -------------------------------- */
  /* Toggle .is-open on a [data-flwr="collapse"] when its trigger is
     clicked. Trigger is either:
       - a [data-flwr-target="trigger"] inside the same logical group, OR
       - any element with [data-flwr-collapse-target="<id>"] pointing at
         a [data-flwr-collapse-id="<id>"] wrap (decoupled trigger pattern). */
  function initCollapse(scope) {
    var root = scope || document;
    var c = begin('collapse');
    var TRIGGER_SEL = '[data-flwr-target="trigger"], [data-flwr-collapse-target]';
    function resolveCollapseWrap(t) {
      var explicitId = t.getAttribute('data-flwr-collapse-target');
      return explicitId
        ? document.querySelector('[data-flwr-collapse-id="' + explicitId + '"]')
        : t.closest('[data-flwr="collapse"]');
    }
    /* Shared toggle for click + keyboard. Returns true when t drove a wrap. */
    function toggleCollapse(t) {
      var wrap = resolveCollapseWrap(t);
      if (!wrap) return false;
      wrap.classList.toggle('is-open');
      t.setAttribute('aria-expanded', wrap.classList.contains('is-open') ? 'true' : 'false');
      return true;
    }
    /* One unit per scope: delegated listeners bind once, the trigger scan
       below runs on every call so late triggers get their tab stop. */
    var du = delegatedUnit(c, root);
    var bound = du.bound, u = du.unit;
    /* Keyboard: give non-native triggers a tab stop. Only triggers that
       resolve to a collapse wrap are touched — data-flwr-target="trigger"
       is also the anchor hook for dropdown/tooltip/popover (runtime.css). */
    var triggers = root.querySelectorAll(TRIGGER_SEL);
    for (var i = 0; i < triggers.length; i++) {
      if (resolveCollapseWrap(triggers[i])) ensureFocusable(triggers[i], u);
    }
    if (bound) return;
    u.on(root, 'click', function (e) {
      var t = e.target.closest && e.target.closest(TRIGGER_SEL);
      if (!t) return;
      toggleCollapse(t);
    });
    u.on(root, 'keydown', function (e) {
      if (!isActivateKey(e) || isNativeControl(e.target)) return;
      var t = e.target.closest && e.target.closest(TRIGGER_SEL);
      if (!t) return;
      if (toggleCollapse(t)) e.preventDefault();
    });
  }

  /* -- hide-if-empty ---------------------------------------------------- */
  /* Tags any [data-flwr="hide-when-empty"] wrap with .is-empty when it has
     no visible (non-w-condition-invisible) children. Pure runtime
     replacement for the :has() / :not(:has(...)) pattern that needs embed. */
  function checkEmpty(el) {
    var hasVisible = false;
    [].some.call(el.children, function (c) {
      if (c.classList && c.classList.contains('w-condition-invisible')) return false;
      if (c.classList && c.classList.contains('u-cover-absolute')) return false;
      hasVisible = true;
      return true;
    });
    el.classList.toggle('is-empty', !hasVisible);
  }
  function initHideIfEmpty(scope) {
    var c = begin('hideIfEmpty');
    var els = (scope || document).querySelectorAll('[data-flwr="hide-when-empty"], .f-hide-when-empty');
    [].forEach.call(els, function (el) {
      if (c.owned.has(el)) return;
      var u = unit(c, el);
      u.snap(el, 'class:is-empty');
      checkEmpty(el);
      var mo = u.observe(new MutationObserver(function () { checkEmpty(el); }));
      mo.observe(el, { childList: true, subtree: true });
    });
  }

  /* -- disabled wrap ---------------------------------------------------- */
  /* Replaces [data-button]:has(button:disabled). Tags wraps with .is-disabled
     when any descendant has [disabled]. */
  function checkDisabled(el) {
    var disabled = !!el.querySelector(':disabled, [aria-disabled="true"]');
    el.classList.toggle('is-disabled', disabled);
  }
  function initDisabledWraps(scope) {
    var c = begin('disabledWrap');
    var els = (scope || document).querySelectorAll('[data-flwr="disabled-wrap"]');
    [].forEach.call(els, function (el) {
      if (c.owned.has(el)) return;
      var u = unit(c, el);
      u.snap(el, 'class:is-disabled');
      checkDisabled(el);
      var mo = u.observe(new MutationObserver(function () { checkDisabled(el); }));
      mo.observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ['disabled', 'aria-disabled'] });
    });
  }

  /* -- play/pause toggle ------------------------------------------------ */
  /* [data-flwr="player-toggle"] with [aria-pressed] gets .is-playing
     synced. Pair icons with .flwr_player_play / .flwr_player_pause and
     hide via :is or class selector — both are styleLess-compatible. */
  function initPlayerToggles(scope) {
    var c = begin('playerToggle');
    var btns = (scope || document).querySelectorAll('[data-flwr="player-toggle"]');
    [].forEach.call(btns, function (b) {
      if (c.owned.has(b)) return;
      var u = unit(c, b);
      function sync() {
        b.classList.toggle('is-playing', b.getAttribute('aria-pressed') === 'true');
      }
      u.snap(b, 'class:is-playing');
      sync();
      u.on(b, 'click', function () {
        var on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        sync();
      });
    });
  }

  /* -- empty-select dim ------------------------------------------------- */
  /* Replaces select:has(option[value=""]:checked). Tags select with
     .is-empty-select when its current value is empty. */
  function initEmptySelects(scope) {
    var c = begin('emptySelect');
    var sels = (scope || document).querySelectorAll('select[data-flwr="empty-dim"], select.f-select-dim');
    [].forEach.call(sels, function (sel) {
      if (c.owned.has(sel)) return;
      var u = unit(c, sel);
      function sync() { sel.classList.toggle('is-empty-select', !sel.value); }
      u.snap(sel, 'class:is-empty-select');
      sync();
      u.on(sel, 'change', sync);
    });
  }

  /* -- list filter ------------------------------------------------------- */
  /* Attribute-driven CMS-list filter engine. Gate: [data-flwr="list"].
   *
   * Wrapper attrs:
   *   data-flwr="list"
   *   data-flwr-list-fieldmatch="and|or"       (default "and")  — multi-value field combine
   *   data-flwr-list-conditionsmatch="and|or"  (default "and")  — cross-field combine
   *   data-flwr-list-accent="strip|preserve"   (default "strip")— accent-insensitive search
   *   data-flwr-list-fuzzy="0"                 (default 0, off) — Levenshtein threshold 0–100
   *   data-flwr-list-debounce="150"            (default 150 ms) — text input debounce
   *
   * Items: [data-flwr-list-item] descendants, else direct children.
   * Field resolution per item (getFieldValue(item, field)):
   *   1. item.dataset[camelize(field)]  — comma-separated string for multi-value
   *   2. item.querySelector('[data-flwr-list-field="field"]').textContent
   *
   * Filter inputs (link to list via data-flwr-list-list="#id" or nearest ancestor):
   *   <input type="search|text" data-flwr-list-field="f1,f2">
   *   <input type="radio"       data-flwr-list-field="cat"   data-flwr-list-value="v">
   *   <input type="checkbox"    data-flwr-list-field="tags"  data-flwr-list-value="v">
   *   <select                   data-flwr-list-field="field">
   *
   * UI hooks inside the list wrapper:
   *   [data-flwr-target="results-count"]  — live "12 / 53"
   *   [data-flwr-target="items-count"]    — total count
   *   [data-flwr-target="empty"]          — shown when 0 visible
   *   [data-flwr-target="tags"]           — chip render container
   *   <template data-flwr-target="tag-template"> — chip template
   *   [data-flwr-target="clear"]          — reset all filters (inside wrap OR with data-flwr-list-list)
   *
   * Public: wrap.__flwrList = { state, apply, clear, getMatches }
   * Event:  "flwr:list:filtered" on wrap   detail: { visible, total, state }
   */

  function listNormalize(s) {
    return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  function listCamelize(s) {
    return String(s || '').replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }
  function listGetFieldValue(item, fieldName) {
    var camel = listCamelize(fieldName);
    if (item.dataset && item.dataset[camel] != null && item.dataset[camel] !== '') {
      return item.dataset[camel];
    }
    var el = item.querySelector('[data-flwr-list-field="' + fieldName + '"]');
    return el ? el.textContent.trim() : '';
  }
  function listFuzzyScore(needle, word) {
    /* Levenshtein distance normalized to 0–100 similarity. ~25 lines. */
    if (!needle || !word) return needle === word ? 100 : 0;
    var n = needle.length, m = word.length;
    var row = [];
    for (var j = 0; j <= m; j++) row[j] = j;
    for (var i = 1; i <= n; i++) {
      var prev = i;
      for (var k = 1; k <= m; k++) {
        var cost = needle[i - 1] === word[k - 1] ? 0 : 1;
        var next = Math.min(row[k] + 1, prev + 1, row[k - 1] + cost);
        row[k - 1] = prev; prev = next;
      }
      row[m] = prev;
    }
    return Math.round((1 - row[m] / Math.max(n, m)) * 100);
  }
  function listResolveWrap(input) {
    var sel = input.getAttribute('data-flwr-list-list');
    if (sel) {
      var found = document.querySelector(sel);
      if (found && found.getAttribute('data-flwr') === 'list') return found;
      console.warn('[flwr list] target not found:', sel); return null;
    }
    var anc = input.closest && input.closest('[data-flwr="list"]');
    if (anc) return anc;
    var all = document.querySelectorAll('[data-flwr="list"]');
    if (all.length === 1) return all[0];
    console.warn('[flwr list] cannot resolve list for', input); return null;
  }

  function initList(scope) {
    var c = begin('list');
    var wraps = (scope || document).querySelectorAll('[data-flwr="list"]');
    [].forEach.call(wraps, function (wrap) {
      if (c.owned.has(wrap)) return;
      var u = unit(c, wrap);

      var fieldMatch  = attr(wrap, 'data-flwr-list-fieldmatch',     'and');
      var condMatch   = attr(wrap, 'data-flwr-list-conditionsmatch','and');
      var stripAccent = attr(wrap, 'data-flwr-list-accent', 'strip') !== 'preserve';
      var fuzzyThr    = parseInt(attr(wrap, 'data-flwr-list-fuzzy',    '0'),   10) || 0;
      var debounceMs  = parseInt(attr(wrap, 'data-flwr-list-debounce', '150'), 10);
      if (isNaN(debounceMs)) debounceMs = 150;
      /* Chip copy — overridable per list; defaults keep existing markup as-is */
      var searchLabel = attr(wrap, 'data-flwr-list-search-label', 'Búsqueda');
      var removeLabel = attr(wrap, 'data-flwr-list-remove-label', 'Remove filter');

      /* State keys: '__text__<fieldAttr>' for text inputs; '<fieldAttr>' for radio/checkbox/select */
      var state = {};

      function norm(s) { return stripAccent ? listNormalize(s) : String(s || '').toLowerCase(); }

      function getItems() {
        var items = wrap.querySelectorAll('[data-flwr-list-item]');
        if (items.length) return [].slice.call(items);
        /* Fallback: direct children, excluding structural UI elements */
        return [].slice.call(wrap.children).filter(function (ch) {
          return ch.tagName !== 'TEMPLATE' && !ch.hasAttribute('data-flwr-target');
        });
      }

      function matchToken(token, haystack) {
        if (haystack.indexOf(token) >= 0) return true;
        if (fuzzyThr <= 0) return false;
        var words = haystack.split(/\s+/);
        for (var i = 0; i < words.length; i++) {
          if (listFuzzyScore(token, words[i]) >= fuzzyThr) return true;
        }
        return false;
      }

      function itemMatchesCond(item, key, cond) {
        if (cond.type === 'text') {
          var hay = norm(cond.searchFields.map(function (f) {
            return listGetFieldValue(item, f);
          }).join(' '));
          for (var t = 0; t < cond.values.length; t++) {
            if (!matchToken(norm(cond.values[t]), hay)) return false;
          }
          return true;
        }
        /* radio / select / checkbox — key IS the fieldName */
        var rawVal = listGetFieldValue(item, key);
        var vals = rawVal.split(',').map(function (v) { return norm(v.trim()); }).filter(Boolean);
        if (cond.type === 'radio' || cond.type === 'select') {
          return vals.indexOf(norm(cond.values[0])) >= 0;
        }
        if (cond.type === 'checkbox') {
          if (fieldMatch === 'or') {
            for (var ci = 0; ci < cond.values.length; ci++) {
              if (vals.indexOf(norm(cond.values[ci])) >= 0) return true;
            }
            return false;
          }
          for (var ca = 0; ca < cond.values.length; ca++) {
            if (vals.indexOf(norm(cond.values[ca])) < 0) return false;
          }
          return true;
        }
        return true;
      }

      function itemMatchesAll(item) {
        var keys = Object.keys(state);
        var active = keys.filter(function (k) { return state[k].values.length > 0; });
        if (!active.length) return true;
        if (condMatch === 'or') {
          for (var i = 0; i < active.length; i++) {
            if (itemMatchesCond(item, active[i], state[active[i]])) return true;
          }
          return false;
        }
        /* and (default) */
        for (var j = 0; j < active.length; j++) {
          if (!itemMatchesCond(item, active[j], state[active[j]])) return false;
        }
        return true;
      }

      /* When data-flwr-list-hidden-class is set on the wrap, non-matching items
         get that class toggled instead of display:none. Lets CSS handle the
         visual treatment (e.g. dimming via opacity) while preserving grid
         positions — critical for periodic-table or explicit-grid layouts. */
      var hiddenClass = wrap.getAttribute('data-flwr-list-hidden-class') || '';

      /* Resolve a data-flwr-target element: look inside wrap first, then
         look for an external element with a matching data-flwr-list-list attr. */
      function resolveTarget(role) {
        var inner = wrap.querySelector('[data-flwr-target="' + role + '"]');
        if (inner) return inner;
        if (wrap.id) {
          return document.querySelector('[data-flwr-target="' + role + '"][data-flwr-list-list="#' + wrap.id + '"]');
        }
        return null;
      }

      function apply() {
        var items = getItems();
        var total = items.length;
        var visible = 0;
        for (var i = 0; i < items.length; i++) {
          var m = itemMatchesAll(items[i]);
          if (hiddenClass) {
            u.cls(items[i], hiddenClass, !m);
          } else {
            u.style(items[i], 'display', m ? '' : 'none');
          }
          if (m) visible++;
        }
        var cntEl = resolveTarget('results-count');
        if (cntEl) u.text(cntEl, visible + ' / ' + total);
        var totEl = resolveTarget('items-count');
        if (totEl) u.text(totEl, String(total));
        var emptyEl = resolveTarget('empty');
        if (emptyEl) {
          u.snap(emptyEl, 'attr:hidden'); u.snap(emptyEl, 'style:display');
          if (visible === 0) { emptyEl.removeAttribute('hidden'); emptyEl.style.display = ''; }
          else               { emptyEl.setAttribute('hidden', ''); emptyEl.style.display = 'none'; }
        }
        renderChips();
        var ev;
        try {
          ev = new CustomEvent('flwr:list:filtered', {
            bubbles: true,
            detail: { visible: visible, total: total, state: state }
          });
        } catch (_) {
          ev = document.createEvent('CustomEvent');
          ev.initCustomEvent('flwr:list:filtered', true, false, { visible: visible, total: total, state: state });
        }
        wrap.dispatchEvent(ev);

        /* Auto-scroll to first visible item when none are in the current
           viewport — opt-in via data-flwr-list-scroll-to-first on the wrap.
           Only fires when a filter IS active (visible < total) and the first
           matching item is not already visible on screen. */
        if (wrap.getAttribute('data-flwr-list-scroll-to-first') === 'true' && visible > 0 && visible < total) {
          u.timeout(function() {
            var firstActive = null;
            var its = getItems();
            for (var si = 0; si < its.length; si++) {
              var hidden = hiddenClass
                ? its[si].classList.contains(hiddenClass)
                : its[si].style.display === 'none';
              if (!hidden) { firstActive = its[si]; break; }
            }
            if (!firstActive) return;
            var r = firstActive.getBoundingClientRect();
            /* Item is below viewport or above it — scroll so it sits just below
               the nav with a small breathing gap */
            if (r.top > window.innerHeight || r.bottom < 0) {
              var navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav--height') || '64', 10) || 64;
              var target = window.scrollY + r.top - navH - 24;
              window.scrollTo({ top: target, behavior: 'smooth' });
            }
          }, 50);
        }
      }

      function capField(s) {
        s = String(s || '').replace(/^__text__/, '');
        return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
      }

      function renderChips() {
        var tagsEl = resolveTarget('tags');
        if (!tagsEl) return;
        var tmpl = resolveTarget('tag-template') || wrap.querySelector('template[data-flwr-target="tag-template"]');
        u.snap(tagsEl, 'html');
        tagsEl.innerHTML = '';
        var keys = Object.keys(state);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i], cond = state[k];
          if (!cond.values.length) continue;
          var isText = k.indexOf('__text__') === 0;
          if (isText) {
            appendChip(tagsEl, tmpl, searchLabel, cond.values.join(' '), k, null);
          } else {
            for (var j = 0; j < cond.values.length; j++) {
              appendChip(tagsEl, tmpl, capField(k), cond.values[j], k, cond.values[j]);
            }
          }
        }
      }

      /* Chips are runtime-owned nodes that renderChips() discards on every
         pass, so their listeners are not registered — they die with the
         chip, and destroy() restores the container's original content. */
      function appendChip(container, tmpl, labelPfx, labelVal, key, value) {
        var chip;
        if (tmpl && tmpl.content) {
          chip = document.importNode(tmpl.content, true).firstElementChild;
        } else {
          chip = document.createElement('span');
          chip.className = 'flwr_chip';
          var ls = document.createElement('span');
          ls.setAttribute('data-flwr-target', 'tag-label');
          var rb = document.createElement('button');
          rb.className = 'flwr_chip_close'; rb.setAttribute('data-flwr-target', 'tag-remove');
          rb.setAttribute('aria-label', removeLabel); rb.textContent = '×';
          chip.appendChild(ls); chip.appendChild(rb);
        }
        var labelEl = chip.querySelector('[data-flwr-target="tag-label"]');
        if (labelEl) labelEl.textContent = labelPfx + ': ' + labelVal;
        var rmBtn = chip.querySelector('[data-flwr-target="tag-remove"]');
        if (rmBtn) {
          rmBtn.addEventListener('click', (function (k, v) {
            return function () { removeChip(k, v); };
          })(key, value));
        }
        container.appendChild(chip);
      }

      function removeChip(key, value) {
        var cond = state[key];
        if (!cond) return;
        var isText = key.indexOf('__text__') === 0;
        var condType = cond.type;
        if (isText || !value) {
          delete state[key];
          syncInputsClear(isText ? key.slice(8) : key, 'text', null);
        } else {
          var idx = cond.values.indexOf(value);
          if (idx >= 0) cond.values.splice(idx, 1);
          if (!cond.values.length) delete state[key];
          syncInputsClear(key, condType, value);
        }
        apply();
      }

      function syncInputsClear(fieldAttr, type, value) {
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var fa = inp.getAttribute('data-flwr-list-field') || '';
          var t  = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (type === 'text' && (t === 'search' || t === 'text') && fa === fieldAttr) {
            inp.value = '';
          } else if (type !== 'text' && fa === fieldAttr) {
            var v = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (t === 'radio' || t === 'checkbox') {
              if (!value || v === value) inp.checked = false;
            } else if (inp.tagName === 'SELECT') {
              if (!value) inp.value = '';
            }
          }
        });
      }

      function clearState() {
        var ks = Object.keys(state);
        for (var i = 0; i < ks.length; i++) delete state[ks[i]];
      }

      function clearAll() {
        clearState();
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var t = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') inp.value = '';
          else if (t === 'radio' || t === 'checkbox') inp.checked = false;
          else if (inp.tagName === 'SELECT') inp.value = '';
        });
        apply();
      }

      function readState() {
        clearState();
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var fa = inp.getAttribute('data-flwr-list-field') || '';
          var t  = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') {
            var q = inp.value.trim();
            var k = '__text__' + fa;
            if (q) state[k] = {
              type: 'text',
              searchFields: fa.split(',').map(function (f) { return f.trim(); }),
              values: q.split(/\s+/).filter(Boolean)
            };
          } else if (t === 'radio') {
            if (!inp.checked) return;
            var rv = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (rv) state[fa] = { type: 'radio', values: [rv] };
          } else if (t === 'checkbox') {
            if (!inp.checked) return;
            var cv = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (!cv) return;
            if (!state[fa]) state[fa] = { type: 'checkbox', values: [] };
            if (state[fa].values.indexOf(cv) < 0) state[fa].values.push(cv);
          } else if (inp.tagName === 'SELECT') {
            if (inp.value) state[fa] = { type: 'select', values: [inp.value] };
          }
        });
        apply();
      }

      var textTimer = 0;
      function onTextInput() { u.clearTimeout(textTimer); textTimer = u.timeout(readState, debounceMs); }

      /* Inputs and clear buttons are wired once per wrap; the unit's
         listener list is the record (no per-input flags needed). */
      function wireInputs() {
        var all = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(all, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var t = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') u.on(inp, 'input', onTextInput);
          else u.on(inp, 'change', readState);
        });
        /* Clear buttons: inside the wrap or pointing to it via data-flwr-list-list */
        var clearBtns = document.querySelectorAll('[data-flwr-target="clear"]');
        [].forEach.call(clearBtns, function (btn) {
          var w = (btn.closest && btn.closest('[data-flwr="list"]')) ||
                  (function () {
                    var s = btn.getAttribute('data-flwr-list-list');
                    return s ? document.querySelector(s) : null;
                  })();
          if (w !== wrap) return;
          u.on(btn, 'click', clearAll);
        });
      }

      wireInputs();

      wrap.__flwrList = {
        state: state,
        apply: apply,
        clear: clearAll,
        getMatches: function () {
          return getItems().filter(function (item) { return itemMatchesAll(item); });
        }
      };
      u.undo(function () { delete wrap.__flwrList; });

      apply();
    });
  }

  /* -- vertical text wrapper ------------------------------------------- */
  /* For [data-flwr="vertical-text"] children that use rotate(±90deg) —
     measures their post-rotation bounding box and reserves layout space
     so they don't break the parent flex/grid layout. Pattern from Alttura. */
  function initVerticalText(scope) {
    var c = begin('verticalText');
    var blocks = (scope || document).querySelectorAll('[data-flwr="vertical-text"]');
    [].forEach.call(blocks, function (block) {
      if (c.owned.has(block)) return;
      var u = unit(c, block);
      function reserve() {
        var rect = block.getBoundingClientRect();
        var parent = block.parentElement;
        if (!parent) return;
        if (!parent.classList.contains('flwr-vt-wrapper')) {
          var w = document.createElement('div');
          w.className = 'flwr-vt-wrapper';
          w.style.cssText = 'display:inline-block;width:0;';
          parent.insertBefore(w, block);
          w.appendChild(block);
          parent = w;
          /* destroy(): unwrap — the block goes back where the wrapper sits. */
          u.undo(function () {
            if (w.parentNode && block.parentNode === w) {
              w.parentNode.insertBefore(block, w);
              w.parentNode.removeChild(w);
            }
          });
        }
        u.style(parent, 'height', rect.height + 'px');
        u.style(parent, 'width', '0');
      }
      reserve();
      u.on(window, 'resize', reserve, { passive: true });
    });
  }

  /* -- theme-adaptive fixed element ------------------------------------
     A fixed/sticky element (FAB, floating CTA, persistent logo) that must
     stay legible as it travels over sections of different themes. Opt in
     with [data-flwr-adapt-theme]; the attribute's value is the class (or
     space-separated classes) toggled ON while the element sits over a
     LIGHT-themed section and OFF over a dark/brand one — default is-invert.
     The theme behind the element is read by sampling the section under the
     element's centre (document.elementsFromPoint) and resolving the nearest
     f-mode-* on that section or an ancestor. Resolving at the SECTION level
     means a nested dark media block inside a light section won't flip it.
     Recomputes on scroll + resize (rAF-throttled). Generalized from the
     N58 AlaN-FAB pattern (and the piri-piri adaptive-logo pattern). */
  function flwrSectionThemeBehind(el) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height || !document.elementsFromPoint) return 'light';
    var els = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    var behind = null;
    for (var i = 0; i < els.length; i++) {
      if (els[i] !== el && !el.contains(els[i])) { behind = els[i]; break; }
    }
    if (!behind) return 'light';
    var node = (behind.closest && behind.closest('section')) || behind;
    while (node && node !== document.documentElement) {
      if (node.classList) {
        if (node.classList.contains('f-mode-dark'))  return 'dark';
        if (node.classList.contains('f-mode-brand')) return 'brand';
        if (node.classList.contains('f-mode-light')) return 'light';
      }
      node = node.parentElement;
    }
    return 'light';
  }
  function initAdaptTheme(scope) {
    var c = begin('adaptTheme');
    var els = (scope || document).querySelectorAll('[data-flwr-adapt-theme]');
    [].forEach.call(els, function (el) {
      if (c.owned.has(el)) return;
      var u = unit(c, el);
      var classes = ((el.getAttribute('data-flwr-adapt-theme') || '').trim() || 'is-invert').split(/\s+/).filter(Boolean);
      classes.forEach(function (cl) { u.snap(el, 'class:' + cl); });
      var raf = 0;
      function update() {
        raf = 0;
        var overLight = flwrSectionThemeBehind(el) === 'light';
        classes.forEach(function (cl) { el.classList.toggle(cl, overLight); });
      }
      function schedule() { if (!raf) raf = u.raf(update); }
      u.on(window, 'scroll', schedule, { passive: true });
      u.on(window, 'resize', schedule, { passive: true });
      update();
    });
  }

  /* -- scroll-triggered hover on touch ---------------------------------
     Touch pointers have no :hover, so hover-lift affordances never fire.
     Opt in per element with [data-flwr-scroll-hover]: on (hover: none)
     pointers the element gets the given class (default is-scroll-hover)
     while it sits in the middle band of the viewport (IntersectionObserver
     rootMargin -35%/-35%), toggled off as it leaves. On hover-capable
     pointers this is a no-op — real :hover applies. IMPORTANT: give
     .is-scroll-hover (or your custom class) the SAME CSS as the element's
     real :hover state — the runtime only toggles the class, it can't know
     what each element's hover looks like. Generalized from the N58 button
     scroll-hover pattern. */
  function initScrollHover(scope) {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && !window.matchMedia('(hover: none)').matches) return;
    var c = begin('scrollHover');
    var els = (scope || document).querySelectorAll('[data-flwr-scroll-hover]');
    if (!els.length) return;
    /* One observer for the page, held by an unowned unit so only a full
       destroy() disconnects it; per-element units unobserve on their own. */
    if (!c.io) {
      var shared = unit(c, null);
      c.io = shared.observe(new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var classes = ((e.target.getAttribute('data-flwr-scroll-hover') || '').trim() || 'is-scroll-hover').split(/\s+/).filter(Boolean);
          classes.forEach(function (cl) { e.target.classList.toggle(cl, e.isIntersecting); });
        });
      }, { rootMargin: '-35% 0px -35% 0px', threshold: 0 }));
      shared.undo(function () { c.io = null; });
    }
    var io = c.io;
    [].forEach.call(els, function (el) {
      if (c.owned.has(el)) return;
      var u = unit(c, el);
      var classes = ((el.getAttribute('data-flwr-scroll-hover') || '').trim() || 'is-scroll-hover').split(/\s+/).filter(Boolean);
      classes.forEach(function (cl) { u.snap(el, 'class:' + cl); });
      u.undo(function () { try { io.unobserve(el); } catch (_) {} });
      io.observe(el);
    });
  }

  /* -- scroll-driven animation engine (1.7.1) --------------------------
     Makes CSS scroll-driven animations (animation-timeline: view() /
     scroll() / a named timeline, plus animation-range) look the same in
     Safari as in Chrome. The CSS stays the single source of truth: every
     scroll-driven rule also declares
         --flwr-sd-timeline: <what animation-timeline says>;   view(), scroll(root block), --name
         --flwr-sd-range:    <what animation-range says>;      entry 0% cover 30%   (default: normal)
     and the rule that defines a named timeline also declares
         --flwr-sd-timeline-name: --name;   --flwr-sd-timeline-axis: block|inline;
         [--flwr-sd-timeline-kind: scroll]  (default view)   [--flwr-sd-timeline-inset: 20px 10%]
     Custom properties survive every engine, so this works where the
     animation-timeline declaration itself is dropped (older Safari) or
     misbehaves (Safari 26). The engine runs only on Apple WebKit (desktop and
     every iOS browser), when animation-timeline is unsupported, or with
     ?scrollengine=js; ?scrollengine=native turns it off. When it runs it takes
     the element's CSS animations (also on ::before / ::after), gives them a
     1s document timeline, pauses them, and sets currentTime = progress * 1s on
     scroll / resize, with the progress the CSS spec defines (cover, contain,
     entry, exit, entry-crossing, exit-crossing, % and px offsets). Keyframes,
     easing, iteration and fill stay the CSS's. Limits: block/inline assume
     horizontal-tb ltr; a ::before/::after view() measures its host element; a
     named timeline must sit on an ancestor (or the element itself). */
  var SD_NAMES = { cover: 1, contain: 1, entry: 1, exit: 1, 'entry-crossing': 1, 'exit-crossing': 1 };
  var SD_PROPS = ['timeline', 'range', 'timeline-name', 'timeline-axis', 'timeline-kind', 'timeline-inset'];
  var sdRegistered = false;

  function sdWanted() {
    var m = (/[?&]scrollengine=([a-z]+)/.exec(location.search) || [])[1];
    if (m === 'native' || !document.getAnimations) return false;
    if (m === 'js') return true;
    var ua = navigator.userAgent || '';
    var webkit = /AppleWebKit/.test(ua);
    var ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var safari = webkit && /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Android/.test(ua);
    return safari || (ios && webkit) || !(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
  }
  function sdTok(s) { return (s || '').trim().split(/\s+/).filter(Boolean); }
  function sdLen(t, base) {
    var n = parseFloat(t);
    if (isNaN(n)) return 0;
    if (/%$/.test(t)) return n / 100 * base;
    return /rem$/.test(t) ? n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) : n;
  }
  function sdAxis(w) { return (w === 'x' || w === 'inline') ? 'x' : 'y'; }
  function sdParseTimeline(txt) {
    txt = (txt || '').trim();
    var m = /^(view|scroll)\(([^)]*)\)$/.exec(txt), o;
    if (m) {
      o = { kind: m[1], axis: 'y', scroller: 'nearest', inset: [] };
      sdTok(m[2]).forEach(function (w) {
        if (/^(x|y|block|inline)$/.test(w)) o.axis = sdAxis(w);
        else if (/^(root|nearest|self)$/.test(w)) o.scroller = w;
        else o.inset.push(w);
      });
      return o;
    }
    return /^--/.test(txt) ? { kind: 'named', name: txt, inset: [] } : null;
  }
  /* animation-range -> [start, end], each { n: range name or '', o: offset or null, end: bool } */
  function sdParseRange(txt) {
    var items = [];
    sdTok(txt).forEach(function (w) {
      var p = items[items.length - 1];
      if (SD_NAMES[w]) items.push({ n: w, o: null });
      else if (w === 'normal') items.push({ n: '', o: null });
      else if (p && p.n && p.o === null) p.o = w;
      else items.push({ n: '', o: w });
    });
    var s = items[0] || { n: '', o: null }, e = items[1];
    if (!e) e = (s.n && s.o === null) ? { n: s.n, o: '100%' } : { n: '', o: null };
    e.end = 1;
    return [s, e];
  }
  function sdScrollerOf(el, mode) {
    var root = document.documentElement;
    if (mode === 'root') return root;
    if (mode === 'self') return el;
    for (var p = el.parentElement; p && p !== root; p = p.parentElement) {
      if (p === document.body) continue;
      var cs = getComputedStyle(p);
      if (/auto|scroll|hidden/.test(cs.overflowX + cs.overflowY)) return p;
    }
    return root;
  }
  /* scrollport size v, scroll range mx, content origin o and scroll offset s of a scroller */
  function sdBox(sc, x) {
    var root = sc === document.documentElement, se = root ? (document.scrollingElement || sc) : sc, v = x ? sc.clientWidth : sc.clientHeight, o = 0, r;
    if (!root) { r = sc.getBoundingClientRect(); o = x ? r.left + sc.clientLeft : r.top + sc.clientTop; }
    return { v: v, mx: (x ? se.scrollWidth : se.scrollHeight) - v, o: o, s: x ? se.scrollLeft : se.scrollTop };
  }
  /* named view-timeline ranges, as scroll offsets; g = { e: subject size, cs: cover start, ce: cover end } */
  function sdViewRange(g, n) {
    var ent = g.cs + g.e, ext = g.ce - g.e, c0 = Math.min(ent, ext), c1 = Math.max(ent, ext);
    return n === 'contain' ? [c0, c1] : n === 'entry' ? [g.cs, c0] : n === 'exit' ? [c1, g.ce] :
      n === 'entry-crossing' ? [g.cs, ent] : n === 'exit-crossing' ? [ext, g.ce] : [g.cs, g.ce];
  }
  function sdOffset(it, r) {
    var o = it.o === null ? (it.end ? '100%' : '0%') : it.o;
    return /%$/.test(o) ? r[0] + parseFloat(o) / 100 * (r[1] - r[0]) : r[0] + sdLen(o, 0);
  }

  function initScrollEngine(scope) {
    if (!sdWanted()) return;
    var c = begin('scrollEngine');
    var own = c.owned.get(document);
    var start = (scope && scope.nodeType === 1) ? scope : (document.body || document.documentElement);
    if (own) { own.scan(start); return; }
    var u = unit(c, document), root = document.documentElement;
    var items = [], byEl = new WeakMap(), fills = new WeakMap(), pending = [], raf = 0, dirty = true;
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!sdRegistered) {
      sdRegistered = true;
      SD_PROPS.forEach(function (p) {
        try { CSS.registerProperty({ name: '--flwr-sd-' + p, syntax: '*', inherits: false }); } catch (_) {}
      });
    }
    var st = document.head.appendChild(document.createElement('style'));
    st.textContent = '[data-flwr-sd~="self"],[data-flwr-sd~="before"]::before,[data-flwr-sd~="after"]::after{animation-timeline:auto!important;animation-duration:1s!important;animation-play-state:paused!important}';
    u.undo(function () {
      st.remove();
      items.forEach(function (it) { it.el.removeAttribute('data-flwr-sd'); });
      items = [];
    });
    u.attr(root, 'data-flwr-scroll-engine', 'on');

    function read(el, ps) {
      var cs = getComputedStyle(el, ps || null), t = cs.getPropertyValue('--flwr-sd-timeline').trim(), spec;
      if (!t || t === 'none' || t === 'auto' || !(spec = sdParseTimeline(t))) return null;
      if (reduce && !el.closest('[data-flwr-motion~="keep"]')) return null;
      var rg = cs.getPropertyValue('--flwr-sd-range');
      spec.range = sdParseRange(rg);
      spec.key = t + '|' + rg + '|' + cs.getPropertyValue('--flwr-sd-timeline-name');
      return spec;
    }
    function scanEl(el) {
      var m = byEl.get(el), flags = [];
      ['', '::before', '::after'].forEach(function (ps, i) {
        var spec = read(el, ps), it = m && m[ps];
        if (it && (!spec || it.spec.key !== spec.key)) { items.splice(items.indexOf(it), 1); delete m[ps]; it = null; dirty = true; }
        if (spec && !it) {
          if (!m) byEl.set(el, m = {});
          m[ps] = it = { el: el, ps: ps, spec: spec, anims: [], last: NaN };
          items.push(it); dirty = true;
        }
        if (it) flags.push(['self', 'before', 'after'][i]);
      });
      var prev = el.getAttribute('data-flwr-sd'), now = flags.join(' ');
      if (!now) { if (prev !== null) el.removeAttribute('data-flwr-sd'); return; }
      if (prev === now) return;
      el.setAttribute('data-flwr-sd', now);
      /* the timeline switch idles an animation at the next frame; pinning it to 0 now keeps it alive */
      document.getAnimations().forEach(function (a) { if (a.effect && a.effect.target === el && a.animationName !== undefined) a.currentTime = 0; });
      dirty = true;
    }
    function scan(node) {
      scanEl(node);
      var all = node.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) scanEl(all[i]);
      schedule();
    }
    u.scan = scan;
    u.dump = function () { return items.map(function (it) { return { el: it.el, ps: it.ps, on: it.on, a: it.a, b: it.b, kind: it.kind, last: it.last, anims: it.anims.length }; }); };

    function definer(el, name) { /* named timeline: the nearest ancestor-or-self that declares it */
      for (var p = el; p; p = p.parentElement) {
        if (getComputedStyle(p).getPropertyValue('--flwr-sd-timeline-name').trim() === name) return p;
      }
      return null;
    }
    function measure() {
      dirty = false;
      items = items.filter(function (it) { return it.el.isConnected; });
      items.forEach(function (it) { it.anims = []; });
      var saved = [];
      document.getAnimations().forEach(function (a) {
        var ef = a.effect, m = ef && ef.target && byEl.get(ef.target), it = m && a.animationName !== undefined && m[ef.pseudoElement || ''];
        if (!it) return;
        it.anims.push(a);
        if (!fills.has(a)) fills.set(a, ef.getTiming().fill);
        /* measure the untransformed layout: suspend the effect while reading boxes */
        saved.push([a, a.currentTime]);
        ef.updateTiming({ fill: 'none' });
        a.currentTime = -1;
      });
      items.forEach(function (it) {
        var sp = it.spec, el = it.el, subj = el, x = sp.axis === 'x', inset = sp.inset, kind = sp.kind, sc, nm;
        it.on = false;
        if (kind === 'named') {
          if (!(nm = definer(el, sp.name))) return;
          var cs = getComputedStyle(nm);
          x = sdAxis(cs.getPropertyValue('--flwr-sd-timeline-axis').trim()) === 'x';
          kind = cs.getPropertyValue('--flwr-sd-timeline-kind').trim() === 'scroll' ? 'scroll' : 'view';
          inset = sdTok(cs.getPropertyValue('--flwr-sd-timeline-inset'));
          subj = nm;
          sc = kind === 'scroll' ? nm : sdScrollerOf(nm, 'nearest');
        } else sc = sdScrollerOf(el, sp.scroller);
        var b = sdBox(sc, x), rg = sp.range;
        it.sc = sc; it.x = x; it.kind = kind; it.sig = b.v + '/' + b.mx;
        if (b.mx <= 0 && (kind === 'scroll' || sc !== root)) return;
        if (kind === 'view') {
          var r = subj.getBoundingClientRect(), t = (x ? r.left : r.top) - b.o + b.s, e = x ? r.width : r.height;
          var ia = inset[0] && inset[0] !== 'auto' ? sdLen(inset[0], b.v) : 0;
          var ib = inset[1] && inset[1] !== 'auto' ? sdLen(inset[1], b.v) : ia;
          var g = { e: e, cs: t - b.v + ib, ce: t + e - ia };
          it.a = sdOffset(rg[0], sdViewRange(g, rg[0].n));
          it.b = sdOffset(rg[1], sdViewRange(g, rg[1].n));
        } else {
          it.a = sdOffset(rg[0], [0, b.mx]);
          it.b = sdOffset(rg[1], [0, b.mx]);
        }
        it.on = true;
        ro.observe(subj);
        if (sc !== root) ro.observe(sc);
      });
      saved.forEach(function (s) { s[0].effect.updateTiming({ fill: fills.get(s[0]) }); s[0].currentTime = s[1] == null ? 0 : s[1]; });
      items.forEach(function (it) { it.last = NaN; it.state = ''; });
    }
    function frame() {
      raf = 0;
      if (dirty) measure();
      var boxes = [new Map(), new Map()];
      items.forEach(function (it) {
        var bx = null, p = -1, on = it.on;
        if (it.sc) {
          var bm = boxes[+it.x];
          bx = bm.get(it.sc);
          if (!bx) bm.set(it.sc, bx = sdBox(it.sc, it.x));
          if (it.sig !== bx.v + '/' + bx.mx) dirty = true; /* scroller resized: re-measure next frame */
        }
        if (on) {
          p = it.b === it.a ? (bx.s >= it.b ? 1 : 0) : (bx.s - it.a) / (it.b - it.a);
          if (p === 1 && it.kind === 'scroll') p = 1 - 1e-6;
        }
        var want = on ? 'on' : 'off';
        if (p === it.last && want === it.state) return;
        it.last = p;
        it.anims.forEach(function (a) {
          if (want !== it.state) a.effect.updateTiming({ fill: on ? fills.get(a) : 'none' });
          a.currentTime = on ? p * 1000 : -1;
        });
        it.state = want;
      });
      if (dirty) schedule();
    }
    function schedule() { if (!raf) raf = u.raf(function () { frame(); }); }
    function relayout() { dirty = true; schedule(); }

    var ro = u.observe(new ResizeObserver(relayout));
    ro.observe(root); ro.observe(document.body);
    u.on(document, 'scroll', schedule, { passive: true, capture: true });
    u.on(window, 'resize', relayout, { passive: true });
    u.on(window, 'load', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!u.dead) relayout(); });
    var mo = u.observe(new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        if (r.type === 'attributes') pending.push([r.target, 0]);
        else [].forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) pending.push([n, 1]); });
      });
      u.raf(function () {
        var list = pending; pending = [];
        list.forEach(function (p) { if (p[0].isConnected) { if (p[1]) scan(p[0]); else scanEl(p[0]); } });
        relayout();
      });
    }));
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-flwr-motion'] });
    scan(start);
  }

  /* -- public API ------------------------------------------------------- */

  function destroyer(name) {
    return function (scope) { destroyController(name, scope); };
  }

  window.flwr = window.flwr || {};
  window.flwr.cardStack = {
    next: nextCard,
    prev: prevCard,
    moveToTop: moveToTop,
    reindex: indexStack,
    init: initCardStacks,
    destroy: destroyer('cardStack')
  };
  window.flwr.scrollDialog = {
    refresh: function () {
      scanScrollDialogs();
      checkScrollDialogs();
    },
    reset: function (dialog) {
      if (dialog) scrollFired.delete(dialog);
      else scrollFired = new WeakSet();
    },
    init: initScrollDialogs,
    destroy: destroyer('scrollDialog')
  };
  window.flwr.marquee        = { init: initMarquees,      destroy: destroyer('marquee') };
  window.flwr.swiper         = { init: initSwipers,       destroy: destroyer('swiper'),
                                 initThumbs: initSwiperThumbs, destroyThumbs: destroyer('swiperThumbs') };
  window.flwr.map            = { init: initMaps,          destroy: destroyer('map') };
  window.flwr.scrubber       = { init: initScrubbers,     destroy: destroyer('scrubber') };
  window.flwr.tabs           = { init: initTabs,          destroy: destroyer('tabs') };
  window.flwr.search         = { init: initSearch,        destroy: destroyer('search') };
  window.flwr.fullscreenMenu = { init: initFullscreenMenu, destroy: destroyer('fullscreenMenu') };
  window.flwr.toggle         = { init: initToggles,       destroy: destroyer('toggle') };
  window.flwr.cardOverlay    = { init: initCardOverlays,  destroy: destroyer('cardOverlay') };
  window.flwr.navbar         = { init: initNavbars,       destroy: destroyer('navbar') };
  window.flwr.collapse       = { init: initCollapse,      destroy: destroyer('collapse') };
  window.flwr.hideIfEmpty    = { init: initHideIfEmpty,   destroy: destroyer('hideIfEmpty') };
  window.flwr.disabledWrap   = { init: initDisabledWraps, destroy: destroyer('disabledWrap') };
  window.flwr.playerToggle   = { init: initPlayerToggles, destroy: destroyer('playerToggle') };
  window.flwr.emptySelect    = { init: initEmptySelects,  destroy: destroyer('emptySelect') };
  window.flwr.verticalText   = { init: initVerticalText,  destroy: destroyer('verticalText') };
  window.flwr.list           = { init: initList,          destroy: destroyer('list') };
  window.flwr.adaptTheme     = { init: initAdaptTheme,    destroy: destroyer('adaptTheme') };
  window.flwr.scrollHover    = { init: initScrollHover,   destroy: destroyer('scrollHover') };
  window.flwr.scrollEngine   = { init: initScrollEngine,  destroy: destroyer('scrollEngine'),
                                 refresh: function () { initScrollEngine(document.body); },
                                 items: function () { var o = registry.scrollEngine && registry.scrollEngine.owned.get(document); return o ? o.dump() : []; } };

  /* -- bootstrap -------------------------------------------------------- */

  /* Per-controller error isolation: a throw inside one controller is logged
     once and the remaining controllers still run. Controller signatures are
     untouched — the public window.flwr.*.init entries call them directly. */
  function runController(name, fn, arg) {
    try {
      fn(arg);
    } catch (err) {
      console.warn('[flwr] ' + name + ' failed', err);
    }
  }

  /* Boot order. destroy() walks it in reverse so dependents (swiper
     thumbs) fall before what they hang on (swiper). */
  var CONTROLLERS = [
    ['cardStack',      initCardStacks],
    ['scrollDialog',   initScrollDialogs],
    ['marquee',        initMarquees],
    ['swiper',         initSwipers],
    ['swiperThumbs',   initSwiperThumbs],
    ['map',            initMaps],
    ['scrubber',       initScrubbers],
    ['tabs',           initTabs],
    ['search',         initSearch],
    ['fullscreenMenu', initFullscreenMenu],
    ['toggle',         initToggles],
    ['cardOverlay',    initCardOverlays],
    ['navbar',         initNavbars],
    ['collapse',       initCollapse],
    ['hideIfEmpty',    initHideIfEmpty],
    ['disabledWrap',   initDisabledWraps],
    ['playerToggle',   initPlayerToggles],
    ['emptySelect',    initEmptySelects],
    ['verticalText',   initVerticalText],
    ['list',           initList],
    ['adaptTheme',     initAdaptTheme],
    ['scrollHover',    initScrollHover],
    ['scrollEngine',   initScrollEngine]
  ];

  function init(scope) {
    var s = (scope && scope.querySelectorAll) ? scope : document;
    hookLoad();
    for (var i = 0; i < CONTROLLERS.length; i++) {
      /* scrollDialog scans the whole document by design and takes no scope */
      if (CONTROLLERS[i][0] === 'scrollDialog') runController('scrollDialog', initScrollDialogs);
      else runController(CONTROLLERS[i][0], CONTROLLERS[i][1], s);
    }
  }

  function destroyAll(scope) {
    var s = (scope && scope.querySelectorAll && scope !== document) ? scope : null;
    for (var i = CONTROLLERS.length - 1; i >= 0; i--) destroyController(CONTROLLERS[i][0], s);
    /* A full destroy also drops the boot listeners, so the page holds
       nothing from the runtime until init() is called again. */
    if (!s) {
      document.removeEventListener('DOMContentLoaded', boot);
      window.removeEventListener('load', onLoad);
      loadHooked = false;
    }
  }

  window.flwr.init = init;
  window.flwr.destroy = destroyAll;

  function boot() { init(); }
  /* Re-init for libs that load after our script (Swiper, Leaflet via CDN) */
  function onLoad() {
    runController('swiper',       initSwipers,      document);
    runController('swiperThumbs', initSwiperThumbs, document);
    runController('map',          initMaps,         document);
  }
  /* The load hook is armed by init() while the page is still loading, so
     init() after an early destroy() behaves like a fresh boot; once the
     page has loaded there is nothing for it to do and it is not re-added. */
  var loadHooked = false;
  function hookLoad() {
    if (loadHooked || document.readyState === 'complete') return;
    loadHooked = true;
    window.addEventListener('load', onLoad);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  hookLoad();
})();
