"""Amass XT60H male and female with their sheath housings: one mated pair, one separate pair and a loose sheath.

XT60H: nylon body 15.6 x 8.0 mm with polarity chamfers, 3.5 mm gold-plated contacts at 7.2 mm pitch with solder
cups for 12-14 AWG, and a hollow sheath housing (the "H") that slides over the soldered cups and clamps onto the
body's rear seat. Body 16 mm, sheath 14 mm of which 4 mm overlap the body, so about 26 mm per plug. Lying on
the table, mated pair behind, the separate pair in front with both mating faces toward the viewer, and one
sheath on its side showing the hollow inside. Front faces -y.
"""
import math

from amass_xt import *
import random

from wiring_common import Kit, cyl, strand_end

import numpy as np

rng = random.Random(60)

P = dict(W=15.6, H=8.0, ch=2.3, L=16.0, pitch=7.2, pin_d=3.5, pin_len=6.5, boss_h=0.9, boss_in=1.3, cup_d=5.0, cup_out=5.5, soft=0.25)
W, H, CH, L = P["W"], P["H"], P["ch"], P["L"]
WALL, SH_LEN, OVER = 1.5, 14.0, 4.0
kit = Kit("xt60h")
Z = H / 2


def body_with_seat(parts):
    """Cut the rear of the body down to the sheath's inner profile so the sheath sits flush."""
    body, col = parts["body"]
    keep = prism(W - 2 * WALL, H - 2 * WALL, max(CH - WALL, 0.3), -L - 0.1, -L + OVER)
    ring = prism(W + 1, H + 1, CH, -L - 0.1, -L + OVER).cut(keep)
    # the overlap region only: remove the body's outer skin there; the sheath replaces it
    body = body.cut(ring)
    # a thin retaining groove just in front of the seat
    return {**parts, "body": (body, col)}


def sheath():
    x0, x1 = -L + OVER, -L + OVER - SH_LEN
    outer = soften(prism(W, H, CH, x1, x0), 0.25)
    inner = prism(W - 2 * WALL, H - 2 * WALL, max(CH - WALL, 0.3), x1 + WALL, x0)
    s = outer.cut(inner)
    # rear wire aperture
    s = s.cut(cq.Workplane("YZ", origin=(x1 - 0.1, 0, 0)).rect(W - 2 * WALL - 1.0, H - 2 * WALL - 0.4).extrude(WALL + 0.2).edges("|X").fillet(1.1))
    # grip grooves across the top and down both sides, and a thumb rest ramp
    for k in range(5):
        xg = x1 + 3.0 + k * 1.6
        s = s.cut(cq.Workplane("XY").box(0.55, W - 2 * CH - 0.8, 0.5).translate((xg, 0, H / 2 - 0.1)))
        s = s.cut(cq.Workplane("XY").box(0.55, W + 1, 0.5).translate((xg, 0, -H / 2 + 0.1)))
    for sy in (-1, 1):
        s = s.cut(cq.Workplane("XY").box(SH_LEN * 0.45, 0.9, 3.0).translate((x1 + SH_LEN * 0.55, sy * W / 2, -0.4)))
    return s


M, F = body_with_seat(male(P)), body_with_seat(female(P))
SHEATH = sheath()


def lead_parts(length=15.0, flip=False):
    """Short 14 AWG silicone leads (red, black) leaving the sheath's rear aperture, with stripped tinned ends."""
    x1 = -L + OVER - SH_LEN
    out = {}
    sgn = -1 if flip else 1  # a turned plug keeps red on the same physical side
    for key, y, col in (("red", sgn * P["pitch"] / 2, "#c4181e"), ("black", -sgn * P["pitch"] / 2, "#18191b")):
        out[f"{key}_jacket"] = (cyl((x1 + 3.0, y, 0), (-1, 0, 0), 1.5, length + 3.0), col)
        for k, st in enumerate(strand_end(np.array([x1 - length, y, 0.0]), np.array([-1.0, 0, 0]), 0.95, 5.0, rng)):
            out[f"{key}_strand{k}"] = (st, "#c9ccd1")
    return out


def plug(parts, name, origin, yaw, flip=False):
    add_plug(kit, parts, name, origin, yaw, flip=flip)
    add_plug(kit, {"sheath": (SHEATH, YELLOW)}, name, origin, yaw, flip=flip)
    add_plug(kit, lead_parts(flip=flip), name, origin, yaw, flip=flip)


plug(M, "mated_m", (0.0, 26.0, Z), 0.0)
plug(F, "mated_f", (0.0, 26.0, Z), 0.0, flip=True)
yaw = -90.0
plug(M, "loose_m", (-15.5, -22.0, Z), yaw + 5.0)
plug(F, "loose_f", (15.5, -21.0, Z), yaw - 4.0)
# a spare sheath on its side
add_plug(kit, {"sheath": (SHEATH, YELLOW)}, "spare", (62.0, -4.0, W / 2), 25.0, roll_deg=90.0)
kit.export("xt60h")
