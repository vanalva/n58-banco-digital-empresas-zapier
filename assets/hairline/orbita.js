/* N58 · Hairline figure "orbita" (Empresas statement banner). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Orbita: ten coins on a loop around an empty centre, rising and dipping as a
 * wave runs round the ring. The pointer's x carries the whole ring round, on a
 * spring, and the coin nearest the pointer lifts and takes the bright stroke.
 * The centre stays clear. The slider is how far the ring can travel, in degrees.
 *
 * The pattern: a continuous position on one spring, plus one of many chosen
 * from the target pose, never from the pose on screen.
 */
const {
  Cam, clamp, fit, lerp, poly, proj, rad, circ, prism, facing, unproj,
  spring, stepS, disposer, mk, put, solid, pointer, register,
} = HL;

const N = 10, RO = 62, RC = 13, T = 4, Z0 = 4, WAVE = 5, UP = 11, A0 = Math.PI / 4;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value;
  const C = Cam(45, 0.5, 2.45);
  fit(C, [[-RO - RC, -RO - RC, 0], [RO + RC, RO + RC, 0], [-RO - RC, RO + RC, 0], [RO + RC, -RO - RC, 0], [0, 0, Z0 + WAVE + UP + T]], 200, 168);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  mk("path", { d: poly(circ(RO, 72).map((q) => P(q.u, q.v, 0))), class: "nf dash" }, g);

  const base = circ(RC, 32), baseI = circ(RC - 1.1, 32);
  const coins = Array.from({ length: N }, (_, i) => ({ i, s: solid(g), up: spring(i === 0 ? UP : 0, { eps: 0.01 }), hi: null }));
  const th = spring(0, { eps: 0.0005 });
  let nx = 0.5, pick = 0, key = "";
  const at = (i, a) => { const t = A0 + i * 2 * Math.PI / N + a; return [RO * Math.cos(t), RO * Math.sin(t), Z0 + WAVE * Math.sin(2 * t)]; };

  function draw() {
    const pos = coins.map((c) => ({ c, p: at(c.i, th.x) })).sort((a, b) => a.p[0] + a.p[1] - b.p[0] - b.p[1]);
    const k = pos.map((q) => q.c.i).join();
    if (k !== key) { key = k; pos.forEach((q) => g.appendChild(q.c.s.g)); }
    for (const { c, p } of pos) {
      const z = p[2] + c.up.x, sh = (r) => r.map((q) => ({ ...q, u: q.u + p[0], v: q.v + p[1] }));
      put(c.s, prism(P, front, sh(base), sh(baseI), z, z + T));
      const hi = c.i === pick;
      if (hi !== c.hi) { c.hi = hi; c.s.sil.classList.toggle("hi", hi); }
    }
  }
  const B = register(stage, (dt) => {
    let m = stepS(th, dt);
    for (const c of coins) if (stepS(c.up, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);

  function aim(p) {
    if (p) {
      nx = clamp((p[0] - 90) / 220, 0, 1);
      th.t = rad((nx - 0.5) * 2 * reach);
      // pick from the target pose: the coin whose target position is nearest the pointer on the orbit's plane
      const w = unproj(C, p[0], p[1], Z0);
      let best = 0, bd = 1e9;
      coins.forEach((c) => { const q = at(c.i, th.t); const d = Math.hypot(q[0] - w[0], q[1] - w[1]); if (d < bd) { bd = d; best = c.i; } });
      pick = best;
      read.textContent = String(pick + 1).padStart(2, "0");
    } else { th.t = 0; pick = 0; read.textContent = "rest"; }
    coins.forEach((c) => { c.up.t = c.i === pick ? UP : 0; });
    B.wake();
  }
  bag.add(pointer(stage, { move: aim, leave: () => aim(null) }));
  bag.add(() => svg.replaceChildren());
  draw();

  return { set: (v) => { reach = v; }, destroy: bag.dispose };
}

hairline({
  name: "orbita",
  means: "Diez monedas giran en un anillo alrededor de un centro vacío: el cursor las arrastra y levanta la más cercana.",
  rules: [1, 2, 5, 8],
  range: [40, 90, 150],
  tour: [[110, 150], [290, 150], [200, 215], null],
  mount,
});
})();
