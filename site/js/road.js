// The road strip: the team's van driving a winding two-lane road over a sculptural white
// landscape, seen 3/4 from above. Ahead of the van the land is a plaster model drawn in
// grey ink; behind it, the land comes alive: the road darkens and its lines paint
// themselves in, grass grows across the slopes in a fine stipple, rock faces flake from
// plaster into stone, trees and flowers pop up, and a thin hologram rim rides the front.
// Every 500 km of the trip the strip answers the slider's milestone pulse with a ripple.
//
// Everything is one three.js scene with its own renderer. The colour front is a single
// uniform (metres along the route); every vertex carries its own route coordinate, its
// height above the road and its distance from it, so the front soaks outward from the road
// and climbs the rock faces last. The loop renders only while something moves.
import * as THREE from "../vendor/three.module.min.js";
import { loadPart, Figure } from "./stage.js";
import { convocationHall, collegeParkCenter, CH_KEYS, CPC, CPC_KEYS } from "./road/landmarks.js";
import { buildSigns, SIGN_VS, signFS } from "./road/signs.js";

const VAN_URL = "parts/cargo-van.bin";
const TRIP_KM = 4534, MILESTONE_KM = 500;
const LANE = 3.6, HALF = 4.5;                 // lane width, road half-width (lanes + shoulders), metres
const WHEEL_R = 0.356, WHEEL_RPM = 40;        // 235/65 R16; the rpm the part file spins at for speed 1
const ELEV = 30, AZIM = -20, FOV = 24;        // camera, degrees (a long lens)
const LAND_LEAD = 4.5;                        // metres the land's colour front runs ahead of the road's
const LAND_LAG = 8;                           // metres the colour front may fall behind its target while the van drives
const ROAD_PAST = 7;                          // metres of road past where the van parks in Arlington
const END_FILL = 48, ARRIVE_S = 1.2;          // metres the colour runs on past the parked van, and over how long
const SEED = 0x52494654;

// ------------------------------------------------------------------ seeded noise
function hash(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul((c | 0) + 0x1b873593, 0x9e3779b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let t = hash(seed, 7, 11);
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(x, y, salt) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, salt), b = hash(xi + 1, yi, salt), c = hash(xi, yi + 1, salt), d = hash(xi + 1, yi + 1, salt);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 4294967296;
}
function fbm(x, y, oct, salt) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noise(x, y, salt + o * 31); n += a; a *= 0.5; x *= 2.03; y *= 2.03; }
  return s / n;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const col = (h) => new THREE.Color(h);
const ramp = (stops, t) => {
  const f = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f));
  return col(stops[i]).lerp(col(stops[i + 1]), f - i);
};

// ------------------------------------------------------------------ the route
// Toronto at x = 0, Arlington at x = END. S-curves, a climb over a rise, a drop into a
// valley, a bridge over a ravine, a second climb past the mesas and a run down to the plain.
const END = 560, RAVINE_X = 331;
// The drive south-west, by route x (metres): Toronto and the lake, Ontario, the Midwest's
// farmland, the Mississippi at St. Louis, the Ozarks, Oklahoma's red dirt, Texas.
const LAKE = [14, 74], FARM = [96, 300], OZARKS = [362, 470], REDDIRT = [470, 503];
const band = (x, [a, b], soft = 14) => smooth(a - soft, a + soft, x) * (1 - smooth(b - soft, b + soft, x));
const CONTROL = [
  [-120, 0, 0], [-60, 2, 0], [0, 0, 0], [35, -4, 0.4], [70, 6, 1.4], [105, -6, 3.8], [140, -15, 8.5], [175, -9, 13],
  [205, 2, 15], [235, 9, 12], [265, 5, 7], [295, -3, 4.2], [318, -6, 4], [344, -5, 4.2], [372, 2, 7.5], [405, 9, 13],
  [438, 4, 15], [470, -7, 10.5], [500, -11, 3.2], [530, -4, 1.1], [560, 3, 1], [610, 5, 0], [700, 4, 0],
];
function buildRoute() {
  const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z, y]) => new THREE.Vector3(x, y, z)), false, "centripetal");
  const len = curve.getLength(), ds = 0.5, n = Math.ceil(len / ds) + 1;
  const pts = curve.getSpacedPoints(n - 1);
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), S = new Float32Array(n);
  const TX = new Float32Array(n), TY = new Float32Array(n), TZ = new Float32Array(n), K = new Float32Array(n);
  const step = len / (n - 1);
  pts.forEach((p, i) => { X[i] = p.x; Y[i] = p.y; Z[i] = p.z; S[i] = i * step; });
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const dx = X[b] - X[a], dy = Y[b] - Y[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dy, dz) || 1;
    TX[i] = dx / l; TY[i] = dy / l; TZ[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    const ya = Math.atan2(TZ[a], TX[a]), yb = Math.atan2(TZ[b], TX[b]);
    K[i] = (yb - ya) / Math.max(1e-3, S[b] - S[a]);       // yaw per metre, + turning right (toward +z)
  }
  // Nearest sample to (x, z): the route never doubles back in x, so search a window.
  // With `hint` (the answer for a nearby point) only a short window is searched.
  const near = (x, z, hint = -1) => {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let i = Math.max(0, hint - 16); i <= Math.min(n - 1, hint + 16); i++) {
        const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (Math.abs(best - hint) >= 16 && best > 0 && best < n - 1) best = -1;
    }
    if (best < 0) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] < x) lo = m; else hi = m; }
      best = lo; bd = Infinity;
      for (let i = Math.max(0, lo - 140); i <= Math.min(n - 1, lo + 140); i += 3) {
        const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    for (let i = Math.max(0, best - 3); i <= Math.min(n - 1, best + 3); i++) {
      const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const u = (x - X[best]) * -TZ[best] + (z - Z[best]) * TX[best];   // + toward the right of travel (+z)
    return { i: best, s: S[best], u, d: Math.abs(u), y: Y[best] };
  };
  const atX = (x) => near(x, 0).s;
  const at = (s) => {
    const f = clamp(s / step, 0, n - 1.0001), i = f | 0, t = f - i;
    return {
      x: lerp(X[i], X[i + 1], t), y: lerp(Y[i], Y[i + 1], t), z: lerp(Z[i], Z[i + 1], t),
      tx: lerp(TX[i], TX[i + 1], t), ty: lerp(TY[i], TY[i + 1], t), tz: lerp(TZ[i], TZ[i + 1], t), k: lerp(K[i], K[i + 1], t),
    };
  };
  return { n, step, len, X, Y, Z, S, TX, TY, TZ, near, at, s0: atX(0), s1: atX(END) };
}

// ------------------------------------------------------------------ shaders
// Shared by everything that reveals. frontP: metres the colour front has passed this point
// (negative: not yet). Height above the road and distance from it hold the colour back,
// so it soaks out from the road and reaches the peaks last; noise makes the edge organic.
const COMMON = /* glsl */ `
  uniform float uReveal; uniform float uBase; uniform float uFeather; uniform float uTime; uniform float uMotion;
  uniform vec3 uKey; uniform vec4 uPulse[2]; uniform vec3 uFocus; uniform sampler2D uNoise;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  // Smooth value noise, baked into a tiling texture (64 lattice cells across): one fetch.
  float vnoise(vec2 p) { return textureLod(uNoise, p / 64.0, 0.0).r; }
  // The base layer: everything behind the van's middle, plus a soft oval pool around the van
  // that bulges ahead of it across the road and verges, symmetric about the road, so the van
  // carries its colour with it. uBase is the van's middle (metres along the route).
  float baseAt(float s, float d, vec3 wp) {
    float q = d / 10.5;
    float ahead = 4.6 * sqrt(max(0.0, 1.0 - q * q)) - max(d - 10.5, 0.0) * 0.6;
    float n = (vnoise(wp.xz * 0.35 + 5.0) - 0.5) * 1.1;
    return smoothstep(0.0, 1.0, (uBase - s + ahead + n) / 1.8);
  }
  float frontP(float s, float h, float d, vec3 wp) {
    float n = (vnoise(wp.xz * 0.09) - 0.5) * 5.0 + (vnoise(wp.xz * 0.42 + 17.0) - 0.5) * 1.8;
    // The land's front runs ${LAND_LEAD} m ahead of uReveal (the road's), so beside the van the colour
    // reaches the edges of the frame about when it reaches the verge. A short stagger for
    // character: higher and further from the road colours a little later, never by much.
    return uReveal + ${LAND_LEAD.toFixed(1)} - s - min(max(h, 0.0), 6.0) * 0.1 - min(max(d - ${HALF.toFixed(1)}, 0.0), 40.0) * 0.03 + n;
  }
  // Milestone ripples: rings that run outward from where the van passed a milestone.
  float pulseAt(vec3 wp) {
    float r = 0.0;
    for (int i = 0; i < 2; i++) {
      vec4 P = uPulse[i];
      if (P.w < 0.0) continue;
      float R = P.w * 24.0, w = 1.4 + P.w * 2.2;
      float dd = length(wp.xz - P.xz);
      r = max(r, exp(-pow((dd - R) / w, 2.0)) * pow(max(0.0, 1.0 - P.w / 2.0), 1.6));
    }
    return r;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  float rimAt(float p, vec3 wp) {
    float shimmer = 0.75 + 0.25 * sin(uTime * 5.0 + wp.x * 1.7 + wp.z * 1.3);
    return exp(-pow((p + 0.35) / 0.42, 2.0)) * uMotion * shimmer;
  }
  float backOut(float t) { float c1 = 1.70158, c3 = c1 + 1.0; float u = t - 1.0; return 1.0 + c3 * u * u * u + c1 * u * u; }
`;
// Fragment-only: the site's hologram language, cool grey-blue with fine scanlines.
const FRAG = /* glsl */ `
  ${COMMON}
  vec3 holo(vec3 c, float a) {
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.0943951);
    return mix(c, lin(vec3(0.58, 0.70, 0.88)) * (1.0 - 0.22 * scan), clamp(a, 0.0, 1.0));
  }
  // Colour soaking into paper: blotchy thresholds at two scales, so the colour arrives in
  // pools that join up, with a darker tide line where each pool's edge has dried.
  vec2 soak(float t, vec2 q, float scale) {
    float m = 0.68 * vnoise(q * 1.25 * scale) + 0.32 * vnoise(q * 3.9 * scale + 3.0);
    float th = m * 0.92 + 0.04;
    float aw = fwidth(t - th) * 1.5 + 0.03;
    float g = smoothstep(th - aw, th + aw, t);
    float tide = g * (1.0 - smoothstep(th + aw, th + aw + 0.09, t));
    return vec2(g, tide);
  }
  // The model fades to paper toward its edges.
  vec3 haze(vec3 c, vec3 wp) { return mix(c, vec3(1.0), smoothstep(70.0, 115.0, length(wp.xz - uFocus.xz))); }
`;

const SOLID_VS = /* glsl */ `
  attribute float aS; attribute float aH; attribute float aD; attribute vec3 aCol;
  varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vS; varying float vH; varying float vD;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vS = aS; vH = aH; vD = aD;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

// Terrain: plaster with contour lines; grass grows across it in a fine stipple.
const TERRAIN_FS = /* glsl */ `
  ${FRAG}
  varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vS; varying float vH; varying float vD;
  float contour(float v) { float fw = max(fwidth(v), 1e-4); return 1.0 - smoothstep(0.55, 1.25, abs(fract(v + 0.5) - 0.5) / fw); }
  void main() {
    // Halfway between smooth and faceted, like a carved plaster model.
    vec3 fn = normalize(cross(dFdx(vW), dFdy(vW)));
    vec3 n = normalize(mix(normalize(vN), fn, 0.55));
    vec3 L = normalize(uKey);
    float dl = dot(n, L);
    vec3 paper = mix(lin(vec3(0.80, 0.80, 0.80)), vec3(1.0), smoothstep(0.2, 0.95, dl * 0.5 + 0.5));
    float c1 = contour(vW.y / 1.0), c5 = contour(vW.y / 5.0);
    vec3 draw = mix(paper, lin(vec3(0.62, 0.62, 0.66)), max(c1 * 0.55, c5 * 0.9));

    float p = frontP(vS, vH, vD, vW);
    float t = clamp(p / uFeather, 0.0, 1.0);
    // The verge beside the road takes the base layer at once; the bloom spreads on from there.
    float bv = baseAt(vS, vD, vW) * (1.0 - smoothstep(10.5, 14.5, vD));
    vec2 sk = soak(max(t, bv), vW.xz, 1.0);
    float g = sk.x;
    float blade = hash12(floor(vW.xz * vec2(11.0, 4.0)));
    vec3 lit = vCol * (0.9 + 0.16 * blade) * (0.5 + 0.62 * max(dl, 0.0) + 0.14 * n.y) * (1.0 - 0.3 * sk.y);
    vec3 c = mix(draw, lit, g);
    c = mix(c, c * 0.84, c5 * 0.3 * g);
    float pul = pulseAt(vW) * uMotion;
    c *= 1.0 + pul * 0.18 * g;
    c = holo(c, rimAt(p, vW) * 0.22 * (1.0 - g) + pul * 0.32);
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;

// Rock, bridge and anything faceted: plaster that cracks and flakes into stone.
const ROCK_FS = /* glsl */ `
  ${FRAG}
  varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vS; varying float vH; varying float vD;
  void voro(vec2 x, out float id, out float edge) {
    vec2 nn = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0; vec2 best = nn;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 r = g + hash22(nn + g) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; best = nn + g; } else if (d < d2) d2 = d;
    }
    id = hash12(best); edge = sqrt(d2) - sqrt(d1);
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 L = normalize(uKey);
    float dl = dot(n, L);
    vec3 an = abs(n);
    vec3 draw = mix(lin(vec3(0.72, 0.72, 0.72)), vec3(1.0), smoothstep(0.1, 0.95, dl * 0.5 + 0.5));
    // Strata: the same contour language as the land, so rock reads as layered plaster.
    float hv = vW.y / 0.9, fw = max(fwidth(hv), 1e-4);
    float strata = (1.0 - smoothstep(0.5, 1.2, abs(fract(hv + 0.5) - 0.5) / fw)) * (1.0 - an.y * 0.9);
    draw = mix(draw, lin(vec3(0.64, 0.64, 0.68)), strata * 0.6);

    float p = frontP(vS, vH, vD, vW);
    // Rock and the bridge take the base layer too, so near the van they colour at once.
    float t = max(clamp(p / uFeather, 0.0, 1.0), baseAt(vS, vD, vW) * (1.0 - smoothstep(10.5, 14.5, vD)));
    vec2 q = (an.y > max(an.x, an.z) ? vW.xz : (an.x > an.z ? vW.zy : vW.xy)) * 1.15;
    float id, edge; voro(q, id, edge);
    float flip = smoothstep(id * 0.45 + 0.02, id * 0.45 + 0.3, t);
    float crack = (1.0 - smoothstep(0.025, 0.07, edge)) * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.8, 1.0, t));
    vec3 stone = vCol * (0.92 + 0.14 * id) * (0.42 + 0.7 * max(dl, 0.0) + 0.12 * n.y);
    vec3 c = mix(draw, stone, flip);
    c = mix(c, lin(vec3(0.33, 0.31, 0.30)), crack * 0.75);
    float pul = pulseAt(vW) * uMotion;
    c *= 1.0 + pul * 0.15 * flip;
    c = holo(c, rimAt(p, vW) * 0.25 * (1.0 - flip) + pul * 0.3);
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;

const ROAD_VS = /* glsl */ `
  attribute float aS; attribute float aU;
  varying vec3 vW; varying float vS; varying float vU;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz; vS = aS; vU = aU;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
// Road: white with inked edges ahead; behind, the asphalt darkens and then the lines paint
// themselves in with a wet gleam at the brush.
const ROAD_FS = /* glsl */ `
  ${FRAG}
  varying vec3 vW; varying float vS; varying float vU;
  void main() {
    float au = abs(vU), fu = fwidth(vU);
    float ds = fract(vS / 12.0) * 12.0, fs = max(fwidth(vS), 1e-3);
    float dash = smoothstep(0.0, fs, ds) * (1.0 - smoothstep(4.0 - fs, 4.0, ds));
    float centre = (1.0 - smoothstep(0.075, 0.075 + fu, au)) * dash;
    float edgeL = 1.0 - smoothstep(0.08, 0.08 + fu, abs(au - ${LANE.toFixed(2)}));
    float rim = smoothstep(${(HALF - 0.12).toFixed(2)} - fu, ${(HALF - 0.12).toFixed(2)}, au);
    vec3 draw = vec3(0.985);
    draw = mix(draw, lin(vec3(0.66, 0.66, 0.70)), max(edgeL * 0.8, centre * 0.8));
    draw = mix(draw, lin(vec3(0.42, 0.42, 0.46)), rim);

    float n = (vnoise(vW.xz * 0.42 + 17.0) - 0.5) * 2.4 + (vnoise(vW.xz * 0.09) - 0.5) * 3.0;
    float p = uReveal - vS + n + 1.5;
    float grain = hash12(floor(vW.xz * 9.0));
    float base = baseAt(vS, abs(vU), vW);
    vec2 sk = soak(max(clamp(p / 2.8, 0.0, 1.0), base), vW.xz, 1.6);
    float t = sk.x;
    vec3 asphalt = lin(vec3(0.33, 0.34, 0.35)) * (0.94 + 0.1 * grain);
    asphalt = mix(asphalt, lin(vec3(0.43, 0.43, 0.43)), smoothstep(${(LANE + 0.1).toFixed(2)}, ${(LANE + 0.2).toFixed(2)}, au));
    asphalt *= 1.0 - 0.07 * exp(-pow((abs(abs(vU) - 1.8) - 0.86) / 0.3, 2.0));
    float lp = p - 3.0;
    float paint = max(smoothstep(0.0, 0.5, lp), base);
    float wet = exp(-pow((lp - 0.5) / 0.55, 2.0)) * uMotion;
    vec3 white = lin(vec3(0.95, 0.95, 0.93)), yellow = lin(vec3(0.93, 0.76, 0.26));
    vec3 cr = asphalt;
    cr = mix(cr, white + wet * 0.25, edgeL * paint);
    cr = mix(cr, yellow + wet * 0.2, centre * paint);
    cr = mix(cr, cr * 0.7, rim * 0.5);
    cr *= 1.0 - 0.25 * sk.y;
    vec3 c = mix(draw, cr, t);
    float pul = pulseAt(vW) * uMotion;
    c = holo(c, rimAt(p - 1.5, vW) * 0.38 * (1.0 - t) + pul * 0.28);
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;

const LINE_VS = /* glsl */ `
  attribute float aS; attribute float aH; attribute float aD; attribute vec3 aCol;
  varying vec3 vW; varying vec3 vCol; varying float vS; varying float vH; varying float vD;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz; vCol = aCol; vS = aS; vH = aH; vD = aD;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const LINE_FS = /* glsl */ `
  ${FRAG}
  varying vec3 vW; varying vec3 vCol; varying float vS; varying float vH; varying float vD;
  void main() {
    float t = max(clamp(frontP(vS, vH, vD, vW) / uFeather, 0.0, 1.0), baseAt(vS, vD, vW) * (1.0 - smoothstep(10.5, 14.5, vD)));
    vec3 c = mix(lin(vec3(0.52, 0.52, 0.56)), vCol * 0.55, smoothstep(0.5, 1.0, t));
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;

// Trees, shrubs and flowers: absent in the drawing, they grow in with a little overshoot
// once the colour has arrived, and bounce when a milestone ripple passes.
const GROW_VS = /* glsl */ `
  ${COMMON}
  attribute vec4 iData;   // route s, height above the road, distance from it, delay (m)
  varying vec3 vN; varying vec3 vCol; varying vec3 vW;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float p = frontP(iData.x, iData.y, iData.z, base) - iData.w;
    float t = clamp(p / 2.4, 0.0, 1.0);
    float g = uMotion > 0.5 ? max(backOut(t), 0.0) : step(0.001, p);
    g *= 1.0 + 0.3 * pulseAt(base) * uMotion;
    vec4 wp = m * vec4(position * g, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(m) * normal);
    vCol = color.r > 0.99 && color.b > 0.99 ? instanceColor : color;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const GROW_FS = /* glsl */ `
  uniform vec3 uKey;
  varying vec3 vN; varying vec3 vCol; varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    float dl = max(dot(n, normalize(uKey)), 0.0);
    gl_FragColor = vec4(vCol * (0.48 + 0.7 * dl + 0.12 * n.y), 1.0);
    #include <colorspace_fragment>
  }`;

const MOTE_VS = /* glsl */ `
  uniform float uDpr;
  attribute float aLife; attribute float aSize; attribute vec3 aColor;
  varying float vA; varying vec3 vC;
  void main() {
    vA = sin(3.14159 * clamp(aLife, 0.0, 1.0));
    vC = aColor;
    gl_PointSize = aSize * uDpr * (0.6 + 0.4 * vA);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
const MOTE_FS = /* glsl */ `
  varying float vA; varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.3, 0.5, d)) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC, a * 0.9);
    #include <colorspace_fragment>
  }`;

const SHADOW_FS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float d = length(q * vec2(1.0, 1.0));
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.32 * (1.0 - smoothstep(0.45, 1.0, d)));
  }`;

// ------------------------------------------------------------------ the land
function attrs(geo, list) { for (const [k, v, n] of list) geo.setAttribute(k, new THREE.BufferAttribute(v, n)); return geo; }

// Cooperative building: `slice()` yields to the browser whenever the current task has run
// for more than a few milliseconds, so construction never blocks the page.
// It stops the build (by throwing ABORT) once the strip has been destroyed.
const ABORT = new Error("road: destroyed");
function slicer(budget, isAlive) {
  let start = performance.now();
  const yieldNow = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
  return async () => {
    if (performance.now() - start > budget) { await yieldNow(); start = performance.now(); }
    if (!isAlive()) throw ABORT;
  };
}

// The ground College Park Center stands on: level, at the road's highest point along its
// frontage (so no verge rises between the road and the building), over its footprint and
// plaza (the cover in road/landmarks.js, in its own frame: x along the glass front, z out of
// it toward the road) and 8 m of feather.
function cpcPad(R) {
  const site = (s, u) => { const p = R.at(s); return { x: p.x - p.tz * u, z: p.z + p.tx * u, yaw: Math.atan2(p.tz, p.tx) }; };
  const st = cpcSite(site, R), k = SIZE.cpcFront / CPC.front;
  const lx0 = -76 * k, lx1 = 78 * k, lz0 = -165 * k, lz1 = 38 * k;
  const c = Math.cos(st.yaw), sn = Math.sin(st.yaw), mid = R.near(st.x, st.z).s;
  let y = -Infinity;
  for (let q = mid - 28; q <= mid + 28; q += 2) y = Math.max(y, R.at(q).y);
  y -= 0.1;
  return {
    y,
    weight(x, z) {
      const dx = x - st.x, dz = z - st.z, lx = dx * c + dz * sn, lz = -dx * sn + dz * c;
      return 1 - smooth(0, 8, Math.max(lx0 - lx, lx - lx1, lz0 - lz, lz - lz1, 0));
    },
  };
}

async function buildTerrain(R, slice) {
  const x0 = -110, x1 = 690, z0 = -62, z1 = 44, st = 2;
  const pad = cpcPad(R);
  const nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1;
  const N = nx * nz;
  const P = new Float32Array(N * 3), AS = new Float32Array(N), AH = new Float32Array(N), AD = new Float32Array(N), U = new Float32Array(N), E = new Float32Array(N);
  const H = new Float32Array(N);
  const ravineX = (z) => RAVINE_X + 4 * Math.sin(z / 11);
  const calmOf = new Float32Array(nx);
  for (let i = 0; i < nx; i++) calmOf[i] = smooth(0.32, 0.62, fbm((x0 + i * st) / 120, 3.7, 2, 5));
  for (let j = 0; j < nz; j++) {
   await slice();
   let hint = -1;
   for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * st, z = z0 + j * st;
    const nr = R.near(x, z, hint);
    hint = nr.i;
    const far = nr.u < 0, d = nr.d;
    // Hills either side, taller on the far side, with flat stretches of calm plain between.
    const flat = 1 - 0.65 * band(x, FARM) - 0.5 * band(x, REDDIRT) - 0.6 * smooth(500, 540, x);
    const amp = (far ? 17 : 5.5) * smooth(HALF + 2.5, HALF + 17, d) * (0.5 + 0.5 * calmOf[i]) * flat;
    let nat = nr.y + amp * Math.max(-0.15, fbm(x / 30, z / 30, 3, 9) - 0.32) * 2.2;
    nat += (far ? 2.5 : 0.8) * smooth(HALF + 3, HALF + 18, d) * (noise(x / 9, z / 9, 13) - 0.5);
    const rav = Math.exp(-(((x - ravineX(z)) / 9) ** 2));
    nat -= 13 * rav;
    // Flat ground for the two campuses: Toronto at the start, Arlington's plains at the end
    // (from far enough back that no hill runs into College Park Center).
    nat = lerp(nat, nr.y - 0.1, Math.max(1 - smooth(22, 52, x), smooth(494, 514, x)));
    nat = lerp(nat, pad.y, pad.weight(x, z));
    // Lake Ontario on the near side, past the city.
    const lake = !far ? band(x, LAKE, 10) * smooth(HALF + 7, HALF + 13, d) : 0;
    nat = lerp(nat, nr.y - 1.6, lake);
    const keep = Math.max(smooth(HALF + 0.6, HALF + 13, d), Math.exp(-(((x - ravineX(z)) / 13) ** 2)) * smooth(HALF - 1, HALF + 1, d));
    let h = lerp(nr.y - 0.1, nat, keep);
    // Water lies flat: the Mississippi in the ravine, the lake past the city.
    if (rav > 0.2) h = Math.max(h, nr.y - 9.5);
    if (lake > 0.5) h = Math.max(h, nr.y - 1.6);
    H[k] = h; P[k * 3] = x; P[k * 3 + 1] = h; P[k * 3 + 2] = z;
    AS[k] = nr.s; AH[k] = h - nr.y; AD[k] = d; U[k] = nr.u; E[k] = nr.y;
   }
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  // True colours: lush in Ontario drying to Texas, rock on the steep faces, gravel and mown
  // verges by the road, a creek in the ravine.
  const nrm = geo.attributes.normal.array, AC = new Float32Array(N * 3);
  // Lush Ontario green, the Midwest's patchwork of fields, Ozark green, Oklahoma's red dirt,
  // dry Texas tan.
  const GRASS = ["#73a24c", "#7fa955", "#6f9a48", "#a7a463", "#c2ad78"], ROCK = ["#9d9b95", "#b3ab98", "#b98d66", "#ad724f"];
  const FIELDS = ["#9fb24f", "#c9b25c", "#b6c46b", "#a88d5f", "#88a84c", "#d1bf7a"];
  const c = new THREE.Color(), fc = new THREE.Color(), lawn = new THREE.Color(), red = col("#b4683f");
  for (let k = 0; k < N; k++) {
    if (k % nx === 0) await slice();
    const x = P[k * 3], z = P[k * 3 + 2], prog = x / END, d = AD[k];
    const v = fbm(x / 16, z / 16, 2, 21);
    c.copy(ramp(GRASS, prog + (v - 0.5) * 0.15)).multiplyScalar(0.88 + v * 0.24);
    const farm = band(x, FARM, 10) * smooth(HALF + 3, HALF + 6, d);
    if (farm > 0) c.lerp(fc.set(FIELDS[hash(Math.floor(x / 17), Math.floor((z + 3) / 13), 41) % FIELDS.length]).multiplyScalar(0.94 + v * 0.12), farm);
    c.lerp(red, band(x, REDDIRT, 12) * smooth(0.35, 0.65, noise(x / 12, z / 12, 23)) * 0.85);
    // Arlington's campus: mown green-tan lawn round the arena, not Oklahoma's dirt.
    c.lerp(lawn.set("#a3ad63").multiplyScalar(0.92 + v * 0.16), smooth(505, 520, x) * (1 - smooth(566, 586, x)) * 0.85);
    const slope = 1 - nrm[k * 3 + 1];
    c.lerp(ramp(ROCK, prog + (noise(x / 10, z / 10, 22) - 0.5) * 0.3), smooth(0.28, 0.5, slope));
    if (d < HALF + 1.1) c.copy(col("#b8b2a2"));
    else if (d < HALF + 4) c.lerp(col("#b9cb83"), 0.3);
    if (H[k] < E[k] - 7) c.lerp(col("#5f8fa0"), smooth(E[k] - 7, E[k] - 9.4, H[k]));
    if (H[k] < E[k] - 0.9 && x < LAKE[1] + 12) c.lerp(col("#5e93b0"), smooth(E[k] - 0.9, E[k] - 1.5, H[k]));
    c.toArray(AC, k * 3);
  }
  attrs(geo, [["aS", AS, 1], ["aH", AH, 1], ["aD", AD, 1], ["aCol", AC, 3]]);
  const heightAt = (x, z) => {
    const fx = clamp((x - x0) / st, 0, nx - 1.001), fz = clamp((z - z0) / st, 0, nz - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * nx + i;
    return lerp(lerp(H[k], H[k + 1], tx), lerp(H[k + nx], H[k + nx + 1], tx), tz);
  };
  const slopeAt = (x, z) => {
    const e = 1.2, gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(gx, gz) / (2 * e);
  };
  return { geo, heightAt, slopeAt, ravineX };
}

// The road ends a few metres past where the van parks in Arlington: the trip goes no further.
function buildRoad(R) {
  const n = Math.min(R.n, Math.ceil((R.s1 + ROAD_PAST) / R.step) + 1);
  const P = new Float32Array(n * 2 * 3), AS = new Float32Array(n * 2), AU = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const rx = -R.TZ[i], rz = R.TX[i], l = Math.hypot(rx, rz) || 1;
    for (let k = 0; k < 2; k++) {
      const u = k ? HALF : -HALF, o = (i * 2 + k);
      P[o * 3] = R.X[i] + (rx / l) * u; P[o * 3 + 1] = R.Y[i] + 0.12; P[o * 3 + 2] = R.Z[i] + (rz / l) * u;
      AS[o] = R.S[i]; AU[o] = u;
    }
  }
  const index = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = attrs(new THREE.BufferGeometry(), [["position", P, 3], ["aS", AS, 1], ["aU", AU, 1]]);
  geo.setIndex(index);
  return geo;
}

// Faceted solids (rocks, the bridge) go into one geometry, with ink edges in another.
class Solids {
  // Each vertex carries its route coordinate (s), height above the road (h) and distance
  // from it (d). A rock takes them from the road point nearest its middle, so the whole rock
  // colours with the ground it stands on; long things (the bridge) take them per vertex.
  constructor(R) { this.R = R; this.tris = []; this.lines = []; }
  route(x, y, z, at) { const nr = at ?? this.R.near(x, z); return [nr.s, y - nr.y, nr.d]; }
  add(geo, colour, faceJitter = 0.06, edgeAngle = 22, perVertex = false) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array, base = new THREE.Color(colour);
    let at = null;
    if (!perVertex) {
      g.computeBoundingBox();
      const m = g.boundingBox.getCenter(new THREE.Vector3());
      at = this.R.near(m.x, m.z);
    }
    for (let t = 0; t < p.length; t += 9) {
      const c = base.clone().multiplyScalar(1 + (noise(p[t] * 3.1, p[t + 2] * 2.7, 77) - 0.5) * 2 * faceJitter);
      for (let v = 0; v < 3; v++) { const o = t + v * 3; this.tris.push(p[o], p[o + 1], p[o + 2], c.r, c.g, c.b, ...this.route(p[o], p[o + 1], p[o + 2], at)); }
    }
    if (edgeAngle !== null) {                                   // null: a flat detail that reads without an outline
      const e = new THREE.EdgesGeometry(g, edgeAngle).attributes.position.array;
      const lc = base.clone().multiplyScalar(0.6);
      for (let v = 0; v < e.length; v += 3) this.lines.push(e[v], e[v + 1], e[v + 2], lc.r, lc.g, lc.b, ...this.route(e[v], e[v + 1], e[v + 2], at));
    }
    g.dispose(); if (g !== geo) geo.dispose();
  }
  line(a, b, colour) {
    const c = new THREE.Color(colour).multiplyScalar(0.6);
    this.lines.push(...a, c.r, c.g, c.b, ...this.route(...a), ...b, c.r, c.g, c.b, ...this.route(...b));
  }
  build() {
    const pack = (arr, withNormals) => {
      const n = arr.length / 9;
      const P = new Float32Array(n * 3), C = new Float32Array(n * 3), AS = new Float32Array(n), AH = new Float32Array(n), AD = new Float32Array(n);
      for (let i = 0, o = 0; i < n; i++, o += 9) {
        P[i * 3] = arr[o]; P[i * 3 + 1] = arr[o + 1]; P[i * 3 + 2] = arr[o + 2];
        C[i * 3] = arr[o + 3]; C[i * 3 + 1] = arr[o + 4]; C[i * 3 + 2] = arr[o + 5];
        AS[i] = arr[o + 6]; AH[i] = arr[o + 7]; AD[i] = arr[o + 8];
      }
      const geo = attrs(new THREE.BufferGeometry(), [["position", P, 3], ["aCol", C, 3], ["aS", AS, 1], ["aH", AH, 1], ["aD", AD, 1]]);
      if (withNormals) geo.computeVertexNormals();
      return geo;
    };
    return { solid: pack(this.tris, true), lines: pack(this.lines, false) };
  }
}

// A boulder: a jittered icosahedron, squashed and turned.
function boulder(r, sx, sy, sz, rot, x, y, z, seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const j = 0.78 + 0.44 * (hash(Math.round(vx * 100), Math.round(vy * 100) + Math.round(vz * 100) * 7, seed) / 4294967296);
    p.setXYZ(i, vx * j, Math.max(vy * j, -0.35), vz * j);
  }
  g.scale(r * sx, r * sy, r * sz); g.rotateY(rot); g.translate(x, y, z);
  return g;
}
// A mesa: an irregular prism with a slight batter and a smaller tier on top.
function mesa(r, h, x, y, z, seed, tiers = 2) {
  const rr = rng(seed), pos = [];
  let base = y - 2, rad = r, top = y + h;
  for (let t = 0; t < tiers; t++) {
    const n = 9 + Math.floor(rr() * 4), ring = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rr() * 0.3; ring.push([Math.cos(a) * rad * (0.75 + rr() * 0.35), Math.sin(a) * rad * (0.75 + rr() * 0.35)]); }
    const taper = 0.86 - rr() * 0.08;
    for (let k = 0; k < n; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % n];
      const A = [x + ax, base, z + az], B = [x + bx, base, z + bz], C = [x + bx * taper, top, z + bz * taper], D = [x + ax * taper, top, z + az * taper];
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
      pos.push(x, top, z, ...C, ...D);
    }
    base = top - 0.2; rad = rad * taper * (0.45 + rr() * 0.2); top = top + h * (0.28 + rr() * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

async function buildRocks(R, T, slice) {
  const S = new Solids(R), r = rng(31), placed = [];
  const ROCK = ["#a6a39d", "#b9b09c", "#bd8f67", "#b07450"];
  const ok = (x, z, rad) => {
    const nr = R.near(x, z);
    if (nr.d < HALF + 2.5 + rad) return false;
    if (Math.abs(x - T.ravineX(z)) < 10 + rad) return false;
    return !placed.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + rad + 1);
  };
  const put = (x, z, rad, top) => placed.push({ x, z, r: rad, top });
  // Mesas and buttes on the far side, every so often.
  for (let x = 470; x < 640; x += 30 + r() * 34) {      // buttes on the Oklahoma and Texas plains
    await slice();
    if (x > 490) break;                                   // the arena stands alone: Arlington and beyond stay open plain
    const rad = 3.5 + r() * 6, h = 3.5 + r() * 7;
    const nr = R.near(x, 0), z = R.Z[nr.i] - (HALF + 6 + rad + r() * 10);
    if (!ok(x, z, rad)) continue;
    S.add(mesa(rad, h, x, T.heightAt(x, z), z, Math.floor(r() * 1e9), r() < 0.7 ? 2 : 1), ramp(ROCK, x / END), 0.07, 30);
    put(x, z, rad, T.heightAt(x, z) + h * 1.5);
    // Fallen blocks at its foot.
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2, bx = x + Math.cos(a) * (rad + 1.5 + r() * 3), bz = z + Math.sin(a) * (rad + 1.5 + r() * 3), br = 0.6 + r() * 1.1;
      if (!ok(bx, bz, br)) continue;
      S.add(boulder(br, 1, 0.7, 1.1, r() * 6, bx, T.heightAt(bx, bz), bz, k + 1), ramp(ROCK, x / END), 0.08, 26);
      put(bx, bz, br, T.heightAt(bx, bz) + br);
    }
  }
  // Clusters of boulders both sides; low and rounded like Canadian Shield granite at the start.
  for (let k = 0; k < 80; k++) {
    await slice();
    const s = R.s0 - 40 + r() * (R.s1 - R.s0 + 100), p = R.at(s);
    const side = r() < 0.6 ? -1 : 1;
    const d = HALF + 3 + Math.pow(r(), 1.5) * (side < 0 ? 20 : 14);
    const cx = p.x - p.tz * d * side, cz = p.z + p.tx * d * side;
    const n = 1 + Math.floor(r() * 4), shield = p.x < 90;
    if (p.x < 40 || (p.x > 505 && p.x < 600) || (!shield && band(p.x, OZARKS) < 0.5 && r() < 0.7)) continue;   // campuses clear; outcrops mostly in the Ozarks
    for (let m = 0; m < n; m++) {
      const br = (shield ? 1.6 + r() * 2.6 : 0.5 + r() * 1.6) * (side > 0 ? 0.7 : 1);
      const bx = cx + (r() - 0.5) * 6, bz = cz + (r() - 0.5) * 5;
      if (!ok(bx, bz, br)) continue;
      S.add(boulder(br, 1, shield ? 0.42 : 0.75, 1.15, r() * 6, bx, T.heightAt(bx, bz) - br * 0.15, bz, k * 9 + m), ramp(ROCK, bx / END), 0.08, 26);
      put(bx, bz, br, T.heightAt(bx, bz) + br);
    }
  }
  // Long fins of rock on the far side, like strata breaking the surface.
  for (let k = 0; k < 16; k++) {
    const s = R.s0 - 20 + ((k + r()) / 16) * (R.s1 - R.s0 + 40), p = R.at(s);
    if (band(p.x, OZARKS) < 0.5) continue;               // limestone ledges in the Ozark hills only
    const d = HALF + 6 + r() * 9, x = p.x + p.tz * d, z = p.z - p.tx * d, len = 4 + r() * 5;
    if (!ok(x, z, len * 0.8)) continue;
    S.add(boulder(len, 1.6, 0.55 + r() * 0.3, 0.55, Math.atan2(p.tz, p.tx) * -1 + (r() - 0.5) * 0.6, x, T.heightAt(x, z) - 0.6, z, 500 + k), ramp(ROCK, x / END), 0.08, 24);
    put(x, z, len * 0.8, T.heightAt(x, z) + len * 0.75);
  }
  return { S, placed };
}

// ---- landmarks: where the trip starts and ends, and a few things on the way. Built in each
// one's local frame (x along the road, -z away from it, toward the far side) and set down beside
// the route; each part reveals with the ground it stands on.
function gable(w, h, depth) {
  // A triangular prism: a pediment or a pitched roof, ridge along x.
  const x0 = -w / 2, x1 = w / 2, z0 = -depth / 2, z1 = depth / 2;
  const P = [
    [x0, 0, z1], [x1, 0, z1], [0, h, z1], [x1, 0, z0], [x0, 0, z0], [0, h, z0],
  ];
  const tri = (a, b, c) => [...P[a], ...P[b], ...P[c]];
  const pos = [...tri(0, 1, 2), ...tri(3, 4, 5), ...tri(0, 2, 5), ...tri(0, 5, 4), ...tri(1, 3, 5), ...tri(1, 5, 2)];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// The local-frame kit the landmark builders share: `site(s, u)` is a spot beside the route
// (u > 0 toward the near side), `add` sets a part down there with its base on the ground.
function landmarkKit(R, T, S, placed) {
  const site = (s, u) => { const p = R.at(s); return { x: p.x - p.tz * u, z: p.z + p.tx * u, yaw: Math.atan2(p.tz, p.tx) }; };
  const add = (g, st, colour, { y = 0, jitter = 0.03, edge = 28 } = {}) => {
    g.rotateY(-st.yaw);
    g.translate(st.x, T.heightAt(st.x, st.z) + y, st.z);
    S.add(g, colour, jitter, edge);
  };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);
  const cap = (r, seg, x = 0, y = 0, z = 0) => new THREE.SphereGeometry(r, seg, Math.max(4, seg / 4), 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);
  // `see`: ground kept clear (of trees and rocks) that the camera may look past, not a solid in its way.
  const put = (st, r, top, see = false) => placed.push({ x: st.x, z: st.z, r, top: T.heightAt(st.x, st.z) + top, ground: see });
  return { site, add, box, cyl, cap, put };
}

// Sizes in the scene (metres): the hall's dome across its base, the arena's glass front along the road.
// Both put a real metre at 0.42 scene metres, so the two buildings keep their true sizes to each other.
// (Real sizes, sources and parts are in road/landmarks.js.)
const SIZE = { hallDome: 13.8, cpcFront: 14.9 };
const HALL_BACK = 27;   // metres of road between Convocation Hall's centre and the start
const HALL_OUT = 20;    // metres from the road's edge to its centre, across the road from the camera
const CPC_BACK = 24;    // metres between College Park Center's centre and where the van parks
const CPC_OUT = 17;     // metres from the road's edge to the middle of its glass front
// The arena's glass entrance is a 45-degree chamfer of the real building; it is turned this far from the road
// toward the parked van, so the arrival shot sees it as the user's photograph C1 does (the tower at its right) and
// its 140 m length stays inside the strip at 375 px.
const CPC_TURN = THREE.MathUtils.degToRad(70);
const cpcSite = (site, R) => { const st = site(R.s1 - CPC_BACK, -(HALF + CPC_OUT)); return { ...st, yaw: st.yaw - CPC_TURN }; };

// Dev measurement: how long each landmark took to build (ms), read by roadStrip's stats().
const STATS = { hallMs: 0, cpcMs: 0, hallTris: 0, cpcTris: 0 };
function buildLandmarks(R, T, S, placed, milestones) {
  const k = landmarkKit(R, T, S, placed);
  const { site, add, box, cyl, cap, put } = k;
  // The ground a landmark keeps clear of trees and rocks: its circles, given in its own frame.
  const keepClear = (st, built) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    for (const [x, z, r] of built.clear) put({ x: st.x + x * c - z * s, z: st.z + x * s + z * c }, r, built.H, true);
  };
  // Toronto, the University of Toronto's St. George campus: Convocation Hall, its colonnade
  // toward the road, far enough behind the start that all of it is in colour as the van sets
  // off. (No skyline: the CN Tower cannot be shown whole within the strip's frame.)
  {
    const hall = site(R.s0 - HALL_BACK, -(HALF + HALL_OUT));
    const t0 = performance.now();
    const built = convocationHall(k, hall, SIZE.hallDome);
    STATS.hallMs = performance.now() - t0; STATS.hallTris = built.tris;
    keepClear(hall, built);
    put(site(R.s0 - 8, HALF + 12), 10, 0);       // the near side in the opening shot stays open lawn
  }
  // The Midwest: grain silos and a barn at a few farmsteads.
  for (const [x, u] of [[150, -(HALF + 15)], [228, -(HALF + 13)], [284, HALF + 12]]) {
    const st = site(R.near(x, 0).s, u);
    add(cyl(1.5, 1.5, 7.5, 14, -2, 0, 0), st, "#c3c7ca", { edge: 40 });
    add(cap(1.5, 14, -2, 7.5), st, "#b8bcbf", { edge: 40 });
    add(cyl(1.3, 1.3, 6, 14, 1.2, 0, -0.6), st, "#c9ccce", { edge: 40 });
    add(cap(1.3, 14, 1.2, 6, -0.6), st, "#b8bcbf", { edge: 40 });
    add(box(7, 3.6, 4.6, 6.5, 0, 0.5), st, "#9b3b2c");
    add(gable(7, 2, 4.6).translate(6.5, 3.6, 0.5), st, "#6f6f6c");
    put(st, 6, 8);
  }
  // Arlington: the University of Texas at Arlington's College Park Center beside the end of the
  // road, just behind where the van parks so it is in colour when it arrives.
  {
    const cpc = cpcSite(site, R);
    const t1 = performance.now();
    const built = collegeParkCenter(k, cpc, SIZE.cpcFront);
    STATS.cpcMs = performance.now() - t1; STATS.cpcTris = built.tris;
    keepClear(cpc, built);
  }
  // A plain post at each 500 km mark on the near shoulder.
  for (const m of milestones) add(box(0.26, 1.15, 0.26), site(m, HALF + 1.3), "#f2f1ec", { jitter: 0, edge: 40 });
  // The welcome signs at either end; their faces come back as their own mesh.
  return buildSigns(k, R, T, HALF);
}

function buildBridge(R, T, S) {
  // Deck sides and soffit, parapets and two piers where the road crosses the ravine.
  const xa = RAVINE_X - 15, xb = RAVINE_X + 15, ia = R.near(xa, 0).i, ib = R.near(xb, 0).i;
  const pos = [], rails = [];
  const pt = (i, u, dy) => { const rx = -R.TZ[i], rz = R.TX[i]; return [R.X[i] + rx * u, R.Y[i] + dy, R.Z[i] + rz * u]; };
  for (let i = ia; i < ib; i += 2) {
    const j = Math.min(ib, i + 2);
    for (const u of [-HALF - 0.3, HALF + 0.3]) {
      const a = pt(i, u, 0.1), b = pt(j, u, 0.1), c = pt(j, u, -1.1), d = pt(i, u, -1.1);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      const ra = pt(i, u, 1.05), rb = pt(j, u, 1.05);
      pos.push(...a, ...b, ...rb, ...a, ...rb, ...ra);
    }
    const a = pt(i, -HALF - 0.3, -1.1), b = pt(j, -HALF - 0.3, -1.1), c = pt(j, HALF + 0.3, -1.1), d = pt(i, HALF + 0.3, -1.1);
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  S.add(g, "#c2c0b9", 0.02, 60, true);
  for (const u of [-HALF - 0.3, HALF + 0.3]) {
    S.line(pt(ia, u, 1.05), pt(ib, u, 1.05), "#c2c0b9");
    S.line(pt(ia, u, -1.1), pt(ib, u, -1.1), "#c2c0b9");
    S.line(pt(ia, u, 0.1), pt(ib, u, 0.1), "#c2c0b9");
  }
  for (const f of [0.36, 0.64]) {
    const i = Math.round(lerp(ia, ib, f)), floor = T.heightAt(R.X[i], R.Z[i]) - 1, top = R.Y[i] - 1.1;
    const box = new THREE.BoxGeometry(1.4, top - floor, HALF * 1.6);
    box.rotateY(-Math.atan2(R.TZ[i], R.TX[i]));
    box.translate(R.X[i], (top + floor) / 2, R.Z[i]);
    S.add(box, "#c2c0b9", 0.02, 30, true);
  }
  return [R.S[ia], R.S[ib]];
}

async function buildGrowth(R, T, placed, bridge, slice) {
  const r = rng(57);
  const free = (x, z, rad) => !placed.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + rad + 0.6);
  const kinds = [];
  const make = async (geo, count, pick) => {
    const items = [];
    for (let k = 0; k < count * 4 && items.length < count; k++) {
      if (k % 40 === 0) await slice();
      const it = pick();
      if (!it) continue;
      const { x, z, scale } = it;
      const nr = R.near(x, z);
      if (nr.d < HALF + 2 || !free(x, z, scale)) continue;
      if (Math.abs(x - T.ravineX(z)) < 9 || T.slopeAt(x, z) > 0.45) continue;
      if (nr.s > bridge[0] - 5 && nr.s < bridge[1] + 5 && nr.d < HALF + 6) continue;
      const y = T.heightAt(x, z);
      items.push({ x, y, z, scale, sy: it.sy, colour: it.colour, s: nr.s, h: y - nr.y, d: nr.d, delay: 0.5 + r() * 2.5 });
    }
    const mesh = new THREE.InstancedMesh(geo, null, items.length);
    const data = new Float32Array(items.length * 4), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    items.forEach((it, i) => {
      e.set(0, r() * 6.28, 0);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e), new THREE.Vector3(it.scale, it.scale * (it.sy ?? 0.85 + r() * 0.3), it.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.colour);
      data.set([it.s, it.h, it.d, it.delay], i * 4);
    });
    geo.setAttribute("iData", new THREE.InstancedBufferAttribute(data, 4));
    kinds.push(mesh);
  };
  const around = (dMin, dMax, nearMin) => {
    const s = R.s0 - 40 + r() * (R.s1 - R.s0 + 100), p = R.at(s), side = r() < 0.55 ? -1 : 1;
    const d = (side > 0 ? Math.max(nearMin, dMin) : dMin) + Math.pow(r(), 1.4) * (dMax - dMin);
    return { x: p.x - p.tz * d * side, z: p.z + p.tx * d * side, prog: p.x / END };
  };
  // Trees: a trunk and a faceted crown, in loose clumps; autumn colour through the middle.
  const tree = () => {
    const trunk = new THREE.CylinderGeometry(0.1, 0.14, 1.4, 5).translate(0, 0.7, 0);
    const crown = new THREE.IcosahedronGeometry(1, 0).scale(1, 1.25, 1).translate(0, 2.2, 0);
    const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
    const g = mergeNonIndexed([paint(trunk.toNonIndexed(), col("#5a4632")), paint(crown, new THREE.Color(1, 1, 1))]);
    return g;
  };
  const blob = (sy) => {
    const g = new THREE.IcosahedronGeometry(1, 0).scale(1, sy, 1).translate(0, sy * 0.7, 0);
    const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); g.computeVertexNormals();
    return g;
  };
  const GREENS = ["#5b7f3a", "#668a40", "#4f7535", "#729446"], FALL = ["#c07a35", "#a9532e", "#d1a13f"];
  let clump = null;
  // Woods in Ontario and the Ozarks, windbreaks on the farms, almost none on the red dirt,
  // wide low live oaks in Texas.
  await make(tree(), 120, () => {
    if (!clump || r() < 0.25) clump = around(HALF + 5, 34, 11);
    const x = clump.x + (r() - 0.5) * 9, z = clump.z + (r() - 0.5) * 7;
    const texas = x > 520;
    const dens = x < 90 ? 0.9 : band(x, OZARKS) > 0.4 ? 1 : band(x, FARM) > 0.5 ? 0.18 : band(x, REDDIRT) > 0.5 ? 0.06 : texas ? 0.55 : 0.5;
    if (r() > dens) return null;
    if (texas) return { x, z, scale: 1.3 + r() * 0.5, sy: 0.5 + r() * 0.12, colour: col(["#5d6b3a", "#66733f", "#56633a"][Math.floor(r() * 3)]) };
    const fall = x > 90 && r() < 0.18;
    return { x, z, scale: 0.8 + r() * 0.7, colour: col((fall ? FALL : GREENS)[Math.floor(r() * 4) % (fall ? 3 : 4)]) };
  });
  await make(blob(0.65), 150, () => {
    const p = around(HALF + 2.5, 30, 3);
    return { ...p, scale: 0.35 + r() * 0.45, colour: col(["#6f8a45", "#7d9a4c", "#8a8f55", "#6a7d40"][Math.floor(r() * 4)]) };
  });
  // Wildflowers: Ontario daisies and goldenrod, Texas bluebonnets and paintbrush.
  await make(blob(0.8), 320, () => {
    const p = around(HALF + 1.6, 16, 1.6);
    const set = p.prog < 0.5 ? ["#f4f1e6", "#f0c43f", "#e8d35a", "#b493d6"] : ["#4d6cc9", "#5a78d6", "#d9573f", "#f0c43f"];
    return { ...p, scale: 0.13 + r() * 0.08, colour: col(set[Math.floor(r() * 4)]) };
  });
  return kinds;
}

function mergeNonIndexed(list) {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "color"]) {
    const parts = list.map((g) => g.attributes[name].array), n = parts.reduce((a, p) => a + p.length, 0);
    const arr = new Float32Array(n); let o = 0;
    for (const p of parts) { arr.set(p, o); o += p.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeVertexNormals();
  list.forEach((g) => g.dispose());
  return out;
}

// Tiling smooth value noise: 64 lattice cells across 256 texels, sampled with filtering.
function noiseTexture() {
  const N = 256, P = 64, k = N / P, data = new Uint8Array(N * N);
  const h = (i, j) => hash(((i % P) + P) % P, ((j % P) + P) % P, 404) / 4294967296;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / k, fy = y / k, i = Math.floor(fx), j = Math.floor(fy);
    let u = fx - i, w = fy - j; u = u * u * (3 - 2 * u); w = w * w * (3 - 2 * w);
    const v = lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), w);
    data[y * N + x] = Math.round(v * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ the module
// `solo` (dev only: "convocation" or "cpc") shows one landmark alone, in colour, from the
// direction the scene's rest camera sees it. `cam` ("px,py,pz,tx,ty,tz,fov" in the landmark's own
// metres: x right, y up, z toward the front) puts it on a lawn instead and aims a free camera, and
// `aspect` sets the strip's height / width, so a render can be matched to a reference photograph.
// strip.solo then offers cam(), keys() and shot() for scripts.
export function roadStrip(host, { solo = null, cam: soloCam = null, aspect = 0.62 } = {}) {
  const make = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const el = make("div", "road");
  el.setAttribute("role", "img");
  const map = make("div", "road-map");
  const canvas = make("canvas", "road-canvas");
  map.append(canvas);
  const labels = make("div", "road-labels");
  labels.innerHTML = "<span>Toronto</span><span>Arlington, TX</span>";
  el.append(map, labels);
  host.append(el);

  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => motionQuery.matches;

  // ---- scene. Nothing heavy happens until the strip comes within a screen of the viewport:
  // then the road and van go up first, and the land is built in small slices after.
  let renderer = null, R = null, T = null, placed = [], ready = false, started = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 500);
  let camDist = 30;
  const viewDir = new THREE.Vector3();
  const dirOf = (out, elDeg, azDeg) => {
    const e = THREE.MathUtils.degToRad(elDeg), a = THREE.MathUtils.degToRad(azDeg);
    return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
  };
  dirOf(viewDir, ELEV, AZIM);
  const ground = (x, z) => (T ? T.heightAt(x, z) : -1e3);

  const uniforms = {
    uReveal: { value: 0 }, uBase: { value: 0 }, uFeather: { value: 4 }, uTime: { value: 0 }, uMotion: { value: still() ? 0 : 1 },
    uKey: { value: new THREE.Vector3(-0.45, 0.8, 0.5).normalize() },
    uPulse: { value: [new THREE.Vector4(0, 0, 0, -1), new THREE.Vector4(0, 0, 0, -1)] }, uFocus: { value: new THREE.Vector3() },
    uNoise: { value: null },
  };
  const owned = [];
  const mat = (vs, fs, extra = {}) => { const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...extra }); owned.push(m); return m; };
  // Compile a program off the main thread where the browser allows it. The renderer is only
  // disposed once no compile is pending (three polls the programs until they are ready).
  let compiling = 0, disposeLater = null;
  async function compile(obj) {
    if (!renderer?.compileAsync) return;
    compiling++;
    try { await renderer.compileAsync(obj, camera, scene); } catch { /* compiles on first draw */ }
    if (--compiling === 0 && disposeLater) disposeLater();
  }
  // Compile a mesh's program, then show it.
  const addMesh = async (obj) => {
    owned.push(obj.geometry);
    await compile(obj);
    if (alive) scene.add(obj);
    return obj;
  };

  // Motes: pollen and petals lifting off where the colour arrives. A fixed pool.
  const MOTES = 160;
  const mPos = new Float32Array(MOTES * 3), mLife = new Float32Array(MOTES).fill(2), mSize = new Float32Array(MOTES), mCol = new Float32Array(MOTES * 3);
  const mVel = new Float32Array(MOTES * 3), mDur = new Float32Array(MOTES).fill(1);
  const moteGeo = attrs(new THREE.BufferGeometry(), [["position", mPos, 3], ["aLife", mLife, 1], ["aSize", mSize, 1], ["aColor", mCol, 3]]);
  const moteMat = new THREE.ShaderMaterial({ vertexShader: MOTE_VS, fragmentShader: MOTE_FS, uniforms: { uDpr: { value: 1 } }, transparent: true, depthWrite: false });
  owned.push(moteMat, moteGeo);
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  const MOTE_COLS = ["#f0c43f", "#e9e3c9", "#a9c46a", "#d9a441", "#ffffff"].map((h) => col(h));
  let moteNext = 0, motesAlive = 0;
  const rm = rng(99);
  let spawned = false;
  function spawn(x, y, z, burst) {
    spawned = true;
    const i = moteNext; moteNext = (moteNext + 1) % MOTES;
    mPos[i * 3] = x; mPos[i * 3 + 1] = y + 0.3; mPos[i * 3 + 2] = z;
    const a = rm() * Math.PI * 2, sp = burst ? 2 + rm() * 3 : 0.4 + rm() * 0.8;
    mVel[i * 3] = Math.cos(a) * sp * 0.6 + 0.5; mVel[i * 3 + 1] = (burst ? 2.2 : 1) + rm() * 1.4; mVel[i * 3 + 2] = Math.sin(a) * sp * 0.6;
    mLife[i] = 0; mDur[i] = 1.4 + rm() * 1.4;
    mSize[i] = 2 + rm() * 2.6;
    MOTE_COLS[Math.floor(rm() * MOTE_COLS.length)].toArray(mCol, i * 3);
  }

  // ---- the van
  const vanGroup = new THREE.Group(), body = new THREE.Group(), holder = new THREE.Group();
  vanGroup.matrixAutoUpdate = false;
  vanGroup.add(body); body.add(holder);
  const shadowGeo = new THREE.PlaneGeometry(2.9, 7.0).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  owned.push(shadowGeo, shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.set(0.25, 0.04, 0.1);
  vanGroup.add(shadow);
  let fig = null;
  function loadVan() {
    loadPart(VAN_URL).then(async (data) => {
      if (!alive) return;
      fig = new Figure(data);
      fig.color = 1; fig.holo = 0;
      fig.setView(viewDir);
      // Put the ground point midway between the axles at the holder's origin; mm to metres.
      const wheels = data.groups.filter((g) => g.name.startsWith("wheel"));
      const mid = wheels.reduce((a, g) => a + g.center[2], 0) / Math.max(1, wheels.length);
      let minY = Infinity;
      for (let i = 1; i < data.position.length; i += 3) minY = Math.min(minY, data.position[i]);
      const c = data.centre;
      fig.root.scale.setScalar(0.001);
      fig.root.position.set(-(0 - c[0]) * 0.001, -(minY - c[1]) * 0.001, -(mid - c[2]) * 0.001);
      await compile(fig.root);
      if (!alive) return;
      holder.add(fig.root);
      redraw();
    }).catch((e) => console.warn("road: van", e));
  }

  // ---- motion state
  const span = () => R.s1 - R.s0;
  const sOf = (f) => R.s0 + f * span();
  const milestones = [];
  let target = 0, s = 0, v = 0, front = 0, fv = 0, arrived = 0;
  const cam = new THREE.Vector3();
  let dip = 0, dipV = 0, roll = 0, odo = 0, prevV = 0;
  let raf = 0, last = 0, visible = true, alive = true, W = 0, H = 0, ppm = 28;
  const pulses = uniforms.uPulse.value, pulseBorn = [-1, -1];
  let lastPulse = -10, clock = 0;

  // The base layer is centred on the van (a pool around it, in the shaders). The bloom trails
  // the van's tail, catching up faster the further behind it is, and never runs ahead of it.
  const tail = () => s - 3.2;
  // Parked in Arlington, the trip is done: the colour soaks on past the van over ARRIVE_S
  // seconds, through the end of the road and the land around it, so nothing is left white.
  const arrival = () => arrived * arrived * (3 - 2 * arrived) * END_FILL;
  const frontTarget = () => tail() - 0.3 + arrival();

  // ---- the camera director
  // At rest: the composed 3/4 view. Driving: a chase framing, lower and further behind,
  // widening with speed, with a few authored beats along the route blended in and out.
  // az is degrees about the vertical (0: camera on the near side looking across the road,
  // negative: behind the van); while driving it partly follows the van's heading.
  // The van is the hero of every shot: the camera stays close (the same distance in every
  // shot) and the beats change only its angle and height, like a chase car alongside.
  const REST = { el: ELEV, az: AZIM, dist: 1, look: 1, lift: 1.2 };
  // At the start and the end the rest view drops low, so the campus and the skyline stand up
  // against the sky: Convocation Hall behind the van in Toronto; at Arlington it stands past
  // the end of the road and looks back down it (az relative to the heading), the van in front
  // and the arena behind it, with nothing of the unfunded land ahead in shot.
  const START_REST = { el: 4, az: -6, dist: 1, look: -15, lift: 9.6 };
  const END_REST = { el: 8, az: 50, dist: 1, look: -11, lift: 1.6 };
  const DRIVE = { el: 22, az: -38, dist: 1, look: 1.6, lift: 1.2 };
  const BEATS = [
    [105, 190, { el: 15, az: -62, dist: 1, look: 1.4, lift: 1.3 }],   // the climb: low from behind, the road rising past it
    [197, 240, { el: 46, az: -14, dist: 1, look: 2.4, lift: 1.0 }],   // the crest: rise over the van as the valley opens ahead
    [312, 352, { el: 11, az: 4, dist: 1, look: 0.6, lift: 1.1 }],     // the bridge: track alongside, the ravine below
    [408, 498, { el: 33, az: -30, dist: 1, look: 1.6, lift: 1.2 }],   // the mesas: a higher three-quarter, rock behind
    [518, 600, { el: 30, az: -52, dist: 1, look: 0.6, lift: 1.2 }],   // the final run: from behind and above, the road it came by
  ];
  const ROUGH = [[316, 346], [470, 505]];             // bridge joints and a washboard descent: a touch of shake
  const KEYS = ["el", "az", "dist", "look", "lift"];
  const shot = { ...REST }, shotV = { el: 0, az: 0, dist: 0, look: 0, lift: 0 };
  let centreX = 0.2, centreY = 0.2, low = 0, campus = 0, drive = 0, camRoll = 0, fit = 1, sizeK = 1, vanBox = [0, 0, 0, 0];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), vanTop = new THREE.Vector3();
  const nearRocks = [];
  const blocked = (a, b) => {
    // Does the line from the camera to the van pass through the land or a rock?
    for (let k = 1; k < 16; k++) {
      tmp.lerpVectors(a, b, k / 16);
      if (tmp.y < ground(tmp.x, tmp.z) + 0.8) return true;
      for (const q of nearRocks) if (tmp.y < q.top + 0.5 && Math.hypot(tmp.x - q.x, tmp.z - q.z) < q.r + 0.8) return true;
    }
    return false;
  };
  const want = { el: 0, az: 0, dist: 1, look: 0, lift: 0 };
  let losLift = 0, losTick = 0;
  function desired(m, out = want) {
    const p = R.at(s);
    let wBeat = 0, beat = null;
    for (const [x0, x1, b] of BEATS) { const w = smooth(x0 - 28, x0, p.x) * (1 - smooth(x1, x1 + 28, p.x)); if (w > wBeat) { wBeat = w; beat = b; } }
    const hy = THREE.MathUtils.radToDeg(Math.atan2(p.tz, p.tx));
    const prog = (s - R.s0) / span(), atEnd = smooth(0.89, 0.95, prog), atStart = 1 - smooth(0, 0.05, prog);
    // How much the shot opens up at the campuses (1: the van at 60% of its usual size); a
    // narrow phone strip opens further at the start to take in all of Convocation Hall.
    // Arriving, it stays open even while the van is still driving, so the arena is never cropped.
    // (past ~1600 px the strip stops growing taller, so a wider strip opens the start shot a little more)
    const wide = clamp(0.15 * (W / Math.max(H, 1) - 4.3), 0, 0.45);
    campus = Math.max(atStart * (W < 600 ? 0.5 : 0.06 + wide) * (1 - m), atEnd * 0.14) / 0.4;
    // Arriving, the van rides low so the arena's roof stays in; parked at either campus it may sit
    // lower still, leaving the top of the strip to the landmark.
    centreY = 0.2 + 0.35 * Math.min(campus, 1.4) * (1 - m * (1 - atEnd)) + 0.27 * Math.max(atStart, atEnd) * (1 - m);
    low = 0.22 * Math.max(atStart, atEnd) * (1 - m);   // how much further toward the bottom edge the van may go there
    // At rest there the van may sit right of centre; at the start further right still, so the shot is
    // Convocation Hall and the van, with little of the unfunded land ahead.
    centreX = 0.2 + Math.max(0.5 * atStart, 0.32 * atEnd) * (1 - m);
    for (const k of KEYS) {
      const d = beat ? lerp(DRIVE[k], beat[k], wBeat) : DRIVE[k];
      const end = k === "az" ? END_REST.az - hy : END_REST[k];
      // (a phone's narrow strip aims further back at the start, so the hall's left wing stays in)
      const rest = lerp(lerp(REST[k], end, atEnd), k === "look" && W < 600 ? START_REST.look - 4.5 : START_REST[k], atStart);
      // Pulling into Arlington the chase eases into the arrival shot, so the arena is framed
      // the same way while the van is still rolling as once it has parked.
      out[k] = lerp(rest, lerp(k === "az" ? d - 0.55 * hy : d, end, atEnd), m);
    }
    // Line of sight: lift the camera until nothing stands between it and the van. Checked
    // every third frame (it moves slowly); the lift itself is smoothed with the shot.
    if (losTick++ % 3 === 0) {
      vanTop.set(p.x - p.tz * 1.8, p.y + 1.6, p.z + p.tx * 1.8);
      nearRocks.length = 0;
      for (const q of placed) if (!q.ground && Math.abs(q.x - p.x) < 45 && Math.abs(q.z - p.z) < 45) nearRocks.push(q);
      losLift = 0;
      for (let k = 0; k < 8; k++) {
        dirOf(tmp2, out.el + losLift, out.az);
        const camPos = tmp2.multiplyScalar(camDist * out.dist * fit).add(vanTop);
        if (camPos.y > ground(camPos.x, camPos.z) + 2 && !blocked(camPos, vanTop)) break;
        losLift += 5;
      }
    }
    out.el = Math.min(70, out.el + losLift);
    return out;
  }
  const camGoal = (out) => {
    const p = R.at(s), look = shot.look + clamp(v * 0.01, 0, 1.2) * drive;
    // The van's own lane, at mid-height, a little ahead.
    return out.set(p.x + p.tx * look - p.tz * 1.8, p.y + shot.lift, p.z + p.tz * look + p.tx * 1.8);
  };

  const vF = new THREE.Vector3(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), vL = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function pose() {
    const p = R.at(s);
    vF.set(p.tx, p.ty, p.tz).normalize();
    vR.crossVectors(vF, Y).normalize();
    vU.crossVectors(vR, vF).normalize();
    vL.copy(vR).negate();
    vanGroup.matrix.makeBasis(vL, vU, vF).setPosition(p.x + vR.x * 1.8, p.y + 0.12 + vR.y * 1.8, p.z + vR.z * 1.8);
    vanGroup.matrixWorldNeedsUpdate = true;
    const moving = still() ? 0 : 1;
    const bob = moving * 0.03 * Math.sin(odo * 1.9) * clamp(Math.abs(v) / 10, 0, 1);
    body.position.set(0, bob, 0);
    body.rotation.set(dip * moving, 0, roll * moving, "XYZ");
  }
  const corners = [[3.1, 0, 1.2], [3.1, 0, -1.2], [-3.1, 0, 1.2], [-3.1, 0, -1.2], [3.1, 2.7, 1.1], [3.1, 2.7, -1.1], [-3.1, 2.7, 1.1], [-3.1, 2.7, -1.1]];
  const NC = corners.length;
  const INNER_GOAL = [0.6, 0.55], OUTER_GOAL = [0.96, 0.92], INNER_HARD = [0.74, 0.72], OUTER_HARD = [1, 1], goalV = new THREE.Vector3();
  const pts = Array.from({ length: NC + 2 }, () => new THREE.Vector3()), fRight = new THREE.Vector3(), fUp = new THREE.Vector3(), proj = new THREE.Vector3();
  // Aim the camera at `at`, then slide `at` until the van (inner margin) and ten metres of road
  // behind it (outer margin) are in frame. Used on the goal, and as a hard limit on the camera.
  function frame(at, inner, outer, shake = 0) {
    dirOf(viewDir, shot.el, shot.az);
    const D = camDist * shot.dist * fit;
    const aim = () => {
      camera.position.copy(at).addScaledVector(viewDir, D);
      camera.position.y += shake;
      camera.up.set(0, 1, 0);
      camera.lookAt(at);
      camera.rotateZ(camRoll);
      camera.updateMatrixWorld();
    };
    aim();
    const p = R.at(s);
    corners.forEach(([f, u, l], i) => pts[i].set(p.x + p.tx * f - p.tz * (1.8 + l), p.y + u, p.z + p.tz * f + p.tx * (1.8 + l)));
    pts[NC].set(p.x - p.tx * 6 - p.tz * 1.8, p.y, p.z - p.tz * 6 + p.tx * 1.8);     // the colour just behind it
    pts[NC + 1].set(p.x - p.tz * 1.8, p.y + 1.3, p.z + p.tx * 1.8);                  // the van's centre: middle third
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(FOV / 2)), halfW = halfH * camera.aspect;
    const right = fRight.setFromMatrixColumn(camera.matrixWorld, 0), up = fUp.setFromMatrixColumn(camera.matrixWorld, 1);
    for (let it = 0; it < 6; it++) {
      let dx = 0, dy = 0;
      pts.forEach((q, i) => {
        const n = proj.copy(q).project(camera);
        if (!(n.z > -1 && n.z < 1)) return;                // behind the camera or past the far plane
        const [mx, my] = i < NC ? [inner[0], inner[1] + low] : i === NC ? outer : [centreX, centreY];
        if (n.x > mx) dx = Math.max(dx, n.x - mx); else if (n.x < -mx) dx = Math.min(dx, n.x + mx);
        if (n.y > my) dy = Math.max(dy, n.y - my); else if (n.y < -my) dy = Math.min(dy, n.y + my);
      });
      if (!dx && !dy) break;
      at.addScaledVector(right, dx * halfW).addScaledVector(up, dy * halfH);
      aim();
    }
    return at;
  }
  const fitFor = () => {
    // At the two campuses the shot opens up (the van a little smaller) to take in the landmarks.
    const f = clamp(fit * Math.max(vanBox[0] / (0.34 * sizeK * (1 - 0.4 * campus)), vanBox[1] / 1.36), 0.5, 3.5);
    return Number.isFinite(f) ? f : 1;
  };
  // At rest the size is settled at once, so the strip never zooms on its own.
  function settleFit() {
    if (!W) return;
    for (let i = 0; i < 6; i++) { frame(camGoal(cam), INNER_GOAL, OUTER_GOAL); placeCamera(); fit = fitFor(); }
    frame(camGoal(cam), INNER_GOAL, OUTER_GOAL); placeCamera();
  }
  function placeCamera(shake = 0) {
    frame(cam, INNER_HARD, OUTER_HARD, shake);
    // The van's outline on screen (NDC), which holds its size steady.
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    let behind = false;
    for (let i = 0; i < NC; i++) {
      const q = proj.copy(pts[i]).project(camera);
      if (!(q.z > -1 && q.z < 1)) behind = true;
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    if (!behind) { vanBox[0] = x1 - x0; vanBox[1] = y1 - y0; }
    uniforms.uFocus.value.copy(cam);
    if (fig) fig.setView(tmp.copy(camera.position).sub(cam).normalize());
  }

  function fire(at) {
    if (clock - lastPulse < 0.35) {                 // quick drags: merge into the ring already running
      const k = pulseBorn[0] > pulseBorn[1] ? 0 : 1;
      pulses[k].set(at.x, 0, at.z, 0); pulseBorn[k] = clock;
    } else {
      const k = pulses[0].w < 0 ? 0 : pulses[1].w < 0 ? 1 : (pulseBorn[0] < pulseBorn[1] ? 0 : 1);
      pulses[k].set(at.x, 0, at.z, 0); pulseBorn[k] = clock;
      for (let i = 0; i < 28; i++) spawn(at.x + (rm() - 0.5) * 4, at.y, at.z + (rm() - 0.5) * 4, true);
    }
    lastPulse = clock;
  }

  function step(t) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
    last = t; clock += dt;
    uniforms.uTime.value += dt;
    const reduced = still();
    uniforms.uMotion.value = reduced ? 0 : 1;
    const goal = sOf(target), before = s;

    // Van: critically damped on route distance, with a soft speed limit.
    const w = 5.5;
    v += (w * w * (goal - s) - 2 * w * v) * dt;
    v = clamp(v, -600, 600);
    s += v * dt;
    if (Math.abs(goal - s) < 0.02 && Math.abs(v) < 0.05) { s = goal; v = 0; }
    odo += v * dt;
    const acc = (v - prevV) / dt; prevV = v;
    // Nose dips under braking and lifts under power, then settles with a small bounce.
    const dipGoal = clamp(-acc * 0.0012, -0.035, 0.035), wd = 9, zd = 0.42;
    dipV += (wd * wd * (dipGoal - dip) - 2 * zd * wd * dipV) * dt; dip += dipV * dt;
    roll += (clamp(-R.at(s).k * v * v * 0.0009, -0.05, 0.05) - roll) * Math.min(1, dt * 6);
    if (fig) fig.tick(dt, v / WHEEL_R / ((WHEEL_RPM / 60) * Math.PI * 2));

    // Milestones the van actually drives past.
    if (!reduced) for (const m of milestones) if (before < m - 0.8 && s >= m - 0.8) fire(R.at(m));

    // The colour front trails the van, never by more than LAND_LAG, so on a long drag the land
    // fills in right behind it rather than metres later.
    const parked = s >= R.s1 - 0.5 && Math.abs(v) < 1;
    arrived = clamp(arrived + (parked ? dt / ARRIVE_S : -dt / 0.5), 0, 1);
    const ft = frontTarget(), prevFront = front;
    const wf = 5 + Math.max(0, ft - front) * 0.3;
    fv += (wf * wf * (ft - front) - 2 * wf * fv) * dt; front += fv * dt;
    const hi = tail() + arrival();
    if (front > hi) { front = hi; fv = Math.min(fv, 0); }
    if (front < ft - LAND_LAG) { front = ft - LAND_LAG; fv = Math.max(fv, 0); }
    if (Math.abs(ft - front) < 0.03 && Math.abs(fv) < 0.05) { front = ft; fv = 0; }
    uniforms.uReveal.value = front;
    uniforms.uBase.value = s;
    // Pollen lifts where the colour arrives, more the faster it travels, never a flood.
    if (!reduced && front > prevFront) {
      let n = Math.min(4, (front - prevFront) * 0.7);
      while (n > 0) {
        if (rm() < n) {
          const fs = front - 2 - rm() * 4, p = R.at(fs), side = rm() < 0.5 ? -1 : 1, d = HALF + rm() * 16;
          const x = p.x - p.tz * d * side, z = p.z + p.tx * d * side;
          spawn(x, ground(x, z), z, false);
        }
        n -= 1;
      }
    }
    motesAlive = 0;
    for (let i = 0; i < MOTES; i++) {
      if (mLife[i] >= 1) continue;
      mLife[i] += dt / mDur[i];
      const o = i * 3;
      mVel[o + 1] -= 0.6 * dt;
      mVel[o] += Math.sin(clock * 2 + i) * 0.4 * dt;
      mPos[o] += mVel[o] * dt; mPos[o + 1] += mVel[o + 1] * dt; mPos[o + 2] += mVel[o + 2] * dt;
      if (mLife[i] < 1) motesAlive++;
    }
    moteGeo.attributes.position.needsUpdate = true; moteGeo.attributes.aLife.needsUpdate = true;
    if (spawned) { moteGeo.attributes.aSize.needsUpdate = true; moteGeo.attributes.aColor.needsUpdate = true; spawned = false; }
    for (let k = 0; k < 2; k++) if (pulses[k].w >= 0) { pulses[k].w += dt; if (pulses[k].w > 2) pulses[k].w = -1; }

    // Camera: how much it is "driving" eases in fast and out slowly, so it settles calmly. The
    // chase framing is for going forward; reversing keeps the calm rest view.
    const mt = reduced ? 0 : smooth(0.5, 12, v);
    drive += (mt - drive) * Math.min(1, dt * (mt > drive ? 1.6 : 0.8));
    if (Math.abs(mt - drive) < 1e-3) drive = mt;
    // The shot follows its goal on a calm spring (~2.3 s to settle); pulling into Arlington, where it
    // swings round to look back down the road, it doubles in stiffness so the arrival lands in ~1.1 s.
    desired(drive); const ws = 2.1 * (1 + smooth(0.86, 0.95, (s - R.s0) / span()));
    let shotBusy = false;
    for (const k of KEYS) {
      shotV[k] += (ws * ws * (want[k] - shot[k]) - 2 * ws * shotV[k]) * dt; shot[k] += shotV[k] * dt;
      if (Math.abs(want[k] - shot[k]) < 1e-3 && Math.abs(shotV[k]) < 1e-3) { shot[k] = want[k]; shotV[k] = 0; } else shotBusy = true;
    }
    // Bank a little into curves; a touch of shake only over the rough bits.
    const rollGoal = reduced ? 0 : clamp(R.at(s).k * v * 0.05, -0.045, 0.045) * drive;
    camRoll += (rollGoal - camRoll) * Math.min(1, dt * 2.5);
    if (Math.abs(rollGoal - camRoll) < 1e-4) camRoll = rollGoal;
    const px = R.at(s).x;
    let rough = 0;
    if (!reduced) for (const [a, b] of ROUGH) rough = Math.max(rough, smooth(a - 4, a, px) * (1 - smooth(b, b + 4, px)) * clamp(Math.abs(v) / 25, 0, 1));
    const shake = rough * 0.025 * (Math.sin(clock * 31) * 0.6 + Math.sin(clock * 47 + 1.3) * 0.4);
    // Hold the van at a steady size on screen whatever the angle: its outline should span
    // ~17% of the strip's width (end-on it reads narrower, so the camera comes in) without
    // ever taking more than 68% of its height.
    if (vanBox[0] > 0) fit += (fitFor() - fit) * Math.min(1, dt * 2.5);
    // The rig rides with the van: its aim is the van's own (already smoothed) position plus the
    // shot's offsets, so the van stays in frame at any speed, in either direction.
    const g = frame(camGoal(goalV), INNER_GOAL, OUTER_GOAL);
    cam.copy(g);

    pose(); placeCamera(shake);
    renderer.render(scene, camera);

    const busy = s !== goal || v !== 0 || front !== ft || (arrived > 0 && arrived < 1) || shotBusy || drive > 0 || Math.abs(camRoll) > 1e-4 ||
      Math.abs(dip) > 1e-4 || Math.abs(dipV) > 1e-3 || Math.abs(roll) > 1e-4 || motesAlive > 0 || pulses[0].w >= 0 || pulses[1].w >= 0;
    if (busy && visible) raf = requestAnimationFrame(step);
  }
  function kick() {
    if (!alive || !ready || raf || !visible || !W) return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
  // One frame when idle (something was added, the van arrived, a resize).
  function redraw() {
    if (!ready || !W) return;
    if (raf) return;
    pose(); placeCamera(); renderer.render(scene, camera);
  }
  function snap() {
    s = sOf(target); v = 0; prevV = 0; arrived = s >= R.s1 - 0.5 ? 1 : 0; front = frontTarget(); fv = 0; dip = dipV = roll = 0;
    uniforms.uReveal.value = front; uniforms.uBase.value = s;
    drive = 0; camRoll = 0;
    losTick = 0; Object.assign(shot, desired(0)); for (const k of KEYS) shotV[k] = 0;
    frame(camGoal(cam), INNER_GOAL, OUTER_GOAL);
    settleFit();
  }

  // Size is known (and the strip's height set) before anything is built.
  function layout() {
    const w = Math.round(map.clientWidth);
    if (!w || w === W) return;
    W = w; H = solo ? Math.round(W * aspect) : Math.round(clamp(W * 0.236, 200, 380));
    ppm = clamp(W * 0.0245, 16.5, 40);        // starting distance; `fit` then holds the van's size
    sizeK = clamp(100 / (0.17 * W), 1, 1.7);    // a phone keeps it at ~100 px
    map.style.height = H + "px";
    if (renderer) applySize();
  }
  function applySize() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);   // the fill-rate budget for a full-width live scene
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    moteMat.uniforms.uDpr.value = dpr;
    // Distance so the van's spot on the road shows `ppm` pixels per metre.
    camDist = H / ppm / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (!ready) return;
    pose(); settleFit();
    renderer.render(scene, camera);
    kick();
  }

  // Build: road and van first (one short task, then the first frame), the land after in slices.
  let soloApi = null;
  async function startSolo() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setClearColor(soloCam ? 0xbcd2e8 : 0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    uniforms.uNoise.value = noiseTexture();
    R = buildRoute();
    T = { heightAt: () => 0 };
    const S = new Solids(R), k = landmarkKit(R, T, S, []);
    const hall = solo === "convocation";
    // On a free camera the landmark stands at the origin facing +z; otherwise at its place on the route.
    const st = soloCam ? { x: 0, z: 0, yaw: 0 } : hall ? k.site(R.s0 - HALL_BACK, -(HALF + HALL_OUT)) : cpcSite(k.site, R);
    const built = hall ? convocationHall(k, st, SIZE.hallDome) : collegeParkCenter(k, st, SIZE.cpcFront);
    if (soloCam) S.add(new THREE.BoxGeometry(400, 0.2, 400).translate(0, -0.11, 0), hall ? "#7fa656" : "#8fa65e", 0.06, 181);
    const solids = S.build();
    scene.add(new THREE.Mesh(solids.solid, mat(SOLID_VS, ROCK_FS, { side: THREE.DoubleSide })));
    scene.add(new THREE.LineSegments(solids.lines, mat(LINE_VS, LINE_FS)));
    uniforms.uReveal.value = uniforms.uBase.value = 1e6; uniforms.uMotion.value = 0;
    s = sOf(solo === "cpc" ? 1 : 0);
    const w = desired(0);
    applySize();
    solids.solid.computeBoundingSphere();
    const { center, radius } = solids.solid.boundingSphere;
    uniforms.uFocus.value.copy(soloCam ? new THREE.Vector3(0, 0, 0) : center);
    const keys = hall ? CH_KEYS : CPC_KEYS, sc = built.scale, v = new THREE.Vector3();
    const aim = (a) => {
      camera.fov = a[6] ?? FOV; camera.aspect = W / H; camera.updateProjectionMatrix();
      camera.position.set(a[0] * sc, a[1] * sc, a[2] * sc);
      camera.up.set(0, 1, 0); camera.lookAt(a[3] * sc, a[4] * sc, a[5] * sc);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    };
    if (soloCam) aim(soloCam.split(",").map(Number));
    else {
      // The scene's rest view at that end of the trip, framed on the landmark.
      dirOf(viewDir, w.el, w.az);
      camera.position.copy(center).addScaledVector(viewDir, (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.08);
      camera.lookAt(center);
      uniforms.uFocus.value.copy(center);
      renderer.render(scene, camera);
    }
    // Orbit the scene camera's own direction (its elevation and azimuth at the rest shot) round a point of the
    // landmark given in its own metres, at `dist` metres and `fov` degrees: baseline and 4x close-ups.
    const cyw = Math.cos(-st.yaw), syw = Math.sin(-st.yaw), tw = new THREE.Vector3();
    const orbit = (x, y, z, dist, fov) => {
      tw.set(st.x + sc * (x * cyw + z * syw), sc * y, st.z + sc * (-x * syw + z * cyw));
      dirOf(viewDir, w.el, w.az);
      camera.fov = fov; camera.aspect = W / H; camera.updateProjectionMatrix();
      camera.position.copy(tw).addScaledVector(viewDir, dist * sc);
      camera.up.set(0, 1, 0); camera.lookAt(tw); camera.updateMatrixWorld();
      uniforms.uFocus.value.copy(tw);
      renderer.render(scene, camera);
    };
    soloApi = {
      scale: sc, tris: built.tris,
      cam: aim, orbit,
      // Named key points in CSS pixels of the strip, for measuring ratios against a photograph.
      keys() { const o = {}; for (const [n, p] of Object.entries(keys)) { v.set(p[0] * sc, p[1] * sc, p[2] * sc).project(camera); o[n] = [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; } return o; },
    };
    el.classList.add("road-live");
  }

  async function start() {
    if (started || !alive) return;
    if (solo) { started = true; return startSolo(); }
    started = true;
    const slice = slicer(8, () => alive);
    loadVan();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    uniforms.uNoise.value = noiseTexture();
    owned.push(uniforms.uNoise.value);
    await slice();
    R = buildRoute();
    for (let k = 1; k * MILESTONE_KM < TRIP_KM; k++) milestones.push(sOf((k * MILESTONE_KM) / TRIP_KM));
    s = R.s0; front = R.s0 - 3.5;
    scene.add(vanGroup);
    await slice();
    await addMesh(new THREE.Mesh(buildRoad(R), mat(ROAD_VS, ROAD_FS, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    if (!alive) return;
    scene.add(motes);
    applySize();
    ready = true;
    snap();
    redraw();
    el.classList.add("road-live");
    kick();

    T = await buildTerrain(R, slice);
    if (!alive) return;
    await addMesh(new THREE.Mesh(T.geo, mat(SOLID_VS, TERRAIN_FS)));
    redraw();
    const rocks = await buildRocks(R, T, slice);
    placed = rocks.placed;
    const signs = buildLandmarks(R, T, rocks.S, placed, milestones);
    await slice();
    const bridge = buildBridge(R, T, rocks.S);
    await slice();
    const solids = rocks.S.build();
    await slice();
    await addMesh(new THREE.Mesh(solids.solid, mat(SOLID_VS, ROCK_FS, { side: THREE.DoubleSide })));
    await addMesh(new THREE.LineSegments(solids.lines, mat(LINE_VS, LINE_FS)));
    owned.push(signs.map);
    await addMesh(new THREE.Mesh(signs.geo, mat(SIGN_VS, signFS(FRAG), { uniforms: { ...uniforms, uSign: { value: signs.map } } })));
    redraw();
    const growMat = mat(GROW_VS, GROW_FS, { vertexColors: true });
    for (const m of await buildGrowth(R, T, placed, bridge, slice)) { m.material = growMat; m.frustumCulled = false; await addMesh(m); }
    if (!alive) return;
    losTick = 0; settleFit();
    redraw();
  }

  const ro = new ResizeObserver(layout);
  ro.observe(map);
  layout();
  // Start building when the strip is within a screen of the viewport; render only while visible.
  const nearIO = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { nearIO.disconnect(); start().catch((e) => { if (e !== ABORT) console.warn("road:", e); }); } }, { rootMargin: "100% 0px 100% 0px" });
  nearIO.observe(map);
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); });
  io.observe(map);
  const onMotion = () => { uniforms.uMotion.value = still() ? 0 : 1; if (ready && still()) snap(); redraw(); kick(); };
  motionQuery.addEventListener("change", onMotion);

  let pct = -1;
  function label() {
    const p = Math.round(target * 100);
    if (p === pct) return;
    pct = p;
    el.setAttribute("aria-label", `The van on the road from Toronto to Arlington, Texas: ${p}% of the trip funded.`);
  }
  label();

  return {
    el,
    // Dev measurement: landmark build times and what the last frame drew.
    get solo() { return soloApi; },
    stats() { const i = renderer?.info; return { ...STATS, triangles: i?.render.triangles ?? 0, lines: i?.render.lines ?? 0, calls: i?.render.calls ?? 0 }; },
    set(f) {
      target = clamp(+f || 0, 0, 1);
      label();
      if (!ready) return;                     // the first frame starts wherever the target is by then
      // Reduced motion jumps straight there; everything else drives.
      if (still()) snap();
      kick();
      redraw();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); nearIO.disconnect();
      motionQuery.removeEventListener("change", onMotion);
      el.remove();
      disposeLater = () => {
        disposeLater = null;
        if (fig) { holder.remove(fig.root); fig.surface.dispose(); fig.creaseMat.dispose(); }
        for (const o of owned) o.dispose();
        renderer?.dispose();
      };
      if (!compiling) disposeLater();
    },
  };
}
