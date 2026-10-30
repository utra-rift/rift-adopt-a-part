// Capture page: one part.  ?id=…&px=600&spin=deg&elev=deg&az=deg&fill=0.8&span=mm
// Looks: &real=1 (true colours) &holo=1 (adopted hologram)
import { loadPart, Figure, View } from "../js/stage.ts";
const Q = new URLSearchParams(location.search);
const px = +(Q.get("px") ?? 600); Object.assign(document.querySelector<HTMLCanvasElement>("#c").style, { width: px + "px", height: px + "px" });
try {
  const data = await loadPart(`parts/${Q.get("id")}.bin`);
  const f = new Figure(data);
  const v = new View(document.querySelector<HTMLCanvasElement>("#c"), f, { fill: +(Q.get("fill") ?? 0.8), ...(Q.has("az") ? { azimuth: +Q.get("az") } : {}), ...(Q.has("elev") ? { elevation: +Q.get("elev") } : {}), ...(Q.has("span") ? { span: +Q.get("span") } : {}) });
  v.spin = +(Q.get("spin") ?? 0);
  f.holo = +(Q.get("holo") ?? 0);
  f.color = +(Q.get("real") ?? 0);
  v.paint();
  addEventListener("resize", () => { v.resize(); v.paint(); });
  document.title = `${Q.get("id")} ${data.header.size.map((x) => x.toFixed(1)).join("x")}`;
  window.__ready = true;
} catch (e) { document.getElementById("err").textContent = e.message; console.error(e); }
