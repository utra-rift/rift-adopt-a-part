"""6800-2RS deep-groove ball bearing, 10 x 19 x 5 mm (ISO 15 dimensions), red rubber contact seals.
Shown as four from the 10-pack, standing on their rims and leaning on one another like a row of dominoes.
  rings   chrome steel, groove radius 0.52 Dw; inner shoulder rp-0.7 mm, outer shoulder rp+0.7 mm (rp = 7.25 mm)
  seals   NBR, recessed 0.15 mm below the face, stepped with a bead at the outer edge and a lip riding the inner ring
  balls   11 x 2.6 mm (inside, hidden by the seals; kept in the CAD, left out of the site part)
"""
import math
import pathlib
import sys

import cadquery as cq

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bearing_lib import deep_groove  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
D, DB, B = 19.0, 10.0, 5.0
N = 4
LEAN = math.radians(13.0)
GAP = 0.25

b = deep_groove(DB, D, B, "rubber")
asm = cq.Assembly(name="bearing_6800")


def place(shape, i):
    # axis Z -> X (rotate about Y by 90), then lean about Y by LEAN, centre at height so the rim rests on z = 0
    s = shape.rotate((0, 0, 0), (0, 1, 0), 90 - math.degrees(LEAN))
    zc = D / 2 * math.cos(LEAN) + B / 2 * math.sin(LEAN)
    x = (i - (N - 1) / 2) * (B + GAP) / math.cos(LEAN)
    return s.translate((x, 0, zc))


def loc(wp, i):
    s = wp.val() if hasattr(wp, "val") else wp
    return place(s, i)


for i in range(N):
    asm.add(cq.Workplane("XY").add(loc(b["inner"], i)), name=f"inner_ring_{i}")
    asm.add(cq.Workplane("XY").add(loc(b["outer"], i)), name=f"outer_ring_{i}")
    asm.add(cq.Workplane("XY").add(cq.Compound.makeCompound([place(x, i) for x in b["balls"]])), name=f"balls_{i}")
    for k, s in enumerate(b["seals"]):
        asm.add(cq.Workplane("XY").add(loc(s, i)), name=f"seal_{i}_{k}")
asm.export(str(ROOT / "cad/models/bearing-6800.step"))
print("6800 row built; dims", {k: round(v, 3) if isinstance(v, float) else v for k, v in b["g"].items()})
