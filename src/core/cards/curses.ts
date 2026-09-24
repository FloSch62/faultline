/** Curses (permanent deck clutter, contract section 8) and junk (encounter clutter hostiles inject).
 * DATA ONLY: imports rules.ts and card-types.ts; curse behaviour lives in src/core/effects/curses.ts
 * as hand hooks (onDraw, playLimit, endOfTurn) and keyword flags (innate).
 *
 * Every curse: rarity "special", `curse: true`, `unplayable: true`, target "junk". Curses are never
 * offered and can always be removed at a Sanctuary or Market, even at the deck floor (meta.ts
 * removalBlocker), or by an undelivered message's Purge (PURGE_ORDER). A curse's number is its
 * `values.amount`, read by its hand hook. Sources: CVE (ascension, The Unpatched Server), Backdoor
 * (Overvolt, The Quiet Broker), Bitrot (The Firmware Mirror), Memory Leak (Cold Storage), Kernel
 * Panic (The Echo Chamber), Zombie Process (The Zombie Farm). Curses cannot be prepared. */
import { RULES as R } from "../rules.ts";
import type { CardTable, CurseCardId } from "../card-types.ts";

/** The order an undelivered message's Purge takes curses in: CVE first, then the curse table's
 * order (deterministic; encounter.ts names the curse on the message before you choose it). */
export const PURGE_ORDER: readonly CurseCardId[] = ["cve", "zombie-process", "kernel-panic", "backdoor", "bitrot", "memory-leak"];

/** Every curse's detail ends with how to be rid of it. */
const REMOVAL = "Remove it at a Sanctuary or Market, whatever the size of your deck.";

export const CURSE_CARDS: CardTable<CurseCardId> = {
  // ---------------------------------------------------------------- junk (encounter only)
  "packet-loss": {
    name: "Packet Loss", subtitle: "JUNK / NOISE", cost: 0, rarity: "special", target: "junk", art: "program", color: "#7b7f8c", junk: true, unplayable: true, volatile: true,
    rules: "Unplayable. Volatile. Removed after the encounter.",
    detail: "Volatile: if it is still in your hand at the end of your turn, it exhausts.",
  },
  worm: {
    name: "Worm", subtitle: "JUNK / MALWARE", cost: 1, rarity: "special", target: "junk", art: "program", color: "#b0506b", junk: true,
    rules: `Pay 1 to delete it. If it is in your hand when you transmit, the enemy phase's first attack deals ${R.wormDamage} extra damage.`,
  },
  // ---------------------------------------------------------------- curses (permanent)
  cve: {
    name: "CVE", subtitle: "CURSE / VULNERABILITY", cost: 0, rarity: "special", target: "junk", art: "program", color: "#8a4a5c", curse: true, unplayable: true,
    rules: "Unplayable.",
    detail: `A permanent vulnerability. ${REMOVAL}`,
  },
  "zombie-process": {
    name: "Zombie Process", subtitle: "CURSE / ORPHANED", cost: 0, rarity: "special", target: "junk", art: "program", color: "#7d9a64", curse: true, unplayable: true, innate: true,
    rules: "Unplayable. Innate.",
    detail: `Innate: it starts every battle in your opening hand and counts toward its draws. ${REMOVAL}`,
  },
  "kernel-panic": {
    name: "Kernel Panic", subtitle: "CURSE / CRASH", cost: 0, rarity: "special", target: "junk", art: "program", color: "#d0564c", curse: true, unplayable: true,
    text: v => `Unplayable. While it is in your hand, you can play at most ${v.amount} cards.`,
    detail: `Per turn, counting the cards you played before it arrived. Your console, scrubbing, repairs and moving devices are not card plays; deleting a Worm is. ${REMOVAL}`,
    values: { amount: 3 },
  },
  backdoor: {
    name: "Backdoor", subtitle: "CURSE / INTRUSION", cost: 0, rarity: "special", target: "junk", art: "program", color: "#9a3a48", curse: true, unplayable: true,
    text: v => `Unplayable. End of turn in hand: lose ${v.amount} integrity.`,
    detail: `Unblockable: block and shield never stop it. It resolves with the hostiles' attacks, so a transmission that ends the battle spares you. ${REMOVAL}`,
    values: { amount: 1 },
  },
  bitrot: {
    name: "Bitrot", subtitle: "CURSE / DECAY", cost: 0, rarity: "special", target: "junk", art: "program", color: "#b0643e", curse: true, unplayable: true,
    text: v => `Unplayable. End of turn in hand: the first router on your primary route loses ${v.amount} condition.`,
    detail: `The router nearest ALPHA wears in the enemy phase, after the installations; at 0 it breaks. A Server Rack's ring takes the wear instead. No primary route: nothing happens. ${REMOVAL}`,
    values: { amount: 1 },
  },
  "memory-leak": {
    name: "Memory Leak", subtitle: "CURSE / LEAK", cost: 0, rarity: "special", target: "junk", art: "program", color: "#cf9a44", curse: true, unplayable: true,
    text: v => `Unplayable. When you draw it, lose ${v.amount} energy.`,
    detail: `Never below 0. Drawn into your opening hand, it takes the energy from your first turn. ${REMOVAL}`,
    values: { amount: 1 },
  },
};
