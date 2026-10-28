// The cabin strip: a single-aisle airliner seen from straight above, roof cut away, drawn
// as an ink plate on paper. Every seat is the site's real airline-seat model, painted
// top-down once per size by the shared renderer (one drawing-look sprite, one true-colour
// sprite) and stamped into the cabin. The team's block of seats fills with colour as
// sponsors fund them.
//
// The plane is laid out in metres: x is the station aft of the nose tip, y is across the
// fuselage (+y toward the bottom of the strip). The nose points right, so screen x falls
// as the station grows.
import { loadPart, Figure, View } from "./stage.js";

// ------------------------------------------------------------------ the aircraft
const R = 1.98;                  // fuselage half-width, outer skin
const WALL = 0.13;               // skin + lining, drawn as a cut wall
const NOSE = 6.2, TAPER = 29.5, TAIL = 37.6, TAIL_R = 0.3;
const FWD_BULKHEAD = 1.45, AFT_BULKHEAD = 31.75;
const SPAN = [-0.6, 38.6];       // stations the strip has to show when it shows it all

function hw(x) {
  if (x <= 0) return 0;
  if (x < NOSE) { const t = 1 - x / NOSE; return R * Math.pow(1 - Math.pow(t, 2.15), 1 / 2.15); }
  if (x <= TAPER) return R;
  if (x >= TAIL) return TAIL_R;
  const t = (x - TAPER) / (TAIL - TAPER);
  return TAIL_R + (R - TAIL_R) * Math.pow(1 - Math.pow(t, 1.7), 0.8);
}
const inner = (x) => hw(x) - WALL;

// Wing planform (per side): leading and trailing edge stations at the root, the
// trailing-edge kink and the tip.
const WING = [[1.9, 13.0, 19.6], [6.3, 15.25, 19.85], [16.9, 20.6, 22.15]];
function edge(y, k) {
  const [a, b] = y <= WING[1][0] ? [WING[0], WING[1]] : [WING[1], WING[2]];
  const t = (y - a[0]) / (b[0] - a[0]);
  return a[k] + (b[k] - a[k]) * t;
}
const le = (y) => edge(y, 1), te = (y) => edge(y, 2);
const chordAt = (y, f) => le(y) + (te(y) - le(y)) * f;

const ENGINE_Y = 4.55;
function nacelle(x) {
  // Fan cowl from the inlet lip to the core, then the core cowl and plug.
  if (x < 11.1 || x > 16.5) return 0;
  if (x < 11.7) return 0.84 + 0.15 * Math.sin(((x - 11.1) / 0.6) * Math.PI / 2);
  if (x < 12.7) return 0.99;
  if (x < 15.2) return 0.99 - 0.21 * Math.pow((x - 12.7) / 2.5, 1.6);
  if (x < 15.9) return 0.55 - 0.13 * ((x - 15.2) / 0.7);
  return 0.32 * (1 - (x - 15.9) / 0.6);
}

// Cabin: 27 economy rows at 31" pitch, two over-wing exit rows with extra room.
const ROW0 = 6.85, PITCH = 0.79, ROWS = 27, EXIT_ROWS = [10, 11], EXIT_EXTRA = 0.2;
const AISLE = 0.24, SEAT_PITCH_Y = 0.505, SEAT_W = 0.5;
const rowX = (i) => ROW0 + i * PITCH + EXIT_EXTRA * EXIT_ROWS.filter((r) => r <= i).length;
const seatY = (k) => (k < 3 ? -1 : 1) * (AISLE + SEAT_PITCH_Y * ((k < 3 ? 2 - k : k - 3) + 0.5)); // A..F, top to bottom
const TEAM_ROW = 6;              // the team's block: rows 7 to 10, just ahead of the over-wing exits
const TEAM_SEATS = [3, 4];       // D (aisle) and E (middle), lower side of the aisle

const INK = "#26262a", MID = "#9a9aa0", SOFT = "#c3c3c8", HATCH = "#d3d3d6", WHISPER = "#e6e6e8";
const ease = (t) => 1 - Math.pow(1 - t, 4.2);   // close to cubic-bezier(.23,1,.32,1)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ the strip
export function cabinStrip(host, { seats = 8 } = {}) {
  const el = document.createElement("div");
  el.className = "cabin";
  const canvas = document.createElement("canvas");
  canvas.className = "cabin-plate";
  canvas.setAttribute("aria-hidden", "true");
  const probe = document.createElement("canvas");   // the seat is painted here, then copied
  probe.className = "cabin-probe";
  probe.setAttribute("aria-hidden", "true");
  el.append(canvas, probe);
  host.append(el);
  const ctx = canvas.getContext("2d");
  const base = document.createElement("canvas");
  const bctx = base.getContext("2d");

  // The team's seats in fill order: left to right on screen (aft to forward), top first.
  const cols = Math.ceil(seats / TEAM_SEATS.length);
  const team = [];
  for (let c = cols - 1; c >= 0; c--) for (const k of TEAM_SEATS) if (team.length < seats) team.push({ row: TEAM_ROW + c, k });
  const teamKey = new Set(team.map((t) => `${t.row}:${t.k}`));
  const anim = team.map(() => ({ from: 0, to: 0, t0: 0, dur: 0 }));
  let target = 0;

  let stale = true, W = 0, H = 0, dpr = 1, s = 1, ox = 0, cy = 0, sprites = null, seatPx = 0, raf = 0, dead = false;
  let fig = null, view = null;
  const X = (x) => ox - x * s, Y = (y) => cy + y * s;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  loadPart("parts/airline-seat.bin").then((data) => {
    if (dead) return;
    fig = new Figure(data); fig.holo = 0; fig.color = 0;
    if (W) { paintSprites(); drawBase(); drawTeam(performance.now()); kick(); }
  }).catch((e) => console.error("cabin: seat model", e));

  // ---------------------------------------------------------------- layout
  function layout() {
    const w = el.clientWidth;
    const d = Math.min(2, devicePixelRatio || 1);
    if (!w || (w === W && d === dpr)) return;
    W = w; dpr = d;
    H = Math.round(clamp(W * 0.3, 210, 420));
    el.style.height = `${H}px`;
    canvas.style.height = `${H}px`;
    canvas.width = base.width = Math.round(W * dpr);
    canvas.height = base.height = Math.round(H * dpr);

    // Fit the whole aeroplane when the strip is wide enough; on narrow strips keep the
    // fuselage a readable fraction of the height and frame the team's seats instead.
    const pad = Math.max(10, W * 0.012);
    const fit = (W - 2 * pad) / (SPAN[1] - SPAN[0]);
    s = Math.max(fit, (H * 0.27) / (2 * R));
    let c = (SPAN[0] + SPAN[1]) / 2;
    if (s > fit) {
      // keep the nose in view (it points at the competition) and the team's seats clear of the left edge
      const half = W / 2 / s;
      c = Math.max(SPAN[0] + half, rowX(TEAM_ROW + cols - 1) + 0.7 + 3 - half);
    }
    ox = W / 2 + c * s; cy = H / 2;
    if (fig) paintSprites();
    drawBase();
    drawTeam(performance.now());
    kick();
  }

  // ---------------------------------------------------------------- seat sprites
  // The seat is painted at twice its stamped size and scaled down, so the renderer's ink
  // lines come out finer than a pixel and the 160 small seats stay quiet.
  function paintSprites() {
    const sw = Math.max(4, Math.round(SEAT_W * s * dpr));
    if (sprites && sw === seatPx) return;
    seatPx = sw;
    const P = Math.max(48, Math.ceil((2 * sw) / 0.5));
    probe.style.width = probe.style.height = `${P}px`;
    if (!view) view = new View(probe, fig, { elevation: 89.5, azimuth: 270, fill: 0.9, dpr: 1 });
    else view.resize();
    const shots = [0, 1].map((c) => {
      fig.color = c; view.paint();
      const copy = document.createElement("canvas");
      copy.width = probe.width; copy.height = probe.height;
      copy.getContext("2d").drawImage(probe, 0, 0);
      return copy;
    });
    fig.color = 0;
    // Crop to the union of what both looks cover.
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const c of shots) {
      const { data, width, height } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) { sprites = null; return; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    // Sprite height (across the aircraft) is the seat width; length follows the model.
    const h = sw, w = Math.max(4, Math.round((cw / ch) * sw));
    const [draw, color] = shots.map((c) => {
      const out = document.createElement("canvas");
      out.width = w; out.height = h;
      const o = out.getContext("2d");
      o.imageSmoothingEnabled = true; o.imageSmoothingQuality = "high";
      o.drawImage(c, x0, y0, cw, ch, 0, 0, w, h);
      return out;
    });
    sprites = { draw, color, w, h };
  }

  // ---------------------------------------------------------------- the plate
  function drawBase() {
    const g = bctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, base.width, base.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = "round"; g.lineCap = "round";
    const hair = Math.max(0.5, 1 / dpr);
    const detail = s * SEAT_W > 6;  // windows, panels and other fine detail need room

    const path = (pts, close = true) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      if (close) g.closePath();
    };
    const stroke = (color, lw) => { g.strokeStyle = color; g.lineWidth = lw; g.stroke(); };
    const fillWhite = () => { g.fillStyle = "#fff"; g.fill(); };
    const line = (pts, color, lw, dash) => {
      path(pts, false);
      if (dash) g.setLineDash(dash);
      stroke(color, lw);
      if (dash) g.setLineDash([]);
    };
    // 45° hatching inside a world-space polygon, on a grid shared by every region.
    const hatch = (pts, gap, color = HATCH, lw = hair, dir = 1) => {
      const sx = pts.map(([x]) => X(x)), sy = pts.map(([, y]) => Y(y));
      const bx0 = Math.min(...sx), bx1 = Math.max(...sx), by0 = Math.min(...sy), by1 = Math.max(...sy);
      g.save(); path(pts); g.clip(); g.beginPath();
      if (dir > 0) {
        for (let k = Math.ceil((bx0 - by1) / gap); k <= Math.floor((bx1 - by0) / gap); k++) {
          g.moveTo(by0 + k * gap, by0); g.lineTo(by1 + k * gap, by1);
        }
      } else {
        for (let k = Math.ceil((bx0 + by0) / gap); k <= Math.floor((bx1 + by1) / gap); k++) {
          g.moveTo(k * gap - by0, by0); g.lineTo(k * gap - by1, by1);
        }
      }
      stroke(color, lw); g.restore();
    };
    const range = (a, b, step) => { const o = []; for (let x = a; x < b; x += step) o.push(x); o.push(b); return o; };
    const mirror = (pts) => pts.map(([x, y]) => [x, -y]);
    const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const ellipse = (x, y, rx, ry, color, lw) => {
      g.beginPath(); g.ellipse(X(x), Y(y), rx * s, ry * s, 0, 0, Math.PI * 2); stroke(color, lw);
    };

    // -------- centre line, fore and aft of the aircraft (a plate convention)
    g.setLineDash([14, 3, 2, 3]);
    g.beginPath(); g.moveTo(W + 2, cy); g.lineTo(X(-0.5), cy); g.moveTo(X(38.9), cy); g.lineTo(-2, cy);
    stroke(SOFT, hair); g.setLineDash([]);

    const wingPoly = (sg) => {
      const pts = [];
      for (const [y, l] of WING) pts.push([l, y * sg]);
      pts.push([22.35, 17.05 * sg], [22.15, 16.9 * sg]); // sharklet sliver at the tip
      for (const [y, , t] of [...WING].reverse()) pts.push([t, y * sg]);
      return pts;
    };
    const outsideWings = () => {
      g.beginPath(); g.rect(-10, -10, W + 20, H + 20);
      for (const sg of [-1, 1]) wingPoly(sg).forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.clip("evenodd");
    };

    for (const sg of [-1, 1]) {
      // -------- horizontal stabiliser
      const stab = [[32.3, 0.5 * sg], [35.55, 6.2 * sg], [36.75, 6.2 * sg], [35.95, 0.5 * sg]];
      path(stab); fillWhite(); stroke(INK, 0.85);
      const stabAt = (y, f) => { const t = (Math.abs(y) - 0.5) / 5.7; const l = 32.3 + 3.25 * t, r = 35.95 + 0.8 * t; return [l + (r - l) * f, y]; };
      const elev = [stabAt(0.9 * sg, 0.68), stabAt(5.9 * sg, 0.7), stabAt(5.9 * sg, 1), stabAt(0.9 * sg, 1)];
      line([elev[0], elev[1]], MID, 0.6);
      line([elev[1], elev[2]], MID, 0.6);
      hatch(elev, 3.2);

      // -------- wing
      const wp = wingPoly(sg);
      path(wp); fillWhite(); stroke(INK, 0.85);
      // slats and their breaks
      const slat = range(2.3, 16.6, 0.5).map((y) => [chordAt(y, 0.07), y * sg]);
      line(slat, MID, 0.55);
      for (const y of [2.3, 4.1, 5.0, 8.2, 11.0, 13.8, 16.6]) line([[le(y), y * sg], [chordAt(y, 0.07), y * sg]], MID, 0.55);
      // flaps, aileron
      const flapF = (y) => (y <= 6.3 ? 0.79 - (0.06 * (y - 2.0)) / 4.3 : 0.73);
      const fl = (y) => [chordAt(y, flapF(y)), y * sg];
      line([fl(2.0), fl(6.3), fl(12.4)], MID, 0.6);
      const ail = (y) => [chordAt(y, 0.745), y * sg];
      line([ail(12.55), ail(15.9)], MID, 0.6);
      for (const y of [2.0, 6.3, 12.4]) line([fl(y), [te(y), y * sg]], MID, 0.6);
      for (const y of [12.55, 15.9]) line([ail(y), [te(y), y * sg]], MID, 0.6);
      hatch([fl(2.0), fl(6.3), fl(12.4), [te(12.4), 12.4 * sg], [te(6.3), 6.3 * sg], [te(2.0), 2.0 * sg]], 3.4);
      // spoilers
      const sp = [3.0, 4.6, 6.25, 8.3, 10.3, 12.3];
      for (let i = 0; i < sp.length - 1; i++) {
        const a = sp[i] + 0.06, b = sp[i + 1] - 0.06;
        path([[chordAt(a, 0.6), a * sg], [chordAt(b, 0.6), b * sg], [chordAt(b, flapF(b) - 0.012), b * sg], [chordAt(a, flapF(a) - 0.012), a * sg]]);
        stroke(MID, 0.5);
      }
      // spars, faint and dashed (hidden structure), and access panels
      line(range(2.1, 16.6, 1).map((y) => [chordAt(y, 0.16), y * sg]), WHISPER, hair, [4, 3]);
      line(range(2.1, 16.6, 1).map((y) => [chordAt(y, 0.56), y * sg]), WHISPER, hair, [4, 3]);
      if (detail) for (const y of [3.4, 6.9, 8.6, 10.3, 12.0, 13.7, 15.3]) ellipse(chordAt(y, 0.34), y * sg, 0.17, 0.1, SOFT, hair);
      // wing root fillet
      line([[12.0, R * sg], [12.7, (R + 0.02) * sg], [le(2.15), 2.15 * sg]], INK, 0.7);

      // -------- engine: under the wing it is a hidden line, dashed
      const nx = range(11.1, 16.5, 0.1);
      const nac = [...nx.map((x) => [x, ENGINE_Y * sg - nacelle(x)]), ...[...nx].reverse().map((x) => [x, ENGINE_Y * sg + nacelle(x)])];
      const hx = range(14.0, 15.9, 0.1);
      g.setLineDash([3, 2.5]);
      for (const side of [-1, 1]) line(hx.map((x) => [x, ENGINE_Y * sg + side * nacelle(x)]), SOFT, hair * 1.2);
      line([[15.2, ENGINE_Y * sg - 0.55], [15.2, ENGINE_Y * sg + 0.55]], SOFT, hair * 1.2);
      line([[15.9, ENGINE_Y * sg - 0.42], [15.9, ENGINE_Y * sg + 0.42]], SOFT, hair * 1.2);
      g.setLineDash([]);

      g.save(); outsideWings();
      // -------- engine, the part ahead of the wing
      const vis = nx.filter((x) => x <= le(ENGINE_Y) + 0.4);
      path(nac); fillWhite(); stroke(INK, 0.85);
      // inlet lip, cowl shading lines, pylon
      line(range(-0.82, 0.82, 0.1).map((d) => [11.22 + 0.08 * (1 - (d / 0.84) ** 2), ENGINE_Y * sg + d]), MID, 0.55);
      for (const k of [0.93, 0.84, 0.7, 0.5]) for (const side of [-1, 1]) {
        line(vis.filter((x) => x > 11.35).map((x) => [x, ENGINE_Y * sg + side * k * nacelle(x)]), k > 0.8 ? SOFT : WHISPER, hair);
      }
      // pylon on top of the cowl, running back under the wing
      line([[15.5, ENGINE_Y * sg - 0.15], [12.75, ENGINE_Y * sg - 0.15], [12.55, ENGINE_Y * sg - 0.09], [12.5, ENGINE_Y * sg],
        [12.55, ENGINE_Y * sg + 0.09], [12.75, ENGINE_Y * sg + 0.15], [15.5, ENGINE_Y * sg + 0.15]], MID, 0.55);
      // -------- flap track fairings, the part behind the trailing edge
      for (const y of [3.6, 7.2, 9.9, 12.5]) {
        const x0 = te(y) - 1.1, x1 = te(y) + 1.3, yy = y * sg;
        const lens = range(x0, x1, 0.1).map((x) => [x, yy - 0.16 * Math.sin(Math.PI * (x - x0) / (x1 - x0)) ** 0.7]);
        const back = range(x0, x1, 0.1).reverse().map((x) => [x, yy + 0.16 * Math.sin(Math.PI * (x - x0) / (x1 - x0)) ** 0.7]);
        path([...lens, ...back]); fillWhite(); stroke(INK, 0.7);
      }
      g.restore();
    }

    // -------- fuselage
    const fx = [...range(0, NOSE, 0.08), ...range(NOSE + 0.5, TAPER, 1), ...range(TAPER, TAIL, 0.2)];
    const fus = [...fx.map((x) => [x, -hw(x)]), ...[...fx].reverse().map((x) => [x, hw(x)])];
    path(fus); fillWhite();

    // tail cone, skin on: frames and a little roundness
    for (let x = AFT_BULKHEAD + 0.55; x < TAIL - 0.2; x += 0.55) line([[x, -hw(x) * 0.985], [x, hw(x) * 0.985]], WHISPER, hair);
    for (const k of [0.82, 0.55]) for (const sg of [-1, 1]) {
      line(range(AFT_BULKHEAD + 0.2, TAIL, 0.2).map((x) => [x, sg * k * hw(x)]), k > 0.7 ? HATCH : WHISPER, hair);
    }
    line([[TAIL - 0.12, -TAIL_R * 0.8], [TAIL - 0.12, TAIL_R * 0.8]], MID, 0.5);          // APU exhaust
    ellipse(TAIL - 0.04, 0, 0.05, TAIL_R * 0.55, MID, 0.5);
    // radome joint and pitot probes
    line(range(-hw(1.25), hw(1.25), 0.1).map((y) => [1.25 + 0.05 * (1 - (y / hw(1.25)) ** 2), y]), SOFT, hair);
    for (const sg of [-1, 1]) for (const x of [2.35, 2.75]) line([[x, sg * hw(x)], [x + 0.06, sg * (hw(x) + 0.13)]], INK, 0.6);

    // the cut wall: skin and lining, hatched like a section
    const wallSide = (sg, a = FWD_BULKHEAD, b = AFT_BULKHEAD) => {
      const xs = range(a, b, 0.1);
      return [...xs.map((x) => [x, sg * hw(x)]), ...[...xs].reverse().map((x) => [x, sg * inner(x)])];
    };
    for (const sg of [-1, 1]) hatch(wallSide(sg), 2.2, HATCH);
    // forward pressure bulkhead (flat) and aft pressure bulkhead (a dome, convex aft)
    const fb = [[FWD_BULKHEAD, -inner(FWD_BULKHEAD)], [FWD_BULKHEAD + 0.1, -inner(FWD_BULKHEAD + 0.1)], [FWD_BULKHEAD + 0.1, inner(FWD_BULKHEAD + 0.1)], [FWD_BULKHEAD, inner(FWD_BULKHEAD)]];
    hatch(fb, 2.2); path(fb); stroke(MID, 0.55);
    const ri = inner(AFT_BULKHEAD);
    const dome = (off) => range(-ri, ri, 0.1).map((y) => [AFT_BULKHEAD + off + 0.4 * (1 - (y / ri) ** 2), y]);
    const db = [...dome(0), ...dome(0.11).reverse()];
    hatch(db, 2.2); line(dome(0), MID, 0.55); line(dome(0.11), INK, 0.7);
    for (const sg of [-1, 1]) line(range(FWD_BULKHEAD, AFT_BULKHEAD, 0.1).map((x) => [x, sg * inner(x)]), MID, 0.55);

    // openings in the wall: windows, doors, over-wing exits
    const opening = (x0, x1, sg) => {
      const xs = range(x0, x1, 0.05);
      const poly = [...xs.map((x) => [x, sg * (hw(x) + 0.02)]), ...[...xs].reverse().map((x) => [x, sg * (inner(x) - 0.01)])];
      path(poly); fillWhite();
      line([[x0, sg * hw(x0)], [x0, sg * inner(x0)]], INK, 0.6);
      line([[x1, sg * hw(x1)], [x1, sg * inner(x1)]], INK, 0.6);
      line(xs.map((x) => [x, sg * inner(x)]), MID, 0.5);
      return xs;
    };
    const doors = [[4.5, 5.35], [29.95, 30.8]];
    const exits = EXIT_ROWS.map((r) => rowX(r) - 0.1);
    for (const sg of [-1, 1]) {
      if (detail) {
        // windows at 21" pitch, which never quite lines up with the seats
        for (let x = 6.55; x < 29.7; x += 0.533) {
          if (exits.some((e) => Math.abs(e - x) < 0.4)) continue;
          const xs = opening(x - 0.115, x + 0.115, sg);
          line(xs.map((xx) => [xx, sg * (hw(xx) - WALL * 0.5)]), MID, hair);
        }
        // cockpit side windows
        for (const [a, b] of [[2.05, 2.75], [2.85, 3.45], [3.6, 4.05]]) {
          const xs = opening(a, b, sg);
          line(xs.map((xx) => [xx, sg * (hw(xx) - WALL * 0.5)]), MID, hair);
        }
      }
      for (const [a, b] of doors) {
        const xs = opening(a, b, sg);
        line(xs.map((xx) => [xx, sg * (hw(xx) - WALL * 0.5)]), INK, 0.6);
        // swing, outward and forward, and the slide pack on the door
        g.beginPath();
        g.arc(X(a), Y(sg * hw(a)), (b - a) * s, Math.PI, sg > 0 ? Math.PI / 2 : Math.PI * 1.5, sg > 0);
        g.setLineDash([2, 2.5]); stroke(SOFT, hair); g.setLineDash([]);
        path(rect(a + 0.12, b - 0.12, sg * (inner(a) - 0.02), sg * (inner(a) - 0.16))); stroke(MID, 0.5);
      }
      for (const e of exits) {
        const xs = opening(e - 0.25, e + 0.25, sg);
        line(xs.map((xx) => [xx, sg * (hw(xx) - WALL * 0.5)]), INK, 0.55);
      }
    }
    // windscreen: the skin ahead of the side windows is glazing
    for (const sg of [-1, 1]) line(range(1.6, 2.0, 0.05).map((x) => [x, sg * (hw(x) - WALL * 0.5)]), MID, hair);
    path(fus); stroke(INK, 0.9);

    // -------- cockpit
    const panelY = 1.05;
    const panel = (off) => range(-panelY, panelY, 0.1).map((y) => [1.86 + off + 0.2 * (y / panelY) ** 2, y]);
    line(panel(0), MID, 0.6); line(panel(0.3), MID, 0.6);
    line([panel(0)[0], panel(0.3)[0]], MID, 0.6); line([panel(0).at(-1), panel(0.3).at(-1)], MID, 0.6);
    if (detail) for (const y of [-0.92, -0.66, -0.15, 0.15, 0.66, 0.92]) {
      const x = 1.93 + 0.2 * (y / panelY) ** 2;
      path(rect(x, x + 0.17, y - 0.1, y + 0.1)); stroke(SOFT, hair);
    }
    path(rect(2.25, 3.55, -0.2, 0.2)); stroke(MID, 0.55);               // pedestal
    if (detail) for (const y of [-0.08, 0.08]) { path(rect(2.42, 2.62, y - 0.03, y + 0.03)); stroke(MID, hair); }
    for (const sg of [-1, 1]) {
      const y = 0.66 * sg;
      path(rect(2.82, 3.32, y - 0.24, y + 0.24)); stroke(MID, 0.6);     // pilot seat cushion
      path(rect(3.32, 3.5, y - 0.26, y + 0.26)); stroke(MID, 0.6);      // backrest
      path(rect(3.5, 3.58, y - 0.12, y + 0.12)); stroke(MID, 0.5);      // headrest
      for (const a of [-1, 1]) { path(rect(2.9, 3.3, y + a * 0.27 - 0.03, y + a * 0.27 + 0.03)); stroke(SOFT, hair); }
      ellipse(2.82, 1.08 * sg, 0.05, 0.05, MID, 0.5);                    // side stick
    }
    path(rect(3.75, 4.0, 0.72, 1.12)); stroke(SOFT, 0.5);               // observer seat
    // cockpit door and bulkhead
    for (const sg of [-1, 1]) {
      const wallPts = rect(4.18, 4.26, sg * 0.42, sg * inner(4.2));
      hatch(wallPts, 2.2); path(wallPts); stroke(MID, 0.55);
    }
    line([[4.22, -0.42], [4.22, 0.42]], INK, 0.6);
    g.beginPath(); g.arc(X(4.22), Y(-0.42), 0.84 * s, Math.PI / 2, 0, true);
    g.setLineDash([2, 2.5]); stroke(SOFT, hair); g.setLineDash([]);

    // -------- forward lav (top) and galley (bottom)
    const lav = (x0, x1, sg, doorAt) => {
      const yi = sg * 0.44, yo = sg * inner(x0);
      path(rect(x0, x1, yi, yo)); stroke(MID, 0.6);
      ellipse(x1 - 0.32, sg * 1.2, 0.2, 0.16, MID, 0.5);                // bowl
      path(rect(x1 - 0.14, x1 - 0.04, sg * 1.02, sg * 1.38)); stroke(MID, 0.5);
      path(rect(x0 + 0.08, x0 + 0.42, sg * 1.25, sg * 1.7)); stroke(MID, 0.5); // basin unit
      ellipse(x0 + 0.25, sg * 1.47, 0.09, 0.07, SOFT, hair);
      // bifold door on the aisle side
      const a = doorAt - 0.3, b = doorAt + 0.3;
      g.beginPath(); g.moveTo(X(a), Y(yi)); g.lineTo(X(b), Y(yi)); g.strokeStyle = "#fff"; g.lineWidth = 1.6; g.stroke();
      line([[a, yi], [(a + b) / 2, yi + sg * 0.15], [b, yi]], MID, 0.5);
    };
    const galley = (x0, x1, y0, y1, n) => {
      path(rect(x0, x1, y0, y1)); stroke(MID, 0.6);
      const dy = (y1 - y0) / n;
      for (let i = 0; i < n; i++) {
        const c = rect(x0 + 0.08, x0 + 0.48, y0 + dy * i + 0.03, y0 + dy * (i + 1) - 0.03);
        path(c); stroke(SOFT, hair);
        if (i % 2 === 0) hatch(c, 2.6, WHISPER);
      }
      line([[x0 + 0.62, y0 + 0.04], [x0 + 0.62, y1 - 0.04]], SOFT, hair);
    };
    lav(5.45, 6.6, -1, 6.0);
    galley(5.45, 6.6, 0.44, inner(5.45), 3);
    // -------- aft lavs, aft galley across the back
    lav(28.75, 29.85, -1, 29.3);
    lav(28.75, 29.85, 1, 29.3);
    galley(30.88, 31.62, -inner(31.0), inner(31.0), 7);

    // -------- seat tracks under the rows
    for (const y of [-1.4, -0.62, 0.62, 1.4]) line([[ROW0 - 0.1, y], [rowX(ROWS - 1) + 0.75, y]], WHISPER, hair);

    // -------- vertical fin over the tail cone
    const fin0 = 31.6, fin1 = 38.25;
    const finHW = (x) => 0.17 * Math.sin(Math.PI * clamp((x - fin0) / (fin1 - fin0), 0, 1)) ** 0.6;
    const fxs = range(fin0, fin1, 0.1);
    const fin = [...fxs.map((x) => [x, -finHW(x)]), ...[...fxs].reverse().map((x) => [x, finHW(x)])];
    path(fin); fillWhite(); stroke(INK, 0.8);
    hatch(fin, 2.4, HATCH, hair, -1);
    line([[36.2, -finHW(36.2)], [36.2, finHW(36.2)]], MID, 0.55);

    // -------- seats
    if (sprites) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (let r = 0; r < ROWS; r++) for (let k = 0; k < 6; k++) {
        if (teamKey.has(`${r}:${k}`)) continue;
        stamp(g, sprites.draw, r, k, 1);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // -------- the team's block: a hairline around it
    const tb = teamBox();
    g.beginPath();
    g.roundRect(tb.x / dpr, tb.y / dpr, tb.w / dpr, tb.h / dpr, Math.max(1.5, 0.08 * s));
    stroke("#111", 1);

    // -------- feather the edges into the page
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-out";
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    };
    const fv = base.height * 0.1, fh = base.width * 0.07;
    fade(0, 0, 0, fv, 0, 0, base.width, fv);
    fade(0, base.height, 0, base.height - fv, 0, base.height - fv, base.width, fv);
    if (X(SPAN[1]) < 0) fade(0, 0, fh, 0, 0, 0, fh, base.height);
    if (X(SPAN[0]) > W) fade(base.width, 0, base.width - fh, 0, base.width - fh, 0, fh, base.height);
    g.globalCompositeOperation = "source-over";
    stale = true;
  }

  // Seat centre in device pixels.
  function seatAt(r, k) {
    return [(X(rowX(r) + 0.35)) * dpr, Y(seatY(k)) * dpr];
  }
  function stamp(g, img, r, k, scale) {
    const [x, y] = seatAt(r, k);
    const w = sprites.w * scale, h = sprites.h * scale;
    g.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }
  function teamBox() {
    const xs = [], ys = [];
    for (const t of team) { const [x, y] = seatAt(t.row, t.k); xs.push(x); ys.push(y); }
    const hwid = (sprites ? sprites.w : 0.68 * s * dpr) / 2, hh = (SEAT_W * s * dpr) / 2;
    const m = Math.max(3 * dpr, 0.1 * s * dpr);
    const x0 = Math.min(...xs) - hwid - m, x1 = Math.max(...xs) + hwid + m;
    const y0 = Math.min(...ys) - hh - m, y1 = Math.max(...ys) + hh + m;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---------------------------------------------------------------- the team's seats
  const valueOf = (a, now) => {
    if (now >= a.t0 + a.dur) return a.to;
    if (now <= a.t0) return a.from;
    return a.from + (a.to - a.from) * ease((now - a.t0) / a.dur);
  };
  function drawTeam(now) {
    if (!W) return;
    const tb = teamBox();
    const rx = Math.floor(tb.x + 2 * dpr), ry = Math.floor(tb.y + 2 * dpr);
    const rw = Math.ceil(tb.w - 4 * dpr), rh = Math.ceil(tb.h - 4 * dpr);
    // the whole plate once per new base, then only the block
    if (stale) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0); stale = false; }
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.clearRect(rx, ry, rw, rh);
    ctx.drawImage(base, rx, ry, rw, rh, rx, ry, rw, rh);
    if (sprites) team.forEach((t, i) => {
      const a = anim[i], v = valueOf(a, now);
      if (v < 1) { ctx.globalAlpha = Math.min(1, 2 * (1 - v)); stamp(ctx, sprites.draw, t.row, t.k, 1); }
      if (v > 0) {
        ctx.globalAlpha = v;
        ctx.shadowColor = `rgba(17,17,17,${0.3 * v})`;
        ctx.shadowBlur = 3 * dpr * v; ctx.shadowOffsetX = 0.5 * dpr * v; ctx.shadowOffsetY = 1.2 * dpr * v;
        stamp(ctx, sprites.color, t.row, t.k, 1 + 0.05 * v);
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }
  function tick() {
    raf = 0;
    const now = performance.now();
    drawTeam(now);
    if (anim.some((a) => now < a.t0 + a.dur)) raf = requestAnimationFrame(tick);
  }
  // Frames can be throttled (a hidden tab); a timer lands the final state regardless.
  let settle = 0;
  const kick = () => {
    if (dead) return;
    if (!raf) raf = requestAnimationFrame(tick);
    const end = Math.max(0, ...anim.map((a) => a.t0 + a.dur)) - performance.now();
    clearTimeout(settle);
    if (end > 0) settle = setTimeout(() => drawTeam(performance.now()), end + 16);
  };

  function set(n) {
    n = clamp(Math.round(Number(n) || 0), 0, seats);
    if (n === target) return;
    const now = performance.now(), filling = n > target;
    const changed = [];
    team.forEach((_, i) => { if (anim[i].to !== (i < n ? 1 : 0)) changed.push(i); });
    if (!filling) changed.reverse();
    const instant = reduce.matches;
    changed.forEach((i, k) => {
      const a = anim[i];
      a.from = valueOf(a, now); a.to = i < n ? 1 : 0;
      a.t0 = now + (instant ? 0 : k * 60); a.dur = instant ? 0 : 340;
    });
    target = n;
    kick();
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(el);
  layout();   // paint now rather than on the observer's first frame

  function destroy() {
    dead = true;
    ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(settle);
    el.remove();
  }

  return { el, set, destroy };
}
