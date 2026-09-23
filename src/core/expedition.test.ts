import assert from "node:assert/strict";
import test from "node:test";
import { newExpedition, parseExpedition, dailySeed } from "./expedition.ts";
import {
  chooseRoom,
  playGround,
  playLink,
  endTurn,
  damageFromPath,
  signalPaths,
} from "./run.ts";

test("each archetype has its promised starting resources and survives a save round trip", () => {
  for (const id of ["architect", "warden", "ghost"] as const) {
    const e = newExpedition(id, 1234);
    assert.equal(e.run.relics.length, 1);
    assert.equal(e.run.deck.length, 19);
    if (id === "architect")
      assert.ok(e.run.deck.includes("relay") && e.run.deck.includes("duplex"));
    if (id === "warden")
      assert.ok(
        e.run.deck.includes("bastion") &&
          e.run.deck.includes("guard") && !e.run.deck.includes("barrier") &&
          e.run.deck.includes("hardened-router"),
      );
    if (id === "ghost")
      assert.ok(
        e.run.deck.includes("diagnostic") && e.run.deck.includes("pulse"),
      );
    assert.equal(e.run.integrity, { architect: 14, warden: 15, ghost: 12 }[id]);
    assert.equal(chooseRoom(e.run, "0-1").ok, true);
    assert.ok(e.run.hand.includes("router"));
    assert.ok(e.run.hand.filter((c) => c === "fiber").length >= 2);
    assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  }
});
test("daily expeditions repeat card draws and threats for the same date and loadout", () => {
  const seed = dailySeed(new Date("2026-09-22T04:00:00Z"));
  assert.equal(seed, 20260922);
  const a = newExpedition("ghost", seed, true),
    b = newExpedition("ghost", seed, true);
  chooseRoom(a.run, "0-0");
  chooseRoom(b.run, "0-0");
  assert.deepEqual(a.run, b.run);
});
test("invalid and incompatible save data falls back to a fresh menu", () => {
  assert.equal(parseExpedition("{broken"), null);
  assert.equal(parseExpedition("{}"), null);
  const e = newExpedition();
  e.run.deck.push("bad-card" as never);
  assert.equal(parseExpedition(JSON.stringify(e)), null);
  const f = newExpedition();
  f.run.integrity = -1;
  assert.equal(parseExpedition(JSON.stringify(f)), null);
  const g = newExpedition();
  g.run.topology.links.push({ a: "alpha", b: "missing" });
  assert.equal(parseExpedition(JSON.stringify(g)), null);
});
test("the displayed damage preview equals actual damage for independent and upgraded routes", () => {
  const e = newExpedition("architect", 9);
  chooseRoom(e.run, "0-1");
  const r = e.run;
  r.enemy!.hp = r.enemy!.maxHp = 100;
  r.energy = 20;
  r.hand = ["router", "fiber", "fiber", "router", "fiber", "fiber"];
  playGround(r, 0, 0, -2);
  playLink(r, 0, "alpha", "router1");
  playLink(r, 0, "router1", "omega");
  playGround(r, 0, 0, 2);
  playLink(r, 0, "alpha", "router2");
  playLink(r, 0, "router2", "omega");
  r.topology.nodes.find((n) => n.id === "router1")!.upgraded = true;
  const damage = damageFromPath(r, signalPaths(r)[0]);
  assert.equal(damage, 9);
  assert.equal(endTurn(r).packetDamage, damage);
});

test("older expeditions preserve state without injecting rare or legendary cards", () => {
  const e = newExpedition("architect", 88);
  chooseRoom(e.run, "0-1");
  delete e.cardSet;
  for (const key of ["deck", "hand", "drawPile", "discardPile"] as const)
    e.run[key] = e.run[key].filter(
      (id) => !["containerlab", "clabernetes"].includes(id),
    );
  const previous = structuredClone(e.run);
  const restored = parseExpedition(JSON.stringify(e))!;
  assert.equal(restored.cardSet, undefined);
  assert.deepEqual(restored.run.hand, previous.hand);
  assert.deepEqual(restored.run.topology, previous.topology);
  assert.deepEqual(restored.run.deck, previous.deck);
  assert.deepEqual(restored.run.drawPile, previous.drawPile);
  assert.deepEqual(parseExpedition(JSON.stringify(restored)), restored);
});
