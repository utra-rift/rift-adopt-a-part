"""M2-M5 socket head cap screw assortment, grade 12.9 black oxide, 1,760 pieces, in a 24-compartment hinged case
with two hex keys.

Screws (ISO 4762 proportions, modelled; no CAD is published): head diameter 1.5 d, head height d, hex socket
(M2 1.5, M2.5 2, M3 2.5, M4 3, M5 4 mm across flats, two thirds of the head deep), chamfered head edge and tip,
plain shank. 24 types, one per compartment: M2 and M2.5 in 6, 10, 16 mm; M3 in 6, 8, 10, 12, 16, 20; M4 in 8, 10,
12, 16, 20, 25; M5 in 8, 10, 12, 16, 20, 25. A few of each lie in the compartment (the real box holds about
seventy-three per compartment).
Case: 6 x 4 compartments of 34 x 30 mm, 16 mm deep, clear plastic, removable dividers, five barrel hinges, snap
latch, lid open. Beside it in front: a 3 mm and a 4 mm L-shaped hex key.
"""
import math

import cadquery as cq

from rift_hw import Case, Reg, cyl, seeded, shp, V

SIZES = {  # d: (socket AF, pitch, count shown)
    2.0: (1.5, 4.3, 12),
    2.5: (2.0, 4.9, 10),
    3.0: (2.5, 5.9, 9),
    4.0: (3.0, 7.4, 7),
    5.0: (4.0, 9.0, 6),
}
TYPES = (
    [(2.0, L) for L in (6, 10, 16)] + [(2.5, L) for L in (6, 10, 16)]
    + [(3.0, L) for L in (6, 8, 10, 12, 16, 20)]
    + [(4.0, L) for L in (8, 10, 12, 16, 20, 25)]
    + [(5.0, L) for L in (8, 10, 12, 16, 20, 25)]
)


def screw(d, L):
    """Head at z in [0, d], shank above; then laid along x with the head at -x, centred."""
    hd, hh = 1.5 * d, d
    af = SIZES[d][0]
    head = cyl(hd, hh)
    head = head.faces("<Z").edges().chamfer(0.06 * d).faces(">Z").edges().chamfer(0.1 * d) if False else head
    head = head.edges().chamfer(0.09 * d)
    sock = cq.Workplane("XY").workplane(offset=hh * 0.33).polygon(6, af / math.cos(math.pi / 6)).extrude(hh)
    head = head.cut(sock)
    shank = cyl(d, L, hh - 0.01).faces(">Z").edges().chamfer(0.12 * d)
    s = shp(head.union(shank))
    total = hh + L
    s = s.translate(V(0, 0, -total / 2)).rotate(V(0, 0, 0), V(0, 1, 0), 90)  # z -> x: head toward -x
    return s, total


def hex_key(af, long_, short, bend=4.0):
    """L-shaped hex key lying on a flat: short arm along -y from (0, short), long arm along +x, bent with radius `bend`."""
    c = bend * (1 - math.sqrt(0.5))
    path = (
        cq.Workplane("XY", origin=(0, 0, af / 2))
        .moveTo(0, short)
        .lineTo(0, bend)
        .threePointArc((c, c), (bend, 0))
        .lineTo(long_, 0)
    )
    prof = cq.Workplane("XZ", origin=(0, short, af / 2)).polygon(6, af / math.cos(math.pi / 6))
    return prof.sweep(path)


reg = Reg()
case = Case([(30.0, [34.0] * 6)] * 4, inner_h=16.0)
case.build(reg)
rng = seeded(1760)
total = 0
for (d, L), (xc, yc, x0, y0, x1, y1) in zip(TYPES, case.comps):
    af, pitch, count = SIZES[d]
    proto, tot = screw(d, L)
    slack = (x1 - x0) - tot - 2.0
    hd = 1.5 * d
    n0 = int((y1 - y0 - 2.0) // pitch)
    layers, left = [], count
    k = 0
    while left > 0:
        n = min(n0 - (k % 2), left)
        layers.append(n)
        left -= n
        k += 1
    flip = 0
    for k, n in enumerate(layers):
        for j in range(n):
            dy = (j - (n - 1) / 2) * pitch
            z = case.floor + hd / 2 + k * pitch * 0.866 + 0.05
            dx = rng.uniform(-slack / 2, slack / 2)
            piece = proto
            flip += 1
            if flip % 2:
                piece = piece.rotate(V(0, 0, 0), V(0, 0, 1), 180)
            reg.add("screw", piece.translate(V(xc + dx, yc + dy, z)))
            total += 1

# hex keys in front of the case: the 4 mm one with its short arm toward the case, the 3 mm one turned half a turn
for af, long_, short, y, yaw, x, flip in (
    (4.0, 78.0, 26.0, -case.D / 2 - 38.0, 2.5, -42.0, False),
    (3.0, 66.0, 22.0, -case.D / 2 - 14.0, -2.0, 38.0, True),
):
    k = shp(hex_key(af, long_, short)).translate(V(-long_ / 2, 0, 0))
    if flip:
        k = k.rotate(V(0, 0, 0), V(0, 0, 1), 180)
    k = k.rotate(V(0, 0, 0), V(0, 0, 1), yaw).translate(V(x, y, 0))
    reg.add("hexkey", k)

n = reg.export("screw_kit", "cad/models/screw-kit.step")
print("screw-kit ok:", total, "screws shown,", n, "solids, case", round(case.W, 1), "x", round(case.D, 1), "x", round(case.H, 1))
