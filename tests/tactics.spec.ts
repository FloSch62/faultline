import { test, expect, type Page } from "@playwright/test";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { chooseRoom, combatPreview } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";

const storage = "faultline-expedition-v2";
function fixture(id = "core", turn = 4) {
  const e = newExpedition("architect", 924), r = e.run, d = ENEMIES[id];
  chooseRoom(r, "0-1");
  r.enemy = { id, name: d.name, title: d.title, color: d.color, hp: 90, maxHp: 100, turn };
  r.integrity = r.maxIntegrity = 40;
  r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0, upgraded: true, configured: true });
  r.topology.links.push({ a: "alpha", b: "router1", boosted: true }, { a: "router1", b: "omega", boosted: true });
  r.hand = ["pulse", "guard", "fiber", "surge"];
  r.turn = turn + 1;
  return e;
}
async function install(page: Page, e: Expedition, motion = false) {
  await page.addInitScript(({ e, storage, motion }) => {
    if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false }));
  }, { e, storage, motion });
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator('[data-action="transmit"]')).toBeEnabled();
}
async function saved(page: Page) {
  return page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run, storage);
}

test("prepare supports keyboard, return, undo and reload without duplicating cards", async ({ page }) => {
  await install(page, fixture());
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toContainText("replaces one normal draw");
  await page.locator('[data-prepare-card="0"]').click();
  await expect(page.locator(".prepared-pile")).toHaveAttribute("aria-label", "Prepared: Packet Burst");
  expect((await saved(page)).preparedCard).toBe("pulse");
  await page.keyboard.press("z");
  expect((await saved(page)).preparedCard).toBeNull();
  await expect(page.locator(".card-fan [data-card-id]")).toHaveCount(4);
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-prepare-card="0"]').click();
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-action="release-prepared"]').click();
  expect((await saved(page)).hand).toEqual(["guard", "fiber", "surge", "pulse"]);
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-prepare-card="3"]').click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".prepared-pile")).toHaveAttribute("aria-label", "Prepared: Packet Burst");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".round-banner")).toContainText("TURN 06");
  const r = await saved(page);
  expect(r.preparedCard).toBeNull();
  expect(r.hand[0]).toBe("pulse");
  expect(r.hand).toHaveLength(6);
});

test("charge telegraphs the next ultimate, a prepared burst breaks it, and exposure expires", async ({ page }) => {
  const e = fixture();
  e.run.hand[0] = "zero-day";
  await install(page, e, true);
  await expect(page.locator(".intent-description")).toContainText("11 damage next turn");
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-prepare-card="0"]').click();
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "charge");
  await expect(page.locator(".boss-window")).toContainText("10 / 18 damage");
  await page.locator('.card-fan [data-card-id="zero-day"]').first().click();
  await expect(page.locator(".boss-window")).toContainText("INTERRUPT READY");
  await expect(page.locator(".forecast-net")).toContainText("0");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "break");
  await expect(page.locator(".boss-window")).toContainText("EXPOSED THIS TURN");
  expect((await saved(page)).enemy.exposed).toBe(true);
  expect((await saved(page)).integrity).toBe(40);
  await page.locator('[data-action="transmit"]').click();
  // This transmission also crosses half health: wait for packet, enemy action
  // and enrage to finish before asserting the new turn, including under software GL.
  await expect(page.locator('[data-action="transmit"]')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator(".round-banner")).toContainText("TURN 08");
  await expect(page.locator(".boss-window")).toHaveCount(0);
  expect((await saved(page)).enemy.exposed).toBeUndefined();
});

for (const id of ["regent", "cantor", "core"]) {
  test(`${id}: the unbroken ultimate matches the forecast and its controls remain reachable`, async ({ page }) => {
    const e = fixture(id, 5), r = e.run;
    r.topology.nodes[2].upgraded = false;
    r.topology.nodes[2].configured = false;
    r.topology.links.forEach(link => { link.boosted = false; });
    await install(page, e);
    await expect(page.locator(".boss-window")).toContainText(` / ${ENEMIES[id].boss!.breakDamage} damage`);
    for (const [width, height] of [[1440, 900], [1024, 600], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-action="prepare"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="prepare"]').click();
      await expect(page.locator('[data-prepare-card="0"]')).toBeVisible();
      await page.locator('.dialog-close').click();
      const overlap = await page.evaluate(() => {
        const a = document.querySelector(".enemy-plate")!.getBoundingClientRect();
        const b = document.querySelector(".field-strip")!.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
      expect(overlap, `${id} at ${width}`).toBe(false);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const p = combatPreview(r);
    await page.locator('[data-action="transmit"]').click();
    await expect(page.locator(".round-banner")).toContainText("TURN 07");
    expect((await saved(page)).integrity).toBe(r.integrity - p.incoming);
  });
}

test("sanctuary states the permanent salvage cost and charges it only once", async ({ page }) => {
  const e = newExpedition("warden", 924), r = e.run;
  r.phase = "forge";
  r.currentRoom = r.map.find(room => room.type === "forge")!.id;
  await page.addInitScript(({ e, storage }) => {
    if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
  }, { e, storage });
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator('[data-forge="relic"]')).toContainText("Sacrifice 2 maximum integrity");
  await expect(page.locator('[data-forge="relic"]')).toContainText("15 → 13");
  await page.locator('[data-forge="relic"]').click();
  expect((await saved(page)).maxIntegrity).toBe(13);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.locator('[data-relic]').first().click();
  expect((await saved(page)).maxIntegrity).toBe(13);
  expect((await saved(page)).relics).toHaveLength(2);
  await expect(page.locator('.map-screen')).toBeVisible();
});
