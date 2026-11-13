// Процедурная 3D-модель чёрной шотландской вислоухой кошки
import * as THREE from 'three';

// ---------- Мех (shell fur) ----------
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
       // ворсинки «причёсаны» вдоль furDir и сильнее гнутся к кончику
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

// ---------- Глаза ----------
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
          vec3 inner = vec3(0.56,0.64,0.16);   // зеленоватый у зрачка
          vec3 mid   = vec3(0.90,0.82,0.26);   // лимонно-жёлтый
          vec3 outer = vec3(0.70,0.62,0.16);   // темнее к краю
          col = mix(inner, mid, smoothstep(0.12,0.5,d));
          col = mix(col, outer, smoothstep(0.72,0.95,d));
          col *= 0.85 + 0.25*streak;
          col *= 1.0 - 0.8*smoothstep(0.93,1.0,d);   // тёмный ободок
          col *= mix(0.5, 1.0, smoothstep(0.85, 0.25, xy.y / R)); // тень от века сверху
          // зрачок
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

// ---------- Позы: параметры ----------
export const BASE = {
  rootY: 0,
  torsoY: 1.6, torsoZ: 0, pitch: 0, roll: 0,
  pelvisBend: 0, pelvisRoll: 0, chestBend: 0, chestYaw: 0, chestRoll: 0,
  neckPitch: -0.8, neckYaw: 0, neckRoll: 0,
  headPitch: 0.7, headYaw: 0, headRoll: 0,
  jaw: 0, tongue: 0, tongueUp: 0, lidUp: 0.04, lidLow: 0.08, pupil: 0.45,
  earBack: 0, whisk: 0, look: 1, flat: 1,
  flS_L: 0.15, flE_L: -0.25, flW_L: 0.1, flZ_L: 0, flP_L: 0,
  flS_R: 0.15, flE_R: -0.25, flW_R: 0.1, flZ_R: 0, flP_R: 0,
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
  // капсула, идущая от 0 вниз до -len; r2 — радиус на конце (сужение)
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

// трубка, сужающаяся к концу (усы)
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
    this.parts = []; // меши для рейкаста
    this.shellMeshes = [];
    this.fur = furSet(0x060505, 0x3a312c, 130, 0.034);
    this.furMuzzle = furSet(0x151312, 0x6f6a64, 150, 0.022);
    this.furChin = furSet(0x24170f, 0x8a6550, 150, 0.024);
    this.matPad = new THREE.MeshStandardMaterial({ color: 0x5a4549, roughness: 0.55 });
    this.matNose = new THREE.MeshPhysicalMaterial({ color: 0x2b2627, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    this.matMouth = new THREE.MeshStandardMaterial({ color: 0x5e2630, roughness: 0.6 });
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
    // таз
    this.pelvis = G(); this.torso.add(this.pelvis);
    // грудь (группа нужна до построения туловища)
    this.chest = G(); this.chest.position.set(0, 0.05, 0.8); this.torso.add(this.chest);
    // маленькое светлое пятнышко на животе (как на фото)
    const spot = new THREE.Mesh(ellipsoid(0.07, 0.03, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x8a8582, roughness: 0.9 }));
    spot.position.set(0.05, -0.47, 0.55); this.torso.add(spot);
    // грудь

    // шея
    // шея — часть общего туловища-лофта (см. updateBody), здесь только сустав
    this.neck = G(); this.neck.position.set(0, 0.22, 0.95); this.chest.add(this.neck);
    // ошейник
    this.collar = new THREE.Group();
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xe8679f, roughness: 0.5 });
    this.collarMat = collarMat;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 10, 40), collarMat);
    band.scale.set(1, 1.08, 1); band.rotation.x = Math.PI / 2 - 0.5;
    this.collar.add(band);
    const tag = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.9, roughness: 0.25 }));
    tag.position.set(0, -0.36, 0.22); this.collar.add(tag);
    this.collar.position.set(0, 0.06, 0.12);
    this.neck.add(this.collar);

    // голова
    this.head = G(); this.head.position.set(0, 0.34, 0.38); this.neck.add(this.head);
    const H = this.head;
    // вокруг глаз и носа шёрстка короткая и гладкая
    const EYE = [new THREE.Vector3(0.26, 0.085, 0.395), new THREE.Vector3(-0.26, 0.085, 0.395)];
    const NOSE = new THREE.Vector3(0, -0.11, 0.545);
    const faceK = (v, k) => {
      const de = Math.min(v.distanceTo(EYE[0]), v.distanceTo(EYE[1]));
      const dn = v.distanceTo(NOSE);
      return k * (0.04 + 0.96 * THREE.MathUtils.smoothstep(de, 0.14, 0.3)) * (0.2 + 0.8 * THREE.MathUtils.smoothstep(dn, 0.05, 0.16));
    };
    // череп; спереди-снизу «выемка» под ротовую полость (её прикрывают подбородок и подушечки)
    const skull = ellipsoid(0.66, 0.55, 0.56, 40);
    { const pa = skull.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const w = (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.06, 0.13)) * THREE.MathUtils.smoothstep(-y, 0.17, 0.24) * THREE.MathUtils.smoothstep(z, 0.2, 0.32);
        pa.setZ(i, z - 0.16 * w);
      }
      skull.computeVertexNormals(); }
    this.addPart(H, skull, [0, 0, 0], 'head', this.fur, { dir: [0, 0.3, -1], k: 0.9, kFn: faceK });
    // щёки (у вислоухих круглое широкое лицо)
    this.addPart(H, ellipsoid(0.33, 0.28, 0.3), [0.3, -0.2, 0.15], 'head', this.fur, { dir: [1, -0.6, -0.7], k: 1.9, kFn: faceK });
    this.addPart(H, ellipsoid(0.33, 0.28, 0.3), [-0.3, -0.2, 0.15], 'head', this.fur, { dir: [-1, -0.6, -0.7], k: 1.9, kFn: faceK });
    // широкая переносица от глаз к носу
    this.addPart(H, ellipsoid(0.16, 0.18, 0.1), [0, -0.03, 0.45], 'head', this.fur, { dir: [0, 1, -0.3], k: 0.45, kFn: faceK });
    // подушечки усов
    this.addPart(H, ellipsoid(0.105, 0.08, 0.08), [0.08, -0.2, 0.455], 'nose', this.furMuzzle, { dir: [1, -0.3, 0], k: 0.4, kFn: faceK });
    this.addPart(H, ellipsoid(0.105, 0.08, 0.08), [-0.08, -0.2, 0.455], 'nose', this.furMuzzle, { dir: [-1, -0.3, 0], k: 0.4, kFn: faceK });
    // нос — тёмно-серый треугольник
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
    // желобок от носа ко рту и линия рта «перевёрнутая Y»
    const line = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 8, r, 5), dark);
    H.add(line([[0, -0.14, 0.558], [0, -0.18, 0.55], [0, -0.215, 0.535]], 0.005));
    for (const s of [-1, 1]) H.add(line([[0, -0.215, 0.535], [0.04 * s, -0.233, 0.52], [0.075 * s, -0.238, 0.49]], 0.004));
    // ротик внутри
    const mouth = new THREE.Mesh(ellipsoid(0.08, 0.055, 0.13, 16), this.matMouth);
    mouth.position.set(0, -0.255, 0.34); H.add(mouth);
    // клыки
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.06, 8), this.matTooth);
      f.rotation.x = Math.PI; f.position.set(0.04 * s, -0.255, 0.5); H.add(f);
    }
    // челюсть с рыжеватым подбородком (как на фото)
    this.jaw = G(); this.jaw.position.set(0, -0.21, 0.285); H.add(this.jaw);
    this.addPart(this.jaw, ellipsoid(0.085, 0.048, 0.125), [0, -0.05, 0.13], 'head', this.furChin, { dir: [0, -1, -0.5], k: 0.8 });
    this.tongue = G(); this.tongue.position.set(0, -0.05, 0.06); this.jaw.add(this.tongue);
    const tg = ellipsoid(0.065, 0.02, 0.13, 16);
    this.tongueMesh = new THREE.Mesh(tg, this.matTongue); this.tongue.add(this.tongueMesh);

    // глаза: круглые, широко посаженные, внешние уголки чуть вверх
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
      // край века — тёмная «подводка» по кромке каждого века, двигается вместе с ним
      for (const [lid, r] of [[up, 0.155], [lo, 0.152]]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.002, 0.0075, 6, 32, Math.PI), this.matLidRim);
        rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI; lid.add(rim);
      }
      this.eyes.push(look); this.lids.push({ up, lo });
    }

    // ушки, плотно загнутые вперёд по углам головы
    this.ears = [];
    for (const s of [1, -1]) {
      const eg = G(); eg.position.set(0.36 * s, 0.37, 0.02); H.add(eg);
      const bg = new THREE.CylinderGeometry(0.12, 0.18, 0.09, 18); bg.scale(1, 1, 0.5); bg.translate(0, 0.045, 0);
      this.addPart(eg, bg, [0, 0, 0], 'head', this.fur, { dir: [0, 1, 0], k: 0.6 });
      const fold = G(); fold.position.set(0, 0.085, 0.03); eg.add(fold);
      const tgeo = new THREE.ConeGeometry(0.13, 0.17, 18); tgeo.scale(1, 1, 0.35); tgeo.translate(0, 0.085, 0);
      this.addPart(fold, tgeo, [0, 0, 0], 'head', this.fur, { dir: [0, 1, 0], k: 0.5 });
      this.ears.push({ g: eg, fold, s });
    }

    // усы
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
        // пара тёмных усов у основания, как на фото
        const w = new THREE.Mesh(tube, i === 1 || i === 6 ? this.matWhiskerDark : this.matWhisker);
        wg.add(w);
      }
      this.whiskers.push(wg);
      // брови-усы над глазами
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

    // ---- передние лапы ----
    this.fl = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const sh = G(); sh.position.set(0.28 * s, -0.22, 0.6); this.chest.add(sh);
      this.addPart(sh, ellipsoid(0.18, 0.32, 0.23), [-0.02 * s, -0.05, 0], 'body', this.fur, { dir: [0, -1, -0.3] });
      this.addPart(sh, capsuleDown(0.14, 0.56, 0.115), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.8 });
      const el = G(); el.position.set(0, -0.68, 0); sh.add(el);
      this.addPart(el, capsuleDown(0.11, 0.6, 0.095), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.7 });
      const wr = G(); wr.position.set(0, -0.68, 0); el.add(wr);
      const paw = G(); wr.add(paw);
      this.addPart(paw, ellipsoid(0.13, 0.105, 0.17), [0, -0.01, 0.06], 'paw', this.fur, { dir: [0, -0.3, 1], k: 0.6 });
      this.addPads(paw, 0.13);
      this.addToes(paw, 0.13, 0.17);
      this.fl[side] = { sh, el, wr, paw, s };
    }
    // ---- задние лапы ----
    this.bl = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const hp = G(); hp.position.set(0.3 * s, -0.05, -0.1); this.pelvis.add(hp);
      // бедро — широкое, мускулистое, плавно уходит в туловище
      this.addPart(hp, ellipsoid(0.25, 0.48, 0.38), [0.02 * s, -0.2, 0.02], 'body', this.fur, { dir: [0, -1, -0.4], k: 1.2 });
      this.addPart(hp, capsuleDown(0.19, 0.5, 0.12), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0] });
      const kn = G(); kn.position.set(0, -0.62, 0); hp.add(kn);
      this.addPart(kn, capsuleDown(0.11, 0.58, 0.075), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.7 });
      // икра — сзади голени
      this.addPart(kn, ellipsoid(0.1, 0.24, 0.12), [0, -0.2, -0.05], 'paw', this.fur, { dir: [0, -1, 0], k: 0.8 });
      const hk = G(); hk.position.set(0, -0.68, 0); kn.add(hk);
      this.addPart(hk, capsuleDown(0.08, 0.36, 0.075), [0, 0, 0], 'paw', this.fur, { dir: [0, -1, 0], k: 0.6 });
      // пяточка (скакательный сустав)
      this.addPart(hk, ellipsoid(0.075, 0.08, 0.09), [0, 0.0, -0.03], 'paw', this.fur, { dir: [0, -1, 0], k: 0.6 });
      const ft = G(); ft.position.set(0, -0.46, 0); hk.add(ft);
      this.addPart(ft, ellipsoid(0.12, 0.1, 0.18), [0, -0.01, 0.07], 'paw', this.fur, { dir: [0, -0.3, 1], k: 0.6 });
      this.addPads(ft, 0.12);
      this.addToes(ft, 0.12, 0.18);
      this.bl[side] = { hp, kn, hk, ft, s };
    }

    // ---- хвост ----
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
    // туловище с шеей — одна гладкая «гибкая» оболочка вдоль позвоночника
    this.buildBody();
  }

  // ---------- хвост: одна гладкая трубка по суставам ----------
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
    // ворс вдоль хвоста, к кончику пушистее
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

  // ---------- туловище-лофт ----------
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
    // пушистая грудка: ворс длиннее спереди-снизу
    { const pos = g.attributes.position, k = new Float32Array(pos.count), d = new Float32Array(pos.count * 3);
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
        const id = i * (NA + 1) + j, s = i / NR, sa = Math.sin((j / NA) * Math.PI * 2);
        const chestF = THREE.MathUtils.smoothstep(s, 0.48, 0.7) * (1 - THREE.MathUtils.smoothstep(s, 0.78, 0.9)) * THREE.MathUtils.clamp(0.3 - sa, 0, 1);
        const ruff = THREE.MathUtils.smoothstep(s, 0.7, 0.85) * (1 - THREE.MathUtils.smoothstep(s, 0.93, 1));
        k[id] = 1 + 0.9 * chestF + 0.6 * ruff;
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
    P[2].set(0, 0.09, 0.42);
    P[3].set(0, 0.05, 0.4).applyMatrix4(ch.matrix);
    P[4].set(0, 0.1, 0.85).applyMatrix4(ch.matrix);
    P[5].set(0, 0.0, 0.12).applyMatrix4(mN);
    P[6].set(0, -0.16, -0.1).applyMatrix4(mH);
    V.up.set(0, 1, 0).applyQuaternion(pel.quaternion);
    V.uc.set(0, 1, 0).applyQuaternion(ch.quaternion);
    (V.un ||= new THREE.Vector3()).set(0, 1, 0).applyMatrix4(mN).sub(V.c.set(0, 0, 0).applyMatrix4(mN)).normalize();
    // профиль: s, полуширина, полувысота, смещение вниз
    const PR = [[0, 0.46, 0.5, 0], [0.15, 0.53, 0.56, 0], [0.33, 0.45, 0.53, -0.03], [0.5, 0.46, 0.56, 0], [0.66, 0.41, 0.49, 0], [0.83, 0.31, 0.35, 0], [1, 0.27, 0.3, 0]];
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
  }

  // пальчики — бугорки по переднему краю лапки
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
  setCollar(c) {
    this.collar.visible = !!c;
    if (c) this.collarMat.color.set(c);
  }

  // применить вектор параметров
  apply(P, t) {
    this.root.position.y = 0.1 + P.rootY;
    this.torso.position.set(0, P.torsoY, P.torsoZ);
    this.torso.rotation.set(P.pitch, 0, P.roll);
    this.pelvis.rotation.set(P.pelvisBend, 0, P.pelvisRoll);
    this.chest.rotation.set(P.chestBend, P.chestYaw, P.chestRoll);
    this.neck.rotation.set(P.neckPitch, P.neckYaw, P.neckRoll, 'YXZ');
    this.head.rotation.set(P.headPitch, P.headYaw, P.headRoll, 'YXZ');
    this.updateBody();
    this.jaw.rotation.x = P.jaw * 1.0;
    this.tongue.position.z = 0.06 + P.tongue * 0.34;
    this.tongue.position.y = -0.05 + P.tongue * 0.035;
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
    // передние лапы
    const flatF = P.flat;
    for (const side of ['L', 'R']) {
      const L = this.fl[side];
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
    // хвост
    const N = this.tail.length;
    for (let i = 0; i < N; i++) {
      const g = this.tail[i];
      const k = i / N;
      const wave = Math.sin(t * 1.6 * P.tailWaveSpeed - i * 0.45) * P.tailWave * (0.3 + k);
      if (i === 0) g.rotation.set(P.tailPitch, P.tailYaw + wave * 0.5, 0, 'YXZ');
      else g.rotation.set(P.tailBendX, P.tailBendY + wave * 0.35, 0, 'YXZ');
      g.updateMatrix();
    }
    this.updateTail();
  }
}
