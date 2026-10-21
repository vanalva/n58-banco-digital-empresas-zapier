/* N58 forms · shared enhancement for n-emprende-empresas.html and formulario-reclamos.html.
   Progressive enhancement over plain Webflow forms. With no JS everything stays a native form.

   1. Custom selects   every <select class="flwr_field_select"> keeps its native element (hidden, still the
                       submitted + validated control) and gets a trigger button + listbox that reuses the
                       navbar dropdown classes (flwr_navbar_dropdown / _menu / _item, n58-dd_li).
   2. Input formats    data-n58-format="…" on a field: live formatting while typing, validation on blur / step
                       advance / submit, Spanish messages shown in the field's own message slot.
   3. Reclamos         the five claim groups show per «Tipo de reclamo»; prototype success / error states.

   Webflow note: the page markup only gains attributes. Inside Webflow (window.Webflow) the native form
   handler owns submission and the done / fail states, so the prototype states below stay out of the way. */
(function () {
  'use strict';

  var uid = 0;
  function nextId(prefix) { return prefix + (++uid); }
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }
  function fire(node, type) {
    node.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function ensureId(node, prefix) {
    if (!node.id) node.id = nextId(prefix);
    return node.id;
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ════════════════════════════════════════════════════════════════════
     1 · ERROR SLOTS + PAINTING
     ════════════════════════════════════════════════════════════════════ */
  function visualControl(ctl) {
    /* The element that carries the field look: the custom trigger for a select, the box for a checkbox. */
    if (ctl.__n58trigger) return ctl.__n58trigger;
    if (ctl.__n58box) return ctl.__n58box;
    return ctl;
  }
  function slotFor(ctl) {
    if (ctl.__n58slot) return ctl.__n58slot;
    var host = ctl.closest('.flwr_field_wrap');
    var anchor = null;
    if (!host) {
      /* single checkbox: the label is the control; the slot goes right after it */
      var lab = ctl.closest('label');
      anchor = lab || ctl;
      host = anchor.parentNode;
    }
    var slot = el('p', 'flwr_field_message is-error', { role: 'alert', hidden: '', 'data-n58-error': '' });
    slot.id = nextId('n58-err-');
    if (anchor) host.insertBefore(slot, anchor.nextSibling); else host.appendChild(slot);
    var prev = ctl.getAttribute('aria-describedby');
    var target = ctl.__n58trigger || ctl;
    var prevT = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', (prevT ? prevT + ' ' : '') + slot.id);
    void prev;
    ctl.__n58slot = slot;
    /* radios share one slot per group */
    if (ctl.type === 'radio' && ctl.name) {
      var group = ctl.form ? ctl.form.querySelectorAll('input[type="radio"][name="' + ctl.name + '"]') : [];
      for (var i = 0; i < group.length; i++) group[i].__n58slot = slot;
    }
    return slot;
  }
  function messageFor(ctl) {
    var v = ctl.validity;
    if (v.customError) return ctl.validationMessage;
    if (v.valueMissing) {
      if (ctl.tagName === 'SELECT') return 'Selecciona una opción.';
      if (ctl.type === 'checkbox') return 'Necesitamos que aceptes para continuar.';
      if (ctl.type === 'radio') return 'Elige una opción.';
      return 'Completa este campo.';
    }
    if (v.typeMismatch) return 'Escribe un correo válido, por ejemplo nombre@dominio.com.';
    if (v.tooShort) return 'Escribe al menos ' + ctl.minLength + ' caracteres.';
    if (v.patternMismatch) return ctl.getAttribute('title') || 'El formato no es válido.';
    return ctl.validationMessage || 'Revisa este campo.';
  }
  function paint(ctl, show) {
    var vis = visualControl(ctl);
    var ok = ctl.validity.valid || ctl.disabled;
    var slot = ctl.__n58slot || (ok ? null : slotFor(ctl));
    if (ok || !show) {
      if (ok) {
        vis.classList.remove('is-error');
        if (vis.removeAttribute) vis.removeAttribute('aria-invalid');
        if (ctl.type === 'checkbox') {
          var box = ctl.parentNode.querySelector('.flwr_field_checkbox_box');
          if (box) box.classList.remove('is-error');
        }
        if (slot) { slot.hidden = true; slot.textContent = ''; }
      }
      return;
    }
    slot = slot || slotFor(ctl);
    vis.classList.add('is-error');
    vis.setAttribute('aria-invalid', 'true');
    if (ctl.type === 'checkbox') {
      var b = ctl.parentNode.querySelector('.flwr_field_checkbox_box');
      if (b) b.classList.add('is-error');
    }
    slot.textContent = messageFor(ctl);
    slot.hidden = false;
  }

  /* One «invalid» listener for the page: silence the browser bubble, show the message in the slot, and
     focus the first invalid control (reportValidity / submit fire invalid on every bad field in order). */
  var focusedThisTick = false;
  document.addEventListener('invalid', function (e) {
    var ctl = e.target;
    if (!ctl.form) return;
    e.preventDefault();
    ctl.__n58touched = true;
    paint(ctl, true);
    if (!focusedThisTick) {
      focusedThisTick = true;
      var target = ctl.__n58trigger || ctl;
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      var r = target.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 20) {
        target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      setTimeout(function () { focusedThisTick = false; }, 0);
    }
  }, true);

  /* ════════════════════════════════════════════════════════════════════
     2 · FORMATS (Venezuela)
     ════════════════════════════════════════════════════════════════════ */
  function onlyDigits(s) { return s.replace(/\D+/g, ''); }
  function thousands(d) { return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  var F = {};

  /* Personal / business names */
  F.name = {
    input: function (v) {
      v = v.replace(/[^\p{L}\p{M}' ’\-]/gu, '').replace(/^[\s'’\-]+/, '').replace(/\s{2,}/g, ' ');
      return v.slice(0, 60);
    },
    validate: function (v) {
      return v.replace(/[^\p{L}]/gu, '').length < 2 ? 'Escribe al menos 2 letras. Solo letras, espacios, apóstrofes y guiones.' : '';
    }
  };
  F.org = {
    input: function (v) { return v.replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, 100); },
    validate: function (v) { return v.length < 2 ? 'Escribe el nombre de tu negocio.' : ''; }
  };
  F.bank = {
    input: function (v) {
      return v.replace(/[^\p{L}\p{N} .&'’\-\/]/gu, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, 60);
    },
    validate: function (v) { return v.replace(/[^\p{L}]/gu, '').length < 2 ? 'Escribe el nombre del banco.' : ''; }
  };
  F.contract = {
    input: function (v) { return v.toUpperCase().replace(/[^A-Z0-9\-\/. ]/g, '').replace(/^\s+/, '').slice(0, 30); },
    validate: function (v) { return v.replace(/[^A-Z0-9]/g, '').length < 4 ? 'El número de contrato parece muy corto.' : ''; }
  };

  /* Email */
  F.email = {
    input: function (v) { return v.replace(/\s+/g, '').toLowerCase().slice(0, 120); },
    validate: function (v) {
      return /^[a-z0-9._%+\-]+@(?:[a-z0-9\-]+\.)+[a-z]{2,}$/i.test(v)
        ? '' : 'Escribe un correo válido, por ejemplo nombre@dominio.com.';
    }
  };

  /* Phone: 0412 / 0414 / 0416 / 0422 / 0424 / 0426 or 02xx + 7 digits, shown 0414-123-4567 */
  function phoneDigits(v) {
    var d = onlyDigits(v);
    if (d.indexOf('58') === 0) {            /* +58 414… or 58414… → national form */
      d = d.slice(2);
      if (d.charAt(0) !== '0') d = '0' + d;
    } else if (d.charAt(0) === '4' || d.charAt(0) === '2') {
      d = '0' + d;                          /* 414… / 212… typed without the leading 0 */
    }
    return d.slice(0, 11);
  }
  F.phone = {
    input: function (v) {
      var d = phoneDigits(v);
      var out = d.slice(0, 4);
      if (d.length > 4) out += '-' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 11);
      return out;
    },
    validate: function (v) {
      if (/^0(4(12|14|16|22|24|26)|2\d\d)-\d{3}-\d{4}$/.test(v)) return '';
      if (/^04/.test(v) && !/^04(12|14|16|22|24|26)/.test(v)) return 'El código de celular debe ser 0412, 0414, 0416, 0422, 0424 o 0426.';
      return 'Escribe un teléfono venezolano completo, por ejemplo 0414-123-4567.';
    },
    paste: true
  };

  /* Numbers */
  F.last4 = {
    input: function (v) { return onlyDigits(v).slice(0, 4); },
    validate: function (v) { return v.length === 4 ? '' : 'Escribe exactamente 4 números.'; }
  };
  F.acct20 = {
    input: function (v) { return onlyDigits(v).slice(0, 20); },
    validate: function (v) { return v.length === 20 ? '' : 'El número de cuenta tiene 20 dígitos.'; }
  };
  F.int = {
    input: function (v) { return onlyDigits(v).replace(/^0+(?=\d)/, '').slice(0, 3); },
    validate: function (v) { return /^[1-9]\d{0,2}$/.test(v) ? '' : 'Escribe un número entero mayor que 0.'; }
  };

  /* Amounts: digits, one comma (or dot) decimal, up to 2 decimals. 1.234,56 and 1234.56 both read. */
  function parseAmount(v) {
    v = v.replace(/\s/g, '');
    if (!v) return null;
    var c = v.lastIndexOf(','), d = v.lastIndexOf('.');
    var intPart = v, dec = '';
    if (c > -1) {
      intPart = v.slice(0, c).replace(/[.,]/g, '');
      dec = v.slice(c + 1).replace(/[.,]/g, '');
    } else if (d > -1) {
      var after = v.length - d - 1;
      var dots = (v.match(/\./g) || []).length;
      if (dots === 1 && after <= 2) { intPart = v.slice(0, d); dec = v.slice(d + 1); }
      else intPart = v.replace(/\./g, '');
    }
    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(dec)) return null;
    if (intPart === '' && dec === '') return null;
    return { int: intPart.replace(/^0+(?=\d)/, '') || '0', dec: dec };
  }
  F.amount = {
    input: function (v) {
      v = v.replace(/[^\d.,]/g, '');
      var first = v.indexOf(',');
      if (first > -1) v = v.slice(0, first + 1) + v.slice(first + 1).replace(/,/g, '');
      return v.slice(0, 15);
    },
    validate: function (v) {
      var p = parseAmount(v);
      if (!p) return 'Escribe un monto válido, por ejemplo 1.250,50.';
      if (p.dec.length > 2) return 'Usa máximo 2 decimales.';
      if (+(p.int + '.' + (p.dec || '0')) <= 0) return 'El monto debe ser mayor que 0.';
      return '';
    },
    blur: function (v) {
      var p = parseAmount(v);
      if (!p || p.dec.length > 2) return v;
      return thousands(p.int) + (p.dec ? ',' + (p.dec.length === 1 ? p.dec + '0' : p.dec) : '');
    }
  };

  /* Dates dd/mm/aaaa, real and not in the future */
  F.date = {
    input: function (v) {
      var d = onlyDigits(v).slice(0, 8);
      var out = d.slice(0, 2);
      if (d.length > 2) out += '/' + d.slice(2, 4);
      if (d.length > 4) out += '/' + d.slice(4, 8);
      return out;
    },
    validate: function (v) {
      var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (!m) return 'Escribe la fecha completa como dd/mm/aaaa.';
      var dd = +m[1], mm = +m[2], yy = +m[3];
      var dt = new Date(yy, mm - 1, dd);
      if (yy < 2000 || dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return 'Esa fecha no existe. Revisa día, mes y año.';
      var today = new Date(); today.setHours(0, 0, 0, 0);
      if (dt > today) return 'La fecha no puede ser futura.';
      return '';
    }
  };

  /* Claim code (consultar estatus) */
  F.claim = {
    input: function (v) { return v.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 20); },
    validate: function (v) { return v.replace(/[^A-Z0-9]/g, '').length < 4 ? 'Escribe el código completo, por ejemplo RC-000000.' : ''; }
  };

  /* RIF: letter J/G/V/E/P/C + 8 digits + 1 check digit, shown J-12345678-9 */
  function rifParts(v) {
    var s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var letter = '';
    if (/^[A-Z]/.test(s)) { letter = /^[JGVEPC]/.test(s) ? s.charAt(0) : ''; s = s.slice(1); }
    var digits = s.replace(/\D/g, '').slice(0, 9);
    return { letter: letter, digits: digits };
  }
  function rifFormat(p) {
    var out = p.letter ? p.letter + (p.digits ? '-' : '') : '';
    out += p.digits.slice(0, 8);
    if (p.digits.length > 8) out += '-' + p.digits.charAt(8);
    return out;
  }
  F.rif = {   /* dedicated RIF field: letter required */
    input: function (v) { return rifFormat(rifParts(v)); },
    validate: function (v) {
      var p = rifParts(v);
      if (!p.letter) return 'El RIF empieza con una letra: J, G, V, E, P o C.';
      if (p.digits.length !== 9) return 'El RIF lleva 8 números y un dígito verificador, por ejemplo J-12345678-9.';
      return '';
    }
  };

  /* Document number: depends on the paired «Tipo de documento» select */
  function docKind(sel) {
    var v = sel ? sel.value : 'Cédula venezolana';
    if (/rif/i.test(v)) return 'rif';
    if (/pasaporte/i.test(v)) return 'pp';
    return 'ci';
  }
  function docSelect(input) {
    var id = input.getAttribute('data-n58-doc-type');
    return id ? document.getElementById(id) : null;
  }
  F.doc = {
    input: function (v, input) {
      var k = docKind(docSelect(input));
      if (k === 'ci') return thousands(onlyDigits(v).slice(0, 8));
      if (k === 'rif') {
        var p = rifParts(v);
        /* the letter is optional here (the type already says RIF): 12345678-9 or J-12345678-9 */
        return rifFormat(p);
      }
      return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    },
    validate: function (v, input) {
      var k = docKind(docSelect(input));
      if (k === 'ci') {
        var n = onlyDigits(v).length;
        return n >= 6 && n <= 8 ? '' : 'La cédula tiene entre 6 y 8 números.';
      }
      if (k === 'rif') {
        return rifParts(v).digits.length === 9 ? '' : 'El RIF lleva 8 números y un dígito verificador, por ejemplo 12345678-9.';
      }
      return v.length >= 6 && v.length <= 12 ? '' : 'El pasaporte lleva entre 6 y 12 letras o números.';
    },
    configure: function (input) {
      var k = docKind(docSelect(input));
      var cfg = {
        ci:  { ph: '12.345.678', im: 'numeric', ml: 10, cap: 'off' },
        rif: { ph: '12345678-9', im: 'text', ml: 12, cap: 'characters' },
        pp:  { ph: 'A1234567', im: 'text', ml: 12, cap: 'characters' }
      }[k];
      input.setAttribute('placeholder', cfg.ph);
      input.setAttribute('inputmode', cfg.im);
      input.setAttribute('autocapitalize', cfg.cap);
      input.maxLength = cfg.ml;
    }
  };

  var SEP = /[\s.\-,\/]/g;
  function reformat(input, fn, evType) {
    var old = input.value;
    var pos = null;
    try { pos = input.selectionStart; } catch (e) { pos = null; }
    var sig = pos == null ? null : old.slice(0, pos).replace(SEP, '').length;
    var nv = fn(old, input);
    if (nv === old) return;
    input.value = nv;
    if (sig != null && document.activeElement === input) {
      var count = 0, i = 0;
      while (i < nv.length && count < sig) { if (!/[\s.\-,\/]/.test(nv.charAt(i))) count++; i++; }
      try { input.setSelectionRange(i, i); } catch (e) { /* type=email etc. */ }
    }
    void evType;
  }

  function runCheck(input, show) {
    var f = F[input.getAttribute('data-n58-format')];
    var msg = '';
    if (f && !input.disabled) {
      var v = input.value.trim();
      if (v !== '') msg = f.validate(v, input) || '';
    }
    input.setCustomValidity(msg);
    if (input.type === 'file') {
      var fileMsg = fileProblem(input);
      if (fileMsg) input.setCustomValidity(fileMsg);
    }
    paint(input, show);
    return input.validity.valid;
  }
  function fileProblem(input) {
    var file = input.files && input.files[0];
    if (!file) return '';
    if (file.size > 10 * 1024 * 1024) return 'El archivo pesa más de 10 MB.';
    if (!/^(image\/|application\/pdf)/.test(file.type)) return 'Adjunta una imagen o un PDF.';
    return '';
  }

  function enhanceField(input) {
    if (input.__n58field) return;
    input.__n58field = true;
    var key = input.getAttribute('data-n58-format');
    var f = F[key];
    if (key === 'doc') {
      F.doc.configure(input);
      var sel = docSelect(input);
      if (sel) sel.addEventListener('change', function () {
        F.doc.configure(input);
        reformat(input, F.doc.input);
        runCheck(input, !!input.__n58touched);
      });
    }
    if (!f) return;
    input.addEventListener('input', function () {
      reformat(input, f.input);
      runCheck(input, !!input.__n58touched);
    });
    input.addEventListener('blur', function () {
      var v = input.value.trim();
      if (f.blur) v = f.blur(v);
      if (v !== input.value) input.value = v;
      input.__n58touched = true;
      runCheck(input, true);
    });
    if (f.paste) {
      input.addEventListener('paste', function (e) {
        var cd = e.clipboardData || window.clipboardData;
        if (!cd) return;
        e.preventDefault();
        input.value = f.input(cd.getData('text'), input);
        fire(input, 'input');
      });
    }
    /* values the browser autofilled before the script ran */
    if (input.value) { reformat(input, f.input); runCheck(input, false); }
  }

  /* Text fields without a format still get the Spanish message slot + validate on blur. */
  function enhancePlain(ctl) {
    if (ctl.__n58plain || ctl.__n58field) return;
    ctl.__n58plain = true;
    var evt = (ctl.type === 'checkbox' || ctl.type === 'radio' || ctl.type === 'file' || ctl.tagName === 'SELECT') ? 'change' : 'input';
    ctl.addEventListener(evt, function () {
      if (ctl.type === 'file') ctl.setCustomValidity(fileProblem(ctl));
      if (evt === 'change') ctl.__n58touched = true;
      if (ctl.__n58touched) paint(ctl, true);   /* typing only re-checks a field that was already flagged or left */
    });
    ctl.addEventListener('blur', function () {
      if (ctl.type === 'checkbox' || ctl.type === 'radio') return;
      ctl.__n58touched = true;
      if (ctl.type === 'file') ctl.setCustomValidity(fileProblem(ctl));
      paint(ctl, true);
    });
  }

  /* File upload: the real input is visually hidden; the box shows a Spanish button (a label) and the chosen file name.
     Size / type errors come from fileProblem() through the shared slot painting. */
  var NO_FILE = 'Ningún archivo seleccionado';
  function enhanceUpload(input) {
    var box = input.closest('[data-n58-upload]');
    if (!box || input.__n58upload) return;
    input.__n58upload = true;
    var name = box.querySelector('[data-n58-upload-name]');
    input.__n58box = box;
    function sync() {
      var file = input.files && input.files[0];
      if (name) name.textContent = file ? file.name : NO_FILE;
      box.classList.toggle('has-file', !!file);
    }
    input.addEventListener('change', sync);
    input.addEventListener('focus', function () {
      var kb = true;
      try { kb = input.matches(':focus-visible'); } catch (_) { kb = true; }
      box.classList.toggle('is-focus', kb);
    });
    input.addEventListener('blur', function () { box.classList.remove('is-focus'); });
    input.__n58sync = sync;
    sync();
  }

  /* ════════════════════════════════════════════════════════════════════
     3 · CUSTOM SELECT
     ════════════════════════════════════════════════════════════════════ */
  var openSelect = null;
  var MAX_LIST = 320;   /* px; keep in step with --n58-select-max fallback in project.css */

  function enhanceSelect(sel) {
    if (sel.__n58select) return;
    sel.__n58select = true;
    var selId = ensureId(sel, 'n58-sel-');
    var wrap = el('div', 'flwr_navbar_dropdown n58-select');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('f-sr-only');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    var label = document.querySelector('label[for="' + selId + '"]');
    var labelId = label ? ensureId(label, 'n58-lbl-') : '';

    var trigger = el('button', 'flwr_field_select n58-select_trigger', {
      type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false'
    });
    trigger.id = selId + '-trigger';
    var value = el('span', 'n58-select_value');
    value.id = selId + '-value';
    trigger.appendChild(value);
    trigger.setAttribute('aria-labelledby', (labelId ? labelId + ' ' : '') + value.id);

    var list = el('ul', 'flwr_navbar_dropdown_menu n58-select_list', { role: 'listbox', tabindex: '-1', 'aria-hidden': 'true' });
    list.id = selId + '-list';
    if (labelId) list.setAttribute('aria-labelledby', labelId);
    wrap.appendChild(trigger);
    wrap.appendChild(list);
    sel.__n58trigger = trigger;

    var items = [];
    var active = -1;
    var typed = '';
    var typedTimer = null;

    function build() {
      list.innerHTML = '';
      items = [];
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        var isPh = o.value === '';
        if (isPh && sel.required) continue;     /* a required select never offers «Selecciona…» as an answer */
        var li = el('li', 'flwr_navbar_dropdown_item n58-dd_li n58-select_option' + (isPh ? ' is-placeholder' : ''), { role: 'option' });
        if (items.length < 10) li.classList.add('n58-dd_li--' + (items.length + 1));
        li.id = selId + '-opt-' + i;
        li.textContent = o.textContent;
        li.__idx = i;
        li.__label = o.textContent.trim().toLowerCase();
        if (o.disabled) { li.setAttribute('aria-disabled', 'true'); li.classList.add('is-disabled'); }
        list.appendChild(li);
        items.push(li);
      }
      sync();
    }
    function itemFor(optIndex) {
      for (var i = 0; i < items.length; i++) if (items[i].__idx === optIndex) return i;
      return -1;
    }
    function sync() {
      var o = sel.options[sel.selectedIndex];
      var isPh = !o || o.value === '';
      value.textContent = o ? o.textContent : '';
      value.classList.toggle('is-placeholder', isPh);
      for (var i = 0; i < items.length; i++) {
        var on = items[i].__idx === sel.selectedIndex;
        items[i].classList.toggle('is-selected', on);
        items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      trigger.disabled = sel.disabled;
    }
    sel.__n58sync = sync;
    function setActive(i, scroll) {
      if (active >= 0 && items[active]) items[active].classList.remove('is-active');
      active = i;
      if (i < 0 || !items[i]) { list.removeAttribute('aria-activedescendant'); return; }
      items[i].classList.add('is-active');
      list.setAttribute('aria-activedescendant', items[i].id);
      if (scroll !== false) {
        var it = items[i];
        if (it.offsetTop < list.scrollTop) list.scrollTop = it.offsetTop;
        else if (it.offsetTop + it.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = it.offsetTop + it.offsetHeight - list.clientHeight;
      }
    }
    function nextEnabled(from, dir) {
      var i = from;
      for (var n = 0; n < items.length; n++) {
        i += dir;
        if (i < 0 || i >= items.length) return from;
        if (items[i].getAttribute('aria-disabled') !== 'true') return i;
      }
      return from;
    }

    function place() {
      list.classList.remove('is-up');
      list.style.setProperty('--n58-select-max', MAX_LIST + 'px');
      var r = trigger.getBoundingClientRect();
      var vh = window.innerHeight;
      var below = vh - r.bottom - 12;
      var above = r.top - 12;
      var want = Math.min(MAX_LIST, items.length * 38 + 4);
      if (Math.max(below, above) < Math.min(want, 180)) {
        trigger.scrollIntoView({ block: 'center' });
        r = trigger.getBoundingClientRect();
        below = vh - r.bottom - 12;
        above = r.top - 12;
      }
      var up = below < want && above > below;
      list.classList.toggle('is-up', up);
      list.style.setProperty('--n58-select-max', Math.max(120, Math.min(MAX_LIST, up ? above : below)) + 'px');
    }
    /* The section that holds the field: lifted above the following sections while a list is open. */
    var host = wrap.closest ? wrap.closest('section') : null;
    function open() {
      if (trigger.disabled) return;
      if (openSelect && openSelect !== api) openSelect.close(false);
      openSelect = api;
      place();
      wrap.setAttribute('data-flwr-state', 'open');
      trigger.classList.add('is-open');
      if (host) host.classList.add('has-select-open');
      trigger.setAttribute('aria-expanded', 'true');
      list.removeAttribute('aria-hidden');
      var cur = itemFor(sel.selectedIndex);
      setActive(cur >= 0 ? cur : nextEnabled(-1, 1), false);
      list.focus({ preventScroll: true });
      if (active >= 0) {
        var it = items[active];
        list.scrollTop = Math.max(0, it.offsetTop - (list.clientHeight - it.offsetHeight) / 2);
      }
    }
    function close(refocus) {
      if (openSelect === api) openSelect = null;
      wrap.setAttribute('data-flwr-state', '');
      trigger.classList.remove('is-open');
      if (host) host.classList.remove('has-select-open');
      trigger.setAttribute('aria-expanded', 'false');
      list.setAttribute('aria-hidden', 'true');
      setActive(-1);
      if (refocus) trigger.focus({ preventScroll: true });
    }
    function choose(i) {
      if (i < 0 || !items[i] || items[i].getAttribute('aria-disabled') === 'true') return;
      var changed = sel.selectedIndex !== items[i].__idx;
      sel.selectedIndex = items[i].__idx;
      sync();
      close(true);
      if (changed) { fire(sel, 'input'); fire(sel, 'change'); }
      sel.__n58touched = true;
      paint(sel, true);
    }
    function typeahead(ch) {
      clearTimeout(typedTimer);
      typed += ch.toLowerCase();
      typedTimer = setTimeout(function () { typed = ''; }, 600);
      var start = active < 0 ? 0 : active;
      var same = typed.length > 1 && typed.split('').every(function (c) { return c === typed.charAt(0); });
      var needle = same ? typed.charAt(0) : typed;
      for (var n = 0; n < items.length; n++) {
        var i = (start + (typed.length === 1 || same ? n + 1 : n)) % items.length;
        if (items[i].__label.indexOf(needle) === 0) { setActive(i); return; }
      }
    }

    var api = { close: close, wrap: wrap };

    trigger.addEventListener('click', function () {
      if (wrap.getAttribute('data-flwr-state') === 'open') close(false); else open();
    });
    trigger.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); open(); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { open(); typeahead(k); e.preventDefault(); }
    });
    list.addEventListener('keydown', function (e) {
      var k = e.key;
      e.stopPropagation();   /* the stepper form listens for Enter on the form; the list owns its own keys */
      if (k === 'ArrowDown') { e.preventDefault(); setActive(nextEnabled(active, 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); setActive(nextEnabled(active, -1)); }
      else if (k === 'Home') { e.preventDefault(); setActive(nextEnabled(-1, 1)); }
      else if (k === 'End') { e.preventDefault(); setActive(nextEnabled(items.length, -1)); }
      else if (k === 'PageDown') { e.preventDefault(); setActive(Math.min(items.length - 1, active + 6)); }
      else if (k === 'PageUp') { e.preventDefault(); setActive(Math.max(0, active - 6)); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (k === 'Tab') { close(true); }   /* focus is back on the trigger, so Tab moves on from there */
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });   /* keep focus on the list */
    list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('.n58-select_option') : null;
      if (li) choose(items.indexOf(li));
    });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest ? e.target.closest('.n58-select_option') : null;
      if (li) { var i = items.indexOf(li); if (i !== active) setActive(i, false); }
    });
    list.addEventListener('blur', function () {
      /* focus left the listbox some other way (click elsewhere, programmatic) */
      setTimeout(function () {
        if (openSelect === api && document.activeElement !== list && document.activeElement !== trigger) close(false);
      }, 0);
    });
    if (label) label.addEventListener('click', function (e) { e.preventDefault(); trigger.focus(); });
    sel.addEventListener('change', sync);
    if (sel.form) sel.form.addEventListener('reset', function () { setTimeout(sync, 0); });

    build();
  }
  document.addEventListener('mousedown', function (e) {
    if (openSelect && !openSelect.wrap.contains(e.target)) openSelect.close(false);
  });
  window.addEventListener('resize', function () { if (openSelect) openSelect.close(false); });

  /* ════════════════════════════════════════════════════════════════════
     4 · RECLAMOS: conditional claim groups + prototype states
     ════════════════════════════════════════════════════════════════════ */
  function setGroupVisible(group, on) {
    group.hidden = !on;
    var ctls = group.querySelectorAll('input, select, textarea');
    for (var i = 0; i < ctls.length; i++) {
      ctls[i].disabled = !on;
      if (ctls[i].__n58sync) ctls[i].__n58sync();
      if (!on && ctls[i].__n58slot) paint(ctls[i], false);
    }
  }
  function initClaimGroups(form) {
    var typeSel = form.querySelector('[name="Tipo-De-Reclamo"]');
    var groups = form.querySelectorAll('[data-n58-claim]');
    if (!typeSel || !groups.length) return;
    function apply() {
      var v = typeSel.value;
      for (var i = 0; i < groups.length; i++) setGroupVisible(groups[i], groups[i].getAttribute('data-n58-claim') === v);
    }
    typeSel.addEventListener('change', apply);
    typeSel.addEventListener('input', apply);
    apply();
  }
  /* States follow the Webflow form pattern (same as N^Emprende): the form sits in div.w-form with a w-form-done and a
     w-form-fail as direct children. Webflow shows them with an inline display and hides the form; the static preview
     shows them with the hidden attribute (.n58-form_toggle[hidden]). Either way the observer below moves focus to the
     panel title once it appears. */
  function visible(node) { return !!node && getComputedStyle(node).display !== 'none'; }   /* Webflow's inline display beats [hidden] */
  function stateBlock(wrap, cls) {
    for (var i = 0; i < wrap.children.length; i++) if (wrap.children[i].classList.contains(cls)) return wrap.children[i];
    return null;
  }
  function revealState(panel) {
    var title = panel.querySelector('.flwr_alert_title') || panel;
    title.focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function initStates(form, onSubmit) {
    var wrap = form.closest('.w-form');
    if (!wrap) return;
    var done = stateBlock(wrap, 'w-form-done');
    var fail = stateBlock(wrap, 'w-form-fail');
    if (window.MutationObserver) {
      var seen = { done: false, fail: false };
      var mo = new MutationObserver(function () {
        var d = visible(done), f = visible(fail);
        if (d && !seen.done) revealState(done);
        if (f && !seen.fail) revealState(fail);
        seen.done = d; seen.fail = f;
      });
      var opts = { attributes: true, attributeFilter: ['style', 'class', 'hidden'] };
      if (done) mo.observe(done, opts);
      if (fail) mo.observe(fail, opts);
    }
    /* Inside Webflow the native handler owns submission and these states. */
    if (window.Webflow) return;
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) return;
      e.preventDefault();
      if (fail) fail.hidden = true;
      if (done) done.hidden = false;
      if (onSubmit) onSubmit(done);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     BOOT
     ════════════════════════════════════════════════════════════════════ */
  function boot() {
    var forms = document.querySelectorAll('form');
    for (var f = 0; f < forms.length; f++) {
      var form = forms[f];
      var fields = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < fields.length; i++) {
        var c = fields[i];
        if (c.type === 'submit' || c.type === 'button' || c.type === 'hidden') continue;
        if (c.tagName === 'SELECT' && c.classList.contains('flwr_field_select')) enhanceSelect(c);
        if (c.hasAttribute('data-n58-format')) enhanceField(c); else enhancePlain(c);
        if (c.type === 'file') enhanceUpload(c);
      }
      initClaimGroups(form);
    }
    var claim = document.querySelector('[data-n58-claim-form]');
    if (claim) {
      initStates(claim, function () { claim.hidden = true; });
    }
    var status = document.querySelector('[data-n58-status-form]');
    if (status) {
      /* No backend in the prototype, so a code can never be confirmed: the done panel answers «not found». */
      initStates(status, function () {
        var info = document.querySelector('[data-n58-status-info]');
        if (info) info.hidden = true;
      });
    }
  }

  /* Public hook for n58-emprende-form.js: validate one field with its format rules before a step advances. */
  window.N58Forms = {
    check: function (ctl, show) {
      if (ctl.hasAttribute('data-n58-format')) return runCheck(ctl, show !== false);
      paint(ctl, show !== false);
      return ctl.validity.valid;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
