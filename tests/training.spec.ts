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
  e.run.enemies = [];
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
  e.run.enemies = [];
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

// ---------------------------------------------------------------------------
// The table-front drills (lessons 10–12): every step on hard rails with its spotlight.
// FAULTLINE_SHOTS=<dir> also plays them at 1920×1080 and saves each step's spotlight.

const SHOTS = process.env.FAULTLINE_SHOTS;
const SIZES = [{ width: 1280, height: 720 }, ...(SHOTS ? [{ width: 1920, height: 1080 }] : [])];

async function openDrill(page: Page, id: string) {
  await install(page, null);
  await page.locator('[data-action="tutorial"]').first().click();
  await expect(page.locator("dialog.training-dialog")).toBeVisible();
  await page.locator(`dialog button[data-lesson="${id}"]`).click();
  await lessonReady(page, id);
}
/** The step's one control carries the spotlight: its glow, and the dimmer's hole around it. */
async function spotlit(page: Page, selector: string) {
  await expect(page.locator(`:is(${selector}).lesson-focus`).first()).toBeVisible();
  await expect(page.locator("#lesson-spotlight")).toHaveClass(/active/);
}
/** The coach stands on step n (goals met so far: n − 1). */
async function step(page: Page, n: number) {
  await expect(page.locator(".training-meter")).toHaveAttribute("aria-valuenow", String(n - 1));
}
/** Keys go to the table, not to the last button clicked. */
async function press(page: Page, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(550); // the hole glides 0.4 s to its target
  const { width, height } = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${name}-${width}x${height}.png` });
}
/** A move off the script: the coach objects, nothing changes. */
async function refused(page: Page, act: () => Promise<unknown>, objection: RegExp) {
  const before = await page.locator(".training-meter").getAttribute("aria-valuenow");
  await act();
  await expect(page.locator("#toast")).toContainText(objection);
  await expect(page.locator(".training-meter")).toHaveAttribute("aria-valuenow", before!);
}

for (const size of SIZES) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test("Field Training 10 · Aim the Signal: select, aim, transmit, focus, overflow — nothing else plays", async ({ page }) => {
      test.setTimeout(120_000);
      await openDrill(page, "aim-signal");
      await expect(page.locator(".training-kicker")).toContainText("Lesson 10 of 12");
      await step(page, 1);
      await spotlit(page, '.port-row[data-port="left"]');
      await expect(page.locator("#hand-zone [data-hand].lesson-parked")).toHaveCount(await page.locator("#hand-zone [data-hand]").count());
      await shot(page, "10-1-select");
      await refused(page, () => press(page, "Space"), /aim channel 2/i);
      await refused(page, () => page.locator('#hand-zone [data-card-id="pulse"]').first().click(), /Keep Packet Burst for later/);
      const second = page.locator(".delivery-row:not(.is-primary)").first();
      await refused(page, () => second.locator('[data-aim-port="left"]').click(), /current step/);

      await page.locator('.port-row[data-port="left"]').click();
      await step(page, 2);
      await spotlit(page, '.delivery-row:not(.is-primary) [data-aim-port="left"]');
      await shot(page, "10-2-aim");
      await refused(page, () => page.locator('.delivery-row.is-primary [data-aim-port="left"]').click(), /Leave the primary on the Leech/);
      await second.locator('[data-aim-port="left"]').click();
      await expect(second).toHaveClass(/is-aimed/);
      await step(page, 3);
      await spotlit(page, ".transmit-button");
      await shot(page, "10-3-strike");

      await transmitLesson(page);
      await step(page, 4);
      await expect(page.locator('.port-row[data-port="left"]')).toContainText("Relay Drone");
      await spotlit(page, '[data-focus-port="left"], .port-row[data-port="left"]');
      await shot(page, "10-4-focus");
      await refused(page, () => press(page, "Space"), /focus on the new Drone/);
      await refused(page, () => press(page, "t"), /press F|focus/i);
      await press(page, "f");
      await expect(page.locator('.port-row[data-port="left"]')).toHaveClass(/is-focus/);
      await step(page, 5);
      await spotlit(page, ".transmit-button");
      await expect(page.locator(".deliveries-foot")).toContainText(/overflow \d+ → CENTRE/);
      await shot(page, "10-5-transmit");
      await transmitLesson(page);
      await expect(page.locator(".training-panel.is-complete")).toBeVisible();
      await expect(page.locator(".training-panel")).toContainText("Clear the Ground");
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("aim-signal");
    });

    test("Field Training 11 · Clear the Ground: scrub, scrub, repair, transmit, purge — nothing else plays", async ({ page }) => {
      test.setTimeout(120_000);
      await openDrill(page, "clear-ground");
      await expect(page.locator(".training-kicker")).toContainText("Lesson 11 of 12");
      await step(page, 1);
      const jammer = page.locator('.ledger-chip.is-installation[data-scrub="jammer1"]');
      await spotlit(page, '.ledger-chip.is-installation[data-scrub="jammer1"]');
      await shot(page, "11-1-scrub");
      await refused(page, () => page.locator('.ledger-chip.is-installation[data-scrub="spike1"]').click(), /Leave the Spike/);
      await refused(page, () => page.locator('.ledger-chip.is-wear [data-repair="router1"]').click(), /current step/);
      await refused(page, () => press(page, "Space"), /Scrub it first/);
      await jammer.click();
      await step(page, 2);
      await spotlit(page, '.ledger-chip.is-installation[data-scrub="jammer1"]');
      await shot(page, "11-2-scrub-again");
      await jammer.click();
      await expect(jammer).toHaveCount(0);
      await step(page, 3);
      await spotlit(page, '.ledger-chip.is-wear [data-repair="router1"]');
      await expect(page.locator(".enemy-plate")).toContainText(/Breaks ROUTER1/i);
      await shot(page, "11-3-repair");
      await refused(page, () => press(page, "Space"), /Repair it first/);
      await page.locator('.ledger-chip.is-wear [data-repair="router1"]').click();
      await step(page, 4);
      await expect(page.locator(".ledger-chip.is-wear")).toHaveCount(0);
      await spotlit(page, ".transmit-button");
      await shot(page, "11-4-transmit");

      await transmitLesson(page);
      await step(page, 5);
      await expect(page.locator(".ledger-chip.is-installation.kind-jammer")).toHaveCount(1);
      await spotlit(page, '#hand-zone [data-card-id="purge-field"]');
      await shot(page, "11-5-purge");
      await page.locator('#hand-zone [data-card-id="purge-field"]').click();
      await spotlit(page, '[data-field-zone="north"]');
      await shot(page, "11-6-purge-band");
      await refused(page, () => page.locator('[data-field-zone="south"]').click(), /Purge NORTH/);
      await page.locator('[data-field-zone="north"]').click();
      await expect(page.locator(".training-panel.is-complete")).toBeVisible();
      await expect(page.locator(".ledger-chip.is-installation")).toHaveCount(0);
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("clear-ground");
    });

    test("Field Training 12 · The Crown and Its Wardens: read, aim, prepare, transmit, break — nothing else plays", async ({ page }) => {
      test.setTimeout(120_000);
      await openDrill(page, "wardens");
      await expect(page.locator(".training-kicker")).toContainText("Lesson 12 of 12");
      await step(page, 1);
      await spotlit(page, ".boss-window, .coach-break");
      // The meter is the step's control: its click (or the Got it plate beside the plate's own window) reads it.
      const meter = page.locator(":is(.boss-window, .coach-break).lesson-focus").first();
      await expect(page.locator(".coach-break, .training-read").filter({ visible: true }).first()).toContainText("Got it");
      await shot(page, "12-1-read");
      await refused(page, () => press(page, "Space"), /Read the break meter first/);
      await refused(page, () => page.locator('.delivery-row:not(.is-primary) [data-aim-port="left"]').first().click(), /current step/);
      await meter.click();
      await step(page, 2);
      const bandwidth = page.locator(".delivery-row:not(.is-primary)");
      await expect(bandwidth).toHaveCount(2);
      await spotlit(page, '.delivery-row:not(.is-primary) [data-aim-port="left"]');
      await shot(page, "12-2-aim");
      await refused(page, () => page.locator('.delivery-row.is-primary [data-aim-port="left"]').click(), /Keep the primary on the Regent/);
      await bandwidth.nth(0).locator('[data-aim-port="left"]').click();
      await bandwidth.nth(1).locator('[data-aim-port="left"]').click();
      await expect(page.locator(".delivery-row.is-aimed")).toHaveCount(2);
      await step(page, 3);
      await spotlit(page, ".prepared-pile");
      await shot(page, "12-3-prepare");
      await refused(page, () => press(page, "Space"), /Prepare Packet Burst first/);
      await press(page, "p");
      await refused(page, () => page.locator("dialog [data-prepare-card]").filter({ hasText: "Packet Guard" }).first().click(), /Hold Packet Burst/);
      await press(page, "p");
      await page.locator("dialog [data-prepare-card]").filter({ hasText: "Packet Burst" }).first().click();
      await expect(page.locator(".prepared-pile")).toHaveClass(/occupied/);
      await step(page, 4);
      await spotlit(page, ".transmit-button");
      await shot(page, "12-4-charge");

      await transmitLesson(page);
      await step(page, 5);
      const window = page.locator(".boss-window");
      await expect(window).toContainText(/INTERRUPT THIS TURN/);
      await expect(window).toContainText("1 standing");
      await spotlit(page, '#hand-zone [data-card-id="pulse"]');
      await shot(page, "12-5-break");
      await refused(page, () => press(page, "Space"), /Crownfall would land/);
      await page.locator('#hand-zone [data-card-id="pulse"]').first().click();
      await expect(window).toHaveClass(/broken/);
      await spotlit(page, ".transmit-button");
      await shot(page, "12-6-break-ready");
      await transmitLesson(page);
      await expect(page.locator(".training-panel.is-complete")).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("wardens");
    });
  });
}
