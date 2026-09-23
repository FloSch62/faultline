import { test, expect } from "@playwright/test";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";

test("110% scaling keeps dragged cards under the pointer and tooltips in a scrolled viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  const expedition = newExpedition("architect", 928);
  chooseRoom(expedition.run, "0-1");
  await page.addInitScript(e => {
    localStorage.setItem("faultline-expedition-v2", JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
  }, expedition);
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
  const card = page.locator('[data-hand][data-card-id="router"]').first();
  await card.scrollIntoViewIfNeeded();
  expect(await page.locator("#app").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const box = (await card.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const target = { x: start.x + 35, y: start.y - 85 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.locator(".drag-ghost")).toBeVisible();
  const ghost = (await page.locator(".drag-ghost").boundingBox())!;
  expect(Math.abs(ghost.x + ghost.width / 2 - target.x)).toBeLessThan(2);
  expect(Math.abs(ghost.y + ghost.height / 2 - target.y)).toBeLessThan(2);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.locator('[data-field-zone="center"]').hover();
  await expect(page.locator("#game-tooltip")).toHaveClass("visible");
  const tooltip = (await page.locator("#game-tooltip").boundingBox())!;
  expect(tooltip.x).toBeGreaterThanOrEqual(0);
  expect(tooltip.y).toBeGreaterThanOrEqual(0);
  expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(1024);
  expect(tooltip.y + tooltip.height).toBeLessThanOrEqual(600);
});
