import * as THREE from 'three';
import type { Side } from './board';

export interface PathSample {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  side: Side | null;
}

/** Rounded-rectangle loop starting at bottom-centre and travelling counter-clockwise (as seen on screen). */
export class LoopPath {
  readonly hx: number;
  readonly hz: number;
  readonly r: number;
  readonly length: number;
  private segs: { len: number; kind: 'line' | 'arc'; side: Side | null; a?: THREE.Vector2; b?: THREE.Vector2; c?: THREE.Vector2; a0?: number; a1?: number }[] = [];

  constructor(hx: number, hz: number, r: number) {
    this.hx = hx;
    this.hz = hz;
    this.r = r;
    const V = (x: number, z: number) => new THREE.Vector2(x, z);
    const line = (a: THREE.Vector2, b: THREE.Vector2, side: Side) => this.segs.push({ kind: 'line', a, b, side, len: a.distanceTo(b) });
    const arc = (c: THREE.Vector2, a0: number, a1: number) => this.segs.push({ kind: 'arc', c, a0, a1, side: null, len: Math.abs(a1 - a0) * r });
    line(V(0, hz), V(hx - r, hz), 'bottom');
    arc(V(hx - r, hz - r), Math.PI / 2, 0);
    line(V(hx, hz - r), V(hx, -hz + r), 'right');
    arc(V(hx - r, -hz + r), 0, -Math.PI / 2);
    line(V(hx - r, -hz), V(-hx + r, -hz), 'top');
    arc(V(-hx + r, -hz + r), -Math.PI / 2, -Math.PI);
    line(V(-hx, -hz + r), V(-hx, hz - r), 'left');
    arc(V(-hx + r, hz - r), -Math.PI, -Math.PI * 1.5);
    line(V(-hx + r, hz), V(0, hz), 'bottom');
    this.length = this.segs.reduce((s, g) => s + g.len, 0);
  }

  sample(s: number, out: PathSample = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: null }): PathSample {
    s = ((s % this.length) + this.length) % this.length;
    for (const g of this.segs) {
      if (s <= g.len) {
        const t = g.len > 0 ? s / g.len : 0;
        if (g.kind === 'line') {
          const a = g.a as THREE.Vector2;
          const b = g.b as THREE.Vector2;
          out.pos.set(a.x + (b.x - a.x) * t, 0, a.y + (b.y - a.y) * t);
          out.tan.set(b.x - a.x, 0, b.y - a.y).normalize();
        } else {
          const c = g.c as THREE.Vector2;
          const ang = (g.a0 as number) + ((g.a1 as number) - (g.a0 as number)) * t;
          out.pos.set(c.x + Math.cos(ang) * this.r, 0, c.y + Math.sin(ang) * this.r);
          const dir = Math.sign((g.a1 as number) - (g.a0 as number));
          out.tan.set(-Math.sin(ang) * dir, 0, Math.cos(ang) * dir);
        }
        out.side = g.side;
        return out;
      }
      s -= g.len;
    }
    return out;
  }
}

class OffsetCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private path: LoopPath, private offset: number, private y: number) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const s = this.path.sample(t * this.path.length);
    return target.set(s.pos.x - s.tan.z * this.offset, this.y, s.pos.z + s.tan.x * this.offset);
  }
}

function roundedRect(shape: THREE.Shape | THREE.Path, x0: number, z0: number, x1: number, z1: number, r: number): void {
  shape.moveTo(x0 + r, z0);
  shape.lineTo(x1 - r, z0);
  shape.quadraticCurveTo(x1, z0, x1, z0 + r);
  shape.lineTo(x1, z1 - r);
  shape.quadraticCurveTo(x1, z1, x1 - r, z1);
  shape.lineTo(x0 + r, z1);
  shape.quadraticCurveTo(x0, z1, x0, z1 - r);
  shape.lineTo(x0, z0 + r);
  shape.quadraticCurveTo(x0, z0, x0 + r, z0);
}

export function slab(x0: number, z0: number, x1: number, z1: number, r: number, depth: number, material: THREE.Material, hole?: [number, number, number, number, number]): THREE.Mesh {
  const shape = new THREE.Shape();
  roundedRect(shape, x0, -z1, x1, -z0, r);
  if (hole) {
    const h = new THREE.Path();
    roundedRect(h, hole[0], -hole[3], hole[2], -hole[1], hole[4]);
    shape.holes.push(h);
  }
  const bevel = Math.min(0.12, depth * 0.4);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 16 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Conveyor {
  readonly group = new THREE.Group();
  readonly path: LoopPath;
  readonly width: number;
  readonly surfaceY = 0.32;
  private beltTex: THREE.CanvasTexture;
  private tile = 0.9;

  constructor(path: LoopPath, width: number, accent: number) {
    this.path = path;
    this.width = width;
    const { hx, hz, r } = path;
    const w = width;

    const frameMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.5 });
    const frame = slab(-hx - w / 2 - 0.35, -hz - w / 2 - 0.35, hx + w / 2 + 0.35, hz + w / 2 + 0.35, r + w / 2 + 0.35, 0.26, frameMat, [-hx + w / 2 + 0.3, -hz + w / 2 + 0.3, hx - w / 2 - 0.3, hz - w / 2 - 0.3, Math.max(0.1, r - w / 2 - 0.3)]);
    this.group.add(frame);

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const accentCol = new THREE.Color(accent);
    const dark = accentCol.clone().lerp(new THREE.Color(0x1d1b3a), 0.72);
    g.fillStyle = '#' + dark.getHexString();
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 118, 128, 10);
    g.strokeStyle = '#' + accentCol.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString();
    g.globalAlpha = 0.55;
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(40, 30);
    g.lineTo(80, 64);
    g.lineTo(40, 98);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(124, 0, 4, 128);
    this.beltTex = new THREE.CanvasTexture(c);
    this.beltTex.colorSpace = THREE.SRGBColorSpace;
    this.beltTex.wrapS = THREE.RepeatWrapping;
    this.beltTex.wrapT = THREE.ClampToEdgeWrapping;
    this.beltTex.anisotropy = 8;

    const N = 600;
    const posArr: number[] = [];
    const uvArr: number[] = [];
    const idx: number[] = [];
    const L = path.length;
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * L;
      const p = path.sample(s);
      const nx = -p.tan.z;
      const nz = p.tan.x;
      posArr.push(p.pos.x - nx * w / 2, this.surfaceY, p.pos.z - nz * w / 2);
      posArr.push(p.pos.x + nx * w / 2, this.surfaceY, p.pos.z + nz * w / 2);
      uvArr.push(s / this.tile, 0, s / this.tile, 1);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    beltGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    beltGeo.setIndex(idx);
    beltGeo.computeVertexNormals();
    const belt = new THREE.Mesh(beltGeo, new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.7, side: THREE.DoubleSide }));
    belt.receiveShadow = true;
    this.group.add(belt);

    const railMat = new THREE.MeshPhysicalMaterial({ color: accentCol.clone().lerp(new THREE.Color(0xffffff), 0.15), roughness: 0.25, clearcoat: 1, metalness: 0.1 });
    for (const off of [-w / 2 - 0.06, w / 2 + 0.06]) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new OffsetCurve(path, off, this.surfaceY + 0.06), 500, 0.1, 10, true), railMat);
      tube.castShadow = true;
      this.group.add(tube);
    }
  }

  update(dt: number, speed: number): void {
    this.beltTex.offset.x -= (speed * dt) / this.tile;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
