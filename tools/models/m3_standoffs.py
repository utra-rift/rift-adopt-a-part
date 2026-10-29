"""M3 aluminium hex standoff kit, 48 pieces, in a 12-compartment hinged case (lid open).

Standoffs (typical kit, modelled; no CAD is published): 5 mm hex across flats, chamfered ends, M3 x 6 mm stud on
the male-female ones, 2.5 mm tapped bore (6 mm deep, countersunk mouth) on every female end. Twelve types, four of
each = 48: male-female 6, 8, 10, 12, 15, 20 mm body, and female-female 6, 8, 10, 12, 15, 20 mm. Anodised in a colour
per body length: silver 6, blue 8, red 10, gold 12, black 15, green 20.
Case: 4 x 3 compartments of 34 x 26 mm, 14 mm deep, clear plastic, removable dividers, five barrel hinges, snap latch.
Pieces lie along x in loose heaps (three side by side, one in the groove on top).
"""
import math

import cadquery as cq

from rift_hw import Case, Reg, cyl, hexbar, move, revolve_z, seeded, shp, V

AF = 5.0
RC = AF / math.sqrt(3)
STUD, STUD_D = 6.0, 3.0
COLOUR = {6: "silver", 8: "blue", 10: "red", 12: "gold", 15: "black", 20: "green"}


def standoff(kind, L):
    """Along +z from 0: body L, plus a stud for 'mf'."""
    s = hexbar(AF, L, 0.4)
    bore = revolve_z([(0, -0.1), (1.6, -0.1), (1.25, 0.35), (1.25, 6.0), (0, 6.0)])  # countersunk mouth, 2.5 mm bore
    s = s.cut(bore)
    if kind == "ff":
        s = s.cut(bore.rotate(V(0, 0, 0), V(1, 0, 0), 180).translate((0, 0, L)))
    else:
        stud = revolve_z([(0, L - 0.2), (STUD_D / 2, L - 0.2), (STUD_D / 2, L + STUD - 0.4), (STUD_D / 2 - 0.4, L + STUD), (0, L + STUD)])
        s = s.union(stud)
    return shp(s)


def lay(s, total, roll, yaw, xyz):
    s = shp(s).translate(V(0, 0, -total / 2))
    s = s.rotate(V(0, 0, 0), V(0, 0, 1), roll)
    s = s.rotate(V(0, 0, 0), V(0, 1, 0), 90)
    s = s.rotate(V(0, 0, 0), V(0, 0, 1), yaw)
    return s.translate(V(*xyz))


def rest_height(roll):
    """Height of the centre axis above the floor for a hex lying with this roll."""
    return max(RC * math.cos(math.radians(roll + 60 * k)) for k in range(6))


TYPES = (
    [("mf", L) for L in (6, 8, 10, 12)]
    + [("mf", 15), ("mf", 20), ("ff", 6), ("ff", 8)]
    + [("ff", 10), ("ff", 12), ("ff", 15), ("ff", 20)]
)

reg = Reg()
case = Case([(26.0, [34.0] * 4)] * 3, inner_h=14.0)
case.build(reg)
rng = seeded(48)
count = 0
for (kind, L), (xc, yc, x0, y0, x1, y1) in zip(TYPES, case.comps):
    total = L + (STUD if kind == "mf" else 0)
    proto = standoff(kind, L)
    name = f"standoff-{COLOUR[L]}"
    f = case.floor
    slack = (x1 - x0) - total - 3.0
    rolls = [rng.choice((0, 30, 12, 24)) for _ in range(4)]
    flip = [rng.random() < 0.5 for _ in range(4)]
    spots = [(-6.4, 0), (0.0, 0), (6.4, 0), (-3.2, 1), (3.2, 1)]
    picks = [0, 1, 2, rng.choice((3, 4))]
    for i, k in enumerate(picks):
        dy, layer = spots[k]
        roll = rolls[i]
        z = f + rest_height(roll) + (5.3 if layer else 0.0) + 0.05
        dx = rng.uniform(-slack / 2, slack / 2)
        yaw = rng.uniform(-2.0, 2.0)
        piece = lay(proto, total, roll, yaw, (xc + dx, yc + dy, z))
        if flip[i]:
            piece = piece.rotate(V(xc + dx, yc + dy, z), V(xc + dx, yc + dy, z + 1), 180)
        reg.add(name, piece)
        count += 1

n = reg.export("m3_standoffs", "cad/models/m3-standoffs.step")
print("m3-standoffs ok:", count, "standoffs,", n, "solids, case", round(case.W, 1), "x", round(case.D, 1), "x", round(case.H, 1))
