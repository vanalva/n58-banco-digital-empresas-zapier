/* N58 · Hairline figure "cambio" (Intervencion Cambiaria pages hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Cambio: a balance on a post. The beam turns on a bright pivot and a pan
 * hangs from each end, five coins in one and three in the other. The pointer's
 * x tips the beam toward its side, on a spring; the pan that goes down takes
 * the bright stroke with the pivot. The slider is the tilt it can reach, in
 * degrees.
 *
 * The pattern: a continuous position (x) on one spring, as Exploded's gap.
 */
const {
  Cam, clamp, facing, fit, hull, lerp, open, poly, proj, rad, ringAt, rings, circ, prism,
  spring, stepS, disposer, mk, put, solid, pointer, register, seg,
} = HL;

const L = 40, HP = 62, DROP = 32, RP = 13, RC = 7.6, T = 2.6, RB = 2.2, REST = 0, COUNTS = [5, 3];
// The beam runs along world x (a = along the beam, b = across it, world y) and tips about world y: nothing is turned about z.
const W = (a, b, z) => [a, b, z];
const sh = (ring, a) => ring.map((q) => ({ ...q, u: q.u + a }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let amp = value;
  const C = Cam(45, 0.5, 3.0);
  fit(C, [W(-L - RP, 0, HP - 20 - DROP), W(L + RP, 0, HP - 20 - DROP), W(-L, 0, HP + 24), W(L, 0, HP + 24), [0, 0, -3]], 200, 168);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // base and post never move
  put(solid(g), prism(P, front, circ(17, 40), circ(15.6, 40), -3, 4));
  put(solid(g), prism(P, front, circ(3.4, 24), null, 4, HP - 4));

  const pan = circ(RP, 32), panI = circ(RP - 1.4, 32), coin = circ(RC, 28), coinI = circ(RC - 1.1, 28);
  const sides = [-1, 1].map((s, i) => {
    const strings = mk("path", { class: "nf lo" }, g), body = solid(g), coins = [];
    for (let k = 0; k < COUNTS[i]; k++) coins.push(solid(g));
    return { s, strings, body, coins };
  });
  const bar = mk("path", { class: "sil" }, g), line = mk("path", { class: "nf lo" }, g), pivot = mk("path", { class: "sil" }, g);

  const sp = spring(REST, { eps: 0.002 });
  let drawn = NaN, act = false;

  function draw() {
    const a = sp.x;
    if (a === drawn) return;
    drawn = a;
    const th = rad(a * amp), c = Math.cos(th), s = Math.sin(th);
    const end = (side) => [side * L * c, 0, HP - side * L * s];
    const dir = (r, phi, p) => W(p[0] + r * Math.cos(phi) * s, r * Math.sin(phi), p[2] + r * Math.cos(phi) * c);
    const cap = (p) => Array.from({ length: 12 }, (_, k) => P(...dir(RB, k * Math.PI / 6, p)));
    const [A, B] = [end(-1), end(1)];
    bar.setAttribute("d", poly(hull(cap(A).concat(cap(B)))));
    line.setAttribute("d", seg(P(...dir(RB * 0.4, Math.PI * 0.5, A)), P(...dir(RB * 0.4, Math.PI * 0.5, B))));
    pivot.setAttribute("d", poly(hull(Array.from({ length: 20 }, (_, k) => P(...W(5.5 * Math.cos(k * Math.PI / 10), 3.2 * (k % 2 ? 1 : -1), HP + 5.5 * Math.sin(k * Math.PI / 10)))))));
    sides.forEach((sd, i) => {
      const e = end(sd.s), z = e[2] - DROP, r = sh(pan, e[0]), ri = sh(panI, e[0]);
      // a stirrup: a yoke across the beam's end (world y) and a vertical string down to each side of the pan
      const ry = RP - 0.4, Y0 = P(e[0], -ry, e[2]), Y1 = P(e[0], ry, e[2]);
      sd.strings.setAttribute("d", seg(Y0, Y1) + seg(Y0, P(e[0], -ry, z + 2)) + seg(Y1, P(e[0], ry, z + 2)));
      put(sd.body, prism(P, front, r, ri, z, z + 2));
      sd.coins.forEach((cn, k) => put(cn, prism(P, front, sh(coin, e[0]), sh(coinI, e[0]), z + 2 + k * T, z + 2 + (k + 1) * T - 0.4)));
      sd.body.sil.classList.toggle("hi", (a > 0) === (sd.s > 0));
    });
    pivot.classList.toggle("hi", true);
  }
  // paint order: strings, pan and coins sit before the beam; the beam and pivot go last
  sides.forEach((sd) => { g.appendChild(sd.strings); g.appendChild(sd.body.g); sd.coins.forEach((cn) => g.appendChild(cn.g)); });
  [bar, line, pivot].forEach((el) => g.appendChild(el));

  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);
  const aim = (n) => {
    sp.t = n === null ? REST : clamp((n - 0.5) * 2, -1, 1);
    read.textContent = n === null ? "rest" : (sp.t < 0 ? "izq " : "der ") + String(Math.round(Math.abs(sp.t) * amp)).padStart(2, "0");
    B.wake();
  };
  bag.add(pointer(stage, {
    move: (p) => aim(clamp((p[0] - 90) / 220, 0, 1)),
    leave: () => aim(null),
  }));
  bag.add(() => svg.replaceChildren());
  draw();

  return { set: (v) => { amp = v; drawn = NaN; draw(); }, destroy: bag.dispose };
}

hairline({
  name: "cambio",
  means: "Una balanza con monedas en cada platillo: el cursor inclina la viga hacia su lado.",
  rules: [3, 5, 8, 9],
  range: [10, 16, 22],
  tour: [[110, 200], [290, 200], [200, 150], null],
  mount,
});

})();
