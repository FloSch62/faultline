/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Forecast contract (surprise contract rule 1; design 15.4): on randomized pack boards with
 * installations, worn devices, racks and phantoms, combatPreview consumes no RNG and mutates
 * nothing, and endTurn resolves exactly its numbers per port, per hostile and per installation,
 * including wear, breakdowns and wreckage. */
import assert from "node:assert/strict";
import test from "node:test";
import { RULES } from "./cards.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import { chooseRoom, combatPreview, endTurn, setFocus } from "./run.ts";
import type { CardId, DesignationId, InstallationKind, NetworkNode, Port, RelicId, RunState, SignalId } from "./types.ts";

const LEADERS = ["leech", "wraith", "storm", "sentinel", "prophet", "widow", "colossus", "serpent", "moth", "marshal", "choir", "weaver", "reaver", "foreman", "nest", "demolition", "blight"];
const ESCORTS = ["spark-mite", "splicer", "relay-drone", "ward-node", "tap-spinner", "glass-echo", "rigger-drone"];
const ROLES: NetworkNode["role"][] = ["router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom"];
const KINDS: InstallationKind[] = ["tap", "jammer", "spike", "anchor", "breaker"];
const DESIGNATIONS: DesignationId[] = ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "spiteful", "laden", "salvaged"];
const SIGNALS: SignalId[] = ["relay-flicker", "cold-start", "resync", "interference", "collapse", "surge"];
const GUARDIANS: [string, string][] = [["regent", "gate-warden"], ["cantor", "chorister"], ["core", "quarantine-drone"]];

function board(trial: number, rand: () => number): RunState {
  const run = newExpedition((["architect", "warden", "ghost"] as const)[trial % 3], 0xf0e + trial).run;
  chooseRoom(run, "0-1");
  const shape = trial % 5; // single, pair, duo, trio, guardian with adds
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const members: [string, Port, "single" | "leader" | "escort"][] =
    shape === 0 ? [[pick(LEADERS), "centre", "single"]]
      : shape === 1 ? [[pick(ESCORTS), "left", "escort"], [pick(LEADERS), "centre", "leader"]]
        : shape === 2 ? [[pick(ESCORTS), "left", "escort"], [pick(ESCORTS), "right", "escort"]]
          : shape === 3 ? [[pick(ESCORTS), "left", "escort"], [pick(LEADERS), "centre", "leader"], [pick(ESCORTS), "right", "escort"]]
            : (() => { const [boss, add] = pick(GUARDIANS); return [[add, "left", "add"], [boss, "centre", "single"], [add, "right", "add"]] as [string, Port, "single" | "leader" | "escort"][]; })();
  run.enemies = members.map(([id, port, role], i) => makeEnemy(id, `h${i + 1}`, port, role as never, 4 + Math.floor(rand() * 30), { turn: Math.floor(rand() * 9) }));
  // M2 layers: designations on the leader, surges, guardian charge state, adds still rising.
  for (const enemy of run.enemies) {
    if ((enemy.role === "leader" || enemy.role === "single") && shape !== 4 && rand() < 0.6) enemy.designations = [pick(DESIGNATIONS)];
    if (enemy.role === "single" && shape === 4) { enemy.maxHp = 60; enemy.chargedEarly = rand() < 0.5; }
    if (enemy.role === "add" && rand() < 0.3) enemy.wakes = 3;
    if (rand() < 0.1) enemy.surge = 1;
  }
  run.enemyPhase = Math.floor(rand() * 4);
  run.hostileActions = run.enemyPhase * 2;
  run.focus = members.some(([, port]) => port === "centre") ? "centre" : members[0][1];
  run.stage = Math.floor(rand() * 3);
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = (["backpressure", "honeynet", "zero-trust", "parallel-core", "priority-queue", "ingress-filter", "storm-control", "scorched-earth", "shield-array"] as RelicId[]).filter(() => rand() < 0.2);
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.terrain = { name: "Test", description: "", debris: rand() < 0.4 ? [{ x: -2.5, z: 2.4 }] : [] };
  run.zoneEffects = rand() < 0.3 ? [{ zone: "center", kind: "corrosion", turns: 2 }] : [];
  const count = 3 + Math.floor(rand() * 8);
  for (let i = 0; i < count; i++) {
    const role = i < 2 ? "router" : ROLES[Math.floor(rand() * ROLES.length)];
    const x = -4 + (i % 4) * 2.6, z = -3 + Math.floor(i / 4) * 2.6;
    const node: NetworkNode = { id: `d${i}`, role, x, z, configured: rand() < 0.2 };
    if (role === "phantom") node.absorbs = 1;
    else node.condition = node.maxCondition = role === "rack" ? RULES.rackCondition : 1 + Math.floor(rand() * 2);
    run.topology.nodes.push(node);
  }
  const ids = run.topology.nodes.filter(node => node.role !== "rack" && node.role !== "phantom").map(node => node.id);
  for (let i = 0; i < count * 2; i++) {
    const a = ids[Math.floor(rand() * ids.length)], b = ids[Math.floor(rand() * ids.length)];
    if (a !== b && !run.topology.links.some(link => (link.a === a && link.b === b) || (link.a === b && link.b === a)))
      run.topology.links.push({ a, b, armored: rand() < 0.2 });
  }
  const installs = Math.floor(rand() * 5);
  for (let i = 0; i < installs; i++) {
    const kind = pick(KINDS);
    run.installations.push({
      id: `${kind}${i + 1}`, kind, x: -5.5 + i * 3.1 + rand() * 0.4, z: -1.3 + rand() * 2.6, integrity: 1 + Math.floor(rand() * 3),
      activeFrom: rand() < 0.7 ? 0 : run.hostileActions + 2, owner: `h${1 + Math.floor(rand() * members.length)}`,
      ...(kind === "breaker" ? { countdown: 1 + Math.floor(rand() * 2) } : {}),
    });
  }
  if (rand() < 0.4) run.protocols = [pick(["failover-policy", "port-security", "rate-limiter", "ips-signature", "quarantine-rule", "tarpit"] as CardId[])];
  run.block = Math.floor(rand() * 6);
  run.buffer = rand() < 0.3 ? 6 : 0;
  run.backpressure = rand() < 0.2 ? 3 : 0;
  run.reclaim = rand() < 0.2 ? RULES.reclaimShield : 0;
  run.attackers = rand() < 0.5 ? run.enemies.map(enemy => enemy.uid) : [];
  if (run.archetype === "ghost" && rand() < 0.4) run.buffering = true;
  run.hand = rand() < 0.2 ? ["worm"] : [];
  run.drawPile = Array(30).fill("guard");
  run.discardPile = [];
  run.nextNodeId = 20;
  run.turnEffects = rand() < 0.3 ? { everyPort: 2 } : {};
  // Announced arrivals and signals.
  if (shape !== 3 && shape !== 4 && rand() < 0.4) {
    const shed = run.enemies.some(enemy => enemy.designations?.includes("shedding")) && rand() < 0.6;
    run.reinforcement = { enemyId: pick(ESCORTS), after: shed ? -1 : Math.floor(rand() * 3), hp: 10, crate: { kind: "credits", amount: 9 }, ...(shed ? { shed: true } : {}) };
  }
  if (shape !== 4 && rand() < 0.4) {
    run.turn = rand() < 0.5 ? 1 : 2;
    run.signal = { id: pick(SIGNALS), firesOnTurn: 3, resolved: false };
    if (run.turn === 2) Object.assign(run.signal, { announced: true, text: "NEXT TURN", zone: "center", socket: { x: 2.5, z: 4.2 }, nodeId: "d2", enemyUid: "h1", role: "cache" });
  }
  // Target another hostile now and then: every delivery follows the target (the draws are the
  // ones the per-channel aims used, so the boards stay the same).
  const preview = combatPreview(run);
  const living = run.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.port);
  if (preview.deliveries[1] && rand() < 0.5) setFocus(run, pick(living));
  return run;
}

test("randomized pack boards: the forecast is pure and resolution matches it per port, hostile and installation", () => {
  let state = 11;
  const rand = () => ((state = (state * 1103515245 + 12345) >>> 0) / 0x100000000);
  let packs = 0, installs = 0, wear = 0, breakdowns = 0, detonations = 0, quarantines = 0, escalated = 0, arrivals = 0, signals = 0, spiteful = 0;
  for (let trial = 0; trial < 300; trial++) {
    const r = board(trial, rand);
    const snapshot = structuredClone(r);
    const p = combatPreview(r);
    assert.deepEqual(r, snapshot, `trial ${trial}: the preview must not mutate`);
    assert.equal(r.rng, snapshot.rng, "no RNG consumed");
    assert.equal(p.packetDamage, Math.max(0, p.damageTerms.reduce((sum, term) => sum + term.amount, 0)), `trial ${trial}: terms reconcile`);
    const hpBefore = new Map(r.enemies.map(enemy => [enemy.uid, enemy.hp])), integrity = r.integrity;
    const nodesBefore = new Map(r.topology.nodes.map(node => [node.id, { ...node }]));
    const debrisBefore = r.terrain!.debris.length;
    const result = endTurn(r);
    const at = `trial ${trial} (${snapshot.enemies.map(enemy => enemy.id).join("+")})`;
    assert.equal(result.packetDamage, p.packetDamage, at);
    assert.deepEqual(result.forecast, p, `${at}: resolution reports the forecast it resolved`);
    assert.equal(integrity - r.integrity, result.defeated ? 0 : p.incoming, `${at}: integrity`);
    if (r.enemies.length > 1) packs++;
    if (p.hostiles.some(hostile => hostile.escalation > 0)) escalated++;
    if (result.arrived.length) arrivals++;
    if (result.signalFired || result.signalAnnounced) signals++;
    if (p.hostiles.some(hostile => hostile.state === "spiteful")) spiteful++;
    // Arrivals appear exactly as forecast: a reinforcement arriving after this action.
    if (p.arrivals?.inPhases === 1 && p.arrivals.port && !result.defeated)
      assert.ok(result.arrived.some(item => item.kind === "reinforcement" && item.id === p.arrivals!.enemyId && item.port === p.arrivals!.port), `${snapshot.enemies.map(enemy => enemy.id).join("+")}: arrival`);
    for (const rising of p.risingAdds) assert.ok(result.arrived.some(item => item.kind === "add" && item.port === rising.port));
    if (result.defeated) {
      assert.ok(p.fightEnds && (p.lethal || p.enemyDefeatedByTraps || r.enemies.every(enemy => enemy.hp <= 0)), at);
      continue;
    }
    for (const hostile of p.hostiles) {
      const enemy = r.enemies.find(item => item.uid === hostile.uid);
      if (!enemy) continue; // a fallen body replaced by an arrival
      const port = p.ports[hostile.port]!;
      const taken = p.buffering || !p.signalPath.length ? 0 : port.packet - port.overflowOut;
      assert.equal(enemy.hp, Math.max(0, hpBefore.get(hostile.uid)! - taken - hostile.trapDamage - hostile.scorched + hostile.heal), `${at}: ${hostile.id} health`);
    }
    // Faults, installations, wear, breakdowns and wreckage are exactly what the forecast named.
    assert.deepEqual([...r.faultNodes, ...r.faultLinks], p.faultTargets, `${at}: faults`);
    for (const effect of p.installationEffects) {
      const item = r.installations.find(entry => entry.id === effect.id);
      if (effect.effect === "tick") assert.equal(item?.countdown, effect.countdown, `${at}: ${effect.id} countdown`);
      if (effect.effect === "detonate") { assert.equal(item, undefined, `${at}: ${effect.id} detonated`); detonations++; }
      if (effect.destroyed) assert.equal(item, undefined, `${at}: ${effect.id} destroyed`);
    }
    for (const record of p.quarantine) {
      quarantines++;
      if (record.destroys) assert.ok(!r.installations.some(item => item.id === record.installationId), at);
    }
    for (const planted of p.installTargets) {
      installs++;
      if (planted.id && !planted.destroyed) assert.ok(r.installations.some(item => item.id === planted.id && item.x === planted.x && item.z === planted.z), `${at}: ${planted.id} planted`);
    }
    const broken = new Set(p.breakdowns.map(item => item.nodeId));
    for (const record of p.wear) {
      wear++;
      if (!broken.has(record.nodeId)) {
        const last = p.wear.filter(item => item.nodeId === record.nodeId).at(-1)!;
        assert.equal(r.topology.nodes.find(node => node.id === record.nodeId)?.condition, last.to, `${at}: ${record.nodeId} condition`);
      }
    }
    for (const id of broken) {
      breakdowns++;
      assert.ok(!r.topology.nodes.some(node => node.id === id), `${at}: ${id} broke`);
      assert.ok(!r.topology.links.some(link => link.a === id || link.b === id), `${at}: ${id} cables`);
      assert.ok(nodesBefore.has(id));
    }
    const wrecks = p.breakdowns.filter(item => item.wreck).length + p.installationEffects.filter(effect => effect.effect === "detonate").length
      + Number(!!result.signalFired?.startsWith("COLLAPSE"));
    assert.equal(r.terrain!.debris.length, Math.min(RULES.wreckCap, debrisBefore + wrecks), `${at}: wreckage`);
    assert.equal(r.energy, p.nextTurn.energy, `${at}: energy`);
    for (const hostile of p.hostiles) if (hostile.field && !hostile.fieldReplaced) assert.ok(r.zoneEffects.some(field => field.zone === hostile.field!.zone && field.kind === hostile.field!.kind), `${at}: field`);
  }
  // The generator must actually exercise the table front.
  assert.ok(packs > 100 && installs > 20 && wear > 20 && breakdowns > 5 && quarantines > 3 && escalated > 30 && arrivals > 10 && signals > 20,
    JSON.stringify({ packs, installs, wear, breakdowns, detonations, quarantines, escalated, arrivals, signals, spiteful }));
});
