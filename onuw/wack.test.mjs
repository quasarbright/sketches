import { test } from "node:test";
import assert from "node:assert/strict";
import { nextKind } from "./wack.mjs";

test("whack-a-wolf: villagers pop up about a quarter of the time, never after more than three wolves", () => {
  let run = 0, villagers = 0, worst = 0;
  for (let i = 0; i < 4000; i++) {
    const k = nextKind(run);
    run = k === "wolf" ? run + 1 : 0;
    worst = Math.max(worst, run);
    if (k === "villager") villagers++;
  }
  assert.ok(worst <= 3, `saw ${worst} wolves in a row`);
  assert.ok(villagers / 4000 > 0.25 && villagers / 4000 < 0.4, `villager share ${villagers / 4000}`);
  assert.equal(nextKind(0, 0.1), "villager");
  assert.equal(nextKind(0, 0.9), "wolf");
  assert.equal(nextKind(3, 0.9), "villager");
});
