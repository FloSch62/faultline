/** Table readability in the browser: the "routes · channels" chip, one colour per channel on the
 * table, the junction seal where routes merge, the amplified fibre's own colour, and the hover
 * cards for devices and cables. The 3D table is read through helpers.watchTable. */
import type { Page } from "@playwright/test";
import { AMPLIFIED_COLOR, CHANNEL_PALETTE, channelColor } from "../src/channel-palette.ts";
import { combatPreview } from "../src/core/run.ts";
import type { NetworkLink, NetworkNode } from "../src/core/types.ts";
import { battle, expect, install, pack, route, saved, tablePoint, tableState, test, watchTable } from "./helpers.ts";

/** A meshed table: a gold primary through the north, a centre channel, and two south routers
 * that merge in SWITCH6, whose last span to OMEGA is amplified. 4 routes, 3 channels. An
 * uncabled Cache Server stands offline in the centre. */
const nodes: NetworkNode[] = [
  { id: "router1", role: "router", x: -2.4, z: -3.0, upgraded: true, condition: 2, maxCondition: 2, deployedBy: "router" },
  { id: "switch2", role: "switch", x: 1.6, z: -3.0, condition: 2, maxCondition: 2, deployedBy: "switch" },
  { id: "router3", role: "router", x: -1.2, z: 0, condition: 2, maxCondition: 2, deployedBy: "router" },
  { id: "router4", role: "router", x: -3.0, z: 2.6, condition: 2, maxCondition: 2, deployedBy: "router" },
  { id: "router5", role: "router", x: -0.8, z: 3.6, condition: 2, maxCondition: 2, deployedBy: "router" },
  { id: "switch6", role: "switch", x: 2.0, z: 2.8, condition: 2, maxCondition: 2, deployedBy: "switch" },
  { id: "cache7", role: "cache", x: 0.4, z: -1.7, condition: 2, maxCondition: 2, deployedBy: "cache-server" },
];
const links: NetworkLink[] = [
  { a: "alpha", b: "router1" }, { a: "router1", b: "switch2" }, { a: "switch2", b: "omega" },
  { a: "alpha", b: "router3" }, { a: "router3", b: "omega" },
  { a: "alpha", b: "router4" }, { a: "router4", b: "switch6" },
  { a: "alpha", b: "router5" }, { a: "router5", b: "switch6" },
  { a: "switch6", b: "omega", boosted: true },
];
const meshed = () => pack([
  { id: "spark-mite", port: "left", hp: 12 },
  { id: "serpent", port: "centre", hp: 40 },
  { id: "splicer", port: "right", hp: 14 },
], { nodes, links, integrity: 60 });

/** Rests the pointer on a device's body (scanning up its height: the HUD covers some of the
 * table) until its hover card shows. */
async function hoverDevice(page: Page, id: string) {
  const node = nodes.find(item => item.id === id)!;
  for (const y of [2.0, 1.7, 2.3, 1.4, 1.1]) {
    const spot = await tablePoint(page, node.x, y, node.z);
    await page.mouse.move(spot.x - 2, spot.y);
    await page.mouse.move(spot.x, spot.y);
    if (await page.locator(`#hover-card.visible [data-card="device"][data-id="${id}"]`).count()) return;
  }
  throw new Error(`no hover card over ${id}`);
}
/** Walks along a cable's arc (the same curve World draws) until its hover card shows. */
async function hoverCable(page: Page, a: { x: number; z: number }, b: { x: number; z: number }) {
  const top = 0.62 + Math.min(0.38 + Math.hypot(a.x - b.x, a.z - b.z) * 0.07, 1.13);
  for (let t = 0.1; t < 0.95; t += 0.05) {
    const y = (1 - t) ** 2 * 0.62 + 2 * t * (1 - t) * top + t * t * 0.62;
    const spot = await tablePoint(page, a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
    await page.mouse.move(spot.x, spot.y);
    if (await page.locator('#hover-card.visible [data-card="cable"]').count()) return;
  }
  throw new Error("no hover card over the cable");
}

test("the chip counts routes and channels; each channel has its own colour and the amplified fibre keeps violet", async ({ page }) => {
  const e = meshed();
  const forecast = combatPreview(e.run);
  expect([forecast.routeCount, forecast.channels]).toEqual([4, 3]);
  expect(forecast.sharedDevices).toEqual([{ id: "switch6", routes: 2 }]);
  await watchTable(page);
  await install(page, e);

  const chip = page.locator(".ledger-chip.is-channels");
  await expect(chip).toHaveText(/4 routes · 3 channels/);
  await expect(chip).not.toContainText("cut-proof");
  await expect(chip.locator(".channel-swatches i")).toHaveCount(3);
  const tip = await chip.getAttribute("data-tooltip");
  expect(tip).toContain("Every device carries one channel: when two routes go through the same device, they are one channel, not two.");
  expect(tip).toContain("SWITCH6 (2 routes)");

  // One colour per delivering channel on the cables and skirts; a live route outside the set stays neutral.
  await expect.poll(async () => (await tableState(page)).cables.length).toBe(links.length);
  const state = await tableState(page);
  const channels = forecast.channelPaths.slice(0, forecast.channels);
  channels.forEach((path, index) => {
    for (let i = 1; i < path.length; i++) {
      const key = [path[i - 1], path[i]].sort().join("::");
      const cable = state.cables.find(item => item.key === key)!;
      expect(cable.channel, key).toBe(index);
      expect(cable.sheath, key).toBe(channelColor(index));
    }
    for (const id of path.slice(1, -1)) expect(state.devices.find(item => item.id === id)!.channel, id).toBe(index);
  });
  expect(new Set(channels.map((_, index) => channelColor(index))).size).toBe(3);
  const spare = state.cables.filter(item => item.channel === null);
  expect(spare.length).toBeGreaterThan(0);
  for (const cable of spare) expect(CHANNEL_PALETTE as readonly number[]).not.toContain(cable.sheath);

  // The amplified span: channel colour on the sheath, violet fibre, whichever channel carries it.
  const amplified = state.cables.find(item => item.key === "omega::switch6")!;
  expect(amplified.amplified).toBe(true);
  expect(amplified.channel).not.toBeNull();
  expect(amplified.sheath).toBe(channelColor(amplified.channel!));
  expect(amplified.fibre).toBe(AMPLIFIED_COLOR);
  for (const other of [...CHANNEL_PALETTE, 0xff3f8e, 0xd08a52, 0xec755d, 0xf5d196]) expect(AMPLIFIED_COLOR).not.toBe(other);
  expect(state.cables.filter(item => item.fibre !== null).map(item => item.key)).toEqual(["omega::switch6"]);

  // The junction seal marks only the device where routes merge.
  expect(state.devices.filter(item => item.junction !== null)).toEqual([{ id: "switch6", channel: amplified.channel, junction: 2 }]);
});

test("a single route reads in the singular and marks no junction", async ({ page }) => {
  await watchTable(page);
  await install(page, battle(route("router1")));
  await expect(page.locator(".ledger-chip.is-channels")).toHaveText(/1 route · 1 channel/);
  expect((await tableState(page)).devices.every(item => item.junction === null)).toBe(true);
});

test("hovering a device shows its card: name, band, what it does, its channel, the shared explanation", async ({ page }) => {
  await watchTable(page);
  await install(page, meshed());
  await hoverDevice(page, "switch6");
  const card = page.locator("#hover-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".tc-title strong")).toHaveText("Edge Switch");
  await expect(card.locator(".tc-title em")).toHaveText("SWITCH6");
  await expect(card).toContainText("South band · online");
  await expect(card).toContainText(/Channel \d · delivers \d+ to the centre/);
  await expect(card).toContainText("2 routes pass through SWITCH6 · a device carries one channel");
  // The primary router says what it adds; the offline cache says why it is offline.
  await hoverDevice(page, "router1");
  await expect(card).toContainText("Core Router");
  await expect(card).toContainText("Primary channel");
  await expect(card).toContainText("Carries the primary route: base +5 · its upgrades +2");
  await hoverDevice(page, "cache7");
  await expect(card).toContainText("Offline. No cable: connect it to a live route.");
  // Leaving the table hides it; the board is untouched.
  await page.mouse.move(5, 5);
  await expect(card).not.toHaveClass(/visible/);
  expect((await saved(page)).topology.links).toHaveLength(links.length);
});

test("hovering an amplified cable names its ends, its channel and the amplified fibre", async ({ page }) => {
  await watchTable(page);
  await install(page, meshed());
  await hoverCable(page, { x: 2.0, z: 2.8 }, { x: 5.3, z: 0 });
  const card = page.locator("#hover-card");
  await expect(card.locator(".tc-title strong")).toHaveText("Amplified cable");
  await expect(card).toContainText("SWITCH6 ↔ OMEGA");
  await expect(card).toContainText(/Channel \d · delivers/);
  await expect(card).toContainText("Amplified fibre · +1 on the primary route · idle here");
});
