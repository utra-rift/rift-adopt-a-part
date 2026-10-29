"""70-piece miniature bearing assortment in a clear hinged compartment case, lid open.

Ten shielded (ZZ) sizes, seven of each, standing on their rims in ten troughs, largest at the back:
  6203 17x40x12   6903 17x30x7   6000 10x26x8   608 8x22x7   627 7x22x7
  687  7x14x5     685  5x11x5    624  4x13x5    623 3x10x4   693 3x8x4        (bore x OD x width, mm)
Bearings are one revolved body each (rings and recessed shield in one profile), instanced from one solid per size.
The case is modelled to fit them: 216 x 94 mm plan, 26 mm deep base, rounded clamshell with a three-knuckle hinge
along the back edge and two latch tabs at the front; the lid stands open 108 degrees. No maker's CAD or dimensions.
"""
import math
import pathlib
import sys

import cadquery as cq

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bearing_lib import simple_shielded  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]

ROWS = [  # back row first
    [("6203", 17, 40, 12), ("6903", 17, 30, 7), ("6000", 10, 26, 8)],
    [("608", 8, 22, 7), ("627", 7, 22, 7), ("687", 7, 14, 5), ("685", 5, 11, 5)],
    [("624", 4, 13, 5), ("623", 3, 10, 4), ("693", 3, 8, 4)],
]
PER = 7
W, DP = 216.0, 94.0  # outer plan
HBASE, HLID = 26.0, 24.0
WALL, FLOOR, DIV = 2.0, 2.0, 1.2
DIV_H = 17.0
GAP = 0.45


def rounded_box(x, y, z, r, rb=0.0):
    b = cq.Workplane("XY").box(x, y, z, centered=(False, False, False)).edges("|Z").fillet(r)
    return b


def tray(h, name):
    outer = rounded_box(W, DP, h, 5.0)
    outer = outer.faces("<Z").edges().fillet(1.6)
    cav = rounded_box(W - 2 * WALL, DP - 2 * WALL, h, 3.2).translate((WALL, WALL, FLOOR))
    return outer.cut(cav)


# ---- layout of compartments (x ranges per row, y ranges per row)
inner_w = W - 2 * WALL
row_depth = [max(b[2] for b in r) + 2.2 for r in ROWS]
y_cursor = WALL  # build from the front: row index 2 (smallest) at the front
y_of_row = {}
total_div = DIV * (len(ROWS) - 1)
slack_y = (DP - 2 * WALL - sum(row_depth) - total_div)
for ri in (2, 1, 0):
    y0 = y_cursor
    d = row_depth[ri] + slack_y * (row_depth[ri] / sum(row_depth))
    y_of_row[ri] = (y0, y0 + d)
    y_cursor += d + DIV

base = tray(HBASE, "base")
placements = []  # (name, solid)
for ri, row in enumerate(ROWS):
    need = [PER * (b[3] + GAP) + GAP for b in row]
    slack = inner_w - sum(need) - DIV * (len(row) - 1)
    x = WALL
    y0, y1 = y_of_row[ri]
    for ci, (nm, d_, D_, B_) in enumerate(row):
        length = need[ci] + slack / len(row)
        # divider after each compartment except the last
        if ci < len(row) - 1:
            base = base.union(cq.Workplane("XY").box(DIV, y1 - y0, DIV_H, centered=False).translate((x + length, y0, FLOOR)))
        # bearings: push toward the left end of the trough
        bear = simple_shielded(d_, D_, B_).rotate((0, 0, 0), (0, 1, 0), 90).val()
        yc, zc = (y0 + y1) / 2, FLOOR + D_ / 2
        extra = length - need[ci]
        for k in range(PER):
            xc = x + GAP + B_ / 2 + k * (B_ + GAP)
            lean = 0.0
            s = bear
            if extra > B_ and k == PER - 1:  # the last one has room to fall over a little
                lean = 9.0
                s = bear.rotate((0, 0, 0), (0, 1, 0), lean)
                zc_k = FLOOR + (D_ / 2) * math.cos(math.radians(lean)) + (B_ / 2) * math.sin(math.radians(lean))
                placements.append((f"bearing_{nm}_{k}", s.translate((xc + 0.5, yc, zc_k))))
                continue
            placements.append((f"bearing_{nm}_{k}", s.translate((xc, yc, zc))))
        x += length + DIV
    if ri < 2:  # divider between rows (along x), on the front side of this row
        base = base.union(cq.Workplane("XY").box(inner_w, DIV, DIV_H, centered=False).translate((WALL, y0 - DIV, FLOOR)))

# front latch catches on the base
latches_base = []
for lx in (W * 0.28, W * 0.72):
    catch = cq.Workplane("XY").box(16, 2.2, 5, centered=(True, False, False)).translate((lx, -2.2, HBASE - 9.5))
    catch = catch.faces("<Z").edges("|X").chamfer(1.0)
    latches_base.append(catch)

# lid: closed pose first (open side down, sitting on the base rim), then swung about the hinge line
lid = rounded_box(W, DP, HLID, 5.0).faces(">Z").edges().fillet(2.0)
lid_cav = rounded_box(W - 2 * WALL, DP - 2 * WALL, HLID - 2.2, 3.2).translate((WALL, WALL, 0))
lid = lid.cut(lid_cav)
# inner locating lip that drops into the base
lip = rounded_box(W - 2 * WALL - 0.8, DP - 2 * WALL - 0.8, 2.0, 3.0).translate((WALL + 0.4, WALL + 0.4, -2.0))
lip = lip.cut(rounded_box(W - 2 * WALL - 2.8, DP - 2 * WALL - 2.8, 2.0, 2.4).translate((WALL + 1.4, WALL + 1.4, -2.0)))
lid = lid.union(lip)
# four stiffening ribs under the lid top, a raised panel on the outside top
rib_h = 1.2
for k in range(1, 4):
    lid = lid.union(cq.Workplane("XY").box(W - 2 * WALL - 2, 1.0, rib_h, centered=False).translate((WALL + 1, WALL + k * (DP - 2 * WALL) / 4, HLID - 2.2 - rib_h)))
lid = lid.union(rounded_box(W - 28, DP - 24, 0.8, 4).translate((14, 12, HLID)))  # moulded label panel
# lid latch hooks
lid_hooks = []
for lx in (W * 0.28, W * 0.72):
    hook = cq.Workplane("XY").box(16, 2.2, 12, centered=(True, False, False)).translate((lx, -2.2, 4.0)).faces(">X or <X").edges("|Y").fillet(0.0) if False else \
        cq.Workplane("XY").box(16, 2.2, 12, centered=(True, False, False)).translate((lx, -2.2, 2.0))
    # catch window in the hook
    hook = hook.cut(cq.Workplane("XY").box(10, 4, 3.2, centered=(True, True, False)).translate((lx, -1.1, 4.0)))
    lid_hooks.append(hook)
for h in lid_hooks:
    lid = lid.union(h)

# hinge: three knuckles on the base, two on the lid, one pin, along the back edge at the rim
KR, KL = 3.4, 20.0
hinge_y, hinge_z = DP + 1.2, HBASE
def knuckle(x0, x1):
    return cq.Workplane("YZ").circle(KR).circle(1.1).extrude(x1 - x0).translate((x0, hinge_y, hinge_z - 0.2))
base_kn = [knuckle(14, 14 + KL), knuckle(W / 2 - KL / 2, W / 2 + KL / 2), knuckle(W - 14 - KL, W - 14)]
lid_kn = [knuckle(14 + KL + 1.2, W / 2 - KL / 2 - 1.2), knuckle(W / 2 + KL / 2 + 1.2, W - 14 - KL - 1.2)]
# web tabs joining knuckles to their shells
base_tabs = [cq.Workplane("XY").box(x1 - x0, 5.0, 4.0, centered=False).translate((x0, DP - 1.5, HBASE - 4.0)) for x0, x1 in [(14, 14 + KL), (W / 2 - KL / 2, W / 2 + KL / 2), (W - 14 - KL, W - 14)]]
lid_tabs = [cq.Workplane("XY").box(x1 - x0, 5.0, 4.0, centered=False).translate((x0, DP - 1.5, HBASE)) for x0, x1 in [(14 + KL + 1.2, W / 2 - KL / 2 - 1.2), (W / 2 + KL / 2 + 1.2, W - 14 - KL - 1.2)]]
pin = cq.Workplane("YZ").circle(1.05).extrude(W - 24).translate((12, hinge_y, hinge_z - 0.2))

# swing the lid: closed pose has its floor of the cavity at z = HBASE (open side down at z = HBASE)
OPEN = 125.0
axis_p = (0, hinge_y, hinge_z - 0.2)
def swing(s):
    return s.rotate(axis_p, (axis_p[0] + 1, axis_p[1], axis_p[2]), -OPEN)

lid_closed = lid.translate((0, 0, HBASE)).union(lid_tabs[0]).union(lid_tabs[1])
for k in lid_kn:
    lid_closed = lid_closed.union(k)
lid_open = swing(lid_closed.val())
pin_open = pin

base_full = base
for t in base_tabs:
    base_full = base_full.union(t)
for k in base_kn:
    base_full = base_full.union(k)
for c in latches_base:
    base_full = base_full.union(c)

asm = cq.Assembly(name="bearing_kit")
asm.add(base_full, name="case_base")
asm.add(cq.Workplane("XY").add(lid_open), name="case_lid")
asm.add(pin, name="hinge_pin")
for nm, s in placements:
    asm.add(cq.Workplane("XY").add(s), name=nm)
asm.export(str(ROOT / "cad/models/bearing-kit.step"))
print(len(placements), "bearings")
