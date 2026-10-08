import { fetchBlackjackServerState } from "./serverApi";
import { summarizeBlackjackRound } from "./roundSummary";

function money(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedMoney(amount: number): string {
  if (amount > 0) return `+${money(amount)}`;
  if (amount < 0) return `-${money(Math.abs(amount))}`;
  return money(0);
}

function currentRevision(root: HTMLElement): number | null {
  const authority = root.querySelector<HTMLElement>(".bj-live-authority")?.textContent ?? "";
  const match = authority.match(/REV\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function clearSummary(root: HTMLElement): void {
  root.querySelector(".bj-round-result-summary")?.remove();
  root.querySelector<HTMLElement>(".bj-felt")?.classList.remove("is-round-complete-summary");
}

export function installBlackjackRoundResultOverlay(app: HTMLDivElement): () => void {
  let inFlightRevision: number | null = null;

  const sync = async () => {
    const root = app.querySelector<HTMLElement>(".bj-root[data-live-authority=\"server\"]");
    if (!root) return;

    const nextRoundButton = root.querySelector<HTMLElement>("[data-server-action=\"next\"]");
    if (!nextRoundButton) {
      clearSummary(root);
      return;
    }

    const revision = currentRevision(root);
    if (revision === null) return;
    const existing = root.querySelector<HTMLElement>(".bj-round-result-summary");
    if (existing?.dataset.revision === String(revision) || inFlightRevision === revision) return;

    inFlightRevision = revision;
    try {
      const snapshot = await fetchBlackjackServerState();
      if (snapshot.revision !== revision || snapshot.round?.phase !== "complete") return;

      const currentRoot = app.querySelector<HTMLElement>(".bj-root[data-live-authority=\"server\"]");
      if (!currentRoot || currentRevision(currentRoot) !== revision) return;

      const felt = currentRoot.querySelector<HTMLElement>(".bj-felt");
      if (!felt) return;

      const summary = summarizeBlackjackRound(snapshot.round);
      const outcome = summary.net > 0 ? "win" : summary.net < 0 ? "loss" : "push";
      const label = summary.net > 0 ? "TOTAL WIN" : summary.net < 0 ? "TOTAL LOSS" : "BREAK EVEN";
      const seatLabel = `${summary.seatCount} SEAT${summary.seatCount === 1 ? "" : "S"}`;
      const handLabel = `${summary.handCount} HAND${summary.handCount === 1 ? "" : "S"}`;

      clearSummary(currentRoot);
      const overlay = document.createElement("div");
      overlay.className = `bj-round-result-summary is-${outcome}`;
      overlay.dataset.revision = String(revision);
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = `
        <span class="bj-round-result-summary__label">${label}</span>
        <strong class="bj-round-result-summary__amount">${signedMoney(summary.net)}</strong>
        <span class="bj-round-result-summary__meta">${seatLabel} · ${handLabel}</span>
        <span class="bj-round-result-summary__money">TOTAL STAKE ${money(summary.totalStake)} · TOTAL RETURN ${money(summary.totalReturn)}</span>
      `;
      felt.classList.add("is-round-complete-summary");
      felt.appendChild(overlay);
    } catch {
      // The main live controller owns connection/error messaging. A summary
      // overlay must never interfere with the authoritative game flow.
    } finally {
      if (inFlightRevision === revision) inFlightRevision = null;
    }
  };

  let queued = false;
  const queueSync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      void sync();
    });
  };

  const observer = new MutationObserver(queueSync);
  observer.observe(app, { subtree: true, childList: true, characterData: true });
  queueSync();

  return () => observer.disconnect();
}
