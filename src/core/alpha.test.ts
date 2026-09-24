import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RELICS, RULES, cardOwner } from "./cards.ts";
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
  run.enemies[0].hp = run.enemies[0].maxHp = 100;
  run.enemies[0].id = "leech";
  run.energy = 20;
  run.hand = ["containerlab"];
  playInstant(run, 0);
  return run;
}
function cast(run: RunState, card: CardId) {
  run.hand = [card];
  return playInstant(run, 0);
}

test("v5 collection: every card has an owner, an upgrade for every non-junk card, 32 tiered relics", () => {
  const bases = Object.values(CARDS).filter(card => !card.upgraded);
  assert.ok(bases.length >= 77);
  for (const card of bases) {
    assert.ok(cardOwner(card.id), `${card.id} belongs to a data file`);
    const plus = CARDS[`${card.id}+` as CardId];
    if (card.junk || card.curse) { assert.equal(plus, undefined, card.id); continue; }
    assert.ok(plus, `${card.id} has an upgrade`);
    assert.equal(plus.base, card.id);
    assert.ok(plus.cost < card.cost || plus.rules !== card.rules, `${card.id}+ improves`);
  }
  assert.equal(Object.keys(RELICS).length, 32);
  assert.equal(Object.values(RELICS).filter(relic => relic.tier === "boss").length, 11);
  assert.ok(Object.values(CARDS).every((card) => card.cost >= 0 && card.rules.length > 5));
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
  assert.equal(preview.packetDamage, 13);
  r.topology.links.reverse();
  assert.equal(combatPreview(r).packetDamage, 13);
});

test("switches, compression and Packet Lens stack without caps; three online devices form a cluster", () => {
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
  // v3 has no switch cap: 5 + 2 overclock + 3 switches × 2 (Packet Lens) + 3 compression × 2
  // + 2 for the SOUTH cluster (three online devices in one band).
  assert.equal(combatPreview(r).packetDamage, 21);
});

test("power surge exhausts before drawing and cannot draw itself from an empty deck", () => {
  const r = battle();
  r.hand = ["surge"];
  r.drawPile = [];
  r.discardPile = [];
  const energy = r.energy;
  playInstant(r, 0);
  assert.equal(r.energy, energy + CARDS.surge.values.energy!);
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
  r.faultNodes = ["router1"];
  cast(r, "zero-day");
  assert.equal(combatPreview(r).packetDamage, 0);
  endTurn(r);
  assert.equal(r.packetBoost, 0);
});

test("forecast names exactly the cable the enemy severs", () => {
  const r = battle();
  r.enemies[0].id = "wraith";
  const preview = combatPreview(r);
  assert.equal(preview.faultTarget, "alpha::router1");
  assert.equal(preview.intent!.target, preview.faultTarget);
  endTurn(r);
  assert.equal(r.faultLinks[0], preview.faultTarget);
});

test("armored fibers and jam protection make disruption fail without hidden damage", () => {
  const r = battle();
  r.topology.links.forEach((link) => {
    link.armored = true;
  });
  r.enemies[0].id = "wraith";
  assert.equal(combatPreview(r).faultTarget, null);
  assert.equal(endTurn(r).integrityDamage, 0);
  r.enemies[0].id = "storm";
  r.enemies[0].turn = 0;
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
  r.enemies[0].turn = 9; // the tenth action: pressure 3, escalation level 3 (+1)
  assert.equal(combatPreview(r).incomingRaw, 6);
  assert.equal(combatPreview(r).shield, 2);
  assert.equal(combatPreview(r).incoming, 4);
  endTurn(r);
  assert.equal(r.shieldArrayUsed, true);
});

test("lethal packet damage cancels damage and disruption before temporary resources expire", () => {
  const r = battle();
  r.enemies[0].hp = 7;
  r.enemies[0].id = "wraith";
  const preview = combatPreview(r);
  assert.equal(preview.lethal, true);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.faultTarget, null);
  assert.equal(preview.intent!.target, undefined);
  const result = endTurn(r);
  assert.equal(result.defeated, true);
  assert.deepEqual(r.faultLinks, []);
});

test("pressure and the boss half-health phase have deterministic telegraphs", () => {
  const r = battle();
  r.enemies[0].turn = 6;
  assert.equal(intentFor(r, r.enemies[0]).amount, 4);
  assert.equal(intentFor(r, r.enemies[0]).pressure, 2);
  r.enemies[0].id = "core";
  r.enemies[0].turn = 1;
  r.enemies[0].hp = 50;
  // v4: a wounded guardian charges on its next action (section 6.2) …
  assert.equal(intentFor(r, r.enemies[0]).kind, "charge");
  assert.ok(intentFor(r, r.enemies[0]).early);
  assert.ok(intentFor(r, r.enemies[0], 1).ultimate, "… and unleashes on the one after");
  // … once per fight; enraged, its attacks and faults then grow.
  r.enemies[0].chargedEarly = true;
  assert.equal(intentFor(r, r.enemies[0]).amount, 6); // breach 4 + enraged 2
  assert.match(intentFor(r, r.enemies[0]).label, /ENRAGED/);
  r.enemies[0].turn = 2;
  assert.equal(intentFor(r, r.enemies[0]).amount, 1); // enraged jams chip 1
});

test("capacitor and Reserve Cell recharge only next turn; Grounded Core renews block", () => {
  const r = battle();
  r.energy = 3;
  r.relics = ["reserve-cell", "grounded-core"];
  cast(r, "capacitor");
  assert.equal(r.energy, 3);
  endTurn(r);
  // The turn's base, the capacitor's next-turn energy and Reserve Cell's carry of 2, uncapped.
  assert.equal(r.energy, RULES.baseEnergy + CARDS.capacitor.values.nextEnergy! + 2);
  assert.equal(r.reserveEnergy, 0);
  assert.equal(r.block, 1);
});

test("repair, recovery and redundancy cards apply their documented effects", () => {
  const r = battle();
  r.faultNodes = ["router1"];
  r.faultLinks = ["alpha::router1"];
  cast(r, "protocol");
  assert.deepEqual(r.faultNodes, []);
  assert.deepEqual(r.faultLinks, []);
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
  // Two channels: +2 burst and +2 block per channel.
  assert.equal(r.packetBoost, 4);
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
  assert.equal(r.block, CARDS["hardened-router"].values.block! + CARDS.bastion.values.block!);
  playLink(r, 0, "alpha", "switch2");
  playLink(r, 0, "switch2", "router3");
  playLink(r, 0, "router3", "omega");
  assert.equal(r.block, CARDS["hardened-router"].values.block! + CARDS.bastion.values.block! + CARDS.duplex.values.block!);
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
  assert.equal(combatPreview(r).packetDamage, 5 + 2 + RULES.bandwidthPerChannel);
});

test("reward rolls exclude basics, stay unique, and open an elite reward with an uncommon or better", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = battle();
    r.rng = seed;
    r.currentRoom = r.map.find(room => room.floor === 3 && room.type === "elite")!.id;
    r.enemies[0].hp = 1;
    endTurn(r);
    assert.equal(r.cardRewards.length, 3);
    assert.equal(new Set(r.cardRewards).size, 3);
    assert.ok(["uncommon", "rare", "legendary"].includes(CARDS[r.cardRewards[0]].rarity));
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

test("crossing the boss phase threshold never rewrites the already displayed intent", () => {
  const r = battle();
  r.enemies[0].id = "core";
  r.enemies[0].maxHp = 100;
  r.enemies[0].hp = 51;
  r.enemies[0].turn = 1;
  const preview = combatPreview(r);
  assert.equal(preview.incomingRaw, 4);
  assert.doesNotMatch(preview.intent!.label, /ENRAGED/);
  assert.equal(endTurn(r).integrityDamage, 4);
  // Crossing half health changes the next intent: the wounded Core charges early.
  const next = intentFor(r, r.enemies[0]);
  assert.match(next.label, /ENRAGED · WOUNDED · EVENT HORIZON/);
  assert.equal(next.kind, "charge");
});

test("dense fourteen-device routing stays complete and every term reconciles", () => {
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
      r.topology.links.push({ a: r.topology.nodes[a].id, b: r.topology.nodes[b].id, boosted: true });
  const preview = combatPreview(r);
  const terms = preview.damageTerms.reduce((sum, term) => sum + term.amount, 0);
  assert.equal(preview.packetDamage, terms);
  assert.equal(preview.independent, true);
  assert.equal(new Set(preview.signalPath).size, preview.signalPath.length);
  // Uncapped: the strongest route threads every switch and every amplified cable.
  const switches = r.topology.nodes.filter(node => node.role === "switch").map(node => node.id);
  assert.ok(switches.every(id => preview.signalPath.includes(id)));
  assert.ok(preview.channels >= 5);
});
