/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import type { Page } from "@playwright/test";
import { CARDS, RULES } from "../src/core/cards.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { combatPreview, playInstant } from "../src/core/run.ts";
import {
  ENERGY, battle, connect, expect, idle, install, playCard, resolved, route, saved, test, transmit, turnOf,
} from "./helpers.ts";

const has = (links: { a: string; b: string }[], a: string, b: string) =>
  links.some(link => (link.a === a && link.b === b) || (link.a === b && link.b === a));
const damageShown = (page: Page) => page.locator(".transmit-power strong");

test("Architect: Patch Cable targets two devices, cables them for 1 energy, once per turn", async ({ page }) => {
  await install(page, battle({ archetype: "architect", nodes: [{ id: "router1", role: "router", x: 0, z: 0 }] }));
  const button = page.locator('[data-action="console"]');
  await button.click();
  await expect(page.locator("#target-dock .console-targets")).toBeVisible();
  // Escape backs out of targeting without spending anything.
  await page.keyboard.press("Escape");
  await expect(page.locator("#target-dock .console-targets")).toHaveCount(0);
  await page.keyboard.press("c");
  await connect(page, "alpha", "router1");
  const run = await saved(page);
  expect(has(run.topology.links, "alpha", "router1")).toBe(true);
  expect(run.energy).toBe(ENERGY - 1);
  expect(run.consoleUses).toBe(1);
  await expect(button).toBeDisabled();
});

test("Warden: Harden shields with online firewalls, and Backpressure stores the prevented damage", async ({ page }) => {
  const e = battle({
    archetype: "warden", enemy: "leech", turn: turnOf("leech", "strike"),
    nodes: [{ id: "router1", role: "router", x: 0, z: 0 }, { id: "firewall1", role: "firewall", x: -2.5, z: 0 }],
    links: [{ a: "alpha", b: "firewall1" }, { a: "firewall1", b: "router1" }, { a: "router1", b: "omega" }],
  });
  await install(page, e);
  const shield = page.locator(".shield-resource strong");
  const before = Number(await shield.textContent());
  await page.locator('[data-action="console"]').click();
  await expect(shield).toHaveText(String(before + RULES.hardenShield + RULES.hardenPerFirewall));
  const run = await saved(page);
  const expected = resolved(run);
  expect(expected.backpressure).toBeGreaterThan(0);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  await idle(page);
  // The stored pressure is a visible term of the next transmission.
  await page.locator('[data-action="combat-details"]').first().click();
  await expect(page.locator("dialog")).toContainText(/Backpressure/i);
});

test("Ghost: Buffer stores the transmission, releases it next turn, and warns before packet loss", async ({ page }) => {
  // The Rust Prophet neither heals nor cuts: the buffer's arithmetic stays in plain view.
  const e = battle({ archetype: "ghost", enemy: "prophet", turn: turnOf("prophet", "strike"), ...route("router1") });
  await install(page, e);
  const base = Number(await damageShown(page).textContent());
  // Buffering stores ⌊damage × bufferMultiplier⌋ (×1.5 since the v5 balance pass).
  const stored = Math.floor(base * RULES.bufferMultiplier);
  await page.locator('[data-action="console"]').click();
  await expect(page.locator(".transmit-button")).toHaveClass(/buffering/);
  await expect(page.locator('[data-action="transmit"]')).toHaveAttribute("aria-label", new RegExp(`Store · ${stored} into the buffer`));
  // Using it again before transmitting cancels, and a third press re-arms it.
  await page.locator('[data-action="console"]').click();
  await expect(page.locator(".transmit-button")).not.toHaveClass(/buffering/);
  await page.locator('[data-action="console"]').click();
  let run = await saved(page);
  let expected = resolved(run);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.buffer).toBe(stored);
  expect(expected.enemies[0].hp).toBe(run.enemies[0].hp);
  await idle(page);
  run = await saved(page);
  const release = combatPreview(run);
  expect(release.bufferRelease).toBe(expected.buffer);
  await expect(damageShown(page)).toHaveText(String(release.packetDamage));
  expected = resolved(run);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.buffer).toBe(0);
  expect(expected.enemies[0].hp).toBe(run.enemies[0].hp - release.packetDamage);
});

test("Ghost: buffering into a cut on the only route shows AT RISK", async ({ page }) => {
  const e = battle({ archetype: "ghost", enemy: "wraith", turn: turnOf("wraith", "sever"), ...route("router1") });
  e.run.buffer = 6;
  await install(page, e);
  await expect(page.locator(".engine-badge")).not.toHaveClass(/at-risk/);
  await page.locator('[data-action="console"]').click();
  await expect(page.locator(".engine-badge")).toHaveClass(/at-risk/);
  await expect(page.locator(".engine-badge")).toContainText("AT RISK");
  const run = await saved(page);
  expect(combatPreview(run).bufferAtRisk).toBe(true);
  const expected = resolved(run);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.buffer).toBe(0);
});

test("a protocol arms, is forecast to fire, and cancels the cut when the enemy acts", async ({ page }) => {
  const e = battle({ enemy: "wraith", turn: turnOf("wraith", "sever"), ...route("router1"), hand: ["failover-policy", "guard"] });
  await install(page, e);
  await playCard(page, "failover-policy");
  let run = await saved(page);
  expect(run.protocols).toEqual(["failover-policy"]);
  expect(run.energy).toBe(ENERGY - CARDS["failover-policy"].cost);
  await expect(page.locator(".protocol-slot.armed.will-trigger")).toBeVisible();
  const expected = resolved(run);
  await transmit(page);
  run = await saved(page);
  expect(run).toEqual(expected);
  expect(run.faultLinks).toEqual([]);
  expect(run.protocols).toEqual([]);
  expect([...run.discardPile, ...run.hand, ...run.drawPile]).toContain("failover-policy");
});

test("a honeypot draws the cut to its own cable and the attacker takes damage", async ({ page }) => {
  const turn = turnOf("widow", "sever", true);
  const e = battle({
    enemy: "widow", turn, hp: 80,
    nodes: [{ id: "router1", role: "router", x: 0, z: 0 }, { id: "honeypot1", role: "honeypot", x: -2.5, z: 2.4 }],
    links: [{ a: "alpha", b: "router1" }, { a: "router1", b: "omega" }, { a: "alpha", b: "honeypot1" }],
  });
  await install(page, e);
  const run = await saved(page), forecast = combatPreview(run);
  expect(forecast.faultTarget).toContain("honeypot1");
  expect(forecast.enemyDamage).toBe(RULES.honeypotDamage);
  await expect(page.locator(".hazard-caption.is-trap")).toBeVisible();
  const expected = resolved(run);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.faultLinks[0]).toContain("honeypot1");
  expect(expected.enemies[0].hp).toBe(80 - forecast.packetDamage - RULES.honeypotDamage);
});

/** Search outward from the table centre until the cursor turns into a pointer: the only
 * hoverable object near the centre of this fixture is the malware node. */
async function malwareOnTable(page: Page) {
  const canvas = page.locator("#world");
  const box = (await canvas.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height * .52 };
  const points: { x: number; y: number }[] = [];
  for (let dy = -box.height * .22; dy <= box.height * .22; dy += 12)
    for (let dx = -box.width * .12; dx <= box.width * .12; dx += 12) points.push({ x: centre.x + dx, y: centre.y + dy });
  points.sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y));
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    if (await canvas.evaluate(el => (el as HTMLCanvasElement).dataset.cursor) === "pointer") return point;
  }
  throw new Error("No hoverable malware near the table centre");
}

test("malware is scrubbed with the S shortcut and by clicking it on the table", async ({ page }) => {
  const e = battle({ malware: [{ id: "malware1", x: -2.5, z: -2.4 }, { id: "malware2", x: 0, z: 0 }], hand: ["guard"] });
  await install(page, e);
  // The ledger chips are gone: each installation carries a mark over the table (Field Training rings it).
  await expect(page.locator("#intent-layer [data-anchor-installation]")).toHaveCount(2);
  // S scrubs the installation the forecast names most dangerous (ties: the first planted).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("s");
  await expect.poll(async () => (await saved(page)).installations.map(m => m.id)).toEqual(["malware2"]);
  let run = await saved(page);
  expect(run.energy).toBe(ENERGY - RULES.scrubCost);
  await expect(page.locator("#intent-layer [data-anchor-installation]")).toHaveCount(1);
  const spot = await malwareOnTable(page);
  // v4 (design 13.3): clicking an installation on the table opens its plate; the plate scrubs.
  await page.mouse.click(spot.x, spot.y);
  await page.locator('.installation-controls [data-scrub="malware2"]').click();
  await expect.poll(async () => (await saved(page)).installations.length).toBe(0);
  run = await saved(page);
  expect(run.energy).toBe(ENERGY - 2 * RULES.scrubCost);
});

test("junk: a Worm is deleted for its cost; Packet Loss is refused with an explanation", async ({ page }) => {
  await install(page, battle({ hand: ["worm", "packet-loss", "guard"] }));
  await playCard(page, "worm");
  let run = await saved(page);
  expect(run.hand).toEqual(["packet-loss", "guard"]);
  expect(run.energy).toBe(ENERGY - CARDS.worm.cost);
  await playCard(page, "packet-loss");
  await expect(page.locator("#toast")).toContainText(/unplayable/i);
  run = await saved(page);
  expect(run.hand).toEqual(["packet-loss", "guard"]);
  await expect(page.locator('[data-hand][data-card-id="packet-loss"]')).toHaveClass(/junk|unplayable/);
});

test("upgraded cards show their + name, upgraded rules and upgraded effect", async ({ page }) => {
  const e = battle({ hand: ["guard+", "guard"] });
  await install(page, e);
  const card = page.locator('[data-hand="0"]');
  await expect(card.locator(".card-heading")).toHaveText(CARDS["guard+"].name);
  await expect(card).toContainText(CARDS["guard+"].rules);
  const expected = structuredClone(e.run), plain = structuredClone(e.run);
  expect(playInstant(expected, 0).ok).toBe(true);
  expect(playInstant(plain, 1).ok).toBe(true);
  expect(expected.block).toBeGreaterThan(plain.block);
  await card.click();
  expect((await saved(page)).block).toBe(expected.block);
  expect(CARDS["guard+"].rules).not.toBe(CARDS.guard.rules);
});

test("relocation moves a device to another band for its cost, and undo restores it exactly", async ({ page }) => {
  const e = battle({ ...route("router1") });
  await install(page, e);
  const before = await saved(page);
  await page.locator('[data-action="devices"]').click();
  await page.locator('[data-manage-node="router1"]').click();
  await page.locator('[data-relocate-zone="north"]').click();
  // The band only proposes: the relocation plate asks before the energy is spent.
  expect(await saved(page)).toEqual(before);
  await page.locator("#relocate-confirm [data-relocate-confirm]").click();
  const moved = await saved(page);
  expect(moved.topology.nodes.find(n => n.id === "router1")!.z).toBeLessThan(-1.3);
  expect(moved.energy).toBe(ENERGY - RULES.relocateCost);
  await page.locator('[data-action="undo"]').click();
  expect(await saved(page)).toEqual(before);
});

test("prepare holds a card out of this hand and deals it first next turn", async ({ page }) => {
  await install(page, battle({ ...route("router1"), hand: ["guard", "pulse", "patch"] }));
  await page.keyboard.press("p");
  await page.locator('[data-prepare-card="1"]').click();
  let run = await saved(page);
  expect(run.preparedCard).toBe("pulse");
  expect(run.hand).toEqual(["guard", "patch"]);
  const expected = resolved(run);
  await transmit(page);
  run = await saved(page);
  expect(run).toEqual(expected);
  expect(run.preparedCard).toBeNull();
  expect(run.hand[0]).toBe("pulse");
});

test("a guardian charges, a burst breaks its ultimate, and it is exposed for one transmission", async ({ page }) => {
  const charge = turnOf("regent", "charge");
  const routers = ["router1", "router2", "router3"];
  const e = battle({
    enemy: "regent", turn: charge, hp: 200, maxHp: 200, integrity: 30,
    nodes: routers.map((id, i) => ({ id, role: "router" as const, x: 0, z: (i - 1) * 2.4 })),
    links: routers.flatMap(id => [{ a: "alpha", b: id }, { a: id, b: "omega" }]),
    hand: ["guard", "guard"], draw: Array(20).fill("pulse"),
  });
  e.run.relics = [];
  await install(page, e);
  await expect(page.locator(".game-root")).toHaveAttribute("data-guardian-window", "charge");
  let run = await saved(page);
  let expected = resolved(run);
  await transmit(page);
  expect(await saved(page)).toEqual(expected);
  await idle(page);
  await expect(page.locator(".game-root")).toHaveAttribute("data-guardian-window", "ultimate");
  await expect(page.locator(".boss-window")).toBeVisible();
  const needed = ENEMIES.regent.boss!.breakDamage;
  while (combatPreview(await saved(page)).packetDamage < needed) await playCard(page, "pulse");
  await expect(page.locator(".game-root")).toHaveAttribute("data-guardian-window", "break");
  run = await saved(page);
  expect(combatPreview(run).interrupted).toBe(true);
  expected = resolved(run);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "break", { timeout: 15000 });
  await idle(page);
  run = await saved(page);
  expect(run).toEqual(expected);
  expect(run.enemies[0].exposed).toBe(true);
  await expect(page.locator(".game-root")).toHaveAttribute("data-guardian-window", "exposed");
});

test("reduced motion and fast mode resolve a lethal turn quickly and leave controls unlocked", async ({ page }) => {
  await install(page, battle({ enemy: "moth", hp: 1, ...route("router1") }), { motion: false, fast: true });
  await expect(page.locator("html")).toHaveClass(/reduced-motion/);
  const started = Date.now();
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(6000);
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/);
  await expect(page.locator("#world")).not.toHaveAttribute("data-enemy-action");
});
