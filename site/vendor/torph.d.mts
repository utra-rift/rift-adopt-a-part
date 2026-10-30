export interface TextMorphOptions {
  element: Element;
  locale?: string;
  numbers?: boolean;
  respectReducedMotion?: boolean;
  ease?: string | { stiffness?: number; damping?: number };
  [option: string]: unknown;
}
export class TextMorph {
  constructor(options: TextMorphOptions);
  update(value: string | number): void;
  destroy(): void;
}
