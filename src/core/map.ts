import type { DesignationId, MapRoom, RoomType, RunState } from "./types.ts";
import { STAGES } from "./stages.ts";
import { ascends, healthMultiplier } from "./ascension.ts";
import { RULES } from "./cards.ts";
import {
  DESIGNATIONS, PACKS, designationsCompatible, eligibleDesignations, type PackTemplate,
} from "./enemies.ts";

/** Rooms where a hostile is fought. */
export const FIGHT_ROOMS: readonly RoomType[] = ["battle", "elite", "boss"];
/** Recovery and purchase rooms. They never follow each other along a path. */
export const REST_ROOMS: readonly RoomType[] = ["forge", "cache", "shop"];

/** Floor templates. Rest rooms appear only on floors 2 and 5, so no path can
 * chain them. Floor 1 always holds an Unknown signal; floor 4 sometimes adds a
 * second one when every path still crosses at least four fights. */
const FLOORS: RoomType[][] = [
  ["battle", "battle", "battle"],
  ["battle", "event", "battle"],
  ["forge", "battle", "shop"],
  ["elite", "battle", "elite"],
  ["battle", "battle", "battle"],
  ["forge", "elite", "cache"],
  ["boss"],
];
export const MIN_FIGHTS_PER_PATH = 4;

function generator(seed: number, stage: number) {
  let state = (seed ^ Math.imul(stage + 1, 0x85ebca6b)) >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/** Fewest fights on any path from the first floor to the guardian. */
export function minimumFights(map: MapRoom[]): number {
  const best = new Map<string, number>();
  for (let floor = 0; floor <= 6; floor++) {
    for (const room of map.filter(item => item.floor === floor)) {
      const previous = map.filter(from => connectsTo(from, room));
      const before = floor === 0 || !previous.length ? 0 : Math.min(...previous.map(from => best.get(from.id) ?? Infinity));
      best.set(room.id, before + Number(FIGHT_ROOMS.includes(room.type)));
    }
  }
  return Math.min(...map.filter(room => room.floor === 6).map(room => best.get(room.id) ?? Infinity));
}

/** The chart for one stage. Every roll (layout, hostiles, packs, designations and the
 * reinforced elites) comes from a local generator seeded by seed + stage, so reloads
 * and card choices never change it. The v4 rolls run after the v3 ones, so the v3
 * layout and hostile streams are unchanged. Pass the expedition's ascension: level 9
 * raises pack frequency, levels 7 and 10 add second designations. */
export function createMap(stage = 0, seed = 1, ascension = 0): MapRoom[] {
  const random = generator(seed, stage);
  const region = STAGES[stage];
  const templates = FLOORS.map(row => [...row]);
  // A second Unknown signal on floor 4 is decided up front so the random stream
  // stays stable; it is withdrawn if it could let a path skip too many fights.
  const secondEvent = random() < 0.5;
  const map = templates.flatMap((template, floor) => {
    const row = [...template];
    for (let i = row.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [row[i], row[j]] = [row[j], row[i]];
    }
    const encountered = new Set<string>();
    return row.map((type, i): MapRoom => {
      const lane = floor === 6 ? 1 : i;
      const pool = type === "boss" ? [region.boss] : type === "elite" ? region.elites : region.encounters;
      const available = pool.filter(id => !encountered.has(id));
      const enemyId = FIGHT_ROOMS.includes(type) ? available[Math.floor(random() * available.length)] : undefined;
      if (enemyId) encountered.add(enemyId);
      return { id: `${floor}-${lane}`, floor, lane, type, cleared: false, ...(enemyId ? { enemyId } : {}), exits: [] };
    });
  });
  for (const room of map) {
    if (room.floor === 6) continue;
    if (room.floor === 5) { room.exits = ["6-1"]; continue; }
    // Straight paths guarantee reachability. One visible diagonal permits a
    // deliberate change of course without making every next room available.
    const lanes = [room.lane];
    if (random() > .22) {
      const adjacent = [room.lane - 1, room.lane + 1].filter(lane => lane >= 0 && lane <= 2);
      lanes.push(adjacent[Math.floor(random() * adjacent.length)]);
    }
    room.exits = lanes.sort().map(lane => `${room.floor + 1}-${lane}`);
  }
  if (secondEvent) {
    const lane = Math.floor(random() * 3);
    const room = map.find(item => item.id === `4-${lane}`)!;
    const enemyId = room.enemyId;
    room.type = "event";
    delete room.enemyId;
    if (minimumFights(map) < MIN_FIGHTS_PER_PATH) {
      room.type = "battle";
      room.enemyId = enemyId;
    }
  }
  // ---- v4: packs, designations and the reinforced elites, after every v3 roll.
  for (const room of map) {
    const others = new Set(map.filter(item => item.floor === room.floor && item !== room && item.enemyId).map(item => item.enemyId!));
    rollRoomContents(random, stage, room, ascension, others);
  }
  assignReinforcedElites(map, stage, random);
  return map;
}

export function connectsTo(from: MapRoom, to: MapRoom): boolean {
  return to.floor === from.floor + 1 && (from.exits ? from.exits.includes(to.id) : Math.abs(to.lane - from.lane) <= 1);
}

/** Hostile integrity for a room: the single hostile's health, which a pack shares out
 * (planEncounter). Pass the expedition's ascension to include its health rules.
 * Signal in the Static ("event" rooms) fights at RULES.eventHealthScale of a normal room.
 * v5: the formulas are RULES keys, read live (the balance probe's --rule reaches them):
 * normalHealth / eliteHealth [base, per floor, per stage] and guardianHealth per stage. */
export function encounterHealth(stage: number, room: MapRoom, ascension = 0): number {
  const formula = (key: readonly number[]) => key[0] + room.floor * key[1] + stage * key[2];
  const base = room.type === "boss" ? RULES.guardianHealth[Math.max(0, Math.min(STAGES.length - 1, stage))]
    : room.type === "elite" ? formula(RULES.eliteHealth)
    : formula(RULES.normalHealth);
  const health = Math.round(base * healthMultiplier(room.type, ascension));
  return room.type === "event" ? Math.round(health * RULES.eventHealthScale) : health;
}

export function reachableRooms(run: RunState): MapRoom[] {
  if (run.floor > 6) return [];
  const previous = run.lastRoom ? run.map.find(room => room.id === run.lastRoom) : null;
  return run.map.filter(room => room.floor === run.floor && (!previous || connectsTo(previous, room)));
}

// ---------------------------------------------------------------- v4 · packs and designations

/** Chance that a normal (or Signal in the Static) room holds a pack. */
export function packChance(stage: number, floor: number, ascension = 0): number {
  const base = RULES.packRate[stage] ?? 0;
  if (base <= 0 || (stage === 0 && floor < RULES.packFromFloor)) return 0;
  return Math.min(1, base + (ascends(ascension, "lingeringCorruption") ? RULES.packRateAscensionBonus : 0));
}

/** Chance that a room's leader or single hostile carries a designation (rule 66). */
export function designationChance(stage: number, floor: number, type: RoomType): number {
  const rate = RULES.designationRate[stage] ?? 0;
  if (rate <= 0 || type === "boss") return 0;
  if (type === "elite" && stage >= 1) return 1;
  if (stage === 0 && floor < RULES.designationFromFloor) return 0;
  return rate;
}

/** The pack template a room's hostiles came from, if any. */
export function roomTemplate(stage: number, room: MapRoom): PackTemplate | null {
  if (!room.pack?.length) return null;
  const kind = room.type === "elite" ? "elite" : "battle";
  return PACKS.find(template => template.stage === stage && template.room === kind &&
    template.leader === (room.enemyId ?? null) &&
    template.escorts.length === room.pack!.length && template.escorts.every((id, i) => room.pack![i] === id)) ?? null;
}

function weightedDesignation(random: () => number, pool: DesignationId[]): DesignationId | null {
  const total = pool.reduce((sum, id) => sum + DESIGNATIONS[id].weight, 0);
  if (!pool.length || total <= 0) return null;
  let roll = random() * total;
  for (const id of pool) {
    roll -= DESIGNATIONS[id].weight;
    if (roll < 0) return id;
  }
  return pool[pool.length - 1];
}

/** One designation from the weighted table. A bad designation heavier than the
 * template's headroom falls back to Laden or Salvaged (rule 70). */
export function rollDesignation(random: () => number, eligible: DesignationId[], headroom = Infinity): DesignationId | null {
  const id = weightedDesignation(random, eligible);
  if (!id) return null;
  if (DESIGNATIONS[id].kind === "bad" && DESIGNATIONS[id].threat > headroom) {
    const cargo = eligible.filter(item => DESIGNATIONS[item].kind === "good");
    return cargo.length ? cargo[Math.floor(random() * cargo.length)] : null;
  }
  return id;
}

/** Rolls a fight room's pack (normal rooms by chance, elites from stage II always), then
 * its designations and the interference flag. Mutates the room. `others` holds the
 * hostiles of the floor's other rooms, so a substituted leader never repeats on a floor.
 * Guardian rooms, rest rooms and rooms without a hostile are left untouched. */
export function rollRoomContents(random: () => number, stage: number, room: MapRoom, ascension = 0, others: ReadonlySet<string> = new Set()) {
  if (!["battle", "elite", "event"].includes(room.type) || !room.enemyId) return;
  const elite = room.type === "elite";
  let template: PackTemplate | null = null;
  if (!elite) {
    if (random() < packChance(stage, room.floor, ascension)) {
      const trio = stage >= 2 && random() < RULES.trioShare;
      const shape = PACKS.filter(item => item.stage === stage && item.room === "battle" &&
        (item.leader === null || item.escorts.length === (trio ? 2 : 1)));
      const own = shape.filter(item => item.leader === room.enemyId);
      const fresh = shape.filter(item => item.leader === null || !others.has(item.leader));
      const candidates = own.length ? own : fresh.length ? fresh : shape;
      template = candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
    }
  } else if (stage >= 1 && (RULES.packRate[stage] ?? 0) > 0) {
    template = PACKS.find(item => item.stage === stage && item.room === "elite" && item.leader === room.enemyId) ?? null;
  }
  if (template) {
    room.pack = [...template.escorts];
    if (template.leader) room.enemyId = template.leader;
    else delete room.enemyId;
  }
  // Duos carry no designation: only a leader or a single hostile rolls one.
  const leader = room.enemyId;
  if (!leader) return;
  const chance = designationChance(stage, room.floor, room.type);
  if (!(random() < chance)) return;
  const trio = (template?.escorts.length ?? 0) >= 2;
  const eligible = eligibleDesignations(leader, stage, !trio);
  const first = rollDesignation(random, eligible, template ? template.headroom : Infinity);
  if (!first) return;
  const designations: DesignationId[] = [first];
  // Ascension 7: elites carry a second; ascension 10: normals may. The second is never a
  // repeat, never Stoked with Shedding, never a second good one, and ignores the A0 budget.
  // The rates are RULES.eliteSecondDesignation / normalSecondDesignation; a sure elite draws nothing.
  const eliteRate = RULES.eliteSecondDesignation;
  const second = (elite && ascends(ascension, "eliteSecondDesignation") && (eliteRate >= 1 || random() < eliteRate))
    || (!elite && ascends(ascension, "lastSignal") && random() < chance * RULES.normalSecondDesignation);
  if (second) {
    const pick = weightedDesignation(random, eligible.filter(id => designationsCompatible(first, id)));
    if (pick) designations.push(pick);
  }
  room.designations = designations;
  // Interference hides the ribbon until the entrance line. Spiteful is never hidden.
  if (!designations.includes("spiteful") && random() < (RULES.hiddenShare[stage] ?? 0)) room.designationHidden = true;
}

/** Rooms from which `room` can be reached. */
function ancestors(map: MapRoom[], room: MapRoom): MapRoom[] {
  const found = new Set<MapRoom>();
  const queue = [room];
  while (queue.length) {
    const next = queue.shift()!;
    for (const from of map) if (connectsTo(from, next) && !found.has(from)) { found.add(from); queue.push(from); }
  }
  return [...found];
}

/** Elite reinforcements are decided by the chart, floor by floor: an elite is reinforced
 * (stage III always, stage II at the stage's rate) unless a path through it already
 * crosses a reinforced elite. No path ever crosses two in one stage. */
export function assignReinforcedElites(map: MapRoom[], stage: number, random: () => number) {
  const rate = RULES.reinforcementRate[stage] ?? 0;
  if (rate <= 0) return;
  for (let floor = 0; floor <= 6; floor++) {
    for (const room of map.filter(item => item.floor === floor && item.type === "elite").sort((a, b) => a.lane - b.lane)) {
      if (ancestors(map, room).some(item => item.reinforced)) continue;
      if (stage >= 2 || random() < rate) room.reinforced = true;
    }
  }
}
