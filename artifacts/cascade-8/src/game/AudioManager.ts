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
    if (!this.scratchBuffer) {
      const sampleRate = context.sampleRate;
      const buffer = context.createBuffer(1, Math.ceil(sampleRate * 0.12), sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        const envelope = 1 - index / samples.length;
        samples[index] = (Math.random() * 2 - 1) * envelope;
      }
      this.scratchBuffer = buffer;
    }

    const normalized = Math.max(0, Math.min(1, intensity));
    const depth = Math.max(0, Math.min(1, abrasion));
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const duration = 0.04 + normalized * 0.035 + depth * 0.02;
    const startAt = context.currentTime;
    source.buffer = this.scratchBuffer;
    source.playbackRate.value = 0.68 + normalized * 0.42 + depth * 0.18;
    filter.type = "bandpass";
    filter.frequency.value = 650 + normalized * 1_700 + depth * 900;
    filter.Q.value = 0.6 + depth * 0.25;
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.04 + normalized * 0.055 + depth * 0.035, startAt + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.sfxGain!);
    this.scratchSources.add(source);
    source.addEventListener("ended", () => {
      this.scratchSources.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    }, { once: true });
    source.start(startAt);
    source.stop(startAt + duration);
  }
  click() { this.tone(480, 0.05, "triangle"); }
  spin() { this.tone(180, 0.16, "sine"); }
  win() { this.tone(620, 0.12, "triangle"); this.delayedTone(880, 0.16, "triangle", 80); }
  cashRegister() {
    if (this.muted) return;
    this.ensure();
    const context = this.context!;
    const output = this.sfxGain!;
    const start = context.currentTime;

    // Drawer clack.
    const clackBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.075), context.sampleRate);
    const clackSamples = clackBuffer.getChannelData(0);
    for (let index = 0; index < clackSamples.length; index += 1) {
      const progress = index / clackSamples.length;
      clackSamples[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2.2);
    }
    const clack = context.createBufferSource();
    const clackFilter = context.createBiquadFilter();
    const clackGain = context.createGain();
    clack.buffer = clackBuffer;
    clackFilter.type = "bandpass";
    clackFilter.frequency.value = 1_050;
    clackFilter.Q.value = 0.75;
    clackGain.gain.setValueAtTime(0.0001, start);
    clackGain.gain.exponentialRampToValueAtTime(0.28, start + 0.006);
    clackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
    clack.connect(clackFilter);
    clackFilter.connect(clackGain);
    clackGain.connect(output);
    clack.addEventListener("ended", () => {
      clack.disconnect();
      clackFilter.disconnect();
      clackGain.disconnect();
    }, { once: true });
    clack.start(start);
    clack.stop(start + 0.08);

    // Coin/bell tail: deliberately bright and unmistakable as a payout cue.
    [
      { frequency: 980, at: 0.035, duration: 0.18, gain: 0.18 },
      { frequency: 1_320, at: 0.075, duration: 0.22, gain: 0.20 },
      { frequency: 1_760, at: 0.125, duration: 0.28, gain: 0.18 },
      { frequency: 2_240, at: 0.19, duration: 0.34, gain: 0.13 },
    ].forEach(({ frequency, at, duration, gain }) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start + at);
      envelope.gain.setValueAtTime(0.0001, start + at);
      envelope.gain.exponentialRampToValueAtTime(gain, start + at + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + at + duration);
      oscillator.connect(envelope);
      envelope.connect(output);
      this.activeTones.add(oscillator);
      oscillator.addEventListener("ended", () => {
        this.activeTones.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      }, { once: true });
      oscillator.start(start + at);
      oscillator.stop(start + at + duration + 0.02);
    });
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