/* N58 · Hairline figure "moneda" (category pages hero and product-card coins). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Moneda: one large coin standing on its edge in a round plinth. The pointer's
 * x turns it about the vertical axis, on a spring: face-on at one end, edge-on
 * at the other. The coin's rim is the bright stroke; a milled edge shows on
 * whichever side faces the viewer. The slider is how far it can turn, in
 * degrees.
 *
 * The pattern: a continuous position (x) on one spring, as Exploded's gap.
 */
const {
  Cam, clamp, fit, hull, lerp, open, poly, proj, rad, rings, circ, prism, facing,
  spring, stepS, disposer, mk, put, solid, pointer, register, seg,
} = HL;

const RC = 36, TH = 9, ZC = RC + 5, N = 72, TICKS = 36, FACE = -34, D = [0.612, 0.612, 0.5];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let amp = value;
  const C = Cam(45, 0.5, 2.83);
  fit(C, [[-RC, -RC, ZC + RC], [RC, RC, ZC + RC], [-33, -33, 0], [33, 33, 0], [0, 0, -6]], 200, 154);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  put(solid(g), prism(P, front, circ(33, 48), circ(31.4, 48), -6, 4));

  const rim = mk("path", { class: "sil" }, g);
  const face = mk("path", { class: "nf" }, g), ring = mk("path", { class: "nf lo" }, g), ticks = mk("path", { class: "nf lo" }, g);
  const sp = spring(rad(FACE), { eps: 0.0005 });
  let drawn = NaN, act = false;

  function draw() {
    if (sp.x === drawn) return;
    drawn = sp.x;
    const f = sp.x, h = [Math.cos(f), Math.sin(f)], n = [-Math.sin(f), Math.cos(f)];
    const sgn = (n[0] + n[1]) >= 0 ? 1 : -1;   // which face looks at the viewer
    const at = (r, t, side) => P(h[0] * r * Math.cos(t) + n[0] * side, h[1] * r * Math.cos(t) + n[1] * side, ZC + r * Math.sin(t));
    const ang = (k) => k / N * Math.PI * 2;
    const ps = [];
    for (let k = 0; k < N; k++) ps.push(at(RC, ang(k), TH / 2), at(RC, ang(k), -TH / 2));
    rim.setAttribute("d", poly(hull(ps)));
    const fz = sgn * TH / 2;
    face.setAttribute("d", poly(Array.from({ length: N }, (_, k) => at(RC, ang(k), fz))));
    ring.setAttribute("d", poly(Array.from({ length: N }, (_, k) => at(RC - 5.5, ang(k), fz))));
    let d = "";
    for (let k = 0; k < TICKS; k++) {
      const t = (k + 0.5) / TICKS * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const nn = [h[0] * c, h[1] * c, s];
      if (nn[0] * D[0] + nn[1] * D[1] + nn[2] * D[2] > 0.1) d += seg(at(RC, t, fz), at(RC, t, -sgn * TH / 2));
    }
    ticks.setAttribute("d", d);
  }

  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);
  rim.classList.add("hi");
  const aim = (nx) => {
    sp.t = nx === null ? rad(FACE) : rad(-45 + (nx - 0.5) * 2 * amp);
    read.textContent = nx === null ? "rest" : String(Math.round(Math.abs(45 + (sp.t * 180 / Math.PI)))).padStart(2, "0");
    B.wake();
  };
  bag.add(pointer(stage, {
    move: (p) => aim(clamp((p[0] - 90) / 220, 0, 1)),
    leave: () => aim(null),
  }));
  bag.add(() => svg.replaceChildren());
  draw();

  return { set: (v) => { amp = v; }, destroy: bag.dispose };
}

hairline({
  name: "moneda",
  means: "Una moneda de pie sobre su base: el cursor la gira, de frente a canto, y el borde se ilumina.",
  rules: [3, 4, 5, 8],
  range: [35, 60, 85],
  tour: [[100, 200], [300, 200], [200, 140], null],
  mount,
});
})();
