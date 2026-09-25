/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Cards and relics (v5 · Three Energy). The card definitions live in data-only files per owner
 * (src/core/cards/{colorless,curses,architect,warden,ghost}.ts); this module merges them into
 * CARDS, building every `+` version from its upgrade, and holds the starter decks, the reward
 * pool and the relics. RULES moved to rules.ts and is re-exported here (and by run.ts) as before. */
import { RULES } from "./rules.ts";
import { COLORLESS_CARDS } from "./cards/colorless.ts";
import { CURSE_CARDS } from "./cards/curses.ts";
import { ARCHITECT_CARDS } from "./cards/architect.ts";
import { WARDEN_CARDS } from "./cards/warden.ts";
import { GHOST_CARDS } from "./cards/ghost.ts";
import { CARD_IDS_BY_OWNER, type Archetype, type BaseCardId, type CardId, type CardOwner, type RelicId } from "./types.ts";
import type { BaseDefinition, CardDefinition, CardValues, Upgrade } from "./card-types.ts";

export { RULES } from "./rules.ts";
export type {
  BaseDefinition, CardDefinition, CardRarity, CardTarget, CardTable, CardValues, ProtocolTrigger, Upgrade,
} from "./card-types.ts";

const R = RULES;
/** Owner tables in merge order (the order of BASE_CARD_IDS and so of every seeded reward pick). */
const TABLES: [CardOwner, Partial<Record<BaseCardId, BaseDefinition>>][] = [
  ["colorless", COLORLESS_CARDS], ["architect", ARCHITECT_CARDS], ["warden", WARDEN_CARDS], ["ghost", GHOST_CARDS], ["curses", CURSE_CARDS],
];
/** Keyword and table flags an upgrade may change. */
const UPGRADE_FLAGS = ["exhaust", "retain", "innate", "volatile", "jamProof", "cutProof", "amplified", "detail"] as const satisfies readonly (keyof Upgrade)[];

function build(): Record<CardId, CardDefinition> {
  const cards = {} as Record<CardId, CardDefinition>;
  for (const [, table] of TABLES)
    for (const [id, definition] of Object.entries(table) as [BaseCardId, BaseDefinition][]) {
      if (Object.hasOwn(cards, id)) throw new Error(`Card ${id} is defined twice`);
      const { upgrade, values: own, text, rules, ...rest } = definition;
      const values: CardValues = { ...(own ?? {}) };
      cards[id] = { ...rest, id, base: id, upgraded: false, rules: text ? text(values) : rules ?? "", values };
      if (!upgrade) continue;
      const plus = `${id}+` as CardId;
      const upgradedValues: CardValues = { ...values, ...(upgrade.values ?? {}) };
      const flags: Partial<CardDefinition> = {};
      for (const key of UPGRADE_FLAGS) if (upgrade[key] !== undefined) (flags as Record<string, unknown>)[key] = upgrade[key];
      cards[plus] = {
        ...rest,
        ...flags,
        id: plus,
        base: id,
        upgraded: true,
        name: `${rest.name}+`,
        // An upgrade that only changes numbers re-runs the base face with its values.
        rules: upgrade.rules ?? (upgrade.text ?? text)?.(upgradedValues) ?? rules ?? "",
        cost: upgrade.cost ?? rest.cost,
        values: upgradedValues,
      };
    }
  return cards;
}

/** Every defined card, `+` versions included. Typed as complete; until phase C lands, ids of the
 * contract that are still undefined are simply absent (`missingCards`). */
export const CARDS: Record<CardId, CardDefinition> = build();
/** Defined base ids, in merge order. */
export const BASE_CARD_IDS = (Object.keys(CARDS) as CardId[]).filter(id => !id.endsWith("+")) as BaseCardId[];

export function baseCard(id: CardId): BaseCardId {
  return (id.endsWith("+") ? id.slice(0, -1) : id) as BaseCardId;
}
export function isUpgraded(id: CardId): boolean {
  return id.endsWith("+");
}
export function canUpgrade(id: CardId): boolean {
  return !isUpgraded(id) && Object.hasOwn(CARDS, `${id}+`);
}
/** The upgraded id, or the same id when no further upgrade exists. */
export function upgraded(id: CardId): CardId {
  return canUpgrade(id) ? (`${id}+` as CardId) : id;
}
export function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.hasOwn(CARDS, value);
}

/** The shared ten of every v5 starter deck (contract section 3); each keeper adds two signature cards. */
export const STARTER_DECK: CardId[] = [
  "router", "router",
  "fiber", "fiber", "fiber",
  "guard", "guard",
  "pulse", "pulse",
  "patch",
];
/** Each keeper's two signature starter cards (12 cards in all). */
export const STARTER_SIGNATURES: Record<Archetype, CardId[]> = {
  architect: ["switch", "branch-line"],
  warden: ["firewall", "deep-inspection"],
  ghost: ["store-forward", "dark-fiber"],
};
/** Which data file owns a base id. */
export function cardOwner(id: CardId): CardOwner {
  const base = baseCard(id);
  return (Object.keys(CARD_IDS_BY_OWNER) as CardOwner[]).find(owner => CARD_IDS_BY_OWNER[owner].includes(base))!;
}
/** Contract ids of an owner that have no definition yet (phase C completeness check). */
export function missingCards(owner: CardOwner): BaseCardId[] {
  return CARD_IDS_BY_OWNER[owner].filter(id => !Object.hasOwn(CARDS, id));
}
/** Base ids that can appear as rewards: never basics, curses, junk or tokens. Keeper filtering
 * happens at offer time (a keeper card is offered only to its keeper). */
export const REWARD_POOL: BaseCardId[] = BASE_CARD_IDS.filter(id => {
  const card = CARDS[id];
  return !["basic", "special"].includes(card.rarity) && !card.junk && !card.curse && !card.token && card.target !== "junk";
});
export function offeredTo(id: CardId, archetype: Archetype): boolean {
  const card = CARDS[id];
  return !!card && !card.junk && !card.curse && !card.token && (!card.archetype || card.archetype === archetype);
}

export type RelicTier = "starter" | "common" | "boss";
export interface RelicDefinition {
  name: string;
  subtitle: string;
  rules: string;
  color: string;
  tier: RelicTier;
}
export const RELICS: Record<RelicId, RelicDefinition> = {
  "cold-start": { name: "Cold Start", subtitle: "POWER UNIT", tier: "common", color: "#6fe8fb", rules: "+1 energy on the first turn of each battle." },
  "hot-swap": { name: "Hot Swap", subtitle: "LINK MODULE", tier: "starter", color: "#c59bff", rules: "The first link card you play each turn costs 0." },
  "parallel-core": { name: "Parallel Core", subtitle: "PACKET ENGINE", tier: "common", color: "#80f8d6", rules: `Bandwidth gives +${R.parallelCorePerChannel} per channel beyond the first instead of +${R.bandwidthPerChannel}.` },
  "shield-array": { name: "Shield Array", subtitle: "DEFENSE MODULE", tier: "common", color: "#ffc186", rules: `Prevent up to ${R.shieldArrayPrevent} damage from the first unblocked hit each battle.` },
  "deep-cache": { name: "Deep Cache", subtitle: "MEMORY MODULE", tier: "starter", color: "#ff9ab6", rules: "Draw one extra card every turn." },
  "grounded-core": { name: "Grounded Core", subtitle: "DEFENSE MODULE", tier: "common", color: "#93d2d0", rules: "Start every turn with 1 block." },
  "packet-lens": { name: "Packet Lens", subtitle: "SIGNAL MODULE", tier: "common", color: "#bbacf0", rules: `Switches on your primary route deal +${R.packetLensSwitchDamage} each instead of +${R.switchDamage}.` },
  "repair-drone": { name: "Repair Drone", subtitle: "RECOVERY MODULE", tier: "common", color: "#b4d58b", rules: "Restore 1 integrity after winning an encounter." },
  "reserve-cell": { name: "Reserve Cell", subtitle: "ENERGY MODULE", tier: "common", color: "#eed290", rules: "Carry up to 2 unspent energy into the next turn." },
  backpressure: { name: "Backpressure", subtitle: "WARDEN CORE", tier: "starter", color: "#f7c56e", rules: `${Number(R.backpressureRatio) === 1 ? "Damage" : "Half the damage (rounded up)"} your shield prevents during an enemy action is stored and added to your next transmission.` },
  honeynet: { name: "Honeynet", subtitle: "DECEPTION GRID", tier: "common", color: "#f3a35f", rules: `Honeypots deal +${R.honeynetBonus} damage and grant ${R.honeynetShield} shield whenever they absorb an attack.` },
  fanout: { name: "Fanout", subtitle: "SIGNAL MODULE", tier: "common", color: "#7fd4ff", rules: "Draw 1 extra card at the start of your turn while 3 or more channels are live." },
  "spare-parts": { name: "Spare Parts", subtitle: "SUPPLY CRATE", tier: "common", color: "#c8b48a", rules: "Start every battle with an extra Optic Fiber in hand." },
  "credit-line": { name: "Credit Line", subtitle: "FINANCE MODULE", tier: "common", color: "#e3d27a", rules: "Gain 15 extra credits after each won battle." },
  watchdog: { name: "Watchdog", subtitle: "RECOVERY MODULE", tier: "common", color: "#9fe0a8", rules: `The first time each battle you transmit with no live route, gain ${R.watchdogShield} shield.` },
  "spanning-tree": { name: "Spanning Tree", subtitle: "BOSS · LOOP-FREE", tier: "boss", color: "#ffb86b", rules: "Your primary route's damage is doubled. Bandwidth and Load Balancers give nothing." },
  anycast: { name: "Anycast", subtitle: "BOSS · ONE ADDRESS", tier: "boss", color: "#8ee6ff", rules: "+1 energy every turn. You cannot place firewalls." },
  "jumbo-frames": { name: "Jumbo Frames", subtitle: "BOSS · LARGE MTU", tier: "boss", color: "#b9a6ff", rules: "+1 energy every turn. Draw 1 fewer card every turn." },
  "bgp-hijack": { name: "BGP Hijack", subtitle: "BOSS · STOLEN ROUTES", tier: "boss", color: "#ff8a8a", rules: `+${R.bgpHijackDamage} damage every transmission. Enemy strikes and breaches deal +${R.bgpHijackEnemyBonus}.` },
  "sdn-controller": { name: "SDN Controller", subtitle: "BOSS · CONTROL PLANE", tier: "boss", color: "#7ef0c4", rules: "Patch Cable and Harden can be used twice per turn (Buffer stays once). Start each battle with 1 less energy." },
  "zero-trust": { name: "Zero Trust", subtitle: "BOSS · VERIFY ALL", tier: "boss", color: "#ffd98a", rules: "Firewalls block double. Cable cards and Patch Cable cost 1 more." },
  // v4 common relics
  "round-robin": { name: "Round Robin", subtitle: "SCHEDULER", tier: "common", color: "#9fd4e8", rules: `At the start of each battle every hostile takes ${R.roundRobinDamage} damage (reinforcements on arrival).` },
  "ingress-filter": { name: "Ingress Filter", subtitle: "EDGE FILTER", tier: "common", color: "#c7b8e6", rules: `Every strike and breach against you deals ${R.ingressFilterReduce} less.` },
  "priority-queue": { name: "Priority Queue", subtitle: "QOS MODULE", tier: "common", color: "#f2c77e", rules: `Your transmission deals +${R.priorityQueueBonus} to its target while the target is the hostile with the least remaining health.` },
  "reinforced-frame": { name: "Reinforced Frame", subtitle: "CHASSIS KIT", tier: "common", color: "#c9b38c", rules: `Every device you deploy has ${R.reinforcedFrameCondition} more condition (${R.deviceCondition + R.reinforcedFrameCondition}; salvage and crate hardware ${R.salvageCondition + R.reinforcedFrameCondition}).` },
  "field-engineer": { name: "Field Engineer", subtitle: "FIELD KIT", tier: "common", color: "#a9d99a", rules: "The first repair each turn costs 0." },
  "bill-of-lading": { name: "Bill of Lading", subtitle: "CARGO MANIFEST", tier: "common", color: "#e0c48f", rules: "Crates are never empty (the empty share becomes credits) and undelivered messages offer three choices." },
  // v4 boss relics
  "storm-control": { name: "Storm Control", subtitle: "BOSS · RATE LIMITS", tier: "boss", color: "#8fc3ff", rules: `+1 energy every turn. Every hostile jam or cut that lands also deals ${R.stormControlDamage} damage to you.` },
  "scorched-earth": { name: "Scorched Earth", subtitle: "BOSS · NO SURRENDER", tier: "boss", color: "#ff9b72", rules: `Whenever one of your actions or devices destroys an installation, its planter takes ${R.scorchedEarthDamage} (your target if the planter is dead). Your devices deploy with ${R.scorchedEarthCondition} less condition.` },
  // v5 boss relics: +1 energy every turn each, the turn base capped at RULES.relicEnergyCap
  "air-gap": { name: "Air Gap", subtitle: "BOSS · ISOLATED CORE", tier: "boss", color: "#9fb4c8", rules: "+1 energy every turn. Card rewards offer one card fewer." },
  "legacy-mainframe": { name: "Legacy Mainframe", subtitle: "BOSS · BIG IRON", tier: "boss", color: "#c8a878", rules: "+1 energy every turn. Sanctuaries cannot repair." },
  overvolt: { name: "Overvolt", subtitle: "BOSS · UNSAFE RAIL", tier: "boss", color: "#ff7a6a", rules: "+1 energy every turn. Gain a Backdoor curse now and after every elite you defeat." },
};
/** Relics that raise the turn's energy base by 1 each (capped by RULES.relicEnergyCap). */
export const ENERGY_RELICS: readonly RelicId[] = ["anycast", "jumbo-frames", "storm-control", "air-gap", "legacy-mainframe", "overvolt"];
