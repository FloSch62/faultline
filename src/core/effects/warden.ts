/** Warden card effects and daemon hooks (contract section 9.2), merged by effects/index.ts.
 *
 * PHASE C (warden agent): register every new Warden card here. Hooks you will need: `blockCarry`
 * (Persistent State), `backpressureRatio` (Flow Control), `firewallBonus` (Defense in Depth),
 * `protocolSlots` (Policy Engine), `protocolFired` (Incident Response), `hardenBonus` if any;
 * RunState.nextTurn.block (Brace), api.harden (Double Shift). Tripwire and Null Route are pure
 * protocol data (cards/warden.ts): no effect entry needed. */
import type { OwnerEffects } from "./types.ts";

export const WARDEN_EFFECTS: OwnerEffects = {
  cards: {},
  daemons: {},
};
