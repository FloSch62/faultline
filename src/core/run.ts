import { CARDS, RULES, RELICS, STARTER_DECK, baseCard, type CardDefinition } from "./cards.ts";
import {
  canLink,
  disjointPair,
  initialTopology,
  linkKey,
  maximumChannels,
  paths,
  routes as enumerateRoutes,
  type Route,
} from "./graph.ts";
import { createMap, encounterHealth } from "./map.ts";
import { grantVictory } from "./meta.ts";
import { random, shuffle, log } from "./util.ts";
import { ENEMIES } from "./enemies.ts";
import { STAGES } from "./stages.ts";
import { crossesWreckage, frayedLinks, terrainFor } from "./terrain.ts";
import type {
  BaseCardId,
  CardId,
  ConsoleId,
  Malware,
  MapRoom,
  NetworkNode,
  RunState,
  Zone,
  ZoneEffect,
  ZoneEffectKind,
} from "./types.ts";

export type { Zone } from "./types.ts";
export { random } from "./util.ts";
export { RULES } from "./cards.ts";
export {
  chooseRoom, chooseCardReward, chooseRelic, chooseForge, removeDeckCard,
  SALVAGE_COST, SALVAGE_MIN_INTEGRITY,
} from "./meta.ts";
export * from "./meta.ts";

export interface ActionResult {
  ok: boolean;
  message: string;
}
export interface TurnResult {
  signalPath: string[];
  alternatePath: string[];
  channelPaths: string[][];
  packetDamage: number;
  enemyAction: string;
  integrityDamage: number;
  defeated: boolean;
  lost: boolean;
  interrupted: boolean;
  buffered: number;
  bufferReleased: number;
  bufferLost: boolean;
  protocolsTriggered: CardId[];
  enemyDamage: number;
  malwarePlanted: Malware | null;
  junkAdded: CardId[];
  backpressureStored: number;
}
export interface Intent {
  kind: "strike" | "sever" | "jam" | "breach" | "corrupt" | "charge" | "infect";
  ultimate?: boolean;
  field?: "corrosion" | "suppression";
  /** Junk cards shuffled into your draw pile when the action resolves. */
  junk?: { card: CardId; count: number };
  /** Plants malware in addition to its main action (enraged Core jam). */
  infect?: boolean;
  label: string;
  amount: number;
  pressure: number;
  target?: string;
}

export const HAND_LIMIT = RULES.handLimit;
const has = (run: RunState, relic: keyof typeof RELICS) => run.relics.includes(relic);
const card = (id: CardId): CardDefinition => CARDS[id];

function draw(run: RunState, count: number) {
  for (let i = 0; i < count && run.hand.length < HAND_LIMIT; i++) {
    if (!run.drawPile.length && run.discardPile.length) {
      run.drawPile = shuffle(run, run.discardPile.splice(0));
      log(run, "Discard pile reshuffled into deck.");
    }
    const next = run.drawPile.shift();
    if (!next) break;
    run.hand.push(next);
  }
}
function guaranteedDraw(run: RunState, match: (id: CardId) => boolean) {
  const index = run.drawPile.findIndex(match);
  if (index !== -1) run.hand.push(run.drawPile.splice(index, 1)[0]);
}

export function createRun(seed = Date.now() >>> 0): RunState {
  return {
    seed,
    rng: seed || 1,
    stage: 0,
    bossIntroSeen: true,
    phase: "title",
    map: createMap(0, seed),
    currentRoom: null,
    lastRoom: null,
    floor: 0,
    integrity: 12,
    maxIntegrity: 12,
    score: 0,
    deck: [...STARTER_DECK],
    drawPile: [],
    discardPile: [],
    exhaustPile: [],
    block: 0,
    packetBoost: 0,
    reserveEnergy: 0,
    cardsPlayed: 0,
    zoneEffects: [],
    hand: [],
    preparedCard: null,
    relics: [],
    energy: RULES.baseEnergy,
    turn: 1,
    topology: initialTopology(),
    enemy: null,
    faultNode: null,
    faultLink: null,
    nextNodeId: 1,
    cardRewards: [],
    relicRewards: [],
    firstFiberPlayed: false,
    shieldArrayUsed: false,
    log: ["Backbone table initialized."],
    archetype: "architect",
    ascension: 0,
    credits: 0,
    terrain: null,
    malware: [],
    protocols: [],
    consoleUses: 0,
    buffer: 0,
    buffering: false,
    backpressure: 0,
    shop: null,
    event: null,
    removals: 0,
  };
}

/** Energy at the start of a turn before online power injectors. */
function turnEnergyBase(run: RunState): number {
  return RULES.baseEnergy + Number(has(run, "anycast")) + Number(has(run, "jumbo-frames"));
}
function turnDrawBase(run: RunState): number {
  return RULES.handDraw + Number(has(run, "deep-cache")) - Number(has(run, "jumbo-frames"));
}

export function beginBattle(run: RunState, room: MapRoom) {
  const stage = STAGES[run.stage];
  const pool = room.type === "elite" ? stage.elites : stage.encounters;
  const enemyId = room.enemyId ?? (room.type === "boss" ? stage.boss : pool[Math.floor(random(run) * pool.length)]);
  const template = ENEMIES[enemyId];
  const hp = encounterHealth(run.stage, room, run.ascension);
  const { id, name, title, color } = template;
  run.enemy = { id, name, title, color, hp, maxHp: hp, turn: 0 };
  run.bossIntroSeen = room.type !== "boss";
  run.phase = "battle";
  run.turn = 1;
  run.energy = turnEnergyBase(run) + Number(has(run, "cold-start")) - Number(has(run, "sdn-controller"));
  run.topology = initialTopology();
  run.faultNode = null;
  run.faultLink = null;
  run.nextNodeId = 1;
  run.zoneEffects = [];
  const layout = terrainFor(run.seed, run.stage, room.id, run.stage === 0 && room.floor === 0);
  run.terrain = layout.terrain;
  if (layout.salvage)
    run.topology.nodes.push({ ...layout.salvage, id: `${layout.salvage.role}${run.nextNodeId++}` });
  if (layout.field) run.zoneEffects.push(layout.field);
  run.drawPile = shuffle(run, [...run.deck]);
  run.discardPile = [];
  run.exhaustPile = [];
  run.block = has(run, "grounded-core") ? 1 : 0;
  run.packetBoost = 0;
  run.reserveEnergy = 0;
  run.cardsPlayed = 0;
  run.hand = [];
  run.preparedCard = null;
  run.firstFiberPlayed = false;
  run.shieldArrayUsed = false;
  run.watchdogUsed = false;
  run.malware = [];
  run.protocols = [];
  run.consoleUses = 0;
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  guaranteedDraw(run, (id) => ["router", "hardened-router"].includes(baseCard(id)));
  guaranteedDraw(run, (id) => card(id).target === "link");
  guaranteedDraw(run, (id) => card(id).target === "link");
  if (has(run, "spare-parts")) run.hand.push("fiber");
  draw(run, turnDrawBase(run) - run.hand.length + Number(has(run, "spare-parts")));
  log(run, `${run.enemy.name} enters the grid. ${run.terrain.name}. Establish a route.`);
}

export function intentFor(run: RunState, turnsAhead = 0): Intent | null {
  if (!run.enemy) return null;
  const definition = ENEMIES[run.enemy.id];
  const pattern = definition.pattern;
  const turn = run.enemy.turn + turnsAhead;
  const base = pattern[turn % pattern.length];
  const pressure = Math.floor(turn / 3);
  const threshold = definition.boss && run.ascension >= 10 ? 0.6 : 0.5;
  const enraged = !!definition.enrages && run.enemy.hp <= run.enemy.maxHp * threshold;
  const attack = base.kind === "strike" || base.kind === "breach";
  const ascension = attack && run.ascension >= 4 ? 1 : 0;
  const ultimate = base.ultimate && run.ascension >= 10 ? 2 : 0;
  const amount =
    base.amount +
    (attack
      ? pressure + run.stage + (enraged ? definition.enrages!.attacks : 0) + ascension + ultimate
      : enraged && base.kind !== "charge"
        ? definition.enrages!.faults
        : 0);
  const infect = !!(definition.enragedInfect && enraged && base.kind === "jam");
  return {
    ...base,
    ...(infect ? { infect: true } : {}),
    amount,
    pressure,
    label: `${enraged ? "ENRAGED · " : ""}${base.label}${run.stage && attack ? ` +${run.stage} STAGE THREAT` : ""}${pressure && attack ? ` +${pressure} PRESSURE` : ""}${ascension ? " +1 ASCENSION" : ""}`,
  };
}

/** Set one card aside now; it replaces one draw in your next hand. */
export function prepareCard(run: RunState, index: number): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Prepare a card during an encounter." };
  if (run.preparedCard) return { ok: false, message: "Return your prepared card before choosing another." };
  if (!Number.isInteger(index) || index < 0 || !run.hand[index]) return { ok: false, message: "Choose a card from your hand." };
  if (card(run.hand[index]).junk) return { ok: false, message: "Junk cannot be prepared." };
  run.preparedCard = run.hand.splice(index, 1)[0];
  log(run, `${card(run.preparedCard).name} prepared for the next turn, replacing one draw.`);
  return { ok: true, message: `${card(run.preparedCard).name} held for next turn.` };
}

export function releasePreparedCard(run: RunState): ActionResult {
  if (run.phase !== "battle" || !run.preparedCard) return { ok: false, message: "No prepared card to return." };
  if (run.hand.length >= HAND_LIMIT) return { ok: false, message: "Your hand is full. Play a card first." };
  const prepared = run.preparedCard;
  run.hand.push(prepared);
  run.preparedCard = null;
  return { ok: true, message: `${card(prepared).name} returned to your hand.` };
}

export function costFor(run: RunState, index: number): number {
  const id = run.hand[index];
  if (!id) return Infinity;
  const definition = card(id);
  let cost = definition.cost;
  if (baseCard(id) === "fiber" && !run.firstFiberPlayed && has(run, "hot-swap")) cost = 0;
  if (definition.target === "link" && has(run, "zero-trust")) cost += 1;
  return cost;
}
function canPlay(run: RunState, index: number, target: CardDefinition["target"]): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Cards are played during encounters." };
  const id = run.hand[index];
  if (!id || card(id).target !== target)
    return { ok: false, message: "Select a matching card." };
  if (run.energy < costFor(run, index))
    return { ok: false, message: "Not enough energy. End the turn to recharge." };
  return { ok: true, message: "" };
}
function consume(run: RunState, index: number) {
  const id = run.hand[index];
  run.energy -= costFor(run, index);
  run.hand.splice(index, 1);
  (card(id).exhaust ? run.exhaustPile : run.discardPile).push(id);
  run.cardsPlayed++;
  if (baseCard(id) === "fiber") run.firstFiberPlayed = true;
  run.score += 1;
}
/** Generic numeric effects shared by every card after its specific rule. */
function applyValues(run: RunState, id: CardId) {
  const v = card(id).values;
  if (v.block) run.block += v.block;
  if (v.burst) run.packetBoost += v.burst;
  if (v.energy) run.energy += v.energy;
  if (v.nextEnergy) run.reserveEnergy += v.nextEnergy;
  if (v.heal) run.integrity = Math.min(run.maxIntegrity, run.integrity + v.heal);
  if (v.buffer) run.buffer += v.buffer;
  if (v.draw) draw(run, v.draw);
}

// ------------------------------------------------------------------ placement

const GRID = { x: 7.25, z: 4.7 };
/** Why a socket is illegal, or null. `ignore` skips one device (relocation). */
export function isBlocked(run: RunState, x: number, z: number, ignore?: string): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > GRID.x || Math.abs(z) > GRID.z)
    return "Keep hardware inside the build grid.";
  if (run.topology.nodes.some((node) => node.id !== ignore && Math.hypot(node.x - x, node.z - z) < RULES.deviceSpacing))
    return "Device sockets need more space.";
  if (run.terrain?.debris.some((spot) => Math.hypot(spot.x - x, spot.z - z) < RULES.debrisClearance))
    return "Wreckage blocks this socket.";
  if (run.malware.some((spot) => Math.hypot(spot.x - x, spot.z - z) < RULES.debrisClearance))
    return "Malware occupies this socket. Scrub it first.";
  return null;
}
// Deterministic sockets keep deployment readable, replayable, and collision free.
function freeSocket(run: RunState): { x: number; z: number } | null {
  if (run.topology.nodes.length >= RULES.maxDevices) return null;
  for (const x of [0, -2.5, 2.5, -5, 5, -1.25, 1.25, -3.75, 3.75, -7, 7]) {
    for (const z of [0, 2.4, -2.4, 4.2, -4.2, 1.2, -1.2]) {
      if (!isBlocked(run, x, z)) return { x, z };
    }
  }
  return null;
}
export function zoneForNode(node: Pick<NetworkNode, "z">): Zone {
  return node.z < -1.3 ? "north" : node.z > 1.3 ? "south" : "center";
}
export const ZONES: readonly Zone[] = ["north", "center", "south"];
export const FIELD_RULES: Record<ZoneEffectKind, { name: string; rules: string; hostile: boolean }> = {
  resonance: { name: "Resonance", rules: `+${RULES.resonanceDamage} damage when your primary route crosses this band`, hostile: false },
  aegis: { name: "Aegis", rules: `+${RULES.aegisShield} shield while an online device sits in this band`, hostile: false },
  stasis: { name: "Null field", rules: `+${RULES.nullFieldShield} shield while your hardware occupies this band`, hostile: false },
  corrosion: { name: "Corrosion", rules: `+${RULES.corrosionDamage} incoming damage while your hardware occupies this band`, hostile: true },
  suppression: { name: "Suppression", rules: `−${RULES.suppressionPenalty} damage when your primary route crosses this band`, hostile: true },
};
export function zoneDescription(run: RunState, zone: Zone): string {
  const fields = run.zoneEffects.filter(effect => effect.zone === zone);
  return fields.map(effect => `${FIELD_RULES[effect.kind].name}: ${FIELD_RULES[effect.kind].rules} · ${effect.permanent ? "terrain" : `${effect.turns} turn${effect.turns === 1 ? "" : "s"}`}`).join(". ") || "Clear ground · no active fields";
}
function installField(run: RunState, effect: ZoneEffect) {
  // Each band holds one temporary allied and one temporary hostile field. Terrain
  // fields keep their own slot. Recasting replaces that side's temporary field.
  run.zoneEffects = run.zoneEffects.filter(existing => existing.permanent || existing.zone !== effect.zone || FIELD_RULES[existing.kind].hostile !== FIELD_RULES[effect.kind].hostile);
  run.zoneEffects.push(effect);
}
function hostileFieldTurns(run: RunState) {
  return RULES.hostileFieldTurns + (run.ascension >= 9 ? 1 : 0);
}

export function playZone(run: RunState, index: number, zone: Zone): ActionResult {
  const ready = canPlay(run, index, "zone");
  if (!ready.ok) return ready;
  if (!ZONES.includes(zone)) return { ok: false, message: "Choose North, Center, or South." };
  const id = run.hand[index], base = baseCard(id);
  if (base === "purge-field") {
    run.zoneEffects = run.zoneEffects.filter(effect => effect.zone !== zone || !FIELD_RULES[effect.kind].hostile);
    if (run.topology.nodes.some(node => node.id === run.faultNode && zoneForNode(node) === zone)) run.faultNode = null;
    run.malware = run.malware.filter(item => zoneForNode(item) !== zone);
  } else {
    const kind = base === "resonance-field" ? "resonance" : base === "aegis-field" ? "aegis" : "stasis";
    installField(run, { zone, kind, turns: RULES.alliedFieldTurns });
  }
  consume(run, index);
  applyValues(run, id);
  const message = `${card(id).name} · ${zone.toUpperCase()}${base === "purge-field" ? " cleansed" : ` · ${RULES.alliedFieldTurns} turns`}.`;
  log(run, message);
  return { ok: true, message };
}
export function relocateNode(run: RunState, id: string, x: number, z: number): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Relocate devices during an encounter." };
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node || node.fixed)
    return { ok: false, message: "Only deployed devices can be relocated." };
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > GRID.x || Math.abs(z) > GRID.z)
    return { ok: false, message: "Keep hardware inside the build grid." };
  if (Math.hypot(node.x - x, node.z - z) < 0.01)
    return { ok: true, message: "Device position unchanged." };
  if (run.energy < RULES.relocateCost)
    return { ok: false, message: `Relocation costs ${RULES.relocateCost} energy.` };
  const blocked = isBlocked(run, x, z, id);
  if (blocked) return { ok: false, message: blocked };
  const origin = zoneForNode(node);
  node.x = x;
  node.z = z;
  run.energy -= RULES.relocateCost;
  const message = `${id.toUpperCase()} · ${origin.toUpperCase()} → ${zoneForNode(node).toUpperCase()} · ${RULES.relocateCost} energy.`;
  log(run, message);
  return { ok: true, message };
}
/** Link cards that lay armored cable: cut-proof and fray-proof. */
const ARMORED_CABLES: readonly BaseCardId[] = ["armored-fiber", "vxlan", "dark-fiber"];
export const laysArmoredCable = (id: CardId | null) => !!id && ARMORED_CABLES.includes(baseCard(id));
/** Whether a new cable from `a` to `b` would fray over wreckage. `cardId` is the
 * link card in hand, or null for the Patch Cable console. */
export function cableFrays(run: RunState, a: string, b: string, cardId: CardId | null): boolean {
  if (laysArmoredCable(cardId)) return false;
  const from = run.topology.nodes.find((node) => node.id === a), to = run.topology.nodes.find((node) => node.id === b);
  return !!from && !!to && !!run.terrain && crossesWreckage(from, to, run.terrain.debris);
}
function linked(run: RunState, a: string, b: string) {
  return run.topology.links.some(link => linkKey(link.a, link.b) === linkKey(a, b));
}
function nearest(run: RunState, origin: { x: number; z: number; id?: string }, count: number) {
  return run.topology.nodes
    .filter(node => node.id !== origin.id && (!origin.id || !linked(run, origin.id, node.id)))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z) || a.id.localeCompare(b.id))
    .slice(0, count);
}
export function playGround(run: RunState, index: number, x: number, z: number): ActionResult {
  const ready = canPlay(run, index, "ground");
  if (!ready.ok) return ready;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > GRID.x || Math.abs(z) > GRID.z)
    return { ok: false, message: "Place hardware inside the build grid." };
  if (run.topology.nodes.length >= RULES.maxDevices)
    return { ok: false, message: "The table has no more device slots." };
  const blocked = isBlocked(run, x, z);
  if (blocked) return { ok: false, message: blocked };
  const id = run.hand[index], base = baseCard(id);
  const role = card(id).role!;
  if (role === "firewall" && has(run, "anycast"))
    return { ok: false, message: "Anycast forbids firewalls on your table." };
  const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, x, z };
  if (["hardened-router", "relay", "bastion"].includes(base) || id === "stateful-firewall+") node.shielded = true;
  if (base === "stateful-firewall") node.stateful = true;
  const autoLinks = base === "linux-bridge"
    ? nearest(run, { x, z }, card(id).values.links ?? 1)
    : base === "spine-leaf" ? run.topology.nodes.filter(other => other.role === "router") : [];
  run.topology.nodes.push(node);
  for (const other of autoLinks) run.topology.links.push({ a: node.id, b: other.id });
  consume(run, index);
  applyValues(run, id);
  log(run, `${node.id.toUpperCase()} installed${autoLinks.length ? ` and cabled to ${autoLinks.map(n => n.id.toUpperCase()).join(", ")}` : ""}.`);
  return { ok: true, message: `${card(id).name} installed.` };
}
export function playLink(run: RunState, index: number, a: string, b: string): ActionResult {
  const ready = canPlay(run, index, "link");
  if (!ready.ok) return ready;
  if (!canLink(run.topology, a, b))
    return { ok: false, message: "Those devices cannot be linked again." };
  const id = run.hand[index], base = baseCard(id);
  run.topology.links.push({
    a,
    b,
    ...(ARMORED_CABLES.includes(base) ? { armored: true } : {}),
    ...(["conduit", "vxlan"].includes(base) ? { boosted: true } : {}),
  });
  consume(run, index);
  applyValues(run, id);
  log(run, `${a.toUpperCase()} connected to ${b.toUpperCase()}.`);
  return { ok: true, message: "Optic link established." };
}
export function canTargetNode(run: RunState, index: number, id: string): boolean {
  const node = run.topology.nodes.find((item) => item.id === id);
  const held = run.hand[index];
  if (!node || !held || card(held).target !== "node") return false;
  const base = baseCard(held);
  if (base === "clabernetes") return node.role === "router";
  if (base === "firmware") return node.role === "router" && !node.upgraded;
  if (base === "compression") return node.role === "switch" && !node.amplified;
  if (base === "startup-config") return node.role === "router" && !node.configured;
  if (base === "shield") return !node.fixed && !node.shielded;
  if (base === "mesh-weave") return nearest(run, node, 1).length > 0;
  return false;
}
export function playNode(run: RunState, index: number, id: string): ActionResult {
  const ready = canPlay(run, index, "node");
  if (!ready.ok) return ready;
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node) return { ok: false, message: "Select a device." };
  const held = run.hand[index], base = baseCard(held);
  if (!canTargetNode(run, index, id))
    return { ok: false, message: `Choose a valid device for ${card(held).name}.` };
  if (base === "clabernetes") {
    const socket = freeSocket(run);
    if (!socket) return { ok: false, message: "The table has no free socket for a replica." };
    const replica: NetworkNode = {
      id: `router${run.nextNodeId++}`,
      role: "router",
      ...socket,
      shielded: true,
      upgraded: node.upgraded,
      amplified: node.amplified,
      configured: node.configured,
    };
    const links = run.topology.links
      .filter((link) => link.a === id || link.b === id)
      .map((link) => ({ ...link, a: replica.id, b: link.a === id ? link.b : link.a }));
    node.shielded = true;
    if (run.faultNode === node.id) run.faultNode = null;
    run.topology.nodes.push(replica);
    run.topology.links.push(...links);
    consume(run, index);
    log(run, `Clabernetes replicated ${id.toUpperCase()}. Both routers are shielded.`);
    return { ok: true, message: "Router replicated. Its cables and upgrades are preserved." };
  }
  if (base === "mesh-weave") {
    const targets = nearest(run, node, card(held).values.links ?? 2);
    for (const other of targets) run.topology.links.push({ a: node.id, b: other.id });
    consume(run, index);
    log(run, `${node.id.toUpperCase()} woven to ${targets.map(n => n.id.toUpperCase()).join(" and ")}.`);
    return { ok: true, message: `${targets.length} cable${targets.length === 1 ? "" : "s"} woven.` };
  }
  if (base === "shield") {
    node.shielded = true;
    if (run.faultNode === node.id) run.faultNode = null;
  }
  if (base === "compression") node.amplified = true;
  if (base === "startup-config") node.configured = true;
  if (base === "firmware") node.upgraded = true;
  consume(run, index);
  applyValues(run, held);
  log(run, `${node.id.toUpperCase()} ${base === "shield" ? "shielded" : base === "compression" ? "amplified" : base === "startup-config" ? "configured" : "overclocked"}.`);
  return { ok: true, message: `${card(held).name} applied.` };
}
export function playInstant(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "instant");
  if (!ready.ok) return ready;
  const id = run.hand[index], base = baseCard(id), values = card(id).values;
  const network = analyze(run, run.faultNode, run.faultLink);
  const primary = network.primary;
  if (base === "wireshark" && !primary)
    return { ok: false, message: "Wireshark needs a live ALPHA → router → OMEGA route to capture." };
  if (base === "mirror" && network.channelCount < 2)
    return { ok: false, message: "Mirror Protocol needs two or more live channels." };
  if (base === "ecmp" && !primary)
    return { ok: false, message: "Equal-Cost Multipath needs a live route." };
  if (base === "salvage" && !run.discardPile.some((held) => card(held).target === "link"))
    return { ok: false, message: "No cable cards are in your discard pile." };
  if (base === "reflect" && !run.backpressure)
    return { ok: false, message: "No backpressure is stored yet." };
  if (base === "replay-attack" && !run.buffer)
    return { ok: false, message: "Your buffer is empty." };
  const capturedRoles = base === "wireshark" && primary
    ? new Set(primary.path.map(nodeId => run.topology.nodes.find(node => node.id === nodeId)!).filter(node => node.role !== "client").map(node => node.role))
    : null;
  if (base === "containerlab" || base === "rebuild") {
    const socket = freeSocket(run);
    if (!socket) return { ok: false, message: "The table has no free socket for a new lab." };
    const node: NetworkNode = { id: `router${run.nextNodeId++}`, role: "router", ...socket, upgraded: base === "containerlab" };
    run.topology.nodes.push(node);
    run.topology.links.push({ a: "alpha", b: node.id }, { a: node.id, b: "omega" });
  }
  consume(run, index);
  if (["patch", "reroute", "protocol"].includes(base)) {
    run.faultNode = null;
    run.faultLink = null;
  }
  let capturedDraw = 0;
  if (base === "inspect") draw(run, primary ? values.draw ?? 2 : values.drawOffline ?? 1);
  else if (capturedRoles) {
    run.packetBoost += capturedRoles.size;
    const before = run.hand.length;
    draw(run, values.draw ?? 2);
    capturedDraw = run.hand.length - before;
  } else if (base === "mirror") {
    run.packetBoost += (values.perChannel ?? 2) * network.channelCount;
    run.block += (values.perChannel ?? 2) * network.channelCount;
  } else if (base === "ecmp") run.packetBoost += (values.perChannel ?? 2) * network.channelCount;
  else if (base === "deep-inspection") {
    const firewalls = network.onlineNodes.filter(node => node.role === "firewall").length;
    run.block += Math.max(values.minimum ?? 2, (values.perFirewall ?? 2) * firewalls);
  } else if (base === "reflect") run.backpressure *= 2;
  else if (base === "replay-attack") run.buffer *= 2;
  else if (base === "salvage") {
    let recovered = 0;
    for (let i = run.discardPile.length - 1; i >= 0 && recovered < (values.recover ?? 2) && run.hand.length < HAND_LIMIT; i--) {
      if (card(run.discardPile[i]).target !== "link") continue;
      run.hand.push(run.discardPile.splice(i, 1)[0]);
      recovered++;
    }
  } else applyValues(run, id);
  log(
    run,
    capturedRoles
      ? `Wireshark captured ${[...capturedRoles].join(" + ")}: +${capturedRoles.size} burst, drew ${capturedDraw} card${capturedDraw === 1 ? "" : "s"} · exhausted for this encounter.`
      : `${card(id).name} activated${card(id).exhaust ? " · exhausted for this encounter" : ""}.`,
  );
  return { ok: true, message: `${card(id).name} activated.` };
}

/** Arms a protocol. It fires automatically during a matching enemy action. */
export function playProtocol(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "protocol");
  if (!ready.ok) return ready;
  if (run.protocols.length >= RULES.maxProtocols)
    return { ok: false, message: `Only ${RULES.maxProtocols} protocols can be armed at once.` };
  const id = run.hand[index];
  run.energy -= costFor(run, index);
  run.hand.splice(index, 1);
  run.protocols.push(id);
  run.cardsPlayed++;
  run.score += 1;
  log(run, `${card(id).name} armed.`);
  return { ok: true, message: `${card(id).name} armed. It fires on the matching enemy action.` };
}
/** Deletes a playable junk card (Worm). */
export function playJunk(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "junk");
  if (!ready.ok) return ready;
  const id = run.hand[index];
  if (card(id).unplayable)
    return { ok: false, message: `${card(id).name} cannot be played.` };
  run.energy -= costFor(run, index);
  run.hand.splice(index, 1);
  run.exhaustPile.push(id);
  run.cardsPlayed++;
  log(run, `${card(id).name} deleted.`);
  return { ok: true, message: `${card(id).name} deleted.` };
}
export function scrubMalware(run: RunState, id: string): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Scrub malware during an encounter." };
  const index = run.malware.findIndex(item => item.id === id);
  if (index < 0) return { ok: false, message: "Choose malware on the table." };
  if (run.energy < RULES.scrubCost) return { ok: false, message: `Scrubbing costs ${RULES.scrubCost} energy.` };
  run.energy -= RULES.scrubCost;
  run.malware.splice(index, 1);
  log(run, `${id.toUpperCase()} scrubbed.`);
  return { ok: true, message: "Malware scrubbed." };
}

// ------------------------------------------------------------------ console

export const CONSOLES: Record<ConsoleId, { name: string; rules: string; cost: number; target: "instant" | "link" }> = {
  patch: { name: "Patch Cable", cost: 1, target: "link", rules: "Connect two devices with a standard cable. Once per turn." },
  harden: { name: "Harden", cost: 1, target: "instant", rules: `Gain ${RULES.hardenShield} block, +${RULES.hardenPerFirewall} per online firewall. Once per turn.` },
  buffer: { name: "Buffer", cost: 0, target: "instant", rules: `Store this turn's transmission ×${RULES.bufferMultiplier} instead of dealing it. Your next transmission releases the whole buffer. If you have no live route at the start of a turn, the buffer is lost. Use again to cancel.` },
};
export function consoleFor(run: RunState): ConsoleId {
  return run.archetype === "warden" ? "harden" : run.archetype === "ghost" ? "buffer" : "patch";
}
function consoleCost(run: RunState, id: ConsoleId) {
  return CONSOLES[id].cost + (id === "patch" && has(run, "zero-trust") ? 1 : 0);
}
export function consoleState(run: RunState) {
  const id = consoleFor(run), definition = CONSOLES[id], cost = consoleCost(run, id);
  const limit = id === "buffer" ? 1 : has(run, "sdn-controller") ? 2 : 1;
  const active = id === "buffer" && run.buffering;
  const reason = run.phase !== "battle" ? "Available during encounters."
    : active ? "Buffering · use again to cancel."
      : run.consoleUses >= limit ? "Already used this turn."
        : run.energy < cost ? `Needs ${cost} energy.` : "";
  return { id, ...definition, cost, usable: run.phase === "battle" && (active || (run.consoleUses < limit && run.energy >= cost)), reason, active, uses: run.consoleUses, limit };
}
export function useConsole(run: RunState, a?: string, b?: string): ActionResult {
  const state = consoleState(run);
  if (!state.usable) return { ok: false, message: state.reason || "Console unavailable." };
  if (state.id === "buffer") {
    if (run.buffering) {
      run.buffering = false;
      run.consoleUses = Math.max(0, run.consoleUses - 1);
      return { ok: true, message: "Buffering cancelled. This turn transmits normally." };
    }
    run.buffering = true;
    run.consoleUses++;
    log(run, "Buffer armed: this transmission will be stored.");
    return { ok: true, message: `Buffering: this transmission is stored ×${RULES.bufferMultiplier}.` };
  }
  if (state.id === "patch") {
    if (!a || !b || !canLink(run.topology, a, b)) return { ok: false, message: "Choose two unconnected devices." };
    run.topology.links.push({ a, b });
    run.energy -= state.cost;
    run.consoleUses++;
    log(run, `Patch Cable: ${a.toUpperCase()} ↔ ${b.toUpperCase()}.`);
    return { ok: true, message: "Patch cable connected." };
  }
  const firewalls = analyze(run, run.faultNode, run.faultLink).onlineNodes.filter(node => node.role === "firewall").length;
  const gained = RULES.hardenShield + RULES.hardenPerFirewall * firewalls;
  run.block += gained;
  run.energy -= state.cost;
  run.consoleUses++;
  log(run, `Harden: +${gained} block.`);
  return { ok: true, message: `Hardened · +${gained} block.` };
}

// ------------------------------------------------------------------ network analysis

interface ScoredRoute extends Route {
  score: number;
}
interface Network {
  routes: ScoredRoute[];
  primary: ScoredRoute | null;
  channels: ScoredRoute[];
  channelCount: number;
  online: Set<string>;
  onlineNodes: NetworkNode[];
  clusters: Zone[];
  separated: boolean;
}

/** Fields of one kind per band. A cast field and a permanent terrain field stack. */
function fieldBands(run: RunState, kind: ZoneEffectKind): Map<Zone, number> {
  const bands = new Map<Zone, number>();
  for (const field of run.zoneEffects)
    if (field.kind === kind) bands.set(field.zone, (bands.get(field.zone) ?? 0) + 1);
  return bands;
}
function analyze(run: RunState, faultNode: string | null, faultLink: string | null, light = false): Network {
  const nodes = run.topology.nodes;
  const all = enumerateRoutes(
    run.topology,
    faultNode ? new Set([faultNode]) : new Set(),
    faultLink ? new Set([faultLink]) : new Set(),
    frayedLinks(run.topology, run.terrain),
  );
  const zoneBit: Record<Zone, number> = { north: 1, center: 2, south: 4 };
  const lens = has(run, "packet-lens");
  const contribution = nodes.map(node =>
    (node.role === "switch" ? (lens ? RULES.packetLensSwitchDamage : RULES.switchDamage) + (node.amplified ? RULES.compressionDamage : 0) : 0) +
    (node.role === "router" ? (node.configured ? RULES.configuredDamage : 0) + (node.upgraded ? RULES.overclockDamage : 0) : 0));
  const band = nodes.map(node => node.fixed ? 0 : zoneBit[zoneForNode(node)]);
  let routerMask = 0, terminals = 0;
  nodes.forEach((node, i) => {
    if (node.role === "router") routerMask |= 1 << i;
    if (node.fixed) terminals |= 1 << i;
  });
  const resonant = fieldBands(run, "resonance"), suppressed = fieldBands(run, "suppression");
  const scored: ScoredRoute[] = [];
  for (const route of all) {
    if (!(route.mask & routerMask)) continue;
    let score = RULES.baseRouteDamage + route.boosted * RULES.amplifiedCableDamage - route.frayed * RULES.frayedCableDamage, bands = 0;
    for (let m = route.mask, i = 0; m; m >>= 1, i++) {
      if (!(m & 1)) continue;
      score += contribution[i];
      bands |= band[i];
    }
    for (const zone of ZONES) {
      if (!(bands & zoneBit[zone])) continue;
      score += (resonant.get(zone) ?? 0) * RULES.resonanceDamage;
      score -= (suppressed.get(zone) ?? 0) * RULES.suppressionPenalty;
    }
    (route as ScoredRoute).score = score;
    scored.push(route as ScoredRoute);
  }
  // Routes arrive sorted by length then id order: the documented tie-breaks.
  const ranked = scored.map((route, i) => ({ route, i })).sort((a, b) => b.route.score - a.route.score || a.i - b.i).map(entry => entry.route);
  const primary = ranked[0] ?? null;
  let channels: ScoredRoute[] = [];
  let channelCount = 0;
  if (primary && light) channelCount = maximumChannels(ranked, routerMask, terminals).length;
  else if (primary) {
    const best = maximumChannels(ranked, routerMask, terminals);
    const withPrimary = maximumChannels(ranked, routerMask, terminals, primary);
    channelCount = best.length;
    channels = withPrimary.length >= best.length ? withPrimary : [primary, ...best];
  }
  let onlineMask = 0;
  for (const route of ranked) onlineMask |= route.mask;
  onlineMask &= ~terminals;
  const onlineNodes = nodes.filter((_, i) => onlineMask & (1 << i));
  const online = new Set(onlineNodes.map(node => node.id));
  const clusters = ZONES.filter(zone => onlineNodes.filter(node => zoneForNode(node) === zone).length >= RULES.clusterThreshold);
  const routerIn = (route: ScoredRoute, zone: Zone) => {
    for (let m = route.mask & routerMask, i = 0; m; m >>= 1, i++) if (m & 1 && !nodes[i].fixed && zoneForNode(nodes[i]) === zone) return true;
    return false;
  };
  const separated = !light && channelCount >= 2 && disjointPair(ranked.filter(route => routerIn(route, "north")), ranked.filter(route => routerIn(route, "south")), terminals);
  return { routes: ranked, primary, channels, channelCount, online, onlineNodes, clusters, separated };
}

export function livePaths(run: RunState): string[][] {
  return paths(
    run.topology,
    run.faultNode ? new Set([run.faultNode]) : new Set(),
    run.faultLink ? new Set([run.faultLink]) : new Set(),
  );
}
/** Router routes, strongest (primary) first. */
export function signalPaths(run: RunState): string[][] {
  return analyze(run, run.faultNode, run.faultLink).routes.map(route => route.path);
}

export interface CombatTerm {
  label: string;
  amount: number;
}
export interface CombatPreview {
  signalPath: string[];
  alternatePath: string[];
  packetDamage: number;
  damageTerms: CombatTerm[];
  shield: number;
  shieldTerms: CombatTerm[];
  incoming: number;
  incomingRaw: number;
  intent: Intent | null;
  lethal: boolean;
  independent: boolean;
  faultTarget: string | null;
  hazardZone: Zone | null;
  enemyHealing: number;
  rawPacketDamage: number;
  incomingTerms: CombatTerm[];
  traitDescription: string;
  zoneThreat: ZoneEffect | null;
  interrupted: boolean;
  breakDamage: number | null;
  // v3
  channels: number;
  channelPaths: string[][];
  online: string[];
  clusters: Zone[];
  protocolTriggers: { card: CardId; name: string; effect: string }[];
  buffering: boolean;
  bufferGain: number;
  bufferRelease: number;
  bufferAtRisk: boolean;
  backpressureGain: number;
  enemyDamage: number;
  enemyDefeatedByTraps: boolean;
  malwareTarget: { x: number; z: number } | null;
  junk: { card: CardId; count: number } | null;
  nextTurn: { energy: number; draw: number };
}

/** Terms of one transmission along `primary`. `storable` excludes enemy armor
 * and exposure: a buffered transmission stores packets before they meet the enemy. */
function transmissionTerms(run: RunState, network: Network, primary: ScoredRoute | null): { terms: CombatTerm[]; storable: number } {
  if (!primary) return { terms: [], storable: 0 };
  const nodes = run.topology.nodes.filter(node => primary.path.includes(node.id));
  const count = (test: (node: NetworkNode) => boolean) => nodes.filter(test).length;
  const route: CombatTerm[] = [{ label: "Live router route", amount: RULES.baseRouteDamage }];
  const switches = count(node => node.role === "switch");
  if (switches) route.push({ label: `Edge switches on route ×${switches}`, amount: switches * (has(run, "packet-lens") ? RULES.packetLensSwitchDamage : RULES.switchDamage) });
  const configured = count(node => node.role === "router" && !!node.configured);
  if (configured) route.push({ label: `Startup Config ×${configured}`, amount: configured * RULES.configuredDamage });
  const overclocked = count(node => node.role === "router" && !!node.upgraded);
  if (overclocked) route.push({ label: `Overclocked routers ×${overclocked}`, amount: overclocked * RULES.overclockDamage });
  const compressed = count(node => node.role === "switch" && !!node.amplified);
  if (compressed) route.push({ label: `Packet Compression ×${compressed}`, amount: compressed * RULES.compressionDamage });
  if (primary.boosted) route.push({ label: `Amplified cables ×${primary.boosted}`, amount: primary.boosted * RULES.amplifiedCableDamage });
  if (primary.frayed) route.push({ label: `Frayed cables ×${primary.frayed} · crossing wreckage`, amount: -primary.frayed * RULES.frayedCableDamage });
  const bands = new Set(nodes.filter(node => !node.fixed).map(zoneForNode));
  for (const zone of ZONES) {
    if (!bands.has(zone)) continue;
    const resonance = fieldBands(run, "resonance").get(zone) ?? 0, suppression = fieldBands(run, "suppression").get(zone) ?? 0;
    if (resonance) route.push({ label: `${zone.toUpperCase()} · Resonance${resonance > 1 ? ` ×${resonance}` : ""}`, amount: resonance * RULES.resonanceDamage });
    if (suppression) route.push({ label: `${zone.toUpperCase()} · Suppression${suppression > 1 ? ` ×${suppression}` : ""}`, amount: -suppression * RULES.suppressionPenalty });
  }
  const terms = [...route];
  const spanning = has(run, "spanning-tree");
  const routeSum = route.reduce((sum, term) => sum + term.amount, 0);
  if (spanning && routeSum > 0) terms.push({ label: "Spanning Tree · primary route ×2", amount: routeSum });
  const channels = network.channelCount;
  if (!spanning && channels > 1)
    terms.push({ label: `Bandwidth · ${channels} channels`, amount: (channels - 1) * (has(run, "parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel) });
  const balancers = network.onlineNodes.filter(node => node.role === "balancer").length;
  if (!spanning && balancers) terms.push({ label: `Load balancers ×${balancers} · ${channels} channel${channels === 1 ? "" : "s"}`, amount: balancers * channels * RULES.balancerPerChannel });
  for (const zone of network.clusters) terms.push({ label: `${zone.toUpperCase()} · Cluster`, amount: RULES.clusterDamage });
  if (run.malware.length) terms.push({ label: `Malware ×${run.malware.length}`, amount: -run.malware.length * RULES.malwarePenalty });
  if (run.packetBoost) terms.push({ label: "Packet boost this turn", amount: run.packetBoost });
  if (has(run, "bgp-hijack")) terms.push({ label: "BGP Hijack", amount: RULES.bgpHijackDamage });
  if (run.backpressure) terms.push({ label: "Backpressure", amount: run.backpressure });
  if (!run.buffering && run.buffer) terms.push({ label: "Buffer release", amount: run.buffer });
  const storable = terms.reduce((sum, term) => sum + term.amount, 0);
  if (run.enemy?.exposed) terms.push({ label: "Exposed guardian", amount: RULES.exposedBonus });
  const armor = run.enemy && ENEMIES[run.enemy.id].armor;
  if (armor && !run.enemy?.exposed) {
    const firewall = network.onlineNodes.some(node => node.role === "firewall");
    const amount = armor.bypass === "firewall"
      ? (firewall ? 0 : armor.amount)
      : Math.max(0, armor.amount - (armor.perChannel ?? RULES.gradedArmorPerChannel) * (channels - 1));
    if (amount > 0)
      terms.push({ label: `${run.enemy!.name} armor · ${armor.bypass === "firewall" ? "needs an online firewall" : `each extra channel strips ${armor.perChannel ?? RULES.gradedArmorPerChannel}`}`, amount: -amount });
  }
  return { terms, storable };
}
const sumTerms = (terms: CombatTerm[]) => terms.reduce((sum, term) => sum + term.amount, 0);

export function damageFromPath(run: RunState, signal: string[]): number {
  const network = analyze(run, run.faultNode, run.faultLink);
  const route = network.routes.find(item => item.path.join() === signal.join());
  return Math.max(0, sumTerms(transmissionTerms(run, network, route ?? null).terms));
}

function honeypotAt(run: RunState, id: string) {
  const node = run.topology.nodes.find(item => item.id === id);
  return node?.role === "honeypot" ? node : null;
}
function malwareSocket(run: RunState): { x: number; z: number } | null {
  if (run.malware.length >= RULES.maxMalware) return null;
  const counts = ZONES.map(zone => ({ zone, count: run.topology.nodes.filter(node => !node.fixed && zoneForNode(node) === zone).length }));
  const order = [...counts].sort((a, b) => b.count - a.count || ["center", "north", "south"].indexOf(a.zone) - ["center", "north", "south"].indexOf(b.zone));
  const rows: Record<Zone, number[]> = { north: [-2.6, -3.8, -1.8], center: [0, 0.8, -0.8], south: [2.6, 3.8, 1.8] };
  for (const { zone } of order) {
    for (const z of rows[zone])
      for (const x of [0, 1.3, -1.3, 2.6, -2.6, 3.9, -3.9])
        if (!isBlocked(run, x, z)) return { x, z };
  }
  return null;
}

/** Pure forecast. Resolution uses these exact values and targets. */
export function combatPreview(run: RunState): CombatPreview {
  const network = analyze(run, run.faultNode, run.faultLink);
  const primary = network.primary;
  const signalPath = primary?.path ?? [];
  const { terms, storable } = transmissionTerms(run, network, primary);
  const buffering = run.buffering && !!primary;
  const bufferGain = buffering ? Math.floor(Math.max(0, storable) * RULES.bufferMultiplier) : 0;
  if (buffering && sumTerms(terms) !== 0) terms.push({ label: `Stored in buffer · +${bufferGain} (×${RULES.bufferMultiplier})`, amount: -sumTerms(terms) });
  const packetDamage = Math.max(0, sumTerms(terms));
  const rawPacketDamage = sumTerms(terms.filter((term) => term.amount > 0));
  if (sumTerms(terms) < 0) terms.push({ label: "Minimum signal damage", amount: -sumTerms(terms) });
  const bufferRelease = !buffering && primary ? run.buffer : 0;
  const intent = intentFor(run);
  const lethal = !!run.enemy && packetDamage >= run.enemy.hp;
  const definition = run.enemy ? ENEMIES[run.enemy.id] : null;
  const breakDamage = definition?.boss?.breakDamage ?? null;
  const interrupted = !lethal && !!intent?.ultimate && breakDamage !== null && packetDamage >= breakDamage;
  const incomingTerms: CombatTerm[] = intent && intent.amount ? [{ label: intent.label, amount: intent.amount }] : [];
  let raw = intent?.amount ?? 0;
  if (interrupted) {
    raw = 0;
    incomingTerms.push({ label: "Ultimate interrupted", amount: -intent!.amount });
  }
  const attack = !interrupted && (intent?.kind === "strike" || intent?.kind === "breach");
  if (intent?.kind === "strike" && run.enemy?.id === "serpent" && network.channelCount <= 1) {
    raw += RULES.serpentBonus;
    incomingTerms.push({ label: "Coil pressure · only one channel", amount: RULES.serpentBonus });
  }
  if (intent?.kind === "strike" && run.enemy?.id === "weaver" && run.topology.links.length >= RULES.weaverCables) {
    raw += RULES.weaverBonus;
    incomingTerms.push({ label: `Tension trap · ${RULES.weaverCables} or more cables`, amount: RULES.weaverBonus });
  }
  if (attack && has(run, "bgp-hijack")) {
    raw += RULES.bgpHijackEnemyBonus;
    incomingTerms.push({ label: "BGP Hijack · enemy retaliation", amount: RULES.bgpHijackEnemyBonus });
  }
  const worms = run.hand.filter(id => baseCard(id) === "worm").length;
  if (worms) {
    raw += worms * RULES.wormDamage;
    incomingTerms.push({ label: `Worm in hand ×${worms}`, amount: worms * RULES.wormDamage });
  }
  const jamZone: Zone | null =
    definition?.jamBands && intent?.kind === "jam"
      ? ZONES[Math.floor(run.enemy!.turn / definition.pattern.length) % 3]
      : null;
  let hazardZone = jamZone;
  let zoneThreat: ZoneEffect | null = null;
  if (!interrupted && (intent?.kind === "corrupt" || intent?.field)) {
    const corruption = intent.field ?? (definition?.corruption === "alternating"
      ? Math.floor(run.enemy!.turn / 2) % 2 ? "corrosion" : "suppression"
      : definition?.corruption ?? "corrosion");
    const eligible = run.topology.nodes.filter(node => !node.fixed && (corruption !== "suppression" || signalPath.includes(node.id)));
    hazardZone = jamZone ?? (["center", "north", "south"] as Zone[]).sort((a, b) => eligible.filter(node => zoneForNode(node) === b).length - eligible.filter(node => zoneForNode(node) === a).length)[0];
    zoneThreat = { zone: hazardZone, kind: corruption, turns: hostileFieldTurns(run) };
  }
  const shields: CombatTerm[] = [];
  for (const zone of ZONES) {
    const occupied = run.topology.nodes.some(node => !node.fixed && zoneForNode(node) === zone);
    const online = network.onlineNodes.some(node => zoneForNode(node) === zone);
    const label = (kind: ZoneEffectKind) => `${zone.toUpperCase()} · ${FIELD_RULES[kind].name}`;
    const kinds = new Set(run.zoneEffects.filter(field => field.zone === zone).map(field => field.kind));
    if (kinds.has("corrosion") && occupied) { raw += RULES.corrosionDamage; incomingTerms.push({ label: label("corrosion"), amount: RULES.corrosionDamage }); }
    if (kinds.has("aegis") && online) shields.push({ label: label("aegis"), amount: RULES.aegisShield });
    if (kinds.has("stasis") && occupied) shields.push({ label: label("stasis"), amount: RULES.nullFieldShield });
  }
  // Disruption targets: honeypots decoy first, then the primary route.
  let faultTarget: string | null = null;
  let honeypotHit: string | null = null;
  const honeypots = run.topology.nodes.filter(node => node.role === "honeypot" && run.topology.links.some(link => link.a === node.id || link.b === node.id));
  if (!interrupted && intent?.kind === "sever") {
    const eligible = run.topology.links.filter((link) => !link.armored);
    const length = (link: (typeof eligible)[number]) => {
      const a = run.topology.nodes.find((node) => node.id === link.a)!, b = run.topology.nodes.find((node) => node.id === link.b)!;
      return Math.hypot(a.x - b.x, a.z - b.z);
    };
    const decoy = run.enemy?.id === "wraith" ? undefined : eligible.find(link => honeypotAt(run, link.a) || honeypotAt(run, link.b));
    const target = decoy
      ?? (run.enemy?.id === "wraith"
        ? [...eligible].sort((a, b) => length(b) - length(a) || linkKey(a.a, a.b).localeCompare(linkKey(b.a, b.b)))[0]
        : (eligible.find((link) => signalPath.some((id, i) => i > 0 && linkKey(signalPath[i - 1], id) === linkKey(link.a, link.b))) ?? eligible[0]));
    if (target) {
      faultTarget = linkKey(target.a, target.b);
      if (decoy) honeypotHit = (honeypotAt(run, decoy.a) ?? honeypotAt(run, decoy.b))!.id;
      if (run.enemy?.id === "wraith" && length(target) > RULES.cableExposureLength) {
        raw++;
        incomingTerms.push({ label: `Exposed cable longer than ${RULES.cableExposureLength} units`, amount: 1 });
      }
    } else if (!run.topology.links.length) {
      raw++;
      incomingTerms.push({ label: "Exposed backbone · no cables", amount: 1 });
    }
  }
  if (!interrupted && intent?.kind === "jam") {
    const eligible = run.topology.nodes.filter((node) => !node.fixed && !node.shielded && (!jamZone || zoneForNode(node) === jamZone));
    const decoy = eligible.find(node => honeypots.includes(node));
    const target = decoy
      ?? (definition?.jamsFirewalls ? eligible.find(node => node.role === "firewall" && network.online.has(node.id)) : undefined)
      ?? eligible.find((node) => signalPath.includes(node.id)) ?? eligible[0];
    if (target) {
      faultTarget = target.id;
      if (decoy) honeypotHit = decoy.id;
    } else if (!jamZone && !run.topology.nodes.some((node) => !node.fixed)) {
      raw++;
      incomingTerms.push({ label: "Exposed backbone · no devices", amount: 1 });
    }
  }
  let enemyDamage = 0;
  if (honeypotHit) {
    enemyDamage += RULES.honeypotDamage + (has(run, "honeynet") ? RULES.honeynetBonus : 0);
    if (has(run, "honeynet")) shields.push({ label: "Honeynet · decoy triggered", amount: RULES.honeynetShield });
  }
  // Armed protocols: the first matching protocol of each trigger fires.
  const protocolTriggers: CombatPreview["protocolTriggers"] = [];
  const fired = new Set<string>();
  for (const id of run.protocols) {
    const protocolCard = card(id), trigger = protocolCard.protocol!, v = protocolCard.values;
    if (fired.has(trigger) || (interrupted && trigger !== "field")) continue;
    let effect = "";
    if (trigger === "sever" && intent?.kind === "sever" && faultTarget && !honeypotHit) {
      faultTarget = null;
      shields.push({ label: `${protocolCard.name} · cut cancelled`, amount: v.shield ?? 3 });
      effect = `Cancels the cable cut and gives ${v.shield ?? 3} shield.`;
    } else if (trigger === "jam" && intent?.kind === "jam" && faultTarget && !honeypotHit) {
      faultTarget = null;
      enemyDamage += v.damage ?? 4;
      effect = `Cancels the jam; the attacker takes ${v.damage ?? 4}.`;
    } else if (trigger === "strike" && intent?.kind === "strike" && intent.amount > 0) {
      shields.push({ label: `${protocolCard.name} vs strike`, amount: v.reduce ?? 5 });
      effect = `Reduces the strike by ${v.reduce ?? 5}.`;
    } else if (trigger === "breach" && intent?.kind === "breach" && intent.amount > 0) {
      shields.push({ label: `${protocolCard.name} vs breach`, amount: v.reduce ?? 6 });
      effect = `Reduces the breach by ${v.reduce ?? 6}.`;
    } else if (trigger === "field" && zoneThreat) {
      effect = `Cancels ${FIELD_RULES[zoneThreat.kind].name} on ${zoneThreat.zone.toUpperCase()}.`;
      zoneThreat = null;
      if (!jamZone) hazardZone = null;
    } else if (trigger === "ultimate" && (intent?.kind === "charge" || intent?.ultimate)) {
      enemyDamage += v.damage ?? 8;
      effect = `The guardian takes ${v.damage ?? 8}.`;
    }
    if (!effect) continue;
    fired.add(trigger);
    protocolTriggers.push({ card: id, name: protocolCard.name, effect });
  }
  const malwareTarget = !interrupted && (intent?.kind === "infect" || intent?.infect) ? malwareSocket(run) : null;
  const junk = !interrupted && intent?.junk ? intent.junk : null;
  // Online firewalls block breaches and strikes; they stack. Stateful and Zero Trust double them.
  if (attack) {
    const firewalls = network.onlineNodes.filter(node => node.role === "firewall");
    const per = intent!.kind === "breach" ? RULES.firewallBreachBlock : RULES.firewallStrikeBlock;
    const amount = firewalls.reduce((sum, node) => sum + per * (node.stateful ? 2 : 1) * (has(run, "zero-trust") ? 2 : 1), 0);
    if (amount) shields.push({ label: `Online firewalls ×${firewalls.length} vs ${intent!.kind}`, amount });
  }
  if (network.separated) shields.push({ label: "Separated circuits · north + south", amount: RULES.separatedCircuitShield });
  if (run.block > 0) shields.push({ label: "Block this turn", amount: run.block });
  if (!primary && has(run, "watchdog") && !run.watchdogUsed) shields.push({ label: "Watchdog · no live route", amount: RULES.watchdogShield });
  if (raw > sumTerms(shields) && has(run, "shield-array") && !run.shieldArrayUsed)
    shields.push({ label: "Shield Array (once per battle)", amount: Math.min(RULES.shieldArrayPrevent, raw - sumTerms(shields)) });
  const shield = sumTerms(shields);
  const hpAfter = run.enemy ? run.enemy.hp - packetDamage : 0;
  const enemyDefeatedByTraps = !lethal && !!run.enemy && enemyDamage > 0 && enemyDamage >= hpAfter;
  const ends = lethal || enemyDefeatedByTraps;
  const incoming = ends ? 0 : Math.max(0, raw - shield);
  const backpressureGain = !ends && has(run, "backpressure") ? Math.ceil(Math.min(raw, shield) * RULES.backpressureRatio) : 0;
  // Next turn: the old fault clears, the new one installs, then power and caches count.
  const newFaultNode = !ends && intent?.kind === "jam" ? faultTarget : null;
  const newFaultLink = !ends && intent?.kind === "sever" ? faultTarget : null;
  const after = ends || (newFaultNode === run.faultNode && newFaultLink === run.faultLink)
    ? network
    : analyze(run, newFaultNode, newFaultLink, true);
  const bufferAfter = buffering ? run.buffer + bufferGain : primary ? 0 : run.buffer;
  const bufferAtRisk = !ends && bufferAfter > 0 && !after.primary;
  const malwareAfter = run.malware.length + (malwareTarget ? 1 : 0);
  const enemyHealing = !ends && run.enemy?.id === "leech"
    ? Math.max(0, Math.min((packetDamage === 0 ? RULES.leechHeal : 0) + malwareAfter * RULES.leechTapHeal, run.enemy.maxHp - Math.max(0, hpAfter - enemyDamage)))
    : 0;
  const nextTurn = {
    energy: turnEnergyBase(run) + run.reserveEnergy + (has(run, "reserve-cell") ? Math.min(2, run.energy) : 0) + after.onlineNodes.filter(node => node.role === "power").length,
    draw: turnDrawBase(run) + after.onlineNodes.filter(node => node.role === "cache").length + (has(run, "fanout") && after.channelCount >= 3 ? 1 : 0),
  };
  return {
    signalPath,
    alternatePath: network.channels[1]?.path ?? [],
    channels: network.channelCount,
    channelPaths: network.channels.map(route => route.path),
    online: [...network.online],
    clusters: network.clusters,
    interrupted,
    breakDamage,
    zoneThreat: ends ? null : zoneThreat,
    hazardZone: ends ? null : hazardZone,
    enemyHealing,
    rawPacketDamage,
    incomingTerms: ends ? [] : incomingTerms,
    traitDescription: run.enemy ? ENEMIES[run.enemy.id].trait : "",
    packetDamage,
    damageTerms: terms,
    shield,
    shieldTerms: shields,
    incoming,
    incomingRaw: ends ? 0 : raw,
    intent: intent ? { ...intent, ...(faultTarget && !ends ? { target: faultTarget } : {}) } : null,
    lethal,
    independent: network.channelCount >= 2,
    faultTarget: ends ? null : faultTarget,
    protocolTriggers: lethal ? [] : protocolTriggers,
    buffering,
    bufferGain,
    bufferRelease,
    bufferAtRisk,
    backpressureGain,
    enemyDamage: lethal ? 0 : enemyDamage,
    enemyDefeatedByTraps,
    malwareTarget: ends ? null : malwareTarget,
    junk: ends ? null : junk,
    nextTurn,
  };
}

function victory(run: RunState, result: TurnResult) {
  result.defeated = true;
  run.score += 100 + run.integrity * 5;
  if (has(run, "repair-drone")) run.integrity = Math.min(run.maxIntegrity, run.integrity + 1);
  run.block = 0;
  run.packetBoost = 0;
  run.zoneEffects = [];
  run.malware = [];
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  run.protocols = [];
  run.consoleUses = 0;
  if (run.preparedCard) run.discardPile.push(run.preparedCard);
  run.preparedCard = null;
  delete run.enemy!.exposed;
  log(run, `${run.enemy!.name} neutralized. Its intent is cancelled.`);
  grantVictory(run);
}

export function endTurn(run: RunState): TurnResult {
  if (run.phase !== "battle" || !run.enemy)
    throw new Error("No active encounter.");
  const preview = combatPreview(run);
  const result: TurnResult = {
    signalPath: preview.signalPath,
    alternatePath: preview.alternatePath,
    channelPaths: preview.channelPaths,
    packetDamage: preview.packetDamage,
    enemyAction: "",
    integrityDamage: 0,
    defeated: false,
    lost: false,
    interrupted: preview.interrupted,
    buffered: 0,
    bufferReleased: 0,
    bufferLost: false,
    protocolsTriggered: [],
    enemyDamage: 0,
    malwarePlanted: null,
    junkAdded: [],
    backpressureStored: 0,
  };
  if (preview.buffering) {
    run.buffer += preview.bufferGain;
    run.backpressure = 0;
    result.buffered = preview.bufferGain;
    log(run, `Transmission buffered: +${preview.bufferGain} stored (${run.buffer} total).`);
  } else if (preview.signalPath.length) {
    run.enemy.hp = Math.max(0, run.enemy.hp - preview.packetDamage);
    result.bufferReleased = preview.bufferRelease;
    run.buffer = 0;
    run.backpressure = 0;
  }
  if (!preview.signalPath.length && preview.shieldTerms.some(term => term.label.startsWith("Watchdog"))) run.watchdogUsed = true;
  run.score += preview.packetDamage * 10;
  if (!preview.buffering)
    log(
      run,
      preview.packetDamage
        ? `Signal dealt ${preview.packetDamage}: ${preview.damageTerms.map((term) => `${term.label} ${term.amount >= 0 ? "+" : ""}${term.amount}`).join(" · ")}.`
        : preview.signalPath.length ? "The live signal was absorbed by armor or hostile fields. No damage." : "No live router route. No signal damage.",
    );
  if (preview.lethal) {
    victory(run, result);
    return result;
  }
  // Traps resolve at the start of the enemy action.
  result.protocolsTriggered = preview.protocolTriggers.map(trigger => trigger.card);
  for (const id of result.protocolsTriggered) {
    run.protocols.splice(run.protocols.indexOf(id), 1);
    run.discardPile.push(id);
  }
  if (preview.enemyDamage) {
    run.enemy.hp = Math.max(0, run.enemy.hp - preview.enemyDamage);
    result.enemyDamage = preview.enemyDamage;
    log(run, `Traps dealt ${preview.enemyDamage} to ${run.enemy.name}.`);
  }
  if (preview.enemyDefeatedByTraps) {
    victory(run, result);
    return result;
  }
  const intent = preview.intent!;
  if (preview.malwareTarget) {
    const used = new Set(run.malware.map(item => item.id));
    let n = 1;
    while (used.has(`malware${n}`)) n++;
    const planted = { id: `malware${n}`, ...preview.malwareTarget };
    run.malware.push(planted);
    result.malwarePlanted = planted;
  }
  if (preview.enemyHealing) {
    run.enemy.hp = Math.min(run.enemy.maxHp, run.enemy.hp + preview.enemyHealing);
    log(run, `${run.enemy.name} siphoned ${preview.enemyHealing} health.`);
  }
  run.faultNode = null;
  run.faultLink = null;
  run.zoneEffects = run.zoneEffects.map(field => field.permanent ? field : { ...field, turns: field.turns - 1 }).filter(field => field.turns > 0);
  if (preview.zoneThreat) installField(run, preview.zoneThreat);
  if (intent.kind === "sever") run.faultLink = preview.faultTarget;
  if (intent.kind === "jam") run.faultNode = preview.faultTarget;
  if (preview.junk) {
    for (let i = 0; i < preview.junk.count; i++) {
      const position = Math.floor(random(run) * (run.drawPile.length + 1));
      run.drawPile.splice(position, 0, preview.junk.card);
      result.junkAdded.push(preview.junk.card);
    }
  }
  result.integrityDamage = preview.incoming;
  run.integrity = Math.max(0, run.integrity - preview.incoming);
  if (preview.shieldTerms.some((term) => term.label.startsWith("Shield Array"))) run.shieldArrayUsed = true;
  if (preview.backpressureGain) {
    run.backpressure += preview.backpressureGain;
    result.backpressureStored = preview.backpressureGain;
  }
  const fault = preview.faultTarget
    ? `${intent.kind === "jam" ? "jammed" : "cut"} ${preview.faultTarget.toUpperCase().replace("::", " ↔ ")}; `
    : "";
  result.enemyAction = `${run.enemy.name} ${preview.zoneThreat ? `cast ${FIELD_RULES[preview.zoneThreat.kind].name} on ${preview.zoneThreat.zone.toUpperCase()}; ` : ""}${fault}${result.malwarePlanted ? "planted malware; " : ""}${result.junkAdded.length ? `injected ${result.junkAdded.length} ${card(result.junkAdded[0]).name}; ` : ""}dealt ${preview.incoming} integrity damage${preview.shield ? ` (${Math.min(preview.incomingRaw, preview.shield)} blocked)` : ""}.`;
  log(run, result.enemyAction);
  if (result.protocolsTriggered.length) log(run, `Protocols fired: ${preview.protocolTriggers.map(t => `${t.name} — ${t.effect}`).join(" ")}`);
  if (preview.interrupted) {
    result.enemyAction = `${run.enemy.name}'s ultimate interrupted! Armor broken and +${RULES.exposedBonus} signal damage next turn.${preview.incoming ? ` Existing fields dealt ${preview.incoming} integrity damage.` : ""}`;
    log(run, result.enemyAction);
  } else if (intent.kind === "charge") {
    log(run, `${run.enemy.name} is charging. Prepare a burst to interrupt the next transmission, or brace for the impact.`);
  }
  if (preview.interrupted) run.enemy.exposed = true;
  else delete run.enemy.exposed;
  run.enemy.turn++;
  run.turn++;
  run.energy = preview.nextTurn.energy;
  run.reserveEnergy = 0;
  if (preview.bufferAtRisk) {
    log(run, `Packet loss: no live route — the ${run.buffer}-damage buffer is lost.`);
    run.buffer = 0;
    result.bufferLost = true;
  }
  run.block = has(run, "grounded-core") ? 1 : 0;
  run.packetBoost = 0;
  run.cardsPlayed = 0;
  run.firstFiberPlayed = false;
  run.consoleUses = 0;
  run.buffering = false;
  for (const held of run.hand.splice(0))
    (baseCard(held) === "packet-loss" ? run.exhaustPile : run.discardPile).push(held);
  if (run.preparedCard) run.hand.push(run.preparedCard);
  run.preparedCard = null;
  draw(run, preview.nextTurn.draw - run.hand.length);
  if (run.integrity <= 0) {
    run.phase = "lost";
    result.lost = true;
  }
  return result;
}
