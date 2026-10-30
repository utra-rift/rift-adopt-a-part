// How an offer is drawn: its parts loaded and posed as one Figure or a Group, framed the
// way a grid cell frames it. Shared by the page and the poster maker (dev-posters.html),
// so a cell's poster and its live figure are the same picture.
import { loadPart, placeholderPart, Figure, Group } from "./stage.ts";
import { isAdopted } from "./catalog.ts";

export const partUrl = (id) => `parts/${id}.bin`;

// Every part is drawn at the same optical size: its visual mass (area-weighted spread,
// as the camera sees it) takes this fraction of the cell width, like a row of products
// photographed to read the same size. A bundle's parts are evened out among themselves
// (see Group in stage.ts), and together they fill this much of the box.
const VISUAL = 0.165, GROUP_FRAME = 0.66;
// A few parts read too large at the same optical size: a flat sheet is nearly all area. They
// are drawn at this fraction of it, in the grid and in the item view alike.
const OPTICAL = { "al-sheet-quarter": 0.7, "al-sheet-eighth": 0.7 };
export const opticalOf = (id) => OPTICAL[id] ?? 1;
export const cellFraming = (multi, k = 1) => (multi ? { frame: GROUP_FRAME } : { visual: VISUAL * k });

// Load the parts an offer shows; one part is a Figure, several stand together as a Group.
// An offer with nothing modelled yet stands in as a cube.
export async function figureFor(o) {
  const datas = o.show.length ? (await Promise.all(o.show.map((id) => loadPart(partUrl(id)).catch(() => null)))).filter(Boolean) : [placeholderPart()];
  if (!datas.length) throw new Error(`no figures for ${o.id}`);
  const fig = datas.length > 1 ? new Group(datas, { hero: o.hero }) : new Figure(datas[0]);
  fig.holo = isAdopted(o) ? 1 : 0;
  const multi = datas.length > 1;
  return { fig, multi, k: multi ? 1 : opticalOf(o.show[0]) };
}
