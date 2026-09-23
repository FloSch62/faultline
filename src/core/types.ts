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
  | "balancer";
export type Archetype = "architect" | "warden" | "ghost";
export type ConsoleId = "patch" | "harden" | "buffer";
export type BaseCardId =
  | "router"
  | "switch"
  | "firewall"
  | "fiber"
  | "crosslink"
  | "shield"
  | "patch"
  | "surge"
  | "firmware"
  | "containerlab"
  | "clabernetes"
  | "guard"
  | "pulse"
  | "diagnostic"
  | "reroute"
  | "barrier"
  | "capacitor"
  | "relay"
  | "hardened-router"
  | "bastion"
  | "duplex"
  | "armored-fiber"
  | "conduit"
  | "salvage"
  | "rebuild"
  | "mirror"
  | "zero-day"
  | "compression"
  | "emergency"
  | "protocol"
  | "startup-config"
  | "linux-bridge"
  | "vxlan"
  | "inspect"
  | "wireshark"
  | "resonance-field"
  | "aegis-field"
  | "purge-field"
  | "null-field"
  // v3 devices
  | "honeypot"
  | "cache-server"
  | "poe-injector"
  | "load-balancer"
  // v3 protocols (armed triggers)
  | "failover-policy"
  | "port-security"
  | "rate-limiter"
  | "ips-signature"
  | "quarantine-rule"
  | "tarpit"
  // v3 archetype cards
  | "ecmp"
  | "spine-leaf"
  | "mesh-weave"
  | "deep-inspection"
  | "stateful-firewall"
  | "reflect"
  | "store-forward"
  | "replay-attack"
  | "dark-fiber"
  // v3 junk (encounter only) and curses (permanent)
  | "packet-loss"
  | "worm"
  | "cve";
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
  | "zero-trust";
export type Zone = "north" | "center" | "south";
export type ZoneEffectKind = "resonance" | "aegis" | "stasis" | "corrosion" | "suppression";
export interface ZoneEffect {
  zone: Zone;
  kind: ZoneEffectKind;
  turns: number;
  /** Terrain fields last for the whole encounter and never tick down. */
  permanent?: boolean;
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
/** Hostile object planted on your table. Occupies a socket; scrub for 1 energy. */
export interface Malware {
  id: string;
  x: number;
  z: number;
}
/** Per-encounter battlefield layout, generated from seed + stage + room. */
export interface Terrain {
  name: string;
  description: string;
  /** Blocked sockets (wreckage). No device may be placed within 1.3 units. */
  debris: { x: number; z: number }[];
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
  enemyId?: string;
}
export interface Enemy {
  id: string;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  turn: number;
  color: number;
  /** A broken ultimate leaves the guardian vulnerable for one transmission. */
  exposed?: boolean;
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
  enemy: Enemy | null;
  faultNode: string | null;
  faultLink: string | null;
  nextNodeId: number;
  cardRewards: CardId[];
  relicRewards: RelicId[];
  firstFiberPlayed: boolean;
  shieldArrayUsed: boolean;
  log: string[];
  // ---- v3 ----
  archetype: Archetype;
  ascension: number;
  credits: number;
  terrain: Terrain | null;
  malware: Malware[];
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
}
