import type { Archetype, BaseCardId, CardId, RelicId, Role } from "./types.ts";

/** Every tunable combat number lives here. Rules code, card text, the HUD and the
 * handbook all read this object, so explanations never drift from balance tuning. */
export const RULES = {
  baseEnergy: 5,
  handDraw: 6,
  handLimit: 10,
  maxDevices: 14,
  deviceSpacing: 1.55,
  debrisClearance: 1.3,
  relocateCost: 1,
  scrubCost: 1,
  maxProtocols: 2,
  maxMalware: 3,
  // Route damage (primary route)
  baseRouteDamage: 5,
  switchDamage: 1,
  packetLensSwitchDamage: 2,
  configuredDamage: 1,
  overclockDamage: 2,
  compressionDamage: 2,
  amplifiedCableDamage: 1,
  /** Unarmored cable whose span crosses a wreck's scorched ring. */
  frayedCableDamage: 1,
  resonanceDamage: 3,
  suppressionPenalty: 3,
  // Network terms
  bandwidthPerChannel: 3,
  parallelCorePerChannel: 4,
  balancerPerChannel: 1,
  clusterThreshold: 3,
  clusterDamage: 2,
  malwarePenalty: 2,
  exposedBonus: 3,
  bgpHijackDamage: 3,
  // Engines
  bufferMultiplier: 2,
  /** Share of shield-prevented damage the Warden's Backpressure stores. */
  backpressureRatio: 0.5,
  // Defense
  firewallBreachBlock: 2,
  firewallStrikeBlock: 1,
  aegisShield: 3,
  nullFieldShield: 2,
  separatedCircuitShield: 3,
  shieldArrayPrevent: 2,
  watchdogShield: 5,
  hardenShield: 2,
  hardenPerFirewall: 1,
  // Traps
  honeypotDamage: 3,
  honeynetBonus: 2,
  honeynetShield: 2,
  // Hostile pressure
  corrosionDamage: 2,
  wormDamage: 2,
  bgpHijackEnemyBonus: 2,
  gradedArmorBase: 4,
  gradedArmorPerChannel: 2,
  serpentBonus: 3,
  weaverBonus: 2,
  weaverCables: 6,
  cableExposureLength: 6,
  leechHeal: 3,
  leechTapHeal: 1,
  // Fields
  alliedFieldTurns: 3,
  hostileFieldTurns: 2,
} as const;

export type CardRarity = "basic" | "common" | "uncommon" | "rare" | "legendary" | "special";
export type CardTarget = "ground" | "link" | "node" | "instant" | "zone" | "protocol" | "junk";
/** What makes an armed protocol fire during an enemy action. */
export type ProtocolTrigger = "sever" | "jam" | "strike" | "breach" | "field" | "ultimate";

/** Numeric card parameters. Effects read these, so an upgrade only changes data. */
export interface CardValues {
  block?: number;
  burst?: number;
  draw?: number;
  drawOffline?: number;
  energy?: number;
  nextEnergy?: number;
  heal?: number;
  shield?: number;
  reduce?: number;
  damage?: number;
  links?: number;
  recover?: number;
  buffer?: number;
  perChannel?: number;
  perFirewall?: number;
  minimum?: number;
}

export interface CardDefinition {
  id: CardId;
  base: BaseCardId;
  upgraded: boolean;
  name: string;
  subtitle: string;
  rules: string;
  cost: number;
  rarity: CardRarity;
  exhaust?: boolean;
  keyword?: string;
  target: CardTarget;
  role?: Role;
  art: "hardware" | "cable" | "defense" | "program";
  color: string;
  /** Reward pools only offer archetype cards to that archetype. */
  archetype?: Archetype;
  /** Encounter-only clutter injected by hostiles. Never enters the deck. */
  junk?: boolean;
  /** Permanent deck clutter. Removable at a Sanctuary or Market. */
  curse?: boolean;
  unplayable?: boolean;
  protocol?: ProtocolTrigger;
  values: CardValues;
}

interface Upgrade {
  cost?: number;
  rules: string;
  values?: CardValues;
  exhaust?: boolean;
}
type BaseDefinition = Omit<CardDefinition, "id" | "base" | "upgraded" | "values"> & {
  values?: CardValues;
  upgrade?: Upgrade;
};

const R = RULES;
const BASE: Record<BaseCardId, BaseDefinition> = {
  // ---------------------------------------------------------------- fields
  "resonance-field": {
    name: "Resonance Field", subtitle: "FIELD / AMPLIFY", cost: 1, rarity: "common", target: "zone", art: "program", color: "#e9c47c",
    rules: `Choose a band. Your primary route deals +${R.resonanceDamage} for each resonant band it crosses. ${R.alliedFieldTurns} turns.`,
    upgrade: { cost: 0, rules: `Choose a band. Your primary route deals +${R.resonanceDamage} for each resonant band it crosses. ${R.alliedFieldTurns} turns.` },
  },
  "aegis-field": {
    name: "Aegis Field", subtitle: "FIELD / FORTIFY", cost: 1, rarity: "uncommon", target: "zone", art: "defense", color: "#91d5c4",
    rules: `Choose a band. While an online device sits in it, gain ${R.aegisShield} shield each turn. ${R.alliedFieldTurns} turns.`,
    upgrade: { cost: 0, rules: `Choose a band. While an online device sits in it, gain ${R.aegisShield} shield each turn. ${R.alliedFieldTurns} turns.` },
  },
  "purge-field": {
    name: "Purge Field", subtitle: "FIELD / CLEANSE", cost: 0, rarity: "common", target: "zone", art: "program", color: "#d1eee2", exhaust: true,
    rules: "Cleanse a band: remove hostile fields, jams and malware in it. Draw 1. Exhaust.",
    values: { draw: 1 },
    upgrade: { rules: "Cleanse a band: remove hostile fields, jams and malware in it. Draw 2. Exhaust.", values: { draw: 2 } },
  },
  "null-field": {
    name: "Null Field", subtitle: "FIELD / DAMPEN", cost: 1, rarity: "uncommon", target: "zone", art: "defense", color: "#b5a6e1",
    rules: `Choose a band. While any of your hardware occupies it, gain ${R.nullFieldShield} shield each turn. ${R.alliedFieldTurns} turns.`,
    upgrade: { cost: 0, rules: `Choose a band. While any of your hardware occupies it, gain ${R.nullFieldShield} shield each turn. ${R.alliedFieldTurns} turns.` },
  },
  // ---------------------------------------------------------------- hardware
  router: {
    name: "Core Router", subtitle: "HARDWARE / ROUTING", cost: 2, rarity: "basic", target: "ground", role: "router", art: "hardware", color: "#58f0d5",
    rules: `Place a router. Every route needs one: ALPHA → router → OMEGA deals ${R.baseRouteDamage}.`,
    upgrade: { cost: 1, rules: `Place a router. Every route needs one: ALPHA → router → OMEGA deals ${R.baseRouteDamage}.` },
  },
  switch: {
    name: "Edge Switch", subtitle: "HARDWARE / FABRIC", cost: 1, rarity: "basic", target: "ground", role: "switch", art: "hardware", color: "#9facff",
    rules: `Place a switch. +${R.switchDamage} damage while it is on your primary route.`,
    upgrade: { rules: `Place a switch. +${R.switchDamage} damage while it is on your primary route. Gain 3 block.`, values: { block: 3 } },
  },
  firewall: {
    name: "Trust Gate", subtitle: "HARDWARE / SECURITY", cost: 2, rarity: "uncommon", target: "ground", role: "firewall", art: "defense", color: "#ffba7b",
    rules: `Place a firewall. While online it blocks ${R.firewallBreachBlock} of a breach or ${R.firewallStrikeBlock} of a strike. Firewalls stack.`,
    upgrade: { rules: `Place a firewall. While online it blocks ${R.firewallBreachBlock} of a breach or ${R.firewallStrikeBlock} of a strike. Firewalls stack. Gain 3 block.`, values: { block: 3 } },
  },
  honeypot: {
    name: "Honeypot", subtitle: "HARDWARE / DECEPTION", cost: 1, rarity: "common", target: "ground", role: "honeypot", art: "defense", color: "#f3a35f",
    rules: `Place a decoy. While cabled, jams and cuts hit it first; each one deals ${R.honeypotDamage} to the attacker. Works offline.`,
    upgrade: { cost: 0, rules: `Place a decoy. While cabled, jams and cuts hit it first; each one deals ${R.honeypotDamage} to the attacker. Works offline.` },
  },
  "cache-server": {
    name: "Cache Server", subtitle: "HARDWARE / STORAGE", cost: 2, rarity: "uncommon", target: "ground", role: "cache", art: "hardware", color: "#8fc8ff",
    rules: "Place a cache server. Online at the start of your turn: draw 1 more card.",
    upgrade: { cost: 1, rules: "Place a cache server. Online at the start of your turn: draw 1 more card." },
  },
  "poe-injector": {
    name: "PoE Injector", subtitle: "HARDWARE / POWER", cost: 2, rarity: "uncommon", target: "ground", role: "power", art: "hardware", color: "#ffd36b",
    rules: "Place a power injector. Online at the start of your turn: +1 energy.",
    upgrade: { cost: 1, rules: "Place a power injector. Online at the start of your turn: +1 energy." },
  },
  "load-balancer": {
    name: "Load Balancer", subtitle: "HARDWARE / DISTRIBUTION", cost: 2, rarity: "uncommon", target: "ground", role: "balancer", art: "hardware", color: "#7fe0b8",
    rules: `Place a load balancer. While online: +${R.balancerPerChannel} damage for every live channel.`,
    upgrade: { cost: 1, rules: `Place a load balancer. While online: +${R.balancerPerChannel} damage for every live channel.` },
  },
  relay: {
    name: "Signal Relay", subtitle: "HARDWARE / FABRIC", cost: 2, rarity: "common", target: "ground", role: "switch", art: "hardware", color: "#a5b4ff",
    rules: `Place a jam-protected switch (+${R.switchDamage} on the primary route). Draw 1.`, values: { draw: 1 },
    upgrade: { cost: 1, rules: `Place a jam-protected switch (+${R.switchDamage} on the primary route). Draw 1.` },
  },
  "hardened-router": {
    name: "Hardened Router", subtitle: "HARDWARE / ROUTING", cost: 2, rarity: "uncommon", target: "ground", role: "router", art: "hardware", color: "#b1d8dc",
    rules: "Place a router protected from jams. Gain 2 block.", values: { block: 2 },
    upgrade: { rules: "Place a router protected from jams. Gain 5 block.", values: { block: 5 } },
  },
  bastion: {
    name: "Bastion Firewall", subtitle: "HARDWARE / SECURITY", cost: 3, rarity: "rare", target: "ground", role: "firewall", art: "defense", color: "#e5bf82",
    rules: `Place a jam-protected firewall (online: blocks ${R.firewallBreachBlock} breach / ${R.firewallStrikeBlock} strike). Gain 5 block.`, values: { block: 5 },
    upgrade: { rules: `Place a jam-protected firewall (online: blocks ${R.firewallBreachBlock} breach / ${R.firewallStrikeBlock} strike). Gain 8 block.`, values: { block: 8 } },
  },
  "linux-bridge": {
    name: "Linux Bridge", subtitle: "CONTAINERLAB / HOST BRIDGE", cost: 1, rarity: "common", target: "ground", role: "switch", art: "hardware", color: "#a2bdce",
    rules: `Place a switch automatically cabled to its nearest device (+${R.switchDamage} on the primary route).`, values: { links: 1 },
    upgrade: { rules: `Place a switch automatically cabled to its two nearest devices (+${R.switchDamage} on the primary route).`, values: { links: 2 } },
  },
  // ---------------------------------------------------------------- cables
  fiber: {
    name: "Optic Fiber", subtitle: "INFRASTRUCTURE / LINK", cost: 1, rarity: "basic", target: "link", art: "cable", color: "#59cfff",
    rules: "Connect two devices with a live cable.",
    upgrade: { rules: "Connect two devices with a live cable. Draw 1.", values: { draw: 1 } },
  },
  crosslink: {
    name: "Crosslink", subtitle: "INFRASTRUCTURE / LINK", cost: 0, rarity: "uncommon", target: "link", art: "cable", color: "#e5a1ff", exhaust: true,
    rules: "Connect two devices for free. Draw 1. Exhaust.", values: { draw: 1 },
    upgrade: { rules: "Connect two devices for free. Draw 2. Exhaust.", values: { draw: 2 } },
  },
  duplex: {
    name: "Duplex Link", subtitle: "COMMON / LINK", cost: 1, rarity: "common", target: "link", art: "cable", color: "#8bc9d6",
    rules: "Connect two devices. Gain 3 block this turn.", values: { block: 3 },
    upgrade: { rules: "Connect two devices. Gain 5 block this turn.", values: { block: 5 } },
  },
  "armored-fiber": {
    name: "Armored Fiber", subtitle: "UNCOMMON / LINK", cost: 1, rarity: "uncommon", target: "link", art: "cable", color: "#b7c4ca",
    rules: "Connect two devices with a cable immune to cuts and fraying.",
    upgrade: { cost: 0, rules: "Connect two devices with a cable immune to cuts and fraying." },
  },
  conduit: {
    name: "Amplified Fiber", subtitle: "UNCOMMON / LINK", cost: 1, rarity: "uncommon", target: "link", art: "cable", color: "#f0b086",
    rules: `Connect two devices. This cable adds +${R.amplifiedCableDamage} while on your primary route.`,
    upgrade: { cost: 0, rules: `Connect two devices. This cable adds +${R.amplifiedCableDamage} while on your primary route.` },
  },
  vxlan: {
    name: "VXLAN Tunnel", subtitle: "CONTAINERLAB / OVERLAY", cost: 2, rarity: "uncommon", target: "link", art: "cable", color: "#bba3e3",
    rules: `Connect two devices with a cut- and fray-proof cable that adds +${R.amplifiedCableDamage} on your primary route.`,
    upgrade: { cost: 1, rules: `Connect two devices with a cut- and fray-proof cable that adds +${R.amplifiedCableDamage} on your primary route.` },
  },
  "dark-fiber": {
    name: "Dark Fiber", subtitle: "GHOST / HIDDEN LINK", cost: 0, rarity: "uncommon", target: "link", art: "cable", color: "#7d8fb8", exhaust: true, archetype: "ghost",
    rules: "Connect two devices with a cut- and fray-proof cable. Exhaust.",
    upgrade: { rules: "Connect two devices with a cut- and fray-proof cable. Draw 1. Exhaust.", values: { draw: 1 } },
  },
  // ---------------------------------------------------------------- node upgrades
  shield: {
    name: "Faraday Shell", subtitle: "SYSTEM / DEFENSE", cost: 1, rarity: "uncommon", target: "node", art: "defense", color: "#f4ce82", exhaust: true,
    rules: "Protect a device from jams this battle and clear its jam. Exhaust.",
    upgrade: { cost: 0, rules: "Protect a device from jams this battle and clear its jam. Exhaust." },
  },
  firmware: {
    name: "Overclock", subtitle: "SYSTEM / UPGRADE", cost: 1, rarity: "rare", target: "node", art: "program", color: "#ff8ca8", exhaust: true,
    rules: `Overclock a router: +${R.overclockDamage} while it is on your primary route. Exhaust.`,
    upgrade: { cost: 0, rules: `Overclock a router: +${R.overclockDamage} while it is on your primary route. Exhaust.` },
  },
  compression: {
    name: "Packet Compression", subtitle: "UNCOMMON / UPGRADE", cost: 1, rarity: "uncommon", target: "node", art: "program", color: "#b0a5e6", exhaust: true,
    rules: `Amplify a switch: +${R.compressionDamage} while it is on your primary route. Exhaust.`,
    upgrade: { cost: 0, rules: `Amplify a switch: +${R.compressionDamage} while it is on your primary route. Exhaust.` },
  },
  "startup-config": {
    name: "Startup Config", subtitle: "CONTAINERLAB / CONFIGURATION", cost: 1, rarity: "common", target: "node", art: "program", color: "#88cfb5", exhaust: true,
    rules: `Configure a router: +${R.configuredDamage} while it is on your primary route. Gain 1 block. Exhaust.`, values: { block: 1 },
    upgrade: { cost: 0, rules: `Configure a router: +${R.configuredDamage} while it is on your primary route. Gain 1 block. Exhaust.` },
  },
  clabernetes: {
    name: "Clabernetes", subtitle: "SYSTEM / REPLICATION", cost: 2, rarity: "legendary", target: "node", art: "hardware", color: "#9ccbd2", exhaust: true,
    rules: "Clone a router with its cables and upgrades. Both become jam-protected — instant bandwidth. Exhaust.",
    upgrade: { cost: 1, rules: "Clone a router with its cables and upgrades. Both become jam-protected — instant bandwidth. Exhaust." },
  },
  "mesh-weave": {
    name: "Mesh Weave", subtitle: "ARCHITECT / TOPOLOGY", cost: 1, rarity: "uncommon", target: "node", art: "cable", color: "#6fe3d0", archetype: "architect",
    rules: "Cable the chosen device to its two nearest unconnected devices.", values: { links: 2 },
    upgrade: { rules: "Cable the chosen device to its three nearest unconnected devices.", values: { links: 3 } },
  },
  // ---------------------------------------------------------------- instants
  patch: {
    name: "Hot Patch", subtitle: "SYSTEM / REPAIR", cost: 1, rarity: "basic", target: "instant", art: "program", color: "#7ceebc",
    rules: "Clear the active jam and cut cable. Draw 1.", values: { draw: 1 },
    upgrade: { rules: "Clear the active jam and cut cable. Draw 2.", values: { draw: 2 } },
  },
  surge: {
    name: "Power Surge", subtitle: "SYSTEM / ENERGY", cost: 0, rarity: "uncommon", target: "instant", art: "program", color: "#ffd278", exhaust: true,
    rules: "Gain 2 energy. Draw 2. Exhaust.", values: { energy: 2, draw: 2 },
    upgrade: { rules: "Gain 3 energy. Draw 2. Exhaust.", values: { energy: 3, draw: 2 } },
  },
  containerlab: {
    name: "Containerlab", subtitle: "SYSTEM / ORCHESTRATION", cost: 3, rarity: "rare", target: "instant", art: "hardware", color: "#e7c37d", exhaust: true,
    rules: `Deploy an overclocked router cabled to both terminals: a ${R.baseRouteDamage + R.overclockDamage}-damage route. Exhaust.`,
    upgrade: { cost: 2, rules: `Deploy an overclocked router cabled to both terminals: a ${R.baseRouteDamage + R.overclockDamage}-damage route. Exhaust.` },
  },
  guard: {
    name: "Packet Guard", subtitle: "COMMON / DEFENSE", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#82d8ed",
    rules: "Gain 4 block this turn.", values: { block: 4 },
    upgrade: { rules: "Gain 7 block this turn.", values: { block: 7 } },
  },
  pulse: {
    name: "Packet Burst", subtitle: "COMMON / OFFENSE", cost: 1, rarity: "common", target: "instant", art: "program", color: "#ff9a82",
    rules: "Your transmission deals +3 this turn.", values: { burst: 3 },
    upgrade: { rules: "Your transmission deals +5 this turn.", values: { burst: 5 } },
  },
  diagnostic: {
    name: "Deep Scan", subtitle: "COMMON / DRAW", cost: 1, rarity: "common", target: "instant", art: "program", color: "#9ec0ff",
    rules: "Draw 3 cards. Your hand holds at most 10.", values: { draw: 3 },
    upgrade: { rules: "Draw 4 cards. Your hand holds at most 10.", values: { draw: 4 } },
  },
  reroute: {
    name: "Fast Reroute", subtitle: "UNCOMMON / REPAIR", cost: 0, rarity: "uncommon", target: "instant", art: "program", color: "#79e7c3", exhaust: true,
    rules: "Clear the active jam and cut cable. Gain 2 block. Draw 1. Exhaust.", values: { block: 2, draw: 1 },
    upgrade: { rules: "Clear the active jam and cut cable. Gain 4 block. Draw 1. Exhaust.", values: { block: 4, draw: 1 } },
  },
  barrier: {
    name: "Aegis Protocol", subtitle: "UNCOMMON / DEFENSE", cost: 2, rarity: "uncommon", target: "instant", art: "defense", color: "#c3beff",
    rules: "Gain 8 block this turn.", values: { block: 8 },
    upgrade: { rules: "Gain 12 block this turn.", values: { block: 12 } },
  },
  capacitor: {
    name: "Power Capacitor", subtitle: "COMMON / RESERVE", cost: 0, rarity: "common", target: "instant", art: "program", color: "#ffcf79", exhaust: true,
    rules: "Gain 3 block now and +2 energy next turn. Exhaust.", values: { block: 3, nextEnergy: 2 },
    upgrade: { rules: "Gain 5 block now and +2 energy next turn. Exhaust.", values: { block: 5, nextEnergy: 2 } },
  },
  salvage: {
    name: "Salvage Cycle", subtitle: "COMMON / RECOVERY", cost: 0, rarity: "common", target: "instant", art: "program", color: "#98ceb0", exhaust: true,
    rules: "Return up to 2 of your most recently discarded cable cards to your hand. Exhaust.", values: { recover: 2 },
    upgrade: { rules: "Return up to 3 of your most recently discarded cable cards to your hand. Exhaust.", values: { recover: 3 } },
  },
  rebuild: {
    name: "Emergency Rebuild", subtitle: "UNCOMMON / DEPLOY", cost: 2, rarity: "uncommon", target: "instant", art: "hardware", color: "#a9cbc2", exhaust: true,
    rules: `Deploy a router cabled to both terminals: a new ${R.baseRouteDamage}-damage route. Exhaust.`,
    upgrade: { cost: 1, rules: `Deploy a router cabled to both terminals: a new ${R.baseRouteDamage}-damage route. Exhaust.` },
  },
  mirror: {
    name: "Mirror Protocol", subtitle: "UNCOMMON / REDUNDANCY", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#bc9fde",
    rules: "Needs 2+ channels. +2 burst and +2 block for every live channel.", values: { perChannel: 2 },
    upgrade: { rules: "Needs 2+ channels. +3 burst and +3 block for every live channel.", values: { perChannel: 3 } },
  },
  "zero-day": {
    name: "Zero Day", subtitle: "RARE / OFFENSE", cost: 2, rarity: "rare", target: "instant", art: "program", color: "#ed8e9f", exhaust: true,
    rules: "Your transmission deals +8 this turn. Exhaust.", values: { burst: 8 },
    upgrade: { rules: "Your transmission deals +12 this turn. Exhaust.", values: { burst: 12 } },
  },
  emergency: {
    name: "Emergency Repair", subtitle: "RARE / RECOVERY", cost: 2, rarity: "rare", target: "instant", art: "defense", color: "#8fd3af", exhaust: true,
    rules: "Restore 3 integrity. Gain 3 block. Exhaust.", values: { heal: 3, block: 3 },
    upgrade: { rules: "Restore 5 integrity. Gain 5 block. Exhaust.", values: { heal: 5, block: 5 } },
  },
  protocol: {
    name: "Link Recovery", subtitle: "COMMON / REPAIR", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#91bacf",
    rules: "Clear the active jam and cut cable. Gain 3 block.", values: { block: 3 },
    upgrade: { rules: "Clear the active jam and cut cable. Gain 6 block.", values: { block: 6 } },
  },
  inspect: {
    name: "Clab Inspect", subtitle: "CONTAINERLAB / OBSERVABILITY", cost: 0, rarity: "common", target: "instant", art: "program", color: "#93d1d6", exhaust: true,
    rules: "Draw 2 if a route is live; otherwise draw 1. Exhaust.", values: { draw: 2, drawOffline: 1 },
    upgrade: { rules: "Draw 3 if a route is live; otherwise draw 2. Exhaust.", values: { draw: 3, drawOffline: 2 } },
  },
  wireshark: {
    name: "Wireshark", subtitle: "OBSERVABILITY / PACKET CAPTURE", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#86c9e9", exhaust: true,
    rules: "Capture your primary route: draw 2 and +1 burst for every distinct device type on it. Exhaust.", values: { draw: 2 },
    upgrade: { rules: "Capture your primary route: draw 3 and +1 burst for every distinct device type on it. Exhaust.", values: { draw: 3 } },
  },
  ecmp: {
    name: "Equal-Cost Multipath", subtitle: "ARCHITECT / BANDWIDTH", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#6fd6ef", archetype: "architect",
    rules: "Needs a live route. +2 burst for every live channel.", values: { perChannel: 2 },
    upgrade: { rules: "Needs a live route. +3 burst for every live channel.", values: { perChannel: 3 } },
  },
  "spine-leaf": {
    name: "Spine-Leaf", subtitle: "ARCHITECT / FABRIC", cost: 2, rarity: "rare", target: "ground", role: "switch", art: "hardware", color: "#7cc7ff", archetype: "architect",
    rules: `Place a switch cabled to every router on the table (+${R.switchDamage} on the primary route).`,
    upgrade: { cost: 1, rules: `Place a switch cabled to every router on the table (+${R.switchDamage} on the primary route).` },
  },
  "deep-inspection": {
    name: "Deep Packet Inspection", subtitle: "WARDEN / DEFENSE", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#f0b476", archetype: "warden",
    rules: "Gain 2 block for every online firewall (at least 2).", values: { perFirewall: 2, minimum: 2 },
    upgrade: { rules: "Gain 3 block for every online firewall (at least 3).", values: { perFirewall: 3, minimum: 3 } },
  },
  "stateful-firewall": {
    name: "Stateful Firewall", subtitle: "WARDEN / SECURITY", cost: 2, rarity: "uncommon", target: "ground", role: "firewall", art: "defense", color: "#ffa65c", archetype: "warden",
    rules: `Place a firewall that blocks double: ${R.firewallBreachBlock * 2} of a breach or ${R.firewallStrikeBlock * 2} of a strike while online.`,
    upgrade: { rules: `Place a jam-protected firewall that blocks double: ${R.firewallBreachBlock * 2} of a breach or ${R.firewallStrikeBlock * 2} of a strike while online.` },
  },
  reflect: {
    name: "Reflect", subtitle: "WARDEN / BACKPRESSURE", cost: 1, rarity: "rare", target: "instant", art: "defense", color: "#ffcf8a", archetype: "warden", exhaust: true,
    rules: "Double your stored backpressure. Exhaust.",
    upgrade: { cost: 0, rules: "Double your stored backpressure. Exhaust." },
  },
  "store-forward": {
    name: "Store and Forward", subtitle: "GHOST / BUFFER", cost: 1, rarity: "common", target: "instant", art: "program", color: "#a4b8ff", archetype: "ghost",
    rules: "Add 4 damage to your buffer.", values: { buffer: 4 },
    upgrade: { rules: "Add 6 damage to your buffer.", values: { buffer: 6 } },
  },
  "replay-attack": {
    name: "Replay Attack", subtitle: "GHOST / BUFFER", cost: 1, rarity: "rare", target: "instant", art: "program", color: "#c8a4ff", archetype: "ghost", exhaust: true,
    rules: "Double your buffer. Exhaust.",
    upgrade: { cost: 0, rules: "Double your buffer. Exhaust." },
  },
  // ---------------------------------------------------------------- protocols
  "failover-policy": {
    name: "Failover Policy", subtitle: "PROTOCOL / RESILIENCE", cost: 1, rarity: "common", target: "protocol", protocol: "sever", art: "defense", color: "#7fd9c0", keyword: "ARMED",
    rules: "Arm. When a cable would be cut: cancel the cut and gain 3 shield for that enemy action.", values: { shield: 3 },
    upgrade: { rules: "Arm. When a cable would be cut: cancel the cut and gain 6 shield for that enemy action.", values: { shield: 6 } },
  },
  "port-security": {
    name: "Port Security", subtitle: "PROTOCOL / ACCESS", cost: 1, rarity: "uncommon", target: "protocol", protocol: "jam", art: "defense", color: "#9fc3ff", keyword: "ARMED",
    rules: "Arm. When a device would be jammed: cancel the jam; the attacker takes 4.", values: { damage: 4 },
    upgrade: { rules: "Arm. When a device would be jammed: cancel the jam; the attacker takes 7.", values: { damage: 7 } },
  },
  "rate-limiter": {
    name: "Rate Limiter", subtitle: "PROTOCOL / QOS", cost: 1, rarity: "common", target: "protocol", protocol: "strike", art: "defense", color: "#8fe3ea", keyword: "ARMED",
    rules: "Arm. When the enemy strikes: gain 5 shield for that action.", values: { reduce: 5 },
    upgrade: { rules: "Arm. When the enemy strikes: gain 8 shield for that action.", values: { reduce: 8 } },
  },
  "ips-signature": {
    name: "IPS Signature", subtitle: "PROTOCOL / INTRUSION", cost: 2, rarity: "uncommon", target: "protocol", protocol: "breach", art: "defense", color: "#ffb38a", keyword: "ARMED",
    rules: "Arm. When the enemy breaches: gain 6 shield for that action.", values: { reduce: 6 },
    upgrade: { cost: 1, rules: "Arm. When the enemy breaches: gain 6 shield for that action." },
  },
  "quarantine-rule": {
    name: "Quarantine Rule", subtitle: "PROTOCOL / CONTAINMENT", cost: 1, rarity: "uncommon", target: "protocol", protocol: "field", art: "program", color: "#c9e79a", keyword: "ARMED",
    rules: "Arm. When the enemy casts a hostile field: cancel the field.",
    upgrade: { cost: 0, rules: "Arm. When the enemy casts a hostile field: cancel the field." },
  },
  tarpit: {
    name: "Tarpit", subtitle: "PROTOCOL / DECEPTION", cost: 1, rarity: "rare", target: "protocol", protocol: "ultimate", art: "program", color: "#d59bff", keyword: "ARMED",
    rules: "Arm. When the enemy charges or unleashes an ultimate: it takes 8.", values: { damage: 8 },
    upgrade: { rules: "Arm. When the enemy charges or unleashes an ultimate: it takes 12.", values: { damage: 12 } },
  },
  // ---------------------------------------------------------------- junk & curses
  "packet-loss": {
    name: "Packet Loss", subtitle: "JUNK / NOISE", cost: 0, rarity: "special", target: "junk", art: "program", color: "#7b7f8c", junk: true, unplayable: true,
    rules: "Unplayable. Vanishes at the end of your turn. Removed after the encounter.",
  },
  worm: {
    name: "Worm", subtitle: "JUNK / MALWARE", cost: 1, rarity: "special", target: "junk", art: "program", color: "#b0506b", junk: true,
    rules: `Pay 1 to delete it. If it is in your hand when you transmit, the enemy action deals ${R.wormDamage} extra damage.`,
  },
  cve: {
    name: "CVE", subtitle: "CURSE / VULNERABILITY", cost: 0, rarity: "special", target: "junk", art: "program", color: "#8a4a5c", curse: true, unplayable: true,
    rules: "Unplayable. A permanent vulnerability. Remove it at a Sanctuary or Market.",
  },
};

function build(): Record<CardId, CardDefinition> {
  const cards = {} as Record<CardId, CardDefinition>;
  for (const [id, definition] of Object.entries(BASE) as [BaseCardId, BaseDefinition][]) {
    const { upgrade, values, ...rest } = definition;
    cards[id] = { ...rest, id, base: id, upgraded: false, values: values ?? {} };
    if (!upgrade) continue;
    const plus = `${id}+` as CardId;
    cards[plus] = {
      ...rest,
      id: plus,
      base: id,
      upgraded: true,
      name: `${rest.name}+`,
      rules: upgrade.rules,
      cost: upgrade.cost ?? rest.cost,
      exhaust: upgrade.exhaust ?? rest.exhaust,
      values: { ...(values ?? {}), ...(upgrade.values ?? {}) },
    };
  }
  return cards;
}

export const CARDS: Record<CardId, CardDefinition> = build();
export const BASE_CARD_IDS = Object.keys(BASE) as BaseCardId[];

export function baseCard(id: CardId): BaseCardId {
  return (id.endsWith("+") ? id.slice(0, -1) : id) as BaseCardId;
}
export function isUpgraded(id: CardId): boolean {
  return id.endsWith("+");
}
export function canUpgrade(id: CardId): boolean {
  return !isUpgraded(id) && Object.hasOwn(CARDS, `${id}+`);
}
/** The upgraded id, or the same id when no further upgrade exists. */
export function upgraded(id: CardId): CardId {
  return canUpgrade(id) ? (`${id}+` as CardId) : id;
}
export function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.hasOwn(CARDS, value);
}

export const STARTER_DECK: CardId[] = [
  "router", "router",
  "switch",
  "firewall",
  "fiber", "fiber", "fiber", "fiber",
  "patch",
  "guard", "guard",
  "pulse",
  "startup-config",
  "resonance-field",
  "purge-field",
  "inspect",
  "failover-policy",
];
/** Base ids that can appear as rewards. Archetype filtering happens at offer time. */
export const REWARD_POOL: BaseCardId[] = BASE_CARD_IDS.filter(
  (id) => !["basic", "special"].includes(CARDS[id].rarity),
);
export function offeredTo(id: CardId, archetype: Archetype): boolean {
  const card = CARDS[id];
  return !card.junk && !card.curse && (!card.archetype || card.archetype === archetype);
}

export type RelicTier = "starter" | "common" | "boss";
export interface RelicDefinition {
  name: string;
  subtitle: string;
  rules: string;
  color: string;
  tier: RelicTier;
}
export const RELICS: Record<RelicId, RelicDefinition> = {
  "cold-start": { name: "Cold Start", subtitle: "POWER UNIT", tier: "common", color: "#6fe8fb", rules: "+1 energy on the first turn of each battle." },
  "hot-swap": { name: "Hot Swap", subtitle: "LINK MODULE", tier: "starter", color: "#c59bff", rules: "The first Optic Fiber you play each turn costs 0." },
  "parallel-core": { name: "Parallel Core", subtitle: "PACKET ENGINE", tier: "common", color: "#80f8d6", rules: `Bandwidth gives +${R.parallelCorePerChannel} per channel beyond the first instead of +${R.bandwidthPerChannel}.` },
  "shield-array": { name: "Shield Array", subtitle: "DEFENSE MODULE", tier: "common", color: "#ffc186", rules: `Prevent up to ${R.shieldArrayPrevent} damage from the first unblocked hit each battle.` },
  "deep-cache": { name: "Deep Cache", subtitle: "MEMORY MODULE", tier: "starter", color: "#ff9ab6", rules: "Draw one extra card every turn." },
  "grounded-core": { name: "Grounded Core", subtitle: "DEFENSE MODULE", tier: "common", color: "#93d2d0", rules: "Start every turn with 1 block." },
  "packet-lens": { name: "Packet Lens", subtitle: "SIGNAL MODULE", tier: "common", color: "#bbacf0", rules: `Switches on your primary route deal +${R.packetLensSwitchDamage} each instead of +${R.switchDamage}.` },
  "repair-drone": { name: "Repair Drone", subtitle: "RECOVERY MODULE", tier: "common", color: "#b4d58b", rules: "Restore 1 integrity after winning an encounter." },
  "reserve-cell": { name: "Reserve Cell", subtitle: "ENERGY MODULE", tier: "common", color: "#eed290", rules: "Carry up to 2 unspent energy into the next turn." },
  backpressure: { name: "Backpressure", subtitle: "WARDEN CORE", tier: "starter", color: "#f7c56e", rules: `${Number(R.backpressureRatio) === 1 ? "Damage" : "Half the damage (rounded up)"} your shield prevents during an enemy action is stored and added to your next transmission.` },
  honeynet: { name: "Honeynet", subtitle: "DECEPTION GRID", tier: "common", color: "#f3a35f", rules: `Honeypots deal +${R.honeynetBonus} damage and grant ${R.honeynetShield} shield whenever they absorb an attack.` },
  fanout: { name: "Fanout", subtitle: "SIGNAL MODULE", tier: "common", color: "#7fd4ff", rules: "Draw 1 extra card at the start of your turn while 3 or more channels are live." },
  "spare-parts": { name: "Spare Parts", subtitle: "SUPPLY CRATE", tier: "common", color: "#c8b48a", rules: "Start every battle with an extra Optic Fiber in hand." },
  "credit-line": { name: "Credit Line", subtitle: "FINANCE MODULE", tier: "common", color: "#e3d27a", rules: "Gain 15 extra credits after each won battle." },
  watchdog: { name: "Watchdog", subtitle: "RECOVERY MODULE", tier: "common", color: "#9fe0a8", rules: `The first time each battle you transmit with no live route, gain ${R.watchdogShield} shield.` },
  "spanning-tree": { name: "Spanning Tree", subtitle: "BOSS · LOOP-FREE", tier: "boss", color: "#ffb86b", rules: "Your primary route's damage is doubled. Bandwidth and Load Balancers give nothing." },
  anycast: { name: "Anycast", subtitle: "BOSS · ONE ADDRESS", tier: "boss", color: "#8ee6ff", rules: "+1 energy every turn. You cannot place firewalls." },
  "jumbo-frames": { name: "Jumbo Frames", subtitle: "BOSS · LARGE MTU", tier: "boss", color: "#b9a6ff", rules: "+1 energy every turn. Draw 1 fewer card every turn." },
  "bgp-hijack": { name: "BGP Hijack", subtitle: "BOSS · STOLEN ROUTES", tier: "boss", color: "#ff8a8a", rules: `+${R.bgpHijackDamage} damage every transmission. Enemy strikes and breaches deal +${R.bgpHijackEnemyBonus}.` },
  "sdn-controller": { name: "SDN Controller", subtitle: "BOSS · CONTROL PLANE", tier: "boss", color: "#7ef0c4", rules: "Patch Cable and Harden can be used twice per turn (Buffer stays once). Start each battle with 1 less energy." },
  "zero-trust": { name: "Zero Trust", subtitle: "BOSS · VERIFY ALL", tier: "boss", color: "#ffd98a", rules: "Firewalls block double. Cable cards and Patch Cable cost 1 more." },
};
