/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Designations in combat (section 7) and surprises (section 8): reinforcements and Shedding,
 * crates, undelivered messages, signals — all announced or revealed, never rolled in the fight. */
import assert from "node:assert/strict";
import test from "node:test";
import { RULES } from "./cards.ts";
import { chooseOffer, makeEnemy, messageOffer, planEncounter } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import { chooseRoom, combatPreview, endTurn, intentFor, playProtocol, playZone, useConsole } from "./run.ts";
import type { CrateContents, DesignationId, HostileRole, NetworkNode, Port, RunState } from "./types.ts";

type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number, designations?: DesignationId[]];
function pack(members: Member[], stage = 0): RunState {
  const run = newExpedition("architect", 0x5c0).run;
  chooseRoom(run, "0-1");
  run.stage = stage;
  run.enemies = members.map(([id, port, role, hp, turn, designations], i) =>
    makeEnemy(id, `h${i + 1}`, port, role ?? (port === "centre" ? (members.length > 1 ? "leader" : "single") : "escort"), hp ?? 60,
      { turn: turn ?? 0, ...(designations ? { designations } : {}) }));
  run.focus = run.enemies.some(enemy => enemy.port === "centre") ? "centre" : run.enemies[0].port;
  run.integrity = run.maxIntegrity = 100;
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
  run.reinforcement = null;
  run.signal = null;
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
const crate = (contents: CrateContents) => contents;

// ------------------------------------------------------------------ designations

test("Nesting: the first action also plants a Siphon Tap (stage III: a Jammer beside the primary router)", () => {
  const r = pack([["serpent", "centre", "single", 60, 0, ["nesting"]]]);
  route(r, "r1", 0);
  assert.deepEqual(combatPreview(r).hostiles[0].installs.map(item => [item.kind, item.source]), [["tap", "nesting"]]);
  endTurn(r);
  assert.deepEqual(combatPreview(r).hostiles[0].installs, [], "only the first action");
  const j = pack([["serpent", "centre", "single", 60, 0, ["nesting"]]], 2);
  route(j, "r1", 0);
  const jammer = combatPreview(j).hostiles[0].installs[0];
  assert.equal(jammer.kind, "jammer");
  assert.equal(jammer.aim, "r1");
});

test("Armored: plating 2 unless a firewall is online, stacking with a Ward Node's link", () => {
  const r = pack([["ward-node", "left", "escort", 30], ["serpent", "centre", "leader", 60, 0, ["armored"]]]);
  route(r, "r1", 0);
  assert.equal(combatPreview(r).ports.centre!.armor, RULES.armoredPlating + RULES.wardPlating);
  device(r, "fw", "firewall", 2.5, 0);
  wire(r, "r1", "fw", "omega");
  assert.equal(combatPreview(r).ports.centre!.armor, 0);
});

test("Hardened: its strikes deal 1 less", () => {
  const r = pack([["serpent", "centre", "single", 60, 0]]);
  const base = intentFor(r, r.enemies[0]).amount;
  r.enemies[0].designations = ["hardened"];
  const hardened = intentFor(r, r.enemies[0]);
  assert.equal(hardened.amount, base - RULES.hardenedStrike);
  assert.match(hardened.label, /HARDENED/);
});

test("Rigged: each cut also leaves a Spike beside the cut cable's nearer device; Failover cancels both", () => {
  const r = pack([["widow", "centre", "single", 60, 1, ["rigged"]]]);
  route(r, "r1", -2.4);
  let p = combatPreview(r);
  assert.deepEqual(p.hostiles[0].cuts, ["alpha::r1"]);
  assert.deepEqual(p.hostiles[0].installs.map(item => [item.kind, item.source, item.aim, item.integrity]), [["spike", "rigged", "r1", RULES.installationIntegrity.spike]]);
  r.hand = ["failover-policy"];
  playProtocol(r, 0);
  p = combatPreview(r);
  assert.deepEqual(p.hostiles[0].installs, []);
});

test("Hungry: heals 2 after a transmission that dealt it nothing, a buffered one included", () => {
  const r = pack([["serpent", "centre", "single", 60, 0, ["hungry"]]], 0);
  r.archetype = "ghost";
  r.enemies[0].hp = 40;
  route(r, "r1", 0);
  assert.equal(combatPreview(r).hostiles[0].heal, 0);
  assert.ok(useConsole(r).ok); // buffer
  const p = combatPreview(r);
  assert.equal(p.hostiles[0].heal, RULES.hungryHeal);
  endTurn(r);
  assert.equal(r.enemies[0].hp, 40 + RULES.hungryHeal);
});

test("Spiteful: its announced action resolves even if it dies that turn; then the fight ends", () => {
  const r = pack([["serpent", "centre", "single", 5, 0, ["spiteful"]]]);
  route(r, "r1", 0);
  const p = combatPreview(r);
  assert.ok(p.lethal);
  assert.equal(p.hostiles[0].state, "spiteful");
  assert.equal(p.hostiles[0].note, "resolves anyway");
  assert.ok(p.incoming > 0);
  assert.ok(p.fightEnds);
  const result = endTurn(r);
  assert.equal(result.integrityDamage, p.incoming);
  assert.equal(100 - r.integrity, p.incoming);
  assert.ok(result.defeated);
  // Without the designation the same lethal packet cancels the action.
  const q = pack([["serpent", "centre", "single", 5, 0]]);
  route(q, "r1", 0);
  assert.equal(combatPreview(q).incoming, 0);
});

test("Shedding: falling to half health raises its escort (trio share, with a crate) at the end of the phase, once", () => {
  const r = pack([["prophet", "centre", "single", 40, 1, ["shedding"]]]);
  r.reinforcement = { enemyId: "splicer", after: -1, hp: 10, crate: { kind: "credits", amount: 9 }, shed: true };
  route(r, "r1", 0);
  r.packetBoost = 16; // 21 on 40: crosses half
  const p = combatPreview(r);
  assert.deepEqual(p.arrivals, { kind: "reinforcement", enemyId: "splicer", port: "left", inPhases: 1, shed: true });
  const result = endTurn(r);
  assert.deepEqual(result.shed, ["h1"]);
  assert.deepEqual(result.arrived.map(item => [item.id, item.port, item.hp, item.shed]), [["splicer", "left", 10, true]]);
  const spawn = r.enemies.find(enemy => enemy.id === "splicer")!;
  assert.deepEqual(spawn.crate, { kind: "credits", amount: 9 });
  assert.equal(spawn.cadence, "odd");
  assert.equal(r.reinforcement, null);
  // Once: a second crossing raises nothing.
  r.enemies[0].hp = r.enemies[0].maxHp;
  r.packetBoost = 30;
  assert.equal(endTurn(r).shed.length, 0);
});

test("Laden drops a message and Salvaged drops hardware when defeated; crates open on death", () => {
  const r = pack([["spark-mite", "left", "escort", 3], ["reaver", "centre", "leader", 60, 1, ["laden", "salvaged"]]]);
  r.enemies[0].crate = crate({ kind: "credits", amount: 12, message: true });
  route(r, "r1", 0);
  r.focus = "left";
  let result = endTurn(r);
  assert.deepEqual(result.fallen.map(item => [item.uid, item.crate?.kind, item.credits, item.offers]), [["h1", "credits", 12, 1]]);
  assert.deepEqual(r.creditLedger, [{ label: "crates", amount: 12 }]);
  assert.equal(r.offers[0].kind, "message");
  // Crate contents are fixed: the same save always opens the same crate.
  assert.equal(r.enemies[0].crate, undefined);
  // The Laden, Salvaged leader: its message and its hardware.
  r.enemies[1].hp = 3;
  r.packetBoost = 10;
  result = endTurn(r);
  assert.ok(result.defeated);
  assert.equal(r.offers.filter(offer => offer.kind === "message").length, 2);
  assert.ok(result.fallen[0].credits, "after the fight the salvage yields its credits");
});

test("a salvage crate lands its device at the first legal auto-deploy socket at the end of the phase, condition 1", () => {
  const r = pack([["spark-mite", "left", "escort", 3], ["serpent", "centre", "leader", 60, 1]]);
  r.enemies[0].crate = crate({ kind: "salvage", role: "cache" });
  route(r, "r1", 0);
  r.focus = "left";
  const result = endTurn(r);
  const placed = result.fallen[0].placed!;
  assert.equal(placed.role, "cache");
  const node = r.topology.nodes.find(item => item.id === placed.nodeId)!;
  assert.ok(node.salvage);
  assert.equal(node.condition, RULES.salvageCondition);
  assert.ok(!r.topology.links.some(link => link.a === node.id || link.b === node.id), "uncabled: yours once cabled");
  // A card crate queues a choice of two named cards.
  const c = pack([["spark-mite", "left", "escort", 3], ["serpent", "centre", "leader", 60, 1]]);
  c.enemies[0].crate = crate({ kind: "card", cards: ["pulse", "guard"] });
  route(c, "r1", 0);
  c.focus = "left";
  endTurn(c);
  assert.deepEqual(c.offers, [{ kind: "crate-card", cards: ["pulse", "guard"] }]);
  assert.ok(chooseOffer(c, 0).ok);
  assert.ok(c.hand.includes("pulse") && c.encounterCards.includes("pulse"));
});

test("undelivered messages offer named choices without a coin flip", () => {
  const r = pack([["serpent", "centre", "single", 60]]);
  const a = messageOffer(r, "laden", "h1"), b = messageOffer(r, "laden", "h1");
  assert.deepEqual(a, b);
  assert.equal(a.kind === "message" && a.options.length, 2);
});

// ------------------------------------------------------------------ reinforcements

test("a reinforcement counts down in enemy phases, takes the first empty port, then acts on its port's parity", () => {
  const r = pack([["serpent", "centre", "single", 60, 1]]);
  r.reinforcement = { enemyId: "splicer", after: 2, hp: 21, crate: { kind: "empty" } };
  r.relics = ["round-robin"];
  route(r, "r1", 0);
  assert.deepEqual(combatPreview(r).arrivals, { kind: "reinforcement", enemyId: "splicer", port: "left", inPhases: 2 });
  endTurn(r);
  assert.equal(combatPreview(r).arrivals?.inPhases, 1, "arrives after this action");
  const result = endTurn(r);
  assert.deepEqual(result.arrived.map(item => [item.id, item.port]), [["splicer", "left"]]);
  const splicer = r.enemies.find(enemy => enemy.id === "splicer")!;
  assert.equal(splicer.hp, 21 - RULES.roundRobinDamage, "Round Robin hits it on arrival");
  assert.equal(r.enemyPhase, 2);
  assert.equal(combatPreview(r).hostiles.find(hostile => hostile.id === "splicer")!.state, "acts", "phase 3 is odd: the left port acts");
  // No empty port: it waits another phase.
  const full = pack([["spark-mite", "left"], ["serpent", "centre"], ["splicer", "right"]]);
  full.reinforcement = { enemyId: "relay-drone", after: 1, hp: 10, crate: { kind: "empty" } };
  route(full, "r1", 0);
  endTurn(full);
  assert.equal(full.reinforcement?.after, 0);
  assert.equal(combatPreview(full).arrivals?.port, null);
});

test("a body a trap kills can leave the rail to an arrival in the same phase; the log still names it", () => {
  // Found by the balance probe: the trap line looked the hostile up after the arrival took its port.
  const r = pack([["ward-node", "left", "escort", 2], ["reaver", "centre", "leader", 200]]);
  r.enemies[0].cadence = "odd";
  r.reinforcement = { enemyId: "relay-drone", after: 1, hp: 10, crate: { kind: "empty" } };
  route(r, "r1", 0);
  device(r, "hp", "honeypot", 2.5, -2.4);
  wire(r, "hp", "r1");
  const p = combatPreview(r);
  assert.equal(p.hostiles.find(hostile => hostile.id === "ward-node")!.trapDamage, RULES.honeypotDamage);
  assert.equal(p.arrivals?.port, "left");
  const result = endTurn(r);
  assert.deepEqual(result.arrived.map(item => [item.id, item.port]), [["relay-drone", "left"]]);
  assert.ok(!r.enemies.some(enemy => enemy.id === "ward-node"), "the fallen body left the rail");
  assert.ok(r.log.some(line => /Traps dealt \d+ to WARD NODE/.test(line)));
});

// ------------------------------------------------------------------ signals

function signalled(id: RunState["signal"] extends infer S ? S extends { id: infer I } ? I : never : never): RunState {
  // Grave Reaver: breaches, strikes and fields, no cut or jam to disturb the route.
  const r = pack([["reaver", "centre", "single", 200, 1]], 1);
  route(r, "r1", 0);
  device(r, "s1", "switch", -2.5, 2.4);
  r.signal = { id, firesOnTurn: RULES.signalTurn, resolved: false };
  return r;
}

test("a signal is announced at the start of turn 2 with its named target, and fires at the start of turn 3", () => {
  const r = signalled("interference");
  assert.equal(combatPreview(r).signal, null, "nothing announced on turn 1");
  const result = endTurn(r);
  assert.equal(r.turn, 2);
  assert.match(result.signalAnnounced!, /interference suppresses the CENTER band for 2 turns, if the fight lasts/);
  assert.equal(r.signal!.zone, "center");
  assert.deepEqual(combatPreview(r).signal, { id: "interference", firesOnTurn: 3, text: result.signalAnnounced });
  const before = combatPreview(r).packetDamage;
  const fired = endTurn(r);
  assert.match(fired.signalFired!, /INTERFERENCE/);
  assert.ok(r.signal!.resolved);
  assert.equal(combatPreview(r).packetDamage, before - RULES.suppressionPenalty);
  // Purge Field clears it.
  r.hand = ["purge-field"];
  playZone(r, 0, "center");
  assert.equal(combatPreview(r).packetDamage, before);
});

test("RELAY FLICKER resonates the busiest band and stacks with a cast Resonance Field", () => {
  const r = signalled("relay-flicker");
  endTurn(r);
  endTurn(r);
  r.zoneEffects.push({ zone: "center", kind: "resonance", turns: 3 });
  assert.equal(r.zoneEffects.filter(field => field.kind === "resonance").length, 2);
  assert.ok(combatPreview(r).damageTerms.some(term => term.label === "CENTER · Resonance ×2"));
});

test("COLLAPSE, COLD START, RESYNC and SURGE resolve exactly as announced", () => {
  const c = signalled("collapse");
  endTurn(c);
  const socket = c.signal!.socket!;
  assert.ok(socket);
  endTurn(c);
  assert.ok(c.terrain!.debris.some(spot => spot.x === socket.x && spot.z === socket.z && spot.fresh));
  const cold = signalled("cold-start");
  cold.topology.nodes.find(node => node.id === "s1")!.salvage = true;
  cold.topology.nodes.find(node => node.id === "s1")!.condition = 1;
  endTurn(cold);
  assert.equal(cold.signal!.nodeId, "s1");
  endTurn(cold);
  const s1 = cold.topology.nodes.find(node => node.id === "s1")!;
  assert.equal(s1.condition, RULES.deviceCondition);
  assert.ok(cold.topology.links.some(link => link.a === "s1" || link.b === "s1"));
  const resync = signalled("resync");
  endTurn(resync);
  endTurn(resync);
  const turn = resync.enemies[0].turn;
  const p = combatPreview(resync);
  assert.equal(p.hostiles[0].state, "skipped");
  endTurn(resync);
  assert.equal(resync.enemies[0].turn, turn, "its counter does not advance");
  assert.equal(resync.enemies[0].skipNext, undefined);
  const surge = signalled("surge");
  endTurn(surge);
  endTurn(surge);
  assert.equal(surge.enemies[0].surge, 1);
  const plain = intentFor(surge, { ...surge.enemies[0], surge: 0 }).escalation ?? 0;
  assert.equal(intentFor(surge, surge.enemies[0]).escalation, Math.min(3, plain + 1));
});

test("a signal never fires if the fight ends first", () => {
  const r = signalled("surge");
  r.enemies[0].hp = 3;
  endTurn(r);
  assert.equal(r.phase, "reward");
  assert.equal(r.signal?.resolved ?? false, false);
});

test("planned surprises are seeded by the chart: the same room plans the same crates, arrivals and signal", () => {
  const e = newExpedition("warden", 0xc4a7e);
  const room = e.run.map.find(item => item.type === "elite")!;
  assert.deepEqual(planEncounter(e.run, room), planEncounter(e.run, room));
});
