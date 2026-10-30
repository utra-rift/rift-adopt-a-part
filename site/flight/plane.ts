// A single-aisle airliner (A320 class, no livery) built as many small solids for the
// drawing look: paper surfaces, ink outlines, creases and panel seams.
//
// Frame: metres, x forward (nose tip at +18.8), y up, z to starboard. The model is built at
// rest; the strip banks and drifts it as one group.
//
// Every part is a list of triangles with a material id (aMat) and a leading-edge weight
// (aEdge, where the airflow glows first). Seams are line segments with a tone. The caller
// merges everything into a few draw calls.

export const MAT = { paper: 0, glass: 1, red: 2, green: 3, strobe: 4, hot: 5, duct: 6, fan: 7 };
export const TONE = { ink: 0, crease: 1, seam: 2 };

const X0 = 18.8, LEN = 37.6, R = 1.98, RY = 2.07, NOSE = 6.2;
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ fuselage section
// d is the distance aft of the nose tip; the section is an ellipse (yc, ry, rz).
function section(d) {
  if (d < NOSE) {
    const t = 1 - d / NOSE;
    const f = Math.pow(1 - Math.pow(t, 2.15), 1 / 2.15);
    return { yc: -0.42 * t * t, ry: RY * f, rz: R * f };
  }
  let top = RY, bot = -RY, half = R;
  if (d > 23.5) bot = -RY + (RY + 0.72) * Math.pow((d - 23.5) / (LEN - 23.5), 1.5);
  if (d > 28) top = RY - (RY - 1.05) * Math.pow((d - 28) / (LEN - 28), 1.8);
  if (d > 27) half = 0.3 + (R - 0.3) * Math.pow(1 - Math.pow((d - 27) / (LEN - 27), 1.7), 0.8);
  return { yc: (top + bot) / 2, ry: (top - bot) / 2, rz: half };
}
// θ = 0 is starboard, π/2 the crown.
function fus(d, th, off = 0) {
  const s = section(d);
  return [X0 - d, s.yc + (s.ry + off) * Math.sin(th), (s.rz + off) * Math.cos(th)];
}
const thAt = (d, y) => Math.asin(clamp((y - section(d).yc) / section(d).ry, -1, 1));

// ------------------------------------------------------------------ builders
export function buildPlane() {
  const parts = [];   // { pos: number[], idx: number[], mat, edge: number[] | null, aura, crease }
  const lines = [];   // flat [x,y,z, x,y,z, ...] pairs with a tone per segment
  const tones = [];
  let count = 0;      // distinct parts, for the report

  // A surface sampled on a (u, v) grid. fn(i, j) -> [x, y, z]; wrapV closes the v loop.
  function grid(nu, nv, fn, { wrapV = false, mat = MAT.paper, edgeFn = null, aura = false, crease = 32, flip = false } = {}) {
    const pos = [], edge = edgeFn ? [] : null, idx = [];
    const cols = wrapV ? nv : nv + 1;
    for (let i = 0; i <= nu; i++) for (let j = 0; j < cols; j++) {
      pos.push(...fn(i, j));
      if (edge) edge.push(edgeFn(i, j));
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = (i + 1) * cols + j, d = (i + 1) * cols + ((j + 1) % cols);
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const p = { pos, idx, mat, edge, aura, crease };
    parts.push(p); count++;
    return p;
  }
  // Mirror a part to port (z -> -z), keeping the winding outward.
  function mirror(p, { counted = true } = {}) {
    const pos = p.pos.slice();
    for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i];
    const idx = [];
    for (let i = 0; i < p.idx.length; i += 3) idx.push(p.idx[i], p.idx[i + 2], p.idx[i + 1]);
    const q = { ...p, pos, idx, edge: p.edge && p.edge.slice() };
    parts.push(q); if (counted) count++;
    return q;
  }
  function seg(a, b, tone = TONE.seam) { lines.push(...a, ...b); tones.push(tone); }
  function poly(pts, tone = TONE.seam, closed = false) {
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], tone);
    if (closed) seg(pts[pts.length - 1], pts[0], tone);
  }
  const mz = (pts) => pts.map(([x, y, z]) => [x, y, -z]);
  function polyBoth(pts, tone = TONE.seam, closed = false) { poly(pts, tone, closed); poly(mz(pts), tone, closed); }

  // A body of revolution about an axis parallel to x through (cy, cz); prof is [[x, r], ...].
  function lathe(prof, cy, cz, { seg: n = 40, mat = MAT.paper, aura = false, edgeFn = null, sz = 1 } = {}) {
    return grid(prof.length - 1, n, (i, j) => {
      const a = (j / n) * TAU, [x, r] = prof[i];
      return [x, cy + r * Math.sin(a), cz + r * Math.cos(a) * sz];
    }, { wrapV: true, mat, aura, edgeFn: edgeFn && ((i) => edgeFn(prof[i])) });
  }
  // A flat annulus in the plane x = const (an exit ring, a fan face).
  function annulus(x, cy, cz, r0, r1, mat, n = 40, facing = -1) {
    return grid(1, n, (i, j) => {
      const a = (j / n) * TAU, r = i ? r1 : r0;
      return [x, cy + r * Math.sin(a), cz + r * Math.cos(a)];
    }, { wrapV: true, mat, flip: facing > 0 });
  }
  // An ellipsoid (belly fairing, light domes).
  function ellipsoid(c, r, { mat = MAT.paper, n = 28, m = 16, aura = false, flatBelow = null } = {}) {
    return grid(m, n, (i, j) => {
      const ph = -Math.PI / 2 + (i / m) * Math.PI, th = (j / n) * TAU;
      let y = c[1] + r[1] * Math.sin(ph);
      if (flatBelow != null) y = Math.max(y, flatBelow);
      return [c[0] + r[0] * Math.cos(ph) * Math.sin(th), y, c[2] + r[2] * Math.cos(ph) * Math.cos(th)];
    }, { wrapV: true, mat, aura });
  }

  // A lofted lifting surface. sec(s) -> { le, chord, cdir, tdir, t, camber }; the section
  // runs from the trailing edge over the top to the leading edge and back under.
  const J = 14;
  const fOf = (j) => { // j in 0..2J -> chord fraction from the LE and side (+1 upper)
    const q = j <= J ? 1 - j / J : (j - J) / J;
    return [(1 - Math.cos(Math.PI * q)) / 2, j <= J ? 1 : -1];
  };
  function airfoil(S, f, side) {
    const t = S.t, yt = 5 * t * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1036 * f ** 4);
    const yc = 4 * (S.camber ?? 0.02) * f * (1 - f);
    const h = (yc + side * yt) * S.chord, c = f * S.chord;
    return [S.le[0] + S.cdir[0] * c + S.tdir[0] * h, S.le[1] + S.cdir[1] * c + S.tdir[1] * h, S.le[2] + S.cdir[2] * c + S.tdir[2] * h];
  }
  function loft(ss, sec, { aura = true, edge = true, cap = false } = {}) {
    const p = grid(ss.length - 1, 2 * J, (i, j) => { const [f, side] = fOf(j); return airfoil(sec(ss[i]), f, side); },
      { wrapV: true, aura, edgeFn: edge ? (i, j) => 1 - sstep(0.0, 0.1, fOf(j)[0]) : null });
    if (cap) { // close the far end with a fan
      const S = sec(ss[ss.length - 1]), base = p.pos.length / 3, ring = (ss.length - 1) * 2 * J;
      p.pos.push(...airfoil(S, 0.42, 1).map((v, k) => (v + airfoil(S, 0.42, -1)[k]) / 2));
      if (p.edge) p.edge.push(0);
      for (let j = 0; j < 2 * J; j++) p.idx.push(ring + j, ring + ((j + 1) % (2 * J)), base);
    }
    return p;
  }
  // Points on a loft surface, pushed off it a little, for seams.
  const onLoft = (sec, s, f, side, off = 0.014) => {
    const S = sec(s), a = airfoil(S, f, side);
    return [a[0] + S.tdir[0] * off * side, a[1] + S.tdir[1] * off * side, a[2] + S.tdir[2] * off * side];
  };
  const loftLine = (sec, s0, s1, f, side, tone = TONE.seam, n = 10) => {
    const pts = []; for (let k = 0; k <= n; k++) pts.push(onLoft(sec, mix(s0, s1, k / n), typeof f === "function" ? f(mix(s0, s1, k / n)) : f, side));
    return pts;
  };

  // Something on the fuselage skin, in (d, θ): a filled decal (window) or an outline (door).
  function decal(dc, thc, hw, hh, { r = 0.5, mat = MAT.glass, rings = 3, n = 20, off = 0.012 } = {}) {
    const outline = roundRect(hw, hh, r, n);
    const pos = [], idx = [];
    const at = (u, v) => fus(dc + u, thc + v / section(dc + u).ry, off);
    pos.push(...at(0, 0));
    for (let k = 1; k <= rings; k++) for (const [u, v] of outline) pos.push(...at((u * k) / rings, (v * k) / rings));
    const m = outline.length;
    for (let j = 0; j < m; j++) idx.push(0, 1 + j, 1 + ((j + 1) % m));
    for (let k = 1; k < rings; k++) {
      const a0 = 1 + (k - 1) * m, b0 = 1 + k * m;
      for (let j = 0; j < m; j++) { const j1 = (j + 1) % m; idx.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1); }
    }
    parts.push({ pos, idx, mat, edge: null, aura: false, crease: 0 }); count++;
  }
  function outlineOn(dc, thc, hw, hh, r = 0.15, tone = TONE.crease) {
    const pts = roundRect(hw, hh, r, 24).map(([u, v]) => fus(dc + u, thc + v / section(dc + u).ry, 0.012));
    poly(pts, tone, true);
    return pts;
  }
  function roundRect(hw, hh, r, n) {
    const rr = Math.min(r, hw, hh), pts = [];
    const corners = [[hw - rr, hh - rr, 0], [-hw + rr, hh - rr, 1], [-hw + rr, -hh + rr, 2], [hw - rr, -hh + rr, 3]];
    const per = Math.max(2, Math.round(n / 4));
    for (const [cx, cy, q] of corners) for (let k = 0; k <= per; k++) {
      const a = (q + k / per) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    return pts;
  }

  // ================================================================ fuselage
  const ds = [];
  for (let k = 0; k <= 40; k++) ds.push(0.004 + (NOSE - 0.004) * Math.pow(k / 40, 1.7));
  for (let d = NOSE + 0.8; d < 23.5; d += 0.8) ds.push(d);
  for (let d = 23.5; d < LEN - 0.01; d += 0.35) ds.push(d);
  ds.push(LEN);
  const NT = 96;
  grid(ds.length - 1, NT, (i, j) => fus(ds[i], (j / NT) * TAU), {
    wrapV: true, aura: true, crease: 0,
    edgeFn: (i) => 1 - sstep(0.4, 2.4, ds[i]),
  });
  // tail cone end: the APU exhaust, a short pipe with a dark bore
  {
    const s = section(LEN);
    lathe([[X0 - LEN + 0.02, s.rz * 0.92], [X0 - LEN - 0.32, s.rz * 0.8], [X0 - LEN - 0.34, s.rz * 0.68]], s.yc, 0, { seg: 28, sz: 1 });
    annulus(X0 - LEN - 0.33, s.yc, 0, 0.0, s.rz * 0.68, MAT.duct, 28);
  }
  // cockpit windscreen and side panes, both sides
  const panes = [[2.62, 1.28, 0.3, 0.2], [3.32, 0.88, 0.31, 0.24], [3.92, 0.66, 0.21, 0.2]];
  for (const [dc, thc, hw, hh] of panes) {
    for (const t of [thc, Math.PI - thc]) { decal(dc, t, hw, hh * section(dc).ry, { r: 0.06, rings: 4 }); outlineOn(dc, t, hw + 0.04, hh * section(dc).ry + 0.04, 0.08); }
  }
  // the centre post between the front panes, and the eyebrow
  for (const t of [Math.PI / 2 - 0.12, Math.PI / 2 + 0.12]) { const p = []; for (let d = 2.25; d <= 2.95; d += 0.05) p.push(fus(d, t, 0.012)); poly(p, TONE.crease); }

  // passenger windows at 21" pitch, skipping doors and over-wing exits
  const doors = [[4.6, 5.42], [29.95, 30.77]], exits = [[14.9, 15.42], [15.82, 16.34]];
  const thWin = thAt(15, 0.42);
  for (let d = 6.9; d < 29.6; d += 0.533) {
    if (exits.some(([a, b]) => d > a - 0.22 && d < b + 0.22)) continue;
    for (const t of [thWin, Math.PI - thWin]) decal(d, t, 0.115, 0.165, { r: 0.08, rings: 2, n: 16 });
  }
  // doors, over-wing exits, cargo doors (outlines with a handle tick)
  for (const [a, b] of doors) for (const t of [thAt((a + b) / 2, 0.2), Math.PI - thAt((a + b) / 2, 0.2)]) {
    outlineOn((a + b) / 2, t, (b - a) / 2, 0.95, 0.18, TONE.crease);
    decal((a + b) / 2, t + 0.12, 0.06, 0.12, { r: 0.04, rings: 1, n: 8, mat: MAT.glass, off: 0.013 }); // door window
  }
  for (const [a, b] of exits) for (const t of [thAt((a + b) / 2, 0.36), Math.PI - thAt((a + b) / 2, 0.36)]) {
    outlineOn((a + b) / 2, t, (b - a) / 2, 0.5, 0.12, TONE.crease);
    decal((a + b) / 2, t, 0.115, 0.165, { r: 0.08, rings: 2, n: 16 });
  }
  for (const [a, b] of [[8.5, 10.3], [24.1, 25.9]]) outlineOn((a + b) / 2, thAt((a + b) / 2, -1.28), (b - a) / 2, 0.45, 0.1, TONE.crease);
  // nose gear doors on the belly
  for (const s of [-1, 1]) {
    const p = []; for (let d = 3.4; d <= 6.0; d += 0.2) p.push(fus(d, -Math.PI / 2 + s * 0.17, 0.012)); poly(p, TONE.crease);
  }
  { const p = []; for (let d = 3.4; d <= 6.0; d += 0.2) p.push(fus(d, -Math.PI / 2, 0.012)); poly(p, TONE.seam); }

  // belly (wing-to-body) fairing and its gear doors
  const BF = { c: [X0 - 16.6, -1.52, 0], r: [6.9, 0.92, 2.28] };
  ellipsoid(BF.c, BF.r, { aura: true, n: 40, m: 18 });
  const onBF = (u, v) => { // u along (-1..1), v round from the keel (rad)
    const x = BF.c[0] + BF.r[0] * u, k = Math.sqrt(Math.max(0, 1 - u * u));
    return [x, BF.c[1] - BF.r[1] * k * Math.cos(v) * 1.01, BF.c[2] + BF.r[2] * k * Math.sin(v) * 1.01];
  };
  for (const s of [-1, 1]) {
    const p = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU; p.push(onBF(-0.02 + 0.26 * Math.cos(a), s * (0.62 + 0.4 * Math.sin(a)))); }
    poly(p, TONE.crease);
  }
  { const p = []; for (let u = -0.9; u <= 0.9; u += 0.1) p.push(onBF(u, 0)); poly(p); }

  // antennas: blade aerials on the crown and the belly, pitot probes and AoA vanes
  function blade(d, up, h = 0.32, c = 0.42) {
    const s = section(d), y0 = s.yc + (up ? s.ry : -s.ry) - (up ? 0.05 : -0.05), g = up ? 1 : -1;
    const sec = (q) => ({ le: [X0 - d - 0.25 * q, y0 + g * h * q, 0], chord: mix(c, c * 0.55, q), cdir: [-1, 0, 0], tdir: [0, 0, 1], t: 0.14, camber: 0 });
    loft([0, 0.5, 1], sec, { aura: false, edge: false, cap: true });
  }
  blade(8.6, true); blade(13.2, true, 0.22, 0.5); blade(21.5, true); blade(10.5, false); blade(26.4, false, 0.26);
  for (const s of [-1, 1]) {
    const [x, y, z] = fus(2.35, s > 0 ? -0.1 : Math.PI + 0.1);
    lathe([[x + 0.02, 0.025], [x - 0.02, 0.025]], y, z, { seg: 8 });
    const tip = [x + 0.12, y - 0.01, z + s * 0.16];
    seg([x, y, z], tip, TONE.ink); count++;
    const [ax, ay, az] = fus(3.1, s > 0 ? 0.25 : Math.PI - 0.25);
    seg([ax, ay, az], [ax - 0.1, ay, az + s * 0.11], TONE.ink); seg([ax - 0.1, ay, az + s * 0.11], [ax - 0.18, ay, az + s * 0.11], TONE.ink); count++;
  }

  // ================================================================ wings
  const DIH = Math.tan((5.1 * Math.PI) / 180);
  const WP = [[1.4, 6.05, -0.8, 0.152], [1.9, 5.8, -0.8, 0.15], [6.3, 3.55, -1.05, 0.13], [16.9, -1.8, -3.35, 0.105]];
  function wingSec(z) {
    let a = WP[0], b = WP[1];
    for (let k = 0; k < WP.length - 1; k++) if (z >= WP[k][0]) { a = WP[k]; b = WP[k + 1]; }
    const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    const le = mix(a[1], b[1], t), te = mix(a[2], b[2], t);
    return { le: [le, -1.0 + (z - 1.9) * DIH, z], chord: le - te, cdir: [-1, 0, 0], tdir: [0, 1, 0], t: mix(a[3], b[3], t), camber: 0.022 };
  }
  const wz = [1.4, 1.9, 2.6, 3.4, 4.2, 5.0, 5.7, 6.3, 7.4, 8.6, 9.8, 11, 12.2, 13.4, 14.6, 15.8, 16.9];
  const WSEC = (s) => wingSec(s);
  const wing = loft(wz, WSEC, { aura: true });
  mirror(wing);
  const tipS = wingSec(16.9), tipY = tipS.le[1];
  // sharklet: blends up from the tip and sweeps back
  const PHI = (76 * Math.PI) / 180, RHO = 0.75, LUP = 2.05;
  function shark(w) {
    let ph, y, z;
    if (w < 0.38) { ph = PHI * (w / 0.38); y = tipY + RHO * (1 - Math.cos(ph)); z = 16.9 + RHO * Math.sin(ph); }
    else { ph = PHI; const u = (w - 0.38) / 0.62; y = tipY + RHO * (1 - Math.cos(PHI)) + LUP * u * Math.sin(PHI); z = 16.9 + RHO * Math.sin(PHI) + LUP * u * Math.cos(PHI); }
    const chord = mix(1.55, 0.52, Math.pow(w, 0.8));
    return { le: [-1.8 - 1.55 * Math.pow(w, 1.15), y, z], chord, cdir: [-1, 0, 0], tdir: [0, Math.cos(ph), -Math.sin(ph)], t: mix(0.105, 0.085, w), camber: 0.015 };
  }
  const sk = loft([0, 0.08, 0.16, 0.24, 0.32, 0.38, 0.5, 0.65, 0.8, 0.92, 1], shark, { aura: true, cap: true });
  mirror(sk);
  // control-surface and slat seams on top (and the flap line underneath)
  const flapF = (z) => (z <= 6.3 ? 0.79 - (0.06 * (z - 2.0)) / 4.3 : 0.73);
  const wl = (z0, z1, f, side = 1, tone = TONE.seam) => {
    const pts = []; for (let k = 0; k <= 10; k++) { const z = mix(z0, z1, k / 10); pts.push(onLoft(WSEC, z, typeof f === "function" ? f(z) : f, side)); }
    polyBoth(pts, tone);
  };
  wl(2.3, 16.6, 0.12); wl(2.3, 16.6, 0.12, -1);
  for (const z of [2.3, 4.15, 5.85, 8.4, 11.1, 13.8, 16.6]) { polyBoth([onLoft(WSEC, z, 0.0, 1), onLoft(WSEC, z, 0.12, 1)]); count += 2; }
  wl(2.0, 12.4, flapF, 1, TONE.crease); wl(2.0, 12.4, flapF, -1, TONE.crease);
  wl(12.55, 15.9, 0.745, 1, TONE.crease); wl(12.55, 15.9, 0.745, -1, TONE.crease);
  for (const z of [2.0, 6.3, 12.4]) polyBoth([onLoft(WSEC, z, flapF(z), 1), onLoft(WSEC, z, 1, 1)], TONE.crease);
  for (const z of [12.55, 15.9]) polyBoth([onLoft(WSEC, z, 0.745, 1), onLoft(WSEC, z, 1, 1)], TONE.crease);
  count += 2 * 3; // flaps (inner, outer) and aileron, each side
  const sp = [3.0, 4.6, 6.25, 8.3, 10.3, 12.3];
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i] + 0.06, b = sp[i + 1] - 0.06;
    polyBoth([onLoft(WSEC, a, 0.6, 1), onLoft(WSEC, b, 0.6, 1), onLoft(WSEC, b, flapF(b) - 0.012, 1), onLoft(WSEC, a, flapF(a) - 0.012, 1)], TONE.seam, true);
    count += 2;
  }
  // fuel and access panels: small ellipses on the lower skin
  for (const z of [3.4, 5.6, 7.6, 9.6, 11.6, 13.6, 15.2]) {
    const S = wingSec(z), c = airfoil(S, 0.36, -1), pts = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU; pts.push([c[0] + 0.2 * Math.cos(a), c[1] - 0.012, c[2] + 0.11 * Math.sin(a)]); }
    polyBoth(pts);
  }
  // flap-track fairings (canoes) under the wing
  for (const z of [3.6, 7.2, 9.9, 12.5]) {
    const S = wingSec(z), te = S.le[0] - S.chord, y = airfoil(S, 0.7, -1)[1] - 0.05;
    const x0 = te + 1.3, x1 = te - 1.25, prof = [];
    for (let k = 0; k <= 14; k++) { const u = k / 14; prof.push([mix(x0, x1, u), 0.19 * Math.pow(Math.sin(Math.PI * u), 0.7) + 0.002]); }
    const p = lathe(prof, y, z, { seg: 18, sz: 0.75 }); mirror(p);
  }
  // static wicks on the aileron and sharklet trailing edges
  const wick = (a, dir) => { const b = [a[0] + dir[0], a[1] + dir[1], a[2] + dir[2]]; const p = lathe([[a[0], 0.018], [b[0], 0.012]], a[1], a[2], { seg: 6 }); mirror(p); };
  for (const z of [13.3, 14.4, 15.5]) { const a = airfoil(wingSec(z), 1, 1); wick(a, [-0.32, 0, 0]); }
  for (const w of [0.7, 0.95]) { const a = airfoil(shark(w), 1, 1); wick(a, [-0.3, 0, 0]); }
  // navigation lights: green to starboard, red to port, on the sharklet root
  {
    const S = wingSec(16.6), p = [S.le[0] - 0.08, S.le[1] + 0.02, 16.75];
    ellipsoid(p, [0.11, 0.07, 0.07], { mat: MAT.green, n: 12, m: 8 });
    ellipsoid([p[0], p[1], -p[2]], [0.11, 0.07, 0.07], { mat: MAT.red, n: 12, m: 8 });
  }
  // wing-root fillet seam
  polyBoth(loftLine(WSEC, 2.05, 2.05, 0, 1).concat([]));
  { const pts = []; for (let k = 0; k <= 14; k++) pts.push(onLoft(WSEC, 2.08, k / 14, 1)); polyBoth(pts, TONE.crease); }

  // ================================================================ engines
  const EZ = 5.0, ES = wingSec(EZ), EY = -2.25;
  const lowerAt = (x, z) => { const S = wingSec(z); return airfoil(S, clamp((S.le[0] - x) / S.chord, 0, 1), -1)[1]; };
  const lip = ([x]) => sstep(7.2, 7.72, x); // the inlet lip meets the air first
  for (const s of [1, -1]) {
    const z = EZ * s;
    lathe([[7.0, 0.76], [7.42, 0.775], [7.64, 0.8], [7.73, 0.86], [7.71, 0.92], [7.6, 0.965], [7.35, 0.99], [6.6, 1.0], [5.6, 0.975], [4.8, 0.93], [4.15, 0.86], [3.64, 0.79], [3.6, 0.745], [4.2, 0.705]], EY, z, { seg: 48, aura: true, edgeFn: lip });
    lathe([[4.4, 0.66], [3.95, 0.635], [3.55, 0.6], [3.2, 0.535], [2.93, 0.465], [2.91, 0.425], [3.3, 0.4]], EY, z, { seg: 40, aura: true });
    lathe([[3.45, 0.36], [3.1, 0.35], [2.85, 0.31], [2.6, 0.22], [2.4, 0.1], [2.3, 0.0]], EY, z, { seg: 32, mat: MAT.hot });
    annulus(3.62, EY, z, 0.6, 0.745, MAT.duct, 48);           // fan nozzle exit
    annulus(2.92, EY, z, 0.35, 0.425, MAT.duct, 40);          // core nozzle exit
    annulus(7.0, EY, z, 0.2, 0.765, MAT.fan, 48, 1);          // fan face
    lathe([[7.42, 0.0], [7.3, 0.12], [7.12, 0.2], [7.0, 0.22]], EY, z, { seg: 24 }); // spinner
    for (let k = 0; k < 22; k++) { const a = (k / 22) * TAU; seg([7.005, EY + 0.22 * Math.sin(a), z + 0.22 * Math.cos(a)], [7.005, EY + 0.74 * Math.sin(a + 0.22), z + 0.74 * Math.cos(a + 0.22)], TONE.crease); }
    count += 22;
    // cowl seams: inlet / fan cowl / reverser, and the reverser's lower hinge line
    for (const x of [6.55, 4.95]) { const pts = []; for (let j = 0; j <= 48; j++) { const a = (j / 48) * TAU, r = x > 6 ? 1.005 : 0.95; pts.push([x, EY + r * Math.sin(a), z + r * Math.cos(a)]); } poly(pts, TONE.crease); }
    { const pts = []; for (let x = 6.55; x >= 3.7; x -= 0.25) { const r = x > 5.6 ? 0.98 : mix(0.79, 0.975, (x - 3.64) / 1.96) + 0.01; pts.push([x, EY - r, z]); } poly(pts); }
    // pylon: a fin from the cowl to the wing, and its aft fairing under the wing
    const pyl = (q) => {
      const y = mix(EY + 0.96, lowerAt(mix(5.2, 2.6, q), z) + 0.05, q);
      return { le: [mix(6.5, 5.6, q), y, z], chord: mix(3.9, 5.4, q), cdir: [-1, 0, 0], tdir: [0, 0, 1], t: mix(0.075, 0.06, q), camber: 0 };
    };
    loft([0, 0.35, 0.7, 1], pyl, { aura: true, edge: true });
    const aft = (q) => ({ le: [mix(1.2, 0.9, q), mix(lowerAt(1.0, z) - 0.32, lowerAt(0.6, z) + 0.05, q), z], chord: mix(2.4, 2.1, q), cdir: [-1, 0, 0], tdir: [0, 0, 1], t: 0.1, camber: 0 });
    loft([0, 1], aft, { aura: false, edge: false, cap: false });
  }
  count += 2; // pylon aft fairings

  // ================================================================ tail
  const stab = (z) => {
    const t = (z - 0.4) / 5.8;
    return { le: [-13.45 - 3.3 * t, 0.62 + (z - 0.4) * 0.105, z], chord: mix(3.65, 1.2, t), cdir: [-1, 0, 0], tdir: [0, 1, 0], t: 0.1, camber: 0 };
  };
  const st = loft([0.4, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2], stab, { aura: true, cap: true });
  mirror(st);
  { const pts = []; for (let k = 0; k <= 8; k++) pts.push(onLoft(stab, mix(1.0, 6.0, k / 8), 0.7, 1)); polyBoth(pts, TONE.crease); }
  { const pts = []; for (let k = 0; k <= 8; k++) pts.push(onLoft(stab, mix(1.0, 6.0, k / 8), 0.7, -1)); polyBoth(pts, TONE.crease); }
  polyBoth([onLoft(stab, 3.6, 0.7, 1), onLoft(stab, 3.6, 1, 1)], TONE.crease);
  for (const z of [5.4, 6.0]) { const a = airfoil(stab(z), 1, 1); wick(a, [-0.3, 0, 0]); }
  count += 2; // elevators
  const fin = (h) => {
    const t = h / 6.7;
    return { le: [-11.25 - 4.7 * t, 1.55 + h, 0], chord: mix(6.3, 2.45, t), cdir: [-1, 0, 0], tdir: [0, 0, 1], t: 0.105, camber: 0 };
  };
  loft([0, 0.5, 1.5, 2.6, 3.7, 4.8, 5.8, 6.7], fin, { aura: true, cap: true });
  for (const side of [1, -1]) {
    const pts = []; for (let k = 0; k <= 8; k++) pts.push(onLoft(fin, mix(0.5, 6.5, k / 8), 0.68, side)); poly(pts, TONE.crease);
    poly([onLoft(fin, 3.6, 0.68, side), onLoft(fin, 3.6, 1, side)], TONE.crease);
  }
  count++; // rudder
  // dorsal fillet ahead of the fin
  loft([0, 1], (q) => ({ le: [mix(-8.3, -10.9, q), mix(1.98, 2.55, q), 0], chord: mix(3.2, 0.9, q), cdir: [-1, -0.06, 0], tdir: [0, 0, 1], t: 0.16, camber: 0 }), { aura: false, edge: true, cap: true });
  for (const h of [6.0, 6.5]) { const a = airfoil(fin(h), 1, 1); const p = lathe([[a[0], 0.018], [a[0] - 0.3, 0.012]], a[1], a[2], { seg: 6 }); void p; }
  // beacons (red, crown and belly) and the tail strobe
  ellipsoid([X0 - 18.6, RY - 0.02, 0], [0.16, 0.1, 0.12], { mat: MAT.red, n: 14, m: 8 });
  ellipsoid([X0 - 17.2, -2.3, 0], [0.15, 0.09, 0.11], { mat: MAT.red, n: 14, m: 8 });
  ellipsoid([X0 - LEN + 0.3, section(LEN - 0.3).yc + section(LEN - 0.3).ry - 0.02, 0], [0.12, 0.07, 0.07], { mat: MAT.strobe, n: 12, m: 8 });

  // sources for effects (rest frame)
  const sources = {
    engines: [[2.3, EY, EZ], [2.3, EY, -EZ]],
    nozzles: [[2.92, EY, EZ], [2.92, EY, -EZ]],
    tips: [airfoil(shark(1), 0.5, 1), airfoil(shark(1), 0.5, 1).map((v, i) => (i === 2 ? -v : v))],
    tail: [X0 - LEN - 0.3, section(LEN).yc, 0],
  };
  return { parts, lines, tones, sources, count };
}
