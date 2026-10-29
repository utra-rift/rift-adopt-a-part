"""Shared helpers for the bearing models: revolved profiles about Z (profile x = radius, y = z)."""
import math
import cadquery as cq


def arc_mid(c, r, a0, a1):
    am = (a0 + a1) / 2
    return (c[0] + r * math.cos(am), c[1] + r * math.sin(am))


def arc_pt(c, r, a):
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def revolve_profile(segs):
    """segs: list of ('M',(r,z)) first, then ('L',(r,z)) or ('A',(mr,mz),(r,z)); closed automatically."""
    wp = cq.Workplane("XZ")
    for s in segs:
        if s[0] == "M":
            wp = wp.moveTo(*s[1])
        elif s[0] == "L":
            wp = wp.lineTo(*s[1])
        else:
            wp = wp.threePointArc(s[1], s[2])
    return wp.close().revolve(360, (0, 0, 0), (0, 1, 0))


def ring_poly(r0, r1, z0, z1, c0=0.0, c1=0.0):
    """Plain annulus r0..r1 × z0..z1 with chamfers c0 (inner edges) and c1 (outer edges)."""
    return revolve_profile([
        ("M", (r0 + c0, z0)), ("L", (r1 - c1, z0)), ("L", (r1, z0 + c1)), ("L", (r1, z1 - c1)),
        ("L", (r1 - c1, z1)), ("L", (r0 + c0, z1)), ("L", (r0, z1 - c0)), ("L", (r0, z0 + c0)),
    ])


def around(solid, n, r_shift=0.0):
    """n copies of a solid rotated about Z."""
    return [solid.rotate((0, 0, 0), (0, 0, 1), 360.0 * k / n) for k in range(n)]


def dims(d, D, B):
    """Generic deep-groove geometry from bore d, OD D, width B (mm). Everything scales with the section h."""
    h = (D - d) / 2
    f = min(h / 4.5, 1.7)  # detail scale, 1.0 = the 6800's section
    rp = (d + D) / 4
    dw = 0.29 * (D - d)
    z = max(5, round(math.pi * 2 * rp / (dw * 1.65)))
    return dict(r0=d / 2, r1=D / 2, hB=B / 2, f=f, rp=rp, dw=dw, z=z,
                rs_i=rp - 0.7 * f, rs_o=rp + 0.7 * f, face_i=rp - 0.3 * f, face_o=rp + 0.85 * f,
                groove_o=rp + 1.15 * f)


def deep_groove(d, D, B, seal="rubber"):
    """Full deep-groove bearing with two seals ('rubber' 2RS lip seals or 'shield' ZZ plates).
    Returns dict: inner, outer, balls (list), seals (list)."""
    g = dims(d, D, B)
    r0, r1, hB, f, rp, dw = g["r0"], g["r1"], g["hB"], g["f"], g["rp"], g["dw"]
    rs_i, rs_o, fi, fo, go = g["rs_i"], g["rs_o"], g["face_i"], g["face_o"], g["groove_o"]
    c = min(0.25 * f, 0.4)
    rg = 0.52 * dw
    zg_i = math.sqrt(rg**2 - (rp - rs_i) ** 2)
    zg_o = math.sqrt(rg**2 - (rs_o - rp) ** 2)
    step = 0.5 * f
    lip = 0.12 * f
    gz = 0.95 * f
    inner = revolve_profile([
        ("M", (r0 + c, hB)), ("L", (fi - c, hB)), ("L", (fi, hB - c)), ("L", (fi, hB - step)), ("L", (rs_i, hB - step)),
        ("L", (rs_i, zg_i)), ("A", (rp - rg, 0.0), (rs_i, -zg_i)),
        ("L", (rs_i, -hB + step)), ("L", (fi, -hB + step)), ("L", (fi, -hB + c)), ("L", (fi - c, -hB)),
        ("L", (r0 + c, -hB)), ("L", (r0, -hB + c)), ("L", (r0, hB - c)),
    ])
    outer = revolve_profile([
        ("M", (r1 - c, hB)), ("L", (fo + c * 0.6, hB)), ("L", (fo, hB - lip)), ("L", (go, hB - lip)), ("L", (go, hB - gz)),
        ("L", (rs_o, hB - gz)), ("L", (rs_o, zg_o)), ("A", (rp + rg, 0.0), (rs_o, -zg_o)),
        ("L", (rs_o, -hB + gz)), ("L", (go, -hB + gz)), ("L", (go, -hB + lip)), ("L", (fo, -hB + lip)),
        ("L", (fo + c * 0.6, -hB)), ("L", (r1 - c, -hB)), ("L", (r1, -hB + c)), ("L", (r1, hB - c)),
    ])
    ball0 = cq.Workplane("XY").sphere(dw / 2).translate((rp, 0, 0)).val()
    balls = [ball0.rotate((0, 0, 0), (0, 0, 1), 360.0 * k / g["z"]) for k in range(g["z"])]
    top = revolve_profile(seal_profile(g, seal))
    bottom = top.mirror("XY")
    return dict(inner=inner, outer=outer, balls=balls, seals=[top, bottom], g=g)


def seal_profile(g, seal):
    hB, f, fi, fo, go = g["hB"], g["f"], g["face_i"], g["face_o"], g["groove_o"]
    if seal == "rubber":
        return [
            ("M", (fi, hB - 0.48 * f)), ("L", (fi, hB - 0.2 * f)), ("L", (fi + 0.25 * f, hB - 0.16 * f)),
            ("L", (fi + 0.5 * f, hB - 0.16 * f)), ("L", (fi + 0.62 * f, hB - 0.36 * f)),
            ("L", (fo - 0.2 * f, hB - 0.36 * f)), ("L", (fo, hB - 0.15 * f)), ("L", (go - 0.01, hB - 0.15 * f)),
            ("L", (go - 0.01, hB - 0.93 * f)), ("L", (fi + 0.4 * f, hB - 0.72 * f)),
        ]
    # pressed steel shield: stands off the inner ring a hair, steps in the middle
    t = 0.28 * f
    return [
        ("M", (fi + 0.14 * f, hB - 0.5 * f)), ("L", (fi + 0.14 * f, hB - 0.5 * f + t)),
        ("L", (fi + 0.55 * f, hB - 0.5 * f + t)), ("L", (fi + 0.7 * f, hB - 0.2 * f)),
        ("L", (go - 0.01, hB - 0.2 * f)), ("L", (go - 0.01, hB - 0.93 * f)), ("L", (fi + 0.7 * f, hB - 0.93 * f)),
        ("L", (fi + 0.55 * f, hB - 0.5 * f)),
    ]


def simple_shielded(d, D, B):
    """One solid per bearing for the assortment kit: rings and recessed shield plates merged into one revolved body.
    Face bands (inner ring, shield, outer ring) are stepped so the seams still draw."""
    g = dims(d, D, B)
    r0, r1, hB, f = g["r0"], g["r1"], g["hB"], g["f"]
    fi, fo = g["face_i"], g["face_o"]
    c = min(0.25 * f, 0.4)
    s = 0.22 * f  # shield recess
    pts_top = [(r0 + c, hB), (fi - c * 0.0, hB), (fi, hB - s), (fo, hB - s), (fo, hB - s * 0.35), (r1 - c, hB)]
    segs = [("M", (r0 + c, hB))]
    segs += [("L", (fi, hB)), ("L", (fi, hB - s)), ("L", (fo - 0.25 * f, hB - s)), ("L", (fo - 0.25 * f, hB - 0.05 * f)), ("L", (fo, hB)),
             ("L", (r1 - c, hB)), ("L", (r1, hB - c)), ("L", (r1, -hB + c)), ("L", (r1 - c, -hB)),
             ("L", (fo, -hB)), ("L", (fo - 0.25 * f, -hB + 0.05 * f)), ("L", (fo - 0.25 * f, -hB + s)), ("L", (fi, -hB + s)),
             ("L", (fi, -hB)), ("L", (r0 + c, -hB)), ("L", (r0, -hB + c)), ("L", (r0, hB - c))]
    return revolve_profile(segs)
