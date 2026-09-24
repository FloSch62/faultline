/** Curses (permanent deck clutter, contract section 8) and junk (encounter clutter hostiles inject).
 * DATA ONLY: imports rules.ts and card-types.ts; curse behaviour lives in src/core/effects/curses.ts
 * as hand hooks (onDraw, playLimit, endOfTurn) and keyword flags (innate).
 *
 * PHASE C (colorless agent): add zombie-process, kernel-panic, backdoor, bitrot, memory-leak here
 * (`missingCards("curses")` in cards.ts lists what is still missing). Every curse: rarity "special",
 * `curse: true`, `unplayable: true`, target "junk". Curses are never offered and can always be
 * removed at a Sanctuary or Market, even at the deck floor. */
import { RULES as R } from "../rules.ts";
import type { CardTable, CurseCardId } from "../card-types.ts";

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
    rules: "Unplayable. A permanent vulnerability. Remove it at a Sanctuary or Market.",
  },
  // PHASE C (colorless agent): zombie-process, kernel-panic, backdoor, bitrot, memory-leak.
};
