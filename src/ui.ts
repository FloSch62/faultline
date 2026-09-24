import { CARDS, isUpgraded } from "./core/cards.ts";
import { costFor } from "./core/run.ts";
import type { BaseCardId, CardId, RunState } from "./core/types.ts";
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function icon(name: string, size = 18): string {
  const p: Record<string, string> = {
    arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
    back: '<path d="M21 12H4m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    heart:
      '<path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 8-7 5.3 5.3 0 0 1 9 6L12 21Z"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
    deck: '<rect x="5" y="5" width="13" height="16" rx="1"/><path d="M9 2h12v15M9 12l3-3 3 3-3 3-3-3Z"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
    sound:
      '<path d="M3 9v6h4l5 4V5L7 9H3Zm12 0a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
    mute: '<path d="M3 9v6h4l5 4V5L7 9H3Zm13 0 5 6m0-6-5 6"/>',
    full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    shield:
      '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    link: '<path d="m10 8 4-4a5 5 0 0 1 7 7l-4 4m-3 1-4 4a5 5 0 0 1-7-7l4-4m1 7 8-8"/>',
    sword: '<path d="m5 20 5-5m-4-3 6 6m-4-4L19 3l2 0 0 2-11 11"/>',
    elite: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>',
    cache: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11"/>',
    forge:
      '<path d="m4 3 5 5-1 4-5-1a6 6 0 0 0 8 6l5 5 5-5-5-5a6 6 0 0 0-8-8l3 4-3 3-4-4Z"/>',
    boss: '<path d="m12 1 3 6 7 2-4 6 1 7-7-3-7 3 1-7-4-6 7-2 3-6Z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    download: '<path d="M12 2v14m-5-5 5 5 5-5M4 17v5h16v-5"/>',
    book: '<path d="M12 5C8 2 4 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v16"/>',
    undo: '<path d="M4 4v7h7M4 11c3-9 16-7 16 2a7 7 0 0 1-7 7"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    field: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 5 3v5l-5 3-5-3v-5l5-3Z"/><path d="M12 2v5m9 0-4 3m4 7-4-2m-5 7v-4m-9-1 4-2M3 7l4 3"/>',
    cleanse: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    eye: '<circle cx="11" cy="10" r="7"/><circle cx="11" cy="10" r="3"/><path d="m16 15 5 6M11 1v3M2 10h3m12 0h3"/>',
    battery: '<path d="M8 3h8v3h3v15H5V6h3V3Z"/><path d="m13 8-4 6h4l-1 4 4-6h-4l1-4Z"/>',
    anchor: '<path d="M12 7v14M3 13l2 5 7 4 7-4 2-5M7 10h10"/><circle cx="12" cy="4" r="3"/>',
    coins: '<path d="m12 3 8 5v8l-8 5-8-5V8l8-5Z"/><path d="m12 7 4 3v4l-4 3-4-3v-4l4-3Z"/>',
    crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 14H5L2 6Z"/>',
    // v3 battle HUD
    console: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m7 9 3 2.5L7 14m5 0h5M8 21h8"/>',
    protocol: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="M12 7v5l3 2"/>',
    trigger: '<path d="m13 2-8 11h6l-1 9 9-12h-6l0-8Z"/><path d="M3 7h3M18 17h3"/>',
    malware: '<path d="M12 3 20 8v8l-8 5-8-5V8l8-5Z"/><path d="M9 10h.01M15 10h.01M9 15c2-1.5 4-1.5 6 0M4 8 1 6m22 0-3 2M4 16l-3 2m22 0-3-2"/>',
    channels: '<circle cx="3.5" cy="12" r="2"/><circle cx="20.5" cy="12" r="2"/><path d="M5.5 11c4-6 9-6 13 0M5.5 13c4 6 9 6 13 0M5.5 12h13"/>',
    online: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8m12.8 0a9 9 0 0 0 0-12.8M8.5 8.5a5 5 0 0 0 0 7m7 0a5 5 0 0 0 0-7"/>',
    terrain: '<path d="m2 20 6-9 4 5 3-4 7 8H2Z"/><path d="m8 11 2-7 2 4"/>',
    buffer: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    pressure: '<path d="M4 20V10l8-6 8 6v10"/><path d="M8 20v-6h8v6M12 4v6"/>',
    trap: '<path d="M4 18h16M6 18l2-6h8l2 6"/><path d="M9 12 7 6m8 6 2-6M12 12V4"/>',
    cluster: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="15" r="3"/><path d="M4 21h16"/>',
    next: '<path d="M4 12h12m-4-5 5 5-5 5M20 5v14"/>',
    scrub: '<path d="m4 20 8-8m2-6 4 4-7 7-4-4 7-7Z"/><path d="M15 3l6 6"/>',
    warning: '<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/><path d="M12 3a6 6 0 0 1 6 6h-6V3Z" fill="currentColor" stroke="none"/>',
    rise: '<path d="m5 15 7-7 7 7"/>',
    "chevron-left": '<path d="m15 4-8 8 8 8"/>',
    "chevron-right": '<path d="m9 4 8 8-8 8"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.bolt}</svg>`;
}
/* ------------------------------------------------------------------ card art
Each base card has its own painting. Upgrades share their base card's artwork. */

type Atlas = "base" | "alpha" | "tools" | "zones";
const ATLAS: Record<Atlas, { file: string; grid: number }> = {
  base: { file: "art/card-atlas.png", grid: 3 },
  alpha: { file: "art/alpha-card-atlas.png", grid: 4 },
  tools: { file: "art/containerlab-tools-atlas.png", grid: 2 },
  zones: { file: "art/zone-card-atlas.png", grid: 2 },
};
/** Exhaustive so a new card cannot silently inherit an unrelated illustration. */
const CARD_ART: Record<BaseCardId, [Atlas, number] | string> = {
  router: ["base", 0], switch: ["base", 1], firewall: ["base", 2], fiber: ["base", 3], crosslink: ["base", 4],
  shield: ["base", 5], patch: ["base", 6], surge: ["base", 7], firmware: ["base", 8],
  guard: ["alpha", 0], pulse: ["alpha", 1], diagnostic: ["alpha", 2], reroute: ["alpha", 3], barrier: ["alpha", 4],
  capacitor: ["alpha", 5], relay: ["alpha", 6], "hardened-router": ["alpha", 7], bastion: ["alpha", 8],
  duplex: ["alpha", 9], "armored-fiber": ["alpha", 10], conduit: ["alpha", 11], salvage: ["alpha", 12],
  mirror: ["alpha", 13], "zero-day": ["alpha", 14], compression: ["alpha", 15],
  "startup-config": ["tools", 0], "linux-bridge": ["tools", 1], vxlan: ["tools", 2], inspect: ["tools", 3],
  "resonance-field": ["zones", 0], "aegis-field": ["zones", 1], "purge-field": ["zones", 2], "null-field": ["zones", 3],
  containerlab: "art/containerlab.png",
  clabernetes: "art/clabernetes.png",
  wireshark: "art/wireshark.png",
  "honeypot": "art/cards/honeypot.png",
  "cache-server": "art/cards/cache-server.png",
  "poe-injector": "art/cards/poe-injector.png",
  "load-balancer": "art/cards/load-balancer.png",
  "failover-policy": "art/cards/failover-policy.png",
  "port-security": "art/cards/port-security.png",
  "rate-limiter": "art/cards/rate-limiter.png",
  "ips-signature": "art/cards/ips-signature.png",
  "quarantine-rule": "art/cards/quarantine-rule.png",
  "tarpit": "art/cards/tarpit.png",
  "ecmp": "art/cards/ecmp.png",
  "spine-leaf": "art/cards/spine-leaf.png",
  "mesh-weave": "art/cards/mesh-weave.png",
  "deep-inspection": "art/cards/deep-inspection.png",
  "stateful-firewall": "art/cards/stateful-firewall.png",
  "reflect": "art/cards/reflect.png",
  "store-forward": "art/cards/store-forward.png",
  "replay-attack": "art/cards/replay-attack.png",
  "dark-fiber": "art/cards/dark-fiber.png",
  "packet-loss": "art/cards/packet-loss.png",
  "worm": "art/cards/worm.png",
  "cve": "art/cards/cve.png",
  "rebuild": "art/cards/rebuild.png",
  "emergency": "art/cards/emergency.png",
  "protocol": "art/cards/protocol.png",
  // v4 (Under Quarantine): local Krea 2 paintings, docs/art-v3-manifest.json.
  "broadcast-storm": "art/cards/broadcast-storm.png",
  "traffic-shaping": "art/cards/traffic-shaping.png",
  "flood-fill": "art/cards/flood-fill.png",
  "bulkhead": "art/cards/bulkhead.png",
  "spearhead": "art/cards/spearhead.png",
  "packet-storm": "art/cards/packet-storm.png",
  "quorum": "art/cards/quorum.png",
  "server-rack": "art/cards/server-rack.png",
  "redundant-psu": "art/cards/redundant-psu.png",
  "sentry-firewall": "art/cards/sentry-firewall.png",
  "demolition-charge": "art/cards/demolition-charge.png",
  "field-repair": "art/cards/field-repair.png",
  "rapid-redeploy": "art/cards/rapid-redeploy.png",
  "phantom-node": "art/cards/phantom-node.png",
  // v5 (Three Energy): webp paintings from the art agent, docs/art-v5-manifest.json.
  "ping": "art/cards/ping.webp", "hotfix": "art/cards/hotfix.webp", "keepalive": "art/cards/keepalive.webp",
  "rollback": "art/cards/rollback.webp", "firmware-update": "art/cards/firmware-update.webp",
  "zombie-process": "art/cards/zombie-process.webp", "kernel-panic": "art/cards/kernel-panic.webp",
  "backdoor": "art/cards/backdoor.webp", "bitrot": "art/cards/bitrot.webp",
  "memory-leak": "art/cards/memory-leak.webp", "branch-line": "art/cards/branch-line.webp",
  "patch-panel": "art/cards/patch-panel.webp", "redundant-paths": "art/cards/redundant-paths.webp",
  "standby-router": "art/cards/standby-router.webp", "peering-session": "art/cards/peering-session.webp",
  "fabric-controller": "art/cards/fabric-controller.webp", "trunk-line": "art/cards/trunk-line.webp",
  "splice": "art/cards/splice.webp", "traceroute": "art/cards/traceroute.webp",
  "deep-buffers": "art/cards/deep-buffers.webp", "line-rate": "art/cards/line-rate.webp",
  "carrier-grade": "art/cards/carrier-grade.webp", "rack-and-stack": "art/cards/rack-and-stack.webp",
  "blueprint": "art/cards/blueprint.webp", "provisioning-script": "art/cards/provisioning-script.webp",
  "zero-touch": "art/cards/zero-touch.webp", "datacenter": "art/cards/datacenter.webp",
  "brace": "art/cards/brace.webp", "pushback": "art/cards/pushback.webp", "stand-firm": "art/cards/stand-firm.webp",
  "vent": "art/cards/vent.webp", "double-shift": "art/cards/double-shift.webp",
  "entrench": "art/cards/entrench.webp", "persistent-state": "art/cards/persistent-state.webp",
  "flow-control": "art/cards/flow-control.webp", "acl-gate": "art/cards/acl-gate.webp",
  "perimeter": "art/cards/perimeter.webp", "defense-in-depth": "art/cards/defense-in-depth.webp",
  "tripwire": "art/cards/tripwire.webp", "policy-engine": "art/cards/policy-engine.webp",
  "rearm": "art/cards/rearm.webp", "incident-response": "art/cards/incident-response.webp",
  "null-route": "art/cards/null-route.webp", "jitter-buffer": "art/cards/jitter-buffer.webp",
  "hold-queue": "art/cards/hold-queue.webp", "flush": "art/cards/flush.webp", "trickle": "art/cards/trickle.webp",
  "deep-queue": "art/cards/deep-queue.webp", "exfiltrate": "art/cards/exfiltrate.webp",
  "spoof": "art/cards/spoof.webp", "decoy-swarm": "art/cards/decoy-swarm.webp",
  "ghost-protocol": "art/cards/ghost-protocol.webp", "obfuscation": "art/cards/obfuscation.webp",
  "fork-bomb": "art/cards/fork-bomb.webp", "shell-access": "art/cards/shell-access.webp",
  "side-channel": "art/cards/side-channel.webp", "payload": "art/cards/payload.webp",
  "exploit-kit": "art/cards/exploit-kit.webp", "botnet": "art/cards/botnet.webp",
  "cover-tracks": "art/cards/cover-tracks.webp", "man-in-the-middle": "art/cards/man-in-the-middle.webp",
};

function atlasStyle(atlas: Atlas, cell: number) {
  const { file, grid } = ATLAS[atlas], step = 100 / (grid - 1);
  return `--card-image:url('${asset(file)}');--art-size:${grid * 100}% ${grid * 100}%;--art-x:${(cell % grid) * step}%;--art-y:${Math.floor(cell / grid) * step}%`;
}
/** CSS custom properties that paint a card's picture (upgraded ids share the base art). */
export function artStyle(id: string) {
  const base = (id.endsWith("+") ? id.slice(0, -1) : id) as BaseCardId;
  const art = CARD_ART[base];
  if (typeof art === "string") return `--card-image:url('${asset(art)}');--art-size:cover;--art-x:50%;--art-y:50%`;
  return atlasStyle(art[0], art[1]);
}

const ARCHETYPE_MARK: Record<string, string> = { architect: "Architect", warden: "Warden", ghost: "Ghost" };
/** Type lines are set in the label face's small caps: "HOST BRIDGE" reads "Host Bridge". */
const typeWords = (text: string) => text.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()).replace(/\bQos\b/, "QoS");
export function cardMarkup(
  id: CardId,
  index = 0,
  variant: "hand" | "reward" | "collection" = "hand",
  run?: RunState,
  selected = false,
) {
  const c = CARDS[id];
  const inHand = variant === "hand" && !!run;
  const cost = inHand ? costFor(run!, index) : c.cost;
  const central = inHand ? index - (run!.hand.length - 1) / 2 : 0;
  const junk = !!(c.junk || c.curse);
  const upgradedCard = isUpgraded(id);
  const blocked = inHand && (c.unplayable || cost > run!.energy);
  const kind = c.protocol ? "protocol" : junk ? "junk" : c.target;
  const type = junk
    ? `${c.curse ? "Curse" : "Junk"} · ${c.unplayable ? "Unplayable" : "Delete it"}`
    : `${typeWords(c.subtitle.split(" / ").at(-1)!)}${c.protocol ? " · Armed" : ""}${c.exhaust ? " · Exhaust" : ""}`;
  const rarity = c.rarity === "special" ? (c.curse ? "Curse" : "Junk") : typeWords(c.rarity);
  const label = `${c.name}, ${c.unplayable ? "unplayable" : `${cost} energy`}. ${c.rules}`;
  // --name-len lets the nameplate shrink a long name to fit instead of wrapping it.
  return `<button class="game-card rarity-${c.rarity} kind-${kind} ${upgradedCard ? "upgraded" : ""} ${junk ? "junk-card" : ""} ${c.curse ? "curse-card" : ""} ${selected ? "selected" : ""} ${blocked ? "unplayable" : ""}" data-${variant}="${variant === "hand" ? index : id}" data-card-id="${id}" style="${artStyle(id)};--card-color:${c.color};--angle:${Math.max(-10, Math.min(10, central * 3))}deg;--lift:${Math.min(15, Math.abs(central) * 5)}px;--order:${index};--name-len:${Math.max(10, c.name.length)}" aria-label="${esc(label)}"><span class="card-image"></span><span class="card-etch"></span><span class="card-cost ${c.unplayable ? "no-cost" : ""}">${c.unplayable ? icon("close", 14) : cost}</span>${upgradedCard ? '<span class="card-upgrade-mark" aria-hidden="true">+</span>' : ""}<span class="card-heading"><span class="card-name">${esc(c.name)}</span></span><span class="card-copy"><span class="card-type">${type}</span><span class="card-rule">${esc(c.rules)}</span></span><span class="card-footer"><span>${rarity}</span><span class="card-gem" aria-hidden="true"></span><span>${variant === "hand" ? `<kbd>${index === 9 ? "0" : index + 1}</kbd>` : c.archetype ? ARCHETYPE_MARK[c.archetype] : ""}</span></span></button>`;
}
