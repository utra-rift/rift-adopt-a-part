"""Nylon cable ties, 4 to 14 in: a bundle of fifteen tied with one of their own, plus three loose ones.

Ties (typical natural nylon 6/6, modelled; no CAD is published): a flat strap 1.1 mm thick with a ratchet of saw teeth
(2.2 mm pitch, 0.3 mm deep, drawn a little coarse) along one face, a moulded head with a rectangular through-slot for the strap.
  4 in 100 mm x 2.5 mm,  6 in 150 x 2.5,  8 in 200 x 3.6,  10 in 250 x 3.6,  12 in 300 x 4.8,  14 in 350 x 4.8
Bundle: fifteen ties (4, 6, 8 and 10 in; see LENGTHS) laid parallel and slightly rolled,
heads staggered along the length, bound at the middle by a 14 in tie pulled snug around them with its tail trimmed.
Loose: a 6 in tie curled on its back, a 12 in tie lying with a lazy curl, a 4 in tie closed into a ring standing on its edge.
Coordinates: x along the bundle, y depth (front -y), z up, resting on z = 0.
"""
import math

import cadquery as cq

from rift_hw import Reg, cyl, seeded, shp, V

T = 1.1
PITCH, DEPTH = 2.2, 0.3
WIDTH = {100: 2.5, 150: 2.5, 200: 3.6, 250: 3.6, 300: 4.8, 350: 4.8}


def head_dims(w):
    return 1.7 * w + 1.8, w + 2.6, 0.9 * w + 3.2  # length along the strap, across, height through the strap


def head(w):
    """Head centred on the origin, strap along +x, slot axis along z (the strap's thickness direction)."""
    hl, hw, hh = head_dims(w)
    h = cq.Workplane("XY").box(hl, hw, hh).edges().fillet(0.8)
    slot = cq.Workplane("XY").box(T + 0.5, w + 0.4, hh + 2)
    h = h.cut(slot.translate((0.5, 0, 0)))
    # pawl window on the top face and a small ridge across the back
    h = h.cut(cq.Workplane("XY").box(hl * 0.35, w * 0.6, 1.0).translate((-hl * 0.18, 0, hh / 2 - 0.1)))
    return shp(h)


def arc_strap(R, a0, a1, w, teeth_from=0.0, teeth_to=None):
    """Strap centreline radius R about the origin, counter-clockwise from angle a0 to a1 (deg), in the XY plane, extruded
    +-w/2 in z. Teeth on the inner face (toward the origin) between arc lengths teeth_from and teeth_to (mm from the start)."""
    ro, ri = R + T / 2, R - T / 2
    A0, A1 = math.radians(a0), math.radians(a1)
    length = (A1 - A0) * R
    teeth_to = length if teeth_to is None else teeth_to
    pt = lambda r, a: (r * math.cos(a), r * math.sin(a))
    wp = cq.Workplane("XY").moveTo(*pt(ro, A0)).threePointArc(pt(ro, (A0 + A1) / 2), pt(ro, A1)).lineTo(*pt(ri, A1))
    n = int((teeth_to - teeth_from) // PITCH)
    # back along the inner face: plain stretch, then the saw teeth, each a steep wall next to its tip and a gentle ramp
    for k in range(n, 0, -1):
        s_tip = teeth_from + k * PITCH
        wp = wp.lineTo(*pt(ri, A0 + s_tip / R)).lineTo(*pt(ri + DEPTH, A0 + (s_tip - PITCH * 0.2) / R))
    if n > 0:
        wp = wp.lineTo(*pt(ri, A0 + teeth_from / R))
    wp = wp.lineTo(*pt(ri, A0)).close()
    return shp(wp.extrude(w / 2, both=True))


def straight_strap(length, w, teeth_from=None, teeth_to=None):
    """Strap along +x from 0, bottom z = 0, thickness T, teeth on top between teeth_from and teeth_to, centred on y = 0."""
    pts = [(0.0, 0.0), (length, 0.0), (length, T)]
    n = 0 if teeth_from is None else int((teeth_to - teeth_from) // PITCH)
    for k in range(n, 0, -1):
        x_tip = teeth_from + k * PITCH
        pts.append((x_tip, T))
        pts.append((x_tip - PITCH * 0.8, T - DEPTH))
    if n > 0:
        pts.append((teeth_from, T))
    pts.append((0.0, T))
    return shp(cq.Workplane("XZ").polyline(pts).close().extrude(w / 2, both=True))


def tie_flat(L, R):
    """A tie lying on its back, teeth up, curled up at both ends with radius R: the strap from x = 0 to about L, its lowest
    point at z = 0, centred on y = 0, head at x < 0. Returns (strap, head)."""
    w = WIDTH[L]
    hl, hw, hh = head_dims(w)
    delta = L / R / 2
    a0, a1 = 270.0 - math.degrees(delta), 270.0 + math.degrees(delta)
    strap = arc_strap(R, a0, a1, w, teeth_from=8.0, teeth_to=L - 9.0).rotate(V(0, 0, 0), V(1, 0, 0), 90)
    x0 = R * math.cos(math.radians(a0))
    strap = strap.translate(V(-x0, 0, R + T / 2))  # lowest outer point on z = 0
    z_start = R + R * math.sin(math.radians(a0))  # strap centre line at its first point
    hd = head(w).translate(V(-hl / 2 + 0.7, 0, 0)).rotate(V(0, 0, 0), V(0, 1, 0), math.degrees(delta)).translate(V(0, 0, z_start + T / 2))
    return strap, hd


def ring_parts(L, w, tail=16.0):
    """A tie closed into a ring (circle in XY about the origin, width along z), teeth inside, head at the top, tail pushed
    through the head and sticking out to the left. Returns (loop, head, tail, R)."""
    hl, hw, hh = head_dims(w)
    R = (L - tail - hl * 0.6) / (2 * math.pi)
    gap = hl * 0.95 / R
    a0 = math.degrees(math.pi / 2 + gap / 2)
    a1 = a0 + 360.0 - math.degrees(gap)
    loop = arc_strap(R, a0, a1, w, teeth_from=6.0, teeth_to=R * math.radians(a1 - a0) - 2.0)
    hd = head(w).rotate(V(0, 0, 0), V(1, 0, 0), 90).translate(V(0, R + 0.4, 0))
    tl = straight_strap(tail + hl * 0.5, w).rotate(V(0, 0, 0), V(1, 0, 0), -90)  # thickness along +y
    tl = tl.translate(V(-(tail + hl * 0.5) - hl * 0.2, R + T / 2 + 0.25, 0))
    return loop, hd, tl, R


reg = Reg()
rng = seeded(1000)


# ------------------------------------------------------------------ the bundle
LENGTHS = {  # tie lengths in the bundle, centre, ring 1 (6), ring 2 (8)
    "centre": [250],
    "ring1": [100, 150, 100, 150, 200, 200],
    "ring2": [250, 250, 200, 250, 200, 250, 150, 250],
}
RING_R = {"ring1": 5.6, "ring2": 10.6}
spots = [("centre", 0.0, 0.0)]
for name, n in (("ring1", 6), ("ring2", 8)):
    off = rng.uniform(0, 60)
    for i in range(n):
        a = math.radians(off + i * 360.0 / n)
        spots.append((name, RING_R[name] * math.cos(a), RING_R[name] * math.sin(a)))
lens, idx = [], {"centre": 0, "ring1": 0, "ring2": 0}
for name, y, z in spots:
    lens.append(LENGTHS[name][idx[name]])
    idx[name] += 1

BUNDLE_R = 16.0  # axis height above the table
X_BIND = 0.0  # where the binding tie goes round
placed = []
for attempt in range(200):
    placed = []
    r2 = seeded(7 + attempt)
    for (name, y, z), L in zip(spots, lens):
        w = WIDTH[L]
        placed.append((L, w, X_BIND - L / 2 + r2.uniform(-22, 22), y, z, r2.uniform(-35, 35), r2.random() < 0.5))
    ok = True
    hs = []
    for L, w, xs, y, z, roll, left in placed:
        hl = head_dims(w)[0]
        hs.append((xs - hl / 2 + 0.7 if left else xs + L + hl / 2 - 0.7, y, z, hl))
    for i in range(len(hs)):
        for j in range(i + 1, len(hs)):
            dx = abs(hs[i][0] - hs[j][0])
            if dx < (hs[i][3] + hs[j][3]) / 2 + 1.5 and math.hypot(hs[i][1] - hs[j][1], hs[i][2] - hs[j][2]) < 12:
                ok = False
    if ok:
        break
print("bundle layout attempt", attempt, "clear" if ok else "NOT clear")

for L, w, x_start, y, z, roll, head_left in placed:
    strap = straight_strap(L, w, 8.0, L - 9.0)
    hl, hw, hh = head_dims(w)
    hd = head(w).translate(V(-hl / 2 + 0.7, 0, T / 2))
    for s, nm in ((strap, "tie"), (hd, "tiehead")):
        s = s.translate(V(0, 0, -T / 2))
        if not head_left:
            s = s.rotate(V(0, 0, 0), V(0, 0, 1), 180).translate(V(L, 0, 0))
        s = s.rotate(V(0, 0, 0), V(1, 0, 0), roll).translate(V(x_start, y, BUNDLE_R + z))
        reg.add(nm, s)

# the binding tie: a 14 in tie in a ring around the bundle (axis along x), head on top, tail trimmed
w = 4.8
hl, hw, hh = head_dims(w)
loop, hd, tl, RB = ring_parts(350, w, tail=17.0)
RB = 14.8 + T / 2  # snug around the bundle: rebuild at that radius
gap = hl * 0.95 / RB
a0 = math.degrees(math.pi / 2 + gap / 2)
a1 = a0 + 360.0 - math.degrees(gap)
loop = arc_strap(RB, a0, a1, w, teeth_from=6.0, teeth_to=RB * math.radians(a1 - a0) - 2.0)
hd = head(w).rotate(V(0, 0, 0), V(1, 0, 0), 90).translate(V(0, RB + 0.4, 0))
tl = straight_strap(17.0 + hl * 0.5, w).rotate(V(0, 0, 0), V(1, 0, 0), -90).translate(V(-(17.0 + hl * 0.5) - hl * 0.2, RB + T / 2 + 0.25, 0))
for s, nm in ((loop, "tie"), (hd, "tiehead"), (tl, "tie")):
    # circle axis z -> x, the head (+y) to the top (+z); then onto the bundle's axis
    s = s.rotate(V(0, 0, 0), V(0, 1, 0), 90).rotate(V(0, 0, 0), V(1, 0, 0), 90)
    reg.add(nm, s.translate(V(X_BIND, 0, BUNDLE_R)))

# ------------------------------------------------------------------ loose ties
# (a) a 6 in tie curled on its back
s_a, h_a = tie_flat(150, R=420.0)
for s, nm in ((s_a, "tie"), (h_a, "tiehead")):
    reg.add(nm, s.rotate(V(0, 0, 0), V(0, 0, 1), 7).translate(V(-120, -52, 0)))
# (b) a 12 in tie lying with a lazy curl, in front
s_b, h_b = tie_flat(300, R=1300.0)
for s, nm in ((s_b, "tie"), (h_b, "tiehead")):
    reg.add(nm, s.rotate(V(0, 0, 0), V(0, 0, 1), -4).translate(V(-135, -88, 0)))
# (c) a 4 in tie closed into a ring, standing on its edge
w = 2.5
loop, hd, tl, Rr = ring_parts(100, w, tail=14.0)
for s, nm in ((loop, "tie"), (hd, "tiehead"), (tl, "tie")):
    s = s.rotate(V(0, 0, 0), V(1, 0, 0), 90)  # circle plane XY -> XZ, width along y
    s = s.translate(V(0, 0, Rr + T / 2)).rotate(V(0, 0, 0), V(0, 0, 1), 28).translate(V(100, -50, 0))
    reg.add(nm, s)

n = reg.export("zip_ties", "cad/models/zip-ties.step")
print("zip-ties ok:", len(placed), "bundled +1 binder + 3 loose,", n, "solids")
