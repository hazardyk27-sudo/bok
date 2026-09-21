export type ScratchCellMode = "STANDARD" | "ADVANCED";

export type ScratchCellPresentation = {
  symbol: string;
  label: string;
  resultClass: "safe" | "bomb" | null;
};

export function getScratchCellLayerMarkup() {
  return `
    <span class="witch-cell-result-layer" aria-hidden="true">
      <span class="witch-cell-content"></span>
      <span class="witch-cell-result-label"></span>
    </span>
    <canvas class="witch-scratch-canvas" aria-hidden="true"></canvas>
    <canvas class="witch-debris-canvas" aria-hidden="true"></canvas>
  `;
}

export function getScratchCellPresentation(
  mode: ScratchCellMode,
  revealed: boolean,
  bomb: boolean,
): ScratchCellPresentation {
  if (!revealed) return { symbol: "", label: "", resultClass: null };
  if (bomb) {
    return {
      symbol: "💣",
      label: "BOMBA",
      resultClass: "bomb",
    };
  }
  return { symbol: "✦", label: "GOLD", resultClass: "safe" };
}