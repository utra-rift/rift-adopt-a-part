"""Amass XT-series connector builder (XT30U, XT60H): nylon housings, gold-plated contacts and solder cups.

Local frame of every plug: the mating face is the plane x = 0 and the body extends toward -x; y is the width,
z the height; the polarity chamfers are on the +z (top) long edges. Pins and sockets lie at y = +-pitch/2, z = 0.
Dimensions follow Amass' published outlines (XT30U: 10.0 x 5.0 mm body, 2.0 mm contacts at 5.0 mm pitch;
XT60H: 15.6 x 8.0 mm body, 3.5 mm contacts at 7.2 mm pitch).
"""
import math

import cadquery as cq

YELLOW, GOLD, DARK = "#e6b415", "#d7a93b", "#242424"


def profile(W, H, ch, wp="YZ", offset=0.0):
    """Chamfered rectangle (chamfers on the +z corners) in the YZ plane, centred; extrude(+x)."""
    w, h = W / 2, H / 2
    pts = [(-w, -h), (w, -h), (w, h - ch), (w - ch, h), (-w + ch, h), (-w, h - ch)]
    return cq.Workplane(wp, origin=(offset, 0, 0)).polyline(pts).close()


def prism(W, H, ch, x0, x1):
    return profile(W, H, ch, offset=x0).extrude(x1 - x0)


def cup(x_tip, d_out, d_in, length, scoop):
    """A solder cup: a tube whose last `scoop` mm toward the tip has its top half cut away. Axis along x, tip at x_tip (rear, -x)."""
    t = cq.Workplane("YZ", origin=(x_tip, 0, 0)).circle(d_out / 2).circle(d_in / 2).extrude(length)
    # the closed base: a solid plug on the housing side so the bore is blind
    plug = cq.Workplane("YZ", origin=(x_tip + length - 1.2, 0, 0)).circle(d_out / 2).extrude(1.2)
    t = t.union(plug)
    cutter = cq.Workplane("XY").box(scoop, d_out + 1, d_out / 2 + 0.5, centered=(False, True, False)).translate((x_tip - 0.01, 0, 0.0))
    t = t.cut(cutter)
    # a slightly flared mouth edge
    return t


def soften(body, c=0.18):
    try:
        return body.edges().chamfer(c)
    except Exception:
        return body


def male(p, with_boss=True):
    """Returns dict name -> (solid, colour). p: dict of dimensions."""
    W, H, ch, L = p["W"], p["H"], p["ch"], p["L"]
    pitch, d, pl = p["pitch"], p["pin_d"], p["pin_len"]
    out = {}
    body = soften(prism(W, H, ch, -L, 0.0), p.get("soft", 0.18))
    boss_h = p["boss_h"]
    if with_boss:
        boss = prism(W - 2 * p["boss_in"], H - 2 * p["boss_in"], max(ch - p["boss_in"], 0.2), 0.0, boss_h)
        body = body.union(boss)
    # grip dimples on both sides
    for sy in (-1, 1):
        body = body.cut(cq.Workplane("XY").box(L * 0.5, 0.8, H * 0.45).translate((-L * 0.45, sy * (W / 2), -H * 0.05)))
    # rear counterbores for the cups
    for sy in (-1, 1):
        body = body.cut(cq.Workplane("YZ", origin=(-L, 0, 0)).center(sy * pitch / 2, 0).circle(p["cup_d"] / 2 + 0.5).extrude(1.8))
    out["body"] = (body, YELLOW)
    for k, sy in enumerate((-1, 1)):
        y = sy * pitch / 2
        pin = cq.Workplane("YZ", origin=(-L * 0.55, 0, 0)).center(y, 0).circle(d / 2).extrude(L * 0.55 + boss_h + pl)
        pin = pin.faces(">X").edges().fillet(d * 0.3)
        collar = cq.Workplane("YZ", origin=(boss_h - 0.1, 0, 0)).center(y, 0).circle(d / 2 + 0.35).extrude(0.7)
        pin = pin.union(collar)
        out[f"pin{k}"] = (pin, GOLD)
        c = cup(-L - p["cup_out"], p["cup_d"], p["cup_d"] - 0.9, p["cup_out"] + 2.2, p["cup_out"] * 0.7).translate((0, y, 0))
        out[f"cup{k}"] = (c, GOLD)
    return out


def female(p):
    W, H, ch, L = p["W"], p["H"], p["ch"], p["L"]
    pitch, d, pl = p["pitch"], p["pin_d"], p["pin_len"]
    boss_h = p["boss_h"]
    out = {}
    body = soften(prism(W, H, ch, -L, 0.0), p.get("soft", 0.18))
    # recess matching the male boss
    rec = prism(W - 2 * p["boss_in"] + 0.2, H - 2 * p["boss_in"] + 0.2, max(ch - p["boss_in"], 0.2), -boss_h, 0.0)
    body = body.cut(rec)
    for sy in (-1, 1):
        body = body.cut(cq.Workplane("XY").box(L * 0.5, 0.8, H * 0.45).translate((-L * 0.45, sy * (W / 2), -H * 0.05)))
    for sy in (-1, 1):
        body = body.cut(cq.Workplane("YZ", origin=(-L, 0, 0)).center(sy * pitch / 2, 0).circle(p["cup_d"] / 2 + 0.5).extrude(1.8))
    # socket bores through the face
    depth = boss_h + pl + 0.6
    for sy in (-1, 1):
        body = body.cut(cq.Workplane("YZ", origin=(-depth, 0, 0)).center(sy * pitch / 2, 0).circle(d / 2 + 0.55).extrude(depth))
    out["body"] = (body, YELLOW)
    for k, sy in enumerate((-1, 1)):
        y = sy * pitch / 2
        sock = (cq.Workplane("YZ", origin=(-depth - 0.5, 0, 0)).center(y, 0).circle(d / 2 + 0.45).circle(d / 2 - 0.05).extrude(depth - 0.4 - boss_h * 0.0)
                )
        plug = cq.Workplane("YZ", origin=(-L * 0.6, 0, 0)).center(y, 0).circle(d / 2 + 0.45).extrude(L * 0.6 - depth - 0.5)
        sock = sock.union(plug)
        out[f"socket{k}"] = (sock, GOLD)
        c = cup(-L - p["cup_out"], p["cup_d"], p["cup_d"] - 0.9, p["cup_out"] + 2.2, p["cup_out"] * 0.7).translate((0, y, 0))
        out[f"cup{k}"] = (c, GOLD)
    return out


def add_plug(kit, parts, name, origin, yaw_deg, flip=False, roll_deg=0.0):
    """Add a plug's solids placed at origin, rotated about z by yaw (and flipped to face +x/-x), rolled about its own axis."""
    for key, (shape, col) in parts.items():
        s = shape.val() if isinstance(shape, cq.Workplane) else shape
        if roll_deg:
            s = s.rotate((0, 0, 0), (1, 0, 0), roll_deg)
        if flip:
            s = s.rotate((0, 0, 0), (0, 0, 1), 180)
        s = s.rotate((0, 0, 0), (0, 0, 1), yaw_deg).translate(origin)
        kit.add(s, f"{name}_{key}", col)
