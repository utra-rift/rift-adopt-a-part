// A full-width gauge slider. The track is a row of cells, one per milestone; passed cells ignite
// and stay lit, the current one fills up to a needle. Crossing a milestone upward fires a pulse
// (the cell flashes, a shockwave and a light burst run out from it, sparks fly). Crossing a
// sponsorship tier threshold changes the material of the whole gauge with a sweep that runs out
// from the threshold. Everything gets brighter and busier tier by tier.
//
// A transparent native <input type="range"> sits on top so pointer, touch, keyboard and screen
// readers all work. A canvas underneath draws the gauge and effects; labels are HTML. On a touch
// screen the track lets touches through (a thumb landing on it mid-scroll would jump the value)
// and only a grip riding the needle drags it.

import { TIERS, tierFor, money } from "./catalog.js";
import { TextMorph } from "../vendor/torph.mjs";

// Geometry, in CSS px. Must match css/tierslider.css.
const PAD = 6;            // half the native thumb width: value 0 and max sit PAD in from the edges
const BAR_Y = 36;         // centre line of the gauge
const BAR_H = 10;
const RADIUS = 2.5;
const GAP = 4;            // between cells
const H = 66;             // control height
const BLEED_X = 16;       // canvas overhang for glow and sparks
const BLEED_Y = 48;
const DPR_CAP = 2;
const GRIP = 60;           // touch target riding the needle; must match .tslider-grip
const BAR_TOP = BAR_Y - BAR_H / 2;
const BAR_BOT = BAR_Y + BAR_H / 2;

const ease = (t) => 1 - Math.pow(1 - t, 4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

// Materials. Metals: horizontal `bands` drifting at `drift` px/s; `glow` blooms around lit cells;
// `deep` draws rings and marks; `sparks` are the burst colours. Title is a holographic foil built per frame.
const METALS = [
  { bands: ["#6b3518", "#a8612f", "#e0a06c", "#f8d6b4", "#b46e3a", "#7d421d"], glow: [232, 140, 70], deep: [170, 92, 38],
    sparks: [[255, 230, 204], [244, 172, 108], [204, 118, 56]], period: 240, drift: 14 },
  { bands: ["#646c75", "#a0a9b3", "#e2e7ec", "#ffffff", "#aeb7c0", "#737b84"], glow: [160, 178, 202], deep: [92, 106, 126],
    sparks: [[255, 255, 255], [218, 230, 245], [150, 172, 200]], period: 220, drift: 22 },
  { bands: ["#7a5206", "#c79320", "#f3cd52", "#fff4be", "#dcaa2c", "#8c630f"], glow: [255, 190, 30], deep: [196, 138, 6],
    sparks: [[255, 252, 222], [255, 216, 90], [230, 164, 20]], period: 200, drift: 32 },
];

// Intensity per level: index 0 is below Bronze, then Bronze, Silver, Gold, Title.
const LEVELS = [
  { glow: 0, glowA: 0, glints: 0, glintSize: 0, sheen: 0, sparks: 6, sparkSize: 1.5, sparkSpeed: 150, shock: 16, travel: 90 },
  { glow: 10, glowA: 0.55, glints: 7, glintSize: 3.6, sheen: 260, sparks: 16, sparkSize: 2.1, sparkSpeed: 230, shock: 28, travel: 200 },
  { glow: 14, glowA: 0.65, glints: 12, glintSize: 4, sheen: 340, sparks: 24, sparkSize: 2.4, sparkSpeed: 270, shock: 34, travel: 280 },
  { glow: 19, glowA: 0.75, glints: 20, glintSize: 4.6, sheen: 420, sparks: 32, sparkSize: 2.8, sparkSpeed: 310, shock: 42, travel: 360 },
  { glow: 26, glowA: 0.85, glints: 30, glintSize: 5.4, sheen: 520, sparks: 46, sparkSize: 3.2, sparkSpeed: 370, shock: 54, travel: 480 },
];

const reducedQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

// Returns true when the browser held the buzz back: it allows vibration only once the page has
// had a completed tap (scrolling never counts, and a finger drag counts only as it lifts), so
// the first drag on a fresh page can't buzz while the finger is down.
function vibrate(pattern) {
  if (!navigator.vibrate) return false;
  if (!(navigator.userActivation?.hasBeenActive ?? true)) return true;
  try { navigator.vibrate(pattern); } catch {}
  return false;
}

export function tierSlider(host, {
  label, max, step = 1, value = 0, amountOf = (v) => v, onInput, valueText,
  milestones, milestoneLabel = (v) => v.toLocaleString("en-CA"), thumbLabel,
} = {}) {
  const tierAt = (v) => TIERS.indexOf(tierFor(amountOf(v)));
  const text = valueText ?? ((v) => {
    const t = tierFor(amountOf(v));
    return money(amountOf(v)) + (t ? `, ${t.name}` : "");
  });

  // Tier thresholds: the first step at which each tier is reached. Out-of-range tiers get no mark.
  const decimals = (n) => (String(n).split(".")[1] ?? "").length;
  const steps = Math.floor(max / step + 1e-9);
  const atStep = (k) => +(k * step).toFixed(decimals(step));
  const marks = [];
  TIERS.forEach((t, i) => {
    if (amountOf(max) < t.min) return;
    let lo = 0, hi = steps;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (amountOf(atStep(mid)) >= t.min) hi = mid; else lo = mid + 1;
    }
    marks.push({ i, tier: t, frac: atStep(lo) / max });
  });

  // Milestones split the gauge into cells. Cell k ends at milestone k; a last partial cell runs to max.
  const ms = [];
  if (milestones > 0) {
    for (let k = 1; k * milestones <= max + 1e-9; k++) {
      const v = +(k * milestones).toFixed(decimals(milestones));
      ms.push({ k: k - 1, v, frac: v / max });
    }
  }
  // A sliver of a last cell (the drive's 4,500 to 4,534 km) folds into the one before it.
  const cuts = ms.map((m) => m.frac).filter((f) => f < 1 - 1e-9);
  if (cuts.length && (1 - cuts[cuts.length - 1]) * max < milestones * 0.35) cuts.pop();
  const bounds = [0, ...cuts, 1];

  // DOM
  const el = document.createElement("div");
  el.className = "tslider";
  const tierRow = document.createElement("div");
  tierRow.className = "tslider-tiers";
  const msRow = document.createElement("div");
  msRow.className = "tslider-ms";
  for (const row of [tierRow, msRow]) row.setAttribute("aria-hidden", "true");
  for (const m of marks) {
    const s = document.createElement("span");
    s.className = "tslider-tier";
    s.dataset.tier = m.tier.id;
    s.dataset.name = m.tier.name;
    s.textContent = m.tier.name;
    m.label = s;
    tierRow.append(s);
  }
  for (const m of ms) {
    const s = document.createElement("span");
    s.className = "tslider-mlabel";
    s.textContent = milestoneLabel(m.v);
    s.addEventListener("animationend", () => s.classList.remove("is-pop"));
    m.label = s;
    msRow.append(s);
  }
  const canvas = document.createElement("canvas");
  canvas.className = "tslider-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "range";
  input.className = "tslider-input";
  input.min = "0";
  input.max = String(max);
  input.step = String(step);
  input.value = String(clamp(value, 0, max));
  if (label) input.setAttribute("aria-label", label);
  // Optional value pill riding the needle; its digits morph with torph.
  let pill = null, morph = null;
  if (thumbLabel) {
    pill = document.createElement("div");
    pill.className = "tslider-pill";
    pill.setAttribute("aria-hidden", "true");
    const txt = document.createElement("span");
    pill.append(txt);
    morph = new TextMorph({ element: txt, numbers: true, locale: "en-CA", duration: 480, ease: "cubic-bezier(.23, 1, .32, 1)" });
    morph.update(thumbLabel(+input.value));
  }
  const touch = typeof matchMedia === "function" && !matchMedia("(hover: hover) and (pointer: fine)").matches;
  const grip = touch ? document.createElement("div") : null;
  if (grip) { el.dataset.touch = ""; grip.className = "tslider-grip"; grip.setAttribute("aria-hidden", "true"); }
  el.append(tierRow, canvas, input, msRow);
  if (pill) el.append(pill);
  if (grip) el.append(grip);
  host.append(el);
  const ctx = canvas.getContext("2d");

  // State
  let W = 0, dpr = 1, segs = [];
  let reduced = !!reducedQuery?.matches;
  let visible = true;
  let val = +input.value;
  let tier = tierAt(val);
  let wipe = null;                 // { from, to, x, t, dur, up }
  let target = val / max, shown = target;
  let dragging = false, hover = 0, hoverTarget = 0, focusRing = false;
  // A buzz the browser held back during this drag, played as the finger lifts (the lift is what
  // lets the page vibrate); a tier change's pattern outranks a milestone tick.
  let missed = null;
  const buzz = (p) => { if (vibrate(p) && !Array.isArray(missed)) missed = p; };
  let fx = 0, hue = 210;           // effect clock and Title hue; frozen under reduced motion
  let kick = 0;                    // short glow boost after a pulse
  let queue = [], gap = 0;         // milestone pulses waiting their turn
  let effects = [];                // { kind: "shock" | "travel", x, t, dur, ti, w }
  let sparks = [], glints = [], spawnAcc = 0;
  const flash = ms.map(() => -1);  // age of each cell's ignition flash, -1 when idle
  let trail = [], movedAt = -1;
  let raf = 0, last = 0, lastBuzz = -1;

  const x0 = () => PAD;
  const x1 = () => W - PAD;
  const xOf = (f) => PAD + f * (W - 2 * PAD);
  const xDone = () => {
    let f = 0;
    for (const m of ms) if (m.frac <= shown + 1e-9) f = m.frac;
    return xOf(f);
  };
  const levelOf = (ti) => LEVELS[ti + 1];

  // Colours
  const rgb = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
  // Title's light wanders through pink, violet and blue (never green or brown on white).
  const titleHue = (off) => 275 + 50 * Math.sin(fx * 0.7 + off / 50);
  const glowOf = (ti, a, off = 0) =>
    ti < 0 ? `rgba(17,17,17,${a * 0.5})` : ti === 3 ? `hsla(${titleHue(off)},90%,70%,${a})` : rgb(METALS[ti].glow, a);
  const deepOf = (ti, a, off = 0) =>
    ti < 0 ? `rgba(17,17,17,${a})` : ti === 3 ? `hsla(${titleHue(off)},70%,55%,${a})` : rgb(METALS[ti].deep, a);

  function material(ti) {
    const ax = x0() - 40, bx = x1() + 40;
    if (ti === 3) {
      // Holographic foil: hue flows along the bar, with a second, faster ripple for the shimmer.
      const g = ctx.createLinearGradient(ax, 0, bx, 0);
      // Pastel spectrum bands over a pearly base, every few stops a near-white flash like foil.
      const n = Math.max(12, Math.ceil((bx - ax) / 12));
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const h = (hue + x * 1.4 + 70 * Math.sin(x / 41 + fx * 2.1)) % 360;
        const shine = Math.sin(x / 17 - fx * 4.2);
        const c = shine > 0.82 ? `hsl(${h},40%,93%)` : `hsl(${h},${72 + 10 * shine}%,${68 + 7 * shine}%)`;
        g.addColorStop(i / n, c);
      }
      return g;
    }
    const m = METALS[ti];
    const off = ((fx * m.drift) % m.period + m.period) % m.period;
    const gx0 = ax - m.period + off;
    const span = Math.ceil((bx - gx0) / m.period) * m.period;
    const g = ctx.createLinearGradient(gx0, 0, gx0 + span, 0);
    const reps = span / m.period, n = m.bands.length;
    for (let k = 0; k < reps; k++) for (let j = 0; j < n; j++) g.addColorStop((k + j / n) / reps, m.bands[j]);
    g.addColorStop(1, m.bands[0]);
    return g;
  }

  // One path of rounded cells covering [xa, xb]; a cell cut short gets a square end, like a fill level.
  function cells(xa, xb) {
    ctx.beginPath();
    for (const s of segs) {
      const a = Math.max(s.a, xa), b = Math.min(s.b, xb);
      if (b - a < 0.3) continue;
      const r = Math.min(RADIUS, (b - a) / 2);
      const l = a === s.a ? r : 0, rr = b === s.b ? r : 0;
      ctx.roundRect(a, BAR_TOP, b - a, BAR_H, [l, rr, rr, l]);
    }
  }

  function layout() {
    W = el.clientWidth;
    dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    canvas.width = Math.round((W + 2 * BLEED_X) * dpr);
    canvas.height = Math.round((H + 2 * BLEED_Y) * dpr);
    segs = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      segs.push({
        a: xOf(bounds[i]) + (i > 0 ? GAP / 2 : 0),
        b: xOf(bounds[i + 1]) - (i < bounds.length - 2 ? GAP / 2 : 0),
      });
    }
    // Tier names centre on their mark, stay inside, never collide.
    place(marks.map((m) => ({ el: m.label, x: xOf(m.frac) })), 6);
    // Milestone labels: show every n-th, the smallest n at which none overlap.
    const items = ms.map((m) => ({ el: m.label, x: xOf(m.frac), w: m.label.offsetWidth }));
    let stride = 1;
    for (; stride <= Math.max(1, items.length); stride++) {
      const pick = items.filter((_, k) => (k + 1) % stride === 0);
      if (fits(pick, 10)) break;
    }
    items.forEach((it, k) => it.el.classList.toggle("is-thin", (k + 1) % stride !== 0));
    place(items.filter((_, k) => (k + 1) % stride === 0), 10);
    draw();
  }
  function fits(items, gap) {
    let right = -Infinity;
    for (const it of items) {
      const left = clamp(it.x - it.w / 2, 0, W - it.w);
      if (left < right + gap) return false;
      right = left + it.w;
    }
    return true;
  }
  function place(items, gap) {
    const boxes = items.map((it) => {
      const w = it.w ?? it.el.offsetWidth;
      return { it, w, left: clamp(it.x - w / 2, 0, W - w) };
    });
    for (let k = 1; k < boxes.length; k++) boxes[k].left = Math.max(boxes[k].left, boxes[k - 1].left + boxes[k - 1].w + gap);
    for (let k = boxes.length - 1; k >= 0; k--) {
      const lim = k === boxes.length - 1 ? W : boxes[k + 1].left - gap;
      boxes[k].left = Math.min(boxes[k].left, lim - boxes[k].w);
    }
    for (const b of boxes) b.it.el.style.left = `${Math.round(b.left)}px`;
  }

  function syncLabels() {
    for (const m of marks) m.label.classList.toggle("is-lit", tier >= m.i);
    for (const m of ms) m.label.classList.toggle("is-passed", val >= m.v);
    el.dataset.tier = tier >= 0 ? TIERS[tier].id : "none";
  }

  // Tier change: the new material sweeps out from the threshold.
  function setTier(next, animate) {
    if (next === tier) return;
    const up = next > tier;
    const prev = tier;
    tier = next;
    syncLabels();
    if (!animate || reduced) { wipe = null; return; }
    const at = marks.find((m) => m.i === (up ? next : prev));
    wipe = { from: prev, to: next, x: xOf(at ? at.frac : shown), t: 0, dur: up ? 0.85 : 1.1, up };
    if (up) buzz([14, 45, 26]);
  }

  // Milestone pulse
  function fire(m, w) {
    const ti = tierAt(m.v);
    const L = levelOf(ti);
    const x = xOf(m.frac);
    effects.push({ kind: "shock", x, t: 0, dur: 0.8, ti, w });
    effects.push({ kind: "travel", x, t: 0, dur: 0.9, ti, w });
    flash[m.k] = 0;
    kick = Math.max(kick, w);
    const n = Math.round(L.sparks * w);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.25, 1.25);
      const v = rand(0.35, 1) * L.sparkSpeed;
      const pal = ti >= 0 && ti < 3 ? METALS[ti].sparks : null;
      sparks.push({
        x: x + rand(-3, 3), y: BAR_TOP + rand(0, 3), vx: Math.cos(a) * v * 1.15, vy: Math.sin(a) * v,
        age: 0, life: rand(0.45, 0.95), size: L.sparkSize * rand(0.6, 1.25),
        col: ti < 0 ? (Math.random() < 0.5 ? [17, 17, 17] : [120, 120, 126]) : pal ? pal[(Math.random() * pal.length) | 0] : null,
        hue: hue + rand(-140, 140), hot: ti >= 0 && Math.random() < 0.3,
      });
    }
    m.label.classList.remove("is-pop");
    void m.label.offsetWidth;
    m.label.classList.add("is-pop");
    if (fx - lastBuzz > 0.06) { lastBuzz = fx; buzz(w < 1 ? 6 : 10); }
    effects = effects.slice(-14);
    sparks = sparks.slice(-320);
  }

  function spawnGlint() {
    const L = levelOf(tier);
    const xt = xOf(shown);
    const x = xt - x0() > 20 && Math.random() < 0.75 ? rand(x0(), xt) : rand(x0(), x1());
    const side = Math.random() < 0.5 ? -1 : 1;
    glints.push({
      x, y: BAR_Y + side * rand(BAR_H / 2 - 2, BAR_H / 2 + 6 + tier * 2), vx: rand(-4, 10), vy: rand(-8, -2),
      age: 0, life: rand(0.9, 2.0), size: L.glintSize * rand(0.55, 1.15), rot: rand(0, Math.PI), spin: rand(-1, 1),
      hue: rand(0, 360), ti: tier,
    });
  }

  function update(dt) {
    if (!reduced) { fx += dt; hue = (hue + 48 * dt) % 360; }
    const diff = target - shown;
    if (dragging || reduced || Math.abs(diff) * W < 0.2) shown = target;
    else shown += diff * (1 - Math.exp(-dt / 0.06));
    hover += (hoverTarget - hover) * (1 - Math.exp(-dt / 0.08));
    if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;
    kick = Math.max(0, kick - dt * 2.2);

    // Thumb trail: where the needle was over the last 90 ms.
    const xt = xOf(shown);
    if (reduced) trail = [];
    else {
      if (!trail.length || trail[trail.length - 1].x !== xt) movedAt = fx;
      trail.push({ x: xt, t: fx });
      while (trail.length && trail[0].t < fx - 0.09) trail.shift();
    }

    // Milestone pulses fire in order with a little spacing, quicker and lighter when many are waiting.
    gap -= dt;
    while (queue.length && gap <= 0) {
      const waiting = queue.length - 1;
      fire(queue.shift(), waiting > 1 ? 0.55 : waiting === 1 ? 0.8 : 1);
      gap = waiting > 2 ? 0.045 : 0.075;
    }

    for (const f of effects) f.t += dt;
    effects = effects.filter((f) => f.t < f.dur + 0.15);
    if (wipe && (wipe.t += dt) >= wipe.dur) wipe = null;
    for (let k = 0; k < flash.length; k++) if (flash[k] >= 0 && (flash[k] += dt) > 1.1) flash[k] = -1;

    for (const s of sparks) {
      s.age += dt;
      s.vy += 560 * dt;
      s.vx *= 1 - 1.4 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    sparks = sparks.filter((s) => s.age < s.life);

    if (!reduced && tier >= 0 && visible) {
      const L = levelOf(tier);
      const want = Math.max(3, Math.round((L.glints * (x1() - x0())) / 1000));
      spawnAcc += (dt * want) / 1.45;
      while (spawnAcc >= 1) { spawnAcc -= 1; if (glints.length < want * 1.4) spawnGlint(); }
    }
    for (const g of glints) { g.age += dt; g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.spin * dt; }
    glints = glints.filter((g) => g.age < g.life);
  }

  // Drawing

  function drawGauge(ti, boost) {
    const L = levelOf(ti);
    const xt = xOf(shown), xd = xDone();
    cells(x0(), x1());
    ctx.fillStyle = "#ececec";
    ctx.fill();
    if (ti < 0) {
      cells(x0(), xd);
      ctx.fillStyle = "#111";
      ctx.fill();
      cells(xd, xt);
      ctx.fillStyle = "rgba(17,17,17,.42)";
      ctx.fill();
      return;
    }
    // Unlit cells take a faint tint of the tier.
    cells(xt, x1());
    ctx.fillStyle = glowOf(ti, 0.1);
    ctx.fill();
    const mat = material(ti);
    // Lit cells, blooming.
    ctx.shadowColor = glowOf(ti, Math.min(1, L.glowA * (1 + 0.6 * boost)));
    ctx.shadowBlur = L.glow * (1 + 0.9 * boost) * dpr;
    cells(x0(), xd);
    ctx.fillStyle = mat;
    ctx.fill();
    // The cell being filled: same material, less light.
    ctx.shadowBlur = L.glow * 0.35 * dpr;
    ctx.globalAlpha = 0.72;
    cells(xd, xt);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // Depth: a specular top edge and a darker underside, then the travelling sheen.
    ctx.save();
    cells(x0(), xt);
    ctx.clip();
    const v = ctx.createLinearGradient(0, BAR_TOP, 0, BAR_BOT);
    v.addColorStop(0, "rgba(255,255,255,.75)");
    v.addColorStop(0.28, "rgba(255,255,255,.08)");
    v.addColorStop(0.6, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.fillStyle = v;
    ctx.fillRect(x0(), BAR_TOP, xt - x0(), BAR_H);
    const len = xt - x0();
    if (len > 6) {
      const cyc = len + 420;
      const sx = x0() - 210 + ((fx * L.sheen) % cyc);
      const g = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sx - 80, BAR_TOP, 160, BAR_H);
    }
    ctx.restore();
  }

  function drawWipe(boost) {
    const p = wipe.t / wipe.dur;
    const e = wipe.up ? ease(p) : 1 - Math.pow(1 - p, 2.2);
    const reach = Math.max(wipe.x - x0(), x1() - wipe.x) + 30;
    const d = e * reach;
    const top = -BLEED_Y, hgt = H + 2 * BLEED_Y;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-BLEED_X, top, wipe.x - d + BLEED_X, hgt);
    ctx.rect(wipe.x + d, top, W + BLEED_X - wipe.x - d, hgt);
    ctx.clip();
    drawGauge(wipe.from, 0);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(wipe.x - d, top, 2 * d, hgt);
    ctx.clip();
    drawGauge(wipe.to, boost);
    ctx.restore();
    if (!wipe.up) return;
    // The front: a flare of the new material's light riding the edge, brightest on the bar.
    const fade = 1 - p;
    for (const side of [-1, 1]) {
      const xf = wipe.x + side * d;
      if (xf < x0() - 30 || xf > x1() + 30) continue;
      const off = side * 60;
      ctx.save();
      ctx.translate(xf, BAR_Y);
      ctx.scale(2.6, 1);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      halo.addColorStop(0, glowOf(wipe.to, 0.6 * fade, off));
      halo.addColorStop(1, glowOf(wipe.to, 0, off));
      ctx.fillStyle = halo;
      ctx.fillRect(-22, -22, 44, 44);
      ctx.restore();
      ctx.save();
      cells(x0(), x1());
      ctx.clip();
      const w = 70;
      const g = ctx.createLinearGradient(xf - w, 0, xf + w, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(side < 0 ? 0.35 : 0.65, `rgba(255,255,255,${0.95 * fade})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(xf - w, BAR_TOP, 2 * w, BAR_H);
      ctx.restore();
    }
  }

  function drawFlashes() {
    for (const m of ms) {
      const age = flash[m.k];
      if (age < 0) continue;
      const s = segs[Math.min(m.k, segs.length - 1)];
      if (!s) continue;
      const ti = tierAt(m.v);
      const L = levelOf(ti);
      const p = age / 1.1;
      const hot = Math.pow(1 - p, 2.2);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(s.a, BAR_TOP, s.b - s.a, BAR_H, RADIUS);
      if (ti >= 0) {
        // Ignite: the cell blazes in its tier's light, blooming hard, then settles into the material.
        ctx.shadowColor = glowOf(ti, 1);
        ctx.shadowBlur = (L.glow * 2 + 14) * (1 - p) * dpr;
        ctx.fillStyle = glowOf(ti, 0.85 * hot);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.clip();
        const c = ctx.createLinearGradient(0, BAR_TOP, 0, BAR_BOT);
        c.addColorStop(0, "rgba(255,255,255,0)");
        c.addColorStop(0.45, `rgba(255,255,255,${0.95 * hot})`);
        c.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = c;
        ctx.fillRect(s.a, BAR_TOP, s.b - s.a, BAR_H);
      } else {
        // Below Bronze: one glint runs across the freshly inked cell.
        ctx.clip();
        const gx = s.a + (s.b - s.a + 60) * ease(Math.min(1, p * 1.8)) - 30;
        const c = ctx.createLinearGradient(gx - 30, 0, gx + 30, 0);
        c.addColorStop(0, "rgba(255,255,255,0)");
        c.addColorStop(0.5, `rgba(255,255,255,${0.7 * (1 - p)})`);
        c.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = c;
        ctx.fillRect(gx - 30, BAR_TOP, 60, BAR_H);
      }
      ctx.restore();
      ctx.save();
      // An outline that lifts off the cell as it settles.
      const g = 1 + 5 * ease(p);
      ctx.beginPath();
      ctx.roundRect(s.a - g, BAR_TOP - g, s.b - s.a + 2 * g, BAR_H + 2 * g, RADIUS + g);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = deepOf(ti, (ti < 0 ? 0.35 : 0.7) * (1 - p));
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMarks() {
    for (const m of marks) {
      const x = Math.round(xOf(m.frac) * dpr) / dpr;
      const lit = tier >= m.i;
      ctx.fillStyle = lit ? deepOf(m.i, 1) : "#c4c4c8";
      ctx.fillRect(x - (lit ? 0.75 : 0.5), BAR_TOP - 9, lit ? 1.5 : 1, 6);
    }
    for (const m of ms) {
      const x = Math.round(xOf(m.frac) * dpr) / dpr;
      ctx.fillStyle = val >= m.v ? (tier >= 0 ? deepOf(tier, 0.9) : "#111") : "#c9c9cd";
      ctx.fillRect(x - 0.5, BAR_BOT + 3, 1, 4);
    }
  }

  function drawShock(f) {
    const L = levelOf(f.ti);
    const p = f.t / f.dur;
    if (p >= 1) return;
    const R = L.shock * (0.55 + 0.45 * f.w);
    if (p < 0.3) {
      const q = 1 - p / 0.3;
      const r = R * 0.8;
      const g = ctx.createRadialGradient(f.x, BAR_Y, 0, f.x, BAR_Y, r);
      g.addColorStop(0, f.ti < 0 ? `rgba(17,17,17,${0.12 * q})` : `rgba(255,255,255,${0.9 * q})`);
      g.addColorStop(0.35, glowOf(f.ti, 0.6 * q * f.w));
      g.addColorStop(1, glowOf(f.ti, 0));
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, BAR_Y - r, 2 * r, 2 * r);
    }
    const rings = f.ti >= 2 ? [0, 0.1] : [0];
    for (const delay of rings) {
      const pp = (f.t - delay) / f.dur;
      if (pp <= 0 || pp >= 1) continue;
      const rx = 4 + R * ease(pp) * (delay ? 0.72 : 1);
      ctx.beginPath();
      ctx.ellipse(f.x, BAR_Y, rx, rx * 0.62, 0, 0, Math.PI * 2);
      ctx.lineWidth = (1.4 + (f.ti + 1) * 0.55) * (1 - pp) * (delay ? 0.6 : 1) + 0.3;
      ctx.strokeStyle = deepOf(f.ti, (f.ti < 0 ? 0.45 : 0.95) * (1 - pp), delay ? 90 : 0);
      if (f.ti >= 1) { ctx.shadowColor = glowOf(f.ti, 0.8 * (1 - pp)); ctx.shadowBlur = 8 * dpr; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawTravel(f) {
    const L = levelOf(f.ti);
    const p = f.t / f.dur;
    if (p >= 1) return;
    const fade = Math.pow(1 - p, 1.3) * (0.55 + 0.45 * f.w);
    const d = ease(p) * L.travel * (0.6 + 0.4 * f.w);
    ctx.save();
    cells(x0(), x1());
    ctx.clip();
    for (const side of [-1, 1]) {
      const xf = f.x + side * d;
      const w = 24 + 40 * ease(p);
      let g = ctx.createLinearGradient(xf - w, 0, xf + w, 0);
      g.addColorStop(0, glowOf(f.ti, 0, side * 50));
      g.addColorStop(0.5, glowOf(f.ti, (f.ti < 0 ? 0.9 : 1) * fade, side * 50));
      g.addColorStop(1, glowOf(f.ti, 0, side * 50));
      ctx.fillStyle = g;
      ctx.fillRect(xf - w, BAR_TOP, 2 * w, BAR_H);
      if (f.ti >= 0) {
        g = ctx.createLinearGradient(xf - w * 0.45, 0, xf + w * 0.45, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, `rgba(255,255,255,${0.95 * fade})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(xf - w * 0.45, BAR_TOP + 2, w * 0.9, BAR_H - 4);
      }
    }
    ctx.restore();
    if (f.ti < 0) return;
    // Soft halo outside the bar, so the burst reads as light rather than paint.
    for (const side of [-1, 1]) {
      const xf = f.x + side * d;
      ctx.save();
      ctx.translate(xf, BAR_Y);
      ctx.scale(3.2, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, glowOf(f.ti, 0.32 * fade, side * 50));
      g.addColorStop(1, glowOf(f.ti, 0, side * 50));
      ctx.fillStyle = g;
      ctx.fillRect(-16, -16, 32, 32);
      ctx.restore();
    }
  }

  function drawSpark(s) {
    const p = s.age / s.life;
    const a = Math.pow(1 - p, 1.2);
    const col = (alpha) => (s.col ? rgb(s.col, alpha) : `hsla(${s.hue % 360},92%,60%,${alpha})`);
    const tl = 0.05;
    const tx = s.x - s.vx * tl, ty = s.y - s.vy * tl;
    const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
    g.addColorStop(0, col(0));
    g.addColorStop(1, col(a));
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(s.x, s.y);
    ctx.lineWidth = s.size * (1 - 0.4 * p);
    ctx.strokeStyle = g;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = s.hot ? `rgba(255,255,255,${a})` : col(a);
    ctx.fill();
  }

  function drawGlint(g) {
    const p = g.age / g.life;
    const k = Math.pow(Math.sin(Math.PI * p), 1.5);
    const r = g.size * k;
    if (r < 0.3) return;
    const tint = (a) => (g.ti === 3 ? `hsla(${g.hue},90%,60%,${a})` : rgb(METALS[g.ti].glow, a));
    ctx.save();
    ctx.translate(g.x, g.y);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
    halo.addColorStop(0, tint(0.35 * k));
    halo.addColorStop(1, tint(0));
    ctx.fillStyle = halo;
    ctx.fillRect(-r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
    ctx.rotate(g.rot);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.26 : r;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = g.ti === 3 ? `hsla(${g.hue},85%,55%,${0.5 + 0.5 * k})` : rgb(METALS[g.ti].deep, 0.5 + 0.5 * k);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
  }

  function drawNeedle() {
    const xt = xOf(shown);
    const L = levelOf(tier);
    // Light trail when the needle moves fast.
    if (!reduced && trail.length > 1) {
      const from = trail[0].x;
      const dx = xt - from;
      if (Math.abs(dx) > 10) {
        const g = ctx.createLinearGradient(from, 0, xt, 0);
        g.addColorStop(0, glowOf(tier, 0));
        g.addColorStop(1, glowOf(tier, tier < 0 ? 0.5 : 0.8));
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(from, xt), BAR_TOP - 3, Math.abs(dx), BAR_H + 6);
        if (tier >= 0) {
          const c = ctx.createLinearGradient(from, 0, xt, 0);
          c.addColorStop(0, "rgba(255,255,255,0)");
          c.addColorStop(1, "rgba(255,255,255,.9)");
          ctx.fillStyle = c;
          ctx.fillRect(Math.min(from, xt), BAR_Y - 1, Math.abs(dx), 2);
        }
      }
    }
    if (tier >= 0) {
      ctx.save();
      ctx.translate(xt, BAR_Y);
      ctx.scale(1, 1.5);
      const r = 14 + L.glow * 0.5 + 8 * kick;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, glowOf(tier, Math.min(1, L.glowA + 0.3 * kick)));
      g.addColorStop(1, glowOf(tier, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
    }
    // On a touch screen the needle is a handle: wider and taller, so it reads as something to grab.
    const w = touch ? 7 + 2 * hover : 3 + 1.2 * hover;
    const h = BAR_H + (touch ? 22 : 16) + 4 * hover;
    ctx.beginPath();
    ctx.roundRect(xt - w / 2 - 1.5, BAR_Y - h / 2 - 1.5, w + 3, h + 3, (w + 3) / 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(xt - w / 2, BAR_Y - h / 2, w, h, w / 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    if (tier >= 0) {
      // A lit filament down the needle.
      ctx.fillStyle = glowOf(tier, 1);
      ctx.fillRect(xt - 0.5, BAR_Y - h / 2 + 3, 1, h - 6);
    }
    if (focusRing) {
      ctx.beginPath();
      ctx.roundRect(xt - w / 2 - 4.5, BAR_Y - h / 2 - 4.5, w + 9, h + 9, (w + 9) / 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#111";
      ctx.stroke();
    }
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, BLEED_X * dpr, BLEED_Y * dpr);
    ctx.clearRect(-BLEED_X, -BLEED_Y, W + 2 * BLEED_X, H + 2 * BLEED_Y);
    if (wipe) drawWipe(kick);
    else drawGauge(tier, kick);
    drawFlashes();
    drawMarks();
    for (const f of effects) if (f.kind === "travel") drawTravel(f);
    for (const g of glints) drawGlint(g);
    ctx.lineCap = "round";
    for (const s of sparks) drawSpark(s);
    ctx.lineCap = "butt";
    for (const f of effects) if (f.kind === "shock") drawShock(f);
    drawNeedle();
    placePill();
  }

  function placePill() {
    // At either end the grip stays mostly over the track, so the finger lands inside the screen.
    if (grip) grip.style.transform = `translateX(${clamp(xOf(target) - GRIP / 2, -10, W - GRIP + 10).toFixed(1)}px)`;
    if (!pill) return;
    const xt = xOf(shown);
    const w = pill.offsetWidth;
    const left = clamp(xt - w / 2, 0, W - w);
    pill.style.transform = `translateX(${left.toFixed(1)}px)`;
    pill.style.setProperty("--caret", `${clamp(xt - left, 7, w - 7).toFixed(1)}px`);
    // Tier names step aside for the pill.
    for (const m of marks) {
      const a = m.label.offsetLeft, b = a + m.label.offsetWidth;
      m.label.classList.toggle("is-covered", b > left - 6 && a < left + w + 6);
    }
  }

  // Loop: runs while something moves, or while a tier is live on screen; idle otherwise.
  function busy() {
    if (!visible || !W) return false;
    if (effects.length || sparks.length || glints.length || queue.length || wipe) return true;
    if (flash.some((a) => a >= 0)) return true;
    if (shown !== target || hover !== hoverTarget || kick > 0) return true;
    if (!reduced && fx - movedAt < 0.12) return true;
    return tier >= 0 && !reduced;
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw();
    if (busy()) raf = requestAnimationFrame(frame);
  }
  function kickLoop() {
    if (raf) return;
    if (!busy()) { draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function apply(v, fromUser) {
    const prev = val;
    val = v;
    target = v / max;
    if (!fromUser) shown = target;
    input.setAttribute("aria-valuetext", text(v));
    morph?.update(thumbLabel(v));
    if (fromUser && v > prev) {
      const crossed = ms.filter((m) => m.v > prev && m.v <= v);
      if (reduced) { if (crossed.length) buzz(10); }
      else queue.push(...crossed);
    }
    queue = queue.filter((m) => m.v <= v).slice(-8);
    setTier(tierAt(v), fromUser);
    syncLabels();
    kickLoop();
  }

  // Events
  const onInputEvt = () => {
    const v = +input.value;
    apply(v, true);
    onInput?.(v);
  };
  const onDown = () => { dragging = true; hoverTarget = 1; focusRing = false; kickLoop(); };
  const onUp = () => {
    if (!dragging) return;
    dragging = false; hoverTarget = input.matches(":hover") ? 1 : 0;
    if (missed !== null) { vibrate(missed); missed = null; }
    kickLoop();
  };
  const onEnter = () => { hoverTarget = 1; kickLoop(); };
  const onLeave = () => { if (!dragging) { hoverTarget = 0; kickLoop(); } };
  const onFocus = () => { focusRing = input.matches(":focus-visible"); draw(); };
  const onBlur = () => { focusRing = false; draw(); };
  const onKey = () => { if (!focusRing) { focusRing = true; draw(); } };
  const reset = () => {
    effects = []; sparks = []; glints = []; queue = []; wipe = null; kick = 0;
    flash.fill(-1);
    shown = target;
  };
  const onMotion = () => {
    reduced = !!reducedQuery?.matches;
    if (reduced) reset();
    kickLoop();
  };

  // The grip drags like the native thumb: sideways moves pick the nearest stop, and a vertical
  // swipe that starts on it still scrolls the page (touch-action: pan-y cancels the drag).
  const onGripDown = (e) => { grip.setPointerCapture(e.pointerId); onDown(); };
  const onGripMove = (e) => {
    if (!grip.hasPointerCapture(e.pointerId)) return;
    const f = clamp((e.clientX - el.getBoundingClientRect().left - PAD) / (W - 2 * PAD), 0, 1);
    const v = clamp(Math.round((f * max) / step) * step, 0, max);
    if (v !== +input.value) { input.value = String(v); onInputEvt(); }
  };
  grip?.addEventListener("pointerdown", onGripDown);
  grip?.addEventListener("pointermove", onGripMove);
  input.addEventListener("input", onInputEvt);
  input.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  input.addEventListener("pointerenter", onEnter);
  input.addEventListener("pointerleave", onLeave);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKey);
  reducedQuery?.addEventListener?.("change", onMotion);

  const ro = new ResizeObserver(() => layout());
  ro.observe(el);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) reset();
    kickLoop();
  });
  io.observe(el);

  input.setAttribute("aria-valuetext", text(val));
  syncLabels();
  layout();
  kickLoop();
  document.fonts?.ready.then(() => { if (el.isConnected) layout(); });

  return {
    el,
    get value() { return +input.value; },
    set(v) {
      input.value = String(clamp(v, 0, max));
      queue = [];
      wipe = null;
      apply(+input.value, false);
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      input.removeEventListener("input", onInputEvt);
      input.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      input.removeEventListener("pointerenter", onEnter);
      input.removeEventListener("pointerleave", onLeave);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKey);
      reducedQuery?.removeEventListener?.("change", onMotion);
      morph?.destroy();
      el.remove();
    },
  };
}
