// Leg IK and foot placement.
//
// When a leg's IK weight is > 0 its paw is planted on the floor at a fixed world position,
// and the joint angles are solved so the paw stays put while the body moves above it.
// Paws only move when they take a step: either as part of the walk cycle (a lateral-sequence
// gait: hind-left, fore-left, hind-right, fore-right) or, when standing, once the body has
// drifted or turned too far from where the paw was planted.
import * as THREE from 'three';

const GROUND = 0.12;              // world height of the rug surface
const CLEAR = { F: 0.115, B: 0.11 }; // wrist / foot joint height above the floor when planted
const GAIT = { BL: 0, FL: 0.25, BR: 0.5, FR: 0.75 };
const DUTY = 0.62;                // fraction of the cycle a paw spends on the ground

const clamp = THREE.MathUtils.clamp;
const ease = (u) => u * u * (3 - 2 * u);
// bone direction for angle a (0 = straight down, + = towards the tail) in the (y, z) plane
const angleOf = (dy, dz) => Math.atan2(-dz, -dy);

// two-bone IK in a joint's parent space; returns [upperAngle, lowerAngleRelative]
function twoBone(oy, oz, ty, tz, L1, L2, bendBack) {
  const dy = ty - oy, dz = tz - oz;
  const D = clamp(Math.hypot(dy, dz), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const base = angleOf(dy, dz);
  const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const a1 = bendBack ? base + alpha : base - alpha;
  const ey = oy - L1 * Math.cos(a1), ez = oz - L1 * Math.sin(a1);
  return [a1, angleOf(ty - ey, tz - ez) - a1];
}

export class Legs {
  constructor(cat) {
    this.cat = cat;
    this.phase = 0;
    this.feet = {};
    for (const id of ['FL', 'FR', 'BL', 'BR']) {
      this.feet[id] = { id, front: id[0] === 'F', side: id[1], planted: null, swing: null, home: new THREE.Vector3(), lastLocal: 0 };
    }
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // drop all planted positions (e.g. after a jump or a pose without IK)
  release() { for (const f of Object.values(this.feet)) { f.planted = null; f.swing = null; } }

  get swinging() { return Object.values(this.feet).filter((f) => f.swing).length; }

  /**
   * @param dt     frame time
   * @param Q      final parameter vector (leg angles are overwritten where IK is active)
   * @param motion { speed, dir: Vector3 (world, unit) } of the root
   */
  update(dt, Q, motion) {
    const cat = this.cat;
    cat.root.updateMatrixWorld(true);
    const walking = motion.speed > 0.08;
    const period = clamp(1.05 - motion.speed * 0.13, 0.62, 1.0);
    if (walking) this.phase = (this.phase + dt / period) % 1;
    const lead = motion.speed * period * DUTY * 0.5;

    for (const f of Object.values(this.feet)) {
      const w = Q[(f.front ? 'ikF_' : 'ikB_') + f.side];
      if (w < 0.02) { f.planted = null; f.swing = null; continue; }
      this.computeHome(f, Q, motion, walking ? lead : 0);

      // a paw that just started using IK is planted where the FK pose put it
      if (!f.planted) {
        f.planted = this.currentPaw(f).setY(GROUND + CLEAR[f.front ? 'F' : 'B']);
        f.swing = null;
      }

      if (walking) {
        const local = (this.phase + GAIT[f.id]) % 1;
        const inSwing = local >= DUTY;
        if (inSwing && !f.swing) f.swing = { from: f.planted.clone(), t: 0, dur: period * (1 - DUTY) };
        if (f.swing) f.swing.t = clamp((local - DUTY) / (1 - DUTY), 0, 1);
        if (f.swing && (!inSwing || f.swing.t >= 1)) { f.planted.copy(f.home); f.swing = null; }
        f.lastLocal = local;
      } else if (f.swing) {
        f.swing.t += dt / f.swing.dur;
        if (f.swing.t >= 1) { f.planted.copy(f.home); f.swing = null; }
      } else {
        // standing: re-step once the paw is too far from where it belongs
        const err = Math.hypot(f.planted.x - f.home.x, f.planted.z - f.home.z);
        if (err > 0.26 && w > 0.9 && this.swinging === 0) f.swing = { from: f.planted.clone(), t: 0, dur: 0.24 + err * 0.15 };
      }
    }

    for (const f of Object.values(this.feet)) {
      const w = Q[(f.front ? 'ikF_' : 'ikB_') + f.side];
      if (!f.planted || w < 0.02) continue;
      // paw target: planted, or travelling along a raised arc during a swing
      const target = this._v.copy(f.planted);
      let lift = 0;
      if (f.swing) {
        const u = ease(f.swing.t);
        target.lerpVectors(f.swing.from, f.home, u);
        lift = Math.sin(Math.PI * f.swing.t);
        target.y += lift * (f.front ? 0.24 : 0.2);
      }
      this.solve(f, target, Q, w, lift);
    }
  }

  computeHome(f, Q, motion, lead) {
    const cat = this.cat;
    const joint = f.front ? cat.fl[f.side].sh : cat.bl[f.side].hp;
    // project the shoulder / hip onto the floor in the root frame
    const p = joint.getWorldPosition(this._w);
    cat.root.worldToLocal(p);
    p.x *= f.front ? 0.92 : 0.88;
    p.z += f.front ? Q.fzF - 0.3 : Q.fzB - 0.02; // front paws sit under the elbow, not the shoulder
    p.y = 0;
    cat.root.localToWorld(p);
    p.y = GROUND + CLEAR[f.front ? 'F' : 'B'];
    if (lead) p.addScaledVector(motion.dir, lead);
    f.home.copy(p);
  }

  currentPaw(f) {
    const g = f.front ? this.cat.fl[f.side].wr : this.cat.bl[f.side].ft;
    return g.getWorldPosition(new THREE.Vector3());
  }

  solve(f, targetWorld, Q, w, lift) {
    const cat = this.cat;
    const lerp = THREE.MathUtils.lerp;
    if (f.front) {
      const L = cat.fl[f.side], [L1, L2] = cat.legLen.F;
      const t = cat.chest.worldToLocal(targetWorld.clone());
      const [s, e] = twoBone(L.sh.position.y, L.sh.position.z, t.y, t.z, L1, L2, true);
      const k = '_' + f.side;
      Q['flS' + k] = lerp(Q['flS' + k], s, w);
      Q['flE' + k] = lerp(Q['flE' + k], e, w);
      Q['flW' + k] = lerp(Q['flW' + k], 0, w);
      Q['flP' + k] += lift * 1.1 * w; // the paw curls while it is in the air
    } else {
      const B = cat.bl[f.side], [L1, L2, L3] = cat.legLen.B;
      const t = cat.pelvis.worldToLocal(targetWorld.clone());
      // the metatarsus stays close to vertical, slightly raked forward; it flexes during a step
      const parentPitch = Q.pitch + Q.pelvisBend;
      const aMeta = -0.22 + lift * 0.9 - parentPitch;
      const hy = t.y + L3 * Math.cos(aMeta), hz = t.z + L3 * Math.sin(aMeta);
      const [h, k2] = twoBone(B.hp.position.y, B.hp.position.z, hy, hz, L1, L2, false);
      const k = '_' + f.side;
      Q['blH' + k] = lerp(Q['blH' + k], h, w);
      Q['blK' + k] = lerp(Q['blK' + k], k2, w);
      Q['blA' + k] = lerp(Q['blA' + k], aMeta - h - k2, w);
      Q['blP' + k] += lift * 0.9 * w;
    }
  }
}
