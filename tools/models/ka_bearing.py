"""Kaydon Reali-Slim KA-series thin-section four-point-contact ball bearings, open type (X), modelled.

Kaydon / Timken publish CAD only through a login-gated portal, so this is modelled from the catalogue
series geometry (KA: 1/4 in x 1/4 in section; Reali-Slim catalogue, ball 1/8 in) and the exact bore/OD/width:
  KA040XP0  4.000 x 4.500 x 0.250 in  (101.6 x 114.3 x 6.35 mm)
  KA020XP0  2.000 x 2.500 x 0.250 in  ( 50.8 x  63.5 x 6.35 mm)
  rings     52100 chrome steel; gothic-arch (two-arc) raceways, 35 deg contact angle, chamfered faces
  balls     1/8 in (3.175 mm), full ring of them, count from the pitch circle (68 / 36)
  separator one-piece nylon crown ring with radial pockets, riding in the radial slot between the rings
Axis is Z, bearing centred on the origin.
"""
import math
import pathlib
import sys

import cadquery as cq

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bearing_lib import arc_mid, arc_pt, revolve_profile  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
IN = 25.4
B = 0.25 * IN
HB = B / 2
DW = 0.125 * IN  # ball
RB = DW / 2
PHI = math.radians(35.0)  # contact angle
RG = 0.53 * DW  # raceway arc radius
E = RG - RB
SHOULDER = 0.82 * RB  # shoulder stands this far off the pitch circle
CH = 0.3  # face chamfers
CH_SLOT = 0.3  # chamfer at the mouth of the radial slot


def build(bore_in, od_in, n_balls):
    r0, r1 = bore_in * IN / 2, od_in * IN / 2
    rp = (r0 + r1) / 2
    rb = RB
    # Inner ring (outer surface is the raceway): arcs centred outward of the ball centre
    def race(side):
        """side=+1 inner ring (raceway faces outward), -1 outer ring (faces inward). Returns arc data."""
        s = side
        # upper contact arc centre (r, z) and lower contact arc centre
        cu = (rp + s * E * math.cos(PHI), -E * math.sin(PHI))
        cl = (rp + s * E * math.cos(PHI), +E * math.sin(PHI))
        rs = rp + s * SHOULDER  # shoulder surface radius, inner ring: smaller than pitch
        # shoulder = rp - SHOULDER for inner ring; so use -s
        rs = rp - s * SHOULDER
        # z where each arc meets the shoulder radius
        dz = math.sqrt(RG**2 - (rs - cu[0]) ** 2)
        zu = cu[1] + dz  # upper arc meets shoulder at +zu
        zl = cl[1] - dz
        rbot = cu[0] - s * math.sqrt(RG**2 - cu[1] ** 2)  # groove bottom radius (arcs cross at z=0)
        return cu, cl, rs, zu, zl, rbot

    def ring(side):
        cu, cl, rs, zu, zl, rbot = race(side)
        s = side
        edge = r0 if s > 0 else r1  # bore (inner ring) or OD (outer ring)
        ein = edge + CH * s  # chamfered start toward the groove side
        def ang(c, p):
            return math.atan2(p[1] - c[1], p[0] - c[0])
        # upper arc: from shoulder at (rs, zu) down to bottom (rbot, 0); lower: bottom to (rs, zl)
        pu0, pu1 = (rs, zu), (rbot, 0.0)
        pl0, pl1 = (rbot, 0.0), (rs, zl)
        mu = arc_mid(cu, RG, ang(cu, pu0), ang(cu, pu1))
        ml = arc_mid(cl, RG, ang(cl, pl0), ang(cl, pl1))
        c2 = CH_SLOT
        segs = [
            ("M", (edge + s * CH, HB)),
            ("L", (rs - s * c2, HB)),
            ("L", (rs, HB - c2)),
            ("L", pu0),
            ("A", mu, pu1),
            ("A", ml, pl1),
            ("L", (rs, -HB + c2)),
            ("L", (rs - s * c2, -HB)),
            ("L", (edge + s * CH, -HB)),
            ("L", (edge, -HB + CH)),
            ("L", (edge, HB - CH)),
        ]
        return revolve_profile(segs)

    inner, outer = ring(+1), ring(-1)
    # balls
    ball0 = cq.Workplane("XY").sphere(rb).translate((rp, 0, 0)).val()
    balls = [ball0.rotate((0, 0, 0), (0, 0, 1), 360.0 * k / n_balls) for k in range(n_balls)]
    # separator: crown ring with a radial pocket per ball
    sep_r0, sep_r1, sep_h = rp - 0.62, rp + 0.62, 0.78
    sep = (cq.Workplane("XY").circle(sep_r1).circle(sep_r0).extrude(2 * sep_h).translate((0, 0, -sep_h)))
    sep = sep.faces(">Z or <Z").edges().chamfer(0.12)
    pocket = (cq.Workplane("YZ").circle(rb * 1.06).extrude(rp + 2.0))
    cutters = None
    for k in range(n_balls):
        p = pocket.rotate((0, 0, 0), (0, 0, 1), 360.0 * k / n_balls)
        sep = sep.cut(p)
    return inner, outer, balls, sep


def export(name, asm_name, bore_in, od_in, n_balls):
    inner, outer, balls, sep = build(bore_in, od_in, n_balls)
    asm = cq.Assembly(name=asm_name)
    asm.add(inner, name="inner_ring")
    asm.add(outer, name="outer_ring")
    asm.add(cq.Workplane("XY").add(cq.Compound.makeCompound(balls)), name="balls")
    asm.add(sep, name="separator")
    out = ROOT / f"cad/models/{name}.step"
    asm.export(str(out))
    bb = cq.Compound.makeCompound([inner.val(), outer.val()]).BoundingBox()
    print(f"{name}: {bb.xlen:.2f} x {bb.ylen:.2f} x {bb.zlen:.2f} mm, {n_balls} balls")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("ka040xp0", "both"):
        export("ka040xp0", "ka040xp0", 4.0, 4.5, 68)
    if which in ("ka020xp0", "both"):
        export("ka020xp0", "ka020xp0", 2.0, 2.5, 36)
