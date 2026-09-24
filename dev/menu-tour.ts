// Dev-only screenshot tour of every screen, menu and dialog, for visual review. Not shipped.
// Usage: node --experimental-strip-types dev/menu-tour.ts <outDir> [WxH] [only,names]
// BASE defaults to the dev server at http://127.0.0.1:5174/
import { chromium, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { makeEnemy } from "../src/core/encounter.ts";
import { chooseRoom } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { EVENTS } from "../src/core/events.ts";
import { RELICS } from "../src/core/cards.ts";
import { createMap, connectsTo } from "../src/core/map.ts";
import type { RelicId, RoomType } from "../src/core/types.ts";

const out = process.argv[2] ?? "artifacts/tour";
const [width, height] = (process.argv[3] ?? "1440x900").split("x").map(Number);
const only = process.argv[4]?.split(",");
const base = process.env.BASE ?? "http://127.0.0.1:5174/";
await mkdir(out, { recursive: true });

function battleSave(enemy = "leech", boss = false): Expedition {
  const e = newExpedition("architect", 924);
  chooseRoom(e.run, "0-1");
  e.run.enemies = [{ ...makeEnemy(enemy, "h1", "centre", "single", 40), hp: 34 }];
  e.run.focus = "centre";
  void ENEMIES;
  e.run.bossIntroSeen = !boss;
  e.run.topology.nodes.push(
    { id: "router1", role: "router", x: 0, z: 0 },
    { id: "switch2", role: "switch", x: -2.5, z: -2.4 },
    { id: "firewall3", role: "firewall", x: 2.5, z: 2.4 },
  );
  e.run.topology.links.push(
    { a: "alpha", b: "router1" }, { a: "router1", b: "omega" },
    { a: "alpha", b: "switch2" }, { a: "switch2", b: "router1" },
  );
  e.run.nextNodeId = 4;
  e.run.hand = ["router", "fiber", "guard", "containerlab", "wireshark", "resonance-field"];
  e.run.relics = Object.keys(RELICS).slice(0, 5) as typeof e.run.relics;
  e.run.credits = 87;
  e.run.log = ["Signal connected.", "The route holds."];
  return e;
}
/** A crowded table: a nine-card hand with long names, junk, a curse, an upgrade and a protocol,
 * plus malware, an armed protocol and fields for the ledger and the seals. */
function crowdedSave(): Expedition {
  const e = battleSave();
  e.run.hand = ["deep-inspection", "resonance-field", "bastion", "guard+", "failover-policy", "packet-loss", "cve", "worm", "ecmp"] as typeof e.run.hand;
  e.run.protocols = ["rate-limiter"] as typeof e.run.protocols;
  e.run.installations = [{ id: "tap1", kind: "tap", x: -5, z: -3.2, integrity: 1, activeFrom: 0, owner: "h1" }];
  e.run.zoneEffects = [{ zone: "center", kind: "resonance", turns: 3 }, { zone: "north", kind: "suppression", turns: 2 }];
  e.run.packetBoost = 3;
  e.run.turn = 2;
  return e;
}
function roomSave(type: RoomType): Expedition {
  const e = newExpedition("warden", 0x5eed1234);
  const room = e.run.map.find(item => item.type === type)!;
  e.run.floor = room.floor;
  e.run.lastRoom = null;
  chooseRoom(e.run, room.id);
  e.run.credits = 140;
  return e;
}

/** A run part-way up a stage's chart, with a cleared trail behind it. */
function midMap(stage = 1, floor = 3): Expedition {
  const e = newExpedition("warden", 0x5eed1234);
  e.run.stage = stage;
  e.run.map = createMap(stage, e.run.seed);
  let last = e.run.map.find(room => room.floor === 0)!;
  for (let f = 0; f < floor; f++) {
    last.cleared = true;
    e.run.lastRoom = last.id;
    last = e.run.map.find(room => room.floor === f + 1 && connectsTo(last, room))!;
  }
  e.run.floor = floor;
  e.run.relics.push("watchdog", "spanning-tree", "credit-line");
  e.run.credits = 96;
  e.run.integrity = 11;
  return e;
}
/** The last guardian's spoils: skipping them ends the expedition in victory. */
function finalReward(): Expedition {
  const e = midMap(2, 6);
  const boss = e.run.map.find(room => room.type === "boss")!;
  e.run.currentRoom = boss.id;
  e.run.phase = "reward";
  e.run.cardRewards = ["router", "fiber", "guard"];
  e.run.score = 18420;
  return e;
}

type Shot = { name: string; save?: Expedition | null; training?: string[]; go: (page: Page) => Promise<void> };
const dialog = (action: string) => async (page: Page) => {
  await page.locator(`[data-action="${action}"]`).first().click();
  await page.waitForTimeout(500);
};
/** Play lesson 1 up to its transmission with the real controls (as tests/training.spec.ts does). */
async function firstLesson(page: Page) {
  await dialog("tutorial")(page);
  await page.locator('dialog button[data-lesson="first-signal"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-hand][data-card-id="router"]').first().click();
  await page.locator('#target-dock [data-action="auto-place"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-hand][data-card-id="fiber"]').first().click();
  const router = (await page.locator("#target-dock [data-node]").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.node!))).find(id => id.startsWith("router"))!;
  await page.keyboard.press("Escape");
  for (const [a, b] of [["alpha", router], [router, "omega"]]) {
    await page.locator('[data-hand][data-card-id="fiber"]').first().click();
    await page.locator(`#target-dock [data-node="${a}"]`).click();
    await page.locator(`#target-dock [data-node="${b}"]`).click();
    await page.waitForTimeout(400);
  }
}
const chapter = (id: string, scroll = 0) => async (page: Page) => {
  await dialog("help")(page);
  await page.locator(`dialog .hb-nav [data-handbook="${id}"]`).click();
  await page.locator("dialog .dialog-surface").evaluate((el, y) => el.scrollTo(0, y), scroll);
  await page.waitForTimeout(400);
};
const shots: Shot[] = [
  { name: "01-title", save: null, go: async () => {} },
  { name: "02-title-continue", save: battleSave(), go: async () => {} },
  { name: "03-settings-title", save: null, go: dialog("settings") },
  { name: "02b-title-hover", save: battleSave(), go: async page => { await page.locator('[data-action="new"]').hover(); await page.waitForTimeout(400); } },
  { name: "02c-now-playing", save: null, go: async page => { await dialog("settings")(page); await page.locator('[data-setting="music"]').fill("40"); await page.locator('.settings-actions [data-action="close"]').click(); await page.waitForTimeout(1500); } },
  { name: "04-credits", save: null, go: async page => { await dialog("settings")(page); await dialog("credits")(page); } },
  { name: "05-select", save: null, go: dialog("new") },
  { name: "05c-select-ascension", save: null, go: async page => { await dialog("new")(page); await page.evaluate(() => localStorage.setItem("faultline-progress-v1", JSON.stringify({ cleared: { ghost: 4 } }))); await page.locator('[data-archetype="ghost"]').click(); await page.locator('[data-screen="ascension"][data-level="3"]').click(); await page.locator('[data-screen="ascension"][data-level="4"]').hover(); await page.waitForTimeout(500); } },
  { name: "05b-select-daily", save: null, go: async page => { await dialog("daily")(page); await page.locator('[data-archetype="warden"]').hover(); await page.waitForTimeout(400); } },
  { name: "06-collection", save: null, go: dialog("collection") },
  { name: "07-handbook", save: null, go: dialog("help") },
  { name: "08-training", save: null, go: dialog("tutorial") },
  { name: "09-replace", save: battleSave(), go: async page => { await dialog("new")(page); await page.locator('[data-action="embark"]').click(); await page.waitForTimeout(500); } },
  { name: "10-map", save: newExpedition("ghost", 392), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "10b-map-options", save: newExpedition("ghost", 392), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await dialog("settings")(page); } },
  { name: "11-battle", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1600); } },
  { name: "11a-battle-terrain", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.mouse.move(700, 600); await page.locator(".terrain-title").waitFor(); await page.evaluate(() => { const title = document.querySelector(".terrain-title")!.cloneNode(true) as HTMLElement; title.classList.remove("leaving"); document.querySelector(".game-root")!.append(title); }); await page.waitForTimeout(300); } },
  { name: "11b-battle-crowded", save: crowdedSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(4200); await page.mouse.move(5, 300); await page.waitForTimeout(300); } },
  { name: "11c-battle-selected", save: crowdedSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.mouse.move(5, 300); await page.keyboard.press("2"); await page.waitForTimeout(500); } },
  { name: "11d-battle-console", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.mouse.move(5, 300); await page.keyboard.press("c"); await page.waitForTimeout(500); } },
  { name: "11e-battle-guardian", save: (() => { const e = battleSave("regent"); e.run.enemies[0].hp = 60; e.run.enemies[0].maxHp = 80; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(4200); await page.mouse.move(5, 300); await page.waitForTimeout(300); } },
  { name: "11f-battle-toast", save: crowdedSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.mouse.move(5, 300); await page.keyboard.press("6"); await page.waitForTimeout(400); } },
  { name: "11g-battle-ultimate", save: (() => { const e = battleSave("regent"); e.run.enemies[0].hp = 38; e.run.enemies[0].maxHp = 80; e.run.enemies[0].turn = 5; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(4200); await page.mouse.move(5, 300); await page.waitForTimeout(300); } },
  { name: "11h-battle-charge", save: (() => { const e = battleSave("regent"); e.run.enemies[0].hp = 38; e.run.enemies[0].maxHp = 80; e.run.enemies[0].turn = 4; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(4200); await page.mouse.move(5, 300); await page.waitForTimeout(300); } },
  { name: "12-battle-settings", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.keyboard.press("Escape"); await page.waitForTimeout(500); } },
  { name: "13-combat-details", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("combat-details")(page); } },
  { name: "14-devices", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("devices")(page); } },
  { name: "15-dossier", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("enemy-dossier")(page); } },
  { name: "16-relic-journal", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("relic-journal")(page); } },
  { name: "17-deck", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("deck")(page); } },
  { name: "18-inspect", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.locator("[data-hand]").nth(3).click({ button: "right" }); await page.waitForTimeout(500); } },
  { name: "19-prepare", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.keyboard.press("p"); await page.waitForTimeout(500); } },
  { name: "20-tooltip", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.locator(".relic-token").first().hover(); await page.waitForTimeout(600); } },
  { name: "21-boss-intro", save: battleSave("regent", true), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1600); } },
  { name: "22-reward", save: roomSave("cache"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "23-sanctuary", save: roomSave("forge"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "24-market", save: roomSave("shop"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "25-event", save: (() => { const e = roomSave("event"); return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "26-relic-choice", save: (() => { const e = roomSave("cache"); e.run.phase = "relic"; e.run.relicRewards = Object.keys(RELICS).slice(0, 3) as typeof e.run.relicRewards; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  // Finished runs are never offered to Continue: play the last beat instead.
  { name: "27-lost", save: (() => { const e = battleSave(); e.run.integrity = 1; e.run.block = 0; e.run.relics = []; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.locator('[data-action="transmit"]').click(); await page.waitForTimeout(2600); } },
  { name: "28-won", save: finalReward(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator('[data-action="skip-reward"]').click(); await page.waitForTimeout(1200); } },
  { name: "29-lesson", save: null, go: async page => { await dialog("tutorial")(page); await page.locator("[data-lesson]").first().click(); await page.waitForTimeout(1600); } },
  { name: "30-walkthrough", save: null, go: async page => { await dialog("tutorial")(page); await page.locator("[data-lesson]").last().click(); await page.waitForTimeout(700); } },
  { name: "31-archive-inspect", save: null, go: async page => { await dialog("collection")(page); await page.locator('[data-rarity="upgraded"]').click(); await page.locator("dialog [data-collection]").nth(3).click(); await page.waitForTimeout(600); } },
  { name: "32-toast", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.keyboard.press("z"); await page.waitForTimeout(300); } },
  { name: "33-combat-log", save: (() => { const e = battleSave(); e.run.turn = 3; e.run.log = ["ROUTER1 connected to OMEGA.", "PACKET LEECH dealt 2 integrity damage (2 blocked).", "Signal dealt 6: Live router route +5 · Edge switches on route ×1 +1.", "Packet Guard: +4 block.", "Discard pile reshuffled into deck.", "PACKET LEECH planted malware; dealt 0 integrity damage.", "No live router route. No signal damage.", "ALPHA connected to SWITCH2.", "PACKET LEECH enters the grid. Quiet exchange floor. Establish a route.", "RELAY WISP neutralized. Its intent is cancelled."]; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("combat-log")(page); } },
  { name: "34-draw-pile", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("draw-pile")(page); } },
  { name: "35-loadout", save: null, go: async page => { await dialog("new")(page); await dialog("loadout")(page); } },
  { name: "36-prepared", save: (() => { const e = battleSave(); e.run.preparedCard = "pulse"; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.keyboard.press("p"); await page.waitForTimeout(500); } },
  { name: "37-dossier-guardian", save: battleSave("regent"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("enemy-dossier")(page); } },
  { name: "38-devices-malware", save: (() => { const e = battleSave("wraith"); e.run.installations = [{ id: "tap1", kind: "tap", x: 2, z: -2.4, integrity: 1, activeFrom: 0, owner: "h1" }]; e.run.topology.links.push({ a: "firewall3", b: "omega", armored: true }); return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("devices")(page); } },
  { name: "39-archive-scrolled", save: null, go: async page => { await dialog("collection")(page); await page.locator("dialog .dialog-surface").evaluate(el => { el.scrollTop = 900; }); await page.waitForTimeout(300); } },
  { name: "41-tooltip-low", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await page.locator('[data-action="discard-pile"]').hover(); await page.waitForTimeout(600); } },
  { name: "40-forecast-scrolled", save: battleSave(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(1400); await dialog("combat-details")(page); await page.locator("dialog .dialog-surface").evaluate(el => { el.scrollTop = 10000; }); await page.waitForTimeout(300); } },
  { name: "50-handbook-routes", save: null, go: chapter("routes", 380) },
  { name: "51-handbook-tools", save: null, go: chapter("tools", 300) },
  { name: "52-handbook-keepers", save: null, go: chapter("archetypes") },
  { name: "53-handbook-danger", save: null, go: chapter("danger", 120) },
  { name: "54-handbook-expedition", save: null, go: chapter("expedition", 99999) },
  { name: "55-training-progress", save: null, training: ["first-signal", "read-the-enemy", "reroute", "console-architect"], go: dialog("tutorial") },
  { name: "56-walkthrough-art", save: null, go: async page => { await dialog("tutorial")(page); await page.locator("[data-lesson]").last().click(); await page.waitForTimeout(500); await page.locator('dialog [data-walkthrough="2"]').first().click(); await page.waitForTimeout(500); } },
  { name: "57-walkthrough-last", save: null, go: async page => { await dialog("tutorial")(page); await page.locator("[data-lesson]").last().click(); await page.waitForTimeout(500); await page.locator('dialog [data-walkthrough="7"]').first().click(); await page.waitForTimeout(500); } },
  { name: "58-lesson-cable", save: null, go: async page => { await dialog("tutorial")(page); await page.locator('dialog button[data-lesson="first-signal"]').click(); await page.waitForTimeout(1200); await page.locator('[data-hand][data-card-id="router"]').first().click(); await page.locator('#target-dock [data-action="auto-place"]').click(); await page.waitForTimeout(1200); } },
  { name: "59-lesson-complete", save: null, go: async page => { await firstLesson(page); await page.locator('[data-action="transmit"]').click(); await page.waitForTimeout(6000); } },
  { name: "61-lesson-prepare", save: null, go: async page => { await dialog("tutorial")(page); await page.locator('dialog button[data-lesson="danger"]').click(); await page.waitForTimeout(1200); await page.locator("[data-scrub]").first().click(); await page.waitForTimeout(600); await page.locator('[data-hand][data-card-id="worm"]').first().click(); await page.waitForTimeout(1200); } },
  { name: "62-coach-objection", save: null, go: async page => { await dialog("tutorial")(page); await page.locator('dialog button[data-lesson="first-signal"]').click(); await page.waitForTimeout(1200); await page.locator('[data-hand][data-card-id="fiber"]').first().click(); await page.waitForTimeout(500); } },
  { name: "60-lesson-collapsed", save: null, go: async page => { await dialog("tutorial")(page); await page.locator('dialog button[data-lesson="reroute"]').click(); await page.waitForTimeout(1200); await page.locator('[data-action="lesson-collapse"]').click(); await page.waitForTimeout(500); } },
  { name: "70-sanctuary-picker", save: roomSave("forge"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator('[data-screen="forge-upgrade"]').click(); await page.waitForTimeout(600); await page.locator(".pick-tile:not(.blocked)").nth(2).hover(); await page.waitForTimeout(400); } },
  { name: "71-event-outcome", save: roomSave("event"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator('[data-screen="event-choice"]:not([aria-disabled]):not(:has(.choice-needs))').last().click(); await page.waitForTimeout(900); } },
  { name: "72-boss-relic", save: (() => { const e = roomSave("cache"); e.run.phase = "relic"; e.run.relicRewards = ["spanning-tree", "anycast", "bgp-hijack"] as RelicId[]; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator("[data-relic]").nth(1).hover(); await page.waitForTimeout(300); } },
  { name: "73-map-mid", save: midMap(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator(".route-room.available").first().hover(); await page.waitForTimeout(500); } },
  { name: "74-market-picker", save: roomSave("shop"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator('[data-screen="shop-remove"]').click(); await page.waitForTimeout(600); } },
  { name: "75-elite-reward", save: (() => { const e = roomSave("elite"); e.run.phase = "reward"; e.run.cardRewards = ["router", "fiber", "guard"]; e.run.creditsEarned = 33; e.run.enemies = []; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "76-market-hover", save: roomSave("shop"), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); await page.locator('[data-screen="buy-card"]').nth(1).hover(); await page.waitForTimeout(400); } },
  { name: "77-market-sold", save: (() => { const e = roomSave("shop"); e.run.shop!.cards[1].sold = true; e.run.shop!.relics[0].sold = true; e.run.shop!.removed = true; e.run.credits = 45; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
  { name: "78-guardian-reward", save: (() => { const e = midMap(0, 6); e.run.currentRoom = e.run.map.find(room => room.type === "boss")!.id; e.run.enemies = [{ ...makeEnemy("regent", "h1", "centre", "single", 67), hp: 0 }]; e.run.phase = "reward"; e.run.cardRewards = ["router", "fiber", "guard"]; e.run.creditsEarned = 50; return e; })(), go: async page => { await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(900); } },
];

const browser = await chromium.launch({ args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
for (const shot of shots) {
  if (only && !only.some(name => shot.name.includes(name))) continue;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ save, training }) => {
    localStorage.clear();
    if (save) localStorage.setItem("faultline-expedition-v2", JSON.stringify(save));
    if (training) localStorage.setItem("faultline-training-v1", JSON.stringify(training));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, muted: false, motion: false }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: true, fast: true }));
    if (save) localStorage.setItem("faultline-progress-v3", JSON.stringify({ unlocked: { architect: 3, warden: 1, ghost: 0 }, chosen: {}, records: [] }));
  }, { save: shot.save ?? null, training: shot.training ?? null });
  try {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await shot.go(page);
    await page.screenshot({ path: `${out}/${shot.name}.png` });
    console.log(`${shot.name}${errors.length ? `  errors: ${errors.join(" | ")}` : ""}`);
  } catch (error) {
    console.log(`${shot.name}  FAILED: ${(error as Error).message.split("\n")[0]}`);
    await page.screenshot({ path: `${out}/${shot.name}-failed.png` }).catch(() => {});
  }
  await context.close();
}
await browser.close();
