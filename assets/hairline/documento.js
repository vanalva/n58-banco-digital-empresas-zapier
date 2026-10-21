/* N58 · Hairline figure "documento" (las páginas legales). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Documento: four thick sheets stacked on a plinth, a rubber stamp hovering
 * over them, its rubber pad bright. Over the figure the stamp comes down on
 * the top sheet, leaves a round seal there (the bright moves to the seal),
 * then lifts to show it. The slider is how long the stamp stays down, in ms.
 *
 * The pattern: a discrete answer (tweens, one phase after another) with a hit
 * zone that never moves: the hull of the rest pose.
 */
const {
  Cam, circ, clamp, facing, fit, hull, lerp, open, poly, proj, prism, rings, seg,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const SH = [[2, 1, 74, 47], [4, -0.5, 75, 45], [1.5, 1.5, 73, 46.5], [3.5, 0, 74.5, 46]], T = 3.4, ZT = SH.length * T;
const CX = 52, CY = 24, H0 = 26, HS = 14, ST = 9;
const LINES = [[9, 9, 36], [9, 16, 32], [9, 23, 32], [9, 30, 24], [44, 41, 68]];
const PARTS = [[10.8, 1.6, 0], [12.5, 4, 1.4], [4, 5.5, 0], [7.4, 8.5, 1.3]]; // radius, height, crease inset
const SEAL = [12, 8.8, 3];
const ring = (R, n = 36) => circ(R, n).map((q) => ({ ...q, u: q.u + CX, v: q.v + CY }));

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
  let hold = value;

  const C = Cam(45, 0.5, 3.2);
  const top = ZT + H0 + 20;
  fit(C, [[-8, -8, -5], [84, -8, -5], [-8, 54, -5], [84, 54, -5], [CX, CY, top], [CX - 12, CY - 12, top - 14]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-8, -8, 84, 54, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -5, 0));
  SH.forEach(([x0, y0, x1, y1], i) => {
    const [r, inner] = rings(x0, y0, x1, y1, 3, 1.1);
    put(solid(g), prism(P, front, r, i === SH.length - 1 ? inner : null, i * T, (i + 1) * T));
  });
  mk("path", { class: "nf lo", d: LINES.map(([x0, y, x1]) => seg(P(x0, y, ZT), P(x1, y, ZT))).join("") }, g);

  const seal = SEAL.map(() => mk("path", { class: "nf" }, g));
  const parts = PARTS.map(([R, h, b]) => ({ r: ring(R), i: b ? ring(R - b) : null, h, el: solid(g) }));

  const d = tween(0, 380), k = tween(0, 320), u = tween(0, 560);
  let drawn = [NaN, NaN], on = false, lit = null;

  function draw(lift, kv) {
    let z = ZT + lift;
    for (const p of parts) { put(p.el, prism(P, front, p.r, p.i, z, z + p.h)); z += p.h; }
    seal.forEach((el, n) => {
      const R = SEAL[n] * kv;
      el.setAttribute("d", kv < 0.03 ? "" : poly(Array.from({ length: 36 }, (_, j) => P(CX + R * Math.cos(j / 36 * 6.2832), CY + R * Math.sin(j / 36 * 6.2832), ZT))));
    });
    const sealed = kv >= 0.03;
    if (sealed !== lit) {
      lit = sealed;
      parts[3].el.sil.classList.toggle("hi", !sealed);
      seal.forEach((el) => el.classList.toggle("hi", sealed));
    }
    read.textContent = kv > 0.5 ? "sellado" : "rest";
  }

  const B = register(stage, (_dt, now) => {
    const dv = tval(d, now), kv = tval(k, now), lift = lerp(H0, 0, dv) + HS * tval(u, now);
    if (lift !== drawn[0] || kv !== drawn[1]) { drawn = [lift, kv]; draw(lift, kv); }
    return !(tdone(d, now) && tdone(k, now) && tdone(u, now));
  });
  bag.add(B.unregister);

  // the zone that engages the stamp: the rest pose's hull, which never moves
  const zone = hull([[-8, -8], [84, -8], [-8, 54], [84, 54]].map(([x, y]) => P(x, y, 0)).concat([P(CX, CY, top), P(CX - 12, CY - 12, top - 14), P(CX + 12, CY + 12, top - 14)]));

  function go(e) {
    if (e === on) return;
    on = e;
    const now = performance.now();
    tset(d, e ? 1 : 0, now, 0);
    tset(k, e ? 1 : 0, now, e ? 330 : 0);
    tset(u, e ? 1 : 0, now, e ? 380 + hold : 0);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => go(away(zone, p) < 8), leave: () => go(false) }));
  bag.add(() => svg.replaceChildren());

  draw(H0, 0); drawn = [H0, 0];
  return { set: (v) => { hold = v; }, destroy: bag.dispose };
}

hairline({
  name: "documento",
  means: "Un taco de hojas gruesas y un sello de goma: al acercarte el sello baja, deja su marca redonda y vuelve a subir.",
  rules: [1, 4, 5, 8],
  range: [0, 140, 400],
  tour: [[140, 215], [215, 170], [285, 215], null],
  mount,
});
})();
