/** Ascension (v5, contract section 6b): four cumulative levels unlocked by winning expeditions.
 * Level N includes every rule from levels 1..N. The v4 ten rules fold into the four; each keeps its
 * RULES key. Call sites never name a level: they ask `ascends(ascension, "sharperTeeth")`, and
 * ASCENSION_RULES maps every rule to the level that brings it. */
import type { RoomType } from "./types.ts";
import { RULES } from "./cards.ts";

export const MAX_ASCENSION = 4;

/** Every ascension rule and the level that brings it (v4 level in the comment). */
export const ASCENSION_RULES = {
  /** Normal hostiles +10 % integrity: every pack member and reinforcement [v4 2]. */
  stubbornSignals: 1,
  /** Elites +15 % integrity [v4 1]. */
  hardenedElites: 1,
  /** Sanctuary repair restores 25 % less [v4 3]. */
  scarceParts: 2,
  /** Market prices +20 %, credits earned −10 % (crates and messages included) [v4 7]. */
  leanMarkets: 2,
  /** Begin the expedition with a CVE curse [v4 5]. */
  knownVulnerability: 2,
  /** Hostile strikes and breaches +1 [v4 4]. */
  sharperTeeth: 3,
  /** Hostile fields last one more turn, packs are more common, installations may arrive stronger [v4 9]. */
  lingeringCorruption: 3,
  /** Elites may carry a second designation (RULES.eliteSecondDesignation) [v4 7]. */
  eliteSecondDesignation: 3,
  /** Guardians +15 % integrity, adds scaled by RULES.ascensionAddHealth, Close the Gates / Stolen Voice wear [v4 6]. */
  ancientGuardians: 4,
  /** Guardians enrage at 60 %, ultimates +2, adds raise the break by RULES.addBreakBonusLate, a charge
   * plants a Breaker Charge, normals may carry a second designation [v4 10]. */
  lastSignal: 4,
  /** Begin with 2 less maximum integrity [v4 8]. */
  wornBackbone: 4,
} as const;
export type AscensionRule = keyof typeof ASCENSION_RULES;

export interface AscensionLevel {
  level: number;
  name: string;
  rule: string;
}

const percent = (share: number) => Math.round(share * 100);
export const ASCENSION_LEVELS: readonly AscensionLevel[] = [
  { level: 1, name: "Hardened Quarantine", rule: "Normal hostiles have 10% more integrity (every pack member and reinforcement); elites 15% more." },
  { level: 2, name: "Lean Supply", rule: "Sanctuary repair restores 25% less integrity. Market prices rise 20% and credits earned fall 10%, crates and messages included. Begin with a CVE curse in your deck." },
  {
    level: 3, name: "Sharper Teeth",
    rule: `Hostile strikes and breaches deal 1 more damage. Hostile fields last 3 turns instead of 2.${RULES.packRateAscensionBonus > 0 ? ` Packs are ${percent(RULES.packRateAscensionBonus)} points more common in every stage.` : ""}${RULES.ascensionInstallationIntegrity > 0 ? ` Installations arrive with ${RULES.ascensionInstallationIntegrity} more integrity (at most ${RULES.maxInstallationIntegrity}).` : ""}${RULES.eliteSecondDesignation >= 1 ? " Elites carry a second designation." : RULES.eliteSecondDesignation > 0 ? ` Elites carry a second designation ${percent(RULES.eliteSecondDesignation)}% of the time.` : ""}`,
  },
  {
    level: 4, name: "The Last Signal",
    rule: `Stage guardians have 15% more integrity${RULES.ascensionAddHealth > 1 ? `, their adds ${percent(RULES.ascensionAddHealth - 1)}% more` : ""}; they enrage at 60% integrity and their ultimates deal 2 more damage.${Number(RULES.addBreakBonusLate) !== Number(RULES.addBreakBonus) ? ` Each living add raises the break by ${RULES.addBreakBonusLate} instead of ${RULES.addBreakBonus}.` : ""}${RULES.ascensionRiderWear > 0 ? ` Close the Gates and Stolen Voice also wear their target by ${RULES.ascensionRiderWear}.` : ""}${RULES.ascensionChargeBreaker > 0 ? " Every guardian's charge also plants a Breaker Charge beside your primary router." : ""}${RULES.normalSecondDesignation > 0 ? " Normal hostiles may carry a second designation." : ""} Begin with 2 less maximum integrity.`,
  },
];

export function clampAscension(level: unknown): number {
  const value = Number(level);
  return Number.isInteger(value) ? Math.max(0, Math.min(MAX_ASCENSION, value)) : 0;
}

/** True when the expedition's ascension includes the named rule. */
export function ascends(ascension: number, rule: AscensionRule): boolean {
  return ascension >= ASCENSION_RULES[rule];
}

/** Hostile integrity multiplier for a room type at this ascension. */
export function healthMultiplier(type: RoomType, ascension: number): number {
  if (type === "boss") return ascends(ascension, "ancientGuardians") ? 1.15 : 1;
  if (type === "elite") return ascends(ascension, "hardenedElites") ? 1.15 : 1;
  return ascends(ascension, "stubbornSignals") ? 1.1 : 1;
}

export function priceMultiplier(ascension: number): number {
  return ascends(ascension, "leanMarkets") ? 1.2 : 1;
}

export function creditMultiplier(ascension: number): number {
  return ascends(ascension, "leanMarkets") ? 0.9 : 1;
}

export function repairMultiplier(ascension: number): number {
  return ascends(ascension, "scarceParts") ? 0.75 : 1;
}

/** Each living guardian add raises the break threshold by this much (The Last Signal: more). */
export function addBreakBonus(ascension: number): number {
  return ascends(ascension, "lastSignal") ? RULES.addBreakBonusLate : RULES.addBreakBonus;
}
