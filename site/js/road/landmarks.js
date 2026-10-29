// The two landmarks of the road strip, built from measurement rather than from impression:
// Convocation Hall (University of Toronto) at the start and College Park Center (UT Arlington)
// at the end. Every number is real metres with its source beside it; a builder scales the whole
// building by one factor when it sets it down in the scene.
//
// Method (the anatomy discipline, applied to three.js geometry): truth first, a parts list, a
// recognisable real object made of many small exact parts, then checking against photographs
// taken from every side and against the aerial. Plans come from the aerial and OpenStreetMap,
// heights from photographs. Parts are flat-coloured, lightly jittered low-poly pieces, merged
// into one geometry per material. Outlines cost build time (an edge pass per material), so
// small repeated details use materials without outlines.
import * as THREE from "../../vendor/three.module.min.js";

const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;

// ------------------------------------------------------------------ materials
// name -> [colour, face jitter, edge angle]. null draws no outline (small flat details: panes, ribs, joints);
// 181 draws only the boundary of a flat piece, so glass and mullions still show as ink while the land is plaster;
// 40 draws hard corners and leaves curved walls clean.
const MAT = {
  // Convocation Hall
  brick: ["#69645a", 0.05, 40],        // the rotunda's grey-buff brick (E photo, H2)
  brickLt: ["#75705f", 0.06, 40],      // the lighter tone on the attic, drums and pavilions
  base: ["#a2957c", 0.05, 40],         // banded limestone base courses
  baseFlat: ["#a2957c", 0.05, null],   // the same stone in small pieces (rustication)
  baseLine: ["#857a64", 0.03, null],   // the joints between its bands
  cream: ["#e0d8c4", 0.03, 40],        // limestone dressings: cornices, surrounds, panels
  creamFlat: ["#e0d8c4", 0.03, null],
  creamSh: ["#b9ad92", 0.03, 40],      // architrave and frieze, in the shade of the cornice
  column: ["#c3b99f", 0.03, 60],       // plinths, bases and capitals
  shaft: ["#c3b99f", 0.03, null],      // the round shafts (a lathe has no hard edges to ink)
  door: ["#7e4c2b", 0.03, null],
  glass: ["#2b3236", 0.02, null],
  frame: ["#ebe6d8", 0.02, null],
  soffit: ["#3c3630", 0.02, 60],
  dentil: ["#4b4438", 0.02, null],
  ledge: ["#a6a8a3", 0.03, 40],       // the flat roofs and terraces (aerial: light grey)
  skylight: ["#eef1ee", 0.02, null],
  band: ["#3d5851", 0.04, 40],         // dark copper band under the dome
  cuLo: ["#659d8a", 0.05, 25],
  cuHi: ["#74ac98", 0.05, null],       // the shell itself: its rims are inked by the skirt edge and the curb
  rib: ["#8dbaa8", 0.04, null],
  seam: ["#3f6f60", 0.04, 181],
  lantern: ["#4c6670", 0.03, 181],     // the glazed octagonal oculus on the crown
  vent: ["#34504a", 0.03, null],
  chim: ["#6d6258", 0.05, 40],
  chimCap: ["#8b7e71", 0.04, 40],
  tan: ["#c2ad84", 0.06, 40],          // Simcoe Hall's buff stone, where the ivy leaves it bare
  tanBase: ["#a48f6d", 0.05, 40],
  ivyWall: ["#455a38", 0.08, 40],      // the wall behind the ivy
  darkStone: ["#6a6358", 0.05, 40],
  ivy: ["#4f7f39", 0.06, null],
  ivyDk: ["#3f6b31", 0.06, null],
  ivyLt: ["#62914a", 0.06, null],
  roofTar: ["#c6c6c0", 0.03, 40],      // Simcoe Hall's pale membrane roof (aerial)
  paving: ["#a9a69e", 0.02, 60],
  // College Park Center
  silver: ["#b4bdc6", 0.02, 60],
  silverSh: ["#98a1a8", 0.02, 60],
  fasciaJoint: ["#8e979e", 0.02, null],
  soffitLt: ["#d6d8d6", 0.02, 60],     // the canopies' light underside panels
  beam: ["#5d6166", 0.02, null],
  cpcGlass: ["#2e5d93", 0.02, 181],
  cpcGlassDk: ["#223f66", 0.02, 181],
  mullion: ["#aeb3b6", 0.02, 181],
  spandrel: ["#d9dbd8", 0.02, 181],
  cpcBrick: ["#a45b42", 0.06, 40],
  cpcBrickDk: ["#8d4a35", 0.05, 40],
  cpcBuff: ["#c4955f", 0.06, 40],      // the annex's buff-orange brick (C3)
  cpcBuffDk: ["#a97b4d", 0.05, 40],
  limestone: ["#d3c6a5", 0.04, 40],
  limestoneLt: ["#dccfae", 0.04, 181],
  course: ["#b8aa88", 0.02, null],
  louvre: ["#b9bcbc", 0.02, 181],
  roofWhite: ["#e7e4dc", 0.02, 40],    // the white membrane roofs (aerial)
  pavers: ["#c8a58e", 0.05, 60],
  walk: ["#bdb7ab", 0.03, 60],
  planterWall: ["#cdbf9c", 0.04, 40],
  grassDry: ["#a89462", 0.07, null],
  pole: ["#f1f1ee", 0.01, null],
  lampPost: ["#26282b", 0.01, null],
  banner: ["#2a3f86", 0.02, 181],
  bannerWh: ["#eceae4", 0.02, null],
  flagRed: ["#b3322d", 0.02, null],
  flagBlue: ["#2d3f7d", 0.02, null],
  flagWhite: ["#f0efea", 0.02, null],
  trunk: ["#5a4a3a", 0.04, null],
  oak: ["#52693a", 0.1, 60],
  oakLt: ["#62793f", 0.1, null],
};

// ------------------------------------------------------------------ geometry bag
// Triangles collected per material in real metres; `flush` scales them and hands each material
// to the scene as one geometry.
class Bag {
  constructor() { this.by = new Map(); this.count = 0; }
  list(m) { let a = this.by.get(m); if (!a) this.by.set(m, (a = [])); return a; }
  tri(m, a, b, c) { this.list(m).push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); this.count++; }
  quad(m, a, b, c, d) { this.tri(m, a, b, c); this.tri(m, a, c, d); }
  at(cx = 0, cz = 0, rot = 0) { return new Frame(this, cx, cz, rot); }
  flush(add, st, scale) {
    for (const [m, a] of this.by) {
      const [hex, jitter, edge] = MAT[m];
      const p = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) p[i] = a[i] * scale;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      add(g, st, hex, { jitter, edge });
    }
  }
}

// A local frame on the floor plan: local +z points at angle `rot` (from +z toward +x), so a
// part built "facing front" can be set at any angle round a rotunda. Methods take local metres.
class Frame {
  constructor(bag, cx, cz, rot) { this.b = bag; this.cx = cx; this.cz = cz; this.sn = Math.sin(rot); this.cs = Math.cos(rot); }
  p(x, y, z) { return [this.cx + x * this.cs + z * this.sn, y, this.cz - x * this.sn + z * this.cs]; }
  quad(m, a, b, c, d) { this.b.quad(m, this.p(...a), this.p(...b), this.p(...c), this.p(...d)); }
  tri(m, a, b, c) { this.b.tri(m, this.p(...a), this.p(...b), this.p(...c)); }
  // A rectangle standing on the plane z, between (x0, y0) and (x1, y1).
  face(m, x0, y0, x1, y1, z) { this.quad(m, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]); }
  // A rectangle lying on the plane y, between (x0, z0) and (x1, z1).
  deck(m, x0, z0, x1, z1, y) { this.quad(m, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]); }
  // A box with no underside unless `bottom`.
  box(m, x0, y0, z0, x1, y1, z1, bottom = false) {
    this.face(m, x0, y0, x1, y1, z1);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    this.deck(m, x0, z0, x1, z1, y1);
    if (bottom) this.deck(m, x0, z0, x1, z1, y0);
  }
  // A sloped-top block: `y1f` high at the front (z1), `y1b` high at the back (z0).
  wedge(m, x0, y0, z0, x1, y1f, y1b, z1) {
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1f, z1], [x0, y1f, z1]);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1b, z0], [x1, y1b, z0]);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1b, z0], [x1, y1f, z1]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1f, z1], [x0, y1b, z0]);
    this.quad(m, [x0, y1f, z1], [x1, y1f, z1], [x1, y1b, z0], [x0, y1b, z0]);
  }
  // A flat disc standing on the plane z (a round window), centre (x, y), radius r.
  disc(m, x, y, r, z, seg = 10) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU;
      this.tri(m, [x, y, z], [x + r * Math.cos(a), y + r * Math.sin(a), z], [x + r * Math.cos(b), y + r * Math.sin(b), z]);
    }
  }
  // A horizontal cylinder along x from x0 to x1 (a scroll, a rail), radius r at height y, depth z.
  cylX(m, x0, x1, y, z, r, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU;
      const ya = y + r * Math.sin(a), za = z + r * Math.cos(a), yb = y + r * Math.sin(b), zb = z + r * Math.cos(b);
      this.quad(m, [x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]);
    }
  }
  // A half-round hood over a door: a flat half disc on the plane z with thickness, centre x, springing y0.
  hood(m, x, y0, r, z, depth, seg = 8) {
    const pts = [];
    for (let i = 0; i <= seg; i++) { const a = Math.PI * (i / seg); pts.push([x + r * Math.cos(a), y0 + r * Math.sin(a)]); }
    for (let i = 0; i < seg; i++) {
      this.tri(m, [x, y0, z + depth], [pts[i][0], pts[i][1], z + depth], [pts[i + 1][0], pts[i + 1][1], z + depth]);
      this.quad(m, [pts[i][0], pts[i][1], z], [pts[i + 1][0], pts[i + 1][1], z], [pts[i + 1][0], pts[i + 1][1], z + depth], [pts[i][0], pts[i][1], z + depth]);
    }
    this.quad(m, [x - r, y0, z], [x + r, y0, z], [x + r, y0, z + depth], [x - r, y0, z + depth]);
  }
}

// A frame on a straight wall from A to B ([x, z] points): local x runs along the wall (0 to L), local +z points away
// from `inside`, so face(m, x0, y0, x1, y1, 0.1) puts a panel on the outer face.
function wallAt(bag, A, B, inside) {
  let [a, b] = [A, B];
  const nx = -(b[1] - a[1]), nz = b[0] - a[0];
  if (nx * (a[0] - inside[0]) + nz * (a[1] - inside[1]) < 0) [a, b] = [b, a];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  return { F: bag.at(a[0], a[1], Math.atan2(dx, dz) - Math.PI / 2), L };
}

// A vertical prism over a plan polygon ([x, z] points, either winding): walls from y0 to y1 and a flat top.
function prism(bag, m, poly, y0, y1, mTop = m) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const P = area > 0 ? [...poly].reverse() : poly;           // clockwise in x-z, so each wall faces out
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    bag.quad(m, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
  }
  if (mTop) deck(bag, mTop, P, y1);
}
// A flat polygon at height y, facing up.
function deck(bag, m, poly, y) {
  const idx = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [i, j, k] of idx) {
    const a = poly[i], b = poly[j], c = poly[k];
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    if (up) bag.tri(m, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]]);
    else bag.tri(m, [a[0], y, a[1]], [c[0], y, c[1]], [b[0], y, b[1]]);
  }
}
// Offset an open polyline outward by d (mitred), the outward side being away from `inside`.
function offsetLine(pts, d, inside) {
  const n = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let v = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    if (v[0] * (a[0] - inside[0]) + v[1] * (a[1] - inside[1]) < 0) v = [-v[0], -v[1]];
    n.push(v);
  }
  return pts.map((p, i) => {
    const a = n[Math.max(0, i - 1)], b = n[Math.min(n.length - 1, i)], k = 1 / (1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * k * d, p[1] + (a[1] + b[1]) * k * d];
  });
}

// A surface of revolution about the vertical axis through (cx, cz): `profile` is [radius, y]
// pairs from the first to the last, swept from angle a0 to a1 (measured from +z toward +x).
function lathe(bag, m, cx, cz, profile, seg, a0 = 0, a1 = TAU) {
  const pt = (r, y, a) => [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    for (let j = 0; j < seg; j++) {
      const a = a0 + ((a1 - a0) * j) / seg, b = a0 + ((a1 - a0) * (j + 1)) / seg;
      if (r0 === 0) bag.tri(m, pt(0, y0, a), pt(r1, y1, b), pt(r1, y1, a));
      else if (r1 === 0) bag.tri(m, pt(r0, y0, a), pt(r0, y0, b), pt(0, y1, a));
      else bag.quad(m, pt(r0, y0, a), pt(r0, y0, b), pt(r1, y1, b), pt(r1, y1, a));
    }
  }
}
// A wall round the axis: a vertical band between two heights at one radius.
const wall = (bag, m, cx, cz, r, y0, y1, seg, a0 = 0, a1 = TAU) => lathe(bag, m, cx, cz, [[r, y0], [r, y1]], seg, a0, a1);
// A flat ring (or sector of one) at height y between two radii.
const ring = (bag, m, cx, cz, r0, r1, y, seg, a0 = 0, a1 = TAU) => lathe(bag, m, cx, cz, [[r1, y], [r0, y]], seg, a0, a1);
// A solid ring: a band with a cap on top, between radii r0 (inside) and r1, from y0 to y1.
function band(bag, m, cx, cz, r0, r1, y0, y1, seg, a0 = 0, a1 = TAU, inner = false) {
  wall(bag, m, cx, cz, r1, y0, y1, seg, a0, a1);
  ring(bag, m, cx, cz, r0, r1, y1, seg, a0, a1);
  if (inner) wall(bag, m, cx, cz, r0, y0, y1, seg, a0, a1);
}

// Deterministic noise for ivy and the like: a stable pseudo-random value from two integers.
function h2(i, j, s = 0) {
  let h = Math.imul(i + 374761393, 668265263) ^ Math.imul(j + 1274126177, 2246822519) ^ Math.imul(s + 97, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A tall sash window on a wall: a lighter surround, dark glass, a mullion and two transoms. `z` is
// the wall face; the pieces stand off it by a few centimetres so they never fight the wall.
function window(F, xc, y0, w, h, z, o = {}) {
  const { lintel = 0.35, sill = 0.2, side = 0.2 } = o;
  F.face("frame", xc - w / 2 - side, y0 - sill, xc + w / 2 + side, y0 + h + lintel, z + 0.1);
  F.face("glass", xc - w / 2, y0, xc + w / 2, y0 + h, z + 0.2);
  F.face("frame", xc - 0.06, y0, xc + 0.06, y0 + h, z + 0.28);
  F.face("frame", xc - w / 2, y0 + h * 0.48, xc + w / 2, y0 + h * 0.48 + 0.12, z + 0.28);
  F.face("frame", xc - w / 2, y0 + h * 0.8, xc + w / 2, y0 + h * 0.8 + 0.1, z + 0.28);
}

// Ivy over a wall face: a lumpy skin of three greens on local x0..x1, y0..y1, standing just off the plane z,
// ragged along the top. Windows built after it stand proud of it.
function ivy(F, x0, x1, y0, y1, z, seed) {
  const nx = Math.max(4, Math.round((x1 - x0) / 0.95)), ny = Math.max(3, Math.round((y1 - y0) / 1.3)), P = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const top = j === ny ? (h2(i, j, seed + 5) - 0.6) * 1.1 : 0;
    P.push([x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny + (j > 0 && j < ny ? (h2(i, j, seed + 3) - 0.5) * 0.3 : 0) + top, z + 0.12 + h2(i, j, seed + 1) * 0.32]);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = h2(i, j, seed + 7);
    F.quad(t < 0.3 ? "ivyDk" : t > 0.72 ? "ivyLt" : "ivy", P[j * (nx + 1) + i], P[j * (nx + 1) + i + 1], P[(j + 1) * (nx + 1) + i + 1], P[(j + 1) * (nx + 1) + i]);
  }
}

// =================================================================== Convocation Hall
// Real metres. The dome's centre is the origin; +z is the axis of the north-east portico (the one the
// lawn and the road face), +x is to its right as you face it: toward Simcoe Hall.
// PLAN from the aerial (Esri World Imagery z20, 0.108 m/px; radii read round the dome's own centre at roof
// level) and OpenStreetMap way 330718925 (fitted to its three drum tips: residuals under 0.5 m).
// HEIGHTS: read off H1, H2 and H3 on cameras fitted to this plan (eye height 1.7 m), taking the median where they
// differ. Heights H1 alone gives are its earlier reads put on the aerial's scale: 0.92 of the scale that fit used
// (it took the bow-to-bow width as 54.9 m; the drums are 45 m apart).
const HS = 0.92;                // height scale onto the aerial's dome: 32.8 m across against the 35.5 m H1 had assumed
export const CH = {
  // plan
  axisBearing: 28,        // the front portico's axis from north: midway between the NNW and ENE drums (aerial 343.5 and 72.6 deg)
  domeR: 16.4,            // aerial: the green shell's edge, 32.8 m across, round all 360 degrees to 0.3 m
  atticR: 18.6,           // aerial: attic cornice edge at 19.8 m, less its 1.2 m projection
  atticCorniceR: 19.8,
  wallR: 21.0,            // the brick wall behind the columns (OSM back wall at 19.7-20.9 m)
  colR: 24.0,             // H2: six column bases and both drums fit to 0.2 px rms with the columns on a 24 m ring
  colStep: 11.5,          // degrees between column axes on that fit (4.8 m), six to a portico
  porticoR: 25.3,         // OSM: both porticos' outer (cornice) edge at 25.0-25.4 m
  porticos: [0, -90.4],   // the north-east (front) and east-south-east colonnades, between the three drums (aerial)
  porticoHalf: 31,        // degrees either side of a portico's axis that its entablature runs (OSM edge 30-31 deg)
  drums: [44.5, -44.5, -136.3],  // drum axes: aerial 343.5, 72.6, 164.3 deg bearing; OSM tips at +44.8, -45.4, -135.8
  drumC: 25.0,            // drum centre radius: OSM tips at 28.8-29.2 m less the radius
  drumR: 4.1,             // aerial: the drums are 8.2-8.4 m across
  pierAt: 33.8,           // the rusticated pier between a portico's last column and its drum (H2)
  pavilionW: 12.7,        // aerial: the three rectangular attic pavilions over the drums, 12.7-13 m wide
  pavilionOut: 24.2,      // their outer face (aerial 24-26 m)
  panelStep: 12,          // degrees between the five oculus panels of an attic (H2 oculi at x 437, 520, 615, 710, 800)
  skylightAt: [28, -17, -62, -107, -152, 163, 118, 73],   // the eight roof-ring skylights (aerial, every 45 deg from bearing 0)
  // heights (m): H1 reads on the aerial's scale
  stylobate: 0.55,        // two low steps to the portico floor (H2)
  baseTop: 3.6,           // the banded stone storey round the rotunda and the drums, up to the door heads (H2, the E photo)
  colTop: 12.2 * HS,      // column capital top: H1 y 665 to 482
  entTop: 13.9,           // portico entablature top: median of H1 14.3, H2 13.35, H3 13.9 (each on its fitted camera)
  atticTop: 16.7,         // attic wall top under the cornice: the cornice less its 1.3 m (H1)
  corniceTop: 18.0,       // attic cornice top: H2 17.6, H3 18.15, the CN-tower view 17.8 (H1 alone reads 19.6)
  bandTop: 18.8,          // top of the dark copper band: 0.8 m over the cornice (H1)
  skirtTop: 20.6,         // top of the lighter copper skirt where the shell starts: H2 19.0 and H3 20.4 at the band's top edge, plus the skirt (H1)
  shoulderR: 6.0,         // aerial: the copper curb round the crown, 12 m across
  shoulderY: 25.4,        // the curb 1.8 m under the apex (H1 y 238 against 208)
  lanternR: 5.4,          // aerial: the glazed octagon inside the curb, 10.8 m across
  capTop: 27.2,           // crown apex: H1 27.8, H2 26.6, H3 27.2 on their fitted cameras; the median
  ribs: 48,               // standing seams drawn (the real ones are finer: about 140 in the aerial)
  drumTop: 12.4,          // drum wall top, under its rolled cap (H2: the caps sit level with the entablature)
  drumCap: 13.9,
  drumAttic: 15.9,        // the drum's curved attic in front of its pavilion (E photo: its coping 2 m over the cap)
  pavilionTop: [18.0, 18.6],   // the pavilion block's top at its outer face and toward the dome: its coping level with the attic cornice (H3; the E photo, nearer, shows it a little over)
  // the west block between the rotunda and Simcoe Hall: its flat north-west wall runs from the drum to Simcoe Hall
  // (OSM vertices 3 and 0), its back is the wall it shares with Simcoe Hall (OSM vertices 0 to 64)
  backPoly: [[22.2, 13.4], [32.5, 3.7], [0.4, -30.8], [-3.9, -26.8], [1.8, -20.9], [17.6, 11.4]],  // the hall's west block (OSM)
  chimneyAt: [21.3 * HS, -4.5 * HS],   // H1: x 930-970 against the hall centre at x 635
  chimneyTop: 26.1 * HS,  // H1 y 272
  // Simcoe Hall, attached on the west: its own frame starts at the hall's NW corner, x along its front, z out of it
  simcoe: {
    at: [32.5, 3.7], facing: 43.3,      // OSM: the front (north) face of Simcoe Hall and the hall's NW wall share one line
    main: [0, -51.6, 33.8, 0],          // x0, z0, x1, z1 of the main block (OSM way 10336055 in this frame)
    porch: [9.5, 0, 17.5, 7.5],         // the entrance block between the recessed front and the west wing
    wing: [17.5, 0, 33.9, 22.45],       // the west wing that stands forward of the front
    ivyFrom: -14.1,                     // the ivy face runs from the hall's drum (H1)
    h: 13.4,                            // parapet: H1 y 440, just under the hall's entablature (y 433)
    storey: 4.7 * HS,
    winPitch: 4.05,                     // H1: 61 px at 15.1 px/m
  },
};

// Key points the photo-match gate projects (name -> [x, y, z] in metres).
const cp = (th, r, y) => [r * Math.sin(rad(th)), y, r * Math.cos(rad(th))];
export const CH_KEYS = {
  capApex: [0, CH.capTop, 0],
  domeL: [-CH.domeR, CH.bandTop, 0], domeR: [CH.domeR, CH.bandTop, 0],
  colBaseC: cp(CH.colStep / 2, CH.colR, CH.stylobate), colTopC: cp(CH.colStep / 2, CH.colR, CH.colTop),
  entTopC: [0, CH.entTop, CH.porticoR], corniceTopC: [0, CH.corniceTop, CH.atticCorniceR],
  drumL: cp(-44.5, CH.drumC + CH.drumR, 0), drumR: cp(44.5, CH.drumC + CH.drumR, 0),
  chimTop: [CH.chimneyAt[0], CH.chimneyTop, CH.chimneyAt[1]],
};

// One column on its stylobate, at angle `th` round the hall.
function column(bag, th) {
  const R = CH.colR, x = R * Math.sin(th), z = R * Math.cos(th), s = CH.stylobate, top = CH.colTop;
  const F = bag.at(x, z, th);
  F.box("column", -0.88, s, -0.88, 0.88, s + 0.45, 0.88);                                   // plinth
  lathe(bag, "shaft", x, z, [[0.92, s + 0.45], [0.82, s + 0.82]], 10);                       // torus base
  lathe(bag, "shaft", x, z, [[0.82, s + 0.82], [0.75, s + 4.5], [0.64, top - 1.05]], 10);    // unfluted shaft, tapering
  lathe(bag, "column", x, z, [[0.64, top - 0.95], [0.9, top - 0.45]], 10);                     // echinus
  F.box("column", -0.92, top - 0.45, -0.92, 0.92, top, 0.92);                                // abacus
  for (const sx of [-1, 1]) F.cylX("shaft", sx * 0.87 - 0.26, sx * 0.87 + 0.26, top - 0.5, 0.0, 0.31, 6);   // Ionic volutes
}

// A portico on axis `ax` (degrees): columns, entablature, terrace parapet, five bays of doors and windows,
// and the five oculus panels of the attic above it.
function portico(bag, ax) {
  const { wallR, colR, porticoR, colTop, entTop, stylobate: s } = CH, a0 = rad(ax - CH.porticoHalf), a1 = rad(ax + CH.porticoHalf);
  band(bag, "base", 0, 0, wallR - 0.2, porticoR + 0.4, -1.2, 0.3, 12, a0, a1);                        // lower step
  band(bag, "base", 0, 0, wallR - 0.2, porticoR - 0.4, -1.2, s, 12, a0, a1);                          // stylobate: the portico floor
  ring(bag, "soffit", 0, 0, wallR, porticoR - 0.6, colTop - 0.05, 16, a0, a1);
  band(bag, "creamSh", 0, 0, colR - 0.85, colR + 0.75, colTop, entTop - 1.1, 20, a0, a1, true);         // architrave and frieze
  band(bag, "cream", 0, 0, colR - 0.85, porticoR, entTop - 1.1, entTop, 20, a0, a1);                    // cornice
  wall(bag, "creamFlat", 0, 0, porticoR - 0.4, entTop - 1.35, entTop - 1.05, 20, a0, a1);               // the dentil band under it
  for (let i = 0; i < 44; i++) {                                                                       // its dentils
    const th = rad(ax - CH.porticoHalf + 0.7 + i * ((2 * CH.porticoHalf - 1.4) / 43)), r = porticoR - 0.37;
    bag.at(r * Math.sin(th), r * Math.cos(th), th).face("dentil", -0.12, entTop - 1.32, 0.12, entTop - 1.1, 0);
  }
  band(bag, "brick", 0, 0, porticoR - 1.1, porticoR - 0.2, entTop, entTop + 0.65, 16, rad(ax - 28), rad(ax + 28));   // terrace parapet
  ring(bag, "cream", 0, 0, porticoR - 1.2, porticoR - 0.1, entTop + 0.65, 16, rad(ax - 28), rad(ax + 28));
  for (let i = 0; i < 6; i++) column(bag, rad(ax + (i - 2.5) * CH.colStep));
  // five bays (H2): single door; hooded single; hooded double; hooded double; single under a flat hood; a window over each
  for (let i = 0; i < 5; i++) {
    const th = rad(ax + (i - 2) * CH.colStep), F = bag.at(wallR * Math.sin(th), wallR * Math.cos(th), th);
    const dbl = i === 2 || i === 3, w = dbl ? 2.0 : 1.25, dh = 3.1, z = 0.32;                          // z: proud of the banded base
    F.face("frame", -w / 2 - 0.3, s, w / 2 + 0.3, s + dh + 0.3, z + 0.05);
    F.face("door", -w / 2, s, w / 2, s + dh, z + 0.14);
    if (dbl) F.face("frame", -0.05, s, 0.05, s + dh, z + 0.2);
    if (i >= 1 && i <= 3) { F.hood("cream", 0, s + dh + 0.3, w / 2 + 0.55, z, 0.45, 6); F.box("creamFlat", -w / 2 - 0.85, s + dh + 0.3, z, -w / 2 - 0.55, s + dh + 0.9, z + 0.45); F.box("creamFlat", w / 2 + 0.55, s + dh + 0.3, z, w / 2 + 0.85, s + dh + 0.9, z + 0.45); }
    if (i === 4) F.box("cream", -w / 2 - 0.5, s + dh + 0.3, z, w / 2 + 0.5, s + dh + 0.65, z + 0.4);
    window(F, 0, s + 5.9, 1.2, 2.1, 0.0, { side: 0.25 });
  }
  // the attic's five oculus panels over this portico
  for (let i = -2; i <= 2; i++) {
    const th = rad(ax + CH.panelStep * i), r = CH.atticR, F = bag.at(r * Math.sin(th), r * Math.cos(th), th);
    const y0 = entTop + 0.5, y1 = CH.atticTop - 0.35, yc = (y0 + y1) / 2;                            // H2: the panels fill the attic's height
    F.box("cream", -1.1, y0, -0.1, 1.1, y1, 0.3);
    F.box("creamFlat", -1.3, y1, -0.1, 1.3, y1 + 0.3, 0.42);                                          // pediment cap
    F.disc("glass", 0, yc, 0.5, 0.34, 8);
    F.disc("frame", 0, yc, 0.66, 0.31, 8);
  }
}

// A drum (bow) at angle `ax`: banded base, the drum, its string course and rolled cap, two windows facing out;
// and the attic pavilion block above it with its carved relief panel.
function drum(bag, ax) {
  const th = rad(ax), bx = CH.drumC * Math.sin(th), bz = CH.drumC * Math.cos(th), r = CH.drumR;
  wall(bag, "base", bx, bz, r + 0.3, -1.2, CH.baseTop, 14);                                            // banded stone up to the door heads (E photo)
  ring(bag, "base", bx, bz, r, r + 0.3, CH.baseTop, 14);
  for (let k = 1; k < 4; k++) wall(bag, "baseLine", bx, bz, r + 0.32, k * 0.9 - 0.06, k * 0.9 + 0.04, 14);
  wall(bag, "brickLt", bx, bz, r, CH.baseTop, CH.drumTop, 14);
  wall(bag, "baseFlat", bx, bz, r + 0.2, 5.8, 6.25, 14);                                                // string course
  lathe(bag, "cream", bx, bz, [[r, CH.drumTop], [r + 1.2, CH.drumTop + 0.7], [r + 1.35, CH.drumCap - 0.3], [r + 1.0, CH.drumCap]], 14);   // the rolled cap
  ring(bag, "ledge", bx, bz, 0.001, r + 1.0, CH.drumCap, 14);
  wall(bag, "brickLt", bx, bz, r - 0.3, CH.drumCap, CH.drumAttic - 0.4, 10, th - rad(90), th + rad(90));   // the drum's own curved attic (E photo)
  lathe(bag, "cream", bx, bz, [[r - 0.3, CH.drumAttic - 0.4], [r + 0.05, CH.drumAttic - 0.3], [r + 0.05, CH.drumAttic], [r - 1.2, CH.drumAttic]], 10, th - rad(90), th + rad(90));
  const Fw = bag.at(bx + r * Math.sin(th), bz + r * Math.cos(th), th);
  window(Fw, 0, 8.1, 1.1, 2.0, 0, { side: 0.2 });                                                      // a short window over a tall one, both
  window(Fw, 0, CH.baseTop + 0.3, 1.2, 3.2, 0, { side: 0.2 });                                          // over the banded base (H2, HE)
  // the pavilion over it
  const F = bag.at(0, 0, th), w = CH.pavilionW / 2, zi = CH.atticR - 0.4, zo = CH.pavilionOut, e = CH.entTop;
  F.wedge("brickLt", -w, CH.drumCap - 0.2, zi, w, CH.pavilionTop[0], CH.pavilionTop[1], zo);
  F.wedge("cream", -w - 0.3, CH.pavilionTop[0], zi - 0.3, w + 0.3, CH.pavilionTop[0] + 0.45, CH.pavilionTop[1] + 0.45, zo + 0.35);   // the cream coping rising toward the dome
  for (const px of [-4.3, 4.3]) {                                                                         // two carved relief panels (E photo)
    F.box("cream", px - 1.0, CH.drumAttic - 0.5, zo, px + 1.0, CH.pavilionTop[0] - 0.35, zo + 0.25);
    F.box("creamSh", px - 0.7, CH.drumAttic - 0.2, zo + 0.25, px + 0.7, CH.pavilionTop[0] - 0.65, zo + 0.33);
  }
}

// The rusticated pier between a portico's end column and its drum, at angle `ax`.
function pier(bag, ax) {
  const th = rad(ax), F = bag.at(22.6 * Math.sin(th), 22.6 * Math.cos(th), th);
  F.box("brickLt", -1.5, -1.2, -2.0, 1.5, CH.entTop - 0.4, 2.0);
  F.box("base", -1.6, -1.2, -2.1, 1.6, 2.0, 2.1);
  for (let k = 0; k < 5; k++) F.face("baseFlat", -1.5, 3.1 + k * 1.75, 1.5, 3.25 + k * 1.75, 2.04);     // rusticated courses
  F.box("cream", -1.6, CH.entTop - 0.9, -2.1, 1.6, CH.entTop, 2.1);
}

// The Hall: adds every part to `bag` in real metres.
function hallParts(bag) {
  const { wallR, atticR, entTop } = CH, SEG = 48;
  // ---- ground: the plaza round the two porticos
  ring(bag, "paving", 0, 0, CH.porticoR + 0.4, 40, 0.04, 24, rad(-150), rad(55));
  // ---- the rotunda: banded base, brick wall, string course all round
  wall(bag, "base", 0, 0, wallR + 0.3, -1.2, CH.baseTop, 36);                                        // the banded stone storey under the brick
  ring(bag, "base", 0, 0, wallR, wallR + 0.3, CH.baseTop, 36);
  for (let k = 1; k < 4; k++) wall(bag, "baseLine", 0, 0, wallR + 0.32, k * 0.9 - 0.06, k * 0.9 + 0.04, 36);
  wall(bag, "brick", 0, 0, wallR, CH.baseTop, entTop - 1.5, SEG);
  for (const [a, b] of [[31, 238.6], [-59.4, -31]]) {                                                 // string course where no portico is
    wall(bag, "cream", 0, 0, wallR + 0.5, entTop - 1.5, entTop, Math.ceil((b - a) / 7.5), rad(a), rad(b));
    ring(bag, "cream", 0, 0, wallR, wallR + 0.5, entTop, Math.ceil((b - a) / 7.5), rad(a), rad(b));
  }
  ring(bag, "ledge", 0, 0, atticR, wallR, entTop, SEG);                                                 // the terrace round the attic
  for (const ax of CH.porticos) {
    ring(bag, "ledge", 0, 0, wallR, CH.porticoR - 1.1, entTop + 0.02, 12, rad(ax - CH.porticoHalf), rad(ax + CH.porticoHalf));
    portico(bag, ax);
  }
  for (const ax of [CH.pierAt, -CH.pierAt, -90.4 + CH.pierAt, -90.4 - CH.pierAt]) pier(bag, ax);
  for (const ax of CH.drums) drum(bag, ax);
  // ---- the west block between the rotunda and Simcoe Hall, and its flat north-west wall
  prism(bag, "brick", CH.backPoly, -1.2, entTop - 1.5, null);
  prism(bag, "cream", CH.backPoly, entTop - 1.5, entTop, "ledge");
  // ---- the attic: brick wall, its cornice
  wall(bag, "brickLt", 0, 0, atticR, entTop, CH.atticTop, SEG);
  wall(bag, "creamFlat", 0, 0, atticR + 0.5, CH.atticTop - 0.5, CH.atticTop, SEG);                     // the lower cornice
  lathe(bag, "cream", 0, 0, [[atticR + 0.6, CH.atticTop], [CH.atticCorniceR, CH.atticTop + 0.3], [CH.atticCorniceR, CH.corniceTop]], SEG);
  ring(bag, "cream", 0, 0, atticR, CH.atticCorniceR, CH.corniceTop, SEG);
  // ---- the roof ring between attic and dome, with its eight skylights
  ring(bag, "ledge", 0, 0, CH.domeR, atticR, CH.corniceTop - 0.3, SEG);
  for (const a of CH.skylightAt) {
    const th = rad(a), F = bag.at(17.6 * Math.sin(th), 17.6 * Math.cos(th), th);
    F.box("skylight", -1.5, CH.corniceTop - 0.3, -0.6, 1.5, CH.corniceTop + 0.1, 0.6);
  }
  // ---- the dome: dark band, lighter skirt, the shell (a sphere through the skirt and the curb), the copper curb
  // and the glazed octagonal oculus on the crown (aerial), standing seams
  const { domeR, skirtTop, shoulderR, shoulderY, capTop } = CH;
  wall(bag, "band", 0, 0, domeR + 0.3, CH.corniceTop - 0.3, CH.bandTop, SEG);
  ring(bag, "band", 0, 0, domeR, domeR + 0.3, CH.bandTop, SEG);
  wall(bag, "cuLo", 0, 0, domeR, CH.bandTop, skirtTop, SEG);
  const dy = shoulderY - skirtTop, yc = (shoulderY + skirtTop) / 2 - (domeR * domeR - shoulderR * shoulderR) / (2 * dy);
  const Rs = Math.sqrt(domeR * domeR + (skirtTop - yc) ** 2);
  const rs = [domeR, 14.9, 12.6, 10.0, 7.9, shoulderR], prof = rs.map((r) => [r, yc + Math.sqrt(Rs * Rs - r * r)]);
  lathe(bag, "cuHi", 0, 0, prof, SEG);
  lathe(bag, "seam", 0, 0, [[domeR + 0.05, skirtTop - 0.05], [domeR + 0.25, skirtTop + 0.05]], SEG);   // the skirt's edge
  lathe(bag, "cuLo", 0, 0, [[shoulderR, shoulderY], [shoulderR, shoulderY + 0.55], [CH.lanternR, shoulderY + 0.55]], 32);   // the curb
  lathe(bag, "lantern", 0, 0, [[CH.lanternR, shoulderY + 0.55], [CH.lanternR - 0.3, shoulderY + 0.75], [0.001, capTop]], 8, rad(22.5), rad(22.5) + TAU);   // glazed octagon
  for (let k = 0; k < CH.ribs; k++) {                                                                    // seams, lifted along the shell's normal
    const a = (k / CH.ribs) * TAU + rad(3.75), hw = rad(0.55);
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      const n0 = [r0 / Rs, (y0 - yc) / Rs], n1 = [r1 / Rs, (y1 - yc) / Rs], lift = 0.1;
      const P = (r, y, n, da) => { const rr = r + n[0] * lift; return [rr * Math.sin(a + da), y + n[1] * lift, rr * Math.cos(a + da)]; };
      bag.quad("rib", P(r0, y0, n0, -hw * (domeR / r0)), P(r0, y0, n0, hw * (domeR / r0)), P(r1, y1, n1, hw * (domeR / r1)), P(r1, y1, n1, -hw * (domeR / r1)));
    }
  }
  for (const [ph, n] of [[rad(-38), 12], [rad(52), 12]]) {                                              // two clusters of vents (H1)
    for (let k = 0; k < n; k++) {
      const a = ph + ((k % 4) - 1.5) * rad(3.4), r = 11.1 + Math.floor(k / 4) * 0.8, y = yc + Math.sqrt(Rs * Rs - r * r), nn = [r / Rs, (y - yc) / Rs];
      bag.at((r + nn[0] * 0.12) * Math.sin(a), (r + nn[0] * 0.12) * Math.cos(a), a).box("vent", -0.2, y + nn[1] * 0.12, -0.16, 0.2, y + nn[1] * 0.12 + 0.11, 0.16);
    }
  }
  // ---- the chimney at the right rear: shaft, corbelled cap, flue
  const Fc = bag.at(CH.chimneyAt[0], CH.chimneyAt[1], 0);
  Fc.box("chim", -1.1, CH.corniceTop - 0.5, -1.1, 1.1, CH.chimneyTop - 0.75, 1.1);
  Fc.box("chimCap", -1.4, CH.chimneyTop - 0.75, -1.4, 1.4, CH.chimneyTop, 1.4);
  Fc.deck("soffit", -0.8, -0.8, 0.8, 0.8, CH.chimneyTop + 0.02);
  simcoe(bag);
}

// Simcoe Hall: three storeys, ivy over its north faces (and over the hall's north-west wall, which shares
// their line), buff stone elsewhere, a cornice and parapet.
function simcoe(bag) {
  const S = CH.simcoe, F = bag.at(S.at[0], S.at[1], rad(S.facing)), H = S.h;
  const rows = [1.2, 1.2 + S.storey, 1.2 + 2 * S.storey], wh = [2.6, 2.6, 2.1];
  const block = ([x0, z0, x1, z1], fronts) => {
    F.box("tan", x0, -1.5, z0, x1, H - 0.9, z1);
    F.box("darkStone", x0 - 0.2, H - 0.9, z0 - 0.2, x1 + 0.2, H, z1 + 0.2);                              // cornice
    F.box("roofTar", x0 + 0.3, H, z0 + 0.3, x1 - 0.3, H + 0.05, z1 - 0.3);
    return fronts;
  };
  block(S.main); block(S.porch); block(S.wing);
  // the north faces: ivy over a dark wall, windows standing proud
  const north = (x0, x1, z, seed) => {
    F.face("ivyWall", x0, -1.2, x1, H - 0.9, z + 0.02);
    ivy(F, x0, x1, 0.8, H - 1.0, z, seed);
    for (let x = x0 + 2.1; x < x1 - 1.4; x += S.winPitch) rows.forEach((y, r) => window(F, x, y, 1.5, wh[r], z + 0.4, { lintel: 0.3, side: 0.25 }));
  };
  north(S.ivyFrom, S.porch[0], 0, 0);
  north(S.wing[0], S.wing[2], S.wing[3], 11);
  north(S.porch[0], S.porch[2], S.porch[3], 23);
  // the wing's east side, facing the hall: ivy too (H1 shows the green running on past the frame)
  const E = bag.at(...F.p(S.wing[0], 0, S.porch[3]).filter((_, i) => i !== 1), rad(S.facing) - Math.PI / 2);
  E.face("ivyWall", 0, -1.2, S.wing[3] - S.porch[3], H - 0.9, 0.02);
  ivy(E, 0, S.wing[3] - S.porch[3], 0.8, H - 1.0, 0, 31);
  // the bare stone faces: the west side and the back, with windows
  const W = bag.at(...F.p(S.main[2], 0, S.wing[3]).filter((_, i) => i !== 1), rad(S.facing) + Math.PI / 2);
  for (let x = 2.5; x < S.wing[3] - S.main[1] - 2; x += 5.2) rows.forEach((y, r) => window(W, x, y, 1.5, wh[r], 0, { lintel: 0.3 }));
  const B = bag.at(...F.p(S.main[2], 0, S.main[1]).filter((_, i) => i !== 1), rad(S.facing) + Math.PI);
  for (let x = 2.5; x < S.main[2] - S.main[0] - 2; x += 5.2) rows.forEach((y, r) => window(B, x, y, 1.5, wh[r], 0, { lintel: 0.3 }));
  // the main entrance in the porch block, under a cream surround
  const xm = (S.porch[0] + S.porch[2]) / 2;
  F.face("frame", xm - 1.5, 0, xm + 1.5, 4.0, S.porch[3] + 0.5);
  F.face("door", xm - 1.1, 0, xm + 1.1, 3.4, S.porch[3] + 0.6);
  F.box("cream", xm - 2.0, 4.0, S.porch[3], xm + 2.0, 4.6, S.porch[3] + 0.8);
}

// =================================================================== College Park Center
// Real metres. The origin is the middle of the glass entrance front, which is the north-east chamfer of the
// building (C1's camera, from its geotag 111 m north-east of the arena with its EXIF 25 mm lens, sees the
// front subtend 35.4 degrees: the chamfer from there subtends 35.9). +z faces out of the glass (bearing 45),
// +x runs to its right (bearing 315), toward the tower and the north face. y is up.
// PLAN: OpenStreetMap way 286854828 (11,341 m2), vertices in east/north metres about its centroid, turned into
// this frame; the roof octagon from the aerial (Esri World Imagery z19-20). HEIGHTS: C1 at 16.6 px/m on the
// glass (889 px focal length at 53.5 m), C4 and C3 checked at their own geotags and lenses.
const OSM_CPC = {          // OSM way 286854828: [east, north] metres about its centroid (32.730395, -97.108033)
  frontL: [48.3, 34.1], frontR: [23.3, 59.1],                       // the glass front: the north-east chamfer, 35.4 m
  tower: [[23.3, 59.1], [23.4, 66.8], [18.5, 66.8], [18.6, 68.1], [14.1, 68.1], [14.0, 64.0]],   // the tan tower box (vertices 20-15)
  nw: [-44.7, 64.6],                                                // the north-west corner under the hip canopy
  west: [[-45.0, 38.4], [-55.5, 38.5], [-56.2, -26.9], [-45.0, -26.9]],   // the west glass wing (vertices 13-11, closed on the main block's wall)
  annex: [[-52.5, -26.9], [-53.0, -71.3], [-9.2, -71.7], [-9.1, -61.7], [-1.4, -61.8], [-1.1, -38.9], [17.4, -39.1], [17.4, -31.0], [-45.0, -31.0], [-45.0, -26.9]],
  dock: [[17.4, -31.0], [29.6, -31.0], [29.4, -49.4], [17.3, -49.2]],
  se: [[25.9, -31.0], [47.9, -9.6]],                               // the south-east chamfer
};
const toCpc = ([e, n]) => { const de = e - 35.8, dn = n - 46.6; return [0.7071 * (dn - de), 0.7071 * (de + dn)]; };
const CS = 0.774;          // C1 scale: the earlier reads were at 12.85 px/m; the glass is at 16.6 px/m
export const CPC = {
  front: 35.4,             // OSM chamfer length; the bays below (C1 pixel runs) are stretched 2.6% to it
  glassH: 12.7 * CS,       // ground to canopy underside: C1 y 548 to 385
  floorAt: 4.3 * CS,       // first-floor spandrel centre: C1 y 487-500
  spandrelH: 1.0 * CS,
  fascia: 1.3 * CS,        // canopy fascia, with the rise of its sloped top
  rise: 1.7 * CS,
  overhang: 6.5 * CS,      // the canopy stands out from the glass
  panel: 1.6 * CS,         // fascia panel module: C1 joints every 21 px
  octTop: 17.5,            // the bowl's silver roof edge: C1 gives 17.0 m on the camera fitted at its geotag, the Green photo 19 m over the annex
  octFascia: 3.2,          // the silver band: C1 3.4 m (51 px at 15.1 px/m), the Green photo a little less
  deckH: 11.0,             // the concourse roof between the canopies and the bowl
  towerTop: 19.0,          // tan tower: C1 y 263 and 235 at its two front corners, on the fitted camera (59 m, 15.1 px/m)
  courses: 24,             // ashlar courses counted on the tower in C1
  louvre: [3.6 * CS, 3.1 * CS, 15.4 * CS],   // louvre width, height, sill: C1 x 1045-1090, y 310-350
  slotW: 3.7 * CS,         // blue glass slot beside the tower: C1 x 1100-1150
  slotH: 16.0 * CS,
  slotRows: 12,
  capTop: 20.3 * CS,       // brick box over the slot
  hipEave: 13.5,           // the north face's hip canopy: eave at C1's far right (66.7 m, 13.3 px/m) and C4 (14-16 m at the corner)
  hipOut: 7.0,             // its overhang: C4, the hip's corner about 8.5 m out on the diagonal
  hipFascia: 1.2,
  pylons: 5,               // brick pylons along the north face under the hip (C4: four seen and one behind the tree)
  pylonH: 11.6,            // C4: their stone caps at y 305 on the camera fitted at C4's geotag
  westH: 11.0,             // the west glass wing with vertical fins (C3, C4)
  annexH: 11.3,            // the south annex, buff brick under a silver band: C3 y 295 to 563 at its corner, 36 m from the geotag
  annexSlots: 4,           // tall windows over a dark arcade on its west face (C3)
  mavTop: 19.0,            // the south-west tower with the MAVERICKS banner: C3 y 301 against the annex's 295 at half the distance
  poles: 4,                // flagpoles, half-mast in C1
  poleH: 7.7,              // 155 px at their own depth (44 m, 20.2 px/m)
  poleX: [-1.6, 4.4, 10.3, 16.5],   // C1 x = 606, 702, 797, 896 between the corner (348) and the tower (915)
  poleZ: [7.4, 9.8, 9.8, 7.4],
  // The front's bays left to right: [kind, width m, panes]. Widths from C1 pixel runs, scaled to the 35.4 m chamfer.
  bays: [
    ["glass", 10.7, 3], ["brickWide", 6.6], ["glass", 4.8, 2], ["stone", 1.8], ["glass", 5.0, 2, "gate"],
    ["brick", 0.8], ["glass", 4.8, 2, "gate"], ["stone", 1.5], ["glass", 3.7, 2], ["brick", 1.2], ["glass", 3.7, 2],
  ],
};
// The roof octagon over the bowl (aerial): the outer walls set 6 m in on the north, north-east, east, south-east and
// south, its west side on the main block's west roof edge, 18 m chamfers at the north-west and south-west.
const OCT = [[-21.8, 58.3], [15.6, 58.3], [42.1, 31.8], [42.1, -6.6], [23.7, -25.0], [-21.8, -25.0], [-39.8, -7.0], [-39.8, 40.3]];
const MAIN = [OSM_CPC.frontL, OSM_CPC.frontR, [14.0, 64.0], OSM_CPC.nw, [-45.0, 38.4], [-45.0, -31.0], [25.9, -31.0], [47.9, -9.6]];

// Key points (the origin is the middle of the glass front).
export const CPC_KEYS = {
  cornerBase: [-CPC.front / 2, 0.6, 0], cornerTop: [-CPC.front / 2, CPC.glassH, 0],
  towerEdgeBase: [CPC.front / 2, 0.6, 0], towerTop: [CPC.front / 2, CPC.towerTop, 0],
  towerFront: [...(([x, z]) => [x, 0, z])(toCpc([23.4, 66.8]))],
  canopyL: [-CPC.front / 2, CPC.glassH + CPC.fascia, CPC.overhang],
  octEdge: [0, CPC.octTop, -6.0],
  nwCorner: [...(([x, z]) => [x, 0, z])(toCpc(OSM_CPC.nw))],
};

// Glass bays along a wall frame: `panes` wide, rows of upper glazing over a spandrel and a lower row.
function glazing(F, x, w, panes, top, k, z = 0) {
  const { floorAt, spandrelH } = CPC, y0 = floorAt + spandrelH / 2, rows = 3, rowH = (top - 0.1 - y0) / rows, pw = w / panes;
  for (let c = 0; c < panes; c++) {
    const xa = x + c * pw;
    F.face((c + k) % 2 ? "cpcGlass" : "cpcGlassDk", xa + 0.06, y0 + 0.05, xa + pw - 0.06, top - 0.1, z);
    F.face((c + k + 1) % 2 ? "cpcGlass" : "cpcGlassDk", xa + 0.06, 0.5, xa + pw - 0.06, floorAt - spandrelH / 2 - 0.05, z);
  }
  F.face("spandrel", x, floorAt - spandrelH / 2, x + w, floorAt + spandrelH / 2, z + 0.06);
  for (let c = 0; c <= panes; c++) F.face("mullion", x + c * pw - 0.06, 0.4, x + c * pw + 0.06, top, z + 0.1);
  for (let r = 0; r <= rows; r++) F.face("mullion", x, y0 + r * rowH - 0.05, x + w, y0 + r * rowH + 0.05, z + 0.1);
  F.face("mullion", x, 2.0, x + w, 2.1, z + 0.1);
}

// A canopy along an open run of wall points: fascia at the eave `out` beyond the walls, a soffit rising from the eave to
// the wall at `wallTop`, a top surface rising from the fascia to `topIn` at `inset` behind the walls.
function canopy(bag, pts, inside, { out, eave, fascia, wallTop, topIn, inset }) {
  const O = offsetLine(pts, out, inside), I = offsetLine(pts, -inset, inside), ef = eave + fascia;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = O[i], b = O[i + 1], wa = pts[i], wb = pts[i + 1], ia = I[i], ib = I[i + 1];
    bag.quad("silver", [a[0], eave, a[1]], [b[0], eave, b[1]], [b[0], ef, b[1]], [a[0], ef, a[1]]);
    bag.quad("soffitLt", [wa[0], wallTop, wa[1]], [wb[0], wallTop, wb[1]], [b[0], eave, b[1]], [a[0], eave, a[1]]);
    bag.quad("roofWhite", [a[0], ef, a[1]], [b[0], ef, b[1]], [ib[0], topIn, ib[1]], [ia[0], topIn, ia[1]]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / CPC.panel);
    for (let j = 1; j < n; j++) {                                                                  // fascia joints
      const t = j / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, dx = (b[0] - a[0]) / L * 0.04, dz = (b[1] - a[1]) / L * 0.04;
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, s = nx * (a[0] - inside[0]) + nz * (a[1] - inside[1]) > 0 ? 0.03 : -0.03;
      bag.quad("fasciaJoint", [x - dx + nx * s, eave, z - dz + nz * s], [x + dx + nx * s, eave, z + dz + nz * s], [x + dx + nx * s, ef, z + dz + nz * s], [x - dx + nx * s, ef, z - dz + nz * s]);
    }
  }
  for (const [i, j] of [[0, 0], [pts.length - 1, pts.length - 1]]) {                               // the two open ends
    const a = O[i], w = pts[j], c = I[j];
    bag.quad("silver", [w[0], wallTop, w[1]], [a[0], eave, a[1]], [a[0], ef, a[1]], [c[0], topIn, c[1]]);
  }
}

function cpcParts(bag) {
  const M = MAIN.map(toCpc), O = OCT.map(toCpc), ctr = toCpc([0, 15]), { glassH: HG, fascia, rise, overhang, floorAt, spandrelH } = CPC;
  const L = CPC.front, x0 = -L / 2, F = bag.at(x0, 0, 0), sx = L / CPC.bays.reduce((a, b) => a + b[1], 0);
  // ---- plaza, curb, the front plinth
  F.deck("pavers", -14, 0.9, L + 14, 22, 0.04);
  F.deck("walk", -14, 15.5, L + 14, 16.3, 0.06);
  F.box("walk", -14, 0, 22, L + 14, 0.2, 22.5);
  F.box("limestone", -0.6, -3, -1.2, L + 0.2, 0.5, 1.0);
  // ---- the main block: concourse walls to the deck, everything below the canopies
  prism(bag, "cpcBrick", M, -3, CPC.deckH, "roofWhite");
  // ---- the glass front, bay by bay
  let x = 0, k = 0;
  for (const [kind, w0, panes, tag] of CPC.bays) {
    const w = w0 * sx, x1 = x + w;
    if (kind === "glass") {
      glazing(F, x, w, panes, HG, k, 0.05);
      if (tag === "gate") {                                                       // a door pair under a GATE sign
        const xm = x + w / 2;
        F.face("cpcGlassDk", xm - 1.2, 0.5, xm + 1.2, 2.5, 0.2);
        F.face("mullion", xm - 0.05, 0.5, xm + 0.05, 2.5, 0.24);
        F.face("lampPost", xm - 1.2, 2.65, xm + 1.2, 3.1, 0.24);
      }
    } else {
      const m = kind === "stone" ? "limestone" : "cpcBrick";
      F.box(m, x, 0, -0.5, x1, HG, 0.7);                                          // the pier stands 0.7 m proud of the glass
      F.box(kind === "stone" ? "limestoneLt" : "limestone", x - 0.08, HG - 0.4, -0.5, x1 + 0.08, HG, 0.82);
      F.box("limestone", x - 0.08, 0, -0.5, x1 + 0.08, 0.7, 0.8);
      if (kind === "brickWide") F.face("limestoneLt", x + (w - 1.5) / 2, 1.4, x + (w + 1.5) / 2, 7.6, 0.75);
    }
    x = x1; k++;
  }
  // ---- the east face (C1 left): cream piers with dark glass between, under the canopy
  const east = [toCpc(OSM_CPC.frontL), toCpc([47.9, -9.6])];
  { const { F: E, L: le } = wallAt(bag, east[0], east[1], ctr);
    for (let t = 1.6; t < le - 2; t += 5.4) {
      E.box("limestone", t, 0, -0.3, t + 2.1, HG, 0.6);
      E.face("cpcGlassDk", t + 2.1, 0.5, t + 5.4, HG - 0.3, 0.05);
      E.face("mullion", t + 3.7, 0.5, t + 3.8, HG - 0.3, 0.1);
    }
  }
  // ---- the south-east chamfer: a glass curtain between cream stone piers (the Green photo)
  { const { F: E, L: le } = wallAt(bag, toCpc(OSM_CPC.se[0]), toCpc(OSM_CPC.se[1]), ctr);
    glazing(E, 5.0, le - 13.0, 6, HG + 0.8, 0, 0.05);
    for (const t of [2.0, le - 8.0, le - 4.5]) E.box("limestone", t, 0, -0.3, t + 2.4, HG + 1.0, 0.6);
  }
  // ---- the canopy along the glass front and the east face
  canopy(bag, [toCpc(OSM_CPC.frontR), toCpc(OSM_CPC.frontL), toCpc([47.9, -9.6])], ctr, { out: overhang, eave: HG, fascia, wallTop: HG, topIn: HG + fascia + rise, inset: 0.6 });
  // ---- the bowl: the octagon's silver band and its white roof, a crease ring of the raised middle
  prism(bag, "silver", O, CPC.deckH, CPC.octTop - CPC.octFascia, null);
  prism(bag, "silver", O, CPC.octTop - CPC.octFascia, CPC.octTop, "roofWhite");
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(len / 1.4);
    const { F: E } = wallAt(bag, a, b, ctr);
    for (let j = 1; j < n; j++) E.face("fasciaJoint", (len * j) / n - 0.03, CPC.octTop - CPC.octFascia, (len * j) / n + 0.03, CPC.octTop, 0.03);
    E.face("silverSh", 0, CPC.octTop - CPC.octFascia, len, CPC.octTop - CPC.octFascia + 0.3, 0.06);
  }
  const OI = O.map(([px, pz]) => [ctr[0] + (px - ctr[0]) * 0.86, ctr[1] + (pz - ctr[1]) * 0.86]);
  prism(bag, "silverSh", OI, CPC.octTop, CPC.octTop + 0.35, "roofWhite");
  // ---- the north face under the hip canopy: brick pylons with cream panels and banners, a glass wall between
  const nA = toCpc([14.0, 64.0]), nB = toCpc(OSM_CPC.nw), nC = toCpc([-45.0, 38.4]);
  { const { F: N, L: ln } = wallAt(bag, nA, nB, ctr), step = (ln - 4) / CPC.pylons;
    glazing(N, 0.3, ln - 0.6, Math.round(ln / 2.4), 12.6, 1, 0.05);
    N.face("cpcGlassDk", 0.3, 12.6, ln - 0.3, CPC.hipEave + 1.6, 0.05);           // the clerestory up to the hip's soffit
    for (let i = 0; i < CPC.pylons; i++) {
      const t = 4 + i * step + step / 2;
      N.box("cpcBrick", t - 1.6, 0, 0, t + 1.6, CPC.pylonH - 0.6, 2.6);
      N.box("limestone", t - 1.75, CPC.pylonH - 0.6, -0.1, t + 1.75, CPC.pylonH, 2.75);
      N.box("limestone", t - 1.75, 0, -0.1, t + 1.75, 0.9, 2.75);
      N.face("limestoneLt", t - 0.9, 2.0, t + 0.9, 8.6, 2.62);
      N.face("banner", t - 0.55, 3.0, t + 0.55, 8.2, 2.7);
    }
    N.box("limestone", 5, 0, 12, ln - 3, 1.4, 12.6);                             // the low wall of Moritz Plaza (C2)
    N.deck("pavers", 0, 0, ln, 18, 0.04);
  }
  { const { F: N, L: ln } = wallAt(bag, nB, nC, ctr);                             // the hip's west side
    glazing(N, 0.3, ln - 0.6, Math.round(ln / 2.4), 12.6, 0, 0.05);
    N.face("cpcGlassDk", 0.3, 12.6, ln - 0.3, CPC.hipEave + 1.6, 0.05);
    for (const t of [ln * 0.3, ln * 0.75]) { N.box("cpcBrick", t - 1.6, 0, 0, t + 1.6, CPC.pylonH - 0.6, 2.6); N.box("limestone", t - 1.75, CPC.pylonH - 0.6, -0.1, t + 1.75, CPC.pylonH, 2.75); N.face("limestoneLt", t - 0.9, 2.0, t + 0.9, 8.6, 2.62); }
  }
  // the hip canopy: eave level round the north-west corner, its top rising to the bowl's roof edge
  canopy(bag, [toCpc([16.0, 64.0]), nB, nC], ctr, { out: CPC.hipOut, eave: CPC.hipEave, fascia: CPC.hipFascia, wallTop: CPC.hipEave + 1.6, topIn: CPC.octTop - 0.1, inset: 6.0 });
  { const O = offsetLine([nA, nB, nC], CPC.hipOut, ctr), lo = CPC.hipEave - 0.06, hi = CPC.hipEave + 1.54;   // dark beams under the hip's soffit (C4)
    const beam = (w, e) => { const d = [e[0] - w[0], e[1] - w[1]], L = Math.hypot(d[0], d[1]), n = [-d[1] / L * 0.22, d[0] / L * 0.22];
      bag.quad("beam", [w[0] - n[0], hi, w[1] - n[1]], [w[0] + n[0], hi, w[1] + n[1]], [e[0] + n[0], lo, e[1] + n[1]], [e[0] - n[0], lo, e[1] - n[1]]); };
    beam(nB, O[1]);                                                                  // the hip beam to the corner
    for (const [a, b, oa, ob] of [[nB, nA, O[1], O[0]], [nB, nC, O[1], O[2]]])
      for (let t = 0.12; t < 0.95; t += 0.14) beam([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [oa[0] + (ob[0] - oa[0]) * t, oa[1] + (ob[1] - oa[1]) * t]);
  }
  // ---- the tan tower with its 24 courses and louvre, the blue slot and brick on its north side
  const T = OSM_CPC.tower.map(toCpc);
  prism(bag, "limestone", T, -3, CPC.towerTop);
  const tc = T.reduce((a, p) => [a[0] + p[0] / T.length, a[1] + p[1] / T.length], [0, 0]);
  prism(bag, "limestoneLt", T.map(([px, pz]) => [tc[0] + (px - tc[0]) * 1.05, tc[1] + (pz - tc[1]) * 1.05]), CPC.towerTop, CPC.towerTop + 0.4);   // coping
  { const { F: Tf, L: lt } = wallAt(bag, T[0], T[1], ctr);
    for (let i = 1; i < CPC.courses; i++) { const y = (i * CPC.towerTop) / CPC.courses; Tf.face("course", 0, y - 0.04, lt, y + 0.04, 0.03); }
    const [lw, lh, ls] = CPC.louvre;
    Tf.face("louvre", lt - 1.0 - lw, ls, lt - 1.0, ls + lh, 0.06);
    for (let i = 1; i < 10; i++) Tf.face("fasciaJoint", lt - 1.0 - lw, ls + (i * lh) / 10 - 0.03, lt - 1.0, ls + (i * lh) / 10 + 0.03, 0.08);
    const { F: Ts, L: ls2 } = wallAt(bag, T[1], T[2], ctr);
    Ts.box("cpcBrick", -0.1, -3, -0.2, ls2 + 0.1, CPC.capTop, 0.3);
    const srow = CPC.slotH / CPC.slotRows;
    for (let r = 0; r < CPC.slotRows; r++) Ts.face(r % 2 ? "cpcGlass" : "cpcGlassDk", 0.3, 0.5 + r * srow + 0.04, 0.3 + CPC.slotW, 0.5 + (r + 1) * srow - 0.4, 0.34);
    Ts.face("mullion", 0.3 + CPC.slotW / 2 - 0.05, 0.5, 0.3 + CPC.slotW / 2 + 0.05, CPC.slotH, 0.38);
    for (let i = 1; i < CPC.courses; i++) { const y = (i * CPC.towerTop) / CPC.courses; if (y > CPC.capTop) Ts.face("course", 0, y - 0.04, ls2, y + 0.04, 0.03); }
  }
  // ---- the west glass wing: vertical fins over two storeys of glass, a silver roof edge (C3, C4)
  const Wp = OSM_CPC.west.map(toCpc), wC = toCpc([-50, 5]);
  prism(bag, "cpcGlassDk", Wp, -3, CPC.westH - 1.2, null);
  prism(bag, "silver", Wp, CPC.westH - 1.2, CPC.westH, "roofWhite");
  { const { F: Wf, L: lw } = wallAt(bag, Wp[1], Wp[2], wC);
    for (let t = 1.0; t < lw; t += 2.2) Wf.box("silverSh", t, 0.4, 0, t + 0.3, CPC.westH - 1.2, 0.9);
    Wf.box("limestone", 0, 0, 0, lw, 0.8, 0.4);
    for (const y of [3.9, 7.2]) Wf.face("spandrel", 0, y, lw, y + 0.5, 0.05);
  }
  // ---- the south annex: buff brick, a silver band, tall windows over a dark arcade on its west face, the sign on its south
  const A = OSM_CPC.annex.map(toCpc), aC = toCpc([-25, -50]);
  prism(bag, "cpcBuff", A, -3, CPC.annexH - 1.6, null);
  prism(bag, "silver", A, CPC.annexH - 1.6, CPC.annexH, "roofWhite");
  { const { F: Aw, L: la } = wallAt(bag, A[0], A[1], aC), step = la / (CPC.annexSlots + 1.6);
    for (let i = 0; i < CPC.annexSlots; i++) {
      const t = step * (i + 0.8);
      Aw.face("cpcGlassDk", t, 4.2, t + step * 0.55, CPC.annexH - 2.4, 0.05);
      Aw.face("mullion", t + step * 0.27, 4.2, t + step * 0.27 + 0.1, CPC.annexH - 2.4, 0.1);
      Aw.face("cpcGlassDk", t - step * 0.1, 0, t + step * 0.65, 3.6, 0.05);           // the dark arcade
      Aw.box("limestone", t - step * 0.45 + 0.2, 0, -0.1, t - step * 0.1, 1.8, 0.5);
    }
    const { F: As, L: ls3 } = wallAt(bag, A[1], A[2], aC);
    let lx = 3.0;
    for (const ch of "COLLEGE PARK CENTER") { if (ch !== " ") As.face("lampPost", lx, 8.0, lx + 0.4, 8.7, 0.06); lx += ch === " " ? 0.8 : 0.58; }
    As.box("cpcBuffDk", ls3 - 0.6, 0, -0.1, ls3, CPC.annexH - 1.6, 0.3);
  }
  // the south-west tower at the annex corner, with its MAVERICKS banner (C3)
  { const mv = [[-60.5, -33.0], [-49.5, -33.0], [-49.5, -24.0], [-60.5, -24.0]].map(toCpc);   // C3: its banner face is 11.7 m across, square to the camera
    prism(bag, "limestone", mv, -3, CPC.mavTop - 3.2, null);
    prism(bag, "cpcBuff", mv, CPC.mavTop - 3.2, CPC.mavTop);                       // its top in buff brick over the stone (C3)
    prism(bag, "limestoneLt", mv, CPC.mavTop, CPC.mavTop + 0.3);
    const { F: Mf, L: lm } = wallAt(bag, mv[0], mv[1], toCpc([-55, -28]));
    Mf.face("bannerWh", lm / 2 - 1.0, 2.5, lm / 2 + 1.0, 15.2, 0.06);               // a white banner, MAVERICKS in blue down it
    Mf.face("banner", lm / 2 - 0.35, 3.2, lm / 2 + 0.35, 12.6, 0.1);
  }
  prism(bag, "cpcBuffDk", OSM_CPC.dock.map(toCpc), -3, 6.0, "roofWhite");
  // ---- forecourt: planter wall, ornamental grass, flagpoles, lamp posts with banners, bollards, live oaks
  F.box("planterWall", 6, 0, 10.1, 33, 0.8, 11.2);
  F.box("grassDry", 6.3, 0.8, 8.2, 32.7, 1.4, 10.1);
  F.box("planterWall", 10.5, 0, 6.5, 20, 0.6, 7.3);
  for (let i = 0; i < CPC.poles; i++) {
    const px = L / 2 + CPC.poleX[i], pz = CPC.poleZ[i], Fp = bag.at(x0 + px, pz, 0);
    lathe(bag, "pole", x0 + px, pz, [[0.08, 0], [0.06, CPC.poleH], [0.13, CPC.poleH], [0.0, CPC.poleH + 0.2]], 6);
    const fy = CPC.poleH - 3.2, m = ["flagWhite", "flagRed", "flagBlue", "flagWhite"][i];
    Fp.face(m, 0.08, fy, 1.55, fy + 0.95, 0.02);
    if (i === 1) Fp.face("flagBlue", 0.08, fy, 0.6, fy + 0.95, 0.04);
    if (i === 2) { Fp.face("flagWhite", 0.08, fy, 1.55, fy + 0.48, 0.04); Fp.face("flagBlue", 0.08, fy + 0.48, 0.65, fy + 0.95, 0.04); }
  }
  for (const [lx2, lz] of [[-0.5, 19], [14, 19], [L + 4, 19]]) {
    lathe(bag, "lampPost", x0 + lx2, lz, [[0.12, 0], [0.09, 3.6]], 6);
    const Fl = bag.at(x0 + lx2, lz, 0);
    Fl.box("lampPost", -0.26, 3.6, -0.26, 0.26, 4.0, 0.26);
    Fl.face("banner", 0.1, 2.0, 0.72, 3.3, 0.03); Fl.face("banner", -0.72, 2.0, -0.1, 3.3, 0.03);
  }
  for (let i = 0; i < 6; i++) lathe(bag, "lampPost", x0 + L + 2 + i * 2.1, 19.4 + (i % 2) * 0.3, [[0.11, 0], [0.11, 0.8], [0.0, 0.9]], 6);
  for (const [ox, oz, os] of [[-12, 13, 0.8], [L + 9, 12, 0.8]]) {               // live oaks
    lathe(bag, "trunk", x0 + ox, oz, [[0.3 * os, 0], [0.21 * os, 2.6 * os]], 6);
    lathe(bag, "oak", x0 + ox, oz, [[0.2, 2.1 * os], [2.7 * os, 2.8 * os], [3.7 * os, 4.2 * os], [2.9 * os, 5.3 * os], [1.0 * os, 5.9 * os]], 9);
    lathe(bag, "oakLt", x0 + ox + 0.6, oz - 0.5, [[1.4 * os, 5.0 * os], [2.1 * os, 5.5 * os], [0.3 * os, 6.1 * os]], 7);
  }
}

// ------------------------------------------------------------------ public builders
// Ground each landmark keeps clear of trees and rocks: circles [x, z, r] in its own real metres, a greedy cover of
// its footprint (the hall with its forecourt and Simcoe Hall; the arena with its plaza).
const HALL_CLEAR = [[27, -22, 31], [61, -4, 14], [-1, 9, 31], [19, -52, 29], [-17, -21, 16]];
const CPC_CLEAR = [[7, -32, 35], [-13, -96, 35], [41, -61, 35], [-39, -50, 35], [-4, 2, 34], [-29, -129, 34], [26, -99, 12], [42, -19, 23]];
const clear = (list, scale) => list.map(([x, z, r]) => [x * scale, z * scale, r * scale]);

// Convocation Hall: D is the dome's base diameter in scene metres. Returns the scene height, the ground it keeps
// clear (circles in scene metres in its own frame), the build's triangle count and the scale.
export function convocationHall(k, st, D) {
  const scale = D / (2 * CH.domeR), bag = new Bag();
  hallParts(bag);
  bag.flush(k.add, st, scale);
  return { H: CH.capTop * scale, clear: clear(HALL_CLEAR, scale), tris: bag.count, scale };
}

// College Park Center: L is the glass front's length in scene metres. Returns as convocationHall does.
export function collegeParkCenter(k, st, L) {
  const scale = L / CPC.front, bag = new Bag();
  cpcParts(bag);
  bag.flush(k.add, st, scale);
  return { H: CPC.towerTop * scale, clear: clear(CPC_CLEAR, scale), tris: bag.count, scale };
}
