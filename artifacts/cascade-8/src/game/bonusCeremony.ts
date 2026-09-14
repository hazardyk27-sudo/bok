import type { SpinResult } from "../engine/types";

type BonusCeremonyElements = {
  overlay: HTMLElement;
  scatterRow: HTMLElement;
  triggerLabel: HTMLElement;
  spinCount: HTMLElement;
};

type BonusCeremonyState = Pick<SpinResult, "bonusTriggerScatterCount" | "freeSpinsAwarded">;

export function renderBonusCeremony(
  elements: BonusCeremonyElements,
  active: boolean,
  state: BonusCeremonyState,
  assetBaseUrl: string,
) {
  const scatterCount = state.bonusTriggerScatterCount;
  elements.overlay.hidden = !active;
  elements.spinCount.textContent = String(state.freeSpinsAwarded);
  elements.triggerLabel.textContent = active
    ? `TRIGGERED BY ${scatterCount} SCATTERS`
    : "";
  elements.scatterRow.className = `bonus-scatter-row count-${scatterCount}`;
  elements.scatterRow.innerHTML = active
    ? Array.from({ length: scatterCount }, (_, index) =>
      `<span class="bonus-scatter-token" style="--scatter-index:${index}"><img src="${assetBaseUrl}special-symbols/scatter.png" alt="Triggering scatter ${index + 1}"></span>`,
    ).join("")
    : "";
}