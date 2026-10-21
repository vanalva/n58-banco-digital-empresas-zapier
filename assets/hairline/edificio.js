/* N58 · Hairline figure "edificio" (Conócenos, tarjeta Oficina). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Edificio: a compact office block on a plinth: a rounded prism with a
 * rooftop setback, a door at the foot and a grid of window recesses on its two
 * faces. One window is lit at rest. The pointer takes the window nearest it:
 * that one takes the bright stroke and swells, and its neighbours swell less,
 * each on its own spring. The read-out is floor, then column. The slider is
 * how far the swell reaches.
 *
 * The pattern: a field over discrete items, as Terrain, with a hit test on
 * the windows' resting centres (they never move).
 */
const {
  Cam, clamp, facing, fillet, fit, poly, proj, prism, rings, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const W = 44, D = 36, H = 62, PB = 4, ROWS = 4, WW = 5.4, WH = 7, Z0 = 21, ZP = 11;
const REST_WIN = "a:2:2";

/** One window rect (u, v in its face plane), scaled by k about its centre, with small rounded corners. */
const rect = (cu, cv, w, h, k) =>
  fillet([[cu - w * k / 2, cv - h * k / 2], [cu + w * k / 2, cv - h * k / 2], [cu + w * k / 2, cv + h * k / 2], [cu - w * k / 2, cv + h * k / 2]], [1, 1, 1, 1], 2);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 2.88);
  fit(C, [[-8, -8, -PB], [W + 8, D + 8, -PB], [W + 8, -8, -PB], [-8, D + 8, -PB], [11, 8, H + 8], [33, 28, H + 8]], 200, 166);
  const P = proj(C), front = facing(C);
  let reach = value * 34;

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-8, -8, W + 8, D + 8, 7, 1.6);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  const [br, bi] = rings(0, 0, W, D, 6, 1.6);
  put(solid(g), prism(P, front, br, bi, 0, H));
  const [rr, ri] = rings(11, 8, 33, 28, 4, 1.4);
  put(solid(g), prism(P, front, rr, ri, H, H + 8));

  // the door: set into the foot of the long face, under the middle two columns
  const door = fillet([[W / 2 - 4.5, 0.5], [W / 2 + 4.5, 0.5], [W / 2 + 4.5, 14], [W / 2 - 4.5, 14]], [0.8, 0.8, 4, 4], 4);
  mk("path", { class: "nf lo", d: poly(door.map(([u, v]) => P(u, D, v))) }, g);

  // windows: face a is the long face (y = D, columns along x), face b the short one (x = W, columns along y)
  const wins = [];
  for (const [face, cols] of [["a", 4], ["b", 3]]) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
      const u = 9 + c * (face === "a" ? 8.67 : 9), v = Z0 + r * ZP;
      const at = (uu, vv) => (face === "a" ? P(uu, D, vv) : P(W, uu, vv));
      wins.push({ id: `${face}:${r + 1}:${c + 1}`, r, c, u, v, at, ctr: at(u, v), el: mk("path", { class: "nf lo" }, g), sp: spring(0, { eps: 0.01 }), drawn: NaN, hi: null, lvl: null });
    }
  }
  let over = null; // the window under the pointer

  function draw(w) {
    const k = 1 + 0.85 * w.sp.x;
    if (k !== w.drawn) { w.drawn = k; w.el.setAttribute("d", poly(rect(w.u, w.v, WW, WH, k).map(([u, v]) => w.at(u, v)))); }
    const lit = over ? w === over : w.id === REST_WIN;
    const lvl = lit ? "hi" : w.sp.x > 0.12 ? "mid" : "lo";
    if (lvl !== w.lvl) {
      w.lvl = lvl;
      w.el.setAttribute("class", lit ? "nf hi" : lvl === "mid" ? "nf" : "nf lo");
    }
  }

  const B = register(stage, (dt) => {
    let m = false;
    for (const w of wins) { if (stepS(w.sp, dt)) m = true; draw(w); }
    return m;
  });
  bag.add(B.unregister);

  function aim(p) {
    let best = null, bd = 1e9;
    for (const w of wins) { const d = Math.hypot(w.ctr[0] - p[0], w.ctr[1] - p[1]); if (d < bd) { bd = d; best = w; } }
    over = bd < 34 ? best : null;
    for (const w of wins) {
      const d = over ? Math.hypot(w.ctr[0] - over.ctr[0], w.ctr[1] - over.ctr[1]) : 1e9;
      w.sp.t = over ? clamp(1 - d / (reach * 1.4 + 1), 0, 1) ** 1.5 : 0;
    }
    read.textContent = over ? `${over.r + 1}·${over.c + 1}` : "rest";
    B.wake();
  }

  bag.add(pointer(stage, { move: aim, leave: () => aim([-999, -999]) }));
  bag.add(() => svg.replaceChildren());
  for (const w of wins) draw(w);

  return {
    set: (v) => { reach = v * 34; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "edificio",
  means: "Un edificio de oficinas: el cursor ilumina la ventana más cercana y sus vecinas se ensanchan menos.",
  rules: [1, 3, 5, 9],
  range: [0.6, 1, 1.5],
  tour: [[150, 150], [255, 200], [200, 110], null],
  mount,
});
})();
