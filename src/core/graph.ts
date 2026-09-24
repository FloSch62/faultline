import { RULES } from "./cards.ts";
import type { NetworkLink, NetworkNode, Topology } from "./types.ts";

export function linkKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

/** Stable identity of a channel for delivery aims: its inner device ids (terminals
 * excluded), sorted and joined by "|". It survives re-enumeration while the channel's
 * device set exists; a channel that changes its devices is a new channel. */
export function channelKey(path: readonly string[]): string {
  return path.filter((id) => id !== "alpha" && id !== "omega").sort().join("|");
}

/** Server Racks and Phantom Nodes stand on the table but never take a cable. */
export const cableable = (node: Pick<NetworkNode, "role">) => node.role !== "rack" && node.role !== "phantom";

export function canLink(topology: Topology, a: string, b: string): boolean {
  const from = topology.nodes.find((node) => node.id === a), to = topology.nodes.find((node) => node.id === b);
  return (
    a !== b && !!from && !!to && cableable(from) && cableable(to) &&
    !topology.links.some((link) => linkKey(link.a, link.b) === linkKey(a, b))
  );
}

/** A simple ALPHA → OMEGA path, its visited device set and cable modifiers. */
export interface Route {
  path: string[];
  /** Bit mask over topology.nodes indices, terminals included. */
  mask: number;
  /** Amplified cables along the path. */
  boosted: number;
  /** Frayed cables along the path. */
  frayed: number;
}

let powerBuffer = new Int16Array(0);
let previousBuffer = new Int8Array(0);
const UNREACHED = -0x8000;

/** One strongest representative per visited device set. The subset search
 * cannot miss a better route behind a dense branch: fourteen sockets bound it
 * to 2^14 states per endpoint. Amplified and frayed cables are counted without
 * a cap; for one device set the path with the best cable signal wins. */
export function routes(
  topology: Topology,
  excludedNodes: ReadonlySet<string> = new Set(),
  excludedLinks: ReadonlySet<string> = new Set(),
  frayedLinks: ReadonlySet<string> = new Set(),
): Route[] {
  if (excludedNodes.has("alpha") || excludedNodes.has("omega")) return [];
  const nodes = topology.nodes;
  const n = nodes.length;
  if (n > 14) return [];
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const alpha = index.get("alpha"),
    omega = index.get("omega");
  if (alpha === undefined || omega === undefined) return [];
  // Bitmask adjacency: neighbours, amplified and frayed cables per device.
  const adjacency = new Int32Array(n),
    amplified = new Int32Array(n),
    frayed = new Int32Array(n);
  let excluded = 0;
  nodes.forEach((node, i) => {
    if (excludedNodes.has(node.id)) excluded |= 1 << i;
  });
  for (const link of topology.links) {
    if (excludedLinks.has(linkKey(link.a, link.b))) continue;
    const a = index.get(link.a),
      b = index.get(link.b);
    if (a === undefined || b === undefined || a === b) continue;
    adjacency[a] |= 1 << b;
    adjacency[b] |= 1 << a;
    if (link.boosted) {
      amplified[a] |= 1 << b;
      amplified[b] |= 1 << a;
    }
    if (frayedLinks.has(linkKey(link.a, link.b))) {
      frayed[a] |= 1 << b;
      frayed[b] |= 1 << a;
    }
  }
  for (let i = 0; i < n; i++) adjacency[i] &= ~excluded;
  const size = (1 << n) * n;
  if (powerBuffer.length < size) {
    powerBuffer = new Int16Array(size);
    previousBuffer = new Int8Array(size);
  }
  const power = powerBuffer,
    previous = previousBuffer;
  power.fill(UNREACHED, 0, size);
  const alphaBit = 1 << alpha;
  power[alphaBit * n + alpha] = 0;
  previous[alphaBit * n + alpha] = -1;
  const found: number[] = [];
  for (let mask = alphaBit; mask < 1 << n; mask++) {
    if (!(mask & alphaBit)) continue;
    const row = mask * n;
    for (let end = 0; end < n; end++) {
      const value = power[row + end];
      if (value === UNREACHED) continue;
      if (end === omega) {
        found.push(mask);
        continue;
      }
      let free = adjacency[end] & ~mask;
      while (free) {
        const bit = free & -free;
        free ^= bit;
        const next = 31 - Math.clz32(bit);
        const key = (mask | bit) * n + next;
        const candidate = value
          + (amplified[end] & bit ? RULES.amplifiedCableDamage : 0)
          - (frayed[end] & bit ? RULES.frayedCableDamage : 0);
        if (candidate > power[key]) {
          power[key] = candidate;
          previous[key] = end;
        }
      }
    }
  }
  const result: (Route & { size: number })[] = found.map((mask) => {
    const path: string[] = [];
    let current = omega,
      visited = mask,
      boosted = 0,
      worn = 0;
    while (current >= 0) {
      path.push(nodes[current].id);
      const before = previous[visited * n + current];
      if (before >= 0) {
        if (amplified[before] & (1 << current)) boosted++;
        if (frayed[before] & (1 << current)) worn++;
      }
      visited ^= 1 << current;
      current = before;
    }
    path.reverse();
    return { path, mask, boosted, frayed: worn, size: path.length };
  });
  // Stable order: fewer devices first, then earlier-installed devices (mask order).
  result.sort((a, b) => a.size - b.size || a.mask - b.mask);
  return result.map(({ path, mask, boosted, frayed }) => ({ path, mask, boosted, frayed }));
}

/** Compatibility: the path list of every representative route. */
export function paths(
  topology: Topology,
  excludedNodes: ReadonlySet<string> = new Set(),
  excludedLinks: ReadonlySet<string> = new Set(),
): string[][] {
  return routes(topology, excludedNodes, excludedLinks).map((route) => route.path);
}

export function roleInPath(
  path: string[],
  topology: Topology,
  role: NetworkNode["role"],
): boolean {
  return path.some((id) =>
    topology.nodes.some((node) => node.id === id && node.role === role),
  );
}

const popcount = (value: number) => {
  let count = 0;
  for (let v = value; v; v &= v - 1) count++;
  return count;
};

/** Keeps only inclusion-minimal masks: a smaller route is always at least as
 * useful when searching for routes that share no device. */
function minimal<T extends { mask: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => popcount(a.mask) - popcount(b.mask));
  const kept: T[] = [];
  for (const item of sorted)
    if (!kept.some((other) => (other.mask & item.mask) === other.mask)) kept.push(item);
  return kept;
}

/**
 * Maximum set of routes that share no intermediate device. `candidates` must
 * already contain only router routes. `terminals` is the mask of ALPHA/OMEGA,
 * which every route shares. Optionally forces `required` into the set.
 */
export function maximumChannels<T extends { mask: number }>(
  candidates: T[],
  routerMask: number,
  terminals: number,
  required?: T,
): T[] {
  const inner = (item: T) => item.mask & ~terminals;
  const usable = minimal(
    candidates.filter((item) => !required || (inner(item) & inner(required)) === 0),
  );
  const routers: number[] = [];
  for (let bit = 0; bit < 31; bit++) if (routerMask & (1 << bit)) routers.push(bit);
  const byRouter = routers.map(() => [] as T[]);
  for (const item of usable) {
    const i = routers.findIndex((bit) => inner(item) & (1 << bit));
    if (i >= 0) byRouter[i].push(item);
  }
  let best: T[] = [];
  const current: T[] = [];
  const start = required ? inner(required) : 0;
  const search = (ri: number, used: number) => {
    let remaining = 0;
    for (let i = ri; i < routers.length; i++)
      if (!(used & (1 << routers[i])) && byRouter[i].length) remaining++;
    if (current.length + remaining <= best.length) return;
    if (ri === routers.length) {
      best = [...current];
      return;
    }
    if (!(used & (1 << routers[ri]))) {
      for (const item of byRouter[ri]) {
        const mask = inner(item);
        if (mask & used) continue;
        current.push(item);
        search(ri + 1, used | mask);
        current.pop();
      }
    }
    search(ri + 1, used);
  };
  search(0, start);
  return required ? [required, ...best] : best;
}

/** Whether two routes that share no intermediate device satisfy the predicates. */
export function disjointPair<T extends { mask: number }>(
  first: T[],
  second: T[],
  terminals: number,
): boolean {
  const a = minimal(first),
    b = minimal(second);
  return a.some((x) => b.some((y) => (x.mask & y.mask & ~terminals) === 0));
}

export function initialTopology(): Topology {
  return {
    nodes: [
      { id: "alpha", role: "client", x: -5.3, z: 0, fixed: true },
      { id: "omega", role: "client", x: 5.3, z: 0, fixed: true },
    ],
    links: [],
  };
}

export function liveLinks(
  topology: Topology,
  faultLinks: readonly string[],
): NetworkLink[] {
  return topology.links.filter((link) => !faultLinks.includes(linkKey(link.a, link.b)));
}
