// Build art/<id>.svg from figures/<id>.mjs. usage: node build.mjs [ids...]
import fs from "node:fs";
const dir = new URL("..", import.meta.url).pathname;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(new URL("figures", import.meta.url)).map((f) => f.replace(".mjs", ""));
for (const id of ids) {
  const { default: svg } = await import(`./figures/${id}.mjs?${Date.now()}`);
  fs.writeFileSync(dir + id + ".svg", svg);
}
console.log("built", ids.join(" "));
