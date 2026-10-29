"""Shared helpers for the wiring parts (silicone wire, connectors, crimper).

Everything is plain CadQuery. Coordinates are millimetres, z up, front is -y (the site camera sees the
-y face on its left and the +x face on its right).
"""
import math
import pathlib
import random

import cadquery as cq
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
V = cq.Vector


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


class Kit:
    """A named collection of solids with CAD colours, exported as one STEP assembly."""

    def __init__(self, name):
        self.name = name
        self.items = []
        self.count = {}

    def add(self, shape, name, color):
        if isinstance(shape, cq.Workplane):
            shape = cq.Compound.makeCompound([o for o in shape.vals() if hasattr(o, "wrapped")]) if len(shape.vals()) > 1 else shape.val()
        n = self.count.get(name, 0)
        self.count[name] = n + 1
        self.items.append((f"{name}{n}" if n else name, shape, color))

    def export(self, ident):
        asm = cq.Assembly(name=self.name)
        for name, shape, color in self.items:
            asm.add(shape, name=name, color=cq.Color(*rgb(color)))
        out = ROOT / f"cad/models/{ident}.step"
        asm.export(str(out))
        return out


# ---------------------------------------------------------------- primitives
def cyl(p, d, r, h):
    return cq.Solid.makeCylinder(r, h, V(*p), V(*d))


def box(cx, cy, cz, sx, sy, sz):
    return cq.Workplane("XY").box(sx, sy, sz).translate((cx, cy, cz))


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def sweep_tube(pts, r, t0=None, t1=None):
    """A round tube of radius r along a spline through pts (end tangents optional)."""
    pts = [tuple(float(c) for c in p) for p in pts]
    if t0 is None:
        t0 = unit(np.subtract(pts[1], pts[0]))
    if t1 is None:
        t1 = unit(np.subtract(pts[-1], pts[-2]))
    path = cq.Workplane("XY").spline(pts, tangents=[tuple(map(float, t0)), tuple(map(float, t1))], includeCurrent=False)
    # profile plane normal to the first tangent; xDir any perpendicular
    n = unit(t0)
    ref = np.array([0.0, 0.0, 1.0]) if abs(n[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    xd = unit(np.cross(ref, n))
    pl = cq.Plane(origin=pts[0], xDir=tuple(xd), normal=tuple(n))
    last = None
    for frenet in (False, True):
        try:
            sol = cq.Workplane(pl).circle(r).sweep(path, isFrenet=frenet).val()
            if sol.isValid():
                return sol
        except Exception as e:  # OCC pipe shell can fail on a bad frame; try the other mode
            last = e
    raise RuntimeError(f"sweep failed: {last}")


def polyline_len(pts):
    p = np.asarray(pts, float)
    return float(np.sum(np.linalg.norm(np.diff(p, axis=0), axis=1)))


def cut_end(pts, strip):
    """Drop the last `strip` mm of a polyline; returns (shorter pts, cut point, direction at the cut)."""
    p = [np.asarray(q, float) for q in pts]
    left = strip
    while len(p) > 2:
        seg = np.linalg.norm(p[-1] - p[-2])
        if seg > left:
            d = unit(p[-1] - p[-2])
            cutp = p[-1] - d * left
            return p[:-1] + [cutp], cutp, d
        left -= seg
        p.pop()
    d = unit(p[-1] - p[-2])
    return p, p[-1], d


def strand_end(p, d, r_cond, length, rng, strands=7, splay=3.0):
    """A stripped, tinned stranded end: a bundle of strands from p along d, a few splayed at the tip."""
    d = unit(d)
    ref = np.array([0.0, 0.0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = unit(np.cross(ref, d))
    w = np.cross(d, u)
    rs = r_cond / 3.0
    out = []
    spots = [(0.0, 0.0)] + [(2 * rs * math.cos(a), 2 * rs * math.sin(a)) for a in (k * math.pi / 3 + 0.3 for k in range(6))]
    for k, (a, b) in enumerate(spots[:strands]):
        off = u * a + w * b
        radial = unit(off) if k else d
        tilt = math.radians(rng.uniform(0.0, splay)) if k else 0.0
        dk = unit(d * math.cos(tilt) + radial * math.sin(tilt)) if k else d
        L = length * rng.uniform(0.94, 1.0)
        out.append(cyl(p - d * 1.0 + off, dk, rs * 0.98, L + 1.0))
    return out


def tail_points(p0, t, out, down, L, d_out, L_out, drop, L_drop, step=9.0):
    """Points leaving p0 along unit t: pushed sideways by d_out (along `out`) and down by `drop`."""
    n = max(4, int(L / step))
    pts = []
    for i in range(n + 1):
        s = L * i / n
        pts.append(np.asarray(p0, float) + t * s + out * d_out * smooth(s / L_out) + down * drop * smooth(s / L_drop))
    return pts


def coil_wire(od, C, a, e1, R, N, pitch, phi0, ccw=1, tail=85.0, strip=12.0, cond_r=1.2,
              d_out=(0, 0), drop=(0, 0), down=(0, 0, -1), wobble=0.0, seed=1, lat=None):
    """One wire coiled N turns (axis a, centre C, basis e1,e2) with straight tails; returns (pts, tips).

    R is the coil's mean radius to the wire centreline. tails are `tail` mm long, pushed outward by
    d_out and dropped by `drop` (start, end). ccw is the winding sense.
    """
    a, e1 = unit(a), unit(e1)
    e2 = np.cross(a, e1)
    C = np.asarray(C, float)
    down = unit(down)

    total = abs(N * 2 * math.pi)

    def on(phi, z):
        u = abs(phi - phi0) / total
        ramp = smooth(u / 0.08) * smooth((1 - u) / 0.08)
        rr = R + wobble * ramp * math.sin(phi * 1.0 + seed)
        return C + rr * (math.cos(phi) * e1 + math.sin(phi) * e2) + a * z

    m = int(N * 48)
    helix = [on(phi0 + ccw * 2 * math.pi * i / 48, pitch * i / 48) for i in range(m + 1)]
    p0, p1 = helix[0], helix[-1]
    def tang(phi):
        return unit(ccw * R * (-math.sin(phi) * e1 + math.cos(phi) * e2) + a * pitch / (2 * math.pi))

    t0 = tang(phi0)
    t1 = tang(phi0 + ccw * 2 * math.pi * N)
    o0 = unit(p0 - C - a * np.dot(p0 - C, a))
    o1 = unit(p1 - C - a * np.dot(p1 - C, a))
    # start tail runs backwards from p0
    if lat is not None:
        o0, o1 = unit(lat[0]), unit(lat[1])
    tl0 = tail_points(p0, -t0, o0, down, tail, d_out[0], tail * 0.7, drop[0], tail * 0.75)
    tl1 = tail_points(p1, t1, o1, down, tail, d_out[1], tail * 0.7, drop[1], tail * 0.75)
    pts = list(reversed(tl0))[:-1] + helix + tl1[1:]
    return pts


def solve_radius(target, **kw):
    """Mean coil radius so the wire (tails and all) is `target` mm long."""
    lo, hi = 10.0, 400.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if polyline_len(coil_wire(R=mid, **kw)) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def wire_with_ends(pts, od, strip, cond_r, jacket_color, name, kit, rng, tinned="#c9ccd1", strand_len=None):
    """Sweep the jacket along pts, shortened at both ends, and add stripped strand bundles."""
    strand_len = strand_len or strip
    a, _, _ = cut_end(pts, strip)
    b, _, _ = cut_end(list(reversed(a)), strip)
    jpts = list(reversed(b))
    jacket = sweep_tube(jpts, od / 2)
    kit.add(jacket, f"{name}_jacket", jacket_color)
    # the strands continue along the end tangents
    tipA = np.asarray(jpts[-1], float)
    dA = unit(np.asarray(jpts[-1], float) - np.asarray(jpts[-2], float))
    tipB = np.asarray(jpts[0], float)
    dB = unit(np.asarray(jpts[0], float) - np.asarray(jpts[1], float))
    for tip, d in ((tipA, dA), (tipB, dB)):
        for k, s in enumerate(strand_end(tip, d, cond_r, strand_len, rng)):
            kit.add(s, f"{name}_strand", tinned)
    return jacket


# ---------------------------------------------------------------- zip tie
def zip_tie(C, a, e1, R, pitch_total, od, phi, color, kit, name="tie", width=3.2, strap=1.1):
    """A cable tie around the coil's cross-section at angle phi: a loop, a locking head and a snipped tail."""
    a, e1 = unit(a), unit(e1)
    e2 = np.cross(a, e1)
    C = np.asarray(C, float)
    zc = (pitch_total) / 2.0
    pad = 1.3
    wi, hi_ = 2 * (od / 2 + pad) + 0.6, pitch_total + od + 2 * pad
    wo, ho = wi + 2 * strap, hi_ + 2 * strap
    # local: radial = +x, axial = +z, tangential = y
    loop = cq.Workplane("XZ").center(R, zc).rect(wo, ho).rect(wi, hi_).extrude(width / 2, both=True)
    head = cq.Workplane("XY").box(7.0, width + 1.0, 4.2).translate((R + wo / 2 + 1.0, 0, zc + ho / 2 - 2.0))
    head = head.edges("|Z").fillet(0.8)
    tailp = cq.Workplane("XY").box(16.0, width * 0.85, 0.9).translate((R + wo / 2 + 7.0, 0, zc + ho / 2 + 0.6)).rotate((R + wo / 2, 0, zc + ho / 2), (R + wo / 2, 1, zc + ho / 2), -14)
    shape = loop.union(head).union(tailp)
    rad = math.cos(phi) * e1 + math.sin(phi) * e2
    pl = cq.Plane(origin=tuple(float(c) for c in C), xDir=tuple(float(c) for c in rad), normal=tuple(float(c) for c in a))
    solid = shape.val().moved(cq.Location(pl))
    kit.add(solid, name, color)


def scallop_revolve(r_in, r_w, od, width, z0, turns_gap=0.0):
    """Wound wire as a revolve: rounded ridges of radius od/2 sitting on radius r_w, `width` wide from z0."""
    n = int(width // od)
    pitch = width / n
    rr = od / 2
    wp = cq.Workplane("XZ").moveTo(r_in, z0).lineTo(r_w, z0)
    z = z0
    for k in range(n):
        zc = z0 + (k + 0.5) * pitch
        wp = wp.threePointArc((r_w + rr, zc), (r_w, z0 + (k + 1) * pitch))
    wp = wp.lineTo(r_in, z0 + width).close()
    return wp.revolve(360, (0, 0, 0), (0, 1, 0))


def resample(pts, step=2.0):
    p = np.asarray(pts, float)
    out = [p[0]]
    for a, b in zip(p[:-1], p[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    return np.array(out)


def min_gap(pa, pb, step=2.0):
    """Smallest centreline distance between two polylines (brute force on resampled points)."""
    a, b = resample(pa, step), resample(pb, step)
    d = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)
    return float(d.min())


def place(shape, origin, xdir, normal):
    """Move a shape built about the world origin (axis z, x along xdir) onto a plane."""
    pl = cq.Plane(origin=tuple(float(c) for c in origin), xDir=tuple(float(c) for c in xdir), normal=tuple(float(c) for c in normal))
    return shape.moved(cq.Location(pl))


class Spool:
    """A hand spool of silicone wire in its own frame: axis z, flanges at z=0 and z=W+t, winding between."""

    def __init__(self, od, length, hub_d, flange_d, width, bore_d, t_f=2.0, packing=0.907, holes=(5, 6.0), rim_holes=(8, 3.2)):
        self.od, self.hub_d, self.flange_d, self.W, self.bore_d, self.t_f = od, hub_d, flange_d, width, bore_d, t_f
        vol = math.pi * (od / 2) ** 2 * length
        r_eff = math.sqrt((hub_d / 2) ** 2 + vol / (math.pi * width * packing))
        self.r_w = r_eff - od / 4  # wire centreline radius of the outermost layer
        self.r_top = self.r_w + od / 2
        assert self.r_top < flange_d / 2 - 1.0, f"winding {self.r_top:.1f} overflows flange {flange_d / 2}"
        self.holes, self.rim_holes = holes, rim_holes

    def flange(self, z0):
        f = cq.Workplane("XY").circle(self.flange_d / 2).circle(self.bore_d / 2).extrude(self.t_f)
        n, d = self.holes
        if n:
            pts = [((self.hub_d / 2 + self.bore_d / 2) / 2 * math.cos(2 * math.pi * k / n + 0.3), (self.hub_d / 2 + self.bore_d / 2) / 2 * math.sin(2 * math.pi * k / n + 0.3)) for k in range(n)]
            f = f.cut(cq.Workplane("XY").pushPoints(pts).circle(d / 2).extrude(self.t_f))
        n, d = self.rim_holes
        if n:
            rr = (self.r_top + self.flange_d / 2) / 2 + 0.2
            pts = [(rr * math.cos(2 * math.pi * k / n), rr * math.sin(2 * math.pi * k / n)) for k in range(n)]
            f = f.cut(cq.Workplane("XY").pushPoints(pts).circle(d / 2).extrude(self.t_f))
        try:
            f = f.faces(">Z or <Z").edges(cq.selectors.RadiusNthSelector(0, directionMax=True)).chamfer(min(0.5, self.t_f / 3))
        except Exception:
            pass
        return f.translate((0, 0, z0))

    def build(self, kit, name, wire_color, plastic_color, origin, xdir, normal):
        t, W = self.t_f, self.W
        parts = [(self.flange(0.0), f"{name}_flange", plastic_color), (self.flange(t + W), f"{name}_flange", plastic_color)]
        hub = cq.Workplane("XY").circle(self.hub_d / 2).circle(self.bore_d / 2 + 0.6).extrude(W).translate((0, 0, t))
        parts.append((hub, f"{name}_hub", plastic_color))
        wind = scallop_revolve(self.hub_d / 2 - 0.3, self.r_w, self.od, W, t)
        parts.append((wind, f"{name}_wind", wire_color))
        for shp, nm, col in parts:
            kit.add(place(shp.val() if isinstance(shp, cq.Workplane) else shp, origin, xdir, normal), nm, col)

    def tail_start(self, psi, origin, xdir, normal):
        """World point, tangent and outward normal where a tail leaves the outermost turn at angle psi, last position along the axis."""
        a = unit(normal)
        e1 = unit(xdir)
        e2 = np.cross(a, e1)
        z_t = self.t_f + self.od / 2 + 0.3
        P = np.asarray(origin, float) + self.r_w * (math.cos(psi) * e1 + math.sin(psi) * e2) + a * z_t
        t = unit(-math.sin(psi) * e1 + math.cos(psi) * e2)
        o = unit(math.cos(psi) * e1 + math.sin(psi) * e2)
        return P, t, o


def free_tail(kit, name, color, pts, od, cond_r, strip, rng, tinned="#c9ccd1"):
    """A wire running from pts[0] (buried in a winding) to a stripped, tinned end."""
    a, _, _ = cut_end(pts, strip)
    jacket = sweep_tube(a, od / 2)
    kit.add(jacket, f"{name}_jacket", color)
    tip = np.asarray(a[-1], float)
    d = unit(np.asarray(a[-1], float) - np.asarray(a[-2], float))
    for s in strand_end(tip, d, cond_r, strip, rng):
        kit.add(s, f"{name}_strand", tinned)
