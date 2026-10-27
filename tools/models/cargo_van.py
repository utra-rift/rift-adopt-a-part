"""A generic full-size high-roof cargo van (no make, no badges), standing on its wheels.

There is no manufacturer CAD, so this is built to the common proportions of the class
(long-wheelbase, high-roof panel vans):
  length        5,980 mm over bumpers (body 5,890 + bumpers)
  width         2,020 mm body, 2,580 mm over mirrors
  height        2,600 mm (high roof)
  wheelbase     3,750 mm; front overhang 955 mm, rear 1,275 mm
  track         1,720 mm; tyres 235/65 R16 (Ø712 × 235) on 16 in steel wheels, 6 studs
  cab           windscreen raked 49°, base 1,280 mm, header 2,010 mm; beltline 1,240 mm
  load area     1,250 mm sliding door on the right, twin rear doors split 50:50
Coordinates: x from the rear (0) to the front (+), y across (right side = -y), z up, ground at z = 0.

The body is the intersection of three extruded profiles (side, cross-section, plan) minus the
wheel arches. Offsetting those profiles gives the body's exact inward offset, so windows, door
seams, lamp pockets and the black trim are all cut or built to follow the panel surfaces.
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]


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
        wp = wp.lineTo(*a) if m is None else wp.lineTo(*a).threePointArc(m, b)
    return wp.close()


# ---------------------------------------------------------------- reference geometry (mm)
L = 5890.0  # body, front face at the bumper line
SIDE = [(0, 400), (L, 400), (L, 760), (L - 65, 1105), (5080, 1280), (4440, 2010), (4130, 2600), (0, 2600)]
SIDE_R = [30, 30, 200, 90, 40, 60, 300, 110]
SECT = [(-1010, 380), (1010, 380), (1010, 1240), (935, 2600), (-935, 2600), (-1010, 1240)]
SECT_R = [50, 50, 400, 170, 170, 400]
# The plan's rear edge sits 1 mm behind the rear face (coplanar faces upset the booleans); the
# 81 mm corner meets the rear face 9° off tangent, under the 10° the drawing marks as a crease.
PLAN = [(-1, -1010), (L + 40, -1010), (L + 40, 1010), (-1, 1010)]
PLAN_R = [81, 400, 400, 81]
AXLES = (1200.0, 4950.0)
WHEEL_Z = 356.0
ARCH_R = 430.0
FLARE_R = 492.0
TRACK = 1720.0
BIG = 1600.0
FUZZ = 1e-3


def ws_x(z, back=0.0):
    """x of the windscreen line (side view) at height z, moved back by `back`."""
    (x0, z0), (x1, z1) = SIDE[4], SIDE[5]
    return x0 + (z - z0) * (x1 - x0) / (z1 - z0) - back


def prism_xz(pts, r, y0, y1):
    """Side-view outline extruded across y from y0 to y1."""
    w = rpoly(pts, r, "XZ", (0, max(y0, y1), 0))
    return w.extrude(abs(y1 - y0))


def prism_yz(pts, r, x0, x1):
    """Front-view outline extruded along x from x0 to x1."""
    return rpoly(pts, r, "YZ", (x0, 0, 0)).extrude(x1 - x0)


def band(plane, origin, path, width):
    """A strip of the given width along a polyline, with round ends, as a pending wire."""
    wp = cq.Workplane(plane, origin=origin)
    if len(path) == 2:
        (a, b), (c, d) = path
        ln = math.hypot(c - a, d - b)
        return wp.center((a + c) / 2, (b + d) / 2).slot2D(ln + width, width, math.degrees(math.atan2(d - b, c - a)))
    return wp.polyline(path).offset2D(width / 2, "arc")


def band_xz(path, width, y0, y1):
    return band("XZ", (0, max(y0, y1), 0), path, width).extrude(abs(y1 - y0))


def band_yz(path, width, x0, x1):
    return band("YZ", (x0, 0, 0), path, width).extrude(x1 - x0)


def band_xy(path, width, z0, z1):
    return band("XY", (0, 0, z0), path, width).extrude(z1 - z0)


def offset(wp, o):
    return wp if o == 0 else wp.offset2D(o, "arc")


_env = {}


def env(o):
    """The body volume grown by o mm (negative: shrunk), exact for this intersection of prisms."""
    if o not in _env:
        side = offset(rpoly(SIDE, SIDE_R, "XZ", (0, BIG, 0)), o).extrude(2 * BIG)
        sect = offset(rpoly(SECT, SECT_R, "YZ", (-600, 0, 0)), o).extrude(L + 1200)
        plan = offset(rpoly(PLAN, PLAN_R, "XY", (0, 0, -100)), o).extrude(3000)
        # Fuzzy booleans: the plain ones return invalid solids for some offsets of these prisms.
        b = side.intersect(sect, tol=FUZZ).intersect(plan, tol=FUZZ)
        for x in AXLES:
            b = b.cut(cq.Workplane("XZ", origin=(0, BIG, 0)).center(x, WHEEL_Z).circle(ARCH_R - o).extrude(2 * BIG), tol=FUZZ)
        assert b.val().isValid(), f"envelope {o} invalid"
        _env[o] = b
    return _env[o]


def skin(d):
    return env(0).cut(env(-d), tol=FUZZ)


def layer(d0, d1):
    """Material between d0 and d1 mm under the body surface."""
    return env(-d0).cut(env(-d1), tol=FUZZ)


def union_all(parts):
    empty = [i for i, q in enumerate(parts) if not q.solids().vals()]
    assert not empty, f"empty parts at {empty} of {len(parts)}"
    out = parts[0]
    for p in parts[1:]:
        out = out.union(p)
    return out


RIGHT = (-500.0, -1300.0)  # y range of features on the right (sliding-door) side
LEFT = (500.0, 1300.0)

# ---------------------------------------------------------------- openings and seams
cuts, glass, black, chrome, red, amber, clear = [], [], [], [], [], [], []

# Windscreen: glass face 10 mm under the panel surface; every pocket runs 2 mm deeper than the
# part set into it, so no visible face is coplanar with another.
ws_pts = [(-905, 1312), (905, 1312), (862, 1972), (-862, 1972)]
cuts.append(skin(12).intersect(prism_yz(ws_pts, 70, 4200, 5400)))
glass.append(layer(10, 36).intersect(prism_yz(ws_pts, 70, 4200, 5400)))

# Cab door windows, both sides.
win = [(3995, 1300), (ws_x(1300, 118), 1300), (ws_x(1958, 118), 1958), (3995, 1958)]
for y0, y1 in (RIGHT, LEFT):
    p = prism_xz(win, [45, 45, 45, 45], y0, y1)
    cuts.append(skin(11).intersect(p))
    glass.append(layer(9, 32).intersect(p))

# Rear door windows.
for s in (1, -1):
    p = prism_yz([(s * 70, 1560), (s * 860, 1560), (s * 860, 2180), (s * 70, 2180)], 45, -60, 300)
    cuts.append(skin(11).intersect(p))
    glass.append(layer(9, 32).intersect(p))

# Front door seams (both sides): B-pillar, door top, along the A-pillar, down to the wheel arch.
xa_top, xa_base = ws_x(2045, 112), ws_x(1290, 112)
door = [(3950, 412), (3950, 2045), (xa_top, 2045), (xa_base, 1290), (xa_base, 800)]
for y0, y1 in (RIGHT, LEFT):
    cuts.append(skin(6).intersect(band_xz(door, 6, y0, y1)))

# Sliding doors (both sides) and the rail channel behind each at the beltline.
SLIDE_X0, SLIDE_X1, SLIDE_TOP = 2620.0, 3872.0, 2330.0
slide = [(SLIDE_X0, 412), (SLIDE_X0, SLIDE_TOP), (SLIDE_X1, SLIDE_TOP), (SLIDE_X1, 412)]
for y0, y1 in (RIGHT, LEFT):
    cuts.append(skin(6).intersect(band_xz(slide, 6, y0, y1)))
    cuts.append(skin(13).intersect(band_xz([(1380, 1292), (SLIDE_X0 - 4, 1292)], 30, y0, y1)))

# Fuel filler flap (left side, behind the sliding door).
flap = prism_xz([(2147, 897), (2323, 897), (2323, 1073), (2147, 1073)], 26, *LEFT).cut(prism_xz([(2152, 902), (2318, 902), (2318, 1068), (2152, 1068)], 21, *LEFT))
cuts.append(skin(5).intersect(flap))

# Rear doors: centre split, outer edges, top.
cuts.append(skin(6).intersect(band_yz([(0, 612), (0, 2462)], 6, -40, 60)))
cuts.append(skin(6).intersect(band_yz([(-905, 612), (-905, 2462), (905, 2462), (905, 612)], 6, -40, 60)))

# Roof stiffening beads.
for x in (520, 1100, 1680, 2260, 2840, 3420):
    cuts.append(skin(7).intersect(band_xy([(x, -690), (x, 690)], 46, 2200, 2700)))

# ---------------------------------------------------------------- lamps
# Headlamps: pocket 50 mm deep wrapping the front corners, chrome housing, projector and DRL.
HL = [(1030, 880), (752, 880), (650, 975), (650, 1094), (1030, 1094)]
HL_R = [0, 40, 70, 26, 0]
for s in (1, -1):
    pr = prism_yz([(s * y, z) for y, z in HL], HL_R, 5350, 6100)
    cuts.append(skin(50).intersect(pr))
    chrome.append(layer(48, 66).intersect(pr))
    proj = cq.Workplane("YZ", origin=(5500, s * 842, 992)).circle(62).extrude(600)
    clear.append(env(-14).cut(env(-60)).intersect(proj).intersect(pr))
    ring = cq.Workplane("YZ", origin=(5500, s * 842, 992)).circle(82).circle(62).extrude(600)
    chrome.append(env(-34).cut(env(-60)).intersect(ring).intersect(pr))
    drl = band_yz([(s * 1010, 1074), (s * 676, 1074)], 13, 5350, 6100)
    clear.append(layer(8, 60).intersect(drl).intersect(pr))
    ind = prism_yz([(s * 1012, 900), (s * 945, 900), (s * 945, 1040), (s * 1012, 1040)], 0, 5350, 6100)
    amber.append(layer(12, 60).intersect(ind).intersect(pr))

# Tail lamps: tall clusters wrapping the rear corners.
for s in (1, -1):
    pts = [(s * 922, 700), (s * 1040, 700), (s * 1040, 1430), (s * 922, 1430)]
    pts = pts if s > 0 else pts[::-1]
    pr = prism_yz(pts, [30, 0, 0, 30] if s > 0 else [0, 30, 30, 0], -60, 170)
    cuts.append(skin(30).intersect(pr))
    red.append(layer(3, 34).intersect(pr))
    # amber indicator section and white reversing section, as separate lenses
    for z0, z1, bucket in ((955, 1105, amber), (1105, 1190, clear)):
        sec = cq.Workplane("XY").box(400, 300, z1 - z0, centered=(False, True, False)).translate((-100, s * 990, z0))
        part = red[-1].intersect(sec)
        red[-1] = red[-1].cut(sec)
        bucket.append(part)

# High-mounted stop lamp.
hm = prism_yz([(-170, 2505), (170, 2505), (170, 2548), (-170, 2548)], 18, -60, 200)
cuts.append(skin(14).intersect(hm))
red.append(layer(3, 18).intersect(hm))

# Side repeaters on the front wings.
for y0, y1 in (RIGHT, LEFT):
    rp = prism_xz([(5205, 905), (5285, 905), (5285, 935), (5205, 935)], 14, y0, y1)
    cuts.append(skin(10).intersect(rp))
    amber.append(layer(2, 14).intersect(rp))

# ---------------------------------------------------------------- grille
GR = [(-612, 795), (612, 795), (612, 1066), (-612, 1066)]
gp = prism_yz(GR, 36, 5500, 6100)
cuts.append(skin(30).intersect(gp))
black.append(layer(28, 46).intersect(gp))
for z in (852, 930, 1008):
    black.append(layer(7, 30).intersect(prism_yz([(-604, z - 17), (604, z - 17), (604, z + 17), (-604, z + 17)], 0, 5500, 6100)))

body = env(0).cut(union_all(cuts), tol=FUZZ)

# ---------------------------------------------------------------- black trim
def flare_cyl(x, r):
    return cq.Workplane("XZ", origin=(0, BIG, 0)).center(x, WHEEL_Z).circle(r).extrude(2 * BIG)


# front bumper: 15 mm proud of the body, wrapping round to the front wheel arch
fb = env(15).intersect(cq.Workplane("XY").box(900, 2600, 430, centered=(False, True, False)).translate((5200, 0, 330)))
fb = fb.cut(flare_cyl(AXLES[1], FLARE_R))
fb = fb.cut(prism_yz([(-565, 438), (565, 438), (565, 562), (-565, 562)], 30, L + 3, L + 200))
fb = fb.cut(prism_yz([(-262, 592), (262, 592), (262, 712), (-262, 712)], 10, L + 9, L + 200))
for z in (480, 520):
    black.append(prism_yz([(-562, z - 9), (562, z - 9), (562, z + 9), (-562, z + 9)], 0, L + 2, L + 10))
black.append(fb)
# rear bumper with a step in the middle
rb = env(15).intersect(cq.Workplane("XY").box(1000, 2600, 280, centered=(False, True, False)).translate((-300, 0, 330)))
rb = rb.cut(flare_cyl(AXLES[0], FLARE_R))
step = rpoly([(-95, -520), (0, -520), (0, 520), (-95, 520)], [22, 0, 0, 22], "XY", (0, 0, 470)).extrude(132)
for y in (-330, -110, 110, 330):
    step = step.cut(cq.Workplane("XY", origin=(-48, y, 596)).slot2D(70, 14, 0).extrude(10))
black.append(rb.union(step))
# sill cladding between the arches
sill = env(12).intersect(cq.Workplane("XY").box(3200, 2600, 190, centered=(False, True, False)).translate((1500, 0, 330)))
black.append(sill.cut(flare_cyl(AXLES[0], FLARE_R)).cut(flare_cyl(AXLES[1], FLARE_R)))
# wheel-arch flares
for x in AXLES:
    ring = cq.Workplane("XZ", origin=(0, BIG, 0)).center(x, WHEEL_Z).circle(FLARE_R).circle(ARCH_R).extrude(2 * BIG)
    side_band = cq.Workplane("XY").box(2000, 2600, 3000, centered=(True, True, False)).cut(cq.Workplane("XY").box(2000, 1760, 3000, centered=(True, True, False))).translate((x, 0, 0))
    black.append(env(18).intersect(ring).intersect(side_band).intersect(cq.Workplane("XY").box(2000, 2600, 2000, centered=(True, True, False)).translate((x, 0, 335))))

# wheel-arch liners, so the arches read dark behind the tyres
for x in AXLES:
    liner = cq.Workplane("XZ", origin=(0, 990, 0)).center(x, WHEEL_Z).circle(436).circle(416).extrude(1980)
    black.append(liner.intersect(cq.Workplane("XY").box(1200, 2000, 2000, centered=(True, True, False)).translate((x, 0, 400))))

# door handles
def handle_x(x0, x1, z, y_face, s):
    h = rpoly([(x0, z - 22), (x1, z - 22), (x1, z + 22), (x0, z + 22)], 18, "XZ", (0, y_face + s * 2, 0)).extrude(-s * 20)
    return h


for s in (1, -1):
    black.append(handle_x(4005, 4185, 1172, s * 1010, s))
for s in (1, -1):
    black.append(handle_x(3660, 3840, 1150, s * 1010, s))
black.append(rpoly([(-250, 1228), (-80, 1228), (-80, 1270), (-250, 1270)], 18, "YZ", (2, 0, 0)).extrude(-20))
# rear door hinges
for s in (1, -1):
    for z in (1640, 2290):
        black.append(cq.Workplane("XY").box(26, 44, 120).edges("|Z").fillet(8).translate((-11, s * 925, z)))

# mirrors: arm from the door's front corner, big housing facing back, two glasses
def mirror(s):
    y0 = s * 1000
    arm = band_xy([(4905, y0), (4905, s * 1110)], 46, 1300, 1336).union(band_xy([(4905, y0), (4905, s * 1110)], 40, 1478, 1508))
    head = rpoly([(4800, s * 1100), (4920, s * 1100), (4920, s * 1300), (4800, s * 1300)][:: s], [12, 36, 36, 12] if s > 0 else [36, 12, 12, 36], "XY", (0, 0, 1270)).extrude(390)
    head = head.edges("|Y").fillet(28)
    face_pts = [(s * 1118, 1478), (s * 1282, 1478), (s * 1282, 1644), (s * 1118, 1644)]
    face_pts = face_pts if s > 0 else face_pts[::-1]
    up = prism_yz(face_pts, 10, 4790, 4808)
    lo_pts = [(s * 1118, 1290), (s * 1282, 1290), (s * 1282, 1462), (s * 1118, 1462)]
    lo_pts = lo_pts if s > 0 else lo_pts[::-1]
    lo = prism_yz(lo_pts, 10, 4790, 4808)
    head = head.cut(up).cut(lo)
    glass_ = prism_yz(face_pts, 10, 4803, 4812).union(prism_yz(lo_pts, 10, 4803, 4812))
    return arm.union(head), glass_


mirror_glass = []
for s in (1, -1):
    m, g = mirror(s)
    black.append(m)
    mirror_glass.append(g)

# wipers parked along the base of the windscreen
(xw0, zw0), (xw1, zw1) = SIDE[4], SIDE[5]
ang = math.degrees(math.atan2(zw1 - zw0, xw0 - xw1))
for yc, ln in ((-420, 760), (330, 640)):
    arm = cq.Workplane("XY").box(20, ln, 24)
    s_up = 70.0
    xb = ws_x(zw0 + s_up * math.sin(math.radians(ang)))
    zb = zw0 + s_up * math.sin(math.radians(ang))
    arm = arm.rotate((0, 0, 0), (0, 1, 0), ang - 90).rotate((0, 0, 0), (0, 0, 1), 4 if yc < 0 else -3)
    # sit it 12 mm off the glass along the glass normal
    nx, nz = math.sin(math.radians(ang)), math.cos(math.radians(ang))
    black.append(arm.translate((xb + 14 * nx, yc, zb + 14 * nz)))

# ---------------------------------------------------------------- wheels
TYRE = [(-108, 205), (108, 205), (119, 296), (101, 356), (-101, 356), (-119, 296)]
TYRE_R = [0, 0, 60, 24, 24, 60]


def tyre():
    t = rpoly(TYRE, TYRE_R, "XY").revolve(360, (0, 0, 0), (1, 0, 0))
    for w in (-66, -22, 22, 66):
        t = t.cut(cq.Workplane("XY").polyline([(w - 6.5, 345), (w + 6.5, 345), (w + 6.5, 370), (w - 6.5, 370)]).close().revolve(360, (0, 0, 0), (1, 0, 0)))
    return t


WHEEL = [(30, 0), (96, 0), (96, 30), (86, 40), (86, 106), (72, 120), (72, 180), (120, 199), (120, 214), (106, 214), (100, 210), (-110, 210), (-110, 196), (30, 176)]


def wheel():
    w = cq.Workplane("XY").polyline(WHEEL).close().revolve(360, (0, 0, 0), (1, 0, 0))
    for k in range(6):
        a = math.radians(30 + 60 * k)
        slot = cq.Workplane("YZ", origin=(40, 0, 0)).center(150 * math.cos(a), 150 * math.sin(a)).slot2D(58, 30, math.degrees(a) + 90).extrude(60)
        w = w.cut(slot)
    for k in range(6):
        a = math.radians(60 * k)
        nut = cq.Workplane("YZ", origin=(84, 0, 0)).center(76 * math.cos(a), 76 * math.sin(a)).polygon(6, 24).extrude(18)
        w = w.union(nut)
    return w


def place(part, x, side):
    """Part modelled with its axis on x (outer face toward +x), moved to an axle position."""
    p = part.rotate((0, 0, 0), (0, 0, 1), -90 if side < 0 else 90)  # outer face toward -y on the right
    return p.translate((x, side * TRACK / 2, WHEEL_Z))


t0, w0 = tyre(), wheel()
tyres = union_all([place(t0, x, s) for x in AXLES for s in (-1, 1)])
wheels = union_all([place(w0, x, s) for x in AXLES for s in (-1, 1)])

# ---------------------------------------------------------------- assembly
asm = cq.Assembly(name="cargo_van")
asm.add(body, name="body")
asm.add(union_all(glass), name="glass")
asm.add(union_all(black), name="trim")
asm.add(tyres, name="tyres")
asm.add(wheels, name="wheels")
asm.add(union_all(chrome), name="lampchrome")
asm.add(union_all(clear), name="lampclear")
asm.add(union_all(red), name="lampred")
asm.add(union_all(amber), name="lampamber")
asm.add(union_all(mirror_glass), name="mirrorglass")
for name, part in asm.traverse():
    if part.obj is not None:
        assert part.obj.val().isValid(), f"{name} invalid"
asm.export(str(ROOT / "cad/models/cargo-van.step"))
bb = asm.toCompound().BoundingBox()
print(f"exported; {bb.xlen:.0f} × {bb.ylen:.0f} × {bb.zlen:.0f} mm")
