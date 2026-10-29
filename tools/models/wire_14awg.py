"""14 AWG silicone wire, BNTECHGO style: 20 ft (6096 mm) red and 20 ft black, as two loose flat coils.

14 AWG tinned stranded copper (about 400 x 0.08 mm strands, 1.9 mm over the strands) in a soft silicone
jacket, 3.0 mm over the jacket. Each wire is one continuous sweep of exactly 6096 mm: 14 turns wound into a
bundle held by two cable ties, tails stripped 12 mm to bare tinned strands. The red coil lies on the black
one, turned about 50 degrees, and the tails fall to the table. Front faces -y.
"""
import math
import random

import numpy as np

from wiring_common import *

OD, COND_R, STRIP = 3.0, 0.95, 12.0
LEN = 20 * 304.8
N, PITCH = 14, 3.15
TAIL = 100.0
kit = Kit("wire_14awg")
rng = random.Random(14)
H = N * PITCH + OD  # height of one coil's top surface above its first turn's centre line + r

black_kw = dict(od=OD, C=(0, 0, OD / 2), a=(0, 0, 1), e1=(1, 0, 0), N=N, pitch=PITCH, phi0=-math.pi / 2, ccw=1,
                tail=TAIL, d_out=(22, 22), drop=(0, N * PITCH), wobble=1.5, seed=0.7)
Rb = solve_radius(LEN, **black_kw)
HR = H - 2.6  # the red coil's first turn rests on the black coil's highest turns
red_c = (13.0, -9.0, OD / 2 + HR)
red_kw = dict(od=OD, C=red_c, a=(0, 0, 1), e1=(1, 0, 0), N=N, pitch=PITCH, phi0=-math.pi / 2 + 0.95, ccw=1,
              tail=TAIL, d_out=(22, 22), drop=(HR, HR + N * PITCH), wobble=1.5, seed=2.1)
Rr = solve_radius(LEN, **red_kw)
black_pts = coil_wire(R=Rb, **black_kw)
red_pts = coil_wire(R=Rr, **red_kw)
print("radii", Rb, Rr, "gap", min_gap(black_pts, red_pts))

wire_with_ends(black_pts, OD, STRIP, COND_R, "#18191b", "black", kit, rng)
wire_with_ends(red_pts, OD, STRIP, COND_R, "#c4181e", "red", kit, rng)
for kw, R, tie_col in ((black_kw, Rb, "#ecebe6"), (red_kw, Rr, "#ecebe6")):
    for phi in (kw["phi0"] + 1.4, kw["phi0"] + 1.4 + math.pi):
        zip_tie(kw["C"], kw["a"], kw["e1"], R, N * PITCH, OD, phi, tie_col, kit, name="tie", width=4.0)
kit.export("wire-14awg")
