export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  t: number;
  d: number;
  delay: number;
  fn: (k: number) => void;
  ease: EaseFn;
  done?: () => void;
  owner?: object;
}

export interface TweenOpts {
  ease?: EaseFn;
  delay?: number;
  done?: () => void;
  owner?: object;
}

export class Tweens {
  private list: Tween[] = [];

  add(duration: number, fn: (k: number) => void, opts: TweenOpts = {}): void {
    this.list.push({ t: 0, d: Math.max(1e-4, duration), delay: opts.delay ?? 0, fn, ease: opts.ease ?? Ease.outCubic, done: opts.done, owner: opts.owner });
  }

  wait(duration: number, done: () => void, owner?: object): void {
    this.add(duration, () => {}, { done, owner });
  }

  killOwner(owner: object): void {
    this.list = this.list.filter((t) => t.owner !== owner);
  }

  clear(): void {
    this.list.length = 0;
  }

  update(dt: number): void {
    const current = this.list;
    this.list = [];
    const keep: Tween[] = [];
    for (const tw of current) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        keep.push(tw);
        continue;
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(tw.ease(k));
      if (k >= 1) tw.done?.();
      else keep.push(tw);
    }
    this.list = keep.concat(this.list);
  }
}
