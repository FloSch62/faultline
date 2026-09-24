/** Architect card effects and daemon hooks (contract section 9.1), merged by effects/index.ts.
 *
 * Registered here: Branch Line, Patch Panel, Redundant Paths, Trunk Line, Splice, Traceroute, Line
 * Rate, Rack and Stack, Blueprint (card effects) and the six daemons. Standby Router needs no entry
 * (a ground card with `values.links` is auto-linked by the engine, like Linux Bridge). Equal-Cost
 * Multipath, Flood Fill, Mirror Protocol, Mesh Weave, Spine-Leaf and Rapid Redeploy still run on the
 * engine's legacy branches in run.ts with the numbers in their `values`.
 *
 * Every number is read from the card's `values`. Player-turn hooks mutate through `api`; the
 * resolver hooks (bandwidthBonus, switchBonus, routeTerms, clusterBonus) are pure and the engine
 * prints them in the forecast labelled with the daemon's name. */
import { CARDS } from "../cards.ts";
import type { Network } from "../combat/network.ts";
import type { NetworkLink, NetworkNode, RunState } from "../types.ts";
import type { DaemonContext, EngineApi, OwnerEffects } from "./types.ts";

/** "Carrier Grade", "Carrier Grade ×2": the engine's daemon label (effects/index.ts), rebuilt here
 * so this module does not import the registry that imports it. */
const label = ({ card, count }: Pick<DaemonContext, "card" | "count">) => `${card.name}${count > 1 ? ` ×${count}` : ""}`;
/** Devices on the primary route, in route order (ALPHA and OMEGA are not devices). */
function primaryDevices(run: RunState, network: Network): NetworkNode[] {
  return (network.primary?.path ?? [])
    .map(id => run.topology.nodes.find(node => node.id === id))
    .filter((node): node is NetworkNode => !!node && !node.fixed);
}
/** Line Rate's targets: routers not yet overclocked and switches not yet compressed on the primary route. */
const lineRateTargets = (run: RunState, network: Network) =>
  primaryDevices(run, network).filter(node => (node.role === "router" && !node.upgraded) || (node.role === "switch" && !node.amplified));

/** Splice: the longest cable of the primary route (ties: the one nearest ALPHA) and the legal socket
 * nearest its middle, or why there is none. Pure. */
function spliceSite(run: RunState, api: EngineApi): { cable: NetworkLink; socket: { x: number; z: number } } | string {
  const path = api.network(run).primary?.path;
  if (!path) return "Splice needs a live primary route.";
  const at = (id: string) => run.topology.nodes.find(node => node.id === id)!;
  let best: { cable: NetworkLink; length: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = at(path[i - 1]), b = at(path[i]);
    const cable = run.topology.links.find(link => (link.a === a.id && link.b === b.id) || (link.a === b.id && link.b === a.id));
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    if (cable && (!best || length > best.length)) best = { cable, length };
  }
  if (!best) return "Splice needs a live primary route.";
  const a = at(best.cable.a), b = at(best.cable.b);
  const socket = api.socketNear(run, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  return socket ? { cable: best.cable, socket } : "The table has no free socket for a spliced switch.";
}

export const ARCHITECT_EFFECTS: OwnerEffects = {
  cards: {
    // ---------------------------------------------------------------- Mesh
    // Branch Line: "Link two devices. If this adds a channel, draw N." The draw is conditional, so
    // the effect claims `draw` and the generic step skips it.
    "branch-line": {
      manual: ["draw"],
      play: (run, { api, values, before }) => {
        if (api.network(run).channelCount <= before.channels) return;
        const drawn = api.draw(run, values.draw ?? 1).length;
        return ` · new channel, drew ${drawn}`;
      },
    },
    // Patch Panel: "Link two devices. Your next link card this turn costs 0." (+: Draw 1, generic).
    "patch-panel": {
      play: (run, { api, values }) => {
        const fx = api.effects(run);
        fx.freeLinks = (fx.freeLinks ?? 0) + (values.freeLinks ?? 0);
        return " · next link card free";
      },
    },
    // Redundant Paths: "Gain N block per live channel." (0 channels: 0).
    "redundant-paths": {
      play: (run, { api, values }) => {
        const channels = api.network(run).channelCount;
        const block = (values.perChannel ?? 0) * channels;
        run.block += block;
        return ` · +${block} block from ${channels} channel${channels === 1 ? "" : "s"}`;
      },
    },
    // ---------------------------------------------------------------- Backbone
    // Trunk Line: "+N damage this turn per device on your primary route." (+: Draw 1, generic).
    "trunk-line": {
      play: (run, { api, values }) => {
        const devices = primaryDevices(run, api.network(run)).length;
        const burst = (values.perDevice ?? 0) * devices;
        run.packetBoost += burst;
        return ` · +${burst} from ${devices} device${devices === 1 ? "" : "s"}`;
      },
    },
    // Splice: "Deploy a switch into the longest cable of your primary route." The cable A–B becomes
    // A–switch–B; both halves keep its armor and amplification.
    splice: {
      validate: (run, { api }) => {
        const site = spliceSite(run, api);
        return typeof site === "string" ? site : null;
      },
      play: (run, { api, id }) => {
        const site = spliceSite(run, api);
        if (typeof site === "string") return;
        const { cable, socket } = site;
        const flags = { armored: !!cable.armored, boosted: !!cable.boosted };
        api.unlink(run, cable.a, cable.b);
        const node = api.deploy(run, "switch", socket, { deployedBy: id });
        if (!node) {
          // Unreachable (validate found the socket), but never leave the route cut.
          api.link(run, cable.a, cable.b, flags);
          return;
        }
        api.link(run, cable.a, node.id, flags);
        api.link(run, node.id, cable.b, flags);
        return ` · ${node.id.toUpperCase()} spliced between ${cable.a.toUpperCase()} and ${cable.b.toUpperCase()}`;
      },
    },
    // Traceroute: "Draw N. +M damage this turn per switch on your primary route." (the draw is generic).
    traceroute: {
      play: (run, { api, values }) => {
        const switches = primaryDevices(run, api.network(run)).filter(node => node.role === "switch").length;
        const burst = (values.perSwitch ?? 0) * switches;
        run.packetBoost += burst;
        return ` · +${burst} from ${switches} switch${switches === 1 ? "" : "es"}`;
      },
    },
    // Line Rate: "Overclock every router and compress every switch on your primary route. Exhaust."
    "line-rate": {
      validate: (run, { api }) => {
        const network = api.network(run);
        if (!network.primary) return "Line Rate needs a live primary route.";
        return lineRateTargets(run, network).length ? null : "Every router and switch on your primary route is already upgraded.";
      },
      play: (run, { api }) => {
        const targets = lineRateTargets(run, api.network(run));
        for (const node of targets) {
          if (node.role === "router") node.upgraded = true;
          else node.amplified = true;
        }
        return ` · ${targets.map(node => node.id.toUpperCase()).join(", ")} at line rate`;
      },
    },
    // ---------------------------------------------------------------- Deployment
    // Rack and Stack: "Deploy a switch. Your next hardware card this turn costs N less." The engine
    // spends the discount on the next ground card (this card's own payment spent any earlier one).
    "rack-and-stack": {
      play: (run, { api, values }) => {
        const fx = api.effects(run);
        fx.hardwareDiscount = (fx.hardwareDiscount ?? 0) + (values.hardwareDiscount ?? 0);
        return ` · next hardware card −${values.hardwareDiscount ?? 0}`;
      },
    },
    // Blueprint: "Draw N. Hardware drawn this way costs 1 less this turn." The drawn ground cards join
    // `discounted` (the engine's one-less-this-turn list, shared with Rapid Redeploy).
    blueprint: {
      manual: ["draw"],
      play: (run, { api, values }) => {
        const drawn = api.draw(run, values.draw ?? 0);
        const hardware = drawn.filter(id => CARDS[id]?.target === "ground");
        if (hardware.length) (api.effects(run).discounted ??= []).push(...hardware);
        return ` · drew ${drawn.length}${hardware.length ? `, ${hardware.length} hardware cheaper` : ""}`;
      },
    },
  },
  daemons: {
    // Peering Session: "Whenever you add a channel, gain N block." Per channel gained, per copy.
    "peering-session": {
      channelsGained: ({ run, card, count, gained }) => { run.block += (card.values.block ?? 0) * gained * count; },
    },
    // Fabric Controller: "Every channel beyond the first deals +N more." (per bandwidth delivery; the
    // engine prints "Fabric Controller · 2 bandwidth deliveries").
    "fabric-controller": {
      bandwidthBonus: ({ card, count }) => (card.values.perChannel ?? 0) * count,
    },
    // Deep Buffers: "Switches on your primary route deal +N more." (per switch; also scored into the
    // choice of the primary route).
    "deep-buffers": {
      switchBonus: ({ card, count }) => (card.values.perSwitch ?? 0) * count,
    },
    // Carrier Grade: "Your primary route deals +N per device on it." A labelled route term; the
    // engine also scores it into every candidate route, so the primary route still deals the most.
    "carrier-grade": {
      routeTerms: ({ card, count, route }) => {
        const amount = (card.values.perDevice ?? 0) * count * route.length;
        return amount ? [{ label: `${label({ card, count })} · devices ×${route.length}`, amount }] : [];
      },
    },
    // Provisioning Script: "Whenever you deploy a device, gain N block."
    "provisioning-script": {
      deviceDeployed: ({ run, card, count }) => { run.block += (card.values.block ?? 0) * count; },
    },
    // Zero-Touch Provisioning: "Whenever you deploy a device, draw N."
    "zero-touch": {
      deviceDeployed: ({ run, card, count, api }) => { api.draw(run, (card.values.draw ?? 0) * count); },
    },
    // Datacenter: "Every cluster deals +N more." (per clustered band; the engine prints
    // "Datacenter · clusters ×2").
    datacenter: {
      clusterBonus: ({ card, count }) => (card.values.perCluster ?? 0) * count,
    },
  },
};
