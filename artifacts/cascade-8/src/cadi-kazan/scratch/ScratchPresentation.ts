const ADVANCED_25_PAW_ART_URL = new URL("../advanced/assets/advanced25-paw.webp", import.meta.url).href;
const ADVANCED_25_SKULL_ART_URL = new URL("../advanced/assets/advanced25-skull.webp", import.meta.url).href;

export type ScratchCellPresentation = {
  symbol: string;
  label: string;
  resultClass: "safe" | "bomb" | null;
  artworkUrl?: string | null;
  artworkAlt?: string;
};

export function getScratchCellLayerMarkup() {
  return `
    <span class="witch-cell-result-layer" aria-hidden="true">
      <span class="witch-cell-aura"></span>
      <span class="witch-cell-content"></span>
      <span class="witch-cell-result-label"></span>
    </span>
    <canvas class="witch-scratch-layer witch-scratch-layer-base" data-scratch-layer="base"></canvas>
    <canvas class="witch-scratch-layer witch-scratch-layer-foil" data-scratch-layer="foil"></canvas>
    <canvas class="witch-scratch-layer witch-scratch-layer-lacquer" data-scratch-layer="lacquer"></canvas>
    <canvas class="witch-debris-canvas"></canvas>
  `;
}

export function getScratchCellPresentation(
  mode: "STANDARD" | "ADVANCED",
  revealed: boolean,
  bomb: boolean,
): ScratchCellPresentation {
  if (!revealed) return { symbol: "", label: "", resultClass: null, artworkUrl: null };

  if (mode === "STANDARD") {
    return bomb
      ? {
          symbol: "",
          label: "I AM THE DANGER",
          resultClass: "bomb",
          artworkUrl: "/cadi-kazan/bcs-danger.webp",
          artworkAlt: "I AM THE DANGER",
        }
      : {
          symbol: "",
          label: "SAUL GOODMAN",
          resultClass: "safe",
          artworkUrl: "/cadi-kazan/bcs-saul.webp",
          artworkAlt: "Saul Goodman",
        };
  }

  if (bomb) {
    return {
      symbol: "",
      label: "KEDİ KAFATASI · BOMBA",
      resultClass: "bomb",
      artworkUrl: ADVANCED_25_SKULL_ART_URL,
      artworkAlt: "Kedi kafatası",
    };
  }

  return {
    symbol: "",
    label: "ALTIN PATİ",
    resultClass: "safe",
    artworkUrl: ADVANCED_25_PAW_ART_URL,
    artworkAlt: "Altın pati",
  };
}
