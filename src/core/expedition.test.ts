import assert from "node:assert/strict";
import test from "node:test";
import { ARCHETYPES, newExpedition, parseExpedition, dailySeed, starterDeck } from "./expedition.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "./ascension.ts";
import { CARDS, STARTER_DECK } from "./cards.ts";
import { chooseRoom } from "./run.ts";
import type { CardId } from "./types.ts";

const count = (deck: CardId[], id: CardId) => deck.filter(card => card === id).length;

test("each archetype has its promised deck, relic, console and integrity, and survives a save round trip", () => {
  assert.equal(STARTER_DECK.length, 17);
  for (const id of ["architect", "warden", "ghost"] as const) {
    const e = newExpedition(id, 1234);
    const deck = e.run.deck;
    assert.equal(e.version, 3);
    assert.equal(e.run.archetype, id);
    assert.equal(e.run.ascension, 0);
    assert.equal(e.run.credits, 0);
    assert.deepEqual(e.run.relics, [ARCHETYPES[id].relic]);
    assert.equal(deck.length, 17);
    assert.deepEqual(deck, starterDeck(id));
    if (id === "architect") {
      assert.deepEqual([count(deck, "duplex"), count(deck, "relay"), count(deck, "load-balancer")], [1, 1, 1]);
      assert.deepEqual([count(deck, "fiber"), count(deck, "switch"), count(deck, "guard")], [3, 0, 1]);
      assert.equal(ARCHETYPES[id].console, "patch");
    }
    if (id === "warden") {
      assert.deepEqual([count(deck, "hardened-router"), count(deck, "router"), count(deck, "bastion"), count(deck, "firewall"), count(deck, "pulse")], [1, 1, 1, 1, 0]);
      assert.equal(ARCHETYPES[id].relic, "backpressure");
      assert.equal(ARCHETYPES[id].console, "harden");
    }
    if (id === "ghost") {
      assert.deepEqual([count(deck, "crosslink"), count(deck, "fiber"), count(deck, "diagnostic"), count(deck, "patch"), count(deck, "store-forward"), count(deck, "guard")], [2, 2, 1, 0, 1, 1]);
      assert.equal(ARCHETYPES[id].console, "buffer");
    }
    assert.equal(e.run.integrity, { architect: 14, warden: 15, ghost: 12 }[id]);
    assert.ok(deck.every(card => !CARDS[card].archetype || CARDS[card].archetype === id));
    assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
    assert.equal(chooseRoom(e.run, "0-1").ok, true);
    assert.ok(e.run.hand.some(card => CARDS[card].role === "router" && CARDS[card].target === "ground"));
    assert.ok(e.run.hand.filter(card => CARDS[card].target === "link").length >= 2);
    assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  }
});

test("ascension levels are cumulative expedition rules", () => {
  assert.equal(MAX_ASCENSION, 10);
  assert.deepEqual(ASCENSION_LEVELS.map(level => level.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const four = newExpedition("warden", 5, false, 4).run;
  assert.equal(four.ascension, 4);
  assert.ok(!four.deck.includes("cve"));
  const five = newExpedition("warden", 5, false, 5).run;
  assert.equal(count(five.deck, "cve"), 1);
  assert.equal(five.maxIntegrity, 15);
  const eight = newExpedition("warden", 5, false, 8).run;
  assert.equal(eight.maxIntegrity, 13);
  assert.equal(eight.integrity, 13);
  assert.equal(newExpedition("ghost", 5, false, 99).run.ascension, 10);
  assert.equal(newExpedition("ghost", 5, false, -3).run.ascension, 0);
});

test("daily expeditions repeat card draws and threats for the same date and loadout", () => {
  const seed = dailySeed(new Date("2026-09-22T04:00:00Z"));
  assert.equal(seed, 20260922);
  const a = newExpedition("ghost", seed, true),
    b = newExpedition("ghost", seed, true);
  b.startedAt = a.startedAt;
  chooseRoom(a.run, "0-0");
  chooseRoom(b.run, "0-0");
  assert.deepEqual(a, b);
});

test("invalid, tampered and pre-redesign saves fall back to a fresh menu", () => {
  assert.equal(parseExpedition("{broken"), null);
  assert.equal(parseExpedition("{}"), null);
  const tamper = (edit: (e: ReturnType<typeof newExpedition>) => void) => {
    const e = newExpedition("architect", 31);
    edit(e);
    return parseExpedition(JSON.stringify(e));
  };
  assert.ok(tamper(() => {}), "an untouched save loads");
  assert.equal(tamper(e => { (e as { version: number }).version = 2; }), null, "v2 saves predate the redesign");
  assert.equal(tamper(e => e.run.deck.push("bad-card" as never)), null);
  assert.equal(tamper(e => { e.run.integrity = -1; }), null);
  assert.equal(tamper(e => e.run.topology.links.push({ a: "alpha", b: "missing" })), null);
  assert.equal(tamper(e => { e.run.archetype = "ghost"; }), null, "run and expedition archetype agree");
  assert.equal(tamper(e => { e.run.ascension = 11; }), null);
  assert.equal(tamper(e => { e.run.credits = -5; }), null);
  assert.equal(tamper(e => { e.run.credits = 1.5; }), null);
  assert.equal(tamper(e => { e.run.protocols = ["failover-policy", "rate-limiter", "tarpit"]; }), null);
  assert.equal(tamper(e => { e.run.protocols = ["nonsense" as never]; }), null);
  assert.equal(tamper(e => { e.run.consoleUses = 3; }), null);
  assert.equal(tamper(e => { e.run.buffer = -1; }), null);
  assert.equal(tamper(e => { e.run.malware = [1, 2, 3, 4].map(i => ({ id: `m${i}`, x: 0, z: i })); }), null);
  assert.equal(tamper(e => { e.run.terrain = { name: "x", description: "y", debris: [{ x: Number.NaN, z: 0 }] }; }), null);
  assert.equal(tamper(e => { e.run.phase = "shop"; }), null, "a market phase needs a market");
  assert.equal(tamper(e => { e.run.phase = "event"; e.run.event = { id: "not-an-event", resolved: false }; }), null);
  assert.equal(tamper(e => { e.run.shop = { cards: [{ id: "router", price: -1, sold: false }], relics: [], removePrice: 50, upgradePrice: 40, removed: false, upgraded: false }; }), null);
  assert.equal(tamper(e => { e.run.topology.nodes.push({ id: "x", role: "mainframe" as never, x: 0, z: 0 }); }), null);
  assert.ok(tamper(e => {
    e.run.terrain = { name: "Collapsed rack row", description: "Wreckage blocks the north aisle.", debris: [{ x: 1, z: -3 }] };
    e.run.topology.nodes.push({ id: "cache1", role: "cache", x: 2, z: 2, salvage: true });
    e.run.zoneEffects = [{ zone: "north", kind: "resonance", turns: 99, permanent: true }, { zone: "north", kind: "resonance", turns: 3 }];
  }), "v3 terrain, salvage devices and permanent fields load");
});
