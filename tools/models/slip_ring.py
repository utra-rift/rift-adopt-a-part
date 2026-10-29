"""Capsule slip ring with mounting flange: 22 mm body, gigabit Ethernet + 2 x 20 A (14 AWG) + 2 x 2 A (22 AWG) rings.

Modelled from the product class (no manufacturer CAD):
  body     22 mm aluminium capsule, 33 mm stator housing carrying a 36 mm flange (3 mm, four 3.4 mm holes on a
           29 mm circle, 1 mm pilot step), black seal collar at the seam, 16 mm silver rotor housing with a black
           anodised band and an M2.5 set screw, a black potted lead plug (14 mm) at each end
  leads    at each end: 2 x 14 AWG (3.1 mm over insulation, red and black), 2 x 22 AWG (1.7 mm, yellow and white),
           one 5.5 mm Ethernet cable ending in an RJ45 plug (clear body, eight gold contacts, boot)
  rest     the ring lies on its flange rim and on the rotor housing, so it is tipped 7.7 degrees nose-down toward the
           rotor end. Leads leave along the axis and droop under their own weight onto the floor (z = 0), fanned
           out so none touches another. Lengths shortened to 54/48 mm (14/22 AWG) and 62 mm + plug (Ethernet) so the body stays readable.
Coordinates: floor z = 0, axis nominally along X (stator at -X, rotor at +X), up is +Z.
"""
import math
import pathlib

import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
V = cq.Vector

# ------------------------------------------------------------------ body in its own frame: axis X, flange face at x = 0
R_BODY, R_FL = 11.0, 18.0
FL_T = 3.0
STAT_END = 36.0
SEAL_T = 1.0
ROT_END = 53.0
PLUG_R, PLUG_L = 8.0, 7.0

def cyl(r, x0, x1):
    return cq.Workplane("YZ").circle(r).extrude(x1 - x0).translate((x0, 0, 0))

def tube(ro, ri, x0, x1):
    return cq.Workplane("YZ").circle(ro).circle(ri).extrude(x1 - x0).translate((x0, 0, 0))

# flange + stator housing as one lathe-ish body
stator = cyl(R_FL, 0, FL_T).union(cyl(R_BODY, FL_T, STAT_END))
stator = stator.faces("<X").edges().chamfer(0.6)
stator = stator.faces(">X").edges().chamfer(0.5)
# pilot step on the flange face
stator = stator.union(cyl(12.5, -1.0, 0.0))
stator = stator.faces("<X").edges("%CIRCLE").edges(cq.selectors.RadiusNthSelector(0, directionMax=True)).chamfer(0.3)
# four mounting holes
holes = None
for k in range(4):
    a = math.radians(45 + 90 * k)
    h = cq.Workplane("YZ").circle(1.7).extrude(FL_T + 3).translate((-2, 14.5 * math.cos(a), 14.5 * math.sin(a)))
    stator = stator.cut(h)
# two shallow circumferential grooves on the stator housing
for gx in (12.0, 29.0):
    stator = stator.cut(tube(R_BODY + 1, R_BODY - 0.35, gx, gx + 0.9))
# flat-bottom recess in the rear of the flange (potting seat)
stator = stator.cut(cyl(8.2, -0.5, 0.0)) if False else stator
# lead plug on the stator end (potted epoxy)
plug_s = cyl(PLUG_R, -PLUG_L - 1.0, 0.4)
plug_s = plug_s.faces("<X").edges().chamfer(0.7)
# seal collar
collar = cyl(R_BODY - 0.6, STAT_END, STAT_END + SEAL_T)
# rotor housing
rot0 = STAT_END + SEAL_T
rotor = cyl(R_BODY, rot0, ROT_END)
rotor = rotor.faces(">X").edges().chamfer(0.6)
rotor = rotor.faces("<X").edges().chamfer(0.35)
rotor = rotor.cut(tube(R_BODY + 1, R_BODY - 0.35, rot0 + 12.0, rot0 + 12.9))
band = tube(R_BODY + 0.12, R_BODY - 0.2, rot0 + 3.2, rot0 + 6.4)  # black anodised band
plug_r = cyl(PLUG_R, ROT_END - 0.4, ROT_END + PLUG_L + 1.0)
plug_r = plug_r.faces(">X").edges().chamfer(0.7)
# set screw on the rotor housing, hex socket
ss = cq.Workplane("XY").circle(1.35).extrude(1.6).translate((rot0 + 9.0, 0, R_BODY - 0.9))
ss = ss.cut(cq.Workplane("XY").polygon(6, 1.5).extrude(1.0).translate((rot0 + 9.0, 0, R_BODY + 0.1)))
# lead-exit sockets in the potting faces drawn as tiny dimples are the wires themselves; nothing extra

# ------------------------------------------------------------------ rest pose
TH = math.atan2(7.0, ROT_END - 1.0)  # tip so flange rim and rotor rim both touch the floor
# local -> world: rotate about Y by +th (nose-down toward +X)... then lift so the lowest points sit at z = 0
def to_world(shape):
    return shape.rotate((0, 0, 0), (0, 1, 0), math.degrees(TH)).translate((0, 0, ZLIFT))

# lowest points: flange rim bottom, rotor outer rim bottom
cth, sth = math.cos(TH), math.sin(TH)
# a local point (x, 0, z) maps to world (x*cth + z*sth, ., -x*sth + z*cth) before lift  (rotation of +th about Y: z' = -x sin + z cos)
ZLIFT = max(-(0 * -sth + (-R_FL) * cth - (FL_T) * 0), -((ROT_END) * -sth + (-R_BODY) * cth))
ZLIFT = max(-( (FL_T * 0.5) * -sth + (-R_FL) * cth), -((ROT_END) * -sth + (-R_BODY) * cth))
def lp(x, y, z):
    """local point to world"""
    return (x * cth + z * sth, y, -x * sth + z * cth + ZLIFT)

# ------------------------------------------------------------------ leads
EXIT_STATOR = -PLUG_L - 1.0
EXIT_ROTOR = ROT_END + PLUG_L + 1.0
# (name, radius, colour tag, start y, start z (local), lane y, length mm of insulated lead, floor z)
LEADS = [
    ("yellow", 0.85, "yellow", -5.0, 5.2, -9.8, 50.0),
    ("eth", 2.75, "eth", -2.0, -1.6, -4.2, 62.0),
    ("red", 1.55, "red", 0.9, 3.9, 1.6, 54.0),
    ("black", 1.55, "black", 2.9, -3.3, 5.3, 56.0),
    ("white", 0.85, "white", 4.9, 3.4, 9.4, 48.0),
]
FALL = {"yellow": 24.0, "eth": 36.0, "red": 30.0, "black": 31.0, "white": 25.0}


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def lead_path(side, lead, jitter=1.0):
    name, r, tag, y0, z0, lane, length = lead
    sgn = -1 if side == "stator" else 1
    ex = EXIT_STATOR if side == "stator" else EXIT_ROTOR
    # lateral order mirrored on the far end (looking along the axis the same lanes keep their meaning)
    ys, ylane = (y0, lane) if side == "stator" else (-y0, -lane)
    p0 = lp(ex, ys, z0)
    # horizontal and vertical profile in world coordinates; u = outward horizontal distance
    slope0 = (sth / cth) if side == "stator" else -(sth / cth)  # dz/du at the exit
    uf = FALL[name] * jitter
    zf = r
    pts, s_len = [], 0.0
    prev = None
    du = 1.5
    u = 0.0
    spread = 26.0 * jitter
    while True:
        # vertical: Hermite from (0, z0w) slope slope0 to (uf, zf) slope 0, then flat
        if u < uf:
            t = u / uf
            h00, h10, h01 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2
            z = h00 * p0[2] + h10 * uf * slope0 + h01 * zf
        else:
            z = zf
        # lateral: leave the exit hole and settle into the lane, then keep fanning out
        y = p0[1] + (ylane - p0[1]) * smooth(u / spread)
        g = smooth((u - uf * 0.6) / max(length - uf * 0.6, 1.0))
        y += ylane * 2.2 * g + (0.0 if abs(ylane) < 0.01 else 0.0)
        x = p0[0] + sgn * u * 1.0
        p = (x, y, z)
        if prev is not None:
            s_len += math.dist(p, prev)
        pts.append(p)
        prev = p
        if s_len >= length:
            break
        u += du
    return pts


def sweep_circle(pts, r, n_ctrl=18):
    # decimate to a smooth spline through ~n_ctrl points, keep the last
    idx = sorted(set([int(round(i * (len(pts) - 1) / (n_ctrl - 1))) for i in range(n_ctrl)]))
    cp = [V(*pts[i]) for i in idx]
    path = cq.Workplane("XY").spline([c for c in cp], includeCurrent=False)
    t0 = (cp[1] - cp[0]).normalized()
    # profile plane normal to the start tangent
    plane = cq.Plane(origin=cp[0], xDir=V(0, 1, 0).cross(t0) if abs(t0.y) < 0.9 else V(1, 0, 0), normal=t0)
    prof = cq.Workplane(plane).circle(r)
    return prof.sweep(path, transition="round"), cp


def tangent_end(cp):
    return (cp[-1] - cp[-3]).normalized()


solids = {}  # name -> list of (part name, shape)
parts = []

def add(name, shape):
    parts.append((name, shape))

add("body_stator", to_world(stator))
add("seal_collar", to_world(collar))
add("body_rotor", to_world(rotor))
add("rotor_band", to_world(band))
add("setscrew", to_world(ss))
add("potting_stator", to_world(plug_s))
add("potting_rotor", to_world(plug_r))

COPPER_L = 7.0
ALL_PATHS = []
for side in ("stator", "rotor"):
    jit = 1.0 if side == "stator" else 1.12
    for lead in LEADS:
        name, r, tag, *_ = lead
        pts = lead_path(side, lead, jit)
        ALL_PATHS.append((side, name, r, pts))
        body, cp = sweep_circle(pts, r)
        nm = f"{side}_{name}"
        if tag == "eth":
            add(f"lead_{nm}_cable", body)
        else:
            add(f"lead_{nm}_{tag}", body)
            # bare conductor tip (stripped), tiny pale insulation step between
            t = tangent_end(cp)
            pl = cq.Plane(origin=cp[-1] + t * 0.2, xDir=V(0, 0, 1).cross(t) if abs(t.z) < 0.9 else V(1, 0, 0), normal=t)
            add(f"lead_{nm}_tip", cq.Workplane(pl).circle(r * 0.58).extrude(COPPER_L))
        if tag == "eth":
            t = tangent_end(cp)
            ang = math.degrees(math.atan2(t.y, t.x))
            # plug in its own frame: +x toward the tip, contacts up, resting on the floor (z = 0..8.1)
            zc = 4.05
            boot = (cq.Workplane("YZ").workplane(offset=-0.2).center(0, 2.75).circle(3.5)
                    .workplane(offset=12.0).center(0, zc - 2.75).rect(9.4, 6.6).loft(combine=True))
            collar_p = cq.Workplane("XY").box(3.0, 10.2, 7.4, centered=(False, True, True)).translate((11.5, 0, zc))
            body_p = cq.Workplane("XY").box(14.0, 11.7, 8.1, centered=(False, True, True)).translate((14.2, 0, zc)).faces(">X").edges("|Y or |Z").chamfer(0.5)
            # eight contact slots + gold blades on the upper face near the tip
            blades = []
            for k in range(8):
                yk = (k - 3.5) * 1.02
                body_p = body_p.cut(cq.Workplane("XY").box(7.2, 0.62, 0.5, centered=False).translate((19.6, yk - 0.31, zc + 4.05 - 0.5)))
                blades.append(cq.Workplane("XY").box(7.0, 0.5, 0.52, centered=False).translate((19.7, yk - 0.25, zc + 4.05 - 0.5)).val())
            latch_tab = cq.Workplane("XY").box(7.5, 7.2, 1.2, centered=(False, True, False)).translate((17.5, 0, zc - 4.05 - 1.2))
            for nm2, sh in (("boot", boot), ("plug", body_p.union(collar_p).union(latch_tab))):
                add(f"lead_{nm}_{nm2}", sh.rotate((0, 0, 0), (0, 0, 1), ang).translate(cp[-1] - V(0, 0, 0) + V(0, 0, 0)))
            add(f"lead_{nm}_contacts", cq.Workplane("XY").add(cq.Compound.makeCompound(blades)).rotate((0, 0, 0), (0, 0, 1), ang).translate(cp[-1]))

# ---- check lead clearance
def mind(a, b):
    m = 1e9
    for p in a:
        for q in b:
            m = min(m, math.dist(p, q))
    return m

bad = 0
for i in range(len(ALL_PATHS)):
    for j in range(i + 1, len(ALL_PATHS)):
        si, ni, ri, pi = ALL_PATHS[i]
        sj, nj, rj, pj = ALL_PATHS[j]
        if si != sj:
            continue
        m = mind(pi[::3], pj[::3])
        if m < ri + rj + 0.1:
            bad += 1
            print("CLEARANCE", si, ni, nj, round(m, 2), "need", round(ri + rj + 0.1, 2))
print("lead pairs too close:", bad)

asm = cq.Assembly(name="slip_ring")
for nm, sh in parts:
    asm.add(sh if isinstance(sh, cq.Workplane) else cq.Workplane("XY").add(sh), name=nm)
asm.export(str(ROOT / "cad/models/slip-ring.step"))
print(len(parts), "parts; tilt", round(math.degrees(TH), 2), "deg")
