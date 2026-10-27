// Principal axis and end points of chosen meshes (by index) in a STEP file: for routing leads.
//   node axis.mjs file.step 4,5,6 [7,11]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const occt = await require("occt-import-js")();
const [file, a, b] = process.argv.slice(2);
const res = occt.ReadStepFile(fs.readFileSync(file), { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.002, angularDeflection: 0.4 });
const pts = (ids) => ids.split(",").flatMap((i) => { const P = res.meshes[+i].attributes.position.array; const o = []; for (let k = 0; k < P.length; k += 3) o.push([P[k], P[k + 1], P[k + 2]]); return o; });
const P = pts(a);
const c = [0, 1, 2].map((k) => P.reduce((s, p) => s + p[k], 0) / P.length);
const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of P) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - c[i]) * (p[j] - c[j]);
let v = [1, 1, 1];
for (let it = 0; it < 100; it++) { const w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]); const l = Math.hypot(...w); v = w.map((x) => x / l); }
const s = P.map((p) => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2]);
const lo = Math.min(...s), hi = Math.max(...s);
const at = (t) => c.map((x, k) => +(x + v[k] * t).toFixed(2));
console.log("axis", v.map((x) => +x.toFixed(4)), "centroid", c.map((x) => +x.toFixed(2)));
console.log("ends", at(lo), at(hi), "length", (hi - lo).toFixed(2));
if (b) { const Q = pts(b); const t = Q.map((p) => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2]); console.log("other meshes along axis:", Math.min(...t).toFixed(2), "..", Math.max(...t).toFixed(2)); }
