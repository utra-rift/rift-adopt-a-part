"""Copy a STEP file, leaving out every B-rep face that can't be seen from outside.

Manufacturer CAD carries a lot of surface nobody can see: the inside of a closed battery shell,
screw threads inside their holes, the bore of a roller tyre around its core. Dropping whole meshes
can't remove those (the screw head and the battery's outside are the same mesh as the hidden part),
so this works per B-rep face. A face is kept if any point on it can see out to infinity along any
of: rings around the face's own normal, the 26 axis/diagonal directions, and `--dirs` spread over
the sphere (orthographic, like the site's camera at any azimuth and elevation). Hidden faces that meet a visible face tangentially are
kept too. Faces left out are never visible; faces kept are the CAD's own, unchanged.
Leaves whose faces are all kept stay solids; the others become open shells of their visible faces.
Names are kept, so `drop`, `bends` and `materials` regexes still match.

`--occluder` adds a box that blocks sight but is never drawn, for contents the CAD leaves out
(a battery shell modelled without its cells would otherwise show its inner walls through the vents).
An output ending in `.soup` writes the visible faces as a converter soup instead of a STEP, meshed
with OpenCascade's minimum element size (`--min-size`), which occt-import-js can't set, and with
tangent-continuous faces sharing one face id (`--no-merge` keeps chosen leaves' faces apart): on
parts with thousands of tiny fillets that is what brings the count within budget.

    .venv/bin/python -I visible_faces.py <in.step> <out.step|out.soup> [--dirs 8000] [--drop REGEX]
        [--occluder x0,y0,z0,x1,y1,z1] [--mesh-deflection 0.002 --mesh-angular 0.4 --min-size 0.3 --no-merge REGEX]
    --keep-all skips the visibility test (to mesh an already culled STEP into a soup).
"""
import argparse
import json
import math
import re
import struct
import time

import numpy as np
from numba import njit, prange
from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepLib import BRepLib_ToolTriangulatedShape
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools
from OCP.IMeshTools import IMeshTools_Parameters
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Reader, STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shell
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_DocumentTool


# ---------------------------------------------------------------- read
def read_leaves(src):
    doc = TDocStd_Document(TCollection_ExtendedString("doc"))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    if reader.ReadFile(src) != IFSelect_RetDone:
        raise SystemExit(f"cannot read {src}")
    reader.Transfer(doc)
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())

    def name_of(label):
        attr = TDataStd_Name()
        return attr.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), attr) else ""

    leaves = []

    def walk(label, loc, path):
        here = f"{path}/{name_of(label)}" if path else name_of(label)
        if tool.IsAssembly_s(label):
            comps = TDF_LabelSequence()
            tool.GetComponents_s(label, comps)
            for i in range(1, comps.Length() + 1):
                comp, ref = comps.Value(i), TDF_Label()
                tool.GetReferredShape_s(comp, ref)
                walk(ref, loc.Multiplied(tool.GetLocation_s(comp)), here)
        else:
            leaves.append((tool.GetShape_s(label).Moved(loc), here))

    free = TDF_LabelSequence()
    tool.GetFreeShapes(free)
    for i in range(1, free.Length() + 1):
        walk(free.Value(i), TopLoc_Location(), "")
    return leaves


# ---------------------------------------------------------------- tessellate for the ray test
def tessellate(leaves, ratio, angular):
    box = Bnd_Box()
    for shape, _ in leaves:
        BRepBndLib.Add_s(shape, box)
    x0, y0, z0, x1, y1, z1 = box.Get()
    diag = math.dist((x0, y0, z0), (x1, y1, z1))
    tris, owner, faces = [], [], []  # faces: (leaf index, located TopoDS_Face)
    for li, (shape, _) in enumerate(leaves):
        BRepMesh_IncrementalMesh(shape, diag * ratio, False, angular, True)
        exp = TopExp_Explorer(shape, TopAbs_FACE)
        while exp.More():
            face = TopoDS.Face_s(exp.Current())
            exp.Next()
            fi = len(faces)
            faces.append((li, face))
            floc = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(face, floc)
            if tri is None:
                continue
            trsf = floc.Transformation()
            P = np.array([(q.X(), q.Y(), q.Z()) for q in (tri.Node(k).Transformed(trsf) for k in range(1, tri.NbNodes() + 1))])
            I = np.array([tri.Triangle(k).Get() for k in range(1, tri.NbTriangles() + 1)]) - 1
            if face.Orientation() == TopAbs_REVERSED:
                I = I[:, [0, 2, 1]]
            tris.append(P[I])
            owner.append(np.full(len(I), fi))
    return np.concatenate(tris), np.concatenate(owner), faces, diag


# ---------------------------------------------------------------- BVH + any-hit rays
@njit(cache=True)
def build_bvh(lo, hi, cent, leaf_size):
    n = len(cent)
    order = np.arange(n)
    m = 2 * n
    bmin, bmax = np.empty((m, 3)), np.empty((m, 3))
    left, start, count = np.full(m, -1), np.zeros(m, np.int64), np.zeros(m, np.int64)
    st_node, st_a, st_b = np.empty(256, np.int64), np.empty(256, np.int64), np.empty(256, np.int64)
    sp, nodes = 1, 1
    st_node[0], st_a[0], st_b[0] = 0, 0, n
    while sp > 0:
        sp -= 1
        node, a, b = st_node[sp], st_a[sp], st_b[sp]
        cmin, cmax = np.full(3, np.inf), np.full(3, -np.inf)
        for k in range(a, b):
            t = order[k]
            for ax in range(3):
                bmin_v = lo[t, ax]
                if k == a or bmin_v < bmin[node, ax]:
                    bmin[node, ax] = bmin_v
                if k == a or hi[t, ax] > bmax[node, ax]:
                    bmax[node, ax] = hi[t, ax]
                cmin[ax] = min(cmin[ax], cent[t, ax])
                cmax[ax] = max(cmax[ax], cent[t, ax])
        if b - a <= leaf_size:
            start[node], count[node] = a, b - a
            continue
        ax = np.argmax(cmax - cmin)
        idx = order[a:b].copy()
        order[a:b] = idx[np.argsort(cent[idx, ax])]
        mid = (a + b) // 2
        left[node] = nodes
        st_node[sp], st_a[sp], st_b[sp] = nodes + 1, mid, b
        sp += 1
        st_node[sp], st_a[sp], st_b[sp] = nodes, a, mid
        sp += 1
        nodes += 2
    return order, bmin[:nodes], bmax[:nodes], left[:nodes], start[:nodes], count[:nodes]


@njit(cache=True)
def box_entry(o, inv, bmin, bmax, node, tmin):
    t0, t1 = tmin, np.inf
    for ax in range(3):
        ta = (bmin[node, ax] - o[ax]) * inv[ax]
        tb = (bmax[node, ax] - o[ax]) * inv[ax]
        if ta > tb:
            ta, tb = tb, ta
        t0, t1 = max(t0, ta), min(t1, tb)
    return t0 if t0 <= t1 else np.inf


@njit(cache=True)
def occluded(o, d, skip, V0, E1, E2, order, bmin, bmax, left, start, count, stack, tmin):
    inv = np.empty(3)
    for ax in range(3):
        inv[ax] = 1.0 / d[ax] if abs(d[ax]) > 1e-12 else 1e12
    if box_entry(o, inv, bmin, bmax, 0, tmin) == np.inf:
        return False
    stack[0] = 0
    sp = 1
    while sp > 0:
        sp -= 1
        node = stack[sp]
        if left[node] < 0:
            for k in range(start[node], start[node] + count[node]):
                t = order[k]
                if t == skip:
                    continue
                # Möller–Trumbore
                px = d[1] * E2[t, 2] - d[2] * E2[t, 1]
                py = d[2] * E2[t, 0] - d[0] * E2[t, 2]
                pz = d[0] * E2[t, 1] - d[1] * E2[t, 0]
                det = E1[t, 0] * px + E1[t, 1] * py + E1[t, 2] * pz
                if abs(det) < 1e-14:
                    continue
                f = 1.0 / det
                sx, sy, sz = o[0] - V0[t, 0], o[1] - V0[t, 1], o[2] - V0[t, 2]
                u = f * (sx * px + sy * py + sz * pz)
                if u < 0.0 or u > 1.0:
                    continue
                qx = sy * E1[t, 2] - sz * E1[t, 1]
                qy = sz * E1[t, 0] - sx * E1[t, 2]
                qz = sx * E1[t, 1] - sy * E1[t, 0]
                v = f * (d[0] * qx + d[1] * qy + d[2] * qz)
                if v < 0.0 or u + v > 1.0:
                    continue
                if f * (E2[t, 0] * qx + E2[t, 1] * qy + E2[t, 2] * qz) > tmin:
                    return True
        else:
            a, b = left[node], left[node] + 1
            ta, tb = box_entry(o, inv, bmin, bmax, a, tmin), box_entry(o, inv, bmin, bmax, b, tmin)
            if ta > tb:
                a, b, ta, tb = b, a, tb, ta
            if tb < np.inf:  # farther child waits under the nearer one
                stack[sp] = b
                sp += 1
            if ta < np.inf:
                stack[sp] = a
                sp += 1
    return False


@njit(cache=True)
def normal_cone(n, out):
    """Directions along the surface normal and in rings around it (both sides): a recess, a pin end
    or a hole bottom is visible only near its own normal, which a fixed set of directions can miss."""
    l = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
    if l == 0.0:
        return 0
    n = n / l
    a = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(n, a)
    u /= math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2])
    v = np.cross(n, u)
    k = 0
    for sgn in (1.0, -1.0):
        out[k] = sgn * n
        k += 1
        for tilt in (0.08, 0.2, 0.4):
            for i in range(6):
                ph = i * math.pi / 3 + tilt * 7
                out[k] = sgn * (math.cos(tilt) * n + math.sin(tilt) * (math.cos(ph) * u + math.sin(ph) * v))
                k += 1
    return k


@njit(parallel=True, cache=True)
def find_visible(so, stri, sface, V0, E1, E2, order, bmin, bmax, left, start, count, dirs, tmin, vis):
    for j in prange(len(sface)):
        f = sface[j]
        if vis[f]:
            continue
        stack = np.empty(256, np.int64)
        local = np.empty((38, 3))
        t = stri[j]
        nl = normal_cone(np.cross(E1[t], E2[t]), local)
        for di in range(nl + len(dirs)):
            if di % 64 == 63 and vis[f]:
                break
            d = local[di] if di < nl else dirs[di - nl]
            if not occluded(so[j], d, t, V0, E1, E2, order, bmin, bmax, left, start, count, stack, tmin):
                vis[f] = True
                break


BARY = np.array([[1 / 3, 1 / 3, 1 / 3], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]])


def samples(todo, face_start, face_tris, V0, E1, E2, cap, rng):
    """Points on the faces still in question: up to `cap` triangles per face, evenly spread, 4 points each."""
    tri, face = [], []
    for f in todo:
        a, b = face_start[f], face_start[f + 1]
        k = np.unique(np.linspace(a, b - 1, min(b - a, cap or b - a)).round().astype(np.int64))
        tri.append(face_tris[k])
        face.append(np.full(len(k), f))
    tri, face = np.concatenate(tri), np.concatenate(face)
    tri, face = np.repeat(tri, len(BARY)), np.repeat(face, len(BARY))
    w = np.tile(BARY, (len(tri) // len(BARY), 1))
    o = V0[tri] + w[:, 1:2] * E1[tri] + w[:, 2:3] * E2[tri]
    p = rng.permutation(len(tri))  # mixed order keeps the threads evenly loaded
    return np.ascontiguousarray(o[p]), tri[p], face[p]


def smooth_neighbours(T, owner, vis, diag, max_deg=20.0):
    """Hidden faces that join a visible face across a smooth edge (normals within max_deg)."""
    q = np.round(T.reshape(-1, 3) / (diag * 1e-6)).astype(np.int64)
    _, vid = np.unique(q, axis=0, return_inverse=True)
    vid = vid.reshape(-1, 3)
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-30)
    e = np.concatenate([np.sort(vid[:, [i, (i + 1) % 3]], 1) for i in range(3)])
    tri = np.tile(np.arange(len(T)), 3)
    key = e[:, 0] * (vid.max() + 1) + e[:, 1]
    o = np.argsort(key, kind="stable")
    key, tri = key[o], tri[o]
    same = np.nonzero(key[1:] == key[:-1])[0]
    a, b = tri[same], tri[same + 1]
    fa, fb = owner[a], owner[b]
    cos = np.sum(n[a] * n[b], 1)
    smooth = (fa != fb) & (vis[fa] != vis[fb]) & (cos > np.cos(np.radians(max_deg)))
    hidden = np.where(vis[fa[smooth]], fb[smooth], fa[smooth])
    return np.unique(hidden)


def sphere_dirs(n):
    """The 26 axis and diagonal directions (CAD holes and slots mostly run along the axes), then n spread evenly."""
    lattice = np.array([(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)], float)
    lattice /= np.linalg.norm(lattice, axis=1, keepdims=True)
    i = np.arange(n) + 0.5
    z = 1 - 2 * i / n
    r = np.sqrt(1 - z * z)
    a = i * math.pi * (3 - math.sqrt(5))
    return np.concatenate([lattice, np.stack([r * np.cos(a), r * np.sin(a), z], 1)])


# ---------------------------------------------------------------- write
def write(leaves, faces, vis, out, drop):
    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))
    app.InitDocument(doc)
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    by_leaf = {}
    for fi, (li, face) in enumerate(faces):
        by_leaf.setdefault(li, []).append((face, vis[fi]))
    builder = BRep_Builder()
    kept = whole = 0
    for li, (shape, path) in enumerate(leaves):
        if drop and re.search(drop, path, re.I):
            continue
        fl = by_leaf.get(li, [])
        if not any(v for _, v in fl):
            continue
        if all(v for _, v in fl):
            out_shape = shape
            whole += 1
        else:
            out_shape = TopoDS_Shell()
            builder.MakeShell(out_shape)
            for face, v in fl:
                if v:
                    builder.Add(out_shape, face)
        label = tool.AddShape(out_shape, False)
        TDataStd_Name.Set_s(label, TCollection_ExtendedString(path))
        kept += 1
    writer = STEPCAFControl_Writer()
    writer.SetNameMode(True)
    writer.Transfer(doc, STEPControl_AsIs)
    writer.Write(out)
    return kept, whole


def write_soup(leaves, faces, vis, out, drop, deflection, angular, min_size, no_merge):
    p = IMeshTools_Parameters()
    p.Deflection, p.Angle, p.MinSize, p.Relative, p.InParallel = deflection, angular, min_size, False, True
    for shape, _ in leaves:
        BRepTools.Clean_s(shape)
    for shape, _ in leaves:
        BRepMesh_IncrementalMesh(shape, p)
    pos, nrm, fid, nid = [], [], [], []
    for fi, (li, face) in enumerate(faces):
        if not vis[fi] or (drop and re.search(drop, leaves[li][1], re.I)):
            continue
        floc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, floc)
        if tri is None:
            continue
        if not tri.HasNormals():
            BRepLib_ToolTriangulatedShape.ComputeNormals_s(face, tri)
        trsf = floc.Transformation()
        P = np.array([(q.X(), q.Y(), q.Z()) for q in (tri.Node(k).Transformed(trsf) for k in range(1, tri.NbNodes() + 1))])
        N = np.array([(q.X(), q.Y(), q.Z()) for q in (tri.Normal(k).Transformed(trsf) for k in range(1, tri.NbNodes() + 1))])
        I = np.array([tri.Triangle(k).Get() for k in range(1, tri.NbTriangles() + 1)]) - 1
        if face.Orientation() == TopAbs_REVERSED:
            N, I = -N, I[:, [0, 2, 1]]
        pos.append(P[I].reshape(-1, 9))
        nrm.append(N[I].reshape(-1, 9))
        fid.append(np.full(len(I), fi, np.int32))
        nid.append(np.full(len(I), li, np.uint32))
    pos, nrm = np.concatenate(pos).astype(np.float32), np.concatenate(nrm).astype(np.float32)
    fid, nid = np.concatenate(fid), np.concatenate(nid)
    keep = np.array([bool(no_merge and re.search(no_merge, path, re.I)) for _, path in leaves])
    fid = merge_tangent(pos.reshape(-1, 3, 3), nrm.reshape(-1, 3, 3), fid, nid, keep)
    head = json.dumps({"count": len(fid), "colors": [[0.62, 0.62, 0.62]], "names": [f"{path}#{i}" for i, (_, path) in enumerate(leaves)]}).encode()
    head += b" " * ((4 - len(head) % 4) % 4)
    with open(out, "wb") as f:
        f.write(b"SOUP" + struct.pack("<I", len(head)) + head)
        for arr in (pos, nrm, fid, np.zeros(len(fid), np.uint16), nid):
            f.write(arr.tobytes())
    return len(fid)


def merge_tangent(P, N, fid, nid, keep, max_deg=5.0):
    """One face id for B-rep faces that meet tangentially (surface normals agree all along the shared
    edge). The converter never draws such an edge, so the drawing is unchanged, but it then shares
    vertices across it, and a coarsely meshed fillet no longer shows a false crease at its tangent edge."""
    q = np.round(P.reshape(-1, 3) / 1e-4).astype(np.int64)
    _, vid = np.unique(q, axis=0, return_inverse=True)
    vid = vid.reshape(-1, 3)
    T = len(vid)
    rows = []
    for k in range(3):
        a, b = vid[:, k], vid[:, (k + 1) % 3]
        lo_first = a < b
        rows.append(np.stack([np.minimum(a, b), np.maximum(a, b), np.arange(T),
                              np.where(lo_first, k, (k + 1) % 3), np.where(lo_first, (k + 1) % 3, k)], 1))
    E = np.concatenate(rows)
    E = E[np.lexsort((E[:, 1], E[:, 0]))]
    same = np.nonzero((E[1:, 0] == E[:-1, 0]) & (E[1:, 1] == E[:-1, 1]))[0]
    A, B = E[same], E[same + 1]
    fa, fb = fid[A[:, 2]], fid[B[:, 2]]
    m = (fa != fb) & ~keep[nid[A[:, 2]]] & ~keep[nid[B[:, 2]]]
    A, B, fa, fb = A[m], B[m], fa[m], fb[m]
    c = np.minimum(np.sum(N[A[:, 2], A[:, 3]] * N[B[:, 2], B[:, 3]], 1), np.sum(N[A[:, 2], A[:, 4]] * N[B[:, 2], B[:, 4]], 1))
    pair = np.stack([np.minimum(fa, fb), np.maximum(fa, fb)], 1)
    key, inv = np.unique(pair, axis=0, return_inverse=True)
    worst = np.full(len(key), 1.0)
    np.minimum.at(worst, inv.ravel(), c)
    parent = {}
    def root(x):
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x
    for (x, y) in key[worst > math.cos(math.radians(max_deg))]:
        rx, ry = root(int(x)), root(int(y))
        if rx != ry:
            parent[max(rx, ry)] = min(rx, ry)
    out = np.array([root(int(f)) for f in fid], np.int32)
    print(f"  {len(np.unique(fid))} faces, {len(np.unique(out))} after joining tangent neighbours", flush=True)
    return out


def box_tris(b):
    x0, y0, z0, x1, y1, z1 = b
    c = np.array([[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)], float)
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return np.array([[c[q[0]], c[q[k]], c[q[k + 1]]] for q in quads for k in (1, 2)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--dirs", type=int, default=8000, help="view directions for the last pass, on faces not seen before")
    ap.add_argument("--deflection", type=float, default=0.001, help="ray-test tessellation, ratio of the bbox diagonal")
    ap.add_argument("--angular", type=float, default=0.3)
    ap.add_argument("--drop", default=None, help="regex on leaf path: leaves left out entirely")
    ap.add_argument("--occluder", default=None, help="x0,y0,z0,x1,y1,z1: box that blocks sight, never drawn")
    ap.add_argument("--mesh-deflection", type=float, default=0.002, help=".soup: deflection, ratio of the bbox diagonal")
    ap.add_argument("--mesh-angular", type=float, default=0.4, help=".soup: angular deflection, radians")
    ap.add_argument("--min-size", type=float, default=0.0, help=".soup: smallest mesh element, mm")
    ap.add_argument("--keep-all", action="store_true", help="skip the visibility test")
    ap.add_argument("--no-merge", default=None, help=".soup: regex on leaf path: keep these leaves' faces separate")
    a = ap.parse_args()
    t0 = time.time()
    leaves = read_leaves(a.src)
    T, owner, faces, diag = tessellate(leaves, a.deflection, a.angular)
    print(f"{len(leaves)} leaves, {len(faces)} faces, {len(T)} test triangles ({time.time() - t0:.0f} s)", flush=True)
    Tall, owner_all = T, owner
    if a.occluder:
        box = box_tris([float(v) for v in a.occluder.split(",")])
        Tall, owner_all = np.concatenate([T, box]), np.concatenate([owner, np.full(len(box), -1)])
    V0, E1, E2 = Tall[:, 0].copy(), (Tall[:, 1] - Tall[:, 0]).copy(), (Tall[:, 2] - Tall[:, 0]).copy()
    order, bmin, bmax, left, start, count = build_bvh(Tall.min(1), Tall.max(1), Tall.mean(1), 4)
    srt = np.argsort(owner_all, kind="stable")
    face_start = np.searchsorted(owner_all[srt], np.arange(len(faces) + 1))
    vis = np.zeros(len(faces), np.bool_)
    no_tris = face_start[1:] == face_start[:-1]
    vis[no_tris] = True  # untessellated faces: keep (can't test them)
    tmin = diag * 1e-6
    rng = np.random.default_rng(0)
    if a.keep_all:
        vis[:] = True
    # Cheap pass first (every triangle, few directions), then denser directions on fewer points.
    for n, cap in ((64, 256), (400, 64), (a.dirs, 24)):
        todo = np.nonzero(~vis)[0]
        if not len(todo):
            break
        so, stri, sface = samples(todo, face_start, srt, V0, E1, E2, cap, rng)
        find_visible(so, stri, sface, V0, E1, E2, order, bmin, bmax, left, start, count, sphere_dirs(n), tmin, vis)
        print(f"  {n} directions, {len(sface)} points: {int(vis.sum())} of {len(faces)} faces visible ({time.time() - t0:.0f} s)", flush=True)
    extra = smooth_neighbours(T, owner, vis, diag)
    vis[extra] = True
    print(f"  + {len(extra)} hidden faces kept because they meet a visible face smoothly", flush=True)
    if a.out.endswith(".soup"):
        n = write_soup(leaves, faces, vis, a.out, a.drop, diag * a.mesh_deflection, a.mesh_angular, a.min_size, a.no_merge)
        print(f"wrote {a.out}: {n} triangles")
    else:
        kept, whole = write(leaves, faces, vis, a.out, a.drop)
        print(f"wrote {a.out}: {kept} leaves ({whole} whole)")
    hidden_leaves = [p for li, (_, p) in enumerate(leaves) if not any(vis[fi] for fi, (l, _) in enumerate(faces) if l == li)]
    print(f"{len(hidden_leaves)} leaves fully hidden")
    for p in sorted(set(hidden_leaves)):
        print("   hidden:", p)


if __name__ == "__main__":
    main()
