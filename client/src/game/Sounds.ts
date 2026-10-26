// Sound effects, all synthesized with the Web Audio API: no audio files to load.
// One-shot sounds for events (a customer comes in, a dish is ready…) and a loop for every appliance
// while it works (sizzling stove, bubbling fryer…).

import type { EquipmentId } from "@cacao/shared";

const MUTED_KEY = "cacao-kitchen:muted";

export type SoundName =
  | "doorbell" | "pop" | "chair" | "scribble" | "ticket" | "crumple" | "fridge" | "phone" | "keyboard"
  | "pageFlip" | "truck" | "boxes" | "stepStart" | "stepDone" | "pickUp" | "passBell" | "serve"
  | "trash" | "register" | "wipe" | "sparkle" | "angry" | "place" | "shiftOpen" | "shiftClosing"
  | "shiftEnd" | "gameOver" | "levelUp";

/** An appliance's running sound: its nodes, and the timers scheduling its crackles and knocks. */
interface Loop {
  output: GainNode;
  sources: AudioScheduledSourceNode[];
  timers: number[];
}

class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops = new Map<string, Loop>();
  private listeners = new Set<() => void>();
  muted = loadMuted();

  /** Browsers only allow audio after a user gesture: call this from one (the first key or click). */
  unlock() {
    const ctx = this.context();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {
      // ignore: it's only a preference
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1;
    this.listeners.forEach((listener) => listener());
  }

  /** Called whenever `muted` changes; returns the unsubscribe function. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** `pan` from -1 (left) to 1 (right): where on the map it happens. */
  play(name: SoundName, pan = 0) {
    const ctx = this.context();
    if (!ctx || ctx.state !== "running") return;
    const out = this.panned(pan);
    const t = ctx.currentTime;
    switch (name) {
      case "doorbell":
        this.tone(out, t, 880, 0.5, { type: "triangle", gain: 0.25 });
        this.tone(out, t + 0.28, 660, 0.7, { type: "triangle", gain: 0.25 });
        break;
      case "pop":
        this.tone(out, t, 420, 0.08, { gain: 0.25, slideTo: 820 });
        break;
      case "chair":
        this.noiseBurst(out, t, 0.12, { filter: "lowpass", freq: 600, gain: 0.3 });
        this.tone(out, t, 140, 0.12, { gain: 0.15, slideTo: 90 });
        break;
      case "scribble":
        for (let i = 0; i < 5; i++) {
          this.noiseBurst(out, t + i * 0.07, 0.05, { filter: "bandpass", freq: 2800 + Math.random() * 1500, gain: 0.25 });
        }
        break;
      case "ticket":
        // Order bell, then the printer.
        this.bell(out, t, 1568, 0.25);
        for (let i = 0; i < 3; i++) this.tone(out, t + 0.35 + i * 0.09, 1100, 0.06, { type: "square", gain: 0.05 });
        break;
      case "crumple":
        for (let i = 0; i < 6; i++) {
          this.noiseBurst(out, t + Math.random() * 0.3, 0.04, { filter: "bandpass", freq: 1500 + Math.random() * 2500, gain: 0.3 });
        }
        break;
      case "fridge":
        this.noiseBurst(out, t, 0.18, { filter: "lowpass", freq: 350, gain: 0.5 });
        this.tone(out, t, 90, 0.2, { gain: 0.25 });
        break;
      case "phone":
        // Dialing: a few touch-tone beeps.
        [[697, 1209], [770, 1336], [852, 1477], [697, 1336], [941, 1209]].forEach(([low, high], i) => {
          this.tone(out, t + i * 0.13, low, 0.08, { gain: 0.08 });
          this.tone(out, t + i * 0.13, high, 0.08, { gain: 0.08 });
        });
        break;
      case "keyboard":
        for (let i = 0; i < 7; i++) {
          this.noiseBurst(out, t + i * 0.06 + Math.random() * 0.03, 0.015, { filter: "highpass", freq: 3000, gain: 0.25 });
        }
        break;
      case "pageFlip":
        this.noiseBurst(out, t, 0.18, { filter: "bandpass", freq: 1800, gain: 0.3, sweepTo: 4500 });
        break;
      case "truck":
        for (const at of [0, 0.45]) {
          this.tone(out, t + at, 220, 0.35, { type: "square", gain: 0.06, lowpass: 900 });
          this.tone(out, t + at, 277, 0.35, { type: "square", gain: 0.06, lowpass: 900 });
        }
        break;
      case "boxes":
        // Unloading the truck: a few boxes put down over the action's 3 seconds.
        for (const at of [0.2, 1.1, 2.1]) {
          this.tone(out, t + at, 80, 0.25, { gain: 0.35, slideTo: 50 });
          this.noiseBurst(out, t + at, 0.1, { filter: "lowpass", freq: 600, gain: 0.3 });
        }
        break;
      case "stepStart":
        this.tone(out, t, 600, 0.05, { type: "square", gain: 0.05 });
        this.tone(out, t + 0.06, 900, 0.05, { type: "square", gain: 0.05 });
        break;
      case "stepDone":
        // Kitchen timer.
        this.bell(out, t, 1760, 0.2);
        this.bell(out, t + 0.18, 1760, 0.2);
        break;
      case "pickUp":
        this.tone(out, t, 700, 0.06, { gain: 0.15, slideTo: 1000 });
        break;
      case "passBell":
        // The bell on the pass: a dish is ready to take to the table.
        this.bell(out, t, 2093, 0.35);
        break;
      case "serve":
        this.tone(out, t, 2200, 0.25, { gain: 0.08 });
        this.tone(out, t, 3300, 0.2, { gain: 0.05 });
        this.noiseBurst(out, t, 0.03, { filter: "highpass", freq: 4000, gain: 0.15 });
        break;
      case "trash":
        this.noiseBurst(out, t, 0.35, { filter: "lowpass", freq: 1200, gain: 0.4, sweepTo: 200 });
        this.tone(out, t + 0.25, 70, 0.2, { gain: 0.3 });
        break;
      case "register":
        // Drawer, then the "ching".
        this.noiseBurst(out, t, 0.12, { filter: "bandpass", freq: 900, gain: 0.35 });
        this.bell(out, t + 0.12, 2637, 0.3);
        this.bell(out, t + 0.12, 3322, 0.2);
        break;
      case "wipe":
        for (const at of [0, 0.22]) this.noiseBurst(out, t + at, 0.18, { filter: "bandpass", freq: 1200, gain: 0.25, sweepTo: 2500 });
        break;
      case "sparkle":
        [1800, 2400, 3000].forEach((freq, i) => this.tone(out, t + i * 0.06, freq, 0.15, { gain: 0.06 }));
        break;
      case "angry":
        this.tone(out, t, 170, 0.45, { type: "sawtooth", gain: 0.1, slideTo: 95, lowpass: 800 });
        break;
      case "place":
        this.tone(out, t, 130, 0.25, { gain: 0.35, slideTo: 80 });
        this.noiseBurst(out, t, 0.06, { filter: "lowpass", freq: 900, gain: 0.25 });
        [1318, 1568].forEach((freq, i) => this.tone(out, t + 0.15 + i * 0.08, freq, 0.2, { type: "triangle", gain: 0.1 }));
        break;
      case "shiftOpen":
        [784, 988, 1175].forEach((freq, i) => this.bell(out, t + i * 0.18, freq, 0.25));
        break;
      case "shiftClosing":
        [1175, 784].forEach((freq, i) => this.bell(out, t + i * 0.3, freq, 0.3));
        break;
      case "shiftEnd":
        [523, 659, 784, 1047].forEach((freq, i) => this.tone(out, t + i * 0.12, freq, 0.6, { type: "triangle", gain: 0.12 }));
        break;
      case "gameOver":
        [392, 330, 262].forEach((freq, i) => this.tone(out, t + i * 0.35, freq, 0.5, { type: "sawtooth", gain: 0.08, lowpass: 1200 }));
        break;
      case "levelUp":
        [523, 659, 784, 1047, 1319].forEach((freq, i) => this.tone(out, t + i * 0.1, freq, i === 4 ? 0.6 : 0.15, { type: "square", gain: 0.06, lowpass: 2500 }));
        break;
    }
  }

  /** A rising arpeggio with one note per star: the sound of a review. */
  playStars(stars: number, pan = 0) {
    const ctx = this.context();
    if (!ctx || ctx.state !== "running") return;
    const out = this.panned(pan);
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < stars; i++) this.tone(out, ctx.currentTime + i * 0.09, notes[i], 0.25, { type: "triangle", gain: 0.1 });
  }

  /** Starts the sound of an appliance at work (replacing any it was already making). */
  startLoop(id: string, kind: EquipmentId, pan = 0) {
    this.stopLoop(id);
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const output = ctx.createGain();
    output.gain.setValueAtTime(0, ctx.currentTime);
    output.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.3);
    output.connect(this.panned(pan));
    const loop: Loop = { output, sources: [], timers: [] };
    const every = (ms: number, fn: () => void) => loop.timers.push(window.setInterval(fn, ms));
    const now = () => ctx.currentTime;

    switch (kind) {
      case "stove":
        // Sizzle, with the odd crackle.
        loop.sources.push(this.noiseLoop(output, { filter: "bandpass", freq: 5000, q: 0.6, gain: 0.05 }));
        every(90, () => {
          if (Math.random() < 0.5) this.noiseBurst(output, now(), 0.012, { filter: "highpass", freq: 3000, gain: 0.12 * Math.random() });
        });
        break;
      case "oven":
        loop.sources.push(this.noiseLoop(output, { filter: "lowpass", freq: 400, gain: 0.08 }));
        loop.sources.push(this.hum(output, 60, 0.03));
        break;
      case "fryer":
        // Oil bubbling.
        loop.sources.push(this.noiseLoop(output, { filter: "bandpass", freq: 2500, q: 0.8, gain: 0.03 }));
        every(45, () => {
          if (Math.random() < 0.6) this.tone(output, now(), 300 + Math.random() * 500, 0.03, { gain: 0.04 * Math.random(), slideTo: 900 });
        });
        break;
      case "airFryer":
        // Fan.
        loop.sources.push(this.noiseLoop(output, { filter: "lowpass", freq: 900, gain: 0.07 }));
        loop.sources.push(this.hum(output, 180, 0.012));
        break;
      case "workbench":
        // Knife on the board.
        every(320, () => {
          this.tone(output, now(), 190, 0.06, { gain: 0.2, slideTo: 120 });
          this.noiseBurst(output, now(), 0.025, { filter: "bandpass", freq: 2000, gain: 0.15 });
        });
        break;
      case "blender": {
        const motor = ctx.createOscillator();
        motor.type = "sawtooth";
        motor.frequency.value = 110;
        const wobble = ctx.createOscillator();
        wobble.frequency.value = 6;
        const wobbleDepth = ctx.createGain();
        wobbleDepth.gain.value = 8;
        wobble.connect(wobbleDepth).connect(motor.frequency);
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1200;
        const gain = ctx.createGain();
        gain.gain.value = 0.035;
        motor.connect(filter).connect(gain).connect(output);
        motor.start();
        wobble.start();
        loop.sources.push(motor, wobble);
        break;
      }
      case "coffeeMachine":
        // Steam hiss and gurgling.
        loop.sources.push(this.noiseLoop(output, { filter: "highpass", freq: 2500, gain: 0.035 }));
        every(140, () => {
          if (Math.random() < 0.5) this.tone(output, now(), 180 + Math.random() * 150, 0.07, { gain: 0.08, slideTo: 260 });
        });
        break;
      case "freezer":
        return;
    }
    this.loops.set(id, loop);
  }

  stopLoop(id: string) {
    const loop = this.loops.get(id);
    if (!loop || !this.ctx) return;
    this.loops.delete(id);
    loop.timers.forEach((timer) => window.clearInterval(timer));
    const end = this.ctx.currentTime + 0.25;
    loop.output.gain.cancelScheduledValues(this.ctx.currentTime);
    loop.output.gain.setValueAtTime(loop.output.gain.value, this.ctx.currentTime);
    loop.output.gain.linearRampToValueAtTime(0, end);
    loop.sources.forEach((source) => source.stop(end));
  }

  stopAllLoops() {
    [...this.loops.keys()].forEach((id) => this.stopLoop(id));
  }

  private context() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    // Keep the sum of many sounds from clipping.
    const limiter = this.ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(this.ctx.destination);
    // Two seconds of white noise, reused by every noisy sound.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private panned(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return this.master!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master!);
    return panner;
  }

  /** A note with a quick attack and an exponential fade. */
  private tone(
    out: AudioNode,
    at: number,
    freq: number,
    duration: number,
    { type = "sine", gain = 0.2, slideTo, lowpass }: { type?: OscillatorType; gain?: number; slideTo?: number; lowpass?: number } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    // Exponential ramps can't reach 0, and random volumes can be.
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let node: AudioNode = osc;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      node = node.connect(filter);
    }
    node.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  /** A bell: a pure tone with an inharmonic overtone, ringing out. */
  private bell(out: AudioNode, at: number, freq: number, gain: number) {
    this.tone(out, at, freq, 1.1, { gain });
    this.tone(out, at, freq * 2.76, 0.5, { gain: gain * 0.3 });
  }

  /** A short burst of filtered noise; `sweepTo` moves the filter over the burst. */
  private noiseBurst(
    out: AudioNode,
    at: number,
    duration: number,
    { filter = "lowpass", freq = 1000, gain = 0.2, sweepTo }: { filter?: BiquadFilterType; freq?: number; gain?: number; sweepTo?: number },
  ) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, at);
    if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(biquad).connect(env).connect(out);
    // Start at a random point, so repeated bursts don't sound identical.
    source.start(at, Math.random() * 1.5, duration + 0.05);
  }

  /** Endless filtered noise, for loops. */
  private noiseLoop(out: AudioNode, { filter, freq, q = 1, gain }: { filter: BiquadFilterType; freq: number; q?: number; gain: number }) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = freq;
    biquad.Q.value = q;
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(biquad).connect(level).connect(out);
    source.start();
    return source;
  }

  /** A steady low hum, like a motor or an oven element. */
  private hum(out: AudioNode, freq: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const level = ctx.createGain();
    level.gain.value = gain;
    osc.connect(level).connect(out);
    osc.start();
    return osc;
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

/** One audio engine for the whole page. */
export const sounds = new Sounds();
