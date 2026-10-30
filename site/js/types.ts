export interface BudgetLine {
  n: number;
  name: string;
  qty: number;
  price: number;
  cad: string | null;
  note?: string;
  unit?: string;
  adopted?: string;
  parts?: { name: string; qty: number; cad: string; unit?: string }[];
}

export interface Offer {
  id: string;
  code: string;
  name: string;
  lines: string[];
  show: string[];
  line: string;
  seat?: boolean;
  hero?: boolean;
}

export interface Poster {
  show: string;
  hero: boolean;
  holo: boolean;
  floor: number;
  width: number;
  parts: string;
  v: string;
}

export interface TierSliderOptions {
  label: string;
  max: number;
  step?: number;
  value?: number;
  amountOf?: (value: number) => number;
  onInput?: (value: number) => void;
  valueText?: (value: number) => string;
  milestones?: number;
  milestoneLabel?: (value: number) => string;
  thumbLabel?: (value: number) => string;
}

export interface ViewOptions {
  azimuth?: number;
  elevation?: number;
  fill?: number;
  frame?: number;
  span?: number;
  visual?: number;
  dpr?: number;
}

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
