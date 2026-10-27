# RIFT: Adopt a Part

A sponsorship site for RIFT, UTRA's ARC Robotics team. Every part the first robot needs is
drawn from its manufacturer's own CAD in a white technical-illustration style, with its price.
Sponsors pick parts into a crate and send the list to the team.

## Run it

The site is static. Serve `site/` with any web server:

```sh
python3 -m http.server 4173 --directory site
```

- `site/js/catalog.js`: the bundles, prices and tiers (from the 2026–27 budget).
- `site/js/stage.js`: the renderer. One WebGL context paints every figure into its own canvas.
- `site/js/app.js`: the grid, part view, crate and info panel.
- `site/parts/*.bin`: one compressed mesh per part, made by `tools/convert.mjs`.

## Rebuilding a part

`tools/PARTS.md` describes the pipeline. In short:

```sh
cd tools && npm install
node convert.mjs m3508-p19            # reads tools/parts/m3508-p19.json, writes site/parts/m3508-p19.bin
```

The CAD files aren't in this repo. Each part's `cad/raw/<id>/manifest.json` records where its
CAD came from (download URL, licence notes, official dimensions); download it to the `src` path
in `tools/parts/<id>.json` before converting. Files the WASM importer can't mesh go through
`tools/occ_soup.py` (OpenCascade via CadQuery, in `tools/.venv`). Generic stock (filament spool,
carbon sheet, projectile) is modelled in `tools/models/`.
