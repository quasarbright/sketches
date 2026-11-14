// Shared setup: open the page, collect page errors, wait for the test hook (window.snakeGame).
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
  await page.waitForFunction(() => !!window.snakeGame);
  if (manual) await page.evaluate(() => window.snakeGame.setManual(true));
  return errors;
}

export const state = (page) => page.evaluate(() => window.snakeGame.state);
export const tick = (page, n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.snakeGame.tick(); }, n);
export const load = (page, game, extra = {}) => page.evaluate(([g, e]) => window.snakeGame.load(g, e), [game, extra]);

// a game in a given position on the 20 x 20 board: snake cells head first
export const at = (x, y) => y * 20 + x;
export const pos = (snake, egg, dir = "RIGHT", extra = {}) => ({ snake, egg, dir, seed: 7, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0, ...extra });
export const LINE = pos([at(10, 10), at(9, 10), at(8, 10)], at(15, 3));
