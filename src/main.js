import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Cat, BASE } from './cat.js';
import { POSES, poseOf, both } from './poses.js';
import { CatAudio } from './audio.js';
import { Legs } from './legs.js';
import { t, getLang, setLang, applyI18n, store } from './i18n.js';

const $ = (s) => document.querySelector(s);
// `?debug` keeps the drawing buffer (for screenshots) and exposes `window.app` for tinkering in the console.
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: DEBUG });
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

// floor and a fluffy shag rug (like the one in the photos)
const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0xcdb8a3, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
{
  const rugGeo = new THREE.CylinderGeometry(8.5, 8.6, 0.12, 96, 1);
  // rug texture: short curly strokes drawn on a canvas
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

// ---------- Cat ----------
const cat = new Cat();
scene.add(cat.root);
const legs = new Legs(cat);

// soft contact shadow that grounds the cat on the rug
const contact = (() => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: 0.6 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.15, 1.0, d); gl_FragColor = vec4(0.09, 0.06, 0.04, a * uOpacity); }',
  }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  scene.add(m);
  return m;
})();
const _cp = new THREE.Vector3(), _cc = new THREE.Vector3(), _ch = new THREE.Vector3();
function updateContact() {
  cat.pelvis.getWorldPosition(_cp); cat.chest.getWorldPosition(_cc); cat.head.getWorldPosition(_ch);
  const cx = (_cp.x + _cc.x * 2 + _ch.x) / 4, cz = (_cp.z + _cc.z * 2 + _ch.z) / 4;
  const dx = _ch.x - _cp.x, dz = _ch.z - _cp.z;
  const len = Math.hypot(dx, dz) + 1.6;
  const lying = Math.min(1, Math.abs(P.roll) / 1.4);
  const lift = Math.max(0, P.rootY);
  contact.position.set(cx, 0.13, cz);
  contact.rotation.z = Math.atan2(dx, dz);
  contact.scale.set((2.4 + lying * 1.2) * (1 + lift * 0.3), len * 1.35, 1);
  contact.material.uniforms.uOpacity.value = 0.7 * Math.max(0, 1 - lift * 0.8);
}
const P = poseOf('stand');
let poseName = 'stand';
const audio = new CatAudio();

// ---------- Props ----------
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

// laser pointer dot
const laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }));
laserDot.rotation.x = -Math.PI / 2;
const laserGlow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
laserGlow.position.z = 0.002; laserDot.add(laserGlow);
laserDot.visible = false; scene.add(laserDot);

// ---------- Emotes (floating speech bubbles) ----------
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

// ---------- Behaviour ----------
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
  goal: 'stand', path: [], hopT: 0,          // pose transitions
  eye: { yaw: 0, pitch: 0, sy: 0, sp: 0, next: 0.5 }, // saccades
  slowBlink: 0, nextSlowBlink: 9,
  earT: 4, tailFlick: 0, nextFlick: 5,
  motion: { speed: 0, dir: new THREE.Vector3(0, 0, 1) }, prevPos: new THREE.Vector3(),
};

// Poses are connected the way a real cat moves between them: to lie down from standing
// she sits first, to get up from her side she rolls onto her chest first, and so on.
const POSE_GRAPH = {
  stand: ['sit', 'sphinx'],
  sit: ['stand', 'loaf', 'sphinx'],
  loaf: ['sit', 'sphinx', 'side'],
  sphinx: ['stand', 'sit', 'loaf', 'side'],
  side: ['sphinx', 'loaf', 'sleep', 'back'],
  sleep: ['side'],
  back: ['side'],
};
function posePath(from, to) {
  const prev = { [from]: null }, queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n === to) break;
    for (const m of POSE_GRAPH[n] || []) if (!(m in prev)) { prev[m] = n; queue.push(m); }
  }
  const path = [];
  for (let n = to; n && n !== from; n = prev[n]) path.unshift(n);
  return path;
}
function setPose(name) {
  if (!POSES[name]) return;
  brain.idle = 0;
  if (name === brain.goal && (poseName === name || brain.path.length)) return;
  brain.goal = name;
  brain.path = posePath(poseName, name);
  if (brain.path.length) { poseName = brain.path.shift(); brain.hopT = 0; }
  updateUI();
}
const hopsTo = (name) => posePath(brain.goal, name).length + brain.path.length;

// an action is a list of steps: { d, set, add, fn(t, P), rate, enter(), emote, sound, pose }
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
  if (s.emote) emote(t(s.emote), s.emoteCls);
  if (s.sound === 'meow') audio.meow(s.kind);
  if (s.pose) setPose(s.pose);
}
function needPose(names, steps) {
  // switch to a suitable pose first if needed
  if (names.includes(brain.goal) && !brain.path.length) return steps;
  return [{ d: 0.5 + 0.9 * Math.max(1, hopsTo(names[0])), pose: names[0] }, ...steps];
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
    { d: 0.55, add: { headPitch: -0.2 }, set: { jaw: 0.55, lidUp: 0.15, pupil: 0.7 }, sound: 'meow', emote: 'e.meow', rate: 10 },
    { d: 0.4, set: { jaw: 0 } },
  ]),
  blep: () => play('blep', [
    { d: 0.3, set: { tongue: 0.12 } },
    { d: 4.0, set: { tongue: 0.34, lidUp: 0.3 }, emote: 'e.blep' },
    { d: 0.4, set: { tongue: 0 } },
  ]),
  sniff: () => {
    const fw = forward();
    const at = brain.pos.clone().add(fw.multiplyScalar(poseName === 'sit' ? 2.5 : 3.0)); at.y = 0.15;
    const sock = makeSock(); sock.rotation.y = R(0, Math.PI * 2);
    play('sniff', needPose(['stand', 'sit'], [
      { d: 0.8, enter: () => { setProp(sock, at); brain.extraLook = at.clone().setY(0.25); }, set: { pupil: 0.8 }, emote: '?' },
      { d: 1.4, fn: (t, p) => { p.whisk = 0.6; p.headPitch += Math.sin(t * 38) * 0.03; p.neckPitch += 0.15; }, emote: 'e.sniff' },
      { d: 0.5, enter: () => { brain.extraLook = null; }, add: { headPitch: -0.3, neckPitch: -0.1 }, set: { jaw: 0.24, lidUp: 0.5, whisk: 0.3, earBack: 0.3 } },
      { d: 2.2, add: { headPitch: -0.32, neckPitch: -0.1 }, set: { jaw: 0.27, lidUp: 0.6, lidLow: 0.3, whisk: 0.35, earBack: 0.35, pupil: 0.5 }, emote: '😮' },
      { d: 0.5, set: { jaw: 0, tongue: 0.25, tongueUp: 0.7 } },
      { d: 0.4, enter: () => setTimeout(() => setProp(null), 2500) },
    ]));
  },
  wash: () => play('wash', needPose(['sit'], [
    { d: 0.8, set: { ikF_R: 0, flat: 0, flS_R: -1.3, flE_R: -1.25, flW_R: -0.8, flP_R: 0.4 }, add: { headPitch: 0.35, headYaw: -0.3, headRoll: 0.2 }, rate: 5 },
    { d: 2.2, fn: (t, p) => { Object.assign(p, { ikF_R: 0, flat: 0, flS_R: -1.3, flE_R: -1.25, flW_R: -0.8 }); p.headPitch += 0.35 + Math.sin(t * 11) * 0.06; p.headYaw -= 0.3; p.headRoll += 0.2; p.tongue = 0.3 + Math.sin(t * 11) * 0.15; p.tongueUp = 0.3; p.lidUp = 0.6; } },
    { d: 2.0, fn: (t, p) => { const w = Math.sin(t * 5); Object.assign(p, { ikF_R: 0, flat: 0, flS_R: -1.6 + w * 0.15, flE_R: -1.35 + w * 0.2, flW_R: -0.9 }); p.headPitch += 0.15; p.headYaw -= 0.35 + w * 0.1; p.headRoll += 0.45 + w * 0.15; p.lidUp = 0.85; p.earBack = 0.3; } },
    { d: 0.8, set: { flat: 1 } }, // paw goes back down (IK takes over again)
  ])),
  stretch: () => play('stretch', needPose(['stand'], [
    { d: 1.6, set: { fzF: 0.9, fzB: -0.1, torsoY: 1.42, pitch: 0.42, torsoZ: -0.25, flS: -1.15, flE: 0.1, flW: 0.15, blH: -0.25, blK: 0.85, blA: -0.85, tailPitch: 0.2, lidUp: 0.85, jaw: 0.25, neckPitch: -0.75, headPitch: 0.35, earBack: 0.3 }, rate: 3 },
    { d: 1.0, set: { lidUp: 0.6 } },
    { d: 1.4, set: { fzF: 0.2, fzB: -0.35, torsoY: 1.65, pitch: -0.18, blH: 0.25, blK: 0.7, blA: -0.6, blH_L: -0.2, blK_L: 0.9, blA_L: -1.1, lidUp: 0.6 }, rate: 3 },
    { d: 0.5 },
  ].map(fixBoth))),
  boop: () => { audio.boop(); play('boop', [
    { d: 0.14, set: { lidUp: 1, lidLow: 0.7, earBack: 0.3 }, add: { headPitch: -0.14 }, emote: 'e.boop', emoteCls: 'big', rate: 25 },
    { d: 0.3, set: { whisk: 0.4, pupil: 0.8 }, add: { headPitch: -0.06 } },
    { d: 0.45, set: { tongue: 0.25, tongueUp: 0.75 } },
  ]); },
  tail: () => { audio.hiss(); play('tail', [
    { d: 1.0, set: { tailWave: 0.7, tailWaveSpeed: 5, earBack: 1, lidUp: 0.35, pupil: 0.15 }, emote: 'e.tail', rate: 8 },
    { d: 0.5, set: { earBack: 0.4 } },
  ]); },
  trap: () => play('trap', [
    { d: 2.2, fn: (t, p) => {
      Object.assign(p, both({ flS: -0.45, flE: 2.0, flW: 0.9, flZ: -0.1 }));
      const k = Math.sin(t * 20);
      p.blH_L = -0.95 + k * 0.4; p.blH_R = -0.95 - k * 0.4; p.blK_L = 1.3 - k * 0.4; p.blK_R = 1.3 + k * 0.4;
      p.jaw = 0.3; p.earBack = 1; p.pupil = 0.95; p.headPitch -= 0.2;
    }, emote: 'e.trap', rate: 14 },
    { d: 0.6 },
  ]),
};
function fixBoth(s) { if (s.set) s.set = both(s.set); return s; }

function forward() { return new THREE.Vector3(Math.sin(brain.yaw), 0, Math.cos(brain.yaw)); }

// ---------- Input ----------
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
  if (poseName === 'sleep') { setPose('side'); emote(t('e.wake')); return; }
  if (part === 'head') { emote(t('e.chirp')); audio.meow('chirp'); return play('chirp', [{ d: 0.3, set: { jaw: 0.25, lidUp: 0.3 }, add: { headRoll: 0.25 } }, { d: 0.4, add: { headRoll: 0.2 } }]); }
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
// name: a custom one is remembered, otherwise the localized default ("Chernushka")
const nameEl = $('#catName');
const renderName = () => { nameEl.textContent = store.get('catName') || t('defaultName'); };
nameEl.addEventListener('input', () => store.set('catName', nameEl.textContent.trim()));
nameEl.addEventListener('blur', () => { if (!nameEl.textContent.trim()) { store.set('catName', ''); renderName(); } });
// language
const langEl = $('#lang');
langEl.value = getLang();
langEl.addEventListener('change', () => { setLang(langEl.value); renderName(); });
applyI18n();
renderName();
$('#panelToggle').addEventListener('click', () => document.body.classList.toggle('panel-hidden'));

function updateUI() {
  document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === brain.goal));
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

// ---------- Update loop ----------
const clock = new THREE.Clock();
const T = { ...P };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let elapsed = 0;

function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
// critically damped spring (no sudden start, no overshoot); `vel` holds per-key velocities
const VEL = {};
function spring(key, cur, target, smoothTime, dt) {
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, v = VEL[key] || 0;
  const temp = (v + omega * change) * dt;
  VEL[key] = (v - omega * temp) * exp;
  return target + (change + temp) * exp;
}
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function update(dt) {
  elapsed += dt;
  const now = performance.now();
  brain.idle += dt;

  // --- pose transitions: move to the next pose on the path once this one has mostly settled
  brain.hopT += dt;
  if (brain.path.length && brain.hopT > 0.8) { poseName = brain.path.shift(); brain.hopT = 0; }

  // --- target pose (+ current action step) ---
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

  // --- walking to a target / toy / laser ---
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
        { d: 0.9, set: { pupil: 0.95 }, fn: (t, p) => { p.pelvisRoll = Math.sin(t * 18) * 0.12; p.torsoY = 1.35; p.pitch = 0.12; }, emote: 'e.wiggle' },
        { d: 0.35, enter: () => { emote(t('e.pounce'), 'big'); }, set: { ikF: 0, flS: -1.0, flE: -0.6, flW: -0.2, jaw: 0.5, earBack: 0.3 }, rate: 14 },
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
    if (!a && brain.goal !== 'stand') setPose('stand');
  }
  // stay on the rug
  if (brain.pos.length() > 6.8) brain.pos.setLength(6.8);
  brain.walkSpeed = damp(brain.walkSpeed, moving, 6, dt);

  // --- pounce ---
  if (brain.jump) {
    const j = brain.jump; j.t += dt;
    const k = Math.min(1, j.t / j.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    brain.pos.lerpVectors(j.from, j.to, e);
    T.rootY = Math.sin(k * Math.PI) * 1.1;
    Object.assign(T, both({ ikF: 0, ikB: 0, flS: -1.2 + k * 1.2, flE: -0.3 - k * 0.3, flW: 0, blH: 0.5 - k * 0.6, blK: 0.4 + k * 0.8, blA: -0.4 - k * 0.5 }));
    T.pitch = -0.25 + k * 0.4; T.tailPitch = 0.1; T.pupil = 1; T.earBack = 0.4;
    rate = 14;
    if (k >= 1) { brain.jump = null; emote([t('e.pounce'), t('e.caught'), '???'][Math.floor(R(0, 3))], 'big'); brain.laserState = 'land'; brain.landT = 0; }
  }

  // --- petting ---
  if (brain.petting) {
    const pt = brain.petting; pt.t += dt; pt.heart -= dt;
    T.lidUp = Math.max(T.lidUp, 0.72); T.lidLow = Math.max(T.lidLow, 0.3);
    T.earBack = 0.25; T.pupil = 0.3; T.look = 0.2;
    if (pt.part === 'head') { T.headRoll += pt.dx * 0.35 + Math.sin(pt.t * 2) * 0.08; T.headPitch -= 0.12; T.neckYaw += pt.dx * 0.2; }
    else if (poseName === 'stand') { T.tailPitch += 1.2; T.tailBendX = -0.04; T.chestBend -= 0.08; T.pelvisBend += 0.1; T.torsoY += 0.08; }
    else { T.tailWave = 0.05; }
    if (pt.heart <= 0) { emote(Math.random() < 0.7 ? '❤' : t('e.purr'), 'heart'); pt.heart = R(0.5, 0.9); }
    brain.idle = 0;
  } else if (brain.purrUntil && now > brain.purrUntil) { audio.purr(false); brain.purrUntil = 0; }

  // --- smooth towards the target ---
  for (const k in T) {
    if (k === 'rootY' && brain.jump) { P[k] = T[k]; VEL[k] = 0; continue; }
    P[k] = spring(k, P[k], T[k], 1.15 / rate, dt);
  }

  // --- walk cycle (additive) ---
  const Q = { ...P };
  // actual root velocity (drives the gait)
  const M = brain.motion;
  const moved = tmp.copy(brain.pos).sub(brain.prevPos); brain.prevPos.copy(brain.pos);
  const spd = brain.jump ? 0 : moved.length() / Math.max(dt, 1e-4);
  M.speed = damp(M.speed, spd, 10, dt);
  if (spd > 0.05) M.dir.copy(moved).normalize();
  else M.dir.set(Math.sin(brain.yaw), 0, Math.cos(brain.yaw));
  const ws = Math.min(1, M.speed / 1.6);
  if (ws > 0.02) {
    // body rides a little lower when walking, rolls with the steps, head stays steady
    const ph = legs.phase * Math.PI * 2;
    Q.torsoY += -0.05 * ws + Math.sin(ph * 2) * 0.025 * ws;
    Q.chestRoll += Math.sin(ph + 1.6) * 0.035 * ws;
    Q.pelvisRoll += Math.sin(ph) * 0.045 * ws;
    Q.chestYaw += Math.sin(ph + 1.6) * 0.04 * ws;
    Q.headPitch -= Math.sin(ph * 2) * 0.02 * ws;
    Q.neckPitch += 0.12 * ws;
    Q.tailPitch += 0.1 * ws; Q.tailBendX += 0.035 * ws; // relaxed tail with a soft upward curve
    Q.tailWave = Math.max(Q.tailWave, 0.16 * ws);
  }

  // --- idle life: weight shifts, small head movements, ear twitches, tail-tip flicks
  const calm = !brain.petting && !brain.laser && ws < 0.05;
  if (calm && (poseName === 'stand' || poseName === 'sit' || poseName === 'loaf' || poseName === 'sphinx')) {
    Q.pelvisRoll += Math.sin(elapsed * 0.37) * 0.025;
    Q.chestRoll += Math.sin(elapsed * 0.29 + 1.3) * 0.02;
    Q.torsoZ += Math.sin(elapsed * 0.21) * 0.03;
    Q.headYaw += (Math.sin(elapsed * 0.53) + Math.sin(elapsed * 1.31 + 2)) * 0.025;
    Q.headPitch += Math.sin(elapsed * 0.71 + 0.5) * 0.02;
    Q.headRoll += Math.sin(elapsed * 0.43 + 1) * 0.03;
  }
  brain.earT -= dt;
  if (brain.earT < 0) { brain.earT = R(3, 9); brain.earPulse = 1; }
  brain.earPulse = Math.max(0, (brain.earPulse || 0) - dt * 6);
  Q.earBack += Math.sin(brain.earPulse * Math.PI) * 0.35;
  brain.nextFlick -= dt;
  if (brain.nextFlick < 0) { brain.nextFlick = R(4, 11); brain.tailFlick = 1; }
  brain.tailFlick = Math.max(0, brain.tailFlick - dt * 1.2);
  Q.tailWave += brain.tailFlick * 0.25;

  // --- breathing ---
  const br = Math.sin(elapsed * (poseName === 'sleep' ? 1.6 : 2.4));
  cat.breath = br * 0.018;
  if (poseName === 'back' && !a) Q.roll += Math.sin(elapsed * 0.9) * 0.12;
  if (brain.petting || (brain.purrUntil && now < brain.purrUntil)) Q.torsoY += Math.sin(elapsed * 160) * 0.002;

  // --- blinking ---
  brain.nextBlink -= dt;
  if (brain.nextBlink < 0) { brain.blink = 1; brain.nextBlink = R(2.5, 6.5); if (Math.random() < 0.2) brain.nextBlink = 0.25; }
  brain.blink = Math.max(0, brain.blink - dt * 7);
  const bl = brain.blink > 0 ? Math.sin(brain.blink * Math.PI) : 0;
  Q.lidUp = Math.max(Q.lidUp, bl); Q.lidLow = Math.max(Q.lidLow, bl * 0.6);
  // a slow blink ("cat kiss") every now and then while calmly looking at you
  brain.nextSlowBlink -= dt;
  if (brain.nextSlowBlink < 0 && calm && !a && Q.look > 0.5) { brain.slowBlink = 1; brain.nextSlowBlink = R(10, 20); }
  if (brain.slowBlink > 0) {
    brain.slowBlink = Math.max(0, brain.slowBlink - dt / 1.6);
    const sb = Math.sin((1 - brain.slowBlink) * Math.PI);
    Q.lidUp = Math.max(Q.lidUp, Math.min(1, sb * 1.25)); Q.lidLow = Math.max(Q.lidLow, sb * 0.7);
  }

  // --- gaze ---
  lookLogic(Q, dt);

  // root transform
  cat.root.position.set(brain.pos.x, 0, brain.pos.z);
  cat.root.rotation.y = brain.yaw;
  cat.apply(Q, dt);
  legs.update(dt, Q, M);
  cat.applyLegs(Q);
  updateContact();

  // sleeping: Zzz
  if (poseName === 'sleep') {
    brain.zzz = (brain.zzz || 0) - dt;
    if (brain.zzz < 0) { emote(t('e.zzz'), 'zzz'); brain.zzz = 2.6; }
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
    // in the cat's local frame
    const c = Math.cos(-brain.yaw), s = Math.sin(-brain.yaw);
    const lx = d.x * c + d.z * s, lz = -d.x * s + d.z * c;
    yaw = Math.atan2(lx, lz);
    pitch = Math.atan2(d.y, Math.hypot(lx, lz));
    yaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25);
    pitch = THREE.MathUtils.clamp(pitch, -0.9, 0.7);
  }
  L.yaw = damp(L.yaw, yaw * w, 4, dt);
  L.pitch = damp(L.pitch, pitch * w, 4, dt);
  Q.lookYaw = L.yaw; // applied around the world vertical in cat.turnHead()
  // looking down is mostly done by bending the neck (head moves forward and down, chin stays
  // clear of the chest); looking up mostly tilts the head
  const lookDown = Math.max(0, -L.pitch), lookUp = Math.max(0, L.pitch);
  Q.neckPitch += lookDown * 0.75 - lookUp * 0.35;
  Q.headPitch += lookDown * 0.25 - lookUp * 0.55;
  // turn the chest a bit when looking far to the side
  Q.chestYaw += L.yaw * 0.12;
  // eyes jump to the gaze target in quick saccades with small fixation shifts in between
  const E = brain.eye;
  E.next -= dt;
  const gy = yaw * w - L.yaw * 0.95, gp = pitch * w - L.pitch * 0.9;
  if (E.next < 0 || Math.abs(gy - E.sy) > 0.18 || Math.abs(gp - E.sp) > 0.15) {
    E.sy = gy + R(-0.04, 0.04); E.sp = gp + R(-0.03, 0.03); E.next = R(0.35, 1.6);
  }
  E.yaw = damp(E.yaw, E.sy, 28, dt); E.pitch = damp(E.pitch, E.sp, 28, dt);
  for (const e of cat.eyes) {
    e.rotation.y = THREE.MathUtils.clamp(E.yaw, -0.32, 0.32);
    e.rotation.x = THREE.MathUtils.clamp(-E.pitch, -0.25, 0.25);
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
  if (brain.goal !== 'stand') setPose('stand');
  if (poseName !== 'stand') return;
  const want = Math.atan2(d.x, d.z);
  const diff = angDiff(brain.yaw, want);
  if (dist > 4.6) { brain.walkTarget = dot.clone(); brain.crouch = 0; brain.laserState = 'watch'; return; }
  brain.walkTarget = null;
  // turn towards the dot
  brain.yaw += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
  if (Math.abs(diff) > 0.4) { brain.walkSpeed = Math.max(brain.walkSpeed, 0.3); return; }
  // crouch and wiggle the butt
  brain.crouch = Math.min(1, (brain.crouch || 0) + dt * 2);
  const c = brain.crouch;
  T.torsoY -= 0.62 * c; T.pitch += 0.1 * c; T.fzF += 0.25 * c; T.fzB += 0.1 * c;
  T.neckPitch += 0.25 * c; T.headPitch -= 0.2 * c;
  T.earBack = 0.2 * c; T.tailPitch = -0.15; T.tailWave = 0.35; T.tailWaveSpeed = 3;
  T.pelvisRoll = Math.sin(elapsed * 16) * 0.14 * (brain.laserStill > 0.3 ? 1 : 0.3);
  if (brain.laserStill > 0.75 && dist > 1.6 && c > 0.9) {
    const to = dot.clone().setY(0).sub(forward().multiplyScalar(1.7));
    brain.jump = { from: brain.pos.clone(), to, t: 0, dur: 0.55 };
    legs.release();
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
  // cap the frame step; ?debug allows bigger steps so throttled automated browsers keep real time
  const dt = Math.min(clock.getDelta(), DEBUG ? 0.3 : 0.05);
  update(dt);
  controls.update();
  renderer.render(scene, camera);
  updateEmotes();
  requestAnimationFrame(loop);
}
updateUI();
loop();
$('#loading')?.remove();

if (DEBUG) {
  // step(sec): advance the simulation deterministically and render (handy when the tab is throttled)
  const step = (sec) => { for (let t = 0; t < sec; t += 1 / 30) update(1 / 30); controls.update(); renderer.render(scene, camera); };
  window.app = { cat, P, brain, setPose, ACTIONS, camera, controls, renderer, scene, POSES, step };
}
