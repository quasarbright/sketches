// The page through its test hook and real button clicks: the board on screen follows the
// ported rules, the bot plays the ported search, and the screens and storage behave.
// Real keyboard and swipe input is in input.spec.mjs.
import { test, expect } from "@playwright/test";
import { open, state, expectTilesMatchBoard, CORNER, DEAD } from "./helpers.mjs";
import { move, newGame, isDead, DIRECTIONS } from "../game.mjs";
import { chooseAction } from "../minimax.mjs";

test("the page opens straight on the game, and on your saved game after a reload", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("#board")).toBeVisible();
  expect((await state(page)).bot).toBe(false);
  await page.evaluate((b) => window.game2048.load(b, 0.5), CORNER);
  await page.evaluate(() => window.game2048.move("RIGHT"));
  const before = await state(page);
  await page.reload();
  await page.waitForFunction(() => !!window.game2048);
  const after = await state(page);
  expect(after.board).toEqual(before.board);
  expect(after.moves).toBe(before.moves);
  expect(after.bot).toBe(false);
  expect(errors).toEqual([]);
});

test("a fresh game opens the way the Python would from its seed", async ({ page }) => {
  await open(page);
  await page.click("#newGame");
  const s = await state(page);
  expect(s.board).toEqual(newGame(s.seed).board);
  expect(s.board.filter((v) => v).length).toBe(2);
  expect(s.points).toBe(0);
  await expectTilesMatchBoard(page);
});

test("moves follow the ported rules, spawns included, and the tiles on screen match", async ({ page }) => {
  const errors = await open(page);
  let g = { board: [2, 2, 2, 0, 4, 0, 4, 0, 8, 8, 0, 0, 0, 0, 0, 2], seed: 0.625 };
  await page.evaluate(([b, s]) => window.game2048.load(b, s), [g.board, g.seed]);
  for (const d of ["RIGHT", "DOWN", "LEFT", "LEFT", "UP", "RIGHT", "DOWN", "UP", "LEFT", "DOWN"]) {
    await page.evaluate((d) => window.game2048.move(d), d);
    g = move(g, d);
    const s = await state(page);
    expect(s.board).toEqual(g.board);
    expect(s.seed).toBe(g.seed);
    await expectTilesMatchBoard(page);
  }
  expect(errors).toEqual([]);
});

test("a move that changes nothing isn't counted", async ({ page }) => {
  await open(page);
  await page.evaluate((b) => window.game2048.load(b, 0.5), CORNER);
  await page.evaluate(() => { window.game2048.move("LEFT"); window.game2048.move("UP"); });
  const s = await state(page);
  expect(s.moves).toBe(0);
  expect(s.board).toEqual(CORNER);
});

test("score adds merged tiles; best is kept across a reload", async ({ page }) => {
  await open(page, { init: () => { if (!sessionStorage.getItem("cleared")) { localStorage.clear(); sessionStorage.setItem("cleared", "1"); } } });
  await page.evaluate(() => window.game2048.load([8, 8, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5));
  await page.evaluate(() => window.game2048.move("LEFT"));
  expect((await state(page)).points).toBe(24);
  await expect(page.locator("#score")).toHaveText("24");
  await expect(page.locator("#best")).toHaveText("24");
  await page.reload();
  await page.waitForFunction(() => !!window.game2048);
  await expect(page.locator("#best")).toHaveText("24");
  // and the game itself was saved: the page reopens on it
  expect((await state(page)).points).toBe(24);
});

test("works with storage blocked", async ({ page }) => {
  const errors = await open(page, {
    init: () => {
      Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
    },
  });
  await page.evaluate(() => window.game2048.load([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5));
  await page.evaluate(() => window.game2048.move("LEFT"));
  expect((await state(page)).points).toBe(4);
  expect(errors).toEqual([]);
});

test("the bot plays the ported search's best move, from the current board", async ({ page }) => {
  const errors = await open(page);
  const start = newGame(0.4242);
  await page.evaluate(([b, s]) => window.game2048.load(b, s), [start.board, start.seed]);
  await page.evaluate(() => window.game2048.setSpeedPos(100));
  await page.click("#botBtn");
  const seen = [];
  for (let k = 0; k < 6; k++) {
    await page.waitForFunction((n) => window.game2048.state.botMoves > n, k);
    seen.push(await page.evaluate(() => window.game2048.bot.lastThink));
  }
  await page.click("#botBtn"); // take over
  await expect(page.locator("#botLabel")).toHaveText("Let the bot play");
  for (const r of seen) {
    expect(r.depth).toBe(5);
    const mine = chooseAction({ board: r.board, seed: r.seed }, 5);
    expect(r.values).toEqual(mine.values);
    expect(r.values[r.move]).toBe(Math.max(...Object.values(mine.values)));
  }
  // it stopped: no more moves after taking over
  const n = (await state(page)).moves;
  await page.waitForTimeout(400);
  expect((await state(page)).moves).toBe(n);
  await expectTilesMatchBoard(page);
  expect(errors).toEqual([]);
});

test("the bot takes over from a board you've been playing", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.game2048.load([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0], 0.9); window.game2048.move("DOWN"); window.game2048.move("LEFT"); });
  const before = await state(page);
  await page.evaluate(() => window.game2048.setSpeedPos(100));
  await page.click("#botBtn");
  await page.waitForFunction(() => window.game2048.state.botMoves >= 3);
  const first = await page.evaluate(() => window.game2048.bot.lastThink);
  // its searches start from where you were, never from a fresh board
  const s = await state(page);
  expect(s.moves).toBeGreaterThanOrEqual(before.moves + 3);
  expect(first.board.filter((v) => v).length).toBeGreaterThanOrEqual(3);
  await page.click("#botBtn");
});

test("speed slider sets the bot's moves per second", async ({ page }) => {
  await open(page);
  await page.click("#botBtn");
  await expect(page.locator("#speedRow")).not.toHaveClass(/is-off/);
  await page.evaluate(() => window.game2048.setSpeedPos(0));
  await expect(page.locator("#speedOut")).toHaveText("1.0/s");
  await page.evaluate(() => window.game2048.setSpeedPos(100));
  await expect(page.locator("#speedOut")).toHaveText("max");
  // at max the bot doesn't wait between moves, and still searches at full depth
  await page.waitForFunction(() => window.game2048.state.botMoves >= 10);
  expect(await page.evaluate(() => window.game2048.bot.depth)).toBe(5);
  await page.click("#botBtn");
  await expect(page.locator("#speedRow")).toHaveClass(/is-off/);
});

test("game over shows the card; New game clears it", async ({ page }) => {
  const errors = await open(page);
  expect(isDead(DEAD)).toBe(true);
  await page.evaluate((b) => window.game2048.load(b, 0.5, { moves: 40, botMoves: 10 }), DEAD);
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#overWho")).toHaveText("The bot played 10 of 40 moves. Games the bot plays in don't count toward your best.");
  await expect(page.locator("#overMoves")).toHaveText("40");
  // the bot can't start on a finished game
  await page.evaluate(() => window.game2048.setBot(true));
  expect((await state(page)).bot).toBe(false);
  await page.click("#overNew");
  await expect(page.locator("#over")).toBeHidden();
  const s = await state(page);
  expect(s.over).toBe(false);
  expect(s.board.filter((v) => v).length).toBe(2);
  expect(errors).toEqual([]);
});

test("the bot runs a game to the end and the card says so", async ({ page }) => {
  // one empty cell and no equal tiles anywhere: either legal move (right or down) fills the
  // board with nothing to merge, whatever spawns, so the game ends on the bot's first move
  await open(page);
  await page.evaluate(() => {
    window.game2048.load([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 0], 0.5);
    window.game2048.setSpeedPos(100);
  });
  await page.click("#botBtn");
  await expect(page.locator("#over")).toBeVisible({ timeout: 10000 });
  const s = await state(page);
  expect(s.over).toBe(true);
  expect(s.bot).toBe(false);
  await expect(page.locator("#overWho")).toHaveText("The bot played every move. Games the bot plays in don't count toward your best.");
});

test("about modal: opens with the snake drawn, closes with Esc", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.game2048.load([2, 0, 0, 0, 4, 8, 2, 0, 16, 32, 8, 4, 256, 128, 64, 16], 0.77));
  await page.click("#about");
  const modal = page.locator(".cohesion-about");
  await expect(modal).toBeVisible();
  const box = await modal.locator('[data-dia="snake"]').boundingBox();
  expect(box.width).toBeGreaterThan(150);
  expect(box.height).toBeGreaterThan(150);
  await expect(modal).not.toContainText("Mike");
  // arrows don't move tiles behind the modal
  await page.keyboard.press("ArrowRight");
  expect((await state(page)).moves).toBe(0);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
  test("everything fits at 375×812, in play, with the bot on, and at game over", async ({ page }) => {
    const errors = await open(page);
    const fits = async (label) => {
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
        const out = [];
        for (const el of document.querySelectorAll(".g-btn, .g-ctl > span, .g-score, .g-board, .g-speed, .g-think, .g-card, .g-hint")) {
          const b = el.getBoundingClientRect();
          if (!b.width || el.closest("[hidden]")) continue;
          if (b.left < -0.5 || b.right > W + 0.5 || b.top < -0.5 || b.bottom > H + 0.5) out.push(`${el.className} ${b.left},${b.top},${b.right},${b.bottom}`);
        }
        // the top bar's pieces don't run into each other
        const top = [".g-logo", "#botBadge", "#soundBtn", ".g-score"].map((q) => document.querySelector(q))
          .filter((el) => el && !el.closest("[hidden]")).map((el) => [el.id || el.className, el.getBoundingClientRect()]);
        for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
          const [na, a] = top[i], [nb, b] = top[j];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${na} overlaps ${nb}`);
        }
        return { out, scroll: document.documentElement.scrollWidth - W };
      });
      expect(r.out, label).toEqual([]);
      expect(r.scroll, label).toBeLessThanOrEqual(0);
    };
    // the bot button's label stays on one line (it wrapped once the robot icon was added)
    const oneLine = async () => page.evaluate(() => { const l = document.getElementById("botLabel"); return l.getClientRects().length === 1 && l.offsetHeight < 30; });
    await fits("play");
    expect(await oneLine()).toBe(true);
    const board = await page.locator("#board").boundingBox();
    expect(board.width).toBeGreaterThan(300);
    await page.click("#botBtn");
    await page.waitForFunction(() => window.game2048.state.botMoves >= 2);
    await fits("bot");
    expect(await oneLine()).toBe(true);
    await page.click("#botBtn");
    await page.evaluate((b) => window.game2048.load(b, 0.5), DEAD);
    await expect(page.locator("#over")).toBeVisible();
    await fits("over");
    expect(errors).toEqual([]);
  });
});

test("a game the bot has played in doesn't set the best score", async ({ page }) => {
  const errors = await open(page, { init: () => { try { localStorage.setItem("quasarbright:2048-best", "10"); } catch {} } });
  // your own merge beats the best
  await page.evaluate(() => window.game2048.load([8, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5));
  await page.evaluate(() => window.game2048.move("LEFT"));
  await expect(page.locator("#best")).toHaveText("16");
  // the bot makes a move in a fresh game; after that, nobody's merges raise the best
  await page.evaluate(() => window.game2048.load([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5));
  await page.evaluate(() => { window.game2048.setSpeedPos(100); window.game2048.setBot(true); });
  await page.waitForFunction(() => window.game2048.state.botMoves >= 3);
  await page.evaluate(() => window.game2048.setBot(false));
  await page.evaluate(() => window.game2048.load([64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5, { botMoves: 3, moves: 3 }));
  await page.evaluate(() => window.game2048.move("LEFT"));
  expect((await state(page)).points).toBe(128);
  await expect(page.locator("#best")).toHaveText("16");
  expect(await page.evaluate(() => localStorage.getItem("quasarbright:2048-best"))).toBe("16");
  expect(errors).toEqual([]);
});
