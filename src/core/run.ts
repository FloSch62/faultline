import { CARDS, RELICS, REWARD_POOL, STARTER_DECK } from "./cards.ts";
import {
  canLink,
  independentRouterPaths,
  initialTopology,
  linkKey,
  paths,
  roleInPath,
} from "./graph.ts";
import { createMap, reachableRooms } from "./map.ts";
import type {
  CardId,
  Enemy,
  MapRoom,
  NetworkNode,
  RelicId,
  RunState,
} from "./types.ts";

export interface ActionResult {
  ok: boolean;
  message: string;
}
export interface TurnResult {
  signalPath: string[];
  alternatePath: string[];
  packetDamage: number;
  enemyAction: string;
  integrityDamage: number;
  defeated: boolean;
  lost: boolean;
}
export interface Intent {
  kind: "strike" | "sever" | "jam" | "breach";
  label: string;
  amount: number;
}

const ENEMIES: Record<string, Omit<Enemy, "hp" | "maxHp" | "turn">> = {
  leech: {
    id: "leech",
    name: "PACKET LEECH",
    title: "Feeds on lost traffic",
    color: 0x6ee4d4,
  },
  wraith: {
    id: "wraith",
    name: "CABLE WRAITH",
    title: "Cuts exposed links",
    color: 0xab8cff,
  },
  storm: {
    id: "storm",
    name: "NULL STORM",
    title: "Disrupts active hardware",
    color: 0x87b5ff,
  },
  sentinel: {
    id: "sentinel",
    name: "GATE SENTINEL",
    title: "Tests your trust boundary",
    color: 0xffad79,
  },
  core: {
    id: "core",
    name: "BLACKOUT CORE",
    title: "The source of the signal collapse",
    color: 0xff777e,
  },
};

export function random(run: RunState): number {
  let x = run.rng || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  run.rng = x >>> 0;
  return run.rng / 0x100000000;
}
function shuffle<T>(run: RunState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(run) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function log(run: RunState, message: string) {
  run.log = [message, ...run.log].slice(0, 5);
}
function draw(run: RunState, count: number) {
  for (let i = 0; i < count; i++) {
    if (!run.drawPile.length && run.discardPile.length) {
      run.drawPile = shuffle(run, run.discardPile.splice(0));
      log(run, "Discard pile reshuffled into deck.");
    }
    const card = run.drawPile.shift();
    if (!card) break;
    run.hand.push(card);
  }
}
function guaranteedDraw(run: RunState, card: CardId) {
  const index = run.drawPile.indexOf(card);
  if (index !== -1) run.hand.push(run.drawPile.splice(index, 1)[0]);
}
function cardRewards(run: RunState): CardId[] {
  const pool = shuffle(run, [...REWARD_POOL]);
  if (run.map.find((room) => room.id === run.currentRoom)?.type === "elite") {
    pool.sort(
      (a, b) =>
        Number(CARDS[b].rarity === "rare") - Number(CARDS[a].rarity === "rare"),
    );
  }
  return pool.slice(0, 3);
}
function relicRewards(run: RunState): RelicId[] {
  return shuffle(
    run,
    (Object.keys(RELICS) as RelicId[]).filter((id) => !run.relics.includes(id)),
  ).slice(0, 3);
}

export function createRun(seed = Date.now() >>> 0): RunState {
  return {
    seed,
    rng: seed || 1,
    phase: "title",
    map: createMap(),
    currentRoom: null,
    lastRoom: null,
    floor: 0,
    integrity: 12,
    maxIntegrity: 12,
    score: 0,
    deck: [...STARTER_DECK],
    drawPile: [],
    discardPile: [],
    hand: [],
    relics: [],
    energy: 5,
    turn: 1,
    topology: initialTopology(),
    enemy: null,
    faultNode: null,
    faultLink: null,
    nextNodeId: 1,
    cardRewards: [],
    relicRewards: [],
    firstFiberPlayed: false,
    shieldArrayUsed: false,
    log: ["Backbone table initialized."],
  };
}

export function chooseRoom(run: RunState, roomId: string): ActionResult {
  if (run.phase !== "map")
    return { ok: false, message: "Choose a route from the map." };
  const room = reachableRooms(run).find((item) => item.id === roomId);
  if (!room) return { ok: false, message: "That sector is not on your route." };
  run.currentRoom = room.id;
  if (room.type === "cache") {
    run.phase = "reward";
    run.cardRewards = cardRewards(run);
    log(run, "Supply cache located. Choose one card.");
  } else if (room.type === "forge") {
    run.phase = "forge";
    log(run, "Maintenance bay secured. Choose a service.");
  } else {
    beginBattle(run, room);
  }
  return {
    ok: true,
    message:
      room.type === "boss"
        ? "BLACKOUT CORE detected."
        : `Entered ${room.type.toUpperCase()} sector.`,
  };
}

function beginBattle(run: RunState, room: MapRoom) {
  const enemyId =
    room.type === "boss"
      ? "core"
      : room.type === "elite"
        ? room.lane === 0
          ? "sentinel"
          : "storm"
        : ["leech", "wraith", "storm"][Math.floor(random(run) * 3)];
  const template = ENEMIES[enemyId];
  const hp =
    room.type === "boss"
      ? 34
      : room.type === "elite"
        ? 22 + room.floor
        : 10 + room.floor * 2;
  run.enemy = { ...template, hp, maxHp: hp, turn: 0 };
  run.phase = "battle";
  run.turn = 1;
  run.energy = 5 + Number(run.relics.includes("cold-start"));
  run.topology = initialTopology();
  run.faultNode = null;
  run.faultLink = null;
  run.nextNodeId = 1;
  run.drawPile = shuffle(run, [...run.deck]);
  run.discardPile = [];
  run.hand = [];
  run.firstFiberPlayed = false;
  run.shieldArrayUsed = false;
  guaranteedDraw(run, "router");
  guaranteedDraw(run, "fiber");
  guaranteedDraw(run, "fiber");
  guaranteedDraw(run, "containerlab");
  draw(run, 6 + Number(run.relics.includes("deep-cache")) - run.hand.length);
  log(run, `${run.enemy.name} enters the grid. Establish a route.`);
}

export function intentFor(run: RunState): Intent | null {
  if (!run.enemy) return null;
  const patterns: Record<string, Intent[]> = {
    leech: [
      { kind: "strike", label: "INTEGRITY STRIKE", amount: 2 },
      { kind: "sever", label: "CUT A CABLE", amount: 0 },
      { kind: "breach", label: "BREACH", amount: 3 },
    ],
    wraith: [
      { kind: "sever", label: "CUT A CABLE", amount: 0 },
      { kind: "strike", label: "INTEGRITY STRIKE", amount: 3 },
      { kind: "jam", label: "JAM A DEVICE", amount: 0 },
    ],
    storm: [
      { kind: "jam", label: "JAM A DEVICE", amount: 0 },
      { kind: "strike", label: "INTEGRITY STRIKE", amount: 2 },
      { kind: "sever", label: "CUT A CABLE", amount: 0 },
    ],
    sentinel: [
      { kind: "breach", label: "SECURITY BREACH", amount: 4 },
      { kind: "sever", label: "CUT A CABLE", amount: 0 },
      { kind: "strike", label: "INTEGRITY STRIKE", amount: 3 },
    ],
    core: [
      { kind: "sever", label: "CUT A CABLE", amount: 0 },
      { kind: "breach", label: "SECURITY BREACH", amount: 4 },
      { kind: "jam", label: "JAM A DEVICE", amount: 0 },
      { kind: "strike", label: "INTEGRITY STRIKE", amount: 4 },
    ],
  };
  const pattern = patterns[run.enemy.id];
  return pattern[run.enemy.turn % pattern.length];
}

export function costFor(run: RunState, index: number): number {
  const card = run.hand[index];
  if (!card) return Infinity;
  if (
    card === "fiber" &&
    !run.firstFiberPlayed &&
    run.relics.includes("hot-swap")
  )
    return 0;
  return CARDS[card].cost;
}
function canPlay(
  run: RunState,
  index: number,
  target: "ground" | "link" | "node" | "instant",
): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Cards are played during encounters." };
  const card = run.hand[index];
  if (!card || CARDS[card].target !== target)
    return { ok: false, message: "Select a matching card." };
  if (run.energy < costFor(run, index))
    return {
      ok: false,
      message: "Not enough energy. End the turn to recharge.",
    };
  return { ok: true, message: "" };
}
function consume(run: RunState, index: number) {
  const card = run.hand[index];
  run.energy -= costFor(run, index);
  run.hand.splice(index, 1);
  run.discardPile.push(card);
  if (card === "fiber") run.firstFiberPlayed = true;
  run.score += 1;
}

// Deterministic sockets keep deployment readable, replayable, and collision free.
function freeSocket(run: RunState): { x: number; z: number } | null {
  if (run.topology.nodes.length >= 14) return null;
  for (const x of [0, -2.5, 2.5, -5, 5, -7, 7]) {
    for (const z of [0, 2.4, -2.4, 4.2, -4.2]) {
      if (
        run.topology.nodes.every(
          (node) => Math.hypot(node.x - x, node.z - z) >= 1.55,
        )
      )
        return { x, z };
    }
  }
  return null;
}
export function playGround(
  run: RunState,
  index: number,
  x: number,
  z: number,
): ActionResult {
  const ready = canPlay(run, index, "ground");
  if (!ready.ok) return ready;
  if (Math.abs(x) > 7.25 || Math.abs(z) > 4.7)
    return { ok: false, message: "Place hardware inside the build grid." };
  if (run.topology.nodes.length >= 14)
    return { ok: false, message: "The table has no more device slots." };
  if (
    run.topology.nodes.some((node) => Math.hypot(node.x - x, node.z - z) < 1.55)
  )
    return { ok: false, message: "Device sockets need more space." };
  const card = run.hand[index];
  const role = CARDS[card].role!;
  const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, x, z };
  run.topology.nodes.push(node);
  consume(run, index);
  log(run, `${node.id.toUpperCase()} installed.`);
  return { ok: true, message: `${CARDS[card].name} installed.` };
}
export function playLink(
  run: RunState,
  index: number,
  a: string,
  b: string,
): ActionResult {
  const ready = canPlay(run, index, "link");
  if (!ready.ok) return ready;
  if (!canLink(run.topology, a, b))
    return { ok: false, message: "Those devices cannot be linked again." };
  const card = run.hand[index];
  run.topology.links.push({ a, b });
  consume(run, index);
  if (card === "crosslink") draw(run, 1);
  log(run, `${a.toUpperCase()} connected to ${b.toUpperCase()}.`);
  return { ok: true, message: "Optic link established." };
}
export function playNode(
  run: RunState,
  index: number,
  id: string,
): ActionResult {
  const ready = canPlay(run, index, "node");
  if (!ready.ok) return ready;
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node) return { ok: false, message: "Select a device." };
  const card = run.hand[index];
  if (card === "clabernetes") {
    if (node.role !== "router")
      return {
        ok: false,
        message: "Clabernetes replicates a router. Choose one on the table.",
      };
    const socket = freeSocket(run);
    if (!socket)
      return {
        ok: false,
        message: "The table has no free socket for a replica.",
      };
    const replica: NetworkNode = {
      id: `router${run.nextNodeId++}`,
      role: "router",
      ...socket,
      shielded: true,
      upgraded: node.upgraded,
    };
    const links = run.topology.links
      .filter((link) => link.a === id || link.b === id)
      .map((link) => ({ a: replica.id, b: link.a === id ? link.b : link.a }));
    node.shielded = true;
    run.topology.nodes.push(replica);
    run.topology.links.push(...links);
    consume(run, index);
    log(
      run,
      `Clabernetes replicated ${id.toUpperCase()}. Both routers are shielded.`,
    );
    return {
      ok: true,
      message: "Router replicated. Its links and overclock are preserved.",
    };
  }
  if (card === "shield" && node.shielded)
    return { ok: false, message: "That device is already shielded." };
  if (card === "firmware" && (node.role !== "router" || node.upgraded))
    return { ok: false, message: "Overclock an unmodified router." };
  if (card === "shield") node.shielded = true;
  if (card === "firmware") node.upgraded = true;
  consume(run, index);
  log(
    run,
    `${node.id.toUpperCase()} ${card === "shield" ? "shielded" : "overclocked"}.`,
  );
  return { ok: true, message: `${CARDS[card].name} applied.` };
}
export function playInstant(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "instant");
  if (!ready.ok) return ready;
  const card = run.hand[index];
  if (card === "containerlab") {
    const socket = freeSocket(run);
    if (!socket)
      return {
        ok: false,
        message: "The table has no free socket for a new lab.",
      };
    const node: NetworkNode = {
      id: `router${run.nextNodeId++}`,
      role: "router",
      ...socket,
      upgraded: true,
    };
    run.topology.nodes.push(node);
    run.topology.links.push(
      { a: "alpha", b: node.id },
      { a: node.id, b: "omega" },
    );
    log(
      run,
      "Containerlab deployed a complete overclocked route. Signal ready.",
    );
  }
  consume(run, index);
  if (card === "patch") {
    run.faultNode = null;
    run.faultLink = null;
    draw(run, 1);
    log(run, "Fault cleared. One card drawn.");
  }
  if (card === "surge") {
    run.energy += 2;
    draw(run, 2);
    log(run, "Power surge: +2 energy, +2 cards.");
  }
  return { ok: true, message: `${CARDS[card].name} activated.` };
}

export function livePaths(run: RunState): string[][] {
  return paths(
    run.topology,
    run.faultNode ? new Set([run.faultNode]) : new Set(),
    run.faultLink ? new Set([run.faultLink]) : new Set(),
  );
}
export function signalPaths(run: RunState): string[][] {
  return livePaths(run).filter((path) =>
    roleInPath(path, run.topology, "router"),
  );
}

export function damageFromPath(run: RunState, signal: string[]): number {
  let damage = 5;
  if (roleInPath(signal, run.topology, "firewall")) damage += 1;
  if (
    signal.some((id) =>
      run.topology.nodes.some((node) => node.id === id && node.upgraded),
    )
  )
    damage += 2;
  if (independentRouterPaths(run.topology, signalPaths(run)))
    damage += 2 + Number(run.relics.includes("parallel-core")) * 2;
  return damage;
}
function applyIntegrityDamage(run: RunState, amount: number): number {
  if (
    amount > 0 &&
    run.relics.includes("shield-array") &&
    !run.shieldArrayUsed
  ) {
    amount--;
    run.shieldArrayUsed = true;
  }
  run.integrity = Math.max(0, run.integrity - amount);
  return amount;
}

export function endTurn(run: RunState): TurnResult {
  if (run.phase !== "battle" || !run.enemy)
    throw new Error("No active encounter.");
  const signal = signalPaths(run)[0] ?? [];
  const independent = independentRouterPaths(run.topology, signalPaths(run));
  const packetDamage = signal.length ? damageFromPath(run, signal) : 0;
  run.enemy.hp = Math.max(0, run.enemy.hp - packetDamage);
  run.score += packetDamage * 10;
  const result: TurnResult = {
    signalPath: signal,
    alternatePath: independent?.[1] ?? [],
    packetDamage,
    enemyAction: "",
    integrityDamage: 0,
    defeated: false,
    lost: false,
  };
  if (packetDamage) log(run, `Signal strike dealt ${packetDamage} damage.`);
  else log(run, "No routed signal. Packet lost.");
  if (run.enemy.hp === 0) {
    result.defeated = true;
    run.score += 100 + run.integrity * 5;
    run.phase = "reward";
    run.cardRewards = cardRewards(run);
    log(run, `${run.enemy.name} neutralized. Route secured.`);
    return result;
  }

  const intent = intentFor(run)!;
  // A fault lasts for one player turn; the enemy now applies its next intent.
  run.faultNode = null;
  run.faultLink = null;
  if (intent.kind === "sever") {
    const eligible = run.topology.links;
    if (eligible.length) {
      const link = eligible[Math.floor(random(run) * eligible.length)];
      run.faultLink = linkKey(link.a, link.b);
      result.enemyAction = `${run.enemy.name} severed ${link.a.toUpperCase()} ↔ ${link.b.toUpperCase()}.`;
    } else {
      result.integrityDamage = applyIntegrityDamage(run, 1);
      result.enemyAction = `${run.enemy.name} hit the undefended backbone.`;
    }
  } else if (intent.kind === "jam") {
    const eligible = run.topology.nodes.filter(
      (node) => !node.fixed && !node.shielded,
    );
    if (eligible.length) {
      const node = eligible[Math.floor(random(run) * eligible.length)];
      run.faultNode = node.id;
      result.enemyAction = `${run.enemy.name} jammed ${node.id.toUpperCase()}.`;
    } else {
      result.integrityDamage = applyIntegrityDamage(run, 1);
      result.enemyAction = `${run.enemy.name} hit the shielded grid.`;
    }
  } else {
    let amount = intent.amount;
    if (
      intent.kind === "breach" &&
      signal.length &&
      roleInPath(signal, run.topology, "firewall")
    )
      amount = Math.max(0, amount - 3);
    result.integrityDamage = applyIntegrityDamage(run, amount);
    result.enemyAction = `${run.enemy.name} dealt ${result.integrityDamage} integrity damage.`;
  }
  log(run, result.enemyAction);
  run.enemy.turn++;
  run.turn++;
  run.energy = 5;
  run.firstFiberPlayed = false;
  run.discardPile.push(...run.hand.splice(0));
  draw(run, 6 + Number(run.relics.includes("deep-cache")));
  if (run.integrity <= 0) {
    run.phase = "lost";
    result.lost = true;
  }
  return result;
}

function advanceRoom(run: RunState) {
  if (!run.currentRoom) return;
  const room = run.map.find((item) => item.id === run.currentRoom)!;
  room.cleared = true;
  run.lastRoom = room.id;
  run.floor = room.floor + 1;
  run.currentRoom = null;
  run.enemy = null;
  run.faultNode = null;
  run.faultLink = null;
  run.phase = run.floor >= 7 ? "won" : "map";
}

export function chooseCardReward(
  run: RunState,
  card: CardId | null,
): ActionResult {
  if (run.phase !== "reward")
    return { ok: false, message: "No card reward is active." };
  if (card && !run.cardRewards.includes(card))
    return { ok: false, message: "That card is not a reward option." };
  if (card) {
    run.deck.push(card);
    log(run, `${CARDS[card].name} added to the deck.`);
  }
  run.cardRewards = [];
  const room = run.map.find((item) => item.id === run.currentRoom);
  if (room?.type === "elite") {
    run.relicRewards = relicRewards(run);
    run.phase = run.relicRewards.length ? "relic" : "map";
    if (!run.relicRewards.length) advanceRoom(run);
  } else advanceRoom(run);
  return {
    ok: true,
    message: card
      ? `${CARDS[card].name} added to deck.`
      : "Card reward skipped.",
  };
}
export function chooseRelic(run: RunState, relic: RelicId): ActionResult {
  if (run.phase !== "relic" || !run.relicRewards.includes(relic))
    return { ok: false, message: "That relic is unavailable." };
  run.relics.push(relic);
  run.relicRewards = [];
  log(run, `${RELICS[relic].name} installed.`);
  advanceRoom(run);
  return { ok: true, message: `${RELICS[relic].name} installed.` };
}
export function chooseForge(
  run: RunState,
  option: "repair" | "relic",
): ActionResult {
  if (run.phase !== "forge")
    return { ok: false, message: "No maintenance bay is active." };
  if (option === "repair") {
    const restored = Math.min(4, run.maxIntegrity - run.integrity);
    run.integrity += restored;
    log(run, `Maintenance restored ${restored} integrity.`);
    advanceRoom(run);
    return { ok: true, message: `${restored} integrity restored.` };
  }
  run.relicRewards = relicRewards(run);
  if (!run.relicRewards.length) {
    advanceRoom(run);
    return { ok: true, message: "All relics are already installed." };
  }
  run.phase = "relic";
  return { ok: true, message: "Select one system relic." };
}
