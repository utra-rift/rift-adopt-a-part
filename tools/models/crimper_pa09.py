"""Engineer PA-09 precision crimping pliers, lying on their side, handles open.

Modelled, not taken from the maker's CAD. Compact pliers about 195 mm long: two forged steel members crossing
at a lap-joint pivot (domed rivet head on top, hex nut under), a short thick nose of 14 mm for open-barrel
contacts with a three-stage die (stage notches of 2.2, 3.0 and 4.0 mm in the anvil jaw and matching punches
in the other, hardened inserts), handles joggled flat, a V leaf spring between the tangs on two rivets, a
stop screw with nut through the tangs, red and black ribbed dip-moulded grips (one each), and a hooked
lock latch riveted to the black grip. Posed lying on the grips with the nose pointing to the camera's left.
"""
import math

import cadquery as cq

STEEL, DIE, OXIDE, RED, BLACK, SPRING = "#aeb2b8", "#8a8e95", "#2b2c30", "#b8161c", "#17181a", "#9a9ea4"
TH = 9.2  # handle open half angle, degrees
JAW_X = 44.0  # nose length from the pivot
HANDLE_END = 131.0  # end of the grip along the member
kit_items = []


def add(shape, name, color):
    kit_items.append((name, shape.val() if isinstance(shape, cq.Workplane) else shape, color))


def poly(pts, z0, z1):
    return cq.Workplane("XY").polyline(pts).close().extrude(z1 - z0).translate((0, 0, z0))


def soften(w, c=0.35):
    try:
        return w.edges().chamfer(c)
    except Exception:
        return w


def bar(sign, s0, s1, w0, w1, z0, z1):
    """Tapered bar along the handle centreline (angle sign*TH) from s0 to s1."""
    a = math.radians(sign * TH)
    d, n = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
    p = lambda s, w, k: (s * d[0] + k * w / 2 * n[0], s * d[1] + k * w / 2 * n[1])
    return poly([p(s0, w0, -1), p(s1, w0 if False else w1, -1), p(s1, w1, 1), p(s0, w0, 1)], z0, z1)


SEG = {"P": "abefg", "A": "abcefg", "-": "g", "0": "abcdef", "9": "abcdfg"}


def text_boxes(chars, u0, v0, cw, ch, st, z0, z1, sign):
    """Raised 7-segment characters on the handle plate: laid out along the handle, rotated with it."""
    out = None
    for k, c in enumerate(chars):
        ox = u0 + k * (cw + 1.4)
        for sg in SEG[c]:
            if sg in "adg":
                w, h = cw, st
                cu = ox + cw / 2
                cv = {"a": ch, "g": ch / 2, "d": 0.0}[sg] + v0
            else:
                w, h = st, ch / 2
                cu = ox + (cw - st / 2 if sg in "bc" else st / 2)
                cv = v0 + (ch * 0.75 if sg in "bf" else ch * 0.25)
            b = cq.Workplane("XY").box(w, h, z1 - z0, centered=(True, True, False)).translate((cu, cv, z0))
            out = b if out is None else out.union(b)
    a = math.radians(sign * TH)
    return out.rotate((0, 0, 0), (0, 0, 1), sign * TH)


def member(sign):
    """One forged member as separate pieces: plate, jaw block; sign +1 = red-handled member (handle toward +y)."""
    ys = -sign  # the jaw lies on the opposite side
    z_lap = (5.0, 10.0) if sign > 0 else (0.0, 5.0)
    z_flat = (2.5, 7.5)
    out = {}
    # plate near the pivot, lapping at its own level
    plate = bar(sign, -6.0, 46.0, 14.0, 11.0, *z_lap)
    plate = plate.union(cq.Workplane("XY").circle(9.0).extrude(z_lap[1] - z_lap[0]).translate((0, 0, z_lap[0])))
    neck = poly([(4, sign * 3.0), (-15, ys * 0.9), (-15, ys * 11.0), (4, ys * 6.5)], *z_lap)
    plate = plate.union(neck)
    # joggle block and the flat tang to the grip
    jog = bar(sign, 40.0, 49.0, 11.0, 10.5, min(z_lap[0], z_flat[0]), max(z_lap[1], z_flat[1]))
    tang = bar(sign, 46.0, 70.0, 10.5, 9.0, *z_flat)
    plate = plate.union(jog).union(tang)
    # forging relief: a recessed name panel with raised lettering on the handle, two fullers along the tang
    ztop = z_lap[1]
    panel = bar(sign, 16.0, 42.0, 8.4, 8.0, ztop - 0.5, ztop + 0.2)
    plate = plate.cut(panel)
    plate = plate.union(text_boxes("PA-09" if sign > 0 else "0-9-P", 17.8, -2.2, 3.0, 4.6, 0.6, ztop - 0.55, ztop - 0.05, sign) if sign > 0 else bar(sign, 17.0, 41.0, 1.0, 1.0, ztop - 0.55, ztop - 0.05))
    try:
        plate = plate.edges("|Z").fillet(0.9)
    except Exception:
        pass
    out["plate"] = soften(plate, 0.25)
    # thick jaw block (full height) from the neck to the nose, with the die insert at the tip
    block = poly([(-14.0, ys * 0.8), (-30.0, ys * 3.0), (-30.0, ys * 9.4), (-14.0, ys * 10.8)], 0.0, 10.0)
    out["jaw"] = soften(block, 0.3)
    nose = poly([(-30.0, ys * 3.0), (-JAW_X, ys * 3.9), (-JAW_X, ys * 8.6), (-30.0, ys * 9.4)], 0.0, 10.0)
    xc = -37.0
    face = 3.0 + (7.0 / 14.0) * 0.9  # inner face offset at the die centre
    for k, w in enumerate((2.2, 3.0, 4.0)):
        z0 = 0.5 + k * 3.1
        if sign > 0:  # anvil: a U notch cut into the inner face (this jaw sits at -y)
            cut = cq.Workplane("XY").box(w, 2.5, 2.8, centered=(True, False, False)).translate((xc, -face - 2.4, z0))
            nose = nose.cut(cut)
        else:  # punch: a tongue standing out of the inner face (this jaw sits at +y)
            tongue = cq.Workplane("XY").box(w - 0.4, 2.5, 2.8, centered=(True, False, False)).translate((xc, face - 2.2, z0))
            nose = nose.union(tongue)
    out["die"] = soften(nose, 0.15)
    return out


def grip(sign, s0=58.0, s1=HANDLE_END):
    a = math.radians(sign * TH)
    L = s1 - s0
    ea0, eb0, ea1, eb1 = 7.0, 6.2, 8.4, 7.2
    body = cq.Workplane("YZ").ellipse(ea0, eb0).workplane(offset=L).ellipse(ea1, eb1).loft(combine=True)
    try:
        body = body.faces(">X").edges().fillet(2.6)
    except Exception:
        pass
    # finger grooves: rings sunk into the surface, following the taper
    for k in range(7):
        x = 24.0 + k * 11.5
        t = x / L
        ea, eb = ea0 + (ea1 - ea0) * t, eb0 + (eb1 - eb0) * t
        ring = cq.Workplane("YZ").workplane(offset=x).ellipse(ea + 3, eb + 3).ellipse(ea - 0.55, eb - 0.55).extrude(1.5)
        body = body.cut(ring)
    # root collar where the grip meets the steel
    collar = cq.Workplane("YZ").ellipse(ea0 + 1.0, eb0 + 1.0).extrude(4.0)
    body = body.union(collar)
    body = body.rotate((0, 0, 0), (0, 0, 1), sign * TH).translate((s0 * math.cos(a), s0 * math.sin(a), 5.0))
    return body


# ---------------------------------------------------------------- members
for sign, gcol, gname in ((+1, RED, "grip_red"), (-1, BLACK, "grip_black")):
    m = member(sign)
    add(m["plate"], f"plate{'A' if sign > 0 else 'B'}", STEEL)
    add(m["jaw"], f"jaw{'A' if sign > 0 else 'B'}", STEEL)
    add(m["die"], f"die{'A' if sign > 0 else 'B'}", DIE)
    add(grip(sign), gname, gcol)
    ys_ = -sign
    for (xs_, yv) in ((-22.5, 6.2), (-34.5, 6.6)):
        scr = cq.Workplane("XY").circle(1.45).extrude(1.0).translate((xs_, ys_ * yv, 10.0))
        scr = scr.faces(">Z").edges().fillet(0.4).cut(cq.Workplane("XY").polygon(6, 1.4).extrude(0.7).translate((xs_, ys_ * yv, 10.35)))
        add(scr, f"diescrew{'A' if sign > 0 else 'B'}", OXIDE)

# ---------------------------------------------------------------- pivot rivet, washers, nut
add(cq.Workplane("XY").circle(2.8).extrude(14.5).translate((0, 0, -2.0)), "pivot_pin", OXIDE)
head = cq.Workplane("XY").circle(4.6).extrude(1.6).translate((0, 0, 10.0))
head = head.union(cq.Workplane("XY").sphere(4.6).translate((0, 0, 10.0 + 1.6 - 3.0)).intersect(cq.Workplane("XY").box(12, 12, 3.0, centered=(True, True, False)).translate((0, 0, 11.6))))
head = head.cut(cq.Workplane("XY").box(0.9, 7.0, 1.0).translate((0, 0, 12.7)))
add(head, "pivot_head", OXIDE)
add(cq.Workplane("XY").polygon(6, 9.0).extrude(2.2).translate((0, 0, -2.2)), "pivot_nut", OXIDE)

# ---------------------------------------------------------------- stop screw through both tangs near s = 52
sx, sy_ = 52.0 * math.cos(math.radians(TH)), 52.0 * math.sin(math.radians(TH))
add(cq.Workplane("XZ").center(sx, 5.0).circle(1.6).extrude(-(2 * sy_ + 22.0)).translate((0, -sy_ - 11.0, 0)), "stop_screw", OXIDE)
add(cq.Workplane("XZ").center(sx, 5.0).circle(3.0).extrude(-2.6).translate((0, -sy_ - 11.0 - 2.4, 0)).faces("<Y").workplane().polygon(6, 3.2).cutBlind(-1.6), "stop_head", OXIDE)
add(cq.Workplane("XZ").center(sx, 5.0).polygon(6, 7.0).extrude(-2.4).translate((0, sy_ + 11.0, 0)), "stop_nut", OXIDE)

# ---------------------------------------------------------------- V leaf spring between the tangs, on two rivets
apex = (24.0, 0.0)
def pt_on(sign, s, off):
    a = math.radians(sign * TH)
    return (s * math.cos(a) - off * -math.sin(a) * sign * 0.0 + (-math.sin(a)) * off, s * math.sin(a) + math.cos(a) * off)
ends = []
for sign in (1, -1):
    e = pt_on(sign, 62.0, -sign * 4.9 * 1.0)
    ends.append(e)
    d = (e[0] - apex[0], e[1] - apex[1])
    ln = math.hypot(*d)
    ang = math.degrees(math.atan2(d[1], d[0]))
    strip = cq.Workplane("XY").box(ln, 1.0, 4.4, centered=(False, True, True)).rotate((0, 0, 0), (0, 0, 1), ang).translate((apex[0], apex[1], 5.0))
    add(strip, "spring", SPRING)
    add(cq.Workplane("XY").circle(1.3).extrude(6.6).translate((e[0] - 0.0, e[1] - 0.0, 1.7)), "spring_rivet", OXIDE)
add(cq.Workplane("XY").circle(1.4).extrude(4.4).translate((apex[0], apex[1], 2.8)), "spring_rivet", OXIDE)

# ---------------------------------------------------------------- lock latch on the black grip, hooking toward the red
a = math.radians(-TH)
s_l = 112.0
base = (s_l * math.cos(a), s_l * math.sin(a))
latch = cq.Workplane("XY").polyline([(0, -3.2), (21.0, -3.2), (21.0, 2.6), (17.0, 2.6), (17.0, -0.6), (0, 2.8)]).close().extrude(1.8)
latch = latch.faces(">Z").edges().fillet(0.4) if False else latch
latch = latch.rotate((0, 0, 0), (0, 0, 1), 90 - TH + 0.0).translate((base[0], base[1] - 3.0, 5.0 + 8.0 + 0.2))
add(latch, "latch", STEEL)
add(cq.Workplane("XY").circle(2.3).extrude(2.4).translate((base[0], base[1] - 3.0, 13.2 + 1.5)), "latch_rivet", OXIDE)

# ---------------------------------------------------------------- pose: lie on the grips, nose toward the camera's left
import sys
YAW = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
import wiring_common as wc

# Stand the pliers on their side: the plan (y) becomes height, so the red member is up and the black member
# down, the tops of the members (rivet head side) face -y toward the camera, and the lower jaw's die face
# looks up. Then pitch the tool about y so the black grip's end and the red member's nose touch the table.
def up(sh):
    return sh.rotate((0, 0, 0), (1, 0, 0), 90.0)

stood = [(n, up(sh), c) for n, sh, c in kit_items]
by = {n: sh for n, sh, c in stood}
gb = by["grip_black"].BoundingBox()
jb = by["dieA"].BoundingBox()
x1, z1 = gb.xmax, gb.zmin
x2, z2 = jb.xmin, jb.zmin
pitch = math.degrees(math.atan2(z1 - z2, x1 - x2))
kit = wc.Kit("crimper_pa09")
placed = [(n, sh.rotate((0, 0, 0), (0, 1, 0), pitch).rotate((0, 0, 0), (0, 0, 1), YAW), c) for n, sh, c in stood]
zmin = min(sh.BoundingBox().zmin for _, sh, _ in placed)
for n, sh, c in placed:
    kit.add(sh.translate((0, 0, -zmin)), n, c)
kit.export("crimper-pa09")
print("pitch", pitch)
bb = cq.Compound.makeCompound([s for _, s, _ in placed]).BoundingBox()
print(f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f} mm unrotated")
