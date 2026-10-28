// The road strip: a close-up, bird's-eye two-lane highway running left to right with the
// team's van on it. Ahead of the van the land is a pencil drawing on white paper; behind
// it, colour. Both looks are painted once per size into two stacked canvases with
// identical geometry, and the colour one is revealed through a feathered mask that moves
// with the van, so set() only moves three composited layers.
import { loadPart, Figure, View } from "./stage.js";

const SEED = 0x52494654;
const VAN_URL = "parts/cargo-van.bin";
const OMEGA = 13;                // critically damped follow: settles from 0 to 1 in ~0.5 s

// ------------------------------------------------------------------ seeded randomness
function rng(seed) {
  let t = seed ^ SEED;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const INK = { edge: "#6a6a70", line: "#a4a4aa", soft: "#c9c9ce", hair: "#e2e2e5" };
const GREENS = ["#5d7b3f", "#668546", "#54723a", "#6f8c4b"];

// ------------------------------------------------------------------ layout
// Everything is in CSS px and scales with the van's length `L`, so a phone and a desktop
// show the same scene. Everything is seeded, so the same width always draws the same land.
function build(W, H) {
  const L = clamp(W * 0.118, 64, 190);          // van length
  const road = L * 0.94;                         // ~2.6 van widths
  const sh = road * 0.09, lane = (road - 2 * sh) / 2;
  const verge = road * 0.13;
  const cy = H / 2, top = cy - road / 2, bot = cy + road / 2;
  const u = L / 170;

  // Sparse marks either side of the road, placed across the ground beyond each verge.
  const r = rng(1);
  const roomA = top - verge, roomB = H - bot - verge;
  const across = (side, t) => (side < 0 ? top - verge - t * roomA : bot + verge + t * roomB);

  const trees = [];
  const nTrees = Math.max(3, Math.round(W / 150));
  for (let k = 0; k < nTrees; k++) {
    const x = ((k + 0.15 + r() * 0.7) / nTrees) * W, side = r() < 0.5 ? -1 : 1;
    const t = 0.3 + r() * 0.5, rad = (12 + r() * 9) * u;
    const clump = r() < 0.4 ? 3 : r() < 0.6 ? 2 : 1;
    for (let c = 0; c < clump; c++) {
      const rr = rad * (c ? 0.6 + r() * 0.3 : 1);
      const x2 = x + (c ? (r() - 0.5) * rad * 2.6 : 0), y2 = across(side, t) + (c ? (r() - 0.5) * rad * 1.2 : 0);
      const lim = side < 0 ? [rr * 1.1, top - verge - rr * 1.1] : [bot + verge + rr * 1.1, H - rr * 1.1];
      if (lim[1] <= lim[0]) continue;
      trees.push({ x: x2, y: clamp(y2, lim[0], lim[1]), r: rr, c: GREENS[Math.floor(r() * GREENS.length)], seed: Math.floor(r() * 1e9) });
    }
  }

  const tufts = [];
  const nTufts = Math.max(8, Math.round((W * (roomA + roomB)) / 2600));
  for (let k = 0; k < nTufts; k++) {
    const side = r() < 0.5 ? -1 : 1;
    const t = Math.pow(r(), 1.6) * 0.9;          // a little denser near the verge
    tufts.push({ x: r() * W, y: across(side, t) + (side < 0 ? -2 : 6) * u, s: (5 + r() * 4) * u, n: 3 + Math.floor(r() * 3), seed: Math.floor(r() * 1e9) });
  }

  // A post-and-wire fence on each side, in a few long runs rather than end to end.
  const fences = [];
  for (const side of [-1, 1]) {
    const y = side < 0 ? top - verge - Math.min(roomA * 0.22, 12 * u) : bot + verge + Math.min(roomB * 0.22, 12 * u);
    let x = -20 + r() * W * 0.2;
    while (x < W) {
      const len = W * (0.25 + r() * 0.35);
      fences.push({ y, xa: x, xb: Math.min(W + 20, x + len) });
      x += len + W * (0.08 + r() * 0.2);
    }
  }

  // Reflector posts on both shoulders, and a few distance markers on the far side.
  const posts = [], gapP = L * 1.25;
  for (let x = gapP * 0.4; x < W; x += gapP) posts.push({ x, y: top - 3 * u }, { x: x + gapP / 2, y: bot + 3 * u });
  const markers = [];
  const nM = Math.max(1, Math.round(W / 480));
  for (let k = 0; k < nM; k++) markers.push({ x: ((k + 0.5) / nM) * W + (r() - 0.5) * 80 * u, y: bot + verge * 0.55 });

  return {
    W, H, L, u, road, sh, lane, verge, cy, top, bot,
    x0: L * 0.5 + 16, x1: W - L * 0.5 - 16, vanY: bot - sh - lane / 2,
    trees, tufts, fences, posts, markers,
  };
}

// ------------------------------------------------------------------ painting
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  grainTile = document.createElement("canvas");
  grainTile.width = grainTile.height = 128;
  const g = grainTile.getContext("2d"), img = g.createImageData(128, 128), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 96 + r() * 64; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return grainTile;
}

// A tree from above: a main disc ringed by a few lobes, the same shape in both looks.
function crown(t) {
  const r = rng(t.seed), lobes = [];
  const n = 5 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.283 + r() * 0.5, d = t.r * (0.42 + r() * 0.15);
    lobes.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.r * (0.5 + r() * 0.15)]);
  }
  lobes.push([t.x, t.y, t.r * 0.62]);
  return lobes;
}

function paint(canvas, w, color, dpr) {
  const ctx = canvas.getContext("2d");
  canvas.width = Math.round(w.W * dpr); canvas.height = Math.round(w.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { W, H, u, road, sh, lane, verge, cy, top, bot } = w;
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // Ground: white paper, or a pale meadow that greens toward the mown verges.
  if (color) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const f = (y) => clamp(y / H, 0, 1);
    g.addColorStop(0, "#fdfdfa");
    g.addColorStop(f(top - verge - 30 * u), "#e3ebcf");
    g.addColorStop(f(top - verge), "#d3e0b6");
    g.addColorStop(f(bot + verge), "#d3e0b6");
    g.addColorStop(f(bot + verge + 30 * u), "#e3ebcf");
    g.addColorStop(1, "#fdfdfa");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#a9bf7a";
    ctx.fillRect(0, top - verge, W, verge); ctx.fillRect(0, bot, W, verge);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(0, top - verge, W, verge * 0.35); ctx.fillRect(0, bot + verge * 0.65, W, verge * 0.35);
  } else {
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    for (const y of [top - verge, bot + verge]) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.setLineDash([1.5, 5]); ctx.strokeStyle = INK.soft; ctx.lineWidth = 0.7; ctx.stroke(); ctx.setLineDash([]);
  }

  // Grass tufts.
  ctx.beginPath();
  for (const t of w.tufts) {
    const r = rng(t.seed);
    for (let k = 0; k < t.n; k++) {
      const a = -Math.PI / 2 + (k / (t.n - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.3, len = t.s * (0.6 + r() * 0.5);
      const bx = t.x + (k - t.n / 2) * 0.9 * u;
      ctx.moveTo(bx, t.y);
      ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.3, t.y + Math.sin(a) * len * 0.6, bx + Math.cos(a) * len, t.y + Math.sin(a) * len);
    }
  }
  ctx.strokeStyle = color ? "rgba(84,116,52,.75)" : INK.line; ctx.lineWidth = color ? 0.9 : 0.6; ctx.stroke();

  // Fences: posts and two strands of wire.
  for (const f of w.fences) {
    ctx.beginPath();
    for (const dy of [-1, 1]) { ctx.moveTo(f.xa, f.y + dy * 0.8 * u); ctx.lineTo(f.xb, f.y + dy * 0.8 * u); }
    ctx.strokeStyle = color ? "rgba(110,100,85,.45)" : INK.soft; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath();
    const step = Math.max(9, 22 * u), s = 2.2 * u + 0.4;
    for (let x = f.xa; x <= f.xb; x += step) ctx.rect(x - s / 2, f.y - s / 2, s, s);
    if (color) { ctx.fillStyle = "#8b7a63"; ctx.fill(); } else { ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = INK.line; ctx.lineWidth = 0.6; ctx.stroke(); }
  }

  // Trees: shadow, crown, light.
  const crowns = w.trees.map(crown);
  if (color) {
    ctx.beginPath();
    for (const lobes of crowns) for (const [x, y, r] of lobes) { const sx = x + r * 0.45, sy = y + r * 0.6; ctx.moveTo(sx + r, sy); ctx.arc(sx, sy, r, 0, 6.283); }
    ctx.fillStyle = "rgba(40,60,25,.22)"; ctx.fill();
    w.trees.forEach((t, i) => {
      ctx.beginPath(); for (const [x, y, r] of crowns[i]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283); }
      ctx.fillStyle = t.c; ctx.fill();
      ctx.beginPath(); for (const [x, y, r] of crowns[i]) { const hx = x - r * 0.25, hy = y - r * 0.3; ctx.moveTo(hx + r * 0.55, hy); ctx.arc(hx, hy, r * 0.55, 0, 6.283); }
      ctx.fillStyle = "rgba(255,255,210,.14)"; ctx.fill();
    });
  } else {
    // Outline the union of each crown's lobes: stroke them all, then cover the inside.
    w.trees.forEach((t, i) => {
      ctx.beginPath(); for (const [x, y, r] of crowns[i]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283); }
      ctx.strokeStyle = INK.line; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.beginPath();
      for (const [x, y, r] of crowns[i].slice(0, -1)) { ctx.moveTo(x + r * 0.55 * Math.cos(-0.6), y + r * 0.55 * Math.sin(-0.6)); ctx.arc(x, y, r * 0.55, -0.6, 1.2); }
      ctx.strokeStyle = INK.hair; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(t.x, t.y, 0.9, 0, 6.283); ctx.fillStyle = INK.soft; ctx.fill();
    });
  }

  // Distance markers: a small green sign.
  for (const m of w.markers) {
    const sw = 7 * u + 3, shh = 4.5 * u + 2;
    if (color) {
      ctx.fillStyle = "rgba(40,50,30,.25)"; ctx.fillRect(m.x - sw / 2 + 1.5 * u, m.y - shh / 2 + 2 * u, sw, shh);
      ctx.fillStyle = "#2f6b45"; ctx.fillRect(m.x - sw / 2, m.y - shh / 2, sw, shh);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(m.x - sw / 2 + 1, m.y - 0.4, sw - 2, 0.8);
    } else {
      ctx.fillStyle = "#fff"; ctx.fillRect(m.x - sw / 2, m.y - shh / 2, sw, shh);
      ctx.strokeStyle = INK.line; ctx.lineWidth = 0.7; ctx.strokeRect(m.x - sw / 2, m.y - shh / 2, sw, shh);
    }
  }

  // The road: asphalt with paler shoulders and worn wheel tracks, or two inked edges.
  if (color) {
    ctx.fillStyle = "#717375"; ctx.fillRect(0, top, W, road);
    ctx.fillStyle = "#86888a"; ctx.fillRect(0, top, W, sh); ctx.fillRect(0, bot - sh, W, sh);
    ctx.fillStyle = "rgba(40,40,42,.1)";
    for (const lc of [top + sh + lane / 2, bot - sh - lane / 2]) for (const o of [-0.26, 0.26]) ctx.fillRect(0, lc + o * lane - lane * 0.07, W, lane * 0.14);
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, top, W, 1); ctx.fillRect(0, bot - 1, W, 1);
  } else {
    ctx.fillStyle = "#fff"; ctx.fillRect(0, top, W, road);
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W, top); ctx.moveTo(0, bot); ctx.lineTo(W, bot);
    ctx.strokeStyle = INK.edge; ctx.lineWidth = 0.9; ctx.stroke();
  }
  const lw = Math.max(1, 2.2 * u);
  ctx.lineCap = "butt";
  ctx.beginPath(); ctx.moveTo(0, top + sh); ctx.lineTo(W, top + sh); ctx.moveTo(0, bot - sh); ctx.lineTo(W, bot - sh);
  ctx.strokeStyle = color ? "rgba(246,246,242,.92)" : INK.line; ctx.lineWidth = color ? lw : 0.7; ctx.stroke();
  const dash = w.L * 0.42, gap = w.L * 0.58;
  ctx.beginPath(); ctx.moveTo(-gap * 0.3, cy); ctx.lineTo(W, cy);
  ctx.setLineDash([dash, gap]);
  ctx.strokeStyle = color ? "rgba(236,196,72,.95)" : INK.line; ctx.lineWidth = color ? lw : 0.8; ctx.stroke();
  ctx.setLineDash([]);

  // Reflector posts just off the shoulders.
  for (const p of w.posts) {
    const s = Math.max(1.6, 2.6 * u);
    if (color) {
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(p.x - s / 2 + s * 0.5, p.y - s / 2 + s * 0.6, s, s);
      ctx.fillStyle = "#f4f4f1"; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.fillStyle = "#e0782f"; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 0.4);
    } else {
      ctx.fillStyle = "#fff"; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.strokeStyle = INK.line; ctx.lineWidth = 0.6; ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  if (color) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.07;
    ctx.fillStyle = ctx.createPattern(grain(), "repeat");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ the module
export function roadStrip(host) {
  const make = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const el = make("div", "road");
  el.setAttribute("role", "img");
  const map = make("div", "road-map");
  const ink = make("canvas", "road-ink");
  const reveal = make("div", "road-reveal");
  const color = make("canvas", "road-color");
  reveal.append(color);
  const shadowWrap = make("div", "road-van road-van-shadow"), shadow = make("canvas");
  const vanWrap = make("div", "road-van"), van = make("canvas");
  shadowWrap.append(shadow); vanWrap.append(van);
  map.append(ink, reveal, shadowWrap, vanWrap);
  const labels = make("div", "road-labels");
  labels.innerHTML = "<span>Toronto</span><span>Arlington, TX</span>";
  el.append(map, labels);
  host.append(el);

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let alive = true, world = null, W = 0, H = 0, F = 30, regenTimer = 0, raf = 0, last = 0;
  let target = 0, cur = 0, vel = 0, pct = -1, first = true;
  let vanView = null, vanFrac = null, vanS = 0, vanOx = 0, vanOy = 0;

  // Van at the current progress, in CSS px of the current size (stretched while a resize settles).
  function place() {
    if (!world) return;
    const k = W / world.W;
    const X = (world.x0 + (world.x1 - world.x0) * cur) * k, Y = world.vanY * (H / world.H);
    if (vanS) {
      const tx = X - vanS / 2 - vanOx, ty = Y - vanS / 2 - vanOy;
      vanWrap.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`;
      const sd = vanS * 0.035;
      shadowWrap.style.transform = `translate3d(${(tx + sd * 0.8).toFixed(2)}px,${(ty + sd).toFixed(2)}px,0)`;
    }
    // The colour edge rides at the van's tail and sweeps off the right edge on arrival.
    let bx = X - world.L * k * 0.42;
    bx += (W + F - bx) * smooth(0.9, 1, cur);
    reveal.style.transform = `translate3d(${(bx - F - W).toFixed(2)}px,0,0)`;
    color.style.transform = `translate3d(${(W + F - bx).toFixed(2)}px,0,0)`;
  }

  function step(t) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
    last = t;
    const a = OMEGA * OMEGA * (target - cur) - 2 * OMEGA * vel;
    vel += a * dt; cur += vel * dt;
    if (Math.abs(target - cur) < 2e-4 && Math.abs(vel) < 2e-3) { cur = target; vel = 0; place(); return; }
    place();
    raf = requestAnimationFrame(step);
  }

  function paintVan() {
    if (!vanView || !world) return;
    vanWrap.style.transform = "none";
    if (!vanFrac) {
      // Measure the van's footprint once in a probe paint.
      van.style.width = van.style.height = "160px";
      vanView.resize(); vanView.paint();
      const { width: cw, height: ch } = van, data = van.getContext("2d").getImageData(0, 0, cw, ch).data;
      let x0 = cw, x1 = 0, y0 = ch, y1 = 0;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (data[(y * cw + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      vanFrac = { len: (x1 - x0 + 1) / cw, cx: (x0 + x1 + 1) / 2 / cw - 0.5, cy: (y0 + y1 + 1) / 2 / ch - 0.5 };
    }
    vanS = Math.round(world.L / vanFrac.len);
    vanOx = vanFrac.cx * vanS; vanOy = vanFrac.cy * vanS;
    for (const c of [van, shadow]) c.style.width = c.style.height = vanS + "px";
    vanWrap.style.width = vanWrap.style.height = shadowWrap.style.width = shadowWrap.style.height = vanS + "px";
    vanView.resize(); vanView.paint();
    // Soft shadow from the van's own silhouette.
    shadow.width = van.width; shadow.height = van.height;
    const sx = shadow.getContext("2d");
    sx.clearRect(0, 0, shadow.width, shadow.height);
    const sil = document.createElement("canvas");
    sil.width = van.width; sil.height = van.height;
    const g = sil.getContext("2d");
    g.drawImage(van, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#000"; g.fillRect(0, 0, sil.width, sil.height);
    sx.filter = `blur(${Math.max(1, van.width * 0.02)}px)`;
    sx.drawImage(sil, 0, 0);
    sx.filter = "none";
    el.classList.add("road-has-van");
    place();
  }

  function regen() {
    regenTimer = 0;
    if (!alive || !W) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    world = build(W, H);
    paint(ink, world, false, dpr);
    paint(color, world, true, dpr);
    el.classList.add("road-ready");
    paintVan();
    place();
  }

  function layout() {
    const w = Math.round(map.clientWidth);
    if (!w || w === W) return;
    W = w; H = Math.round(clamp(W * 0.2, 150, 300));
    F = Math.round(clamp(W * 0.03, 20, 46));
    map.style.height = H + "px";
    color.style.width = W + "px"; color.style.height = H + "px";
    reveal.style.width = W + 2 * F + "px";
    map.style.setProperty("--feather", F + "px");
    if (!world) regen();
    else { place(); clearTimeout(regenTimer); regenTimer = setTimeout(regen, 160); }
  }

  const ro = new ResizeObserver(layout);
  ro.observe(map);
  layout();

  loadPart(VAN_URL).then((data) => {
    if (!alive) return;
    const fig = new Figure(data);
    fig.color = 1; fig.holo = 0;
    van.style.width = van.style.height = "160px";
    vanWrap.style.transform = "none";
    vanView = new View(van, fig, { elevation: 89.5, azimuth: 270, fill: 0.9 });
    paintVan();
  }).catch((e) => console.warn("road: van", e));

  function label() {
    const p = Math.round(target * 100);
    if (p === pct) return;
    pct = p;
    el.setAttribute("aria-label", `The van on the road from Toronto to Arlington, Texas: ${p}% of the trip funded.`);
  }
  label();

  return {
    el,
    set(f) {
      target = clamp(+f || 0, 0, 1);
      label();
      // The first value, reduced motion and hidden pages snap; everything else glides.
      if (first || motion.matches || !world || document.hidden) { first = false; cur = target; vel = 0; place(); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf); clearTimeout(regenTimer); ro.disconnect();
      el.remove();
    },
  };
}
