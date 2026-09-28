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
  numberOuterRadius: 0.742,
  numberInnerRadius: 0.592,
  pocketOuterRadius: 0.592,
  pocketInnerRadius: 0.37,
  centerDiscRadius: 0.352,
  centerGuideRadius: 0.132,
  markerRadius: 0.866,
  markerCount: 8,
} as const;

export const OUTER_RIM_STYLE = {
  panelCount: 8,
  grainCount: 26,
  grainInnerRadius: 0.778,
  grainOuterRadius: 0.968,
  grainOpacity: 0.24,
  outerBevelRadius: 0.988,
  outerHighlightRadius: 0.975,
  innerBevelRadius: 0.760,
  innerShadowRadius: 0.773,
  varnishRadius: 0.900,
  varnishWidth: 0.130,
  markerWidth: 0.045,
  markerHeight: 0.021,
} as const;

export const NUMBER_RING_STYLE = {
  textRadius: 0.667,
  fontSize: 0.059,
  textScaleX: 0.84,
  separatorWidth: 0.0058,
  railWidth: 0.0105,
  innerHighlightOffset: 0.010,
} as const;

export const POCKET_RING_STYLE = {
  separatorWidth: 0.0064,
  railWidth: 0.010,
  outerShadowInset: 0.012,
  innerHighlightInset: 0.013,
  troughInset: 0.028,
  centerSheenRadius: 0.487,
} as const;

export const CENTER_MECHANISM_STYLE = {
  baseOuterRadius: 0.142,
  baseMiddleRadius: 0.112,
  baseInnerRadius: 0.083,
  hubRadius: 0.057,
  hubHighlightRadius: 0.027,
  armCount: 4,
  armStartAngle: -1.7453292519943295,
  armLength: 0.245,
  armStartRadius: 0.046,
  armWidth: 0.026,
  knobRadius: 0.036,
  knobHighlightOffset: 0.010,
} as const;

export const WHEEL_COLORS = {
  woodDeep: "#351006",
  woodDark: "#57210f",
  woodMid: "#873a17",
  woodLight: "#a95820",
  woodGlow: "#c67432",
  woodLine: "rgba(67, 23, 9, 0.45)",
  goldShadow: "#6d3f05",
  goldDark: "#8d5708",
  gold: "#e1a628",
  goldLight: "#ffd86a",
  goldSpecular: "#fff0a3",
  redDark: "#8d160d",
  red: "#c72816",
  redLight: "#e14428",
  blackDark: "#070909",
  black: "#151919",
  blackLight: "#2b302f",
  greenDeep: "#06441d",
  greenDark: "#0b4d22",
  green: "#167934",
  greenLight: "#29914a",
  greenAlt: "#1b843a",
  greenSheen: "#3aa55b",
  ivory: "#f6df9f",
  ivoryLight: "#fff5c8",
} as const;

export const SEGMENT_COUNT = EUROPEAN_WHEEL_SEQUENCE.length;
export const SEGMENT_ANGLE = (Math.PI * 2) / SEGMENT_COUNT;
export const TOP_SEGMENT_CENTER = -Math.PI / 2;

export function getNumberColor(value: number) {
  if (value === 0) return WHEEL_COLORS.green;
  return RED_NUMBERS.has(value) ? WHEEL_COLORS.red : WHEEL_COLORS.black;
}
