"""One economy aircraft passenger seat (generic, no manufacturer), standing on two floor-track rails.

There is no manufacturer CAD, so this is built to typical published economy-class figures:
  seat width       445 mm between armrests (17.5 in; economy is 17-18 in)
  cushion          438 mm wide, 418 mm deep front edge to backrest (16.5 in), 85 mm thick at the
                   front, top 462 mm above the floor at the front edge, sloping 5.5° back
  backrest         725 mm long from its pivot, 16° back from vertical in the upright (TTL) position;
                   top 1,107 mm above the floor (economy seats stand 1.10-1.15 m)
  armrests         50 mm wide, top 650 mm above the floor (cushion + 190 mm)
  tray table       416 × 270 mm stowed on the back, turn-button latch, literature pocket below
  structure        two Ø45 mm beam tubes on two machined truss legs, legs on track fittings in two
                   Douglas-type seat tracks (Ø19 mm openings at 25.4 mm pitch), 400 mm apart
Coordinates: x across the seat, y front (-) to back (+), z up, floor at z = 0.
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------- 2D helpers
def rpoly(pts, r, plane="XY", origin=(0, 0, 0)):
    """Closed polygon with a fillet of radius r[i] (or r) at every vertex, as a Workplane wire."""
    n = len(pts)
    rs = list(r) if isinstance(r, (list, tuple)) else [r] * n
    segs = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        u = (p0[0] - p1[0], p0[1] - p1[1])
        v = (p2[0] - p1[0], p2[1] - p1[1])
        lu, lv = math.hypot(*u), math.hypot(*v)
        u, v = (u[0] / lu, u[1] / lu), (v[0] / lv, v[1] / lv)
        if rs[i] <= 0:
            segs.append((p1, None, p1))
            continue
        th = math.acos(max(-1.0, min(1.0, u[0] * v[0] + u[1] * v[1])))
        d = rs[i] / math.tan(th / 2)
        assert d < min(lu, lv) * 0.999, f"fillet {rs[i]} too big at {p1}"
        b = (u[0] + v[0], u[1] + v[1])
        lb = math.hypot(*b)
        b = (b[0] / lb, b[1] / lb)
        h = rs[i] / math.sin(th / 2)
        c = (p1[0] + b[0] * h, p1[1] + b[1] * h)
        segs.append(((p1[0] + u[0] * d, p1[1] + u[1] * d), (c[0] - b[0] * rs[i], c[1] - b[1] * rs[i]), (p1[0] + v[0] * d, p1[1] + v[1] * d)))
    wp = cq.Workplane(plane, origin=origin).moveTo(*segs[0][2])
    for i in range(1, n + 1):
        a, m, b = segs[i % n]
        if m is None:
            wp = wp.lineTo(*a)
        else:
            wp = wp.lineTo(*a).threePointArc(m, b)
    return wp.close()


def isect(p, d, q, e):
    """Intersection of the lines p + t d and q + s e (2D)."""
    den = d[0] * e[1] - d[1] * e[0]
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + t * d[0], p[1] + t * d[1])


def unit(a, b):
    l = math.hypot(b[0] - a[0], b[1] - a[1])
    return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)


def off(p, d, dist):
    """Point p moved sideways by dist (left of direction d)."""
    return (p[0] - d[1] * dist, p[1] + d[0] * dist)


def yz_plate(pts, r, x0, t):
    """Profile in the y-z plane extruded across x from x0 to x0 + t."""
    return rpoly(pts, r, "YZ", (x0, 0, 0)).extrude(t)


def x_cyl(d, x0, x1, y, z):
    return cq.Workplane("YZ", origin=(x0, y, z)).circle(d / 2).extrude(x1 - x0)


# ---------------------------------------------------------------- dimensions
SEAT_W = 445.0
ARM_W = 50.0
ARM_X0 = SEAT_W / 2  # armrest inner face
ARM_X1 = ARM_X0 + ARM_W
RAIL_X = 200.0  # seat tracks at x = ±200
RAIL_TOP = 28.0
FIT_TOP = 48.0  # track fittings
LEG_T = 14.0
BEAM_D = 45.0
A = (-180.0, 350.0)  # front beam centre (y, z)
B = (150.0, 330.0)  # rear beam centre
FOOT_F, FOOT_R = (-230.0, FIT_TOP), (290.0, FIT_TOP)
SPR_X0, SPR_T = 236.0, 10.0  # spreader plates
PIVOT = (215.0, 395.0)  # backrest pivot
RECLINE = 16.0
CUSH_FRONT, CUSH_BACK = -250.0, 168.0
CUSH_TOP_F, CUSH_TOP_R = 462.0, 422.0
SLOPE = (CUSH_TOP_F - CUSH_TOP_R) / (CUSH_BACK - CUSH_FRONT)
TILT = math.degrees(math.atan(SLOPE))
PAN_SLOPE = (A[1] - B[1]) / (B[0] - A[0])


def z_top(y):
    return CUSH_TOP_F - (y - CUSH_FRONT) * SLOPE


def z_pan(y):  # underside of the seat pan, resting on both beams
    return A[1] + BEAM_D / 2 - (y - A[0]) * PAN_SLOPE


# ---------------------------------------------------------------- seat tracks
def seat_track(xc):
    prof = [(-30, 0), (30, 0), (30, 5), (4.5, 5), (4.5, 13), (16, 13), (16, 26), (14, 28), (6.5, 28), (6.5, 22),
            (10.5, 22), (10.5, 15), (-10.5, 15), (-10.5, 22), (-6.5, 22), (-6.5, 28), (-14, 28), (-16, 26),
            (-16, 13), (-4.5, 13), (-4.5, 5), (-30, 5)]
    n = 26
    length, y0 = 25.4 * n, 30.0 - 25.4 * n / 2
    rail = (cq.Workplane("XZ", origin=(xc, y0 + length, 0)).polyline([(x, z) for x, z in prof]).close().extrude(length))
    holes = None
    for k in range(n):
        h = cq.Workplane("XY", origin=(xc, y0 + 12.7 + k * 25.4, 20)).circle(9.6).extrude(10)
        holes = h if holes is None else holes.union(h)
    return rail.cut(holes)


def fitting(xc, y):
    base = cq.Workplane("XY", origin=(xc, y, RAIL_TOP - 1)).rect(24, 66).extrude(FIT_TOP - RAIL_TOP + 1)
    base = base.edges("|Z").fillet(6)
    bolt = cq.Workplane("XY", origin=(xc, y + 22, FIT_TOP - 1)).polygon(6, 15).extrude(8)
    stud = cq.Workplane("XY", origin=(xc, y - 22, FIT_TOP - 1)).circle(6).extrude(5)
    return base.union(bolt).union(stud)


# ---------------------------------------------------------------- legs
def leg(xc):
    # Centre lines: front strut F-A, rear strut B-R, top member A-B, diagonal brace F-B, bottom tie.
    dF = unit(FOOT_F, A)  # front strut, upward
    dR = unit(B, FOOT_R)  # rear strut, downward
    dT = unit(B, A)  # top member, toward the front
    dD = unit(FOOT_F, B)  # diagonal
    front_out = off(FOOT_F, dF, 22)  # left of upward front strut = toward -y
    rear_out = off(B, dR, 20)  # left of downward rear strut = toward +y
    top_out = off(B, dT, -37)  # top member upper side
    floor = ((0, FIT_TOP), (1, 0))
    p1 = isect(front_out, dF, *floor)
    p2 = isect(rear_out, dR, *floor)
    p3 = isect(rear_out, dR, top_out, dT)
    p4 = isect(top_out, dT, front_out, dF)
    outer = yz_plate([p1, p2, p3, p4], [3, 3, 34, 34], xc - LEG_T / 2, LEG_T)

    front_in = off(FOOT_F, dF, -22)
    top_in = off(B, dT, 21)
    rear_in = off(B, dR, -20)
    diag_up, diag_lo = off(FOOT_F, dD, 13), off(FOOT_F, dD, -13)
    tie = ((0, FIT_TOP + 26), (1, 0))
    w1 = [isect(front_in, dF, top_in, dT), isect(top_in, dT, diag_up, dD), isect(diag_up, dD, front_in, dF)]
    w2 = [isect(diag_lo, dD, *tie), isect(*tie, rear_in, dR), isect(rear_in, dR, diag_lo, dD)]
    for w in (w1, w2):
        outer = outer.cut(yz_plate(w, 11, xc - LEG_T, LEG_T * 2))
    # Clamp bosses round the beams, proud of the plate.
    for c in (A, B):
        outer = outer.union(x_cyl(66, xc - LEG_T / 2 - 4, xc + LEG_T / 2 + 4, *c))
    # Foot pads on the track fittings.
    for f in (FOOT_F, FOOT_R):
        pad = cq.Workplane("XY", origin=(xc, f[0], FIT_TOP - 1)).rect(LEG_T + 6, 60).extrude(13).edges("|Z").fillet(4)
        outer = outer.union(pad)
    for c, d in ((A, BEAM_D), (B, BEAM_D), (BAG, 22)):
        outer = outer.cut(x_cyl(d, xc - 20, xc + 20, *c))
    return outer


BAG = (FOOT_F[0] + (170 - FIT_TOP) / (A[1] - FIT_TOP) * (A[0] - FOOT_F[0]), 170.0)  # baggage bar on the front strut


def beam(c):
    return x_cyl(BEAM_D, -SPR_X0 - SPR_T, SPR_X0 + SPR_T, *c).cut(x_cyl(BEAM_D - 5, -400, 400, *c))


# ---------------------------------------------------------------- spreaders (seat side frames)
ARM_PIV = (182.0, 560.0)


def spreader(x0):
    pts = [(-226, 345), (-188, 304), (150, 285), (206, 304), (252, 392), (214, 584), (152, 580), (100, 404), (-186, 398)]
    s = yz_plate(pts, [26, 22, 22, 30, 30, 22, 20, 30, 30], x0, SPR_T)
    slot = cq.Workplane("YZ", origin=(x0 - 5, 0, 0)).center(-30, 351).slot2D(170, 30, -3.5).extrude(SPR_T + 10)
    s = s.cut(slot)
    for c in (A, B):
        s = s.cut(x_cyl(BEAM_D, x0 - 5, x0 + SPR_T + 5, *c))
    for c, d in ((PIVOT, 34), (ARM_PIV, 30)):
        s = s.union(x_cyl(d, x0, x0 + SPR_T + 3, *c))
    return s


# ---------------------------------------------------------------- seat pan + cushion
def seat_pan():
    y0, y1 = -232.0, 186.0
    pts = [(y0, z_pan(y0)), (y1, z_pan(y1)), (y1, z_pan(y1) + 3), (y0, z_pan(y0) + 3)]
    return yz_plate(pts, 0, -224, 448)


def cushion_base():
    yb0, yb1 = CUSH_FRONT, CUSH_BACK
    pts = [(yb0 + 4, z_pan(yb0) + 2), (yb1, z_pan(yb1) + 2), (yb1, z_top(yb1)), (yb0, z_top(yb0))]
    c = yz_plate(pts, [22, 22, 22, 46], -219, 438)
    return c.faces("<X or >X").edges().fillet(18)


def top_layer(solid, band, depth):
    """The part of `solid` within `depth` of its upward-facing surface, under a plan-view band."""
    return solid.cut(solid.translate((0, 0, -depth))).intersect(band)


def plan_band(path, width, z0=300, z1=520):
    return cq.Workplane("XY", origin=(0, 0, z0)).polyline(path).offset2D(width / 2, "arc").extrude(z1 - z0)


BUCKLE_Y = -36.0


def belt_paths():
    left = [(-184, 178), (-112, BUCKLE_Y), (-24, BUCKLE_Y)]
    return left, [(-x, y) for x, y in left]


def buckle():
    z = z_top(BUCKLE_Y) + 3
    base = cq.Workplane("XY", origin=(0, 0, -1)).rect(78, 54).extrude(8).edges("|Z").fillet(9)
    lever = cq.Workplane("XY", origin=(4, 0, 6)).rect(62, 42).extrude(4.5).edges("|Z").fillet(7)
    hinge = cq.Workplane("XZ", origin=(-30, 21, 8)).circle(4.5).extrude(42)
    b = base.union(lever).union(hinge)
    return b.rotate((0, 0, 0), (1, 0, 0), -TILT).translate((0, BUCKLE_Y, z))


def life_vest():
    y0, y1 = -150.0, 118.0
    pts = [(y0, 318), (y1, 318), (y1, z_pan(y1) + 1), (y0, z_pan(y0) + 1)]
    p = yz_plate(pts, [12, 12, 0, 0], -150, 300).faces("<X or >X").edges("not >Z").fillet(6)
    tab = cq.Workplane("XZ", origin=(0, y0 + 1, 0)).center(0, 334).rect(46, 22).extrude(4).edges("|Y").fillet(4)
    return p.union(tab)


# ---------------------------------------------------------------- backrest (built upright, then reclined about the pivot)
def recline(w):
    return w.rotate((0, 0, 0), (1, 0, 0), -RECLINE).translate((0, *PIVOT))


SHELL_W = 442.0
BACK_Y = 52.0  # back face of the shell (local y')
TRAY = (416.0, 270.0, 296.0)  # width, height, bottom z'


def shell():
    pts = [(-30, -10), (36, -10), (BACK_Y, 46), (BACK_Y, 712), (-30, 726)]
    s = yz_plate(pts, [6, 12, 34, 34, 14], -SHELL_W / 2, SHELL_W).faces("<X or >X").edges().fillet(14)
    pocket = rpoly([(-212, 18), (212, 18), (212, 716), (-212, 716)], 24, "XZ", (0, -8, 0)).extrude(40)
    s = s.cut(pocket)
    tw, th, tz = TRAY
    recess = rpoly([(-tw / 2 - 3, tz - 3), (tw / 2 + 3, tz - 3), (tw / 2 + 3, tz + th + 3), (-tw / 2 - 3, tz + th + 3)], 25, "XZ", (0, BACK_Y + 1, 0)).extrude(8)
    s = s.cut(recess)
    grip = cq.Workplane("XZ", origin=(0, BACK_Y + 1, 0)).center(0, 668).slot2D(220, 30).extrude(16)
    s = s.cut(grip)
    return s


def back_cushion():
    pts = [(-52, 22), (-6, 22), (-6, 518), (-52, 518)]
    c = yz_plate(pts, [0, 0, 0, 0], -207, 414)
    c = c.faces("<Y").edges().fillet(18)
    seams = None
    for x in (-150, 150):
        band = cq.Workplane("XZ", origin=(0, -40, 0)).center(x, 270).rect(3, 460).extrude(30)
        g = c.cut(c.translate((0, 4, 0))).intersect(band)
        seams = g if seams is None else seams.union(g)
    lumbar = cq.Workplane("XZ", origin=(0, -40, 0)).center(0, 190).rect(297, 3).extrude(30)
    seams = seams.union(c.cut(c.translate((0, 4, 0))).intersect(lumbar))
    return c.cut(seams)


def headrest():
    pts = [(-57, 528), (-6, 528), (-6, 710), (-57, 710)]
    h = yz_plate(pts, 0, -205, 410)
    h = h.faces("<Y").edges().fillet(22)
    return h


def head_cover(h):
    skin = h.shell(2.5).union(h.shell(-0.8))
    region = cq.Workplane("XY").box(470, 60, 200, centered=(True, False, False)).translate((0, -95, 590))
    return skin.intersect(region)


def literature_pocket():
    x, z0, z1 = 182.0, 74.0, 262.0
    outer = rpoly([(-x, z0), (x, z0), (x, z1), (-x, z1)], [14, 14, 0, 0], "XZ", (0, BACK_Y - 2, 0)).extrude(-18)
    inner = rpoly([(-x + 6, z0 + 6), (x - 6, z0 + 6), (x - 6, z1 + 10), (-x + 6, z1 + 10)], [9, 9, 0, 0], "XZ", (0, BACK_Y - 3, 0)).extrude(-13)
    p = outer.cut(inner)
    hem = cq.Workplane("YZ", origin=(-x + 3, BACK_Y + 12.5, z1 - 3)).circle(4.5).extrude(2 * x - 6)
    return p.union(hem)


def tray():
    tw, th, tz = TRAY
    t = rpoly([(-tw / 2, tz), (tw / 2, tz), (tw / 2, tz + th), (-tw / 2, tz + th)], 22, "XZ", (0, BACK_Y + 5, 0)).extrude(11)
    # Cup recess outline moulded on the tray's underside (what faces the passenger behind).
    cup = cq.Workplane("XZ", origin=(0, BACK_Y + 6, 0)).center(tw / 2 - 62, tz + th - 62).circle(36).extrude(4)
    return t.cut(cup)


def latch():
    tz_top = TRAY[2] + TRAY[1]
    base = cq.Workplane("XZ", origin=(0, BACK_Y - 1, 0)).center(0, tz_top + 22).circle(15).extrude(-7)
    knob = cq.Workplane("XZ", origin=(0, BACK_Y + 6, 0)).center(0, tz_top + 10).slot2D(48, 13, 90).extrude(-7)
    return base.union(knob)


def tray_arm(side):
    xs = side * (SHELL_W / 2 - 1)
    zb, zt = 70.0, TRAY[2] + 6
    arm = cq.Workplane("YZ", origin=(xs, 0, 0)).center(36, (zb + zt) / 2).slot2D(zt - zb + 20, 18, 90).extrude(side * 9)
    boss = cq.Workplane("YZ", origin=(xs, 36, zb)).circle(14).extrude(side * 12)
    return arm.union(boss)


# ---------------------------------------------------------------- armrests
def armrest(side):
    x0 = ARM_X0 if side > 0 else -ARM_X1
    pts = [(-196, 604), (206, 590), (206, 650), (-196, 654)]
    full = yz_plate(pts, [20, 18, 18, 22], x0, ARM_W).faces("<X or >X").edges().fillet(7)
    lug_x = x0 + ARM_W - 24 if side > 0 else x0 + 12
    lug = cq.Workplane("YZ", origin=(lug_x, 0, 0)).center(ARM_PIV[0], 584).slot2D(76, 40, 90).extrude(12)
    full = full.union(lug)
    cut = cq.Workplane("XY").box(600, 600, 200, centered=(True, True, False)).translate((0, 0, 641)).rotate((0, 0, 641), (1, 0, 0), -0.6)
    pad = full.intersect(cut)
    body = full.cut(cut)
    pin = x_cyl(30, lug_x - 2, lug_x + 14, *ARM_PIV)
    body = body.union(pin)
    return body, pad


def recline_button():
    # On the inner face of the left armrest, near the front.
    return cq.Workplane("YZ", origin=(-ARM_X0 - 1, -162, 630)).circle(7.5).extrude(4.5)


def bolt_head(x, y, z, side):
    return cq.Workplane("YZ", origin=(x - side, y, z)).polygon(6, 16).extrude(side * 7)


# ---------------------------------------------------------------- build
asm = cq.Assembly(name="airline_seat")

rails = seat_track(RAIL_X).union(seat_track(-RAIL_X))
asm.add(rails, name="track")
fits = None
for xs in (RAIL_X, -RAIL_X):
    for f in (FOOT_F, FOOT_R):
        p = fitting(xs, f[0])
        fits = p if fits is None else fits.union(p)
asm.add(fits, name="fittings")

frame = leg(RAIL_X).union(leg(-RAIL_X))
frame = frame.union(beam(A)).union(beam(B))
frame = frame.union(x_cyl(22, -RAIL_X - LEG_T / 2, RAIL_X + LEG_T / 2, *BAG))
frame = frame.union(spreader(SPR_X0)).union(spreader(-SPR_X0 - SPR_T))
asm.add(frame, name="frame")
asm.add(seat_pan(), name="pan")

base = cushion_base()
lb, rb = belt_paths()
straps = top_layer(base.translate((0, 0, 3)), plan_band(lb, 48).union(plan_band(rb, 48)), 4)
seam_path = [(-165, 172), (-165, -205), (165, -205), (165, 172)]
groove = top_layer(base, plan_band(seam_path, 3, 380, 520), 4)
asm.add(base.cut(groove), name="cushion")
asm.add(straps, name="belt")
asm.add(buckle(), name="buckle")
asm.add(life_vest(), name="lifevest")

hr = headrest()
asm.add(recline(shell()), name="shell")
asm.add(recline(back_cushion()), name="backcushion")
asm.add(recline(hr), name="headrest")
asm.add(recline(head_cover(hr)), name="headcover")
asm.add(recline(literature_pocket()), name="pocket")
asm.add(recline(tray()), name="tray")
asm.add(recline(latch()), name="latch")
asm.add(recline(tray_arm(1).union(tray_arm(-1))), name="trayarms")

arms, pads = [], []
for side in (1, -1):
    body, pad = armrest(side)
    arms.append(body)
    pads.append(pad)
asm.add(arms[0].union(arms[1]), name="armrests")
asm.add(pads[0].union(pads[1]), name="armpads")
asm.add(recline_button(), name="button")
bolts = bolt_head(SPR_X0 + SPR_T + 3, *PIVOT, 1).union(bolt_head(-SPR_X0 - SPR_T - 3, *PIVOT, -1))
asm.add(bolts, name="bolts")

for name, part in asm.traverse():
    if part.obj is not None:
        v = part.obj.val() if hasattr(part.obj, "val") else part.obj
        assert v.isValid(), f"{name} invalid"

asm.export(str(ROOT / "cad/models/airline-seat.step"))
print("exported; cushion tilt %.1f°, baggage bar at y=%.0f" % (TILT, BAG[0]))
