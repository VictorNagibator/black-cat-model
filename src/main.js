import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Cat, BASE } from './cat.js';
import { POSES, poseOf, both, GRAPH, TRANSITIONS, groupOf } from './poses.js';
import { CatAudio } from './audio.js';
import { Legs } from './legs.js';
import { makeSock } from './props.js';
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
  // weighted towards the pelvis, which carries the weight when sitting or lying
  const cx = _cp.x * 0.5 + _cc.x * 0.35 + _ch.x * 0.15, cz = _cp.z * 0.5 + _cc.z * 0.35 + _ch.z * 0.15;
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
  walkSpeed: 0,
  yaw: 0, pos: new THREE.Vector3(), yawRate: 0, prevYaw: 0,
  look: { yaw: 0, pitch: 0, target: new THREE.Vector3(), lastMouse: -1e9 },
  gaze: null, nextGaze: 6,                   // looking around at random spots now and then
  blink: 0, nextBlink: 2,
  petting: null, purrUntil: 0,
  idle: 0, nextAuto: 10,
  laser: false, laserState: 'watch', laserStill: 0, laserPrev: new THREE.Vector3(), jump: null,
  extraLook: null,
  goal: 'stand', path: [], trans: null,      // pose transitions
  eye: { yaw: 0, pitch: 0, sy: 0, sp: 0, next: 0.5 }, // saccades
  slowBlink: 0, nextSlowBlink: 9,
  ear: { t: 4, pulse: 0, side: 1 }, tailFlick: 0, nextFlick: 5,
  fidget: null, nextFidget: 7,               // small idle habits: lick the lips, sniff the air, shake an ear
  motion: { speed: 0, dir: new THREE.Vector3(0, 0, 1) }, prevPos: new THREE.Vector3(),
};

function posePath(from, to) {
  const prev = { [from]: null }, queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n === to) break;
    for (const m of GRAPH[n] || []) if (!(m in prev)) { prev[m] = n; queue.push(m); }
  }
  const path = [];
  for (let n = to; n && n !== from; n = prev[n]) path.unshift(n);
  return path;
}
// start the move from the current pose to the next one on the path
function startHop(next) {
  const from = poseName;
  poseName = next;
  const stages = TRANSITIONS[from + '>' + next] || [{ d: 0.9 }];
  brain.trans = { from, to: next, t: 0, stages, total: stages.reduce((s, x) => s + x.d, 0) };
}
function setPose(name) {
  if (!POSES[name]) return;
  brain.idle = 0;
  if (name === brain.goal) return;
  brain.goal = name;
  // a move that has started is finished first, then the cat carries on towards the new pose
  brain.path = posePath(poseName, name);
  if (!brain.trans && brain.path.length) startHop(brain.path.shift());
  updateUI();
}
const settled = (name) => poseName === name && !brain.trans && !brain.path.length;

// target parameters of the pose (or of the current stage of a move between two poses)
function poseTarget(out) {
  const tr = brain.trans;
  if (!tr) { Object.assign(out, BASE, POSES[poseName]); return 0; }
  let acc = 0, stage = tr.stages[tr.stages.length - 1];
  for (const s of tr.stages) { if (tr.t < acc + s.d) { stage = s; break; } acc += s.d; }
  const A = poseOf(tr.from), B = poseOf(tr.to);
  for (const k in B) {
    const g = GROUP_OF[k] || groupOf(k);
    const m = stage.mix ? (stage.mix[g] ?? (g === 'face' ? 1 : 0)) : 1;
    out[k] = A[k] + (B[k] - A[k]) * m;
  }
  if (stage.add) for (const k in stage.add) out[k] += stage.add[k];
  return 3.8;
}
const GROUP_OF = {};
for (const k of Object.keys(BASE)) GROUP_OF[k] = groupOf(k);
// how quickly each body part follows its target (multiplies the spring time): the face and the
// head are quick, the body is heavier and the tail follows last
const LAG = { body: 1, spine: 1, head: 0.75, front: 0.8, hind: 0.8, tail: 1.4, face: 0.55 };

// an action is a list of steps: { d, set, add, fn(t, P), rate, enter(), emote, sound, pose, until() }
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
// switch to a suitable pose first if needed (the action waits until she is there)
function needPose(names, steps) {
  if (names.includes(brain.goal) && settled(brain.goal)) return steps;
  const name = names.includes(brain.goal) ? brain.goal : names[0];
  return [{ d: 15, pose: name, until: () => settled(name) }, ...steps];
}

const R = (a, b) => a + Math.random() * (b - a);
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ACTIONS = {
  // a big yawn: eyes squeeze shut, the head tips up, the mouth opens wide with the tongue
  // curled, then she licks her lips and blinks
  yawn: () => play('yawn', [
    { d: 0.45, add: { headPitch: -0.12, neckPitch: -0.05 }, set: { jaw: 0.18, lidUp: 0.55, earBack: 0.25, whisk: 0.2 }, rate: 4 },
    { d: 1.0, add: { headPitch: -0.34, neckPitch: -0.12, chestBend: -0.04 }, set: { jaw: 1, lidUp: 0.95, lidLow: 0.55, earBack: 0.85, tongueUp: 0.55, whisk: 0.55, look: 0.3 }, rate: 2.6 },
    { d: 0.35, add: { headPitch: -0.34, neckPitch: -0.12 }, set: { jaw: 1, lidUp: 1, lidLow: 0.6, earBack: 0.9, tongueUp: 0.6, whisk: 0.55, look: 0.3 } },
    { d: 0.35, set: { jaw: 0.05, lidUp: 0.6, earBack: 0.3 }, rate: 7 },
    { d: 0.5, set: { tongue: 0.3, tongueUp: 0.7, lidUp: 0.5 }, rate: 6 },
    { d: 0.45, set: { lidUp: 0.3 } },
  ]),
  // a meow: the head lifts a little and the mouth opens and closes with the sound
  meow: () => play('meow', [
    { d: 0.16, add: { headPitch: -0.1 }, rate: 8 },
    { d: 0.62, fn: (tt, p) => {
      const k = Math.sin(Math.PI * Math.min(1, tt / 0.6));
      p.jaw = 0.52 * Math.pow(Math.max(0, k), 0.7); p.headPitch -= 0.16 + 0.05 * k; p.lidUp = 0.12; p.pupil = 0.65;
    }, sound: 'meow', emote: 'e.meow', rate: 12 },
    { d: 0.35 },
  ]),
  // blep: the tip of the tongue stays out for a while
  blep: () => play('blep', [
    { d: 0.35, set: { tongue: 0.3, jaw: 0.015 } },
    { d: 3.6, set: { tongue: 0.5, jaw: 0.012, lidUp: 0.32 }, add: { headRoll: 0.08 }, emote: 'e.blep' },
    { d: 0.45, set: { tongue: 0, jaw: 0 } },
  ]),
  // sniff: a sock appears a few steps away; she walks over, leans down and sniffs it, then
  // lifts her head with the mouth slightly open and eyes half closed (the flehmen response
  // cats show when they study a new smell), and finally licks her nose
  sniff: () => {
    const a = brain.yaw + R(-0.7, 0.7), r = R(3.8, 4.6);
    const at = brain.pos.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
    if (at.length() > 6) at.setLength(6);
    at.y = 0.12;
    const sock = makeSock(); sock.rotation.y = R(0, Math.PI * 2);
    setProp(sock, at);
    brain.action = null; brain.toyChase = null;
    brain.sniff = { p: at, sock };
    brain.extraLook = at.clone().setY(0.25);
    emote('?', 'big');
    if (brain.goal !== 'stand') setPose('stand');
    brain.walkTarget = at.clone();
  },
  // wash: lick the paw held in front of the mouth, then wipe it over the cheek and ear
  // (the paw is driven by IK towards points in head space, so it never goes through the face)
  wash: () => play('wash', needPose(['sit'], [
    { d: 0.9, set: { ikF_R: 0, reachR: 1, reachX: -0.03, reachY: -0.33, reachZ: 0.62, reachW: -1.0, look: 0, scY_R: 0.06 }, add: { headPitch: 0.25, headYaw: -0.12 }, rate: 4 },
    { d: 2.4, fn: (tt, p) => {
      const lick = Math.sin(tt * 9);
      Object.assign(p, { ikF_R: 0, reachR: 1, reachX: -0.03, reachY: -0.33 + lick * 0.02, reachZ: 0.62, reachW: -1.0, look: 0, scY_R: 0.06 });
      p.headPitch += 0.25 + lick * 0.06; p.headYaw -= 0.12; p.neckPitch += 0.05;
      p.jaw = 0.08 + Math.max(0, lick) * 0.08; p.tongue = 0.32 + Math.max(0, lick) * 0.18; p.tongueUp = 0.35; p.lidUp = 0.65;
    } },
    { d: 2.6, fn: (tt, p) => {
      const w = 0.5 - 0.5 * Math.cos(tt * 4.2);
      Object.assign(p, { ikF_R: 0, reachR: 1, reachX: -0.24 - 0.06 * w, reachY: -0.12 + 0.3 * w, reachZ: 0.46 - 0.24 * w, reachW: 0.5, look: 0, scY_R: 0.06 });
      p.headPitch += 0.12; p.headYaw -= 0.2; p.headRoll += 0.22 * w;
      p.lidUp = 0.9; p.lidLow = 0.4; p.earBack = 0.35 + 0.2 * w;
    }, rate: 7 },
    { d: 0.9, set: { reachR: 0 } }, // paw goes back down (IK takes over again)
  ])),
  // stretch: first the front (paws walk forward, chest down, rear and tail up), then the back
  // (she shifts forward and stretches one hind leg out behind)
  stretch: () => {
    // front stretch: forearms flat on the rug far in front, chest down, rear and tail up
    const front = both({ ikF: 0, flS: -2.0, flE: -0.05, flW: 0, fzF: 0.6, torsoY: 1.32, pitch: 0.45, torsoZ: -0.35, chestBend: 0.1, scY: 0.12, tailPitch: 0.25, tailBendX: 0.06, lidUp: 0.85, jaw: 0.35, neckPitch: 0.05, headPitch: 0.15, earBack: 0.35, blM: -0.5 });
    play('stretch', needPose(['stand'], [
      { d: 1.7, set: front, rate: 2.4 },
      { d: 0.8, set: { ...front, jaw: 0.06, lidUp: 0.6, earBack: 0.2 }, rate: 2.4 },
      // then she leans forward and stretches one hind leg out behind her, toes spread
      { d: 1.6, set: { fzF: 0.45, torsoY: 1.6, pitch: 0.1, torsoZ: 0.35, chestBend: 0.04, ikB_R: 0, blH_R: 0.95, blK_R: 0.3, blA_R: -0.15, blP_R: 0.45, tailPitch: -0.25, tailBendX: 0.06, lidUp: 0.6 }, rate: 2.6 },
      { d: 0.7 },
    ]));
  },
  boop: () => { audio.boop(); play('boop', [
    { d: 0.16, set: { lidUp: 1, lidLow: 0.75, earBack: 0.35, whisk: 0.3 }, add: { headPitch: -0.12, neckPitch: -0.12 }, emote: 'e.boop', emoteCls: 'big', rate: 22 },
    { d: 0.35, set: { whisk: 0.45, pupil: 0.8 }, add: { headPitch: -0.05 }, rate: 8 },
    { d: 0.5, set: { tongue: 0.3, tongueUp: 0.75 }, rate: 9 },  // licks the nose
  ]); },
  // touched the tail: ears flatten, a short hiss, the tail lashes
  tail: () => { audio.hiss(); play('tail', [
    { d: 0.3, set: { earBack: 1, lidUp: 0.3, pupil: 0.95, jaw: 0.35, whisk: -0.3 }, add: { neckPitch: -0.15, headPitch: -0.08 }, rate: 14, emote: 'e.tail' },
    { d: 0.9, set: { tailWave: 0.6, tailWaveSpeed: 5, earBack: 1, lidUp: 0.35, pupil: 0.9, jaw: 0.12 }, rate: 8 },
    { d: 0.6, set: { earBack: 0.4, tailWave: 0.25, tailWaveSpeed: 3 } },
  ]); },
  // belly rub while she lies on her back: she grabs the hand and bunny-kicks it
  trap: () => play('trap', [
    { d: 2.2, fn: (tt, p) => {
      Object.assign(p, both({ flS: 0.15, flE: -2.3, flW: 1.5, flZ: -0.12 }));
      const k = Math.sin(tt * 18);
      p.blH_L = -1.25 + k * 0.35; p.blH_R = -1.25 - k * 0.35; p.blK_L = 1.9 - k * 0.45; p.blK_R = 1.9 + k * 0.45;
      p.jaw = 0.35; p.earBack = 0.9; p.pupil = 0.95; p.neckPitch += 0.3; p.chestBend += 0.2;
    }, emote: 'e.trap', rate: 14 },
    { d: 0.6 },
  ]),
};

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
    pointerDown = { part: cat.partOf(hit), x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
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
  if (settled('back') && (part === 'body' || part === 'paw')) return ACTIONS.trap();
  if (poseName === 'sleep') { setPose('side'); emote(t('e.wake')); return; }
  if (part === 'head') { emote(t('e.chirp')); audio.meow('chirp'); return play('chirp', [{ d: 0.3, set: { jaw: 0.22, lidUp: 0.3 }, add: { headRoll: 0.25 }, rate: 9 }, { d: 0.45, add: { headRoll: 0.18 } }]); }
  if (part === 'paw') {
    emote('🐾');
    // she lifts the paw and gives it a little shake
    if (settled('stand') || settled('sit')) return play('paw', [
      { d: 0.25, set: { ikF_L: 0, flS_L: -0.25, flE_L: -0.9, flP_L: 0.5, pupil: 0.8 }, rate: 9 },
      { d: 0.5, fn: (tt, p) => { Object.assign(p, { ikF_L: 0, flS_L: -0.25, flE_L: -0.9, pupil: 0.8 }); p.flP_L = 0.5 + Math.sin(tt * 30) * 0.35; }, rate: 14 },
      { d: 0.35 },
    ]);
    return play('paw', [{ d: 0.6, set: { flP_L: 0.6, pupil: 0.8 } }]);
  }
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
document.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => { audio.ensure(); stopLaser(); cancelSniff(); brain.action = null; brain.walkTarget = null; setPose(b.dataset.pose); }));
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { audio.ensure(); stopLaser(); if (brain.jump) return; cancelSniff(); ACTIONS[b.dataset.act](); }));
function cancelSniff() { if (brain.sniff) { brain.sniff = null; brain.extraLook = null; brain.walkTarget = null; } }
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
  cancelSniff();
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
  stopLaser(); cancelSniff();
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
// critically damped spring (no sudden start, no overshoot); `VEL` holds per-key velocities
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

  // --- pose transitions ---
  if (brain.trans) {
    brain.trans.t += dt;
    if (brain.trans.t >= brain.trans.total) {
      brain.trans = null;
      if (brain.path.length) startHop(brain.path.shift());
    }
  }

  // --- target pose (+ the stage of a move, + the current action step) ---
  let rate = poseTarget(T) || 3.2;
  const a = brain.action;
  if (a) {
    const s = a.steps[a.i];
    if (s.set) Object.assign(T, s.set);
    if (s.add) for (const k in s.add) T[k] += s.add[k];
    if (s.fn) s.fn(a.t, T);
    if (s.rate) rate = s.rate;
    a.t += dt;
    if (a.t >= s.d || (s.until && a.t > 0.15 && s.until())) nextStep();
    brain.idle = 0;
  }
  const standing = poseName === 'stand' && !brain.trans;

  // --- walking to a target / toy / laser ---
  let moving = 0;
  const toy = brain.toyChase;
  if (toy) {
    toy.t += dt;
    const d = tmp.copy(toy.p).sub(brain.pos).setY(0);
    if (d.length() > 2.5) brain.walkTarget = toy.p.clone();
    else if (standing && !brain.walkTarget) { brain.toyChase = null; pounceToy(toy.p); }
  }
  if (brain.sniff && !brain.sniff.started && !brain.walkTarget && standing && !brain.action) startSniff();
  if (brain.laser) laserLogic(dt);
  if (brain.walkTarget && standing && !brain.jump) {
    const d = tmp.copy(brain.walkTarget).sub(brain.pos).setY(0);
    const dist = d.length();
    const want = Math.atan2(d.x, d.z);
    const diff = angDiff(brain.yaw, want);
    // turning: quick at first, easing in as she lines up with the target
    brain.yaw += THREE.MathUtils.clamp(diff * 3, -2.4 * dt, 2.4 * dt) * (dist > 0.6 ? 1 : 0.6);
    const stopDist = brain.laser ? 2.2 : toy ? 2.3 : brain.sniff ? 2.75 : 0.3;
    if (dist > stopDist) {
      const sp = (Math.abs(diff) < 0.6 ? 1 : Math.abs(diff) < 1.4 ? 0.55 : 0.25) * (brain.laser ? 2.4 : 1.7);
      moving = Math.min(1, (dist - stopDist) * 1.5 + 0.25);
      brain.pos.addScaledVector(forward(), sp * moving * dt);
    } else if (Math.abs(diff) < 0.1 && !brain.laser) brain.walkTarget = null;
    brain.idle = 0;
  } else if (brain.walkTarget && poseName !== 'stand' && !brain.jump) {
    if (!a && brain.goal !== 'stand') setPose('stand');
  }
  // stay on the rug
  if (brain.pos.length() > 6.8) brain.pos.setLength(6.8);
  brain.walkSpeed = damp(brain.walkSpeed, moving, 6, dt);

  // --- pounce ---
  if (brain.jump) jumpLogic(dt);

  // --- petting ---
  if (brain.petting) {
    const pt = brain.petting; pt.t += dt; pt.heart -= dt;
    T.lidUp = Math.max(T.lidUp, 0.72); T.lidLow = Math.max(T.lidLow, 0.3);
    T.earBack = 0.25; T.pupil = 0.3; T.look = 0.2;
    if (pt.part === 'head') {
      // she pushes her head into the hand and follows it
      T.headRoll += pt.dx * 0.35 + Math.sin(pt.t * 2) * 0.08; T.headPitch -= 0.14; T.neckPitch -= 0.1; T.neckYaw += pt.dx * 0.25;
    } else if (settled('stand')) {
      // stroked along the back: the back rises into the hand, the tail goes straight up
      T.tailPitch = 1.3; T.tailBendX = 0.0; T.tailCurl = 1.0; T.tailWave = 0.04; T.chestBend -= 0.06; T.pelvisBend += 0.1; T.torsoY += 0.08; T.blM_L = T.blM_R = -0.15;
    } else { T.tailWave = 0.05; }
    if (pt.heart <= 0) { emote(Math.random() < 0.7 ? '❤' : t('e.purr'), 'heart'); pt.heart = R(0.5, 0.9); }
    brain.idle = 0;
  } else if (brain.purrUntil && now > brain.purrUntil) { audio.purr(false); brain.purrUntil = 0; }

  // --- smooth towards the target, each body part at its own pace ---
  for (const k in T) {
    if (k === 'rootY' && brain.jump) { P[k] = T[k]; VEL[k] = 0; continue; }
    P[k] = spring(k, P[k], T[k], (1.15 / rate) * (LAG[GROUP_OF[k] || groupOf(k)] || 1), dt);
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
  const ws = Math.min(1, M.speed / 1.5);
  if (ws > 0.02) {
    // the body rides a little lower and bobs twice per stride, the trunk rolls and bends from
    // side to side with the steps, the head is carried a little low and kept level
    const ph = legs.phase * Math.PI * 2;
    Q.torsoY += (-0.04 + Math.sin(ph * 2 - 0.6) * 0.02) * ws;
    Q.pitch += Math.sin(ph * 2 + 0.9) * 0.012 * ws;
    Q.chestRoll += Math.sin(ph + 1.6) * 0.03 * ws;
    Q.pelvisRoll += Math.sin(ph) * 0.04 * ws;
    Q.chestYaw += Math.sin(ph + 1.6) * 0.03 * ws;
    Q.pelvisYaw += Math.sin(ph) * 0.035 * ws;
    Q.neckPitch += 0.08 * ws; Q.headPitch -= 0.04 * ws - Math.sin(ph * 2 - 0.6) * 0.015 * ws;
    Q.tailPitch += 0.12 * ws; Q.tailBendX += 0.02 * ws;
    Q.tailWave = Math.max(Q.tailWave, 0.1 * ws);
  }
  // shoulder blades: they swing with the front legs and rise while the leg carries weight
  for (const side of ['L', 'R']) {
    const f = legs.feet['F' + side];
    const w = Math.min(1, ws * 1.5) * (Q['ikF_' + side] > 0.5 ? 1 : 0);
    if (w < 0.01) continue;
    const u = f.lastLocal, duty = 0.62;
    const pos = u < duty ? 1 - 2 * u / duty : -1 + 2 * (u - duty) / (1 - duty); // paw fore (+) / aft (-)
    Q['scR_' + side] += -0.13 * pos * w;
    Q['scY_' + side] += (u < duty ? Math.sin(Math.PI * u / duty) : 0) * 0.035 * w;
  }
  // turning: the spine bends into the turn and the head leads
  brain.yawRate = damp(brain.yawRate, angDiff(brain.prevYaw, brain.yaw) / Math.max(dt, 1e-4), 8, dt);
  brain.prevYaw = brain.yaw;
  const turn = THREE.MathUtils.clamp(brain.yawRate, -2.5, 2.5);
  Q.chestYaw += turn * 0.1; Q.pelvisYaw -= turn * 0.07; Q.headYaw += turn * 0.08;

  // --- idle life: weight shifts, small head movements, ear twitches, tail-tip flicks
  const calm = !brain.petting && !brain.laser && ws < 0.05 && !brain.jump;
  if (calm && !brain.trans && (poseName === 'stand' || poseName === 'sit' || poseName === 'loaf' || poseName === 'sphinx')) {
    Q.pelvisRoll += Math.sin(elapsed * 0.37) * 0.025;
    Q.chestRoll += Math.sin(elapsed * 0.29 + 1.3) * 0.02;
    Q.torsoZ += Math.sin(elapsed * 0.21) * 0.025;
    Q.headYaw += (Math.sin(elapsed * 0.53) + Math.sin(elapsed * 1.31 + 2)) * 0.02;
    Q.headPitch += Math.sin(elapsed * 0.71 + 0.5) * 0.02;
    Q.headRoll += Math.sin(elapsed * 0.43 + 1) * 0.03;
  }
  fidgets(Q, dt, calm && !a);
  const E = brain.ear;
  E.t -= dt;
  if (E.t < 0) { E.t = R(2.5, 8); E.pulse = 1; E.side = Math.random() < 0.5 ? 1 : -1; }
  E.pulse = Math.max(0, E.pulse - dt * 5);
  Q.earFlick += Math.sin(E.pulse * Math.PI) * 0.9 * E.side;
  brain.nextFlick -= dt;
  if (brain.nextFlick < 0) { brain.nextFlick = R(4, 11); brain.tailFlick = 1; }
  brain.tailFlick = Math.max(0, brain.tailFlick - dt * 1.2);
  Q.tailWave += brain.tailFlick * 0.22;

  // --- breathing: slow and deep when asleep, quicker when purring ---
  const purring = brain.petting || (brain.purrUntil && now < brain.purrUntil);
  brain.breathPh = (brain.breathPh || 0) + dt * (poseName === 'sleep' ? 1.5 : purring ? 3 : 2.3);
  cat.breath = Math.sin(brain.breathPh) * (poseName === 'sleep' ? 0.028 : 0.018);
  if (settled('back') && !a) Q.roll += Math.sin(elapsed * 0.9) * 0.08;
  if (purring) Q.torsoY += Math.sin(elapsed * 160) * 0.002;

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
  groundContact(Q, dt);
  cat.tailDynamics(dt, Q.tailRest);
  legs.update(dt, Q, M);
  cat.applyLegs(Q);
  updateContact();

  // sleeping: Zzz
  if (settled('sleep')) {
    brain.zzz = (brain.zzz || 0) - dt;
    if (brain.zzz < 0) { emote(t('e.zzz'), 'zzz'); brain.zzz = 2.6; }
  }

  autonomy(dt);
}

// Small habits while idle: licking the lips, sniffing the air, a quick ear shake.
function fidgets(Q, dt, allowed) {
  if (!brain.fidget) {
    brain.nextFidget -= dt;
    if (brain.nextFidget < 0 && allowed && poseName !== 'sleep') {
      brain.fidget = { kind: ['lick', 'sniff', 'sniff', 'shake'][Math.floor(R(0, 4))], t: 0 };
      brain.nextFidget = R(6, 14);
    }
    return;
  }
  const f = brain.fidget; f.t += dt;
  if (f.kind === 'lick') {
    // the tongue darts out over the upper lip, once or twice
    const k = Math.max(0, Math.sin(f.t * 14)) * (f.t < 0.45 ? 1 : 0);
    Q.tongue = Math.max(Q.tongue, 0.32 * k); Q.tongueUp = Math.max(Q.tongueUp, 0.8 * k); Q.jaw = Math.max(Q.jaw, 0.06 * k);
    if (f.t > 0.5) brain.fidget = null;
  } else if (f.kind === 'sniff') {
    // the head lifts a little, the nose twitches, whiskers come forward
    const e = Math.sin(Math.PI * Math.min(1, f.t / 1.4));
    Q.headPitch -= 0.12 * e; Q.neckPitch -= 0.06 * e; Q.whisk += 0.35 * e;
    Q.headPitch += Math.sin(f.t * 30) * 0.012 * e;
    if (f.t > 1.4) brain.fidget = null;
  } else {
    // a quick shake of the head
    const e = f.t < 0.4 ? Math.sin(f.t * 45) * (1 - f.t / 0.4) : 0;
    Q.headRoll += e * 0.25; Q.headYaw += e * 0.08; Q.earBack += Math.abs(e) * 0.3;
    if (f.t > 0.45) brain.fidget = null;
  }
}

// Keep the body resting on the rug. When the paws are not carrying her (sitting on the heels,
// lying, sleeping...) the whole cat is shifted so its lowest point just touches the floor
// (sinking a little into the pile) instead of floating above it or dipping under it; while the
// hind paws are planted by the IK the body is only ever pushed up out of the rug.
const GROUND_TOP = 0.12, FUR_SINK = 0.05;
const _exclude = new Set();
function groundContact(Q, dt) {
  let desired = 0;
  if (!brain.jump) {
    cat.root.updateMatrixWorld(true);
    _exclude.clear();
    for (const [id, k] of [['FL', 'ikF_L'], ['FR', 'ikF_R'], ['BL', 'ikB_L'], ['BR', 'ikB_R']]) if (Q[k] > 0.5) _exclude.add(id);
    // the body rests on the rug or on the legs folded under it; head and paws may sink a
    // little into the pile, the tail is ignored. The lowest points already include the current
    // lift, so add it back.
    const lift = cat.groundLift || 0, target = GROUND_TOP - FUR_SINK;
    const { core, rest } = cat.lowestPoints(_exclude);
    const need = Math.max(target - core, target - 0.03 - rest) + lift;
    const free = 1 - Math.min(1, Math.max(Q.ikB_L, Q.ikB_R));
    desired = free * need + (1 - free) * Math.max(0, need);
  }
  cat.groundLift = damp(cat.groundLift || 0, desired, 12, dt);
  cat.root.position.y = 0.1 + Q.rootY + cat.groundLift;
}

// sniffing the sock: lean down, nose to the sock
const SNIFF_LEAN = (p) => ({ torsoY: p.torsoY - 0.3, pitch: p.pitch + 0.16, fzF: p.fzF + 0.22, neckPitch: p.neckPitch + 1.2, headPitch: p.headPitch + 0.3, blM_L: -0.5, blM_R: -0.5 });
function startSniff() {
  const sn = brain.sniff; sn.started = true;
  play('sniff', [
    // lean down towards the sock: front end lowered, neck stretched down, nose to the sock
    { d: 1.0, set: { pupil: 0.8, whisk: 0.4, look: 0.3 }, fn: (tt, p) => { Object.assign(p, SNIFF_LEAN(p)); }, rate: 3.2 },
    // sniff: quick little nose movements, whiskers forward
    { d: 1.9, fn: (tt, p) => {
      Object.assign(p, SNIFF_LEAN(p)); p.look = 0.3;
      p.whisk = 0.65; p.headPitch += Math.sin(tt * 34) * 0.025; p.earBack = 0.1;
    }, emote: 'e.sniff' },
    // straighten up and lift the head
    { d: 0.7, enter: () => { brain.extraLook = null; }, set: { jaw: 0.08, whisk: 0.3, look: 0 }, add: { headPitch: -0.2, neckPitch: -0.25 }, rate: 4 },
    // flehmen: mouth slightly open, eyes half closed, a short pause
    { d: 2.4, set: { jaw: 0.3, lidUp: 0.6, lidLow: 0.3, whisk: 0.35, earBack: 0.3, pupil: 0.5, look: 0 }, add: { headPitch: -0.3, neckPitch: -0.25 }, emote: '😮', rate: 5 },
    // close the mouth and lick the nose
    { d: 0.55, set: { jaw: 0, tongue: 0.3, tongueUp: 0.75 } },
    { d: 0.3, enter: () => { brain.sniff = null; setTimeout(() => { if (prop === sn.sock) setProp(null); }, 6000); } },
  ]);
}

// the toy mouse: she crouches, wiggles her rear, pounces on it and gives it a swat
function pounceToy(p) {
  brain.extraLook = p.clone().setY(0.3);
  play('toy', [
    { d: 1.0, fn: (tt, q) => {
      q.torsoY -= 0.45; q.pitch += 0.08; q.fzF += 0.2; q.neckPitch += 0.15; q.headPitch -= 0.1; q.scY_L += 0.08; q.scY_R += 0.08;
      q.pelvisRoll = Math.sin(tt * 17) * 0.1 * Math.min(1, tt * 2); q.pupil = 0.95; q.earBack = 0.15;
      q.tailPitch = -0.2; q.tailWave = 0.3; q.tailWaveSpeed = 3;
    }, emote: 'e.wiggle', rate: 6 },
    { d: 0.3, enter: () => { emote(t('e.pounce'), 'big'); }, set: both({ ikF: 0, flS: -1.15, flE: -0.45, flW: 0.2, jaw: 0.45, earBack: 0.2 }), add: { torsoZ: 0.35, pitch: -0.12 }, rate: 14 },
    { d: 0.45, set: { ikF_R: 0, flS_R: -0.2, flE_R: -1.1, flP_R: 0.5, jaw: 0.1 }, add: { neckPitch: 0.35, headPitch: 0.15 }, rate: 10 },
    { d: 1.2, set: { lidUp: 0.3 }, add: { neckPitch: 0.3 } },
  ], { onDone: () => { brain.extraLook = null; setTimeout(() => setProp(null), 1500); } });
}

function lookLogic(Q, dt) {
  const L = brain.look;
  let target = null;
  // now and then she looks around at something else for a moment
  brain.nextGaze -= dt;
  if (brain.nextGaze < 0) {
    brain.nextGaze = R(5, 12);
    const a = brain.yaw + R(-1.4, 1.4), r = R(2.5, 7);
    brain.gaze = { p: new THREE.Vector3(brain.pos.x + Math.sin(a) * r, R(0.1, 2.5), brain.pos.z + Math.cos(a) * r), t: R(1.2, 2.8) };
  }
  if (brain.gaze && (brain.gaze.t -= dt) < 0) brain.gaze = null;
  if (brain.extraLook) target = brain.extraLook;
  else if (brain.laser && laserDot.visible) target = laserDot.position;
  else if (brain.toyChase) target = brain.toyChase.p;
  else if (performance.now() - L.lastMouse < 3500) {
    raycaster.setFromCamera(mouse, camera);
    cat.head.getWorldPosition(tmp2);
    const dist = camera.position.distanceTo(tmp2);
    target = raycaster.ray.at(dist * 0.85, tmp);
  } else if (brain.gaze) target = brain.gaze.p;
  else if (brain.walkTarget && brain.walkSpeed > 0.2) target = tmp.copy(brain.walkTarget).setY(1.5);
  else target = camera.position;
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
  // the head follows the gaze target smoothly (a little behind the eyes)
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

// The leap at the laser dot: launch from the hind legs with the front legs reaching forward,
// fly stretched out, land on the front paws first and let the body follow.
function jumpLogic(dt) {
  const j = brain.jump; j.t += dt;
  const k = Math.min(1, j.t / j.dur);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  brain.pos.lerpVectors(j.from, j.to, e);
  T.rootY = Math.sin(k * Math.PI) * 0.95;
  const launch = smooth01(1 - k / 0.25), land = smooth01((k - 0.65) / 0.35);
  Object.assign(T, both({ ikF: 0, ikB: 0 }));
  for (const s of ['L', 'R']) {
    T['flS_' + s] = THREE.MathUtils.lerp(-1.35, -0.15, land) + launch * 0.3;
    T['flE_' + s] = THREE.MathUtils.lerp(-0.25, -0.5, land);
    T['flW_' + s] = 0.15;
    T['blH_' + s] = THREE.MathUtils.lerp(0.75, -0.9, land) + launch * 0.2;
    T['blK_' + s] = THREE.MathUtils.lerp(0.45, 1.6, land);
    T['blA_' + s] = THREE.MathUtils.lerp(-0.25, -1.2, land);
  }
  T.pitch = -0.3 * launch + 0.25 * land; T.chestBend = 0.08 - 0.15 * launch; T.pelvisBend = -0.08 * (1 - land);
  T.tailPitch = -0.05; T.tailBendX = 0.02; T.pupil = 1; T.earBack = 0.35; T.neckPitch = -0.1; T.jaw = 0.15 * (1 - land);
  if (k >= 1) { brain.jump = null; emote([t('e.pounce'), t('e.caught'), '???'][Math.floor(R(0, 3))], 'big'); brain.laserState = 'land'; brain.landT = 0; }
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
    // after landing: nose down at the paws, looking for the dot
    brain.landT += dt;
    T.headPitch += 0.4; T.neckPitch += 0.4; T.fzF += 0.15;
    if (brain.landT > 1.2) brain.laserState = 'watch';
    return;
  }
  if (brain.goal !== 'stand') setPose('stand');
  if (!settled('stand')) return;
  const want = Math.atan2(d.x, d.z);
  const diff = angDiff(brain.yaw, want);
  if (dist > 4.6) { brain.walkTarget = dot.clone(); brain.crouch = 0; brain.laserState = 'watch'; return; }
  brain.walkTarget = null;
  // turn towards the dot
  brain.yaw += THREE.MathUtils.clamp(diff * 3, -2.2 * dt, 2.2 * dt);
  if (Math.abs(diff) > 0.4) return;
  // crouch low with the shoulder blades up, tail low and twitching, then wiggle the rear
  brain.crouch = Math.min(1, (brain.crouch || 0) + dt * 2);
  const c = brain.crouch;
  T.torsoY -= 0.62 * c; T.pitch += 0.06 * c; T.fzF += 0.25 * c; T.fzB += 0.1 * c;
  T.scY_L += 0.1 * c; T.scY_R += 0.1 * c; T.blM_L = T.blM_R = -0.3 - 0.5 * c;
  T.neckPitch += 0.2 * c; T.headPitch -= 0.15 * c;
  T.earBack = 0.15 * c; T.tailPitch = -0.2; T.tailWave = 0.3; T.tailWaveSpeed = 3;
  T.pelvisRoll = Math.sin(elapsed * 16) * 0.12 * (brain.laserStill > 0.3 ? 1 : 0.3);
  if (brain.laserStill > 0.75 && dist > 1.6 && c > 0.9) {
    const to = dot.clone().setY(0).sub(forward().multiplyScalar(1.7));
    brain.jump = { from: brain.pos.clone(), to, t: 0, dur: 0.6 };
    legs.release();
    brain.crouch = 0; brain.laserStill = -1;
  }
}

function autonomy(dt) {
  if (!brain.life || brain.action || brain.petting || brain.laser || brain.walkTarget || brain.toyChase || brain.jump || brain.sniff || brain.trans) return;
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
  if (!(DEBUG && window.app?.paused)) update(dt);
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
  window.app = { cat, P, T, brain, legs, setPose, ACTIONS, camera, controls, renderer, scene, POSES, step, update };
}
