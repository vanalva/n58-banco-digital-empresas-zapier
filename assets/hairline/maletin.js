/* N58 · Hairline figure "maletin" (Productos para empresas · hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Maletin: a briefcase on a plinth, lid a little ajar at rest, its clasp
 * bright. The pointer's distance to it sets how far the lid swings up on its
 * back hinge; close enough, the clasp lets go, the lid's opening edge takes
 * the bright stroke and four documents rise out of the mouth, staggered. The
 * slider is the stagger of the documents, in ms.
 *
 * The pattern: a continuous answer (a spring on the opening), as Terrain,
 * measured from the rest footprint on a fixed plane.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, lerp, open, poly, proj, prism, rad, ringAt, rings, run, spring, stepS,
  disposer, mk, pointer, put, register, solid, unproj,
} = HL;

const BX = 76, BY = 34, BH = 22, T = 8, REST = 0.11, MAXA = 70, DOCS_FROM = 40, UNDER = 32, NEAR = 40;
const DOCS = [[4, 66, 7, 21], [9, 71, 12, 17], [6, 63, 17, 14], [11, 68, 22, 11]]; // x0, x1, y, rise

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lag = value;

  const C = Cam(45, 0.5, 3.27);
  // the lid at its widest swing, so fit() keeps every pose inside the frame
  const tm = rad(MAXA), lp = (y, dz) => [y * Math.cos(tm) - dz * Math.sin(tm), BH + y * Math.sin(tm) + dz * Math.cos(tm)];
  const ext = [];
  for (const [y, dz] of [[0, 0], [0, T + 10], [BY, 0], [BY, T], [BY / 2, T + 10], [BY, -6]]) { const [yy, zz] = lp(y, dz); ext.push([0, yy, zz], [BX, yy, zz]); }
  fit(C, [[-12, -12, -5], [88, -12, -5], [88, 46, -5], [-12, 46, -5], [0, 0, 24]].concat(ext), 200, 160);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-12, -12, 88, 46, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -5, 0));
  const [br, bi] = rings(0, 0, BX, BY, 5, 1.6);
  put(solid(g), prism(P, front, br, bi, 0, BH));

  // the catch, fixed on the body's front face
  const face = (pts) => pts.map(([u, v]) => [u, v]);
  const catchPts = fillet([[34, BH - 10], [42, BH - 10], [42, BH - 3], [34, BH - 3]], [1.5, 1.5, 1.5, 1.5]);
  const hasp = fillet([[33, BH - 6], [43, BH - 6], [43, BH + T - 1.5], [33, BH + T - 1.5]], [2, 2, 2, 2]);
  const kc = mk("path", { class: "hi", d: poly(face(catchPts).map(([u, v]) => P(u, BY, v))) }, g);

  const docs = DOCS.map(([x0, x1, y, rise]) => {
    const [r] = rings(x0, y, x1, y + 2.4, 1, 0.4);
    return { r, rise, y, el: solid(g), sp: spring(0, { eps: 0.002 }), drawn: NaN };
  });

  const lid = solid(g);
  const [lr, li] = rings(0, 0, BX, BY, 5, 1.6);
  const strap = mk("path", {}, g);
  const edge = mk("path", { class: "nf" }, g);
  const kh = mk("path", { class: "hi" }, g);

  // handle: a flat band arching over the lid's middle, in lid coordinates
  const arc = [], inner = [];
  for (let k = 0; k <= 12; k++) {
    const t = Math.PI * k / 12;
    arc.push([BX / 2 + 12 * Math.cos(t), 9 * Math.sin(t)]);
    inner.push([BX / 2 + 9.4 * Math.cos(t), 6 * Math.sin(t)]);
  }
  const band = arc.concat(inner.reverse());

  const lidSp = spring(REST, { eps: 0.002 });
  let drawnA = NaN, near = false, over = null, under = false;

  function drawLid(a) {
    const th = rad(MAXA * a), cs = Math.cos(th), sn = Math.sin(th);
    const L = (x, y, z) => { const dy = y, dz = z - BH; return P(x, dy * cs - dz * sn, BH + dy * sn + dz * cs); };
    const pts = (ring, dz) => ring.map((q) => L(q.u, q.v, BH + dz));
    lid.sil.setAttribute("d", poly(hull(pts(lr, 0).concat(pts(lr, T)))));
    lid.cr.setAttribute("d", "M" + pts(run(li, front), T).map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L"));
    edge.setAttribute("d", a > 0.05 ? open(pts(run(lr, front), 0)) : "");
    strap.setAttribute("d", poly(band.map(([x, z]) => L(x, BY / 2, BH + T + z))));
    kh.setAttribute("d", poly(hasp.map(([u, v]) => L(u, BY, v))));
    // Seen from the front, the lid hides the papers until its top turns edge-on (30 degrees);
    // past that we look at its underside and the papers stand in front of it, the handle behind it.
    const wide = MAXA * a >= UNDER;
    if (wide !== under) {
      under = wide;
      if (wide) { g.insertBefore(strap, lid.g); docs.forEach((d) => g.insertBefore(d.el.g, edge)); }
      else { docs.forEach((d) => g.insertBefore(d.el.g, lid.g)); g.insertBefore(strap, edge); }
    }
  }

  // Papers wait until the lid is wide open, and are never taller than the gap under it:
  // the lid's underside over a paper standing at depth y is y * tan(angle) above the body.
  function drawDocs(a) {
    const deg = MAXA * a, k = clamp((deg - DOCS_FROM) / (MAXA - DOCS_FROM), 0, 1), tn = Math.tan(rad(deg));
    docs.forEach((d) => {
      const h = clamp(Math.min(lerp(0.6, d.rise, k), d.y * tn - 3), 0.6, d.rise);
      if (h === d.drawn) return;
      d.drawn = h;
      put(d.el, prism(P, front, d.r, null, BH, BH + h));
    });
  }

  const B = register(stage, (dt) => {
    let m = stepS(lidSp, dt);
    const a = lidSp.x;
    if (a !== drawnA) { drawnA = a; drawLid(a); drawDocs(a); }
    return m;
  });
  bag.add(B.unregister);

  function retarget() {
    let a = REST;
    near = false;
    if (over) {
      const dx = Math.max(0 - over[0], over[0] - BX, 0), dy = Math.max(0 - over[1], over[1] - BY, 0);
      const f = 1 - clamp(Math.hypot(dx, dy) / NEAR, 0, 1);
      a = REST + (1 - REST) * f * f;
      near = Math.hypot(dx, dy) < 14;
    }
    lidSp.t = a;
    edge.classList.toggle("hi", near);
    kh.classList.toggle("hi", !near);
    kc.classList.toggle("hi", !near);
    read.textContent = near ? "abierto" : "rest";
    B.wake();
  }
  void lag;

  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], BH); retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  drawLid(REST); drawDocs(REST); drawnA = REST;
  return { set: (v) => { lag = v; }, destroy: bag.dispose };
}

hairline({
  name: "maletin",
  means: "Un maletín cerrado sobre su base: al acercarte suelta el cierre, la tapa se abre y asoman cuatro documentos.",
  rules: [1, 3, 4, 5],
  range: [0, 40, 90],
  tour: [[110, 255], [200, 150], [330, 255], null],
  mount,
});
})();
