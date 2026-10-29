// The welcome signs at either end of the drive, each in its own place's style, pared down to the
// name and drawn larger than life so they read at the strip's size:
// - Toronto: the frame of the city-limit sign on the 401 and 427 (Wikimedia Commons, "Toronto
//   Welcome Sign along 401, June 16 2025"): a white-bordered panel over a white band, the city's
//   logo beside the name. Here the logo is the CN Tower, and the panel takes the University of
//   Toronto's navy and serif capitals.
// - Texas: TxDOT's state-line sign ("Welcome to Texas sign Texarkana TX 2013"): white script on
//   green, the Texas flag waving on a gold staff.
// The panels and posts are solids like any landmark; each face is a textured quad that shares the
// strip's reveal, drawn in ink on plaster until the colour arrives.
import * as THREE from "../../vendor/three.module.min.js";

const PAD = 6, CLEAR = 2.0, DEPTH = 0.08;          // texels round each tile; metres from ground to panel, panel thickness
const NAVY = "#1e3765", GREEN = "#0f6a48", INK = "#4a4a50";

// Fit a line of text into `maxW` texels, starting from `size`.
function fitFont(ctx, text, font, size, maxW) {
  for (; size > 8; size -= 1) { ctx.font = font(size); if (ctx.measureText(text).width <= maxW) break; }
  return size;
}
function line(ctx, text, font, size, maxW, x, y, align = "center", spacing = 0) {
  ctx.letterSpacing = `${spacing}px`;
  fitFont(ctx, text, font, size, maxW);
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
const SANS = (s) => `bold ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
const SERIF = (s) => `600 ${s}px "Trajan Pro", Georgia, "Times New Roman", serif`;
const SCRIPT = (s) => `italic bold ${s}px Georgia, "Times New Roman", serif`;

// The CN Tower in silhouette: the tapering shaft, the main pod and its decks, the SkyPod and the
// antenna, at their heights on the real tower (pod 342 m, SkyPod 447 m of 553 m). x: centre, y: base.
function cnTower(ctx, x, y, H) {
  const top = y - H, pod = y - H * 0.62, sky = y - H * 0.808;
  ctx.beginPath();
  ctx.moveTo(x - H * 0.055, y); ctx.lineTo(x - H * 0.016, pod + H * 0.03); ctx.lineTo(x - H * 0.012, sky); ctx.lineTo(x - H * 0.004, sky - H * 0.02);
  ctx.lineTo(x - H * 0.003, top); ctx.lineTo(x + H * 0.003, top); ctx.lineTo(x + H * 0.004, sky - H * 0.02);
  ctx.lineTo(x + H * 0.012, sky); ctx.lineTo(x + H * 0.016, pod + H * 0.03); ctx.lineTo(x + H * 0.055, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, pod, H * 0.062, H * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - H * 0.045, pod - H * 0.05, H * 0.09, H * 0.03);
  ctx.beginPath(); ctx.ellipse(x, sky, H * 0.022, H * 0.011, 0, 0, Math.PI * 2); ctx.fill();
}

// Each face is drawn twice: in colour, and as ink on white for the plaster state.
function toronto(ctx, ink, w, h) {
  const fg = ink ? INK : "#ffffff";
  ctx.fillStyle = ink ? "#ffffff" : NAVY; ctx.fillRect(-PAD, -PAD, w + 2 * PAD, h + 2 * PAD);
  ctx.strokeStyle = fg; ctx.lineWidth = 5;
  roundRect(ctx, 9, 9, w - 18, h - 18, 18); ctx.stroke();
  ctx.fillStyle = fg; ctx.textBaseline = "alphabetic";
  cnTower(ctx, 92, 196, 168);
  line(ctx, "UNIVERSITY OF", SERIF, 40, 400, 168, 92, "left", 6);
  line(ctx, "TORONTO", SERIF, 96, 440, 164, 182, "left", 4);
  // The white band, lettered in the panel's colour.
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 26, 212, w - 52, h - 238, 9);
  if (ink) { ctx.lineWidth = 3; ctx.stroke(); } else ctx.fill();
  ctx.fillStyle = ink ? INK : NAVY;
  line(ctx, "WELCOME", SANS, 36, 400, w / 2, h - 40, "center", 9);
}

function texas(ctx, ink, w, h) {
  const fg = ink ? INK : "#ffffff";
  ctx.fillStyle = ink ? "#ffffff" : GREEN; ctx.fillRect(-PAD, -PAD, w + 2 * PAD, h + 2 * PAD);
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

// Each face: how it is drawn, its tile in the atlas (texels) and its panel (metres).
const FACES = [
  { draw: toronto, tile: [640, 300], panel: [6.4, 3.0] },
  { draw: texas, tile: [512, 320], panel: [5.6, 3.5] },
];

// One canvas: the faces side by side, colour in the top half and ink in the bottom half.
function atlas() {
  const rowH = Math.max(...FACES.map((f) => f.tile[1])) + 2 * PAD;
  const canvas = document.createElement("canvas");
  canvas.width = FACES.reduce((a, f) => a + f.tile[0] + 2 * PAD, 0); canvas.height = rowH * 2;
  const ctx = canvas.getContext("2d");
  let x = 0;
  const uv = FACES.map(({ draw, tile: [w, h] }) => {
    for (const ink of [false, true]) {
      ctx.save();
      ctx.translate(x + PAD, (ink ? rowH : 0) + PAD);
      ctx.beginPath(); ctx.rect(-PAD, -PAD, w + 2 * PAD, h + 2 * PAD); ctx.clip();
      draw(ctx, ink, w, h);
      ctx.restore();
    }
    // The UV box of the colour tile (its ink tile is half the atlas below it).
    const box = { u0: (x + PAD) / canvas.width, u1: (x + PAD + w) / canvas.width, v0: 1 - (PAD + h) / canvas.height, v1: 1 - PAD / canvas.height };
    x += w + 2 * PAD;
    return box;
  });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { map, uv };
}

// Where each sign stands, by its offset from the route's start or end (metres along it) and
// side (u > 0 is the near side, toward the camera). Turn: radians the face is turned from
// square to the near side, toward the way the resting camera looks (it sits on the near side,
// square-on at the start and 30° ahead of the van at the end). Scale: the parked shot is wider,
// so the Texas sign is drawn larger to read at the same size.
const PLACES = [
  { face: 0, at: (R) => R.s0 + 12, side: -1, turn: -0.12, scale: 1.4 },  // the far shoulder, just past where the van sets off
  { face: 1, at: (R) => R.s1 - 23, side: 1, turn: 0.85, scale: 1.35 },   // the near verge just before the parking spot
];

// Posts and panels go into the landmark solids through `k`; returns the faces' mesh data.
export function buildSigns(k, R, T, half) {
  const { site, add, box, put } = k;
  const { map, uv: uvs } = atlas();
  const P = [], N = [], UV = [], AS = [], AH = [], AD = [];
  const opening = [];   // the start sign's panel corners, for the opening shot's framing
  for (const p of PLACES) {
    const [pw, ph] = FACES[p.face].panel;
    const st = site(p.at(R), p.side * (half + 2.4 * p.scale));
    if (p.face === 0) for (const [x, y] of [[-pw / 2, CLEAR + ph], [pw / 2, CLEAR + ph], [-pw / 2, 0], [pw / 2, 0]]) {
      const c = Math.cos(st.yaw), sn = Math.sin(st.yaw), gx = x * p.scale, gy = T.heightAt(st.x, st.z) + y * p.scale;
      opening.push(new THREE.Vector3(st.x + gx * c, gy, st.z + gx * sn));
    }
    const turn = (g) => g.scale(p.scale, p.scale, p.scale).rotateY(p.turn);
    // Two galvanised posts up to the panel's foot (any higher, their outlines show through the
    // face), and the panel's aluminium back.
    for (const x of [-pw * 0.3, pw * 0.3]) add(turn(box(0.15, CLEAR + 0.06, 0.15, x, 0, -0.1)), st, "#9ea4a8", { jitter: 0.02, edge: 40 });
    add(turn(box(pw, ph, DEPTH, 0, CLEAR, -0.02)), st, "#b4b9bd", { jitter: 0.01, edge: 40 });
    put(st, (pw / 2 + 0.6) * p.scale, (CLEAR + ph) * p.scale, true);   // trees keep clear; the camera may look past it
    // The face, just proud of the panel, set down the same way `add` sets a part.
    const g = turn(new THREE.PlaneGeometry(pw, ph).translate(0, CLEAR + ph / 2, DEPTH / 2 + 0.005)).toNonIndexed();
    g.rotateY(-st.yaw).translate(st.x, T.heightAt(st.x, st.z), st.z);
    // Each corner takes its own place on the route, so the colour crosses the face with the land
    // under it rather than flipping all at once.
    const { u0, u1, v0, v1 } = uvs[p.face], pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
    for (let i = 0; i < pos.length / 3; i++) {
      const nr = R.near(pos[i * 3], pos[i * 3 + 2]);
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
  return { geo, map, opening };
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
    // Soaks in like the land does, in pools across the face (in texels of the atlas, about metres).
    vec2 sk = soak(t, vUv * vec2(26.0, 16.0), 1.0);
    float g = sk.x;
    // Retroreflective sheeting: bright from any angle, a little brighter facing the light.
    vec3 c = mix(draw, face * (0.86 + 0.2 * max(dl, 0.0)) * (1.0 - 0.2 * sk.y), g);
    c = holo(c, rimAt(p, vW) * 0.25 * (1.0 - g));
    gl_FragColor = vec4(haze(c, vW), 1.0);
    #include <colorspace_fragment>
  }`;
