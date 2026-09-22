import type { NetworkLink, NetworkNode, Topology } from "./types.ts";

export function linkKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

export function canLink(topology: Topology, a: string, b: string): boolean {
  return (
    a !== b &&
    topology.nodes.some((node) => node.id === a) &&
    topology.nodes.some((node) => node.id === b) &&
    !topology.links.some((link) => linkKey(link.a, link.b) === linkKey(a, b))
  );
}

/** One strongest representative per visited device set. Unlike a capped DFS,
 * this subset search cannot miss a better route behind a dense branch. With
 * fourteen table sockets there are at most 2^14 states per endpoint. */
export function paths(
  topology: Topology,
  excludedNodes = new Set<string>(),
  excludedLinks = new Set<string>(),
): string[][] {
  if (excludedNodes.has("alpha") || excludedNodes.has("omega")) return [];
  const nodes = topology.nodes;
  if (nodes.length > 14) return [];
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const alpha = index.get("alpha"),
    omega = index.get("omega");
  if (alpha === undefined || omega === undefined) return [];
  const graph = nodes.map(() => [] as { next: number; power: number }[]);
  for (const link of topology.links) {
    if (excludedLinks.has(linkKey(link.a, link.b))) continue;
    const a = index.get(link.a),
      b = index.get(link.b);
    if (a === undefined || b === undefined) continue;
    graph[a].push({ next: b, power: Number(!!link.boosted) });
    graph[b].push({ next: a, power: Number(!!link.boosted) });
  }
  const width = nodes.length;
  const states = new Map<number, { route: string[]; power: number }>();
  states.set((1 << alpha) * width + alpha, { route: ["alpha"], power: 0 });
  const result: string[][] = [];
  for (let mask = 0; mask < 1 << width; mask++) {
    for (let end = 0; end < width; end++) {
      const state = states.get(mask * width + end);
      if (!state) continue;
      if (end === omega) {
        result.push(state.route);
        continue;
      }
      for (const { next, power } of graph[end]) {
        if (mask & (1 << next) || excludedNodes.has(nodes[next].id)) continue;
        const key = (mask | (1 << next)) * width + next;
        const value = Math.min(2, state.power + power);
        const previous = states.get(key);
        if (!previous || value > previous.power)
          states.set(key, {
            route: [...state.route, nodes[next].id],
            power: value,
          });
      }
    }
  }
  return result.sort(
    (a, b) => a.length - b.length || a.join().localeCompare(b.join()),
  );
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

export function independentRouterPaths(
  topology: Topology,
  candidatePaths: string[][],
): [string[], string[]] | null {
  const indices = new Map(topology.nodes.map((node, i) => [node.id, i]));
  const routed = candidatePaths.filter((path) =>
    roleInPath(path, topology, "router"),
  );
  const masks = routed.map((path) =>
    path.slice(1, -1).reduce((mask, id) => mask | (1 << indices.get(id)!), 0),
  );
  for (let i = 0; i < routed.length; i++)
    for (let j = i + 1; j < routed.length; j++)
      if ((masks[i] & masks[j]) === 0) return [routed[i], routed[j]];
  return null;
}

export function routerForkPaths(
  topology: Topology,
  candidatePaths: string[][],
): [string[], string[]] | null {
  const routersFor = (path: string[]) =>
    path.filter((id) =>
      topology.nodes.some((node) => node.id === id && node.role === "router"),
    );
  for (let i = 0; i < candidatePaths.length; i++) {
    for (let j = i + 1; j < candidatePaths.length; j++) {
      const first = new Set(routersFor(candidatePaths[i]));
      const second = routersFor(candidatePaths[j]);
      if (first.size && second.length && second.every((id) => !first.has(id)))
        return [candidatePaths[i], candidatePaths[j]];
    }
  }
  return null;
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
  faultLink: string | null,
): NetworkLink[] {
  return topology.links.filter((link) => linkKey(link.a, link.b) !== faultLink);
}
