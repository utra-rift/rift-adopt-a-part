// Everything RIFT's first season needs, from the 2026–27 budget (CAD, tax included), plus
// items 33–57 the captain added after it, priced from the suppliers in
// docs/budget-additions.md (quantities estimated).
//
// LINES are the budget lines. Items 1–25, less the omni wheels (item 4), were funded by
// the Skule Endowment Fund. Everything else is open, the wheels included: the sheet counts
// them as an in-kind donation, but that isn't certain, so they're priced as a purchase.
// Like every DJI line, that's the US price × 1.3864 CAD/USD × 1.13 HST: 4 × $21.99 at
// goBILDA (SKU 3624-0014-0096) is $137.80. The sheet's $121.95 leaves out the HST.
//
// OFFERS are what a sponsor can pick: a single part, a bundle, or part of the trip. An
// offer's price is the sum of its lines, which places it in a tier. The same line can
// appear in several offers (a motor on its own and inside its subsystem); the crate
// counts each line once, so nothing is ever paid for twice.
//
// The budget sheet estimated the trip (items 31 and 32) for Purdue, last season's venue.
// The competition is now at UT Arlington, so those two lines are re-estimated the same way:
// the drive is Google Maps' fastest route from campus to UTA, 2,267 km each way, at the
// sheet's $0.50/km; the flight is the sheet's $850.50 scaled by Toronto–Dallas over
// Toronto–Indianapolis, the cheapest nonstop return for the same dates (Jun 29 – Jul 5,
// 2027, checked Oct 27, 2026): CA$775 / CA$719.

import type { BudgetLine, Offer } from "./types.ts";

export const TIERS = [
  { id: "bronze", name: "Bronze", min: 500, perks: ["Website logo", "Pit signage", "Sponsor acknowledgement", "Scheduled build update"] },
  { id: "silver", name: "Silver", min: 1000, perks: ["Robot logo placement", "Team demonstration"] },
  { id: "gold", name: "Gold", min: 3000, perks: ["Sponsor-led technical session", "Opt-in recruiting introductions"] },
  { id: "title", name: "Title", min: 5000, perks: ["Robot naming recognition"] },
];
export const tierFor = (amount) => [...TIERS].reverse().find((t) => amount >= t.min) ?? null;

export const ADOPTERS = {
  sef: "the Skule Endowment Fund",
};

// The first argument is the item number in the budget.
const L = (n: number, name: string, qty: number, price: number, cad: string | null, extra: Partial<BudgetLine> = {}): BudgetLine => ({ n, name, qty, price, cad, ...extra });
export const LINES: Record<string, BudgetLine> = {
  m3508: L(1, "M3508 P19 brushless gear motor", 5, 509.16, "m3508-p19", { note: "4 installed + 1 spare", adopted: "sef" }),
  c620d: L(2, "C620 motor speed controller", 5, 266.33, "c620", { note: "drivetrain, 4 + 1 spare", adopted: "sef" }),
  kit: L(3, "M3508 accessories kit", 1, 59.53, "m3508-kit", { note: "CAN hub board and leads", adopted: "sef" }),
  wheels: L(4, "goBILDA omni wheel, 96 mm", 4, 137.8, "omni-wheel", { note: "one per drive motor" }),
  gm6020: L(5, "GM6020 gimbal motor", 3, 549.89, "gm6020", { note: "2 installed + 1 spare", adopted: "sef" }),
  m2006: L(6, "M2006 P36 feeder motor", 2, 112.8, "m2006-p36", { note: "1 installed + 1 spare", adopted: "sef" }),
  c610: L(7, "C610 motor speed controller", 2, 78.33, "c610", { adopted: "sef" }),
  uv: L(8, "17 mm fluorescent projectile charger", 1, 12.53, "projectile-charger", { adopted: "sef" }),
  m3508bare: L(9, "M3508 flywheel motor, no gearbox", 3, 141.0, "m3508-bare", { note: "2 installed + 1 spare", adopted: "sef" }),
  c620l: L(10, "C620 motor speed controller", 2, 106.53, "c620", { note: "flywheels", adopted: "sef" }),
  devc: L(11, "RoboMaster Development Board Type C", 2, 144.13, "devboard-c", { note: "1 installed + 1 spare", adopted: "sef" }),
  cam: L(12, "Arducam OV9782 USB camera, M12 lens", 1, 93.98, "arducam-ov9782", { adopted: "sef" }),
  rpi5: L(13, "Raspberry Pi 5, 8 GB", 1, 276.79, "rpi5", { adopted: "sef" }),
  hat: L(14, "Raspberry Pi AI HAT+, Hailo-8L", 1, 114.64, "rpi-ai-hat", { adopted: "sef" }),
  rack: L(15, "Battery Rack 2", 1, 59.53, "battery-rack-2", { adopted: "sef" }),
  batt: L(16, "DJI Matrice 4D battery", 4, 620.39, "matrice-4d-battery", { note: "1 running + 3 charging", adopted: "sef" }),
  supercap: L(17, "Supercapacitor bank and power electronics", 1, 113.0, "supercap-bank", { note: "team-built", adopted: "sef" }),
  hub: L(18, "Matrice 4D 240W charging hub", 1, 202.1, "matrice-charging-hub", { adopted: "sef" }),
  adapter: L(19, "DJI 240W power adapter", 1, 333.69, "dji-240w-adapter", { adopted: "sef" }),
  mc02: L(20, "Main Control Module MC02", 1, 159.8, "mc02", { adopted: "sef" }),
  am03: L(21, "Small Armor Module AM03", 4, 783.32, "am03", { adopted: "sef" }),
  sm01: L(22, "Speed Monitor Module SM01", 1, 155.1, "sm01", { adopted: "sef" }),
  fi02: L(23, "RFID Module FI02", 1, 72.07, "fi02", { adopted: "sef" }),
  pm02: L(24, "Power Module PM02", 1, 155.1, "pm02", { adopted: "sef" }),
  li01: L(25, "Light Bar Module LI01", 1, 156.66, "li01", { adopted: "sef" }),
  vt03: L(26, "Video Transmission Module VT03", 1, 365.03, "vt03", { note: "the pilot's video link" }),
  cm01: L(27, "Supercapacitor Management Module CM01", 1, 23.5, "cm01"),
  mat: L(28, "Carbon-fibre sheet, nylon-CF filament and fabrication materials", 1, 2260.0, "filament-spool", {
    note: "4 sheets, 4 kg filament, inserts and consumables",
    parts: [
      { name: "Carbon-fibre laminate sheet", qty: 4, cad: "cf-sheet" },
      { name: "Nylon-CF filament", qty: 4, unit: "kg", cad: "filament-spool" },
    ] }),
  ammo: L(29, "17 mm fluorescent projectiles", 1, 142.56, "projectile-17mm", { note: "one package, for testing" }),
  entry: L(30, "ARC 1v1 event registration", 1, 207.96, "entry-ticket"),
  van: L(31, "Return drive with the robot", 4534, 2267.0, "cargo-van", { unit: "km", note: "estimated, Toronto to UT Arlington" }),
  // Added after the budget, one exact product per line like the rest. No models yet, so
  // they stand in as cubes.
  pcb: L(33, "JLCPCB PCB round: three boards × 5, components and shipping", 3, 342.0, "pcb-round", { note: "supercap controller, power distribution, gimbal adapter" }),
  yawbearing: L(34, "Four-point-contact thin-section bearing KA040XP0, 101.6 × 114.3 × 6.35 mm", 1, 76.48, "ka040xp0", { note: "yaw; the slip ring passes through its bore" }),
  pitchbearing: L(35, "Four-point-contact thin-section bearing KA020XP0, 50.8 × 63.5 × 6.35 mm", 2, 80.42, "ka020xp0", { note: "pitch, one each side" }),
  bearingkit: L(36, "Yuahar miniature bearing assortment, 10 sizes, 70 pieces", 1, 30.5, "bearing-kit", { note: "idlers, feeder and power transmission" }),
  b6800: L(37, "6800-2RS bearing, 10 × 19 × 5 mm, 10-pack", 1, 19.2, "bearing-6800", { note: "flywheel supports" }),
  al14: L(38, "6061 aluminium sheet, 1/4 in, 12 × 12 in", 2, 61.23, "al-sheet-quarter", { note: "motor mounts, turret base" }),
  al18: L(39, "6061 aluminium sheet, 1/8 in, 12 × 12 in", 2, 45.19, "al-sheet-eighth", { note: "brackets and covers" }),
  bar: L(40, "6061 aluminium round bar, 1 in × 12 in", 2, 33.78, "round-bar-6061", { note: "pitch stubs and flywheel hubs" }),
  standoffs: L(41, "M3 aluminium hex standoff kit, 48 pieces", 1, 25.98, "m3-standoffs"),
  spacers: L(42, "M3 aluminium round spacer kit, 65 pieces", 1, 28.24, "m3-spacers"),
  pa6: L(43, "Polymaker PA6-CF20 nylon-CF filament", 2, 169.48, "filament-spool", { unit: "kg", note: "gimbal and launcher prints" }),
  slipring: L(44, "Capsule slip ring: gigabit Ethernet, 2 × 20 A and 2 × 2 A rings, flanged", 1, 159.32, "slip-ring", { note: "power, CAN and data through the yaw axis" }),
  w12: L(45, "BNTECHGO 12 AWG silicone wire, red and black", 10, 24.0, "wire-12awg", { unit: "ft" }),
  w14: L(46, "BNTECHGO 14 AWG silicone wire, red and black", 20, 32.01, "wire-14awg", { unit: "ft" }),
  w18: L(47, "BNTECHGO 18 AWG silicone wire", 25, 22.4, "wire-18awg", { unit: "ft" }),
  w22: L(48, "BNTECHGO 22 AWG silicone wire kit, 10 colours", 1, 21.28, "wire-22awg-kit"),
  screws: L(49, "M2–M5 socket head screw assortment, grade 12.9, 1,760 pieces", 1, 32.76, "screw-kit"),
  nylock: L(50, "M3–M8 nylock nut assortment, 150 pieces", 1, 12.41, "nylock-kit"),
  rivets: L(51, "Blind rivet assortment with hand riveter, 226 pieces", 1, 23.27, "rivet-kit", { note: "the riveter may be borrowed" }),
  zipties: L(52, "Zip ties, 4 to 14 in, 1,000 pieces", 1, 29.37, "zip-ties"),
  crimper: L(53, "Engineer PA-09 crimping tool", 1, 73.17, "crimper-pa09", { note: "may be borrowed" }),
  xt30: L(54, "Amass XT30U connectors, 20 pairs", 1, 18.07, "xt30u"),
  xt60: L(55, "Amass XT60H connectors, 10 pairs", 1, 19.98, "xt60h"),
  jstgh: L(56, "JST-GH housings (80) and contacts (500) kit", 1, 28.67, "jst-gh-kit"),
  tpu: L(57, "OVERTURE TPU 95A filament for the friction wheel treads", 1, 29.37, "filament-spool", { unit: "kg" }),
};
// Eight return flights, one line per seat so seats can be taken one at a time.
for (let i = 1; i <= 8; i++) LINES[`seat${i}`] = L(32, "Return flight to the competition", 1, 916.74, "airline-seat");
const SEATS = (n) => Array.from({ length: n }, (_, i) => `seat${i + 1}`);

const O = (id: string, code: string, name: string, lines: string[], show: string[], line: string, extra: Partial<Offer> = {}): Offer => ({ id, code, name, lines, show, line, ...extra });
export const OFFERS = [
  // Open: still needs a sponsor.
  O("trip", "TRIP", "The whole trip", [...SEATS(8), "van", "entry"], ["cargo-van", "airline-seat", "airline-seat"], "Eight flights, the drive and the entry fee: everything that gets RIFT to its first competition."),
  O("fly8", "8 SEATS", "Fly the team", SEATS(8), ["airline-seat", "airline-seat", "airline-seat", "airline-seat"], "Return flights for the eight members who pilot, repair and run the robot at the competition."),
  O("finish", "FINISH", "Finish it and drive it there", ["mat", "vt03", "ammo", "cm01", "van", "entry"], ["filament-spool", "cargo-van", "vt03"], "Everything the robot still needs, and the 4,534 km drive to Arlington and back."),
  O("fly4", "4 SEATS", "Fly half the team", SEATS(4), ["airline-seat", "airline-seat", "airline-seat"], "Four of the eight return flights."),
  O("chassis", "CHASSIS", "Chassis materials", ["mat"], ["filament-spool", "cf-sheet"], "Carbon-fibre sheet for the frame plates and nylon-carbon filament for printed brackets and mounts."),
  O("fly2", "2 SEATS", "Two seats", SEATS(2), ["airline-seat", "airline-seat"], "Two return flights to the competition."),
  O("road", "ROAD", "The road trip", ["van", "entry"], ["cargo-van"], "4,534 km there and back with the robot in the van, and the team's ARC 1v1 entry fee."),
  O("seat", "SEAT", "A seat on the plane", ["seat1"], ["airline-seat"], "One member's return flight to the competition. Eight seats to fill.", { seat: true }),
  O("van", "VAN", "The van", ["van"], ["cargo-van"], "The robot rides 4,534 km to Arlington, Texas, and back."),
  O("match", "MATCH KIT", "Match kit", ["vt03", "ammo", "cm01"], ["vt03", "projectile-17mm", "cm01"], "The pilot's video link, a package of test projectiles and the supercapacitor monitor."),
  // Adopted: funded already, shown so sponsors can see what's done.
  O("turret", "TURRET", "The turret", ["gm6020", "m2006", "c610", "uv", "m3508bare", "c620l", "devc", "cam", "rpi5", "hat"], ["gm6020", "m2006-p36", "rpi5"], "Aims, feeds, fires and sees: gimbal motors, launcher, vision computer and control board."),
  O("referee", "SCORING", "Referee and armor", ["mc02", "sm01", "fi02", "pm02", "li01", "am03"], ["am03", "mc02"], "The competition electronics that score hits, check projectile speed and limit power."),
  O("power", "POWER", "Power and charging", ["batt", "rack", "supercap", "hub", "adapter"], ["matrice-4d-battery", "battery-rack-2"], "Four batteries in rotation, the rack, the supercapacitor bank and the charging station."),
  O("drive", "DRIVE", "Drivetrain", ["m3508", "c620d", "kit"], ["m3508-p19", "c620"], "Four motors for the X-drive base, their controllers and a spare of each."),
  O("armor", "ARMOR", "Armor panels", ["am03"], ["am03"], "Four armor modules that register every hit."),
  O("refkit", "REFEREE", "Referee electronics", ["mc02", "sm01", "fi02", "pm02", "li01"], ["mc02", "li01"], "Main control, speed monitor, RFID, power module and light bar."),
  O("brain", "BRAIN", "Brain and eyes", ["rpi5", "hat", "cam", "devc"], ["rpi5", "devboard-c"], "The vision computer, its AI accelerator, the camera and the control board."),
  O("batteries", "BATTERIES", "Batteries", ["batt"], ["matrice-4d-battery"], "Four DJI Matrice 4D batteries: one running, three charging."),
  O("gimbal", "AIM MOTORS", "Gimbal motors", ["gm6020"], ["gm6020"], "Yaw and pitch for the turret, plus a spare."),
  O("motors", "MOTORS", "Drive motors", ["m3508"], ["m3508-p19"], "Four M3508 gear motors and a spare."),
  O("wheels", "WHEELS", "Omni wheels", ["wheels"], ["omni-wheel"], "Four goBILDA 96 mm omni wheels for the X-drive base."),
];

export const priceOf = (o) => o.lines.reduce((s, k) => s + LINES[k].price, 0);
export const isAdopted = (o) => !o.seat && o.lines.every((k) => LINES[k].adopted);
export const adopterOf = (o) => ADOPTERS[LINES[o.lines[0]].adopted];
export const BUDGET = Object.values(LINES).reduce((s, l) => s + l.price, 0);
export const ADOPTED_TOTAL = Object.values(LINES).filter((l) => l.adopted).reduce((s, l) => s + l.price, 0);

// Sections, highest tier first; open offers before adopted ones, dearest first. Adopted
// offers under $500 sit with Bronze.
export const SECTIONS = [...TIERS].reverse().map((t, i, all) => {
  const hi = i ? all[i - 1].min : Infinity;
  const items = OFFERS.filter((o) => {
    const p = priceOf(o);
    return (p >= t.min || (t.id === "bronze" && isAdopted(o))) && p < hi;
  }).sort((a, b) => isAdopted(a) - isAdopted(b) || priceOf(b) - priceOf(a));
  return { tier: t, items };
}).filter((s) => s.items.length);

// Every budget line on its own, grouped the way the budget groups them. This is what the
// site shows (app.ts keeps the bundles above at ?bundles).
const ITEM_LABELS = {
  m3508: "DRIVE MOTORS", c620d: "DRIVE CONTROL", kit: "WIRING KIT", wheels: "WHEELS",
  gm6020: "AIM MOTORS", m2006: "FEED MOTORS", c610: "FEED CONTROL", uv: "UV CHARGER", m3508bare: "LAUNCH MOTORS", c620l: "LAUNCH CONTROL",
  devc: "CONTROL BOARD", cam: "CAMERA", rpi5: "COMPUTER", hat: "AI CHIP", vt03: "VIDEO LINK",
  rack: "BATTERY RACK", batt: "BATTERIES", supercap: "SUPERCAPS", hub: "CHARGING HUB", adapter: "POWER ADAPTER", cm01: "CAP MONITOR",
  mc02: "REFEREE", am03: "ARMOR", sm01: "SPEED MONITOR", fi02: "RFID", pm02: "POWER MODULE", li01: "LIGHT BAR",
  mat: "CHASSIS", ammo: "AMMO", entry: "ENTRY", van: "VAN",
  pcb: "PCBS", slipring: "SLIP RING",
};
const BUDGET_GROUPS: [string, string[]][] = [
  ["Drivetrain", ["m3508", "c620d", "kit", "wheels"]],
  ["Turret and launcher", ["gm6020", "m2006", "c610", "uv", "m3508bare", "c620l", "bearings", "slipring", "filament"]],
  ["Control, vision and video", ["devc", "cam", "rpi5", "hat", "vt03"]],
  ["Power and charging", ["rack", "batt", "supercap", "hub", "adapter", "cm01"]],
  ["Scoring system", ["mc02", "am03", "sm01", "fi02", "pm02", "li01"]],
  ["Wiring and electronics", ["pcb", "wire", "connectors"]],
  ["Materials and projectiles", ["mat", "aluminium", "hardware", "ammo"]],
  ["Getting there", ["entry", "van", "seat"]],
];
// A line shows each of its parts as many times as it buys them; a measure (4 kg, 4,534 km)
// shows once. The first one shown is the big one, so a one-off part leads its multiples.
const copiesOf = (l) => (l.parts ?? [l]).filter((p) => p.cad).map((p) => Array(p.unit ? 1 : p.qty).fill(p.cad))
  .sort((a, b) => a.length - b.length).flat();
// The small things added after the budget, listed as kits of one kind each (every product
// and its quantity is still named inside). A kit is drawn as one product: its first part.
const KITS: Record<string, [string, string, string[], string]> = {
  bearings: ["BEARINGS", "Bearings", ["yawbearing", "pitchbearing", "bearingkit", "b6800"],
    "The yaw and pitch bearings the turret turns on, and small bearings for the flywheels, feeder and drive stages."],
  filament: ["FILAMENT", "Filament for the gimbal and launcher", ["pa6", "tpu"],
    "Nylon-CF for the gimbal and launcher's printed parts, and TPU for the friction wheel treads."],
  aluminium: ["ALUMINIUM", "Aluminium stock", ["al14", "al18", "bar"],
    "Quarter- and eighth-inch 6061 sheet for mounts and brackets, and round bar for shafts and hubs."],
  hardware: ["HARDWARE", "Fasteners and hardware", ["screws", "nylock", "rivets", "standoffs", "spacers", "zipties"],
    "Screws, nylock nuts, rivets, standoffs, spacers and zip ties: what holds the robot together."],
  wire: ["WIRE", "Silicone wire", ["w12", "w14", "w18", "w22"],
    "12 to 22 AWG silicone wire for the battery, motors and signals."],
  connectors: ["CONNECTORS", "Connectors and crimper", ["xt60", "xt30", "jstgh", "crimper"],
    "XT30 and XT60 power connectors, JST-GH signal connectors, and the crimper for their contacts."],
};
const modelOf = (l) => (l.parts ?? [l]).find((p) => p.cad)?.cad;
const itemOf = (k) => {
  if (k === "seat") return OFFERS.find((o) => o.seat);
  if (KITS[k]) {
    const [code, name, lines, line] = KITS[k];
    const model = modelOf(LINES[lines[0]]);
    return O(`kit-${k}`, code, name, lines, model ? [model] : [], line);
  }
  const l = LINES[k];
  return O(`item-${k}`, ITEM_LABELS[k], l.name, [k], copiesOf(l), l.note ?? "", { hero: true });
};
export const ITEM_SECTIONS = BUDGET_GROUPS.map(([name, keys]) => {
  const items = keys.map(itemOf);
  return { name, items, total: items.flatMap((o) => (o.seat ? SEATS(8) : o.lines)).reduce((s, k) => s + LINES[k].price, 0) };
});
// The robot parts (and the entry ticket) still up for adoption, dearest first. The drive
// and the flights have their own section, where a sponsor picks how many km or seats.
const TRAVEL = new Set(["van", ...SEATS(8)]);
export const ITEMS = ITEM_SECTIONS.flatMap((g) => g.items);
export const OPEN_ITEMS = ITEMS.filter((o) => !isAdopted(o) && !o.lines.some((k) => TRAVEL.has(k))).sort((a, b) => priceOf(b) - priceOf(a));
export const TRIP = {
  km: LINES.van.qty, perKm: LINES.van.price / LINES.van.qty,
  seats: SEATS(8).length, perSeat: LINES.seat1.price,
};

export const money = (v, cents = true) =>
  "$" + v.toLocaleString("en-CA", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
