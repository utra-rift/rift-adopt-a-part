"""JST GH (1.25 mm pitch) housing and crimp-contact assortment in a compartment case.

Housings and contacts are rebuilt from JST's own GH datasheet (https://www.jst-mfg.com/product/pdf/eng/eGH.pdf, viewed
online, not saved; JST sends its GH CAD on request only):
  p. 3  - housing GHR-xxV-S: pitch 1.25 mm, width B = 1.25 x (n - 1) + 2.5 mm (table), 4.15 mm thick, 5.7 mm long
          (drawing), PBT natural (white); outer latch on one broad face, rear cap, contact cavities at pitch.
  p. 2  - contact SSHL-002T-P0.2: 4.8 mm long, 0.8 mm wide, 0.55 mm high front box, open-barrel crimp, tin-plated
          copper alloy; wire range AWG 30-26, insulation O.D. 0.76-1.0 mm.
Numbers marked "measured" were scaled off the drawings from the printed dimension next to them (about +-0.1 mm).
The case, lid and bins are not JST parts: a 172-class organiser case drawn to hold them (assumed sizes).

Layout: nine bins of housings (2 to 10 positions), three bins of loose contacts, a hinged lid opened behind with a
printed chart, and a 4- and a 6-position housing crimped to short silicone leads in front. Front faces -y.
"""
import math
import random

import cadquery as cq
import numpy as np

from amass_xt import box as xbox
from wiring_common import Kit, cyl, sweep_tube, unit, smooth, rgb

rng = random.Random(1250)
kit = Kit("jst_gh_kit")
NATURAL, TIN, CASE = "#f1eee6", "#c8ccd2", "#c9cdd1"

# ---- JST GH datasheet constants
PITCH = 1.25  # printed, p.3 housing drawing
HOUSE_T = 4.15  # printed, p.3 side view
HOUSE_L = 5.7  # printed, p.3 side view
CAP_L = 1.07  # measured: rear cap thickness along the mating axis (65 px at 60.5 px/mm)
BODY_T = 2.65  # measured: body thickness under the latch (163 px)
LATCH_T = 1.4  # measured: latch plate thickness
SLIT = 0.1  # measured: gap between latch and body
CAP_OVER = 0.17  # measured: the cap is wider than the body by this much each side
CONTACT_LEN, CONTACT_W, CONTACT_H = 4.8, 0.8, 0.55  # printed, p.2 contact drawing
WIRE_OD = 0.9  # between the 0.76 and 1.0 mm insulation O.D. on p.2
H, L = HOUSE_T, HOUSE_L
ZC = -H / 2 + BODY_T / 2  # axis of the contact cavities: the middle of the body under the latch


def width(n):
    """B in the housing table, p.3: 3.75 for n = 2 up to 13.75 for n = 10."""
    return PITCH * (n - 1) + 2.5


def ypos(n, i):
    return (i - (n - 1) / 2) * PITCH


def housing(n):
    """GHR-nnV-S. Mating face at x = 0 (front), rear cap at x = -5.7; width along y, the latch on +z."""
    B = width(n)
    A = PITCH * (n - 1)
    z0 = -H / 2
    body = xbox(-L, -L + CAP_L, -B / 2, B / 2, z0, z0 + H)  # rear cap, full width and thickness
    body = body.union(xbox(-L + CAP_L - 0.01, 0.0, -B / 2 + CAP_OVER, B / 2 - CAP_OVER, z0, z0 + H))
    try:
        body = body.edges("|Z").fillet(0.25)
    except Exception:
        pass
    # the latch: a channel round a plate that is separate from the body but for its root in the cap
    wl = max(1.0, A - 1.7)
    zc = z0 + BODY_T
    body = body.cut(xbox(-(L - CAP_L), 0.01, -wl / 2 - SLIT, wl / 2 + SLIT, zc, z0 + H + 0.1))
    latch = xbox(-L + 0.2, -0.9, -wl / 2, wl / 2, zc + SLIT, z0 + H)
    latch = latch.union(xbox(-L + 0.2, -L + CAP_L + 0.4, -wl / 2, wl / 2, zc - 0.05, z0 + H))  # the latch's root, inside the cap
    try:
        latch = latch.faces(">X").edges("|Y").chamfer(0.3)
    except Exception:
        pass
    body = body.union(latch)
    # the outer lock slots at the first and last circuit, down the cap and body (the pale channels in the drawing's front view)
    for sy in (-1, 1):
        body = body.cut(xbox(-L + 0.5, -2.2, sy * A / 2 - 0.35, sy * A / 2 + 0.35, z0 + H - 0.7, z0 + H + 0.1))
    # contact cavities, open at the front and through the cap
    for i in range(n):
        y = ypos(n, i)
        body = body.cut(xbox(-L - 0.1, 0.1, y - 0.4, y + 0.4, ZC - 0.4, ZC + 0.4))
        body = body.cut(xbox(-1.0, 0.1, y - 0.5, y + 0.5, ZC - 0.5, ZC + 0.5))  # lead-in at the face
        body = body.cut(xbox(-3.1, -2.3, y - 0.3, y + 0.3, ZC, zc + 0.01))  # contact retention window, top of the body
    return body


def contact():
    """SSHL-002T-P0.2: 4.8 mm long, front box 0.8 x 0.55, open barrels behind it. Front at x = 0, body toward -x, centred on z = 0."""
    zb = -CONTACT_H / 2
    t = 0.1
    front = xbox(-1.9, 0.0, -CONTACT_W / 2, CONTACT_W / 2, zb, zb + CONTACT_H)
    front = front.cut(xbox(-1.8, 0.01, -CONTACT_W / 2 + t, CONTACT_W / 2 - t, zb + t, zb + CONTACT_H - t))
    neck = xbox(-2.4, -1.9, -0.25, 0.25, zb, zb + t)

    def barrel(x1, x0, w, h):
        out = xbox(x0, x1, -w / 2, w / 2, zb, zb + t)
        for sy in (-1, 1):
            out = out.union(xbox(x0, x1, sy * (w / 2 - t) if sy > 0 else -w / 2, w / 2 if sy > 0 else -w / 2 + t, zb, zb + h))
        return out

    wire_b = barrel(-2.4, -3.3, 0.7, 0.6)
    link = xbox(-3.6, -3.3, -0.25, 0.25, zb, zb + t)
    ins_b = barrel(-3.6, -4.6, CONTACT_W, 0.8)
    tab = xbox(-4.8, -4.6, -0.25, 0.25, zb, zb + t)
    return front.union(neck).union(wire_b).union(link).union(ins_b).union(tab)


HOUSE = {n: housing(n) for n in range(2, 11)}
CONTACT = contact()


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
        while len(spots) < 14 and tries < 4000:
            tries += 1
            x = rng.uniform(-cell_x / 2 + 3.5, cell_x / 2 - 3.5)
            y = rng.uniform(-cell_y / 2 + 3.5, cell_y / 2 - 3.5)
            if all(math.hypot(x - a, y - b) > 4.4 for a, b in spots):
                spots.append((x, y))
        for (x, y) in spots:
            roll = rng.choice([0, 0, 90, 180, 270])
            s = CONTACT.val().rotate((0, 0, 0), (1, 0, 0), roll).rotate((0, 0, 0), (0, 0, 1), rng.uniform(0, 360))
            bb = s.BoundingBox()
            kit.add(s.translate((cx + x - (bb.xmin + bb.xmax) / 2, cy + y - (bb.ymin + bb.ymax) / 2, FLOOR - bb.zmin)), "contact", TIN)

# ---------------------------------------------------------------- housings crimped to leads, lying in front of the case
WIRE_COL = ["#17181a", "#c4181e", "#e6b81c", "#f0f0ec", "#1f8a3b", "#1f55c4"]
WR = WIRE_OD / 2  # wire radius


def lead(n, origin, yaw, swing, n_colors, s_len=56.0):
    """A housing with n contacts crimped to n parallel silicone leads that curve away along the table."""
    put(HOUSE[n], f"lead{n}_house", NATURAL, origin, yaw)
    for i in range(n):
        put(CONTACT.val().translate((-0.9, ypos(n, i), ZC)), f"lead{n}_contact", TIN, origin, yaw)
    # leads: ribbon along a gentle curve; local x runs toward the rear (-x), local y is the ribbon's width
    step = 4.0
    pts_c, th = [], 0.0
    x, yv = -4.6, 0.0
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
            z = ZC - (ZC - (-H / 2 + WR)) * smooth(s / 20.0)  # wire axis, housing-centred; the table is at z = -H/2
            path.append((px + nx * off, py + ny * off, z))
        # strip the last 3 mm into a bare tinned conductor
        w = sweep_tube(path, WR)
        put(w, f"lead{n}_jacket{i % n_colors}", WIRE_COL[i % n_colors], origin, yaw)
        a, b = np.array(path[-2]), np.array(path[-1])
        d = unit(b - a)
        put(cyl(tuple(b - d * 0.3), tuple(d), 0.17, 3.0), f"lead{n}_strand", "#cfd2d6", origin, yaw)


Z0 = H / 2
lead(4, (52.0, -54.0, Z0), 0.0, math.radians(105), 4, 50.0)
lead(6, (-34.0, -66.0, Z0), -90.0 + 8.0, math.radians(125), 6, 46.0)
kit.export("jst-gh-kit")
