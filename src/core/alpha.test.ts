import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RELICS } from "./cards.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import {
  createRun,
  chooseRoom,
  playInstant,
  playGround,
  playLink,
  playNode,
  endTurn,
  combatPreview,
  intentFor,
  removeDeckCard,
  chooseCardReward,
  HAND_LIMIT,
} from "./run.ts";
import type { CardId, RunState } from "./types.ts";

function battle(): RunState {
  const run = createRun(812);
  run.phase = "map";
  chooseRoom(run, "0-1");
  run.enemy!.hp = run.enemy!.maxHp = 100;
  run.enemy!.id = "leech";
  run.energy = 20;
  run.hand = ["containerlab"];
  playInstant(run, 0);
  return run;
}
function cast(run: RunState, card: CardId) {
  run.hand = [card];
  return playInstant(run, 0);
}

test("alpha collection has 39 distinct playable cards and 9 distinct relics", () => {
  assert.equal(Object.keys(CARDS).length, 39);
  assert.equal(Object.keys(RELICS).length, 9);
  assert.ok(
    Object.values(CARDS).every(
      (card) => card.cost >= 0 && card.rules.length > 20,
    ),
  );
  assert.ok(Object.values(CARDS).some((card) => card.rarity === "common"));
});

test("preview is pure and its visible terms exactly sum to resolution", () => {
  const r = battle();
  cast(r, "pulse");
  cast(r, "guard");
  const before = structuredClone(r);
  const preview = combatPreview(r);
  assert.deepEqual(r, before);
  assert.equal(
    preview.packetDamage,
    preview.damageTerms.reduce((n, t) => n + t.amount, 0),
  );
  assert.equal(
    preview.shield,
    preview.shieldTerms.reduce((n, t) => n + t.amount, 0),
  );
  const turn = endTurn(r);
  assert.equal(turn.packetDamage, preview.packetDamage);
  assert.equal(turn.integrityDamage, preview.incoming);
  assert.equal(r.block, 0);
  assert.equal(r.packetBoost, 0);
});

test("best route beats earlier low-value routes regardless of link insertion order", () => {
  const r = battle();
  r.topology.nodes.push(
    { id: "router2", role: "router", x: 0, z: 2, upgraded: true },
    { id: "switch1", role: "switch", x: 2, z: 2, amplified: true },
  );
  r.topology.links.push(
    { a: "alpha", b: "router2" },
    { a: "router2", b: "switch1" },
    { a: "switch1", b: "omega" },
  );
  const preview = combatPreview(r);
  assert.deepEqual(preview.signalPath, [
    "alpha",
    "router2",
    "switch1",
    "omega",
  ]);
  assert.equal(preview.packetDamage, 12);
  r.topology.links.reverse();
  assert.equal(combatPreview(r).packetDamage, 12);
});

test("switch utility, compression and Packet Lens combine with capped switch routing", () => {
  const r = battle();
  r.topology.links = [{ a: "alpha", b: "router1" }];
  for (let i = 0; i < 3; i++) {
    r.topology.nodes.push({
      id: `switch${i}`,
      role: "switch",
      x: i,
      z: 2,
      amplified: true,
    });
    r.topology.links.push({
      a: i ? `switch${i - 1}` : "router1",
      b: `switch${i}`,
    });
  }
  r.topology.links.push({ a: "switch2", b: "omega" });
  r.relics = ["packet-lens"];
  assert.equal(combatPreview(r).packetDamage, 12); // 5 + 2 clock + 2 switches + 2 compression + 1 lens
});

test("power surge exhausts before drawing and cannot draw itself from an empty deck", () => {
  const r = battle();
  r.hand = ["surge"];
  r.drawPile = [];
  r.discardPile = [];
  const energy = r.energy;
  playInstant(r, 0);
  assert.equal(r.energy, energy + 2);
  assert.equal(r.hand.length, 0);
  assert.ok(r.exhaustPile.includes("surge"));
  endTurn(r);
  assert.ok(!r.hand.includes("surge"));
});

test("hand limit leaves undrawn cards in the draw pile", () => {
  const r = battle();
  r.hand = ["diagnostic", ...Array<CardId>(9).fill("fiber")];
  r.drawPile = ["pulse", "barrier", "guard"];
  r.discardPile = [];
  playInstant(r, 0);
  assert.equal(r.hand.length, HAND_LIMIT);
  assert.deepEqual(r.drawPile, ["barrier", "guard"]);
});

test("boosts cannot deal damage without a route and expire after the turn", () => {
  const r = battle();
  r.faultNode = "router1";
  cast(r, "zero-day");
  assert.equal(combatPreview(r).packetDamage, 0);
  endTurn(r);
  assert.equal(r.packetBoost, 0);
});

test("forecast names exactly the cable the enemy severs", () => {
  const r = battle();
  r.enemy!.id = "wraith";
  const preview = combatPreview(r);
  assert.equal(preview.faultTarget, "alpha::router1");
  assert.equal(preview.intent!.target, preview.faultTarget);
  endTurn(r);
  assert.equal(r.faultLink, preview.faultTarget);
});

test("armored fibers and jam protection make disruption fail without hidden damage", () => {
  const r = battle();
  r.topology.links.forEach((link) => {
    link.armored = true;
  });
  r.enemy!.id = "wraith";
  assert.equal(combatPreview(r).faultTarget, null);
  assert.equal(endTurn(r).integrityDamage, 0);
  r.enemy!.id = "storm";
  r.enemy!.turn = 0;
  r.topology.nodes.find((node) => node.id === "router1")!.shielded = true;
  assert.equal(combatPreview(r).faultTarget, null);
  assert.equal(endTurn(r).integrityDamage, 0);
});

test("Shield Array is spent only when at least one damage reaches it", () => {
  const r = battle();
  r.relics = ["shield-array"];
  cast(r, "guard");
  endTurn(r);
  assert.equal(r.shieldArrayUsed, false);
  r.enemy!.turn = 9;
  assert.equal(combatPreview(r).incomingRaw, 5);
  assert.equal(combatPreview(r).shield, 4);
  assert.equal(combatPreview(r).incoming, 1);
  endTurn(r);
  assert.equal(r.shieldArrayUsed, true);
});

test("lethal packet damage cancels damage and disruption before temporary resources expire", () => {
  const r = battle();
  r.enemy!.hp = 7;
  r.enemy!.id = "wraith";
  const preview = combatPreview(r);
  assert.equal(preview.lethal, true);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.faultTarget, null);
  assert.equal(preview.intent!.target, undefined);
  const result = endTurn(r);
  assert.equal(result.defeated, true);
  assert.equal(r.faultLink, null);
});

test("pressure and the boss half-health phase have deterministic telegraphs", () => {
  const r = battle();
  r.enemy!.turn = 6;
  assert.equal(intentFor(r)!.amount, 4);
  assert.equal(intentFor(r)!.pressure, 2);
  r.enemy!.id = "core";
  r.enemy!.turn = 1;
  r.enemy!.hp = 50;
  assert.equal(intentFor(r)!.amount, 7);
  assert.match(intentFor(r)!.label, /ENRAGED/);
  r.enemy!.turn = 2;
  assert.equal(intentFor(r)!.amount, 2);
});

test("capacitor and Reserve Cell recharge only next turn; Grounded Core renews block", () => {
  const r = battle();
  r.energy = 3;
  r.relics = ["reserve-cell", "grounded-core"];
  cast(r, "capacitor");
  assert.equal(r.energy, 3);
  endTurn(r);
  assert.equal(r.energy, 9);
  assert.equal(r.reserveEnergy, 0);
  assert.equal(r.block, 2);
});

test("repair, recovery and redundancy cards apply their documented effects", () => {
  const r = battle();
  r.faultNode = "router1";
  r.faultLink = "alpha::router1";
  cast(r, "protocol");
  assert.equal(r.faultNode, null);
  assert.equal(r.faultLink, null);
  assert.equal(r.block, 3);
  r.discardPile = ["duplex", "guard", "fiber"];
  cast(r, "salvage");
  assert.deepEqual(r.hand, ["fiber", "duplex"]);
  assert.deepEqual(r.discardPile, ["guard"]);
  r.hand = ["mirror"];
  const before = structuredClone(r);
  assert.equal(playInstant(r, 0).ok, false);
  assert.deepEqual(r, before);
  r.hand = ["clabernetes"];
  playNode(r, 0, "router1");
  assert.equal(cast(r, "mirror").ok, true);
  assert.equal(r.packetBoost, 3);
  assert.equal(r.block, 7);
});

test("new hardware and cable cards have live rule effects", () => {
  const r = battle();
  r.hand = [
    "relay",
    "hardened-router",
    "bastion",
    "duplex",
    "armored-fiber",
    "conduit",
  ];
  playGround(r, 0, -3, 2.4);
  playGround(r, 0, 0, 2.4);
  playGround(r, 0, 3, 2.4);
  assert.ok(
    r.topology.nodes
      .filter((node) => ["switch2", "router3", "firewall4"].includes(node.id))
      .every((node) => node.shielded),
  );
  assert.equal(r.block, 7);
  playLink(r, 0, "alpha", "switch2");
  playLink(r, 0, "switch2", "router3");
  playLink(r, 0, "router3", "omega");
  assert.equal(r.block, 10);
  assert.ok(r.topology.links.some((link) => link.armored));
  assert.ok(r.topology.links.some((link) => link.boosted));
});

test("emergency cards repair integrity and create a usable backup route", () => {
  const r = battle();
  r.integrity = 4;
  cast(r, "emergency");
  assert.equal(r.integrity, 7);
  assert.equal(r.block, 3);
  cast(r, "rebuild");
  assert.equal(combatPreview(r).independent, true);
  assert.equal(combatPreview(r).packetDamage, 9);
});

test("reward rolls exclude basics, stay unique, and guarantee an elite rare", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = battle();
    r.rng = seed;
    r.currentRoom = "3-0";
    r.enemy!.hp = 1;
    endTurn(r);
    assert.equal(r.cardRewards.length, 3);
    assert.equal(new Set(r.cardRewards).size, 3);
    assert.equal(CARDS[r.cardRewards[0]].rarity, "rare");
    assert.ok(r.cardRewards.every((id) => CARDS[id].rarity !== "basic"));
    chooseCardReward(r, null);
    assert.equal(r.phase, "relic");
  }
});

test("forge removal consumes the room and protects opening route essentials", () => {
  const r = battle();
  r.phase = "forge";
  r.currentRoom = "2-0";
  assert.equal(removeDeckCard(r, r.deck.indexOf("containerlab")).ok, false);
  r.deck = r.deck.filter(
    (id, i, all) => id !== "router" || i === all.indexOf("router"),
  );
  assert.equal(removeDeckCard(r, r.deck.indexOf("router")).ok, false);
  const size = r.deck.length;
  assert.equal(removeDeckCard(r, r.deck.indexOf("switch")).ok, true);
  assert.equal(r.deck.length, size - 1);
  assert.equal(r.phase, "map");
  assert.equal(r.floor, 3);
});

test("legacy version-2 saves default alpha fields once and reject invalid values", () => {
  const e = newExpedition("architect", 77);
  const old = JSON.parse(JSON.stringify(e));
  for (const key of [
    "exhaustPile",
    "block",
    "packetBoost",
    "reserveEnergy",
    "cardsPlayed",
  ])
    delete old.run[key];
  const restored = parseExpedition(JSON.stringify(old))!;
  assert.deepEqual(restored.run.exhaustPile, []);
  assert.equal(restored.run.block, 0);
  assert.deepEqual(parseExpedition(JSON.stringify(restored)), restored);
  restored.run.block = -1;
  assert.equal(parseExpedition(JSON.stringify(restored)), null);
});

test("crossing the boss phase threshold never rewrites the already displayed intent", () => {
  const r = battle();
  r.enemy!.id = "core";
  r.enemy!.maxHp = 100;
  r.enemy!.hp = 51;
  r.enemy!.turn = 1;
  const preview = combatPreview(r);
  assert.equal(preview.incomingRaw, 4);
  assert.doesNotMatch(preview.intent!.label, /ENRAGED/);
  assert.equal(endTurn(r).integrityDamage, 4);
  assert.match(intentFor(r)!.label, /ENRAGED/);
  assert.equal(intentFor(r)!.amount, 2);
});

test("dense fourteen-device routing remains complete and respects bonus caps", () => {
  const r = battle();
  for (let i = 0; r.topology.nodes.length < 14; i++)
    r.topology.nodes.push({
      id: `device${i}`,
      role: i % 3 === 0 ? "router" : i % 3 === 1 ? "switch" : "firewall",
      x: i,
      z: 2,
    });
  r.topology.links = [];
  for (let a = 0; a < r.topology.nodes.length; a++)
    for (let b = a + 1; b < r.topology.nodes.length; b++)
      r.topology.links.push({
        a: r.topology.nodes[a].id,
        b: r.topology.nodes[b].id,
        boosted: true,
      });
  const preview = combatPreview(r);
  assert.equal(preview.packetDamage, 14); // route5 + clock2 + firewall1 + switches2 + cables2 + independent2
  assert.equal(preview.independent, true);
  assert.equal(new Set(preview.signalPath).size, preview.signalPath.length);
  assert.ok(preview.signalPath.includes("router1"));
});
