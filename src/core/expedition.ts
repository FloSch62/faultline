import { CARDS, RELICS, STARTER_DECK } from "./cards.ts";
import { createRun } from "./run.ts";
import { ENEMIES } from "./enemies.ts";
import { EVENTS } from "./events.ts";
import { clampAscension, ascends, MAX_ASCENSION } from "./ascension.ts";
import type { RunState, RelicId, CardId, Archetype, ConsoleId } from "./types.ts";

export type { Archetype } from "./types.ts";

export const ARCHETYPES: Record<
  Archetype,
  {
    name: string;
    title: string;
    story: string;
    relic: RelicId;
    console: ConsoleId;
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
    console: "patch",
    integrity: 14,
    art: "router",
    color: "#a7c9c2",
  },
  warden: {
    name: "The Warden",
    title: "HOLD WHAT REMAINS",
    story:
      "You have watched a thousand firewalls fail. This one holds. This time, you are the boundary.",
    relic: "backpressure",
    console: "harden",
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
    console: "buffer",
    integrity: 12,
    art: "crosslink",
    color: "#99bcd4",
  },
};
export const EXPEDITION_VERSION = 3;
export interface Expedition {
  version: 3;
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
  ascension?: number;
}

/** Archetype variations of the shared 17-card starter deck, applied in order. */
const VARIATIONS: Record<Archetype, [from: CardId, to: CardId, count: number][]> = {
  architect: [["fiber", "duplex", 1], ["switch", "relay", 1], ["guard", "load-balancer", 1]],
  // The Bastion replaces the Trust Gate before the Burst becomes a second Trust Gate.
  warden: [["router", "hardened-router", 1], ["firewall", "bastion", 1], ["pulse", "firewall", 1]],
  ghost: [["fiber", "crosslink", 2], ["patch", "diagnostic", 1], ["guard", "store-forward", 1]],
};

export function starterDeck(archetype: Archetype): CardId[] {
  const deck = [...STARTER_DECK];
  for (const [from, to, count] of VARIATIONS[archetype]) {
    let replaced = 0;
    for (let i = 0; i < deck.length && replaced < count; i++)
      if (deck[i] === from) { deck[i] = to; replaced++; }
  }
  return deck;
}

export function newExpedition(
  archetype: Archetype = "architect",
  seed = Date.now() >>> 0,
  daily = false,
  ascension = 0,
): Expedition {
  const run = createRun(seed);
  const profile = ARCHETYPES[archetype];
  run.archetype = archetype;
  run.ascension = clampAscension(ascension);
  run.maxIntegrity = profile.integrity - (ascends(run.ascension, 8) ? 2 : 0);
  run.integrity = run.maxIntegrity;
  run.relics = [profile.relic];
  run.deck = starterDeck(archetype);
  if (ascends(run.ascension, 5)) run.deck.push("cve");
  run.phase = "map";
  return {
    version: 3,
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

// ---------------------------------------------------------------- validation

const PHASES = ["map", "battle", "reward", "relic", "forge", "shop", "event", "won", "lost"];
const ROLES = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer"];
const ROOM_TYPES = ["battle", "elite", "cache", "forge", "boss", "shop", "event"];
const FIELD_KINDS = ["resonance", "aegis", "stasis", "corrosion", "suppression"];
const HOSTILE_FIELDS = ["corrosion", "suppression"];

const isCard = (id: unknown): id is CardId => typeof id === "string" && Object.hasOwn(CARDS, id);
const isRelic = (id: unknown): id is RelicId => typeof id === "string" && Object.hasOwn(RELICS, id);
const finite = (value: unknown, min = -Infinity) => typeof value === "number" && Number.isFinite(value) && value >= min;
const integer = (value: unknown, min = -Infinity, max = Infinity) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const point = (value: unknown) =>
  !!value && typeof value === "object" && finite((value as { x: unknown }).x) && finite((value as { z: unknown }).z);

function validShop(shop: unknown): boolean {
  if (shop === null) return true;
  if (!shop || typeof shop !== "object") return false;
  const s = shop as RunState["shop"] & object;
  const offers = <T>(list: unknown, valid: (id: unknown) => id is T, max: number) =>
    Array.isArray(list) && list.length <= max && list.every(offer =>
      offer && valid(offer.id) && integer(offer.price, 0) && typeof offer.sold === "boolean");
  return offers(s.cards, isCard, 8) && offers(s.relics, isRelic, 4) &&
    integer(s.removePrice, 0) && integer(s.upgradePrice, 0) &&
    typeof s.removed === "boolean" && typeof s.upgraded === "boolean";
}

function validEvent(event: unknown, deckLength: number): boolean {
  if (event === null) return true;
  if (!event || typeof event !== "object") return false;
  const e = event as NonNullable<RunState["event"]>;
  return typeof e.id === "string" && Object.hasOwn(EVENTS, e.id) &&
    typeof e.resolved === "boolean" &&
    (e.outcome === undefined || typeof e.outcome === "string") &&
    (e.cards === undefined || (Array.isArray(e.cards) && e.cards.length <= 3 && e.cards.every(isCard))) &&
    (e.relic === undefined || isRelic(e.relic)) &&
    (e.enemyId === undefined || (typeof e.enemyId === "string" && Object.hasOwn(ENEMIES, e.enemyId))) &&
    (e.picks === undefined || (Array.isArray(e.picks) && e.picks.length <= 3 && e.picks.every(i => integer(i, 0, deckLength - 1))));
}

function validFields(fields: unknown): boolean {
  if (!Array.isArray(fields) || fields.length > 9) return false;
  if (!fields.every(field =>
    field && ["north", "center", "south"].includes(field.zone) &&
    FIELD_KINDS.includes(field.kind) && optionalBoolean(field.permanent) &&
    integer(field.turns, 1, field.permanent ? 999 : 4))) return false;
  // One allied and one hostile field per band, plus one permanent terrain field.
  const slots = fields.map(field =>
    `${field.zone}:${HOSTILE_FIELDS.includes(field.kind)}:${field.permanent === true}`);
  return new Set(slots).size === slots.length;
}

export function parseExpedition(value: string | null): Expedition | null {
  try {
    const e = JSON.parse(value || "null") as Expedition;
    // Versions before 3 predate the network redesign and cannot be continued.
    if (!e || e.version !== EXPEDITION_VERSION || !Object.hasOwn(ARCHETYPES, e.archetype))
      return null;
    if (typeof e.daily !== "boolean" || typeof e.recorded !== "boolean" || !finite(e.startedAt)) return null;
    const r = e.run;
    if (!r || !PHASES.includes(r.phase)) return null;
    if (![r.seed, r.rng, r.integrity, r.maxIntegrity, r.energy, r.turn, r.floor, r.score, r.nextNodeId].every(v => finite(v)))
      return null;
    if (r.integrity < 0 || r.integrity > r.maxIntegrity || r.maxIntegrity <= 0 || r.floor < 0 || r.floor > 7)
      return null;
    if (!integer(r.stage, 0, 2) || typeof r.bossIntroSeen !== "boolean") return null;
    // v3 expedition state.
    if (r.archetype !== e.archetype || !integer(r.ascension, 0, MAX_ASCENSION)) return null;
    if (!integer(r.credits, 0) || !integer(r.removals, 0)) return null;
    if (r.creditsEarned !== undefined && !integer(r.creditsEarned, 0)) return null;
    if (r.seenEvents !== undefined && !(Array.isArray(r.seenEvents) && r.seenEvents.length <= 40 &&
      r.seenEvents.every(id => typeof id === "string" && Object.hasOwn(EVENTS, id)))) return null;
    if (!validShop(r.shop) || !validEvent(r.event, r.deck?.length ?? 0)) return null;
    if (r.phase === "shop" && !r.shop) return null;
    if (r.phase === "event" && !r.event) return null;
    // v3 combat state.
    if (!integer(r.consoleUses, 0, 2) || !finite(r.buffer, 0) || typeof r.buffering !== "boolean" || !finite(r.backpressure, 0))
      return null;
    if (!Array.isArray(r.protocols) || r.protocols.length > 2 || !r.protocols.every(isCard)) return null;
    if (!Array.isArray(r.malware) || r.malware.length > 3 ||
      !r.malware.every(m => m && typeof m.id === "string" && point(m))) return null;
    if (r.terrain !== null && !(r.terrain && typeof r.terrain.name === "string" &&
      typeof r.terrain.description === "string" && Array.isArray(r.terrain.debris) &&
      r.terrain.debris.length <= 6 && r.terrain.debris.every(point))) return null;
    if (r.preparedCard !== null && !isCard(r.preparedCard)) return null;
    if (r.enemy?.exposed !== undefined && typeof r.enemy.exposed !== "boolean") return null;
    if (!validFields(r.zoneEffects)) return null;
    if (![r.block, r.packetBoost, r.reserveEnergy, r.cardsPlayed].every(v => finite(v, 0))) return null;
    if (typeof r.firstFiberPlayed !== "boolean" || typeof r.shieldArrayUsed !== "boolean" || !optionalBoolean(r.watchdogUsed)) return null;
    if (![r.deck, r.hand, r.drawPile, r.discardPile, r.exhaustPile, r.cardRewards].every(p =>
      Array.isArray(p) && p.length <= 200 && p.every(isCard))) return null;
    if (r.hand.length > 10) return null;
    if (![r.relics, r.relicRewards].every(p => Array.isArray(p) && p.every(isRelic))) return null;
    if (!Array.isArray(r.map) || r.map.length !== 19 || !r.map.every(room =>
      typeof room.id === "string" && integer(room.floor, 0, 6) && integer(room.lane, 0, 2) &&
      ROOM_TYPES.includes(room.type) && typeof room.cleared === "boolean"))
      return null;
    if (new Set(r.map.map(room => room.id)).size !== r.map.length || r.map.some(room =>
      (room.enemyId !== undefined && !Object.hasOwn(ENEMIES, room.enemyId)) ||
      !Array.isArray(room.exits) || room.exits.some(id =>
        !r.map.some(next => next.id === id && next.floor === room.floor + 1)))) return null;
    if ((r.currentRoom !== null && !r.map.some(room => room.id === r.currentRoom)) ||
      (r.lastRoom !== null && !r.map.some(room => room.id === r.lastRoom))) return null;
    if (!Array.isArray(r.log) || !r.log.every(line => typeof line === "string")) return null;
    if (!Array.isArray(r.topology?.nodes) || !Array.isArray(r.topology?.links)) return null;
    if (!r.topology.nodes.every(n =>
      typeof n.id === "string" && ROLES.includes(n.role) && finite(n.x) && finite(n.z) &&
      [n.fixed, n.shielded, n.upgraded, n.amplified, n.configured, n.salvage, n.stateful].every(optionalBoolean)))
      return null;
    const ids = new Set(r.topology.nodes.map(n => n.id));
    if (ids.size !== r.topology.nodes.length || ids.size > 14) return null;
    if (!ids.has("alpha") || !ids.has("omega") || !r.topology.links.every(l =>
      ids.has(l.a) && ids.has(l.b) && optionalBoolean(l.armored) && optionalBoolean(l.boosted)))
      return null;
    if ((r.faultNode !== null && !ids.has(r.faultNode)) || (r.faultLink !== null && typeof r.faultLink !== "string")) return null;
    if (r.phase === "battle" && (!r.enemy || !Object.hasOwn(ENEMIES, r.enemy.id) ||
      ![r.enemy.hp, r.enemy.maxHp, r.enemy.turn].every(v => finite(v))))
      return null;
    return e;
  } catch {
    return null;
  }
}

