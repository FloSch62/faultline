/** Seeded balance harness; bots are regression probes, not human playtests.
 * Run: node --experimental-strip-types scripts/balance.ts [seeds-per-profile=100]
 *   [--elite] [--no-signature] [--ascension=N] [--archetype=a,b] [--policy=p,q]
 *   [--packs[=on|off]] [--front[=on|off]] [--escalation[=on|off]] [--designations[=on|off]]
 *   [--surprises[=on|off]] [--adds[=on|off]] [--layers=on|off] (--no-packs etc. also turn one off)
 *   [--rule=key:value,…]  numbers, arrays as a/b/c, nested keys as packShares.trio:0.6/0.3/0.3
 *   [--kill-order=threat|leader] [--summary] (a compact table on stderr)
 * Every layer defaults to on (every delivery phase has shipped); `--layers=off` is the v3
 * baseline (packs, the table front, escalation, designations, surprises and adds all off). */
import { newExpedition } from "../src/core/expedition.ts";
import { combatPreview, endTurn, leaderOf, RULES } from "../src/core/run.ts";
import type { Archetype, RunState } from "../src/core/types.ts";
import { playBotTurn, resolveOffers, setBotOptions, PRIORITIES, type BotAction, type Policy } from "./bot.ts";
import { playMetaPhase } from "./bot-meta.ts";
import { baseCard } from "../src/core/cards.ts";

const args = process.argv.slice(2);
const seeds = Math.max(1, Number(args.find(arg => /^\d+$/.test(arg))) || 100);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const elite = args.includes("--elite");
const noSignature = args.includes("--no-signature");
const summary = args.includes("--summary");
const ascension = Number(flag("ascension") ?? 0);
const archetypes = (flag("archetype")?.split(",") ?? ["architect", "warden", "ghost"]) as Archetype[];
/** Experiment: scale normal-battle health (rooms of type "battle") to probe fight length. */
const hpScale = Number(flag("hp-scale") ?? 1);
/** Experiment: scale guardian health. */
const bossScale = Number(flag("boss-scale") ?? 1);
const policies = (flag("policy")?.split(",") ?? ["careless", "aggressive", "adaptive", "tactical"]) as Policy[];
const killOrder = (flag("kill-order") ?? "threat") as "threat" | "leader";
setBotOptions({ killOrder });

// ---------------------------------------------------------------- layers and rules

type Rules = Record<string, unknown>;
const rules = RULES as unknown as Rules;
/** Each layer's "off" values (the phase flags of design §15.3). */
const LAYERS: Record<string, Rules> = {
  packs: { packRate: [0, 0, 0] },
  front: { maxInstallations: 0, deviceCondition: 99 },
  escalation: { escalationStart: 99 },
  designations: { designationRate: [0, 0, 0] },
  surprises: { reinforcementRate: [0, 0, 0], signalRate: [0, 0, 0], crateEmptyShare: 1 },
  adds: { addBreakBonus: 0 },
};
const layerState: Record<string, boolean> = {};
const allLayers = flag("layers") ?? "on";
for (const layer of Object.keys(LAYERS)) {
  let on = allLayers !== "off";
  if (args.includes(`--${layer}`)) on = true;
  if (args.includes(`--no-${layer}`)) on = false;
  const value = flag(layer);
  if (value !== undefined) on = !["off", "0", "false", "no"].includes(value);
  layerState[layer] = on;
  if (!on) for (const [key, off] of Object.entries(LAYERS[layer])) rules[key] = structuredClone(off);
}
/** --rule=key:value · a/b/c is an array · a.b sets a nested key. */
for (const pair of flag("rule")?.split(",") ?? []) {
  const [path, raw] = pair.split(":");
  const keys = path.split(".");
  let target = rules;
  for (const key of keys.slice(0, -1)) {
    if (!Object.hasOwn(target, key)) throw new Error(`Unknown rule ${path}`);
    target = (target[key] = structuredClone(target[key])) as Rules;
  }
  const last = keys[keys.length - 1];
  if (!Object.hasOwn(target, last)) throw new Error(`Unknown rule ${path}`);
  target[last] = raw.includes("/") ? raw.split("/").map(Number) : Number(raw);
}

// ---------------------------------------------------------------- per-fight records

type Kind = "battle" | "elite" | "boss" | "event";
type Shape = "single" | "duo" | "pair" | "trio";
interface Fight {
  stage: number;
  kind: Kind;
  shape: Shape;
  leader: string;
  designations: string[];
  reinforced: boolean;
  shed: boolean;
  arrived: number;
  signal: string | null;
  signalFired: boolean;
  turns: number;
  won: boolean;
  lost: boolean;
  integrityLost: number;
  planted: number;
  destroyed: number;
  wear: number;
  breakdowns: number;
  repairs: number;
  repairEnergy: number;
  scrubEnergy: number;
  maintenance: number;
  energy: number;
  /** Pack fights with a leader: which body fell first. */
  firstKill: "leader" | "escort" | "both" | null;
  crates: string[];
  /** Turns whose announced guardian intent was the ultimate (lethal answers included). */
  ultimateTurns: number;
  ultimates: number;
  interrupts: number;
  ultimatesWithAdds: number;
  interruptsWithAdds: number;
  earlyCharge: boolean;
}
const shapeOf = (run: RunState): Shape => {
  const escorts = run.enemies.filter(enemy => enemy.role === "escort").length;
  const leader = run.enemies.some(enemy => enemy.role === "leader");
  return !leader && escorts ? "duo" : escorts === 0 ? "single" : escorts === 1 ? "pair" : "trio";
};
const MAINTENANCE_CARDS = new Set(["field-repair", "redundant-psu", "demolition-charge"]);

// ---------------------------------------------------------------- aggregation helpers

const mean = (values: number[]) => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0;
const share = (part: number, whole: number) => whole ? +(part / whole).toFixed(3) : 0;
function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) (groups[key(item)] ??= []).push(item);
  return groups;
}
function fightSummary(fights: Fight[]) {
  return {
    fights: fights.length,
    winRate: share(fights.filter(f => f.won).length, fights.length),
    turns: mean(fights.map(f => f.turns)),
    integrityLost: mean(fights.map(f => f.integrityLost)),
  };
}

// ---------------------------------------------------------------- the probe

const output: Record<string, unknown>[] = [];
for (const archetype of archetypes) {
  for (const policy of policies) {
    const guardians = Object.fromEntries(["regent", "cantor", "core"].map(id => [id, { encounters: 0, wins: 0, losses: 0, turns: 0, ultimates: 0, interrupts: 0, ultimateDamage: 0, reachedUltimate: 0, ultimatesWithAdds: 0, interruptsWithAdds: 0, earlyCharges: 0 }]));
    const sampleWinningSeeds: number[] = [];
    const fights: Fight[] = [];
    let wins = 0, reachedCore = 0, winIntegrity = 0, defeatedAt = 0;
    const lostTo: Record<string, number> = {};
    const lostInStage = [0, 0, 0];
    const reachedStage = [0, 0, 0];
    const income: number[][] = [[], [], []];
    const ledger: Record<string, number> = {};
    const messages: Record<string, number> = {};
    /** Tactical tools the policy used: targets, scrubs, repairs, moves out of reach, v4 cards. */
    const tools: Record<string, number> = {};
    const V4_TOOLS = new Set(["phantom-node", "server-rack", "redundant-psu", "field-repair", "demolition-charge", "broadcast-storm", "packet-storm", "flood-fill", "traffic-shaping", "quorum", "bulkhead", "spearhead", "sentry-firewall", "rapid-redeploy", "patch", "reroute", "protocol"]);
    for (let seed = 1; seed <= seeds; seed++) {
      const r = newExpedition(archetype, Math.imul(seed, 0x9e3779b1) >>> 0, false, ascension).run;
      let moves = 0, battleTurns = 0, battleKind: Kind = "battle", battleLeader = "";
      let fight: Fight | null = null;
      let startIntegrity = 0;
      const stageIncome = [0, 0, 0];
      const seen = [false, false, false];
      let credits = r.credits;
      const dead = new Set<string>();
      const logOffer = (kind: string, id: string) => { messages[`${kind}:${id}`] = (messages[`${kind}:${id}`] ?? 0) + 1; };
      const note = () => {
        const gained = r.credits - credits;
        if (gained > 0) stageIncome[Math.min(2, r.stage)] += gained;
        credits = r.credits;
        if (r.stage <= 2 && !seen[r.stage]) { seen[r.stage] = true; reachedStage[r.stage]++; }
      };
      /** Pack fights with a leader: the first body to fall decides the kill order. */
      const checkDeaths = () => {
        if (!fight) return;
        const fallen = r.enemies.filter(enemy => enemy.hp <= 0 && !dead.has(enemy.uid));
        if (!fallen.length) return;
        for (const enemy of fallen) dead.add(enemy.uid);
        if (fight.firstKill !== null || fight.shape === "single" || fight.shape === "duo") return;
        const leaders = fallen.some(enemy => enemy.role === "leader"), escorts = fallen.some(enemy => enemy.role === "escort");
        fight.firstKill = leaders && escorts ? "both" : leaders ? "leader" : escorts ? "escort" : null;
      };
      const closeFight = () => {
        if (!fight) return;
        fight.turns = battleTurns;
        fight.integrityLost = startIntegrity - r.integrity;
        fights.push(fight);
        const guardian = guardians[fight.leader];
        if (fight.kind === "boss" && guardian) {
          if (fight.ultimates > 0) guardian.reachedUltimate++;
          if (fight.earlyCharge) guardian.earlyCharges++;
        }
        fight = null;
        battleTurns = 0;
        dead.clear();
      };
      while (r.phase !== "won" && r.phase !== "lost" && moves++ < 2500) {
        note();
        if (r.phase === "battle") {
          if (battleTurns === 0 && !fight) {
            battleKind = (r.map.find(room => room.id === r.currentRoom)?.type ?? "battle") as Kind;
            const scale = battleKind === "battle" ? hpScale : battleKind === "boss" ? bossScale : 1;
            if (scale !== 1) for (const enemy of r.enemies) enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * scale);
            const leader = leaderOf(r);
            battleLeader = leader?.id ?? r.enemies[0]?.id ?? "";
            if (leader && guardians[leader.id]) guardians[leader.id].encounters++;
            if (leader?.id === "core") reachedCore++;
            startIntegrity = r.integrity;
            fight = {
              stage: r.stage, kind: battleKind, shape: shapeOf(r), leader: battleLeader,
              designations: [...(leader?.designations ?? [])],
              reinforced: !!r.reinforcement && !r.reinforcement.shed, shed: !!r.reinforcement?.shed, arrived: 0,
              signal: r.signal?.id ?? null, signalFired: false,
              turns: 0, won: false, lost: false, integrityLost: 0, planted: 0, destroyed: 0, wear: 0, breakdowns: 0,
              repairs: 0, repairEnergy: 0, scrubEnergy: 0, maintenance: 0, energy: 0, firstKill: null, crates: [],
              ultimateTurns: 0, ultimates: 0, interrupts: 0, ultimatesWithAdds: 0, interruptsWithAdds: 0, earlyCharge: false,
            };
            checkDeaths();
          }
          const current = fight!;
          resolveOffers(r, logOffer);
          // Energy bookkeeping through the bot's action stream.
          let energy = r.energy;
          const installsBefore = new Set(r.installations.map(item => item.id));
          playBotTurn(r, policy, (action: BotAction) => {
            const spent = Math.max(0, energy - r.energy);
            energy = r.energy;
            current.energy += spent;
            const card = action.card ? baseCard(action.card) : "";
            const tool = action.kind === "move" ? (action.purpose ? "move:maintenance" : "") : ["focus", "scrub", "repair"].includes(action.kind) ? action.kind : V4_TOOLS.has(card) && action.kind !== "prepare" ? card : "";
            if (tool) tools[tool] = (tools[tool] ?? 0) + 1;
            const maintenance = action.kind === "scrub" || action.kind === "repair" || action.purpose === "maintenance" || MAINTENANCE_CARDS.has(card);
            if (maintenance) current.maintenance += spent;
            if (action.kind === "scrub") current.scrubEnergy += spent;
            if (action.kind === "repair" || card === "redundant-psu" || card === "field-repair") { current.repairs++; current.repairEnergy += spent; }
          });
          current.destroyed += [...installsBefore].filter(id => !r.installations.some(item => item.id === id)).length;
          checkDeaths();
          if (r.phase !== "battle") {
            // The fight ended during the player's turn (Scorched Earth, a trap).
            current.won = r.phase !== "lost";
            current.lost = r.phase === "lost";
            closeFight();
            continue;
          }
          const preview = combatPreview(r), guardian = guardians[battleLeader];
          const result = endTurn(r);
          battleTurns++;
          current.planted += result.planted.length;
          current.destroyed += result.destroyed.length;
          current.wear += result.forecast.wear.reduce((sum, item) => sum + Math.max(0, item.from - item.to), 0);
          current.breakdowns += result.forecast.breakdowns.length;
          current.arrived += result.arrived.filter(item => item.kind === "reinforcement").length;
          if (result.signalFired) current.signalFired = true;
          for (const fallen of result.fallen) if (fallen.crate) current.crates.push(fallen.crate.kind + (fallen.crate.kind !== "empty" && fallen.crate.message ? "+message" : ""));
          if (preview.intent?.kind === "charge" && preview.intent.early) current.earlyCharge = true;
          checkDeaths();
          const guardianAct = preview.hostiles.find(item => item.role === "single" && item.intent?.ultimate);
          if (battleKind === "boss" && guardianAct) current.ultimateTurns++;
          if (battleKind === "boss" && guardianAct && (guardianAct.interrupted || guardianAct.state === "acts")) {
            const adds = preview.hostiles.filter(item => item.role === "add").length;
            current.ultimates++;
            if (result.interrupted) current.interrupts++;
            if (adds) { current.ultimatesWithAdds++; if (result.interrupted) current.interruptsWithAdds++; }
            if (guardian) {
              guardian.ultimates++;
              if (result.interrupted) guardian.interrupts++;
              if (adds) { guardian.ultimatesWithAdds++; if (result.interrupted) guardian.interruptsWithAdds++; }
              guardian.ultimateDamage += result.integrityDamage;
            }
          }
          if (guardian) {
            guardian.turns++;
            if (result.defeated) guardian.wins++;
            if (result.lost) guardian.losses++;
          }
          if (result.lost) lostTo[battleLeader] = (lostTo[battleLeader] ?? 0) + 1;
          if (result.defeated || result.lost || battleTurns > 60) {
            current.won = result.defeated;
            current.lost = result.lost;
            if (battleTurns > 60 && r.phase === "battle") { r.phase = "lost"; lostTo.stalled = (lostTo.stalled ?? 0) + 1; }
            closeFight();
            if ((r.phase as string) === "reward") for (const line of r.creditLedger ?? []) ledger[line.label] = (ledger[line.label] ?? 0) + line.amount;
          }
        } else {
          if (r.phase === "reward") resolveOffers(r, logOffer);
          playMetaPhase(r, policy, { elite, noSignature, priorities: PRIORITIES[archetype] });
        }
      }
      note();
      if (moves >= 2500) throw new Error(`Run did not terminate: ${archetype} ${policy} ${seed} ${r.phase}`);
      for (let stage = 0; stage < 3; stage++) if (r.phase === "won" || r.stage > stage) income[stage].push(stageIncome[stage]);
      if (r.phase === "won") {
        wins++;
        if (sampleWinningSeeds.length < 3) sampleWinningSeeds.push(r.seed);
        winIntegrity += r.integrity;
      } else {
        defeatedAt += r.stage * 7 + r.floor + 1;
        lostInStage[Math.min(2, r.stage)]++;
      }
    }
    for (const guardian of Object.values(guardians)) (guardian as Record<string, number>).averageTurns = guardian.encounters ? +(guardian.turns / guardian.encounters).toFixed(1) : 0;

    // ---- aggregates
    const byKind = groupBy(fights, f => f.kind);
    const normal = byKind.battle ?? [];
    const packsWithLeader = fights.filter(f => f.firstKill !== null && (f.kind === "battle" || f.kind === "elite" || f.kind === "event"));
    const stages = [0, 1, 2].map(stage => {
      const inStage = fights.filter(f => f.stage === stage);
      const energy = inStage.reduce((sum, f) => sum + f.energy, 0);
      const maintenance = inStage.reduce((sum, f) => sum + f.maintenance, 0);
      return {
        stage: stage + 1,
        reached: reachedStage[stage],
        lost: lostInStage[stage],
        survival: share(reachedStage[stage] - lostInStage[stage], reachedStage[stage]),
        ...fightSummary(inStage),
        normal: fightSummary(inStage.filter(f => f.kind === "battle")),
        elite: fightSummary(inStage.filter(f => f.kind === "elite")),
        guardian: fightSummary(inStage.filter(f => f.kind === "boss")),
        maintenanceShare: share(maintenance, energy),
        fightsWithMaintenance: share(inStage.filter(f => f.maintenance > 0).length, inStage.length),
        plantedPerFight: mean(inStage.map(f => f.planted)),
        destroyedPerFight: mean(inStage.map(f => f.destroyed)),
        wearPerFight: mean(inStage.map(f => f.wear)),
        repairsPerFight: mean(inStage.map(f => f.repairs)),
        repairEnergyPerFight: mean(inStage.map(f => f.repairEnergy)),
        scrubEnergyPerFight: mean(inStage.map(f => f.scrubEnergy)),
        breakdownsPerFight: mean(inStage.map(f => f.breakdowns)),
        income: mean(income[stage]),
      };
    });
    const shapes = Object.fromEntries(Object.entries(groupBy(fights.filter(f => f.kind !== "boss"), f => `${f.kind}:${f.shape}`))
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => [key, fightSummary(group)]));
    const designations: Record<string, ReturnType<typeof fightSummary>> = {};
    for (const id of new Set(fights.flatMap(f => f.designations))) designations[id] = fightSummary(fights.filter(f => f.designations.includes(id)));
    const crates: Record<string, number> = {};
    for (const crate of fights.flatMap(f => f.crates)) crates[crate] = (crates[crate] ?? 0) + 1;
    const reinforced = fights.filter(f => f.reinforced), shed = fights.filter(f => f.shed);
    const signals: Record<string, { fights: number; fired: number; winRate: number }> = {};
    for (const [id, group] of Object.entries(groupBy(fights.filter(f => f.signal), f => f.signal!)))
      signals[id] = { fights: group.length, fired: group.filter(f => f.signalFired).length, winRate: share(group.filter(f => f.won).length, group.length) };
    const guardianFights = byKind.boss ?? [];
    const withAdds = guardianFights.reduce((sum, f) => sum + f.ultimatesWithAdds, 0);
    const interruptsWithAdds = guardianFights.reduce((sum, f) => sum + f.interruptsWithAdds, 0);
    const ultimates = guardianFights.reduce((sum, f) => sum + f.ultimates, 0);
    const interrupts = guardianFights.reduce((sum, f) => sum + f.interrupts, 0);
    output.push({
      archetype, policy, ascension, seeds, wins,
      winRate: `${Math.round((wins / seeds) * 100)}%`,
      sampleWinningSeeds, reachedCore, guardians, lostTo,
      averageTurnsPerBattle: mean(fights.map(f => f.turns)),
      averageTurnsPerNormalBattle: mean(normal.map(f => f.turns)),
      averageTurnsPerElite: mean((byKind.elite ?? []).map(f => f.turns)),
      averageTurnsPerGuardian: mean(guardianFights.map(f => f.turns)),
      averageIntegrityOnWin: wins ? +(winIntegrity / wins).toFixed(1) : 0,
      averageLossSector: seeds > wins ? +(defeatedAt / (seeds - wins)).toFixed(1) : 0,
      stages,
      shapes,
      killOrder: {
        packs: packsWithLeader.length,
        escortFirst: share(packsWithLeader.filter(f => f.firstKill === "escort").length, packsWithLeader.length),
        leaderFirst: share(packsWithLeader.filter(f => f.firstKill === "leader").length, packsWithLeader.length),
        together: share(packsWithLeader.filter(f => f.firstKill === "both").length, packsWithLeader.length),
      },
      guardian: {
        fights: guardianFights.length,
        turns: mean(guardianFights.map(f => f.turns)),
        ultimateReached: share(guardianFights.filter(f => f.ultimates > 0).length, guardianFights.length),
        /** The ultimate turn came (the intent was announced), however the player answered it. */
        ultimateTurnReached: share(guardianFights.filter(f => f.ultimateTurns > 0).length, guardianFights.length),
        interruptShare: share(interrupts, ultimates),
        ultimatesWithAdds: withAdds,
        interruptsWithAdds, bracesWithAdds: withAdds - interruptsWithAdds,
        earlyCharges: share(guardianFights.filter(f => f.earlyCharge).length, guardianFights.length),
      },
      designations,
      reinforcements: {
        fights: reinforced.length, arrived: reinforced.filter(f => f.arrived > 0).length,
        winRate: share(reinforced.filter(f => f.won).length, reinforced.length), turns: mean(reinforced.map(f => f.turns)),
        shedFights: shed.length, shedArrived: shed.filter(f => f.arrived > 0).length,
      },
      signals,
      crates,
      messages,
      tools: Object.fromEntries(Object.entries(tools).sort(([a], [b]) => a.localeCompare(b))),
      credits: { perStage: stages.map(s => s.income), ledger },
    });
  }
}
const layers = Object.entries(layerState).map(([layer, on]) => `${layer} ${on ? "on" : "off"}`).join(", ");
const result = {
  notes: `v4 deterministic bots (kill order: ${killOrder}), ${elite ? "elite-seeking" : "default"} routing${noSignature ? ", no signature cards" : ""}, ascension ${ascension}; layers: ${layers}${hpScale !== 1 ? `, normal health ×${hpScale}` : ""}${bossScale !== 1 ? `, guardian health ×${bossScale}` : ""}${flag("rule") ? `, rules ${flag("rule")}` : ""}. Regression probes, not a human difficulty estimate.`,
  layers: layerState,
  profiles: output,
};
console.log(JSON.stringify(result, null, 2));
if (summary) console.error(summarize(result.profiles));

/** A compact table for tuning sessions. */
function summarize(profiles: Record<string, unknown>[]): string {
  const lines: string[] = [];
  for (const p of profiles as any[]) {
    const g = p.guardian, k = p.killOrder;
    lines.push(`${p.archetype}/${p.policy} win ${p.winRate} · turns normal ${p.averageTurnsPerNormalBattle} elite ${p.averageTurnsPerElite} guardian ${p.averageTurnsPerGuardian} · ult ${Math.round(g.ultimateReached * 100)}%/${Math.round(g.ultimateTurnReached * 100)}% int ${Math.round(g.interruptShare * 100)}% (adds ${g.interruptsWithAdds}/${g.ultimatesWithAdds}) · kill esc ${Math.round(k.escortFirst * 100)}% lead ${Math.round(k.leaderFirst * 100)}% both ${Math.round(k.together * 100)}% (${k.packs})`);
    lines.push(`  stages ${p.stages.map((s: any) => `${s.stage}: surv ${Math.round(s.survival * 100)}% n${s.normal.turns} e${s.elite.turns} g${s.guardian.turns} maint ${Math.round(s.maintenanceShare * 100)}%/${Math.round(s.fightsWithMaintenance * 100)}% intLost ${s.integrityLost} inc ${s.income}`).join(" | ")}`);
    lines.push(`  shapes ${Object.entries(p.shapes).map(([key, v]: [string, any]) => `${key} ${v.turns}t ${v.fights}`).join(" · ")}`);
    lines.push(`  lostTo ${Object.entries(p.lostTo).sort((a: any, b: any) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(", ")}`);
  }
  return lines.join("\n");
}
