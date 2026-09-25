/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import assert from "node:assert/strict";
import test from "node:test";
import { newExpedition } from "./expedition.ts";
import { chooseRoom, combatPreview, playInstant } from "./run.ts";
import type { CardId } from "./types.ts";

function captureBattle() {
  const run = newExpedition("architect", 315).run;
  chooseRoom(run, "0-1");
  run.enemies[0].id = "leech";
  run.enemies[0].hp = run.enemies[0].maxHp = 100;
  run.hand = ["wireshark"];
  run.drawPile = ["guard", "pulse", "fiber"];
  return run;
}
function routedBattle() {
  const run = captureBattle();
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  return run;
}

test("Wireshark rejects a missing live router route without consuming any state", () => {
  const run = captureBattle();
  const before = structuredClone(run);
  assert.equal(playInstant(run, 0).ok, false);
  assert.deepEqual(run, before);
  const routed = routedBattle();
  routed.faultNodes = ["router1"];
  const faulted = structuredClone(routed);
  assert.equal(playInstant(routed, 0).ok, false);
  assert.deepEqual(routed, faulted);
});

test("a basic routed capture draws two and adds one burst, excluding terminals", () => {
  const run = routedBattle();
  const energy = run.energy;
  assert.equal(playInstant(run, 0).ok, true);
  assert.equal(run.energy, energy - 1);
  assert.equal(run.packetBoost, 1);
  assert.deepEqual(run.hand, ["guard", "pulse"]);
  assert.deepEqual(run.drawPile, ["fiber"]);
  assert.ok(run.exhaustPile.includes("wireshark"));
  assert.ok(!run.discardPile.includes("wireshark"));
  assert.equal(combatPreview(run).packetDamage, 6);
  assert.match(run.log[0], /drew 2 cards/);
});

test("mixed hardware captures three distinct types even when a type appears twice", () => {
  const run = routedBattle();
  run.topology.nodes.push(
    { id: "switch1", role: "switch", x: 1, z: 2 },
    { id: "switch2", role: "switch", x: 3, z: 2 },
    { id: "firewall1", role: "firewall", x: 4, z: 0 },
  );
  run.topology.links = [
    { a: "alpha", b: "router1" },
    { a: "router1", b: "switch1" },
    { a: "switch1", b: "switch2" },
    { a: "switch2", b: "firewall1" },
    { a: "firewall1", b: "omega" },
  ];
  const before = combatPreview(run);
  playInstant(run, 0);
  assert.equal(run.packetBoost, 3);
  assert.equal(combatPreview(run).packetDamage, before.packetDamage + 3);
  assert.match(run.log[0], /router \+ switch \+ firewall/);
});

test("capture counts the chosen route rather than other hardware elsewhere on the table", () => {
  const run = routedBattle();
  run.topology.nodes.find((node) => node.id === "router1")!.upgraded = true;
  run.topology.nodes.push(
    { id: "router2", role: "router", x: 0, z: 2 },
    { id: "firewall1", role: "firewall", x: 3, z: 2 },
    { id: "switch1", role: "switch", x: -3, z: 2 },
  );
  run.topology.links.push(
    { a: "alpha", b: "router2" },
    { a: "router2", b: "firewall1" },
    { a: "firewall1", b: "omega" },
  );
  assert.deepEqual(combatPreview(run).signalPath, [
    "alpha",
    "router1",
    "omega",
  ]);
  playInstant(run, 0);
  assert.equal(run.packetBoost, 1);
});

test("capture respects the ten-card hand limit and leaves overflow undrawn", () => {
  const run = routedBattle();
  run.hand = ["wireshark", ...Array<CardId>(9).fill("guard")];
  playInstant(run, 0);
  assert.equal(run.hand.length, 10);
  assert.deepEqual(run.drawPile, ["pulse", "fiber"]);
  assert.equal(run.packetBoost, 1);
  assert.ok(run.exhaustPile.includes("wireshark"));
  assert.match(run.log[0], /drew 1 card ·/);
});
