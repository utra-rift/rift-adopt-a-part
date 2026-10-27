// CAD → compact part file for the site.
// Reads STEP/IGES (B-rep, via OpenCascade) or STL, keeps every B-rep face boundary,
// precomputes the drawing's edges (creases always drawn, smooth edges as silhouette
// candidates), quantizes and meshopt-encodes everything into one .bin per part.
//
//   node convert.mjs <id ...>        reads tools/parts/<id>.json, writes site/parts/<id>.bin
//   node convert.mjs --all
//
// Part config (tools/parts/<id>.json):
//   src            CAD path relative to the project root (STEP/STP/IGES/STL)
//   up             "z" | "y": the source's up axis (output is y-up)
//   rotate         [rx, ry, rz] degrees about the source axes, applied before `up`
//   deflection     tessellation, ratio of the bounding box (default 0.0008); angular in radians (0.3)
//   faceCreaseDeg  B-rep face boundaries sharper than this are drawn as creases (default 10)
//   minSilhouetteDeg  smooth edges flatter than this are never silhouette candidates (default 2.5)
//   foldLines      keep precomputed silhouette edges (off: the site draws silhouettes from smooth normals)
//   minFeature     leave out meshes whose largest side is under this many mm (tiny SMD parts)
//   drop           regex on mesh path ("<path>/<name>#<mesh index>", as inspect.mjs lists): meshes left out
//   defaultMaterial, materials [{ match, rgb?, tol?, box?, mat }]   real-look materials by mesh path / CAD colour;
//                  box [x0, y0, z0, x1, y1, z1] (source mm, before bends) picks out a region of a mesh
//   customMaterials { name: { color, mr: [metal, rough], glow } }
//   bends          [{ match, from, to, path, maxEdge }]   straight CAD wire leads re-routed naturally (see bend.mjs)
//   lit            regex on mesh path: the one lit accent
//   groups         { name: regex }   separately moving groups; groupMeta { name: { spin: { axis: "x"|"y"|"z", rpm } } }
//   view, fx, notes   passed through to the site
// File layout: "RIFT" u32(headerBytes) header-json(pad 4) blob*
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MeshoptEncoder } from "meshoptimizer";
import { applyBends } from "./bend.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site/parts");

const PARTS = path.join(ROOT, "tools/parts");
const args = process.argv.slice(2);
const ids = args.includes("--all") ? fs.readdirSync(PARTS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : args;
const todo = ids.map((id) => ({ id, ...JSON.parse(fs.readFileSync(path.join(PARTS, `${id}.json`), "utf8")) }));
if (!todo.length) throw new Error("usage: node convert.mjs <id ...> | --all");

await MeshoptEncoder.ready;
const occt = await require("occt-import-js")();
fs.mkdirSync(OUT, { recursive: true });

for (const part of todo) {
  const t0 = Date.now();
  const raw = load(part);
  // Each triangle's centre in the CAD's own frame, before any bend, for `box` material rules.
  raw.src = raw.tris.map((t) => [(t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3, (t[2] + t[5] + t[8]) / 3]);
  if (part.bends) applyBends(raw, part.bends);
  const model = build(raw, part);
  const bytes = pack(model, part);
  fs.writeFileSync(path.join(OUT, `${part.id}.bin`), bytes);
  const g = model.groups.map((g) => `${g.name}:${g.triCount}`).join(" ");
  console.log(`${part.id}: ${model.triCount} tris, ${model.vertCount} verts, ${model.creaseCount} creases, ${model.condCount} silhouettes, ` +
    `size ${model.size.map((v) => v.toFixed(1)).join("×")} mm, ${(bytes.length / 1024).toFixed(0)} KB, groups ${g} (${Date.now() - t0} ms)`);
}

// ---------------------------------------------------------------- load
// Returns a flat triangle soup with per-triangle face id, colour and source path.
function load(part) {
  const file = path.resolve(ROOT, part.src);
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === ".stl") return loadStl(buf, part);
  if (ext === ".soup") return dropSmall(loadSoup(buf, part), part);
  const params = {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: part.deflection ?? 0.0008,
    angularDeflection: part.angular ?? 0.3,
  };
  const res = /\.(igs|iges)$/.test(ext) ? occt.ReadIgesFile(buf, params) : occt.ReadStepFile(buf, params);
  if (!res.success) throw new Error(`${part.id}: OpenCascade could not read ${file}`);

  const meshPath = new Map();
  (function walk(node, prefix) {
    const here = prefix ? `${prefix}/${node.name}` : node.name;
    for (const m of node.meshes) meshPath.set(m, here);
    for (const c of node.children) walk(c, here);
  })(res.root, "");

  const tris = []; // [ax,ay,az,bx,by,bz,cx,cy,cz, nx..(3 vertex normals ×3)]
  const faces = []; // per tri: face id
  const colors = []; // per tri: [r,g,b]
  const names = []; // per tri: source path
  let faceId = 0;
  res.meshes.forEach((m, mi) => {
    const name = `${meshPath.get(mi) ?? ""}/${m.name ?? ""}#${mi}`;
    if (part.drop && new RegExp(part.drop, "i").test(name)) return;
    const P = m.attributes.position.array, N = m.attributes.normal?.array, I = m.index.array;
    const faceList = m.brep_faces?.length ? m.brep_faces : [{ first: 0, last: I.length / 3 - 1, color: null }];
    for (const f of faceList) {
      const col = f.color ?? m.color ?? [0.62, 0.62, 0.62];
      for (let t = f.first; t <= f.last; t++) {
        const v = [];
        for (let k = 0; k < 3; k++) { const i = I[t * 3 + k]; v.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
        for (let k = 0; k < 3; k++) { const i = I[t * 3 + k]; v.push(N ? N[i * 3] : 0, N ? N[i * 3 + 1] : 0, N ? N[i * 3 + 2] : 0); }
        tris.push(v); faces.push(faceId); colors.push(col); names.push(name);
      }
      faceId++;
    }
  });
  return dropSmall({ tris, faces, colors, names, smoothByFace: true }, part);
}

// A soup from tools/occ_soup.py (full OpenCascade, for files the WASM importer can't mesh).
function loadSoup(buf, part) {
  const hlen = buf.readUInt32LE(4);
  const head = JSON.parse(buf.toString("utf8", 8, 8 + hlen));
  const T = head.count, base = 8 + hlen;
  const f32 = (o, n) => new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * 4));
  const pos = f32(base, T * 9), nrm = f32(base + T * 36, T * 9);
  const fo = base + T * 72;
  const face = new Int32Array(buf.buffer.slice(buf.byteOffset + fo, buf.byteOffset + fo + T * 4));
  const col = new Uint16Array(buf.buffer.slice(buf.byteOffset + fo + T * 4, buf.byteOffset + fo + T * 6));
  const nameAt = fo + T * 6;
  const name = new Uint32Array(buf.buffer.slice(buf.byteOffset + nameAt, buf.byteOffset + nameAt + T * 4));
  const tris = [], faces = [], colors = [], names = [];
  for (let t = 0; t < T; t++) {
    const v = new Array(18);
    for (let k = 0; k < 9; k++) { v[k] = pos[t * 9 + k]; v[9 + k] = nrm[t * 9 + k]; }
    tris.push(v); faces.push(face[t]); colors.push(head.colors[col[t]]); names.push(head.names[name[t]]);
  }
  return { tris, faces, colors, names, smoothByFace: true };
}

// minFeature: leave out whole meshes smaller than this (mm, largest side). Sub-millimetre
// SMD parts on a board are invisible at the sizes the site draws and only add noise.
function dropSmall(raw, part) {
  if (!part.minFeature) return raw;
  const box = new Map();
  raw.tris.forEach((t, i) => {
    const b = box.get(raw.names[i]) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 9; k++) { b[k % 3] = Math.min(b[k % 3], t[k]); b[3 + (k % 3)] = Math.max(b[3 + (k % 3)], t[k]); }
    box.set(raw.names[i], b);
  });
  const keep = new Set([...box].filter(([, b]) => Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) >= part.minFeature).map(([n]) => n));
  const out = { tris: [], faces: [], colors: [], names: [], smoothByFace: raw.smoothByFace };
  raw.tris.forEach((t, i) => { if (keep.has(raw.names[i])) { out.tris.push(t); out.faces.push(raw.faces[i]); out.colors.push(raw.colors[i]); out.names.push(raw.names[i]); } });
  console.log(`  minFeature ${part.minFeature} mm: kept ${keep.size} of ${box.size} meshes, ${out.tris.length} of ${raw.tris.length} triangles`);
  return out;
}

function loadStl(buf, part) {
  const tris = [], faces = [], colors = [], names = [];
  const binary = buf.length === 84 + buf.readUInt32LE(80) * 50;
  const push = (a, b, c) => { tris.push([...a, ...b, ...c, 0, 0, 0, 0, 0, 0, 0, 0, 0]); faces.push(-1); colors.push(part.color ?? [0.62, 0.62, 0.62]); names.push(part.id); };
  if (binary) {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12, r = (k) => buf.readFloatLE(o + k * 4);
      push([r(0), r(1), r(2)], [r(3), r(4), r(5)], [r(6), r(7), r(8)]);
    }
  } else {
    const v = [...buf.toString("utf8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) push(v[i], v[i + 1], v[i + 2]);
  }
  const scale = part.stlScale ?? 1;
  for (const t of tris) for (let k = 0; k < 9; k++) t[k] *= scale;
  return { tris, faces, colors, names, smoothByFace: false };
}

// ---------------------------------------------------------------- build
function build(raw, part) {
  const { tris, faces, colors, names } = raw;
  const R = rotation(part.rotate ?? [0, 0, 0], part.up ?? "z");
  // Transform to y-up and centre on the bounding box.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const p = mul(R, [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]]);
      const n = mul(R, [t[9 + k * 3], t[10 + k * 3], t[11 + k * 3]]);
      t[k * 3] = p[0]; t[k * 3 + 1] = p[1]; t[k * 3 + 2] = p[2];
      t[9 + k * 3] = n[0]; t[10 + k * 3] = n[1]; t[11 + k * 3] = n[2];
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
    }
  }
  const centre = min.map((v, a) => (v + max[a]) / 2);
  for (const t of tris) for (let k = 0; k < 9; k++) t[k] -= centre[k % 3];
  const size = max.map((v, a) => v - min[a]);
  const diag = Math.hypot(...size);

  // Groups: sort triangles so each group is one contiguous range.
  const groupDefs = Object.entries(part.groups ?? {}).map(([name, re]) => ({ name, re: new RegExp(re, "i") }));
  const groupOf = names.map((n) => { const g = groupDefs.findIndex((d) => d.re.test(n)); return g < 0 ? 0 : g + 1; });
  const groupNames = ["body", ...groupDefs.map((d) => d.name)];
  const litRe = part.lit ? new RegExp(part.lit, "i") : null;

  // Colour palette: a config material (matched on the mesh path, then on the CAD colour)
  // wins over the raw CAD colour.
  const rules = (part.materials ?? []).map((r) => ({ ...r, re: r.match ? new RegExp(r.match, "i") : null }));
  const palette = [], palMat = [], palIndex = new Map();
  const colorIdx = colors.map((c, ti) => {
    const rgb = c.map((v) => Math.round(v * 255));
    const inBox = (b) => { const c = raw.src[ti]; return c[0] >= b[0] && c[1] >= b[1] && c[2] >= b[2] && c[0] <= b[3] && c[1] <= b[4] && c[2] <= b[5]; };
    const rule = rules.find((r) => (r.re ? r.re.test(names[ti]) : true) && (!r.rgb || r.rgb.every((v, a) => Math.abs(v - rgb[a]) <= (r.tol ?? 6))) && (!r.box || inBox(r.box)));
    const mat = rule?.mat ?? part.defaultMaterial ?? null;
    const key = `${rgb.join(",")}|${mat}`;
    if (!palIndex.has(key)) { palIndex.set(key, palette.length); palette.push(rgb); palMat.push(mat); }
    return palIndex.get(key);
  });
  if (palette.length > 32) throw new Error(`${part.id}: ${palette.length} palette entries (max 32)`);

  // Geometric face normals, welded positions.
  const eps = diag * 2e-6;
  const weld = new Map(); let weldCount = 0;
  const wid = (x, y, z) => {
    const k = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let id = weld.get(k); if (id === undefined) { id = weldCount++; weld.set(k, id); } return id;
  };
  const triW = tris.map((t) => [wid(t[0], t[1], t[2]), wid(t[3], t[4], t[5]), wid(t[6], t[7], t[8])]);
  const fn = tris.map((t) => {
    const u = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], v = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n); return l > 0 ? n.map((x) => x / l) : [0, 1, 0];
  });
  // STL: no B-rep, so split smooth regions by angle and use flat normals across creases.
  if (!raw.smoothByFace) smoothStl(tris, triW, fn, faces, part.creaseDeg ?? 28);

  // Order triangles by group, keep source order within a group.
  const order = tris.map((_, i) => i).sort((a, b) => groupOf[a] - groupOf[b] || a - b);

  // Vertices: shared within one B-rep face (same welded position + same face), split across faces.
  const vkey = new Map(); const verts = []; // {p, n, c, g, lit}
  const index = new Uint32Array(order.length * 3);
  const vertOfWeld = new Map(); // weld id → some vertex (for edges)
  order.forEach((ti, o) => {
    const t = tris[ti];
    for (let k = 0; k < 3; k++) {
      const w = triW[ti][k];
      const key = `${w}:${faces[ti]}:${groupOf[ti]}`;
      let vi = vkey.get(key);
      if (vi === undefined) {
        vi = verts.length; vkey.set(key, vi);
        let n = [t[9 + k * 3], t[10 + k * 3], t[11 + k * 3]];
        if (Math.hypot(...n) < 0.5) n = fn[ti];
        verts.push({ p: [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]], n, c: colorIdx[ti], g: groupOf[ti], lit: litRe ? +litRe.test(names[ti]) : 0 });
      }
      index[o * 3 + k] = vi;
      if (!vertOfWeld.has(`${w}:${groupOf[ti]}`)) vertOfWeld.set(`${w}:${groupOf[ti]}`, vi);
    }
  });

  // Edges.
  const creaseRad = ((part.faceCreaseDeg ?? 10) * Math.PI) / 180;
  // Folds flatter than this never count as silhouettes: they are a facet's own diagonal
  // (twisted slightly by a bend), not an edge between facets.
  const silRad = ((part.minSilhouetteDeg ?? 2.5) * Math.PI) / 180;
  const edgeMap = new Map();
  order.forEach((ti) => {
    const w = triW[ti];
    for (let k = 0; k < 3; k++) {
      const a = w[k], b = w[(k + 1) % 3], c = w[(k + 2) % 3];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let e = edgeMap.get(key); if (!e) edgeMap.set(key, (e = []));
      e.push({ ti, a, b, c });
    }
  });
  const creases = groupNames.map(() => []), conds = groupNames.map(() => []);
  const V = (w, g) => vertOfWeld.get(`${w}:${g}`);
  for (const list of edgeMap.values()) {
    const { a, b, ti } = list[0];
    const g = groupOf[ti];
    if (list.length !== 2 || groupOf[list[1].ti] !== g) { creases[g].push(V(a, g), V(b, g)); continue; }
    const [e0, e1] = list;
    const cos = dot(fn[e0.ti], fn[e1.ti]);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const sameFace = faces[e0.ti] === faces[e1.ti] && faces[e0.ti] >= 0;
    if (!sameFace && ang > creaseRad) creases[g].push(V(a, g), V(b, g));
    else if (ang > silRad) conds[g].push(V(a, g), V(b, g), V(e0.c, g), V(e1.c, g));
  }

  // Group ranges.
  const groups = []; let start = 0;
  groupNames.forEach((name, g) => {
    const mine = order.filter((ti) => groupOf[ti] === g);
    if (!mine.length) return;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const ti of mine) for (let k = 0; k < 9; k++) { lo[k % 3] = Math.min(lo[k % 3], tris[ti][k]); hi[k % 3] = Math.max(hi[k % 3], tris[ti][k]); }
    const def = (part.groupMeta ?? {})[name] ?? {};
    groups.push({ name, g, triStart: start, triCount: mine.length, center: lo.map((v, a) => +((v + hi[a]) / 2).toFixed(3)), ...def });
    start += mine.length;
  });

  return { verts, index, creases, conds, groups, palette, palMat, size, centre, diag,
    triCount: order.length, vertCount: verts.length,
    creaseCount: creases.reduce((s, c) => s + c.length / 2, 0), condCount: conds.reduce((s, c) => s + c.length / 4, 0) };
}

function smoothStl(tris, triW, fn, faces, deg) {
  // Flood-fill faces across edges flatter than `deg`, then average normals per (weld, face).
  const lim = Math.cos((deg * Math.PI) / 180);
  const adj = new Map();
  triW.forEach((w, ti) => { for (let k = 0; k < 3; k++) { const a = w[k], b = w[(k + 1) % 3]; const key = a < b ? `${a},${b}` : `${b},${a}`; (adj.get(key) ?? adj.set(key, []).get(key)).push(ti); } });
  let id = 0;
  for (let s = 0; s < tris.length; s++) {
    if (faces[s] >= 0) continue;
    faces[s] = id; const stack = [s];
    while (stack.length) {
      const ti = stack.pop(); const w = triW[ti];
      for (let k = 0; k < 3; k++) {
        const a = w[k], b = w[(k + 1) % 3]; const nb = adj.get(a < b ? `${a},${b}` : `${b},${a}`);
        if (nb.length !== 2) continue;
        for (const o of nb) if (faces[o] < 0 && dot(fn[o], fn[ti]) > lim) { faces[o] = id; stack.push(o); }
      }
    }
    id++;
  }
  const acc = new Map();
  triW.forEach((w, ti) => w.forEach((v) => { const key = `${v}:${faces[ti]}`; const n = acc.get(key) ?? [0, 0, 0]; n[0] += fn[ti][0]; n[1] += fn[ti][1]; n[2] += fn[ti][2]; acc.set(key, n); }));
  triW.forEach((w, ti) => w.forEach((v, k) => { const n = acc.get(`${v}:${faces[ti]}`); const l = Math.hypot(...n) || 1; tris[ti][9 + k * 3] = n[0] / l; tris[ti][10 + k * 3] = n[1] / l; tris[ti][11 + k * 3] = n[2] / l; }));
}

// ---------------------------------------------------------------- pack
function pack(m, part) {
  const n = m.verts.length;
  const half = m.size.map((s) => s / 2 || 1);
  // Vertex: u16 x,y,z | i8 nx,ny,nz | u8 group | u8 colour | u8 lit | u16 pad  → 12 bytes
  const vb = new Uint8Array(n * 12); const dv = new DataView(vb.buffer);
  m.verts.forEach((v, i) => {
    const o = i * 12;
    for (let a = 0; a < 3; a++) dv.setUint16(o + a * 2, Math.round(((v.p[a] / half[a]) * 0.5 + 0.5) * 65535), true);
    for (let a = 0; a < 3; a++) dv.setInt8(o + 6 + a, Math.round(Math.max(-1, Math.min(1, v.n[a])) * 127));
    dv.setUint8(o + 9, v.g); dv.setUint8(o + 10, v.c); dv.setUint8(o + 11, v.lit);
  });
  const blobs = [];
  const add = (name, bytes, meta) => { blobs.push({ name, bytes, meta }); };
  add("vertices", MeshoptEncoder.encodeVertexBuffer(vb, n, 12), { count: n, stride: 12 });
  add("indices", MeshoptEncoder.encodeIndexBuffer(new Uint8Array(m.index.buffer), m.index.length, 4), { count: m.index.length });
  m.groups.forEach((gr) => {
    const c = Uint32Array.from(m.creases[gr.g]), d = Uint32Array.from(m.conds[gr.g]);
    if (c.length) add(`crease:${gr.name}`, MeshoptEncoder.encodeIndexSequence(new Uint8Array(c.buffer), c.length, 4), { count: c.length });
    if (d.length && part.foldLines) add(`cond:${gr.name}`, MeshoptEncoder.encodeIndexSequence(new Uint8Array(d.buffer), d.length, 4), { count: d.length });
  });
  let offset = 0;
  const header = {
    id: part.id, size: m.size, half, palette: m.palette, materials: m.palMat,
    customMaterials: part.customMaterials ?? {}, view: part.view ?? {}, fx: part.fx ?? {}, notes: part.notes ?? "",
    groups: m.groups.map(({ g, ...rest }) => rest),
    blobs: blobs.map((b) => { const r = { name: b.name, offset, bytes: b.bytes.length, ...b.meta }; offset += Math.ceil(b.bytes.length / 4) * 4; return r; }),
  };
  let json = Buffer.from(JSON.stringify(header));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const out = Buffer.alloc(8 + json.length + offset);
  out.write("RIFT", 0, "ascii"); out.writeUInt32LE(json.length, 4); json.copy(out, 8);
  blobs.forEach((b, i) => Buffer.from(b.bytes).copy(out, 8 + json.length + header.blobs[i].offset));
  return out;
}

// ---------------------------------------------------------------- math
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function mul(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
function mm(A, B) { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; }
function rot(axis, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
// Source rotation (degrees about source X, then Y, then Z), then source-up → three.js y-up.
function rotation([rx, ry, rz], up) {
  const src = mm(rot(2, rz), mm(rot(1, ry), rot(0, rx)));
  const toY = up === "z" ? [1, 0, 0, 0, 0, 1, 0, -1, 0] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return mm(toY, src);
}
