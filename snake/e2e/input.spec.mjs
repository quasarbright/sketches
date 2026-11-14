// Real input: arrow keys, WASD, the turn queue, swipes (mouse drags fire the same pointer events
// a finger does), pause, and taking over from the bot.
import { test, expect } from "@playwright/test";
import { open, state, tick, load, at, LINE } from "./helpers.mjs";

test("arrow keys and WASD turn the snake; straight back is ignored", async ({ page }) => {
  const errors = await open(page);
  for (const [key, head] of [["ArrowUp", at(10, 9)], ["w", at(10, 9)], ["ArrowDown", at(10, 11)], ["s", at(10, 11)], ["ArrowLeft", at(11, 10)], ["ArrowRight", at(11, 10)]]) {
    await load(page, LINE);
    await page.keyboard.press(key);
    await tick(page);
    expect((await state(page)).game.snake[0], key).toBe(head);
  }
  expect(errors).toEqual([]);
});

test("two quick turns make a U-turn, one per step", async ({ page }) => {
  await open(page);
  await load(page, LINE); // heading right from (10,10)
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  expect((await state(page)).queue).toEqual(["UP", "LEFT"]);
  await tick(page, 2);
  const s = await state(page);
  expect(s.game.snake.slice(0, 3)).toEqual([at(9, 9), at(10, 9), at(10, 10)]);
  expect(s.game.alive).toBe(true);
});

test("a turn pressed just after a step applies to that step", async ({ page }) => {
  const errors = await open(page, { manual: false });
  await load(page, LINE); // heading right from (10,10)
  const r = await page.evaluate(async () => {
    const sg = window.snakeGame;
    sg.steer("RIGHT"); // start
    const n = sg.state.steps;
    while (sg.state.steps === n) await new Promise((r) => setTimeout(r, 1));
    const after = sg.state; // just stepped right, to (11,10)
    sg.steer("UP");
    return { stepsBefore: after.steps, head: sg.state.game.snake[0], steps: sg.state.steps, queue: sg.state.queue };
  });
  expect(r.steps).toBe(r.stepsBefore);   // no extra step
  expect(r.head).toBe(10 + 9 * 20);       // redone: (10,9), up from where it was
  expect(r.queue).toEqual([]);
  expect(errors).toEqual([]);
});

test("swipes steer; a short drag doesn't", async ({ page }) => {
  await open(page);
  const b = await page.locator("#board").boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const drag = async (dx, dy) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx / 2, cy + dy / 2);
    await page.mouse.move(cx + dx, cy + dy);
    await page.mouse.up();
  };
  await load(page, LINE);
  await drag(10, 6);
  expect((await state(page)).queue).toEqual([]);
  await drag(8, -90);
  expect((await state(page)).queue).toEqual(["UP"]);
  await tick(page);
  await drag(-90, 4);
  expect((await state(page)).queue).toEqual(["LEFT"]);
});

test("space and the pause button pause and resume", async ({ page }) => {
  const errors = await open(page, { manual: false });
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await expect(page.locator("#veilTitle")).toBeVisible();
  const a = (await state(page)).steps;
  await page.waitForTimeout(500);
  expect((await state(page)).steps).toBe(a);
  await page.locator("#pauseBtn").click();
  await expect(page.locator("#veil")).toBeHidden();
  await page.waitForTimeout(400);
  expect((await state(page)).steps).toBeGreaterThan(a);
  expect(errors).toEqual([]);
});

test("the bot button toggles with a click, and steering takes over", async ({ page }) => {
  const errors = await open(page, { manual: false });
  await page.locator("#botBtn").click();
  await expect(page.locator("#botLabel")).toHaveText("Take over");
  await expect(page.locator("#speedRow")).not.toHaveClass(/is-off/);
  await page.waitForTimeout(500);
  expect((await state(page)).botSteps).toBeGreaterThan(0);
  await page.locator("#botBtn").click();
  await expect(page.locator("#botLabel")).toHaveText("Let the bot play");
  await page.locator("#botBtn").click();
  await page.keyboard.press("ArrowDown");
  const s = await state(page);
  expect(s.bot).toBe(false);
  await expect(page.locator("#hint")).toBeVisible();
  expect(errors).toEqual([]);
});

test("nothing on the page overflows the viewport", async ({ page }) => {
  await open(page);
  await page.locator("#botBtn").click(); // the speed row is the widest the controls get
  const over = await page.evaluate(() => {
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    return [...document.querySelectorAll(".s-stage *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && (r.left < -1 || r.right > W + 1 || r.bottom > H + 1);
    }).map((el) => el.id || el.className);
  });
  expect(over).toEqual([]);
});
