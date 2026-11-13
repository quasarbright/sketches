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
  if (ctx.state === "suspended") ctx.resume().catch(() => {}); // rejects if the page is leaving
  return ctx;
}

export function unlockAudio() { return (ensure()?.resume() ?? Promise.resolve()).catch(() => {}); }
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

// hold: seconds at full level before the decay starts, so a note rings long enough to hear its pitch
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

// semitones above a base note
const note = (base, semis) => base * 2 ** (semis / 12);
// Tiles climb the notes of a C major chord, C E G C E G ..., from middle C for a 4. Any set of tiles
// then sounds like one chord when they merge together.
const C4 = 261.63; // low notes are hard to hear on laptop and phone speakers
const CHORD = [0, 4, 7];
const chordStep = (k) => 12 * Math.floor(k / 3) + CHORD[k % 3];
export const tileFreq = (v) => note(C4, chordStep(Math.max(0, Math.log2(v) - 2)));

const SOUNDS = {
  slide: () => tone({ freq: 300, to: 200, dur: 0.05, gain: 0.14, type: "triangle" }),
  // every tile made by one move sounds at once, each at its own chord note
  merge: (values = [4]) => {
    const vs = [...new Set(values)];
    const g = 0.4 / Math.sqrt(vs.length); // a chord shouldn't be much louder than one note
    for (const v of vs) {
      const f = tileFreq(v);
      // a plucked bell: a round triangle that rings, with a short square edge on the attack
      tone({ freq: f, dur: 0.5, hold: 0.06, gain: g, type: "triangle" });
      tone({ freq: f * 2, dur: 0.35, hold: 0.04, gain: g * 0.35, type: "triangle" });
      tone({ freq: f, dur: 0.05, gain: g * 0.25, type: "square" });
    }
  },
  // a new biggest tile from 512 up: the chord rolled upward from that tile's note
  record: (v = 512) => {
    const k = chordStep(Math.log2(v) - 2);
    [0, 1, 2, 3].forEach((i) => tone({ freq: note(C4, k + chordStep(i)), dur: 0.16, gain: 0.26, delay: 0.06 + i * 0.07, type: "triangle" }));
  },
  // 2048 and up, with the banner
  fanfare: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: note(523.25, s), dur: i === 6 ? 0.5 : 0.14, gain: 0.3, delay: i * 0.075 })),
  botOn: () => [0, 7].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  botOff: () => [7, 0].forEach((s, i) => tone({ freq: note(523.25, s), dur: 0.07, gain: 0.2, delay: i * 0.06, type: "triangle" })),
  bump: () => tone({ freq: 120, to: 90, dur: 0.07, gain: 0.25, type: "triangle" }),
  over: () => [0, -3, -7, -12].forEach((s, i) => tone({ freq: note(261.63, s), dur: 0.3, gain: 0.3, delay: i * 0.16, type: "sawtooth" })),
};

export const NAMES = Object.keys(SOUNDS);

export function play(name, arg) {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (last[name] && now - last[name] < 40) return;
  last[name] = now;
  SOUNDS[name]?.(arg);
}
