// Real input: keys, WASD, swipes (mouse drags fire the same pointer events a finger does),
// and real clicks on the bot button.
import { test, expect } from "@playwright/test";
import { open, state, expectTilesMatchBoard, CORNER } from "./helpers.mjs";

async function load(page, board, seed = 0.5) {
  await page.evaluate(([b, s]) => window.game2048.load(b, s), [board, seed]);
}

test("arrow keys and WASD slide the tiles", async ({ page }) => {
  const errors = await open(page, { menu: "play" });
  for (const [key, dir] of [["ArrowRight", 3], ["d", 3], ["ArrowDown", 12], ["s", 12]]) {
    await load(page, CORNER);
    await page.keyboard.press(key);
    const s = await state(page);
    expect(s.moves, key).toBe(1);
    expect(s.board[dir] === 2 || s.board[dir] === 4, key).toBe(true);
    expect(s.board[0] === 0 || s.board.filter((v) => v).length === 2, key).toBe(true);
  }
  await load(page, [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  await page.keyboard.press("a");
  expect((await state(page)).board[0]).toBe(2);
  await load(page, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
  await page.keyboard.press("w");
  expect((await state(page)).board[0]).toBe(2);
  await expectTilesMatchBoard(page);
  expect(errors).toEqual([]);
});

test("swipes on the board slide the tiles; a short drag doesn't", async ({ page }) => {
  await open(page, { menu: "play" });
  const b = await page.locator("#board").boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const drag = async (dx, dy) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx / 2, cy + dy / 2);
    await page.mouse.move(cx + dx, cy + dy);
    await page.mouse.up();
  };
  await load(page, CORNER);
  await drag(10, 4);
  expect((await state(page)).moves).toBe(0);
  await drag(120, 10);
  let s = await state(page);
  expect(s.moves).toBe(1);
  expect(s.board[3]).toBe(2);
  await drag(-8, 140);
  s = await state(page);
  expect(s.moves).toBe(2);
  expect(s.board[15]).toBe(2);
  await expectTilesMatchBoard(page);
});

test("the bot button toggles with a click, and a key press takes over from the bot", async ({ page }) => {
  const errors = await open(page, { menu: "play" });
  await page.evaluate(() => window.game2048.setSpeedPos(100));
  await page.locator("#botBtn").click();
  await expect(page.locator("#botLabel")).toHaveText("Take over");
  await expect(page.locator("#snake")).toHaveClass(/is-on/);
  await expect(page.locator("#think")).toBeVisible();
  await page.waitForFunction(() => window.game2048.state.botMoves >= 2);
  // a human move stops the bot and is made as well
  const before = await state(page);
  const dirs = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
  for (const k of dirs) {
    await page.keyboard.press(k);
    if ((await state(page)).moves - (await state(page)).botMoves > before.moves - before.botMoves) break;
  }
  const after = await state(page);
  expect(after.bot).toBe(false);
  expect(after.moves - after.botMoves).toBe(before.moves - before.botMoves + 1);
  await expect(page.locator("#botLabel")).toHaveText("Let the bot play");
  await expect(page.locator("#snake")).not.toHaveClass(/is-on/);
  // and it stays stopped
  const n = after.moves;
  await page.waitForTimeout(300);
  expect((await state(page)).moves).toBe(n);
  expect(errors).toEqual([]);
});

test("B toggles the bot, N starts a new game", async ({ page }) => {
  await open(page, { menu: "play" });
  await load(page, [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  await page.keyboard.press("b");
  expect((await state(page)).bot).toBe(true);
  await page.keyboard.press("b");
  expect((await state(page)).bot).toBe(false);
  await page.keyboard.press("n");
  const s = await state(page);
  expect(s.moves).toBe(0);
  expect(s.board.filter((v) => v).length).toBe(2);
});

test("the start screen ignores arrows; Play with a real click starts input", async ({ page }) => {
  await open(page, { menu: "none" });
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect((await state(page)).moves).toBe(0);
  await page.locator("#playBtn").click();
  await load(page, CORNER);
  await page.keyboard.press("ArrowRight");
  expect((await state(page)).moves).toBe(1);
});
