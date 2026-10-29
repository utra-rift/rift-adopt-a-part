"""A JLCPCB-style batch: three bare 100 x 100 mm boards fanned like cards, the top one partly populated.

A generic fabrication batch (no real board design, no silkscreen text, no logos):
  boards      100 x 100 x 1.6 mm FR-4 with green solder mask, 2.5 mm corner radius, four Ø3.2 mounting holes with
              ENIG rings, two Ø1.15 fiducials, routed traces under the mask (raised 0.04 mm, a lighter green) and
              ENIG-plated pads and vias
  board 1     bare: a QFP-64 fan-out, 0603/0805 pad pairs, a 2 x 20 header footprint, bus routes
  board 2     bare: power footprints (XT60 pads, D2PAK, JST-PH, SOIC-8), wide copper pours as parallel stripes, bus routes
  board 3     top, partly populated: LQFP-64 MCU, 2 x 20 female header, USB-C receptacle, pushbutton, electrolytics,
              SOIC-8 and SOT-23 parts, crystal, 0402-1206 passives, LEDs; the right third is still bare pads
Fan: the boards share a centre; the top board is square to the axes, the middle is turned +16 degrees, the lowest -16.
"""
import math
import os
import random

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
rng = random.Random(1600)
N, T = 100.0, 1.6
PAD = 0.05
TRACE_H = 0.07


def corner_board():
    b = box(0, 0, 0, N, N, T, 2.5)
    return b


# ---------------------------------------------------------------- 2D helpers (board-local coordinates, origin at the centre)
class Layer:
    """Collects the shapes of one board in its own frame (z = 0 at the underside); placed later."""

    def __init__(self, z0):
        self.z0 = z0
        self.g = {}
        self.holes = []
        self.pcb = None

    def add(self, name, *s):
        self.g.setdefault(name, []).extend(x for x in s)

    def pad(self, x, y, w, h, r=0.0):
        self.add("gold", box(x, y, T, w, h, PAD, r))

    def pad_round(self, x, y, d):
        self.add("gold", cyl(x, y, T, d, PAD))

    def via(self, x, y, d=0.9):
        self.add("gold", cq.Workplane("XY").polygon(8, d).extrude(PAD).translate((x, y, T)))

    def trace(self, pts, w=0.3, name="trace"):
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0) + w
            a = math.degrees(math.atan2(y1 - y0, x1 - x0))
            seg = box(0, 0, 0, L, w, TRACE_H).rotate((0, 0, 0), (0, 0, 1), a).translate(((x0 + x1) / 2, (y0 + y1) / 2, T))
            self.add(name, seg)

    def hole(self, x, y, d):
        self.holes.append((x, y, d))

    def build(self, lift=0.0):
        pcb = corner_board()
        if self.holes:
            pcb = pcb.cut(union([cyl(x, y, -0.1, d, T + 0.2) for x, y, d in self.holes]))
        out = {"pcb": [pcb]}
        for k, v in self.g.items():
            out.setdefault(k, []).extend(v)
        return out


def mount_and_fiducials(L, inset=3.8):
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (N / 2 - inset), sy * (N / 2 - inset)
            L.hole(x, y, 3.2)
            L.add("gold", ring(x, y, T, 6.4, 3.2, PAD))
    for (x, y) in [(-N / 2 + 8, -N / 2 + 8), (N / 2 - 8, N / 2 - 8)]:
        L.add("gold", cyl(x, y, T, 1.0, PAD))
        L.add("gold", ring(x, y, T, 3.0, 2.0, PAD * 0.8))


def qfp_footprint(L, cx, cy, per=16, pitch=0.5, span=12.0, pw=0.28, pl=1.6):
    """Pads of a QFP; also fans each pad out with a trace ending in a via. Returns the pad positions."""
    out = []
    n = per
    s0 = -(n - 1) * pitch / 2
    for side in range(4):
        ang = side * 90
        for k in range(n):
            u = s0 + k * pitch
            x, y = u, span / 2 + pl / 2 - 0.4
            c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            px, py = cx + x * c - y * s, cy + x * s + y * c
            horiz = side % 2 == 0
            L.pad(px, py, pw if horiz else pl, pl if horiz else pw)
            out.append((px, py, side))
    return out


def fanout(L, pads, step=1.0, length=6.0):
    for i, (px, py, side) in enumerate(pads):
        dx, dy = [(0, 1), (-1, 0), (0, -1), (1, 0)][side]
        e = length + (i % 8) * 1.3
        sx, sy = px + dx * 1.2, py + dy * 1.2
        mid = (px + dx * e, py + dy * e)
        # jog 45 degrees sideways toward a staggered via
        j = ((i % 8) - 3.5) * 1.1
        tx, ty = (mid[0] + (j if dy else 0) + dx * 1.5, mid[1] + (j if dx else 0) + dy * 1.5)
        L.trace([(px, py), mid, (tx, ty)], 0.22)
        if i % 2 == 0:
            L.via(tx, ty, 0.8)


def passive_pair(L, x, y, rot=0, pad_w=1.0, pad_h=1.3, gap=0.9):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    for sgn in (-1, 1):
        ox, oy = sgn * (gap / 2 + pad_w / 2), 0.0
        L.pad(x + ox * c - oy * s, y + ox * s + oy * c, pad_w if rot % 180 == 0 else pad_h, pad_h if rot % 180 == 0 else pad_w)


def bus(L, x0, y0, x1, y1, lines=8, pitch=0.9, w=0.3, jog=6.0, vias=True):
    """A bundle of parallel traces from (x0, y0) toward (x1, y1) with a 45 degree jog in the middle."""
    dx, dy = x1 - x0, y1 - y0
    horiz = abs(dx) >= abs(dy)
    for k in range(lines):
        o = (k - (lines - 1) / 2) * pitch
        if horiz:
            mx = (x0 + x1) / 2
            pts = [(x0, y0 + o), (mx - jog / 2, y0 + o), (mx + jog / 2, y1 + o), (x1, y1 + o)]
        else:
            my = (y0 + y1) / 2
            pts = [(x0 + o, y0), (x0 + o, my - jog / 2), (x1 + o, my + jog / 2), (x1 + o, y1)]
        L.trace(pts, w)
        if vias and k % 2 == 0:
            L.via(*pts[-1])
            L.via(*pts[0])


def header_footprint(L, cx, cy, cols=20, rows=2, pitch=2.54, plated=True):
    for i in range(cols):
        for j in range(rows):
            x = cx + (i - (cols - 1) / 2) * pitch
            y = cy + (j - (rows - 1) / 2) * pitch
            L.hole(x, y, 1.1)
            L.add("gold", ring(x, y, T, 1.9, 1.1, PAD))
            L.add("gold", ring(x, y, -PAD, 1.9, 1.1, PAD))
    # pin-1 square pad
    L.add("gold", box(cx - (cols - 1) / 2 * pitch, cy - (rows - 1) / 2 * pitch, T, 1.9, 1.9, PAD))


def pours(L, rects):
    for (x0, y0, x1, y1) in rects:
        L.add("trace", boxc(x0, y0, T, x1, y1, T + 0.05, 1.2))


# ---------------------------------------------------------------- board 1: bare, QFP and passives
L1 = Layer(0.0)
mount_and_fiducials(L1)
pads = qfp_footprint(L1, -8.0, 4.0)
fanout(L1, pads)
L1.add("gold", box(-8.0, 4.0, T, 6.2, 6.2, PAD, 0.3))  # thermal pad
for dx in (-1.6, 0, 1.6):
    for dy in (-1.6, 0, 1.6):
        L1.via(-8.0 + dx, 4.0 + dy, 0.6)
header_footprint(L1, 0.0, -38.0)
for k in range(24):
    x = rng.uniform(-44, 44)
    y = rng.uniform(-24, 36)
    if abs(x + 8) < 14 and abs(y - 4) < 14:
        continue
    passive_pair(L1, x, y, rng.choice([0, 90]), *rng.choice([(0.9, 1.0, 0.8), (1.0, 1.3, 1.0), (1.2, 1.6, 1.3)]))
bus(L1, 20.0, 12.0, 44.0, 40.0, lines=10)
bus(L1, -44.0, -10.0, -20.0, -30.0, lines=8)
bus(L1, 22.0, -10.0, 44.0, -26.0, lines=6, pitch=1.2, w=0.5)
# ground stitching vias in two rows along the edge
for k in range(26):
    L1.via(-45.0 + k * 3.6, 46.0, 0.7)
    L1.via(-45.0 + k * 3.6, -46.0, 0.7) if k % 2 == 0 else None

pours(L1, [(-46, 18, -24, 44), (24, -44, 46, -30), (-44, -44, -14, -28)])

# ---------------------------------------------------------------- board 2: power footprints
L2 = Layer(0.0)
mount_and_fiducials(L2)
# XT60 pad pair (two 6 mm round pads with a 4 mm drill) and slots
for (x, y) in [(36.0, -34.0), (36.0, -20.0)]:
    for s in (-1, 1):
        L2.hole(x + s * 3.6, y, 3.4)
        L2.add("gold", ring(x + s * 3.6, y, T, 6.4, 3.4, PAD))
    L2.add("gold", box(x, y, T, 16.0, 11.0, PAD, 0.5).cut(box(x, y, T - 0.01, 14.4, 9.4, PAD + 0.03, 0.4)))
# D2PAK footprints
for (x, y) in [(-30.0, -30.0), (-30.0, -14.0), (-30.0, 2.0)]:
    L2.add("gold", box(x + 6.0, y, T, 10.5, 9.0, PAD))  # tab pad
    for s in (-1, 0, 1):
        L2.pad(x - 5.5, y + s * 2.54, 3.2, 1.0)
    L2.pad(x - 5.5, y + 4.8 * 0, 0.01, 0.01)
# JST-PH footprint (4 pins, 2 mm) and SOIC-8 pads
for k in range(4):
    L2.add("gold", ring(-6.0 + k * 2.0, 40.0, T, 1.6, 0.9, PAD))
    L2.hole(-6.0 + k * 2.0, 40.0, 0.9)
for side in (-1, 1):
    for k in range(4):
        L2.pad(20.0 + (k - 1.5) * 1.27, 34.0 + side * 2.7, 0.6, 1.5)
        L2.pad(20.0 + (k - 1.5) * 1.27, 14.0 + side * 2.7, 0.6, 1.5)
# wide copper pours as parallel stripes under the mask (a pour reads as slightly raised lighter flats)
for k in range(6):
    L2.add("trace", box(-8.0, -10.0 + k * 2.6, T, 26.0, 1.6, TRACE_H, 0.3))
    L2.add("trace", box(30.0, 14.0 - k * 2.4, T, 22.0, 1.5, TRACE_H, 0.3))
L2.trace([(34.0, -34.0), (10.0, -34.0), (10.0, -14.0), (-22.0, -14.0)], 3.0)
L2.trace([(34.0, -20.0), (14.0, -20.0), (14.0, 2.0), (-22.0, 2.0)], 3.0)
bus(L2, -20.0, 22.0, 20.0, 40.0, lines=12, pitch=1.0)
bus(L2, -44.0, 10.0, -44.0, 40.0, lines=6, pitch=1.4, w=0.4)
for k in range(30):
    L2.via(rng.uniform(-45, 45), rng.uniform(-45, 45), rng.choice([0.7, 0.9]))
for k in range(18):
    x = rng.uniform(-44, 44)
    y = rng.uniform(-44, 44)
    if (abs(x - 36) < 10 and y < -14) or (x < -22 and y < 8):
        continue
    passive_pair(L2, x, y, rng.choice([0, 90]))

pours(L2, [(-46, -46, -36, 4), (-6, -46, 22, -38), (24, 38, 46, 46)])

# ---------------------------------------------------------------- board 3: populated
L3 = Layer(0.0)
mount_and_fiducials(L3)
pads3 = qfp_footprint(L3, -14.0, 14.0, per=16, pitch=0.5, span=11.6)
fanout(L3, pads3, length=7.0)
header_footprint(L3, -4.0, -40.0)
for k in range(3):
    bus(L3, 22.0, 14.0 - k * 14, 46.0, 30.0 - k * 20, lines=6, pitch=1.1)
# right third left bare: footprints only
for k in range(10):
    passive_pair(L3, 30.0 + (k % 5) * 3.6, -4.0 - (k // 5) * 4.0, 0, 0.9, 1.0, 0.8)
for side in (-1, 1):
    for k in range(4):
        L3.pad(38.0 + (k - 1.5) * 1.27, 28.0 + side * 2.7, 0.6, 1.5)
        L3.pad(38.0 + (k - 1.5) * 1.27, -34.0 + side * 2.7, 0.6, 1.5)
for k in range(18):
    L3.via(rng.uniform(26, 46), rng.uniform(-46, 46), 0.8)
pours(L3, [(-47, -32, -37, -12), (30, -47, 46, -41), (28, 14, 46, 22)])
# the populated part: LQFP-64 on its footprint, passives on pads, connectors
Z = T
comp = {"ic": [], "tan": [], "nickel": [], "black": [], "led": [], "can": [], "usb": [], "btn": [], "xtal": [], "gold": []}
b, leads = qfp(-14.0, 14.0, Z, body=10.0, h=1.4, per_side=16, pitch=0.5, lead_w=0.22, lead_l=1.0)
comp["ic"].append(b)
comp["nickel"].extend(leads)


def chip(kind, x, y, rot, kn):
    b, t = smd(kind, x, y, Z, rot)
    comp[kn].append(b)
    comp["nickel"].extend(t)


for k in range(14):  # decoupling around the MCU
    chip("0402", -26.0 + (k % 7) * 1.6, 25.0 + (k // 7) * 1.6, 0, "tan" if k % 3 == 0 else "ic")
for k in range(10):
    chip("0603", -28.0 + (k % 5) * 2.6, 0.0 - (k // 5) * 2.2, 90, "tan" if k % 2 else "ic")
for k in range(12):
    chip("0805", -30.0 + (k % 6) * 3.0, -14.0 - (k // 6) * 2.6, 0, "tan" if k % 2 else "ic")
for k, (x, y) in enumerate([(-4.0, 20.0), (-4.0, 15.0), (-4.0, 10.0)]):
    chip("0603", x, y, 0, "led")
b, l = soic(2.0, 4.0, Z, rot=0)
comp["ic"].append(b)
comp["nickel"].extend(l)
b, l = soic(2.0, -6.0, Z, rot=0)
comp["ic"].append(b)
comp["nickel"].extend(l)
for (x, y, r) in [(10.0, 20.0, 0), (10.0, 10.0, 90), (14.0, -10.0, 0)]:
    comp["ic"].append(box(x, y, Z, 2.9, 1.6, 1.0))
# crystal
comp["nickel"].append(box(-4.0, 30.0, Z, 3.2, 2.5, 0.8, 0.25))
# 2 x 20 female header at the bottom edge
sh, pins = pin_header(-4.0, -40.0, Z, 20, 2, female=True, body_h=8.5, pin_len=11.5)
comp["black"].append(sh)
# pins are through the board: gold
comp["gold"].extend(pins)
# USB-C receptacle (mid-mount style, metal shell 9 x 7.3 x 3.2) at the left edge
usb_shell = box(0, 0, 0, 7.4, 9.0, 3.2, 1.4)
usb_shell = usb_shell.cut(box(-0.8, 0, 0.5, 7.0, 8.2, 2.2, 1.0))
comp["nickel"].append(usb_shell.translate((-N / 2 + 3.9, -4.0, Z)))
comp["black"].append(box(-N / 2 + 3.9 + 0.8, -4.0, Z + 0.6, 4.6, 6.4, 0.9))
for k in range(10):
    comp["gold"].append(box(-N / 2 + 3.9 + 0.8, -4.0 - 2.25 + k * 0.5, Z + 1.5, 4.2, 0.28, 0.04))
# tactile switch 6 x 6 x 4.3
comp["nickel"].append(box(-40.0, 40.0, Z, 6.0, 6.0, 3.0, 0.3))
comp["btn"].append(cyl(-40.0, 40.0, Z + 3.0, 3.5, 1.3))
for s in (-1, 1):
    comp["nickel"].append(box(-40.0 + s * 3.2, 40.0 - 2.2, Z, 1.0, 1.0, 0.3))
# two radial electrolytic cans, Ø8 x 11, with a vent score and a sleeve stripe
for (x, y) in [(20.0, -30.0), (31.0, -30.0)]:
    comp["can"].append(lathe([(0, 0), (4.0, 0), (4.0, 10.6), (3.5, 11.0), (0, 11.0)]).translate((x, y, Z)))
    comp["black"].append(box(x, y, Z, 8.4, 8.4, 0.6, 1.0))
    comp["nickel"].append(box(x, y, Z + 10.95, 5.0, 0.5, 0.1))
    comp["nickel"].append(box(x, y, Z + 10.95, 0.5, 5.0, 0.1))
# a 3-pin 2.54 header and a polarised JST-XH
sh, pins = pin_header(40.0, 45.0, Z, 3, 1, body_h=2.5, pin_len=6.0, female=False)
comp["black"].append(sh)
comp["gold"].extend(pins)

# ---------------------------------------------------------------- assemble the fan
GEN = [(L1, 46.0, 0.0), (L2, 23.0, T), (L3, 0.0, 2 * T)]
for L, ang, z in GEN:
    parts = L.build()
    for name, shapes in parts.items():
        for s in shapes:
            K.add(name, wp(s).translate((0, 0, z)).rotate((-N / 2, -N / 2, 0), (-N / 2, -N / 2, 1), ang))
# populated components belong to the top board only (z offset 2 T, angle 0)
for name, shapes in comp.items():
    for s in shapes:
        K.add({"tan": "tan", "ic": "ic", "nickel": "nickel", "black": "black", "led": "ledg", "can": "can", "usb": "nickel", "btn": "btn", "xtal": "nickel", "gold": "gold"}[name], wp(s).translate((0, 0, 2 * T)))

# the top board's own copper/pads were built in its local frame at z = 0 and moved by 2T above; its pin gold too
final = Kit()
bb0 = K.bbox()
cx0, cy0 = (bb0.xmin + bb0.xmax) / 2, (bb0.ymin + bb0.ymax) / 2
ROT = float(os.environ.get("ROT", "0"))
for g, shapes in K.groups.items():
    final.add(g, [wp(s).translate((-cx0, -cy0, 0)).rotate((0, 0, 0), (0, 0, 1), ROT) for s in shapes])
n = final.export(ROOT / "cad/models/pcb-round.step", "pcb_round")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
