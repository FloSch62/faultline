/** The Ghost's cards: "Find the hidden path" (contract section 9.3). Paths: Buffer (store, multiply,
 * release), Evasion (misses, dodges, phantoms, cut-proof lines), Payloads (tokens, card chains,
 * exhaust). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/ghost.ts (new cards) or the engine's legacy if-chains (Spearhead, Replay Attack,
 * Phantom Node, Dark Fiber). Every number an effect or hook reads lives in `values`, and every face
 * is generated from them. The Payload token is created with `api.addTokens(run, "payload", n)`; its
 * damage is counted in `turnEffects.payloads` / `payloadDamage` (never `burst`), so the resolver
 * prints it and the payloadBonus daemons as labelled terms. */
import { RULES } from "../rules.ts";
import type { CardTable, CardValues, GhostCardId } from "../card-types.ts";

/** "a Payload", "3 Payloads". */
const payloads = (count = 1) => (count === 1 ? "a Payload" : `${count} Payloads`);
/** "The next jam or cut", "The next 2 jams or cuts". */
const disruptions = (lead: string, count = 1) => (count === 1 ? `${lead} jam or cut` : `${lead} ${count} jams or cuts`);
const botnet = (v: CardValues, innate: boolean) =>
  `Daemon.${innate ? " Innate." : ""} At the start of your turn, add ${payloads(v.tokens)} to your hand.`;

export const GHOST_CARDS: CardTable<GhostCardId> = {
  // ---------------------------------------------------------------- Buffer: store, multiply, release
  "store-forward": {
    name: "Store and Forward", subtitle: "GHOST / BUFFER", cost: 1, rarity: "basic", target: "instant", art: "program", color: "#a4b8ff", archetype: "ghost",
    text: v => `Add ${v.buffer} to your buffer.`,
    values: { buffer: 4 },
    upgrade: { values: { buffer: 6 } },
  },
  "jitter-buffer": {
    name: "Jitter Buffer", subtitle: "GHOST / BUFFER", cost: 1, rarity: "common", target: "instant", art: "program", color: "#9fc4f5", archetype: "ghost",
    text: v => `Add ${v.buffer} to your buffer. Draw ${v.draw}.`,
    values: { buffer: 3, draw: 1 },
    upgrade: { values: { buffer: 5 } },
  },
  "hold-queue": {
    name: "Hold Queue", subtitle: "GHOST / QUEUE", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#8fb0e8", archetype: "ghost",
    text: v => `Gain ${v.block} block. If you are buffering, add ${v.buffer} to your buffer.`,
    detail: "Buffering: your Buffer console is armed this turn. Arm it before you play this.",
    values: { block: 4, buffer: 4 },
    upgrade: { values: { block: 6, buffer: 6 } },
  },
  flush: {
    name: "Flush", subtitle: "GHOST / RELEASE", cost: 0, rarity: "common", target: "instant", art: "program", color: "#8ad8f0", archetype: "ghost",
    text: v => `Needs a buffer. +${v.burst} damage this turn.`,
    detail: "It does not spend the buffer. On a buffering turn the damage is stored with the rest.",
    values: { burst: 3 },
    upgrade: { values: { burst: 5 } },
  },
  spearhead: {
    name: "Spearhead", subtitle: "GHOST / SPEARHEAD", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#7cc9e6", archetype: "ghost",
    rules: "Your buffer release this turn ignores armor.",
    detail: "Armor and plating: the released buffer lands in full; the rest of the packet still pays them.",
    upgrade: { cost: 0 },
  },
  trickle: {
    name: "Trickle", subtitle: "GHOST / SLOW FILL", cost: 1, rarity: "uncommon", target: "daemon", art: "program", color: "#86bfe0", archetype: "ghost",
    text: v => `Daemon. At the start of your turn, add ${v.buffer} to your buffer.`,
    detail: "It fills after the packet-loss check: a turn that starts without a live route still loses the old buffer.",
    values: { buffer: 2 },
    upgrade: { values: { buffer: 3 } },
  },
  "replay-attack": {
    name: "Replay Attack", subtitle: "GHOST / BUFFER", cost: 1, rarity: "rare", target: "instant", art: "program", color: "#c8a4ff", archetype: "ghost", exhaust: true, retain: true,
    rules: "Retain. Double your buffer. Exhaust.",
    detail: "Needs a buffer.",
    upgrade: { cost: 0 },
  },
  "deep-queue": {
    name: "Deep Queue", subtitle: "GHOST / DEEP BUFFER", cost: 2, rarity: "rare", target: "daemon", art: "program", color: "#a99cf0", archetype: "ghost",
    text: v => `Daemon. Buffering stores ×${RULES.bufferMultiplier + (v.amount ?? 0)} instead of ×${RULES.bufferMultiplier}.`,
    detail: "Copies stack: each running copy raises the multiplier again.",
    values: { amount: 1 },
    upgrade: { cost: 1 },
  },
  exfiltrate: {
    name: "Exfiltrate", subtitle: "GHOST / EXFILTRATION", cost: 1, rarity: "rare", target: "instant", art: "program", color: "#b7a6ff", archetype: "ghost", exhaust: true, retain: true,
    rules: "Retain. Deal your buffer to your target now, ignoring armor. Exhaust.",
    detail: "Needs a buffer, and empties it. Not a transmission: the surplus overflows as usual, but it never breaks an ultimate.",
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- Evasion: misses, dodges, phantoms, cut-proof lines
  spoof: {
    name: "Spoof", subtitle: "GHOST / SPOOFING", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#9ae0e6", archetype: "ghost",
    text: v => `Gain ${v.block} block. ${disruptions("The next", v.misses)} this enemy phase ${v.misses === 1 ? "misses" : "miss"}.`,
    detail: "A miss answers after your protocols and before a Phantom Node. It never stops an overload or an installation.",
    values: { block: 3, misses: 1 },
    upgrade: { values: { block: 5 } },
  },
  "phantom-node": {
    name: "Phantom Node", subtitle: "GHOST / DECOY", cost: 0, rarity: "uncommon", target: "ground", role: "phantom", art: "hardware", color: "#7ef5e6", archetype: "ghost", exhaust: true,
    text: v => `Deploy a phantom. It absorbs the next ${v.absorbs === 1 ? "jam, cut, overload or installation" : `${v.absorbs === 2 ? "two" : v.absorbs} jams, cuts, overloads or installations`}. Exhaust.`,
    detail: "A phantom is never cabled: it sits off every route and fades once spent.",
    values: { absorbs: 1 },
    upgrade: { values: { absorbs: 2 } },
  },
  "dark-fiber": {
    name: "Dark Fiber", subtitle: "GHOST / HIDDEN LINK", cost: 0, rarity: "uncommon", target: "link", art: "cable", color: "#7d8fb8", exhaust: true, archetype: "ghost", cutProof: true,
    text: v => `Link two devices with a cut-proof cable.${v.draw ? ` Draw ${v.draw}.` : ""} Exhaust.`,
    detail: "A cut-proof cable never frays over wreckage either.",
    upgrade: { values: { draw: 1 } },
  },
  "decoy-swarm": {
    name: "Decoy Swarm", subtitle: "GHOST / DECOYS", cost: 1, rarity: "uncommon", target: "instant", art: "hardware", color: "#88eadc", archetype: "ghost", exhaust: true,
    text: v => `Deploy ${v.amount} phantoms off every route. Exhaust.`,
    detail: "They take free sockets on their own. Each absorbs the next jam, cut, overload or installation, then fades. A full table deploys fewer.",
    values: { amount: 2, absorbs: 1 },
    upgrade: { values: { amount: 3 } },
  },
  "ghost-protocol": {
    name: "Ghost Protocol", subtitle: "GHOST / EVASION", cost: 2, rarity: "rare", target: "instant", art: "defense", color: "#b0f0ff", archetype: "ghost", exhaust: true,
    text: v => `${v.dodges === 1 ? "The first strike or breach" : `The first ${v.dodges} strikes or breaches`} this enemy phase ${v.dodges === 1 ? "deals" : "deal"} 0. Exhaust.`,
    detail: "In port order. Its fields, faults, junk and installations still land.",
    values: { dodges: 1 },
    upgrade: { cost: 1 },
  },
  obfuscation: {
    name: "Obfuscation", subtitle: "GHOST / SCRAMBLE", cost: 2, rarity: "rare", target: "daemon", art: "defense", color: "#9fb2f5", archetype: "ghost",
    text: v => `Daemon. ${disruptions("The first", v.misses)} each enemy phase ${v.misses === 1 ? "misses" : "miss"}.`,
    detail: "Copies stack. A miss answers after your protocols and before a Phantom Node; it never stops an overload or an installation.",
    values: { misses: 1 },
    upgrade: { cost: 1 },
  },
  // ---------------------------------------------------------------- Payloads: tokens, card chains, exhaust
  "fork-bomb": {
    name: "Fork Bomb", subtitle: "GHOST / PAYLOADS", cost: 1, rarity: "common", target: "instant", art: "program", color: "#f09ad0", archetype: "ghost",
    text: v => `Add ${payloads(v.tokens)} to your hand.`,
    detail: `Payload: +${RULES.payloadDamage} damage this turn. Exhaust. A full hand sends the rest to your discard pile.`,
    values: { tokens: 2 },
    upgrade: { values: { tokens: 3 } },
  },
  "shell-access": {
    name: "Shell Access", subtitle: "GHOST / FOOTHOLD", cost: 1, rarity: "common", target: "instant", art: "defense", color: "#d7a2e8", archetype: "ghost",
    text: v => `Gain ${v.block} block. Add ${payloads(v.tokens)} to your hand.`,
    detail: `Payload: +${RULES.payloadDamage} damage this turn. Exhaust.`,
    values: { block: 4, tokens: 1 },
    upgrade: { values: { block: 6 } },
  },
  "side-channel": {
    name: "Side Channel", subtitle: "GHOST / LEAK", cost: 1, rarity: "common", target: "instant", art: "program", color: "#e7b0f5", archetype: "ghost",
    text: v => `+${v.perCard} damage this turn per card you played this turn.`,
    detail: "Counts the cards played so far this turn, itself and Payloads included.",
    values: { perCard: 1 },
    upgrade: { cost: 0 },
  },
  payload: {
    name: "Payload", subtitle: "GHOST / TOKEN", cost: 0, rarity: "special", target: "instant", art: "program", color: "#ff9ec8", archetype: "ghost", exhaust: true, token: true,
    text: v => `+${v.damage} damage this turn. Exhaust.`,
    detail: "A token for this encounter only: it never enters your deck.",
    values: { damage: RULES.payloadDamage },
    upgrade: { values: { damage: RULES.payloadDamage + 1 } },
  },
  "exploit-kit": {
    name: "Exploit Kit", subtitle: "GHOST / TOOLKIT", cost: 1, rarity: "uncommon", target: "daemon", art: "program", color: "#e89ab8", archetype: "ghost",
    text: v => `Daemon. Payloads deal +${v.amount} more.`,
    detail: "Every Payload played this turn counts, even one played before the Kit started.",
    values: { amount: 1 },
    upgrade: { values: { amount: 2 } },
  },
  botnet: {
    name: "Botnet", subtitle: "GHOST / SWARM", cost: 1, rarity: "uncommon", target: "daemon", art: "program", color: "#c79af0", archetype: "ghost",
    text: v => botnet(v, false),
    detail: "A full hand sends the Payload to your discard pile.",
    values: { tokens: 1 },
    upgrade: { innate: true, text: v => botnet(v, true) },
  },
  "cover-tracks": {
    name: "Cover Tracks", subtitle: "GHOST / STEALTH", cost: 1, rarity: "uncommon", target: "daemon", art: "defense", color: "#a9a2d8", archetype: "ghost",
    text: v => `Daemon. Whenever a card exhausts, gain ${v.block} block.`,
    detail: "Played Exhaust cards, Payloads, and Volatile cards at the end of your turn.",
    values: { block: 1 },
    upgrade: { values: { block: 2 } },
  },
  "man-in-the-middle": {
    name: "Man-in-the-Middle", subtitle: "GHOST / INTERCEPT", cost: 1, rarity: "rare", target: "instant", art: "program", color: "#d89cff", archetype: "ghost", exhaust: true,
    text: v => `This turn, every card you play adds ${v.mitm} to your buffer. Exhaust.`,
    detail: "Counts the cards played after it this turn, Payloads included.",
    values: { mitm: 2 },
    upgrade: { values: { mitm: 3 } },
  },
};
