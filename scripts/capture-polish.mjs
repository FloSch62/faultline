/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
// Reproducible presentation captures. Start the preview server before running.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import { RELICS } from "../src/core/cards.ts";

const origin = process.env.FAULTLINE_ORIGIN || "http://127.0.0.1:4174";
const storage = "faultline-expedition-v2";
const expedition = newExpedition("architect", 292);
const run = expedition.run;
chooseRoom(run, "0-1");
run.enemy = { id: "prophet", name: "RUST PROPHET", title: "Corrupts the ground beneath you", hp: 35, maxHp: 35, turn: 0, color: 0xe49b72 };
run.topology.nodes.push(
  { id: "router1", role: "router", x: -2.5, z: 0 },
  { id: "firewall2", role: "firewall", x: 2.5, z: 0 },
  { id: "router3", role: "router", x: 0, z: -2.5 },
);
run.topology.links.push(
  { a: "alpha", b: "router1" }, { a: "router1", b: "firewall2" },
  { a: "firewall2", b: "omega" }, { a: "alpha", b: "router3" }, { a: "router3", b: "omega" },
);
run.nextNodeId = 4;
run.hand = ["resonance-field", "purge-field", "aegis-field", "null-field", "guard", "fiber"];
run.deck.push("resonance-field", "purge-field", "aegis-field", "null-field");
run.drawPile = [...run.deck];
for (const id of run.hand) {
  const index = run.drawPile.indexOf(id);
  if (index >= 0) run.drawPile.splice(index, 1);
}
run.relics = Object.keys(RELICS);
run.zoneEffects = [
  { zone: "center", kind: "resonance", turns: 2 },
  { zone: "center", kind: "corrosion", turns: 2 },
  { zone: "north", kind: "aegis", turns: 3 },
];
run.log = ["Resonance and corrosion share CENTER. Cleanse the ground or move your hardware."];
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const errors = [];
const report = [];
async function capture(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const urls = new Set([...document.querySelectorAll(".scene-backdrop, .card-image, .relic-art")].flatMap(el => [...getComputedStyle(el).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match => match[1])));
    await Promise.all([...urls].map(async src => { const image = new Image(); image.src = src; await image.decode(); }));
  });
  await page.screenshot({ path: `artifacts/fieldcraft-${name}.png`, animations: "disabled" });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(storage => {
    const fixture = sessionStorage.getItem("faultline-capture-fixture");
    if (fixture) localStorage.setItem(storage, fixture);
  }, storage);
  await page.goto(origin);
  await page.evaluate(({ storage, expedition }) => {
    sessionStorage.setItem("faultline-capture-fixture", JSON.stringify(expedition));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: true }));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
  }, { storage, expedition });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.evaluate(() => document.fonts.ready);
  for (const [name, width, height] of [
    ["desktop", 1440, 900], ["laptop", 1366, 768], ["full-hd", 1920, 1080],
    ["tablet", 768, 1024], ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(1, 1);
    await capture(page, name);
    report.push({ name, ...(await page.evaluate(() => {
      const bounds = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return { player: bounds(".player-plate"), enemy: bounds(".enemy-plate"), fields: bounds(".field-strip"), hand: bounds("#hand-zone"), transmit: bounds('[data-action="transmit"]'), scrollWidth: document.documentElement.scrollWidth };
    })) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [id, name, color] of [["widow", "PRISM WIDOW", 0xbd9cdf], ["colossus", "FERRIC COLOSSUS", 0xd69d6e]]) {
    run.enemy = { id, name, hp: 35, maxHp: 35, title: name, turn: 0, color };
    await page.evaluate(({ storage, expedition }) => sessionStorage.setItem("faultline-capture-fixture", JSON.stringify(expedition)), { storage, expedition });
    await page.reload();
    await page.locator('[data-action="continue"]').click();
    await page.waitForFunction(id => document.querySelector(".enemy-plate h2")?.textContent?.toLowerCase().includes(id === "widow" ? "widow" : "colossus"), id);
    await page.mouse.move(1, 1);
    await capture(page, id);
  }
  for (const [name, type] of [["market", "shop"], ["sanctuary", "forge"], ["event", "event"]]) {
    const scene = newExpedition("architect", 293);
    const room = scene.run.map.find(item => item.type === type);
    scene.run.floor = room.floor;
    chooseRoom(scene.run, room.id);
    await page.evaluate(({ storage, scene }) => sessionStorage.setItem("faultline-capture-fixture", JSON.stringify(scene)), { storage, scene });
    await page.reload();
    await page.locator('[data-action="continue"]').click();
    await page.waitForFunction(phase => document.querySelector(".game-root")?.getAttribute("data-view") === phase, scene.run.phase);
    await page.mouse.move(1, 1);
    await capture(page, name);
  }
  await writeFile("artifacts/fieldcraft-layout.json", JSON.stringify({ report, errors }, null, 2) + "\n");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Fieldcraft screenshots and layout report saved in artifacts/.");
} finally {
  await browser.close();
}
