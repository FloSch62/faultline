/** Ascension: cumulative difficulty levels unlocked by winning expeditions.
 * Level N includes every rule from levels 1..N. Combat reads levels 4, 6, 9 and 10;
 * the expedition layer applies health, economy, repair, curse and integrity rules;
 * the chart reads levels 7, 9 and 10 (second designations, pack frequency). */
import type { RoomType } from "./types.ts";
import { RULES } from "./cards.ts";

export const MAX_ASCENSION = 10;

export interface AscensionLevel {
  level: number;
  name: string;
  rule: string;
}

export const ASCENSION_LEVELS: readonly AscensionLevel[] = [
  { level: 1, name: "Hardened Elites", rule: "Elite hostiles have 15% more integrity." },
  { level: 2, name: "Stubborn Signals", rule: "Normal hostiles have 10% more integrity: every member of a pack and every reinforcement." },
  { level: 3, name: "Scarce Parts", rule: "Sanctuary repair restores 25% less integrity." },
  { level: 4, name: "Sharper Teeth", rule: "Hostile strikes and breaches deal 1 more damage." },
  { level: 5, name: "Known Vulnerability", rule: "Begin the expedition with a CVE curse in your deck." },
  { level: 6, name: "Ancient Guardians", rule: `Stage guardians have 15% more integrity${RULES.ascensionAddHealth > 1 ? `, their adds ${Math.round((RULES.ascensionAddHealth - 1) * 100)}% more` : ""}.${RULES.ascensionRiderWear > 0 ? ` Close the Gates and Stolen Voice also wear their target by ${RULES.ascensionRiderWear}.` : ""}` },
  { level: 7, name: "Lean Markets", rule: `Market prices rise 20%. Credits earned fall 10%, crates and messages included.${RULES.eliteSecondDesignation >= 1 ? " Elites carry a second designation." : RULES.eliteSecondDesignation > 0 ? ` Elites carry a second designation ${Math.round(RULES.eliteSecondDesignation * 100)}% of the time.` : ""}` },
  { level: 8, name: "Worn Backbone", rule: "Begin with 2 less maximum integrity." },
  { level: 9, name: "Lingering Corruption", rule: `Hostile fields last 3 turns instead of 2.${RULES.packRateAscensionBonus > 0 ? ` Packs are ${Math.round(RULES.packRateAscensionBonus * 100)} points more common in every stage.` : ""}${RULES.ascensionInstallationIntegrity > 0 ? ` Installations arrive with ${RULES.ascensionInstallationIntegrity} more integrity (at most ${RULES.maxInstallationIntegrity}).` : ""}` },
  { level: 10, name: "The Last Signal", rule: `Guardians enrage at 60% integrity and their ultimates deal 2 more damage.${Number(RULES.addBreakBonusLate) !== Number(RULES.addBreakBonus) ? ` Each living add raises the break by ${RULES.addBreakBonusLate} instead of ${RULES.addBreakBonus}.` : ""}${RULES.normalSecondDesignation > 0 ? " Normal hostiles may carry a second designation." : ""}${RULES.ascensionChargeBreaker > 0 ? " Every guardian's charge also plants a Breaker Charge beside your primary router." : ""}` },
];

export function clampAscension(level: unknown): number {
  const value = Number(level);
  return Number.isInteger(value) ? Math.max(0, Math.min(MAX_ASCENSION, value)) : 0;
}

/** True when the expedition's ascension includes the given level's rule. */
export function ascends(ascension: number, level: number): boolean {
  return ascension >= level;
}

/** Hostile integrity multiplier for a room type at this ascension. */
export function healthMultiplier(type: RoomType, ascension: number): number {
  if (type === "boss") return ascends(ascension, 6) ? 1.15 : 1;
  if (type === "elite") return ascends(ascension, 1) ? 1.15 : 1;
  return ascends(ascension, 2) ? 1.1 : 1;
}

export function priceMultiplier(ascension: number): number {
  return ascends(ascension, 7) ? 1.2 : 1;
}

export function creditMultiplier(ascension: number): number {
  return ascends(ascension, 7) ? 0.9 : 1;
}

export function repairMultiplier(ascension: number): number {
  return ascends(ascension, 3) ? 0.75 : 1;
}
