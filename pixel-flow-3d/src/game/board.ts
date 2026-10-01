import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE, type BuiltLevel, type Cell } from './levels';

export type Side = 'bottom' | 'right' | 'top' | 'left';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

interface CubeAnim {
  y: number;
  vy: number;
  scale: number;
  flash: number;
  dying: number;
  dead: boolean;
  spin: number;
}

export class Board {
  readonly group = new THREE.Group();
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  private cells: (Cell | null)[];
  private alive: boolean[];
  private inst: number[];
  private instCell: number[] = [];
  private baseColor: THREE.Color[] = [];
  private anim: CubeAnim[] = [];
  private active = new Set<number>();
  readonly mesh: THREE.InstancedMesh;
  aliveCount = 0;
  visibleCount = 0;

  constructor(level: BuiltLevel, maxSize: number) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.cells = level.cells;
    this.cell = maxSize / Math.max(this.cols, this.rows);
    this.width = this.cols * this.cell;
    this.depth = this.rows * this.cell;
    this.height = this.cell * 0.85;
    this.alive = this.cells.map((c) => c !== null);
    this.inst = this.cells.map(() => -1);
    let n = 0;
    this.cells.forEach((c, i) => {
      if (c) {
        this.inst[i] = n++;
        this.instCell.push(i);
      }
    });
    this.aliveCount = n;
    this.visibleCount = n;

    const s = this.cell * 0.93;
    const geo = new RoundedBoxGeometry(s, this.height, s, 3, this.cell * 0.14);
    geo.translate(0, this.height / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.0, envMapIntensity: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);

    this.cells.forEach((c, i) => {
      if (!c) return;
      const id = this.inst[i];
      const col = new THREE.Color(PALETTE[c.color].hex);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      const jitter = ((c.col * 31 + c.row * 17) % 7) / 7 - 0.5;
      col.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + jitter * 0.04, 0, 1));
      this.baseColor[id] = col;
      this.anim[id] = { y: 0, vy: 0, scale: 1, flash: 0, dying: 0, dead: false, spin: 0 };
      this.mesh.setColorAt(id, col);
      this.writeMatrix(id);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  cellPos(index: number, out = new THREE.Vector3()): THREE.Vector3 {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return out.set((col - (this.cols - 1) / 2) * this.cell, this.height * 0.5, (row - (this.rows - 1) / 2) * this.cell);
  }

  colorOf(index: number): string {
    return (this.cells[index] as Cell).color;
  }

  /** Line index aligned with a world position along a given side, or -1. */
  lineIndex(side: Side, pos: THREE.Vector3): number {
    if (side === 'bottom' || side === 'top') {
      const c = Math.floor((pos.x + this.width / 2) / this.cell);
      return c >= 0 && c < this.cols ? c : -1;
    }
    const r = Math.floor((pos.z + this.depth / 2) / this.cell);
    return r >= 0 && r < this.rows ? r : -1;
  }

  /** First alive cube seen from a side looking inward along a row/column. */
  firstAlive(side: Side, line: number): number {
    const { cols, rows } = this;
    if (side === 'bottom') {
      for (let r = rows - 1; r >= 0; r--) if (this.alive[r * cols + line]) return r * cols + line;
    } else if (side === 'top') {
      for (let r = 0; r < rows; r++) if (this.alive[r * cols + line]) return r * cols + line;
    } else if (side === 'right') {
      for (let c = cols - 1; c >= 0; c--) if (this.alive[line * cols + c]) return line * cols + c;
    } else {
      for (let c = 0; c < cols; c++) if (this.alive[line * cols + c]) return line * cols + c;
    }
    return -1;
  }

  /** Logically remove a cube (it stays visible until the ball lands). */
  claim(index: number): void {
    if (!this.alive[index]) return;
    this.alive[index] = false;
    this.aliveCount--;
  }

  isAlive(index: number): boolean {
    return this.alive[index];
  }

  colorsAlive(): Set<string> {
    const s = new Set<string>();
    this.cells.forEach((c, i) => {
      if (c && this.alive[i]) s.add(c.color);
    });
    return s;
  }

  /** Visual destruction when the ball hits. */
  smash(index: number): void {
    const id = this.inst[index];
    const a = this.anim[id];
    a.dying = 0.0001;
    a.flash = 1;
    this.active.add(id);
    this.visibleCount--;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
        const ni = r * this.cols + c;
        const nid = this.inst[ni];
        if (nid < 0) continue;
        const na = this.anim[nid];
        if (na.dead || na.dying > 0) continue;
        const d = Math.hypot(dr, dc);
        na.vy += (2.6 / d) * this.cell;
        na.flash = Math.max(na.flash, 0.25 / d);
        this.active.add(nid);
      }
    }
  }

  /** Re-assemble the full picture as a victory reveal. */
  reveal(onStep: (i: number) => void): number {
    let maxDelay = 0;
    const cx = (this.cols - 1) / 2;
    const cy = (this.rows - 1) / 2;
    this.instCell.forEach((cellIndex, id) => {
      const col = cellIndex % this.cols;
      const row = Math.floor(cellIndex / this.cols);
      const a = this.anim[id];
      a.dead = false;
      a.dying = 0;
      const delay = (Math.hypot(col - cx, row - cy) / Math.hypot(cx, cy)) * 0.9 + Math.random() * 0.05;
      maxDelay = Math.max(maxDelay, delay);
      a.y = 6 + delay * 10;
      a.vy = 0;
      a.scale = 1;
      a.flash = 1;
      a.spin = -delay;
      this.active.add(id);
      if (id % 6 === 0) window.setTimeout(() => onStep(id / 6), delay * 1000 + 300);
    });
    return maxDelay + 0.7;
  }

  update(dt: number): void {
    const done: number[] = [];
    for (const id of this.active) {
      const a = this.anim[id];
      if (a.spin < 0) {
        a.spin += dt;
        if (a.spin >= 0) a.spin = 0;
        this.writeMatrix(id, true);
        continue;
      }
      if (a.dying > 0) {
        a.dying += dt;
        const t = a.dying / 0.16;
        a.scale = t < 0.35 ? 1 + t * 0.9 : Math.max(0, 1.3 * (1 - (t - 0.35) / 0.65));
        if (t >= 1) {
          a.dead = true;
          a.dying = 0;
          a.scale = 0;
        }
      } else {
        a.vy -= 60 * this.cell * dt;
        a.y += a.vy * dt;
        if (a.y < 0) {
          if (a.vy < -6) a.vy = -a.vy * 0.28;
          else a.vy = 0;
          a.y = 0;
        }
        a.vy *= Math.exp(-6 * dt);
      }
      a.flash = Math.max(0, a.flash - dt * 4);
      this.writeMatrix(id);
      _c.copy(this.baseColor[id]).lerp(WHITE, a.flash * 0.8);
      this.mesh.setColorAt(id, _c);
      if (a.dead || (a.y === 0 && a.vy === 0 && a.flash === 0 && a.dying === 0)) done.push(id);
    }
    for (const id of done) this.active.delete(id);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private writeMatrix(id: number, hidden = false): void {
    const a = this.anim[id];
    const ci = this.instCell[id];
    this.cellPos(ci, _p);
    _p.y = a.y;
    const sc = a.dead || hidden ? 0 : a.scale;
    _s.set(sc, sc * (1 + Math.min(0.25, Math.abs(a.vy) * 0.01)), sc);
    _q.identity();
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(id, _m);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
