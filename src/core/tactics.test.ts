import test from "node:test";
import assert from "node:assert/strict";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { ENEMIES } from "./enemies.ts";
import { chooseRoom, chooseForge, chooseRelic, combatPreview, endTurn, intentFor, prepareCard, releasePreparedCard, HAND_LIMIT, SALVAGE_COST } from "./run.ts";
import { RELICS } from "./cards.ts";
import type { RelicId } from "./types.ts";
import type { RunState } from "./types.ts";

function battle(id = "core", turn = 5) {
  const expedition = newExpedition("architect", 246);
  const r = expedition.run;
  chooseRoom(r, "0-1");
  const { name, title, color } = ENEMIES[id];
  r.enemy = { id, name, title, color, hp: 90, maxHp: 100, turn };
  r.integrity = r.maxIntegrity = 40;
  r.topology.nodes.push({ id: "r1", role: "router", x: 0, z: 0 });
  r.topology.links.push({ a: "alpha", b: "r1" }, { a: "r1", b: "omega" });
  return expedition;
}
const heldCards = (r: RunState) => [...r.hand, ...r.drawPile, ...r.discardPile, ...r.exhaustPile, ...(r.preparedCard ? [r.preparedCard] : [])].sort();

test("preparing conserves cards and energy, replaces one draw, and can be reversed", () => {
  const r = battle("leech", 0).run;
  r.hand = ["pulse", "guard", "fiber"];
  const before = structuredClone(r), cards = heldCards(r);
  assert.ok(prepareCard(r, 0).ok);
  assert.equal(r.preparedCard, "pulse");
  assert.deepEqual(r.hand, ["guard", "fiber"]);
  assert.equal(r.energy, before.energy);
  assert.equal(r.cardsPlayed, 0);
  assert.ok(!prepareCard(r, 0).ok);
  assert.deepEqual(heldCards(r), cards);
  assert.ok(releasePreparedCard(r).ok);
  assert.equal(r.preparedCard, null);
  assert.deepEqual(heldCards(r), cards);
  assert.ok(prepareCard(r, 2).ok);
  endTurn(r);
  assert.equal(r.hand[0], "pulse");
  assert.equal(r.hand.length, 6);
  assert.equal(r.preparedCard, null);
  assert.deepEqual(heldCards(r), cards);
});

test("prepared cards respect phases, hand limits, deep cache, saves, and victory cleanup", () => {
  const e = battle("leech", 0), r = e.run;
  assert.ok(!prepareCard(r, -1).ok);
  assert.ok(!prepareCard(r, .5).ok);
  assert.ok(!prepareCard(r, 200).ok);
  assert.ok(prepareCard(r, 0).ok);
  assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  const legacy = structuredClone(e);
  delete (legacy.run as Partial<RunState>).preparedCard;
  assert.equal(parseExpedition(JSON.stringify(legacy))!.run.preparedCard, null);
  (legacy.run as unknown as {preparedCard: string}).preparedCard = "bad-card";
  assert.equal(parseExpedition(JSON.stringify(legacy)), null);
  (legacy.run as unknown as {preparedCard: string[]}).preparedCard = ["pulse"];
  assert.equal(parseExpedition(JSON.stringify(legacy)), null);
  r.hand = Array(HAND_LIMIT).fill("fiber");
  assert.ok(!releasePreparedCard(r).ok);
  r.relics.push("deep-cache");
  endTurn(r);
  assert.equal(r.hand.length, 7);
  prepareCard(r, 0);
  const cards = heldCards(r);
  r.enemy!.hp = 1;
  endTurn(r);
  assert.equal(r.preparedCard, null);
  assert.deepEqual(heldCards(r), cards);
  assert.ok(!prepareCard(r, 0).ok);
});

test("every guardian telegraphs a zero-damage charge before its scaled ultimate", () => {
  for (const id of ["regent", "cantor", "core"]) {
    const r = battle(id, 4).run;
    r.stage = 2;
    r.enemy!.hp = 40;
    const charge = intentFor(r)!;
    assert.equal(charge.kind, "charge");
    assert.equal(charge.amount, 0);
    const ultimate = intentFor(r, 1)!;
    assert.ok(ultimate.ultimate);
    assert.equal(ultimate.amount, ENEMIES[id].pattern[5].amount + 1 + 2 + ENEMIES[id].enrages!.attacks);
    assert.equal(combatPreview(r).incoming, 0);
    endTurn(r);
    assert.deepEqual(intentFor(r), ultimate);
  }
});

test("interrupt requires actual post-armor damage, cancels the ultimate field, and exposes for one turn", () => {
  for (const id of ["regent", "cantor", "core"]) {
    const r = battle(id).run;
    const threshold = ENEMIES[id].boss!.breakDamage;
    r.packetBoost = threshold - combatPreview(r).packetDamage - 1;
    assert.equal(combatPreview(r).interrupted, false);
    r.packetBoost++;
    const p = combatPreview(r);
    assert.equal(p.packetDamage, threshold);
    assert.equal(p.interrupted, true);
    assert.equal(p.incoming, 0);
    assert.equal(p.zoneThreat, null);
    const result = endTurn(r);
    assert.equal(result.interrupted, true);
    assert.equal(r.enemy!.exposed, true);
    assert.equal(combatPreview(r).packetDamage, 8);
    assert.ok(combatPreview(r).damageTerms.some(t => t.label === "Exposed guardian"));
    endTurn(r);
    assert.equal(r.enemy!.exposed, undefined);
  }
});

test("interrupts do not erase existing corrosion or consume an unused Shield Array", () => {
  const e = battle(), r = e.run;
  r.relics = ["shield-array"];
  r.packetBoost = ENEMIES.core.boss!.breakDamage - 5;
  assert.equal(combatPreview(r).shield, 0);
  const clean = structuredClone(r);
  endTurn(clean);
  assert.equal(clean.shieldArrayUsed, false);
  r.zoneEffects = [{ zone: "center", kind: "corrosion", turns: 2 }];
  r.topology.nodes.push({ id: "f1", role: "firewall", x: 2, z: 0 });
  r.topology.links.push({ a: "r1", b: "f1" }, { a: "f1", b: "omega" });
  const p = combatPreview(r);
  assert.equal(p.incomingRaw, 2);
  assert.equal(p.incomingTerms.reduce((sum, t) => sum + t.amount, 0), 2);
  assert.equal(p.shield, 2);
  assert.ok(!p.shieldTerms.some(term => term.label.startsWith("Firewall")), "a broken breach cannot lend its firewall defense to corrosion");
  endTurn(r);
  assert.equal(r.shieldArrayUsed, true);
  assert.deepEqual(r.zoneEffects, [{ zone: "center", kind: "corrosion", turns: 1 }]);
  assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  (r.enemy as unknown as {exposed: string}).exposed = "true";
  assert.equal(parseExpedition(JSON.stringify(e)), null);
});

test("unbroken ultimates resolve the exact forecast; lethal takes priority over interrupt", () => {
  const r = battle().run;
  r.enemy!.hp = 51;
  const p = combatPreview(r);
  assert.ok(p.intent!.ultimate);
  assert.ok(p.incoming >= 11);
  assert.equal(endTurn(r).integrityDamage, p.incoming);
  assert.equal(r.enemy!.exposed, undefined);
  const kill = battle().run;
  kill.enemy!.hp = 1;
  kill.packetBoost = 20;
  assert.equal(combatPreview(kill).interrupted, false);
  const result = endTurn(kill);
  assert.equal(result.defeated, true);
  assert.equal(result.integrityDamage, 0);
  assert.equal(result.interrupted, false);
});

test("salvage trades maximum integrity once, persists its offers and leaves other services available when unaffordable", () => {
  const e = newExpedition("warden", 924), r = e.run;
  r.phase = "forge";
  r.currentRoom = r.map.find(room => room.type === "forge")!.id;
  const before = r.maxIntegrity;
  assert.ok(chooseForge(r, "relic").ok);
  assert.equal(r.maxIntegrity, before - SALVAGE_COST);
  assert.equal(r.integrity, r.maxIntegrity);
  assert.equal(r.relicRewards.length, 3);
  assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  assert.ok(!chooseForge(r, "relic").ok);
  assert.ok(chooseRelic(r, r.relicRewards[0]).ok);
  assert.equal(r.maxIntegrity, before - SALVAGE_COST);
  assert.equal(r.phase, "map");
  r.phase = "forge";
  r.maxIntegrity = r.integrity = 7;
  const poor = structuredClone(r);
  assert.ok(!chooseForge(r, "relic").ok);
  assert.deepEqual(r, poor);
  r.maxIntegrity = r.integrity = 8;
  assert.ok(chooseForge(r, "relic").ok);
  assert.equal(r.maxIntegrity, 6);
  r.phase = "forge";
  r.maxIntegrity = 15;
  r.relics = Object.keys(RELICS) as RelicId[];
  const complete = structuredClone(r);
  assert.ok(!chooseForge(r, "relic").ok);
  assert.deepEqual(r, complete);
});
