import { BUNDLES, TIERS, BUDGET, TRAVEL, tierFor, priceOf, totalOf, money } from "./catalog.js";
import { loadPart, Figure, View } from "./stage.js";

const $ = (s, el = document) => el.querySelector(s);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = matchMedia("(hover: hover)").matches;
const partUrl = (id) => `parts/${id}.bin`;
const robot = BUNDLES.filter((b) => b.section === "robot");
const byId = new Map(BUNDLES.map((b) => [b.id, b]));
const isAdopted = (b) => !!b.adopted;

// Every part is drawn at the same optical size: its visual mass (area-weighted spread,
// as the camera sees it) takes this fraction of the cell width, like a row of products
// photographed to read the same size.
const VISUAL = 0.165;

// ------------------------------------------------------------------ crate state
const STORE = "rift-crate-v2";
const crate = new Set(read().filter((k) => byId.has(k) && !isAdopted(byId.get(k))));
function read() { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify([...crate])); } catch {} }
const crateTotal = () => [...crate].reduce((s, k) => s + priceOf(byId.get(k)), 0);

// ------------------------------------------------------------------ motion
// Each live figure eases toward its targets; the loop sleeps when nothing moves.
const live = new Set();
let raf = 0, last = 0;
function kick(s) { live.add(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const s of live) if (!step(s, dt)) live.delete(s);
  raf = live.size ? requestAnimationFrame(loop) : 0;
}
const follow = (x, target, rate, dt) => target + (x - target) * Math.exp(-rate * dt);

function step(s, dt) {
  const { view, figure } = s;
  if (s.drift) s.spinTarget += s.drift * dt;
  const w = 4.6; // critically damped spring toward spinTarget
  s.spinVel += (-w * w * (view.spin - s.spinTarget) - 2 * w * s.spinVel) * dt;
  view.spin += s.spinVel * dt;
  view.azimuth = follow(view.azimuth, s.azTarget, 6, dt);
  s.motion = follow(s.motion, s.motionTarget, 3, dt);
  const turning = figure.tick(dt, s.motion);
  view.paint();
  const still = !s.drift && Math.abs(view.spin - s.spinTarget) < 0.05 && Math.abs(s.spinVel) < 0.05 &&
    Math.abs(view.azimuth - s.azTarget) < 0.02 && Math.abs(s.motion - s.motionTarget) < 0.002;
  return !still || (turning && s.motion > 0.002);
}

function liveFigure(canvas, data, opts) {
  const figure = new Figure(data);
  const view = new View(canvas, figure, opts);
  return { view, figure, azBase: view.azimuth, spinTarget: view.spin, spinVel: 0, azTarget: view.azimuth, motion: 0, motionTarget: 0, drift: 0 };
}

// ------------------------------------------------------------------ grid
const grid = $("#grid");
const cells = new Map();

robot.forEach((b, i) => {
  const li = document.createElement("li");
  li.className = "cell";
  li.style.setProperty("--d", `${(i % 5) * 70}ms`);
  li.style.setProperty("--bob", `${6.4 + ((i * 37) % 17) / 10}s`);
  li.style.setProperty("--bob-at", `${-((i * 53) % 29) / 10}s`);
  li.innerHTML = `
    <button class="hit" type="button" aria-label="${b.name}, ${isAdopted(b) ? "adopted" : money(priceOf(b))}">
      <div class="fig"><div class="halo"></div><div class="float"><canvas aria-hidden="true"></canvas></div></div>
      <div class="cap"><span class="code">${b.code}</span><span class="price">${isAdopted(b) ? "Adopted" : money(priceOf(b))}</span></div>
    </button>`;
  grid.append(li);
  const cell = { el: li, b, s: null };
  cells.set(b.id, cell);
  const hit = li.querySelector(".hit");
  hit.addEventListener("click", () => openView(b.id));
  const focus = (on) => {
    const s = cell.s; if (!s || reduced) return;
    if (on) s.spinTarget = Math.round(s.view.spin / 360) * 360 + 360; else s.azTarget = s.azBase;
    s.motionTarget = on ? 1 : 0;
    kick(s);
  };
  if (canHover) {
    hit.addEventListener("pointerenter", () => focus(true));
    hit.addEventListener("pointerleave", () => focus(false));
    hit.addEventListener("pointermove", (e) => {
      if (!cell.s || reduced) return;
      const r = hit.getBoundingClientRect();
      cell.s.azTarget = cell.s.azBase + ((e.clientX - r.left) / r.width - 0.5) * 20;
      kick(cell.s);
    });
  }
  hit.addEventListener("focus", () => focus(true));
  hit.addEventListener("blur", () => focus(false));
});

// The grid is the whole page, so every figure loads straight away and paints a still
// frame before it animates (no frame loop needed to see it).
for (const cell of cells.values()) {
  loadPart(partUrl(cell.b.hero)).then((data) => {
    cell.s = liveFigure(cell.el.querySelector("canvas"), data, { visual: VISUAL });
    placeHalo(cell);
    cell.el.setAttribute("data-in", "");
    if (!reduced) cell.s.view.spin = -110;
    cell.s.view.paint();
    if (!reduced) kick(cell.s);
  }).catch((err) => console.warn(cell.b.hero, err.message));
}

function placeHalo(cell) {
  const v = cell.s.view, halo = cell.el.querySelector(".halo");
  halo.style.setProperty("--floor", `${(v.floor * 100).toFixed(1)}%`);
  halo.style.setProperty("--w", `${Math.min(90, v.width * 90).toFixed(1)}%`);
}

function paintCells() {
  for (const c of cells.values()) {
    const st = isAdopted(c.b) ? "adopted" : crate.has(c.b.id) ? "crate" : "";
    if (st) c.el.dataset.state = st; else delete c.el.dataset.state;
  }
}

// ------------------------------------------------------------------ info panel
const info = $("#info"), plus = $("#plus"), scrim = $("#scrim");
function scrimOn(on) {
  if (on) { scrim.hidden = false; requestAnimationFrame(() => scrim.setAttribute("data-open", "")); }
  else { scrim.removeAttribute("data-open"); setTimeout(() => { if (!scrim.hasAttribute("data-open")) scrim.hidden = true; }, 400); }
}
scrim.addEventListener("click", () => { closeInfo(); closeCrate(); });
const adoptedTotal = BUNDLES.filter(isAdopted).reduce((s, b) => s + totalOf(b), 0);
$("#progress-text").textContent = `${money(adoptedTotal)} of ${money(BUDGET)} adopted`;
$("#tiers").innerHTML = TIERS.map((t, i) => `<dt>${t.name}<span>${money(t.min, false)}+</span></dt><dd>${i ? "Everything above, plus " + t.perks.join(", ").toLowerCase() : t.perks.join(", ")}</dd>`).join("");
const seats = TRAVEL.find((t) => t.id === "seats"), road = TRAVEL.find((t) => t.id === "road");
$("#travel").innerHTML = [
  [`${seats.count} return flights to the competition`, `${money(seats.each)} each`],
  ...road.items.map((it) => [it.unit === "km" ? `The drive there and back, ${it.qty.toLocaleString("en-CA")} km` : it.name, money(it.price)]),
].map(([a, b]) => `<li><span>${a}</span><span>${b}</span></li>`).join("");

function openInfo() {
  closeCrate();
  info.hidden = false; plus.setAttribute("aria-expanded", "true"); scrimOn(true);
  requestAnimationFrame(() => { info.setAttribute("data-open", ""); $("#progress-fill").style.width = `${Math.max(0.8, (adoptedTotal / BUDGET) * 100)}%`; });
}
function closeInfo() {
  if (!info.hasAttribute("data-open")) return;
  info.removeAttribute("data-open"); plus.setAttribute("aria-expanded", "false");
  if (!crateEl.hasAttribute("data-open")) scrimOn(false);
  setTimeout(() => { if (!info.hasAttribute("data-open")) info.hidden = true; }, 550);
}
plus.addEventListener("click", () => (info.hasAttribute("data-open") ? closeInfo() : openInfo()));

// ------------------------------------------------------------------ crate
const crateEl = $("#crate"), crateBtn = $("#crate-btn");
function toggle(id) {
  const adding = !crate.has(id);
  if (adding) crate.add(id); else crate.delete(id);
  save(); render(adding);
  return adding;
}

function render(bump = false) {
  paintCells();
  const count = $("#crate-count");
  count.textContent = crate.size;
  if (bump) { count.classList.remove("bump"); void count.offsetWidth; count.classList.add("bump"); }
  const total = crateTotal();
  $("#crate-list").innerHTML = crate.size ? [...crate].map((k) => {
    const b = byId.get(k);
    return `<li><span class="n">${b.name}<small>${b.code}</small></span><span class="p">${money(priceOf(b))}</span><button class="x" type="button" data-remove="${k}" aria-label="Remove ${b.name}">×</button></li>`;
  }).join("") : `<li class="crate-empty">Nothing here yet.</li>`;
  $("#crate-total").textContent = money(total);
  const tier = tierFor(total), i = tier ? TIERS.indexOf(tier) : -1, next = TIERS[i + 1];
  const lo = tier?.min ?? 0;
  $("#tierbar-fill").style.width = `${next ? Math.max(0, Math.min(1, (total - lo) / (next.min - lo))) * 100 : 100}%`;
  $("#crate-tier").textContent = [tier?.name, next ? `${money(next.min - total)} to ${next.name}` : null].filter(Boolean).join(" · ");
  const send = $("#crate-send");
  send.setAttribute("aria-disabled", crate.size ? "false" : "true");
  send.href = mailto(total, tier);
}

function summary(total, tier) {
  const lines = [...crate].map((k) => { const b = byId.get(k); return `• ${b.name} (${b.code}): ${money(priceOf(b))}`; });
  return [`We'd like to adopt these RIFT parts:`, "", ...lines, "", `Total: ${money(total)} CAD${tier ? ` (${tier.name} tier)` : ""}`, "", "Name / company:", "Logo and contact for recognition:"].join("\n");
}
function mailto(total, tier) {
  const subject = `Adopt a Part: ${[...crate].map((k) => byId.get(k).code).join(", ")} (${money(total)})`;
  return `mailto:arcrobotics@utra.ca?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary(total, tier))}`;
}
$("#crate-list").addEventListener("click", (e) => { const k = e.target.closest("[data-remove]")?.dataset.remove; if (k) { toggle(k); paintAdopt(); } });
$("#crate-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summary(crateTotal(), tierFor(crateTotal()))); toast("Copied"); } catch { toast("Couldn't copy"); }
});
function openCrate() {
  closeInfo();
  crateEl.hidden = false; crateBtn.setAttribute("aria-expanded", "true"); scrimOn(true);
  requestAnimationFrame(() => crateEl.setAttribute("data-open", ""));
}
function closeCrate() {
  if (!crateEl.hasAttribute("data-open")) return;
  crateEl.removeAttribute("data-open"); crateBtn.setAttribute("aria-expanded", "false");
  if (!info.hasAttribute("data-open")) scrimOn(false);
  setTimeout(() => { if (!crateEl.hasAttribute("data-open")) crateEl.hidden = true; }, 550);
}
crateBtn.addEventListener("click", () => (crateEl.hasAttribute("data-open") ? closeCrate() : openCrate()));
$("#crate-close").addEventListener("click", closeCrate);

let toastTimer = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.setAttribute("data-show", "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.removeAttribute("data-show"), 1800);
}

// ------------------------------------------------------------------ part view
const viewEl = $("#view"), viewCanvas = $("#view-canvas");
let big = null, current = null, shown = null, returnFocus = null;

function openView(id) {
  const b = byId.get(id); if (!b) return;
  current = b; returnFocus = document.activeElement;
  $("#view-code").textContent = b.code;
  $("#view-name").textContent = b.name;
  $("#view-price").textContent = isAdopted(b) ? "Adopted" : `${money(priceOf(b))} · ${tierFor(priceOf(b)).name}`;
  $("#view-line").textContent = b.line;
  const drawn = b.items.filter((it) => it.cad), plain = b.items.filter((it) => !it.cad);
  const inside = $("#view-inside");
  inside.innerHTML = drawn.map((it, k) => `<li><button type="button" data-k="${k}" aria-label="${it.name}"><canvas aria-hidden="true"></canvas><span>×${it.qty}${it.unit ? ` ${it.unit}` : ""}</span></button></li>`).join("") +
    `<li style="grid-column:1/-1" class="inside-name" id="inside-name"></li>`;
  inside.querySelectorAll("button[data-k]").forEach((btn) => {
    const it = drawn[+btn.dataset.k];
    btn.addEventListener("click", () => show(it));
    btn.addEventListener("pointerenter", () => { $("#inside-name").textContent = it.name; });
    btn.addEventListener("pointerleave", () => { $("#inside-name").textContent = shown?.name ?? ""; });
    loadPart(partUrl(it.cad)).then((data) => { new View(btn.querySelector("canvas"), new Figure(data), { fill: 0.84, dpr: 2 }).paint(); })
      .catch(() => btn.querySelector("canvas").replaceWith(Object.assign(document.createElement("span"), { className: "ph", textContent: "·" })));
  });
  $("#view-note").textContent = plain.length ? `Also inside: ${plain.map((p) => p.name.toLowerCase()).join(", ")}.` : "";
  paintAdopt();
  viewEl.hidden = false;
  document.documentElement.style.overflow = "hidden";
  requestAnimationFrame(() => viewEl.setAttribute("data-open", ""));
  big = null;
  show(drawn.find((x) => x.cad === b.hero) ?? drawn[0]);
  $(".close").focus({ preventScroll: true });
  history.replaceState(null, "", `#part-${b.id}`);
}

function show(it) {
  if (!it) return;
  shown = it;
  $("#inside-name").textContent = it.name;
  document.querySelectorAll("#view-inside button[data-k]").forEach((btn) => btn.setAttribute("aria-current", btn.getAttribute("aria-label") === it.name));
  loadPart(partUrl(it.cad)).then((data) => {
    if (shown !== it) return;
    const keep = big ? big.view.spin : 0;
    if (big) live.delete(big);
    big = liveFigure(viewCanvas, data, { fill: 0.6 });
    big.view.spin = keep - (reduced ? 0 : 50); big.spinTarget = keep;
    big.drift = reduced ? 0 : 9;
    big.motionTarget = reduced ? 0 : 1;
    big.view.paint();
    kick(big);
  }).catch(() => {});
}

function paintAdopt() {
  const btn = $("#view-adopt"), b = current; if (!b) return;
  if (isAdopted(b)) { btn.disabled = true; btn.textContent = `Adopted · ${b.adopted.by}`; delete btn.dataset.state; return; }
  btn.disabled = false;
  const on = crate.has(b.id);
  if (on) btn.dataset.state = "crate"; else delete btn.dataset.state;
  btn.textContent = on ? "In your crate · Remove" : `Adopt · ${money(priceOf(b))}`;
}
$("#view-adopt").addEventListener("click", () => {
  const b = current; if (!b || isAdopted(b)) return;
  const adding = toggle(b.id);
  paintAdopt();
  if (adding) flyToCrate(viewCanvas); else toast("Removed");
});

// A snapshot of the figure arcs up and drops into the crate.
function flyToCrate(canvas) {
  const from = canvas.getBoundingClientRect(), to = crateBtn.getBoundingClientRect();
  if (reduced || !from.width) { toast("In your crate"); return; }
  const fly = document.createElement("canvas");
  fly.width = canvas.width; fly.height = canvas.height;
  fly.getContext("2d").drawImage(canvas, 0, 0);
  fly.className = "flyer";
  Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.append(fly);
  const s = 40 / from.width;
  const dx = to.left + to.width / 2 - (from.left + (from.width * s) / 2), dy = to.top + to.height / 2 - (from.top + (from.height * s) / 2);
  fly.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.6}px, ${dy * 0.3 - 60}px) scale(${0.35 + s * 0.65})`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 },
  ], { duration: 780, easing: "cubic-bezier(.45,0,.2,1)" }).finished.then(() => fly.remove());
}

function closeView() {
  viewEl.removeAttribute("data-open");
  document.documentElement.style.overflow = "";
  history.replaceState(null, "", location.pathname + location.search);
  setTimeout(() => { if (!viewEl.hasAttribute("data-open")) { viewEl.hidden = true; if (big) live.delete(big); big = null; } }, 360);
  returnFocus?.focus?.({ preventScroll: true });
}
viewEl.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeView(); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!viewEl.hidden) closeView(); else if (crateEl.hasAttribute("data-open")) closeCrate(); else if (info.hasAttribute("data-open")) closeInfo();
});

// Drag to turn, with inertia; it drifts slowly when left alone.
{
  const pad = $("#view-fig");
  let drag = null;
  pad.addEventListener("pointerdown", (e) => {
    if (!big) return;
    pad.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, t: performance.now(), v: 0 };
    big.drift = 0;
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drag || !big) return;
    const dx = e.clientX - drag.x, now = performance.now();
    drag.v = dx / Math.max(1, now - drag.t); drag.x = e.clientX; drag.t = now;
    big.view.spin += dx * 0.5; big.spinTarget = big.view.spin; big.spinVel = 0;
    kick(big);
  });
  const end = () => {
    if (!drag || !big) return;
    big.spinTarget = big.view.spin + drag.v * 240;
    drag = null;
    setTimeout(() => { if (big && !drag && !reduced) { big.drift = 9; kick(big); } }, 1600);
    kick(big);
  };
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
}

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const c of cells.values()) if (c.s) { c.s.view.resize(); placeHalo(c); c.s.view.paint(); }
    if (big) { big.view.resize(); big.view.paint(); }
  }, 120);
});

render();
const deep = location.hash.match(/^#part-([\w-]+)/);
if (deep && byId.has(deep[1])) openView(deep[1]);

// Inspection hook for automated checks.
window.__rift = { cells, crate, big: () => big };
