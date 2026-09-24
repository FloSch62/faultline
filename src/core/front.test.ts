/** The table front (design section 5): installations, their placement, timing and effects,
 * scrub, Purge, quarantine, bites and Reclaim; condition, overload, wear, breakdown and repair;
 * the fourteen v4 cards and eight v4 relics. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES } from "./cards.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import {
  chooseRoom, combatPreview, conditionOf, costFor, endTurn, isBlocked, playGround, playInstant, playLink, playNode, playProtocol,
  playZone, repairNode, scrubInstallation, setFocus, useConsole, beginBattle,
} from "./run.ts";
import { bandSocket, reachSocket } from "./combat/board.ts";
import type { Archetype, HostileRole, Installation, InstallationKind, NetworkNode, Port, RelicId, RunState } from "./types.ts";

type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number];
function pack(members: Member[], archetype: Archetype = "architect"): RunState {
  const run = newExpedition(archetype, 0x7ab1e).run;
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
  run.terrain = { name: "Test", description: "", debris: [] };
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
function install(run: RunState, kind: InstallationKind, x: number, z: number, extra: Partial<Installation> = {}): Installation {
  const item: Installation = { id: `${kind}${run.installations.length + 1}`, kind, x, z, integrity: RULES.installationIntegrity[kind], activeFrom: 0, owner: "h1", ...(kind === "breaker" ? { countdown: RULES.breakerCountdown } : {}), ...extra };
  run.installations.push(item);
  return item;
}
const node = (run: RunState, id: string) => run.topology.nodes.find(item => item.id === id);

// ------------------------------------------------------------------ placement

test("reach sockets: twelve compass points at 1.6 from the target, clockwise from the far rail, then 2.0", () => {
  const r = pack([["nest", "centre"]]);
  route(r, "r1", 0);
  assert.deepEqual(reachSocket(r, { x: 0, z: 0 }), { x: 0, z: -1.6 }, "north first (the far rail is −z)");
  install(r, "tap", 0, -1.6);
  // North-north-east sits inside the Tap's clearance: the next point clockwise, east-north-east.
  assert.deepEqual(reachSocket(r, { x: 0, z: 0 }), { x: 1.39, z: -0.8 });
  // Every point of the first ring blocked: the second ring.
  const s = pack([["nest", "centre"]]);
  route(s, "r1", 0);
  // Twelve blockers at radius 0.5: every 1.6 point is within their clearance, no 2.0 point is.
  for (let k = 0; k < 12; k++) s.installations.push({ id: `x${k}`, kind: "tap", x: Math.round(0.5 * Math.sin(k * Math.PI / 6) * 100) / 100, z: Math.round(-0.5 * Math.cos(k * Math.PI / 6) * 100) / 100, integrity: 1, activeFrom: 0, owner: "h1" });
  assert.deepEqual(reachSocket(s, { x: 0, z: 0 }), { x: 0, z: -2 }, "the second ring, again from the north");
  // Band sockets keep the v3 malware rule.
  const t = pack([["leech", "centre"]]);
  device(t, "n1", "switch", 0, -2.6);
  device(t, "n2", "switch", 2.5, -2.6);
  assert.deepEqual(bandSocket(t), { x: -2.6, z: -2.6 }, "the busiest band (NORTH), its first free socket");
});

test("a Static Nest plants a Jammer beside the most valuable primary router; deterministic across runs", () => {
  const make = () => {
    const r = pack([["nest", "centre", "single", 60, 0]]);
    route(r, "r1", 0);
    route(r, "r2", 2.5);
    node(r, "r2")!.configured = true;
    return r;
  };
  const a = combatPreview(make()), b = combatPreview(make());
  assert.deepEqual(a.installTargets, b.installTargets);
  assert.equal(a.installTargets[0].kind, "jammer");
  assert.equal(a.installTargets[0].aim, "r2");
  assert.equal(Math.round(Math.hypot(a.installTargets[0].x, a.installTargets[0].z - 2.5) * 10) / 10, 1.6);
});

test("at most four installations: a fifth gives the oldest +1 integrity (maximum 3)", () => {
  const r = pack([["leech", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  install(r, "jammer", -6, 4.2);
  install(r, "tap", -3, 4.2);
  install(r, "tap", 3, 4.2);
  install(r, "tap", 6, 4.2);
  const p = combatPreview(r);
  assert.equal(p.installTargets[0].boosts, "jammer1");
  endTurn(r);
  assert.equal(r.installations.length, RULES.maxInstallations);
  assert.equal(r.installations[0].integrity, 3);
  r.enemies[0].turn = 1;
  endTurn(r);
  assert.equal(r.installations[0].integrity, RULES.maxInstallationIntegrity);
});

// ------------------------------------------------------------------ timing and effects

test("an installation acts from the next hostile action: idle when its planter acts last, active when a later hostile acts", () => {
  const single = pack([["nest", "centre", "single", 60, 0]]);
  route(single, "r1", 0);
  let p = combatPreview(single);
  assert.equal(p.installationEffects[0].effect, "idle");
  endTurn(single);
  assert.deepEqual(single.faultNodes, [], "no jam in the planting phase");
  p = combatPreview(single);
  assert.equal(p.installationEffects[0].effect, "jam");
  assert.equal(p.installationEffects[0].target, "r1");
  endTurn(single);
  assert.deepEqual(single.faultNodes, ["r1"]);
  // The Rigger Drone plants at the left port; the leader acts after it, so its Spike wears this phase.
  const r = pack([["rigger-drone", "left", "escort", 30], ["prophet", "centre", "leader", 60, 1]]);
  route(r, "r1", 0);
  p = combatPreview(r);
  assert.equal(p.installationEffects.find(effect => effect.kind === "spike")!.effect, "wear");
  assert.deepEqual(p.wear.map(item => item.nodeId), ["r1"]);
});

test("a cabled honeypot decoys a Jammer's jam and bites it; Port Security cancels one and hurts the Jammer", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  device(r, "hp", "honeypot", -2.5, 2.4);
  wire(r, "hp", "alpha");
  install(r, "jammer", 0, -1.6);
  let p = combatPreview(r);
  const effect = p.installationEffects[0];
  assert.equal(effect.target, "hp");
  assert.ok(effect.decoyed && effect.destroyed, "a bite of 3 destroys a 2-integrity Jammer");
  assert.equal(p.reclaim, RULES.reclaimShield);
  endTurn(r);
  assert.equal(r.installations.length, 0);
  assert.deepEqual(r.faultNodes, ["hp"]);
  const s = pack([["prophet", "centre", "single", 60, 1]]);
  route(s, "r1", 0);
  install(s, "jammer", 0, -1.6, { integrity: 3 });
  s.hand = ["port-security"];
  playProtocol(s, 0);
  p = combatPreview(s);
  assert.ok(p.installationEffects[0].cancelled);
  assert.equal(p.protocolTriggers[0].target, "jammer1");
  endTurn(s);
  assert.deepEqual(s.faultNodes, []);
  assert.equal(s.installations.length, 0, "Port Security's 4 destroys it");
});

test("a Spike wears the nearest device within reach (ties: primary route first), honeypots included", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  device(r, "sw", "switch", 3.2, 0);
  install(r, "spike", 1.6, 0);
  let p = combatPreview(r);
  assert.equal(p.installationEffects[0].target, "r1", "equidistant: the primary route first");
  endTurn(r);
  assert.equal(conditionOf(node(r, "r1")!), 1);
  const s = pack([["prophet", "centre", "single", 60, 1]]);
  route(s, "r1", 0);
  device(s, "hp", "honeypot", 2.5, 2.4);
  wire(s, "hp", "r1");
  install(s, "spike", 2.5, 0.8);
  p = combatPreview(s);
  assert.equal(p.installationEffects[0].target, "hp");
  assert.equal(p.enemyDamage, 0, "no bite from a Spike");
});

test("an Anchor stops its band's hostile fields from ticking; Purge destroys the Anchor and nothing else", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  r.zoneEffects = [{ zone: "center", kind: "corrosion", turns: 1 }];
  install(r, "anchor", 2.6, 0);
  endTurn(r);
  assert.deepEqual(r.zoneEffects, [{ zone: "center", kind: "corrosion", turns: 1 }]);
  r.hand = ["purge-field", "purge-field"];
  r.drawPile = [];
  assert.ok(playZone(r, 0, "center").ok);
  assert.equal(r.installations.length, 0);
  assert.equal(r.zoneEffects.length, 1, "the field needs a second purge");
  assert.equal(r.reclaim, RULES.reclaimShield);
  assert.ok(playZone(r, 0, "center").ok);
  assert.equal(r.zoneEffects.length, 0);
});

test("a Breaker Charge counts down in plain sight and its detonation breaks every device within reach", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  device(r, "sw", "switch", 1.4, 1.2, { condition: 2 });
  install(r, "breaker", 0.8, 1.2);
  let p = combatPreview(r);
  assert.deepEqual(p.installationEffects.map(effect => [effect.effect, effect.countdown]), [["tick", 1]]);
  r.enemies[0].turn = 1;
  endTurn(r);
  assert.equal(r.installations[0].countdown, 1);
  p = combatPreview(r);
  assert.equal(p.installationEffects[0].effect, "detonate");
  assert.deepEqual(p.breakdowns.map(item => item.nodeId).sort(), ["r1", "r2", "sw"]);
  r.enemies[0].turn = 1;
  endTurn(r);
  assert.ok(!["r1", "r2", "sw"].some(id => node(r, id)));
  assert.equal(r.topology.links.length, 0, "their cables go with them");
  const wrecks = r.terrain!.debris;
  assert.ok(wrecks.some(spot => spot.x === 0.8 && spot.z === 1.2), "the charge's socket becomes wreckage");
  assert.ok(wrecks.filter(spot => spot.fresh).every(spot => spot.fresh));
  assert.ok(wrecks.some(spot => spot.role === "router"));
});

test("firewall quarantine: each online firewall hits the nearest installation within reach; Sentry hits 2 and adds shield", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  device(r, "fw", "firewall", 2.5, 0);
  wire(r, "r1", "fw", "omega");
  install(r, "jammer", 2.5, 1.6);
  install(r, "tap", 4.4, 0);
  let p = combatPreview(r);
  assert.deepEqual(p.quarantine, [{ firewallId: "fw", installationId: "jammer1", damage: 1, destroys: false }]);
  node(r, "fw")!.sentry = true;
  p = combatPreview(r);
  assert.deepEqual(p.quarantine, [{ firewallId: "fw", installationId: "jammer1", damage: 2, destroys: true }]);
  assert.equal(p.reclaim, RULES.reclaimShield + RULES.sentryReclaimBonus);
  assert.ok(p.shieldTerms.some(term => /Reclaim/.test(term.label) && term.amount === RULES.reclaimShield + RULES.sentryReclaimBonus));
});

test("a honeypot bites an installation planted within reach: Taps arrive destroyed, Jammers with 1 less", () => {
  const r = pack([["leech", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  device(r, "hp", "honeypot", 1.3, 0.9);
  wire(r, "hp", "r1");
  let p = combatPreview(r);
  assert.ok(p.installTargets[0].bitten && p.installTargets[0].destroyed);
  endTurn(r);
  assert.equal(r.installations.length, 0);
  const s = pack([["nest", "centre", "single", 60, 0]]);
  route(s, "r1", 0);
  device(s, "hp", "honeypot", 1.6, -2.4);
  wire(s, "hp", "r1");
  p = combatPreview(s);
  assert.ok(p.installTargets[0].bitten && !p.installTargets[0].destroyed);
  assert.equal(p.installTargets[0].integrity, RULES.installationIntegrity.jammer - RULES.honeypotBite);
});

test("scrub removes one integrity per energy (two while a Quarantine Drone lives); Reclaim joins the pool and feeds backpressure", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]], "warden");
  r.relics = ["backpressure"];
  route(r, "r1", 0);
  install(r, "jammer", -6, 4.2);
  r.energy = 5;
  assert.ok(scrubInstallation(r, "jammer1").ok);
  assert.equal(r.installations[0].integrity, 1);
  assert.equal(r.energy, 4);
  assert.ok(scrubInstallation(r, "jammer1").ok);
  assert.equal(r.installations.length, 0);
  assert.equal(r.reclaim, RULES.reclaimShield);
  const p = combatPreview(r);
  // RUST STRIKE 2 against Reclaim 2: all prevented, half stored.
  assert.equal(p.incoming, 0);
  assert.equal(p.backpressureGain, Math.ceil(2 * RULES.backpressureRatio));
  endTurn(r);
  assert.equal(r.reclaim, 0, "Reclaim is never banked");
  const q = pack([["quarantine-drone", "left", "add", 14], ["core", "centre", "single", 132]]);
  install(q, "tap", 2.6, 0);
  q.energy = 1;
  assert.equal(scrubInstallation(q, "tap1").ok, false);
  q.energy = 2;
  assert.ok(scrubInstallation(q, "tap1").ok);
});

// ------------------------------------------------------------------ condition, overload, breakdown, repair

test("devices deploy with condition 2 (Reinforced Frame +1, Scorched Earth −1); salvage with 1", () => {
  const r = pack([["prophet", "centre"]]);
  r.hand = ["router", "router", "router"];
  playGround(r, 0, 0, 0);
  assert.equal(node(r, "router1")!.condition, RULES.deviceCondition);
  r.relics = ["reinforced-frame"];
  playGround(r, 0, 0, 2.4);
  assert.equal(node(r, "router2")!.condition, RULES.deviceCondition + 1);
  r.relics = ["scorched-earth"];
  playGround(r, 0, 0, -2.4);
  assert.equal(node(r, "router3")!.condition, RULES.deviceCondition - 1);
  const e = newExpedition("warden", 0x77aa55);
  beginBattle(e.run, { ...e.run.map.find(item => item.floor === 1 && item.type === "battle")!, id: "1-0", floor: 1 });
  for (const salvage of e.run.topology.nodes.filter(item => item.salvage)) assert.equal(salvage.condition, RULES.salvageCondition);
});

test("an overload follows the jam rule, ignores jam protection, prefers a cabled honeypot and bites", () => {
  const r = pack([["weaver", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  node(r, "r1")!.shielded = true;
  let p = combatPreview(r);
  assert.equal(p.intent?.kind, "overload");
  assert.deepEqual(p.wear, [{ nodeId: "r1", from: 2, to: 1, breaks: false, source: "WIRE WEAVER · OVERTENSION" }]);
  device(r, "hp", "honeypot", 2.5, 2.4);
  wire(r, "hp", "r1");
  p = combatPreview(r);
  assert.equal(p.wear[0].nodeId, "hp");
  assert.equal(p.enemyDamage, RULES.honeypotDamage);
});

test("a Server Rack shelters devices within reach: it takes the wear instead, carries no signal and takes no cable", () => {
  const r = pack([["weaver", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  r.hand = ["server-rack", "fiber"];
  assert.ok(playGround(r, 0, 1.6, 0.8).ok);
  const rack = r.topology.nodes.find(item => item.role === "rack")!;
  assert.equal(rack.condition, RULES.rackCondition);
  assert.equal(r.block, 3);
  assert.equal(playLink(r, 0, rack.id, "r1").ok, false);
  const p = combatPreview(r);
  assert.deepEqual(p.wear.map(item => [item.nodeId, item.sheltered]), [[rack.id, "r1"]]);
  endTurn(r);
  assert.equal(conditionOf(node(r, "r1")!), 2);
  assert.equal(conditionOf(rack), RULES.rackCondition - 1);
});

test("a breakdown removes the device and its cables and leaves fresh wreckage, up to the shared cap of 6", () => {
  const r = pack([["weaver", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  node(r, "r1")!.condition = 1;
  node(r, "r1")!.configured = true;
  r.hand = [];
  const discard = r.discardPile.length;
  const p = combatPreview(r);
  assert.deepEqual(p.breakdowns.map(item => item.nodeId), ["r1"]);
  endTurn(r);
  assert.ok(!node(r, "r1"));
  assert.ok(!r.topology.links.some(link => link.a === "r1" || link.b === "r1"));
  assert.deepEqual(r.terrain!.debris, [{ x: 0, z: 0, fresh: true, role: "router" }]);
  assert.equal(r.discardPile.length - discard, 0, "no card changes piles");
  // At the cap the socket is simply freed.
  const s = pack([["weaver", "centre", "single", 60, 1]]);
  s.terrain!.debris = [1, 2, 3, 4, 5, 6].map(i => ({ x: -7 + i * 0.1, z: 4.6 }));
  route(s, "r1", 0);
  node(s, "r1")!.condition = 1;
  endTurn(s);
  assert.equal(s.terrain!.debris.length, RULES.wreckCap);
});

test("a breakdown that removes the only route loses the Ghost's buffer at the start of the next turn", () => {
  const r = pack([["weaver", "centre", "single", 60, 1]], "ghost");
  route(r, "r1", 0);
  node(r, "r1")!.condition = 1;
  assert.ok(useConsole(r).ok);
  const p = combatPreview(r);
  assert.ok(p.bufferAtRisk);
  assert.ok(endTurn(r).bufferLost);
  assert.equal(r.buffer, 0);
});

test("repair restores one condition for 1 energy; Field Engineer makes the first repair each turn free", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  assert.equal(repairNode(r, "r1").ok, false, "intact");
  node(r, "r1")!.condition = 1;
  r.energy = 3;
  assert.ok(repairNode(r, "r1").ok);
  assert.equal(r.energy, 3 - RULES.repairCost);
  assert.equal(repairNode(r, "alpha").ok, false);
  r.relics = ["field-engineer"];
  r.repairsThisTurn = 0;
  node(r, "r1")!.condition = 1;
  assert.ok(repairNode(r, "r1").ok);
  assert.equal(r.energy, 2, "the first repair this turn is free");
});

test("Harden also restores 1 condition on the most worn device", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]], "warden");
  route(r, "r1", 0);
  node(r, "r1")!.condition = 1;
  assert.ok(useConsole(r).ok);
  assert.equal(node(r, "r1")!.condition, 2);
});

test("a Phantom Node absorbs the next disruption or installation in port order, then fades", () => {
  const r = pack([["ward-node", "left", "escort", 30], ["leech", "centre", "leader", 60, 1]], "ghost");
  route(r, "r1", 0);
  r.hand = ["phantom-node"];
  assert.ok(playGround(r, 0, -2.5, 2.4).ok);
  assert.equal(playLink(r, 0, "phantom1", "r1").ok, false, "phantoms are never cabled");
  const p = combatPreview(r);
  assert.equal(p.hostiles[0].absorbed, 1, "the Ward Node's SEAL is first in port order");
  assert.equal(p.hostiles[1].install?.kind, "tap");
  endTurn(r);
  assert.ok(!r.topology.nodes.some(item => item.role === "phantom"));
  assert.deepEqual(r.faultNodes, []);
  assert.equal(r.installations.length, 1);
});

// ------------------------------------------------------------------ cards

test("Broadcast Storm, Packet Storm and Flood Fill hit every port; Traffic Shaping adds to the target's packet and draws", () => {
  const r = pack([["relay-drone", "left", "escort", 60], ["prophet", "centre", "leader", 60]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  r.hand = ["broadcast-storm", "packet-storm", "flood-fill"];
  playInstant(r, 0);
  playInstant(r, 0);
  playInstant(r, 0);
  const every = CARDS["broadcast-storm"].values.everyPort! + CARDS["packet-storm"].values.everyPort! + 2 * CARDS["flood-fill"].values.perChannelEveryPort!;
  let p = combatPreview(r);
  assert.equal(p.ports.left!.packet, every);
  assert.equal(p.ports.centre!.packet, RULES.baseRouteDamage + RULES.bandwidthPerChannel + every);
  const s = pack([["relay-drone", "left", "escort", 60], ["prophet", "centre", "leader", 60]]);
  route(s, "r1", 0);
  route(s, "r2", 2.5);
  s.hand = ["traffic-shaping"];
  const drawn = s.drawPile.length;
  playInstant(s, 0);
  assert.equal(s.hand.length, 1, "it replaces itself");
  assert.equal(s.drawPile.length, drawn - 1);
  assert.deepEqual(s.exhaustPile, ["traffic-shaping"]);
  p = combatPreview(s);
  assert.equal(p.ports.left!.packet, 0);
  assert.equal(p.ports.centre!.packet, RULES.baseRouteDamage + RULES.bandwidthPerChannel + CARDS["traffic-shaping"].values!.focusBonus!);
  assert.ok(p.damageTerms.some(term => term.label === "CENTRE · target packet"));
  // It follows the target.
  setFocus(s, "left");
  p = combatPreview(s);
  assert.equal(p.ports.left!.packet, RULES.baseRouteDamage + RULES.bandwidthPerChannel + CARDS["traffic-shaping"].values!.focusBonus!);
  assert.equal(p.ports.centre!.packet, 0);
});

test("Demolition Charge adds to the target's packet and destroys the chosen installation", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  route(r, "r1", 0);
  install(r, "tap", -6, 4.2);
  install(r, "anchor", 6, 4.2);
  r.hand = ["demolition-charge"];
  assert.equal(playInstant(r, 0, "missing").ok, false);
  assert.ok(playInstant(r, 0, "anchor2").ok);
  assert.deepEqual(r.installations.map(item => item.id), ["tap1"]);
  assert.equal(r.reclaim, RULES.reclaimShield);
  assert.equal(combatPreview(r).packetDamage, RULES.baseRouteDamage - RULES.malwarePenalty + 2);
});

test("Quorum scales with other hostiles; Bulkhead adds firewall block per attack; Spearhead's release ignores armor", () => {
  const r = pack([["relay-drone", "left", "escort", 60], ["sentinel", "centre", "leader", 60, 2], ["spark-mite", "right"]], "warden");
  r.hand = ["quorum"];
  playInstant(r, 0);
  assert.equal(r.block, 3 + 2 * 2);
  route(r, "r1", 0);
  device(r, "fw", "firewall", 2.5, 0);
  wire(r, "r1", "fw", "omega");
  const before = combatPreview(r);
  r.hand = ["bulkhead"];
  playInstant(r, 0);
  const after = combatPreview(r);
  const firewall = (p: typeof before) => p.shieldTerms.filter(term => /firewalls/.test(term.label)).reduce((sum, term) => sum + term.amount, 0);
  assert.equal(firewall(after) - firewall(before), 2, "+1 per firewall against each of the two strikes");
  // Marshal armor 3 against a suppressed route (5 − 3) and a release of 10.
  const g = pack([["marshal", "centre", "single", 60, 0]], "ghost");
  route(g, "r1", 0);
  g.zoneEffects = [{ zone: "center", kind: "suppression", turns: 2 }];
  g.buffer = 10;
  assert.equal(combatPreview(g).packetDamage, 2 + 10 - 3);
  g.hand = ["spearhead"];
  playInstant(g, 0);
  const spear = combatPreview(g);
  assert.equal(spear.packetDamage, 10, "the release lands in full; the armor only meets the rest");
  assert.equal(spear.packetDamage, spear.damageTerms.reduce((sum, term) => sum + term.amount, 0));
});

test("Redundant PSU, Field Repair, Sentry Firewall and Rapid Redeploy do what they print", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]], "architect");
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  node(r, "r1")!.condition = 1;
  r.hand = ["redundant-psu"];
  assert.ok(playNode(r, 0, "r1").ok);
  assert.equal(node(r, "r1")!.condition, RULES.psuCondition);
  assert.equal(node(r, "r1")!.maxCondition, RULES.psuCondition);
  node(r, "r1")!.condition = 1;
  node(r, "r2")!.condition = 1;
  r.hand = ["field-repair"];
  playInstant(r, 0);
  assert.equal(node(r, "r1")!.condition, 3);
  assert.equal(node(r, "r2")!.condition, 2);
  r.hand = ["sentry-firewall+"];
  playGround(r, 0, 2.5, -2.4);
  const sentry = r.topology.nodes.at(-1)!;
  assert.ok(sentry.sentry && sentry.shielded);
  r.hand = ["rapid-redeploy"];
  r.discardPile = ["switch", "fiber", "router", "guard"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["router"], "the most recently discarded hardware card");
  assert.equal(costFor(r, 0), CARDS.router.cost - 1);
  playGround(r, 0, -2.5, -2.4);
  r.hand = ["router"];
  assert.equal(costFor(r, 0), CARDS.router.cost, "the discount is spent");
});

// ------------------------------------------------------------------ relics

test("Round Robin, Ingress Filter and Priority Queue", () => {
  const e = newExpedition("architect", 0x51);
  e.run.relics = ["round-robin"];
  chooseRoom(e.run, "0-1");
  assert.ok(e.run.enemies.every(enemy => enemy.hp === enemy.maxHp - RULES.roundRobinDamage));
  const r = pack([["relay-drone", "left", "escort", 10], ["prophet", "centre", "leader", 60, 1]]);
  route(r, "r1", 0);
  const raw = combatPreview(r).incomingRaw;
  r.relics = ["ingress-filter"];
  assert.equal(combatPreview(r).incomingRaw, raw - 2 * RULES.ingressFilterReduce);
  r.relics = ["priority-queue"];
  assert.equal(combatPreview(r).ports.centre!.packet, RULES.baseRouteDamage, "the leader is not the weakest");
  setFocus(r, "left");
  assert.equal(combatPreview(r).ports.left!.packet, RULES.baseRouteDamage + RULES.priorityQueueBonus);
});

test("Storm Control: +1 energy, and every hostile jam or cut that lands deals 1", () => {
  const r = pack([["wraith", "centre", "single", 60, 0]]);
  route(r, "r1", 0);
  r.relics = ["storm-control" as RelicId];
  const p = combatPreview(r);
  assert.ok(p.incomingTerms.some(term => /Storm Control/.test(term.label) && term.amount === RULES.stormControlDamage));
  assert.equal(p.nextTurn.energy, RULES.baseEnergy + 1);
});

test("Scorched Earth: the planter of a destroyed installation takes 4 (the focus if it is dead)", () => {
  const r = pack([["tap-spinner", "left", "escort", 30], ["prophet", "centre", "leader", 60]]);
  r.relics = ["scorched-earth"];
  install(r, "tap", -6, 4.2, { owner: "h1" });
  assert.ok(scrubInstallation(r, "tap1").ok);
  assert.equal(r.enemies[0].hp, 30 - RULES.scorchedEarthDamage);
  install(r, "tap", -6, 4.2, { owner: "h9" });
  assert.ok(scrubInstallation(r, r.installations[0].id).ok);
  assert.equal(r.enemies[1].hp, 60 - RULES.scorchedEarthDamage, "a dead or missing planter: the target takes it");
});

test("Racks count as hardware for clusters; installations block sockets", () => {
  const r = pack([["prophet", "centre", "single", 60, 1]]);
  device(r, "a", "router", -2.5, 2.4);
  device(r, "b", "switch", 0, 2.4);
  wire(r, "alpha", "a", "b", "omega");
  device(r, "rk", "rack", 2.5, 2.4);
  assert.deepEqual(combatPreview(r).clusters, ["south"]);
  install(r, "tap", 4.5, 3);
  assert.match(isBlocked(r, 4.6, 3)!, /installation/);
});
