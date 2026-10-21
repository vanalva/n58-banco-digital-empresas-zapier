/* N58 · Hairline figure "boletin" (Boletines). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Boletin: a folded bulletin lying on a plinth, its front page a headline
 * block, a picture and columns of text lines, the headline bright. Over the
 * figure the top page swings up on its back fold and opens, showing the inner
 * columns; the bright moves to the inner headline. The slider is the stiffness
 * of the swing.
 *
 * The pattern: a continuous answer (a spring on the opening), driven by how
 * near the pointer is to the figure's hit zone, which never moves.
 */
const {
  Cam, clamp, facing, fit, hull, poly, proj, prism, rings, rrect, seg, spring, stepS,
  disposer, mk, pointer, put, register, solid,
} = HL;

const PW = 76, PD = 40, T = 1.6, Z0 = 1.6, TMAX = 125 * Math.PI / 180, EDGE = 0.68, NEAR = 70;

/** Distance from a point to a convex polygon: 0 inside. */
function away(pg, [x, y]) {
  let neg = false, pos = false, d = 1e9;
  for (let i = 0; i < pg.length; i++) {
    const a = pg[i], b = pg[(i + 1) % pg.length], ex = b[0] - a[0], ey = b[1] - a[1];
    if (ex * (y - a[1]) - ey * (x - a[0]) < 0) neg = true; else pos = true;
    const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    d = Math.min(d, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
  }
  return neg && pos ? d : 0;
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();

  const C = Cam(45, 0.5, 3.35);
  const P = proj(C), front = facing(C);
  const hinge = (th) => { const c = Math.cos(th), s = Math.sin(th); return (u, v, w) => P(u, v * c - w * s, Z0 + v * s + w * c); };
  const flat = hinge(0), up = hinge(TMAX);
  fit(C, [[-7, -14, -5], [83, -14, -5], [-7, 47, -5], [83, 47, -5], [0, PD * Math.cos(TMAX) - T, Z0 + PD * Math.sin(TMAX)], [PW, PD * Math.cos(TMAX) - T, Z0 + PD * Math.sin(TMAX)]], 200, 166);

  // shapes in the page's own (u, v): v runs from the fold to the free edge
  const ln = (R, w, u0, u1, v) => seg(R(u0, v, w), R(u1, v, w));
  const rr = (R, w, u0, v0, u1, v1, r) => poly(rrect(u0, v0, u1, v1, r, 3).map((q) => R(q.u, q.v, w)));
  const hill = (R, w, u0, v0, u1, v1, flip) => "M" + [[0.12, 0.8], [0.36, 0.22], [0.56, 0.6], [0.72, 0.38], [0.9, 0.8]]
    .map(([f, k]) => R(u0 + 2 + f * (u1 - u0 - 4), v0 + 2 + (flip ? 1 - k : k) * (v1 - v0 - 4), w).map((n) => n.toFixed(2)).join(" ")).join("L");
  const cols = (R, w, vs, spans) => spans.map(([u0, u1]) => vs.map((v) => ln(R, w, u0, u1, v)).join("")).join("");
  const head = (R, w, v0) => rr(R, w, 4, v0, 72, v0 + 14, 1.5) + ln(R, w, 8, 68, v0 + 4) + ln(R, w, 8, 68, v0 + 7.5) + ln(R, w, 8, 44, v0 + 11);
  const THREE = [[4, 24], [28, 48], [52, 72]];

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-7, -14, 83, 47, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -5, 0));
  const [lr, li] = rings(0, 0, PW, PD, 3, 1.2);
  put(solid(g), prism(P, front, lr, li, 0, Z0));

  // inner page on the lower leaf: its headline, and three columns
  mk("path", { class: "nf lo", d: cols(flat, 0, [21, 24, 27, 30, 33, 36], THREE) }, g);
  const inHead = mk("path", { class: "nf", d: head(flat, 0, 3) }, g);

  // the top leaf
  const ring = rrect(0, 0, PW, PD, 3, 4), inset = rrect(1.2, 1.2, PW - 1.2, PD - 1.2, 1.8, 3);
  const leaf = solid(g);
  const outer = mk("path", { class: "nf lo" }, g), outHead = mk("path", { class: "nf hi" }, g);
  const inner = mk("path", { class: "nf lo" }, g);
  const pic = mk("path", { class: "nf" }, g);

  const sp = spring(0, { eps: 0.002 });
  let drawn = NaN, seen = null;

  function draw(a) {
    const R = hinge(TMAX * a), showOuter = TMAX * a < EDGE;
    const pts = (ring_, w) => ring_.map((q) => R(q.u, q.v, w));
    leaf.sil.setAttribute("d", poly(hull(pts(ring, 0).concat(pts(ring, T)))));
    leaf.cr.setAttribute("d", poly(pts(inset, showOuter ? T : 0)));
    if (showOuter) {
      outer.setAttribute("d", rr(R, T, 4, 3, 72, 7, 1.2) + cols(R, T, [28.5, 31.5, 34.5], [[30, 50], [54, 72]]));
      outHead.setAttribute("d", head(R, T, 10));
      pic.setAttribute("d", rr(R, T, 4, 27, 26, 37, 1.5) + hill(R, T, 4, 27, 26, 37, false));
      inner.setAttribute("d", "");
    } else {
      outer.setAttribute("d", ""); outHead.setAttribute("d", "");
      pic.setAttribute("d", rr(R, 0, 4, 22, 36, 37, 1.5) + hill(R, 0, 4, 22, 36, 37, true));
      inner.setAttribute("d", cols(R, 0, [24, 27, 30, 33, 36], [[40, 72]]) + cols(R, 0, [5, 8, 11, 14, 17], THREE));
    }
    if (showOuter !== seen) {
      seen = showOuter;
      inHead.classList.toggle("hi", !showOuter);
      read.textContent = showOuter ? "rest" : "abierto";
    }
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    if (sp.x !== drawn) { drawn = sp.x; draw(clamp(sp.x, 0, 1)); }
    return m;
  });
  bag.add(B.unregister);

  // the hit zone: the closed footprint joined to the fully open leaf
  const zone = hull([[-7, -14], [83, -14], [-7, 47], [83, 47]].map(([x, y]) => P(x, y, 0)).concat([up(0, PD, 0), up(PW, PD, 0), up(0, PD, T), up(PW, PD, T)]));

  function aim(f) {
    sp.t = f * f * (3 - 2 * f);
    B.wake();
  }
  bag.add(pointer(stage, { move: (p) => aim(1 - clamp(away(zone, p) / NEAR, 0, 1)), leave: () => aim(0) }));
  bag.add(() => svg.replaceChildren());

  draw(0); drawn = 0;
  return { set: (v) => { sp.k = v; }, destroy: bag.dispose };
}

hairline({
  name: "boletin",
  means: "Un boletín plegado sobre su base, con el titular a la vista: al acercarte se abre la hoja de arriba y muestra las columnas.",
  rules: [1, 3, 4, 5],
  range: [50, 100, 200],
  tour: [[150, 215], [215, 165], [275, 120], null],
  mount,
});
})();
