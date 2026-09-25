/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Channels made visible: the forecast counts live routes and names the devices where routes merge
 * (and so carry one channel between them). The channel rule itself is unchanged. */
import assert from "node:assert/strict";
import test from "node:test";
import { newExpedition } from "./expedition.ts";
import { mergePoints } from "./graph.ts";
import { chooseRoom, combatPreview } from "./run.ts";
import type { NetworkNode, RunState } from "./types.ts";

function table(): RunState {
  const run = newExpedition("architect", 0x5eed1234).run;
  chooseRoom(run, "0-1");
  run.enemies[0].id = "wraith";
  run.enemies[0].hp = run.enemies[0].maxHp = 200;
  run.enemies[0].turn = 0;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.terrain = null;
  run.installations = [];
  return run;
}
function device(run: RunState, id: string, role: NetworkNode["role"], x = 0, z = 0) {
  run.topology.nodes.push({ id, role, x, z });
}
function wire(run: RunState, ...chain: string[]) {
  for (let i = 1; i < chain.length; i++) run.topology.links.push({ a: chain[i - 1], b: chain[i] });
}
const summary = (run: RunState) => {
  const p = combatPreview(run);
  return { routes: p.routeCount, channels: p.channels, shared: p.sharedDevices };
};

test("two routers behind one switch: 2 routes, 1 channel, the switch is shared by both", () => {
  const r = table();
  device(r, "r1", "router", -2, -2.5);
  device(r, "r2", "router", -2, 2.5);
  device(r, "sw", "switch", 2, 0);
  wire(r, "alpha", "r1", "sw", "omega");
  wire(r, "alpha", "r2", "sw");
  assert.deepEqual(summary(r), { routes: 2, channels: 1, shared: [{ id: "sw", routes: 2 }] });
});

test("two routers with a cable between them: 3 routes, 2 channels, each router carries 2 routes", () => {
  const r = table();
  device(r, "r1", "router", 0, -2.5);
  device(r, "r2", "router", 0, 2.5);
  wire(r, "alpha", "r1", "omega");
  wire(r, "alpha", "r2", "omega");
  wire(r, "r1", "r2");
  assert.deepEqual(summary(r), { routes: 3, channels: 2, shared: [{ id: "r1", routes: 2 }, { id: "r2", routes: 2 }] });
});

test("independent routers share nothing", () => {
  const r = table();
  for (const [id, z] of [["r1", -3], ["r2", 0], ["r3", 3]] as const) {
    device(r, id, "router", 0, z);
    wire(r, "alpha", id, "omega");
  }
  assert.deepEqual(summary(r), { routes: 3, channels: 3, shared: [] });
  // No route at all: nothing to count.
  assert.deepEqual(summary(table()), { routes: 0, channels: 0, shared: [] });
});

test("a dense mesh behind one hub switch marks only the hub", () => {
  const r = table();
  device(r, "hub", "switch", 3, 0);
  for (const [id, z] of [["r1", -3], ["r2", 0], ["r3", 3]] as const) {
    device(r, id, "router", -1, z);
    wire(r, "alpha", id, "hub");
  }
  wire(r, "r1", "r2");
  wire(r, "r2", "r3");
  wire(r, "r1", "r3");
  wire(r, "hub", "omega");
  const { routes, channels, shared } = summary(r);
  assert.equal(channels, 1);
  assert.ok(routes > 3, `${routes} routes`);
  assert.deepEqual(shared, [{ id: "hub", routes }]);
});

test("two equal bottlenecks in a row are both marked; the merge point wins over a weaker cut", () => {
  // ALPHA → S1 → {R1, R2} → S2 → OMEGA: both switches carry both routes.
  const chain = table();
  device(chain, "s1", "switch", -3, 0);
  device(chain, "r1", "router", 0, -2.5);
  device(chain, "r2", "router", 0, 2.5);
  device(chain, "s2", "switch", 3, 0);
  wire(chain, "alpha", "s1", "r1", "s2", "omega");
  wire(chain, "s1", "r2", "s2");
  assert.deepEqual(summary(chain), { routes: 2, channels: 1, shared: [{ id: "s1", routes: 2 }, { id: "s2", routes: 2 }] });
  // Two channels ALPHA → R → S → OMEGA with a cable between the routers: the routers carry three
  // routes each, the switches only two. {S1, S2} is also a smallest cut, but the routers explain it.
  const cross = table();
  device(cross, "r1", "router", -1.5, -2.5);
  device(cross, "r2", "router", -1.5, 2.5);
  device(cross, "s1", "switch", 1.5, -2.5);
  device(cross, "s2", "switch", 1.5, 2.5);
  wire(cross, "alpha", "r1", "s1", "omega");
  wire(cross, "alpha", "r2", "s2", "omega");
  wire(cross, "r1", "r2");
  assert.deepEqual(summary(cross), { routes: 4, channels: 2, shared: [{ id: "r1", routes: 3 }, { id: "r2", routes: 3 }] });
});

test("a jam or a cut re-counts routes and merge points", () => {
  const r = table();
  device(r, "r1", "router", 0, -2.5);
  device(r, "r2", "router", 0, 2.5);
  wire(r, "alpha", "r1", "omega");
  wire(r, "alpha", "r2", "omega");
  wire(r, "r1", "r2");
  r.faultNodes = ["r2"];
  assert.deepEqual(summary(r), { routes: 1, channels: 1, shared: [] });
  r.faultNodes = [];
  r.faultLinks = ["alpha::r2"];
  // ALPHA → R1 → OMEGA and ALPHA → R1 → R2 → OMEGA: one channel through R1.
  assert.deepEqual(summary(r), { routes: 2, channels: 1, shared: [{ id: "r1", routes: 2 }] });
});

test("mergePoints: every two routes meet but no device carries all three (a contrived mesh)", () => {
  // Bits 0/1 are the terminals; x=2, y=3, z=4 carry two routes each.
  const x = 1 << 2, y = 1 << 3, z = 1 << 4, r1 = 1 << 5, r2 = 1 << 6, r3 = 1 << 7, ends = 0b11;
  const found = mergePoints([ends | x | r1 | z, ends | x | r2 | y, ends | y | r3 | z], ends, 1);
  assert.deepEqual(found, [{ bit: 2, routes: 2 }, { bit: 3, routes: 2 }, { bit: 4, routes: 2 }]);
  assert.deepEqual(mergePoints([], ends, 0), []);
  assert.deepEqual(mergePoints([ends | x, ends | y], ends, 2), []);
});

test("the full fourteen-device mesh names its merge points and every one carries two routes or more", () => {
  const r = table();
  const spots = [[-3.5, -3], [-3.5, 0], [-3.5, 3], [-1.2, -3], [-1.2, 0], [-1.2, 3], [1.2, -3], [1.2, 0], [1.2, 3], [3.5, -3], [3.5, 0], [3.5, 3]];
  spots.forEach(([x, z], i) => device(r, `d${i}`, i % 2 ? "router" : "switch", x, z));
  for (let i = 0; i < spots.length; i++) {
    if (i % 3 < 2) wire(r, `d${i}`, `d${i + 1}`);
    if (i + 3 < spots.length) wire(r, `d${i}`, `d${i + 3}`);
    if (i % 3 < 2 && i + 4 < spots.length) wire(r, `d${i}`, `d${i + 4}`);
  }
  for (const i of [0, 1, 2]) wire(r, "alpha", `d${i}`);
  for (const i of [9, 10, 11]) wire(r, `d${i}`, "omega");
  const p = combatPreview(r);
  assert.ok(p.routeCount > p.channels);
  assert.ok(p.sharedDevices.length >= p.channels, JSON.stringify(p.sharedDevices));
  for (const item of p.sharedDevices) assert.ok(item.routes >= 2 && item.routes <= p.routeCount);
  // The forecast stays pure: the same answer twice.
  assert.deepEqual(combatPreview(r).sharedDevices, p.sharedDevices);
});
