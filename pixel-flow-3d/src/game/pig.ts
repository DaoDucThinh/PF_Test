import * as THREE from 'three';
import { PALETTE } from './levels';

interface SharedGeo {
  body: THREE.SphereGeometry;
  snout: THREE.CylinderGeometry;
  nostril: THREE.SphereGeometry;
  eye: THREE.SphereGeometry;
  pupil: THREE.SphereGeometry;
  shine: THREE.SphereGeometry;
  ear: THREE.ConeGeometry;
  leg: THREE.CylinderGeometry;
  tail: THREE.TorusGeometry;
  cheek: THREE.SphereGeometry;
  hit: THREE.SphereGeometry;
  shadow: THREE.CircleGeometry;
}

let geo: SharedGeo | null = null;
function shared(): SharedGeo {
  if (!geo) {
    geo = {
      body: new THREE.SphereGeometry(0.5, 40, 28),
      snout: new THREE.CylinderGeometry(0.19, 0.21, 0.16, 32),
      nostril: new THREE.SphereGeometry(0.045, 12, 8),
      eye: new THREE.SphereGeometry(0.105, 20, 14),
      pupil: new THREE.SphereGeometry(0.068, 16, 12),
      shine: new THREE.SphereGeometry(0.024, 8, 6),
      ear: new THREE.ConeGeometry(0.13, 0.24, 20),
      leg: new THREE.CylinderGeometry(0.09, 0.1, 0.2, 14),
      tail: new THREE.TorusGeometry(0.07, 0.026, 8, 20, Math.PI * 1.6),
      cheek: new THREE.SphereGeometry(0.08, 14, 10),
      hit: new THREE.SphereGeometry(0.75, 8, 6),
      shadow: new THREE.CircleGeometry(0.5, 24),
    };
  }
  return geo;
}

const matCache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

function toyMat(hex: number, rough = 0.42): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: hex, roughness: rough, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) });
}

const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(20,20,60,0.55)');
  grd.addColorStop(1, 'rgba(20,20,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export function darker(hex: number, k: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, -k);
  return '#' + c.getHexString();
}

export class PigView {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly label: THREE.Sprite;
  readonly color: string;
  readonly hex: number;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private eyes: THREE.Group[] = [];
  private blinkT = Math.random() * 4;
  readonly shadow: THREE.Mesh;

  constructor(color: string) {
    const g = shared();
    this.color = color;
    this.hex = PALETTE[color].hex;
    const base = new THREE.Color(this.hex);
    const isDark = color === 'K';
    const isWhite = color === 'W';
    const snoutHex = isWhite ? 0xffb3cf : base.clone().lerp(new THREE.Color(0xffffff), 0.38).getHex();
    const legHex = base.clone().offsetHSL(0, 0, -0.12).getHex();

    const bodyMat = mat('body' + color, () => toyMat(this.hex));
    const snoutMat = mat('snout' + color, () => toyMat(snoutHex, 0.5));
    const legMat = mat('leg' + color, () => toyMat(legHex, 0.5));
    const darkMat = mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x1b1530, roughness: 0.25 }));
    const whiteMat = mat('white', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
    const shineMat = mat('shine', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const cheekMat = mat('cheek', () => new THREE.MeshStandardMaterial({ color: 0xff6fa3, roughness: 0.6, transparent: true, opacity: 0.55 }));
    const nostrilMat = mat('nostril' + color, () => new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0.1, -0.3), roughness: 0.6 }));

    this.root.add(this.body);

    const shadow = new THREE.Mesh(g.shadow, mat('shadow', () => new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.setScalar(1.15);
    this.shadow = shadow;
    this.root.add(shadow);

    const torso = new THREE.Mesh(g.body, bodyMat);
    torso.scale.set(1, 0.9, 1.02);
    torso.position.y = 0.52;
    torso.castShadow = true;
    this.body.add(torso);

    const snout = new THREE.Mesh(g.snout, snoutMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.46, 0.47);
    snout.castShadow = true;
    this.body.add(snout);
    for (const sx of [-0.075, 0.075]) {
      const n = new THREE.Mesh(g.nostril, nostrilMat);
      n.scale.set(0.8, 1.2, 0.4);
      n.position.set(sx, 0.46, 0.555);
      this.body.add(n);
    }

    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.18, 0.67, 0.38);
      const white = new THREE.Mesh(g.eye, whiteMat);
      white.scale.set(1, 1.1, 0.7);
      const pupil = new THREE.Mesh(g.pupil, darkMat);
      pupil.position.set(sx * -0.008, -0.005, 0.05);
      pupil.scale.set(1, 1.15, 0.7);
      const shine = new THREE.Mesh(g.shine, shineMat);
      shine.position.set(sx * -0.02 + 0.02, 0.035, 0.1);
      eye.add(white, pupil, shine);
      this.body.add(eye);
      this.eyes.push(eye);

      const ear = new THREE.Mesh(g.ear, isDark ? snoutMat : bodyMat);
      ear.position.set(sx * 0.27, 0.92, 0.06);
      ear.rotation.set(0.35, 0, -sx * 0.55);
      ear.castShadow = true;
      this.body.add(ear);

      const cheek = new THREE.Mesh(g.cheek, cheekMat);
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.set(sx * 0.31, 0.5, 0.37);
      cheek.rotation.y = sx * 0.6;
      this.body.add(cheek);

      for (const sz of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(g.leg, legMat);
        leg.position.set(sx * 0.22, 0.1, sz);
        leg.castShadow = true;
        this.body.add(leg);
      }
    }
    const tail = new THREE.Mesh(g.tail, snoutMat);
    tail.position.set(0, 0.55, -0.5);
    tail.rotation.y = Math.PI / 2;
    this.body.add(tail);

    this.hit = new THREE.Mesh(g.hit, new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.5;
    this.root.add(this.hit);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 112;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const sm = new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, transparent: true });
    this.label = new THREE.Sprite(sm);
    this.label.scale.set(0.82, 0.574, 1);
    this.label.position.y = 1.32;
    this.label.renderOrder = 30;
    this.root.add(this.label);
  }

  setAmmo(n: number): void {
    const c = this.canvas;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, c.width, c.height);
    const w = c.width;
    const h = c.height;
    const r = 40;
    const rr = (x: number, y: number, ww: number, hh: number, rad: number) => {
      g.beginPath();
      g.roundRect(x, y, ww, hh, rad);
    };
    g.fillStyle = 'rgba(30,20,70,0.35)';
    rr(10, 16, w - 20, h - 22, r);
    g.fill();
    g.fillStyle = darker(this.hex, 0.2);
    rr(8, 6, w - 16, h - 22, r);
    g.fill();
    g.fillStyle = '#ffffff';
    rr(16, 13, w - 32, h - 36, r - 8);
    g.fill();
    g.font = '64px "Lilita One", "Fredoka", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#2a2350';
    g.fillText(String(n), w / 2, h / 2 - 4);
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.blinkT -= dt;
    let k = 1;
    if (this.blinkT < 0.12) k = Math.max(0.1, Math.abs(this.blinkT - 0.06) / 0.06);
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = k;
  }

  dispose(): void {
    this.tex.dispose();
    (this.label.material as THREE.SpriteMaterial).dispose();
    (this.hit.material as THREE.Material).dispose();
  }
}
