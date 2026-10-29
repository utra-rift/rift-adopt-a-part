"""Event entry ticket: a generic printed admission ticket with a tear-off stub, standing on its long edge.

No real ticket is modelled; this is a common ticket format (about 6 x 2.4 in), with no text or branding:
  card        150 x 60 mm card stock, 0.5 mm thick, 3 mm corner radius
  stub        the last 38 mm, behind a perforation line of 1.0 mm holes at 2.2 mm pitch,
              with a 3 mm semicircular notch in each long edge at the line and a 5 mm punched hole
  print       a colour panel bleeding off the main body's end, a hairline frame with two rules,
              a three-box seat grid with filled headers, a holographic foil strip with a round seal next to the
              perforation, and a barcode across the stub. Print is modelled as 0.06 mm layers on
              the front face so each region is its own mesh (and its edges draw).
  shape       paper, not a tile: bowed along its length (ends 7 mm toward the front) and folded
              back 16 degrees at the perforation, the way a stub sits after a few days in a pocket.
Coordinates: x along the ticket (stub at +x), y depth (front faces -y), z up; the ticket stands on
its bottom long edge, centred on the origin.
"""
import math
import pathlib
import random

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]

L, H, T = 150.0, 60.0, 0.5  # card length, height, thickness
CORNER_R = 3.0
PERF_X = 37.0  # tear line; the stub runs from here to +L/2
PERF_D, PERF_PITCH = 1.0, 2.2
NOTCH_R = 3.0
PUNCH_D, PUNCH_AT = 5.0, (56.0, 19.0)
BOW_SAG = 7.0  # how far the ends come forward of the middle
FOLD_DEG = 16.0  # extra fold back at the perforation
INK, PANEL = 0.04, 0.06  # print layer heights above the front face


# ---------------------------------------------------------------- the bent sheet
# Centreline in plan (x, y) by arc length s; heading theta(s) is the bow plus a smoothed fold.
R_BOW = (L / 2) ** 2 / (2 * BOW_SAG)


def heading(s):
    fold = math.radians(FOLD_DEG) * 0.5 * (1 + math.tanh((s - PERF_X) / 1.2))
    return -s / R_BOW + fold


def centreline(n=241, s0=-L / 2 - 6, s1=L / 2 + 6):
    pts, x, y, ds = [], 0.0, 0.0, (s1 - s0) / (n - 1)
    # integrate from s = 0 (x = y = 0) outwards in both directions
    half = [(0.0, 0.0, 0.0)]
    for direction in (1, -1):
        x = y = 0.0
        s = 0.0
        out = []
        while (s1 if direction > 0 else -s0) > abs(s) + 1e-9:
            th0 = heading(s)
            s += direction * ds
            th1 = heading(s)
            th = (th0 + th1) / 2
            x += direction * ds * math.cos(th)
            y += direction * ds * math.sin(th)
            out.append((s, x, y))
        half = half + out if direction > 0 else list(reversed(out)) + half
    return half


CL = centreline()


def offset_curve(d):
    """Points of the surface d mm in front of the centreline (front is -y at s = 0)."""
    return [(x + d * math.sin(heading(s)), y - d * math.cos(heading(s))) for s, x, y in CL]


def sheet(d0, d1):
    """The bent sheet between offsets d0 (back) and d1 (front), 2 mm taller than the card each side."""
    back, front = offset_curve(d0), offset_curve(d1)
    wp = (
        cq.Workplane("XY", origin=(0, 0, -H / 2 - 2))
        .moveTo(*back[0])
        .spline(back[1:], includeCurrent=True)
        .lineTo(*front[-1])
        .spline(list(reversed(front[:-1])), includeCurrent=True)
        .close()
    )
    return wp.extrude(H + 4)


def x_at(s):
    """Plan x of arc length s along the ticket (so the print sits where it would on the flat card)."""
    for (sa, xa, _), (sb, xb, _) in zip(CL, CL[1:]):
        if sa <= s <= sb:
            return xa + (xb - xa) * (s - sa) / (sb - sa)
    raise ValueError(s)


# ---------------------------------------------------------------- 2D layout, cut through the depth
# Every feature is laid out on the flat card in (s, z) and pushed through the sheet along y.
DEPTH = 60.0


def prism(sketch):
    """A 2D sketch on the XZ plane (x = s mapped to plan x, z up) pushed through the whole sheet."""
    return sketch.extrude(DEPTH, both=True)


def rect(s0, z0, s1, z1, r=0.0):
    x0, x1 = x_at(s0), x_at(s1)
    wp = cq.Workplane("XZ").center((x0 + x1) / 2, (z0 + z1) / 2).rect(x1 - x0, z1 - z0)
    p = prism(wp)
    return p.edges("|Y").fillet(r) if r > 0 else p


def disc(s, z, d):
    return prism(cq.Workplane("XZ").center(x_at(s), z).circle(d / 2))


def frame(s0, z0, s1, z1, w, r=0.0):
    """A hairline rectangle w mm wide."""
    return rect(s0, z0, s1, z1, r).cut(rect(s0 + w, z0 + w, s1 - w, z1 - w, max(r - w, 0)))


def union(shapes):
    out = shapes[0]
    for s in shapes[1:]:
        out = out.union(s)
    return out


outline = rect(-L / 2, -H / 2, L / 2, H / 2, CORNER_R)
for zs in (-1, 1):
    outline = outline.cut(disc(PERF_X, zs * H / 2, 2 * NOTCH_R))
n_perf = int((H - 2 * NOTCH_R - 2.0) // PERF_PITCH) + 1
z_perf0 = -(n_perf - 1) * PERF_PITCH / 2
for k in range(n_perf):
    outline = outline.cut(disc(PERF_X, z_perf0 + k * PERF_PITCH, PERF_D))
outline = outline.cut(disc(*PUNCH_AT, PUNCH_D))

card = sheet(-T / 2, T / 2).intersect(outline)


def printed(region, height, bleed=False):
    layer = sheet(T / 2 - 0.02, T / 2 + height)
    if bleed:
        region = region.intersect(outline)
    return layer.intersect(region)


# Colour panel bleeding off the main body's end.
band = printed(rect(-L / 2 - 1, -H / 2 - 1, -53.0, H / 2 + 1), PANEL, bleed=True)

# Holographic foil strip, full height, just before the perforation, with a round seal on it.
foil = printed(rect(24.0, -H / 2 - 1, 31.0, H / 2 + 1).union(disc(27.5, 6.0, 12.0)), PANEL, bleed=True)

# Hairline frame around the main body's print area, two rules for the event lines, and a
# three-box seat grid (section, row, seat) with filled header strips.
HAIR = 0.3
ink_parts = [
    frame(-49.0, -26.0, 19.0, 26.0, HAIR, r=1.5),
    rect(-45.0, 13.0, 15.0, 13.0 + HAIR),
    rect(-45.0, 4.0, 5.0, 4.0 + HAIR),
]
GRID_S, GRID_Z, BOX_W, BOX_H, HDR = -45.0, -22.0, 13.0, 11.0, 2.4
for k in range(3):
    s0 = GRID_S + k * (BOX_W + 1.5)
    ink_parts.append(frame(s0, GRID_Z, s0 + BOX_W, GRID_Z + BOX_H, HAIR))
    ink_parts.append(rect(s0, GRID_Z + BOX_H - HDR, s0 + BOX_W, GRID_Z + BOX_H))

# Stub: a barcode running across it (bars along x), below the punched hole.
STUB_S0, STUB_S1 = 43.0, 69.0
rng = random.Random(1987)
MODULE = 0.5
bars, z = [], -26.0
bars.append((z, 2 * MODULE))  # start guard
z += 3 * MODULE
bars.append((z, MODULE))
z += 2 * MODULE
while z < 9.0:
    w = rng.choice((1, 1, 1, 2, 2, 3)) * MODULE
    bars.append((z, w))
    z += w + rng.choice((1, 1, 2, 2, 3)) * MODULE
bars.append((z, MODULE))  # end guard
bars.append((z + 2 * MODULE, 2 * MODULE))
barcode = [rect(STUB_S0, z0, STUB_S1, z0 + w) for z0, w in bars]

ink = printed(union(ink_parts), INK)
code = printed(union(barcode), INK)

asm = cq.Assembly(name="entry_ticket")
asm.add(card, name="card")
asm.add(band, name="band")
asm.add(foil, name="foil")
asm.add(ink, name="ink")
asm.add(code, name="barcode")
asm.export(str(ROOT / "cad/models/entry-ticket.step"))
bb = card.val().BoundingBox()
print(f"card {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm, {n_perf} perforations, {len(bars)} bars, bow R {R_BOW:.0f} mm")
