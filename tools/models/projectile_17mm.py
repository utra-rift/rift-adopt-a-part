"""RoboMaster 17 mm projectile: a plain sphere, Ø16.8 mm (official rules: 16.8 ± 0.2 mm, TPE, 3.2 g).

A one-face B-rep sphere tessellates with zero-area triangles at its poles, which the converter
draws as a stray crease. So the sphere is built as six cube-face patches, each cut from a sphere
whose poles lie outside that patch; the patches meet tangentially, so no seam is drawn.
"""
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
R = 16.8 / 2
D = 2 * R  # pyramid reach, past the sphere

origin = cq.Vector(0, 0, 0)
pieces = []
for a in [cq.Vector(*v) for v in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]]:
    pole = cq.Vector(0, 0, 1) if abs(a.z) < 0.5 else cq.Vector(1, 0, 0)
    side = a.cross(pole)
    base = [a * D + pole * D + side * D, a * D + pole * D - side * D, a * D - pole * D - side * D, a * D - pole * D + side * D]
    faces = [cq.Face.makeFromWires(cq.Wire.makePolygon([origin, base[i], base[(i + 1) % 4]], close=True)) for i in range(4)]
    faces.append(cq.Face.makeFromWires(cq.Wire.makePolygon(base, close=True)))
    pyramid = cq.Solid.makeSolid(cq.Shell.makeShell(faces)).fix()
    pieces.append(cq.Solid.makeSphere(R, origin, pole, -90, 90, 360).intersect(pyramid))

ball = pieces[0].fuse(*pieces[1:], glue=True)
assert ball.isValid()
cq.exporters.export(cq.Workplane().add(ball), str(ROOT / "cad/models/projectile-17mm.step"))
