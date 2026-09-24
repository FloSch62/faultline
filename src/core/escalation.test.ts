/** Escalation (section 6.1), guardian charge timing (6.2) and guardian adds (4.5, 9.2, 10.4). */
import assert from "node:assert/strict";
import test from "node:test";
import { RULES } from "./cards.ts";
import { ASCENSION_RULES } from "./ascension.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import {
  chooseRoom, combatPreview, endTurn, escalationLevel, intentFor, playProtocol, scrubInstallation, setFocus,
} from "./run.ts";
import type { HostileRole, NetworkNode, Port, RunState } from "./types.ts";

type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number];
function pack(members: Member[], stage = 0): RunState {
  const run = newExpedition("architect", 0xe5ca1).run;
  chooseRoom(run, "0-1");
  run.stage = stage;
  run.enemies = members.map(([id, port, role, hp, turn], i) =>
    makeEnemy(id, `h${i + 1}`, port, role ?? (port === "centre" ? (members.length > 1 ? "leader" : "single") : "escort"), hp ?? 200, { turn: turn ?? 0 }));
  run.focus = "centre";
  run.integrity = run.maxIntegrity = 200;
  run.energy = 20;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.hand = [];
  run.drawPile = Array(60).fill("guard");
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
const leader = (run: RunState) => run.enemies.find(enemy => enemy.port === "centre")!;

// ------------------------------------------------------------------ levels

test("levels arrive on the stage's cadence: I–II from action 4 every 3, III from action 3 every 2", () => {
  const r = pack([["serpent", "centre"]]);
  const at = (action: number) => escalationLevel(r, leader(r), action);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(at), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
  r.stage = 1;
  assert.equal(at(4), 1);
  r.stage = 2;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(at), [0, 0, 1, 1, 2, 2, 3]);
  // Stoked: one action sooner (stage III: two).
  leader(r).designations = ["stoked"];
  assert.deepEqual([1, 2, 3, 4, 5].map(at), [1, 1, 2, 2, 3]);
  r.stage = 0;
  assert.deepEqual([3, 6, 9].map(at), [1, 2, 3]);
  // SURGE advances one level at once (maximum 3).
  leader(r).designations = [];
  leader(r).surge = 1;
  assert.equal(at(1), 1);
  assert.equal(at(10), 3);
});

test("escorts and adds never escalate; the leader is the clock, counted on its own actions", () => {
  const r = pack([["spark-mite", "left", "escort", 60, 20], ["serpent", "centre", "leader", 200, 9], ["gate-warden", "right", "add", 60, 20]], 2);
  r.enemyPhase = 0;
  const p = combatPreview(r);
  assert.deepEqual(p.hostiles.map(hostile => hostile.escalation), [0, 3, 0]);
  assert.equal(escalationLevel(r, r.enemies[0], 50), 0);
  // The escalation layer flag turns levels (and the charge at half health) off.
  const rules = RULES as unknown as Record<string, number>;
  const saved = rules.escalationStart;
  rules.escalationStart = 99;
  try { assert.equal(intentFor(r, leader(r)).escalation, 0); } finally { rules.escalationStart = saved; }
});

test("the gauge names the next level two actions ahead with its rule", () => {
  const r = pack([["storm", "centre", "single", 200, 1]]); // coming action 2: level 1 arrives at action 4
  const p = combatPreview(r);
  assert.deepEqual(p.hostiles[0].nextLevel, { level: 1, inActions: 2, rule: "a cut also frays the next cable on your primary route; a jam lasts two turns" });
  leader(r).turn = 0;
  assert.equal(combatPreview(r).hostiles[0].nextLevel, null);
});

test("level 1: a jam lasts two player turns; a cut frays the next cable along the primary route", () => {
  const r = pack([["storm", "centre", "single", 200, 3]]); // action 4, JAM A DEVICE (Storm jams its band: CENTER in cycle 2)
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  let p = combatPreview(r);
  assert.equal(p.intent?.kind, "jam");
  assert.ok(p.intent?.lingers);
  assert.match(p.intent!.label, /LASTS 2 TURNS/);
  endTurn(r);
  assert.deepEqual(r.faultNodes, ["r1"]);
  assert.deepEqual(r.lingeringJams, { r1: 1 });
  endTurn(r); // STRIKE: the old jam stays for its second turn
  assert.deepEqual(r.faultNodes, ["r1"]);
  endTurn(r); // CUT: now it clears
  assert.ok(!r.faultNodes.includes("r1"));
  // A level-1 cut on the primary route frays the next cable toward OMEGA for one player turn.
  const c = pack([["widow", "centre", "single", 200, 4]]); // action 5: CUT A CABLE at level 1
  device(c, "s1", "switch", -2.5, 0);
  device(c, "r1", "router", 0, 0);
  wire(c, "alpha", "s1", "r1", "omega");
  p = combatPreview(c);
  assert.deepEqual(p.hostiles[0].cuts, ["alpha::s1"]);
  assert.deepEqual(p.hostiles[0].frays, ["r1::s1"]);
  endTurn(c);
  assert.deepEqual(c.frayedByCut, ["r1::s1"]);
  c.faultLinks = []; // (Hot Patch) — the fray remains for the turn
  assert.equal(combatPreview(c).packetDamage, RULES.baseRouteDamage + RULES.switchDamage - RULES.frayedCableDamage);
});

test("level 2: two jams or two cuts; a honeypot absorbs one; Failover cancels both; fields last a turn longer", () => {
  const r = pack([["marshal", "centre", "single", 200, 7]]); // action 8: LOCKDOWN jam at level 2
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  let p = combatPreview(r);
  assert.equal(p.intent?.targetCount, 2);
  assert.match(p.intent!.label, /×2/);
  assert.deepEqual(p.hostiles[0].jams, ["r1", "r2"]);
  device(r, "hp", "honeypot", 2.5, -2.4);
  wire(r, "hp", "r1");
  p = combatPreview(r);
  assert.deepEqual(p.hostiles[0].jams, ["hp", "r1"], "the honeypot takes the first; the second lands");
  const s = pack([["widow", "centre", "single", 200, 7]]); // action 8: CUT A CABLE at level 2
  route(s, "r1", 0);
  route(s, "r2", 2.5);
  assert.equal(combatPreview(s).hostiles[0].cuts.length, 2);
  s.hand = ["failover-policy"];
  playProtocol(s, 0);
  p = combatPreview(s);
  assert.equal(p.hostiles[0].cancelled, 2);
  endTurn(s);
  assert.deepEqual(s.faultLinks, []);
  const f = pack([["prophet", "centre", "single", 200, 6]]); // action 7: SEED CORROSION at level 2
  route(f, "r1", 0);
  assert.equal(combatPreview(f).zoneThreat!.turns, RULES.hostileFieldTurns + 1);
});

test("level 3: strikes +1, and each pattern cycle opens by planting a Tap (stage III: a Jammer); the cap holds", () => {
  const r = pack([["leech", "centre", "single", 200, 9]]); // action 10, cycle start: INTEGRITY STRIKE
  route(r, "r1", 0);
  const p = combatPreview(r);
  assert.equal(p.intent?.escalation, 3);
  assert.match(p.intent!.label, /\+1 ESCALATION/);
  assert.deepEqual(p.hostiles[0].installs.map(item => [item.kind, item.source]), [["tap", "escalation"]]);
  const j = pack([["serpent", "centre", "single", 200, 6]], 2); // stage III action 7, cycle start
  route(j, "r1", 0);
  assert.deepEqual(combatPreview(j).hostiles[0].installs.map(item => item.kind), ["jammer"]);
  for (let i = 0; i < RULES.maxInstallations; i++) j.installations.push({ id: `tap${i + 1}`, kind: "tap", x: -6 + i * 1.5, z: 4.4, integrity: 1, activeFrom: 0, owner: "h1" });
  assert.equal(combatPreview(j).hostiles[0].installs[0].boosts, "tap1");
});

// ------------------------------------------------------------------ guardians

test("a guardian charges on its fifth action at full health, unleashes on the sixth, and its counter keeps running", () => {
  const r = pack([["regent", "centre", "single", 200, 3]]);
  route(r, "r1", 0);
  endTurn(r); // action 4
  assert.equal(intentFor(r, leader(r)).kind, "charge");
  assert.ok(intentFor(r, leader(r), 1).ultimate);
  endTurn(r); // the charge
  assert.equal(intentFor(r, leader(r)).kind, "breach");
  assert.ok(intentFor(r, leader(r)).ultimate);
  endTurn(r); // the ultimate
  assert.equal(leader(r).turn, 6);
  assert.equal(intentFor(r, leader(r)).label.startsWith("ROYAL DECREE"), true, "the pattern starts its next cycle");
});

test("a wounded guardian charges on its next action, the ultimate follows, and the pattern resumes where it left off", () => {
  const r = pack([["regent", "centre", "single", 200, 1]]); // next step: CLOSE THE GATES
  route(r, "r1", 0);
  leader(r).hp = 100; // half health
  let intent = intentFor(r, leader(r));
  assert.equal(intent.kind, "charge");
  assert.ok(intent.early);
  endTurn(r);
  assert.ok(intentFor(r, leader(r)).ultimate);
  endTurn(r);
  assert.equal(intentFor(r, leader(r)).kind, "sever", "resumes at the pre-empted CLOSE THE GATES");
  endTurn(r); // gates
  endTurn(r); // IRON JUDGEMENT
  endTurn(r); // TARNISHED EARTH
  intent = intentFor(r, leader(r));
  assert.equal(intent.kind, "breach", "this cycle's charge was spent early: ROYAL DECREE opens the next cycle");
  assert.ok(!intent.ultimate);
  assert.ok(leader(r).chargedEarly);
  // Later cycles charge normally; half health never pre-empts a second time.
  for (let i = 0; i < 4; i++) endTurn(r);
  assert.equal(intentFor(r, leader(r)).kind, "charge");
  assert.ok(!intentFor(r, leader(r)).early);
});

test("a guardian that charged at its fifth action does not charge again at half health", () => {
  const r = pack([["regent", "centre", "single", 200, 4]]);
  route(r, "r1", 0);
  endTurn(r); // the charge
  endTurn(r); // the ultimate
  leader(r).hp = 90;
  assert.equal(intentFor(r, leader(r)).kind, "breach");
  assert.ok(!intentFor(r, leader(r)).early);
});

test("adds rise when the charge is announced, wait through the charge, then act on the ultimate turn around the guardian", () => {
  const r = pack([["regent", "centre", "single", 200, 3]]);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  route(r, "r3", -2.5);
  let result = endTurn(r); // action 4: next intent is THE CROWN RISES
  assert.deepEqual(result.arrived.map(item => [item.id, item.port, item.kind, item.hp]), [["gate-warden", "left", "add", 8], ["gate-warden", "right", "add", 8]]);
  let p = combatPreview(r);
  assert.deepEqual(p.hostiles.map(hostile => [hostile.id, hostile.state]), [["gate-warden", "dormant"], ["regent", "acts"], ["gate-warden", "dormant"]]);
  assert.equal(p.hostiles[0].upcoming?.label, "IRON STEP", "their ultimate-turn intents are shown at once");
  endTurn(r); // the charge
  p = combatPreview(r);
  assert.deepEqual(p.hostiles.map(hostile => hostile.state), ["acts", "acts", "acts"]);
  assert.equal(p.ports.centre!.breakThreshold, 12 + 2 * RULES.addBreakBonus);
  // Target one Warden and kill it: the threshold falls by 3.
  assert.ok(setFocus(r, "left").ok);
  r.enemies.find(enemy => enemy.port === "left")!.hp = 2;
  p = combatPreview(r);
  assert.equal(p.ports.centre!.breakThreshold, 12 + RULES.addBreakBonus);
  // The surplus overflows into the guardian, and there it counts toward the break. An interrupt
  // cancels only the guardian's action; the surviving add still strikes.
  r.packetBoost = 30;
  p = combatPreview(r);
  assert.equal(p.ports.left!.overflowTo, "centre");
  assert.ok(p.interrupted);
  assert.equal(p.hostiles.find(hostile => hostile.port === "right")!.state, "acts");
  assert.ok(p.incomingRaw >= 2);
  result = endTurn(r);
  assert.ok(result.interrupted);
  // Adds that survive keep acting every phase; the next charge raises adds only at empty ports.
  assert.equal(intentFor(r, r.enemies.find(enemy => enemy.port === "right")!).kind, "strike");
});

test("ascension 10: each living add raises the break by 4, and the charge plants a Breaker beside the primary router", () => {
  const r = pack([["regent", "centre", "single", 200, 3]]);
  r.ascension = 10;
  route(r, "r1", 0);
  endTurn(r);
  let p = combatPreview(r);
  const breaker = p.hostiles.find(hostile => hostile.id === "regent")!.installs.find(item => item.kind === "breaker")!;
  assert.equal(breaker.source, "charge");
  assert.equal(breaker.aim, "r1");
  endTurn(r); // charge: the breaker is planted, countdown 2
  p = combatPreview(r);
  assert.equal(p.ports.centre!.breakThreshold, 12 + 2 * RULES.addBreakBonusLate, "at ascension 10 each living add raises the break by the late bonus");
  assert.deepEqual(p.installationEffects.find(effect => effect.kind === "breaker"), { id: "breaker1", kind: "breaker", effect: "tick", target: null, countdown: 1 });
  endTurn(r); // ultimate
  assert.equal(combatPreview(r).installationEffects.find(effect => effect.kind === "breaker")!.effect, "detonate", "on the action after the ultimate");
});

test("the Choir's plating is 3 while a Chorister lives; a Quarantine Drone's ISOLATE plants a Jammer at 1.6 from the primary router", () => {
  const r = pack([["chorister", "left", "add", 10], ["cantor", "centre", "single", 200]]);
  route(r, "r1", 0);
  assert.equal(combatPreview(r).ports.centre!.armor, RULES.choirAddPlating);
  r.enemies[0].hp = 0;
  assert.equal(combatPreview(r).ports.centre!.armor, 2);
  const q = pack([["quarantine-drone", "left", "add", 14], ["core", "centre", "single", 200, 6]]);
  route(q, "r1", 0);
  const p = combatPreview(q);
  assert.deepEqual(p.hostiles[0].installs.map(item => [item.kind, item.x, item.z]), [["jammer", 0, -1.6]]);
  endTurn(q);
  q.energy = 3;
  assert.ok(scrubInstallation(q, "jammer1").ok);
  assert.equal(q.energy, 3 - RULES.quarantineScrubCost, "scrubbing costs 2 per point while a Drone lives");
});

test("Total Blackout (enraged) wears every primary-route device; Ancient Guardians' gate closure and stolen voice wear their target", () => {
  const r = pack([["core", "centre", "single", 200, 5]]);
  leader(r).hp = 80; // enraged
  leader(r).chargedEarly = true;
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "s1", "r1", "omega");
  const p = combatPreview(r);
  assert.ok(p.intent?.ultimate);
  assert.deepEqual(p.wear.map(item => item.nodeId).sort(), ["r1", "s1"]);
  const g = pack([["regent", "centre", "single", 200, 1]]); // CLOSE THE GATES
  g.ascension = ASCENSION_RULES.ancientGuardians;
  device(g, "r1", "router", 0, -2.4);
  wire(g, "alpha", "r1", "omega");
  assert.deepEqual(combatPreview(g).wear.map(item => item.nodeId), ["r1"]);
  g.ascension = ASCENSION_RULES.ancientGuardians - 1;
  assert.deepEqual(combatPreview(g).wear, []);
});

test("forecast purity and agreement hold across escalation, charges and adds", () => {
  const r = pack([["regent", "centre", "single", 120, 0]], 2);
  route(r, "r1", 0);
  route(r, "r2", 2.5);
  for (let turn = 0; turn < 14 && r.phase === "battle"; turn++) {
    const snapshot = structuredClone(r);
    const p = combatPreview(r);
    assert.deepEqual(r, snapshot);
    const integrity = r.integrity;
    const result = endTurn(r);
    assert.deepEqual(result.forecast, p);
    assert.equal(integrity - r.integrity, p.incoming);
    r.integrity = r.maxIntegrity;
    r.drawPile.push(...Array(10).fill("guard"));
  }
});
