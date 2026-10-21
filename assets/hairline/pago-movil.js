/* N58 · Hairline figure "pago-movil" (Pago Móvil hero, dark). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Pago móvil: two phones lying on a plinth, a dashed arc between them, and a
 * small cube of payment hanging at the top of it. The pointer near a phone
 * sends the cube over to the other one on the lift curve; where it lands, that
 * phone's screen takes the bright stroke. Leaving lets it float back up.
 *
 * The pattern: a discrete answer. One tween, a hit test on the ground plane
 * (which never moves), and a bright stroke that follows the cube.
 */
const {
  Cam, clamp, fit, lerp, prism, proj, facing, poly, open, ringAt, rrect, rings, seg, mk, put, solid, unproj,
  flatDot, place, tween, tset, tval, tdone, pointer, register, disposer,
} = HL;

const AX = 21, PH = 2.2, Z0 = PH + 4, APEX = 24, CUBE = 7.6;

/** Phones lie with their long side along world x; the pair sits side by side along y. Nothing is turned about z. */
const world = (a, b, z) => [a, b, z];
const turn = (r) => r;
/** The cube's centre at t (0 on the first phone, 1 on the second). */
const at = (t) => [lerp(-AX, AX, t), 0, Z0 + APEX * Math.sin(Math.PI * t)];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 2.55);
  const pts = [];
  for (const a of [-58, 58]) for (const b of [-46, 46]) pts.push(world(a, b, -3));
  pts.push(world(0, 0, Z0 + APEX + 6));
  fit(C, pts, 200, 172);
  const P = proj(C), front = facing(C);
  let R = value, over = null, lit = "", drawn = NaN;

  const g = mk("g", {}, svg);
  put(solid(g), prism(P, front, turn(rrect(-58, -46, 58, 46, 9, 6)), turn(rrect(-56, -44, 56, 44, 7, 6)), -3, 0));
  const screens = [];
  for (const s of [-1, 1]) {
    const b0 = s * AX, [ring, inner] = rings(-47, b0 - 17, 47, b0 + 17, 5, 1.4);
    put(solid(g), prism(P, front, turn(ring), turn(inner), 0, PH));
    const sc = turn(rrect(-43, b0 - 13.5, 33, b0 + 13.5, 2.4, 3));
    screens.push(mk("path", { d: poly(ringAt(P, sc, PH)), class: "nf lo" }, g));
    place(flatDot(g, C, 0.9, "dot m"), P(...world(39, b0, PH)));
  }
  const path = [];
  for (let k = 0; k <= 28; k++) path.push(P(...at(k / 28)));
  mk("path", { d: open(path), class: "nf dash" }, g);
  const cube = solid(g);

  const t = tween(0.5);
  function draw(now) {
    const v = tval(t, now);
    if (v === drawn) return;
    drawn = v;
    const [a, b, z] = at(v), h = CUBE / 2;
    const [ring, inner] = rings(0, 0, CUBE, CUBE, 2.2, 0.9);
    const mv = (r) => turn(r.map((p) => ({ ...p, u: p.u + a - h, v: p.v + b - h })));
    put(cube, prism(P, front, mv(ring), mv(inner), z - h, z + h));
    const who = v < 0.02 ? "a" : v > 0.98 ? "b" : "c";
    if (who !== lit) {
      lit = who;
      cube.sil.classList.toggle("hi", who === "c");
      screens[0].classList.toggle("hi", who === "a");
      screens[1].classList.toggle("hi", who === "b");
    }
  }

  const B = register(stage, (_dt, now) => { draw(now); return !tdone(t, now); });
  bag.add(B.unregister);

  function aim() {
    let to = 0.5;
    read.textContent = "rest";
    if (over) {
      const [x, y] = unproj(C, over[0], over[1], 0), a = x, b = y;
      const s = b < 0 ? -1 : 1;
      if (Math.abs(a) < 54 && Math.abs(b - s * AX) < 19 * R) { to = s < 0 ? 1 : 0; read.textContent = "envío"; }
    }
    tset(t, to, performance.now(), 0);
    B.wake();
  }
  bag.add(pointer(stage, { move: (p) => { over = p; aim(); }, leave: () => { over = null; aim(); } }));
  bag.add(() => svg.replaceChildren());
  draw(performance.now());
  return { set: (v) => { R = v; if (over) aim(); }, destroy: bag.dispose };
}

hairline({
  name: "pago-movil",
  means: "Dos teléfonos y un pago en el aire: el cursor cerca de uno lo envía al otro, que enciende su pantalla.",
  rules: [1, 4, 5, 8],
  range: [0.7, 1, 1.4],
  tour: [[120, 150], [280, 215], [200, 120], null],
  mount,
});
})();
