// Everything RIFT's first robot needs, from the 2026–27 budget (CAD, tax included).
// Each adoptable unit costs at least the Bronze tier, so one adoption is always a full
// sponsorship; cheap parts ride along with the subsystem they belong to.
//
// `items` are budget lines. `cad` names a part file in site/parts/ (null when there is
// no manufacturer model). `hero` is the item drawn in the grid.

export const TIERS = [
  { id: "bronze", name: "Bronze", min: 500,
    perks: ["Website logo", "Pit signage", "Sponsor acknowledgement", "Scheduled build update"] },
  { id: "silver", name: "Silver", min: 1000,
    perks: ["Robot logo placement", "Team demonstration"] },
  { id: "gold", name: "Gold", min: 3000,
    perks: ["Sponsor-led technical session", "Opt-in recruiting introductions"] },
  { id: "title", name: "Title", min: 5000,
    perks: ["Robot naming recognition"] },
];

export const tierFor = (amount) => [...TIERS].reverse().find((t) => amount >= t.min) ?? null;

export const BUNDLES = [
  {
    id: "drive", code: "M3508", name: "Drive motors", section: "robot", hero: "m3508-p19",
    line: "Four wheels, four motors, one spare.",
    about: "The X-drive base. Four M3508 gear motors each turn an omni wheel, so the robot can strafe and spin in place while the turret keeps aiming. C620 controllers turn the main board's commands into current.",
    items: [
      { name: "M3508 P19 brushless gear motor", qty: 5, note: "4 installed + 1 spare", price: 509.16, cad: "m3508-p19" },
      { name: "C620 motor speed controller", qty: 5, note: "4 installed + 1 spare", price: 266.33, cad: "c620" },
      { name: "M3508 accessories kit", qty: 1, note: "CAN hub board and leads", price: 59.53, cad: "m3508-kit" },
    ],
  },
  {
    id: "wheels", code: "OMNI-96", name: "Omni wheels", section: "robot", hero: "omni-wheel",
    line: "Already adopted. Thank you!",
    about: "Four goBILDA 96 mm omni wheels. Rollers around the rim let each wheel slide sideways, which is what makes the X-drive work. These were donated in kind before the team had a single part.",
    adopted: { by: "An in-kind donation", note: "Our first sponsor" },
    items: [
      { name: "goBILDA omni wheel, 96 mm, 50A", qty: 4, note: "donated", price: 121.95, cad: "omni-wheel" },
    ],
  },
  {
    id: "gimbal", code: "GM6020", name: "Gimbal motors", section: "robot", hero: "gm6020",
    line: "The neck: yaw, pitch and a spare.",
    about: "Two GM6020 direct-drive motors aim the turret, one turning it (yaw) and one tilting it (pitch). The base spins underneath to dodge shots while these hold the aim.",
    items: [
      { name: "GM6020 brushless motor, integrated driver", qty: 3, note: "2 installed + 1 shared spare", price: 549.89, cad: "gm6020" },
    ],
  },
  {
    id: "launcher", code: "M2006", name: "Launcher and feeder", section: "robot", hero: "m2006-p36",
    line: "Everything that makes it shoot.",
    about: "A feeder motor pushes 17 mm projectiles one at a time into two spinning flywheels, which fire them at the opponent's armor. A UV light charges the fluorescent projectiles so they glow in flight.",
    items: [
      { name: "M3508 motor, no gearbox (flywheels)", qty: 3, note: "2 installed + 1 spare", price: 141.0, cad: "m3508-bare" },
      { name: "C620 motor speed controller", qty: 2, note: "flywheels", price: 106.53, cad: "c620" },
      { name: "M2006 P36 brushless gear motor (feeder)", qty: 2, note: "1 installed + 1 spare", price: 112.8, cad: "m2006-p36" },
      { name: "C610 motor speed controller", qty: 2, note: "1 installed + 1 spare", price: 78.33, cad: "c610" },
      { name: "17 mm fluorescent projectile charger", qty: 1, note: "lights the projectiles", price: 12.53, cad: "projectile-charger" },
      { name: "17 mm fluorescent projectiles", qty: 1, note: "one package, for testing", price: 142.56, cad: "projectile-17mm" },
    ],
  },
  {
    id: "brain", code: "RPI-5", name: "Brain and eyes", section: "robot", hero: "rpi5",
    line: "Sees the target, tells the turret where.",
    about: "A Raspberry Pi 5 with a Hailo AI accelerator runs the vision model on a global-shutter camera, picking out the opponent's armor plates. The RoboMaster Type C board runs the motors and the robot's control loops.",
    items: [
      { name: "Raspberry Pi 5, 8 GB", qty: 1, note: "onboard vision computer", price: 276.79, cad: "rpi5" },
      { name: "Raspberry Pi AI HAT+, Hailo-8L 13 TOPS", qty: 1, note: "vision accelerator", price: 114.64, cad: "ai-hat-plus" },
      { name: "Arducam OV9782 USB camera, M12 lens", qty: 1, note: "B0385", price: 93.98, cad: "arducam-b0385" },
      { name: "RoboMaster Development Board Type C", qty: 2, note: "1 installed + 1 spare", price: 144.13, cad: "devboard-c" },
    ],
  },
  {
    id: "armor", code: "AM03", name: "Armor panels", section: "robot", hero: "am03",
    line: "Where the other robot aims.",
    about: "Four armor modules around the chassis register every hit and report it to the referee system, which takes health points off. Their light strips show which team the robot is on.",
    items: [
      { name: "Small Armor Module AM03", qty: 4, note: "one per side", price: 783.32, cad: "am03" },
    ],
  },
  {
    id: "referee", code: "MC02", name: "Referee system", section: "robot", hero: "mc02",
    line: "The rulebook, bolted on.",
    about: "The competition's referee electronics: they keep score, limit power, check projectile speed, and stream the pilot's first-person video. Matches are scored through them.",
    items: [
      { name: "Main Control Module MC02", qty: 1, note: "", price: 159.8, cad: "mc02" },
      { name: "Speed Monitor Module SM01", qty: 1, note: "projectile speed", price: 155.1, cad: "sm01" },
      { name: "RFID Module FI02", qty: 1, note: "", price: 72.07, cad: "fi02" },
      { name: "Power Module PM02", qty: 1, note: "", price: 155.1, cad: "pm02" },
      { name: "Light Bar Module LI01", qty: 1, note: "", price: 156.66, cad: "li01" },
      { name: "Video Transmission Module VT03", qty: 1, note: "pilot's video link", price: 365.03, cad: "vt03" },
    ],
  },
  {
    id: "power", code: "TB-4D", name: "Power and charging", section: "robot", hero: "matrice-4d-battery",
    line: "One battery running, three charging.",
    about: "Four DJI Matrice 4D batteries rotate between the robot and the charging hub. A team-built supercapacitor bank stores extra energy for bursts of speed without breaking the power limit.",
    items: [
      { name: "DJI Matrice 4D Series battery", qty: 4, note: "1 operating + 3 in rotation", price: 620.39, cad: "matrice-4d-battery" },
      { name: "Battery Rack 2", qty: 1, note: "battery mount", price: 59.53, cad: "battery-rack-2" },
      { name: "Supercapacitor bank and power electronics", qty: 1, note: "team-built", price: 113.0, cad: null },
      { name: "Supercapacitor Management Module CM01", qty: 1, note: "", price: 23.5, cad: "cm01" },
      { name: "Matrice 4D Series 240W charging hub", qty: 1, note: "", price: 202.1, cad: null },
      { name: "DJI 240W power adapter", qty: 1, note: "", price: 333.69, cad: null },
    ],
  },
  {
    id: "chassis", code: "CF-04", name: "Chassis materials", section: "robot", hero: "filament-spool",
    line: "The skeleton everything bolts to.",
    about: "Carbon-fibre sheet for the frame plates, and nylon-carbon filament for printed brackets and mounts. Includes spare stock, prototype prints, inserts and consumables.",
    items: [
      { name: "Carbon-fibre laminate sheet", qty: 4, note: "", price: null, cad: "cf-sheet" },
      { name: "Nylon-CF filament", qty: 4, unit: "kg", note: "", price: null, cad: "filament-spool" },
      { name: "Inserts, prototypes and consumables", qty: 1, note: "", price: null, cad: null },
    ],
    price: 2260.0,
  },
  // Getting there.
  {
    id: "seats", code: "SEAT", name: "A seat on the plane", section: "trip", hero: null, each: 850.5, count: 8,
    line: "Eight of us fly to the competition.",
    about: "Return flights for the eight members who will pilot, repair and run the robot at the competition. Estimated from last season's venue.",
    items: [{ name: "Return airfare, per flyer", qty: 8, note: "estimated", price: 6804.0, cad: null }],
  },
  {
    id: "road", code: "ROAD", name: "The drive and the entry", section: "trip", hero: null,
    line: "1,632 km with the robot in the back, then the entry fee.",
    about: "The robot travels by road, 1,632 km return, and the team's ARC 1v1 registration.",
    items: [
      { name: "Return vehicle travel", qty: 1632, unit: "km", note: "estimated", price: 816.0, cad: null },
      { name: "ARC 1v1 event registration", qty: 1, note: "", price: 207.96, cad: null },
    ],
  },
];

// Travel isn't drawn: it lives in the info panel.
export const TRAVEL = BUNDLES.filter((b) => b.section === "trip");

// Unit price of a bundle (seats are adopted one at a time).
export const priceOf = (b) => b.each ?? b.price ?? b.items.reduce((s, i) => s + (i.price ?? 0), 0);
export const totalOf = (b) => b.price ?? b.items.reduce((s, i) => s + (i.price ?? 0), 0);
export const BUDGET = BUNDLES.reduce((s, b) => s + totalOf(b), 0);

export const money = (v, cents = true) =>
  "$" + v.toLocaleString("en-CA", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
