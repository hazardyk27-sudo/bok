export type ScratchCellMode = "STANDARD" | "ADVANCED";

export type ScratchCellPresentation = {
  symbol: string;
  label: string;
  resultClass: "safe" | "bomb" | null;
};

export function getScratchCellLayerMarkup() {
  return `
    <span class="witch-cell-result-layer" aria-hidden="true">
      <span class="witch-cell-aura"></span>
      <span class="witch-cell-content"></span>
      <span class="witch-cell-result-label"></span>
    </span>
    <canvas class="witch-scratch-layer witch-scratch-layer-base" data-scratch-layer="base" aria-hidden="true"></canvas>
    <canvas class="witch-scratch-layer witch-scratch-layer-foil" data-scratch-layer="foil" aria-hidden="true"></canvas>
    <canvas class="witch-scratch-layer witch-scratch-layer-lacquer" data-scratch-layer="lacquer" aria-hidden="true"></canvas>
    <canvas class="witch-debris-canvas" aria-hidden="true"></canvas>
  `;
}

export function getScratchCellPresentation(
  mode: ScratchCellMode,
  revealed: boolean,
  bomb: boolean,
): ScratchCellPresentation {
  void mode;
  if (!revealed) return { symbol: "", label: "", resultClass: null };
  if (bomb) return { symbol: "●", label: "BOMBA", resultClass: "bomb" };
  return { symbol: "✦", label: "ALTIN", resultClass: "safe" };
}
