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
 *   when that lowers the threshold), otherwise braces. Older policies are unchanged. */
import { CARDS, baseCard } from "../src/core/cards.ts";
import { AVERAGE_SINGLE_THREAT, ENEMIES, ESCORT_THREAT } from "../src/core/enemies.ts";
import { AUTO_SOCKETS } from "../src/core/combat/board.ts";
import { canLink } from "../src/core/graph.ts";
import * as rules from "../src/core/run.ts";
import { ZONES, PORTS, RULES, costFor, combatPreview, zoneForNode, intentFor, consoleState, isBlocked, leaderOf, mostDangerous, scrubCost, repairCost, conditionOf, maxConditionOf, livingEnemies } from "../src/core/run.ts";
import type { CombatPreview } from "../src/core/run.ts";
import type { BaseCardId, CardId, Enemy, Installation, Port, RunState, Zone } from "../src/core/types.ts";
import { chooseOffer } from "../src/core/encounter.ts";

/** Answers every waiting offer with a fixed priority: a message purges when a CVE sits in the
 * deck, restores when integrity is at 60 % or less, else takes maximum integrity, credits,
 * the restore, a card for this encounter, a purge; a crate card choice takes the card its
 * keeper's reward priorities rank higher. */
export function resolveOffers(run: RunState, onChoice?: (kind: string, id: string) => void) {
  for (let guard = 0; run.offers.length && guard < 10; guard++) {
    const offer = run.offers[0];
    let index = 0;
    if (offer.kind === "message") {
      const low = run.integrity <= run.maxIntegrity * 0.6 && run.maxIntegrity - run.integrity >= RULES.messageRestore;
      const cursed = run.deck.includes("cve");
      const order = [...(cursed ? ["purge"] : []), ...(low ? ["restore"] : []), "reinforce", "credit", "restore", "recover", "purge"];
      index = Math.max(0, offer.options.map(option => order.indexOf(option.id)).reduce((best, rank, i, ranks) => rank < ranks[best] ? i : best, 0));
    } else {
      const rank = (id: CardId) => { const at = PRIORITIES[run.archetype].indexOf(baseCard(id) as CardId); return at < 0 ? 99 : at; };
      index = offer.cards.reduce((best, id, i) => rank(id) < rank(offer.cards[best]) ? i : best, 0);
    }
    const chosen = offer.kind === "message" ? offer.options[index]?.id : offer.cards[index];
    if (chooseOffer(run, index).ok) { if (chosen) onChoice?.(offer.kind, chosen); } else run.offers.shift();
  }
}
export type Policy = "careless" | "adaptive" | "aggressive" | "tactical";
/** Balance-probe switches (deterministic): the kill-order rule the tactical line follows. */
export interface BotOptions { killOrder: "threat" | "leader" }
const options: BotOptions = { killOrder: "threat" };
export function setBotOptions(next: Partial<BotOptions>) { Object.assign(options, next); }
/** Every command the bot issues. `card` names the card an index-based play used; `purpose`
 * marks maintenance (scrubs, repairs, moves out of reach) for the probe's energy share. */
export type BotAction = (
  | { kind: "instant" | "prepare" | "protocol" | "junk"; index: number }
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

/** Reward priorities that let each engine come online (base ids, best first). */
export const PRIORITIES: Record<RunState["archetype"], CardId[]> = {
  architect: ["rebuild", "hardened-router", "clabernetes", "containerlab", "load-balancer", "poe-injector", "ecmp", "cache-server", "spine-leaf", "failover-policy", "rate-limiter", "barrier", "guard", "firewall", "vxlan", "conduit", "duplex", "armored-fiber"],
  warden: ["stateful-firewall", "poe-injector", "duplex", "ips-signature", "rate-limiter", "deep-inspection", "bulkhead", "reflect", "sentry-firewall", "bastion", "firewall", "cache-server", "barrier", "quorum", "failover-policy", "hardened-router", "startup-config", "guard", "zero-day"],
  ghost: ["store-forward", "poe-injector", "rate-limiter", "barrier", "replay-attack", "zero-day", "failover-policy", "cache-server", "ips-signature", "hardened-router", "rebuild", "guard", "pulse", "surge", "dark-fiber", "firmware", "startup-config"],
};
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

export function playBotTurn(run: RunState, policy: Policy, observe?: (action: BotAction) => void) {
  resolveOffers(run);
  const record = (action: BotAction, result: rules.ActionResult) => { if (result.ok) observe?.(action); return result; };
  const act = {
    instant: (r: RunState, index: number, installation?: string) => { const card = r.hand[index]; return record({ kind: "instant", index, card }, rules.playInstant(r, index, installation)); },
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
   * phase takes from you. Every number is the forecast's. */
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
      const needed = wearOn(p, node.id) - conditionOf(node) + 1;
      if (needed <= maxConditionOf(node) - conditionOf(node) && needed * repairCost(r) <= r.energy && act.repair(r, node.id).ok) return true;
    }
    // Scrub or demolish by value per energy: charges, then Jammers, Spikes, Taps.
    const scored = r.installations.map(item => {
      const effect = p.installationEffects.find(e => e.id === item.id);
      const lands = !!effect && effect.effect !== "idle" && !effect.decoyed && !effect.absorbed && !effect.cancelled && !effect.destroyed;
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
   * (greedy on copies, targeting included), or -1. */
  function breakingCard(r: RunState): number {
    const trial = structuredClone(r);
    retarget(trial, false);
    if (combatPreview(trial).interrupted) return -2;
    let first = -1;
    let state = trial;
    for (let step = 0; step < 4; step++) {
      let bestState: RunState | null = null, bestIndex = -1, bestHit = -Infinity;
      state.hand.forEach((id, i) => {
        if (!BURSTS.includes(baseCard(id)) || costFor(state, i) > state.energy) return;
        const copy = structuredClone(state);
        if (!rules.playInstant(copy, i).ok) return;
        retarget(copy, false);
        const after = combatPreview(copy);
        const guardian = guardianOf(copy);
        const hit = after.interrupted ? Infinity : guardian ? after.ports[guardian.port]?.packet ?? 0 : 0;
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
        if (CARDS[id].target !== "protocol" || !affordable(r, i) || r.protocols.length >= 2) return false;
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
      if (CARDS[id].target !== "protocol" || !affordable(r, i)) return false;
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

  turn(run, policy);
}
