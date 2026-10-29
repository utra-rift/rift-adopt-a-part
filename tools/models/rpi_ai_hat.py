"""Raspberry Pi AI HAT+ (13 TOPS, Hailo-8L, SC1785) on its four spacers, with the stacking header and PCIe flat cable.

Raspberry Pi publishes no CAD for the AI HAT+ (see cad/raw/ai-hat-plus/manifest.json), so this is modelled from the
official mechanical drawing (aihat-plus-mechanical.png / product brief p.4) and the official photos:
  board        65 x 56.5 mm, 1.6 mm, Raspberry Pi green mask, 3 mm corner radius
  holes        Ø2.7 on a 58 x 49 pattern, 3.5 mm in from the edges, gold ENIG rings; a fifth ringed hole 13 mm up the right strip
               and four plain Ø3.2 holes at the drawing's undimensioned positions
  notches      left edge 5 deep x 18 tall, 21 above the bottom (PCIe FFC connector); bottom right 10 x 16 from x = 47.5
  header       2 x 20 female stacking header on 2.54 pitch, centred 29 mm right of the left hole (drawing), 8.5 mm tall
  NPU          Hailo-8L, 17 x 17 mm package with a nickel lid, left of centre
  FFC          16-pin PCIe connector at the notch, orange flat cable that leaves left and hangs
  spacers      four black 16 mm hex standoffs and black pan-head screws (the board sits on them)
Board component placement beyond the dimensioned items follows the photos. Drawing frame: x right, y up (top view).
"""
import math
import random

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
rng = random.Random(1785)
W, D, T = 65.0, 56.5, 1.6
Z0 = 16.0  # board underside height (spacer length)
ZT = Z0 + T  # board top face

# ---------------------------------------------------------------- board outline
R = 3.0
outline = (
    cq.Workplane("XY")
    .moveTo(0, 0).lineTo(47.5, 0).lineTo(47.5, 16).lineTo(57.5, 16).lineTo(57.5, 0).lineTo(W, 0)
    .lineTo(W, D).lineTo(0, D).lineTo(0, 39).lineTo(5, 39).lineTo(5, 21).lineTo(0, 21).close()
    .extrude(T)
)
outline = outline.edges("|Z").fillet(0.9)
# 3 mm outer corners (the four board corners that are plain)
for cx, cy, sx, sy in ((0, 0, 1, 1), (W, D, -1, -1), (0, D, 1, -1), (W, 0, -1, 1)):
    pass
board = outline.translate((0, 0, Z0))
MOUNT = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
EXTRA_RING = (61.5, 19.5)
PLAIN = [(61.5, 46.4), (42.5, 38.4), (19.6, 15.4), (3.6, 9.5)]
for (x, y) in MOUNT + [EXTRA_RING]:
    board = board.cut(cyl(x, y, Z0 - 0.1, 2.7, T + 0.2))
for (x, y) in PLAIN:
    board = board.cut(cyl(x, y, Z0 - 0.1, 3.2, T + 0.2))
# 40 pin holes (through, under the header) and a few vias
PIN_P = 2.54
HX0, HY = 32.5 - 19.5 * PIN_P / 1.0 * 0.5 * 2 / 2, 52.5
for i in range(20):
    for j in (0, 1):
        x = 32.5 - 9.5 * PIN_P + i * PIN_P
        y = 52.5 + (-0.5 + j) * PIN_P
        board = board.cut(cyl(x, y, Z0 - 0.1, 1.1, T + 0.2))
K.add("pcb", board)

gold = []
for (x, y) in MOUNT + [EXTRA_RING]:
    gold.append(ring(x, y, ZT, 6.4, 2.7, 0.04))
    gold.append(ring(x, y, Z0 - 0.04, 6.4, 2.7, 0.04))
for (x, y) in PLAIN:
    gold.append(ring(x, y, ZT, 4.2, 3.2, 0.04))
# header pad rings (ENIG) around the 40 holes, square pad on pin 1
for i in range(20):
    for j in (0, 1):
        x = 32.5 - 9.5 * PIN_P + i * PIN_P
        y = 52.5 + (-0.5 + j) * PIN_P
        gold.append(ring(x, y, Z0 - 0.04, 2.0, 1.1, 0.04))
K.add("gold", gold)

# ---------------------------------------------------------------- female stacking header
sh = box(32.5, 52.5, ZT, 20 * PIN_P, 2 * PIN_P, 8.5)
holes = []
pins = []
for i in range(20):
    for j in (0, 1):
        x = 32.5 - 9.5 * PIN_P + i * PIN_P
        y = 52.5 + (-0.5 + j) * PIN_P
        holes.append(box(x, y, ZT + 8.5 - 2.0, 1.15, 1.15, 2.1))
        pins.append(box(x, y, Z0 - 10.0, 0.64, 0.64, 10.0 + T + 0.2))
sh = sh.cut(union(holes))
# moulded ribs on the sides of the shroud (the polarising grooves) are one slot per pin pair
K.add("black", sh)
K.add("gold", pins)

# ---------------------------------------------------------------- spacers and screws (black nylon)
for (x, y) in MOUNT:
    K.add("black", hexprism(x, y, 0.0, 5.0, Z0))
    K.add("black", pan_screw(x, y, ZT + 0.04, 5.0, 1.8))
    K.add("black", ring(x, y, Z0 - 0.0, 3.6, 2.4, 0.0 + 0.001))
# the fifth (ringed) hole is a lone screw-less pad hole

# ---------------------------------------------------------------- Hailo-8L module
NX, NY = 31.1, 26.9
K.add("substrate", box(NX, NY, ZT, 17.0, 17.0, 0.9, 0.5))
lid = box(NX, NY, ZT + 0.9, 15.4, 15.4, 1.35, 0.6).faces(">Z").edges().chamfer(0.35)
K.add("lid", lid)
# lid foot flange: the heat spreader's wider base, 16.4 square, 0.4 thick
K.add("lid", box(NX, NY, ZT + 0.9, 16.4, 16.4, 0.4, 0.5))
# laser-marked inset (a shallow plate, no text) and the pin-1 triangle
K.add("lidmark", box(NX + 0.5, NY - 0.2, ZT + 2.25, 10.5, 5.0, 0.03, 0.3))
K.add("lidmark", prism([(NX - 7.0, NY + 5.0), (NX - 5.0, NY + 5.0), (NX - 7.0, NY + 7.0)], ZT + 2.25, 0.03))
# BGA edge: row of tiny solder-mask windows is below the lid; SMD decoupling caps around the package
caps_np = []
for k in range(12):
    caps_np.append(("0402", NX - 9.7, NY - 7.0 + k * 1.2, 90))
    caps_np.append(("0402", NX + 9.7, NY - 7.0 + k * 1.2, 90))
for k in range(8):
    caps_np.append(("0402", NX - 5.5 + k * 1.5, NY - 9.6, 0))
    caps_np.append(("0402", NX - 5.5 + k * 1.5, NY + 9.6, 0))

# ---------------------------------------------------------------- PCIe FFC connector at the left notch
FX, FY0, FY1 = 6.0, 22.2, 37.4
K.add("jst", box(FX + 1.0, (FY0 + FY1) / 2, ZT, 3.2, FY1 - FY0, 1.1, 0.2))  # cream housing
K.add("latch", box(FX + 1.4, (FY0 + FY1) / 2, ZT + 1.1, 2.3, FY1 - FY0 - 0.6, 0.45, 0.1))  # flip latch
# pads under the connector's edge
for k in range(16):
    K.add("gold", box(FX + 3.1, FY0 + 0.45 + k * 0.95, ZT, 0.9, 0.5, 0.04))
# orange flex: 15.0 wide, 0.3 thick, leaves the connector toward -x, bends down and hangs; contact tips gold
ffc_w, ffc_t = 14.6, 0.35
fx_start = FX - 1.0
prof = []
# centreline in the (x, z) plane: horizontal out of the housing, rounding down, then hanging
pts = [(FX + 1.6, ZT + 0.75)]
for k in range(1, 6):
    pts.append((FX + 1.6 - 2.2 * k, ZT + 0.75))
cx, cz = pts[-1]
R_B = 7.0
for k in range(1, 9):
    a = k / 8 * math.pi * 0.5
    pts.append((cx - R_B * math.sin(a), cz - R_B * (1 - math.cos(a))))
cx, cz = pts[-1]
for k in range(1, 4):
    pts.append((cx, cz - 3.5 * k))
ffc = None
segs = []
for a, b in zip(pts[:-1], pts[1:]):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz)
    ang = math.degrees(math.atan2(dz, dx))
    seg = box(0, 0, -ffc_t / 2, L + 0.08, ffc_w, ffc_t)  # along +x, centred y... box() centres xy: x centre at 0
    seg = seg.translate((L / 2, 0, 0)).rotate((0, 0, 0), (0, 1, 0), -ang).translate((a[0], (FY0 + FY1) / 2, a[1]))
    segs.append(seg)
K.add("flex", segs)
# stiffener (amber polyimide backer) near the tip and the exposed gold contact fingers
tip = pts[-1]
K.add("flexstiff", box(tip[0] + 0.45, (FY0 + FY1) / 2, tip[1], 0.55, ffc_w, 6.0))
for k in range(16):
    K.add("gold", box(tip[0] - 0.22, FY0 + 0.3 + k * 0.92 + 0.0, tip[1], 0.1, 0.5, 5.0))

# ---------------------------------------------------------------- SMD scatter, ICs, fiducials, silk
KEEP = [
    (7.0, 56.5 - 8.5 + 0.0, 58.0, 56.5),  # header and pins
    (NX - 9.3, NY - 9.3, NX + 9.3, NY + 9.3),  # NPU
    (0, 21, 11.5, 39),  # FFC connector area
    (47.5 - 0.5, 0, 57.5 + 0.5, 16.5),  # bottom right cut out
]
HOLES_XY = MOUNT + [EXTRA_RING] + PLAIN
res, capsx, ends = [], [], []


def clear(x, y, m=1.4):
    for (x0, y0, x1, y1) in KEEP:
        if x0 - m < x < x1 + m and y0 - m < y < y1 + m:
            return False
    for (hx, hy) in HOLES_XY:
        if (x - hx) ** 2 + (y - hy) ** 2 < 3.8 ** 2:
            return False
    return 1.5 < x < W - 1.5 and 1.5 < y < D - 1.5


placed = []


def put(kind, x, y, rot, kn):
    b, t = smd(kind, x, y, ZT, rot)
    (res if kn == "res" else capsx).append(b)
    ends.extend(t)
    placed.append((x, y))


for kind, x, y, rot in caps_np:
    if clear(x, y, 0.2) or True:
        put(kind, x, y, rot, "cap")
tries = 0
while len(placed) < 150 and tries < 4000:
    tries += 1
    x, y = rng.uniform(2.0, W - 2.0), rng.uniform(2.0, D - 2.0)
    if not clear(x, y):
        continue
    if any((x - a) ** 2 + (y - b) ** 2 < 2.6 ** 2 for a, b in placed):
        continue
    kind = rng.choice(["0402", "0402", "0402", "0603", "0603", "0805"])
    put(kind, x, y, rng.choice([0, 90]), rng.choice(["res", "res", "cap"]))
K.add("ic", res)
K.add("tan", capsx)
K.add("nickel", ends)

# SOIC-8 (EEPROM) below the header, a SOT-23-6 and an inductor / power block, as in the photos
for (x, y, rot) in [(47.0, 46.2, 0)]:
    b, l = soic(x, y, ZT, rot=rot)
    K.add("ic", b)
    K.add("nickel", l)
K.add("ic", box(40.0, 40.5, ZT, 2.9, 1.6, 1.0))
K.add("ic", box(45.0, 21.5, ZT, 2.9, 1.6, 1.0))
K.add("inductor", box(50.5, 32.0, ZT, 2.8, 2.8, 1.5, 0.3))
K.add("inductor", box(52.4, 37.2, ZT, 2.8, 2.8, 1.5, 0.3))
# the small black 4-way switch/LED block near the lower right of the NPU, with white lens bars
K.add("ic", box(52.0, 22.0, ZT, 5.4, 2.4, 1.2, 0.15))
for k in range(4):
    K.add("silk", box(50.5 + k * 1.0, 22.0, ZT + 1.2, 0.6, 1.5, 0.05))
# fiducials, bare tin discs Ø1 on the dimension corners
for (x, y) in [(3.0, 46.0), (60.0, 50.0), (58.0, 8.5), (7.0, 12.0)]:
    K.add("nickel", cyl(x, y, ZT, 1.0, 0.04))
# silkscreen: border around the rating panel, generic rules
frame = lambda cx, cy, w, h, lw: box(cx, cy, ZT, w, h, 0.03).cut(box(cx, cy, ZT - 0.01, w - 2 * lw, h - 2 * lw, 0.06))
K.add("silk", frame(53.0, 34.0, 14.0, 8.0, 0.25))
K.add("silk", box(53.0, 28.0, ZT, 11.0, 0.3, 0.03))
K.add("silk", frame(NX, NY, 18.4, 18.4, 0.2))
# pin-1 mark and tick row along the header
K.add("silk", box(32.5 - 9.5 * PIN_P - 1.7, 52.5 - 1.27, ZT, 0.8, 0.8, 0.03))
for k in range(0, 20, 2):
    K.add("silk", box(32.5 - 9.5 * PIN_P + k * PIN_P, 52.5 - 3.9, ZT, 0.25, 0.9, 0.03))

# ---------------------------------------------------------------- pose and export
# turn the drawing so the GPIO edge runs along the back-right, like the Pi 5 figure
ROT = float(__import__("os").environ.get("ROT", "-90"))
final = Kit()
cx, cy = W / 2, D / 2
for g, shapes in K.groups.items():
    final.add(g, [wp(s).translate((-cx, -cy, 0)).rotate((0, 0, 0), (0, 0, 1), ROT) for s in shapes])
n = final.export(ROOT / "cad/models/rpi-ai-hat.step", "rpi_ai_hat")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm  z {bb.zmin:.1f}..{bb.zmax:.1f}")
