// Render art/*.svg to PNG previews framed like a card (name band + text strip), plus a sheet.
// usage: node render.mjs outdir [ids...]
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const [out, ...ids] = process.argv.slice(2);
const dir = new URL("..", import.meta.url).pathname;
const all = ids.length ? ids : fs.readdirSync(dir).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: +(process.env.DPR || 1) });
const { ROLES, TEAMS } = await import("../../roles.mjs");
const team = (id) => ROLES[id] ? TEAMS[ROLES[id].team].color : "#8b93ff";
const nm = (id) => ROLES[id]?.name || id, sh = (id) => ROLES[id]?.short || "";
const cardHtml = (id, w) => `<div style="width:${w}px;aspect-ratio:5/7;position:relative;border-radius:${w/16}px;overflow:hidden;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;text-align:center">
  <img src="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(dir + id + ".svg")).toString("base64")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
  <div style="position:relative;background:${team(id)};padding:${w/25}px;font-weight:700;font-size:${w/14}px;color:#0b1020">${nm(id)}</div><div style="flex:1"></div>
  <div style="position:relative;background:rgba(4,6,14,.62);height:${w*0.2}px;color:#eee;font-size:${w/17}px;display:grid;place-items:center">${sh(id)}</div></div>`;
for (const id of all) {
  await p.setContent(`<body style="margin:0;background:#111;padding:20px;display:flex;gap:20px;align-items:flex-start">${cardHtml(id, 400)}<img src="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(dir + id + ".svg")).toString("base64")}" style="width:400px">${cardHtml(id, 108)}</body>`);
  await p.screenshot({ path: `${out}/${id}.png`, fullPage: true });
}
await p.setContent(`<body style="margin:0;background:#111;padding:16px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px;width:${6*194}px">${all.map((id) => cardHtml(id, 180)).join("")}</body>`);
await p.screenshot({ path: `${out}/sheet.png`, fullPage: true });
await b.close();
