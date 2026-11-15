// Pose library. Each pose overrides some of the base parameters (BASE).
//
// Angles: pitch / bends + = front (or that end) down; neckPitch + = head lower; flS / blH are the
// upper-arm / thigh angles in the chest / pelvis frame (0 = straight down, + = towards the tail),
// the other leg angles are relative to the parent bone.
import { BASE } from './cat.js';

const both = (o) => {
  // flS: 0.2 -> flS_L and flS_R
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (/^(fl[A-Z]|bl[A-Z]|sc[A-Z]|ikF|ikB)$/.test(k)) { r[k + '_L'] = v; r[k + '_R'] = v; }
    else r[k] = v;
  }
  return r;
};

export const POSES = {
  // relaxed standing: back level, head carried a little low, tail hanging in a soft curve
  stand: both({
    torsoY: 1.76, pitch: 0.03, pelvisBend: 0.02, chestBend: 0.02,
    neckPitch: 0.1, headPitch: -0.06,
    tailPitch: -1.05, tailBendX: 0.075, tailWave: 0.1,
  }),

  // sitting upright on the haunches: front legs straight, the hind legs folded with the hocks
  // on the floor, tail wrapped around the paws
  sit: both({
    fzF: 0.62, fzB: 0.68, blM: -1.45,
    torsoY: 0.3, torsoZ: -0.55, pitch: -0.9, pelvisBend: -0.3, chestBend: 0.35,
    neckPitch: 0.25, headPitch: 0.3,
    tailPitch: -0.9, tailYaw: 0.5, tailBendX: 0.0, tailBendY: 0.22, tailWave: 0.03, tailRest: 1,
  }),

  // loaf: lying on the chest with all four paws tucked under the body, back rounded
  loaf: both({
    ikF: 0, ikB: 0,
    torsoY: 0.5, pitch: -0.08, pelvisBend: -0.35, chestBend: 0.12,
    neckPitch: -0.45, headPitch: 0.5,
    scY: 0.02,
    flS: 1.23, flE: -2.8, flW: 0.4, flZ: -0.22, flP: 1.5,
    blH: -0.75, blK: 2.8, blA: -2.85, blZ: 0.22,
    tailPitch: -0.7, tailYaw: 0.6, tailBendX: 0.0, tailBendY: 0.2, tailWave: 0.03, tailRest: 1,
    lidUp: 0.35,
  }),

  // sphinx: lying on the chest, forearms flat on the floor in front, head up
  sphinx: both({
    ikB: 0, ikF: 0,
    torsoY: 0.5, pitch: -0.06, pelvisBend: -0.3, chestBend: 0.06,
    neckPitch: -0.4, headPitch: 0.45,
    scY: 0.05,
    flS: 1.2, flE: -2.75, flW: 0, flZ: -0.04,
    blH: -0.75, blK: 2.8, blA: -2.85, blZ: 0.24,
    tailPitch: -0.7, tailBendX: 0.0, tailBendY: 0.12, tailYaw: 0.5, tailWave: 0.05, tailRest: 1,
  }),

  // lying on the right side, head up, legs loose and softly bent, the upper legs resting on
  // the lower ones
  side: both({
    ikF: 0, ikB: 0,
    torsoY: 0.5, pitch: 0, roll: 1.4, chestRoll: -0.3, pelvisBend: -0.1, chestBend: 0.12,
    neckPitch: -0.25, neckRoll: -0.45, headPitch: 0.25, headRoll: -0.3,
    flS_L: 0.45, flE_L: -1.55, flW_L: 0.75, flS_R: 0.2, flE_R: -1.1, flW_R: 0.5,
    flZ_L: -0.3, flZ_R: -0.05,
    blH_L: -1.15, blK_L: 2.0, blA_L: -1.35, blH_R: -0.85, blK_R: 1.75, blA_R: -1.2,
    blZ_L: -0.45, blZ_R: 0.0,
    tailPitch: -0.3, tailYaw: 0, tailBendX: -0.04, tailBendY: 0, tailWave: 0.06, tailRest: 1,
    look: 0.7, flat: 0,
  }),

  // asleep, curled up into a ball on the side: back rounded, nose tucked towards the hind
  // paws, legs folded in and the tail wrapped around
  sleep: both({
    ikF: 0, ikB: 0,
    torsoY: 0.5, pitch: 0, roll: 1.5, chestBend: 0.7, pelvisBend: -0.7, chestRoll: -0.1,
    neckPitch: 1.1, neckRoll: -0.15, neckYaw: 0.1, headPitch: 0.5, headRoll: 0.15,
    flS_L: 0.7, flE_L: -2.0, flW_L: 1.3, flS_R: 0.55, flE_R: -1.8, flW_R: 1.1,
    flZ_L: -0.3, flZ_R: 0.05,
    blH: -1.55, blK: 2.4, blA: -1.7, blZ_L: -0.3, blZ_R: 0.05,
    tailPitch: -0.6, tailYaw: 0, tailBendX: -0.26, tailBendY: 0, tailWave: 0.02, tailRest: 1,
    lidUp: 1, lidLow: 1, look: 0, flat: 0, pupil: 0.2,
  }),

  // on the back, belly up: a soft sideways curve, the front paws bent at the wrists, hind legs
  // open, the head turned to the side and resting on the rug
  back: both({
    ikF: 0, ikB: 0,
    torsoY: 0.6, roll: 3.0, pitch: 0, chestBend: -0.05, pelvisBend: 0.05, chestYaw: 0.15, pelvisYaw: -0.12,
    neckPitch: -0.35, neckYaw: 0.25, headPitch: -0.15, headYaw: 0.35, headRoll: 0.25,
    flS: 0.55, flE: -2.1, flW: 1.35, flZ: 0.2,
    blH_L: -0.9, blK_L: 2.1, blA_L: -1.5, blH_R: -0.65, blK_R: 1.9, blA_R: -1.35, blZ: 0.55,
    tailPitch: -0.15, tailBendX: 0.0, tailBendY: 0.05, tailWave: 0.12, tailRest: 1,
    look: 0.3, flat: 0, pupil: 0.75,
  }),
};

// Poses are connected the way a real cat moves between them: to lie down from standing she sits
// first, to get up from her side she rolls onto her chest first, and so on.
export const GRAPH = {
  stand: ['sit'],
  sit: ['stand', 'loaf', 'sphinx'],
  loaf: ['sit', 'sphinx', 'side'],
  sphinx: ['stand', 'sit', 'loaf', 'side'],
  side: ['sphinx', 'loaf', 'sleep', 'back'],
  sleep: ['side'],
  back: ['side'],
};

// Parameters are grouped by body part, so a move can lead with one part and follow with another.
export function groupOf(k) {
  if (/^(rootY|torsoY|torsoZ|pitch|roll)$/.test(k)) return 'body';
  if (/^(pelvis|chest)/.test(k)) return 'spine';
  if (/^(neck|head)/.test(k)) return 'head';
  if (/^(fl|sc|ikF|fzF|reach)/.test(k)) return 'front';
  if (/^(bl|ikB|fzB)/.test(k)) return 'hind';
  if (/^tail/.test(k)) return 'tail';
  return 'face';
}

// Choreography of each move between poses: a list of stages. In a stage every body part is taken
// `mix` of the way from the old pose to the new one (parts that are not listed stay where they
// are, the face follows the new pose at once) and `add` offsets parameters on top. The last stage
// completes the move. Springs smooth everything in between, and the leg IK keeps planted paws
// in place, so for example sitting down really is the haunches lowering onto the heels while
// the front paws stay put.
const st = (d, mix, add) => ({ d, mix, add });
export const TRANSITIONS = {
  'stand>sit': [st(0.5, { hind: 0.75, body: 0.45, spine: 0.4, head: 0.35, tail: 0.3 }), st(0.6)],
  'sit>stand': [st(0.42, { hind: 0.6, body: 0.55, spine: 0.6, head: 0.5, front: 0.5, tail: 0.5 }), st(0.45)],
  // lying down from sitting: the front paws walk forward and the chest goes down
  'sit>loaf': [st(0.55, { body: 0.3, spine: 0.35, head: 0.2, hind: 0.2 }, { fzF: 0.35 }), st(0.5, { body: 0.75, spine: 0.8, front: 0.6, hind: 0.7, head: 0.6, tail: 0.6 }), st(0.55)],
  'sit>sphinx': [st(0.55, { body: 0.3, spine: 0.35, head: 0.2, hind: 0.2 }, { fzF: 0.45 }), st(0.5, { body: 0.75, spine: 0.8, front: 0.6, hind: 0.7, head: 0.6, tail: 0.6 }), st(0.55)],
  // and up again: the front legs straighten first
  'loaf>sit': [st(0.5, { front: 0.7, body: 0.45, spine: 0.4, head: 0.5 }), st(0.5)],
  'sphinx>sit': [st(0.5, { front: 0.7, body: 0.45, spine: 0.4, head: 0.5 }), st(0.5)],
  'loaf>sphinx': [st(0.55, { front: 1, head: 0.5, body: 0.4, spine: 0.4 }), st(0.3)],
  'sphinx>loaf': [st(0.55, { front: 1, head: 0.5, body: 0.4, spine: 0.4 }), st(0.3)],
  // getting up from lying on the chest: push up with the front legs, then the hind legs
  'sphinx>stand': [st(0.45, { front: 1, body: 0.4, spine: 0.4, head: 0.6 }), st(0.45, { front: 1, body: 0.85, spine: 0.9, hind: 1, head: 1, tail: 0.6 }), st(0.35)],
  // flopping onto the side: the hind legs slide out first, then the body rolls over
  'sphinx>side': [st(0.45, { hind: 0.35, spine: 0.4, body: 0.2, tail: 0.5 }), st(0.65, { body: 0.9, spine: 0.9, hind: 0.55, front: 0.3, head: 0.5, tail: 1 }), st(0.6)],
  'loaf>side': [st(0.45, { hind: 0.35, spine: 0.4, body: 0.2, tail: 0.5 }), st(0.65, { body: 0.9, spine: 0.9, hind: 0.55, front: 0.3, head: 0.5, tail: 1 }), st(0.6)],
  // and back onto the chest: prop up on the front legs, then roll the hips under
  'side>sphinx': [st(0.45, { front: 0.5, head: 0.7, spine: 0.4, body: 0.3 }), st(0.55, { body: 0.9, spine: 0.9, front: 1, head: 1, hind: 0.7, tail: 0.6 }), st(0.45)],
  'side>loaf': [st(0.45, { front: 0.5, head: 0.7, spine: 0.4, body: 0.3 }), st(0.55, { body: 0.9, spine: 0.9, front: 1, head: 1, hind: 0.7, tail: 0.6 }), st(0.45)],
  // curling up to sleep is slow; waking up starts with the eyes and the head
  'side>sleep': [st(0.9, { spine: 0.55, head: 0.5, front: 0.5, hind: 0.5, tail: 0.4, body: 0.6, face: 0.6 }), st(1.1)],
  'sleep>side': [st(0.45, { face: 1, head: 0.6 }), st(0.7)],
  // rolling onto the back: the legs come up first, then the body rolls
  'side>back': [st(0.4, { front: 0.7, hind: 0.6, spine: 0.3, head: 0.3 }), st(0.65, { body: 0.95, spine: 0.9, front: 1, hind: 1, head: 0.8, tail: 1 }), st(0.4)],
  'back>side': [st(0.4, { head: 0.6, spine: 0.4, front: 0.5, hind: 0.4 }), st(0.6, { body: 0.9, spine: 0.9, front: 1, hind: 1, head: 1, tail: 1 }), st(0.4)],
};

export function poseOf(name) {
  return { ...BASE, ...(POSES[name] || {}) };
}
export { both };
