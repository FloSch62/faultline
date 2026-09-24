import type { Page } from "@playwright/test";
import { CARDS, baseCard } from "../src/core/cards.ts";
import { EXPEDITION_VERSION, newExpedition } from "../src/core/expedition.ts";
import {
  battle, connect, deploy, expect, handIndex, idle, install, playCard, resolved, route, saved, test, transmit,
} from "./helpers.ts";

const isRouter = (id: string) => ["router", "hardened-router"].includes(baseCard(id as never));
const isCable = (id: string) => CARDS[id as keyof typeof CARDS]?.target === "link";

/** Build ALPHA → router → OMEGA from the opening hand; returns the new router id. */
async function buildFirstRoute(page: Page): Promise<string> {
  const before = (await saved(page)).topology.nodes.map(node => node.id);
  await deploy(page, isRouter);
  const router = (await saved(page)).topology.nodes.find(node => node.role === "router" && !before.includes(node.id))!.id;
  await connect(page, "alpha", router, isCable);
  await connect(page, router, "omega", isCable);
  return router;
}

test("a new expedition: title → archetype and ascension → map → first battle, forecast equals resolution", { tag: "@smoke" }, async ({ page }) => {
  await install(page, null, { storage: { "faultline-progress-v1": JSON.stringify({ cleared: { warden: 0 } }) } });
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  await page.locator('[data-action="new"]').click();
  await expect(page.locator(".selection-screen")).toBeVisible();
  await page.locator('[data-archetype="warden"]').click();
  // Each keeper plate paints its own portrait; only the chosen one unfolds its kit.
  const portraits = await page.locator(".keeper-portrait").evaluateAll(plates =>
    plates.map(plate => getComputedStyle(plate).backgroundImage.match(/url\("(.+)"\)/)?.[1] ?? ""));
  expect(new Set(portraits).size).toBe(3);
  for (const url of portraits) expect((await page.request.get(url)).ok(), url).toBe(true);
  await expect(page.locator('[data-archetype="warden"] .keeper-kit')).toBeVisible();
  await expect(page.locator(".keeper-kit")).toHaveCount(1);
  // Winning ascension 0 unlocked level 1 for the Warden only; level 2 stays locked.
  await expect(page.locator('[data-screen="ascension"][data-for="warden"][data-level="2"]')).toBeDisabled();
  await page.locator('[data-screen="ascension"][data-for="warden"][data-level="0"]').click();
  await page.locator('[data-screen="ascension"][data-for="warden"][data-level="1"]').click();
  await page.locator('[data-action="embark"]').click();
  await expect(page.locator(".map-screen")).toBeVisible();
  let run = await saved(page);
  expect(run.archetype).toBe("warden");
  expect(run.ascension).toBe(1);
  expect(run.relics).toContain("backpressure");

  await page.locator(".route-room.available").first().click();
  await idle(page);
  run = await saved(page);
  expect(run.phase).toBe("battle");
  const router = await buildFirstRoute(page);
  run = await saved(page);
  expect(run.topology.links.filter(link => [link.a, link.b].includes(router))).toHaveLength(2);
  const forecast = Number(await page.locator(".transmit-power strong").textContent());
  expect(forecast).toBeGreaterThanOrEqual(5);
  const expected = resolved(run);
  await transmit(page);
  const after = await saved(page);
  expect(after).toEqual(expected);
  if (after.phase === "battle") {
    expect(after.enemies[0].hp).toBe(run.enemies[0].hp - forecast);
    await idle(page);
  }
});

test("save → reload restores the exact expedition and the same battle screen", { tag: "@smoke" }, async ({ page }) => {
  const e = battle({ ...route("router1"), hand: ["guard", "pulse", "fiber", "switch"], enemy: "wraith" });
  await install(page, e);
  await playCard(page, "guard");
  await transmit(page);
  await idle(page);
  await playCard(page, "guard");
  const before = await saved(page);
  const energy = await page.locator(".energy-orb strong").textContent();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await idle(page);
  expect(await saved(page)).toEqual(before);
  await expect(page.locator(".energy-orb strong")).toHaveText(energy!);
  await expect(page.locator("[data-hand]")).toHaveCount(before.hand.length);
  await expect(page.getByRole("meter", { name: "Hostile integrity", exact: true })).toHaveAttribute("aria-valuenow", String(before.enemies[0].hp));
});

// v5 keeps no compatibility (no players yet): a save from any other version, the v4 one included, is not loaded.
for (const version of [2, 4]) test(`a version ${version} save is rejected gracefully: the title offers a new expedition, nothing breaks`, async ({ page }) => {
  const legacy = { ...newExpedition("architect", 42), version, cardSet: 2 };
  await install(page, legacy as never, { enter: false });
  await expect(page.locator(".title-screen")).toBeVisible();
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  await page.locator('[data-action="new"]').click();
  await expect(page.locator(".selection-screen")).toBeVisible();
  await page.locator('[data-action="embark"]').click();
  await expect(page.locator(".map-screen")).toBeVisible();
  const run = await saved(page);
  expect(run.archetype).toBe("architect");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("faultline-expedition-v2")!).version)).toBe(EXPEDITION_VERSION);
});

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
  test(`layout at ${width}×${height}: plates, hostile integrity, controls and hand never collide`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    const e = battle({
      nodes: [{ id: "router1", role: "router", x: 0, z: 0 }, { id: "router2", role: "router", x: 0, z: 2.4 }],
      links: [{ a: "alpha", b: "router1" }, { a: "router1", b: "omega" }, { a: "alpha", b: "router2" }, { a: "router2", b: "omega" }],
      malware: [{ id: "malware1", x: -2.5, z: -2.4 }],
      hand: ["router", "fiber", "failover-policy", "guard", "pulse", "zero-day", "honeypot", "worm"],
      enemy: "regent", hp: 112, maxHp: 112,
    });
    e.run.protocols = ["rate-limiter"];
    await install(page, e);
    const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    // The full "hp / max" is readable inside the enemy plate, clear of its painted border.
    await expect(page.locator(".enemy-health-label strong")).toHaveText(/112\s*\/\s*112/);
    const plate = await box(".enemy-plate"), hp = await box(".enemy-health-label strong");
    expect(hp.x).toBeGreaterThan(plate.x);
    expect(hp.x + hp.width).toBeLessThan(plate.x + plate.width * .9);
    expect(hp.y).toBeGreaterThan(plate.y);
    const player = await box(".player-plate");
    expect(overlap(player, plate)).toBe(false);
    for (const selector of [".console-button", ".protocol-dock", ".transmit-button", ".energy-orb", ".pile-cluster"]) {
      const b = await box(selector);
      expect(b.x, selector).toBeGreaterThanOrEqual(0);
      expect(b.y, selector).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, selector).toBeLessThanOrEqual(width + 1);
      expect(b.y + b.height, selector).toBeLessThanOrEqual(height + 1);
    }
    const transmitBox = await box(".transmit-button");
    for (const card of await page.locator(".card-fan .game-card").all()) {
      const c = await card.boundingBox();
      if (c && c.x + c.width > 0 && c.x < width) expect(overlap(transmitBox, c), "transmit dial vs a card").toBe(false);
    }
    for (const side of [".player-plate", ".enemy-plate"]) {
      const b = await box(side), fan = await box(".card-fan");
      expect(overlap(b, fan), `${side} vs hand`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // Every card stays usable: the hand scrolls rather than clipping cards out of reach.
    const last = page.locator(`[data-hand="${(await handIndex(page, "worm"))}"]`);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
}
