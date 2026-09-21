export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private scratchBuffer?: AudioBuffer;
  private readonly scratchSources = new Set<AudioBufferSourceNode>();
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
    oscillator.start();
    oscillator.stop(this.context!.currentTime + duration + 0.02);
  }
  scratch(intensity = 0.5) {
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
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const duration = 0.035 + normalized * 0.04;
    const startAt = context.currentTime;
    source.buffer = this.scratchBuffer;
    source.playbackRate.value = 0.72 + normalized * 0.48;
    filter.type = "bandpass";
    filter.frequency.value = 750 + normalized * 2_000;
    filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.055 + normalized * 0.075, startAt + 0.006);
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
  win() { this.tone(620, 0.12, "triangle"); setTimeout(() => this.tone(880, 0.16, "triangle"), 80); }
  winLabel() {
    this.tone(760, 0.07, "triangle");
    setTimeout(() => this.tone(1120, 0.09, "sine"), 42);
  }
  bonus() { [440, 660, 880, 1100].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.14, "sine"), index * 90)); }
  core(value: number, isBonus = true) {
    this.tone(value >= 100 ? 980 : isBonus ? 720 : 820, 0.16, "square");
    setTimeout(() => this.tone(value >= 500 ? 1560 : 1240, 0.2, "sine"), 90);
    if (!isBonus && value >= 500) setTimeout(() => this.tone(1960, 0.24, "triangle"), 190);
  }
  scatterArrival(count = 1) {
    const tones = count >= 4 ? [420, 560, 700, 900, 1160] : count === 3 ? [420, 560, 720, 980] : count === 2 ? [420, 580, 780] : [460, 640];
    tones.forEach((tone, index) => setTimeout(() => this.tone(tone, 0.11, "triangle"), index * 75));
  }
  scatterAnticipation(count: number) {
    if (count < 3) return;
    [260, 330, 420, 540].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.12, "sine"), index * 90));
  }
  scatterCelebration(count: number) {
    if (count < 4) return;
    [520, 700, 880, 1180, 1480].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.16, "triangle"), index * 75));
  }
  bonusUnlock(count: number) {
    if (count < 4) return;
    const base = count === 6 ? 392 : count === 5 ? 370 : 349;
    [base, base * 1.25, base * 1.5, base * 2, base * 2.5].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, index === 4 ? 0.32 : 0.16, index === 4 ? "sine" : "triangle"), index * 72);
    });
    setTimeout(() => this.tone(base * 3, 0.42, "sine"), 330);
  }
  freeSpinRawCollect() {
    this.tone(680, 0.08, "triangle");
    setTimeout(() => this.tone(980, 0.1, "sine"), 52);
  }
  multiplierCoreCollect(value: number, isBonus = true) {
    const large = value >= 500;
    const major = value >= 100;
    const base = large ? 860 : major ? 760 : isBonus ? 620 : 680;
    this.tone(base, large ? 0.16 : 0.11, "triangle");
    setTimeout(() => this.tone(base * (large ? 1.55 : 1.5), large ? 0.22 : 0.15, "sine"), 65);
    setTimeout(() => this.tone(base * (large ? 2.05 : 2), large ? 0.18 : 0.11, "triangle"), 135);
    if (large) setTimeout(() => this.tone(1960, 0.24, "sine"), 195);
  }
  freeSpinMultiplierCollect(value: number) {
    this.multiplierCoreCollect(value, true);
  }
  freeSpinResolve() {
    [460, 620, 820].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, 0.13, "sine"), index * 80);
    });
    setTimeout(() => this.tone(1240, 0.24, "triangle"), 250);
  }
  freeSpinTransfer() {
    this.tone(520, 0.12, "sine");
    setTimeout(() => this.tone(780, 0.18, "sine"), 90);
  }
  retriggerGather() {
    [360, 440, 540, 680].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, 0.1, "sine"), index * 75);
    });
  }
  retriggerReward() {
    [520, 760, 1040, 1380].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, index === 3 ? 0.3 : 0.14, "triangle"), index * 80);
    });
  }
  bigWin() { [440, 660, 880, 1320].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.22, "sawtooth"), index * 110)); }
  bonusComplete() { [660, 880, 1100, 1320].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.18, "sine"), index * 95)); }
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