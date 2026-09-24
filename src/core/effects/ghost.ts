/** Ghost card effects and daemon hooks (contract section 9.3), merged by effects/index.ts. The v4
 * Ghost cards (Store and Forward, Spearhead, Replay Attack, Phantom Node, Dark Fiber) still run on
 * the engine's generic values and legacy branches; everything else registers here. Numbers come
 * from the card's `values` (daemon hooks: per copy, times `count`). Player-turn hooks mutate the run
 * through `api`; the resolver hooks (Deep Queue, Obfuscation, Exploit Kit) are pure and the engine
 * prints them as labelled forecast terms. Payload damage never uses `burst`: it is counted in
 * `turnEffects.payloads` / `payloadDamage`, which the resolver prints as "Payload ×N". */
import { CARDS, baseCard } from "../cards.ts";
import { RULES } from "../rules.ts";
import type { EngineApi, OwnerEffects } from "./types.ts";
import type { RunState } from "../types.ts";

const EMPTY_BUFFER = "Your buffer is empty.";
const needsBuffer = (run: RunState) => (run.buffer > 0 ? null : EMPTY_BUFFER);
/** Payload tokens into the hand; the note names any that went to the discard pile. */
function addPayloads(run: RunState, api: EngineApi, count: number): string {
  const inHand = api.addTokens(run, "payload", count);
  const word = (n: number) => `${n} Payload${n === 1 ? "" : "s"}`;
  return inHand === count ? ` · ${word(count)} in hand` : ` · ${word(inHand)} in hand, ${count - inHand} to discard`;
}

export const GHOST_EFFECTS: OwnerEffects = {
  cards: {
    // ---------------------------------------------------------------- Buffer
    // Jitter Buffer and Store and Forward take the generic `buffer` (and `draw`).
    "hold-queue": {
      manual: ["buffer"],
      play: (run, { values }) => {
        if (!run.buffering) return;
        run.buffer += values.buffer ?? 0;
        return ` · +${values.buffer} buffered`;
      },
    },
    flush: { validate: needsBuffer },
    exfiltrate: {
      validate: needsBuffer,
      play: (run, { api }) => {
        const amount = run.buffer;
        run.buffer = 0;
        const hit = api.strike(run, amount, { ignoreArmor: true });
        return ` · ${hit.total} dealt${hit.killed.length ? ` · ${hit.killed.length} down` : ""}`;
      },
    },
    // ---------------------------------------------------------------- Evasion
    spoof: {
      play: (run, { api, card, values }) => { api.addMisses(run, values.misses ?? 0, card.name); },
    },
    "decoy-swarm": {
      validate: (run, { api }) => (api.freeSocket(run) ? null : "The table has no free socket for a phantom."),
      play: (run, { api, id, values }) => {
        let deployed = 0;
        for (let i = 0; i < (values.amount ?? 0); i++) {
          const socket = api.freeSocket(run);
          if (!socket || !api.deploy(run, "phantom", socket, { absorbs: values.absorbs ?? 1, deployedBy: id })) break;
          deployed++;
        }
        return ` · ${deployed} phantom${deployed === 1 ? "" : "s"} deployed`;
      },
    },
    "ghost-protocol": {
      play: (run, { api, card, values }) => { api.addDodges(run, values.dodges ?? 0, card.name); },
    },
    // ---------------------------------------------------------------- Payloads
    "fork-bomb": { play: (run, { api, values }) => addPayloads(run, api, values.tokens ?? 0) },
    "shell-access": { play: (run, { api, values }) => addPayloads(run, api, values.tokens ?? 0) },
    "side-channel": {
      // run.cardsPlayed already counts this card (the engine pays before the effect runs).
      play: (run, { values }) => {
        const bonus = (values.perCard ?? 0) * run.cardsPlayed;
        run.packetBoost += bonus;
        return ` · +${bonus} damage`;
      },
    },
    payload: {
      play: (run, { api, values }) => {
        const fx = api.effects(run);
        fx.payloads = (fx.payloads ?? 0) + 1;
        fx.payloadDamage = (fx.payloadDamage ?? 0) + (values.damage ?? RULES.payloadDamage);
      },
    },
    "man-in-the-middle": {
      play: (run, { api, values }) => {
        const fx = api.effects(run);
        fx.mitm = (fx.mitm ?? 0) + (values.mitm ?? 0);
      },
    },
  },
  daemons: {
    // Trickle: "At the start of your turn, add N to your buffer."
    trickle: {
      turnStart: ({ run, card, count }) => { run.buffer += (card.values.buffer ?? 0) * count; },
    },
    // Deep Queue: buffering stores ×(base + amount); each copy raises it again (pure). The engine
    // keeps the highest multiplier offered, so every running copy (Deep Queue and Deep Queue+ alike)
    // is counted here rather than per id.
    "deep-queue": {
      bufferMultiplier: ({ run }) => RULES.bufferMultiplier
        + run.daemons.filter(id => baseCard(id) === "deep-queue").reduce((sum, id) => sum + (CARDS[id].values.amount ?? 0), 0),
    },
    // Obfuscation: the first N jams or cuts each enemy phase miss (pure).
    obfuscation: {
      missDisruptions: ({ card, count }) => (card.values.misses ?? 0) * count,
    },
    // Exploit Kit: every Payload played this turn deals more (pure; the resolver multiplies per Payload).
    "exploit-kit": {
      payloadBonus: ({ card, count }) => (card.values.amount ?? 0) * count,
    },
    // Botnet: "At the start of your turn, add a Payload to your hand."
    botnet: {
      turnStart: ({ run, api, card, count }) => { api.addTokens(run, "payload", (card.values.tokens ?? 0) * count); },
    },
    // Cover Tracks: "Whenever a card exhausts, gain N block."
    "cover-tracks": {
      cardExhausted: ({ run, card, count }) => { run.block += (card.values.block ?? 0) * count; },
    },
  },
};
