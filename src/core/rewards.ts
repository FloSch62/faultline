/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** v5 card offers (contract section 4): pools, rarities and pre-upgrades for card rewards, crate
 * cards and the market. Pure given a random source: meta.ts passes the expedition RNG, encounter.ts
 * a crate's own seeded stream, so the RNG discipline is unchanged (nothing here draws on its own).
 *
 * Each reward slot rolls, in order: the pool (the keeper's with RULES.keeperShare, else colorless),
 * the rarity (RULES.rewardRarity by room kind; RULES.legendaryShare of rare rolls are legendary; an
 * elite's first slot is uncommon or better), the card (the other pool when the rarity is empty in
 * the chosen one, then any rarity), then the pre-upgrade (RULES.upgradedOfferRate by stage). */
import { CARDS, REWARD_POOL, RULES, canUpgrade, upgraded } from "./cards.ts";
import type { CardId, RoomType, RunState } from "./types.ts";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type RewardPool = "keeper" | "colorless";
/** Normal fights (and caches), elites and event fights, guardians. */
export type RewardKind = keyof typeof RULES.rewardRarity;

export function rewardKind(type: RoomType | "" | undefined): RewardKind {
  return type === "boss" ? "guardian" : type === "elite" || type === "event" ? "elite" : "normal";
}
/** Offerable base cards of one pool: never basics, curses, junk or tokens; keeper cards only for
 * their own keeper. */
export function poolCards(run: Pick<RunState, "archetype">, pool: RewardPool): CardId[] {
  return REWARD_POOL.filter(id => pool === "keeper" ? CARDS[id].archetype === run.archetype : !CARDS[id].archetype);
}
/** Both pools (events, messages and transforms offer from either). */
export function offerableCards(run: Pick<RunState, "archetype">): CardId[] {
  return REWARD_POOL.filter(id => !CARDS[id].archetype || CARDS[id].archetype === run.archetype);
}
/** The rarity of one slot from a roll in [0, 1). The legendary share is carved from the rare band
 * of the same roll, so it costs no extra draw. `first`: an elite's first slot is uncommon or better. */
export function slotRarity(roll: number, kind: RewardKind, first = false): Rarity {
  const [common, uncommon, rare] = RULES.rewardRarity[kind];
  const total = common + uncommon + rare || 1;
  const x = roll * total;
  if (x < common) return kind === "elite" && first ? "uncommon" : "common";
  if (x < common + uncommon) return "uncommon";
  return rare > 0 && (x - common - uncommon) / rare < RULES.legendaryShare ? "legendary" : "rare";
}
/** A card of `rarity` from `pool` avoiding `exclude`; then the other pool; then any rarity (chosen
 * pool first). One draw from `random`. */
export function pickCard(run: Pick<RunState, "archetype">, random: () => number, pool: RewardPool, rarity: Rarity, exclude: readonly CardId[] = []): CardId | null {
  const other: RewardPool = pool === "keeper" ? "colorless" : "keeper";
  const open = (from: RewardPool) => poolCards(run, from).filter(id => !exclude.includes(id));
  const exact = (from: RewardPool) => open(from).filter(id => CARDS[id].rarity === rarity);
  const candidates = [exact(pool), exact(other), open(pool), open(other)].find(list => list.length) ?? [];
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
}
/** Later stages offer some cards already upgraded. One draw. */
export function maybeUpgraded(random: () => number, id: CardId, chance: number): CardId {
  return random() < chance && canUpgrade(id) ? upgraded(id) : id;
}
/** One reward slot: pool, rarity, card, pre-upgrade (four draws; three when no card is left). */
export function rollSlot(run: Pick<RunState, "archetype" | "stage">, random: () => number, kind: RewardKind, slot: number, exclude: readonly CardId[] = []): CardId | null {
  const pool: RewardPool = random() < RULES.keeperShare ? "keeper" : "colorless";
  const rarity = slotRarity(random(), kind, slot === 0);
  const card = pickCard(run, random, pool, rarity, exclude);
  return card ? maybeUpgraded(random, card, RULES.upgradedOfferRate[run.stage] ?? 0) : null;
}
/** Market card slots: keeper common, colorless common, keeper uncommon, colorless uncommon, keeper rare. */
export const MARKET_SLOTS: readonly { pool: RewardPool; rarity: Rarity }[] = [
  { pool: "keeper", rarity: "common" }, { pool: "colorless", rarity: "common" },
  { pool: "keeper", rarity: "uncommon" }, { pool: "colorless", rarity: "uncommon" },
  { pool: "keeper", rarity: "rare" },
];
