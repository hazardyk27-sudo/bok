export type RouletteChipFeedbackKind =
  | "select"
  | "place"
  | "undo"
  | "double"
  | "clear"
  | "rebet";

export type RouletteChipFeedbackPulse = Readonly<{
  delayMs: number;
  durationMs: number;
  centerHz: number;
  q: number;
  noiseGain: number;
  bodyHz: number;
  bodyGain: number;
}>;

const AUDIO_SETTINGS_KEY =
  "roulette.audio.settings.v1";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getRouletteChipFeedbackPulses(
  kind: RouletteChipFeedbackKind,
  variant = 0,
): readonly RouletteChipFeedbackPulse[] {
  const variation =
    ((Math.abs(variant) % 5) - 2) * 38;

  const single = (
    centerHz: number,
    bodyHz: number,
    noiseGain: number,
    bodyGain: number,
    durationMs: number,
    delayMs = 0,
  ): RouletteChipFeedbackPulse => ({
    delayMs,
    durationMs,
    centerHz:
      centerHz + variation,
    q: 2.6,
    noiseGain,
    bodyHz:
      bodyHz + variation * 0.11,
    bodyGain,
  });

  switch (kind) {
    case "select":
      return [
        single(
          2_650,
          620,
          0.024,
          0.013,
          22,
        ),
      ];
    case "place":
      return [
        single(
          2_180,
          470,
          0.058,
          0.025,
          34,
        ),
        single(
          2_760,
          610,
          0.035,
          0.014,
          20,
          17,
        ),
      ];
    case "undo":
      return [
        single(
          1_720,
          365,
          0.037,
          0.019,
          29,
        ),
      ];
    case "double":
      return [
        single(
          2_060,
          450,
          0.045,
          0.021,
          29,
        ),
        single(
          2_520,
          545,
          0.04,
          0.018,
          25,
          31,
        ),
      ];
    case "clear":
      return [
        single(
          1_540,
          320,
          0.036,
          0.018,
          32,
        ),
        single(
          1_260,
          270,
          0.027,
          0.014,
          28,
          24,
        ),
      ];
    case "rebet":
      return [
        single(
          1_980,
          420,
          0.042,
          0.02,
          30,
        ),
        single(
          2_640,
          570,
          0.034,
          0.016,
          22,
          28,
        ),
      ];
  }
}

export function didRouletteChipInteractionSucceed(
  kind: RouletteChipFeedbackKind,
  beforeStake: number,
  afterStake: number,
  beforePressed = false,
  afterPressed = false,
) {
  if (kind === "select") {
    return !beforePressed && afterPressed;
  }
  if (kind === "place") {
    return afterStake > beforeStake;
  }
  if (
    kind === "double" ||
    kind === "rebet"
  ) {
    return afterStake > beforeStake;
  }
  if (
    kind === "undo" ||
    kind === "clear"
  ) {
    return afterStake < beforeStake;
  }
  return false;
}

function readStoredDealerVolume() {
  try {
    const settings = JSON.parse(
      window.localStorage.getItem(
        AUDIO_SETTINGS_KEY,
      ) ?? "{}",
    ) as {
      dealer?: unknown;
    };

    return clamp01(
      typeof settings.dealer ===
        "number"
        ? settings.dealer
        : 1,
    );
  } catch {
    return 1;
  }
}

class RouletteChipAudioFeedback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sequence = 0;
  private dealerVolume = 1;

  setDealerVolume(value: number) {
    this.dealerVolume = clamp01(value);

    if (
      this.ctx &&
      this.master
    ) {
      this.master.gain.setTargetAtTime(
        this.dealerVolume * 0.78,
        this.ctx.currentTime,
        0.025,
      );
    }
  }

  private ensureGraph() {
    if (this.ctx && this.master) {
      return this.ctx;
    }

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value =
      this.dealerVolume * 0.78;
    master.connect(ctx.destination);

    const noiseBuffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * 0.08),
      ctx.sampleRate,
    );
    const samples =
      noiseBuffer.getChannelData(0);

    for (
      let index = 0;
      index < samples.length;
      index += 1
    ) {
      samples[index] =
        Math.random() * 2 - 1;
    }

    this.ctx = ctx;
    this.master = master;
    this.noiseBuffer = noiseBuffer;
    return ctx;
  }

  play(kind: RouletteChipFeedbackKind) {
    this.dealerVolume =
      readStoredDealerVolume();

    if (this.dealerVolume <= 0) {
      return;
    }

    const ctx = this.ensureGraph();
    this.setDealerVolume(
      this.dealerVolume,
    );
    const variant = this.sequence;
    this.sequence += 1;

    const play = () => {
      getRouletteChipFeedbackPulses(
        kind,
        variant,
      ).forEach((pulse) => {
        this.playPulse(pulse);
      });
    };

    if (ctx.state === "suspended") {
      void ctx
        .resume()
        .then(play)
        .catch(() => {
          // Audio remains optional when browser autoplay policy blocks it.
        });
      return;
    }

    play();
  }

  private playPulse(
    pulse: RouletteChipFeedbackPulse,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    const noiseBuffer =
      this.noiseBuffer;

    if (
      !ctx ||
      !master ||
      !noiseBuffer ||
      ctx.state !== "running"
    ) {
      return;
    }

    const start =
      ctx.currentTime +
      pulse.delayMs / 1000;
    const end =
      start +
      pulse.durationMs / 1000;

    const noise =
      ctx.createBufferSource();
    const filter =
      ctx.createBiquadFilter();
    const noiseGain =
      ctx.createGain();

    noise.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value =
      pulse.centerHz;
    filter.Q.value = pulse.q;

    noiseGain.gain.setValueAtTime(
      0.0001,
      start,
    );
    noiseGain.gain.exponentialRampToValueAtTime(
      Math.max(
        0.0001,
        pulse.noiseGain,
      ),
      start + 0.002,
    );
    noiseGain.gain.exponentialRampToValueAtTime(
      0.0001,
      end,
    );

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(start);
    noise.stop(end);

    const body =
      ctx.createOscillator();
    const bodyGain =
      ctx.createGain();

    body.type = "triangle";
    body.frequency.setValueAtTime(
      pulse.bodyHz,
      start,
    );
    body.frequency.exponentialRampToValueAtTime(
      Math.max(
        80,
        pulse.bodyHz * 0.72,
      ),
      end,
    );
    bodyGain.gain.setValueAtTime(
      0.0001,
      start,
    );
    bodyGain.gain.exponentialRampToValueAtTime(
      Math.max(
        0.0001,
        pulse.bodyGain,
      ),
      start + 0.0015,
    );
    bodyGain.gain.exponentialRampToValueAtTime(
      0.0001,
      end,
    );

    body.connect(bodyGain);
    bodyGain.connect(master);
    body.start(start);
    body.stop(end);
  }
}

type PendingInteraction = {
  kind: RouletteChipFeedbackKind;
  element: HTMLElement;
  beforeStake: number;
  beforePressed: boolean;
};

function getRenderedStake(
  root: ParentNode,
) {
  let total = 0;

  root
    .querySelectorAll<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    )
    .forEach((chip) => {
      const amount = Number(
        chip.dataset.betAmount,
      );
      if (
        Number.isFinite(amount) &&
        amount > 0
      ) {
        total += amount;
      }
    });

  return total;
}

function getInteraction(
  target: HTMLElement,
): {
  kind: RouletteChipFeedbackKind;
  element: HTMLElement;
} | null {
  const selectors: ReadonlyArray<
    readonly [
      RouletteChipFeedbackKind,
      string,
    ]
  > = [
    ["select", "[data-chip-value]"],
    ["place", "[data-bet-id]"],
    ["undo", "[data-undo-bet]"],
    ["double", "[data-double-bet]"],
    ["clear", "[data-clear-bets]"],
    ["rebet", "[data-rebet]"],
  ];

  for (const [kind, selector] of selectors) {
    const element =
      target.closest<HTMLElement>(
        selector,
      );
    if (element) {
      return {
        kind,
        element,
      };
    }
  }

  return null;
}

function pulseInteraction(
  interaction: PendingInteraction,
) {
  const element = interaction.element;
  const chip =
    interaction.kind === "place"
      ? element.querySelector<HTMLElement>(
          ".roulette-placed-chip",
        )
      : null;
  const visualTarget = chip ?? element;

  visualTarget.dataset.rouletteChipFeedback =
    interaction.kind;

  window.setTimeout(() => {
    if (
      visualTarget.dataset
        .rouletteChipFeedback ===
      interaction.kind
    ) {
      delete visualTarget.dataset
        .rouletteChipFeedback;
    }
  }, 230);
}

export function installRouletteChipFeedback(
  app: HTMLDivElement,
) {
  const page =
    app.querySelector<HTMLElement>(
      "[data-roulette-page]",
    );
  const betPanel =
    app.querySelector<HTMLElement>(
      "[data-roulette-bet-panel]",
    );

  if (
    !page ||
    !betPanel ||
    page.dataset.chipFeedbackInstalled ===
      "true"
  ) {
    return;
  }

  page.dataset.chipFeedbackInstalled =
    "true";

  const audio =
    new RouletteChipAudioFeedback();
  audio.setDealerVolume(
    readStoredDealerVolume(),
  );

  let pending:
    PendingInteraction | null = null;
  let lastPointerType = "";
  let lastPointerAt = 0;

  betPanel.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerType = event.pointerType;
      lastPointerAt = performance.now();
    },
    {
      passive: true,
    },
  );

  betPanel.addEventListener(
    "click",
    (event) => {
      const target =
        event.target as HTMLElement;
      const interaction =
        getInteraction(target);

      if (!interaction) {
        pending = null;
        return;
      }

      pending = {
        ...interaction,
        beforeStake:
          getRenderedStake(betPanel),
        beforePressed:
          interaction.element.getAttribute(
            "aria-pressed",
          ) === "true",
      };
    },
    true,
  );

  betPanel.addEventListener(
    "click",
    () => {
      const interaction = pending;
      pending = null;

      if (!interaction) {
        return;
      }

      const afterStake =
        getRenderedStake(betPanel);
      const afterPressed =
        interaction.element.getAttribute(
          "aria-pressed",
        ) === "true";

      if (
        !didRouletteChipInteractionSucceed(
          interaction.kind,
          interaction.beforeStake,
          afterStake,
          interaction.beforePressed,
          afterPressed,
        )
      ) {
        return;
      }

      audio.play(interaction.kind);
      pulseInteraction(interaction);

      if (
        interaction.kind === "place" &&
        performance.now() -
          lastPointerAt <
          800 &&
        (
          lastPointerType === "touch" ||
          lastPointerType === "pen"
        ) &&
        typeof navigator.vibrate ===
          "function"
      ) {
        navigator.vibrate(8);
      }
    },
  );

  app
    .querySelector<HTMLInputElement>(
      "[data-dealer-volume]",
    )
    ?.addEventListener(
      "input",
      (event) => {
        const input =
          event.currentTarget as HTMLInputElement;
        audio.setDealerVolume(
          Number(input.value) / 100,
        );
      },
    );
}
