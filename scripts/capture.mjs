/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
// Run the dev server first, then: node scripts/capture.mjs
import { chromium } from "playwright";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import { mkdir } from "node:fs/promises";
const origin = process.env.FAULTLINE_ORIGIN || "http://127.0.0.1:5174";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "artifacts/title.png" });
  const expedition = newExpedition("architect", 8);
  chooseRoom(expedition.run, "0-1");
  // A reproducible late-deck illustration: signature cards are earned rewards,
  // never guaranteed starter cards. Keep the fixture's piles consistent.
  expedition.run.deck.push("containerlab", "clabernetes");
  expedition.run.hand = ["router", "fiber", "fiber", "containerlab", "clabernetes", "guard"];
  expedition.run.drawPile = [...expedition.run.deck];
  for (const id of expedition.run.hand) {
    expedition.run.drawPile.splice(expedition.run.drawPile.indexOf(id), 1);
  }
  await page.evaluate(
    (e) => localStorage.setItem("faultline-expedition-v2", JSON.stringify(e)),
    expedition,
  );
  await page.reload();
  await page.getByRole("button", { name: /Continue expedition/ }).click();
  await page.mouse.move(500, 60);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "artifacts/battle-opening.png" });
  await page.locator('[data-hand][data-card-id="containerlab"]').hover();
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/containerlab-card.png" });
  await page.locator('[data-hand][data-card-id="clabernetes"]').hover();
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/clabernetes-card.png" });
  await page.locator('[data-hand][data-card-id="containerlab"]').click();
  await page.locator('[data-hand][data-card-id="clabernetes"]').click();
  await page.locator('[data-node="router1"]').click();
  await page.mouse.move(500, 60);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/battle.png" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "artifacts/battle-laptop.png" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "artifacts/battle-full-hd.png" });
  console.log("Desktop captures saved in artifacts/.");
} finally {
  await browser.close();
}
