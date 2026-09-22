import type { Topology } from "./types.ts";

export function topologyYaml(topology: Topology, name = "faultline"): string {
  const safeName =
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "faultline";
  const portIndex = new Map<string, number>();
  const port = (id: string) => {
    const index = (portIndex.get(id) ?? 0) + 1;
    portIndex.set(id, index);
    const role = topology.nodes.find((node) => node.id === id)?.role;
    return role === "router" || role === "switch"
      ? `e1-${index}`
      : `eth${index}`;
  };
  const lines = [
    "# FAULTLINE / Network Architect",
    "# This file creates nodes and wiring only. Configure actual routing and security policies separately.",
    `name: ${safeName}`,
    "",
    "topology:",
    "  nodes:",
  ];
  for (const node of topology.nodes) {
    const srl = node.role === "router" || node.role === "switch";
    lines.push(
      `    ${node.id}:`,
      `      kind: ${srl ? "nokia_srlinux" : "linux"}`,
      `      image: ${srl ? "ghcr.io/nokia/srlinux" : "ghcr.io/hellt/network-multitool"}`,
    );
  }
  if (topology.links.length) {
    lines.push("  links:");
    for (const link of topology.links)
      lines.push(
        `    - endpoints: ["${link.a}:${port(link.a)}", "${link.b}:${port(link.b)}"]`,
      );
  }
  return `${lines.join("\n")}\n`;
}
