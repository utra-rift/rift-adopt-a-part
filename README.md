# RIFT: Adopt a Part

A sponsorship site for RIFT, UTRA's ARC Robotics team. Every part the first robot needs is
drawn from its manufacturer's own CAD in a white technical-illustration style, with its price.
Sponsors pick parts into a crate and send the list to the team.

## Run it

Use Node.js 22.18 or newer and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Vite serves the TypeScript modules and reloads changes.

```sh
npm run typecheck   # check the app and inspection pages without emitting files
npm run build       # typecheck, then produce the static site in dist/
npm run preview     # serve dist/ at http://localhost:4173
```

Stop the development server before using preview on the same port, or use
`npm run preview -- --port 4175`. Deploy `dist/` to a static host; serving the source
`site/` directory with a plain file server no longer compiles the app.

## Source layout

- `site/index.html`: Vite's main HTML entry point.
- `site/js/catalog.ts`: the bundles, prices and tiers (from the 2026–27 budget).
- `site/js/stage.ts`: the renderer. One WebGL context paints every figure into its own canvas.
- `site/js/app.ts`: the grid, part view, crate and info panel.
- `site/flight/` and `site/js/road/`: airplane geometry and road landmarks.
- `site/js/types.ts`: shared catalog, poster, slider and rendering contracts.
- `site/public/`: assets copied unchanged to the build, retaining URLs such as
  `/parts/*.bin`, `/posters/*.webp` and `/fonts/*.woff2`.
- `site/js/posters.ts`: generated poster metadata imported by the app.

The browser modules are TypeScript. The existing CAD conversion and rendering tools remain
Node/Python tools. Three.js and meshoptimizer are installed through npm; the small Torph
animation library remains vendored with its declaration file.

Inspection pages (`/dev-road.html`, `/dev-flight.html`, `/dev-slider.html`,
`/dev-posters.html`, `/sheet.html`, `/shot.html`) run through the Vite development server.
They are not included in the production build.

## Deployment

The root `vercel.json` selects Vite, runs `npm run build`, publishes `dist/`, and retains
the poster and font cache headers. Set the Vercel project's **Root Directory** to the
repository root (clear an existing `site` setting). Other static hosts can use the same
build command and output directory. The relative Vite base also supports hosting the
build under a subdirectory.

## Rebuilding a part

`tools/PARTS.md` describes the pipeline. In short:

```sh
npm --prefix tools ci
node tools/convert.mjs m3508-p19      # writes site/public/parts/m3508-p19.bin
```

The CAD files aren't in this repo. Each part's `cad/raw/<id>/manifest.json` records where its
CAD came from (download URL, licence notes, official dimensions); download it to the `src` path
in `tools/parts/<id>.json` before converting. Files the WASM importer can't mesh go through
`tools/occ_soup.py` (OpenCascade via CadQuery, in `tools/.venv`). Generic stock (filament spool,
carbon sheet, projectile) is modelled in `tools/models/`.

With the Vite development server running, regenerate missing or stale posters with
`npm run posters`. Use `npm run posters -- --ids item-c620,item-rpi5` to render specific
cells, or `--all` to render every cell. Set `CHROME_PATH` if Chrome is not auto-detected.
Commit the images in `site/public/posters/` together with `site/js/posters.ts`.
