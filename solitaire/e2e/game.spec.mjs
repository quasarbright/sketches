// The page through real input (clicks, taps, drags) and the test hook: the rules on screen, the
// bot, the end of a deal, storage and the about modal.
import { test, expect } from "@playwright/test";
import { open, state, info, c, position } from "./helpers.mjs";
import { deal } from "../game.mjs";

const conserved = (s) => [...s.stock, ...s.waste, ...s.found.flat(), ...s.tab.flatMap((t) => [...t.down, ...t.up])].sort((a, b) => a - b);
const ALL = [...Array(52).keys()];

test("a fresh deal: seven columns, 24 in the stock, the cards on screen where the deal says", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.solitaire.deal(5));
  const s = await state(page);
  expect(s).toEqual({ ...deal(5), moves: 0 });
  await page.waitForTimeout(1200); // let the deal fly out
  const box = (k) => page.evaluate((k) => { const b = window.solitaire.cardBox(k); return { x: b.x, y: b.y }; }, k);
  // each column's face-up card is further down than the one before it in the same column
  for (let i = 1; i < 7; i++) {
    const col = s.tab[i];
    const a = await box(col.down[col.down.length - 1]), b = await box(col.up[0]);
    expect(b.y).toBeGreaterThan(a.y);
    expect(Math.abs(b.x - a.x)).toBeLessThan(2);
  }
  expect(errors).toEqual([]);
});

test("clicking the stock draws; tapping a card sends it where it fits; undo takes it back", async ({ page }) => {
  const errors = await open(page);
  const p = position({ tab: [{ down: [], up: [c("K", "S")] }, { down: [c("2", "C")], up: [c("A", "H")] }, ...Array.from({ length: 5 }, () => ({ down: [], up: [] }))] });
  p.stock = p.stock.filter((k) => k !== c("Q", "H")).concat([c("Q", "H")]); // Q♥ on top of the stock
  await page.evaluate((p) => window.solitaire.load(p), p);
  await page.waitForTimeout(300);
  const stockBox = await page.evaluate(() => { const b = document.getElementById("table").getBoundingClientRect(), s = window.solitaire.pileXY("stock"), z = window.solitaire.size; return { x: b.x + s.x + z.cw / 2, y: b.y + s.y + z.ch / 2 }; });
  await page.mouse.click(stockBox.x, stockBox.y);
  let s = await state(page);
  expect(s.waste).toEqual([c("Q", "H")]);
  // tap the Q♥ on the waste: it goes on the K♠
  // click a card once it has stopped moving (cards spring into place)
  const tapCard = async (k) => {
    const b = await page.evaluate(async (k) => {
      let last = null;
      for (let i = 0; i < 100; i++) {
        const r = window.solitaire.cardBox(k);
        if (last && Math.abs(r.x - last.x) < 0.5 && Math.abs(r.y - last.y) < 0.5) return { x: r.x + r.width / 2, y: r.y + 12 };
        last = r;
        await new Promise((res) => setTimeout(res, 50));
      }
      return { x: last.x + last.width / 2, y: last.y + 12 };
    }, k);
    await page.mouse.click(b.x, b.y);
  };
  await tapCard(c("Q", "H"));
  s = await state(page);
  expect(s.tab[0].up).toEqual([c("K", "S"), c("Q", "H")]);
  // tap the A♥: home, and the 2♣ under it turns over
  await tapCard(c("A", "H"));
  s = await state(page);
  expect(s.found[1]).toEqual([c("A", "H")]);
  expect(s.tab[1]).toEqual({ down: [], up: [c("2", "C")] });
  await page.click("#undo");
  s = await state(page);
  expect(s.found[1]).toEqual([]);
  expect(s.tab[1]).toEqual({ down: [c("2", "C")], up: [c("A", "H")] });
  expect(conserved(s)).toEqual(ALL);
  expect(errors).toEqual([]);
});

test("dragging a run onto a column moves the run; a bad drop puts it back", async ({ page }) => {
  await open(page);
  const tab = Array.from({ length: 7 }, () => ({ down: [], up: [] }));
  tab[0] = { down: [c("5", "D")], up: [c("9", "C"), c("8", "H")] };
  tab[3] = { down: [], up: [c("10", "D")] };
  tab[5] = { down: [], up: [c("10", "S")] };
  await page.evaluate((p) => window.solitaire.load(p), position({ tab }));
  await page.waitForTimeout(400);
  const center = (k) => page.evaluate((k) => { const r = window.solitaire.cardBox(k); return { x: r.x + r.width / 2, y: r.y + 10 }; }, k);
  const drag = async (k, to) => {
    const a = await center(k), b = await center(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y + 40) * i / 8);
    await page.mouse.up();
  };
  await drag(c("9", "C"), c("10", "S")); // same color: not allowed
  let s = await state(page);
  expect(s.tab[0].up).toEqual([c("9", "C"), c("8", "H")]);
  await page.waitForTimeout(400);
  await drag(c("9", "C"), c("10", "D"));
  s = await state(page);
  expect(s.tab[3].up).toEqual([c("10", "D"), c("9", "C"), c("8", "H")]);
  expect(s.tab[0]).toEqual({ down: [], up: [c("5", "D")] });
});

test("the bot only makes legal moves, and every card stays accounted for", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { window.solitaire.deal(3); window.solitaire.setBot(true); });
  let s = await state(page);
  for (let i = 0; i < 60; i++) {
    const before = s;
    await page.evaluate(() => window.solitaire.step());
    s = await state(page);
    if (s.moves === before.moves) break;
    expect(conserved(s)).toEqual(ALL);
  }
  expect((await info(page)).botMoves).toBeGreaterThan(20);
  await expect(page.locator("#think")).toBeVisible();
  await expect(page.locator("#thinkText")).not.toHaveText("");
  expect(errors).toEqual([]);
});

test("at max speed the bot plays deal after deal and keeps its own record", async ({ page }) => {
  test.slow();
  const errors = await open(page, { manual: false });
  await page.evaluate(() => { window.solitaire.setSpeedPos(100); window.solitaire.setBot(true); });
  await page.waitForFunction(() => window.solitaire.info.botRecord.played >= 4, null, { timeout: 30000 });
  const i = await info(page);
  expect(i.record).toEqual({ won: 0, played: 0 }); // the bot's deals aren't yours
  await expect(page.locator("#winsLabel")).toHaveText("Bot won");
  expect(errors).toEqual([]);
});

test("finishing a deal yourself shows the end card and counts toward your record", async ({ page }) => {
  await open(page);
  // everything home except the K♣
  const found = [0, 1, 2, 3].map((s) => [...Array(s === 3 ? 12 : 13).keys()].map((r) => s * 13 + r));
  const tab = Array.from({ length: 7 }, () => ({ down: [], up: [] }));
  tab[2] = { down: [], up: [c("K", "C")] };
  await page.evaluate((p) => window.solitaire.load(p), { ...position({ tab, found }), stock: [] });
  await page.evaluate((k) => window.solitaire.tap(k), c("K", "C"));
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#overTitle")).toHaveText("You won!");
  expect((await info(page)).record).toEqual({ won: 1, played: 1 });
  await page.click("#overNew");
  await expect(page.locator("#over")).toBeHidden();
  expect(conserved(await state(page))).toEqual(ALL);
});

test("running out of moves shows the end card, and Undo from it plays on", async ({ page }) => {
  await open(page);
  // black twos to eights on top, aces buried, one useless card left in the stock
  const tops = [c("2", "S"), c("2", "C"), c("4", "S"), c("4", "C"), c("6", "S"), c("6", "C"), c("8", "S")];
  const rest = [...Array(52).keys()].filter((k) => !tops.includes(k) && k !== c("10", "C"));
  const tab = tops.map((t, i) => ({ down: rest.slice(i * 6, i * 6 + 6 + (i === 6 ? 2 : 0)), up: [t] }));
  await page.evaluate((p) => window.solitaire.load(p), { seed: 1, moves: 0, stock: [c("10", "C")], waste: [], found: [[], [], [], []], tab });
  await page.evaluate(() => window.solitaire.draw());
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#overTitle")).toHaveText("No moves left");
  await expect(page.locator("#overUndo")).toBeVisible();
  await page.click("#overUndo");
  await expect(page.locator("#over")).toBeHidden();
  const s = await state(page);
  expect(s.stock).toEqual([c("10", "C")]);
  expect((await info(page)).over).toBe(false);
});

test("the bot finishing a deal at normal speed shows the end card too", async ({ page }) => {
  await open(page);
  const found = [0, 1, 2, 3].map((s) => [...Array(s === 3 ? 12 : 13).keys()].map((r) => s * 13 + r));
  const tab = Array.from({ length: 7 }, () => ({ down: [], up: [] }));
  tab[4] = { down: [], up: [c("K", "C")] };
  await page.evaluate((p) => window.solitaire.load(p), { ...position({ tab, found }), stock: [] });
  await page.evaluate(() => { window.solitaire.setBot(true); window.solitaire.step(); });
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#overTitle")).toHaveText("The bot won!");
  await expect(page.locator("#overUndo")).toBeHidden();
  expect((await info(page)).bot).toBe(false);
  expect((await info(page)).botRecord).toEqual({ won: 1, played: 1 });
});

test("a deal in progress comes back after a reload", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.solitaire.deal(9); window.solitaire.draw(); window.solitaire.draw(); });
  const before = await state(page);
  await page.reload();
  await page.waitForFunction(() => !!window.solitaire);
  expect(await state(page)).toEqual(before);
});

test("the about modal ranks the moves of a real turn", async ({ page }) => {
  const errors = await open(page);
  await page.click("#about");
  const rows = page.locator(".cohesion-about .k-rank");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator(".cohesion-about .k-rank.is-best")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("nothing on the page overflows the viewport", async ({ page }) => {
  await open(page);
  await page.locator("#botBtn").click();
  const out = await page.evaluate(() => {
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    return [...document.querySelectorAll(".k-stage > *, .k-controls *, .k-top *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && (r.left < -1 || r.right > W + 1 || r.bottom > H + 1);
    }).map((el) => el.id || el.className);
  });
  expect(out).toEqual([]);
});

