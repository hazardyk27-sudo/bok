export type ScratchCellMode = "STANDARD" | "ADVANCED";

export type ScratchCellPresentation = {
  symbol: string;
  label: string;
  resultClass: "safe" | "bomb" | null;
};

export function getScratchCellPresentation(
  mode: ScratchCellMode,
  revealed: boolean,
  bomb: boolean,
): ScratchCellPresentation {
  if (!revealed) return { symbol: "", label: "", resultClass: null };
  if (bomb) {
    return {
      symbol: mode === "ADVANCED" ? "⚠" : "💣",
      label: mode === "ADVANCED" ? "ALARM" : "BOMBA",
      resultClass: "bomb",
    };
  }
  return { symbol: "✦", label: "GOLD", resultClass: "safe" };
}