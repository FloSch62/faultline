/** Ascension: cumulative difficulty levels unlocked by winning expeditions.
 * Level N includes every rule from levels 1..N. Combat reads levels 4, 9 and 10;
 * the expedition layer applies health, economy, repair, curse and integrity rules. */
import type { RoomType } from "./types.ts";

export const MAX_ASCENSION = 10;

export interface AscensionLevel {
  level: number;
  name: string;
  rule: string;
}

export const ASCENSION_LEVELS: readonly AscensionLevel[] = [
  { level: 1, name: "Hardened Elites", rule: "Elite hostiles have 15% more integrity." },
  { level: 2, name: "Stubborn Signals", rule: "Normal hostiles have 10% more integrity." },
  { level: 3, name: "Scarce Parts", rule: "Sanctuary repair restores 25% less integrity." },
  { level: 4, name: "Sharper Teeth", rule: "Hostile strikes and breaches deal 1 more damage." },
  { level: 5, name: "Known Vulnerability", rule: "Begin the expedition with a CVE curse in your deck." },
  { level: 6, name: "Ancient Guardians", rule: "Stage guardians have 15% more integrity." },
  { level: 7, name: "Lean Markets", rule: "Market prices rise 20%. Credits earned fall 10%." },
  { level: 8, name: "Worn Backbone", rule: "Begin with 2 less maximum integrity." },
  { level: 9, name: "Lingering Corruption", rule: "Hostile fields last 3 turns instead of 2." },
  { level: 10, name: "The Last Signal", rule: "Guardians enrage at 60% integrity and their ultimates deal 2 more damage." },
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
