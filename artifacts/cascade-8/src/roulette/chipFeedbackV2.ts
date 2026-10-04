import {
  didRouletteChipInteractionSucceed,
  getRouletteChipFeedbackPulses,
  type RouletteChipFeedbackKind,
  type RouletteChipFeedbackPulse,
} from "./chipFeedback";

const AUDIO_SETTINGS_KEY =
  "roulette.audio.settings.v1";

const AUDIO_GAIN_SCALE = {
  noise: 3.65,
  body: 3.2,
} as const;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getAudibleRouletteChipPulse(
  pulse: RouletteChipFeedbackPulse,
): RouletteChipFeedbackPulse {
  return {
    ...pulse,
    noiseGain: Math.min(
      0.3,
      pulse.noiseGain *
        AUDIO_GAIN_SCALE.noise,
    ),
    bodyGain: Math.min(
      0.16,
      pulse.bodyGain *
        AUDIO_GAIN_SCALE.body,
    ),
  };
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

type AudioContextConstructor =
  typeof AudioContext;

type SafariAudioWindow = Window & {
  webkitAudioContext?:
    AudioContextConstructor;
};

class RouletteChipAudioFeedbackV2 {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sequence = 0;
  private dealerVolume = 1;

  setDealerVolume(value: number) {
    this.dealerVolume = clamp01(value);

    if (
      this.ctx &&
      this.output
    ) {
      this.output.gain.setTargetAtTime(
        this.dealerVolume * 0.96,
        this.ctx.currentTime,
        0.018,
      );
    }
  }

  private ensureGraph() {
    if (
      this.ctx &&
      this.output
    ) {
      return this.ctx;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as SafariAudioWindow)
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    const ctx = new AudioContextCtor();
    const output = ctx.createGain();
    const limiter =
      ctx.createDynamicsCompressor();

    output.gain.value =
      this.dealerVolume * 0.96;
    limiter.threshold.value = -7;
    limiter.knee.value = 4;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.0015;
    limiter.release.value = 0.09;

    output.connect(limiter);
    limiter.connect(ctx.destination);

    const noiseBuffer = ctx.createBuffer(
      1,
      Math.ceil(
        ctx.sampleRate * 0.09,
      ),
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
    this.output = output;
    this.noiseBuffer = noiseBuffer;
    return ctx;
  }

  unlockFromUserGesture() {
    this.dealerVolume =
      readStoredDealerVolume();

    if (this.dealerVolume <= 0) {
      return;
    }

    const ctx = this.ensureGraph();
    if (!ctx) return;

    this.setDealerVolume(
      this.dealerVolume,
    );

    const warm = () => {
      if (ctx.state !== "running") {
        return;
      }

      const source =
        ctx.createBufferSource();
      const gain = ctx.createGain();
      const buffer = ctx.createBuffer(
        1,
        1,
        ctx.sampleRate,
      );

      source.buffer = buffer;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.output!);
      source.start();
    };

    if (ctx.state === "running") {
      warm();
      return;
    }

    void ctx
      .resume()
      .then(warm)
      .catch(() => {
        // A later user gesture will retry the unlock.
      });
  }

  play(kind: RouletteChipFeedbackKind) {
    this.dealerVolume =
      readStoredDealerVolume();

    if (this.dealerVolume <= 0) {
      return;
    }

    const ctx = this.ensureGraph();
    if (!ctx) return;

    this.setDealerVolume(
      this.dealerVolume,
    );

    const variant = this.sequence;
    this.sequence += 1;

    const run = () => {
      if (ctx.state !== "running") {
        return;
      }

      getRouletteChipFeedbackPulses(
        kind,
        variant,
      )
        .map(
          getAudibleRouletteChipPulse,
        )
        .forEach((pulse) => {
          this.playPulse(pulse);
        });
    };

    if (ctx.state === "running") {
      run();
      return;
    }

    void ctx
      .resume()
      .then(run)
      .catch(() => {
        // Keep gameplay functional if audio remains blocked.
      });
  }

  private playPulse(
    pulse: RouletteChipFeedbackPulse,
  ) {
    const ctx = this.ctx;
    const output = this.output;
    const noiseBuffer =
      this.noiseBuffer;

    if (
      !ctx ||
      !output ||
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
      start + 0.0015,
    );
    noiseGain.gain.exponentialRampToValueAtTime(
      0.0001,
      end,
    );

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(output);
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
        pulse.bodyHz * 0.69,
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
      start + 0.001,
    );
    bodyGain.gain.exponentialRampToValueAtTime(
      0.0001,
      end,
    );

    body.connect(bodyGain);
    bodyGain.connect(output);
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

export function installRouletteChipFeedbackV2(
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
    page.dataset.chipFeedbackV2Installed ===
      "true"
  ) {
    return;
  }

  page.dataset.chipFeedbackV2Installed =
    "true";

  const audio =
    new RouletteChipAudioFeedbackV2();
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
      audio.unlockFromUserGesture();
    },
    {
      capture: true,
      passive: true,
    },
  );

  betPanel.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        audio.unlockFromUserGesture();
      }
    },
    true,
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
