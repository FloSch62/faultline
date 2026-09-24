import { CARDS, RELICS, RULES, STARTER_DECK } from "./cards.ts";
import { createRun } from "./run.ts";
import { DESIGNATIONS, ENEMIES, MESSAGE_OPTIONS, SIGNALS } from "./enemies.ts";
import { EVENTS } from "./events.ts";
import { createMap } from "./map.ts";
import { clampAscension, ascends, MAX_ASCENSION } from "./ascension.ts";
import type { RunState, RelicId, CardId, Archetype, ConsoleId, CrateContents, Offer, Port } from "./types.ts";

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
export const EXPEDITION_VERSION = 4;
export interface Expedition {
  version: 4;
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
  // The chart reads the ascension (pack frequency, second designations).
  run.map = createMap(0, seed, run.ascension);
  run.maxIntegrity = profile.integrity - (ascends(run.ascension, 8) ? 2 : 0);
  run.integrity = run.maxIntegrity;
  run.relics = [profile.relic];
  run.deck = starterDeck(archetype);
  if (ascends(run.ascension, 5)) run.deck.push("cve");
  run.phase = "map";
  return {
    version: EXPEDITION_VERSION,
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
const ROLES = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom"];
const ROOM_TYPES = ["battle", "elite", "cache", "forge", "boss", "shop", "event"];
const FIELD_KINDS = ["resonance", "aegis", "stasis", "corrosion", "suppression"];
const HOSTILE_FIELDS = ["corrosion", "suppression"];
const ZONES = ["north", "center", "south"];
const PORTS: readonly Port[] = ["left", "centre", "right"];
const HOSTILE_ROLES = ["single", "leader", "escort", "add"];
const INSTALLATION_KINDS = ["tap", "jammer", "spike", "anchor", "breaker"];
/** The build grid (run.ts GRID): every installation and wreck stands inside it. */
const GRID = { x: 7.25, z: 4.7 };
/** Design caps, independent of the balance flags that turn a layer off. */
const MAX_INSTALLATIONS = 4;
const MAX_INTEGRITY = 3;
const MAX_CONDITION = 4;

const isCard = (id: unknown): id is CardId => typeof id === "string" && Object.hasOwn(CARDS, id);
const isRelic = (id: unknown): id is RelicId => typeof id === "string" && Object.hasOwn(RELICS, id);
const finite = (value: unknown, min = -Infinity) => typeof value === "number" && Number.isFinite(value) && value >= min;
const integer = (value: unknown, min = -Infinity, max = Infinity) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const point = (value: unknown) =>
  !!value && typeof value === "object" && finite((value as { x: unknown }).x) && finite((value as { z: unknown }).z);
const inGrid = (value: unknown) => point(value) &&
  Math.abs((value as { x: number }).x) <= GRID.x && Math.abs((value as { z: number }).z) <= GRID.z;
const isPort = (value: unknown): value is Port => PORTS.includes(value as Port);
const isDesignations = (value: unknown) => Array.isArray(value) && value.length >= 1 && value.length <= 2 &&
  new Set(value).size === value.length && value.every(id => typeof id === "string" && Object.hasOwn(DESIGNATIONS, id));

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
    field && ZONES.includes(field.zone) &&
    FIELD_KINDS.includes(field.kind) && optionalBoolean(field.permanent) && optionalBoolean(field.signal) &&
    integer(field.turns, 1, field.permanent ? 999 : 4))) return false;
  // One allied and one hostile field per band, plus one permanent terrain field and one signal field.
  const slots = fields.map(field =>
    `${field.zone}:${HOSTILE_FIELDS.includes(field.kind)}:${field.permanent === true}:${field.signal === true}`);
  return new Set(slots).size === slots.length;
}

/** Crate shapes (section 8.2): salvage role, credits, two named cards, or empty. */
function validCrate(value: unknown): value is CrateContents {
  if (!isObject(value)) return false;
  const message = optionalBoolean(value.message);
  if (value.kind === "empty") return true;
  if (value.kind === "salvage") return message && ROLES.includes(value.role as string) && value.role !== "client";
  if (value.kind === "credits") return message && integer(value.amount, 0, 999);
  if (value.kind === "card") return message && Array.isArray(value.cards) && value.cards.length === 2 && value.cards.every(isCard);
  return false;
}

function validOffer(value: unknown): value is Offer {
  if (!isObject(value)) return false;
  if (value.kind === "crate-card")
    return Array.isArray(value.cards) && value.cards.length >= 1 && value.cards.length <= 2 && value.cards.every(isCard);
  if (value.kind !== "message" || typeof value.sender !== "string" || typeof value.text !== "string") return false;
  const options = value.options;
  return Array.isArray(options) && options.length >= 1 && options.length <= 3 &&
    new Set(options.map(option => option?.id)).size === options.length &&
    options.every(option => isObject(option) && typeof option.id === "string" && Object.hasOwn(MESSAGE_OPTIONS, option.id) &&
      (option.card === undefined || isCard(option.card)) && (option.amount === undefined || integer(option.amount, 0, 999)));
}

/** Hostiles on the rail: 0–3 (1–3 in battle), distinct ports and uids, at most one leader or single. */
function validEnemies(value: unknown, battle: boolean): boolean {
  if (!Array.isArray(value) || value.length > 3 || (battle && value.length < 1)) return false;
  if (!value.every(enemy => {
    if (!isObject(enemy) || typeof enemy.id !== "string" || !Object.hasOwn(ENEMIES, enemy.id)) return false;
    const kind = ENEMIES[enemy.id].kind;
    const roleFits = enemy.role === "escort" ? kind === "escort" : enemy.role === "add" ? kind === "add" : kind === "hostile";
    return typeof enemy.uid === "string" && /^h\d+$/.test(enemy.uid) &&
      typeof enemy.name === "string" && typeof enemy.title === "string" &&
      finite(enemy.maxHp, 1) && finite(enemy.hp) && (enemy.hp as number) <= (enemy.maxHp as number) &&
      integer(enemy.turn, 0) && finite(enemy.color, 0) && isPort(enemy.port) &&
      HOSTILE_ROLES.includes(enemy.role as string) && roleFits &&
      (enemy.cadence === undefined || enemy.cadence === "odd" || enemy.cadence === "even") &&
      (enemy.designations === undefined || (Array.isArray(enemy.designations) && (enemy.designations.length === 0 || isDesignations(enemy.designations)))) &&
      (enemy.crate === undefined || validCrate(enemy.crate)) &&
      [enemy.designationHidden, enemy.exposed, enemy.shed, enemy.chargedEarly, enemy.skipNext, enemy.entered].every(optionalBoolean) &&
      (enemy.step === undefined || integer(enemy.step, 0, 99)) &&
      (enemy.resume === undefined || integer(enemy.resume, 0, 99)) && (enemy.wakes === undefined || integer(enemy.wakes, 0, 999)) &&
      [enemy.skipCharge, enemy.looted].every(optionalBoolean) &&
      (enemy.band === undefined || ZONES.includes(enemy.band as string)) &&
      (enemy.surge === undefined || integer(enemy.surge, 0, 3)) &&
      (enemy.echo === undefined || integer(enemy.echo, 0, 99));
  })) return false;
  const enemies = value as { port: Port; uid: string; role: string }[];
  return new Set(enemies.map(enemy => enemy.port)).size === enemies.length &&
    new Set(enemies.map(enemy => enemy.uid)).size === enemies.length &&
    enemies.filter(enemy => enemy.role === "leader" || enemy.role === "single").length <= 1;
}

/** Installations: at most 4, valid kinds, integrity 1–3, countdown 1–2 on Breaker Charges only, inside the grid. */
function validInstallations(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_INSTALLATIONS) return false;
  if (!value.every(item => isObject(item) && typeof item.id === "string" && INSTALLATION_KINDS.includes(item.kind as string) &&
    inGrid(item) && integer(item.integrity, 1, MAX_INTEGRITY) && integer(item.activeFrom, 0) &&
    typeof item.owner === "string" && optionalString(item.aim) &&
    (item.kind === "breaker" ? integer(item.countdown, 1, Math.max(1, RULES.breakerCountdown)) : item.countdown === undefined))) return false;
  return new Set(value.map(item => item.id)).size === value.length;
}

function validReinforcement(value: unknown): boolean {
  if (value === null) return true;
  return isObject(value) && typeof value.enemyId === "string" && ENEMIES[value.enemyId]?.kind === "escort" &&
    integer(value.after, -1, 3) && finite(value.hp, 1) && validCrate(value.crate) && optionalBoolean(value.shed) &&
    (value.after !== -1 || value.shed === true);
}

function validSignal(value: unknown, turn: number): boolean {
  if (value === null) return true;
  return isObject(value) && typeof value.id === "string" && Object.hasOwn(SIGNALS, value.id) &&
    integer(value.firesOnTurn, 1, Math.max(99, turn + 1)) && typeof value.resolved === "boolean" &&
    (value.zone === undefined || ZONES.includes(value.zone as string)) &&
    (value.socket === undefined || inGrid(value.socket)) &&
    optionalString(value.nodeId) && optionalString(value.enemyUid) && optionalBoolean(value.announced) &&
    optionalString(value.text) && (value.role === undefined || ROLES.includes(value.role as string));
}

function validTurnEffects(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  return [value.everyPort, value.focusBonus, value.firewallBonus].every(v => v === undefined || finite(v, 0)) &&
    [value.forceFocus, value.spearhead].every(optionalBoolean) &&
    (value.discounted === undefined || (Array.isArray(value.discounted) && value.discounted.length <= 10 && value.discounted.every(isCard)));
}

/** v3 → v4, in memory and one way (section 15.5): the single hostile stands at the centre,
 * malware becomes Siphon Taps, faults become lists, deployed devices get their condition,
 * and every new encounter field takes its empty value. */
function migrateV3(e: Record<string, unknown>): boolean {
  const r = e.run as Record<string, unknown> | undefined;
  if (!isObject(r)) return false;
  // Fields a v4 state already carries are kept (a save merely labelled 3 must not lose them).
  const enemy = isObject(r.enemy) ? r.enemy : null;
  if (!Array.isArray(r.enemies)) r.enemies = enemy ? [{ ...enemy, uid: "h1", port: "centre", role: "single" }] : [];
  const malware = Array.isArray(r.malware) ? r.malware : [];
  if (!Array.isArray(r.installations)) r.installations = malware.map(item => ({
    id: isObject(item) ? item.id : undefined, kind: "tap", x: isObject(item) ? item.x : undefined, z: isObject(item) ? item.z : undefined,
    integrity: RULES.installationIntegrity.tap, activeFrom: 0, owner: "h1",
  }));
  if (!Array.isArray(r.faultNodes)) r.faultNodes = typeof r.faultNode === "string" ? [r.faultNode] : [];
  if (!Array.isArray(r.faultLinks)) r.faultLinks = typeof r.faultLink === "string" ? [r.faultLink] : [];
  for (const key of ["enemy", "malware", "faultNode", "faultLink"]) delete r[key];
  const nodes = isObject(r.topology) && Array.isArray(r.topology.nodes) ? r.topology.nodes : [];
  for (const node of nodes)
    if (isObject(node) && !node.fixed && node.condition === undefined)
      node.condition = node.salvage ? RULES.salvageCondition : RULES.deviceCondition;
  const actions = enemy && integer(enemy.turn, 0) ? enemy.turn as number : 0;
  r.focus ??= (r.enemies as unknown[]).length ? "centre" : null;
  r.aims ??= {};
  r.enemyPhase ??= actions;
  r.hostileActions ??= actions;
  r.reinforcement ??= null;
  r.signal ??= null;
  r.offers ??= [];
  r.encounterCards ??= [];
  e.version = EXPEDITION_VERSION;
  return true;
}

export function parseExpedition(value: string | null): Expedition | null {
  try {
    const raw = JSON.parse(value || "null") as Record<string, unknown> | null;
    if (!isObject(raw)) return null;
    // v3 is a strict subset of v4 and migrates; versions before 3 predate the network redesign.
    if (raw.version === 3 && !migrateV3(raw)) return null;
    const e = raw as unknown as Expedition;
    if (e.version !== EXPEDITION_VERSION || !Object.hasOwn(ARCHETYPES, e.archetype)) return null;
    if (typeof e.daily !== "boolean" || typeof e.recorded !== "boolean" || !finite(e.startedAt)) return null;
    const r = e.run;
    if (!r || !PHASES.includes(r.phase)) return null;
    if (![r.seed, r.rng, r.integrity, r.maxIntegrity, r.energy, r.turn, r.floor, r.score, r.nextNodeId].every(v => finite(v)))
      return null;
    if (r.integrity < 0 || r.integrity > r.maxIntegrity || r.maxIntegrity <= 0 || r.floor < 0 || r.floor > 7)
      return null;
    if (!integer(r.stage, 0, 2) || typeof r.bossIntroSeen !== "boolean") return null;
    // Expedition state.
    if (r.archetype !== e.archetype || !integer(r.ascension, 0, MAX_ASCENSION)) return null;
    if (!integer(r.credits, 0) || !integer(r.removals, 0)) return null;
    if (r.creditsEarned !== undefined && !integer(r.creditsEarned, 0)) return null;
    if (r.seenEvents !== undefined && !(Array.isArray(r.seenEvents) && r.seenEvents.length <= 40 &&
      r.seenEvents.every(id => typeof id === "string" && Object.hasOwn(EVENTS, id)))) return null;
    if (!validShop(r.shop) || !validEvent(r.event, r.deck?.length ?? 0)) return null;
    if (r.phase === "shop" && !r.shop) return null;
    if (r.phase === "event" && !r.event) return null;
    // Combat state.
    if (!integer(r.consoleUses, 0, 2) || !finite(r.buffer, 0) || typeof r.buffering !== "boolean" || !finite(r.backpressure, 0))
      return null;
    if (!Array.isArray(r.protocols) || r.protocols.length > 2 || !r.protocols.every(isCard)) return null;
    if (r.terrain !== null && !(r.terrain && typeof r.terrain.name === "string" &&
      typeof r.terrain.description === "string" && Array.isArray(r.terrain.debris) &&
      r.terrain.debris.length <= RULES.wreckCap && r.terrain.debris.every(wreck => inGrid(wreck) &&
        optionalBoolean(wreck.fresh) && (wreck.role === undefined || ROLES.includes(wreck.role))))) return null;
    if (r.preparedCard !== null && !isCard(r.preparedCard)) return null;
    if (!validFields(r.zoneEffects)) return null;
    if (![r.block, r.packetBoost, r.reserveEnergy, r.cardsPlayed].every(v => finite(v, 0))) return null;
    if (typeof r.firstFiberPlayed !== "boolean" || typeof r.shieldArrayUsed !== "boolean" || !optionalBoolean(r.watchdogUsed)) return null;
    if (![r.deck, r.hand, r.drawPile, r.discardPile, r.exhaustPile, r.cardRewards].every(p =>
      Array.isArray(p) && p.length <= 200 && p.every(isCard))) return null;
    if (r.hand.length > 10) return null;
    if (![r.relics, r.relicRewards].every(p => Array.isArray(p) && p.every(isRelic))) return null;
    // The chart, v4 fields included.
    if (!Array.isArray(r.map) || r.map.length !== 19 || !r.map.every(room =>
      typeof room.id === "string" && integer(room.floor, 0, 6) && integer(room.lane, 0, 2) &&
      ROOM_TYPES.includes(room.type) && typeof room.cleared === "boolean" &&
      (room.pack === undefined || (Array.isArray(room.pack) && room.pack.length >= 1 && room.pack.length <= 2 &&
        room.pack.every(id => ENEMIES[id]?.kind === "escort"))) &&
      (room.designations === undefined || isDesignations(room.designations)) &&
      optionalBoolean(room.designationHidden) && optionalBoolean(room.reinforced)))
      return null;
    if (new Set(r.map.map(room => room.id)).size !== r.map.length || r.map.some(room =>
      (room.enemyId !== undefined && !(Object.hasOwn(ENEMIES, room.enemyId) && ENEMIES[room.enemyId].kind === "hostile")) ||
      (["battle", "elite", "boss"].includes(room.type) && !room.enemyId && !room.pack?.length) ||
      !Array.isArray(room.exits) || room.exits.some(id =>
        !r.map.some(next => next.id === id && next.floor === room.floor + 1)))) return null;
    if ((r.currentRoom !== null && !r.map.some(room => room.id === r.currentRoom)) ||
      (r.lastRoom !== null && !r.map.some(room => room.id === r.lastRoom))) return null;
    if (!Array.isArray(r.log) || !r.log.every(line => typeof line === "string")) return null;
    // The table: devices with condition, installations, faults and aims.
    if (!Array.isArray(r.topology?.nodes) || !Array.isArray(r.topology?.links)) return null;
    if (!r.topology.nodes.every(n =>
      typeof n.id === "string" && ROLES.includes(n.role) && finite(n.x) && finite(n.z) &&
      [n.fixed, n.shielded, n.upgraded, n.amplified, n.configured, n.salvage, n.stateful, n.sentry].every(optionalBoolean) &&
      (n.maxCondition === undefined || integer(n.maxCondition, 1, MAX_CONDITION)) &&
      (n.condition === undefined || (!n.fixed && integer(n.condition, 0, n.maxCondition ?? MAX_CONDITION))) &&
      (n.absorbs === undefined || integer(n.absorbs, 0, 2)) &&
      (n.deployedBy === undefined || isCard(n.deployedBy))))
      return null;
    const ids = new Set(r.topology.nodes.map(n => n.id));
    if (ids.size !== r.topology.nodes.length || ids.size > 14) return null;
    if (!ids.has("alpha") || !ids.has("omega") || !r.topology.links.every(l =>
      ids.has(l.a) && ids.has(l.b) && optionalBoolean(l.armored) && optionalBoolean(l.boosted)))
      return null;
    if (!Array.isArray(r.faultNodes) || r.faultNodes.length > 14 || !r.faultNodes.every(id => typeof id === "string" && ids.has(id))) return null;
    if (!Array.isArray(r.faultLinks) || r.faultLinks.length > 20 || !r.faultLinks.every(key => typeof key === "string")) return null;
    if (!validInstallations(r.installations)) return null;
    if (!isObject(r.aims) || Object.keys(r.aims).length > 32 || !Object.entries(r.aims).every(([key, port]) =>
      key.length > 0 && key.split("|").every(id => ids.has(id)) && isPort(port))) return null;
    if (r.focus !== null && !isPort(r.focus)) return null;
    // Hostiles, surprises and offers.
    if (!validEnemies(r.enemies, r.phase === "battle")) return null;
    if (!integer(r.enemyPhase, 0, 999) || !integer(r.hostileActions, 0, 9999)) return null;
    if (!validReinforcement(r.reinforcement) || !validSignal(r.signal, r.turn)) return null;
    if (!Array.isArray(r.offers) || r.offers.length > 8 || !r.offers.every(validOffer)) return null;
    // Engine fields (v4 · M1–M2): Reclaim this turn, last phase's attackers, entrance lines.
    if (r.reclaim !== undefined && !finite(r.reclaim, 0)) return null;
    if (r.attackers !== undefined && !(Array.isArray(r.attackers) && r.attackers.length <= 3 && r.attackers.every(uid => typeof uid === "string"))) return null;
    if (r.entrance !== undefined && !(Array.isArray(r.entrance) && r.entrance.length <= 6 && r.entrance.every(line => typeof line === "string"))) return null;
    if (!Array.isArray(r.encounterCards) || r.encounterCards.length > 40 || !r.encounterCards.every(isCard)) return null;
    if (r.lingeringJams !== undefined && !(isObject(r.lingeringJams) &&
      Object.entries(r.lingeringJams).every(([id, turns]) => ids.has(id) && integer(turns, 0, 3)))) return null;
    if (r.frayedByCut !== undefined && !(Array.isArray(r.frayedByCut) && r.frayedByCut.length <= 20 &&
      r.frayedByCut.every(key => typeof key === "string"))) return null;
    if (r.repairsThisTurn !== undefined && !integer(r.repairsThisTurn, 0, 99)) return null;
    if (!validTurnEffects(r.turnEffects)) return null;
    if (r.creditLedger !== undefined && !(Array.isArray(r.creditLedger) && r.creditLedger.length <= 12 &&
      r.creditLedger.every(line => isObject(line) && typeof line.label === "string" && integer(line.amount, 0, 9999)))) return null;
    return e;
  } catch {
    return null;
  }
}
