/* N58 · Hairline figure "telefono" (Productos para personas hub hero, light). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Teléfono: one phone leaning back in a cradle on a round plinth, its screen a
 * grid of twenty-four app tiles. A few stand a little proud at rest, one
 * carries the bright stroke. The pointer picks the nearest tile, by where the
 * tiles rest, and lifts it off the glass with its neighbours falling away.
 *
 * The pattern: discrete items on a field, as Baldosas, on a tilted plane.
 */
const {
  Cam, clamp, circ, fit, prism, proj, facing, poly, rad, rrect, rings, hull, mk, put, solid,
  spring, stepS, pointer, register, disposer,
} = HL;

const ZB = 6, LEAN = 5, TT = 5, W = 39, H = 74;
const COLS = 4, ROWS = 6, PITCH = 7.6, TS = 2.9, H_LOW = 1, H_UP = 2.8, LIFT = 9;
const sl = Math.sin(rad(LEAN)), cl = Math.cos(rad(LEAN));

// nothing is turned about z: the phone's width runs along world x and it leans back about x only
const world = (a, b, z) => [a, b, z];
const turn = (r) => r;
/** The share of the lift at d cells from the chosen tile, out to u = d / radius. */
const falloff = (u) => (u <= 0 ? 1 : u <= 0.5 ? 1 - u * 1.1 : u <= 1 ? 0.45 - (u - 0.5) * 0.6 : 0.1);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 2.56);
  const T = (u, v, w) => world(u, -sl * v + cl * w - 5, ZB + cl * v + sl * w);
  const pts = [];
  for (const a of [-38, 38]) for (const b of [-38, 38]) pts.push(world(a, b, -3));
  pts.push(T(0, H, TT / 2 + LIFT + 3));
  fit(C, pts, 200, 170);
  const P = proj(C), front = facing(C);
  let R = value, over = -1, under = -1, hi = -1;
  const S = (u, v, w) => P(...T(u, v, w));

  const g = mk("g", {}, svg);
  put(solid(g), prism(P, front, circ(38, 56), circ(36, 56), -3, 0));
  put(solid(g), prism(P, front, turn(rrect(-19, -4, 19, 10, 3.5, 4)), turn(rrect(-17.4, -2.4, 17.4, 8.4, 2, 4)), 0, ZB));
  const body = rrect(-W / 2, 0, W / 2, H, 9, 7);
  const bodyEl = mk("path", { class: "sil" }, g);
  bodyEl.setAttribute("d", poly(hull(body.map((p) => S(p.u, p.v, TT / 2)).concat(body.map((p) => S(p.u, p.v, -TT / 2))))));
  const face = (r, w) => poly(r.map((p) => S(p.u, p.v, w)));
  mk("path", { d: face(rrect(-W / 2 + 1.9, 1.9, W / 2 - 1.9, H - 1.9, 7.2, 6), TT / 2), class: "nf lo" }, g);
  mk("path", { d: face(rrect(-5, H - 7.4, 5, H - 4.2, 1.6, 3), TT / 2), class: "nf lo" }, g);
  mk("path", { d: face(rrect(-6, 4.2, 6, 5.4, 0.5, 2), TT / 2), class: "nf lo" }, g);

  const tiles = [];
  for (let j = ROWS - 1; j >= 0; j--) for (let i = 0; i < COLS; i++) {
    const n = j * COLS + i + 1, up = (i * 3 + j * 5) % 7 < 2;
    tiles.push({
      i, j, n, h0: up ? H_UP : H_LOW, ring: rrect((i - 1.5) * PITCH - TS, 12 + j * PITCH - TS, (i - 1.5) * PITCH + TS, 12 + j * PITCH + TS, 1.5, 3),
      inner: rrect((i - 1.5) * PITCH - TS + 0.8, 12 + j * PITCH - TS + 0.8, (i - 1.5) * PITCH + TS - 0.8, 12 + j * PITCH + TS - 0.8, 0.8, 3),
      sp: spring(up ? H_UP : H_LOW, { eps: 0.03 }), el: solid(g), drawn: NaN, lit: null, c: S((i - 1.5) * PITCH, 12 + j * PITCH, TT / 2 + H_LOW),
    });
  }
  const HIDX = tiles.findIndex((t) => t.i === 2 && t.j === 3);

  function drawTile(t, k) {
    const h = t.sp.x;
    if (h !== t.drawn) {
      t.drawn = h;
      const z0 = TT / 2, z1 = z0 + h;
      put(t.el, {
        sil: poly(hull(t.ring.map((p) => S(p.u, p.v, z0)).concat(t.ring.map((p) => S(p.u, p.v, z1))))),
        crease: poly(t.inner.map((p) => S(p.u, p.v, z1))),
      });
    }
    const on = k === hi;
    if (on !== t.lit) { t.lit = on; t.el.sil.classList.toggle("hi", on); }
  }

  const B = register(stage, (dt) => {
    let m = false;
    tiles.forEach((t, k) => { if (stepS(t.sp, dt)) m = true; drawTile(t, k); });
    return m;
  });
  bag.add(B.unregister);

  function pick(p) {
    let best = -1, d2 = 15 * 15;
    tiles.forEach((t, k) => { const d = (t.c[0] - p[0]) ** 2 + (t.c[1] - p[1]) ** 2; if (d < d2) { d2 = d; best = k; } });
    return best;
  }
  function retarget() {
    const a = over < 0 ? null : tiles[over];
    tiles.forEach((t) => { t.sp.t = a ? t.h0 + LIFT * falloff(Math.hypot(t.i - a.i, t.j - a.j) / R) : t.h0; });
    if (under !== over) {
      under = over;
      // lifted tiles are nearer the eye: paint them last
      tiles.map((t, k) => [t, k]).sort((x, y) => x[0].sp.t - y[0].sp.t || x[1] - y[1]).forEach(([t]) => g.append(t.el.g));
    }
    hi = over < 0 ? HIDX : over;
    read.textContent = a ? String(a.n).padStart(2, "0") : "rest";
    B.wake();
  }
  bag.add(pointer(stage, { move: (p) => { over = pick(p); retarget(); }, leave: () => { over = -1; retarget(); } }));
  bag.add(() => svg.replaceChildren());
  hi = HIDX;
  tiles.forEach(drawTile);
  return { set: (v) => { R = v; if (over >= 0) retarget(); }, destroy: bag.dispose };
}

hairline({
  name: "telefono",
  means: "Un teléfono con veinticuatro apps: el cursor levanta la que tiene debajo y sus vecinas se apartan.",
  rules: [1, 3, 5, 9],
  range: [1.2, 1.9, 2.8],
  tour: [[200, 120], [225, 160], [180, 185], null],
  mount,
});

})();
