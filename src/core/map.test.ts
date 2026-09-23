import test from "node:test";
import assert from "node:assert/strict";
import { createMap, connectsTo, encounterHealth, reachableRooms, minimumFights, FIGHT_ROOMS, REST_ROOMS, MIN_FIGHTS_PER_PATH } from "./map.ts";
import { chooseRoom } from "./run.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { STAGES } from "./stages.ts";
import type { MapRoom } from "./types.ts";

/** Every path from the first floor to the guardian, as room lists. */
function allPaths(map: MapRoom[]): MapRoom[][] {
  const walk = (room: MapRoom): MapRoom[][] => room.floor === 6 ? [[room]]
    : map.filter(next => connectsTo(room, next)).flatMap(next => walk(next).map(path => [room, ...path]));
  return map.filter(room => room.floor === 0).flatMap(walk);
}

test("2,400 seeded maps keep every invariant: reachability, fights, rest spacing, a market and events", () => {
  let secondEvents = 0;
  for (let seed = 1; seed <= 800; seed++) for (let stage = 0; stage < 3; stage++) {
    const map = createMap(stage, Math.imul(seed, 0x9e3779b1));
    const where = `${seed}/${stage}`;
    assert.equal(map.length, 19, where);
    for (const room of map) {
      const previous = map.filter(from => connectsTo(from, room));
      assert.ok(room.floor === 0 || previous.length > 0, `${where}/${room.id} unreachable`);
      assert.equal(new Set(room.exits).size, room.exits!.length);
      assert.ok(room.floor === 6 || room.exits!.length >= 1);
      for (const id of room.exits!) assert.ok(map.some(next => next.id === id && next.floor === room.floor + 1));
      if (FIGHT_ROOMS.includes(room.type)) {
        const pool: readonly string[] = room.type === "boss" ? [STAGES[stage].boss] : room.type === "elite" ? STAGES[stage].elites : STAGES[stage].encounters;
        assert.ok(room.enemyId && pool.includes(room.enemyId), `${where}/${room.id} enemy`);
      } else assert.equal(room.enemyId, undefined, `${where}/${room.id} has no hostile`);
    }
    const paths = allPaths(map);
    for (const path of paths) {
      const fights = path.filter(room => FIGHT_ROOMS.includes(room.type)).length;
      assert.ok(fights >= MIN_FIGHTS_PER_PATH, `${where} path ${path.map(r => r.id).join(">")} has ${fights} fights`);
      for (let i = 1; i < path.length; i++)
        assert.ok(!(REST_ROOMS.includes(path[i - 1].type) && REST_ROOMS.includes(path[i].type)), `${where} chains rest rooms`);
    }
    assert.ok(minimumFights(map) >= MIN_FIGHTS_PER_PATH);
    assert.ok(map.some(room => room.type === "shop"), `${where} has a market`);
    const eventFloors = new Set(map.filter(room => room.type === "event").map(room => room.floor));
    assert.ok(eventFloors.size >= 1 && eventFloors.size <= 2, `${where} event floors`);
    assert.ok(map.filter(room => room.floor === 1).some(room => room.type === "event"));
    if (eventFloors.size === 2) secondEvents++;
    assert.deepEqual(map.filter(room => room.floor === 6).map(room => room.type), ["boss"]);
  }
  // The optional second Unknown signal is common but never mandatory.
  assert.ok(secondEvents > 200 && secondEvents < 2200, `second events: ${secondEvents}`);
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

test("ascension raises hostile integrity by room type and is shown by the same helper", () => {
  const battle = { id: "1-0", floor: 1, lane: 0, type: "battle", cleared: false } as MapRoom;
  const elite = { ...battle, type: "elite" } as MapRoom;
  const boss = { ...battle, id: "6-1", floor: 6, type: "boss" } as MapRoom;
  assert.equal(encounterHealth(0, battle, 0), 21);
  assert.equal(encounterHealth(0, battle, 1), 21);
  assert.equal(encounterHealth(0, battle, 2), Math.round(21 * 1.1));
  assert.equal(encounterHealth(0, elite, 0), 32);
  assert.equal(encounterHealth(0, elite, 1), Math.round(32 * 1.15));
  assert.equal(encounterHealth(0, boss, 5), STAGES[0].bossHp);
  assert.equal(encounterHealth(0, boss, 6), Math.round(STAGES[0].bossHp * 1.15));
  const e = newExpedition("warden", 77, false, 6);
  const room = e.run.map.find(item => item.floor === 0)!;
  assert.ok(chooseRoom(e.run, room.id).ok);
  assert.equal(e.run.enemy!.maxHp, encounterHealth(0, room, 6));
  assert.equal(e.run.enemy!.hp, e.run.enemy!.maxHp);
});

test("route legality follows the drawn exits", () => {
  const e = newExpedition("architect", 42), r = e.run;
  r.floor = 1; r.lastRoom = "0-1";
  const from = r.map.find(room => room.id === r.lastRoom)!;
  from.exits = ["1-1"];
  assert.deepEqual(reachableRooms(r).map(room => room.id), ["1-1"]);
  assert.equal(chooseRoom(r, "1-0").ok, false);
  r.map[0].exits = ["6-1"];
  assert.equal(parseExpedition(JSON.stringify(e)), null);
});
