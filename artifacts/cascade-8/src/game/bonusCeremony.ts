import type { SpinResult } from "../engine/types";

type BonusCeremonyElements = {
  overlay: HTMLElement;
  scatterRow: HTMLElement;
  triggerLabel: HTMLElement;
  spinCount: HTMLElement;
  title: HTMLElement;
  support: HTMLElement;
  instruction: HTMLElement;
  button: HTMLButtonElement;
};

type BonusCeremonyState = Pick<SpinResult, "bonusTriggerScatterCount" | "freeSpinsAwarded">;
type BonusCeremonyKind = "trigger" | "retrigger";

export function renderBonusCeremony(
  elements: BonusCeremonyElements,
  active: boolean,
  state: BonusCeremonyState,
  assetBaseUrl: string,
  kind: BonusCeremonyKind = "trigger",
) {
  const scatterCount = state.bonusTriggerScatterCount;
  elements.overlay.hidden = !active;
  elements.spinCount.textContent = String(state.freeSpinsAwarded);
  elements.triggerLabel.textContent = active
    ? kind === "retrigger" ? `${scatterCount} SCATTERS GATHERED` : `TRIGGERED BY ${scatterCount} SCATTERS`
    : "";
  elements.title.textContent = kind === "retrigger" ? "FREE SPINS RETRIGGERED" : "FREE SPINS READY";
  elements.support.textContent = kind === "retrigger" ? "+5 FREE SPINS" : "FREE SPINS AWARDED";
  elements.instruction.textContent = kind === "retrigger"
    ? "PRESS CONTINUE TO RETURN TO THE CASCADE"
    : "PRESS START TO ENTER THE GOLDEN REALM";
  elements.button.textContent = kind === "retrigger" ? "CONTINUE" : "START FREE SPINS";
  elements.scatterRow.className = `bonus-scatter-row count-${scatterCount}`;
  elements.scatterRow.innerHTML = active
    ? Array.from({ length: scatterCount }, (_, index) =>
      `<span class="bonus-scatter-token" style="--scatter-index:${index}"><img src="${assetBaseUrl}special-symbols/scatter.png" alt="Triggering scatter ${index + 1}"></span>`,
    ).join("")
    : "";
}