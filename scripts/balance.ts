/** Seeded smoke-balance harness; bots are regression probes, not human playtests.
 * Run: node --experimental-strip-types scripts/balance.ts [seeds-per-profile=100]
 */
import { CARDS } from "../src/core/cards.ts";
import { newExpedition, type Archetype } from "../src/core/expedition.ts";
import { reachableRooms } from "../src/core/map.ts";
import { canLink } from "../src/core/graph.ts";
import {
  chooseRoom,
  chooseCardReward,
  chooseForge,
  chooseRelic,
  playInstant,
  playNode,
  playGround,
  playLink,
  playZone,
  ZONES,
  costFor,
  combatPreview,
  endTurn,
  relocateNode,
  zoneForNode,
} from "../src/core/run.ts";
import type { CardId, RunState } from "../src/core/types.ts";

type Policy = "careless" | "adaptive" | "aggressive";
const seeds = Math.max(1, Number(process.argv[2]) || 100);
const eliteRoute = process.argv.includes("--elite");
const build =
  process.argv.find((arg) => arg.startsWith("--build="))?.split("=")[1] ??
  "balanced";
const sockets = [
  { x: 0, z: 0 },
  { x: 0, z: -2.4 },
  { x: 0, z: 2.4 },
  { x: -2.5, z: 2.4 },
  { x: 2.5, z: 2.4 },
  { x: -2.5, z: -2.4 },
  { x: 2.5, z: -2.4 },
];
const balancedPriorities: CardId[] = [
  "clabernetes",
  "containerlab",
  "startup-config",
  "resonance-field",
  "aegis-field",
  "purge-field",
  "null-field",
  "wireshark",
  "zero-day",
  "protocol",
  "guard",
  "rebuild",
  "pulse",
  "emergency",
  "surge",
  "mirror",
  "duplex",
  "reroute",
  "barrier",
  "armored-fiber",
  "firmware",
  "capacitor",
  "conduit",
  "crosslink",
  "diagnostic",
  "containerlab",
  "compression",
  "bastion",
  "relay",
  "salvage",
  "shield",
  "hardened-router",
];
const buildPriorities: Record<string, CardId[]> = {
  mesh: [
    "clabernetes",
    "rebuild",
    "armored-fiber",
    "conduit",
    "mirror",
    "duplex",
    "compression",
    "relay",
  ],
  fortress: [
    "bastion",
    "barrier",
    "protocol",
    "emergency",
    "guard",
    "hardened-router",
    "capacitor",
  ],
  burst: [
    "zero-day",
    "pulse",
    "surge",
    "firmware",
    "diagnostic",
    "wireshark",
    "containerlab",
    "crosslink",
  ],
};
const priorities = [...(buildPriorities[build] ?? []), ...balancedPriorities];

function indexOf(r: RunState, id: CardId) {
  const index = r.hand.indexOf(id);
  return index >= 0 && costFor(r, index) <= r.energy ? index : -1;
}
function instant(r: RunState, id: CardId) {
  const index = indexOf(r, id);
  return index >= 0 && playInstant(r, index).ok;
}
function nodeCard(r: RunState, card: CardId, id: string) {
  const index = indexOf(r, card);
  return index >= 0 && playNode(r, index, id).ok;
}
function turn(r: RunState, policy: Policy) {
  for (let action = 0; action < 40; action++) {
    const p = combatPreview(r);
    if (p.lethal) return;
    if (
      !r.topology.nodes.some((n) => n.role === "router") &&
      instant(r, "containerlab")
    )
      continue;
    // Every policy builds the guaranteed manual opener. A careless policy then
    // ignores faults, rewards, upgrades and defense rather than doing nothing.
    if (!r.topology.nodes.some((n) => n.role === "router")) {
      const index = indexOf(r, "router");
      if (index >= 0 && playGround(r, index, 0, 0).ok) continue;
    }
    const firstRouter = r.topology.nodes.find((n) => n.role === "router");
    if (firstRouter) {
      const missing = ["alpha", "omega"].find((end) =>
        canLink(r.topology, firstRouter.id, end),
      );
      const cable = r.hand.findIndex(
        (id, i) => CARDS[id].target === "link" && costFor(r, i) <= r.energy,
      );
      if (
        missing &&
        cable >= 0 &&
        playLink(r, cable, firstRouter.id, missing).ok
      )
        continue;
    }
    if (policy === "careless") return;
    // Evaluate field cards with the same forecast as the player. Avoid replacing
    // an existing allied field unless this transmission improves.
    const fieldOptions = r.hand.flatMap((id,index) => CARDS[id].target === "zone" && costFor(r,index) <= r.energy ? ZONES.map(zone => {
      const copy = structuredClone(r);
      const result = playZone(copy,index,zone);
      const after = combatPreview(copy);
      const benefit = result.ok ? after.packetDamage - p.packetDamage + (policy === "adaptive" ? (p.incoming - after.incoming) * 2 : 0) : -1;
      return { index, zone, benefit };
    }) : []).sort((a,b)=>b.benefit-a.benefit);
    if (fieldOptions[0]?.benefit > 0 && playZone(r,fieldOptions[0].index,fieldOptions[0].zone).ok) continue;
    if (r.energy <= 3 && instant(r, "surge")) continue;
    if (r.hand.length <= 7 && instant(r, "inspect")) continue;
    if (r.maxIntegrity - r.integrity >= 3 && instant(r, "emergency")) continue;
    if (!p.packetDamage && (r.faultNode || r.faultLink)) {
      if (
        instant(r, "reroute") ||
        instant(r, "protocol") ||
        instant(r, "patch")
      )
        continue;
    }
    const router = r.topology.nodes.find(
      (n) =>
        n.role === "router" &&
        r.topology.links.filter((l) => l.a === n.id || l.b === n.id).length >=
          2,
    );
    if (!p.independent && router && nodeCard(r, "clabernetes", router.id))
      continue;
    if (p.packetDamage && !p.independent && instant(r, "rebuild")) continue;
    if (p.independent && instant(r, "mirror")) continue;
    if (
      policy === "adaptive" &&
      p.independent &&
      !p.shieldTerms.some((term) => term.label.startsWith("Separated")) &&
      r.energy > 0
    ) {
      const centered = r.topology.nodes.find(
        (node) => node.role === "router" && zoneForNode(node) === "center",
      );
      if (centered) {
        const z = r.topology.nodes.some(
          (node) => node.role === "router" && zoneForNode(node) === "north",
        )
          ? 2.4
          : -2.4;
        if (relocateNode(r, centered.id, 0, z).ok) continue;
      }
    }
    if (
      policy === "adaptive" &&
      p.hazardZone &&
      p.faultTarget &&
      r.energy > 0
    ) {
      const endangered = r.topology.nodes.find(
        (node) => node.id === p.faultTarget,
      );
      const safe = sockets.find(
        (socket) =>
          zoneForNode(socket) !== p.hazardZone &&
          r.topology.nodes.every(
            (other) =>
              other.id === endangered?.id ||
              Math.hypot(other.x - socket.x, other.z - socket.z) >= 1.55,
          ),
      );
      if (
        endangered &&
        safe &&
        relocateNode(r, endangered.id, safe.x, safe.z).ok
      )
        continue;
    }
    if (p.incoming > 0 && policy === "adaptive") {
      if (
        instant(r, "guard") ||
        instant(r, "barrier") ||
        instant(r, "protocol") ||
        instant(r, "capacitor")
      )
        continue;
    }
    if (
      router &&
      !router.configured &&
      nodeCard(r, "startup-config", router.id)
    )
      continue;
    if (router && !router.upgraded && nodeCard(r, "firmware", router.id))
      continue;
    const amplifier = r.topology.nodes.find(
      (n) => n.role === "switch" && !n.amplified && p.signalPath.includes(n.id),
    );
    if (amplifier && nodeCard(r, "compression", amplifier.id)) continue;
    if (p.packetDamage && r.hand.length <= 8 && instant(r, "wireshark"))
      continue;
    if (p.packetDamage && (instant(r, "zero-day") || instant(r, "pulse")))
      continue;
    if (
      router &&
      !router.shielded &&
      p.intent?.kind === "jam" &&
      nodeCard(r, "shield", router.id)
    )
      continue;
    if (r.energy >= 2 && r.hand.length <= 5 && instant(r, "diagnostic"))
      continue;
    // Build one purposeful extra route or a firewall branch; avoid filling sockets with dead hardware.
    const linkIndices = r.hand
      .map((id, i) => (CARDS[id].target === "link" ? i : -1))
      .filter((i) => i >= 0);
    const idle = r.topology.nodes.find(
      (n) =>
        !n.fixed &&
        r.topology.links.filter((l) => l.a === n.id || l.b === n.id).length < 2,
    );
    let linked = false;
    if (idle && linkIndices.length) {
      const ends =
        idle.role === "router"
          ? ["alpha", "omega"]
          : ["alpha", router?.id ?? "omega"];
      for (const target of ends) {
        if (!canLink(r.topology, idle.id, target)) continue;
        const index = linkIndices.find((i) => costFor(r, i) <= r.energy);
        if (index !== undefined && playLink(r, index, idle.id, target).ok) {
          linked = true;
          break;
        }
      }
    }
    if (linked) continue;
    if (!idle && linkIndices.length >= 2 && r.topology.nodes.length < 6) {
      const desired: CardId[] =
        p.independent ||
        (r.enemy?.id === "sentinel" &&
          !r.topology.nodes.some((node) => node.role === "firewall"))
          ? ["bastion", "firewall", "linux-bridge", "relay", "switch"]
          : ["hardened-router", "router"];
      const hardware = desired
        .map((card) => indexOf(r, card))
        .find((i) => i >= 0 && costFor(r, i) + 2 <= r.energy);
      const socket = sockets.find((s) =>
        r.topology.nodes.every((n) => Math.hypot(n.x - s.x, n.z - s.z) >= 1.55),
      );
      if (
        hardware !== undefined &&
        socket &&
        playGround(r, hardware, socket.x, socket.z).ok
      )
        continue;
    }
    if (
      p.incoming > 0 &&
      (instant(r, "guard") || instant(r, "protocol") || instant(r, "barrier"))
    )
      continue;
    if (instant(r, "capacitor")) continue;
    return;
  }
  throw new Error("Action limit exceeded: possible draw/energy loop");
}

const output: Record<string, unknown>[] = [];
for (const archetype of ["architect", "warden", "ghost"] as Archetype[]) {
  for (const policy of ["careless", "aggressive", "adaptive"] as Policy[]) {
    let wins = 0,
      reachedBoss = 0,
      turns = 0,
      battles = 0,
      winIntegrity = 0,
      defeatedAt = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = newExpedition(archetype, Math.imul(seed, 0x9e3779b1) >>> 0).run;
      let moves = 0;
      while (r.phase !== "won" && r.phase !== "lost" && moves++ < 600) {
        if (r.phase === "map") {
          const rooms = reachableRooms(r);
          rooms.sort((a, b) => {
            const score = (type: string) =>
              eliteRoute && type === "elite"
                ? 6
                : type === "cache"
                  ? 5
                  : type === "forge"
                    ? 4
                    : type === "battle"
                      ? 3
                      : type === "elite"
                        ? 2
                        : 1;
            return (
              score(b.type) - score(a.type) ||
              Math.abs(a.lane - 1) - Math.abs(b.lane - 1)
            );
          });
          chooseRoom(r, rooms[0].id);
          if (String(r.phase) === "battle") {
            battles++;
            if (r.floor === 6) reachedBoss++;
          }
        } else if (r.phase === "battle") {
          turn(r, policy);
          endTurn(r);
          turns++;
        } else if (r.phase === "reward") {
          const best = [...r.cardRewards].sort(
            (a, b) =>
              (priorities.indexOf(a) < 0 ? 99 : priorities.indexOf(a)) -
              (priorities.indexOf(b) < 0 ? 99 : priorities.indexOf(b)),
          )[0];
          chooseCardReward(r, policy === "careless" ? null : best);
        } else if (r.phase === "relic") {
          const preference = [
            ...(build === "mesh"
              ? ["parallel-core"]
              : build === "fortress"
                ? ["grounded-core", "repair-drone"]
                : build === "burst"
                  ? ["deep-cache", "reserve-cell"]
                  : []),
            "grounded-core",
            "repair-drone",
            "parallel-core",
            "deep-cache",
            "reserve-cell",
            "cold-start",
            "hot-swap",
            "shield-array",
            "packet-lens",
          ];
          chooseRelic(
            r,
            [...r.relicRewards].sort(
              (a, b) => preference.indexOf(a) - preference.indexOf(b),
            )[0],
          );
        } else if (r.phase === "forge")
          chooseForge(
            r,
            r.maxIntegrity - r.integrity >= 4 ? "repair" : "relic",
          );
        else throw new Error(`Unhandled ${r.phase}`);
      }
      if (moves >= 600) throw new Error("Run did not terminate");
      if (r.phase === "won") {
        wins++;
        winIntegrity += r.integrity;
      } else defeatedAt += r.floor + 1;
    }
    output.push({
      archetype,
      policy,
      build,
      seeds,
      wins,
      winRate: `${Math.round((wins / seeds) * 100)}%`,
      reachedBoss,
      averageTurnsPerBattle: +(turns / battles).toFixed(2),
      averageIntegrityOnWin: wins ? +(winIntegrity / wins).toFixed(1) : 0,
      averageLossSector:
        seeds > wins ? +(defeatedAt / (seeds - wins)).toFixed(1) : 0,
    });
  }
}
console.log(
  JSON.stringify(
    {
      notes: `Deterministic lightweight bots, ${eliteRoute ? "elite" : "safest"} map route. These are regression probes, not a human difficulty estimate.`,
      profiles: output,
    },
    null,
    2,
  ),
);
