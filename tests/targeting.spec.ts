/** Targeting: a click on a hostile (its body, rail plate, intent badge or port-strip row) makes it the
 * target, and every channel's delivery lands there as one packet (no per-channel aiming); the right
 * plate adds it up and names the overflow; every living hostile shows its next action on the table
 * as a badge read from the forecast. */
import type { Page } from "@playwright/test";
import { combatPreview } from "../src/core/run.ts";
import type { NetworkLink, NetworkNode } from "../src/core/types.ts";
import { battle, expect, idle, idleOrScreen, install, pack, saved, tablePoint, tableState, test, turnOf, watchTable } from "./helpers.ts";

/** Two channels (ALPHA → ROUTER1 → OMEGA, ALPHA → ROUTER2 → OMEGA): a primary and a bandwidth delivery. */
const twoChannels: { nodes: NetworkNode[]; links: NetworkLink[] } = {
  nodes: [{ id: "router1", role: "router", x: -1.5, z: -3 }, { id: "router2", role: "router", x: -1.5, z: 3 }],
  links: [{ a: "alpha", b: "router1" }, { a: "router1", b: "omega" }, { a: "alpha", b: "router2" }, { a: "router2", b: "omega" }],
};
/** Spark Mite (acts: strike), Coil Serpent leading (strike), Splicer (rests this phase). */
const trio = () => pack([
  { id: "spark-mite", port: "left", hp: 10, maxHp: 12 },
  { id: "serpent", port: "centre", hp: 40, turn: turnOf("serpent", "strike") },
  { id: "splicer", port: "right", hp: 14 },
], { ...twoChannels, integrity: 60 });

const badge = (page: Page, port: string) => page.locator(`#intent-layer .hostile-intent[data-port="${port}"]`);

/** A point on a hostile's painted body that its badge does not cover: the one whose hover card names it. */
async function bodyPoint(page: Page, port: string, name: RegExp) {
  const box = (await badge(page, port).boundingBox())!;
  for (const dy of [14, 26, 40, 56, 72]) {
    const at = { x: box.x + box.width / 2, y: box.y - dy };
    await page.mouse.move(at.x, at.y);
    const onCanvas = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id === "world", [at.x, at.y] as const);
    const card = page.locator("#hover-card.visible");
    if (onCanvas && await card.count() && name.test(await card.innerText())) return at;
  }
  throw new Error(`No point on the ${port} hostile's body`);
}
test("clicking a hostile's body targets it; clicking the target again changes nothing", async ({ page }) => {
  await watchTable(page);
  await install(page, trio());
  await expect(page.locator("#world")).toHaveAttribute("data-focus", "centre");
  await expect(page.locator("#intent-layer .hostile-intent.is-target")).toHaveCount(1);
  await expect(badge(page, "centre")).toHaveClass(/is-target/);
  const body = await bodyPoint(page, "right", /Splicer/i);
  await expect(page.locator("#hover-card.visible")).toContainText("Click to target it");
  await page.mouse.click(body.x, body.y);
  await expect.poll(async () => (await saved(page)).focus).toBe("right");
  await expect(page.locator("#world")).toHaveAttribute("data-focus", "right");
  // The target wears the tag on its badge and the lit crest on its strip row; the detail follows it.
  await expect(badge(page, "right")).toHaveClass(/is-target/);
  await expect(badge(page, "right").locator(".hi-tag")).toHaveText(/TARGET/);
  await expect(page.locator("#intent-layer .hostile-intent.is-target")).toHaveCount(1);
  await expect(page.locator('.port-row[data-port="right"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.port-row[data-port="right"] .row-crest')).toHaveCount(1);
  await expect(page.locator(".port-detail h2")).toContainText(/Splicer/i);
  // Every delivery follows the target.
  expect(combatPreview(await saved(page)).deliveries.every(item => item.port === "right")).toBe(true);
  // The target again: nothing changes.
  const before = await saved(page);
  await page.mouse.click(body.x, body.y);
  await page.waitForTimeout(250);
  expect(await saved(page)).toEqual(before);
});

test("a port-strip row and an intent badge each target their hostile", async ({ page }) => {
  await install(page, trio());
  const row = page.locator('.port-row[data-port="left"]');
  await expect(row).toHaveAttribute("aria-label", /^Target the left port, Spark Mite/);
  await row.click();
  await expect.poll(async () => (await saved(page)).focus).toBe("left");
  await expect(page.locator('.port-row[data-port="left"]')).toHaveClass(/is-target/);
  await expect(page.locator('.port-row[data-port="left"]')).toHaveAttribute("aria-label", /^Your target: the left port, Spark Mite/);
  await expect(page.locator(".port-detail h2")).toContainText(/Spark Mite/i);
  await badge(page, "centre").click();
  await expect.poll(async () => (await saved(page)).focus).toBe("centre");
  await expect(badge(page, "centre")).toHaveClass(/is-target/);
  await expect(badge(page, "left")).not.toHaveClass(/is-target/);
  // Hovering a row reads that hostile without targeting it.
  await page.locator('.port-row[data-port="right"]').hover();
  await expect(page.locator("#hover-card.visible")).toContainText(/Splicer/);
  await expect(page.locator("#hover-card.visible")).toContainText("RESTS");
  expect((await saved(page)).focus).toBe("centre");
});

test("every channel lands on the target: the plate adds the channels into one packet and names the overflow", async ({ page }) => {
  // The Spark Mite needs 4 of the 8: targeted, it falls and 4 overflow into the leader.
  const e = pack([
    { id: "spark-mite", port: "left", hp: 4, maxHp: 12 },
    { id: "serpent", port: "centre", hp: 40, turn: turnOf("serpent", "strike") },
    { id: "splicer", port: "right", hp: 14 },
  ], { ...twoChannels, integrity: 60 });
  await install(page, e);
  let forecast = combatPreview(await saved(page));
  const landing = page.locator(".enemy-plate .landing");
  // On the leader: both channels in their colours, summed, nothing overflows.
  await expect(landing.locator(".landing-channel")).toHaveCount(forecast.deliveries.length);
  for (const [i, d] of forecast.deliveries.entries()) await expect(landing.locator(".landing-channel b").nth(i)).toHaveText(String(d.amount));
  await expect(landing.locator(".landing-total")).toHaveText(String(forecast.ports.centre!.packet));
  await expect(landing.locator(".landing-overflow")).toHaveCount(0);
  // No per-channel aiming anywhere: no rows, studs, pick-ups or armed table.
  await expect(page.locator(".delivery-row, .port-stud, [data-aim], [data-aim-cancel], .delivery-pick")).toHaveCount(0);
  expect(await page.locator("#world").getAttribute("data-armed")).toBeNull();
  // Target the Mite: the whole packet moves with the target, the surplus overflows to the leader.
  await badge(page, "left").click();
  await expect.poll(async () => (await saved(page)).focus).toBe("left");
  forecast = combatPreview(await saved(page));
  expect(forecast.deliveries.every(item => item.port === "left")).toBe(true);
  const left = forecast.ports.left!;
  expect(left.lethal).toBe(true);
  expect(left.overflowOut).toBe(forecast.deliveries.reduce((sum, d) => sum + d.amount, 0) - 4);
  await expect(landing.locator(".landing-total")).toHaveText(String(left.packet));
  await expect(landing.locator(".landing-total")).toHaveClass(/is-lethal/);
  await expect(landing.locator(".landing-overflow")).toContainText(`overflow ${left.overflowOut} → CENTRE`);
  await expect(landing).toHaveAttribute("aria-label", new RegExp(`overflow ${left.overflowOut} to the centre port`));
  await expect(page.locator(".transmit-button .transmit-note")).toContainText("overflow → CENTRE");
  // The old aim keys do nothing; F still moves the target.
  const before = await saved(page);
  for (const key of ["t", "[", "]"]) await page.keyboard.press(key);
  await page.waitForTimeout(150);
  expect(await saved(page)).toEqual(before);
  await page.keyboard.press("f");
  await expect.poll(async () => (await saved(page)).focus).toBe("centre");
  // The plate's channel reads its own card: terms, route and the packet it joins. Read only.
  const [primary] = forecast.deliveries;
  await landing.locator(".landing-channel").first().hover();
  const card = page.locator("#hover-card.visible");
  await expect(card).toContainText("Primary channel");
  await expect(card).toContainText(String(primary.amount));
  await expect(card).toContainText("Lands on your target");
  await expect(card).toContainText(primary.terms[0].label);
  await expect(card).not.toContainText(/aim|click/i);
});

test("a click on a hostile always targets it, even right after hovering a channel", async ({ page }) => {
  await watchTable(page);
  await install(page, trio());
  await page.locator(".enemy-plate .landing .landing-channel").nth(1).hover();
  const body = await bodyPoint(page, "right", /Splicer/i);
  await page.mouse.click(body.x, body.y);
  await expect.poll(async () => (await saved(page)).focus).toBe("right");
  expect("aims" in await saved(page)).toBe(false);
  await expect(page.locator(".target-hint")).not.toContainText(/Aim/);
});

test("intent badges: one per living hostile over its rail plate, verb and number from the forecast", async ({ page }) => {
  await watchTable(page);
  await install(page, trio());
  const forecast = combatPreview(await saved(page));
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(3);
  for (const port of ["left", "centre"] as const) {
    const h = forecast.hostiles.find(item => item.port === port)!;
    expect(h.state).toBe("acts");
    await expect(badge(page, port).locator(".hi-verb")).toHaveText("STRIKE");
    await expect(badge(page, port).locator(".hi-value")).toHaveText(String(h.raw));
  }
  // The Spark Mite's swarm bonus is in its number: 1 + one per other living hostile.
  await expect(badge(page, "left").locator(".hi-value")).toHaveText("3");
  await expect(badge(page, "right")).toHaveClass(/state-rests/);
  await expect(badge(page, "right").locator(".hi-verb")).toHaveText("RESTS");
  await expect(badge(page, "right").locator(".hi-target")).toHaveText("acts next phase");
  // Each badge hangs just above its own rail plate.
  const plates = (await tableState(page)).plates;
  for (const port of ["left", "centre", "right"]) {
    const plate = plates.find(item => item.port === port)!;
    const centre = await tablePoint(page, plate.x, plate.y, plate.z);
    const box = (await badge(page, port).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - centre.x)).toBeLessThan(6);
    expect(box.y + box.height).toBeLessThan(centre.y);
    expect(box.y + box.height).toBeGreaterThan(centre.y - 60);
  }
  // Badges take clicks only on themselves: the layer lets the table through.
  expect(await page.locator("#intent-layer").evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
});

test("badges name a jam and an installation by their targets", async ({ page }) => {
  const e = pack([
    { id: "ward-node", port: "left", hp: 12 },
    { id: "nest", port: "centre", hp: 40, turn: turnOf("nest", "install") },
  ], { ...twoChannels, integrity: 60 });
  await install(page, e);
  const forecast = combatPreview(await saved(page));
  const ward = forecast.hostiles.find(item => item.port === "left")!;
  expect(ward.jams.length).toBe(1);
  await expect(badge(page, "left").locator(".hi-verb")).toHaveText("JAM");
  await expect(badge(page, "left").locator(".hi-target")).toHaveText(ward.jams[0].toUpperCase());
  const nest = forecast.hostiles.find(item => item.port === "centre")!;
  await expect(badge(page, "centre").locator(".hi-verb")).toHaveText(`PLANT ${nest.install!.kind === "jammer" ? "JAMMER" : nest.install!.kind.toUpperCase()}`);
  await expect(badge(page, "centre")).toHaveClass(/kind-install-jammer/);
  await expect(badge(page, "centre").locator(".hi-target")).toHaveText(/NORTH|CENTER|SOUTH|\+1|bitten|absorbed/);
});

test("a lone hostile has its badge too: a field with its junk rider, no target tag", async ({ page }) => {
  const single = battle({ enemy: "choir", turn: 2, hp: 40, nodes: twoChannels.nodes, links: twoChannels.links });
  await install(page, single);
  const lone = combatPreview(await saved(page)).hostiles[0];
  expect(lone.junk).not.toBeNull();
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(1);
  await expect(badge(page, "centre")).not.toHaveClass(/is-target/);
  await expect(badge(page, "centre").locator(".hi-verb")).toHaveText(lone.field!.kind === "corrosion" ? "CORRODE" : "SUPPRESS");
  await expect(badge(page, "centre").locator(".hi-target")).toHaveText(lone.field!.zone.toUpperCase());
  await expect(badge(page, "centre").locator(".hi-rider")).toContainText(`+${lone.junk!.count} PACKET LOSS`);
});

test("a hostile that falls this turn is marked on its badge, and its badge leaves with it", async ({ page }) => {
  const e = pack([
    { id: "spark-mite", port: "left", hp: 2, maxHp: 12 },
    { id: "serpent", port: "centre", hp: 40 },
  ], { ...twoChannels, integrity: 60 });
  e.run.focus = "left";
  await install(page, e, { motion: true });
  await expect(badge(page, "left")).toHaveClass(/state-falls/);
  await expect(badge(page, "left").locator(".hi-note")).toHaveText("FALLS THIS TURN");
  await page.locator('[data-action="transmit"]').click();
  // Stale while the phase plays out: the layer hides.
  await expect(page.locator("#intent-layer")).toBeHidden();
  await idleOrScreen(page);
  await idle(page);
  await expect(page.locator("#intent-layer")).toBeVisible();
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(1);
  await expect(badge(page, "left")).toHaveCount(0);
  await expect(badge(page, "centre")).toBeVisible();
});

test("outside a battle the intent layer is empty", async ({ page }) => {
  const e = battle({ enemy: "leech", hp: 1, nodes: twoChannels.nodes, links: twoChannels.links });
  await install(page, e);
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(1);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "reward", { timeout: 25000 });
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(0);
  await expect(page.locator("#intent-layer")).toBeHidden();
});

test("hover cards: a hostile's full forecast and health after the transmission; a channel's terms and destination", async ({ page }) => {
  await install(page, trio());
  const forecast = combatPreview(await saved(page));
  await badge(page, "centre").hover();
  const card = page.locator("#hover-card.visible");
  await expect(card).toContainText("Coil Serpent");
  await expect(card).toContainText("Leader · centre port");
  await expect(card).toContainText(`${forecast.ports.centre!.hpAfter}`);
  await expect(card).toContainText("after this transmission");
  await expect(card).toContainText("Your target");
  for (const d of forecast.deliveries) await expect(card).toContainText(d.primary ? "Primary" : `Ch ${d.index + 1}`);
  const [primary] = forecast.deliveries;
  await page.locator(`.landing-channel[data-hover-delivery="${primary.channelKey}"]`).hover();
  await expect(card).toContainText("Primary channel");
  await expect(card).toContainText(String(primary.amount));
  await expect(card).toContainText("Lands on your target");
  await expect(card).toContainText(primary.terms[0].label);
});
