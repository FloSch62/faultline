/** Colorless cards: the shared pool every keeper can be offered (contract section 7). DATA ONLY:
 * this file imports rules.ts and card-types.ts and nothing else; behaviour lives in
 * src/core/effects/colorless.ts (new cards) or in the engine's legacy if-chains (v4 cards).
 *
 * PHASE C (colorless agent): the table is `CardTable<ColorlessCardId>`, a partial record, so
 * definitions are added here and nowhere else. `missingCards("colorless")` (cards.ts) lists the ids
 * still undefined; once it is empty, turn the completeness check on in your test file:
 *   assert.deepEqual(missingCards("colorless"), []);
 * Still missing: ping, hotfix, rollback, firmware-update. Keepalive is the engine's worked example
 * of a daemon (definition here, turnStart hook in effects/colorless.ts, test in engine-v5.test.ts).
 *
 * Faces are generated from `values` (`text`), so tuning a number changes the face; RULES numbers are
 * read from rules.ts. Long exceptions go in `detail`. */
import { RULES as R } from "../rules.ts";
import type { CardTable, ColorlessCardId } from "../card-types.ts";

/** Reach radius as printed on cards and plates ("2.0"). */
const REACH = R.reach.toFixed(1);
const words = ["no", "one", "two", "three", "four", "five", "six"];
/** "two nearest devices", "one nearest device". */
const devices = (n = 1) => `${words[n] ?? n} nearest device${n === 1 ? "" : "s"}`;
const block = (n?: number) => (n ? ` Gain ${n} block.` : "");

export const COLORLESS_CARDS: CardTable<ColorlessCardId> = {
  // ---------------------------------------------------------------- fields
  "resonance-field": {
    name: "Resonance Field", subtitle: "FIELD / AMPLIFY", cost: 1, rarity: "common", target: "zone", art: "program", color: "#e9c47c",
    rules: `Choose a band. For ${R.alliedFieldTurns} turns, your primary route deals +${R.resonanceDamage} while it crosses it.`,
    detail: "A band counts once per field: a cast Resonance Field and a Crystal vein on the same band stack.",
    upgrade: { cost: 0 },
  },
  "aegis-field": {
    name: "Aegis Field", subtitle: "FIELD / FORTIFY", cost: 1, rarity: "uncommon", target: "zone", art: "defense", color: "#91d5c4",
    rules: `Choose a band. For ${R.alliedFieldTurns} turns, gain ${R.aegisShield} shield each turn while an online device is in it.`,
    upgrade: { cost: 0 },
  },
  "purge-field": {
    name: "Purge Field", subtitle: "FIELD / CLEANSE", cost: 0, rarity: "common", target: "zone", art: "program", color: "#d1eee2", exhaust: true,
    text: v => `Cleanse a band: destroy its installations, hostile fields and jams. Draw ${v.draw}. Exhaust.`,
    detail: "An Anchor takes the whole purge: on an anchored band, Purge Field destroys the Anchor and nothing else; purge again for the fields.",
    values: { draw: 1 },
    upgrade: { values: { draw: 2 } },
  },
  "null-field": {
    name: "Null Field", subtitle: "FIELD / DAMPEN", cost: 1, rarity: "uncommon", target: "zone", art: "defense", color: "#b5a6e1",
    rules: `Choose a band. For ${R.alliedFieldTurns} turns, gain ${R.nullFieldShield} shield each turn while your hardware is in it.`,
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- hardware
  router: {
    name: "Core Router", subtitle: "HARDWARE / ROUTING", cost: 1, rarity: "basic", target: "ground", role: "router", art: "hardware", color: "#58f0d5",
    text: v => `Deploy a router. ALPHA → router → OMEGA is a route that deals ${R.baseRouteDamage}.${block(v.block)}`,
    upgrade: { values: { block: 3 } },
  },
  switch: {
    name: "Edge Switch", subtitle: "HARDWARE / FABRIC", cost: 0, rarity: "basic", target: "ground", role: "switch", art: "hardware", color: "#9facff",
    text: v => `Deploy a switch: +${R.switchDamage} damage while on your primary route.${block(v.block)}`,
    upgrade: { values: { block: 3 } },
  },
  firewall: {
    name: "Trust Gate", subtitle: "HARDWARE / SECURITY", cost: 1, rarity: "common", target: "ground", role: "firewall", art: "defense", color: "#ffba7b",
    text: v => `Deploy a firewall. Online, it blocks ${R.firewallBreachBlock} of each breach and ${R.firewallStrikeBlock} of each strike.${block(v.block)}`,
    detail: "Firewalls stack, block attacks from every hostile, and quarantine the nearest installation within reach each enemy phase.",
    upgrade: { values: { block: 3 } },
  },
  honeypot: {
    name: "Honeypot", subtitle: "HARDWARE / DECEPTION", cost: 1, rarity: "common", target: "ground", role: "honeypot", art: "defense", color: "#f3a35f",
    rules: `Deploy a decoy. Linked, it draws each jam, cut and overload and hits back for ${R.honeypotDamage}.`,
    detail: `It works offline while it has a cable, taking one disruption per hostile action (Cable Wraith's cut ignores it). Installations planted within ${REACH} of it arrive with ${R.honeypotBite} less integrity.`,
    upgrade: { cost: 0 },
  },
  "cache-server": {
    name: "Cache Server", subtitle: "HARDWARE / STORAGE", cost: 2, rarity: "uncommon", target: "ground", role: "cache", art: "hardware", color: "#8fc8ff",
    rules: "Deploy a cache server. Online: draw 1 more card each turn.",
    upgrade: { cost: 1 },
  },
  "poe-injector": {
    name: "PoE Injector", subtitle: "HARDWARE / POWER", cost: 2, rarity: "rare", target: "ground", role: "power", art: "hardware", color: "#ffd36b",
    rules: "Deploy a power injector. Online: +1 energy each turn.",
    detail: "Online at the start of your turn. This energy comes on top of your turn's base and is never capped.",
    upgrade: { cost: 1 },
  },
  "load-balancer": {
    name: "Load Balancer", subtitle: "HARDWARE / DISTRIBUTION", cost: 2, rarity: "uncommon", target: "ground", role: "balancer", art: "hardware", color: "#7fe0b8",
    rules: `Deploy a load balancer. Online: +${R.balancerPerChannel} damage per live channel.`,
    upgrade: { cost: 1 },
  },
  relay: {
    name: "Signal Relay", subtitle: "HARDWARE / FABRIC", cost: 1, rarity: "common", target: "ground", role: "switch", art: "hardware", color: "#a5b4ff", jamProof: true,
    text: v => `Deploy a jam-proof switch (+${R.switchDamage} on your primary route). Draw ${v.draw}.`,
    values: { draw: 1 },
    upgrade: { cost: 0 },
  },
  "hardened-router": {
    name: "Hardened Router", subtitle: "HARDWARE / ROUTING", cost: 1, rarity: "uncommon", target: "ground", role: "router", art: "hardware", color: "#b1d8dc", jamProof: true,
    text: v => `Deploy a jam-proof router.${block(v.block)}`,
    values: { block: 3 },
    upgrade: { values: { block: 6 } },
  },
  "linux-bridge": {
    name: "Linux Bridge", subtitle: "CONTAINERLAB / HOST BRIDGE", cost: 1, rarity: "common", target: "ground", role: "switch", art: "hardware", color: "#a2bdce",
    text: v => `Deploy a switch linked to its ${devices(v.links)}.`,
    detail: "It links to the nearest devices it is not already cabled to (distance ties: device ids).",
    values: { links: 2 },
    upgrade: { cost: 0 },
  },
  "server-rack": {
    name: "Server Rack", subtitle: "HARDWARE / CHASSIS", cost: 1, rarity: "uncommon", target: "ground", role: "rack", art: "hardware", color: "#b5cf7a",
    text: v => `Deploy a rack: devices within ${REACH} pass their wear to it.${block(v.block)}`,
    detail: `Condition ${R.rackCondition}. Never cabled: it carries no signal and leaves no wreckage. Overloads, Spikes and blasts aimed at a device in its ring wear the rack instead. It counts toward its band's cluster.`,
    values: { block: 3 },
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- cables
  fiber: {
    name: "Optic Fiber", subtitle: "INFRASTRUCTURE / LINK", cost: 1, rarity: "basic", target: "link", art: "cable", color: "#59cfff",
    text: v => `Link two devices.${v.draw ? ` Draw ${v.draw}.` : ""}`,
    upgrade: { values: { draw: 1 } },
  },
  crosslink: {
    name: "Crosslink", subtitle: "INFRASTRUCTURE / LINK", cost: 0, rarity: "uncommon", target: "link", art: "cable", color: "#e5a1ff", exhaust: true,
    text: v => `Link two devices. Draw ${v.draw}. Exhaust.`,
    values: { draw: 1 },
    upgrade: { values: { draw: 2 } },
  },
  duplex: {
    name: "Duplex Link", subtitle: "COMMON / LINK", cost: 1, rarity: "common", target: "link", art: "cable", color: "#8bc9d6",
    text: v => `Link two devices.${block(v.block)}`,
    values: { block: 3 },
    upgrade: { values: { block: 5 } },
  },
  "armored-fiber": {
    name: "Armored Fiber", subtitle: "COMMON / LINK", cost: 1, rarity: "common", target: "link", art: "cable", color: "#b7c4ca", cutProof: true,
    rules: "Link two devices with a cut-proof cable.",
    detail: "A cut-proof cable never frays over wreckage either.",
    upgrade: { cost: 0 },
  },
  conduit: {
    name: "Amplified Fiber", subtitle: "COMMON / LINK", cost: 1, rarity: "common", target: "link", art: "cable", color: "#f0b086", amplified: true,
    rules: `Link two devices: +${R.amplifiedCableDamage} damage while on your primary route.`,
    upgrade: { cost: 0 },
  },
  vxlan: {
    name: "VXLAN Tunnel", subtitle: "CONTAINERLAB / OVERLAY", cost: 1, rarity: "uncommon", target: "link", art: "cable", color: "#bba3e3", cutProof: true, amplified: true,
    rules: `Link two devices with a cut-proof cable: +${R.amplifiedCableDamage} damage on your primary route.`,
    detail: "A cut-proof cable never frays over wreckage either.",
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- node upgrades
  shield: {
    name: "Faraday Shell", subtitle: "SYSTEM / DEFENSE", cost: 1, rarity: "uncommon", target: "node", art: "defense", color: "#f4ce82", exhaust: true,
    rules: "Make a device jam-proof and clear its jam. Exhaust.",
    detail: "Jam-proof does not stop an overload.",
    upgrade: { cost: 0 },
  },
  firmware: {
    name: "Overclock", subtitle: "SYSTEM / UPGRADE", cost: 1, rarity: "rare", target: "node", art: "program", color: "#ff8ca8", exhaust: true,
    rules: `Overclock a router: +${R.overclockDamage} damage while on your primary route. Exhaust.`,
    upgrade: { cost: 0 },
  },
  compression: {
    name: "Packet Compression", subtitle: "UNCOMMON / UPGRADE", cost: 1, rarity: "uncommon", target: "node", art: "program", color: "#b0a5e6", exhaust: true,
    rules: `Compress a switch: +${R.compressionDamage} damage while on your primary route. Exhaust.`,
    upgrade: { cost: 0 },
  },
  "startup-config": {
    name: "Startup Config", subtitle: "CONTAINERLAB / CONFIGURATION", cost: 0, rarity: "common", target: "node", art: "program", color: "#88cfb5", exhaust: true,
    text: v => `Configure a router: +${R.configuredDamage} damage while on your primary route.${block(v.block)} Exhaust.`,
    upgrade: { values: { block: 4 } },
  },
  clabernetes: {
    name: "Clabernetes", subtitle: "SYSTEM / REPLICATION", cost: 2, rarity: "legendary", target: "node", art: "hardware", color: "#9ccbd2", exhaust: true,
    rules: "Clone a router with its cables and upgrades. Both become jam-proof. Exhaust.",
    detail: "The replica takes the first free auto-deploy socket; the new disjoint path is instant bandwidth.",
    upgrade: { cost: 1 },
  },
  "redundant-psu": {
    name: "Redundant PSU", subtitle: "SYSTEM / POWER", cost: 1, rarity: "common", target: "node", art: "hardware", color: "#e3c170", exhaust: true,
    text: v => `Restore a device fully; its maximum condition is ${R.psuCondition} this battle.${block(v.block)} Exhaust.`,
    values: { block: 2 },
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- instants
  patch: {
    name: "Hot Patch", subtitle: "SYSTEM / REPAIR", cost: 1, rarity: "basic", target: "instant", art: "program", color: "#7ceebc",
    text: v => `Clear every jam and cut. Repair your most worn device by ${R.faultClearRepair}. Draw ${v.draw}.`,
    values: { draw: 1 },
    upgrade: { values: { draw: 2 } },
  },
  surge: {
    name: "Power Surge", subtitle: "SYSTEM / ENERGY", cost: 0, rarity: "rare", target: "instant", art: "program", color: "#ffd278", exhaust: true,
    text: v => `Gain ${v.energy} energy. Draw ${v.draw}. Exhaust.`,
    values: { energy: 1, draw: 2 },
    upgrade: { values: { energy: 2, draw: 2 } },
  },
  containerlab: {
    name: "Containerlab", subtitle: "SYSTEM / ORCHESTRATION", cost: 2, rarity: "rare", target: "instant", art: "hardware", color: "#e7c37d", exhaust: true,
    rules: `Deploy an overclocked router linked to ALPHA and OMEGA: a new ${R.baseRouteDamage + R.overclockDamage}-damage route. Exhaust.`,
    upgrade: { cost: 1 },
  },
  guard: {
    name: "Packet Guard", subtitle: "BASIC / DEFENSE", cost: 1, rarity: "basic", target: "instant", art: "defense", color: "#82d8ed",
    text: v => `Gain ${v.block} block.`,
    values: { block: 4 },
    upgrade: { values: { block: 7 } },
  },
  pulse: {
    name: "Packet Burst", subtitle: "BASIC / OFFENSE", cost: 1, rarity: "basic", target: "instant", art: "program", color: "#ff9a82",
    text: v => `+${v.burst} damage this turn.`,
    values: { burst: 3 },
    upgrade: { values: { burst: 5 } },
  },
  diagnostic: {
    name: "Deep Scan", subtitle: "COMMON / DRAW", cost: 1, rarity: "common", target: "instant", art: "program", color: "#9ec0ff",
    text: v => `Draw ${v.draw}.`,
    detail: `Your hand holds at most ${R.handLimit} cards; draws beyond it stay in the draw pile.`,
    values: { draw: 3 },
    upgrade: { values: { draw: 4 } },
  },
  reroute: {
    name: "Fast Reroute", subtitle: "UNCOMMON / REPAIR", cost: 0, rarity: "uncommon", target: "instant", art: "program", color: "#79e7c3", exhaust: true,
    text: v => `Clear every jam and cut. Repair your most worn device by ${R.faultClearRepair}.${block(v.block)} Draw ${v.draw}. Exhaust.`,
    values: { block: 2, draw: 1 },
    upgrade: { values: { block: 4, draw: 1 } },
  },
  barrier: {
    name: "Aegis Protocol", subtitle: "UNCOMMON / DEFENSE", cost: 2, rarity: "uncommon", target: "instant", art: "defense", color: "#c3beff",
    text: v => `Gain ${v.block} block.`,
    values: { block: 9 },
    upgrade: { values: { block: 13 } },
  },
  capacitor: {
    name: "Power Capacitor", subtitle: "COMMON / RESERVE", cost: 0, rarity: "common", target: "instant", art: "program", color: "#ffcf79", exhaust: true,
    text: v => `Gain ${v.block} block. Next turn: +${v.nextEnergy} energy. Exhaust.`,
    values: { block: 3, nextEnergy: 1 },
    upgrade: { values: { block: 6, nextEnergy: 1 } },
  },
  salvage: {
    name: "Salvage Cycle", subtitle: "COMMON / RECOVERY", cost: 0, rarity: "common", target: "instant", art: "program", color: "#98ceb0", exhaust: true,
    text: v => `Return your ${v.recover} most recent cable cards from discard to hand. Exhaust.`,
    values: { recover: 2 },
    upgrade: { values: { recover: 3 } },
  },
  rebuild: {
    name: "Emergency Rebuild", subtitle: "UNCOMMON / DEPLOY", cost: 1, rarity: "uncommon", target: "instant", art: "hardware", color: "#a9cbc2", exhaust: true,
    rules: `Deploy a router linked to ALPHA and OMEGA: a new ${R.baseRouteDamage}-damage route. Exhaust.`,
    upgrade: { cost: 0 },
  },
  "zero-day": {
    name: "Zero Day", subtitle: "RARE / OFFENSE", cost: 2, rarity: "rare", target: "instant", art: "program", color: "#ed8e9f", exhaust: true,
    text: v => `+${v.burst} damage this turn. Exhaust.`,
    values: { burst: 10 },
    upgrade: { values: { burst: 14 } },
  },
  emergency: {
    name: "Emergency Repair", subtitle: "RARE / RECOVERY", cost: 2, rarity: "rare", target: "instant", art: "defense", color: "#8fd3af", exhaust: true,
    text: v => `Restore ${v.heal} integrity.${block(v.block)} Exhaust.`,
    values: { heal: 3, block: 3 },
    upgrade: { values: { heal: 5, block: 5 } },
  },
  protocol: {
    name: "Link Recovery", subtitle: "COMMON / REPAIR", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#91bacf",
    text: v => `Clear every jam and cut. Repair your most worn device by ${R.faultClearRepair}.${block(v.block)}`,
    values: { block: 3 },
    upgrade: { values: { block: 6 } },
  },
  inspect: {
    name: "Clab Inspect", subtitle: "CONTAINERLAB / OBSERVABILITY", cost: 0, rarity: "common", target: "instant", art: "program", color: "#93d1d6", exhaust: true,
    text: v => `Draw ${v.draw} (${v.drawOffline} without a live route). Exhaust.`,
    values: { draw: 2, drawOffline: 1 },
    upgrade: { values: { draw: 3, drawOffline: 2 } },
  },
  wireshark: {
    name: "Wireshark", subtitle: "OBSERVABILITY / PACKET CAPTURE", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#86c9e9", exhaust: true,
    text: v => `Draw ${v.draw}. +1 damage this turn per device type on your primary route. Exhaust.`,
    detail: "Needs a live route. Device types: router, switch, firewall, cache, power, balancer, honeypot.",
    values: { draw: 2 },
    upgrade: { values: { draw: 3 } },
  },
  "broadcast-storm": {
    name: "Broadcast Storm", subtitle: "SIGNAL / BROADCAST", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#6fd8e8",
    text: v => `+${v.everyPort} damage to every hostile this turn.`,
    detail: "Needs a live route: the amount joins every living port's packet.",
    values: { everyPort: 2 },
    upgrade: { values: { everyPort: 3 } },
  },
  "traffic-shaping": {
    name: "Traffic Shaping", subtitle: "QOS / SHAPING", cost: 0, rarity: "common", target: "instant", art: "program", color: "#8fd0b8", exhaust: true,
    text: v => `+${v.focusBonus} damage to your target this turn. Draw ${v.draw}. Exhaust.`,
    values: { focusBonus: 2, draw: 1 },
    upgrade: { values: { focusBonus: 4, draw: 1 } },
  },
  "packet-storm": {
    name: "Packet Storm", subtitle: "RARE / OFFENSE", cost: 2, rarity: "rare", target: "instant", art: "program", color: "#5fb9e0", exhaust: true,
    text: v => `+${v.everyPort} damage to every hostile this turn. Exhaust.`,
    values: { everyPort: 5 },
    upgrade: { values: { everyPort: 7 } },
  },
  quorum: {
    name: "Quorum", subtitle: "COMMON / CONSENSUS", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#e6c27e",
    text: v => `Gain ${v.block} block, +${v.perHostile} per other hostile. Draw ${v.draw}.`,
    values: { block: 3, perHostile: 2, draw: 1 },
    upgrade: { values: { block: 5, perHostile: 3, draw: 1 } },
  },
  "demolition-charge": {
    name: "Demolition Charge", subtitle: "COMMON / DEMOLITION", cost: 1, rarity: "common", target: "instant", art: "program", color: "#e98a6a", exhaust: true,
    text: v => `Destroy an installation. +${v.focusBonus} damage to your target this turn. Exhaust.`,
    detail: "Playable without an installation on the table: then it only adds the damage.",
    values: { focusBonus: 2 },
    upgrade: { values: { focusBonus: 4 } },
  },
  "field-repair": {
    name: "Field Repair", subtitle: "COMMON / MAINTENANCE", cost: 0, rarity: "common", target: "instant", art: "defense", color: "#9fd6a4", exhaust: true,
    text: v => `Restore every device to full condition.${block(v.block)}${v.draw ? ` Draw ${v.draw}.` : ""} Exhaust.`,
    values: { block: 2 },
    upgrade: { values: { block: 4, draw: 1 } },
  },
  // ---------------------------------------------------------------- protocols (effects are data: see CardDefinition.protocol)
  "failover-policy": {
    name: "Failover Policy", subtitle: "PROTOCOL / RESILIENCE", cost: 1, rarity: "common", target: "protocol", protocol: "sever", cancels: true, art: "defense", color: "#7fd9c0", keyword: "ARMED",
    text: v => `Armed. When a hostile would cut a cable: cancel its cuts and gain ${v.shield} shield.`,
    values: { shield: 3 },
    upgrade: { values: { shield: 6 } },
  },
  "port-security": {
    name: "Port Security", subtitle: "PROTOCOL / ACCESS", cost: 1, rarity: "uncommon", target: "protocol", protocol: "jam", cancels: true, art: "defense", color: "#9fc3ff", keyword: "ARMED",
    text: v => `Armed. When a hostile would jam: cancel its jams; it takes ${v.damage}.`,
    detail: "Unfired by the hostiles, it cancels a Jammer's jam later in the phase, and the Jammer takes the damage.",
    values: { damage: 4 },
    upgrade: { values: { damage: 7 } },
  },
  "rate-limiter": {
    name: "Rate Limiter", subtitle: "PROTOCOL / QOS", cost: 1, rarity: "common", target: "protocol", protocol: "strike", art: "defense", color: "#8fe3ea", keyword: "ARMED",
    text: v => `Armed. When a hostile strikes: gain ${v.reduce} shield against it.`,
    values: { reduce: 5 },
    upgrade: { values: { reduce: 8 } },
  },
  "ips-signature": {
    name: "IPS Signature", subtitle: "PROTOCOL / INTRUSION", cost: 1, rarity: "uncommon", target: "protocol", protocol: "breach", art: "defense", color: "#ffb38a", keyword: "ARMED",
    text: v => `Armed. When a hostile breaches: gain ${v.reduce} shield against it.`,
    values: { reduce: 6 },
    upgrade: { values: { reduce: 9 } },
  },
  "quarantine-rule": {
    name: "Quarantine Rule", subtitle: "PROTOCOL / CONTAINMENT", cost: 1, rarity: "uncommon", target: "protocol", protocol: "field", cancels: true, art: "program", color: "#c9e79a", keyword: "ARMED",
    rules: "Armed. When a hostile casts a field: cancel it.",
    upgrade: { cost: 0 },
  },
  tarpit: {
    name: "Tarpit", subtitle: "PROTOCOL / DECEPTION", cost: 1, rarity: "rare", target: "protocol", protocol: "ultimate", art: "program", color: "#d59bff", keyword: "ARMED",
    text: v => `Armed. When a guardian charges or unleashes its ultimate: it takes ${v.damage}.`,
    values: { damage: 8 },
    upgrade: { values: { damage: 12 } },
  },
  // ---------------------------------------------------------------- v5 new colorless
  // Worked example (engine): a daemon whose turnStart hook lives in effects/colorless.ts.
  keepalive: {
    name: "Keepalive", subtitle: "DAEMON / HEARTBEAT", cost: 1, rarity: "uncommon", target: "daemon", art: "defense", color: "#8fd9b6",
    text: v => `Daemon. At the start of your turn, gain ${v.block} block.`,
    values: { block: 2 },
    upgrade: { values: { block: 3 } },
  },
  // PHASE C (colorless agent): ping, hotfix, rollback, firmware-update.
};
