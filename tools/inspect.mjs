// List every mesh in a STEP file: path, triangle count, colour, bounding box (source units, mm).
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const occt = await require("occt-import-js")();
const file = process.argv[2];
const res = occt.ReadStepFile(fs.readFileSync(file), { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.004, angularDeflection: 0.6 });
const paths = new Map();
(function walk(n, p) { const h = p ? `${p}/${n.name}` : n.name; n.meshes.forEach((m) => paths.set(m, h)); n.children.forEach((c) => walk(c, h)); })(res.root, "");
const all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
const rows = res.meshes.map((m, i) => {
  const P = m.attributes.position.array; const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], P[k + a]); b[a + 3] = Math.max(b[a + 3], P[k + a]); }
  for (let a = 0; a < 3; a++) { all[a] = Math.min(all[a], b[a]); all[a + 3] = Math.max(all[a + 3], b[a + 3]); }
  const cols = new Set((m.brep_faces ?? []).map((f) => (f.color ?? m.color ?? []).map((v) => Math.round(v * 255)).join(",")));
  return `${String(i).padStart(3)} ${String(m.index.array.length / 3).padStart(6)}t  [${b.map((v) => v.toFixed(1)).join(" ")}]  ${[...cols].join(" | ")}  ${paths.get(i)}/${m.name}`;
});
console.log(rows.join("\n"));
console.log("ALL", all.map((v) => v.toFixed(2)).join(" "), "size", [0, 1, 2].map((a) => (all[a + 3] - all[a]).toFixed(2)).join(" × "));
