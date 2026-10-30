// The trip: the drive and the flights, each a full-width picture over a slider. A sponsor
// drags to choose how many km of the drive or how many seats to fund, watches the van get
// that far or the plane gather speed, and puts exactly that in the crate.
import { TRIP, tierFor, money } from "./catalog.ts";
import { roadStrip } from "./road.ts";
import { flightStrip } from "./flight.ts";
import { tierSlider } from "./tierslider.ts";
import { TextMorph } from "../vendor/torph.mjs";

const count = (n) => n.toLocaleString("en-CA");

// Both sliders snap to stops: the drive every 500 km, with the whole trip as the last stop
// (the final stretch runs 534 km rather than leaving a 34 km sliver), the flights one seat
// at a time.
const KM_STOPS = [...Array.from({ length: Math.floor((TRIP.km - 1) / 500) }, (_, i) => i * 500), TRIP.km];
const SEAT_STOPS = Array.from({ length: TRIP.seats + 1 }, (_, i) => i);

// km(), seats(): what the crate holds now. setKm(n), setSeats(n): make it hold exactly that.
// `el`: the section to fill, already in the page so the strips know their width as they're built.
export function tripSection({ el = document.createElement("section"), km, seats, setKm, setSeats }) {
  const total = TRIP.km * TRIP.perKm + TRIP.seats * TRIP.perSeat;
  el.className = "trip";
  el.setAttribute("aria-label", `Getting there, ${money(total)}`);
  el.innerHTML = `<p class="tier-label">Getting there <span>${money(total)}</span></p>`;
  const parts = [
    part(el, {
      art: roadStrip, label: "Kilometres of the drive to fund", stops: KM_STOPS, rate: TRIP.perKm,
      unit: (q) => `${count(q)} km`, noun: () => "km", of: `of ${count(TRIP.km)}, there and back`, hint: "Drag to fund the drive",
      progress: (q) => q / TRIP.km, held: km, hold: setKm,
    }),
    part(el, {
      art: (host) => flightStrip(host, { seats: TRIP.seats }), label: "Seats on the plane to fund", stops: SEAT_STOPS, rate: TRIP.perSeat,
      unit: (q) => `${q} ${q === 1 ? "seat" : "seats"}`, noun: (q) => (q === 1 ? "seat" : "seats"), of: `of ${TRIP.seats}`, hint: "Drag to fund seats",
      progress: (q) => q, held: seats, hold: setSeats,
    }),
  ];
  return { el, sync: () => parts.forEach((p) => p.sync()) };
}

// The slider moves in stop indices; everything else speaks in km or seats (`q`).
function part(parent, o) {
  const wrap = document.createElement("div");
  wrap.className = "trip-part";
  wrap.innerHTML = `<div class="trip-art"></div>
    <div class="trip-ctl">
      <div class="trip-slider"></div>
      <div class="trip-read">
        <p class="trip-now"><b><span data-m="count"></span> <span data-m="noun"></span></b><span class="mono muted">${o.of}<span data-m="tier"></span></span></p>
        <button class="adopt mono trip-adopt" type="button"></button>
      </div>
    </div>`;
  parent.append(wrap);
  const btn = wrap.querySelector<HTMLButtonElement>(".trip-adopt");
  // The readout's numbers roll by place value as the slider moves (torph).
  const morph = (key, opts = {}) => new TextMorph({ element: wrap.querySelector(`[data-m="${key}"]`), locale: "en-CA",
    ease: { stiffness: 260, damping: 26 }, respectReducedMotion: true, ...opts });
  const m = { count: morph("count", { numbers: true }), noun: morph("noun"), tier: morph("tier") };
  const art = o.art(wrap.querySelector(".trip-art"));
  const q = (i) => o.stops[i];
  // The stop nearest what the crate holds (a km amount from before stops existed may fall between).
  const stopOf = (held) => o.stops.reduce((best, s, i) => (Math.abs(s - held) < Math.abs(o.stops[best] - held) ? i : best), 0);
  // The slider starts at what the crate holds, and follows the crate until it's moved.
  let at = stopOf(o.held()), moved = false;
  const slider = tierSlider(wrap.querySelector(".trip-slider"), {
    label: o.label, max: o.stops.length - 1, step: 1, value: at, amountOf: (i) => q(i) * o.rate,
    milestones: 1, milestoneLabel: (i) => o.unit(q(i)), thumbLabel: (i) => money(q(i) * o.rate),
    valueText: (i) => [o.unit(q(i)), money(q(i) * o.rate), tierFor(q(i) * o.rate)?.name].filter(Boolean).join(", "),
    onInput: (i) => { at = i; moved = true; show(); },
  });
  function show() {
    const value = q(at), amount = value * o.rate, tier = tierFor(amount), held = o.held();
    art.set(o.progress(value));
    m.count.update(value); m.noun.update(o.noun(value)); m.tier.update(tier ? ` · ${tier.name}` : "");
    btn.disabled = !value && !held;
    if (value && value === held) { btn.dataset.state = "crate"; btn.textContent = "In your crate"; return; }
    delete btn.dataset.state;
    btn.textContent = !value ? (held ? "Remove from crate" : o.hint)
      : `${held ? "Update crate" : "Adopt"} · ${o.unit(value)} · ${money(amount)}`;
  }
  btn.addEventListener("click", () => { if (q(at) !== o.held()) { moved = false; o.hold(q(at)); } });
  show();
  return {
    sync() {
      if (!moved && q(at) !== o.held()) { at = stopOf(o.held()); slider.set(at); }
      show();
    },
  };
}
