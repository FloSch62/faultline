/** The merged effect registry (v5 · Three Energy) and the dispatch helpers the engine calls.
 * Owners register in their own file; nobody edits this one to add a card. See effects/types.ts
 * for the interfaces and .work/engine-report.md for the call sites. */
import { CARDS, baseCard } from "../cards.ts";
import type { CardDefinition, ProtocolTrigger } from "../card-types.ts";
import type { Network } from "../combat/network.ts";
import type { CombatTerm } from "../combat/resolve.ts";
import type { BaseCardId, CardId, RunState } from "../types.ts";
import { COLORLESS_EFFECTS } from "./colorless.ts";
import { CURSE_EFFECTS } from "./curses.ts";
import { ARCHITECT_EFFECTS } from "./architect.ts";
import { WARDEN_EFFECTS } from "./warden.ts";
import { GHOST_EFFECTS } from "./ghost.ts";
import type { CardEffect, DaemonContext, DaemonHooks, DaemonTurnContext, EngineApi, HandHooks, OwnerEffects } from "./types.ts";

export type {
  CardEffect, DaemonContext, DaemonHooks, DaemonTurnContext, EndOfTurnEffect, EngineApi, HandContext, HandHooks, OwnerEffects,
  PlayContext, ResolveContext, StrikeRecord,
} from "./types.ts";

const OWNERS: readonly OwnerEffects[] = [COLORLESS_EFFECTS, CURSE_EFFECTS, ARCHITECT_EFFECTS, WARDEN_EFFECTS, GHOST_EFFECTS];
function merge<K extends keyof OwnerEffects>(key: K): NonNullable<OwnerEffects[K]> {
  const merged: Record<string, unknown> = {};
  for (const owner of OWNERS)
    for (const [id, entry] of Object.entries(owner[key] ?? {})) {
      if (Object.hasOwn(merged, id)) throw new Error(`Effect ${key}.${id} is registered twice`);
      merged[id] = entry;
    }
  return merged as NonNullable<OwnerEffects[K]>;
}
export const CARD_EFFECTS: Partial<Record<BaseCardId, CardEffect>> = merge("cards");
export const DAEMON_HOOKS: Partial<Record<BaseCardId, DaemonHooks>> = merge("daemons");
export const HAND_HOOKS: Partial<Record<BaseCardId, HandHooks>> = merge("hand");

export const effectOf = (id: CardId): CardEffect | undefined => CARD_EFFECTS[baseCard(id)];

// ---------------------------------------------------------------- running daemons

export interface RunningDaemon {
  id: CardId;
  card: CardDefinition;
  /** Copies of this exact id running (a base and its `+` are separate entries). */
  count: number;
  hooks: DaemonHooks;
}
/** Running daemons grouped by card id, in first-play order (the daemon strip reads this). */
export function runningDaemons(run: Pick<RunState, "daemons">): RunningDaemon[] {
  const list = run.daemons;
  if (!list?.length) return [];
  const running: RunningDaemon[] = [];
  for (const id of list) {
    const found = running.find(entry => entry.id === id);
    if (found) { found.count++; continue; }
    const card = CARDS[id];
    if (card) running.push({ id, card, count: 1, hooks: DAEMON_HOOKS[baseCard(id)] ?? {} });
  }
  return running;
}
/** "Keepalive", "Keepalive ×2": a daemon's forecast label. */
export const daemonLabel = (daemon: Pick<RunningDaemon, "card" | "count">) => `${daemon.card.name}${daemon.count > 1 ? ` ×${daemon.count}` : ""}`;

type NumericHook = Exclude<{ [K in keyof DaemonHooks]-?: NonNullable<DaemonHooks[K]> extends (ctx: DaemonContext) => number ? K : never }[keyof DaemonHooks], undefined>;
/** A numeric resolver hook of every running daemon, as labelled amounts (zeros dropped). */
export function daemonAmounts(run: RunState, hook: NumericHook): CombatTerm[] {
  const terms: CombatTerm[] = [];
  for (const daemon of runningDaemons(run)) {
    const fn = daemon.hooks[hook] as ((ctx: DaemonContext) => number) | undefined;
    const amount = fn ? fn({ run, card: daemon.card, count: daemon.count }) : 0;
    if (amount) terms.push({ label: daemonLabel(daemon), amount });
  }
  return terms;
}
export const daemonTotal = (run: RunState, hook: NumericHook) => daemonAmounts(run, hook).reduce((sum, term) => sum + term.amount, 0);
/** The highest value a replacing hook offers over the rule's own (Flow Control, Deep Queue), and
 * the daemon that set it (null when the rule stands). */
export function daemonMax(run: RunState, hook: "backpressureRatio" | "bufferMultiplier" | "blockCarry", base: number): { value: number; label: string | null } {
  let best = { value: base, label: null as string | null };
  for (const term of daemonAmounts(run, hook)) if (term.amount > best.value) best = { value: term.amount, label: term.label };
  return best;
}
/** The first daemon whose flag hook is on (Persistent State), or null. */
export function daemonFlag(run: RunState, hook: "blockCarry"): string | null {
  for (const daemon of runningDaemons(run))
    if (daemon.hooks[hook]?.({ run, card: daemon.card, count: daemon.count })) return daemonLabel(daemon);
  return null;
}
/** Extra terms on the primary route from running daemons (scored into the route choice too). */
export function daemonRouteTerms(run: RunState, route: Parameters<NonNullable<DaemonHooks["routeTerms"]>>[0]["route"]): CombatTerm[] {
  const terms: CombatTerm[] = [];
  for (const daemon of runningDaemons(run))
    if (daemon.hooks.routeTerms) terms.push(...daemon.hooks.routeTerms({ run, card: daemon.card, count: daemon.count, route }));
  return terms;
}
export const hasRouteTerms = (run: RunState) => runningDaemons(run).some(daemon => !!daemon.hooks.routeTerms);
/** Extra terms for the enemy phase's shared shield pool. */
export function daemonShieldTerms(run: RunState, network: Network): CombatTerm[] {
  const terms: CombatTerm[] = [];
  for (const daemon of runningDaemons(run))
    if (daemon.hooks.shieldTerms) terms.push(...daemon.hooks.shieldTerms({ run, card: daemon.card, count: daemon.count, network }));
  return terms;
}
/** What protocolFired daemons (Incident Response) deal to the one that set a protocol off. */
export function protocolRetaliation(run: RunState, protocol: CardId, trigger: ProtocolTrigger): CombatTerm[] {
  const terms: CombatTerm[] = [];
  for (const daemon of runningDaemons(run)) {
    const amount = daemon.hooks.protocolFired?.({ run, card: daemon.card, count: daemon.count, protocol, trigger }) ?? 0;
    if (amount) terms.push({ label: daemonLabel(daemon), amount });
  }
  return terms;
}

type TurnHook = "turnStart" | "cardPlayed" | "deviceDeployed" | "linkPlaced" | "channelsGained" | "cardExhausted" | "onDraw";
type TurnExtra<K extends TurnHook> = Omit<Parameters<NonNullable<DaemonHooks[K]>>[0], keyof DaemonTurnContext>;
/** Fires a player-turn hook on every running daemon (a snapshot: daemons started by a hook wait).
 * `daemons` overrides the list (a daemon never hears its own play). */
export function fireDaemons<K extends TurnHook>(run: RunState, hook: K, api: EngineApi, extra: TurnExtra<K>, daemons: readonly CardId[] = run.daemons) {
  for (const daemon of runningDaemons({ daemons: [...daemons] })) {
    const fn = daemon.hooks[hook] as ((ctx: DaemonTurnContext) => void) | undefined;
    fn?.({ run, card: daemon.card, count: daemon.count, api, ...extra });
  }
}
export const daemonsWith = (run: RunState, hook: keyof DaemonHooks) => runningDaemons(run).some(daemon => !!daemon.hooks[hook]);

// ---------------------------------------------------------------- hand hooks (curses)

/** Hand cards with hand hooks, grouped by id (first occurrence order). */
export function handHooks(run: Pick<RunState, "hand">): { id: CardId; card: CardDefinition; count: number; hooks: HandHooks }[] {
  const found: { id: CardId; card: CardDefinition; count: number; hooks: HandHooks }[] = [];
  for (const id of run.hand) {
    const hooks = HAND_HOOKS[baseCard(id)];
    if (!hooks || !CARDS[id]) continue;
    const entry = found.find(item => item.id === id);
    if (entry) entry.count++;
    else found.push({ id, card: CARDS[id], count: 1, hooks });
  }
  return found;
}
/** Kernel Panic: the fewest card plays any hand card allows this turn, and its name (Infinity: no limit). */
export function playLimit(run: RunState): { limit: number; by: string | null } {
  let best = { limit: Infinity, by: null as string | null };
  for (const entry of handHooks(run)) {
    const limit = entry.hooks.playLimit?.({ run, card: entry.card });
    if (limit !== undefined && limit < best.limit) best = { limit, by: entry.card.name };
  }
  return best;
}
