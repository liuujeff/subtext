// Sound effects, synthesized with Web Audio: no files to load. Browser only.
// Each guess is a sonar ping: higher the more points it scores, panned toward
// the clue it leans to, with an echo that comes back sooner the closer it
// lands. Muting is this browser's choice, kept in localStorage.

const MUTED_KEY = "subtext-muted";

// Major pentatonic steps up from C5, so a round's pings always sound in key.
const BASE_HZ = 523.25;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];

type Out = { ctx: AudioContext; out: AudioNode };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

// --- Muting: read from storage once, then kept here (like ThemePicker.tsx).

let muted: boolean | null = null;
const listeners = new Set<() => void>();

function storedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function apply(value: boolean) {
  muted = value;
  if (value) void ctx?.suspend();
  listeners.forEach((l) => l());
}

export const isMuted = () => (muted ??= storedMuted());

export function setMuted(value: boolean) {
  try {
    if (value) localStorage.setItem(MUTED_KEY, "1");
    else localStorage.removeItem(MUTED_KEY);
  } catch {}
  apply(value);
}

export function subscribeMuted(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUTED_KEY) apply(storedMuted());
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// --- Output

/**
 * The shared output, made on first use. Null when muted, without Web Audio, or
 * before the player has interacted with the page (browsers block audio until then).
 */
function output(): Out | null {
  if (isMuted() || typeof AudioContext === "undefined") return null;
  if (!ctx) {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
    // Safari: mix with the player's music or podcast, and follow the silent switch.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
    ctx = new AudioContext();
    master = new GainNode(ctx, { gain: 0.5 });
    // A limiter, so sounds that overlap never clip.
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -10, ratio: 8 });
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state !== "running") void ctx.resume();
  return { ctx, out: master! };
}

/** ±`spread` at random, so repeats don't sound mechanical. */
const vary = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

type ToneOptions = {
  at?: number;
  gain?: number;
  attack?: number;
  decay?: number;
  type?: OscillatorType;
  glide?: number; // Hz to slide to over the note
  dest?: AudioNode;
};

/** One note: a quick rise, then an exponential fade. */
function tone(o: Out, hz: number, opts: ToneOptions = {}) {
  const { at = 0, gain = 0.2, attack = 0.003, decay = 0.3, type = "sine", glide, dest = o.out } = opts;
  const t = o.ctx.currentTime + at;
  const osc = new OscillatorNode(o.ctx, { type, frequency: hz });
  const env = new GainNode(o.ctx, { gain: 1e-4 });
  if (glide) {
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(glide, t + attack + decay);
  }
  env.gain.setValueAtTime(1e-4, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
  osc.connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

type HissOptions = {
  at?: number;
  gain?: number;
  attack?: number;
  decay?: number;
  filter?: BiquadFilterType;
  hz?: number;
  sweep?: number; // Hz for the filter to sweep to over the sound
  q?: number;
  dest?: AudioNode;
};

/** A burst of filtered noise: clicks, clunks, the rush of a launch. */
function hiss(o: Out, opts: HissOptions = {}) {
  const { at = 0, gain = 0.1, attack = 0.001, decay = 0.05, filter = "bandpass", hz = 2000, sweep, q = 0.7 } = opts;
  const dest = opts.dest ?? o.out;
  if (!noise || noise.sampleRate !== o.ctx.sampleRate) {
    noise = new AudioBuffer({ length: o.ctx.sampleRate, sampleRate: o.ctx.sampleRate });
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = o.ctx.currentTime + at;
  const src = new AudioBufferSourceNode(o.ctx, { buffer: noise });
  const band = new BiquadFilterNode(o.ctx, { type: filter, frequency: hz, Q: q });
  const env = new GainNode(o.ctx, { gain: 1e-4 });
  if (sweep) {
    band.frequency.setValueAtTime(hz, t);
    band.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
  }
  env.gain.setValueAtTime(1e-4, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
  src.connect(band).connect(env).connect(dest);
  // A random start in the 1 s buffer, so no two bursts are the same noise.
  src.start(t, Math.random() * 0.4);
  src.stop(t + attack + decay + 0.02);
}

/** Seconds before a ping's echo returns: 0.07 at the target, 0.47 at the rim. */
export function echoDelay(points: number): number {
  return 0.07 + 0.4 * (1 - points / 100);
}

/** The ping's pitch in Hz: a step up the scale for every 12.5 points. */
export function pingHz(points: number): number {
  const step = SCALE[Math.round((points / 100) * (SCALE.length - 1))];
  return BASE_HZ * 2 ** (step / 12);
}

/** A sonar ping and its echoes, `bearing` -1 (toward A, left) to 1 (B, right). */
function sonar(o: Out, points: number, bearing: number, at: number) {
  const hz = pingHz(points) * vary(0.006);
  const pan = new StereoPannerNode(o.ctx, { pan: bearing * 0.8 });
  const echo = new DelayNode(o.ctx, { delayTime: echoDelay(points), maxDelayTime: 1 });
  const damp = new BiquadFilterNode(o.ctx, { type: "lowpass", frequency: 2200 });
  const wet = new GainNode(o.ctx, { gain: 0.5 });
  const feedback = new GainNode(o.ctx, { gain: 0.32 });
  // Dry to the output; through the delay for the echo, which feeds back
  // (duller each time, like sound through water) until it dies away.
  pan.connect(o.out);
  pan.connect(echo).connect(damp);
  damp.connect(wet).connect(o.out);
  damp.connect(feedback).connect(echo);
  tone(o, hz, { at, gain: 0.22, attack: 0.004, decay: 1.1, dest: pan });
  tone(o, hz * 2, { at, gain: 0.035, attack: 0.004, decay: 0.35, dest: pan });
  hiss(o, { at, gain: 0.05, decay: 0.015, filter: "highpass", hz: 4000, dest: pan });
  // 0.32 per echo is silent long before this.
  setTimeout(() => [pan, echo, damp, wet, feedback].forEach((n) => n.disconnect()), (at + 4) * 1000);
}

export const sfx = {
  /** Fire pressed: the trigger's click while the server scores the guess. */
  arm() {
    const o = output();
    if (!o) return;
    hiss(o, { gain: 0.08 * vary(0.2), decay: 0.025, hz: 2600, q: 1.4 });
    tone(o, 1200, { gain: 0.04, decay: 0.05, glide: 900 });
  },

  /** The guess counted: a thump from the tube (top left) and the rush of the run. */
  launch() {
    const o = output();
    if (!o) return;
    const left = new StereoPannerNode(o.ctx, { pan: -0.4 });
    left.connect(o.out);
    tone(o, 110, { gain: 0.3, decay: 0.3, glide: 45, dest: left });
    hiss(o, { gain: 0.1, attack: 0.05, decay: 0.45, hz: 500, sweep: 1600, q: 0.8, dest: left });
    setTimeout(() => left.disconnect(), 1500);
  },

  /** The blip lands, `at` seconds from now. */
  ping(points: number, bearing: number, at = 0) {
    const o = output();
    if (o) sonar(o, points, bearing, at);
  },

  /** A rank-1 guess lands on the target: a thud, the ping, a rising chord. */
  lock(at = 0) {
    const o = output();
    if (!o) return;
    sonar(o, 100, 0, at);
    tone(o, 140, { at, gain: 0.45, decay: 0.35, glide: 50 });
    hiss(o, { at, gain: 0.22, decay: 0.08, hz: 1800, q: 1.2 });
    [1046.5, 1318.5, 1568, 2093].forEach((hz, i) =>
      tone(o, hz, { at: at + 0.12 + i * 0.07, gain: 0.07, attack: 0.005, decay: 1.4, type: "triangle" }),
    );
  },

  /** A guess that doesn't count: two dull clunks, unlike anything that fires. */
  dud() {
    const o = output();
    if (!o) return;
    for (const at of [0, 0.11]) {
      tone(o, 190, { at, gain: 0.16, decay: 0.08, glide: 150, type: "triangle" });
      hiss(o, { at, gain: 0.1, decay: 0.05, hz: 600, q: 1 });
    }
  },
};
