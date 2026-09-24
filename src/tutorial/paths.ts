/** The keepers' build paths (v5 · Three Energy, contract section 9): three per keeper, each with its
 * keeper cards (enablers and payoffs) and the colorless partners that feed it. Presentation data for
 * the Handbook and the design document's card tables: names, costs, rarities and faces are always
 * read from CARDS, so only the grouping lives here. A test checks that every keeper card belongs to
 * exactly one path. No DOM, no import.meta: this module runs in node tests and scripts. */
import type { Archetype, BaseCardId } from "../core/types.ts";

export interface BuildPath {
  id: string;
  name: string;
  /** What the path builds toward, in one line. */
  idea: string;
  /** How it plays at three energy: the enablers first, then the payoffs. */
  play: string;
  /** The keeper's own cards on this path, enablers before payoffs. */
  cards: readonly BaseCardId[];
  /** Colorless cards that feed the path. */
  partners: readonly BaseCardId[];
}

export const BUILD_PATHS: Record<Archetype, readonly BuildPath[]> = {
  architect: [
    {
      id: "mesh", name: "Mesh", idea: "Channels and width: every channel beyond the first is another delivery.",
      play: "Standby Router, Branch Line and Patch Panel make channels cheap; Peering Session and Redundant Paths pay block for them; Equal-Cost Multipath, Flood Fill, Mirror Protocol and Fabric Controller cash the width in.",
      cards: ["branch-line", "patch-panel", "standby-router", "mesh-weave", "spine-leaf", "redundant-paths", "peering-session", "ecmp", "flood-fill", "mirror", "fabric-controller"],
      partners: ["load-balancer", "linux-bridge", "crosslink", "duplex"],
    },
    {
      id: "backbone", name: "Backbone", idea: "One long, upgraded primary route that hits harder every turn.",
      play: "Splice lengthens the route, Line Rate upgrades all of it at once; Deep Buffers and Carrier Grade make every device on it count; Trunk Line and Traceroute read it as burst.",
      cards: ["splice", "traceroute", "trunk-line", "deep-buffers", "line-rate", "carrier-grade"],
      partners: ["compression", "firmware", "wireshark", "conduit"],
    },
    {
      id: "deployment", name: "Deployment", idea: "Hardware tempo: cheap deploys, clusters and device triggers.",
      play: "Rack and Stack, Blueprint and Rapid Redeploy discount hardware; Provisioning Script and Zero-Touch Provisioning pay for every deploy; Datacenter rewards crowded bands.",
      cards: ["rack-and-stack", "blueprint", "rapid-redeploy", "provisioning-script", "zero-touch", "datacenter"],
      partners: ["poe-injector", "cache-server", "rebuild", "containerlab", "clabernetes"],
    },
  ],
  warden: [
    {
      id: "fortress", name: "Fortress", idea: "Block that becomes backpressure, and block that stays.",
      play: "Brace, Stand Firm, Pushback and Double Shift raise the wall; Hardening Guide grows every Harden; Persistent State keeps the block, Entrench doubles it; Flow Control, Vent and Reflect turn what it stopped into damage.",
      cards: ["brace", "pushback", "stand-firm", "vent", "double-shift", "hardening-guide", "entrench", "persistent-state", "flow-control", "reflect"],
      partners: ["barrier", "aegis-field", "null-field", "quorum", "duplex"],
    },
    {
      id: "firewall", name: "Firewall wall", idea: "Many firewalls online, and cards that pay per firewall.",
      play: "ACL Gate, Stateful, Sentry and Bastion firewalls fill the route; Deep Packet Inspection and Perimeter pay per online firewall; Bulkhead and Defense in Depth make every firewall block more.",
      cards: ["deep-inspection", "acl-gate", "stateful-firewall", "sentry-firewall", "bastion", "bulkhead", "perimeter", "defense-in-depth"],
      partners: ["firewall", "honeypot", "server-rack", "hardened-router"],
    },
    {
      id: "protocols", name: "Protocols", idea: "Armed traps that answer the forecast and hit back.",
      play: "Policy Engine opens more slots and Rearm replays the best protocol; Tripwire and Null Route punish and cancel; Incident Response makes every protocol that fires deal damage.",
      cards: ["tripwire", "policy-engine", "rearm", "incident-response", "null-route"],
      partners: ["failover-policy", "port-security", "rate-limiter", "ips-signature", "quarantine-rule", "tarpit"],
    },
  ],
  ghost: [
    {
      id: "buffer", name: "Buffer", idea: "Store transmissions, multiply them, release one spike.",
      play: "Store and Forward, Jitter Buffer, Hold Queue and Trickle fill the buffer; Deep Queue multiplies what the console stores; Replay Attack doubles it, Spearhead and Exfiltrate land it through armor; Flush is burst while it waits.",
      cards: ["store-forward", "jitter-buffer", "hold-queue", "trickle", "deep-queue", "replay-attack", "flush", "spearhead", "exfiltrate"],
      partners: ["zero-day", "traffic-shaping", "diagnostic"],
    },
    {
      id: "evasion", name: "Evasion", idea: "Misses, dodges, phantoms and cut-proof lines.",
      play: "Spoof and Obfuscation make jams and cuts miss; Phantom Node and Decoy Swarm absorb disruption; Dark Fiber lays lines that cannot be cut; Ghost Protocol makes the biggest hit deal 0.",
      cards: ["spoof", "dark-fiber", "phantom-node", "decoy-swarm", "obfuscation", "ghost-protocol"],
      partners: ["armored-fiber", "shield", "failover-policy"],
    },
    {
      id: "payloads", name: "Payloads", idea: "Payload tokens, long card chains and exhaust.",
      play: "Fork Bomb, Shell Access and Botnet make Payloads; Exploit Kit makes each hit harder; Side Channel and Man-in-the-Middle pay for every card played; Cover Tracks pays for every card exhausted.",
      cards: ["fork-bomb", "shell-access", "botnet", "exploit-kit", "side-channel", "man-in-the-middle", "cover-tracks", "payload"],
      partners: ["crosslink", "inspect", "ping", "hotfix"],
    },
  ],
};
