export type Role = "client" | "router" | "switch" | "firewall";
export type CardId =
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
  | "clabernetes";
export type RelicId =
  | "cold-start"
  | "hot-swap"
  | "parallel-core"
  | "shield-array"
  | "deep-cache";
export type RoomType = "battle" | "elite" | "cache" | "forge" | "boss";
export type Phase =
  | "title"
  | "map"
  | "battle"
  | "reward"
  | "relic"
  | "forge"
  | "won"
  | "lost";

export interface NetworkNode {
  id: string;
  role: Role;
  x: number;
  z: number;
  fixed?: boolean;
  shielded?: boolean;
  upgraded?: boolean;
}
export interface NetworkLink {
  a: string;
  b: string;
}
export interface Topology {
  nodes: NetworkNode[];
  links: NetworkLink[];
}
export interface MapRoom {
  id: string;
  floor: number;
  lane: number;
  type: RoomType;
  cleared: boolean;
}
export interface Enemy {
  id: string;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  turn: number;
  color: number;
}
export interface RunState {
  seed: number;
  rng: number;
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
  hand: CardId[];
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
}
