import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES, baseCard } from "./cards.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import {
  chooseRoom,
  combatPreview,
  endTurn,
  playGround,
  playLink,
  playNode,
  playInstant,
  relocateNode,
  zoneForNode,
} from "./run.ts";
import type { RunState } from "./types.ts";

function manual(): RunState {
  const r = newExpedition("architect", 91).run;
  chooseRoom(r, "0-1");
  r.enemies[0].id = "leech";
  r.enemies[0].hp = r.enemies[0].maxHp = 100;
  r.relics = [];
  r.hand = ["router", "fiber", "fiber"];
  playGround(r, 0, 0, 0);
  playLink(r, 0, "alpha", "router1");
  playLink(r, 0, "router1", "omega");
  return r;
}

test("new expeditions never start with Containerlab or legendary Clabernetes", () => {
  for (const archetype of ["architect", "warden", "ghost"] as const) {
    for (let seed = 1; seed <= 20; seed++) {
      const r = newExpedition(archetype, seed).run;
      assert.equal(r.deck.length, 17);
      assert.ok(!r.deck.includes("containerlab"));
      assert.ok(!r.deck.includes("clabernetes"));
      assert.ok(
        r.deck.includes("startup-config") && r.deck.includes("inspect"),
      );
      chooseRoom(r, "0-1");
      assert.ok(r.hand.some((id) => ["router", "hardened-router"].includes(baseCard(id))));
      assert.ok(r.hand.filter((id) => CARDS[id].target === "link").length >= 2);
      assert.ok(
        !r.hand.includes("containerlab") && !r.hand.includes("clabernetes"),
      );
    }
  }
  assert.equal(CARDS.containerlab.rarity, "rare");
  assert.equal(CARDS.clabernetes.rarity, "legendary");
});

test("north-center-south boundaries are precise and relocation pays once", () => {
  const r = manual();
  assert.equal(zoneForNode({ z: -1.3 }), "center");
  assert.equal(zoneForNode({ z: 1.3 }), "center");
  assert.equal(zoneForNode({ z: -1.301 }), "north");
  assert.equal(zoneForNode({ z: 1.301 }), "south");
  assert.equal(r.energy, 1);
  const untouched = structuredClone(r);
  assert.equal(relocateNode(r, "router1", -5.3, 0).ok, false);
  assert.equal(relocateNode(r, "router1", 8, 0).ok, false);
  assert.deepEqual(r, untouched);
  assert.equal(relocateNode(r, "router1", 0, -2.4).ok, true);
  assert.equal(r.energy, 0);
  assert.equal(relocateNode(r, "router1", 0, -2.4).ok, true);
  assert.equal(r.energy, 0);
  const before = structuredClone(r);
  assert.equal(relocateNode(r, "router1", 0, 2.4).ok, false);
  assert.equal(relocateNode(r, "alpha", 0, 2.4).ok, false);
  assert.equal(relocateNode(r, "router1", NaN, 2.4).ok, false);
  assert.deepEqual(r, before);
});

test("any independent north-south pair grants separation even when center is inserted first", () => {
  const r = manual();
  for (const [id, z] of [
    ["router2", -2.4],
    ["router3", 2.4],
  ] as const) {
    r.topology.nodes.push({ id, role: "router", x: 0, z });
    r.topology.links.push({ a: "alpha", b: id }, { a: id, b: "omega" });
  }
  const preview = combatPreview(r);
  assert.equal(
    preview.shieldTerms.find((term) => term.label.startsWith("Separated"))
      ?.amount,
    RULES.separatedCircuitShield,
  );
  assert.equal(preview.incoming, 0);
  r.energy = 1;
  assert.equal(relocateNode(r, "router3", 2, 0).ok, true);
  assert.equal(combatPreview(r).shield, 0);
  assert.equal(combatPreview(r).incoming, 2);
});

test("opposite router bands do not give separation when routes share a bottleneck", () => {
  const r = manual();
  r.topology.nodes.find((node) => node.id === "router1")!.z = -2.4;
  r.topology.nodes.push(
    { id: "router2", role: "router", x: 0, z: 2.4 },
    { id: "switch1", role: "switch", x: 2, z: 0 },
  );
  r.topology.links = [
    { a: "alpha", b: "router1" },
    { a: "alpha", b: "router2" },
    { a: "router1", b: "switch1" },
    { a: "router2", b: "switch1" },
    { a: "switch1", b: "omega" },
  ];
  assert.equal(combatPreview(r).independent, false);
  assert.equal(combatPreview(r).shield, 0);
});

test("Cable Wraith targets the longest exposed cable and previews length chip damage", () => {
  const r = manual();
  r.enemies[0].id = "wraith";
  r.topology.nodes.find((node) => node.id === "router1")!.x = -3;
  const p = combatPreview(r);
  assert.equal(p.faultTarget, "omega::router1");
  assert.equal(p.incomingRaw, 1);
  assert.equal(
    p.incomingTerms.reduce((sum, term) => sum + term.amount, 0),
    1,
  );
  assert.equal(endTurn(r).integrityDamage, 1);
  assert.equal(r.faultLinks[0], p.faultTarget);
  r.enemies[0].turn = 0;
  r.topology.links.find((link) => link.b === "omega")!.armored = true;
  assert.equal(combatPreview(r).faultTarget, "alpha::router1");
  assert.equal(combatPreview(r).incomingRaw, 0);
});

test("Storm bands are telegraphed, cycle, and an empty band really dodges", () => {
  const r = manual();
  r.enemies[0].id = "storm";
  assert.equal(combatPreview(r).hazardZone, "north");
  assert.equal(combatPreview(r).faultTarget, null);
  assert.equal(endTurn(r).integrityDamage, 0);
  assert.deepEqual(r.faultNodes, []);
  r.enemies[0].turn = 3;
  const before = combatPreview(r);
  assert.equal(before.hazardZone, "center");
  assert.equal(before.faultTarget, "router1");
  r.energy = 1;
  relocateNode(r, "router1", 0, 2.4);
  assert.equal(combatPreview(r).faultTarget, null);
  endTurn(r);
  assert.deepEqual(r.faultNodes, []);
  r.enemies[0].turn = 6;
  assert.equal(combatPreview(r).hazardZone, "south");
  assert.equal(combatPreview(r).faultTarget, "router1");
});

test("Packet Leech healing is capped, forecast, and resolved from a missing route", () => {
  const r = manual();
  r.enemies[0].hp = 98;
  r.faultLinks = ["alpha::router1"];
  const p = combatPreview(r);
  assert.equal(p.packetDamage, 0);
  assert.equal(p.enemyHealing, 2);
  endTurn(r);
  assert.equal(r.enemies[0].hp, 100);
  r.enemies[0].hp = 80;
  r.faultLinks = [];
  // Turn two is the Siphon Tap: it plants a Tap installation, then heals 1 per Tap.
  const tap = combatPreview(r);
  assert.equal(tap.intent?.kind, "install");
  assert.equal(tap.intent?.install, "tap");
  assert.ok(tap.malwareTarget);
  assert.equal(tap.enemyHealing, 1);
  const result = endTurn(r);
  assert.equal(result.packetDamage, 5);
  assert.ok(result.malwarePlanted);
  assert.equal(r.enemies[0].hp, 76);
  // The tap now siphons 2 damage from every transmission until scrubbed.
  assert.equal(combatPreview(r).packetDamage, 3);
});

test("Sentinel plating is a signed damage term and a firewall bypass selects the better route", () => {
  const r = manual();
  r.enemies[0].id = "sentinel";
  const p = combatPreview(r);
  assert.equal(p.rawPacketDamage, 5);
  assert.equal(p.packetDamage, 3);
  assert.equal(p.damageTerms.find((term) => term.amount < 0)?.amount, -2);
  assert.equal(
    p.damageTerms.reduce((sum, term) => sum + term.amount, 0),
    p.packetDamage,
  );
  r.topology.nodes.push({ id: "firewall1", role: "firewall", x: 2, z: 2 });
  r.topology.links.push(
    { a: "router1", b: "firewall1" },
    { a: "firewall1", b: "omega" },
  );
  const protectedRoute = combatPreview(r);
  // v3: an online firewall anywhere bypasses plating; it adds no damage itself.
  assert.ok(protectedRoute.online.includes("firewall1"));
  assert.equal(protectedRoute.packetDamage, 5);
  assert.ok(protectedRoute.damageTerms.every((term) => term.amount >= 0));
  assert.equal(endTurn(r).packetDamage, 5);
});

test("Startup Config is once per router, stacks once per route, and replication preserves it", () => {
  const r = manual();
  r.energy = 10;
  r.hand = ["startup-config", "clabernetes"];
  assert.equal(playNode(r, 0, "alpha").ok, false);
  assert.equal(playNode(r, 0, "router1").ok, true);
  assert.equal(combatPreview(r).packetDamage, 6);
  assert.equal(r.block, 1);
  assert.ok(r.exhaustPile.includes("startup-config"));
  playNode(r, 0, "router1");
  assert.ok(
    r.topology.nodes
      .filter((node) => node.role === "router")
      .every((node) => node.configured),
  );
  assert.equal(combatPreview(r).packetDamage, 6 + RULES.bandwidthPerChannel);
  r.hand = ["startup-config"];
  assert.equal(playNode(r, 0, "router1").ok, false);
});

test("Linux Bridge placement auto-links only its nearest device", () => {
  const r = manual();
  r.hand = ["linux-bridge"];
  assert.equal(playGround(r, 0, 3, 2).ok, true);
  const bridge = r.topology.nodes.find((node) => node.role === "switch")!;
  const links = r.topology.links.filter(
    (link) => link.a === bridge.id || link.b === bridge.id,
  );
  assert.equal(links.length, 1);
  assert.ok(links.some((link) => link.a === "omega" || link.b === "omega"));
});

test("VXLAN creates an amplified protected cable and inspection rewards an online topology", () => {
  const r = manual();
  r.energy = 4;
  r.topology.links.pop();
  r.hand = ["vxlan", "inspect"];
  assert.equal(playLink(r, 0, "router1", "omega").ok, true);
  assert.ok(
    r.topology.links.at(-1)!.armored && r.topology.links.at(-1)!.boosted,
  );
  assert.equal(combatPreview(r).packetDamage, 6);
  r.drawPile = ["guard", "pulse"];
  playInstant(r, 0);
  assert.deepEqual(r.hand, ["guard", "pulse"]);
  assert.ok(r.exhaustPile.includes("inspect"));
  r.hand = ["inspect"];
  r.faultNodes = ["router1"];
  r.drawPile = ["guard", "pulse"];
  playInstant(r, 0);
  assert.deepEqual(r.hand, ["guard"]);
  assert.deepEqual(r.drawPile, ["pulse"]);
});

test("legendary reward frequency is substantially below the specific Containerlab rare", () => {
  let containerlab = 0,
    clabernetes = 0;
  const r = manual();
  for (let sample = 1; sample <= 5000; sample++) {
    r.rng = Math.imul(sample, 0x9e3779b1) >>> 0;
    r.phase = "battle";
    r.enemies[0].hp = 1;
    endTurn(r);
    containerlab += Number(r.cardRewards.includes("containerlab"));
    clabernetes += Number(r.cardRewards.includes("clabernetes"));
  }
  assert.ok(clabernetes > 0);
  assert.ok(
    containerlab > clabernetes * 3,
    `${containerlab} Containerlab versus ${clabernetes} Clabernetes`,
  );
});
