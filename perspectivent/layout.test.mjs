// Browser layout check: on a 1400×860 laptop window the whole Lens panel fits without scrolling,
// for every preset (the sphere's sliders and the two-lens "ortho x, persp y" too), with the rays'
// start at its biggest. Iris caught this regressing four times.
// Needs Playwright (skipped without it). Run: node --test perspectivent/layout.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* not installed */ }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { html: "text/html", mjs: "text/javascript", js: "text/javascript", css: "text/css", png: "image/png", svg: "image/svg+xml" };

test("the Lens panel fits a 1400×860 window in every state", { skip: !chromium && "playwright not installed", timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
    await page.route("http://pv.test/**", (r) => {
      const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.fulfill({ status: 404 });
      r.fulfill({ status: 200, contentType: TYPES[f.split(".").pop()] || "application/octet-stream", body: readFileSync(f) });
    });
    await page.goto("http://pv.test/perspectivent/index.html");
    await page.waitForSelector("#chips .pv-chip");
    const ids = await page.$$eval("#chips .pv-chip", (bs) => bs.map((b) => b.dataset.id));
    const bad = [];
    const check = async (what) => {
      const r = await page.evaluate(() => {
        const panel = document.querySelector("control-panel");
        const box = panel.getBoundingClientRect();
        return { bottom: box.bottom, vh: innerHeight, scroll: panel.scrollHeight - panel.clientHeight };
      });
      if (r.bottom > r.vh || r.scroll > 1) bad.push(`${what}: overflows by ${Math.max(r.scroll, r.bottom - r.vh)}px`);
    };
    const setS = (v) => page.evaluate((v) => { const s = document.getElementById("s"); s.value = v; s.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    // every chip ("ortho x, persp y" is the two-lens state), and the rays' start at its biggest
    for (const id of ids) {
      await page.click(`#chips .pv-chip[data-id="${id}"]`);
      await page.waitForTimeout(150);
      await check(id);
      if (!(await page.$eval("#sRow", (r) => r.hidden || r.classList.contains("pv-na")))) {
        await setS(3); await page.waitForTimeout(150);
        await check(`${id}, rays start from the biggest plane`);
      }
    }
    // a typed function too long for one line still fits
    await page.click('#chips .pv-chip[data-id="mixed"]');
    await page.fill("#fy", "z + log(1 + z) * sin(z) / 2 + sqrt(z)");
    await page.waitForTimeout(150);
    await check("two lenses with a long typed function");
    assert.deepEqual(bad, [], "the panel needs scrolling:\n" + bad.join("\n"));
  } finally {
    await browser.close();
  }
});

// Pam, 2026-11-26: on short windows the open panel ran under the button bar. Wherever the two
// overlap, the panel stops above the bar and scrolls instead.
test("the open Lens panel stays above the button bar on short windows", { skip: !chromium && "playwright not installed", timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const bad = [];
    for (const [width, height] of [[960, 600], [800, 450]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route("http://pv.test/**", (r) => {
        const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
        if (!existsSync(f)) return r.fulfill({ status: 404 });
        r.fulfill({ status: 200, contentType: TYPES[f.split(".").pop()] || "application/octet-stream", body: readFileSync(f) });
      });
      await page.goto("http://pv.test/perspectivent/index.html");
      await page.waitForSelector("#chips .pv-chip");
      for (const id of ["perspective", "sphere", "fisheye"]) {
        await page.click(`#chips .pv-chip[data-id="${id}"]`);
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => {
          const p = document.querySelector("control-panel").getBoundingClientRect();
          const b = document.querySelector(".pv-bar").getBoundingClientRect();
          return { bottom: p.bottom, barTop: b.top, overlapX: b.right > p.left && b.left < p.right };
        });
        if (r.overlapX && r.bottom > r.barTop) bad.push(`${width}×${height} ${id}: runs ${Math.round(r.bottom - r.barTop)}px under the bar`);
      }
      await page.close();
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  } finally {
    await browser.close();
  }
});
