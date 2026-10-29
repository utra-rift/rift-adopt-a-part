"""6061-T6511 aluminium round bar, 1 in diameter x 12 in long, two pieces as sold (McMaster-Carr style listing).

  size     25.4 mm diameter x 304.8 mm long each (1.000 in x 12.000 in)
  finish   mill finish: extruded and drawn, with faint die lines running along the length
  ends     band-saw cut: flat with parallel saw-track striations across the face, a small burr chamfer on the rim;
           one end of each bar is cut a degree or so off square, as sawn stock is
Bars lie side by side on the floor, one slid out 22 mm along the other. Axis along X, floor at z = 0.
No manufacturer CAD (plain bar).
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
D, L = 25.4, 304.8
R = D / 2


def bar(skew_deg):
    b = cq.Workplane("YZ").circle(R).extrude(L)  # x from 0 to L
    # slightly off-square cut at the far end
    if abs(skew_deg) > 0:
        cutter = cq.Workplane("XY").box(10, 60, 60, centered=(False, True, True)).translate((L, 0, 0))
        cutter = cutter.rotate((L, 0, 0), (L, 0, 1), skew_deg)
        b = b.cut(cutter)
        b = b.union(cq.Workplane("YZ").circle(R).extrude(1.5).translate((L - 1.5, 0, 0)).cut(cutter))
    # burr chamfers on both rims
    b = b.faces("<X").edges().chamfer(0.35)
    try:
        b = b.faces(">X").edges().chamfer(0.35)
    except Exception:
        b = b.edges(cq.selectors.BoxSelector((L - 3, -20, -20), (L + 3, 20, 20))).chamfer(0.3)
    # saw-track striations on both ends: shallow flat-bottomed slots across the face
    for x_end, sgn in ((0.0, 1), (L, -1)):
        for i, y in enumerate([k * 3.4 for k in range(-3, 4)]):
            w = 1.3 if i % 2 == 0 else 0.8
            slot = cq.Workplane("XY").box(0.12 * 2, w, D + 4, centered=(True, True, True)).translate((x_end, y + (0.35 if i % 3 == 0 else 0), 0))
            b = b.cut(slot)
    # die lines: shallow half-round grooves along the whole length
    for a in (28, 117, 200, 296):
        ang = math.radians(a)
        c = cq.Workplane("YZ").circle(0.22).extrude(L + 2).translate((-1, (R + 0.12) * math.cos(ang), (R + 0.12) * math.sin(ang)))
        b = b.cut(c)
    return b


bar_a = bar(1.1).translate((0, -R - 0.25, R))
bar_b = bar(-0.8).rotate((0, 0, 0), (0, 1, 0), 0).translate((22, R + 0.25, R))
asm = cq.Assembly(name="round_bar_6061")
asm.add(bar_a, name="bar_a")
asm.add(bar_b, name="bar_b")
asm.export(str(ROOT / "cad/models/round-bar-6061.step"))
print("ok")
