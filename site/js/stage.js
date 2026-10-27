// One shared WebGL renderer paints every part figure into its own 2D canvas, so the
// figures live in normal page flow (scroll, CSS transforms, overlays) and only repaint
// when something about them changes.
//
// The look is the anatomy light theme: paper-white solids shaded only by facing, ink
// silhouettes drawn from the smooth normals, ink creases on B-rep face boundaries, and
// one lit accent drawn in black.
import * as THREE from "../vendor/three.module.min.js";
import { MeshoptDecoder } from "../vendor/meshopt_decoder.mjs";

const INK_LIT = new THREE.Color("#000000");
const INK_HI = new THREE.Color("#26262a");
const INK_MID = new THREE.Color("#9a9aa0");
const SHADE_0 = new THREE.Color("#dcdcd9");
const PAPER = new THREE.Color("#ffffff");

// ------------------------------------------------------------------ loading
const cache = new Map();

export function loadPart(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => {
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
  const position = new Float32Array(n * 3), normal = new Int8Array(n * 3), lit = new Uint8Array(n);
  const [hx, hy, hz] = header.half;
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    position[i * 3] = (rdv.getUint16(o, true) / 65535 - 0.5) * 2 * hx;
    position[i * 3 + 1] = (rdv.getUint16(o + 2, true) / 65535 - 0.5) * 2 * hy;
    position[i * 3 + 2] = (rdv.getUint16(o + 4, true) / 65535 - 0.5) * 2 * hz;
    normal[i * 3] = rdv.getInt8(o + 6); normal[i * 3 + 1] = rdv.getInt8(o + 7); normal[i * 3 + 2] = rdv.getInt8(o + 8);
    lit[i] = raw[o + 11];
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
  return { header, position, normal, lit, index, groups, ...opticalCentre(position, index) };
}

// The optical centre: the surface-area-weighted centroid. A thin lead dangling off a
// motor has little area, so it barely moves the centre; the body sits in the middle.
// The area-weighted spread (radius of gyration) sizes the shadow the same way.
function opticalCentre(P, I) {
  const tris = [];
  let at = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const mx = (P[a] + P[b] + P[c]) / 3, my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    tris.push(area, mx, my, mz);
    at += area; cx += area * mx; cy += area * my; cz += area * mz;
  }
  if (!at) return { centre: [0, 0, 0], spread: [1, 1], cov: [1, 0, 0, 1, 0, 1] };
  cx /= at; cy /= at; cz /= at;
  const C = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (let i = 0; i < tris.length; i += 4) {
    const w = tris[i], dx = tris[i + 1] - cx, dy = tris[i + 2] - cy, dz = tris[i + 3] - cz;
    C[0] += w * dx * dx; C[1] += w * dx * dy; C[2] += w * dx * dz; C[3] += w * dy * dy; C[4] += w * dy * dz; C[5] += w * dz * dz;
  }
  const cov = C.map((v) => v / at);
  return { centre: [cx, cy, cz], spread: [Math.sqrt(cov[0] + cov[5]), Math.sqrt(cov[3])], cov };
}

// ------------------------------------------------------------------ shaders
const SURFACE_VS = /* glsl */ `
  attribute float aLit;
  varying vec3 vN; varying float vLit;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vLit = aLit;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
const SURFACE_FS = /* glsl */ `
  uniform vec3 uView; uniform vec3 uKey; uniform vec3 uPaper; uniform vec3 uShade;
  uniform vec3 uInk; uniform vec3 uLit; uniform float uLineW;
  varying vec3 vN; varying float vLit;
  void main() {
    vec3 n = normalize(vN);
    // Silhouette from the smooth normal: where it turns edge-on to the viewer, a line of
    // constant pixel width, independent of how the surface was faceted.
    float fv = dot(n, normalize(uView));
    float fw = fwidth(fv);
    float contour = fw > 1e-6 ? 1.0 - smoothstep(fw * 0.45 * uLineW, fw * uLineW, abs(fv)) : 0.0;
    if (!gl_FrontFacing) n = -n;
    // Paper solids shaded only by facing: the anatomy ramp, lighter tops.
    float k = clamp(dot(n, normalize(uKey)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uShade, uPaper, smoothstep(0.08, 0.92, k));
    col = mix(col, mix(uInk, uLit, vLit), contour);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const LINE_VS = /* glsl */ `
  attribute float aLit; varying float vLit;
  void main() { vLit = aLit; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINE_FS = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uLit; varying float vLit;
  void main() { gl_FragColor = vec4(mix(uInk, uLit, vLit), 1.0);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ part model
const built = new WeakMap();

function geometryFor(data) {
  if (built.has(data)) return built.get(data);
  const { position, normal, lit, index, groups } = data;
  const posAttr = new THREE.BufferAttribute(position, 3);
  const nrmAttr = new THREE.BufferAttribute(normal, 3, true);
  const litAttr = new THREE.BufferAttribute(new Float32Array(lit), 1);
  const out = groups.map((g) => {
    const surf = new THREE.BufferGeometry();
    surf.setAttribute("position", posAttr); surf.setAttribute("normal", nrmAttr); surf.setAttribute("aLit", litAttr);
    surf.setIndex(new THREE.BufferAttribute(index.subarray(g.triStart * 3, (g.triStart + g.triCount) * 3), 1));
    const cn = g.creases.length;
    const cp = new Float32Array(cn * 3), cl = new Float32Array(cn);
    for (let i = 0; i < cn; i++) { const v = g.creases[i]; cp.set(position.subarray(v * 3, v * 3 + 3), i * 3); cl[i] = lit[v]; }
    const crease = new THREE.BufferGeometry();
    crease.setAttribute("position", new THREE.BufferAttribute(cp, 3));
    crease.setAttribute("aLit", new THREE.BufferAttribute(cl, 1));
    return { meta: g, surf, crease };
  });
  built.set(data, out);
  return out;
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
    this.surface = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS,
      uniforms: {
        uView: { value: new THREE.Vector3(1, 1, 1) }, uKey: { value: new THREE.Vector3(-0.35, 0.85, 0.4) },
        uPaper: { value: PAPER }, uShade: { value: SHADE_0 }, uInk: { value: INK_HI }, uLit: { value: INK_LIT }, uLineW: { value: 1.6 },
      },
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    this.creaseMat = new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uInk: { value: INK_MID }, uLit: { value: INK_LIT } } });
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
    this.viewHints = data.header.view ?? {};
  }
  // Advance moving groups; `speed` 0..1 scales every spin (eased by the caller).
  tick(dt, speed) {
    for (const s of this.spins) {
      s.angle += (s.rpm / 60) * Math.PI * 2 * dt * speed;
      s.node.quaternion.setFromAxisAngle(s.axis, s.angle);
    }
    return this.spins.length > 0;
  }
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
    const o = { azimuth: 45, elevation: 30, fill: 0.7, span: null, visual: null, dpr: Math.min(2, devicePixelRatio || 1), ...figure.viewHints, ...opts };
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.figure = figure; this.azimuth = o.azimuth; this.elevation = o.elevation;
    this.fill = o.fill; this.span = o.span; this.visual = o.visual; this.dpr = o.dpr;
    this.spin = 0;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    this.extent = this.measure();
    this.resize();
  }
  measure() {
    // Largest projected half-width/height about the optical centre over a full turn,
    // and the footprint width at rest (for the shadow).
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
    const [xx, xy, xz, yy, yz, zz] = this.figure.data.cov;
    const az = THREE.MathUtils.degToRad(this.azimuth), el = THREE.MathUtils.degToRad(this.elevation);
    const R = [Math.cos(az), 0, -Math.sin(az)], U = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)];
    const q = (v) => v[0] * v[0] * xx + v[1] * v[1] * yy + v[2] * v[2] * zz + 2 * (v[0] * v[1] * xy + v[0] * v[2] * xz + v[1] * v[2] * yz);
    return Math.sqrt(q(R) + q(U));
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
    this.figure.root.rotation.set(0, THREE.MathUtils.degToRad(this.spin), 0);
    this.figure.surface.uniforms.uView.value.copy(this.camera.position).normalize();
  }
  paint() { this.pose(); getStage().paint(this); }
}
