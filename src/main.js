import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Cat, BASE } from './cat.js';
import { POSES, poseOf, both } from './poses.js';
import { CatAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

// ---------- Сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9dccd);
scene.fog = new THREE.Fog(0xe9dccd, 28, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
camera.position.set(6.2, 3.8, 8.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(innerWidth > 700 ? -0.8 : 0, 1.3, innerWidth > 700 ? 1.2 : 0.8);
controls.enableDamping = true;
controls.minDistance = 3.5; controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enablePan = false;

scene.add(new THREE.HemisphereLight(0xfff1e2, 0x6a5848, 1.25));
const key = new THREE.DirectionalLight(0xffe0bd, 2.6);
key.position.set(6, 10, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0xcfdcff, 2.2);
rim.position.set(-6, 6, -8);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd6c2, 0.6);
fill.position.set(-8, 3, 6);
scene.add(fill);

// пол и пушистый коврик (как на фото)
const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0xcdb8a3, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
{
  const rugGeo = new THREE.CylinderGeometry(8.5, 8.6, 0.12, 96, 1);
  // текстура пушистого ковра (рисуем ворсинки на canvas)
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#b9a39d'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, a = Math.random() * 6.28, l = 6 + Math.random() * 14;
    const v = 170 + Math.random() * 70;
    g.strokeStyle = `rgba(${v + 18},${v - 4},${v - 10},${0.35 + Math.random() * 0.4})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); tex.anisotropy = 8;
  const bump = new THREE.CanvasTexture(cv); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(3, 3);
  const rugMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 3, roughness: 1 });
  const rug = new THREE.Mesh(rugGeo, rugMat); rug.position.y = 0.06; rug.receiveShadow = true; scene.add(rug);
}

// ---------- Кошка ----------
const cat = new Cat();
scene.add(cat.root);
const P = poseOf(params.get('pose') || 'stand');
let poseName = params.get('pose') || 'stand';
const audio = new CatAudio();

// ---------- Предметы ----------
function makeSock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d8f96, roughness: 1 });
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 6, 14), mat);
  leg.rotation.z = Math.PI / 2; leg.scale.set(1, 1, 0.55); g.add(leg);
  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 14), mat);
  foot.scale.set(1, 1, 0.55); foot.position.set(0.6, 0, 0.35); foot.rotation.x = Math.PI / 2; g.add(foot);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: 0x6d6f75, roughness: 1 }));
  cuff.rotation.y = Math.PI / 2; cuff.position.x = -0.6; cuff.scale.set(1, 1, 0.6); g.add(cuff);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function makeMouse() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf08bb0, roughness: 0.9 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), mat); b.scale.set(0.8, 0.7, 1.2); b.position.y = 0.2; g.add(b);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9fdc9a, roughness: 0.9 }));
    e.scale.set(1, 1, 0.4); e.position.set(0.13 * s, 0.42, 0.18); g.add(e);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20, Math.PI), mat);
  tail.position.set(0, 0.15, -0.6); tail.rotation.y = Math.PI / 2; g.add(tail);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
let prop = null;
function setProp(obj, pos) {
  if (prop) scene.remove(prop);
  prop = obj;
  if (obj) { obj.position.copy(pos); scene.add(obj); }
}

// лазерная точка
const laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }));
laserDot.rotation.x = -Math.PI / 2;
const laserGlow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
laserGlow.position.z = 0.002; laserDot.add(laserGlow);
laserDot.visible = false; scene.add(laserDot);

// ---------- Эмоции (всплывающие надписи) ----------
const emoteLayer = $('#emotes');
function emote(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'emote ' + cls; el.textContent = text;
  const off = (Math.random() - 0.5) * 60;
  el.dataset.off = off; el.dataset.t0 = performance.now();
  emoteLayer.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
const _v = new THREE.Vector3();
function updateEmotes() {
  cat.head.getWorldPosition(_v); _v.y += 0.9; _v.project(camera);
  const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
  for (const el of emoteLayer.children) {
    const t = (performance.now() - el.dataset.t0) / 1000;
    el.style.transform = `translate(${x + +el.dataset.off - 20}px, ${y - t * 50}px)`;
    el.style.opacity = String(Math.max(0, 1 - Math.max(0, t - 1.2) / 0.9));
  }
}

// ---------- Мозг ----------
const brain = {
  action: null,       // { steps, i, t, name }
  walkTarget: null,
  walkSpeed: 0, phase: 0,
  yaw: 0, pos: new THREE.Vector3(),
  look: { yaw: 0, pitch: 0, target: new THREE.Vector3(), mode: 'camera', lastMouse: -1e9 },
  blink: 0, nextBlink: 2,
  petting: null, purrUntil: 0,
  idle: 0, nextAuto: 10,
  laser: false, laserState: 'watch', laserStill: 0, laserPrev: new THREE.Vector3(), jump: null,
  extraLook: null,
};

function setPose(name) {
  if (!POSES[name]) return;
  poseName = name;
  brain.idle = 0;
  updateUI();
}

// действие: список шагов {d, set, add, fn(t, P), rate, enter()}
function play(name, steps, opts = {}) {
  brain.action = { name, steps, i: -1, t: 0, ...opts };
  nextStep();
  brain.idle = 0;
}
function nextStep() {
  const a = brain.action;
  a.i++; a.t = 0;
  if (a.i >= a.steps.length) { const done = a.onDone; brain.action = null; done && done(); return; }
  const s = a.steps[a.i];
  s.enter && s.enter();
  if (s.emote) emote(s.emote, s.emoteCls);
  if (s.sound === 'meow') audio.meow(s.kind);
  if (s.pose) setPose(s.pose);
}
function needPose(names, steps) {
  // если поза не та — сначала перейти в нужную
  if (names.includes(poseName)) return steps;
  return [{ d: 1.4, pose: names[0] }, ...steps];
}

const R = (a, b) => a + Math.random() * (b - a);
const ACTIONS = {
  yawn: () => play('yawn', [
    { d: 0.5, add: { headPitch: -0.2 }, set: { jaw: 0.35, lidUp: 0.6, earBack: 0.4 } },
    { d: 1.2, add: { headPitch: -0.38, neckPitch: -0.1 }, set: { jaw: 1, lidUp: 1, lidLow: 0.6, earBack: 0.9, tongueUp: 0.6, whisk: 0.5 }, rate: 6 },
    { d: 0.35, set: { jaw: 0.1, lidUp: 0.6 }, rate: 8 },
    { d: 0.45, set: { tongue: 0.25, tongueUp: 0.7, lidUp: 0.45 } },
    { d: 0.4, set: { lidUp: 0.3 } },
  ]),
  meow: () => play('meow', [
    { d: 0.15, add: { headPitch: -0.12 } },
    { d: 0.55, add: { headPitch: -0.2 }, set: { jaw: 0.55, lidUp: 0.15, pupil: 0.7 }, sound: 'meow', emote: 'мяу!', rate: 10 },
    { d: 0.4, set: { jaw: 0 } },
  ]),
  blep: () => play('blep', [
    { d: 0.3, set: { tongue: 0.12 } },
    { d: 4.0, set: { tongue: 0.42, lidUp: 0.3 }, emote: 'блеп' },
    { d: 0.4, set: { tongue: 0 } },
  ]),
  sniff: () => {
    const fw = forward();
    const at = brain.pos.clone().add(fw.multiplyScalar(poseName === 'sit' ? 2.5 : 3.0)); at.y = 0.15;
    const sock = makeSock(); sock.rotation.y = R(0, Math.PI * 2);
    play('sniff', needPose(['stand', 'sit'], [
      { d: 0.8, enter: () => { setProp(sock, at); brain.extraLook = at.clone().setY(0.25); }, set: { pupil: 0.8 }, emote: '?' },
      { d: 1.4, fn: (t, p) => { p.whisk = 0.6; p.headPitch += Math.sin(t * 38) * 0.03; p.neckPitch += 0.15; }, emote: 'нюх-нюх' },
      { d: 0.5, enter: () => { brain.extraLook = null; }, add: { headPitch: -0.3, neckPitch: -0.1 }, set: { jaw: 0.24, lidUp: 0.5, whisk: 0.3, earBack: 0.3 } },
      { d: 2.2, add: { headPitch: -0.32, neckPitch: -0.1 }, set: { jaw: 0.27, lidUp: 0.6, lidLow: 0.3, whisk: 0.35, earBack: 0.35, pupil: 0.5 }, emote: '😮' },
      { d: 0.5, set: { jaw: 0, tongue: 0.25, tongueUp: 0.7 } },
      { d: 0.4, enter: () => setTimeout(() => setProp(null), 2500) },
    ]));
  },
  wash: () => play('wash', needPose(['sit'], [
    { d: 0.8, set: { flat: 0, flS_R: -0.8, flE_R: -1.7, flW_R: -0.7, flP_R: 0.4 }, add: { headPitch: 0.35, headYaw: -0.3, headRoll: 0.2 }, rate: 5 },
    { d: 2.2, fn: (t, p) => { Object.assign(p, { flat: 0, flS_R: -0.8, flE_R: -1.7, flW_R: -0.7 }); p.headPitch += 0.35 + Math.sin(t * 11) * 0.06; p.headYaw -= 0.3; p.headRoll += 0.2; p.tongue = 0.3 + Math.sin(t * 11) * 0.15; p.tongueUp = 0.3; p.lidUp = 0.6; } },
    { d: 2.0, fn: (t, p) => { const w = Math.sin(t * 5); Object.assign(p, { flat: 0, flS_R: -1.15 + w * 0.15, flE_R: -1.9 + w * 0.2, flW_R: -0.9 }); p.headPitch += 0.15; p.headYaw -= 0.35 + w * 0.1; p.headRoll += 0.45 + w * 0.15; p.lidUp = 0.85; p.earBack = 0.3; } },
    { d: 0.8, set: { flat: 1 } },
  ])),
  stretch: () => play('stretch', needPose(['stand'], [
    { d: 1.6, set: { torsoY: 1.42, pitch: 0.42, torsoZ: -0.25, flS: -1.15, flE: 0.1, flW: 0.15, blH: -0.25, blK: 0.85, blA: -0.85, tailPitch: 0.2, lidUp: 0.85, jaw: 0.25, neckPitch: -0.75, headPitch: 0.35, earBack: 0.3 }, rate: 3 },
    { d: 1.0, set: { lidUp: 0.6 } },
    { d: 1.4, set: { torsoY: 1.65, pitch: -0.18, blH: 0.25, blK: 0.7, blA: -0.6, blH_L: -0.2, blK_L: 0.9, blA_L: -1.1, lidUp: 0.6 }, rate: 3 },
    { d: 0.5 },
  ].map(fixBoth))),
  boop: () => { audio.boop(); play('boop', [
    { d: 0.14, set: { lidUp: 1, lidLow: 0.7, earBack: 0.3 }, add: { headPitch: -0.14 }, emote: 'буп!', emoteCls: 'big', rate: 25 },
    { d: 0.3, set: { whisk: 0.4, pupil: 0.8 }, add: { headPitch: -0.06 } },
    { d: 0.45, set: { tongue: 0.25, tongueUp: 0.75 } },
  ]); },
  tail: () => { audio.hiss(); play('tail', [
    { d: 1.0, set: { tailWave: 0.7, tailWaveSpeed: 5, earBack: 1, lidUp: 0.35, pupil: 0.15 }, emote: 'не трогай хвост!', rate: 8 },
    { d: 0.5, set: { earBack: 0.4 } },
  ]); },
  trap: () => play('trap', [
    { d: 2.2, fn: (t, p) => {
      Object.assign(p, both({ flS: -0.25, flE: 2.3, flW: 0.9, flZ: -0.1 }));
      const k = Math.sin(t * 20);
      p.blH_L = -0.95 + k * 0.4; p.blH_R = -0.95 - k * 0.4; p.blK_L = 1.3 - k * 0.4; p.blK_R = 1.3 + k * 0.4;
      p.jaw = 0.3; p.earBack = 1; p.pupil = 0.95; p.headPitch -= 0.2;
    }, emote: 'попался!', rate: 14 },
    { d: 0.6 },
  ]),
};
function fixBoth(s) { if (s.set) s.set = both(s.set); return s; }

function forward() { return new THREE.Vector3(Math.sin(brain.yaw), 0, Math.cos(brain.yaw)); }

// ---------- Ввод ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDown = null;
function setMouse(e) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
}
function pickCat() {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(cat.parts, false)[0];
  return hit ? hit : null;
}
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12);
function floorPoint() {
  raycaster.setFromCamera(mouse, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(floorPlane, p) ? p : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.ensure();
  setMouse(e);
  if (brain.laser) return;
  const hit = pickCat();
  if (hit) {
    controls.enabled = false;
    pointerDown = { part: hit.object.userData.part, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
    renderer.domElement.setPointerCapture(e.pointerId);
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  setMouse(e);
  brain.look.lastMouse = performance.now();
  if (brain.laser) {
    const p = floorPoint();
    if (p && p.length() < 8.3) { laserDot.visible = true; laserDot.position.set(p.x, 0.125, p.z); }
    else laserDot.visible = false;
  }
  if (pointerDown) {
    const dx = e.clientX - pointerDown.x, dy = e.clientY - pointerDown.y;
    pointerDown.moved += Math.hypot(e.movementX || 0, e.movementY || 0);
    if (pointerDown.moved > 12 && !brain.petting && !['tail', 'nose'].includes(pointerDown.part)) startPet(pointerDown.part);
    if (brain.petting) brain.petting.dx = THREE.MathUtils.clamp(dx / 200, -1, 1);
  }
});
function endPointer() {
  controls.enabled = true;
  if (!pointerDown) return;
  const pd = pointerDown; pointerDown = null;
  if (brain.petting) { stopPet(); return; }
  if (pd.moved < 12) clickPart(pd.part);
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);

function clickPart(part) {
  if (brain.jump) return;
  if (part === 'nose') return ACTIONS.boop();
  if (part === 'tail') return ACTIONS.tail();
  if (poseName === 'back' && (part === 'body' || part === 'paw')) return ACTIONS.trap();
  if (poseName === 'sleep') { setPose('side'); emote('м?'); return; }
  if (part === 'head') { emote('мр?'); audio.meow('chirp'); return play('chirp', [{ d: 0.3, set: { jaw: 0.25, lidUp: 0.3 }, add: { headRoll: 0.25 } }, { d: 0.4, add: { headRoll: 0.2 } }]); }
  if (part === 'paw') { emote('🐾'); return play('paw', [{ d: 0.6, set: { flP_L: 0.6, pupil: 0.8 } }]); }
  startPet(part); setTimeout(stopPet, 1500);
}
function startPet(part) {
  brain.petting = { part, t: 0, dx: 0, heart: 0 };
  brain.action = null;
  if (poseName === 'sleep') setPose('side');
  audio.ensure(); audio.purr(true);
}
function stopPet() {
  if (!brain.petting) return;
  brain.petting = null;
  brain.purrUntil = performance.now() + 2500;
}

// ---------- UI ----------
document.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => { audio.ensure(); stopLaser(); brain.action = null; brain.walkTarget = null; setPose(b.dataset.pose); }));
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { audio.ensure(); stopLaser(); if (brain.jump) return; ACTIONS[b.dataset.act](); }));
$('#laser').addEventListener('click', () => { audio.ensure(); brain.laser ? stopLaser() : startLaser(); });
$('#toy').addEventListener('click', () => { audio.ensure(); throwToy(); });
$('#mute').addEventListener('change', (e) => audio.setMuted(!e.target.checked));
$('#fur').addEventListener('change', (e) => cat.setFur(e.target.checked));
$('#life').addEventListener('change', (e) => { brain.life = e.target.checked; });
brain.life = true;
$('#collar').addEventListener('change', (e) => cat.setCollar(e.target.value === 'none' ? null : e.target.value));
cat.setCollar('#e8679f');
const nameEl = $('#catName');
try { const n = localStorage.getItem('catName'); if (n) nameEl.textContent = n; } catch {}
nameEl.addEventListener('input', () => { try { localStorage.setItem('catName', nameEl.textContent.trim()); } catch {} });
$('#panelToggle').addEventListener('click', () => document.body.classList.toggle('panel-hidden'));

function updateUI() {
  document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === poseName));
  $('#laser').classList.toggle('on', brain.laser);
  document.body.classList.toggle('laser-on', brain.laser);
}
function startLaser() {
  brain.laser = true; brain.laserState = 'watch'; brain.action = null;
  if (poseName !== 'stand' && poseName !== 'sit') setPose('stand');
  updateUI(); emote('!!', 'big');
}
function stopLaser() {
  if (!brain.laser) return;
  brain.laser = false; laserDot.visible = false; brain.walkTarget = null; brain.crouch = 0;
  updateUI();
}
function throwToy() {
  stopLaser();
  const a = R(0, Math.PI * 2), r = R(3, 6.5);
  const p = new THREE.Vector3(Math.cos(a) * r, 0.2, Math.sin(a) * r);
  const toy = makeMouse(); toy.rotation.y = R(0, 6);
  setProp(toy, p);
  emote('!', 'big');
  if (poseName !== 'stand') setPose('stand');
  brain.action = null;
  brain.toyChase = { p, t: 0 };
}

// ---------- Обновление ----------
const clock = new THREE.Clock();
const T = { ...P };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let elapsed = 0;

function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function update(dt) {
  elapsed += dt;
  const now = performance.now();
  brain.idle += dt;

  // --- цель позы ---
  Object.assign(T, BASE, POSES[poseName]);
  let rate = 3.2;
  const a = brain.action;
  if (a) {
    const s = a.steps[a.i];
    if (s.set) Object.assign(T, s.set);
    if (s.add) for (const k in s.add) T[k] += s.add[k];
    if (s.fn) s.fn(a.t, T);
    if (s.rate) rate = s.rate;
    a.t += dt;
    if (a.t >= s.d) nextStep();
    brain.idle = 0;
  }

  // --- прогулка к цели / игрушке / лазеру ---
  let moving = 0;
  const toy = brain.toyChase;
  if (toy) {
    toy.t += dt;
    const d = tmp.copy(toy.p).sub(brain.pos).setY(0);
    const dist = d.length();
    if (dist > 2.6) brain.walkTarget = toy.p.clone();
    else {
      brain.walkTarget = null;
      brain.toyChase = null;
      brain.extraLook = toy.p.clone().setY(0.3);
      play('toy', [
        { d: 0.9, set: { pupil: 0.95 }, fn: (t, p) => { p.pelvisRoll = Math.sin(t * 18) * 0.12; p.torsoY = 1.35; p.pitch = 0.12; }, emote: 'вжух…' },
        { d: 0.35, enter: () => { emote('цап!', 'big'); }, set: { flS: -1.1, flE: -0.2, jaw: 0.5, earBack: 0.3 }, rate: 14 },
        { d: 1.6, set: { jaw: 0, lidUp: 0.3 }, fn: (t, p) => { p.headPitch += 0.2; } },
      ].map(fixBoth), { onDone: () => { brain.extraLook = null; setTimeout(() => setProp(null), 1500); } });
    }
  }
  if (brain.laser) laserLogic(dt);
  if (brain.walkTarget && poseName === 'stand' && !brain.jump) {
    const d = tmp.copy(brain.walkTarget).sub(brain.pos).setY(0);
    const dist = d.length();
    const want = Math.atan2(d.x, d.z);
    const diff = angDiff(brain.yaw, want);
    brain.yaw += THREE.MathUtils.clamp(diff, -2.8 * dt, 2.8 * dt);
    const stopDist = brain.laser ? 2.2 : toy ? 2.4 : 0.3;
    if (dist > stopDist) {
      const sp = (Math.abs(diff) < 0.8 ? 1 : 0.35) * (brain.laser ? 2.6 : 1.9);
      moving = Math.min(1, (dist - stopDist) * 2 + 0.3);
      brain.pos.addScaledVector(forward(), sp * moving * dt);
    } else if (Math.abs(diff) < 0.1 && !brain.laser) brain.walkTarget = null;
    else moving = Math.abs(diff) > 0.15 ? 0.4 : 0;
    brain.idle = 0;
  } else if (brain.walkTarget && poseName !== 'stand' && !brain.jump) {
    if (!a) setPose('stand');
  }
  // ограничение по коврику
  if (brain.pos.length() > 6.8) brain.pos.setLength(6.8);
  brain.walkSpeed = damp(brain.walkSpeed, moving, 6, dt);

  // --- прыжок ---
  if (brain.jump) {
    const j = brain.jump; j.t += dt;
    const k = Math.min(1, j.t / j.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    brain.pos.lerpVectors(j.from, j.to, e);
    T.rootY = Math.sin(k * Math.PI) * 1.1;
    Object.assign(T, both({ flS: -1.3 + k * 0.8, flE: -0.2, blH: 0.6, blK: 0.4, blA: -0.3 }));
    T.pitch = -0.25 + k * 0.4; T.tailPitch = 0.1; T.pupil = 1; T.earBack = 0.4;
    rate = 14;
    if (k >= 1) { brain.jump = null; emote(['цап!', 'поймала!', '???'][Math.floor(R(0, 3))], 'big'); brain.laserState = 'land'; brain.landT = 0; }
  }

  // --- поглаживание ---
  if (brain.petting) {
    const pt = brain.petting; pt.t += dt; pt.heart -= dt;
    T.lidUp = Math.max(T.lidUp, 0.72); T.lidLow = Math.max(T.lidLow, 0.3);
    T.earBack = 0.25; T.pupil = 0.3; T.look = 0.2;
    if (pt.part === 'head') { T.headRoll += pt.dx * 0.35 + Math.sin(pt.t * 2) * 0.08; T.headPitch -= 0.12; T.neckYaw += pt.dx * 0.2; }
    else if (poseName === 'stand') { T.tailPitch += 1.2; T.tailBendX = -0.04; T.chestBend -= 0.08; T.pelvisBend += 0.1; T.torsoY += 0.08; }
    else { T.tailWave = 0.05; }
    if (pt.heart <= 0) { emote(Math.random() < 0.7 ? '❤' : 'мурр', 'heart'); pt.heart = R(0.5, 0.9); }
    brain.idle = 0;
  } else if (brain.purrUntil && now > brain.purrUntil) { audio.purr(false); brain.purrUntil = 0; }

  // --- сглаживание ---
  for (const k in T) {
    if (k === 'rootY' && brain.jump) { P[k] = T[k]; continue; }
    P[k] = damp(P[k], T[k], rate, dt);
  }

  // --- ходьба (аддитивно) ---
  const Q = { ...P };
  const ws = brain.walkSpeed;
  if (ws > 0.01) {
    brain.phase += dt * (5.5 + 3 * ws) * Math.max(0.35, ws);
    const ph = brain.phase;
    const legs = [['L', 0], ['R', Math.PI]];
    for (const [s, o] of legs) {
      const f = ph + o, b = ph + o + Math.PI + 0.6;
      Q['flS_' + s] += 0.45 * Math.sin(f) * ws;
      Q['flE_' + s] += 0.9 * Math.max(0, -Math.cos(f)) * ws;
      Q['flW_' + s] += 0.6 * Math.max(0, -Math.cos(f)) * ws;
      Q['blH_' + s] += 0.4 * Math.sin(b) * ws;
      Q['blK_' + s] += 0.55 * Math.max(0, -Math.cos(b)) * ws;
      Q['blA_' + s] -= 0.35 * Math.max(0, -Math.cos(b)) * ws;
    }
    Q.torsoY += Math.sin(ph * 2) * 0.03 * ws;
    Q.chestRoll += Math.sin(ph) * 0.04 * ws;
    Q.pelvisRoll -= Math.sin(ph) * 0.05 * ws;
    Q.headPitch -= Math.sin(ph * 2) * 0.03 * ws;
    Q.tailWave = Math.max(Q.tailWave, 0.2 * ws);
  }

  // --- дыхание ---
  const br = Math.sin(elapsed * (poseName === 'sleep' ? 1.6 : 2.4));
  cat.breath = br * 0.018;
  if (poseName === 'back' && !a) Q.roll += Math.sin(elapsed * 0.9) * 0.12;
  if (brain.petting || (brain.purrUntil && now < brain.purrUntil)) Q.torsoY += Math.sin(elapsed * 160) * 0.002;

  // --- моргание ---
  brain.nextBlink -= dt;
  if (brain.nextBlink < 0) { brain.blink = 1; brain.nextBlink = R(2.5, 6.5); if (Math.random() < 0.2) brain.nextBlink = 0.25; }
  brain.blink = Math.max(0, brain.blink - dt * 7);
  const bl = brain.blink > 0 ? Math.sin(brain.blink * Math.PI) : 0;
  Q.lidUp = Math.max(Q.lidUp, bl); Q.lidLow = Math.max(Q.lidLow, bl * 0.6);

  // --- взгляд ---
  lookLogic(Q, dt);

  // корень
  cat.root.position.set(brain.pos.x, 0, brain.pos.z);
  cat.root.rotation.y = brain.yaw;
  cat.apply(Q, elapsed);

  // засыпание: Zzz
  if (poseName === 'sleep') {
    brain.zzz = (brain.zzz || 0) - dt;
    if (brain.zzz < 0) { emote('Z z z', 'zzz'); brain.zzz = 2.6; }
  }

  autonomy(dt);
}

function lookLogic(Q, dt) {
  const L = brain.look;
  let target = null;
  if (brain.extraLook) target = brain.extraLook;
  else if (brain.laser && laserDot.visible) target = laserDot.position;
  else if (brain.toyChase) target = brain.toyChase.p;
  else if (performance.now() - L.lastMouse < 3500) {
    raycaster.setFromCamera(mouse, camera);
    cat.head.getWorldPosition(tmp2);
    const dist = camera.position.distanceTo(tmp2);
    target = raycaster.ray.at(dist * 0.85, tmp);
  } else target = camera.position;
  let yaw = 0, pitch = 0;
  const w = Q.look;
  if (target && w > 0) {
    cat.head.getWorldPosition(tmp2);
    const d = tmp.copy(target).sub(tmp2);
    // в системе координат кошки
    const c = Math.cos(-brain.yaw), s = Math.sin(-brain.yaw);
    const lx = d.x * c + d.z * s, lz = -d.x * s + d.z * c;
    yaw = Math.atan2(lx, lz);
    pitch = Math.atan2(d.y, Math.hypot(lx, lz));
    if (Math.abs(yaw) > 2.0) yaw = Math.sign(yaw) * 2.0; // не выворачивать шею
    yaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25);
    pitch = THREE.MathUtils.clamp(pitch, -0.9, 0.7);
  }
  L.yaw = damp(L.yaw, yaw * w, 4, dt);
  L.pitch = damp(L.pitch, pitch * w, 4, dt);
  Q.headYaw += L.yaw * 0.55; Q.neckYaw += L.yaw * 0.4;
  Q.headPitch -= L.pitch * 0.55; Q.neckPitch -= L.pitch * 0.35;
  // поворот туловища, если смотрит далеко вбок
  Q.chestYaw += L.yaw * 0.12;
  for (const e of cat.eyes) {
    e.rotation.y = THREE.MathUtils.clamp(L.yaw * 0.3, -0.3, 0.3);
    e.rotation.x = THREE.MathUtils.clamp(-L.pitch * 0.3, -0.25, 0.25);
  }
}

function laserLogic(dt) {
  if (brain.jump) return;
  const dot = laserDot.position;
  if (!laserDot.visible) { brain.walkTarget = null; brain.crouch = 0; return; }
  const moved = dot.distanceTo(brain.laserPrev);
  brain.laserPrev.copy(dot);
  brain.laserStill = moved < 0.02 ? brain.laserStill + dt : 0;
  if (moved > 0.02) T.pupil = 1;
  T.pupil = Math.max(T.pupil, 0.85);
  const d = tmp.copy(dot).sub(brain.pos).setY(0);
  const dist = d.length();
  if (brain.laserState === 'land') {
    brain.landT += dt;
    T.headPitch += 0.5; T.neckPitch += 0.3; T.flS_L -= 0.3;
    if (brain.landT > 1.2) brain.laserState = 'watch';
    return;
  }
  if (poseName !== 'stand') { setPose('stand'); }
  const want = Math.atan2(d.x, d.z);
  const diff = angDiff(brain.yaw, want);
  if (dist > 4.6) { brain.walkTarget = dot.clone(); brain.crouch = 0; brain.laserState = 'watch'; return; }
  brain.walkTarget = null;
  // повернуться к точке
  brain.yaw += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
  if (Math.abs(diff) > 0.4) { brain.walkSpeed = Math.max(brain.walkSpeed, 0.3); return; }
  // присесть и вилять попой
  brain.crouch = Math.min(1, (brain.crouch || 0) + dt * 2);
  const c = brain.crouch;
  T.torsoY -= 0.55 * c; T.pitch += 0.08 * c;
  Object.assign(T, both({ flS: 0.2 - 0.9 * c, flE: -0.3 + 1.6 * c, flW: 0.1 - 0.5 * c, blH: -0.45 - 0.7 * c, blK: 1.1 + 0.9 * c, blA: -0.95 - 0.6 * c }));
  T.earBack = 0.2 * c; T.tailPitch = -0.15; T.tailWave = 0.35; T.tailWaveSpeed = 3;
  T.pelvisRoll = Math.sin(elapsed * 16) * 0.14 * (brain.laserStill > 0.3 ? 1 : 0.3);
  if (brain.laserStill > 0.75 && dist > 1.6 && c > 0.9) {
    const to = dot.clone().setY(0).sub(forward().multiplyScalar(1.7));
    brain.jump = { from: brain.pos.clone(), to, t: 0, dur: 0.5 };
    brain.crouch = 0; brain.laserStill = -1;
  }
}

function autonomy(dt) {
  if (!brain.life || brain.action || brain.petting || brain.laser || brain.walkTarget || brain.toyChase || brain.jump) return;
  if (brain.idle < brain.nextAuto) return;
  brain.idle = 0;
  brain.nextAuto = R(7, 14);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const options = {
    stand: ['sit', 'loaf', 'walk', 'walk', 'stretch', 'yawn', 'meow', 'sphinx'],
    sit: ['wash', 'yawn', 'loaf', 'stand', 'blep', 'meow', 'walk'],
    loaf: ['blep', 'yawn', 'sphinx', 'side', 'stand', 'loaf'],
    sphinx: ['yawn', 'loaf', 'side', 'stand', 'blep'],
    side: ['sleep', 'sleep', 'back', 'loaf', 'yawn'],
    sleep: ['sleep', 'sleep', 'side'],
    back: ['side', 'yawn', 'back', 'loaf'],
  }[poseName] || ['stand'];
  const o = pick(options);
  if (POSES[o]) { if (o === poseName && o === 'sleep') brain.nextAuto = 20; setPose(o); }
  else if (o === 'walk') {
    const a = R(0, Math.PI * 2), r = R(0, 5);
    if (poseName !== 'stand') setPose('stand');
    brain.walkTarget = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  } else ACTIONS[o]();
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  controls.update();
  renderer.render(scene, camera);
  updateEmotes();
  requestAnimationFrame(loop);
}
updateUI();
if (params.has('cam')) { const c = params.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); }
if (params.has('tgt')) { const c = params.get('tgt').split(',').map(Number); controls.target.set(c[0], c[1], c[2]); }
if (params.has('nolife')) { brain.life = false; $('#life').checked = false; }
loop();
$('#loading')?.remove();

window.app = { cat, P, brain, setPose, ACTIONS, camera, controls, POSES };
