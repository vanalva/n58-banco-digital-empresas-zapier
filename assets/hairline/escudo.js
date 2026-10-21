/* N58 · Hairline figure "escudo" (Ciberseguridad y Políticas de privacidad). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Escudo: a thick shield slab standing on a plinth, a small padlock in front
 * with its shackle open. Near the figure, a dashed dome rises around the
 * plinth, takes the bright stroke, and the shackle closes after it. The slider
 * is the delay before the shackle closes, in ms.
 */
const {
  Cam, facing, fillet, fit, hull, open, poly, prism, proj, rings, unproj,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const PZ = -5, CX = 36, CY = 16, R = 58;
const SX = 6, SYY = 20, SW = 40, SH = 46, TK = 6;
const LX = 64, LY = 31, LZ = 11, SR = 5.2, LEG = 5.5, UP = 8;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let delay = value;
  const C = Cam(45, 0.5, 3.33);
  fit(C, [[CX + R * 0.707, CY - R * 0.707, PZ], [CX - R * 0.707, CY + R * 0.707, PZ], [CX, CY, PZ + 1.155 * R], [78, 40, PZ], [-6, -8, PZ]], 200, 160);
  const P = proj(C), front = facing(C), S = 3;
  const c0 = P(CX, CY, PZ);

  const g = mk("g", {}, svg);
  const ring = mk("path", { class: "nf dash" }, g), arc = mk("path", { class: "nf dash" }, g);
  const [pr, pi] = rings(-6, -8, 78, 40, 6, 1.6);
  put(solid(g), prism(P, front, pr, pi, PZ, 0));

  // the shield: a convex outline in the plane y = SYY, thickened toward the back
  const shape = fillet([[0, SH], [SW, SH], [SW, SH * 0.52], [SW / 2, 0], [0, SH * 0.52]], [5, 5, 12, 3, 12]);
  const face = shape.map(([u, v]) => P(SX + u, SYY, v)), back = shape.map(([u, v]) => P(SX + u, SYY - TK, v));
  const mid = [SW / 2, SH * 0.55];
  const inset = shape.map(([u, v]) => P(SX + mid[0] + (u - mid[0]) * 0.74, SYY, mid[1] + (v - mid[1]) * 0.74));
  const hullEl = mk("path", { d: poly(hull(face.concat(back))), class: "sil hi" }, g);
  mk("path", { d: poly(face), class: "nf lo" }, g);
  mk("path", { d: poly(inset), class: "nf lo" }, g);

  // the padlock
  const [lr, li] = rings(LX - 9, LY - 5, LX + 9, LY + 5, 3, 1);
  put(solid(g), prism(P, front, lr, li, 0, LZ));
  const shackle = mk("path", { class: "nf sil" }, g);

  const dome = tween(0), lock = tween(0);
  let dd = NaN, ld = NaN, on = false;

  function draw(now) {
    const t = tval(dome, now), c = tval(lock, now);
    if (t !== dd) {
      dd = t;
      const r = R * t, e = [], a = [];
      if (t > 0.01) {
        for (let k = 0; k < 48; k++) { const q = (k / 48) * 2 * Math.PI; e.push(P(CX + r * Math.cos(q), CY + r * Math.sin(q), PZ)); }
        for (let k = 0; k <= 24; k++) { const q = (k / 24) * Math.PI; a.push([c0[0] + r * S * Math.cos(q), c0[1] - r * S * Math.sin(q)]); }
      }
      ring.setAttribute("d", e.length ? poly(e) : "");
      arc.setAttribute("d", a.length ? open(a) : "");
    }
    if (c !== ld) {
      ld = c;
      const z = LZ + (1 - c) * UP, pts = [P(LX - LEG, LY, LZ), P(LX - LEG, LY, z + 6)];
      for (let k = 1; k < 12; k++) { const q = Math.PI - (k / 12) * Math.PI; pts.push(P(LX + SR * 1.06 * Math.cos(q), LY, z + 6 + SR * Math.sin(q))); }
      pts.push(P(LX + LEG, LY, z + 6), P(LX + LEG, LY, z));
      shackle.setAttribute("d", open(pts));
    }
  }
  const B = register(stage, (_dt, now) => { draw(now); return !tdone(dome, now) || !tdone(lock, now); });
  bag.add(B.unregister);

  function setOn(v) {
    if (v === on) return;
    on = v;
    const now = performance.now();
    tset(dome, v ? 1 : 0, now, 0); tset(lock, v ? 1 : 0, now, v ? delay : 0);
    hullEl.classList.toggle("hi", !v); ring.classList.toggle("hi", v); arc.classList.toggle("hi", v);
    read.textContent = v ? "protegido" : "rest";
    B.wake();
  }
  function near(p) {
    const [x, y] = unproj(C, p[0], p[1], PZ);
    return Math.hypot(x - CX, (y - CY) * 1.0) < R + 4;
  }
  bag.add(pointer(stage, { move: (p) => setOn(near(p)), leave: () => setOn(false) }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { delay = v; }, destroy: bag.dispose };
}

hairline({
  name: "escudo",
  means: "Un escudo sobre un pedestal con un candado abierto: al acercarte se alza una cúpula protectora y el candado se cierra.",
  rules: [1, 4, 5, 9],
  range: [0, 160, 360],
  tour: [[150, 150], [230, 200], [270, 130], null],
  mount,
});
})();
