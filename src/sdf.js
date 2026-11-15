// Signed-distance modelling for the procedural cat.
//
// The body is described as a list of simple primitives (ellipsoids and round cones) that are
// blended together with smooth unions, the way a sculptor would block out muscles and fat
// pads. The resulting distance field is turned into one seamless triangle mesh with surface
// nets on a narrow band around the surface, and the per-primitive distances are used again
// later to derive smooth skinning weights, fur length and comb direction for every vertex.

const { abs, max, min, sqrt } = Math;
const hypot = (x, y, z = 0) => sqrt(x * x + y * y + z * z); // (Math.hypot is slow)

// ---------- primitives ----------

// rotation (3x3, row-major, world -> local) from a z axis (the primitive's "forward") and an
// approximate y axis
function frame(fwd, up = [0, 1, 0]) {
  let [zx, zy, zz] = fwd;
  let l = hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  // x = up × z
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = hypot(xx, xy, xz);
  if (l < 1e-6) { xx = 1; xy = 0; xz = 0; l = 1; }
  xx /= l; xy /= l; xz /= l;
  // y = z × x
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}

/** Ellipsoid with radii r = [rx, ry, rz], optionally oriented by `fwd` (its local z) and `up`. */
export function ellipsoid(c, r, opts = {}) {
  const R = opts.fwd ? frame(opts.fwd, opts.up) : null;
  return { type: 0, c, r, R, bound: max(r[0], r[1], r[2]), ...opts };
}

/** Round cone (a capsule with different end radii) from point a (radius ra) to b (radius rb). */
export function cone(a, b, ra, rb, opts = {}) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = ra - rb;
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { type: 1, a, b, ra, rb, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, c, bound: sqrt(l2) / 2 + max(ra, rb), ...opts };
}

export function primDist(q, x, y, z) {
  if (q.type === 0) {
    let px = x - q.c[0], py = y - q.c[1], pz = z - q.c[2];
    if (q.R) {
      const R = q.R;
      const lx = R[0] * px + R[1] * py + R[2] * pz;
      const ly = R[3] * px + R[4] * py + R[5] * pz;
      const lz = R[6] * px + R[7] * py + R[8] * pz;
      px = lx; py = ly; pz = lz;
    }
    const [rx, ry, rz] = q.r;
    const k0 = hypot(px / rx, py / ry, pz / rz);
    const k1 = hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
  }
  // round cone (Inigo Quilez)
  const pax = x - q.a[0], pay = y - q.a[1], paz = z - q.a[2];
  const [bax, bay, baz] = q.ba;
  const l2 = q.l2, rr = q.rr, a2 = q.a2, il2 = q.il2;
  const yv = pax * bax + pay * bay + paz * baz;
  const zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yv * yv * l2, z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - q.rb;
  if (Math.sign(yv) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - q.ra;
  return (sqrt(x2 * a2 * il2) + yv * rr) * il2 - q.ra;
}

// polynomial smooth minimum / maximum
export function smin(a, b, k) {
  if (k <= 0) return min(a, b);
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

/**
 * Evaluate the field of a primitive list at (x, y, z). Primitives are applied in order:
 * `op: 'sub'` carves (smooth subtraction), anything else is a smooth union with blend radius k.
 */
export function evalField(prims, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const q = prims[i];
    const di = primDist(q, x, y, z);
    d = q.op === 'sub' ? smax(d, -di, q.k || 0) : smin(d, di, q.k || 0);
  }
  return d;
}

// ---------- surface nets on a narrow band ----------

/**
 * Extract the zero surface of the field defined by `prims` inside `box` ([x0,y0,z0,x1,y1,z1])
 * with cell size h. Returns { positions, normals, indices } (Float32Array / Uint32Array).
 */
export function polygonize(prims, box, h) {
  const B = 6; // cells per block
  const [x0, y0, z0] = box;
  const nx = Math.ceil((box[3] - x0) / h), ny = Math.ceil((box[4] - y0) / h), nz = Math.ceil((box[5] - z0) / h);
  const px = nx + 1, py = ny + 1, pz = nz + 1;
  const F = new Float32Array(px * py * pz).fill(1e9);
  const done = new Uint8Array(px * py * pz);
  const P = (i, j, k) => i + px * (j + py * k);
  const bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
  const blockR = (B * h * Math.sqrt(3)) / 2;
  const active = new Uint8Array(bx * by * bz);
  const blockPrims = new Array(bx * by * bz);

  // 1. find the blocks the surface can pass through and the primitives that matter there
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    const cx = x0 + (I + 0.5) * B * h, cy = y0 + (J + 0.5) * B * h, cz = z0 + (K + 0.5) * B * h;
    const list = [];
    for (const q of prims) {
      const dc = hypot(cx - q.c[0], cy - q.c[1], cz - q.c[2]) - q.bound;
      if (dc - blockR > (q.k || 0) + 0.02) continue; // cannot affect the surface inside the block
      list.push(q);
    }
    if (!list.length) continue;
    const d = evalField(list, cx, cy, cz);
    if (abs(d) > blockR * 1.6 + 0.02) continue;
    const bi = I + bx * (J + by * K);
    active[bi] = 1; blockPrims[bi] = list;
  }

  // 2. sample the field at the grid points of active blocks
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    const bi = I + bx * (J + by * K);
    if (!active[bi]) continue;
    const list = blockPrims[bi];
    for (let k = K * B; k <= min(nz, K * B + B); k++) for (let j = J * B; j <= min(ny, J * B + B); j++) for (let i = I * B; i <= min(nx, I * B + B); i++) {
      const id = P(i, j, k);
      if (done[id]) continue;
      done[id] = 1;
      F[id] = evalField(list, x0 + i * h, y0 + j * h, z0 + k * h);
    }
  }

  // 3. one vertex per cell that the surface crosses (average of the edge crossings)
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const C = (i, j, k) => i + nx * (j + ny * k);
  const verts = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float32Array(8);
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    if (!active[I + bx * (J + by * K)]) continue;
    for (let k = K * B; k < min(nz, K * B + B); k++) for (let j = J * B; j < min(ny, J * B + B); j++) for (let i = I * B; i < min(nx, I * B + B); i++) {
      let inside = 0;
      for (let c = 0; c < 8; c++) {
        const v = F[P(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
        corner[c] = v; if (v < 0) inside++;
      }
      if (inside === 0 || inside === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        const fa = corner[a], fb = corner[b];
        if ((fa < 0) === (fb < 0)) continue;
        const t = fa / (fa - fb);
        sx += (a & 1) + t * ((b & 1) - (a & 1));
        sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
        sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
        n++;
      }
      cellV[C(i, j, k)] = verts.length / 3;
      verts.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
    }
  }

  // 4. a quad for every grid edge with a sign change, between the four cells around it
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const V = verts;
    const dac = (V[a * 3] - V[c * 3]) ** 2 + (V[a * 3 + 1] - V[c * 3 + 1]) ** 2 + (V[a * 3 + 2] - V[c * 3 + 2]) ** 2;
    const dbd = (V[b * 3] - V[d * 3]) ** 2 + (V[b * 3 + 1] - V[d * 3 + 1]) ** 2 + (V[b * 3 + 2] - V[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const f0 = F[P(i, j, k)];
    if (f0 >= 1e8) continue;
    const s0 = f0 < 0;
    // x edge (i,j,k)-(i+1,j,k): cells (i, j-1..j, k-1..k)
    if (i < nx) { const f1 = F[P(i + 1, j, k)]; if (f1 < 1e8 && (f1 < 0) !== s0) quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i, j - 1, k)], !s0); }
    if (j < ny) { const f1 = F[P(i, j + 1, k)]; if (f1 < 1e8 && (f1 < 0) !== s0) quad(cellV[C(i - 1, j, k - 1)], cellV[C(i - 1, j, k)], cellV[C(i, j, k)], cellV[C(i, j, k - 1)], !s0); }
    if (k < nz) { const f1 = F[P(i, j, k + 1)]; if (f1 < 1e8 && (f1 < 0) !== s0) quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)], !s0); }
  }

  // 5. pull the vertices onto the surface and take normals from the field gradient
  // (tetrahedral finite differences: four samples give both the value and the gradient)
  const nv = verts.length / 3;
  const pos = new Float32Array(verts), nor = new Float32Array(nv * 3);
  const e = h * 0.3;
  const G = [0, 0, 0, 0];
  const tetra = (list, x, y, z) => {
    const a = evalField(list, x + e, y - e, z - e), b = evalField(list, x - e, y - e, z + e);
    const c = evalField(list, x - e, y + e, z - e), d = evalField(list, x + e, y + e, z + e);
    G[0] = (a - b - c + d) / (4 * e); G[1] = (-a - b + c + d) / (4 * e); G[2] = (-a + b - c + d) / (4 * e); G[3] = (a + b + c + d) / 4;
  };
  const blockOf = (x, y, z) => {
    const I = min(bx - 1, max(0, Math.floor((x - x0) / (B * h))));
    const J = min(by - 1, max(0, Math.floor((y - y0) / (B * h))));
    const K = min(bz - 1, max(0, Math.floor((z - z0) / (B * h))));
    return blockPrims[I + bx * (J + by * K)] || prims;
  };
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const list = blockOf(x, y, z);
    tetra(list, x, y, z);
    const g2 = G[0] * G[0] + G[1] * G[1] + G[2] * G[2];
    if (g2 > 1e-8) {
      // one Newton step; never move a vertex further than half a cell (keeps the mesh well shaped)
      let mx = (G[0] * G[3]) / g2, my = (G[1] * G[3]) / g2, mz = (G[2] * G[3]) / g2;
      const m = hypot(mx, my, mz);
      if (m > h * 0.5) { mx *= (h * 0.5) / m; my *= (h * 0.5) / m; mz *= (h * 0.5) / m; }
      x -= mx; y -= my; z -= mz;
      tetra(list, x, y, z);
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    const gl = hypot(G[0], G[1], G[2]) || 1;
    nor[v * 3] = G[0] / gl; nor[v * 3 + 1] = G[1] / gl; nor[v * 3 + 2] = G[2] / gl;
  }
  return { positions: pos, normals: nor, indices: new Uint32Array(idx) };
}

/** Laplacian smoothing of per-vertex values (n components each) over the mesh graph. */
export function smoothAttribute(values, n, indices, nv, iterations = 2, lambda = 0.5) {
  const nb = neighbours(indices, nv);
  let cur = Float32Array.from(values), next = new Float32Array(values.length);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < nv; v++) {
      const s = nb.start[v], e = nb.start[v + 1];
      for (let c = 0; c < n; c++) {
        const own = cur[v * n + c];
        if (e === s) { next[v * n + c] = own; continue; }
        let acc = 0;
        for (let q = s; q < e; q++) acc += cur[nb.list[q] * n + c];
        next[v * n + c] = own + lambda * (acc / (e - s) - own);
      }
    }
    const t = cur; cur = next; next = t;
  }
  return cur;
}

const _nbCache = new WeakMap();
export function neighbours(indices, nv) {
  if (_nbCache.has(indices)) return _nbCache.get(indices);
  const cnt = new Uint32Array(nv + 1);
  for (let i = 0; i < indices.length; i += 3) for (let a = 0; a < 3; a++) cnt[indices[i + a]] += 2;
  const start = new Uint32Array(nv + 1);
  for (let v = 0; v < nv; v++) start[v + 1] = start[v] + cnt[v];
  const fill = start.slice(0, nv);
  const list = new Uint32Array(start[nv]);
  for (let i = 0; i < indices.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = indices[i + a];
    list[fill[v]++] = indices[i + (a + 1) % 3];
    list[fill[v]++] = indices[i + (a + 2) % 3];
  }
  const r = { start, list };
  _nbCache.set(indices, r);
  return r;
}
