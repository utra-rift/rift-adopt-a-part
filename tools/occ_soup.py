"""Tessellate a STEP file with full OpenCascade (OCP) into a triangle soup the converter reads.

For files the WASM importer can't mesh (the Raspberry Pi 5 STEP). Keeps the assembly
names, per-face colours and B-rep face ids, like occt-import-js does.

    .venv/bin/python -I occ_soup.py <in.step> <out.soup> [deflection_ratio] [angular_rad]

Soup layout: b"SOUP" u32(headerBytes) header-json  f32 pos[T*9]  f32 nrm[T*9]  i32 face[T]  u16 colour[T]  u32 name[T]
"""
import json
import struct
import sys

import numpy as np
from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepLib import BRepLib_ToolTriangulatedShape
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_Color
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_ColorType, XCAFDoc_DocumentTool

src, out = sys.argv[1], sys.argv[2]
ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0008
angular = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3

doc = TDocStd_Document(TCollection_ExtendedString("doc"))
reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
if reader.ReadFile(src) != IFSelect_RetDone:
    sys.exit(f"cannot read {src}")
reader.Transfer(doc)
shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
colours = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())


def name_of(label):
    attr = TDataStd_Name()
    if label.FindAttribute(TDataStd_Name.GetID_s(), attr):
        return attr.Get().ToExtString()
    return ""


def colour_of(obj):
    c = Quantity_Color()
    get = colours.GetColor_s if isinstance(obj, TDF_Label) else colours.GetColor
    for kind in (XCAFDoc_ColorType.XCAFDoc_ColorSurf, XCAFDoc_ColorType.XCAFDoc_ColorGen):
        try:
            if get(obj, kind, c):
                return (c.Red(), c.Green(), c.Blue())
        except TypeError:
            return None
    return None


# Collect leaf shapes with their accumulated placement, path and inherited colour.
leaves = []


def walk(label, loc, path, inherited):
    here = f"{path}/{name_of(label)}" if path else name_of(label)
    own = colour_of(label) or inherited
    if shapes.IsAssembly_s(label):
        comps = TDF_LabelSequence()
        shapes.GetComponents_s(label, comps)
        for i in range(1, comps.Length() + 1):
            comp = comps.Value(i)
            ref = TDF_Label()
            shapes.GetReferredShape_s(comp, ref)
            walk(ref, loc.Multiplied(shapes.GetLocation_s(comp)), here, colour_of(comp) or own)
    else:
        leaves.append((shapes.GetShape_s(label), loc, here, own, label))


free = TDF_LabelSequence()
shapes.GetFreeShapes(free)
for i in range(1, free.Length() + 1):
    walk(free.Value(i), TopLoc_Location(), "", None)

box = Bnd_Box()
for shape, loc, *_ in leaves:
    BRepBndLib.Add_s(shape.Moved(loc), box)
xmin, ymin, zmin, xmax, ymax, zmax = box.Get()
diag = ((xmax - xmin) ** 2 + (ymax - ymin) ** 2 + (zmax - zmin) ** 2) ** 0.5
deflection = diag * ratio

pos, nrm, faces, cols, names = [], [], [], [], []
palette, pal_index, name_list = [], {}, []
face_id = 0
for index, (shape, loc, path, inherited, label) in enumerate(leaves):
    located = shape.Moved(loc)
    BRepMesh_IncrementalMesh(located, deflection, False, angular, True)
    name_list.append(f"{path}#{index}")
    exp = TopExp_Explorer(located, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face_s(exp.Current())
        exp.Next()
        floc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, floc)
        if tri is None:
            face_id += 1
            continue
        if not tri.HasNormals():
            BRepLib_ToolTriangulatedShape.ComputeNormals_s(face, tri)
        trsf = floc.Transformation()
        n = tri.NbNodes()
        P = np.empty((n, 3))
        N = np.empty((n, 3))
        for k in range(1, n + 1):
            p = tri.Node(k).Transformed(trsf)
            P[k - 1] = (p.X(), p.Y(), p.Z())
            d = tri.Normal(k).Transformed(trsf)
            N[k - 1] = (d.X(), d.Y(), d.Z())
        rev = face.Orientation() == TopAbs_REVERSED
        if rev:
            N = -N
        t = tri.NbTriangles()
        I = np.empty((t, 3), dtype=np.int64)
        for k in range(1, t + 1):
            a, b, c = tri.Triangle(k).Get()
            I[k - 1] = (a - 1, c - 1, b - 1) if rev else (a - 1, b - 1, c - 1)
        col = colour_of(face) or inherited or (0.62, 0.62, 0.62)
        key = tuple(round(v * 255) for v in col)
        if key not in pal_index:
            pal_index[key] = len(palette)
            palette.append(list(col))
        pos.append(P[I].reshape(-1, 9))
        nrm.append(N[I].reshape(-1, 9))
        faces.append(np.full(t, face_id, dtype=np.int32))
        cols.append(np.full(t, pal_index[key], dtype=np.uint16))
        names.append(np.full(t, index, dtype=np.uint32))
        face_id += 1

pos = np.concatenate(pos).astype(np.float32)
nrm = np.concatenate(nrm).astype(np.float32)
faces = np.concatenate(faces)
cols = np.concatenate(cols)
names = np.concatenate(names)
header = json.dumps({"count": int(len(faces)), "colors": palette, "names": name_list}).encode()
header += b" " * ((4 - len(header) % 4) % 4)
with open(out, "wb") as f:
    f.write(b"SOUP")
    f.write(struct.pack("<I", len(header)))
    f.write(header)
    for arr in (pos, nrm, faces, cols, names):
        f.write(arr.tobytes())
print(f"{len(leaves)} shapes, {len(faces)} triangles, {len(palette)} colours, {face_id} faces -> {out}")
