// Synthesized sound effects, built like 2048's and Snake's: one short envelope per event, and
// repeats of the same sound within 40 ms dropped so the bot at full speed doesn't turn into noise.
let ctx = null, master = null, noise = null;
let muted = false;
const last = {};

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    // a short burst of noise, for the papery sounds
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() { return (ensure()?.resume() ?? Promise.resolve()).catch(() => {}); }
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone({ freq, to = freq, dur = 0.08, type = "triangle", gain = 0.5, delay = 0, hold = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  if (hold) g.gain.setValueAtTime(gain, t + 0.005 + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
// a card landing: a soft filtered tick of noise
function tick({ freq = 1800, dur = 0.05, gain = 0.4, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const note = (base, semis) => base * 2 ** (semis / 12);
// foundation cards climb a major scale by rank, so a run home plays a scale
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21];

const SOUNDS = {
  place: () => tick({ freq: 1500, gain: 0.35 }),
  draw: () => tick({ freq: 2600, dur: 0.04, gain: 0.25 }),
  flip: () => { tick({ freq: 2200, dur: 0.06, gain: 0.3 }); tone({ freq: 700, to: 1000, dur: 0.06, gain: 0.05 }); },
  recycle: () => [0, 1, 2].forEach((i) => tick({ freq: 2000 + i * 300, dur: 0.04, gain: 0.2, delay: i * 0.035 })),
  home: (rank = 0) => {
    const f = note(392, MAJOR[rank]);
    tone({ freq: f, dur: 0.22, hold: 0.03, gain: 0.25 });
    tone({ freq: f * 2, dur: 0.12, gain: 0.06, type: "sine" });
  },
  bump: () => tone({ freq: 140, to: 100, dur: 0.07, gain: 0.25 }),
  botOn: () => [0, 7].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06 })),
  botOff: () => [7, 0].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06 })),
  win: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: note(523.25, s), dur: i === 6 ? 0.5 : 0.14, gain: 0.3, delay: i * 0.075, type: "square" })),
  stuck: () => [0, -3, -7].forEach((s, i) => tone({ freq: note(330, s), dur: 0.22, gain: 0.2, delay: i * 0.13 })),
};

export const NAMES = Object.keys(SOUNDS);

export function play(name, arg) {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (last[name] && now - last[name] < 40) return;
  last[name] = now;
  SOUNDS[name]?.(arg);
}
