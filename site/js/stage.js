// One shared WebGL renderer paints every part figure into its own 2D canvas, so the
// figures live in normal page flow (scroll, CSS transforms, overlays) and only repaint
// when something about them changes.
//
// Three looks, blended per figure:
// - drawing: the anatomy light theme. Paper-white solids shaded only by facing, ink
//   silhouettes from the smooth normals, ink creases on B-rep face boundaries.
// - hologram: cool translucent grey with a bright rim and fine scanlines, for parts that
//   have already been adopted.
// - real: the part's true materials under a white studio, faded in over the other looks.
import * as THREE from "../vendor/three.module.min.js";
import { MeshoptDecoder } from "../vendor/meshopt_decoder.mjs";

const INK_LIT = new THREE.Color("#000000");
const INK_HI = new THREE.Color("#26262a");
const INK_MID = new THREE.Color("#9a9aa0");
const SHADE_0 = new THREE.Color("#dcdcd9");
const PAPER = new THREE.Color("#ffffff");

// Real-look materials: colour (sRGB) and [metalness, roughness]; glow lights a part up.
export const MATERIALS = {
  "black-anodized": { color: "#202124", mr: [0.0, 0.34] },
  "black-plastic": { color: "#1a1a1c", mr: [0.0, 0.55] },
  "matte-black": { color: "#141416", mr: [0.0, 0.8] },
  "grey-plastic": { color: "#5a5c61", mr: [0.0, 0.6] },
  "silver-anodized": { color: "#c3c6cc", mr: [0.85, 0.3] },
  "steel": { color: "#b4b8be", mr: [0.95, 0.22] },
  "brass": { color: "#c9a34a", mr: [0.95, 0.3] },
  "gold": { color: "#d6aa3c", mr: [1.0, 0.25] },
  "copper": { color: "#c4743f", mr: [0.95, 0.3] },
  "pcb-green": { color: "#1f5b3a", mr: [0.0, 0.45] },
  "pcb-black": { color: "#18191b", mr: [0.0, 0.4] },
  "rubber": { color: "#151517", mr: [0.0, 0.9] },
  "white-plastic": { color: "#e8e8e4", mr: [0.0, 0.5] },
  "red-wire": { color: "#c8282d", mr: [0.0, 0.5] },
  "yellow-wire": { color: "#e2b33b", mr: [0.0, 0.5] },
  "orange-wire": { color: "#d9772b", mr: [0.0, 0.5] },
  "blue-led": { color: "#2f7bff", mr: [0.0, 0.3], glow: 1 },
  "red-led": { color: "#ff3b30", mr: [0.0, 0.3], glow: 1 },
  "fluoro": { color: "#d7ff3a", mr: [0.0, 0.35], glow: 1 },
};

// ------------------------------------------------------------------ loading
const cache = new Map();

export function loadPart(url) {
  if (!cache.has(url)) cache.set(url, fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.arrayBuffer();
  }).then(async (buf) => { await MeshoptDecoder.ready; return decode(buf); }));
  return cache.get(url);
}

function decode(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== "RIFT") throw new Error("not a part file");
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  const base = 8 + hlen;
  const blob = (name) => header.blobs.find((b) => b.name === name);
  const src = (b) => new Uint8Array(buf, base + b.offset, b.bytes);

  const vb = blob("vertices");
  const n = vb.count;
  const raw = new Uint8Array(n * 12);
  MeshoptDecoder.decodeVertexBuffer(raw, n, 12, src(vb));
  const rdv = new DataView(raw.buffer);
  const position = new Float32Array(n * 3), normal = new Int8Array(n * 3), lit = new Uint8Array(n), mat = new Uint8Array(n);
  const [hx, hy, hz] = header.half;
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    position[i * 3] = (rdv.getUint16(o, true) / 65535 - 0.5) * 2 * hx;
    position[i * 3 + 1] = (rdv.getUint16(o + 2, true) / 65535 - 0.5) * 2 * hy;
    position[i * 3 + 2] = (rdv.getUint16(o + 4, true) / 65535 - 0.5) * 2 * hz;
    normal[i * 3] = rdv.getInt8(o + 6); normal[i * 3 + 1] = rdv.getInt8(o + 7); normal[i * 3 + 2] = rdv.getInt8(o + 8);
    mat[i] = raw[o + 10]; lit[i] = raw[o + 11];
  }
  const ib = blob("indices");
  const index = new Uint32Array(ib.count);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer), ib.count, 4, src(ib));
  const seq = (name) => {
    const b = blob(name); if (!b) return new Uint32Array(0);
    const out = new Uint32Array(b.count);
    MeshoptDecoder.decodeIndexSequence(new Uint8Array(out.buffer), b.count, 4, src(b));
    return out;
  };
  const groups = header.groups.map((g) => ({ ...g, creases: seq(`crease:${g.name}`) }));
  return { header, position, normal, lit, mat, index, groups, ...opticalCentre(position, index) };
}

// The optical centre: the surface-area-weighted centroid. A thin lead dangling off a
// motor has little area, so it barely moves the centre; the body sits in the middle.
// The area-weighted covariance gives the part's visual size and its shadow.
function opticalCentre(P, I) {
  const tris = [];
  let at = 0, cx = 0, cy = 0, cz = 0, ylo = Infinity, yhi = -Infinity;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const mx = (P[a] + P[b] + P[c]) / 3, my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    tris.push(area, mx, my, mz);
    at += area; cx += area * mx; cy += area * my; cz += area * mz;
    ylo = Math.min(ylo, my); yhi = Math.max(yhi, my);
  }
  if (!at) return { centre: [0, 0, 0], spread: [1, 1], cov: [1, 0, 0, 1, 0, 1], area: 0, yRange: [-1, 1] };
  cx /= at; cy /= at; cz /= at;
  const C = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (let i = 0; i < tris.length; i += 4) {
    const w = tris[i], dx = tris[i + 1] - cx, dy = tris[i + 2] - cy, dz = tris[i + 3] - cz;
    C[0] += w * dx * dx; C[1] += w * dx * dy; C[2] += w * dx * dz; C[3] += w * dy * dy; C[4] += w * dy * dz; C[5] += w * dz * dz;
  }
  const cov = C.map((v) => v / at);
  return { centre: [cx, cy, cz], spread: [Math.sqrt(cov[0] + cov[5]), Math.sqrt(cov[3])], cov, area: at, yRange: [ylo - cy, yhi - cy] };
}

// ------------------------------------------------------------------ shaders
const VARYINGS = /* glsl */ `varying vec3 vN; varying float vLit; varying float vMat;`;
const UNIFORMS = /* glsl */ `
  uniform vec3 uView; uniform vec3 uKey; uniform vec3 uPaper; uniform vec3 uShade;
  uniform vec3 uInk; uniform vec3 uLit; uniform float uLineW;
  uniform float uHolo; uniform float uColor;
  uniform vec3 uPal[32]; uniform vec3 uPar[32];`;
const SURFACE_VS = /* glsl */ `
  attribute float aLit; attribute float aMat;
  ${VARYINGS}
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vLit = aLit; vMat = aMat;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
const SURFACE_FS = /* glsl */ `
  ${UNIFORMS}
  ${VARYINGS}
  float strip(float az, float c, float w) { float d = mod(az - c + 3.14159265, 6.2831853) - 3.14159265; return exp(-d * d / (w * w)); }
  // White cyclorama with black flags: metals read bright with a few dark bands.
  vec3 env(vec3 r, float rough) {
    float az = atan(r.z, r.x);
    float band = smoothstep(-0.5, -0.05, r.y) * (1.0 - smoothstep(0.55, 0.95, r.y));
    float e = 1.0 - 0.82 * strip(az, 2.55, 0.34) * band - 0.62 * strip(az, -1.35, 0.22) * band - 0.5 * strip(az, -2.4, 0.18) * band
      - 0.35 * exp(-pow((r.y + 0.08) / 0.07, 2.0)) - 0.3 * smoothstep(-0.05, -0.7, r.y);
    return vec3(mix(e, 0.82, rough * 0.7));
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(uView);
    // Silhouette from the smooth normal: a line of constant pixel width wherever the
    // surface turns edge-on, independent of how it was faceted.
    float fv = dot(n, V);
    float fw = fwidth(fv);
    float contour = fw > 1e-6 ? 1.0 - smoothstep(fw * 0.45 * uLineW, fw * uLineW, abs(fv)) : 0.0;
    if (!gl_FrontFacing) n = -n;
    vec3 L = normalize(uKey);
    float k = smoothstep(0.08, 0.92, clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0));
    float ndv = max(dot(n, V), 0.0);

    // Drawing: paper solids shaded only by facing.
    vec3 drawing = mix(uShade, uPaper, k);
    vec3 drawInk = mix(uInk, uLit, vLit);
    // Hologram: cool grey glass, a bright rim, fine scanlines.
    float rim = pow(1.0 - ndv, 2.2);
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.0943951);
    vec3 holo = mix(vec3(0.50, 0.57, 0.65), vec3(0.80, 0.85, 0.90), k);
    holo += vec3(0.26, 0.33, 0.42) * rim;
    holo *= 1.0 - 0.09 * scan;
    vec3 holoInk = vec3(0.30, 0.37, 0.47);
    vec3 base = mix(drawing, holo, uHolo);
    vec3 baseInk = mix(drawInk, holoInk, uHolo);

    // Real: palette colour, metal/rough, white studio.
    int mi = int(vMat + 0.5);
    vec3 col0 = uPal[mi]; vec3 par = uPar[mi];
    float metal = par.x, rough = par.y, glow = par.z;
    vec3 R = reflect(-V, n);
    vec3 e = env(R, rough);
    float F0 = mix(0.045, 1.0, metal);
    float fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    float diff = max(dot(n, L), 0.0);
    vec3 diffuse = col0 * (1.0 - metal) * (0.32 + 0.78 * diff + 0.18 * n.y);
    vec3 tint = mix(vec3(1.0), col0, metal);
    vec3 refl = e * tint * fres * mix(1.0, 0.55, rough) * mix(0.5, 1.0, metal);
    float hl = pow(max(dot(n, normalize(L + V)), 0.0), mix(220.0, 10.0, rough)) * mix(1.1, 0.12, rough);
    vec3 real = diffuse + refl + tint * hl + col0 * glow * 0.9;
    real = real / (1.0 + 0.12 * real);
    vec3 realInk = mix(col0 * 0.35, vec3(0.04), 0.6);

    vec3 col = mix(base, real, uColor);
    col = mix(col, mix(baseInk, realInk, uColor), contour);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const LINE_VS = /* glsl */ `
  attribute float aLit; attribute float aMat;
  ${VARYINGS}
  void main() { vLit = aLit; vMat = aMat; vN = vec3(0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINE_FS = /* glsl */ `
  ${UNIFORMS}
  ${VARYINGS}
  void main() {
    vec3 drawInk = mix(uInk, uLit, vLit);
    vec3 holoInk = vec3(0.42, 0.49, 0.59);
    vec3 col0 = uPal[int(vMat + 0.5)];
    vec3 realInk = mix(col0 * 0.35, vec3(0.04), 0.6);
    vec3 col = mix(mix(drawInk, holoInk, uHolo), realInk, uColor);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ part model
const built = new WeakMap();

function geometryFor(data) {
  if (built.has(data)) return built.get(data);
  const { position, normal, lit, mat, index, groups } = data;
  const posAttr = new THREE.BufferAttribute(position, 3);
  const nrmAttr = new THREE.BufferAttribute(normal, 3, true);
  const litAttr = new THREE.BufferAttribute(new Float32Array(lit), 1);
  const matAttr = new THREE.BufferAttribute(new Float32Array(mat), 1);
  const out = groups.map((g) => {
    const surf = new THREE.BufferGeometry();
    surf.setAttribute("position", posAttr); surf.setAttribute("normal", nrmAttr);
    surf.setAttribute("aLit", litAttr); surf.setAttribute("aMat", matAttr);
    surf.setIndex(new THREE.BufferAttribute(index.subarray(g.triStart * 3, (g.triStart + g.triCount) * 3), 1));
    const cn = g.creases.length;
    const cp = new Float32Array(cn * 3), cl = new Float32Array(cn), cm = new Float32Array(cn);
    for (let i = 0; i < cn; i++) { const v = g.creases[i]; cp.set(position.subarray(v * 3, v * 3 + 3), i * 3); cl[i] = lit[v]; cm[i] = mat[v]; }
    const crease = new THREE.BufferGeometry();
    crease.setAttribute("position", new THREE.BufferAttribute(cp, 3));
    crease.setAttribute("aLit", new THREE.BufferAttribute(cl, 1));
    crease.setAttribute("aMat", new THREE.BufferAttribute(cm, 1));
    return { meta: g, surf, crease };
  });
  built.set(data, out);
  return out;
}

function palette(header) {
  const materials = { ...MATERIALS, ...(header.customMaterials ?? {}) };
  const pal = [], par = [];
  for (let i = 0; i < 32; i++) {
    const p = header.palette?.[i], m = materials[header.materials?.[i]];
    if (!p) { pal.push(new THREE.Color(0.55, 0.55, 0.55)); par.push(new THREE.Vector3(0, 0.6, 0)); continue; }
    pal.push(m ? new THREE.Color(m.color) : new THREE.Color().setRGB(p[0] / 255, p[1] / 255, p[2] / 255, THREE.SRGBColorSpace));
    par.push(new THREE.Vector3(m?.mr[0] ?? 0.1, m?.mr[1] ?? 0.55, m?.glow ?? 0));
  }
  return { pal, par };
}

export class Figure {
  // A posed instance of a part. `root` turns about the vertical through the optical
  // centre; moving groups (a motor's shaft) turn about their own axes.
  constructor(data) {
    this.data = data;
    this.root = new THREE.Group();
    const body = new THREE.Group();
    const [cx, cy, cz] = data.centre;
    body.position.set(-cx, -cy, -cz);
    this.root.add(body);
    const { pal, par } = palette(data.header);
    const u = this.uniforms = {
      uView: { value: new THREE.Vector3(1, 1, 1) }, uKey: { value: new THREE.Vector3(-0.35, 0.85, 0.4) },
      uPaper: { value: PAPER }, uShade: { value: SHADE_0 }, uInk: { value: INK_HI }, uLit: { value: INK_LIT },
      uLineW: { value: 1.6 }, uHolo: { value: 0 }, uColor: { value: 0 },
      uPal: { value: pal }, uPar: { value: par },
    };
    this.surface = new THREE.ShaderMaterial({ vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS, uniforms: u,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.creaseMat = new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { ...u, uInk: { value: INK_MID } } });
    this.spins = [];
    for (const g of geometryFor(data)) {
      const node = new THREE.Group(), inner = new THREE.Group();
      const c = g.meta.center ?? [0, 0, 0];
      node.position.set(c[0], c[1], c[2]); inner.position.set(-c[0], -c[1], -c[2]);
      inner.add(new THREE.Mesh(g.surf, this.surface));
      if (g.crease.attributes.position.count) inner.add(new THREE.LineSegments(g.crease, this.creaseMat));
      node.add(inner); body.add(node);
      if (g.meta.spin) {
        const ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[g.meta.spin.axis] ?? g.meta.spin.axis;
        this.spins.push({ node, axis: new THREE.Vector3(...ax).normalize(), rpm: g.meta.spin.rpm ?? 30, angle: 0 });
      }
    }
  }
  setView(dir) { this.uniforms.uView.value.copy(dir); }
  // 0 = paper drawing, 1 = adopted hologram.
  set holo(v) { this.uniforms.uHolo.value = v; }
  // How much of the real colour shows, 0..1.
  set color(v) { this.uniforms.uColor.value = v; }
  // Advance moving groups; `speed` 0..1 scales every spin (eased by the caller).
  tick(dt, speed) {
    for (const s of this.spins) {
      s.angle += (s.rpm / 60) * Math.PI * 2 * dt * speed;
      s.node.quaternion.setFromAxisAngle(s.axis, s.angle);
    }
    return this.spins.length > 0;
  }
}

// A bundle: several parts standing side by side on one floor across the camera's view,
// the largest in the middle and set slightly back. Sizes are pulled toward each other
// (square-root compression of how big each looks to the camera), so a 17 mm ball doesn't
// vanish next to a van but still reads smaller than it. It turns as one, like a still
// life on a turntable.
export class Group {
  constructor(datas, { azimuth = 45 } = {}) {
    this.figures = datas.map((d) => new Figure(d));
    this.root = new THREE.Group();
    const az = THREE.MathUtils.degToRad(azimuth);
    const R = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), D = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const el = THREE.MathUtils.degToRad(30);
    const U = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)];
    const radius = (f) => projectedRadius(f.data.cov, [R.x, R.y, R.z], U);
    const target = Math.max(...this.figures.map(radius));
    const sized = this.figures.map((f) => {
      const k = Math.sqrt(target / radius(f));
      return { f, k, r: Math.sqrt(f.data.cov[0] + f.data.cov[5]) * k };
    }).sort((a, b) => radius(b.f) - radius(a.f));
    const order = [];
    sized.forEach((s, i) => (i % 2 ? order.push(s) : order.unshift(s)));
    let x = 0;
    const place = [];
    order.forEach((s, i) => {
      const half = 1.55 * s.r;
      if (i) x += half;
      place.push({ ...s, x, back: s === sized[0] && order.length > 1 ? 0.35 * s.r : 0 });
      x += half + 0.18 * s.r;
    });
    const mid = (place[0].x + place.at(-1).x) / 2;
    // Floor: every part's lowest point on y = 0.
    let area = 0; const C = new THREE.Vector3(); const pts = [];
    for (const p of place) {
      const pos = R.clone().multiplyScalar(p.x - mid).addScaledVector(D, -p.back);
      pos.y = -p.f.data.yRange[0] * p.k;
      p.f.root.position.copy(pos);
      p.f.root.scale.setScalar(p.k);
      this.root.add(p.f.root);
      const a = p.f.data.area * p.k * p.k;
      area += a; C.addScaledVector(pos, a);
      pts.push({ ...p, a });
    }
    C.divideScalar(area || 1);
    for (const p of pts) p.f.root.position.sub(C);
    // Combined statistics (parallel-axis) for sizing and the shadow.
    const cov = [0, 0, 0, 0, 0, 0];
    let ylo = Infinity, yhi = -Infinity;
    const pos = [];
    for (const p of pts) {
      const o = p.f.root.position, w = p.a / (area || 1), k2 = p.k * p.k, c = p.f.data.cov;
      cov[0] += w * (k2 * c[0] + o.x * o.x); cov[1] += w * (k2 * c[1] + o.x * o.y); cov[2] += w * (k2 * c[2] + o.x * o.z);
      cov[3] += w * (k2 * c[3] + o.y * o.y); cov[4] += w * (k2 * c[4] + o.y * o.z); cov[5] += w * (k2 * c[5] + o.z * o.z);
      const P = p.f.data.position, [cx, cy, cz] = p.f.data.centre, n = P.length / 3, stride = Math.max(1, Math.floor(n / 1500));
      for (let i = 0; i < n; i += stride) pos.push((P[i * 3] - cx) * p.k + o.x, (P[i * 3 + 1] - cy) * p.k + o.y, (P[i * 3 + 2] - cz) * p.k + o.z);
      ylo = Math.min(ylo, p.f.data.yRange[0] * p.k + o.y); yhi = Math.max(yhi, p.f.data.yRange[1] * p.k + o.y);
    }
    this.data = { position: new Float32Array(pos), centre: [0, 0, 0], cov, area, yRange: [ylo, yhi],
      spread: [Math.sqrt(cov[0] + cov[5]), Math.sqrt(cov[3])] };
  }
  setView(dir) { for (const f of this.figures) f.setView(dir); }
  set holo(v) { for (const f of this.figures) f.holo = v; }
  set color(v) { for (const f of this.figures) f.color = v; }
  tick(dt, speed) { let any = false; for (const f of this.figures) any = f.tick(dt, speed) || any; return any; }
}

// RMS radius of a surface (area-weighted covariance) as seen along screen axes R and U.
function projectedRadius([xx, xy, xz, yy, yz, zz], R, U) {
  const q = (v) => v[0] * v[0] * xx + v[1] * v[1] * yy + v[2] * v[2] * zz + 2 * (v[0] * v[1] * xy + v[0] * v[2] * xz + v[1] * v[2] * yz);
  return Math.sqrt(q(R) + q(U));
}

// ------------------------------------------------------------------ stage
class StageImpl {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.w = 0; this.h = 0;
    this.scene = new THREE.Scene();
  }
  ensure(w, h) {
    if (w <= this.w && h <= this.h) return;
    this.w = Math.max(this.w, Math.ceil(w / 128) * 128); this.h = Math.max(this.h, Math.ceil(h / 128) * 128);
    this.renderer.setSize(this.w, this.h, false);
  }
  paint(view) {
    const { canvas, ctx } = view;
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    this.ensure(w, h);
    const r = this.renderer;
    r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
    r.clear();
    this.scene.add(view.figure.root);
    r.render(this.scene, view.camera);
    this.scene.remove(view.figure.root);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.canvas, 0, this.h - h, w, h, 0, 0, w, h);
  }
}
let stage = null;
export const getStage = () => (stage ??= new StageImpl());

// ------------------------------------------------------------------ view
// The anatomy camera: orthographic, azimuth 45°, elevation 30°, looking at the optical
// centre. Scale is either optical (`visual`: the part's area-weighted spread as seen by
// the camera takes this fraction of the canvas width, so every part reads about the same
// size and a thin cable doesn't shrink its body; whatever runs past the box is the page's
// to fade), shared (`span`: millimetres across the canvas width, backing off so nothing
// clips), or fitted to the part's full extent (`fill`).
export class View {
  constructor(canvas, figure, opts = {}) {
    // Every figure uses the same camera, so every part faces the same way; parts are posed
    // in their configs, never by moving the camera.
    const o = { azimuth: 45, elevation: 30, fill: 0.7, span: null, visual: null, dpr: Math.min(2, devicePixelRatio || 1), ...opts };
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.figure = figure; this.azimuth = o.azimuth; this.elevation = o.elevation;
    this.fill = o.fill; this.span = o.span; this.visual = o.visual; this.dpr = o.dpr;
    this.spin = 0; this.zoom = 1;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    this.extent = this.measure();
    this.resize();
  }
  measure() {
    // Largest projected half-width/height about the optical centre over a full turn.
    const P = this.figure.data.position, [cx, cy, cz] = this.figure.data.centre;
    const n = P.length / 3, stride = Math.max(1, Math.floor(n / 4000));
    const el = THREE.MathUtils.degToRad(this.elevation);
    let hw = 0, hh = 0, low = 0;
    for (let a = 0; a < 360; a += 10) {
      const r = THREE.MathUtils.degToRad(a), c = Math.cos(r), s = Math.sin(r);
      for (let i = 0; i < n; i += stride) {
        const x = P[i * 3] - cx, y = P[i * 3 + 1] - cy, z = P[i * 3 + 2] - cz;
        const xr = x * c + z * s, zr = -x * s + z * c;
        const sy = y * Math.cos(el) + zr * Math.sin(el);
        hw = Math.max(hw, Math.abs(xr)); hh = Math.max(hh, Math.abs(sy)); low = Math.min(low, sy);
      }
    }
    return { hw, hh, low };
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * this.dpr)), h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const aspect = w / h;
    const fit = Math.max(this.extent.hw, this.extent.hh * aspect) / 0.94;
    const halfW = this.visual ? this.radius() / (2 * this.visual)
      : this.span ? Math.max(this.span / 2, fit)
      : Math.max(this.extent.hw, this.extent.hh * aspect) / this.fill;
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfW / aspect; this.camera.bottom = -halfW / aspect;
    this.camera.updateProjectionMatrix();
  }
  // RMS radius of the part's surface as projected on the screen at rest (mm).
  radius() {
    const az = THREE.MathUtils.degToRad(this.azimuth), el = THREE.MathUtils.degToRad(this.elevation);
    return projectedRadius(this.figure.data.cov, [Math.cos(az), 0, -Math.sin(az)], [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)]);
  }
  // Shadow placement from the area-weighted spread, so a dangling lead doesn't stretch
  // it: where the body's underside sits (fraction of canvas height from the top) and how
  // wide its footprint reads (fraction of canvas width).
  get floor() {
    const [rh, ry] = this.figure.data.spread, el = THREE.MathUtils.degToRad(this.elevation);
    return 0.5 + (1.6 * ry * Math.cos(el) + 1.2 * rh * Math.sin(el)) / (this.camera.top - this.camera.bottom);
  }
  get width() { return (2.6 * this.figure.data.spread[0]) / (this.camera.right - this.camera.left); }
  pose() {
    const az = THREE.MathUtils.degToRad(this.azimuth), el = THREE.MathUtils.degToRad(this.elevation);
    this.camera.position.set(Math.sin(az) * Math.cos(el) * 1000, Math.sin(el) * 1000, Math.cos(az) * Math.cos(el) * 1000);
    this.camera.lookAt(0, 0, 0);
    if (this.camera.zoom !== this.zoom) { this.camera.zoom = this.zoom; this.camera.updateProjectionMatrix(); }
    this.figure.root.rotation.set(0, THREE.MathUtils.degToRad(this.spin), 0);
    this.figure.setView(this.camera.position.clone().normalize());
  }
  paint() { this.pose(); getStage().paint(this); }
}
