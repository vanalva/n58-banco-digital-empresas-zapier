/* N58 · Hairline figure "tarjeta" (Tarjeta Maestro débito + empresas Obtén tu tarjeta, dark hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Tarjeta: a debit card floating over a thin round plinth. The pointer tilts
 * the card toward it on two springs; a press turns it over on the lift curve
 * to show the magnetic stripe. At rest it leans back a little, chip raised on
 * its face and the contactless arcs bright.
 *
 * The pattern: one object, a spring per axis, a discrete flip.
 */
const {
  Cam, clamp, circ, fit, lerp, rad, rrect, prism, proj, facing, poly, open, seg, mk, put, solid,
  spring, stepS, tween, tset, tval, tdone, pointer, register, disposer,
} = HL;

const W = 66, H = 42, T = 2.2, R = 5, CZ = 33;
const YAW0 = 0, PITCH0 = 5, PR = 38;

/** The card's frame at a yaw and pitch (degrees): maps (u across, v up, w out of the face) to the world.
 *  At yaw 0 the card's width runs along world x and its face looks along +y; the pitch leans it back about x. */
function frame(yaw, pitch) {
  const y = rad(yaw), a = rad(pitch), cy = Math.cos(y), sy = Math.sin(y), ca = Math.cos(a), sa = Math.sin(a);
  const e1 = [cy, sy, 0], n0 = [-sy, cy];
  const e2 = [-sa * n0[0], -sa * n0[1], ca], n = [ca * n0[0], ca * n0[1], sa];
  return [(u, v, w) => [e1[0] * u + e2[0] * v + n[0] * w, e1[1] * u + e2[1] * v + n[1] * w, CZ + e1[2] * u + e2[2] * v + n[2] * w], n];
}
const arc = (u0, v0, r) => { const o = []; for (let k = 0; k <= 8; k++) { const a = rad(-42 + 84 * k / 8); o.push([u0 + r * Math.cos(a), v0 + r * Math.sin(a)]); } return o; };

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 3.2);
  fit(C, [[-PR, -PR, -3], [PR, PR, -3], [PR, -PR, -3], [-PR, PR, -3], [0, 0, CZ + 34]], 200, 170);
  const P = proj(C), front = facing(C);
  let K = value, over = null, flipped = false, drawn = "";

  const g = mk("g", {}, svg);
  put(solid(g), prism(P, front, circ(PR, 56), circ(PR - 2.2, 56), -3, 0));
  mk("path", { d: seg(P(0, 0, 0), P(0, 0, CZ - 14)), class: "dash" }, g);
  const far = mk("path", { class: "lo" }, g), near = mk("path", { class: "sil" }, g);
  const chipB = mk("path", { class: "lo" }, g), chipT = mk("path", { class: "sil" }, g);
  const arcs = [3.5, 7.5, 11.5].map(() => mk("path", { class: "nf hi" }, g));
  const num = [0, 1].map(() => mk("path", { class: "nf lo" }, g));
  const stripe = mk("path", { class: "nf hi" }, g), panel = mk("path", { class: "nf lo" }, g);

  const yaw = spring(YAW0, { eps: 0.02 }), pitch = spring(PITCH0, { eps: 0.02 }), flip = tween(0);
  const card = rrect(-W / 2, -H / 2, W / 2, H / 2, R, 5), chip = rrect(-27, -4, -15, 7, 2.2, 3);
  const rc = P(0, 0, CZ), TILT = [24, 14];

  function draw(now) {
    const f = tval(flip, now), key = [yaw.x, pitch.x, f].map((x) => x.toFixed(2)).join();
    if (key === drawn) return;
    drawn = key;
    const [pt, n] = frame(yaw.x + f, pitch.x);
    const vis = n[0] * 0.612 + n[1] * 0.612 + n[2] * 0.5 > 0, s = vis ? 1 : -1;
    const q = (u, v, w) => P(...pt(u, v, w * s));
    const ring = (rg, w) => rg.map((p) => q(p.u, p.v, w));
    // the card is two plates: the one facing away goes down first
    far.setAttribute("d", poly(ring(card, -T / 2)));
    near.setAttribute("d", poly(ring(card, T / 2)));
    const face = q;
    chipB.setAttribute("d", vis ? poly(chip.map((p) => face(p.u, p.v, T / 2 + 0.2))) : "");
    chipT.setAttribute("d", vis ? poly(chip.map((p) => face(p.u, p.v, T / 2 + 1.8))) : "");
    arcs.forEach((el, i) => el.setAttribute("d", vis ? open(arc(14, 8, [4, 8, 12][i]).map((p) => face(p[0], p[1], T / 2 + 0.1))) : ""));
    num.forEach((el, i) => el.setAttribute("d", vis ? seg(face(-27 + i * 20, -13, T / 2 + 0.1), face(-13 + i * 20, -13, T / 2 + 0.1)) : ""));
    stripe.setAttribute("d", vis ? "" : poly([[-W / 2 + 1, 8], [W / 2 - 1, 8], [W / 2 - 1, 17], [-W / 2 + 1, 17]].map((p) => face(p[0], p[1], T / 2 + 0.1))));
    panel.setAttribute("d", vis ? "" : poly([[-24, -9], [10, -9], [10, -2], [-24, -2]].map((p) => face(p[0], p[1], T / 2 + 0.1))));
  }

  const B = register(stage, (dt, now) => {
    const a = stepS(yaw, dt), b = stepS(pitch, dt);
    draw(now);
    return a || b || !tdone(flip, now);
  });
  bag.add(B.unregister);

  function aim() {
    if (!over) { yaw.t = YAW0; pitch.t = PITCH0; read.textContent = "rest"; }
    else {
      const dx = clamp((over[0] - rc[0]) / 110, -1, 1), dy = clamp((over[1] - rc[1]) / 70, -1, 1);
      yaw.t = YAW0 - dx * TILT[0] * K; pitch.t = PITCH0 - dy * TILT[1] * K;
      read.textContent = flipped ? "reverso" : "frente";
    }
    tset(flip, flipped && over ? 180 : 0, performance.now(), 0);
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => { over = p; aim(); },
    down: (p) => { over = p; flipped = !flipped; aim(); },
    leave: () => { over = null; flipped = false; aim(); },
  }));
  bag.add(() => svg.replaceChildren());
  draw(performance.now());
  return { set: (v) => { K = v; if (over) aim(); }, destroy: bag.dispose };
}

hairline({
  name: "tarjeta",
  means: "Una tarjeta de débito flota sobre su base: se inclina hacia el cursor y, al pulsar, muestra el reverso.",
  rules: [1, 3, 5, 8],
  range: [0.6, 1, 1.4],
  tour: [[130, 150], [270, 130], [210, 200], null],
  mount,
});

})();
