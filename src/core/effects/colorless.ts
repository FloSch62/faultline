/** Colorless card effects and daemon hooks (contract section 7). Registered by base id; merged by
 * effects/index.ts. The v4 colorless cards still run on the engine's legacy if-chains in run.ts
 * (their numbers come from their `values`); the v5 cards register here:
 * - Ping: generic values only (burst, draw): no entry.
 * - Hotfix: a node card for any worn device; repairs by `values.repair` (draw is generic).
 * - Keepalive: the engine's worked example of a daemon (turnStart adds the block).
 * - Rollback: returns the most recent card played this turn that is still in the discard pile.
 * - Firmware Update: every card in hand becomes its `+` id for the rest of the battle (the deck is
 *   untouched: battle piles are rebuilt from the deck at every encounter). */
import { CARDS, canUpgrade, upgraded } from "../cards.ts";
import { isWorn, repairDevice } from "../combat/board.ts";
import type { CardId, RunState } from "../types.ts";
import type { OwnerEffects } from "./types.ts";

/** Rollback's card: the most recent card played this turn that is still in the discard pile.
 * Exhaust cards, daemons, armed protocols and deleted junk never land there; a card reshuffled
 * into the draw pile since is passed over for the one before it. Null when there is none. */
export function rollbackTarget(run: RunState): CardId | null {
  const played = run.turnEffects?.cardsPlayed ?? [];
  for (let i = played.length - 1; i >= 0; i--) {
    const id = played[i], card = CARDS[id];
    if (!card || card.exhaust || card.target === "daemon" || card.target === "protocol" || card.target === "junk") continue;
    if (run.discardPile.includes(id)) return id;
  }
  return null;
}

/** Replaces one `from` in a list of hand ids with `to` (encounter-only cards, discounts). */
function carry(list: CardId[] | undefined, from: CardId, to: CardId) {
  const index = list?.indexOf(from) ?? -1;
  if (index >= 0) list![index] = to;
}

export const COLORLESS_EFFECTS: OwnerEffects = {
  cards: {
    // Hotfix: "Repair a device by N. Draw 1." Only worn devices light up.
    hotfix: {
      canTarget: (_run, node) => isWorn(node),
      play: (_run, { node, values }) => {
        const restored = repairDevice(node!, values.repair ?? 0);
        return ` · +${restored} condition`;
      },
    },
    // Rollback: "Return the last non-Exhaust card you played this turn to your hand. Exhaust."
    // Rollback itself is in cardsPlayed only after its play, and it exhausts, so it never finds itself.
    rollback: {
      validate: run => rollbackTarget(run) ? null : "Nothing to roll back: no card you played this turn is in your discard pile.",
      play: run => {
        const id = rollbackTarget(run)!;
        run.discardPile.splice(run.discardPile.lastIndexOf(id), 1);
        run.hand.push(id);
        return ` · ${CARDS[id].name} returns to your hand`;
      },
    },
    // Firmware Update: "Upgrade every card in your hand for this battle. Exhaust." Encounter-only
    // cards stay encounter-only and discounts stay on their card under its new id.
    "firmware-update": {
      validate: (run, { id }) => run.hand.filter(canUpgrade).length - Number(canUpgrade(id)) > 0 ? null : "No card in your hand can be upgraded.",
      play: run => {
        let count = 0;
        run.hand.forEach((id, i) => {
          if (!canUpgrade(id)) return;
          const plus = upgraded(id);
          run.hand[i] = plus;
          carry(run.encounterCards, id, plus);
          carry(run.turnEffects?.discounted, id, plus);
          carry(run.turnEffects?.freeCards, id, plus);
          count++;
        });
        return ` · ${count} card${count === 1 ? "" : "s"} upgraded for this battle`;
      },
    },
  },
  daemons: {
    // Keepalive: "Daemon. At the start of your turn, gain N block." Each copy adds its block.
    keepalive: {
      turnStart: ({ run, card, count }) => { run.block += (card.values.block ?? 0) * count; },
    },
  },
};
