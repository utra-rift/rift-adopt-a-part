"""M3 aluminium round spacer kit, 65 pieces, in a 10-compartment hinged case (lid open).

Spacers (typical kit, modelled; no CAD is published): unthreaded aluminium tube, 6 mm OD, 3.2 mm bore (clearance for M3),
ends chamfered 0.25 mm. Ten lengths, 65 pieces: 3 mm x8, 4 x8, 5 x8, 6 x7, 8 x7, 10 x6, 12 x6, 15 x5, 16 x5, 20 x5.
Case: 5 x 2 compartments of 30 x 28 mm, 12 mm deep, clear plastic, removable dividers, five barrel hinges, snap latch.
Pieces lie along x in heaps of two or three layers.
"""
import cadquery as cq

from rift_hw import Case, Reg, cyl, seeded, shp, V

OD, ID = 6.0, 3.2
KIT = [(3, 8), (4, 8), (5, 8), (6, 7), (8, 7), (10, 6), (12, 6), (15, 5), (16, 5), (20, 5)]
assert sum(c for _, c in KIT) == 65


def spacer(L):
    t = cyl(OD, L).cut(cyl(ID, L + 2, -1))
    t = t.faces(">Z or <Z").edges().chamfer(0.25)
    return shp(t).rotate(V(0, 0, 0), V(0, 1, 0), 90).translate(V(-L / 2, 0, 0))


def layers_for(c):
    if c >= 7:
        return [4, 3, c - 7] if c > 7 else [4, 3]
    return [3, 3] if c == 6 else [3, 2]


reg = Reg()
case = Case([(28.0, [30.0] * 5)] * 2, inner_h=12.0)
case.build(reg)
rng = seeded(65)
total = 0
PITCH = OD + 0.5
for (L, c), (xc, yc, x0, y0, x1, y1) in zip(KIT, case.comps):
    proto = spacer(L)
    slack = (x1 - x0) - L - 3.0
    layers = [n for n in layers_for(c) if n > 0]
    for k, n in enumerate(layers):
        for j in range(n):
            dy = (j - (n - 1) / 2) * PITCH
            if k == 2:
                dy = 0.0
            dx = rng.uniform(-slack / 2, slack / 2)
            z = case.floor + OD / 2 + k * (PITCH * 0.866) + 0.05
            reg.add("spacer", proto.translate(V(xc + dx, yc + dy, z)))
            total += 1
assert total == 65, total
n = reg.export("m3_spacers", "cad/models/m3-spacers.step")
print("m3-spacers ok:", total, "spacers,", n, "solids, case", round(case.W, 1), "x", round(case.D, 1), "x", round(case.H, 1))
