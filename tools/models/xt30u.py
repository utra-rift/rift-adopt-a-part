"""Amass XT30U male and female pairs (the 20-pair pack): one mated pair and one separate pair.

Rebuilt from Amass' outline drawings (catalogue p. 9, see amass_xt.py for each number and its source): body face
10.20 x 5.60 mm with the polarity chamfers at one short end, male 13.70 mm over the solder cups with a hollow
shell round two 2.0 mm pins at 5.0 mm pitch, female 12.40 mm with two 3.8 mm barrels joined by a web that slide
into the male shell. Yellow nylon, gold-plated contacts. Lying on the table, mated pair behind, loose pair in front
with both mating faces toward the viewer. Front faces -y.
"""
from amass_xt import *
from wiring_common import Kit

p = XT30U
kit = Kit("xt30u")
Z = p["FACE_Z"] / 2
M, F = xt30u_male(), xt30u_female()

# mated pair along x: the female's barrels sit inside the male's shell
add_plug(kit, M, "mated_m", (4.0, 17.0, Z), 0.0)
add_plug(kit, F, "mated_f", (4.0, 17.0, Z), 0.0, flip=True, shift=-p["F_BARREL"])
# loose pair: both mating faces toward the viewer (-y), side by side, a little askew
add_plug(kit, M, "loose_m", (-8.0, -9.0, Z), -90.0 + 6.0)
add_plug(kit, F, "loose_f", (8.0, -8.0, Z), -90.0 - 5.0)
kit.export("xt30u")
