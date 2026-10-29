"""Amass XT30U male and female pairs (the 20-pair pack): one mated pair and one separate pair.

XT30U: nylon body 10.0 x 5.0 mm with polarity chamfers, 2.0 mm gold-plated contacts at 5.0 mm pitch, short
solder cups. Male body 10.6 mm plus 5.0 mm of pin, female the same length with matching sockets; a 0.6 mm
boss on the male nests in a recess in the female. Lying on the table, mated pair behind, loose pair in front
with both mating faces toward the viewer. Front faces -y.
"""
import math

from amass_xt import *
from wiring_common import Kit

P = dict(W=10.0, H=5.0, ch=1.3, L=10.6, pitch=5.0, pin_d=2.0, pin_len=5.0, boss_h=0.7, boss_in=0.9, cup_d=3.0, cup_out=3.6)
kit = Kit("xt30u")
Z = P["H"] / 2

M, F = male(P), female(P)
# mated pair, along x, male on the left; the female is turned about z to face it
add_plug(kit, M, "mated_m", (0.0, 18.0, Z), 0.0)
add_plug(kit, F, "mated_f", (0.0, 18.0, Z), 0.0, flip=True)
# loose pair: both mating faces toward the viewer (-y), side by side, a little askew
yaw = -90.0
add_plug(kit, M, "loose_m", (-9.5, -10.0, Z), yaw + 6.0)
add_plug(kit, F, "loose_f", (9.5, -9.0, Z), yaw - 5.0)
kit.export("xt30u")
