/* N58 · Hairline figure "personas" (Conócenos, tarjeta Amigos). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Personas: three abstract people on a plinth, a capsule body and a rounded
 * head each, no faces, the middle one tallest. The one nearest the pointer
 * steps forward a few units, rises a little and takes the bright stroke; the
 * others hold, and the one that had it settles back, staggered by distance on
 * the 700ms lift curve. At rest the middle person is the bright one. The
 * slider is the stagger, in ms.
 *
 * The pattern: one of many, as Riffle, with a hit test on the people's
 * resting positions (they never move out from under it).
 */
const {
  Cam, clamp, facing, fit, hull, open, poly, proj, prism, rings, circ, ringAt, rrect, run,
  tdone, tset, tval, tween, mk, pointer, put, register, disposer, solid,
} = HL;

const XS = [12, 38, 64], HS = [27, 32, 25], Y = 7, PB = 4, STEP = 6, RISE = 3;
const BW = 6.6, BD = 5.2, HR = 5.4;

const at = (ring, cx, cy) => ring.map((q) => ({ ...q, u: q.u + cx, v: q.v + cy }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;
  const C = Cam(45, 0.5, 3.70);
  fit(C, [[-8, -12, -PB], [XS[2] + 20, 26, -PB], [XS[2] + 20, -12, -PB], [-8, 26, -PB], [XS[1], Y + STEP, HS[1] + 15], [XS[0], Y, HS[0] + 12]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-10, -12, XS[2] + 22, 26, 7, 1.6);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));

  const foot = rrect(-BW, -BD, BW, BD, 4.4, 8), top = rrect(-BW + 1.3, -BD + 1, BW - 1.3, BD - 1, 3.6, 8), topIn = rrect(-BW + 2.6, -BD + 2, BW - 2.6, BD - 2, 2.4, 8);
  const hr = [circ(HR - 1.7, 20), circ(HR, 20), circ(HR - 1.7, 20)];
  const people = XS.map((x, i) => {
    const h = HS[i];
    return { i, x, h, body: solid(g), head: solid(g), a: tween(0), drawn: NaN, c: P(x, Y, h * 0.6 + 4) };
  });
  const rest = 1;
  let act = -1; // the person the pointer chose; -1 hands the bright back to the middle one

  function draw(p, k) {
    const dy = STEP * k, dz = RISE * k;
    const cx = p.x, cy = Y + dy;
    p.body.sil.setAttribute("d", poly(hull(ringAt(P, at(foot, cx, cy), dz).concat(ringAt(P, at(top, cx, cy), dz + p.h)))));
    p.body.cr.setAttribute("d", open(ringAt(P, run(at(topIn, cx, cy), front), dz + p.h)));
    const z0 = dz + p.h + 1.2, hp = at(hr[1], cx, cy);
    p.head.sil.setAttribute("d", poly(hull(ringAt(P, at(hr[0], cx, cy), z0 + 1.2).concat(ringAt(P, hp, z0 + 5.4), ringAt(P, at(hr[2], cx, cy), z0 + 9.6)))));
    p.head.cr.setAttribute("d", open(ringAt(P, run(hp, front), z0 + 5.4)));
  }

  function lit() {
    const on = act >= 0 ? act : rest;
    for (const p of people) for (const s of [p.body.sil, p.head.sil]) s.classList.toggle("hi", p.i === on);
  }

  const B = register(stage, (_dt, now) => {
    let m = false;
    for (const p of people) { const k = tval(p.a, now); if (k !== p.drawn) { p.drawn = k; draw(p, k); } if (!tdone(p.a, now)) m = true; }
    return m;
  });
  bag.add(B.unregister);

  /** The person whose resting place is nearest the pointer; -1 when it is clear of all three. */
  function hit([x, y]) {
    let best = -1, bd = 1e9;
    for (const p of people) { const d = Math.hypot(p.c[0] - x, (p.c[1] - y) * 0.8); if (d < bd) { bd = d; best = p.i; } }
    return bd < 62 ? best : -1;
  }

  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    for (const p of people) tset(p.a, p.i === a ? 1 : 0, now, Math.abs(p.i - from) * stag);
    lit();
    read.textContent = a < 0 ? "rest" : String(a + 1);
    B.wake();
  }

  for (const p of people) draw(p, 0);
  lit();
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "personas",
  means: "Tres personas sobre una peana: la más cercana al cursor da un paso al frente y se ilumina.",
  rules: [1, 2, 5, 8],
  range: [0, 60, 120],
  tour: [[130, 190], [250, 160], [190, 170], null],
  mount,
});
})();
