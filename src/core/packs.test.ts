/** Packs and ports (design section 4): ports and port order, alternate-phase escorts,
 * deliveries on the target, merging and armor per port, overflow, focus, the enemy phase with
 * several hostiles, and the seven escort traits. */
import assert from "node:assert/strict";
import test from "node:test";
import { RULES } from "./cards.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import {
  channelKey, chooseRoom, combatPreview, endTurn, hardenBlock, intentFor, leaderOf, livingEnemies, playInstant, playProtocol,
  setFocus, useConsole, CONSOLES,
} from "./run.ts";
import type { Archetype, HostileRole, NetworkNode, Port, RunState } from "./types.ts";

type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number];
/** A clean table (first-fight terrain) with a hand-built pack. */
function pack(members: Member[], archetype: Archetype = "architect"): RunState {
  const run = newExpedition(archetype, 0x9ac4).run;
  chooseRoom(run, "0-1");
  run.enemies = members.map(([id, port, role, hp, turn], i) =>
    makeEnemy(id, `h${i + 1}`, port, role ?? (port === "centre" ? (members.length > 1 ? "leader" : "single") : "escort"), hp ?? 60, { turn: turn ?? 0 }));
  run.focus = run.enemies.some(enemy => enemy.port === "centre") ? "centre" : run.enemies[0].port;
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.hand = [];
  run.drawPile = Array(40).fill("guard");
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
function route(run: RunState, id: string, z: number, x = 0) {
  device(run, id, "router", x, z);
  wire(run, "alpha", id, "omega");
}
const hp = (run: RunState, port: Port) => run.enemies.find(enemy => enemy.port === port)!.hp;
const sum = (terms: { amount: number }[]) => terms.reduce((total, term) => total + term.amount, 0);

// ------------------------------------------------------------------ ports, cadence, intents

test("hostiles stand at ports and act in port order; escorts alternate phases, leaders act every phase", () => {
  const r = pack([["spark-mite", "left"], ["prophet", "centre"], ["relay-drone", "right"]]);
  route(r, "r1", 0);
  const p = combatPreview(r);
  assert.deepEqual(p.hostiles.map(hostile => hostile.port), ["left", "centre", "right"]);
  // Phase 1 is odd: the left escort acts, the right one is dormant.
  assert.deepEqual(p.hostiles.map(hostile => hostile.state), ["acts", "acts", "dormant"]);
  assert.equal(p.hostiles[2].intent?.kind, "dormant");
  endTurn(r);
  assert.equal(r.enemyPhase, 1);
  const q = combatPreview(r);
  assert.deepEqual(q.hostiles.map(hostile => hostile.state), ["dormant", "acts", "acts"]);
  // An escort's pattern advances only on the phases it acts.
  assert.equal(r.enemies[0].turn, 1);
  assert.equal(r.enemies[2].turn, 0);
  assert.equal(intentFor(r, r.enemies[2]).label, "STATIC JAB");
  // Phases ahead: the left escort is dormant next phase and acts (GNAW) the one after.
  assert.equal(intentFor(r, r.enemies[0], 0).kind, "dormant");
  assert.equal(intentFor(r, r.enemies[0], 1).kind, "sever");
  assert.equal(r.hostileActions, 2);
});

test("escorts and adds get no stage threat, pressure or enrage; ascension 4 still applies", () => {
  const r = pack([["splicer", "left", "escort", 60, 7], ["serpent", "centre", "leader", 60, 6]]);
  r.stage = 2;
  r.enemies[0].turn = 1; // LASH strike 2 on an odd phase
  const escort = intentFor(r, r.enemies[0]), leader = intentFor(r, r.enemies[1]);
  assert.equal(escort.amount, 2);
  assert.equal(escort.pressure, 0);
  // COIL CRUSH 2 + stage 2 + pressure floor(6 / 3) + escalation level 3 (its seventh action, stage III).
  assert.equal(leader.amount, 2 + 2 + 2 + 1);
  assert.equal(leader.escalation, 3);
  r.ascension = 4;
  assert.equal(intentFor(r, r.enemies[0]).amount, 3);
});

// ------------------------------------------------------------------ deliveries, the target, merge, armor, overflow

test("every live channel is a delivery; all land on the target and a pack sees today's total", () => {
  const r = pack([["spark-mite", "left"], ["prophet", "centre"]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  device(r, "lb", "balancer", -2.5, -2.5);
  wire(r, "alpha", "lb", "r1");
  const p = combatPreview(r);
  assert.equal(p.deliveries.length, 2);
  assert.ok(p.deliveries[0].primary && !p.deliveries[1].primary);
  // Primary: route 5 + one balancer point; bandwidth: 3 + one balancer point.
  assert.equal(p.deliveries[0].amount, RULES.baseRouteDamage + 1);
  assert.equal(p.deliveries[1].amount, RULES.bandwidthPerChannel + 1);
  assert.ok(p.deliveries.every(delivery => delivery.port === "centre"));
  assert.equal(p.ports.centre!.packet, p.packetDamage);
  assert.equal(p.packetDamage, sum(p.damageTerms));
  assert.equal(p.ports.left!.packet, 0);
});

test("every delivery lands on the target: it follows the target, persists between turns, and a new channel joins it", () => {
  const r = pack([["relay-drone", "left", "escort", 40], ["prophet", "centre", "leader", 60]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  const whole = RULES.baseRouteDamage + RULES.bandwidthPerChannel;
  assert.equal(combatPreview(r).deliveries[1].channelKey, channelKey(["alpha", "r2", "omega"]));
  assert.ok(setFocus(r, "left").ok);
  assert.equal(setFocus(r, "right").ok, false, "no hostile stands at the right port");
  let p = combatPreview(r);
  assert.ok(p.deliveries.every(delivery => delivery.port === "left"), "no channel can be sent anywhere else");
  assert.equal(p.ports.left!.merged, whole);
  assert.equal(p.ports.left!.packet, whole);
  assert.equal(p.ports.centre!.packet, 0);
  endTurn(r);
  assert.equal(r.focus, "left", "the target persists between turns");
  assert.equal(hp(r, "left"), 40 - whole);
  assert.ok(!("aims" in r), "a run keeps no per-channel aims");
  // A third channel is one more delivery on the same target.
  route(r, "r3", -2.5);
  p = combatPreview(r);
  assert.equal(p.deliveries.length, 3);
  assert.ok(p.deliveries.every(delivery => delivery.port === "left"));
  assert.equal(p.ports.left!.merged, whole + RULES.bandwidthPerChannel);
});

test("deliveries to one port merge before armor; armor and plating are paid once per port", () => {
  const r = pack([["relay-drone", "left", "escort", 80], ["sentinel", "centre", "leader", 80]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  // Both deliveries on the Sentinel: plating 2 is paid once.
  let p = combatPreview(r);
  assert.equal(p.ports.centre!.merged, RULES.baseRouteDamage + RULES.bandwidthPerChannel);
  assert.equal(p.ports.centre!.armor, 2);
  assert.equal(p.ports.centre!.packet, RULES.baseRouteDamage + RULES.bandwidthPerChannel - 2);
  // Target the escort: the whole packet moves with the target and the escort pays no plating.
  setFocus(r, "left");
  p = combatPreview(r);
  assert.equal(p.ports.left!.packet, RULES.baseRouteDamage + RULES.bandwidthPerChannel);
  assert.equal(p.ports.centre!.packet, 0);
  assert.equal(p.packetDamage, sum(p.damageTerms));
});

test("overflow flows to the focus, then to the next living port, and pays the receiving armor", () => {
  const r = pack([["relay-drone", "left", "escort", 4], ["sentinel", "centre", "leader", 40], ["spark-mite", "right", "escort", 20]]);
  route(r, "r1", 0);
  r.packetBoost = 10; // primary 15
  setFocus(r, "left");
  const p = combatPreview(r);
  // 15 on the Drone (4): 11 overflow to the next living port (the focus is the Drone itself).
  assert.equal(p.ports.left!.overflowOut, 11);
  assert.equal(p.ports.left!.overflowTo, "centre");
  assert.equal(p.ports.centre!.overflowIn, 11);
  assert.equal(p.ports.centre!.packet, 11 - 2, "the Sentinel's plating is paid by overflow");
  assert.equal(p.packetDamage, 4 + 9);
  assert.equal(p.packetDamage, sum(p.damageTerms));
  const result = endTurn(r);
  assert.deepEqual(result.deaths, ["h1"]);
  assert.equal(hp(r, "centre"), 40 - 9);
  // The focus follows rule 15 once its hostile is gone: the leader.
  assert.equal(r.focus, "centre");
});

test("a lethal packet on every port ends the encounter; one lethal port cancels only that hostile", () => {
  const r = pack([["spark-mite", "left", "escort", 3], ["prophet", "centre", "leader", 60]]);
  r.enemies[1].turn = 1; // RUST STRIKE 2
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  setFocus(r, "left");
  const p = combatPreview(r);
  assert.equal(p.lethal, false);
  assert.ok(p.ports.left!.lethal);
  // The Mite needs 3 of the packet: the surplus overflows into the leader.
  assert.equal(p.ports.left!.overflowOut, RULES.baseRouteDamage + RULES.bandwidthPerChannel - 3);
  assert.equal(p.ports.left!.overflowTo, "centre");
  assert.equal(p.hostiles[0].state, "cancelled");
  assert.equal(p.hostiles[0].incoming, 0);
  assert.equal(p.hostiles[1].state, "acts");
  assert.equal(p.incoming, 2, "only the leader's strike lands");
  endTurn(r);
  assert.equal(r.integrity, 98);
  assert.equal(livingEnemies(r).length, 1);
  // The last one standing: lethal ends the fight.
  r.packetBoost = 80;
  const last = combatPreview(r);
  assert.ok(last.lethal);
  assert.equal(last.incoming, 0);
  assert.equal(endTurn(r).defeated, true);
  assert.equal(r.phase, "reward");
});

test("focus defaults to the leader, else the healthiest; after a death the leader, else the weakest", () => {
  const duo = pack([["spark-mite", "left", "escort", 20], ["splicer", "right", "escort", 30]]);
  duo.focus = null;
  assert.equal(combatPreview(duo).focus, "left", "no leader and no focus: the living hostile with the lowest health");
  const trio = pack([["spark-mite", "left", "escort", 5], ["prophet", "centre", "leader", 60], ["splicer", "right", "escort", 30]]);
  route(trio, "r1", 0);
  trio.enemies[1].hp = 0;
  assert.equal(combatPreview(trio).focus, "left");
  assert.equal(setFocus(trio, "centre").ok, false);
  assert.ok(setFocus(trio, "right").ok);
  assert.equal(combatPreview(trio).focus, "right");
});

// ------------------------------------------------------------------ the enemy phase with several hostiles

test("one shared shield pool is consumed in port order; firewalls block every attack; corrosion counts once", () => {
  const r = pack([["relay-drone", "left", "escort", 60, 0], ["prophet", "centre", "leader", 60, 1]]);
  route(r, "r1", 0);
  device(r, "fw", "firewall", 2.5, 0);
  wire(r, "r1", "fw", "omega");
  r.zoneEffects = [{ zone: "center", kind: "corrosion", turns: 2 }];
  r.block = 3;
  const p = combatPreview(r);
  // Drone jab 1 (+1 uplink? no: the uplink boosts the leader) and the Prophet's strike 2 + uplink 1.
  const [drone, prophet] = p.hostiles;
  assert.equal(drone.raw, 1 + RULES.corrosionDamage, "corrosion rides the first attack");
  assert.equal(prophet.raw, 2 + RULES.uplinkBonus);
  // Firewalls: 1 against each strike; the pool of 3 covers the rest in port order.
  assert.equal(drone.incoming + prophet.incoming, p.incoming);
  assert.equal(p.incoming, Math.max(0, 3 - 1) + Math.max(0, 3 - 1) - 3);
  assert.equal(endTurn(r).integrityDamage, p.incoming);
});

test("Rate Limiter fires once, on the first matching attack; Failover cancels both halves of a twin cut", () => {
  const r = pack([["relay-drone", "left", "escort", 60, 0], ["prophet", "centre", "leader", 60, 1]]);
  route(r, "r1", 0);
  r.hand = ["rate-limiter"];
  playProtocol(r, 0);
  const p = combatPreview(r);
  assert.equal(p.protocolTriggers.length, 1);
  assert.equal(p.protocolTriggers[0].target, "h1", "the first strike in port order");
  assert.equal(p.hostiles[0].shieldTerms.length, 1);
  assert.equal(p.hostiles[1].shieldTerms.length, 0);
  // Twin cut: while a leader lives, the Splicer cuts two cables; Failover cancels both.
  const s = pack([["splicer", "left", "escort", 60, 0], ["prophet", "centre", "leader", 60, 1]]);
  route(s, "r1", 0);
  route(s, "r2", 2.5);
  let q = combatPreview(s);
  assert.equal(q.hostiles[0].cuts.length, RULES.twinCut);
  s.hand = ["failover-policy"];
  playProtocol(s, 0);
  q = combatPreview(s);
  assert.equal(q.hostiles[0].cuts.length, 0);
  assert.equal(q.hostiles[0].cancelled, RULES.twinCut);
  endTurn(s);
  assert.deepEqual(s.faultLinks, []);
});

test("a honeypot absorbs one disruption per hostile action and bites each attacker", () => {
  const r = pack([["ward-node", "left", "escort", 60], ["storm", "centre", "leader", 60]]);
  // Storm jams its announced band (NORTH on its first cycle); put the honeypot there.
  route(r, "r1", -2.5);
  device(r, "hp", "honeypot", 2.5, -2.5);
  wire(r, "hp", "r1");
  const p = combatPreview(r);
  assert.deepEqual(p.hostiles.map(hostile => hostile.jams), [["hp"], ["hp"]]);
  assert.deepEqual(p.hostiles.map(hostile => hostile.trapDamage), [RULES.honeypotDamage, RULES.honeypotDamage]);
  endTurn(r);
  assert.deepEqual(r.faultNodes, ["hp"]);
  assert.equal(hp(r, "left"), 60 - RULES.honeypotDamage);
  // A twin cut lands one cut past the honeypot.
  const s = pack([["splicer", "left", "escort", 60, 0], ["prophet", "centre", "leader", 60, 1]]);
  route(s, "r1", 0);
  device(s, "hp", "honeypot", 2.5, 2.5);
  wire(s, "hp", "r1");
  const q = combatPreview(s);
  assert.equal(q.hostiles[0].decoyed, 1);
  assert.equal(q.hostiles[0].cuts.length, 2);
  assert.ok(q.hostiles[0].cuts.some(key => key.includes("hp")));
});

test("hostile fields: each caster installs its own; a second caster on the same band replaces the first", () => {
  const r = pack([["glass-echo", "left", "escort", 60], ["prophet", "centre", "leader", 60]]);
  route(r, "r1", 0);
  const p = combatPreview(r);
  // REFRAIN (suppression on the routed band) then SEED CORROSION (the busiest band): both CENTER.
  assert.equal(p.hostiles[0].field?.kind, "suppression");
  assert.equal(p.hostiles[1].field?.kind, "corrosion");
  endTurn(r);
  assert.deepEqual(r.zoneEffects.map(field => field.kind), ["corrosion"]);
});

test("Hot Patch clears every active fault and repairs the most worn device", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  r.faultNodes = ["r1", "r2"];
  r.faultLinks = ["alpha::r1"];
  r.topology.nodes.find(node => node.id === "r2")!.condition = 1;
  r.hand = ["patch"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.faultNodes, []);
  assert.deepEqual(r.faultLinks, []);
  assert.equal(r.topology.nodes.find(node => node.id === "r2")!.condition, 2);
});

test("Warden backpressure lands in full on every port that struck last phase", () => {
  const r = pack([["relay-drone", "left", "escort", 60], ["prophet", "centre", "leader", 60, 1]], "warden");
  r.relics = ["backpressure"];
  route(r, "r1", 0);
  r.block = 20;
  const p = combatPreview(r);
  const stored = p.backpressureGain;
  assert.equal(stored, Math.ceil((1 + 2 + RULES.uplinkBonus) * RULES.backpressureRatio));
  endTurn(r);
  assert.deepEqual(r.attackers, ["h1", "h2"]);
  const q = combatPreview(r);
  // Phase 2: the Drone is dormant; both ports receive the release from last phase in full.
  assert.equal(q.ports.left!.bonus, stored);
  assert.equal(q.ports.centre!.bonus, stored);
  assert.equal(q.packetDamage, RULES.baseRouteDamage + 2 * stored);
  assert.equal(q.packetDamage, sum(q.damageTerms));
});

test("Siphon Taps come off the primary delivery first; Spanning Tree doubles the primary and zeroes bandwidth", () => {
  const r = pack([["relay-drone", "left", "escort", 60], ["prophet", "centre", "leader", 60]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  r.installations = [1, 2, 3].map(n => ({ id: `tap${n}`, kind: "tap" as const, x: -6 + n, z: 4.2, integrity: 1, activeFrom: 0, owner: "h2" }));
  let p = combatPreview(r);
  // 6 siphoned: all 5 of the primary, then 1 from the bandwidth delivery.
  assert.equal(p.deliveries[0].amount, 0);
  assert.equal(p.deliveries[1].amount, RULES.bandwidthPerChannel - 1);
  r.installations = [];
  r.relics = ["spanning-tree"];
  p = combatPreview(r);
  assert.equal(p.deliveries[0].amount, RULES.baseRouteDamage * 2);
  assert.equal(p.deliveries[1].amount, 0);
});

// ------------------------------------------------------------------ escort traits

test("Spark Mite swarm: +1 per other living hostile; alone it bites for 1", () => {
  const r = pack([["spark-mite", "left"], ["prophet", "centre", "leader", 60, 0], ["relay-drone", "right"]]);
  route(r, "r1", 0);
  assert.equal(combatPreview(r).hostiles[0].raw, 1 + 2 * RULES.swarmBonus);
  r.enemies[1].hp = 0;
  r.enemies[2].hp = 0;
  assert.equal(combatPreview(r).hostiles[0].raw, 1);
});

test("Splicer twin cut needs a leader; in a duo it cuts one", () => {
  const duo = pack([["splicer", "left"], ["spark-mite", "right"]]);
  route(duo, "r1", 0);
  route(duo, "r2", 2.5);
  assert.equal(combatPreview(duo).hostiles[0].cuts.length, 1);
});

test("Relay Drone uplink and Ward Node plating link couple to the living leader", () => {
  const r = pack([["relay-drone", "left", "escort", 60], ["prophet", "centre", "leader", 60, 1], ["ward-node", "right", "escort", 60]]);
  route(r, "r1", 0);
  let p = combatPreview(r);
  assert.ok(p.hostiles[1].terms.some(term => /uplink/.test(term.label) && term.amount === RULES.uplinkBonus));
  assert.equal(p.ports.centre!.armor, RULES.wardPlating);
  // An online firewall bypasses the plating; killing the Drone removes the uplink.
  device(r, "fw", "firewall", 2.5, 0);
  wire(r, "r1", "fw", "omega");
  r.enemies[0].hp = 0;
  p = combatPreview(r);
  assert.equal(p.ports.centre!.armor, 0);
  assert.ok(!p.hostiles.find(hostile => hostile.uid === "h2")!.terms.some(term => /uplink/.test(term.label)));
});

test("Tap Spinner web heals per Tap after it acts; Glass Echo's last echo boosts the leader's next attack", () => {
  const r = pack([["tap-spinner", "left", "escort", 30], ["prophet", "centre", "leader", 60, 1]]);
  route(r, "r1", 0);
  r.enemies[0].hp = 20;
  const p = combatPreview(r);
  assert.equal(p.hostiles[0].intent?.install, "tap");
  assert.equal(p.hostiles[0].heal, RULES.webHeal);
  endTurn(r);
  assert.equal(r.installations.length, 1);
  assert.equal(r.enemies[0].hp, 20 + RULES.webHeal);
  // The Echo dies to this transmission; the leader's strike in the same phase deals +3.
  const e = pack([["glass-echo", "left", "escort", 3], ["prophet", "centre", "leader", 60, 1]]);
  route(e, "r1", 0);
  setFocus(e, "left");
  const q = combatPreview(e);
  assert.ok(q.ports.left!.lethal);
  const strike = q.hostiles.find(hostile => hostile.uid === "h2")!;
  assert.ok(strike.terms.some(term => term.label === "Last echo" && term.amount === RULES.lastEchoBonus));
  assert.equal(endTurn(e).integrityDamage, q.incoming);
  assert.equal(e.enemies[1].echo, undefined, "the echo is spent");
});

test("Rigger Drone rigging: while a leader lives its Spikes arrive with integrity 3, beside the leader's target", () => {
  const r = pack([["rigger-drone", "left", "escort", 30], ["storm", "centre", "leader", 60, 0]]);
  route(r, "r1", -2.5); // Storm jams NORTH first
  const p = combatPreview(r);
  const spike = p.hostiles[0].install!;
  assert.equal(spike.kind, "spike");
  assert.equal(spike.integrity, RULES.riggedSpikeIntegrity);
  assert.equal(spike.aim, "r1", "beside the device the leader's jam names");
  const alone = pack([["rigger-drone", "left", "escort", 30], ["spark-mite", "right", "escort", 30]]);
  route(alone, "r1", 0);
  assert.equal(combatPreview(alone).hostiles[0].install!.integrity, RULES.installationIntegrity.spike);
});

test("leaderOf shows the centre, else the first living hostile", () => {
  const duo = pack([["spark-mite", "left"], ["splicer", "right"]]);
  assert.equal(leaderOf(duo)!.uid, "h1");
  const trio = pack([["spark-mite", "left"], ["prophet", "centre"], ["splicer", "right"]]);
  assert.equal(leaderOf(trio)!.id, "prophet");
  trio.enemies[1].hp = 0;
  assert.equal(leaderOf(trio)!.id, "spark-mite");
});

test("guardian break thresholds count only the packet on the guardian's port, +3 per living add", () => {
  const r = pack([["gate-warden", "left", "add", 8], ["regent", "centre", "single", 200, 5], ["gate-warden", "right", "add", 8]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  route(r, "r3", -2.5);
  r.packetBoost = 20;
  let p = combatPreview(r);
  assert.equal(p.ports.centre!.breakThreshold, 12 + 2 * RULES.addBreakBonus);
  // Target the left add: it falls, the threshold drops by 3, and the surplus overflows into the
  // guardian's port, where it counts toward the break (after armor).
  setFocus(r, "left");
  r.enemies[0].hp = 3;
  p = combatPreview(r);
  assert.ok(p.ports.left!.lethal);
  assert.equal(p.ports.left!.overflowTo, "centre");
  assert.equal(p.ports.centre!.overflowIn, p.ports.left!.overflowOut);
  assert.equal(p.ports.centre!.breakThreshold, 12 + RULES.addBreakBonus);
  assert.equal(p.ports.centre!.packet, p.ports.centre!.overflowIn - p.ports.centre!.armor);
  assert.ok(p.ports.centre!.breaks);
  assert.ok(p.interrupted);
  assert.equal(p.ports.right!.packet, 0, "the right add takes nothing");
});

// ------------------------------------------------------------------ Warden: Harden scales with attackers (M4)

test("Harden gains block per hostile beyond the first and per guardian add; one hostile is unchanged", () => {
  const base = RULES.hardenShield + RULES.hardenPerFirewall; // one online firewall below
  const table = (members: Member[]) => {
    const r = pack(members, "warden");
    device(r, "r1", "router", 0, 0);
    device(r, "fw", "firewall", -2.5, 0);
    wire(r, "alpha", "fw", "r1", "omega");
    r.consoleUses = 0;
    return r;
  };
  const single = table([["serpent", "centre", "single"]]);
  assert.equal(hardenBlock(single), base, "the single-hostile invariant: v3's Harden");
  const before = single.block;
  assert.ok(useConsole(single).ok);
  assert.equal(single.block - before, base);
  const trio = table([["spark-mite", "left"], ["serpent", "centre"], ["splicer", "right"]]);
  assert.equal(hardenBlock(trio), base + 2 * RULES.hardenPerHostile);
  const guardian = table([["chorister", "left", "add", 10], ["cantor", "centre", "single", 96], ["chorister", "right", "add", 10]]);
  assert.equal(hardenBlock(guardian), base + 2 * RULES.hardenPerHostile + 2 * RULES.hardenPerAdd);
  guardian.enemies[0].hp = 0;
  assert.equal(hardenBlock(guardian), base + RULES.hardenPerHostile + RULES.hardenPerAdd, "only living adds count");
  const blockBefore = guardian.block;
  assert.ok(useConsole(guardian).ok);
  assert.equal(guardian.block - blockBefore, hardenBlock(guardian), "the console grants exactly the preview");
  assert.match(CONSOLES.harden.rules, new RegExp(`\\+${RULES.hardenPerHostile} per hostile on the field beyond the first`));
  // Off by its keys: the design's Harden everywhere.
  const saved = { perHostile: RULES.hardenPerHostile, perAdd: RULES.hardenPerAdd };
  const rules = RULES as unknown as Record<string, number>;
  try {
    rules.hardenPerHostile = 0;
    rules.hardenPerAdd = 0;
    assert.equal(hardenBlock(trio), base);
  } finally {
    rules.hardenPerHostile = saved.perHostile;
    rules.hardenPerAdd = saved.perAdd;
  }
});
