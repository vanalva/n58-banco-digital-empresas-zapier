/* N58 · Hairline figure "baldosas" (N^Emprende · Resultados). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Baldosas: a plinth of one hundred tiles, ten by ten. Sixty-seven stand
 * raised, the rest lie nearly flat, filled column by column from the far
 * corner. The pointer lifts the tiles around it, falling off with distance,
 * each on its own spring; the tile under it takes the bright stroke and its
 * number goes to the read-out. The slider is the radius, in cells.
 *
 * The pattern: a continuous field, as Terrain, with a rest that counts.
 */
const {
  Cam, clamp, facing, fit, prism, proj, rings, unproj, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const N = 10, CELL = 14, FOOT = 11, EXT = N * CELL, PB = 4;
const RAISED = 67, H_UP = 9, H_LOW = 1.6, LIFT = 22;

/** The share of full lift at u radii from the pointer: 1 -> .31 at 42% -> .09 at the edge and beyond. */
const falloff = (u) =>
  u <= 0 ? 1 : u <= 0.417 ? 1 - (u / 0.417) * 0.6875 : u <= 1 ? 0.3125 - ((u - 0.417) / 0.583) * 0.2185 : 0.094;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.8); // page copy: larger scale so the slab fills the frame (lab: 1.5)
  fit(C, [[-6, -6, -PB], [EXT + 6, EXT + 6, -PB], [EXT + 6, -6, -PB], [-6, EXT + 6, -PB], [0, 0, H_UP + LIFT]], 200, 170);
  const P = proj(C), front = facing(C);
  let R = value * CELL, over = null;

  const g = mk("g", {}, svg), tiles = [];
  const [pr, pi] = rings(-6, -6, EXT + 6, EXT + 6, 9, 2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  // Diagonal by diagonal from the back corner, so appending is painting back to front.
  for (let s = 0; s <= 2 * (N - 1); s++) for (let i = 0; i < N; i++) {
    const j = s - i;
    if (j < 0 || j >= N) continue;
    const n = i * N + j + 1, up = n <= RAISED, h0 = up ? H_UP : H_LOW;
    const x0 = i * CELL + (CELL - FOOT) / 2, y0 = j * CELL + (CELL - FOOT) / 2;
    const [ring, inner] = rings(x0, y0, x0 + FOOT, y0 + FOOT, 2.4, 0.8);
    tiles.push({ i, j, n, up, h0, ring, inner, sp: spring(h0, { eps: 0.04 }), el: solid(g), drawn: NaN, hi: null });
  }
  let under = null;

  function draw(t) {
    const h = Math.max(0.6, t.sp.x), hi = t.up || t === under; // page copy: the 67 stay lit while the pointer moves
    if (h !== t.drawn) { t.drawn = h; put(t.el, prism(P, front, t.ring, t.inner, 0, h)); t.hi = null; }
    if (hi !== t.hi) { t.hi = hi; t.el.sil.classList.toggle("hi", hi); }
  }

  const B = register(stage, (dt) => {
    let m = false;
    for (const t of tiles) { if (stepS(t.sp, dt)) m = true; draw(t); }
    return m;
  });
  bag.add(B.unregister);

  function retarget() {
    for (const t of tiles) {
      if (!over) { t.sp.t = t.h0; continue; }
      const dx = (t.i + 0.5) * CELL - over[0], dy = (t.j + 0.5) * CELL - over[1];
      t.sp.t = t.h0 + LIFT * falloff(Math.hypot(dx, dy) / R);
    }
    if (over) {
      const i = clamp(Math.floor(over[0] / CELL), 0, N - 1), j = clamp(Math.floor(over[1] / CELL), 0, N - 1);
      under = tiles.find((t) => t.i === i && t.j === j);
      read.textContent = String(under.n).padStart(2, "0");
    } else { under = null; read.textContent = "rest"; }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], 3); retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { R = v * CELL; if (over) retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "baldosas",
  means: "Cien baldosas, 67 elevadas: el cursor levanta las vecinas y la distancia atenúa el gesto.",
  rules: [1, 3, 5, 9],
  range: [1.5, 3, 5],
  tour: [[120, 185], [200, 150], [300, 205], null],
  mount,
});
})();
