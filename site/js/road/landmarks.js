// The two landmarks of the road strip, built from measurement rather than from impression:
// Convocation Hall (University of Toronto) at the start and College Park Center (UT Arlington)
// at the end. Every number is real metres with its source beside it; a builder scales the whole
// building by one factor when it sets it down in the scene.
//
// Method (the anatomy discipline, applied to three.js geometry): truth first, a parts list, a
// recognisable real object made of many small exact parts, then checking against photographs.
// Parts are flat-coloured, lightly jittered low-poly pieces, merged into one geometry per
// material so a building costs a handful of draw-time vertices and a few milliseconds to build.
import * as THREE from "../../vendor/three.module.min.js";

const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;

// ------------------------------------------------------------------ materials
// name -> [colour, face jitter, edge angle]. null draws no outline (small flat details on a building that is
// always in colour: the hall's panes, ribs, joints); 181 draws only the boundary of a flat piece, so the arena's
// glass and mullions still show as ink while it is plaster; 40 draws hard corners and leaves curved walls clean.
const MAT = {
  // Convocation Hall
  brick: ["#665d50", 0.05, 40],        // dark buff brick of the rotunda
  brickLt: ["#74695b", 0.06, 40],      // the lighter tone on the attic and end drums
  base: ["#a2957c", 0.05, 40],         // banded limestone base courses
  cream: ["#e0d8c4", 0.03, 40],        // limestone dressings: cornices, surrounds, panels
  creamSh: ["#b9ad92", 0.03, 40],      // architrave and frieze, in the shade of the cornice
  column: ["#c3b99f", 0.03, 60],
  door: ["#7e4c2b", 0.03, 60],
  glass: ["#2b3236", 0.02, null],
  frame: ["#ebe6d8", 0.02, null],
  soffit: ["#3c3630", 0.02, 60],
  dentil: ["#4b4438", 0.02, null],
  ledge: ["#8f918d", 0.03, 40],
  skylight: ["#eef1ee", 0.02, null],
  band: ["#3d5851", 0.04, 40],         // dark copper band under the dome
  cuLo: ["#659d8a", 0.05, 25],
  cuHi: ["#74ac98", 0.05, 25],
  rib: ["#8dbaa8", 0.04, null],
  seam: ["#3f6f60", 0.04, 181],
  vent: ["#34504a", 0.03, null],
  chim: ["#6d6258", 0.05, 40],
  chimCap: ["#8b7e71", 0.04, 40],
  tan: ["#c2ad84", 0.06, 40],          // the left wing's buff stone
  tanBase: ["#a48f6d", 0.05, 40],
  ivyWall: ["#455a38", 0.08, 40],      // the wall behind the ivy
  darkStone: ["#6a6358", 0.05, 40],
  ivy: ["#4f7f39", 0.06, null],
  ivyDk: ["#3f6b31", 0.06, null],
  ivyLt: ["#62914a", 0.06, null],
  paving: ["#a9a69e", 0.02, 60],
  // College Park Center
  silver: ["#b4bdc6", 0.02, 60],
  silverSh: ["#98a1a8", 0.02, 60],
  fasciaJoint: ["#8e979e", 0.02, null],
  soffitDk: ["#4b4e52", 0.02, 60],
  panel: ["#d8d2bf", 0.03, 60],
  cpcGlass: ["#2e5d93", 0.02, 181],
  cpcGlassDk: ["#223f66", 0.02, 181],
  mullion: ["#aeb3b6", 0.02, 181],
  spandrel: ["#d9dbd8", 0.02, 181],
  cpcBrick: ["#a45b42", 0.06, 40],
  cpcBrickDk: ["#8d4a35", 0.05, 40],
  cpcBuff: ["#c4955f", 0.06, 40],      // the long walls are buff brick (C3); only the entrance piers and the end are red
  cpcBuffDk: ["#a97b4d", 0.05, 40],
  limestone: ["#d3c6a5", 0.04, 40],
  limestoneLt: ["#dccfae", 0.04, 181],
  course: ["#b8aa88", 0.02, null],
  louvre: ["#b9bcbc", 0.02, 181],
  pavers: ["#c8a58e", 0.05, 60],
  walk: ["#bdb7ab", 0.03, 60],
  planterWall: ["#cdbf9c", 0.04, 40],
  grassDry: ["#a89462", 0.07, null],
  roofGrey: ["#8c908f", 0.03, 40],
  unit: ["#6f7578", 0.03, 40],
  pole: ["#f1f1ee", 0.01, 60],
  lampPost: ["#26282b", 0.01, 60],
  banner: ["#2a3f86", 0.02, 181],
  flagRed: ["#b3322d", 0.02, 181],
  flagBlue: ["#2d3f7d", 0.02, 181],
  flagWhite: ["#f0efea", 0.02, 181],
  trunk: ["#5a4a3a", 0.04, 60],
  oak: ["#52693a", 0.1, 60],
  oakLt: ["#62793f", 0.1, 60],
  asphalt: ["#6d6f72", 0.02, 60],
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
    this.face(m, x0, y0, x1, y1, z0);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    this.deck(m, x0, z0, x1, z1, y1);
    if (bottom) this.deck(m, x0, z0, x1, z1, y0);
  }
  // A sloped-top block: `yf` high at the front (z1), `yb` high at the back (z0).
  wedge(m, x0, y0, z0, x1, y1f, y1b, z1) {
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1f, z1], [x0, y1f, z1]);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1b, z0], [x1, y1b, z0]);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1b, z0], [x1, y1f, z1]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1f, z1], [x0, y1b, z0]);
    this.quad(m, [x0, y1f, z1], [x1, y1f, z1], [x1, y1b, z0], [x0, y1b, z0]);
  }
  // A roof with its ridge along x: eaves at y0, ridge `rise` higher at mid-depth.
  gable(m, x0, x1, y0, rise, z0, z1) {
    const zm = (z0 + z1) / 2, yr = y0 + rise;
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, yr, zm], [x0, yr, zm]);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, yr, zm], [x1, yr, zm]);
    this.tri(m, [x0, y0, z0], [x0, y0, z1], [x0, yr, zm]);
    this.tri(m, [x1, y0, z1], [x1, y0, z0], [x1, yr, zm]);
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

// =================================================================== Convocation Hall
// Real metres. The rotunda's centre is the origin and the front (the colonnade) faces +z.
// Plan figures are from OpenStreetMap way 330718925 (Overpass, read-only); heights are read from
// the front photograph H1 (Convocation_Hall_in_UofT.jpg) at 15.23 px/m, which comes from the
// bow-to-bow width 54.9 m = 836 px, and checked against H2 (the entrance) and H4 (the lawn).
export const CH = {
  // plan
  roofR: 24.3,            // cornice radius: least-squares circle through the back arc of OSM way 330718925
  bowSpan: 54.9,          // bow-to-bow width: OSM bbox of way 330718925
  frontReach: 28.9,       // centre to the portico's front edge: OSM vertices at the front
  wallR: 23.0,            // the brick wall behind the columns (OSM recessed vertices 20.8-22.9 m)
  atticR: 22.2,           // the attic wall, stepped in from the ground storey (H2)
  colR: 26.2,             // column axis radius; chord 6.1 m between columns (H2: 125 px at 22 px/m = 5.7 m)
  colCount: 6,            // counted on H2 (x = 312, 408, 535, 672, 806, 920) and on H3
  colStep: 6.1,           // metres between column axes
  bowAt: 62,              // bow drum centre, degrees from the front axis (puts the drum's front on frontReach)
  bowAtR: 24.2,           // bow drum centre radius
  bowR: 4.6,              // bow drum radius: 9 m across in H2 (200 px at 22 px/m)
  // heights (m)
  stylobate: 0.6,         // two low steps to the portico floor (H2)
  colTop: 12.2,           // column capital top: H1 y 665 to 482 at 15.1 px/m
  entTop: 15.5,           // portico entablature top: H1 y 433 at the fifth column (checked after the camera fit: 15.4 m)
  atticTop: 19.9,         // attic wall top under the cornice: H1 y 365
  corniceTop: 21.3,       // attic cornice top: H1 y 344
  bandTop: 22.1,          // top of the dark copper band: H1 y 332 (ground at y 668, 15.23 px/m)
  skirtTop: 24.2,         // top of the lighter copper skirt where the shell starts: H1 y 300
  capTop: 30.2,           // dome cap apex: H1 y 208; the whole hall is 30.2 m tall
  // dome
  domeR: 18.0,            // dome shell radius: 36 m across (H1 blend: skirt 540 px at 15.23 px/m = 35.5 m; the band under it 565 px = 37.1 m; H4 38 m)
  shoulderR: 6.6,         // where the shell meets the low conical cap: H1 x 540 to 730, 190 px
  shoulderY: 28.3,        // height of that shoulder: H1 y 238
  capR: 2.0,              // flat top of the cap
  ribs: 24,               // lighter standing-seam ribs (stylised: the real seams are finer than a pixel at 1280 px)
  // attic
  panelStep: 12.9,        // degrees between the five round-window panels: H1 projected spacing 54-77 px fits 12.9 degrees on a 22.2 m ring (12 degrees came out 7% tight)
  pavilionAt: 58,         // end attic pavilions (the carved-relief panels), degrees from the front
  // doors and windows: 5 bays between 6 columns (H2): plain, hooded, hooded double, hooded, plain
  bays: 5,
  // wings
  wingH: 14.9,            // ivy wing parapet: H1 y 440 (225 px at 15.1 px/m)
  storey: 4.7,            // 3 storeys
  ivyEdge: 4.2,           // outermost ivy-wing window centre inside the wing's end: H1 windows sit 1.6 m nearer the hall than a 2.6 m end pier puts them
  winPitch: 4.05,         // window pitch: H1 61 px at 15.1 px/m (the model projects 60.5 px, 0.7% apart)
  wingBays: [3, 5],       // bays built on the left (Simcoe Hall) and right (the ivy wing); the real wings run on past the strip's frame
  wingLen: [16.5, 24],    // their frontages: bays at 4.05 m plus the end piers
  wingFront: 9.0,         // wing front plane behind the hall's centre line (the drums stand in front of it)
  wingDepth: 22,
  chimneyAt: [21.3, -4.5],   // H1: x 930-970 against the hall centre at x 635: +20 to +22 m
  chimneyTop: 26.1,       // H1 y 272
};

// Key points the photo-match gate projects (name -> [x, y, z] in metres).
export const CH_KEYS = {
  capApex: [0, CH.capTop, 0],
  domeL: [-CH.domeR, CH.bandTop, 0], domeR: [CH.domeR, CH.bandTop, 0],
  colBaseC: [CH.colR * Math.sin(rad(6.67)), 0, CH.colR * Math.cos(rad(6.67))],
  colTopC: [CH.colR * Math.sin(rad(6.67)), CH.colTop, CH.colR * Math.cos(rad(6.67))],
  entTopC: [0, CH.entTop, 27.9], corniceTopC: [0, CH.corniceTop, CH.roofR],
  bowL: [-CH.bowSpan / 2, 0, 11.4], bowR: [CH.bowSpan / 2, 0, 11.4],
  wingRTop: [CH.wingFront + 40, CH.wingH, CH.wingFront],
  chimTop: [CH.chimneyAt[0], CH.chimneyTop, CH.chimneyAt[1]],
};

// One column on its stylobate, at angle `th` round the front. Returns nothing; adds to the bag.
function column(bag, th) {
  const R = CH.colR, x = R * Math.sin(th), z = R * Math.cos(th), s = CH.stylobate;
  const F = bag.at(x, z, th);
  F.box("column", -0.95, s, -0.95, 0.95, s + 0.5, 0.95);                        // plinth
  lathe(bag, "column", x, z, [[1.0, s + 0.5], [1.05, s + 0.62], [1.05, s + 0.78], [0.9, s + 0.9]], 12);   // torus base
  lathe(bag, "column", x, z, [[0.9, s + 0.9], [0.82, s + 1.2], [0.7, 11.0]], 12);                         // unfluted shaft, tapering
  lathe(bag, "column", x, z, [[0.7, 11.0], [0.66, 11.15], [0.78, 11.4], [0.98, 11.72]], 12);               // neck, echinus
  F.box("column", -1.0, 11.72, -1.0, 1.0, CH.colTop, 1.0);                                                 // abacus
  for (const sx of [-1, 1]) F.cylX("column", sx * 0.95 - 0.28, sx * 0.95 + 0.28, 11.7, 0.0, 0.34, 8);       // Ionic volutes
}

// The Hall: adds every part to `bag` in real metres.
function hallParts(bag) {
  const { wallR, atticR, colR } = CH;
  const SEG = 48;
  const frontA = [rad(-46), rad(46)];
  const cx = 0, cz = 0;

  // ---- ground and the portico platform
  bag.at().deck("paving", -52, 29, 52, 44, 0.03);                                                 // forecourt
  ring(bag, "paving", cx, cz, 28.9, 44, 0.05, 40, rad(-70), rad(70));
  band(bag, "base", cx, cz, wallR - 0.2, 28.9, -1.2, 0.3, 28, rad(-47), rad(47));                              // lower step
  band(bag, "base", cx, cz, wallR - 0.2, 27.9, -1.2, CH.stylobate, 28, rad(-45), rad(45));                     // stylobate: the portico floor
  // ---- the rotunda: banded base, brick wall, string course
  wall(bag, "base", cx, cz, wallR + 0.3, -1.2, 1.6, SEG, rad(46), rad(360 - 46));                      // banded stone base, round the back
  ring(bag, "base", cx, cz, wallR, wallR + 0.3, 1.6, SEG, rad(46), rad(360 - 46));
  wall(bag, "base", cx, cz, wallR + 0.4, 1.0, 1.25, SEG, rad(46), rad(360 - 46));                  // a base course line
  wall(bag, "brick", cx, cz, wallR, 1.6, CH.entTop - 1.7, SEG, rad(46), rad(360 - 46));            // brick wall round the back
  wall(bag, "brick", cx, cz, wallR, CH.stylobate, CH.entTop - 1.7, 20, rad(-46), rad(46));         // recessed wall behind the columns
  wall(bag, "cream", cx, cz, CH.roofR, CH.entTop - 1.7, CH.entTop, SEG, rad(46), rad(360 - 46));    // string course, all the way round
  ring(bag, "cream", cx, cz, atticR, CH.roofR, CH.entTop, SEG, rad(46), rad(360 - 46));
  ring(bag, "ledge", cx, cz, atticR, wallR + 1.6, CH.entTop, SEG, rad(-46), rad(46));               // the terrace over the portico
  // soffit of the portico, and the architrave, frieze and cornice that sit on the columns
  ring(bag, "soffit", cx, cz, wallR, 27.0, CH.colTop - 0.05, 24, rad(-47), rad(47));
  band(bag, "creamSh", cx, cz, colR - 0.9, colR + 0.8, CH.colTop, 14.0, 24, rad(-47), rad(47), true);   // architrave and frieze
  band(bag, "cream", cx, cz, colR - 0.9, 27.9, 14.0, CH.entTop, 24, rad(-47), rad(47));                  // cornice
  wall(bag, "cream", cx, cz, 27.5, 13.75, 14.05, 24, rad(-47), rad(47));                                 // dentil band under it
  for (let i = 0; i < 64; i++) {                                                                           // its dentils: 64 dark slots on the cornice's face
    const th = rad(-46.2 + i * 1.445), r = 27.93;
    const F = bag.at(r * Math.sin(th), r * Math.cos(th), th);
    F.face("dentil", -0.13, 14.2, 0.13, 14.85, 0);
  }
  band(bag, "brick", cx, cz, 25.0, 26.3, CH.entTop, CH.entTop + 0.8, 24, rad(-40), rad(40));             // terrace parapet
  ring(bag, "cream", cx, cz, 24.9, 26.4, CH.entTop + 0.8, 24, rad(-40), rad(40));
  // ---- six columns
  for (let i = 0; i < CH.colCount; i++) column(bag, ((i - (CH.colCount - 1) / 2) * CH.colStep) / colR);
  // ---- five bays between the columns: door, window above; hoods on bays 2 to 4, doubles on 3 and 4
  for (let i = 0; i < CH.bays; i++) {
    const th = ((i - (CH.bays - 1) / 2) * CH.colStep) / colR, F = bag.at(wallR * Math.sin(th), wallR * Math.cos(th), th);
    const hooded = i >= 1 && i <= 3, dbl = i === 2 || i === 3, w = dbl ? 3.0 : 1.7, s = CH.stylobate;
    F.face("frame", -w / 2 - 0.3, s, w / 2 + 0.3, s + 3.7, 0.05);                       // frame
    F.face("door", -w / 2, s, w / 2, s + 3.4, 0.14);                                    // the leaf (a pair in the double bays)
    if (dbl) F.face("frame", -0.05, s, 0.05, s + 3.4, 0.2);
    if (hooded) { F.hood("cream", 0, s + 3.7, w / 2 + 0.6, 0.0, 0.5); F.box("cream", -w / 2 - 0.9, s + 3.7, 0.0, -w / 2 - 0.6, s + 4.4, 0.5); F.box("cream", w / 2 + 0.6, s + 3.7, 0.0, w / 2 + 0.9, s + 4.4, 0.5); }
    window(F, 0, 7.0, 1.4, 2.4, 0.0, { side: 0.25 });                                      // the small square window over each door
  }
  // ---- six bows: the two end drums and the rusticated piers beside the last columns
  for (const sg of [-1, 1]) {
    const bx = CH.bowAtR * Math.sin(rad(CH.bowAt) * sg), bz = CH.bowAtR * Math.cos(rad(CH.bowAt));
    const r = CH.bowR;
    wall(bag, "base", bx, bz, r + 0.3, -1.2, 2.2, 16);                                          // banded stone base
    ring(bag, "base", bx, bz, r, r + 0.3, 2.2, 16);
    wall(bag, "brickLt", bx, bz, r, 2.2, 13.4, 16);                                           // the drum
    wall(bag, "base", bx, bz, r + 0.2, 6.3, 6.8, 16);                                         // string course
    lathe(bag, "cream", bx, bz, [[r, 13.4], [r + 0.6, 13.4], [r + 0.7, 14.2], [r + 1.4, 14.35], [r + 1.5, 14.75], [r + 1.1, 15.1]], 16);   // the rolled cream cap
    ring(bag, "ledge", bx, bz, 0.001, r + 1.1, 15.1, 16);
    // two slit windows facing outward (as in H2): a short one over a tall one
    const fa = sg * rad(76), Fw = bag.at(bx + r * Math.sin(fa), bz + r * Math.cos(fa), fa);
    window(Fw, 0, 8.3, 1.2, 2.3, 0, { side: 0.2 });
    window(Fw, 0, 3.4, 1.3, 3.9, 0, { side: 0.2 });
    // the rusticated pier between the last column and the drum
    const pth = rad(44) * sg, Fp = bag.at(24.4 * Math.sin(pth), 24.4 * Math.cos(pth), pth);
    Fp.box("brickLt", -1.9, -1.2, -2.6, 1.9, 15.0, 2.6);
    Fp.box("base", -2.0, -1.2, -2.7, 2.0, 2.2, 2.7);
    for (let k = 0; k < 6; k++) Fp.face("base", -1.9, 3.4 + k * 1.9, 1.9, 3.55 + k * 1.9, 2.62);       // rusticated courses
    Fp.box("cream", -2.0, 14.5, -2.7, 2.0, CH.entTop, 2.7);
  }
  // ---- the attic: brick wall, seven panels, its cornice
  wall(bag, "brickLt", cx, cz, atticR, CH.entTop, CH.atticTop, SEG);
  wall(bag, "cream", cx, cz, atticR + 0.6, CH.atticTop - 0.6, CH.atticTop, SEG);                       // the lower cornice
  lathe(bag, "cream", cx, cz, [[atticR + 0.7, CH.atticTop], [atticR + 1.0, CH.atticTop + 0.05], [atticR + 1.3, CH.atticTop + 0.25], [atticR + 1.3, CH.corniceTop]], SEG);
  ring(bag, "cream", cx, cz, atticR, atticR + 1.3, CH.corniceTop, SEG);                                 // cornice top (H1: about 1.3 m deep)
  for (let i = -2; i <= 2; i++) {                                                                         // five panels with a round window
    const th = rad(CH.panelStep * i), F = bag.at(atticR * Math.sin(th), atticR * Math.cos(th), th);
    F.box("cream", -1.3, 16.6, -0.1, 1.3, 19.0, 0.3);
    F.box("cream", -1.5, 19.0, -0.1, 1.5, 19.4, 0.45);                                                   // pediment cap
    F.disc("glass", 0, 17.8, 0.62, 0.34, 10);
    F.disc("frame", 0, 17.8, 0.8, 0.31, 10);
  }
  for (const sg of [-1, 1]) {                                                                              // the end pavilions with a carved relief panel
    const th = rad(CH.pavilionAt) * sg, F = bag.at(22.2 * Math.sin(th), 22.2 * Math.cos(th), th);
    F.wedge("brickLt", -4.9, CH.entTop, -3.8, 4.9, 19.4, 20.9, 3.8);
    F.wedge("cream", -5.2, 19.4, -4.0, 5.2, 19.8, 21.3, 4.1);                                            // the cream roof slab rising toward the dome
    F.box("cream", -1.3, 16.9, 3.8, 1.3, 19.4, 4.05);                                                     // relief panel
    F.box("creamSh", -0.9, 17.3, 4.05, 0.9, 19.0, 4.15);
  }
  // ---- the roof ledge, with eight skylights
  ring(bag, "ledge", cx, cz, CH.domeR, atticR, CH.corniceTop - 0.3, SEG);
  for (let i = 0; i < 8; i++) {
    const th = rad(i * 45 + 22.5), F = bag.at(20.7 * Math.sin(th), 20.7 * Math.cos(th), th);
    F.box("skylight", -1.7, CH.corniceTop - 0.3, -0.7, 1.7, CH.corniceTop + 0.1, 0.7);
  }
  // ---- the dome: dark band, a lighter skirt, the shell (a sphere through the skirt and the shoulder),
  // a low conical cap, and ribs
  const { domeR, skirtTop, shoulderR, shoulderY, capR, capTop } = CH;
  wall(bag, "band", cx, cz, domeR, CH.corniceTop - 0.3, CH.bandTop, SEG);
  wall(bag, "cuLo", cx, cz, domeR, CH.bandTop, skirtTop, SEG);
  // sphere radius Rs and centre height yc through (domeR, skirtTop) and (shoulderR, shoulderY)
  const dy = shoulderY - skirtTop, yc = (shoulderY + skirtTop) / 2 - (domeR * domeR - shoulderR * shoulderR) / (2 * dy);
  const Rs = Math.sqrt(domeR * domeR + (skirtTop - yc) ** 2);
  const rs = [domeR, 16.4, 13.8, 11.0, 8.6, shoulderR];
  const ys = rs.map((r) => yc + Math.sqrt(Rs * Rs - r * r));
  const prof = rs.map((r, i) => [r, ys[i]]);
  lathe(bag, "cuHi", cx, cz, prof, SEG);
  lathe(bag, "cuLo", cx, cz, [[shoulderR, shoulderY], [capR, capTop - 0.1], [0.001, capTop]], SEG);          // the cone, with its flat top
  lathe(bag, "seam", cx, cz, [[domeR + 0.05, skirtTop - 0.05], [domeR + 0.25, skirtTop + 0.05]], SEG);          // the skirt's edge
  // ribs: thin lighter strips along the meridians, lifted off the shell along its normal
  for (let k = 0; k < CH.ribs; k++) {
    const a = (k / CH.ribs) * TAU + rad(3.75), hw = rad(1.0);
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      const n0 = [r0 / Rs, (y0 - yc) / Rs], n1 = [r1 / Rs, (y1 - yc) / Rs], lift = 0.12;
      const P = (r, y, n, da) => { const rr = r + n[0] * lift; return [cx + rr * Math.sin(a + da), y + n[1] * lift, cz + rr * Math.cos(a + da)]; };
      bag.quad("rib", P(r0, y0, n0, -hw * (domeR / r0) * 0.5), P(r0, y0, n0, hw * (domeR / r0) * 0.5), P(r1, y1, n1, hw * (domeR / r1) * 0.5), P(r1, y1, n1, -hw * (domeR / r1) * 0.5));
    }
  }
  // two clusters of small vent holes on the shell, as in H1 (left of centre and right of centre)
  for (const [ph, n] of [[rad(-38), 12], [rad(52), 12]]) {
    for (let k = 0; k < n; k++) {
      const a = ph + ((k % 4) - 1.5) * rad(3.4), r = 12.2 + Math.floor(k / 4) * 0.9, y = yc + Math.sqrt(Rs * Rs - r * r), nn = [r / Rs, (y - yc) / Rs];
      const F = bag.at((r + nn[0] * 0.13) * Math.sin(a), (r + nn[0] * 0.13) * Math.cos(a), a);
      F.box("vent", -0.22, y + nn[1] * 0.13, -0.18, 0.22, y + nn[1] * 0.13 + 0.12, 0.18);
    }
  }
  // ---- the chimney at the right rear: shaft, corbelled cap, flue
  const [chx, chz] = CH.chimneyAt, Fc = bag.at(chx, chz, 0);
  Fc.box("chim", -1.2, CH.corniceTop - 0.5, -1.2, 1.2, CH.chimneyTop - 0.8, 1.2);
  Fc.box("chimCap", -1.55, CH.chimneyTop - 0.8, -1.55, 1.55, CH.chimneyTop, 1.55);
  Fc.deck("soffit", -0.9, -0.9, 0.9, 0.9, CH.chimneyTop + 0.02);
  // ---- the two wings: Simcoe Hall (buff stone) on the left, the ivy-covered Sanford Fleming Building on the right
  wing(bag, -1);
  wing(bag, 1);
}

// A 3-storey wing beside the hall: base course, wall, a regular grid of tall windows, a door,
// a cornice and parapet. sg = -1 on the left (stone), +1 on the right (ivy).
function wing(bag, sg) {
  const len = CH.wingLen[sg > 0 ? 1 : 0], nb = CH.wingBays[sg > 0 ? 1 : 0], x0 = sg > 0 ? 24 : -24 - len, x1 = x0 + len, zf = CH.wingFront, zb = zf - CH.wingDepth, H = CH.wingH;
  const F = bag.at(0, 0, 0), wallM = sg > 0 ? "ivyWall" : "tan", corn = sg > 0 ? "darkStone" : "cream";
  F.box(wallM, x0, -1.5, zb, x1, H - 1.0, zf);
  F.box("tanBase", x0 - 0.2, -1.5, zf - 0.2, x1 + 0.2, 0.9, zf + 0.15);                         // base course
  F.box(corn, x0 - 0.2, H - 1.0, zb - 0.2, x1 + 0.2, H, zf + 0.6);                          // cornice with a deep return at the front (dark stone above the ivy, as in H1)
  F.box(corn, x0 - 0.2, H, zf + 0.4, x1 + 0.2, H + 0.5, zf + 0.6);                          // parapet
  // quoin strips at the ends of the front
  for (const qx of [x0, x1 - 0.7]) F.box("cream", qx, 0.9, zf, qx + 0.7, H - 1.0, zf + 0.12);
  // 5 bays of tall windows (the ground storey has a door in one bay). The left wing has
  // three equal storeys; the ivy wing is read from H1: a ground row, a first-floor row, and a blank ivy attic.
  const doorBay = sg > 0 ? 1 : 1;                         // counted from the outer end
  const rows = sg > 0 ? [[2.0, 3.3], [7.9, 2.7]] : [[1.3, 2.6], [1.0 + CH.storey, 2.9], [1.0 + 2 * CH.storey, 2.9]];
  for (let i = 0; i < nb; i++) {
    const edge = sg > 0 ? CH.ivyEdge : 2.6, xc = sg > 0 ? x1 - edge - i * CH.winPitch : x0 + edge + i * CH.winPitch;
    rows.forEach(([y0, h], r) => {
      if (r === 0 && i === doorBay) {
        const zz = zf + (sg > 0 ? 0.4 : 0);
        F.face("frame", xc - 1.2, 0.9, xc + 1.2, 4.3, zz + 0.1);
        F.face("door", xc - 0.95, 0.9, xc + 0.95, 3.8, zz + 0.2);
        F.hood("cream", xc, 3.9, 1.2, zz, 0.4);
        return;
      }
      window(F, xc, y0, 1.5 + (sg > 0 ? 0 : 0.4), h, zf + (sg > 0 ? 0.4 : 0), { lintel: 0.3, side: 0.25 });
    });
  }
  // the ivy: a lumpy skin of three greens over the whole front, ragged along the top, with the windows standing proud of it
  if (sg > 0) {
    const nx = 26, ny = 10, ax = x0, bx = x1, ay = 1.0, by = H - 1.0;
    const P = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const top = j === ny ? (h2(i, j, 5) - 0.6) * 1.1 : 0;              // the top edge wanders up and down
      P.push([ax + (bx - ax) * u, ay + (by - ay) * v + (j > 0 && j < ny ? (h2(i, j, 3) - 0.5) * 0.3 : 0) + top, zf + 0.12 + h2(i, j, 1) * 0.32]);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = P[j * (nx + 1) + i], b = P[j * (nx + 1) + i + 1], c = P[(j + 1) * (nx + 1) + i + 1], d = P[(j + 1) * (nx + 1) + i];
      const t = h2(i, j, 7);
      bag.quad(t < 0.3 ? "ivyDk" : t > 0.72 ? "ivyLt" : "ivy", a, b, c, d);
    }
  }
}

// =================================================================== College Park Center
// Real metres. x runs along the west (entrance) front from the south-west corner (x = 0) toward the
// tower; z = 0 is the glass line and +z faces the plaza and the road; y is up. The building is
// HKS's 7,000-seat arena (Wikipedia). Plan figures are from OpenStreetMap way 286854828 (Overpass,
// read-only): 11,341 m2, a 140.1 x 104.0 m rectangle, whose longest straight run at the outer line
// is 66 m. Everything else is read from the front photograph C1 (University_of_Texas_at_Arlington_
// March_2021_008_(College_Park_Center).jpg) at 12.85 px/m, which comes from the four flagpoles
// (155 px = 12 m) and the door pairs (30 px = 2.4 m), and checked against C2, C3 and C4.
export const CPC = {
  run: 65.3,              // corner to the far end of the front, summing the bays below: OSM longest straight run is 66 m (1% apart)
  glassH: 12.7,           // ground to canopy underside: C1 y 548 to 385
  floorAt: 4.3,           // first-floor spandrel centre: C1 y 487-500 (1.0 m thick)
  spandrelH: 1.0,
  fascia: 1.3,            // canopy fascia: C1 band 1.3 m, with the 1.7 m rise of its sloped top
  rise: 1.7,
  overhang: 6.5,          // the canopy stands out from the glass: C2 shows it carried on the brick piers
  canopyEnd: 51.2,        // east end of the canopy: C1 x 1005 against the corner at x 348, at 12.85 px/m
  panel: 1.6,             // fascia panel module: C1 joints every 21 px
  upperTop: 19.4,         // set-back silver volume top: C1 y 300
  upperEnd: 40.7,         // its east end: C1 x 870
  towerTop: 24.4,         // tan limestone tower top: C1 y 235 (to 548 at 12.85 px/m)
  towerW: 13.5,           // tower width: C1 x 915-1100 less perspective
  courses: 24,            // ashlar courses counted on the tower in C1
  louvre: [3.6, 3.1, 15.4],  // louvre width, height, sill: C1 x 1045-1090, y 310-350
  slotW: 3.7,             // blue glass slot: C1 x 1100-1150
  slotH: 16.0,            // ground to the brick cap: C1 y 330-520
  slotRows: 12,           // pane rows counted in the slot on C1
  capTop: 20.3,           // brick box over the slot: C1 y 287-335
  endW: 3.5,              // brick end beyond the slot: C1 x 1150-1195
  slots: 5,               // glazed slots between brick piers on the long brick side (C3 shows four clearly and the row running on behind trees)
  upperRows: 4,           // pane rows above the spandrel, counted on C1
  poles: 4,               // flagpoles, half-mast: C1 x = 605, 702, 798, 897
  poleH: 12,              // 155 px at 12.85 px/m
  poleX: [20.1, 27.5, 34.9, 42.6],   // from the corner: C1 x = 606, 702, 797, 896 against the corner at x 348, 12.85 px/m (7.4 m apart)
  depth: 66,              // modelled depth behind the glass (the footprint is 104 m deep)
  // The bays left to right: [kind, width m, panes]. Widths from C1 pixel runs at 12.85 px/m.
  bays: [
    ["glass", 10.7, 3], ["brickWide", 6.6], ["glass", 4.8, 2], ["stone", 1.8], ["glass", 5.0, 2, "gate"],
    ["brick", 0.8], ["glass", 4.8, 2, "gate"], ["stone", 1.5], ["glass", 3.7, 2], ["brick", 1.2], ["glass", 3.7, 2],
  ],
  // Along the south face going back from the corner (C1 left): brick pier, three cream limestone piers with glass slits between.
  south: [["brick", 2.3], ["stone", 2.7], ["slit", 1.6], ["stone", 2.7], ["gap", 0.8], ["stone", 2.5]],
};

// Key points (the origin is the middle of the front, so x is shifted by half the run).
const K = (x, y, z) => [x - CPC.run / 2, y, z];
export const CPC_KEYS = {
  cornerBase: K(0, 0.6, 0), cornerTop: K(0, 12.4, 0),
  aBase: K(10.7, 0.6, 0), aTop: K(10.7, 12.4, 0),
  bBase: K(17.3, 0.6, 0), bTop: K(17.3, 12.4, 0),
  fBase: K(44.6, 0.6, 0), fTop: K(44.6, 12.4, 0),
  canopyEndTop: K(CPC.canopyEnd, CPC.glassH + CPC.fascia, CPC.overhang),
  canopyEndBot: K(CPC.canopyEnd, CPC.glassH, CPC.overhang),
  towerTL: K(44.6, CPC.towerTop, 0), towerTR: K(44.6 + CPC.towerW, CPC.towerTop, 0),
  towerBR: K(44.6 + CPC.towerW, 0, 0),
  upperR: K(CPC.upperEnd, CPC.upperTop, 1.0),
  slotTop: K(44.6 + CPC.towerW + CPC.slotW, CPC.slotH, 0.4),
};

const LAWN_STEP = 1;
function cpcParts(bag) {
  const { glassH: HG, fascia, rise, overhang, upperTop: HU, towerTop: HT, floorAt, spandrelH } = CPC;
  const HF = HG + fascia, L = CPC.run, D = CPC.depth, zb = -3.5;
  const cx = -L / 2, F = bag.at(cx, 0, 0);
  const upRows = CPC.upperRows, rowH = (HG - 0.1 - (floorAt + spandrelH / 2)) / upRows;
  const yUp0 = floorAt + spandrelH / 2;

  // ---- plaza, steps, curb
  F.deck("pavers", -16, 0.9, L + 18, 24, 0.04);
  F.deck("walk", -16, 10.4, L + 18, 11.2, 0.06);                                   // a paved band along the front
  F.box("walk", -16, 0, 24, L + 18, 0.22, 24.6);                                   // curb
  F.box("limestone", -1.2, -3, -1.2, L + 0.2, 0.55, 1.2);                        // plinth under the front
  // ---- the west front, bay by bay
  let x = 0, k = 0;
  for (const [kind, w, panes, tag] of CPC.bays) {
    const x1 = x + w;
    if (kind === "stone" || kind === "brick" || kind === "brickWide") {
      const m = kind === "stone" ? "limestone" : "cpcBrick";
      F.box(m, x, 0, -1.6, x1, HG, 0.9);                                             // the pier stands 0.9 m proud of the glass
      F.box(kind === "stone" ? "limestoneLt" : "limestone", x - 0.1, HG - 0.5, -1.7, x1 + 0.1, HG, 1.05);   // stone cap
      F.box("limestone", x - 0.1, 0, -1.7, x1 + 0.1, 0.9, 1.0);                      // stone base
      if (kind === "brickWide") F.face("limestoneLt", x + (w - 1.9) / 2, 1.8, x + (w + 1.9) / 2, 9.8, 0.95);  // the tall cream panel inset
    } else {
      // a glass bay: `panes` panes wide, upper glazing in four rows, a spandrel, lower glazing
      const pw = w / panes;
      for (let r = 0; r < upRows; r++) for (let c = 0; c < panes; c++) {
        const y0 = yUp0 + r * rowH, xa = x + c * pw;
        F.face((r + c + k) % 2 ? "cpcGlass" : "cpcGlassDk", xa + 0.07, y0 + 0.06, xa + pw - 0.07, y0 + rowH - 0.06, 0);
      }
      F.face("spandrel", x, floorAt - spandrelH / 2, x1, floorAt + spandrelH / 2, 0.08);
      for (let c = 0; c < panes; c++) {
        const xa = x + c * pw;
        F.face((c + k) % 2 ? "cpcGlass" : "cpcGlassDk", xa + 0.07, 0.6, xa + pw - 0.07, floorAt - spandrelH / 2 - 0.06, 0);
      }
      for (let c = 0; c <= panes; c++) F.face("mullion", x + c * pw - 0.07, 0.5, x + c * pw + 0.07, HG, 0.12);   // verticals
      for (let r = 0; r <= upRows; r++) F.face("mullion", x, yUp0 + r * rowH - 0.06, x1, yUp0 + r * rowH + 0.06, 0.12);   // transoms
      F.face("mullion", x, 0.5, x1, 0.62, 0.12); F.face("mullion", x, 2.5, x1, 2.62, 0.12);
      if (tag === "gate") {                                                          // a door pair under a GATE sign
        const xm = x + w / 2;
        for (const sd of [-1, 1]) {
          F.face("cpcGlassDk", xm + (sd < 0 ? -1.5 : 0.1), 0.6, xm + (sd < 0 ? -0.1 : 1.5), 3.1, 0.16);
          F.face("mullion", xm + (sd < 0 ? -1.5 : 0.1), 0.6, xm + (sd < 0 ? -1.42 : 0.18), 3.1, 0.2);
        }
        F.face("lampPost", xm - 1.5, 3.3, xm + 1.5, 3.9, 0.2);                       // the gate sign
      }
    }
    x = x1; k++;
  }
  // ---- the south face (C1 left): brick pier, cream piers with glass slits, on the plane x = 0 facing -x
  const S = bag.at(cx, 0, -Math.PI / 2);                                             // local x runs along +z; local z points out (-x)
  let c = 0;
  for (const [kind, w] of CPC.south) {
    const a = -(c + w), b = -c;
    if (kind === "slit" || kind === "gap") S.face("cpcGlassDk", a, 0.5, b, HG, -0.9);
    else {
      S.box(kind === "stone" ? "limestone" : "cpcBrick", a, 0, -0.9, b, HG, 1.4);
      S.box(kind === "stone" ? "limestoneLt" : "limestone", a - 0.1, HG - 0.5, -1.0, b + 0.1, HG, 1.5);
    }
    c += w;
  }
  const southEnd = -c;
  // ---- the canopy: soffit, a sloped top rising to the set-back volume, the fascia with its panel joints
  const cL = -overhang, cR = CPC.canopyEnd;
  F.deck("soffitDk", cL, -0.8, cR, overhang, HG - 0.02);
  F.wedge("silver", cL, HG, -0.8, cR, HF, HF + rise, overhang);
  for (let j = Math.ceil(cL / CPC.panel); j * CPC.panel < cR; j++) F.face("fasciaJoint", j * CPC.panel - 0.03, HG, j * CPC.panel + 0.03, HF, overhang + 0.02);
  F.box("silverSh", cL, HF - 0.12, overhang - 0.1, cR, HF, overhang + 0.06);        // a shadow line under the lip
  // the canopy turning the corner along the south face
  const zs = -(southEnd + 0) - 0;
  S.deck("soffitDk", -22, -overhang, 0, 0.0, HG - 0.02);
  S.wedge("silver", -22, HG, -overhang, 0, HF, HF + rise, 0.0);
  // ---- the upper set-back volume: its silver face with panel joints, and the roof
  const uL = -3.0, uR = CPC.upperEnd, uFront = 1.0, base = HF + rise;
  F.box("silver", uL, base, -D, uR, HU, uFront);
  for (let j = Math.ceil(uL / 1.4); j * 1.4 < uR; j++) F.face("fasciaJoint", j * 1.4 - 0.03, base, j * 1.4 + 0.03, HU, uFront + 0.03);
  F.box("silverSh", uL, base, uFront, uR, base + 0.3, uFront + 0.08);
  F.deck("roofGrey", uL, -D, uR, uFront, HU + 0.01);
  // ---- the arena body behind: brick walls to the roof, a silver band along the top edge
  const bodyR = L;
  F.box("cpcBuff", 0, -3, -D, bodyR, HU - 2.0, zb);
  F.box("silver", 0, HU - 2.0, -D, bodyR, HU, zb);
  F.deck("roofGrey", 0, -D, bodyR, zb, HU + 0.02);
  // the +x end wall (it faces the camera at the arrival): cream base, glazed slots between brick piers, a sign strip
  const E = bag.at(cx + bodyR, 0, Math.PI / 2);                                       // local x runs along -z, local z points out (+x)
  E.box("limestone", 0, -3, -0.05, D, 2.2, 0.2);
  for (let i = 0; i < CPC.slots; i++) {                                                // upper windows above a dark ground-storey arcade (C3)
    const xc = 10 + i * 8;
    E.face("cpcGlassDk", xc - 1.9, 9.0, xc + 1.9, HU - 4.3, 0.06);
    E.face("mullion", xc - 0.06, 9.0, xc + 0.06, HU - 4.3, 0.1);
    for (let r = 1; r < 3; r++) E.face("mullion", xc - 1.9, 9.0 + r * ((HU - 13.3) / 3) - 0.05, xc + 1.9, 9.0 + r * ((HU - 13.3) / 3) + 0.05, 0.1);
    E.face("cpcGlassDk", xc - 1.9, 2.4, xc + 1.9, 8.4, 0.06);
    E.box("cpcBuffDk", xc - 3.9, 2.2, 0.0, xc - 2.5, HU - 2.0, 0.32);                // the pier between slots
  }
  // COLLEGE PARK CENTER in 17 small letters on the blank brick (C3), each a dark block
  let lx = 49.5;
  for (const ch of "COLLEGE PARK CENTER") { if (ch !== " ") E.face("lampPost", lx, 14.0, lx + 0.42, 14.8, 0.07); lx += ch === " " ? 0.9 : 0.62; }
  // rooftop units breaking up the long roof
  for (const [ux, uz, uw, ud] of [[10, -14, 3.4, 2.2], [22, -20, 4.2, 2.6], [38, -12, 3.0, 2.0], [44, -30, 4.6, 2.8], [14, -40, 3.6, 2.4], [30, -46, 4.4, 3.0], [52, -52, 3.4, 2.2], [8, -56, 3.0, 2.0]])
    F.box("unit", ux, HU + 0.02, uz, ux + uw, HU + 1.7, uz + ud);
  // ---- the tan tower, its louvre and its 24 courses
  const tx0 = 44.6, tx1 = tx0 + CPC.towerW;
  F.box("limestone", tx0, -3, -20, tx1, HT, 0.0);                                  // the tower front stands on the glass line
  F.box("limestoneLt", tx0 - 0.3, HT, -20.3, tx1 + 0.3, HT + 0.4, 0.3);                 // coping
  for (let i = 1; i < CPC.courses; i++) {
    const y = (i * HT) / CPC.courses;
    F.face("course", tx0, y - 0.04, tx1, y + 0.04, 0.04);
  }
  const ET = bag.at(cx + tx1, 0, Math.PI / 2);
  for (let i = 1; i < CPC.courses; i++) { const y = (i * HT) / CPC.courses; ET.face("course", 0.0, y - 0.04, 19.5, y + 0.04, 0.02); }
  const [lw, lh, ls] = CPC.louvre, lx1 = tx1 - 1.0;
  F.face("louvre", lx1 - lw, ls, lx1, ls + lh, 0.08);
  for (let i = 1; i < 14; i++) F.face("fasciaJoint", lx1 - lw, ls + (i * lh) / 14 - 0.03, lx1, ls + (i * lh) / 14 + 0.03, 0.1);
  // ---- the blue glass slot with its brick cap, and the brick end
  const sx0 = tx1, sx1 = sx0 + CPC.slotW;
  F.box("cpcBrick", sx0, -3, -20, sx1, CPC.slotH, 0.4);
  F.box("cpcBrickDk", sx0, CPC.slotH, -10, sx1 + 0.2, CPC.capTop, 0.6);
  const srow = CPC.slotH / CPC.slotRows;
  for (let r = 0; r < CPC.slotRows; r++) F.face(r % 2 ? "cpcGlass" : "cpcGlassDk", sx0 + 0.15, 0.5 + r * srow + 0.05, sx1 - 0.15, 0.5 + (r + 1) * srow - 0.55, 0.45);
  F.face("mullion", sx0 + (sx1 - sx0) / 2 - 0.06, 0.5, sx0 + (sx1 - sx0) / 2 + 0.06, CPC.slotH - 0.5, 0.5);
  for (let r = 0; r <= CPC.slotRows; r++) F.face("mullion", sx0 + 0.1, 0.5 + r * srow - 0.08, sx1 - 0.1, 0.5 + r * srow + 0.08, 0.5);
  F.box("cpcBrick", sx1, -3, -8, sx1 + CPC.endW + 0.2, CPC.slotH + 0.5, 0.0);          // the brick end beside the slot (0.2 m proud of the long wall)
  // ---- forecourt: planter wall, ornamental grass, flagpoles, lamp posts with banners, bollards, live oaks
  F.box("planterWall", 8, 0, 13.0, 50, 0.9, 14.4);
  F.box("grassDry", 8.4, 0.9, 10.6, 49.6, 1.7, 13.0);
  F.box("planterWall", 14, 0, 8.4, 26, 0.7, 9.4);
  for (let i = 0; i < CPC.poles; i++) {
    const px = CPC.poleX[i], pz = [9.5, 12.5, 12.5, 9.5][i], Fp = bag.at(cx + px, pz, 0);
    lathe(bag, "pole", cx + px, pz, [[0.09, 0], [0.07, CPC.poleH]], 6);
    lathe(bag, "pole", cx + px, pz, [[0.16, CPC.poleH], [0.0, CPC.poleH + 0.25]], 6);
    const fy = CPC.poleH - 4.2;
    const m = ["flagWhite", "flagRed", "flagBlue", "flagWhite"][i];
    Fp.face(m, 0.09, fy, 1.95, fy + 1.2, 0.02);
    if (i === 1) Fp.face("flagBlue", 0.09, fy, 0.75, fy + 1.2, 0.04);
    if (i === 2) { Fp.face("flagWhite", 0.09, fy, 1.95, fy + 0.6, 0.04); Fp.face("flagBlue", 0.09, fy + 0.6, 0.8, fy + 1.2, 0.04); }
  }
  for (const [lx, lz] of [[-0.5, 21.2], [17, 21.2], [62, 21.2]]) {
    lathe(bag, "lampPost", cx + lx, lz, [[0.14, 0], [0.1, 4.2]], 6);
    const Fl = bag.at(cx + lx, lz, 0);
    Fl.box("lampPost", -0.3, 4.2, -0.3, 0.3, 4.7, 0.3);
    Fl.face("banner", 0.12, 2.4, 0.85, 3.9, 0.03); Fl.face("banner", -0.85, 2.4, -0.12, 3.9, 0.03);
  }
  for (let i = 0; i < 6; i++) lathe(bag, "lampPost", cx + 56 + i * 2.6, 21.6 + (i % 2) * 0.4, [[0.13, 0], [0.13, 0.95], [0.0, 1.05]], 6);
  // live oaks: a trunk and a broad, low crown of two stacked rings
  for (const [ox, oz, os] of [[-14, 15, 1.0], [47, 18, 0.7], [76, 13, 1.0]]) {
    lathe(bag, "trunk", cx + ox, oz, [[0.38 * os, 0], [0.26 * os, 3.2 * os]], 6);
    lathe(bag, "oak", cx + ox, oz, [[0.2, 2.6 * os], [3.4 * os, 3.5 * os], [4.6 * os, 5.2 * os], [3.6 * os, 6.6 * os], [1.2 * os, 7.4 * os]], 9);
    lathe(bag, "oakLt", cx + ox + 0.8, oz - 0.6, [[1.8 * os, 6.3 * os], [2.6 * os, 6.9 * os], [0.4 * os, 7.6 * os]], 7);
  }
}

// ------------------------------------------------------------------ public builders
// Convocation Hall: D is the dome's base diameter in scene metres. Returns the scene height and
// the radius of ground the hall keeps clear of trees (scene metres), and the build's triangle count.
export function convocationHall(k, st, D) {
  const scale = D / (2 * CH.domeR), bag = new Bag();
  hallParts(bag);
  bag.flush(k.add, st, scale);
  return { H: CH.capTop * scale, R: 40 * scale, tris: bag.count, scale };      // R: ground kept clear of trees (the hall and both wings)
}

// College Park Center: L is the glass front's length in scene metres. Returns as convocationHall does.
export function collegeParkCenter(k, st, L) {
  const scale = L / CPC.run, bag = new Bag();
  cpcParts(bag);
  bag.flush(k.add, st, scale);
  return { H: CPC.towerTop * scale, R: 36 * scale, tris: bag.count, scale };   // R: the plaza and the front
}
