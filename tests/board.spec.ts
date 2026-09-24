import type { Page } from "@playwright/test";
// Every test also fails on any page or console error (see helpers.ts).
import { expect, install, pack, test, watchTable } from "./helpers.ts";
import { ENEMIES } from "../src/core/enemies.ts";

// The battle board (src/three/board.ts): chosen from the encounter, loaded on demand, its bands lit
// by the game. The test renderer skips the tabletop textures.

/** Board files the page asked for, in order. */
function boardRequests(page: Page): string[] {
  const files: string[] = [];
  page.on("request", request => {
    const match = /models\/(boards\/.+)$/.exec(new URL(request.url()).pathname);
    if (match) files.push(match[1]);
  });
  return files;
}

/** The emission of a band's stencilled name, read from the scene. */
function bandGlow(page: Page, zone: string): Promise<number | null> {
  return page.evaluate(zone => {
    type Node = { children: Node[]; material?: { name: string; emissiveIntensity: number } };
    let glow: number | null = null;
    const walk = (node: Node) => {
      if (node.material?.name === `band_${zone}_label`) glow = node.material.emissiveIntensity;
      node.children.forEach(walk);
    };
    walk((window as unknown as { __table: { scene: Node } }).__table.scene);
    return glow;
  }, zone);
}

test("a leader's battle loads its stage board and crest, and a field card lights the bands", async ({ page }) => {
  const files = boardRequests(page);
  await watchTable(page);
  const e = pack([{ id: "glass-echo", port: "left" }, { id: "widow", port: "centre" }], { hand: ["resonance-field", "guard", "guard"] });
  e.run.stage = 1;
  await install(page, e);
  await expect(page.locator("#world")).toHaveAttribute("data-board", `glass:1:widow:${ENEMIES.widow.color}`);
  expect(files.sort()).toEqual(["boards/crests/widow.glb", "boards/glass.glb"]);
  await expect.poll(() => bandGlow(page, "north")).toBe(0);
  await page.locator('[data-card-id="resonance-field"][data-hand]').click();
  await expect(page.locator("#target-dock [data-field-zone]")).toHaveCount(3);
  await expect.poll(() => bandGlow(page, "north")).toBeGreaterThan(0.3);
  await page.keyboard.press("Escape");
  await expect.poll(() => bandGlow(page, "north")).toBe(0);
});

test("a guardian fights on its own board", async ({ page }) => {
  const files = boardRequests(page);
  await install(page, pack([{ id: "regent", port: "centre", role: "single", hp: 90 }]));
  await expect(page.locator("#world")).toHaveAttribute("data-board", "regent:0:-:-");
  expect(files).toEqual(["boards/regent.glb"]);
});
