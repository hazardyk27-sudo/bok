export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
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
  click() { this.tone(480, 0.05, "triangle"); }
  spin() { this.tone(180, 0.16, "sine"); }
  win() { this.tone(620, 0.12, "triangle"); setTimeout(() => this.tone(880, 0.16, "triangle"), 80); }
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