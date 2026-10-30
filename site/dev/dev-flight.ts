import { flightStrip } from "../js/flight.ts";
    const q = new URLSearchParams(location.search);
    if (q.has("nopad")) document.querySelector<HTMLElement>(".dev-pad").style.height = "0";
    // ?far: the strip starts 4 screens down, to test that nothing heavy is built before it is near
    if (q.has("far")) { document.querySelector<HTMLElement>(".dev-pad").style.height = 4 * innerHeight + "px"; document.body.style.minHeight = 6 * innerHeight + "px"; }
    window.__long = [];
    window.__flightProbe = (p) => { window.flightProbe = p; };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch {}
    // ?w=1440 pins the strip's width; ?z=3 magnifies it (a transform, layout untouched) to inspect detail.
    const host = document.getElementById("flight"), z = +q.get("z") || 1;
    if (q.get("w") || z !== 1) { host.style.width = (+q.get("w") || innerWidth) + "px"; document.body.style.overflow = "auto"; }
    if (z !== 1) { host.style.transform = `scale(${z})`; host.style.transformOrigin = "0 0"; document.body.style.width = z * (+q.get("w") || innerWidth) + "px"; document.body.style.height = "3000px"; }
    window.look = (x, y) => scrollTo(x * z, 96 + y * z);
    const strip = flightStrip(host);
    const n = document.querySelector<HTMLInputElement>("#" + "n"), out = document.getElementById("out");
    if (q.get("n")) n.value = q.get("n");
    const go = () => { strip.set(+n.value); out.textContent = n.value; };
    n.addEventListener("input", go);
    go();
    window.strip = strip;
    // frames per second, from the strip's own frame requests
    let seen = window.__raf, t0 = performance.now();
    setInterval(() => { const t = performance.now(); document.getElementById("fps").textContent = `${Math.round((window.__raf - seen) * 1000 / (t - t0))} fps`; seen = window.__raf; t0 = t; }, 1000);
