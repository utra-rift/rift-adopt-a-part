// Bends the straight wire leads that manufacturer CAD ships with into a natural route,
// keeping the real geometry: wire cross-sections ride a rotation-minimizing frame along
// the new curve, and the connector at the end moves rigidly with the last frame.
//
// A bend (all coordinates in the CAD's own source frame, mm):
//   match    regex on "<mesh path>#<mesh index>": the wires and the connector they end in
//   from     a point on the lead's axis where it leaves the body (the lead is untouched before it)
//   to       the point on that axis where the flexible part ends and the connector begins
//   path     the new route, from `from` onward (Catmull-Rom through the points); its length
//            should equal |to − from| so the wire keeps its true length (a warning says by how much it is off)
//   maxEdge  slice spacing along the lead, mm (default 2)
//   twist    degrees the lead rolls about its own axis over its length (default 0); the
//            connector ends up rolled by the full amount (a plug lying on its side)

export function applyBends(raw, bends, log = console.log) {
  for (const b of bends) bendOne(raw, b, log);
}

function bendOne(raw, b, log) {
  const re = new RegExp(b.match, "i");
  const F = b.from, A = norm(sub(b.to, b.from)), L = len(sub(b.to, b.from));
  const U0 = norm(cross(A, Math.abs(A[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), V0 = cross(A, U0);
  const axial = (p) => dot(sub(p, F), A);

  // 1. Slice the selected triangles at evenly spaced planes across the lead so they can
  //    bend. Neighbours are cut at the same planes, so no cracks or T-junctions appear.
  const step = b.maxEdge ?? 2;
  let sel = raw.tris.map((_, i) => re.test(raw.names[i]));
  if (!sel.some(Boolean)) throw new Error(`bend: nothing matches ${b.match}`);
  const out = { tris: [], faces: [], colors: [], names: [], sel: [], src: [] };
  raw.tris.forEach((t, i) => {
    if (!sel[i]) { push(out, raw, i, t, false); return; }
    let poly = [0, 1, 2].map((k) => ({ p: t.slice(k * 3, k * 3 + 3), n: t.slice(9 + k * 3, 12 + k * 3) }));
    poly.forEach((v) => (v.s = axial(v.p)));
    const lo = Math.min(...poly.map((v) => v.s)), hi = Math.max(...poly.map((v) => v.s));
    const pieces = [];
    for (let k = Math.max(1, Math.floor(lo / step) + 1); k * step < Math.min(hi, L); k++) {
      const cut = k * step;
      const [below, above] = clip(poly, cut);
      if (below.length >= 3) pieces.push(below);
      poly = above;
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) pieces.push(poly);
    for (const q of pieces) for (let j = 1; j + 1 < q.length; j++) {
      const a = q[0], c = q[j], d = q[j + 1];
      push(out, raw, i, [...a.p, ...c.p, ...d.p, ...a.n, ...c.n, ...d.n], true);
    }
  });
  raw.tris = out.tris; raw.faces = out.faces; raw.colors = out.colors; raw.names = out.names; sel = out.sel;
  if (raw.src) raw.src = out.src;

  // 2. The new route, sampled densely with rotation-minimizing frames.
  const pts = [F, ...b.path];
  const S = sample(pts, 600);
  const Lc = S.at(-1).s;
  if (Math.abs(Lc - L) / L > 0.04) log(`  bend ${b.match}: route is ${Lc.toFixed(1)} mm, the lead is ${L.toFixed(1)} mm (${(((Lc - L) / L) * 100).toFixed(0)}%)`);
  // Start the frame from the lead's own frame, rotated onto the route's first tangent.
  let T = S[0].t, U = norm(sub(U0, scale(T, dot(U0, T))));
  S[0].U = U; S[0].V = cross(T, U);
  for (let i = 1; i < S.length; i++) {
    // Double reflection (Wang et al. 2008).
    const v1 = sub(S[i].p, S[i - 1].p), c1 = dot(v1, v1) || 1e-12;
    const rL = sub(S[i - 1].U, scale(v1, (2 / c1) * dot(v1, S[i - 1].U)));
    const tL = sub(S[i - 1].t, scale(v1, (2 / c1) * dot(v1, S[i - 1].t)));
    const v2 = sub(S[i].t, tL), c2 = dot(v2, v2) || 1e-12;
    S[i].U = norm(sub(rL, scale(v2, (2 / c2) * dot(v2, rL))));
    S[i].V = cross(S[i].t, S[i].U);
  }
  const at = (sig) => {
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].s < sig) lo = m; else hi = m; }
    const a = S[lo], c = S[hi], f = c.s > a.s ? (sig - a.s) / (c.s - a.s) : 0;
    return { p: lerp(a.p, c.p, f), t: norm(lerp(a.t, c.t, f)), U: norm(lerp(a.U, c.U, f)), V: norm(lerp(a.V, c.V, f)) };
  };
  // Optional roll about the route, growing evenly along it.
  const roll = ((b.twist ?? 0) * Math.PI) / 180;
  const frame = (sig) => {
    const f = at(sig); if (!roll) return f;
    const a = roll * Math.min(1, sig / Lc), c = Math.cos(a), s = Math.sin(a);
    return { ...f, U: add(scale(f.U, c), scale(f.V, s)), V: sub(scale(f.V, c), scale(f.U, s)) };
  };
  const end = frame(Lc);

  // 3. Move every selected vertex.
  const move = (p, n) => {
    const d = sub(p, F), s = dot(d, A), ou = dot(d, U0), ov = dot(d, V0);
    if (s <= 0) return [p, n];
    const fr = s <= L ? frame((s / L) * Lc) : end;
    const ext = s <= L ? 0 : s - L;
    const q = add(add(add(fr.p, scale(fr.t, ext)), scale(fr.U, ou)), scale(fr.V, ov));
    const m = add(add(scale(fr.t, dot(n, A)), scale(fr.U, dot(n, U0))), scale(fr.V, dot(n, V0)));
    return [q, m];
  };
  let moved = 0;
  raw.tris.forEach((t, i) => {
    if (!sel[i]) return;
    for (let k = 0; k < 3; k++) {
      const [q, m] = move(t.slice(k * 3, k * 3 + 3), t.slice(9 + k * 3, 12 + k * 3));
      t[k * 3] = q[0]; t[k * 3 + 1] = q[1]; t[k * 3 + 2] = q[2];
      t[9 + k * 3] = m[0]; t[10 + k * 3] = m[1]; t[11 + k * 3] = m[2];
    }
    moved++;
  });
  log(`  bend ${b.match}: ${moved} triangles along ${L.toFixed(1)} mm`);
}

// Split a convex polygon at the plane s = cut into the part below and the part above.
// The crossing point is interpolated from the edge's endpoints in a fixed order, so the
// two triangles sharing an edge get the same point.
function clip(poly, cut) {
  const below = [], above = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], c = poly[(k + 1) % poly.length];
    if (a.s <= cut) below.push(a); if (a.s >= cut) above.push(a);
    if ((a.s < cut && c.s > cut) || (a.s > cut && c.s < cut)) {
      const [u, w] = a.s < c.s ? [a, c] : [c, a];
      const f = (cut - u.s) / (w.s - u.s);
      const x = { p: lerp(u.p, w.p, f), n: norm(lerp(u.n, w.n, f)), s: cut };
      below.push(x); above.push(x);
    }
  }
  return [below, above];
}

function push(out, raw, i, t, s) {
  out.tris.push(t); out.faces.push(raw.faces[i]); out.colors.push(raw.colors[i]); out.names.push(raw.names[i]); out.sel.push(s);
  if (raw.src) out.src.push(raw.src[i]);
}

// Centripetal Catmull-Rom through the points, resampled with arc length and tangents.
function sample(pts, n) {
  const P = [sub(scale(pts[0], 2), pts[1]), ...pts, sub(scale(pts.at(-1), 2), pts.at(-2))];
  const raw = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t0 = 0, t1 = t0 + Math.sqrt(len(sub(p1, p0))) || 1e-6, t2 = t1 + Math.sqrt(len(sub(p2, p1))) || 1e-6, t3 = t2 + Math.sqrt(len(sub(p3, p2))) || 1e-6;
    const steps = Math.ceil(n / (P.length - 3));
    for (let k = 0; k < steps; k++) {
      const t = t1 + ((t2 - t1) * k) / steps;
      const A1 = add(scale(p0, (t1 - t) / (t1 - t0)), scale(p1, (t - t0) / (t1 - t0)));
      const A2 = add(scale(p1, (t2 - t) / (t2 - t1)), scale(p2, (t - t1) / (t2 - t1)));
      const A3 = add(scale(p2, (t3 - t) / (t3 - t2)), scale(p3, (t - t2) / (t3 - t2)));
      const B1 = add(scale(A1, (t2 - t) / (t2 - t0)), scale(A2, (t - t0) / (t2 - t0)));
      const B2 = add(scale(A2, (t3 - t) / (t3 - t1)), scale(A3, (t - t1) / (t3 - t1)));
      raw.push(add(scale(B1, (t2 - t) / (t2 - t1)), scale(B2, (t - t1) / (t2 - t1))));
    }
  }
  raw.push(pts.at(-1));
  const S = []; let s = 0;
  raw.forEach((p, i) => { if (i) s += len(sub(p, raw[i - 1])); S.push({ p, s }); });
  S.forEach((x, i) => { const a = S[Math.max(0, i - 1)].p, c = S[Math.min(S.length - 1, i + 1)].p; x.t = norm(sub(c, a)); });
  return S;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
