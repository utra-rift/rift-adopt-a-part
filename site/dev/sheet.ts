// Contact sheet: grid cells rendered the way the site draws them, for checking sizing and
// composition.  ?ids=finish,match (default: every bundle)  &all=1  &real=1  &spin=35  &cols=4
import { OFFERS, ITEMS, isAdopted } from "../js/catalog.ts";
import { loadPart, Figure, Group, View } from "../js/stage.ts";
import { cellFraming } from "../js/figure.ts";
const Q = new URLSearchParams(location.search);
document.body.style.setProperty("--cols", Q.get("cols") ?? "4");
const offers = Q.has("ids") ? Q.get("ids").split(",").map((id) => [...OFFERS, ...ITEMS].find((o) => o.id === id))
  : OFFERS.filter((o) => Q.has("all") || o.show.length > 1);
for (const o of offers) {
  const el = document.createElement("div"); el.className = "c";
  el.innerHTML = `<div class="fig"><canvas></canvas></div><p>${o.code} · ${o.show.join(", ")}</p>`;
  document.getElementById("m").append(el);
  const datas = await Promise.all(o.show.map((id) => loadPart(`parts/${id}.bin`)));
  const fig = datas.length > 1 ? new Group(datas, { hero: o.hero }) : new Figure(datas[0]);
  fig.holo = isAdopted(o) ? 1 : 0;
  fig.color = +(Q.get("real") ?? 0);
  const v = new View(el.querySelector("canvas"), fig, cellFraming(datas.length > 1));
  v.spin = +(Q.get("spin") ?? 0);
  v.paint();
}
window.__ready = true;
