"""Blind (pop) rivet assortment, 226 pieces, with a hand riveter: the riveter is the hero, the rivets sit in a case beside it.

Hand riveter (the usual 10 in lever type, modelled; no CAD is published): about 255 mm from nose to handle ends.
  nose      turned steel nosepiece, 13 mm, 3.8 mm bore with a countersunk mouth, two wrench flats, a loaded rivet in it
  sleeve    22 mm barrel with four knurl grooves, a stepped collar and a rear cap
  frame     black forged frame: two 3 mm side plates joined to the fixed handle bar
  lever     the moving handle pivots on a bolt with a hex nut, its short arm pinned back toward the barrel
  grips     red oval grips, tapered, with finger grooves and black end caps
  spring    a nine-turn return spring between the two handles, on a pin each
The handles are drawn open 24 degrees. The tool lies on its side, nose away to the left.
Rivets (modelled): aluminium body with a domed flange head (2 d across), steel mandrel with a bulb head and a long stem. Eight types
in a 4 x 2 compartment case: 2.4 x 6, 2.4 x 8, 3.2 x 6, 3.2 x 8, 4.0 x 8, 4.0 x 10, 4.8 x 10, 4.8 x 12 mm.
The real set holds 226; a heap of each is drawn.
"""
import math

import cadquery as cq

from rift_hw import Case, Reg, cyl, helix_wire_solid, hexbar, revolve_z, seeded, shp, V

ZC = 14.0  # height of the handle and barrel centre line above the table


# ------------------------------------------------------------------ the riveter, in tool coordinates (nose at +x, x = 0 at the nose face)
def turned_x(profile):
    """profile: (r, x) points; revolved about the x axis."""
    return shp(revolve_z(profile)).rotate(V(0, 0, 0), V(0, 1, 0), 90)


def bar(length, w, t, theta, p, z=0.0, r=1.6):
    b = cq.Workplane("XY").box(length, w, t, centered=(False, True, True)).edges().fillet(min(r, t / 2 - 0.2, w / 2 - 0.2))
    return shp(b).rotate(V(0, 0, 0), V(0, 0, 1), theta).translate(V(p[0], p[1], z))


def zpin(x, y, d, z0, z1):
    return shp(cyl(d, z1 - z0, z0)).translate(V(x, y, 0))


def grip(L, a0, b0, a1, b1, theta, p, grooves=5):
    g = cq.Workplane("YZ").ellipse(a0, b0).workplane(offset=L).ellipse(a1, b1).loft(combine=True)
    g = g.faces(">X").edges().fillet(2.5).faces("<X").edges().fillet(2.0)
    for k in range(grooves):
        x = 14.0 + k * (L - 30.0) / (grooves - 1)
        f = x / L
        a, b = a0 + (a1 - a0) * f, b0 + (b1 - b0) * f
        ring = cq.Workplane("YZ").workplane(offset=x).ellipse(a + 1.5, b + 1.5).ellipse(a - 0.9, b - 0.9).extrude(2.6)
        g = g.cut(ring)
    return shp(g).rotate(V(0, 0, 0), V(0, 0, 1), theta).translate(V(p[0], p[1], 0))


def end_cap(L, a, b, theta, p):
    c = cq.Workplane("YZ").ellipse(a, b).extrude(5.0).faces(">X").edges().fillet(1.8)
    return shp(c).rotate(V(0, 0, 0), V(0, 0, 1), theta).translate(V(p[0], p[1], 0))


def riveter(reg):
    # --- nose and sleeve (turned, along x at y = 0, z = 0)
    nose = turned_x([(1.9, -22), (6.5, -22), (6.5, -1.3), (5.2, 0), (2.7, 0), (1.9, -0.8)])
    for sz in (-1, 1):  # wrench flats top and bottom
        nose = nose.cut(shp(cq.Workplane("XY").box(14, 14, 3).translate((-13, 0, sz * (5.2 + 1.5)))))
    reg.add("rv-steel", nose)
    collar = turned_x([(0.0, -22), (6.5, -22), (9.2, -22), (9.2, -33), (11.0, -33), (11.0, -36), (0, -36)])
    reg.add("rv-steel", collar)
    barrel = revolve_z([(0, -80), (11.0, -80), (11.0, -36), (0, -36)])
    barrel = shp(barrel).rotate(V(0, 0, 0), V(0, 1, 0), 90)
    for k in range(5):  # knurl grooves
        x = -42.0 - 4.2 * k
        barrel = barrel.cut(turned_x([(10.1, x - 0.6), (11.5, x - 0.6), (11.5, x + 0.6), (10.1, x + 0.6)]))
    reg.add("rv-steel", barrel)
    rear = turned_x([(0, -88), (12.0, -88), (12.0, -80), (0, -80)])
    reg.add("rv-frame", rear)
    # --- frame: two side plates + the fixed handle bar (angle 170 deg: back and toward +y)
    th_a, th_b = 170.0, 194.0
    outline = [(-88, 12), (-88, -12), (-100, -12), (-108, -24), (-122, -24), (-128, -15), (-128, 8), (-112, 14), (-100, 12)]
    plate = cq.Workplane("XY").polyline(outline).close().extrude(3.0).edges("|Z").fillet(3.0)
    plate_t = shp(plate).translate(V(0, 0, 3.4))
    plate_b = shp(plate).translate(V(0, 0, -6.4))
    pa = (-124.0, 4.0)
    bar_a = bar(137.0, 10.5, 12.0, th_a, pa)
    frame = plate_t.fuse(plate_b).fuse(bar_a)
    # lightening slot through both plates, a round relief hole beside it
    slot = cq.Workplane("XY").slot2D(15.0, 6.0, 8.0).extrude(20.0).translate((-104.0, 5.0, -10.0))
    frame = frame.cut(shp(slot)).cut(shp(cyl(5.0, 20.0, -10.0)).translate(V(-99.0, -7.5, 0)))
    frame = frame.cut(shp(cyl(6.2, 20, -10)).translate(V(-113, -15, 0)))  # pivot hole
    reg.add("rv-frame", frame)
    # --- lever: short arm pinned to the barrel side, pivot, handle bar
    piv = (-113.0, -15.0)
    q = (-90.0, -5.0)
    ang = math.degrees(math.atan2(q[1] - piv[1], q[0] - piv[0]))
    arm_len = math.hypot(q[0] - piv[0], q[1] - piv[1])
    arm = bar(arm_len, 8.0, 6.0, ang, piv)
    b1 = bar(26.0, 10.0, 6.0, th_b, piv)
    pb = (piv[0] + 26.0 * math.cos(math.radians(th_b)), piv[1] + 26.0 * math.sin(math.radians(th_b)))
    b2 = bar(133.0, 10.5, 12.0, th_b, pb)
    reg.add("rv-lever", arm, b1, b2)
    # pivot bolt, nut, link pin
    reg.add("rv-steel", zpin(*piv, 6.0, -9.2, 9.2), zpin(*piv, 10.5, 9.2, 11.8), shp(hexbar(9.5, 4.0, 0.5, -13.2)).translate(V(piv[0], piv[1], 0)))
    reg.add("rv-steel", zpin(*q, 4.0, -8.0, 8.0), zpin(*q, 6.4, 8.0, 9.4), zpin(*q, 6.4, -9.4, -8.0))
    # --- grips
    ua = (math.cos(math.radians(th_a)), math.sin(math.radians(th_a)))
    ub = (math.cos(math.radians(th_b)), math.sin(math.radians(th_b)))
    ga = (pa[0] + 38.0 * ua[0], pa[1] + 38.0 * ua[1])
    gb = (pb[0] + 34.0 * ub[0], pb[1] + 34.0 * ub[1])
    reg.add("rv-grip", grip(94.0, 10.5, 13.5, 8.2, 11.2, th_a, ga), grip(94.0, 10.5, 13.5, 8.2, 11.2, th_b, gb))
    ea = (ga[0] + 94.0 * ua[0], ga[1] + 94.0 * ua[1])
    eb = (gb[0] + 94.0 * ub[0], gb[1] + 94.0 * ub[1])
    reg.add("rv-rubber", end_cap(5, 8.2, 11.2, th_a, ea), end_cap(5, 8.2, 11.2, th_b, eb))
    # --- return spring across the gap, on a pin on each handle
    xs = -158.0
    sa = (xs, pa[1] + (xs - pa[0]) / ua[0] * ua[1])
    sb = (xs, pb[1] + (xs - pb[0]) / ub[0] * ub[1])
    ya0, yb0 = sa[1] - 5.25 - 1.0, sb[1] + 5.25 + 1.0
    length = ya0 - yb0
    turns = 8
    coil = shp(helix_wire_solid(4.2, length / turns, turns, 1.3))
    coil = coil.rotate(V(0, 0, 0), V(1, 0, 0), -90).translate(V(xs, yb0, 0))  # z axis -> +y
    reg.add("rv-spring", coil)
    reg.add("rv-steel", zpin(xs, sa[1] - 5.25 - 1.5, 3.2, -4.0, 4.0), zpin(xs, sb[1] + 5.25 + 1.5, 3.2, -4.0, 4.0))
    return th_a


def place_tool(reg_src, reg_dst, yaw, case_front_y, x_centre):
    """Move every part of the riveter into the world: lying on its side, turned by yaw about z, its bounding box
    centred on x_centre and its near-the-case side 8 mm clear of the case's front wall."""
    moved = {k: [s.translate(V(0, 0, ZC)).rotate(V(0, 0, 0), V(0, 0, 1), yaw) for s in lst] for k, lst in reg_src.d.items()}
    bb = cq.Compound.makeCompound([s for lst in moved.values() for s in lst]).BoundingBox()
    dx, dy = x_centre - (bb.xmin + bb.xmax) / 2, case_front_y - 8.0 - bb.ymax
    for k, lst in moved.items():
        for s in lst:
            reg_dst.add(k, s.translate(V(dx, dy, 0)))
    return bb


# ------------------------------------------------------------------ rivets
TAIL = {2.4: 12.0, 3.2: 15.0, 4.0: 18.0, 4.8: 21.0}
RIVETS = [(2.4, 6, 8), (2.4, 8, 8), (3.2, 6, 8), (3.2, 8, 8), (4.0, 8, 6), (4.0, 10, 6), (4.8, 10, 6), (4.8, 12, 6)]


def rivet(d, Lb):
    """Axis along z: flange top at z = 0.45 d, tube end at z = -Lb; returns (body, mandrel, total length, z centre)."""
    fh = 0.45 * d
    body = revolve_z([(0, -Lb), (d / 2, -Lb), (d / 2, 0), (d, 0.0), (d, fh * 0.55), (d * 0.8, fh), (0.4 * d, fh), (0, fh)])
    body = body.faces(">Z").edges().fillet(0.01) if False else body
    csk = revolve_z([(0, fh - 0.5 * d), (0.3 * d, fh - 0.5 * d), (0.62 * d, fh + 0.01), (0, fh + 0.01)])
    body = body.cut(csk)
    tail = TAIL[d]
    sr = 0.25 * d
    mand = revolve_z([(0, -Lb - 0.55 * d), (0.38 * d, -Lb - 0.55 * d), (0.42 * d, -Lb - 0.2 * d), (0.42 * d, -Lb), (sr, -Lb + 0.1), (sr, fh + tail - 0.3), (sr * 0.7, fh + tail), (0, fh + tail)])
    lo, hi = -Lb - 0.55 * d, fh + tail
    return shp(body), shp(mand), hi - lo, (hi + lo) / 2


def lay_x(s, zc):
    return s.translate(V(0, 0, -zc)).rotate(V(0, 0, 0), V(0, 1, 0), 90)


reg = Reg()
tool = Reg()
riveter(tool)
# a rivet loaded in the nose: the flange's dome against the nose face, the body out in front, the mandrel through the bore
d0, L0 = 4.0, 8.0
body0, mand0, _, _ = rivet(d0, L0)
loaded = lambda s: s.rotate(V(0, 0, 0), V(0, 1, 0), -90).translate(V(0.45 * d0, 0, 0))
tool.add("rivet-body", loaded(body0))
tool.add("rivet-mandrel", loaded(mand0))

case = Case([(34.0, [40.0] * 4)] * 2, inner_h=14.0)
case.build(reg)
bb = place_tool(tool, reg, yaw=166.0, case_front_y=-case.D / 2, x_centre=10.0)
rng = seeded(226)
total = 0
for (d, Lb, count), (xc, yc, x0, y0, x1, y1) in zip(RIVETS, case.comps):
    body, mand, tot, zc = rivet(d, Lb)
    pb, pm = lay_x(body, zc), lay_x(mand, zc)
    slack = (x1 - x0) - tot - 2.0
    pitch = 2 * d + 0.6
    n0 = int((y1 - y0 - 2.0) // pitch)
    layers, left, k = [], count, 0
    while left > 0:
        n = min(n0 - (k % 2), left)
        layers.append(n)
        left -= n
        k += 1
    flip = 0
    for k, n in enumerate(layers):
        for j in range(n):
            dy = (j - (n - 1) / 2) * pitch
            z = case.floor + d + k * pitch * 0.866 + 0.1
            dx = rng.uniform(-slack / 2, slack / 2)
            flip += 1
            a, b = pb, pm
            if flip % 2:
                a = a.rotate(V(0, 0, 0), V(0, 0, 1), 180)
                b = b.rotate(V(0, 0, 0), V(0, 0, 1), 180)
            reg.add("rivet-body", a.translate(V(xc + dx, yc + dy, z)))
            reg.add("rivet-mandrel", b.translate(V(xc + dx, yc + dy, z)))
            total += 1

n = reg.export("rivet_kit", "cad/models/rivet-kit.step")
print("rivet-kit ok:", total, "rivets in the case,", n, "solids, case", round(case.W, 1), "x", round(case.D, 1), "x", round(case.H, 1))
