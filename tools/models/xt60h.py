"""Amass XT60H male and female with their back covers: one mated pair, one separate pair and a spare cover.

Rebuilt from Amass' outline drawings (catalogue p. 15, see amass_xt.py for each number and its source): face
9.20 x 16.40 mm with the polarity chamfers on one short end and rounded corners on the other, male 23.85 mm and
female 24.95 mm overall. The male is a yellow shroud with a key rib round two recessed contacts; the female's plug
slides into it. Each carries the grey back cover with three grip slots, as in Amass' photos. Short 14 AWG leads
are soldered in. Lying on the table, mated pair behind, loose pair in front with both mating faces toward the
viewer, a spare cover on its side. Front faces -y.
"""
import random

import numpy as np

from amass_xt import *
from wiring_common import Kit, cyl, strand_end

p = XT60H
rng = random.Random(60)
kit = Kit("xt60h")
Z = p["FACE_Z"] / 2
M, F = xt60h_male(), xt60h_female()


def leads(total_len, length=15.0):
    out = {}
    for key, y, col in (("red", p["PITCH"] / 2, "#c4181e"), ("black", -p["PITCH"] / 2, "#18191b")):
        out[f"{key}_jacket"] = (cyl((-total_len + 3.0, y, 0), (-1, 0, 0), 1.5, length + 3.0), col)
        for k, st in enumerate(strand_end(np.array([-total_len - length, y, 0.0]), np.array([-1.0, 0, 0]), 0.95, 5.0, rng)):
            out[f"{key}_strand{k}"] = (st, "#c9ccd1")
    return out


def plug(parts, total, name, origin, yaw, flip=False, shift=0.0):
    add_plug(kit, parts, name, origin, yaw, flip=flip, shift=shift)
    add_plug(kit, leads(total), name, origin, yaw, flip=flip, shift=shift)


plug(M, p["M_LEN"], "mated_m", (6.0, 30.0, Z), 0.0)
plug(F, p["F_LEN"], "mated_f", (6.0, 30.0, Z), 0.0, flip=True, shift=-p["CAVITY"])
plug(M, p["M_LEN"], "loose_m", (-11.5, -30.0, Z), -90.0 + 5.0)
plug(F, p["F_LEN"], "loose_f", (11.5, -29.0, Z), -90.0 - 4.0)
# a spare cover on its side, aperture toward the viewer
spare = {"cover": (cover(p, -p["COVER_LEN"], 0.0), COVER_GREY)}
for key, (sh, col) in spare.items():
    s = sh.val().rotate((0, 0, 0), (1, 0, 0), 90.0).rotate((0, 0, 0), (0, 0, 1), 25.0).translate((48.0, 2.0, p["FACE_Y"] / 2))
    kit.add(s, "spare_cover", col)
kit.export("xt60h")
