// Synthesized sound effects, built like tetris's: one short envelope per event, and repeats of
// the same sound within 40 ms dropped so the bot at 30 moves a second doesn't turn into noise.
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
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio() { ensure(); }
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone({ freq, to = freq, dur = 0.08, type = "square", gain = 0.5, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// semitones above a base note
const note = (base, semis) => base * 2 ** (semis / 12);
// the major pentatonic, so merges of any size sound fine back to back
const PENTA = [0, 2, 4, 7, 9];
const pentaStep = (k) => 12 * Math.floor(k / 5) + PENTA[k % 5];

const SOUNDS = {
  slide: () => tone({ freq: 300, to: 200, dur: 0.05, gain: 0.14, type: "triangle" }),
  // a merge's pitch climbs with the tile: 4 is the lowest note, each doubling one step up
  merge: (v = 4) => {
    const f = note(330, pentaStep(Math.log2(v) - 2));
    tone({ freq: f, dur: 0.09, gain: 0.28, type: "square" });
    tone({ freq: f * 2, dur: 0.06, gain: 0.08, type: "triangle", delay: 0.02 });
  },
  // a new biggest tile from 512 up: a rising arpeggio from that tile's note
  record: (v = 512) => {
    const k = pentaStep(Math.log2(v) - 2);
    [0, 4, 7, 12].forEach((s, i) => tone({ freq: note(330, k + s), dur: 0.16, gain: 0.26, delay: 0.06 + i * 0.07, type: "triangle" }));
  },
  // 2048 and up, with the banner
  fanfare: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: note(523, s), dur: i === 6 ? 0.5 : 0.14, gain: 0.3, delay: i * 0.075 })),
  botOn: () => [0, 7].forEach((s, i) => tone({ freq: note(660, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  botOff: () => [7, 0].forEach((s, i) => tone({ freq: note(660, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  bump: () => tone({ freq: 120, to: 90, dur: 0.07, gain: 0.25, type: "triangle" }),
  over: () => [0, -3, -7, -12].forEach((s, i) => tone({ freq: note(330, s), dur: 0.3, gain: 0.3, delay: i * 0.16, type: "sawtooth" })),
};

export function play(name, arg) {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (last[name] && now - last[name] < 40) return;
  last[name] = now;
  SOUNDS[name]?.(arg);
}
