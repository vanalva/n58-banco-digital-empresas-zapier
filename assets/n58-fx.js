/* N58 FX ticker: temporary browser provider before Webflow Tasas CMS binding.
 * data-n58-fx-src="bcv" (or omitted): public official-rate provider.
 * data-n58-fx-src="https://...": read-only JSON endpoint.
 * data-n58-fx-src="": disabled; no request.
 * Both positive rates and a valid publication date are required. Failure shows
 * an unavailable message, never zero rates. Data is rendered as text only.
 * Validated values are repainted after marquee clones/rebuilds without refetching.
 */
(function () {
  'use strict';

  var BCV = {
    usd: 'https://ve.dolarapi.com/v1/dolares/oficial',
    eur: 'https://ve.dolarapi.com/v1/euros/oficial'
  };
  var CACHE_KEY = 'n58-fx-cache';
  var CACHE_MS = 30 * 60 * 1000;
  var TIMEOUT_MS = 6000;
  var bars = document.querySelectorAll('[data-n58-fx]');
  if (!bars.length) return;

  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    var lower = Object.create(null);
    Object.keys(obj).forEach(function (k) { lower[k.toLowerCase()] = obj[k]; });
    for (var i = 0; i < keys.length; i++) {
      var v = lower[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function toNumber(v) {
    if (typeof v === 'string') {
      var s = v.trim();
      if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '');
      else if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
      v = Number(s.replace(',', '.'));
    }
    return typeof v === 'number' && isFinite(v) && v > 0 && v <= 9007199254740991 ? v : null;
  }

  function money(n) {
    return 'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function day(v) {
    if (typeof v !== 'string') return null;
    var iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/);
    var local = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!iso && !local) return null;
    if (iso && v.indexOf('T') > -1 && !isFinite(Date.parse(v))) return null;
    var y = Number(iso ? iso[1] : local[3]);
    var m = Number(iso ? iso[2] : local[2]);
    var d = Number(iso ? iso[3] : local[1]);
    var date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    var now = new Date();
    if (date.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return null;
    // Keep the provider's publication day, independent of the visitor's timezone.
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d) + '/' + pad(m) + '/' + y;
  }

  function validate(v) {
    if (!v || typeof v !== 'object') throw new Error('Incomplete rate response');
    var out = { usd: toNumber(v.usd), eur: toNumber(v.eur), fecha: day(v.fecha) };
    if (out.usd === null || out.eur === null || !out.fecha) throw new Error('Invalid or incomplete rate response');
    return out;
  }

  function getJSON(url) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var opts = { cache: 'no-store', credentials: 'omit' };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('Rate request failed (HTTP ' + r.status + ')');
      return r.json();
    }).then(function (value) {
      if (timer) clearTimeout(timer);
      return value;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function fromBcv() {
    return Promise.all([getJSON(BCV.usd), getJSON(BCV.eur)]).then(function (res) {
      var usd = res[0], eur = res[1];
      if (String(pick(usd, ['moneda'])).toUpperCase() !== 'USD' ||
          String(pick(eur, ['moneda'])).toUpperCase() !== 'EUR' ||
          pick(usd, ['fuente']) !== 'oficial' || pick(eur, ['fuente']) !== 'oficial') {
        throw new Error('Unexpected rate provider response');
      }
      var usdDay = day(pick(usd, ['fechaactualizacion', 'fecha']));
      var eurDay = day(pick(eur, ['fechaactualizacion', 'fecha']));
      if (!usdDay || usdDay !== eurDay) throw new Error('Currency publication dates do not match');
      return validate({
        usd: pick(usd, ['promedio', 'venta', 'compra']),
        eur: pick(eur, ['promedio', 'venta', 'compra']),
        fecha: usdDay
      });
    });
  }

  function fromCustom(data) {
    var out = {}, src = data;
    if (Array.isArray(data)) {
      data.forEach(function (row) {
        var code = String(pick(row, ['moneda', 'currency', 'code', 'divisa']) || '').toUpperCase();
        var field = /^(USD|DOLAR|DÓLAR)$/.test(code) ? 'usd' : /^(EUR|EURO)$/.test(code) ? 'eur' : null;
        if (!field) return;
        if (out[field] !== undefined) throw new Error('Duplicate currency in rate response');
        out[field] = pick(row, ['tasa', 'rate', 'valor', 'value', 'precio', 'promedio']);
        var rowDay = day(pick(row, ['fecha', 'date', 'updatedat', 'updated_at', 'fechaactualizacion']));
        if (!rowDay || (out.fecha && out.fecha !== rowDay)) throw new Error('Currency publication dates do not match');
        out.fecha = rowDay;
      });
      return validate(out);
    }
    var nested = pick(data, ['rates', 'tasas', 'data', 'result']);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) src = nested;
    out.usd = pick(src, ['usd', 'dolar', 'dólar', 'cambio_usd', 'cambiousd', 'promedio']);
    out.eur = pick(src, ['eur', 'euro', 'cambio_eur', 'cambioeur']);
    var dateKeys = ['fecha', 'date', 'updatedat', 'updated_at', 'fechaactualizacion'];
    var suppliedDate = pick(src, dateKeys);
    out.fecha = suppliedDate !== undefined ? suppliedDate : pick(data, dateKeys);
    return validate(out);
  }

  function readCache(key) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || c.key !== key || typeof c.at !== 'number' || !isFinite(c.at)) return null;
      var age = Date.now() - c.at;
      if (age < 0 || age > CACHE_MS) return null;
      return validate(c.value);
    } catch (e) { return null; }
  }

  function writeCache(key, value) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: key, at: Date.now(), value: value })); }
    catch (e) { /* Storage is optional; the validated display still works. */ }
  }

  function write(bar, field, text) {
    var nodes = bar.querySelectorAll('[data-n58-fx-field="' + field + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  function paint(bar, value, state) {
    write(bar, 'usd', value ? money(value.usd) : state === 'loading' ? 'Consultando…' : 'No disponible');
    write(bar, 'eur', value ? money(value.eur) : state === 'loading' ? 'Consultando…' : 'No disponible');
    write(bar, 'fecha', value ? value.fecha : '—');
    bar.setAttribute('data-n58-fx-state', value ? 'live' : state);
  }

  function hydrate(bar) {
    var value = null, state = 'loading';
    function render() { paint(bar, value, state); }
    // Mobile page scripts rebuild from their original HTML. Repaint only when
    // element nodes containing FX fields appear; text writes do not retrigger us.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType === 1 && (node.matches('[data-n58-fx-field]') || node.querySelector('[data-n58-fx-field]'))) {
              render();
              return;
            }
          }
        }
      }).observe(bar, { childList: true, subtree: true });
    }
    var attribute = bar.getAttribute('data-n58-fx-src');
    var src = attribute === null ? 'bcv' : attribute.trim();
    if (!src) { state = 'disabled'; render(); return; }
    render();
    var cached = readCache(src);
    if (cached) { value = cached; render(); return; }
    var load;
    if (src === 'bcv') load = fromBcv();
    else {
      try {
        var url = new URL(src, document.baseURI);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid rate endpoint');
        load = getJSON(url.href).then(fromCustom);
      } catch (e) { load = Promise.reject(e); }
    }
    load.then(function (v) {
      value = validate(v);
      render();
      writeCache(src, value);
    }).catch(function () {
      state = 'unavailable';
      render();
      // Never log endpoint URLs, query tokens, or response content.
      if (window.console && console.warn) console.warn('[n58-fx] rates unavailable');
    });
  }

  function run() { for (var i = 0; i < bars.length; i++) hydrate(bars[i]); }
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
