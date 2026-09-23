/** Seeded balance harness; bots are regression probes, not human playtests.
 * Run: node --experimental-strip-types scripts/balance.ts [seeds-per-profile=100]
 *   [--elite] [--no-signature] [--ascension=N] [--archetype=a,b] [--policy=p,q]
 */
import { newExpedition } from "../src/core/expedition.ts";
import { combatPreview, endTurn, RULES } from "../src/core/run.ts";
import type { Archetype } from "../src/core/types.ts";
import { playBotTurn, type Policy } from "./bot.ts";
import { playMetaPhase } from "./bot-meta.ts";
import { PRIORITIES } from "./bot.ts";

const seeds = Math.max(1, Number(process.argv[2]) || 100);
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const elite = process.argv.includes("--elite");
const noSignature = process.argv.includes("--no-signature");
const ascension = Number(flag("ascension") ?? 0);
const archetypes = (flag("archetype")?.split(",") ?? ["architect", "warden", "ghost"]) as Archetype[];
/** Experiment: scale normal-battle health (rooms of type "battle") to probe fight length. */
const hpScale = Number(flag("hp-scale") ?? 1);
/** Experiment: scale guardian health. */
const bossScale = Number(flag("boss-scale") ?? 1);
/** Experiment: override tunable numbers, e.g. --rule=bufferMultiplier:1.5,firewallBreachBlock:3 */
for (const pair of flag("rule")?.split(",") ?? []) {
  const [key, value] = pair.split(":");
  if (!Object.hasOwn(RULES, key)) throw new Error(`Unknown rule ${key}`);
  (RULES as Record<string, unknown>)[key] = Number(value);
}
const policies = (flag("policy")?.split(",") ?? ["careless", "aggressive", "adaptive", "tactical"]) as Policy[];

const output: Record<string, unknown>[] = [];
for (const archetype of archetypes) {
  for (const policy of policies) {
    const guardians = Object.fromEntries(["regent", "cantor", "core"].map(id => [id, { encounters: 0, wins: 0, losses: 0, turns: 0, ultimates: 0, interrupts: 0, ultimateDamage: 0 }]));
    const sampleWinningSeeds: number[] = [];
    let wins = 0, reachedCore = 0, turns = 0, battles = 0, normalTurns = 0, normalBattles = 0, winIntegrity = 0, defeatedAt = 0;
    const lostTo: Record<string, number> = {};
    for (let seed = 1; seed <= seeds; seed++) {
      const r = newExpedition(archetype, Math.imul(seed, 0x9e3779b1) >>> 0, false, ascension).run;
      let moves = 0, battleTurns = 0, battleKind = "";
      while (r.phase !== "won" && r.phase !== "lost" && moves++ < 2500) {
        if (r.phase === "battle") {
          if (battleTurns === 0) {
            battles++;
            battleKind = r.map.find(room => room.id === r.currentRoom)?.type ?? "";
            if (battleKind === "battle" && hpScale !== 1 && r.enemy) r.enemy.hp = r.enemy.maxHp = Math.round(r.enemy.maxHp * hpScale);
            if (battleKind === "boss" && bossScale !== 1 && r.enemy) r.enemy.hp = r.enemy.maxHp = Math.round(r.enemy.maxHp * bossScale);
            if (r.enemy && guardians[r.enemy.id]) guardians[r.enemy.id].encounters++;
            if (r.enemy?.id === "core") reachedCore++;
          }
          playBotTurn(r, policy);
          const preview = combatPreview(r), guardian = r.enemy ? guardians[r.enemy.id] : undefined;
          const enemy = r.enemy!.id;
          const result = endTurn(r);
          battleTurns++;
          turns++;
          if (guardian) {
            guardian.turns++;
            if (result.defeated) guardian.wins++;
            if (result.lost) guardian.losses++;
            if (preview.intent?.ultimate && !preview.lethal) {
              guardian.ultimates++;
              if (result.interrupted) guardian.interrupts++;
              guardian.ultimateDamage += result.integrityDamage;
            }
          }
          if (result.lost) lostTo[enemy] = (lostTo[enemy] ?? 0) + 1;
          if (result.defeated || result.lost || battleTurns > 60) {
            if (battleKind === "battle") { normalBattles++; normalTurns += battleTurns; }
            if (battleTurns > 60 && r.phase === "battle") { r.phase = "lost"; lostTo.stalled = (lostTo.stalled ?? 0) + 1; }
            battleTurns = 0;
          }
        } else playMetaPhase(r, policy, { elite, noSignature, priorities: PRIORITIES[archetype] });
      }
      if (moves >= 2500) throw new Error(`Run did not terminate: ${archetype} ${policy} ${seed} ${r.phase}`);
      if (r.phase === "won") {
        wins++;
        if (sampleWinningSeeds.length < 3) sampleWinningSeeds.push(r.seed);
        winIntegrity += r.integrity;
      } else defeatedAt += r.stage * 7 + r.floor + 1;
    }
    for (const guardian of Object.values(guardians)) (guardian as Record<string, number>).averageTurns = guardian.wins + guardian.losses ? +(guardian.turns / Math.max(1, guardian.encounters)).toFixed(1) : 0;
    output.push({
      archetype, policy, ascension, seeds, wins,
      winRate: `${Math.round((wins / seeds) * 100)}%`,
      sampleWinningSeeds, reachedCore, guardians, lostTo,
      averageTurnsPerBattle: +(turns / Math.max(1, battles)).toFixed(2),
      averageTurnsPerNormalBattle: +(normalTurns / Math.max(1, normalBattles)).toFixed(2),
      averageIntegrityOnWin: wins ? +(winIntegrity / wins).toFixed(1) : 0,
      averageLossSector: seeds > wins ? +(defeatedAt / (seeds - wins)).toFixed(1) : 0,
    });
  }
}
console.log(JSON.stringify({
  notes: `v3 deterministic bots, ${elite ? "elite-seeking" : "default"} routing${noSignature ? ", no signature cards" : ""}, ascension ${ascension}${hpScale !== 1 ? `, normal health ×${hpScale}` : ""}${bossScale !== 1 ? `, guardian health ×${bossScale}` : ""}${flag("rule") ? `, rules ${flag("rule")}` : ""}. Regression probes, not a human difficulty estimate.`,
  profiles: output,
}, null, 2));
