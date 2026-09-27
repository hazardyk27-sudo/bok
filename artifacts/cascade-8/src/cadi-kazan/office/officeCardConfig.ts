export const OFFICE_MATCH_CARD_ID = "OFFICE_MATCH_6" as const;

export const OFFICE_MATCH_TARGET_RTP_BPS = 9_600;
export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_COLUMNS = 3;
export const OFFICE_MATCH_ROWS = 2;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;

export const OFFICE_MATCH_SYMBOLS = [
  { id: "KEVIN", label: "Kevin", multiplierBps: 200, special: false, assetKey: "office-kevin-2x", artworkUrl: "/cadi-kazan/office/office-kevin-2x.webp" },
  { id: "JIM", label: "Jim", multiplierBps: 500, special: false, assetKey: "office-jim-5x", artworkUrl: "/cadi-kazan/office/office-jim-5x.webp" },
  { id: "DWIGHT", label: "Dwight", multiplierBps: 1_000, special: false, assetKey: "office-dwight-10x", artworkUrl: "/cadi-kazan/office/office-dwight-10x.webp" },
  { id: "STANLEY", label: "Stanley", multiplierBps: 2_000, special: false, assetKey: "office-stanley-20x", artworkUrl: "/cadi-kazan/office/office-stanley-20x.webp" },
  { id: "MICHAEL", label: "Michael Scott", multiplierBps: 10_000, special: true, assetKey: "office-michael-100x", artworkUrl: "/cadi-kazan/office/office-michael-100x.webp" },
] as const;

export type OfficeMatchSymbolId = (typeof OFFICE_MATCH_SYMBOLS)[number]["id"];

export const OFFICE_MATCH_CARD_CONFIG = {
  id: OFFICE_MATCH_CARD_ID,
  title: "THE OFFICE",
  subtitle: "3 AYNI SEMBOLÜ BUL",
  cellCount: OFFICE_MATCH_CELL_COUNT,
  columns: OFFICE_MATCH_COLUMNS,
  rows: OFFICE_MATCH_ROWS,
  requiredMatches: OFFICE_MATCH_REQUIRED_MATCHES,
  targetRtpBps: OFFICE_MATCH_TARGET_RTP_BPS,
  specialSymbolId: "MICHAEL" as OfficeMatchSymbolId,
  symbols: OFFICE_MATCH_SYMBOLS,
} as const;
