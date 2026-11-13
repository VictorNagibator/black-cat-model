// Библиотека поз. Каждая поза — переопределения базовых параметров (BASE).
import { BASE } from './cat.js';

const both = (o) => {
  // flS: 0.2 -> flS_L и flS_R
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (/^(fl|bl)[A-Z]$/.test(k)) { r[k + '_L'] = v; r[k + '_R'] = v; }
    else r[k] = v;
  }
  return r;
};

export const POSES = {
  stand: both({}),

  sit: both({
    torsoY: 0.66, torsoZ: 0.05, pitch: -0.95,
    pelvisBend: 0.0, chestBend: -0.05,
    neckPitch: 0.1, headPitch: 0.55,
    flS: 0.95, flE: -0.02, flW: 0.02,
    blH: -0.75, blK: 3.0, blA: -2.85, blZ: 0.25,
    tailPitch: 0.75, tailBendX: 0.0, tailBendY: 0.2, tailWave: 0.05,
  }),

  loaf: both({
    torsoY: 0.56, pitch: 0.02, pelvisBend: 0,
    neckPitch: -0.25, headPitch: 0.3,
    flS: 1.55, flE: -2.9, flW: 1.2,
    blH: -1.45, blK: 2.95, blA: -2.9, blZ: 0.1,
    tailPitch: -1.0, tailBendX: 0.07, tailBendY: 0.24, tailYaw: 0.5, tailWave: 0.04,
    lidUp: 0.3, flat: 0,
  }),

  sphinx: both({
    torsoY: 0.55, pitch: 0.0,
    neckPitch: -0.45, headPitch: 0.35,
    flS: -1.3, flE: -0.15, flW: 0.0,
    blH: -1.45, blK: 2.95, blA: -2.9, blZ: 0.15,
    tailPitch: -0.05, tailBendX: 0, tailBendY: 0.12, tailYaw: 0.5, tailWave: 0.06,
  }),

  side: both({
    torsoY: 0.62, pitch: 0, roll: 1.05, chestRoll: -0.5, pelvisBend: 0.1,
    neckPitch: -0.55, neckRoll: -0.4, headPitch: 0.35, headRoll: -0.15,
    flS_L: -1.25, flE_L: 0.35, flW_L: 0.2, flS_R: -0.9, flE_R: 0.6, flW_R: 0.3,
    flZ_L: -0.15, flZ_R: 0.1,
    blH_L: -1.35, blK_L: 1.7, blA_L: -1.2, blH_R: -1.1, blK_R: 1.5, blA_R: -1.0,
    blZ_L: 0.15, blZ_R: -0.15,
    tailPitch: 0, tailBendX: 0.12, tailBendY: 0.05, tailWave: 0.06,
    look: 0.7, flat: 0,
  }),

  sleep: both({
    torsoY: 0.56, pitch: 0, roll: 1.45, chestBend: 0.5, pelvisBend: -0.4,
    neckPitch: 0.45, neckRoll: 0.05, headPitch: 0.4, headRoll: 0.15, headYaw: 0.1,
    flS_L: -1.3, flE_L: 1.9, flW_L: 0.6, flS_R: -0.7, flE_R: 0.9, flW_R: 0.3,
    blH: -1.1, blK: 1.1, blA: -0.6,
    flZ_L: 0.15, flZ_R: -0.1, blZ_L: 0.15, blZ_R: -0.1,
    tailPitch: -0.2, tailBendX: -0.15, tailBendY: 0.05, tailWave: 0.02,
    lidUp: 1, lidLow: 1, look: 0, flat: 0, pupil: 0.2,
  }),

  back: both({
    torsoY: 0.6, roll: 3.08, pitch: 0, chestBend: -0.08, pelvisBend: 0.08,
    neckPitch: 0.2, headPitch: 0.15, headRoll: 0.4,
    flS: -1.45, flE: 2.45, flW: 0.9, flZ: 0.2,
    blH_L: -1.0, blK_L: 1.0, blA_L: -0.4, blH_R: -0.35, blK_R: 0.6, blA_R: -0.3, blZ: 0.5,
    tailPitch: 0.4, tailBendX: 0.02, tailBendY: 0.03, tailWave: 0.12,
    look: 0.3, flat: 0, pupil: 0.75,
  }),
};

export function poseOf(name) {
  return { ...BASE, ...(POSES[name] || {}) };
}
export { both };
