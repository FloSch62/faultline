import type { Page } from "@playwright/test";
// Every test also fails on any page or console error (see helpers.ts).
import { expect, test } from "./helpers.ts";
import { RULES } from "../src/core/cards.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import type { CardId } from "../src/core/types.ts";
const key = "faultline-expedition-v2";
async function startBattle(
  page: Page,
  seed = 12345,
  archetype: "architect" | "ghost" = "architect",
  options: {
    hand?: CardId[];
    drawPile?: CardId[];
    enemyHp?: number;
    enemyId?: string;
  } = {},
) {
  const e = newExpedition(archetype, seed);
  chooseRoom(e.run, "0-1");
  if (options.hand) {
    e.run.hand = options.hand;
    for (const card of options.hand)
      if (!e.run.deck.includes(card)) e.run.deck.push(card);
  }
  if (options.drawPile) e.run.drawPile = options.drawPile;
  if (options.enemyHp) e.run.enemy!.hp = e.run.enemy!.maxHp = options.enemyHp;
  if (options.enemyId) e.run.enemy!.id = options.enemyId;
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key, value: JSON.stringify(e) },
  );
  await page.goto("./");
  await page.getByRole("button", { name: /Continue expedition/ }).click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "battle",
  );
}
async function playCard(page: Page, id: string) {
  await page.locator(`[data-hand][data-card-id="${id}"]`).first().click();
}
async function wire(page: Page, from: string, to: string) {
  await playCard(page, "fiber");
  await page.locator(`[data-node="${from}"]`).click();
  await page.locator(`[data-node="${to}"]`).click();
}
test("a new expedition has working loadouts, map, settings, and isolated saves", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByRole("button", { name: /New expedition/ }).click();
  await page.locator('[data-archetype="warden"]').click();
  await page.getByRole("button", { name: "Enter the Faultline" }).click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "map");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.run.integrity).toBe(15);
  expect(saved.run.relics).toEqual(["backpressure"]);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("slider", { name: "Music volume" }).fill("24");
  await expect(page.locator('[data-setting="music"]')).toHaveValue("24");
  await page.getByRole("button", { name: "Save & return to title" }).click();
  await expect(
    page.getByRole("button", { name: /Continue expedition/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Continue expedition/ }).click();
  await expect(page.locator(".integrity-stat")).toContainText("15");
  expect(
    await page.evaluate(() => localStorage.getItem("faultline-run-v1")),
  ).toBeNull();
  expect(errors).toEqual([]);
});
test("build, undo, connect, transmit, recover a fault, and take a reward", async ({
  page,
}) => {
  test.setTimeout(100_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startBattle(page, 12345, "architect", {
    enemyHp: 10,
    enemyId: "wraith",
    hand: ["router", "fiber", "fiber", "guard", "guard", "inspect"],
    drawPile: ["patch", "fiber", "guard", "router", "fiber", "router"],
  });
  await playCard(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await expect(page.locator(".energy-orb strong")).toHaveText("3");
  await page.keyboard.press("z");
  await expect(page.locator(".energy-orb strong")).toHaveText("5");
  await playCard(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await wire(page, "alpha", "router1");
  await wire(page, "router1", "omega");
  await expect(page.locator(".signal-readout")).toHaveClass(/online/);
  await expect(page.locator(".transmit-power strong")).toHaveText("5");
  await page.getByRole("button", { name: /^Transmit/ }).click();
  await expect(page.locator(".round-banner")).toContainText("02", {
    timeout: 15000,
  });
  await expect(page.locator(".enemy-health-label strong")).toContainText("5");
  // The Wraith cuts the route. Repairing the announced fault restores the actual damage.
  await expect(page.locator(".transmit-power strong")).toHaveText("0");
  await expect(page.locator(".signal-readout")).not.toHaveClass(/online/);
  await playCard(page, "patch");
  await expect(page.locator(".transmit-power strong")).toHaveText("5");
  await expect(page.locator(".signal-readout")).toHaveClass(/online/);
  await page.getByRole("button", { name: /^Transmit/ }).click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, {
    timeout: 15000,
  });
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "reward",
  );
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run.deck.length,
    key,
  );
  await page.locator("[data-reward]").first().click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "map");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.run.floor).toBe(1);
  expect(saved.run.deck).toHaveLength(before + 1);
  expect(errors).toEqual([]);
});
test("dialogs trap gameplay shortcuts; browser reload restores a real in-progress battle", async ({
  page,
}) => {
  await startBattle(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.keyboard.press("1");
  await page.keyboard.press("z");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toEqual(
    before,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await playCard(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  // Remove the fixture init script by using a new page in the same persisted browser context.
  const restored = await page.context().newPage();
  await restored.goto("./");
  await restored.getByRole("button", { name: /Continue expedition/ }).click();
  await expect(restored.locator(".energy-orb strong")).toHaveText("3");
  expect(
    await restored.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).run.topology.nodes.length,
      key,
    ),
  ).toBe(3);
  await restored.close();
});
test("Containerlab and Clabernetes deploy, replicate, undo, and transmit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startBattle(page, 8, "architect", {
    hand: ["router", "fiber", "fiber", "containerlab", "clabernetes", "guard"],
    enemyHp: 11,
  });
  await playCard(page, "containerlab");
  await expect(page.locator(".energy-orb strong")).toHaveText("2");
  await expect(page.locator(".transmit-power strong")).toHaveText("7");
  await playCard(page, "clabernetes");
  await expect(page.locator('[data-node="alpha"]')).toHaveCount(0);
  await page.locator('[data-node="router1"]').click();
  await expect(page.locator(".energy-orb strong")).toHaveText("0");
  // Overclocked replica: a second channel adds bandwidth.
  await expect(page.locator(".transmit-power strong")).toHaveText(String(7 + RULES.bandwidthPerChannel));
  await page.keyboard.press("z");
  await expect(page.locator(".energy-orb strong")).toHaveText("2");
  const undone = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(undone.run.topology.nodes).toHaveLength(3);
  expect(
    undone.run.topology.nodes.find((n: { id: string }) => n.id === "router1")
      .shielded,
  ).not.toBe(true);
  await playCard(page, "clabernetes");
  await page.locator('[data-node="router1"]').click();
  await page.locator("body").press("Space");
  await expect(page.locator(".round-banner")).toContainText("02", {
    timeout: 15000,
  });
  await expect(page.locator(".enemy-health-label strong")).toHaveText(`${11 - 7 - RULES.bandwidthPerChannel} / 11`);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(
    saved.run.topology.nodes.filter(
      (n: { role: string; shielded?: boolean }) =>
        n.role === "router" && n.shielded,
    ),
  ).toHaveLength(2);
  expect(errors).toEqual([]);
});
test("painted desktop controls stay clear of the hand at laptop and full HD sizes", async ({
  page,
}) => {
  await startBattle(page, 8);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const plaque = await page.locator(".battle-left").boundingBox();
    const note = await page.locator(".tutorial-callout").boundingBox();
    const transmit = page.getByRole("button", { name: /^Transmit/ });
    await expect(transmit).toBeInViewport();
    const a = await transmit.boundingBox();
    const b = await page.locator("#hand-zone").boundingBox();
    if (note) {
      expect(note.x).toBeGreaterThan(plaque!.x + plaque!.width);
      expect(note.y + note.height).toBeLessThan(b!.y - 12);
    }
    expect(a!.x).toBeGreaterThan(b!.x + b!.width);
    for (const side of [".battle-left", ".battle-right"]) {
      await expect(page.locator(side)).toBeInViewport();
      const box = await page.locator(side).boundingBox();
      expect(box!.y + box!.height).toBeLessThan(viewport.height - 240);
    }
  }
});
test("all soundtrack files play and bundled typography loads locally", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto("./");
  await page.getByRole("button", { name: /New expedition/ }).click();
  const results = await page.evaluate(async () => {
    const result = [];
    for (const name of [
      "the-last-relay",
      "signal-and-steel",
      "the-blackout-core",
    ]) {
      const a = new Audio(
        new URL(`audio/${name}-instrumental.ogg`, document.baseURI).href,
      );
      await a.play();
      await new Promise((resolve) => setTimeout(resolve, 250));
      result.push({
        duration: a.duration,
        time: a.currentTime,
        error: a.error,
      });
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    return { audio: result, fonts: document.fonts.check("500 20px Cinzel") };
  });
  for (const r of results.audio) {
    expect(r.duration).toBeGreaterThan(60);
    expect(r.time).toBeGreaterThan(0);
    expect(r.error).toBeNull();
  }
  expect(results.fonts).toBe(true);
  expect(failures).toEqual([]);
});

test("an expanded Ghost hand leaves the transmission control clickable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startBattle(page, 2, "ghost", {
    hand: [
      "router",
      "fiber",
      "fiber",
      "containerlab",
      "surge",
      "fiber",
      "guard",
    ],
  });
  await playCard(page, "surge");
  await expect(page.locator("[data-hand]")).toHaveCount(8);
  await page.mouse.move(500, 60);
  await expect(page.locator(".energy-orb strong")).toHaveText("7");
  const dial = page.getByRole("button", { name: /^Transmit/ });
  const a = await dial.boundingBox();
  const b = await page.locator("#hand-zone").boundingBox();
  expect(a!.x).toBeGreaterThan(b!.x + b!.width);
  await dial.click();
  await expect(page.locator(".round-banner")).toContainText("02", {
    timeout: 15000,
  });
});
