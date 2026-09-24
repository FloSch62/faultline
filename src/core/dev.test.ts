import assert from "node:assert/strict";
import test from "node:test";
import { SCENARIOS, DEFAULT_SETUP, DEFAULT_SETTINGS, clearFaults, createSandbox, finishSandboxTurn, inspectChannels, loadScenario, refillSandbox, removeDevice, skipSector } from "../dev/sandbox.ts";
import { parseExpedition } from "./expedition.ts";
import { combatPreview, endTurn, playGround, playLink } from "./run.ts";
import { STAGES } from "./stages.ts";
import { linkKey } from "./graph.ts";
import type { RoomType } from "./types.ts";

test("dev scenarios explain the unchanged engine count and survive save validation", () => {
  const counts: Record<string, number> = { empty: 0, single: 1, parallel: 2, triple: 3, "shared-router": 1, "shared-firewall": 1, crosslink: 2, "dead-end": 1, "no-router": 0, cut: 1 };
  for (const scenario of SCENARIOS) {
    const e = loadScenario(scenario.id);
    const proof = inspectChannels(e.run);
    assert.equal(proof.count, counts[scenario.id], scenario.id);
    assert.equal(combatPreview(e.run).channels, proof.count, `${scenario.id}: matches combat`);
    assert.equal(proof.independent.length, proof.count, `${scenario.id}: complete independent set`);
    const devices = proof.independent.flatMap(path => path.filter(id => id !== "alpha" && id !== "omega"));
    assert.equal(new Set(devices).size, devices.length, `${scenario.id}: no shared intermediate devices`);
    assert.ok(parseExpedition(JSON.stringify(e)), `${scenario.id}: save reloads`);
  }
});

test("dev explanation names shared devices, missing routers, unfinished paths and cuts", () => {
  const shared = inspectChannels(loadScenario("shared-router").run);
  assert.deepEqual(shared.alternatives[0].shared, ["r1"]);
  const firewall = inspectChannels(loadScenario("shared-firewall").run);
  assert.deepEqual(firewall.alternatives[0].shared, ["f1"]);
  assert.equal(inspectChannels(loadScenario("no-router").run).invalid.length, 2);
  assert.deepEqual(inspectChannels(loadScenario("dead-end").run).offline, ["r2"]);
  const cut = loadScenario("cut").run;
  assert.deepEqual(inspectChannels(cut).blocked, [["alpha", "r1", "omega"]]);
  clearFaults(cut);
  assert.equal(inspectChannels(cut).count, 2);
  cut.topology.links.push({ a: "r1", b: "r2" });
  const cross = inspectChannels(cut);
  assert.equal(cross.count, 2);
  assert.equal(cross.variants, 3, "same-device permutations form one representative variant");
});

test("the channel proof stays disjoint when the strongest primary uses both routers", () => {
  const r = loadScenario("crosslink").run;
  r.topology.nodes.filter(node => node.role === "router").forEach(node => { node.configured = true; });
  const preview = combatPreview(r), proof = inspectChannels(r);
  assert.equal(preview.signalPath.length, 4);
  assert.equal(preview.channels, 2);
  assert.deepEqual(proof.independent, [["alpha", "r1", "omega"], ["alpha", "r2", "omega"]]);
  assert.deepEqual(proof.alternatives[0].shared, ["r1", "r2"]);
});

test("free build reuses the real card and connection actions without changing ordinary costs", () => {
  const e = loadScenario("empty"), run = e.run;
  refillSandbox(run, DEFAULT_SETTINGS);
  let before = structuredClone(run);
  assert.ok(playGround(run, 0, 0, 0).ok);
  refillSandbox(run, DEFAULT_SETTINGS, before, "router");
  assert.equal(run.energy, 99);
  assert.equal(run.hand[0], "router");
  assert.equal(run.discardPile.includes("router"), false);
  const router = run.topology.nodes.find(node => node.role === "router")!.id;
  for (const [a, b] of [["alpha", router], [router, "omega"]]) {
    before = structuredClone(run);
    assert.ok(playLink(run, run.hand.indexOf("fiber"), a, b).ok);
    refillSandbox(run, DEFAULT_SETTINGS, before, "fiber");
  }
  assert.equal(combatPreview(run).channels, 1);
  assert.equal(run.hand.filter(id => id === "fiber").length, 1);
  before = structuredClone(run);
  assert.ok(playGround(run, 0, 0, 2.6).ok);
  const spent = run.energy;
  refillSandbox(run, { ...DEFAULT_SETTINGS, freeBuild: false }, before, "router");
  assert.equal(run.energy, spent);
  assert.ok(spent < 99);
  assert.equal(run.hand.includes("router"), false);
  assert.ok(parseExpedition(JSON.stringify(e)));
});

test("immortality restores fatal damage after the normal resolution and keeps the next turn playable", () => {
  const e = loadScenario("empty"), r = e.run;
  r.enemies[0].id = "serpent";
  r.enemies[0].turn = 0;
  r.integrity = 1;
  const expected = combatPreview(r).incoming;
  assert.ok(expected >= 1);
  const result = endTurn(r);
  assert.equal(result.integrityDamage, expected);
  assert.equal(result.lost, true);
  finishSandboxTurn(r, { ...DEFAULT_SETTINGS, immortal: true }, result);
  assert.equal(result.lost, false);
  assert.equal(r.phase, "battle");
  assert.equal(r.integrity, r.maxIntegrity);
  assert.equal(r.turn, 2);
  assert.ok(r.hand.length);
  assert.equal(r.energy, 99);
});

test("all stage and sector jumps enter valid rooms, including markets and guardians", () => {
  const types: RoomType[] = ["battle", "elite", "boss", "shop", "forge", "cache", "event"];
  for (let stage = 0; stage < STAGES.length; stage++) for (const floor of [0, 3, 6]) for (const type of types) {
    const e = createSandbox({ ...DEFAULT_SETUP, stage, floor, type, enemy: "" });
    assert.equal(e.run.stage, stage);
    assert.equal(e.run.floor, floor);
    assert.ok(parseExpedition(JSON.stringify(e)), `${stage}/${floor}/${type}: valid save`);
    if (type === "boss") assert.equal(e.run.enemies[0].id, STAGES[stage].boss);
    if (["battle", "elite", "boss"].includes(type)) assert.doesNotThrow(() => combatPreview(e.run));
  }
});

test("chosen packs, keep-loadout and sector skipping use normal encounter and progression rules", () => {
  const old = loadScenario("single");
  old.run.deck.push("containerlab");
  old.run.credits = 800;
  const e = createSandbox({ ...DEFAULT_SETUP, stage: 1, floor: 4, enemy: "leech", escorts: ["relay-drone", "relay-drone"] }, old);
  assert.equal(e.run.enemies.length, 3);
  assert.equal(e.run.enemies.find(enemy => enemy.port === "centre")!.id, "leech");
  assert.ok(e.run.deck.includes("containerlab"));
  assert.equal(e.run.credits, 800);
  skipSector(e.run);
  assert.equal(e.run.phase, "map");
  assert.equal(e.run.floor, 5);
  const boss = createSandbox({ ...DEFAULT_SETUP, floor: 6, type: "boss", enemy: "" });
  skipSector(boss.run);
  assert.equal(boss.run.stage, 1);
  assert.equal(boss.run.floor, 0);
  assert.ok(parseExpedition(JSON.stringify(boss)));
});

test("removing a device drops its cables and faults and leaves the remaining channel", () => {
  const e = loadScenario("parallel"), r = e.run;
  r.faultNodes = ["r1"];
  r.faultLinks = [linkKey("alpha", "r1")];
  r.lingeringJams = { r1: 1 };
  removeDevice(r, "r1");
  assert.equal(inspectChannels(r).count, 1);
  assert.deepEqual(r.faultNodes, []);
  assert.deepEqual(r.faultLinks, []);
  assert.deepEqual(r.lingeringJams, {});
  assert.ok(parseExpedition(JSON.stringify(e)));
  assert.throws(() => removeDevice(r, "alpha"));
});
