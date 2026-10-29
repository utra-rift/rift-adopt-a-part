"""Small CadQuery helpers shared by the electronics models (camera board, AI HAT, supercap bank, PCB batch).

Everything is built as separate solids grouped by material name; Kit.export writes one STEP product per
group (a compound), so the converter's `materials` rules can match on the group name ("/pcb/", "/gold/").
Units mm, z up.
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
V = cq.Vector


# ---------------------------------------------------------------- grouping / export
class Kit:
    def __init__(self):
        self.groups = {}

    def add(self, name, *shapes):
        for s in shapes:
            if s is None:
                continue
            if isinstance(s, (list, tuple)):
                self.add(name, *s)
                continue
            self.groups.setdefault(name, []).append(s.val() if hasattr(s, "val") else s)

    def export(self, path, name="model"):
        asm = cq.Assembly(name=name)
        for g, shapes in self.groups.items():
            solids = []
            for s in shapes:
                solids.extend(s.Solids())
            asm.add(cq.Workplane("XY").newObject([cq.Compound.makeCompound(solids)]), name=g)
        asm.export(str(path))
        n = sum(len(v) for v in self.groups.values())
        return n

    def bbox(self):
        allsol = [s for v in self.groups.values() for s in v]
        bb = cq.Compound.makeCompound(allsol).BoundingBox()
        return bb


# ---------------------------------------------------------------- primitives
def wp(s):
    return s if isinstance(s, cq.Workplane) else cq.Workplane("XY").newObject([s])


def box(cx, cy, z0, w, d, h, r=0.0):
    b = cq.Workplane("XY").box(w, d, h, centered=(True, True, False))
    if r > 0:
        b = b.edges("|Z").fillet(min(r, w / 2 - 1e-3, d / 2 - 1e-3))
    return b.translate((cx, cy, z0))


def boxc(x0, y0, z0, x1, y1, z1, r=0.0):
    return box((x0 + x1) / 2, (y0 + y1) / 2, z0, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), r)


def cyl(cx, cy, z0, d, h):
    return cq.Workplane("XY").circle(d / 2).extrude(h).translate((cx, cy, z0))


def ring(cx, cy, z0, d_out, d_in, h):
    return cq.Workplane("XY").circle(d_out / 2).circle(d_in / 2).extrude(h).translate((cx, cy, z0))


def lathe(pts):
    """Solid of revolution about the Z axis from (r, z) profile points (closed polygon)."""
    clean = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-6:
            clean.append(p)
    if math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-6:
        clean.pop()
    return cq.Workplane("XZ").polyline(clean).close().revolve(360, (0, 0, 0), (0, 1, 0))


def place(s, x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0):
    s = wp(s)
    if rx:
        s = s.rotate((0, 0, 0), (1, 0, 0), rx)
    if ry:
        s = s.rotate((0, 0, 0), (0, 1, 0), ry)
    if rz:
        s = s.rotate((0, 0, 0), (0, 0, 1), rz)
    return s.translate((x, y, z))


def prism(pts, z0, h):
    return cq.Workplane("XY").polyline(pts).close().extrude(h).translate((0, 0, z0))


def stadium(cx, cy, length, width, angle=0.0, z0=0.0, h=1.0):
    return cq.Workplane("XY").slot2D(length, width, angle).extrude(h).translate((cx, cy, z0))


def union(shapes):
    out = wp(shapes[0])
    for s in shapes[1:]:
        out = out.union(wp(s))
    return out


def hexprism(cx, cy, z0, across_flats, h):
    d = across_flats / math.cos(math.radians(30))
    return cq.Workplane("XY").polygon(6, d).extrude(h).translate((cx, cy, z0))


def knurled(cx, cy, z0, r_out, r_in, n, h):
    """Straight-ribbed cylinder: a star polygon with n teeth."""
    pts = []
    for i in range(n):
        a0 = 2 * math.pi * i / n
        da = 2 * math.pi / n
        for f, r in ((0.0, r_in), (0.25, r_out), (0.5, r_out), (0.75, r_in)):
            a = a0 + f * da
            pts.append((r * math.cos(a), r * math.sin(a)))
    return prism(pts, 0, h).translate((cx, cy, z0))


# ---------------------------------------------------------------- electronics
def pan_screw(x, y, z0, d_head=3.6, h_head=1.3, slot=True):
    """Pan-head screw sitting on a surface at z0 (head only; the shank is inside the board), cross recess."""
    r = d_head / 2
    prof = [(0, 0), (r, 0), (r, h_head * 0.35), (r * 0.82, h_head * 0.8), (r * 0.55, h_head), (0, h_head)]
    s = lathe(prof)
    if slot:
        w = d_head * 0.14
        for a in (0, 90):
            s = s.cut(cq.Workplane("XY").box(d_head * 0.62, w, h_head * 0.55, centered=(True, True, False)).translate((0, 0, h_head * 0.55)).rotate((0, 0, 0), (0, 0, 1), a))
    return s.translate((x, y, z0))


def smd(kind, x, y, z0, rot=0.0):
    """Chip passive: returns (body_shape, terminal_shapes). kind in {0402, 0603, 0805, 1206}."""
    L, W, H = {"0402": (1.0, 0.5, 0.35), "0603": (1.6, 0.8, 0.45), "0805": (2.0, 1.25, 0.55), "1206": (3.2, 1.6, 0.6)}[kind]
    t = L * 0.22
    body = box(0, 0, 0, L - 2 * t, W, H)
    ends = [box(s * (L / 2 - t / 2), 0, 0, t, W, H) for s in (-1, 1)]
    return (place(body, x, y, z0, rz=rot), [place(e, x, y, z0, rz=rot) for e in ends])


def qfp(x, y, z0, body=10.0, h=1.4, per_side=16, pitch=0.5, lead_w=0.22, lead_l=1.0, lead_t=0.15, rot=0.0):
    """Quad flat package: moulded body with sloped sides, gull-wing leads, pin-1 dimple. Returns (body, leads)."""
    b2 = body / 2
    body_s = cq.Workplane("XY").box(body, body, h, centered=(True, True, False)).faces(">Z").edges().chamfer(0.18)
    body_s = body_s.translate((0, 0, 0.12))
    # pin-1 dimple
    body_s = body_s.cut(cq.Workplane("XY").circle(0.45).extrude(0.2).translate((-b2 + 1.3, -b2 + 1.3, 0.12 + h - 0.1)))
    leads = []
    span = (per_side - 1) * pitch
    for side in range(4):
        for k in range(per_side):
            u = -span / 2 + k * pitch
            # gull wing: foot on the board, vertical riser to mid body
            foot = box(0, 0, 0, lead_w, lead_l, lead_t).translate((u, b2 + lead_l / 2 - 0.1, 0))
            riser = box(0, 0, 0, lead_w, lead_t, h * 0.55 + 0.05).translate((u, b2 + lead_l - 0.1 - lead_t / 2, 0))
            lead = foot.union(riser)
            leads.append(lead.rotate((0, 0, 0), (0, 0, 1), side * 90))
    return place(body_s, x, y, z0, rz=rot), [place(l, x, y, z0, rz=rot) for l in leads]


def soic(x, y, z0, n=8, w=3.9, l=4.9, h=1.4, rot=0.0):
    body = box(0, 0, 0.15, l, w, h - 0.15).faces(">Z").edges().chamfer(0.12)
    pitch = 1.27
    leads = []
    for side in (-1, 1):
        for k in range(n // 2):
            u = -(n // 2 - 1) * pitch / 2 + k * pitch
            foot = box(u, side * (w / 2 + 0.55), 0, 0.42, 1.1, 0.18)
            riser = box(u, side * (w / 2 + 0.05), 0, 0.42, 0.18, 0.9)
            leads += [foot, riser]
    body = body.cut(cq.Workplane("XY").circle(0.35).extrude(0.2).translate((-l / 2 + 0.7, -w / 2 + 0.7, h - 0.05)))
    return place(body, x, y, z0, rz=rot), [place(s, x, y, z0, rz=rot) for s in leads]


def cable(points, r, start_dir=None, samples=None):
    """A round jacket swept along a spline through 3D points (list of (x,y,z))."""
    pts = [V(*p) for p in points]
    edge = cq.Edge.makeSpline(pts)
    wire = cq.Wire.assembleEdges([edge])
    t0 = (pts[1] - pts[0]).normalized() if start_dir is None else V(*start_dir).normalized()
    plane = cq.Plane(origin=pts[0], xDir=t0.cross(V(0, 0, 1)) if abs(t0.z) < 0.99 else V(1, 0, 0), normal=t0)
    prof = cq.Workplane(plane).circle(r)
    return prof.sweep(cq.Workplane(obj=wire), transition="round")


def polyline_cable(points, r):
    """A swept cable along straight segments joined by tight arcs (via spline for smoothness)."""
    return cable(points, r)


def pin_header(x, y, z0, cols, rows, pitch=2.54, body_h=8.5, pin_len=11.5, pin=0.64, rot=0.0, female=True):
    """Black plastic shroud with gold pins; female: square holes in the top. Returns (shroud, pins)."""
    w, d = cols * pitch, rows * pitch
    shroud = box(0, 0, 0, w, d, body_h)
    pins = []
    holes = []
    for i in range(cols):
        for j in range(rows):
            px = -w / 2 + pitch / 2 + i * pitch
            py = -d / 2 + pitch / 2 + j * pitch
            if female:
                holes.append(box(px, py, body_h - 1.8, 1.05, 1.05, 1.9))
            pins.append(box(px, py, -3.0, pin, pin, body_h - 1.0 + 3.0 if female else pin_len))
    if female:
        shroud = shroud.cut(union(holes))
    return place(shroud, x, y, z0, rz=rot), [place(p, x, y, z0, rz=rot) for p in pins]


def lay_lead(p0, heading_deg, z0, r, drop=30.0, run=18.0, loop_len=80.0, theta_deg=120.0, tail=14.0, n=16, hold=8.0):
    """Centreline points of a cord leaving a socket at p0 = (x, y) at height z0 in direction heading_deg (plan angle):
    a straight hold, an S-drop to the table (z = r), a constant-curvature curl of theta_deg (sign = side) and a straight tail.
    Returns (points, (x_end, y_end), heading_end_deg)."""
    h = math.radians(heading_deg)
    ux, uy = math.cos(h), math.sin(h)
    pts = [(p0[0], p0[1], z0), (p0[0] + ux * hold, p0[1] + uy * hold, z0)]
    x0, y0 = p0[0] + ux * hold, p0[1] + uy * hold
    for k in range(1, 9):
        u = k / 8
        sm = u * u * (3 - 2 * u)
        pts.append((x0 + ux * drop * u, y0 + uy * drop * u, r + (z0 - r) * (1 - sm)))
    px, py = x0 + ux * drop, y0 + uy * drop
    th_tot = math.radians(theta_deg)
    f = lambda u: th_tot * (u * u * (3 - 2 * u))
    ds = loop_len / n
    px += ux * run
    py += uy * run
    pts.append((px, py, r))
    for k in range(1, n + 1):
        t1, t0 = f(k / n), f((k - 1) / n)
        a = h + (t0 + t1) / 2
        px += ds * math.cos(a)
        py += ds * math.sin(a)
        pts.append((px, py, r))
    he = h + th_tot
    for k in (1, 2):
        pts.append((px + k * tail / 2 * math.cos(he), py + k * tail / 2 * math.sin(he), r))
    return pts, (pts[-1][0], pts[-1][1]), math.degrees(he)


def figure8(cx, cy, z0, h, lobe=12.8, sep=8.6, grow=0.0):
    """Figure-8 (IEC C7/C8) prism: two merged circles."""
    a = cq.Workplane("XY").circle(lobe / 2 + grow).extrude(h).translate((cx - sep / 2, cy, z0))
    b = cq.Workplane("XY").circle(lobe / 2 + grow).extrude(h).translate((cx + sep / 2, cy, z0))
    w = cq.Workplane("XY").box(sep, lobe * 0.78 + 2 * grow, h, centered=(True, True, False)).translate((cx, cy, z0))
    return a.union(b).union(w)
