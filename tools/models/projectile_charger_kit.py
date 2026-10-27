"""RoboMaster 17 mm fluorescent projectile charger kit, laid out flat: one LED driver + two UV panels.

Both STEP files are the official RoboMaster downloads, placed unchanged (rigid moves only):
  driver   LED_Driver.STEP as drawn: board flat, components up, XT30 lead toward -y
  panels   UV_Light_Panel.STEP rotated -90° about x so the LEDs face up and the lead runs
           toward -y like the driver's; fins down, resting on the same table as the driver.
Order from the back left: panel, panel, driver, 6 mm apart. Leaf names are kept and made unique
("driver/lead", "panel-a/lead", ...) so the part config can bend each lead.
"""
import pathlib

from OCP.BRep import BRep_Builder
from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_DocumentTool

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "cad/raw/projectile-charger"

DRIVER_TABLE_Z = -1.46  # underside of the XT30 plug, the driver's lowest point
PANEL_TABLE_Z = -7.0  # fin tips once the panel lies LEDs-up (source y = 7)
PANEL_W, GAP = 11.0, 6.0  # heat sink width; spacing between items


def solids(path):
    r = STEPControl_Reader()
    if r.ReadFile(str(path)) != IFSelect_RetDone:
        raise SystemExit(f"cannot read {path}")
    r.TransferRoots()
    exp, out = TopExp_Explorer(r.OneShape(), TopAbs_SOLID), []
    while exp.More():
        out.append(exp.Current())
        exp.Next()
    return out


def bbox_key(s):
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    b = Bnd_Box()
    BRepBndLib.Add_s(s, b)
    return b.Get()


app = XCAFApp_Application.GetApplication_s()
doc = TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))
app.InitDocument(doc)
tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())


def add(shape, trsf, name):
    label = tool.AddShape(shape.Moved(TopLoc_Location(trsf)), False)
    TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))


# Driver: the XT30 lead (wires + plug) is the one solid reaching past the board's -y edge.
for i, s in enumerate(solids(RAW / "LED_Driver.STEP")):
    ymin = bbox_key(s)[1]
    add(s, gp_Trsf(), "driver/lead" if ymin < -10 else f"driver/{i}")

# Panels: heat sink (spans y -3..7), LED board (thin, y -5..-3), lead + 2-pin plug (reaches z -35.8).
panel = {}
for s in solids(RAW / "UV_Light_Panel.STEP"):
    x0, y0, z0, x1, y1, z1 = bbox_key(s)
    panel["lead" if z0 < -30 else "heatsink" if y1 > 5 else "board"] = s
assert len(panel) == 3, panel.keys()

for k, name in enumerate(["panel-a", "panel-b"]):
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), -1.5707963267948966)
    move = gp_Trsf()
    x = -(k + 1) * (PANEL_W + GAP)
    move.SetTranslation(gp_Vec(x, 25.0 - 1.71, DRIVER_TABLE_Z - PANEL_TABLE_Z))  # heads level with the driver's
    t = move.Multiplied(t)
    for part, s in panel.items():
        add(s, t, f"{name}/{part}")

writer = STEPCAFControl_Writer()
writer.SetNameMode(True)
writer.Transfer(doc, STEPControl_AsIs)
writer.Write(str(ROOT / "cad/models/projectile-charger.step"))
