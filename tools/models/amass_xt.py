"""Amass XT30U and XT60H plugs, rebuilt from Amass' own dimensioned outline drawings.

Source for every number: the official Amass catalogue "Low-voltage DC high-current power connection"
(https://www.china-amass.com/public/upload/20260207/7fa24f5a6f35ec66c7a115c07a34ab06.pdf), viewed online, not saved:
  p. 9  - XT30U-M and XT30U-F outline drawings (face view and side view)
  p. 15 - XT60H-M and XT60H-F outline drawings (face view and side view), photos of the grey back cover
"Printed" constants are numbers dimensioned on the drawing. "Measured" constants were scaled off the drawing from
the printed dimension next to them (about +-0.1 mm); "assumed" ones are not on the drawing at all.

Local frame of every plug: the mating face is the plane x = 0 and the body extends toward -x. y is the long side of
the face (the two contacts lie along it, at y = +-pitch/2), z the short side. The chamfered corners are at the -y end
of the face (the drawing shows the polarity chamfer on one short end, rounded corners on the other).
"""
import math

import cadquery as cq

YELLOW, GOLD, COVER_GREY = "#e8b214", "#d7a93b", "#4b4e53"

# ---------------------------------------------------------------- XT30U (catalogue p. 9)
XT30U = dict(
    FACE_Z=5.60,  # printed, p.9 face view
    FACE_Y=10.20,  # printed, p.9 face view
    M_LEN=13.70,  # printed, p.9 side view XT30U-M (overall, to the tip of the solder cups)
    F_LEN=12.40,  # printed, p.9 side view XT30U-F
    PITCH=5.00,  # measured: contact centres 140 px apart at 27.5 px/mm (also the XT30 series pitch)
    PIN_D=2.0,  # measured from the face view contact circle
    CH_Y=1.1, CH_Z=1.1,  # measured: chamfer of the two corners at the -y end
    ROUND_R=0.8,  # measured: corner radius at the +y end
    M_SHELL=7.8,  # measured: shell from the face to the head, side view XT30U-M
    M_HEAD=2.4,  # measured: head with the logo, side view
    PLATE=0.7,  # measured: rear plate the cups stand on
    WALL=0.55,  # measured: shell wall in the face view
    M_CAV=6.4,  # measured: cavity depth (floor of the shell), assumed 1.4 short of the shell length
    F_BARREL=6.05,  # measured: female barrel length, side view XT30U-F (365 px = 12.40 mm)
    F_HEAD=3.4,  # measured: female head, side view
    BARREL_D=3.8,  # measured: barrels 8.8 mm over both = pitch + diameter
    CUP_D=2.2, CUP_BORE=1.5,  # assumed: solder cup tube
)

# ---------------------------------------------------------------- XT60H (catalogue p. 15)
XT60H = dict(
    FACE_Z=9.20,  # printed, p.15 face view (XT60H-M and -F)
    FACE_Y=16.40,  # printed, p.15 face view
    M_LEN=23.85,  # printed, p.15 side view XT60H-M (overall, including the back cover)
    F_LEN=24.95,  # printed, p.15 side view XT60H-F
    PITCH=7.20,  # measured: contact centres 130 px apart at 17.8 px/mm = 7.3, the XT60 series pitch is 7.2
    PIN_D=3.5,  # assumed: XT60 series contact, not dimensioned on the drawing
    CH=2.4,  # measured: chamfer of the two corners at the -y end
    ROUND_R=1.2,  # measured: corner radius at the +y end
    BODY_Y=14.8, BODY_Z=8.1,  # measured: yellow body in the side view (14.7) and the XT60-M face (8.10 printed on p.15)
    BODY_LEN_M=11.0,  # measured: yellow body from the face to the retaining ring, XT60H-M
    BODY_LEN_F=12.1,  # measured: same on XT60H-F
    RING_Y=16.0, RING_Z=8.9, RING_LEN=1.85,  # measured: retaining ring in front of the cover
    COVER_LEN=11.0,  # measured: 10.95 on the M drawing (23.85 - 12.85), 11.0 on the F (24.95 - 13.95)
    COVER_WALL=1.4,  # assumed
    CAVITY=9.0,  # measured: male shroud depth, equal to the female plug length
    PLUG_Y=12.9, PLUG_Z=6.2,  # measured: female plug, a clearance inside the male cavity (13.0 x 6.3)
    KEY_Z=4.7, KEY_Y=1.7,  # measured: key rib between the contacts (face view)
    CUP_D=5.0, CUP_BORE=3.8,  # assumed: XT60-size solder cup for 12-14 AWG
)


def outline(Y, Z, ch_y, ch_z, r):
    """The face outline in (y, z): chamfered at -y, rounded at +y. Returns a closed point list (chamfers as corners)."""
    y0, y1, z0 = -Y / 2, Y / 2, Z / 2
    return [(y0 + ch_y, -z0), (y1 - r, -z0), (y1, -z0 + r), (y1, z0 - r), (y1 - r, z0), (y0 + ch_y, z0), (y0, z0 - ch_z), (y0, -z0 + ch_z)]


def prism(Y, Z, ch_y, ch_z, r, x0, x1):
    """Solid of the outline from x0 to x1 (x0 < x1); the +y corners filleted."""
    sol = cq.Workplane("YZ", origin=(x0, 0, 0)).polyline(outline(Y, Z, ch_y, ch_z, r)).close().extrude(x1 - x0)
    return sol


def rounded_prism(Y, Z, ch_y, ch_z, r, x0, x1):
    """Same, with real arcs at the two +y corners."""
    y0, y1, z0 = -Y / 2, Y / 2, Z / 2
    wp = (cq.Workplane("YZ", origin=(x0, 0, 0)).moveTo(y0 + ch_y, -z0).lineTo(y1 - r, -z0)
          .threePointArc((y1 - r + r * math.sin(math.pi / 4), -z0 + r - r * math.cos(math.pi / 4)), (y1, -z0 + r))
          .lineTo(y1, z0 - r)
          .threePointArc((y1 - r + r * math.sin(math.pi / 4), z0 - r + r * math.cos(math.pi / 4)), (y1 - r, z0))
          .lineTo(y0 + ch_y, z0).lineTo(y0, z0 - ch_z).lineTo(y0, -z0 + ch_z).close())
    return wp.extrude(x1 - x0)


def soften(body, c=0.15):
    try:
        return body.edges().chamfer(c)
    except Exception:
        return body


def cup(x_tip, d_out, d_in, length, scoop, y=0.0):
    """Solder cup along x with its tip at x_tip (rear), open on the +z side for `scoop` mm from the tip."""
    t = cq.Workplane("YZ", origin=(x_tip, 0, 0)).center(y, 0).circle(d_out / 2).circle(d_in / 2).extrude(length)
    plug = cq.Workplane("YZ", origin=(x_tip + length - 1.0, 0, 0)).center(y, 0).circle(d_out / 2).extrude(1.0)
    t = t.union(plug)
    cutter = cq.Workplane("XY").box(scoop, d_out + 1, d_out / 2 + 0.6, centered=(False, True, False)).translate((x_tip - 0.01, y, 0.0))
    return t.cut(cutter)


def tube(x0, x1, y, d_out, d_in):
    return cq.Workplane("YZ", origin=(x0, 0, 0)).center(y, 0).circle(d_out / 2).circle(d_in / 2).extrude(x1 - x0)


def rod(x0, x1, y, d):
    return cq.Workplane("YZ", origin=(x0, 0, 0)).center(y, 0).circle(d / 2).extrude(x1 - x0)


def box(x0, x1, y0, y1, z0, z1):
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, y0, z0))


# ---------------------------------------------------------------- XT30U
def xt30u_male(p=XT30U):
    Y, Z = p["FACE_Y"], p["FACE_Z"]
    L1, L2, pl = p["M_SHELL"], p["M_HEAD"], p["PLATE"]
    out = {}
    shell = soften(rounded_prism(Y, Z, p["CH_Y"], p["CH_Y"], p["ROUND_R"], -(L1 + L2), 0.0))
    inner = rounded_prism(Y - 2 * p["WALL"], Z - 2 * p["WALL"], p["CH_Y"] * 0.7, p["CH_Y"] * 0.7, p["ROUND_R"] * 0.5, -p["M_CAV"], 0.01)
    shell = shell.cut(inner)
    # the logo band on the head, both big faces
    for sz in (-1, 1):  # logo band: a shallow recess (kept inside the printed 5.60 mm)
        shell = shell.cut(box(-(L1 + L2) + 0.3, -L1 - 0.3, -Y / 2 + 1.6, Y / 2 - 1.6, Z / 2 - 0.15 if sz > 0 else -Z / 2 - 0.1, Z / 2 + 0.1 if sz > 0 else -Z / 2 + 0.15))
    out["body"] = (shell, YELLOW)
    plate = box(-(L1 + L2) - pl, -(L1 + L2), -3.6, 3.6, -Z / 2 + 0.6, Z / 2 - 0.6)
    out["plate"] = (plate, YELLOW)
    for k, sy in enumerate((-1, 1)):
        y = sy * p["PITCH"] / 2
        pin = rod(-p["M_CAV"] - 0.5, -1.0, y, p["PIN_D"]).faces(">X").edges().fillet(0.35)
        pin = pin.union(rod(-p["M_CAV"], -p["M_CAV"] + 0.5, y, p["PIN_D"] + 0.7))
        out[f"pin{k}"] = (pin, GOLD)
        out[f"cup{k}"] = (cup(-p["M_LEN"], p["CUP_D"], p["CUP_BORE"], p["M_LEN"] - (L1 + L2 + pl) + 1.2, 1.9, y), GOLD)
    return out


def xt30u_female(p=XT30U):
    Y, Z = p["FACE_Y"], p["FACE_Z"]
    Lb, Lh = p["F_BARREL"], p["F_HEAD"]
    pl = p["F_LEN"] - Lb - Lh - 2.45
    out = {}
    head = soften(rounded_prism(Y, Z, p["CH_Y"], p["CH_Y"], p["ROUND_R"], -(Lb + Lh), -Lb))
    for sz in (-1, 1):
        head = head.cut(box(-(Lb + Lh) + 0.3, -Lb - 0.3, -Y / 2 + 1.6, Y / 2 - 1.6, Z / 2 - 0.15 if sz > 0 else -Z / 2 - 0.1, Z / 2 + 0.1 if sz > 0 else -Z / 2 + 0.15))
    barrels = box(-Lb, 0.0, -p["PITCH"] / 2, p["PITCH"] / 2, -0.7, 0.7)
    for sy in (-1, 1):
        barrels = barrels.union(rod(-Lb, 0.0, sy * p["PITCH"] / 2, p["BARREL_D"]))
    try:
        barrels = barrels.faces(">X").edges().chamfer(0.25)
    except Exception:
        pass
    for sy in (-1, 1):
        barrels = barrels.cut(rod(-Lb + 1.2, 0.01, sy * p["PITCH"] / 2, p["PIN_D"] + 0.45))
    out["body"] = (head.union(barrels), YELLOW)
    plate = box(-(Lb + Lh) - 0.5, -(Lb + Lh), -3.6, 3.6, -Z / 2 + 0.6, Z / 2 - 0.6)
    out["plate"] = (plate, YELLOW)
    for k, sy in enumerate((-1, 1)):
        y = sy * p["PITCH"] / 2
        sock = tube(-Lb + 0.8, -0.3, y, p["PIN_D"] + 0.4, p["PIN_D"] - 0.1)
        out[f"socket{k}"] = (sock, GOLD)
        out[f"cup{k}"] = (cup(-p["F_LEN"], p["CUP_D"], p["CUP_BORE"], p["F_LEN"] - (Lb + Lh + 0.5) + 1.2, 1.9, y), GOLD)
    return out


# ---------------------------------------------------------------- XT60H
def cover(p, x_rear, x_front):
    """The grey back cover: a hollow hood with three grip slots on each big face and a wire aperture at the rear."""
    Y, Z, w = p["FACE_Y"], p["FACE_Z"], p["COVER_WALL"]
    c = rounded_prism(Y, Z, p["CH"], p["CH"], p["ROUND_R"] + 0.3, x_rear, x_front)
    inner = rounded_prism(Y - 2 * w, Z - 2 * w, p["CH"] - 0.8, p["CH"] - 0.8, p["ROUND_R"], x_rear + w, x_front + 0.01)
    c = soften(c, 0.3).cut(inner)
    ap = cq.Workplane("YZ", origin=(x_rear - 0.1, 0, 0)).rect(Y - 2 * w - 2.4, Z - 2 * w - 0.6).extrude(w + 0.3).edges("|X").fillet(1.0)
    c = c.cut(ap)
    for k, wd in enumerate((1.7, 1.3, 0.9)):  # grip slots, decreasing in width, as on the drawing's side view
        xs = x_front - 2.3 - k * 2.2
        for sz in (-1, 1):
            z0 = Z / 2 - 0.5 if sz > 0 else -Z / 2 - 0.1
            c = c.cut(cq.Workplane("XY").center(xs, 0).slot2D(Y - 5.0, wd, 90).extrude(0.6).translate((0, 0, z0)))
    return c


def xt60h_male(p=XT60H):
    Y, Z = p["FACE_Y"], p["FACE_Z"]
    BY, BZ, L = p["BODY_Y"], p["BODY_Z"], p["BODY_LEN_M"]
    out = {}
    shell = soften(rounded_prism(BY, BZ, p["CH"], p["CH"], p["ROUND_R"], -L, 0.0), 0.2)
    w = 0.9
    cav = rounded_prism(BY - 2 * w, BZ - 2 * w, p["CH"] - 0.7, p["CH"] - 0.7, p["ROUND_R"] - 0.4, -p["CAVITY"], 0.01)
    shell = shell.cut(cav)
    key = box(-p["CAVITY"], -p["CAVITY"] + 3.2, -p["KEY_Y"] / 2, p["KEY_Y"] / 2, -p["KEY_Z"] / 2, p["KEY_Z"] / 2)
    shell = shell.union(key)
    out["body"] = (shell, YELLOW)
    ring = soften(rounded_prism(p["RING_Y"], p["RING_Z"], p["CH"], p["CH"], p["ROUND_R"] + 0.2, -L - p["RING_LEN"], -L), 0.2)
    out["ring"] = (ring, YELLOW)
    x_c0 = -(p["M_LEN"] - p["COVER_LEN"])
    for k, sy in enumerate((-1, 1)):
        y = sy * p["PITCH"] / 2
        pin = rod(-p["CAVITY"] - 0.5, -1.6, y, p["PIN_D"]).faces(">X").edges().fillet(0.5)
        pin = pin.union(rod(-p["CAVITY"], -p["CAVITY"] + 0.8, y, p["PIN_D"] + 1.1))
        out[f"pin{k}"] = (pin, GOLD)
        out[f"cup{k}"] = (cup(-p["CAVITY"] - 9.5, p["CUP_D"], p["CUP_BORE"], 9.5 + 1.0, 6.0, y), GOLD)
    out["cover"] = (cover(p, -p["M_LEN"], x_c0), COVER_GREY)
    return out


def xt60h_female(p=XT60H):
    Y, Z = p["FACE_Y"], p["FACE_Z"]
    BY, BZ, L = p["BODY_Y"], p["BODY_Z"], p["BODY_LEN_F"]
    out = {}
    plug = soften(rounded_prism(p["PLUG_Y"], p["PLUG_Z"], p["CH"] - 0.3, p["CH"] - 0.3, p["ROUND_R"] - 0.4, -p["CAVITY"], 0.0), 0.2)
    for sy in (-1, 1):
        plug = plug.cut(rod(-p["CAVITY"] + 1.0, 0.01, sy * p["PITCH"] / 2, p["PIN_D"] + 0.5))
    plug = plug.cut(box(-3.2, 0.01, -p["KEY_Y"] / 2, p["KEY_Y"] / 2, -p["KEY_Z"] / 2, p["KEY_Z"] / 2))
    shoulder = soften(rounded_prism(BY, BZ, p["CH"], p["CH"], p["ROUND_R"], -L, -p["CAVITY"]), 0.2)
    out["body"] = (plug.union(shoulder), YELLOW)
    ring = soften(rounded_prism(p["RING_Y"], p["RING_Z"], p["CH"], p["CH"], p["ROUND_R"] + 0.2, -L - p["RING_LEN"], -L), 0.2)
    out["ring"] = (ring, YELLOW)
    x_c0 = -(p["F_LEN"] - p["COVER_LEN"])
    for k, sy in enumerate((-1, 1)):
        y = sy * p["PITCH"] / 2
        out[f"socket{k}"] = (tube(-p["CAVITY"] + 1.0, -0.5, y, p["PIN_D"] + 0.4, p["PIN_D"] - 0.1).union(rod(-p["CAVITY"] - 1.0, -p["CAVITY"] + 1.0, y, p["PIN_D"] + 0.4)), GOLD)
        out[f"cup{k}"] = (cup(-p["CAVITY"] - 10.5, p["CUP_D"], p["CUP_BORE"], 10.5 + 1.0, 6.0, y), GOLD)
    out["cover"] = (cover(p, -p["F_LEN"], x_c0), COVER_GREY)
    return out


def add_plug(kit, parts, name, origin, yaw_deg, flip=False, shift=0.0):
    """Place a plug's solids. flip turns the plug about y (face toward -x, chamfer end kept) so it mates with an unflipped one;
    shift slides it along its own axis (for a mated pair: minus the plug depth)."""
    for key, (shape, col) in parts.items():
        s = shape.val() if isinstance(shape, cq.Workplane) else shape
        if flip:
            s = s.rotate((0, 0, 0), (0, 1, 0), 180)
        s = s.translate((shift, 0, 0)).rotate((0, 0, 0), (0, 0, 1), yaw_deg).translate(origin)
        kit.add(s, f"{name}_{key}", col)


def extents(parts, skip=()):
    """Bounding box of a plug (without `skip` keys), as (xlen, ylen, zlen, xmin, xmax)."""
    shapes = [(s.val() if isinstance(s, cq.Workplane) else s) for k, (s, c) in parts.items() if not any(t in k for t in skip)]
    bb = cq.Compound.makeCompound(shapes).BoundingBox()
    return bb.xlen, bb.ylen, bb.zlen, bb.xmin, bb.xmax
