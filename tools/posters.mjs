// Renders grid cells' posters: the figure at rest, drawn by site/dev-posters.html in
// headless Chrome, encoded as WebP at each width, with site/posters/manifest.js listing
// what each one shows and where its shadow sits. Only cells whose poster is missing or
// stale (the offer shows other parts, or a part file changed) are rendered, unless --all.
// Needs the dev server (tools/serve.py).
//
//   node tools/posters.mjs [http://localhost:4173] [--all | --ids item-c620,item-rpi5]
//
// Chrome: $CHROME_PATH, else Google Chrome, else a Playwright Chromium.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { OFFERS, ITEMS, isAdopted } from "../site/js/catalog.js";

// Device-pixel widths. The page picks the smallest that covers the cell (srcset), so a
// poster is never scaled down by more than ~1.33×, which keeps its 1 px lines close to the
// live figure's when the two cross-fade. 800 covers the widest cell at 2× (47vw at 719 px).
const WIDTHS = [360, 480, 640, 800];
const SITE = join(dirname(fileURLToPath(import.meta.url)), "../site"), OUT = join(SITE, "posters");

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? "http://localhost:4173";

// What each cell's poster depends on: the offer's parts (and their files), bundle layout, look.
const offers = [...new Map([...ITEMS, ...OFFERS].map((o) => [o.id, o])).values()];
const partHash = (id) => (existsSync(join(SITE, `parts/${id}.bin`)) ? createHash("sha1").update(readFileSync(join(SITE, `parts/${id}.bin`))).digest("hex") : "none");
const keyOf = (o) => ({ show: o.show.join(","), hero: !!o.hero, holo: isAdopted(o), parts: createHash("sha1").update(o.show.map(partHash).join()).digest("hex").slice(0, 10) });
const manifestPath = join(OUT, "manifest.js");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8").match(/export default (\{[\s\S]*\});/)[1]) : {};
const stale = (o) => { const p = old[o.id], k = keyOf(o); return !p || Object.keys(k).some((f) => p[f] !== k[f]) || WIDTHS.some((w) => !existsSync(join(OUT, `${o.id}-${w}.webp`))); };
const ids = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : offers.filter((o) => args.includes("--all") || stale(o)).map((o) => o.id);
const manifest = Object.fromEntries(Object.entries(old).filter(([id]) => offers.some((o) => o.id === id)));
if (!ids.length) { console.log("Posters are up to date."); write(); process.exit(0); }

function chrome() {
  const pw = join(homedir(), "Library/Caches/ms-playwright"), linux = join(homedir(), ".cache/ms-playwright");
  const found = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  for (const root of [pw, linux]) if (existsSync(root)) for (const d of readdirSync(root).sort().reverse()) found.push(
    join(root, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    join(root, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"), join(root, d, "chrome-linux64/chrome"), join(root, d, "chrome-headless-shell-linux64/chrome-headless-shell"));
  return found.find((p) => p && existsSync(p));
}

const bin = chrome();
if (!bin) { console.error("No Chrome found; set CHROME_PATH."); process.exit(1); }
const profile = mkdtempSync(join(tmpdir(), "posters-"));
const proc = spawn(bin, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "about:blank"]);
const done = (code) => { proc.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true }); process.exit(code); };
const port = await new Promise((ok, fail) => {
  let text = "";
  proc.stderr.on("data", (d) => { text += d; const m = text.match(/ws:\/\/[^:]+:(\d+)\//); if (m) ok(+m[1]); });
  setTimeout(() => fail(new Error("Chrome did not start")), 20000);
});
const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const d = JSON.parse(e.data);
  if (d.id) pending.get(d.id)?.(d);
  else if (d.method === "Runtime.exceptionThrown") { console.error(d.params.exceptionDetails.exception?.description); done(1); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1200, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${base}/dev-posters.html?widths=${WIDTHS}&ids=${ids}` });
const start = Date.now();
while (!(await evaluate("!!window.__posters"))) {
  if (Date.now() - start > 180000) { console.error("dev-posters.html did not finish"); done(1); }
  await new Promise((r) => setTimeout(r, 250));
}
const cells = await evaluate("window.__posters.cells");
const count = await evaluate("window.__posters.images.length");

mkdirSync(OUT, { recursive: true });
const hashes = new Map();
let bytes = 0;
for (let i = 0; i < count; i++) {
  const { id, w, png } = await evaluate(`window.__posters.images[${i}]`);
  // Lossless alpha keeps the silhouette's edge exactly where the live figure draws it.
  const webp = await sharp(Buffer.from(png.split(",")[1], "base64")).webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
  writeFileSync(join(OUT, `${id}-${w}.webp`), webp);
  bytes += webp.length;
  hashes.set(id, createHash("sha1").update(hashes.get(id) ?? "").update(webp).digest("hex"));
}
for (const [id, c] of Object.entries(cells)) manifest[id] = { ...c, parts: keyOf(offers.find((o) => o.id === id)).parts, v: hashes.get(id).slice(0, 10) };
write();
console.log(`${Object.keys(cells).length} cells, ${count} posters, ${(bytes / 1024).toFixed(0)} KB`);
done(0);

function write() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(manifestPath, `// Generated by tools/posters.mjs; don't edit. Each grid cell's poster: what it shows (so
// the page skips a stale one), the parts it was drawn from, its version (the cache key) and
// where its shadow sits.
export const WIDTHS = ${JSON.stringify(WIDTHS)};
export default ${JSON.stringify(manifest, null, 1)};
`);
  // Posters for cells that no longer exist.
  const keep = new Set(Object.keys(manifest).flatMap((id) => WIDTHS.map((w) => `${id}-${w}.webp`)));
  for (const f of readdirSync(OUT)) if (f.endsWith(".webp") && !keep.has(f)) unlinkSync(join(OUT, f));
}
