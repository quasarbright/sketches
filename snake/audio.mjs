// Synthesized sound effects, built like 2048's: one short envelope per event, and repeats of the
// same sound within 40 ms dropped so the bot at hundreds of steps a second doesn't turn into noise.
let ctx = null, master = null;
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
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {}); // rejects if the page is leaving
  return ctx;
}

export function unlockAudio() { return (ensure()?.resume() ?? Promise.resolve()).catch(() => {}); }
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone({ freq, to = freq, dur = 0.08, type = "square", gain = 0.5, delay = 0, hold = 0 }) {
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

const note = (base, semis) => base * 2 ** (semis / 12);
// Eggs climb a major pentatonic scale from middle C and wrap every two octaves, so a run of
// eggs makes a little tune instead of one pitch over and over.
const PENTA = [0, 2, 4, 7, 9];
const eggNote = (n) => note(261.63, 12 * (Math.floor(n / 5) % 2) + PENTA[n % 5]);

const SOUNDS = {
  eat: (n = 0) => {
    const f = eggNote(n);
    tone({ freq: f, dur: 0.18, hold: 0.03, gain: 0.32, type: "triangle" });
    tone({ freq: f * 2, dur: 0.1, gain: 0.08, type: "square" });
  },
  turn: () => tone({ freq: 520, to: 480, dur: 0.025, gain: 0.05, type: "triangle" }),
  botOn: () => [0, 7].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  botOff: () => [7, 0].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  pause: () => tone({ freq: 392, to: 330, dur: 0.08, gain: 0.15, type: "triangle" }),
  crash: () => {
    tone({ freq: 180, to: 60, dur: 0.35, gain: 0.4, type: "sawtooth" });
    [0, -3, -7].forEach((s, i) => tone({ freq: note(220, s), dur: 0.26, gain: 0.22, delay: 0.25 + i * 0.15, type: "square" }));
  },
  win: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: note(523.25, s), dur: i === 6 ? 0.5 : 0.14, gain: 0.3, delay: i * 0.075 })),
};

export const NAMES = Object.keys(SOUNDS);

export function play(name, arg) {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (last[name] && now - last[name] < 40) return;
  last[name] = now;
  SOUNDS[name]?.(arg);
}
