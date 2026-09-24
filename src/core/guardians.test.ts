import test from "node:test";
import assert from "node:assert/strict";
import { ENEMIES, PACKS } from "./enemies.ts";
import { RULES } from "./cards.ts";
import { STAGES } from "./stages.ts";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { createMap, reachableRooms } from "./map.ts";
import { chooseRoom, chooseCardReward, chooseRelic, combatPreview, endTurn, intentFor, leaderOf } from "./run.ts";
import { makeEnemy } from "./encounter.ts";
import { MusicRotation, sceneTrack } from "./music.ts";

function encounter(id: string, turn = 0) {
  const r = newExpedition("architect", 922).run;
  chooseRoom(r, "0-1");
  r.enemies = [makeEnemy(id, "h1", "centre", "single", 100, { turn })];
  r.integrity = r.maxIntegrity = 100;
  r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  r.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "omega" });
  return r;
}

test("three stage guardians preserve the deck and relics, reset routes, heal, and only the Core ends the expedition", () => {
  const e = newExpedition("architect", 923), r = e.run;
  r.integrity = 2;
  const deck = [...r.deck];
  for (let stage = 0; stage < 3; stage++) {
    r.floor = 6; r.lastRoom = "5-1";
    assert.ok(chooseRoom(r, "6-1").ok);
    assert.equal(r.enemies[0].id, STAGES[stage].boss);
    assert.equal(r.bossIntroSeen, false);
    r.bossIntroSeen = true;
    r.enemies[0].hp = 1;
    r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
    r.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "omega" });
    assert.equal(endTurn(r).defeated, true);
    const relicCount = r.relics.length;
    chooseCardReward(r, null);
    if (stage < 2) {
      assert.equal(r.phase, "relic");
      assert.equal(parseExpedition(JSON.stringify(e))!.run.stage, stage);
      chooseRelic(r, r.relicRewards[0]);
      assert.equal(r.relics.length, relicCount + 1);
      assert.equal(r.stage, stage + 1);
      assert.equal(r.floor, 0);
      assert.equal(r.lastRoom, null);
      assert.equal(reachableRooms(r).length, 3);
      assert.ok(r.map.every(room => !room.cleared));
      assert.equal(r.phase, "map");
      assert.equal(r.integrity, Math.min(r.maxIntegrity, 2 + 6 * (stage + 1)));
      assert.deepEqual(r.deck, deck);
      assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
    } else { assert.equal(r.phase, "won"); assert.equal(r.floor, 7); }
  }
});

test("each stage has a distinct route map and its complete encounter pool (plus pack leaders) is reachable", () => {
  assert.notDeepEqual(createMap(0), createMap(1));
  assert.notDeepEqual(createMap(1), createMap(2));
  for (let stage = 0; stage < 3; stage++) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const r = newExpedition("architect", Math.imul(seed, 0x9e3779b1) >>> 0).run;
      r.stage = stage; r.map = createMap(stage, r.seed);
      chooseRoom(r, "0-1"); seen.add(leaderOf(r)!.id);
    }
    // v4: a pack room's centre is its template's leader (stage II packs include a Packet Leech).
    const leaders = PACKS.filter(pack => pack.stage === stage && pack.room === "battle" && pack.leader).map(pack => pack.leader!);
    assert.deepEqual([...seen].sort(), [...new Set([...STAGES[stage].encounters, ...leaders])].sort());
  }
});

test("all 30 hostiles have playable patterns and forecast exactly the damage, fields, faults and wear resolved", () => {
  assert.equal(Object.keys(ENEMIES).length, 30);
  for (const [id, definition] of Object.entries(ENEMIES)) {
    for (let turn = 0; turn < definition.pattern.length * 2; turn++) {
      const r = encounter(id, turn), p = combatPreview(r);
      assert.equal(intentFor(r, r.enemies[0]).kind, definition.pattern[turn % definition.pattern.length].kind);
      const hp = r.enemies[0].hp, integrity = r.integrity;
      const result = endTurn(r);
      assert.equal(result.packetDamage, p.packetDamage, id);
      assert.equal(r.enemies[0].hp, hp - p.packetDamage + p.enemyHealing, id);
      assert.equal(integrity - r.integrity, p.incoming, id);
      // Escalation level 2 jams and cuts twice: every landing target is forecast.
      assert.deepEqual(r.faultNodes, p.hostiles[0].jams, id);
      assert.deepEqual(r.faultLinks, p.hostiles[0].cuts, id);
      if (p.zoneThreat) assert.deepEqual(r.zoneEffects, [p.zoneThreat], id);
      assert.deepEqual(result.forecast.wear, p.wear, id);
      assert.deepEqual(r.installations.map(item => ({ x: item.x, z: item.z })), p.installTargets.filter(item => !item.destroyed).map(item => ({ x: item.x, z: item.z })), id);
    }
  }
});

test("Serpent pressure and Regent armor yield to a second channel", () => {
  for (const id of ["serpent", "regent"]) {
    const r = encounter(id), before = combatPreview(r);
    r.topology.nodes.push({ id: "router2", role: "router", x: 0, z: 2.5 });
    r.topology.links.push({ a: "alpha", b: "router2" }, { a: "router2", b: "omega" });
    const after = combatPreview(r);
    if (id === "serpent") assert.equal(after.incomingRaw, before.incomingRaw - 3);
    // Bandwidth plus 2 of the Regent's 4 armor stripped.
    else assert.equal(after.packetDamage, before.packetDamage + RULES.bandwidthPerChannel + 2);
  }
});

test("Marshal and Hollow Choir armor yield to any online firewall, not only a routed one", () => {
  for (const id of ["marshal", "cantor"]) {
    const r = encounter(id), before = combatPreview(r);
    // An online firewall on a side route (not the primary route) is enough.
    r.topology.nodes.push({ id: "firewall2", role: "firewall", x: 2.5, z: 2.5 }, { id: "router3", role: "router", x: -2.5, z: 2.5 });
    r.topology.links.push({ a: "alpha", b: "router3" }, { a: "router3", b: "firewall2" }, { a: "firewall2", b: "omega" });
    const after = combatPreview(r);
    assert.ok(after.online.includes("firewall2"));
    assert.equal(after.packetDamage, before.packetDamage + ENEMIES[id].armor!.amount + RULES.bandwidthPerChannel);
  }
});

test("Choirs alternate fields, Moth announces its jam band, Weaver punishes dense wiring", () => {
  for (const id of ["choir", "cantor"]) {
    assert.equal(combatPreview(encounter(id, 0)).zoneThreat!.kind, "suppression");
    assert.equal(combatPreview(encounter(id, 2)).zoneThreat!.kind, "corrosion");
    assert.equal(combatPreview(encounter(id, id === "cantor" ? 6 : 4)).zoneThreat!.kind, id === "cantor" ? "corrosion" : "suppression");
  }
  const moth = encounter("moth", 1);
  assert.equal(combatPreview(moth).hazardZone, "north");
  assert.equal(combatPreview(moth).faultTarget, null);
  moth.topology.nodes[2].z = -2.5;
  assert.equal(combatPreview(moth).faultTarget, "router1");
  const weaver = encounter("weaver", 2), before = combatPreview(weaver);
  weaver.topology.nodes.push({ id: "switch2", role: "switch", x: 1, z: 2 }, { id: "switch3", role: "switch", x: -1, z: 2 });
  weaver.topology.links.push({ a: "alpha", b: "switch2" }, { a: "switch2", b: "switch3" }, { a: "switch3", b: "omega" }, { a: "router1", b: "switch2" });
  assert.equal(combatPreview(weaver).incomingRaw, before.incomingRaw + 2);
});

test("new enraged enemies change the next intent without retroactively strengthening this one", () => {
  for (const id of ["reaver", "regent", "cantor"]) {
    const r = encounter(id, id === "cantor" ? 3 : 0);
    r.enemies[0].hp = 51; r.packetBoost = 5;
    const p = combatPreview(r);
    assert.ok(!p.intent!.label.includes("ENRAGED"));
    assert.equal(endTurn(r).integrityDamage, p.incoming);
    assert.ok(intentFor(r, r.enemies[0]).label.includes("ENRAGED"));
  }
});

test("each stage's battle playlist plays its full set before a repeat, including bag boundaries", () => {
  for (const { music } of STAGES) for (const random of [() => 0, () => .999, Math.random]) {
    const rotation = new MusicRotation(music.battle, random);
    const size = music.battle.length;
    const heard = Array.from({ length: size * 20 }, () => rotation.next());
    for (let i = 0; i < heard.length; i++) {
      if (i > 0) assert.notEqual(heard[i], heard[i - 1]);
      if (i % size === 0) assert.deepEqual(heard.slice(i, i + size).sort(), [...music.battle].sort());
    }
  }
});

test("crossing stages changes exploration and guardian scores while title and services retain their themes", () => {
  assert.deepEqual(STAGES.map((_, stage) => sceneTrack("explore", stage)),
    ["paths-of-copper", "prismatic-silence", "messages-in-the-dark"]);
  assert.deepEqual(STAGES.map((_, stage) => sceneTrack("boss", stage)),
    ["the-second-way-home", "shatter-the-choir", "the-blackout-core"]);
  assert.equal(sceneTrack("explore", null), "the-last-relay");
  for (const stage of [null, 0, 1, 2]) {
    assert.equal(sceneTrack("shop", stage), "the-copper-market");
    assert.equal(sceneTrack("sanctuary", stage), "a-light-left-on");
  }
});


test("compound intents forecast both targets; new fields cannot hurt until the next turn", () => {
  for (const [id, turn] of [["moth",1],["weaver",0],["regent",1],["cantor",1],["core",0],["core",2],["reaver",0]] as const) {
    const r = encounter(id, turn);
    if (id === "moth") r.topology.nodes[2].z = -2.5;
    const before = combatPreview(r);
    assert.ok(before.zoneThreat, id);
    assert.ok(before.intent!.field, id);
    if (["jam", "sever"].includes(before.intent!.kind)) assert.ok(before.faultTarget, id);
    assert.ok(!before.incomingTerms.some(term => /Corrosion/.test(term.label)), id);
    const result = endTurn(r);
    assert.equal(result.integrityDamage, before.incoming, id);
    assert.deepEqual(r.zoneEffects, [before.zoneThreat], id);
    const next = combatPreview(r);
    if (before.zoneThreat!.kind === "corrosion") assert.ok(next.incomingTerms.some(term => /Corrosion/.test(term.label)), id);
    // The same combination is completely cancelled by a finishing transmission.
    const lethal = encounter(id, turn); lethal.packetBoost = 200;
    assert.equal(combatPreview(lethal).zoneThreat, null);
    assert.equal(combatPreview(lethal).faultTarget, null);
    assert.equal(endTurn(lethal).defeated, true);
    assert.deepEqual(lethal.zoneEffects, []);
  }
});

test("stage threat raises displayed attacks by one per later stage and matches resolution", () => {
  for (const stage of [0, 1, 2]) {
    const r = encounter("leech"); r.stage = stage;
    const p = combatPreview(r);
    assert.equal(p.incomingRaw, 2 + stage);
    assert.equal(endTurn(r).integrityDamage, p.incoming);
  }
});
