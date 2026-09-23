import type { MapRoom, RoomType, RunState } from "./types.ts";
import { STAGES } from "./stages.ts";
import { healthMultiplier } from "./ascension.ts";

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

export function createMap(stage = 0, seed = 1): MapRoom[] {
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
  return map;
}

export function connectsTo(from: MapRoom, to: MapRoom): boolean {
  return to.floor === from.floor + 1 && (from.exits ? from.exits.includes(to.id) : Math.abs(to.lane - from.lane) <= 1);
}

/** Hostile integrity for a room. Pass the expedition's ascension to include its health rules. */
export function encounterHealth(stage: number, room: MapRoom, ascension = 0): number {
  const base = room.type === "boss" ? STAGES[stage].bossHp
    : room.type === "elite" ? 30 + room.floor * 2 + stage * 10
    : 16 + room.floor * 5 + stage * 13;
  return Math.round(base * healthMultiplier(room.type, ascension));
}

export function reachableRooms(run: RunState): MapRoom[] {
  if (run.floor > 6) return [];
  const previous = run.lastRoom ? run.map.find(room => room.id === run.lastRoom) : null;
  return run.map.filter(room => room.floor === run.floor && (!previous || connectsTo(previous, room)));
}
