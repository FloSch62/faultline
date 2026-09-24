/** Encounter terrain: every fight starts on a different table.
 * Generated from seed + stage + room with a local generator; it never consumes
 * the run's card/threat RNG, so terrain is identical across reloads and choices. */
import { RULES } from "./cards.ts";
import { linkKey } from "./graph.ts";
import type { NetworkNode, Role, Terrain, Topology, Wreck, Zone, ZoneEffect } from "./types.ts";

type Point = { x: number; z: number };

/** Where the straight span a → b passes through a wreck's scorched ring: the
 * span fraction (0–1) of its closest approach, one per wreck crossed. */
export function wreckCrossings(a: Point, b: Point, debris: readonly Point[]): number[] {
  const dx = b.x - a.x, dz = b.z - a.z, span = dx * dx + dz * dz;
  const crossings: number[] = [];
  for (const spot of debris) {
    const t = span ? Math.max(0, Math.min(1, ((spot.x - a.x) * dx + (spot.z - a.z) * dz) / span)) : 0;
    if (Math.hypot(a.x + t * dx - spot.x, a.z + t * dz - spot.z) < RULES.debrisClearance) crossings.push(t);
  }
  return crossings;
}
export function crossesWreckage(a: Point, b: Point, debris: readonly Point[]): boolean {
  return wreckCrossings(a, b, debris).length > 0;
}
/** Unarmored cables that cross wreckage, by link key. Derived from positions,
 * so relocating a device frays or mends its cables at once. */
export function frayedLinks(topology: Topology, terrain: Terrain | null): Set<string> {
  const frayed = new Set<string>();
  if (!terrain?.debris.length) return frayed;
  for (const link of topology.links) {
    if (link.armored) continue;
    const a = topology.nodes.find((node) => node.id === link.a), b = topology.nodes.find((node) => node.id === link.b);
    if (a && b && crossesWreckage(a, b, terrain.debris)) frayed.add(linkKey(link.a, link.b));
  }
  return frayed;
}

/** Adds encounter wreckage (breakdown, detonation, COLLAPSE). Terrain, breakdowns and
 * signals share RULES.wreckCap (rules 43 and 61): beyond it the socket is simply freed.
 * Returns whether the wreck landed. */
export function addWreck(terrain: Terrain, wreck: Wreck): boolean {
  if (terrain.debris.length >= RULES.wreckCap) return false;
  terrain.debris.push(wreck);
  return true;
}

export interface TerrainLayout {
  terrain: Terrain;
  salvage: Omit<NetworkNode, "id"> | null;
  field: ZoneEffect | null;
}

function generator(seed: number, stage: number, room: string) {
  let hash = (seed ^ Math.imul(stage + 7, 0x9e3779b1)) >>> 0;
  for (const char of room) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  let state = hash || 0x2545f491;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/** Wreck positions. None sits within 2 units of the centre socket or within
 * reach of the centre line, so the classic ALPHA → centre router → OMEGA opener
 * always exists and never frays, and each band keeps several legal sockets. */
const DEBRIS_SPOTS = [
  { x: -2.5, z: -2.4 }, { x: 2.5, z: -2.4 }, { x: -2.5, z: 2.4 }, { x: 2.5, z: 2.4 },
  { x: 0, z: -3.9 }, { x: 0, z: 3.9 }, { x: -3.6, z: -1.4 }, { x: 3.6, z: 1.4 },
  { x: -1.4, z: 3.3 }, { x: 1.4, z: -3.3 }, { x: -5.4, z: 3.4 }, { x: 5.4, z: -3.4 },
];
const SALVAGE_SPOTS = [
  { x: -2.6, z: 3.4 }, { x: 2.6, z: -3.4 }, { x: -4, z: -3.4 }, { x: 4, z: 3.4 },
  { x: -1.2, z: -2.6 }, { x: 1.2, z: 2.6 },
];
const NAMES: Record<"calm" | "debris" | "crystal" | "interference", readonly (readonly [string, string])[]> = {
  calm: [
    ["Quiet exchange floor", "Clean sockets and a steady hum. Build freely."],
    ["The first bench", "Dust on the rails, nothing else in the way."],
  ],
  debris: [
    ["Collapsed rack row", "Fallen racks block part of the table."],
    ["Flooded conduit", "Standing water shorts out a few sockets."],
    ["Burnt patch panel", "Scorched hardware litters the grid."],
    ["Cable graveyard", "Dead trunks are coiled across old sockets."],
  ],
  crystal: [["Crystal vein", "A resonant seam runs through one band: routes there hit harder."]],
  interference: [["Interference zone", "A standing wave suppresses one band until it is purged."]],
};

export function terrainFor(seed: number, stage: number, roomId: string, firstFight: boolean): TerrainLayout {
  const random = generator(seed, stage, roomId);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  if (firstFight) {
    const [name, description] = pick(NAMES.calm);
    return { terrain: { name, description, debris: [] }, salvage: null, field: null };
  }
  const count = 1 + Math.floor(random() * Math.min(3, 2 + stage));
  const spots = [...DEBRIS_SPOTS];
  const debris: { x: number; z: number }[] = [];
  for (let i = 0; i < count && spots.length; i++) debris.push(spots.splice(Math.floor(random() * spots.length), 1)[0]);
  let salvage: TerrainLayout["salvage"] = null;
  if (random() < 0.5) {
    const roles: Role[] = stage === 0 ? ["switch", "firewall"]
      : stage === 1 ? ["switch", "firewall", "cache", "power"]
        : ["cache", "power", "balancer", "firewall"];
    const free = SALVAGE_SPOTS.filter(spot => debris.every(d => Math.hypot(d.x - spot.x, d.z - spot.z) >= 1.55 + 1.3));
    if (free.length) salvage = { role: pick(roles), ...pick(free), salvage: true };
  }
  let field: ZoneEffect | null = null;
  let [name, description] = pick(NAMES.debris);
  if (random() < 0.3) {
    const zone = pick<Zone>(["north", "center", "south"]);
    const allied = random() < 0.55;
    field = { zone, kind: allied ? "resonance" : "suppression", turns: 3, permanent: true };
    [name, description] = pick(allied ? NAMES.crystal : NAMES.interference);
    description = `${description.replace("one band", `the ${zone} band`)}`;
  }
  return { terrain: { name, description, debris }, salvage, field };
}
