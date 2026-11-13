// Synthesized sounds: meow, purr, boop and hiss (no audio files)
export class CatAudio {
  constructor() { this.ctx = null; this.muted = false; this.purrGain = null; }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.setupPurr();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  setupPurr() {
    const c = this.ctx;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 26;
    const lfoGain = c.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    // slow in/out breathing
    const breath = c.createOscillator(); breath.frequency.value = 0.55;
    const bg = c.createGain(); bg.gain.value = 0.15;
    breath.connect(bg).connect(am.gain);
    this.purrGain = c.createGain(); this.purrGain.gain.value = 0;
    src.connect(lp).connect(am).connect(this.purrGain).connect(this.master);
    src.start(); lfo.start(); breath.start();
  }

  purr(on) {
    if (!this.ctx || !this.purrGain) return;
    this.purrGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, on ? 0.3 : 0.6);
  }

  meow(kind = 'normal') {
    this.ensure();
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const dur = kind === 'short' ? 0.35 : kind === 'chirp' ? 0.22 : 0.8;
    const base = kind === 'chirp' ? 700 : 520 + Math.random() * 80;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.85, t);
    osc.frequency.linearRampToValueAtTime(base * 1.45, t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(base * 0.9, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 6; const vg = c.createGain(); vg.gain.value = 12;
    vib.connect(vg).connect(osc.frequency);
    const env = c.createGain(); env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.06);
    env.gain.setValueAtTime(0.35, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // "ee-ah-oo" formants
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    f1.frequency.setValueAtTime(900, t); f1.frequency.linearRampToValueAtTime(1300, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(700, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
    f2.frequency.setValueAtTime(2600, t); f2.frequency.linearRampToValueAtTime(1900, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.5;
    osc.connect(f1).connect(env); osc.connect(f2).connect(g2).connect(env);
    env.connect(this.master);
    osc.start(t); vib.start(t); osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  boop() {
    this.ensure(); if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    const g = c.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16);
  }

  hiss() {
    this.ensure(); if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = c.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    s.connect(hp).connect(g).connect(this.master); s.start(t);
  }
}
