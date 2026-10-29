"""Shared helpers for the hardware-kit models (sheets, standoffs, spacers, screws, nuts, rivets, zip ties).

Frame used by every model here: x right, y depth (front of the object faces -y), z up, resting on z = 0,
which is how the site's camera (azimuth 45, elevation 30) sees the front on its left.
"""
import math
import pathlib
import random

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
V = cq.Vector


def shp(x):
    return x.val() if isinstance(x, cq.Workplane) else x


def move(s, xyz=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """Rotate about the origin (x, then y, then z, degrees) and translate."""
    s = shp(s)
    if rx:
        s = s.rotate(V(0, 0, 0), V(1, 0, 0), rx)
    if ry:
        s = s.rotate(V(0, 0, 0), V(0, 1, 0), ry)
    if rz:
        s = s.rotate(V(0, 0, 0), V(0, 0, 1), rz)
    return s.translate(V(*xyz))


def about(s, p, axis, deg):
    return shp(s).rotate(V(*p), V(*p) + V(*axis), deg)


class Reg:
    """Solids grouped by name; each group becomes one assembly child (one material)."""

    def __init__(self):
        self.d = {}

    def add(self, name, *solids):
        for s in solids:
            self.d.setdefault(name, []).append(shp(s))

    def export(self, asm_name, rel):
        asm = cq.Assembly(name=asm_name)
        for k, v in self.d.items():
            asm.add(cq.Compound.makeCompound(v), name=k)
        asm.export(str(ROOT / rel))
        n = sum(len(v) for v in self.d.values())
        return n


# ------------------------------------------------------------------ small turned and hex parts
def revolve_z(profile):
    """profile: list of (r, z) points, closed; revolved about z."""
    return cq.Workplane("XZ").polyline(profile).close().revolve(360, (0, 0, 0), (0, 1, 0))


def cyl(d, h, z0=0.0):
    return cq.Workplane("XY").workplane(offset=z0).circle(d / 2).extrude(h)


def hexbar(af, h, chamfer=0.35, z0=0.0):
    """Hex prism, across flats af, height h, both ends chamfered the way turned hex stock is."""
    rc = af / math.sqrt(3)  # circumradius
    hexa = cq.Workplane("XY").workplane(offset=z0).polygon(6, 2 * rc).extrude(h)
    r1 = af / 2 - 0.05
    prof = [(0, z0), (r1, z0), (rc + 0.02, z0 + chamfer), (rc + 0.02, z0 + h - chamfer), (r1, z0 + h), (0, z0 + h)]
    return hexa.intersect(revolve_z(prof))


def tube(od, idm, h, z0=0.0, ch=0.0):
    t = cyl(od, h, z0).cut(cyl(idm, h + 2, z0 - 1))
    if ch:
        t = t.faces(">Z or <Z").edges("%CIRCLE").chamfer(ch) if False else t
    return t


# ------------------------------------------------------------------ polyhedra (thin sheets, bent film)
def poly_face(pts):
    return cq.Face.makeFromWires(cq.Wire.makePolygon([V(*p) for p in pts], close=True))


def loft_sections(sections, ruled=False):
    """sections: list of lists of 3D points (closed polygons); a smooth or ruled solid through them."""
    wires = [cq.Wire.makePolygon([V(*p) for p in s], close=True) for s in sections]
    return cq.Solid.makeLoft(wires, ruled)


def rounded_rect(w, d, r, h, z0=0.0):
    return cq.Workplane("XY").workplane(offset=z0).rect(w, d).extrude(h).edges("|Z").fillet(r)


def helix_wire_solid(r, pitch, turns, wire_d, axis_len=None):
    """A coil spring along +z, from z = 0 (centreline radius r)."""
    h = pitch * turns
    helix = cq.Wire.makeHelix(pitch, h, r)
    prof = cq.Workplane("XZ").center(r, 0).circle(wire_d / 2)
    return prof.sweep(cq.Workplane(obj=helix), isFrenet=True)


# ------------------------------------------------------------------ the compartment case
class Case:
    """A hinged organiser box: tray with removable dividers, lid hinged along the back, front snap latch.

    Footprint centred on the origin, tray bottom at z = 0. rows: list of (depth, [column widths]); every row
    must sum to the same width. Rows run from the front (-y) to the back. `comps` lists each compartment's
    (xc, yc, x0, y0, x1, y1) and `floor` is the floor height.
    """

    def __init__(self, rows, inner_h, wall=2.0, div=1.2, floor=2.0, lid_h=9.0, open_deg=112.0, corner=5.0, notch=True):
        self.wall, self.div, self.floor, self.inner_h = wall, div, floor, inner_h
        widths = [sum(cols) + div * (len(cols) - 1) for _, cols in rows]
        assert max(widths) - min(widths) < 1e-6, widths
        self.iw = widths[0]
        self.id = sum(d for d, _ in rows) + div * (len(rows) - 1)
        self.W, self.D = self.iw + 2 * wall, self.id + 2 * wall
        self.H = floor + inner_h
        self.lid_h = lid_h
        self.open_deg = open_deg
        self.corner = corner
        self.rows = rows
        self.comps = []
        self.row_walls = []
        self.col_walls = []
        y = -self.id / 2
        for ri, (depth, cols) in enumerate(rows):
            x = -self.iw / 2
            for ci, w in enumerate(cols):
                self.comps.append((x + w / 2, y + depth / 2, x, y, x + w, y + depth))
                x += w
                if ci < len(cols) - 1:
                    self.col_walls.append((x + div / 2, y, y + depth))
                    x += div
            y += depth
            if ri < len(rows) - 1:
                self.row_walls.append(y + div / 2)
                y += div
        self.notch = notch

    # -------------------------------------------------- tray
    def tray(self):
        W, D, H, w, f, c = self.W, self.D, self.H, self.wall, self.floor, self.corner
        outer = rounded_rect(W, D, c, H)
        # stepped rim: the top 3 mm narrows by 0.9 mm so the lid sleeves over it
        rim = rounded_rect(W + 2, D + 2, c + 1, 3, z0=H - 3).cut(rounded_rect(W - 1.8, D - 1.8, c - 0.9, 3, z0=H - 3))
        outer = outer.cut(rim)
        pocket = rounded_rect(self.iw, self.id, max(c - w, 1.0), H, z0=f)
        tray = outer.cut(pocket)
        # grooves in the walls where the dividers slide in
        for xw, y0, y1 in self.col_walls:
            tray = tray.cut(cq.Workplane("XY").box(self.div + 0.3, y1 - y0 + 2 * 0.9, H, centered=(True, False, False))
                            .translate((xw, y0 - 0.9, f + 0.4)).intersect(rounded_rect(W, D, c, H)))
        for yw in self.row_walls:
            tray = tray.cut(cq.Workplane("XY").box(self.iw + 2 * 0.9, self.div + 0.3, H, centered=(True, True, False))
                            .translate((0, yw, f + 0.4)))
        # finger notch on the front wall, centre
        tray = tray.cut(cq.Workplane("XY").box(16, w + 1, 6).translate((0, -D / 2 + w / 2, H - 1.8)).edges("|Y").fillet(2.2)
                        if self.notch else cq.Workplane("XY").box(0.01, 0.01, 0.01).translate((0, 0, -50)))
        return tray

    def dividers(self):
        out = []
        h = self.inner_h - 3.5
        for xw, y0, y1 in self.col_walls:
            out.append(self._divider(self.div, y1 - y0 + 1.6, h).translate((xw, (y0 + y1) / 2, self.floor + 0.4)))
        for yw in self.row_walls:
            d = self._divider(self.div, self.iw + 1.6, h).rotate(V(0, 0, 0), V(0, 0, 1), 90)
            out.append(d.translate((0, yw, self.floor + 0.4)))
        return out

    def _divider(self, t, length, h):
        """A thin plate on edge, length along y, a half-round finger cut in its top edge."""
        d = cq.Workplane("XY").box(t, length, h, centered=(True, True, False))
        d = d.cut(cq.Workplane("YZ").center(0, h + 3.0).circle(7.0).extrude(t + 2, both=True))
        return d.edges("|X").edges(">Z").fillet(0.2) if False else d

    # -------------------------------------------------- lid and hardware (closed position, then swung open)
    def lid(self):
        W, D, w, c, lh = self.W, self.D, self.wall, self.corner, self.lid_h
        H = self.H
        shell = rounded_rect(W + 2, D + 2, c + 1, lh, z0=H)
        shell = shell.cut(rounded_rect(W + 2 - 2 * 1.6, D + 2 - 2 * 1.6, max(c - 0.6, 1), lh - 1.8, z0=H - 0.001))
        # moulded details on the inner roof: a raised border ridge, a recessed label panel frame and four corner bosses
        zr = H + lh - 1.8
        ridge = rounded_rect(W - 16, D - 16, 3, 1.1, z0=zr - 1.1).cut(rounded_rect(W - 18.4, D - 18.4, 2, 1.1, z0=zr - 1.1))
        shell = shell.union(ridge)
        for sx in (-1, 1):
            for sy in (-1, 1):
                shell = shell.union(cyl(5.0, 6.0, zr - 6.0).translate((sx * (W / 2 - 4.2), sy * (D / 2 - 4.2), 0)))
        return shell

    def latch_lid(self):
        """Lid-side latch tongue: a plate hanging from the front wall with a window, ridged thumb tab."""
        W, D, H, lh = self.W, self.D, self.H, self.lid_h
        y = -(D / 2 + 1)
        tongue = cq.Workplane("XY").box(14, 1.6, lh + 8, centered=(True, False, False)).translate((0, y - 0.4, H - 8))
        tongue = tongue.edges("|Y").edges("<Z").fillet(1.5)
        win = cq.Workplane("XY").box(7, 4, 3.4).translate((0, y + 0.4, H - 4.8))
        tongue = tongue.cut(win)
        # thumb tab sticking out at the bottom
        tab = cq.Workplane("XY").box(14, 3.2, 1.6, centered=(True, False, False)).translate((0, y - 2.4, H - 8))
        return tongue.union(tab)

    def catch_case(self):
        D, H = self.D, self.H
        y = -D / 2
        bump = cq.Workplane("XY").box(7 - 0.6, 1.3, 3.0).translate((0, y - 0.6, H - 4.8 + 0.4)).edges("|X").fillet(0.5)
        return bump

    def hinge(self):
        """(case_parts, lid_parts, pin) with the hinge axis along x at (y = D/2 + 2.3, z = H)."""
        W, D, H = self.W, self.D, self.H
        ya, za, R = D / 2 + 1.0, H, 2.4
        xs = [-W / 2 + 12, -W / 2 + 12 + 24]
        # knuckle layout along x: 5 knuckles alternately case, lid, ... each 12 mm wide with 0.5 gaps
        kn = 11.0
        n = 5
        x0 = -(n * kn + (n - 1) * 0.5) / 2
        case_p, lid_p = [], []
        for i in range(n):
            xc = x0 + i * (kn + 0.5) + kn / 2
            barrel = cq.Workplane("YZ").center(ya, za).circle(R).extrude(kn).translate((xc - kn / 2, 0, 0))
            barrel = barrel.cut(cq.Workplane("YZ").center(ya, za).circle(0.9).extrude(kn + 2).translate((xc - kn / 2 - 1, 0, 0)))
            if i % 2 == 0:
                web = cq.Workplane("XY").box(kn, ya - D / 2 + 0.3, 2 * R - 0.2, centered=(True, False, False)).translate((xc, D / 2 - 0.3, za - 2 * R + R - 0.0 - 0.3))
                case_p.append(barrel.union(web))
            else:
                web = cq.Workplane("XY").box(kn, ya - D / 2 + 0.3, 2 * R - 0.2, centered=(True, False, False)).translate((xc, D / 2 - 0.3, za - R + 0.1))
                lid_p.append(barrel.union(web))
        pin = cq.Workplane("YZ").center(ya, za).circle(0.8).extrude(n * kn + (n - 1) * 0.5 + 1.2).translate((x0 - 0.6, 0, 0))
        return case_p, lid_p, pin

    def swing(self, s):
        """Open the lid: rotate a closed-position lid part about the hinge axis."""
        ya, za = self.D / 2 + 1.0, self.H
        return shp(s).rotate(V(0, ya, za), V(1, ya, za), -self.open_deg)

    def build(self, reg, prefix="case"):
        reg.add(prefix + "-tray", self.tray())
        reg.add(prefix + "-div", *self.dividers())
        cs, ls, pin = self.hinge()
        reg.add(prefix + "-hinge", *cs, pin)
        reg.add(prefix + "-hinge", *[self.swing(p) for p in ls])
        reg.add(prefix + "-lid", self.swing(self.lid()))
        reg.add(prefix + "-latch", self.swing(self.latch_lid()), self.catch_case())


def seeded(n):
    return random.Random(n)
