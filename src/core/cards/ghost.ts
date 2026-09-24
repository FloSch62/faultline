/** The Ghost's cards: "Find the hidden path" (contract section 9.3). Paths: Buffer (store, multiply,
 * release), Evasion (misses, dodges, phantoms, cut-proof lines), Payloads (tokens, card chains,
 * exhaust). DATA ONLY: imports rules.ts and card-types.ts; behaviour lives in
 * src/core/effects/ghost.ts (new cards) or the engine's legacy if-chains (v4 cards).
 *
 * PHASE C (ghost agent): the table is `CardTable<GhostCardId>`; add every card of 9.3 here
 * (`missingCards("ghost")` lists the missing ids; turn the check on in src/core/ghost.test.ts once
 * it is empty). The Payload token is { rarity: "special", token: true, cost 0, exhaust }; create it
 * with the engine's `api.addTokens(run, "payload", n)` and count it in `turnEffects.payloads` /
 * `payloadDamage` so the resolver prints it (and the payloadBonus hook) as labelled terms. Every
 * definition carries `archetype: "ghost"`. */
import type { CardTable, GhostCardId } from "../card-types.ts";

export const GHOST_CARDS: CardTable<GhostCardId> = {
  // ---------------------------------------------------------------- Buffer
  "store-forward": {
    name: "Store and Forward", subtitle: "GHOST / BUFFER", cost: 1, rarity: "basic", target: "instant", art: "program", color: "#a4b8ff", archetype: "ghost",
    text: v => `Add ${v.buffer} to your buffer.`,
    values: { buffer: 4 },
    upgrade: { values: { buffer: 6 } },
  },
  spearhead: {
    name: "Spearhead", subtitle: "GHOST / SPEARHEAD", cost: 1, rarity: "uncommon", target: "instant", art: "program", color: "#7cc9e6", archetype: "ghost",
    rules: "Your buffer release this turn ignores armor.",
    detail: "Armor and plating: the released buffer lands in full; the rest of the packet still pays them.",
    upgrade: { cost: 0 },
  },
  "replay-attack": {
    name: "Replay Attack", subtitle: "GHOST / BUFFER", cost: 1, rarity: "rare", target: "instant", art: "program", color: "#c8a4ff", archetype: "ghost", exhaust: true, retain: true,
    rules: "Retain. Double your buffer. Exhaust.",
    detail: "Needs a buffer.",
    upgrade: { cost: 0 },
  },
  // ---------------------------------------------------------------- Evasion
  "phantom-node": {
    name: "Phantom Node", subtitle: "GHOST / DECOY", cost: 0, rarity: "uncommon", target: "ground", role: "phantom", art: "hardware", color: "#7ef5e6", archetype: "ghost", exhaust: true,
    text: v => `Deploy a phantom off every route. It absorbs the next ${v.absorbs === 1 ? "jam, cut, overload or installation" : `${v.absorbs === 2 ? "two" : v.absorbs} jams, cuts, overloads or installations`}. Exhaust.`,
    values: { absorbs: 1 },
    upgrade: { values: { absorbs: 2 } },
  },
  "dark-fiber": {
    name: "Dark Fiber", subtitle: "GHOST / HIDDEN LINK", cost: 0, rarity: "uncommon", target: "link", art: "cable", color: "#7d8fb8", exhaust: true, archetype: "ghost", cutProof: true,
    text: v => `Link two devices with a cut-proof cable.${v.draw ? ` Draw ${v.draw}.` : ""} Exhaust.`,
    detail: "A cut-proof cable never frays over wreckage either.",
    upgrade: { values: { draw: 1 } },
  },
  // PHASE C (ghost agent): jitter-buffer, hold-queue, flush, trickle, deep-queue, exfiltrate, spoof,
  // decoy-swarm, ghost-protocol, obfuscation, fork-bomb, shell-access, side-channel, payload,
  // exploit-kit, botnet, cover-tracks, man-in-the-middle.
};
