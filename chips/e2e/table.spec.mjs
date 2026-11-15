import { test, expect } from "@playwright/test";

// one "device" at the table: its own storage namespace, page errors collected
async function device(context, ns, hash = "") {
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
  await page.goto(`index.html?net=local&ns=${ns}${hash}`);
  return page;
}
async function host(context, name = "Host") {
  const page = await device(context, "host");
  await page.fill("#createForm [name=name]", name);
  await page.click("#createForm button[type=submit]");
  await expect(page.locator("#table")).toBeVisible();
  return { page, code: await page.evaluate(() => location.hash.slice(1)) };
}
async function join(context, code, ns, name) {
  const page = await device(context, ns, "#" + code);
  await expect(page.locator("#join")).toBeVisible();
  await page.fill("#joinForm [name=name]", name);
  await page.click("#joinForm button[type=submit]");
  await expect(page.locator("#table")).toBeVisible();
  return page;
}
const chipsOf = (page, name) => page.locator(".prow", { hasText: name }).locator(".n");
const potAmt = (page, i = 0) => page.locator(".pot .amt").nth(i);

test("bet into the only pot, host splits it, everyone sees it", async ({ context }) => {
  const { page: h, code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  const bob = await join(context, code, "bob", "Bob");

  // the single pot is already chosen
  await ann.fill("#amt", "150");
  await expect(ann.locator("#sendBtn")).toContainText("Bet 150");
  await ann.click("#sendBtn");
  await bob.click("#quick [data-all]");
  await expect(bob.locator("#sendBtn")).toContainText("All in");
  await bob.click("#sendBtn");

  for (const p of [h, ann, bob]) await expect(potAmt(p)).toHaveText("1,150");
  await expect(chipsOf(h, "Bob")).toHaveText("0");

  await h.click(".pot");
  await h.click(".winner >> text=Ann");
  await h.click(".winner >> text=Bob");
  await expect(h.locator("[data-preview]")).toHaveText("575 each.");
  await h.click("[data-award]");
  for (const p of [h, ann, bob]) {
    await expect(potAmt(p)).toHaveText("0");
    await expect(chipsOf(p, "Ann")).toHaveText("1,425");
    await expect(chipsOf(p, "Bob")).toHaveText("575");
  }
  for (const p of [h, ann, bob]) expect(p.errors).toEqual([]);
});

test("with several pots players must pick one; they can also give to a player", async ({ context }) => {
  const { page: h, code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  await h.click("#addPotBtn");
  await h.click(".sheet [data-add]");
  await expect(ann.locator(".pot")).toHaveCount(2);

  await ann.fill("#amt", "40");
  await expect(ann.locator("#sendBtn")).toBeDisabled();
  await expect(ann.locator("#sendBtn")).toContainText("pick a pot");
  await ann.click(".dest >> text=Side pot");
  await ann.click("#sendBtn");
  await expect(potAmt(h, 1)).toHaveText("40");
  // the choice doesn't stick between bets
  await expect(ann.locator("#sendBtn")).toContainText("pick a pot");

  await ann.fill("#amt", "60");
  await ann.click(".dest >> text=Host");
  await expect(ann.locator("#sendBtn")).toContainText("Give 60");
  await ann.click("#sendBtn");
  await expect(chipsOf(h, "Host")).toHaveText("1,060");
  await expect(chipsOf(ann, "Ann")).toHaveText("900");
});

test("players can't move other people's chips; the host can, and can rewind and restore", async ({ context }) => {
  const { page: h, code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  // a player can't open someone else's stack
  await ann.click(".prow >> text=Host");
  await expect(ann.locator(".sheet")).toHaveCount(0);
  // forged requests are refused by the host
  const potId = await h.locator(".pot").getAttribute("data-pot");
  const hostId = await h.locator(".prow.me").getAttribute("data-player");
  expect(await ann.evaluate((id) => window.chipsTest.act({ type: "transfer", from: { k: "p", id }, to: { k: "p", id: "x" }, amount: 5 }), hostId)).toMatch(/aren't your|gone/);
  expect(await ann.evaluate(([id, me]) => window.chipsTest.act({ type: "transfer", from: { k: "pot", id }, to: { k: "p", id: me }, amount: 1 }), [potId, await ann.locator(".prow.me").getAttribute("data-player")])).toMatch(/aren't your/);
  expect(await ann.evaluate(() => window.chipsTest.act({ type: "setChips", target: { k: "p", id: "x" }, amount: 1e6 }))).toMatch(/host/);

  await h.click(".prow >> text=Ann");
  await h.fill(".sheet [data-amt=move]", "300");
  await h.click(".sheet .dest >> text=Pot");
  await h.click(".sheet [data-move]");
  await expect(potAmt(ann)).toHaveText("300");
  await expect(chipsOf(ann, "Ann")).toHaveText("700");

  // rewind to before the move: nothing new in the activity, the move is crossed out
  const rows = await h.locator("#log li").count();
  await expect(h.locator("#log li").first().locator("[data-goto]")).toHaveCount(0); // the latest is where we are
  await h.locator("#log li", { hasText: "Ann joined" }).locator("[data-goto]").click();
  await expect(potAmt(ann)).toHaveText("0");
  await expect(chipsOf(ann, "Ann")).toHaveText("1,000");
  await expect(h.locator("#log li")).toHaveCount(rows);
  await expect(ann.locator("#log li.rewound")).toHaveCount(1);
  await expect(ann.locator("#log [data-goto]")).toHaveCount(0); // players only watch
  await expect(h.locator("#log li.rewound [data-goto]")).toHaveText("restore to here");
  // and forward again
  await h.locator("#log li.rewound [data-goto]").click();
  await expect(potAmt(ann)).toHaveText("300");
  await expect(ann.locator("#log li.rewound")).toHaveCount(0);
});

test("the host can remove the only pot, and a reload keeps everyone seated", async ({ context }) => {
  const { page: h, code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  await h.click(".pot");
  await h.click("summary >> text=Remove this pot");
  await h.click(".sheet [data-remove]");
  await expect(ann.locator("#potsSec")).toBeHidden();
  await expect(ann.locator("#sendBtn")).toContainText("pick where");

  await ann.reload();
  await expect(ann.locator("#table")).toBeVisible();
  await expect(ann.locator(".prow.me")).toContainText("Ann");
  await h.reload();
  await expect(h.locator("#table")).toBeVisible();
  await expect(h.locator(".prow", { hasText: "Ann" })).not.toHaveClass(/off/, { timeout: 15000 });
});

test("joining shows only free colors", async ({ context }) => {
  const { code } = await host(context);
  await join(context, code, "ann", "Ann");
  const bob = await device(context, "bob", "#" + code);
  await expect(bob.locator("#join .color:disabled")).toHaveCount(2);
});

test("several tabs of one browser sit down as different people", async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("chips:settings", JSON.stringify({ tabsArePlayers: true })));
  const open = async (hash = "") => {
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) => r.abort());
    await page.goto("index.html?net=local" + hash);
    return page;
  };
  const h = await open();
  await h.fill("#createForm [name=name]", "Host");
  await h.click("#createForm button[type=submit]");
  await expect(h.locator("#table")).toBeVisible();
  const code = await h.evaluate(() => location.hash.slice(1));
  const seat = async (name) => {
    const p = await open("#" + code);
    await expect(p.locator("#join")).toBeVisible();
    await p.fill("#joinForm [name=name]", name);
    await p.click("#joinForm button[type=submit]");
    await expect(p.locator(".prow.me")).toContainText(name);
    return p;
  };
  const ann = await seat("Ann");
  await seat("Bob");
  await expect(h.locator(".prow")).toHaveCount(3);
  // a reload keeps each tab its own seat, and the host tab still hosts
  await ann.reload();
  await expect(ann.locator(".prow.me")).toContainText("Ann");
  await h.reload();
  await expect(h.locator(".prow.me")).toContainText("Host");
  await expect(h.locator(".prow.me")).toContainText("host");
});

test("by default every tab is the same person", async ({ context }) => {
  const { code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  const again = await device(context, "ann", "#" + code);
  await expect(again.locator(".prow.me")).toContainText("Ann");
  await expect(ann.locator(".prow")).toHaveCount(2);
});

test("the host refunds a pot to whoever put chips in", async ({ context }) => {
  const { page: h, code } = await host(context);
  const ann = await join(context, code, "ann", "Ann");
  const bob = await join(context, code, "bob", "Bob");
  await ann.fill("#amt", "120"); await ann.click("#sendBtn");
  await bob.fill("#amt", "30"); await bob.click("#sendBtn");
  await expect(potAmt(h)).toHaveText("150");
  await h.click(".pot");
  await expect(h.locator("[data-refund]")).toContainText("Ann 120 · Bob 30");
  await h.click("[data-refund]");
  for (const p of [h, ann, bob]) {
    await expect(potAmt(p)).toHaveText("0");
    await expect(chipsOf(p, "Ann")).toHaveText("1,000");
    await expect(chipsOf(p, "Bob")).toHaveText("1,000");
  }
});

test("the home page joins a table by its code", async ({ context }) => {
  const { code } = await host(context);
  const p = await device(context, "zed");
  await p.fill("#codeForm [name=code]", code.toLowerCase());
  await expect(p.locator("#join")).toBeVisible();
  await expect(p.locator("#join [data-title]")).toContainText("Host");
});
