export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private scratchBuffer?: AudioBuffer;
  private readonly scratchSources = new Set<AudioBufferSourceNode>();
  private readonly activeTones = new Set<OscillatorNode>();
  private readonly pendingSfxTimers = new Set<number>();
  muted = localStorage.getItem("cascade8-muted") === "true";
  volume = Number(localStorage.getItem("cascade8-volume") ?? "0.38");
  musicVolume = Number(localStorage.getItem("cascade8-music-volume") ?? "0.18");

  setMuted(value: boolean) {
    this.muted = value;
    localStorage.setItem("cascade8-muted", String(value));
    if (this.gain) this.gain.gain.value = value ? 0 : 1;
  }
  setVolume(value: number) {
    this.volume = value;
    localStorage.setItem("cascade8-volume", String(value));
    if (this.sfxGain) this.sfxGain.gain.value = value;
  }
  setMusicVolume(value: number) {
    this.musicVolume = value;
    localStorage.setItem("cascade8-music-volume", String(value));
    if (this.musicGain) this.musicGain.gain.value = value;
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
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.gain);
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  unlock() {
    if (this.muted) return;
    this.ensure();
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
  scratch(intensity = 0.5, abrasion = 0.5) {
    if (this.muted) return;
    this.ensure();
    const context = this.context!;
    const output = this.sfxGain!;
    const normalized = Math.max(0, Math.min(1, intensity));
    const depth = Math.max(0, Math.min(1, abrasion));

    if (!this.scratchBuffer) {
      const sampleRate = context.sampleRate;
      const duration = 0.19;
      const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
      const samples = buffer.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const progress = index / samples.length;
        const white = Math.random() * 2 - 1;
        previous = previous * 0.74 + white * 0.26;
        const grit = Math.random() > 0.965 ? (Math.random() * 2 - 1) * 1.7 : 0;
        samples[index] = (white * 0.52 + previous * 0.42 + grit * 0.22) * Math.pow(1 - progress, 0.55);
      }
      this.scratchBuffer = buffer;
    }

    const startAt = context.currentTime;
    const duration = 0.055 + normalized * 0.035;

    // Dry paper/foil rasp.
    const body = context.createBufferSource();
    const bodyFilter = context.createBiquadFilter();
    const bodyGain = context.createGain();
    body.buffer = this.scratchBuffer;
    body.playbackRate.value = 0.82 + normalized * 0.34 + depth * 0.08;
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.value = 900 + normalized * 900 + depth * 380;
    bodyFilter.Q.value = 0.55;
    bodyGain.gain.setValueAtTime(0.0001, startAt);
    bodyGain.gain.exponentialRampToValueAtTime(0.045 + normalized * 0.055, startAt + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(output);

    // Metallic foil edge: quieter, brighter and shorter than the body.
    const foil = context.createBufferSource();
    const foilFilter = context.createBiquadFilter();
    const foilGain = context.createGain();
    foil.buffer = this.scratchBuffer;
    foil.playbackRate.value = 1.08 + normalized * 0.50;
    foilFilter.type = "highpass";
    foilFilter.frequency.value = 3_200 + normalized * 1_500 + depth * 700;
    foilFilter.Q.value = 0.3;
    foilGain.gain.setValueAtTime(0.0001, startAt);
    foilGain.gain.exponentialRampToValueAtTime(0.014 + normalized * 0.028 + depth * 0.012, startAt + 0.003);
    foilGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration * 0.82);
    foil.connect(foilFilter);
    foilFilter.connect(foilGain);
    foilGain.connect(output);

    [body, foil].forEach((source) => this.scratchSources.add(source));
    body.addEventListener("ended", () => {
      this.scratchSources.delete(body);
      body.disconnect();
      bodyFilter.disconnect();
      bodyGain.disconnect();
    }, { once: true });
    foil.addEventListener("ended", () => {
      this.scratchSources.delete(foil);
      foil.disconnect();
      foilFilter.disconnect();
      foilGain.disconnect();
    }, { once: true });

    body.start(startAt, Math.random() * 0.035);
    foil.start(startAt, Math.random() * 0.035);
    body.stop(startAt + duration + 0.01);
    foil.stop(startAt + duration + 0.01);
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
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime;

    // Airy blast + body thump.
    this.playNoiseBurst({ at: 0, duration: 0.22, gain: 0.16, frequency: 260, q: 0.7, decay: 1.25, warmth: 0.72 });
    this.playNoiseBurst({ at: 0.012, duration: 0.09, gain: 0.07, frequency: 2_300, q: 0.55, decay: 2.7, warmth: 0.08 });

    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(105, start);
    thump.frequency.exponentialRampToValueAtTime(38, start + 0.34);
    thumpGain.gain.setValueAtTime(0.0001, start);
    thumpGain.gain.exponentialRampToValueAtTime(0.24, start + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
    thump.connect(thumpGain);
    thumpGain.connect(output);
    this.activeTones.add(thump);
    thump.addEventListener("ended", () => {
      this.activeTones.delete(thump);
      thump.disconnect();
      thumpGain.disconnect();
    }, { once: true });
    thump.start(start);
    thump.stop(start + 0.40);

    // Dissonant descending failure cue after the impact.
    const fail = context.createOscillator();
    const failGain = context.createGain();
    fail.type = "triangle";
    fail.frequency.setValueAtTime(310, start + 0.06);
    fail.frequency.exponentialRampToValueAtTime(146, start + 0.42);
    failGain.gain.setValueAtTime(0.0001, start + 0.06);
    failGain.gain.exponentialRampToValueAtTime(0.075, start + 0.085);
    failGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.43);
    fail.connect(failGain);
    failGain.connect(output);
    this.activeTones.add(fail);
    fail.addEventListener("ended", () => {
      this.activeTones.delete(fail);
      fail.disconnect();
      failGain.disconnect();
    }, { once: true });
    fail.start(start + 0.06);
    fail.stop(start + 0.45);
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
  startMusic() {
    this.ensure();
    if (this.musicTimer) return;
    const notes = [110, 138.59, 164.81, 138.59, 123.47, 164.81, 185, 164.81];
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.context || !this.musicGain) return;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = notes[this.musicStep++ % notes.length];
      envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
      envelope.gain.exponentialRampToValueAtTime(0.08, this.context.currentTime + 0.03);
      envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.55);
      oscillator.connect(envelope); envelope.connect(this.musicGain);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        envelope.disconnect();
      }, { once: true });
      oscillator.start(); oscillator.stop(this.context.currentTime + 0.6);
    }, 620);
  }
  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }
  duckMusic(ducked: boolean) {
    if (this.musicGain) this.musicGain.gain.value = ducked ? this.musicVolume * 0.3 : this.musicVolume;
  }
  crossfadeMusic(targetVolume: number, duration = 520) {
    this.ensure();
    if (!this.musicGain || !this.context) return;
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, this.context.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(targetVolume, this.context.currentTime + duration / 1000);
  }
}