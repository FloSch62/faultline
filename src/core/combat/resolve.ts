/** The end-turn order, fused (design section 6.4). One resolver computes every step on the
 * state it is given: combatPreview runs it on a copy (pure, no RNG), endTurn runs it on the
 * run itself and then performs only the RNG steps (junk positions, rewards, draws). Every
 * number the forecast shows is therefore the number resolution uses.
 *
 * Steps: 1 board, deliveries, ports, intents · 2 transmit or buffer · 3 lethal per hostile ·
 * 4 traps, protocols, firewall quarantine · 5 installs and heals · 6 faults clear, fields
 * tick, fields / faults / overloads per hostile, then installation effects · 7 junk ·
 * 8 attacks against one shared shield pool · 9 exposed · 10 next turn on the post-phase board. */
import { ENERGY_RELICS, RULES, baseCard, type ProtocolTrigger as Trigger } from "../cards.ts";
import { channelKey, linkKey } from "../graph.ts";
import type { CardDefinition } from "../card-types.ts";
import type {
  CardId, DesignationId, Enemy, Installation, InstallationKind, Intent, NetworkNode, Port, RunState, Zone, ZoneEffect, EscalationLevel, HostileRole,
} from "../types.ts";
import {
  BAND_TIES, FIELD_RULES, INSTALLATION_NAMES, ZONES, anchoredBands, bandSocket, breakDevice, cabledHoneypots, card, conditionOf,
  damageEnemy, definitionOf, destroyInstallation, effectiveFocus, enemyAt, fieldBands, has, hostileFieldTurns, hostileLabel,
  installField, installationId, isHardware, leaderOf, livingEnemies, livingLeader, reachSocket, shelterOf, wearDevice, wearable,
  within, zoneForNode, type BreakRecord, type DestroyRecord, type TableLog, type WearRecord,
} from "./board.ts";
import { analyze, contributionOf, type Network } from "./network.ts";
import { addWreck } from "../terrain.ts";
import { addBreakBonus, ascends } from "../ascension.ts";
import { actsInPhase, advanceSteps, intentFor, nextLevel, scales } from "./intent.ts";
import { announceSignal, emptySidePort, fireSignal, raiseAdds, reinforce, type ArrivalRecord } from "./surprises.ts";
import {
  daemonAmounts, daemonFlag, daemonMax, daemonRouteTerms, daemonShieldTerms, handHooks, protocolRetaliation,
  type EndOfTurnEffect,
} from "../effects/index.ts";

export interface CombatTerm {
  label: string;
  amount: number;
}
export type HostileState = "acts" | "dormant" | "cancelled" | "spiteful" | "skipped";
export interface Delivery {
  channelKey: string;
  index: number;
  primary: boolean;
  path: string[];
  /** Always the target's port: every delivery lands there and merges into one packet. */
  port: Port;
  amount: number;
  terms: CombatTerm[];
}
export interface PortForecast {
  uid: string;
  /** Sum of the deliveries landing here (after Siphon Taps): the target's port, else 0. */
  merged: number;
  /** Port bonuses: every-port and target cards, backpressure release, exposed guardian. */
  bonus: number;
  /** Armor and plating subtracted once from everything the port receives. */
  armor: number;
  armorTerms: CombatTerm[];
  overflowIn: number;
  overflowOut: number;
  overflowTo: Port | null;
  /** Damage that lands on this port after armor, overflow included. */
  packet: number;
  hpBefore: number;
  hpAfter: number;
  lethal: boolean;
  breakThreshold: number | null;
  breaks: boolean;
}
export interface InstallForecast {
  kind: InstallationKind;
  x: number;
  z: number;
  /** Planted within reach of a cabled Honeypot: one integrity less (rule 37). */
  bitten: boolean;
  /** Arrives destroyed (a bitten Tap or Breaker Charge). */
  destroyed: boolean;
  /** Full table (rule 30): the id of the oldest installation that gains 1 integrity instead. */
  boosts?: string;
  /** A Phantom Node absorbs it (the phantom's id). */
  absorbed?: string;
  /** Id of the new installation. */
  id?: string;
  integrity?: number;
  /** The device a reach installation was aimed beside. */
  aim?: string;
  /** Why it is planted: the intent itself, or a rider (Nesting, escalation level 3, a guardian's
   * charge at ascension 10, Rigged's Spike beside a cut). */
  source?: InstallSource;
}
export type InstallSource = "intent" | "nesting" | "escalation" | "charge" | "rigged";
export interface HostileForecast {
  uid: string;
  id: string;
  port: Port;
  role: HostileRole;
  intent: Intent | null;
  state: HostileState;
  /** Its action is an interrupted ultimate. */
  interrupted: boolean;
  raw: number;
  incoming: number;
  terms: CombatTerm[];
  shieldTerms: CombatTerm[];
  heal: number;
  trapDamage: number;
  /** Scorched Earth: damage it takes when an installation it planted is destroyed this phase. */
  scorched: number;
  escalation: EscalationLevel;
  nextLevel: { level: EscalationLevel; inActions: number; rule: string } | null;
  /** First installation of its action (compatibility); every one: `installs`. */
  install: InstallForecast | null;
  installs: InstallForecast[];
  /** Designations it carries (leaders and singles). */
  designations: DesignationId[];
  /** Printed beside the intent: "resolves anyway" (Spiteful at lethal). */
  note?: string;
  /** A dormant or rising hostile: the intent of its next active phase. */
  upcoming?: Intent;
  /** Cables its level-1 cuts fray for one player turn. */
  frays: string[];
  field: ZoneEffect | null;
  /** A later caster's field on the same band replaces this one (rule 22, announced). */
  fieldReplaced: boolean;
  junk: { card: CardId; count: number } | null;
  /** Nodes it jams, cables it cuts, the device it overloads (landing targets, decoys included). */
  jams: string[];
  cuts: string[];
  overload: string | null;
  /** Disruptions a honeypot decoyed, a Phantom Node absorbed or a protocol cancelled. */
  decoyed: number;
  absorbed: number;
  cancelled: number;
  // ---- v5
  /** Jams and cuts that missed (Spoof, Obfuscation). */
  missed: number;
  /** Its strike or breach deals 0: the dodge's source (Ghost Protocol), or null. */
  dodged: string | null;
  /** Its strike or breach was cancelled by a protocol (Null Route): the protocol's name, or null. */
  nullified: string | null;
}
export type InstallationEffectKind = "jam" | "wear" | "tick" | "detonate" | "idle" | "anchor" | "siphon";
export interface InstallationEffect {
  id: string;
  kind: InstallationKind;
  effect: InstallationEffectKind;
  target: string | null;
  countdown?: number;
  decoyed?: boolean;
  absorbed?: boolean;
  cancelled?: boolean;
  /** v5: its jam missed (Spoof, Obfuscation): the source. */
  missed?: string;
  /** It was destroyed while acting (a honeypot bite or Port Security). */
  destroyed?: boolean;
}
export interface QuarantineRecord {
  firewallId: string;
  installationId: string;
  damage: number;
  destroys: boolean;
}
export interface ProtocolTrigger {
  card: CardId;
  name: string;
  effect: string;
  /** Enemy.uid or installation id it answered. */
  target?: string;
  /** v5: protocolFired daemons (Incident Response) hit the one that set it off. */
  retaliation?: CombatTerm[];
}
/** v5: a jam or cut that missed, or a strike or breach dodged, with its source (the forecast names it). */
export interface EvasionRecord {
  kind: "miss" | "dodge";
  source: string;
  /** Enemy.uid of the hostile, or the installation id (a Jammer's jam). */
  by: string;
  /** The jammed node or cut cable that was spared (misses). */
  target: string | null;
}
/** v5: a card left in the hand at the end of the turn and what it does in the enemy phase. */
export interface HandEffectRecord {
  id: CardId;
  name: string;
  count: number;
  /** Unblockable integrity loss (in `incoming` and `incomingTerms`). */
  integrity: number;
  /** Devices it wears in the table-front step (in `wear`, source = its name). */
  wear: string[];
}
export interface CombatPreview {
  signalPath: string[];
  alternatePath: string[];
  /** Sum of what lands on every port (overflow counted once). */
  packetDamage: number;
  damageTerms: CombatTerm[];
  /** Every shield term this phase: the shared pool plus per-attack firewalls and protocols. */
  shield: number;
  shieldTerms: CombatTerm[];
  incoming: number;
  incomingRaw: number;
  /** The leader's intent (the single hostile's, as in v3). Every hostile: `hostiles`. */
  intent: Intent | null;
  /** Every living hostile falls to this transmission: the fight ends (a Spiteful action may still resolve). */
  lethal: boolean;
  /** The fight ends this turn, whichever way: the transmission, traps, or during the enemy phase. */
  fightEnds: boolean;
  independent: boolean;
  /** First disruption target that lands (a jammed node id or a cut linkKey). */
  faultTarget: string | null;
  hazardZone: Zone | null;
  enemyHealing: number;
  rawPacketDamage: number;
  incomingTerms: CombatTerm[];
  traitDescription: string;
  zoneThreat: ZoneEffect | null;
  interrupted: boolean;
  breakDamage: number | null;
  channels: number;
  channelPaths: string[][];
  /** Live router routes, one per device set (the HUD's "3 routes · 2 channels"). */
  routeCount: number;
  /** Devices where live routes merge and so carry one channel between them, with the number of
   * routes through each: the devices of a smallest set every route passes through (graph.mergePoints). */
  sharedDevices: { id: string; routes: number }[];
  online: string[];
  clusters: Zone[];
  protocolTriggers: ProtocolTrigger[];
  buffering: boolean;
  bufferGain: number;
  bufferRelease: number;
  bufferAtRisk: boolean;
  backpressureGain: number;
  /** Trap damage to hostiles (honeypot bites, Port Security, Tarpit). */
  enemyDamage: number;
  enemyDefeatedByTraps: boolean;
  /** First installation socket planted this phase (compatibility: the Siphon Tap ghost beam). */
  malwareTarget: { x: number; z: number } | null;
  junk: { card: CardId; count: number } | null;
  /** Next turn on the post-phase board. `block`: Grounded Core, block a blockCarry daemon keeps
   * (Persistent State) and next-turn gains (Brace). */
  nextTurn: { energy: number; draw: number; block: number };
  // ---- v4
  deliveries: Delivery[];
  ports: Record<Port, PortForecast | null>;
  hostiles: HostileForecast[];
  installationEffects: InstallationEffect[];
  quarantine: QuarantineRecord[];
  wear: WearRecord[];
  breakdowns: BreakRecord[];
  /** Installations destroyed during the phase (quarantine, bites, Port Security). */
  destroyed: DestroyRecord[];
  /** Reclaim shield in the phase's pool (this turn's scrubs plus the phase's destructions). */
  reclaim: number;
  focus: Port | null;
  /** An announced arrival: "arrives after this action" when inPhases is 1. A Shedding spawn armed
   * by this transmission shows here too. */
  arrivals: { kind: "reinforcement"; enemyId: string; port: Port | null; inPhases: number; shed?: boolean } | null;
  /** The announced signal (from the turn-2 announcement until it fires). */
  signal: { id: string; firesOnTurn: number; text: string } | null;
  /** Guardian adds raised at the end of this phase (the charge is announced): they stand on the
   * charge turn and act from the ultimate. */
  risingAdds: { enemyId: string; port: Port }[];
  /** Every jam and cut that lands this phase, Jammers included. */
  faultTargets: string[];
  installTargets: (InstallForecast & { owner: string })[];
  // ---- v5
  /** Misses and dodges this phase, in resolution order. */
  evasions: EvasionRecord[];
  /** Curses in hand with an end-of-turn effect (Backdoor, Bitrot). */
  handEffects: HandEffectRecord[];
  /** Block that does not expire (a blockCarry daemon), and the daemon's label. */
  blockCarried: { amount: number; by: string } | null;
}

// ------------------------------------------------------------------ turn resources

/** v5: the turn's energy base, before temporary energy: RULES.baseEnergy plus 1 per energy relic,
 * capped at RULES.relicEnergyCap. PoE Injectors online, next-turn energy, Reserve Cell and cards
 * come on top of it, uncapped. The energy orb reads current / this. */
export function turnEnergyBase(run: RunState): number {
  const relics = ENERGY_RELICS.filter(relic => has(run, relic)).length;
  return Math.min(Math.max(RULES.relicEnergyCap, RULES.baseEnergy), RULES.baseEnergy + relics);
}
/** Buffering stores ×this (a bufferMultiplier daemon such as Deep Queue may raise it). */
export function bufferMultiplier(run: RunState): { value: number; label: string | null } {
  return daemonMax(run, "bufferMultiplier", RULES.bufferMultiplier);
}
/** Share of prevented damage the Backpressure relic stores (Flow Control may raise it). */
export function backpressureRatio(run: RunState): { value: number; label: string | null } {
  return daemonMax(run, "backpressureRatio", RULES.backpressureRatio);
}
export function turnDrawBase(run: RunState): number {
  return RULES.handDraw + Number(has(run, "deep-cache")) - Number(has(run, "jumbo-frames"));
}
export const sumTerms = (terms: readonly CombatTerm[]) => terms.reduce((sum, term) => sum + term.amount, 0);

/** A copy of everything the resolver mutates; piles, deck, map and log are shared read-only. */
export function simulationOf(run: RunState): RunState {
  return {
    ...run,
    enemies: run.enemies.map(enemy => ({ ...enemy })),
    topology: { nodes: run.topology.nodes.map(node => ({ ...node })), links: run.topology.links.map(link => ({ ...link })) },
    installations: run.installations.map(item => ({ ...item })),
    zoneEffects: run.zoneEffects.map(field => ({ ...field })),
    faultNodes: [...run.faultNodes],
    faultLinks: [...run.faultLinks],
    protocols: [...run.protocols],
    terrain: run.terrain && { ...run.terrain, debris: run.terrain.debris.map(spot => ({ ...spot })) },
    reinforcement: run.reinforcement && { ...run.reinforcement },
    signal: run.signal && { ...run.signal, ...(run.signal.socket ? { socket: { ...run.signal.socket } } : {}) },
    ...(run.frayedByCut ? { frayedByCut: [...run.frayedByCut] } : {}),
    ...(run.turnEffects ? { turnEffects: copyEffects(run.turnEffects) } : {}),
    ...(run.nextTurn ? { nextTurn: { ...run.nextTurn } } : {}),
    daemons: [...(run.daemons ?? [])],
    ...(run.lingeringJams ? { lingeringJams: { ...run.lingeringJams } } : {}),
    ...(run.attackers ? { attackers: [...run.attackers] } : {}),
  };
}

const copyEffects = (fx: NonNullable<RunState["turnEffects"]>) => ({
  ...fx,
  ...(fx.discounted ? { discounted: [...fx.discounted] } : {}),
  ...(fx.freeCards ? { freeCards: [...fx.freeCards] } : {}),
  ...(fx.missSources ? { missSources: [...fx.missSources] } : {}),
  ...(fx.dodgeSources ? { dodgeSources: [...fx.dodgeSources] } : {}),
  ...(fx.cardsPlayed ? { cardsPlayed: [...fx.cardsPlayed] } : {}),
});

// ------------------------------------------------------------------ step 1–2: the transmission

interface Transmission {
  deliveries: Delivery[];
  ports: Record<Port, PortForecast | null>;
  /** What each port's hostile takes (after overflow out). */
  taken: Map<Port, number>;
  terms: CombatTerm[];
  packetDamage: number;
  rawPacketDamage: number;
  buffering: boolean;
  bufferGain: number;
  bufferRelease: number;
}

/** Route terms of the primary route (v3 labels), then the route daemons (v5: switchBonus per
 * switch, routeTerms hooks), labelled with the daemon's name. */
function routeTerms(run: RunState, path: readonly string[], boosted: number, frayed: number): CombatTerm[] {
  const nodes = run.topology.nodes.filter(node => path.includes(node.id));
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
  if (boosted) route.push({ label: `Amplified cables ×${boosted}`, amount: boosted * RULES.amplifiedCableDamage });
  if (frayed) route.push({ label: `Frayed cables ×${frayed} · crossing wreckage`, amount: -frayed * RULES.frayedCableDamage });
  const bands = new Set(nodes.filter(node => !node.fixed).map(zoneForNode));
  for (const zone of ZONES) {
    if (!bands.has(zone)) continue;
    const resonance = fieldBands(run, "resonance").get(zone) ?? 0, suppression = fieldBands(run, "suppression").get(zone) ?? 0;
    if (resonance) route.push({ label: `${zone.toUpperCase()} · Resonance${resonance > 1 ? ` ×${resonance}` : ""}`, amount: resonance * RULES.resonanceDamage });
    if (suppression) route.push({ label: `${zone.toUpperCase()} · Suppression${suppression > 1 ? ` ×${suppression}` : ""}`, amount: -suppression * RULES.suppressionPenalty });
  }
  if (switches) for (const term of daemonAmounts(run, "switchBonus")) route.push({ label: `${term.label} · switches ×${switches}`, amount: term.amount * switches });
  if (run.daemons?.length) route.push(...daemonRouteTerms(run, nodes.filter(node => !node.fixed)));
  return route;
}

/** Armor and plating of one port (rule 12): subtracted once from the merged packet. */
export function portArmor(run: RunState, network: Network, enemy: Enemy): CombatTerm[] {
  if (enemy.exposed) return [];
  const definition = definitionOf(enemy);
  const firewall = network.onlineNodes.some(node => node.role === "firewall");
  const terms: CombatTerm[] = [];
  const armor = definition.armor;
  if (armor) {
    // The Hollow Choir's plating is 3 while any Chorister lives (section 9.2).
    const base = enemy.id === "cantor" && run.enemies.some(other => other.id === "chorister" && other.hp > 0) ? RULES.choirAddPlating : armor.amount;
    const amount = armor.bypass === "firewall"
      ? (firewall ? 0 : base)
      : Math.max(0, base - (armor.perChannel ?? RULES.gradedArmorPerChannel) * (network.channelCount - 1));
    if (amount > 0)
      terms.push({ label: `${enemy.name} armor · ${armor.bypass === "firewall" ? "needs an online firewall" : `each extra channel strips ${armor.perChannel ?? RULES.gradedArmorPerChannel}`}`, amount: -amount });
  }
  // Armored: plating 2 unless a firewall is online; it stacks with a Ward Node's link (rule 63).
  if (!firewall && enemy.designations?.includes("armored"))
    terms.push({ label: "ARMORED plating · needs an online firewall", amount: -RULES.armoredPlating });
  // Ward Node · plating link: while it lives the leader has plating 2 (an online firewall bypasses it).
  if (!firewall && livingLeader(run) === enemy) {
    const wards = run.enemies.filter(other => other !== enemy && other.id === "ward-node" && other.hp > 0).length;
    if (wards) terms.push({ label: `Ward Node plating link${wards > 1 ? ` ×${wards}` : ""} · needs an online firewall`, amount: -wards * RULES.wardPlating });
  }
  return terms;
}

function transmit(run: RunState, network: Network, focus: Port | null): Transmission {
  const primary = network.primary;
  const buffering = run.buffering && !!primary;
  const effects = run.turnEffects ?? {};
  const living = livingEnemies(run);
  const spanning = has(run, "spanning-tree");
  const taps = run.installations.filter(item => item.kind === "tap").length;
  const balancers = network.onlineNodes.filter(node => node.role === "balancer").length;
  const bandwidth = has(run, "parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel;
  const channels = network.channelCount;
  const attackers = new Set((run.attackers ?? []).filter(uid => living.some(enemy => enemy.uid === uid)));
  // Backpressure lands in full on every port whose hostile struck or breached last phase
  // (contract §1); with one hostile, or no attacker, it rides the primary delivery exactly as v3.
  const backpressurePorts = attackers.size && living.length > 1 ? living.filter(enemy => attackers.has(enemy.uid)).map(enemy => enemy.port) : [];
  const release = !buffering && primary ? run.buffer : 0;
  const terms: CombatTerm[] = [];
  const deliveries: Delivery[] = [];
  // Every delivery lands on the target (rule 15); overflow carries what it does not need (rule 13).
  const port: Port = focus ?? "centre";
  if (primary) {
    // ---- aggregate terms, v3 labels (a single hostile sees exactly v3's list)
    const route = routeTerms(run, primary.path, primary.boosted, primary.frayed);
    terms.push(...route);
    const routeSum = sumTerms(route);
    const primaryTerms: CombatTerm[] = [...route];
    if (spanning && routeSum > 0) {
      const doubled = { label: "Spanning Tree · primary route ×2", amount: routeSum };
      terms.push(doubled);
      primaryTerms.push(doubled);
    }
    if (!spanning && channels > 1) terms.push({ label: `Bandwidth · ${channels} channels`, amount: (channels - 1) * bandwidth });
    // v5 · bandwidthBonus daemons (Fabric Controller): each bandwidth delivery deals more.
    const bandwidthBonus = !spanning && channels > 1 ? daemonAmounts(run, "bandwidthBonus") : [];
    for (const term of bandwidthBonus) terms.push({ label: `${term.label} · ${channels - 1} bandwidth ${channels === 2 ? "delivery" : "deliveries"}`, amount: term.amount * (channels - 1) });
    if (!spanning && balancers) terms.push({ label: `Load balancers ×${balancers} · ${channels} channel${channels === 1 ? "" : "s"}`, amount: balancers * channels * RULES.balancerPerChannel });
    if (!spanning && balancers) primaryTerms.push({ label: `Load balancers ×${balancers}`, amount: balancers * RULES.balancerPerChannel });
    for (const zone of network.clusters) {
      const cluster = { label: `${zone.toUpperCase()} · Cluster`, amount: RULES.clusterDamage };
      terms.push(cluster);
      primaryTerms.push(cluster);
    }
    // v5 · clusterBonus daemons (Datacenter): every cluster deals more.
    if (network.clusters.length) for (const term of daemonAmounts(run, "clusterBonus")) {
      const bonus = { label: `${term.label} · clusters ×${network.clusters.length}`, amount: term.amount * network.clusters.length };
      terms.push(bonus);
      primaryTerms.push(bonus);
    }
    if (taps) terms.push({ label: `Siphon Taps ×${taps}`, amount: -taps * RULES.malwarePenalty });
    const riders: CombatTerm[] = [];
    if (run.packetBoost) riders.push({ label: "Packet boost this turn", amount: run.packetBoost });
    // v5 · Payload tokens played this turn, and the payloadBonus daemons (Exploit Kit) per Payload.
    const payloads = effects.payloads ?? 0;
    if (payloads) {
      riders.push({ label: `Payload${payloads > 1 ? ` ×${payloads}` : ""}`, amount: effects.payloadDamage ?? payloads * RULES.payloadDamage });
      for (const term of daemonAmounts(run, "payloadBonus")) riders.push({ label: `${term.label} · Payloads ×${payloads}`, amount: term.amount * payloads });
    }
    if (has(run, "bgp-hijack")) riders.push({ label: "BGP Hijack", amount: RULES.bgpHijackDamage });
    if (run.backpressure && !backpressurePorts.length) riders.push({ label: "Backpressure", amount: run.backpressure });
    if (release) riders.push({ label: "Buffer release", amount: release });
    terms.push(...riders);
    primaryTerms.push(...riders);
    // ---- deliveries: the primary, then channelCount − 1 bandwidth deliveries (rules 8–10)
    const routes = [network.channels[0], ...network.channels.slice(1, channels)];
    routes.forEach((route, index) => {
      const key = channelKey(route.path);
      const own: CombatTerm[] = index === 0 ? [...primaryTerms]
        : spanning ? [{ label: "Spanning Tree · bandwidth gives nothing", amount: 0 }]
          : [{ label: "Bandwidth", amount: bandwidth }, ...bandwidthBonus, ...(balancers ? [{ label: `Load balancers ×${balancers}`, amount: balancers * RULES.balancerPerChannel }] : [])];
      deliveries.push({ channelKey: key, index, primary: index === 0, path: route.path, port, amount: sumTerms(own), terms: own });
    });
    // Priority Queue: +1 while the target is the hostile with the least health.
    if (has(run, "priority-queue") && living.length) {
      const least = Math.min(...living.map(enemy => enemy.hp));
      const target = enemyAt(run, deliveries[0].port);
      if (target && target.hp === least) {
        const bonus = { label: "Priority Queue · least health", amount: RULES.priorityQueueBonus };
        deliveries[0].terms.push(bonus);
        deliveries[0].amount += bonus.amount;
        terms.push(bonus);
      }
    }
    // Siphon Taps (rule 11): −2 each, taken from the primary delivery first, then from
    // bandwidth deliveries in channel order.
    let siphon = taps * RULES.malwarePenalty;
    for (const delivery of deliveries) {
      if (!siphon) break;
      const take = Math.min(siphon, Math.max(0, delivery.amount));
      if (!take) continue;
      siphon -= take;
      delivery.amount -= take;
      delivery.terms.push({ label: `Siphon Taps ×${taps}`, amount: -take });
    }
  }
  // ---- ports: merge, bonuses, armor, overflow (rules 12–14)
  const everyPort = primary ? effects.everyPort ?? 0 : 0;
  const focusBonus = primary ? effects.focusBonus ?? 0 : 0;
  const addBonus = addBreakBonus(run.ascension);
  interface State { enemy: Enemy; raw: number; bonus: number; armor: number; armorTerms: CombatTerm[]; buffer: number; merged: number; in: number; out: number; to: Port | null; packet: number; spared: number }
  const states: State[] = living.map(enemy => {
    const mine = deliveries.filter(delivery => delivery.port === enemy.port);
    const merged = sumTerms(mine.map(delivery => ({ label: "", amount: delivery.amount })));
    let bonus = 0;
    if (everyPort) bonus += everyPort;
    if (focusBonus && enemy.port === focus) bonus += focusBonus;
    if (primary && run.backpressure && backpressurePorts.includes(enemy.port)) bonus += run.backpressure;
    if (primary && enemy.exposed && mine.length) bonus += RULES.exposedBonus;
    const armorTerms = portArmor(run, network, enemy);
    const buffer = effects.spearhead && mine.some(delivery => delivery.primary) ? release : 0;
    return { enemy, raw: merged + bonus, bonus, armor: Math.max(0, -sumTerms(armorTerms)), armorTerms, buffer, merged, in: 0, out: 0, to: null, packet: 0, spared: 0 };
  });
  const land = (state: State) => {
    if (buffering) return (state.packet = 0);
    const total = Math.max(0, state.raw) + state.in;
    // Spearhead: the buffer release ignores armor and plating.
    const armor = Math.min(state.armor, Math.max(0, total - state.buffer));
    state.spared = Math.min(state.armor, total) - armor;
    return (state.packet = total - armor);
  };
  states.forEach(land);
  // Overflow (rule 13): the surplus flows to the focus if it is another living hostile,
  // otherwise to the next living port in order left, centre, right; the receiver pays its armor.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const from of states) {
      const excess = from.packet - from.enemy.hp - from.out;
      if (excess <= 0) continue;
      const open = states.filter(state => state !== from && state.enemy.hp - state.packet > 0);
      const to = open.find(state => state.enemy.port === focus) ?? open[0];
      if (!to) continue;
      from.out += excess;
      from.to = to.enemy.port;
      to.in += excess;
      land(to);
      moved = true;
    }
    if (!moved) break;
  }
  const ports: Record<Port, PortForecast | null> = { left: null, centre: null, right: null };
  const taken = new Map<Port, number>();
  const hpAfter = new Map(states.map(state => [state.enemy.uid, Math.max(0, state.enemy.hp - state.packet)]));
  for (const state of states) {
    const enemy = state.enemy, definition = definitionOf(enemy);
    const lethal = state.packet >= enemy.hp;
    let breakThreshold: number | null = null;
    if (definition.boss && intentFor(run, enemy).ultimate) {
      const adds = run.enemies.filter(other => other.role === "add" && (hpAfter.get(other.uid) ?? 0) > 0).length;
      breakThreshold = definition.boss.breakDamage + adds * addBonus;
    }
    taken.set(enemy.port, state.packet - state.out);
    ports[enemy.port] = {
      uid: enemy.uid, merged: state.merged, bonus: state.bonus, armor: state.armor, armorTerms: state.armorTerms,
      overflowIn: state.in, overflowOut: state.out, overflowTo: state.to, packet: state.packet,
      hpBefore: enemy.hp, hpAfter: hpAfter.get(enemy.uid)!, lethal,
      breakThreshold, breaks: !lethal && breakThreshold !== null && state.packet >= breakThreshold,
    };
  }
  // ---- the aggregate ledger (sums exactly to the damage that lands)
  for (const state of states) {
    if (state.bonus) {
      const port = state.enemy.port.toUpperCase();
      if (everyPort) terms.push({ label: `${port} · every port +${everyPort}`, amount: everyPort });
      if (focusBonus && state.enemy.port === focus) terms.push({ label: `${port} · target packet`, amount: focusBonus });
      if (primary && run.backpressure && backpressurePorts.includes(state.enemy.port)) terms.push({ label: `${port} · Backpressure`, amount: run.backpressure });
      if (primary && state.enemy.exposed && deliveries.some(delivery => delivery.port === state.enemy.port)) terms.push({ label: "Exposed guardian", amount: RULES.exposedBonus });
    }
    if (primary) terms.push(...state.armorTerms);
    if (state.spared) terms.push({ label: "Spearhead · the release ignores armor", amount: state.spared });
  }
  const storable = sumTerms(deliveries.map(delivery => ({ label: "", amount: delivery.amount }))) + everyPort + focusBonus + (backpressurePorts.length ? run.backpressure : 0);
  const multiplier = bufferMultiplier(run);
  const bufferGain = buffering ? Math.floor(Math.max(0, storable) * multiplier.value) : 0;
  if (buffering && sumTerms(terms) !== 0) terms.push({ label: `Stored in buffer · +${bufferGain} (×${multiplier.value}${multiplier.label ? ` · ${multiplier.label}` : ""})`, amount: -sumTerms(terms) });
  const packetDamage = buffering ? 0 : [...taken.values()].reduce((sum, amount) => sum + amount, 0);
  const rawPacketDamage = sumTerms(terms.filter(term => term.amount > 0));
  const gap = packetDamage - sumTerms(terms);
  if (gap) terms.push({ label: "Minimum signal damage", amount: gap });
  return { deliveries, ports, taken, terms, packetDamage, rawPacketDamage, buffering, bufferGain, bufferRelease: release };
}

// ------------------------------------------------------------------ step 1: targets

type UnitState = "lands" | "decoyed" | "absorbed" | "cancelled" | "missed";
interface Unit {
  target: string;
  state: UnitState;
  /** The honeypot that decoyed it, or the phantom that absorbed it. */
  by?: string;
  /** Escalation level 1: the jam lasts an extra player turn; the cut frays this cable. */
  lingers?: boolean;
  fray?: string;
}
/** One installation an action plants: its intent's, or a rider's. */
interface InstallUnit {
  kind: InstallationKind;
  source: InstallSource;
  /** A fixed device to plant beside (Rigged: the cut cable's nearer device). */
  beside?: string;
  absorbed?: string;
}
interface Plan {
  enemy: Enemy;
  intent: Intent;
  state: HostileState;
  /** This action's number on the hostile's own counter (1-based), and the level it announces next. */
  action: number;
  nextLevel: HostileForecast["nextLevel"];
  /** A dormant or rising hostile's next active intent. */
  upcoming?: Intent;
  /** Installations its action plants (intent, riders, Rigged Spikes), in order. */
  units: InstallUnit[];
  installs: InstallForecast[];
  enraged: boolean;
  interrupted: boolean;
  /** Took its turn this phase (its counter advances, its action has a global index). */
  acted: boolean;
  index: number;
  jams: Unit[];
  cuts: Unit[];
  overload: Unit | null;
  field: ZoneEffect | null;
  fieldCancelled: boolean;
  hazard: Zone | null;
  /** Its own chip terms (the Wraith's exposed cable). */
  chip: CombatTerm[];
  /** Phase chip from its disruption finding nothing ("Exposed backbone"). */
  exposure: CombatTerm[];
  protocolShield: CombatTerm[];
  trapDamage: number;
  heal: number;
  terms: CombatTerm[];
  shieldTerms: CombatTerm[];
  raw: number;
  through: number;
  junk: { card: CardId; count: number } | null;
  /** v5: a protocol cancelled its strike or breach (Null Route): the protocol's name. */
  nullified: string | null;
  /** v5: its strike or breach was dodged: the dodge's source. */
  dodged: string | null;
}
/** Its action resolves: it acts and lives, or it is Spiteful (its announced action resolves even if
 * it dies this turn, rule 59). */
const resolving = (plan: Plan) => (plan.state === "acts" && plan.enemy.hp > 0 || plan.state === "spiteful") && !plan.interrupted;
const spiteful = (plan: Plan) => plan.state === "acts" && !!plan.enemy.designations?.includes("spiteful");
/** A cut cable's nearer device: the non-terminal end nearer the far rail (ties: earliest installed). */
function nearerDevice(run: RunState, key: string): NetworkNode | null {
  const ends = key.split("::").map(id => run.topology.nodes.find(node => node.id === id)).filter((node): node is NetworkNode => !!node);
  return [...ends].sort((a, b) => Number(!!a.fixed) - Number(!!b.fixed) || a.z - b.z || run.topology.nodes.indexOf(a) - run.topology.nodes.indexOf(b))[0] ?? null;
}

function isEnraged(run: RunState, enemy: Enemy) {
  const definition = definitionOf(enemy);
  const threshold = definition.boss && ascends(run.ascension, "lastSignal") ? 0.6 : 0.5;
  return scales(enemy) && !!definition.enrages && enemy.hp <= enemy.maxHp * threshold;
}

function jamBand(enemy: Enemy): Zone | null {
  const definition = definitionOf(enemy);
  return definition.jamBands ? ZONES[Math.floor(enemy.turn / definition.pattern.length) % 3] : null;
}

/** Disruption targets for every hostile that will act, in port order, against the board at
 * transmission time. A honeypot decoys at most one disruption per hostile action (rule 45);
 * a second hostile may not jam or cut what an earlier one already took. */
function planTargets(run: RunState, network: Network, plans: Plan[]) {
  const path = network.primary?.path ?? [];
  const onPrimary = (id: string) => path.includes(id);
  const honeypots = cabledHoneypots(run);
  const takenNodes = new Set<string>(), takenLinks = new Set<string>();
  const nodes = run.topology.nodes;
  const byId = (id: string) => nodes.find(node => node.id === id);
  for (const plan of plans) {
    if (!resolving(plan)) continue;
    const { enemy, intent } = plan;
    const definition = definitionOf(enemy);
    const used = new Set<string>();
    if (intent.kind === "jam") {
      // Escalation level 2: two devices (the normal target, then the next eligible); a honeypot
      // absorbs at most one of them (rule 53). Level 1: the jam lasts an extra player turn.
      const zone = jamBand(enemy);
      const eligible = nodes.filter(node => !node.fixed && !node.shielded && node.role !== "rack" && node.role !== "phantom" && (!zone || zoneForNode(node) === zone));
      const lingers = intent.lingers ? { lingers: true } : {};
      for (let i = 0; i < (intent.targetCount ?? 1); i++) {
        const decoy = eligible.find(node => honeypots.includes(node) && !used.has(node.id));
        if (decoy) {
          used.add(decoy.id);
          plan.jams.push({ target: decoy.id, state: "decoyed", by: decoy.id, ...lingers });
          continue;
        }
        const chosen = new Set(plan.jams.map(unit => unit.target));
        const pool = eligible.filter(node => !takenNodes.has(node.id) && !chosen.has(node.id));
        const target = (definition.jamsFirewalls ? pool.find(node => node.role === "firewall" && network.online.has(node.id)) : undefined)
          ?? pool.find(node => onPrimary(node.id)) ?? pool[0];
        if (target) {
          plan.jams.push({ target: target.id, state: "lands", ...lingers });
          takenNodes.add(target.id);
        } else break;
      }
      if (!plan.jams.length && !zone && !nodes.some(node => !node.fixed))
        plan.exposure.push({ label: "Exposed backbone · no devices", amount: 1 });
    }
    if (intent.kind === "sever") {
      // Splicer · twin cut: two cables while a leader lives (a honeypot absorbs one).
      const count = Math.max(enemy.id === "splicer" && livingLeader(run, enemy) ? RULES.twinCut : 1, intent.targetCount ?? 1);
      const wraith = enemy.id === "wraith";
      const eligible = run.topology.links.filter(link => !link.armored);
      const length = (link: (typeof eligible)[number]) => {
        const a = byId(link.a)!, b = byId(link.b)!;
        return Math.hypot(a.x - b.x, a.z - b.z);
      };
      for (let i = 0; i < count; i++) {
        const chosen = new Set(plan.cuts.map(unit => unit.target));
        const decoy = wraith ? undefined : eligible.find(link => !chosen.has(linkKey(link.a, link.b))
          && [link.a, link.b].some(id => byId(id)?.role === "honeypot" && !used.has(id)));
        if (decoy) {
          const pot = [decoy.a, decoy.b].find(id => byId(id)?.role === "honeypot" && !used.has(id))!;
          used.add(pot);
          plan.cuts.push({ target: linkKey(decoy.a, decoy.b), state: "decoyed", by: pot });
          continue;
        }
        const pool = eligible.filter(link => !takenLinks.has(linkKey(link.a, link.b)) && !chosen.has(linkKey(link.a, link.b)));
        const target = wraith
          ? [...pool].sort((a, b) => length(b) - length(a) || linkKey(a.a, a.b).localeCompare(linkKey(b.a, b.b)))[0]
          : pool.find(link => path.some((id, j) => j > 0 && linkKey(path[j - 1], id) === linkKey(link.a, link.b))) ?? pool[0];
        if (!target) break;
        const key = linkKey(target.a, target.b);
        plan.cuts.push({ target: key, state: "lands", ...(intent.escalation && intent.escalation >= 1 ? frayAlong(run, path, key, takenLinks) : {}) });
        takenLinks.add(key);
        if (wraith && i === 0 && length(target) > RULES.cableExposureLength)
          plan.chip.push({ label: `Exposed cable longer than ${RULES.cableExposureLength} units`, amount: 1 });
      }
      if (!plan.cuts.length && !run.topology.links.length) plan.exposure.push({ label: "Exposed backbone · no cables", amount: 1 });
    }
    if (intent.kind === "overload") {
      // Jam-rule targeting (rule 41): a cabled honeypot outside a rack's ring first, then a
      // primary-route device, then the first eligible device. Jam protection does not help.
      const eligible = nodes.filter(node => wearable(node) && node.role !== "rack");
      const decoy = eligible.find(node => honeypots.includes(node) && !used.has(node.id) && !shelterOf(run, node));
      let target: NetworkNode | undefined = decoy;
      if (!target && enemy.id === "foreman") {
        // Scrap Foreman: the most worn primary-route device.
        target = eligible.filter(node => onPrimary(node.id)).sort((a, b) => conditionOf(a) - conditionOf(b) || nodes.indexOf(a) - nodes.indexOf(b))[0];
      }
      target ??= eligible.find(node => onPrimary(node.id)) ?? eligible[0];
      if (target) {
        if (decoy) used.add(decoy.id);
        plan.overload = { target: target.id, state: decoy ? "decoyed" : "lands", ...(decoy ? { by: decoy.id } : {}) };
      }
    }
    if (intent.kind === "corrupt" || intent.field) plan.field = planField(run, network, plan);
  }
}

/** Escalation level 1 (section 6.1): a cut on the primary route also frays the next cable along
 * it toward OMEGA (else toward ALPHA) for one player turn; armored cables are immune. */
function frayAlong(run: RunState, path: readonly string[], cut: string, taken: Set<string>): { fray?: string } {
  const at = path.findIndex((id, j) => j > 0 && linkKey(path[j - 1], id) === cut);
  if (at < 0) return {};
  const next = at + 1 < path.length ? linkKey(path[at], path[at + 1]) : at - 2 >= 0 ? linkKey(path[at - 2], path[at - 1]) : null;
  const link = next && run.topology.links.find(item => linkKey(item.a, item.b) === next);
  return link && !link.armored && !taken.has(next) ? { fray: next } : {};
}

/** Where a hostile field lands (v3 rule; Root Blight follows its own band). */
function planField(run: RunState, network: Network, plan: Plan): ZoneEffect {
  const { enemy, intent } = plan;
  const definition = definitionOf(enemy);
  const path = network.primary?.path ?? [];
  const kind = intent.field ?? (definition.corruption === "alternating"
    ? Math.floor(enemy.turn / 2) % 2 ? "corrosion" : "suppression"
    : definition.corruption ?? "corrosion");
  const eligible = run.topology.nodes.filter(node => isHardware(node) && (kind !== "suppression" || path.includes(node.id)));
  const busiest = (bands: readonly Zone[], nodes: readonly NetworkNode[]) =>
    [...bands].sort((a, b) => nodes.filter(node => zoneForNode(node) === b).length - nodes.filter(node => zoneForNode(node) === a).length)[0];
  let zone = (intent.kind === "jam" ? jamBand(enemy) : null) ?? busiest(BAND_TIES, eligible);
  if (enemy.id === "blight") {
    const step = enemy.turn % definition.pattern.length;
    // CORRODE (step 0) picks the busiest band and remembers it; SPREAD (the last step)
    // corrodes the adjacent band with the most hardware.
    if (step === 0 || !enemy.band) enemy.band = zone;
    else {
      const adjacent: Record<Zone, Zone[]> = { north: ["center"], center: ["north", "south"], south: ["center"] };
      zone = busiest(BAND_TIES.filter(band => adjacent[enemy.band!].includes(band)), run.topology.nodes.filter(isHardware));
    }
  }
  plan.hazard = zone;
  return { zone, kind, turns: hostileFieldTurns(run) + (intent.fieldBonus ?? 0) };
}

// ------------------------------------------------------------------ step 4: the protocol table (v5: data)

/** The hostile actions each trigger answers (the first match in port order fires it). */
const PROTOCOL_MATCH: Record<Trigger, (plan: Plan) => boolean> = {
  sever: plan => plan.cuts.some(unit => unit.state === "lands"),
  jam: plan => plan.jams.some(unit => unit.state === "lands"),
  strike: plan => plan.intent.kind === "strike" && plan.intent.amount > 0,
  breach: plan => plan.intent.kind === "breach" && plan.intent.amount > 0,
  field: plan => !!plan.field && !plan.fieldCancelled,
  ultimate: plan => plan.intent.kind === "charge" || !!plan.intent.ultimate,
};
/** Applies a protocol card to the action it answers, from its data alone: `cancels` cancels the
 * action's cuts, jams or field, or the strike's / breach's damage (Null Route; riders resolve);
 * `values.shield` / `values.reduce` shield that action; `values.damage` hits the hostile in the
 * trap step (Port Security, Tarpit, Tripwire). Returns the forecast's effect sentence. */
function answerProtocol(protocol: CardDefinition, trigger: Trigger, target: Plan): string {
  const v = protocol.values, clauses: string[] = [];
  if (protocol.cancels) {
    if (trigger === "sever") {
      target.cuts.forEach(unit => { if (unit.state === "lands") unit.state = "cancelled"; });
      clauses.push("cancels the cable cut");
    } else if (trigger === "jam") {
      target.jams.forEach(unit => { if (unit.state === "lands") unit.state = "cancelled"; });
      clauses.push("cancels the jam");
    } else if (trigger === "field") {
      target.fieldCancelled = true;
      clauses.push(`cancels ${FIELD_RULES[target.field!.kind].name} on ${target.field!.zone.toUpperCase()}`);
    } else if (trigger === "strike" || trigger === "breach" || target.intent.ultimate) {
      target.nullified = protocol.name;
      clauses.push(`cancels the ${target.intent.kind}`);
    }
  }
  const shield = v.shield ?? v.reduce ?? 0;
  if (shield) {
    target.protocolShield.push({ label: `${protocol.name} ${protocol.cancels && trigger === "sever" ? "· cut cancelled" : `vs ${trigger}`}`, amount: shield });
    clauses.push(clauses.length ? `gives ${shield} shield` : `reduces the ${trigger} by ${shield}`);
  }
  if (v.damage) {
    target.trapDamage += v.damage;
    clauses.push(`${trigger === "ultimate" ? "the guardian" : "the attacker"} takes ${v.damage}`);
  }
  const sentence = clauses.reduce((text, clause, i) => !i ? clause : clause.startsWith("gives") ? `${text} and ${clause}` : `${text}; ${clause}`, "");
  return sentence ? `${sentence[0].toUpperCase()}${sentence.slice(1)}.` : `${protocol.name} fires.`;
}

// ------------------------------------------------------------------ step 5: installations

/** The device a reach installation is aimed beside (rule 31 and the traits of 9.1–9.3). */
function reachTarget(run: RunState, network: Network, plan: Plan, plans: Plan[], unit: InstallUnit): NetworkNode | null {
  const nodes = run.topology.nodes.filter(node => !node.fixed && node.role !== "phantom" && node.role !== "rack");
  const kind = unit.kind;
  // Rigged: beside the cut cable's nearer device (a terminal serves when the cable has no other end).
  if (unit.beside) {
    const device = run.topology.nodes.find(node => node.id === unit.beside);
    if (device) return device;
  }
  if (plan.enemy.id === "demolition" && kind === "breaker" && unit.source === "intent") {
    // Demolition Engine: the device with the most cables (ties: earliest installed).
    const cables = (node: NetworkNode) => run.topology.links.filter(link => link.a === node.id || link.b === node.id).length;
    const best = [...nodes].sort((a, b) => cables(b) - cables(a) || nodes.indexOf(a) - nodes.indexOf(b))[0];
    if (best) return best;
  }
  if (plan.enemy.id === "rigger-drone" && unit.source === "intent") {
    // Rigger Drone: beside the device the leader's action names this phase.
    const leader = plans.find(other => other.enemy === livingLeader(run, plan.enemy));
    const named = leader?.jams.find(unit => unit.state === "lands")?.target ?? leader?.overload?.target;
    const device = named && nodes.find(node => node.id === named);
    if (device) return device;
  }
  // Default: the most valuable primary-route router (largest route contribution; ties: earliest).
  const path = network.primary?.path ?? [];
  const routers = nodes.filter(node => node.role === "router");
  const pick = (list: NetworkNode[]) => [...list].sort((a, b) => contributionOf(run, b) - contributionOf(run, a) || nodes.indexOf(a) - nodes.indexOf(b))[0];
  return pick(routers.filter(node => path.includes(node.id))) ?? pick(routers) ?? nodes[0] ?? null;
}

function plant(run: RunState, network: Network, plan: Plan, plans: Plan[], unit: InstallUnit, reclaim: { amount: number }, destroyed: DestroyRecord[]): InstallForecast | null {
  const kind = unit.kind, source = unit.source;
  if (run.installations.length >= RULES.maxInstallations) {
    // Full table (rule 30): the oldest installation gains 1 integrity instead.
    const oldest = run.installations[0];
    if (!oldest) return null;
    oldest.integrity = Math.min(RULES.maxInstallationIntegrity, oldest.integrity + 1);
    return { kind, x: oldest.x, z: oldest.z, bitten: false, destroyed: false, boosts: oldest.id, source };
  }
  const reach = kind === "jammer" || kind === "spike" || kind === "breaker";
  const target = reach ? reachTarget(run, network, plan, plans, unit) : null;
  const socket = (target && reachSocket(run, target)) ?? bandSocket(run, kind === "anchor" ? plan.enemy.band : undefined);
  if (!socket) return null;
  let integrity: number = RULES.installationIntegrity[kind];
  // Rigger Drone · rigging: while a leader lives its Spikes arrive with integrity 3.
  if (plan.enemy.id === "rigger-drone" && kind === "spike" && source === "intent" && livingLeader(run, plan.enemy)) integrity = RULES.riggedSpikeIntegrity;
  if (ascends(run.ascension, "lingeringCorruption")) integrity += RULES.ascensionInstallationIntegrity;
  integrity = Math.min(RULES.maxInstallationIntegrity, integrity);
  const bitten = cabledHoneypots(run).some(pot => within(pot, socket));
  if (bitten) integrity -= RULES.honeypotBite;
  const item: Installation = {
    id: installationId(run, kind), kind, ...socket, integrity, activeFrom: plan.index + 1, owner: plan.enemy.uid,
    ...(kind === "breaker" ? { countdown: RULES.breakerCountdown } : {}),
    ...(target ? { aim: target.id } : {}),
  };
  const forecast: InstallForecast = { kind, ...socket, bitten, destroyed: integrity <= 0, id: item.id, integrity: Math.max(0, integrity), ...(target ? { aim: target.id } : {}), source };
  // A honeypot bite that takes the last point destroys it on arrival (Taps, charges): Reclaim.
  if (integrity <= 0) reclaim.amount += destroyInstallation(run, item, "honeypot bite", 0, destroyed);
  else run.installations.push(item);
  return forecast;
}

// ------------------------------------------------------------------ the resolver

export interface Resolution {
  preview: CombatPreview;
  /** "transmission": every hostile fell to the packet; "traps": to traps and quarantine;
   * "phase": the enemy phase resolved and no hostile stands after it (a Spiteful action resolving
   * after its death, Scorched Earth on a planter). */
  ended: "transmission" | "traps" | "phase" | null;
  junk: { card: CardId; count: number; owner: string }[];
  /** Uids that died this turn. */
  deaths: string[];
  planted: Installation[];
  /** End-of-phase events for the UI: arrivals (reinforcement, adds), the signal announced or
   * fired, Shedding spawns armed, escalation levels reached. */
  events: {
    arrived: ArrivalRecord[];
    signalAnnounced: string | null;
    signalFired: string | null;
    shed: string[];
    escalated: { uid: string; level: EscalationLevel }[];
  };
}

export function resolveTurn(s: RunState): Resolution {
  // ================================================================ step 1: the board as transmitted
  const network = analyze(s, s.faultNodes, s.faultLinks);
  const primary = network.primary;
  const signalPath = primary?.path ?? [];
  const focus = effectiveFocus(s);
  const living = livingEnemies(s);
  const hadEnemies = s.enemies.length > 0;
  const hpAtStart = new Map(s.enemies.map(enemy => [enemy.uid, enemy.hp]));
  const shedAtStart = new Set(s.enemies.filter(enemy => enemy.shed).map(enemy => enemy.uid));
  const signalAtStart = s.signal?.announced && !s.signal.resolved
    ? { id: s.signal.id, firesOnTurn: s.signal.firesOnTurn, text: s.signal.text ?? "" } : null;
  const plans: Plan[] = living.map(enemy => {
    const intent = intentFor(s, enemy);
    const units: InstallUnit[] = [
      ...(intent.install ? [{ kind: intent.install, source: "intent" as const }] : []),
      ...(intent.alsoInstalls ?? []).map(rider => ({ ...rider })),
    ];
    const state: HostileState = intent.skipped ? "skipped" : intent.kind === "dormant" ? "dormant" : "acts";
    let upcoming: Intent | undefined;
    if (state === "dormant") for (let ahead = 1; ahead <= 3 && !upcoming; ahead++)
      if (actsInPhase(enemy, s.enemyPhase + 1 + ahead)) upcoming = intentFor(s, enemy, ahead);
    return {
      enemy, intent, state, action: enemy.turn + 1, nextLevel: scales(enemy) ? nextLevel(s, enemy, enemy.turn + 1) : null,
      ...(upcoming ? { upcoming } : {}), units, installs: [],
      enraged: isEnraged(s, enemy), interrupted: false, acted: false, index: 0,
      jams: [], cuts: [], overload: null, field: null, fieldCancelled: false, hazard: null,
      chip: [], exposure: [], protocolShield: [], trapDamage: 0, heal: 0, terms: [], shieldTerms: [], raw: 0, through: 0, junk: null,
      nullified: null, dodged: null,
    };
  });
  // Phase-level terms are read now: fields cast this phase cannot hurt until the next one.
  const hardwareBands = new Set(s.topology.nodes.filter(isHardware).map(zoneForNode));
  const chip: CombatTerm[] = [];
  const pool: CombatTerm[] = [];
  for (const zone of ZONES) {
    const online = network.onlineNodes.some(node => zoneForNode(node) === zone);
    const label = (kind: keyof typeof FIELD_RULES) => `${zone.toUpperCase()} · ${FIELD_RULES[kind].name}`;
    const kinds = new Set(s.zoneEffects.filter(field => field.zone === zone).map(field => field.kind));
    if (kinds.has("corrosion") && hardwareBands.has(zone)) chip.push({ label: label("corrosion"), amount: RULES.corrosionDamage });
    if (kinds.has("aegis") && online) pool.push({ label: label("aegis"), amount: RULES.aegisShield });
    if (kinds.has("stasis") && hardwareBands.has(zone)) pool.push({ label: label("stasis"), amount: RULES.nullFieldShield });
  }
  const worms = s.hand.filter(id => baseCard(id) === "worm").length;
  if (worms) chip.push({ label: `Worm in hand ×${worms}`, amount: worms * RULES.wormDamage });
  if (network.separated) pool.push({ label: "Separated circuits · north + south", amount: RULES.separatedCircuitShield });
  if (s.block > 0) pool.push({ label: "Block this turn", amount: s.block });
  if (!primary && has(s, "watchdog") && !s.watchdogUsed) {
    pool.push({ label: "Watchdog · no live route", amount: RULES.watchdogShield });
    s.watchdogUsed = true;
  }
  // v5 · shieldTerms daemons join the shared pool.
  if (s.daemons?.length) pool.push(...daemonShieldTerms(s, network));
  // v5 · cards left in the hand at the end of the turn (Backdoor, Bitrot): read now, resolved in
  // the table-front step (wear) and with the attacks (integrity, unblockable).
  const inHand = handHooks(s).filter(entry => entry.hooks.endOfTurn)
    .map(entry => ({ entry, effect: entry.hooks.endOfTurn!({ run: s, card: entry.card, count: entry.count, network }) as EndOfTurnEffect }));
  // v5 · misses (Spoof: the next N jams or cuts; Obfuscation: the first N each phase) and dodges
  // (Ghost Protocol: the first N strikes or breaches deal 0), in grant order then daemon order.
  const evasions: EvasionRecord[] = [];
  const grants = (count: number | undefined, sources: string[] | undefined, fallback: string) =>
    Array.from({ length: Math.max(0, count ?? 0) }, (_, i) => sources?.[i] ?? fallback);
  const misses = [...grants(s.turnEffects?.misses, s.turnEffects?.missSources, "Miss"),
    ...daemonAmounts(s, "missDisruptions").flatMap(term => Array(Math.max(0, term.amount)).fill(term.label) as string[])];
  const dodges = [...grants(s.turnEffects?.dodges, s.turnEffects?.dodgeSources, "Dodge"),
    ...daemonAmounts(s, "dodges").flatMap(term => Array(Math.max(0, term.amount)).fill(term.label) as string[])];
  const missTake = (): string | null => misses.shift() ?? null;
  const linksAtStart = s.topology.links.length;
  const firewallsAtStart = network.onlineNodes.filter(node => node.role === "firewall");

  // ================================================================ step 2: transmit (or buffer)
  const tx = transmit(s, network, focus);
  if (tx.buffering) {
    s.buffer += tx.bufferGain;
    s.backpressure = 0;
  } else if (primary) {
    for (const enemy of living) damageEnemy(s, enemy, tx.taken.get(enemy.port) ?? 0);
    s.buffer = 0;
    s.backpressure = 0;
  }

  // ================================================================ step 3: lethal per hostile (Spiteful excepted)
  for (const plan of plans) {
    if (plan.enemy.hp <= 0) plan.state = spiteful(plan) ? "spiteful" : "cancelled";
    else if (plan.state === "acts" && tx.ports[plan.enemy.port]?.breaks) plan.interrupted = true;
  }
  const lethal = hadEnemies && livingEnemies(s).length === 0;
  const spite = () => plans.some(plan => plan.state === "spiteful");
  const table: TableLog = { wear: [], breakdowns: [] };
  const destroyed: DestroyRecord[] = [];
  const quarantine: QuarantineRecord[] = [];
  const protocolTriggers: ProtocolTrigger[] = [];
  const installationEffects: InstallationEffect[] = [];
  const reclaim = { amount: s.reclaim ?? 0 };
  const honeynet: CombatTerm[] = [];
  const events: Resolution["events"] = { arrived: [], signalAnnounced: null, signalFired: null, shed: [], escalated: [] };
  const handEffects: HandEffectRecord[] = inHand.map(({ entry, effect }) => ({
    id: entry.id, name: entry.card.name, count: entry.count, integrity: effect.integrity ?? 0, wear: (effect.wear ?? []).map(item => item.nodeId),
  }));
  const records = (attack?: AttackResult, stormHits = 0): Records => ({
    chip, pool, honeynet, reclaim: reclaim.amount, table, destroyed, quarantine, protocolTriggers, installationEffects, stormHits, lethal,
    hpAtStart, linksAtStart, firewallsAtStart, signalAtStart, evasions, handEffects, ...(attack ? { attack } : {}),
  });
  const finish = (ended: Resolution["ended"]) => buildResolution(s, network, tx, plans, focus, ended, records(), events);
  if (lethal && !spite()) return finish("transmission");
  if (!hadEnemies) return finish(null);

  planTargets(s, network, plans);

  // ================================================================ step 4: traps, protocols, quarantine
  const honeypotBite = RULES.honeypotDamage + (has(s, "honeynet") ? RULES.honeynetBonus : 0);
  for (const plan of plans) {
    if (!resolving(plan)) continue;
    const decoys = [...plan.jams, ...plan.cuts, ...(plan.overload ? [plan.overload] : [])].filter(unit => unit.state === "decoyed").length;
    plan.trapDamage += decoys * honeypotBite;
    if (decoys && has(s, "honeynet"))
      for (let i = 0; i < decoys; i++) honeynet.push({ label: "Honeynet · decoy triggered", amount: RULES.honeynetShield });
  }
  // Protocols fire once per phase, each on the first matching action in port order, in arming
  // order (rule 20). v5: the effect is data (CardDefinition.protocol / cancels / values), so a new
  // protocol needs no code. Port Security also answers a Jammer later in the phase.
  const fired = new Set<string>();
  for (const id of [...s.protocols]) {
    const protocol = card(id), trigger = protocol.protocol!;
    if (fired.has(trigger)) continue;
    const target = plans.filter(resolving).find(PROTOCOL_MATCH[trigger]);
    if (!target) continue;
    const effect = answerProtocol(protocol, trigger, target);
    fired.add(trigger);
    s.protocols.splice(s.protocols.indexOf(id), 1);
    const retaliation = protocolRetaliation(s, id, trigger);
    target.trapDamage += sumTerms(retaliation);
    protocolTriggers.push({
      card: id, name: protocol.name, target: target.enemy.uid,
      effect: `${effect}${retaliation.map(term => ` ${term.label}: it takes ${term.amount}.`).join("")}`,
      ...(retaliation.length ? { retaliation } : {}),
    });
  }
  // Firewall quarantine (rule 36): each online firewall deals 1 (Sentry 2) to the nearest
  // installation within reach, whatever its route delivers.
  for (const firewall of firewallsAtStart) {
    const target = s.installations.filter(item => within(firewall, item))
      .sort((a, b) => Math.hypot(a.x - firewall.x, a.z - firewall.z) - Math.hypot(b.x - firewall.x, b.z - firewall.z) || s.installations.indexOf(a) - s.installations.indexOf(b))[0];
    if (!target) continue;
    const damage = firewall.sentry ? RULES.sentryQuarantine : RULES.quarantineDamage;
    target.integrity -= damage;
    const destroys = target.integrity <= 0;
    quarantine.push({ firewallId: firewall.id, installationId: target.id, damage, destroys });
    if (destroys) reclaim.amount += destroyInstallation(s, target, `quarantine · ${firewall.id.toUpperCase()}`, firewall.sentry ? RULES.sentryReclaimBonus : 0, destroyed);
  }
  for (const plan of plans) if (plan.trapDamage) damageEnemy(s, plan.enemy, plan.trapDamage);
  for (const plan of plans) if (plan.enemy.hp <= 0 && plan.state === "acts") plan.state = spiteful(plan) ? "spiteful" : "cancelled";
  if (!livingEnemies(s).length && !spite()) return finish("traps");

  // Every hostile that takes its turn gets a global action index (installations activate by it).
  let actions = s.hostileActions;
  for (const plan of plans) {
    if (plan.state === "spiteful") plan.index = ++actions;
    if (plan.state !== "acts" || plan.enemy.hp <= 0) continue;
    plan.acted = true;
    plan.index = ++actions;
  }
  // Phantom Nodes absorb the first remaining disruptions or installations in port order.
  const phantomTake = (): string | null => {
    const phantom = s.topology.nodes.find(node => node.role === "phantom" && (node.absorbs ?? 0) > 0);
    if (!phantom) return null;
    phantom.absorbs = (phantom.absorbs ?? 1) - 1;
    if (phantom.absorbs <= 0) s.topology.nodes.splice(s.topology.nodes.indexOf(phantom), 1);
    return phantom.id;
  };
  for (const plan of plans) {
    if (!resolving(plan)) continue;
    for (const unit of plan.units) unit.absorbed = phantomTake() ?? undefined;
    for (const unit of [...plan.jams, ...plan.cuts, ...(plan.overload ? [plan.overload] : [])]) {
      if (unit.state !== "lands") continue;
      // v5: a miss takes the next jam or cut before any phantom does (never an overload or an install).
      const miss = unit !== plan.overload ? missTake() : null;
      if (miss) {
        Object.assign(unit, { state: "missed", by: miss });
        evasions.push({ kind: "miss", source: miss, by: plan.enemy.uid, target: unit.target });
        continue;
      }
      const by = phantomTake();
      if (by) Object.assign(unit, { state: "absorbed", by });
    }
    // Rigged: each of its cuts that lands also leaves a Spike beside the cut cable's nearer device.
    if (plan.enemy.designations?.includes("rigged"))
      for (const cut of plan.cuts) {
        if (cut.state !== "lands" && cut.state !== "decoyed") continue;
        const beside = nearerDevice(s, cut.target);
        plan.units.push({ kind: "spike", source: "rigged", ...(beside ? { beside: beside.id } : {}), absorbed: phantomTake() ?? undefined });
      }
  }

  // ================================================================ step 5: installs and heals
  const planted: Installation[] = [];
  for (const plan of plans) {
    if (resolving(plan)) for (const unit of plan.units) {
      if (unit.absorbed) { plan.installs.push({ kind: unit.kind, x: 0, z: 0, bitten: false, destroyed: false, absorbed: unit.absorbed, source: unit.source }); continue; }
      const forecast = plant(s, network, plan, plans, unit, reclaim, destroyed);
      if (!forecast) continue;
      plan.installs.push(forecast);
      const item = forecast.id && s.installations.find(entry => entry.id === forecast.id);
      if (item) planted.push(item);
    }
    if (plan.enemy.hp <= 0 || plan.state === "cancelled") continue;
    const acting = resolving(plan);
    const taps = s.installations.filter(item => item.kind === "tap").length;
    const unhurt = (tx.taken.get(plan.enemy.port) ?? 0) === 0;
    let heal = 0;
    if (acting && plan.enemy.id === "leech") heal += taps * RULES.leechTapHeal + (unhurt ? RULES.leechHeal : 0);
    if (acting && plan.enemy.id === "tap-spinner") heal += taps * RULES.webHeal;
    if (acting && plan.enemy.id === "nest") heal += s.installations.length * RULES.nestHeal;
    // Hungry: heals 2 after any transmission that dealt it nothing (a buffered one included).
    if (unhurt && plan.enemy.designations?.includes("hungry")) heal += RULES.hungryHeal;
    plan.heal = Math.max(0, Math.min(heal, plan.enemy.maxHp - plan.enemy.hp));
    plan.enemy.hp += plan.heal;
  }

  // ================================================================ step 6: faults, fields, wear, installations
  // Old faults clear once; a level-1 jam in its second turn stays (section 6.4).
  const exists = (id: string) => s.topology.nodes.some(node => node.id === id);
  const linger = s.lingeringJams ?? {};
  const kept = s.faultNodes.filter(id => (linger[id] ?? 0) > 0 && exists(id));
  s.lingeringJams = Object.fromEntries(kept.map(id => [id, linger[id] - 1] as const).filter(([, left]) => left > 0));
  s.faultNodes = kept;
  s.faultLinks = [];
  s.frayedByCut = [];
  const anchored = anchoredBands(s, actions);
  s.zoneEffects = s.zoneEffects
    .map(field => field.permanent || (FIELD_RULES[field.kind].hostile && anchored.has(field.zone)) ? field : { ...field, turns: field.turns - 1 })
    .filter(field => field.turns > 0);
  let stormHits = 0;
  const linkExists = (key: string) => s.topology.links.some(link => linkKey(link.a, link.b) === key);
  for (const plan of plans) {
    if (!resolving(plan)) continue;
    const name = plan.enemy.name;
    if (plan.field && !plan.fieldCancelled) installField(s, plan.field);
    for (const unit of plan.jams) {
      if ((unit.state === "lands" || unit.state === "decoyed") && exists(unit.target)) {
        if (!s.faultNodes.includes(unit.target)) s.faultNodes.push(unit.target);
        if (unit.lingers) s.lingeringJams[unit.target] = 1;
        if (unit.state === "lands") stormHits++;
      }
    }
    for (const unit of plan.cuts) {
      if ((unit.state === "lands" || unit.state === "decoyed") && linkExists(unit.target) && !s.faultLinks.includes(unit.target)) {
        s.faultLinks.push(unit.target);
        if (unit.state === "lands") stormHits++;
        if (unit.fray && linkExists(unit.fray) && !s.frayedByCut.includes(unit.fray)) s.frayedByCut.push(unit.fray);
      }
    }
    const overload = plan.overload;
    if (overload && (overload.state === "lands" || overload.state === "decoyed")) {
      const node = s.topology.nodes.find(item => item.id === overload.target);
      if (node) wearDevice(s, node, `${name} · ${plan.intent.label.replace(/^(ENRAGED|WOUNDED) · /, "")}`, table);
    }
    // Ascension 6: the Regent's CLOSE THE GATES and the Choir's STOLEN VOICE also wear their target.
    if (ascends(s.ascension, "ancientGuardians") && RULES.ascensionRiderWear > 0 && ((plan.enemy.id === "regent" && plan.intent.kind === "sever") || (plan.enemy.id === "cantor" && plan.intent.kind === "jam")))
      for (const unit of [...plan.jams, ...plan.cuts]) {
        if (unit.state !== "lands" && unit.state !== "decoyed") continue;
        const device = plan.intent.kind === "jam" ? s.topology.nodes.find(node => node.id === unit.target) : nearerDevice(s, unit.target);
        if (device && wearable(device)) wearDevice(s, device, `${name} · ${plan.intent.label.replace(/^(ENRAGED|WOUNDED) · /, "")}`, table, RULES.ascensionRiderWear);
      }
    // Blackout Core, enraged: Total Blackout wears every primary-route device, before the right
    // add acts (rules 42, 56).
    if (plan.enemy.id === "core" && plan.intent.ultimate && plan.enraged)
      for (const id of signalPath) {
        const node = s.topology.nodes.find(item => item.id === id);
        if (node && wearable(node)) wearDevice(s, node, `${name} · TOTAL BLACKOUT`, table, RULES.blackoutWear);
      }
  }
  // Installations act once per phase, in placement order (contract §1).
  const potsUsed = new Set<string>();
  for (const item of [...s.installations]) {
    if (!s.installations.includes(item)) continue;
    const active = item.activeFrom <= actions;
    if (item.kind === "tap") { installationEffects.push({ id: item.id, kind: item.kind, effect: "siphon", target: null }); continue; }
    if (item.kind === "anchor") { installationEffects.push({ id: item.id, kind: item.kind, effect: "anchor", target: zoneForNode(item) }); continue; }
    if (!active) {
      installationEffects.push({ id: item.id, kind: item.kind, effect: "idle", target: null, ...(item.kind === "breaker" ? { countdown: item.countdown } : {}) });
      continue;
    }
    if (item.kind === "jammer") {
      const pot = cabledHoneypots(s).find(node => !node.shielded && !potsUsed.has(node.id));
      if (pot) {
        // A cabled honeypot decoys it like any jam and bites the Jammer (rule 46).
        potsUsed.add(pot.id);
        if (!s.faultNodes.includes(pot.id)) s.faultNodes.push(pot.id);
        if (has(s, "honeynet")) honeynet.push({ label: "Honeynet · decoy triggered", amount: RULES.honeynetShield });
        item.integrity -= honeypotBite;
        const gone = item.integrity <= 0;
        installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: pot.id, decoyed: true, ...(gone ? { destroyed: true } : {}) });
        if (gone) reclaim.amount += destroyInstallation(s, item, "honeypot", 0, destroyed);
        continue;
      }
      const path = signalPath;
      const target = s.topology.nodes.filter(node => !node.fixed && !node.shielded && node.role !== "rack" && node.role !== "phantom" && within(item, node))
        .sort((a, b) => Math.hypot(a.x - item.x, a.z - item.z) - Math.hypot(b.x - item.x, b.z - item.z)
          || Number(!path.includes(a.id)) - Number(!path.includes(b.id)) || s.topology.nodes.indexOf(a) - s.topology.nodes.indexOf(b))[0];
      if (!target) { installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: null }); continue; }
      // An unfired protocol that cancels jams (Port Security) answers a Jammer later in the phase.
      const security = !fired.has("jam") ? s.protocols.find(id => card(id).protocol === "jam" && card(id).cancels) : undefined;
      if (security) {
        const damage = card(security).values.damage ?? 0;
        fired.add("jam");
        s.protocols.splice(s.protocols.indexOf(security), 1);
        const retaliation = protocolRetaliation(s, security, "jam");
        const total = damage + sumTerms(retaliation);
        protocolTriggers.push({
          card: security, name: card(security).name, target: item.id,
          effect: `Cancels the Jammer's jam${damage ? `; the Jammer takes ${damage}` : ""}.${retaliation.map(term => ` ${term.label}: it takes ${term.amount}.`).join("")}`,
          ...(retaliation.length ? { retaliation } : {}),
        });
        item.integrity -= total;
        const gone = item.integrity <= 0;
        installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: target.id, cancelled: true, ...(gone ? { destroyed: true } : {}) });
        if (gone) reclaim.amount += destroyInstallation(s, item, card(security).name, 0, destroyed);
        continue;
      }
      const miss = missTake();
      if (miss) {
        evasions.push({ kind: "miss", source: miss, by: item.id, target: target.id });
        installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: target.id, missed: miss });
        continue;
      }
      const phantom = phantomTake();
      if (phantom) { installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: phantom, absorbed: true }); continue; }
      if (!s.faultNodes.includes(target.id)) s.faultNodes.push(target.id);
      stormHits++;
      installationEffects.push({ id: item.id, kind: item.kind, effect: "jam", target: target.id });
    } else if (item.kind === "spike") {
      // The nearest device within reach (Honeypot included, no bite; ties: primary route, then earliest).
      const target = s.topology.nodes.filter(node => wearable(node) && within(item, node))
        .sort((a, b) => Math.hypot(a.x - item.x, a.z - item.z) - Math.hypot(b.x - item.x, b.z - item.z)
          || Number(!signalPath.includes(a.id)) - Number(!signalPath.includes(b.id)) || s.topology.nodes.indexOf(a) - s.topology.nodes.indexOf(b))[0];
      installationEffects.push({ id: item.id, kind: item.kind, effect: target ? "wear" : "idle", target: target?.id ?? null });
      if (target) wearDevice(s, target, INSTALLATION_NAMES.spike, table);
    } else if (item.kind === "breaker") {
      item.countdown = (item.countdown ?? RULES.breakerCountdown) - 1;
      if (item.countdown > 0) { installationEffects.push({ id: item.id, kind: item.kind, effect: "tick", target: null, countdown: item.countdown }); continue; }
      installationEffects.push({ id: item.id, kind: item.kind, effect: "detonate", target: null, countdown: 0 });
      detonate(s, item, table);
    }
  }

  // v5 · cards left in the hand wear devices in the table-front step (Bitrot), after the installations.
  for (const { entry, effect } of inHand)
    for (const request of effect.wear ?? []) {
      const node = s.topology.nodes.find(item => item.id === request.nodeId);
      if (!node || !wearable(node) || request.points <= 0) continue;
      if (!request.direct) { wearDevice(s, node, entry.card.name, table, request.points); continue; }
      const from = conditionOf(node), to = Math.max(0, from - request.points);
      node.condition = to;
      table.wear.push({ nodeId: node.id, from, to, breaks: to <= 0, source: entry.card.name });
      if (to <= 0) breakDevice(s, node, table);
    }

  // ================================================================ step 7: junk (positions are RNG: endTurn)
  const junk: Resolution["junk"] = [];
  for (const plan of plans) if (resolving(plan) && plan.intent.junk) {
    plan.junk = plan.intent.junk;
    junk.push({ ...plan.intent.junk, owner: plan.enemy.uid });
  }

  // ================================================================ step 8: attacks against one shared pool
  const unblockable = inHand.filter(({ effect }) => (effect.integrity ?? 0) > 0)
    .map(({ entry, effect }) => ({ label: `${entry.card.name}${entry.count > 1 ? ` ×${entry.count}` : ""} · in hand`, amount: effect.integrity! }));
  const attack = attackPhase(s, network, plans, { chip, pool, honeynet, reclaim: reclaim.amount, stormHits, linksAtStart, firewallsAtStart, dodges, unblockable, evasions });
  s.integrity = Math.max(0, s.integrity - attack.incoming);
  if (attack.backpressureGain) s.backpressure += attack.backpressureGain;

  // ================================================================ step 9: exposed; counters; escalation
  for (const enemy of s.enemies) {
    const plan = plans.find(item => item.enemy === enemy);
    if (plan?.interrupted) enemy.exposed = true;
    else delete enemy.exposed;
  }
  for (const plan of plans) {
    if (plan.state === "skipped") delete plan.enemy.skipNext;
    if (!plan.acted) continue;
    advanceSteps(s, plan.enemy, !!plan.intent.early);
    plan.enemy.turn++;
    const level = intentFor(s, plan.enemy, 0).escalation ?? 0;
    if (scales(plan.enemy) && level > (plan.intent.escalation ?? 0)) events.escalated.push({ uid: plan.enemy.uid, level });
  }
  s.enemyPhase++;
  s.hostileActions = actions;
  s.attackers = plans.filter(plan => resolving(plan) && (plan.intent.kind === "strike" || plan.intent.kind === "breach")).map(plan => plan.enemy.uid);
  events.shed = s.enemies.filter(enemy => enemy.shed && !shedAtStart.has(enemy.uid)).map(enemy => enemy.uid);
  // A Spiteful hostile took the last body with it: the fight ends after its action.
  if (!livingEnemies(s).length) {
    const over = buildResolution(s, network, tx, plans, focus, "phase", records(attack, stormHits), events);
    over.junk = junk;
    over.planted = planted;
    return over;
  }

  // ================================================================ step 10: arrivals, signals, next turn
  const coming = reinforce(s);
  if (coming) events.arrived.push(coming);
  events.arrived.push(...raiseAdds(s));
  if (s.signal && !s.signal.resolved) {
    const upcoming = s.turn + 1;
    if (s.signal.announced && upcoming >= s.signal.firesOnTurn) events.signalFired = fireSignal(s, table);
    else if (!s.signal.announced && upcoming >= s.signal.firesOnTurn - 1)
      events.signalAnnounced = announceSignal(s, analyze(s, s.faultNodes, s.faultLinks, true).primary?.path ?? []);
  }

  const result = buildResolution(s, network, tx, plans, focus, null, records(attack, stormHits), events);
  result.junk = junk;
  result.planted = planted;
  return result;
}

/** Breaker detonation (section 5.2): every device within reach breaks regardless of condition
 * (a rack's ring shelters: the rack takes 1 wear instead), and the charge's socket becomes wreckage. */
function detonate(run: RunState, charge: Installation, table: TableLog) {
  run.installations.splice(run.installations.indexOf(charge), 1);
  const blast = run.topology.nodes.filter(node => wearable(node) && within(charge, node));
  for (const rack of blast.filter(node => node.role === "rack")) {
    table.wear.push({ nodeId: rack.id, from: conditionOf(rack), to: 0, breaks: true, source: INSTALLATION_NAMES.breaker });
    breakDevice(run, rack, table);
  }
  for (const node of blast.filter(item => item.role !== "rack")) {
    if (!run.topology.nodes.includes(node)) continue;
    if (shelterOf(run, node)) { wearDevice(run, node, INSTALLATION_NAMES.breaker, table); continue; }
    table.wear.push({ nodeId: node.id, from: conditionOf(node), to: 0, breaks: true, source: INSTALLATION_NAMES.breaker });
    breakDevice(run, node, table);
  }
  if (run.terrain) addWreck(run.terrain, { x: charge.x, z: charge.z, fresh: true });
}

// ------------------------------------------------------------------ step 8: attacks

interface AttackContext {
  chip: CombatTerm[];
  pool: CombatTerm[];
  honeynet: CombatTerm[];
  reclaim: number;
  stormHits: number;
  linksAtStart: number;
  firewallsAtStart: NetworkNode[];
  /** v5: dodge sources left this phase (consumed in port order), unblockable integrity terms
   * (curses in hand), and the evasion record the dodges join. */
  dodges: string[];
  unblockable: CombatTerm[];
  evasions: EvasionRecord[];
}
interface AttackResult {
  incoming: number;
  raw: number;
  incomingTerms: CombatTerm[];
  shieldTerms: CombatTerm[];
  shield: number;
  backpressureGain: number;
  /** v5: block a blockCarry daemon keeps for the next turn (what the attacks left of it). */
  blockCarried: { amount: number; by: string } | null;
}

/** The raw terms of one hostile's action (v3 labels for the single hostile). */
function actionTerms(run: RunState, network: Network, plan: Plan, linksAtStart: number): CombatTerm[] {
  const { enemy, intent } = plan;
  const terms: CombatTerm[] = intent.amount ? [{ label: intent.label, amount: intent.amount }] : [];
  if (plan.interrupted) {
    if (intent.amount) terms.push({ label: "Ultimate interrupted", amount: -intent.amount });
    return terms;
  }
  const strike = intent.kind === "strike", attack = strike || intent.kind === "breach";
  if (strike && enemy.id === "serpent" && network.channelCount <= 1) terms.push({ label: "Coil pressure · only one channel", amount: RULES.serpentBonus });
  if (strike && enemy.id === "weaver" && linksAtStart >= RULES.weaverCables) terms.push({ label: `Tension trap · ${RULES.weaverCables} or more cables`, amount: RULES.weaverBonus });
  if (strike && enemy.id === "spark-mite") {
    const others = run.enemies.filter(other => other !== enemy && other.hp > 0).length;
    if (others) terms.push({ label: `Swarm · ${others} other hostile${others === 1 ? "" : "s"}`, amount: others * RULES.swarmBonus });
  }
  if (strike && livingLeader(run) === enemy) {
    const drones = run.enemies.filter(other => other !== enemy && other.id === "relay-drone" && other.hp > 0).length;
    if (drones) terms.push({ label: `Relay Drone uplink${drones > 1 ? ` ×${drones}` : ""}`, amount: drones * RULES.uplinkBonus });
  }
  if (strike && enemy.id === "nest" && run.installations.length) terms.push({ label: `Brood · ${run.installations.length} installation${run.installations.length === 1 ? "" : "s"}`, amount: run.installations.length * RULES.nestStrikeBonus });
  if (strike && enemy.id === "foreman" && run.installations.some(item => item.kind === "spike")) terms.push({ label: "Foreman's mark · a Spike stands", amount: RULES.foremanSpikeBonus });
  if (strike && enemy.id === "demolition" && run.installations.some(item => item.kind === "breaker")) terms.push({ label: "Charge armed", amount: RULES.demolitionArmedBonus });
  if (intent.kind === "breach" && enemy.id === "blight" && run.installations.some(item => item.kind === "anchor")) {
    const corroded = new Set(run.zoneEffects.filter(field => field.kind === "corrosion").map(field => field.zone)).size;
    if (corroded) terms.push({ label: `Root rot · ${corroded} corroded band${corroded === 1 ? "" : "s"}`, amount: corroded * RULES.blightAnchorBonus });
  }
  if (attack && enemy.echo) {
    terms.push({ label: "Last echo", amount: enemy.echo });
    delete enemy.echo;
  }
  if (attack && has(run, "bgp-hijack")) terms.push({ label: "BGP Hijack · enemy retaliation", amount: RULES.bgpHijackEnemyBonus });
  if (attack && has(run, "ingress-filter")) {
    const reduce = Math.min(RULES.ingressFilterReduce, Math.max(0, terms.reduce((sum, term) => sum + term.amount, 0)));
    if (reduce) terms.push({ label: "Ingress Filter", amount: -reduce });
  }
  // v5 · a protocol cancelled the attack (Null Route): it deals 0; its riders still resolve.
  if (attack && plan.nullified) {
    const total = Math.max(0, sumTerms(terms));
    if (total) terms.push({ label: `${plan.nullified} · ${intent.kind} cancelled`, amount: -total });
  }
  return terms;
}

function attackPhase(run: RunState, network: Network, plans: Plan[], context: AttackContext): AttackResult {
  const poolTerms = [...context.pool, ...context.honeynet, ...(context.reclaim ? [{ label: "Reclaim · installations destroyed", amount: context.reclaim }] : [])];
  let pool = sumTerms(poolTerms);
  const shieldTerms: CombatTerm[] = [...poolTerms];
  const incomingTerms: CombatTerm[] = [];
  const pack = plans.length > 1;
  const firewalls = context.firewallsAtStart.filter(node => run.topology.nodes.includes(node));
  let chipDone = false, incoming = 0, raw = 0, prevented = 0;
  const entries: { plan: Plan | null; terms: CombatTerm[]; perAttack: CombatTerm[]; unblockable?: boolean }[] = [];
  const phaseChip = [...context.chip];
  const exposure = plans.flatMap(plan => resolving(plan) ? plan.exposure : [])[0];
  if (exposure) phaseChip.push(exposure);
  const dodges = [...context.dodges];
  const firewallDaemons = firewalls.length ? daemonAmounts(run, "firewallBonus") : [];
  for (const plan of plans) {
    // A Spiteful hostile's attack lands even though it fell this turn (rule 59).
    if (!(plan.acted && plan.enemy.hp > 0) && plan.state !== "spiteful") continue;
    const action = actionTerms(run, network, plan, context.linksAtStart);
    const attack = !plan.interrupted && (plan.intent.kind === "strike" || plan.intent.kind === "breach");
    // v5 · a dodge (Ghost Protocol) zeroes the first strikes or breaches in port order.
    if (attack && !plan.nullified && sumTerms(action) > 0 && dodges.length) {
      const source = dodges.shift()!;
      plan.dodged = source;
      context.evasions.push({ kind: "dodge", source, by: plan.enemy.uid, target: null });
      action.push({ label: `${source} · ${plan.intent.kind} dodged`, amount: -sumTerms(action) });
    }
    const terms = [...action, ...plan.chip];
    if (!chipDone) { terms.push(...phaseChip); chipDone = true; }
    const perAttack: CombatTerm[] = [...plan.protocolShield];
    if (attack && firewalls.length) {
      const per = plan.intent.kind === "breach" ? RULES.firewallBreachBlock : RULES.firewallStrikeBlock;
      const bonus = run.turnEffects?.firewallBonus ?? 0;
      const amount = firewalls.reduce((sum, node) => sum + per * (node.stateful ? 2 : 1) * (has(run, "zero-trust") ? 2 : 1) + bonus, 0);
      if (amount) perAttack.push({ label: `Online firewalls ×${firewalls.length} vs ${plan.intent.kind}`, amount });
      // v5 · firewallBonus daemons (Defense in Depth): every online firewall blocks more.
      for (const term of firewallDaemons) perAttack.push({ label: `${term.label} · firewalls ×${firewalls.length}`, amount: term.amount * firewalls.length });
    }
    entries.push({ plan, terms, perAttack });
  }
  if (!chipDone && phaseChip.length) entries.push({ plan: null, terms: phaseChip, perAttack: [] });
  if (context.stormHits && has(run, "storm-control"))
    entries.push({ plan: null, terms: [{ label: `Storm Control · ${context.stormHits} jam${context.stormHits === 1 ? "" : "s"} or cut${context.stormHits === 1 ? "" : "s"} landed`, amount: context.stormHits * RULES.stormControlDamage }], perAttack: [] });
  // v5 · curses in hand (Backdoor): unblockable, after every attack.
  for (const term of context.unblockable) entries.push({ plan: null, terms: [term], perAttack: [], unblockable: true });
  for (const entry of entries) {
    const label = (term: CombatTerm) => pack && entry.plan ? { ...term, label: `${hostileLabel(entry.plan.enemy)} · ${term.label}` } : term;
    const own = Math.max(0, sumTerms(entry.terms));
    const guard = sumTerms(entry.perAttack);
    let through = Math.max(0, own - guard);
    const take = entry.unblockable ? 0 : Math.min(through, pool);
    pool -= take;
    through -= take;
    if (through > 0 && !entry.unblockable && has(run, "shield-array") && !run.shieldArrayUsed) {
      const stop = Math.min(RULES.shieldArrayPrevent, through);
      through -= stop;
      run.shieldArrayUsed = true;
      shieldTerms.push({ label: "Shield Array (once per battle)", amount: stop });
    }
    incoming += through;
    raw += own;
    prevented += own - through;
    incomingTerms.push(...entry.terms.map(label));
    shieldTerms.push(...entry.perAttack.map(label));
    if (entry.plan) {
      entry.plan.terms = entry.terms;
      entry.plan.shieldTerms = entry.perAttack;
      entry.plan.raw = own;
      entry.plan.through = through;
    }
  }
  const backpressureGain = has(run, "backpressure") ? Math.ceil(prevented * backpressureRatio(run).value) : 0;
  // v5 · blockCarry (Persistent State): the pool's other terms expire first, so the block that
  // survives is what is left of the pool, up to the block itself.
  const carrier = run.block > 0 ? daemonFlag(run, "blockCarry") : null;
  const blockCarried = carrier ? { amount: Math.max(0, Math.min(run.block, pool)), by: carrier } : null;
  return { incoming, raw, incomingTerms, shieldTerms, shield: sumTerms(shieldTerms), backpressureGain, blockCarried };
}

// ------------------------------------------------------------------ the forecast record

interface Records {
  chip: CombatTerm[];
  pool: CombatTerm[];
  honeynet: CombatTerm[];
  reclaim: number;
  table: TableLog;
  destroyed: DestroyRecord[];
  quarantine: QuarantineRecord[];
  protocolTriggers: ProtocolTrigger[];
  installationEffects: InstallationEffect[];
  stormHits: number;
  lethal: boolean;
  hpAtStart: Map<string, number>;
  linksAtStart: number;
  firewallsAtStart: NetworkNode[];
  signalAtStart: CombatPreview["signal"];
  evasions: EvasionRecord[];
  handEffects: HandEffectRecord[];
  attack?: AttackResult;
}

function buildResolution(s: RunState, network: Network, tx: Transmission, plans: Plan[], focus: Port | null, ended: Resolution["ended"], records: Records, events: Resolution["events"]): Resolution {
  // `cut`: the enemy phase never happened (the transmission or traps ended the fight).
  const cut = ended === "transmission" || ended === "traps";
  const over = ended !== null;
  const attack = records.attack;
  // Next turn: on the post-phase board (new faults, breakdowns, arrivals, a fired signal).
  const after = over ? network : analyze(s, s.faultNodes, s.faultLinks, true);
  const nextTurn = {
    energy: turnEnergyBase(s) + s.reserveEnergy + (has(s, "reserve-cell") ? Math.min(2, s.energy) : 0) + after.onlineNodes.filter(node => node.role === "power").length,
    draw: turnDrawBase(s) + after.onlineNodes.filter(node => node.role === "cache").length + (has(s, "fanout") && after.channelCount >= 3 ? 1 : 0) + (s.nextTurn?.draw ?? 0),
    // Block: Grounded Core, what a blockCarry daemon keeps, next-turn gains (Brace).
    block: (has(s, "grounded-core") ? 1 : 0) + (attack?.blockCarried?.amount ?? 0) + (s.nextTurn?.block ?? 0),
  };
  const leader = leaderOf(s);
  const leaderPlan = plans.find(plan => plan.enemy === leader) ?? plans.find(plan => plan.enemy.port === "centre") ?? plans[0] ?? null;
  const landing = (units: Unit[]) => units.filter(unit => unit.state === "lands" || unit.state === "decoyed").map(unit => unit.target);
  const scorchedOn = (uid: string) => records.destroyed.filter(record => record.scorched === uid).length * RULES.scorchedEarthDamage;
  const firstFault = (plan: Plan) => landing(plan.jams)[0] ?? landing(plan.cuts)[0] ?? null;
  const faultTarget = cut ? null : plans.filter(resolving).map(firstFault).find(target => target) ?? null;
  const hostiles: HostileForecast[] = plans.map(plan => {
    const disruptions = [...plan.jams, ...plan.cuts, ...(plan.overload ? [plan.overload] : [])];
    const jams = landing(plan.jams), cuts = landing(plan.cuts);
    const overload = plan.overload && (plan.overload.state === "lands" || plan.overload.state === "decoyed") ? plan.overload.target : null;
    const shown = cut || !resolving(plan);
    const installs = shown ? [] : plan.installs;
    return {
      uid: plan.enemy.uid, id: plan.enemy.id, port: plan.enemy.port, role: plan.enemy.role,
      intent: {
        ...plan.intent,
        ...(!shown && (jams[0] ?? cuts[0]) ? { target: jams[0] ?? cuts[0] } : {}),
        ...(!shown && jams.length ? { targets: jams } : {}),
        ...(!shown && cuts.length ? { cutTargets: cuts } : {}),
        ...(!shown && overload ? { overloadTarget: overload } : {}),
        ...(!shown && plan.cuts.some(unit => unit.fray) ? { fray: plan.cuts.find(unit => unit.fray)!.fray } : {}),
      },
      state: plan.state === "acts" && (plan.interrupted || cut || plan.enemy.hp <= 0) ? "cancelled" : plan.state,
      ...(plan.state === "spiteful" ? { note: "resolves anyway" } : {}),
      ...(plan.upcoming ? { upcoming: plan.upcoming } : {}),
      designations: [...(plan.enemy.designations ?? [])],
      interrupted: plan.interrupted,
      raw: plan.raw, incoming: plan.through, terms: plan.terms, shieldTerms: plan.shieldTerms,
      heal: plan.heal, trapDamage: plan.trapDamage, scorched: scorchedOn(plan.enemy.uid),
      escalation: plan.intent.escalation ?? 0, nextLevel: plan.nextLevel,
      install: installs[0] ?? null, installs,
      field: shown || plan.fieldCancelled ? null : plan.field, junk: shown ? null : plan.junk,
      fieldReplaced: !shown && !!plan.field && !plan.fieldCancelled && plans.slice(plans.indexOf(plan) + 1)
        .some(later => resolving(later) && later.field && !later.fieldCancelled && later.field.zone === plan.field!.zone),
      jams: shown ? [] : jams, cuts: shown ? [] : cuts, overload: shown ? null : overload,
      frays: shown ? [] : plan.cuts.filter(unit => unit.fray && unit.state === "lands").map(unit => unit.fray!),
      decoyed: disruptions.filter(unit => unit.state === "decoyed").length,
      absorbed: disruptions.filter(unit => unit.state === "absorbed").length + plan.installs.filter(item => item.absorbed).length,
      cancelled: disruptions.filter(unit => unit.state === "cancelled").length,
      missed: disruptions.filter(unit => unit.state === "missed").length,
      dodged: plan.dodged,
      nullified: plan.nullified,
    };
  });
  const leaderForecast = leaderPlan ? hostiles[plans.indexOf(leaderPlan)] : null;
  const enemyDamage = records.lethal && !plans.some(plan => plan.state === "spiteful") ? 0 : plans.reduce((sum, plan) => sum + plan.trapDamage + scorchedOn(plan.enemy.uid), 0);
  const installTargets = cut ? [] : plans.flatMap(plan => plan.installs.filter(item => !item.absorbed).map(item => ({ ...item, owner: plan.enemy.uid })));
  const firstSocket = installTargets.find(item => !item.boosts);
  const shieldTerms = attack?.shieldTerms ?? [...records.pool, ...records.honeynet, ...(records.reclaim ? [{ label: "Reclaim · installations destroyed", amount: records.reclaim }] : [])];
  const definition = leader ? definitionOf(leader) : null;
  // Announced arrival (rule 75): "arrives after this action" when inPhases is 1.
  const arrived = events.arrived.find(item => item.kind === "reinforcement");
  const pending = s.reinforcement && s.reinforcement.after >= 0 ? s.reinforcement : null;
  const arrivals: CombatPreview["arrivals"] = over ? null
    : arrived ? { kind: "reinforcement", enemyId: arrived.id, port: arrived.port, inPhases: 1, ...(arrived.shed ? { shed: true } : {}) }
      : pending ? { kind: "reinforcement", enemyId: pending.enemyId, port: emptySidePort(s), inPhases: pending.after + 1, ...(pending.shed ? { shed: true } : {}) }
        : null;
  const preview: CombatPreview = {
    signalPath: network.primary?.path ?? [],
    alternatePath: network.channels[1]?.path ?? [],
    packetDamage: tx.packetDamage,
    damageTerms: tx.terms,
    shield: sumTerms(shieldTerms),
    shieldTerms,
    incoming: cut ? 0 : attack?.incoming ?? 0,
    incomingRaw: cut ? 0 : attack?.raw ?? 0,
    intent: leaderForecast?.intent ?? null,
    lethal: records.lethal,
    fightEnds: over,
    independent: network.channelCount >= 2,
    faultTarget,
    hazardZone: cut || !leaderPlan || !resolving(leaderPlan) ? null
      : leaderPlan.fieldCancelled ? (leaderPlan.intent.kind === "jam" ? jamBand(leaderPlan.enemy) : null) : leaderPlan.hazard ?? (leaderPlan.intent.kind === "jam" ? jamBand(leaderPlan.enemy) : null),
    enemyHealing: cut ? 0 : plans.reduce((sum, plan) => sum + plan.heal, 0),
    rawPacketDamage: tx.rawPacketDamage,
    incomingTerms: cut ? [] : attack?.incomingTerms ?? [],
    traitDescription: definition?.trait ?? "",
    zoneThreat: cut ? null : leaderForecast?.field ?? null,
    interrupted: plans.some(plan => plan.interrupted),
    breakDamage: leaderPlan ? tx.ports[leaderPlan.enemy.port]?.breakThreshold ?? definition?.boss?.breakDamage ?? null : null,
    channels: network.channelCount,
    channelPaths: network.channels.map(route => route.path),
    routeCount: network.routes.length,
    sharedDevices: network.shared.map(item => ({ ...item })),
    online: [...network.online],
    clusters: network.clusters,
    protocolTriggers: ended === "transmission" ? [] : records.protocolTriggers,
    buffering: tx.buffering,
    bufferGain: tx.bufferGain,
    bufferRelease: tx.bufferRelease,
    bufferAtRisk: !over && s.buffer > 0 && !after.primary,
    backpressureGain: cut ? 0 : attack?.backpressureGain ?? 0,
    enemyDamage,
    enemyDefeatedByTraps: ended === "traps",
    malwareTarget: firstSocket ? { x: firstSocket.x, z: firstSocket.z } : null,
    junk: cut ? null : hostiles.find(item => item.junk)?.junk ?? null,
    nextTurn,
    deliveries: tx.deliveries,
    ports: tx.ports,
    hostiles,
    installationEffects: cut ? [] : records.installationEffects,
    quarantine: ended === "transmission" ? [] : records.quarantine,
    wear: records.table.wear,
    breakdowns: records.table.breakdowns,
    destroyed: records.destroyed,
    reclaim: records.reclaim,
    focus,
    arrivals,
    signal: records.signalAtStart,
    risingAdds: events.arrived.filter(item => item.kind === "add").map(item => ({ enemyId: item.id, port: item.port })),
    faultTargets: cut ? [] : [...s.faultNodes, ...s.faultLinks],
    installTargets,
    evasions: cut ? [] : records.evasions,
    handEffects: cut ? [] : records.handEffects,
    blockCarried: cut ? null : attack?.blockCarried ?? null,
  };
  return {
    preview, ended,
    junk: [],
    deaths: s.enemies.filter(enemy => enemy.hp <= 0 && (records.hpAtStart.get(enemy.uid) ?? 0) > 0).map(enemy => enemy.uid),
    planted: [],
    events,
  };
}

/** Ids of every hostile disruption a forecast names, for the table overlay. */
export function forecastTargets(preview: CombatPreview): string[] {
  return preview.hostiles.flatMap(hostile => [...hostile.jams, ...hostile.cuts, ...(hostile.overload ? [hostile.overload] : [])]);
}
export type { WearRecord, BreakRecord, DestroyRecord };
