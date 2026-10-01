import * as THREE from 'three';
import { Board, type Side } from './board';
import { Conveyor, LoopPath, slab } from './conveyor';
import { buildLevel, PALETTE, type BuiltLevel } from './levels';
import { PigView } from './pig';
import { Debris, Sparks, Confetti } from './particles';
import { Ease, Tweens } from './tween';
import type { Sfx } from './audio';

type PigState = 'lane' | 'toBelt' | 'dock' | 'belt' | 'toSlot' | 'slot' | 'gone';

interface Pig {
  view: PigView;
  color: string;
  ammo: number;
  state: PigState;
  lane: number;
  s: number;
  traveled: number;
  fired: Set<string>;
  shotsThisRun: number;
  home: THREE.Vector3;
  bobPhase: number;
  recoil: number;
  busy: boolean;
}

interface Ball {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  cell: number;
  color: string;
}

export interface GameUI {
  progress(p: number): void;
  win(stars: number, name: string, level: number): void;
  lose(canContinue: boolean): void;
  toast(text: string): void;
  levelStarted(level: number, name: string): void;
}

export type GameState = 'idle' | 'playing' | 'won' | 'lost';

const BOARD_MAX = 9;
const BELT_W = 1.3;
const SLOT_GAP = 1.38;
const LANE_ROW = 1.5;
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

export class Game {
  state: GameState = 'idle';
  level!: BuiltLevel;
  levelIndex = 0;
  shake = 0;
  readonly bounds = new THREE.Box3();
  private world = new THREE.Group();
  private fx = new THREE.Group();
  private board!: Board;
  private conveyor!: Conveyor;
  private path!: LoopPath;
  private pigs: Pig[] = [];
  private lanes: Pig[][] = [];
  private slots: (Pig | null)[] = [];
  private slotPads: THREE.Mesh[] = [];
  private laneX: number[] = [];
  private laneZ0 = 0;
  private slotZ = 0;
  private dock = new THREE.Vector3();
  private balls: Ball[] = [];
  private ballPool: THREE.Mesh[] = [];
  private ballGeo = new THREE.SphereGeometry(0.13, 16, 12);
  private ballMats = new Map<string, THREE.Material>();
  private tweens = new Tweens();
  private speed = 7;
  private boardY = 0.16;
  private combo = 0;
  private comboTimer = 0;
  private maxSlotsUsed = 0;
  private continued = false;
  private warned = false;
  private totalCubes = 0;
  private time = 0;
  private readyRings: THREE.Mesh[] = [];
  private floorMat: THREE.MeshStandardMaterial;
  private floorTex: THREE.CanvasTexture | null = null;
  private disposables: { dispose(): void }[] = [];
  private raycaster = new THREE.Raycaster();
  private capEl: HTMLDivElement;
  private handEl: HTMLDivElement;
  private tutorial = false;
  private lastShotSfx = 0;
  readonly debris = new Debris();
  readonly sparks = new Sparks();
  readonly confetti = new Confetti();

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sfx: Sfx,
    private ui: GameUI,
    private overlay: HTMLElement,
  ) {
    scene.add(this.world, this.fx);
    this.fx.add(this.debris.mesh, this.sparks.points, this.confetti.mesh);
    this.debris.floorY = 0.02;
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    this.capEl = document.createElement('div');
    this.capEl.className = 'cap-badge';
    overlay.appendChild(this.capEl);
    this.handEl = document.createElement('div');
    this.handEl.className = 'tut-hand';
    this.handEl.innerHTML = '<div class="hand"><svg viewBox="0 0 64 64"><path d="M24 30V10a5 5 0 0 1 10 0v16l13 2.5c4 .8 6.5 4.6 5.7 8.6L50 52a8 8 0 0 1-8 7H31a8 8 0 0 1-6.4-3.2L14 41.5a4.5 4.5 0 0 1 6.8-5.9z" fill="#fff" stroke="#2a2350" stroke-width="4" stroke-linejoin="round"/></svg></div><div class="ring"></div><div class="tut-text">Tap a pig!</div>';
    overlay.appendChild(this.handEl);
  }

  load(index: number): void {
    this.clear();
    this.levelIndex = index;
    this.level = buildLevel(index);
    const def = this.level.def;
    const theme = def.theme;

    this.floorTex = this.makeFloorTexture(theme.floor, theme.floorDots);
    this.floorMat.map = this.floorTex;
    this.floorMat.needsUpdate = true;

    this.board = new Board(this.level, BOARD_MAX);
    this.board.group.position.y = this.boardY;
    this.world.add(this.board.group);
    this.totalCubes = this.board.aliveCount;

    const hx = this.board.width / 2 + 0.55 + BELT_W / 2;
    const hz = this.board.depth / 2 + 0.55 + BELT_W / 2;
    this.path = new LoopPath(hx, hz, 1.0);
    this.conveyor = new Conveyor(this.path, BELT_W, theme.accent);
    this.world.add(this.conveyor.group);
    this.speed = THREE.MathUtils.clamp(this.path.length / 6.2, 5.5, 8.5);

    const plat = new THREE.MeshPhysicalMaterial({ color: theme.platform, roughness: 0.5, clearcoat: 0.3 });
    const base = slab(-this.board.width / 2 - 0.3, -this.board.depth / 2 - 0.3, this.board.width / 2 + 0.3, this.board.depth / 2 + 0.3, 0.35, this.boardY, plat);
    this.world.add(base);
    this.disposables.push(base.geometry, plat);

    this.dock.set(0, this.conveyor.surfaceY, hz);
    const outerZ = hz + BELT_W / 2 + 0.35;
    this.slotZ = outerZ + 1.25;
    this.laneZ0 = this.slotZ + 2.05;

    const trayMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(theme.platform).lerp(new THREE.Color(theme.accent), 0.12), roughness: 0.55, clearcoat: 0.2 });
    this.disposables.push(trayMat);
    this.buildSlots(def.slots, trayMat);

    const lanesN = def.lanes;
    const span = Math.min(2.25 * lanesN, 2 * hx + 0.4);
    const gap = span / lanesN;
    this.laneX = Array.from({ length: lanesN }, (_, i) => (i - (lanesN - 1) / 2) * gap);
    for (const x of this.laneX) {
      const lane = slab(x - gap * 0.42, this.laneZ0 - 0.85, x + gap * 0.42, this.laneZ0 + 40, 0.5, 0.1, trayMat);
      this.world.add(lane);
      this.disposables.push(lane.geometry);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.12, this.laneZ0);
      this.world.add(ring);
      this.readyRings.push(ring);
      this.disposables.push(ring.geometry, ring.material as THREE.Material);
    }

    this.lanes = this.level.lanes.map((specs, li) =>
      specs.map((spec, i) => {
        const view = new PigView(spec.color);
        view.setAmmo(spec.ammo);
        const pig: Pig = { view, color: spec.color, ammo: spec.ammo, state: 'lane', lane: li, s: 0, traveled: 0, fired: new Set(), shotsThisRun: 0, home: new THREE.Vector3(), bobPhase: Math.random() * 6, recoil: 0, busy: true };
        this.lanePos(li, i, pig.home);
        view.root.position.copy(pig.home);
        view.root.position.y += 6 + i * 1.5 + li * 0.4;
        this.tweens.add(0.6, (k) => { view.root.position.y = pig.home.y + (1 - k) * (6 + i * 1.5 + li * 0.4); }, { ease: Ease.outBack, delay: 0.25 + i * 0.07 + li * 0.05, owner: pig, done: () => { pig.busy = false; } });
        this.world.add(view.root);
        this.pigs.push(pig);
        return pig;
      }),
    );

    const minX = -hx - BELT_W / 2 - 0.5;
    const maxX = hx + BELT_W / 2 + 0.5;
    this.bounds.set(new THREE.Vector3(Math.min(minX, this.laneX[0] - 1.2), 0, -hz - BELT_W / 2 - 0.9), new THREE.Vector3(Math.max(maxX, this.laneX[lanesN - 1] + 1.2), 1.6, this.laneZ0 + LANE_ROW * 2.6));

    this.board.group.scale.setScalar(0.001);
    this.tweens.add(0.7, (k) => this.board.group.scale.setScalar(Math.max(0.001, k)), { ease: Ease.outBack, delay: 0.05 });

    this.state = 'playing';
    this.tutorial = index === 0;
    this.handEl.style.display = this.tutorial ? 'block' : 'none';
    this.ui.progress(0);
    this.ui.levelStarted(index + 1, def.name);
    this.updateCapacity();
  }

  private buildSlots(n: number, trayMat: THREE.Material): void {
    for (const p of this.slotPads) {
      this.world.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.slotPads = [];
    const old = this.slots;
    this.slots = Array.from({ length: n }, (_, i) => old[i] ?? null);
    const w = n * SLOT_GAP;
    const existingTray = this.world.getObjectByName('slotTray');
    if (existingTray) {
      this.world.remove(existingTray);
      (existingTray as THREE.Mesh).geometry.dispose();
    }
    const tray = slab(-w / 2 - 0.3, this.slotZ - 0.85, w / 2 + 0.3, this.slotZ + 0.85, 0.6, 0.14, trayMat);
    tray.name = 'slotTray';
    this.world.add(tray);
    for (let i = 0; i < n; i++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.06, 36), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.75 }));
      pad.position.set(this.slotX(i), 0.16, this.slotZ);
      pad.receiveShadow = true;
      this.world.add(pad);
      this.slotPads.push(pad);
    }
  }

  private slotX(i: number): number {
    return (i - (this.slots.length - 1) / 2) * SLOT_GAP;
  }

  private lanePos(lane: number, row: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.laneX[lane], 0.1, this.laneZ0 + row * LANE_ROW);
  }

  private makeFloorTexture(base: number, dot: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#' + new THREE.Color(base).getHexString();
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#' + new THREE.Color(dot).getHexString();
    for (const [x, y] of [[32, 32], [96, 96]]) {
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(120, 120);
    t.anisotropy = 8;
    return t;
  }

  clear(): void {
    this.tweens.clear();
    for (const p of this.pigs) {
      this.world.remove(p.view.root);
      p.view.dispose();
    }
    for (const b of this.balls) this.fx.remove(b.mesh);
    this.balls = [];
    this.pigs = [];
    this.lanes = [];
    this.slots = [];
    for (const p of this.slotPads) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.slotPads = [];
    this.readyRings = [];
    if (this.board) this.board.dispose();
    if (this.conveyor) this.conveyor.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    const tray = this.world.getObjectByName('slotTray') as THREE.Mesh | undefined;
    tray?.geometry.dispose();
    this.world.clear();
    this.floorTex?.dispose();
    this.debris.clear();
    this.sparks.clear();
    this.confetti.clear();
    this.combo = 0;
    this.maxSlotsUsed = 0;
    this.continued = false;
    this.warned = false;
    this.state = 'idle';
  }

  // ---------------------------------------------------------------- input

  tap(ndc: THREE.Vector2): void {
    if (this.state !== 'playing') return;
    this.raycaster.setFromCamera(ndc, this.camera);
    const candidates = this.pigs.filter((p) => p.state === 'lane' || p.state === 'slot');
    const hits = this.raycaster.intersectObjects(candidates.map((p) => p.view.hit), false);
    if (!hits.length) return;
    const pig = candidates.find((p) => p.view.hit === hits[0].object);
    if (!pig) return;
    if (pig.state === 'lane') {
      const front = this.lanes[pig.lane][0];
      this.launch(front);
    } else {
      this.launch(pig);
    }
  }

  private beltCount(): number {
    return this.pigs.filter((p) => p.state === 'toBelt' || p.state === 'dock' || p.state === 'belt').length;
  }

  private launch(pig: Pig): void {
    const cap = this.level.def.capacity;
    if (this.beltCount() >= cap) {
      this.sfx.denied();
      this.ui.toast('Conveyor is full!');
      this.capEl.classList.remove('shake');
      void this.capEl.offsetWidth;
      this.capEl.classList.add('shake');
      const r = pig.view.root;
      this.tweens.add(0.4, (k) => { r.rotation.z = Math.sin(k * Math.PI * 6) * 0.25 * (1 - k); }, { ease: Ease.linear });
      return;
    }
    if (this.tutorial) {
      this.tutorial = false;
      this.handEl.style.display = 'none';
    }
    navigator.vibrate?.(12);
    if (pig.state === 'lane') {
      this.lanes[pig.lane].shift();
      this.lanes[pig.lane].forEach((p, i) => this.lanePos(p.lane, i, p.home));
    } else {
      const i = this.slots.indexOf(pig);
      this.slots.splice(i, 1);
      this.slots.push(null);
      this.slots.forEach((p, j) => p && p.home.set(this.slotX(j), 0.18, this.slotZ));
    }
    pig.state = 'toBelt';
    pig.busy = false;
    this.sfx.jump();
    this.tweens.killOwner(pig);
    const from = pig.view.root.position.clone();
    const to = this.dock.clone();
    const r0 = pig.view.root.rotation.y;
    const r1 = Math.PI;
    this.tweens.add(0.42, (k) => {
      pig.view.root.position.lerpVectors(from, to, k);
      pig.view.root.position.y += Math.sin(k * Math.PI) * 2.4;
      pig.view.root.rotation.y = r0 + (r1 - r0) * k;
      pig.view.body.rotation.x = -Math.sin(k * Math.PI * 2) * 0.3;
      const st = 1 + Math.sin(k * Math.PI) * 0.15;
      pig.view.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    }, {
      ease: Ease.inOutQuad,
      owner: pig,
      done: () => {
        pig.view.body.rotation.x = 0;
        pig.state = 'dock';
        this.sfx.land();
        this.squash(pig, 0.35);
        this.sparks.emit(TMP.copy(to).setY(to.y + 0.1), 0xffffff, 10, { speed: 3, size: 0.3, up: 0.5, gravity: 2 });
      },
    });
    this.updateCapacity();
  }

  private squash(pig: Pig, amt: number): void {
    const b = pig.view.body;
    this.tweens.add(0.35, (k) => {
      const s = 1 - amt * Math.sin(k * Math.PI) * (1 - k);
      b.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    }, { ease: Ease.linear });
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.time += dt;
    this.tweens.update(dt);
    const playing = this.state === 'playing';
    if (playing || this.state === 'won') this.conveyor?.update(dt, this.speed);

    if (playing) {
      this.updateDock();
      this.updateBelt(dt);
    }
    this.updateBalls(dt);
    this.updateIdle(dt);
    this.board?.update(dt);
    this.debris.update(dt);
    this.sparks.update(dt);
    this.confetti.update(dt, this.time);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.positionOverlay();

    if (playing && this.board.visibleCount === 0 && this.balls.length === 0) this.win();
  }

  private updateDock(): void {
    const docked = this.pigs.filter((p) => p.state === 'dock');
    if (!docked.length) return;
    const gap = 1.35;
    const L = this.path.length;
    const blocked = this.pigs.some((p) => p.state === 'belt' && (p.s < gap || L - p.traveled < gap * 0.6));
    if (blocked) return;
    const pig = docked[0];
    pig.state = 'belt';
    pig.s = 0;
    pig.traveled = 0;
    pig.fired.clear();
    pig.shotsThisRun = 0;
  }

  private updateBelt(dt: number): void {
    const L = this.path.length;
    const step = this.board.cell * 0.5;
    for (const pig of this.pigs) {
      if (pig.state !== 'belt') continue;
      const prev = pig.traveled;
      pig.traveled = Math.min(L, pig.traveled + this.speed * dt);
      pig.s = pig.traveled;
      for (let d = prev; ; d = Math.min(pig.traveled, d + step)) {
        this.scan(pig, d);
        if (d >= pig.traveled || pig.state !== 'belt') break;
      }
      if (pig.state !== 'belt') continue;
      const smp = this.path.sample(pig.s);
      const r = pig.view.root;
      r.position.set(smp.pos.x, this.conveyor.surfaceY, smp.pos.z);
      const target = Math.atan2(-smp.pos.x, -smp.pos.z);
      r.rotation.y = lerpAngle(r.rotation.y, target, 1 - Math.exp(-12 * dt));
      const w = this.time * 11 + pig.bobPhase;
      pig.view.body.position.y = Math.abs(Math.sin(w)) * 0.06;
      pig.view.body.rotation.z = Math.sin(w) * 0.07;
      pig.recoil = Math.max(0, pig.recoil - dt * 8);
      pig.view.body.position.z = -pig.recoil * 0.12;
      if (pig.traveled >= L) this.finishLoop(pig);
    }
  }

  private scan(pig: Pig, d: number): void {
    if (pig.ammo <= 0) return;
    const smp = this.path.sample(d);
    const side = smp.side as Side | null;
    if (!side) return;
    const line = this.board.lineIndex(side, smp.pos);
    if (line < 0) return;
    const key = side + line;
    if (pig.fired.has(key)) return;
    pig.fired.add(key);
    const idx = this.board.firstAlive(side, line);
    if (idx < 0 || this.board.colorOf(idx) !== pig.color) return;
    this.fire(pig, idx, smp.pos);
  }

  private fire(pig: Pig, idx: number, at: THREE.Vector3): void {
    this.board.claim(idx);
    pig.ammo--;
    pig.shotsThisRun++;
    pig.view.setAmmo(pig.ammo);
    pig.recoil = 1;
    const from = new THREE.Vector3(at.x, this.conveyor.surfaceY + 0.75, at.z);
    const to = this.board.cellPos(idx, new THREE.Vector3());
    to.y += this.boardY + this.board.height * 0.5;
    from.lerp(TMP.set(to.x, from.y, to.z), 0.35 / Math.max(0.35, from.distanceTo(to)));
    const mesh = this.ballPool.pop() ?? new THREE.Mesh(this.ballGeo);
    mesh.material = this.ballMat(pig.color);
    mesh.position.copy(from);
    mesh.castShadow = true;
    this.fx.add(mesh);
    const dist = from.distanceTo(to);
    this.balls.push({ mesh, from, to, t: 0, dur: THREE.MathUtils.clamp(dist / 22, 0.08, 0.32), cell: idx, color: pig.color });
    this.sparks.emit(from, PALETTE[pig.color].hex, 3, { speed: 2, size: 0.3, life: 0.25, up: 0.5 });
    if (this.time - this.lastShotSfx > 0.045) {
      this.sfx.shoot();
      this.lastShotSfx = this.time;
    }
    if (pig.ammo === 0) this.retire(pig);
  }

  private ballMat(color: string): THREE.Material {
    let m = this.ballMats.get(color);
    if (!m) {
      const hex = PALETTE[color].hex;
      m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.4, roughness: 0.2 });
      this.ballMats.set(color, m);
    }
    return m;
  }

  private updateBalls(dt: number): void {
    const keep: Ball[] = [];
    for (const b of this.balls) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.mesh.position.lerpVectors(b.from, b.to, k);
      b.mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      if (Math.random() < 0.7) this.sparks.emit(b.mesh.position, PALETTE[b.color].hex, 1, { speed: 0.3, size: 0.22, life: 0.22, up: 0, gravity: 0 });
      if (k >= 1) {
        this.fx.remove(b.mesh);
        this.ballPool.push(b.mesh);
        this.impact(b);
      } else keep.push(b);
    }
    this.balls = keep;
  }

  private impact(b: Ball): void {
    this.board.smash(b.cell);
    const hex = PALETTE[b.color].hex;
    const p = this.board.cellPos(b.cell, TMP2);
    p.y += this.boardY + this.board.height * 0.6;
    this.debris.emit(p, hex, 5, 0.8, this.board.cell * 0.32);
    this.sparks.emit(p, hex, 9, { speed: 5, size: 0.4, life: 0.45 });
    this.sparks.emit(p, 0xffffff, 3, { speed: 3, size: 0.5, life: 0.2 });
    this.combo++;
    this.comboTimer = 0.55;
    this.sfx.pop(this.combo);
    this.shake = Math.min(0.35, this.shake + 0.025);
    if (this.combo > 0 && this.combo % 15 === 0) this.floatText(`${this.combo} COMBO!`, p, 'combo');
    this.ui.progress(1 - this.board.visibleCount / this.totalCubes);
  }

  private retire(pig: Pig): void {
    pig.state = 'gone';
    this.updateCapacity();
    const r = pig.view.root;
    const from = r.position.clone();
    const out = TMP.set(from.x, 0, from.z).normalize().multiplyScalar(1.6).add(from);
    const to = out.clone();
    if (pig.shotsThisRun >= 8) this.floatText('PERFECT!', from, 'perfect');
    this.tweens.add(0.5, (k) => {
      r.position.lerpVectors(from, to, k);
      r.position.y = from.y + Math.sin(k * Math.PI) * 1.6 + k * 0.6;
      r.rotation.y += 0.4;
      r.scale.setScalar(Math.max(0.001, 1 - Ease.inBack(k)));
    }, {
      ease: Ease.linear,
      delay: 0.12,
      owner: pig,
      done: () => {
        this.world.remove(r);
        const p = r.position.clone();
        p.y += 0.6;
        this.sparks.emit(p, pig.view.hex, 30, { speed: 6, size: 0.5, life: 0.6 });
        this.sparks.emit(p, 0xfff2a8, 14, { speed: 4, size: 0.45, life: 0.5 });
        this.debris.emit(p, pig.view.hex, 6, 0.7, 0.16);
        this.sfx.done();
      },
    });
    this.sfx.oink();
  }

  private finishLoop(pig: Pig): void {
    const free = this.slots.indexOf(null);
    if (free < 0) {
      this.lose(pig);
      return;
    }
    this.slots[free] = pig;
    pig.state = 'toSlot';
    pig.home.set(this.slotX(free), 0.18, this.slotZ);
    const used = this.slots.filter(Boolean).length;
    this.maxSlotsUsed = Math.max(this.maxSlotsUsed, used);
    this.updateCapacity();
    const from = pig.view.root.position.clone();
    const to = pig.home.clone();
    const r0 = pig.view.root.rotation.y;
    this.sfx.jump();
    this.tweens.add(0.45, (k) => {
      pig.view.root.position.lerpVectors(from, to, k);
      pig.view.root.position.y += Math.sin(k * Math.PI) * 2;
      pig.view.root.rotation.y = r0 + (Math.PI * 2 - r0) * k;
    }, {
      ease: Ease.inOutQuad,
      owner: pig,
      done: () => {
        pig.view.root.rotation.y = 0;
        pig.state = 'slot';
        this.sfx.slot();
        this.squash(pig, 0.3);
        if (used >= this.slots.length - 1 && !this.warned) {
          this.warned = true;
          this.sfx.warning();
          this.ui.toast(used >= this.slots.length ? 'Slots full — careful!' : 'Only 1 slot left!');
        }
        if (used < this.slots.length - 1) this.warned = false;
      },
    });
  }

  private updateIdle(dt: number): void {
    const t = this.time;
    for (const pig of this.pigs) {
      pig.view.update(dt);
      if (pig.state === 'lane' || pig.state === 'slot') {
        const r = pig.view.root;
        if (!pig.busy) {
          r.position.x += (pig.home.x - r.position.x) * (1 - Math.exp(-10 * dt));
          r.position.z += (pig.home.z - r.position.z) * (1 - Math.exp(-10 * dt));
          r.position.y += (pig.home.y - r.position.y) * (1 - Math.exp(-14 * dt));
        }
        const front = pig.state === 'slot' || this.lanes[pig.lane]?.[0] === pig;
        const hop = front ? Math.max(0, Math.sin(t * 5 + pig.bobPhase)) * 0.08 : Math.sin(t * 2.4 + pig.bobPhase) * 0.015;
        pig.view.body.position.y = hop;
        pig.view.body.position.z = 0;
        pig.view.body.rotation.z = 0;
        const target = front ? 1 : 0.9;
        const s = r.scale.x + (target - r.scale.x) * (1 - Math.exp(-8 * dt));
        r.scale.setScalar(s);
        pig.view.label.material.opacity = front ? 1 : 0.85;
      }
    }
    this.readyRings.forEach((ring, i) => {
      const front = this.lanes[i]?.[0];
      ring.visible = !!front && this.state === 'playing';
      if (front) {
        ring.position.x = front.view.root.position.x;
        ring.position.z = front.view.root.position.z;
        const k = (t * 1.6) % 1;
        ring.scale.setScalar(0.85 + k * 0.35);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      }
    });
    const used = this.slots.filter(Boolean).length;
    const danger = used >= this.slots.length - 1;
    this.slotPads.forEach((pad, i) => {
      const m = pad.material as THREE.MeshStandardMaterial;
      const pulse = danger ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
      m.color.setRGB(1, 1 - pulse * 0.55, 1 - pulse * 0.6);
      m.emissive.setRGB(pulse * 0.35, 0, 0);
      pad.scale.setScalar(this.slots[i] ? 1.05 : 1);
    });
  }

  // ---------------------------------------------------------------- end states

  private win(): void {
    this.state = 'won';
    this.handEl.style.display = 'none';
    const stars = this.maxSlotsUsed <= 1 ? 3 : this.maxSlotsUsed <= 3 ? 2 : 1;
    this.sfx.win();
    const colors = Object.values(PALETTE).map((p) => p.hex);
    const top = new THREE.Vector3(0, 1, 0);
    this.confetti.burst(top, colors, 260, 1);
    this.tweens.wait(0.35, () => {
      this.confetti.burst(new THREE.Vector3(-4, 0.5, 3), colors, 120, 0.8);
      this.confetti.burst(new THREE.Vector3(4, 0.5, 3), colors, 120, 0.8);
    });
    this.shake = 0.5;
    this.tweens.wait(0.7, () => {
      const dur = this.board.reveal((i) => this.sfx.reveal(i));
      this.tweens.wait(dur, () => {
        this.sparks.emit(new THREE.Vector3(0, 1.5, 0), 0xfff2a8, 120, { speed: 12, size: 0.7, life: 1.1, up: 3 });
        this.ui.win(stars, this.level.def.name, this.levelIndex + 1);
      });
    });
  }

  private lose(pig: Pig): void {
    this.state = 'lost';
    this.sfx.lose();
    this.shake = 0.6;
    const r = pig.view.root;
    this.tweens.add(0.6, (k) => { r.rotation.z = Math.sin(k * Math.PI * 8) * 0.3 * (1 - k); }, { ease: Ease.linear });
    this.tweens.wait(0.9, () => this.ui.lose(!this.continued));
  }

  continueWithExtraSlot(): void {
    if (this.state !== 'lost' || this.continued) return;
    this.continued = true;
    const pig = this.pigs.find((p) => p.state === 'belt' && p.traveled >= this.path.length);
    const trayMat = (this.world.getObjectByName('slotTray') as THREE.Mesh).material as THREE.Material;
    this.buildSlots(this.slots.length + 1, trayMat);
    this.slots.forEach((p, j) => p && p.home.set(this.slotX(j), 0.18, this.slotZ));
    this.state = 'playing';
    if (pig) this.finishLoop(pig);
  }

  // ---------------------------------------------------------------- overlay

  private updateCapacity(): void {
    if (!this.level) return;
    const n = this.beltCount();
    const cap = this.level.def.capacity;
    let dots = '';
    for (let i = 0; i < cap; i++) dots += `<i class="${i < n ? 'on' : ''}"></i>`;
    this.capEl.innerHTML = `<span>${n}/${cap}</span><b>${dots}</b>`;
    this.capEl.classList.toggle('full', n >= cap);
  }

  private project(v: THREE.Vector3): { x: number; y: number } {
    const p = TMP.copy(v).project(this.camera);
    const rect = this.overlay.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
  }

  private positionOverlay(): void {
    if (!this.level) return;
    const show = this.state === 'playing';
    this.capEl.style.display = show ? 'flex' : 'none';
    const c = this.project(TMP2.set(0, 0.3, this.dock.z + BELT_W / 2 + 0.55));
    this.capEl.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`;
    if (this.tutorial) {
      const f = this.lanes[0]?.[0];
      if (f) {
        const h = this.project(TMP2.copy(f.view.root.position).add(TMP.set(0.3, 0, 0.4)));
        this.handEl.style.transform = `translate(${h.x}px, ${h.y}px)`;
      }
    }
  }

  private floatText(text: string, at: THREE.Vector3, cls: string): void {
    const p = this.project(at);
    const el = document.createElement('div');
    el.className = 'float-text ' + cls;
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    this.overlay.appendChild(el);
    window.setTimeout(() => el.remove(), 1300);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
