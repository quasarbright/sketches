// The page through its test hook (steps one at a time) and real clicks: the rules, the bot,
// the end card, the HUD and storage. Real keyboard and swipe input is in input.spec.mjs.
import { test, expect } from "@playwright/test";
import { open, state, tick, load, at, pos, LINE } from "./helpers.mjs";
import { newGame, step } from "../game.mjs";
import { decide } from "../bot.mjs";

test("the page opens on a waiting snake, and steering starts it at its own pace", async ({ page }) => {
  const errors = await open(page, { manual: false });
  await expect(page.locator("#veil")).toBeVisible();
  await expect(page.locator("#veilSub")).toHaveText("Steer to start");
  await page.waitForTimeout(400);
  expect((await state(page)).steps).toBe(0);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#veil")).toBeHidden();
  await page.waitForTimeout(1000);
  const s = await state(page);
  expect(s.started).toBe(true);
  expect(s.steps).toBeGreaterThanOrEqual(5); // 9 a second
  expect(s.steps).toBeLessThanOrEqual(14);
  expect(errors).toEqual([]);
});

test("eating grows the snake and the scoreboard follows", async ({ page }) => {
  const errors = await open(page);
  await load(page, pos([at(10, 10), at(9, 10), at(8, 10)], at(11, 10)));
  await tick(page);
  const s = await state(page);
  expect(s.game.snake.length).toBe(4);
  expect(s.game.eaten).toBe(1);
  await expect(page.locator("#length")).toHaveText("4");
  await expect(page.locator("#fill")).toHaveText("1.0%");
  await expect(page.locator("#best")).toHaveText("4");
  expect(errors).toEqual([]);
});

test("hitting the wall ends the game with the end card", async ({ page }) => {
  const errors = await open(page);
  await load(page, pos([at(19, 5), at(18, 5), at(17, 5)], at(0, 0)));
  await tick(page);
  expect((await state(page)).over).toBe(true);
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#overTitle")).toHaveText("Game over");
  await expect(page.locator("#overWho")).toHaveText("Hit the wall. ");
  await expect(page.locator("#overLength")).toHaveText("3");
  await page.locator("#overNew").click();
  await expect(page.locator("#over")).toBeHidden();
  const s = await state(page);
  expect(s.over).toBe(false);
  expect(s.game.snake.length).toBe(3);
  expect(errors).toEqual([]);
});

test("running into itself says so", async ({ page }) => {
  await open(page);
  // heading up into a loop of its own body
  await load(page, pos([at(5, 5), at(5, 6), at(6, 6), at(6, 5), at(6, 4), at(5, 4), at(4, 4)], at(0, 0), "UP"));
  await tick(page);
  await expect(page.locator("#overWho")).toHaveText("Ran into itself. ");
});

test("the bot plays exactly the moves bot.mjs picks", async ({ page }) => {
  const errors = await open(page);
  let g = newGame(1234);
  await load(page, g);
  await page.evaluate(() => window.snakeGame.setBot(true));
  for (let i = 0; i < 120; i++) g = step(g, decide(g).dir);
  await tick(page, 120);
  const s = await state(page);
  expect(s.game).toEqual(g);
  expect(s.botSteps).toBe(120);
  await expect(page.locator("#think")).toBeVisible();
  await expect(page.locator("#thinkText")).not.toHaveText("");
  expect(errors).toEqual([]);
});

test("the strip names the rule the bot used", async ({ page }) => {
  await open(page);
  // the egg at the end of a corridor between the body and the top wall: the bot turns it down
  const snake = [at(15, 0)];
  for (let x = 15; x >= 0; x--) snake.push(at(x, 1));
  for (let y = 2; y < 20; y++) snake.push(at(0, y));
  await load(page, pos(snake, at(0, 0), "UP"));
  await page.evaluate(() => window.snakeGame.setBot(true));
  await page.evaluate(() => window.snakeGame.setManual(true));
  await tick(page);
  expect((await page.evaluate(() => window.snakeGame.plan.kind))).toBe("tail");
  await expect(page.locator("#thinkText")).toHaveText("Following its tail");
  await expect(page.locator("#thinkSub")).toHaveText("· that egg would trap it");
});

test("the bot at max speed fills the board, then the card counts its steps", async ({ page }) => {
  test.slow();
  const errors = await open(page, { manual: false });
  await load(page, newGame(5));
  await page.evaluate(() => { window.snakeGame.setSpeedPos(100); window.snakeGame.setBot(true); });
  await expect(page.locator("#over")).toBeVisible({ timeout: 60000 });
  const s = await state(page);
  expect(s.game.snake.length).toBe(400);
  await expect(page.locator("#overTitle")).toHaveText("Board filled!");
  expect(s.bot).toBe(false);
  await expect(page.locator("#overWho")).toContainText("The bot played every step.");
  await expect(page.locator("#best")).toHaveText("0"); // bot games don't set your best
  expect(errors).toEqual([]);
});

test("a game is saved and comes back paused-at-the-start after a reload", async ({ page }) => {
  await open(page);
  await load(page, LINE);
  await page.evaluate(() => window.snakeGame.steer("DOWN"));
  await tick(page, 3);
  const before = await state(page);
  await page.reload();
  await page.waitForFunction(() => !!window.snakeGame);
  const after = await state(page);
  expect(after.game).toEqual(before.game);
  expect(after.steps).toBe(3);
  expect(after.started).toBe(false);
  await expect(page.locator("#veilSub")).toHaveText("Steer to carry on");
});

test("the about modal's diagrams run", async ({ page }) => {
  const errors = await open(page);
  await page.locator("#about").click();
  const caps = page.locator(".cohesion-about [data-cap]");
  await expect(caps).toHaveCount(3);
  const seen = new Set();
  for (let i = 0; i < 40 && seen.size < 3; i++) {
    seen.add(await page.locator('.cohesion-about [data-cap="greedy"]').textContent());
    await page.waitForTimeout(200);
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  const box = await page.locator('.cohesion-about [data-dia="check"]').boundingBox();
  expect(box.width).toBeGreaterThan(200);
  expect(box.height / box.width).toBeCloseTo(8 / 12, 1);
  expect(errors).toEqual([]);
});
