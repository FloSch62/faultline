/** Encounter plans: who stands at the rail, with what health, cargo and surprises.
 *
 * Everything here is pure and seeded by (seed, stage, room id) through a local
 * generator. It never touches run.rng, so reloading, drawing cards or undoing an
 * action can never change a pack, a crate, a reinforcement, a signal or a message.
 * The engine (beginBattle) applies the plan; grantVictory re-reads its credits. */
import type { ActionResult } from "./run.ts";
import type {
  CardId, CrateContents, DesignationId, Enemy, HostileRole, MapRoom, MessageOption, MessageOptionId,
  Offer, Port, Reinforcement, Role, RunState, SignalId,
} from "./types.ts";
import { CARDS, RULES, baseCard } from "./cards.ts";
import { PURGE_ORDER } from "./cards/curses.ts";
import { pickCard, rollSlot } from "./rewards.ts";
import {
  DESIGNATIONS, ENEMIES, ESCORT_THREAT, MESSAGE_OPTIONS, REINFORCEMENT_ESCORTS, SHED_SPAWN, SIGNALS, SIGNAL_IDS,
  compositionAllowed, hostileName, threatBudget,
} from "./enemies.ts";
import { encounterHealth, roomTemplate, rollRoomContents } from "./map.ts";
import { STAGES } from "./stages.ts";
import { ascends, creditMultiplier, healthMultiplier } from "./ascension.ts";
import { log } from "./util.ts";
import { MESSAGE_FRAGMENTS, designationEntranceLine, reinforcementEntranceLine } from "../story.ts";

export interface EncounterPlan {
  /** Port order (left, centre, right). hp/maxHp set; designations on the leader or single. */
  enemies: Enemy[];
  /** Rolled arrival, or a Shedding spawn armed at the half-health crossing ({ shed: true, after: -1 }). */
  reinforcement: Reinforcement | null;
  /** The fight's one signal; the engine names its target at the turn-2 announcement. */
  signal: SignalId | null;
  /** Pack, designation and reinforcement credits (ascension 7 applied), paid by grantVictory. */
  credits: { label: string; amount: number }[];
  /** Entrance lines: every designation ("NESTING · its first action …") and the reinforcement warning. */
  entrance: string[];
  /** Designations that were hidden on the chart and are revealed at this entrance. */
  revealed: DesignationId[];
}

export const PORTS: readonly Port[] = ["left", "centre", "right"];

/** Salvage hardware roles by stage: crates, Salvaged hostiles and COLD START. */
export const SALVAGE_ROLES: readonly (readonly Role[])[] = [
  ["switch", "firewall"],
  ["switch", "firewall", "cache", "power"],
  ["cache", "power", "balancer", "firewall"],
];
const ROLE_NAMES: Partial<Record<Role, string>> = {
  router: "Core Router", switch: "Edge Switch", firewall: "Trust Gate", honeypot: "Honeypot",
  cache: "Cache Server", power: "PoE Injector", balancer: "Load Balancer", rack: "Server Rack", phantom: "Phantom Node",
};
export const roleName = (role: Role) => ROLE_NAMES[role] ?? role;

// ---------------------------------------------------------------- seeded randomness

/** A local xorshift generator hashed from its parts. Independent of run.rng. */
export function seededRandom(...parts: (string | number)[]): () => number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  let state = hash || 0x2545f491;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let i = 0; i < 4; i++) next();
  return next;
}
const pick = <T>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)];

// ---------------------------------------------------------------- reward-slot cards

/** Later stages offer some cards already upgraded (RULES.upgradedOfferRate by stage; read it live). */
export const PRE_UPGRADE_CHANCE: readonly number[] = RULES.upgradedOfferRate;
export { slotRarity, type Rarity as SlotRarity } from "./rewards.ts";
/** Two named cards for a crate, each rolled like a normal reward slot (pool, rarity, card,
 * pre-upgrade) from the crate's own seeded stream. */
function crateCards(run: RunState, random: () => number): [CardId, CardId] | null {
  const cards: CardId[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const card = rollSlot(run, random, "normal", slot, cards.map(id => baseCard(id) as CardId));
    if (!card) return null;
    cards.push(card);
  }
  return [cards[0], cards[1]];
}

// ---------------------------------------------------------------- crates

const credit = (run: RunState, amount: number) => Math.round(amount * creditMultiplier(run.ascension));

/** Sealed cargo, fixed when the encounter begins (section 8.2). Bill of Lading turns the empty share into credits. */
function rollCrate(run: RunState, random: () => number): CrateContents {
  const weights = RULES.crateWeights;
  const empty = Math.max(0, Math.min(1, RULES.crateEmptyShare));
  const filled = weights.salvage + weights.credits + weights.card;
  const roll = random();
  let kind: "salvage" | "credits" | "card" | "empty";
  if (roll < empty || filled <= 0) kind = run.relics.includes("bill-of-lading") ? "credits" : "empty";
  else {
    const share = (roll - empty) / (1 - empty) * filled;
    kind = share < weights.salvage ? "salvage" : share < weights.salvage + weights.credits ? "credits" : "card";
  }
  if (kind === "empty") return { kind: "empty" };
  const message = random() < RULES.crateMessageShare;
  const rider = message ? { message: true as const } : {};
  if (kind === "salvage") {
    const roles = SALVAGE_ROLES[Math.max(0, Math.min(2, run.stage))];
    return { kind: "salvage", role: pick(random, roles), ...rider };
  }
  if (kind === "card") {
    const cards = crateCards(run, random);
    if (cards) return { kind: "card", cards, ...rider };
  }
  const [low, high] = RULES.crateCredits;
  return { kind: "credits", amount: credit(run, low + Math.floor(random() * (high - low + 1))), ...rider };
}

/** Credits a crate yields when its salvage finds no legal socket (rule 60), ascension 7 applied. */
export function crateFallbackCredits(run: RunState): number {
  return credit(run, RULES.crateFallbackCredits);
}

/** The salvage role a Salvaged hostile drops or a COLD START lands, from the stage's crate
 * roles, seeded by (seed, stage, room, salt): pass the hostile's uid, or "cold-start". */
export function salvageRole(run: RunState, salt: string): Role {
  const roles = SALVAGE_ROLES[Math.max(0, Math.min(2, run.stage))];
  return pick(seededRandom("salvage", run.seed, run.stage, run.currentRoom ?? "", salt), roles);
}

/** Toast line for an opened crate: "Edge Switch salvaged", "+12 credits", "Empty crate." */
export function crateText(crate: CrateContents): string {
  const letter = "message" in crate && crate.message ? " · an undelivered message" : "";
  if (crate.kind === "salvage") return `${roleName(crate.role)} salvaged${letter}`;
  if (crate.kind === "credits") return `+${crate.amount} credits${letter}`;
  if (crate.kind === "card") return `${CARDS[crate.cards[0]].name} or ${CARDS[crate.cards[1]].name}${letter}`;
  return "Empty crate.";
}

// ---------------------------------------------------------------- hostiles

/** A hostile ready for the rail. Escorts act on their port's parity (left odd, right even). */
export function makeEnemy(id: string, uid: string, port: Port, role: HostileRole, hp: number, extra: Partial<Enemy> = {}): Enemy {
  const definition = ENEMIES[id];
  const health = Math.max(1, Math.round(hp));
  return {
    id, uid, name: definition.name, title: definition.title, color: definition.color,
    hp: health, maxHp: health, turn: 0, port, role,
    ...(role === "escort" ? { cadence: port === "right" ? "even" : "odd" } : {}),
    ...extra,
  };
}

/** The next free hostile uid ("h1", "h2", …) for a reinforcement or an add. */
export function nextUid(run: RunState): string {
  const used = (run.enemies ?? []).map(enemy => Number(enemy.uid.replace(/^h/, ""))).filter(Number.isFinite);
  return `h${Math.max(0, ...used) + 1}`;
}

/** An add's health: RULES.addHealth (read live, so the balance probe's --rule reaches it) with
 * the ascension 6 rule (RULES.ascensionAddHealth). */
export function addHealth(run: RunState, id: string): number {
  const base = (RULES.addHealth as Record<string, number>)[id] ?? ENEMIES[id]?.addHealth ?? 0;
  return Math.round(base * (ascends(run.ascension, "ancientGuardians") ? RULES.ascensionAddHealth : 1));
}

type Shape = "single" | "duo" | "pair" | "trio";
function shapeOf(leader: string | undefined, escorts: readonly string[]): Shape {
  return !leader ? "duo" : escorts.length === 0 ? "single" : escorts.length === 1 ? "pair" : "trio";
}

/** Member health in the order leader (if any), then escorts. Pack shares split
 * RULES.packHealthScale × H; Hardened adds its share to the designated hostile. */
function memberHealth(single: number, leader: string | undefined, escorts: readonly string[], hardened: boolean): number[] {
  const shape = shapeOf(leader, escorts);
  const raw = shape === "single" ? [single] : (() => {
    const shares = RULES.packShares[shape];
    const sum = shares.reduce((total, share) => total + share, 0);
    return shares.slice(0, (leader ? 1 : 0) + escorts.length).map(share => single * RULES.packHealthScale * share / sum);
  })();
  return raw.map((hp, i) => Math.max(1, Math.round(hp * (hardened && leader && i === 0 ? 1 + RULES.hardenedHealth : 1))));
}

// ---------------------------------------------------------------- planning

/** The encounter's hostiles, health, cargo, arrival, signal, credits and entrance lines. */
export function planEncounter(run: RunState, room: MapRoom): EncounterPlan {
  const random = seededRandom("plan", run.seed, run.stage, room.id);
  const stage = run.stage;
  const region = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
  const boss = room.type === "boss";
  const single = encounterHealth(stage, room, run.ascension);
  const escorts = boss ? [] : [...(room.pack ?? [])];
  const pool: readonly string[] = room.type === "elite" ? region.elites : region.encounters;
  const leader = boss ? room.enemyId ?? region.boss
    : room.enemyId ?? (escorts.length ? undefined : pick(random, pool));
  const designations = boss || !leader ? [] : [...(room.designations ?? [])];
  const shape = shapeOf(leader, escorts);
  const health = memberHealth(single, leader, escorts, designations.includes("hardened"));

  // Rail: left escort, centre leader (or single), right escort. A duo leaves the centre empty.
  const slots: { id: string; port: Port; role: HostileRole; hp: number; lead: boolean }[] = [];
  const escortHealth = leader ? health.slice(1) : health;
  const escortPorts: Port[] = escorts.length === 1 ? ["left"] : ["left", "right"];
  escorts.forEach((id, i) => slots.push({ id, port: escortPorts[i], role: "escort", hp: escortHealth[i], lead: false }));
  if (leader) slots.push({ id: leader, port: "centre", role: shape === "single" ? "single" : "leader", hp: health[0], lead: true });
  slots.sort((a, b) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port));

  // Reinforcement: a Shedding designation is the fight's one arrival; otherwise normal and
  // event rooms roll by stage, elites follow the chart. Never with guardians or a full rail.
  let reinforcement: Reinforcement | null = null;
  let rolled = false;
  const emptyPort = shape !== "trio";
  if (designations.includes("shedding") && emptyPort) {
    const spawn = SHED_SPAWN[Math.max(0, Math.min(2, stage))];
    reinforcement = { enemyId: spawn, after: -1, hp: Math.max(1, Math.round(single * RULES.reinforcementShares.pair)), crate: { kind: "empty" }, shed: true };
  } else if (!boss && emptyPort) {
    const elite = room.type === "elite";
    const arrives = elite ? room.reinforced === true : random() < (RULES.reinforcementRate[stage] ?? 0);
    if (arrives) {
      const template = roomTemplate(stage, room);
      const band = threatBudget(stage, elite ? "elite" : "battle", true);
      const candidates = (REINFORCEMENT_ESCORTS[stage] ?? []).filter(id =>
        compositionAllowed([...escorts, id]) && (!template || template.threat + ESCORT_THREAT[id] <= band));
      if (candidates.length) {
        const enemyId = pick(random, candidates);
        const share = shape === "single" ? RULES.reinforcementShares.single : RULES.reinforcementShares.pair;
        const count = elite && stage >= 2 ? RULES.eliteReinforcementCount : RULES.reinforcementCount;
        reinforcement = { enemyId, after: count, hp: Math.max(1, Math.round(single * share)), crate: { kind: "empty" } };
        rolled = true;
      }
    }
  }
  // Each crate has its own stream, so one crate's contents never shift another's.
  const crateRandom = (slot: string) => seededRandom("crate", run.seed, run.stage, room.id, slot);
  if (reinforcement) reinforcement.crate = rollCrate(run, crateRandom("reinforcement"));

  // Signal: stage II and III only, never guardians or the expedition's first fight; a fight
  // with an arrival rolls only good signals; a bad one that breaks the pack budget turns good.
  let signal: SignalId | null = null;
  const firstFight = stage === 0 && room.floor === 0;
  if (!boss && !firstFight && random() < (RULES.signalRate[stage] ?? 0)) {
    const usable = SIGNAL_IDS.filter(id => leader || (id !== "resync" && id !== "surge"));
    const good = usable.filter(id => SIGNALS[id].kind === "good");
    const template = roomTemplate(stage, room);
    const threat = (template?.threat ?? 0) + designations.reduce((sum, id) => sum + DESIGNATIONS[id].threat, 0) + 1.5;
    const overBudget = !!template && threat > threatBudget(stage, room.type === "elite" ? "elite" : "battle");
    let choice = pick(random, reinforcement ? good : usable);
    if (SIGNALS[choice].kind === "bad" && overBudget) choice = pick(random, good);
    signal = choice ?? null;
  }

  // Every escort carries a sealed crate (adds never do).
  const enemies = slots.map((slot, i) => makeEnemy(slot.id, `h${i + 1}`, slot.port, slot.role, slot.hp, {
    ...(slot.lead && designations.length ? { designations: [...designations] } : {}),
    ...(slot.role === "escort" ? { crate: rollCrate(run, crateRandom(`h${i + 1}`)) } : {}),
  }));

  const credits: EncounterPlan["credits"] = [];
  if (escorts.length) credits.push({ label: "pack", amount: credit(run, RULES.packCredits) });
  if (designations.length) credits.push({ label: "designation", amount: credit(run, RULES.designationCredits) });
  if (rolled) credits.push({ label: "reinforced", amount: credit(run, RULES.reinforcementCredits) });

  const hidden = !!room.designationHidden;
  const entrance = designations.map(id => designationEntranceLine(id, stage));
  if (rolled && reinforcement) entrance.push(reinforcementEntranceLine(hostileName(reinforcement.enemyId), reinforcement.after));
  return { enemies, reinforcement, signal, credits, entrance, revealed: hidden ? [...designations] : [] };
}

/** What the chart shows for a room: members (leader first), visible designations,
 * the UNKNOWN glyph and each member's health. A hidden ribbon stays hidden until the
 * room is entered (and is shown in the record once it is cleared). */
export function roomScout(run: RunState, room: MapRoom): { members: string[]; designations: DesignationId[]; hidden: boolean; health: number[] } {
  const boss = room.type === "boss";
  const leader = boss ? room.enemyId ?? STAGES[run.stage]?.boss : room.enemyId;
  const escorts = boss ? [] : room.pack ?? [];
  const members = [...(leader ? [leader] : []), ...escorts];
  const hidden = !!room.designationHidden && !room.cleared && run.currentRoom !== room.id;
  const designations = hidden || boss ? [] : [...(room.designations ?? [])];
  const single = encounterHealth(run.stage, room, run.ascension);
  const health = members.length ? memberHealth(single, leader, escorts, designations.includes("hardened")) : [];
  return { members, designations, hidden, health };
}

/** Signal in the Static: the event room as a fight, rolled like the stage's normals
 * (packs and designations included) from the seed, never run.rng. */
export function eventRoom(run: RunState, room: MapRoom, enemyId: string): MapRoom {
  const fight: MapRoom = { ...room, type: "event", enemyId, cleared: false };
  delete fight.pack; delete fight.designations; delete fight.designationHidden; delete fight.reinforced;
  rollRoomContents(seededRandom("event", run.seed, run.stage, room.id), run.stage, fight, run.ascension);
  return fight;
}

/** The room the current encounter is fought in (the synthesized room for an event fight). */
export function encounterRoom(run: RunState): MapRoom | null {
  const room = run.map.find(item => item.id === run.currentRoom);
  if (!room) return null;
  if (room.type === "event") return run.event?.enemyId ? eventRoom(run, room, run.event.enemyId) : null;
  return ["battle", "elite", "boss"].includes(room.type) ? room : null;
}

// ---------------------------------------------------------------- undelivered messages

const MESSAGE_IDS = Object.keys(MESSAGE_OPTIONS) as MessageOptionId[];

/** An undelivered message: two named options (three with Bill of Lading), drawn without
 * replacement by weight from the seed; exact amounts after ascension. Call it once the
 * transmission's damage is applied: when no hostile is left standing, Recover (a card for
 * this encounter) is left out because the message opens on the victory screen. */
export function messageOffer(run: RunState, source: "laden" | "crate", salt: string): Offer {
  const random = seededRandom("message", run.seed, run.stage, run.currentRoom ?? "", source, salt);
  const fightOver = run.phase !== "battle" || !(run.enemies ?? []).some(enemy => enemy.hp > 0);
  const pool = MESSAGE_IDS.filter(id => !(fightOver && id === "recover"));
  const count = run.relics.includes("bill-of-lading") ? 3 : 2;
  const options: MessageOption[] = [];
  while (options.length < count && pool.length) {
    const total = pool.reduce((sum, id) => sum + MESSAGE_OPTIONS[id].weight, 0);
    let roll = random() * total;
    let index = pool.findIndex(id => (roll -= MESSAGE_OPTIONS[id].weight) < 0);
    if (index < 0) index = pool.length - 1;
    const [id] = pool.splice(index, 1);
    if (id === "restore") options.push({ id, amount: RULES.messageRestore });
    else if (id === "reinforce") options.push({ id, amount: RULES.messageMaxIntegrity });
    else if (id === "credit") options.push({ id, amount: credit(run, RULES.messageCredits) });
    else if (id === "purge") { const curse = purgeCurse(run.deck); options.push(curse ? { id, card: curse } : { id }); }
    else {
      // Recover: a named rare card from either pool (the keeper's first, like a reward slot).
      const card = pickCard(run, random, random() < RULES.keeperShare ? "keeper" : "colorless", "rare");
      if (card) options.push({ id, card });
    }
  }
  const fragment = pick(random, MESSAGE_FRAGMENTS);
  return { kind: "message", sender: fragment.sender, text: fragment.text, options };
}

/** The exact effect of one message option, as the dialog prints it. */
export function messageOptionText(option: MessageOption): string {
  switch (option.id) {
    case "restore": return `Restore ${option.amount ?? RULES.messageRestore} integrity now.`;
    case "reinforce": return `+${option.amount ?? RULES.messageMaxIntegrity} maximum integrity, permanently.`;
    case "credit": return `Take ${option.amount ?? RULES.messageCredits} credits.`;
    case "recover": return `${option.card && CARDS[option.card] ? CARDS[option.card].name : "A rare card"} enters your hand for this encounter; it exhausts when played.`;
    case "purge": return option.card && CARDS[option.card]?.curse
      ? `Every junk card leaves your piles for this encounter, and ${CARDS[option.card].name} leaves your deck permanently.`
      : "Every junk card leaves your piles for this encounter.";
  }
}

/** Purge: the curse an undelivered message removes (PURGE_ORDER: CVE first), or null. The offer
 * names it (`option.card`); the deck does not change before it is answered. */
export function purgeCurse(deck: readonly CardId[]): CardId | null {
  return PURGE_ORDER.find(id => deck.includes(id)) ?? null;
}

/** Credits taken during a fight are banked like crate credits and paid by grantVictory;
 * on the victory screen they are paid at once and join the ledger on screen. */
function bankCredits(run: RunState, label: string, amount: number) {
  const ledger = run.creditLedger ?? (run.creditLedger = []);
  const line = ledger.find(item => item.label === label);
  if (line) line.amount += amount; else ledger.push({ label, amount });
  if (run.phase === "reward") {
    run.credits += amount;
    run.creditsEarned = (run.creditsEarned ?? 0) + amount;
  }
}

/** An encounter-only card: into the hand (the draw pile's top when the hand is full). */
function giveEncounterCard(run: RunState, card: CardId): boolean {
  if (run.phase !== "battle") return false;
  if (run.hand.length < RULES.handLimit) run.hand.push(card);
  else run.drawPile.unshift(card);
  (run.encounterCards ??= []).push(card);
  return true;
}

function removeOne(list: CardId[], id: CardId): boolean {
  const index = list.indexOf(id);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

/** Resolves the oldest waiting offer (a message or a crate's card choice) with one option. */
export function chooseOffer(run: RunState, optionIndex: number): ActionResult {
  const offer = run.offers?.[0];
  if (!offer) return { ok: false, message: "Nothing is waiting to be answered." };
  if (run.phase !== "battle" && run.phase !== "reward") return { ok: false, message: "Answer it during the encounter or on the victory screen." };
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return { ok: false, message: "Choose one of the offered options." };
  let message: string;
  if (offer.kind === "crate-card") {
    const card = offer.cards[optionIndex];
    if (!card || !CARDS[card]) return { ok: false, message: "Choose one of the crate's cards." };
    run.offers.shift();
    message = giveEncounterCard(run, card)
      ? `${CARDS[card].name} joins your hand for this encounter.`
      : `${CARDS[card].name} fades with the encounter.`;
  } else {
    const option = offer.options[optionIndex];
    if (!option) return { ok: false, message: "Choose one of the message's options." };
    run.offers.shift();
    if (option.id === "restore") {
      const restored = Math.max(0, Math.min(option.amount ?? RULES.messageRestore, run.maxIntegrity - run.integrity));
      run.integrity += restored;
      message = `The message restores ${restored} integrity.`;
    } else if (option.id === "reinforce") {
      const amount = option.amount ?? RULES.messageMaxIntegrity;
      run.maxIntegrity += amount;
      message = `The message reinforces you: +${amount} maximum integrity.`;
    } else if (option.id === "credit") {
      const amount = option.amount ?? credit(run, RULES.messageCredits);
      bankCredits(run, "message", amount);
      message = `The message carried ${amount} credits.`;
    } else if (option.id === "recover") {
      const card = option.card && CARDS[option.card] ? option.card : null;
      message = card && giveEncounterCard(run, card)
        ? `${CARDS[card].name} recovered for this encounter.`
        : "The recovered card fades with the encounter.";
    } else {
      const junk = (id: CardId) => !!CARDS[id]?.junk;
      const removed = [run.hand, run.drawPile, run.discardPile].reduce((sum, pile) => sum + pile.filter(junk).length, 0);
      run.hand = run.hand.filter(id => !junk(id));
      run.drawPile = run.drawPile.filter(id => !junk(id));
      run.discardPile = run.discardPile.filter(id => !junk(id));
      // The named curse (or, for an offer that named none, the one PURGE_ORDER picks now).
      const curse = option.card && CARDS[option.card]?.curse && run.deck.includes(option.card) ? option.card : purgeCurse(run.deck);
      if (curse) {
        removeOne(run.deck, curse);
        [run.hand, run.drawPile, run.discardPile, run.exhaustPile].some(pile => removeOne(pile, curse));
      }
      message = `The message purges ${removed} junk card${removed === 1 ? "" : "s"}${curse ? ` and a ${CARDS[curse].name} from your deck` : ""}.`;
    }
  }
  log(run, message);
  return { ok: true, message };
}
