// Browser tests: real pages talking over BroadcastChannel (?net=local), short night steps (?fast).
// Run with `npm run e2e` from onuw/. Needs Playwright with Chromium installed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");   // sketches/, for ../shared
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/onuw/index.html`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

// ---- helpers

async function newTable(names, { watchers = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    return p;
  };
  const host = await open();
  await host.goto(`${base}?net=local&fast`);
  await host.fill("#name-input", names[0]);
  await host.click("button[type=submit]");
  await host.waitForFunction(() => window.__onuw.view?.code);
  const code = await host.evaluate(() => window.__onuw.view.code);
  const pages = [host];
  const join = async (name, as = "player") => {
    const p = await open();
    await p.goto(`${base}?room=${code}&net=local&fast`);
    await p.fill("#name-input", name);
    await p.click(`button[data-as=${as}]`);
    await p.waitForFunction(() => window.__onuw.view?.phase);
    return p;
  };
  for (const n of names.slice(1)) pages.push(await join(n));
  const specs = [];
  for (const n of watchers) specs.push(await join(n, "spectator"));
  return { ctx, host, pages, specs, code, errors, join };
}

const view = (p) => p.evaluate(() => window.__onuw.view);

async function slideToLook(p) {
  const box = await p.locator("[data-peek]").boundingBox();
  const x = box.x + box.width / 2;
  await p.mouse.move(x, box.y + box.height - 30);
  await p.mouse.down();
  for (let k = 1; k <= 20; k++) await p.mouse.move(x, box.y + box.height - 30 - k * 20);
  await p.mouse.up();
  await p.waitForFunction(() => !document.querySelector("[data-act=ready]")?.disabled);
}

async function dealAndReady(pages) {
  for (const p of pages) { await slideToLook(p); await p.click("[data-act=ready]"); }
  await pages[0].waitForFunction(() => window.__onuw.view.phase === "night");
}

// Plays the night: every actor confirms its first legal choice, or skips.
async function playNight(host, pages) {
  for (let t = 0; t < 300; t++) {
    if ((await view(host)).phase !== "night") return;
    for (const p of pages) {
      const pr = await p.evaluate(() => { const g = window.__onuw.view?.game; return g?.prompt && !g.prompt.done ? g.prompt : null; });
      if (!pr) continue;
      if (pr.kind === "center1") await p.click('[data-center="0"]');
      if (pr.kind === "player" || pr.kind === "spare") await p.locator("[data-target]").first().click();
      if (pr.kind === "two") { await p.locator("[data-target]").nth(0).click(); await p.locator("[data-target]").nth(1).click(); }
      if (pr.kind === "seer") { await p.click('[data-center="0"]'); await p.click('[data-center="1"]'); }
      await p.click("[data-act=confirm]").catch(() => {});
    }
    await host.waitForTimeout(100);
  }
  throw new Error("night never ended");
}

async function toResults(host, pages) {
  for (const p of pages) await p.click("[data-act=dayready]");
  await host.waitForFunction(() => window.__onuw.view.phase === "vote");
  const ids = (await view(host)).game.seats;
  for (let i = 0; i < pages.length; i++) {
    const me = (await view(pages[i])).you;
    await pages[i].click(`[data-vote="${ids.find((id) => id !== me)}"]`);
  }
  await host.waitForFunction(() => window.__onuw.view.phase === "results");
}

// ---- tests

test("a full game from lobby to results, with no console errors", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  await playNight(t.host, t.pages);
  assert.equal((await view(t.host)).phase, "day");
  await toResults(t.host, t.pages);
  assert.match(await t.host.locator("main").innerText(), /\bwins?\b/i);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("the card is hidden until you slide the cover up, and a tap only nudges it", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"]);
  await t.host.click("[data-act=start]");
  const p = t.pages[1];
  await p.locator("[data-peek]").click();
  await p.waitForTimeout(400);
  assert.equal(await p.locator("[data-act=ready]").isDisabled(), true);
  await slideToLook(p);
  assert.equal(await p.locator("[data-act=ready]").isDisabled(), false);
  // the cover springs back over the card after you let go
  await p.waitForTimeout(400);
  const tr = await p.locator(".ms-peek-cover").evaluate((e) => getComputedStyle(e).transform);
  assert.ok(tr === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(tr), tr);
  await t.ctx.close();
});

test("a spectator who joins in the lobby watches: not dealt in, sees every card and the night log", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"], { watchers: ["Wes"] });
  const w = t.specs[0];
  assert.match(await t.host.locator("main").innerText(), /Watching/);
  await t.host.click("[data-act=start]");
  await w.waitForSelector(".ms-spec-banner");
  assert.match(await w.locator(".ms-spec-banner").innerText(), /spectator/i);
  const wv = await view(w);
  assert.equal(wv.game.seats.length, 3);
  assert.ok(!wv.game.seats.includes(wv.you));
  assert.equal(await w.locator(".ms-spec-seat").count(), 3);
  await dealAndReady(t.pages);
  await playNight(t.host, t.pages);
  const omni = (await view(w)).game.omni;
  assert.ok(omni.log.length > 0);
  assert.equal(await w.locator(".ms-log li").count(), omni.log.length);
  // players never get the spectator's view
  for (const p of t.pages) {
    const v = await view(p);
    assert.equal(v.game.omni, undefined);
    assert.equal(await p.locator(".ms-spec-banner").count(), 0);
  }
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("someone who joins mid-game watches, then is dealt in next round", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"]);
  await t.host.click("[data-act=start]");
  const late = await t.join("Lou");
  await late.waitForSelector(".ms-spec-banner");
  assert.equal((await view(late)).spectator, true);
  await t.host.click("[data-act=host]");
  await t.host.click('.ms-host-item[data-what="h-reset"]');
  await t.host.click('.ms-host-item.is-confirming [data-act="h-reset"]');
  await late.waitForFunction(() => window.__onuw.view.phase === "lobby");
  assert.equal((await view(late)).spectator, false);
  await t.ctx.close();
});

test("players can switch to watching in the lobby, and rename only there", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  const c = t.pages[3];
  await c.click("[data-act=spec-on]");
  await t.host.waitForFunction(() => window.__onuw.view.players.find((p) => p.name === "Cleo")?.spectator);
  await c.click("[data-act=spec-off]");
  await t.host.waitForFunction(() => !window.__onuw.view.players.find((p) => p.name === "Cleo")?.spectator);
  await c.click("[data-act=edit-name]");
  await c.fill("#rename-input", "Cleo B");
  await c.click(".ms-rename-inline button[type=submit]");
  await t.host.waitForFunction(() => window.__onuw.view.players.some((p) => p.name === "Cleo B"));
  await t.host.click("[data-act=start]");
  assert.equal(await c.locator("[data-act=edit-name]").count(), 0);
  await c.click("[data-act=players]");
  assert.equal(await c.locator("#rename-input").count(), 0);
  await t.ctx.close();
});

test("when the host leaves mid-game, another player becomes host and the game goes on", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  await playNight(t.host, t.pages);
  await t.host.click("[data-act=host]");
  await t.host.click('.ms-host-item[data-what="leave"]');
  await t.host.click('.ms-host-item.is-confirming [data-act="leave"]');
  const rest = t.pages.slice(1);
  await rest[0].waitForFunction(() => window.__onuw.view?.hostId && window.__onuw.view.phase === "day", null, { timeout: 15000 });
  await rest[0].waitForTimeout(2500);
  const modes = await Promise.all(rest.map((p) => p.evaluate(() => window.__onuw.mode)));
  assert.equal(modes.filter((m) => m === "host").length, 1, modes.join(","));
  const nh = rest[modes.indexOf("host")];
  assert.equal((await view(nh)).phase, "day");
  assert.equal(await nh.locator("[data-act=host]").count(), 1);
  await t.ctx.close();
});

test("the host can end the vote when a player has dropped", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  await playNight(t.host, t.pages);
  await t.host.click("[data-act=host]");
  await t.host.click('.ms-host-item[data-what="h-skipday"]');
  await t.host.waitForFunction(() => window.__onuw.view.phase === "vote");
  const ids = (await view(t.host)).game.seats;
  for (const p of t.pages.slice(0, 3)) {
    const me = (await view(p)).you;
    await p.click(`[data-vote="${ids.find((id) => id !== me)}"]`);
  }
  await t.pages[3].close();
  await t.host.click("[data-act=host]");
  await t.host.click('.ms-host-item[data-what="h-endvote"]');
  await t.host.waitForFunction(() => window.__onuw.view.phase === "results");
  await t.ctx.close();
});

test("card names fit their band, clear of the team letter and the card edge, at phone and desktop sizes", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    await p.goto(`${base}?net=local&fast`);
    await p.fill("#name-input", "Mike");
    await p.click("button[type=submit]");
    await p.waitForSelector(".ms-grid .ms-card-name");
    const bad = await p.evaluate((w) => [...document.querySelectorAll(".ms-card")].flatMap((c) => {
      const name = c.querySelector(".ms-card-name"), mark = c.querySelector(".ms-team-mark");
      if (!name || !mark || getComputedStyle(mark).display === "none") return [];
      const r = document.createRange(); r.selectNodeContents(name);
      const t = r.getBoundingClientRect(), m = mark.getBoundingClientRect(), k = c.getBoundingClientRect();
      const glyph = document.createRange(); glyph.selectNodeContents(mark); const g = glyph.getBoundingClientRect();
      const out = [];
      if (name.scrollWidth > name.clientWidth + 1) out.push("overflows");
      if (t.right > g.left - 4) out.push(`text ${Math.round(g.left - t.right)}px from letter`);
      if (k.right - g.right < 3) out.push(`letter ${Math.round(k.right - g.right)}px from edge`);
      return out.length ? [`${name.textContent.trim()} @${w}: ${out.join(", ")}`] : [];
    }), viewport.width);
    assert.deepEqual(bad, []);
    await ctx.close();
  }
});
