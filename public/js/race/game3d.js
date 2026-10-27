// 퀴즈 카트 레이스 3D (three.js r170)
// - 학생: 내 카트 운전(아케이드 물리) + 다른 카트 보간 + 아이템 효과 + 미니맵 + 이름표
// - 교사: mode:'spectate' 로 선두를 따라가는 중계 카메라
// GLB 모델(public/assets/models/*.glb)이 없거나 못 읽어도 간단한 도형으로 대신 그린다.
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { buildTrack, HALF, WALL, wrapDelta } from './tracks.js';
import { sound } from '../common.js';

// ---------- 상수 ----------
export const FX = { BOOST: 1, SHIELD: 2, STAR: 4, SPIN: 8, DRIFT: 16, DRIFT2: 32, QUIZ: 64, INK: 128, DONE: 256 };
const MAX = 21, OFF_MAX = 10, BOOST_MAX = 31, STAR_MAX = 27, ACC = 13, BRAKE = 30, REV = 7;
const FULL_KARTS = 10, LABELS = 14, KART_R = 0.95;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAng = (a, b, t) => a + angDiff(b, a) * t;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- 모델 불러오기 ----------
const MODEL_FILES = ['kart', 'driver', 'itembox', 'gate', 'finish', 'banana', 'cone', 'tree_round', 'tree_pine', 'rock', 'cloud'];
let modelsPromise = null;
export function loadModels() {
  if (modelsPromise) return modelsPromise;
  const base = new URL('../../assets/models/', import.meta.url).href;
  const loader = new GLTFLoader();
  modelsPromise = Promise.all(MODEL_FILES.map(name => new Promise(res => {
    const timer = setTimeout(() => res([name, null]), 12000);
    try {
      loader.load(base + name + '.glb', g => { clearTimeout(timer); res([name, g.scene || g.scenes?.[0] || null]); },
        undefined, () => { clearTimeout(timer); res([name, null]); });
    } catch { clearTimeout(timer); res([name, null]); }
  }))).then(Object.fromEntries);
  return modelsPromise;
}

// Object3D → [{geometry, material}] (루트 기준 좌표로 굽기). fit: {h|w|l: 목표 크기, ground: 바닥을 y=0에}
function partsOf(root, fit = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push({ geometry: g, material: o.material });
  });
  if (fit && parts.length) {
    const box = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
    const size = box.getSize(new THREE.Vector3());
    const s = fit.h ? fit.h / (size.y || 1) : fit.w ? fit.w / (Math.max(size.x, size.z) || 1) : 1;
    const c = box.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, fit.ground ? -box.min.y : -c.y, -c.z));
    for (const p of parts) p.geometry.applyMatrix4(m);
  }
  return parts;
}
// 같은 재질끼리 합치기 (그리기 횟수 줄이기)
function mergeParts(list) {
  const by = new Map();
  for (const p of list) { const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!by.has(p.material)) by.set(p.material, []); by.get(p.material).push(g); }
  return [...by].map(([material, gs]) => ({ geometry: gs.length > 1 ? (mergeGeometries(gs) || gs[0]) : gs[0], material }));
}

const ni = g => (g.index ? g.toNonIndexed() : g);
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const geo = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return g;
};

// ---------- 대신 쓸 도형 ----------
function fallbackKart() {
  const paint = lam(0xff5fa2); paint.name = 'Paint';
  const dark = lam(0x2b2d42), light = lam(0xf1f2f6);
  const g = new THREE.Group(); g.name = 'Kart';
  const P = [
    { geometry: geo(new THREE.BoxGeometry(1.25, 0.32, 1.85), 0, 0.42, 0), material: paint },
    { geometry: geo(new THREE.BoxGeometry(0.95, 0.24, 0.6), 0, 0.4, 1.12), material: paint },
    { geometry: geo(new THREE.BoxGeometry(0.32, 0.26, 1.05), 0.74, 0.38, -0.05), material: paint },
    { geometry: geo(new THREE.BoxGeometry(0.32, 0.26, 1.05), -0.74, 0.38, -0.05), material: paint },
    { geometry: geo(new THREE.BoxGeometry(1.36, 0.16, 0.22), 0, 0.26, 1.42), material: dark },
    { geometry: geo(new THREE.BoxGeometry(1.4, 0.08, 0.38), 0, 0.9, -1.0), material: paint },
    { geometry: geo(new THREE.BoxGeometry(0.08, 0.36, 0.1), 0.42, 0.7, -1.0), material: dark },
    { geometry: geo(new THREE.BoxGeometry(0.08, 0.36, 0.1), -0.42, 0.7, -1.0), material: dark },
    { geometry: geo(new THREE.BoxGeometry(0.72, 0.42, 0.14), 0, 0.72, -0.5), material: dark },
    { geometry: geo(new THREE.TorusGeometry(0.17, 0.035, 6, 14), 0, 0.82, 0.3, -0.6), material: dark },
    { geometry: geo(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), 0.3, 0.42, -1.05, Math.PI / 2), material: light },
    { geometry: geo(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), -0.3, 0.42, -1.05, Math.PI / 2), material: light },
  ];
  for (const p of mergeParts(P)) g.add(new THREE.Mesh(p.geometry, p.material));
  const wg = mergeGeometries([geo(new THREE.CylinderGeometry(0.33, 0.33, 0.3, 14), 0, 0, 0, 0, 0, Math.PI / 2).toNonIndexed(),
    geo(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 8), 0, 0, 0, 0, 0, Math.PI / 2).toNonIndexed()], true);
  const wm = [dark, light];
  for (const [n, x, z] of [['Wheel_FL', 0.72, 0.72], ['Wheel_FR', -0.72, 0.72], ['Wheel_RL', 0.74, -0.72], ['Wheel_RR', -0.74, -0.72]]) {
    const w = new THREE.Mesh(wg, wm); w.name = n; w.position.set(x, 0.33, z); g.add(w);
  }
  const seat = new THREE.Object3D(); seat.name = 'Seat'; seat.position.set(0, 0.52, -0.22); g.add(seat);
  return g;
}
function fallbackDriver() {
  const suit = lam(0xffffff); suit.name = 'Suit';
  const helmet = lam(0xffffff); helmet.name = 'Helmet';
  const g = new THREE.Group(); g.name = 'Driver';
  g.add(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 10), 0, 0.25, 0), suit));
  g.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.3, 14, 10), 0, 0.78, 0.02), helmet));
  g.add(new THREE.Mesh(geo(new THREE.BoxGeometry(0.4, 0.15, 0.14), 0, 0.8, 0.26), lam(0x2b2d42)));
  return g;
}
// 장식 모양 (이름 → parts). 테마 색에 맞춘다.
function fallbackDecor(kind, th) {
  const T = (c) => lam(c, { flatShading: true });
  const mk = list => mergeParts(list.map(([g, m]) => ({ geometry: g, material: m })));
  switch (kind) {
    case 'tree_round': return mk([[geo(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 7), 0, 1.2, 0), T(0x9a6a44)], [geo(new THREE.IcosahedronGeometry(2.3, 1), 0, 3.9, 0), T(0x55c96a)]]);
    case 'tree_pine': return mk([[geo(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 6), 0, 0.9, 0), T(0x8a5a3a)],
      [geo(new THREE.ConeGeometry(2.2, 3.4, 8), 0, 3.0, 0), T(th.id === 'snow' ? 0x2f9e6e : 0x2fb36a)], [geo(new THREE.ConeGeometry(1.6, 2.6, 8), 0, 4.8, 0), T(th.id === 'snow' ? 0xf4f8ff : 0x3cc77a)]]);
    case 'rock': return mk([[geo(new THREE.DodecahedronGeometry(1.1, 0), 0, 0.7, 0, 0.3, 0.5, 0, 1.2, 0.8, 1), T(th.id === 'space' ? 0x6a5fb0 : th.id === 'desert' ? 0xc98a5a : 0xa4a9be)]]);
    case 'cone': return mk([[geo(new THREE.ConeGeometry(0.32, 0.8, 10), 0, 0.45, 0), T(0xff8a3d)], [geo(new THREE.BoxGeometry(0.7, 0.08, 0.7), 0, 0.04, 0), T(0xff8a3d)], [geo(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 10), 0, 0.5, 0), T(0xffffff)]]);
    case 'flower': return mk([[geo(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 4), 0, 0.3, 0), T(0x3fae5a)], [geo(new THREE.IcosahedronGeometry(0.3, 0), 0, 0.68, 0), T(0xffffff)]]);
    case 'cactus': return mk([[geo(new THREE.CylinderGeometry(0.45, 0.5, 3.6, 8), 0, 1.8, 0), T(0x3fae6a)], [geo(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 7), 0.75, 2.2, 0, 0, 0, 0.0), T(0x3fae6a)],
      [geo(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 7), 0.45, 1.6, 0, 0, 0, Math.PI / 2), T(0x3fae6a)], [geo(new THREE.CylinderGeometry(0.25, 0.25, 1.0, 7), -0.7, 2.6, 0), T(0x3fae6a)],
      [geo(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 7), -0.42, 2.1, 0, 0, 0, Math.PI / 2), T(0x3fae6a)], [geo(new THREE.SphereGeometry(0.22, 6, 5), 0, 3.7, 0), T(0xff6fa8)]]);
    case 'mesa': return mk([[geo(new THREE.CylinderGeometry(7, 9, 9, 7), 0, 4.5, 0), T(0xd98a4e)], [geo(new THREE.CylinderGeometry(7.1, 7.1, 1.2, 7), 0, 7.4, 0), T(0xb8693a)]]);
    case 'snowman': return mk([[geo(new THREE.SphereGeometry(1, 12, 9), 0, 0.9, 0), T(0xffffff)], [geo(new THREE.SphereGeometry(0.68, 12, 9), 0, 2.3, 0), T(0xffffff)],
      [geo(new THREE.ConeGeometry(0.12, 0.6, 6), 0, 2.35, 0.75, Math.PI / 2), T(0xff8a3d)], [geo(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), 0, 3.05, 0), T(0x3b3f6b)]]);
    case 'house': return mk([[geo(new THREE.BoxGeometry(4, 3, 4), 0, 1.5, 0), T(0xfff3e0)], [geo(new THREE.ConeGeometry(3.4, 2.4, 4), 0, 4.2, 0, 0, Math.PI / 4), T(0xff6b81)],
      [geo(new THREE.BoxGeometry(0.9, 1.6, 0.1), 0, 0.8, 2.02), T(0x9a6a44)], [geo(new THREE.BoxGeometry(4.2, 0.3, 4.2), 0, 3.05, 0), T(0xffffff)]]);
    case 'crystal': return mk([[geo(new THREE.OctahedronGeometry(1.2, 0), 0, 1.8, 0, 0, 0, 0, 0.8, 2, 0.8), lam(0x7ff5ff, { emissive: 0x3a7fff, emissiveIntensity: 0.6, flatShading: true })],
      [geo(new THREE.OctahedronGeometry(0.7, 0), 1.0, 1.0, 0.3, 0, 0, 0.4, 0.8, 1.6, 0.8), lam(0xff9be0, { emissive: 0xc0389a, emissiveIntensity: 0.6, flatShading: true })]]);
    case 'planet': return mk([[geo(new THREE.IcosahedronGeometry(10, 2), 0, 0, 0), T(0xffb36b)], [geo(new THREE.TorusGeometry(15, 1.3, 4, 32), 0, 0, 0, 1.2, 0, 0.3), T(0xffe08a)]]);
    case 'palm': {
      const leaf = []; for (let i = 0; i < 6; i++) leaf.push([geo(new THREE.ConeGeometry(0.5, 3.2, 4), Math.sin(i) * 1.3, 5.6, Math.cos(i) * 1.3, Math.cos(i) * 1.1, 0, -Math.sin(i) * 1.1, 1, 1, 0.25), T(0x3cc77a)]);
      return mk([[geo(new THREE.CylinderGeometry(0.25, 0.4, 5.8, 7), 0.4, 2.9, 0, 0, 0, -0.14), T(0xc58b4f)], ...leaf, [geo(new THREE.SphereGeometry(0.3, 6, 5), 0.7, 5.4, 0.2), T(0x7a4a2a)]]);
    }
    case 'umbrella': return mk([[geo(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), 0, 1.3, 0), T(0xffffff)], [geo(new THREE.ConeGeometry(1.8, 0.9, 8), 0, 2.6, 0), T(0xff5fa2)],
      [geo(new THREE.BoxGeometry(1.6, 0.06, 0.8), 1.4, 0.03, 0), T(0x3fc3f0)]]);
    case 'cloud': return mk([[mergeGeometries([ni(geo(new THREE.IcosahedronGeometry(3, 1), 0, 0, 0)), ni(geo(new THREE.IcosahedronGeometry(2.3, 1), 3, -0.5, 0.5)), ni(geo(new THREE.IcosahedronGeometry(2.1, 1), -3, -0.6, -0.3))]), lam(0xffffff, { flatShading: true })]]);
    case 'mountain': return mk([[geo(new THREE.ConeGeometry(1, 1, 7), 0, 0.5, 0), lam(0xffffff, { flatShading: true, fog: false })]]);
  }
  return mk([[new THREE.BoxGeometry(1, 1, 1), T(0xcccccc)]]);
}
const DECOR_FIT = { tree_round: { h: 6.5, ground: 1 }, tree_pine: { h: 7, ground: 1 }, rock: { h: 1.6, ground: 1 }, cone: { h: 0.8, ground: 1 }, cloud: { w: 10 }, banana: { h: 0.55, ground: 1 }, itembox: { w: 1.3 } };

// ---------- 텍스처 ----------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4; return t;
}
function textSprite(text, px = 128, scale = 3) {
  const t = canvasTex(px, px, (x, w, h) => { x.font = `${px * 0.78}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + px * 0.05); }, false);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(scale, scale, 1);
  return s;
}

// ---------- 인스턴스 묶음 ----------
class Inst {
  constructor(scene, parts, count, opts = {}) {
    this.meshes = parts.map(p => { const m = new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, count)); m.count = 0; m.frustumCulled = !opts.dynamic; if (opts.color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3).fill(1), 3); scene.add(m); return m; });
    this.cap = count; this.n = 0; this.colorPart = opts.colorPart ?? -1;
  }
  set(i, matrix) { for (const m of this.meshes) m.setMatrixAt(i, matrix); }
  color(i, c) { this.meshes.forEach((m, j) => { if (m.instanceColor && (this.colorPart < 0 || this.colorPart === j)) m.setColorAt(i, c); }); }
  done(n = this.n, bounds = false) { for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; if (bounds) m.computeBoundingSphere(); } }
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
const compose = (x, y, z, ry, s = 1, rx = 0, rz = 0) => M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(s, s, s));
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------- 카트 모습 (내 카트·가까운 카트) ----------
class KartView {
  constructor(models, color, scene) {
    const kartSrc = models.kart, drvSrc = models.driver;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body); // 기울기·회전(스핀) 용
    let kart = kartSrc ? kartSrc.clone(true) : fallbackKart();
    if (kartSrc) { // 길이 2.2로 맞추기
      const b = new THREE.Box3().setFromObject(kart), len = b.max.z - b.min.z;
      if (len > 0.3 && Math.abs(len - 2.2) > 0.4) kart.scale.multiplyScalar(2.2 / len);
    }
    this.body.add(kart);
    this.paints = []; this.wheels = [];
    const col = new THREE.Color(color), helmet = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.65);
    const tint = (o, name, c) => {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map(m => { if (m?.name?.startsWith(name)) { const n = m.clone(); n.color?.copy(c); if (name === 'Paint') this.paints.push(n); return n; } return m; });
      o.material = Array.isArray(o.material) ? out : out[0];
    };
    kart.traverse(o => {
      if (o.isMesh) tint(o, 'Paint', col);
      if (/^Wheel_(FL|FR|RL|RR)$/.test(o.name)) this.wheels.push({ o, q0: o.quaternion.clone(), front: /^Wheel_F/.test(o.name), a: 0 });
    });
    const seat = kart.getObjectByName('Seat') || kart;
    const drv = drvSrc ? drvSrc.clone(true) : fallbackDriver();
    drv.traverse(o => { if (o.isMesh) { tint(o, 'Suit', col); tint(o, 'Helmet', helmet); } });
    seat.add(drv);
    if (seat === kart) drv.position.set(0, 0.5, -0.2);
    // 효과: 부스터 불꽃, 방패
    this.flame = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa531, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const fm2 = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const x of [0.32, -0.32]) {
      const c1 = new THREE.Mesh(geo(new THREE.ConeGeometry(0.22, 1.2, 8), 0, 0, -0.6, -Math.PI / 2), fm); c1.position.set(x, 0.42, -1.1);
      const c2 = new THREE.Mesh(geo(new THREE.ConeGeometry(0.12, 0.7, 8), 0, 0, -0.35, -Math.PI / 2), fm2); c2.position.set(x, 0.42, -1.1);
      this.flame.add(c1, c2);
    }
    this.flame.visible = false; this.body.add(this.flame);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shield.position.y = 0.7; this.shield.visible = false; this.root.add(this.shield);
    this.color = col; this.spinA = 0; this.tilt = 0;
    scene.add(this.root);
  }
  update(dt, t, s, steer, fx, driftDir = 0) {
    for (const w of this.wheels) {
      w.a += s * dt / (w.front ? 0.26 : 0.3);
      Q.setFromAxisAngle(V.set(1, 0, 0), w.a);
      if (w.front) Q.premultiply(new THREE.Quaternion().setFromAxisAngle(V.set(0, 1, 0), -steer * 0.45));
      w.o.quaternion.copy(Q).multiply(w.q0);
    }
    const boost = fx & FX.BOOST;
    this.flame.visible = !!boost;
    if (boost) { const f = 0.8 + Math.random() * 0.5; this.flame.scale.set(1, 1, f); }
    this.shield.visible = !!(fx & FX.SHIELD);
    if (this.shield.visible) this.shield.material.opacity = 0.22 + Math.sin(t * 6) * 0.08;
    if (fx & FX.STAR) { C.setHSL((t * 1.5) % 1, 0.9, 0.6); for (const p of this.paints) p.color.copy(C); }
    else if (this._star) for (const p of this.paints) p.color.copy(this.color);
    this._star = !!(fx & FX.STAR);
    if (fx & FX.SPIN) this.spinA += dt * 14; else this.spinA = this.spinA % TAU > 0.05 ? this.spinA + Math.min(dt * 14, TAU - this.spinA % TAU) : 0;
    const wantTilt = (fx & FX.DRIFT) ? driftDir * 0.35 : 0;
    this.tilt += (wantTilt - this.tilt) * Math.min(1, dt * 8);
    this.body.rotation.set(0, this.spinA + this.tilt, -steer * 0.05 * Math.min(1, Math.abs(s) / 10));
    this.body.position.y = (fx & FX.STAR) ? Math.abs(Math.sin(t * 12)) * 0.15 : 0;
  }
  dispose(scene) { scene.remove(this.root); }
}

// ---------- 본체 ----------
// opts: { track, laps, gates, boxes, items, mode:'player'|'spectate', me:{k,color,face,name}, players:[{k,name,color,face}],
//         on:{gate(i), gateMiss(i), box(), lap(n), finishLine(n), bananaHit(id), wrongWay(on), go()}, quality:'auto'|'low'|'high' }
export async function createRace(el, opts) {
  const models = await loadModels();
  const g = new RaceGame(el, opts, models);
  globalThis.__lastRace = g; // 시험장(dev)에서 살펴보기용
  return g;
}

class RaceGame {
  constructor(el, opts, models) {
    this.el = el; this.opts = opts; this.models = models; this.on = opts.on || {};
    this.spectate = opts.mode === 'spectate';
    this.tr = buildTrack(opts.track | 0); this.th = { ...this.tr.theme, id: this.tr.id };
    this.laps = opts.laps || 3;
    this.gateProgs = this.tr.gates(opts.gates ?? 3);
    this.boxRows = opts.boxes === false ? [] : this.tr.boxes(opts.gates ?? 3);
    this.input = { throttle: 0, steer: 0, drift: false };
    this.remotes = new Map(); this.players = new Map();
    this.bananas = new Map();
    this.goAt = Infinity; this.started = false; this.time = 0; this.dead = false;
    this.low = opts.quality === 'low' || (opts.quality !== 'high' && ((navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(pointer: coarse)').matches));
    this.followK = null; this.followSwitch = 0;

    this.dom = document.createElement('div'); this.dom.className = 'rc-root';
    this.dom.innerHTML = `<div class="rc-tags"></div><canvas class="rc-mini"></canvas><div class="rc-count"></div><div class="rc-ink"></div><div class="rc-msg"></div><div class="rc-speed"></div>`;
    el.append(this.dom);
    this.tagsEl = this.dom.querySelector('.rc-tags'); this.mini = this.dom.querySelector('.rc-mini'); this.countEl = this.dom.querySelector('.rc-count');
    this.inkEl = this.dom.querySelector('.rc-ink'); this.msgEl = this.dom.querySelector('.rc-msg');

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance' });
    } catch (e) {
      this.dom.insertAdjacentHTML('beforeend', '<div class="rc-nogl">이 기기에서는 3D 화면을 열 수 없어요 😢<br><small>크롬 브라우저를 최신으로 바꾸거나 다른 기기로 해 보세요.</small></div>');
      this.failed = true; return;
    }
    this.maxPR = Math.min(window.devicePixelRatio || 1, this.low ? 1 : 1.5);
    this.pr = this.maxPR;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.domElement.className = 'rc-gl';
    this.dom.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 1600);
    this.buildWorld();
    this.makeKarts();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
    this.fpsT = 0; this.fpsN = 0; this.lowCount = 0;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ===== 세계 만들기 =====
  buildWorld() {
    const { scene, tr, th } = this;
    const s = tr.samples, n = s.length;
    // 하늘·안개·빛
    scene.background = canvasTex(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.sky[0]); g.addColorStop(0.62, th.sky[1]); g.addColorStop(1, th.fog); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
    scene.fog = new THREE.Fog(th.fog, 110, 420);
    const L = th.light || 1;
    scene.add(new THREE.HemisphereLight(th.night ? 0x8fa0ff : 0xffffff, th.night ? 0x2a1f66 : 0x9a8f7a, 1.6 * L));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.7 * L); sun.position.set(80, 140, 40); scene.add(sun);

    // 땅
    const gtex = canvasTex(256, 256, (x, w, h) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? th.ground : th.ground2; x.fillRect(i * 64, j * 64, 64, 64); }
      const r = rng(7); for (let i = 0; i < 500; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * w, r() * h, 3, 3); }
      if (th.night) for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(180,220,255,.6)'; x.fillRect(r() * w, r() * h, 2, 2); }
    });
    gtex.repeat.set(60, 60);
    const { minX, maxX, minZ, maxZ } = tr.bounds, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    this.center = { x: cx, z: cz, r: Math.max(maxX - minX, maxZ - minZ) / 2 };
    if (th.water) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), lam(th.water)); water.rotation.x = -Math.PI / 2; water.position.y = -0.3; scene.add(water);
      this.water = water;
      const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lam(0xffffff, { map: gtex })); sand.rotation.x = -Math.PI / 2;
      sand.scale.set((maxX - minX) / 2 + 90, (maxZ - minZ) / 2 + 90, 1); sand.position.set(cx, 0, cz); gtex.repeat.set(20, 20); scene.add(sand);
    } else {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), lam(0xffffff, { map: gtex })); ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); scene.add(ground);
    }

    // 도로 띠 (도로 · 연석 · 바깥 갓길)
    const ribbon = (a, b, y, vScale, mat) => {
      const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
      for (let i = 0; i <= n; i++) {
        const p = s[i % n], nx = -p.tz, nz = p.tx, d = i === n ? tr.length : p.d;
        pos.set([p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b], i * 6);
        uv.set([0, d / vScale, 1, d / vScale], i * 4);
        if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      // 감김 방향이 아래를 보면 뒤집기
      if (g.attributes.normal.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
      const m = new THREE.Mesh(g, mat); scene.add(m); return m;
    };
    const roadTex = canvasTex(64, 256, (x, w, h) => {
      x.fillStyle = th.road; x.fillRect(0, 0, w, h);
      const r = rng(3); for (let i = 0; i < 400; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * w, r() * h, 2, 2); }
      x.fillStyle = th.line; x.globalAlpha = 0.9; x.fillRect(3, 0, 2, h); x.fillRect(w - 5, 0, 2, h); x.fillRect(w / 2 - 2, 0, 4, h / 2); x.globalAlpha = 1;
    });
    const sh = new THREE.MeshLambertMaterial({ color: new THREE.Color(th.ground2).multiplyScalar(0.9) });
    ribbon(HALF + 1, WALL + 1, 0.015, 10, sh); ribbon(-WALL - 1, -HALF - 1, 0.015, 10, sh);
    ribbon(-HALF, HALF, 0.03, 10, lam(0xffffff, { map: roadTex, emissive: th.night ? 0x221a55 : 0x000000 }));
    const curbTex = canvasTex(4, 64, (x, w, h) => { x.fillStyle = th.curb[0]; x.fillRect(0, 0, w, h / 2); x.fillStyle = th.curb[1]; x.fillRect(0, h / 2, w, h / 2); });
    const curbMat = lam(0xffffff, { map: curbTex, emissive: th.night ? 0x332266 : 0x000000 });
    ribbon(HALF, HALF + 1, 0.05, 4, curbMat); ribbon(-HALF - 1, -HALF, 0.05, 4, curbMat);

    // 벽 표시: 타이어 범퍼 (인스턴스 1개)
    const step = 5, cnt = Math.floor(tr.length / step) * 2;
    const tire = new Inst(scene, [{ geometry: new THREE.CylinderGeometry(0.55, 0.55, 0.7, 10), material: lam(0xffffff) }], cnt, { color: true });
    const cA = new THREE.Color(th.curb[0]), cB = new THREE.Color(th.night ? 0x7ff5ff : 0x3b3f6b);
    let ti = 0;
    for (let d = 0; d < tr.length - 1; d += step) for (const side of [1, -1]) {
      const p = tr.pointAt(d / tr.length, side * (WALL + 0.9));
      tire.set(ti, compose(p.x, 0.35, p.z, 0)); tire.color(ti, (Math.floor(d / step) % 2) ? cA : cB); ti++;
    }
    tire.done(ti, true);

    // 출발선 (체크무늬) + 결승 아치
    const chk = canvasTex(128, 32, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#222' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); } }, false);
    const st = tr.pointAt(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 2.2), lam(0xffffff, { map: chk }));
    line.rotation.set(-Math.PI / 2, 0, st.h); line.position.set(st.x, 0.06, st.z);
    // PlaneGeometry: 가로 = x. 도로 가로 방향으로 눕히기
    line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), st.h); scene.add(line);
    let arch;
    if (this.models.finish) { arch = this.models.finish.clone(true); }
    else {
      arch = new THREE.Group();
      const pm = lam(0xffd32a), banner = lam(0xffffff, { map: canvasTex(512, 64, (x, w, h) => { x.fillStyle = '#5b3bd6'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏁 출발 · 결승 🏁', w / 2, h / 2 + 3); }, false) });
      banner.name = 'Banner';
      for (const sx of [-7.4, 7.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 7.4, 10), pm); p.position.set(sx, 3.7, 0); arch.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 0.6), [lam(0x5b3bd6), lam(0x5b3bd6), lam(0x5b3bd6), lam(0x5b3bd6), banner, banner]); top.position.y = 7.4; arch.add(top);
    }
    arch.position.set(st.x, 0, st.z); arch.rotation.y = st.h; scene.add(arch);

    // 퀴즈 게이트
    this.gates = this.gateProgs.map((g, i) => {
      const p = tr.pointAt(g);
      const grp = new THREE.Group(); grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h;
      let banner = null;
      if (this.models.gate) {
        const m = this.models.gate.clone(true);
        m.traverse(o => { if (o.isMesh && o.material?.name?.startsWith('Banner')) { o.material = o.material.clone(); banner = banner || o.material; } });
        grp.add(m);
      } else {
        const pm = lam(0xff5fa2);
        for (const sx of [-6.6, 6.6]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.2, 10), pm); c.position.set(sx, 3.1, 0); grp.add(c); }
        banner = lam(0xffd32a, { emissive: 0x553300 }); banner.name = 'Banner';
        const top = new THREE.Mesh(new THREE.BoxGeometry(14.4, 1.3, 0.7), banner); top.position.y = 6.3; grp.add(top);
      }
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 5.6), new THREE.MeshBasicMaterial({ color: 0xff7fd1, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      curtain.position.y = 2.9; grp.add(curtain);
      const q = textSprite('❓', 128, 3.4); q.position.y = 8.8; grp.add(q);
      const ok = textSprite('✅', 128, 3.4); ok.position.y = 8.8; ok.visible = false; grp.add(ok);
      scene.add(grp);
      return { prog: g, grp, curtain, q, ok, banner, passed: false };
    });

    // 아이템 상자
    const boxParts = this.models.itembox ? partsOf(this.models.itembox, DECOR_FIT.itembox) : (() => {
      const t = canvasTex(64, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ffe066'); g.addColorStop(0.5, '#ff7fd1'); g.addColorStop(1, '#7fd6ff'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', w / 2, h / 2 + 3); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); }, false);
      return [{ geometry: new THREE.BoxGeometry(1.2, 1.2, 1.2), material: lam(0xffffff, { map: t, transparent: true, opacity: 0.92, emissive: 0x332244 }) }];
    })();
    this.boxes = [];
    for (const row of this.boxRows) for (const lat of row.lanes) { const p = tr.pointAt(row.prog, lat); this.boxes.push({ x: p.x, z: p.z, h: p.h, hideUntil: 0, ph: Math.random() * 6 }); }
    this.boxInst = new Inst(scene, boxParts, Math.max(1, this.boxes.length), { dynamic: true });

    // 바나나
    const banParts = this.models.banana ? partsOf(this.models.banana, DECOR_FIT.banana)
      : fallbackBanana();
    this.banInst = new Inst(scene, banParts, 64, { dynamic: true });

    // 장식 (트랙 둘레에 흩어 심기)
    this.buildDecor();

    // 카트 그림자 (둥근 그림자, 인스턴스)
    const blobTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
    this.blob = new Inst(scene, [{ geometry: geo(new THREE.PlaneGeometry(2.4, 3), 0, 0, 0, -Math.PI / 2), material: new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }) }], 64, { dynamic: true });
    // 멀리 있는 카트 (네모 하나, 색만)
    this.lod = new Inst(scene, [{ geometry: mergeGeometries([geo(new THREE.BoxGeometry(1.3, 0.45, 2.0), 0, 0.45, 0).toNonIndexed(), geo(new THREE.SphereGeometry(0.32, 8, 6), 0, 1.0, -0.2).toNonIndexed()]), material: lam(0xffffff) }], 64, { dynamic: true, color: true });

    // 반짝이 입자
    const PN = 260; this.pn = PN;
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(PN * 3).fill(-999); this.pCol = new Float32Array(PN * 3); this.pVel = new Float32Array(PN * 3); this.pLife = new Float32Array(PN);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const dot = canvasTex(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.4, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }, false);
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.42, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; scene.add(this.points); this.pi = 0;
  }

  buildDecor() {
    const { scene, tr, th } = this;
    const r = rng(1234 + tr.index * 77);
    const kinds = th.decor, total = kinds.reduce((a, [, w]) => a + w, 0);
    const placed = new Map(kinds.map(([k]) => [k, []]));
    const want = this.low ? 200 : 320;
    for (let tries = 0, made = 0; made < want && tries < want * 4; tries++) {
      let pick = r() * total, kind = kinds[0][0]; for (const [k, w] of kinds) { pick -= w; if (pick <= 0) { kind = k; break; } }
      if (kind === 'planet') { // 하늘에 둥둥
        const p = tr.pointAt(r(), (r() < 0.5 ? -1 : 1) * (90 + r() * 160));
        placed.get(kind).push({ x: p.x, y: 35 + r() * 45, z: p.z, ry: r() * TAU, s: 0.6 + r() * 0.9 }); made++; continue;
      }
      const big = kind === 'mesa' || kind === 'house';
      const dist = (big ? 30 : kind === 'cone' || kind === 'flower' ? WALL + 3 : WALL + 4) + r() * (big ? 90 : kind === 'cone' ? 6 : 70);
      const p = tr.pointAt(r(), (r() < 0.5 ? -1 : 1) * dist);
      const near = tr.progressAt(p.x, p.z, -1);
      if (Math.abs(near.lat) < (big ? 22 : WALL + 2.5)) continue;
      placed.get(kind).push({ x: p.x, z: p.z, ry: r() * TAU, s: (kind === 'cone' ? 1 : 0.75 + r() * 0.6) * (kind === 'flower' ? 1.2 : 1) });
      made++;
    }
    const flowerCols = [0xff6fa8, 0xffd32a, 0xffffff, 0xb07cff, 0xff9f43].map(c => new THREE.Color(c));
    for (const [kind, list] of placed) {
      if (!list.length) continue;
      const parts = this.models[kind] ? partsOf(this.models[kind], DECOR_FIT[kind]) : fallbackDecor(kind, this.th);
      const colorful = kind === 'flower' || kind === 'house' || kind === 'umbrella' || kind === 'crystal';
      const inst = new Inst(scene, parts, list.length, { color: colorful, colorPart: kind === 'flower' ? 1 : kind === 'house' ? 1 : kind === 'umbrella' ? 1 : -1 });
      list.forEach((d, i) => {
        inst.set(i, compose(d.x, d.y || 0, d.z, d.ry, d.s, d.y ? 0.3 : 0));
        if (colorful) inst.color(i, flowerCols[(i * 7) % flowerCols.length]);
      });
      inst.done(list.length, true);
    }
    // 먼 산 (안개 대신 색을 섞어 은은하게)
    const mParts = fallbackDecor('mountain', th);
    const mc = new THREE.Color(th.ground2).lerp(new THREE.Color(th.fog), 0.55);
    if (th.night) mc.set(0x3a2f7a);
    mParts[0].material.color = mc;
    const mi = new Inst(scene, mParts, 36);
    const R0 = this.center.r + 260;
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU + r() * 0.1, rr = R0 + r() * 120, hgt = 50 + r() * 90;
      M4.compose(V.set(this.center.x + Math.cos(a) * rr, -2, this.center.z + Math.sin(a) * rr), Q.identity(), S.set(hgt * 1.4, hgt, hgt * 1.4)); mi.set(i, M4);
    }
    mi.done(36, true);
    // 구름 (천천히 흐름)
    this.clouds = [];
    const cn = th.clouds || 0;
    if (cn) {
      const parts = this.models.cloud ? partsOf(this.models.cloud, DECOR_FIT.cloud) : fallbackDecor('cloud', th);
      this.cloudInst = new Inst(scene, parts, cn, { dynamic: true });
      for (let i = 0; i < cn; i++) this.clouds.push({ a: r() * TAU, rr: 60 + r() * (this.center.r + 140), y: 40 + r() * 35, s: 1 + r() * 1.6, sp: 0.004 + r() * 0.006 });
    }
    // 우주: 별 + 행성
    if (th.night) {
      const sg = new THREE.BufferGeometry(), sp = new Float32Array(900 * 3);
      for (let i = 0; i < 900; i++) { const u = r() * TAU, v = Math.acos(r() * 0.95), R = 900; sp.set([this.center.x + Math.sin(v) * Math.cos(u) * R, Math.cos(v) * R * 0.8 + 40, this.center.z + Math.sin(v) * Math.sin(u) * R], i * 3); }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })); scene.add(stars);
    }
  }

  // ===== 카트 =====
  makeKarts() {
    for (const p of this.opts.players || []) this.setPlayer(p);
    if (!this.spectate) {
      const me = this.opts.me;
      const g = this.tr.grid(me.k % 40);
      this.me = { k: me.k, x: g.x, z: g.z, h: g.h, s: 0, steer: 0, total: g.rp, lastProg: ((g.rp % 1) + 1) % 1, hint: -1, lapsDone: 0, mask: 0,
        boostT: 0, starT: 0, shieldT: 0, slowT: 0, spinT: 0, inkT: 0, drifting: false, driftDir: 0, charge: 0, wwT: 0, quiz: false, finished: false,
        offroad: false, bumpT: 0, lastWall: 0, startBoost: false };
      if (this.opts.resume) this.resume(this.opts.resume);
      this.meView = new KartView(this.models, me.color || '#ff5fa2', this.scene);
      this.prog = this.tr.progressAt(this.me.x, this.me.z, -1); this.me.hint = this.prog.i;
      this.camPos = new THREE.Vector3(this.me.x - Math.sin(this.me.h) * 8, 4, this.me.z - Math.cos(this.me.h) * 8);
    } else {
      const c = this.tr.pointAt(-0.02);
      this.camPos = new THREE.Vector3(c.x - Math.sin(c.h) * 12, 6, c.z - Math.cos(c.h) * 12);
    }
    this.camLook = new THREE.Vector3();
  }
  resume(r) { // 다시 접속: 서버가 기억한 자리에서
    const m = this.me;
    if (r.x != null) { m.x = r.x; m.z = r.z; m.h = r.h; }
    if (r.rp != null) { m.total = r.rp; m.lapsDone = Math.max(0, Math.floor(r.rp)); m.lastProg = ((r.rp % 1) + 1) % 1; m.mask = 0;
      const frac = r.rp - Math.floor(r.rp); for (let c = 0; c <= Math.floor(frac * 8) && r.rp >= 0; c++) m.mask |= 1 << c;
      for (const g of this.gates || []) g.passed = frac > g.prog; }
    if (r.finished) m.finished = true;
  }
  setPlayer(p) {
    this.players.set(p.k, p);
    const r = this.remotes.get(p.k); if (r) { r.info = p; if (r.tag) r.tag.innerHTML = this.tagHTML(p); }
  }
  tagHTML(p) { const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); return `<i>${esc(p.face || '🐱')}</i>${esc(p.name || '')}<b class="q">❓</b>`; }
  remote(k) {
    let r = this.remotes.get(k);
    if (!r) {
      const info = this.players.get(k) || { k, name: '', color: '#aaaaaa', face: '🐱' };
      const g = this.tr.grid(k % 40);
      r = { k, info, buf: [], x: g.x, z: g.z, h: g.h, s: 0, rp: g.rp, fx: 0, view: null, tag: null, finished: 0, seen: false, steer: 0 };
      this.remotes.set(k, r);
    }
    return r;
  }
  // 서버 snap: [k,x*10,z*10,h*100,s*10,rp*1000,fx, ...]
  applySnap(a) {
    const t = performance.now();
    for (let i = 0; i + 6 < a.length; i += 7) {
      const k = a[i]; if (!this.spectate && k === this.me.k) continue;
      const r = this.remote(k);
      r.buf.push({ t, x: a[i + 1] / 10, z: a[i + 2] / 10, h: a[i + 3] / 100, s: a[i + 4] / 10, rp: a[i + 5] / 1000, fx: a[i + 6] });
      if (r.buf.length > 8) r.buf.shift();
      if (!r.seen) { r.seen = true; r.x = a[i + 1] / 10; r.z = a[i + 2] / 10; r.h = a[i + 3] / 100; }
    }
  }
  setFinished(k, rank) { if (!this.spectate && k === this.me.k) return; this.remote(k).finished = rank; }
  addBanana(b) {
    if (this.bananas.has(b.id)) return;
    this.bananas.set(b.id, { ...b, born: performance.now(), mine: !this.spectate && b.by === this.me?.k });
    if (!this.spectate && Math.hypot(b.x - this.me.x, b.z - this.me.z) < 30) sound.play('pick');
  }
  delBanana(id) { this.bananas.delete(id); }
  setGo(localAt) { this.goAt = localAt; }
  setQuiz(on) { if (this.me) this.me.quiz = !!on; }
  setFinishedMe(rank = 1) { if (this.me) { this.me.finished = true; this.me.finishedRank = rank; this.burst(this.me.x, 1.5, this.me.z, 60, 'rainbow'); } }

  // ===== 효과 =====
  boost(sec = 1.4) { const m = this.me; if (!m) return; m.boostT = Math.max(m.boostT, sec); m.s = Math.max(m.s, 18); sound.play('boost'); this.burst(m.x, 0.6, m.z, 24, 'fire'); this.fovKick = 1; }
  star(sec = 5) { const m = this.me; if (!m) return; m.starT = sec; m.spinT = 0; m.slowT = 0; this.clearInk(); sound.play('open'); this.boost(1.0); }
  shield(sec = 10) { const m = this.me; if (!m) return; m.shieldT = sec; sound.play('coin'); this.burst(m.x, 1, m.z, 20, 'sky'); }
  slow(ms = 1000) { const m = this.me; if (!m || m.starT > 0) return; m.slowT = Math.max(m.slowT, ms / 1000); }
  // 막았으면 'shield' / 'star', 맞았으면 'hit'
  hitBy(kind) {
    const m = this.me; if (!m) return 'none';
    if (m.starT > 0) return 'star';
    if (m.shieldT > 0) { m.shieldT = 0; sound.play('steal'); this.burst(m.x, 1, m.z, 30, 'sky'); return 'shield'; }
    if (kind === 'banana') { m.spinT = 1.2; m.boostT = 0; m.drifting = false; m.charge = 0; sound.play('hit'); }
    if (kind === 'ink') this.inkOn(4);
    if (kind === 'slow') this.slow(1000);
    if (kind === 'spin') { m.spinT = 0.9; sound.play('hit'); }
    return 'hit';
  }
  inkOn(sec) {
    const m = this.me; m.inkT = sec;
    const blobs = Array.from({ length: 7 }, (_, i) => `<span style="left:${10 + Math.random() * 70}%;top:${8 + Math.random() * 65}%;--s:${(110 + Math.random() * 170) | 0}px;animation-delay:${i * 60}ms"></span>`).join('');
    this.inkEl.innerHTML = blobs + '<em>🦑 먹물이에요! 조심조심~</em>';
    this.inkEl.classList.add('on'); sound.play('hit');
  }
  clearInk() { if (this.me) this.me.inkT = 0; this.inkEl.classList.remove('on'); }
  dropPos() { const m = this.me; return { x: m.x - Math.sin(m.h) * 2.6, z: m.z - Math.cos(m.h) * 2.6 }; }
  squirt() { const m = this.me; this.burst(m.x, 1.2, m.z, 30, 'ink'); }
  burst(x, y, z, n, kind) {
    const cols = { fire: [0xffa531, 0xffe066, 0xff5f3a], sky: [0x7fdcff, 0xffffff], rainbow: [0xff5fa2, 0xffd32a, 0x3fc3f0, 0x2ed573, 0xb07cff], ink: [0x5b3bd6, 0x2b2d42], gold: [0xffd32a, 0xfff1a8], blue: [0x5fb4ff, 0xbfe6ff], orange: [0xff9f43, 0xffe066] }[kind] || [0xffffff];
    for (let j = 0; j < n; j++) {
      const i = this.pi = (this.pi + 1) % this.pn;
      this.pPos.set([x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5)], i * 3);
      this.pVel.set([(Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8], i * 3);
      C.set(cols[j % cols.length]); this.pCol.set([C.r, C.g, C.b], i * 3);
      this.pLife[i] = 0.6 + Math.random() * 0.6;
    }
  }
  flash(text, cls = '', ms = 1600) {
    const d = document.createElement('div'); d.className = 'rc-flash ' + cls; d.textContent = text; this.msgEl.append(d);
    setTimeout(() => d.remove(), ms);
  }

  // ===== 상태 (서버로 보낼 것) =====
  fx() {
    const m = this.me; if (!m) return 0;
    return (m.boostT > 0 ? FX.BOOST : 0) | (m.shieldT > 0 ? FX.SHIELD : 0) | (m.starT > 0 ? FX.STAR : 0) | (m.spinT > 0 ? FX.SPIN : 0) |
      (m.drifting ? FX.DRIFT : 0) | (m.drifting && m.charge > 1.8 ? FX.DRIFT2 : 0) | (m.quiz ? FX.QUIZ : 0) | (m.inkT > 0 ? FX.INK : 0) | (m.finished ? FX.DONE : 0);
  }
  state() { const m = this.me; return { x: +m.x.toFixed(2), z: +m.z.toFixed(2), h: +m.h.toFixed(3), s: +m.s.toFixed(1), rp: +m.total.toFixed(4), fx: this.fx() }; }
  lap() { return Math.min(this.laps, this.me.lapsDone + 1); }
  // 지금 등수 (다른 카트 rp 기준, 도착한 사람 먼저)
  rankInfo() {
    const list = [...this.remotes.values()].filter(r => r.seen || r.finished);
    let ahead = 0; const mine = this.me.finished ? Infinity : this.me.total;
    for (const r of list) {
      if (this.me.finished) { if (r.finished && r.finished < this.me.finishedRank) ahead++; }
      else if (r.finished || r.rp > mine) ahead++;
    }
    return { rank: ahead + 1, of: list.length + 1 };
  }

  // ===== 물리 =====
  step(dt) {
    const m = this.me, tr = this.tr, inp = this.input;
    const go = this.started;
    let throttle = go ? inp.throttle : 0, steer = go ? inp.steer : 0;
    // 출발 직전 0.8초에 가속하면 로켓 출발
    if (!go && this.goAt - performance.now() < 800 && this.goAt - performance.now() > 0 && inp.throttle > 0.5) m.startBoost = true;
    const auto = m.quiz || m.finished;
    if (auto && go) { // 자동 운전: 도로 가운데 쪽으로 천천히
      const ahead = tr.pointAt(this.prog.prog + 9 / tr.length, clamp(this.prog.lat, -3, 3));
      const want = Math.atan2(ahead.x - m.x, ahead.z - m.z);
      steer = clamp(-angDiff(want, m.h) * 2.2, -1, 1);
      const target = m.finished ? 9 : 3.5;
      throttle = m.s < target ? 0.7 : (m.s > target + 2 ? -0.4 : 0);
      m.drifting = false; m.charge = 0;
    }
    if (m.spinT > 0) { steer = 0; throttle = 0; m.s *= Math.exp(-3 * dt); }
    // 핸들 부드럽게
    m.steer += (steer - m.steer) * Math.min(1, dt * (Math.abs(steer) > Math.abs(m.steer) ? 9 : 12));
    // 최고 속도
    let max = MAX;
    if (m.offroad && m.starT <= 0) max = OFF_MAX;
    if (m.slowT > 0) max = Math.min(max, 9);
    if (m.starT > 0) max = STAR_MAX;
    if (m.boostT > 0) max = Math.max(max, BOOST_MAX);
    if (m.boostT > 0) m.s = Math.min(max, m.s + 32 * dt);
    if (throttle > 0) {
      if (m.s < 0) m.s += BRAKE * dt;
      else if (m.s < max) m.s = Math.min(max, m.s + ACC * throttle * dt * (m.s < 8 ? 1.4 : 1));
    } else if (throttle < 0) {
      if (m.s > 0) m.s = Math.max(0, m.s - BRAKE * -throttle * dt);
      else m.s = Math.max(-REV, m.s - 9 * -throttle * dt);
    } else m.s -= Math.sign(m.s) * Math.min(Math.abs(m.s), 4 * dt);
    if (m.s > max) m.s = Math.max(max, m.s - 16 * dt);
    // 드리프트 (Shift / 💨 버튼)
    const sp = Math.abs(m.s);
    if (!auto && inp.drift && !m.drifting && Math.abs(m.steer) > 0.25 && m.s > 9 && m.spinT <= 0) { m.drifting = true; m.driftDir = Math.sign(m.steer); m.charge = 0; this.hop = 0.25; }
    if (m.drifting) {
      m.charge += dt * (1 + Math.max(0, m.steer * m.driftDir) * 0.8);
      if (!inp.drift || m.s < 7) {
        m.drifting = false;
        if (m.charge > 1.8) { this.boost(1.1); this.flash('🔥 미니 터보!', 'turbo', 900); }
        else if (m.charge > 0.9) { this.boost(0.6); this.flash('💨 터보!', 'turbo', 800); }
        m.charge = 0;
      }
    }
    const turn = 2.15 * Math.min(1, sp / 5) * (1 - 0.3 * Math.min(1, sp / MAX)) * (m.offroad ? 0.9 : 1);
    const yaw = m.drifting ? (m.driftDir * 0.62 + m.steer * 0.5) * turn * 1.18 : m.steer * turn;
    m.h -= yaw * dt * (m.s >= 0 ? 1 : -1);
    if (m.spinT > 0) m.spinT -= dt;
    // 이동 (드리프트 중엔 바깥으로 살짝 미끄러짐)
    const slip = m.drifting ? -m.driftDir * 0.18 : 0;
    m.x += Math.sin(m.h + slip) * m.s * dt; m.z += Math.cos(m.h + slip) * m.s * dt;
    // 다른 카트와 부딪힘 (나만 밀림)
    for (const r of this.remotes.values()) {
      const dx = m.x - r.x, dz = m.z - r.z, d2 = dx * dx + dz * dz;
      if (d2 < (KART_R * 2) ** 2 && d2 > 1e-4) {
        const d = Math.sqrt(d2), push = (KART_R * 2 - d) * (m.starT > 0 ? 0.2 : 0.6);
        m.x += dx / d * push; m.z += dz / d * push; if (m.starT <= 0) m.s *= 0.985;
      }
    }
    // 도로와의 관계
    const pr = this.prog = tr.progressAt(m.x, m.z, m.hint); m.hint = pr.i;
    if (Math.abs(pr.lat) > WALL) { // 부드러운 벽
      const sg = Math.sign(pr.lat), nx = -pr.tz * sg, nz = pr.tx * sg, over = Math.abs(pr.lat) - WALL;
      m.x -= nx * over; m.z -= nz * over;
      const into = Math.sin(m.h) * nx + Math.cos(m.h) * nz;
      if (into * Math.sign(m.s) > 0.05) {
        m.s *= 1 - 0.55 * Math.min(1, into * Math.sign(m.s));
        const tangH = Math.atan2(pr.tx, pr.tz), alt = tangH + Math.PI;
        m.h = lerpAng(m.h, Math.abs(angDiff(tangH, m.h)) < Math.PI / 2 ? tangH : alt, 0.25);
        if (sp > 8 && performance.now() - m.lastWall > 600) { m.lastWall = performance.now(); sound.play('tick'); this.shake = 0.3; }
      }
    }
    m.offroad = Math.abs(pr.lat) > HALF + 0.9;
    // 진행도 · 바퀴 (체크포인트 8개를 차례로 지나야 한 바퀴)
    const prev = m.total;
    const d = wrapDelta(pr.prog - m.lastProg); m.lastProg = pr.prog;
    if (Math.abs(d) < 0.05) m.total += d;
    if (m.total < -0.5) m.total = -0.5;
    const lapIdx = Math.floor(m.total), frac = m.total - lapIdx;
    if (lapIdx >= 0) {
      const cp = Math.min(7, Math.floor(frac * 8));
      if (cp === 0 || (m.mask & (1 << (cp - 1)))) m.mask |= 1 << cp;
    }
    if (lapIdx >= m.lapsDone + 1) {
      if (m.mask === 255) {
        m.lapsDone++; m.mask = 1;
        for (const g of this.gates) { g.passed = false; }
        this.on.lap?.(m.lapsDone);
        if (m.lapsDone >= this.laps && !m.finished) this.on.finishLine?.(m.lapsDone);
      } else m.total = m.lapsDone + 1 - 1e-4; // 지름길 막기
    }
    // 퀴즈 게이트
    if (go) for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i], at = Math.floor(prev) + g.prog;
      if (!g.passed && prev >= 0 && prev < at && m.total >= at) {
        g.passed = true;
        if (Math.abs(pr.lat) <= HALF + 1.6) this.on.gate?.(i); else this.on.gateMiss?.(i);
      }
    }
    // 아이템 상자
    const now = performance.now();
    if (go) for (const b of this.boxes) {
      if (b.hideUntil > now) continue;
      if ((b.x - m.x) ** 2 + (b.z - m.z) ** 2 < 1.8 * 1.8) {
        b.hideUntil = now + 6000; sound.play('coin'); this.burst(b.x, 1.2, b.z, 26, 'rainbow');
        this.on.box?.();
      }
    }
    // 바나나
    for (const b of this.bananas.values()) {
      if (b.hit || (b.mine && now - b.born < 1500)) continue;
      if ((b.x - m.x) ** 2 + (b.z - m.z) ** 2 < 1.5 * 1.5) {
        b.hit = true; this.bananas.delete(b.id);
        const res = this.hitBy('banana');
        if (res === 'hit') this.flash('🍌 미끄덩!', 'bad', 1100);
        else if (res === 'shield') this.flash('🛡️ 방패가 막았어요!', '', 1100);
        this.on.bananaHit?.(b.id, res);
      }
    }
    // 거꾸로
    const fwd = Math.sin(m.h) * pr.tx + Math.cos(m.h) * pr.tz;
    if (go && !auto && fwd < -0.3 && m.s > 3) m.wwT += dt; else m.wwT = Math.max(0, m.wwT - dt * 2);
    const ww = m.wwT > 1.0;
    if (ww !== this.wrongWay) { this.wrongWay = ww; this.on.wrongWay?.(ww); }
    // 타이머
    m.boostT = Math.max(0, m.boostT - dt); m.starT = Math.max(0, m.starT - dt); m.shieldT = Math.max(0, m.shieldT - dt); m.slowT = Math.max(0, m.slowT - dt);
    if (m.inkT > 0) { m.inkT -= dt; if (m.inkT <= 0) this.clearInk(); }
  }

  // ===== 그리기 =====
  loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (document.hidden) return;
    this.time += dt;
    this.countdown(now);
    if (this.me) { let left = dt; while (left > 1e-4) { const h = Math.min(1 / 60, left); this.step(h); left -= h; } }
    this.updateRemotes(now, dt);
    this.updateObjects(now, dt);
    this.updateCamera(dt);
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateTags();
    if ((this.miniT = (this.miniT || 0) + dt) > 0.07) { this.miniT = 0; this.drawMini(); }
    this.adapt(dt);
  }
  countdown(now) {
    const left = this.goAt - now;
    if (!this.started && this.goAt !== Infinity) {
      const n = Math.ceil(left / 1000);
      if (left <= 0) {
        this.started = true; this.countEl.innerHTML = '<b class="go">출발!</b>'; sound.play('go');
        setTimeout(() => { this.countEl.innerHTML = ''; }, 900);
        if (this.me?.startBoost) { this.boost(1.2); this.flash('🚀 로켓 출발!', 'turbo', 1200); }
        this.on.go?.();
      } else if (n <= 3 && n !== this.lastN) { this.lastN = n; this.countEl.innerHTML = `<b>${n}</b>`; sound.play('count'); }
      else if (n > 3 && this.lastN !== 'r') { this.lastN = 'r'; this.countEl.innerHTML = '<b class="ready">준비~</b>'; }
    }
  }
  updateRemotes(now, dt) {
    const rt = now - 210; // 서버 위치는 약 7Hz → 1.5칸 뒤를 그려 부드럽게
    const camX = this.camera.position.x, camZ = this.camera.position.z;
    const list = [];
    for (const r of this.remotes.values()) {
      const b = r.buf;
      if (b.length) {
        let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--;
        const B = b[i], A = b[i - 1];
        if (A && rt >= A.t && rt <= B.t) { const u = (rt - A.t) / Math.max(1, B.t - A.t); r.x = A.x + (B.x - A.x) * u; r.z = A.z + (B.z - A.z) * u; r.h = lerpAng(A.h, B.h, u); r.s = A.s + (B.s - A.s) * u; }
        else if (rt > B.t) { const ex = Math.min(0.25, (rt - B.t) / 1000); r.x = B.x + Math.sin(B.h) * B.s * ex; r.z = B.z + Math.cos(B.h) * B.s * ex; r.h = B.h; r.s = B.s; if (now - B.t > 1500) r.s = 0; }
        else { r.x += (B.x - r.x) * Math.min(1, dt * 8); r.z += (B.z - r.z) * Math.min(1, dt * 8); r.h = lerpAng(r.h, B.h, Math.min(1, dt * 8)); }
        r.rp = B.rp; r.fx = B.fx;
        if (A) { const dh = angDiff(B.h, A.h); r.steer += (clamp(-dh * 6, -1, 1) - r.steer) * Math.min(1, dt * 6); }
      }
      r.dist = (r.x - camX) ** 2 + (r.z - camZ) ** 2;
      list.push(r);
    }
    list.sort((a, b) => a.dist - b.dist);
    let li = 0, bi = 0;
    list.forEach((r, idx) => {
      const full = idx < FULL_KARTS && r.dist < 110 * 110;
      if (full) {
        if (!r.view) r.view = new KartView(this.models, r.info.color || '#aaaaaa', this.scene);
        r.view.root.visible = true;
        r.view.root.position.set(r.x, 0, r.z); r.view.root.rotation.y = r.h;
        r.view.update(dt, this.time, r.s, r.steer, r.fx, Math.sign(r.steer));
      } else {
        if (r.view) r.view.root.visible = false;
        this.lod.set(li, compose(r.x, (r.fx & FX.SPIN) ? 0.2 : 0, r.z, r.h + ((r.fx & FX.SPIN) ? this.time * 12 : 0)));
        this.lod.color(li, C.set(r.info.color || '#aaaaaa')); li++;
      }
      if (bi < 63) this.blob.set(bi++, compose(r.x, 0.07, r.z, r.h));
    });
    if (this.me) { this.blob.set(bi++, compose(this.me.x, 0.07, this.me.z, this.me.h)); }
    this.lod.done(li); this.blob.done(bi);
    this.sorted = list;
    // 내 카트 모습
    if (this.me) {
      const m = this.me;
      this.meView.root.position.set(m.x, (this.hop || 0) > 0 ? Math.sin((0.25 - this.hop) / 0.25 * Math.PI) * 0.35 : 0, m.z);
      if (this.hop > 0) this.hop -= dt;
      this.meView.root.rotation.y = m.h;
      this.meView.update(dt, this.time, m.s, m.steer, this.fx(), m.driftDir);
      // 드리프트 불꽃
      if (m.drifting && m.charge > 0.9 && Math.random() < 0.7) {
        const bx = m.x - Math.sin(m.h) * 1.1, bz = m.z - Math.cos(m.h) * 1.1;
        const side = Math.cos(m.h) * 0.75, sideZ = -Math.sin(m.h) * 0.75;
        this.burst(bx + side, 0.2, bz + sideZ, 1, m.charge > 1.8 ? 'orange' : 'blue'); this.burst(bx - side, 0.2, bz - sideZ, 1, m.charge > 1.8 ? 'orange' : 'blue');
      }
      if (m.boostT > 0 && Math.random() < 0.5) this.burst(m.x - Math.sin(m.h) * 1.6, 0.5, m.z - Math.cos(m.h) * 1.6, 1, 'fire');
      if (m.starT > 0 && Math.random() < 0.6) this.burst(m.x, 0.8, m.z, 1, 'rainbow');
    }
  }
  updateObjects(now, dt) {
    const t = this.time;
    // 게이트: 반짝반짝
    for (const g of this.gates) {
      g.q.visible = !g.passed; g.ok.visible = g.passed;
      g.q.position.y = 8.8 + Math.sin(t * 3 + g.prog * 10) * 0.4;
      g.curtain.material.color.set(g.passed ? 0x6fff9f : 0xff7fd1);
      g.curtain.material.opacity = g.passed ? 0.12 : 0.22 + Math.sin(t * 5) * 0.1;
      if (g.banner?.emissive) g.banner.emissive.setScalar(g.passed ? 0.05 : 0.25 + Math.sin(t * 5) * 0.15);
    }
    // 상자: 빙글빙글 둥실
    this.boxes.forEach((b, i) => {
      if (b.hideUntil > now) {
        const left = b.hideUntil - now;
        if (left < 400) this.boxInst.set(i, compose(b.x, 1.3, b.z, t * 1.6 + b.ph, 1 - left / 400));
        else this.boxInst.set(i, HIDE);
      } else this.boxInst.set(i, compose(b.x, 1.3 + Math.sin(t * 2.4 + b.ph) * 0.25, b.z, t * 1.6 + b.ph, 1, 0.35, 0.2));
    });
    this.boxInst.done(this.boxes.length);
    let bi = 0;
    for (const b of this.bananas.values()) { if (bi >= 64) break; this.banInst.set(bi++, compose(b.x, 0, b.z, (b.id * 1.7) % TAU, 1 + Math.sin(t * 4 + b.id) * 0.05)); }
    this.banInst.done(bi);
    if (this.cloudInst) {
      this.clouds.forEach((c, i) => { c.a += c.sp * dt; this.cloudInst.set(i, compose(this.center.x + Math.cos(c.a) * c.rr, c.y, this.center.z + Math.sin(c.a) * c.rr, c.a, c.s)); });
      this.cloudInst.done(this.clouds.length);
    }
  }
  followTarget() {
    if (this.me) return this.me;
    // 중계: 선두 (2초마다만 바꿈)
    const now = performance.now();
    if (now > this.followSwitch || !this.remotes.has(this.followK)) {
      let best = null;
      for (const r of this.remotes.values()) if (r.seen && !r.finished && (!best || r.rp > best.rp)) best = r;
      if (!best) for (const r of this.remotes.values()) if (r.seen && (!best || r.rp > best.rp)) best = r;
      if (best && best.k !== this.followK) { this.followK = best.k; this.on.follow?.(best.k); }
      this.followSwitch = now + 2500;
    }
    return this.remotes.get(this.followK) || null;
  }
  updateCamera(dt) {
    const T = this.followTarget();
    const cam = this.camera;
    if (T) {
      const boost = this.me ? (this.me.boostT > 0 ? 1 : 0) : ((T.fx & FX.BOOST) ? 1 : 0);
      const back = this.spectate ? 9 : 7.2 + boost * 1.2, up = this.spectate ? 4.2 : 3.2;
      const want = V.set(T.x - Math.sin(T.h) * back, up, T.z - Math.cos(T.h) * back);
      this.camPos.lerp(want, 1 - Math.exp(-dt * (this.spectate ? 3 : 5.5)));
      this.camPos.y = Math.max(1.6, this.camPos.y);
      this.camLook.set(T.x + Math.sin(T.h) * 4, 1.1, T.z + Math.cos(T.h) * 4);
      const fov = 68 + boost * 9 + (this.me ? Math.min(6, Math.abs(this.me.s) / 5) : 0);
      if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    } else {
      // 아무도 없으면 트랙 위를 천천히 돎
      const p = this.tr.pointAt((this.time * 0.01) % 1);
      this.camPos.lerp(V.set(p.x - Math.sin(p.h) * 14, 8, p.z - Math.cos(p.h) * 14), 1 - Math.exp(-dt * 2));
      this.camLook.set(p.x, 1, p.z);
    }
    cam.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; }
    if (this.me?.offroad && Math.abs(this.me.s) > 4) cam.position.y += (Math.random() - 0.5) * 0.06;
    cam.lookAt(this.camLook);
  }
  updateParticles(dt) {
    const P = this.pPos, Vv = this.pVel, Lf = this.pLife;
    for (let i = 0; i < this.pn; i++) {
      if (Lf[i] <= 0) continue;
      Lf[i] -= dt;
      if (Lf[i] <= 0) { P[i * 3 + 1] = -999; continue; }
      Vv[i * 3 + 1] -= 9 * dt;
      P[i * 3] += Vv[i * 3] * dt; P[i * 3 + 1] = Math.max(0.05, P[i * 3 + 1] + Vv[i * 3 + 1] * dt); P[i * 3 + 2] += Vv[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
  updateTags() {
    const w = this.w, h = this.h, cam = this.camera;
    let shown = 0;
    for (const r of this.sorted || []) {
      const show = shown < LABELS && r.dist < 100 * 100;
      if (show) {
        V.set(r.x, 2.3, r.z).project(cam);
        if (V.z < 1 && Math.abs(V.x) < 1.1 && Math.abs(V.y) < 1.1) {
          if (!r.tag) { r.tag = document.createElement('div'); r.tag.className = 'rc-tag'; r.tag.innerHTML = this.tagHTML(r.info); r.tag.style.setProperty('--c', r.info.color || '#aaa'); this.tagsEl.append(r.tag); }
          const sc = clamp(1.25 - Math.sqrt(r.dist) / 90, 0.55, 1.1);
          r.tag.style.transform = `translate(${((V.x + 1) / 2 * w).toFixed(1)}px,${((1 - V.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(2)})`;
          r.tag.style.display = '';
          r.tag.classList.toggle('quiz', !!(r.fx & FX.QUIZ));
          r.tag.classList.toggle('lead', this.spectate && r.k === this.followK);
          shown++;
          continue;
        }
      }
      if (r.tag) r.tag.style.display = 'none';
    }
  }
  drawMini() {
    const c = this.mini, x = c.getContext('2d'), W = c.width, H = c.height;
    if (!W) return;
    if (!this.miniBg || this.miniBg.width !== W) {
      const { minX, maxX, minZ, maxZ } = this.tr.bounds, pad = 14;
      const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
      // 화면에서 앞(+Z)이 위로 보이게: x 는 좌우 반전(카메라 오른쪽 = -X)
      this.mm = (px, pz) => [W / 2 - (px - (minX + maxX) / 2) * sc, H / 2 - (pz - (minZ + maxZ) / 2) * sc];
      const bg = this.miniBg = document.createElement('canvas'); bg.width = W; bg.height = H; const b = bg.getContext('2d');
      b.lineJoin = b.lineCap = 'round';
      const path = () => { b.beginPath(); this.tr.samples.forEach((s, i) => { const [u, v] = this.mm(s.x, s.z); i ? b.lineTo(u, v) : b.moveTo(u, v); }); b.closePath(); };
      path(); b.strokeStyle = 'rgba(255,255,255,.95)'; b.lineWidth = Math.max(7, W / 18); b.stroke();
      path(); b.strokeStyle = this.th.road; b.lineWidth = Math.max(4, W / 30); b.stroke();
      const s0 = this.tr.pointAt(0), [u0, v0] = this.mm(s0.x, s0.z);
      b.fillStyle = '#222'; b.fillRect(u0 - 4, v0 - 4, 8, 8); b.fillStyle = '#fff'; b.fillRect(u0 - 4, v0 - 4, 4, 4); b.fillRect(u0, v0, 4, 4);
      for (const g of this.gates) { const p = this.tr.pointAt(g.prog), [u, v] = this.mm(p.x, p.z); b.fillStyle = '#ffd32a'; b.beginPath(); b.arc(u, v, 4, 0, TAU); b.fill(); }
    }
    x.clearRect(0, 0, W, H); x.drawImage(this.miniBg, 0, 0);
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      const [u, v] = this.mm(r.x, r.z); x.fillStyle = r.info.color || '#aaa'; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(u, v, r.k === this.followK && this.spectate ? 6 : 4, 0, TAU); x.fill(); x.stroke();
    }
    if (this.me) {
      const [u, v] = this.mm(this.me.x, this.me.z);
      x.save(); x.translate(u, v); x.rotate(-this.me.h); // 앞 방향 삼각형
      x.fillStyle = this.opts.me.color || '#ff5fa2'; x.strokeStyle = '#1d2140'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(0, -9); x.lineTo(7, 7); x.lineTo(-7, 7); x.closePath(); x.fill(); x.stroke(); x.restore();
    }
  }
  adapt(dt) {
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT < 2) return;
    const fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; this.fps = fps;
    if (fps < 28 && this.pr > 0.6) { this.pr = Math.max(0.6, +(this.pr - 0.2).toFixed(2)); this.renderer.setPixelRatio(this.pr); this.resize(); }
    else if (fps > 55 && this.pr < this.maxPR && ++this.lowCount > 3) { this.lowCount = 0; this.pr = Math.min(this.maxPR, +(this.pr + 0.1).toFixed(2)); this.renderer.setPixelRatio(this.pr); this.resize(); }
  }
  resize() {
    if (this.failed) return;
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const ms = Math.round(Math.min(220, Math.max(120, Math.min(w, h) * (this.spectate ? 0.34 : 0.28))));
    if (this.mini.width !== ms) { this.mini.width = ms; this.mini.height = ms; this.mini.style.width = ms + 'px'; this.mini.style.height = ms + 'px'; this.miniBg = null; }
  }
  destroy() {
    if (globalThis.__lastRace === this) globalThis.__lastRace = null;
    this.dead = true; cancelAnimationFrame(this.raf); this.ro?.disconnect();
    if (this.renderer) {
      this.scene.traverse(o => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m?.map?.dispose?.(); m?.dispose?.(); } });
      this.renderer.dispose(); this.renderer.forceContextLoss?.();
    }
    this.dom.remove();
  }
}

function fallbackBanana() {
  const y = lam(0xffd93a, { flatShading: true }), b = lam(0x7a5230);
  return mergeParts([
    { geometry: geo(new THREE.TorusGeometry(0.32, 0.11, 6, 10, Math.PI * 1.1), 0, 0.42, 0, 0, 0, -0.2), material: y },
    { geometry: geo(new THREE.TorusGeometry(0.3, 0.1, 6, 10, Math.PI * 1.0), 0.05, 0.4, 0.12, 0.5, 0.6, -0.3), material: y },
    { geometry: geo(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 5), -0.3, 0.55, 0), material: b },
  ]);
}
