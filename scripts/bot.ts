/** Shared deterministic QA player. It only makes decisions from visible cards,
 * board state and intent; its optional command stream drives browser playthroughs.
 * v3: builds width, arms protocols against visible intents, uses the archetype
 * console (Patch Cable / Harden / Buffer), scrubs malware and deletes worms. */
import { CARDS, baseCard } from "../src/core/cards.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { canLink } from "../src/core/graph.ts";
import * as rules from "../src/core/run.ts";
import { ZONES, costFor, combatPreview, zoneForNode, intentFor, consoleState, isBlocked } from "../src/core/run.ts";
import type { BaseCardId, CardId, RunState, Zone } from "../src/core/types.ts";
export type Policy = "careless" | "adaptive" | "aggressive" | "tactical";
export type BotAction =
  | { kind: "instant" | "prepare" | "protocol" | "junk"; index: number }
  | { kind: "ground"; index: number; x: number; z: number }
  | { kind: "node"; index: number; id: string }
  | { kind: "link"; index: number; a: string; b: string }
  | { kind: "zone"; index: number; zone: Zone }
  | { kind: "move"; id: string; x: number; z: number }
  | { kind: "console"; a?: string; b?: string }
  | { kind: "scrub"; id: string };

/** Kept for the browser playthrough: reward order used when no meta player is attached. */
export const rewardPriorities = (_build = "balanced"): CardId[] => [
  "poe-injector", "cache-server", "load-balancer", "zero-day", "failover-policy", "rate-limiter",
  "ips-signature", "barrier", "startup-config", "resonance-field", "guard", "pulse", "honeypot",
];

/** Reward priorities that let each engine come online (base ids, best first). */
export const PRIORITIES: Record<RunState["archetype"], CardId[]> = {
  architect: ["rebuild", "hardened-router", "clabernetes", "containerlab", "load-balancer", "poe-injector", "ecmp", "cache-server", "spine-leaf", "failover-policy", "rate-limiter", "barrier", "guard", "firewall", "vxlan", "conduit", "duplex", "armored-fiber"],
  warden: ["stateful-firewall", "poe-injector", "ips-signature", "rate-limiter", "deep-inspection", "reflect", "bastion", "firewall", "cache-server", "barrier", "failover-policy", "hardened-router", "startup-config", "guard", "zero-day"],
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
  const record = (action: BotAction, result: rules.ActionResult) => { if (result.ok) observe?.(action); return result; };
  const act = {
    instant: (r: RunState, index: number) => record({ kind: "instant", index }, rules.playInstant(r, index)),
    prepare: (r: RunState, index: number) => record({ kind: "prepare", index }, rules.prepareCard(r, index)),
    protocol: (r: RunState, index: number) => record({ kind: "protocol", index }, rules.playProtocol(r, index)),
    junk: (r: RunState, index: number) => record({ kind: "junk", index }, rules.playJunk(r, index)),
    ground: (r: RunState, index: number, x: number, z: number) => record({ kind: "ground", index, x, z }, rules.playGround(r, index, x, z)),
    node: (r: RunState, index: number, id: string) => record({ kind: "node", index, id }, rules.playNode(r, index, id)),
    link: (r: RunState, index: number, a: string, b: string) => record({ kind: "link", index, a, b }, rules.playLink(r, index, a, b)),
    zone: (r: RunState, index: number, zone: Zone) => record({ kind: "zone", index, zone }, rules.playZone(r, index, zone)),
    move: (r: RunState, id: string, x: number, z: number) => record({ kind: "move", id, x, z }, rules.relocateNode(r, id, x, z)),
    console: (r: RunState, a?: string, b?: string) => record({ kind: "console", a, b }, rules.useConsole(r, a, b)),
    scrub: (r: RunState, id: string) => record({ kind: "scrub", id }, rules.scrubMalware(r, id)),
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

  function turn(r: RunState, policy: Policy) {
    const defensive = policy === "adaptive" || policy === "tactical";
    const archetype = r.archetype;
    for (let action = 0; action < 60; action++) {
      const p = combatPreview(r);
      if (p.lethal) return;
      // ---- the opener: every policy builds ALPHA → router → OMEGA.
      if (!p.signalPath.length) {
        let router = routers(r).find(n => n.id !== r.faultNode);
        if (!router) {
          const index = r.hand.findIndex((id, i) => CARDS[id].role === "router" && CARDS[id].target === "ground" && affordable(r, i));
          const socket = socketNear(r, "center") ?? socketNear(r);
          if (index >= 0 && socket && act.ground(r, index, socket.x, socket.z).ok) continue;
          if (instant(r, "containerlab", "rebuild")) continue;
        }
        router = routers(r).find(n => n.id !== r.faultNode);
        if (router && !r.faultLink && !r.faultNode) {
          const end = ["alpha", "omega"].find(e => canLink(r.topology, router!.id, e));
          if (end && cable(r, router.id, end)) continue;
        }
      }
      if (policy === "careless") return;
      // ---- repair a broken route first: it is the whole damage plan.
      if (!p.signalPath.length && (r.faultNode || r.faultLink) && instant(r, "reroute", "patch", "protocol")) continue;
      // ---- housekeeping: delete worms, scrub malware.
      const worm = r.hand.findIndex((id, i) => baseCard(id) === "worm" && affordable(r, i));
      if (worm >= 0 && act.junk(r, worm).ok) continue;
      if (r.malware.length && r.energy >= 1 && p.signalPath.length && act.scrub(r, r.malware[0].id).ok) continue;
      // ---- danger first: never build while the visible hit is lethal.
      if (p.incoming >= r.integrity && defend(r)) continue;
      // ---- guardian windows: save an answer for the ultimate, then break it.
      if (policy === "tactical" && p.intent?.kind === "charge" && !r.preparedCard && p.incoming < r.integrity) {
        const answer = r.hand.findIndex(id => ["zero-day", "pulse", "mirror", "ecmp", "barrier", "guard"].includes(baseCard(id)));
        if (answer >= 0 && act.prepare(r, answer).ok) continue;
      }
      if (defensive && p.intent?.ultimate && !p.interrupted && p.packetDamage) {
        const burst = r.hand.findIndex((id, i) => {
          if (!["zero-day", "pulse", "mirror", "ecmp", "store-forward", "replay-attack"].includes(baseCard(id)) || !affordable(r, i)) return false;
          const copy = structuredClone(r);
          return rules.playInstant(copy, i).ok && combatPreview(copy).packetDamage > p.packetDamage;
        });
        if (burst >= 0 && act.instant(r, burst).ok) continue;
      }
      // ---- protocols: arm what the visible intent (or the next one) will trigger.
      const next = intentFor(r, 1);
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
        const benefit = result.ok ? after.packetDamage - p.packetDamage + (defensive ? (p.incoming - after.incoming) * 2 : 0) + (after.malwareTarget ? 0 : r.malware.length - copy.malware.length) * 3 : -1;
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
      const wantsFirewall = defensive && (archetype === "warden" ? firewalls < 3 : firewalls < 1 && (r.enemy && ENEMIES[r.enemy.id].armor?.bypass === "firewall" || r.stage > 0));
      if (wantsFirewall) insertable.unshift("stateful-firewall", "bastion", "firewall");
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
      if (defensive && r.enemy && ENEMIES[r.enemy.id].jamBands && p.intent?.kind === "jam" && p.hazardZone && p.faultTarget && r.energy > 0) {
        const endangered = r.topology.nodes.find(n => n.id === p.faultTarget);
        const safe = SOCKETS.find(s => zoneForNode(s) !== p.hazardZone && !isBlocked(r, s.x, s.z, endangered?.id));
        if (endangered && zoneForNode(endangered) === p.hazardZone && safe && act.move(r, endangered.id, safe.x, safe.z).ok) continue;
      }
      // ---- honeypot when disruption is coming.
      const disruption = [p.intent?.kind, next?.kind].some(kind => kind === "jam" || (kind === "sever" && r.enemy?.id !== "wraith"));
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
      if (archetype === "ghost" && policy !== "aggressive" && !r.buffering && !r.buffer && p.signalPath.length && consoleState(r).usable && r.enemy?.id !== "leech") {
        const copy = structuredClone(r);
        rules.useConsole(copy);
        const stored = combatPreview(copy);
        const soon = p.intent?.kind === "charge" || r.enemy!.hp > p.packetDamage * 3;
        if (!stored.bufferAtRisk && soon && p.incoming < r.integrity - 2 && act.console(r).ok) continue;
      }
      if (policy === "tactical" && !r.preparedCard) {
        const upcoming = intentFor(r, 1);
        const preferred: BaseCardId[] = upcoming?.kind === "sever" || upcoming?.kind === "jam"
          ? ["failover-policy", "port-security", "patch", "reroute", "guard", "pulse"]
          : ["barrier", "guard", "pulse", "zero-day", "surge"];
        const card = r.hand.findIndex(id => preferred.includes(baseCard(id)));
        if (card >= 0) act.prepare(r, card);
      }
      return;
    }
    throw new Error(`Action limit exceeded: ${JSON.stringify({ policy, seed: r.seed, stage: r.stage, enemy: r.enemy, energy: r.energy, hand: r.hand })}`);
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
    return instant(r, "deep-inspection", "guard", "barrier", "capacitor", "protocol", "reroute", "emergency", "mirror");
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
