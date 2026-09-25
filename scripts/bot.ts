/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Shared deterministic QA player. It only makes decisions from visible cards,
 * board state and intent; its optional command stream drives browser playthroughs.
 * v3: builds width, arms protocols against visible intents, uses the archetype
 * console (Patch Cable / Harden / Buffer) and deletes worms.
 * v4 tactical line (every choice is read from combatPreview, never from hidden state):
 * - kill order: tries every target (every delivery lands there; overflow carries the rest)
 *   and keeps the one with the best outlook (damage, kills weighted by the hostile's threat,
 *   adds before the ultimate, an interrupt, minus incoming damage, disruption and installs);
 *   `killOrder: "leader"` keeps the leader targeted;
 * - maintenance: a phantom before a disruption, saves a device the forecast breaks (Field
 *   Repair, Redundant PSU, repairs), scrubs or demolishes by value per energy (charges, then
 *   Jammers, Spikes, Taps), steps a device out of reach when that is cheaper, repairs a worn
 *   primary-route device, racks a device that overloads, Spikes or charges would wear;
 * - guardian ultimates: plays bursts only when they reach the break (adds killed by spread
 *   when that lowers the threshold), otherwise braces.
 * v5 tactical line (three energy): after the opener, maintenance and the guardian windows, every
 * affordable card, console use and a few relocations become candidate plans. Each plan is played
 * on a copy of the run and scored from the forecast: the outlook change this turn (damage by
 * threat, kills, interrupts, minus incoming, faults and installs), stored damage (buffer,
 * backpressure), what lasts (a "next turn" forecast with this turn's effects stripped: route
 * damage, persistent shield, energy and draw from devices, times the expected remaining turns),
 * one-shot next-turn gains (Brace, Capacitor, carried block), cards gained (draws, Payload tokens,
 * returned cards, upgrades, discounts), daemons (hook-driven effects by an estimate per turn) and
 * protocols armed for a later intent. The best affordable set (a small knapsack on energy and the
 * Kernel Panic play limit) is chosen and its most urgent member played; Retain cards wait until
 * they pay well or the fight ends. The older policies (careless, aggressive, adaptive) keep the
 * v4 line unchanged. */
import { CARDS, baseCard } from "../src/core/cards.ts";
import { AVERAGE_SINGLE_THREAT, ENEMIES, ESCORT_THREAT } from "../src/core/enemies.ts";
import { AUTO_SOCKETS } from "../src/core/combat/board.ts";
import { canLink } from "../src/core/graph.ts";
import { analyze } from "../src/core/combat/network.ts";
import * as rules from "../src/core/run.ts";
import {
  ZONES, PORTS, RULES, costFor, combatPreview, zoneForNode, intentFor, consoleState, isBlocked, leaderOf, mostDangerous,
  scrubCost, repairCost, conditionOf, maxConditionOf, livingEnemies, protocolLimit, playLimit, turnDrawBase, canTargetNode,
} from "../src/core/run.ts";
import type { CombatPreview } from "../src/core/run.ts";
import type { BaseCardId, CardId, Enemy, Installation, Port, RunState, Zone } from "../src/core/types.ts";
import { chooseOffer } from "../src/core/encounter.ts";
import { cardPriorities, DEFAULT_PRIORITIES } from "./bot-meta.ts";

export type Policy = "careless" | "adaptive" | "aggressive" | "tactical";
/** Balance-probe switches (deterministic): the kill-order rule the tactical line follows, and the
 * build path whose reward priorities crate card choices follow (bot-meta.ts `cardPriorities`). */
export interface BotOptions { killOrder: "threat" | "leader"; path?: string }
const options: BotOptions = { killOrder: "threat" };
export function setBotOptions(next: Partial<BotOptions>) { Object.assign(options, next); }

/** Answers every waiting offer with a fixed priority: a message purges when a curse sits in the
 * deck, restores when integrity is at 60 % or less, else takes maximum integrity, credits,
 * the restore, a card for this encounter, a purge; a crate card choice takes the card its
 * keeper's reward priorities rank higher. */
export function resolveOffers(run: RunState, onChoice?: (kind: string, id: string) => void) {
  for (let guard = 0; run.offers.length && guard < 10; guard++) {
    const offer = run.offers[0];
    let index = 0;
    if (offer.kind === "message") {
      const low = run.integrity <= run.maxIntegrity * 0.6 && run.maxIntegrity - run.integrity >= RULES.messageRestore;
      const cursed = run.deck.some(id => CARDS[id]?.curse);
      const order = [...(cursed ? ["purge"] : []), ...(low ? ["restore"] : []), "reinforce", "credit", "restore", "recover", "purge"];
      index = Math.max(0, offer.options.map(option => order.indexOf(option.id)).reduce((best, rank, i, ranks) => rank < ranks[best] ? i : best, 0));
    } else {
      const list = cardPriorities(run.archetype, options.path);
      const rank = (id: CardId) => { const at = list.indexOf(baseCard(id) as CardId); return at < 0 ? 99 : at; };
      index = offer.cards.reduce((best, id, i) => rank(id) < rank(offer.cards[best]) ? i : best, 0);
    }
    const chosen = offer.kind === "message" ? offer.options[index]?.id : offer.cards[index];
    if (chooseOffer(run, index).ok) { if (chosen) onChoice?.(offer.kind, chosen); } else run.offers.shift();
  }
}
/** Every command the bot issues. `card` names the card an index-based play used; `purpose`
 * marks maintenance (scrubs, repairs, moves out of reach) for the probe's energy share. */
export type BotAction = (
  | { kind: "instant" | "prepare" | "protocol" | "junk" | "daemon"; index: number }
  | { kind: "ground"; index: number; x: number; z: number }
  | { kind: "node"; index: number; id: string }
  | { kind: "link"; index: number; a: string; b: string }
  | { kind: "zone"; index: number; zone: Zone }
  | { kind: "move"; id: string; x: number; z: number }
  | { kind: "console"; a?: string; b?: string }
  | { kind: "scrub"; id: string }
  | { kind: "repair"; id: string }
  | { kind: "focus"; port: Port }
) & { card?: CardId; purpose?: "maintenance" }

/** Kept for the browser playthrough: reward order used when no meta player is attached. */
export const rewardPriorities = (_build = "balanced"): CardId[] => [
  "poe-injector", "cache-server", "load-balancer", "zero-day", "failover-policy", "rate-limiter",
  "ips-signature", "barrier", "startup-config", "resonance-field", "guard", "pulse", "honeypot",
];

/** Reward priorities that let each engine come online (base ids, best first; bot-meta.ts). */
export const PRIORITIES: Record<RunState["archetype"], CardId[]> = DEFAULT_PRIORITIES;
const SOCKETS = [
  { x: 0, z: 0 }, { x: 0, z: -2.6 }, { x: 0, z: 2.6 }, { x: -1.6, z: 0 }, { x: 1.6, z: 0 },
  { x: -2.6, z: -2.6 }, { x: 2.6, z: 2.6 }, { x: -2.6, z: 2.6 }, { x: 2.6, z: -2.6 },
  { x: 0, z: -4.2 }, { x: 0, z: 4.2 }, { x: -3.4, z: 0.2 }, { x: 3.4, z: -0.2 },
  { x: -1.5, z: -4.2 }, { x: 1.5, z: 4.2 }, { x: 1.5, z: -4.2 }, { x: -1.5, z: 4.2 },
];
const TRIGGERS: Record<string, (kind: string | undefined, ultimate: boolean, field: boolean) => boolean> = {
  sever: kind => kind === "sever",
  jam: kind => kind === "jam",
  strike: kind => kind === "strike",
  breach: kind => kind === "breach",
  field: (kind, _u, field) => kind === "corrupt" || field,
  ultimate: (kind, ultimate) => kind === "charge" || ultimate,
};

// ---------------------------------------------------------------- v5 evaluator weights

/** Outlook units: 1 ≈ one damage point on a healthy hostile, 3 = one integrity point. */
const W = {
  /** A damage point that lands later (route damage per future turn, Payload tokens). */
  dmg: 1.2,
  /** Damage stored for the next transmission (buffer, backpressure): delayed and at risk. */
  store: 0.8,
  /** One energy on a later turn (PoE Injector, Power Capacitor, Reserve Cell). */
  energy: 3.2,
  /** One card drawn on a later turn (Cache Server, Brace-style next-turn draw). */
  draw: 2.2,
  /** One card drawn now, with energy left to play it (0.6 without). */
  drawNow: 1.6,
  /** A block point that arrives next turn (Brace, Persistent State carry). */
  nextBlock: 1.5,
  /** A hand card upgraded for this battle (Firmware Update). */
  upgrade: 1.2,
  /** One energy of discount on a hand card this turn (Patch Panel, Rack and Stack, Blueprint, Rearm). */
  discount: 1.2,
  /** Integrity restored. */
  heal: 3,
  /** A Payload token beyond its damage (a free card play for Side Channel, Man-in-the-Middle, Cover Tracks). */
  token: 0.4,
  /** Per-turn decay of future value. */
  decay: 0.85,
};
/** Order hints inside the chosen set: 0 sets up (draw, energy, discounts, daemons, Man-in-the-Middle),
 * 1 builds (hardware, cables, protocols, fields, upgrades), 2 plays, 3 counts what came before
 * (per channel / firewall / device / card) or cashes a stored value. */
const TIER: Partial<Record<BaseCardId, number>> = {
  surge: 0, inspect: 0, diagnostic: 0, blueprint: 0, "man-in-the-middle": 0, "patch-panel": 0, "rack-and-stack": 0,
  "firmware-update": 0, "fork-bomb": 0, "shell-access": 0, ping: 0, traceroute: 3,
  ecmp: 3, mirror: 3, "flood-fill": 3, "redundant-paths": 3, "trunk-line": 3, perimeter: 3, "deep-inspection": 3,
  "side-channel": 3, entrench: 3, vent: 3, reflect: 3, "replay-attack": 3, exfiltrate: 3, rollback: 3, wireshark: 3,
};
const RETAIN_MIN = 6;

/** A copy for simulated plays: every field a player turn can change is copied, the rest (map, log,
 * relics) is shared read-only. Several times cheaper than structuredClone on a whole run. */
function fastClone(r: RunState): RunState {
  const fx = r.turnEffects;
  return {
    ...r,
    deck: [...r.deck],
    hand: [...r.hand], drawPile: [...r.drawPile], discardPile: [...r.discardPile], exhaustPile: [...r.exhaustPile],
    encounterCards: [...(r.encounterCards ?? [])],
    topology: { nodes: r.topology.nodes.map(node => ({ ...node })), links: r.topology.links.map(link => ({ ...link })) },
    enemies: r.enemies.map(enemy => ({ ...enemy })),
    installations: r.installations.map(item => ({ ...item })),
    zoneEffects: r.zoneEffects.map(field => ({ ...field })),
    faultNodes: [...r.faultNodes], faultLinks: [...r.faultLinks],
    protocols: [...r.protocols], daemons: [...(r.daemons ?? [])],
    offers: [...(r.offers ?? [])],
    terrain: r.terrain && { ...r.terrain, debris: r.terrain.debris.map(spot => ({ ...spot })) },
    reinforcement: r.reinforcement && { ...r.reinforcement },
    signal: r.signal && { ...r.signal },
    ...(r.creditLedger ? { creditLedger: r.creditLedger.map(line => ({ ...line })) } : {}),
    ...(r.lingeringJams ? { lingeringJams: { ...r.lingeringJams } } : {}),
    ...(r.frayedByCut ? { frayedByCut: [...r.frayedByCut] } : {}),
    ...(r.attackers ? { attackers: [...r.attackers] } : {}),
    ...(r.nextTurn ? { nextTurn: { ...r.nextTurn } } : {}),
    ...(fx ? {
      turnEffects: {
        ...fx,
        ...(fx.discounted ? { discounted: [...fx.discounted] } : {}),
        ...(fx.freeCards ? { freeCards: [...fx.freeCards] } : {}),
        ...(fx.cardsPlayed ? { cardsPlayed: [...fx.cardsPlayed] } : {}),
        ...(fx.missSources ? { missSources: [...fx.missSources] } : {}),
        ...(fx.dodgeSources ? { dodgeSources: [...fx.dodgeSources] } : {}),
      },
    } : {}),
  };
}

export function playBotTurn(run: RunState, policy: Policy, observe?: (action: BotAction) => void) {
  resolveOffers(run);
  const makeAct = (observer?: (action: BotAction) => void) => {
    const record = (action: BotAction, result: rules.ActionResult) => { if (result.ok) observer?.(action); return result; };
    return {
      instant: (r: RunState, index: number, installation?: string) => { const card = r.hand[index]; return record({ kind: "instant", index, card }, rules.playInstant(r, index, installation)); },
      daemon: (r: RunState, index: number) => { const card = r.hand[index]; return record({ kind: "daemon", index, card }, rules.playDaemon(r, index)); },
      prepare: (r: RunState, index: number) => { const card = r.hand[index]; return record({ kind: "prepare", index, card }, rules.prepareCard(r, index)); },
      protocol: (r: RunState, index: number) => { const card = r.hand[index]; return record({ kind: "protocol", index, card }, rules.playProtocol(r, index)); },
      junk: (r: RunState, index: number) => { const card = r.hand[index]; return record({ kind: "junk", index, card }, rules.playJunk(r, index)); },
      ground: (r: RunState, index: number, x: number, z: number) => { const card = r.hand[index]; return record({ kind: "ground", index, x, z, card }, rules.playGround(r, index, x, z)); },
      node: (r: RunState, index: number, id: string) => { const card = r.hand[index]; return record({ kind: "node", index, id, card }, rules.playNode(r, index, id)); },
      link: (r: RunState, index: number, a: string, b: string) => { const card = r.hand[index]; return record({ kind: "link", index, a, b, card }, rules.playLink(r, index, a, b)); },
      zone: (r: RunState, index: number, zone: Zone) => { const card = r.hand[index]; return record({ kind: "zone", index, zone, card }, rules.playZone(r, index, zone)); },
      move: (r: RunState, id: string, x: number, z: number, purpose?: "maintenance") => record({ kind: "move", id, x, z, ...(purpose ? { purpose } : {}) }, rules.relocateNode(r, id, x, z)),
      console: (r: RunState, a?: string, b?: string) => record({ kind: "console", a, b }, rules.useConsole(r, a, b)),
      scrub: (r: RunState, id: string) => record({ kind: "scrub", id }, rules.scrubInstallation(r, id)),
      repair: (r: RunState, id: string) => record({ kind: "repair", id }, rules.repairNode(r, id)),
      focus: (r: RunState, port: Port) => record({ kind: "focus", port }, rules.setFocus(r, port)),
    };
  };
  type Act = ReturnType<typeof makeAct>;
  const act = makeAct(observe);
  /** Plays on simulation copies: nothing is recorded. */
  const silent = makeAct();
  const affordable = (r: RunState, i: number) => costFor(r, i) <= r.energy;
  const indexOf = (r: RunState, ids: BaseCardId[]) => {
    for (const id of ids) {
      const index = r.hand.findIndex((held, i) => baseCard(held) === id && affordable(r, i));
      if (index >= 0) return index;
    }
    return -1;
  };
  const instant = (r: RunState, ...ids: BaseCardId[]) => {
    const index = indexOf(r, ids);
    return index >= 0 && act.instant(r, index).ok;
  };
  const nodeCard = (r: RunState, id: BaseCardId, target: string) => {
    const index = indexOf(r, [id]);
    return index >= 0 && act.node(r, index, target).ok;
  };
  const linkCards = (r: RunState) => r.hand.map((id, i) => (CARDS[id].target === "link" && affordable(r, i) ? i : -1)).filter(i => i >= 0);
  const patchAvailable = (r: RunState) => { const c = consoleState(r); return c.id === "patch" && c.usable; };
  const cableCapacity = (r: RunState) => linkCards(r).length + Number(patchAvailable(r));
  /** Lays a cable with the cheapest link card (Patch Panel first when another link card waits), or
   * the Patch Cable console. */
  function layCable(r: RunState, a: Act, x: string, y: string): boolean {
    if (!canLink(r.topology, x, y)) return false;
    const links = linkCards(r).sort((i, j) => costFor(r, i) - costFor(r, j) || linkOrder(r.hand[i]) - linkOrder(r.hand[j]));
    const cheapest = links[0];
    if (cheapest !== undefined && a.link(r, cheapest, x, y).ok) return true;
    return patchAvailable(r) && a.console(r, x, y).ok;
  }
  /** Plain cables first so special link cards (armor, amplification, draws) stay for their own plans;
   * Patch Panel leads when a second link card waits (it frees the next one). */
  const linkOrder = (id: CardId) => {
    const base = baseCard(id);
    return base === "patch-panel" ? -1 : base === "fiber" ? 0 : base === "branch-line" ? 1 : 2;
  };
  function cable(r: RunState, a: string, b: string): boolean {
    if (!canLink(r.topology, a, b)) return false;
    const cheapest = linkCards(r).sort((x, y) => costFor(r, x) - costFor(r, y))[0];
    if (cheapest !== undefined && act.link(r, cheapest, a, b).ok) return true;
    return patchAvailable(r) && act.console(r, a, b).ok;
  }
  function socketNear(r: RunState, zone?: Zone): { x: number; z: number } | undefined {
    return SOCKETS.find(s => (!zone || zoneForNode(s) === zone) && !isBlocked(r, s.x, s.z));
  }
  const routers = (r: RunState) => r.topology.nodes.filter(n => n.role === "router");
  const primaryRouter = (r: RunState, p = combatPreview(r)) =>
    r.topology.nodes.find(n => n.role === "router" && p.signalPath.includes(n.id));

  // ---------------------------------------------------------------- v4 tactical helpers

  const guardianOf = (r: RunState) => r.enemies.find(enemy => enemy.hp > 0 && ENEMIES[enemy.id]?.boss);
  /** Threat per three-action cycle (section 11.3): escorts by their score, adds by their
   * break-threshold weight, leaders and singles at the stage's average. */
  function threatOf(r: RunState, enemy: Enemy): number {
    if (enemy.role === "escort") return ESCORT_THREAT[enemy.id] ?? 2;
    if (enemy.role === "add") return 4;
    return AVERAGE_SINGLE_THREAT.battle[Math.min(2, r.stage)] ?? 8;
  }
  /** Whether killing adds buys a break: the guardian's packet with the target on it comes within
   * 6 of its base break threshold. Set by bestTargeting before it scores candidates. */
  let breakable = true;
  /** What the tactical line wants from a forecast: damage that sticks (weighted toward the
   * hostile with the most threat per point of health), kills, the interrupt; minus what the
   * phase takes from you (a phase that would end the expedition weighs most). Every number is the
   * forecast's. */
  function outlook(r: RunState, p: CombatPreview): number {
    const guardian = guardianOf(r);
    // A fortress line (it cannot break the ultimate) leaves the adds to its return fire and
    // keeps the guardian targeted (worked example 11.5 C, the Warden).
    const fortress = !!guardian && !breakable;
    let value = p.lethal ? 500 : 0;
    for (const port of PORTS) {
      const forecast = p.ports[port];
      if (!forecast) continue;
      const enemy = r.enemies.find(item => item.uid === forecast.uid);
      if (!enemy || enemy.hp <= 0) continue;
      const threat = threatOf(r, enemy);
      const dealt = Math.min(forecast.packet, forecast.hpBefore);
      if (fortress && enemy.role === "add") { value += dealt * 0.5; continue; }
      value += dealt * (1 + threat / Math.max(1, forecast.hpBefore));
      if (forecast.lethal) value += 6 + 3 * threat + (enemy.role === "add" && guardian ? 4 * RULES.addBreakBonus : 0);
    }
    if (p.interrupted) value += 60;
    const installs = p.installTargets.filter(item => !item.destroyed && !item.absorbed).length;
    value -= 3 * p.incoming + 4 * p.faultTargets.length + 2 * installs + p.enemyHealing;
    if (!p.lethal && p.incoming >= r.integrity) value -= 400;
    return value;
  }
  /** Every living hostile as the target; the one with the best outlook wins. */
  function bestTargeting(r: RunState): Port | null {
    const alive = livingEnemies(r);
    if (!alive.length || !combatPreview(r).deliveries.length) return null;
    const lead = alive.find(enemy => enemy.role === "leader" || enemy.role === "single") ?? alive[0];
    if (options.killOrder === "leader" && !guardianOf(r)) return lead.port;
    if (alive.length === 1) return alive[0].port;
    const saved = r.focus;
    const guardian = guardianOf(r);
    if (guardian) {
      r.focus = guardian.port;
      const packet = combatPreview(r).ports[guardian.port]?.packet ?? 0;
      breakable = packet + 6 >= (ENEMIES[guardian.id].boss?.breakDamage ?? 0);
    } else breakable = true;
    let best: Port | null = null, bestValue = -Infinity;
    for (const candidate of [lead, ...alive.filter(enemy => enemy !== lead)]) {
      r.focus = candidate.port;
      const value = outlook(r, combatPreview(r));
      if (value > bestValue + 1e-9) { best = candidate.port; bestValue = value; }
    }
    r.focus = saved;
    return best;
  }
  /** Sets the best target: through the rules (recorded) on the real run, directly on a
   * simulation copy. */
  function retarget(r: RunState, record = true): void {
    const port = bestTargeting(r);
    if (!port) return;
    if (!record) { r.focus = port; return; }
    if (r.focus !== port) act.focus(r, port);
  }
  const reachOf = () => RULES.reach + 0.01;
  const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Steps a device out of every Jammer, Spike and charge reach when that is cheaper than the
   * scrub and the forecast neither loses damage nor gains incoming. */
  function escape(r: RunState, p: CombatPreview, item: Installation, targetId: string): boolean {
    const node = r.topology.nodes.find(n => n.id === targetId);
    if (!node || node.fixed || r.energy < RULES.relocateCost) return false;
    const reach = r.installations.filter(other => other.kind === "jammer" || other.kind === "spike" || other.kind === "breaker");
    const spots = [...SOCKETS, ...AUTO_SOCKETS]
      .filter(spot => !isBlocked(r, spot.x, spot.z, node.id) && reach.every(other => distance(other, spot) > reachOf()))
      .sort((a, b) => distance(a, node) - distance(b, node)).slice(0, 5);
    const routed = new Set(p.channelPaths.flat());
    for (const spot of spots) {
      const copy = structuredClone(r);
      if (!rules.relocateNode(copy, node.id, spot.x, spot.z).ok) continue;
      const after = combatPreview(copy);
      const effect = after.installationEffects.find(e => e.id === item.id);
      if (effect?.target && (effect.target === targetId || routed.has(effect.target))) continue;
      if (after.packetDamage < p.packetDamage || after.incoming > p.incoming || after.channels < p.channels) continue;
      return act.move(r, node.id, spot.x, spot.z, "maintenance").ok;
    }
    return false;
  }
  /** Wear points the phase deals to a device (a rack takes its shelter's wear). */
  const wearOn = (p: CombatPreview, id: string) => p.wear.filter(w => w.nodeId === id).reduce((sum, w) => sum + Math.max(0, w.from - w.to), 0);
  /** One maintenance action for the tactical line (true when it acted). */
  function maintain(r: RunState, p: CombatPreview): boolean {
    const routed = new Set(p.channelPaths.flat());
    const valuable = (id: string) => {
      const node = r.topology.nodes.find(n => n.id === id);
      return !!node && !node.fixed && (routed.has(id) || (node.role === "firewall" && p.online.includes(id)));
    };
    // A phantom before any disruption lands (it absorbs the first in port order).
    const disruption = p.faultTargets.length + p.installTargets.filter(item => !item.destroyed && !item.absorbed).length + p.hostiles.filter(h => h.overload).length;
    if (disruption && !r.topology.nodes.some(n => n.role === "phantom")) {
      const index = indexOf(r, ["phantom-node"]);
      const spot = socketNear(r);
      if (index >= 0 && spot && act.ground(r, index, spot.x, spot.z).ok) return true;
    }
    // A device the forecast breaks: Field Repair, Redundant PSU, then repairs.
    for (const record of p.breakdowns) {
      if (!valuable(record.nodeId)) continue;
      const node = r.topology.nodes.find(n => n.id === record.nodeId)!;
      if (instant(r, "field-repair")) return true;
      if (nodeCard(r, "redundant-psu", node.id)) return true;
      if (nodeCard(r, "hotfix", node.id)) return true;
      const needed = wearOn(p, node.id) - conditionOf(node) + 1;
      if (needed <= maxConditionOf(node) - conditionOf(node) && needed * repairCost(r) <= r.energy && act.repair(r, node.id).ok) return true;
    }
    // Scrub or demolish by value per energy: charges, then Jammers, Spikes, Taps.
    const scored = r.installations.map(item => {
      const effect = p.installationEffects.find(e => e.id === item.id);
      const lands = !!effect && effect.effect !== "idle" && !effect.decoyed && !effect.absorbed && !effect.cancelled && !effect.destroyed && !effect.missed;
      const onRoute = !!effect?.target && routed.has(effect.target);
      let value = 0;
      if (item.kind === "breaker") value = lands && effect!.effect === "detonate" ? 10 : 6;
      else if (item.kind === "jammer") value = lands ? (onRoute ? 7 : 3) : 1.5;
      else if (item.kind === "spike") value = lands ? (onRoute ? 5 : 3) : 1.5;
      else if (item.kind === "tap") value = 3;
      else value = r.zoneEffects.some(field => rules.FIELD_RULES[field.kind].hostile && field.zone === zoneForNode(item)) ? 3 : 1;
      return { item, value, cost: item.integrity * scrubCost(r), target: lands ? effect!.target : null };
    }).sort((a, b) => b.value / b.cost - a.value / a.cost || a.item.id.localeCompare(b.item.id));
    for (const entry of scored) {
      if (entry.value / entry.cost < 1.2) break;
      const demolition = indexOf(r, ["demolition-charge"]);
      if (demolition >= 0 && entry.cost >= 2 && act.instant(r, demolition, entry.item.id).ok) return true;
      if ((entry.item.kind === "jammer" || entry.item.kind === "spike" || entry.item.kind === "breaker") && entry.target && entry.cost > RULES.relocateCost && escape(r, p, entry.item, entry.target)) return true;
      if (r.energy >= scrubCost(r) && (r.energy - entry.cost >= 1 || entry.value >= 6) && act.scrub(r, entry.item.id).ok) return true;
    }
    // A worn primary-route device.
    const worn = r.topology.nodes.find(n => p.signalPath.includes(n.id) && !n.fixed && conditionOf(n) <= 1 && conditionOf(n) < maxConditionOf(n));
    if (worn && nodeCard(r, "hotfix", worn.id)) return true;
    if (worn && (repairCost(r) === 0 || r.energy >= repairCost(r) + 1) && act.repair(r, worn.id).ok) return true;
    // A rack beside the device that overloads, Spikes or charges would wear.
    const threatened = p.wear.filter(w => !w.sheltered && valuable(w.nodeId)).map(w => r.topology.nodes.find(n => n.id === w.nodeId)!).filter(Boolean)[0];
    if (threatened) {
      const index = indexOf(r, ["server-rack"]);
      const spot = index >= 0 ? [...SOCKETS, ...AUTO_SOCKETS].filter(s => distance(s, threatened) <= RULES.reach - 0.05 && !isBlocked(r, s.x, s.z))
        .sort((a, b) => distance(a, threatened) - distance(b, threatened))[0] : undefined;
      if (index >= 0 && spot && act.ground(r, index, spot.x, spot.z).ok) return true;
    }
    return false;
  }
  const BURSTS: BaseCardId[] = ["zero-day", "pulse", "mirror", "ecmp", "packet-storm", "broadcast-storm", "flood-fill", "traffic-shaping", "spearhead", "demolition-charge", "replay-attack", "reflect"];
  /** The first card of a burst sequence that interrupts the guardian's ultimate this turn
   * (greedy on copies, targeting included), or -1. v5 (tactical): every instant that adds to the
   * guardian's packet counts (Payloads, Flush, Side Channel, Perimeter, Trunk Line …). */
  function breakingCard(r: RunState, any = false): number {
    const trial = any ? fastClone(r) : structuredClone(r);
    retarget(trial, false);
    if (combatPreview(trial).interrupted) return -2;
    let first = -1;
    let state = trial;
    for (let step = 0; step < 5; step++) {
      let bestState: RunState | null = null, bestIndex = -1, bestHit = -Infinity;
      const tried = new Set<CardId>();
      state.hand.forEach((id, i) => {
        if (tried.has(id)) return;
        tried.add(id);
        const eligible = any ? CARDS[id].target === "instant" && !CARDS[id].unplayable : BURSTS.includes(baseCard(id));
        if (!eligible || costFor(state, i) > state.energy) return;
        const copy = any ? fastClone(state) : structuredClone(state);
        if (!rules.playInstant(copy, i).ok) return;
        retarget(copy, false);
        const after = combatPreview(copy);
        const guardian = guardianOf(copy);
        const hit = after.interrupted ? Infinity : guardian ? after.ports[guardian.port]?.packet ?? 0 : 0;
        const before = guardian ? combatPreview(state).ports[guardian.port]?.packet ?? 0 : 0;
        if (any && hit <= before) return;
        if (hit > bestHit) { bestHit = hit; bestState = copy; bestIndex = i; }
      });
      if (!bestState) return -1;
      if (first < 0) first = bestIndex;
      state = bestState;
      if (bestHit === Infinity) return first;
    }
    return -1;
  }

  const EVALUATED: BaseCardId[] = ["broadcast-storm", "packet-storm", "flood-fill", "traffic-shaping", "quorum", "bulkhead", "spearhead", "demolition-charge"];
  /** Plays the v4 instant whose forecast outlook (after retargeting) gains the most per
   * energy, if it gains at least 2 per energy spent (free cards: any gain). */
  function playBestInstant(r: RunState): boolean {
    const base = structuredClone(r);
    retarget(base, false);
    const before = outlook(base, combatPreview(base));
    let best = -1, bestGain = 0;
    r.hand.forEach((id, i) => {
      if (!EVALUATED.includes(baseCard(id)) || !affordable(r, i)) return;
      const copy = structuredClone(r);
      if (!rules.playInstant(copy, i).ok) return;
      retarget(copy, false);
      const gain = (outlook(copy, combatPreview(copy)) - before) / Math.max(1, costFor(r, i));
      if (gain > Math.max(bestGain, costFor(r, i) ? 2 : 0.5)) { best = i; bestGain = gain; }
    });
    return best >= 0 && act.instant(r, best).ok;
  }

  // ---------------------------------------------------------------- v5 tactical line: plans

  interface Plan {
    /** One plan per group is kept (the hand card's id, "console", "move"). */
    group: string;
    card?: CardId;
    tier: number;
    retain?: boolean;
    exec: (r: RunState, a: Act) => boolean;
  }
  interface Base { damage: number; incoming: number; energy: number; draw: number }
  interface Snap { p: CombatPreview; outlook: number; stored: number; base: Base; sig: string }
  interface Scored { plan: Plan; value: number; cost: number; lethal: boolean }

  /** What the board, daemons, faults and fields look like: a plan that changes none of them has
   * no lasting effect on the next-turn forecast. */
  const signature = (r: RunState) =>
    `${r.topology.nodes.map(n => `${n.id}${n.x},${n.z}${n.upgraded ? "u" : ""}${n.amplified ? "a" : ""}${n.configured ? "c" : ""}${n.shielded ? "s" : ""}${n.condition ?? ""}`).join(";")}|${r.topology.links.map(l => `${l.a}-${l.b}${l.armored ? "a" : ""}${l.boosted ? "b" : ""}`).join(";")}|${(r.daemons ?? []).join()}|${r.faultNodes.join()}|${r.faultLinks.join()}|${r.zoneEffects.length}|${r.installations.length}`;
  /** Next turn's forecast with this turn's effects stripped: what the table, the daemons and the
   * relics deal and save every turn (route damage, persistent shield, energy and draw). */
  function baseline(r: RunState): Base {
    const sim = { ...r, packetBoost: 0, turnEffects: undefined, buffering: false, buffer: 0, backpressure: 0, block: 0, reclaim: 0, nextTurn: undefined, reserveEnergy: 0, protocols: [], preparedCard: null } as unknown as RunState;
    const p = combatPreview(sim);
    return { damage: p.signalPath.length ? p.packetDamage : 0, incoming: p.incoming, energy: p.nextTurn.energy, draw: p.nextTurn.draw };
  }
  /** Damage the turn stores for the next transmission: the buffer while buffering (unless the
   * forecast loses it) and the backpressure the phase stores; never more than the hostiles hold. */
  function stored(r: RunState, p: CombatPreview): number {
    let amount = p.backpressureGain;
    if (p.buffering && !p.bufferAtRisk) amount += r.buffer + p.bufferGain;
    const health = livingEnemies(r).reduce((sum, enemy) => sum + enemy.hp, 0);
    return Math.min(amount, health + 6);
  }
  function snap(r: RunState, base?: Base, sig?: string): Snap {
    const p = combatPreview(r);
    const s = sig ?? signature(r);
    return { p, outlook: outlook(r, p), stored: stored(r, p), base: base ?? baseline(r), sig: s };
  }
  /** Expected remaining turns after this one, and the sum of W.decay^k over them. */
  function futureOf(r: RunState, base: Base): { turns: number; weight: number } {
    const alive = livingEnemies(r);
    const health = alive.reduce((sum, enemy) => sum + enemy.hp, 0) + (guardianOf(r) ? 15 : 0);
    const turns = Math.max(0, Math.min(6, Math.ceil(health / Math.max(4, base.damage + 3)) - 1));
    let weight = 0;
    for (let k = 1; k <= turns; k++) weight += W.decay ** k;
    return { turns, weight };
  }
  const payloadBonus = (r: RunState) => rules.runningDaemons(r).filter(d => d.card.base === "exploit-kit").reduce((sum, d) => sum + (d.card.values.amount ?? 0) * d.count, 0);
  /** Cards cycling through this encounter (draw pile, discard, hand). */
  const cycling = (r: RunState) => [...r.drawPile, ...r.discardPile, ...r.hand];
  function share(r: RunState, match: (id: CardId) => boolean): number {
    const cards = cycling(r);
    return cards.filter(match).length / Math.max(1, cards.length);
  }
  const expectedPayloads = (r: RunState) =>
    turnDrawBase(r) * (share(r, id => baseCard(id) === "fork-bomb") * 3 + share(r, id => baseCard(id) === "shell-access"))
    + r.daemons.filter(id => baseCard(id) === "botnet").length;
  const expectedExhausts = (r: RunState) => turnDrawBase(r) * share(r, id => !!CARDS[id].exhaust && !CARDS[id].token) + expectedPayloads(r);
  /** A daemon's hook-driven value per later turn (resolver hooks are already in the baseline). */
  function daemonPerTurn(id: CardId, r: RunState, base: Base): number {
    const v = CARDS[id].values;
    const ground = (card: CardId) => CARDS[card].target === "ground";
    switch (baseCard(id)) {
      case "keepalive": return 1.4 * (v.block ?? 0);
      case "peering-session": return 0.5 * (v.block ?? 0);
      case "provisioning-script": return 1.3 * (v.block ?? 0) * turnDrawBase(r) * share(r, ground);
      case "zero-touch": return W.drawNow * (v.draw ?? 1) * turnDrawBase(r) * share(r, ground);
      case "trickle": return W.dmg * 0.9 * (v.buffer ?? 0);
      case "botnet": return (v.tokens ?? 1) * (W.dmg * (RULES.payloadDamage + payloadBonus(r)) + W.token);
      case "exploit-kit": return W.dmg * (v.amount ?? 1) * expectedPayloads(r);
      case "cover-tracks": return 1.3 * (v.block ?? 1) * expectedExhausts(r);
      case "incident-response": return W.dmg * (v.damage ?? 0) * Math.min(1, 0.6 * turnDrawBase(r) * share(r, card => CARDS[card].target === "protocol") + r.protocols.length * 0.5);
      case "hardening-guide": return 1.4 * (v.block ?? 0) * (r.archetype === "warden" ? 1 : 0) + 1.4 * (v.block ?? 0) * turnDrawBase(r) * share(r, card => baseCard(card) === "double-shift");
      case "policy-engine": return share(r, card => CARDS[card].target === "protocol") > 0.12 ? 1.2 : 0.2;
      case "persistent-state": return 3;
      case "flow-control": return r.relics.includes("backpressure") ? 2 : 0;
      case "obfuscation": return 2.5 * (v.misses ?? 1);
      case "deep-queue": return r.archetype === "ghost" ? 0.35 * W.dmg * base.damage : 0;
      case "fabric-controller": return (v.perChannel ?? 0) * (r.archetype === "architect" ? 0.6 : 0.2);
      case "datacenter": return 0.6;
      case "defense-in-depth": return 1.2 * (v.firewallBonus ?? 1) * r.topology.nodes.filter(n => n.role === "firewall").length;
      default: return 0.5;
    }
  }
  /** A protocol armed now that does not fire this phase: what it should answer later. */
  function protocolLater(id: CardId, r: RunState): number {
    const card = CARDS[id], v = card.values;
    const next = livingEnemies(r).map(enemy => intentFor(r, enemy, 1));
    const matching = next.filter(intent => TRIGGERS[card.protocol!]?.(intent.kind, !!intent.ultimate, !!intent.field));
    const amount = Math.max(3, ...matching.map(intent => intent.amount ?? 0));
    let effect = 0;
    if (v.reduce) effect += 3 * Math.min(v.reduce, amount);
    if (v.shield) effect += 2 * v.shield;
    if (v.damage) effect += W.dmg * v.damage;
    if (card.cancels) effect += card.protocol === "breach" || card.protocol === "strike" ? 3 * amount : card.protocol === "field" ? 4 : 6;
    return (matching.length ? 0.75 : 0.2) * effect;
  }
  /** Cards gained in hand: draws, Payload tokens, returned cards, upgrades; and new discounts. */
  function handValue(rb: RunState, ra: RunState): number {
    const left = [...rb.hand];
    const gained: CardId[] = [];
    for (const id of ra.hand) {
      const at = left.indexOf(id);
      if (at >= 0) left.splice(at, 1);
      else gained.push(id);
    }
    let value = 0;
    for (const id of gained) {
      const card = CARDS[id];
      if (card.token) { value += W.dmg * ((card.values.damage ?? RULES.payloadDamage) + payloadBonus(ra)) + W.token; continue; }
      const original = left.indexOf(card.base);
      if (card.upgraded && original >= 0) { left.splice(original, 1); value += W.upgrade; continue; }
      if (card.curse || card.junk || card.unplayable) { value -= 1; continue; }
      value += card.cost === 0 || ra.energy >= 1 ? W.drawNow : 0.6;
    }
    return value + Math.max(0, discountValue(ra) - discountValue(rb));
  }
  function discountValue(r: RunState): number {
    const fx = r.turnEffects ?? {};
    const links = r.hand.filter(id => CARDS[id].target === "link" && CARDS[id].cost > 0).length;
    let value = Math.min(fx.freeLinks ?? 0, links);
    if (fx.hardwareDiscount && r.hand.some(id => CARDS[id].target === "ground" && CARDS[id].cost > 0)) value += Math.min(1, fx.hardwareDiscount);
    value += (fx.discounted ?? []).filter(id => r.hand.includes(id) && CARDS[id].cost > 0).length;
    value += (fx.freeCards ?? []).filter(id => r.hand.includes(id)).reduce((sum, id) => sum + CARDS[id].cost, 0);
    return value * W.discount;
  }
  /** Man-in-the-Middle: the buffer every later card adds this turn (0-cost cards, then energy). */
  function mitmValue(rb: RunState, ra: RunState): number {
    const gain = (ra.turnEffects?.mitm ?? 0) - (rb.turnEffects?.mitm ?? 0);
    if (gain <= 0) return 0;
    const free = ra.hand.filter((id, i) => !CARDS[id].unplayable && CARDS[id].target !== "junk" && costFor(ra, i) === 0).length;
    const paid = Math.min(ra.energy, ra.hand.filter((id, i) => !CARDS[id].unplayable && CARDS[id].target !== "junk" && costFor(ra, i) > 0).length);
    return gain * (free + paid) * W.dmg * 0.9;
  }
  /** What a later turn gains from `after`'s table over `before`'s. */
  const lasting = (before: Base, after: Base) =>
    W.dmg * (after.damage - before.damage) + 1.5 * (before.incoming - after.incoming) + W.energy * (after.energy - before.energy) + W.draw * (after.draw - before.draw);
  /** Cables a simulated device plan could not pay (keyed by the copy). */
  const pending = new WeakMap<RunState, [string, string][]>();
  function valueOf(rb: RunState, sb: Snap, ra: RunState, sa: Snap, future: number): number {
    let value = sa.outlook - sb.outlook;
    // Damage dealt during the turn (Exfiltrate, traps): the hostile holds less.
    for (const enemy of rb.enemies) {
      if (enemy.hp <= 0) continue;
      const now = ra.enemies.find(item => item.uid === enemy.uid);
      const lost = now ? enemy.hp - Math.max(0, now.hp) : 0;
      if (lost > 0) value += lost * (1 + threatOf(rb, enemy) / Math.max(1, enemy.hp)) + (now!.hp <= 0 ? 6 + 3 * threatOf(rb, enemy) : 0);
    }
    value += W.heal * (ra.integrity - rb.integrity);
    value += W.store * (sa.stored - sb.stored);
    const energy = sa.base.energy - sb.base.energy, draw = sa.base.draw - sb.base.draw;
    value += future * lasting(sb.base, sa.base);
    value += W.energy * (sa.p.nextTurn.energy - sb.p.nextTurn.energy - energy);
    value += W.draw * (sa.p.nextTurn.draw - sb.p.nextTurn.draw - draw);
    value += W.nextBlock * (sa.p.nextTurn.block - sb.p.nextTurn.block);
    value += handValue(rb, ra) + mitmValue(rb, ra);
    const before = [...(rb.daemons ?? [])];
    for (const id of ra.daemons ?? []) {
      const at = before.indexOf(id);
      if (at >= 0) before.splice(at, 1);
      else value += future * daemonPerTurn(id, ra, sa.base);
    }
    const fired = new Set(sa.p.protocolTriggers.map(trigger => trigger.card));
    for (const id of ra.protocols) if (!rb.protocols.includes(id) && !fired.has(id)) value += protocolLater(id, ra);
    return value;
  }

  // ---- plan generators
  const tierOf = (id: CardId) => TIER[baseCard(id)] ?? (["ground", "link", "node", "zone", "protocol"].includes(CARDS[id].target) ? 1 : CARDS[id].target === "daemon" ? 0 : 2);
  /** The first affordable hand index holding exactly this id. */
  const handIndex = (r: RunState, id: CardId) => r.hand.findIndex((held, i) => held === id && affordable(r, i));
  const cardPlan = (id: CardId, execute: (r: RunState, a: Act, i: number) => boolean): Plan => ({
    group: id, card: id, tier: tierOf(id), retain: !!CARDS[id].retain,
    exec: (r, a) => { const i = handIndex(r, id); return i >= 0 && execute(r, a, i); },
  });
  /** Sockets for a device: beside the primary router (the insertDevice spot), then the first free
   * socket of each band, least-used by routers first. */
  function groundSockets(r: RunState, p: CombatPreview): { x: number; z: number }[] {
    const spots: { x: number; z: number }[] = [];
    const router = primaryRouter(r, p);
    if (router) {
      const spot = SOCKETS.filter(s => !isBlocked(r, s.x, s.z)).sort((a, b) => Math.hypot(a.x - router.x + 1.6, a.z - router.z) - Math.hypot(b.x - router.x + 1.6, b.z - router.z))[0];
      if (spot) spots.push(spot);
    }
    const used = new Set(routers(r).map(zoneForNode));
    for (const zone of [...ZONES].sort((a, b) => Number(used.has(a)) - Number(used.has(b)))) {
      const spot = socketNear(r, zone);
      if (spot && !spots.some(s => s.x === spot.x && s.z === spot.z)) spots.push(spot);
    }
    return spots.slice(0, 3);
  }
  function groundPlans(r: RunState, p: CombatPreview, id: CardId): Plan[] {
    const card = CARDS[id], role = card.role;
    if (!role || r.topology.nodes.length >= RULES.maxDevices) return [];
    const plans: Plan[] = [];
    // Cables the energy or the hand cannot pay this turn are noted on the copy (`missing`): the
    // scorer values the device as if they were laid next turn.
    const place = (spot: { x: number; z: number }, cables: (r: RunState, node: string) => [string, string][]) => plans.push(cardPlan(id, (s, a, i) => {
      if (!a.ground(s, i, spot.x, spot.z).ok) return false;
      const node = s.topology.nodes[s.topology.nodes.length - 1].id;
      const missing: [string, string][] = [];
      for (const [x, y] of cables(s, node)) if (!layCable(s, a, x, y) && canLink(s.topology, x, y)) missing.push([x, y]);
      if (missing.length && a === silent) pending.set(s, missing);
      return true;
    }));
    if (role === "phantom") { const spot = socketNear(r); if (spot) place(spot, () => []); return plans; }
    if (role === "honeypot") {
      const spot = SOCKETS.filter(s => !isBlocked(r, s.x, s.z)).sort((a, b) => Math.hypot(a.x + 5.3, a.z) - Math.hypot(b.x + 5.3, b.z))[0];
      if (spot) place(spot, (_, node) => [["alpha", node]]);
      return plans;
    }
    const sockets = groundSockets(r, p);
    if (role === "rack") { for (const spot of sockets.slice(0, 2)) place(spot, () => []); return plans; }
    const auto = !!card.values.links || baseCard(id) === "spine-leaf";
    const primary = primaryRouter(r, p)?.id;
    /** An auto-linked device off every route takes the terminal it lacks (ALPHA first). */
    const complete = (s: RunState, node: string): [string, string][] => {
      if (combatPreview(s).online.includes(node)) return [];
      const end = ["alpha", "omega"].find(terminal => canLink(s.topology, node, terminal));
      return end ? [[end === "alpha" ? "alpha" : node, end === "alpha" ? node : "omega"]] : [];
    };
    for (const spot of role === "router" ? sockets.slice(-2) : sockets.slice(0, 2)) {
      if (auto) place(spot, complete);
      else if (role === "router") place(spot, (_, node) => [["alpha", node], [node, "omega"]]);
      else if (primary) {
        place(spot, (s, node) => [[node, primary], ["alpha", node], ...(role === "switch" && !combatPreview(s).signalPath.includes(node) ? [[node, "omega"] as [string, string]] : [])]);
        place(spot, (_, node) => [[primary, node], [node, "omega"]]);
      }
    }
    return plans;
  }
  /** Lays a cable; on a simulation copy, a device it leaves one terminal cable short of a route is
   * noted for the scorer (valued as completed next turn). */
  function linkAndNote(s: RunState, a: Act, lay: () => boolean, x: string, y: string): boolean {
    if (!lay()) return false;
    if (a !== silent) return true;
    const online = new Set(combatPreview(s).online);
    for (const id of [x, y]) {
      const node = s.topology.nodes.find(n => n.id === id);
      if (!node || node.fixed || online.has(id)) continue;
      const end = ["alpha", "omega"].find(e => canLink(s.topology, id, e) && ![x, y].includes(e));
      if (end) { pending.set(s, [[end === "alpha" ? "alpha" : id, end === "alpha" ? id : "omega"]]); break; }
    }
    return true;
  }
  /** Cable candidates: a terminal and any device, or two devices one of which is off every route
   * (or two routers, for a second channel). */
  function cablePairs(r: RunState, p: CombatPreview): [string, string][] {
    const devices = r.topology.nodes.filter(n => !n.fixed && n.role !== "phantom" && n.role !== "rack");
    const online = new Set(p.online);
    const pairs: [string, string][] = [];
    for (const d of devices) {
      // A terminal cable to a device already on a route only adds a shortcut, unless it is a router
      // (a second channel through it).
      if (online.has(d.id) && d.role !== "router") continue;
      if (canLink(r.topology, "alpha", d.id)) pairs.push(["alpha", d.id]);
      if (canLink(r.topology, d.id, "omega")) pairs.push([d.id, "omega"]);
    }
    for (let i = 0; i < devices.length; i++)
      for (let j = i + 1; j < devices.length; j++) {
        const a = devices[i], b = devices[j];
        if (a.role === "honeypot" || b.role === "honeypot") continue;
        if ((online.has(a.id) && online.has(b.id)) && !(a.role === "router" && b.role === "router")) continue;
        if (canLink(r.topology, a.id, b.id)) pairs.push([a.id, b.id]);
      }
    return pairs;
  }
  function plansFor(r: RunState, p: CombatPreview, pairs: [string, string][]): Plan[] {
    const plans: Plan[] = [];
    const seen = new Set<CardId>();
    const slots = r.protocols.length < protocolLimit(r);
    r.hand.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      const card = CARDS[id];
      if (!card || card.unplayable || card.curse || card.target === "junk" || !affordable(r, i)) return;
      switch (card.target) {
        case "instant": plans.push(cardPlan(id, (s, a, k) => a.instant(s, k).ok)); break;
        case "daemon": plans.push(cardPlan(id, (s, a, k) => a.daemon(s, k).ok)); break;
        case "protocol": if (slots) plans.push(cardPlan(id, (s, a, k) => a.protocol(s, k).ok)); break;
        case "zone": for (const zone of ZONES) plans.push(cardPlan(id, (s, a, k) => a.zone(s, k, zone).ok)); break;
        case "node":
          for (const node of r.topology.nodes) if (!node.fixed && canTargetNode(r, i, node.id)) plans.push(cardPlan(id, (s, a, k) => a.node(s, k, node.id).ok));
          break;
        case "link": for (const [x, y] of pairs) plans.push(cardPlan(id, (s, a, k) => linkAndNote(s, a, () => a.link(s, k, x, y).ok, x, y))); break;
        case "ground": plans.push(...groundPlans(r, p, id)); break;
      }
    });
    const console = consoleState(r);
    if (console.usable) {
      if (console.id === "patch") for (const [x, y] of pairs) plans.push({ group: "console", tier: 1, exec: (s, a) => linkAndNote(s, a, () => a.console(s, x, y).ok, x, y) });
      else if (console.id === "harden") plans.push({ group: "console", tier: 2, exec: (s, a) => a.console(s).ok });
      else if (!r.buffering && p.signalPath.length && !livingEnemies(r).some(enemy => enemy.id === "leech")) plans.push({ group: "console", tier: 1, exec: (s, a) => a.console(s).ok });
    }
    // Separated circuits: step a centred router to the empty outer band.
    if (p.channels >= 2 && !p.shieldTerms.some(t => t.label.startsWith("Separated")) && r.energy >= RULES.relocateCost) {
      const centered = routers(r).find(n => zoneForNode(n) === "center");
      const north = routers(r).some(n => zoneForNode(n) === "north");
      const spot = centered && socketNear(r, north ? "south" : "north");
      if (centered && spot) plans.push({ group: "move", tier: 1, exec: (s, a) => a.move(s, centered.id, spot.x, spot.z).ok });
    }
    return plans;
  }
  /** Scores every plan on a copy of the run. A device whose cables cannot all be paid this turn is
   * valued as completed next turn: its lasting value from one turn later, minus the energy the
   * missing cables will cost. */
  function scorePlans(r: RunState, plans: Plan[], before: Snap, future: number): Scored[] {
    const scored: Scored[] = [];
    for (const plan of plans) {
      const copy = fastClone(r);
      if (!plan.exec(copy, silent)) continue;
      const sig = signature(copy);
      const after = snap(copy, sig === before.sig ? before.base : undefined, sig);
      const cost = r.energy - copy.energy;
      let value = valueOf(r, before, copy, after, future);
      const missing = pending.get(copy);
      if (missing) {
        const done = fastClone(copy);
        for (const [x, y] of missing) if (canLink(done.topology, x, y)) done.topology.links.push({ a: x, b: y });
        value += Math.max(0, future - W.decay) * lasting(after.base, baseline(done)) - W.energy * missing.length;
      }
      scored.push({ plan, value, cost, lethal: after.p.lethal && !before.p.lethal });
    }
    return scored;
  }
  /** The best set of plans for the energy (and the Kernel Panic limit), one per group; returns
   * the member to play now. */
  function choose(r: RunState, scored: Scored[], turnsLeft: number): Scored | null {
    const best = new Map<string, Scored>();
    for (const entry of scored) {
      const floor = entry.cost > 0 ? 0.6 : 0.25;
      if (entry.value <= floor && !entry.lethal) continue;
      if (entry.plan.retain && !entry.lethal && entry.value < RETAIN_MIN + 2 * turnsLeft) continue;
      const held = best.get(entry.plan.group);
      if (!held || entry.value > held.value) best.set(entry.plan.group, entry);
    }
    const items = [...best.values()].sort((a, b) => b.value - a.value).slice(0, 12);
    if (!items.length) return null;
    const lethal = items.find(item => item.lethal && item.cost <= r.energy);
    if (lethal) return lethal;
    const plays = playLimit(r).limit - r.cardsPlayed;
    let bestSet = 0, bestValue = -Infinity;
    for (let mask = 1; mask < 1 << items.length; mask++) {
      let cost = 0, value = 0, count = 0;
      for (let i = 0; i < items.length; i++) if (mask & (1 << i)) { cost += items[i].cost; value += items[i].value; if (items[i].plan.card) count++; }
      if (cost > r.energy || count > plays) continue;
      if (value > bestValue) { bestValue = value; bestSet = mask; }
    }
    const chosen = items.filter((_, i) => bestSet & (1 << i));
    if (!chosen.length) return null;
    const ratio = (item: Scored) => item.cost <= 0 ? item.value * 4 : item.value / item.cost;
    return chosen.sort((a, b) => a.plan.tier - b.plan.tier || ratio(b) - ratio(a))[0];
  }
  /** Cable pairs worth trying: every candidate with the cheapest plain link card, then the best
   * few (the other link cards and the Patch Cable console only try those). */
  function topPairs(r: RunState, p: CombatPreview, before: Snap, future: number): [string, string][] {
    // Only cables that put a device on a route or add a channel (the network analysis alone says so).
    const now = analyze(r, r.faultNodes, r.faultLinks, true);
    const pairs = cablePairs(r, p).filter(([x, y]) => {
      const links = r.topology.links;
      const trial = { ...r, topology: { nodes: r.topology.nodes, links: [...links, { a: x, b: y }] } } as RunState;
      const after = analyze(trial, r.faultNodes, r.faultLinks, true);
      if (after.online.size > now.online.size || after.channelCount > now.channelCount) return true;
      // Half a route: a terminal and an offline device that could take the other terminal next.
      const device = x === "alpha" ? y : y === "omega" ? x : null;
      const other = x === "alpha" ? "omega" : "alpha";
      return !!device && !now.online.has(device) && canLink(r.topology, device, other) && r.topology.nodes.some(n => n.id === device && n.role === "router");
    });
    if (pairs.length <= 3) return pairs;
    const links = linkCards(r).sort((i, j) => costFor(r, i) - costFor(r, j) || linkOrder(r.hand[i]) - linkOrder(r.hand[j]));
    const probe = links[0] !== undefined ? r.hand[links[0]] : null;
    const tryPair = (x: string, y: string): Plan => probe
      ? cardPlan(probe, (s, a, k) => a.link(s, k, x, y).ok)
      : { group: "console", tier: 1, exec: (s, a) => a.console(s, x, y).ok };
    if (!probe && !patchAvailable(r)) return [];
    const scored = pairs.map(pair => ({ pair, value: scorePlans(r, [tryPair(pair[0], pair[1])], before, future)[0]?.value ?? -Infinity }));
    return scored.sort((a, b) => b.value - a.value).slice(0, 3).map(entry => entry.pair);
  }
  /** The best plan value each hand card reached in the last evaluation (prepareBest keeps the card
   * the energy could not pay for). */
  let lastValues = new Map<CardId, number>();
  /** One tactical play from the evaluator (true when it acted). */
  function tacticalPlay(r: RunState): boolean {
    const p = combatPreview(r);
    const base = baseline(r);
    const before: Snap = { p, outlook: outlook(r, p), stored: stored(r, p), base, sig: signature(r) };
    const future = futureOf(r, base);
    const plans = plansFor(r, p, topPairs(r, p, before, future.weight));
    if (!plans.length) return false;
    const scored = scorePlans(r, plans, before, future.weight);
    lastValues = new Map();
    for (const entry of scored) if (entry.plan.card) lastValues.set(entry.plan.card, Math.max(lastValues.get(entry.plan.card) ?? -Infinity, entry.value));
    const pick = choose(r, scored, future.turns);
    return !!pick && pick.plan.exec(r, act);
  }
  /** Best card to hold for the next turn: a burst or block for the ultimate, else the costliest
   * non-basic card (it replaces one draw). */
  function prepareBest(r: RunState) {
    if (r.preparedCard) return;
    const lead = leaderOf(r);
    const upcoming = lead ? intentFor(r, lead, 1) : null;
    const preferred: BaseCardId[] = upcoming?.kind === "sever" || upcoming?.kind === "jam"
      ? ["failover-policy", "port-security", "patch", "reroute", "guard", "pulse"]
      : ["zero-day", "barrier", "stand-firm", "brace", "fork-bomb", "guard", "pulse", "surge"];
    // The card the evaluator valued most that the energy could not pay for (a Retain card keeps itself).
    const held = r.hand.map((id, i) => ({ i, value: CARDS[id].retain ? -Infinity : lastValues.get(id) ?? -Infinity })).sort((a, b) => b.value - a.value)[0];
    let index = held && held.value >= 3 ? held.i : r.hand.findIndex(id => preferred.includes(baseCard(id)));
    if (index < 0) {
      const rank = (id: CardId) => CARDS[id].curse || CARDS[id].junk || CARDS[id].retain || CARDS[id].token || CARDS[id].rarity === "basic" ? -1 : CARDS[id].cost + ({ rare: 3, uncommon: 2, common: 1 } as Record<string, number>)[CARDS[id].rarity];
      const ranked = r.hand.map((id, i) => ({ i, rank: rank(id) })).filter(entry => entry.rank >= 0).sort((a, b) => b.rank - a.rank);
      index = ranked[0]?.i ?? -1;
    }
    if (index >= 0) act.prepare(r, index);
  }
  /** Routers that link themselves (Standby Router) first, then jam-proof ones. */
  function routerCard(r: RunState): number {
    const ranked = r.hand.map((id, i) => ({ id, i })).filter(({ id, i }) => CARDS[id].role === "router" && CARDS[id].target === "ground" && affordable(r, i))
      .sort((a, b) => (CARDS[b.id].values.links ?? 0) - (CARDS[a.id].values.links ?? 0) || Number(!!CARDS[b.id].jamProof) - Number(!!CARDS[a.id].jamProof));
    return ranked[0]?.i ?? -1;
  }

  function tacticalTurn(r: RunState) {
    retarget(r);
    let retargetedToBreak = false;
    for (let step = 0; step < 120; step++) {
      const p = combatPreview(r);
      if (p.lethal) return;
      // ---- the opener: ALPHA → router → OMEGA.
      if (!p.signalPath.length) {
        let router = routers(r).find(n => !r.faultNodes.includes(n.id));
        if (!router) {
          const index = routerCard(r);
          const socket = socketNear(r, "center") ?? socketNear(r);
          if (index >= 0 && socket && act.ground(r, index, socket.x, socket.z).ok) continue;
          if (instant(r, "containerlab", "rebuild")) continue;
        }
        // Cable the terminal an unjammed router lacks (a cut cable needs a Hot Patch instead).
        const open = routers(r).filter(n => !r.faultNodes.includes(n.id))
          .map(n => ({ n, ends: ["alpha", "omega"].filter(e => canLink(r.topology, n.id, e)) }))
          .filter(entry => entry.ends.length).sort((a, b) => a.ends.length - b.ends.length)[0];
        if (open && cableCapacity(r) >= open.ends.length && cable(r, open.n.id, open.ends[0])) continue;
        // A broken route is the whole damage plan.
        if ((r.faultNodes.length || r.faultLinks.length) && instant(r, "reroute", "patch", "protocol")) continue;
        if (open && cable(r, open.n.id, open.ends[0])) continue;
      }
      // A jam or cut that lingers on a second channel is worth a Hot Patch when it restores damage
      // or a channel (the forecast says so).
      if (r.faultNodes.length || r.faultLinks.length) {
        const index = indexOf(r, ["reroute", "patch", "protocol"]);
        if (index >= 0) {
          const copy = structuredClone(r);
          const after = rules.playInstant(copy, index).ok ? combatPreview(copy) : null;
          if (after && (after.channels > p.channels || after.packetDamage >= p.packetDamage + 3) && act.instant(r, index).ok) continue;
        }
      }
      const worm = r.hand.findIndex((id, i) => baseCard(id) === "worm" && affordable(r, i));
      if (worm >= 0 && act.junk(r, worm).ok) continue;
      if (p.signalPath.length && maintain(r, p)) continue;
      // ---- guardian windows: save an answer for the ultimate, then break it.
      if (p.intent?.kind === "charge" && !r.preparedCard && p.incoming < r.integrity) {
        const answer = r.hand.findIndex(id => ["zero-day", "pulse", "mirror", "ecmp", "barrier", "guard", "stand-firm", "fork-bomb", "perimeter", "packet-storm"].includes(baseCard(id)));
        if (answer >= 0 && act.prepare(r, answer).ok) continue;
      }
      if (guardianOf(r) && p.intent?.ultimate && !p.interrupted && p.packetDamage) {
        const index = breakingCard(r, true);
        if (index >= 0 && act.instant(r, index).ok) { retarget(r); continue; }
        if (index === -2 && !retargetedToBreak) { retargetedToBreak = true; retarget(r); continue; }
      }
      // The Ghost's charge turn buffers (and feeds the buffer) so the release breaks the ultimate
      // through the adds (worked example 11.5 C).
      if (r.archetype === "ghost" && guardianOf(r) && p.intent?.kind === "charge" && p.signalPath.length) {
        if (!r.buffering && consoleState(r).usable) {
          const copy = structuredClone(r);
          rules.useConsole(copy);
          if (!combatPreview(copy).bufferAtRisk && p.incoming < r.integrity - 2 && act.console(r).ok) continue;
        }
      }
      // Storm dodging: step the device a banded jam aims at out of its band.
      const lead = leaderOf(r);
      if (lead && ENEMIES[lead.id].jamBands && p.intent?.kind === "jam" && p.hazardZone && p.faultTarget && r.energy > 0) {
        const endangered = r.topology.nodes.find(n => n.id === p.faultTarget);
        const safe = SOCKETS.find(s => zoneForNode(s) !== p.hazardZone && !isBlocked(r, s.x, s.z, endangered?.id));
        if (endangered && zoneForNode(endangered) === p.hazardZone && safe && act.move(r, endangered.id, safe.x, safe.z).ok) continue;
      }
      if (tacticalPlay(r)) { retarget(r); continue; }
      retarget(r);
      if (combatPreview(r).lethal) return;
      prepareBest(r);
      return;
    }
    throw new Error(`Action limit exceeded: ${JSON.stringify({ seed: r.seed, stage: r.stage, enemies: r.enemies.map(e => e.id), energy: r.energy, hand: r.hand })}`);
  }

  // ---------------------------------------------------------------- the v4 line (other policies)

  function turn(r: RunState, policy: Policy) {
    const defensive = policy === "adaptive" || policy === "tactical";
    const archetype = r.archetype;
    const jammed = (id: string) => r.faultNodes.includes(id);
    const leader = () => leaderOf(r);
    const tactical = policy === "tactical";
    if (tactical) retarget(r);
    let retargetedToBreak = false;
    for (let action = 0; action < 60; action++) {
      const p = combatPreview(r);
      if (p.lethal) return;
      // ---- the opener: every policy builds ALPHA → router → OMEGA.
      if (!p.signalPath.length) {
        let router = routers(r).find(n => !jammed(n.id));
        if (!router) {
          const index = r.hand.findIndex((id, i) => CARDS[id].role === "router" && CARDS[id].target === "ground" && affordable(r, i));
          const socket = socketNear(r, "center") ?? socketNear(r);
          if (index >= 0 && socket && act.ground(r, index, socket.x, socket.z).ok) continue;
          if (instant(r, "containerlab", "rebuild")) continue;
        }
        router = routers(r).find(n => !jammed(n.id));
        if (router && !r.faultLinks.length && !r.faultNodes.length) {
          const end = ["alpha", "omega"].find(e => canLink(r.topology, router!.id, e));
          if (end && cable(r, router.id, end)) continue;
        }
      }
      if (policy === "careless") return;
      // ---- repair a broken route first: it is the whole damage plan.
      if (!p.signalPath.length && (r.faultNodes.length || r.faultLinks.length) && instant(r, "reroute", "patch", "protocol")) continue;
      // Tactical: a jam or cut that lingers on a second channel is worth a Hot Patch when it
      // restores damage or a channel (the forecast says so).
      if (tactical && (r.faultNodes.length || r.faultLinks.length)) {
        const index = indexOf(r, ["reroute", "patch", "protocol"]);
        if (index >= 0) {
          const copy = structuredClone(r);
          const after = rules.playInstant(copy, index).ok ? combatPreview(copy) : null;
          if (after && (after.channels > p.channels || after.packetDamage >= p.packetDamage + 3) && act.instant(r, index).ok) continue;
        }
      }
      // ---- housekeeping: delete worms, scrub the most dangerous installation, repair the route.
      const worm = r.hand.findIndex((id, i) => baseCard(id) === "worm" && affordable(r, i));
      if (worm >= 0 && act.junk(r, worm).ok) continue;
      if (tactical) {
        if (p.signalPath.length && maintain(r, p)) continue;
      } else {
        const danger = mostDangerous(r);
        if (danger && p.signalPath.length && r.energy >= scrubCost(r) && (danger.integrity === 1 || r.energy >= scrubCost(r) + 2) && act.scrub(r, danger.id).ok) continue;
        const worn = r.topology.nodes.find(n => p.signalPath.includes(n.id) && !n.fixed && conditionOf(n) <= 1);
        if (worn && r.energy >= repairCost(r) && act.repair(r, worn.id).ok) continue;
      }
      // ---- danger first: never build while the visible hit is lethal.
      if (p.incoming >= r.integrity && defend(r)) continue;
      // ---- guardian windows: save an answer for the ultimate, then break it.
      if (policy === "tactical" && p.intent?.kind === "charge" && !r.preparedCard && p.incoming < r.integrity) {
        const answer = r.hand.findIndex(id => ["zero-day", "pulse", "mirror", "ecmp", "barrier", "guard"].includes(baseCard(id)));
        if (answer >= 0 && act.prepare(r, answer).ok) continue;
      }
      // Tactical: break the ultimate only when a burst sequence reaches it; otherwise brace.
      if (tactical && guardianOf(r) && p.intent?.ultimate && !p.interrupted && p.packetDamage) {
        const index = breakingCard(r);
        if (index >= 0 && act.instant(r, index).ok) { retarget(r); continue; }
        if (index === -2 && !retargetedToBreak) { retargetedToBreak = true; retarget(r); continue; }
      }
      // Tactical Ghost: the charge turn buffers (and feeds the buffer) so the release breaks the
      // ultimate through the adds (worked example 11.5 C).
      if (tactical && archetype === "ghost" && guardianOf(r) && p.intent?.kind === "charge" && p.signalPath.length) {
        if (!r.buffering && consoleState(r).usable) {
          const copy = structuredClone(r);
          rules.useConsole(copy);
          if (!combatPreview(copy).bufferAtRisk && p.incoming < r.integrity - 2 && act.console(r).ok) continue;
        }
        if (r.buffering && instant(r, "store-forward")) continue;
      }
      if (defensive && !tactical && p.intent?.ultimate && !p.interrupted && p.packetDamage) {
        const burst = r.hand.findIndex((id, i) => {
          if (!["zero-day", "pulse", "mirror", "ecmp", "store-forward", "replay-attack"].includes(baseCard(id)) || !affordable(r, i)) return false;
          const copy = structuredClone(r);
          return rules.playInstant(copy, i).ok && combatPreview(copy).packetDamage > p.packetDamage;
        });
        if (burst >= 0 && act.instant(r, burst).ok) continue;
      }
      // ---- protocols: arm what the visible intent (or the next one) will trigger.
      const lead = leader();
      const next = lead ? intentFor(r, lead, 1) : null;
      const protocol = r.hand.findIndex((id, i) => {
        if (CARDS[id].target !== "protocol" || !affordable(r, i) || r.protocols.length >= protocolLimit(r)) return false;
        const trigger = TRIGGERS[CARDS[id].protocol!];
        const copy = structuredClone(r);
        if (!rules.playProtocol(copy, i).ok) return false;
        const after = combatPreview(copy);
        if (after.protocolTriggers.some(t => t.card === id)) return after.incoming < p.incoming || after.enemyDamage > p.enemyDamage || after.faultTarget !== p.faultTarget || after.zoneThreat !== p.zoneThreat;
        return r.energy - costFor(r, i) >= 2 && !!next && trigger(next.kind, !!next.ultimate, !!next.field) && !r.protocols.some(armed => CARDS[armed].protocol === CARDS[id].protocol);
      });
      if (protocol >= 0 && act.protocol(r, protocol).ok) continue;
      // ---- fields: evaluate with the same forecast as the player.
      const fieldOptions = r.hand.flatMap((id, index) => CARDS[id].target === "zone" && affordable(r, index) ? ZONES.map(zone => {
        const copy = structuredClone(r);
        const result = rules.playZone(copy, index, zone);
        const after = combatPreview(copy);
        const benefit = result.ok ? after.packetDamage - p.packetDamage + (defensive ? (p.incoming - after.incoming) * 2 : 0) + (r.installations.length - copy.installations.length) * 3 : -1;
        return { index, zone, benefit };
      }) : []).sort((a, b) => b.benefit - a.benefit);
      if (fieldOptions[0]?.benefit > 0 && act.zone(r, fieldOptions[0].index, fieldOptions[0].zone).ok) continue;
      // ---- draw and energy.
      if ((r.energy <= 3 || (policy === "tactical" && (p.intent?.ultimate || p.incoming >= r.integrity))) && r.hand.length <= 8 && instant(r, "surge")) continue;
      if (r.hand.length <= 7 && instant(r, "inspect")) continue;
      if (r.maxIntegrity - r.integrity >= 3 && instant(r, "emergency")) continue;
      // ---- width first: another channel is permanent damage, armor and redundancy.
      const target = archetype === "architect" ? 4 : 2;
      if (p.channels < target && p.signalPath.length && (buildChannel(r, p) || instant(r, "containerlab", "rebuild"))) continue;
      // ---- engine devices: power and cache pay for everything else.
      const insertable: BaseCardId[] = ["poe-injector", "cache-server", "load-balancer"];
      const firewalls = p.online.filter(id => r.topology.nodes.find(n => n.id === id)?.role === "firewall").length;
      const wantsFirewall = defensive && (archetype === "warden" ? firewalls < 3 : firewalls < 1 && (!!lead && ENEMIES[lead.id].armor?.bypass === "firewall" || r.stage > 0));
      if (wantsFirewall) insertable.unshift("stateful-firewall", "sentry-firewall", "bastion", "firewall");
      if (insertDevice(r, insertable, p)) continue;
      if (p.channels < 2 && p.signalPath.length) {
        const router = primaryRouter(r, p);
        if (router && nodeCard(r, "clabernetes", router.id)) continue;
        if (instant(r, "rebuild")) continue;
      }
      if (p.channels >= 2 && instant(r, "mirror")) continue;
      if (p.channels >= 2 && instant(r, "ecmp")) continue;
      // ---- separated circuits and storm dodging.
      if (defensive && p.channels >= 2 && !p.shieldTerms.some(t => t.label.startsWith("Separated")) && r.energy > 1) {
        const centered = routers(r).find(n => zoneForNode(n) === "center");
        const north = routers(r).some(n => zoneForNode(n) === "north");
        const spot = centered && socketNear(r, north ? "south" : "north");
        if (centered && spot && act.move(r, centered.id, spot.x, spot.z).ok) continue;
      }
      if (defensive && lead && ENEMIES[lead.id].jamBands && p.intent?.kind === "jam" && p.hazardZone && p.faultTarget && r.energy > 0) {
        const endangered = r.topology.nodes.find(n => n.id === p.faultTarget);
        const safe = SOCKETS.find(s => zoneForNode(s) !== p.hazardZone && !isBlocked(r, s.x, s.z, endangered?.id));
        if (endangered && zoneForNode(endangered) === p.hazardZone && safe && act.move(r, endangered.id, safe.x, safe.z).ok) continue;
      }
      // ---- honeypot when disruption is coming.
      const disruption = [p.intent?.kind, next?.kind].some(kind => kind === "jam" || kind === "overload" || (kind === "sever" && lead?.id !== "wraith"));
      if (disruption && !r.topology.nodes.some(n => n.role === "honeypot") && cableCapacity(r) >= 1) {
        const index = indexOf(r, ["honeypot"]);
        const spot = socketNear(r);
        if (index >= 0 && spot && act.ground(r, index, spot.x, spot.z).ok) {
          const pot = r.topology.nodes[r.topology.nodes.length - 1];
          cable(r, pot.id, "alpha");
          continue;
        }
      }
      // ---- defense against the visible hit.
      if (p.incoming > 0 && defensive && defend(r)) continue;
      // ---- permanent upgrades on the primary route.
      const router = primaryRouter(r, p);
      if (router && !router.configured && nodeCard(r, "startup-config", router.id)) continue;
      if (router && !router.upgraded && nodeCard(r, "firmware", router.id)) continue;
      const amplifier = r.topology.nodes.find(n => n.role === "switch" && !n.amplified && p.signalPath.includes(n.id));
      if (amplifier && nodeCard(r, "compression", amplifier.id)) continue;
      // ---- switches deepen the primary route.
      if (insertDevice(r, ["relay", "switch", "linux-bridge", "spine-leaf"], p, true)) continue;
      // ---- burst and engines.
      if (p.signalPath.length && r.hand.length <= 8 && instant(r, "wireshark")) continue;
      if (r.backpressure >= 4 && instant(r, "reflect")) continue;
      if (r.buffer >= 6 && instant(r, "replay-attack")) continue;
      if (archetype === "ghost" && instant(r, "store-forward")) continue;
      if (p.signalPath.length && !r.buffering && instant(r, "zero-day", "pulse")) continue;
      if (r.energy >= 2 && r.hand.length <= 5 && instant(r, "diagnostic")) continue;
      if (router && !router.shielded && p.intent?.kind === "jam" && p.faultTarget === router.id && nodeCard(r, "shield", router.id)) continue;
      if (p.incoming > 0 && instant(r, "guard", "protocol", "barrier")) continue;
      if (instant(r, "capacitor")) continue;
      // ---- Warden: spare energy hardens (feeds Backpressure).
      if (archetype === "warden" && consoleState(r).usable && (p.incomingRaw > p.shield) && act.console(r).ok) continue;
      // ---- Ghost: buffer when the stored packets are safe and the hit is not needed now.
      if (archetype === "ghost" && policy !== "aggressive" && !r.buffering && !r.buffer && p.signalPath.length && consoleState(r).usable && lead?.id !== "leech") {
        const copy = structuredClone(r);
        rules.useConsole(copy);
        const stored = combatPreview(copy);
        const soon = p.intent?.kind === "charge" || (lead?.hp ?? 0) > p.packetDamage * 3;
        if (!stored.bufferAtRisk && soon && p.incoming < r.integrity - 2 && act.console(r).ok) continue;
      }
      if (tactical) {
        // Width-independent v4 instants: play one when its forecast outlook gains enough.
        if (playBestInstant(r)) continue;
        retarget(r);
        if (combatPreview(r).lethal) return;
      }
      if (policy === "tactical" && !r.preparedCard) {
        const upcoming = lead ? intentFor(r, lead, 1) : null;
        const preferred: BaseCardId[] = upcoming?.kind === "sever" || upcoming?.kind === "jam"
          ? ["failover-policy", "port-security", "patch", "reroute", "guard", "pulse"]
          : ["barrier", "guard", "pulse", "zero-day", "surge"];
        const card = r.hand.findIndex(id => preferred.includes(baseCard(id)));
        if (card >= 0) act.prepare(r, card);
      }
      return;
    }
    throw new Error(`Action limit exceeded: ${JSON.stringify({ policy, seed: r.seed, stage: r.stage, enemies: r.enemies, energy: r.energy, hand: r.hand })}`);
  }

  /** One defensive play against the forecast hit, cheapest sufficient first. */
  function defend(r: RunState): boolean {
    if (r.archetype === "warden" && consoleState(r).usable && act.console(r).ok) return true;
    const protocol = r.hand.findIndex((id, i) => {
      if (CARDS[id].target !== "protocol" || !affordable(r, i) || r.protocols.length >= protocolLimit(r)) return false;
      const copy = structuredClone(r);
      return rules.playProtocol(copy, i).ok && combatPreview(copy).incoming < combatPreview(r).incoming;
    });
    if (protocol >= 0 && act.protocol(r, protocol).ok) return true;
    return instant(r, "deep-inspection", "guard", "barrier", "bulkhead", "quorum", "capacitor", "protocol", "reroute", "emergency", "mirror", "field-repair");
  }
  /** Places a device next to a routed router and cables it into a route. */
  function insertDevice(r: RunState, ids: BaseCardId[], p: rules.CombatPreview, onPrimary = false): boolean {
    const router = primaryRouter(r, p);
    if (!router || r.topology.nodes.length >= 13) return false;
    for (const id of ids) {
      const index = indexOf(r, [id]);
      if (index < 0) continue;
      const auto = id === "linux-bridge" || id === "spine-leaf";
      const needed = auto ? 1 : 2;
      if (cableCapacity(r) < needed || r.energy < costFor(r, index) + needed) continue;
      const spot = SOCKETS.filter(s => !isBlocked(r, s.x, s.z))
        .sort((a, b) => Math.hypot(a.x - router.x + 1.6, a.z - router.z) - Math.hypot(b.x - router.x + 1.6, b.z - router.z))[0];
      if (!spot) return false;
      if (!act.ground(r, index, spot.x, spot.z).ok) continue;
      const placed = r.topology.nodes[r.topology.nodes.length - 1];
      if (!auto) cable(r, placed.id, router.id);
      cable(r, "alpha", placed.id);
      if (onPrimary && !combatPreview(r).signalPath.includes(placed.id)) cable(r, placed.id, "omega");
      return true;
    }
    return false;
  }
  /** A fresh router in the least-used band, cabled to both terminals. */
  function buildChannel(r: RunState, p: rules.CombatPreview): boolean {
    if (cableCapacity(r) < 2) return false;
    const index = r.hand.findIndex((id, i) => CARDS[id].role === "router" && CARDS[id].target === "ground" && affordable(r, i));
    if (index < 0 || r.energy < costFor(r, index) + 2) return false;
    const used = new Set(routers(r).map(zoneForNode));
    const band = (["north", "south", "center"] as Zone[]).find(zone => !used.has(zone));
    const spot = socketNear(r, band) ?? socketNear(r);
    if (!spot || !act.ground(r, index, spot.x, spot.z).ok) return false;
    const placed = r.topology.nodes[r.topology.nodes.length - 1];
    cable(r, "alpha", placed.id);
    cable(r, placed.id, "omega");
    void p;
    return true;
  }

  if (policy === "tactical") tacticalTurn(run);
  else turn(run, policy);
}
