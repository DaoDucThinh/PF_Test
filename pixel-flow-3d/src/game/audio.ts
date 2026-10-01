const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  sfxOn = true;
  musicOn = true;

  constructor() {
    this.sfxOn = localStorage.getItem('pf_sfx') !== '0';
    this.musicOn = localStorage.getItem('pf_music') !== '0';
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.22 : 0;
    this.music.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    localStorage.setItem('pf_sfx', on ? '1' : '0');
    if (this.ctx) this.sfx.gain.value = on ? 1 : 0;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    localStorage.setItem('pf_music', on ? '1' : '0');
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; delay?: number; attack?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  pop(combo: number): void {
    const n = 72 + PENTA[Math.min(PENTA.length - 1, combo % PENTA.length)];
    this.tone(midi(n), 0.12, 'triangle', 0.16, { slide: 1.5 });
    this.tone(midi(n + 12), 0.06, 'sine', 0.06);
    this.burst(0.05, 0.12, 3500, 2);
  }

  shoot(): void {
    this.tone(900 + Math.random() * 200, 0.08, 'square', 0.025, { slide: 0.4 });
  }

  jump(): void {
    this.tone(260, 0.22, 'sine', 0.18, { slide: 2.6 });
    this.tone(520, 0.12, 'triangle', 0.05, { slide: 2 });
  }

  land(): void {
    this.tone(140, 0.12, 'sine', 0.25, { slide: 0.5 });
    this.burst(0.06, 0.08, 600, 1);
  }

  slot(): void {
    this.tone(660, 0.08, 'triangle', 0.12);
    this.tone(990, 0.1, 'triangle', 0.1, { delay: 0.06 });
  }

  oink(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      const st = t + i * 0.13;
      o.frequency.setValueAtTime(330, st);
      o.frequency.linearRampToValueAtTime(420, st + 0.05);
      o.frequency.linearRampToValueAtTime(260, st + 0.11);
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.12, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(st);
      o.stop(st + 0.14);
    }
  }

  done(): void {
    [0, 4, 7, 12].forEach((s, i) => this.tone(midi(76 + s), 0.18, 'triangle', 0.1, { delay: i * 0.05 }));
  }

  denied(): void {
    this.tone(200, 0.1, 'square', 0.06);
    this.tone(150, 0.14, 'square', 0.06, { delay: 0.09 });
  }

  click(): void {
    this.tone(880, 0.05, 'triangle', 0.08);
  }

  warning(): void {
    this.tone(523, 0.1, 'sine', 0.1);
    this.tone(415, 0.16, 'sine', 0.1, { delay: 0.1 });
  }

  win(): void {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => {
      this.tone(midi(67 + s), 0.3, 'triangle', 0.12, { delay: i * 0.085 });
      this.tone(midi(55 + s), 0.3, 'sine', 0.06, { delay: i * 0.085 });
    });
    this.burst(0.8, 0.05, 6000, 0.5, 0.7);
  }

  reveal(i: number): void {
    this.tone(midi(84 + PENTA[i % 8]), 0.09, 'sine', 0.035);
  }

  star(i: number): void {
    this.tone(midi(79 + i * 5), 0.35, 'triangle', 0.14);
    this.tone(midi(91 + i * 5), 0.2, 'sine', 0.05);
  }

  lose(): void {
    [0, -3, -6, -12].forEach((s, i) => this.tone(midi(64 + s), 0.32, 'triangle', 0.12, { delay: i * 0.16 }));
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const spb = 60 / 104 / 2;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]];
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const b = this.beat;
      const chord = chords[Math.floor(b / 16) % chords.length];
      const delay = Math.max(0, this.nextBeat - ctx.currentTime);
      if (b % 16 === 0) chord.forEach((n) => this.tone(midi(n), spb * 15, 'sine', 0.05, { attack: 0.4, delay, dest: this.music }));
      if (b % 4 === 0) this.tone(midi(chord[0] - 24), spb * 1.8, 'triangle', 0.18, { delay, dest: this.music });
      const arp = [0, 2, 1, 3, 2, 1, 3, 2];
      if (b % 2 === 0 || b % 8 === 7) this.tone(midi(chord[arp[b % 8]] + 12), spb * 0.9, 'triangle', 0.07, { delay, dest: this.music });
      this.nextBeat += spb;
      this.beat++;
    }
  }

  dispose(): void {
    window.clearInterval(this.musicTimer);
  }
}
