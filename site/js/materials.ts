// The sponsorship tiers' materials, exactly as the tier slider paints them (css/tierslider.css,
// the `--mat` gradients, and the Title foil's six stops). One source for every module that wants
// to echo the slider: the flight strip imports it.
//
// Each metal runs deep -> mid -> light -> highlight, the order a lit metal band shows them.
export const TIER_MATERIALS = {
  none:   { deep: "#26262a", mid: "#8e8e96", light: "#c2c2c8", hi: "#ffffff" },
  bronze: { deep: "#6e3819", mid: "#b06a36", light: "#d08c58", hi: "#f8d6b4" },
  silver: { deep: "#4f565e", mid: "#7c858f", light: "#a2abb5", hi: "#e2e7ec" },
  gold:   { deep: "#7a5408", mid: "#b98a1a", light: "#dcae35", hi: "#fff4be" },
};
export const TITLE_FOIL = ["#e0406a", "#e88a2a", "#b9b020", "#2fb47a", "#2a8fd8", "#8a5ae0"];

// Which material a number of funded seats shows (the slider's thresholds: 1, 2, 4, 6 seats).
export const tierOfSeats = (n) => (n >= 6 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0);
