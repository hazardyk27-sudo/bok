import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { playSpin } from "../engine/SlotEngine";
import { SeededRNG } from "../engine/RNG";
import { renderBonusCeremony } from "./bonusCeremony";

const testCases = [
  { seed: 142, scatterCount: 4, freeSpinsAwarded: 10 },
  { seed: 280, scatterCount: 5, freeSpinsAwarded: 12 },
  { seed: 1552, scatterCount: 6, freeSpinsAwarded: 15 },
] as const;

describe("bonus trigger ceremony", () => {
  it.each(testCases)("renders the live award for $scatterCount Scatters", ({ seed, scatterCount, freeSpinsAwarded }) => {
    const result = playSpin(100, new SeededRNG(seed));
    const window = new Window();
    const document = window.document;
    const elements = {
      overlay: document.createElement("div"),
      scatterRow: document.createElement("div"),
      triggerLabel: document.createElement("span"),
      spinCount: document.createElement("div"),
      title: document.createElement("strong"),
      support: document.createElement("span"),
      instruction: document.createElement("small"),
      button: document.createElement("button"),
    };

    renderBonusCeremony(elements, true, result, "/");

    expect(result.bonusTriggered).toBe(true);
    expect(result.bonusTriggerScatterCount).toBe(scatterCount);
    expect(result.freeSpinsAwarded).toBe(freeSpinsAwarded);
    expect(elements.overlay.hidden).toBe(false);
    expect(elements.scatterRow.querySelectorAll(".bonus-scatter-token")).toHaveLength(scatterCount);
    expect(elements.scatterRow.querySelectorAll("img")).toHaveLength(scatterCount);
    expect(elements.triggerLabel.textContent).toBe(`TRIGGERED BY ${scatterCount} SCATTERS`);
    expect(elements.spinCount.textContent).toBe(String(freeSpinsAwarded));
    expect(elements.title.textContent).toBe("FREE SPINS READY");

    window.close();
  });
});