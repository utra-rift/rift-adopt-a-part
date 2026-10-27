# Part figures: how a CAD file becomes a figure on the site

Every part on the site is drawn from the manufacturer's own CAD. Accuracy is the point:
nothing is invented, and the only changes made to the geometry are the ones listed here
(dropping hidden internals, re-routing leads that the CAD models as rigid straight runs).

The reference figure is `m3508-p19` (`tools/parts/m3508-p19.json`). Read it first.

## Tools (run from the project root)

| Command | What it does |
|---|---|
| `node tools/inspect.mjs <file.step>` | Every mesh: index, triangle count, bounding box (source mm), CAD colours, path. |
| `node tools/axis.mjs <file.step> 4,5,6 [7,8]` | Principal axis and end points of the given meshes, and where other meshes sit along it. Use it to route leads. |
| `node tools/convert.mjs <id>` | Reads `tools/parts/<id>.json`, writes `site/parts/<id>.bin`, prints triangles, size in mm, KB. |
| `tools/shot.sh <id> shots/<id>-plan.png "real=0" 900` | Renders the figure in the drawing (plan) look. |
| `tools/shot.sh <id> shots/<id>-real.png "real=1" 900` | Renders it in its real materials. Query also takes `spin=deg`, `elev=deg`, `az=deg`, `fill=0.8`. |

The dev server (http://localhost:4173) is already running; `shot.sh` uses it. Read every PNG you make.

## The config (`tools/parts/<id>.json`)

See the header of `tools/convert.mjs` for every key. The ones that matter:

- `src`, `up` ("z" or "y", the CAD's up axis), `rotate` [rx, ry, rz] degrees about the source axes.
  Pose the part the way it naturally sits or mounts: motors standing on their base or as mounted,
  boards flat with components up, an armor panel upright facing the viewer.
- `deflection` / `angular`: tessellation. Budget: ≤ 90k triangles and ≤ 600 KB per part. Start at
  0.0012 / 0.26 and coarsen if over budget. Silhouettes come from smooth normals, so coarse
  facets don't break the drawing; only the outline against white shows facets.
- `drop`: meshes that can't be seen from outside (internal bolts, magnets, stator windings).
  Only drop what is truly hidden. Never drop something visible to save triangles.
- `materials`: real-look materials by mesh (`match` is a regex on `"<path>/<name>#<index>"`,
  as `inspect.mjs` prints; `#12$` matches mesh 12). Presets are in `MATERIALS` in `site/js/stage.js`
  (black-anodized, black-plastic, matte-black, grey-plastic, silver-anodized, steel, brass, gold,
  copper, pcb-green, pcb-black, rubber, white-plastic, red-wire, yellow-wire, orange-wire,
  blue-led, red-led, fluoro). Add `customMaterials` for anything else, colour picked from the
  official photo (`cad/raw/<id>/ref.*`) and the manifest's `colors`. If the CAD carries real colours
  (Raspberry Pi, goBILDA), match them by `rgb` instead of by mesh.
- `lit`: the ONE lit accent, the part the eye should go to: a motor's output shaft, a camera's lens,
  a board's main chip or connector, an armor panel's light strips. It draws in RIFT blue in plan.
- `groups` + `groupMeta.spin`: only for parts that really turn (a motor's shaft/rotor). Axis is in
  output coordinates (y is up after `up`). Never animate something that doesn't move in reality.
- `bends`: every cable or lead the CAD models as a rigid straight run gets re-routed so it hangs like
  a real wire. Keep the wire's true length (convert prints a warning if the route is off by > 4%),
  leave the body in a natural direction, droop under gravity toward the part's base level and settle,
  never pass through the body or another wire, and let the connector at the end keep its CAD shape.
  Get `from`/`to` from `axis.mjs` (`from` just outside the strain relief, `to` where the connector starts).
  Very long leads (C620's ~300 mm) loop or coil loosely beside the part instead of running off-frame.
  Several bundles can each have their own bend.
- `view`: `{ "azimuth": 45, "elevation": 30 }` by default (the anatomy camera). Change the azimuth
  only to show the part's best side.
- `notes`: one line for the site: source and anything changed (e.g. "Leads re-routed; length kept.").

## Done means

1. Overall size printed by convert matches the official dimensions in the manifest (allowing for leads).
2. The plan render reads as a clean anatomy drawing: crisp outline, no stray lines, the lit accent in blue.
3. The real render matches the official photo: every visible surface has the right material and colour.
4. Leads hang naturally; connectors are intact; nothing intersects.
5. Within budget (≤ 90k tris, ≤ 600 KB).

Don't edit `tools/convert.mjs`, `tools/bend.mjs` or `site/js/stage.js` (shared by everyone).
If you need a change there, describe it in your report instead.
