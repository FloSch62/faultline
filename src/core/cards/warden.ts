/** The Warden's cards: "Hold what remains" (contract section 9.2). Paths: Fortress (block that
 * becomes backpressure), Firewall wall (many firewalls, per-firewall payoffs), Protocols (armed traps
 * and retaliation). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/warden.ts (new cards) or the engine's legacy if-chains (v4 cards: Deep Packet
 * Inspection, Bulkhead, Reflect and the three firewalls).
 *
 * Protocols are pure data: Tripwire is { target: "protocol", protocol: "strike", values: { damage } }
 * and Null Route { protocol: "breach", cancels: true } — the resolver's generic protocol table does
 * the rest (see CardDefinition.protocol in card-types.ts). Every definition carries
 * `archetype: "warden"`; faces are generated from `values`, edge cases live in `detail`. */
import { RULES as R } from "../rules.ts";
import type { CardTable, WardenCardId } from "../card-types.ts";

const words = ["no", "one", "two", "three", "four", "five", "six"];
/** "nearest device", "two nearest devices". */
const nearest = (n = 1) => (n === 1 ? "nearest device" : `${words[n] ?? n} nearest devices`);
const block = (n?: number) => (n ? ` Gain ${n} block.` : "");
const draw = (n?: number) => (n ? ` Draw ${n}.` : "");
/** Share of prevented damage as a face reads it: "all", "half", "75 % of". */
const portion = (ratio = 0) => (ratio === 1 ? "all" : ratio === 0.5 ? "half" : `${Math.round(ratio * 100)} % of`);
/** Entrench: "Double your block." (the multiplier lives in `values.amount`). */
const multiply = (n = 2, what: string) => (n === 2 ? `Double ${what}` : n === 3 ? `Triple ${what}` : `Multiply ${what} by ${n}`);
/** The Harden console's rule, as Double Shift's detail prints it (run.ts CONSOLES.harden reads the same keys). */
const HARDEN = `gain ${R.hardenShield} block, +${R.hardenPerFirewall} per online firewall${R.hardenPerHostile ? `, +${R.hardenPerHostile} per hostile beyond the first` : ""}${R.hardenPerAdd ? `, +${R.hardenPerAdd} more per guardian add` : ""}, and repair your most worn device by ${R.faultClearRepair}`;

export const WARDEN_CARDS: CardTable<WardenCardId> = {
  // ---------------------------------------------------------------- Firewall wall
  "deep-inspection": {
    name: "Deep Packet Inspection", subtitle: "WARDEN / DEFENSE", cost: 1, rarity: "basic", target: "instant", art: "defense", color: "#f0b476", archetype: "warden",
    text: v => `Gain ${v.block} block, +${v.perFirewall} per online firewall.`,
    values: { block: 2, perFirewall: 1 },
    upgrade: { values: { block: 4, perFirewall: 2 } },
  },
  "acl-gate": {
    name: "ACL Gate", subtitle: "WARDEN / ACCESS LIST", cost: 1, rarity: "common", target: "ground", role: "firewall", art: "defense", color: "#f4b27a", archetype: "warden",
    text: v => `Deploy a firewall linked to its ${nearest(v.links)}.${block(v.block)}`,
    detail: `Online, it blocks ${R.firewallBreachBlock} of each breach and ${R.firewallStrikeBlock} of each strike like any firewall. It links to the nearest devices it is not already cabled to (distance ties: device ids).`,
    values: { links: 2 },
    upgrade: { values: { links: 2, block: 3 } },
  },
  "stateful-firewall": {
    name: "Stateful Firewall", subtitle: "WARDEN / SECURITY", cost: 2, rarity: "uncommon", target: "ground", role: "firewall", art: "defense", color: "#ffa65c", archetype: "warden",
    rules: `Deploy a firewall that blocks double: ${R.firewallBreachBlock * 2} of each breach, ${R.firewallStrikeBlock * 2} of each strike.`,
    upgrade: { jamProof: true, rules: `Deploy a jam-proof firewall that blocks double: ${R.firewallBreachBlock * 2} of each breach, ${R.firewallStrikeBlock * 2} of each strike.` },
  },
  "sentry-firewall": {
    name: "Sentry Firewall", subtitle: "WARDEN / SECURITY", cost: 1, rarity: "uncommon", target: "ground", role: "firewall", art: "defense", color: "#f0a870", archetype: "warden",
    rules: `Deploy a firewall whose quarantine deals ${R.sentryQuarantine}; each installation it destroys gives +${R.sentryReclaimBonus} shield.`,
    detail: `Online, it blocks ${R.firewallBreachBlock} of each breach and ${R.firewallStrikeBlock} of each strike like any firewall; its quarantine deals ${R.sentryQuarantine} instead of ${R.quarantineDamage}.`,
    upgrade: { jamProof: true, rules: `Deploy a jam-proof firewall whose quarantine deals ${R.sentryQuarantine}; each installation it destroys gives +${R.sentryReclaimBonus} shield.` },
  },
  bulkhead: {
    name: "Bulkhead", subtitle: "WARDEN / BULKHEAD", cost: 1, rarity: "uncommon", target: "instant", art: "defense", color: "#d9a86a", archetype: "warden",
    text: v => `Gain ${v.block} block. This enemy phase, each online firewall blocks ${v.firewallBonus} more per attack.`,
    values: { block: 3, firewallBonus: 1 },
    upgrade: { values: { block: 5, firewallBonus: 1 } },
  },
  perimeter: {
    name: "Perimeter", subtitle: "WARDEN / PERIMETER", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#ff9f68", archetype: "warden",
    text: v => `+${v.perFirewall} damage this turn per online firewall.`,
    detail: "It counts the firewalls online when you play it. The damage rides your primary route.",
    values: { perFirewall: 3 },
    upgrade: { values: { perFirewall: 4 } },
  },
  bastion: {
    name: "Bastion Firewall", subtitle: "WARDEN / SECURITY", cost: 2, rarity: "rare", target: "ground", role: "firewall", art: "defense", color: "#e5bf82", archetype: "warden", jamProof: true,
    text: v => `Deploy a jam-proof firewall. Gain ${v.block} block.`,
    values: { block: 6 },
    upgrade: { values: { block: 9 } },
  },
  "defense-in-depth": {
    name: "Defense in Depth", subtitle: "WARDEN / LAYERED DEFENSE", cost: 2, rarity: "rare", target: "daemon", art: "defense", color: "#e9c088", archetype: "warden",
    text: v => `Daemon. Each online firewall blocks ${v.firewallBonus} more per attack.`,
    detail: "Attacks are strikes and breaches, from any hostile. Copies stack.",
    values: { firewallBonus: 1 },
    upgrade: { cost: 1 },
  },
  // ---------------------------------------------------------------- Fortress
  brace: {
    name: "Brace", subtitle: "WARDEN / FORTRESS", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#e8b06c", archetype: "warden",
    text: v => `Gain ${v.block} block. Next turn, gain ${v.nextBlock} block.`,
    values: { block: 3, nextBlock: 2 },
    upgrade: { values: { block: 5, nextBlock: 3 } },
  },
  pushback: {
    name: "Pushback", subtitle: "WARDEN / BACKPRESSURE", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#f2a55e", archetype: "warden",
    text: v => `Gain ${v.block} block. Add ${v.backpressure} to your backpressure.`,
    detail: "Your next transmission with a live route releases your backpressure.",
    values: { block: 4, backpressure: 1 },
    upgrade: { values: { block: 6, backpressure: 2 } },
  },
  "stand-firm": {
    name: "Stand Firm", subtitle: "WARDEN / FORTRESS", cost: 2, rarity: "common", target: "instant", art: "defense", color: "#d8b27a", archetype: "warden",
    text: v => `Gain ${v.block} block.`,
    values: { block: 8 },
    upgrade: { values: { block: 12 } },
  },
  vent: {
    name: "Vent", subtitle: "WARDEN / BACKPRESSURE", cost: 0, rarity: "common", target: "instant", art: "defense", color: "#f5c878", archetype: "warden",
    text: v => `Gain block equal to your backpressure.${draw(v.draw)}`,
    detail: "Your backpressure stays stored: the next transmission still releases it.",
    upgrade: { values: { draw: 1 } },
  },
  "double-shift": {
    name: "Double Shift", subtitle: "WARDEN / HARDEN", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#e3a870", archetype: "warden",
    text: v => `Harden once, without using your console. Draw ${v.draw}.`,
    detail: `Harden: ${HARDEN}. Your console stays free this turn.`,
    values: { draw: 1 },
    upgrade: { cost: 0 },
  },
  "hardening-guide": {
    name: "Hardening Guide", subtitle: "WARDEN / HARDEN", cost: 1, rarity: "uncommon", target: "daemon", art: "defense", color: "#dcb47e", archetype: "warden",
    text: v => `Daemon. Harden gains ${v.block} more block.`,
    detail: "It raises your Harden console and every Double Shift. Copies stack.",
    values: { block: 1 },
    upgrade: { cost: 0 },
  },
  entrench: {
    name: "Entrench", subtitle: "WARDEN / FORTRESS", cost: 2, rarity: "uncommon", target: "instant", art: "defense", color: "#c99a62", archetype: "warden",
    text: v => `${multiply(v.amount, "your block")}.`,
    detail: "Needs block. Shield from fields, Reclaim and firewalls is not block.",
    values: { amount: 2 },
    upgrade: { cost: 1 },
  },
  "persistent-state": {
    name: "Persistent State", subtitle: "WARDEN / PERSISTENCE", cost: 2, rarity: "rare", target: "daemon", art: "defense", color: "#f0d59a", archetype: "warden",
    text: v => `Daemon. Up to ${v.amount} of your block carries into the next turn.`,
    detail: "Attacks spend your other shield (fields, circuits, Reclaim) before your block; up to this much of what they leave of your block carries into your next turn. More copies add nothing: the highest cap counts.",
    values: { amount: 2 },
    upgrade: { values: { amount: 4 } },
  },
  "flow-control": {
    name: "Flow Control", subtitle: "WARDEN / BACKPRESSURE", cost: 2, rarity: "rare", target: "daemon", art: "defense", color: "#f7bc6a", archetype: "warden",
    text: v => `Daemon. Backpressure stores ${portion(v.amount)} the damage your shield prevents${Number(R.backpressureRatio) === 1 ? "" : `, not ${portion(R.backpressureRatio).replace(/ of$/, "")}`}.`,
    detail: "It changes your Backpressure relic's share. More copies add nothing.",
    values: { amount: 1.5 },
    upgrade: { cost: 1 },
  },
  reflect: {
    name: "Reflect", subtitle: "WARDEN / BACKPRESSURE", cost: 1, rarity: "rare", target: "instant", art: "defense", color: "#ffcf8a", archetype: "warden", exhaust: true, retain: true,
    rules: "Retain. Double your backpressure. Exhaust.",
    detail: "Needs stored backpressure.",
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- Protocols
  tripwire: {
    name: "Tripwire", subtitle: "WARDEN / TRAP", cost: 1, rarity: "common", target: "protocol", protocol: "strike", art: "program", color: "#ffb070", archetype: "warden", keyword: "ARMED",
    text: v => `Armed. When a hostile strikes: it takes ${v.damage}.`,
    detail: "It fires in the trap step, before the strike lands: a hostile it kills never acts. Otherwise the strike still lands.",
    values: { damage: 7 },
    upgrade: { values: { damage: 10 } },
  },
  "policy-engine": {
    name: "Policy Engine", subtitle: "WARDEN / POLICY", cost: 1, rarity: "uncommon", target: "daemon", art: "program", color: "#e6c490", archetype: "warden",
    text: v => `Daemon. You can arm ${v.slots} more protocol${v.slots === 1 ? "" : "s"}.`,
    detail: `You arm ${R.maxProtocols} protocols without it. Copies stack.`,
    values: { slots: 1 },
    upgrade: { cost: 0 },
  },
  rearm: {
    name: "Rearm", subtitle: "WARDEN / TRAP", cost: 0, rarity: "uncommon", target: "instant", art: "program", color: "#f0a060", archetype: "warden",
    text: v => `Return your last discarded protocol to hand. It costs 0 this turn.${draw(v.draw)}`,
    detail: "Fired protocols go to your discard pile. Needs a protocol there.",
    upgrade: { values: { draw: 1 } },
  },
  "incident-response": {
    name: "Incident Response", subtitle: "WARDEN / RESPONSE", cost: 1, rarity: "rare", target: "daemon", art: "program", color: "#ff8f6a", archetype: "warden",
    text: v => `Daemon. Whenever a protocol fires, the hostile that set it off takes ${v.damage}.`,
    detail: "It strikes in the trap step, before the action lands (a Jammer Port Security answers takes it too). Copies stack.",
    values: { damage: 4 },
    upgrade: { values: { damage: 6 } },
  },
  "null-route": {
    name: "Null Route", subtitle: "WARDEN / BLACKHOLE", cost: 2, rarity: "rare", target: "protocol", protocol: "breach", cancels: true, art: "defense", color: "#e8a27c", archetype: "warden", keyword: "ARMED",
    rules: "Armed. When a hostile breaches: cancel the breach.",
    detail: "The breach deals 0; its riders (fields, faults, junk, installations) still resolve.",
    upgrade: { cost: 1 },
  },
};
