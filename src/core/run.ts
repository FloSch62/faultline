import { CARDS, RULES, STARTER_DECK, STARTER_SIGNATURES, baseCard, type CardDefinition, type CardValues } from "./cards.ts";
import { canLink, cableable, initialTopology, linkKey, paths } from "./graph.ts";
import { createMap } from "./map.ts";
import { grantVictory } from "./meta.ts";
import { random, shuffle, log } from "./util.ts";
import { crossesWreckage, terrainFor } from "./terrain.ts";
import { planEncounter } from "./encounter.ts";
import type {
  CardId, ConsoleId, EscalationLevel, Installation, MapRoom, NetworkLink, NetworkNode, Port, Role, RunState, TurnEffects, Zone,
} from "./types.ts";
import { crateText } from "./encounter.ts";
import { ENEMIES } from "./enemies.ts";
import { levelRule } from "./combat/intent.ts";
import { openFallen, type ArrivalRecord, type FallenRecord } from "./combat/surprises.ts";
import {
  FIELD_RULES, INSTALLATION_NAMES, PORTS, ZONES, card, damageEnemy, deployCondition, destroyInstallation, effectiveFocus, enemyAt,
  freeSocket, has, hostileFieldTurns, installField, insideGrid, isBlocked, isWorn, leaderOf, livingEnemies, maxConditionOf,
  mostDangerous, mostWorn, repairDevice, scrubCost, socketNear, startingFocus, wearable, zoneForNode,
} from "./combat/board.ts";
import { analyze } from "./combat/network.ts";
import {
  bufferMultiplier, portArmor, resolveTurn, simulationOf, sumTerms, turnDrawBase, turnEnergyBase,
  type CombatPreview, type DestroyRecord, type PortForecast,
} from "./combat/resolve.ts";
import {
  daemonTotal, daemonsWith, effectOf, fireDaemons, HAND_HOOKS, playLimit,
  type CardEffect, type EngineApi, type PlayContext, type StrikeRecord,
} from "./effects/index.ts";

export type { Zone, Intent } from "./types.ts";
export type {
  CombatPreview, CombatTerm, Delivery, PortForecast, HostileForecast, HostileState, InstallForecast, InstallationEffect,
  QuarantineRecord, ProtocolTrigger, WearRecord, BreakRecord, DestroyRecord,
} from "./combat/resolve.ts";
export { random } from "./util.ts";
export { RULES } from "./cards.ts";
/** v5: the turn's energy base (min(RULES.relicEnergyCap, baseEnergy + energy relics)); the energy
 * orb reads `current / turnEnergyBase(run)`. Next turn's full energy is combatPreview().nextTurn.energy. */
export { turnEnergyBase, turnDrawBase } from "./combat/resolve.ts";
export { runningDaemons, daemonLabel, playLimit, type RunningDaemon } from "./effects/index.ts";
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

/** Draws up to `count` cards (hand limit 10; an empty draw pile reshuffles the discard pile with the
 * expedition RNG). Every drawn card fires its onDraw hand hook (Memory Leak) and the daemons' onDraw. */
function draw(run: RunState, count: number): CardId[] {
  const drawn: CardId[] = [];
  for (let i = 0; i < count && run.hand.length < HAND_LIMIT; i++) {
    if (!run.drawPile.length && run.discardPile.length) {
      run.drawPile = shuffle(run, run.discardPile.splice(0));
      log(run, "Discard pile reshuffled into deck.");
    }
    const next = run.drawPile.shift();
    if (!next) break;
    run.hand.push(next);
    drawn.push(next);
    drawnHooks(run, next);
  }
  return drawn;
}
function drawnHooks(run: RunState, id: CardId) {
  const hooks = HAND_HOOKS[baseCard(id)];
  if (hooks?.onDraw && CARDS[id]) hooks.onDraw({ run, card: CARDS[id], api });
  if (run.daemons?.length) fireDaemons(run, "onDraw", api, { drawn: id });
}
function guaranteedDraw(run: RunState, match: (id: CardId) => boolean) {
  const index = run.drawPile.findIndex(match);
  if (index === -1 || run.hand.length >= HAND_LIMIT) return;
  const [id] = run.drawPile.splice(index, 1);
  run.hand.push(id);
  drawnHooks(run, id);
}

/** Every encounter-scoped field at its empty value. */
function freshEncounter(): Pick<RunState, "enemies" | "faultNodes" | "faultLinks" | "installations" | "focus" | "enemyPhase" | "hostileActions" | "reinforcement" | "signal" | "offers" | "encounterCards" | "daemons"> {
  return {
    enemies: [], faultNodes: [], faultLinks: [], installations: [], focus: null, enemyPhase: 0, hostileActions: 0,
    reinforcement: null, signal: null, offers: [], encounterCards: [], daemons: [],
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
    // The Architect's twelve (newExpedition sets the chosen keeper's deck).
    deck: [...STARTER_DECK, ...STARTER_SIGNATURES.architect],
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
  delete run.nextTurn;
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
  // Innate cards start in the opening hand, drawn first (before the guaranteed router and links),
  // beyond the draw count if needed; the hand limit holds.
  for (let i = 0; i < run.drawPile.length && run.hand.length < HAND_LIMIT;) {
    if (!card(run.drawPile[i])?.innate) { i++; continue; }
    const [id] = run.drawPile.splice(i, 1);
    run.hand.push(id);
    drawnHooks(run, id);
  }
  guaranteedDraw(run, (id) => ["router", "hardened-router"].includes(baseCard(id)));
  guaranteedDraw(run, (id) => card(id).target === "link");
  guaranteedDraw(run, (id) => card(id).target === "link");
  const spare = has(run, "spare-parts") && run.hand.length < HAND_LIMIT;
  if (spare) run.hand.push("fiber");
  draw(run, Math.max(0, turnDrawBase(run) - (run.hand.length - Number(spare))));
  const names = run.enemies.map(enemy => enemy.name).join(", ");
  log(run, `${names} ${run.enemies.length > 1 ? "enter" : "enters"} the grid. ${run.terrain.name}. Establish a route.`);
  for (const line of plan.entrance) log(run, line);
}

// ------------------------------------------------------------------ the target

/** Rule 15: set the target (the rules' focus), the port every delivery lands on. Free. */
export function setFocus(run: RunState, port: Port): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Choose a target during an encounter." };
  const enemy = enemyAt(run, port);
  if (!enemy) return { ok: false, message: "No living hostile stands at that port." };
  run.focus = port;
  return { ok: true, message: `Target · ${port.toUpperCase()} · ${enemy.name}.` };
}

// ------------------------------------------------------------------ hand

/** Set one card aside now; it replaces one draw in your next hand. */
export function prepareCard(run: RunState, index: number): ActionResult {
  if (run.phase !== "battle") return { ok: false, message: "Prepare a card during an encounter." };
  if (run.preparedCard) return { ok: false, message: "Return your prepared card before choosing another." };
  if (!Number.isInteger(index) || index < 0 || !run.hand[index]) return { ok: false, message: "Choose a card from your hand." };
  if (card(run.hand[index]).junk) return { ok: false, message: "Junk cannot be prepared." };
  // v5: a curse cannot leave the hand this way (Backdoor, Bitrot and Kernel Panic act from the hand).
  if (card(run.hand[index]).curse) return { ok: false, message: "Curses cannot be prepared." };
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

/** Hot Swap is unspent: the first link card this turn costs 0. */
const hotSwapReady = (run: RunState) => has(run, "hot-swap") && !run.firstFiberPlayed;
export function costFor(run: RunState, index: number): number {
  const id = run.hand[index];
  if (!id) return Infinity;
  const definition = card(id);
  const fx = run.turnEffects;
  let cost = definition.cost;
  if (definition.target === "link") {
    // Hot Swap: the first link card each turn; Patch Panel: the next N link cards.
    if (hotSwapReady(run) || (fx?.freeLinks ?? 0) > 0) cost = 0;
    if (has(run, "zero-trust")) cost += 1;
  }
  // Rack and Stack: the next hardware card costs less.
  if (definition.target === "ground" && fx?.hardwareDiscount) cost = Math.max(0, cost - fx.hardwareDiscount);
  // Rapid Redeploy, Blueprint: these hand cards cost 1 less this turn; Rearm: these cost 0.
  if (fx?.discounted?.includes(id)) cost = Math.max(0, cost - 1);
  if (fx?.freeCards?.includes(id)) cost = 0;
  return cost;
}
/** Protocol slots: RULES.maxProtocols plus the protocolSlots daemons (Policy Engine). */
export function protocolLimit(run: RunState): number {
  return RULES.maxProtocols + daemonTotal(run, "protocolSlots");
}
function canPlay(run: RunState, index: number, target: CardDefinition["target"]): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Cards are played during encounters." };
  const id = run.hand[index];
  if (!id || card(id).target !== target)
    return { ok: false, message: "Select a matching card." };
  // Kernel Panic: while it is in your hand, at most N card plays this turn.
  const limit = playLimit(run);
  if (run.cardsPlayed >= limit.limit)
    return { ok: false, message: `${limit.by} is in your hand: at most ${limit.limit} card${limit.limit === 1 ? "" : "s"} this turn.` };
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
/** Moves a card to the exhaust pile; Cover Tracks and other cardExhausted daemons hear it. */
function exhaust(run: RunState, id: CardId) {
  run.exhaustPile.push(id);
  if (run.daemons?.length) fireDaemons(run, "cardExhausted", api, { exhausted: id });
}
/** Pays for the card at `index` and spends the discounts it used (Hot Swap, freeLinks,
 * hardwareDiscount, discounted, freeCards). The card is still in the hand. */
function pay(run: RunState, index: number) {
  const id = run.hand[index], definition = card(id), fx = run.turnEffects;
  const hotSwap = hotSwapReady(run);
  run.energy -= costFor(run, index);
  if (fx?.discounted?.includes(id)) fx.discounted.splice(fx.discounted.indexOf(id), 1);
  if (fx?.freeCards?.includes(id)) fx.freeCards.splice(fx.freeCards.indexOf(id), 1);
  if (definition.target === "link") {
    // Hot Swap is spent by the first link card; Patch Panel's free links by the ones after it.
    if (!hotSwap && fx?.freeLinks) fx.freeLinks--;
    run.firstFiberPlayed = true;
  }
  if (definition.target === "ground" && fx?.hardwareDiscount) fx.hardwareDiscount = 0;
  run.cardsPlayed++;
}
/** A played card leaves the hand: daemons start running, Exhaust and encounter-only cards
 * exhaust, the rest goes to discard. */
function consume(run: RunState, index: number) {
  const id = run.hand[index];
  pay(run, index);
  run.score += 1;
  run.hand.splice(index, 1);
  const encounter = encounterOnly(run, id);
  if (card(id).target === "daemon") run.daemons.push(id);
  else if (card(id).exhaust || encounter) exhaust(run, id);
  else run.discardPile.push(id);
}
/** Generic numeric effects shared by every card after its specific rule; `manual` keys are the
 * card effect's own business. */
function applyValues(run: RunState, id: CardId, manual: readonly (keyof CardValues)[] = []) {
  const v = card(id).values;
  const on = (key: keyof CardValues) => !!v[key] && !manual.includes(key);
  if (on("block")) run.block += v.block!;
  if (on("burst")) run.packetBoost += v.burst!;
  if (on("energy")) run.energy += v.energy!;
  if (on("nextEnergy")) run.reserveEnergy += v.nextEnergy!;
  if (on("heal")) run.integrity = Math.min(run.maxIntegrity, run.integrity + v.heal!);
  if (on("buffer")) run.buffer += v.buffer!;
  if (on("draw")) draw(run, v.draw!);
}
const effects = (run: RunState): TurnEffects => (run.turnEffects ??= {});
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

// ------------------------------------------------------------------ the card-effect registry

interface Play {
  ctx: PlayContext;
  effect: CardEffect | undefined;
  /** Man-in-the-Middle as it stood before this card (the card that sets it does not feed itself). */
  mitm: number;
}
/** The registry context for the card at `index`: its effect, and the channels before the play. */
function playOf(run: RunState, index: number, target: Partial<PlayContext> = {}): Play {
  const id = run.hand[index], definition = card(id), effect = effectOf(id);
  const before = effect ? analyze(run, run.faultNodes, run.faultLinks, true) : null;
  return {
    effect,
    mitm: run.turnEffects?.mitm ?? 0,
    ctx: {
      id, base: baseCard(id), card: definition, values: definition.values, api,
      before: { channels: before?.channelCount ?? 0, primary: before?.primary?.path ?? [] },
      ...target,
    },
  };
}
const refuse = (message: string): ActionResult => ({ ok: false, message });
/** After the card left the hand: its registered rule, the generic values (unless `generic` is
 * false: daemons and the legacy branches that apply their own numbers), then every card-played
 * listener. Returns the effect's note. */
function resolvePlay(run: RunState, play: Play, generic = true): string {
  const note = play.effect?.play?.(run, play.ctx) || "";
  if (generic) applyValues(run, play.ctx.id, play.effect?.manual);
  afterPlay(run, play.ctx.id, play.mitm);
  return note;
}
/** Every card play ends here: Man-in-the-Middle feeds the buffer, cardPlayed daemons hear it
 * (a daemon just started does not hear its own play). */
function afterPlay(run: RunState, id: CardId, mitm = run.turnEffects?.mitm ?? 0) {
  (effects(run).cardsPlayed ??= []).push(id);
  if (mitm) run.buffer += mitm;
  const started = card(id).target === "daemon" && run.daemons?.at(-1) === id;
  const listening = started ? run.daemons.slice(0, -1) : run.daemons ?? [];
  if (listening?.length) fireDaemons(run, "cardPlayed", api, { played: id }, listening);
}
/** The player deployed a device / laid a cable: the daemons hear it. */
function deployed(run: RunState, node: NetworkNode) {
  if (run.daemons?.length) fireDaemons(run, "deviceDeployed", api, { node });
}
function laid(run: RunState, link: NetworkLink) {
  if (run.daemons?.length) fireDaemons(run, "linkPlaced", api, { link });
}
/** Player actions that can change the board watch the live channel count: channelsGained daemons
 * (Peering Session) fire with the channels the action added. */
function watched(run: RunState, action: () => ActionResult): ActionResult {
  if (run.phase !== "battle" || !daemonsWith(run, "channelsGained")) return action();
  const before = analyze(run, run.faultNodes, run.faultLinks, true).channelCount;
  const result = action();
  if (result.ok && run.phase === "battle") {
    const gained = analyze(run, run.faultNodes, run.faultLinks, true).channelCount - before;
    if (gained > 0) fireDaemons(run, "channelsGained", api, { gained });
  }
  return result;
}

// ------------------------------------------------------------------ placement

export function playZone(run: RunState, index: number, zone: Zone): ActionResult {
  return watched(run, () => zonePlay(run, index, zone));
}
function zonePlay(run: RunState, index: number, zone: Zone): ActionResult {
  const ready = canPlay(run, index, "zone");
  if (!ready.ok) return ready;
  if (!ZONES.includes(zone)) return { ok: false, message: "Choose North, Center, or South." };
  const id = run.hand[index], base = baseCard(id);
  const play = playOf(run, index, { zone });
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  let purged = "";
  if (play.effect) {
    // A registered zone card: its rule does everything.
  } else if (base === "purge-field") {
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
  const note = resolvePlay(run, play);
  settleFallen(run);
  const message = `${card(id).name} · ${zone.toUpperCase()}${play.effect ? note : base === "purge-field" ? ` cleansed${purged}` : ` · ${RULES.alliedFieldTurns} turns`}.`;
  log(run, message);
  return { ok: true, message };
}
export function relocateNode(run: RunState, id: string, x: number, z: number): ActionResult {
  return watched(run, () => relocate(run, id, x, z));
}
function relocate(run: RunState, id: string, x: number, z: number): ActionResult {
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
/** Link cards that lay armored cable (cut-proof and fray-proof): the `cutProof` card flag. */
export const laysArmoredCable = (id: CardId | null | undefined) => !!id && !!CARDS[id]?.cutProof;
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
  return watched(run, () => groundPlay(run, index, x, z));
}
function groundPlay(run: RunState, index: number, x: number, z: number): ActionResult {
  const ready = canPlay(run, index, "ground");
  if (!ready.ok) return ready;
  if (!insideGrid(x, z))
    return { ok: false, message: "Place hardware inside the build grid." };
  if (run.topology.nodes.length >= RULES.maxDevices)
    return { ok: false, message: "The table has no more device slots." };
  const blocked = isBlocked(run, x, z);
  if (blocked) return { ok: false, message: blocked };
  const id = run.hand[index], base = baseCard(id), definition = card(id);
  const role = definition.role!;
  if (role === "firewall" && has(run, "anycast"))
    return { ok: false, message: "Anycast forbids firewalls on your table." };
  const play = playOf(run, index, { x, z });
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, x, z, deployedBy: id };
  if (definition.jamProof) node.shielded = true;
  if (base === "stateful-firewall") node.stateful = true;
  if (base === "sentry-firewall") node.sentry = true;
  if (role === "phantom") node.absorbs = definition.values.absorbs ?? 1;
  else node.condition = node.maxCondition = role === "rack" ? RULES.rackCondition : deployCondition(run);
  // Auto-links: `values.links` nearest devices (Linux Bridge, …); Spine-Leaf: every router.
  const autoLinks = !cableable(node) ? []
    : base === "spine-leaf" ? run.topology.nodes.filter(other => other.role === "router")
      : definition.values.links ? nearest(run, { x, z }, definition.values.links) : [];
  run.topology.nodes.push(node);
  const cables = autoLinks.map(other => ({ a: node.id, b: other.id }));
  run.topology.links.push(...cables);
  consume(run, index);
  play.ctx.node = node;
  deployed(run, node);
  for (const cable of cables) laid(run, cable);
  const note = resolvePlay(run, play);
  log(run, `${node.id.toUpperCase()} installed${autoLinks.length ? ` and cabled to ${autoLinks.map(n => n.id.toUpperCase()).join(", ")}` : ""}${note}.`);
  return { ok: true, message: `${definition.name} installed${note}.` };
}
export function playLink(run: RunState, index: number, a: string, b: string): ActionResult {
  return watched(run, () => linkPlay(run, index, a, b));
}
function linkPlay(run: RunState, index: number, a: string, b: string): ActionResult {
  const ready = canPlay(run, index, "link");
  if (!ready.ok) return ready;
  if (!canLink(run.topology, a, b))
    return { ok: false, message: "Those devices cannot be linked again." };
  const id = run.hand[index], definition = card(id);
  const play = playOf(run, index, { a, b });
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  const cable: NetworkLink = {
    a,
    b,
    ...(definition.cutProof ? { armored: true } : {}),
    ...(definition.amplified ? { boosted: true } : {}),
  };
  run.topology.links.push(cable);
  consume(run, index);
  play.ctx.link = cable;
  laid(run, cable);
  const note = resolvePlay(run, play);
  log(run, `${a.toUpperCase()} connected to ${b.toUpperCase()}${note}.`);
  return { ok: true, message: `Optic link established${note}.` };
}
export function canTargetNode(run: RunState, index: number, id: string): boolean {
  const node = run.topology.nodes.find((item) => item.id === id);
  const held = run.hand[index];
  if (!node || !held || card(held).target !== "node") return false;
  const effect = effectOf(held);
  if (effect?.canTarget) return effect.canTarget(run, node, held);
  const base = baseCard(held);
  if (base === "clabernetes") return node.role === "router";
  if (base === "firmware") return node.role === "router" && !node.upgraded;
  if (base === "compression") return node.role === "switch" && !node.amplified;
  if (base === "startup-config") return node.role === "router" && !node.configured;
  if (base === "shield") return !node.fixed && !node.shielded && cableable(node);
  if (base === "mesh-weave") return cableable(node) && nearest(run, node, 1).length > 0;
  if (base === "redundant-psu") return wearable(node);
  // A registered node card without canTarget takes any deployed device.
  return !!effect && !node.fixed;
}
export function playNode(run: RunState, index: number, id: string): ActionResult {
  return watched(run, () => nodePlay(run, index, id));
}
function nodePlay(run: RunState, index: number, id: string): ActionResult {
  const ready = canPlay(run, index, "node");
  if (!ready.ok) return ready;
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node) return { ok: false, message: "Select a device." };
  const held = run.hand[index], base = baseCard(held);
  if (!canTargetNode(run, index, id))
    return { ok: false, message: `Choose a valid device for ${card(held).name}.` };
  const play = playOf(run, index, { node });
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  if (play.effect) {
    consume(run, index);
    const note = resolvePlay(run, play);
    log(run, `${card(held).name} · ${node.id.toUpperCase()}${note}.`);
    return { ok: true, message: `${card(held).name} applied${note}.` };
  }
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
    deployed(run, replica);
    for (const link of links) laid(run, link);
    afterPlay(run, held, play.mitm);
    log(run, `Clabernetes replicated ${id.toUpperCase()}. Both routers are shielded.`);
    return { ok: true, message: "Router replicated. Its cables and upgrades are preserved." };
  }
  if (base === "mesh-weave") {
    const targets = nearest(run, node, card(held).values.links ?? 2);
    const woven = targets.map(other => ({ a: node.id, b: other.id }));
    run.topology.links.push(...woven);
    consume(run, index);
    for (const link of woven) laid(run, link);
    afterPlay(run, held, play.mitm);
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
  resolvePlay(run, play);
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
  return watched(run, () => instantPlay(run, index, installationId));
}
function instantPlay(run: RunState, index: number, installationId?: string): ActionResult {
  const ready = canPlay(run, index, "instant");
  if (!ready.ok) return ready;
  const id = run.hand[index], base = baseCard(id), values = card(id).values;
  const play = playOf(run, index, installationId ? { installationId } : {});
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  if (play.effect) {
    // A registered instant: its rule, then the generic values.
    consume(run, index);
    const note = resolvePlay(run, play);
    settleFallen(run);
    log(run, `${card(id).name} activated${note}${card(id).exhaust ? " · exhausted for this encounter" : ""}.`);
    return { ok: true, message: `${card(id).name} activated${note}.` };
  }
  const network = analyze(run, run.faultNodes, run.faultLinks);
  const primary = network.primary;
  if (base === "wireshark" && !primary)
    return { ok: false, message: "Wireshark needs a live ALPHA → router → OMEGA route to capture." };
  if (base === "mirror" && network.channelCount < 2)
    return { ok: false, message: "Mirror Protocol needs two or more live channels." };
  // v5: Equal-Cost Multipath needs no live route (0 channels gives 0); Flood Fill keeps the check.
  if (base === "flood-fill" && !primary)
    return { ok: false, message: `${card(id).name} needs a live route.` };
  if (base === "salvage" && !run.discardPile.some((held) => card(held).target === "link"))
    return { ok: false, message: "No link cards are in your discard pile." };
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
  const lab = base === "containerlab" || base === "rebuild" ? freeSocket(run) : null;
  if ((base === "containerlab" || base === "rebuild") && !lab)
    return { ok: false, message: "The table has no free socket for a new lab." };
  consume(run, index);
  let note = "";
  if (lab) {
    const condition = deployCondition(run);
    const node: NetworkNode = { id: `router${run.nextNodeId++}`, role: "router", ...lab, upgraded: base === "containerlab", condition, maxCondition: condition, deployedBy: id };
    const cables = [{ a: "alpha", b: node.id }, { a: node.id, b: "omega" }];
    run.topology.nodes.push(node);
    run.topology.links.push(...cables);
    deployed(run, node);
    for (const cable of cables) laid(run, cable);
  }
  if (["patch", "reroute", "protocol"].includes(base)) {
    const repaired = clearFaultsAndRepair(run, true);
    if (repaired) note = ` · ${repaired.toUpperCase()} repaired`;
  }
  let capturedDraw = 0;
  // The legacy branches below apply their own numbers; the rest take the generic values.
  let generic = false;
  if (base === "inspect") draw(run, primary ? values.draw ?? 2 : values.drawOffline ?? 1);
  else if (capturedRoles) {
    run.packetBoost += capturedRoles.size;
    capturedDraw = draw(run, values.draw ?? 2).length;
  } else if (base === "mirror") {
    run.packetBoost += (values.perChannel ?? 2) * network.channelCount;
    run.block += (values.perChannel ?? 2) * network.channelCount;
  } else if (base === "ecmp") run.packetBoost += (values.perChannel ?? 2) * network.channelCount;
  else if (base === "deep-inspection") {
    // v5: base block plus a bonus per online firewall.
    const firewalls = network.onlineNodes.filter(node => node.role === "firewall").length;
    run.block += (values.block ?? 0) + (values.perFirewall ?? 0) * firewalls;
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
    generic = true;
    // ---- v4 cards (values from their definitions)
    if (base === "broadcast-storm" || base === "packet-storm") effects(run).everyPort = (run.turnEffects!.everyPort ?? 0) + (values.everyPort ?? 0);
    if (base === "flood-fill") effects(run).everyPort = (run.turnEffects!.everyPort ?? 0) + (values.perChannelEveryPort ?? 0) * network.channelCount;
    if (base === "traffic-shaping") effects(run).focusBonus = (run.turnEffects!.focusBonus ?? 0) + (values.focusBonus ?? 0);
    if (base === "demolition-charge") {
      effects(run).focusBonus = (run.turnEffects!.focusBonus ?? 0) + (values.focusBonus ?? 0);
      if (demolish) {
        run.reclaim = (run.reclaim ?? 0) + destroyInstallation(run, demolish, card(id).name);
        note = ` · ${INSTALLATION_NAMES[demolish.kind]} destroyed`;
        settleFallen(run);
      }
    }
    if (base === "spearhead") effects(run).spearhead = true;
    if (base === "bulkhead") effects(run).firewallBonus = (run.turnEffects!.firewallBonus ?? 0) + (values.firewallBonus ?? 0);
    if (base === "quorum") run.block += (values.perHostile ?? 0) * Math.max(0, livingEnemies(run).length - 1);
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
  }
  resolvePlay(run, play, generic);
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
  const limit = protocolLimit(run);
  if (run.protocols.length >= limit)
    return { ok: false, message: `Only ${limit} protocols can be armed at once.` };
  const id = run.hand[index];
  const play = playOf(run, index);
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  pay(run, index);
  run.score += 1;
  run.hand.splice(index, 1);
  run.protocols.push(id);
  const note = resolvePlay(run, play);
  log(run, `${card(id).name} armed${note}.`);
  return { ok: true, message: `${card(id).name} armed. It fires on the matching enemy action.` };
}
/** v5: starts a daemon. It runs for the rest of the encounter (RunState.daemons), never goes to
 * discard, and copies stack. Its numbers are read by its hooks, so no generic values apply. */
export function playDaemon(run: RunState, index: number): ActionResult {
  return watched(run, () => daemonPlay(run, index));
}
function daemonPlay(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "daemon");
  if (!ready.ok) return ready;
  const id = run.hand[index];
  const play = playOf(run, index);
  const reason = play.effect?.validate?.(run, play.ctx);
  if (reason) return refuse(reason);
  consume(run, index);
  const note = resolvePlay(run, play, false);
  const copies = run.daemons.filter(item => item === id).length;
  log(run, `${card(id).name} running${copies > 1 ? ` ×${copies}` : ""}${note}.`);
  return { ok: true, message: `${card(id).name} runs for the rest of the encounter${note}.` };
}
/** Deletes a playable junk card (Worm). */
export function playJunk(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "junk");
  if (!ready.ok) return ready;
  const id = run.hand[index];
  if (card(id).unplayable)
    return { ok: false, message: `${card(id).name} cannot be played.` };
  pay(run, index);
  run.hand.splice(index, 1);
  exhaust(run, id);
  afterPlay(run, id);
  log(run, `${card(id).name} deleted.`);
  return { ok: true, message: `${card(id).name} deleted.` };
}

/** Encounter-only tokens (Payload) into the hand; the hand limit holds and the overflow goes to the
 * discard pile. They exhaust when played and never enter the deck. Returns how many reached the hand. */
export function addTokens(run: RunState, id: CardId, count: number): number {
  let added = 0;
  for (let i = 0; i < count; i++) {
    (run.encounterCards ??= []).push(id);
    if (run.hand.length < HAND_LIMIT) { run.hand.push(id); added++; }
    else run.discardPile.push(id);
  }
  return added;
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
  return watched(run, () => consoleUse(run, a, b));
}
function consoleUse(run: RunState, a?: string, b?: string): ActionResult {
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
    return { ok: true, message: `Buffering: this transmission is stored ×${bufferMultiplierOf(run)}.` };
  }
  if (state.id === "patch") {
    if (!a || !b || !canLink(run.topology, a, b)) return { ok: false, message: "Choose two unconnected devices." };
    const cable = { a, b };
    run.topology.links.push(cable);
    run.energy -= state.cost;
    run.consoleUses++;
    laid(run, cable);
    log(run, `Patch Cable: ${a.toUpperCase()} ↔ ${b.toUpperCase()}.`);
    return { ok: true, message: "Patch cable connected." };
  }
  run.energy -= state.cost;
  run.consoleUses++;
  const { block: gained, repaired } = hardenOnce(run);
  log(run, `Harden: +${gained} block${repaired ? ` · ${repaired.toUpperCase()} repaired` : ""}.`);
  return { ok: true, message: `Hardened · +${gained} block${repaired ? ` · ${repaired.toUpperCase()} repaired` : ""}.` };
}

/** Block the Warden's Harden grants now: base, per online firewall, per living hostile beyond the
 * first (hardenPerHostile), per living guardian add (hardenPerAdd) and the hardenBonus daemons.
 * One hostile, no adds and no daemon: the v3 Harden. The console preview should read this. */
export function hardenBlock(run: RunState): number {
  const firewalls = analyze(run, run.faultNodes, run.faultLinks).onlineNodes.filter(node => node.role === "firewall").length;
  const living = livingEnemies(run);
  const others = Math.max(0, living.length - 1);
  const adds = living.filter(enemy => enemy.role === "add").length;
  return RULES.hardenShield + RULES.hardenPerFirewall * firewalls + RULES.hardenPerHostile * others + RULES.hardenPerAdd * adds + daemonTotal(run, "hardenBonus");
}
/** Harden once, without spending the console (Double Shift; the console calls it too): its block
 * and its repair of the most worn device. */
export function hardenOnce(run: RunState): { block: number; repaired: string | null } {
  const block = hardenBlock(run);
  run.block += block;
  return { block, repaired: clearFaultsAndRepair(run, false) };
}
/** The buffering multiplier now (RULES.bufferMultiplier, or a bufferMultiplier daemon's). */
export function bufferMultiplierOf(run: RunState): number {
  return bufferMultiplier(run).value;
}

// ------------------------------------------------------------------ helpers for card effects

/** Deals `amount` to your target now (Exfiltrate): overflow to the target if it is another living
 * hostile, otherwise the next living port left → right; each receiving port pays its armor unless
 * `ignoreArmor`. Death side effects apply (crates open at once). Not a transmission. */
export function strikeTarget(run: RunState, amount: number, options: { ignoreArmor?: boolean } = {}): StrikeRecord {
  const record: StrikeRecord = { ports: {}, killed: [], total: 0 };
  const network = analyze(run, run.faultNodes, run.faultLinks);
  const focus = effectiveFocus(run);
  let left = Math.max(0, amount);
  const visited = new Set<Port>();
  let port: Port | null = focus;
  while (left > 0 && port) {
    const enemy = enemyAt(run, port);
    if (!enemy) break;
    visited.add(port);
    const armor = options.ignoreArmor ? 0 : Math.max(0, -sumTerms(portArmor(run, network, enemy)));
    const landed = Math.max(0, left - armor);
    const taken = Math.min(landed, enemy.hp);
    damageEnemy(run, enemy, taken);
    record.ports[port] = (record.ports[port] ?? 0) + taken;
    record.total += taken;
    if (enemy.hp <= 0) record.killed.push(enemy.uid);
    left = landed - taken;
    const living = livingEnemies(run).filter(other => !visited.has(other.port));
    port = (living.find(other => other.port === focus) ?? living[0])?.port ?? null;
  }
  settleFallen(run);
  return record;
}
/** The legal socket nearest a point (Splice: a cable's midpoint). */
export { socketNear };

/** Everything a card effect or daemon hook may do to the run (effects/types.ts documents it). */
export const api: EngineApi = {
  draw,
  addTokens,
  harden: hardenOnce,
  hardenBlock,
  clearFaultsAndRepair,
  network: run => analyze(run, run.faultNodes, run.faultLinks),
  deploy(run, role: Role, socket, extra = {}) {
    if (run.topology.nodes.length >= RULES.maxDevices || isBlocked(run, socket.x, socket.z)) return null;
    const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, x: socket.x, z: socket.z, ...extra };
    if (role === "phantom") node.absorbs ??= 1;
    else if (node.condition === undefined) node.condition = node.maxCondition = role === "rack" ? RULES.rackCondition : deployCondition(run);
    run.topology.nodes.push(node);
    deployed(run, node);
    return node;
  },
  link(run, a, b, flags = {}) {
    if (!canLink(run.topology, a, b)) return null;
    const cable: NetworkLink = { a, b, ...(flags.armored ? { armored: true } : {}), ...(flags.boosted ? { boosted: true } : {}) };
    run.topology.links.push(cable);
    laid(run, cable);
    return cable;
  },
  unlink(run, a, b) {
    const key = linkKey(a, b);
    const index = run.topology.links.findIndex(link => linkKey(link.a, link.b) === key);
    if (index < 0) return null;
    const [cable] = run.topology.links.splice(index, 1);
    run.faultLinks = run.faultLinks.filter(item => item !== key);
    if (run.frayedByCut) run.frayedByCut = run.frayedByCut.filter(item => item !== key);
    return cable;
  },
  nearest,
  socketNear,
  freeSocket,
  strike: strikeTarget,
  exhaust,
  addMisses(run, count, source) {
    const fx = effects(run);
    fx.misses = (fx.misses ?? 0) + count;
    (fx.missSources ??= []).push(...Array(count).fill(source));
  },
  addDodges(run, count, source) {
    const fx = effects(run);
    fx.dodges = (fx.dodges ?? 0) + count;
    (fx.dodgeSources ??= []).push(...Array(count).fill(source));
  },
  effects,
  settle: settleFallen,
  log,
};

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
  sim.focus = leader?.port ?? null;
  // Promote the chosen route by fencing off every stronger one: evaluate it alone.
  const forecast = resolveTurn(sim).preview;
  if (forecast.signalPath.join() === signal.join()) return forecast.packetDamage;
  const route = network.routes[index];
  const lone = simulationOf(run);
  lone.topology.links = lone.topology.links.filter(link => route.path.some((id, i) => i > 0 && linkKey(route.path[i - 1], id) === linkKey(link.a, link.b)));
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
  run.daemons = [];
  delete run.nextTurn;
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
  // Block: Grounded Core, what Persistent State carries, and next-turn gains (Brace).
  run.block = forecast.nextTurn.block;
  run.packetBoost = 0;
  run.cardsPlayed = 0;
  run.firstFiberPlayed = false;
  run.consoleUses = 0;
  run.buffering = false;
  run.turnEffects = {};
  run.reclaim = 0;
  run.repairsThisTurn = 0;
  delete run.nextTurn;
  // Rule 15: a dead target moves on.
  run.focus = effectiveFocus(run);
  // The hand: Retain stays, Volatile (Packet Loss) exhausts, the rest is discarded.
  const retained: CardId[] = [];
  for (const held of run.hand.splice(0)) {
    const definition = card(held);
    if (definition.retain) retained.push(held);
    else if (definition.volatile) exhaust(run, held);
    else run.discardPile.push(held);
  }
  run.hand.push(...retained);
  const prepared = run.preparedCard;
  // A hand already full of retained cards leaves the prepared card on top of the draw pile.
  if (prepared) (run.hand.length < HAND_LIMIT ? run.hand.push(prepared) : run.drawPile.unshift(prepared));
  run.preparedCard = null;
  // The prepared card replaces one draw; retained cards do not.
  draw(run, forecast.nextTurn.draw - (prepared ? 1 : 0));
  // Daemons: the start of your turn, after the draw.
  if (run.daemons?.length) fireDaemons(run, "turnStart", api, {});
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
