import type { MapRoom, RoomType, RunState } from "./types.ts";

const ROUTES: RoomType[][][] = [[
  ["battle", "battle", "battle"],
  ["battle", "cache", "battle"],
  ["forge", "battle", "cache"],
  ["elite", "battle", "elite"],
  ["battle", "cache", "battle"],
  ["forge", "elite", "forge"],
  ["boss"],
], [
  ["battle", "battle", "battle"],
  ["cache", "battle", "battle"],
  ["battle", "forge", "cache"],
  ["elite", "battle", "elite"],
  ["battle", "cache", "battle"],
  ["forge", "elite", "forge"],
  ["boss"],
], [
  ["battle", "battle", "battle"],
  ["battle", "battle", "cache"],
  ["cache", "forge", "battle"],
  ["elite", "battle", "elite"],
  ["cache", "battle", "cache"],
  ["forge", "elite", "forge"],
  ["boss"],
]];

export function createMap(stage = 0): MapRoom[] {
  return ROUTES[stage].flatMap((row, floor) =>
    row.map((type, index) => ({
      id: `${floor}-${floor === 6 ? 1 : index}`,
      floor,
      lane: floor === 6 ? 1 : index,
      type,
      cleared: false,
    })),
  );
}

export function reachableRooms(run: RunState): MapRoom[] {
  if (run.floor > 6) return [];
  const previous = run.lastRoom
    ? run.map.find((room) => room.id === run.lastRoom)
    : null;
  return run.map.filter(
    (room) =>
      room.floor === run.floor &&
      (!previous || Math.abs(room.lane - previous.lane) <= 1),
  );
}
