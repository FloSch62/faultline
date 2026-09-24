/** Colorless card effects and daemon hooks (contract section 7). Registered by base id; merged by
 * effects/index.ts. The v4 colorless cards still run on the engine's legacy if-chains in run.ts
 * (their numbers come from their `values`); new cards register here.
 *
 * PHASE C (colorless agent): add ping, hotfix, rollback and firmware-update to `cards` (and any
 * hooks). Keepalive below is the engine's worked example of a daemon: its definition sits in
 * cards/colorless.ts, its turnStart hook here, its test in src/core/engine-v5.test.ts. */
import type { OwnerEffects } from "./types.ts";

export const COLORLESS_EFFECTS: OwnerEffects = {
  cards: {},
  daemons: {
    // Keepalive: "Daemon. At the start of your turn, gain N block." Each copy adds its block.
    keepalive: {
      turnStart: ({ run, card, count }) => { run.block += (card.values.block ?? 0) * count; },
    },
  },
};
