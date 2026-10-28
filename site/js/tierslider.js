// A full-width slider whose track takes on the sponsorship tier's material as the amount
// crosses each threshold. A native <input type="range"> sits on top (transparent) so pointer,
// touch, keyboard and screen readers all work; a canvas underneath draws the track, the tier
// ticks, the glints and the crossing pulse. The tick labels are HTML so they stay crisp.

import { TIERS, tierFor, money } from "./catalog.js";

const PAD = 6;                       // thumb radius; the native thumb is 2 * PAD wide so both map value to x alike
const LABEL_H = 16;
const INPUT_H = 32;
const TRACK_Y = LABEL_H + INPUT_H / 2;
const BLEED = 20;                    // canvas overhang above and below, room for rings and sparks
const DPR_CAP = 2;
const ease = (t) => 1 - Math.pow(1 - t, 4);   // close to cubic-bezier(.23, 1, .32, 1)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Track materials. `bands` repeat along the track every `period` px and drift at `drift` px/s;
// `edge` outlines the filled part so pale stops still read on white; `rgb` colours glints and the pulse.
const METALS = [
  { bands: ["#6b3518", "#a8612f", "#dd9c6a", "#f2c9a4", "#b46e3a", "#7d421d"], edge: "#5e2f15", rgb: [184, 108, 52], period: 260, drift: 9 },
  { bands: ["#737b84", "#a3acb6", "#d9dee3", "#f1f3f5", "#a7b0b9", "#7b838c"], edge: "#5f666e", rgb: [118, 130, 144], period: 240, drift: 14 },
  { bands: ["#7d5609", "#c18f1f", "#ecc552", "#fbe7a1", "#d4a12a", "#8c630f"], edge: "#6a4706", rgb: [205, 152, 24], period: 220, drift: 20 },
  null, // Title: iridescent, built per frame from the running hue
];
const TITLE = { period: 420, edge: "rgba(40,40,60,.35)", spin: 36 };

// How much lives on the track at each tier: glints per 1000 px of track, a floor, their size,
// how far they stray from the line, how fast they twinkle, and the line thicknesses.
const ENERGY = [
  { per: 5, min: 3, size: 3, spread: 6, speed: 0.75, fill: 3, rest: 1.5 },
  { per: 9, min: 5, size: 3.3, spread: 8, speed: 0.9, fill: 3.5, rest: 1.5 },
  { per: 14, min: 8, size: 3.6, spread: 10, speed: 1.05, fill: 4, rest: 2 },
  { per: 22, min: 12, size: 4, spread: 12, speed: 1.2, fill: 4.5, rest: 2 },
];

const reducedQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

export function tierSlider(host, { label, max, step = 1, value = 0, amountOf = (v) => v, onInput, valueText } = {}) {
  const tierAt = (v) => TIERS.indexOf(tierFor(amountOf(v)));
  const text = valueText ?? ((v) => {
    const t = tierFor(amountOf(v));
    return money(amountOf(v)) + (t ? `, ${t.name}` : "");
  });

  // The first step at which each tier is reached; tiers out of range get no tick.
  const decimals = (String(step).split(".")[1] ?? "").length;
  const steps = Math.floor(max / step + 1e-9);
  const atStep = (k) => +(k * step).toFixed(decimals);
  const ticks = [];
  TIERS.forEach((t, i) => {
    if (amountOf(max) < t.min) return;
    let lo = 0, hi = steps;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (amountOf(atStep(mid)) >= t.min) hi = mid; else lo = mid + 1;
    }
    ticks.push({ i, tier: t, value: atStep(lo), frac: atStep(lo) / max, flare: 0 });
  });

  // DOM
  const el = document.createElement("div");
  el.className = "tslider";
  const marks = document.createElement("div");
  marks.className = "tslider-marks";
  marks.setAttribute("aria-hidden", "true");
  for (const t of ticks) {
    const s = document.createElement("span");
    s.className = "tslider-label";
    s.dataset.tier = t.tier.id;
    s.dataset.name = t.tier.name;
    s.textContent = t.tier.name;
    s.addEventListener("animationend", () => s.classList.remove("is-flare"));
    t.label = s;
    marks.append(s);
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
  el.append(marks, canvas, input);
  host.append(el);
  const ctx = canvas.getContext("2d");

  // State
  let W = 0, dpr = 1;
  let reduced = !!reducedQuery?.matches;
  let visible = true;
  let tier = tierAt(+input.value);
  let fromTier = tier, mix = 1, mixDur = 0.5;
  let target = +input.value / max, shown = target;
  let dragging = false, hoverTarget = 0, hover = 0, focusRing = false;
  let hue = 200, clock = 0, spawnAcc = 0;
  let effects = [];   // { kind: "sweep" | "ring", t, dur, x, tier }
  let sparks = [];    // glints (ambient) and burst sparks
  let raf = 0, last = 0;

  const x0 = () => PAD;
  const x1 = () => W - PAD;
  const xOf = (f) => PAD + f * (W - 2 * PAD);

  // Colour helpers. For Title the colour depends on the hue and a position offset.
  const rgba = (ti, a, off = 0) => {
    if (ti === 3) return `hsla(${(hue + off) % 360}, 82%, 58%, ${a})`;
    const [r, g, b] = METALS[ti].rgb;
    return `rgba(${r},${g},${b},${a})`;
  };
  function material(ti, ax, bx) {
    const iri = ti === 3;
    const m = iri ? null : METALS[ti];
    const period = iri ? TITLE.period : m.period;
    const n = iri ? 6 : m.bands.length;
    const off = iri ? 0 : ((clock * m.drift) % period + period) % period;
    const gx0 = ax - period + off;
    const span = Math.ceil((bx - gx0) / period) * period;
    const g = ctx.createLinearGradient(gx0, 0, gx0 + span, 0);
    const reps = span / period;
    for (let k = 0; k < reps; k++) {
      for (let j = 0; j < n; j++) {
        const c = iri ? `hsl(${(hue + j * 60) % 360}, 72%, 62%)` : m.bands[j];
        g.addColorStop((k + j / n) / reps, c);
      }
    }
    g.addColorStop(1, iri ? `hsl(${hue % 360}, 72%, 62%)` : m.bands[0]);
    return g;
  }

  function layout() {
    W = el.clientWidth;
    dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    const h = LABEL_H + INPUT_H + 2 * BLEED;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(h * dpr);
    // Labels centre on their tick, stay inside the box and don't collide.
    const boxes = ticks.map((t) => {
      const w = t.label.offsetWidth;
      return { t, w, left: clamp(xOf(t.frac) - w / 2, 0, W - w) };
    });
    for (let k = 1; k < boxes.length; k++) {
      const p = boxes[k - 1];
      boxes[k].left = Math.max(boxes[k].left, p.left + p.w + 6);
    }
    for (let k = boxes.length - 1; k >= 0; k--) {
      const lim = k === boxes.length - 1 ? W : boxes[k + 1].left - 6;
      boxes[k].left = Math.min(boxes[k].left, lim - boxes[k].w);
    }
    for (const b of boxes) b.t.label.style.left = `${Math.round(b.left)}px`;
    draw();
  }

  function syncLabels() {
    for (const t of ticks) t.label.classList.toggle("is-lit", tier >= t.i);
    el.dataset.tier = tier >= 0 ? TIERS[tier].id : "none";
  }

  function setTier(next, celebrate) {
    if (next === tier) return;
    const prev = tier;
    fromTier = tier;
    tier = next;
    mix = reduced ? 1 : 0;
    mixDur = next > prev ? 0.28 : 0.6;
    syncLabels();
    if (!(celebrate && next > prev)) return;
    // Chrome refuses (and logs an error) before the page has had a user gesture.
    if (navigator.userActivation?.hasBeenActive ?? true) {
      try { navigator.vibrate?.(12); } catch {}
    }
    if (reduced) return;
    for (const t of ticks) {
      if (t.i <= prev || t.i > next) continue;
      t.flare = 1e-6;
      t.label.classList.remove("is-flare");
      void t.label.offsetWidth;
      t.label.classList.add("is-flare");
    }
    const origin = ticks.find((t) => t.i === next) ?? ticks[ticks.length - 1];
    const ox = xOf(origin.frac);
    effects.push({ kind: "sweep", t: 0, dur: 0.95, x: ox, tier: next });
    effects.push({ kind: "ring", t: 0, dur: 0.65, tier: next });
    burst(ox, next);
    // Scrubbing back and forth over a threshold shouldn't pile up effects.
    effects = effects.slice(-6);
    sparks = sparks.slice(-160);
  }

  function burst(x, ti) {
    const n = 7 + ti * 3;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const v = 40 + Math.random() * (110 + ti * 30);
      sparks.push({
        x, y: TRACK_Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6,
        age: 0, life: 0.55 + Math.random() * 0.45, size: 2 + Math.random() * (1.4 + ti * 0.4),
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 6, tier: ti, hue: Math.random() * 360, burst: true,
      });
    }
  }

  function spawnGlint() {
    const e = ENERGY[tier];
    const xt = xOf(shown);
    const onFill = xt - x0() > 16 && Math.random() < 0.65;
    const x = onFill ? x0() + Math.random() * (xt - x0()) : x0() + Math.random() * (x1() - x0());
    sparks.push({
      x, y: TRACK_Y + (Math.random() * 2 - 1) * e.spread,
      vx: (Math.random() * 2 - 0.5) * 7 * e.speed, vy: -(1 + Math.random() * 5) * e.speed,
      age: 0, life: (0.9 + Math.random() * 1.1) / e.speed, size: e.size * (0.6 + Math.random() * 0.6),
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 1.2 * e.speed, tier, hue: Math.random() * 360, burst: false,
    });
  }

  function update(dt) {
    clock += dt;
    if (!reduced) hue = (hue + TITLE.spin * dt) % 360;
    if (mix < 1) mix = Math.min(1, mix + dt / mixDur);

    const diff = target - shown;
    if (dragging || reduced || Math.abs(diff) * W < 0.2) shown = target;
    else shown += diff * (1 - Math.exp(-dt / 0.055));
    hover += (hoverTarget - hover) * (1 - Math.exp(-dt / 0.08));
    if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;

    for (const f of effects) f.t += dt;
    effects = effects.filter((f) => f.t < f.dur);
    for (const t of ticks) if (t.flare > 0) { t.flare += dt; if (t.flare > 0.75) t.flare = 0; }

    if (!reduced && tier >= 0 && visible) {
      const e = ENERGY[tier];
      const want = Math.max(e.min, Math.round((e.per * (x1() - x0())) / 1000));
      const life = 1.45 / e.speed;
      spawnAcc += (dt * want) / life;
      const ambient = sparks.reduce((n, s) => n + !s.burst, 0);
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        if (ambient < want * 1.4) spawnGlint();
      }
    }
    for (const s of sparks) {
      s.age += dt;
      if (s.burst) { s.vy += 140 * dt; s.vx *= 1 - 1.8 * dt; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
    }
    sparks = sparks.filter((s) => s.age < s.life);
  }

  // Drawing

  function line(xa, xb, width, style) {
    if (xb - xa < 0.01) return;
    ctx.beginPath();
    ctx.moveTo(xa, TRACK_Y);
    ctx.lineTo(xb, TRACK_Y);
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  function drawTrack(ti, alpha, pulse) {
    const xt = xOf(shown);
    ctx.globalAlpha = alpha;
    if (ti < 0) {
      ctx.save();
      ctx.translate(0, dpr === 1 ? 0.5 : 0);
      line(x0(), x1(), 1, "#dcdcdc");
      line(x0(), xt, 1.5, "#9a9a9e");
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const e = ENERGY[ti];
    const mat = material(ti, x0(), x1());
    line(x0(), x1(), 1, "#dcdcdc");
    ctx.globalAlpha = alpha * (0.5 + 0.35 * pulse);
    line(x0(), x1(), e.rest + 1.5 * pulse, mat);
    ctx.globalAlpha = alpha;
    const fw = e.fill + 2.2 * pulse;
    line(x0(), xt, fw + 1, ti === 3 ? TITLE.edge : METALS[ti].edge);
    line(x0(), xt, fw, mat);
    ctx.globalAlpha = 1;
  }

  function drawTicks() {
    for (const t of ticks) {
      const x = Math.round(xOf(t.frac) * dpr) / dpr + (dpr === 1 ? 0.5 : 0);
      const lit = tier >= t.i;
      let k = 0;
      if (t.flare > 0) {
        const p = t.flare / 0.75;
        k = p < 0.18 ? ease(p / 0.18) : 1 - ease((p - 0.18) / 0.82);
      }
      const half = (lit ? 6 : 5) + 9 * k;
      ctx.beginPath();
      ctx.moveTo(x, TRACK_Y - half);
      ctx.lineTo(x, TRACK_Y + half * (lit ? 0.75 : 1));
      ctx.lineWidth = (lit ? 1.5 : 1) + 1.2 * k;
      ctx.lineCap = "butt";
      if (lit) {
        ctx.strokeStyle = t.i === 3 ? `hsl(${hue % 360}, 78%, 52%)` : METALS[t.i].edge;
        if (k > 0) { ctx.shadowColor = rgba(t.i, 0.8); ctx.shadowBlur = 10 * k; }
      } else ctx.strokeStyle = "#c9c9cd";
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (k > 0) {
        ctx.beginPath();
        ctx.arc(x, TRACK_Y, 3 + 16 * (t.flare / 0.75), 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(t.i, 0.55 * (1 - t.flare / 0.75));
        ctx.stroke();
      }
    }
    ctx.lineCap = "round";
  }

  function drawSweep(f) {
    const p = f.t / f.dur;
    const e = ease(p);
    const fade = 1 - p;
    const reach = Math.max(f.x - x0(), x1() - f.x) + 40;
    const d = e * reach;
    for (const side of [-1, 1]) {
      const xf = f.x + side * d;
      if (xf < x0() - 60 || xf > x1() + 60) continue;
      const w = 46 + 60 * e;
      // Wide soft halo: a radial glow squashed into an ellipse along the track
      const hh = 6 + 10 * fade;
      ctx.save();
      ctx.translate(xf, TRACK_Y);
      ctx.scale((w * 1.5) / hh, 1);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, hh);
      g.addColorStop(0, rgba(f.tier, 0.2 * fade, side * 40));
      g.addColorStop(1, rgba(f.tier, 0, side * 40));
      ctx.fillStyle = g;
      ctx.fillRect(-hh, -hh, hh * 2, hh * 2);
      ctx.restore();
      // The bright band riding the track
      g = ctx.createLinearGradient(xf - w, 0, xf + w, 0);
      g.addColorStop(0, rgba(f.tier, 0, side * 40));
      g.addColorStop(0.5, rgba(f.tier, 0.95 * fade, side * 40));
      g.addColorStop(1, rgba(f.tier, 0, side * 40));
      ctx.fillStyle = g;
      const bh = 2.5 + 5 * fade;
      ctx.beginPath();
      ctx.roundRect(xf - w, TRACK_Y - bh / 2, w * 2, bh, bh / 2);
      ctx.fill();
      // Specular core
      g = ctx.createLinearGradient(xf - w * 0.5, 0, xf + w * 0.5, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${0.9 * fade})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(xf - w * 0.5, TRACK_Y - 0.6, w, 1.2);
    }
    // Flash at the threshold point
    const r = 3 + 22 * e;
    const rg = ctx.createRadialGradient(f.x, TRACK_Y, 0, f.x, TRACK_Y, r);
    rg.addColorStop(0, rgba(f.tier, 0.5 * fade * fade));
    rg.addColorStop(1, rgba(f.tier, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(f.x - r, TRACK_Y - r, r * 2, r * 2);
  }

  function drawRing(f, xt) {
    const p = f.t / f.dur;
    ctx.beginPath();
    ctx.arc(xt, TRACK_Y, PAD + 2 + 20 * ease(p), 0, Math.PI * 2);
    ctx.lineWidth = 0.6 + 1.6 * (1 - p);
    ctx.strokeStyle = rgba(f.tier, 0.85 * (1 - p));
    ctx.stroke();
  }

  function drawSpark(s) {
    const p = s.age / s.life;
    const k = s.burst ? 1 - ease(p) : Math.pow(Math.sin(Math.PI * p), 1.6);
    const r = s.size * (s.burst ? 0.6 + 0.4 * k : k);
    if (r < 0.25) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.globalAlpha = s.burst ? k : 0.4 + 0.6 * k;
    const tint = (a) => (s.tier === 3 ? `hsla(${s.hue}, 85%, 58%, ${a})` : rgba(s.tier, a));
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    halo.addColorStop(0, tint(0.28));
    halo.addColorStop(1, tint(0));
    ctx.fillStyle = halo;
    ctx.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
    ctx.fillStyle = tint(1);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.3 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    if (r > 1.6) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, LABEL_H + INPUT_H + 2 * BLEED);
    ctx.translate(0, BLEED);
    ctx.lineCap = "round";

    const xt = xOf(shown);
    let pulse = 0;
    for (const f of effects) if (f.kind === "sweep") pulse = Math.max(pulse, Math.pow(1 - f.t / f.dur, 3));

    const m = ease(mix);
    drawTrack(tier, 1, pulse);
    if (m < 1 && fromTier !== tier) drawTrack(fromTier, 1 - m, 0);

    drawTicks();
    for (const f of effects) if (f.kind === "sweep") drawSweep(f);
    for (const s of sparks) drawSpark(s);
    ctx.globalAlpha = 1;

    // Thumb: an ink dot with a white collar so it sits cleanly on a thick metal line.
    const r = PAD * (1 + 0.17 * hover);
    ctx.beginPath();
    ctx.arc(xt, TRACK_Y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xt, TRACK_Y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    for (const f of effects) if (f.kind === "ring") drawRing(f, xt);
    if (focusRing) {
      ctx.beginPath();
      ctx.arc(xt, TRACK_Y, r + 4.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#111";
      ctx.stroke();
    }
  }

  // Loop: runs while something moves, or while a tier is live on screen; idle otherwise.
  function busy() {
    if (!visible || !W) return false;
    if (effects.length || sparks.length || mix < 1) return true;
    if (shown !== target || hover !== hoverTarget) return true;
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
  function kick() {
    if (raf) return;
    if (!busy()) { draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function apply(v, fromUser) {
    target = v / max;
    if (!fromUser) shown = target;
    input.setAttribute("aria-valuetext", text(v));
    setTier(tierAt(v), fromUser);
    kick();
  }

  // Events
  const onInputEvt = () => {
    const v = +input.value;
    apply(v, true);
    onInput?.(v);
  };
  const onDown = () => { dragging = true; hoverTarget = 1; focusRing = false; kick(); };
  const onUp = () => { if (!dragging) return; dragging = false; hoverTarget = input.matches(":hover") ? 1 : 0; kick(); };
  const onEnter = () => { hoverTarget = 1; kick(); };
  const onLeave = () => { if (!dragging) { hoverTarget = 0; kick(); } };
  const onFocus = () => { focusRing = input.matches(":focus-visible"); kick(); draw(); };
  const onBlur = () => { focusRing = false; draw(); };
  const onKey = () => { if (!focusRing) { focusRing = true; draw(); } };
  const onMotion = () => {
    reduced = !!reducedQuery?.matches;
    if (reduced) { effects = []; sparks = []; mix = 1; shown = target; }
    kick();
  };

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
    if (!visible) { effects = []; sparks = []; mix = 1; shown = target; for (const t of ticks) t.flare = 0; }
    kick();
  });
  io.observe(el);

  input.setAttribute("aria-valuetext", text(+input.value));
  syncLabels();
  layout();
  kick();
  document.fonts?.ready.then(() => { if (el.isConnected) layout(); });

  return {
    el,
    get value() { return +input.value; },
    set(v) {
      input.value = String(clamp(v, 0, max));
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
      el.remove();
    },
  };
}
