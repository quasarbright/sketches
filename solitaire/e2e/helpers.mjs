// Shared setup: open the page, collect page errors, wait for the test hook (window.solitaire).
export async function open(page, { init, manual = true } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // web fonts only change how text looks; skip them so a slow CDN can't stall a test
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // silence the game's sound effects: everything it plays goes into a gain set to 0
  await page.addInitScript(() => {
    const AC = window.AudioContext;
    if (!AC) return;
    window.AudioContext = class extends AC {
      get destination() {
        if (!this._silent) { this._silent = this.createGain(); this._silent.gain.value = 0; this._silent.connect(super.destination); }
        return this._silent;
      }
    };
  });
  if (init) await page.addInitScript(init);
  await page.goto("index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.solitaire);
  if (manual) await page.evaluate(() => window.solitaire.setManual(true));
  return errors;
}

export const state = (page) => page.evaluate(() => window.solitaire.state);
export const info = (page) => page.evaluate(() => window.solitaire.info);
export const c = (rank, suit) => "SHDC".indexOf(suit) * 13 + ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(rank);
const empty = () => Array.from({ length: 7 }, () => ({ down: [], up: [] }));
// a position: everything not placed goes in the stock
export function position({ tab = empty(), found = [[], [], [], []], waste = [] } = {}) {
  const used = new Set([...tab.flatMap((t) => [...t.down, ...t.up]), ...found.flat(), ...waste]);
  const stock = [...Array(52).keys()].filter((k) => !used.has(k));
  return { seed: 1, moves: 0, stock, waste, found, tab };
}
