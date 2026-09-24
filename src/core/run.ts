import { CARDS, RULES, STARTER_DECK, baseCard, type CardDefinition } from "./cards.ts";
import { canLink, cableable, channelKey, initialTopology, linkKey, paths } from "./graph.ts";
import { createMap } from "./map.ts";
import { grantVictory } from "./meta.ts";
import { random, shuffle, log } from "./util.ts";
import { crossesWreckage, terrainFor } from "./terrain.ts";
import { planEncounter } from "./encounter.ts";
import type { BaseCardId, CardId, ConsoleId, EscalationLevel, Installation, MapRoom, NetworkNode, Port, RunState, Zone } from "./types.ts";
import { crateText } from "./encounter.ts";
import { ENEMIES } from "./enemies.ts";
import { levelRule } from "./combat/intent.ts";
import { openFallen, type ArrivalRecord, type FallenRecord } from "./combat/surprises.ts";
import {
  FIELD_RULES, INSTALLATION_NAMES, PORTS, ZONES, card, damageEnemy, deployCondition, destroyInstallation, effectiveFocus, enemyAt,
  freeSocket, has, hostileFieldTurns, installField, insideGrid, isBlocked, isWorn, leaderOf, livingEnemies, maxConditionOf,
  mostDangerous, mostWorn, repairDevice, scrubCost, startingFocus, wearable, zoneForNode,
} from "./combat/board.ts";
import { analyze } from "./combat/network.ts";
import {
  resolveTurn, simulationOf, sumTerms, turnDrawBase, turnEnergyBase,
  type CombatPreview, type DestroyRecord, type PortForecast,
} from "./combat/resolve.ts";

export type { Zone, Intent } from "./types.ts";
export type {
  CombatPreview, CombatTerm, Delivery, PortForecast, HostileForecast, HostileState, InstallForecast, InstallationEffect,
  QuarantineRecord, ProtocolTrigger, WearRecord, BreakRecord, DestroyRecord,
} from "./combat/resolve.ts";
export { random } from "./util.ts";
export { RULES } from "./cards.ts";
export { channelKey } from "./graph.ts";
export {
  PORTS, ZONES, FIELD_RULES, INSTALLATION_NAMES, livingEnemies, enemyAt, leaderOf, isBlocked, zoneForNode, conditionOf,
  maxConditionOf, isWorn, scrubCost, mostDangerous, effectiveFocus, shelterOf, livingLeader,
} from "./combat/board.ts";
export { zoneDescription } from "./combat/board.ts";
export { intentFor, actsInPhase, escalationLevel, nextLevel, levelRule, wounded } from "./combat/intent.ts";
export { emptySidePort, type ArrivalRecord, type FallenRecord } from "./combat/surprises.ts";
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
  /** First installation planted this phase (compatibility with the v3 malware cue). */
  malwarePlanted: Installation | null;
  junkAdded: CardId[];
  backpressureStored: number;
  // ---- v4
  /** The forecast this turn resolved (per port, per hostile, per installation). */
  forecast: CombatPreview;
  /** Damage that landed on each port. */
  portDamage: Partial<Record<Port, number>>;
  /** Enemy.uid of every hostile that fell this turn. */
  deaths: string[];
  /** Installations planted, and installations destroyed during the phase. */
  planted: Installation[];
  destroyed: DestroyRecord[];
  /** One line per hostile that acted, in port order. */
  actions: string[];
  // ---- v4 · M2: events the UI animates
  /** Hostiles that took a port at the end of the phase: a reinforcement (or Shedding spawn), guardian adds. */
  arrived: ArrivalRecord[];
  /** The signal named at the start of the next turn (its announcement), or fired at its start. */
  signalAnnounced: string | null;
  signalFired: string | null;
  /** Uids whose Shedding spawn was armed this turn (it arrives at the end of the phase). */
  shed: string[];
  /** Leaders whose escalation level rose (the gauge fills). */
  escalated: { uid: string; level: EscalationLevel }[];
  /** What the fallen left: crates opened (contents), credits banked, hardware placed, offers queued. */
  fallen: FallenRecord[];
  /** Offers queued this turn (card choices and messages; they open before the next hand). */
  offersQueued: number;
}

export const HAND_LIMIT = RULES.handLimit;

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

/** Every encounter-scoped v4 field at its empty value. */
function freshEncounter(): Pick<RunState, "enemies" | "faultNodes" | "faultLinks" | "installations" | "focus" | "aims" | "enemyPhase" | "hostileActions" | "reinforcement" | "signal" | "offers" | "encounterCards"> {
  return {
    enemies: [], faultNodes: [], faultLinks: [], installations: [], focus: null, aims: {}, enemyPhase: 0, hostileActions: 0,
    reinforcement: null, signal: null, offers: [], encounterCards: [],
  };
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
    ...freshEncounter(),
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

/** Composes the encounter from content's plan (pure, seeded by the chart) and sets the table. */
export function beginBattle(run: RunState, room: MapRoom) {
  const plan = planEncounter(run, room);
  Object.assign(run, freshEncounter());
  run.enemies = plan.enemies;
  run.reinforcement = plan.reinforcement;
  run.signal = plan.signal ? { id: plan.signal, firesOnTurn: RULES.signalTurn, resolved: false } : null;
  run.entrance = [...plan.entrance];
  run.focus = startingFocus(run);
  run.turnEffects = {};
  run.reclaim = 0;
  run.repairsThisTurn = 0;
  run.attackers = [];
  run.lingeringJams = {};
  run.frayedByCut = [];
  run.bossIntroSeen = room.type !== "boss";
  run.phase = "battle";
  run.turn = 1;
  run.energy = turnEnergyBase(run) + Number(has(run, "cold-start")) - Number(has(run, "sdn-controller"));
  run.topology = initialTopology();
  run.nextNodeId = 1;
  run.zoneEffects = [];
  const layout = terrainFor(run.seed, run.stage, room.id, run.stage === 0 && room.floor === 0);
  run.terrain = layout.terrain;
  if (layout.salvage) {
    const condition = deployCondition(run, true);
    run.topology.nodes.push({ ...layout.salvage, id: `${layout.salvage.role}${run.nextNodeId++}`, condition, maxCondition: condition });
  }
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
  run.protocols = [];
  run.consoleUses = 0;
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  // Round Robin: every hostile takes 2 as the fight begins (it never ends a fight before it starts).
  if (has(run, "round-robin"))
    for (const enemy of run.enemies) damageEnemy(run, enemy, Math.min(RULES.roundRobinDamage, enemy.hp - 1));
  guaranteedDraw(run, (id) => ["router", "hardened-router"].includes(baseCard(id)));
  guaranteedDraw(run, (id) => card(id).target === "link");
  guaranteedDraw(run, (id) => card(id).target === "link");
  if (has(run, "spare-parts")) run.hand.push("fiber");
  draw(run, turnDrawBase(run) - run.hand.length + Number(has(run, "spare-parts")));
  const names = run.enemies.map(enemy => enemy.name).join(", ");
  log(run, `${names} ${run.enemies.length > 1 ? "enter" : "enters"} the grid. ${run.terrain.name}. Establish a route.`);
  for (const line of plan.entrance) log(run, line);
}

// ------------------------------------------------------------------ focus and aim

/** Rule 15: set the port every unaimed delivery goes to and overflow lands on. Free. */
export function setFocus(run: RunState, port: Port): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Set the focus during an encounter." };
  const enemy = enemyAt(run, port);
  if (!enemy) return { ok: false, message: "No living hostile stands at that port." };
  run.focus = port;
  return { ok: true, message: `Focus · ${port.toUpperCase()} · ${enemy.name}.` };
}
/** Rule 16–17: aim a live channel's delivery at a port (null follows the focus). Free. */
export function aimChannel(run: RunState, key: string, port: Port | null): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Aim deliveries during an encounter." };
  const channels = analyze(run, run.faultNodes, run.faultLinks).channels.map(route => channelKey(route.path));
  if (!channels.includes(key)) return { ok: false, message: "That channel is not live." };
  if (port === null) {
    delete run.aims[key];
    return { ok: true, message: "Delivery follows the focus." };
  }
  const enemy = enemyAt(run, port);
  if (!enemy) return { ok: false, message: "No living hostile stands at that port." };
  run.aims[key] = port;
  return { ok: true, message: `Delivery aimed at ${port.toUpperCase()} · ${enemy.name}.` };
}

// ------------------------------------------------------------------ hand

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
  // Rapid Redeploy: the recovered hardware card costs less this turn.
  if (run.turnEffects?.discounted?.includes(id)) cost = Math.max(0, cost - 1);
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
/** Cards found or offered during an encounter exhaust when played and never enter the deck. */
function encounterOnly(run: RunState, id: CardId): boolean {
  const index = run.encounterCards?.indexOf(id) ?? -1;
  if (index < 0) return false;
  run.encounterCards.splice(index, 1);
  return true;
}
function consume(run: RunState, index: number) {
  const id = run.hand[index];
  run.energy -= costFor(run, index);
  const discounted = run.turnEffects?.discounted;
  if (discounted?.includes(id)) discounted.splice(discounted.indexOf(id), 1);
  run.hand.splice(index, 1);
  (card(id).exhaust || encounterOnly(run, id) ? run.exhaustPile : run.discardPile).push(id);
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
const effects = (run: RunState) => (run.turnEffects ??= {});
/** A hostile killed during your turn (Scorched Earth) drops its crate and cargo at once. */
function settleFallen(run: RunState) {
  const fallen = run.enemies.filter(enemy => enemy.hp <= 0 && !enemy.looted).map(enemy => enemy.uid);
  if (fallen.length) openFallen(run, fallen, true);
}
/** Jams leave with their lingering turns. */
function unjam(run: RunState, keep: (id: string) => boolean) {
  run.faultNodes = run.faultNodes.filter(keep);
  if (run.lingeringJams) for (const id of Object.keys(run.lingeringJams)) if (!keep(id)) delete run.lingeringJams[id];
}

// ------------------------------------------------------------------ placement

export function playZone(run: RunState, index: number, zone: Zone): ActionResult {
  const ready = canPlay(run, index, "zone");
  if (!ready.ok) return ready;
  if (!ZONES.includes(zone)) return { ok: false, message: "Choose North, Center, or South." };
  const id = run.hand[index], base = baseCard(id);
  let purged = "";
  if (base === "purge-field") {
    const anchor = run.installations.find(item => item.kind === "anchor" && zoneForNode(item) === zone);
    if (anchor) {
      // Rule 35: Purge Field on an anchored band destroys the Anchor and nothing else.
      run.reclaim = (run.reclaim ?? 0) + destroyInstallation(run, anchor, "Purge Field");
      purged = " · Anchor destroyed; purge again for the fields";
    } else {
      run.zoneEffects = run.zoneEffects.filter(effect => effect.zone !== zone || !FIELD_RULES[effect.kind].hostile);
      unjam(run, nodeId => !run.topology.nodes.some(node => node.id === nodeId && zoneForNode(node) === zone));
      const gone = run.installations.filter(item => zoneForNode(item) === zone);
      for (const item of gone) run.reclaim = (run.reclaim ?? 0) + destroyInstallation(run, item, "Purge Field");
      if (gone.length) purged = ` · ${gone.length} installation${gone.length === 1 ? "" : "s"} destroyed`;
    }
  } else {
    const kind = base === "resonance-field" ? "resonance" : base === "aegis-field" ? "aegis" : "stasis";
    installField(run, { zone, kind, turns: RULES.alliedFieldTurns });
  }
  consume(run, index);
  applyValues(run, id);
  settleFallen(run);
  const message = `${card(id).name} · ${zone.toUpperCase()}${base === "purge-field" ? ` cleansed${purged}` : ` · ${RULES.alliedFieldTurns} turns`}.`;
  log(run, message);
  return { ok: true, message };
}
export function relocateNode(run: RunState, id: string, x: number, z: number): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Relocate devices during an encounter." };
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node || node.fixed)
    return { ok: false, message: "Only deployed devices can be relocated." };
  if (!insideGrid(x, z))
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
    .filter(node => node.id !== origin.id && cableable(node) && (!origin.id || !linked(run, origin.id, node.id)))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z) || a.id.localeCompare(b.id))
    .slice(0, count);
}
export function playGround(run: RunState, index: number, x: number, z: number): ActionResult {
  const ready = canPlay(run, index, "ground");
  if (!ready.ok) return ready;
  if (!insideGrid(x, z))
    return { ok: false, message: "Place hardware inside the build grid." };
  if (run.topology.nodes.length >= RULES.maxDevices)
    return { ok: false, message: "The table has no more device slots." };
  const blocked = isBlocked(run, x, z);
  if (blocked) return { ok: false, message: blocked };
  const id = run.hand[index], base = baseCard(id);
  const role = card(id).role!;
  if (role === "firewall" && has(run, "anycast"))
    return { ok: false, message: "Anycast forbids firewalls on your table." };
  const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, x, z, deployedBy: id };
  if (["hardened-router", "relay", "bastion"].includes(base) || id === "stateful-firewall+" || id === "sentry-firewall+") node.shielded = true;
  if (base === "stateful-firewall") node.stateful = true;
  if (base === "sentry-firewall") node.sentry = true;
  if (role === "phantom") node.absorbs = card(id).values.absorbs ?? 1;
  else node.condition = node.maxCondition = role === "rack" ? RULES.rackCondition : deployCondition(run);
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
  if (base === "shield") return !node.fixed && !node.shielded && cableable(node);
  if (base === "mesh-weave") return cableable(node) && nearest(run, node, 1).length > 0;
  if (base === "redundant-psu") return wearable(node);
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
    const condition = deployCondition(run);
    const replica: NetworkNode = {
      id: `router${run.nextNodeId++}`,
      role: "router",
      ...socket,
      shielded: true,
      upgraded: node.upgraded,
      amplified: node.amplified,
      configured: node.configured,
      condition,
      maxCondition: condition,
      deployedBy: held,
    };
    const links = run.topology.links
      .filter((link) => link.a === id || link.b === id)
      .map((link) => ({ ...link, a: replica.id, b: link.a === id ? link.b : link.a }));
    node.shielded = true;
    unjam(run, item => item !== node.id);
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
    unjam(run, item => item !== node.id);
  }
  if (base === "redundant-psu") {
    // Full condition and a raised maximum for this battle.
    node.maxCondition = Math.max(maxConditionOf(node), RULES.psuCondition);
    node.condition = node.maxCondition;
  }
  if (base === "compression") node.amplified = true;
  if (base === "startup-config") node.configured = true;
  if (base === "firmware") node.upgraded = true;
  consume(run, index);
  applyValues(run, held);
  const verb = base === "shield" ? "shielded" : base === "compression" ? "amplified" : base === "startup-config" ? "configured" : base === "redundant-psu" ? "given a redundant power supply" : "overclocked";
  log(run, `${node.id.toUpperCase()} ${verb}.`);
  return { ok: true, message: `${card(held).name} applied.` };
}
/** Rule 23 and 44: Hot Patch, Fast Reroute and Link Recovery clear every active fault and
 * restore condition on the most worn device (Harden restores it too). */
function clearFaultsAndRepair(run: RunState, clear: boolean): string | null {
  if (clear) {
    run.faultNodes = [];
    run.faultLinks = [];
    run.lingeringJams = {};
  }
  const primary = analyze(run, run.faultNodes, run.faultLinks).primary?.path ?? [];
  const worn = mostWorn(run, primary);
  return worn && repairDevice(worn, RULES.faultClearRepair) ? worn.id : null;
}
export function playInstant(run: RunState, index: number, installationId?: string): ActionResult {
  const ready = canPlay(run, index, "instant");
  if (!ready.ok) return ready;
  const id = run.hand[index], base = baseCard(id), values = card(id).values;
  const network = analyze(run, run.faultNodes, run.faultLinks);
  const primary = network.primary;
  if (base === "wireshark" && !primary)
    return { ok: false, message: "Wireshark needs a live ALPHA → router → OMEGA route to capture." };
  if (base === "mirror" && network.channelCount < 2)
    return { ok: false, message: "Mirror Protocol needs two or more live channels." };
  if ((base === "ecmp" || base === "flood-fill") && !primary)
    return { ok: false, message: `${card(id).name} needs a live route.` };
  if (base === "salvage" && !run.discardPile.some((held) => card(held).target === "link"))
    return { ok: false, message: "No cable cards are in your discard pile." };
  if (base === "reflect" && !run.backpressure)
    return { ok: false, message: "No backpressure is stored yet." };
  if (base === "replay-attack" && !run.buffer)
    return { ok: false, message: "Your buffer is empty." };
  const hardware = (held: CardId) => card(held).target === "ground";
  if (base === "rapid-redeploy" && !run.discardPile.some(hardware))
    return { ok: false, message: "No hardware card is in your discard pile." };
  const demolish = base === "demolition-charge" && run.installations.length
    ? (installationId ? run.installations.find(item => item.id === installationId) : mostDangerous(run)) : null;
  if (base === "demolition-charge" && installationId && !demolish)
    return { ok: false, message: "Choose an installation on the table." };
  const capturedRoles = base === "wireshark" && primary
    ? new Set(primary.path.map(nodeId => run.topology.nodes.find(node => node.id === nodeId)!).filter(node => node.role !== "client").map(node => node.role))
    : null;
  if (base === "containerlab" || base === "rebuild") {
    const socket = freeSocket(run);
    if (!socket) return { ok: false, message: "The table has no free socket for a new lab." };
    const condition = deployCondition(run);
    const node: NetworkNode = { id: `router${run.nextNodeId++}`, role: "router", ...socket, upgraded: base === "containerlab", condition, maxCondition: condition, deployedBy: id };
    run.topology.nodes.push(node);
    run.topology.links.push({ a: "alpha", b: node.id }, { a: node.id, b: "omega" });
  }
  consume(run, index);
  let note = "";
  if (["patch", "reroute", "protocol"].includes(base)) {
    const repaired = clearFaultsAndRepair(run, true);
    if (repaired) note = ` · ${repaired.toUpperCase()} repaired`;
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
  } else {
    // ---- v4 cards (values from content's definitions, design defaults as fallbacks)
    if (base === "broadcast-storm" || base === "packet-storm") effects(run).everyPort = (run.turnEffects!.everyPort ?? 0) + (values.everyPort ?? 2);
    if (base === "flood-fill") effects(run).everyPort = (run.turnEffects!.everyPort ?? 0) + (values.perChannelEveryPort ?? 1) * network.channelCount;
    if (base === "traffic-shaping") {
      effects(run).forceFocus = true;
      run.turnEffects!.focusBonus = (run.turnEffects!.focusBonus ?? 0) + (values.focusBonus ?? 1);
    }
    if (base === "demolition-charge") {
      effects(run).focusBonus = (run.turnEffects!.focusBonus ?? 0) + (values.focusBonus ?? 2);
      if (demolish) {
        run.reclaim = (run.reclaim ?? 0) + destroyInstallation(run, demolish, card(id).name);
        note = ` · ${INSTALLATION_NAMES[demolish.kind]} destroyed`;
        settleFallen(run);
      }
    }
    if (base === "spearhead") effects(run).spearhead = true;
    if (base === "bulkhead") effects(run).firewallBonus = (run.turnEffects!.firewallBonus ?? 0) + (values.firewallBonus ?? 1);
    if (base === "quorum") run.block += (values.perHostile ?? 2) * Math.max(0, livingEnemies(run).length - 1);
    if (base === "field-repair") for (const node of run.topology.nodes) if (wearable(node)) node.condition = maxConditionOf(node);
    if (base === "rapid-redeploy") {
      // Deterministic: the most recently discarded hardware card.
      for (let i = run.discardPile.length - 1; i >= 0 && run.hand.length < HAND_LIMIT; i--) {
        if (!hardware(run.discardPile[i])) continue;
        const recovered = run.discardPile.splice(i, 1)[0];
        run.hand.push(recovered);
        (effects(run).discounted ??= []).push(recovered);
        note = ` · ${card(recovered).name} returns for ${Math.max(0, card(recovered).cost - (values.discount ?? 1))}`;
        break;
      }
    }
    applyValues(run, id);
  }
  log(
    run,
    capturedRoles
      ? `Wireshark captured ${[...capturedRoles].join(" + ")}: +${capturedRoles.size} burst, drew ${capturedDraw} card${capturedDraw === 1 ? "" : "s"} · exhausted for this encounter.`
      : `${card(id).name} activated${note}${card(id).exhaust ? " · exhausted for this encounter" : ""}.`,
  );
  return { ok: true, message: `${card(id).name} activated${note}.` };
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

// ------------------------------------------------------------------ the table front: scrub and repair

/** Rule 34: 1 energy removes 1 integrity (2 while a Quarantine Drone lives); at 0 the
 * installation is destroyed and Reclaim adds 2 shield to the coming enemy phase. */
export function scrubInstallation(run: RunState, id: string): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Scrub installations during an encounter." };
  const item = run.installations.find(entry => entry.id === id);
  if (!item) return { ok: false, message: "Choose an installation on the table." };
  const cost = scrubCost(run);
  if (run.energy < cost) return { ok: false, message: `Scrubbing costs ${cost} energy per point.` };
  run.energy -= cost;
  item.integrity--;
  const name = INSTALLATION_NAMES[item.kind];
  if (item.integrity > 0) {
    log(run, `${name} scrubbed · ${item.integrity} integrity left.`);
    return { ok: true, message: `${name} scrubbed · ${item.integrity} left.` };
  }
  run.reclaim = (run.reclaim ?? 0) + destroyInstallation(run, item, "scrub");
  settleFallen(run);
  log(run, `${name} destroyed · Reclaim +${RULES.reclaimShield} shield.`);
  return { ok: true, message: `${name} destroyed · +${RULES.reclaimShield} shield.` };
}
/** Rule 44: 1 energy restores 1 condition (Field Engineer: the first repair each turn is free). */
export function repairCost(run: RunState): number {
  return has(run, "field-engineer") && !(run.repairsThisTurn ?? 0) ? 0 : RULES.repairCost;
}
export function repairNode(run: RunState, id: string): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Repair devices during an encounter." };
  const node = run.topology.nodes.find(item => item.id === id);
  if (!node || !wearable(node)) return { ok: false, message: "Choose a deployed device." };
  if (!isWorn(node)) return { ok: false, message: `${node.id.toUpperCase()} is at full condition.` };
  const cost = repairCost(run);
  if (run.energy < cost) return { ok: false, message: `Repair costs ${cost} energy.` };
  run.energy -= cost;
  run.repairsThisTurn = (run.repairsThisTurn ?? 0) + 1;
  repairDevice(node, 1);
  log(run, `${node.id.toUpperCase()} repaired · condition ${node.condition}/${maxConditionOf(node)}.`);
  return { ok: true, message: `${node.id.toUpperCase()} repaired.` };
}

// ------------------------------------------------------------------ console

export const CONSOLES: Record<ConsoleId, { name: string; rules: string; cost: number; target: "instant" | "link" }> = {
  patch: { name: "Patch Cable", cost: 1, target: "link", rules: "Connect two devices with a standard cable. Once per turn." },
  harden: { name: "Harden", cost: 1, target: "instant", rules: `Gain ${RULES.hardenShield} block, +${RULES.hardenPerFirewall} per online firewall${RULES.hardenPerHostile ? `, +${RULES.hardenPerHostile} per hostile on the field beyond the first` : ""}${RULES.hardenPerAdd ? `, +${RULES.hardenPerAdd} more per guardian add` : ""}, and restore ${RULES.faultClearRepair} condition on your most worn device. Once per turn.` },
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
  const gained = hardenBlock(run);
  run.block += gained;
  run.energy -= state.cost;
  run.consoleUses++;
  const repaired = clearFaultsAndRepair(run, false);
  log(run, `Harden: +${gained} block${repaired ? ` · ${repaired.toUpperCase()} repaired` : ""}.`);
  return { ok: true, message: `Hardened · +${gained} block${repaired ? ` · ${repaired.toUpperCase()} repaired` : ""}.` };
}

/** Block the Warden's Harden grants now: base, per online firewall, per living hostile beyond the
 * first (hardenPerHostile) and per living guardian add (hardenPerAdd). One hostile and no adds:
 * the v3 Harden. The console preview should read this. */
export function hardenBlock(run: RunState): number {
  const firewalls = analyze(run, run.faultNodes, run.faultLinks).onlineNodes.filter(node => node.role === "firewall").length;
  const living = livingEnemies(run);
  const others = Math.max(0, living.length - 1);
  const adds = living.filter(enemy => enemy.role === "add").length;
  return RULES.hardenShield + RULES.hardenPerFirewall * firewalls + RULES.hardenPerHostile * others + RULES.hardenPerAdd * adds;
}

// ------------------------------------------------------------------ network analysis

export function livePaths(run: RunState): string[][] {
  return paths(run.topology, new Set(run.faultNodes), new Set(run.faultLinks));
}
/** Router routes, strongest (primary) first. */
export function signalPaths(run: RunState): string[][] {
  return analyze(run, run.faultNodes, run.faultLinks).routes.map(route => route.path);
}

/** Pure forecast (rule 1 of the surprise contract). Resolution uses these exact values and targets. */
export function combatPreview(run: RunState): CombatPreview {
  return resolveTurn(simulationOf(run)).preview;
}

/** Total damage if `signal` were the primary route and every delivery merged on the leader. */
export function damageFromPath(run: RunState, signal: string[]): number {
  const network = analyze(run, run.faultNodes, run.faultLinks);
  const index = network.routes.findIndex(item => item.path.join() === signal.join());
  if (index < 0) return 0;
  const sim = simulationOf(run);
  sim.buffering = false;
  const leader = leaderOf(sim);
  sim.aims = {};
  sim.focus = leader?.port ?? null;
  // Promote the chosen route by fencing off every stronger one: evaluate it alone.
  const forecast = resolveTurn(sim).preview;
  if (forecast.signalPath.join() === signal.join()) return forecast.packetDamage;
  const route = network.routes[index];
  const lone = simulationOf(run);
  lone.topology.links = lone.topology.links.filter(link => route.path.some((id, i) => i > 0 && linkKey(route.path[i - 1], id) === linkKey(link.a, link.b)));
  lone.aims = {};
  return Math.max(0, resolveTurn(lone).preview.packetDamage);
}

// ------------------------------------------------------------------ the end of the turn

function victory(run: RunState, result: TurnResult) {
  result.defeated = true;
  run.score += 100 + run.integrity * 5;
  if (has(run, "repair-drone")) run.integrity = Math.min(run.maxIntegrity, run.integrity + 1);
  run.block = 0;
  run.packetBoost = 0;
  run.zoneEffects = [];
  run.installations = [];
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  run.protocols = [];
  run.consoleUses = 0;
  run.turnEffects = {};
  run.reclaim = 0;
  if (run.preparedCard) run.discardPile.push(run.preparedCard);
  run.preparedCard = null;
  for (const enemy of run.enemies) delete enemy.exposed;
  const names = run.enemies.map(enemy => enemy.name);
  log(run, `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]} neutralized. ${names.length > 1 ? "Their intents are" : "Its intent is"} cancelled.`);
  grantVictory(run);
}

/** "a Jammer", "an Anchor". */
const article = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
function actionLine(run: RunState, forecast: CombatPreview, uid: string): string | null {
  const hostile = forecast.hostiles.find(item => item.uid === uid);
  const enemy = run.enemies.find(item => item.uid === uid);
  if (!hostile || !enemy || hostile.state === "dormant") return null;
  if (hostile.interrupted) return `${enemy.name}'s ultimate interrupted! Armor broken and +${RULES.exposedBonus} signal damage next turn.`;
  if (hostile.state !== "acts" && hostile.state !== "spiteful") return null;
  const parts: string[] = [];
  if (hostile.field) parts.push(`cast ${FIELD_RULES[hostile.field.kind].name} on ${hostile.field.zone.toUpperCase()}`);
  for (const id of hostile.jams) parts.push(`jammed ${id.toUpperCase()}`);
  for (const key of hostile.cuts) parts.push(`cut ${key.toUpperCase().replace("::", " ↔ ")}`);
  if (hostile.overload) parts.push(`overloaded ${hostile.overload.toUpperCase()}`);
  for (const install of hostile.installs) parts.push(install.absorbed ? "lost an installation to a phantom"
    : install.boosts ? `reinforced ${install.boosts.toUpperCase()}`
      : install.destroyed ? `planted ${article(INSTALLATION_NAMES[install.kind])} the honeypot destroyed`
        : `planted ${article(INSTALLATION_NAMES[install.kind])}`);
  if (hostile.junk) parts.push(`injected ${hostile.junk.count} ${CARDS[hostile.junk.card].name}`);
  if (hostile.raw || !parts.length) parts.push(`dealt ${hostile.incoming} integrity damage${hostile.raw > hostile.incoming ? ` (${hostile.raw - hostile.incoming} blocked)` : ""}`);
  return `${enemy.name}${hostile.state === "spiteful" ? " (spiteful, resolving anyway)" : ""} ${parts.join("; ")}.`;
}

export function endTurn(run: RunState): TurnResult {
  if (run.phase !== "battle" || !run.enemies.length)
    throw new Error("No active encounter.");
  const resolution = resolveTurn(run);
  const forecast = resolution.preview;
  const portDamage: Partial<Record<Port, number>> = {};
  for (const port of PORTS) {
    const entry: PortForecast | null = forecast.ports[port];
    if (entry && !forecast.buffering && forecast.signalPath.length) portDamage[port] = entry.packet - entry.overflowOut;
  }
  const result: TurnResult = {
    signalPath: forecast.signalPath,
    alternatePath: forecast.alternatePath,
    channelPaths: forecast.channelPaths,
    packetDamage: forecast.packetDamage,
    enemyAction: "",
    integrityDamage: 0,
    defeated: false,
    lost: false,
    interrupted: forecast.interrupted,
    buffered: 0,
    bufferReleased: 0,
    bufferLost: false,
    protocolsTriggered: [],
    enemyDamage: 0,
    malwarePlanted: resolution.planted[0] ?? null,
    junkAdded: [],
    backpressureStored: 0,
    forecast,
    portDamage,
    deaths: resolution.deaths,
    planted: resolution.planted,
    destroyed: forecast.destroyed,
    actions: [],
    arrived: resolution.events.arrived,
    signalAnnounced: resolution.events.signalAnnounced,
    signalFired: resolution.events.signalFired,
    shed: resolution.events.shed,
    escalated: resolution.events.escalated,
    fallen: [],
    offersQueued: 0,
  };
  const offersBefore = run.offers.length;
  // Crates open, Laden messages and Salvaged drops fall once the damage is applied; salvage lands
  // on the table at the end of the enemy phase (contract §1), or yields credits once the fight is over.
  const settle = (onTable: boolean) => {
    result.fallen = openFallen(run, resolution.deaths, onTable);
    result.offersQueued = run.offers.length - offersBefore;
    for (const record of result.fallen) {
      const name = run.enemies.find(enemy => enemy.uid === record.uid)?.name ?? "";
      if (record.crate) log(run, `${name}'s crate · ${record.crate.kind === "salvage" && !record.placed ? `${record.credits} credits (no free socket)` : crateText(record.crate)}.`);
      if (record.placed?.source === "salvaged") log(run, `${name} drops a salvaged ${record.placed.role} at ${zoneForNode(record.placed).toUpperCase()}.`);
    }
    if (result.offersQueued) log(run, `${result.offersQueued === 1 ? "An undelivered message waits" : `${result.offersQueued} offers wait`} for your answer.`);
  };
  if (forecast.buffering) {
    result.buffered = forecast.bufferGain;
    log(run, `Transmission buffered: +${forecast.bufferGain} stored (${run.buffer} total).`);
  } else if (forecast.signalPath.length) result.bufferReleased = forecast.bufferRelease;
  run.score += forecast.packetDamage * 10;
  if (!forecast.buffering)
    log(
      run,
      forecast.packetDamage
        ? `Signal dealt ${forecast.packetDamage}: ${forecast.damageTerms.map((term) => `${term.label} ${term.amount >= 0 ? "+" : ""}${term.amount}`).join(" · ")}.`
        : forecast.signalPath.length ? "The live signal was absorbed by armor or hostile fields. No damage." : "No live router route. No signal damage.",
    );
  if (resolution.ended === "transmission") {
    settle(false);
    victory(run, result);
    return result;
  }
  result.protocolsTriggered = forecast.protocolTriggers.map(trigger => trigger.card);
  run.discardPile.push(...result.protocolsTriggered);
  if (forecast.enemyDamage) {
    result.enemyDamage = forecast.enemyDamage;
    // A body a trap killed may have left the rail to an arrival at its port: name it from the forecast.
    const struck = forecast.hostiles.filter(hostile => hostile.trapDamage).map(hostile => run.enemies.find(enemy => enemy.uid === hostile.uid)?.name ?? ENEMIES[hostile.id]?.name ?? hostile.id);
    log(run, `Traps dealt ${forecast.enemyDamage} to ${struck.join(" and ")}.`);
  }
  for (const record of forecast.quarantine) log(run, `${record.firewallId.toUpperCase()} quarantines ${record.installationId.toUpperCase()} · ${record.damage}${record.destroys ? " · destroyed" : ""}.`);
  if (resolution.ended === "traps") {
    settle(false);
    victory(run, result);
    return result;
  }
  // Step 7: junk lands at seeded positions in the draw pile (the only RNG in the enemy phase).
  for (const batch of resolution.junk)
    for (let i = 0; i < batch.count; i++) {
      const position = Math.floor(random(run) * (run.drawPile.length + 1));
      run.drawPile.splice(position, 0, batch.card);
      result.junkAdded.push(batch.card);
    }
  for (const enemy of run.enemies) {
    const heal = forecast.hostiles.find(item => item.uid === enemy.uid)?.heal;
    if (heal) log(run, `${enemy.name} siphoned ${heal} health.`);
  }
  result.integrityDamage = forecast.incoming;
  result.backpressureStored = forecast.backpressureGain;
  result.actions = forecast.hostiles.map(hostile => actionLine(run, forecast, hostile.uid)).filter((line): line is string => !!line);
  // A Spiteful hostile took the last body with it: its action resolved, then the fight ends.
  if (resolution.ended === "phase") {
    for (const line of result.actions) log(run, line);
    if (run.integrity <= 0) {
      run.phase = "lost";
      result.lost = true;
      return result;
    }
    settle(false);
    victory(run, result);
    return result;
  }
  settle(true);
  result.enemyAction = result.actions.join(" ") || "The hostiles hold their positions.";
  if (forecast.hostiles.length > 1 || !result.actions.length) {
    if (forecast.incoming || forecast.incomingRaw) log(run, `Enemy phase: ${forecast.incoming} integrity damage${forecast.shield ? ` (${Math.min(forecast.incomingRaw, forecast.shield)} blocked)` : ""}.`);
  }
  for (const line of result.actions) log(run, line);
  for (const effect of forecast.installationEffects)
    if (effect.effect === "jam" && effect.target && !effect.decoyed && !effect.absorbed && !effect.cancelled) log(run, `${effect.id.toUpperCase()} jams ${effect.target.toUpperCase()}.`);
    else if (effect.effect === "detonate") log(run, `${effect.id.toUpperCase()} detonates.`);
  for (const record of forecast.wear) if (!record.breaks) log(run, `${record.nodeId.toUpperCase()} worn by ${record.source} · condition ${record.to}.`);
  for (const record of forecast.breakdowns) log(run, `${record.nodeId.toUpperCase()} breaks${record.wreck ? " · wreckage remains" : ""}.`);
  if (result.protocolsTriggered.length) log(run, `Protocols fired: ${forecast.protocolTriggers.map(t => `${t.name} — ${t.effect}`).join(" ")}`);
  const charging = forecast.hostiles.find(hostile => hostile.state === "acts" && hostile.intent?.kind === "charge");
  if (charging) log(run, `${run.enemies.find(enemy => enemy.uid === charging.uid)?.name ?? ENEMIES[charging.id]?.name ?? "The guardian"} is charging. Prepare a burst to interrupt the next transmission, or brace for the impact.`);
  for (const uid of result.shed) log(run, `${run.enemies.find(enemy => enemy.uid === uid)?.name ?? "It"} sheds an escort.`);
  for (const step of result.escalated) log(run, `${run.enemies.find(enemy => enemy.uid === step.uid)?.name ?? "The leader"} escalates to level ${step.level}: ${levelRule(run, step.level)}.`);
  for (const arrival of result.arrived)
    log(run, arrival.kind === "add" ? `${ENEMIES[arrival.id].name} rises at the ${arrival.port.toUpperCase()} port.` : `${ENEMIES[arrival.id].name} arrives at the ${arrival.port.toUpperCase()} port.`);
  if (result.signalFired) log(run, result.signalFired);
  if (result.signalAnnounced) log(run, result.signalAnnounced);
  // Step 10: the next turn on the post-phase board.
  run.turn++;
  run.energy = forecast.nextTurn.energy;
  run.reserveEnergy = 0;
  if (forecast.bufferAtRisk) {
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
  run.turnEffects = {};
  run.reclaim = 0;
  run.repairsThisTurn = 0;
  // Rule 17 and 49: a channel that no longer exists loses its aim; the focus follows rule 15.
  const live = new Set(analyze(run, run.faultNodes, run.faultLinks).channels.map(route => channelKey(route.path)));
  for (const key of Object.keys(run.aims)) if (!live.has(key) || !enemyAt(run, run.aims[key])) delete run.aims[key];
  run.focus = effectiveFocus(run);
  for (const held of run.hand.splice(0))
    (baseCard(held) === "packet-loss" ? run.exhaustPile : run.discardPile).push(held);
  if (run.preparedCard) run.hand.push(run.preparedCard);
  run.preparedCard = null;
  draw(run, forecast.nextTurn.draw - run.hand.length);
  if (run.integrity <= 0) {
    run.phase = "lost";
    result.lost = true;
  }
  return result;
}

/** Deprecated v3 name kept for the zone helpers' callers. */
export { hostileFieldTurns };
/** Sum of terms, for callers that reconcile ledgers. */
export { sumTerms };
