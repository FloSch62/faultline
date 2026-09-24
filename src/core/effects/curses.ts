/** Curse effects (contract section 8): hand hooks keyed by base id, merged by effects/index.ts.
 * Each curse reads its number from `values.amount` (cards/curses.ts).
 * - Memory Leak: `onDraw` ("When you draw it, lose 1 energy", never below 0).
 * - Kernel Panic: `playLimit` (the play functions refuse the card play beyond it this turn).
 * - Backdoor: `endOfTurn` → unblockable integrity loss with the attacks (a forecast term).
 * - Bitrot: `endOfTurn` → wear on the first router of the primary route in the table-front step
 *   (a forecast wear record; nothing without a primary route).
 * Zombie Process needs no hook: `innate: true` on its definition. CVE does nothing but take room.
 * The endOfTurn hooks are pure: the engine calls them identically for the forecast and the enemy
 * phase, so the forecast equals the resolution. */
import type { Network } from "../combat/network.ts";
import type { RunState } from "../types.ts";
import type { OwnerEffects } from "./types.ts";

/** Bitrot's router: the first router on the primary route (the one nearest ALPHA), or null. */
export function bitrotTarget(run: Pick<RunState, "topology">, network: Pick<Network, "primary">): string | null {
  return network.primary?.path.find(id => run.topology.nodes.find(node => node.id === id)?.role === "router") ?? null;
}

export const CURSE_EFFECTS: OwnerEffects = {
  cards: {},
  hand: {
    "memory-leak": {
      onDraw: ({ run, card, api }) => {
        const lost = Math.min(run.energy, card.values.amount ?? 0);
        if (!lost) return;
        run.energy -= lost;
        api.log(run, `${card.name} drains ${lost} energy.`);
      },
    },
    "kernel-panic": {
      playLimit: ({ card }) => card.values.amount ?? Infinity,
    },
    backdoor: {
      endOfTurn: ({ card, count }) => ({ integrity: (card.values.amount ?? 0) * count }),
    },
    bitrot: {
      endOfTurn: ({ run, card, count, network }) => {
        const router = bitrotTarget(run, network);
        return router ? { wear: [{ nodeId: router, points: (card.values.amount ?? 0) * count }] } : {};
      },
    },
  },
};
