/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import type { Page } from "@playwright/test";
import { expect, test, install, battle, route, transmit, saved } from "./helpers.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { createMap } from "../src/core/map.ts";
import { STAGES } from "../src/core/stages.ts";
import { TRACK_TITLES } from "../src/core/music.ts";

async function observeMusic(page: Page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__stageScorePlayers = [];
    window.Audio = class extends NativeAudio {
      constructor(src?: string) { super(src); (window as any).__stageScorePlayers.push(this); }
    };
  });
}

async function backdrop(page: Page, file: string, combat = false) {
  const css = await page.locator(".scene-backdrop").evaluate(el => getComputedStyle(el).backgroundImage);
  expect(css).toContain(file);
  expect(await page.evaluate(async file => {
    const image = new Image();
    image.src = new URL(`art/${file}`, document.baseURI).href;
    await image.decode();
    return image.naturalWidth > 1500 && image.naturalHeight > 800;
  }, file)).toBe(true);
  if (combat) await expect(page.locator("#world")).toHaveAttribute("data-backdrop", file);
}

async function playing(page: Page, file: string) {
  await expect(page.locator("#now-playing")).toContainText(TRACK_TITLES[file]);
  await expect.poll(() => page.evaluate(file => {
    const players = (window as any).__stageScorePlayers as HTMLAudioElement[];
    return players.some(p => p.src.endsWith(`/${file}-instrumental.ogg`) && !p.paused && p.currentTime > 0 && p.readyState >= 2);
  }, file)).toBe(true);
}

for (const [stage, definition] of STAGES.entries()) {
  test(`${definition.name}: map, battle, track endings and saved return retain the stage's media`, async ({ page }) => {
    await observeMusic(page);
    const e = newExpedition("architect", 930 + stage);
    e.run.stage = stage;
    e.run.map = createMap(stage, e.run.seed);
    await install(page, e, { fast: true });
    await expect(page.locator(".game-root")).toHaveAttribute("data-stage", String(stage + 1));
    await backdrop(page, definition.art.panorama);
    await playing(page, definition.music.explore);
    await page.screenshot({ path: `artifacts/stage-media/stage-${stage + 1}-map.png`, animations: "disabled" });
    await page.locator(".route-room.available").first().click();
    await expect(page.locator(".game-root")).toHaveAttribute("data-view", "battle");
    await backdrop(page, definition.art.battle, true);
    const nowPlaying = await page.locator("#now-playing").innerText();
    const first = definition.music.battle.find(id => nowPlaying.includes(TRACK_TITLES[id]))!;
    expect(first).toBeTruthy();
    await playing(page, first);
    // The actual media-ended handler must advance within this stage, without a render.
    await page.evaluate(first => {
      const player = ((window as any).__stageScorePlayers as HTMLAudioElement[]).find(p => p.src.endsWith(`/${first}-instrumental.ogg`))!;
      player.dispatchEvent(new Event("ended"));
    }, first);
    await expect(page.locator("#now-playing")).not.toContainText(TRACK_TITLES[first]);
    const nextTitle = await page.locator("#now-playing").innerText();
    const next = definition.music.battle.find(id => nextTitle.includes(TRACK_TITLES[id]))!;
    expect(next).toBeTruthy();
    await playing(page, next);
    await page.mouse.move(2, 2);
    await expect(page.locator(".terrain-title")).toHaveCount(0, { timeout: 10000 });
    await page.screenshot({ path: `artifacts/stage-media/stage-${stage + 1}-battle.png`, animations: "disabled" });
    await page.locator('[data-action="settings"]').click();
    await page.locator('[data-action="save-exit"]').click();
    await backdrop(page, STAGES[0].art.panorama);
    await playing(page, "the-last-relay");
    await page.reload();
    await page.locator('[data-action="continue"]').click();
    await backdrop(page, definition.art.battle, true);
    const resumedTitle = await page.locator("#now-playing").innerText();
    const resumedTrack = definition.music.battle.find(id => resumedTitle.includes(TRACK_TITLES[id]))!;
    expect(resumedTrack).toBeTruthy();
    await playing(page, resumedTrack);
    await expect(page.locator(".game-root")).toHaveAttribute("data-stage", String(stage + 1));
  });
}

for (const stage of [0, 1]) test(`defeating stage ${stage + 1}'s guardian changes both scenery and soundtrack for the next stage`, async ({ page }) => {
  await observeMusic(page);
  const e = battle({ enemy: STAGES[stage].boss, hp: 1, ...route("router1") });
  e.run.stage = stage;
  e.run.map = createMap(stage, e.run.seed);
  const boss = e.run.map.find(room => room.type === "boss")!;
  e.run.currentRoom = boss.id;
  e.run.floor = boss.floor;
  await install(page, e, { fast: true });
  await backdrop(page, STAGES[stage].art.battle, true);
  await playing(page, STAGES[stage].music.boss);
  await transmit(page);
  await page.locator('[data-action="skip-reward"]').click();
  await page.locator("[data-relic]").first().click();
  expect((await saved(page)).stage).toBe(stage + 1);
  await backdrop(page, STAGES[stage + 1].art.panorama);
  await playing(page, STAGES[stage + 1].music.explore);
  await page.locator(".route-room.available").first().click();
  await backdrop(page, STAGES[stage + 1].art.battle, true);
});
