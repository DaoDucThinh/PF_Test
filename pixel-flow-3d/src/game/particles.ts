import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Chunky cube debris with gravity and floor bounce. */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private next = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  floorY = 0;

  constructor(count = 800) {
    this.n = count;
    const geo = new RoundedBoxGeometry(1, 1, 1, 1, 0.16);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.spin = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size = new Float32Array(count);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
  }

  emit(at: THREE.Vector3, color: THREE.ColorRepresentation, count: number, power = 1, size = 0.18): void {
    _c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3.5) * power;
      this.pos.set([at.x + (Math.random() - 0.5) * 0.2, at.y + Math.random() * 0.2, at.z + (Math.random() - 0.5) * 0.2], i * 3);
      this.vel.set([Math.cos(a) * sp, (3 + Math.random() * 5) * power, Math.sin(a) * sp], i * 3);
      this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.spin.set([(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20], i * 3);
      const life = 0.7 + Math.random() * 0.6;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = size * (0.5 + Math.random() * 0.8);
      const tint = 0.85 + Math.random() * 0.3;
      this.mesh.setColorAt(i, _c.clone().multiplyScalar(tint));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let top = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      top = i + 1;
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] -= 22 * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < this.floorY + this.size[i] * 0.5) {
        this.pos[o + 1] = this.floorY + this.size[i] * 0.5;
        this.vel[o + 1] *= -0.45;
        this.vel[o] *= 0.7;
        this.vel[o + 2] *= 0.7;
      }
      this.rot[o] += this.spin[o] * dt;
      this.rot[o + 1] += this.spin[o + 1] * dt;
      this.rot[o + 2] += this.spin[o + 2] * dt;
      const k = this.life[i] <= 0 ? 0 : Math.min(1, this.life[i] / (this.maxLife[i] * 0.4));
      const s = this.size[i] * k;
      _q.setFromEuler(_e.set(this.rot[o], this.rot[o + 1], this.rot[o + 2]));
      _m.compose(_p.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Additive glowing sparks rendered as soft points. */
export class Sparks {
  readonly points: THREE.Points;
  private n: number;
  private next = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(count = 3000) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.grav = new Float32Array(count);
    const alpha = new Float32Array(count);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float psize;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float core = smoothstep(0.5, 0.0, r);
          float star = max(0.0, 1.0 - abs(d.x * d.y) * 60.0) * smoothstep(0.5, 0.1, r);
          float a = (core * core + star * 0.6) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a * 1.6, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px;
  }

  emit(at: THREE.Vector3, color: THREE.ColorRepresentation, count: number, opts: { speed?: number; size?: number; life?: number; up?: number; gravity?: number; spread?: number } = {}): void {
    _c.set(color);
    const speed = opts.speed ?? 4;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.3 + Math.random() * 0.7);
      const spread = opts.spread ?? 0.05;
      this.pos.set([at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread], i * 3);
      this.vel.set([Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp + (opts.up ?? 1.5), Math.sin(ph) * Math.sin(th) * sp], i * 3);
      const mix = Math.random() * 0.5;
      this.col.set([_c.r + (1 - _c.r) * mix, _c.g + (1 - _c.g) * mix, _c.b + (1 - _c.b) * mix], i * 3);
      const life = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.8);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (opts.size ?? 0.35) * (0.5 + Math.random());
      this.drag[i] = 2.5;
      this.grav[i] = opts.gravity ?? 6;
    }
  }

  update(dt: number): void {
    const alpha = this.geo.getAttribute('alpha') as THREE.BufferAttribute;
    const psize = this.geo.getAttribute('psize') as THREE.BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        alpha.array[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[o] *= dr;
      this.vel[o + 1] = this.vel[o + 1] * dr - this.grav[i] * dt;
      this.vel[o + 2] *= dr;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      alpha.array[i] = Math.min(1, k * 2);
      psize.array[i] = this.size[i] * (0.4 + 0.6 * k);
    }
    alpha.needsUpdate = true;
    psize.needsUpdate = true;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}

/** Fluttering paper confetti for celebrations. */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private next = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private phase: Float32Array;

  constructor(count = 600) {
    this.n = count;
    const geo = new THREE.PlaneGeometry(0.22, 0.12);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.spin = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.phase = new Float32Array(count);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
  }

  burst(at: THREE.Vector3, colors: number[], count: number, power = 1): void {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 6) * power;
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * sp, (8 + Math.random() * 10) * power, Math.sin(a) * sp], i * 3);
      this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.spin.set([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], i * 3);
      this.life[i] = 3 + Math.random() * 1.5;
      this.phase[i] = Math.random() * 10;
      this.mesh.setColorAt(i, _c.set(colors[Math.floor(Math.random() * colors.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, time: number): void {
    let top = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      top = i + 1;
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] = Math.max(-2.2, this.vel[o + 1] - 18 * dt);
      const dr = Math.exp(-1.6 * dt);
      this.vel[o] *= dr;
      this.vel[o + 2] *= dr;
      this.pos[o] += (this.vel[o] + Math.sin(time * 3 + this.phase[i]) * 0.8) * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.rot[o] += this.spin[o] * dt;
      this.rot[o + 1] += this.spin[o + 1] * dt;
      this.rot[o + 2] += this.spin[o + 2] * dt;
      const s = this.life[i] <= 0 ? 0 : Math.min(1, this.life[i] * 2);
      _q.setFromEuler(_e.set(this.rot[o], this.rot[o + 1], this.rot[o + 2]));
      _m.compose(_p.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
