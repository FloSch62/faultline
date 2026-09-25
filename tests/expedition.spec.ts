/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import type { Page } from "@playwright/test";
import { RELICS, isUpgraded } from "../src/core/cards.ts";
import { encounterHealth } from "../src/core/map.ts";
import {
  buyCard, buyRelic, chooseCardReward, chooseEvent, chooseForge, chooseRelic, leaveEvent, leaveShop,
  removeDeckCard, shopRemoveCard, shopUpgradeCard, upgradeDeckCard,
} from "../src/core/run.ts";
import type { RunState } from "../src/core/types.ts";
import { atEvent, atRoom, battle, expect, idle, install, resolved, route, saved, test, transmit } from "./helpers.ts";

const json = (run: RunState) => JSON.parse(JSON.stringify(run)) as RunState;

/** Open a deck picker's first eligible card and return its deck index. */
async function pickFirst(page: Page): Promise<number> {
  const tile = page.locator('.pick-tile[data-screen="pick"]:not([disabled])').first();
  await expect(tile).toBeVisible();
  const index = Number(await tile.getAttribute("data-index"));
  await tile.click();
  return index;
}

test("the market sells the bench router, a relic, an upgrade and a removal, each once, then lets you leave", async ({ page }) => {
  const e = atRoom("shop");
  e.run.credits = 600;
  const expected = json(e.run);
  await install(page, e);
  await expect(page.locator(".market-screen")).toBeVisible();
  await expect(page.locator(".market-offer.bench")).toContainText("Core Router");
  await page.locator('[data-screen="buy-card"][data-index="0"]').click();
  expect(buyCard(expected, 0).ok).toBe(true);
  await expect(page.locator('[data-screen="buy-card"][data-index="0"]')).toBeDisabled();
  await page.locator('[data-screen="buy-relic"][data-index="0"]').click();
  expect(buyRelic(expected, 0).ok).toBe(true);
  await page.locator('[data-screen="shop-upgrade"]').click();
  const upgradedIndex = await pickFirst(page);
  expect(shopUpgradeCard(expected, upgradedIndex).ok).toBe(true);
  expect(isUpgraded(expected.deck[upgradedIndex])).toBe(true);
  await expect(page.locator('[data-screen="shop-upgrade"]')).toBeDisabled();
  await page.locator('[data-screen="shop-remove"]').click();
  const removedIndex = await pickFirst(page);
  expect(shopRemoveCard(expected, removedIndex).ok).toBe(true);
  await expect(page.locator('[data-screen="shop-remove"]')).toBeDisabled();
  let run = await saved(page);
  expect(run.credits).toBe(expected.credits);
  expect(run.deck).toEqual(expected.deck);
  expect(run.relics).toEqual(expected.relics);
  await page.locator('[data-screen="leave-shop"]').click();
  expect(leaveShop(expected).ok).toBe(true);
  await expect(page.locator(".map-screen")).toBeVisible();
  run = await saved(page);
  expect(run).toEqual(json(expected));
});

test("a refused purchase explains itself and changes nothing", async ({ page }) => {
  const e = atRoom("shop");
  e.run.credits = 0;
  await install(page, e);
  const before = await saved(page);
  await page.locator('[data-screen="buy-card"][data-index="1"]').click();
  await expect(page.locator("#toast")).toContainText(/credits/i);
  expect(await saved(page)).toEqual(before);
});

test("an event choice that needs a card opens the deck picker, resolves, and continues to the map", async ({ page }) => {
  const e = atEvent("operators-log");
  const expected = json(e.run);
  await install(page, e);
  await expect(page.locator(".event-screen")).toContainText("The Operator's Log");
  await page.locator('[data-screen="event-choice"][data-index="1"]').click();
  const index = await pickFirst(page);
  expect(chooseEvent(expected, 1, index).ok).toBe(true);
  await expect(page.locator(".event-outcome")).toBeVisible();
  expect(await saved(page)).toEqual(json(expected));
  await page.locator('[data-screen="event-leave"]').click();
  expect(leaveEvent(expected).ok).toBe(true);
  await expect(page.locator(".map-screen")).toBeVisible();
  expect(await saved(page)).toEqual(json(expected));
});

test("an event's fight branch starts a real battle against the announced hostile", async ({ page }) => {
  const e = atEvent("signal-in-the-static");
  const enemy = e.run.event!.enemyId!;
  await install(page, e);
  await page.locator('[data-screen="event-choice"][data-index="0"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "battle");
  await idle(page);
  const run = await saved(page);
  const room = run.map.find(item => item.id === run.currentRoom)!;
  expect(run.enemies[0].id).toBe(enemy);
  expect(run.enemies[0].maxHp).toBe(Math.round(encounterHealth(run.stage, { ...room, type: "battle" }, run.ascension) * 1.4));
  expect(run.hand.length).toBeGreaterThan(0);
});

for (const service of ["repair", "upgrade", "remove", "salvage"] as const) {
  test(`the sanctuary's ${service} service works and is the only service used`, async ({ page }) => {
    const e = atRoom("forge", "warden");
    e.run.integrity = e.run.maxIntegrity - 6;
    const expected = json(e.run);
    await install(page, e);
    await expect(page.locator(".forge-screen")).toBeVisible();
    await page.locator(`[data-screen="forge-${service}"]`).click();
    if (service === "repair") expect(chooseForge(expected, "repair").ok).toBe(true);
    if (service === "salvage") {
      expect(chooseForge(expected, "relic").ok).toBe(true);
      await expect(page.locator(".relic-screen")).toBeVisible();
      const relic = await page.locator("[data-relic]").first().getAttribute("data-relic");
      await page.locator("[data-relic]").first().click();
      expect(chooseRelic(expected, relic as never).ok).toBe(true);
    }
    if (service === "upgrade" || service === "remove") {
      expect(chooseForge(expected, service).ok).toBe(true);
      const index = await pickFirst(page);
      expect((service === "upgrade" ? upgradeDeckCard : removeDeckCard)(expected, index).ok).toBe(true);
    }
    await expect(page.locator(".map-screen")).toBeVisible();
    const run = await saved(page);
    expect(run).toEqual(json(expected));
    if (service === "repair") expect(run.integrity).toBeGreaterThan(e.run.integrity);
    if (service === "remove") expect(run.deck).toHaveLength(e.run.deck.length - 1);
    if (service === "salvage") expect(run.maxIntegrity).toBe(e.run.maxIntegrity - 2);
    if (service === "upgrade") expect(run.deck.filter(id => isUpgraded(id))).toHaveLength(1);
  });
}

test("defeating a stage guardian grants credits and a card, then a boss relic with a drawback, then stage II", async ({ page }) => {
  const e = battle({ enemy: "regent", hp: 1, ...route("router1") });
  const boss = e.run.map.find(room => room.type === "boss")!;
  e.run.currentRoom = boss.id;
  e.run.floor = boss.floor;
  await install(page, e);
  const before = await saved(page);
  const expected = resolved(before);
  await transmit(page);
  await expect(page.locator(".reward-screen")).toBeVisible();
  expect(await saved(page)).toEqual(expected);
  expect(expected.credits).toBeGreaterThan(before.credits);
  await expect(page.locator(".reward-screen")).toContainText(String(expected.credits - before.credits));
  const card = await page.locator("[data-reward]").first().getAttribute("data-reward");
  await page.locator("[data-reward]").first().click();
  expect(chooseCardReward(expected, card as never).ok).toBe(true);
  await expect(page.locator(".relic-screen.boss-offer")).toBeVisible();
  const offered = await page.locator("[data-relic]").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.relic!));
  expect(offered).toHaveLength(3);
  for (const id of offered) expect(RELICS[id as keyof typeof RELICS].tier).toBe("boss");
  await page.locator("[data-relic]").first().click();
  expect(chooseRelic(expected, offered[0] as never).ok).toBe(true);
  await expect(page.locator(".map-screen")).toBeVisible();
  const run = await saved(page);
  expect(run).toEqual(json(expected));
  expect(run.stage).toBe(1);
  expect(run.relics).toContain(offered[0]);
});
