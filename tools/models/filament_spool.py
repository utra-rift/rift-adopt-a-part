"""1 kg spool of nylon-carbon-fibre filament, filament drawn as one solid wound band.

No brand is known, so this is the common 1 kg plastic spool as documented on the RepRap wiki
(reprap.org/wiki/Filament_spool): 200 mm flanges, 68 mm overall width, 51-53 mm hole, 85-100 mm hub.
  flange   Ø200 × 3 mm, six windows over the winding so the filament shows through
  width    68 mm overall, so 62 mm between the flanges
  bore     Ø52 mm
  hub      Ø100 mm barrel, 2 mm wall
The band's outer diameter comes from the mass: 1000 g of PA-CF at 1.17 g/cm³ (Polymaker PA6-CF
datasheet value; nylon-CF grades sit at 1.1-1.2) wound at a packing fraction of 0.80 between
Ø100 and the flanges.
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]

FLANGE_D, FLANGE_T = 200.0, 3.0
WIDTH = 68.0
BORE_D = 52.0
HUB_D, HUB_WALL = 100.0, 2.0
INNER_W = WIDTH - 2 * FLANGE_T

MASS_G, DENSITY, PACKING = 1000.0, 1.17, 0.80
band_vol_mm3 = MASS_G / DENSITY / PACKING * 1000.0
BAND_D = math.sqrt(HUB_D**2 + 4 * band_vol_mm3 / (math.pi * INNER_W))

# Windows: six annular sectors over the winding, 40° each with 20° ribs between, rounded ends.
WIN_R0, WIN_R1, WIN_SPAN, WIN_COUNT = 56.0, 88.0, 40.0, 6


def window(angle_deg):
    a0, a1 = math.radians(angle_deg - WIN_SPAN / 2), math.radians(angle_deg + WIN_SPAN / 2)
    am = math.radians(angle_deg)
    pt = lambda r, a: (r * math.cos(a), r * math.sin(a))
    w = (
        cq.Workplane("XY")
        .moveTo(*pt(WIN_R0, a0))
        .lineTo(*pt(WIN_R1, a0))
        .threePointArc(pt(WIN_R1, am), pt(WIN_R1, a1))
        .lineTo(*pt(WIN_R0, a1))
        .threePointArc(pt(WIN_R0, am), pt(WIN_R0, a0))
        .close()
        .extrude(FLANGE_T)
    )
    return w.edges("|Z").fillet(4.0)


def flange(z0):
    f = cq.Workplane("XY").circle(FLANGE_D / 2).circle(BORE_D / 2).extrude(FLANGE_T)
    for k in range(WIN_COUNT):
        f = f.cut(window(30 + k * 360 / WIN_COUNT))
    f = f.faces(">Z or <Z").edges(cq.selectors.RadiusNthSelector(0, directionMax=True)).fillet(1.0)
    return f.translate((0, 0, z0))


hub = (
    cq.Workplane("XY")
    .circle(HUB_D / 2)
    .circle(HUB_D / 2 - HUB_WALL)
    .extrude(INNER_W)
    .translate((0, 0, FLANGE_T))
)
spool = flange(0).union(hub).union(flange(FLANGE_T + INNER_W))

band = (
    cq.Workplane("XY")
    .circle(BAND_D / 2)
    .circle(HUB_D / 2)
    .extrude(INNER_W)
    .translate((0, 0, FLANGE_T))
)

asm = cq.Assembly(name="filament_spool")
asm.add(spool, name="spool")
asm.add(band, name="filament")
asm.export(str(ROOT / "cad/models/filament-spool.step"))
print(f"band Ø{BAND_D:.1f} mm, width {INNER_W:.0f} mm")
