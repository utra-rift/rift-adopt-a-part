"""18 AWG silicone wire, BNTECHGO style: 25 ft (7620 mm) red and 25 ft black on two small hand spools.

18 AWG tinned stranded copper (about 150 x 0.08 mm strands, 1.25 mm over the strands) in a silicone jacket,
2.1 mm over the jacket. Spool: 62 mm flanges, 30 mm hub, 12 mm bore, 30 mm between the flanges; the winding's
outer radius comes from the wire volume (25 ft of 2.1 mm wire, hexagonal packing) so the winding is the real
amount of wire, drawn with every turn of the outer layer as its own ridge. The loose end of each wire runs off
the winding and is stripped 10 mm. Spools stand on their flange rims. Front faces -y.
"""
import math
import random

import numpy as np

from wiring_common import *

OD, COND_R, STRIP = 2.1, 0.62, 10.0
LEN = 25 * 304.8
kit = Kit("wire_18awg")
rng = random.Random(18)
sp = Spool(OD, LEN, hub_d=30.0, flange_d=62.0, width=30.0, bore_d=12.0)
print("winding top radius", sp.r_top)
FLANGE = "#e7e6e1"


def spool(name, colour, centre, yaw, tail_dir):
    # frame: axis -> y (toward the viewer), e1 -> x; origin at the spool's back flange
    a = np.array([0.0, -1.0, 0.0])
    e1 = np.array([1.0, 0.0, 0.0])
    c, s = math.cos(yaw), math.sin(yaw)
    Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    a, e1 = Rz @ a, Rz @ e1
    origin = np.array(centre, float)
    origin[2] = sp.flange_d / 2
    sp.build(kit, name, colour, FLANGE, origin, e1, a)
    # the tail leaves the top of the winding toward +/-x and drops to the table
    e2 = np.cross(a, e1)
    top = np.array([0.0, 0.0, 1.0])
    psi = math.atan2(np.dot(top, e2), np.dot(top, e1))  # angle of the top point in the spool's frame
    P, t, o = sp.tail_start(psi, origin, e1, a)
    if np.dot(t, np.array([1.0, 0, 0])) * tail_dir < 0:
        t = -t
    drop = P[2] - OD / 2
    lat = np.array([0.0, -1.0, 0.0])
    pts = tail_points(P, t, lat, np.array([0, 0, -1.0]), 75.0, 14.0, 55.0, drop, 50.0)
    free_tail(kit, name, colour, pts, OD, COND_R, STRIP, rng)


spool("red", "#c4181e", (-33.0, 0.0, 0.0), math.radians(-8), -1)
spool("black", "#18191b", (33.0, 12.0, 0.0), math.radians(10), +1)
kit.export("wire-18awg")
