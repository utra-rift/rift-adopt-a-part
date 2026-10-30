// ?shim: drive frames from timers, for testing in a hidden or background tab.
    // (A hidden page gets no frames and no intersection callbacks, so both are stood in for.)
    if (new URLSearchParams(location.search).has("shim")) {
      window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
      document.head.insertAdjacentHTML("beforeend", "<style>.road-canvas, .road-map::before { transition: none !important; }</style>");
      window.IntersectionObserver = class implements IntersectionObserver {
        readonly root = null; readonly rootMargin = "0px"; readonly scrollMargin = "0px"; readonly thresholds = [0];
        constructor(private cb: IntersectionObserverCallback) {}
        observe(target: Element) { window.setTimeout(() => this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this), 0); }
        unobserve() {} disconnect() {} takeRecords(): IntersectionObserverEntry[] { return []; }
      };
    }
    // Vite reloads this module when the road source changes.
    import { roadStrip } from "../js/road.ts";
    // Inspection: ?w=1440&x=600&y=0&z=2 lays the strip out at a fixed width, magnifies it by z and shows it from (x, y).
    const qs = new URLSearchParams(location.search), host = document.getElementById("road");
    if (qs.get("w")) {
      document.body.style.overflow = "hidden";
      document.querySelector(".dev-pad").remove();
      host.style.width = qs.get("w") + "px";
      const z = +qs.get("z") || 1, x = +qs.get("x") || 0, y = +qs.get("y") || 0;
      host.style.transformOrigin = "0 0";
      host.style.transform = `translate(${-x * z}px, ${-y * z}px) scale(${z})`;
    }
    // ?solo=convocation|cpc: one landmark alone, for checking against its reference photo.
    // &cam=px,py,pz,tx,ty,tz,fov (landmark metres) puts it on a lawn under a free camera; &aspect=h/w.
    const strip = roadStrip(host, { solo: qs.get("solo"), cam: qs.get("cam"), aspect: +qs.get("aspect") || 0.62 });
    window.__road = strip;
    const f = document.querySelector<HTMLInputElement>("#" + "f"), o = document.getElementById("o");
    const q = qs.get("f");
    if (q !== null) f.value = q;
    const sync = () => { strip.set(+f.value); o.textContent = Math.round(Number(f.value) * 100) + "%"; };
    f.addEventListener("input", sync);
    sync();
