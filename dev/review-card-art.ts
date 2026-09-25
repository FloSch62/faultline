/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
// Visual review against the actual card renderer. Run after installing the selected PNGs.
// node --experimental-strip-types dev/review-card-art.ts [baseURL]
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { BASE_CARD_IDS, baseCard } from "../src/core/cards.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import type { CardId } from "../src/core/types.ts";

const baseURL = process.argv[2] ?? "http://127.0.0.1:5186/";
const out = new URL("../artifacts/card-art-review/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../docs/art-v3-manifest.json", import.meta.url), "utf8"));
const replacementIds: string[] = manifest.cards.map((card: { id: string }) => card.id);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => {
    if (response.status() >= 400 && /\/art\//.test(response.url())) errors.push(response.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: true }));
  });
  await page.goto(baseURL);
  await page.locator('[data-action="collection"]').click();
  const pictures = async () => page.locator("dialog [data-card-id]").evaluateAll(elements =>
    elements.map(element => {
      const picture = element.querySelector(".card-image")!;
      const style = getComputedStyle(picture);
      return { id: (element as HTMLElement).dataset.cardId!,
        key: [style.backgroundImage, style.backgroundPosition, style.backgroundSize].join("|"),
        image: style.backgroundImage, filter: style.filter };
    }));
  const base = await pictures();
  assert.equal(base.length, BASE_CARD_IDS.length);
  assert.equal(new Set(base.map(card => card.key)).size, base.length, "Base cards must have distinct paintings");
  assert.equal(await page.locator(".card-sigil").count(), 0, "Paintings must be unobscured");
  const dimensions = await page.evaluate(async images => Promise.all(images.map(async background => {
    const src = background.slice(5, -2);
    const image = new Image();
    image.src = src;
    await image.decode();
    return { src, width: image.naturalWidth, height: image.naturalHeight };
  })), [...new Set(base.map(card => card.image))]);
  assert.ok(dimensions.every(image => image.width > 0 && image.height > 0));
  await page.locator('[data-rarity="upgraded"]').click();
  for (const card of await pictures()) {
    assert.equal(card.key, base.find(original => original.id === baseCard(card.id as CardId))?.key,
      `Upgrade must retain the base painting: ${card.id}`);
  }
  await page.locator('[data-rarity="all"]').click();
  const cards = await page.locator("dialog [data-card-id]").evaluateAll(elements =>
    Object.fromEntries(elements.map(element => [(element as HTMLElement).dataset.cardId!, element.outerHTML])));
  // Retain real card markup and CSS; only arrange the review sheet.
  await page.locator("#dialog-content").evaluate((element, { cards, ids }) => {
    element.innerHTML = '<h2>Card artwork review</h2><div class="collection-grid">' +
      ids.map(id => '<div class="collection-entry">' + cards[id] + "</div>").join("") + "</div>";
  }, { cards, ids: replacementIds });
  await page.addStyleTag({ content: `
    dialog#dialog { position:absolute; inset:0 auto auto 0; margin:0; width:1280px; max-width:none; max-height:none; height:auto; overflow:visible; }
    .dialog-surface, #dialog-content { max-height:none !important; overflow:visible !important; }
    .collection-grid { grid-template-columns:repeat(5, 1fr) !important; gap:24px !important; }
  ` });
  await page.locator("#dialog").screenshot({ path: new URL("cards.png", out).pathname });
  await page.close();

  // Check the hand at both desktop sizes, using a real saved encounter.
  const expedition = newExpedition("architect", 924);
  chooseRoom(expedition.run, "0-1");
  expedition.run.bossIntroSeen = true;
  expedition.run.hand = ["honeypot", "cache-server", "poe-injector", "load-balancer", "failover-policy", "quarantine-rule"];
  expedition.run.energy = 10;
  const battle = await browser.newPage();
  battle.on("pageerror", error => errors.push(error.message));
  await battle.addInitScript(expedition => {
    localStorage.setItem("faultline-expedition-v2", JSON.stringify(expedition));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: true }));
  }, expedition);
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    await battle.setViewportSize({ width, height });
    await battle.goto(baseURL);
    await battle.locator('[data-action="continue"]').click();
    await battle.locator('#world[data-enemy-state="idle"]').waitFor();
    await battle.locator('[data-hand]').first().waitFor();
    await battle.locator('#hand-zone .card-image').evaluateAll(async pictures => {
      await Promise.all(pictures.map(async picture => {
        const image = new Image();
        image.src = getComputedStyle(picture).backgroundImage.slice(5, -2);
        await image.decode();
      }));
    });
    await battle.mouse.move(2, 2);
    await battle.locator('.terrain-title').waitFor({ state: 'detached' });
    await battle.screenshot({ path: new URL(`battle-${width}x${height}.png`, out).pathname });
  }
  assert.deepEqual(errors, []);
  const report = { baseCards: base.length, distinctPaintings: new Set(base.map(card => card.key)).size,
    decodedImages: dimensions, replacementIds, desktopSizes: ["1366x768", "1920x1080"], errors };
  await writeFile(new URL("report.json", out), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ cards: report.baseCards, distinctPaintings: report.distinctPaintings, replacements: replacementIds.length, errors }));
} finally {
  await browser.close();
}
