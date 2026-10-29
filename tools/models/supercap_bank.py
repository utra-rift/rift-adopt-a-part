"""Team-built 24 V supercapacitor bank: nine 2.7 V / 100 F cells (Ø22 x 45 mm) in series on a balancing / controller PCB, XT60 leads.

A team-built assembly, so nothing here is a catalogue part; every dimension is the usual one for the parts it is made of:
  cells       9 x radial-lead 2.7 V 100 F supercapacitors, Ø22 x 45 mm (case + sleeve), leads 10 mm apart, standing on the board;
              9 x 2.7 V = 24.3 V string. Black sleeve with a polarity stripe, crimped aluminium top with a vent score.
  board       245 x 44 mm, 1.6 mm, green mask; nine balancing channels (bleed resistors, MOSFET, green LED each), an MCU with
              crystal, SWD header and a 4-pin JST-PH sense/CAN port, a power stage (two D2PAK MOSFETs, 2512 shunt, shielded
              inductor, bulk caps) and a board-mount XT60 pair (male) at the +x end
  leads       12 AWG red/black pair, ~140 mm, to a female XT60 plug lying on the table, loosely curled
  mounting    six 6 mm hex standoffs with pan screws; the cell leads show underneath
Drawing frame: x along the cell row, y across (front = -y), z up; the board underside is at z = 6.
"""
import math
import os
import random

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
rng = random.Random(2724)
BZ, T = 6.0, 1.6  # board underside height, thickness
ZT = BZ + T
X0, X1, Y0, Y1 = -112.0, 136.0, -24.0, 20.0
CELL_Y = 8.0
CELLS = 9
PITCH = 23.5
CX = [(i - 4) * PITCH for i in range(CELLS)]

# ---------------------------------------------------------------- board
board = boxc(X0, Y0, BZ, X1, Y1, ZT, 2.5)
holes = []
STAND = [(X0 + 6, Y0 + 6), (X0 + 6, Y1 - 6), (0, Y0 + 5), (0, Y1 - 5), (X1 - 6, Y0 + 6), (X1 - 6, Y1 - 6)]
for (x, y) in STAND:
    holes.append(cyl(x, y, BZ - 0.1, 3.2, T + 0.2))
# cell lead holes: Ø1.3, two per cell 10 mm apart along y, plus the "hole for a vent plug"
for x in CX:
    for s in (-1, 1):
        holes.append(cyl(x, CELL_Y + s * 5.0, BZ - 0.1, 1.3, T + 0.2))
board = board.cut(union(holes))
K.add("pcb", board)
gold = []
for x in CX:
    for s in (-1, 1):
        gold.append(ring(x, CELL_Y + s * 5.0, ZT, 3.0, 1.3, 0.05))
        gold.append(ring(x, CELL_Y + s * 5.0, BZ - 0.05, 3.0, 1.3, 0.05))
for (x, y) in STAND:
    gold.append(ring(x, y, ZT, 5.4, 3.2, 0.05))
K.add("gold", gold)

# ---------------------------------------------------------------- standoffs and screws
for (x, y) in STAND:
    K.add("black", hexprism(x, y, 0.0, 5.5, BZ))
    K.add("steel", pan_screw(x, y, ZT + 0.05, 5.0, 1.9))

# ---------------------------------------------------------------- cells
CELL_D, CELL_H = 22.0, 45.0
cz0 = ZT + 1.2  # cell sits on its rubber standoff ribs 1.2 mm above the board
r = CELL_D / 2
for i, x in enumerate(CX):
    # aluminium can top and seal (lathe about z), then sleeve over the can
    sleeve = lathe([(0, 0.0), (r - 0.7, 0.0), (r, 0.5), (r, 40.4), (r - 0.4, 41.0), (0, 41.0)])
    sleeve = sleeve.translate((x, CELL_Y, cz0))
    K.add("sleeve", sleeve)
    # crimped top: rolled bead of the can, a rubber seal disc and the vent score
    can_top = lathe([(0, 40.8), (r - 0.6, 40.8), (r - 0.6, 42.4), (r - 1.2, 43.3), (r - 2.4, 43.6), (r - 3.0, 43.4), (r - 3.0, 42.8), (0, 42.8)])
    K.add("can", can_top.translate((x, CELL_Y, cz0)))
    K.add("seal", cyl(x, CELL_Y, cz0 + 42.7, 2 * (r - 3.0) - 0.2, 0.7).faces(">Z").edges().chamfer(0.25))
    # vent score: an X-shaped raised rib on the seal
    for a in (45, 135):
        K.add("can", box(0, 0, 0, 12.0, 0.8, 0.35).rotate((0, 0, 0), (0, 0, 1), a).translate((x, CELL_Y, cz0 + 43.3)))
    # polarity stripe: a thin cylindrical shell sector on the sleeve, 40 mm tall
    shell = cq.Workplane("XY").circle(r + 0.12).circle(r - 0.05).extrude(33.0).translate((x, CELL_Y, cz0 + 4.5))
    wedge = box(x, CELL_Y - r, cz0 + 4.5, 4.4, 8.0, 33.0)
    K.add("stripe", shell.intersect(wedge))
    # "-" and "+" marks as raised bars on the stripe (geometry, not text)
    K.add("mark", box(x, CELL_Y - r - 0.15, cz0 + 33.0, 2.4, 0.3, 0.6))
    K.add("mark", box(x, CELL_Y - r - 0.15, cz0 + 28.0, 2.4, 0.3, 0.6))
    K.add("mark", box(x, CELL_Y - r - 0.15, cz0 + 28.0, 0.6, 0.3, 2.4).translate((0, 0, -0.9)))
    # rubber foot ring and the two radial leads through the board
    K.add("seal", ring(x, CELL_Y, ZT, 2 * r - 1.4, 2 * r - 4.6, 1.2))
    for s in (-1, 1):
        K.add("nickel", cyl(x, CELL_Y + s * 5.0, BZ - 3.5, 1.0, 3.5 + T + 1.2 + 0.5))

# ---------------------------------------------------------------- board components
res, capsx, ends, leds = [], [], [], []


def put(kind, x, y, rot, kn):
    b, t = smd(kind, x, y, ZT, rot)
    {"res": res, "cap": capsx, "led": leds}[kn].append(b)
    ends.extend(t)


for i, x in enumerate(CX):
    # one balancing channel per cell, along the front edge of the cell
    put("1206", x - 4.0, -9.0, 90, "res")
    put("1206", x + 0.0, -9.0, 90, "res")
    put("0805", x + 4.0, -9.0, 90, "res")
    K.add("ic", box(x - 3.5, -13.5, ZT, 2.9, 1.6, 1.0))  # SOT-23 bleed MOSFET
    for s in (-1, 1):
        ends.append(box(x - 3.5 + s * 0.95, -13.5, ZT, 0.35, 0.7, 0.12).translate((0, 0.0, 0)))
    put("0603", x + 2.0, -13.5, 0, "res")
    put("0603", x + 4.2, -13.5, 0, "cap")
    put("0603", x - 0.5, -17.0, 0, "led")
    put("0402", x + 2.0, -17.0, 0, "res")
    K.add("nickel", cyl(x - 6.0, -9.0, ZT, 1.2, 0.05))  # test pad
    # silkscreen ring around each cell and its polarity marks
    K.add("silk", ring(x, CELL_Y, ZT, 2 * r + 2.2, 2 * r + 1.6, 0.03))

# MCU block
b, l = qfp(-62.0, -17.5, ZT, body=7.0, h=1.4, per_side=12, pitch=0.5, lead_w=0.22, lead_l=1.0)
K.add("ic", b)
K.add("nickel", l)
K.add("nickel", box(-50.0, -19.0, ZT, 3.2, 2.5, 0.8, 0.25))  # crystal can
for (x, y) in [(-70.0, -19.0), (-70.0, -22.0)]:
    b, l = soic(x, y, ZT, rot=0)
    K.add("ic", b)
    K.add("nickel", l)
for k in range(8):
    put("0402", -66.0 + k * 1.5, -11.2, 0, "res" if k % 2 else "cap")
# 2x5 SWD header 1.27 pitch, 4-pin JST-PH
sh, pins = pin_header(-41.0, -20.5, ZT, 5, 2, pitch=1.27, body_h=5.0, pin_len=6.0, female=False)
K.add("black", sh)
K.add("gold", pins)
K.add("jstbody", box(-30.0, -21.0, ZT, 9.8, 5.8, 6.0, 0.2).cut(box(-30.0, -21.0, ZT + 1.0, 8.2, 4.0, 6.0)))
for k in range(4):
    K.add("gold", box(-30.0 + (k - 1.5) * 2.0, -21.0, ZT + 1.0, 0.64, 0.64, 4.0))

# power stage near the +x end
for (x, y) in [(112.0, -8.0), (112.0, -17.0)]:
    # D2PAK: body 10 x 9 x 4.4, tab and three gull legs
    K.add("ic", box(x, y, ZT + 0.2, 10.0, 8.6, 4.2, 0.2).faces(">Z").edges().chamfer(0.3))
    K.add("nickel", box(x + 6.2, y, ZT, 2.4, 7.0, 1.0))  # tab
    for s in (-1, 0, 1):
        K.add("nickel", box(x - 6.3, y + s * 2.54, ZT, 3.0, 0.8, 0.4))
K.add("shunt", box(96.0, -12.5, ZT, 6.3, 3.2, 0.9))
K.add("nickel", box(92.6, -12.5, ZT, 1.6, 3.2, 1.0))
K.add("nickel", box(99.4, -12.5, ZT, 1.6, 3.2, 1.0))
# shielded power inductor 12 x 12 x 6 and bulk SMD electrolytics
K.add("inductor", box(84.0, -17.0, ZT, 12.0, 12.0, 6.0, 0.8).faces(">Z").edges().chamfer(0.3))
for (x, y) in [(70.0, -18.0), (60.0, -18.0)]:
    K.add("can", lathe([(0, 0), (4.0, 0), (4.0, 10.0), (3.5, 10.4), (0, 10.4)]).translate((x, y, ZT)))
    K.add("black", box(x, y, ZT, 8.4, 8.4, 1.0, 1.0))
    K.add("mark", box(x, y, ZT + 10.35, 0.6, 5.0, 0.1))
for k in range(6):
    put("1206", 100.0 + (k % 3) * 4.0, -20.0 + (k // 3) * 3.5, 0, "cap")
for k in range(10):
    put("0805", 30.0 + k * 3.2, -22.0, 0, "res" if k % 3 else "cap")
K.add("ic", res)
K.add("tan", capsx)
K.add("ledg", leds)
K.add("nickel", ends)

# board-mount XT60 pair at the +x end (male, yellow), on the edge, pins facing +x
def xt60_body(female=False):
    """XT60 housing along +x: 15.6 long x 15.6 wide?? (real: 15.6 x 8.0 x 16) with the two chamfered keying corners."""
    # cross-section (y, z): 15.6 wide, 8.0 tall, chamfers on the two corners of the mating side
    w, h, L = 15.6, 8.0, 16.0
    prof = [(-w / 2 + 2.2, 0), (w / 2 - 2.2, 0), (w / 2, 2.2), (w / 2, h), (-w / 2, h), (-w / 2, 2.2)]
    body = cq.Workplane("YZ").polyline(prof).close().extrude(L)
    if female:
        for s in (-1, 1):
            body = body.cut(cq.Workplane("YZ").circle(1.9).extrude(9.0).translate((L - 9.0 + 0.0, s * 3.6, 4.0)))
    return body


XTY = [-6.0, 7.0]
for yc in XTY:
    body = xt60_body(False).translate((X1 - 14.0, yc, ZT))
    K.add("xt60", body)
    # two Ø3.5 bullet pins reaching out of the front, with a rolled tip
    for s in (-1, 1):
        K.add("gold", cyl(0, 0, 0, 3.5, 9.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((X1 + 2.0 - 5.0, yc + s * 3.6, ZT + 4.0)))
    # the two solder tails and a gold fillet on top
    for s in (-1, 1):
        K.add("gold", box(X1 - 11.0, yc + s * 3.6, ZT, 3.0, 3.0, 0.2))

# ---------------------------------------------------------------- the lead: two 12 AWG wires to a female XT60 on the table
RW = 2.0  # 12 AWG silicone jacket, Ø4.0
a = X1 - 26.0
YP, XP0 = 36.0, X1 + 52.0  # plug centre line and back face
for col, ys, ye in (("red", 19.0, YP + 3.6), ("black", 12.0, YP - 3.6)):
    path = [
        (a, ys, ZT + RW),
        (a + 9.0, ys, ZT + RW + 4.0),
        (X1 + 3.0, ys + 0.5, ZT + 4.0),
        (X1 + 10.0, ys + 2.0, 12.0),
        (X1 + 15.0, ys + 5.0, RW + 3.0),
    ]
    xs, xe = X1 + 18.0, XP0 - 8.0
    for k in range(0, 9):
        u = k / 8
        sm = u * u * (3 - 2 * u)
        path.append((xs + (xe - xs) * u, ys + 7.0 + (ye - ys - 7.0) * sm, RW + (0.0 if k < 8 else 1.0) * 0 + 2.0 * sm * 0))
    path.append((XP0 - 3.0, ye, 4.0))
    path.append((XP0 + 1.0, ye, 4.0))
    K.add("wire_" + col, cable(path, RW))
    K.add("nickel", cyl(a, ys, ZT, 5.0, 1.4))  # solder blob where the wire lands
    K.add("gold", ring(a, ys, ZT, 8.0, 3.0, 0.06))
plug = xt60_body(True).translate((XP0, YP, 0))
K.add("xt60", plug)
for s_ in (-1, 1):  # gold sockets inside the cavities
    K.add("gold", ring(0, 0, 0, 3.4, 2.6, 7.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((XP0 + 8.0, YP + s_ * 3.6, 4.0)))

# ---------------------------------------------------------------- pose and export
ROT = float(os.environ.get("ROT", "0"))
final = Kit()
bb0 = K.bbox()
cx0, cy0 = (bb0.xmin + bb0.xmax) / 2, (bb0.ymin + bb0.ymax) / 2
for g, shapes in K.groups.items():
    final.add(g, [wp(s).translate((-cx0, -cy0, 0)).rotate((0, 0, 0), (0, 0, 1), ROT) for s in shapes])
n = final.export(ROOT / "cad/models/supercap-bank.step", "supercap_bank")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
