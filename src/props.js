// Props the cat interacts with.
import * as THREE from 'three';

// knitted fabric texture: vertical stitch columns made of little "V" loops, a heather
// colour noise, ribbing on the cuff and darker heel / toe patches (u runs cuff -> toe)
function knitTexture() {
  const W = 512, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const zones = (u) => (u > 0.9 ? 'toe' : u > 0.4 && u < 0.56 ? 'heel' : u < 0.13 ? 'cuff' : 'body');
  const base = { body: [148, 150, 156], cuff: [128, 130, 137], heel: [92, 94, 100], toe: [92, 94, 100] };
  const cols = 64, rows = 160;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = r / rows, z = zones(u);
      const [br, bg2, bb] = base[z];
      const n = (Math.random() - 0.5) * 26 + (z === 'cuff' && c % 2 ? -18 : 0);
      g.fillStyle = `rgb(${br + n},${bg2 + n},${bb + n + 2})`;
      // u is along the canvas width, v (around the sock) along its height
      const x = (r / rows) * W, y = (c / cols) * H, w = W / rows + 0.6, h = H / cols;
      g.fillRect(x, y, w, h);
      // a "V" stitch: two slanted strokes
      g.strokeStyle = `rgba(0,0,0,${0.18 + Math.random() * 0.1})`;
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y + 0.5); g.lineTo(x + w * 0.9, y + h * 0.5); g.lineTo(x, y + h - 0.5); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A grey ankle sock lying flat on the floor: an L-shaped flattened tube (leg, heel corner,
// foot, rounded toe) with an open ribbed cuff and some soft crumples.
export function makeSock() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0, -1.25), // cuff
    new THREE.Vector3(-0.05, 0, -0.5),
    new THREE.Vector3(0.0, 0, 0.0),      // heel corner
    new THREE.Vector3(0.35, 0, 0.35),
    new THREE.Vector3(1.25, 0, 0.55),
    new THREE.Vector3(2.05, 0, 0.6),    // toe
  ], false, 'centripetal');
  const NU = 90, NV = 32;
  const pos = [], uv = [], idx = [];
  const c = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const seed = Math.random() * 10;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    path.getPointAt(u, c);
    path.getTangentAt(u, t);
    side.crossVectors(t, up).normalize();
    // half-width along the sock: cuff, leg, wider heel, foot, rounded toe
    let w = 0.36 + 0.05 * Math.exp(-((u - 0.45) ** 2) / 0.006);
    if (u > 0.9) w *= Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) * 0.85 + 0.15 * (1 - (u - 0.9) / 0.1);
    const crumple = 0.025 * Math.sin(u * 23 + seed) + 0.02 * Math.sin(u * 41 + seed * 2);
    for (let j = 0; j <= NV; j++) {
      const a = (j / NV) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // flattened cross-section: rounded top, flat bottom resting on the floor
      const h = sa > 0 ? 0.11 + crumple : 0.03;
      const r = w * (1 + 0.04 * Math.sin(a * 3 + u * 9 + seed));
      pos.push(c.x + side.x * r * ca, Math.max(0, 0.035 + sa * h), c.z + side.z * r * ca);
      uv.push(u, j / NV);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = knitTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, bumpMap: tex, bumpScale: 2.5, roughness: 1, sheen: 1,
    sheenColor: new THREE.Color(0xd8dce4), sheenRoughness: 0.8, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  const sock = new THREE.Mesh(geo, mat);
  sock.castShadow = true; sock.receiveShadow = true;
  g.add(sock);
  // the open cuff: a slightly raised ribbed rim with a dark opening
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 32), new THREE.MeshPhysicalMaterial({ color: 0x7f8188, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xc8ccd4) }));
  rim.scale.set(0.37, 0.12, 1);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x2a2b30 }));
  hole.scale.set(0.33, 0.07, 1);
  const cuff = new THREE.Group();
  cuff.add(rim, hole);
  path.getPointAt(0, c); path.getTangentAt(0, t);
  cuff.position.set(c.x, 0.09, c.z);
  cuff.lookAt(c.x - t.x, 0.09, c.z - t.z);
  g.add(cuff);
  // centre the sock on its own origin and scale it to a cat-sized ankle sock
  g.children.forEach((o) => o.position.add(new THREE.Vector3(-0.45, 0, 0.2)));
  g.scale.setScalar(0.85);
  return g;
}
