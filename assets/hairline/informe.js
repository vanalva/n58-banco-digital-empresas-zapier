/* N58 · Hairline figure "informe" (Informes financieros). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Informe: one report sheet lying on a plinth, a few lines of text on its
 * left and a chart of four separate bars on its right, rising toward the
 * viewer, the tallest bright. The pointer sweeps along the sheet: the bar
 * under it climbs to full height, its neighbours follow by less, staggered
 * outwards. The slider is the stagger, in ms.
 *
 * The pattern: one of many (tweens, a stagger by distance) with hit bands
 * taken from the rest poses, which never move.
 */
const {
  Cam, clamp, facing, fit, hull, poly, proj, prism, rings, seg,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const SZ = 1.2, BW = 7, BY = 16.5, PITCH = 15, BX = 31;
const REST = [10, 18, 27, 36], FULL = [18, 30, 44, 58];
const LINES = [[8, 8, 25], [8, 15, 22], [8, 22, 25], [8, 29, 17]];
const FALL = [1, 0.45, 0.15, 0];

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
  let stag = value;

  const C = Cam(45, 0.5, 3.1);
  const bx = (i) => BX + i * PITCH;
  fit(C, [[-8, -8, -5], [96, -8, -5], [-8, 48, -5], [96, 48, -5], [bx(3), BY, SZ + FULL[3]], [bx(3) + BW, BY + BW, SZ + FULL[3]]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-8, -8, 96, 48, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -5, 0));
  const [sr, si] = rings(2, 0, 86, 40, 0.8, 0.5);
  put(solid(g), prism(P, front, sr, null, 0, SZ));
  mk("path", { class: "nf lo", d: LINES.map(([x0, y, x1]) => seg(P(x0, y, SZ), P(x1, y, SZ))).join("") }, g);

  const bars = REST.map((h, i) => {
    const [r, inner] = rings(bx(i), BY, bx(i) + BW, BY + BW, 1.6, 0.7);
    return { r, inner, el: solid(g), z: tween(h), drawn: NaN, cx: P(bx(i) + BW / 2, BY + BW / 2, 0)[0] };
  });

  let act = -1;
  const paint = () => bars.forEach((b, i) => b.el.sil.classList.toggle("hi", i === (act < 0 ? 3 : act)));
  paint();

  const B = register(stage, (_dt, now) => {
    let moving = false;
    bars.forEach((b, i) => {
      const h = tval(b.z, now);
      if (h !== b.drawn) { b.drawn = h; put(b.el, prism(P, front, b.r, b.inner, SZ, SZ + h)); }
      if (!tdone(b.z, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  const zone = hull([[-8, -8], [96, -8], [-8, 48], [96, 48]].map(([x, y]) => P(x, y, 0)).concat(bars.flatMap((_, i) => [P(bx(i), BY, SZ + FULL[i]), P(bx(i) + BW, BY + BW, SZ + FULL[i])])));

  /** The bar whose rest centre is nearest the pointer's screen x; -1 off the figure. */
  function pick(p) {
    if (away(zone, p) > 8) return -1;
    let best = 0;
    bars.forEach((b, i) => { if (Math.abs(b.cx - p[0]) < Math.abs(bars[best].cx - p[0])) best = i; });
    return best;
  }

  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    bars.forEach((b, i) => {
      const f = a < 0 ? 0 : FALL[Math.min(3, Math.abs(i - a))];
      tset(b.z, REST[i] + (FULL[i] - REST[i]) * f, now, Math.abs(i - from) * stag);
    });
    paint();
    read.textContent = a < 0 ? "rest" : "0" + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(pick(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  bars.forEach((b, i) => { b.drawn = REST[i]; put(b.el, prism(P, front, b.r, b.inner, SZ, SZ + REST[i])); });
  return { set: (v) => { stag = v; }, destroy: bag.dispose };
}

hairline({
  name: "informe",
  means: "Un informe sobre su base con un gráfico de cuatro barras: la barra bajo el puntero sube y sus vecinas la siguen.",
  rules: [1, 2, 4, 5],
  range: [0, 50, 110],
  tour: [[160, 220], [225, 190], [290, 160], null],
  mount,
});
})();
