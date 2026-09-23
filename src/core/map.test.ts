import test from "node:test";
import assert from "node:assert/strict";
import { createMap, connectsTo, encounterHealth, reachableRooms } from "./map.ts";
import { chooseRoom } from "./run.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { STAGES } from "./stages.ts";

test("seeded maps keep every room reachable, every path bounded, and at least five fights per stage", () => {
  for (let seed = 1; seed <= 500; seed++) for (let stage = 0; stage < 3; stage++) {
    const map = createMap(stage, Math.imul(seed, 0x9e3779b1));
    const fights = new Map<string, number>();
    for (const room of map) {
      const previous = map.filter(from => connectsTo(from, room));
      assert.ok(room.floor === 0 || previous.length > 0, `${seed}/${stage}/${room.id} unreachable`);
      assert.equal(new Set(room.exits).size, room.exits!.length);
      assert.ok(room.floor === 6 || room.exits!.length >= 1);
      for (const id of room.exits!) assert.ok(map.some(next => next.id === id && next.floor === room.floor + 1));
      const count = previous.length ? Math.min(...previous.map(from => fights.get(from.id)!)) : 0;
      fights.set(room.id, count + Number(["battle", "elite", "boss"].includes(room.type)));
      if (["cache", "forge"].includes(room.type)) {
        assert.ok(previous.every(from => !["cache", "forge"].includes(from.type)));
        assert.equal(room.enemyId, undefined);
      } else {
        const pool: readonly string[] = room.type === "boss" ? [STAGES[stage].boss] : room.type === "elite" ? STAGES[stage].elites : STAGES[stage].encounters;
        assert.ok(room.enemyId && pool.includes(room.enemyId));
      }
    }
    assert.ok(fights.get("6-1")! >= 5);
  }
});

test("maps vary by seed and stage, persist exactly, and scouting matches the actual encounter", () => {
  assert.deepEqual(createMap(0, 42), createMap(0, 42));
  assert.notDeepEqual(createMap(0, 42), createMap(0, 43));
  assert.notDeepEqual(createMap(0, 42), createMap(1, 42));
  for (let seed = 1; seed <= 20; seed++) {
    const e = newExpedition("architect", seed);
    assert.deepEqual(parseExpedition(JSON.stringify(e))?.run.map, e.run.map);
    for (const room of e.run.map.filter(room => room.enemyId)) {
      const r = structuredClone(e.run);
      r.floor = room.floor;
      const randomBefore = r.rng;
      assert.equal(chooseRoom(r, room.id).ok, true);
      assert.equal(r.enemy!.id, room.enemyId);
      assert.equal(r.enemy!.hp, encounterHealth(r.stage, room));
      // Map generation itself never consumes the deck/reward RNG.
      assert.equal(randomBefore, seed);
    }
  }
});

test("route legality follows the drawn exits and older maps retain adjacent-lane travel", () => {
  const e = newExpedition("architect", 42), r = e.run;
  r.floor = 1; r.lastRoom = "0-1";
  const from = r.map.find(room => room.id === r.lastRoom)!;
  from.exits = ["1-1"];
  assert.deepEqual(reachableRooms(r).map(room => room.id), ["1-1"]);
  assert.equal(chooseRoom(r, "1-0").ok, false);
  for (const room of r.map) { delete room.exits; delete room.enemyId; }
  const old = parseExpedition(JSON.stringify(e))!;
  assert.equal(reachableRooms(old.run).length, 3);
  assert.ok(chooseRoom(old.run, "1-0").ok);
  r.map[0].exits = ["6-1"];
  assert.equal(parseExpedition(JSON.stringify(e)), null);
});
