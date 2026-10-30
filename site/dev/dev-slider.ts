import { tierSlider } from "../js/tierslider.ts";
    import { tierFor, money } from "../js/catalog.ts";

    const configs = {
      drive: {
        label: "Kilometres to fund", max: 4534, step: 1, amountOf: (km) => km * 0.5,
        milestones: 500, milestoneLabel: (km) => `${km.toLocaleString("en-CA")} km`,
        thumbLabel: (km) => `${km.toLocaleString("en-CA")} km`,
        valueText: (km) => `${km.toLocaleString("en-CA")} km, ${money(km * 0.5)}${tierFor(km * 0.5) ? ", " + tierFor(km * 0.5).name : ""}`,
      },
      flights: {
        label: "Seats to fund", max: 8, step: 1, amountOf: (n) => n * 916.74,
        milestones: 1, milestoneLabel: (n) => String(n),
        thumbLabel: (n) => `${n} seat${n === 1 ? "" : "s"}`,
        valueText: (n) => `${n} seat${n === 1 ? "" : "s"}, ${money(n * 916.74)}${tierFor(n * 916.74) ? ", " + tierFor(n * 916.74).name : ""}`,
      },
    };

    window.sliders = {};
    for (const [id, cfg] of Object.entries(configs)) {
      const log = document.getElementById(`${id}-log`);
      let count = 0;
      const show = (v) => {
        const a = cfg.amountOf(v);
        log.textContent = `${v} · ${money(a)} · ${tierFor(a)?.name ?? "—"} · onInput ×${count}`;
      };
      const s = tierSlider(document.getElementById(id), { ...cfg, onInput: (v) => { count++; show(v); console.log(id, v); } });
      window.sliders[id] = s;
      show(s.value);
    }

    // Console helpers: drive a slider as a user would (fires onInput and the crossing effects),
    // and magnify a slice of a slider's canvas at device resolution.
    window.setv = (id, v) => {
      const i = document.querySelector<HTMLInputElement>(`#${id} input`);
      i.value = String(v);
      i.dispatchEvent(new Event("input", { bubbles: true }));
    };
    window.mag = (id, sx = 0, sw = 400, scale = 2) => {
      document.getElementById("mag")?.remove();
      if (sw === 0) return;
      const c = document.querySelector<HTMLCanvasElement>(`#${id} canvas`);
      const d = c.width / c.clientWidth;
      const o = document.createElement("canvas");
      o.id = "mag";
      o.width = sw * d;
      o.height = c.height;
      o.getContext("2d").drawImage(c, sx * d, 0, sw * d, c.height, 0, 0, sw * d, c.height);
      o.style.cssText = `position:fixed;left:0;bottom:0;width:${(sw * d * scale) / 2}px;image-rendering:pixelated;background:#fff;outline:1px solid #f00;z-index:9`;
      document.body.append(o);
    };

    // Frames per second actually requested by the page.
    const fps = document.getElementById("fps");
    let lastCount = window.__raf;
    setInterval(() => { fps.textContent = `raf/s ${window.__raf - lastCount}`; lastCount = window.__raf; }, 1000);
