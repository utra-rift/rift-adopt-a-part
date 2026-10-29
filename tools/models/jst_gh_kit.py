"""JST GH (1.25 mm pitch) housing and crimp-contact assortment in a compartment case.

Modelled, not taken from JST's CAD: GHR-style wire-to-board housings of 2 to 10 positions (natural nylon; width
1.25 x (n - 1) + 3.0 mm, 3.5 mm high, 5.0 mm deep, with a moulded latch ramp, front shoulder, top retention
windows and side ribs) and open-barrel crimp contacts (gold-plated, 0.8 x 1.5 mm box, wire barrel and insulation
barrel, broken carrier tab). A 172 x 112 x 24 mm clear-grey case with twelve compartments: the nine housing sizes
and three contact bins, a hinged lid opened behind it, and two housings crimped to short silicone leads (4 and 6
position) lying in front. Front faces -y.
"""
import math
import random

import cadquery as cq
import numpy as np

from amass_xt import prism
from wiring_common import Kit, cyl, sweep_tube, unit, smooth, rgb

rng = random.Random(1250)
kit = Kit("jst_gh_kit")
NATURAL, GOLD, CASE, STEEL = "#ece6d2", "#d7a93b", "#c9cdd1", "#aeb2b8"
PITCH, H, L = 1.25, 3.5, 5.0


def width(n):
    return PITCH * (n - 1) + 3.0


def ypos(n, i):
    return (i - (n - 1) / 2) * PITCH


def housing(n):
    W = width(n)
    body = prism(W, H, 0.45, -L, -1.4).union(prism(W - 0.7, H - 0.3, 0.35, -1.4, 0.0))
    # latch ramp on top and a retaining groove behind it
    ramp = (cq.Workplane("XZ").polyline([(-3.9, H / 2 - 0.02), (-2.3, H / 2 - 0.02), (-2.3, H / 2 + 0.38), (-3.1, H / 2 + 0.38)]).close()
            .extrude(1.7, both=True))
    body = body.union(ramp)
    body = body.cut(cq.Workplane("XY").box(0.45, W - 1.4, 0.35).translate((-4.5, 0, H / 2 - 0.1)))
    # side ribs
    for sy in (-1, 1):
        body = body.union(cq.Workplane("XY").box(1.6, 0.3, 1.2).translate((-2.6, sy * (W / 2 + 0.1), 0.0)))
    for i in range(n):
        y = ypos(n, i)
        body = body.cut(cq.Workplane("XY").box(L + 0.2, 0.85, 1.7).translate((-L / 2 + 0.1, y, -0.1)))
        body = body.cut(cq.Workplane("XY").box(1.2, 1.05, 2.0).translate((-0.6, y, -0.1)))
        body = body.cut(cq.Workplane("XY").box(1.2, 0.7, 1.3).translate((-2.6, y, 0.9)))
    return body


def contact():
    """Open-barrel crimp contact, front at x = 0, body toward -x, barrels open upward; centre of the box at z = -0.1."""
    z0 = -0.95  # floor of the contact
    box = cq.Workplane("XY").box(2.9, 0.78, 1.55, centered=(False, True, False)).translate((-2.9, 0, z0))
    box = box.cut(cq.Workplane("XY").box(2.3, 0.5, 1.2, centered=(False, True, False)).translate((-2.3, 0, z0 + 0.14)))
    box = box.cut(cq.Workplane("XY").box(0.5, 0.3, 0.5, centered=(False, True, False)).translate((-1.4, 0, z0 + 1.2)))
    neck = cq.Workplane("XY").box(1.2, 0.5, 0.14, centered=(False, True, False)).translate((-4.0, 0, z0))

    def barrel(x1, x0, w, hgt, t=0.14):
        base = cq.Workplane("XY").box(x1 - x0, w, t, centered=(False, True, False)).translate((x0, 0, z0))
        out = base
        for sy in (-1, 1):
            out = out.union(cq.Workplane("XY").box(x1 - x0, t, hgt, centered=(False, True, False)).translate((x0, sy * (w / 2 - t / 2), z0)))
        return out

    wire_b = barrel(-4.0, -5.4, 1.1, 0.85)
    ins_b = barrel(-5.8, -7.3, 1.7, 1.2)
    link = cq.Workplane("XY").box(0.4, 0.5, 0.14, centered=(False, True, False)).translate((-5.8, 0, z0))
    carrier = cq.Workplane("XY").box(1.1, 0.55, 0.14, centered=(False, True, False)).translate((-8.4, 0, z0))
    tie = cq.Workplane("XY").box(0.5, 0.5, 0.14, centered=(False, True, False)).translate((-7.5, 0, z0))
    return box.union(neck).union(wire_b).union(link).union(ins_b).union(tie).union(carrier)


HOUSE = {n: housing(n) for n in range(2, 11)}
CONTACT = contact()
cb = CONTACT.val().BoundingBox()
c_len, c_w, c_h = cb.xlen, cb.ylen, cb.zlen


def put(shape, name, col, origin, yaw=0.0, roll=0.0, pitch=0.0):
    s = shape.val() if isinstance(shape, cq.Workplane) else shape
    if roll:
        s = s.rotate((0, 0, 0), (1, 0, 0), roll)
    if pitch:
        s = s.rotate((0, 0, 0), (0, 1, 0), pitch)
    s = s.rotate((0, 0, 0), (0, 0, 1), yaw).translate(origin)
    kit.add(s, name, col)
    return s


# ---------------------------------------------------------------- the case
WALL, FLOOR, DIV = 1.6, 1.2, 1.2
COLS, ROWS = 4, 3
cell_x, cell_y = 25.0, 24.0
CX = COLS * cell_x + (COLS - 1) * DIV + 2 * WALL
CY = ROWS * cell_y + (ROWS - 1) * DIV + 2 * WALL
CZ = 9.0
shell = cq.Workplane("XY").box(CX, CY, CZ, centered=(True, True, False)).edges("|Z").fillet(3.0)
shell = shell.cut(cq.Workplane("XY").box(CX - 2 * WALL, CY - 2 * WALL, CZ, centered=(True, True, False)).translate((0, 0, FLOOR)).edges("|Z").fillet(1.6))
kit.add(shell, "case", CASE)
xs = [-CX / 2 + WALL + cell_x / 2 + c * (cell_x + DIV) for c in range(COLS)]
ys = [CY / 2 - WALL - cell_y / 2 - r * (cell_y + DIV) for r in range(ROWS)]
DIV_H = CZ - 2.5
for c in range(1, COLS):
    x = -CX / 2 + WALL + c * cell_x + (c - 0.5) * DIV
    kit.add(cq.Workplane("XY").box(DIV, CY - 2 * WALL, DIV_H, centered=(True, True, False)).translate((x, 0, 0)), "divider", CASE)
for r in range(1, ROWS):
    y = CY / 2 - WALL - r * cell_y - (r - 0.5) * DIV
    kit.add(cq.Workplane("XY").box(CX - 2 * WALL, DIV, DIV_H, centered=(True, True, False)).translate((0, y, 0)), "divider", CASE)
# front latches (two clasp tongues) and hinge barrels at the back
for sx in (-1, 1):
    kit.add(cq.Workplane("XY").box(10.0, 1.8, 5.0, centered=(True, True, False)).edges("|X").fillet(0.6).translate((sx * 30.0, -CY / 2 - 0.5, CZ - 6.5)), "latch", CASE)
    kit.add(cq.Workplane("XY").box(7.0, 0.8, 2.2, centered=(True, True, False)).translate((sx * 30.0, -CY / 2 - 1.3, CZ - 1.6)), "latch", CASE)
for sx in (-1, 0, 1):
    kit.add(cyl((sx * 30.0 - 5.0, CY / 2 + 1.0, CZ - 1.6), (1, 0, 0), 1.5, 10.0), "hinge", CASE)

# ---------------------------------------------------------------- the lid, hinged on the back edge and opened wide
LID_T, LID_RIM = 1.2, 4.5
lid = cq.Workplane("XY").box(CX, CY, LID_T, centered=(True, True, False)).edges("|Z").fillet(3.0)
lid_rim = cq.Workplane("XY").box(CX, CY, LID_RIM, centered=(True, True, False)).edges("|Z").fillet(3.0)
lid_rim = lid_rim.cut(cq.Workplane("XY").box(CX - 2 * 1.2, CY - 2 * 1.2, LID_RIM, centered=(True, True, False)).edges("|Z").fillet(1.8))
lid = lid.union(lid_rim)
for k in (-1, 1):
    lid = lid.union(cq.Workplane("XY").box(CX - 5.0, 1.0, 2.4, centered=(True, True, False)).translate((0, k * 18.0, LID_T)))
lid_closed = lid.mirror("XY").translate((0, 0, CZ + 1.0 + LID_RIM))
# printed pin-count chart on the lid's inner face: a white label with ruled lines and a header bar
zin = CZ + 1.0 + LID_RIM - LID_T  # underside of the lid plate (inner face), the lid hangs rim-down
label = cq.Workplane("XY").box(76.0, 34.0, 0.15, centered=(True, True, False)).translate((0, 0, zin - 0.15))
lid_label = [(label, "label_paper")]
for k in range(1, 9):
    lid_label.append((cq.Workplane("XY").box(0.25, 26.0, 0.1, centered=(True, True, False)).translate((-38.0 + 76.0 * k / 9, -1.5, zin - 0.25)), "label_ink"))
for k in range(0, 4):
    lid_label.append((cq.Workplane("XY").box(72.0, 0.25, 0.1, centered=(True, True, False)).translate((0, -14.0 + 28.0 * k / 3, zin - 0.25)), "label_ink"))
lid_label.append((cq.Workplane("XY").box(72.0, 5.0, 0.1, centered=(True, True, False)).translate((0, 14.0, zin - 0.25)), "label_ink"))
HINGE_Y, HINGE_Z = CY / 2 + 1.0, CZ - 1.6
lid_open = lid_closed.val().rotate((0, HINGE_Y, HINGE_Z), (1, HINGE_Y, HINGE_Z), -138.0)
kit.add(lid_open, "lid", CASE)
for wp, nm in lid_label:
    kit.add(wp.val().rotate((0, HINGE_Y, HINGE_Z), (1, HINGE_Y, HINGE_Z), -138.0), nm, "#f4f4f0" if nm == "label_paper" else "#26272b")

# ---------------------------------------------------------------- contents of the compartments
sizes = list(range(2, 11))
layout = {}
for idx, (c, r) in enumerate([(c, r) for r in range(ROWS) for c in range(COLS)]):
    layout[(c, r)] = ("house", sizes[idx]) if idx < 9 else ("contact", idx - 9)


def drop(shape_wp, x, y, yaw, floor_z):
    """Place so the lowest point rests at floor_z."""
    s = shape_wp.val().rotate((0, 0, 0), (0, 0, 1), yaw)
    bb = s.BoundingBox()
    return s.translate((x, y, floor_z - bb.zmin))


for (c, r), (kind, k) in layout.items():
    cx, cy = xs[c], ys[r]
    if kind == "house":
        n = k
        W = width(n)
        per_row = max(1, int((cell_x - 2.0) // (W + 0.8)))
        rows_n = 3
        placed = []
        for rr in range(rows_n):
            for cc in range(per_row):
                dx = (cc - (per_row - 1) / 2) * (W + 0.9) + rng.uniform(-0.3, 0.3)
                dy = (rr - (rows_n - 1) / 2) * (L + 2.2) + rng.uniform(-0.3, 0.3)
                sh = drop(HOUSE[n], cx + dx, cy + dy, rng.uniform(-4, 4) + 90.0, FLOOR)
                kit.add(sh, f"house{n}", NATURAL)
                placed.append((dx, dy))
        for t in range(2 if n >= 3 else 3):
            dx, dy = placed[(t * 2 + 1) % len(placed)]
            sh = drop(HOUSE[n], cx + dx + rng.uniform(-1, 1), cy + dy + 1.5, rng.uniform(-30, 30) + 90.0, FLOOR + H - 0.15)
            kit.add(sh, f"house{n}", NATURAL)
    else:
        spots, tries = [], 0
        while len(spots) < 10 and tries < 4000:
            tries += 1
            x = rng.uniform(-cell_x / 2 + 5.5, cell_x / 2 - 5.5)
            y = rng.uniform(-cell_y / 2 + 5.5, cell_y / 2 - 5.5)
            if all(math.hypot(x - a, y - b) > 5.2 for a, b in spots):
                spots.append((x, y))
        for (x, y) in spots:
            roll = rng.choice([0, 0, 90, 180, 270])
            s = CONTACT.val().rotate((0, 0, 0), (1, 0, 0), roll).rotate((0, 0, 0), (0, 0, 1), rng.uniform(0, 360))
            bb = s.BoundingBox()
            kit.add(s.translate((cx + x - (bb.xmin + bb.xmax) / 2, cy + y - (bb.ymin + bb.ymax) / 2, FLOOR - bb.zmin)), "contact", GOLD)

# ---------------------------------------------------------------- housings crimped to leads, lying in front of the case
WIRE_COL = ["#17181a", "#c4181e", "#e6b81c", "#f0f0ec", "#1f8a3b", "#1f55c4"]
WR = 0.5  # wire radius


def lead(n, origin, yaw, swing, n_colors, s_len=56.0):
    """A housing with n contacts crimped to n parallel silicone leads that curve away along the table."""
    put(HOUSE[n], f"lead{n}_house", NATURAL, origin, yaw)
    for i in range(n):
        put(CONTACT.val().translate((0, ypos(n, i), 0)), f"lead{n}_contact", GOLD, origin, yaw)
    # leads: ribbon along a gentle curve; local x runs toward the rear (-x), local y is the ribbon's width
    step = 4.0
    pts_c, th = [], 0.0
    x, yv = -6.0, 0.0
    for k in range(int(s_len / step) + 1):
        s = k * step
        pts_c.append((x, yv, s))
        heading = math.pi + swing * smooth(s / s_len) * 1.0  # direction of travel: -x then turning
        x += step * math.cos(heading)
        yv += step * math.sin(heading)
    for i in range(n):
        off = ypos(n, i)
        path = []
        for k, (px, py, s) in enumerate(pts_c):
            heading = math.pi + swing * smooth(s / s_len)
            nx, ny = -math.sin(heading), math.cos(heading)  # left normal of travel
            z = max(-H / 2 + WR, -0.35 - 1.1 * smooth(s / 24.0))  # wire axis, housing-centred; the table is at z = -H/2
            path.append((px + nx * off, py + ny * off, z))
        # strip the last 3 mm into a bare tinned conductor
        w = sweep_tube(path, WR)
        put(w, f"lead{n}_jacket{i % n_colors}", WIRE_COL[i % n_colors], origin, yaw)
        a, b = np.array(path[-2]), np.array(path[-1])
        d = unit(b - a)
        put(cyl(tuple(b - d * 0.3), tuple(d), 0.27, 3.5), f"lead{n}_strand", "#cfd2d6", origin, yaw)


Z0 = H / 2
lead(4, (52.0, -54.0, Z0), 0.0, math.radians(105), 4, 50.0)
lead(6, (-34.0, -66.0, Z0), -90.0 + 8.0, math.radians(125), 6, 46.0)
kit.export("jst-gh-kit")
