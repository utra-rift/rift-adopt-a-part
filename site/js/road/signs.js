// The welcome signs at either end of the drive, each in its own place's style, pared down to the
// name and drawn larger than life so they read at the strip's size:
// - Toronto: the blue city-limit sign on the 401 and 427 (Wikimedia Commons, "Toronto Welcome
//   Sign along 401, June 16 2025"): the white name on blue, over a white band lettered in blue.
// - Texas: TxDOT's state-line sign ("Welcome to Texas sign Texarkana TX 2013"): white script on
//   green, the Texas flag waving on a gold staff.
// The panels and posts are solids like any landmark; each face is a textured quad that shares the
// strip's reveal, drawn in ink on plaster until the colour arrives.
import * as THREE from "../../vendor/three.module.min.js";

const PANEL = { w: 5.6, h: 3.5, clear: 2.0, depth: 0.08 };   // metres; clear: ground to the panel's foot
const TILE = { w: 512, h: 320, pad: 6 };                      // texels per face; the atlas is 2 × 2 tiles
const BLUE = "#1e5aa8", GREEN = "#0f6a48", INK = "#4a4a50";

// Fit a line of text into `maxW` texels, starting from `size`.
function fitFont(ctx, text, font, size, maxW) {
  for (; size > 8; size -= 1) { ctx.font = font(size); if (ctx.measureText(text).width <= maxW) break; }
  return size;
}
function line(ctx, text, font, size, maxW, x, y, align = "center") {
  fitFont(ctx, text, font, size, maxW);
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
const SANS = (s) => `bold ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
const SCRIPT = (s) => `italic bold ${s}px Georgia, "Times New Roman", serif`;

// Each face is drawn twice: in colour, and as ink on white for the plaster state.
function toronto(ctx, ink) {
  const { w, h } = TILE, fg = ink ? INK : "#ffffff";
  ctx.fillStyle = ink ? "#ffffff" : BLUE; ctx.fillRect(-TILE.pad, -TILE.pad, w + 2 * TILE.pad, h + 2 * TILE.pad);
  ctx.strokeStyle = fg; ctx.lineWidth = 5;
  roundRect(ctx, 9, 9, w - 18, h - 18, 16); ctx.stroke();
  ctx.fillStyle = fg; ctx.textBaseline = "alphabetic";
  line(ctx, "University of", SANS, 52, w - 90, w / 2, 74);
  line(ctx, "Toronto", SANS, 104, w - 70, w / 2, 168);
  // The white band, lettered in blue.
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 24, 196, w - 48, h - 220, 8);
  if (ink) { ctx.lineWidth = 3; ctx.stroke(); } else ctx.fill();
  ctx.fillStyle = ink ? INK : BLUE;
  line(ctx, "Welcome", SANS, 64, w - 120, w / 2, 272);
}

function texas(ctx, ink) {
  const { w, h } = TILE, fg = ink ? INK : "#ffffff";
  ctx.fillStyle = ink ? "#ffffff" : GREEN; ctx.fillRect(-TILE.pad, -TILE.pad, w + 2 * TILE.pad, h + 2 * TILE.pad);
  ctx.strokeStyle = fg; ctx.lineWidth = 5;
  roundRect(ctx, 9, 9, w - 18, h - 18, 16); ctx.stroke();
  ctx.fillStyle = fg; ctx.textBaseline = "alphabetic";
  line(ctx, "Welcome to", SCRIPT, 44, w - 140, w / 2, 60);
  line(ctx, "UT Arlington", SCRIPT, 84, w - 50, w / 2, 140);
  // The flag, waving from a gold staff that leans a little, drawn in thin vertical slices.
  const fx = 206, fy = 168, fw = 150, fh = 98;
  const wave = (u) => Math.sin(u * Math.PI * 1.6 + 0.3) * 9 * u;          // the fly end ripples most
  const shade = (u) => 1 - 0.18 * Math.max(0, Math.cos(u * Math.PI * 1.6 + 0.3)) * u;
  const BL = [0, 40, 104], RD = [191, 10, 48], WH = [255, 255, 255];
  const rgb = ([r, g, b], k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  const N = 87;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, x = fx + u0 * fw, dy = wave(u0), k = shade(u0);
    const sw = fw / N + 0.7;
    if (ink) continue;
    if (u0 < 1 / 3) { ctx.fillStyle = rgb(BL, k); ctx.fillRect(x, fy + dy, sw, fh); }
    else {
      ctx.fillStyle = rgb(WH, 0.9 + 0.1 * k); ctx.fillRect(x, fy + dy, sw, fh / 2);
      ctx.fillStyle = rgb(RD, k); ctx.fillRect(x, fy + dy + fh / 2, sw, fh / 2);
    }
  }
  // Outline (the whole flag in ink; just its edge in colour) and the star on the hoist.
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const u = i / N; ctx.lineTo(fx + u * fw, fy + wave(u)); }
  for (let i = N; i >= 0; i--) { const u = i / N; ctx.lineTo(fx + u * fw, fy + fh + wave(u)); }
  ctx.closePath();
  ctx.lineWidth = ink ? 3 : 1.5; ctx.strokeStyle = ink ? INK : "rgba(0,0,0,0.25)"; ctx.stroke();
  if (ink) {
    ctx.beginPath(); ctx.moveTo(fx + fw / 3, fy + wave(1 / 3)); ctx.lineTo(fx + fw / 3, fy + fh + wave(1 / 3));
    for (let i = Math.round(N / 3); i <= N; i++) { const u = i / N; ctx[i === Math.round(N / 3) ? "moveTo" : "lineTo"](fx + u * fw, fy + fh / 2 + wave(u)); }
    ctx.stroke();
  }
  const sx = fx + fw / 6, sy = fy + fh / 2 + wave(1 / 6), R = fh * 0.2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.382 : R;
    ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.closePath();
  if (ink) ctx.stroke(); else { ctx.fillStyle = "#ffffff"; ctx.fill(); }
  ctx.strokeStyle = ink ? INK : "#e2b23a"; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(fx - 4, fy - 10); ctx.lineTo(fx - 12, fy + fh + 32); ctx.stroke();
}

// One canvas, 2 × 2 tiles: Toronto and Texas across, colour over ink.
function atlas() {
  const W = TILE.w + 2 * TILE.pad, H = TILE.h + 2 * TILE.pad;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  [[toronto, 0], [texas, 1]].forEach(([draw, col]) => [false, true].forEach((ink, row) => {
    ctx.save();
    ctx.translate(col * W + TILE.pad, row * H + TILE.pad);
    ctx.beginPath(); ctx.rect(-TILE.pad, -TILE.pad, W, H); ctx.clip();
    draw(ctx, ink);
    ctx.restore();
  }));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  // The UV box of a face's colour tile (the ink tile is half the atlas below it).
  const uvOf = (col) => ({ u0: (col * W + TILE.pad) / canvas.width, u1: (col * W + TILE.pad + TILE.w) / canvas.width, v0: 1 - (TILE.pad + TILE.h) / canvas.height, v1: 1 - TILE.pad / canvas.height });
  return { map, uvOf };
}

// Where each sign stands, by its offset from the route's start or end (metres along it) and
// side (u > 0 is the near side, toward the camera). Turn: radians the face is turned from
// square to the near side, toward the way the resting camera looks (it sits on the near side,
// square-on at the start and 30° ahead of the van at the end). Scale: the parked shot is wider,
// so the Texas sign is drawn larger to read at the same size.
const PLACES = [
  { col: 0, at: (R) => R.s0 - 10, side: -1, turn: -0.12, scale: 1.5 },   // the far shoulder in front of Convocation Hall's lawn
  { col: 1, at: (R) => R.s1 - 21, side: 1, turn: 0.42, scale: 1.9 },     // the near verge before the parking spot
];

// Posts and panels go into the landmark solids through `k`; returns the faces' mesh data.
export function buildSigns(k, R, T, half) {
  const { site, add, box, put } = k;
  const { map, uvOf } = atlas();
  const P = [], N = [], UV = [], AS = [], AH = [], AD = [];
  for (const p of PLACES) {
    const st = site(p.at(R), p.side * (half + 2.4 * p.scale));
    const turn = (g) => g.scale(p.scale, p.scale, p.scale).rotateY(p.turn);
    // Two galvanised posts behind the panel, and the panel's aluminium back.
    for (const x of [-PANEL.w * 0.3, PANEL.w * 0.3]) add(turn(box(0.15, PANEL.clear + PANEL.h - 0.25, 0.15, x, 0, -0.14)), st, "#9ea4a8", { jitter: 0.02, edge: 40 });
    add(turn(box(PANEL.w, PANEL.h, PANEL.depth, 0, PANEL.clear, -0.02)), st, "#b4b9bd", { jitter: 0.01, edge: 40 });
    put(st, (PANEL.w / 2 + 0.6) * p.scale, (PANEL.clear + PANEL.h) * p.scale);
    // The face, just proud of the panel, set down the same way `add` sets a part.
    const g = turn(new THREE.PlaneGeometry(PANEL.w, PANEL.h).translate(0, PANEL.clear + PANEL.h / 2, PANEL.depth / 2 + 0.005)).toNonIndexed();
    g.rotateY(-st.yaw).translate(st.x, T.heightAt(st.x, st.z), st.z);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), nr = R.near(c.x, c.z);
    const { u0, u1, v0, v1 } = uvOf(p.col), pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
    for (let i = 0; i < pos.length / 3; i++) {
      P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      N.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      UV.push(u0 + uv[i * 2] * (u1 - u0), v0 + uv[i * 2 + 1] * (v1 - v0));
      AS.push(nr.s); AH.push(pos[i * 3 + 1] - nr.y); AD.push(nr.d);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute("aS", new THREE.Float32BufferAttribute(AS, 1));
  geo.setAttribute("aH", new THREE.Float32BufferAttribute(AH, 1));
  geo.setAttribute("aD", new THREE.Float32BufferAttribute(AD, 1));
  return { geo, map };
}

export const SIGN_VS = /* glsl */ `
  attribute float aS; attribute float aH; attribute float aD;
  varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vS; varying float vH; varying float vD;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vS = aS; vH = aH; vD = aD;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

// `frag`: the strip's shared fragment prelude (reveal, haze, hologram rim).
export const signFS = (frag) => /* glsl */ `
  ${frag}
  uniform sampler2D uSign;
  varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vS; varying float vH; varying float vD;
  void main() {
    float dl = dot(normalize(vN), normalize(uKey));
    vec3 face = texture(uSign, vUv).rgb;
    float ink = 1.0 - texture(uSign, vUv - vec2(0.0, 0.5)).r;
    vec3 paper = mix(lin(vec3(0.84)), vec3(1.0), smoothstep(0.1, 0.95, dl * 0.5 + 0.5));
    vec3 draw = mix(paper, lin(vec3(0.48, 0.48, 0.52)), ink * 0.9);
    float p = frontP(vS, vH, vD, vW);
    float t = max(clamp(p / uFeather, 0.0, 1.0), baseAt(vS, vD, vW) * (1.0 - smoothstep(10.5, 14.5, vD)));
    float g = smoothstep(0.2, 0.7, t);
    // Retroreflective sheeting: bright from any angle, a little brighter facing the light.
    vec3 c = mix(draw, face * (0.86 + 0.2 * max(dl, 0.0)), g);
    c = holo(c, rimAt(p, vW) * 0.25 * (1.0 - g));
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;
