import { LINES, OFFERS, SECTIONS, ITEMS, ITEM_SECTIONS, OPEN_ITEMS, TRIP, TIERS, BUDGET, ADOPTED_TOTAL, tierFor, priceOf, isAdopted, adopterOf, money } from "./catalog.js";
import { loadPart, placeholderPart, Figure, Group, View } from "./stage.js";

const $ = (s, el = document) => el.querySelector(s);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = matchMedia("(hover: hover)").matches;
const partUrl = (id) => `parts/${id}.bin`;
const byId = new Map([...OFFERS, ...ITEMS].map((o) => [o.id, o]));

// Every part is drawn at the same optical size: its visual mass (area-weighted spread,
// as the camera sees it) takes this fraction of the cell width, like a row of products
// photographed to read the same size. A bundle's parts are evened out among themselves
// (see Group in stage.js), and together they fill this much of the box.
const VISUAL = 0.165, GROUP_FRAME = 0.66;

// ------------------------------------------------------------------ crate state
// The crate holds offer ids, "seat:N" for single seats, and at most one "km:N" for part of
// the drive. What it costs is the sum of the distinct budget lines those cover, so
// overlapping offers never double up; km count only until something covers the whole drive.
const STORE = "rift-crate-v3";
const crate = new Set(read().filter((k) => (k.startsWith("seat:") ? LINES[`seat${k.slice(5)}`]
  : k.startsWith("km:") ? +k.slice(3) > 0 && +k.slice(3) <= TRIP.km
  : byId.has(k) && !isAdopted(byId.get(k)))));
function read() { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify([...crate])); } catch {} }
const linesOf = (key) => (key.startsWith("seat:") ? [`seat${key.slice(5)}`] : key.startsWith("km:") ? [] : byId.get(key).lines);
const covered = () => new Set([...crate].flatMap(linesOf));
const kmKey = () => [...crate].find((k) => k.startsWith("km:"));
const kmIn = (have = covered()) => (have.has("van") ? TRIP.km : +(kmKey()?.slice(3) ?? 0));
const crateTotal = () => {
  const have = covered();
  return [...have].reduce((s, k) => s + LINES[k].price, 0) + (have.has("van") ? 0 : kmIn(have) * TRIP.perKm);
};
const seatsIn = (set = covered()) => [...set].filter((k) => k.startsWith("seat")).length;
const kmText = (km) => `${km.toLocaleString("en-CA")} km`;
const nameOf = (key) => (key.startsWith("seat:") ? "A seat on the plane" : key.startsWith("km:") ? `${kmText(+key.slice(3))} of the drive` : byId.get(key).name);

function add(o) {
  const have = covered();
  if (o.seat) {
    const free = Array.from({ length: 8 }, (_, i) => i + 1).find((i) => !have.has(`seat${i}`));
    if (!free) { toast("All eight seats are in your crate"); return false; }
    crate.add(`seat:${free}`);
    return true;
  }
  if (o.lines.every((k) => have.has(k))) { toast(`${o.name} is already covered by your crate`); return false; }
  const swallowed = [...crate].filter((k) => (k.startsWith("km:") ? o.lines.includes("van") : linesOf(k).every((l) => o.lines.includes(l))));
  for (const k of swallowed) crate.delete(k);
  crate.add(o.id);
  if (swallowed.length) toast(`${o.name} includes ${[...new Set(swallowed.map(nameOf))].join(" and ")}`);
  return true;
}

// The trip's sliders set an amount rather than add one: this many km of the drive, this
// many seats in all (seats already covered by an offer in the crate count toward it).
function setKm(km) {
  const k = kmKey();
  if (k) crate.delete(k);
  if (km > 0 && !covered().has("van")) crate.add(`km:${Math.min(km, TRIP.km)}`);
}
function setSeats(n) {
  for (const k of [...crate]) if (k.startsWith("seat:")) crate.delete(k);
  for (let i = 1; i <= TRIP.seats && seatsIn() < n; i++) if (!covered().has(`seat${i}`)) crate.add(`seat:${i}`);
}
let trip = null; // the trip section, once it has loaded

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
  const w = 7.5; // critically damped spring toward spinTarget
  s.spinVel += (-w * w * (view.spin - s.spinTarget) - 2 * w * s.spinVel) * dt;
  view.spin += s.spinVel * dt;
  view.azimuth = follow(view.azimuth, s.azTarget, 10, dt);
  s.motion = follow(s.motion, s.motionTarget, 3, dt);
  // Grid cells: colour and size ride the hover turn itself, so all three start and land
  // together. The part view fades its colour on its own.
  if (s.sync) syncToTurn(s);
  else {
    s.color = follow(s.color, s.colorTarget, s.colorTarget ? 7 : 2.2, dt);
    if (Math.abs(s.color - s.colorTarget) < 0.004) s.color = s.colorTarget;
  }
  figure.color = s.color;
  const turning = figure.tick(dt, s.motion);
  view.paint();
  const still = !s.drift && Math.abs(view.spin - s.spinTarget) < 0.05 && Math.abs(s.spinVel) < 0.05 &&
    Math.abs(view.azimuth - s.azTarget) < 0.02 && Math.abs(s.motion - s.motionTarget) < 0.002 && (s.sync || s.color === s.colorTarget);
  if (still) { view.spin = s.spinTarget; if (s.sync) { syncToTurn(s); figure.color = s.color; view.paint(); } }
  return !still || (turning && s.motion > 0.002);
}

function liveFigure(canvas, figure, opts) {
  const view = new View(canvas, figure, opts);
  return { view, figure, azBase: view.azimuth, spinTarget: view.spin, spinVel: 0, azTarget: view.azimuth,
    motion: 0, motionTarget: 0, drift: 0, color: 0, colorTarget: 0, rest: view.spin };
}

// Hover turns the part a little toward you; its real colour and a slight lift in size come
// in with the turn and go out with it.
const HOVER_TURN = 35, HOVER_GROW = 0.06;
function syncToTurn(s) {
  const p = reduced ? s.colorTarget : Math.min(1, Math.max(0, (s.view.spin - s.rest) / HOVER_TURN));
  s.color = p;
  s.view.zoom = 1 + HOVER_GROW * p;
}
function revealOn(s) {
  s.colorTarget = 1;
  if (reduced) s.color = 1; else s.spinTarget = s.rest + HOVER_TURN;
  kick(s);
}
function revealOff(s) {
  s.colorTarget = 0; s.spinTarget = s.rest;
  if (reduced) s.color = 0;
  kick(s);
}

// Load the parts an offer shows; one part is a Figure, several stand together as a Group.
// An offer with nothing modelled yet stands in as a cube.
async function figureFor(o) {
  const datas = o.show.length ? (await Promise.all(o.show.map((id) => loadPart(partUrl(id)).catch(() => null)))).filter(Boolean) : [placeholderPart()];
  if (!datas.length) throw new Error(`no figures for ${o.id}`);
  const fig = datas.length > 1 ? new Group(datas, { hero: o.hero }) : new Figure(datas[0]);
  fig.holo = isAdopted(o) ? 1 : 0;
  return { fig, multi: datas.length > 1 };
}

// ------------------------------------------------------------------ grid
const shelves = $("#shelves");
const cells = [];

// The shelves list every budget line on its own: first, larger, the robot parts still up
// for adoption, then the trip (added below), then every line in its budget group. The
// older tier-and-bundle layout stays at ?bundles until the bundles are redesigned.
const ITEM_VIEW = !new URLSearchParams(location.search).has("bundles");
const openTotal = OPEN_ITEMS.reduce((s, o) => s + priceOf(o), 0);
const SHELVES = ITEM_VIEW
  ? [{ name: "Up for adoption", note: money(openTotal), aria: `Up for adoption, ${money(openTotal)}`, items: OPEN_ITEMS, featured: true },
    ...ITEM_SECTIONS.map((g) => ({ name: g.name, note: money(g.total), aria: `${g.name}, ${money(g.total)}`, items: g.items }))]
  : SECTIONS.map((s) => ({ name: s.tier.name, note: `${money(s.tier.min, false)}+`, aria: `${s.tier.name}, ${money(s.tier.min, false)} and up`, items: s.items }));

SHELVES.forEach((sec, si) => {
  const el = document.createElement("section");
  el.className = sec.featured ? "tier featured" : "tier";
  el.setAttribute("aria-label", sec.aria);
  el.innerHTML = `<p class="tier-label">${sec.name} <span>${sec.note}</span></p><ul class="grid" role="list"></ul>`;
  shelves.append(el);
  const ul = el.querySelector("ul");
  sec.items.forEach((o, i) => {
    const adopted = isAdopted(o);
    const li = document.createElement("li");
    li.className = "cell";
    if (adopted) li.dataset.state = "adopted";
    li.style.setProperty("--d", `${(i % 5) * 70}ms`);
    li.style.setProperty("--bob", `${6.4 + (((si * 5 + i) * 37) % 17) / 10}s`);
    li.style.setProperty("--bob-at", `${-(((si * 5 + i) * 53) % 29) / 10}s`);
    li.innerHTML = `
      <button class="hit" type="button" aria-label="${o.name}, ${adopted ? `adopted by ${adopterOf(o)}` : money(priceOf(o))}">
        <div class="fig"><div class="halo"></div><div class="float"><canvas aria-hidden="true"></canvas></div></div>
        <div class="cap"><span class="code">${o.code}</span><span class="price">${adopted ? "Adopted" : money(priceOf(o))}</span></div>
      </button>`;
    ul.append(li);
    const cell = { el: li, o, s: null, mask: null, hot: false, focused: false, on: false };
    cells.push(cell);
    const hit = li.querySelector(".hit");
    const update = () => {
      const on = cell.hot || cell.focused, s = cell.s;
      if (on === cell.on || !s) return;
      cell.on = on;
      s.motionTarget = on && !reduced ? 1 : 0;
      if (on) revealOn(s); else { revealOff(s); s.azTarget = s.azBase; }
      kick(s);
    };
    // A mouse click only counts on the part; a tap or a key press anywhere on the cell.
    let via = "mouse";
    hit.addEventListener("pointerdown", (e) => { via = e.pointerType; });
    hit.addEventListener("click", (e) => { if (!canHover || !e.detail || via !== "mouse" || overPart(cell, e)) openView(o.id); });
    if (canHover) {
      hit.addEventListener("pointermove", (e) => {
        const hot = overPart(cell, e);
        if (hot !== cell.hot) { cell.hot = hot; li.toggleAttribute("data-hot", hot); update(); }
        if (!hot || !cell.s || reduced) return;
        const r = hit.getBoundingClientRect();
        cell.s.azTarget = cell.s.azBase + ((e.clientX - r.left) / r.width - 0.5) * 20;
        kick(cell.s);
      });
      hit.addEventListener("pointerleave", () => { cell.hot = false; li.removeAttribute("data-hot"); update(); });
    }
    hit.addEventListener("focus", () => { cell.focused = hit.matches(":focus-visible"); update(); });
    hit.addEventListener("blur", () => { cell.focused = false; update(); });
  });
});

// ------------------------------------------------------------------ hover target
// A cell answers the pointer near the part itself, not anywhere in its box. Its target is
// the part's drawn silhouette at rest and at the full hover turn (so the part never turns
// out from under the pointer), less whatever the box's edge fade hides, grown by NEAR to
// start the hover and by FAR to end it. The caption counts too.
const GRID = 4, NEAR = 12, FAR = 22; // CSS px

function measureMask(cell) {
  const s = cell.s, view = s.view, c = view.canvas;
  const W = c.clientWidth, H = c.clientHeight;
  if (!W || !H) { cell.mask = null; return; }
  const cols = Math.ceil(W / GRID), rows = Math.ceil(H / GRID), bits = new Uint8Array(cols * rows);
  const kx = W / c.width, ky = H / c.height, step = Math.max(1, Math.round(c.width / W));
  const fade = (u, edge) => Math.min(1, u / edge, (1 - u) / edge); // the .float mask in site.css
  const { spin, zoom } = view;
  for (const [turn, grow] of [[0, 0], [HOVER_TURN, HOVER_GROW]]) {
    view.spin = s.rest + turn; view.zoom = 1 + grow; view.paint();
    const px = view.ctx.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y += step) {
      const fy = fade((y + 0.5) / c.height, 0.14);
      if (fy <= 0) continue;
      for (let x = 0; x < c.width; x += step) {
        if (px[(y * c.width + x) * 4 + 3] * fy * fade((x + 0.5) / c.width, 0.16) < 128) continue;
        bits[Math.floor((y * ky) / GRID) * cols + Math.floor((x * kx) / GRID)] = 1;
      }
    }
  }
  view.spin = spin; view.zoom = zoom; view.paint();
  cell.mask = { bits, cols, rows };
}

function overPart(cell, e) {
  const reach = cell.hot ? FAR : NEAR;
  const cap = cell.el.querySelector(".cap");
  const a = cap.firstElementChild.getBoundingClientRect(), b = cap.lastElementChild.getBoundingClientRect();
  if (e.clientX >= a.left - 6 && e.clientX <= b.right + 6 && e.clientY >= a.top - 6 && e.clientY <= a.bottom + 6) return true;
  const m = cell.mask, r = cell.el.querySelector(".fig").getBoundingClientRect();
  if (!m) return false;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const gx0 = Math.max(0, Math.floor((x - reach) / GRID)), gx1 = Math.min(m.cols - 1, Math.floor((x + reach) / GRID));
  const gy0 = Math.max(0, Math.floor((y - reach) / GRID)), gy1 = Math.min(m.rows - 1, Math.floor((y + reach) / GRID));
  for (let gy = gy0; gy <= gy1; gy++) {
    const dy = Math.max(gy * GRID - y, 0, y - (gy + 1) * GRID);
    for (let gx = gx0; gx <= gx1; gx++) {
      if (!m.bits[gy * m.cols + gx]) continue;
      const dx = Math.max(gx * GRID - x, 0, x - (gx + 1) * GRID);
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
  }
  return false;
}

// The grid is the whole page, so every figure loads straight away and paints a still
// frame before it animates (no frame loop needed to see it).
for (const cell of cells) {
  figureFor(cell.o).then(({ fig, multi }) => {
    cell.s = liveFigure(cell.el.querySelector("canvas"), fig, multi ? { frame: GROUP_FRAME } : { visual: VISUAL });
    cell.s.sync = true;
    placeHalo(cell);
    measureMask(cell);
    cell.el.setAttribute("data-in", "");
    if (!reduced) cell.s.view.spin = -30;
    cell.s.view.paint();
    if (!reduced) kick(cell.s);
  }).catch((err) => { console.warn(err.message); cell.el.setAttribute("data-in", ""); cell.el.dataset.empty = ""; });
}

function placeHalo(cell) {
  const v = cell.s.view, halo = cell.el.querySelector(".halo");
  halo.style.setProperty("--floor", `${(v.floor * 100).toFixed(1)}%`);
  halo.style.setProperty("--w", `${Math.min(90, v.width * 90).toFixed(1)}%`);
}

function paintCells() {
  const have = covered(), seats = seatsIn(have);
  for (const c of cells) {
    if (isAdopted(c.o)) continue;
    const inCrate = c.o.seat ? seats > 0 : c.o.lines.every((k) => have.has(k));
    if (inCrate) c.el.dataset.state = "crate"; else delete c.el.dataset.state;
    const price = c.el.querySelector(".price");
    price.textContent = c.o.seat && seats ? `${money(priceOf(c.o))} ×${seats}` : money(priceOf(c.o));
  }
}

// ------------------------------------------------------------------ info panel
const info = $("#info"), plus = $("#plus"), scrim = $("#scrim");
function scrimOn(on) {
  if (on) { scrim.hidden = false; requestAnimationFrame(() => scrim.setAttribute("data-open", "")); }
  else { scrim.removeAttribute("data-open"); setTimeout(() => { if (!scrim.hasAttribute("data-open")) scrim.hidden = true; }, 400); }
}
scrim.addEventListener("click", () => { closeInfo(); closeCrate(); });
$("#progress-text").textContent = `${money(ADOPTED_TOTAL)} of ${money(BUDGET)} adopted`;
$("#tiers").innerHTML = TIERS.map((t, i) => `<dt>${t.name}<span>${money(t.min, false)}+</span></dt><dd>${i ? "Everything above, plus " + t.perks.join(", ").toLowerCase() : t.perks.join(", ")}</dd>`).join("");

function openInfo() {
  closeCrate();
  info.hidden = false; plus.setAttribute("aria-expanded", "true"); scrimOn(true);
  requestAnimationFrame(() => { info.setAttribute("data-open", ""); $("#progress-fill").style.width = `${(ADOPTED_TOTAL / BUDGET) * 100}%`; });
}
function closeInfo() {
  if (!info.hasAttribute("data-open")) return;
  info.removeAttribute("data-open"); plus.setAttribute("aria-expanded", "false");
  if (!crateEl.hasAttribute("data-open")) scrimOn(false);
  setTimeout(() => { if (!info.hasAttribute("data-open")) info.hidden = true; }, 550);
}
plus.addEventListener("click", () => (info.hasAttribute("data-open") ? closeInfo() : openInfo()));

// ------------------------------------------------------------------ crate drawer
const crateEl = $("#crate"), crateBtn = $("#crate-btn");

function render(bump = false) {
  paintCells();
  trip?.sync();
  const count = $("#crate-count");
  count.textContent = crate.size;
  if (bump) { count.classList.remove("bump"); void count.offsetWidth; count.classList.add("bump"); }
  const total = crateTotal();
  const offers = [...crate].filter((k) => !k.startsWith("seat:") && !k.startsWith("km:"));
  const seatKeys = [...crate].filter((k) => k.startsWith("seat:"));
  const rows = offers.map((k) => {
    const o = byId.get(k);
    return `<li><span class="n">${o.name}<small>${o.code}</small></span><span class="p">${money(priceOf(o))}</span><button class="x" type="button" data-remove="${k}" aria-label="Remove ${o.name}">×</button></li>`;
  });
  if (seatKeys.length) rows.push(`<li><span class="n">A seat on the plane${seatKeys.length > 1 ? ` ×${seatKeys.length}` : ""}<small>SEAT</small></span><span class="p">${money(seatKeys.length * LINES.seat1.price)}</span><button class="x" type="button" data-remove="${seatKeys.at(-1)}" aria-label="Remove a seat">×</button></li>`);
  if (kmKey() && !covered().has("van")) rows.push(`<li><span class="n">The drive, ${kmText(kmIn())}<small>VAN</small></span><span class="p">${money(kmIn() * TRIP.perKm)}</span><button class="x" type="button" data-remove="${kmKey()}" aria-label="Remove the drive">×</button></li>`);
  $("#crate-list").innerHTML = rows.length ? rows.join("") : `<li class="crate-empty">Nothing here yet.</li>`;
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
  const seats = [...crate].filter((k) => k.startsWith("seat:")).length;
  const lines = [...crate].filter((k) => !k.startsWith("seat:") && !k.startsWith("km:")).map((k) => { const o = byId.get(k); return `• ${o.name} (${o.code}): ${money(priceOf(o))}`; });
  if (seats) lines.push(`• ${seats} seat${seats > 1 ? "s" : ""} on the plane: ${money(seats * LINES.seat1.price)}`);
  if (kmKey() && !covered().has("van")) lines.push(`• The drive, ${kmText(kmIn())}: ${money(kmIn() * TRIP.perKm)}`);
  return [`We'd like to adopt these for RIFT:`, "", ...lines, "", `Total: ${money(total)} CAD${tier ? ` (${tier.name} tier)` : ""}`, "", "Name / company:", "Logo and contact for recognition:"].join("\n");
}
function mailto(total, tier) {
  const codes = [...new Set([...crate].map((k) => (k.startsWith("seat:") ? "SEAT" : k.startsWith("km:") ? "VAN" : byId.get(k).code)))];
  return `mailto:arcrobotics@utra.ca?subject=${encodeURIComponent(`Adopt a Part: ${codes.join(", ")} (${money(total)})`)}&body=${encodeURIComponent(summary(total, tier))}`;
}
$("#crate-list").addEventListener("click", (e) => { const k = e.target.closest("[data-remove]")?.dataset.remove; if (k) { crate.delete(k); save(); render(); paintAdopt(); } });
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.removeAttribute("data-show"), 2200);
}

// ------------------------------------------------------------------ part view
const viewEl = $("#view"), viewCanvas = $("#view-canvas");
let big = null, current = null, returnFocus = null, showing = null;

function insideOf(o) {
  // What's in the offer, one entry per distinct thing (seats collapse to one).
  const seen = new Map();
  for (const k of o.lines) {
    const l = LINES[k];
    for (const p of l.parts ?? [l]) {
      const key = p.cad ?? p.name;
      const prev = seen.get(key);
      if (prev && k.startsWith("seat")) { prev.qty += 1; continue; }
      if (!prev) seen.set(key, { name: p.name, qty: p.qty, unit: p.unit, cad: p.cad, adopted: !!l.adopted });
    }
  }
  return [...seen.values()];
}
// "×4" for a count, "4,534 km" for a measure.
const amount = (t) => t.unit ? `${t.qty.toLocaleString("en-CA")} ${t.unit}` : `×${t.qty}`;

function openView(id) {
  const o = byId.get(id); if (!o) return;
  current = o; returnFocus = document.activeElement;
  const adopted = isAdopted(o);
  $("#view-code").textContent = o.code;
  $("#view-name").textContent = o.name;
  $("#view-price").textContent = adopted ? `${money(priceOf(o))} · Adopted by ${adopterOf(o)}` : [money(priceOf(o)), tierFor(priceOf(o))?.name].filter(Boolean).join(" · ");
  $("#view-line").textContent = o.line;
  // A single thing with no model yet is named like a drawn one, not listed as "also inside".
  const things = insideOf(o), drawn = things.filter((t) => t.cad), lead = drawn[0] ?? (things.length === 1 ? things[0] : null);
  const plain = things.filter((t) => !t.cad && t !== lead);
  const inside = $("#view-inside");
  inside.innerHTML = drawn.length > 1 || o.show.length > 1 ? drawn.map((t, k) => `<li><button type="button" data-k="${k}" aria-label="${t.name}"><canvas aria-hidden="true"></canvas><span>${amount(t)}</span></button></li>`).join("") +
    `<li style="grid-column:1/-1" class="inside-name" id="inside-name"></li>` : `<li style="grid-column:1/-1" class="inside-name" id="inside-name">${lead ? (lead.unit ? `${lead.name}, ${amount(lead)}` : `${lead.qty > 1 ? `${lead.qty} × ` : ""}${lead.name}`) : ""}</li>`;
  inside.querySelectorAll("button[data-k]").forEach((btn) => {
    const t = drawn[+btn.dataset.k];
    btn.addEventListener("click", () => showPart(t));
    btn.addEventListener("pointerenter", () => { $("#inside-name").textContent = t.name; });
    btn.addEventListener("pointerleave", () => { $("#inside-name").textContent = showing?.name ?? ""; });
    loadPart(partUrl(t.cad)).then((data) => {
      const f = new Figure(data); f.holo = t.adopted ? 1 : 0;
      new View(btn.querySelector("canvas"), f, { fill: 0.84, dpr: 2 }).paint();
    }).catch(() => btn.querySelector("canvas").replaceWith(Object.assign(document.createElement("span"), { className: "ph", textContent: "·" })));
  });
  $("#view-note").textContent = plain.length ? `Also inside: ${plain.map((p) => p.name).join(", ")}.` : "";
  paintAdopt();
  viewEl.hidden = false;
  document.documentElement.style.overflow = "hidden";
  requestAnimationFrame(() => viewEl.setAttribute("data-open", ""));
  showOffer(o);
  $(".close").focus({ preventScroll: true });
  history.replaceState(null, "", `#part-${o.id}`);
}

function mount(fig, multi) {
  if (big) live.delete(big);
  big = liveFigure(viewCanvas, fig, { fill: multi ? 0.72 : 0.6 });
  big.motionTarget = reduced ? 0 : 1;
  big.view.paint();
  // Arrive as a drawing, then fade the colour in and keep it.
  if (!reduced) setTimeout(() => { if (big?.figure === fig) { revealOn(big); big.drift = 0; } }, 250);
  else revealOn(big);
  const settle = () => { if (big?.figure === fig && !reduced) { big.drift = 7; kick(big); } };
  setTimeout(settle, 1800);
}

function showOffer(o) {
  showing = null;
  document.querySelectorAll("#view-inside button[data-k]").forEach((b) => b.removeAttribute("aria-current"));
  figureFor(o).then(({ fig, multi }) => { if (current === o && !showing) mount(fig, multi); }).catch(() => {});
}

function showPart(t) {
  showing = t;
  $("#inside-name").textContent = t.name;
  document.querySelectorAll("#view-inside button[data-k]").forEach((btn) => btn.setAttribute("aria-current", btn.getAttribute("aria-label") === t.name));
  loadPart(partUrl(t.cad)).then((data) => {
    if (showing !== t) return;
    const f = new Figure(data); f.holo = t.adopted ? 1 : 0;
    mount(f, false);
  }).catch(() => {});
}

function paintAdopt() {
  const btn = $("#view-adopt"), o = current; if (!o) return;
  if (isAdopted(o)) { btn.disabled = true; btn.textContent = `Adopted by ${adopterOf(o)}`; delete btn.dataset.state; return; }
  btn.disabled = false;
  const have = covered();
  const seats = seatsIn(have);
  if (o.seat) {
    if (seats) btn.dataset.state = "crate"; else delete btn.dataset.state;
    btn.textContent = seats >= 8 ? "All eight seats are in your crate" : seats ? `Add another seat · ${seats} in your crate` : `Adopt · ${money(priceOf(o))}`;
    return;
  }
  const on = o.lines.every((k) => have.has(k));
  if (on) btn.dataset.state = "crate"; else delete btn.dataset.state;
  btn.textContent = on ? (crate.has(o.id) ? "In your crate · Remove" : "Covered by your crate") : `Adopt · ${money(priceOf(o))}`;
}
$("#view-adopt").addEventListener("click", () => {
  const o = current; if (!o || isAdopted(o)) return;
  if (!o.seat && crate.has(o.id)) { crate.delete(o.id); save(); render(); paintAdopt(); toast("Removed"); return; }
  if (!o.seat && o.lines.every((k) => covered().has(k))) { openCrate(); return; }
  if (add(o)) { save(); render(true); paintAdopt(); flyToCrate(viewCanvas); }
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
    setTimeout(() => { if (big && !drag && !reduced) { big.drift = 7; kick(big); } }, 1600);
    kick(big);
  };
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
}

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const c of cells) if (c.s) { c.s.view.resize(); placeHalo(c); measureMask(c); }
    if (big) { big.view.resize(); big.view.paint(); }
  }, 120);
});

render();
const deep = location.hash.match(/^#part-([\w-]+)/);
if (ITEM_VIEW) import("./trip.js").then(({ tripSection }) => {
  trip = tripSection({
    km: () => kmIn(), seats: () => seatsIn(),
    setKm: (km) => { setKm(km); save(); render(true); },
    setSeats: (n) => { setSeats(n); save(); render(true); },
  });
  shelves.querySelector(".featured").after(trip.el);
}).catch((err) => console.warn(`trip: ${err.message}`));
if (deep && byId.has(deep[1])) openView(deep[1]);

// Inspection hook for automated checks.
window.__rift = { cells, crate, big: () => big, add: (id) => { add(byId.get(id)); save(); render(true); } };
