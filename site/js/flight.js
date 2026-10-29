// The flight strip: the airliner that flies the team to the competition, drawn in the site's
// ink-on-paper look, banking gently at a three-quarter angle. Ink becomes light: as seats are
// funded the aeroplane's linework takes the slider's tier materials and the air around it
// becomes visible, one streamline at a time, until the lines stretch into a jump to hyperspace.
// The page stays white at every tier.
import * as THREE from "../vendor/three.module.min.js";
import { buildPlane } from "../flight/plane.js";
import { PLANE_VS, PLANE_FS, LINE_VS, LINE_FS, STREAM_VS, STREAM_FS, TRAIL_VS, TRAIL_FS, SKY_VS, SKY_FS, VAPOR_VS, VAPOR_FS, RING_VS, RING_FS } from "../flight/shaders.js";
import { TIER_MATERIALS, TITLE_FOIL, tierOfSeats } from "./materials.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
// One-shot envelope: smooth attack, exponential decay (age in seconds).
const burst = (age, rise, fall) => (age < 0 ? 0 : age < rise ? sm(0, rise, age) : Math.exp(-(age - rise) / fall));
// A value per seat level 0..8, read at a fractional level.
const ramp = (table, L) => { const i = Math.floor(clamp(L, 0, 8)), f = clamp(L, 0, 8) - i; return table[i] + (table[Math.min(8, i + 1)] - table[i]) * f; };

// Camera by strip shape: [narrow, wide]. Degrees off the tail and above; it looks ahead of the
// aeroplane so the lines' vanishing point sits in the frame, just ahead of the nose. A narrow
// (phone) strip looks less far ahead and keeps the aeroplane off its edges, so the far wing
// and tailplane stay whole as it banks.
const CAM = { fov: [42, 32], behind: [26, 30], up: [6.5, 7], ahead: [2, 6], lift: [2, 2.5], fitX: [0.82, 0.7], fitY: [0.74, 0.74] };

// Per seat level (0..8): every seat a visible step. The wind (streak count, length in metres,
// width in px), the air speed (m/s), the trails, the airframe's material and the engines' glow.
const WIND = [8, 16, 22, 32, 36, 46, 48, 56, 64];
const WIND_LEN = [24, 32, 38, 52, 58, 76, 82, 125, 190];
const WIND_W = [1.2, 1.7, 1.9, 2.3, 2.3, 2.7, 2.6, 2.9, 3.2];
const AIR = [45, 70, 90, 140, 150, 220, 240, 360, 480];
const VORTEX = [0.5, 0.85, 0.85, 1, 1, 1, 1, 1, 1];
const VORTEX_LEN = [45, 80, 100, 150, 160, 215, 220, 300, 400];
const CONTRAIL = [0, 0.5, 0.55, 0.85, 0.8, 0.95, 0.8, 0.9, 1];
const CONTRAIL_LEN = [80, 120, 140, 200, 210, 260, 260, 320, 380];
const METAL = [0, 0, 0.42, 0.7, 0.55, 0.75, 0.6, 0.7, 0.8];
const LEADING = [0, 0, 0, 0, 0.6, 1, 0.6, 0.7, 0.8];
const ENGINE = [0, 0, 0, 0.15, 0.25, 0.75, 0.6, 0.8, 1];
const FOIL = [0, 0, 0, 0, 0, 0, 0.7, 0.85, 1];
// The sound barrier at each tier crossing (seat level 1, 2, 4, 6) and the climax at 8, bigger each
// time; every other seat sends a smaller ring.
const BOOM = { 1: 0.45, 2: 0.58, 4: 0.72, 6: 0.86, 8: 1.25 };

// The sky by seat level, tied to the tiers: paper, a warm haze (Bronze), a cool steel sky
// (Silver), golden hour (Gold), then night with an aurora in the foil (Title), deepest at 8.
const SKY = [
  ["#ffffff", "#ffffff", "#ffffff"], ["#fdf8f3", "#f8e8d8", "#faf1e8"], ["#dde3ea", "#f4f6f8", "#e7eaee"],
  ["#c3ccd7", "#eff2f5", "#d7dce3"], ["#a3b4c9", "#f6dcaa", "#e4c193"], ["#8094ad", "#f3c983", "#d5a46a"],
  ["#18204a", "#33326a", "#1d2142"], ["#0d1129", "#241f4d", "#12142b"], ["#05060f", "#150f36", "#08091a"],
].map((row) => row.map((h) => new THREE.Color(h)));
const SHADE = ["#dcdcd9", "#e4d6c8", "#c8cfd8", "#c3cad3", "#d6bf9c", "#cfae86", "#565b88", "#4c5080", "#444872"].map((h) => new THREE.Color(h));
const AURORA = [0, 0, 0, 0, 0, 0, 0.45, 0.8, 1.2];
const VIG = [0, 0.04, 0.08, 0.1, 0.16, 0.2, 0.32, 0.38, 0.45];
const rampColor = (table, L, out, via) => {
  const i = Math.floor(clamp(L, 0, 8)), f = clamp(L, 0, 8) - i;
  // golden hour to night goes through dusk, not through a muddy brown
  if (via && i === 5) return f < 0.5 ? out.copy(table[5]).lerp(via, f * 2) : out.copy(via).lerp(table[6], f * 2 - 1);
  return out.copy(table[i]).lerp(table[Math.min(8, i + 1)], f);
};
const DUSK = [new THREE.Color("#2b3767"), new THREE.Color("#c27f86"), new THREE.Color("#4b3d5c")];

// Speed lines: where each crosses the aeroplane's centre plane, spread evenly round it and
// outside an elliptical clear zone (wide across the wings, closer above and below the fuselage).
function windLines(n) {
  const S = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399963) % (Math.PI * 2), f = 1 + 1.4 * Math.pow((i * 0.618034) % 1, 1.2);
    S.push({ y: 0.5 + 9 * f * Math.sin(a), z: 23 * f * Math.cos(a), jitter: (i * 0.377) % 1, len: 0.7 + 0.6 * ((i * 0.733) % 1), seed: (i * 0.2915 + 0.13) % 1 });
  }
  return S;
}

export function flightStrip(host, { seats = 8 } = {}) {
  const el = document.createElement("div");
  el.className = "flight";
  const canvas = document.createElement("canvas");
  canvas.className = "flight-gl";
  canvas.setAttribute("aria-hidden", "true");
  el.append(canvas);
  host.append(el);
  const heightFor = (w) => Math.round(clamp(w * 0.3, 240, 440));
  el.style.height = `${heightFor(el.clientWidth || host.clientWidth || 1)}px`;   // the placeholder: white, at its final height

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let renderer = null, ready = false, dead = false;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, visible = false, dirty = true;
  let clock = 0, travel = 0, flow = 0, target = 0, baseFov = 30, phone = false;
  const lvl = { x: 0, v: 0 };
  const events = [];                       // seat pulses: { t0, mat, white }
  const booms = [];                        // sound barrier: { t0, size, mat, climax }
  const sweep = { from: 0, to: 0, t0: -9, dur: 0.6 };
  let scene, camera, plane, U, streams, streamU, lineList, disposables = [], sky, skyU, vapor, ring, boomU, trails = [], SRC = [];
  // where the trail sources have been: travel distance and world position, newest at head
  const HIST = 360, hist = { n: 0, head: 0, D: new Float64Array(HIST), pos: new Float32Array(HIST * 4 * 3) };

  // ---------------------------------------------------------------- the level and its moments
  function set(n) {
    n = clamp(Math.round(Number(n) || 0), 0, seats);
    if (n === target) return;
    const seat8 = (k) => Math.round((k * 8) / seats);
    if (n > target && !reduce.matches) {
      for (let k = target + 1, i = 0; k <= n; k++, i++) {
        events.push({ t0: clock + i * 0.14, mat: tierOfSeats(seat8(k)), white: k === seats });
        // breaking the sound barrier: at every tier crossing, and the climax at the last seat
        const lv = k === seats ? 8 : seat8(k);
        booms.push({ t0: clock + i * 0.14, size: BOOM[lv] ?? 0.3, mat: tierOfSeats(lv), climax: k === seats, ringOnly: !BOOM[lv] });
      }
      while (booms.length > 3) booms.shift();
      while (events.length > 6) events.shift();
    }
    const from = tierOfSeats(seat8(target)), to = tierOfSeats(seat8(n));
    if (from !== to) {
      const p = clock - sweep.t0 < sweep.dur ? (clock - sweep.t0) / sweep.dur : 1;
      sweep.from = p < 0.5 ? sweep.from : sweep.to;
      sweep.to = to; sweep.t0 = clock; sweep.dur = n > target ? 0.6 : 1.0;
      if (reduce.matches) sweep.t0 = -9;
    }
    target = n;
    dirty = true;
    kick();
  }

  // ---------------------------------------------------------------- build, in slices
  const slice = () => new Promise((r) => setTimeout(r, 0));
  async function start() {
    try {
      if (!canvas.getContext("webgl2", { antialias: true, alpha: false })) throw new Error("no WebGL2");
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (e) {
      el.classList.add("flight--still");
      return;
    }
    renderer.setClearColor(0xffffff, 1);
    // checking link status blocks until the driver finishes; the shaders are fixed, so skip it and
    // let the programs compile in parallel while the page carries on
    renderer.debug.checkShaderErrors = /[?&]glcheck/.test(location.search);
    await slice(); if (dead) return;

    const P = buildPlane();
    SRC = [...P.sources.engines, ...P.sources.tips].map((q) => new THREE.Vector3(...q));
    await slice(); if (dead) return;
    const done = [];
    let t0 = performance.now();
    for (const p of P.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p.pos, 3));
      g.setIndex(p.idx);
      g.computeVertexNormals();
      const edges = p.crease ? new THREE.EdgesGeometry(g, p.crease).attributes.position.array : null;
      done.push({ p, normal: g.attributes.normal.array, edges });
      g.dispose();
      if (performance.now() - t0 > 12) { await slice(); if (dead) return; t0 = performance.now(); }
    }
    const surfGeo = mergeParts(done), lineGeo = linesOf(P, done);
    await slice(); if (dead) return;

    const col = (h) => new THREE.Color(h);
    const mats = [TIER_MATERIALS.none, TIER_MATERIALS.bronze, TIER_MATERIALS.silver, TIER_MATERIALS.gold, TIER_MATERIALS.gold];
    U = {
      uDeep: { value: mats.map((m) => col(m.deep)) }, uMid: { value: mats.map((m) => col(m.mid)) },
      uLight: { value: mats.map((m) => col(m.light)) }, uHi: { value: mats.map((m) => col(m.hi)) },
      uFoil: { value: TITLE_FOIL.map(col) },
      uMatFrom: { value: 0 }, uMatTo: { value: 0 }, uSweepX: { value: 99 },
      uPulse: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uKey: { value: new THREE.Vector3(0.45, 0.8, -0.3).normalize() },
      uMetal: { value: 0 }, uFoilAmt: { value: 0 }, uLE: { value: 0 }, uEngine: { value: 0 }, uBeacon: { value: 0 }, uStrobe: { value: 0 },
      uNight: { value: 0 }, uShadeTint: { value: new THREE.Color(0xdcdcd9) },
    };
    const surfMat = new THREE.ShaderMaterial({ vertexShader: PLANE_VS, fragmentShader: PLANE_FS, uniforms: U, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lineMat = new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: U });

    // streamlines: one strip of quads per line, all in one draw
    lineList = windLines(64);
    const SEG = 12, NL = 64;
    const nv = NL * (SEG + 1) * 2, aLine = new Float32Array(nv), aU = new Float32Array(nv), aSide = new Float32Array(nv), idx = [];
    for (let l = 0, v = 0; l < NL; l++) {
      for (let s = 0; s <= SEG; s++) for (const side of [-1, 1]) { aLine[v] = l; aU[v] = Math.pow(s / SEG, 1.6); aSide[v] = side; v++; }
      const b = l * (SEG + 1) * 2;
      for (let s = 0; s < SEG; s++) { const a = b + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    sg.setAttribute("aLine", new THREE.BufferAttribute(aLine, 1));
    sg.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
    sg.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
    sg.setIndex(idx);
    streamU = {
      ...U,
      uLA: { value: lineList.map((a) => new THREE.Vector4(0, a.y, a.z, 0)) },
      uApex: { value: new THREE.Vector3(40, 0.6, 0) },
      uLB: { value: lineList.map((a) => new THREE.Vector4(0, a.jitter, a.len, a.seed)) },
      uTravel: { value: 0 }, uFlow: { value: 0 }, uWidth: { value: 1.5 }, uStrokeLen: { value: 10 }, uZc: { value: 2 },
      uRes: { value: new THREE.Vector2(1, 1) }, uCore: { value: 0.45 }, uInk: { value: 1 },
    };
    const streamMat = new THREE.ShaderMaterial({ vertexShader: STREAM_VS, fragmentShader: STREAM_FS, uniforms: streamU,
      transparent: true, depthWrite: false, side: THREE.DoubleSide });
    streams = new THREE.Mesh(sg, streamMat);
    streams.frustumCulled = false;
    streams.renderOrder = 2;

    // trails: contrails behind the engines, vortex trails off the wingtips
    const SEGT = 64;
    for (const T of [{ src: 0, kind: 0, seed: 0.1 }, { src: 1, kind: 0, seed: 0.7 }, { src: 2, kind: 1, seed: 0.2 }, { src: 3, kind: 1, seed: 0.6 }]) {
      const g = new THREE.BufferGeometry(), nv2 = (SEGT + 1) * 2;
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nv2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const aS = new Float32Array(nv2), aV = new Float32Array(nv2), ix = [];
      for (let k = 0; k <= SEGT; k++) { aV[k * 2] = -1; aV[k * 2 + 1] = 1; }
      for (let k = 0; k < SEGT; k++) { const q = k * 2; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      g.setAttribute("aS", new THREE.BufferAttribute(aS, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aV", new THREE.BufferAttribute(aV, 1));
      g.setIndex(ix);
      T.seg = SEGT;
      T.uni = { ...U, uKind: { value: T.kind }, uAmt: { value: 0 }, uLen: { value: 100 }, uSeed: { value: T.seed }, uTravel: { value: 0 },
        uNight: U.uNight, uCore: { value: 0.45 }, uAA: { value: 0.5 }, uBlur: { value: 0 } };
      T.mat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, uniforms: T.uni, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      T.mesh = new THREE.Mesh(g, T.mat);
      T.mesh.frustumCulled = false; T.mesh.renderOrder = T.kind === 0 ? 1 : 2;
      trails.push(T);
      disposables.push(g, T.mat);
    }

    // the sky: one full-screen triangle drawn first
    skyU = { ...U, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uTop: { value: new THREE.Color(1, 1, 1) }, uHor: { value: new THREE.Color(1, 1, 1) }, uLow: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: 0 }, uAurora: { value: 0 }, uStars: { value: 0 }, uPress: { value: 0 }, uVig: { value: 0 } };
    const skyGeo = new THREE.BufferGeometry();
    skyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, depthTest: false, depthWrite: false });
    sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;

    // the sound barrier: a vapour collar round the airframe and a shock ring across the flight path
    boomU = { ...U, uBoomT: { value: 0 }, uBoomS: { value: 1 }, uBoom: { value: 0 }, uRingR: { value: 90 }, uBoomMat: { value: 0 }, uRing2: { value: 0 } };
    const NA = 64, NU = 18, vp = [], vu = [], va = [], vi = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NA; j++) {
      // a cone from just ahead of the radome (x 20.6) back to ahead of the engine inlets (x 8.6),
      // always outside the fuselage, which is at most 2.07 m in radius
      const u = i / NU, a = (j / NA) * Math.PI * 2, x = 20.6 - 12 * u, r = 0.3 + (20.6 - x) * 0.52 + 0.25 * Math.sin(u * Math.PI);
      vp.push(x, -0.15 + r * Math.sin(a) * 0.95, r * Math.cos(a)); vu.push(u); va.push(j / NA);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; vi.push(a, b, a + 1, a + 1, b, b + 1); }
    const vGeo = new THREE.BufferGeometry();
    vGeo.setAttribute("position", new THREE.Float32BufferAttribute(vp, 3));
    vGeo.setAttribute("aU", new THREE.Float32BufferAttribute(vu, 1));
    vGeo.setAttribute("aA", new THREE.Float32BufferAttribute(va, 1));
    vGeo.setIndex(vi); vGeo.computeVertexNormals();
    const vMat = new THREE.ShaderMaterial({ vertexShader: VAPOR_VS, fragmentShader: VAPOR_FS, uniforms: boomU, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    vapor = new THREE.Mesh(vGeo, vMat);
    vapor.frustumCulled = false; vapor.renderOrder = 3; vapor.visible = false;
    const rGeo = new THREE.BufferGeometry(), RR = 240;
    rGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, -RR, -RR, 0, RR, -RR, 0, RR, RR, 0, -RR, RR], 3));
    rGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const rMat = new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, uniforms: boomU, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
    ring = new THREE.Mesh(rGeo, rMat);
    ring.frustumCulled = false; ring.renderOrder = 4; ring.visible = false;
    disposables.push(skyGeo, skyMat, vGeo, vMat, rGeo, rMat);

    plane = new THREE.Group();
    plane.rotation.order = "YZX";
    plane.add(new THREE.Mesh(surfGeo, surfMat), new THREE.LineSegments(lineGeo, lineMat), streams, vapor);
    scene = new THREE.Scene();
    scene.add(sky, plane, ring, ...trails.map((T) => T.mesh));
    camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
    disposables.push(surfGeo, lineGeo, sg, surfMat, lineMat, streamMat);
    W = 0; layout();
    // compile off the main thread where the driver can; otherwise in one go, after a slice
    if (renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera);
    else { await slice(); renderer.compile(scene, camera); }
    if (dead) return;
    ready = true;
    dirty = true;
    kick();
    // dev only: a harness can time frames directly (dev-flight.html sets this before loading)
    if (typeof window.__flightProbe === "function") window.__flightProbe({ frame: () => { raf = 0; tick(performance.now()); } });
  }

  // ---------------------------------------------------------------- layout
  // Pixel ratio: at most 1.5, dropped to 1 if frames run long (a slow GPU).
  let maxRatio = 1.5, slow = 0;
  function layout() {
    const w = el.clientWidth;
    if (!w) return;
    el.style.height = `${heightFor(w)}px`;
    if (!renderer || !camera) return;
    const d = Math.min(maxRatio, devicePixelRatio || 1);
    if (w === W && d === dpr) return;
    W = w; dpr = d; H = heightFor(w);
    phone = W < 640;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    streamU.uRes.value.set(W * dpr, H * dpr);
    camera.aspect = W / H;
    const wide = sm(1.5, 3.3, W / H), pick = (k) => CAM[k][0] + (CAM[k][1] - CAM[k][0]) * wide;
    baseFov = pick("fov");
    frame(pick);
    dirty = true;
    kick();
  }
  const KEY = [[18.8, 0, 0], [-19.6, 0.9, 0], [-17.9, 8.3, 0], [-3.6, 2.9, 18.1], [-3.6, 2.9, -18.1], [-16.8, 1.3, 6.2], [-16.8, 1.3, -6.2],
    [5, -3.3, 5], [5, -3.3, -5], [0, -2.5, 0]].map((p) => new THREE.Vector3(...p));
  function frame(pick) {
    const b = THREE.MathUtils.degToRad(pick("behind")), e = THREE.MathUtils.degToRad(pick("up"));
    const dir = new THREE.Vector3(-Math.cos(b) * Math.cos(e), Math.sin(e), Math.sin(b) * Math.cos(e));
    const look = new THREE.Vector3(pick("ahead"), pick("lift"), 0);
    const fx = pick("fitX"), fy = pick("fitY");
    camera.fov = baseFov; camera.updateProjectionMatrix();
    let D = 90;
    const v = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      camera.position.copy(look).addScaledVector(dir, D);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      let mx = 0, my = 0;
      for (const p of KEY) { v.copy(p).project(camera); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
      D *= 0.55 + 0.45 * Math.max(mx / fx, my / fy);
    }
    camera.updateMatrixWorld();
    U.uCamPos.value.copy(camera.position);
  }

  // ---------------------------------------------------------------- frame
  function tick(nowMs) {
    raf = 0;
    if (dead || !ready) return;
    const still = reduce.matches;
    const gap = last ? (nowMs - last) / 1000 : 1 / 60;
    const dt = Math.min(gap, 1 / 20);
    last = nowMs;
    if (maxRatio > 1) { slow = gap > 0.024 && gap < 0.25 ? slow + 1 : Math.max(0, slow - 2); if (slow > 45) { maxRatio = 1; W = 0; layout(); } }
    if (!still) clock += dt;

    // the level: a critically damped spring, quicker up than down
    if (still) { lvl.x = target; lvl.v = 0; }
    else {
      const k = target > lvl.x ? 8 : 4;
      lvl.v += (k * k * (target - lvl.x) - 2 * k * lvl.v) * dt;
      lvl.x += lvl.v * dt;
      if (Math.abs(target - lvl.x) < 1e-4 && Math.abs(lvl.v) < 1e-4) { lvl.x = target; lvl.v = 0; }
    }
    const L = clamp(lvl.x, 0, seats) * (8 / seats);

    // seat pulses, tail to nose over 0.6 s, and the jolt of speed that goes with each
    let jolt = 0;
    const pulses = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i], age = clock - ev.t0;
      if (age > 1.2) { events.splice(i, 1); continue; }
      if (age < 0) continue;
      jolt += burst(age, 0.06, 0.55) * (ev.white ? 1.5 : 1.15);
      pulses.push({ x: -60 + 88 * ease(age / 0.6), s: sm(0, 0.06, age) * (1 - sm(0.5, 0.8, age)) * (ev.white ? 1 : 0.9), mat: ev.mat, white: ev.white ? 1 : 0 });
    }
    for (let i = 0; i < 3; i++) { const p = pulses[i]; U.uPulse.value[i].set(p ? p.x : 0, p ? p.s : 0, p ? p.mat : 0, p ? p.white : 0); }

    // the tier's material sweeping tail -> nose
    const sp = ease((clock - sweep.t0) / sweep.dur);
    if (sp >= 1) sweep.from = sweep.to;
    U.uMatFrom.value = sweep.from; U.uMatTo.value = sweep.to;
    U.uSweepX.value = sp >= 1 ? 99 : -32 + 58 * sp;

    // the flight: a gentle bank, the drift and heading that follow it, a slow pitch
    const t = clock, calm = 1 - 0.4 * sm(6, 8, L);
    const w1 = (2 * Math.PI) / 9.5, w2 = (2 * Math.PI) / 13;
    const roll = THREE.MathUtils.degToRad(6.5 * calm) * (Math.sin(w1 * t) * 0.85 + Math.sin(w1 * 0.41 * t + 1.3) * 0.15);
    plane.position.set(1.2 * jolt + 0.25 * Math.sin(w2 * 0.7 * t), 0.35 * Math.sin(w2 * t), -0.95 * calm * Math.cos(w1 * t));
    plane.rotation.set(roll, -THREE.MathUtils.degToRad(1.4 * calm) * Math.sin(w1 * t), THREE.MathUtils.degToRad(1.1) * Math.sin(w2 * t + 0.7));
    camera.fov = baseFov + 2.8 * jolt + 3 * sm(6.3, 8, L);
    camera.updateProjectionMatrix();

    const speed = ramp(AIR, L) + 160 * jolt;
    if (!still) travel += speed * dt;
    // how fast the streaks themselves run: it grows with speed but stays slow enough that every
    // streak lives a second or more on screen (speed reads through their length instead)
    if (!still) flow += (55 + 0.17 * speed) * dt;

    // the wind: speed lines streaming past, more, longer and faster tier by tier
    // each seat's moment adds a burst of extra streaks rushing past
    const nWind = Math.min(ramp(WIND, L) + 16 * jolt, phone ? 34 : 64);
    for (let i = 0; i < lineList.length; i++) streamU.uLB.value[i].x = clamp(nWind - i, 0, 1);
    streamU.uStrokeLen.value = ramp(WIND_LEN, L) * (1 + 1.1 * jolt);
    streamU.uWidth.value = ramp(WIND_W, L) * (phone ? 1.15 : 1) * dpr;
    streamU.uTravel.value = travel;
    streamU.uFlow.value = flow;
    streamU.uCore.value = 0.45 + 0.5 * sm(5.3, 6.2, L);   // foil runs brighter than metal
    streamU.uInk.value = 0.55 + 0.45 * sm(0, 1, L);         // at 0 the wind is faint pencil

    // trails: record where the sources are, then lay each trail along that record
    plane.updateMatrixWorld(true);
    hist.head = (hist.head + 1) % HIST; hist.n = Math.min(HIST, hist.n + 1);
    hist.D[hist.head] = travel;
    for (let i = 0; i < 4; i++) { tv.copy(SRC[i]).applyMatrix4(plane.matrixWorld); hist.pos.set([tv.x, tv.y, tv.z], (hist.head * 4 + i) * 3); }
    for (const T of trails) {
      const amt = T.kind === 0 ? ramp(CONTRAIL, L) : ramp(VORTEX, L);
      T.uni.uAmt.value = amt;
      T.uni.uLen.value = T.kind === 0 ? ramp(CONTRAIL_LEN, L) : ramp(VORTEX_LEN, L);
      T.uni.uTravel.value = travel;
      T.uni.uBlur.value = still ? 0 : speed * dt;           // metres the air moved this frame
      T.uni.uCore.value = streamU.uCore.value;
      T.mesh.visible = amt > 0.01;
      if (T.mesh.visible) ribbon(T, T.kind === 0 ? null : (phone ? 1.9 : 1.6) * (0.8 + 0.4 * sm(1, 8, L)));
    }
    streams.visible = L > 0.01 || pulses.length > 0;

    U.uTime.value = still ? 0.8 : clock;
    U.uMetal.value = ramp(METAL, L);
    U.uFoilAmt.value = ramp(FOIL, L);
    U.uLE.value = ramp(LEADING, L) * 0.8;
    U.uEngine.value = Math.min(1, ramp(ENGINE, L) + 0.7 * jolt);   // a flare on each seat, a lasting glow from 5
    U.uBeacon.value = still ? 1 : burst(clock % 1.2, 0.03, 0.12);
    U.uStrobe.value = still ? 0.5 : burst(clock % 1.5, 0.02, 0.06) + 0.25 * burst((clock + 0.12) % 1.5, 0.02, 0.06);

    // the sky
    skyU.uSky.value = sm(0, 0.8, L);
    rampColor(SKY.map((r) => r[0]), L, skyU.uTop.value, DUSK[0]);
    rampColor(SKY.map((r) => r[1]), L, skyU.uHor.value, DUSK[1]);
    rampColor(SKY.map((r) => r[2]), L, skyU.uLow.value, DUSK[2]);
    rampColor(SHADE, L, U.uShadeTint.value);
    skyU.uAurora.value = ramp(AURORA, L);
    skyU.uStars.value = ramp(AURORA, L);
    skyU.uVig.value = ramp(VIG, L);
    U.uNight.value = sm(5.2, 6.2, L);

    // the sound barrier: the latest one running
    let boom = null;
    for (let i = booms.length - 1; i >= 0; i--) {
      const age = clock - booms[i].t0;
      if (age > 2.6) { booms.splice(i, 1); continue; }
      if (age >= 0 && !boom) boom = { ...booms[i], age };
    }
    ring.visible = !!boom && !still;
    vapor.visible = ring.visible && !boom.ringOnly;
    if (boom) {
      const s = boom.size;
      boomU.uBoomT.value = boom.age;
      boomU.uBoom.value = burst(boom.age, 0.05, 0.35 + 0.45 * s) * Math.min(1, 0.55 + 0.45 * s) * (1 - sm(1.4, 2.4, boom.age));
      boomU.uBoomS.value = 0.6 + 0.4 * Math.min(s, 1.1);
      boomU.uRingR.value = boom.ringOnly ? 34 : 30 + 70 * s;
      boomU.uBoomMat.value = boom.mat;
      boomU.uRing2.value = boom.climax ? 1 : 0;
      skyU.uPress.value = burst(boom.age, 0.04, 0.22) * Math.min(1, s) * (boom.ringOnly ? 0.5 : 1);
      ring.position.x = plane.position.x + 20;      // the shock runs out from the nose
      const punch = burst(boom.age, 0.08, 0.5) * s;
      plane.position.x += 2 * punch; camera.fov += 2.2 * punch; camera.updateProjectionMatrix();
    } else skyU.uPress.value = 0;
    skyU.uInvProj.value.copy(camera.projectionMatrixInverse);
    skyU.uCamWorld.value.copy(camera.matrixWorld);

    renderer.render(scene, camera);
    if (!el.dataset.live) el.dataset.live = "";      // first frame drawn (CSS or tests may key on it)

    const settling = lvl.x !== target || events.length > 0 || sp < 1;
    dirty = false;
    if (!raf && ((!still && visible) || (still && settling))) raf = requestAnimationFrame(tick);
  }

  // Lay a camera-facing ribbon along a trail's record. pxWidth: a crisp line that many pixels wide;
  // null: soft vapour that spreads in metres.
  const tv = new THREE.Vector3(), ta = new THREE.Vector3(), tb = new THREE.Vector3(), side = new THREE.Vector3(), prev = new THREE.Vector3(), toCam = new THREE.Vector3();
  function trailPoint(src, s, out) {
    const Dt = travel - s;
    let i = hist.head, k = 0;
    while (k < hist.n - 1 && hist.D[i] > Dt) { i = (i - 1 + HIST) % HIST; k++; }
    const j = (i + 1) % HIST, D0 = hist.D[i], D1 = k === 0 ? D0 : hist.D[j];
    const f = k > 0 && D1 > D0 ? clamp((Dt - D0) / (D1 - D0), 0, 1) : 0;
    const p0 = (i * 4 + src) * 3, p1 = (j * 4 + src) * 3;
    out.set(hist.pos[p0] + (hist.pos[p1] - hist.pos[p0]) * f, hist.pos[p0 + 1] + (hist.pos[p1 + 1] - hist.pos[p0 + 1]) * f, hist.pos[p0 + 2] + (hist.pos[p1 + 2] - hist.pos[p0 + 2]) * f);
    out.x -= travel - (k === 0 ? hist.D[i] : D0 + (D1 - D0) * f);     // the air has carried it back since
    return out;
  }
  function ribbon(T, pxWidth) {
    const g = T.mesh.geometry, arr = g.attributes.position.array, aS = g.attributes.aS.array, len = T.uni.uLen.value;
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
    if (pxWidth) T.uni.uAA.value = 1 / (pxWidth / 2 + 1);
    for (let k = 0; k <= T.seg; k++) {
      const s = len * Math.pow(k / T.seg, 1.3);
      trailPoint(T.src, s, ta); trailPoint(T.src, s + 0.6, tb);
      toCam.subVectors(camera.position, ta);
      const dist = toCam.length();
      side.crossVectors(tb.sub(ta), toCam).normalize();
      if (k > 0 ? side.dot(prev) < 0 : (T.side ? side.dot(T.side) < 0 : side.y > 0)) side.negate();
      if (k === 0) (T.side ??= new THREE.Vector3()).copy(side);
      prev.copy(side);
      const w = pxWidth ? (pxWidth / 2 + 1) * dist * perPx : (0.45 + s * 0.028) * (0.6 + 0.4 * T.uni.uAmt.value);
      arr.set([ta.x - side.x * w, ta.y - side.y * w, ta.z - side.z * w, ta.x + side.x * w, ta.y + side.y * w, ta.z + side.z * w], k * 6);
      aS[k * 2] = aS[k * 2 + 1] = s;
    }
    g.attributes.position.needsUpdate = true; g.attributes.aS.needsUpdate = true;
  }

  // ---------------------------------------------------------------- lifecycle
  const kick = () => { if (!raf && !dead && ready && W && (visible || dirty)) { last = 0; raf = requestAnimationFrame(tick); } };
  const ro = new ResizeObserver(() => layout());
  ro.observe(el);
  // Build when the strip is within a screen of the viewport; draw only while it is in view.
  const nearIO = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { nearIO.disconnect(); start(); } }, { rootMargin: "100% 0px 100% 0px" });
  nearIO.observe(el);
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); });
  io.observe(el);
  const onMotion = () => { dirty = true; kick(); };
  reduce.addEventListener?.("change", onMotion);
  layout();

  function destroy() {
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect(); nearIO.disconnect(); io.disconnect();
    reduce.removeEventListener?.("change", onMotion);
    for (const d of disposables) d.dispose();
    if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
    el.remove();
  }
  return { el, set, destroy };
}

// ------------------------------------------------------------------ geometry helpers
function mergeParts(done) {
  let nv = 0, ni = 0;
  for (const { p } of done) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), mat = new Float32Array(nv), edge = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const { p, normal } of done) {
    const v = p.pos.length / 3;
    pos.set(p.pos, ov * 3); nrm.set(normal, ov * 3);
    mat.fill(p.mat, ov, ov + v);
    if (p.edge) edge.set(p.edge, ov);
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + ov;
    ov += v; oi += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("aMat", new THREE.BufferAttribute(mat, 1));
  g.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
// Seams from the model plus creases where faces meet at an angle.
function linesOf(P, done) {
  let n = P.lines.length;
  for (const d of done) if (d.edges) n += d.edges.length;
  const pts = new Float32Array(n), tone = new Float32Array(n / 3);
  pts.set(P.lines);
  P.tones.forEach((t, i) => { tone[i * 2] = tone[i * 2 + 1] = t; });
  let o = P.lines.length;
  for (const d of done) if (d.edges) { pts.set(d.edges, o); tone.fill(1, o / 3, (o + d.edges.length) / 3); o += d.edges.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  g.setAttribute("aTone", new THREE.BufferAttribute(tone, 1));
  return g;
}
