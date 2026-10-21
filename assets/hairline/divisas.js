/* N58 · Hairline figure "divisas" (Cuenta en Moneda Extranjera pages hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Divisas: two columns of coins on one plinth, a round-edged coin on the left
 * and a six-sided one on the right. The total never changes: the pointer's x
 * moves coins from one column to the other, each top coin floating on a
 * spring. The taller column's top coin is the bright one. The slider is the
 * total, in coins.
 *
 * The pattern: a continuous position on one spring, shared between two parts.
 */
const {
  Cam, clamp, facing, fillet, fit, lerp, proj, rings, circ, prism,
  spring, stepS, disposer, mk, put, solid, pointer, register,
} = HL;

const T = 3, R = 14, PB = 6, GAP = 25;
const sh = (ring, x) => ring.map((q) => ({ ...q, u: q.u + x }));
/** An eight-sided coin outline with rounded corners, as a ring with outward normals. Its flats run along world x and y and the two diagonals, so every edge is an isometric one. */
function hex(r, b) {
  const v = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [(r + b) * Math.cos((k + 0.5) * Math.PI / 4) * 1.082, (r + b) * Math.sin((k + 0.5) * Math.PI / 4) * 1.082]);
  return fillet(v, v.map(() => 2.4), 3).map(([u, w]) => { const l = Math.hypot(u, w); return { u, v: w, nu: u / l, nv: w / l }; });
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let total = value;
  const C = Cam(45, 0.5, 3.22);
  fit(C, [[-52, -30, -PB], [52, 30, -PB], [52, -30, -PB], [-52, 30, -PB], [-GAP, 0, 20 * T], [GAP, 0, 20 * T]], 200, 164);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-54, -28, 54, 28, 9, 2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));

  const cols = [
    { x: -GAP, ring: sh(circ(R, 32), -GAP), inner: sh(circ(R - 1.2, 32), -GAP), pile: [] },
    { x: GAP, ring: sh(hex(R, 0.8), GAP), inner: sh(hex(R - 1.2, 0.8), GAP), pile: [] },
  ];
  for (const c of cols) for (let i = 0; i < 20; i++) c.pile.push(solid(g));

  let nx = 0.62, act = false;
  const sp = spring(lerp(2.5, value - 2.5, nx), { eps: 0.005 });
  const aim = () => {
    sp.t = lerp(2.5, total - 2.5, nx);
    read.textContent = act ? String(Math.round(sp.t)).padStart(2, "0") + "·" + String(Math.round(total - sp.t)).padStart(2, "0") : "rest";
    B.wake();
  };

  function draw() {
    const h = [sp.x, total - sp.x], tall = h[0] >= h[1] ? 0 : 1;
    cols.forEach((c, ci) => c.pile.forEach((s, i) => {
      const k = Math.floor(h[ci]);
      if (i > k) { s.sil.setAttribute("d", ""); s.cr.setAttribute("d", ""); return; }
      const z = i === k ? h[ci] * T : i * T;
      put(s, prism(P, front, c.ring, c.inner, z, z + T - 0.4));
      s.sil.classList.toggle("hi", i === k && ci === tall);
    }));
  }
  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);
  bag.add(pointer(stage, {
    move: (p) => { act = true; nx = clamp((p[0] - 90) / 220, 0, 1); aim(); },
    leave: () => { act = false; nx = 0.62; aim(); },
  }));
  bag.add(() => svg.replaceChildren());
  sp.t = sp.x; draw();

  return { set: (v) => { total = v; aim(); }, destroy: bag.dispose };
}

hairline({
  name: "divisas",
  means: "Dos columnas de monedas, una redonda y otra octogonal: el cursor pasa monedas de una a la otra.",
  rules: [1, 3, 5, 8],
  range: [14, 18, 22],
  tour: [[120, 190], [280, 190], [200, 190], null],
  mount,
});
})();
