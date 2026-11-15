// Procedural 3D model of a black Scottish Fold cat.
//
// The body (trunk, neck, legs and tail) is one seamless skinned mesh. It is sculpted as a signed
// distance field from smoothly blended primitives (muscles, fat pads and bony points close to
// the skin) in a standing bind pose, polygonized when the page loads and bound to a cat
// skeleton: a flexible spine, shoulder blades that glide over the ribcage, four legs, a
// two-joint neck and a fourteen-joint tail. The head is a finer rigid mesh on the head bone;
// the lower jaw, the eyes and eyelids, the folded ears and the inside of the mouth are
// separate parts.
import * as THREE from 'three';
import { ellipsoid, cone, primDist, evalField, polygonize, smoothAttribute } from './sdf.js';

const { smoothstep, clamp, lerp } = THREE.MathUtils;

// ---------- Shell fur ----------
const FUR_SHELLS = 10;

function furMaterial({ sheen, h = 0, den = 70, len = 0.03 }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.4,
  });
  const u = { uFurOff: { value: h * len }, uFurH: { value: h }, uFurDen: { value: den } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = 'attribute vec3 furP; attribute vec3 furDir; attribute float furK;\nuniform float uFurOff; uniform float uFurH;\nvarying vec3 vFurP; varying float vFurK;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vFurP = furP; vFurK = furK;
       // strands are combed along furDir and bend more towards the tip (in the bind pose,
       // before skinning, so the coat follows the body when it moves)
       vec3 comb = furDir - normal * dot(furDir, normal);
       transformed += (normal + comb * uFurH * 1.4) * uFurOff * furK;`
    );
    s.fragmentShader = `uniform float uFurH; uniform float uFurDen; varying vec3 vFurP; varying float vFurK;
float furHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
` + s.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 q = vFurP * uFurDen;
        vec3 c = floor(q);
        float hh = furHash(c);
        vec3 jit = vec3(furHash(c + 17.1), furHash(c + 31.7), furHash(c + 5.3)) - 0.5;
        vec3 f = fract(q) - 0.5 - jit * 0.4;
        if (uFurH > 0.0) {
          float rad = 0.62 * pow(1.0 - uFurH, 0.6);
          if (uFurH > 0.35 + 0.65 * hh || uFurH > vFurK * 1.15) discard;
          // soft strand edge through alpha-to-coverage (MSAA) instead of a hard cut-out, so the
          // silhouette reads as soft fur rather than grainy dots; tips get thinner and fainter
          // only where the surface turns away from the camera (the silhouette)
          float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          float soft = smoothstep(rad, rad * 0.5, length(f)) * (1.0 - 0.5 * uFurH);
          float hard = step(length(f), rad);
          float cov = mix(soft, hard, smoothstep(0.15, 0.45, facing));
          if (cov < 0.02) discard;
          diffuseColor.a = cov;
        }
        diffuseColor.rgb *= mix(0.5, 1.15, uFurH) * (0.85 + 0.3 * hh);
      }`
    );
  };
  m.alphaToCoverage = h > 0;
  m.customProgramCacheKey = () => 'fur';
  return m;
}

function furSet(sheen, den, len) {
  const base = furMaterial({ sheen, h: 0, den, len });
  const shells = [];
  for (let i = 1; i <= FUR_SHELLS; i++) shells.push(furMaterial({ sheen, h: i / FUR_SHELLS, den, len }));
  return { base, shells };
}

// ---------- Eyes ----------
// The iris sits a little behind the clear cornea, so it shifts with the view (parallax),
// which is what makes eyes look wet and deep rather than painted on.
function eyeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPupil: { value: 0.4 },
      uLight: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
    },
    vertexShader: `
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vVo;
      void main(){
        vP = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        // view direction in object space (for the iris parallax)
        vVo = normalize((inverse(modelViewMatrix) * vec4(0.0,0.0,0.0,1.0)).xyz - position);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uPupil; uniform vec3 uLight;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vVo;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float R = 0.86;
        // refraction: look "through" the cornea onto an iris plane slightly behind it
        vec3 vo = normalize(vVo);
        vec2 xy = vP.xy - vo.xy / max(vo.z, 0.35) * 0.09 * max(vP.z, 0.0);
        float d = length(xy) / R;
        vec3 col;
        if (vP.z < 0.0 || length(vP.xy) / R > 1.0) {
          col = vec3(0.03,0.022,0.015);
        } else {
          float ang = atan(xy.y, xy.x);
          // radial fibres (stroma) and a soft mottling
          float fib = noise(vec2(ang * 22.0, d * 3.0)) * 0.6 + noise(vec2(ang * 60.0, d * 9.0)) * 0.4;
          float mott = noise(xy * 9.0);
          vec3 inner = vec3(0.50,0.60,0.14);   // green-olive around the pupil
          vec3 mid   = vec3(0.92,0.78,0.22);   // warm gold
          vec3 outer = vec3(0.78,0.58,0.12);   // amber towards the edge
          col = mix(inner, mid, smoothstep(0.1, 0.55, d));
          col = mix(col, outer, smoothstep(0.65, 0.95, d));
          col *= 0.72 + 0.45 * fib + 0.12 * (mott - 0.5);
          // collarette: a slightly darker ring around the pupil
          float pr = uPupil * 0.75;
          col *= 1.0 - 0.25 * exp(-pow((d - pr - 0.1) / 0.06, 2.0));
          col *= 1.0 - 0.85 * smoothstep(0.9, 1.0, d);                 // dark limbal ring
          col *= mix(0.45, 1.0, smoothstep(0.9, 0.2, vP.y / R));       // shadow cast by the upper lid
          // pupil: a vertical ellipse, soft edged
          vec2 pp = xy / vec2(uPupil * R * 0.75, R * 0.92);
          float pd = length(pp);
          col = mix(vec3(0.004,0.004,0.006), col, smoothstep(0.94, 1.05, pd));
        }
        vec3 n = normalize(vN), v = normalize(vV);
        float dif = 0.6 + 0.4 * max(dot(n, uLight), 0.0);
        col *= dif;
        // wet cornea: sharp key highlight, a soft broad sheen and a cool fresnel rim
        vec3 r = reflect(-uLight, n);
        float rv = max(dot(r, v), 0.0);
        float spec = pow(rv, 380.0) * 2.4 + pow(rv, 40.0) * 0.1;
        // small secondary catchlight from the fill side (reads as a lively eye)
        vec3 l2 = normalize(vec3(-0.6, 0.25, 0.75));
        float spec2 = pow(max(dot(reflect(-l2, n), v), 0.0), 600.0) * 0.9;
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col += vec3(1.0,0.97,0.92) * (spec + spec2) + vec3(0.22,0.25,0.3) * fres * 0.45;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- Skeleton (bind pose: standing, facing +z, the cat's left side towards +x) ----------
// Torso space: the origin is between the hip joints. Numbers are in scene units (about 12 cm):
// a 4 kg cat, 25 cm at the withers, the trunk 36 cm from the point of the shoulder to the
// buttock, the head 9 cm long and the tail 28 cm.
const TORSO_Y = 1.8;   // hip joints above the root (the rug is at +0.02)
const JNT = {
  chest: [0, 0.1, 1.02],                    // thoracolumbar junction: the ribcage pivots here
  neck1: [0, 0.2, 2.04], neck2: [0, 0.33, 2.19], atlas: [0, 0.45, 2.34],
  tail: [0, 0.17, -0.42],
  F: { withers: [0.21, 0.24, 1.76], shoulder: [0.21, -0.2, 2.14], elbow: [0.21, -0.8, 1.69], wrist: [0.21, -1.5, 1.72] },
  B: { hip: [0.25, 0, 0], knee: [0.25, -0.6, 0.62], hock: [0.25, -1.16, -0.12], foot: [0.25, -1.66, 0.06] },
};
const HEAD_S = 1.32;   // the head is modelled at 1/1.22 scale around the atlas joint
const TAIL_N = 14, TAIL_LEN = 2.35;
// bone angle in the (y, z) plane: 0 = straight down, + = towards the tail
const angleOf = (a, b) => Math.atan2(-(b[2] - a[2]), -(b[1] - a[1]));
const lenOf = (a, b) => Math.hypot(b[1] - a[1], b[2] - a[2]);
const BIND_ANG = (() => {
  const F = JNT.F, B = JNT.B;
  const hum = angleOf(F.shoulder, F.elbow), fore = angleOf(F.elbow, F.wrist);
  const fem = angleOf(B.hip, B.knee), tib = angleOf(B.knee, B.hock), met = angleOf(B.hock, B.foot);
  return { scap: angleOf(F.withers, F.shoulder), hum, fore, fem, tib, met };
})();

// ---------- Pose parameters ----------
const legDefaults = {};
for (const s of ['L', 'R']) {
  Object.assign(legDefaults, {
    ['scR_' + s]: 0, ['scY_' + s]: 0,
    ['flS_' + s]: BIND_ANG.hum, ['flE_' + s]: BIND_ANG.fore - BIND_ANG.hum, ['flW_' + s]: 0, ['flZ_' + s]: 0, ['flP_' + s]: 0,
    ['blH_' + s]: BIND_ANG.fem, ['blK_' + s]: BIND_ANG.tib - BIND_ANG.fem, ['blA_' + s]: BIND_ANG.met - BIND_ANG.tib, ['blZ_' + s]: 0, ['blP_' + s]: 0,
    // world angle of the metatarsus while the hind paw is planted by the IK (0 = upright,
    // - = the hock behind the paw; about -1.5 when the cat sits on her heels)
    ['blM_' + s]: -0.3,
  });
}
export const BASE = {
  rootY: 0,
  torsoY: TORSO_Y, torsoZ: 0, pitch: 0, roll: 0,
  pelvisBend: 0, pelvisYaw: 0, pelvisRoll: 0, chestBend: 0, chestYaw: 0, chestRoll: 0,
  neckPitch: 0, neckYaw: 0, neckRoll: 0,
  headPitch: 0, headYaw: 0, headRoll: 0,
  jaw: 0, tongue: 0, tongueUp: 0, lidUp: 0.15, lidLow: 0.1, pupil: 0.45,
  earBack: 0, earFlick: 0, whisk: 0, look: 1, flat: 1,
  // leg IK weights (1 = paws planted on the floor) and paw placement offsets along the body
  ikF_L: 1, ikF_R: 1, ikB_L: 1, ikB_R: 1, fzF: 0, fzB: 0,
  // right front paw reaching for a point in head space (washing), and its wrist bend
  reachR: 0, reachX: 0, reachY: 0, reachZ: 0, reachW: 0,
  ...legDefaults,
  tailPitch: -0.55, tailYaw: 0, tailBendX: 0.03, tailBendY: 0, tailCurl: 0, tailWave: 0.1, tailWaveSpeed: 1, tailRest: 0,
};
const BIND = { ...BASE, tailBendX: 0, tailWave: 0, lidUp: 0, lidLow: 0 };

// ---------- small helpers ----------
const v3 = (a) => new THREE.Vector3(...a);
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// orientation for an ellipsoid whose local y axis runs from a to b (its x axis stays sideways)
function along(a, b) {
  const up = norm3(sub3(b, a));
  let fwd = [0, up[2], -up[1]];
  if (Math.hypot(...fwd) < 1e-4) fwd = [0, 0, 1];
  if (fwd[2] < 0) fwd = [0, -fwd[1], -fwd[2]];
  return { fwd: norm3(fwd), up };
}
function ellipsoidGeo(rx, ry, rz, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz);
  return g;
}
// tube tapering towards its end (whiskers)
function taperTube(curve, segs, r, tip = 0.15, radial = 5) {
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const k = lerp(1, tip, Math.pow(t, 0.8));
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
// small deterministic PRNG, so the whiskers look the same on every load
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// whisker colour along its length: dark at the root (it grows out of black fur), pale at the tip;
// a few whiskers stay dark grey all the way, as in the photos
function whiskerColors(g, segs, radial, dark) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  const root = new THREE.Color(0x1a1714), tip = new THREE.Color(dark ? 0x6a645e : 0xf3f0ea), k = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    k.copy(root).lerp(tip, smoothstep(i / segs, 0.02, 0.35));
    for (let j = 0; j <= radial; j++) k.toArray(c, (i * (radial + 1) + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// first crossing of the field's surface along a ray (stepping, then bisection)
function rayHit(prims, o, d, t0 = 0, t1 = 1.5, step = 0.008) {
  const f = (t) => evalField(prims, o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
  let a = t0, fa = f(a);
  for (let t = t0 + step; t <= t1 + 1e-9; t += step) {
    const ft = f(t);
    if ((ft < 0) !== (fa < 0)) {
      let lo = a, hi = t;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if ((f(m) < 0) === (fa < 0)) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    a = t; fa = ft;
  }
  return null;
}

// coat colours (sRGB hex); vertex colours carry the albedo of the furry meshes
const COL = {
  coat: 0x070606, belly: 0x0b0908, muzzle: 0x131111, chin: 0x0c0a09, spot: 0x8a8582,
  mouth: 0x7a2834, earIn: 0x2a2224,
};
const PARTS = ['body', 'head', 'nose', 'paw', 'tail'];

// Per-vertex data from the primitives: every primitive near the surface gets a share (softmax
// over the distance to its own surface), which gives smooth skin weights across joints and
// smooth transitions of fur length, comb direction and colour.
function analyze(positions, indices, prims, boneOf, opts = {}) {
  const nv = positions.length / 3, nb = opts.nBones || 1;
  const W = opts.weights === false ? null : new Float32Array(nv * nb);
  const furK = new Float32Array(nv), furDir = new Float32Array(nv * 3), color = new Float32Array(nv * 3), part = new Uint8Array(nv);
  const d = new Float32Array(prims.length), c = new THREE.Color();
  const pc = prims.map((q) => c.setHex(q.col ?? COL.coat).toArray());
  const tau = prims.map((q) => Math.max(0.012, 0.45 * (q.k || 0.03)));
  const lb = new Float32Array(prims.length);
  for (let v = 0; v < nv; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    // cheap lower bound of each primitive's distance first; exact distances only where a
    // primitive can matter (its share falls off with the distance to its own surface)
    let near = 0;
    for (let i = 0; i < prims.length; i++) {
      const q = prims[i], cx = x - q.c[0], cy = y - q.c[1], cz = z - q.c[2];
      lb[i] = Math.sqrt(cx * cx + cy * cy + cz * cz) - q.bound;
      if (lb[i] < lb[near]) near = i;
    }
    // the vertex lies on the surface, so its distance to the nearest primitive bounds dmin
    const ub = Math.abs(primDist(prims[near], x, y, z));
    let dmin = 1e9;
    for (let i = 0; i < prims.length; i++) {
      if (lb[i] - ub > 6.3 * tau[i]) { d[i] = 1e9; continue; }
      d[i] = Math.abs(primDist(prims[i], x, y, z));
      if (d[i] < dmin) dmin = d[i];
    }
    let sum = 0, best = 0, bestM = -1, fk = 0, dx = 0, dy = 0, dz = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < prims.length; i++) {
      const q = prims[i];
      if (d[i] - dmin > 6.3 * tau[i]) continue;
      const m = Math.exp(-(d[i] - dmin) / tau[i]);
      if (m < 2e-3) continue;
      sum += m;
      if (m > bestM) { bestM = m; best = i; }
      fk += m * (typeof q.fk === 'function' ? q.fk(x, y, z) : q.fk ?? 1);
      let dir = q.dir || [0, 0, -1];
      if (dir === 'along') dir = q.ba ? norm3(q.ba) : q.up || [0, -1, 0];
      dx += m * dir[0]; dy += m * dir[1]; dz += m * dir[2];
      const col = q.colFn ? q.colFn(x, y, z, pc[i]) : pc[i];
      r += m * col[0]; g += m * col[1]; b += m * col[2];
      if (W) boneOf(q, x, y, z, m, W, v * nb);
    }
    furK[v] = fk / sum;
    const dl = Math.hypot(dx, dy, dz) || 1;
    furDir[v * 3] = dx / dl; furDir[v * 3 + 1] = dy / dl; furDir[v * 3 + 2] = dz / dl;
    color[v * 3] = r / sum; color[v * 3 + 1] = g / sum; color[v * 3 + 2] = b / sum;
    part[v] = PARTS.indexOf(prims[best].part || 'body');
    if (W) for (let k = 0; k < nb; k++) W[v * nb + k] /= sum;
  }
  return { W, furK: smoothAttribute(furK, 1, indices, nv, 2), furDir, color: smoothAttribute(color, 3, indices, nv, 1), part };
}

function furGeometry(mesh, data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.setAttribute('furP', new THREE.BufferAttribute(mesh.positions.slice(), 3));
  g.setAttribute('furDir', new THREE.BufferAttribute(data.furDir, 3));
  g.setAttribute('furK', new THREE.BufferAttribute(data.furK, 1));
  g.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
  return g;
}

export class Cat {
  constructor() {
    this.root = new THREE.Group();
    this.parts = [];        // meshes used for raycasting
    this.shellMeshes = [];
    this.fur = furSet(0x3a312c, 135, 0.058);
    this.furFace = furSet(0x4a423c, 230, 0.021);   // (the head group is scaled up by HEAD_S)
    this.matPad = new THREE.MeshPhysicalMaterial({ color: 0x3d3033, roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color(0x806068) });
    this.matNose = new THREE.MeshPhysicalMaterial({ color: 0x2b2627, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    this.matMouth = new THREE.MeshStandardMaterial({ color: 0x9a3a4a, roughness: 0.5, emissive: 0x3a0e16 });
    this.matTooth = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.3 });
    this.matWhisker = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35 });
    this.eyeMats = [];
    this.matLid = new THREE.MeshPhysicalMaterial({ color: 0x080606, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0x3a312c), sheenRoughness: 0.5 });
    this.matLidRim = new THREE.MeshStandardMaterial({ color: 0x030202, roughness: 0.45 });
    this.matPalate = new THREE.MeshStandardMaterial({ color: 0xc06474, roughness: 0.5, emissive: 0x3a1018 });
    this.matGum = new THREE.MeshStandardMaterial({ color: 0x6e2e3a, roughness: 0.5 });
    this.matThroat = new THREE.MeshBasicMaterial({ color: 0x1c0709 });
    this.breath = 0;
    const t0 = performance.now();
    this.buildSkeleton();
    this.poseSkeleton(BIND);
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.buildBody();
    this.buildHead();
    this.buildCollar();
    this.buildTime = performance.now() - t0;
  }

  // ---------- skeleton ----------
  buildSkeleton() {
    const G = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; if (pos) g.position.set(...pos); parent.add(g); return g; };
    this.torso = G('torso', this.root);
    this.pelvis = G('pelvis', this.torso);
    this.chest = G('chest', this.torso, JNT.chest);
    // lumbar spine: frames interpolated between the pelvis and the chest every frame
    this.spine = [0.25, 0.5, 0.75].map((t, i) => { const g = G('spine' + (i + 1), this.torso); g.userData.t = t; return g; });
    this.neck = G('neck1', this.chest, sub3(JNT.neck1, JNT.chest));
    this.neck2 = G('neck2', this.neck, sub3(JNT.neck2, JNT.neck1));
    this.head = G('head', this.neck2, sub3(JNT.atlas, JNT.neck2));
    const F = JNT.F, B = JNT.B;
    this.legLen = {
      F: [lenOf(F.shoulder, F.elbow), lenOf(F.elbow, F.wrist)],
      B: [lenOf(B.hip, B.knee), lenOf(B.knee, B.hock), lenOf(B.hock, B.foot)],
      scap: lenOf(F.withers, F.shoulder),
    };
    this.fl = {}; this.bl = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const scap = G('scap' + side, this.chest, [F.withers[0] * s, F.withers[1] - JNT.chest[1], F.withers[2] - JNT.chest[2]]);
      const sh = G('shoulder' + side, scap, [0, -this.legLen.scap, 0]);
      const el = G('elbow' + side, sh, [0, -this.legLen.F[0], 0]);
      const wr = G('wrist' + side, el, [0, -this.legLen.F[1], 0]);
      const paw = G('paw' + side, wr);
      this.fl[side] = { scap, sh, el, wr, paw, s, scapY: scap.position.y };
      const hp = G('hip' + side, this.pelvis, [B.hip[0] * s, B.hip[1], B.hip[2]]);
      const kn = G('knee' + side, hp, [0, -this.legLen.B[0], 0]);
      const hk = G('hock' + side, kn, [0, -this.legLen.B[1], 0]);
      const ft = G('foot' + side, hk, [0, -this.legLen.B[2], 0]);
      this.bl[side] = { hp, kn, hk, ft, s };
    }
    this.tail = [];
    let parent = this.pelvis;
    this.tailSegL = TAIL_LEN / TAIL_N;
    for (let i = 0; i < TAIL_N; i++) { const g = G('tail' + i, parent, i === 0 ? JNT.tail : [0, 0, -this.tailSegL]); this.tail.push(g); parent = g; }
    // the paws keep this rotation (relative to their bone) when they are not held flat
    this.pawBindF = -BIND_ANG.fore;
    this.pawBindB = -BIND_ANG.met;
  }

  // Spine frames between the pelvis and the chest follow a smooth curve whose end tangents are
  // the pelvis and chest directions, like a real backbone; breathing swells the belly and ribs.
  updateSpine() {
    const S = this._sp ||= { p0: new THREE.Vector3(), p1: new THREE.Vector3(), t0: new THREE.Vector3(), t1: new THREE.Vector3() };
    S.p0.copy(this.pelvis.position); S.p1.copy(this.chest.position);
    const L = S.p0.distanceTo(S.p1);
    S.t0.set(0, 0, L).applyQuaternion(this.pelvis.quaternion);
    S.t1.set(0, 0, L).applyQuaternion(this.chest.quaternion);
    for (const g of this.spine) {
      const t = g.userData.t, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      g.position.set(0, 0, 0).addScaledVector(S.p0, h00).addScaledVector(S.t0, h10).addScaledVector(S.p1, h01).addScaledVector(S.t1, h11);
      g.quaternion.slerpQuaternions(this.pelvis.quaternion, this.chest.quaternion, t);
      const b = 1 + this.breath * Math.exp(-((t - 0.6) ** 2) / 0.08);
      g.scale.set(b, b, 1);
    }
  }

  // ---------- body: one skinned mesh ----------
  bodyPrims() {
    const T = (x, y, z) => [x, y + TORSO_Y, z];
    const W = (o) => o.getWorldPosition(new THREE.Vector3()).toArray();
    const P = [];
    const add = (q) => { P.push(q); return q; };
    const trunk = { bone: 'spine', part: 'body', fk: 1, dir: [0, -0.3, -1] };
    // belly: a small light spot (as in the photos) and the slightly browner underside
    const bellyCol = (x, y, z, c) => {
      const spot = Math.exp(-(((x - 0.06) / 0.07) ** 2 + ((y - (TORSO_Y - 0.5)) / 0.08) ** 2 + ((z - 0.95) / 0.09) ** 2));
      return [lerp(c[0], 0.25, spot), lerp(c[1], 0.235, spot), lerp(c[2], 0.225, spot)];
    };
    // ---- trunk ----
    add(ellipsoid(T(0, 0.04, -0.1), [0.41, 0.42, 0.44], { k: 0, ...trunk }));                    // rump
    add(ellipsoid(T(0, 0.04, 0.52), [0.43, 0.4, 0.48], { k: 0.3, ...trunk }));                   // loin
    add(ellipsoid(T(0, -0.22, 0.82), [0.47, 0.44, 0.53], { k: 0.3, ...trunk, col: COL.belly, colFn: bellyCol })); // belly
    add(ellipsoid(T(0, -0.18, 1.38), [0.45, 0.53, 0.56], { k: 0.3, ...trunk }));                  // ribcage
    add(ellipsoid(T(0, -0.4, 1.84), [0.34, 0.4, 0.36], { k: 0.25, ...trunk, fk: 1.5, dir: [0, -1, -0.2] })); // brisket
    // ---- shoulders, front legs ----
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const L = this.fl[side];
      const wi = W(L.scap), sh = W(L.sh), el = W(L.el), wr = W(L.wr);
      const leg = { part: 'paw', dir: 'along', fk: 0.8 };
      // shoulder blade and the muscles on it
      add(ellipsoid(add3(mix3(wi, sh, 0.5), [0.02 * s, -0.02, -0.03]), [0.12, 0.31, 0.2], { ...along(wi, sh), k: 0.22, bone: 'scap' + side, part: 'body', fk: 1, dir: [0, -0.4, -1] }));
      // upper arm with the triceps behind it, blending into the chest
      add(cone(sh, el, 0.18, 0.135, { k: 0.18, bone: 'sh' + side, ...leg, part: 'body' }));
      add(ellipsoid(add3(mix3(sh, el, 0.55), [0, 0.02, -0.07]), [0.135, 0.3, 0.15], { ...along(sh, el), k: 0.12, bone: 'sh' + side, ...leg, part: 'body' }));
      // point of the elbow
      add(ellipsoid(add3(el, [0, 0.0, -0.065]), [0.065, 0.08, 0.06], { k: 0.05, bone: 'el' + side, ...leg }));
      // forearm: muscular below the elbow, slim at the wrist
      add(cone(el, wr, 0.135, 0.08, { k: 0.08, bone: 'el' + side, ...leg }));
      add(ellipsoid(add3(mix3(el, wr, 0.27), [0, 0, 0.012]), [0.128, 0.26, 0.132], { ...along(el, wr), k: 0.07, bone: 'el' + side, ...leg }));
      // paw: metacarpus and the round foot with four toes
      const pc = [wr[0], 0.105, wr[2] + 0.075];
      add(cone(wr, add3(pc, [0, 0.02, -0.03]), 0.08, 0.086, { k: 0.05, bone: 'paw' + side, ...leg, fk: 0.6 }));
      add(ellipsoid(pc, [0.116, 0.08, 0.134], { k: 0.04, bone: 'paw' + side, part: 'paw', fk: 0.45, dir: [0, -0.3, 1] }));
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.42;
        add(ellipsoid([pc[0] + Math.sin(a) * 0.075, 0.075, pc[2] + 0.06 + Math.cos(a) * 0.045], [0.04, 0.045, 0.048], { k: 0.025, bone: 'paw' + side, part: 'paw', fk: 0.3, dir: [0, -0.3, 1] }));
      }
    }
    // ---- hind legs ----
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const B = this.bl[side];
      const hp = W(B.hp), kn = W(B.kn), hk = W(B.hk), ft = W(B.ft);
      const leg = { part: 'paw', dir: 'along', fk: 0.8 };
      // thigh: a broad muscular mass from the hip to the knee merging into the rump and flank
      add(ellipsoid(add3(mix3(hp, kn, 0.42), [0.02 * s, 0, -0.05]), [0.24, 0.54, 0.38], { ...along(hp, kn), k: 0.28, bone: 'hp' + side, part: 'body', fk: 1.1, dir: [0, -1, -0.6] }));
      // hamstrings: the back of the thigh rounding off into the buttock
      add(ellipsoid(add3(hp, [0.01 * s, -0.12, -0.16]), [0.19, 0.3, 0.24], { k: 0.2, bone: 'hp' + side, part: 'body', fk: 1.1, dir: [0, -1, -0.3] }));
      // shank with the calf muscle behind it
      add(cone(kn, hk, 0.155, 0.076, { k: 0.1, bone: 'kn' + side, ...leg }));
      add(ellipsoid(add3(mix3(kn, hk, 0.33), [0, -0.03, -0.05]), [0.13, 0.29, 0.14], { ...along(kn, hk), k: 0.08, bone: 'kn' + side, ...leg }));
      // hock with the point of the heel
      add(ellipsoid(add3(hk, [0, -0.01, -0.04]), [0.06, 0.078, 0.072], { k: 0.04, bone: 'hk' + side, ...leg }));
      // metatarsus: long and lean
      add(cone(hk, ft, 0.079, 0.07, { k: 0.045, bone: 'hk' + side, ...leg, fk: 0.65 }));
      // foot: a little longer than the forepaw
      const fc = [ft[0], 0.1, ft[2] + 0.095];
      add(ellipsoid(fc, [0.104, 0.077, 0.155], { k: 0.04, bone: 'ft' + side, part: 'paw', fk: 0.45, dir: [0, -0.3, 1] }));
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.4;
        add(ellipsoid([fc[0] + Math.sin(a) * 0.07, 0.072, fc[2] + 0.085 + Math.cos(a) * 0.04], [0.038, 0.043, 0.046], { k: 0.025, bone: 'ft' + side, part: 'paw', fk: 0.3, dir: [0, -0.3, 1] }));
      }
    }
    // ---- neck: thick and short, with a ruff at the throat; it runs on into the skull ----
    const n1 = W(this.neck), at = W(this.head);
    add(cone(add3(n1, [0, -0.06, -0.14]), at, 0.37, 0.3, { k: 0.26, bone: 'neck', part: 'body', fk: 1.25, dir: [0, -0.5, -1] }));
    add(ellipsoid(T(0, -0.05, 2.16), [0.29, 0.32, 0.27], { k: 0.2, bone: 'neck', part: 'body', fk: 1.5, dir: [0, -1, 0.1] }));
    // the skull inside the head mesh (slightly smaller), so the neck flows into the head
    add(ellipsoid(add3(at, [0, 0.11 * HEAD_S, 0.15 * HEAD_S]), [0.3 * HEAD_S, 0.27 * HEAD_S, 0.3 * HEAD_S], { k: 0.12, bone: 'head', part: 'head', fk: 0.9, dir: [0, 0.3, -1] }));
    // ---- tail: thick at the root, evenly tapering, with a rounded tip ----
    for (let i = 0; i < TAIL_N; i++) {
      const a = W(this.tail[i]);
      const b = i + 1 < TAIL_N ? W(this.tail[i + 1]) : add3(a, norm3(sub3(a, W(this.tail[i - 1]))), this.tailSegL);
      const r = (t) => lerp(0.14, 0.075, Math.pow(t, 0.85));
      add(cone(a, b, r(i / TAIL_N), r((i + 1) / TAIL_N), { k: i === 0 ? 0.13 : 0, bone: 'tail' + i, part: 'tail', fk: 1.25 + 0.4 * (i / TAIL_N), dir: 'along' }));
    }
    return P;
  }

  buildBody() {
    const prims = this.bodyPrims();
    this.bodyPrimList = prims;
    const mesh = polygonize(prims, [-0.66, -0.02, -2.62, 0.66, 2.92, 3.08], 0.024);
    // bones of the skin
    const bones = [this.pelvis, ...this.spine, this.chest, this.neck, this.neck2, this.head];
    for (const s of ['L', 'R']) { const L = this.fl[s], B = this.bl[s]; bones.push(L.scap, L.sh, L.el, L.wr, L.paw, B.hp, B.kn, B.hk, B.ft); }
    bones.push(...this.tail);
    const bi = new Map(bones.map((b, i) => [b, i]));
    const named = {
      pelvis: this.pelvis, chest: this.chest, head: this.head,
    };
    for (const s of ['L', 'R']) {
      Object.assign(named, { ['scap' + s]: this.fl[s].scap, ['sh' + s]: this.fl[s].sh, ['el' + s]: this.fl[s].el, ['wr' + s]: this.fl[s].wr, ['paw' + s]: this.fl[s].paw,
        ['hp' + s]: this.bl[s].hp, ['kn' + s]: this.bl[s].kn, ['hk' + s]: this.bl[s].hk, ['ft' + s]: this.bl[s].ft });
    }
    this.tail.forEach((g, i) => { named['tail' + i] = g; });
    // spine: the trunk is shared between the pelvis, the lumbar frames and the chest by position
    const W = (o) => o.getWorldPosition(new THREE.Vector3());
    const spineZ = [this.pelvis, ...this.spine, this.chest].map((o) => W(o).z);
    const spineB = [this.pelvis, ...this.spine, this.chest].map((o) => bi.get(o));
    const n1 = W(this.neck), at = W(this.head), nAx = at.clone().sub(n1), nL2 = nAx.lengthSq();
    const neckB = [this.chest, this.neck, this.neck2, this.head].map((o) => bi.get(o)), neckT = [-0.3, 0.25, 0.75, 1.25];
    // share a weight m between consecutive bones placed at positions xs (smooth hat functions)
    const hat = (xs, bonesIdx, x, m, W, o) => {
      const n = xs.length;
      if (x <= xs[0]) { W[o + bonesIdx[0]] += m; return; }
      if (x >= xs[n - 1]) { W[o + bonesIdx[n - 1]] += m; return; }
      for (let i = 0; i < n - 1; i++) if (x <= xs[i + 1]) {
        const t = smoothstep(x, xs[i], xs[i + 1]);
        W[o + bonesIdx[i]] += m * (1 - t); W[o + bonesIdx[i + 1]] += m * t;
        return;
      }
    };
    for (const q of prims) if (q.bone !== 'spine' && q.bone !== 'neck') q.bi = bi.get(named[q.bone]);
    const boneOf = (q, x, y, z, m, W, o) => {
      if (q.bone === 'spine') hat(spineZ, spineB, z, m, W, o);
      else if (q.bone === 'neck') hat(neckT, neckB, ((x - n1.x) * nAx.x + (y - n1.y) * nAx.y + (z - n1.z) * nAx.z) / nL2, m, W, o);
      else W[o + q.bi] += m;
    };
    const data = analyze(mesh.positions, mesh.indices, prims, boneOf, { nBones: bones.length });
    const nv = mesh.positions.length / 3, nb = bones.length;
    const Ws = smoothAttribute(data.W, nb, mesh.indices, nv, 3, 0.5);
    const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
    const limbOf = new Map();
    for (const s of ['L', 'R']) {
      for (const k of ['sh', 'el', 'wr', 'paw']) limbOf.set(bi.get(this.fl[s][k]), 'F' + s);
      for (const k of ['hp', 'kn', 'hk', 'ft']) limbOf.set(bi.get(this.bl[s][k]), 'B' + s);
    }
    const limb = new Array(nv);
    const top = [];
    for (let v = 0; v < nv; v++) {
      top.length = 0;
      for (let b = 0; b < nb; b++) { const w = Ws[v * nb + b]; if (w > 1e-4) top.push([w, b]); }
      top.sort((a, b) => b[0] - a[0]);
      let s = 0;
      for (let k = 0; k < 4 && k < top.length; k++) s += top[k][0];
      for (let k = 0; k < 4; k++) {
        if (k < top.length) { skinIndex[v * 4 + k] = top[k][1]; skinWeight[v * 4 + k] = top[k][0] / s; }
      }
      limb[v] = limbOf.get(top[0][1]) || '';
    }
    // the soles of the paws are almost bare, so the pads show when she lies on her side or back
    for (let v = 0; v < nv; v++) if (data.part[v] === 3 && mesh.normals[v * 3 + 1] < -0.3) data.furK[v] *= 0.25;
    const g = furGeometry(mesh, data);
    g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    this.bodyGeo = g;
    this.skeleton = new THREE.Skeleton(bones);
    this.bones = bones;
    const make = (mat) => {
      const m = new THREE.SkinnedMesh(g, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    this.body = make(this.fur.base);
    this.body.userData.part = 'body';
    // raycasting: a fixed generous bounding sphere (the skinned mesh changes shape all the time)
    this.body.computeBoundingSphere = function () { this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0), 4.5); };
    this.body.computeBoundingSphere();
    this.root.add(this.body);
    this.parts.push(this.body);
    for (const sm of this.fur.shells) {
      const s = make(sm);
      s.castShadow = false;
      s.raycast = () => {};
      this.root.add(s);
      this.shellMeshes.push(s);
    }
    this.vertPart = data.part;
    this.buildPads(prims);
    // a subsample of vertices for ground contact (skinned on the CPU when needed)
    const sample = [];
    for (let v = 0; v < nv; v++) if (v % 7 === 0 || (data.part[v] === 3 && v % 2 === 0)) sample.push(v);
    this.contact = { idx: Uint32Array.from(sample), part: sample.map((v) => PARTS[data.part[v]]), limb: sample.map((v) => limb[v]) };
    this.bodyStats = { vertices: nv, triangles: mesh.indices.length / 3 };
  }

  // paw pads: a big pad and four toe beans under every paw, riding on the paw bones
  buildPads(prims) {
    const pads = [];
    for (const s of ['L', 'R']) pads.push([this.fl[s].paw, 'paw' + s, 0.105, 0.125], [this.bl[s].ft, 'ft' + s, 0.1, 0.155]);
    for (const [bone, name, r, len] of pads) {
      const foot = prims.find((q) => q.bone === name && q.part === 'paw' && q.type === 0 && q.r[2] >= len - 0.01);
      const c = foot.c, bottom = c[1] - foot.r[1];
      const add = (geo, x, z) => {
        const m = new THREE.Mesh(geo, this.matPad);
        m.position.copy(bone.worldToLocal(new THREE.Vector3(c[0] + x, bottom + 0.012, c[2] + z)));
        m.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
        bone.add(m);
      };
      add(ellipsoidGeo(r * 0.52, 0.016, len * 0.27, 14), 0, -len * 0.2);
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.45;
        add(ellipsoidGeo(r * 0.2, 0.014, r * 0.23, 10), Math.sin(a) * r * 0.62, len * 0.32 + Math.cos(a) * r * 0.3);
      }
    }
  }

  // part of the body under a raycast hit
  partOf(hit) {
    if (hit.object === this.body && hit.face) return PARTS[this.vertPart[hit.face.a]];
    return hit.object.userData.part;
  }

  // ---------- head ----------
  headPrims() {
    const P = [];
    const add = (q) => { P.push(q); return q; };
    const head = { part: 'head', fk: 0.85, dir: [0, 0.35, -1] };
    // fur is short and smooth around the eyes and on the nose bridge, longer on the cheeks
    const eyeL = [0.135, 0.105, 0.398], eyeR = [-0.135, 0.105, 0.398], nose = [0, -0.03, 0.59];
    this.EYE = [eyeL, eyeR]; this.NOSE = nose;
    const faceK = (k) => (x, y, z) => {
      const de = Math.min(Math.hypot(x - eyeL[0], y - eyeL[1], z - eyeL[2]), Math.hypot(x - eyeR[0], y - eyeR[1], z - eyeR[2]));
      const dn = Math.hypot(x - nose[0], y - nose[1], z - nose[2]);
      return k * (0.05 + 0.95 * smoothstep(de, 0.1, 0.19)) * (0.25 + 0.75 * smoothstep(dn, 0.03, 0.12));
    };
    add(ellipsoid([0, 0.12, 0.16], [0.33, 0.3, 0.33], { k: 0, ...head, fk: faceK(0.85) }));                       // cranium
    add(ellipsoid([0, 0.17, 0.33], [0.22, 0.155, 0.17], { k: 0.12, ...head, fk: faceK(0.6), dir: [0, 0.7, -1] })); // brow
    for (const s of [1, -1]) {
      add(ellipsoid([0.19 * s, -0.05, 0.28], [0.18, 0.16, 0.17], { k: 0.12, ...head, fk: faceK(1.3), dir: [s, -0.6, -0.6] }));    // cheek
      add(ellipsoid([0.11 * s, -0.13, 0.39], [0.11, 0.075, 0.12], { k: 0.08, ...head, fk: faceK(1), dir: [s, -0.7, -0.4] }));      // jowl
      add(ellipsoid([0.056 * s, -0.095, 0.515], [0.068, 0.058, 0.064], { k: 0.04, part: 'nose', fk: faceK(0.45), dir: [s, -0.3, 0], col: COL.muzzle })); // whisker pad
    }
    add(ellipsoid([0, 0.04, 0.46], [0.09, 0.1, 0.1], { k: 0.08, ...head, fk: faceK(0.4), dir: [0, 1, -0.3] }));   // nose bridge
    add(ellipsoid([0, -0.035, 0.54], [0.05, 0.04, 0.05], { k: 0.04, part: 'nose', fk: faceK(0.3), dir: [0, 1, -0.3], col: COL.muzzle })); // top of the nose
    // eye sockets and the mouth (the lower jaw is a separate mesh that fills it)
    for (const e of this.EYE) add(ellipsoid(e, [0.088, 0.088, 0.088], { op: 'sub', k: 0.03, part: 'head', fk: 0.04 }));
    // (the walls of this pocket are hidden by the jaw when the mouth is closed and by the palate
    // when it is open, so they stay dark)
    add(ellipsoid([0, -0.188, 0.33], [0.085, 0.039, 0.108], { op: 'sub', k: 0.012, part: 'head', fk: 0, col: COL.coat }));
    add(ellipsoid([0, -0.19, 0.44], [0.042, 0.031, 0.07], { op: 'sub', k: 0.012, part: 'head', fk: 0, col: COL.coat }));
    return P;
  }

  buildHead() {
    // all head parts live in a group scaled around the atlas joint
    const H = this.headGeo = new THREE.Group();
    H.scale.setScalar(HEAD_S);
    this.head.add(H);
    const prims = this.headPrims();
    this.headPrimList = prims;
    const mesh = polygonize(prims, [-0.44, -0.3, -0.24, 0.44, 0.48, 0.68], 0.012);
    const data = analyze(mesh.positions, mesh.indices, prims, null, { weights: false });
    const hm = new THREE.Mesh(furGeometry(mesh, data), this.furFace.base);
    hm.castShadow = true; hm.receiveShadow = true; hm.userData.part = 'head';
    this.headMesh = hm; this.headPart = data.part;
    H.add(hm); this.parts.push(hm);
    this.addShells(hm, this.furFace);
    // front surface of the face at (x, y), seen from straight ahead (for placing the nose,
    // the mouth line and the whiskers)
    const front = (x, y) => { const t = rayHit(prims, [x, y, 0.8], [0, 0, -1], 0, 0.8, 0.004) ?? 0.25; return [x, y, 0.8 - t]; };
    this.faceFront = front;

    // nose leather: a dark grey triangle on the tip of the nose
    const nosePt = front(0, -0.03);
    const ng = ellipsoidGeo(0.043, 0.026, 0.02, 20);
    { const p = ng.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < 0 ? 1 + (y / 0.026) * 0.7 : 1; p.setX(i, p.getX(i) * k); }
      ng.computeVertexNormals(); }
    const nose = new THREE.Mesh(ng, this.matNose);
    nose.position.set(0, nosePt[1] + 0.004, nosePt[2] - 0.006); nose.rotation.x = 0.45;
    nose.userData.part = 'nose'; H.add(nose); this.parts.push(nose);
    this.nose = nose;
    const dark = new THREE.MeshBasicMaterial({ color: 0x060505 });
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(ellipsoidGeo(0.008, 0.005, 0.006, 8), dark);
      n.position.set(0.016 * s, nose.position.y - 0.008, nose.position.z + 0.013); n.rotation.z = 0.5 * s; H.add(n);
    }
    // philtrum and the inverted-Y mouth line, laid onto the muzzle
    const onSurf = (x, y) => { const p = front(x, y); return new THREE.Vector3(p[0], p[1], p[2] + 0.002); };
    const line = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 5), dark);
    const top = nose.position.y - 0.02;
    H.add(line([onSurf(0, top), onSurf(0, top - 0.025), onSurf(0, -0.128)], 0.0032));
    for (const s of [-1, 1]) H.add(line([onSurf(0, -0.128), onSurf(0.025 * s, -0.139), onSurf(0.046 * s, -0.142)], 0.0026));
    this.buildMouth(H);

    // eyes: round, wide-set, looking forward with a slight outward turn
    this.eyes = []; this.lids = [];
    const R = 0.088;
    for (const [i, s] of [[0, 1], [1, -1]]) {
      const eg = new THREE.Group(); eg.position.set(...this.EYE[i]); eg.rotation.set(0, 0.2 * s, 0.08 * s); eg.scale.set(1, 1, 0.9); H.add(eg);
      const look = new THREE.Group(); eg.add(look);
      const em = eyeMaterial(); this.eyeMats.push(em);
      look.add(new THREE.Mesh(new THREE.SphereGeometry(R, 40, 30), em));
      const up = new THREE.Mesh(new THREE.SphereGeometry(R * 1.047, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.matLid);
      const lo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.033, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.matLid);
      up.castShadow = false;
      eg.add(up); eg.add(lo);
      // eyelid margin: a dark rim along each lid edge that moves with the lid
      for (const [lid, r] of [[up, R * 1.047], [lo, R * 1.033]]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.0006, 0.0033, 6, 40, Math.PI), this.matLidRim);
        rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI; lid.add(rim);
      }
      this.eyes.push(look); this.lids.push({ up, lo });
    }

    // ears: small and folded forward and down like a cap (Scottish Fold)
    this.ears = [];
    for (const s of [1, -1]) {
      const eg = new THREE.Group(); eg.position.set(0.19 * s, 0.32, 0.09); eg.rotation.set(0, 0, -0.55 * s); H.add(eg);
      const ep = [
        ellipsoid([0, 0.035, 0], [0.11, 0.06, 0.03], { k: 0, part: 'head', fk: 0.6, dir: [0, 1, 0] }),                                     // upright base
        cone([0, 0.07, 0.01], [0, 0.03, 0.12], 0.05, 0.018, { k: 0.035, part: 'head', fk: 0.45, dir: [0, -0.5, 1] }),                    // folded tip
        ellipsoid([0, 0.065, 0.045], [0.095, 0.022, 0.07], { fwd: [0, -0.75, 1], k: 0.03, part: 'head', fk: 0.5, dir: [0, -0.5, 1] }),  // folded flap
      ];
      const em = polygonize(ep, [-0.13, -0.05, -0.06, 0.13, 0.16, 0.16], 0.008);
      const ed = analyze(em.positions, em.indices, ep, null, { weights: false });
      const mesh = new THREE.Mesh(furGeometry(em, ed), this.furFace.base);
      mesh.castShadow = true; mesh.userData.part = 'head';
      eg.add(mesh); this.parts.push(mesh);
      this.addShells(mesh, this.furFace);
      this.ears.push({ g: eg, s });
    }

    // whiskers: four loose rows of 3 on each whisker pad (12 per side, as in real cats).
    // They are thin, dark at the root and pale towards the tip, fan out sideways, curve
    // gently forward and droop a little under their own weight. The upper rows are longest.
    this.whiskers = [];
    const rnd = mulberry(7);
    for (const s of [1, -1]) {
      const wp = front(0.06 * s, -0.095);
      const wg = new THREE.Group(); wg.position.set(wp[0] + 0.012 * s, wp[1], wp[2] - 0.03); H.add(wg);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        const root = new THREE.Vector3(s * (0.008 + col * 0.016), 0.019 - row * 0.015, -col * 0.019);
        const len = (0.5 - row * 0.045 - col * 0.025) * (0.9 + rnd() * 0.18);
        const spreadY = 0.32 - row * 0.2 + (rnd() - 0.5) * 0.08;
        const dir = new THREE.Vector3(s, spreadY, -0.12 - col * 0.12 + (rnd() - 0.5) * 0.1).normalize();
        const pts = [];
        for (let k = 0; k <= 7; k++) {
          const t = k / 7;
          pts.push(new THREE.Vector3(
            root.x + dir.x * len * t,
            root.y + dir.y * len * t - 0.09 * len * t * t,
            root.z + dir.z * len * t + 0.07 * len * Math.sin(t * Math.PI)
          ));
        }
        const tube = taperTube(new THREE.CatmullRomCurve3(pts), 16, 0.0021, 0.1, 4);
        whiskerColors(tube, 16, 4, row * 3 + col === 4 || row * 3 + col === 9);
        wg.add(new THREE.Mesh(tube, this.matWhisker));
      }
      this.whiskers.push(wg);
      // eyebrow whiskers
      const bg = new THREE.Group(); bg.position.set(0.12 * s, 0.215, 0.47); H.add(bg);
      for (let i = 0; i < 2; i++) {
        const len = 0.17 + i * 0.04;
        const pts = [];
        for (let k = 0; k <= 4; k++) {
          const t = k / 4;
          pts.push(new THREE.Vector3(s * (0.5 + i * 0.3) * t * len, (0.55 - i * 0.15) * t * len, 0.45 * t * len - 0.025 * t * t));
        }
        const tb = taperTube(new THREE.CatmullRomCurve3(pts), 8, 0.0022, 0.12, 4); whiskerColors(tb, 8, 4, false);
        bg.add(new THREE.Mesh(tb, this.matWhisker));
      }
    }
  }

  addShells(mesh, set) {
    for (const sm of set.shells) {
      const s = new THREE.Mesh(mesh.geometry, sm);
      s.raycast = () => {};
      mesh.add(s);
      this.shellMeshes.push(s);
    }
  }

  // ---------- mouth: palate, teeth, gums, tongue and the lower jaw ----------
  // The mouth is wide, as in real cats: it runs back almost under the eyes, so a yawn opens a
  // broad pink gape with the four fangs at its front corners.
  buildMouth(H) {
    const G = () => new THREE.Group();
    // inside of the mouth: only shown while the mouth is open
    const M = G(); H.add(M); this.mouthInner = [M];
    const add = (geo, mat, pos, rot, parent = M) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); parent.add(m); return m; };
    add(ellipsoidGeo(0.08, 0.028, 0.14, 20), this.matMouth, [0, -0.172, 0.38]);           // oral cavity
    add(ellipsoidGeo(0.05, 0.035, 0.04, 12), this.matThroat, [0, -0.19, 0.265]);          // throat
    this.mouthFill = add(ellipsoidGeo(1, 1, 1, 20), new THREE.MeshStandardMaterial({ color: 0xa8404f, roughness: 0.5, emissive: 0x2a080e, side: THREE.BackSide }), [0, -0.17, 0.38]);
    this.mouthFill.visible = false;
    add(ellipsoidGeo(0.072, 0.011, 0.13, 20), this.matPalate, [0, -0.152, 0.4]);           // palate
    for (let i = 0; i < 4; i++) {                                                          // palate ridges
      const r = add(new THREE.TorusGeometry(0.045 - i * 0.004, 0.0028, 5, 16, Math.PI), this.matGum, [0, -0.158, 0.47 - i * 0.026], [Math.PI / 2, 0, 0]);
      r.scale.set(1.1, 0.6, 1);
    }
    add(new THREE.TorusGeometry(0.052, 0.0075, 8, 24, Math.PI), this.matGum, [0, -0.152, 0.476], [Math.PI / 2, 0, 0]).scale.set(1.05, 1.1, 1);
    const fang = (len, r) => { const g = new THREE.ConeGeometry(r, len, 10); g.translate(0, -len / 2, 0); return g; };
    for (const s of [-1, 1]) {
      add(fang(0.034, 0.0095), this.matTooth, [0.047 * s, -0.154, 0.497], [-0.12, 0, 0.05 * s]); // canine
      add(fang(0.018, 0.0075), this.matTooth, [0.058 * s, -0.156, 0.462]);                       // premolars
      add(fang(0.022, 0.008), this.matTooth, [0.065 * s, -0.156, 0.43]);
    }
    for (let i = 0; i < 6; i++) {                                                          // incisors
      const a = (i - 2.5) * 0.3;
      add(new THREE.CylinderGeometry(0.0034, 0.0027, 0.012, 6), this.matTooth, [Math.sin(a) * 0.032, -0.16, 0.486 + Math.cos(a) * 0.026]);
    }
    // lower jaw: hinged below the ear; its furry outside fills the mouth when closed
    this.jaw = G(); this.jaw.position.set(0, -0.125, 0.19); H.add(this.jaw);
    const jp = this.jaw.position.toArray();
    const jprims = [
      ellipsoid(sub3([0, -0.186, 0.33], jp), [0.09, 0.045, 0.112], { k: 0, part: 'head', fk: 0.7, dir: [0, -1, -0.5], col: COL.chin }),
      ellipsoid(sub3([0, -0.191, 0.432], jp), [0.047, 0.036, 0.074], { k: 0.04, part: 'head', fk: 0.8, dir: [0, -1, -0.3], col: COL.chin }),
      // the floor of the mouth between the two halves of the jaw (seen when the mouth opens)
      ellipsoid(sub3([0, -0.152, 0.32], jp), [0.062, 0.024, 0.1], { op: 'sub', k: 0.012, part: 'head', fk: 0, col: COL.mouth }),
      ellipsoid(sub3([0, -0.158, 0.4], jp), [0.026, 0.018, 0.05], { op: 'sub', k: 0.012, part: 'head', fk: 0, col: COL.mouth }),
    ];
    const jm = polygonize(jprims, [-0.11, -0.13, -0.01, 0.11, 0.0, 0.38], 0.009);
    const jd = analyze(jm.positions, jm.indices, jprims, null, { weights: false });
    const chin = new THREE.Mesh(furGeometry(jm, jd), this.furFace.base);
    chin.castShadow = true; chin.userData.part = 'head';
    this.jaw.add(chin); this.parts.push(chin);
    this.addShells(chin, this.furFace);
    const J = G(); this.jaw.add(J); this.mouthInner.push(J);
    const jadd = (geo, mat, pos, rot) => add(geo, mat, sub3(pos, jp), rot, J);
    jadd(new THREE.TorusGeometry(0.047, 0.007, 8, 24, Math.PI), this.matGum, [0, -0.17, 0.474], [Math.PI / 2, 0, 0]).scale.set(1.05, 1.15, 1);
    for (const s of [-1, 1]) {
      jadd(fang(0.03, 0.0085), this.matTooth, [0.033 * s, -0.162, 0.468], [Math.PI + 0.15, 0, 0]);
      jadd(fang(0.016, 0.0065), this.matTooth, [0.05 * s, -0.163, 0.405], [Math.PI, 0, 0]);
      jadd(fang(0.018, 0.007), this.matTooth, [0.062 * s, -0.163, 0.37], [Math.PI, 0, 0]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.3;
      jadd(new THREE.CylinderGeometry(0.003, 0.0025, 0.01, 6), this.matTooth, [Math.sin(a) * 0.02, -0.161, 0.462 + Math.cos(a) * 0.022]);
    }
    // corners of the mouth: a web of skin on each side between the upper and the lower jaw,
    // black outside and pink inside, which stretches as the mouth opens (updated in apply)
    this.lipWebs = [];
    const webOut = new THREE.MeshStandardMaterial({ color: 0x0b0808, roughness: 0.6 });
    const webIn = new THREE.MeshStandardMaterial({ color: 0x8a3442, roughness: 0.55, emissive: 0x2a080e, side: THREE.BackSide });
    for (const s of [-1, 1]) {
      const N = 6, up = [], lo = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, z = lerp(0.235, 0.44, u), x = s * (0.084 - 0.04 * u * u);
        up.push(new THREE.Vector3(x, -0.152, z));
        lo.push(new THREE.Vector3(x, -0.156, z).sub(this.jaw.position));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
      g.setIndex(idx);
      const outer = new THREE.Mesh(g, webOut), inner = new THREE.Mesh(g, webIn);
      H.add(outer); H.add(inner);
      this.lipWebs.push({ g, up, lo, N });
    }
    // tongue: flat, rounded tip, central groove
    this.tongue = G(); this.tongue.position.copy(v3(sub3([0, -0.168, 0.3], jp))); this.jaw.add(this.tongue);
    this.tongueBase = this.tongue.position.clone();
    const tg = ellipsoidGeo(0.042, 0.013, 0.1, 24);
    { const pa = tg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const w = 1 + 0.22 * smoothstep(z, -0.04, 0.06);                // wider towards the tip
        const groove = y > 0 ? -0.0037 * Math.exp(-(x * x) / 0.00012) : 0; // central groove
        pa.setXYZ(i, x * w, y + groove + (y > 0 ? 0.004 * Math.max(0, z) : 0), z);
      }
      tg.computeVertexNormals(); }
    tg.translate(0, 0, 0.07);
    this.tongueMesh = new THREE.Mesh(tg, new THREE.MeshPhysicalMaterial({ color: 0xd9788a, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xffc0c8) }));
    this.tongue.add(this.tongueMesh);
  }

  // ---------- collar: a soft band skinned to the neck so it always hugs it ----------
  buildCollar() {
    const at = this.head.getWorldPosition(new THREE.Vector3()), n1 = this.neck.getWorldPosition(new THREE.Vector3());
    const c = n1.clone().lerp(at, 0.38);
    const ax = at.clone().sub(n1).normalize();
    const side = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3().crossVectors(ax, side).normalize();
    // radius of the neck surface in every direction around the band
    const prims = this.bodyPrimList;
    const NA = 64, NW = 6, T = 0.032, Wd = 0.042;
    const radius = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const d = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      const r = rayHit(prims, c.toArray(), d.toArray(), 0.05, 0.8, 0.01) ?? 0.3;
      radius.push(r + 0.012); // sits in the fur
    }
    const pos = [], idx = [];
    // cross-section: a flat band with softly rounded edges
    const prof = [];
    for (let j = 0; j < NW; j++) { const t = (j / NW) * Math.PI * 2; const ct = Math.cos(t), st = Math.sin(t); prof.push([T / 2 * Math.sign(ct) * Math.abs(ct) ** 0.35, Wd * Math.sign(st) * Math.abs(st) ** 0.35]); }
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const d = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      for (const [o, w] of prof) {
        const p = c.clone().addScaledVector(d, radius[i] + T / 2 + o).addScaledVector(ax, w);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NW; j++) {
      const a = i * NW + j, b = ((i + 1) % NA) * NW + j, a1 = i * NW + (j + 1) % NW, b1 = ((i + 1) % NA) * NW + (j + 1) % NW;
      idx.push(a, b, a1, a1, b, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // skin weights of the nearest neck surface point
    const W = this.bodyGeo.attributes, bp = W.position.array;
    const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const near = [];
    for (let u = 0; u < bp.length / 3; u++) if ((bp[u * 3] - c.x) ** 2 + (bp[u * 3 + 1] - c.y) ** 2 + (bp[u * 3 + 2] - c.z) ** 2 < 0.36) near.push(u);
    for (let v = 0; v < n; v++) {
      let best = -1, bd = 1e9;
      for (const u of near) {
        const dd = (bp[u * 3] - pos[v * 3]) ** 2 + (bp[u * 3 + 1] - pos[v * 3 + 1]) ** 2 + (bp[u * 3 + 2] - pos[v * 3 + 2]) ** 2;
        if (dd < bd) { bd = dd; best = u; }
      }
      for (let k = 0; k < 4; k++) { si[v * 4 + k] = W.skinIndex.array[best * 4 + k]; sw[v * 4 + k] = W.skinWeight.array[best * 4 + k]; }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.collarMat = new THREE.MeshStandardMaterial({ color: 0xe8679f, roughness: 0.62 });
    this.collar = new THREE.SkinnedMesh(g, this.collarMat);
    this.collar.bind(this.skeleton, new THREE.Matrix4());
    this.collar.frustumCulled = false; this.collar.castShadow = true;
    this.root.add(this.collar);
    // small round tag on a ring at the bottom of the collar, hanging from the neck
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.9, roughness: 0.25 });
    this.collarTag = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 6, 16), gold);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.009, 20), gold);
    disc.rotation.x = Math.PI / 2; disc.position.y = -0.047;
    this.collarTag.add(ring, disc);
    const bottom = c.clone().addScaledVector(up, -(radius[NA * 3 / 4] + T + 0.012));
    this.collarTag.position.copy(this.neck2.worldToLocal(bottom));
    this.collarTag.quaternion.copy(this.neck2.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.neck2.add(this.collarTag);
  }

  setFur(on) { for (const s of this.shellMeshes) s.visible = on; }
  setCollar(c) {
    this.collar.visible = this.collarTag.visible = !!c;
    if (c) this.collarMat.color.set(c);
  }

  // Lowest world-space points of the body (needs up-to-date world matrices): `core` for the trunk
  // and `rest` for the legs and the head; the tail is ignored. The skinned body is sampled on the
  // CPU; limbs listed in `exclude` (e.g. 'FL', 'BR') are skipped, which is used for paws planted
  // by the leg IK.
  lowestPoints(exclude) {
    const C = this.contact, sk = this.skeleton, g = this.bodyGeo.attributes;
    const pa = g.position.array, si = g.skinIndex.array, sw = g.skinWeight.array;
    const rows = this._rows ||= new Float32Array(sk.bones.length * 4);
    const m = this._lm ||= new THREE.Matrix4();
    for (let b = 0; b < sk.bones.length; b++) {
      m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
      const e = m.elements;
      rows[b * 4] = e[1]; rows[b * 4 + 1] = e[5]; rows[b * 4 + 2] = e[9]; rows[b * 4 + 3] = e[13];
    }
    let core = Infinity, rest = Infinity;
    for (let k = 0; k < C.idx.length; k++) {
      const part = C.part[k];
      if (part === 'tail' || (exclude && exclude.has(C.limb[k]))) continue;
      const v = C.idx[k], x = pa[v * 3], y = pa[v * 3 + 1], z = pa[v * 3 + 2];
      let wy = 0;
      for (let j = 0; j < 4; j++) {
        const w = sw[v * 4 + j];
        if (w === 0) continue;
        const r = si[v * 4 + j] * 4;
        wy += w * (rows[r] * x + rows[r + 1] * y + rows[r + 2] * z + rows[r + 3]);
      }
      if (part === 'body') { if (wy < core) core = wy; } else if (wy < rest) rest = wy;
    }
    // the head is a rigid mesh: use its lowest points too
    const p = this.headMesh.geometry.attributes.position, e = this.headMesh.matrixWorld.elements;
    for (let i = 0; i < p.count; i += 7) {
      const y = e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13];
      if (y < rest) rest = y;
    }
    return { core, rest };
  }

  // ---------- posing ----------
  poseSkeleton(P) {
    this.root.position.y = 0.1 + P.rootY + (this.groundLift || 0);
    this.torso.position.set(0, P.torsoY, P.torsoZ);
    this.torso.rotation.set(P.pitch, 0, P.roll);
    this.pelvis.rotation.set(P.pelvisBend, P.pelvisYaw || 0, P.pelvisRoll);
    this.chest.rotation.set(P.chestBend, P.chestYaw, P.chestRoll);
    this.updateSpine();
    this.neck.rotation.set(P.neckPitch * 0.55, P.neckYaw * 0.5, P.neckRoll * 0.5, 'YXZ');
    this.neck2.rotation.set(P.neckPitch * 0.45, P.neckYaw * 0.5, P.neckRoll * 0.5, 'YXZ');
    this.head.rotation.set(P.headPitch, P.headYaw, P.headRoll, 'YXZ');
    if (P.lookYaw) this.turnHead(P.lookYaw);
    this.applyLegs(P);
    this.poseTail(P);
  }

  // apply a parameter vector to the rig
  apply(P, dt) {
    this.tailPhase = (this.tailPhase || 0) + dt * 1.6 * P.tailWaveSpeed;
    this.poseSkeleton(P);
    this.jaw.rotation.x = P.jaw;
    this.jaw.updateMatrix();
    for (const w of this.lipWebs) {
      const pa = w.g.attributes.position, v = this._wv ||= new THREE.Vector3();
      for (let i = 0; i <= w.N; i++) {
        pa.setXYZ(i * 2, w.up[i].x, w.up[i].y, w.up[i].z);
        v.copy(w.lo[i]).applyMatrix4(this.jaw.matrix);
        pa.setXYZ(i * 2 + 1, v.x, v.y, v.z);
      }
      pa.needsUpdate = true;
      w.g.computeVertexNormals();
      w.g.computeBoundingSphere();
    }
    { const j = P.jaw; this.mouthFill.visible = j > 0.03;
      for (const g of this.mouthInner) g.visible = j > 0.02 || P.tongue > 0.02;
      this.mouthFill.scale.set(0.078, 0.008 + 0.075 * j, 0.13); this.mouthFill.position.set(0, -0.168 - 0.05 * j, 0.38); }
    this.tongue.position.set(this.tongueBase.x, this.tongueBase.y + P.tongue * 0.012, this.tongueBase.z + P.tongue * 0.2);
    this.tongue.rotation.x = P.tongue * 0.3 - P.tongueUp * 0.9;
    for (const l of this.lids) {
      l.up.rotation.x = lerp(-1.05, 0.26, P.lidUp);
      l.lo.rotation.x = lerp(0.75, -0.2, P.lidLow);
    }
    for (const m of this.eyeMats) m.uniforms.uPupil.value = P.pupil;
    for (const e of this.ears) {
      // earBack turns both ears back and flattens them; earFlick twitches one ear (+ left, - right)
      const f = Math.max(0, (P.earFlick || 0) * e.s);
      e.g.rotation.set(-P.earBack * 0.55 - f * 0.25, -f * 0.35 * e.s, (-0.55 - P.earBack * 0.45 - f * 0.2) * e.s);
    }
    for (const [i, w] of this.whiskers.entries()) {
      const s = i === 0 ? 1 : -1;
      w.rotation.y = -P.whisk * 0.6 * s;
    }
  }

  // Turn the head to look sideways around the *world* vertical axis (split between the neck
  // joints and the head), so looking around never tilts the head even when the body is pitched.
  turnHead(yaw) {
    const T = this._turn ||= { q: new THREE.Quaternion(), r: new THREE.Quaternion(), a: new THREE.Vector3() };
    T.q.copy(this.root.quaternion).multiply(this.torso.quaternion).multiply(this.chest.quaternion);
    for (const [joint, share] of [[this.neck, 0.25], [this.neck2, 0.25], [this.head, 0.5]]) {
      T.a.set(0, 1, 0).applyQuaternion(T.r.copy(T.q).invert());
      joint.quaternion.premultiply(T.r.setFromAxisAngle(T.a, yaw * share));
      T.q.multiply(joint.quaternion);
    }
  }

  // leg joint angles (FK); the IK in legs.js writes into the same parameters. Shoulder (flS) and
  // hip (blH) angles are absolute in the chest / pelvis frame; the others are relative.
  applyLegs(P) {
    for (const side of ['L', 'R']) {
      const L = this.fl[side];
      // a paw reaching for the face (washing) is not kept flat
      const flatF = P.flat * (side === 'R' ? 1 - (P.reachR || 0) : 1);
      L.scap.position.y = L.scapY + (P['scY_' + side] || 0);
      L.scap.rotation.set(BIND_ANG.scap + (P['scR_' + side] || 0), 0, 0);
      const flS = P['flS_' + side];
      L.sh.rotation.set(flS - L.scap.rotation.x, 0, P['flZ_' + side] * L.s);
      L.el.rotation.x = P['flE_' + side];
      L.wr.rotation.x = P['flW_' + side];
      const sum = P.pitch + P.chestBend + flS + P['flE_' + side] + P['flW_' + side];
      L.paw.rotation.x = lerp(this.pawBindF, -sum, flatF) + P['flP_' + side];
      const B = this.bl[side];
      B.hp.rotation.set(P['blH_' + side], 0, P['blZ_' + side] * B.s);
      B.kn.rotation.x = P['blK_' + side];
      B.hk.rotation.x = P['blA_' + side];
      const sumB = P.pitch + P.pelvisBend + P['blH_' + side] + P['blK_' + side] + P['blA_' + side];
      B.ft.rotation.x = lerp(this.pawBindB, -sumB, P.flat) + P['blP_' + side];
    }
  }

  // Tail follow-through and contact with the rug. Every segment turns towards its posed
  // direction with a small lag that grows towards the tip, so the tail swings out and settles
  // when the body turns, sits down or jumps. Wherever a segment would dip below the floor it is
  // turned up just enough to lie on it; with `rest` > 0 (sitting or lying) the tail is limp and
  // heavy, so it droops to the rug and lies along it (a wrapped tail lies around the paws).
  // Runs after the root and the pelvis have their final world transforms.
  tailDynamics(dt, rest = 0, floorY = 0.12) {
    const T = this._ct ||= { a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), iq: new THREE.Quaternion() };
    const N = this.tail.length, L = this.tailSegL;
    const dirs = this._tailDirs ||= this.tail.map(() => new THREE.Vector3());
    const fresh = !this._tailInit;
    this._tailInit = true;
    this.pelvis.updateWorldMatrix(true, false);
    for (let i = 0; i < N; i++) {
      const g = this.tail[i];
      g.updateMatrixWorld();
      T.a.setFromMatrixPosition(g.matrixWorld);
      T.b.set(0, 0, -L).applyMatrix4(g.matrixWorld);
      T.d.subVectors(T.b, T.a).divideScalar(L).normalize();
      // lag behind the posed direction (more towards the tip)
      if (fresh || dt <= 0) T.e.copy(T.d);
      else T.e.copy(dirs[i]).lerp(T.d, 1 - Math.exp(-dt * lerp(26, 6, i / (N - 1)))).normalize();
      // the rug
      const r = lerp(0.14, 0.075, Math.pow((i + 1) / N, 0.85)) * 0.75 + 0.02;
      const minY = floorY + r;
      let ny = T.e.y;
      if (T.a.y + T.e.y * L < minY) {
        // a segment that starts below the limit (at the root) climbs only gently towards it
        ny = clamp((minY - T.a.y) / L, -1, T.a.y < minY ? 0.3 : 1);
      } else if (rest > 0.01) {
        ny = lerp(ny, clamp((minY - T.a.y) / L, -0.75, 0.3), rest);
      }
      if (ny !== T.e.y) {
        const h = Math.hypot(T.e.x, T.e.z), nh = Math.sqrt(Math.max(0, 1 - ny * ny));
        if (h < 1e-4) T.e.set(0, ny, -nh); else T.e.set((T.e.x / h) * nh, ny, (T.e.z / h) * nh);
      }
      dirs[i].copy(T.e);
      if (T.e.distanceToSquared(T.d) < 1e-10) continue;
      // world rotation d -> e, expressed in the parent's frame
      T.q.setFromUnitVectors(T.d, T.e);
      g.parent.getWorldQuaternion(T.pq);
      g.quaternion.premultiply(T.iq.copy(T.pq).invert().multiply(T.q).multiply(T.pq));
      g.updateMatrixWorld();
    }
  }

  poseTail(P) {
    const N = this.tail.length, ph = this.tailPhase || 0;
    for (let i = 0; i < N; i++) {
      const g = this.tail[i];
      const k = i / N;
      const wave = Math.sin(ph - i * 0.45) * P.tailWave * (0.3 + k);
      const curl = (P.tailCurl || 0) * smoothstep(k, 0.45, 1) * 0.5;
      if (i === 0) g.rotation.set(P.tailPitch, P.tailYaw + wave * 0.5, 0, 'YXZ');
      else g.rotation.set(P.tailBendX + curl, P.tailBendY + wave * 0.35, 0, 'YXZ');
    }
  }
}
