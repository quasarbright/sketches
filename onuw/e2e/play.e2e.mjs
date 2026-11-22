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

// The tests open several players as tabs of one browser, so turn on "Each tab is a different player".
const tabsArePlayers = (ctx) => ctx.addInitScript(() => {
  if (!localStorage.getItem("onuw:settings")) localStorage.setItem("onuw:settings", JSON.stringify({ tabsArePlayers: true }));
});

async function newTable(names, { watchers = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await tabsArePlayers(ctx);
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    return p;
  };
  const host = await open();
  await createAs(host, names[0]);
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

// Create a room from the home page, then type your name in the lobby, the way a host does.
async function createAs(p, name) {
  await p.goto(`${base}?net=local&fast`);
  await p.click("button[type=submit]");
  await p.waitForFunction(() => window.__onuw.view?.code);
  await p.fill("[data-form=firstname] #name-input", name);
  await p.click("[data-form=firstname] button[type=submit]");
  await p.waitForFunction((n) => window.__onuw.view.players[0]?.name === n, name);
}

const view = (p) => p.evaluate(() => window.__onuw.view);

async function flipToLook(p) {
  await p.click("[data-flip=deal] .ms-turner");
  await p.waitForFunction(() => !document.querySelector("[data-act=ready]")?.disabled);
}

async function dealAndReady(pages) {
  for (const p of pages) { await flipToLook(p); await p.click("[data-act=ready]"); }
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

test("your card is face down until you tap it, and stays face up until you tap it again", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"]);
  await t.host.click("[data-act=start]");
  const p = t.pages[1];
  const faceUp = () => p.locator("[data-flip=deal] .ms-turner .is-front").isVisible();
  const notes = () => p.locator(".ms-after-peek").isVisible();
  assert.equal(await faceUp(), false);
  assert.equal(await notes(), false);
  assert.equal(await p.locator("[data-act=ready]").isDisabled(), true);
  await flipToLook(p);
  await p.waitForTimeout(300);
  assert.equal(await faceUp(), true);
  assert.equal(await notes(), true);
  // left alone, it stays face up
  await p.waitForTimeout(5000);
  assert.equal(await faceUp(), true);
  // a tap turns it back over
  await p.click("[data-flip=deal] .ms-turner");
  await p.waitForTimeout(600);
  assert.equal(await faceUp(), false);
  assert.equal(await notes(), false);   // the role's text goes face down with the card
  assert.equal(await p.locator("[data-act=ready]").isDisabled(), false);   // having looked once is enough
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
    await tabsArePlayers(ctx);
    const p = await ctx.newPage();
    await createAs(p, "Mike");
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

test("mid-game, your card and night are face down until you tap Show, and hide again", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  await playNight(t.host, t.pages);
  for (const p of t.pages) {
    const name = await p.locator("[data-flip=secret] .ms-turner .is-front .ms-card-name").textContent();
    const panel = p.locator("[data-flip=secret]");
    assert.doesNotMatch(await panel.innerText(), new RegExp(name.trim()));
    await p.click("[data-flip=secret] .is-back [data-flip-tap]");
    await p.waitForTimeout(500);
    assert.match(await panel.innerText(), new RegExp(name.trim()));
    assert.ok(await p.locator("[data-flip=secret] .ms-notes li").count() >= 1);
    await p.click("[data-flip=secret] .is-front button[data-flip-tap]");
    await p.waitForTimeout(500);
    assert.doesNotMatch(await panel.innerText(), new RegExp(name.trim()));
  }
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("right after your night turn, what you saw shows for a few seconds, then goes face down", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  let saw = 0;
  for (let k = 0; k < 300 && (await view(t.host)).phase === "night"; k++) {
    for (const p of t.pages) {
      const pr = await p.evaluate(() => { const g = window.__onuw.view?.game; return g?.prompt && !g.prompt.done ? g.prompt : null; });
      if (!pr) continue;
      if (pr.kind === "center1") await p.click('[data-center="0"]');
      if (pr.kind === "player" || pr.kind === "spare") await p.locator("[data-target]").first().click();
      if (pr.kind === "two") { await p.locator("[data-target]").nth(0).click(); await p.locator("[data-target]").nth(1).click(); }
      if (pr.kind === "seer") { await p.click('[data-center="0"]'); await p.click('[data-center="1"]'); }
      await p.click("[data-act=confirm]").catch(() => {});
      const up = () => p.evaluate(() => document.querySelector("[data-flip=secret]")?.classList.contains("is-up"));
      if (await p.waitForFunction(() => document.querySelector("[data-flip=secret]")?.classList.contains("is-up"), null, { timeout: 1500 }).then(() => true, () => false)) {
        saw++;
        // it stays face up until tapped
        await p.waitForTimeout(300);
        assert.equal(await up(), true);
        await p.click("[data-flip=secret] [data-flip-tap]").catch(() => {});
      }
    }
    await t.host.waitForTimeout(100);
  }
  assert.ok(saw > 0, "the night panel never opened after a turn");
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("whack-a-wolf: waiting players can play, cards come halfway up, bonks score, villagers cost, and it closes when your turn comes", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  // 4 cards that never wake among 7, so at least one player can play undisturbed
  await t.host.evaluate(() => window.__onuw.send({ t: "setRoles", roles: { werewolf: 2, seer: 1, villager: 3, hunter: 1 } }));
  await t.host.waitForTimeout(200);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  let w = null;
  for (const p of t.pages) if (["villager", "hunter"].includes((await view(p)).game.myCard)) { w = p; break; }
  await w.waitForSelector("[data-act=wack]");
  assert.ok(w, "a waiting player sees the whack-a-wolf button");
  await w.click("[data-act=wack]");
  await w.waitForSelector(".wk");
  await w.evaluate(() => { const W = window.__onuw.wack; W.setAuto(false); });
  await w.waitForTimeout(700);   // the card art loads, then the round starts
  const free = await w.evaluate(() => [...document.querySelectorAll(".wk-hole")].findIndex((h) => !h.classList.contains("is-up")));
  await w.evaluate((i) => window.__onuw.wack.spawn(i, "wolf", 5000), free);
  await w.waitForTimeout(400);
  // only the top half of the card comes up out of the hole
  const shown = await w.evaluate((i) => {
    const c = document.querySelector(`[data-hole="${i}"] .ms-card`).getBoundingClientRect();
    const pit = document.querySelector(`[data-hole="${i}"] .wk-pit`).getBoundingClientRect();
    return (pit.bottom - c.top) / c.height;
  }, free);
  assert.ok(shown > 0.3 && shown < 0.6, `${Math.round(shown * 100)}% of the card shows`);
  const vis = await w.evaluate((i) => {
    const c = document.querySelector(`[data-hole="${i}"] .ms-card`).getBoundingClientRect();
    const pit = document.querySelector(`[data-hole="${i}"] .wk-pit`).getBoundingClientRect();
    return { left: c.left, right: c.right, top: c.top, bottom: Math.min(c.bottom, pit.bottom) };
  }, free);
  await w.locator(`[data-hole="${free}"] .ms-card-name`).click();
  assert.equal(await w.evaluate(() => window.__onuw.wack.score()), 1);
  // the stars burst from the middle of the part of the card that shows
  const ring = await w.evaluate((i) => { const r = document.querySelector(`[data-hole="${i}"] .wk-ring`).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }, free);
  assert.ok(Math.abs(ring.x - (vis.left + vis.right) / 2) < 3, `ring x ${ring.x} vs card ${vis.left}-${vis.right}`);
  assert.ok(Math.abs(ring.y - (vis.top + vis.bottom) / 2) < 3, `ring y ${ring.y} vs card ${vis.top}-${vis.bottom}`);
  assert.ok(await w.locator(`[data-hole="${free}"].is-bonked`).count());
  assert.ok(await w.locator(".wk-star").count() > 0);
  await w.waitForTimeout(900);
  await w.evaluate((i) => window.__onuw.wack.spawn(i, "villager", 5000), free);
  await w.waitForTimeout(400);
  // the figures are the game's own cards
  assert.match(await w.locator(`[data-hole="${free}"] .ms-card-name`).innerText(), /\S/);
  await w.locator(`[data-hole="${free}"] .ms-card-name`).click();
  assert.equal(await w.evaluate(() => window.__onuw.wack.score()), -1);
  assert.match(await w.locator(".wk-pop.is-bad").innerText(), /2/);
  await w.click("[data-wk=close]");
  assert.equal(await w.locator(".wk").count(), 0);
  // everyone who's waiting plays; whenever someone's turn comes, their game has closed
  for (let k = 0; k < 300 && (await view(t.host)).phase === "night"; k++) {
    for (const p of t.pages) {
      const pr = await p.evaluate(() => { const g = window.__onuw.view?.game; return g?.prompt && !g.prompt.done ? g.prompt : null; });
      if (!pr) { if (await p.locator("[data-act=wack]").count() && !(await p.locator(".wk").count())) await p.click("[data-act=wack]"); continue; }
      assert.equal(await p.locator(".wk").count(), 0, "the game closes when your turn comes");
      if (pr.kind === "center1") await p.click('[data-center="0"]');
      if (pr.kind === "player" || pr.kind === "spare") await p.locator("[data-target]").first().click();
      if (pr.kind === "two") { await p.locator("[data-target]").nth(0).click(); await p.locator("[data-target]").nth(1).click(); }
      if (pr.kind === "seer") { await p.click('[data-center="0"]'); await p.click('[data-center="1"]'); }
      await p.click("[data-act=confirm]").catch(() => {});
    }
    await t.host.waitForTimeout(100);
  }
  for (const p of t.pages) assert.equal(await p.locator(".wk").count(), 0, "the game closes when the night ends");
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("at night, nothing on a player's screen shows which card is awake or how far the night has gone, and the moon never moves", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.click("[data-act=start]");
  await dealAndReady(t.pages);
  const leaks = new Set(), moons = new Set();
  const labels = (await t.host.evaluate(() => window.__onuw.state.g.steps));
  for (let k = 0; k < 300 && (await view(t.host)).phase === "night"; k++) {
    for (const p of t.pages) {
      const v = await view(p);
      if (v.phase !== "night") continue;
      const acting = v.game.prompt && !v.game.prompt.done;
      // the moon never moves for a player, not even on their own turn, so a neighbor's screen gives nothing away
      moons.add(await p.locator(".ms-arc-moon").evaluate((m) => m.style.transform).catch(() => "none"));
      if (await p.locator(".ms-arc > circle").count()) leaks.add("moon arc has turn marks");
      if (acting && (v.game.steps || v.game.stepIdx != null)) leaks.add("acting player's view has the night's progress");
      if (!acting) {
        if (v.game.stepId || v.game.steps || v.game.stepIdx != null || v.game.stepEndsAt) leaks.add("view has step info");
        const text = await p.locator("main").innerText();
        if (/turn \d+ of|awake|left\b/i.test(text)) leaks.add(`screen says: ${text.match(/turn \d+ of|awake|left\b/i)[0]}`);
        if (await p.locator(".ms-arc circle.now").count()) leaks.add("moon arc shows progress");
      } else {
        const pr = v.game.prompt;
        if (pr.kind === "center1") await p.click('[data-center="0"]');
        if (pr.kind === "player" || pr.kind === "spare") await p.locator("[data-target]").first().click();
        if (pr.kind === "two") { await p.locator("[data-target]").nth(0).click(); await p.locator("[data-target]").nth(1).click(); }
        if (pr.kind === "seer") { await p.click('[data-center="0"]'); await p.click('[data-center="1"]'); }
        await p.click("[data-act=confirm]").catch(() => {});
      }
    }
    await t.host.waitForTimeout(100);
  }
  assert.ok(labels.length > 0);
  assert.deepEqual([...leaks], []);
  assert.equal(moons.size, 1, `the moon moved: ${[...moons].join(" / ")}`);
  await t.ctx.close();
});

test("new roles: the Witch looks, then swaps the card onto a player; a Prince with the most votes lives", async () => {
  const t = await newTable(["Mike", "Ana", "Ben", "Cleo"]);
  await t.host.evaluate(() => window.__onuw.send({ t: "setRoles", roles: { werewolf: 2, witch: 1, bodyguard: 1, prince: 1, cursed: 1, villager: 1 } }));
  await t.host.waitForTimeout(200);
  await t.host.click("[data-act=start]");
  // put the Witch with Ana and the Prince with Ben
  const anaId = (await view(t.pages[1])).you, benId = (await view(t.pages[2])).you;
  await t.host.evaluate(([ana, ben]) => {
    const g = window.__onuw.state.g;
    const give = (pid, role) => {
      const from = g.seats.find((x) => g.dealt[x] === role);
      if (from) { [g.dealt[from], g.dealt[pid]] = [g.dealt[pid], g.dealt[from]]; }
      else { const i = g.center.indexOf(role); [g.center[i], g.dealt[pid]] = [g.dealt[pid], g.center[i]]; }
      g.cards = { ...g.dealt };
    };
    give(ana, "witch"); give(ben, "prince");
    window.__onuw.publish();
  }, [anaId, benId]);
  const [, ana] = t.pages;
  await dealAndReady(t.pages);
  // everyone else plays their turns; Ana plays the Witch by hand
  const others = t.pages.filter((p) => p !== ana);
  for (let i = 0; i < 300; i++) {
    const pr = await ana.evaluate(() => { const g = window.__onuw.view.game; return g?.prompt && !g.prompt.done ? g.prompt : null; });
    if (pr?.step === "witch") break;
    for (const p of others) {
      const q = await p.evaluate(() => { const g = window.__onuw.view?.game; return g?.prompt && !g.prompt.done ? g.prompt : null; });
      if (q) await p.click((await p.locator("[data-act=skip]").count()) ? "[data-act=skip]" : "[data-act=confirm]");
    }
    await ana.waitForTimeout(100);
  }
  await ana.click('[data-center="1"]');
  assert.match(await ana.locator("[data-act=confirm]").innerText(), /Look at center 2/);
  await ana.click("[data-act=confirm]");
  await ana.waitForFunction(() => window.__onuw.view.game.prompt.stage === 2);
  assert.equal(await ana.locator(".ms-prompt .ms-result-cards .ms-card").count(), 1, "she sees the card she looked at");
  assert.equal(await ana.locator("[data-act=skip]").count(), 0, "she can't back out after looking");
  assert.equal(await ana.locator("[data-target]").count(), 4, "any player, herself included");
  const me = (await view(ana)).you;
  await ana.click(`[data-target="${me}"]`);
  assert.match(await ana.locator("[data-act=confirm]").innerText(), /Swap it with your card/);
  const seen = await t.host.evaluate(() => window.__onuw.state.g.center[1]);
  await ana.click("[data-act=confirm]");
  await t.host.waitForFunction((id) => window.__onuw.state.g.cards[id] !== "witch", me);
  assert.equal(await t.host.evaluate((id) => window.__onuw.state.g.cards[id], me), seen);
  await playNight(t.host, t.pages);
  // the vote: three votes on the Prince, so nobody else reaches two and nobody dies
  for (const p of t.pages) await p.click("[data-act=dayready]");
  await t.host.waitForFunction(() => window.__onuw.view.phase === "vote");
  const prince = await t.host.evaluate(() => { const g = window.__onuw.state.g; return g.seats.find((x) => g.cards[x] === "prince"); });
  const ids = (await view(t.host)).game.seats;
  for (const p of t.pages) {
    const you = (await view(p)).you;
    await p.click(`[data-vote="${you === prince ? ids.find((x) => x !== you) : prince}"]`);
  }
  await t.host.waitForFunction(() => window.__onuw.view.phase === "results");
  const lede = await t.host.locator(".ms-results .ms-lede").innerText();
  assert.match(lede, /most votes but was the Prince/);
  assert.match(lede, /Nobody else got more than one vote/);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("lobby: the host names themselves after making the room; card counts change in place; unpicked cards are dimmed; every card has an info button", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await tabsArePlayers(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}?net=local&fast`);
  assert.equal(await p.locator("#name-input").count(), 0, "no name field before the room exists");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => window.__onuw.view?.code);
  assert.equal(await p.locator("[data-form=firstname] label").innerText(), "Enter your name");
  assert.equal(await p.locator("#name-input").getAttribute("placeholder"), "Enter your name");
  await p.fill("#name-input", "Mike");
  await p.click("[data-form=firstname] button[type=submit]");
  await p.waitForFunction(() => window.__onuw.view.players[0].name === "Mike" && !document.querySelector("[data-form=firstname]"));
  // the count reads against at least 3 players, since the deck is never smaller
  assert.match(await p.locator(".ms-h2 .ms-sub").last().innerText(), /^6 of 6$/);
  // adding a second Werewolf, then removing it, moves nothing on the page
  const boxes = () => p.evaluate(() => [...document.querySelectorAll(".ms-grid .ms-cardwrap")].map((w) => { const r = w.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)].join(","); }).join(" "));
  await p.evaluate(() => window.__onuw.send({ t: "setRoles", roles: { werewolf: 1, seer: 1, thief: 1, meddler: 1, villager: 2 } }));
  await p.waitForFunction(() => window.__onuw.view.roles.werewolf === 1);
  const before = await boxes();
  await p.click('[data-step="werewolf"][data-d="1"]');
  await p.waitForFunction(() => window.__onuw.view.roles.werewolf === 2);
  assert.equal(await boxes(), before, "a count change shifted the grid");
  await p.click('[data-toggle="lackey"]');
  await p.waitForFunction(() => window.__onuw.view.roles.lackey === 1);
  assert.equal(await boxes(), before, "picking a card shifted the grid");
  // every card with copies gets the same count pill; the Masons' pair is fixed, so both buttons are disabled
  await p.click('[data-toggle="mason"]');
  await p.waitForFunction(() => window.__onuw.view.roles.mason === 2);
  const pills = await p.evaluate(() => [...document.querySelectorAll(".ms-grid .ms-card")].filter((c) => c.querySelector(".ms-count")).map((c) => ({
    role: c.dataset.toggle, n: c.querySelector(".ms-count span").textContent, buttons: c.querySelectorAll(".ms-count button").length,
    disabled: [...c.querySelectorAll(".ms-count button")].map((b) => b.disabled) })));
  assert.deepEqual(pills.find((x) => x.role === "mason"), { role: "mason", n: "×2", buttons: 2, disabled: [true, true] });
  assert.deepEqual(pills.find((x) => x.role === "werewolf"), { role: "werewolf", n: "×2", buttons: 2, disabled: [false, false] });
  assert.equal(await p.locator(".ms-grid .ms-badge").count(), 0, "no second way of showing a count");
  // unpicked cards keep their own colors, dimmed
  const off = await p.locator('[data-toggle="hunter"]').evaluate((c) => ({ f: getComputedStyle(c).filter, band: getComputedStyle(c.querySelector(".ms-card-name")).backgroundColor }));
  assert.match(off.f, /brightness/);
  assert.notEqual(off.band, "rgba(0, 0, 0, 0)");
  // the same info button on every card
  assert.equal(await p.locator('.ms-grid [data-toggle] .ms-info').count(), await p.locator(".ms-grid [data-toggle]").count());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the Doppelganger who copies the Seer looks right away, on the Doppelganger's turn", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"]);
  await t.host.evaluate(() => window.__onuw.send({ t: "setRoles", roles: { werewolf: 2, lookalike: 1, seer: 1, villager: 2 } }));
  await t.host.waitForTimeout(200);
  await t.host.click("[data-act=start]");
  const anaId = (await view(t.pages[1])).you, benId = (await view(t.pages[2])).you;
  await t.host.evaluate(([ana, ben]) => {
    const g = window.__onuw.state.g;
    const give = (pid, role) => {
      const from = g.seats.find((x) => g.dealt[x] === role);
      if (from) { [g.dealt[from], g.dealt[pid]] = [g.dealt[pid], g.dealt[from]]; }
      else { const i = g.center.indexOf(role); [g.center[i], g.dealt[pid]] = [g.dealt[pid], g.center[i]]; }
      g.cards = { ...g.dealt };
    };
    give(ana, "lookalike"); give(ben, "seer");
    window.__onuw.publish();
  }, [anaId, benId]);
  const ana = t.pages[1];
  await dealAndReady(t.pages);
  await ana.waitForFunction(() => window.__onuw.view.game?.prompt?.step === "lookalike" && !window.__onuw.view.game.prompt.done);
  await ana.click(`[data-target="${benId}"]`);
  await ana.click("[data-act=confirm]");
  await ana.waitForFunction(() => window.__onuw.view.game.prompt.as === "seer");
  assert.match(await ana.locator(".ms-prompt-text").innerText(), /You're now the Seer\. You may look at another player's card/);
  assert.equal(await ana.locator(".ms-centers").count(), 1, "the Seer's choice of center cards is offered");
  await ana.click(`[data-target="${t.hostId ?? (await view(t.host)).you}"]`);
  assert.match(await ana.locator("[data-act=confirm]").innerText(), /Look at Mike's card/);
  await ana.click("[data-act=confirm]");
  await ana.waitForFunction(() => window.__onuw.view.game.prompt.done);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("every tab is the same player until the setting is turned on", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctx.newPage();
  await a.goto(`${base}?net=local&fast`);
  const b = await ctx.newPage();
  await b.goto(`${base}?net=local&fast`);
  const id = (p) => p.evaluate(() => window.__onuw.myId);
  assert.equal(await id(a), await id(b));
  // turn it on from the home screen's Settings
  await a.click("button[data-act=settings]");
  const sw = a.locator("button[data-act=tabs-toggle]");
  assert.equal(await sw.getAttribute("aria-checked"), "false");
  await Promise.all([a.waitForEvent("load"), sw.click()]);
  await b.reload();
  await a.waitForFunction(() => window.__onuw?.myId);
  await b.waitForFunction(() => window.__onuw?.myId);
  const [ia, ib] = [await id(a), await id(b)];
  assert.notEqual(ia, ib);
  // the main tab keeps its id, and a refresh keeps each tab's own
  await b.reload();
  await b.waitForFunction(() => window.__onuw?.myId);
  assert.equal(await id(b), ib);
  await ctx.close();
});

test("with the setting off, a second tab joining your own room is told why and pointed at Settings", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctx.newPage();
  await createAs(a, "Mike");
  const code = await a.evaluate(() => window.__onuw.view.code);
  const b = await ctx.newPage();
  await b.goto(`${base}?room=${code}&net=local&fast`);
  await b.click("button[data-as=player]");
  await b.getByText("You're already in this room").waitFor();
  await b.click("main button[data-act=settings]");
  await Promise.all([b.waitForEvent("load"), b.click("button[data-act=tabs-toggle]")]);
  await b.fill("#name-input", "Ana");
  await b.click("button[data-as=player]");
  await b.waitForFunction(() => window.__onuw.view?.players?.length === 2);
  await a.waitForFunction(() => window.__onuw.view.players.length === 2);
  await ctx.close();
});

test("guests see the host's full card list with live counts, and no − or + buttons", async () => {
  const t = await newTable(["Mike", "Ana", "Ben"]);
  const guest = t.pages[1];
  const total = await t.host.locator(".ms-grid .ms-cardwrap").count();
  assert.equal(await guest.locator(".ms-grid .ms-cardwrap").count(), total, "the same list as the host");
  assert.ok(await guest.locator(".ms-grid .ms-off").count() > 0, "unpicked cards show too, dimmed");
  assert.equal(await guest.locator(".ms-grid .ms-count button").count(), 0);
  const hint = (p) => p.locator(".ms-grid").locator("xpath=preceding-sibling::p[contains(@class,'ms-hint')][1]").innerText();
  assert.match(await hint(t.host), /One card for each player.*Cards are listed in wake-up order\. Click a card to add or remove it\./);
  assert.match(await hint(guest), /One card for each player.*Cards are listed in wake-up order\.$/);
  assert.ok(await guest.locator(".ms-grid .ms-count.is-view").count() > 0);
  // a change by the host shows up for the guest
  const before = await guest.locator(".ms-grid .ms-cardwrap.is-on").count();
  await t.host.click(".ms-grid .ms-cardwrap.is-off .ms-pickable >> nth=0");
  await guest.waitForFunction((n) => document.querySelectorAll(".ms-grid .ms-cardwrap.is-on").length === n + 1, before);
  // the guest's pill is the same height as the host's
  const h = (p) => p.evaluate(() => Math.round(document.querySelector(".ms-grid .ms-count").getBoundingClientRect().height));
  assert.equal(await h(guest), await h(t.host));
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("the lobby has a Share button that opens the system share sheet with the invite link, where there is one", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await tabsArePlayers(ctx);
  await ctx.addInitScript(() => { navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; });
  const p = await ctx.newPage();
  await createAs(p, "Mike");
  await p.click("button[data-act=share]");
  const d = await p.evaluate(() => window.__shared);
  assert.match(d.url, /room=[A-Z]{4}/);
  // without the share API there's no Share button, only Copy Invite Link
  const q = await (await browser.newContext()).newPage();
  await q.addInitScript(() => { delete Navigator.prototype.share; });
  await createAs(q, "Ana");
  assert.equal(await q.locator("button[data-act=share]").count(), 0);
  assert.equal(await q.locator("button[data-act=invite]").count(), 1);
  await ctx.close(); await q.context().close();
});

test("hints say click with a mouse and tap on a touch screen", async () => {
  for (const [opts, verb] of [[{}, "Click"], [{ hasTouch: true, isMobile: true }, "Tap"]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
    await tabsArePlayers(ctx);
    const p = await ctx.newPage();
    await createAs(p, "Mike");
    const hint = await p.locator(".ms-grid").locator("xpath=preceding-sibling::p[1]").innerText();
    assert.match(hint, new RegExp(`${verb} a card to add or remove it`));
    assert.doesNotMatch(await p.locator("main").innerText(), new RegExp(verb === "Click" ? "\\bTap\\b" : "\\bClick\\b"));
    await ctx.close();
  }
});
