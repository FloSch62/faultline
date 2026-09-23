/** Seeded smoke-balance harness; bots are regression probes, not human playtests.
 * Run: node --experimental-strip-types scripts/balance.ts [seeds-per-profile=100]
 */
import { newExpedition, type Archetype } from "../src/core/expedition.ts";
import { reachableRooms } from "../src/core/map.ts";
import { chooseRoom, chooseCardReward, chooseForge, chooseRelic, combatPreview, endTurn, SALVAGE_COST, SALVAGE_MIN_INTEGRITY, removeDeckCard } from "../src/core/run.ts";
import type { CardId } from "../src/core/types.ts";
import { playBotTurn, rewardPriorities, type Policy } from "./bot.ts";

const seeds = Math.max(1, Number(process.argv[2]) || 100);
const eliteRoute = process.argv.includes("--elite");
const noSignature = process.argv.includes("--no-signature");
const build =
  process.argv.find((arg) => arg.startsWith("--build="))?.split("=")[1] ??
  "balanced";
const priorities = rewardPriorities(build);

const output: Record<string, unknown>[] = [];
for (const archetype of ["architect", "warden", "ghost"] as Archetype[]) {
  for (const policy of ["careless", "aggressive", "adaptive", "tactical"] as Policy[]) {
    const guardians = Object.fromEntries(["regent", "cantor", "core"].map(id => [id, { encounters: 0, wins: 0, losses: 0, ultimates: 0, interrupts: 0, ultimateDamage: 0 }]));
    const sampleWinningSeeds: number[] = [];
    let wins = 0,
      reachedBoss = 0,
      turns = 0,
      battles = 0,
      winIntegrity = 0,
      defeatedAt = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = newExpedition(archetype, Math.imul(seed, 0x9e3779b1) >>> 0).run;
      let moves = 0;
      while (r.phase !== "won" && r.phase !== "lost" && moves++ < 600) {
        if (r.phase === "map") {
          const rooms = reachableRooms(r);
          rooms.sort((a, b) => {
            const score = (type: string) =>
              eliteRoute && type === "elite"
                ? 6
                : type === "cache"
                  ? 5
                  : type === "forge"
                    ? 4
                    : type === "battle"
                      ? 3
                      : type === "elite"
                        ? 2
                        : 1;
            return (
              score(b.type) - score(a.type) ||
              Math.abs(a.lane - 1) - Math.abs(b.lane - 1)
            );
          });
          chooseRoom(r, rooms[0].id);
          if (String(r.phase) === "battle") {
            battles++;
            if (r.floor === 6 && r.stage === 2) reachedBoss++;
            if (r.enemy && guardians[r.enemy.id]) guardians[r.enemy.id].encounters++;
          }
        } else if (r.phase === "battle") {
          playBotTurn(r, policy);
          const preview = combatPreview(r), guardian = guardians[r.enemy!.id];
          const result = endTurn(r);
          if (guardian) {
            if (result.defeated) guardian.wins++;
            if (result.lost) guardian.losses++;
            if (preview.intent?.ultimate && !preview.lethal) {
              guardian.ultimates++;
              if (result.interrupted) guardian.interrupts++;
              guardian.ultimateDamage += result.integrityDamage;
            }
          }
          turns++;
        } else if (r.phase === "reward") {
          const best = r.cardRewards.filter(card => !noSignature || !["containerlab", "clabernetes"].includes(card)).sort(
            (a, b) =>
              (priorities.indexOf(a) < 0 ? 99 : priorities.indexOf(a)) -
              (priorities.indexOf(b) < 0 ? 99 : priorities.indexOf(b)),
          )[0];
          chooseCardReward(r, policy === "careless" ? null : best ?? null);
        } else if (r.phase === "relic") {
          const preference = [
            ...(build === "mesh"
              ? ["parallel-core"]
              : build === "fortress"
                ? ["grounded-core", "repair-drone"]
                : build === "burst"
                  ? ["deep-cache", "reserve-cell"]
                  : []),
            "grounded-core",
            "repair-drone",
            "parallel-core",
            "deep-cache",
            "reserve-cell",
            "cold-start",
            "hot-swap",
            "shield-array",
            "packet-lens",
          ];
          chooseRelic(
            r,
            [...r.relicRewards].sort(
              (a, b) => preference.indexOf(a) - preference.indexOf(b),
            )[0],
          );
        } else if (r.phase === "forge") {
          // Once an engine is established, thinning dead construction cards can
          // be worth more than paying maximum integrity for another relic.
          const trim = policy === "tactical" && r.deck.length > 20 && r.relics.length >= 3
            ? r.deck.findIndex(id => id === "fiber" && r.deck.filter(card => card === id).length > 3)
            : -1;
          if (r.maxIntegrity - r.integrity >= 4) chooseForge(r, "repair");
          else if (trim >= 0) removeDeckCard(r, trim);
          else chooseForge(r, r.maxIntegrity - SALVAGE_COST >= SALVAGE_MIN_INTEGRITY && r.relics.length < 9 ? "relic" : "repair");
        }
        else throw new Error(`Unhandled ${r.phase}`);
      }
      if (moves >= 600) throw new Error("Run did not terminate");
      if (r.phase === "won") {
        wins++;
        if (sampleWinningSeeds.length < 3) sampleWinningSeeds.push(r.seed);
        winIntegrity += r.integrity;
      } else defeatedAt += r.stage * 7 + r.floor + 1;
    }
    output.push({
      archetype,
      policy,
      build,
      seeds,
      wins,
      sampleWinningSeeds,
      winRate: `${Math.round((wins / seeds) * 100)}%`,
      reachedBoss,
      guardians,
      averageTurnsPerBattle: +(turns / battles).toFixed(2),
      averageIntegrityOnWin: wins ? +(winIntegrity / wins).toFixed(1) : 0,
      averageLossSector:
        seeds > wins ? +(defeatedAt / (seeds - wins)).toFixed(1) : 0,
    });
  }
}
console.log(
  JSON.stringify(
    {
      notes: `Deterministic lightweight bots, ${eliteRoute ? "elite-seeking" : "fewer-elites"} map route${noSignature ? ", neither orchestration signature card accepted" : ""}. These are regression probes, not a human difficulty estimate.`,
      profiles: output,
    },
    null,
    2,
  ),
);
