"""M3-M8 nylock (nylon insert lock) nut assortment, 150 pieces, in a five-compartment hinged case (lid open).

Nuts (DIN 985 proportions, modelled; no CAD is published): zinc-plated steel hex with chamfered corners, a rounded
collar on top holding the nylon insert (a white ring that stands a little proud of the collar and narrows to the
thread). Across flats / height: M3 5.5 / 4, M4 7 / 5, M5 8 / 5, M6 10 / 6, M8 13 / 8 mm.
The box holds 40 M3, 35 M4, 30 M5, 25 M6 and 20 M8; a heap of each is drawn, loose and mixed in orientation
(on the hex face, on the collar, or on its side).
Case: three compartments of 36 x 32 mm and two of 54.6 x 38 mm, 12 mm deep, clear plastic, removable dividers,
five barrel hinges, snap latch.
"""
import math

import cadquery as cq

from rift_hw import Case, Reg, cyl, hexbar, revolve_z, seeded, shp, V

NUTS = [  # M, AF, height, shown
    (3, 5.5, 4.0, 16),
    (4, 7.0, 5.0, 11),
    (5, 8.0, 5.0, 9),
    (6, 10.0, 6.0, 10),
    (8, 13.0, 8.0, 6),
]


def nut(m, af, h):
    """(metal, nylon) standing on its hex face, centred on x/y, z from 0 to h."""
    h1 = 0.56 * h
    rc = af / math.sqrt(3)
    body = hexbar(af, h1, chamfer=0.14 * af)
    cr = 0.46 * af
    collar = revolve_z([(0, h1 - 0.01), (cr, h1 - 0.01), (cr, h - 0.18 * af), (cr - 0.18 * af, h), (0, h)])
    # the nylon insert's well in the collar, then the thread bore
    r_bore = 0.41 * m
    well_r = 0.31 * af
    well = revolve_z([(0, h1 + 0.2), (well_r, h1 + 0.2), (well_r, h + 0.1), (0, h + 0.1)])
    metal = body.union(collar).cut(well)
    metal = metal.cut(cyl(2 * r_bore, h + 2, -1))
    ring = cyl(2 * well_r, h - h1 - 0.2 + 0.25, h1 + 0.2)
    ring = ring.faces(">Z").edges().chamfer(0.2)
    ring = ring.cut(cyl(2 * r_bore * 0.97, h + 2, -1))
    return shp(metal), shp(ring)


def rest_height(roll, rc):
    return max(rc * math.cos(math.radians(roll + 60 * k)) for k in range(6))


reg = Reg()
case = Case([(32.0, [36.0] * 3), (38.0, [54.6] * 2)], inner_h=12.0, corner=5.0)
case.build(reg)
rng = seeded(150)
total = 0
for (m, af, h, shown), (xc, yc, x0, y0, x1, y1) in zip(NUTS, case.comps):
    metal, nylon = nut(m, af, h)
    pitch = af * 1.22
    nx = int((x1 - x0 - 2) // pitch)
    ny = int((y1 - y0 - 2) // pitch)
    cells = [(i, j) for j in range(ny) for i in range(nx)]
    rng.shuffle(cells)
    f = case.floor
    for (i, j) in cells[:shown]:
        cx = x0 + (x1 - x0) / 2 + (i - (nx - 1) / 2) * pitch + rng.uniform(-0.35, 0.35)
        cy = y0 + (y1 - y0) / 2 + (j - (ny - 1) / 2) * pitch + rng.uniform(-0.35, 0.35)
        mode = rng.choice(("up", "up", "down", "side", "side"))
        yaw = rng.uniform(0, 60) if mode != "side" else rng.uniform(-35, 35)
        for name, s in (("nut", metal), ("nylon", nylon)):
            p = s
            if mode == "up":
                p = p.translate(V(0, 0, f))
            elif mode == "down":
                p = p.rotate(V(0, 0, 0), V(1, 0, 0), 180).translate(V(0, 0, f + h))
            else:
                # axis along x, flats down; centred on the nut's mid-height
                p = p.translate(V(0, 0, -h / 2)).rotate(V(0, 0, 0), V(0, 0, 1), 30).rotate(V(0, 0, 0), V(0, 1, 0), 90)
                p = p.translate(V(0, 0, f + (af / 2)))
            p = p.rotate(V(0, 0, 0), V(0, 0, 1), yaw).translate(V(cx, cy, 0))
            reg.add(name, p)
        total += 1

n = reg.export("nylock_kit", "cad/models/nylock-kit.step")
print("nylock-kit ok:", total, "nuts shown,", n, "solids, case", round(case.W, 1), "x", round(case.D, 1), "x", round(case.H, 1))
