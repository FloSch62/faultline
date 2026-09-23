/** Full UI expedition audit. No battle state is injected after the initial map.
 * node --experimental-strip-types scripts/playthrough.ts [archetype] [seed]
 * Set FAULTLINE_BASE_URL for a production preview or deployment under a subpath.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { newExpedition, type Archetype } from "../src/core/expedition.ts";
import { reachableRooms } from "../src/core/map.ts";
import { combatPreview, zoneForNode, SALVAGE_COST, SALVAGE_MIN_INTEGRITY } from "../src/core/run.ts";
import { playBotTurn, rewardPriorities, type BotAction } from "./bot.ts";
import type { RunState, RelicId } from "../src/core/types.ts";

const archetype = (process.argv[2] ?? "warden") as Archetype;
assert.ok(["architect", "warden", "ghost"].includes(archetype));
const seed = Number(process.argv[3]) || 2654435761;
const checkpoint = process.env.FAULTLINE_CHECKPOINT ? JSON.parse(await readFile(process.env.FAULTLINE_CHECKPOINT, "utf8")) : null;
const storage = "faultline-expedition-v2";
const baseURL = process.env.FAULTLINE_BASE_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [], encounters: Record<string, unknown>[] = checkpoint?.encounters ?? [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const directory = `artifacts/playthrough-${archetype}-${seed}`;
await mkdir(directory, { recursive: true });
const read = () => page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run as RunState, storage);
const click = (selector: string) => page.locator(selector).click();
let actions = checkpoint?.actions ?? 0, turns = checkpoint?.turns ?? 0, current: Record<string, unknown> | null = checkpoint?.run.phase === "battle" ? encounters.at(-1) ?? null : null;
const captured = new Set<string>();

async function perform(page: Page, command: BotAction) {
  if (command.kind === "move") {
    await click('[data-action="devices"]');
    await click(`[data-manage-node="${command.id}"]`);
    await click(`[data-relocate-zone="${zoneForNode(command)}"]`);
  } else if (command.kind === "prepare") {
    await click('[data-action="prepare"]');
    await click(`[data-prepare-card="${command.index}"]`);
  } else {
    await page.keyboard.press(command.index === 9 ? "0" : String(command.index + 1));
    if (command.kind === "ground") await click(`[data-deploy-zone="${zoneForNode(command)}"]`);
    if (command.kind === "zone") await click(`[data-field-zone="${command.zone}"]`);
    if (command.kind === "node") await click(`[data-node="${command.id}"]`);
    if (command.kind === "link") {
      await click(`[data-node="${command.a}"]`);
      await click(`[data-node="${command.b}"]`);
    }
  }
}

try {
  const initial = newExpedition(archetype, seed);
  if (checkpoint) initial.run = checkpoint.run;
  await page.addInitScript(({ storage, e }) => {
    if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
    localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: true }));
  }, { storage, e: initial });
  await page.goto(baseURL);
  await click('[data-action="continue"]');
  for (let step = 0; step < 1800; step++) {
    const r = await read();
    if (["won", "lost"].includes(r.phase)) {
      await page.screenshot({ path: `${directory}/${r.phase}.png` });
      await writeFile(`${directory}/report.json`, JSON.stringify({ archetype, seed, outcome: r.phase, integrity: r.integrity, maxIntegrity: r.maxIntegrity, resumedFrom: process.env.FAULTLINE_CHECKPOINT ?? null, actions, turns, encounters, errors, final: r }, null, 2));
      console.log(JSON.stringify({ outcome: r.phase, actions, turns, integrity: r.integrity, stage: r.stage, floor: r.floor, errors, directory }));
      assert.deepEqual(errors, []);
      break;
    }
    if (r.phase === "map") {
      const scores: Record<string, number> = { cache: 5, forge: 4, battle: 3, elite: 2, boss: 1 };
      const room = reachableRooms(r).sort((a,b) => scores[b.type] - scores[a.type] || Math.abs(a.lane - 1) - Math.abs(b.lane - 1))[0];
      await click(`[data-room="${room.id}"]`);
      const next = await read();
      if (next.enemy) {
        current = { stage: next.stage + 1, sector: next.floor + 1, enemy: next.enemy.id, before: next.integrity, turns: 0, interrupts: 0 };
        encounters.push(current);
        console.log(`Stage ${next.stage + 1} sector ${next.floor + 1}: ${next.enemy.name}, integrity ${next.integrity}/${next.maxIntegrity}`);
        if (!next.bossIntroSeen) await click('.guardian-introduction [data-action="close"]');
      }
    } else if (r.phase === "battle") {
      const commands: BotAction[] = [];
      playBotTurn(structuredClone(r), "tactical", command => commands.push(command));
      if (commands.length) {
        await perform(page, commands[0]);
        const after = await read();
        assert.notDeepEqual(after, r, `UI action had no effect: ${JSON.stringify(commands[0])}`);
        actions++;
      } else {
        const p = combatPreview(r);
        if (r.floor === 6 && (p.intent?.ultimate || p.intent?.kind === "charge" || r.enemy?.exposed)) {
          const key = `${r.enemy!.id}-${p.intent?.ultimate ? "ultimate" : r.enemy?.exposed ? "exposed" : "charge"}`;
          if (!captured.has(key)) { captured.add(key); await page.screenshot({ path: `${directory}/${key}.png` }); }
          if (p.intent?.ultimate && current) {
            const entries = current.ultimateForecasts as unknown[] | undefined;
            current.ultimateForecasts = [...(entries ?? []), { turn: r.turn, integrity: r.integrity, damage: p.packetDamage, threshold: p.breakDamage, incoming: p.incoming, shield: p.shield, interrupted: p.interrupted }];
          }
        }
        await click('[data-action="transmit"]');
        await page.waitForFunction(({ storage, turn }) => {
          const r = JSON.parse(localStorage.getItem(storage)!).run;
          return r.turn !== turn || r.phase !== "battle";
        }, { storage, turn: r.turn });
        const after = await read();
        if (!p.lethal) assert.equal(after.integrity, Math.max(0, r.integrity - p.incoming));
        turns++;
        if (current) {
          current.turns = Number(current.turns) + 1;
          current.interrupts = Number(current.interrupts) + Number(p.interrupted);
          current.after = after.integrity;
        }
        // Exercise actual save/continue on the road, with no re-seeding.
        if (turns === 15) {
          await page.reload();
          await click('[data-action="continue"]');
          assert.deepEqual(await read(), after);
        }
      }
    } else if (r.phase === "reward") {
      const priorities = rewardPriorities();
      const card = [...r.cardRewards].sort((a,b) => (priorities.indexOf(a) < 0 ? 99 : priorities.indexOf(a)) - (priorities.indexOf(b) < 0 ? 99 : priorities.indexOf(b)))[0];
      await click(`[data-reward="${card}"]`);
    } else if (r.phase === "relic") {
      const order: RelicId[] = ["grounded-core", "repair-drone", "parallel-core", "deep-cache", "reserve-cell", "cold-start", "hot-swap", "shield-array", "packet-lens"];
      const relic = [...r.relicRewards].sort((a,b) => order.indexOf(a) - order.indexOf(b))[0];
      await click(`[data-relic="${relic}"]`);
    } else if (r.phase === "forge") {
      const trim = r.deck.length > 20 && r.relics.length >= 3
        ? r.deck.findIndex(id => id === "fiber" && r.deck.filter(card => card === id).length > 3) : -1;
      if (r.maxIntegrity - r.integrity >= 4) await click('[data-forge="repair"]');
      else if (trim >= 0) {
        await click('[data-action="refine"]');
        await click(`[data-remove-card="${trim}"]`);
      } else await click(`[data-forge="${r.maxIntegrity - SALVAGE_COST >= SALVAGE_MIN_INTEGRITY && r.relics.length < 9 ? "relic" : "repair"}"]`);
    }
    if (step === 1799) throw new Error("Expedition did not terminate");
  }
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  await writeFile(`${directory}/failure.json`, JSON.stringify({ error: String(error), actions, turns, encounters, errors, run: await read() }, null, 2));
  throw error;
} finally { await browser.close(); }
