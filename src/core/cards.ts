import type { CardId, RelicId, Role } from "./types.ts";

export interface CardDefinition {
  id: CardId;
  name: string;
  subtitle: string;
  rules: string;
  cost: number;
  rarity: "basic" | "uncommon" | "rare";
  target: "ground" | "link" | "node" | "instant";
  role?: Role;
  art: "hardware" | "cable" | "defense" | "program";
  color: string;
}

export const CARDS: Record<CardId, CardDefinition> = {
  router: {
    id: "router",
    name: "Core Router",
    subtitle: "HARDWARE / ROUTING",
    rules: "Place a router. A valid signal path needs at least one.",
    cost: 2,
    rarity: "basic",
    target: "ground",
    role: "router",
    art: "hardware",
    color: "#58f0d5",
  },
  switch: {
    id: "switch",
    name: "Edge Switch",
    subtitle: "HARDWARE / FABRIC",
    rules: "Place a switch to branch or reroute connections.",
    cost: 1,
    rarity: "basic",
    target: "ground",
    role: "switch",
    art: "hardware",
    color: "#9facff",
  },
  firewall: {
    id: "firewall",
    name: "Trust Gate",
    subtitle: "HARDWARE / SECURITY",
    rules: "Place a firewall. It absorbs breach damage on a live path.",
    cost: 2,
    rarity: "uncommon",
    target: "ground",
    role: "firewall",
    art: "defense",
    color: "#ffba7b",
  },
  fiber: {
    id: "fiber",
    name: "Optic Fiber",
    subtitle: "INFRASTRUCTURE / LINK",
    rules: "Connect two devices with a live cable.",
    cost: 1,
    rarity: "basic",
    target: "link",
    art: "cable",
    color: "#59cfff",
  },
  crosslink: {
    id: "crosslink",
    name: "Crosslink",
    subtitle: "INFRASTRUCTURE / LINK",
    rules: "Connect two devices for free. Draw one card.",
    cost: 0,
    rarity: "uncommon",
    target: "link",
    art: "cable",
    color: "#e5a1ff",
  },
  shield: {
    id: "shield",
    name: "Faraday Shell",
    subtitle: "SYSTEM / DEFENSE",
    rules: "Shield one device from jam attacks this battle.",
    cost: 1,
    rarity: "uncommon",
    target: "node",
    art: "defense",
    color: "#f4ce82",
  },
  patch: {
    id: "patch",
    name: "Hot Patch",
    subtitle: "SYSTEM / REPAIR",
    rules: "Clear the active jam or severed link. Draw one card.",
    cost: 1,
    rarity: "basic",
    target: "instant",
    art: "program",
    color: "#7ceebc",
  },
  surge: {
    id: "surge",
    name: "Power Surge",
    subtitle: "SYSTEM / ENERGY",
    rules: "Gain two energy. Draw two cards.",
    cost: 0,
    rarity: "uncommon",
    target: "instant",
    art: "program",
    color: "#ffd278",
  },
  firmware: {
    id: "firmware",
    name: "Overclock",
    subtitle: "SYSTEM / UPGRADE",
    rules: "Upgrade a router. A path through it deals +2 packet damage.",
    cost: 1,
    rarity: "rare",
    target: "node",
    art: "program",
    color: "#ff8ca8",
  },
  containerlab: {
    id: "containerlab",
    name: "Containerlab",
    subtitle: "RELIC / ORCHESTRATION",
    rules: "Deploy an overclocked router, already linked to both terminals.",
    cost: 3,
    rarity: "rare",
    target: "instant",
    art: "hardware",
    color: "#e7c37d",
  },
  clabernetes: {
    id: "clabernetes",
    name: "Clabernetes",
    subtitle: "RELIC / REPLICATION",
    rules: "Clone a router and its links. Shield both routers from jams.",
    cost: 2,
    rarity: "rare",
    target: "node",
    art: "hardware",
    color: "#9ccbd2",
  },
};

export const STARTER_DECK: CardId[] = [
  "router",
  "router",
  "router",
  "switch",
  "firewall",
  "fiber",
  "fiber",
  "fiber",
  "fiber",
  "fiber",
  "fiber",
  "fiber",
  "fiber",
  "patch",
  "patch",
  "shield",
  "surge",
  "containerlab",
  "clabernetes",
];
export const REWARD_POOL: CardId[] = Object.keys(CARDS) as CardId[];

export const RELICS: Record<
  RelicId,
  { name: string; subtitle: string; rules: string; color: string }
> = {
  "cold-start": {
    name: "Cold Start",
    subtitle: "POWER UNIT",
    rules: "+1 energy at the start of each battle.",
    color: "#6fe8fb",
  },
  "hot-swap": {
    name: "Hot Swap",
    subtitle: "LINK MODULE",
    rules: "The first Optic Fiber each turn costs zero energy.",
    color: "#c59bff",
  },
  "parallel-core": {
    name: "Parallel Core",
    subtitle: "PACKET ENGINE",
    rules: "+2 packet damage when two independent routes are live.",
    color: "#80f8d6",
  },
  "shield-array": {
    name: "Shield Array",
    subtitle: "DEFENSE MODULE",
    rules: "Prevent one integrity damage each battle.",
    color: "#ffc186",
  },
  "deep-cache": {
    name: "Deep Cache",
    subtitle: "MEMORY MODULE",
    rules: "Draw one extra card every turn.",
    color: "#ff9ab6",
  },
};
