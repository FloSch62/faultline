export type Role =
  | "client"
  | "router"
  | "switch"
  | "firewall"
  /** Decoy: draws jams and cable cuts while cabled; the attacker takes damage. */
  | "honeypot"
  /** Cache Server: online at the start of your turn → draw 1 extra card. */
  | "cache"
  /** PoE Injector: online at the start of your turn → +1 energy. */
  | "power"
  /** Load Balancer: online → +1 damage per live channel. */
  | "balancer"
  /** Server Rack: never cabled, carries no signal; takes wear for devices within reach. */
  | "rack"
  /** Phantom Node: never cabled, on no route; absorbs the next disruption or installation. */
  | "phantom";
export type Archetype = "architect" | "warden" | "ghost";
export type ConsoleId = "patch" | "harden" | "buffer";
// ---------------------------------------------------------------- card ids (v5 · Three Energy)
// Every card id of the v5 contract, per owner. The card data files (src/core/cards/*.ts) are typed
// against these lists, so a phase C agent only adds definitions; nobody edits the unions again.

/** Colorless: the shared pool every keeper can be offered (contract section 7). */
export const COLORLESS_CARD_IDS = [
  // fields
  "resonance-field", "aegis-field", "purge-field", "null-field",
  // hardware
  "router", "switch", "firewall", "honeypot", "cache-server", "poe-injector", "load-balancer", "relay",
  "hardened-router", "linux-bridge", "server-rack",
  // cables
  "fiber", "crosslink", "duplex", "armored-fiber", "conduit", "vxlan",
  // node upgrades
  "shield", "firmware", "compression", "startup-config", "clabernetes", "redundant-psu",
  // instants
  "patch", "surge", "containerlab", "guard", "pulse", "diagnostic", "reroute", "barrier", "capacitor", "salvage",
  "rebuild", "zero-day", "emergency", "protocol", "inspect", "wireshark", "broadcast-storm", "traffic-shaping",
  "packet-storm", "quorum", "demolition-charge", "field-repair",
  // protocols
  "failover-policy", "port-security", "rate-limiter", "ips-signature", "quarantine-rule", "tarpit",
  // v5 new colorless (phase C: colorless agent; keepalive is the engine's worked example)
  "ping", "hotfix", "keepalive", "rollback", "firmware-update",
] as const;
/** Curses (permanent, section 8) and junk (encounter clutter a hostile injects). */
export const CURSE_CARD_IDS = [
  "cve", "packet-loss", "worm",
  // v5 new curses (phase C: colorless agent)
  "zombie-process", "kernel-panic", "backdoor", "bitrot", "memory-leak",
] as const;
/** The Architect's cards (section 9.1). */
export const ARCHITECT_CARD_IDS = [
  "branch-line", "patch-panel", "redundant-paths", "standby-router", "ecmp", "flood-fill", "mirror", "mesh-weave",
  "peering-session", "spine-leaf", "fabric-controller", "trunk-line", "splice", "traceroute", "deep-buffers",
  "line-rate", "carrier-grade", "rack-and-stack", "blueprint", "rapid-redeploy", "provisioning-script", "zero-touch",
  "datacenter",
] as const;
/** The Warden's cards (section 9.2). */
export const WARDEN_CARD_IDS = [
  "deep-inspection", "brace", "pushback", "stand-firm", "vent", "double-shift", "entrench", "persistent-state",
  "flow-control", "reflect", "acl-gate", "stateful-firewall", "sentry-firewall", "bulkhead", "perimeter", "bastion",
  "defense-in-depth", "tripwire", "policy-engine", "rearm", "incident-response", "null-route", "hardening-guide",
] as const;
/** The Ghost's cards (section 9.3), the Payload token included. */
export const GHOST_CARD_IDS = [
  "store-forward", "jitter-buffer", "hold-queue", "flush", "spearhead", "trickle", "replay-attack", "deep-queue",
  "exfiltrate", "spoof", "phantom-node", "dark-fiber", "decoy-swarm", "ghost-protocol", "obfuscation", "fork-bomb",
  "shell-access", "side-channel", "payload", "exploit-kit", "botnet", "cover-tracks", "man-in-the-middle",
] as const;
export type ColorlessCardId = (typeof COLORLESS_CARD_IDS)[number];
export type CurseCardId = (typeof CURSE_CARD_IDS)[number];
export type ArchitectCardId = (typeof ARCHITECT_CARD_IDS)[number];
export type WardenCardId = (typeof WARDEN_CARD_IDS)[number];
export type GhostCardId = (typeof GHOST_CARD_IDS)[number];
export type BaseCardId = ColorlessCardId | CurseCardId | ArchitectCardId | WardenCardId | GhostCardId;
/** Who owns a card's data and effects file. */
export type CardOwner = "colorless" | "curses" | "architect" | "warden" | "ghost";
export const CARD_IDS_BY_OWNER: Record<CardOwner, readonly BaseCardId[]> = {
  colorless: COLORLESS_CARD_IDS, curses: CURSE_CARD_IDS, architect: ARCHITECT_CARD_IDS, warden: WARDEN_CARD_IDS, ghost: GHOST_CARD_IDS,
};
/** Upgraded cards carry a "+" suffix, e.g. "router+". CARDS has an entry for both. */
export type CardId = BaseCardId | `${BaseCardId}+`;
export type RelicId =
  | "cold-start"
  | "hot-swap"
  | "parallel-core"
  | "shield-array"
  | "deep-cache"
  | "grounded-core"
  | "packet-lens"
  | "repair-drone"
  | "reserve-cell"
  // v3 starter
  | "backpressure"
  // v3 common relics
  | "honeynet"
  | "fanout"
  | "spare-parts"
  | "credit-line"
  | "watchdog"
  // v3 boss relics (strong effect + drawback)
  | "spanning-tree"
  | "anycast"
  | "jumbo-frames"
  | "bgp-hijack"
  | "sdn-controller"
  | "zero-trust"
  // v4 common relics
  | "round-robin"
  | "ingress-filter"
  | "priority-queue"
  | "reinforced-frame"
  | "field-engineer"
  | "bill-of-lading"
  // v4 boss relics
  | "storm-control"
  | "scorched-earth"
  // v5 boss relics (+1 energy each, capped by RULES.relicEnergyCap)
  | "air-gap"
  | "legacy-mainframe"
  | "overvolt";
export type Zone = "north" | "center" | "south";
export type ZoneEffectKind = "resonance" | "aegis" | "stasis" | "corrosion" | "suppression";
export interface ZoneEffect {
  zone: Zone;
  kind: ZoneEffectKind;
  turns: number;
  /** Terrain fields last for the whole encounter and never tick down. */
  permanent?: boolean;
  /** A signal's field (RELAY FLICKER, INTERFERENCE): terrain-style (its own slot, stacks with a cast
   * field of the same side) but it ticks down like any temporary field. */
  signal?: boolean;
}
export type RoomType = "battle" | "elite" | "cache" | "forge" | "boss" | "shop" | "event";
export type Phase =
  | "title" | "map" | "battle" | "reward" | "relic" | "forge" | "shop" | "event" | "won" | "lost";

export interface NetworkNode {
  id: string;
  role: Role;
  x: number;
  z: number;
  fixed?: boolean;
  shielded?: boolean;
  upgraded?: boolean;
  amplified?: boolean;
  configured?: boolean;
  /** Pre-placed by encounter terrain; yours once cabled. Cosmetic flag. */
  salvage?: boolean;
  /** Stateful Firewall: blocks double. */
  stateful?: boolean;
  // ---- v4: wear ----
  /** Current condition. 2 for deployed devices, 1 for salvage; undefined on terminals (they never break). */
  condition?: number;
  /** Raised maximum (Redundant PSU 3, Reinforced Frame +1). Defaults to the deploy condition. */
  maxCondition?: number;
  /** Sentry Firewall variant: quarantine deals 2 and destroyed installations grant extra shield. */
  sentry?: boolean;
  /** Phantom Node: disruptions or installations it can still absorb before it fades. */
  absorbs?: number;
  /** Card that deployed this device, when it came from a card (breakdown bookkeeping, undo). */
  deployedBy?: CardId;
}
export interface NetworkLink {
  a: string;
  b: string;
  armored?: boolean;
  boosted?: boolean;
}
export interface Topology {
  nodes: NetworkNode[];
  links: NetworkLink[];
}
// ---------------------------------------------------------------- v4 · Under Quarantine

/** The three stands on the far rail. Hostiles act in this order. */
export type Port = "left" | "centre" | "right";
export type HostileRole = "single" | "leader" | "escort" | "add";
export type DesignationId =
  | "nesting" | "armored" | "stoked" | "shedding" | "hardened"
  | "rigged" | "hungry" | "spiteful" | "laden" | "salvaged";
export type InstallationKind = "tap" | "jammer" | "spike" | "anchor" | "breaker";
export type SignalId = "relay-flicker" | "cold-start" | "resync" | "interference" | "collapse" | "surge";
export type MessageOptionId = "restore" | "reinforce" | "credit" | "recover" | "purge";

/** Sealed cargo an escort carries. Fixed when the encounter begins, revealed on death. */
export type CrateContents =
  | { kind: "salvage"; role: Role; message?: boolean }
  | { kind: "credits"; amount: number; message?: boolean }
  | { kind: "card"; cards: [CardId, CardId]; message?: boolean }
  | { kind: "empty" };

/** Hostile permanent planted on your table. Blocks placement within 1.3 like wreckage. */
export interface Installation {
  id: string;
  kind: InstallationKind;
  x: number;
  z: number;
  /** 1–3. Scrub removes one point per energy (two while a Quarantine Drone lives). */
  integrity: number;
  /** Breaker Charge only: detonates when it reaches 0. */
  countdown?: number;
  /** Global hostile-action index (RunState.hostileActions) from which its effect resolves. */
  activeFrom: number;
  /** Enemy.uid of the planter, for trap attribution and Scorched Earth. */
  owner: string;
  /** Device the placement aimed at (reach installations), for the forecast and the table. */
  aim?: string;
}

/** One option of an undelivered message. Every option names its exact result. */
export interface MessageOption {
  id: MessageOptionId;
  /** Recover: the named rare card. */
  card?: CardId;
  /** Credit: the exact amount after multipliers. */
  amount?: number;
}
/** A choice waiting for the player; opens before the next hand is dealt (or on the victory screen). */
export type Offer =
  | { kind: "message"; sender: string; text: string; options: MessageOption[] }
  | { kind: "crate-card"; cards: CardId[] };

/** An announced arrival. `after` counts enemy phases until it takes a port. */
export interface Reinforcement {
  enemyId: string;
  after: number;
  /** Health fixed at encounter start. */
  hp: number;
  crate: CrateContents;
  /** Raised by a Shedding designation rather than rolled with the room. */
  shed?: boolean;
}
/** A one-time mid-fight change, announced a full turn before it fires. */
export interface SignalState {
  id: SignalId;
  /** Player turn at whose start it fires (turn 3). */
  firesOnTurn: number;
  resolved: boolean;
  /** The band, socket, device or hostile uid it names, fixed at announcement. */
  zone?: Zone;
  socket?: { x: number; z: number };
  nodeId?: string;
  enemyUid?: string;
  /** Named at the turn-2 announcement (the target fields above are set then). */
  announced?: boolean;
  /** The announcement as printed ("NEXT TURN: … if the fight lasts."). */
  text?: string;
  /** COLD START with no salvage device on the table: the role that lands at `socket`. */
  role?: Role;
}
/** Per-encounter battlefield layout, generated from seed + stage + room. */
export interface Terrain {
  name: string;
  description: string;
  /** Blocked sockets (wreckage). No device may be placed within 1.3 units.
   * Terrain, breakdowns, detonations and COLLAPSE share a cap of RULES.wreckCap. */
  debris: Wreck[];
}
export interface Wreck {
  x: number;
  z: number;
  /** Made during this encounter (breakdown, detonation, signal): brighter embers. */
  fresh?: boolean;
  /** Role colour of the device that broke here, for the scorch tint. */
  role?: Role;
}
export interface ShopOffer<T> {
  id: T;
  price: number;
  sold: boolean;
}
export interface ShopState {
  cards: ShopOffer<CardId>[];
  relics: ShopOffer<RelicId>[];
  removePrice: number;
  upgradePrice: number;
  /** Each service may be bought once per visit. */
  removed: boolean;
  upgraded: boolean;
}
export interface EventState {
  id: string;
  /** Set once a choice resolved; the screen then shows the outcome and a Continue button. */
  resolved: boolean;
  outcome?: string;
  /** Seeded pre-rolls, fixed when the event opens so every choice names its result. */
  cards?: CardId[];
  relic?: RelicId;
  enemyId?: string;
  /** Deck indices chosen in advance (e.g. cards a random upgrade will touch). */
  picks?: number[];
}
export interface MapRoom {
  id: string;
  floor: number;
  lane: number;
  type: RoomType;
  cleared: boolean;
  /** Omitted in older saves, which keep their original adjacent-lane routes. */
  exits?: string[];
  /** Leader or single hostile (the centre port). */
  enemyId?: string;
  // ---- v4, rolled with the chart (seed + stage), never the card RNG ----
  /** Escort ids in port order (left, then right); a duo has no enemyId leader. */
  pack?: string[];
  /** Designations on the leader or single, in roll order. */
  designations?: DesignationId[];
  /** Interference: the chart shows UNKNOWN DESIGNATION until the entrance line. */
  designationHidden?: boolean;
  /** (content) Elite rooms only: the chart decided this elite is reinforced (stage III, and stage II
   * at its rate), never two on one path. Normal rooms roll their reinforcement in planEncounter. */
  reinforced?: boolean;
}
export interface Enemy {
  /** Definition id in ENEMIES. Two escorts of one kind share it; `uid` tells them apart. */
  id: string;
  /** Unique within the encounter ("h1", "h2", …); installations and forecasts refer to it. */
  uid: string;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  /** Own actions taken; pressure and escalation read this, never the run turn. */
  turn: number;
  color: number;
  port: Port;
  role: HostileRole;
  /** Escorts act on odd (left) or even (right) enemy phases; adds and leaders act every phase. */
  cadence?: "odd" | "even";
  /** Leaders and singles only. Empty or omitted when undesignated. */
  designations?: DesignationId[];
  /** Still hidden on the chart; revealed at the entrance line (cleared by beginBattle). */
  designationHidden?: boolean;
  /** Escorts only: fixed at encounter start, revealed on death. */
  crate?: CrateContents;
  /** A broken ultimate leaves the guardian vulnerable for one transmission. */
  exposed?: boolean;
  /** Shedding: its escort was already raised. */
  shed?: boolean;
  /** Guardians: index of the next pattern step (the half-health charge may pre-empt the pattern). */
  step?: number;
  /** Guardians: the first charge already happened this fight (at its fifth action or early at half
   * health, whichever came first); half health no longer pre-empts the pattern. */
  chargedEarly?: boolean;
  /** Levels added by the SURGE signal. */
  surge?: number;
  /** RESYNC: its next action is skipped and its counter does not advance. */
  skipNext?: boolean;
  /** Glass Echo's last echo: +3 on the leader's next strike or breach. */
  echo?: number;
  /** Encounter-start relic damage and similar one-shot flags already applied. */
  entered?: boolean;
  /** Root Blight: the band its CORRODE targeted (its Anchor and SPREAD follow it). */
  band?: Zone;
  /** Guardians: the pattern step an early charge pre-empted; the pattern resumes there after the ultimate. */
  resume?: number;
  /** Guardians: this cycle's charge was spent early; the pattern skips its charge and ultimate once. */
  skipCharge?: boolean;
  /** Adds: the first enemy phase in which it acts (raised on the charge turn, it acts from the ultimate). */
  wakes?: number;
  /** Fallen: its crate, message and drops were opened. */
  looted?: boolean;
}
export interface RunState {
  seed: number;
  rng: number;
  stage: number;
  bossIntroSeen: boolean;
  phase: Phase;
  map: MapRoom[];
  currentRoom: string | null;
  lastRoom: string | null;
  floor: number;
  integrity: number;
  maxIntegrity: number;
  score: number;
  deck: CardId[];
  drawPile: CardId[];
  discardPile: CardId[];
  exhaustPile: CardId[];
  block: number;
  packetBoost: number;
  reserveEnergy: number;
  cardsPlayed: number;
  zoneEffects: ZoneEffect[];
  hand: CardId[];
  preparedCard: CardId | null;
  relics: RelicId[];
  energy: number;
  turn: number;
  topology: Topology;
  /** v4: one to three hostiles in port order (left, centre, right). Empty outside encounters. */
  enemies: Enemy[];
  /** v4: jammed devices (packs and escalation jam several). */
  faultNodes: string[];
  /** v4: cut cables as linkKey strings. */
  faultLinks: string[];
  nextNodeId: number;
  cardRewards: CardId[];
  relicRewards: RelicId[];
  /** v5: a link card was played this turn, so Hot Swap ("the first link card you play each turn
   * costs 0") is spent. The name is kept from v4, when Hot Swap applied to Optic Fiber only. */
  firstFiberPlayed: boolean;
  shieldArrayUsed: boolean;
  log: string[];
  // ---- v3 ----
  archetype: Archetype;
  ascension: number;
  credits: number;
  terrain: Terrain | null;
  /** v4: hostile permanents on the table (≤ RULES.maxInstallations). Replaces malware. */
  installations: Installation[];
  /** Armed protocol cards, oldest first. Maximum 2. */
  protocols: CardId[];
  /** Console command used this turn (SDN Controller allows 2 uses). */
  consoleUses: number;
  /** Ghost: stored packet damage, released by the next normal transmission. */
  buffer: number;
  /** Ghost: this turn's transmission will be stored instead of dealt. */
  buffering: boolean;
  /** Warden (Backpressure relic): prevented damage stored for the next transmission. */
  backpressure: number;
  shop: ShopState | null;
  event: EventState | null;
  /** Times a card was removed at a market (raises the price). */
  removals: number;
  /** Watchdog relic: its once-per-battle shield was already spent. */
  watchdogUsed?: boolean;
  /** Credits granted by the reward currently on screen (for display). */
  creditsEarned?: number;
  /** Event ids already met this expedition; events do not repeat. */
  seenEvents?: string[];
  // ---- v4 · Under Quarantine ----
  /** The target (the rules' focus): the port every delivery lands on; overflow carries the surplus. */
  focus: Port | null;
  /** Enemy phases resolved this encounter. Escort cadence reads phase parity (the next phase is enemyPhase + 1). */
  enemyPhase: number;
  /** Hostile actions resolved this encounter across every port; installations activate by it. */
  hostileActions: number;
  /** An announced arrival, or null. At most one per fight. */
  reinforcement: Reinforcement | null;
  /** The fight's one signal, or null. */
  signal: SignalState | null;
  /** Choices waiting for the player (messages, crate cards), oldest first. */
  offers: Offer[];
  /** Crate and message cards in play this encounter only: they exhaust when played and never enter the deck. */
  encounterCards: CardId[];
  /** Jams that last an extra player turn (escalation level 1): node id → player turns left after this one. */
  lingeringJams?: Record<string, number>;
  /** Cables frayed for one player turn by a level-1 cut (linkKey). */
  frayedByCut?: string[];
  /** Repairs used this turn (Field Engineer makes the first free). */
  repairsThisTurn?: number;
  /** Per-turn card effects (Broadcast Storm, Traffic Shaping, Flood Fill, Packet Storm, Demolition Charge, Spearhead, Bulkhead). */
  turnEffects?: TurnEffects;
  /** Itemised credits of the reward on screen: "14 room · 4 pack · 12 crates". */
  creditLedger?: { label: string; amount: number }[];
  /** Reclaim shield earned during this player turn (scrub, Purge, Demolition Charge); joins the
   * coming enemy phase's shield pool and is never banked. */
  reclaim?: number;
  /** Enemy.uid of every hostile that struck or breached in the last enemy phase (Warden release). */
  attackers?: string[];
  /** Entrance lines of this encounter (revealed designation, reinforcement warning). */
  entrance?: string[];
  // ---- v5 · Three Energy ----
  /** Daemon cards running this encounter, in play order (copies stack: each copy adds its effect).
   * A played daemon never goes to discard; the list is cleared at encounter start and end. */
  daemons: CardId[];
  /** Gains waiting for the next player turn (Brace, …); cleared when that turn begins. Next-turn
   * energy keeps using `reserveEnergy`. */
  nextTurn?: NextTurnGains;
}
export interface NextTurnGains {
  block?: number;
  draw?: number;
}

/** One-turn modifiers from cards; reset when the turn ends. */
export interface TurnEffects {
  /** Added to every living port's packet (Broadcast Storm, Packet Storm, Flood Fill). */
  everyPort?: number;
  /** Added to the target's packet (Traffic Shaping, Demolition Charge). */
  focusBonus?: number;
  /** Spearhead: the buffer release ignores armor and plating. */
  spearhead?: boolean;
  /** Bulkhead: every online firewall blocks this much more against each attack this enemy phase. */
  firewallBonus?: number;
  /** Rapid Redeploy, Blueprint: hand cards (by id) that cost 1 less this turn. */
  discounted?: CardId[];
  /** Hand cards (by id) that cost 0 this turn (Rearm). */
  freeCards?: CardId[];
  // ---- v5 · Three Energy
  /** Cards played this turn, in order (Rollback, Side Channel); RunState.cardsPlayed is their count. */
  cardsPlayed?: CardId[];
  /** The next N link cards played this turn cost 0 (Patch Panel). */
  freeLinks?: number;
  /** The next hardware (ground) card played this turn costs this much less (Rack and Stack). */
  hardwareDiscount?: number;
  /** The next N jams or cuts this enemy phase miss (Spoof): absorbed in the answer order after
   * protocols, before Phantom Nodes, like a phantom without a device. */
  misses?: number;
  /** The first N strikes or breaches this enemy phase deal 0 (Ghost Protocol), in port order. */
  dodges?: number;
  /** Every card played this turn adds this much to the buffer (Man-in-the-Middle). */
  mitm?: number;
  /** Names of the cards that granted misses and dodges, in grant order (forecast labels). */
  missSources?: string[];
  dodgeSources?: string[];
  /** Payload tokens played this turn and the damage they printed (the resolver adds the
   * payloadBonus daemon hook per Payload, as labelled terms). */
  payloads?: number;
  payloadDamage?: number;
}

// ---------------------------------------------------------------- intents (v4)

export type IntentKind =
  | "strike" | "sever" | "jam" | "breach" | "corrupt" | "charge"
  /** Removes 1 condition from its target (jam targeting; racks shelter, jam protection does not). */
  | "overload"
  /** Plants an installation (`install` names the kind). Replaces v3 "infect". */
  | "install"
  /** An escort on its off phase: does nothing. */
  | "dormant";
export type EscalationLevel = 0 | 1 | 2 | 3;

/** One hostile action, fully resolved by combatPreview (targets included). */
export interface Intent {
  kind: IntentKind;
  ultimate?: boolean;
  field?: "corrosion" | "suppression";
  /** Junk cards shuffled into your draw pile when the action resolves. */
  junk?: { card: CardId; count: number };
  /** Installation planted by this action: the intent kind "install", or a rider on another kind. */
  install?: InstallationKind;
  label: string;
  amount: number;
  pressure: number;
  /** v3 single target (a jammed node id or a cut linkKey); kept for the first target. */
  target?: string;
  // ---- v4 ----
  /** Enemy.uid of the actor. */
  owner?: string;
  port?: Port;
  /** Leader escalation level applied to this action. */
  escalation?: EscalationLevel;
  /** Every jammed node (level 2 jams two). */
  targets?: string[];
  /** Every cut cable (twin cut, level 2). */
  cutTargets?: string[];
  /** Level 1: the cable frayed for one player turn alongside the cut. */
  fray?: string;
  /** Overload target node id. */
  overloadTarget?: string;
  /** Installations planted by riders on top of `install`: Nesting, escalation level 3, a guardian's
   * charge at ascension 10. */
  alsoInstalls?: { kind: InstallationKind; source: "nesting" | "escalation" | "charge" }[];
  /** A guardian's charge pre-empting its pattern after it fell to half health (section 6.2). */
  early?: boolean;
  /** RESYNC: this action is skipped (the intent kind is "dormant"). */
  skipped?: boolean;
  /** Escalation: level 1 makes its jams last an extra player turn. */
  lingers?: boolean;
  /** Escalation level 2: disruptions hit this many targets (jams, cuts). */
  targetCount?: number;
  /** Extra turns on its hostile field (escalation level 2). */
  fieldBonus?: number;
}
