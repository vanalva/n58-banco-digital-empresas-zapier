/* N58 · Hairline figure "reloj" (Conócenos · tarjeta Tiempo). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Reloj: a round clock face on a short stem and foot, set at ten past ten,
 * its minute hand bright. The pointer is a hand's target: the minute hand
 * swings to point at it on a spring, by the short way round, and the hour
 * hand follows it at a twelfth of the turn, as a real movement would. The
 * read-out is the minute. The slider is the spring's stiffness.
 *
 * The pattern: a continuous answer (a spring on an angle), as Slow and
 * Turntable; the pointer is read on a fixed plane, so the hand never moves
 * what it is measured against.
 */
const {
  Cam, circ, clamp, facing, fit, open, prism, proj, rrect, seg, spring, stepS,
  disposer, mk, place, pointer, put, register, solid, unproj,
} = HL;

const Z0 = 20, Z1 = 26, R = 36, REST_M = 0.84, REST_H = 5.3, TAU = Math.PI * 2;

/** Heading in the world of a clock angle (clockwise from 12, 12 being the far corner on screen). */
const heading = (c) => Math.atan2(-Math.cos(c) - Math.sin(c), Math.sin(c) - Math.cos(c));
const wrap = (a) => a - TAU * Math.round(a / TAU);

/** A hand's ring: a rounded bar from -tail to len, w wide, turned to clock angle c about the centre. */
function hand(len, w, tail, c) {
  const h = heading(c), ch = Math.cos(h), sh = Math.sin(h);
  return rrect(-tail, -w / 2, len, w / 2, w / 2 - 0.2, 3).map((q) => ({
    u: q.u * ch - q.v * sh, v: q.u * sh + q.v * ch, nu: q.nu * ch - q.nv * sh, nv: q.nu * sh + q.nv * ch,
  }));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 4.88);
  const rim = [];
  for (let k = 0; k < 8; k++) rim.push([R * Math.cos(k * Math.PI / 4), R * Math.sin(k * Math.PI / 4), k < 4 ? 0 : Z1 + 10]);
  fit(C, rim.concat([[0, 0, 0], [0, 0, Z1 + 10]]), 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  put(solid(g), prism(P, front, circ(24, 56), circ(21.8, 56), 0, 4));
  put(solid(g), prism(P, front, circ(9, 32), null, 4, Z0));
  put(solid(g), prism(P, front, circ(R, 72), circ(R - 2.6, 72), Z0, Z1));

  // the quarters are ticks, the other hours dots
  let d = "";
  for (let k = 0; k < 12; k++) {
    const h = heading(k * Math.PI / 6), a = [Math.cos(h), Math.sin(h)];
    if (k % 3) place(mk("circle", { r: 1.1, class: "dot off" }, g), P(a[0] * 29, a[1] * 29, Z1));
    else d += seg(P(a[0] * 24, a[1] * 24, Z1), P(a[0] * 30, a[1] * 30, Z1));
  }
  mk("path", { d, class: "nf" }, g);

  const hr = solid(g), mn = solid(g), hub = solid(g);
  mn.sil.classList.add("hi");
  put(hub, prism(P, front, circ(4.2, 24), null, Z1, Z1 + 6.5));

  const sp = spring(REST_M, { eps: 0.0004, k: 100 * value });
  let drawn = NaN, over = false;

  function draw(x) {
    if (x === drawn) return;
    drawn = x;
    put(hr, prism(P, front, hand(19, 5, 4, REST_H + (x - REST_M) / 12), null, Z1, Z1 + 3));
    put(mn, prism(P, front, hand(30, 3.6, 5, x), null, Z1 + 3, Z1 + 5.5));
    hub.g.parentNode.appendChild(hub.g);
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw(sp.x);
    if (over) read.textContent = String(Math.round((((sp.x % TAU) + TAU) % TAU) / TAU * 60) % 60).padStart(2, "0");
    return m;
  });
  bag.add(B.unregister);

  function aim(p) {
    const [x, y] = unproj(C, p[0], p[1], Z1 + 3);
    if (Math.hypot(x, y) < 5) return;
    const c = Math.atan2((x - y) / Math.SQRT2, (-x - y) / Math.SQRT2);
    let t = sp.x + wrap(c - sp.x);
    if (Math.abs(t - REST_M) > 3 * Math.PI) t -= Math.sign(t - REST_M) * TAU;
    sp.t = t; over = true; B.wake();
  }
  function rest() {
    over = false; sp.t = REST_M; read.textContent = "rest"; B.wake();
  }

  bag.add(pointer(stage, { move: aim, leave: rest }));
  bag.add(() => svg.replaceChildren());
  draw(REST_M);

  return { set: (v) => { sp.k = 100 * v; }, destroy: bag.dispose };
}

hairline({
  name: "reloj",
  means: "Un reloj de mesa a las diez y diez: el minutero gira hacia el cursor por el camino corto y la hora lo sigue.",
  rules: [1, 4, 5, 8],
  range: [0.5, 1, 1.8],
  tour: [[330, 150], [210, 225], [110, 115], null],
  mount,
});
})();
