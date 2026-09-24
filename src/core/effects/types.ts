/** The effect and hook interfaces (v5 · Three Energy). Card behaviour is registered per owner in
 * src/core/effects/{colorless,curses,architect,warden,ghost}.ts and merged by effects/index.ts:
 *
 * - `cards`: a card's own rule when played (validate → reason, play → note), called by every play
 *   function (ground, link, node, instant, zone, protocol, daemon) after the energy is paid and the
 *   card left the hand, before the generic `values` (block, burst, draw, energy, nextEnergy, heal,
 *   buffer) are applied.
 * - `daemons`: hooks of a running daemon card (RunState.daemons). Each hook is called once per
 *   distinct card id (base and `+` separately) with `count`, the number of running copies of that
 *   id, and returns (or applies) the total for all of them.
 * - `hand`: hooks of a card while it sits in the hand (curses): onDraw, playLimit, endOfTurn.
 *
 * Player-turn hooks run in run.ts and mutate the run through `api` (never import run.ts from an
 * effect file: it would be a module-init cycle). Resolver hooks run inside resolveTurn and must be
 * pure (no RNG, no mutation): they return numbers or labelled terms, and the engine prints them in
 * combatPreview with the card's name as the label, so the forecast equals the resolution. */
import type { CardDefinition, CardValues, ProtocolTrigger } from "../card-types.ts";
import type { CombatTerm } from "../combat/resolve.ts";
import type { Network } from "../combat/network.ts";
import type { BaseCardId, CardId, NetworkLink, NetworkNode, Port, Role, RunState, TurnEffects, Zone } from "../types.ts";

// ---------------------------------------------------------------- the engine API (implemented in run.ts)

export interface StrikeRecord {
  /** Damage that landed per port (after armor and overflow). */
  ports: Partial<Record<Port, number>>;
  /** Enemy uids the strike killed. */
  killed: string[];
  total: number;
}
export interface EngineApi {
  /** Draw up to `count` cards (hand limit 10, the discard reshuffles); fires onDraw hooks. Returns the cards drawn. */
  draw(run: RunState, count: number): CardId[];
  /** Encounter-only token cards (Payload) into the hand, respecting the hand limit; the overflow goes
   * to the discard pile. They exhaust when played and never enter the deck. Returns how many reached the hand. */
  addTokens(run: RunState, id: CardId, count: number): number;
  /** Harden once without the console (Double Shift): the console's block and repair; consoleUses untouched. */
  harden(run: RunState): { block: number; repaired: string | null };
  /** Block Harden grants now (base, firewalls, hostiles, adds, hardenBonus daemons). */
  hardenBlock(run: RunState): number;
  /** Hot Patch's rule: clear every jam and cut (when `clear`), repair the most worn device by
   * RULES.faultClearRepair. Returns the repaired device's id, or null. */
  clearFaultsAndRepair(run: RunState, clear: boolean): string | null;
  /** The network on the current board (faults applied). */
  network(run: RunState): Network;
  /** Deploy a device for the player at a legal socket (condition, deployedBy); fires deviceDeployed.
   * Returns null (and changes nothing) when the socket is illegal or the table is full. */
  deploy(run: RunState, role: Role, socket: { x: number; z: number }, extra?: Partial<NetworkNode>): NetworkNode | null;
  /** Lay a cable for the player (fires linkPlaced); null when the two cannot be linked. */
  link(run: RunState, a: string, b: string, flags?: { armored?: boolean; boosted?: boolean }): NetworkLink | null;
  /** Remove a cable (Splice); returns it, or null. Its faults leave with it. */
  unlink(run: RunState, a: string, b: string): NetworkLink | null;
  /** The `count` nearest cableable devices not yet cabled to `origin` (distance ties: ids). */
  nearest(run: RunState, origin: { x: number; z: number; id?: string }, count: number): NetworkNode[];
  /** The legal socket nearest a point (Splice: the midpoint of a cable), or null. */
  socketNear(run: RunState, point: { x: number; z: number }): { x: number; z: number } | null;
  /** The first legal auto-deploy socket (Containerlab's order; Decoy Swarm), or null. */
  freeSocket(run: RunState): { x: number; z: number } | null;
  /** Deal damage to your target now (Exfiltrate), with the normal overflow rule; each port pays its
   * armor unless `ignoreArmor`. Not a transmission: no buffer, backpressure or break bookkeeping. */
  strike(run: RunState, amount: number, options?: { ignoreArmor?: boolean }): StrikeRecord;
  /** Move a card to the exhaust pile (fires cardExhausted). */
  exhaust(run: RunState, id: CardId): void;
  /** Misses (the next N jams or cuts this enemy phase) and dodges (the first N strikes or breaches
   * deal 0), labelled by `source` in the forecast. */
  addMisses(run: RunState, count: number, source: string): void;
  addDodges(run: RunState, count: number, source: string): void;
  /** This turn's effects, created on demand. */
  effects(run: RunState): TurnEffects;
  /** Crates and cargo of hostiles killed during your turn (Exfiltrate, Scorched Earth). */
  settle(run: RunState): void;
  log(run: RunState, line: string): void;
}

// ---------------------------------------------------------------- card effects

/** What a play function knows about the play. Targets are set by the matching play function. */
export interface PlayContext {
  id: CardId;
  base: BaseCardId;
  card: CardDefinition;
  values: CardValues;
  api: EngineApi;
  /** Live channels and the primary route before the play (for "if this adds a channel"). */
  before: { channels: number; primary: readonly string[] };
  /** ground: the socket (and, in play, the deployed device). */
  x?: number;
  z?: number;
  /** ground: the device the card deployed · node: the targeted device. */
  node?: NetworkNode;
  /** link: the ends (validate) and the cable laid (play). */
  a?: string;
  b?: string;
  link?: NetworkLink;
  /** zone cards. */
  zone?: Zone;
  /** instants that choose an installation (Demolition Charge). */
  installationId?: string;
}
export interface CardEffect {
  /** Why the card cannot be played now (a short reason for the player), or null. Pure. */
  validate?(run: RunState, ctx: PlayContext): string | null;
  /** The card's rule. Returns a note for the log and the action message (" · 2 drawn"). */
  play?(run: RunState, ctx: PlayContext): string | void;
  /** Node cards: may it target this device? (the table lights these). */
  canTarget?(run: RunState, node: NetworkNode, id: CardId): boolean;
  /** Generic `values` keys this effect applies itself; the engine's generic step skips them
   * (e.g. Branch Line's conditional draw: ["draw"]). */
  manual?: readonly (keyof CardValues)[];
}

// ---------------------------------------------------------------- daemon hooks

export interface DaemonContext {
  run: RunState;
  card: CardDefinition;
  /** Running copies of this card id. */
  count: number;
}
export interface DaemonTurnContext extends DaemonContext {
  api: EngineApi;
}
export interface ResolveContext extends DaemonContext {
  /** The network as transmitted (faults applied). */
  network: Network;
}
export interface DaemonHooks {
  // ---- player turn (run.ts): mutate through api
  /** At the start of each player turn, after the draw (Keepalive, Trickle, Botnet). */
  turnStart?(ctx: DaemonTurnContext): void;
  /** After any card is played, its effect resolved (the card is `played`). */
  cardPlayed?(ctx: DaemonTurnContext & { played: CardId }): void;
  /** Whenever the player deploys a device (cards and the auto-deploys they cause; not salvage). */
  deviceDeployed?(ctx: DaemonTurnContext & { node: NetworkNode }): void;
  /** Whenever the player lays a cable (link cards, Patch Cable, auto-links). */
  linkPlaced?(ctx: DaemonTurnContext & { link: NetworkLink }): void;
  /** After a player action that raised the live channel count, with the channels gained. */
  channelsGained?(ctx: DaemonTurnContext & { gained: number }): void;
  /** Whenever a card goes to the exhaust pile (played Exhaust cards, tokens, Volatile at end of turn). */
  cardExhausted?(ctx: DaemonTurnContext & { exhausted: CardId }): void;
  /** Whenever a card is drawn. */
  onDraw?(ctx: DaemonTurnContext & { drawn: CardId }): void;
  // ---- pure (resolver and forecast): return totals for `count` copies
  /** Extra terms on the primary route (`route`: its devices, terminals excluded). Also scored when
   * the engine picks the primary route, so it must be cheap. */
  routeTerms?(ctx: DaemonContext & { route: readonly NetworkNode[] }): CombatTerm[];
  /** Extra damage on each bandwidth delivery (every channel beyond the first). */
  bandwidthBonus?(ctx: DaemonContext): number;
  /** Extra damage per switch on the primary route (scored into the route choice). */
  switchBonus?(ctx: DaemonContext): number;
  /** Extra damage per clustered band. */
  clusterBonus?(ctx: DaemonContext): number;
  /** Extra damage per Payload played this turn. */
  payloadBonus?(ctx: DaemonContext): number;
  /** Extra terms in the enemy phase's shared shield pool. */
  shieldTerms?(ctx: ResolveContext): CombatTerm[];
  /** Each online firewall blocks this much more against every strike and breach. */
  firewallBonus?(ctx: DaemonContext): number;
  /** Extra block for the Harden console (and Double Shift). */
  hardenBonus?(ctx: DaemonContext): number;
  /** Share of prevented damage the Backpressure relic stores; the highest value wins (RULES first). */
  backpressureRatio?(ctx: DaemonContext): number;
  /** Buffering multiplier; the highest value wins (RULES.bufferMultiplier first). */
  bufferMultiplier?(ctx: DaemonContext): number;
  /** Extra protocol slots. */
  protocolSlots?(ctx: DaemonContext): number;
  /** Damage to the hostile (or installation) that set off a protocol, each time one fires (trap step). */
  protocolFired?(ctx: DaemonContext & { protocol: CardId; trigger: ProtocolTrigger }): number;
  /** Block no longer expires after the enemy phase (what the attacks left of it carries over). */
  blockCarry?(ctx: DaemonContext): boolean;
  /** The first N jams or cuts each enemy phase miss. */
  missDisruptions?(ctx: DaemonContext): number;
  /** The first N strikes or breaches each enemy phase deal 0. */
  dodges?(ctx: DaemonContext): number;
}

// ---------------------------------------------------------------- hand hooks (curses)

export interface HandContext {
  run: RunState;
  card: CardDefinition;
}
/** What a card left in the hand at the end of the turn does in the enemy phase (pure). */
export interface EndOfTurnEffect {
  /** Integrity lost, unblockable, with the attacks (a forecast term labelled with the card's name). */
  integrity?: number;
  /** Wear in the table-front step (forecast wear records with the card's name as source). A rack
   * shelters it unless `direct`. */
  wear?: { nodeId: string; points: number; direct?: boolean }[];
}
export interface HandHooks {
  /** This card was drawn (Memory Leak). */
  onDraw?(ctx: HandContext & { api: EngineApi }): void;
  /** While it is in the hand, at most this many cards can be played per turn (Kernel Panic). */
  playLimit?(ctx: HandContext): number;
  /** It is still in the hand when you transmit: `count` copies (Backdoor, Bitrot). Pure. */
  endOfTurn?(ctx: HandContext & { count: number; network: Network }): EndOfTurnEffect;
}

/** One owner's registrations (effects/<owner>.ts). */
export interface OwnerEffects {
  cards?: Partial<Record<BaseCardId, CardEffect>>;
  daemons?: Partial<Record<BaseCardId, DaemonHooks>>;
  hand?: Partial<Record<BaseCardId, HandHooks>>;
}
