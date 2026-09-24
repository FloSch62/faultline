/** Warden card effects and daemon hooks (contract section 9.2), merged by effects/index.ts.
 *
 * Cards: Brace (RunState.nextTurn.block), Pushback and Vent (backpressure), Double Shift (api.harden),
 * Entrench, Perimeter and Rearm (TurnEffects.freeCards). Daemons: Persistent State (`blockCarry`),
 * Flow Control (`backpressureRatio`), Hardening Guide (`hardenBonus`: the console and Double Shift),
 * Defense in Depth (`firewallBonus`), Policy Engine (`protocolSlots`), Incident Response
 * (`protocolFired`). The resolver hooks are pure: they read
 * only the card's values and the copy count, so the forecast equals the resolution. Tripwire and
 * Null Route are protocol data (cards/warden.ts); Deep Packet Inspection, Bulkhead, Reflect and the
 * three firewalls keep the engine's legacy branches. Every number comes from the card's `values`. */
import { CARDS } from "../cards.ts";
import type { CardId } from "../types.ts";
import type { OwnerEffects } from "./types.ts";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isProtocol = (id: CardId) => CARDS[id]?.target === "protocol";

export const WARDEN_EFFECTS: OwnerEffects = {
  cards: {
    // Brace: "Gain N block. Next turn, gain M block." The block is generic; the next-turn block
    // arrives with the next turn (combatPreview().nextTurn.block).
    brace: {
      play: (run, { values }) => {
        const next = values.nextBlock ?? 0;
        run.nextTurn = { ...run.nextTurn, block: (run.nextTurn?.block ?? 0) + next };
        return ` · +${next} block next turn`;
      },
    },
    // Pushback: "Gain N block. Add M to your backpressure." The next live transmission releases it.
    pushback: {
      play: (run, { values }) => {
        run.backpressure += values.backpressure ?? 0;
        return ` · backpressure ${run.backpressure}`;
      },
    },
    // Vent: "Gain block equal to your backpressure." The backpressure stays stored.
    vent: {
      play: run => {
        const gained = Math.max(0, run.backpressure);
        run.block += gained;
        return ` · +${gained} block`;
      },
    },
    // Double Shift: "Harden once, without using your console. Draw N." (draw is generic).
    "double-shift": {
      play: (run, { api }) => {
        const { block, repaired } = api.harden(run);
        return ` · hardened +${block} block${repaired ? ` · ${repaired.toUpperCase()} repaired` : ""}`;
      },
    },
    // Entrench: "Double your block." (the multiplier is `values.amount`).
    entrench: {
      validate: run => (run.block > 0 ? null : "You have no block to double."),
      play: (run, { values }) => {
        const gained = run.block * ((values.amount ?? 1) - 1);
        run.block += gained;
        return ` · +${gained} block`;
      },
    },
    // Perimeter: "+N damage this turn per online firewall." Counted when played.
    perimeter: {
      play: (run, { api, values }) => {
        const firewalls = api.network(run).onlineNodes.filter(node => node.role === "firewall").length;
        const bonus = (values.perFirewall ?? 0) * firewalls;
        run.packetBoost += bonus;
        return ` · +${bonus} damage (${plural(firewalls, "online firewall")})`;
      },
    },
    // Rearm: "Return your last discarded protocol to hand. It costs 0 this turn." (draw is generic).
    rearm: {
      validate: run => (run.discardPile.some(isProtocol) ? null : "No protocol is in your discard pile."),
      play: (run, { api }) => {
        let index = run.discardPile.length - 1;
        while (!isProtocol(run.discardPile[index])) index--;
        const [protocol] = run.discardPile.splice(index, 1);
        run.hand.push(protocol);
        (api.effects(run).freeCards ??= []).push(protocol);
        return ` · ${CARDS[protocol].name} returns for 0`;
      },
    },
  },
  daemons: {
    // Persistent State: block survives the enemy phase (what the attacks left of it). A flag: copies add nothing.
    "persistent-state": { blockCarry: ({ card }) => card.values.amount ?? 0 },
    // Flow Control: the Backpressure relic stores this share of the prevented damage (the highest wins).
    "flow-control": { backpressureRatio: ({ card }) => card.values.amount ?? 0 },
    // Defense in Depth: every online firewall blocks N more against each strike and breach; copies stack.
    "defense-in-depth": { firewallBonus: ({ card, count }) => (card.values.firewallBonus ?? 0) * count },
    // Policy Engine: N more protocol slots per copy.
    "policy-engine": { protocolSlots: ({ card, count }) => (card.values.slots ?? 0) * count },
    // Hardening Guide: Harden (the console and Double Shift) gains N more block per copy.
    "hardening-guide": { hardenBonus: ({ card, count }) => (card.values.block ?? 0) * count },
    // Incident Response: the hostile that set a protocol off takes N per copy (trap step).
    "incident-response": { protocolFired: ({ card, count }) => (card.values.damage ?? 0) * count },
  },
};
