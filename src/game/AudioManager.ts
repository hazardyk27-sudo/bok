export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  muted = localStorage.getItem("cascade8-muted") === "true";
  volume = Number(localStorage.getItem("cascade8-volume") ?? "0.38");

  setMuted(value: boolean) {
    this.muted = value;
    localStorage.setItem("cascade8-muted", String(value));
  }
  setVolume(value: number) {
    this.volume = value;
    localStorage.setItem("cascade8-volume", String(value));
    if (this.gain) this.gain.gain.value = value;
  }
  private ensure() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
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
    envelope.connect(this.gain!);
    oscillator.start();
    oscillator.stop(this.context!.currentTime + duration + 0.02);
  }
  click() { this.tone(480, 0.05, "triangle"); }
  spin() { this.tone(180, 0.16, "sine"); }
  win() { this.tone(620, 0.12, "triangle"); setTimeout(() => this.tone(880, 0.16, "triangle"), 80); }
  bonus() { [440, 660, 880, 1100].forEach((tone, index) => setTimeout(() => this.tone(tone, 0.14, "sine"), index * 90)); }
}