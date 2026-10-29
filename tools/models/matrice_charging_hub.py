"""DJI Matrice 4D Series 240 W Charging Hub (CHX230-240): three battery docks on a long low bar, with its SDC power lead.

DJI publishes no CAD or dimensions (see cad/raw/charge-manager-240w/manifest.json), so this is modelled from DJI's user guide
line drawing (cad/raw/matrice-charging-hub/hub0.png) and product photos; the 305 x 103 x 41 mm envelope is the retailer
listing (unverified), the dock pitch follows the battery's 96 mm width (matrice-4d-battery STEP):
  bar        305 x 103 x 28 mm light grey matte plastic, two-piece shell (seam), fillets, front vent grilles
  docks      three raised plinths 94 x 78 mm (to 41 mm), each with a recessed channel, a nine-contact battery port (gold
             spring contacts in a slot), two locating pins, side latch notches and rubber pads
  right end  status LED, mode switch, SDC power port (orange insert, two round terminals) with the lead plugged in
  left end   USB-C assistant port
  lead       SDC cable, plug mated, loosely curled, second plug lying on the table (to the adapter)
Pose: bar along x, front (battery cap ends / vents) toward -y, power end at +x. Origin: centre of the bar on the table plane.
"""
import math
import os

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
L, D, H0 = 305.0, 103.0, 28.0
HT = 41.0
DOCK_X = [-100.0, 0.0, 100.0]
DOCK_W, DOCK_Y0, DOCK_Y1 = 94.0, -36.0, 40.0
SEAM = 13.0

# ---------------------------------------------------------------- bar
bar = box(0, 0, 0, L, D, H0, 13.0).faces(">Z").edges().fillet(5.0).faces("<Z").edges().fillet(2.5)
ring_cut = lambda ins: box(0, 0, SEAM - 0.4, L - 2 * ins, D - 2 * ins, 0.8, max(13.0 - ins, 1.0))
bar = bar.cut(ring_cut(-1.0).cut(ring_cut(0.6)))
# docks
for dx in DOCK_X:
    plinth = boxc(dx - DOCK_W / 2, DOCK_Y0, H0 - 2.0, dx + DOCK_W / 2, DOCK_Y1, HT, 5.0).faces(">Z").edges().fillet(2.5)
    bar = bar.union(plinth)
K.add("shell", bar)

# ---------------------------------------------------------------- dock detail (cuts and parts)
cuts = []
for dx in DOCK_X:
    cuts.append(boxc(dx - 36.0, DOCK_Y0 + 10.0, HT - 3.0, dx + 36.0, DOCK_Y1 - 6.0, HT + 1.0, 3.0))  # channel the battery sits in
    # latch notches in both side walls
    for s in (-1, 1):
        cuts.append(box(dx + s * DOCK_W / 2, -2.0, HT - 7.5, 8.0, 14.0, 8.0, 1.5))
    # front vents: ten vertical slots in the plinth's front wall
    for k in range(10):
        cuts.append(box(dx - 16.0 + k * 3.55, DOCK_Y0 + 1.2, H0 + 2.5, 1.6, 6.0, 8.0, 0.6))
    # a thumb scoop on the front edge of the channel
    cuts.append(box(dx, DOCK_Y0 + 9.0, HT - 4.0, 24.0, 10.0, 5.0, 4.0))
shell = K.groups["shell"][0]
shell = wp(shell).cut(union(cuts))
K.groups["shell"][0] = shell.val()
cut_floor = HT - 3.0

for dx in DOCK_X:
    z = cut_floor
    # nine-contact battery port: dark housing in a slot, nine gold spring contacts across it
    K.add("port", boxc(dx - 26.0, DOCK_Y0 + 14.0, z, dx + 26.0, DOCK_Y0 + 28.0, z + 5.0, 1.0).cut(boxc(dx - 23.0, DOCK_Y0 + 15.0, z + 2.0, dx + 23.0, DOCK_Y0 + 27.0, z + 6.0, 0.5)))
    for k in range(9):
        x = dx - 20.0 + k * 5.0
        K.add("gold", box(x, DOCK_Y0 + 21.0, z + 1.6, 2.0, 9.0, 0.5))
        K.add("gold", box(x, DOCK_Y0 + 25.5, z + 2.0, 2.0, 1.2, 1.2))
    # slot ribs between contacts
    for k in range(10):
        K.add("port", box(dx - 22.5 + k * 5.0, DOCK_Y0 + 21.0, z + 2.0, 0.8, 11.0, 1.4))
    # two locating pins (steel) and their collars
    for s in (-1, 1):
        K.add("steel", cyl(dx + s * 30.0, DOCK_Y0 + 21.0, z, 5.0, 7.5).faces(">Z").edges().chamfer(0.8))
        K.add("port", ring(dx + s * 30.0, DOCK_Y0 + 21.0, z, 8.0, 5.0, 1.0))
    # rubber pads on the channel floor
    for (px, py) in [(-24.0, 12.0), (24.0, 12.0), (-24.0, 30.0), (24.0, 30.0)]:
        K.add("rubber", cyl(dx + px, DOCK_Y0 + py + 12.0, z, 9.0, 0.8))
    # latch pawls inside the notches
    for s in (-1, 1):
        K.add("port", box(dx + s * (DOCK_W / 2 - 3.5), -2.0, HT - 7.0, 2.6, 10.0, 5.0, 0.8))
        K.add("steel", box(dx + s * (DOCK_W / 2 - 3.5 + (-1) * 0), -2.0 + 5.0, HT - 5.0, 0.6, 2.0, 2.0))
    # screws on the plinth's top rim (rear)
    for s in (-1, 1):
        K.add("steel", pan_screw(dx + s * 41.0, DOCK_Y1 - 3.0, HT, 4.2, 1.2))

# screws between the docks on the base slab
for x in (-50.0, 50.0):
    for y in (-41.0, 41.0):
        K.add("steel", pan_screw(x, y, H0 - 0.1, 4.6, 1.3))

# front grille under each dock on the slab's front face: slots cut as thin dark inlays
for dx in DOCK_X:
    for k in range(9):
        K.add("bezel", box(dx - 16.0 + k * 4.0, -D / 2 + 0.05, 3.5, 1.6, 0.2, 7.0, 0.5))

# ---------------------------------------------------------------- end faces
ZC = 14.0
RX = L / 2  # right end face (power end)
# LED, mode switch, SDC port on the +x face, USB-C on the -x face
K.add("bezel", box(0, 0, 0, 0.3, 12.0, 4.0, 1.5).translate((RX - 0.1, 30.0, 22.0)))
K.add("ledg", box(0, 0, 0, 0.5, 9.0, 1.6, 0.8).translate((RX - 0.3, 30.0, 23.2)))
K.add("bezel", box(0, 0, 0, 0.4, 18.0, 7.0, 2.5).translate((RX - 0.1, 12.0, 20.0)))  # switch recess
K.add("steel", box(0, 0, 0, 3.2, 5.0, 4.2, 1.0).translate((RX - 0.2, 8.5, 21.4)))  # slide knob
for k in range(3):
    K.add("bezel", box(0, 0, 0, 0.3, 0.4, 3.0).translate((RX - 0.1, 15.5 + k * 1.8, 22.0)))
SDCY = -26.0
pocket = box(0, 0, 0, 12.0, 26.0, 12.6, 1.2).translate((RX - 5.5, SDCY, ZC - 6.3))
shell = wp(K.groups["shell"][0]).cut(pocket)
K.groups["shell"][0] = shell.val()
K.add("bezel", box(0, 0, 0, 1.2, 27.0, 13.8, 1.3).translate((RX - 0.5, SDCY, ZC - 6.9)).cut(box(0, 0, 0, 1.6, 24.6, 12.4, 1.0).translate((RX - 0.5, SDCY, ZC - 6.2))))
K.add("sdc", box(0, 0, 0, 7.0, 23.0, 9.2, 0.8).translate((RX - 8.0, SDCY, ZC - 4.6)))
for s in (-1, 1):
    K.add("terminal", cyl(0, 0, 0, 5.4, 9.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((RX - 9.0, SDCY + s * 6.0, ZC - 1.8)))
for k in range(4):
    K.add("gold", cyl(0, 0, 0, 1.6, 6.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((RX - 7.0, SDCY - 4.5 + k * 3.0, ZC + 2.6)))
# USB-C assistant port on the left end
pocket = box(0, 0, 0, 8.0, 9.2, 3.4, 1.6).translate((-RX + 4.0, 0.0, ZC - 1.7))
shell = wp(K.groups["shell"][0]).cut(pocket)
K.groups["shell"][0] = shell.val()
K.add("terminal", box(0, 0, 0, 0.6, 9.4, 3.8, 1.8).translate((-RX + 0.2, 0.0, ZC - 1.9)).cut(box(0, 0, 0, 1.0, 8.2, 2.6, 1.2).translate((-RX + 0.2, 0.0, ZC - 1.3))))
K.add("port", box(0, 0, 0, 5.0, 6.6, 0.7).translate((-RX + 5.0, 0.0, ZC - 0.35)))

# ---------------------------------------------------------------- SDC lead plugged into the power port, second plug on the table
PLUG_L = 34.0
ph = box(0, 0, 0, PLUG_L, 25.0, 12.4, 1.6).translate((RX + PLUG_L / 2 - 1.0, SDCY, ZC - 6.2))
K.add("sdcplug", ph)
for k in range(8):
    K.add("sdcplug", box(RX + 6.0 + k * 2.6, SDCY, ZC + 6.2, 1.0, 18.0, 0.5))
K.add("sdc", box(RX + 14.0, SDCY - 12.6, ZC - 2.5, 8.0, 0.5, 5.0))
K.add("sdc", box(RX + 14.0, SDCY + 12.6, ZC - 2.5, 8.0, 0.5, 5.0))
boot = lathe([(0, 0), (6.8, 0), (5.2, 6), (3.6, 13), (3.0, 16), (0, 16)]).rotate((0, 0, 0), (0, 1, 0), 90)
K.add("sdcplug", boot.translate((RX + PLUG_L - 1.0, SDCY, ZC)))
pts, (ex, ey), eh = lay_lead((RX + PLUG_L - 1.0 + 16.0, SDCY), 0.0, ZC, 3.0, drop=22.0, run=4.0, loop_len=70.0, theta_deg=-110.0, tail=16.0, hold=3.0)
K.add("cord", cable(pts, 3.0))


def along(shape, x, y, z, heading):
    return wp(shape).rotate((0, 0, 0), (0, 0, 1), heading).translate((x, y, z))


fp = box(0, 0, 0, PLUG_L, 25.0, 12.4, 1.6).translate((PLUG_L / 2 + 12.0, 0, 0))
K.add("sdcplug", along(fp, ex, ey, 0.0, eh))
fb = lathe([(0, 0), (6.8, 0), (5.2, 6), (3.6, 13), (3.0, 16), (0, 16)]).rotate((0, 0, 0), (0, 1, 0), 90)
K.add("sdcplug", along(fb.translate((0, 0, 6.2)), ex, ey, 0.0, eh))
K.add("sdc", along(box(0, 0, 0, 10.0, 22.0, 9.0, 0.6).translate((12.0 + PLUG_L + 3.0, 0, 1.6)), ex, ey, 0.0, eh))
for s in (-1, 1):
    K.add("terminal", along(cyl(0, 0, 0, 5.4, 6.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((12.0 + PLUG_L + 3.0, s * 6.0, 4.4)), ex, ey, 0.0, eh))
for k in range(4):
    K.add("gold", along(cyl(0, 0, 0, 1.6, 5.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((12.0 + PLUG_L + 3.0, -4.5 + k * 3.0, 8.4)), ex, ey, 0.0, eh))
for k in range(8):
    K.add("sdcplug", along(box(0, 0, 0, 1.0, 18.0, 0.5).translate((12.0 + 6.0 + k * 2.6, 0, 12.4)), ex, ey, 0.0, eh))

# ---------------------------------------------------------------- pose and export
final = Kit()
bb0 = K.bbox()
cx0, cy0 = (bb0.xmin + bb0.xmax) / 2, (bb0.ymin + bb0.ymax) / 2
ROT = float(os.environ.get("ROT", "0"))
for g, shapes in K.groups.items():
    final.add(g, [wp(s).translate((-cx0, -cy0, 0)).rotate((0, 0, 0), (0, 0, 1), ROT) for s in shapes])
n = final.export(ROOT / "cad/models/matrice-charging-hub.step", "matrice_charging_hub")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
