// Everything RIFT's first season needs, from the 2026–27 budget (CAD, tax included).
//
// LINES are the budget lines. Items 1–25 (less the donated wheels, item 4) were funded
// by the Skule Endowment Fund; the wheels were donated in kind. Everything else is open.
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

export const TIERS = [
  { id: "bronze", name: "Bronze", min: 500, perks: ["Website logo", "Pit signage", "Sponsor acknowledgement", "Scheduled build update"] },
  { id: "silver", name: "Silver", min: 1000, perks: ["Robot logo placement", "Team demonstration"] },
  { id: "gold", name: "Gold", min: 3000, perks: ["Sponsor-led technical session", "Opt-in recruiting introductions"] },
  { id: "title", name: "Title", min: 5000, perks: ["Robot naming recognition"] },
];
export const tierFor = (amount) => [...TIERS].reverse().find((t) => amount >= t.min) ?? null;

export const ADOPTERS = {
  sef: "the Skule Endowment Fund",
  donation: "an in-kind donation",
};

// The first argument is the item number in the budget.
const L = (n, name, qty, price, cad, extra = {}) => ({ n, name, qty, price, cad, ...extra });
export const LINES = {
  m3508: L(1, "M3508 P19 brushless gear motor", 5, 509.16, "m3508-p19", { note: "4 installed + 1 spare", adopted: "sef" }),
  c620d: L(2, "C620 motor speed controller", 5, 266.33, "c620", { note: "drivetrain, 4 + 1 spare", adopted: "sef" }),
  kit: L(3, "M3508 accessories kit", 1, 59.53, "m3508-kit", { note: "CAN hub board and leads", adopted: "sef" }),
  wheels: L(4, "goBILDA omni wheel, 96 mm", 4, 121.95, "omni-wheel", { adopted: "donation" }),
  gm6020: L(5, "GM6020 gimbal motor", 3, 549.89, "gm6020", { note: "2 installed + 1 spare", adopted: "sef" }),
  m2006: L(6, "M2006 P36 feeder motor", 2, 112.8, "m2006-p36", { note: "1 installed + 1 spare", adopted: "sef" }),
  c610: L(7, "C610 motor speed controller", 2, 78.33, "c610", { adopted: "sef" }),
  uv: L(8, "17 mm fluorescent projectile charger", 1, 12.53, "projectile-charger", { adopted: "sef" }),
  m3508bare: L(9, "M3508 flywheel motor, no gearbox", 3, 141.0, "m3508-bare", { note: "2 installed + 1 spare", adopted: "sef" }),
  c620l: L(10, "C620 motor speed controller", 2, 106.53, "c620", { note: "flywheels", adopted: "sef" }),
  devc: L(11, "RoboMaster Development Board Type C", 2, 144.13, "devboard-c", { note: "1 installed + 1 spare", adopted: "sef" }),
  cam: L(12, "Arducam OV9782 USB camera, M12 lens", 1, 93.98, null, { adopted: "sef" }),
  rpi5: L(13, "Raspberry Pi 5, 8 GB", 1, 276.79, "rpi5", { adopted: "sef" }),
  hat: L(14, "Raspberry Pi AI HAT+, Hailo-8L", 1, 114.64, null, { adopted: "sef" }),
  rack: L(15, "Battery Rack 2", 1, 59.53, "battery-rack-2", { adopted: "sef" }),
  batt: L(16, "DJI Matrice 4D battery", 4, 620.39, "matrice-4d-battery", { note: "1 running + 3 charging", adopted: "sef" }),
  supercap: L(17, "Supercapacitor bank and power electronics", 1, 113.0, null, { note: "team-built", adopted: "sef" }),
  hub: L(18, "Matrice 4D 240W charging hub", 1, 202.1, null, { adopted: "sef" }),
  adapter: L(19, "DJI 240W power adapter", 1, 333.69, null, { adopted: "sef" }),
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
  entry: L(30, "ARC 1v1 event registration", 1, 207.96, null),
  van: L(31, "Return drive with the robot", 4534, 2267.0, "cargo-van", { unit: "km", note: "estimated, Toronto to UT Arlington" }),
};
// Eight return flights, one line per seat so seats can be taken one at a time.
for (let i = 1; i <= 8; i++) LINES[`seat${i}`] = L(32, "Return flight to the competition", 1, 916.74, "airline-seat");
const SEATS = (n) => Array.from({ length: n }, (_, i) => `seat${i + 1}`);

const O = (id, code, name, lines, show, line, extra = {}) => ({ id, code, name, lines, show, line, ...extra });
export const OFFERS = [
  // Open: still needs a sponsor.
  O("trip", "TRIP", "The whole trip", [...SEATS(8), "van", "entry"], ["cargo-van", "airline-seat", "airline-seat"], "Eight flights, the drive and the entry fee: everything that gets RIFT to its first competition."),
  O("fly8", "FLY-8", "Fly the team", SEATS(8), ["airline-seat", "airline-seat", "airline-seat", "airline-seat"], "Return flights for the eight members who pilot, repair and run the robot at the competition."),
  O("finish", "FINISH", "Finish it and drive it there", ["mat", "vt03", "ammo", "cm01", "van", "entry"], ["filament-spool", "cargo-van", "vt03"], "Everything the robot still needs, and the 4,534 km drive to Arlington and back."),
  O("fly4", "FLY-4", "Fly half the team", SEATS(4), ["airline-seat", "airline-seat", "airline-seat"], "Four of the eight return flights."),
  O("chassis", "CF-04", "Chassis materials", ["mat"], ["filament-spool", "cf-sheet"], "Carbon-fibre sheet for the frame plates and nylon-carbon filament for printed brackets and mounts."),
  O("fly2", "FLY-2", "Two seats", SEATS(2), ["airline-seat", "airline-seat"], "Two return flights to the competition."),
  O("road", "ROAD", "The road trip", ["van", "entry"], ["cargo-van"], "4,534 km there and back with the robot in the van, and the team's ARC 1v1 entry fee."),
  O("seat", "SEAT", "A seat on the plane", ["seat1"], ["airline-seat"], "One member's return flight to the competition. Eight seats to fill.", { seat: true }),
  O("van", "VAN", "The van", ["van"], ["cargo-van"], "The robot rides 4,534 km to Arlington, Texas, and back."),
  O("match", "VT03", "Match kit", ["vt03", "ammo", "cm01"], ["vt03", "projectile-17mm", "cm01"], "The pilot's video link, a package of test projectiles and the supercapacitor monitor."),
  // Adopted: funded already, shown so sponsors can see what's done.
  O("turret", "TURRET", "The turret", ["gm6020", "m2006", "c610", "uv", "m3508bare", "c620l", "devc", "cam", "rpi5", "hat"], ["gm6020", "m2006-p36", "rpi5"], "Aims, feeds, fires and sees: gimbal motors, launcher, vision computer and control board."),
  O("referee", "REFEREE", "Referee and armor", ["mc02", "sm01", "fi02", "pm02", "li01", "am03"], ["am03", "mc02"], "The competition electronics that score hits, check projectile speed and limit power."),
  O("power", "POWER", "Power and charging", ["batt", "rack", "supercap", "hub", "adapter"], ["matrice-4d-battery", "battery-rack-2"], "Four batteries in rotation, the rack, the supercapacitor bank and the charging station."),
  O("drive", "DRIVE", "Drivetrain", ["m3508", "c620d", "kit"], ["m3508-p19", "c620"], "Four motors for the X-drive base, their controllers and a spare of each."),
  O("armor", "AM03", "Armor panels", ["am03"], ["am03"], "Four armor modules that register every hit."),
  O("refkit", "MC02", "Referee electronics", ["mc02", "sm01", "fi02", "pm02", "li01"], ["mc02", "li01"], "Main control, speed monitor, RFID, power module and light bar."),
  O("brain", "RPI-5", "Brain and eyes", ["rpi5", "hat", "cam", "devc"], ["rpi5", "devboard-c"], "The vision computer, its AI accelerator, the camera and the control board."),
  O("batteries", "TB-4D", "Batteries", ["batt"], ["matrice-4d-battery"], "Four DJI Matrice 4D batteries: one running, three charging."),
  O("gimbal", "GM6020", "Gimbal motors", ["gm6020"], ["gm6020"], "Yaw and pitch for the turret, plus a spare."),
  O("motors", "M3508", "Drive motors", ["m3508"], ["m3508-p19"], "Four M3508 gear motors and a spare."),
  O("wheels", "OMNI-96", "Omni wheels", ["wheels"], ["omni-wheel"], "Four goBILDA 96 mm omni wheels, our very first adoption."),
];

export const priceOf = (o) => o.lines.reduce((s, k) => s + LINES[k].price, 0);
export const isAdopted = (o) => !o.seat && o.lines.every((k) => LINES[k].adopted);
export const adopterOf = (o) => ADOPTERS[LINES[o.lines[0]].adopted];
export const BUDGET = Object.values(LINES).reduce((s, l) => s + l.price, 0);
export const ADOPTED_TOTAL = Object.values(LINES).filter((l) => l.adopted).reduce((s, l) => s + l.price, 0);

// Sections, highest tier first; open offers before adopted ones, dearest first. Adopted
// offers under $500 (the donated wheels) sit with Bronze.
export const SECTIONS = [...TIERS].reverse().map((t, i, all) => {
  const hi = i ? all[i - 1].min : Infinity;
  const items = OFFERS.filter((o) => {
    const p = priceOf(o);
    return (p >= t.min || (t.id === "bronze" && isAdopted(o))) && p < hi;
  }).sort((a, b) => isAdopted(a) - isAdopted(b) || priceOf(b) - priceOf(a));
  return { tier: t, items };
}).filter((s) => s.items.length);

export const money = (v, cents = true) =>
  "$" + v.toLocaleString("en-CA", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
