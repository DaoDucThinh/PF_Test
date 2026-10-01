import '@fontsource/lilita-one';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Game } from './game/game';
import { Sfx } from './game/audio';
import { LEVELS } from './game/levels';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd8ff);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xeaf0ff, 0xb9a6e0, 0.5));
const sun = new THREE.DirectionalLight(0xfff4e6, 1.05);
sun.position.set(-7, 20, 9);
sun.target.position.set(0, 0, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0xc9d6ff, 0.3);
rim.position.set(8, 10, -10);
scene.add(rim);

const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 1.35);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sfx = new Sfx();
const overlay = $<HTMLDivElement>('overlay');

interface Progress {
  unlocked: number;
  stars: number[];
  current: number;
}
const progress: Progress = (() => {
  try {
    const p = JSON.parse(localStorage.getItem('pf_progress') ?? '') as Progress;
    if (typeof p.unlocked === 'number') return p;
  } catch {
    /* fresh save */
  }
  return { unlocked: 0, stars: [], current: 0 };
})();
const save = () => localStorage.setItem('pf_progress', JSON.stringify(progress));

let toastTimer = 0;
const game = new Game(scene, camera, sfx, {
  progress(p) {
    const pct = Math.round(p * 100);
    $('progress-fill').style.width = pct + '%';
    $('progress-text').textContent = pct + '%';
  },
  levelStarted(level) {
    $('level-label').textContent = `Level ${level}`;
    fitCamera();
  },
  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 1400);
  },
  win(stars, name, level) {
    $('win-name').textContent = name;
    const els = $('win').querySelectorAll<HTMLElement>('.stars i');
    els.forEach((el, i) => {
      el.classList.remove('on');
      if (i < stars) {
        el.style.animationDelay = 0.35 + i * 0.25 + 's';
        el.classList.add('on');
        window.setTimeout(() => sfx.star(i), 350 + i * 250);
      }
    });
    const idx = level - 1;
    progress.stars[idx] = Math.max(progress.stars[idx] ?? 0, stars);
    progress.unlocked = Math.max(progress.unlocked, level);
    progress.current = level;
    save();
    show('win');
  },
  lose(canContinue) {
    $('btn-continue').style.display = canContinue ? 'block' : 'none';
    show('lose');
  },
}, overlay);

const screens = ['menu', 'win', 'lose'];
function show(id: string | null): void {
  for (const s of screens) $(s).classList.toggle('show', s === id);
  $('hud').classList.toggle('hidden', id === 'menu');
  document.body.classList.toggle('in-menu', id === 'menu');
}

function renderLevelGrid(): void {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const count = Math.max(LEVELS.length, progress.unlocked + 1);
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    const locked = i > progress.unlocked;
    b.className = 'lvl' + (locked ? ' locked' : '') + (i === progress.current ? ' cur' : '');
    const st = progress.stars[i] ?? 0;
    b.innerHTML = locked ? '<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>' : `${i + 1}<span class="st">${'★'.repeat(st)}</span>`;
    if (!locked) b.onclick = () => { sfx.unlock(); sfx.click(); startLevel(i); };
    grid.appendChild(b);
  }
}

function startLevel(i: number): void {
  progress.current = i;
  save();
  game.load(i);
  show(null);
}

function setToggle(id: string, on: boolean): void {
  $(id).classList.toggle('off', !on);
}

$('btn-play').onclick = () => { sfx.unlock(); sfx.click(); startLevel(Math.min(progress.current, progress.unlocked)); };
$('btn-home').onclick = () => { sfx.click(); renderLevelGrid(); show('menu'); };
$('btn-restart').onclick = () => { sfx.click(); startLevel(game.levelIndex); };
$('btn-next').onclick = () => { sfx.click(); startLevel(game.levelIndex + 1); };
$('btn-replay').onclick = () => { sfx.click(); startLevel(game.levelIndex); };
$('btn-retry').onclick = () => { sfx.click(); startLevel(game.levelIndex); };
$('btn-continue').onclick = () => { sfx.click(); show(null); game.continueWithExtraSlot(); };
$('btn-music').onclick = () => { sfx.unlock(); sfx.setMusic(!sfx.musicOn); setToggle('btn-music', sfx.musicOn); };
$('btn-sfx').onclick = () => { sfx.unlock(); sfx.setSfx(!sfx.sfxOn); setToggle('btn-sfx', sfx.sfxOn); sfx.click(); };
setToggle('btn-music', sfx.musicOn);
setToggle('btn-sfx', sfx.sfxOn);

const ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  game.tap(ndc);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') startLevel(game.levelIndex);
});

const camTarget = new THREE.Vector3();
const camDir = new THREE.Vector3(0, 1, 0.52).normalize();
function fitCamera(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 42 : 36;
  camera.updateProjectionMatrix();
  const b = game.bounds;
  if (b.isEmpty()) return;
  const corners: THREE.Vector3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
  b.getCenter(camTarget);
  camTarget.y = 0;
  const topPad = Math.min(0.32, 150 / h);
  const yMax = 1 - topPad * 2;
  const yMin = -0.97;
  let dist = 30;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 5;
    let hi = 120;
    for (let i = 0; i < 30; i++) {
      dist = (lo + hi) / 2;
      camera.position.copy(camTarget).addScaledVector(camDir, dist);
      camera.lookAt(camTarget);
      camera.updateMatrixWorld();
      let ok = true;
      let span = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(camera);
        if (Math.abs(p.x) > 0.96) ok = false;
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      span = maxY - minY;
      if (span > yMax - yMin) ok = false;
      if (ok) hi = dist;
      else lo = dist;
    }
    dist = hi;
    camera.position.copy(camTarget).addScaledVector(camDir, dist);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      const p = c.clone().project(camera);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const want = (yMax + yMin) / 2;
    const have = (maxY + minY) / 2;
    camTarget.z -= (have - want) * dist * 0.35;
  }
  baseCamPos.copy(camera.position);
}
const baseCamPos = new THREE.Vector3();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  bloom.resolution.set(w, h);
  game.sparks.setScale((h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  fitCamera();
  game.sparks.setScale((h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
window.addEventListener('resize', resize);

const timer = new THREE.Timer();
timer.connect(document);
let t = 0;
function frame(): void {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 30);
  t += dt;
  game.update(dt);
  const s = game.shake * game.shake;
  camera.position.copy(baseCamPos).add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s));
  if (document.getElementById('menu')?.classList.contains('show')) {
    camera.position.x += Math.sin(t * 0.4) * 0.6;
  }
  camera.lookAt(camTarget);
  composer.render();
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('600 16px "Fredoka"')]);
  } catch {
    /* fonts optional */
  }
  const start = Math.min(progress.current, progress.unlocked);
  game.load(start);
  resize();
  renderLevelGrid();
  show('menu');
  $('loading').classList.add('done');
  requestAnimationFrame(frame);
}
void boot();

declare global {
  interface Window {
    __game: Game;
  }
}
window.__game = game;
