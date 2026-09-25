/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import { battle, expect, install, PREFERENCES, test } from "./helpers.ts";

const TRAINING = "faultline-training-v1";
/** A player who has never played: field notes on (the default), nothing else stored. */
const newPlayer = { storage: { [PREFERENCES]: JSON.stringify({ tips: true, fast: false }) } };
const preferences = (page: import("@playwright/test").Page) =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}"), PREFERENCES);

test("a new player's first New expedition recommends Field Training, and starts it", async ({ page }) => {
  await install(page, null, newPlayer);
  await page.locator('[data-action="new"]').click();
  const offer = page.locator("#dialog-content .training-offer");
  await expect(offer).toBeVisible();
  await expect(offer.locator('[data-action="training-first"]')).toContainText("Recommended");
  await offer.locator('[data-action="training-first"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-training", "first-signal");
  await expect(page.locator(".training-panel")).toBeVisible();
  expect((await preferences(page)).trainingOffered).toBe(true);
});

test("declining goes to the keepers, and the question is never asked again", async ({ page }) => {
  await install(page, null, newPlayer);
  await page.locator('[data-action="new"]').click();
  await page.locator('[data-action="skip-training"]').click();
  await expect(page.locator(".selection-screen")).toBeVisible();
  await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="new"]').click();
  await expect(page.locator(".selection-screen")).toBeVisible();
  await expect(page.locator("#dialog-content .training-offer")).toBeHidden();
});

test("players who trained, hold an expedition or turned field notes off go straight to the keepers", async ({ page, context }) => {
  for (const setup of [
    { storage: { ...newPlayer.storage, [TRAINING]: JSON.stringify(["first-signal"]) } },
    { storage: { [PREFERENCES]: JSON.stringify({ tips: false, fast: false }) } },
  ]) {
    const tab = await context.newPage();
    await install(tab, null, setup);
    await tab.locator('[data-action="new"]').click();
    await expect(tab.locator(".selection-screen")).toBeVisible();
    await tab.close();
  }
  await install(page, battle(), { ...newPlayer, enter: false });
  await page.locator('[data-action="new"]').click();
  await expect(page.locator(".selection-screen")).toBeVisible();
});
