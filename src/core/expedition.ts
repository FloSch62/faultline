import { CARDS, RELICS } from "./cards.ts";
import { createRun } from "./run.ts";
import { ENEMIES } from "./enemies.ts";
import type { RunState, RelicId, CardId } from "./types.ts";

export type Archetype = "architect" | "warden" | "ghost";
export const ARCHETYPES: Record<
  Archetype,
  {
    name: string;
    title: string;
    story: string;
    relic: RelicId;
    integrity: number;
    art: string;
    color: string;
  }
> = {
  architect: {
    name: "The Architect",
    title: "MAKE A WAY THROUGH",
    story:
      "When the backbone fell, you kept building. Somewhere in the silence, a signal is still waiting.",
    relic: "hot-swap",
    integrity: 14,
    art: "router",
    color: "#a7c9c2",
  },
  warden: {
    name: "The Warden",
    title: "HOLD WHAT REMAINS",
    story:
      "You have watched a thousand firewalls fail. This one holds. This time, you are the boundary.",
    relic: "shield-array",
    integrity: 15,
    art: "shield",
    color: "#dfb87a",
  },
  ghost: {
    name: "The Ghost",
    title: "FIND THE HIDDEN PATH",
    story:
      "Every abandoned system has a back door. Every lost packet leaves a trace. You know where to look.",
    relic: "deep-cache",
    integrity: 12,
    art: "crosslink",
    color: "#99bcd4",
  },
};
export interface Expedition {
  version: 2;
  cardSet?: 2;
  run: RunState;
  archetype: Archetype;
  daily: boolean;
  startedAt: number;
  recorded: boolean;
}
export interface RunRecord {
  seed: number;
  archetype: Archetype;
  won: boolean;
  score: number;
  floor: number;
  at: number;
}
export function newExpedition(
  archetype: Archetype = "architect",
  seed = Date.now() >>> 0,
  daily = false,
): Expedition {
  const run = createRun(seed);
  const profile = ARCHETYPES[archetype];
  run.integrity = run.maxIntegrity = profile.integrity;
  run.relics = [profile.relic];
  const replace = (from: CardId, to: CardId) => {
    const index = run.deck.indexOf(from);
    if (index >= 0) run.deck[index] = to;
  };
  if (archetype === "architect") {
    replace("fiber", "duplex");
    replace("switch", "relay");
  }
  if (archetype === "ghost") {
    let replaced = 0;
    run.deck = run.deck.map((card) =>
      card === "fiber" && replaced++ < 2 ? "crosslink" : card,
    );
  }
  if (archetype === "ghost") {
    replace("firewall", "pulse");
    replace("patch", "diagnostic");
  }
  if (archetype === "warden") {
    replace("router", "hardened-router");
    replace("firewall", "bastion");
    replace("surge", "guard");
  }
  run.phase = "map";
  return {
    version: 2,
    cardSet: 2,
    run,
    archetype,
    daily,
    startedAt: Date.now(),
    recorded: false,
  };
}
export function dailySeed(date = new Date()): number {
  return Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
}
export function parseExpedition(value: string | null): Expedition | null {
  try {
    const e = JSON.parse(value || "null") as Expedition;
    if (!e || e.version !== 2 || !Object.hasOwn(ARCHETYPES, e.archetype))
      return null;
    const r = e.run;
    if (
      !r ||
      !["map", "battle", "reward", "relic", "forge", "won", "lost"].includes(
        r.phase,
      )
    )
      return null;
    if (
      ![
        r.seed,
        r.rng,
        r.integrity,
        r.maxIntegrity,
        r.energy,
        r.turn,
        r.floor,
        r.score,
        r.nextNodeId,
      ].every(Number.isFinite)
    )
      return null;
    if (
      r.integrity < 0 ||
      r.integrity > r.maxIntegrity ||
      r.maxIntegrity <= 0 ||
      r.floor < 0 ||
      r.floor > 7
    )
      return null;
    // Legacy one-stage expeditions resume in their final stage, preserving the
    // promised Core battle and completed outcomes instead of extending the save.
    r.stage ??= 2;
    if (!Number.isInteger(r.stage) || r.stage < 0 || r.stage > 2) return null;
    r.bossIntroSeen ??= true;
    if (typeof r.bossIntroSeen !== "boolean") return null;
    // Alpha adds transient combat resources without invalidating version-2 saves.
    r.exhaustPile ??= [];
    r.block ??= 0;
    r.packetBoost ??= 0;
    r.reserveEnergy ??= 0;
    r.cardsPlayed ??= 0;
    r.preparedCard ??= null;
    if (r.preparedCard !== null && (typeof r.preparedCard !== "string" || !Object.hasOwn(CARDS, r.preparedCard))) return null;
    if (r.enemy?.exposed !== undefined && typeof r.enemy.exposed !== "boolean") return null;
    r.zoneEffects ??= [];
    if (!Array.isArray(r.zoneEffects) || r.zoneEffects.length > 6 || !r.zoneEffects.every(field =>
      field && ["north", "center", "south"].includes(field.zone) &&
      ["resonance", "aegis", "stasis", "corrosion", "suppression"].includes(field.kind) &&
      Number.isInteger(field.turns) && field.turns >= 1 && field.turns <= 3)) return null;
    const fieldSlots = r.zoneEffects.map(field => `${field.zone}:${["corrosion", "suppression"].includes(field.kind)}`);
    if (new Set(fieldSlots).size !== fieldSlots.length) return null;
    if (
      ![r.block, r.packetBoost, r.reserveEnergy, r.cardsPlayed].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    )
      return null;
    if (
      ![
        r.deck,
        r.hand,
        r.drawPile,
        r.discardPile,
        r.exhaustPile,
        r.cardRewards,
      ].every(
        (p) =>
          Array.isArray(p) &&
          p.length <= 200 &&
          p.every((id) => Object.hasOwn(CARDS, id)),
      )
    )
      return null;
    if (
      ![r.relics, r.relicRewards].every(
        (p) => Array.isArray(p) && p.every((id) => Object.hasOwn(RELICS, id)),
      )
    )
      return null;
    if (
      !Array.isArray(r.map) ||
      r.map.length !== 19 ||
      !r.map.every(
        (room) =>
          typeof room.id === "string" &&
          Number.isInteger(room.floor) &&
          Number.isInteger(room.lane) &&
          ["battle", "elite", "cache", "forge", "boss"].includes(room.type),
      )
    )
      return null;
    if (new Set(r.map.map(room => room.id)).size !== r.map.length || r.map.some(room =>
      (room.enemyId !== undefined && !Object.hasOwn(ENEMIES, room.enemyId)) ||
      (room.exits !== undefined && (!Array.isArray(room.exits) || room.exits.some(id =>
        !r.map.some(next => next.id === id && next.floor === room.floor + 1)))))) return null;
    if (
      !Array.isArray(r.log) ||
      !r.log.every((line) => typeof line === "string")
    )
      return null;
    if (!Array.isArray(r.topology?.nodes) || !Array.isArray(r.topology?.links))
      return null;
    if (
      !r.topology.nodes.every(
        (n) =>
          typeof n.id === "string" &&
          ["client", "router", "switch", "firewall"].includes(n.role) &&
          Number.isFinite(n.x) &&
          Number.isFinite(n.z),
      )
    )
      return null;
    const ids = new Set(r.topology.nodes.map((n) => n.id));
    if (ids.size !== r.topology.nodes.length || ids.size > 14) return null;
    if (
      !ids.has("alpha") ||
      !ids.has("omega") ||
      !r.topology.links.every((l) => ids.has(l.a) && ids.has(l.b))
    )
      return null;
    if (
      r.phase === "battle" &&
      (!r.enemy ||
        !Object.hasOwn(ENEMIES, r.enemy.id) ||
        ![r.enemy.hp, r.enemy.maxHp, r.enemy.turn].every(Number.isFinite))
    )
      return null;
    // Preserve earned cards in older saves; never inject rare or legendary rewards.
    if (r.hand.length > 10) r.discardPile.push(...r.hand.splice(10));
    return e;
  } catch {
    return null;
  }
}
