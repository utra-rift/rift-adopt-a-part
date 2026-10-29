"""6061 aluminium sheet, 12 x 12 in, as sold in 2-packs: 1/4 in (al-sheet-quarter) and 1/8 in (al-sheet-eighth).

  sheet   304.8 x 304.8 mm, 6.35 mm or 3.175 mm thick, mill finish, edges broken 0.25 mm
  film    blue polyethylene protective film on one face (the up face), 0.12 mm, 1.2 mm short of every edge,
          corners rounded; at one corner of each sheet it is peeled back and curls over on itself,
          showing bare mill aluminium under it
  print   the film carries the alloy and thickness in dark ink, repeated in rows (real glyph outlines)
  pair    two sheets stood on their bottom edge, face to face, leaning back 12 degrees with the face turned 25 degrees toward
          the camera; the front one slid 40 mm sideways so both edges and the film's print read
Coordinates: x right, y depth (front -y), z up, resting on z = 0; centred on the middle of the lower sheet.
"""
import math
import sys

import cadquery as cq

from rift_hw import ROOT, Reg, move, shp, V

L = 304.8
FILM_T, INSET = 0.12, 1.2
PEEL = 62.0  # legs of the peeled corner triangle


def sheet(t):
    return cq.Workplane("XY").box(L, L, t, centered=(True, True, False)).edges().chamfer(min(0.25, t / 8))


def film(peel=0.0, t0=0.0):
    """The film at height t0 (the sheet's top face); with `peel`, minus the corner triangle at (+x, -y)."""
    w = L - 2 * INSET
    f = cq.Workplane("XY").workplane(offset=t0).box(w, w, FILM_T, centered=(True, True, False)).edges("|Z").fillet(2.0)
    if not peel:
        return f, None
    cx, cy = w / 2, -w / 2
    a = peel
    # the cut follows the 45-degree line through (cx - a, cy) and (cx, cy + a)
    tri = cq.Workplane("XY").workplane(offset=t0 - 1).polyline([(cx - a, cy), (cx - a, cy - 3), (cx + 3, cy - 3), (cx + 3, cy + a), (cx, cy + a)]).close().extrude(FILM_T + 2)
    f = f.cut(tri)
    # curled flap, attached along the fold line, rising and rolling back toward the sheet's middle
    ax, ay = cx - a, cy
    bx, by = cx, cy + a
    mx, my = (ax + bx) / 2, (ay + by) / 2
    e = (1 / math.sqrt(2), 1 / math.sqrt(2))  # along the fold line
    u = (1 / math.sqrt(2), -1 / math.sqrt(2))  # fold line toward the corner
    h = a / math.sqrt(2)
    full = a * math.sqrt(2)
    rho, n = 0.34 * h, 22
    phi_max = h / rho
    secs = []
    for i in range(n + 1):
        s = h * i / n
        phi = s / rho
        pu, pz = rho * math.sin(phi), rho * (1 - math.cos(phi))
        wdt = max(full * (1 - s / h), 7.0)
        c = (mx + u[0] * pu, my + u[1] * pu, t0 + FILM_T / 2 + pz)
        nrm = (-math.sin(phi) * u[0], -math.sin(phi) * u[1], math.cos(phi))
        hw, ht = wdt / 2, FILM_T / 2
        corner = lambda se, sn: (c[0] + e[0] * hw * se + nrm[0] * ht * sn, c[1] + e[1] * hw * se + nrm[1] * ht * sn, c[2] + nrm[2] * ht * sn)
        secs.append([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)])
    flap = cq.Solid.makeLoft([cq.Wire.makePolygon([V(*p) for p in sc], close=True) for sc in secs], False)
    return f, flap


def film_print(t0, label):
    """The film's printed repeat: the alloy and thickness in dark ink, rows of text across the face (clear of the peeled corner)."""
    out = []
    for y, xs in ((-118.0, (-135.0, -35.0)), (-30.0, (-140.0, -40.0, 60.0)), (62.0, (-140.0, -40.0, 60.0))):
        for x in xs:
            txt = cq.Workplane("XY").workplane(offset=t0 + FILM_T - 0.005).center(x, y).text(label, 6.4, 0.065, halign="left", valign="center", font="Helvetica")
            out.append(shp(txt))
    return out


LEAN, TURN, SLIDE = 12.0, 25.0, 40.0  # degrees back from vertical, degrees toward the camera, mm


def build(t, rid, label):
    """Two sheets stood on their bottom edge, leaning back 12 degrees, face turned 25 degrees toward the camera.
    Built flat (z = face normal), then stood up: local y -> up, local z -> toward -y."""
    O, X, Z = V(0, 0, 0), V(1, 0, 0), V(0, 0, 1)
    pieces = []  # (group, shape)
    # rear sheet: film peeled at its top-left corner, a small peel that stays clear of the front sheet
    f1, flap1 = film(34.0, t)
    for k, lst in {"sheet": [sheet(t)], "film": [f1, flap1]}.items():
        for sh in lst:
            pieces.append((k, shp(sh).rotate(O, Z, 180.0), False))
    # front sheet: in front of the rear film, film peeled and curling at its top-right corner (mirrored from the base corner)
    z1 = t + FILM_T + 0.05
    f2, flap2 = film(88.0, z1 + t)
    for k, lst in {"sheet": [sheet(t).translate((0, 0, z1))], "film": [shp(f2).mirror("XZ"), shp(flap2).mirror("XZ")],
                   "print": film_print(z1 + t, label)}.items():
        for sh in lst:
            pieces.append((k, shp(sh), True))
    moved = []
    for k, sh, front in pieces:
        sh = sh.rotate(O, X, 90.0).translate(V(0, 0, L / 2))  # stand up, bottom edge on z = 0
        if front:
            sh = sh.translate(V(SLIDE, 0, 0))
        sh = sh.rotate(O, X, -LEAN).rotate(O, Z, TURN)
        moved.append((k, sh))
    bb = cq.Compound.makeCompound([sh for _, sh in moved]).BoundingBox()
    reg = Reg()
    for k, sh in moved:
        reg.add(k, sh.translate(V(-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin)))
    return reg.export(rid, f"cad/models/{rid}.step")


for t, rid, label in ((6.35, "al-sheet-quarter", "6061 ALUMINUM  1/4 IN"), (3.175, "al-sheet-eighth", "6061 ALUMINUM  1/8 IN")):
    if len(sys.argv) > 1 and rid not in sys.argv[1:]:
        continue
    build(t, rid, label)
    print(rid, "ok")
