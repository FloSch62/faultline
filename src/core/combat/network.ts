/** Network analysis: routes, the primary route, channels, online devices, clusters and
 * separated circuits, for a given set of faults. Unchanged from v3 except that faults are
 * lists (packs and escalation disrupt several things at once) and a Server Rack counts
 * toward its band's cluster. */
import { RULES } from "../cards.ts";
import { disjointPair, maximumChannels, mergePoints, routes as enumerateRoutes, type Route } from "../graph.ts";
import { frayedLinks } from "../terrain.ts";
import type { NetworkNode, RunState, Zone } from "../types.ts";
import { ZONES, fieldBands, has, zoneForNode } from "./board.ts";
import { daemonRouteTerms, daemonTotal, hasRouteTerms } from "../effects/index.ts";

export interface ScoredRoute extends Route {
  score: number;
}
export interface Network {
  routes: ScoredRoute[];
  primary: ScoredRoute | null;
  channels: ScoredRoute[];
  channelCount: number;
  /** Devices where live routes merge and so count once (graph.mergePoints), with the number of
   * routes through each. Empty in light mode and while every route is its own channel. */
  shared: { id: string; routes: number }[];
  online: Set<string>;
  onlineNodes: NetworkNode[];
  clusters: Zone[];
  separated: boolean;
}

/** Route contribution of one device on the primary route (switches, configured and overclocked
 * routers; v5: switchBonus daemons such as Deep Buffers). */
export function contributionOf(run: RunState, node: NetworkNode, switchBonus = daemonTotal(run, "switchBonus")): number {
  const lens = has(run, "packet-lens");
  return (node.role === "switch" ? (lens ? RULES.packetLensSwitchDamage : RULES.switchDamage) + (node.amplified ? RULES.compressionDamage : 0) + switchBonus : 0) +
    (node.role === "router" ? (node.configured ? RULES.configuredDamage : 0) + (node.upgraded ? RULES.overclockDamage : 0) : 0);
}

export function analyze(run: RunState, faultNodes: readonly string[], faultLinks: readonly string[], light = false): Network {
  const nodes = run.topology.nodes;
  // Escalation level 1: cables frayed by a cut for one player turn fray like wreckage does.
  const frayed = frayedLinks(run.topology, run.terrain);
  for (const key of run.frayedByCut ?? []) frayed.add(key);
  const all = enumerateRoutes(run.topology, new Set(faultNodes), new Set(faultLinks), frayed);
  const zoneBit: Record<Zone, number> = { north: 1, center: 2, south: 4 };
  const switchBonus = run.daemons?.length ? daemonTotal(run, "switchBonus") : 0;
  const contribution = nodes.map(node => contributionOf(run, node, switchBonus));
  // v5: routeTerms daemons (Carrier Grade) score every candidate route, so the primary route is
  // still the one that deals the most.
  const routeHooks = !!run.daemons?.length && hasRouteTerms(run);
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
    if (routeHooks) {
      const devices = nodes.filter((node, i) => !node.fixed && route.mask & (1 << i));
      score += daemonRouteTerms(run, devices).reduce((sum, term) => sum + term.amount, 0);
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
  // A Server Rack carries no signal but counts as deployed hardware for its band's cluster.
  const racks = nodes.filter(node => node.role === "rack");
  const clusters = ZONES.filter(zone =>
    onlineNodes.filter(node => zoneForNode(node) === zone).length + racks.filter(node => zoneForNode(node) === zone).length >= RULES.clusterThreshold);
  const routerIn = (route: ScoredRoute, zone: Zone) => {
    for (let m = route.mask & routerMask, i = 0; m; m >>= 1, i++) if (m & 1 && !nodes[i].fixed && zoneForNode(nodes[i]) === zone) return true;
    return false;
  };
  const shared = light || ranked.length <= channelCount ? []
    : mergePoints(ranked.map(route => route.mask), terminals, channelCount).map(({ bit, routes }) => ({ id: nodes[bit].id, routes }));
  const separated = !light && channelCount >= 2 && disjointPair(ranked.filter(route => routerIn(route, "north")), ranked.filter(route => routerIn(route, "south")), terminals);
  return { routes: ranked, primary, channels, channelCount, shared, online, onlineNodes, clusters, separated };
}
