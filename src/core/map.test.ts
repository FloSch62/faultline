import test from "node:test";
import assert from "node:assert/strict";
import {
  createMap, connectsTo, encounterHealth, reachableRooms, minimumFights, packChance, designationChance, rollDesignation,
  FIGHT_ROOMS, REST_ROOMS, MIN_FIGHTS_PER_PATH,
} from "./map.ts";
import { chooseRoom } from "./run.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { planEncounter, roomScout } from "./encounter.ts";
import { DESIGNATIONS, ENEMIES, PACKS, designationsCompatible, eligibleDesignations } from "./enemies.ts";
import { STAGES } from "./stages.ts";
import { RULES } from "./cards.ts";
import type { MapRoom, RunState } from "./types.ts";

/** Every path from the first floor to the guardian, as room lists. */
function allPaths(map: MapRoom[]): MapRoom[][] {
  const walk = (room: MapRoom): MapRoom[][] => room.floor === 6 ? [[room]]
    : map.filter(next => connectsTo(room, next)).flatMap(next => walk(next).map(path => [room, ...path]));
  return map.filter(room => room.floor === 0).flatMap(walk);
}
/** A minimal run for the pure planners (no combat state needed). */
const planner = (stage: number, seed: number, map: MapRoom[], ascension = 0) =>
  ({ seed, stage, ascension, relics: [], archetype: "architect", map, currentRoom: null, phase: "map", enemies: [] }) as unknown as RunState;

test("2,400 seeded maps keep every invariant: reachability, fights, rest spacing, a market, events, packs and designations", () => {
  let secondEvents = 0;
  for (let seed = 1; seed <= 800; seed++) for (let stage = 0; stage < 3; stage++) {
    const mapSeed = Math.imul(seed, 0x9e3779b1);
    const map = createMap(stage, mapSeed);
    const run = planner(stage, mapSeed, map);
    const where = `${seed}/${stage}`;
    assert.equal(map.length, 19, where);
    for (const room of map) {
      const previous = map.filter(from => connectsTo(from, room));
      assert.ok(room.floor === 0 || previous.length > 0, `${where}/${room.id} unreachable`);
      assert.equal(new Set(room.exits).size, room.exits!.length);
      assert.ok(room.floor === 6 || room.exits!.length >= 1);
      for (const id of room.exits!) assert.ok(map.some(next => next.id === id && next.floor === room.floor + 1));
      const at = `${where}/${room.id}`;
      if (!FIGHT_ROOMS.includes(room.type)) {
        assert.equal(room.enemyId, undefined, `${at} has no hostile`);
        assert.ok(!room.pack && !room.designations && !room.designationHidden && !room.reinforced, `${at} carries nothing`);
        continue;
      }
      // Hostiles: a pool single, or a pack template (a stage I duo has no leader).
      const kind = room.type === "elite" ? "elite" : "battle";
      if (room.type === "boss") {
        assert.equal(room.enemyId, STAGES[stage].boss);
        assert.ok(!room.pack && !room.designations && !room.reinforced, `${at}: guardians carry no pack or ribbon`);
      } else if (room.pack) {
        const template = PACKS.find(t => t.stage === stage && t.room === kind && t.leader === (room.enemyId ?? null) &&
          t.escorts.join() === room.pack!.join());
        assert.ok(template, `${at} pack ${room.enemyId}+${room.pack} is a template`);
        if (stage === 0) assert.ok(room.floor >= RULES.packFromFloor && !room.enemyId, `${at} stage I duo`);
      } else {
        const pool: readonly string[] = room.type === "elite" ? STAGES[stage].elites : STAGES[stage].encounters;
        assert.ok(room.enemyId && pool.includes(room.enemyId), `${at} enemy`);
        assert.ok(room.type !== "elite" || stage === 0, `${at}: elites from stage II always lead an escort`);
      }
      // Designations: only on a leader or single, eligible, never repeated, one at ascension 0.
      if (room.designations) {
        assert.ok(room.enemyId && room.type !== "boss", `${at}: duos and guardians carry no ribbon`);
        assert.equal(room.designations.length, 1, `${at}: one designation at ascension 0`);
        const trio = room.pack?.length === 2;
        for (const id of room.designations) {
          assert.ok(eligibleDesignations(room.enemyId!, stage, !trio).includes(id), `${at} ${room.enemyId} may not carry ${id}`);
          if (id === "spiteful") assert.ok(!room.designationHidden, `${at}: Spiteful is never hidden`);
        }
        if (stage === 0) assert.ok(room.floor >= RULES.designationFromFloor, `${at}: stage I ribbons from floor 3`);
        const template = room.pack && PACKS.find(t => t.stage === stage && t.leader === room.enemyId && t.escorts.join() === room.pack!.join());
        const bad = room.designations.filter(id => DESIGNATIONS[id].kind === "bad");
        if (template) assert.ok(bad.every(id => DESIGNATIONS[id].threat <= template.headroom), `${at}: the ribbon fits the template's headroom`);
      } else {
        assert.ok(!room.designationHidden, `${at}: only a ribbon can hide`);
        if (room.type === "elite" && stage >= 1) assert.fail(`${at}: elites from stage II always carry a designation`);
      }
      if (room.reinforced) assert.ok(room.type === "elite" && stage >= 1, `${at}: the chart only reinforces elites`);
      // Every fight room's scouted pack matches the encounter it plans.
      const scout = roomScout(run, room);
      const plan = planEncounter(run, room);
      assert.deepEqual([...plan.enemies].sort((a, b) => Number(b.role !== "escort") - Number(a.role !== "escort")).map(enemy => enemy.id),
        scout.members, `${at} scouted members`);
      if (!scout.hidden) assert.deepEqual(scout.designations, plan.enemies.find(enemy => enemy.role !== "escort")?.designations ?? []);
      if (!scout.hidden || !room.designations?.includes("hardened")) {
        const planned = [...plan.enemies.filter(enemy => enemy.role !== "escort"), ...plan.enemies.filter(enemy => enemy.role === "escort")];
        assert.deepEqual(planned.map(enemy => enemy.maxHp), scout.health, `${at} scouted health`);
      }
    }
    const paths = allPaths(map);
    for (const path of paths) {
      const fights = path.filter(room => FIGHT_ROOMS.includes(room.type)).length;
      assert.ok(fights >= MIN_FIGHTS_PER_PATH, `${where} path ${path.map(r => r.id).join(">")} has ${fights} fights`);
      for (let i = 1; i < path.length; i++)
        assert.ok(!(REST_ROOMS.includes(path[i - 1].type) && REST_ROOMS.includes(path[i].type)), `${where} chains rest rooms`);
      assert.ok(path.filter(room => room.reinforced).length <= 1, `${where} path ${path.map(r => r.id).join(">")} crosses two reinforced elites`);
    }
    // Stage III elites are reinforced unless their path already crossed one.
    if (stage === 2) for (const elite of map.filter(room => room.type === "elite"))
      assert.ok(elite.reinforced || paths.some(path => path.includes(elite) && path.some(room => room !== elite && room.reinforced)), `${where}/${elite.id}`);
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

test("pack and designation rolls follow the stage rates, the hidden share and the ascension additions", () => {
  const count = (stage: number, ascension: number, seeds = 600) => {
    const tally = { normal: 0, packs: 0, trios: 0, leaders: 0, designated: 0, hidden: 0, elites: 0, eliteDesignated: 0, second: 0, eliteSecond: 0, good: 0, ribbons: 0 };
    for (let seed = 1; seed <= seeds; seed++) for (const room of createMap(stage, seed * 7919, ascension)) {
      if (room.type === "battle" && (stage > 0 || room.floor >= 2)) {
        tally.normal++;
        if (room.pack) tally.packs++;
        if (room.pack?.length === 2 && room.enemyId) tally.trios++;
        if (room.enemyId) tally.leaders++;
        if (room.designations) tally.designated++;
        if (room.designations?.length === 2) tally.second++;
      }
      if (room.type === "elite") {
        tally.elites++;
        if (room.designations) tally.eliteDesignated++;
        if (room.designations?.length === 2) tally.eliteSecond++;
      }
      if (room.designations) {
        if (room.designationHidden) tally.hidden++;
        for (const id of room.designations) { tally.ribbons++; if (DESIGNATIONS[id].kind === "good") tally.good++; }
      }
    }
    return tally;
  };
  const near = (value: number, target: number, slack: number, what: string) => assert.ok(Math.abs(value - target) <= slack, `${what}: ${value.toFixed(3)} vs ${target}`);
  const [one, two, three] = [count(0, 0), count(1, 0), count(2, 0)];
  near(one.packs / one.normal, RULES.packRate[0], 0.04, "stage I packs from floor 3");
  near(two.packs / two.normal, RULES.packRate[1], 0.04, "stage II packs");
  near(three.packs / three.normal, RULES.packRate[2], 0.04, "stage III packs");
  near(three.trios / three.packs, RULES.trioShare, 0.05, "stage III trio share");
  near(one.designated / one.leaders, RULES.designationRate[0], 0.05, "stage I designations");
  near(two.designated / two.leaders, RULES.designationRate[1], 0.05, "stage II designations");
  near(three.designated / three.leaders, RULES.designationRate[2], 0.05, "stage III designations");
  near(one.hidden / (one.designated + one.eliteDesignated), RULES.hiddenShare[0], 0.07, "stage I hidden share");
  near(two.hidden / (two.designated + two.eliteDesignated), RULES.hiddenShare[1], 0.05, "stage II hidden share");
  assert.equal(two.eliteDesignated, two.elites, "every stage II elite carries a designation");
  assert.equal(three.eliteDesignated, three.elites, "every stage III elite carries a designation");
  assert.ok(two.good / two.ribbons > 0.25, "heavy packs fall back to cargo");
  assert.equal(one.second + one.eliteSecond + two.second + three.second, 0, "one designation at ascension 0");
  // Ascension 9: +15 points of packs. Ascension 7: elites may carry two (RULES.eliteSecondDesignation).
  // Ascension 10: normals may (RULES.normalSecondDesignation of the stage's chance).
  const nine = count(1, 9, 300);
  near(nine.packs / nine.normal, RULES.packRate[1] + RULES.packRateAscensionBonus, 0.05, "ascension 9 packs");
  const seven = count(2, 7, 200);
  near(seven.eliteSecond / seven.elites, RULES.eliteSecondDesignation, 0.06, "ascension 7: stage III elites carry two at the rate");
  assert.equal(seven.second, 0, "ascension 7 leaves normals alone");
  const ten = count(2, 10, 200);
  assert.ok(ten.second > 0 && ten.second < ten.designated, "ascension 10: some normals carry two");
  for (let seed = 1; seed <= 200; seed++) for (const room of createMap(2, seed, 10)) if (room.designations?.length === 2) {
    const [a, b] = room.designations;
    assert.ok(designationsCompatible(a, b), `${a} + ${b}`);
    assert.ok(DESIGNATIONS[a].kind === "bad" || DESIGNATIONS[b].kind === "bad", "never two good ones");
  }
  // The chances themselves.
  assert.equal(packChance(0, 1), 0);
  assert.equal(packChance(0, 2), RULES.packRate[0]);
  assert.equal(packChance(1, 0, 9), RULES.packRate[1] + RULES.packRateAscensionBonus);
  assert.equal(designationChance(0, 1, "battle"), 0);
  assert.equal(designationChance(1, 3, "elite"), 1);
  assert.equal(designationChance(0, 3, "elite"), RULES.designationRate[0]);
  assert.equal(designationChance(2, 6, "boss"), 0);
});

test("the budget fallback turns a bad ribbon that breaks the template's headroom into cargo", () => {
  let random = 0;
  const sequence = (values: number[]) => () => values[random++ % values.length];
  // Stoked (threat 2) rolled against a template with headroom 1 falls back to Laden or Salvaged.
  const eligible = eligibleDesignations("nest", 1, true);
  const stoked = eligible.indexOf("stoked");
  const weights = eligible.map(id => DESIGNATIONS[id].weight);
  const before = weights.slice(0, stoked).reduce((a, b) => a + b, 0);
  const total = weights.reduce((a, b) => a + b, 0);
  random = 0;
  assert.equal(rollDesignation(sequence([(before + 0.5) / total, 0.1]), eligible, Infinity), "stoked");
  random = 0;
  const fallback = rollDesignation(sequence([(before + 0.5) / total, 0.1]), eligible, 1);
  assert.ok(fallback === "laden" || fallback === "salvaged", `${fallback}`);
  random = 0;
  assert.equal(rollDesignation(sequence([(before + 0.5) / total, 0.9]), eligible, 1), "salvaged");
  // Hardened (1.5) fits a headroom of 1.5.
  const hardened = eligible.indexOf("hardened");
  const at = weights.slice(0, hardened).reduce((a, b) => a + b, 0);
  random = 0;
  assert.equal(rollDesignation(sequence([(at + 0.5) / total]), eligible, 1.5), "hardened");
});

test("maps vary by seed and stage, persist exactly, and planning never consumes the card RNG", () => {
  assert.deepEqual(createMap(0, 42), createMap(0, 42));
  assert.notDeepEqual(createMap(0, 42), createMap(0, 43));
  assert.notDeepEqual(createMap(0, 42), createMap(1, 42));
  assert.notDeepEqual(createMap(2, 42, 9), createMap(2, 42, 0), "the ascension reaches the chart");
  for (let seed = 1; seed <= 20; seed++) {
    const e = newExpedition("architect", seed);
    assert.deepEqual(parseExpedition(JSON.stringify(e))?.run.map, e.run.map);
    const run = e.run;
    const randomBefore = run.rng;
    for (const room of run.map.filter(room => FIGHT_ROOMS.includes(room.type) && !room.pack)) {
      const hardened = room.designations?.includes("hardened") ? 1 + RULES.hardenedHealth : 1;
      assert.equal(planEncounter(run, room).enemies[0].maxHp, Math.round(encounterHealth(run.stage, room) * hardened), `${seed}/${room.id}`);
    }
    assert.equal(run.rng, randomBefore, "planning never touches the card RNG");
  }
});

test("entering a room fights exactly the planned encounter (engine integration)", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const e = newExpedition("architect", seed);
    for (const room of e.run.map.filter(room => room.enemyId || room.pack)) {
      const r = structuredClone(e.run);
      r.floor = room.floor;
      r.lastRoom = null;
      assert.equal(chooseRoom(r, room.id).ok, true);
      const plan = planEncounter(e.run, room);
      assert.deepEqual(r.enemies.map(enemy => [enemy.id, enemy.port, enemy.maxHp]), plan.enemies.map(enemy => [enemy.id, enemy.port, enemy.maxHp]), `${seed}/${room.id}`);
      assert.deepEqual(r.enemies.map(enemy => enemy.crate ?? null), plan.enemies.map(enemy => enemy.crate ?? null), "crates are fixed at the start");
      assert.deepEqual(r.reinforcement, plan.reinforcement);
    }
  }
});

test("ascension raises hostile integrity by room type and is shown by the same helper", () => {
  const battle = { id: "1-0", floor: 1, lane: 0, type: "battle", cleared: false } as MapRoom;
  const elite = { ...battle, type: "elite" } as MapRoom;
  const boss = { ...battle, id: "6-1", floor: 6, type: "boss" } as MapRoom;
  const event = { ...battle, type: "event" } as MapRoom;
  assert.equal(encounterHealth(0, battle, 0), 21);
  assert.equal(encounterHealth(0, battle, 1), 21);
  assert.equal(encounterHealth(0, battle, 2), Math.round(21 * 1.1));
  assert.equal(encounterHealth(0, elite, 0), 32);
  assert.equal(encounterHealth(0, elite, 1), Math.round(32 * 1.15));
  assert.equal(encounterHealth(0, boss, 5), STAGES[0].bossHp);
  assert.equal(encounterHealth(0, boss, 6), Math.round(STAGES[0].bossHp * 1.15));
  assert.equal(encounterHealth(0, event, 2), Math.round(Math.round(21 * 1.1) * RULES.eventHealthScale), "Signal in the Static: normal health × 1.4");
  const run = planner(0, 77, [], 6);
  assert.equal(planEncounter(run, { ...boss, enemyId: "regent" }).enemies[0].maxHp, encounterHealth(0, boss, 6));
  assert.ok(ENEMIES.regent.boss);
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
