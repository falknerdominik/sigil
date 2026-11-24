export interface Point {
  x: number;
  y: number;
}
export type PathContext = Pick<
  CanvasRenderingContext2D,
  'moveTo' | 'lineTo' | 'arc'
>;
export type PaletteKey = 'background' | 'lines' | 'vertices';
export type ThemePalette = Record<PaletteKey, string>;
export interface DrawingSettings {
  design: string;
  style: string;
  curvature: number;
  arcSide: string;
  dotStyle: string;
  vertexSize: number;
  vertexStroke: number;
  chordOpacity: number;
  orbitOpacity: number;
  orbitWidth: number;
  orbitLineStyle: string;
  identityTickWidth: number;
  identityTickLineStyle: string;
  identityTickShape: string;
  identityDotSize: number;
  identityDotFill: string;
  identitySquareSize: number;
  identitySquareFill: string;
  identitySquareOrientation: string;
  identityPointStrokeWidth: number;
  identityMarkerOpacity: number;
  handDrawnInk: boolean;
  inkWobble: number;
  inkPressure: number;
  inkFeather: number;
  rankComplexity: boolean;
  base: string;
  polygonSides: string | number;
  baseBend: number;
  vertexLabels: string;
  rotation: number;
  stretch: number;
  mirror: boolean;
  guides: boolean;
  decorations: boolean;
  cornerOrnaments: boolean;
  decorationSeed: number;
  labels: boolean;
  themeColors: ThemePalette | null;
}
/** Limit editable Canvas dimensions to the same ranges as the form. */
export function styleNumber(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : defaultValue;
}
