/** The Warden's cards: "Hold what remains" (contract section 9.2). Paths: Fortress (block that
 * becomes backpressure), Firewall wall (many firewalls, per-firewall payoffs), Protocols (armed traps
 * and retaliation). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/warden.ts (new cards) or the engine's legacy if-chains (v4 cards).
 *
 * PHASE C (warden agent): the table is `CardTable<WardenCardId>`; add every card of 9.2 here
 * (`missingCards("warden")` lists the missing ids; turn the check on in src/core/warden.test.ts
 * once it is empty). Protocols are pure data: Tripwire is { target: "protocol", protocol: "strike",
 * values: { damage } } and Null Route { protocol: "breach", cancels: true } — the resolver's
 * generic protocol table does the rest (see CardDefinition.protocol in card-types.ts). Every
 * definition carries `archetype: "warden"`. */
import { RULES as R } from "../rules.ts";
import type { CardTable, WardenCardId } from "../card-types.ts";

export const WARDEN_CARDS: CardTable<WardenCardId> = {
  // ---------------------------------------------------------------- Firewall wall
  "deep-inspection": {
    name: "Deep Packet Inspection", subtitle: "WARDEN / DEFENSE", cost: 1, rarity: "basic", target: "instant", art: "defense", color: "#f0b476", archetype: "warden",
    text: v => `Gain ${v.block} block, +${v.perFirewall} per online firewall.`,
    values: { block: 3, perFirewall: 2 },
    upgrade: { values: { block: 5, perFirewall: 3 } },
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
    text: v => `Gain ${v.block} block. This enemy phase, each firewall blocks ${v.firewallBonus} more per attack.`,
    values: { block: 3, firewallBonus: 1 },
    upgrade: { values: { block: 5, firewallBonus: 1 } },
  },
  bastion: {
    name: "Bastion Firewall", subtitle: "WARDEN / SECURITY", cost: 2, rarity: "rare", target: "ground", role: "firewall", art: "defense", color: "#e5bf82", archetype: "warden", jamProof: true,
    text: v => `Deploy a jam-proof firewall. Gain ${v.block} block.`,
    values: { block: 6 },
    upgrade: { values: { block: 9 } },
  },
  // ---------------------------------------------------------------- Fortress
  reflect: {
    name: "Reflect", subtitle: "WARDEN / BACKPRESSURE", cost: 1, rarity: "rare", target: "instant", art: "defense", color: "#ffcf8a", archetype: "warden", exhaust: true, retain: true,
    rules: "Retain. Double your backpressure. Exhaust.",
    detail: "Needs stored backpressure.",
    upgrade: { cost: 0 },
  },
  // PHASE C (warden agent): brace, pushback, stand-firm, vent, double-shift, entrench,
  // persistent-state, flow-control, acl-gate, perimeter, defense-in-depth, tripwire, policy-engine,
  // rearm, incident-response, null-route.
};
