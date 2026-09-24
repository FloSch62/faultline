/** The Architect's cards: "Make a way through" (contract section 9.1). Paths: Mesh (channels and
 * width), Backbone (a long, upgraded primary route), Deployment (hardware tempo, clusters, device
 * triggers). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/architect.ts (new cards) or the engine's legacy if-chains (v4 cards).
 *
 * PHASE C (architect agent): the table is `CardTable<ArchitectCardId>`, so every card of 9.1 is
 * added here and nowhere else (`missingCards("architect")` lists the missing ids; turn the check
 * on in src/core/architect.test.ts once it is empty). Branch Line is defined already because the
 * Architect's starter deck needs it (effect in effects/architect.ts); it is yours to polish.
 * Every definition carries `archetype: "architect"`. */
import { RULES as R } from "../rules.ts";
import type { ArchitectCardId, CardTable } from "../card-types.ts";

const words = ["no", "one", "two", "three", "four", "five", "six"];

export const ARCHITECT_CARDS: CardTable<ArchitectCardId> = {
  // ---------------------------------------------------------------- Mesh
  "branch-line": {
    name: "Branch Line", subtitle: "ARCHITECT / BRANCH", cost: 1, rarity: "basic", target: "link", art: "cable", color: "#6fd9c8", archetype: "architect",
    text: v => `Link two devices. If this adds a channel, draw ${v.draw}.`,
    detail: "It draws when the live channel count after the cable is higher than before it.",
    values: { draw: 1 },
    upgrade: { values: { draw: 2 } },
  },
  ecmp: {
    name: "Equal-Cost Multipath", subtitle: "ARCHITECT / BANDWIDTH", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#6fd6ef", archetype: "architect",
    text: v => `+${v.perChannel} damage this turn per live channel.`,
    values: { perChannel: 2 },
    upgrade: { values: { perChannel: 3 } },
  },
  "flood-fill": {
    name: "Flood Fill", subtitle: "ARCHITECT / FLOOD", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#e8b562", archetype: "architect",
    text: v => `+${v.perChannelEveryPort} damage to every hostile per live channel this turn.`,
    detail: "Needs a live route.",
    values: { perChannelEveryPort: 1 },
    upgrade: { values: { perChannelEveryPort: 2 } },
  },
  mirror: {
    name: "Mirror Protocol", subtitle: "ARCHITECT / REDUNDANCY", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#bc9fde", archetype: "architect",
    text: v => `Needs 2 channels. +${v.perChannel} damage and ${v.perChannel} block per live channel.`,
    values: { perChannel: 2 },
    upgrade: { values: { perChannel: 3 } },
  },
  "mesh-weave": {
    name: "Mesh Weave", subtitle: "ARCHITECT / TOPOLOGY", cost: 1, rarity: "uncommon", target: "node", art: "cable", color: "#6fe3d0", archetype: "architect",
    text: v => `Link a device to its ${words[v.links ?? 2] ?? v.links} nearest unlinked devices.`,
    detail: "Distance ties: device ids.",
    values: { links: 2 },
    upgrade: { values: { links: 3 } },
  },
  "spine-leaf": {
    name: "Spine-Leaf", subtitle: "ARCHITECT / FABRIC", cost: 1, rarity: "rare", target: "ground", role: "switch", art: "hardware", color: "#7cc7ff", archetype: "architect",
    rules: `Deploy a switch linked to every router (+${R.switchDamage} on your primary route).`,
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- Deployment
  "rapid-redeploy": {
    name: "Rapid Redeploy", subtitle: "ARCHITECT / REDEPLOY", cost: 1, rarity: "uncommon", target: "instant", art: "hardware", color: "#7fd3c4", archetype: "architect", exhaust: true,
    text: v => `Return your last discarded hardware card to hand. It costs ${v.discount} less this turn.${v.draw ? ` Draw ${v.draw}.` : ""} Exhaust.`,
    values: { recover: 1, discount: 1 },
    upgrade: { values: { recover: 1, discount: 1, draw: 1 } },
  },
  // PHASE C (architect agent): patch-panel, redundant-paths, standby-router, peering-session,
  // fabric-controller, trunk-line, splice, traceroute, deep-buffers, line-rate, carrier-grade,
  // rack-and-stack, blueprint, provisioning-script, zero-touch, datacenter.
};
