/** Targeting: a click on a hostile (its portrait, its plate or its port-strip row) makes it the
 * target, and every channel's delivery lands there as one packet (no per-channel aiming); the right
 * plate adds it up and names the overflow. Every living hostile stands on the far rail as a portrait
 * with one plate under it: its name, next move and health, read from the forecast, and nothing drawn
 * over the portrait. */
import type { Page } from "@playwright/test";
import { combatPreview } from "../src/core/run.ts";
import type { NetworkLink, NetworkNode, Port } from "../src/core/types.ts";
import type { Expedition } from "../src/core/expedition.ts";
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

/** A hostile's next move: the plate's move part (lessons spotlight this element). */
const badge = (page: Page, port: string) => page.locator(`#intent-layer .hostile-intent[data-port="${port}"]`);
/** A hostile's whole plate under its portrait. */
const plate = (page: Page, port: string) => page.locator(`#intent-layer .hostile-plate[data-plate="${port}"]`);
type Box = { left: number; top: number; right: number; bottom: number };
/** A portrait's painted box on screen, as drawn this frame (the rail's test hook). */
const portrait = (page: Page, port: string) => page.evaluate(which => (globalThis as unknown as { __faultlineRail: { portrait(port: string): Box | null } }).__faultlineRail.portrait(which), port);
const boxOf = async (page: Page, selector: string): Promise<Box[]> => page.locator(selector).evaluateAll(els => els
  .map(el => el.getBoundingClientRect()).filter(rect => rect.width && rect.height)
  .map(rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })));
const overlaps = (a: Box, b: Box, slack = 0.5) => a.left < b.right - slack && a.right > b.left + slack && a.top < b.bottom - slack && a.bottom > b.top + slack;

/** A point on a hostile's painted body whose hover card names it (the portrait, not its plate). */
async function bodyPoint(page: Page, port: string, name: RegExp) {
  await expect.poll(() => portrait(page, port)).not.toBeNull();
  const box = (await portrait(page, port))!;
  for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.35], [0.5, 0.65], [0.4, 0.5], [0.6, 0.5]]) {
    const at = { x: box.left + (box.right - box.left) * fx, y: box.top + (box.bottom - box.top) * fy };
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
  await expect(page.locator("#intent-layer .hostile-plate.is-target")).toHaveCount(1);
  await expect(plate(page, "centre")).toHaveClass(/is-target/);
  const body = await bodyPoint(page, "right", /Splicer/i);
  await expect(page.locator("#hover-card.visible")).toContainText("Click to target it");
  await page.mouse.click(body.x, body.y);
  await expect.poll(async () => (await saved(page)).focus).toBe("right");
  await expect(page.locator("#world")).toHaveAttribute("data-focus", "right");
  // The target's plate is lit (its crest on the crown); its strip row wears the crest; the detail follows it.
  await expect(plate(page, "right")).toHaveClass(/is-target/);
  await expect(plate(page, "right").locator(".hp-crest")).toHaveCount(1);
  await expect(badge(page, "right")).toHaveClass(/is-target/);
  await expect(page.locator("#intent-layer .hostile-plate.is-target")).toHaveCount(1);
  await expect(page.locator("#intent-layer .hp-crest")).toHaveCount(1);
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

test("a port-strip row and a plate (its move or its health) each target their hostile", async ({ page }) => {
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
  await expect(plate(page, "centre")).toHaveClass(/is-target/);
  await expect(plate(page, "left")).not.toHaveClass(/is-target/);
  await plate(page, "right").locator(".hp-health").click();
  await expect.poll(async () => (await saved(page)).focus).toBe("right");
  await expect(plate(page, "right")).toHaveClass(/is-target/);
  // Hovering a row reads that hostile without targeting it.
  await page.locator('.port-row[data-port="left"]').hover();
  await expect(page.locator("#hover-card.visible")).toContainText(/Spark Mite/);
  await expect(page.locator("#hover-card.visible")).toContainText("STRIKE");
  expect((await saved(page)).focus).toBe("right");
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
  // The target hint shows only while a card is aiming; after a click on a hostile nothing aims.
  await expect(page.locator(".target-hint")).toHaveCount(0);
});

test("the rail: one plate under each portrait with its name, next move and health from the forecast", async ({ page }) => {
  await install(page, trio());
  const forecast = combatPreview(await saved(page));
  await expect(page.locator("#intent-layer .hostile-plate[data-plate]")).toHaveCount(3);
  await expect(page.locator("#intent-layer .hostile-intent[data-port]")).toHaveCount(3);
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
  // Name and health: the bar holds the name and the integrity, the forecast's loss beside it.
  const serpent = forecast.ports.centre!;
  await expect(plate(page, "centre").locator(".hp-name")).toHaveText("Coil Serpent");
  await expect(plate(page, "centre").locator(".hp-now")).toHaveText("40");
  await expect(plate(page, "centre").locator(".hp-verdict")).toHaveText(`−${40 - serpent.hpAfter}`);
  await expect(plate(page, "centre").locator(".hp-loss")).toHaveCount(1);
  await expect(plate(page, "left").locator(".hp-now")).toHaveText("10");
  await expect(plate(page, "left").locator(".hp-verdict")).toHaveCount(0);
  // Each plate hangs under its own portrait: nothing is drawn over a portrait, and the plates keep
  // clear of one another.
  const plates: Record<string, Box> = {};
  for (const port of ["left", "centre", "right"]) plates[port] = (await boxOf(page, `#intent-layer .hostile-plate[data-plate="${port}"]`))[0];
  for (const port of ["left", "centre", "right"]) {
    const body = (await portrait(page, port))!;
    expect(body, `${port} portrait`).not.toBeNull();
    const middle = (body.left + body.right) / 2;
    expect(middle).toBeGreaterThan(plates[port].left);
    expect(middle).toBeLessThan(plates[port].right);
    expect(plates[port].top).toBeGreaterThanOrEqual(body.bottom - 1);
    expect(plates[port].top - body.bottom).toBeLessThan(24);
    for (const other of Object.values(plates)) expect(overlaps(body, other), `${port} portrait vs a plate`).toBe(false);
  }
  expect(overlaps(plates.left, plates.centre)).toBe(false);
  expect(overlaps(plates.centre, plates.right)).toBe(false);
  // Plates take clicks only on themselves: the layer lets the table through.
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

test("a lone hostile has its plate too: a field with its junk rider, no target mark", async ({ page }) => {
  const single = battle({ enemy: "choir", turn: 2, hp: 40, nodes: twoChannels.nodes, links: twoChannels.links });
  await install(page, single);
  const lone = combatPreview(await saved(page)).hostiles[0];
  expect(lone.junk).not.toBeNull();
  await expect(page.locator("#intent-layer .hostile-plate")).toHaveCount(1);
  await expect(page.locator("#intent-layer .hostile-intent")).toHaveCount(1);
  await expect(plate(page, "centre")).not.toHaveClass(/is-target/);
  await expect(plate(page, "centre").locator(".hp-crest")).toHaveCount(0);
  await expect(badge(page, "centre").locator(".hi-verb")).toHaveText(lone.field!.kind === "corrosion" ? "CORRODE" : "SUPPRESS");
  await expect(badge(page, "centre").locator(".hi-target")).toHaveText(lone.field!.zone.toUpperCase());
  await expect(badge(page, "centre").locator(".hi-rider")).toContainText(`+${lone.junk!.count} PACKET LOSS`);
  const body = (await portrait(page, "centre"))!;
  const [under] = await boxOf(page, '#intent-layer .hostile-plate[data-plate="centre"]');
  expect(under.top).toBeGreaterThanOrEqual(body.bottom - 1);
});

test("a hostile that falls this turn is marked on its plate; the plates stay through the phase and its plate leaves as it falls", async ({ page }) => {
  const e = pack([
    { id: "spark-mite", port: "left", hp: 2, maxHp: 12 },
    { id: "serpent", port: "centre", hp: 40 },
  ], { ...twoChannels, integrity: 60 });
  e.run.focus = "left";
  await install(page, e, { motion: true });
  await expect(badge(page, "left")).toHaveClass(/state-falls/);
  await expect(badge(page, "left").locator(".hi-note")).toHaveText("FALLS THIS TURN");
  await expect(plate(page, "left")).toHaveClass(/is-lethal/);
  await expect(plate(page, "left").locator(".hp-verdict")).toHaveText("LETHAL");
  await page.locator('[data-action="transmit"]').click();
  // While the phase plays out the plates stay; the falling hostile's plate leaves with it.
  await expect(page.locator(".game-root")).toHaveClass(/\bbusy\b/);
  await expect(plate(page, "centre")).toBeVisible();
  await expect(plate(page, "left")).toBeHidden({ timeout: 15000 });
  await expect(plate(page, "centre")).toBeVisible();
  await idleOrScreen(page);
  await idle(page);
  await expect(page.locator("#intent-layer")).toBeVisible();
  await expect(page.locator("#intent-layer .hostile-plate")).toHaveCount(1);
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

// ------------------------------------------------------------------ the portraits stand clear

/** Every configuration of the far rail: one, two and three hostiles, a guardian with its adds. */
const rails: [string, () => Expedition][] = [
  ["a lone hostile", () => battle({ enemy: "serpent", hp: 40, ...twoChannels })],
  ["two hostiles", () => pack([{ id: "serpent", port: "centre", hp: 40 }, { id: "ward-node", port: "right", hp: 12 }], { ...twoChannels, integrity: 60 })],
  ["three hostiles", trio],
  ["a guardian and its adds", () => pack([
    { id: "gate-warden", port: "left", hp: 14, role: "add" },
    { id: "regent", port: "centre", hp: 90, maxHp: 120, role: "leader" },
    { id: "gate-warden", port: "right", hp: 14, role: "add" },
  ], { ...twoChannels, integrity: 60 })],
];

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) for (const [name, make] of rails) {
  test(`at ${width}×${height}, ${name}: every portrait stands whole above its plate, nothing over it, plates clear of each other and the HUD`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const e = make();
    await install(page, e);
    const ports = e.run.enemies.map(enemy => enemy.port);
    await expect(page.locator("#intent-layer .hostile-plate:not([hidden])")).toHaveCount(ports.length);
    const plates = await boxOf(page, "#intent-layer .hostile-plate:not([hidden])");
    const hud = await boxOf(page, ".battle-left, .battle-right, .game-header .run-stats, .game-header .header-controls, .encounter-heading, .pile-cluster");
    for (const port of ports) {
      await expect.poll(() => portrait(page, port), { message: `${port} portrait` }).not.toBeNull();
      const body = (await portrait(page, port))!;
      // Whole on screen, larger than a token, and nothing drawn over it.
      expect(body.top, `${port} crown on screen`).toBeGreaterThanOrEqual(0);
      expect(body.bottom - body.top, `${port} height`).toBeGreaterThan(height >= 900 ? 80 : 50);
      for (const box of [...plates, ...hud]) expect(overlaps(body, box, 1), `${port} portrait vs ${JSON.stringify(box)}`).toBe(false);
      // Its own plate hangs just under it.
      const [own] = await boxOf(page, `#intent-layer .hostile-plate[data-plate="${port}"]`);
      const middle = (body.left + body.right) / 2;
      expect(middle > own.left && middle < own.right, `${port} plate under its portrait`).toBe(true);
      expect(own.top - body.bottom, `${port} plate gap`).toBeGreaterThanOrEqual(-1);
      expect(own.top - body.bottom, `${port} plate gap`).toBeLessThan(24);
    }
    for (const [i, a] of plates.entries()) {
      for (const b of plates.slice(i + 1)) expect(overlaps(a, b), "plates collide").toBe(false);
      for (const box of hud) expect(overlaps(a, box), `plate vs HUD ${JSON.stringify(box)}`).toBe(false);
    }
  });
}

test("far-row nameplates, junction seals and installation tags hang below the plates; a lunge never sinks onto its plate", async ({ page }) => {
  test.setTimeout(90_000);
  // A far row: ROUTER1 and ROUTER3 on the north rows, routes merging at ROUTER3, a Jammer beside them.
  const e = pack([
    { id: "spark-mite", port: "left", hp: 12, maxHp: 12 },
    { id: "serpent", port: "centre", hp: 40, turn: turnOf("serpent", "strike") },
  ], {
    nodes: [{ id: "router1", role: "router", x: -3, z: -3.5 }, { id: "router3", role: "router", x: 1, z: -4 }, { id: "router2", role: "router", x: 0, z: 2.5 }],
    links: [{ a: "alpha", b: "router1" }, { a: "router1", b: "router3" }, { a: "router3", b: "omega" }, { a: "alpha", b: "router2" }, { a: "router2", b: "router3" }],
    installations: [{ id: "i1", kind: "jammer", x: 4, z: -3.5, integrity: 2, activeFrom: 0, owner: "h2" }],
    integrity: 60,
  });
  await watchTable(page);
  await install(page, e, { motion: true });
  expect(combatPreview(e.run).sharedDevices.some(item => item.id === "router3")).toBe(true);
  const plates = await boxOf(page, "#intent-layer .hostile-plate:not([hidden])");
  const floor = Math.max(...plates.map(box => box.bottom));
  // Each far-row tag's top on screen (the scene's own sprites, at their world positions).
  const tags = await page.evaluate(() => {
    type Node = { children: Node[]; visible: boolean; isSprite?: boolean; userData: Record<string, any>; matrixWorld: { elements: number[] }; scale: { x: number; y: number }; parent: Node | null };
    const scene = (window as unknown as { __table: { scene: Node } }).__table.scene;
    const found: { name: string; x: number; y: number; z: number; half: number }[] = [];
    const walk = (node: Node) => {
      const own = node.userData?.nodeId ? node.userData.label : node.userData?.installation?.label;
      if (own) {
        const [x, y, z] = own.matrixWorld.elements.slice(12, 15);
        found.push({ name: node.userData.nodeId ?? node.userData.installation.id, x, y, z, half: own.scale.y * 0.31 });
      }
      if (node.userData?.junction !== undefined && node.isSprite) {
        const [x, y, z] = node.matrixWorld.elements.slice(12, 15);
        found.push({ name: "seal", x, y, z, half: node.scale.y * 0.5 });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return found;
  });
  for (const name of ["router1", "router3", "i1", "seal", "alpha", "omega"]) {
    const tag = tags.find(item => item.name === name)!;
    expect(tag, name).toBeTruthy();
    const top = await tablePoint(page, tag.x, tag.y + tag.half, tag.z);
    expect(top.y, `${name} top below the plates`).toBeGreaterThanOrEqual(floor - 1);
  }
  // The Coil Serpent strikes: frame by frame its portrait's foot stays above its plate.
  await page.evaluate(() => {
    const w = window as unknown as { __faultlineRail: { portrait(port: string): { bottom: number } | null }; __sink: number; __frames: number };
    w.__sink = -Infinity;
    w.__frames = 0;
    const sample = () => {
      const plate = document.querySelector('#intent-layer .hostile-plate[data-plate="centre"]:not([hidden])')?.getBoundingClientRect();
      const body = w.__faultlineRail.portrait("centre");
      if (plate && body && document.querySelector("#world")?.getAttribute("data-enemy-action")) {
        w.__sink = Math.max(w.__sink, body.bottom - plate.top);
        w.__frames++;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-action", "strike", { timeout: 15000 });
  await idleOrScreen(page);
  const { sink, frames } = await page.evaluate(() => ({ sink: (window as unknown as { __sink: number }).__sink, frames: (window as unknown as { __frames: number }).__frames }));
  expect(frames).toBeGreaterThan(2);
  expect(sink).toBeLessThanOrEqual(1);
});
