/** Expedition layer: rooms, rewards, credits, sanctuary services, the market,
 * relic choices and events. Combat rules live in run.ts; this module decides
 * what happens between fights. */
import { CARDS, RELICS, REWARD_POOL, baseCard, canUpgrade, isUpgraded, upgraded } from "./cards.ts";
import { reachableRooms, createMap } from "./map.ts";
import { STAGES } from "./stages.ts";
import { beginBattle } from "./run.ts";
import { random, shuffle, log } from "./util.ts";
import { EVENTS, eventDefinition, openEvent } from "./events.ts";
import { creditMultiplier, priceMultiplier, repairMultiplier } from "./ascension.ts";
import { PRE_UPGRADE_CHANCE, encounterRoom, planEncounter, slotRarity } from "./encounter.ts";
import type { CardId, MapRoom, RelicId, RunState, ShopState } from "./types.ts";
import type { ActionResult } from "./run.ts";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

// ---------------------------------------------------------------- pools

/** Base cards that may be offered to this expedition: no basics, junk or
 * curses, and archetype cards only for their own archetype. */
export function offerPool(run: RunState): CardId[] {
  return [...new Set(REWARD_POOL.map(id => baseCard(id) as CardId))].filter(id => {
    const card = CARDS[id];
    return card && !isUpgraded(id) && card.rarity !== "basic" && !card.junk && !card.curse &&
      card.target !== "junk" && (!card.archetype || card.archetype === run.archetype);
  });
}

/** Seeded pick of one offerable card of a rarity, avoiding `exclude`. Falls back
 * to any offerable card when the rarity is exhausted. */
export function rollCard(run: RunState, rarity: Rarity, exclude: CardId[] = [], filter: (id: CardId) => boolean = () => true): CardId | null {
  const pool = offerPool(run).filter(id => filter(id) && !exclude.includes(id));
  const exact = pool.filter(id => CARDS[id].rarity === rarity);
  const available = exact.length ? exact : pool;
  return available.length ? available[Math.floor(random(run) * available.length)] : null;
}

/** Relics of a tier that the expedition does not own, seeded order. */
export function relicPool(run: RunState, tier: "common" | "boss"): RelicId[] {
  return (Object.keys(RELICS) as RelicId[]).filter(id =>
    !run.relics.includes(id) && (RELICS[id].tier ?? "common") === tier);
}

export function rollRelics(run: RunState, tier: "common" | "boss", count: number): RelicId[] {
  return shuffle(run, relicPool(run, tier)).slice(0, count);
}

/** Later stages sometimes offer cards that are already upgraded (PRE_UPGRADE_CHANCE by stage). */
function maybeUpgraded(run: RunState, id: CardId, chance: number): CardId {
  return random(run) < chance && canUpgrade(id) ? upgraded(id) : id;
}

function currentRoom(run: RunState): MapRoom | undefined {
  return run.map.find(room => room.id === run.currentRoom);
}

export function cardRewards(run: RunState): CardId[] {
  const type = currentRoom(run)?.type ?? "";
  const elite = ["elite", "boss", "event"].includes(type);
  const options: CardId[] = [];
  for (let i = 0; i < 3; i++) {
    const roll = random(run);
    const rarity: Rarity = elite && i === 0 ? "rare" : slotRarity(roll, elite);
    const card = rollCard(run, rarity, options.map(id => baseCard(id) as CardId));
    if (card) options.push(maybeUpgraded(run, card, PRE_UPGRADE_CHANCE[run.stage] ?? 0));
  }
  return options;
}

/** Normal relic offer: three unowned common-tier relics. */
export function relicRewards(run: RunState): RelicId[] {
  return rollRelics(run, "common", 3);
}

// ---------------------------------------------------------------- deck services

const isRouterCard = (id: CardId) => CARDS[id].role === "router" && CARDS[id].target === "ground";
const isCableCard = (id: CardId) => CARDS[id].target === "link";

/** Why a deck card cannot be removed (or transformed away), or null. */
export function removalBlocker(run: RunState, index: number): string | null {
  const card = run.deck[index];
  if (!card || !CARDS[card]) return "Choose a card from your deck.";
  if (CARDS[card].curse) return null;
  if (run.deck.length <= 10) return "Keep at least 10 cards in your deck.";
  if ((isRouterCard(card) && run.deck.filter(isRouterCard).length <= 1) ||
    (isCableCard(card) && run.deck.filter(isCableCard).length <= 2))
    return "Keep one router and two cabling cards for a reliable opening route.";
  return null;
}

export function upgradeBlocker(run: RunState, index: number): string | null {
  const card = run.deck[index];
  if (!card || !CARDS[card]) return "Choose a card from your deck.";
  return canUpgrade(card) ? null : `${CARDS[card].name} cannot be upgraded further.`;
}

export const upgradableIndices = (run: RunState) => run.deck.map((_, i) => i).filter(i => !upgradeBlocker(run, i));
export const removableIndices = (run: RunState) => run.deck.map((_, i) => i).filter(i => !removalBlocker(run, i));

function applyUpgrade(run: RunState, index: number): string {
  const before = run.deck[index];
  run.deck[index] = upgraded(before);
  return CARDS[before].name;
}

// ---------------------------------------------------------------- rooms

export function chooseRoom(run: RunState, roomId: string): ActionResult {
  if (run.phase !== "map")
    return { ok: false, message: "Choose a route from the map." };
  const room = reachableRooms(run).find((item) => item.id === roomId);
  if (!room) return { ok: false, message: "That sector is not on your route." };
  run.currentRoom = room.id;
  if (room.type === "cache") {
    run.phase = "reward";
    run.cardRewards = cardRewards(run);
    const credits = Math.round(15 * creditMultiplier(run.ascension));
    run.credits += credits;
    run.creditsEarned = credits;
    log(run, `Supply cache located. +${credits} credits. Choose one card.`);
  } else if (room.type === "forge") {
    run.phase = "forge";
    log(run, "Sanctuary secured. Choose one service.");
  } else if (room.type === "shop") {
    openShop(run);
    log(run, "The market lights flicker on. Spend your credits.");
  } else if (room.type === "event") {
    openEvent(run);
    log(run, `Unknown signal: ${eventDefinition(run.event!.id).title}.`);
  } else {
    // planEncounter (called by beginBattle) applies every health rule: pack shares,
    // Hardened and the ascension multipliers.
    beginBattle(run, room);
  }
  const guardian = run.enemies?.find(enemy => enemy.port === "centre") ?? run.enemies?.[0];
  return {
    ok: true,
    message:
      room.type === "boss"
        ? `${guardian?.name ?? "The guardian"} detected.`
        : room.type === "shop" ? "Entered the market."
          : room.type === "event" ? "An unknown signal answers."
            : `Entered ${room.type.toUpperCase()} sector.`,
  };
}

export function advanceRoom(run: RunState) {
  if (!run.currentRoom) return;
  const room = run.map.find((item) => item.id === run.currentRoom)!;
  room.cleared = true;
  run.lastRoom = room.id;
  run.floor = room.floor + 1;
  run.currentRoom = null;
  run.enemies = [];
  run.zoneEffects = [];
  run.faultNodes = [];
  run.faultLinks = [];
  run.preparedCard = null;
  // Encounter-scoped combat state never survives a room.
  run.installations = [];
  run.focus = null;
  run.enemyPhase = 0;
  run.hostileActions = 0;
  run.reinforcement = null;
  run.signal = null;
  run.offers = [];
  run.encounterCards = [];
  delete run.lingeringJams;
  delete run.frayedByCut;
  delete run.repairsThisTurn;
  delete run.turnEffects;
  delete run.creditLedger;
  delete run.reclaim;
  delete run.attackers;
  delete run.entrance;
  run.protocols = [];
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  run.terrain = null;
  run.shop = null;
  run.event = null;
  run.creditsEarned = 0;
  if (run.floor >= 7 && run.stage < STAGES.length - 1) {
    run.stage++;
    run.floor = 0;
    run.map = createMap(run.stage, run.seed, run.ascension);
    run.lastRoom = null;
    const restored = Math.min(6, run.maxIntegrity - run.integrity);
    run.integrity += restored;
    log(run, `${STAGES[run.stage - 1].name} restored. +${restored} integrity. Enter ${STAGES[run.stage].name}.`);
    run.phase = "map";
  } else run.phase = run.floor >= 7 ? "won" : "map";
}

/** Called by combat when every hostile is defeated. Pays the room's credits, the
 * encounter plan's pack / designation / reinforcement credits and everything banked
 * during the fight (crates, messages; already multiplied by ascension 7), then leaves
 * the itemised ledger in run.creditLedger for the reward screen ("14 room · 4 pack"). */
export function grantVictory(run: RunState) {
  const room = currentRoom(run);
  const fight = encounterRoom(run);
  run.phase = "reward";
  run.cardRewards = cardRewards(run);
  const base = room?.type === "boss" ? 50
    : room?.type === "elite" ? 30 + 5 * run.stage
      : room?.type === "event" ? 40
        : 14 + 3 * run.stage + Math.floor(random(run) * 5);
  const label = room?.type === "boss" ? "guardian" : room?.type === "elite" ? "elite" : room?.type === "event" ? "signal" : "room";
  const ledger: { label: string; amount: number }[] = [{ label, amount: Math.round(base * creditMultiplier(run.ascension)) }];
  const add = (line: { label: string; amount: number }) => {
    const existing = ledger.find(item => item.label === line.label);
    if (existing) existing.amount += line.amount; else ledger.push({ ...line });
  };
  if (fight) planEncounter(run, fight).credits.forEach(add);
  (run.creditLedger ?? []).forEach(add);
  if (run.relics.includes("credit-line")) add({ label: "credit line", amount: 15 });
  const credits = ledger.reduce((sum, line) => sum + line.amount, 0);
  run.credits += credits;
  run.creditsEarned = credits;
  run.creditLedger = ledger.filter(line => line.amount > 0);
  // A crate's card choice is for this encounter only; after the fight it has nothing to give.
  run.offers = (run.offers ?? []).filter(offer => offer.kind !== "crate-card");
  log(run, `+${credits} credits recovered.`);
}

export function chooseCardReward(
  run: RunState,
  card: CardId | null,
): ActionResult {
  if (run.phase !== "reward")
    return { ok: false, message: "No card reward is active." };
  if (card && !run.cardRewards.includes(card))
    return { ok: false, message: "That card is not a reward option." };
  if (card) {
    run.deck.push(card);
    log(run, `${CARDS[card].name} added to the deck.`);
  }
  run.cardRewards = [];
  const room = currentRoom(run);
  const relics = room?.type === "elite" ? relicRewards(run)
    : room?.type === "boss" && run.stage < STAGES.length - 1 ? rollRelics(run, "boss", 3)
      : [];
  if (relics.length) {
    run.relicRewards = relics;
    run.phase = "relic";
  } else advanceRoom(run);
  return {
    ok: true,
    message: card
      ? `${CARDS[card].name} added to deck.`
      : "Card reward skipped.",
  };
}

export function chooseRelic(run: RunState, relic: RelicId): ActionResult {
  if (run.phase !== "relic" || !run.relicRewards.includes(relic))
    return { ok: false, message: "That relic is unavailable." };
  run.relics.push(relic);
  run.relicRewards = [];
  log(run, `${RELICS[relic].name} installed.`);
  advanceRoom(run);
  return { ok: true, message: `${RELICS[relic].name} installed.` };
}

// ---------------------------------------------------------------- sanctuary

export const SALVAGE_COST = 2;
export const SALVAGE_MIN_INTEGRITY = 6;

/** Sanctuary repair: 30% of maximum integrity, at least 4, before ascension. */
export function repairAmount(run: RunState): number {
  return Math.floor(Math.max(4, Math.round(run.maxIntegrity * 0.3)) * repairMultiplier(run.ascension));
}

export type ForgeOption = "repair" | "relic" | "upgrade" | "remove";

/** One sanctuary service. "upgrade" and "remove" validate availability; the
 * interface then asks for a card and calls upgradeDeckCard / removeDeckCard. */
export function chooseForge(run: RunState, option: ForgeOption): ActionResult {
  if (run.phase !== "forge")
    return { ok: false, message: "No sanctuary is active." };
  if (option === "repair") {
    const restored = Math.min(repairAmount(run), run.maxIntegrity - run.integrity);
    run.integrity += restored;
    log(run, `Sanctuary repair restored ${restored} integrity.`);
    advanceRoom(run);
    return { ok: true, message: `${restored} integrity restored.` };
  }
  if (option === "upgrade")
    return upgradableIndices(run).length
      ? { ok: true, message: "Choose a card to upgrade." }
      : { ok: false, message: "No card in your deck can be upgraded." };
  if (option === "remove")
    return removableIndices(run).length
      ? { ok: true, message: "Choose a card to remove." }
      : { ok: false, message: "No card can be removed while keeping a reliable deck." };
  if (!relicPool(run, "common").length)
    return { ok: false, message: "No relic remains to salvage. Choose another service." };
  if (run.maxIntegrity - SALVAGE_COST < SALVAGE_MIN_INTEGRITY)
    return { ok: false, message: `Relic salvage must leave at least ${SALVAGE_MIN_INTEGRITY} maximum integrity.` };
  run.relicRewards = relicRewards(run);
  run.maxIntegrity -= SALVAGE_COST;
  run.integrity = Math.min(run.integrity, run.maxIntegrity);
  log(run, `Sacrificed ${SALVAGE_COST} maximum integrity to salvage a relic. The cost lasts for this expedition.`);
  run.phase = "relic";
  return { ok: true, message: `Maximum integrity reduced by ${SALVAGE_COST}. Select one relic.` };
}

/** Sanctuary upgrade: the chosen card becomes its "+" version. */
export function upgradeDeckCard(run: RunState, index: number): ActionResult {
  if (run.phase !== "forge")
    return { ok: false, message: "Card upgrades are performed at a sanctuary or the market." };
  const blocked = upgradeBlocker(run, index);
  if (blocked) return { ok: false, message: blocked };
  const name = applyUpgrade(run, index);
  log(run, `${name} upgraded.`);
  advanceRoom(run);
  return { ok: true, message: `${name} upgraded.` };
}

/** Sanctuary removal: one card leaves the deck. Keep a reliable basic route. */
export function removeDeckCard(run: RunState, index: number): ActionResult {
  if (run.phase !== "forge")
    return { ok: false, message: "Card removal is available at sanctuaries." };
  const blocked = removalBlocker(run, index);
  if (blocked) return { ok: false, message: blocked };
  const [card] = run.deck.splice(index, 1);
  log(run, `${CARDS[card].name} removed from the deck.`);
  advanceRoom(run);
  return { ok: true, message: `${CARDS[card].name} removed.` };
}

// ---------------------------------------------------------------- market

export const CARD_PRICES: Record<Rarity, number> = { common: 35, uncommon: 55, rare: 85, legendary: 140 };
export const UPGRADED_PREMIUM = 20;
export const RELIC_PRICE = { min: 100, max: 130 };
export const REMOVE_PRICE = { base: 50, step: 25 };
export const UPGRADE_PRICE = 40;
const SHOP_SLOTS: Rarity[] = ["common", "common", "uncommon", "uncommon", "rare"];

export const marketPrice = (run: RunState, base: number) => Math.round(base * priceMultiplier(run.ascension) / 5) * 5;

export const ROUTER_PRICE = 30;
export function openShop(run: RunState) {
  const cards: ShopState["cards"] = [];
  for (const slot of SHOP_SLOTS) {
    const rarity: Rarity = slot === "rare" && random(run) < 0.06 ? "legendary" : slot;
    const base = rollCard(run, rarity, cards.map(offer => baseCard(offer.id) as CardId));
    if (!base) continue;
    const id = maybeUpgraded(run, base, 0.15);
    const jitter = [-5, 0, 5][Math.floor(random(run) * 3)];
    const price = CARD_PRICES[CARDS[base].rarity as Rarity] ?? CARD_PRICES.common;
    cards.push({ id, price: marketPrice(run, price + jitter + (isUpgraded(id) ? UPGRADED_PREMIUM : 0)), sold: false });
  }
  // The hardware bench always stocks a basic Core Router: routers are never card
  // rewards, and wide networks need more than the two in the starter deck.
  cards.unshift({ id: "router", price: marketPrice(run, ROUTER_PRICE), sold: false });
  const relics = rollRelics(run, "common", 2).map(id => ({
    id, price: marketPrice(run, RELIC_PRICE.min + 5 * Math.floor(random(run) * 7)), sold: false,
  }));
  run.shop = {
    cards, relics,
    removePrice: marketPrice(run, REMOVE_PRICE.base + REMOVE_PRICE.step * run.removals),
    upgradePrice: marketPrice(run, UPGRADE_PRICE),
    removed: false, upgraded: false,
  };
  run.phase = "shop";
}

function marketReady(run: RunState): ActionResult | null {
  return run.phase === "shop" && run.shop ? null : { ok: false, message: "No market is open." };
}

function pay(run: RunState, price: number): ActionResult | null {
  return run.credits >= price ? null : { ok: false, message: `You need ${price} credits; you have ${run.credits}.` };
}

export function buyCard(run: RunState, offerIndex: number): ActionResult {
  const closed = marketReady(run);
  if (closed) return closed;
  const offer = run.shop!.cards[offerIndex];
  if (!offer || offer.sold) return { ok: false, message: "That card is no longer for sale." };
  const short = pay(run, offer.price);
  if (short) return short;
  run.credits -= offer.price;
  offer.sold = true;
  run.deck.push(offer.id);
  log(run, `Bought ${CARDS[offer.id].name} for ${offer.price} credits.`);
  return { ok: true, message: `${CARDS[offer.id].name} added to your deck.` };
}

export function buyRelic(run: RunState, offerIndex: number): ActionResult {
  const closed = marketReady(run);
  if (closed) return closed;
  const offer = run.shop!.relics[offerIndex];
  if (!offer || offer.sold || run.relics.includes(offer.id)) return { ok: false, message: "That relic is no longer for sale." };
  const short = pay(run, offer.price);
  if (short) return short;
  run.credits -= offer.price;
  offer.sold = true;
  run.relics.push(offer.id);
  log(run, `Bought ${RELICS[offer.id].name} for ${offer.price} credits.`);
  return { ok: true, message: `${RELICS[offer.id].name} installed.` };
}

export function shopRemoveCard(run: RunState, deckIndex: number): ActionResult {
  const closed = marketReady(run);
  if (closed) return closed;
  const shop = run.shop!;
  if (shop.removed) return { ok: false, message: "The market removes one card per visit." };
  const blocked = removalBlocker(run, deckIndex);
  if (blocked) return { ok: false, message: blocked };
  const short = pay(run, shop.removePrice);
  if (short) return short;
  run.credits -= shop.removePrice;
  shop.removed = true;
  run.removals++;
  const [card] = run.deck.splice(deckIndex, 1);
  log(run, `${CARDS[card].name} removed for ${shop.removePrice} credits.`);
  return { ok: true, message: `${CARDS[card].name} removed.` };
}

export function shopUpgradeCard(run: RunState, deckIndex: number): ActionResult {
  const closed = marketReady(run);
  if (closed) return closed;
  const shop = run.shop!;
  if (shop.upgraded) return { ok: false, message: "The market upgrades one card per visit." };
  const blocked = upgradeBlocker(run, deckIndex);
  if (blocked) return { ok: false, message: blocked };
  const short = pay(run, shop.upgradePrice);
  if (short) return short;
  run.credits -= shop.upgradePrice;
  shop.upgraded = true;
  const name = applyUpgrade(run, deckIndex);
  log(run, `${name} upgraded for ${shop.upgradePrice} credits.`);
  return { ok: true, message: `${name} upgraded.` };
}

export function leaveShop(run: RunState): ActionResult {
  const closed = marketReady(run);
  if (closed) return closed;
  log(run, "Left the market.");
  advanceRoom(run);
  return { ok: true, message: "You leave the market behind." };
}

// ---------------------------------------------------------------- events

export interface EventChoiceView {
  label: string;
  detail: string;
  disabled?: string;
  needsCard?: "upgrade" | "remove" | "transform" | "duplicate";
}
export interface EventView {
  id: string;
  title: string;
  kicker: string;
  text: string;
  art?: string;
  choices: EventChoiceView[];
  resolved: boolean;
  outcome?: string;
}

export function eventView(run: RunState): EventView | null {
  const state = run.event;
  if (!state || !Object.hasOwn(EVENTS, state.id)) return null;
  const event = EVENTS[state.id];
  return {
    id: event.id, title: event.title, kicker: event.kicker, text: event.text, art: event.art,
    resolved: state.resolved, outcome: state.outcome,
    choices: event.choices.map((choice, index) => {
      const disabled = choice.disabled?.(run, state) ?? noEligibleCard(run, index);
      return {
        label: typeof choice.label === "function" ? choice.label(run, state) : choice.label,
        detail: choice.detail(run, state),
        ...(disabled ? { disabled } : {}),
        ...(choice.needsCard ? { needsCard: choice.needsCard } : {}),
      };
    }),
  };
}

/** A card-choosing option is unavailable when no deck card qualifies. */
function noEligibleCard(run: RunState, choiceIndex: number): string | undefined {
  const choice = run.event && EVENTS[run.event.id]?.choices[choiceIndex];
  if (!choice?.needsCard || eventCardChoices(run, choiceIndex).length) return undefined;
  return {
    upgrade: "Nothing in your deck can be improved.",
    remove: "Nothing in your deck can be removed.",
    transform: "Nothing in your deck can be transformed.",
    duplicate: "Nothing in your deck can be copied.",
  }[choice.needsCard];
}

/** Deck indices a card-choosing event option accepts. */
export function eventCardChoices(run: RunState, choiceIndex: number): number[] {
  const state = run.event;
  const choice = state && EVENTS[state.id]?.choices[choiceIndex];
  if (!choice?.needsCard) return [];
  return run.deck.map((_, i) => i).filter(i => !cardChoiceBlocker(run, choice.needsCard!, i));
}

export function cardChoiceBlocker(run: RunState, need: NonNullable<EventChoiceView["needsCard"]>, index: number): string | null {
  const card = run.deck[index];
  if (!card || !CARDS[card]) return "Choose a card from your deck.";
  if (need === "upgrade") return upgradeBlocker(run, index);
  if (need === "remove" || need === "transform") return removalBlocker(run, index);
  return CARDS[card].curse ? "A curse cannot be duplicated." : null;
}

export function chooseEvent(run: RunState, choiceIndex: number, deckIndex?: number): ActionResult {
  const state = run.event;
  if (run.phase !== "event" || !state) return { ok: false, message: "No event is active." };
  if (state.resolved) return { ok: false, message: "This event has already been answered." };
  const event = EVENTS[state.id];
  const choice = event?.choices[choiceIndex];
  if (!choice) return { ok: false, message: "Choose one of the offered answers." };
  const disabled = choice.disabled?.(run, state) ?? noEligibleCard(run, choiceIndex);
  if (disabled) return { ok: false, message: disabled };
  if (choice.needsCard) {
    if (deckIndex === undefined) return { ok: false, message: "Choose a card from your deck." };
    const blocked = cardChoiceBlocker(run, choice.needsCard, deckIndex);
    if (blocked) return { ok: false, message: blocked };
  }
  const outcome = choice.resolve(run, state, deckIndex);
  // Choices that begin a fight leave the event phase; the reward screen follows.
  if (run.phase === "event") {
    state.resolved = true;
    state.outcome = outcome;
  }
  log(run, outcome);
  return { ok: true, message: outcome };
}

export function leaveEvent(run: RunState): ActionResult {
  if (run.phase !== "event" || !run.event) return { ok: false, message: "No event is active." };
  if (!run.event.resolved) return { ok: false, message: "Answer the signal first." };
  advanceRoom(run);
  return { ok: true, message: "The signal fades behind you." };
}

