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
import { ENEMIES } from "./enemies.ts";
import { STAGES } from "./stages.ts";
import type {
  CardId,
  MapRoom,
  NetworkNode,
  RelicId,
  RunState,
  Zone,
  ZoneEffect,
  ZoneEffectKind,
} from "./types.ts";

export type { Zone } from "./types.ts";

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
  kind: "strike" | "sever" | "jam" | "breach" | "corrupt";
  field?: "corrosion" | "suppression";
  label: string;
  amount: number;
  pressure: number;
  target?: string;
}


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
  run.log = [message, ...run.log].slice(0, 40);
}
export const HAND_LIMIT = 10;
function draw(run: RunState, count: number) {
  for (let i = 0; i < count && run.hand.length < HAND_LIMIT; i++) {
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
  const elite = ["elite", "boss"].includes(
    run.map.find((room) => room.id === run.currentRoom)?.type ?? "",
  );
  const options: CardId[] = [];
  for (let i = 0; i < 3; i++) {
    const roll = random(run);
    const rarity =
      elite && i === 0
        ? "rare"
        : roll < (elite ? 0.02 : 0.005)
          ? "legendary"
          : roll < (elite ? 0.27 : 0.125)
            ? "rare"
            : roll < (elite ? 0.77 : 0.505)
              ? "uncommon"
              : "common";
    const pool = REWARD_POOL.filter(
      (id) => CARDS[id].rarity === rarity && !options.includes(id),
    );
    const fallback = REWARD_POOL.filter(
      (id) => CARDS[id].rarity !== "basic" && !options.includes(id),
    );
    const available = pool.length ? pool : fallback;
    options.push(available[Math.floor(random(run) * available.length)]);
  }
  return options;
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
    stage: 0,
    bossIntroSeen: true,
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
    exhaustPile: [],
    block: 0,
    packetBoost: 0,
    reserveEnergy: 0,
    cardsPlayed: 0,
    zoneEffects: [],
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
        ? `${run.enemy!.name} detected.`
        : `Entered ${room.type.toUpperCase()} sector.`,
  };
}

function beginBattle(run: RunState, room: MapRoom) {
  const stage = STAGES[run.stage];
  const pool = room.type === "elite" ? stage.elites : stage.encounters;
  const enemyId = room.type === "boss" ? stage.boss : pool[Math.floor(random(run) * pool.length)];
  const template = ENEMIES[enemyId];
  const hp =
    room.type === "boss"
      ? stage.bossHp
      : room.type === "elite"
        ? 30 + room.floor * 2 + run.stage * 10
        : 10 + room.floor * 3 + run.stage * 8;
  const { id, name, title, color } = template;
  run.enemy = { id, name, title, color, hp, maxHp: hp, turn: 0 };
  run.bossIntroSeen = room.type !== "boss";
  run.phase = "battle";
  run.turn = 1;
  run.energy = 5 + Number(run.relics.includes("cold-start"));
  run.topology = initialTopology();
  run.faultNode = null;
  run.faultLink = null;
  run.nextNodeId = 1;
  run.drawPile = shuffle(run, [...run.deck]);
  run.discardPile = [];
  run.exhaustPile = [];
  run.block = run.relics.includes("grounded-core") ? 2 : 0;
  run.packetBoost = 0;
  run.reserveEnergy = 0;
  run.cardsPlayed = 0;
  run.zoneEffects = [];
  run.hand = [];
  run.firstFiberPlayed = false;
  run.shieldArrayUsed = false;
  guaranteedDraw(run, "router");
  guaranteedDraw(run, "fiber");
  guaranteedDraw(run, "fiber");
  draw(run, 6 + Number(run.relics.includes("deep-cache")) - run.hand.length);
  log(run, `${run.enemy.name} enters the grid. Establish a route.`);
}

export function intentFor(run: RunState): Intent | null {
  if (!run.enemy) return null;
  const definition = ENEMIES[run.enemy.id];
  const pattern = definition.pattern;
  const base = pattern[run.enemy.turn % pattern.length];
  const pressure = Math.floor(run.enemy.turn / 3);
  const enraged = definition.enrages && run.enemy.hp <= run.enemy.maxHp / 2;
  const amount =
    base.amount +
    (base.kind === "strike" || base.kind === "breach"
      ? pressure + run.stage + (enraged ? definition.enrages!.attacks : 0)
      : enraged
        ? definition.enrages!.faults
        : 0);
  return {
    ...base,
    amount,
    pressure,
    label: `${enraged ? "ENRAGED · " : ""}${base.label}${run.stage && ["strike", "breach"].includes(base.kind) ? ` +${run.stage} STAGE THREAT` : ""}${pressure ? ` +${pressure} PRESSURE` : ""}`,
  };
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
  target: "ground" | "link" | "node" | "instant" | "zone",
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
  (CARDS[card].exhaust ? run.exhaustPile : run.discardPile).push(card);
  run.cardsPlayed++;
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
export function zoneForNode(node: Pick<NetworkNode, "z">): Zone {
  return node.z < -1.3 ? "north" : node.z > 1.3 ? "south" : "center";
}
export const ZONES: readonly Zone[] = ["north", "center", "south"];
export const FIELD_RULES: Record<ZoneEffectKind, { name: string; rules: string; hostile: boolean }> = {
  resonance: { name: "Resonance", rules: "+3 damage on routes through this zone", hostile: false },
  aegis: { name: "Aegis", rules: "+3 shield with a live route through this zone", hostile: false },
  stasis: { name: "Null field", rules: "+2 shield while your hardware occupies this zone", hostile: false },
  corrosion: { name: "Corrosion", rules: "+2 incoming damage while your hardware occupies this zone", hostile: true },
  suppression: { name: "Suppression", rules: "−3 damage on routes through this zone", hostile: true },
};
export function zoneDescription(run: RunState, zone: Zone): string {
  const fields = run.zoneEffects.filter(effect => effect.zone === zone);
  return fields.map(effect => `${FIELD_RULES[effect.kind].name}: ${FIELD_RULES[effect.kind].rules} · ${effect.turns} turn${effect.turns === 1 ? "" : "s"}`).join(". ") || "Clear ground · no active fields";
}
function installField(run: RunState, effect: ZoneEffect) {
  // Each band holds one allied and one hostile field. Recasting replaces that side.
  run.zoneEffects = run.zoneEffects.filter(existing => existing.zone !== effect.zone || FIELD_RULES[existing.kind].hostile !== FIELD_RULES[effect.kind].hostile);
  run.zoneEffects.push(effect);
}
export function playZone(run: RunState, index: number, zone: Zone): ActionResult {
  const ready = canPlay(run, index, "zone");
  if (!ready.ok) return ready;
  if (!ZONES.includes(zone)) return { ok: false, message: "Choose North, Center, or South." };
  const card = run.hand[index];
  if (card === "purge-field") {
    run.zoneEffects = run.zoneEffects.filter(effect => effect.zone !== zone || !FIELD_RULES[effect.kind].hostile);
    if (run.topology.nodes.some(node => node.id === run.faultNode && zoneForNode(node) === zone)) run.faultNode = null;
  } else {
    const kind = card === "resonance-field" ? "resonance" : card === "aegis-field" ? "aegis" : "stasis";
    installField(run, { zone, kind, turns: 3 });
  }
  consume(run, index);
  if (card === "purge-field") draw(run, 1);
  const message = `${CARDS[card].name} · ${zone.toUpperCase()}${card === "purge-field" ? " cleansed" : " · 3 turns"}.`;
  log(run, message);
  return { ok: true, message };
}
export function relocateNode(
  run: RunState,
  id: string,
  x: number,
  z: number,
): ActionResult {
  if (run.phase !== "battle")
    return { ok: false, message: "Relocate devices during an encounter." };
  const node = run.topology.nodes.find((item) => item.id === id);
  if (!node || node.fixed)
    return { ok: false, message: "Only deployed devices can be relocated." };
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > 7.25 ||
    Math.abs(z) > 4.7
  )
    return { ok: false, message: "Keep hardware inside the build grid." };
  if (Math.hypot(node.x - x, node.z - z) < 0.01)
    return { ok: true, message: "Device position unchanged." };
  if (run.energy < 1)
    return { ok: false, message: "Relocation costs 1 energy." };
  if (
    run.topology.nodes.some(
      (other) => other.id !== id && Math.hypot(other.x - x, other.z - z) < 1.55,
    )
  )
    return { ok: false, message: "Device sockets need more space." };
  const origin = zoneForNode(node);
  node.x = x;
  node.z = z;
  run.energy--;
  log(
    run,
    `${id.toUpperCase()}: ${origin.toUpperCase()} → ${zoneForNode(node).toUpperCase()} · 1 energy.`,
  );
  return { ok: true, message: `${id.toUpperCase()} · ${origin.toUpperCase()} → ${zoneForNode(node).toUpperCase()} · 1 energy.` };
}
export function playGround(
  run: RunState,
  index: number,
  x: number,
  z: number,
): ActionResult {
  const ready = canPlay(run, index, "ground");
  if (!ready.ok) return ready;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > 7.25 ||
    Math.abs(z) > 4.7
  )
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
  if (["hardened-router", "relay", "bastion"].includes(card))
    node.shielded = true;
  if (card === "linux-bridge") {
    const nearest = [...run.topology.nodes].sort(
      (a, b) =>
        Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) ||
        a.id.localeCompare(b.id),
    )[0];
    if (nearest) run.topology.links.push({ a: node.id, b: nearest.id });
  }
  run.topology.nodes.push(node);
  consume(run, index);
  if (card === "hardened-router") run.block += 2;
  if (card === "bastion") run.block += 5;
  if (card === "relay") draw(run, 1);
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
  run.topology.links.push({
    a,
    b,
    ...(card === "armored-fiber" || card === "vxlan" ? { armored: true } : {}),
    ...(card === "conduit" || card === "vxlan" ? { boosted: true } : {}),
  });
  consume(run, index);
  if (card === "crosslink") draw(run, 1);
  if (card === "duplex") run.block += 3;
  log(run, `${a.toUpperCase()} connected to ${b.toUpperCase()}.`);
  return { ok: true, message: "Optic link established." };
}
export function canTargetNode(
  run: RunState,
  index: number,
  id: string,
): boolean {
  const node = run.topology.nodes.find((item) => item.id === id);
  const card = run.hand[index];
  if (!node || !card || CARDS[card].target !== "node") return false;
  if (card === "clabernetes") return node.role === "router";
  if (card === "firmware") return node.role === "router" && !node.upgraded;
  if (card === "compression") return node.role === "switch" && !node.amplified;
  if (card === "startup-config")
    return node.role === "router" && !node.configured;
  if (card === "shield") return !node.fixed && !node.shielded;
  return false;
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
  if (!canTargetNode(run, index, id))
    return {
      ok: false,
      message: `Choose a valid device for ${CARDS[card].name}.`,
    };
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
      amplified: node.amplified,
      configured: node.configured,
    };
    const links = run.topology.links
      .filter((link) => link.a === id || link.b === id)
      .map((link) => ({
        ...link,
        a: replica.id,
        b: link.a === id ? link.b : link.a,
      }));
    node.shielded = true;
    if (run.faultNode === node.id) run.faultNode = null;
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
  if (card === "shield") {
    node.shielded = true;
    if (run.faultNode === node.id) run.faultNode = null;
  }
  if (card === "compression") node.amplified = true;
  if (card === "startup-config") {
    node.configured = true;
    run.block += 1;
  }
  if (card === "firmware") node.upgraded = true;
  consume(run, index);
  log(
    run,
    `${node.id.toUpperCase()} ${card === "shield" ? "shielded" : card === "compression" ? "amplified" : card === "startup-config" ? "configured" : "overclocked"}.`,
  );
  return { ok: true, message: `${CARDS[card].name} applied.` };
}
export function playInstant(run: RunState, index: number): ActionResult {
  const ready = canPlay(run, index, "instant");
  if (!ready.ok) return ready;
  const card = run.hand[index];
  const captured = card === "wireshark" ? signalPaths(run)[0] : undefined;
  let capturedDraw = 0;
  if (card === "wireshark" && !captured)
    return {
      ok: false,
      message:
        "Wireshark needs a live ALPHA → router → OMEGA route to capture.",
    };
  const capturedRoles = captured
    ? new Set(
        run.topology.nodes
          .filter(
            (node) => captured.includes(node.id) && node.role !== "client",
          )
          .map((node) => node.role),
      )
    : null;

  if (
    card === "mirror" &&
    !independentRouterPaths(run.topology, signalPaths(run))
  )
    return {
      ok: false,
      message: "Mirror Protocol needs two independent live router routes.",
    };
  if (
    card === "salvage" &&
    !run.discardPile.some((id) => CARDS[id].target === "link")
  )
    return { ok: false, message: "No link cards are in your discard pile." };
  if (card === "containerlab" || card === "rebuild") {
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
      upgraded: card === "containerlab",
    };
    run.topology.nodes.push(node);
    run.topology.links.push(
      { a: "alpha", b: node.id },
      { a: node.id, b: "omega" },
    );
  }
  consume(run, index);
  if (["patch", "reroute", "protocol"].includes(card)) {
    run.faultNode = null;
    run.faultLink = null;
  }
  if (card === "patch" || card === "reroute") draw(run, 1);
  if (card === "surge") {
    run.energy += 2;
    draw(run, 2);
  }
  if (card === "guard" || card === "mirror") run.block += 4;
  if (card === "protocol") run.block += 3;
  if (card === "barrier") run.block += 8;
  if (card === "reroute") run.block += 2;
  if (card === "pulse" || card === "mirror") run.packetBoost += 3;
  if (card === "zero-day") run.packetBoost += 8;
  if (card === "diagnostic") draw(run, 3);
  if (card === "inspect") draw(run, signalPaths(run).length ? 2 : 1);
  if (capturedRoles) {
    run.packetBoost += Math.min(3, capturedRoles.size);
    const beforeDraw = run.hand.length;
    draw(run, 2);
    capturedDraw = run.hand.length - beforeDraw;
  }
  if (card === "capacitor") {
    run.block += 3;
    run.reserveEnergy += 2;
  }
  if (card === "emergency") {
    run.integrity = Math.min(run.maxIntegrity, run.integrity + 3);
    run.block += 3;
  }
  if (card === "salvage") {
    let recovered = 0;
    for (
      let i = run.discardPile.length - 1;
      i >= 0 && recovered < 2 && run.hand.length < HAND_LIMIT;
      i--
    ) {
      if (CARDS[run.discardPile[i]].target !== "link") continue;
      run.hand.push(run.discardPile.splice(i, 1)[0]);
      recovered++;
    }
  }
  log(
    run,
    capturedRoles
      ? `Wireshark captured ${[...capturedRoles].join(" + ")}: +${Math.min(3, capturedRoles.size)} burst, drew ${capturedDraw} card${capturedDraw === 1 ? "" : "s"} · exhausted for this encounter.`
      : `${CARDS[card].name} activated${CARDS[card].exhaust ? " · exhausted for this encounter" : ""}.`,
  );
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
  const candidates = livePaths(run).filter((path) =>
    roleInPath(path, run.topology, "router"),
  );
  const independent = !!independentRouterPaths(run.topology, candidates);
  const amplifiedLinks = new Set(
    run.topology.links
      .filter((link) => link.boosted)
      .map((link) => linkKey(link.a, link.b)),
  );
  const ranked = candidates.map((path) => ({
    path,
    damage: Math.max(0, sumTerms(damageTerms(run, path, independent, amplifiedLinks))),
    firewall: Number(roleInPath(path, run.topology, "firewall")),
  }));
  return ranked
    .sort(
      (a, b) =>
        b.damage - a.damage ||
        b.firewall - a.firewall ||
        a.path.length - b.path.length ||
        a.path.join().localeCompare(b.path.join()),
    )
    .map((entry) => entry.path);
}

export interface CombatTerm {
  label: string;
  amount: number;
}
export interface CombatPreview {
  signalPath: string[];
  alternatePath: string[];
  packetDamage: number;
  damageTerms: CombatTerm[];
  shield: number;
  shieldTerms: CombatTerm[];
  incoming: number;
  incomingRaw: number;
  intent: Intent | null;
  lethal: boolean;
  independent: boolean;
  faultTarget: string | null;
  hazardZone: Zone | null;
  enemyHealing: number;
  rawPacketDamage: number;
  incomingTerms: CombatTerm[];
  traitDescription: string;
  zoneThreat: ZoneEffect | null;
}

function damageTerms(
  run: RunState,
  signal: string[],
  independent: boolean,
  amplifiedLinks = new Set(
    run.topology.links
      .filter((link) => link.boosted)
      .map((link) => linkKey(link.a, link.b)),
  ),
): CombatTerm[] {
  if (!signal.length || !roleInPath(signal, run.topology, "router")) return [];
  const nodes = run.topology.nodes.filter((node) => signal.includes(node.id));
  const terms: CombatTerm[] = [{ label: "Live router route", amount: 5 }];
  const routedZones = new Set(nodes.filter(node => !node.fixed).map(zoneForNode));
  for (const field of run.zoneEffects) {
    if (routedZones.has(field.zone) && ["resonance", "suppression"].includes(field.kind))
      terms.push({ label: `${field.zone.toUpperCase()} · ${FIELD_RULES[field.kind].name}`, amount: field.kind === "resonance" ? 3 : -3 });
  }
  const armor = run.enemy && ENEMIES[run.enemy.id].armor;
  if (armor && !(armor.bypass === "independent" ? independent : nodes.some(node => node.role === "firewall")))
    terms.push({ label: `${run.enemy!.name} armor · needs ${armor.bypass === "independent" ? "independent routes" : "a routed firewall"}`, amount: -armor.amount });
  if (nodes.some((node) => node.role === "firewall"))
    terms.push({ label: "Firewall routing", amount: 1 });
  if (nodes.some((node) => node.configured))
    terms.push({ label: "Startup Config", amount: 1 });
  if (nodes.some((node) => node.upgraded))
    terms.push({ label: "Overclocked router", amount: 2 });
  const switches = Math.min(
    2,
    nodes.filter((node) => node.role === "switch").length,
  );
  if (switches)
    terms.push({ label: "Signal switches (max 2)", amount: switches });
  if (nodes.some((node) => node.amplified))
    terms.push({ label: "Packet Compression", amount: 2 });
  const boosted = Math.min(
    2,
    signal
      .slice(1)
      .filter((id, i) => amplifiedLinks.has(linkKey(signal[i], id))).length,
  );
  if (boosted)
    terms.push({ label: "Amplified cables (max 2)", amount: boosted });
  if (independent) terms.push({ label: "Two independent routes", amount: 2 });
  if (independent && run.relics.includes("parallel-core"))
    terms.push({ label: "Parallel Core", amount: 2 });
  if (switches && run.relics.includes("packet-lens"))
    terms.push({ label: "Packet Lens", amount: 1 });
  if (run.packetBoost)
    terms.push({ label: "Packet boost this turn", amount: run.packetBoost });
  return terms;
}
const sumTerms = (terms: CombatTerm[]) =>
  terms.reduce((sum, term) => sum + term.amount, 0);
export function damageFromPath(run: RunState, signal: string[]): number {
  return Math.max(0, sumTerms(
    damageTerms(
      run,
      signal,
      !!independentRouterPaths(run.topology, signalPaths(run)),
    ),
  ));
}

function separatedCircuits(run: RunState, candidates: string[][]): boolean {
  const indices = new Map(run.topology.nodes.map((node, i) => [node.id, i]));
  const eligible = candidates.map((path) => ({
    mask: path
      .slice(1, -1)
      .reduce((mask, id) => mask | (1 << indices.get(id)!), 0),
    north: path.some((id) =>
      run.topology.nodes.some(
        (node) =>
          node.id === id &&
          node.role === "router" &&
          zoneForNode(node) === "north",
      ),
    ),
    south: path.some((id) =>
      run.topology.nodes.some(
        (node) =>
          node.id === id &&
          node.role === "router" &&
          zoneForNode(node) === "south",
      ),
    ),
  }));
  const north = eligible.filter((route) => route.north),
    south = eligible.filter((route) => route.south);
  return north.some((a) => south.some((b) => (a.mask & b.mask) === 0));
}
/** Pure forecast. Resolution uses these exact values and the same fault target. */
export function combatPreview(run: RunState): CombatPreview {
  const candidates = signalPaths(run);
  const pair = independentRouterPaths(run.topology, candidates);
  const independent = !!pair;
  const signalPath = candidates[0] ?? [];
  const terms = damageTerms(run, signalPath, independent);
  const packetDamage = Math.max(0, sumTerms(terms));
  const rawPacketDamage = sumTerms(terms.filter((term) => term.amount > 0));
  if (sumTerms(terms) < 0) terms.push({ label: "Minimum signal damage", amount: -sumTerms(terms) });
  const intent = intentFor(run);
  const lethal = !!run.enemy && packetDamage >= run.enemy.hp;
  const shields: CombatTerm[] = [];
  const incomingTerms: CombatTerm[] =
    intent && intent.amount
      ? [{ label: intent.label, amount: intent.amount }]
      : [];
  let raw = intent?.amount ?? 0;
  const definition = run.enemy ? ENEMIES[run.enemy.id] : null;
  if (intent?.kind === "strike" && run.enemy?.id === "serpent" && !independent) {
    raw += 2;
    incomingTerms.push({ label: "Coil pressure · no independent routes", amount: 2 });
  }
  if (intent?.kind === "strike" && run.enemy?.id === "weaver" && run.topology.links.length >= 6) {
    raw += 2;
    incomingTerms.push({ label: "Tension trap · six or more cables", amount: 2 });
  }
  const jamZone: Zone | null =
    definition?.jamBands && intent?.kind === "jam"
      ? (["north", "center", "south"] as Zone[])[
          Math.floor(run.enemy!.turn / definition.pattern.length) % 3
        ]
      : null;
  let hazardZone = jamZone;
  let zoneThreat: ZoneEffect | null = null;
  if (intent?.kind === "corrupt" || intent?.field) {
    const corruption = intent.field ?? (definition?.corruption === "alternating"
      ? Math.floor(run.enemy!.turn / 2) % 2 ? "corrosion" : "suppression"
      : definition?.corruption ?? "corrosion");
    const eligible = run.topology.nodes.filter(node => !node.fixed && (corruption !== "suppression" || signalPath.includes(node.id)));
    hazardZone = jamZone ?? (["center", "north", "south"] as Zone[]).sort((a,b) => eligible.filter(node => zoneForNode(node) === b).length - eligible.filter(node => zoneForNode(node) === a).length)[0];
    zoneThreat = { zone: hazardZone, kind: corruption, turns: 2 };
  }
  for (const field of run.zoneEffects) {
    const occupied = run.topology.nodes.some(node => !node.fixed && zoneForNode(node) === field.zone);
    const routed = run.topology.nodes.some(node => !node.fixed && zoneForNode(node) === field.zone && signalPath.includes(node.id));
    const label = `${field.zone.toUpperCase()} · ${FIELD_RULES[field.kind].name}`;
    if (field.kind === "corrosion" && occupied) { raw += 2; incomingTerms.push({ label, amount: 2 }); }
    if (field.kind === "aegis" && routed) shields.push({ label, amount: 3 });
    if (field.kind === "stasis" && occupied) shields.push({ label, amount: 2 });
  }
  let faultTarget: string | null = null;
  if (intent?.kind === "sever") {
    // Attack the best live route first; equivalent choices use stable topology order.
    const eligible = run.topology.links.filter((link) => !link.armored);
    const cableLength = (link: (typeof eligible)[number]) => {
      const a = run.topology.nodes.find((node) => node.id === link.a)!,
        b = run.topology.nodes.find((node) => node.id === link.b)!;
      return Math.hypot(a.x - b.x, a.z - b.z);
    };
    const target =
      run.enemy?.id === "wraith"
        ? [...eligible].sort(
            (a, b) =>
              cableLength(b) - cableLength(a) ||
              linkKey(a.a, a.b).localeCompare(linkKey(b.a, b.b)),
          )[0]
        : (eligible.find((link) =>
            signalPath.some(
              (id, i) =>
                i > 0 &&
                linkKey(signalPath[i - 1], id) === linkKey(link.a, link.b),
            ),
          ) ?? eligible[0]);
    if (target) {
      faultTarget = linkKey(target.a, target.b);
      if (run.enemy?.id === "wraith" && cableLength(target) > 6) {
        raw++;
        incomingTerms.push({
          label: "Exposed cable longer than 6 units",
          amount: 1,
        });
      }
    } else if (!run.topology.links.length) {
      raw++;
      incomingTerms.push({ label: "Exposed backbone · no cables", amount: 1 });
    }
  }
  if (intent?.kind === "jam") {
    const eligible = run.topology.nodes.filter(
      (node) =>
        !node.fixed &&
        !node.shielded &&
        (!jamZone || zoneForNode(node) === jamZone),
    );
    const target =
      eligible.find((node) => signalPath.includes(node.id)) ?? eligible[0];
    if (target) faultTarget = target.id;
    else if (!jamZone && !run.topology.nodes.some((node) => !node.fixed)) {
      raw++;
      incomingTerms.push({ label: "Exposed backbone · no devices", amount: 1 });
    }
  }
  if (independent && separatedCircuits(run, candidates))
    shields.push({ label: "Separated circuits · north + south", amount: 2 });

  if (run.block > 0)
    shields.push({ label: "Block this turn", amount: run.block });
  if (signalPath.length && roleInPath(signalPath, run.topology, "firewall")) {
    if (intent?.kind === "breach")
      shields.push({ label: "Firewall vs breach", amount: 3 });
    else if (intent?.kind === "strike")
      shields.push({ label: "Firewall vs strike", amount: 1 });
  }
  if (
    raw > sumTerms(shields) &&
    run.relics.includes("shield-array") &&
    !run.shieldArrayUsed
  )
    shields.push({
      label: "Shield Array (once per battle)",
      amount: Math.min(4, raw - sumTerms(shields)),
    });
  return {
    signalPath,
    zoneThreat: lethal ? null : zoneThreat,
    hazardZone: lethal ? null : hazardZone,
    enemyHealing:
      !lethal && run.enemy?.id === "leech" && packetDamage === 0
        ? Math.min(3, run.enemy.maxHp - run.enemy.hp)
        : 0,
    rawPacketDamage,
    incomingTerms: lethal ? [] : incomingTerms,
    traitDescription: run.enemy ? ENEMIES[run.enemy.id].trait : "",
    alternatePath: pair
      ? (candidates.find((path) =>
          path
            .slice(1, -1)
            .every((id) => !signalPath.slice(1, -1).includes(id)),
        ) ?? [])
      : [],
    packetDamage,
    damageTerms: terms,
    shield: sumTerms(shields),
    shieldTerms: shields,
    incoming: lethal ? 0 : Math.max(0, raw - sumTerms(shields)),
    incomingRaw: lethal ? 0 : raw,
    intent: intent
      ? {
          ...intent,
          ...(faultTarget && !lethal ? { target: faultTarget } : {}),
        }
      : null,
    lethal,
    independent,
    faultTarget: lethal ? null : faultTarget,
  };
}

export function endTurn(run: RunState): TurnResult {
  if (run.phase !== "battle" || !run.enemy)
    throw new Error("No active encounter.");
  const preview = combatPreview(run);
  const result: TurnResult = {
    signalPath: preview.signalPath,
    alternatePath: preview.alternatePath,
    packetDamage: preview.packetDamage,
    enemyAction: "",
    integrityDamage: 0,
    defeated: false,
    lost: false,
  };
  run.enemy.hp = Math.max(0, run.enemy.hp - preview.packetDamage);
  run.score += preview.packetDamage * 10;
  log(
    run,
    preview.packetDamage
      ? `Signal dealt ${preview.packetDamage}: ${preview.damageTerms.map((term) => `${term.label} ${term.amount >= 0 ? "+" : ""}${term.amount}`).join(" · ")}.`
      : preview.signalPath.length ? "The live signal was absorbed by armor or hostile fields. No damage." : "No live router route. No signal damage.",
  );
  if (preview.lethal) {
    result.defeated = true;
    run.score += 100 + run.integrity * 5;
    if (run.relics.includes("repair-drone"))
      run.integrity = Math.min(run.maxIntegrity, run.integrity + 2);
    run.phase = "reward";
    run.cardRewards = cardRewards(run);
    run.block = 0;
    run.packetBoost = 0;
    run.zoneEffects = [];
    log(run, `${run.enemy.name} neutralized. Its intent is cancelled.`);
    return result;
  }
  if (preview.enemyHealing) {
    run.enemy.hp = Math.min(
      run.enemy.maxHp,
      run.enemy.hp + preview.enemyHealing,
    );
    log(
      run,
      `Packet Leech absorbed the lost transmission and restored ${preview.enemyHealing} health.`,
    );
  }
  run.faultNode = null;
  run.faultLink = null;
  run.zoneEffects = run.zoneEffects.map(field => ({ ...field, turns: field.turns - 1 })).filter(field => field.turns > 0);
  if (preview.zoneThreat) installField(run, preview.zoneThreat);
  const intent = preview.intent!;
  if (intent.kind === "sever") run.faultLink = preview.faultTarget;
  if (intent.kind === "jam") run.faultNode = preview.faultTarget;
  result.integrityDamage = preview.incoming;
  run.integrity = Math.max(0, run.integrity - preview.incoming);
  if (preview.shieldTerms.some((term) => term.label.startsWith("Shield Array")))
    run.shieldArrayUsed = true;
  const fault = preview.faultTarget
    ? `${intent.kind === "jam" ? "jammed" : "severed"} ${preview.faultTarget.toUpperCase().replace("::", " ↔ ")}; `
    : "";
  result.enemyAction = `${run.enemy.name} ${preview.zoneThreat ? `cast ${FIELD_RULES[preview.zoneThreat.kind].name} on ${preview.zoneThreat.zone.toUpperCase()} for 2 turns; ` : ""}${fault}dealt ${preview.incoming} integrity damage${preview.shield ? ` (${Math.min(preview.incomingRaw, preview.shield)} blocked)` : ""}.`;
  log(run, result.enemyAction);
  run.enemy.turn++;
  run.turn++;
  run.energy =
    5 +
    run.reserveEnergy +
    (run.relics.includes("reserve-cell") ? Math.min(2, run.energy) : 0);
  run.reserveEnergy = 0;
  run.block = run.relics.includes("grounded-core") ? 2 : 0;
  run.packetBoost = 0;
  run.cardsPlayed = 0;
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
  run.zoneEffects = [];
  run.faultNode = null;
  run.faultLink = null;
  if (run.floor >= 7 && run.stage < STAGES.length - 1) {
    run.stage++;
    run.floor = 0;
    run.map = createMap(run.stage);
    run.lastRoom = null;
    const restored = Math.min(6, run.maxIntegrity - run.integrity);
    run.integrity += restored;
    log(run, `${STAGES[run.stage - 1].name} restored. +${restored} integrity. Enter ${STAGES[run.stage].name}.`);
    run.phase = "map";
  } else run.phase = run.floor >= 7 ? "won" : "map";
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
  if (room?.type === "elite" || (room?.type === "boss" && run.stage < STAGES.length - 1)) {
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

/** Removes one card as the single maintenance service. Keep a reliable basic route. */
export function removeDeckCard(run: RunState, index: number): ActionResult {
  if (run.phase !== "forge")
    return {
      ok: false,
      message: "Card removal is available at maintenance bays.",
    };
  const card = run.deck[index];
  if (!card) return { ok: false, message: "Choose a card from your deck." };
  if (run.deck.length <= 10)
    return { ok: false, message: "Keep at least 10 cards in your deck." };
  if (
    (card === "router" &&
      run.deck.filter((id) => id === "router").length <= 1) ||
    (card === "fiber" && run.deck.filter((id) => id === "fiber").length <= 2)
  )
    return {
      ok: false,
      message:
        "Keep one Core Router and two Optic Fibers for a reliable opening route.",
    };
  run.deck.splice(index, 1);
  log(run, `${CARDS[card].name} removed from the deck.`);
  advanceRoom(run);
  return { ok: true, message: `${CARDS[card].name} removed.` };
}
