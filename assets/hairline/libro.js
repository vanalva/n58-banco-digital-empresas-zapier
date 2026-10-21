/* N58 · Hairline figure "libro" (Conócenos · tarjeta Libro). Needs assets/hairline/n58-hairline.js first. */
(function () {
/**
 * Libro: an open book lying on a plinth, a page already lifting from the
 * right-hand stack, its free edge bright. The pointer is the page's tip: the
 * page is turned until its edge is under the pointer, arcing over the spine
 * with its tip trailing, and lies down on the left stack when the pointer
 * gets there. The read-out is the page. The slider is how far the tip trails.
 *
 * The pattern: a continuous answer (a spring on the turn), as Turntable; the
 * pointer is read on a fixed plane, so the page never moves it.
 */
const {
  Cam, clamp, facing, fit, lerp, open, poly, proj, prism, rings, seg, spring, stepS,
  disposer, mk, pointer, put, register, solid, unproj,
} = HL;

const PW = 40, PH = 56, HL_ = 3.6, HR = 4.6, REST = 0.7;
const S_ = [0, 8, 16, 24, 32, 37, 38.6, 40], RR = 3;

/** How far in from the page's sides it sits at s along its length: the tip's corners are round. */
const inset = (s) => (s <= PW - RR ? 0 : RR - Math.sqrt(Math.max(0, RR * RR - (s - (PW - RR)) ** 2)));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let curl = value;

  const C = Cam(45, 0.5, 3.07);
  fit(C, [[-49, -9, -8], [49, -9, -8], [49, 65, -8], [-49, 65, -8], [0, 0, 44], [0, PH, 44]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [pr, pi] = rings(-49, -9, 49, 65, 8, 2);
  put(solid(g), prism(P, front, pr, pi, -8, -2.5));
  const [cr, ci] = rings(-PW - 5, -5, PW + 5, PH + 5, 4, 1.4);
  put(solid(g), prism(P, front, cr, ci, -2.5, 0));

  // the two stacks, with their page edges as dim lines
  function stack(x0, x1, h, sides) {
    const [r, n] = rings(x0, 0, x1, PH, 1.6, 0.6), grp = mk("g", {}, g);
    put(solid(grp), prism(P, front, r, n, 0, h));
    let d = "";
    for (let z = 1.2; z < h - 0.4; z += 1.2) {
      d += seg(P(x0 + 2, PH, z), P(x1 - 2, PH, z));
      if (sides) d += seg(P(x1, 2, z), P(x1, PH - 2, z));
    }
    mk("path", { d, class: "nf lo" }, grp);
  }
  stack(-PW, -0.8, HL_, false);
  stack(0.8, PW, HR, true);

  const page = mk("path", { class: "sil" }, g), tip = mk("path", { class: "nf hi" }, g);
  const sp = spring(REST, { eps: 0.0005 });
  let drawn = NaN, over = false;

  /** The page turned by phi: its profile at each s, curled so the tip trails. */
  function draw(phi) {
    if (phi === drawn) return;
    drawn = phi;
    const zb = lerp(HR + 0.1, HL_ + 0.1, phi / Math.PI), bend = curl * 0.5 * Math.sin(phi);
    let x = 0, z = zb, prev = 0;
    const prof = S_.map((s) => {
      const ds = s - prev, th = phi - bend * (prev + ds / 2) / PW;
      x += ds * Math.cos(th); z += ds * Math.sin(th); prev = s;
      return [x, z, s];
    });
    const side = (k) => prof.map(([px, pz, s]) => P(px, k ? PH - inset(s) : inset(s), pz));
    const a = side(0), b = side(1);
    page.setAttribute("d", poly(a.concat(b.slice().reverse())));
    tip.setAttribute("d", open(a.slice(5).concat(b.slice(5).reverse())));
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw(sp.x);
    return m;
  });
  bag.add(B.unregister);

  function aim(p) {
    const [x, y] = unproj(C, p[0], p[1], HR);
    if (x < -PW - 8 || x > PW + 8 || y < -8 || y > PH + 8) return rest();
    sp.t = clamp(Math.acos(clamp(x / PW, -1, 1)), 0.08, Math.PI - 0.08);
    over = true;
    read.textContent = "pág. " + (1 + Math.round(sp.t / Math.PI * 48));
    B.wake();
  }
  function rest() {
    over = false; sp.t = REST; read.textContent = "rest"; B.wake();
  }
  void over;

  bag.add(pointer(stage, { move: aim, leave: rest }));
  bag.add(() => svg.replaceChildren());
  draw(REST);

  return { set: (v) => { curl = v; drawn = NaN; draw(sp.x); }, destroy: bag.dispose };
}

hairline({
  name: "libro",
  means: "Un libro abierto sobre su base: el cursor es la punta de una página, que se curva y pasa sobre el lomo.",
  rules: [1, 4, 5, 8],
  range: [0.4, 1, 1.8],
  tour: [[285, 205], [200, 150], [135, 145], null],
  mount,
});
})();
