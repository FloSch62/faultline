/** v4 "Under Quarantine" in the browser (design 15.4): packs on the rail, the table front,
 * designations and messages, the chart, and the reduced-motion equivalents. The 3D table is read
 * through three.js' devtools hook (helpers.watchTable), so these run on the production build too. */
import { EFFECTS } from "../src/audio-effects.ts";
import { designationEntranceLine } from "../src/story.ts";
import { chooseOffer, messageOptionText } from "../src/core/encounter.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { combatPreview } from "../src/core/run.ts";
import type { Installation, NetworkNode, RunState } from "../src/core/types.ts";
import {
  battle, cuesPlayed, expect, idle, idleOrScreen, install, pack, propTrail, recordCues, recordToasts, resolved, route, saved,
  tablePoint, tableState, test, toastsSeen, trackProps, transmit, turnOf, watchTable,
} from "./helpers.ts";

const near = (a: { x: number; z: number }, b: { x: number; z: number }, within = 0.05) => Math.hypot(a.x - b.x, a.z - b.z) < within;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const table = { name: "Test bench", description: "A bare test table.", debris: [] };

// ------------------------------------------------------------------ a pack fight

test("pack fight: three plates, a click targets, F cycles, the packet and its overflow, a dead escort's action is cancelled and its crate lands @smoke", async ({ page }) => {
  const e = pack([
    { id: "spark-mite", port: "left", hp: 4, maxHp: 12, extra: { crate: { kind: "salvage", role: "switch" } } },
    { id: "serpent", port: "centre", hp: 40 },
    { id: "splicer", port: "right", hp: 14 },
  ], { ...route("router1"), integrity: 60 });
  await watchTable(page);
  await recordToasts(page);
  await install(page, e, { motion: true });

  // Three plates: the port strip in the HUD and a plate under each portrait on the rail.
  await expect(page.locator(".port-strip .port-row")).toHaveCount(3);
  await expect(page.locator("#world")).toHaveAttribute("data-ports", "left,centre,right");
  await expect.poll(() => page.locator("#intent-layer .hostile-plate:not([hidden])").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.plate).sort())).toEqual(["centre", "left", "right"]);
  await expect(page.locator('.port-row[data-port="centre"]')).toHaveClass(/is-focus/);

  // A rail plate is a click target: it makes that hostile the target (the focus); every
  // delivery follows it and the right plate details it.
  await page.locator('#intent-layer .hostile-plate[data-plate="right"] .hp-health').click();
  await expect.poll(async () => (await saved(page)).focus).toBe("right");
  await expect(page.locator('.port-row[data-port="right"]')).toHaveClass(/is-focus/);
  await expect(page.locator('.port-row[data-port="right"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".port-detail h2")).toContainText(/Splicer/i);
  await expect(page.locator("#world")).toHaveAttribute("data-focus", "right");
  expect(combatPreview(await saved(page)).deliveries.map(item => item.port)).toEqual(["right"]);
  // F cycles the target in port order: right → left, and the whole packet follows.
  await page.keyboard.press("f");
  await expect.poll(async () => (await saved(page)).focus).toBe("left");
  expect(combatPreview(await saved(page)).deliveries.map(item => item.port)).toEqual(["left"]);

  // Per-port forecast: the strip prints each port's numbers; the plate adds up the packet on the
  // target and names the overflow its kill does not need.
  const run = await saved(page), forecast = combatPreview(run);
  const left = forecast.ports.left!;
  expect(left.lethal).toBe(true);
  const row = page.locator('.port-row[data-port="left"]');
  await expect(row).toHaveClass(/is-lethal/);
  await expect(row).toHaveAttribute("aria-label", new RegExp(`4 of 12 integrity, takes ${Math.min(4, left.packet)}, lethal`));
  const landing = page.locator(".enemy-plate .landing");
  await expect(landing.locator(".landing-total")).toHaveText(String(left.packet));
  expect(left.overflowOut).toBe(left.packet - 4);
  if (left.overflowOut) {
    await expect(landing.locator(".landing-overflow")).toContainText(`overflow ${left.overflowOut} → ${left.overflowTo!.toUpperCase()}`);
    expect(forecast.ports[left.overflowTo!]!.overflowIn).toBe(left.overflowOut);
  }
  await expect(page.locator(".transmit-button")).toBeVisible();

  // The escort dies to this transmission, so its action is cancelled: it no longer adds damage.
  const onLeader = combatPreview({ ...clone(run), focus: "centre" });
  expect(onLeader.hostiles.find(item => item.port === "left")!.state).toBe("acts");
  expect(forecast.hostiles.find(item => item.port === "left")!.state).toBe("cancelled");
  expect(forecast.incoming).toBeLessThan(onLeader.incoming);
  await expect(row).toHaveClass(/state-cancelled/);
  await expect(row.locator(".row-state.is-cancelled")).toHaveText(/Falls/i);
  await expect(page.locator('.hostile-intent[data-port="left"]')).toHaveClass(/state-falls/);

  // Transmit: the rules resolve exactly the forecast; the crate drops from the left port and lands
  // on the salvage socket, and its toast names the hardware.
  const expected = resolved(run);
  const salvage = expected.topology.nodes.find(node => node.salvage && !run.topology.nodes.some(other => other.id === node.id))!;
  expect(salvage.role).toBe("switch");
  await trackProps(page);
  await page.locator('[data-action="transmit"]').click();
  await expect.poll(async () => (await tableState(page)).props.some(prop => near(prop, salvage)), { timeout: 15000 }).toBe(true);
  await idleOrScreen(page);
  await idle(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.integrity).toBe(run.integrity - forecast.incoming);
  expect(expected.enemies.find(enemy => enemy.port === "left")!.hp).toBe(0);
  await expect.poll(() => toastsSeen(page)).toContain("Crate · Edge Switch salvaged");
  // With motion on, the crate flew in an arc from the rail before it landed.
  const trail = await propTrail(page);
  expect(trail.some(point => !near(point, salvage, 0.5))).toBe(true);
  await expect(page.locator(".port-strip .port-row")).toHaveCount(2);
  await expect(page.locator("#world")).toHaveAttribute("data-ports", "centre,right");
});

// ------------------------------------------------------------------ the table front

test("installation fight: the ghost beam with its reach ring, a Jammer's ring on selection, scrubbed by clicks @smoke", async ({ page }) => {
  const jammer: Installation = { id: "jammer1", kind: "jammer", x: -4.4, z: -2.4, integrity: 2, activeFrom: 0, owner: "h1" };
  const e = battle({ enemy: "nest", turn: turnOf("nest", "install"), hp: 40, ...route("router1"), installations: [jammer] });
  await watchTable(page);
  await install(page, e);

  // The Static Nest will plant a Jammer beside the primary router: the forecast names the socket
  // and the table draws the ghost there, with the kind's beam and the dashed 2.0 reach ring.
  const planted = combatPreview(await saved(page)).hostiles[0].install!;
  expect(planted.kind).toBe("jammer");
  await expect(page.locator(".intent-medallion.install-jammer")).toBeVisible();
  await expect(page.locator(".hazard-caption.is-install")).toContainText("JAMMER");
  await expect.poll(async () => (await tableState(page)).ghosts).toEqual([{ x: planted.x, z: planted.z, beam: true, reach: true }]);
  const standing = (await tableState(page)).installations;
  expect(standing).toEqual([expect.objectContaining({ id: "jammer1", kind: "jammer", x: jammer.x, z: jammer.z })]);
  expect((await tableState(page)).selectRing).toBeNull();

  // Clicking the Jammer on the table opens its plate and draws its reach ring around it.
  const at = await tablePoint(page, jammer.x, 1.3, jammer.z);
  await page.mouse.click(at.x, at.y);
  const plate = page.locator("#target-dock .installation-controls");
  await expect(plate).toBeVisible();
  await expect(plate).toContainText("JAMMER");
  await expect(plate.locator(".plate-pips")).toHaveText("◆◆");
  await expect.poll(async () => (await tableState(page)).selectRing).toEqual({ x: jammer.x, z: jammer.z, radius: 2 });

  // Scrub by clicks: one energy per integrity point; the last point destroys it (Reclaim).
  await plate.locator('[data-scrub="jammer1"]').click();
  await expect.poll(async () => (await saved(page)).installations[0]?.integrity).toBe(1);
  await expect(plate.locator(".plate-pips")).toHaveText("◆◇");
  await plate.locator('[data-scrub="jammer1"]').click();
  await expect.poll(async () => (await saved(page)).installations.length).toBe(0);
  const run = await saved(page);
  expect(run.energy).toBe(5 - 2 * 1);
  expect(run.reclaim).toBeGreaterThan(0);
  await expect(plate).toHaveCount(0);
  await expect.poll(async () => (await tableState(page)).installations).toEqual([]);
  await expect.poll(async () => (await tableState(page)).selectRing).toBeNull();
  // The ghost of the next planting still stands where the forecast puts it.
  expect((await tableState(page)).ghosts).toEqual([{ x: planted.x, z: planted.z, beam: true, reach: true }]);
});

test("a worn device opens its repair plate from the table and repairs for its cost", async ({ page }) => {
  const worn = route("router1");
  worn.nodes[0].condition = 1;
  const e = battle({ enemy: "prophet", turn: turnOf("prophet", "strike"), ...worn });
  await watchTable(page);
  await install(page, e);
  await expect(page.locator('.ledger-chip.is-wear [data-repair="router1"]')).toHaveCount(1);
  const at = await tablePoint(page, 0, 1.35, 0);
  await page.mouse.click(at.x, at.y);
  const plate = page.locator("#target-dock .device-controls");
  await expect(plate).toBeVisible();
  await expect(plate).toContainText("ROUTER1");
  await expect(plate.locator(".plate-pips")).toHaveText("◆◇");
  await expect(plate.locator(".plate-pips")).toHaveClass(/is-worn/);
  const repair = plate.locator('.repair-button[data-repair="router1"]');
  await expect(repair).toContainText("◆◇ → ◆◆");
  await repair.click();
  await expect.poll(async () => (await saved(page)).topology.nodes.find(node => node.id === "router1")!.condition).toBe(2);
  expect((await saved(page)).energy).toBe(5 - 1);
  await expect(plate.locator(".plate-pips")).toHaveText("◆◆");
  await expect(plate.locator(".repair-button")).toBeDisabled();
  await expect(page.locator(".ledger-chip.is-wear")).toHaveCount(0);
});

/** A Breaker Charge beside a switch that is off the primary route (the route keeps working). */
function charged(countdown: number) {
  const base = route("router1");
  const nodes: NetworkNode[] = [...base.nodes, { id: "switch1", role: "switch", x: -4.4, z: 0.8 }];
  const charge: Installation = { id: "breaker1", kind: "breaker", x: -4.4, z: 2.4, integrity: 1, activeFrom: 0, owner: "h1", countdown };
  const e = battle({ enemy: "prophet", turn: turnOf("prophet", "strike"), hp: 60, integrity: 60, nodes, links: base.links, installations: [charge] });
  e.run.terrain = clone(table);
  return { e, charge, device: nodes[1] };
}

test("a Breaker Charge counts down on the table, then its detonation breaks the device in reach and leaves wreckage", async ({ page }) => {
  const { e, charge, device } = charged(2);
  await watchTable(page);
  await install(page, e);
  await expect.poll(async () => (await tableState(page)).installations).toEqual([{ id: "breaker1", kind: "breaker", x: charge.x, z: charge.z, countdown: 2, blast: true }]);
  // Its plate reads the countdown and what the next action does.
  const at = await tablePoint(page, charge.x, 1.3, charge.z);
  await page.mouse.click(at.x, at.y);
  const plate = page.locator("#target-dock .installation-controls");
  await expect(plate.locator(".plate-count")).toHaveText("2");
  await expect(plate.locator(".installation-effect")).toContainText("Counts down to 1");

  let run = await saved(page);
  let expected = resolved(run);
  await transmit(page);
  await idle(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.installations[0].countdown).toBe(1);
  await expect.poll(async () => (await tableState(page)).installations[0]?.countdown).toBe(1);

  // Next phase it detonates: the forecast says so before the transmission.
  run = await saved(page);
  const forecast = combatPreview(run);
  expect(forecast.installationEffects).toEqual([expect.objectContaining({ id: "breaker1", effect: "detonate" })]);
  expect(forecast.wear).toEqual([expect.objectContaining({ nodeId: "switch1", breaks: true })]);
  await expect(page.locator(".hazard-caption.is-wear")).toContainText("BREAKS SWITCH1");
  expected = resolved(run);
  await transmit(page);
  await idle(page);
  expect(await saved(page)).toEqual(expected);
  expect(expected.installations).toEqual([]);
  expect(expected.topology.nodes.map(node => node.id)).not.toContain("switch1");
  expect(expected.topology.nodes.map(node => node.id)).toContain("router1");
  // Wreckage where the switch stood and on the charge's own socket, on the table too.
  for (const wreck of [device, charge]) expect(expected.terrain!.debris.some(spot => near(spot, wreck))).toBe(true);
  await expect.poll(async () => {
    const debris = (await tableState(page)).debris;
    return [device, charge].every(wreck => debris.some(spot => near(spot, wreck)));
  }).toBe(true);
  expect((await tableState(page)).installations).toEqual([]);
});

// ------------------------------------------------------------------ designations and messages

test("a hidden designation is revealed on the entrance line when the room is entered", async ({ page }) => {
  const e = newExpedition("architect", 0x5eed1234);
  const room = e.run.map.find(item => item.floor === 0 && item.type === "battle")!;
  room.designations = ["laden"];
  room.designationHidden = true;
  await recordCues(page);
  await install(page, e, { effects: .7 });
  // The chart only shows the static glyph.
  const node = page.locator(`[data-room="${room.id}"]`);
  await expect(node.locator(".room-designation .designation-glyph.unknown")).toBeVisible();
  await expect(node).toHaveAttribute("data-tooltip", /Unknown designation\. Revealed on entry\./);
  await expect(node).not.toHaveAttribute("data-tooltip", /LADEN/);
  // Wait for the effects to decode so the reveal cue is audible when it fires.
  const masters = Object.values(EFFECTS).reduce((sum, cue) => sum + cue.variants, 0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __decoded: number }).__decoded), { timeout: 20000 }).toBe(masters);
  // The title card leaves on its own after a few seconds: take it as it appears.
  const title = page.waitForFunction(() => document.querySelector(".terrain-title.has-entrance")?.outerHTML, undefined, { polling: "raf", timeout: 20000 });
  await node.click();
  const card = String(await (await title).jsonValue());
  await idle(page);
  // The entrance line names the designation: the static glyph gives way to its colour.
  const line = card.match(/<div class="entrance-line is-good is-revealed">.*?<\/div>/s)?.[0] ?? "";
  expect(line, card).toContain("<b>LADEN</b>");
  expect(line).toMatch(/class="entrance-reveal"><svg[^>]*class="designation-mark unknown"/);
  // The hostile's plate wears the ribbon itself now, and the reveal cue played.
  await expect(page.locator('.designation-ribbon.good[data-designation="laden"]')).toBeVisible();
  await expect(page.locator(".designation-ribbon.unknown")).toHaveCount(0);
  await expect.poll(() => cuesPlayed(page)).toContain("reveal");
  const run = await saved(page);
  expect(run.enemies.find(enemy => enemy.role === "single")!.designations).toEqual(["laden"]);
  expect(run.log.join("\n")).toContain(designationEntranceLine("laden", 0));
});

test("a Laden hostile's message opens as a dialog that only a choice resolves", async ({ page }) => {
  const e = pack([
    { id: "spark-mite", port: "left", hp: 20 },
    { id: "serpent", port: "centre", hp: 3, maxHp: 30, extra: { designations: ["laden"] } },
  ], { ...route("router1"), integrity: 40 });
  e.run.integrity = 30;
  await install(page, e);
  const before = await saved(page);
  expect(combatPreview(before).ports.centre!.lethal).toBe(true);
  await transmit(page);
  const dialog = page.locator("dialog.offer-dialog");
  await expect(dialog).toBeVisible();
  const run = await saved(page);
  expect(run.offers).toHaveLength(1);
  const offer = run.offers[0];
  if (offer.kind !== "message") throw new Error(`expected a message, got ${offer.kind}`);
  await expect(dialog.locator("[data-offer]")).toHaveCount(offer.options.length);
  for (const option of offer.options) await expect(dialog).toContainText(messageOptionText(option));
  await expect(dialog.locator(".dialog-close")).toBeHidden();
  // Escape does not dismiss it: only a choice does.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  const expected: RunState = clone(run);
  expect(chooseOffer(expected, 0).ok).toBe(true);
  await page.keyboard.press("1");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await saved(page)).offers.length).toBe(0);
  const after = await saved(page);
  for (const field of ["integrity", "maxIntegrity", "creditLedger", "hand", "drawPile", "discardPile", "deck", "encounterCards"] as const)
    expect(after[field], field).toEqual(expected[field]);
  expect(after.phase).toBe("battle");
});

// ------------------------------------------------------------------ the chart

test("the chart shows designation ribbons, the UNKNOWN glyph and pack ordinals", async ({ page }) => {
  const e = newExpedition("architect", 0x5eed1234);
  const rooms = e.run.map.filter(item => item.floor === 1 && item.type === "battle");
  const [shown, hidden] = rooms;
  shown.designations = ["armored"];
  hidden.designations = ["hungry"];
  hidden.designationHidden = true;
  hidden.pack = ["spark-mite"];
  const good = e.run.map.find(item => item.floor === 2 && item.type === "battle")!;
  good.designations = ["salvaged"];
  await install(page, e);
  await expect(page.locator(".map-screen")).toBeVisible();
  const visible = page.locator(`[data-room="${shown.id}"]`);
  await expect(visible.locator(".room-designation .dg-armored.bad")).toBeVisible();
  await expect(visible).toHaveAttribute("data-tooltip", /ARMORED/);
  const unknown = page.locator(`[data-room="${hidden.id}"]`);
  await expect(unknown.locator(".room-designation .designation-glyph.unknown")).toBeVisible();
  await expect(unknown.locator(".room-designation .dg-hungry")).toHaveCount(0);
  await expect(unknown).toHaveAttribute("data-tooltip", /Unknown designation\. Revealed on entry\./);
  await expect(unknown).not.toHaveAttribute("data-tooltip", /HUNGRY/);
  await expect(unknown.locator(".room-pack")).toHaveText("×2");
  await expect(page.locator(`[data-room="${good.id}"] .room-designation .dg-salvaged.good`)).toBeVisible();
  // The key explains all three marks.
  const legend = page.locator(".map-legend");
  for (const mark of ["Bad designation", "Good designation", "Unknown"]) await expect(legend).toContainText(mark);
  await expect(legend.locator(".legend-mark .designation-mark")).toHaveCount(3);
});

// ------------------------------------------------------------------ reduced motion

test("reduced motion: an announced reinforcement takes its port in place, with its toast", async ({ page }) => {
  const e = battle({ enemy: "serpent", turn: turnOf("serpent", "strike"), hp: 50, ...route("router1"), integrity: 60 });
  e.run.reinforcement = { enemyId: "splicer", after: 1, hp: 12, crate: { kind: "empty" } };
  await watchTable(page);
  await recordToasts(page);
  await install(page, e, { motion: false });
  await expect(page.locator("html")).toHaveClass(/reduced-motion/);
  // Announced a full action ahead, in text.
  await expect(page.locator(".hazard-caption.is-arrival")).toContainText(/SIGNAL DETECTED · Splicer arrives after this action/i);
  const run = await saved(page);
  const expected = resolved(run);
  const arrived = expected.enemies.find(enemy => enemy.id === "splicer")!;
  const started = Date.now();
  await transmit(page);
  await idle(page);
  expect(Date.now() - started).toBeLessThan(8000);
  expect(await saved(page)).toEqual(expected);
  await expect.poll(() => toastsSeen(page)).toContain(`${arrived.name} takes the ${arrived.port.toUpperCase()} port.`);
  await expect(page.locator(".port-strip .port-row")).toHaveCount(2);
  await expect(page.locator(`.port-row[data-port="${arrived.port}"]`)).toContainText(/Splicer/i);
  await expect(page.locator("#world")).toHaveAttribute("data-ports", ["left", "centre", "right"].filter(port => expected.enemies.some(enemy => enemy.port === port && enemy.hp > 0)).join(","));
  await expect.poll(() => page.locator("#intent-layer .hostile-plate:not([hidden])").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.plate).sort())).toEqual(["centre", arrived.port].sort());
});

test("reduced motion: a crate appears where it lands, without a drop arc, and its toast names the contents", async ({ page }) => {
  const e = pack([
    { id: "spark-mite", port: "left", hp: 2, maxHp: 12, extra: { crate: { kind: "credits", amount: 12 } } },
    { id: "serpent", port: "centre", hp: 40 },
  ], { ...route("router1"), integrity: 60 });
  e.run.focus = "left";
  await watchTable(page);
  await recordToasts(page);
  await install(page, e, { motion: false });
  expect(combatPreview(await saved(page)).ports.left!.lethal).toBe(true);
  await trackProps(page);
  await transmit(page);
  await idle(page);
  await expect.poll(() => toastsSeen(page)).toContain("Crate · +12 credits");
  const trail = await propTrail(page);
  expect(trail.length).toBeGreaterThan(0);
  // Every sampled frame has the crate on its landing spot: it appeared in place.
  expect(trail.every(point => near(point, trail[0], 0.01))).toBe(true);
  expect((await saved(page)).creditLedger).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 12 })]));
});

test("reduced motion: a detonation resolves at once, its wreckage is drawn and the history says what broke", async ({ page }) => {
  const { e, charge, device } = charged(1);
  await watchTable(page);
  await install(page, e, { motion: false });
  await expect(page.locator(".hazard-caption.is-wear")).toContainText("BREAKS SWITCH1 · WRECKAGE");
  const expected = resolved(await saved(page));
  const started = Date.now();
  await transmit(page);
  await idle(page);
  expect(Date.now() - started).toBeLessThan(8000);
  expect(await saved(page)).toEqual(expected);
  const debris = (await tableState(page)).debris;
  for (const wreck of [device, charge]) expect(debris.some(spot => near(spot, wreck))).toBe(true);
  await page.locator('[data-action="combat-log"]').click();
  const history = page.locator("dialog");
  await expect(history).toContainText("BREAKER1 detonates.");
  await expect(history).toContainText("SWITCH1 breaks · wreckage remains.");
});
