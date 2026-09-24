import type { Page } from "@playwright/test";
import { atRoom, expect, install, STORAGE, test } from "./helpers.ts";
import { CARDS, RULES } from "../src/core/cards.ts";

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
interface Drill { id: string; turn: number; focus: string | null; deliveries: { key: string; port: string }[]; step: number; complete: boolean; plate: boolean }
/** The drill's own state (lesson runs are never saved; a dev-server hook). */
async function drill(page: Page): Promise<Drill> {
  return (await page.evaluate(() => (globalThis as { __faultlineLesson?: () => unknown }).__faultlineLesson?.() ?? null)) as Drill;
}
/** Keys go to the table, not to the last button clicked. */
async function press(page: Page, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}
/** Click a hostile (its row on the plate) to target it: every delivery follows. */
async function target(page: Page, port: string) {
  await page.locator(`.port-row[data-port="${port}"]`).click();
  await expect.poll(async () => (await drill(page)).focus).toBe(port);
  expect((await drill(page)).deliveries.every(item => item.port === port)).toBe(true);
}
/** The lesson is over: the scrim holds the frozen board and the completion plate is up. */
async function lessonOver(page: Page, next: string | null) {
  const plate = page.locator(".lesson-end");
  await expect(plate).toBeVisible();
  await expect(page.locator(".lesson-end-scrim")).toBeVisible();
  await expect(plate.locator('[data-action="lesson-restart"]')).toContainText("Replay");
  await expect(plate.locator('[data-action="lesson-training"]')).toContainText("Training menu");
  if (next) await expect(plate.locator('[data-action="lesson-next"]')).toContainText(next);
  else await expect(plate.locator('[data-action="lesson-next"]')).toHaveCount(0);
  await expect(page.locator(".training-panel.is-complete")).toBeVisible();
  await expect(page.locator(".training-panel .training-foot")).toHaveCount(0);
  return plate;
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
  const plate = await lessonOver(page, "Read the Enemy");
  expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("first-signal");
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE)).toBe(savedBefore);
  // Enter continues: the way on holds the keyboard focus.
  await expect(plate.locator('[data-action="lesson-next"]')).toBeFocused();
  if (process.env.FAULTLINE_SHOTS) await page.screenshot({ path: `${process.env.FAULTLINE_SHOTS}/lesson-end-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });

  // The finished lesson is over: no key, card or click plays on its frozen board.
  const frozen = await drill(page);
  expect(frozen).toMatchObject({ id: "first-signal", complete: true, plate: true, turn: 2 });
  for (const key of ["Space", "Enter", "1", "p", "c", "z", "f", "t"]) await press(page, key);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const cardBox = (await page.locator("#hand-zone [data-hand]").first().boundingBox())!;
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await expect(page.locator("#hand-zone [data-hand].selected")).toHaveCount(0);
  expect(await drill(page)).toEqual(frozen);
  await expect(page.locator(".lesson-end")).toBeVisible();

  // Replay starts over from a fresh board: no router, no cables, step one, turn one.
  await plate.locator('[data-action="lesson-restart"]').click();
  await lessonReady(page, "first-signal");
  await expect(page.locator(".lesson-end, .lesson-end-scrim")).toHaveCount(0);
  expect(await drill(page)).toMatchObject({ id: "first-signal", turn: 1, step: 0, complete: false, plate: false });
  await expect(page.locator('#hand-zone [data-card-id="router"]')).toHaveCount(1);
  await page.locator('[data-hand][data-card-id="router"]').first().click();
  await page.locator('#target-dock [data-action="auto-place"]').click();
  const again = (await dockNodes(page)).find(id => !terminals.includes(id))!;
  await cable(page, "alpha", again);
  await cable(page, again, "omega");
  await transmitLesson(page);

  // Training menu leaves the lesson: the menu opens over the title, and closing it stays there.
  await (await lessonOver(page, "Read the Enemy")).locator('[data-action="lesson-training"]').click();
  await expect(page.locator("dialog.training-dialog")).toBeVisible();
  await expect(page.locator(".game-root")).toHaveAttribute("data-training", "");
  await expect(page.locator('dialog .lesson-card.done[data-lesson="first-signal"]')).toBeVisible();
  await page.locator('dialog [data-action="close"]').first().click();
  await expect(page.locator(".title-screen")).toBeVisible();
  await expect(page.locator(".lesson-end")).toHaveCount(0);

  // Lesson 3: a second channel through its own router is the whole three-energy turn; it survives
  // the cut, and next turn Hot Patch restores the cut line.
  await page.locator('[data-action="tutorial"]').first().click();
  await page.locator('dialog button[data-lesson="reroute"]').click();
  await lessonReady(page, "reroute");
  await expandCoach(page);
  await expect(page.locator(".training-panel")).toContainText("Every device carries one channel");
  if (process.env.FAULTLINE_SHOTS) await page.screenshot({ path: `${process.env.FAULTLINE_SHOTS}/03-channel.png` });
  const existing = await dockNodes(page);
  await page.locator('[data-hand][data-card-id="router"]').first().click();
  await page.locator('#target-dock [data-deploy-zone="south"]').click();
  const second = (await dockNodes(page)).find(id => !existing.includes(id))!;
  await cable(page, "alpha", second);
  await cable(page, second, "omega");
  // The route took every energy: the spotlight goes to Transmit, never to an unaffordable Failover Policy.
  await expect(page.locator(".energy-orb strong")).toHaveText(String(RULES.baseEnergy - CARDS.router.cost - 2 * CARDS.fiber.cost));
  await expect(page.locator(".transmit-button.lesson-focus")).toBeVisible();
  await expect(page.locator('[data-hand][data-card-id="failover-policy"].lesson-focus')).toHaveCount(0);
  await transmitLesson(page);
  await expect(page.locator(".training-meter")).toHaveAttribute("aria-valuenow", "2");
  await expect(page.locator('[data-hand][data-card-id="patch"].lesson-focus')).toBeVisible();
  await page.locator('[data-hand][data-card-id="patch"]').first().click();
  await lessonOver(page, "Online Devices");
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), TRAINING))!)).toEqual(expect.arrayContaining(["first-signal", "reroute"]));

  // Replay, then leave mid-drill from the coach panel: the saved expedition waits untouched.
  await page.locator('.lesson-end [data-action="lesson-restart"]').click();
  await lessonReady(page, "reroute");
  expect(await drill(page)).toMatchObject({ id: "reroute", turn: 1, step: 0, complete: false });
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
  await expect(page.locator('dialog [data-action="lesson-finish-next"]')).toContainText("Choose the Target");
  if (process.env.FAULTLINE_SHOTS) await page.screenshot({ path: `${process.env.FAULTLINE_SHOTS}/walkthrough-end.png` });
  await page.locator('dialog [data-action="lesson-finish"]').click();
  await expect(page.locator('dialog .lesson-card.done[data-lesson="expedition"]')).toBeVisible();
  // The guide ends like a battle lesson: its Next lesson opens chapter 10.
  await page.locator('dialog button[data-lesson="expedition"]').click();
  await page.locator(`dialog [data-walkthrough="${pages - 1}"]`).first().click();
  await page.locator('dialog [data-action="lesson-finish-next"]').click();
  await lessonReady(page, "aim-signal");
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

  // The ledger chips are gone: the Tap's mark over the table opens its plate, and the plate scrubs.
  await page.locator('#intent-layer [data-anchor-installation="tap1"]').click();
  await page.locator('#target-dock .scrub-button[data-scrub="tap1"]').click();
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

test("Field Training 5 · Hold the Ground: the relocation is spotlit through to its confirm plate", async ({ page }) => {
  test.setTimeout(60_000);
  await install(page, null);
  await page.locator('[data-action="tutorial"]').first().click();
  await page.locator('dialog button[data-lesson="bands"]').click();
  await lessonReady(page, "bands");
  await expandCoach(page);
  await expect(page.locator(".training-panel")).toContainText("then confirm");
  // The table has no DOM to point at; once the router is chosen, its band buttons carry the spotlight.
  await page.evaluate(() => (globalThis as { __faultlineHud?: { selectNode(id: string): void } }).__faultlineHud!.selectNode("router1"));
  await expect(page.locator('#target-dock [data-relocate-zone="center"].lesson-focus')).toBeVisible();
  await expect(page.locator("#lesson-spotlight")).toHaveClass(/active/);
  await page.locator('#target-dock [data-relocate-zone="center"]').click();
  // Where the move asks for confirmation, the plate is the lit control: both of its buttons sit in
  // the spotlight's hole, above the dimmer, and take the click.
  const confirm = page.locator("#relocate-confirm");
  if (await confirm.isVisible().catch(() => false)) {
    await expect(confirm).toHaveClass(/lesson-focus/);
    for (const button of ["[data-relocate-confirm]", "[data-relocate-cancel]"]) {
      await expect.poll(async () => {
        const [hole, box] = await Promise.all([page.locator("#lesson-spotlight i").boundingBox(), confirm.locator(button).boundingBox()]);
        return !!hole && !!box && box.x >= hole.x && box.y >= hole.y && box.x + box.width <= hole.x + hole.width && box.y + box.height <= hole.y + hole.height;
      }).toBe(true);
      expect(await confirm.locator(button).evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
    await confirm.locator("[data-relocate-confirm]").click();
  }
  // One move answers both the suppression and the storm's band: the drill moves on to Resonance.
  await expect(page.locator(".training-meter")).toHaveAttribute("aria-valuenow", "2");
});

// ---------------------------------------------------------------------------
// The table-front drills (lessons 10–12): every step on hard rails with its spotlight.
// FAULTLINE_SHOTS=<dir> also plays them at 1440×900 and 1920×1080 and saves each step's spotlight.

const SHOTS = process.env.FAULTLINE_SHOTS;
const SIZES = [{ width: 1280, height: 720 }, ...(SHOTS ? [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }] : [])];

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

    test("Field Training 10 · Choose the Target: read, target, transmit and overflow, retarget, overflow — nothing else plays", async ({ page }) => {
      test.setTimeout(120_000);
      await openDrill(page, "aim-signal");
      await expect(page.locator(".training-kicker")).toContainText("Lesson 10 of 12");
      await expect(page.locator(".training-panel")).toContainText("Choose the Target");
      // Three hostiles, one per port; no per-channel controls anywhere.
      for (const port of ["left", "centre", "right"]) await expect(page.locator(`.port-row[data-port="${port}"]`)).toBeVisible();
      await expect(page.locator(".delivery-row, .port-stud, [data-aim]")).toHaveCount(0);

      // 1 · read the rail: every hostile's next move, lit together; only Got it moves on.
      await step(page, 1);
      await spotlit(page, "#intent-layer .hostile-intent, .port-strip");
      await expect(page.locator("#hand-zone [data-hand].lesson-parked")).toHaveCount(await page.locator("#hand-zone [data-hand]").count());
      await expect(page.locator(".training-panel")).toContainText(/LEFT.+CENTRE.+RIGHT/);
      await shot(page, "10-1-read");
      await refused(page, () => press(page, "Space"), /Read the three ports first/);
      await refused(page, () => page.locator('#hand-zone [data-card-id="pulse"]').first().click(), /Keep Packet Burst for later/);
      await refused(page, () => press(page, "f"), /read the three ports/i);
      await page.locator('.training-panel [data-action="lesson-read"]').first().click();

      // 2 · target the Relay Drone: its badge, else its row.
      await step(page, 2);
      await spotlit(page, '#intent-layer .hostile-intent[data-port="left"], .port-row[data-port="left"]');
      await expect(page.locator(".training-panel")).toContainText("Click the Relay Drone to target it");
      await shot(page, "10-2-target");
      await refused(page, () => press(page, "Space"), /target the Relay Drone first/);
      await refused(page, () => page.locator('.port-row[data-port="right"]').click(), /Target the Relay Drone/);
      await target(page, "left");

      // 3 · transmit: the whole packet lands on the Drone, and the spare overflows to the leader.
      await step(page, 3);
      await spotlit(page, ".transmit-button");
      await expect(page.locator(".training-panel")).toContainText(/spare 2 overflows to the CENTRE/);
      await expect(page.locator(".enemy-plate .landing-overflow")).toContainText("overflow 2 → CENTRE");
      await expect(page.locator(".transmit-button .transmit-note")).toContainText("overflow → CENTRE");
      await shot(page, "10-3-strike");
      await transmitLesson(page);

      // 4 · the Drone fell and the target went back to the leader. The Mite bites now: retarget it.
      await step(page, 4);
      expect((await drill(page)).focus).toBe("centre");
      await spotlit(page, '#intent-layer .hostile-intent[data-port="right"], .port-row[data-port="right"]');
      await expect(page.locator(".training-panel")).toContainText("click the Spark Mite to target it");
      await shot(page, "10-4-retarget");
      await refused(page, () => press(page, "Space"), /target the Spark Mite first/);
      await target(page, "right");

      // 5 · transmit: the Mite falls before it bites, the spare overflows into the leader.
      await step(page, 5);
      await spotlit(page, ".transmit-button");
      await expect(page.locator(".training-panel")).toContainText(/the Mite falls, and the spare \d+ overflows into/);
      await expect(page.locator(".enemy-plate .landing-overflow")).toContainText(/overflow \d+ → CENTRE/);
      await shot(page, "10-5-overflow");
      await transmitLesson(page);
      await lessonOver(page, "Clear the Ground");
      await shot(page, "10-6-complete");
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("aim-signal");
    });

    test("Field Training 11 · Clear the Ground: scrub, scrub, repair, transmit, purge — nothing else plays", async ({ page }) => {
      test.setTimeout(120_000);
      await openDrill(page, "clear-ground");
      await expect(page.locator(".training-kicker")).toContainText("Lesson 11 of 12");
      await step(page, 1);
      // The ledger chips are gone: an installation or a worn device carries a mark over the table (the
      // spotlight rings it); the mark opens its plate in the target dock, and the plate's button acts.
      const mark = '#intent-layer [data-anchor-installation="jammer1"]';
      const scrub = '#target-dock .scrub-button[data-scrub="jammer1"]';
      const worn = '#intent-layer [data-anchor-node="router1"]';
      const repair = '#target-dock .repair-button[data-repair="router1"]';
      await spotlit(page, mark);
      await shot(page, "11-1-scrub");
      // Off the step: the router's repair (R, the most worn device) and Transmit. (The compact plate
      // of a lesson has no Devices journal; scrubbing the Spike is refused in tutorial.test.ts.)
      await refused(page, () => press(page, "r"), /current step/);
      await refused(page, () => press(page, "Space"), /Scrub it first/);
      await page.locator(mark).click();
      await spotlit(page, scrub);
      await page.locator(scrub).click();
      await step(page, 2);
      await spotlit(page, scrub);
      await shot(page, "11-2-scrub-again");
      await page.locator(scrub).click();
      await expect(page.locator(mark)).toHaveCount(0);
      await step(page, 3);
      await spotlit(page, `${repair}, ${worn}`);
      await expect(page.locator(".enemy-plate")).toContainText(/Breaks ROUTER1/i);
      await shot(page, "11-3-repair");
      await refused(page, () => press(page, "Space"), /Repair it first/);
      if (!(await page.locator(repair).count())) await page.locator(worn).click();
      await spotlit(page, repair);
      await page.locator(repair).click();
      await step(page, 4);
      await expect(page.locator("#intent-layer [data-anchor-node]")).toHaveCount(0);
      await spotlit(page, ".transmit-button");
      await shot(page, "11-4-transmit");

      await transmitLesson(page);
      await step(page, 5);
      await expect(page.locator('#intent-layer [data-anchor-installation^="jammer"]')).toHaveCount(1);
      await spotlit(page, '#hand-zone [data-card-id="purge-field"]');
      await shot(page, "11-5-purge");
      await page.locator('#hand-zone [data-card-id="purge-field"]').click();
      await spotlit(page, '#target-dock [data-field-zone="north"]');
      await shot(page, "11-6-purge-band");
      await refused(page, () => page.locator('#target-dock [data-field-zone="south"]').click(), /Purge NORTH/);
      await page.locator('#target-dock [data-field-zone="north"]').click();
      await lessonOver(page, "The Crown and Its Wardens");
      await expect(page.locator("#intent-layer [data-anchor-installation]")).toHaveCount(0);
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("clear-ground");
    });

    test("Field Training 12 · The Crown and Its Wardens: read, target, prepare, transmit, break — nothing else plays", async ({ page }) => {
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
      await refused(page, () => press(page, "f"), /read the break meter/i);
      await meter.click();
      await step(page, 2);
      expect((await drill(page)).deliveries).toHaveLength(3);
      await spotlit(page, '#intent-layer .hostile-intent[data-port="left"], .port-row[data-port="left"]');
      await expect(page.locator(".training-panel")).toContainText("Click the left Gate Warden to target it");
      await shot(page, "12-2-target");
      await refused(page, () => press(page, "Space"), /Target the left Warden first/);
      await refused(page, () => page.locator('.port-row[data-port="right"]').click(), /Target the left Gate Warden/);
      await target(page, "left");
      await expect(page.locator(".enemy-plate .landing-overflow")).toContainText(/overflow \d+ → CENTRE/);
      await step(page, 3);
      await refused(page, () => page.locator('.port-row[data-port="centre"]').click(), /Keep your target on the left Warden/);
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
      await lessonOver(page, null);
      await shot(page, "12-7-complete");
      expect(await page.evaluate(key => localStorage.getItem(key), TRAINING)).toContain("wardens");
    });
  });
}
