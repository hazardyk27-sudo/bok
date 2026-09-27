export const OFFICE_CARD_ART_URL = new URL("./assets/office-card-master.png", import.meta.url).href;

const OFFICE_ARTWORK_URLS = {
  KEVIN: new URL("./assets/office-kevin-2x.webp", import.meta.url).href,
  JIM: new URL("./assets/office-jim-5x.webp", import.meta.url).href,
  DWIGHT: new URL("./assets/office-dwight-10x.webp", import.meta.url).href,
  STANLEY: new URL("./assets/office-stanley-20x.webp", import.meta.url).href,
  MICHAEL: new URL("./assets/office-michael-100x.webp", import.meta.url).href,
} as const;

export const OFFICE_MATCH_CARD_ID = "OFFICE_MATCH_6" as const;

export const OFFICE_MATCH_TARGET_RTP_BPS = 9_600;
export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_COLUMNS = 3;
export const OFFICE_MATCH_ROWS = 2;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;

export const OFFICE_MATCH_SYMBOLS = [
  { id: "KEVIN", label: "Kevin", multiplierBps: 200, special: false, assetKey: "office-kevin-2x", artworkUrl: OFFICE_ARTWORK_URLS.KEVIN },
  { id: "JIM", label: "Jim", multiplierBps: 500, special: false, assetKey: "office-jim-5x", artworkUrl: OFFICE_ARTWORK_URLS.JIM },
  { id: "DWIGHT", label: "Dwight", multiplierBps: 1_000, special: false, assetKey: "office-dwight-10x", artworkUrl: OFFICE_ARTWORK_URLS.DWIGHT },
  { id: "STANLEY", label: "Stanley", multiplierBps: 2_000, special: false, assetKey: "office-stanley-20x", artworkUrl: OFFICE_ARTWORK_URLS.STANLEY },
  { id: "MICHAEL", label: "Michael Scott", multiplierBps: 10_000, special: true, assetKey: "office-michael-100x", artworkUrl: OFFICE_ARTWORK_URLS.MICHAEL },
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
