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

export function paths(
  topology: Topology,
  excludedNodes = new Set<string>(),
  excludedLinks = new Set<string>(),
): string[][] {
  if (excludedNodes.has("alpha") || excludedNodes.has("omega")) return [];
  const graph = new Map(
    topology.nodes.map((node) => [node.id, [] as string[]]),
  );
  for (const link of topology.links) {
    if (excludedLinks.has(linkKey(link.a, link.b))) continue;
    graph.get(link.a)?.push(link.b);
    graph.get(link.b)?.push(link.a);
  }
  const result: string[][] = [];
  const visit = (node: string, path: string[]) => {
    if (result.length >= 256) return;
    if (node === "omega") {
      result.push(path);
      return;
    }
    for (const next of graph.get(node) ?? []) {
      if (!path.includes(next) && !excludedNodes.has(next))
        visit(next, [...path, next]);
    }
  };
  visit("alpha", ["alpha"]);
  return result;
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
  const routed = candidatePaths.filter((path) =>
    roleInPath(path, topology, "router"),
  );
  for (let i = 0; i < routed.length; i++) {
    for (let j = i + 1; j < routed.length; j++) {
      const first = new Set(routed[i].slice(1, -1));
      if (routed[j].slice(1, -1).every((id) => !first.has(id)))
        return [routed[i], routed[j]];
    }
  }
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
