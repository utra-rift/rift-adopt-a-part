/// <reference types="vite/client" />

interface Window {
  __long?: number[];
  __flightProbe?: (probe: { frame: () => void }) => void;
  flightProbe?: { frame: () => void };
  look?: (x: number, y: number) => void;
  strip?: ReturnType<typeof import("./js/flight.ts").flightStrip>;
  sliders?: Record<string, ReturnType<typeof import("./js/tierslider.ts").tierSlider>>;
  setv?: (id: string, value: string | number) => void;
  mag?: (id: string, sx?: number, sw?: number, scale?: number) => void;
  __posters?: unknown;
  __rift?: unknown;
  __ready?: boolean;
  __raf?: number;
  __road?: ReturnType<typeof import("./js/road.ts").roadStrip>;
  advance?: (ms: number, step?: number) => void;
}
