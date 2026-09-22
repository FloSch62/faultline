import assert from "node:assert/strict";
import test from "node:test";
import {
  createRun,
  chooseRoom,
  playGround,
  playLink,
  playInstant,
  playNode,
  signalPaths,
  damageFromPath,
  endTurn,
  chooseCardReward,
  chooseForge,
  chooseRelic,
  costFor,
  intentFor,
} from "./run.ts";
import { canLink, independentRouterPaths, paths } from "./graph.ts";
import { topologyYaml } from "./export.ts";

function firstBattle() {
  const run = createRun(12345);
  run.phase = "map";
  assert.equal(chooseRoom(run, "0-1").ok, true);
  return run;
}

test("opening hand gives a router and two cables so the first route is buildable", () => {
  const run = firstBattle();
  assert.equal(run.hand.filter((card) => card === "router").length >= 1, true);
  assert.equal(run.hand.filter((card) => card === "fiber").length >= 2, true);
  const router = run.hand.indexOf("router");
  assert.equal(playGround(run, router, 0, 0).ok, true);
  const first = run.hand.indexOf("fiber");
  assert.equal(playLink(run, first, "alpha", "router1").ok, true);
  const second = run.hand.indexOf("fiber");
  assert.equal(playLink(run, second, "router1", "omega").ok, true);
  assert.deepEqual(paths(run.topology)[0], ["alpha", "router1", "omega"]);
  const turn = endTurn(run);
  assert.equal(turn.packetDamage >= 5, true);
  assert.equal(run.enemy!.hp < run.enemy!.maxHp, true);
});

test("enemy intent is visible and a severed cable blocks the next signal", () => {
  const run = firstBattle();
  run.enemy!.id = "wraith";
  run.enemy!.hp = 30;
  run.enemy!.maxHp = 30;
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  assert.equal(intentFor(run)?.kind, "sever");
  const turn = endTurn(run);
  assert.equal(turn.packetDamage, 5);
  assert.ok(run.faultLink);
  const next = endTurn(run);
  assert.equal(next.packetDamage, 0);
});

test("two independent router routes survive a node outage", () => {
  const run = firstBattle();
  run.topology.nodes.push(
    { id: "router1", role: "router", x: 0, z: -2 },
    { id: "router2", role: "router", x: 0, z: 2 },
  );
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
    { a: "alpha", b: "router2" },
    { a: "router2", b: "omega" },
  );
  assert.ok(independentRouterPaths(run.topology, paths(run.topology)));
  run.faultNode = "router1";
  assert.deepEqual(paths(run.topology, new Set(["router1"]))[0], [
    "alpha",
    "router2",
    "omega",
  ]);
});

test("room route, reward, and forge change persistent run state", () => {
  const run = firstBattle();
  run.phase = "reward";
  run.cardRewards = ["crosslink", "fiber", "shield"];
  const before = run.deck.length;
  assert.equal(chooseCardReward(run, "crosslink").ok, true);
  assert.equal(run.deck.length, before + 1);
  assert.equal(run.floor, 1);
  assert.equal(run.phase, "map");
  assert.equal(chooseRoom(run, "1-1").ok, true);
  assert.equal(run.phase, "reward");
  assert.equal(chooseCardReward(run, null).ok, true);
  assert.equal(chooseRoom(run, "2-0").ok, true);
  assert.equal(run.phase, "forge");
  run.integrity = 6;
  assert.equal(chooseForge(run, "repair").ok, true);
  assert.equal(run.integrity, 10);
  assert.equal(run.floor, 3);
});

test("relics are unique and affect battle resources", () => {
  const run = firstBattle();
  run.phase = "relic";
  run.relicRewards = ["cold-start"];
  assert.equal(chooseRelic(run, "cold-start").ok, true);
  assert.equal(run.relics.includes("cold-start"), true);
  assert.equal(run.phase, "map");
  assert.equal(chooseRoom(run, "1-0").ok, true);
  assert.equal(run.energy, 6);
});

test("Hot Swap discounts only the first fiber, and Hot Patch restores a severed route", () => {
  const run = firstBattle();
  run.relics.push("hot-swap");
  run.hand = ["fiber", "fiber", "patch"];
  run.drawPile = ["router"];
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push({ a: "alpha", b: "router1" });
  assert.equal(costFor(run, 0), 0);
  assert.equal(playLink(run, 0, "router1", "omega").ok, true);
  assert.equal(run.energy, 5);
  assert.equal(costFor(run, 0), 1);
  run.faultLink = "alpha::router1";
  assert.equal(playInstant(run, run.hand.indexOf("patch")).ok, true);
  assert.equal(run.faultLink, null);
  assert.equal(run.hand.includes("router"), true);
});

test("firewall and Shield Array mitigate a telegraphed breach", () => {
  const run = firstBattle();
  run.enemy!.id = "sentinel";
  run.enemy!.hp = 30;
  run.enemy!.maxHp = 30;
  run.relics.push("shield-array");
  run.topology.nodes.push(
    { id: "router1", role: "router", x: -1, z: 0 },
    { id: "firewall1", role: "firewall", x: 1, z: 0 },
  );
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "firewall1" },
    { a: "firewall1", b: "omega" },
  );
  assert.equal(intentFor(run)?.kind, "breach");
  const turn = endTurn(run);
  assert.equal(turn.packetDamage, 6);
  assert.equal(turn.integrityDamage, 0);
  assert.equal(run.integrity, 12);
  assert.equal(run.shieldArrayUsed, true);
});

test("map enforces adjacent routes and the boss can finish the act", () => {
  const run = createRun(99);
  const phase = () => run.phase;
  run.phase = "map";
  assert.equal(chooseRoom(run, "1-1").ok, false);
  assert.equal(chooseRoom(run, "0-0").ok, true);
  run.phase = "reward";
  run.cardRewards = ["fiber"];
  chooseCardReward(run, null);
  assert.equal(chooseRoom(run, "1-2").ok, false);
  for (let floor = 1; floor <= 6; floor++) {
    const id = `${floor}-1`;
    assert.equal(chooseRoom(run, id).ok, true);
    if (phase() === "forge") chooseForge(run, "repair");
    else {
      run.phase = "reward";
      run.cardRewards = ["fiber"];
      chooseCardReward(run, null);
      if (phase() === "relic") chooseRelic(run, run.relicRewards[0]);
    }
  }
  assert.equal(run.phase, "won");
  assert.equal(run.floor, 7);
});

test("export assigns one interface per link endpoint and rejects duplicates", () => {
  const run = firstBattle();
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  assert.equal(canLink(run.topology, "router1", "alpha"), false);
  const yaml = topologyYaml(run.topology, "Sector One");
  assert.match(yaml, /name: sector-one/);
  assert.match(yaml, /"alpha:eth1", "router1:e1-1"/);
  assert.match(yaml, /"router1:e1-2", "omega:eth1"/);
});

test("Containerlab deploys an overclocked live route for three energy", () => {
  const run = firstBattle();
  assert.ok(run.hand.includes("containerlab"));
  assert.ok(run.deck.includes("clabernetes"));
  assert.equal(playInstant(run, run.hand.indexOf("containerlab")).ok, true);
  assert.equal(run.energy, 2);
  assert.equal(run.topology.nodes.length, 3);
  assert.equal(
    run.topology.nodes.find((n) => n.id === "router1")?.upgraded,
    true,
  );
  assert.deepEqual(signalPaths(run), [["alpha", "router1", "omega"]]);
  assert.equal(endTurn(run).packetDamage, 7);
});

test("Clabernetes preserves overclock and links, shields both routers, and survives a sever", () => {
  const run = firstBattle();
  run.hand = ["containerlab", "clabernetes"];
  playInstant(run, 0);
  assert.equal(playNode(run, 0, "router1").ok, true);
  assert.equal(run.energy, 0);
  const routers = run.topology.nodes.filter((n) => n.role === "router");
  assert.equal(routers.length, 2);
  assert.ok(routers.every((n) => n.shielded && n.upgraded));
  assert.ok(
    Math.hypot(routers[0].x - routers[1].x, routers[0].z - routers[1].z) >=
      1.55,
  );
  assert.ok(independentRouterPaths(run.topology, signalPaths(run)));
  assert.equal(damageFromPath(run, signalPaths(run)[0]), 9);
  run.faultLink = "alpha::router1";
  assert.deepEqual(signalPaths(run), [["alpha", "router2", "omega"]]);
  assert.equal(damageFromPath(run, signalPaths(run)[0]), 7);
  const yaml = topologyYaml(run.topology, "Replicated lab");
  assert.match(yaml, /router2:/);
  assert.equal(run.topology.links.length, 4);
});

test("invalid replication and full tables consume neither cards nor energy", () => {
  const run = firstBattle();
  run.hand = ["clabernetes"];
  const before = structuredClone(run);
  assert.equal(playNode(run, 0, "alpha").ok, false);
  assert.deepEqual(run, before);
  for (let i = 0; i < 12; i++)
    run.topology.nodes.push({ id: `extra${i}`, role: "router", x: i, z: 2 });
  const full = structuredClone(run);
  assert.equal(playNode(run, 0, "extra0").ok, false);
  assert.deepEqual(run, full);
  run.hand = ["containerlab"];
  const fullLab = structuredClone(run);
  assert.equal(playInstant(run, 0).ok, false);
  assert.deepEqual(run, fullLab);
});
