/** Full UI expedition audit through the real controls. Only the initial expedition is
 * injected; every card, console command, protocol, scrub, room, market, event and
 * sanctuary choice is clicked in the browser, and every transmission is checked
 * against the rules resolving the same saved state.
 *
 * node --experimental-strip-types scripts/playthrough.ts [archetype] [seed]
 * FAULTLINE_BASE_URL   server to drive (default http://127.0.0.1:5174/)
 * FAULTLINE_REPORT     JSON file to merge the result into (e.g. docs/playthrough-v3.json)
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { newExpedition, type Archetype } from "../src/core/expedition.ts";
import { reachableRooms } from "../src/core/map.ts";
import { CARDS, baseCard } from "../src/core/cards.ts";
import { combatPreview, endTurn, zoneForNode, eventView, upgradableIndices, leaderOf } from "../src/core/run.ts";
import { playBotTurn, PRIORITIES, type BotAction } from "./bot.ts";
import type { CardId, MapRoom, RelicId, RunState } from "../src/core/types.ts";

const archetype = (process.argv[2] ?? "warden") as Archetype;
assert.ok(["architect", "warden", "ghost"].includes(archetype));
const seed = Number(process.argv[3]) || 2654435761;
const storage = "faultline-expedition-v2";
const baseURL = process.env.FAULTLINE_BASE_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const encounters: Record<string, unknown>[] = [];
const rooms: Record<string, number> = {};
const actionKinds: Record<string, number> = {};
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const directory = `artifacts/playthrough-${archetype}-${seed}`;
await mkdir(directory, { recursive: true });
const read = () => page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run as RunState, storage);
const click = (selector: string) => page.locator(selector).first().click();
const json = (run: RunState) => JSON.parse(JSON.stringify(run)) as RunState;
let actions = 0, turns = 0, checked = 0, skipped = 0;
let current: Record<string, unknown> | null = null;

/** The rules' resolution of this exact saved state. */
function resolved(run: RunState): RunState {
  const next = json(run);
  endTurn(next);
  return json(next);
}

async function perform(command: BotAction) {
  if (command.kind === "move") {
    await click('[data-action="devices"]');
    await click(`[data-manage-node="${command.id}"]`);
    await click(`[data-relocate-zone="${zoneForNode(command)}"]`);
  } else if (command.kind === "prepare") {
    await click('[data-action="prepare"]');
    await click(`[data-prepare-card="${command.index}"]`);
  } else if (command.kind === "console") {
    await click('[data-action="console"]');
    if (command.a && command.b) {
      await click(`#target-dock [data-node="${command.a}"]`);
      await click(`#target-dock [data-node="${command.b}"]`);
    }
  } else if (command.kind === "scrub") {
    await click(`[data-scrub="${command.id}"]`);
  } else if (command.kind === "repair") {
    await click(`[data-repair="${command.id}"]`);
  } else if (command.kind === "focus") {
    // A hostile's row in the port strip targets it (F on the keyboard).
    await click(`.port-row[data-port="${command.port}"]`);
  } else {
    await page.keyboard.press(command.index === 9 ? "0" : String(command.index + 1));
    if (command.kind === "ground") await click(`#target-dock [data-deploy-zone="${zoneForNode(command)}"]`);
    if (command.kind === "zone") await click(`[data-field-zone="${command.zone}"]`);
    if (command.kind === "node") await click(`#target-dock [data-node="${command.id}"]`);
    if (command.kind === "link") {
      await click(`#target-dock [data-node="${command.a}"]`);
      await click(`#target-dock [data-node="${command.b}"]`);
    }
  }
}

const priority = (id: CardId) => {
  const index = PRIORITIES[archetype].indexOf(baseCard(id));
  return index < 0 ? 50 : index - (id.endsWith("+") ? .5 : 0);
};
const RELIC_ORDER: RelicId[] = [
  "jumbo-frames", "bgp-hijack", "sdn-controller", "anycast", "zero-trust", "spanning-tree",
  "cold-start", "grounded-core", "repair-drone", "reserve-cell", "parallel-core", "fanout",
  "watchdog", "shield-array", "packet-lens", "honeynet", "spare-parts", "credit-line",
];
function relicScore(id: RelicId) {
  if (id === "anycast" && archetype === "warden") return 999;
  if (id === "spanning-tree" && archetype === "architect") return 999;
  const index = RELIC_ORDER.indexOf(id);
  return index < 0 ? 100 : index;
}
function roomScore(r: RunState, room: MapRoom) {
  const health = r.integrity / r.maxIntegrity;
  return ({ elite: health >= .8 ? 4 : 1, forge: health < .7 ? 7 : 3, shop: r.credits >= 70 ? 6 : 2, cache: 5, event: 4, battle: 3, boss: 0 } as Record<string, number>)[room.type] ?? 0;
}

/** Choose the first eligible card in an open deck picker. */
async function pickFirst() {
  await click('.pick-tile[data-screen="pick"]:not([disabled])');
}

async function battleStep(r: RunState): Promise<void> {
  const commands: BotAction[] = [];
  playBotTurn(structuredClone(r), "tactical", command => commands.push(command));
  if (commands.length && skipped < 2) {
    await perform(commands[0]);
    const after = await read();
    if (JSON.stringify(after) === JSON.stringify(r)) {
      // The UI chose a different legal socket or refused; replan once, then transmit.
      skipped++;
      await page.keyboard.press("Escape");
      if (await page.locator("dialog[open]").count()) await page.keyboard.press("Escape");
      return;
    }
    skipped = 0;
    actions++;
    actionKinds[commands[0].kind] = (actionKinds[commands[0].kind] ?? 0) + 1;
    return;
  }
  skipped = 0;
  const p = combatPreview(r);
  const expected = resolved(r);
  if (current && p.intent?.ultimate) {
    const entries = (current.ultimates as unknown[] | undefined) ?? [];
    current.ultimates = [...entries, { turn: r.turn, damage: p.packetDamage, threshold: p.breakDamage, incoming: p.incoming, interrupted: p.interrupted }];
  }
  await click('[data-action="transmit"]');
  await page.waitForFunction(({ storage, turn }) => {
    const r = JSON.parse(localStorage.getItem(storage)!).run;
    return r.turn !== turn || r.phase !== "battle";
  }, { storage, turn: r.turn }, { timeout: 30000 });
  await page.locator(".game-root:not(.busy)").waitFor({ timeout: 30000 });
  const after = await read();
  assert.deepEqual(after, expected, `turn ${r.turn} vs ${leaderOf(r)?.id}: the saved result differs from the forecast resolution`);
  checked++;
  turns++;
  if (current) {
    current.turns = Number(current.turns) + 1;
    current.interrupts = Number(current.interrupts) + Number(p.interrupted);
    current.after = after.integrity;
    current.damageDealt = Number(current.damageDealt ?? 0) + p.packetDamage;
  }
  // Exercise the real save/continue path mid-expedition, with no re-seeding.
  if (turns === 15 && after.phase === "battle") {
    await page.reload();
    await click('[data-action="continue"]');
    assert.deepEqual(await read(), after, "reload restored a different state");
  }
}

async function screenStep(r: RunState) {
  if (r.phase === "map") {
    const room = reachableRooms(r).sort((a, b) => roomScore(r, b) - roomScore(r, a) || Math.abs(a.lane - 1) - Math.abs(b.lane - 1))[0];
    rooms[room.type] = (rooms[room.type] ?? 0) + 1;
    await click(`[data-room="${room.id}"]`);
    const next = await read();
    const leader = leaderOf(next);
    if (next.phase === "battle" && leader) {
      current = { stage: next.stage + 1, sector: next.floor + 1, room: room.type, enemy: next.enemies.map(enemy => enemy.id).join("+"), before: next.integrity, turns: 0, interrupts: 0 };
      encounters.push(current);
      console.log(`Stage ${next.stage + 1} sector ${next.floor + 1} ${room.type}: ${next.enemies.map(enemy => enemy.name).join(", ")}, integrity ${next.integrity}/${next.maxIntegrity}`);
      if (!next.bossIntroSeen) await click('.guardian-introduction [data-action="close"]');
    } else console.log(`Stage ${next.stage + 1} sector ${next.floor + 1}: ${room.type}`);
  } else if (r.phase === "reward") {
    const card = [...r.cardRewards].sort((a, b) => priority(a) - priority(b))[0];
    await click(`[data-reward="${card}"]`);
  } else if (r.phase === "relic") {
    const relic = [...r.relicRewards].sort((a, b) => relicScore(a) - relicScore(b))[0];
    await click(`[data-relic="${relic}"]`);
  } else if (r.phase === "forge") {
    if (r.maxIntegrity - r.integrity >= 4) await click('[data-screen="forge-repair"]');
    else if (upgradableIndices(r).length) { await click('[data-screen="forge-upgrade"]'); await pickFirst(); }
    else await click('[data-screen="forge-repair"]');
  } else if (r.phase === "shop") {
    const shop = r.shop!;
    const offers = shop.cards.map((offer, index) => ({ ...offer, index }))
      .filter(offer => !offer.sold && offer.price <= r.credits && (offer.index > 0 || archetype === "architect"))
      .sort((a, b) => priority(a.id) - priority(b.id));
    if (offers.length && priority(offers[0].id) < 50) { await click(`[data-screen="buy-card"][data-index="${offers[0].index}"]`); return; }
    if (!shop.upgraded && r.credits >= shop.upgradePrice && upgradableIndices(r).length) { await click('[data-screen="shop-upgrade"]'); await pickFirst(); return; }
    await click('[data-screen="leave-shop"]');
  } else if (r.phase === "event") {
    const view = eventView(r)!;
    if (view.resolved) { await click('[data-screen="event-leave"]'); return; }
    const choice = view.choices.findIndex(item => !item.disabled);
    await click(`[data-screen="event-choice"][data-index="${choice}"]`);
    if (view.choices[choice].needsCard) await pickFirst();
    const next = await read();
    if (next.phase === "battle" && next.enemies.length) {
      current = { stage: next.stage + 1, sector: next.floor + 1, room: "event", enemy: next.enemies.map(enemy => enemy.id).join("+"), before: next.integrity, turns: 0, interrupts: 0 };
      encounters.push(current);
    }
  }
}

const report = { archetype, seed, outcome: "", stage: 0, sector: 0, integrity: 0, maxIntegrity: 0, credits: 0, deck: 0, relics: [] as RelicId[], actions: 0, actionKinds, transmissions: 0, forecastsChecked: 0, rooms, encounters, errors };
try {
  const initial = newExpedition(archetype, seed);
  await page.addInitScript(({ storage, e }) => {
    if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: true }));
  }, { storage, e: initial });
  await page.goto(baseURL);
  await click('[data-action="continue"]');
  for (let step = 0; step < 4000; step++) {
    const r = await read();
    if (["won", "lost"].includes(r.phase)) {
      await page.locator(".outcome-screen").waitFor();
      await page.screenshot({ path: `${directory}/${r.phase}.png` });
      Object.assign(report, {
        outcome: r.phase, stage: r.stage + 1, sector: r.stage * 7 + r.floor, integrity: r.integrity, maxIntegrity: r.maxIntegrity,
        credits: r.credits, deck: r.deck.length, relics: r.relics, actions, transmissions: turns, forecastsChecked: checked,
      });
      break;
    }
    if (r.phase === "battle") await battleStep(r);
    else await screenStep(r);
    if (step === 3999) throw new Error("Expedition did not terminate");
  }
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/report.json`, JSON.stringify({ ...report, deckCards: (await read()).deck.map(id => CARDS[id].name) }, null, 2));
  if (process.env.FAULTLINE_REPORT) {
    let merged: { runs: typeof report[] } = { runs: [] };
    try { merged = JSON.parse(await readFile(process.env.FAULTLINE_REPORT, "utf8")); } catch { /* first run */ }
    merged.runs = [...merged.runs.filter(item => item.archetype !== archetype || item.seed !== seed), report];
    await writeFile(process.env.FAULTLINE_REPORT, `${JSON.stringify(merged, null, 2)}\n`);
  }
  console.log(JSON.stringify({ outcome: report.outcome, sector: report.sector, actions, transmissions: turns, checked, integrity: report.integrity, errors, directory }));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  await writeFile(`${directory}/failure.json`, JSON.stringify({ error: String(error), actions, turns, encounters, errors, run: await read() }, null, 2));
  throw error;
} finally { await browser.close(); }
