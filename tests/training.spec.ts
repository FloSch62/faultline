import type { Page } from "@playwright/test";
import { atRoom, expect, install, STORAGE, test } from "./helpers.ts";

const TRAINING = "faultline-training-v1";

/** Device ids a cable card could connect right now (read from the targeting dock). */
async function dockNodes(page: Page, card = "fiber"): Promise<string[]> {
  await page.locator(`[data-hand][data-card-id="${card}"]`).first().click();
  const ids = await page.locator("#target-dock [data-node]").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.node!));
  await page.keyboard.press("Escape");
  return ids;
}
async function cable(page: Page, a: string, b: string) {
  await page.locator('[data-hand][data-card-id="fiber"]').first().click();
  await page.locator(`#target-dock [data-node="${a}"]`).click();
  await page.locator(`#target-dock [data-node="${b}"]`).click();
}
async function lessonReady(page: Page, id: string) {
  await expect(page.locator(".game-root")).toHaveAttribute("data-training", id);
  await expect(page.locator(".training-panel")).toBeVisible();
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/);
}
async function transmitLesson(page: Page) {
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/, { timeout: 25000 });
}
async function expandCoach(page: Page) {
  if (await page.locator(".training-panel.is-collapsed").count()) await page.locator('[data-action="lesson-collapse"]').click();
}

test("Field Training: lessons 1 and 3 complete through the real controls; exit restores the saved expedition", async ({ page }) => {
  test.setTimeout(120_000);
  const e = atRoom("battle");
  e.run.phase = "map";
  e.run.currentRoom = null;
  e.run.enemy = null;
  await install(page, e, { enter: false });
  const savedBefore = await page.evaluate(key => localStorage.getItem(key), STORAGE);

  await page.locator('[data-action="tutorial"]').first().click();
  await expect(page.locator("dialog.training-dialog")).toBeVisible();
  await expect(page.locator("dialog .lesson-card.done")).toHaveCount(0);
  await page.locator('dialog button[data-lesson="first-signal"]').click();
  await lessonReady(page, "first-signal");
  await expandCoach(page);

  // Lesson 1: router, two cables, transmit. The rails hold every card but the
  // router while step one is open, so the fiber probe waits until the router stands.
  const terminals = ["alpha", "omega"];
  await page.locator('[data-hand][data-card-id="router"]').first().click();
  await page.locator('#target-dock [data-action="auto-place"]').click();
  const router = (await dockNodes(page)).find(id => !terminals.includes(id))!;
  expect(router).toMatch(/^router/);
  await cable(page, "alpha", router);
  await cable(page, router, "omega");
  await transmitLesson(page);
  await expect(page.locator(".training-panel.is-complete")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("first-signal");
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE)).toBe(savedBefore);

  // Lesson 3: a second independent channel plus an armed Failover Policy survive the cut.
  await page.locator('[data-action="lesson-menu"]').first().click();
  await expect(page.locator('dialog .lesson-card.done[data-lesson="first-signal"]')).toBeVisible();
  await page.locator('dialog button[data-lesson="reroute"]').click();
  await lessonReady(page, "reroute");
  await expandCoach(page);
  const existing = await dockNodes(page);
  await page.locator('[data-hand][data-card-id="router"]').first().click();
  await page.locator('#target-dock [data-deploy-zone="south"]').click();
  const second = (await dockNodes(page)).find(id => !existing.includes(id))!;
  await cable(page, "alpha", second);
  await cable(page, second, "omega");
  await expect(page.locator(".training-panel")).toContainText(/.+/);
  await page.locator('[data-hand][data-card-id="failover-policy"]').first().click();
  await expect(page.locator(".protocol-slot.armed")).toHaveCount(1);
  await transmitLesson(page);
  await expect(page.locator(".training-panel.is-complete")).toBeVisible();
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), TRAINING))!)).toEqual(expect.arrayContaining(["first-signal", "reroute"]));

  await page.locator('[data-action="lesson-exit"]').first().click();
  await expect(page.locator(".title-screen")).toBeVisible();
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE)).toBe(savedBefore);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".map-screen")).toBeVisible();
});

test("the Handbook switches chapters and the expedition walkthrough pages turn", async ({ page }) => {
  await install(page, null);
  await page.locator('[data-action="help"]').first().click();
  const dialog = page.locator("dialog.handbook-dialog");
  await expect(dialog).toBeVisible();
  const chapters = await dialog.locator(".hb-nav [data-handbook]").evaluateAll(els =>
    els.map(el => ({ id: (el as HTMLElement).dataset.handbook!, title: el.textContent!.trim() })));
  expect(chapters.length).toBeGreaterThanOrEqual(10);
  await expect(dialog.locator('.hb-nav [aria-current="page"]')).toHaveAttribute("data-handbook", chapters[0].id);
  for (const chapter of chapters.slice(1)) {
    const before = await dialog.locator(".hb-nav ~ *").first().innerText();
    await dialog.locator(`.hb-nav [data-handbook="${chapter.id}"]`).click();
    await expect(dialog.locator('.hb-nav [aria-current="page"]')).toHaveAttribute("data-handbook", chapter.id);
    await expect.poll(() => dialog.locator(".hb-nav ~ *").first().innerText()).not.toBe(before);
  }
  await dialog.locator('.hb-nav [data-handbook="routes"]').click();
  await expect(dialog.locator("svg").first()).toBeVisible();
  await dialog.locator('[data-action="tutorial"]').click();
  await expect(page.locator("dialog.training-dialog")).toBeVisible();
  await page.locator('dialog button[data-lesson="expedition"]').click();
  await expect(page.locator("dialog.walkthrough-dialog")).toBeVisible();
  const pages = await page.locator("dialog .walk-dots [data-walkthrough]").count();
  expect(pages).toBeGreaterThanOrEqual(6);
  for (let i = 1; i < pages; i++) {
    await page.locator(`dialog [data-walkthrough="${i}"]`).first().click();
    await expect(page.locator(`dialog [data-walkthrough="${i}"].current`)).toBeVisible();
  }
  await page.locator('dialog [data-action="lesson-finish"]').click();
  await expect(page.locator('dialog .lesson-card.done[data-lesson="expedition"]')).toBeVisible();
});

test("Field Training: the danger lesson spotlights the Prepare slot and says where it is", async ({ page }) => {
  test.setTimeout(90_000);
  const e = atRoom("battle");
  e.run.phase = "map";
  e.run.currentRoom = null;
  e.run.enemy = null;
  await install(page, e, { enter: false });
  await page.locator('[data-action="tutorial"]').first().click();
  await page.locator('dialog button[data-lesson="danger"]').click();
  await lessonReady(page, "danger");
  await expandCoach(page);
  await expect(page.locator(".prepared-pile")).not.toHaveClass(/lesson-focus/);

  await page.locator("[data-scrub]").first().click();
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/);
  await page.locator('[data-hand][data-card-id="worm"]').first().click();
  const slot = page.locator(".prepared-pile");
  await expect(slot).toHaveClass(/lesson-focus/);
  await expect(slot).toBeVisible();
  await expect(page.locator(".training-panel")).toContainText("bottom left");
  if (process.env.FAULTLINE_SHOTS) await page.screenshot({ path: `${process.env.FAULTLINE_SHOTS}/prepare-spotlight.png` });

  await slot.click();
  await page.locator('dialog [data-prepare-card]').filter({ hasText: "Zero Day" }).first().click();
  await expect(slot).toHaveClass(/occupied/);
  await expect(slot).not.toHaveClass(/lesson-focus/);
});
