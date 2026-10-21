/* N58 · Hairline figure "limites" (Límites diarios). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Limites: a glass tube on a plinth holding a stack of coins, a dashed ring
 * round it at the daily limit. The pointer's height sets how many coins are
 * in; at the limit the ring turns solid and bright. Rest is half full, the
 * top coin bright. The slider is how fast the stack follows, as a spring
 * stiffness.
 *
 * The pattern: a continuous answer (a spring on the level), set by the
 * pointer's height alone.
 */
const {
  Cam, circ, clamp, facing, fit, hull, open, poly, proj, prism, ringAt, rings, run, spring, stepS,
  disposer, mk, pointer, put, register, solid,
} = HL;

const CX = 39, CY = 20, RT = 17, RC = 13.4, RCAP = 18.6, ZB = 3.5, ZH = 62, TC = 4.4, N = 10, REST = 5, RR = 20.6;
const ZR = ZB + N * TC;
const ring = (R, n) => circ(R, n).map((q) => ({ ...q, u: q.u + CX, v: q.v + CY }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();

  const C = Cam(45, 0.5, 3.0);
  fit(C, [[-14, -8, -5], [92, -8, -5], [-14, 48, -5], [92, 48, -5], [CX - 12, CY - 12, ZH], [CX, CY, ZH], [CX - RR, CY, ZR], [CX + RR, CY, ZR]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-14, -8, 92, 48, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -5, 0));
  put(solid(g), prism(P, front, ring(RCAP, 48), null, 0, ZB));

  // the glass: lines only, so the coins show through; the back of the foot hides behind them
  const tube = ring(RT, 48);
  mk("path", { class: "nf lo", d: open(ringAt(P, run(tube, (q) => !front(q)), ZB)) }, g);
  mk("path", { class: "nf sil", d: poly(hull(ringAt(P, tube, ZH).concat(ringAt(P, tube, ZB)))) }, g);
  mk("path", { class: "nf lo", d: poly(ringAt(P, tube, ZH)) }, g);

  const rc = ring(RC, 40), ri = ring(RC - 1.8, 40);
  const coins = Array.from({ length: N }, () => ({ el: solid(g), t: NaN }));
  const guide = mk("path", { class: "nf dash", d: poly(ringAt(P, ring(RR, 64), ZR)) }, g);

  const sp = spring(REST, { eps: 0.004 });
  let top = -1, full = null;

  function draw() {
    const lv = sp.x;
    coins.forEach((c, i) => {
      const t = clamp(lv - i, 0, 1);
      if (t === c.t) return;
      c.t = t;
      if (t < 0.03) { c.el.sil.setAttribute("d", ""); c.el.cr.setAttribute("d", ""); return; }
      put(c.el, prism(P, front, rc, ri, ZB + i * TC, ZB + (i + t) * TC));
    });
    const f = sp.t >= N - 0.05 && lv >= N - 0.6, tp = Math.ceil(lv - 0.03) - 1;
    if (f !== full || tp !== top) {
      coins.forEach((c, i) => c.el.sil.classList.toggle("hi", !f && i === tp));
      guide.setAttribute("class", f ? "nf hi" : "nf dash");
      top = tp; full = f;
    }
  }

  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);

  const yB = P(CX, CY, ZB)[1], yR = P(CX, CY, ZR)[1];
  function level(t) {
    sp.t = t;
    read.textContent = t === REST ? "rest" : t >= N - 0.05 ? "límite" : String(Math.round(t)).padStart(2, "0");
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => level(Math.max(1, clamp((yB - p[1]) / (yB - yR - 8), 0, 1) * N)),
    leave: () => level(REST),
  }));
  bag.add(() => svg.replaceChildren());

  draw();
  return { set: (v) => { sp.k = v; }, destroy: bag.dispose };
}

hairline({
  name: "limites",
  means: "Un tubo de vidrio con una pila de monedas y un aro de límite: según la altura del puntero sube la pila hasta tocar el aro.",
  rules: [3, 4, 5, 8],
  range: [40, 100, 220],
  tour: [[200, 250], [200, 170], [200, 80], null],
  mount,
});
})();
