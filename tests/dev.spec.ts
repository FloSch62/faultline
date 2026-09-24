import type { Page } from "@playwright/test";
import { expect, test, STORAGE, SETTINGS, PREFERENCES } from "./helpers.ts";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { DEV_STORAGE } from "../src/dev/sandbox.ts";
import { MAX_ASCENSION } from "../src/core/ascension.ts";

const normal = newExpedition("ghost", 7429);
const records = '[{"seed":123,"archetype":"ghost","won":true,"score":4000,"floor":21,"at":1}]';
async function openDev(page: Page, trailingSlash = true) {
  await page.addInitScript(({ normal, records, storage, settings, preferences }) => {
    if (sessionStorage.getItem("dev-test-installed")) return;
    sessionStorage.setItem("dev-test-installed", "1");
    localStorage.setItem(storage, JSON.stringify(normal));
    localStorage.setItem("faultline-records-v2", records);
    localStorage.setItem(settings, JSON.stringify({ music: 0, effects: 0, motion: false }));
    localStorage.setItem(preferences, JSON.stringify({ tips: false, fast: true }));
  }, { normal, records, storage: STORAGE, settings: SETTINGS, preferences: PREFERENCES });
  await page.goto(trailingSlash ? "./dev/" : "./dev");
  await expect(page.locator("#dev-panel")).toBeVisible();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "battle");
}
const state = (page: Page): Promise<Expedition> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), DEV_STORAGE);
async function tab(page: Page, name: string) { await page.getByRole("tab", { name, exact: true }).click(); }
async function scenario(page: Page, id: string, channels: number) {
  await tab(page, "Scenarios");
  await page.getByLabel("Channel scenario", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "Load scenario", exact: true }).click();
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", String(channels));
}

test("/dev boots directly and every channel scenario explains the engine's live count", async ({ page }) => {
  // Ten scenarios, each loaded and checked through the real panel: long under a full parallel suite.
  test.setTimeout(120_000);
  await openDev(page, false);
  const examples: [string, number][] = [["single", 1], ["parallel", 2], ["triple", 3], ["shared-router", 1], ["shared-firewall", 1], ["crosslink", 2], ["dead-end", 1], ["no-router", 0], ["cut", 1], ["empty", 0]];
  for (const [id, count] of examples) {
    await scenario(page, id, count);
    await expect(page.locator("#dev-analysis .dev-independent")).toHaveCount(count);
    if (id === "shared-router") await expect(page.locator("#dev-analysis")).toContainText("Shares R1");
    if (id === "shared-firewall") await expect(page.locator("#dev-analysis")).toContainText("Shares F1");
    if (id === "crosslink") await expect(page.locator("#dev-panel")).toHaveAttribute("data-variants", "3");
    if (id === "no-router") await expect(page.locator("#dev-analysis")).toContainText("No router · does not count");
    if (id === "cut") await expect(page.locator("#dev-analysis")).toContainText("Cut or jammed");
  }
});

test("free build plays repeatable cards, wires a new channel, edits faults, undoes and reloads", async ({ page }) => {
  await openDev(page);
  await scenario(page, "empty", 0);
  await tab(page, "Build");
  await page.locator('[data-dev-card="router"]').click();
  await page.locator('[data-action="auto-place"]').click();
  let run = (await state(page)).run;
  const id = run.topology.nodes.find(node => node.role === "router")!.id;
  expect(run.hand).toContain("router");
  expect(run.energy).toBe(99);
  for (const [a, b] of [["alpha", id], [id, "omega"]]) {
    await page.locator('[data-dev-card="fiber"]').click();
    await page.locator(`#target-dock [data-node="${a}"]`).click();
    await page.locator(`#target-dock [data-node="${b}"]`).click();
  }
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", "1");
  run = (await state(page)).run;
  expect(run.hand.filter(card => card === "fiber")).toHaveLength(1);
  await page.getByRole("button", { name: "Jam / restore", exact: true }).click();
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", "0");
  await page.getByRole("button", { name: "Clear faults", exact: true }).click();
  await page.getByRole("button", { name: "Remove device", exact: true }).click();
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", "0");
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", "1");
  const beforeReload = (await state(page)).run;
  await page.reload();
  await expect(page.locator("#dev-panel")).toHaveAttribute("data-channels", "1");
  expect((await state(page)).run.topology).toEqual(beforeReload.topology);
});

test("any stage, keeper and ascension are selectable; skipping a final guardian leaves normal progress unchanged", async ({ page }) => {
  await openDev(page);
  const progressBefore = await page.evaluate(() => localStorage.getItem("faultline-progress-v1"));
  await tab(page, "Encounter");
  await page.getByLabel("Stage", { exact: true }).selectOption("2");
  await page.getByLabel("Sector", { exact: true }).selectOption("6");
  await page.getByLabel("Room", { exact: true }).selectOption("boss");
  await page.getByLabel("Keeper", { exact: true }).selectOption("warden");
  await page.getByLabel("Ascension", { exact: true }).selectOption(String(MAX_ASCENSION));
  await page.getByRole("button", { name: "Enter selected room", exact: true }).click();
  const e = await state(page);
  expect(e.run.stage).toBe(2);
  expect(e.run.enemies[0].id).toBe("core");
  expect(e.run.ascension).toBe(MAX_ASCENSION);
  expect(e.archetype).toBe("warden");
  await expect(page.locator(".game-root")).toHaveAttribute("data-stage", "3");
  await tab(page, "Cheats");
  await page.getByRole("button", { name: "Win encounter", exact: true }).click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "reward");
  await page.getByRole("button", { name: "Skip sector", exact: true }).click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "won");
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE)).toBe(JSON.stringify(normal));
  expect(await page.evaluate(() => localStorage.getItem("faultline-records-v2"))).toBe(records);
  expect(await page.evaluate(() => localStorage.getItem("faultline-progress-v1"))).toBe(progressBefore);
  await page.getByRole("link", { name: "Return to game", exact: true }).click();
  await expect(page.locator("#dev-panel")).toHaveCount(0);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "map");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).archetype, STORAGE)).toBe("ghost");
});

test("immortality, instant steps, restart points and setup import use the actual playable state", async ({ page }) => {
  await openDev(page);
  await tab(page, "Encounter");
  await page.getByLabel("Enemy", { exact: true }).selectOption("serpent");
  await page.getByRole("button", { name: "Enter selected room", exact: true }).click();
  await tab(page, "Cheats");
  await page.getByLabel("Immortal keeper", { exact: true }).check();
  await page.getByLabel("Keeper integrity", { exact: true }).fill("1");
  await page.getByLabel("Energy", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Apply player state", exact: true }).click();
  await page.getByRole("button", { name: "Save restart point", exact: true }).click();
  const checkpoint = await state(page);
  await page.getByRole("button", { name: "Step turn instantly", exact: true }).click();
  let r = (await state(page)).run;
  expect(r.turn).toBe(2);
  expect(r.integrity).toBe(r.maxIntegrity);
  expect(r.phase).toBe("battle");
  await page.getByRole("button", { name: "Restart setup", exact: true }).click();
  r = (await state(page)).run;
  expect(r).toEqual(checkpoint.run);
  // Import is validated, and a malformed setup leaves the current one intact.
  await page.locator("#dev-import").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"run":{}}') });
  await expect(page.locator("#toast")).toContainText("not a valid");
  expect((await state(page)).run.topology).toEqual(checkpoint.run.topology);
  const imported = structuredClone(checkpoint);
  imported.run.credits = 1234;
  await page.locator("#dev-import").setInputFiles({ name: "setup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect.poll(async () => (await state(page)).run.credits).toBe(1234);
  await page.getByRole("button", { name: "+1,000 credits", exact: true }).click();
  await page.reload();
  await expect(page.locator("#dev-panel")).toBeVisible();
  await page.getByRole("button", { name: "Restart setup", exact: true }).click();
  expect((await state(page)).run.credits).toBe(1234);
});

test("tool input and tab keyboard navigation never trigger battle shortcuts", async ({ page }) => {
  await openDev(page);
  await tab(page, "Build");
  const before = await state(page);
  await page.getByLabel("Find a card", { exact: true }).fill("router");
  await page.getByLabel("Find a card", { exact: true }).press("Enter");
  await page.getByLabel("Find a card", { exact: true }).press("Space");
  await page.getByRole("tab", { name: "Build", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Encounter", exact: true })).toHaveAttribute("aria-selected", "true");
  expect((await state(page)).run.turn).toBe(before.run.turn);
  expect((await state(page)).run.cardsPlayed).toBe(before.run.cardsPlayed);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`playground controls fit at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openDev(page);
    const tools = (await page.locator("#dev-panel").boundingBox())!;
    expect(tools.x).toBeGreaterThanOrEqual(0);
    expect(tools.x + tools.width).toBeLessThanOrEqual(size.width + 1);
    expect(tools.y + tools.height).toBeLessThanOrEqual(size.height + 1);
    if (size.width > 760) {
      const game = (await page.locator("#app").boundingBox())!;
      expect(game.x + game.width).toBeLessThanOrEqual(tools.x + 1);
    }
    await expect(page.getByRole("button", { name: "Restart setup", exact: true })).toBeInViewport();
    await page.screenshot({ path: `artifacts/dev-playground-${size.width}.png` });
    await page.getByRole("button", { name: "Hide tools", exact: true }).click();
    await expect(page.locator("#dev-panel")).toBeHidden();
    const game = (await page.locator("#app").boundingBox())!;
    expect(game.width).toBeCloseTo(size.width, 0);
    await page.getByRole("button", { name: "Show tools", exact: true }).click();
    await expect(page.locator("#dev-panel")).toBeVisible();
  });
}
