/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** v5 card marks: keyword glossary, keeper sigils, the missing-art fallback, modified costs and
 * Kernel Panic's play limit. Every mark is read from card flags and run state (never parsed from a
 * card's face text), so tuning a card changes its marks with it. Pure presentation helpers. */
import { CARDS, RELICS, baseCard, type CardDefinition } from "./core/cards.ts";
import { costFor, playLimit } from "./core/run.ts";
import type { Archetype, CardId, RunState } from "./core/types.ts";

// ------------------------------------------------------------------ keywords

export type KeywordId = "retain" | "innate" | "volatile" | "exhaust" | "armed" | "daemon" | "token" | "curse" | "unplayable";
/** The glossary (contract section 2): one sentence each, shown in tooltips, the inspect view and the Handbook. */
export const KEYWORDS: Record<KeywordId, { name: string; rule: string }> = {
  retain: { name: "Retain", rule: "Stays in your hand at the end of your turn." },
  innate: { name: "Innate", rule: "Starts in your opening hand." },
  volatile: { name: "Volatile", rule: "If it is still in your hand at the end of your turn, it exhausts." },
  exhaust: { name: "Exhaust", rule: "Leaves play for the rest of the encounter." },
  armed: { name: "Armed", rule: "Waits in a protocol slot and fires once, by itself, when its trigger happens in the enemy phase." },
  daemon: { name: "Daemon", rule: "Playing it starts a process that runs for the rest of the encounter; it never goes to your discard pile. Copies stack: each adds its effect." },
  token: { name: "Token", rule: "Made for this encounter only: it exhausts when played and never enters your deck." },
  curse: { name: "Curse", rule: "Stays in your deck until you remove it at a Sanctuary or a Market, even at the deck floor." },
  unplayable: { name: "Unplayable", rule: "It cannot be played." },
};
/** Keyword markers a card wears on its type line, from its flags, in reading order. Daemon, curse
 * and unplayable are type words, not markers. */
export function cardKeywords(card: Pick<CardDefinition, "retain" | "innate" | "volatile" | "exhaust" | "protocol" | "token">): KeywordId[] {
  const marks: KeywordId[] = [];
  if (card.token) marks.push("token");
  if (card.protocol) marks.push("armed");
  if (card.innate) marks.push("innate");
  if (card.retain) marks.push("retain");
  if (card.volatile) marks.push("volatile");
  if (card.exhaust && !card.token) marks.push("exhaust");
  return marks;
}
export const keywordTip = (id: KeywordId) => `${KEYWORDS[id].name}: ${KEYWORDS[id].rule}`;

// ------------------------------------------------------------------ keepers

export type CardHouse = Archetype | "colorless" | "curse" | "junk" | "token";
/** Which house a card belongs to: its keeper, the shared (colorless) pool, or the clutter. */
export function cardHouse(card: Pick<CardDefinition, "archetype" | "curse" | "junk" | "token">): CardHouse {
  return card.curse ? "curse" : card.junk ? "junk" : card.token ? "token" : card.archetype ?? "colorless";
}
export const HOUSE_NAMES: Record<CardHouse, string> = {
  colorless: "Colorless", architect: "Architect", warden: "Warden", ghost: "Ghost", curse: "Curse", junk: "Junk", token: "Token",
};
/** Owner colours, one per house, the way each keeper's card frames are lit: the Architect teal-cyan,
 * the Warden warm amber, the Ghost pale violet (its frame's inner edge teal); brass for the shared
 * pool, frost for curses. The frame carries the owner; the rarity keeps the footer gem. */
export const HOUSE_COLORS: Record<CardHouse, string> = {
  colorless: "#d9bd85", architect: "#5fd6d8", warden: "#f2a856", ghost: "#b9a6f4",
  curse: "#a9c3d6", junk: "#9aa1a9", token: "#8fe3e0",
};
/** The frame's inner edge (a second tone where a keeper has one: the Ghost's violet-teal). */
export const HOUSE_EDGES: Record<CardHouse, string> = { ...HOUSE_COLORS, ghost: "#86dccf" };
/** "Warden card", "Colorless card", "Curse", "Token": the owner in words, for labels and tooltips. */
export const ownerWords = (card: Pick<CardDefinition, "archetype" | "curse" | "junk" | "token">) => {
  const house = cardHouse(card);
  return house === "curse" ? "Curse" : house === "junk" ? "Junk" : house === "token" ? "Token" : `${HOUSE_NAMES[house]} card`;
};
/** Engraved sigils: the Architect's compass arch, the Warden's tower shield, the Ghost's veil, a brass
 * nut for the shared pool, a cracked seal for curses and junk, an hourglass for tokens. */
const SIGILS: Record<CardHouse, string> = {
  architect: '<path d="M5 21 12 4.5 19 21"/><path d="M8 14h8"/><circle cx="12" cy="4" r="1.6"/><path d="M3.5 21h5M15.5 21h5"/>',
  warden: '<path d="M12 2.8 19.5 6v5.4c0 4.9-3.4 8.4-7.5 10-4.1-1.6-7.5-5.1-7.5-10V6Z"/><path d="M12 6.5v11M7.8 11h8.4"/>',
  ghost: '<path d="M5.5 21.5V10.2a6.5 6.5 0 0 1 13 0v11.3l-2.2-1.8-2.1 1.8-2.2-1.8-2.2 1.8-2.1-1.8Z"/><path d="M9.6 11.2h.01M14.4 11.2h.01"/>',
  colorless: '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4Z"/><circle cx="12" cy="12" r="3"/>',
  curse: '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 4.2 2.3 4.6-3.2 2.4 3.4 4.4-1.2 4.2M15.8 7.2l-2 3.4 2.4 2"/>',
  junk: '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 4.2 2.3 4.6-3.2 2.4 3.4 4.4-1.2 4.2"/>',
  token: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
};
export function houseSigil(house: CardHouse, size = 16, stroke = 1.6): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SIGILS[house]}</svg>`;
}

/** Kind glyphs engraved on a picture still being painted (the card's kind, never its keeper). */
const KIND_GLYPHS: Record<string, string> = {
  hardware: '<rect x="3.5" y="7" width="17" height="10" rx="1.5"/><path d="M7 12h.01M10 12h.01M13 12h4.5M8 17v3M16 17v3M8 4v3M16 4v3"/>',
  cable: '<circle cx="4.5" cy="12" r="2.2"/><circle cx="19.5" cy="12" r="2.2"/><path d="M6.7 12c3.2-5.5 7.4 5.5 10.6 0"/>',
  defense: '<path d="M12 3 19 6v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z"/><path d="M12 7.5v9"/>',
  program: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>',
  daemon: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.4m0 12.2v2.4M3.5 12h2.4m12.2 0h2.4M6 6l1.7 1.7m8.6 8.6L18 18M6 18l1.7-1.7m8.6-8.6L18 6"/>',
};
/** A card picture still being painted: the owner's colour with the card's kind engraved large, so a
 * missing `.webp` reads as a deliberate plate (it sits under the art layer and only shows when the art
 * is absent). Curses and tokens show their own seal and hourglass. */
const fallbacks = new Map<string, string>();
export function artFallback(card: Pick<CardDefinition, "archetype" | "curse" | "junk" | "token" | "color" | "art" | "target">): string {
  const house = cardHouse(card);
  const tint = house === "colorless" ? card.color : HOUSE_COLORS[house];
  const mark = house === "curse" || house === "junk" || house === "token" ? SIGILS[house] : KIND_GLYPHS[card.target === "daemon" ? "daemon" : card.art] ?? KIND_GLYPHS.program;
  const key = `${house}|${tint}|${mark}`;
  const cached = fallbacks.get(key);
  if (cached) return cached;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120' preserveAspectRatio='xMidYMid slice'>`
    + `<defs><radialGradient id='g' cx='50%' cy='42%' r='70%'><stop offset='0' stop-color='${tint}' stop-opacity='.34'/><stop offset='.55' stop-color='${tint}' stop-opacity='.08'/><stop offset='1' stop-color='#05080c' stop-opacity='0'/></radialGradient>`
    + `<pattern id='p' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0v8' stroke='${tint}' stroke-opacity='.07'/></pattern></defs>`
    + `<rect width='200' height='120' fill='#0c1117'/><rect width='200' height='120' fill='url(#p)'/><rect width='200' height='120' fill='url(#g)'/>`
    + `<g transform='translate(76 36) scale(2)' fill='none' stroke='${tint}' stroke-opacity='.55' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'>${mark.replaceAll('"', "'")}</g>`
    + `<circle cx='100' cy='60' r='40' fill='none' stroke='${tint}' stroke-opacity='.18'/><circle cx='100' cy='60' r='46' fill='none' stroke='${tint}' stroke-opacity='.08' stroke-dasharray='2 5'/></svg>`;
  // Single quotes: the value lands inside a double-quoted style attribute.
  const value = `url('data:image/svg+xml,${encodeURIComponent(svg).replaceAll("'", "%27")}')`;
  fallbacks.set(key, value);
  return value;
}

// ------------------------------------------------------------------ modified costs

/** A hand card's cost this turn and why it differs from the printed cost ("" when it does not).
 * Mirrors costFor: Hot Swap, free links, Zero Trust, the hardware discount, discounted and free cards;
 * the card that granted a discount is named from this turn's plays when it can be. */
export interface CostNote { cost: number; printed: number; direction: "down" | "up" | ""; reasons: string[] }
export function costNote(run: RunState, index: number): CostNote {
  const id = run.hand[index];
  const card = CARDS[id];
  const cost = costFor(run, index);
  const printed = card?.cost ?? 0;
  if (!card) return { cost, printed, direction: "", reasons: [] };
  const fx = run.turnEffects;
  const played = new Set<string>((fx?.cardsPlayed ?? []).map(item => baseCard(item)));
  const by = (ids: string[], fallback: string) => ids.filter(item => played.has(item)).map(item => CARDS[item as CardId]?.name ?? item).join(" and ") || fallback;
  const reasons: string[] = [];
  if (card.target === "link") {
    if (run.relics.includes("hot-swap") && !run.firstFiberPlayed) reasons.push(`${RELICS["hot-swap"].name}: the first link card you play each turn costs 0`);
    else if ((fx?.freeLinks ?? 0) > 0) reasons.push(`${by(["patch-panel"], "A free link")}: your next ${fx!.freeLinks === 1 ? "link card costs" : `${fx!.freeLinks} link cards cost`} 0`);
    if (run.relics.includes("zero-trust")) reasons.push(`${RELICS["zero-trust"].name}: cable cards cost 1 more`);
  }
  if (card.target === "ground" && fx?.hardwareDiscount) reasons.push(`${by(["rack-and-stack"], "Hardware discount")}: your next hardware card costs ${fx.hardwareDiscount} less`);
  if (fx?.discounted?.includes(id)) reasons.push(`${by(["blueprint", "rapid-redeploy"], "Discounted")}: cheaper this turn`);
  if (fx?.freeCards?.includes(id)) reasons.push(`${by(["rearm"], "Free")}: costs 0 this turn`);
  const direction = cost < printed ? "down" : cost > printed ? "up" : "";
  return { cost, printed, direction, reasons: direction ? reasons : [] };
}

// ------------------------------------------------------------------ Kernel Panic

/** A held card's play limit (Kernel Panic): plays left this turn, or null without a limit. */
export function playsLeft(run: RunState): { left: number; limit: number; by: string } | null {
  if (run.phase !== "battle") return null;
  const limit = playLimit(run);
  if (!Number.isFinite(limit.limit)) return null;
  return { left: Math.max(0, limit.limit - (run.cardsPlayed ?? 0)), limit: limit.limit, by: limit.by ?? "A card in your hand" };
}

// ------------------------------------------------------------------ daemons

/** A daemon's running effect without the leading keyword words ("Daemon. Innate. …"). */
export function daemonLine(card: Pick<CardDefinition, "rules">): string {
  return card.rules.replace(/^(?:(?:Daemon|Innate|Retain)\.\s*)+/, "");
}
