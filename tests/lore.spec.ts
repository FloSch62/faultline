/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** The Lore book on the main menu: chapters, paintings, the sealed ending and the two films. */
import type { Page } from "@playwright/test";
import { expect, install, test } from "./helpers.ts";

const PROGRESS = "faultline-progress-v1";

/** Reads every chapter in order and checks that its paintings decode. Returns the chapter ids. */
async function readAll(page: Page) {
  const dialog = page.locator("dialog.lore-dialog");
  const chapters = await dialog.locator(".hb-nav [data-lore]:not([disabled])").evaluateAll(els =>
    els.map(el => (el as HTMLElement).dataset.lore!));
  for (const id of chapters) {
    await dialog.locator(`.hb-nav [data-lore="${id}"]`).click();
    await expect(dialog.locator('.hb-nav [aria-current="page"]')).toHaveAttribute("data-lore", id);
    const images = dialog.locator(".hb-chapter img");
    for (let i = 0; i < await images.count(); i++) {
      const image = images.nth(i);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
        { message: `${id}: ${await image.getAttribute("src")}` }).toBe(true);
    }
  }
  return chapters;
}

test("the Lore book opens from the main menu, reads every chapter and keeps its ending sealed until a win @smoke", async ({ page }) => {
  await install(page, null);
  await page.locator('.title-menu [data-action="lore"]').click();
  const dialog = page.locator("dialog.lore-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.hb-nav [aria-current="page"]')).toHaveAttribute("data-lore", "films");
  await expect(dialog.locator("[data-lore-play]")).toHaveCount(2);
  // No keeper has reached the Heart in this browser: the ending keeps its place, unlit.
  await expect(dialog.locator('.hb-nav [data-lore="answer"]')).toBeDisabled();
  const chapters = await readAll(page);
  expect(chapters.length).toBeGreaterThanOrEqual(12);
  expect(chapters).not.toContain("answer");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the Lore ending opens after a win, and a film plays in its frame while the score waits", async ({ page }) => {
  // The test stays offline: the player's page is a blank stand-in.
  await page.route(/youtube(-nocookie)?\.com/, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>player</title>" }));
  await install(page, null, { storage: { [PROGRESS]: JSON.stringify({ cleared: { architect: 0 } }) } });
  await page.locator('.title-menu [data-action="lore"]').click();
  const dialog = page.locator("dialog.lore-dialog");
  await dialog.locator('.hb-nav [data-lore="answer"]').click();
  await expect(dialog.locator('.hb-nav [aria-current="page"]')).toHaveAttribute("data-lore", "answer");
  await expect(dialog.locator(".hb-chapter")).toContainText("GROUND");
  await dialog.locator('.hb-nav [data-lore="films"]').click();
  await dialog.locator('[data-lore-play="whoever-answers"]').click();
  const player = dialog.locator('.lore-film[data-film="whoever-answers"] iframe');
  await expect(player).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/kFDv-0kHv8g\?/);
  await expect(dialog.locator('.lore-film[data-film="night-of-the-fault"] iframe')).toHaveCount(0);
  // Turning the page takes the player away.
  await dialog.locator('.hb-nav [data-lore="line"]').click();
  await expect(dialog.locator("iframe")).toHaveCount(0);
});
