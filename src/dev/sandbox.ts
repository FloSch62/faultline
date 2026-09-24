/** Playground operations use the real rules. Only these explicit cheats bypass costs/progression. */
import { CARDS, RELICS, RULES } from "../core/cards.ts";
import { analyze } from "../core/combat/network.ts";
import { maxConditionOf } from "../core/combat/board.ts";
import { ENEMIES } from "../core/enemies.ts";
import { newExpedition, type Expedition } from "../core/expedition.ts";
import { initialTopology, linkKey, maximumChannels, routes } from "../core/graph.ts";
import { createMap } from "../core/map.ts";
import { chooseRoom, type TurnResult } from "../core/run.ts";
import { advanceRoom, grantVictory } from "../core/meta.ts";
import { STAGES } from "../core/stages.ts";
import type { Archetype, CardId, NetworkLink, NetworkNode, RelicId, RoomType, RunState } from "../core/types.ts";

export const DEV_STORAGE = "faultline-dev-expedition-v1";
export const DEV_SETTINGS = "faultline-dev-settings-v1";
export const DEV_CHECKPOINT = "faultline-dev-checkpoint-v1";

export interface SandboxSettings { freeBuild: boolean; immortal: boolean; fast: boolean }
export const DEFAULT_SETTINGS: SandboxSettings = { freeBuild: true, immortal: false, fast: true };

export interface Scenario {
  id: string;
  name: string;
  explanation: string;
  experiment: string;
  nodes: NetworkNode[];
  links: NetworkLink[];
  faults?: string[];
}
const node = (id: string, role: NetworkNode["role"], x: number, z: number): NetworkNode =>
  ({ id, role, x, z, condition: RULES.deviceCondition, maxCondition: RULES.deviceCondition });
const wire = (...paths: string[][]): NetworkLink[] => paths.flatMap(path =>
  path.slice(1).map((b, i) => ({ a: path[i], b })));
const parallelNodes = () => [node("r1", "router", 0, -2.6), node("r2", "router", 0, 2.6)];
const parallelLinks = () => wire(["alpha", "r1", "omega"], ["alpha", "r2", "omega"]);

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "empty", name: "Blank table · build anything",
    explanation: "Start with ALPHA and OMEGA. A live route needs at least one router. Every additional channel needs a route that shares no intermediate device with the others.",
    experiment: "Play a Core Router and cable ALPHA → router → OMEGA. Free build returns each played card to your hand.",
    nodes: [], links: [],
  },
  {
    id: "single", name: "One router · one channel",
    explanation: "ALPHA → R1 → OMEGA is one complete router route, so it supplies one channel. Devices between the terminals are required, not forbidden.",
    experiment: "Add a second router with its own cables to both terminals to create a second channel.",
    nodes: [node("r1", "router", 0, 0)], links: wire(["alpha", "r1", "omega"]),
  },
  {
    id: "parallel", name: "Two independent channels",
    explanation: "The two routes share only ALPHA and OMEGA. R1 and R2 are separate, so both routes count. North/South separation also earns separated-circuit shield.",
    experiment: "Jam R1 or cut one of its cables. R2 still delivers; restore the fault to recover both channels.",
    nodes: parallelNodes(), links: parallelLinks(),
  },
  {
    id: "triple", name: "Three independent channels",
    explanation: "Three routers each have their own complete route. The only shared nodes are the terminals: three channels, one primary delivery and two bandwidth deliveries.",
    experiment: "Aim the deliveries at different ports in a pack, or remove a router to see the count fall to two.",
    nodes: [...parallelNodes(), node("r3", "router", 0, 0)],
    links: [...parallelLinks(), ...wire(["alpha", "r3", "omega"])],
  },
  {
    id: "shared-router", name: "Two branches · shared router",
    explanation: "The signal can leave R1 through S1 or S2, but both routes pass through R1. These are two route variants and only one independent channel.",
    experiment: "Jam R1: both variants fail together. A second router needs its own route all the way from ALPHA to OMEGA.",
    nodes: [node("r1", "router", -2.5, 0), node("s1", "switch", 2.5, -2.6), node("s2", "switch", 2.5, 2.6)],
    links: wire(["alpha", "r1"], ["r1", "s1", "omega"], ["r1", "s2", "omega"]),
  },
  {
    id: "shared-firewall", name: "Two routers · shared firewall",
    explanation: "Having two routers is not enough: both routes pass through F1. Any shared intermediate device, including a firewall, prevents the two routes from counting together.",
    experiment: "Cable ALPHA directly to both routers, bypassing F1. The network can then support two independent channels.",
    nodes: [node("f1", "firewall", -2.5, 0), node("r1", "router", 2, -2.6), node("r2", "router", 2, 2.6)],
    links: wire(["alpha", "f1"], ["f1", "r1", "omega"], ["f1", "r2", "omega"]),
  },
  {
    id: "crosslink", name: "Extra cross-link · still two channels",
    explanation: "The cable between R1 and R2 adds routing alternatives. It adds no independent hardware, so the maximum remains two channels. A route through both routers overlaps the two short routes.",
    experiment: "Remove the R1–R2 cable: there are fewer alternatives, but still two channels.",
    nodes: parallelNodes(), links: [...parallelLinks(), { a: "r1", b: "r2" }],
  },
  {
    id: "dead-end", name: "Extra router · unfinished route",
    explanation: "R2 connects to ALPHA but has no way to OMEGA without returning through ALPHA. It is offline and does not supply another channel.",
    experiment: "Add R2 → OMEGA. That final cable makes R2 online and adds the second channel.",
    nodes: parallelNodes(), links: wire(["alpha", "r1", "omega"], ["alpha", "r2"]),
  },
  {
    id: "no-router", name: "Connected · no router",
    explanation: "A direct cable and a route through a switch both reach OMEGA, but neither contains a router. Neither can carry a valid signal: zero channels.",
    experiment: "Deploy a router and connect ALPHA → router → OMEGA. You will get the first valid channel.",
    nodes: [node("s1", "switch", 0, 0)], links: wire(["alpha", "omega"], ["alpha", "s1", "omega"]),
  },
  {
    id: "cut", name: "Two built · one cable cut",
    explanation: "The table contains two independent routes, but the ALPHA–R1 cable is cut. Only live routes count, so the current channel count is one.",
    experiment: "Restore the ALPHA–R1 cable or use Clear faults to recover the second channel.",
    nodes: parallelNodes(), links: parallelLinks(), faults: [linkKey("alpha", "r1")],
  },
];

export interface EncounterSetup {
  stage: number;
  floor: number;
  type: RoomType;
  archetype: Archetype;
  ascension: number;
  seed: number;
  /** Empty uses the stage's seeded encounter, including designations and reinforcements. */
  enemy: string;
  escorts: string[];
  terrain: boolean;
  keepLoadout: boolean;
}
export const DEFAULT_SETUP: EncounterSetup = {
  stage: 0, floor: 0, type: "battle", archetype: "architect", ascension: 0,
  seed: 0x5eed1234, enemy: "leech", escorts: [], terrain: false, keepLoadout: true,
};

export function createSandbox(setup: EncounterSetup = DEFAULT_SETUP, previous?: Expedition): Expedition {
  const e = newExpedition(setup.archetype, setup.seed >>> 0, false, setup.ascension);
  const r = e.run;
  r.stage = Math.max(0, Math.min(STAGES.length - 1, Math.trunc(setup.stage)));
  r.floor = Math.max(0, Math.min(6, Math.trunc(setup.floor)));
  r.map = createMap(r.stage, r.seed, r.ascension);
  if (setup.keepLoadout && previous?.archetype === setup.archetype) {
    r.deck = [...previous.run.deck];
    r.relics = [...previous.run.relics];
    r.maxIntegrity = previous.run.maxIntegrity;
    r.integrity = r.maxIntegrity;
    r.credits = previous.run.credits;
  }
  const room = r.map.find(item => item.floor === r.floor && item.type === setup.type) ?? r.map.find(item => item.floor === r.floor)!;
  if (room.type !== setup.type) {
    delete room.pack;
    delete room.designations;
    delete room.designationHidden;
    delete room.reinforced;
    const pool = setup.type === "elite" ? STAGES[r.stage].elites : STAGES[r.stage].encounters;
    room.enemyId = pool[r.floor % pool.length];
  }
  room.type = setup.type;
  room.cleared = false;
  if (setup.enemy && ENEMIES[setup.enemy]?.kind === "hostile" && ["battle", "elite", "boss"].includes(setup.type)) {
    room.enemyId = setup.enemy;
    const escorts = setup.escorts.filter(id => ENEMIES[id]?.kind === "escort").slice(0, 2);
    if (escorts.length) room.pack = escorts;
    else delete room.pack;
    delete room.designations;
    room.designationHidden = false;
    room.reinforced = false;
  } else if (setup.type === "boss") {
    room.enemyId = STAGES[r.stage].boss;
    delete room.pack;
    delete room.designations;
    room.designationHidden = false;
  }
  const result = chooseRoom(r, room.id);
  if (!result.ok) throw new Error(result.message);
  r.bossIntroSeen = true;
  if (!setup.terrain) { r.terrain = null; r.zoneEffects = []; r.topology = initialTopology(); }
  return e;
}

export function loadScenario(id: string, previous?: Expedition): Expedition {
  const scenario = SCENARIOS.find(item => item.id === id);
  if (!scenario) throw new Error("Choose a known scenario.");
  const e = createSandbox({ ...DEFAULT_SETUP, archetype: previous?.archetype ?? "architect", keepLoadout: false });
  const r = e.run;
  r.topology = { nodes: [...initialTopology().nodes, ...structuredClone(scenario.nodes)], links: structuredClone(scenario.links) };
  r.nextNodeId = 20;
  r.faultLinks = [...(scenario.faults ?? [])];
  r.hand = ["router", "fiber", "switch", "firewall", "load-balancer", "patch", "guard"];
  r.enemies[0].hp = r.enemies[0].maxHp = 999;
  r.reinforcement = null;
  r.signal = null;
  r.log = [`Playground: ${scenario.name}.`, "Channel rules are unchanged. The hostile has 999 integrity for repeated tests."];
  return e;
}

export function refillSandbox(run: RunState, settings: SandboxSettings, before?: RunState, played?: CardId) {
  if (!settings.freeBuild || run.phase !== "battle") return;
  run.energy = 99;
  run.consoleUses = 0;
  if (!before || !played || run.cardsPlayed <= before.cardsPlayed || run.hand.length >= RULES.handLimit) return;
  // Remove the consumed copy, then return it. Draws, exhaustion and encounter-only cards
  // still execute normally; this restoration is an explicit playground cheat.
  for (const pile of ["discardPile", "exhaustPile"] as const) {
    if (run[pile].filter(id => id === played).length > before[pile].filter(id => id === played).length) {
      run[pile].splice(run[pile].lastIndexOf(played), 1);
      break;
    }
  }
  run.hand.splice(Math.min(before.hand.indexOf(played), run.hand.length), 0, played);
}

export function finishSandboxTurn(run: RunState, settings: SandboxSettings, result: TurnResult) {
  if (settings.immortal) {
    run.integrity = run.maxIntegrity;
    if (run.phase === "lost") {
      if (run.enemies.every(enemy => enemy.hp <= 0)) grantVictory(run);
      else run.phase = "battle";
    }
    result.lost = false;
  }
  refillSandbox(run, settings);
}

export function clearFaults(run: RunState) {
  run.faultNodes = [];
  run.faultLinks = [];
  run.lingeringJams = {};
  run.frayedByCut = [];
}
export function clearTable(run: RunState) {
  run.topology = initialTopology();
  run.installations = [];
  run.zoneEffects = [];
  run.terrain = null;
  clearFaults(run);
}
export function removeDevice(run: RunState, id: string) {
  const device = run.topology.nodes.find(item => item.id === id);
  if (!device || device.fixed) throw new Error("Choose an intermediate device to remove.");
  run.topology.nodes = run.topology.nodes.filter(item => item.id !== id);
  run.topology.links = run.topology.links.filter(item => item.a !== id && item.b !== id);
  run.faultNodes = run.faultNodes.filter(item => item !== id);
  delete run.lingeringJams?.[id];
  const links = new Set(run.topology.links.map(link => linkKey(link.a, link.b)));
  run.faultLinks = run.faultLinks.filter(key => links.has(key));
  run.frayedByCut = run.frayedByCut?.filter(key => links.has(key));
}
export function giveCard(run: RunState, id: CardId, destination: "hand" | "deck") {
  if (!Object.hasOwn(CARDS, id)) throw new Error("Choose a known card.");
  if (destination === "hand") {
    if (run.phase !== "battle") throw new Error("Enter an encounter to add a card to your hand.");
    if (run.hand.length >= RULES.handLimit) throw new Error("Your hand is full. Clear it or play a card with Free build switched off.");
    run.hand.push(id);
  } else {
    if (run.deck.length >= 100) throw new Error("The playground deck already has 100 cards.");
    run.deck.push(id);
    if (run.phase === "battle") run.drawPile.unshift(id);
  }
}
export function toggleRelic(run: RunState, id: RelicId) {
  if (!Object.hasOwn(RELICS, id)) throw new Error("Choose a known relic.");
  if (run.relics.includes(id)) run.relics = run.relics.filter(item => item !== id);
  else run.relics.push(id);
}
export function repairAll(run: RunState) {
  for (const device of run.topology.nodes) if (!device.fixed && device.role !== "phantom") device.condition = maxConditionOf(device);
  clearFaults(run);
}
export function skipSector(run: RunState) {
  if (!run.currentRoom) run.currentRoom = run.map.find(room => room.floor === run.floor)?.id ?? null;
  if (!run.currentRoom) throw new Error("Choose a stage and sector to continue.");
  advanceRoom(run);
}

/** The maximal independent set is not necessarily the strongest primary path. Show
 * the actual independent set as the proof of the count; never treat the primary's
 * overlapping display alternatives as additional independent channels. */
export function inspectChannels(run: RunState) {
  const network = analyze(run, run.faultNodes, run.faultLinks);
  let routerMask = 0, terminals = 0;
  run.topology.nodes.forEach((device, i) => {
    if (device.role === "router") routerMask |= 1 << i;
    if (device.fixed) terminals |= 1 << i;
  });
  const independent = maximumChannels(network.routes, routerMask, terminals);
  const chosen = new Set(independent.map(route => route.mask));
  const alternatives = network.routes.filter(route => !chosen.has(route.mask)).map(route => ({
    path: route.path,
    shared: run.topology.nodes.filter((device, i) => !device.fixed &&
      (route.mask & (1 << i)) && independent.some(other => other.mask & (1 << i))).map(device => device.id),
  }));
  const live = routes(run.topology, new Set(run.faultNodes), new Set(run.faultLinks));
  const invalid = live.filter(route => !(route.mask & routerMask));
  const blocked = routes(run.topology).filter(route => (route.mask & routerMask) &&
    (route.path.some(id => run.faultNodes.includes(id)) || route.path.slice(1).some((id, i) => run.faultLinks.includes(linkKey(route.path[i], id)))));
  return {
    count: network.channelCount, variants: network.routes.length,
    independent: independent.map(route => route.path), alternatives,
    invalid: invalid.map(route => route.path), blocked: blocked.map(route => route.path),
    offline: run.topology.nodes.filter(device => !device.fixed && device.role !== "rack" && device.role !== "phantom" && !network.online.has(device.id)).map(device => device.id),
  };
}
