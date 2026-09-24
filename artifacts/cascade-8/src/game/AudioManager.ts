export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private sfxGain?: GainNode;
  private scratchBuffer?: AudioBuffer;
  private scratchLoopSource?: AudioBufferSourceNode;
  private scratchBodyFilter?: BiquadFilterNode;
  private scratchEdgeFilter?: BiquadFilterNode;
  private scratchRumbleFilter?: BiquadFilterNode;
  private scratchBodyGain?: GainNode;
  private scratchEdgeGain?: GainNode;
  private scratchRumbleGain?: GainNode;
  private scratchLastGrainAt = -Infinity;
  private readonly scratchSources = new Set<AudioBufferSourceNode>();
  private readonly activeTones = new Set<OscillatorNode>();
  private readonly pendingSfxTimers = new Set<number>();
  private dangerBustBuffer?: AudioBuffer;
  private dangerBustLoad?: Promise<AudioBuffer | undefined>;
  private dangerBustSource?: AudioBufferSourceNode;
  muted = localStorage.getItem("cascade8-muted") === "true";
  volume = Number(localStorage.getItem("cascade8-volume") ?? "0.38");

  setMuted(value: boolean) {
    this.muted = value;
    localStorage.setItem("cascade8-muted", String(value));
    if (value) {
      this.scratchStop();
      if (this.dangerBustSource) {
        try { this.dangerBustSource.stop(); } catch {}
        this.dangerBustSource = undefined;
      }
    }
    if (this.gain) this.gain.gain.value = value ? 0 : 1;
  }
  setVolume(value: number) {
    this.volume = value;
    localStorage.setItem("cascade8-volume", String(value));
    if (this.sfxGain) this.sfxGain.gain.value = value;
  }
  private ensure() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.muted ? 0 : 1;
      this.gain.connect(this.context.destination);
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.volume;
      this.sfxGain.connect(this.gain);
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  unlock() {
    if (this.muted) return;
    this.ensure();
    void this.loadDangerBustBuffer();
  }

  private loadDangerBustBuffer() {
    if (this.dangerBustBuffer) return Promise.resolve(this.dangerBustBuffer);
    if (this.dangerBustLoad) return this.dangerBustLoad;

    this.ensure();
    const context = this.context!;
    this.dangerBustLoad = fetch("/cadi-kazan/sfx-danger-negative.ogg", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Danger SFX HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.dangerBustBuffer = buffer;
        return buffer;
      })
      .catch(() => undefined);

    return this.dangerBustLoad;
  }

  private playDangerBustBuffer(buffer: AudioBuffer) {
    if (this.muted) return;
    this.ensure();
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain!);

    if (this.dangerBustSource) {
      try { this.dangerBustSource.stop(); } catch {}
    }
    this.dangerBustSource = source;

    source.addEventListener("ended", () => {
      source.disconnect();
      if (this.dangerBustSource === source) this.dangerBustSource = undefined;
    }, { once: true });

    source.start(context.currentTime);
  }

  private makeNoiseBuffer(duration: number, decay = 1.6, warmth = 0.18) {
    const context = this.context!;
    const length = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / Math.max(1, length - 1);
      const white = Math.random() * 2 - 1;
      brown = brown * 0.92 + white * 0.08;
      const mixed = white * (1 - warmth) + brown * warmth * 3.2;
      samples[index] = mixed * Math.pow(1 - progress, decay);
    }
    return buffer;
  }

  private playNoiseBurst(options: {
    at?: number;
    duration: number;
    gain: number;
    frequency: number;
    q?: number;
    type?: BiquadFilterType;
    decay?: number;
    warmth?: number;
  }) {
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime + (options.at ?? 0);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.makeNoiseBuffer(options.duration, options.decay ?? 1.8, options.warmth ?? 0.15);
    filter.type = options.type ?? "bandpass";
    filter.frequency.setValueAtTime(options.frequency, start);
    filter.Q.value = options.q ?? 0.8;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.addEventListener("ended", () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    }, { once: true });
    source.start(start);
    source.stop(start + options.duration + 0.01);
  }

  private playMetalPing(frequency: number, at: number, duration: number, gain: number) {
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime + at;
    const partials = [
      { ratio: 1, gain: 1 },
      { ratio: 2.01, gain: 0.44 },
      { ratio: 3.87, gain: 0.18 },
    ];
    partials.forEach((partial) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * partial.ratio, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * partial.gain), start + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(output);
      this.activeTones.add(oscillator);
      oscillator.addEventListener("ended", () => {
        this.activeTones.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      }, { once: true });
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }
  tone(frequency: number, duration = 0.08, type: OscillatorType = "sine") {
    if (this.muted) return;
    this.ensure();
    const oscillator = this.context!.createOscillator();
    const envelope = this.context!.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, this.context!.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.22, this.context!.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context!.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.sfxGain!);
    this.activeTones.add(oscillator);
    oscillator.addEventListener("ended", () => {
      this.activeTones.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    oscillator.start();
    oscillator.stop(this.context!.currentTime + duration + 0.02);
  }
  private delayedTone(frequency: number, duration: number, type: OscillatorType, delay: number) {
    const timer = window.setTimeout(() => {
      this.pendingSfxTimers.delete(timer);
      this.tone(frequency, duration, type);
    }, delay);
    this.pendingSfxTimers.add(timer);
  }
  getDebugMetrics() {
    return {
      activeTones: this.activeTones.size,
      pendingSfxTimers: this.pendingSfxTimers.size,
      scratchSources: this.scratchSources.size,
    };
  }
  private ensureScratchTexture() {
    if (this.scratchBuffer) return;
    const context = this.context!;
    const sampleRate = context.sampleRate;
    const duration = 1.15;
    const length = Math.ceil(sampleRate * duration);
    const buffer = context.createBuffer(1, length, sampleRate);
    const samples = buffer.getChannelData(0);

    // Original continuous texture: dry card/foil friction with low mechanical
    // body and irregular grit. Unlike the old burst model this is not enveloped
    // to zero every few milliseconds, so a drag sounds like one physical scrape.
    let slow = 0;
    let mid = 0;
    let gritEnvelope = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      slow = slow * 0.985 + white * 0.015;
      mid = mid * 0.72 + white * 0.28;

      if (Math.random() < 0.0065) gritEnvelope = 0.65 + Math.random() * 0.55;
      gritEnvelope *= 0.91;
      const grain = (Math.random() * 2 - 1) * gritEnvelope;

      const time = index / sampleRate;
      const handVariation =
        0.86
        + Math.sin(time * Math.PI * 2 * 6.7) * 0.07
        + Math.sin(time * Math.PI * 2 * 13.1 + 1.7) * 0.035;

      samples[index] = Math.max(-1, Math.min(1,
        (white * 0.34 + mid * 0.38 + slow * 0.62 + grain * 0.18) * handVariation
      ));
    }
    this.scratchBuffer = buffer;
  }

  scratchStart(intensity = 0, abrasion = 0.05) {
    if (this.muted) return;
    this.ensure();
    this.ensureScratchTexture();
    if (this.scratchLoopSource) {
      this.scratchUpdate(intensity, abrasion);
      return;
    }

    const context = this.context!;
    const output = this.sfxGain!;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.scratchBuffer!;
    source.loop = true;
    source.loopStart = 0.08;
    source.loopEnd = 1.07;
    source.playbackRate.value = 0.78;

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.value = 980;
    bodyFilter.Q.value = 0.52;
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);

    const edgeFilter = context.createBiquadFilter();
    edgeFilter.type = "highpass";
    edgeFilter.frequency.value = 2_650;
    edgeFilter.Q.value = 0.28;
    const edgeGain = context.createGain();
    edgeGain.gain.setValueAtTime(0.0001, now);

    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 360;
    rumbleFilter.Q.value = 0.38;
    const rumbleGain = context.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, now);

    source.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(output);

    source.connect(edgeFilter);
    edgeFilter.connect(edgeGain);
    edgeGain.connect(output);

    source.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(output);

    this.scratchLoopSource = source;
    this.scratchBodyFilter = bodyFilter;
    this.scratchEdgeFilter = edgeFilter;
    this.scratchRumbleFilter = rumbleFilter;
    this.scratchBodyGain = bodyGain;
    this.scratchEdgeGain = edgeGain;
    this.scratchRumbleGain = rumbleGain;
    this.scratchSources.add(source);

    source.addEventListener("ended", () => {
      this.scratchSources.delete(source);
      source.disconnect();
      bodyFilter.disconnect();
      bodyGain.disconnect();
      edgeFilter.disconnect();
      edgeGain.disconnect();
      rumbleFilter.disconnect();
      rumbleGain.disconnect();
      if (this.scratchLoopSource === source) {
        this.scratchLoopSource = undefined;
        this.scratchBodyFilter = undefined;
        this.scratchEdgeFilter = undefined;
        this.scratchRumbleFilter = undefined;
        this.scratchBodyGain = undefined;
        this.scratchEdgeGain = undefined;
        this.scratchRumbleGain = undefined;
      }
    }, { once: true });

    source.start(now, 0.11 + Math.random() * 0.63);
    this.playNoiseBurst({
      at: 0,
      duration: 0.026,
      gain: 0.026,
      frequency: 2_150,
      q: 1.1,
      decay: 3.1,
      warmth: 0.20,
    });
    this.scratchUpdate(intensity, abrasion);
  }

  scratchUpdate(intensity = 0.5, abrasion = 0.5) {
    if (this.muted) return;
    if (!this.scratchLoopSource || !this.context) {
      this.scratchStart(intensity, abrasion);
      return;
    }

    const context = this.context;
    const now = context.currentTime;
    const speed = Math.max(0, Math.min(1, intensity));
    const depth = Math.max(0, Math.min(1, abrasion));
    const bodyLevel = 0.0025 + speed * 0.105 + depth * speed * 0.020;
    const edgeLevel = 0.0008 + speed * 0.052 + depth * speed * 0.018;
    const rumbleLevel = 0.001 + speed * 0.023;

    this.scratchLoopSource.playbackRate.setTargetAtTime(0.72 + speed * 0.46 + depth * 0.07, now, 0.018);
    this.scratchBodyFilter?.frequency.setTargetAtTime(720 + speed * 1_050 + depth * 310, now, 0.02);
    this.scratchEdgeFilter?.frequency.setTargetAtTime(2_450 + speed * 2_200 + depth * 700, now, 0.02);
    this.scratchRumbleFilter?.frequency.setTargetAtTime(300 + speed * 190, now, 0.025);

    const shapeGain = (node: GainNode | undefined, level: number, floor: number, attack: number) => {
      if (!node) return;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(level, now, attack);
      // Pointer events stop arriving when the hand stops. Let friction decay
      // naturally after each movement pulse so holding still is nearly silent.
      node.gain.setTargetAtTime(floor, now + 0.075, 0.026);
    };
    shapeGain(this.scratchBodyGain, bodyLevel, 0.0015, 0.008);
    shapeGain(this.scratchEdgeGain, edgeLevel, 0.0003, 0.006);
    shapeGain(this.scratchRumbleGain, rumbleLevel, 0.0005, 0.012);

    // Small irregular metallic/paper grains make the scrape feel like a coin
    // catching real foil instead of a uniform digital noise loop.
    if (speed > 0.14 && now - this.scratchLastGrainAt > 0.052 + (1 - speed) * 0.05) {
      this.scratchLastGrainAt = now;
      const grain = context.createBufferSource();
      const grainFilter = context.createBiquadFilter();
      const grainGain = context.createGain();
      grain.buffer = this.scratchBuffer!;
      grainFilter.type = "bandpass";
      grainFilter.frequency.value = 2_900 + Math.random() * 2_600 + depth * 600;
      grainFilter.Q.value = 0.72 + Math.random() * 0.55;
      grainGain.gain.setValueAtTime(0.0001, now);
      grainGain.gain.exponentialRampToValueAtTime(0.010 + speed * 0.026, now + 0.002);
      grainGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018 + speed * 0.018);
      grain.connect(grainFilter);
      grainFilter.connect(grainGain);
      grainGain.connect(this.sfxGain!);
      this.scratchSources.add(grain);
      grain.addEventListener("ended", () => {
        this.scratchSources.delete(grain);
        grain.disconnect();
        grainFilter.disconnect();
        grainGain.disconnect();
      }, { once: true });
      grain.start(now, 0.10 + Math.random() * 0.78);
      grain.stop(now + 0.05);
    }
  }

  scratchStop() {
    if (!this.scratchLoopSource || !this.context) return;
    const source = this.scratchLoopSource;
    const now = this.context.currentTime;
    const stopAt = now + 0.045;

    [this.scratchBodyGain, this.scratchEdgeGain, this.scratchRumbleGain].forEach((gain) => {
      if (!gain) return;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    });

    // Clear the current handle immediately so a new gesture can start without
    // waiting for the tail of the previous scrape.
    this.scratchLoopSource = undefined;
    this.scratchBodyFilter = undefined;
    this.scratchEdgeFilter = undefined;
    this.scratchRumbleFilter = undefined;
    this.scratchBodyGain = undefined;
    this.scratchEdgeGain = undefined;
    this.scratchRumbleGain = undefined;
    try {
      source.stop(stopAt + 0.008);
    } catch {
      // Source may already have ended during teardown.
    }
  }

  scratch(intensity = 0.5, abrasion = 0.5) {
    // Compatibility wrapper for any older callers.
    this.scratchStart(intensity, abrasion);
    this.scratchUpdate(intensity, abrasion);
  }
  click() { this.tone(480, 0.05, "triangle"); }
  spin() { this.tone(180, 0.16, "sine"); }
  win() { this.tone(620, 0.12, "triangle"); this.delayedTone(880, 0.16, "triangle", 80); }
  ticketPurchase() {
    if (this.muted) return;
    this.ensure();
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime;

    // Short paper/foil feed.
    this.playNoiseBurst({ at: 0, duration: 0.13, gain: 0.055, frequency: 1_650, q: 0.65, decay: 0.55, warmth: 0.28 });
    this.playNoiseBurst({ at: 0.075, duration: 0.055, gain: 0.13, frequency: 780, q: 0.9, decay: 2.4, warmth: 0.35 });

    // Mechanical stamp/cutter.
    const stamp = context.createOscillator();
    const stampGain = context.createGain();
    stamp.type = "square";
    stamp.frequency.setValueAtTime(118, start + 0.095);
    stamp.frequency.exponentialRampToValueAtTime(76, start + 0.155);
    stampGain.gain.setValueAtTime(0.0001, start + 0.095);
    stampGain.gain.exponentialRampToValueAtTime(0.08, start + 0.100);
    stampGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.165);
    stamp.connect(stampGain);
    stampGain.connect(output);
    this.activeTones.add(stamp);
    stamp.addEventListener("ended", () => {
      this.activeTones.delete(stamp);
      stamp.disconnect();
      stampGain.disconnect();
    }, { once: true });
    stamp.start(start + 0.095);
    stamp.stop(start + 0.18);

    // Small confirmation bell, deliberately restrained.
    this.playMetalPing(840, 0.135, 0.17, 0.055);
  }

  bombBust() {
    if (this.muted) return;

    this.ensure();
    if (this.dangerBustBuffer) {
      this.playDangerBustBuffer(this.dangerBustBuffer);
      return;
    }

    void this.loadDangerBustBuffer().then((buffer) => {
      if (buffer && !this.muted) {
        this.playDangerBustBuffer(buffer);
        return;
      }

      // Only if the real clip cannot be fetched/decoded.
      this.tone(155, 0.28, "sawtooth");
      this.delayedTone(92, 0.34, "triangle", 90);
    });
  }

  cashRegister() {
    if (this.muted) return;
    this.ensure();
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime;

    // Metal latch and drawer rails.
    this.playNoiseBurst({ at: 0, duration: 0.055, gain: 0.12, frequency: 1_650, q: 1.2, decay: 2.8, warmth: 0.16 });
    this.playNoiseBurst({ at: 0.055, duration: 0.12, gain: 0.08, frequency: 640, q: 0.75, decay: 1.4, warmth: 0.60 });

    // Two inharmonic register-bell strikes.
    this.playMetalPing(1_030, 0.028, 0.32, 0.12);
    this.playMetalPing(1_315, 0.128, 0.38, 0.10);

    // Drawer stop / wooden-metal body at the end.
    const drawer = context.createOscillator();
    const drawerGain = context.createGain();
    drawer.type = "sine";
    drawer.frequency.setValueAtTime(92, start + 0.235);
    drawer.frequency.exponentialRampToValueAtTime(54, start + 0.36);
    drawerGain.gain.setValueAtTime(0.0001, start + 0.235);
    drawerGain.gain.exponentialRampToValueAtTime(0.13, start + 0.242);
    drawerGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.39);
    drawer.connect(drawerGain);
    drawerGain.connect(output);
    this.activeTones.add(drawer);
    drawer.addEventListener("ended", () => {
      this.activeTones.delete(drawer);
      drawer.disconnect();
      drawerGain.disconnect();
    }, { once: true });
    drawer.start(start + 0.235);
    drawer.stop(start + 0.41);

    this.playNoiseBurst({ at: 0.245, duration: 0.09, gain: 0.095, frequency: 420, q: 0.65, decay: 2.2, warmth: 0.72 });
  }
  winLabel() {
    this.tone(760, 0.07, "triangle");
    this.delayedTone(1120, 0.09, "sine", 42);
  }
  bonus() { [440, 660, 880, 1100].forEach((tone, index) => this.delayedTone(tone, 0.14, "sine", index * 90)); }
  core(value: number, isBonus = true) {
    this.tone(value >= 100 ? 980 : isBonus ? 720 : 820, 0.16, "square");
    this.delayedTone(value >= 500 ? 1560 : 1240, 0.2, "sine", 90);
    if (!isBonus && value >= 500) this.delayedTone(1960, 0.24, "triangle", 190);
  }
  scatterArrival(count = 1) {
    const tones = count >= 4 ? [420, 560, 700, 900, 1160] : count === 3 ? [420, 560, 720, 980] : count === 2 ? [420, 580, 780] : [460, 640];
    tones.forEach((tone, index) => this.delayedTone(tone, 0.11, "triangle", index * 75));
  }
  scatterAnticipation(count: number) {
    if (count < 3) return;
    [260, 330, 420, 540].forEach((tone, index) => this.delayedTone(tone, 0.12, "sine", index * 90));
  }
  scatterCelebration(count: number) {
    if (count < 4) return;
    [520, 700, 880, 1180, 1480].forEach((tone, index) => this.delayedTone(tone, 0.16, "triangle", index * 75));
  }
  bonusUnlock(count: number) {
    if (count < 4) return;
    const base = count === 6 ? 392 : count === 5 ? 370 : 349;
    [base, base * 1.25, base * 1.5, base * 2, base * 2.5].forEach((frequency, index) => {
      this.delayedTone(frequency, index === 4 ? 0.32 : 0.16, index === 4 ? "sine" : "triangle", index * 72);
    });
    this.delayedTone(base * 3, 0.42, "sine", 330);
  }
  freeSpinRawCollect() {
    this.tone(680, 0.08, "triangle");
    this.delayedTone(980, 0.1, "sine", 52);
  }
  multiplierCoreCollect(value: number, isBonus = true) {
    const large = value >= 500;
    const major = value >= 100;
    const base = large ? 860 : major ? 760 : isBonus ? 620 : 680;
    this.tone(base, large ? 0.16 : 0.11, "triangle");
    this.delayedTone(base * (large ? 1.55 : 1.5), large ? 0.22 : 0.15, "sine", 65);
    this.delayedTone(base * (large ? 2.05 : 2), large ? 0.18 : 0.11, "triangle", 135);
    if (large) this.delayedTone(1960, 0.24, "sine", 195);
  }
  freeSpinMultiplierCollect(value: number) {
    this.multiplierCoreCollect(value, true);
  }
  freeSpinResolve() {
    [460, 620, 820].forEach((frequency, index) => {
      this.delayedTone(frequency, 0.13, "sine", index * 80);
    });
    this.delayedTone(1240, 0.24, "triangle", 250);
  }
  freeSpinTransfer() {
    this.tone(520, 0.12, "sine");
    this.delayedTone(780, 0.18, "sine", 90);
  }
  retriggerGather() {
    [360, 440, 540, 680].forEach((frequency, index) => {
      this.delayedTone(frequency, 0.1, "sine", index * 75);
    });
  }
  retriggerReward() {
    [520, 760, 1040, 1380].forEach((frequency, index) => {
      this.delayedTone(frequency, index === 3 ? 0.3 : 0.14, "triangle", index * 80);
    });
  }
  bigWin() { [440, 660, 880, 1320].forEach((tone, index) => this.delayedTone(tone, 0.22, "sawtooth", index * 110)); }
  bonusComplete() { [660, 880, 1100, 1320].forEach((tone, index) => this.delayedTone(tone, 0.18, "sine", index * 95)); }
}