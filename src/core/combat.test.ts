import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES, baseCard, canUpgrade, isUpgraded, upgraded } from "./cards.ts";
import { newExpedition } from "./expedition.ts";
import {
  beginBattle,
  cableFrays,
  chooseRoom,
  combatPreview,
  consoleState,
  costFor,
  endTurn,
  intentFor,
  isBlocked,
  playGround,
  playInstant,
  playJunk,
  playLink,
  playProtocol,
  playZone,
  relocateNode,
  scrubMalware,
  useConsole,
} from "./run.ts";
import { crossesWreckage, terrainFor } from "./terrain.ts";
import type { Archetype, CardId, NetworkNode, RelicId, RunState } from "./types.ts";

/** A clean first-fight table: only terminals, a chosen hostile and intent index. */
function table(enemy = "wraith", turn = 0, archetype: Archetype = "architect"): RunState {
  const run = newExpedition(archetype, 0x5eed1234).run;
  chooseRoom(run, "0-1");
  run.enemy!.id = enemy;
  run.enemy!.hp = run.enemy!.maxHp = 200;
  run.enemy!.turn = turn;
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.hand = [];
  run.drawPile = Array(30).fill("guard");
  run.discardPile = [];
  run.nextNodeId = 1;
  return run;
}
function device(run: RunState, id: string, role: NetworkNode["role"], x: number, z: number, extra: Partial<NetworkNode> = {}) {
  run.topology.nodes.push({ id, role, x, z, ...extra });
}
function wire(run: RunState, ...chain: string[]) {
  for (let i = 1; i < chain.length; i++) run.topology.links.push({ a: chain[i - 1], b: chain[i] });
}
/** ALPHA → router → OMEGA at a given height. */
function route(run: RunState, id: string, z: number, x = 0) {
  device(run, id, "router", x, z);
  wire(run, "alpha", id, "omega");
}
const sum = (terms: { amount: number }[]) => terms.reduce((total, term) => total + term.amount, 0);

// ------------------------------------------------------------------ channels

test("channels count routes that share no device; each extra channel adds bandwidth", () => {
  const r = table();
  route(r, "r1", 0);
  assert.equal(combatPreview(r).channels, 1);
  assert.equal(combatPreview(r).packetDamage, RULES.baseRouteDamage);
  route(r, "r2", 2.5);
  route(r, "r3", -2.5);
  const p = combatPreview(r);
  assert.equal(p.channels, 3);
  assert.equal(p.packetDamage, RULES.baseRouteDamage + 2 * RULES.bandwidthPerChannel);
  assert.equal(p.channelPaths.length, 3);
  assert.deepEqual(p.channelPaths[0], p.signalPath);
  // A shared switch is a bottleneck: two routers behind one switch are one channel.
  const s = table();
  device(s, "sw", "switch", -2.5, 0);
  device(s, "a", "router", 0, 2.5);
  device(s, "b", "router", 0, -2.5);
  wire(s, "alpha", "sw", "a", "omega");
  wire(s, "sw", "b", "omega");
  assert.equal(combatPreview(s).channels, 1);
});

test("online devices sit on any live route; offline ones do nothing", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "fw", "firewall", 0, 2.5);
  device(r, "lb", "balancer", 2.5, -2.5);
  wire(r, "alpha", "fw"); // dead end: not on a route
  let p = combatPreview(r);
  assert.ok(!p.online.includes("fw"));
  assert.ok(!p.online.includes("lb"));
  wire(r, "r1", "lb", "omega");
  wire(r, "fw", "r1");
  p = combatPreview(r);
  assert.ok(p.online.includes("fw") && p.online.includes("lb") && p.online.includes("r1"));
  // One channel: the balancer adds +1 per channel.
  assert.ok(p.damageTerms.some(term => /Load balancers/.test(term.label) && term.amount === 1));
});

test("three online devices in one band form a cluster worth +2", () => {
  const r = table();
  device(r, "a", "router", -2.5, 2.5);
  device(r, "b", "switch", 0, 2.5);
  device(r, "c", "switch", 2.5, 2.5);
  wire(r, "alpha", "a", "b", "c", "omega");
  const p = combatPreview(r);
  assert.deepEqual(p.clusters, ["south"]);
  assert.ok(p.damageTerms.some(term => term.label === "SOUTH · Cluster" && term.amount === RULES.clusterDamage));
  assert.equal(p.packetDamage, sum(p.damageTerms));
});

test("switches and amplified cables are uncapped; the strongest route becomes primary", () => {
  const r = table();
  route(r, "r1", 0);
  for (let i = 0; i < 4; i++) device(r, `s${i}`, "switch", -3 + i * 2, -3.5);
  r.topology.links.push({ a: "alpha", b: "s0", boosted: true }, { a: "s0", b: "s1" }, { a: "s1", b: "s2" }, { a: "s2", b: "s3" }, { a: "s3", b: "r1", boosted: true });
  const p = combatPreview(r);
  assert.ok(p.signalPath.includes("s3"));
  // 5 + 4 switches + 2 amplified cables + NORTH cluster (4 online switches).
  assert.equal(p.packetDamage, 5 + 4 + 2 + RULES.clusterDamage);
});

// ------------------------------------------------------------------ firewalls, honeypots, devices

test("online firewalls anywhere block breaches and stack; Stateful and Zero Trust double them", () => {
  const r = table("prophet", 2); // breach 3
  route(r, "r1", 0);
  device(r, "f1", "firewall", -2.5, 2.5);
  device(r, "f2", "firewall", 2.5, 2.5, { stateful: true });
  wire(r, "alpha", "f1", "r2");
  device(r, "r2", "router", 0, 3.5);
  wire(r, "r2", "f2", "omega");
  let p = combatPreview(r);
  const firewalls = p.shieldTerms.find(term => term.label.startsWith("Online firewalls"))!;
  assert.equal(firewalls.amount, RULES.firewallBreachBlock * 3);
  assert.equal(p.incoming, 0);
  r.relics.push("zero-trust");
  p = combatPreview(r);
  assert.equal(p.shieldTerms.find(term => term.label.startsWith("Online firewalls"))!.amount, RULES.firewallBreachBlock * 6);
});

test("a cabled honeypot decoys jams and cuts; the attacker takes damage (Wraith ignores cuts)", () => {
  const jam = table("wraith", 2); // jam
  route(jam, "r1", 0);
  device(jam, "hp", "honeypot", 2.5, 2.5);
  wire(jam, "hp", "r1");
  let p = combatPreview(jam);
  assert.equal(p.faultTarget, "hp");
  assert.equal(p.enemyDamage, RULES.honeypotDamage);
  const before = jam.enemy!.hp;
  endTurn(jam);
  assert.equal(jam.faultNode, "hp");
  assert.equal(jam.enemy!.hp, before - RULES.baseRouteDamage - RULES.honeypotDamage);

  const cut = table("widow", 1); // sever
  route(cut, "r1", 0);
  device(cut, "hp", "honeypot", 2.5, 2.5);
  wire(cut, "hp", "r1");
  cut.relics.push("honeynet");
  p = combatPreview(cut);
  assert.equal(p.faultTarget, "hp::r1");
  assert.equal(p.enemyDamage, RULES.honeypotDamage + RULES.honeynetBonus);
  assert.ok(p.shieldTerms.some(term => term.label.startsWith("Honeynet")));

  const wraith = table("wraith", 0); // wraith sever ignores honeypots
  route(wraith, "r1", 0);
  device(wraith, "hp", "honeypot", -1, 1.6);
  wire(wraith, "hp", "r1");
  assert.notEqual(combatPreview(wraith).faultTarget, "hp::r1");
});

test("cache servers and PoE injectors act at turn start; a jam can take them offline", () => {
  const r = table("wraith", 1); // strike: no disruption
  route(r, "r1", 0);
  device(r, "cache", "cache", 2.5, 2.5);
  device(r, "poe", "power", -2.5, 2.5);
  wire(r, "r1", "cache", "omega");
  wire(r, "alpha", "poe", "r1");
  const p = combatPreview(r);
  assert.deepEqual(p.nextTurn, { energy: RULES.baseEnergy + 1, draw: RULES.handDraw + 1 });
  endTurn(r);
  assert.equal(r.energy, RULES.baseEnergy + 1);
  assert.equal(r.hand.length, RULES.handDraw + 1);
  // Wraith's next action jams the primary route's router: both devices go offline.
  r.enemy!.turn = 2;
  r.hand = [];
  const jammed = combatPreview(r);
  assert.equal(jammed.faultTarget, "r1");
  assert.deepEqual(jammed.nextTurn, { energy: RULES.baseEnergy, draw: RULES.handDraw });
  endTurn(r);
  assert.equal(r.energy, RULES.baseEnergy);
});

// ------------------------------------------------------------------ consoles and engines

test("Patch Cable links once per turn; SDN Controller allows a second use", () => {
  const r = table();
  device(r, "r1", "router", 0, 0);
  assert.equal(consoleState(r).id, "patch");
  assert.ok(useConsole(r, "alpha", "r1").ok);
  assert.equal(r.energy, 19);
  assert.ok(!useConsole(r, "r1", "omega").ok);
  r.relics.push("sdn-controller");
  assert.ok(useConsole(r, "r1", "omega").ok);
  assert.equal(combatPreview(r).packetDamage, RULES.baseRouteDamage);
  endTurn(r);
  assert.equal(r.consoleUses, 0);
});

test("Harden grants block plus one per online firewall", () => {
  const r = table("wraith", 1, "warden");
  route(r, "r1", 0);
  device(r, "f", "firewall", 2.5, 0);
  wire(r, "r1", "f", "omega");
  assert.ok(useConsole(r).ok);
  assert.equal(r.block, RULES.hardenShield + RULES.hardenPerFirewall);
});

test("Buffer stores ×multiplier, releases on the next transmission, and a toggle refunds", () => {
  const r = table("wraith", 1, "ghost"); // strike, then jam
  route(r, "r1", 0);
  assert.ok(useConsole(r).ok);
  assert.ok(useConsole(r).ok); // cancel
  assert.equal(r.buffering, false);
  assert.equal(r.consoleUses, 0);
  assert.ok(useConsole(r).ok);
  let p = combatPreview(r);
  assert.equal(p.packetDamage, 0);
  assert.equal(p.bufferGain, Math.floor(RULES.baseRouteDamage * RULES.bufferMultiplier));
  assert.equal(sum(p.damageTerms), 0);
  const hp = r.enemy!.hp, stored = p.bufferGain;
  endTurn(r);
  assert.equal(r.enemy!.hp, hp);
  assert.equal(r.buffer, stored);
  // Next turn the Wraith jams r1, but the buffer is released before the jam.
  r.drawPile = [];
  p = combatPreview(r);
  assert.equal(p.bufferRelease, stored);
  assert.equal(p.packetDamage, RULES.baseRouteDamage + stored);
  const result = endTurn(r);
  assert.equal(result.bufferReleased, stored);
  assert.equal(r.buffer, 0);
});

test("packet loss: a buffer is lost when no route survives into your next turn", () => {
  const r = table("wraith", 0, "ghost"); // sever on the only route
  route(r, "r1", 0);
  useConsole(r);
  const p = combatPreview(r);
  assert.equal(p.bufferAtRisk, true);
  const result = endTurn(r);
  assert.equal(result.bufferLost, true);
  assert.equal(r.buffer, 0);
  // With a second channel the cut leaves a live route and the buffer survives.
  const safe = table("wraith", 0, "ghost");
  route(safe, "r1", 0);
  route(safe, "r2", 2.5);
  useConsole(safe);
  assert.equal(combatPreview(safe).bufferAtRisk, false);
  endTurn(safe);
  assert.ok(safe.buffer > 0);
});

test("Backpressure stores prevented damage and adds it to the next transmission", () => {
  const r = table("wraith", 1, "warden"); // strike 3
  r.relics = ["backpressure"];
  route(r, "r1", 0);
  r.block = 10;
  const p = combatPreview(r), gain = Math.ceil(3 * RULES.backpressureRatio);
  assert.equal(p.backpressureGain, gain);
  endTurn(r);
  assert.equal(r.backpressure, gain);
  const next = combatPreview(r);
  assert.ok(next.damageTerms.some(term => term.label === "Backpressure" && term.amount === gain));
  endTurn(r);
  assert.equal(r.backpressure, 0);
});

// ------------------------------------------------------------------ protocols

test("protocols arm (max 2), fire on the matching intent, and go to discard", () => {
  const r = table("widow", 1); // sever
  route(r, "r1", 0);
  r.hand = ["failover-policy", "rate-limiter", "port-security"];
  assert.ok(playProtocol(r, 0).ok);
  assert.ok(playProtocol(r, 0).ok);
  assert.ok(!playProtocol(r, 0).ok);
  const p = combatPreview(r);
  assert.equal(p.faultTarget, null);
  assert.deepEqual(p.protocolTriggers.map(t => t.card), ["failover-policy"]);
  assert.ok(p.shieldTerms.some(term => term.label.startsWith("Failover Policy")));
  const result = endTurn(r);
  assert.deepEqual(result.protocolsTriggered, ["failover-policy"]);
  assert.equal(r.faultLink, null);
  assert.deepEqual(r.protocols, ["rate-limiter"]);
  assert.ok(r.discardPile.includes("failover-policy"));
});

test("Port Security and Tarpit damage can defeat the enemy before it acts", () => {
  const r = table("wraith", 2); // jam
  route(r, "r1", 0);
  r.enemy!.hp = 8;
  r.hand = ["port-security+"];
  playProtocol(r, 0);
  const p = combatPreview(r);
  assert.equal(p.lethal, false);
  assert.equal(p.enemyDefeatedByTraps, true);
  assert.equal(p.incoming, 0);
  const result = endTurn(r);
  assert.equal(result.defeated, true);
  assert.equal(r.phase, "reward");

  const boss = table("regent", 4); // charge
  route(boss, "r1", 0);
  boss.hand = ["tarpit"];
  playProtocol(boss, 0);
  assert.equal(combatPreview(boss).enemyDamage, 8);
});

test("Quarantine Rule cancels a hostile field; strike and breach protocols reduce damage", () => {
  const r = table("prophet", 0); // corrupt
  route(r, "r1", 0);
  r.hand = ["quarantine-rule"];
  playProtocol(r, 0);
  assert.equal(combatPreview(r).zoneThreat, null);
  endTurn(r);
  assert.equal(r.zoneEffects.length, 0);
  const s = table("wraith", 1); // strike 3
  route(s, "r1", 0);
  s.hand = ["rate-limiter"];
  playProtocol(s, 0);
  assert.equal(combatPreview(s).incoming, 0);
});

// ------------------------------------------------------------------ terrain, malware, junk

test("terrain is deterministic, calm on the first fight, and blocks wreckage sockets", () => {
  assert.deepEqual(terrainFor(9, 1, "3-0", false), terrainFor(9, 1, "3-0", false));
  assert.equal(terrainFor(9, 0, "0-1", true).terrain.debris.length, 0);
  let seen = 0;
  for (let seed = 1; seed < 200; seed++) {
    const layout = terrainFor(seed * 7919, seed % 3, "4-1", false);
    assert.ok(layout.terrain.debris.length >= 1 && layout.terrain.debris.length <= 3);
    assert.ok(layout.terrain.debris.every(spot => Math.hypot(spot.x, spot.z) >= 2));
    if (layout.field) {
      seen++;
      assert.equal(layout.field.permanent, true);
    }
  }
  assert.ok(seen > 20);
  const r = table();
  r.terrain = { name: "Test", description: "", debris: [{ x: 2.5, z: 2.4 }] };
  assert.match(isBlocked(r, 2.6, 2.4)!, /Wreckage/);
  r.hand = ["router"];
  assert.equal(playGround(r, 0, 2.6, 2.4).ok, false);
  assert.equal(r.hand.length, 1);
  device(r, "r1", "router", 0, 0);
  assert.equal(relocateNode(r, "r1", 2.5, 2.4).ok, false);
});

test("unarmored cables across wreckage fray and cost signal on the primary route", () => {
  const r = table();
  r.terrain = { name: "Test", description: "", debris: [{ x: -2.5, z: -2.4 }] };
  route(r, "r1", -2.4);
  let p = combatPreview(r);
  assert.equal(p.packetDamage, RULES.baseRouteDamage - RULES.frayedCableDamage);
  assert.ok(p.damageTerms.some(term => /Frayed cables ×1/.test(term.label)));
  // Armor shrugs off the wreck.
  r.topology.links.find(link => link.b === "r1")!.armored = true;
  assert.equal(combatPreview(r).packetDamage, RULES.baseRouteDamage);
  r.topology.links.find(link => link.b === "r1")!.armored = false;
  // A clean channel becomes the primary route; the frayed one still adds bandwidth.
  route(r, "r2", 0);
  p = combatPreview(r);
  assert.deepEqual(p.signalPath, ["alpha", "r2", "omega"]);
  assert.equal(p.packetDamage, RULES.baseRouteDamage + RULES.bandwidthPerChannel);
  // Fraying follows the devices: relocating mends the cable.
  const s = table();
  s.terrain = r.terrain;
  route(s, "r1", -2.4);
  assert.ok(relocateNode(s, "r1", 0, 2.4).ok);
  assert.equal(combatPreview(s).packetDamage, RULES.baseRouteDamage);
});

test("for one device set the route search prefers the path without frayed cables", () => {
  const r = table();
  device(r, "sw", "switch", -2.5, -2.4);
  device(r, "r1", "router", 2.5, 2.4);
  wire(r, "alpha", "sw", "r1", "omega");
  wire(r, "alpha", "r1");
  wire(r, "sw", "omega");
  assert.deepEqual(combatPreview(r).signalPath, ["alpha", "r1", "sw", "omega"]);
  // A wreck under ALPHA ↔ R1 frays only that path: the same devices route the other way.
  r.terrain = { name: "Test", description: "", debris: [{ x: -1.4, z: 1.2 }] };
  const p = combatPreview(r);
  assert.deepEqual(p.signalPath, ["alpha", "sw", "r1", "omega"]);
  assert.equal(p.packetDamage, RULES.baseRouteDamage + RULES.switchDamage);
});

test("the classic opener never frays, and link targeting forecasts fraying", () => {
  for (let seed = 1; seed < 200; seed++) {
    const { debris } = terrainFor(seed * 7919, seed % 3, "4-1", false).terrain;
    assert.ok(!crossesWreckage({ x: -5.3, z: 0 }, { x: 0, z: 0 }, debris));
    assert.ok(!crossesWreckage({ x: 0, z: 0 }, { x: 5.3, z: 0 }, debris));
  }
  const r = table();
  r.terrain = { name: "Test", description: "", debris: [{ x: -2.5, z: -2.4 }] };
  device(r, "r1", "router", 0, -2.4);
  assert.equal(cableFrays(r, "alpha", "r1", "fiber"), true);
  assert.equal(cableFrays(r, "alpha", "r1", null), true);
  assert.equal(cableFrays(r, "alpha", "r1", "armored-fiber+"), false);
  assert.equal(cableFrays(r, "r1", "omega", "fiber"), false);
});

test("permanent terrain fields never tick down and can be purged when hostile", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.zoneEffects = [{ zone: "center", kind: "suppression", turns: 3, permanent: true }];
  for (let i = 0; i < 4; i++) { r.enemy!.turn = 1; endTurn(r); }
  assert.equal(r.zoneEffects.length, 1);
  r.hand = ["purge-field"];
  assert.ok(playZone(r, 0, "center").ok);
  assert.equal(r.zoneEffects.length, 0);
});

test("malware siphons damage, is scrubbed for energy, and purged by band", () => {
  const r = table("leech", 1); // infect
  route(r, "r1", 0);
  const p = combatPreview(r);
  assert.ok(p.malwareTarget);
  endTurn(r);
  assert.equal(r.malware.length, 1);
  assert.equal(combatPreview(r).packetDamage, RULES.baseRouteDamage - RULES.malwarePenalty);
  assert.match(isBlocked(r, r.malware[0].x, r.malware[0].z)!, /Malware/);
  r.energy = 3;
  assert.ok(scrubMalware(r, r.malware[0].id).ok);
  assert.equal(r.energy, 3 - RULES.scrubCost);
  r.malware = [{ id: "malware1", x: 0, z: 2.6 }];
  r.hand = ["purge-field"];
  playZone(r, 0, "south");
  assert.equal(r.malware.length, 0);
});

test("junk: Packet Loss vanishes at end of turn, Worms hurt unless deleted, injections are seeded", () => {
  const r = table("choir", 2); // corrupt + 2 Packet Loss
  route(r, "r1", 0);
  const p = combatPreview(r);
  assert.deepEqual(p.junk, { card: "packet-loss", count: 2 });
  const pile = r.drawPile.length;
  const result = endTurn(r);
  assert.deepEqual(result.junkAdded, ["packet-loss", "packet-loss"]);
  assert.equal(r.drawPile.length + r.hand.length, pile + 2);
  r.hand = ["packet-loss", "worm", "worm"];
  assert.equal(playJunk(r, 0).ok, false);
  const withWorms = combatPreview(r);
  assert.ok(withWorms.incomingTerms.some(term => term.label === "Worm in hand ×2" && term.amount === 4));
  assert.ok(playJunk(r, 1).ok);
  assert.ok(r.exhaustPile.includes("worm"));
  r.enemy!.turn = 1;
  endTurn(r);
  assert.ok(r.exhaustPile.includes("packet-loss"));
  assert.ok(!r.deck.includes("packet-loss"));
});

// ------------------------------------------------------------------ upgrades and relics

test("upgraded cards keep their identity and apply better values", () => {
  assert.equal(baseCard("guard+"), "guard");
  assert.ok(isUpgraded("guard+") && canUpgrade("guard") && !canUpgrade("guard+"));
  assert.equal(upgraded("worm"), "worm");
  const r = table();
  r.hand = ["guard+", "fiber+"];
  playInstant(r, 0);
  assert.equal(r.block, CARDS["guard+"].values.block);
  r.relics.push("hot-swap");
  device(r, "r1", "router", 0, 0);
  assert.equal(costFor(r, 0), 0);
  const before = r.hand.length;
  playLink(r, 0, "alpha", "r1");
  assert.equal(r.hand.length, before - 1 + 1); // fiber+ draws one
  r.hand = ["router+"];
  assert.equal(costFor(r, 0), 1);
});

test("boss relics: Spanning Tree, Anycast, Jumbo Frames, BGP Hijack", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  r.relics = ["spanning-tree"];
  let p = combatPreview(r);
  assert.ok(!p.damageTerms.some(term => term.label.startsWith("Bandwidth")));
  assert.equal(p.packetDamage, RULES.baseRouteDamage * 2);
  r.relics = ["bgp-hijack"];
  p = combatPreview(r);
  assert.ok(p.damageTerms.some(term => term.label === "BGP Hijack"));
  assert.ok(p.incomingTerms.some(term => term.label.startsWith("BGP Hijack")));
  r.relics = ["anycast"];
  r.hand = ["firewall"];
  assert.equal(playGround(r, 0, 2.5, -2.5).ok, false);
  r.relics = ["jumbo-frames"];
  r.hand = [];
  assert.deepEqual(combatPreview(r).nextTurn, { energy: RULES.baseEnergy + 1, draw: RULES.handDraw - 1 });
  r.relics = ["zero-trust"];
  r.hand = ["fiber"];
  assert.equal(costFor(r, 0), 2);
});

test("SDN Controller costs a starting energy; Spare Parts adds a Fiber; Watchdog shields once", () => {
  const run = newExpedition("architect", 0xabcdef).run;
  run.relics.push("sdn-controller", "spare-parts");
  chooseRoom(run, "0-1");
  assert.equal(run.energy, RULES.baseEnergy - 1);
  assert.ok(run.hand.length >= RULES.handDraw + 1);
  const r = table("wraith", 1);
  r.relics = ["watchdog"];
  assert.ok(combatPreview(r).shieldTerms.some(term => term.label.startsWith("Watchdog")));
  endTurn(r);
  assert.ok(!combatPreview(r).shieldTerms.some(term => term.label.startsWith("Watchdog")));
});

// ------------------------------------------------------------------ ascension hooks

test("ascension 4, 9 and 10 raise attacks, lengthen fields and enrage guardians sooner", () => {
  const r = table("wraith", 1);
  const base = intentFor(r)!.amount;
  r.ascension = 4;
  assert.equal(intentFor(r)!.amount, base + 1);
  const f = table("prophet", 0);
  route(f, "r1", 0);
  f.ascension = 9;
  assert.equal(combatPreview(f).zoneThreat!.turns, RULES.hostileFieldTurns + 1);
  const g = table("regent", 0);
  g.enemy!.hp = Math.floor(g.enemy!.maxHp * 0.55);
  assert.ok(!intentFor(g)!.label.startsWith("ENRAGED"));
  g.ascension = 10;
  assert.ok(intentFor(g)!.label.startsWith("ENRAGED"));
  g.enemy!.turn = 5;
  g.enemy!.hp = g.enemy!.maxHp;
  g.ascension = 9;
  const ultimate = intentFor(g)!.amount;
  g.ascension = 10;
  assert.equal(intentFor(g)!.amount, ultimate + 2);
});

// ------------------------------------------------------------------ forecast contract

test("randomized boards: the preview is pure and matches resolution exactly", () => {
  const enemies = ["leech", "wraith", "storm", "sentinel", "prophet", "widow", "colossus", "serpent", "moth", "marshal", "choir", "weaver", "reaver", "regent", "cantor", "core"];
  const roles: NetworkNode["role"][] = ["router", "switch", "firewall", "honeypot", "cache", "power", "balancer"];
  let state = 7;
  const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 0x100000000);
  for (let trial = 0; trial < 160; trial++) {
    const r = table(enemies[trial % enemies.length], Math.floor(rand() * 6), (["architect", "warden", "ghost"] as const)[trial % 3]);
    r.enemy!.hp = 5 + Math.floor(rand() * 40);
    r.relics = (["backpressure", "honeynet", "zero-trust", "parallel-core", "packet-lens", "shield-array"] as RelicId[]).filter(() => rand() < 0.3);
    const count = 2 + Math.floor(rand() * 8);
    for (let i = 0; i < count; i++) {
      const x = -4 + (i % 4) * 2.6, z = -3 + Math.floor(i / 4) * 2.6;
      device(r, `d${i}`, roles[Math.floor(rand() * roles.length)], x, z, { configured: rand() < 0.2, upgraded: rand() < 0.2 });
    }
    const ids = r.topology.nodes.map(node => node.id);
    for (let i = 0; i < count * 2; i++) {
      const a = ids[Math.floor(rand() * ids.length)], b = ids[Math.floor(rand() * ids.length)];
      if (a !== b && !r.topology.links.some(link => (link.a === a && link.b === b) || (link.a === b && link.b === a)))
        r.topology.links.push({ a, b, boosted: rand() < 0.2, armored: rand() < 0.2 });
    }
    if (rand() < 0.3) r.malware = [{ id: "malware1", x: 6, z: 4 }];
    if (rand() < 0.4) r.protocols = [(["failover-policy", "port-security", "rate-limiter", "ips-signature", "quarantine-rule", "tarpit"] as CardId[])[Math.floor(rand() * 6)]];
    r.block = Math.floor(rand() * 6);
    r.buffer = rand() < 0.3 ? 6 : 0;
    r.backpressure = rand() < 0.2 ? 3 : 0;
    if (r.archetype === "ghost" && rand() < 0.5) r.buffering = true;
    r.hand = rand() < 0.2 ? ["worm"] : [];
    const snapshot = structuredClone(r);
    const p = combatPreview(r);
    assert.deepEqual(r, snapshot, "preview must not mutate");
    assert.equal(p.packetDamage, Math.max(0, sum(p.damageTerms)));
    const hp = r.enemy!.hp, integrity = r.integrity;
    const result = endTurn(r);
    assert.equal(result.packetDamage, p.packetDamage);
    assert.equal(result.integrityDamage, p.incoming, `trial ${trial}`);
    assert.equal(integrity - r.integrity, p.incoming);
    if (!result.defeated) {
      assert.equal(r.enemy!.hp, Math.min(r.enemy!.maxHp, hp - (p.buffering ? 0 : p.packetDamage) - p.enemyDamage + p.enemyHealing), `trial ${trial}`);
      assert.equal(r.energy, p.nextTurn.energy);
      if (p.intent?.kind === "sever") assert.equal(r.faultLink, p.faultTarget);
      if (p.intent?.kind === "jam") assert.equal(r.faultNode, p.faultTarget);
    } else assert.ok(p.lethal || p.enemyDefeatedByTraps);
  }
});

test("a full fourteen-device table forecasts in under 5 ms (15 ms on shared CI runners)", () => {
  const r = table();
  const spots = [[-3.5, -3], [-3.5, 0], [-3.5, 3], [-1.2, -3], [-1.2, 0], [-1.2, 3], [1.2, -3], [1.2, 0], [1.2, 3], [3.5, -3], [3.5, 0], [3.5, 3]];
  spots.forEach(([x, z], i) => device(r, `d${i}`, i % 2 ? "router" : "switch", x, z));
  // A dense but reachable mesh: every device links to its neighbours (~30 cables).
  for (let i = 0; i < spots.length; i++) {
    if (i % 3 < 2) wire(r, `d${i}`, `d${i + 1}`);
    if (i + 3 < spots.length) wire(r, `d${i}`, `d${i + 3}`);
    if (i % 3 < 2 && i + 4 < spots.length) wire(r, `d${i}`, `d${i + 4}`);
  }
  for (const i of [0, 1, 2]) wire(r, "alpha", `d${i}`);
  for (const i of [9, 10, 11]) wire(r, `d${i}`, "omega");
  for (let i = 0; i < 10; i++) combatPreview(r);
  // Best of several batches: scheduler noise only ever adds time, and test files
  // run as parallel processes. Shared CI runners are several times slower than a
  // desktop, so they get a wider budget; a real regression is far larger.
  let elapsed = Infinity;
  for (let batch = 0; batch < 8; batch++) {
    const start = performance.now();
    for (let i = 0; i < 10; i++) combatPreview(r);
    elapsed = Math.min(elapsed, (performance.now() - start) / 10);
  }
  const budget = process.env.CI ? 15 : 5;
  assert.ok(combatPreview(r).channels >= 3);
  assert.ok(elapsed < budget, `preview took ${elapsed.toFixed(2)} ms (budget ${budget} ms)`);
});

test("beginBattle installs terrain, salvage and resets every v3 resource", () => {
  const e = newExpedition("ghost", 0x77aa55);
  const r = e.run;
  r.buffer = 9; r.backpressure = 4; r.protocols = ["tarpit"]; r.malware = [{ id: "malware1", x: 0, z: 0 }];
  const room = { ...r.map.find(item => item.floor === 1 && item.type === "battle")!, id: "1-0", floor: 1 };
  beginBattle(r, room);
  assert.ok(r.terrain && r.terrain.debris.length >= 1);
  assert.equal(r.buffer, 0);
  assert.equal(r.backpressure, 0);
  assert.deepEqual(r.protocols, []);
  assert.deepEqual(r.malware, []);
  assert.ok(r.hand.filter(id => CARDS[id].target === "link").length >= 2);
  assert.ok(r.topology.nodes.filter(node => !node.fixed).every(node => node.salvage));
});

test("a cast field stacks with a permanent terrain field of the same kind in its band", () => {
  const run = table();
  route(run, "r1", -2.5);
  const base = combatPreview(run).packetDamage;
  run.zoneEffects = [{ zone: "north", kind: "resonance", turns: 3, permanent: true }];
  assert.equal(combatPreview(run).packetDamage, base + RULES.resonanceDamage);
  run.zoneEffects.push({ zone: "north", kind: "resonance", turns: 3 });
  const preview = combatPreview(run);
  assert.equal(preview.packetDamage, base + 2 * RULES.resonanceDamage);
  assert.ok(preview.damageTerms.some(term => term.label === "NORTH · Resonance ×2" && term.amount === 2 * RULES.resonanceDamage));
  assert.equal(endTurn(run).packetDamage, preview.packetDamage, "resolution matches the forecast");
});
