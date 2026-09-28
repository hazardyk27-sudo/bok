export const EUROPEAN_WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18,
  19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const WHEEL_GEOMETRY = {
  outerRadius: 1,
  outerWoodInnerRadius: 0.755,
  numberOuterRadius: 0.735,
  numberInnerRadius: 0.575,
  pocketOuterRadius: 0.575,
  pocketInnerRadius: 0.37,
  centerDiscRadius: 0.352,
  centerGuideRadius: 0.132,
  markerRadius: 0.866,
  markerCount: 8,
} as const;

export const WHEEL_COLORS = {
  woodDark: "#57210f",
  woodMid: "#873a17",
  woodLight: "#a95820",
  woodLine: "rgba(67, 23, 9, 0.45)",
  goldDark: "#8d5708",
  gold: "#e1a628",
  goldLight: "#ffd86a",
  red: "#c72816",
  black: "#151919",
  green: "#167934",
  greenAlt: "#1b843a",
  ivory: "#f5e5bd",
} as const;

export const SEGMENT_COUNT = EUROPEAN_WHEEL_SEQUENCE.length;
export const SEGMENT_ANGLE = (Math.PI * 2) / SEGMENT_COUNT;
export const TOP_SEGMENT_CENTER = -Math.PI / 2;

export function getNumberColor(value: number) {
  if (value === 0) return WHEEL_COLORS.green;
  return RED_NUMBERS.has(value) ? WHEEL_COLORS.red : WHEEL_COLORS.black;
}
