// Shared setup: open the page, collect page errors, wait for the test hook (window.game2048).
import { expect } from "@playwright/test";

export async function open(page, { init } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // web fonts only change how text looks; skip them so a slow CDN can't stall a test
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // silence the game's sound effects: everything it plays goes into a gain set to 0
  // (the browsers are also launched muted, in playwright.config.mjs)
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
  await page.waitForFunction(() => !!window.game2048);
  return errors;
}

export const state = (page) => page.evaluate(() => window.game2048.state);

// the tiles on screen show exactly the board in the game state
export async function expectTilesMatchBoard(page) {
  await page.evaluate(() => window.game2048.settle());
  const { board, tiles, count } = await page.evaluate(() => ({
    board: window.game2048.state.board,
    tiles: [...Array(16).keys()].map((i) => window.game2048.tileAt(i)),
    count: window.game2048.tileCount(),
  }));
  board.forEach((v, i) => {
    if (v) expect(tiles[i], `cell ${i}`).toEqual({ value: v, text: String(v) });
    else expect(tiles[i], `cell ${i}`).toBeNull();
  });
  expect(count).toBe(board.filter((v) => v).length);
}

// a board where LEFT and UP do nothing, but RIGHT and DOWN slide the single 2
export const CORNER = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export const DEAD = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2048];
