// Moving a device asks first: a drop (or a device-dock band) opens the relocation plate beside the
// device; only Relocate pays the energy. Every test also fails on any page or console error (helpers.ts).
import type { Page } from "@playwright/test";
import { RULES } from "../src/core/cards.ts";
import { ENERGY, battle, expect, idle, install, route, saved, tablePoint, test, watchTable } from "./helpers.ts";

type Spot = { x: number; z: number };

/** Where the table draws a device right now (its hit volume's axis), read from the scene graph. */
function devicePosition(page: Page, id: string): Promise<Spot | null> {
  return page.evaluate(id => {
    type Node = { children: Node[]; userData: Record<string, unknown>; matrixWorld: { elements: number[] } };
    const scene = (window as unknown as { __table: { scene: Node } }).__table.scene;
    let found: Spot | null = null;
    const walk = (node: Node) => {
      if (!found && node.userData?.nodeId === id) {
        const e = node.matrixWorld.elements;
        found = { x: Math.round(e[12] * 100) / 100, z: Math.round(e[14] * 100) / 100 };
      }
      node.children.forEach(walk);
    };
    walk(scene);
    return found;
  }, id);
}
/** Grab a device on the table and drop it on a socket (world units; drops snap to half units). */
async function drag(page: Page, from: Spot, to: Spot) {
  const start = await tablePoint(page, from.x, 0.4, from.z), end = await tablePoint(page, to.x, 0, to.z);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator("#world")).toHaveAttribute("data-cursor", "grabbing");
  await page.mouse.up();
}
/** Keys go to the table, not to a focused button. */
async function press(page: Page, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}
const node = (run: Awaited<ReturnType<typeof saved>>, id: string) => run.topology.nodes.find(n => n.id === id)!;
const selectDevice = (page: Page, id: string) =>
  page.evaluate(id => (window as unknown as { __faultlineHud: { selectNode(id: string): void } }).__faultlineHud.selectNode(id), id);

const NORTH: Spot = { x: 0, z: -2.5 }, SOUTH: Spot = { x: 0, z: 2.5 };
const plate = (page: Page) => page.locator("#relocate-confirm");

test("a dropped device asks first: the plate names the move, Relocate pays 1 energy, Z undoes it", async ({ page }) => {
  await watchTable(page);
  await install(page, battle({ ...route("router1", NORTH.x, NORTH.z) }));
  const before = await saved(page);
  await drag(page, NORTH, SOUTH);
  await expect(plate(page)).toBeVisible();
  await expect(plate(page).locator(".relocate-head")).toContainText("ROUTER1");
  await expect(plate(page).locator(".relocate-head")).toContainText(/North\s*South/);
  await expect(plate(page).locator(".relocate-head")).toContainText(String(RULES.relocateCost));
  await expect(plate(page).locator(".relocate-lines")).toContainText("Damage");
  await expect(plate(page).locator("[data-relocate-confirm]")).toContainText("Enter");
  await expect(plate(page).locator("[data-relocate-cancel]")).toContainText("Esc");
  // Nothing is paid or moved yet; the table already shows the device at its new socket.
  await expect(page.locator(".energy-orb strong")).toHaveText(String(ENERGY));
  expect(await saved(page)).toEqual(before);
  await expect.poll(() => devicePosition(page, "router1")).toEqual(SOUTH);
  await plate(page).locator("[data-relocate-confirm]").click();
  await expect(plate(page)).toHaveCount(0);
  await expect(page.locator(".energy-orb strong")).toHaveText(String(ENERGY - RULES.relocateCost));
  const moved = await saved(page);
  expect(node(moved, "router1")).toMatchObject(SOUTH);
  expect(moved.energy).toBe(ENERGY - RULES.relocateCost);
  await expect(page.locator("#toast")).toContainText("ROUTER1 · NORTH → SOUTH");
  await press(page, "z");
  expect(await saved(page)).toEqual(before);
  await expect.poll(() => devicePosition(page, "router1")).toEqual(NORTH);
});

test("Esc, a click on the table and a right-click each cancel: nothing spent, the device back where it stood", async ({ page }) => {
  await watchTable(page);
  await install(page, battle({ ...route("router1", NORTH.x, NORTH.z) }));
  const before = await saved(page);
  for (const cancel of ["escape", "table", "right-click", "button"] as const) {
    await drag(page, NORTH, SOUTH);
    await expect(plate(page)).toBeVisible();
    await expect.poll(() => devicePosition(page, "router1")).toEqual(SOUTH);
    const at = await tablePoint(page, -3, 0, 0); // west of the device: the plate stands east of it
    if (cancel === "escape") await press(page, "Escape");
    else if (cancel === "table") await page.mouse.click(at.x, at.y);
    else if (cancel === "right-click") await page.mouse.click(at.x, at.y, { button: "right" });
    else await plate(page).locator("[data-relocate-cancel]").click();
    await expect(plate(page), cancel).toHaveCount(0);
    await expect.poll(() => devicePosition(page, "router1"), cancel).toEqual(NORTH);
    await expect(page.locator(".energy-orb strong")).toHaveText(String(ENERGY));
    expect(await saved(page)).toEqual(before);
    // Esc only answered the plate (no Options dialog); the cancelling click started nothing else.
    await expect(page.locator("dialog")).not.toBeVisible();
    await expect(page.locator("#target-dock")).toBeEmpty();
  }
});

test("a device-dock band asks on the same plate with the socket shown; Enter relocates, never transmits", async ({ page }) => {
  await watchTable(page);
  await install(page, battle({ ...route("router1", NORTH.x, NORTH.z) }));
  const before = await saved(page);
  await selectDevice(page, "router1");
  await page.locator('[data-relocate-zone="south"]').click();
  await expect(plate(page)).toBeVisible();
  await expect(plate(page).locator(".relocate-head")).toContainText(/North\s*South/);
  await expect(page.locator('[data-relocate-zone="south"]')).toHaveClass(/active/);
  await expect.poll(async () => (await devicePosition(page, "router1"))?.z ?? 0).toBeGreaterThan(1.3);
  expect(await saved(page)).toEqual(before);
  // Another band re-chooses; the band it stands in withdraws the move.
  await page.locator('[data-relocate-zone="center"]').click();
  await expect(plate(page).locator(".relocate-head")).toContainText(/North\s*Center/);
  await page.locator('[data-relocate-zone="north"]').click();
  await expect(plate(page)).toHaveCount(0);
  await expect.poll(() => devicePosition(page, "router1")).toEqual(NORTH);
  await page.locator('[data-relocate-zone="south"]').click();
  await expect(plate(page)).toBeVisible();
  // Enter with the focus on the table relocates; Enter's usual transmit waits.
  await press(page, "Enter");
  await expect(plate(page)).toHaveCount(0);
  const moved = await saved(page);
  expect(node(moved, "router1").z).toBeGreaterThan(1.3);
  expect(moved.energy).toBe(ENERGY - RULES.relocateCost);
  expect(moved.turn).toBe(before.turn);
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/);
  // The focused Relocate button answers Enter too.
  await selectDevice(page, "router1");
  await page.locator('[data-relocate-zone="center"]').click();
  await expect(plate(page).locator("[data-relocate-confirm]")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(plate(page)).toHaveCount(0);
  expect((await saved(page)).energy).toBe(ENERGY - 2 * RULES.relocateCost);
});

// A band's socket can stand off the drop grid (x 1.25, z 1.8): its own cell still counts as home.
for (const home of [NORTH, { x: 1.25, z: -1.8 }]) {
  test(`dropping a device back in its own socket is free and asks nothing (${home.x}, ${home.z})`, async ({ page }) => {
    await watchTable(page);
    await install(page, battle({ ...route("router1", home.x, home.z) }));
    const before = await saved(page);
    await drag(page, home, home);
    await expect(page.locator("#movement-preview")).toHaveCount(0);
    await expect(plate(page)).toHaveCount(0);
    await expect(page.locator(".energy-orb strong")).toHaveText(String(ENERGY));
    expect(await saved(page)).toEqual(before);
    await expect.poll(() => devicePosition(page, "router1")).toEqual(home);
  });
}

test("without the energy a drop never asks: the rules refuse it and the device stays", async ({ page }) => {
  await watchTable(page);
  await install(page, battle({ ...route("router1", NORTH.x, NORTH.z), energy: 0 }));
  const before = await saved(page);
  const start = await tablePoint(page, NORTH.x, 0.4, NORTH.z), end = await tablePoint(page, SOUTH.x, 0, SOUTH.z);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator("#movement-preview")).toContainText("Not enough energy");
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText(`Relocation costs ${RULES.relocateCost} energy`);
  await expect(plate(page)).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  await expect.poll(() => devicePosition(page, "router1")).toEqual(NORTH);
  await selectDevice(page, "router1");
  for (const zone of ["north", "center", "south"]) await expect(page.locator(`[data-relocate-zone="${zone}"]`)).toBeDisabled();
});

test("playing a card or transmitting withdraws the pending move first", async ({ page }) => {
  await watchTable(page);
  await install(page, battle({ ...route("router1", NORTH.x, NORTH.z), hand: ["guard", "guard", "guard"] }));
  await drag(page, NORTH, SOUTH);
  await expect(plate(page)).toBeVisible();
  await page.locator('[data-hand="0"]').click();
  await expect(plate(page)).toHaveCount(0);
  let run = await saved(page);
  expect(run.block).toBeGreaterThan(0);
  expect(node(run, "router1")).toMatchObject(NORTH);
  expect(run.energy).toBe(ENERGY - 1);
  await drag(page, NORTH, SOUTH);
  await expect(plate(page)).toBeVisible();
  await page.locator('[data-action="transmit"]').click();
  await expect(plate(page)).toHaveCount(0);
  await idle(page);
  run = await saved(page);
  expect(run.turn).toBe(2);
  expect(node(run, "router1")).toMatchObject(NORTH);
});

test("Field Training: the coach still guards the drop, and the plate's buttons work in the lesson", async ({ page }) => {
  await watchTable(page);
  await install(page, null);
  await page.locator('[data-action="tutorial"]').first().click();
  await page.locator('dialog button[data-lesson="bands"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-training", "bands");
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/);
  const router = (await devicePosition(page, "router1"))!;
  const meter = await page.locator(".training-meter").getAttribute("aria-valuenow");
  // Into the storm's marked band: refused at the drop, before any plate.
  await drag(page, router, { x: router.x + 2, z: -3 });
  await expect(page.locator("#toast")).toContainText(/storm strikes NORTH/i);
  await expect(plate(page)).toHaveCount(0);
  await selectDevice(page, "router1");
  await page.locator('[data-relocate-zone="center"]').click();
  await expect(plate(page)).toBeVisible();
  // The coach's spotlight moves onto the plate: the confirmation is the step's one control.
  await expect(page.locator("#lesson-spotlight")).toHaveClass(/active/);
  await expect(plate(page).locator("[data-relocate-confirm]")).toBeVisible();
  await plate(page).locator("[data-relocate-confirm]").click();
  await expect(plate(page)).toHaveCount(0);
  await expect(page.locator(".training-meter")).not.toHaveAttribute("aria-valuenow", meter!);
});
