/* N Emprende · formulario de postulación (4 pasos).
   Progressive enhancement over a plain Webflow form:
   - no JS  : the four <fieldset>s stack, only «Enviar postulación» shows, the form posts natively.
   - with JS: one fieldset at a time, per-step native validation, flwr stepper state, focus + scroll.
   Markup contract (all data-n58-* hooks live in n-emprende-empresas.html #postulacion). */
(function () {
  'use strict';

  var root = document.querySelector('[data-n58-emprende-form]');
  if (!root) return;
  var form = root.querySelector('form');
  var steps = Array.prototype.slice.call(form.querySelectorAll('[data-n58-step]'));
  var progress = root.querySelector('[data-n58-progress]');
  var dots = Array.prototype.slice.call(root.querySelectorAll('[data-n58-stepper-step]'));
  var links = Array.prototype.slice.call(root.querySelectorAll('[data-n58-stepper-connector]'));
  var counter = root.querySelector('[data-n58-step-count]');
  var btnBack = form.querySelector('[data-n58-back]');
  var btnNext = form.querySelector('[data-n58-next]');
  var btnSubmit = form.querySelector('[data-n58-submit]');
  var success = root.querySelector('[data-n58-success]');
  var fail = root.querySelector('[data-n58-fail]');
  var section = document.getElementById('postulacion') || root;
  if (!steps.length || !btnBack || !btnNext || !btnSubmit) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0;
  var total = steps.length;
  var labels = dots.map(function (d) {
    var l = d.querySelector('.flwr_stepper_label');
    return l ? l.textContent.trim() : '';
  });

  /* ── Chips and the privacy checkbox: mirror the native input into the flwr state attribute ── */
  function paintChoice(input) {
    var wrap = input.closest('.flwr_chip, .flwr_field_checkbox_wrap');
    if (!wrap) return;
    var on = input.checked;
    wrap.setAttribute('data-flwr-state', on ? (wrap.classList.contains('flwr_chip') ? 'selected' : 'checked') : '');
  }
  function paintGroup(input) {
    if (input.type === 'radio') {
      form.querySelectorAll('input[type="radio"][name="' + input.name + '"]').forEach(paintChoice);
    } else {
      paintChoice(input);
    }
  }
  form.querySelectorAll('.flwr_chip input, .flwr_field_checkbox_wrap input').forEach(function (input) {
    input.classList.add('f-sr-only'); /* native control stays visible without JS */
    paintChoice(input);
    input.addEventListener('change', function () {
      paintGroup(input);
      var group = input.closest('[data-n58-group-min]');
      if (group) setGroupError(group, false);
    });
  });

  /* ── Multi-select groups → one hidden field each ──
     Webflow keeps every checkbox as its own field, so each chip group also writes its answers, joined
     («Ventas bajas, Deudas»), into one hidden input named after the question. The hidden input is the
     readable answer; it is refreshed on every change and again right before submit. */
  var joined = Array.prototype.slice.call(form.querySelectorAll('input[type="hidden"][data-n58-joined]'));
  function groupBoxes(hidden) {
    var group = hidden.parentNode.querySelector('[data-n58-group-min]');
    return group ? Array.prototype.slice.call(group.querySelectorAll('input[type="checkbox"]')) : [];
  }
  function syncJoined() {
    joined.forEach(function (hidden) {
      hidden.value = groupBoxes(hidden).filter(function (b) { return b.checked; })
        .map(function (b) { return b.value; }).join(', ');
    });
  }
  /* «At least N chosen» as native validity. Webflow's form script ignores a page's preventDefault, so the rule
     lives on the first checkbox of each group (setCustomValidity): the browser then never fires «submit» while the
     group is short. The visible message is the group's own error paragraph, which n58-forms.js paints into the
     control's slot when the browser reports the field invalid. */
  function groupOf(box) { return box.closest('[data-n58-group-min]'); }
  function groupMessage(group) { return group.__n58msg || ''; }   /* read once: n58-forms.js clears the paragraph when a field turns valid */
  function syncGroupValidity(group) {
    var boxes = group.querySelectorAll('input[type="checkbox"]');
    if (!boxes.length) return;
    var min = parseInt(group.getAttribute('data-n58-group-min'), 10) || 1;
    var short = group.querySelectorAll('input:checked').length < min;
    boxes[0].setCustomValidity(short ? (groupMessage(group) || 'Elige al menos una opción.') : '');
  }
  var groups = Array.prototype.slice.call(form.querySelectorAll('[data-n58-group-min]'));
  groups.forEach(function (group) {
    var msg = group.parentNode.querySelector('[data-n58-group-error]');
    var first = group.querySelector('input[type="checkbox"]');
    group.__n58msg = msg ? msg.textContent.trim() : '';
    if (msg && first) first.__n58slot = msg;   /* report into the existing paragraph, not a second one */
    syncGroupValidity(group);
  });
  form.addEventListener('change', function (e) {
    if (e.target && e.target.type === 'checkbox') {
      syncJoined();
      var g = groupOf(e.target);
      if (g) { syncGroupValidity(g); setGroupError(g, false); }
    }
  });
  syncJoined();

  /* ── Live character count (textarea → flwr_field_message) ── */
  form.querySelectorAll('[data-n58-count-target]').forEach(function (ta) {
    var out = document.getElementById(ta.getAttribute('data-n58-count-target'));
    if (!out) return;
    var max = ta.getAttribute('maxlength');
    function sync() { out.textContent = ta.value.length + ' / ' + max; }
    ta.addEventListener('input', sync);
    sync();
  });

  /* ── Validation ── */
  function setGroupError(group, on) {
    var msg = group.parentNode.querySelector('[data-n58-group-error]');
    if (!msg) return;
    if (on && !msg.textContent.trim()) msg.textContent = group.__n58msg || '';
    msg.hidden = !on;
  }
  function validateStep(i) {
    var step = steps[i];
    var fields = step.querySelectorAll('input, select, textarea');
    var checkedGroups = [];
    for (var k = 0; k < fields.length; k++) {
      var f = fields[k];
      var group = f.type === 'checkbox' ? f.closest('[data-n58-group-min]') : null;
      if (group) {
        /* "at least N chosen" rule, checked once per group, in DOM order with the other fields */
        if (checkedGroups.indexOf(group) >= 0) continue;
        checkedGroups.push(group);
        var min = parseInt(group.getAttribute('data-n58-group-min'), 10) || 1;
        if (group.querySelectorAll('input:checked').length < min) {
          setGroupError(group, true);
          f.focus();
          return false;
        }
        continue;
      }
      /* n58-forms.js owns the field formats: refresh the custom message, then let the «invalid» listener
         paint it in the field's own message slot and focus the field (no browser bubble). */
      if (window.N58Forms) window.N58Forms.check(f, false);
      if (!f.checkValidity()) { f.reportValidity(); return false; }
    }
    return true;
  }

  /* ── Step display ── */
  function render(i, focusLegend) {
    steps.forEach(function (step, n) {
      var show = n === i;
      step.hidden = !show;
      if (show && focusLegend && !reduceMotion) {
        step.classList.add('is-entering');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { step.classList.remove('is-entering'); });
        });
      }
    });
    dots.forEach(function (d, n) {
      d.classList.toggle('is-active', n === i);
      d.classList.toggle('is-complete', n < i);
      if (n === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      var dot = d.querySelector('.flwr_stepper_dot');
      if (dot) dot.textContent = n < i ? '✓' : String(n + 1);
    });
    links.forEach(function (c, n) { c.classList.toggle('is-complete', n < i); });
    if (counter) counter.textContent = 'Paso ' + (i + 1) + ' de ' + total + (labels[i] ? ' · ' + labels[i] : '');
    btnBack.hidden = i === 0;
    btnNext.hidden = i === total - 1;
    btnSubmit.hidden = i !== total - 1;
    if (focusLegend) {
      var legend = steps[i].querySelector('legend');
      if (legend) legend.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  function go(i) {
    if (i < 0 || i >= total) return;
    current = i;
    render(current, true);
  }

  btnNext.addEventListener('click', function () { if (validateStep(current)) go(current + 1); });
  btnBack.addEventListener('click', function () { go(current - 1); });

  /* Enter inside a single-line input advances instead of submitting early. */
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    if (current < total - 1) {
      e.preventDefault();
      if (validateStep(current)) go(current + 1);
    }
  });

  form.addEventListener('submit', function (e) {
    if (current < total - 1) { e.preventDefault(); if (validateStep(current)) go(current + 1); return; }
    if (!validateStep(current)) { e.preventDefault(); return; }
    syncJoined();
    /* The chip checkboxes are already summed up in the hidden fields: keep them out of this submission so each
       answer travels once. Webflow's form script reads every input under the form (disabled ones too) and posts each
       checkbox as its own true / false column, so the chips leave the form for this one submit: each is swapped for a
       comment marker, parked in a detached holder, and put back in the next task, in place, checked state and focus
       intact. This listener sits on the form, so it runs before Webflow's listener on the document. */
    var parked = [];
    var holder = document.createDocumentFragment();
    var active = document.activeElement;
    joined.forEach(function (h) {
      groupBoxes(h).forEach(function (b) {
        var marker = document.createComment('n58-chip');
        b.parentNode.replaceChild(marker, b);
        holder.appendChild(b);
        parked.push({ box: b, marker: marker });
      });
    });
    setTimeout(function () {
      parked.forEach(function (p) { if (p.marker.parentNode) p.marker.parentNode.replaceChild(p.box, p.marker); });
      if (active && parked.some(function (p) { return p.box === active; })) active.focus({ preventScroll: true });
    }, 0);
    /* Inside Webflow the native form handler takes over and shows its own done / fail states
       (the w-form-done and w-form-fail blocks below the form; watchStates() reacts to them). */
    if (window.Webflow) return;
    e.preventDefault();
    // TODO: wire submission (static prototype has no backend). Post the FormData from `form`
    // to the real endpoint here, then show the success panel only on a 2xx response.
    showSuccess();
  });

  function visible(node) { return !!node && getComputedStyle(node).display !== 'none'; }   /* Webflow's inline display beats [hidden] */
  /* Webflow shows its done block with an inline display and hides the form: follow it (stepper off, focus the title). */
  function afterWebflowDone() {
    if (progress) progress.hidden = true;
    var title = success.querySelector('[data-n58-success-title]') || success;
    title.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function afterWebflowFail() {
    var t = fail.querySelector('.flwr_alert_title') || fail;
    t.focus({ preventScroll: true });
    fail.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function watchStates() {
    if (!window.MutationObserver) return;
    var seen = { done: false, fail: false };
    function check() {
      var d = visible(success), f = visible(fail);
      if (d && !seen.done) afterWebflowDone();
      if (f && !seen.fail) afterWebflowFail();
      seen.done = d; seen.fail = f;
    }
    var opts = { attributes: true, attributeFilter: ['style', 'class', 'hidden'] };
    var mo = new MutationObserver(check);
    if (success) mo.observe(success, opts);
    if (fail) mo.observe(fail, opts);
  }
  watchStates();

  function showSuccess() {
    form.hidden = true;
    if (progress) progress.hidden = true;
    success.hidden = false;
    /* Focus the heading, not the whole panel: a programmatic focus ring around the panel read as a bug. */
    var title = success.querySelector('[data-n58-success-title]') || success;
    title.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ── Enhance: from here on the form is a stepper ── */
  if (progress) progress.hidden = false;
  render(0, false);
})();
