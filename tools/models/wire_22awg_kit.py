"""22 AWG silicone wire kit, 10 colours on small spools in a dispensing rack.

22 AWG tinned stranded copper (about 60 x 0.08 mm strands, 0.7 mm over the strands) in a silicone jacket,
1.5 mm over the jacket. Ten colours (black, red, white, yellow, green, blue, grey, brown, purple, orange),
10 ft (3048 mm) each, on 40 mm spools (16 mm hub, 6 mm bore, 14 mm between the flanges) whose winding is sized
from the wire volume. The spools turn on one 5 mm steel axle between two end plates, separated by dividers, in a
190 x 46 mm tray; each wire runs out of the bottom of its spool through its own hole in the front rail and
fans out over the table, stripped 8 mm. Front faces -y.
"""
import math
import random

import numpy as np

from wiring_common import *

OD, COND_R, STRIP = 1.5, 0.36, 8.0
LEN = 10 * 304.8
COLOURS = [("black", "#17181a"), ("red", "#c4181e"), ("white", "#eeeeea"), ("yellow", "#e6b81c"), ("green", "#1f8a3b"),
           ("blue", "#1f55c4"), ("grey", "#8a8d93"), ("brown", "#6b3f22"), ("purple", "#7a3fa0"), ("orange", "#e46a14")]
kit = Kit("wire_22awg_kit")
rng = random.Random(22)
sp = Spool(OD, LEN, hub_d=16.0, flange_d=40.0, width=14.0, bore_d=6.0, t_f=1.2, holes=(5, 3.4), rim_holes=(0, 0))
print("winding top radius", sp.r_top)

PITCH = 18.4  # spool pitch along x: 16.4 thick + a 2.0 divider
X0 = -9 * PITCH / 2
BASE_T, DEPTH, ZC = 3.0, 46.0, 26.0
LENGTH = 10 * PITCH + 8.0
PLASTIC, FLANGE, STEEL = "#34373c", "#dcdfe2", "#b9bdc3"

# tray base with rounded corners and feet
base = cq.Workplane("XY").box(LENGTH + 6, DEPTH + 4, BASE_T).edges("|Z").fillet(4.0).translate((0, 0, BASE_T / 2))
kit.add(base, "tray", PLASTIC)
for sx in (-1, 1):
    for sy in (-1, 1):
        kit.add(cq.Workplane("XY").circle(3.0).extrude(-1.2).translate((sx * (LENGTH / 2 - 6), sy * (DEPTH / 2 - 4), 0)).faces("<Z").edges().fillet(0.5), "foot", "#101113")

# end plates, rounded top, with the axle hole
for sx in (-1, 1):
    plate = cq.Workplane("YZ").center(0, (BASE_T + 36) / 2).rect(DEPTH, 36 - BASE_T).extrude(3.0)
    plate = plate.edges("|X and >Z").fillet(8.0)
    plate = plate.cut(cq.Workplane("YZ").center(0, ZC).circle(2.8).extrude(3.0))
    kit.add(plate.translate((sx * (LENGTH / 2 - 1.5), 0, 0)), "plate", PLASTIC)

# dividers between spools
for i in range(11):
    x = X0 - 0.5 * PITCH + i * PITCH
    d = cq.Workplane("YZ").center(0, (BASE_T + 31) / 2).rect(DEPTH - 6, 31 - BASE_T).extrude(1.2).edges("|X and >Z").fillet(6.0)
    d = d.cut(cq.Workplane("YZ").center(0, ZC).circle(2.8).extrude(1.2))
    kit.add(d.translate((x - 0.6, 0, 0)), "divider", PLASTIC)

# axle
kit.add(cyl((-LENGTH / 2 + 1.0, 0, ZC), (1, 0, 0), 2.5, LENGTH - 2.0), "axle", STEEL)
for sx in (-1, 1):  # axle end caps
    kit.add(cyl((sx * (LENGTH / 2 + 0.2), 0, ZC), (sx, 0, 0), 3.6, 1.6), "axle", STEEL)

# front rail with a wire hole per spool; back rail plain
RAIL_H = 17.0
for sy, holes in ((-1, True), (1, False)):
    rail = cq.Workplane("XY").box(LENGTH - 6.0, 2.0, RAIL_H).translate((0, sy * (DEPTH / 2 - 1.0), BASE_T + RAIL_H / 2))
    if holes:
        for i in range(10):
            xc = X0 + i * PITCH
            rail = rail.cut(cq.Workplane("XZ").center(xc, ZC - sp.r_w).circle(1.7).extrude(3.0, both=True))
    kit.add(rail, "rail", PLASTIC)

# spools and wires
for i, (cname, col) in enumerate(COLOURS):
    xc = X0 + i * PITCH
    a = np.array([1.0, 0.0, 0.0])
    e1 = np.array([0.0, 1.0, 0.0])
    origin = np.array([xc - 8.2, 0.0, ZC])
    sp.build(kit, cname, col, FLANGE, origin, e1, a)
    psi = -math.pi / 2
    P, t, o = sp.tail_start(psi, origin, e1, a)
    if t[1] > 0:
        t = -t
    z0 = P[2]
    fan = (i - 4.5) * 4.0
    pts = []
    n = 24
    for k in range(n + 1):
        s = 100.0 * k / n  # run beyond the rail
        y = P[1] + t[1] * s
        z = z0 - (z0 - OD / 2 - 0.2) * smooth((s - 30.0) / 38.0)
        pts.append(np.array([P[0] + fan * smooth((s - 30.0) / 70.0), y, z]))
    free_tail(kit, cname, col, pts, OD, COND_R, STRIP, rng)
kit.export("wire-22awg-kit")
