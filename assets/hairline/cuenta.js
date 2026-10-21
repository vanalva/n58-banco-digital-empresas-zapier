/* N58 · Hairline figure "cuenta" (Cuenta Corriente pages hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Cuenta: a shallow tray with a stack of coins standing in it and two more
 * lying beside it. The pointer's x sets the stack's height: the top coin
 * floats up from the pile and drops back, on a spring. The top coin is the
 * bright one. The slider is the tallest the stack can grow, in coins.
 *
 * The pattern: a continuous position (x) on one spring, as Exploded's gap.
 */
const {
  Cam, clamp, facing, fit, hull, lerp, open, poly, proj, ringAt, rrect, run, circ, prism,
  spring, stepS, disposer, mk, put, solid, pointer, register,
} = HL;

const T = 3, R = 13, WH = 7, WT = 3.4, X0 = -48, X1 = 48, Y0 = -32, Y1 = 32, MIN = 2;
const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());
const sh = (ring, x, y) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + y }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let top = value;
  const C = Cam(45, 0.5, 3.32);
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X1, Y0, 0], [X0, Y1, 0], [0, 0, 18 * T + T]], 200, 168);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, 9, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, 9 - WT, 6);
  const g = mk("g", {}, svg);

  // tray, far half: body, the rim's inner edge, the seam along the far walls
  mk("path", { d: poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), class: "sil" }, g);
  mk("path", { d: poly(ringAt(P, inner, WH)), class: "nf" }, g);
  mk("path", { d: open(ringAt(P, run(inner, (q) => !front(q)), 2)), class: "nf lo" }, g);

  const rc = circ(R, 32), ri = circ(R - 1.2, 32);
  const coin = (x, y, z) => { const s = solid(g); put(s, prism(P, front, sh(rc, x, y), sh(ri, x, y), z, z + T - 0.4)); return s; };
  coin(-30, -8, 0);
  // the stack: coins are drawn as needed, back to front is bottom to top
  const pile = [];
  for (let i = 0; i < 18; i++) pile.push(solid(g));
  coin(28, 14, 0);

  // tray, near half: one opaque piece from the rim's inner edge down to the floor
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  mk("path", { d: poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), class: "fo" }, g);
  mk("path", { d: open(oT), class: "nf lo" }, g);
  mk("path", { d: open(iF), class: "nf" }, g);
  mk("path", { d: open([oT[0], ...oB, oT[oT.length - 1]]), class: "nf sil" }, g);

  const sp = spring(lerp(MIN, value, 0.45), { eps: 0.005 });
  let nx = 0.45, drawn = NaN, act = false;

  function draw() {
    if (sp.x === drawn) return;
    drawn = sp.x;
    const k = Math.floor(sp.x);
    pile.forEach((s, i) => {
      if (i > k) { s.sil.setAttribute("d", ""); s.cr.setAttribute("d", ""); return; }
      const z = i === k ? sp.x * T : i * T;
      put(s, prism(P, front, rc, ri, z, z + T - 0.4));
      s.sil.classList.toggle("hi", i === k);
    });
  }
  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);

  const aim = () => { sp.t = lerp(MIN, top, nx); read.textContent = act ? String(Math.floor(sp.t) + 1) : "rest"; B.wake(); };
  bag.add(pointer(stage, {
    move: (p) => { act = true; nx = clamp((p[0] - 90) / 220, 0, 1); aim(); },
    leave: () => { act = false; nx = 0.45; aim(); },
  }));
  bag.add(() => svg.replaceChildren());
  draw();

  return { set: (v) => { top = v; aim(); }, destroy: bag.dispose };
}

hairline({
  name: "cuenta",
  means: "Una bandeja con una pila de monedas: la moneda superior sube y baja según la posición horizontal del cursor.",
  rules: [1, 5, 8, 9],
  range: [10, 14, 18],
  tour: [[110, 190], [290, 190], [200, 190], null],
  mount,
});
})();
