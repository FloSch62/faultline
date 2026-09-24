/** The Architect's cards: "Make a way through" (contract section 9.1). Paths: Mesh (channels and
 * width), Backbone (a long, upgraded primary route), Deployment (hardware tempo, clusters, device
 * triggers). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/architect.ts (new cards) or the engine's legacy if-chains (v4 cards: Equal-Cost
 * Multipath, Flood Fill, Mirror Protocol, Mesh Weave, Spine-Leaf, Rapid Redeploy).
 *
 * Faces are generated from `values` (`text`), so tuning a number changes the face; RULES numbers
 * are read from rules.ts. Long exceptions go in `detail`. Every definition carries
 * `archetype: "architect"`. Daemons read their numbers in their hooks (no generic values apply). */
import { RULES as R } from "../rules.ts";
import type { ArchitectCardId, CardTable } from "../card-types.ts";

const words = ["no", "one", "two", "three", "four", "five", "six"];
/** "nearest device", "two nearest devices". */
const nearest = (n = 1) => (n === 1 ? "nearest device" : `${words[n] ?? n} nearest devices`);
/** "Your next link card this turn costs 0." / "Your next two link cards this turn cost 0." */
const nextLinks = (n = 1) => (n === 1 ? "Your next link card this turn costs 0." : `Your next ${words[n] ?? n} link cards this turn cost 0.`);
const draw = (n?: number) => (n ? ` Draw ${n}.` : "");
/** Which deploys the deviceDeployed daemons hear. */
const DEPLOYS = "Every device your cards deploy counts, auto-deployed ones too (Emergency Rebuild, Containerlab, Clabernetes, Splice); salvage does not.";

export const ARCHITECT_CARDS: CardTable<ArchitectCardId> = {
  // ---------------------------------------------------------------- Mesh: channels and width
  "branch-line": {
    name: "Branch Line", subtitle: "ARCHITECT / BRANCH", cost: 1, rarity: "basic", target: "link", art: "cable", color: "#6fd9c8", archetype: "architect",
    text: v => `Link two devices. If this adds a channel, draw ${v.draw}.`,
    detail: "It draws when the live channel count after the cable is higher than before it.",
    values: { draw: 1 },
    upgrade: { values: { draw: 2 } },
  },
  "patch-panel": {
    name: "Patch Panel", subtitle: "ARCHITECT / PATCHING", cost: 1, rarity: "common", target: "link", art: "cable", color: "#8fe0d2", archetype: "architect",
    text: v => `Link two devices. ${nextLinks(v.freeLinks)}${draw(v.draw)}`,
    detail: "The next link card uses it, even one that already costs 0; it lasts until the end of your turn. While Hot Swap's free link is unspent, Hot Swap pays first and this one waits.",
    values: { freeLinks: 1 },
    upgrade: { values: { draw: 1 } },
  },
  "redundant-paths": {
    name: "Redundant Paths", subtitle: "ARCHITECT / FAILOVER", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#7fcfe0", archetype: "architect",
    text: v => `Gain ${v.perChannel} block per live channel.`,
    detail: "Counts your live channels when you play it; with no live route it gives nothing.",
    values: { perChannel: 2 },
    upgrade: { values: { perChannel: 3 } },
  },
  "standby-router": {
    name: "Standby Router", subtitle: "ARCHITECT / STANDBY", cost: 1, rarity: "common", target: "ground", role: "router", art: "hardware", color: "#62e0c4", archetype: "architect",
    text: v => `Deploy a router linked to its ${nearest(v.links)}.`,
    detail: "It links to the nearest devices it is not already cabled to, ALPHA and OMEGA included (distance ties: device ids).",
    values: { links: 1 },
    upgrade: { values: { links: 2 } },
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
  "peering-session": {
    name: "Peering Session", subtitle: "ARCHITECT / PEERING", cost: 1, rarity: "uncommon", target: "daemon", art: "defense", color: "#86d8b8", archetype: "architect",
    text: v => `Daemon. Whenever you add a channel, gain ${v.block} block.`,
    detail: "It pays for every channel added. Any card, console use or relocation of yours that raises your live channel count counts, clearing a jam or a cut too.",
    values: { block: 3 },
    upgrade: { values: { block: 4 } },
  },
  "spine-leaf": {
    name: "Spine-Leaf", subtitle: "ARCHITECT / FABRIC", cost: 1, rarity: "rare", target: "ground", role: "switch", art: "hardware", color: "#7cc7ff", archetype: "architect",
    rules: `Deploy a switch linked to every router (+${R.switchDamage} on your primary route).`,
    upgrade: { cost: 0 },
  },
  "fabric-controller": {
    name: "Fabric Controller", subtitle: "ARCHITECT / CONTROL PLANE", cost: 2, rarity: "rare", target: "daemon", art: "program", color: "#5fc9f0", archetype: "architect",
    text: v => `Daemon. Every channel beyond the first deals +${v.perChannel} more.`,
    detail: `Each channel beyond the first is a bandwidth delivery of +${R.bandwidthPerChannel}; this adds to every one of them. Under Spanning Tree bandwidth gives nothing, and neither does this.`,
    values: { perChannel: 2 },
    upgrade: { cost: 1 },
  },
  // ---------------------------------------------------------------- Backbone: a long, upgraded primary route
  "trunk-line": {
    name: "Trunk Line", subtitle: "ARCHITECT / TRUNK", cost: 1, rarity: "common", target: "instant", art: "program", color: "#e0bf6a", archetype: "architect",
    text: v => `+${v.perDevice} damage this turn per device on your primary route.${draw(v.draw)}`,
    detail: "Counts the devices on your primary route when you play it; ALPHA and OMEGA are not devices.",
    values: { perDevice: 1 },
    upgrade: { values: { draw: 1 } },
  },
  splice: {
    name: "Splice", subtitle: "ARCHITECT / SPLICE", cost: 1, rarity: "common", target: "instant", art: "hardware", color: "#c9b27a", archetype: "architect",
    rules: "Deploy a switch into the longest cable of your primary route.",
    detail: `The cable becomes two cables through a new switch (+${R.switchDamage} on your primary route) at the free socket nearest its middle; both keep armor and amplification. Ties: the cable nearest ALPHA.`,
    upgrade: { cost: 0 },
  },
  traceroute: {
    name: "Traceroute", subtitle: "ARCHITECT / HOPS", cost: 0, rarity: "common", target: "instant", art: "program", color: "#9ad4e6", archetype: "architect",
    text: v => `Draw ${v.draw}. +${v.perSwitch} damage this turn per switch on your primary route.`,
    detail: "Counts the switches on your primary route when you play it.",
    values: { draw: 1, perSwitch: 1 },
    upgrade: { values: { draw: 2 } },
  },
  "deep-buffers": {
    name: "Deep Buffers", subtitle: "ARCHITECT / BUFFERS", cost: 1, rarity: "uncommon", target: "daemon", art: "program", color: "#a7b8f2", archetype: "architect",
    text: v => `Daemon. Switches on your primary route deal +${v.perSwitch} more.`,
    detail: `A switch on your primary route deals +${R.switchDamage} (compressed +${R.compressionDamage} more); this adds to each.`,
    values: { perSwitch: 1 },
    upgrade: { cost: 0 },
  },
  "line-rate": {
    name: "Line Rate", subtitle: "ARCHITECT / LINE RATE", cost: 2, rarity: "rare", target: "instant", art: "program", color: "#f2c55c", archetype: "architect", exhaust: true,
    rules: "Overclock every router and compress every switch on your primary route. Exhaust.",
    detail: `Overclocked routers deal +${R.overclockDamage} and compressed switches +${R.compressionDamage} while on your primary route. Needs a router or switch there that is not upgraded yet.`,
    upgrade: { cost: 1 },
  },
  "carrier-grade": {
    name: "Carrier Grade", subtitle: "ARCHITECT / BACKBONE", cost: 2, rarity: "rare", target: "daemon", art: "program", color: "#f0d27e", archetype: "architect",
    text: v => `Daemon. Your primary route deals +${v.perDevice} per device on it.`,
    detail: "ALPHA and OMEGA are not devices. Your primary route is still the route that deals the most, this bonus included.",
    values: { perDevice: 1 },
    upgrade: { cost: 1 },
  },
  // ---------------------------------------------------------------- Deployment: hardware tempo, clusters, device triggers
  "rack-and-stack": {
    name: "Rack and Stack", subtitle: "ARCHITECT / RACKING", cost: 1, rarity: "common", target: "ground", role: "switch", art: "hardware", color: "#8ccfb0", archetype: "architect",
    text: v => `Deploy a switch. Your next hardware card this turn costs ${v.hardwareDiscount} less.`,
    detail: `The switch deals +${R.switchDamage} on your primary route. Hardware cards are the ones that deploy a device. The next one uses the discount, even one that already costs 0; it lasts until the end of your turn.`,
    values: { hardwareDiscount: 1 },
    upgrade: { cost: 0 },
  },
  blueprint: {
    name: "Blueprint", subtitle: "ARCHITECT / PLANNING", cost: 1, rarity: "common", target: "instant", art: "program", color: "#b8d6ea", archetype: "architect",
    text: v => `Draw ${v.draw}. Hardware drawn this way costs ${v.discount} less this turn.`,
    detail: "Hardware cards are the ones that deploy a device.",
    values: { draw: 2, discount: 1 },
    upgrade: { values: { draw: 3 } },
  },
  "rapid-redeploy": {
    name: "Rapid Redeploy", subtitle: "ARCHITECT / REDEPLOY", cost: 1, rarity: "uncommon", target: "instant", art: "hardware", color: "#7fd3c4", archetype: "architect", exhaust: true,
    text: v => `Return your last discarded hardware card to hand. It costs ${v.discount} less this turn.${draw(v.draw)} Exhaust.`,
    values: { recover: 1, discount: 1 },
    upgrade: { values: { recover: 1, discount: 1, draw: 1 } },
  },
  "provisioning-script": {
    name: "Provisioning Script", subtitle: "ARCHITECT / PROVISIONING", cost: 1, rarity: "uncommon", target: "daemon", art: "defense", color: "#9fdcc0", archetype: "architect",
    text: v => `Daemon. Whenever you deploy a device, gain ${v.block} block.`,
    detail: DEPLOYS,
    values: { block: 2 },
    upgrade: { values: { block: 3 } },
  },
  "zero-touch": {
    name: "Zero-Touch Provisioning", subtitle: "ARCHITECT / AUTOMATION", cost: 1, rarity: "rare", target: "daemon", art: "program", color: "#66e6d8", archetype: "architect",
    text: v => `Daemon. Whenever you deploy a device, draw ${v.draw}.`,
    detail: DEPLOYS,
    values: { draw: 1 },
    upgrade: { cost: 0 },
  },
  datacenter: {
    name: "Datacenter", subtitle: "ARCHITECT / DATA HALL", cost: 2, rarity: "rare", target: "daemon", art: "hardware", color: "#7ab8d8", archetype: "architect",
    text: v => `Daemon. Every cluster deals +${v.perCluster} more.`,
    detail: `A cluster is a band holding ${R.clusterThreshold} or more online devices (Server Racks count); each deals +${R.clusterDamage} on your primary route, and this adds to each.`,
    values: { perCluster: 3 },
    upgrade: { cost: 1 },
  },
};
