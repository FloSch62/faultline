/** Targeting: a click on a hostile (its body, rail plate, intent badge or port-strip row) makes it the
 * target; a delivery picked up from its packet glyph or ledger row goes to the next hostile clicked;
 * every living hostile shows its next action on the table as a badge read from the forecast. */
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
/** Screen position of a delivery's packet glyph on the table. */
async function glyphPoint(page: Page, key: string) {
  await expect.poll(() => page.locator("#world").getAttribute("data-deliveries")).not.toBe("0");
  const at = await page.evaluate(wanted => {
    type Node = { children: Node[]; visible: boolean; isSprite?: boolean; userData: Record<string, unknown>; matrixWorld: { elements: number[] } };
    const scene = (window as unknown as { __table: { scene: Node } }).__table.scene;
    let found: number[] | null = null;
    const walk = (node: Node) => {
      if (node.isSprite && node.visible && node.userData?.deliveryKey === wanted) found = node.matrixWorld.elements.slice(12, 15);
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return found as number[] | null;
  }, key);
  expect(at, `packet glyph ${key}`).not.toBeNull();
  return tablePoint(page, at![0], at![1], at![2]);
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
  // Unaimed deliveries follow the target.
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

test("a delivery picked up from its row goes to the next hostile clicked, then is put down", async ({ page }) => {
  await watchTable(page);
  await install(page, trio());
  const [, second] = combatPreview(await saved(page)).deliveries;
  const row = page.locator(`.delivery-row[data-delivery="${second.channelKey}"]`);
  await row.locator(".delivery-pick").click();
  await expect(row).toHaveClass(/is-selected/);
  await expect(row.locator(".delivery-pick")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#world")).toHaveAttribute("data-armed", second.channelKey);
  await expect(page.locator(".target-hint")).toContainText("Aim Ch 2: click a hostile");
  await expect(page.locator("#intent-layer .hostile-intent.is-aiming")).toHaveCount(3);
  // Hovering a hostile now previews the aim.
  await badge(page, "left").hover();
  await expect(page.locator("#hover-card.visible")).toContainText("Aim Ch 2 here");
  // A click on the hostile's badge aims that delivery; the target stays.
  await badge(page, "left").click();
  await expect.poll(async () => (await saved(page)).aims[second.channelKey]).toBe("left");
  expect((await saved(page)).focus).toBe("centre");
  await expect(row).not.toHaveClass(/is-selected/);
  await expect(page.locator("#world")).toHaveAttribute("data-armed", "");
  await expect(page.locator(".target-hint")).not.toContainText("Aim Ch 2");
  await expect(page.locator(`.port-stud[data-aim="${second.channelKey}"][data-aim-port="left"]`)).toHaveAttribute("aria-pressed", "true");
  // Picked up again, a strip row receives it too.
  await row.locator(".delivery-pick").click();
  await page.locator('.port-row[data-port="right"]').click();
  await expect.poll(async () => (await saved(page)).aims[second.channelKey]).toBe("right");
  expect((await saved(page)).focus).toBe("centre");
});

test("a packet glyph clicked on the table is picked up and aimed by a click on a hostile; dragging still aims", async ({ page }) => {
  await watchTable(page);
  await install(page, trio());
  const [, second] = combatPreview(await saved(page)).deliveries;
  const glyph = await glyphPoint(page, second.channelKey);
  await page.mouse.click(glyph.x, glyph.y);
  await expect(page.locator(`.delivery-row[data-delivery="${second.channelKey}"]`)).toHaveClass(/is-selected/);
  await expect(page.locator("#world")).toHaveAttribute("data-armed", second.channelKey);
  const body = await bodyPoint(page, "right", /Aim Ch 2 here[\s\S]*Splicer/i);
  await page.mouse.click(body.x, body.y);
  await expect.poll(async () => (await saved(page)).aims[second.channelKey]).toBe("right");
  expect((await saved(page)).focus).toBe("centre");
  await expect(page.locator("#world")).toHaveAttribute("data-armed", "");
  // Drag-to-aim: the glyph dropped on the left rail plate.
  const plate = (await tableState(page)).plates.find(item => item.port === "left")!;
  const drop = await tablePoint(page, plate.x, plate.y, plate.z);
  const from = await glyphPoint(page, second.channelKey);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).aims[second.channelKey]).toBe("left");
});

test("Esc puts a picked-up delivery down: the next click targets instead of aiming", async ({ page }) => {
  await install(page, trio());
  const [primary] = combatPreview(await saved(page)).deliveries;
  const row = page.locator(`.delivery-row[data-delivery="${primary.channelKey}"]`);
  await row.locator(".delivery-pick").click();
  await expect(row).toHaveClass(/is-selected/);
  await page.keyboard.press("Escape");
  await expect(row).not.toHaveClass(/is-selected/);
  await expect(page.locator("#world")).toHaveAttribute("data-armed", "");
  await expect(page.locator("dialog")).not.toBeVisible();
  await badge(page, "left").click();
  await expect.poll(async () => (await saved(page)).focus).toBe("left");
  expect((await saved(page)).aims).toEqual({});
  // The row's own toggle and the hint's Esc button put it down as well.
  await row.locator(".delivery-pick").click();
  await row.locator(".delivery-pick").click();
  await expect(row).not.toHaveClass(/is-selected/);
  await row.locator(".delivery-pick").click();
  await page.locator(".target-hint [data-aim-cancel]").click();
  await expect(row).not.toHaveClass(/is-selected/);
  // [ ] pick a delivery up by keyboard and T aims it at the next port, keeping it picked up.
  await page.keyboard.press("]");
  await expect(row).toHaveClass(/is-selected/);
  await page.keyboard.press("t");
  await expect.poll(async () => (await saved(page)).aims[primary.channelKey]).toBe("centre");
  await expect(row).toHaveClass(/is-selected/);
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
  const key = combatPreview(e.run).deliveries[0].channelKey;
  e.run.aims = { [key]: "left" };
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

test("hover cards: a hostile's full forecast and health after the transmission; a delivery's terms and destination", async ({ page }) => {
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
  await page.locator(`.delivery-row[data-delivery="${primary.channelKey}"] .delivery-pick`).hover();
  await expect(card).toContainText("Primary delivery");
  await expect(card).toContainText(String(primary.amount));
  await expect(card).toContainText("follows the target");
  await expect(card).toContainText(primary.terms[0].label);
});
