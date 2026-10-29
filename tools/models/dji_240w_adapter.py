"""DJI 240 W Power Adapter (CDX230-240): the desktop brick with its AC cord and its SDC output lead.

DJI publishes no CAD or drawing (see cad/raw/charger-240w/manifest.json), so this is modelled from DJI's product photos
and the product information sheet (cad/raw/dji-240w-adapter/):
  brick      132.6 x 72.4 x 36.5 mm (depth/height per retailer listing, width in proportion), black satin plastic, softly
             rounded, two-piece shell with a horizontal seam; a flush regulatory-label recess on the lid
  front end  SDC output (black frame, orange insert, two round power terminals and signal pins) and a USB-C port
  back end   IEC C8 (figure-8) AC inlet with two pins
  AC cord    C7 plug in the inlet, black cord, two-pin NEMA 1-15 wall plug (region plugs differ) lying on the table
  DC lead    SDC plug mated in the SDC port, black cable, a second SDC plug lying on the table (the one that goes to the hub)
Pose: the brick lies on its large face, ports end toward -y (the front, camera left), AC end at +y. Origin: brick centre on
the table plane z = 0, x across, y along.
"""
import math
import os
import random

import cadquery as cq

from pcbkit_a8 import *  # noqa: F401,F403

K = Kit()
rng = random.Random(240)
W, D, H = 72.4, 132.6, 36.5
SEAM_Z = 15.5
FRONT_Y, BACK_Y = -D / 2, D / 2

# ---------------------------------------------------------------- shell
body = box(0, 0, 0, W, D, H, 9.0)
body = body.faces(">Z").edges().fillet(4.5).faces("<Z").edges().fillet(2.5)
# two-piece shell: a narrow groove all round at the seam height
foot = lambda inset: box(0, 0, SEAM_Z - 0.35, W - 2 * inset, D - 2 * inset, 0.7, max(9.0 - inset, 1.0))
body = body.cut(foot(-1.0).cut(foot(0.55)))
K.add("shell", body)
# lid flange line just under the seam: a faint step is the seam itself; add the lower rim lip as a thin plate
K.add("shell", foot(0.55).translate((0, 0, 0)).cut(foot(2.2)) if False else None)
# label recess on the lid with a generic rule layout and a QR-like block (no text)
LAB_Y = 10.0
K.add("labelrim", box(0, LAB_Y, H - 0.02, 54.0, 36.0, 0.12, 1.5).cut(box(0, LAB_Y, H - 0.03, 53.0, 35.0, 0.2, 1.2)))
for k in range(5):
    K.add("labelrim", box(-6.0, LAB_Y + 12.0 - k * 4.4, H + 0.09, 30.0 if k % 2 == 0 else 22.0, 0.5, 0.1))
qr = random.Random(7)
for i in range(9):
    for j in range(9):
        if qr.random() < 0.5 or (i < 3 and j < 3) or (i > 5 and j < 3) or (i < 3 and j > 5):
            K.add("labelrim", box(15.0 + (i - 4) * 1.3, LAB_Y + (j - 4) * 1.3 + 0.0, H + 0.09, 1.1, 1.1, 0.1))
# four corner screw covers are not on the real brick; two flat vent-less feet outlines are on the underside only

# ---------------------------------------------------------------- front end: SDC and USB-C
ZC = 18.2  # port centre height
SDC_X, USB_X = -13.0, 20.5
# pockets (black bezels) cut into the shell
pocket_sdc = box(SDC_X, FRONT_Y + 6.0, ZC - 6.4, 26.0, 12.5, 12.8, 1.2)
pocket_usb = box(USB_X, FRONT_Y + 4.0, ZC - 2.2, 11.0, 8.5, 4.4, 2.0)
K.add("shell", None)
body2 = body.cut(pocket_sdc).cut(pocket_usb) if False else None
shell_cut = body.cut(pocket_sdc).cut(pocket_usb)
K.groups["shell"] = [shell_cut.val()] + [s for s in K.groups.get("shell", [])[1:]]
# bezels: a thin black frame at the mouth
K.add("bezel", box(SDC_X, FRONT_Y + 0.15, ZC - 6.9, 27.0, 0.0 + 1.2, 13.8, 1.3).cut(box(SDC_X, FRONT_Y + 0.1, ZC - 6.2, 24.6, 1.5, 12.4, 1.0)))
# SDC orange insert, recessed 3 mm, with two round power terminals and four signal pins
K.add("sdc", box(SDC_X, FRONT_Y + 4.0 + 3.0, ZC - 4.6, 23.0, 7.0, 9.2, 0.8))
for s in (-1, 1):
    K.add("terminal", cyl(0, 0, 0, 5.4, 9.0).rotate((0, 0, 0), (1, 0, 0), 90).translate((SDC_X + s * 6.0, FRONT_Y + 6.2 + 0.0, ZC - 1.8)))
    K.add("gold", ring(0, 0, 0, 5.8, 3.4, 1.0).rotate((0, 0, 0), (1, 0, 0), 90).translate((SDC_X + s * 6.0, FRONT_Y + 3.4, ZC - 1.8)))
for k in range(4):
    K.add("gold", cyl(0, 0, 0, 1.6, 6.0).rotate((0, 0, 0), (1, 0, 0), 90).translate((SDC_X - 4.5 + k * 3.0, FRONT_Y + 5.0 + 3.0, ZC + 2.6)))
# a polarising rib in the insert
K.add("bezel", box(SDC_X, FRONT_Y + 9.5, ZC - 4.6 + 9.2, 4.0, 3.2, 1.0))
# USB-C: metal shell lip, black tongue, 12 + 12 contacts as two rows of fine ribs
K.add("terminal", box(USB_X, FRONT_Y + 0.2, ZC - 2.5, 9.2, 0.6, 5.0, 2.4).cut(box(USB_X, FRONT_Y + 0.1, ZC - 1.6, 8.0, 1.0, 3.2, 1.5)))
K.add("bezel", box(USB_X, FRONT_Y + 6.0, ZC - 0.35, 6.6, 6.5, 0.7))
for k in range(12):
    K.add("gold", box(USB_X - 3.0 + k * 0.55, FRONT_Y + 3.0, ZC + 0.35, 0.28, 3.0, 0.04))
    K.add("gold", box(USB_X - 3.0 + k * 0.55, FRONT_Y + 3.0, ZC - 0.39, 0.28, 3.0, 0.04))
# two tiny status marks are not on this brick: instead the small screw-less cover lines along the end face edge
K.add("bezel", box(0, FRONT_Y + 0.05, SEAM_Z - 0.2, W - 20.0, 0.1, 0.4))

# ---------------------------------------------------------------- back end: IEC C8 inlet
INX, INZ = 0.0, ZC
inlet_pocket = figure8(INX, BACK_Y - 1.0, INZ - 6.9, 14.0, 13.8, 9.0).rotate((INX, BACK_Y, 0), (INX, BACK_Y, 1), 0)
# the figure-8 lies in the xz plane: build in xy then stand it up
f8 = figure8(0, 0, 0, 14.0, 13.8, 9.0)
f8 = f8.rotate((0, 0, 0), (1, 0, 0), 90)  # now extrudes along -y
f8 = f8.translate((INX, BACK_Y + 0.5, INZ))
shell_cut = K.groups["shell"][0]
shell_cut = wp(shell_cut).cut(f8)
K.groups["shell"][0] = shell_cut.val()
rim = figure8(0, 0, 0, 1.0, 14.8, 9.0).cut(figure8(0, 0, -0.1, 1.3, 13.8, 9.0))
K.add("bezel", rim.rotate((0, 0, 0), (1, 0, 0), 90).translate((INX, BACK_Y + 0.55, INZ)))
for s in (-1, 1):
    K.add("terminal", cyl(0, 0, 0, 4.0, 8.0).rotate((0, 0, 0), (1, 0, 0), 90).translate((INX + s * 4.5, BACK_Y - 3.0, INZ)))

# ---------------------------------------------------------------- feet are on the underside; add four small standoff rings visible at the edge
for (x, y) in [(-26, -52), (26, -52), (-26, 52), (26, 52)]:
    K.add("rubber", cyl(x, y, 0.0, 12.0, 0.6))
# generic regulatory marks (plain shapes, no text) along the lower edge of the label
for k in range(6):
    K.add("labelrim", cyl(-22.0 + k * 3.8, LAB_Y - 14.5, H + 0.09, 2.2, 0.1))
    K.add("labelrim", prism([(-22.0 + k * 3.8 + 12.0 - 1.0, LAB_Y - 15.5), (-22.0 + k * 3.8 + 12.0 + 1.0, LAB_Y - 15.5), (-22.0 + k * 3.8 + 12.0, LAB_Y - 13.5)], H + 0.09, 0.1)) if k % 2 == 0 else None

# ---------------------------------------------------------------- AC cord (C7 plug in the back inlet) and wall plug
def along(shape, x, y, z, heading):
    return wp(shape).rotate((0, 0, 0), (0, 0, 1), heading).translate((x, y, z))


C7_Y0 = BACK_Y - 0.5  # plug body starts here (nose inside the inlet)
# C7 body: moulded 26 long x 25 wide x 15 tall with grip ridges, a nose that is the figure-8 and a tapered strain relief
nose = figure8(0, 0, 0, 10.0, 13.0, 8.6).rotate((0, 0, 0), (1, 0, 0), 90).translate((0, 9.0, 0))  # y from -1 to 9, inside the inlet
K.add("c7", nose.translate((INX, BACK_Y - 9.5, INZ)).translate((0, 0, 0)))
c7 = box(0, 0, 0, 24.0, 24.0, 17.0, 3.0).faces(">Z or <Z").edges().fillet(1.8)
K.add("c7", c7.translate((INX, BACK_Y + 12.0 + 0.5, INZ - 8.5)))
for k in range(5):  # grip ridges across the sides
    for s in (-1, 1):
        K.add("c7", box(INX + s * 12.3, BACK_Y + 5.5 + k * 3.6, INZ - 5.0, 0.6, 1.4, 10.0))
srb = lathe([(0, 0), (6.5, 0), (5.2, 6), (3.6, 14), (2.8, 17), (0, 17)]).rotate((0, 0, 0), (1, 0, 0), -90)
K.add("c7", srb.translate((INX, BACK_Y + 24.5, INZ)))
cord_pts, (ex, ey), eh = lay_lead((INX, BACK_Y + 24.5 + 17.0), 90.0, INZ, 2.75, drop=22.0, run=6.0, loop_len=60.0, theta_deg=-130.0, tail=16.0, hold=3.0)
K.add("cord", cable(cord_pts, 2.75))
# NEMA 1-15 plug at the end of the cord, lying on the table: moulded body + two blades
plug = box(0, 0, 0, 30.0, 25.0, 15.0, 3.0).faces(">Z or <Z").edges().fillet(2.0)
K.add("c7", along(plug.translate((20.0, 0, 7.5)), ex, ey, 0.0, eh))
for k in range(4):
    K.add("c7", along(box(0, 0, 0, 1.4, 25.2, 9.0).translate((9.0 + k * 3.6, 0, 3.0)), ex, ey, 0.0, eh))
sr = lathe([(0, 0), (4.5, 0), (3.4, 5), (2.75, 8), (0, 8)]).rotate((0, 0, 0), (0, 1, 0), 90)
K.add("c7", along(sr.translate((4.0, 0, 7.5)), ex, ey, 0.0, eh))
for s in (-1, 1):
    K.add("blade", along(box(0, 0, 0, 16.0, 1.6, 6.4).translate((35.0 + 8.0, s * 6.35, 7.5 - 3.2)), ex, ey, 0.0, eh))
    K.add("blade", along(box(0, 0, 0, 3.0, 4.4, 6.4).translate((35.0 + 1.5, s * 6.35, 7.5 - 3.2)), ex, ey, 0.0, eh))
    K.add("blade", along(box(0, 0, 0, 14.0, 1.6, 0.0 + 0.3).translate((35.0 + 8.0, s * 6.35, 7.5 + 3.0)), ex, ey, 0.0, eh))

# ---------------------------------------------------------------- DC lead: SDC plug in the port, cable, second SDC plug on the table
def sdc_plug():
    """SDC plug along +x with its mating face at x = 0 pointing -x? built: nose toward +x. Housing black, orange insert, rear boot."""
    housing = box(0, 0, 0, 30.0, 25.0, 12.4, 1.8)  # along x: length 30
    body_ = housing.translate((15.0, 0, 0))
    return body_


SDC_PLUG_L = 34.0
# plug mated: nose goes into the pocket (2 mm in the bezel), housing sticks out toward -y
ph = box(0, 0, 0, 25.0, SDC_PLUG_L, 12.4, 1.6).translate((SDC_X, FRONT_Y - SDC_PLUG_L / 2 + 1.0, ZC - 6.2))
K.add("sdcplug", ph)
for k in range(8):  # grip ribs on both faces
    K.add("sdcplug", box(SDC_X, FRONT_Y - 5.0 - k * 2.6, ZC + 6.2, 18.0, 1.0, 0.5))
K.add("sdc", box(SDC_X, FRONT_Y - SDC_PLUG_L + 1.0 + 6.0 + 0.0, ZC - 6.3, 8.0, 12.0, 0.4)) if False else None
K.add("sdc", box(SDC_X - 12.6, FRONT_Y - 14.0, ZC - 2.5, 0.5, 8.0, 5.0))  # orange detent tabs seen on the plug sides
K.add("sdc", box(SDC_X + 12.6, FRONT_Y - 14.0, ZC - 2.5, 0.5, 8.0, 5.0))
boot = lathe([(0, 0), (6.8, 0), (5.2, 6), (3.6, 13), (3.0, 16), (0, 16)]).rotate((0, 0, 0), (1, 0, 0), 90)
K.add("sdcplug", boot.translate((SDC_X, FRONT_Y - SDC_PLUG_L + 1.0, ZC)))
dc_pts, (dx_, dy_), dh = lay_lead((SDC_X, FRONT_Y - SDC_PLUG_L + 1.0 - 16.0), -90.0, ZC, 3.0, drop=20.0, run=4.0, loop_len=60.0, theta_deg=120.0, tail=16.0, hold=3.0)
K.add("cord", cable(dc_pts, 3.0))
# the free SDC plug at the end, lying on the table
fp = box(0, 0, 0, SDC_PLUG_L, 25.0, 12.4, 1.6).translate((SDC_PLUG_L / 2 + 12.0, 0, 0))
K.add("sdcplug", along(fp, dx_, dy_, 0.0, dh))
fb = lathe([(0, 0), (6.8, 0), (5.2, 6), (3.6, 13), (3.0, 16), (0, 16)]).rotate((0, 0, 0), (0, 1, 0), 90)
K.add("sdcplug", along(fb.translate((0, 0, 6.2)), dx_, dy_, 0.0, dh))
K.add("sdc", along(box(0, 0, 0, 10.0, 22.0, 9.0, 0.6).translate((12.0 + SDC_PLUG_L + 3.0, 0, 1.6)), dx_, dy_, 0.0, dh))
for s in (-1, 1):
    K.add("terminal", along(cyl(0, 0, 0, 5.4, 6.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((12.0 + SDC_PLUG_L + 3.0, s * 6.0, 4.4)), dx_, dy_, 0.0, dh))
for k in range(4):
    K.add("gold", along(cyl(0, 0, 0, 1.6, 5.0).rotate((0, 0, 0), (0, 1, 0), 90).translate((12.0 + SDC_PLUG_L + 3.0, -4.5 + k * 3.0, 8.4)), dx_, dy_, 0.0, dh))
for k in range(8):
    K.add("sdcplug", along(box(0, 0, 0, 1.0, 18.0, 0.5).translate((12.0 + 6.0 + k * 2.6, 0, 12.4)), dx_, dy_, 0.0, dh))

# ---------------------------------------------------------------- pose and export
final = Kit()
bb0 = K.bbox()
cx0, cy0 = (bb0.xmin + bb0.xmax) / 2, (bb0.ymin + bb0.ymax) / 2
ROT = float(os.environ.get("ROT", "0"))
for g, shapes in K.groups.items():
    final.add(g, [wp(s).translate((-cx0, -cy0, 0)).rotate((0, 0, 0), (0, 0, 1), ROT) for s in shapes])
n = final.export(ROOT / "cad/models/dji-240w-adapter.step", "dji_240w_adapter")
bb = final.bbox()
print(f"{n} solids; {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
