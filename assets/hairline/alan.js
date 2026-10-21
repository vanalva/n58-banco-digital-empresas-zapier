/* N58 · Hairline figure "alan" (FAQ hero and Conócenos, dark sections). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * AlaN: N58's assistant as the art director drew it. A rounded-cube head with a
 * ball antenna, closed happy eyes and a smile, on a short neck; a horizontal
 * capsule body along x with a wheel cap at +x, a small screen, a button and a
 * triangle on its front; one jointed arm rising from the -x end to a three
 * finger hand, waving. The bright stroke is the outer silhouette of the head's
 * far edges, arm, fingers, cap and neck. The pointer is something it greets:
 * the arm swings on a spring toward it, the hand follows a beat later on a
 * second spring and the fingers spread, and the head turns a little its way.
 *
 * The pattern: a continuous answer (where), springs, no hit test at all.
 */
const {
  Cam, circ, clamp, facing, fit, hull, open, poly, proj, ringAt, rrect, run, seg,
  spring, stepS, mk, pointer, register, disposer,
} = HL;

const R = 15, L = 52, CR = 12, CL = 6; // body radius, length, cap radius, cap length
const HX = 36, HW = 44, HD = 34, HB = 30, HT = 72, HR = 9; // head
const AMP = 24, LAT = [0.707, -0.707, 0], V = [0.612, 0.612, 0.5];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const basis = (d) => { const t = unit(d), e = unit(cross(t, Math.abs(t[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])); return [e, cross(t, e)]; };
const ctrl = (a, w) => [[2, 0, 9], [-30, 0, 9], [-40 + LAT[0] * a * 0.4, LAT[1] * a * 0.4, 34], [-17 + LAT[0] * w, LAT[1] * w, 62 - Math.abs(w) * 0.12]];
const bz = (c, t) => { const m = 1 - t; return [0, 1, 2].map((i) => m * m * m * c[0][i] + 3 * m * m * t * c[1][i] + 3 * m * t * t * c[2][i] + t * t * t * c[3][i]); };
const shift = (ring, du, dv) => ring.map((q) => ({ ...q, u: q.u + du, v: q.v + dv }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 2.26);
  const ex = [[-34, 5, 60], [64, 12, 0], [10, 18, -14], [HX, 0, HT + 21], [11, -17, 40], [61, 17, 40], [-55, 0, 30]];
  for (const s of [-AMP, AMP]) for (let k = 0; k <= 4; k++) ex.push(bz(ctrl(s, s), k / 4), bz(ctrl(s, s), 1).map((v, i) => v + [s * 0.7, -s * 0.7, 34][i]), bz(ctrl(s, s), 1).map((v, i) => v + [s * 0.7 + 17, -s * 0.7 - 17, 20][i]));
  fit(C, ex, 200, 166);
  const P = proj(C), front = facing(C);
  let amp = value;

  const ring3 = (c, [e1, e2], r, n = 28) => {
    const o = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.2832, ca = Math.cos(a), sa = Math.sin(a), d = [0, 1, 2].map((i) => e1[i] * ca + e2[i] * sa);
      o.push({ s: P(c[0] + r * d[0], c[1] + r * d[1], c[2] + r * d[2]), vis: d[0] * V[0] + d[1] * V[1] + d[2] * V[2] > 0 });
    }
    return o;
  };
  const pts = (r) => r.map((q) => q.s), vis = (r) => run(r, (q) => q.vis).map((q) => q.s);
  const XB = [[0, 1, 0], [0, 0, 1]], ZB = [[1, 0, 0], [0, 1, 0]];
  const cyl = (c0, c1, b, r) => poly(hull(pts(ring3(c0, b, r)).concat(pts(ring3(c1, b, r)))));
  // outer edges of a hull that face right, up or down: the bright part
  const hiEdges = (h) => {
    const cx = h.reduce((s, p) => s + p[0], 0) / h.length, cy = h.reduce((s, p) => s + p[1], 0) / h.length;
    let d = "";
    h.forEach((a, i) => {
      const b = h[(i + 1) % h.length], ex2 = b[0] - a[0], ey = b[1] - a[1], n = Math.hypot(ex2, ey) || 1;
      let nx = ey / n; const ny = -ex2 / n;
      if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) nx = -nx;
      if (nx > -0.15) d += seg(a, b);
    });
    return d;
  };

  const g = mk("g", {}, svg);
  const armEl = mk("path", { class: "hi" }, g), joints = mk("path", { class: "nf sil" }, g);

  mk("path", { class: "hi", d: cyl([-4, 0, 9], [1, 0, 9], XB, 7.3) }, g);
  mk("path", { class: "nf sil", d: open(vis(ring3([-4, 0, 9], XB, 7.3))) }, g);
  // body: a capsule along x, a wheel cap at +x, the marks on its front
  const bodyHull = hull(pts(ring3([0, 0, 0], XB, R)).concat(pts(ring3([L, 0, 0], XB, R))));
  mk("path", { class: "sil", d: poly(bodyHull) }, g);
  mk("path", { class: "nf lo", d: open(vis(ring3([4, 0, 0], XB, R))) }, g);
  mk("path", { class: "nf hi", d: poly(pts(ring3([L, 0, 0], XB, R, 48))) }, g);
  mk("path", { class: "hi", d: cyl([L, 0, 0], [L + CL, 0, 0], XB, CR) }, g);
  mk("path", { class: "nf sil", d: poly(pts(ring3([L + CL, 0, 0], XB, CR, 48))) }, g);
  const surf = (a) => open(a.map(([x, s]) => P(x, R * Math.cos(s / R), R * Math.sin(s / R))));
  const screen = fillet4([[6, 3.7], [19, 3.7], [19, 9.4], [6, 9.4]]);
  mk("path", { class: "nf sil", d: surf(screen.concat([screen[0]])) }, g);
  const dsk = (x, s, r) => Array.from({ length: 21 }, (_, k) => [x + r * Math.cos(k * 0.314), s + r * Math.sin(k * 0.314)]);
  mk("path", { class: "nf sil", d: surf(dsk(11, -3.7, 3)) }, g);
  mk("path", { class: "nf lo", d: surf(dsk(11, -3.7, 1.7)) }, g);
  mk("path", { class: "nf sil", d: surf([[22.5, -2.6], [24.4, -5.6], [20.6, -5.6], [22.5, -2.6]]) }, g);
  // neck
  mk("path", { class: "hi", d: cyl([HX, 0, 14.5], [HX, 0, HB], ZB, 6.5) }, g);

  // head
  const hr = rrect(HX - HW / 2, -HD / 2, HX + HW / 2, HD / 2, HR, 6), hi0 = rrect(HX - HW / 2 + 1.8, -HD / 2 + 1.8, HX + HW / 2 - 1.8, HD / 2 - 1.8, HR - 1.8, 6);
  const rot = (ring, a) => { const c = Math.cos(a), s = Math.sin(a); return ring.map((q) => ({ u: HX + (q.u - HX) * c - q.v * s, v: (q.u - HX) * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c })); };
  const head = mk("path", { class: "sil" }, g), headHi = mk("path", { class: "nf hi" }, g), headCr = mk("path", { class: "nf hi" }, g);
  const eyes = [0, 1].map(() => mk("path", { class: "dot m" }, g)), smile = mk("path", { class: "nf sil" }, g);
  mk("path", { class: "hi", d: cyl([HX, 0, HT], [HX, 0, HT + 16], ZB, 1.1) }, g);
  const ball = mk("ellipse", { class: "hi" }, g);
  { const q = P(HX, 0, HT + 19.5); ball.setAttribute("cx", q[0]); ball.setAttribute("cy", q[1]); ball.setAttribute("rx", 3 * C.S * 0.97); ball.setAttribute("ry", 3 * C.S * 0.97); }

  // hand: three fingers behind a palm
  const fing = [0, 1, 2].map(() => ({ s: mk("path", { class: "hi" }, g), t: mk("path", { class: "nf sil" }, g) }));
  const palm = mk("path", { class: "sil" }, g), palmHi = mk("path", { class: "nf hi" }, g), palmCr = mk("path", { class: "nf lo" }, g);

  const a = spring(0, { eps: 0.002 }), w = spring(0, { eps: 0.002 }), sp = spring(0, { eps: 0.002 }), psi = spring(0, { eps: 0.0005 });
  let last = "";

  function draw() {
    const key = [a.x, w.x, sp.x, psi.x].map((n) => n.toFixed(3)).join();
    if (key === last) return;
    last = key;
    const c = ctrl(a.x, w.x);
    // arm: a tube in the x-z plane, two ring joints
    const L2 = [], R2 = [], N = 24, r = 5 * C.S;
    for (let k = 0; k <= N; k++) {
      const t = k / N, p = P(...bz(c, t)), p0 = P(...bz(c, Math.max(0, t - 0.01))), q = P(...bz(c, Math.min(1, t + 0.01)));
      const n = Math.hypot(q[0] - p0[0], q[1] - p0[1]) || 1, dx = (q[0] - p0[0]) / n, dy = (q[1] - p0[1]) / n;
      L2.push([p[0] - dy * r, p[1] + dx * r]); R2.push([p[0] + dy * r, p[1] - dx * r]);
    }
    armEl.setAttribute("d", poly(L2.concat(R2.reverse())));
    let jd = "";
    for (const t of [0.33, 0.66]) for (const e of [-0.02, 0.02]) {
      const tt = t + e, p = bz(c, tt), q = bz(c, tt + 0.01), o = bz(c, tt - 0.01);
      jd += open(vis(ring3(p, basis([q[0] - o[0], q[1] - o[1], q[2] - o[2]]), 5.5)));
    }
    joints.setAttribute("d", jd);
    // palm: a rounded block that leans with the wrist, fingers fanned in the screen plane
    const lx = LAT[0] * w.x * 0.2, ly = LAT[1] * w.x * 0.2, px = c[3][0], py = c[3][1], zb = c[3][2] - 3, zt = c[3][2] + 12;
    const foot = rrect(px - 6.5, py - 5, px + 6.5, py + 5, 4.5, 6), mid = rrect(px - 8, py - 6.5, px + 8, py + 6.5, 6, 6), top = shift(rrect(px - 6.5, py - 5, px + 6.5, py + 5, 4.5, 6), lx, ly);
    const inner = shift(rrect(px - 4.5, py - 3.4, px + 4.5, py + 3.4, 3, 4), lx, ly);
    const ph = hull(ringAt(P, foot, zb).concat(ringAt(P, mid, zb + 5), ringAt(P, top, zt)));
    palm.setAttribute("d", poly(ph)); palmHi.setAttribute("d", hiEdges(ph));
    palmCr.setAttribute("d", open(ringAt(P, run(inner, front), zt)));
    [[-5, -0.05], [1, 0.62], [6, 1.15]].forEach(([off, u], i) => {
      const uu = u * (1 + 0.55 * sp.x), d = unit([uu, -uu, 1]), b = basis(d), o = [px + lx + LAT[0] * off, py + ly + LAT[1] * off, zt - 2];
      const e = [o[0] + d[0] * 12, o[1] + d[1] * 12, o[2] + d[2] * 12];
      fing[i].s.setAttribute("d", cyl(o, e, b, 2.8));
      fing[i].t.setAttribute("d", poly(pts(ring3(e, b, 2.8))));
    });
    // head: turns about its own vertical axis; the face sits on its front
    const ang = psi.x, ca = Math.cos(ang), sa = Math.sin(ang), hh = rot(hr, ang), hn = rot(hi0, ang);
    const hl = hull(ringAt(P, hh, HB).concat(ringAt(P, hh, HT)));
    head.setAttribute("d", poly(hl)); headHi.setAttribute("d", hiEdges(hl));
    headCr.setAttribute("d", open(ringAt(P, run(hn, front), HT)));
    const F = (u, z) => P(HX + u * ca - (HD / 2 + 0.3) * sa, u * sa + (HD / 2 + 0.3) * ca, z);
    eyes.forEach((el, i) => {
      const cu = i ? 8.5 : -8.5, up = [], dn = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16, s = 1 - (2 * t - 1) ** 2, m = 54 + 3.4 * s, h = 2 * s ** 0.4; up.push(F(cu - 4.5 + 9 * t + 1.5, m + h)); dn.push(F(cu - 4.5 + 9 * t + 1.5, m - h)); }
      el.setAttribute("d", poly(up.concat(dn.reverse())));
    });
    smile.setAttribute("d", open(Array.from({ length: 11 }, (_, k) => { const u = -8 + 1.6 * k, s = 1 - (u / 8) ** 2; return F(u + 1.5, 44 - 3.2 * s); })));
  }

  const B = register(stage, (dt) => {
    w.t = a.x;
    let m = false;
    for (const s of [a, w, sp, psi]) if (stepS(s, dt)) m = true;
    draw();
    return m;
  });
  bag.add(B.unregister);
  draw();

  const hand = P(-17, 0, 74), headS = P(HX, 0, 54);
  bag.add(pointer(stage, {
    move: (p) => {
      a.t = clamp((p[0] - hand[0]) / 130, -1, 1) * AMP * amp;
      sp.t = clamp(1 - Math.hypot(p[0] - hand[0], p[1] - hand[1]) / 170, 0, 1) * 1.1;
      psi.t = clamp((p[0] - headS[0]) / 140, -1, 1) * 0.3 * amp;
      read.textContent = "saluda";
      B.wake();
    },
    leave: () => { a.t = sp.t = psi.t = 0; read.textContent = "rest"; B.wake(); },
  }));
  bag.add(() => svg.replaceChildren());

  return { set: (v) => { amp = v; }, destroy: bag.dispose };
}

function fillet4(p) {
  return HL.fillet(p, [1.2, 1.2, 1.2, 1.2], 3);
}

hairline({
  name: "alan",
  means: "AlaN, el asistente de N58: saluda con el brazo hacia el cursor, abre los dedos y gira la cabeza para mirarte.",
  rules: [1, 5, 8],
  range: [0.5, 1, 1.5],
  tour: [[173, 71], [255, 160], [232, 270], null],
  mount,
});
})();
