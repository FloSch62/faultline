/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import type { Page } from "@playwright/test";
// Every test also fails on any page or console error (see helpers.ts).
import { expect, test } from "./helpers.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { makeEnemy } from "../src/core/encounter.ts";
import { chooseRoom } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { STAGES } from "../src/core/stages.ts";
import { createMap } from "../src/core/map.ts";

const storage = "faultline-expedition-v2";
function fixture(id = "leech", turn = 0) {
  const e = newExpedition("architect", 923), r = e.run;
  chooseRoom(r, "0-1");
  r.enemies = [makeEnemy(id, "h1", "centre", "single", 100, { turn })];
  r.focus = "centre";
  r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  r.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "omega" });
  r.hand = ["guard", "guard", "guard", "guard", "guard", "guard"];
  r.block = 99;
  return e;
}
async function install(page: Page, e = fixture(), motion = false) {
  await page.addInitScript(({ storage, e, motion }) => {
    if (sessionStorage.getItem("guardian-fixture")) return;
    sessionStorage.setItem("guardian-fixture", "1");
    localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ motion, effects: 0, music: 0 }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: true, fast: false }));
  }, { storage, e, motion });
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
}
async function saved(page: Page) { return page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run, storage); }

test("default 110% interface clears the hand on save-exit and restores it on continue", async ({ page }) => {
  await install(page);
  expect(await page.locator("#app").evaluate(el => Number(getComputedStyle(el).zoom))).toBe(1.1);
  await expect(page.locator("[data-hand]")).toHaveCount(6);
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="save-exit"]').click();
  await expect(page.locator("#hand-zone")).toBeHidden();
  await expect(page.locator("[data-hand]")).toHaveCount(0);
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "title");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("[data-hand]")).toHaveCount(6);
});

test("Transmit's rotating dial stays centered throughout the turn", async ({ page }) => {
  await install(page, fixture(), true);
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    (window as any).__dialSamples = [];
    const sample = () => {
      const button = document.querySelector('[data-action="transmit"]')?.getBoundingClientRect();
      const dial = document.querySelector('.transmit-dial')?.getBoundingClientRect();
      if (button && dial) (window as any).__dialSamples.push(Math.abs(button.x + button.width / 2 - dial.x - dial.width / 2));
      (window as any).__dialFrame = requestAnimationFrame(sample);
    };
    sample();
  });
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-action", "strike", { timeout: 15000 });
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, { timeout: 15000 });
  const samples = await page.evaluate(() => { cancelAnimationFrame((window as any).__dialFrame); return (window as any).__dialSamples as number[]; });
  expect(samples.length).toBeGreaterThan(5);
  expect(Math.max(...samples)).toBeLessThan(1);
});

for (const [id, turn, kind] of [["core",0,"sever"],["core",1,"breach"],["core",2,"jam"],["prophet",0,"corrupt"]] as const)
  test(`${kind} has its own enemy animation and resolves the advertised target`, async ({ page }) => {
    await install(page, fixture(id, turn), true);
    await page.locator('[data-action="transmit"]').click();
    await expect(page.locator("#world")).toHaveAttribute("data-enemy-action", kind, { timeout: 15000 });
    await expect(page.locator(".game-root")).not.toHaveClass(/busy/, { timeout: 15000 });
    const r = await saved(page);
    expect(r.turn).toBe(2);
    if (kind === "jam") expect(r.faultNodes[0]).toBe("router1");
    if (kind === "sever") expect(r.faultLinks[0]).toBe("alpha::router1");
    if (kind === "corrupt") expect(r.zoneEffects).toEqual([{ zone: "center", kind: "corrosion", turns: 2 }]);
    await expect(page.locator("#world")).not.toHaveAttribute("data-enemy-action");
  });

for (const stage of [0, 1, 2]) test(`stage ${stage + 1} introduces its guardian once and preserves dismissal through reload`, async ({ page }) => {
  const e = newExpedition("architect", 924);
  e.run.stage = stage; e.run.map = createMap(stage); e.run.floor = 6;
  await install(page, e);
  await page.locator('[data-room="6-1"]').click();
  await expect(page.locator("dialog")).toHaveClass("boss-intro");
  await expect(page.locator("#guardian-name")).toContainText(["Iron Regent", "Hollow Choir", "Blackout Core"][stage]);
  expect((await saved(page)).enemies[0].id).toBe(STAGES[stage].boss);
  const before = await saved(page);
  await page.keyboard.press("1");
  expect((await saved(page)).hand).toEqual(before.hand);
  await page.getByRole("button", { name: /Face the guardian/ }).click();
  expect((await saved(page)).bossIntroSeen).toBe(true);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("dialog")).not.toBeVisible();
});

test("defeating the first guardian awards a relic and opens a fresh second-stage map", async ({ page }) => {
  const e = fixture("regent");
  e.run.floor = 6; e.run.currentRoom = "6-1"; e.run.lastRoom = "5-1";
  e.run.enemies[0].hp = 1; e.run.integrity = 3;
  await install(page, e);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("[data-hand]")).toHaveCount(0);
  await expect(page.locator(".reward-screen")).toContainText("STAGE I · GUARDIAN DEFEATED");
  await page.locator('[data-action="skip-reward"]').click();
  await page.locator("[data-relic]").first().click();
  await expect(page.locator(".map-story")).toContainText("STAGE II · THE GLASS CATHEDRAL");
  const r = await saved(page);
  expect(r.stage).toBe(1); expect(r.floor).toBe(0); expect(r.integrity).toBe(9);
  expect(r.map.every((room: { cleared: boolean }) => !room.cleared)).toBe(true);
});

test("battle music survives card plays and turns, then changes for the next encounter", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__scorePlayers = [];
    window.Audio = class extends NativeAudio {
      constructor(src?: string) { super(src); (window as any).__scorePlayers.push(this); }
    };
  });
  const e = fixture(); e.run.enemies[0].hp = e.run.enemies[0].maxHp = 10;
  await install(page, e);
  await expect.poll(() => page.evaluate(() => ((window as any).__scorePlayers as HTMLAudioElement[]).find(p => !p.loop)?.currentTime ?? 0)).toBeGreaterThan(0);
  const first = await page.locator("#now-playing").innerText();
  await page.locator('[data-hand="0"]').click();
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, { timeout: 15000 });
  expect(await page.locator("#now-playing").innerText()).toBe(first);
  const active = await page.evaluate(() => ((window as any).__scorePlayers as HTMLAudioElement[]).find(p => !p.loop)!.currentTime);
  expect(active).toBeGreaterThan(.1);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible({ timeout: 15000 });
  await page.locator('[data-action="skip-reward"]').click();
  await page.locator('.route-room.available').first().click();
  expect(await page.locator("#now-playing").innerText()).not.toBe(first);
});

test("a Reaver advertises its breach and corrosion together and installs the field after attacking", async ({ page }) => {
  await install(page, fixture("reaver"), true);
  await expect(page.locator(".intent-description")).toContainText("Corrosion in CENTER for 2 turns, starting next turn");
  await expect(page.locator('[data-combined-intent="true"]')).toContainText("CORROSION");
  expect((await saved(page)).zoneEffects).toEqual([]);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-action", "breach", { timeout: 15000 });
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, { timeout: 15000 });
  const r = await saved(page);
  expect(r.zoneEffects).toEqual([{ zone: "center", kind: "corrosion", turns: 2 }]);
  expect(r.integrity).toBe(14);
});
