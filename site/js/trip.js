// The trip: the drive and the flights, each a full-width picture over a slider. A sponsor
// drags to choose how many km of the drive or how many seats to fund, watches the van get
// that far or the seats fill, and puts exactly that in the crate.
import { TRIP, tierFor, money } from "./catalog.js";
import { roadStrip } from "./road.js";
import { cabinStrip } from "./cabin.js";
import { tierSlider } from "./tierslider.js";

const count = (n) => n.toLocaleString("en-CA");

// km(), seats(): what the crate holds now. setKm(n), setSeats(n): make it hold exactly that.
export function tripSection({ km, seats, setKm, setSeats }) {
  const el = document.createElement("section");
  const total = TRIP.km * TRIP.perKm + TRIP.seats * TRIP.perSeat;
  el.className = "trip";
  el.setAttribute("aria-label", `Getting there, ${money(total)}`);
  el.innerHTML = `<p class="tier-label">Getting there <span>${money(total)}</span></p>`;
  const parts = [
    part(el, {
      art: roadStrip, label: "Kilometres of the drive to fund", max: TRIP.km, rate: TRIP.perKm,
      milestones: 500, milestoneLabel: (v) => `${count(v)} km`,
      unit: (v) => `${count(v)} km`, of: `of ${count(TRIP.km)}, there and back`, hint: "Drag to fund the drive",
      progress: (v) => v / TRIP.km, held: km, hold: setKm,
    }),
    part(el, {
      art: (host) => cabinStrip(host, { seats: TRIP.seats }), label: "Seats on the plane to fund", max: TRIP.seats, rate: TRIP.perSeat,
      milestones: 1, milestoneLabel: (v) => `${v}`,
      unit: (v) => `${v} ${v === 1 ? "seat" : "seats"}`, of: `of ${TRIP.seats}`, hint: "Drag to fund seats",
      progress: (v) => v, held: seats, hold: setSeats,
    }),
  ];
  return { el, sync: () => parts.forEach((p) => p.sync()) };
}

function part(parent, o) {
  const wrap = document.createElement("div");
  wrap.className = "trip-part";
  wrap.innerHTML = `<div class="trip-art"></div>
    <div class="trip-ctl">
      <div class="trip-slider"></div>
      <div class="trip-read"><p class="trip-now"></p><button class="adopt mono trip-adopt" type="button"></button></div>
    </div>`;
  parent.append(wrap);
  const now = wrap.querySelector(".trip-now"), btn = wrap.querySelector(".trip-adopt");
  const art = o.art(wrap.querySelector(".trip-art"));
  // The slider starts at what the crate holds, and follows the crate until it's moved.
  let value = o.held(), moved = false;
  const slider = tierSlider(wrap.querySelector(".trip-slider"), {
    label: o.label, max: o.max, step: 1, value, amountOf: (v) => v * o.rate,
    milestones: o.milestones, milestoneLabel: o.milestoneLabel,
    valueText: (v) => [o.unit(v), money(v * o.rate), tierFor(v * o.rate)?.name].filter(Boolean).join(", "),
    onInput: (v) => { value = v; moved = true; show(); },
  });
  function show() {
    const amount = value * o.rate, tier = tierFor(amount), held = o.held();
    art.set(o.progress(value));
    now.innerHTML = `<b>${o.unit(value)}</b><span class="mono muted">${[o.of, money(amount), tier?.name].filter(Boolean).join(" · ")}</span>`;
    btn.disabled = !value && !held;
    if (value && value === held) { btn.dataset.state = "crate"; btn.textContent = "In your crate"; return; }
    delete btn.dataset.state;
    btn.textContent = !value ? (held ? "Remove from crate" : o.hint)
      : `${held ? "Update crate" : "Adopt"} · ${o.unit(value)} · ${money(amount)}`;
  }
  btn.addEventListener("click", () => { if (value !== o.held()) { moved = false; o.hold(value); } });
  show();
  return {
    sync() {
      if (!moved && value !== o.held()) { value = o.held(); slider.set(value); }
      show();
    },
  };
}
