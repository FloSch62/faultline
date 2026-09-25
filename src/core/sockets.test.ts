/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Socket budget (design 12.2 "Table crowding", 15.3 phase 2): every terrain layout the
 * generator can produce, with the installation cap (four) and the wreck cap (six) filled,
 * still leaves at least eight legal sockets for the player's hardware.
 *
 * A legal socket is one auto-deploy can still fill (rule 60 order, isBlocked): devices are
 * counted one after another, each blocking its neighbours, exactly as repeated auto-place does. */
import assert from "node:assert/strict";
import test from "node:test";
import { RULES } from "./cards.ts";
import { AUTO_SOCKETS, bandSocket, isBlocked, reachSocket } from "./combat/board.ts";
import { newExpedition } from "./expedition.ts";
import { addWreck, terrainFor, type TerrainLayout } from "./terrain.ts";
import type { Installation, RunState } from "./types.ts";

const MIN_LEGAL = 8;
const STAGES = 3, SEEDS = 3000, FLOORS = 7, LANES = 4;

/** Every distinct layout (wrecks + salvage device) the engine's call can generate:
 * beginBattle calls terrainFor(run.seed, run.stage, room.id, firstFight). */
function layouts(): TerrainLayout[] {
  const found = new Map<string, TerrainLayout>();
  for (let stage = 0; stage < STAGES; stage++)
    for (let seed = 1; seed <= SEEDS; seed++)
      for (let floor = 0; floor < FLOORS; floor++)
        for (let lane = 0; lane < LANES; lane++) {
          const layout = terrainFor(seed * 7919, stage, `${floor}-${lane}`, false);
          const key = JSON.stringify([layout.terrain.debris, layout.salvage && [layout.salvage.x, layout.salvage.z]]);
          if (!found.has(key)) found.set(key, layout);
        }
  return [...found.values()];
}
const ALL = layouts();

const BASE = newExpedition("architect", 0x50c7e7).run;
/** A bare table on that terrain: terminals, the terrain's salvage device, no installations. */
function table(layout: TerrainLayout): RunState {
  const run: RunState = { ...BASE };
  run.topology = { nodes: BASE.topology.nodes.filter(node => node.fixed).map(node => ({ ...node })), links: [] };
  if (layout.salvage) run.topology.nodes.push({ ...layout.salvage, id: "salvage1" });
  run.terrain = structuredClone(layout.terrain);
  run.installations = [];
  return run;
}
/** Devices auto-deploy could still place one after another (each blocks its neighbours). */
function legalSockets(run: RunState): number {
  const nodes = run.topology.nodes, before = nodes.length;
  let placed = 0;
  for (const { x, z } of AUTO_SOCKETS)
    if (!isBlocked(run, x, z)) nodes.push({ id: `probe${placed++}`, role: "router", x, z });
  nodes.length = before;
  return placed;
}
/** Fill the wreck cap as breakdowns do: a device deployed on the next auto socket broke there. */
function fillWrecks(run: RunState) {
  while (run.terrain!.debris.length < RULES.wreckCap) {
    const socket = AUTO_SOCKETS.find(({ x, z }) => !isBlocked(run, x, z));
    assert.ok(socket, "a free socket for the next breakdown");
    assert.ok(addWreck(run.terrain!, { ...socket, fresh: true }));
  }
}
function plant(run: RunState, socket: { x: number; z: number } | null) {
  assert.ok(socket, "the installation finds a socket");
  const item: Installation = { id: `tap${run.installations.length + 1}`, kind: "tap", ...socket, integrity: 1, activeFrom: 0, owner: "h1" };
  run.installations.push(item);
}
/** Reach installations aim at the primary router: the classic opener's centre router. */
function reachAtRouter(run: RunState) {
  run.topology.nodes.push({ id: "router-target", role: "router", x: 0, z: 0 });
  const socket = reachSocket(run, { x: 0, z: 0 }) ?? bandSocket(run);
  run.topology.nodes.pop();
  return socket;
}

test("the socket test enumerates every terrain layout the generator can produce", () => {
  // Wreck spots are drawn without replacement from one list; every subset of every size must appear.
  const spots = new Set(ALL.flatMap(layout => layout.terrain.debris.map(({ x, z }) => `${x},${z}`)));
  const sizes = ALL.map(layout => layout.terrain.debris.length);
  const choose = (n: number, k: number): number => k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k;
  let subsets = 0;
  for (let k = Math.min(...sizes); k <= Math.max(...sizes); k++) subsets += choose(spots.size, k);
  const sets = new Set(ALL.map(layout => layout.terrain.debris.map(({ x, z }) => `${x},${z}`).sort().join(" ")));
  assert.equal(sets.size, subsets, `${sets.size} wreck sets of ${subsets} possible from ${spots.size} spots`);
  assert.ok(Math.max(...sizes) <= RULES.wreckCap);
  assert.ok(ALL.some(layout => layout.salvage), "salvage layouts are part of the enumeration");
});

test(`four installations and six wrecks leave at least ${MIN_LEGAL} legal sockets on every terrain layout`, () => {
  const placements: Record<string, (run: RunState, index: number) => { x: number; z: number } | null> = {
    "band sockets (Siphon Tap, Anchor)": run => bandSocket(run),
    "reach sockets at the primary router (Jammer, Spike, Breaker Charge)": run => reachAtRouter(run),
    "two band, two reach": (run, index) => index % 2 ? reachAtRouter(run) : bandSocket(run),
  };
  let fewest = Infinity;
  for (const [name, socketFor] of Object.entries(placements))
    for (const layout of ALL)
      for (const wrecksFirst of [true, false]) {
        const run = table(layout);
        if (wrecksFirst) fillWrecks(run);
        for (let i = 0; i < RULES.maxInstallations; i++) plant(run, socketFor(run, i));
        if (!wrecksFirst) fillWrecks(run);
        assert.equal(run.installations.length, RULES.maxInstallations);
        assert.equal(run.terrain!.debris.length, RULES.wreckCap);
        const legal = legalSockets(run);
        fewest = Math.min(fewest, legal);
        assert.ok(legal >= MIN_LEGAL, `${name}, wrecks ${wrecksFirst ? "first" : "last"}: ${legal} legal sockets on ${JSON.stringify(run.terrain!.debris)} with installations ${JSON.stringify(run.installations.map(({ x, z }) => [x, z]))}${layout.salvage ? ` and salvage at ${layout.salvage.x},${layout.salvage.z}` : ""}`);
      }
  assert.ok(fewest >= MIN_LEGAL);
});

test(`even wrecks and installations that block the most sockets leave at least ${MIN_LEGAL}`, () => {
  // Worst case per wreck set: each extra wreck and each installation lands, one at a time, on the
  // auto socket that removes the most legal sockets (a greedy adversary, stricter than any rule).
  const bySet = new Map<string, TerrainLayout>();
  for (const layout of ALL) {
    const key = layout.terrain.debris.map(({ x, z }) => `${x},${z}`).sort().join(" ");
    if (!bySet.has(key) || (layout.salvage && !bySet.get(key)!.salvage)) bySet.set(key, layout);
  }
  for (const layout of bySet.values()) {
    const run = table(layout);
    const steps = RULES.wreckCap - run.terrain!.debris.length + RULES.maxInstallations;
    for (let step = 0; step < steps; step++) {
      const wreck = run.terrain!.debris.length < RULES.wreckCap;
      let worst: { x: number; z: number } | null = null, fewest = Infinity;
      for (const socket of AUTO_SOCKETS) {
        if (isBlocked(run, socket.x, socket.z)) continue;
        if (wreck) run.terrain!.debris.push(socket); else plant(run, socket);
        const legal = legalSockets(run);
        if (wreck) run.terrain!.debris.pop(); else run.installations.pop();
        if (legal < fewest) [fewest, worst] = [legal, socket];
      }
      if (wreck) run.terrain!.debris.push(worst!); else plant(run, worst);
    }
    const legal = legalSockets(run);
    assert.ok(legal >= MIN_LEGAL, `${legal} legal sockets on ${JSON.stringify(run.terrain!.debris)} with installations ${JSON.stringify(run.installations.map(({ x, z }) => [x, z]))}`);
  }
});
