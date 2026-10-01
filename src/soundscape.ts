type SoundState = 'idle' | 'drawing' | 'complete';

/** Original synthesized score; no downloaded music or third-party audio assets. */
export class DrawSoundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private timer?: ReturnType<typeof setInterval>;
  private voices = new Set<AudioScheduledSourceNode>();
  private state: SoundState = 'idle';
  private active = false;
  private nextBeat = 0;
  private beat = 0;
  private enabled = true;
  private suspended = false;
  constructor(private onStatusChange: (description: string) => void = () => {}) {}

  private publish() {
    const description = !this.enabled ? '音乐与音效已关闭'
      : this.suspended ? '音乐与音效已暂停'
      : this.state === 'idle' ? '点击开奖后播放音乐与音效'
      : this.context?.state === 'running' && this.active
        ? this.state === 'complete' ? '正在播放开奖完成音乐' : '正在播放开奖音乐与音效'
        : '点击声音按钮启用音乐与音效';
    this.onStatusChange(description);
  }

  async unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      this.context.onstatechange = () => this.publish();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = .32;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      this.refresh();
    } catch { this.publish(); /* Unsupported audio never prevents a draw. */ }
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; this.refresh(); }
  setState(state: SoundState) {
    if (state === this.state) return;
    this.stop(); this.state = state; this.beat = 0;
    this.refresh();
    if (state === 'complete' && this.active) this.fanfare();
  }
  setSuspended(suspended: boolean) { this.suspended = suspended; this.refresh(); }

  private refresh() {
    const shouldPlay = !!this.context && this.enabled && !this.suspended && this.state !== 'idle';
    if (!shouldPlay) { this.stop(); return; }
    if (this.active) { this.publish(); return; }
    this.active = true; this.nextBeat = this.context!.currentTime + .06;
    if (this.state === 'drawing') this.motor();
    this.schedule(); this.timer = setInterval(() => this.schedule(), 90);
    this.publish();
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined; this.active = false;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
    this.publish();
  }
  private track<T extends AudioScheduledSourceNode>(voice: T) {
    this.voices.add(voice); voice.onended = () => { this.voices.delete(voice); voice.disconnect(); }; return voice;
  }
  private note(midi: number, time: number, duration: number, volume = .1, type: OscillatorType = 'sine') {
    const ctx = this.context!, oscillator = this.track(ctx.createOscillator()), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(this.master!);
    oscillator.start(time); oscillator.stop(time + duration + .03);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }
  private noise(time: number, duration: number, volume: number, frequency: number) {
    const ctx = this.context!, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const source = this.track(ctx.createBufferSource()), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .8;
    gain.gain.value = volume; source.connect(filter); filter.connect(gain); gain.connect(this.master!);
    source.start(time); source.stop(time + duration);
    source.onended = () => { this.voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  private motor() {
    const ctx = this.context!, oscillator = this.track(ctx.createOscillator()), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.value = 56; filter.type = 'lowpass'; filter.frequency.value = 180;
    gain.gain.value = .018; oscillator.connect(filter); filter.connect(gain); gain.connect(this.master!); oscillator.start();
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  private schedule() {
    const ctx = this.context!;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + .04;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const ending = this.state === 'complete', interval = ending ? .55 : .34;
    while (this.nextBeat < ctx.currentTime + .25) {
      const chord = chords[Math.floor(this.beat / 16) % chords.length];
      this.note(chord[this.beat % 3] + 12, this.nextBeat, ending ? .85 : .48, ending ? .065 : .09, 'triangle');
      if (this.beat % 8 === 0) chord.forEach(n => this.note(n, this.nextBeat, interval * 7, .025));
      if (!ending && this.beat % 2 === 0) this.noise(this.nextBeat, .055, .055, 1600);
      this.nextBeat += interval; this.beat++;
    }
  }
  ball(color: 'red' | 'blue') {
    if (!this.active) return;
    const now = this.context!.currentTime;
    this.noise(now, .085, .3, 2300);
    this.note(color === 'blue' ? 86 : 81, now, .32, .2);
    this.note(color === 'blue' ? 93 : 88, now + .06, .35, .08);
  }
  private fanfare() {
    const now = this.context!.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.note(n, now + i * .16, .8, .18, 'triangle'));
    [60, 64, 67, 72].forEach(n => this.note(n, now + .65, 1.7, .055));
    this.noise(now + .65, .32, .1, 4500);
  }
}
