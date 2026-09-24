/** Curse effects (contract section 8): hand hooks keyed by base id, merged by effects/index.ts.
 *
 * PHASE C (colorless agent): register
 * - memory-leak: `hand.onDraw` ("When you draw it, lose 1 energy", never below 0);
 * - kernel-panic: `hand.playLimit` (3: the play functions refuse the 4th card play this turn);
 * - backdoor: `hand.endOfTurn` → { integrity: 1 × count } (unblockable, resolves with the attacks);
 * - bitrot: `hand.endOfTurn` → { wear: [{ nodeId: first router on ctx.network.primary, points }] }
 *   (the table-front step; nothing without a primary route).
 * Zombie Process needs no hook: `innate: true` on its definition. */
import type { OwnerEffects } from "./types.ts";

export const CURSE_EFFECTS: OwnerEffects = {
  cards: {},
  hand: {},
};
