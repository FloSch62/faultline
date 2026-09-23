import type { MapRoom, RoomType, RunState } from "./types.ts";
import { STAGES } from "./stages.ts";

/** Each route commits to at least five fights. Recovery and card caches compete
 * in the two breathing spaces; there is no chain of free upgrades to the boss. */
const FLOORS: RoomType[][] = [
  ["battle", "battle", "battle"],
  ["battle", "elite", "battle"],
  ["forge", "battle", "cache"],
  ["elite", "battle", "elite"],
  ["battle", "battle", "battle"],
  ["forge", "elite", "cache"],
  ["boss"],
];

export function createMap(stage = 0, seed = 1): MapRoom[] {
  let state = (seed ^ Math.imul(stage + 1, 0x85ebca6b)) >>> 0 || 1;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  const region = STAGES[stage];
  const map = FLOORS.flatMap((template, floor) => {
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
      const enemyId = ["battle", "elite", "boss"].includes(type) ? available[Math.floor(random() * available.length)] : undefined;
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
  return map;
}

export function connectsTo(from: MapRoom, to: MapRoom): boolean {
  return to.floor === from.floor + 1 && (from.exits ? from.exits.includes(to.id) : Math.abs(to.lane - from.lane) <= 1);
}

export function encounterHealth(stage: number, room: MapRoom): number {
  return room.type === "boss" ? STAGES[stage].bossHp
    : room.type === "elite" ? 30 + room.floor * 2 + stage * 10
    : 10 + room.floor * 3 + stage * 8;
}

export function reachableRooms(run: RunState): MapRoom[] {
  if (run.floor > 6) return [];
  const previous = run.lastRoom ? run.map.find(room => room.id === run.lastRoom) : null;
  return run.map.filter(room => room.floor === run.floor && (!previous || connectsTo(previous, room)));
}
