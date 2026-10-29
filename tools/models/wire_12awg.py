"""12 AWG silicone wire, BNTECHGO style: 10 ft (3048 mm) red and 10 ft black, as two loose coils.

12 AWG tinned stranded copper (about 680 x 0.08 mm strands, 2.3 mm over the strands) in a soft silicone
jacket, 4.0 mm over the jacket. Each wire is one continuous sweep of exactly 3048 mm: 7 turns coiled
into a bundle with a nylon cable tie, with a straight tail at each end stripped 12 mm to bare tinned strands.
The coils stand on their edge. Front faces -y.
"""
import math
import random

import numpy as np

from wiring_common import *

OD, COND_R, STRIP = 4.0, 1.15, 12.0
LEN = 10 * 304.8
N, PITCH = 7, 4.25
TAIL = 85.0

kit = Kit("wire_12awg")
rng = random.Random(12)


def coil(name, color, centre, ccw, rot_z, seed):
    a = (0, -1, 0)  # pitch advances toward the viewer
    e1 = (1, 0, 0)
    kw = dict(od=OD, C=(0, 0, 0), a=a, e1=e1, N=N, pitch=PITCH, phi0=-math.pi / 2, ccw=ccw,
              tail=TAIL, strip=STRIP, d_out=(40, 40), drop=(0, 0), wobble=1.2, seed=seed, lat=((0, 1, 0), (0, -1, 0)))
    R = solve_radius(LEN, **kw)
    kw["C"] = (0, 0, R + OD / 2)
    pts = coil_wire(R=R, **kw)
    # rotate about z and move
    c, s = math.cos(rot_z), math.sin(rot_z)
    Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    pts = [Rz @ p + np.asarray(centre) for p in pts]
    wire_with_ends(pts, OD, STRIP, COND_R, color, name, kit, rng)
    C = Rz @ np.array(kw["C"]) + np.asarray(centre)
    for k, phi in enumerate((0.75, math.pi + 0.55)):
        zip_tie(C, Rz @ np.array(kw["a"] if "a" in kw else a), Rz @ np.array(e1), R, N * PITCH, OD, phi, "#ecebe6", kit, name="tie")
    return R, Rz, kw


Rr, Rz, kw = coil("red", "#c4181e", (0, 0, 0), +1, math.radians(0), 1.0)
Rb, Rz2, kw2 = coil("black", "#18191b", (34, 38, 0), +1, math.radians(-7), 2.4)
print("coil radius", Rr, Rb)
kit.export("wire-12awg")
