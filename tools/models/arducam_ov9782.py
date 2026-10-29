"""Arducam OV9782 (B0385) 1 MP global-shutter colour USB camera board, M12 lens, with its USB lead.

No CAD is published for this SKU (UC-852 Rev.A board), so it is modelled from the Arducam datasheet drawing and
the product photos in cad/raw/arducam-ov9782/:
  board        38 x 38 mm, 1.6 mm, black mask; 4 holes Ø2.6 on 34 x 34 and 4 holes Ø2.8 on 28 x 28 with gold rings;
               routed edge slots with gold plating; L/R 2 x 3 footprints and the G S F pads on the front
  holder       black M12 holder, 7 mm tall, ribbed Ø14 body, two screw ears on the vertical axis
  lens         M27280M07S: Ø14 head 4.3, Ø12 x P0.5 thread 8.9 (total 13.2), 7 mm holder
  back         LQFP-64 USB bridge, 8-pin flash, crystal, MLCCs, two silver ear screws, 4-pin JST ZR side-entry socket
  lead         JST ZR plug, four wires, black jacket, USB-A plug; the lead is shortened to ~230 mm and laid in a loose loop
Pose: board stands on a side edge, lens toward -y, leaning back 12 degrees; the lead drops to the table.
Local frame while building: board centre at the origin, lens side +z.
"""
import math
import random

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
T = 1.6  # board thickness
rng = random.Random(9782)

# ---------------------------------------------------------------- board
pcb = box(0, 0, 0, 38, 38, T, 0.6)
pcb = pcb.faces(">Z").workplane().pushPoints([(sx * 17, sy * 17) for sx in (-1, 1) for sy in (-1, 1)]).hole(2.6)
pcb = pcb.faces(">Z").workplane().pushPoints([(sx * 14, sy * 14) for sx in (-1, 1) for sy in (-1, 1)]).hole(2.8)

# routed edge slots: one centred slot per side plus an L around each inner hole (two straights)
slots = []
for s in (-1, 1):
    slots.append((0, s * 16.4, 15.5, 0.9, 0))  # top / bottom
    slots.append((s * 16.4, 0, 15.5, 0.9, 90))  # left / right
    for t in (-1, 1):
        slots.append((s * 16.4, t * 11.9, 4.2, 0.9, 90))  # short ones beside the corner holes
        slots.append((t * 11.9, s * 16.4, 4.2, 0.9, 0))
for cx, cy, l, w, a in slots:
    pcb = pcb.cut(stadium(cx, cy, l, w, a, -0.1, T + 0.2))
K.add("pcb", pcb)

gold = []
for (px, py, d) in [(sx * 17, sy * 17, 2.6) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 14, sy * 14, 2.8) for sx in (-1, 1) for sy in (-1, 1)]:
    for z in (-0.04, T):
        gold.append(ring(px, py, z, d + 0.9, d, 0.04))
for cx, cy, l, w, a in slots:  # slot plating collar on the front face
    o = stadium(cx, cy, l + 0.7, w + 0.7, a, T, 0.04)
    i = stadium(cx, cy, l, w, a, T - 0.01, 0.06)
    gold.append(o.cut(i))
K.add("gold", gold)

# ---------------------------------------------------------------- front: footprints, pads, chips
silk, pads = [], []


def footprint(cx, cy, cols=2, rows=3, pitch=1.27, w=7.4, d=6.0, rot=0):
    out = box(0, 0, 0, w, d, 0.03)
    inner = box(0, 0, 0, w - 0.5, d - 0.5, 0.05)
    frame = out.cut(inner)
    silk.append(place(frame, cx, cy, T, rz=rot))
    for i in range(cols):
        for j in range(rows):
            px = (i - (cols - 1) / 2) * pitch * 1.6
            py = (j - (rows - 1) / 2) * pitch
            pads.append(place(cyl(0, 0, 0, 0.9, 0.05), cx, cy, T, rz=rot).translate((0, 0, 0)).translate((px if rot == 0 else -py, py if rot == 0 else px, 0)))


footprint(-9.6, 13.2)
footprint(-9.2, -9.0)
for i in range(3):  # G S F pads
    pads.append(cyl(1.0 + i * 2.2, 14.8, T, 1.1, 0.05))
    silk.append(box(1.0 + i * 2.2, 13.4, T, 0.7, 0.25, 0.03))
for i in range(3):  # test pads right of the footprints
    pads.append(cyl(-14.8, 4.0 - i * 1.8, T, 0.9, 0.05))
K.add("gold", pads)
K.add("silk", silk)

res, caps, ends = [], [], []


def chip(kind, x, y, rot, front=True, kindname="res"):
    body, term = smd(kind, x, y, T if front else 0.0, rot)
    if not front:
        body = body.mirror("XY", (0, 0, 0)) if False else body
    (res if kindname == "res" else caps).append(body)
    ends.extend(term)


front_chips = [
    ("0402", -4.5, 9.2, 0, "res"), ("0402", -4.5, 7.9, 0, "res"), ("0402", -6.3, 9.2, 90, "cap"),
    ("0603", 8.2, 6.8, 90, "cap"), ("0603", 8.2, 4.6, 90, "res"), ("0603", 10.5, 6.8, 90, "res"), ("0603", 10.5, 4.6, 90, "cap"),
    ("0603", 9.4, 1.0, 0, "res"), ("0603", 9.4, -0.6, 0, "res"), ("0805", 11.6, -2.4, 90, "cap"), ("0805", 9.2, -3.6, 90, "res"),
    ("0603", 8.6, -7.4, 0, "cap"), ("0603", 8.6, -9.0, 0, "res"), ("0603", 10.8, -8.2, 90, "res"), ("0402", 11.5, 9.6, 0, "res"),
    ("0402", 11.5, 11.0, 0, "res"), ("0402", 13.0, 10.3, 90, "cap"),
    ("0402", -12.5, 1.0, 90, "res"), ("0402", -12.5, -0.8, 90, "res"), ("0402", -12.5, -2.6, 90, "cap"), ("0603", -14.2, 3.0, 0, "cap"),
    ("0402", -7.0, 0.4, 90, "res"), ("0402", -8.4, 0.4, 90, "res"), ("0402", -9.8, 0.4, 90, "cap"),
    ("0603", 1.6, -9.6, 0, "cap"), ("0603", 4.4, -9.6, 0, "res"), ("0402", 6.4, -9.6, 0, "res"), ("0603", 1.2, -12.2, 0, "res"),
    ("0603", 3.5, -12.2, 0, "res"), ("0402", -2.0, -11.0, 90, "cap"), ("0402", -3.4, -11.0, 90, "res"),
    ("0402", -1.5, 11.0, 90, "res"), ("0402", -3.0, 11.8, 0, "cap"), ("0402", 6.5, 10.8, 0, "res"),
]
for kind, x, y, rot, kn in front_chips:
    chip(kind, x, y, rot, True, kn)

# tiny ICs near the holder (SOT-23-6 style): body + 6 legs
for (x, y, rot) in [(-3.6, -6.6, 0), (4.8, 8.2, 90)]:
    body = box(0, 0, 0.1, 2.9, 1.6, 1.0)
    K.add("ic", place(body, x, y, T, rz=rot))
    for i in range(3):
        for s in (-1, 1):
            ends.append(place(box(-0.95 + i * 0.95, s * 1.3, 0, 0.35, 0.7, 0.12), x, y, T, rz=rot))
# 32 kHz-style crystal near the holder, metal can
K.add("nickel", [place(box(0, 0, 0, 3.2, 2.5, 0.8, 0.2), -9.4, 6.0, T, rz=0)])
for s in (-1, 1):
    ends.append(place(box(s * 1.2, 0, 0, 0.8, 1.9, 0.08), -9.4, 6.0, T - 0.08 + 0.1, rz=0))

K.add("ic", res)
K.add("tan", caps)
K.add("nickel", ends)

# ---------------------------------------------------------------- M12 holder (front)
HOLD_H = 7.0
holder = knurled(0, 0, T, 7.0, 6.65, 48, HOLD_H)
# square-ish base flange, 14 x 14 x 1.6 with rounded corners, under the ribbed body
base = box(0, 0, T, 14.4, 14.4, 1.6, 2.4)
ears = []
for s in (-1, 1):
    ear = box(0, s * 8.9, T, 6.6, 6.4, 2.4, 1.2)
    ear = ear.faces(">Z").workplane().center(0, s * 0 ).hole(0.1) if False else ear
    ear = ear.cut(cyl(0, s * 9.6, T - 0.1, 2.3, 2.7))
    ears.append(ear)
holder = holder.union(base)
for e in ears:
    holder = holder.union(e)
K.add("holder", holder)
# ear screws on top of the ears (steel pan heads)
for s in (-1, 1):
    K.add("steel", pan_screw(0, s * 9.6, T + 2.4, 3.9, 1.1))
# M12 bore ring and lens: the lens thread is sunk 7 mm into the holder; 1.9 mm of it shows below the head
z_hold_top = T + HOLD_H
z_head0 = z_hold_top + 1.9
lens_prof = [
    (0, z_head0 - 0.2), (5.4, z_head0 - 0.2),  # under the head, lens body centre
]
# visible thread (Ø12, P0.5) from holder top to head: a saw-tooth profile revolved
thr = [(0, z_hold_top - 0.3), (5.7, z_hold_top - 0.3)]
z = z_hold_top - 0.3
pitch = 0.5
while z < z_head0 - 0.05:
    thr += [(5.7, z), (6.0, z + pitch * 0.35), (6.0, z + pitch * 0.65), (5.7, z + pitch)]
    z += pitch
thr += [(5.7, z_head0), (0, z_head0)]
K.add("lens", lathe(thr))
# head: Ø14, 4.3 tall, chamfered rim, sunk front with a Ø9 bore and a stepped barrel
H = 4.3
head = [
    (0, z_head0), (6.55, z_head0), (7.0, z_head0 + 0.45), (7.0, z_head0 + H - 0.6), (6.5, z_head0 + H),
    (5.0, z_head0 + H), (4.9, z_head0 + H - 0.5), (4.55, z_head0 + H - 0.7), (4.55, z_head0 + 1.1), (0, z_head0 + 1.1),
]
K.add("lens", lathe(head))
# knurl band on the head
K.add("lens", knurled(0, 0, z_head0 + 0.9, 7.06, 6.9, 60, 2.2).cut(cyl(0, 0, z_head0, 13.0, 6.0)))
# front glass element: a shallow dome inside the bore, with a ring of black baffle
dome = [(0, z_head0 + 1.1)] + [(4.5 * math.sin(a / 12 * math.pi / 2.2), z_head0 + 1.1 + 1.6 * (1 - math.cos(a / 12 * math.pi / 2.2)) * 0 + 1.9 * math.sin((12 - a) / 12 * math.pi / 2) * 0) for a in range(0)]
glass = [(0, z_head0 + 1.1), (4.5, z_head0 + 1.1), (4.5, z_head0 + 1.5)]
for i in range(1, 13):
    a = i / 12 * (math.pi / 2)
    glass.append((4.5 * math.cos(a), z_head0 + 1.5 + 1.1 * math.sin(a)))
glass[-1] = (0, z_head0 + 2.6)
K.add("lensglass", lathe(glass))
K.add("lens", ring(0, 0, z_head0 + 1.1, 9.4, 7.0, 0.35))  # baffle ring around the dome
K.add("lensglass", ring(0, 0, z_head0 + 1.0, 4.6, 3.4, 0.12))

# ---------------------------------------------------------------- back (z < 0)
bk = lambda s: s.mirror("XY", (0, 0, 0))  # flip a front-side part (z up from 0) to the back


def on_back(shape):
    return wp(shape).mirror("XY").translate((0, 0, 0))


# LQFP-64 USB bridge, with pin-1 dimple; leads silver
body, leads = qfp(-1.0, 2.0, 0.0, body=7.0, h=1.4, per_side=16, pitch=0.4, lead_w=0.18, lead_l=1.0)
K.add("ic", on_back(body))
K.add("nickel", [on_back(l) for l in leads])
# flash (SOIC-8)
body, leads = soic(-12.5, 3.5, 0.0, rot=90)
K.add("ic", on_back(body))
K.add("nickel", [on_back(l) for l in leads])
# silver crystal can + two small SOT
K.add("nickel", on_back(box(5.5, 9.5, 0, 3.2, 2.5, 0.9, 0.25)))
K.add("ic", on_back(place(box(0, 0, 0.1, 2.9, 1.6, 1.0), 9.5, -4.5, 0)))
K.add("ic", on_back(place(box(0, 0, 0.1, 2.9, 1.6, 1.0), -14.0, -3.0, 0, rz=90)))
# tan MLCCs and black resistors scattered around the QFP
back_chips = [
    ("0805", -7.5, 9.5, 0, "cap"), ("0805", -7.5, 7.7, 0, "cap"), ("0603", 3.5, 7.2, 0, "res"), ("0603", 3.5, 5.6, 0, "res"),
    ("1206", 11.0, 8.6, 90, "cap"), ("1206", 12.8, 8.6, 90, "cap"), ("0805", 11.0, 4.8, 0, "res"), ("0805", 11.0, 3.2, 0, "res"),
    ("0603", 8.0, -2.0, 90, "cap"), ("0603", 9.6, -2.0, 90, "cap"), ("0603", 11.2, -2.0, 90, "res"), ("0805", 13.0, -3.0, 90, "cap"),
    ("0603", -6.5, -4.8, 0, "res"), ("0603", -6.5, -6.4, 0, "res"), ("0603", -6.5, -8.0, 0, "cap"), ("0805", -3.0, -6.0, 90, "cap"),
    ("1206", 4.0, -7.8, 0, "cap"), ("0603", 2.5, -5.4, 0, "res"), ("0603", 4.5, -5.4, 0, "res"), ("0402", 0.0, -9.0, 0, "res"),
    ("0402", -1.3, -9.0, 0, "res"), ("0402", -2.6, -9.0, 0, "cap"), ("0603", -13.0, 9.5, 90, "res"), ("0603", -13.0, 11.3, 90, "cap"),
    ("0402", -13.5, -8.5, 90, "res"), ("0402", -13.5, -10.0, 90, "res"), ("0603", -4.0, 12.5, 0, "res"), ("0603", 0.5, 12.5, 0, "cap"),
    ("0402", 5.0, 12.8, 0, "res"), ("0603", 7.7, 12.5, 0, "res"), ("0402", 12.5, 12.0, 90, "cap"), ("0402", -9.5, -12.5, 0, "res"),
    ("0603", -9.5, -9.5, 90, "res"), ("0402", 12.0, -9.5, 0, "res"), ("0603", 13.5, -7.2, 90, "cap"),
]
bres, bcap, bend = [], [], []
for kind, x, y, rot, kn in back_chips:
    b, t = smd(kind, x, y, 0.0, rot)
    (bres if kn == "res" else bcap).append(on_back(b))
    bend.extend(on_back(e) for e in t)
K.add("ic", bres)
K.add("tan", bcap)
K.add("nickel", bend)
# two silver screws holding the ears from behind (nut-side heads)
for s in (-1, 1):
    K.add("steel", on_back(pan_screw(0, s * 9.6, 0.0, 3.2, 1.0)))
# solder fillets of the QFP/pads are left out; test-point pads on the back
for i in range(4):
    K.add("gold", on_back(cyl(-6.0 + i * 1.6, -11.5, 0, 1.0, 0.05)))

# JST ZR 4-pin side-entry socket, white; opening faces -y; pin cavities visible in the mouth
JX, JY = -7.0, -13.6
jw, jd, jh = 7.56, 3.81, 3.4
sock = box(0, 0, 0, jw, jd, jh)
sock = sock.cut(box(0, -0.6, 0.5, jw - 1.6, jd, jh - 1.0))  # mouth
sock = sock.cut(box(0, -jd / 2 + 0.2, jh - 0.3, jw - 2.8, 0.7, 0.4))
for i in range(4):  # pin cavities / contact tongues
    pass
K.add("jst", on_back(place(sock, JX, JY, 0, rz=0)))
for i in range(4):
    px = JX + (i - 1.5) * 1.5
    K.add("nickel", on_back(box(px, JY - 0.4, 0.55, 0.3, 2.6, 0.2)))
    K.add("nickel", on_back(box(px, JY + jd / 2 + 0.5, 0, 0.45, 1.0, 0.15)))  # solder tails out the back

# ---------------------------------------------------------------- USB lead
# JST ZR plug (white) mated in the socket from -y, wires, black boot + jacket, USB-A plug.
PLUG_LEN, PLUG_W, PLUG_H = 7.4, 7.2, 3.0
PZ = -0.25 - PLUG_H / 2  # plug centre height (back side, so negative z)
plug_y_nose = JY - jd / 2 + 2.4  # nose goes 2.4 mm into the mouth
plug_cy = plug_y_nose - PLUG_LEN / 2
body = box(0, 0, 0, PLUG_W, PLUG_LEN, PLUG_H, 0.4)
body = body.cut(box(0, -PLUG_LEN / 2 + 1.0, 0.6, PLUG_W - 1.4, 1.6, PLUG_H))  # open wire pocket in the tail
body = body.cut(box(0, -PLUG_LEN / 2 + 0.3, PLUG_H - 0.5, 2.6, 0.5, 0.6))  # latch relief
for i in range(4):
    body = body.cut(box((i - 1.5) * 1.5, PLUG_LEN / 2 - 0.2, 0.9, 0.55, 0.5, 1.3))
K.add("jst", on_back(place(body, JX, plug_cy, 0.25)))
tail_y = plug_cy - PLUG_LEN / 2

# ---------------------------------------------------------------- pose: stand on a side edge, lens to -y, lean back
LEAN = -12.0  # about x; the top goes toward +y (away from the viewer)
SIDE = -1.0  # which way the lead's loop curls (+1 toward +y, behind the board; -1 toward the viewer)


def _rot(v, ax, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    x, y, z = v
    if ax == "z":
        return (c * x - s * y, s * x + c * y, z)
    return (x, c * y - s * z, s * y + c * z)


def pose_pt(p):
    return _rot(_rot(_rot(p, "z", 90), "x", 90), "x", LEAN)


def pose_shape(s):
    return wp(s).rotate((0, 0, 0), (0, 0, 1), 90).rotate((0, 0, 0), (1, 0, 0), 90 + LEAN)


# lift so the lowest point of the board (its bottom edge) sits on z = 0
_all = [sl for sh in K.groups.values() for s in sh for sl in s.Solids()]
_bb = pose_shape(cq.Compound.makeCompound(_all)).val().BoundingBox()
LIFT = -_bb.zmin
S = pose_pt((JX, tail_y, -0.25 - PLUG_H / 2))
S = (S[0], S[1], S[2] + LIFT)
print("lead starts at", [round(v, 1) for v in S], "posed board x", round(_bb.xmin, 1), round(_bb.xmax, 1), "y", round(_bb.ymin, 1), round(_bb.ymax, 1), "top", round(_bb.zmax + LIFT, 1))

lead = Kit()
RJ, RW = 1.5, 0.36
for i, col in enumerate(["wire_red", "wire_white", "wire_green", "wire_black"]):
    off = (i - 1.5) * 1.45  # local x maps to world z
    lead.add(col, cable([(S[0] - 1.0, S[1], S[2] + off), (S[0] + 4.0, S[1], S[2] + off * 0.6), (S[0] + 9.0, S[1], S[2] + off * 0.1)], RW))
BX0 = S[0] + 8.0
boot = lathe([(0, 0), (2.5, 0), (2.5, 8.0), (1.9, 10.5), (RJ, 12.5), (0, 12.5)]).rotate((0, 0, 0), (0, 1, 0), 90).translate((BX0, S[1], S[2]))
lead.add("boot", boot)

# jacket: drops from the boot to the table in an S, curls on the table, then the USB-A plug
pts = []
x0 = BX0 + 12.5
H0 = S[2]
for k in range(0, 8):
    u = k / 7
    sm = u * u * (3 - 2 * u)
    pts.append((x0 + 26.0 * u, S[1] + SIDE * 2.0 * sm, RJ + (H0 - RJ) * (1 - sm)))
px, py = pts[-1][0], pts[-1][1]
LEN_LOOP, THETA, n = 58.0, math.radians(130.0), 14
ds = LEN_LOOP / n
for k in range(1, n + 1):
    f = lambda u: THETA * (u * u * (3 - 2 * u)) * SIDE
    th, th_prev = f(k / n), f((k - 1) / n)
    px += ds * math.cos((th + th_prev) / 2)
    py += ds * math.sin((th + th_prev) / 2)
    pts.append((px, py, RJ))
heading = math.degrees(THETA * SIDE)
hd = (math.cos(math.radians(heading)), math.sin(math.radians(heading)))
for k in range(1, 3):
    pts.append((px + k * 6.0 * hd[0], py + k * 6.0 * hd[1], RJ))
ex, ey = pts[-1][0], pts[-1][1]
lead.add("jacket", cable(pts, RJ))


def usb(shape, dx=0.0):
    """Part built along +x with its origin at the end of the jacket, placed on the table there."""
    return place(shape, dx, 0, 0, rz=heading).translate((ex, ey, 0))


ZC = 3.7  # plug axis height: the overmould rests on the table
srb = lathe([(0, 0), (3.5, 0), (3.1, 4.5), (RJ, 10), (0, 10)]).rotate((0, 0, 0), (0, 1, 0), 90)  # along +x, wide end at x = 0
lead.add("boot", usb(srb.translate((0, 0, ZC)), 0.0).translate((0, 0, 0)))
mould = box(0, 0, 0, 20.0, 13.6, 7.4, 1.6).translate((10.0 + 8.0, 0, 0)).faces(">Z").edges().chamfer(0.5)
lead.add("boot", usb(mould, 0.0))
shell = box(0, 0, 0, 12.4, 12.0, 4.5, 0.4).cut(box(0.4, 0, 0.3, 12.4, 11.4, 3.9))
for sy in (-1, 1):
    shell = shell.cut(box(3.5, sy * 3.0, 4.0, 2.0, 1.6, 0.6))
shell = shell.translate((6.2 + 28.0, 0, ZC - 2.25))
lead.add("steel", usb(shell))
tongue = box(0, 0, 0, 11.6, 9.4, 1.9).translate((5.8 + 28.0, 0, ZC - 0.95))
lead.add("boot", usb(tongue))
for i in range(4):
    lead.add("gold", usb(box(0, 0, 0, 8.4, 1.5, 0.1).translate((7.2 + 28.0, -3.375 + i * 2.25, ZC + 0.95))))

# ---------------------------------------------------------------- merge, pose, export
final = Kit()
for g, shapes in K.groups.items():
    final.add(g, [pose_shape(s).translate((0, 0, LIFT)) for s in shapes])
import os
DBG = os.environ.get("DBG")
for g, shapes in lead.groups.items():
    if not DBG:
        final.add(g, shapes)
n = final.export(ROOT / ("cad/models/zz-a8-dbg.step" if DBG else "cad/models/arducam-ov9782.step"), "arducam_ov9782")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm; x {bb.xmin:.1f}..{bb.xmax:.1f} y {bb.ymin:.1f}..{bb.ymax:.1f}")
