// Procedural 3D model of a black Scottish Fold cat
import * as THREE from 'three';

// ---------- Shell fur ----------
const FUR_SHELLS = 8;

function furMaterial({ color, sheen, h = 0, den = 70, len = 0.03 }) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
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
       // strands are combed along furDir and bend more towards the tip
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
          if (uFurH > 0.35 + 0.65 * hh || length(f) > rad || uFurH > vFurK * 1.15) discard;
        }
        diffuseColor.rgb *= mix(0.5, 1.15, uFurH) * (0.85 + 0.3 * hh);
      }`
    );
  };
  m.customProgramCacheKey = () => 'fur';
  return m;
}

function furSet(color, sheen, den, len) {
  const base = furMaterial({ color, sheen, h: 0, den, len });
  const shells = [];
  for (let i = 1; i <= FUR_SHELLS; i++) shells.push(furMaterial({ color, sheen, h: i / FUR_SHELLS, den, len }));
  return { base, shells };
}

// ---------- Eyes ----------
function eyeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPupil: { value: 0.4 },
      uLight: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
    },
    vertexShader: `
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vP = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uPupil; uniform vec3 uLight;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        vec2 xy = vP.xy;
        float R = 0.86;
        float d = length(xy) / R;
        vec3 col;
        if (vP.z < 0.0 || d > 1.0) {
          col = vec3(0.05,0.035,0.02);
        } else {
          float ang = atan(xy.y, xy.x);
          float streak = 0.5 + 0.5*sin(ang*37.0 + sin(ang*11.0)*2.0) * 0.5 + 0.5*sin(ang*71.0)*0.3;
          vec3 inner = vec3(0.56,0.64,0.16);   // greenish near the pupil
          vec3 mid   = vec3(0.90,0.82,0.26);   // lemon yellow
          vec3 outer = vec3(0.70,0.62,0.16);   // darker towards the edge
          col = mix(inner, mid, smoothstep(0.12,0.5,d));
          col = mix(col, outer, smoothstep(0.72,0.95,d));
          col *= 0.85 + 0.25*streak;
          col *= 1.0 - 0.8*smoothstep(0.93,1.0,d);   // dark limbal ring
          col *= mix(0.5, 1.0, smoothstep(0.85, 0.25, xy.y / R)); // shadow from the upper lid
          // pupil
          vec2 pp = xy / vec2(uPupil*R*0.75, R*0.9);
          float pd = length(pp);
          col = mix(vec3(0.005), col, smoothstep(0.92,1.06,pd));
        }
        vec3 n = normalize(vN);
        float dif = 0.55 + 0.45*max(dot(n, uLight),0.0);
        col *= dif;
        vec3 r = reflect(-uLight, n);
        float spec = pow(max(dot(r, normalize(vV)),0.0), 260.0) * 2.0 + pow(max(dot(r, normalize(vV)),0.0), 30.0) * 0.12;
        float fres = pow(1.0 - max(dot(n, normalize(vV)),0.0), 3.0);
        col += vec3(1.0,0.97,0.9)*spec*1.6 + vec3(0.25,0.27,0.3)*fres*0.5;
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- Pose parameters ----------
export const BASE = {
  rootY: 0,
  torsoY: 1.6, torsoZ: 0, pitch: 0, roll: 0,
  pelvisBend: 0, pelvisRoll: 0, chestBend: 0, chestYaw: 0, chestRoll: 0,
  neckPitch: -0.95, neckYaw: 0, neckRoll: 0,
  headPitch: 0.85, headYaw: 0, headRoll: 0,
  jaw: 0, tongue: 0, tongueUp: 0, lidUp: 0.04, lidLow: 0.08, pupil: 0.45,
  earBack: 0, whisk: 0, look: 1, flat: 1,
  // leg IK weights (1 = paws planted on the floor) and paw placement offsets along the body
  ikF_L: 1, ikF_R: 1, ikB_L: 1, ikB_R: 1, fzF: 0, fzB: 0,
  // right front paw reaching for a point in head space (washing), and its wrist bend
  reachR: 0, reachX: 0, reachY: 0, reachZ: 0, reachW: 0,
  flS_L: 0.89, flE_L: -0.89, flW_L: 0, flZ_L: 0, flP_L: 0,
  flS_R: 0.89, flE_R: -0.89, flW_R: 0, flZ_R: 0, flP_R: 0,
  blH_L: -0.42, blK_L: 1.25, blA_L: -1.07, blZ_L: 0, blP_L: 0,
  blH_R: -0.42, blK_R: 1.25, blA_R: -1.07, blZ_R: 0, blP_R: 0,
  tailPitch: -0.75, tailYaw: 0, tailBendX: 0.07, tailBendY: 0, tailWave: 0.12, tailWaveSpeed: 1,
};

function ellipsoid(rx, ry, rz, seg = 28) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz);
  return g;
}
function capsuleDown(r, len, r2) {
  // capsule going from 0 down to -len; r2 is the radius at the end (taper)
  const g = new THREE.CapsuleGeometry(r, len, 8, 16);
  g.translate(0, -len / 2, 0);
  if (r2 !== undefined) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = THREE.MathUtils.clamp(-y / len, 0, 1);
      const k = THREE.MathUtils.lerp(1, r2 / r, t);
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

// tube tapering towards its end (whiskers)
function taperTube(curve, segs, r, tip = 0.15, radial = 5) {
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const k = THREE.MathUtils.lerp(1, tip, Math.pow(t, 0.8));
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export class Cat {
  constructor() {
    this.root = new THREE.Group();
    this.parts = []; // meshes used for raycasting
    this.shellMeshes = [];
    this.fur = furSet(0x060505, 0x3a312c, 130, 0.034);
    this.furMuzzle = furSet(0x151312, 0x6f6a64, 150, 0.022);
    this.furChin = furSet(0x24170f, 0x8a6550, 150, 0.024);
    this.matPad = new THREE.MeshStandardMaterial({ color: 0x5a4549, roughness: 0.55 });
    this.matNose = new THREE.MeshPhysicalMaterial({ color: 0x2b2627, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    this.matMouth = new THREE.MeshStandardMaterial({ color: 0x9a3a4a, roughness: 0.5, emissive: 0x3a0e16 });
    this.matTongue = new THREE.MeshPhysicalMaterial({ color: 0xd9788a, roughness: 0.4, clearcoat: 0.4 });
    this.matTooth = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.3 });
    this.matWhisker = new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.35 });
    this.matWhiskerDark = new THREE.MeshStandardMaterial({ color: 0x55504c, roughness: 0.4 });
    this.eyeMats = [];
    this.matLid = new THREE.MeshPhysicalMaterial({ color: 0x080606, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0x3a312c), sheenRoughness: 0.5 });
    this.matLidRim = new THREE.MeshStandardMaterial({ color: 0x030202, roughness: 0.45 });
    this.matPalate = new THREE.MeshStandardMaterial({ color: 0xc06474, roughness: 0.5, emissive: 0x3a1018 });
    this.matGum = new THREE.MeshStandardMaterial({ color: 0x6e2e3a, roughness: 0.5 });
    this.matThroat = new THREE.MeshBasicMaterial({ color: 0x1c0709 });
    this.matLip = new THREE.MeshStandardMaterial({ color: 0x0a0707, roughness: 0.4 });
    this.build();
  }

  addPart(parent, geo, pos, part, set = this.fur, opts = {}) {
    const m = new THREE.Mesh(geo, set.base || set);
    m.position.set(...pos);
    if (opts.rot) m.rotation.set(...opts.rot);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.part = part;
    if (!geo.attributes.furP) geo.setAttribute('furP', geo.attributes.position.clone());
    const n = geo.attributes.position.count;
    if (!geo.attributes.furDir) {
      const d = new THREE.Vector3(...(opts.dir || [0, 0, -1])).normalize();
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([d.x, d.y, d.z], i * 3);
      geo.setAttribute('furDir', new THREE.BufferAttribute(a, 3));
    }
    if (!geo.attributes.furK) {
      const k = new Float32Array(n).fill(opts.k ?? 1);
      if (opts.kFn) {
        const pa = geo.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < n; i++) k[i] = opts.kFn(v.fromBufferAttribute(pa, i).add(m.position), k[i]);
      }
      geo.setAttribute('furK', new THREE.BufferAttribute(k, 1));
    }
    parent.add(m);
    this.parts.push(m);
    if (set.shells && opts.fur !== false) {
      for (const sm of set.shells) {
        const s = new THREE.Mesh(geo, sm);
        s.userData.part = part;
        s.raycast = () => {};
        m.add(s);
        this.shellMeshes.push(s);
      }
    }
    return m;
  }

  build() {
    const G = () => new THREE.Group();
    const root = this.root;

    this.torso = G(); root.add(this.torso);
    // pelvis
    this.pelvis = G(); this.torso.add(this.pelvis);
    // chest (the group must exist before the body loft is built)
    this.chest = G(); this.chest.position.set(0, 0.05, 0.66); this.torso.add(this.chest);
    // small light spot on the belly (as in the photos)
    const spot = new THREE.Mesh(ellipsoid(0.07, 0.03, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x8a8582, roughness: 0.9 }));
    spot.position.set(0.05, -0.47, 0.55); this.torso.add(spot);

    // neck: its surface is part of the body loft (see updateBody), this is just the joint
    this.neck = G(); this.neck.position.set(0, 0.18, 1.05); this.chest.add(this.neck);
    // collar: lives in torso space and is fitted to the neck section of the body loft every
    // frame (see updateBody), so it always hugs the neck whatever the pose
    this.collar = new THREE.Group();
    this.collar.matrixAutoUpdate = false;
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xe8679f, roughness: 0.55 });
    this.collarMat = collarMat;
    this.collarBand = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 10, 56), collarMat);
    this.collarBand.castShadow = true;
    this.collar.add(this.collarBand);
    // small round tag on a ring at the bottom of the collar
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.9, roughness: 0.25 });
    this.collarTag = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 16), gold);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), gold);
    disc.rotation.x = Math.PI / 2; disc.position.y = -0.065;
    this.collarTag.add(ring, disc);
    this.collar.add(this.collarTag);
    this.torso.add(this.collar);

    // head
    this.head = G(); this.head.position.set(0, 0.5, 0.42); this.neck.add(this.head);
    const H = this.head;
    // fur is short and smooth around the eyes and nose
    const EYE = [new THREE.Vector3(0.26, 0.085, 0.395), new THREE.Vector3(-0.26, 0.085, 0.395)];
    const NOSE = new THREE.Vector3(0, -0.11, 0.545);
    const faceK = (v, k) => {
      const de = Math.min(v.distanceTo(EYE[0]), v.distanceTo(EYE[1]));
      const dn = v.distanceTo(NOSE);
      return k * (0.04 + 0.96 * THREE.MathUtils.smoothstep(de, 0.14, 0.3)) * (0.2 + 0.8 * THREE.MathUtils.smoothstep(dn, 0.05, 0.16));
    };
    // skull, hollowed at the front-bottom for the mouth cavity (covered by the chin and whisker pads)
    const skull = ellipsoid(0.66, 0.55, 0.56, 40);
    { const pa = skull.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const w = (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.06, 0.13)) * THREE.MathUtils.smoothstep(-y, 0.17, 0.24) * THREE.MathUtils.smoothstep(z, 0.2, 0.32);
        pa.setZ(i, z - 0.16 * w);
      }
      skull.computeVertexNormals(); }
    this.addPart(H, skull, [0, 0, 0], 'head', this.fur, { dir: [0, 0.3, -1], k: 0.9, kFn: faceK });
    // cheeks (Scottish Folds have a round, wide face)
    this.addPart(H, ellipsoid(0.28, 0.24, 0.26), [0.27, -0.2, 0.17], 'head', this.fur, { dir: [1, -0.6, -0.7], k: 1.4, kFn: faceK });
    this.addPart(H, ellipsoid(0.28, 0.24, 0.26), [-0.27, -0.2, 0.17], 'head', this.fur, { dir: [-1, -0.6, -0.7], k: 1.4, kFn: faceK });
    // wide nose bridge from the eyes down to the nose
    this.addPart(H, ellipsoid(0.16, 0.18, 0.1), [0, -0.03, 0.45], 'head', this.fur, { dir: [0, 1, -0.3], k: 0.45, kFn: faceK });
    // whisker pads
    this.addPart(H, ellipsoid(0.105, 0.08, 0.08), [0.08, -0.2, 0.455], 'nose', this.furMuzzle, { dir: [1, -0.3, 0], k: 0.4, kFn: faceK });
    this.addPart(H, ellipsoid(0.105, 0.08, 0.08), [-0.08, -0.2, 0.455], 'nose', this.furMuzzle, { dir: [-1, -0.3, 0], k: 0.4, kFn: faceK });
    // nose leather: a dark grey triangle
    const ng = ellipsoid(0.07, 0.042, 0.03, 20);
    { const p = ng.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < 0 ? 1 + (y / 0.042) * 0.7 : 1; p.setX(i, p.getX(i) * k); }
      ng.computeVertexNormals(); }
    const nose = new THREE.Mesh(ng, this.matNose);
    nose.position.set(0, -0.11, 0.545); nose.rotation.x = 0.45;
    nose.userData.part = 'nose'; H.add(nose); this.parts.push(nose);
    this.nose = nose;
    const dark = new THREE.MeshBasicMaterial({ color: 0x060505 });
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(ellipsoid(0.013, 0.008, 0.01, 8), dark);
      n.position.set(0.026 * s, -0.122, 0.568); n.rotation.z = 0.5 * s; H.add(n);
    }
    // philtrum and the inverted-Y mouth line
    const line = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 8, r, 5), dark);
    H.add(line([[0, -0.14, 0.558], [0, -0.18, 0.55], [0, -0.215, 0.535]], 0.005));
    for (const s of [-1, 1]) H.add(line([[0, -0.215, 0.535], [0.04 * s, -0.233, 0.52], [0.075 * s, -0.238, 0.49]], 0.004));
    this.buildMouth(H);

    // eyes: round, wide-set, outer corners slightly raised
    this.eyes = []; this.lids = [];
    for (const s of [1, -1]) {
      const eg = G(); eg.position.set(0.26 * s, 0.085, 0.395); eg.rotation.set(0, 0.2 * s, 0.1 * s); H.add(eg);
      const look = G(); eg.add(look);
      const em = eyeMaterial(); this.eyeMats.push(em);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.142, 32, 24), em);
      look.add(eye);
      const lidGeoU = new THREE.SphereGeometry(0.155, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const lidGeoL = new THREE.SphereGeometry(0.152, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const up = new THREE.Mesh(lidGeoU, this.matLid); up.castShadow = false;
      const lo = new THREE.Mesh(lidGeoL, this.matLid);
      eg.add(up); eg.add(lo);
      // eyelid margin: a dark rim along each lid edge that moves with the lid
      for (const [lid, r] of [[up, 0.155], [lo, 0.152]]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.002, 0.0075, 6, 32, Math.PI), this.matLidRim);
        rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI; lid.add(rim);
      }
      this.eyes.push(look); this.lids.push({ up, lo });
    }

    // ears folded tightly forward at the corners of the head
    this.ears = [];
    for (const s of [1, -1]) {
      const eg = G(); eg.position.set(0.37 * s, 0.38, 0.0); H.add(eg);
      const bg = new THREE.CylinderGeometry(0.17, 0.25, 0.13, 20); bg.scale(1, 1, 0.5); bg.translate(0, 0.065, 0);
      this.addPart(eg, bg, [0, 0, 0], 'head', this.fur, { dir: [0, 1, 0], k: 0.6 });
      const fold = G(); fold.position.set(0, 0.12, 0.04); eg.add(fold);
      const tgeo = new THREE.ConeGeometry(0.18, 0.24, 20); tgeo.scale(1, 1, 0.35); tgeo.translate(0, 0.12, 0);
      this.addPart(fold, tgeo, [0, 0, 0], 'head', this.fur, { dir: [0, 1, 0], k: 0.5 });
      this.ears.push({ g: eg, fold, s });
    }

    // whiskers
    this.whiskers = [];
    for (const s of [1, -1]) {
      const wg = G(); wg.position.set(0.12 * s, -0.2, 0.465); H.add(wg);
      for (let i = 0; i < 8; i++) {
        const yy = (i - 4) * 0.022;
        const len = 0.6 + Math.random() * 0.25;
        const dir = new THREE.Vector3(s, (i - 4) * 0.11 - 0.05, -0.25 + Math.random() * 0.15).normalize();
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          pts.push(new THREE.Vector3(dir.x * len * t, yy + dir.y * len * t - 0.12 * t * t, dir.z * len * t + 0.02 * Math.sin(t * 3)));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = taperTube(curve, 14, 0.0055, 0.12);
        // a couple of darker whiskers, as in the photos
        const w = new THREE.Mesh(tube, i === 1 || i === 6 ? this.matWhiskerDark : this.matWhisker);
        wg.add(w);
      }
      this.whiskers.push(wg);
      // eyebrow whiskers
      const bg = G(); bg.position.set(0.25 * s, 0.24, 0.42); H.add(bg);
      for (let i = 0; i < 2; i++) {
        const len = 0.26 + i * 0.06;
        const pts = [];
        for (let k = 0; k <= 4; k++) {
          const t = k / 4;
          pts.push(new THREE.Vector3(s * (0.5 + i * 0.3) * t * len, (0.55 - i * 0.15) * t * len, 0.45 * t * len - 0.04 * t * t));
        }
        bg.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), 8, 0.0042, 0.15), this.matWhisker));
      }
    }

    // ---- front legs ----
    this.fl = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      // shoulder joint sits inside the chest; the upper arm runs down and back so the
      // elbow tucks against the bottom of the chest, and the forearm hangs straight down
      const sh = G(); sh.position.set(0.27 * s, -0.12, 0.72); this.chest.add(sh);
      this.addPart(sh, ellipsoid(0.19, 0.36, 0.26), [-0.03 * s, -0.17, 0], 'body', this.fur, { dir: [0, -1, -0.3] });
      this.addPart(sh, capsuleDown(0.15, 0.4, 0.12), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.8 });
      const el = G(); el.position.set(0, -0.5, 0); sh.add(el);
      this.addPart(el, capsuleDown(0.128, 0.9, 0.088), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.7 });
      const wr = G(); wr.position.set(0, -0.98, 0); el.add(wr);
      const paw = G(); wr.add(paw);
      this.addPart(paw, ellipsoid(0.13, 0.11, 0.17), [0, -0.005, 0.06], 'paw', this.fur, { dir: [0, -0.3, 1], k: 0.6 });
      this.addPads(paw, 0.13);
      this.addToes(paw, 0.13, 0.17);
      this.fl[side] = { sh, el, wr, paw, s };
      sh.traverse((o) => { o.userData.limb = 'F' + side; });
    }
    // ---- hind legs ----
    this.bl = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const hp = G(); hp.position.set(0.3 * s, -0.05, -0.1); this.pelvis.add(hp);
      // thigh: broad and muscular, blending into the body
      this.addPart(hp, ellipsoid(0.25, 0.48, 0.38), [0.02 * s, -0.2, 0.02], 'body', this.fur, { dir: [0, -1, -0.4], k: 1.2 });
      this.addPart(hp, capsuleDown(0.19, 0.5, 0.12), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0] });
      const kn = G(); kn.position.set(0, -0.62, 0); hp.add(kn);
      this.addPart(kn, capsuleDown(0.11, 0.58, 0.075), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.7 });
      // calf muscle behind the shin
      this.addPart(kn, ellipsoid(0.1, 0.24, 0.12), [0, -0.2, -0.05], 'paw', this.fur, { dir: [0, -1, 0], k: 0.8 });
      const hk = G(); hk.position.set(0, -0.68, 0); kn.add(hk);
      this.addPart(hk, capsuleDown(0.08, 0.36, 0.075), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.6 });
      // heel (hock)
      this.addPart(hk, ellipsoid(0.075, 0.08, 0.09), [0, 0.0, -0.03], 'paw', this.fur, { dir: [0, -1, 0], k: 0.6 });
      const ft = G(); ft.position.set(0, -0.46, 0); hk.add(ft);
      this.addPart(ft, ellipsoid(0.12, 0.1, 0.18), [0, -0.01, 0.07], 'paw', this.fur, { dir: [0, -0.3, 1], k: 0.6 });
      this.addPads(ft, 0.12);
      this.addToes(ft, 0.12, 0.18);
      this.bl[side] = { hp, kn, hk, ft, s };
      hp.traverse((o) => { o.userData.limb = 'B' + side; });
    }

    this.legLen = { F: [0.5, 0.98], B: [0.62, 0.68, 0.46] };

    // ---- tail ----
    this.tail = [];
    let parent = this.pelvis;
    const N = 15, segL = 0.155;
    for (let i = 0; i < N; i++) {
      const g = G();
      g.position.set(0, i === 0 ? 0.3 : 0, i === 0 ? -0.62 : -segL);
      parent.add(g);
      this.tail.push(g);
      parent = g;
    }
    this.tailSegL = segL;
    this.buildTail();
    // body and neck: one smooth deformable loft along the spine
    this.buildBody();
  }

  // ---------- Tail: one smooth tube following the tail joints ----------
  buildTail() {
    const NR = 48, NA = 14;
    this.tailN = [NR, NA];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NR + 1) * (NA + 1) * 3), 3));
    const idx = [];
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + NA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    g.setIndex(idx);
    this.tailGeo = g;
    this._tm = new THREE.Matrix4();
    this._tailCurve = new THREE.CatmullRomCurve3(Array.from({ length: this.tail.length + 1 }, () => new THREE.Vector3()), false, 'centripetal');
    for (const t of this.tail) t.updateMatrix();
    this.updateTail();
    g.setAttribute('furP', g.attributes.position.clone());
    // fur runs along the tail and gets fluffier towards the tip
    const n = g.attributes.position.count, d = new Float32Array(n * 3), k = new Float32Array(n);
    const tg = new THREE.Vector3();
    for (let i = 0; i <= NR; i++) {
      this._tailCurve.getTangentAt(i / NR, tg);
      for (let j = 0; j <= NA; j++) { const id = i * (NA + 1) + j; d.set([tg.x, tg.y, tg.z], id * 3); k[id] = 1.2 + 0.4 * (i / NR); }
    }
    g.setAttribute('furDir', new THREE.BufferAttribute(d, 3));
    g.setAttribute('furK', new THREE.BufferAttribute(k, 1));
    this.tailMesh = this.addPart(this.pelvis, g, [0, 0, 0], 'tail');
  }

  updateTail() {
    const [NR, NA] = this.tailN;
    const pts = this._tailCurve.points, m = this._tm.identity();
    for (let i = 0; i < this.tail.length; i++) {
      m.multiply(this.tail[i].matrix);
      pts[i].setFromMatrixPosition(m);
    }
    pts[this.tail.length].set(0, 0, -this.tailSegL).applyMatrix4(m);
    const frames = this._tailCurve.computeFrenetFrames(NR, false);
    const pos = this.tailGeo.attributes.position.array, c = new THREE.Vector3();
    let o = 0;
    for (let i = 0; i <= NR; i++) {
      const s = i / NR;
      this._tailCurve.getPointAt(s, c);
      let r = THREE.MathUtils.lerp(0.13, 0.062, Math.pow(s, 0.9));
      if (s > 0.94) r *= Math.sqrt(Math.max(0, 1 - ((s - 0.94) / 0.06) ** 2)) * 0.9 + 0.1 * (1 - (s - 0.94) / 0.06);
      const N = frames.normals[i], B = frames.binormals[i];
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        pos[o++] = c.x + N.x * ca + B.x * sa;
        pos[o++] = c.y + N.y * ca + B.y * sa;
        pos[o++] = c.z + N.z * ca + B.z * sa;
      }
    }
    this.tailGeo.attributes.position.needsUpdate = true;
    this.tailGeo.computeVertexNormals();
    this.tailGeo.computeBoundingSphere();
  }

  // ---------- Mouth: palate, teeth, gums, tongue ----------
  buildMouth(H) {
    const G = () => new THREE.Group();
    // oral cavity: dark throat and pink walls
    const cav = new THREE.Mesh(ellipsoid(0.075, 0.04, 0.13, 18), this.matMouth);
    cav.position.set(0, -0.25, 0.33); H.add(cav);
    const throat = new THREE.Mesh(ellipsoid(0.06, 0.045, 0.05, 12), this.matThroat);
    throat.position.set(0, -0.27, 0.24); H.add(throat);
    // cavity filler: grows as the jaw opens and hides the skull behind the mouth
    this.mouthFill = new THREE.Mesh(ellipsoid(1, 1, 1, 20), new THREE.MeshStandardMaterial({ color: 0xa8404f, roughness: 0.5, emissive: 0x2a080e, side: THREE.BackSide }));
    this.mouthFill.visible = false; H.add(this.mouthFill);
    // palate with transverse ridges
    const pal = new THREE.Mesh(ellipsoid(0.072, 0.022, 0.13, 18), this.matPalate);
    pal.position.set(0, -0.232, 0.37); H.add(pal);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.05 - i * 0.004, 0.0045, 5, 16, Math.PI), this.matGum);
      r.rotation.x = Math.PI / 2; r.position.set(0, -0.247, 0.43 - i * 0.028); r.scale.set(0.9, 0.6, 1); H.add(r);
    }
    // upper gum and teeth
    const gumU = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24, Math.PI), this.matGum);
    gumU.rotation.x = Math.PI / 2; gumU.position.set(0, -0.232, 0.415); gumU.scale.set(1, 1.15, 1); H.add(gumU);
    const fang = (len, r) => { const g = new THREE.ConeGeometry(r, len, 10); g.translate(0, -len / 2, 0); return g; };
    for (const s of [-1, 1]) {
      // canine, slightly curved back
      const c = new THREE.Mesh(fang(0.048, 0.015), this.matTooth);
      c.position.set(0.046 * s, -0.24, 0.475); c.rotation.set(-0.15, 0, 0.06 * s); H.add(c);
      // premolars
      for (let i = 0; i < 2; i++) {
        const pm = new THREE.Mesh(fang(0.03, 0.011), this.matTooth);
        pm.position.set(0.058 * s, -0.244, 0.43 - i * 0.04); H.add(pm);
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.28;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0045, 0.02, 6), this.matTooth);
      t.position.set(Math.sin(a) * 0.034, -0.25, 0.445 + Math.cos(a) * 0.042); H.add(t);
    }
    // upper lip: black edge
    const lipU = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 28, Math.PI), this.matLip);
    lipU.rotation.x = Math.PI / 2; lipU.position.set(0, -0.247, 0.45); lipU.scale.set(1, 1.15, 1); H.add(lipU);

    // lower jaw
    this.jaw = G(); this.jaw.position.set(0, -0.21, 0.285); H.add(this.jaw);
    // chin with a reddish-brown tint (as in the photos)
    this.addPart(this.jaw, ellipsoid(0.085, 0.048, 0.125), [0, -0.05, 0.13], 'head', this.furChin, { dir: [0, -1, -0.5], k: 0.8 });
    const floor = new THREE.Mesh(ellipsoid(0.07, 0.018, 0.12, 16), this.matMouth);
    floor.position.set(0, -0.03, 0.12); this.jaw.add(floor);
    const gumL = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 8, 24, Math.PI), this.matGum);
    gumL.rotation.x = Math.PI / 2; gumL.position.set(0, -0.022, 0.16); gumL.scale.set(1, 1.2, 1); this.jaw.add(gumL);
    const lipL = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.008, 6, 28, Math.PI), this.matLip);
    lipL.rotation.x = Math.PI / 2; lipL.position.set(0, -0.02, 0.16); lipL.scale.set(1, 1.2, 1); this.jaw.add(lipL);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(fang(0.05, 0.013), this.matTooth);
      c.rotation.set(Math.PI + 0.2, 0, 0); c.position.set(0.042 * s, -0.02, 0.205); this.jaw.add(c);
      const pm = new THREE.Mesh(fang(0.025, 0.01), this.matTooth);
      pm.rotation.x = Math.PI; pm.position.set(0.055 * s, -0.02, 0.15); this.jaw.add(pm);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.3;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.016, 6), this.matTooth);
      t.position.set(Math.sin(a) * 0.03, -0.012, 0.165 + Math.cos(a) * 0.045); this.jaw.add(t);
    }
    // tongue: flat, rounded tip, central groove
    this.tongue = G(); this.tongue.position.set(0, 0.0, 0.04); this.jaw.add(this.tongue);
    const tg = ellipsoid(0.058, 0.02, 0.13, 24);
    { const pa = tg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const w = 1 + 0.25 * THREE.MathUtils.smoothstep(z, -0.05, 0.08);     // wider towards the tip
        const groove = y > 0 ? -0.006 * Math.exp(-(x * x) / 0.0002) : 0;     // central groove
        pa.setXYZ(i, x * w, y + groove + (y > 0 ? 0.004 * Math.max(0, z) : 0), z);
      }
      tg.computeVertexNormals(); }
    tg.translate(0, 0, 0.08);
    this.tongueMesh = new THREE.Mesh(tg, new THREE.MeshPhysicalMaterial({ color: 0xd9788a, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xffc0c8) }));
    this.tongue.add(this.tongueMesh);
  }

  // ---------- Body loft ----------
  buildBody() {
    const NR = 46, NA = 30;
    this.bodyN = [NR, NA];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NR + 1) * (NA + 1) * 3), 3));
    const idx = [];
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + NA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    g.setIndex(idx);
    this.bodyGeo = g;
    this._v = { c: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), x: new THREE.Vector3(), up: new THREE.Vector3(), uc: new THREE.Vector3() };
    this._curve = new THREE.CatmullRomCurve3([0, 0, 0, 0, 0, 0, 0].map(() => new THREE.Vector3()), false, 'centripetal');
    this.breath = 0;
    this.updateBody();
    g.setAttribute('furP', g.attributes.position.clone());
    // fluffy chest and neck ruff: longer fur at the front-bottom
    { const pos = g.attributes.position, k = new Float32Array(pos.count), d = new Float32Array(pos.count * 3);
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
        const id = i * (NA + 1) + j, s = i / NR, sa = Math.sin((j / NA) * Math.PI * 2);
        const chestF = THREE.MathUtils.smoothstep(s, 0.48, 0.7) * (1 - THREE.MathUtils.smoothstep(s, 0.78, 0.9)) * THREE.MathUtils.clamp(0.3 - sa, 0, 1);
        const ruff = THREE.MathUtils.smoothstep(s, 0.7, 0.85) * (1 - THREE.MathUtils.smoothstep(s, 0.93, 1));
        k[id] = 1 + 0.9 * chestF + 0.3 * ruff;
        d.set([0, -0.25 * Math.max(0, -sa) - 0.4 * ruff, -1], id * 3);
      }
      g.setAttribute('furK', new THREE.BufferAttribute(k, 1));
      g.setAttribute('furDir', new THREE.BufferAttribute(d, 3)); }
    this.bodyMesh = this.addPart(this.torso, g, [0, 0, 0], 'body');
  }

  updateBody() {
    const [NR, NA] = this.bodyN;
    const pel = this.pelvis, ch = this.chest, V = this._v;
    pel.updateMatrix(); ch.updateMatrix(); this.neck.updateMatrix(); this.head.updateMatrix();
    const mN = (this._mN ||= new THREE.Matrix4()).multiplyMatrices(ch.matrix, this.neck.matrix);
    const mH = (this._mH ||= new THREE.Matrix4()).multiplyMatrices(mN, this.head.matrix);
    const P = this._curve.points;
    P[0].set(0, 0.13, -0.74).applyMatrix4(pel.matrix);
    P[1].set(0, 0.11, -0.2).applyMatrix4(pel.matrix);
    P[2].set(0, 0.09, 0.34);
    P[3].set(0, 0.05, 0.4).applyMatrix4(ch.matrix);
    P[4].set(0, 0.0, 0.88).applyMatrix4(ch.matrix);
    P[5].set(0, 0.1, 0.2).applyMatrix4(mN);
    // the neck joins the back of the skull (not its underside), leaving room for the chin
    P[6].set(0, -0.04, -0.3).applyMatrix4(mH);
    V.up.set(0, 1, 0).applyQuaternion(pel.quaternion);
    V.uc.set(0, 1, 0).applyQuaternion(ch.quaternion);
    (V.un ||= new THREE.Vector3()).set(0, 1, 0).applyMatrix4(mN).sub(V.c.set(0, 0, 0).applyMatrix4(mN)).normalize();
    // profile: s, half-width, half-height, vertical offset
    const PR = [[0, 0.46, 0.5, 0], [0.15, 0.53, 0.56, 0], [0.3, 0.45, 0.52, -0.03], [0.48, 0.46, 0.59, -0.05], [0.64, 0.39, 0.42, -0.05], [0.82, 0.27, 0.29, 0], [1, 0.26, 0.28, 0]];
    const prof = (s, k) => {
      for (let i = 1; i < PR.length; i++) if (s <= PR[i][0]) {
        const t = (s - PR[i - 1][0]) / (PR[i][0] - PR[i - 1][0]);
        const e = t * t * (3 - 2 * t);
        return PR[i - 1][k] + (PR[i][k] - PR[i - 1][k]) * e;
      }
      return PR[PR.length - 1][k];
    };
    const pos = this.bodyGeo.attributes.position.array;
    let o = 0;
    for (let i = 0; i <= NR; i++) {
      const s = i / NR;
      this._curve.getPoint(s, V.c);
      this._curve.getTangent(s, V.t);
      const w = THREE.MathUtils.smoothstep(s, 0.2, 0.5);
      V.u.copy(V.up).lerp(V.uc, w).lerp(V.un, THREE.MathUtils.smoothstep(s, 0.68, 0.9)).normalize();
      V.x.crossVectors(V.u, V.t).normalize();
      V.u.crossVectors(V.t, V.x);
      let k = 1;
      const e0 = 0.12, e1 = 0.05;
      if (s < e0) k = Math.sqrt(Math.max(0, 1 - ((e0 - s) / e0) ** 2));
      else if (s > 1 - e1) k = Math.sqrt(Math.max(0, 1 - ((s - 1 + e1) / e1) ** 2));
      k *= 1 + this.breath * Math.exp(-((s - 0.45) ** 2) / 0.02);
      const rx = prof(s, 1) * k, ry = prof(s, 2) * k, off = prof(s, 3);
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const yy = sa < 0 ? sa * 1.02 : sa * (1 - 0.12 * ca * ca);
        const xx = rx * ca, y2 = ry * yy + off;
        pos[o++] = V.c.x + V.x.x * xx + V.u.x * y2;
        pos[o++] = V.c.y + V.x.y * xx + V.u.y * y2;
        pos[o++] = V.c.z + V.x.z * xx + V.u.z * y2;
      }
    }
    this.bodyGeo.attributes.position.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    this.bodyGeo.computeBoundingSphere();

    // fit the collar to the neck section: centre, orientation and radii from the loft
    const cs = 0.8;
    this._curve.getPoint(cs, V.c);
    this._curve.getTangent(cs, V.t);
    V.u.copy(V.uc).lerp(V.un, THREE.MathUtils.smoothstep(cs, 0.68, 0.9)).normalize();
    V.x.crossVectors(V.u, V.t).normalize();
    V.u.crossVectors(V.t, V.x);
    const crx = prof(cs, 1), cry = prof(cs, 2), coff = prof(cs, 3);
    const m = this.collar.matrix.makeBasis(V.x, V.u, V.t);
    m.setPosition(V.c.x + V.u.x * coff, V.c.y + V.u.y * coff, V.c.z + V.u.z * coff);
    this.collarBand.scale.set(crx + 0.035, cry * 0.98 + 0.035, 0.42);
    this.collarTag.position.set(0, -(cry + 0.05), 0.03);
    this.collar.matrixWorldNeedsUpdate = true;
  }

  // toes: bumps along the front edge of the paw
  addToes(paw, r, len) {
    const k = r / 0.13;
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.052 * k;
      const z = 0.06 + len * 0.92 - Math.abs(i - 1.5) * 0.035 * k;
      this.addPart(paw, ellipsoid(0.045 * k, 0.058 * k, 0.06 * k, 12), [x * 1.1, -0.035, z], 'paw', this.fur, { fur: false });
    }
  }

  addPads(paw, r) {
    const big = new THREE.Mesh(ellipsoid(r * 0.45, 0.02, r * 0.4, 12), this.matPad);
    big.position.set(0, -0.105, 0.04); paw.add(big);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(ellipsoid(r * 0.17, 0.018, r * 0.2, 10), this.matPad);
      const a = (i - 1.5) * 0.45;
      b.position.set(Math.sin(a) * r * 0.62, -0.1, 0.07 + Math.cos(a) * r * 0.85);
      paw.add(b);
    }
  }

  setFur(on) { for (const s of this.shellMeshes) s.visible = on; }

  // lowest world-space point of the body (needs up-to-date world matrices); limbs listed in
  // `exclude` (e.g. 'FL', 'BR') are skipped, which is used for paws planted by the leg IK
  lowestPoint(exclude, filter) {
    let min = Infinity;
    for (const m of this.parts) {
      if (!m.visible || (exclude && exclude.has(m.userData.limb)) || (filter && !filter(m))) continue;
      const pa = m.geometry.attributes.position, e = m.matrixWorld.elements;
      const step = pa.count > 300 ? 3 : 1;
      for (let i = 0; i < pa.count; i += step) {
        const y = e[1] * pa.getX(i) + e[5] * pa.getY(i) + e[9] * pa.getZ(i) + e[13];
        if (y < min) min = y;
      }
    }
    return min;
  }
  setCollar(c) {
    this.collar.visible = !!c;
    if (c) this.collarMat.color.set(c);
  }

  // apply a parameter vector to the rig
  apply(P, dt) {
    this.root.position.y = 0.1 + P.rootY + (this.groundLift || 0);
    this.torso.position.set(0, P.torsoY, P.torsoZ);
    this.torso.rotation.set(P.pitch, 0, P.roll);
    this.pelvis.rotation.set(P.pelvisBend, 0, P.pelvisRoll);
    this.chest.rotation.set(P.chestBend, P.chestYaw, P.chestRoll);
    this.neck.rotation.set(P.neckPitch, P.neckYaw, P.neckRoll, 'YXZ');
    this.head.rotation.set(P.headPitch, P.headYaw, P.headRoll, 'YXZ');
    if (P.lookYaw) this.turnHead(P.lookYaw);
    this.updateBody();
    this.jaw.rotation.x = P.jaw * 1.0;
    { const j = P.jaw; this.mouthFill.visible = j > 0.03;
      this.mouthFill.scale.set(0.07, 0.012 + 0.085 * j, 0.11); this.mouthFill.position.set(0, -0.245 - 0.07 * j, 0.37); }
    this.tongue.position.z = 0.01 + P.tongue * 0.33;
    this.tongue.position.y = -0.012 + P.tongue * 0.025;
    this.tongue.rotation.x = P.tongue * 0.35 - P.tongueUp * 0.9;
    for (const l of this.lids) {
      l.up.rotation.x = THREE.MathUtils.lerp(-1.05, 0.26, P.lidUp);
      l.lo.rotation.x = THREE.MathUtils.lerp(0.75, -0.2, P.lidLow);
    }
    for (const m of this.eyeMats) m.uniforms.uPupil.value = P.pupil;
    for (const e of this.ears) {
      e.g.rotation.set(-0.05 - P.earBack * 0.6, 0, (-0.62 - P.earBack * 0.5) * e.s);
      e.fold.rotation.x = 2.2 - P.earBack * 0.3;
    }
    for (const [i, w] of this.whiskers.entries()) {
      const s = i === 0 ? 1 : -1;
      w.rotation.y = -P.whisk * 0.6 * s;
    }
    this.applyLegs(P);
    this.applyTail(P, dt);
  }

  // Turn the head to look sideways around the *world* vertical axis (split between neck and
  // head), so looking around never tilts the head even when the body is pitched, e.g. sitting.
  turnHead(yaw) {
    const T = this._turn ||= { q: new THREE.Quaternion(), r: new THREE.Quaternion(), a: new THREE.Vector3() };
    T.q.copy(this.root.quaternion).multiply(this.torso.quaternion).multiply(this.chest.quaternion);
    for (const [joint, share] of [[this.neck, 0.45], [this.head, 0.55]]) {
      T.a.set(0, 1, 0).applyQuaternion(T.r.copy(T.q).invert());
      joint.quaternion.premultiply(T.r.setFromAxisAngle(T.a, yaw * share));
      T.q.multiply(joint.quaternion);
    }
  }

  // leg joint angles (FK); the IK in legs.js writes into the same parameters
  applyLegs(P) {
    for (const side of ['L', 'R']) {
      const L = this.fl[side];
      // a paw reaching for the face (washing) is not kept flat
      const flatF = P.flat * (side === 'R' ? 1 - (P.reachR || 0) : 1);
      L.sh.rotation.set(P['flS_' + side], 0, P['flZ_' + side] * L.s);
      L.el.rotation.x = P['flE_' + side];
      L.wr.rotation.x = P['flW_' + side];
      const sum = P.pitch + P.chestBend + P['flS_' + side] + P['flE_' + side] + P['flW_' + side];
      L.paw.rotation.x = -sum * flatF + P['flP_' + side];
      const B = this.bl[side];
      B.hp.rotation.set(P['blH_' + side], 0, P['blZ_' + side] * B.s);
      B.kn.rotation.x = P['blK_' + side];
      B.hk.rotation.x = P['blA_' + side];
      const sumB = P.pitch + P.pelvisBend + P['blH_' + side] + P['blK_' + side] + P['blA_' + side];
      B.ft.rotation.x = -sumB * flatF + P['blP_' + side];
    }
  }

  applyTail(P, dt) {
    // integrate the wave phase so speed changes never make the tail jump
    this.tailPhase = (this.tailPhase || 0) + dt * 1.6 * P.tailWaveSpeed;
    const N = this.tail.length;
    for (let i = 0; i < N; i++) {
      const g = this.tail[i];
      const k = i / N;
      const wave = Math.sin(this.tailPhase - i * 0.45) * P.tailWave * (0.3 + k);
      if (i === 0) g.rotation.set(P.tailPitch, P.tailYaw + wave * 0.5, 0, 'YXZ');
      else g.rotation.set(P.tailBendX, P.tailBendY + wave * 0.35, 0, 'YXZ');
      g.updateMatrix();
    }
    this.updateTail();
  }
}
