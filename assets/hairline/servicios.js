/* N58 · Hairline figure "servicios" (Pago de Servicios · hero). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Servicios: five receipts stand on a plinth like cards, each a different
 * height, one bright. The pointer pays the one under it: that receipt sinks
 * into the plinth to a flat tab, a check draws itself in front of it, and the
 * others part from it, staggered outwards. The slider is the stagger, in ms.
 *
 * The pattern: discrete items, as Riffle. Tweens, a stagger by distance, and
 * a hit test on the rest positions (a fixed plane, never the pose on screen).
 */
const {
  Cam, clamp, facing, fit, lerp, open, prism, proj, rings, seg,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid, unproj,
} = HL;

const N = 5, PITCH = 21, SW = 16, Y0 = 2, Y1 = 7, HT = [30, 38, 34, 41, 29], SUNK = 6, LEAD = 3, APART = 5;
const CHECK = [[-16, -2], [-5, 12], [19, -17]];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  const C = Cam(45, 0.5, 3.35);
  fit(C, [[-10, -6, -6], [110, -6, -6], [110, 24, -6], [-10, 24, -6], [0, Y0, 41], [105, Y0, 41]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-10, -6, 110, 24, 6, 1.8);
  put(solid(g), prism(P, front, pr, pi, -6, 0));

  // back to front: nearer receipts sit at larger x
  const slabs = [];
  for (let i = 0; i < N; i++) {
    const grp = mk("g", {}, g);
    const el = solid(grp), ln = mk("path", { class: "nf lo" }, grp);
    slabs.push({ i, x0: i * PITCH, h0: HT[i], a: tween(0), o: tween(0), el, ln, key: "" });
  }
  slabs[LEAD].el.sil.classList.add("hi");
  const chk = mk("path", { class: "nf hi" }, g);

  let act = -1, last = LEAD, chkKey = "";

  function draw(s, now) {
    const h = lerp(s.h0, SUNK, tval(s.a, now)), dx = tval(s.o, now), key = h.toFixed(2) + "/" + dx.toFixed(2);
    if (key === s.key) return;
    s.key = key;
    const xa = s.x0 + dx, [r, n] = rings(xa, Y0, xa + SW, Y1, 2.2, 0.8);
    put(s.el, prism(P, front, r, n, 0, h));
    let d = "";
    [[8, 3], [14, 3], [20, 7]].forEach(([f, cut]) => { if (h - f > 3) d += seg(P(xa + 3, Y1, h - f), P(xa + SW - cut, Y1, h - f)); });
    s.ln.setAttribute("d", d);
  }

  function drawCheck(now) {
    const s = slabs[last], p = clamp(tval(s.a, now), 0, 1), dx = tval(s.o, now);
    const key = last + "/" + p.toFixed(3) + "/" + dx.toFixed(2);
    if (key === chkKey) return;
    chkKey = key;
    if (p < 0.02) { chk.setAttribute("d", ""); return; }
    const A = P(s.x0 + dx + SW / 2, 17.5, 0), pts = CHECK.map(([x, y]) => [A[0] + x, A[1] + y - 4]);
    const l1 = Math.hypot(CHECK[1][0] - CHECK[0][0], CHECK[1][1] - CHECK[0][1]);
    const l2 = Math.hypot(CHECK[2][0] - CHECK[1][0], CHECK[2][1] - CHECK[1][1]);
    const t = p * (l1 + l2), out = [pts[0]];
    if (t <= l1) out.push([lerp(pts[0][0], pts[1][0], t / l1), lerp(pts[0][1], pts[1][1], t / l1)]);
    else out.push(pts[1], [lerp(pts[1][0], pts[2][0], (t - l1) / l2), lerp(pts[1][1], pts[2][1], (t - l1) / l2)]);
    chk.setAttribute("d", open(out));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const s of slabs) { draw(s, now); if (!tdone(s.a, now) || !tdone(s.o, now)) moving = true; }
    drawCheck(now);
    return moving;
  });
  bag.add(B.unregister);

  /** The receipt at the point, from the rest positions on a fixed mid-height plane; -1 off the row. */
  function hit(p) {
    const [x, y] = unproj(C, p[0], p[1], 18);
    if (y < -16 || y > 36 || x < -12 || x > (N - 1) * PITCH + SW + 12) return -1;
    return clamp(Math.round((x - SW / 2) / PITCH), 0, N - 1);
  }

  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    if (a >= 0) last = a;
    slabs.forEach((s, i) => {
      const delay = Math.abs(i - from) * stag;
      tset(s.a, i === a ? 1 : 0, now, i === a ? 0 : delay);
      tset(s.o, a < 0 || i === a ? 0 : Math.sign(i - a) * (APART / Math.abs(i - a)), now, delay);
      s.el.sil.classList.toggle("hi", a < 0 ? i === LEAD : i === a);
    });
    read.textContent = a < 0 ? "rest" : "pago " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return { set: (v) => { stag = v; }, destroy: bag.dispose };
}

hairline({
  name: "servicios",
  means: "Cinco recibos de servicios en pie: el que toca el cursor se paga, se hunde en la base y marca un visto.",
  rules: [1, 2, 4, 8],
  range: [0, 45, 90],
  tour: [[165, 123], [257, 169], [303, 192], null],
  mount,
});
})();
