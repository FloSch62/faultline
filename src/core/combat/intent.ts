/** Per-hostile intents (rules 2–5; sections 6.1, 6.2, 7). One pipeline for every hostile:
 *   1. cadence  — an escort acts on alternate enemy phases, an add from the ultimate turn;
 *                 otherwise DORMANT. RESYNC skips a leader's action (its counter does not move).
 *   2. step     — the pattern step of its own action counter; guardians run a step machine
 *                 (charge on the fifth action or the first action after half health, then the
 *                 ultimate, then the pattern resumes; one charge per cycle).
 *   3. amount   — stage threat, pressure and enrage for leaders, singles and guardians only;
 *                 ascension 4 for every hostile; Hardened −1 on strikes; level 3 +1.
 *   4. riders   — escalation (lingering jams, frays, double faults, longer fields, level-3
 *                 installs), Nesting, the Core's enraged Tap, ascension 10's charge Breaker.
 * Pure: reads the run, never the RNG, never mutates. */
import { RULES } from "../cards.ts";
import type { Enemy, EscalationLevel, InstallationKind, Intent, RunState } from "../types.ts";
import { definitionOf } from "./board.ts";
import { ascends } from "../ascension.ts";

/** Hostiles that grow: leaders, singles and guardians. Escorts and adds never escalate and get
 * no stage bonus, pressure or enrage (rule 4). */
export const scales = (enemy: Pick<Enemy, "role">) => enemy.role === "leader" || enemy.role === "single";
const has = (enemy: Pick<Enemy, "designations">, id: string) => !!enemy.designations?.includes(id as never);

/** Whether a hostile acts in a given enemy phase: escorts on their parity (rule 5), a raised add
 * from its ultimate turn on. Everyone else acts every phase. */
export function actsInPhase(enemy: Pick<Enemy, "role" | "cadence" | "wakes">, phase: number): boolean {
  if (enemy.wakes !== undefined && phase < enemy.wakes) return false;
  if (enemy.role !== "escort" || !enemy.cadence) return true;
  return (phase % 2 === 1) === (enemy.cadence === "odd");
}

/** The escalation layer (phase 3 of the plan) is on unless RULES.escalationStart is 99 or more;
 * the same flag turns off the guardians' charge at half health. */
export const escalationOn = () => RULES.escalationStart < 99;

/** First action of each level on this hostile's own counter (section 6.1): stages I–II every
 * three actions from the fourth, stage III every two from the third; Stoked one sooner (III: two). */
function levelActions(run: RunState, enemy: Pick<Enemy, "designations">): number[] {
  const late = run.stage >= 2;
  const start = late ? RULES.escalationStartLate : RULES.escalationStart;
  const every = late ? RULES.escalationEveryLate : RULES.escalationEvery;
  const stoked = has(enemy, "stoked") ? (late ? RULES.stokedAdvanceLate : RULES.stokedAdvance) : 0;
  return [1, 2, 3].map(level => start - stoked + (level - 1) * every);
}
/** Escalation level of a hostile's `action`-th action (1-based). SURGE adds a level at once. */
export function escalationLevel(run: RunState, enemy: Enemy, action: number): EscalationLevel {
  if (!scales(enemy) || !escalationOn()) return 0;
  const reached = levelActions(run, enemy).filter(first => action >= first).length;
  return Math.min(3, reached + (enemy.surge ?? 0)) as EscalationLevel;
}
/** What each level adds (cumulative), as the intent panel names it. */
export function levelRule(run: RunState, level: EscalationLevel): string {
  return level === 1 ? "a cut also frays the next cable on your primary route; a jam lasts two turns"
    : level === 2 ? "jams hit two devices, cuts hit two cables, hostile fields last a turn longer"
      : level === 3 ? `strikes and breaches +1; each pattern cycle opens by planting a ${run.stage >= 2 ? "Jammer" : "Siphon Tap"}`
        : "as today";
}
/** The next level if it arrives within two actions of the coming one (the gauge names it). */
export function nextLevel(run: RunState, enemy: Enemy, action: number): { level: EscalationLevel; inActions: number; rule: string } | null {
  const now = escalationLevel(run, enemy, action);
  if (now >= 3) return null;
  for (let ahead = 1; ahead <= 2; ahead++) {
    const level = escalationLevel(run, enemy, action + ahead);
    if (level > now) return { level, inActions: ahead, rule: levelRule(run, level) };
  }
  return null;
}

// ------------------------------------------------------------------ guardians: the step machine

interface Steps { step: number; resume?: number; skipCharge?: boolean; chargedEarly?: boolean }
const patternMarks = (enemy: Enemy) => {
  const pattern = definitionOf(enemy).pattern;
  return { length: pattern.length, charge: pattern.findIndex(step => step.kind === "charge"), ultimate: pattern.findIndex(step => step.ultimate) };
};
export function enrageThreshold(run: RunState, enemy: Enemy) {
  return definitionOf(enemy).boss && ascends(run.ascension, "lastSignal") ? RULES.ascensionEnrageThreshold : 0.5;
}
/** Wounded: at or below the enrage threshold (half health; 60 % at ascension 10). */
export const wounded = (run: RunState, enemy: Enemy) => enemy.hp <= enemy.maxHp * enrageThreshold(run, enemy);
function stepState(enemy: Enemy): Steps {
  const { length } = patternMarks(enemy);
  return { step: enemy.step ?? enemy.turn % length, resume: enemy.resume, skipCharge: enemy.skipCharge, chargedEarly: enemy.chargedEarly };
}
interface Decision { index: number; early: boolean; skipped: boolean; preEmpted: number }
/** Which pattern step the coming action uses, and whether it is an early charge. */
function decide(run: RunState, enemy: Enemy, state: Steps, resolvedEarly?: boolean): Decision {
  const { length, charge, ultimate } = patternMarks(enemy);
  let index = state.step, skipped = false;
  if (charge < 0 || ultimate < 0) return { index, early: false, skipped, preEmpted: index };
  // One charge per cycle: an early charge spent this cycle's charge and ultimate.
  if (index === charge && state.skipCharge) {
    index = (ultimate + 1) % length;
    skipped = true;
  }
  const early = resolvedEarly ?? (escalationOn() && !state.chargedEarly && wounded(run, enemy) && index !== charge && index !== ultimate);
  return { index: early ? charge : index, early, skipped, preEmpted: index };
}
function advance(enemy: Enemy, state: Steps, decided: Decision): Steps {
  const { length, charge, ultimate } = patternMarks(enemy);
  const next: Steps = { ...state };
  if (decided.skipped) next.skipCharge = undefined;
  // The half-health trigger only pre-empts the first charge ("whichever comes first"): any
  // charge that resolves spends it.
  if (decided.index === charge) next.chargedEarly = true;
  if (decided.early) {
    // The ultimate follows; then the pattern resumes where the charge pre-empted it.
    next.chargedEarly = true;
    next.resume = decided.preEmpted;
    next.step = ultimate;
  } else if (decided.index === ultimate) {
    next.step = state.resume ?? (ultimate + 1) % length;
    if (state.resume !== undefined) {
      next.skipCharge = true;
      next.resume = undefined;
    }
  } else next.step = (decided.index + 1) % length;
  return next;
}
/** The pattern step (and early flag) of the hostile's `own`-th action from now. */
function stepAt(run: RunState, enemy: Enemy, own: number): { index: number; early: boolean } {
  const definition = definitionOf(enemy);
  if (!definition.boss) return { index: (enemy.turn + own) % definition.pattern.length, early: false };
  let state = stepState(enemy);
  for (let k = 0; ; k++) {
    const decided = decide(run, enemy, state);
    if (k === own) return decided;
    state = advance(enemy, state, decided);
  }
}
/** After a guardian acts: its step machine moves on (called by the resolver with whether the
 * action that resolved was an early charge; health may have changed since it was announced). */
export function advanceSteps(run: RunState, enemy: Enemy, early: boolean) {
  if (!definitionOf(enemy).boss) return;
  const state = stepState(enemy);
  const next = advance(enemy, state, decide(run, enemy, state, early));
  enemy.step = next.step;
  if (next.resume === undefined) delete enemy.resume; else enemy.resume = next.resume;
  if (next.skipCharge) enemy.skipCharge = true; else delete enemy.skipCharge;
  if (next.chargedEarly) enemy.chargedEarly = true;
}

// ------------------------------------------------------------------ the intent

/** The intent of the hostile's action `phasesAhead` enemy phases from now (0 = the coming
 * phase). A hostile off its phase shows DORMANT; its pattern only advances on the phases it acts. */
export function intentFor(run: RunState, enemy: Enemy, phasesAhead = 0): Intent {
  const definition = definitionOf(enemy);
  const phase = run.enemyPhase + 1 + phasesAhead;
  const base0 = { pressure: 0, owner: enemy.uid, port: enemy.port, escalation: 0 as EscalationLevel };
  if (!actsInPhase(enemy, phase)) {
    const rising = enemy.wakes !== undefined && phase < enemy.wakes;
    return { kind: "dormant", label: rising ? "RISING · ACTS ON THE ULTIMATE TURN" : "DORMANT", amount: 0, ...base0 };
  }
  let own = 0;
  for (let p = run.enemyPhase + 1; p < phase; p++) if (actsInPhase(enemy, p)) own++;
  // RESYNC: the next action is skipped and the counter does not advance.
  if (enemy.skipNext) {
    if (own === 0) return { kind: "dormant", label: "RESYNC · SKIPS ITS ACTION", amount: 0, skipped: true, ...base0 };
    own--;
  }
  const turn = enemy.turn + own;
  const pattern = definition.pattern;
  const { index, early } = enemy.role === "add" ? { index: Math.min(turn, pattern.length - 1), early: false } : stepAt(run, enemy, own);
  const base = pattern[index];
  const grows = scales(enemy);
  const pressure = grows ? Math.floor(turn / 3) : 0;
  const stageThreat = grows ? run.stage : 0;
  const enraged = grows && !!definition.enrages && wounded(run, enemy);
  const level = escalationLevel(run, enemy, turn + 1);
  const attack = base.kind === "strike" || base.kind === "breach";
  const sharper = attack && ascends(run.ascension, "sharperTeeth") && run.stage >= RULES.ascensionAttackFromStage
    && (!RULES.ascensionAttackRoles || enemy.role === "leader" || enemy.role === "single");
  const ascension = sharper ? RULES.ascensionAttackBonus : 0;
  const ultimate = base.ultimate && ascends(run.ascension, "lastSignal") ? RULES.ascensionUltimateBonus : 0;
  const escalated = attack && level >= 3 ? 1 : 0;
  const hardened = base.kind === "strike" && has(enemy, "hardened") ? RULES.hardenedStrike : 0;
  const raw = base.amount + (attack
    ? pressure + stageThreat + (enraged ? definition.enrages!.attacks : 0) + ascension + ultimate + escalated
    : enraged && base.kind !== "charge" ? definition.enrages!.faults : 0);
  const amount = Math.max(0, raw - hardened);
  const install = base.install ?? (definition.enragedInstall && enraged && base.kind === "jam" ? definition.enragedInstall : undefined);
  // Riders: Nesting (the fight's first action), level 3 (the first action of every pattern cycle),
  // and a guardian's charge at ascension 10 (a Breaker beside the primary router).
  const alsoInstalls: NonNullable<Intent["alsoInstalls"]> = [];
  const planted: InstallationKind = run.stage >= 2 ? "jammer" : "tap";
  if (has(enemy, "nesting") && turn === 0) alsoInstalls.push({ kind: planted, source: "nesting" });
  if (level >= 3 && index === 0) alsoInstalls.push({ kind: planted, source: "escalation" });
  if (definition.boss && base.kind === "charge" && ascends(run.ascension, "lastSignal") && RULES.ascensionChargeBreaker > 0) alsoInstalls.push({ kind: "breaker", source: "charge" });
  const doubled = level >= 2 && (base.kind === "jam" || base.kind === "sever");
  const suffix = [
    doubled ? " ×2" : "",
    level >= 1 && base.kind === "jam" ? " · LASTS 2 TURNS" : "",
    level >= 1 && base.kind === "sever" ? " · FRAYS" : "",
    level >= 2 && (base.kind === "corrupt" || base.field) ? " · FIELD +1 TURN" : "",
    stageThreat && attack ? ` +${stageThreat} STAGE THREAT` : "",
    pressure && attack ? ` +${pressure} PRESSURE` : "",
    ascension ? " +1 ASCENSION" : "",
    escalated ? " +1 ESCALATION" : "",
    hardened && raw > 0 ? ` −${Math.min(raw, hardened)} HARDENED` : "",
  ].join("");
  return {
    ...base,
    ...(install ? { install } : {}),
    ...(alsoInstalls.length ? { alsoInstalls } : {}),
    ...(early ? { early: true } : {}),
    ...(level >= 1 && base.kind === "jam" ? { lingers: true } : {}),
    ...(doubled ? { targetCount: 2 } : {}),
    ...(level >= 2 && (base.kind === "corrupt" || base.field) ? { fieldBonus: 1 } : {}),
    amount,
    pressure,
    owner: enemy.uid,
    port: enemy.port,
    escalation: level,
    label: `${enraged ? "ENRAGED · " : ""}${early ? "WOUNDED · " : ""}${base.label}${suffix}`,
  };
}
