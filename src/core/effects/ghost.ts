/** Ghost card effects and daemon hooks (contract section 9.3), merged by effects/index.ts.
 *
 * PHASE C (ghost agent): register every new Ghost card here. Hooks you will need: `turnStart`
 * (Trickle, Botnet), `bufferMultiplier` (Deep Queue), `missDisruptions` (Obfuscation),
 * `payloadBonus` (Exploit Kit), `cardExhausted` (Cover Tracks); turn effects via api.addMisses
 * (Spoof), api.addDodges (Ghost Protocol), `mitm` (Man-in-the-Middle), `payloads` /
 * `payloadDamage` (the Payload token); api.addTokens (Fork Bomb, Shell Access, Botnet), api.strike
 * (Exfiltrate), api.deploy with role "phantom" (Decoy Swarm). */
import type { OwnerEffects } from "./types.ts";

export const GHOST_EFFECTS: OwnerEffects = {
  cards: {},
  daemons: {},
};
