/** v5 · Three Energy: the Warden's cards (contract section 9.2). Every card plays through the public
 * play functions with its printed numbers and its upgrade; daemons stack; everything that acts in
 * the enemy phase is checked with `agree` (the forecast is pure and equals the resolution); and the
 * three build paths (Fortress, Firewall wall, Protocols) each pay off in a short scripted fight. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES, missingCards } from "./cards.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition } from "./expedition.ts";
import {
  CARD_IDS_BY_OWNER, type Archetype, type CardId, type HostileRole, type Installation, type InstallationKind, type NetworkNode, type Port,
  type RunState,
} from "./types.ts";
import {
  chooseRoom, combatPreview, consoleState, costFor, endTurn, hardenBlock, playDaemon, playGround, playInstant, playLink, playProtocol,
  protocolLimit, runningDaemons, useConsole,
} from "./run.ts";
import { CARD_EFFECTS, DAEMON_HOOKS } from "./effects/index.ts";
import { canLink } from "./graph.ts";

// ------------------------------------------------------------------ helpers (the engine-v5 pattern)

/** A clean first-fight Warden table: terminals, one hostile at a chosen intent, energy to spare. */
function table(enemy = "wraith", turn = 0, archetype: Archetype = "warden"): RunState {
  const run = newExpedition(archetype, 0x5eed1234).run;
  chooseRoom(run, "0-1");
  const foe = run.enemies[0];
  foe.id = enemy;
  foe.hp = foe.maxHp = 200;
  foe.turn = turn;
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.terrain = null;
  run.hand = [];
  run.drawPile = Array(30).fill("guard");
  run.discardPile = [];
  run.nextNodeId = 1;
  return run;
}
type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number];
/** A table with a pack in port order (escorts act on their parity: phase 1 is odd). */
function pack(members: Member[]): RunState {
  const run = table();
  run.enemies = members.map(([id, port, role = "single", hp = 200, turn = 0], i) => makeEnemy(id, `h${i + 1}`, port, role, hp, { turn }));
  run.focus = "centre";
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
function install(run: RunState, kind: InstallationKind, x: number, z: number): Installation {
  const item: Installation = { id: `${kind}${run.installations.length + 1}`, kind, x, z, integrity: RULES.installationIntegrity[kind], activeFrom: 0, owner: "h1" };
  run.installations.push(item);
  return item;
}
const node = (run: RunState, id: string) => run.topology.nodes.find(item => item.id === id);
/** Two online firewalls on the route ALPHA → r1 → OMEGA: r1 → f1 → OMEGA and r1 → f2 → OMEGA. */
function wall(run: RunState) {
  route(run, "r1", 0);
  device(run, "f1", "firewall", 2.5, 1.2);
  device(run, "f2", "firewall", 2.5, -1.2);
  wire(run, "r1", "f1", "omega");
  wire(run, "r1", "f2", "omega");
}
/** The forecast is pure and is exactly what the enemy phase resolves. */
function agree(run: RunState) {
  const snapshot = structuredClone(run);
  const preview = combatPreview(run);
  assert.deepEqual(run, snapshot, "combatPreview mutates nothing");
  const integrity = run.integrity;
  const result = endTurn(run);
  assert.deepEqual(result.forecast, preview, "the forecast equals the resolution");
  assert.equal(result.integrityDamage, preview.incoming);
  assert.equal(run.integrity, Math.max(0, integrity - preview.incoming));
  return { preview, result };
}
const values = (id: string) => CARDS[id as CardId].values;
/** Tuned costs are read from the data (balance may change them). */
const cost = (id: string) => CARDS[id as CardId].cost;
const term = (terms: { label: string; amount: number }[], label: string) => terms.find(item => item.label === label)?.amount;

// ------------------------------------------------------------------ the card list

test("the Warden's data is complete: every card of 9.2 at its cost, rarity and target, with an upgrade", () => {
  assert.deepEqual(missingCards("warden"), []);
  const spec: Record<string, [cost: number, rarity: string, target: string, plusCost: number]> = {
    "deep-inspection": [1, "basic", "instant", 1],
    brace: [1, "common", "instant", 1],
    pushback: [1, "common", "instant", 1],
    "stand-firm": [cost("stand-firm"), "common", "instant", cost("stand-firm+")],
    vent: [cost("vent"), "common", "instant", cost("vent+")],
    "double-shift": [1, "common", "instant", 0],
    "hardening-guide": [cost("hardening-guide"), "uncommon", "daemon", cost("hardening-guide+")],
    entrench: [cost("entrench"), "uncommon", "instant", cost("entrench+")],
    "persistent-state": [cost("persistent-state"), "rare", "daemon", cost("persistent-state+")],
    "flow-control": [cost("flow-control"), "rare", "daemon", cost("flow-control+")],
    reflect: [1, "rare", "instant", 0],
    "acl-gate": [1, "common", "ground", 1],
    "stateful-firewall": [2, "uncommon", "ground", 2],
    "sentry-firewall": [1, "uncommon", "ground", 1],
    bulkhead: [1, "uncommon", "instant", 1],
    perimeter: [1, "uncommon", "instant", 1],
    bastion: [2, "rare", "ground", 2],
    "defense-in-depth": [cost("defense-in-depth"), "rare", "daemon", cost("defense-in-depth+")],
    tripwire: [1, "common", "protocol", 1],
    "policy-engine": [1, "uncommon", "daemon", 0],
    rearm: [0, "uncommon", "instant", 0],
    "incident-response": [1, "rare", "daemon", 1],
    "null-route": [cost("null-route"), "rare", "protocol", cost("null-route+")],
  };
  assert.deepEqual(Object.keys(spec).sort(), [...CARD_IDS_BY_OWNER.warden].sort());
  for (const [id, [cost, rarity, target, plusCost]] of Object.entries(spec)) {
    const card = CARDS[id as CardId], plus = CARDS[`${id}+` as CardId];
    assert.ok(card && plus, `${id} has a + version`);
    assert.deepEqual([card.cost, card.rarity, card.target, plus.cost], [cost, rarity, target, plusCost], id);
    assert.equal(card.archetype, "warden", id);
    assert.match(card.subtitle, /^WARDEN \/ [A-Z ]+$/, id);
    assert.ok(plus.cost < card.cost || plus.rules !== card.rules || plus.jamProof !== card.jamProof, `${id}+ improves`);
    // Short faces (contract section 2): never above 130, the new cards within 90.
    for (const face of [card.rules, plus.rules]) assert.ok(face.length <= (id === "sentry-firewall" ? 130 : 90), `${id}: ${face}`);
    if (card.target === "daemon") assert.match(card.rules, /^Daemon\. /, id);
    if (card.target === "protocol") assert.match(card.rules, /^Armed\. /, id);
    // Every number an effect reads is printed on the face (or, for multipliers and ratios, spelled out).
    for (const face of [card, plus])
      for (const [key, value] of Object.entries(face.values))
        if (!["links", "amount"].includes(key)) assert.ok(face.rules.includes(String(value)), `${face.id} prints ${key} ${value}`);
  }
  // Rarity spread (contract section 9): 1 basic, 7 commons, 8 uncommons, 7 rares.
  const count = (rarity: string) => CARD_IDS_BY_OWNER.warden.filter(id => CARDS[id].rarity === rarity).length;
  assert.deepEqual([count("basic"), count("common"), count("uncommon"), count("rare")], [1, 7, 8, 7]);
  // Keywords where the contract puts them.
  assert.deepEqual(CARD_IDS_BY_OWNER.warden.filter(id => CARDS[id].retain), ["reflect"]);
  assert.deepEqual(CARD_IDS_BY_OWNER.warden.filter(id => CARDS[id].exhaust), ["reflect"]);
  assert.equal(CARDS.tripwire.protocol, "strike");
  assert.deepEqual([CARDS["null-route"].protocol, CARDS["null-route"].cancels], ["breach", true]);
  // Registered behaviour for every new card; the v4 cards keep their engine branches.
  for (const id of ["brace", "pushback", "vent", "double-shift", "entrench", "perimeter", "rearm"] as const) assert.ok(CARD_EFFECTS[id]?.play, id);
  assert.ok(DAEMON_HOOKS["persistent-state"]?.blockCarry && DAEMON_HOOKS["flow-control"]?.backpressureRatio && DAEMON_HOOKS["defense-in-depth"]?.firewallBonus
    && DAEMON_HOOKS["hardening-guide"]?.hardenBonus
    && DAEMON_HOOKS["policy-engine"]?.protocolSlots && DAEMON_HOOKS["incident-response"]?.protocolFired);
});

// ------------------------------------------------------------------ Firewall wall

test("Deep Packet Inspection: 3 block, +2 per online firewall (+: 5, +3); offline firewalls do not count", () => {
  const r = table("wraith", 1);
  wall(r);
  device(r, "f3", "firewall", -2.5, 2.4); // uncabled: offline
  r.hand = ["deep-inspection", "deep-inspection+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, values("deep-inspection").block! + 2 * values("deep-inspection").perFirewall!);
  const dpi = values("deep-inspection"), dpiPlus = values("deep-inspection+");
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, dpi.block! + 2 * dpi.perFirewall! + dpiPlus.block! + 2 * dpiPlus.perFirewall!);
  assert.equal(r.energy, 20 - cost("deep-inspection") - cost("deep-inspection+"));
  agree(r);
});

test("ACL Gate: a firewall cabled to its nearest device; online it blocks; ACL Gate+ also gains 3 block", () => {
  const r = table("reaver", 0); // breach 3
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "r1");
  r.hand = ["acl-gate", "fiber", "acl-gate+"];
  assert.ok(playGround(r, 0, 2.5, 0).ok);
  const gate = r.topology.nodes.at(-1)!;
  assert.equal(gate.role, "firewall");
  assert.ok(r.topology.links.some(link => link.a === gate.id && link.b === "r1"), "linked to r1, its nearest device");
  assert.equal(r.block, 0);
  // With one auto-link the gate still needs a cable to OMEGA; with two it may already have it.
  if (canLink(r.topology, gate.id, "omega")) assert.ok(playLink(r, r.hand.indexOf("fiber"), gate.id, "omega").ok);
  assert.ok(combatPreview(r).online.includes(gate.id));
  assert.ok(playGround(r, r.hand.indexOf("acl-gate+"), -2.5, 2.4).ok);
  assert.equal(r.block, values("acl-gate+").block);
  assert.equal(r.topology.links.filter(link => link.a === r.topology.nodes.at(-1)!.id).length, values("acl-gate+").links);
  const { preview } = agree(r);
  const online = preview.online.filter(id => node(r, id)?.role === "firewall").length;
  assert.equal(term(preview.shieldTerms, `Online firewalls ×${online} vs breach`), online * RULES.firewallBreachBlock);
});

test("Stateful Firewall blocks double (+: jam-proof); Sentry Firewall's quarantine deals 2 and adds shield (+: jam-proof)", () => {
  const r = table("reaver", 0); // breach 3
  route(r, "r1", 0);
  r.hand = ["stateful-firewall", "stateful-firewall+"];
  assert.ok(playGround(r, 0, 2.5, 0).ok);
  const stateful = r.topology.nodes.at(-1)!;
  assert.ok(stateful.stateful && !stateful.shielded);
  wire(r, "r1", stateful.id, "omega");
  assert.ok(playGround(r, 0, 2.5, 2.4).ok);
  assert.ok(r.topology.nodes.at(-1)!.stateful && r.topology.nodes.at(-1)!.shielded, "Stateful Firewall+ is jam-proof");
  assert.equal(r.energy, 20 - 4);
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Online firewalls ×1 vs breach"), 2 * RULES.firewallBreachBlock);
  const s = table("prophet", 1); // a strike
  route(s, "r1", 0);
  s.hand = ["sentry-firewall", "sentry-firewall+"];
  assert.ok(playGround(s, 0, 2.5, 0).ok);
  const sentry = s.topology.nodes.at(-1)!;
  assert.ok(sentry.sentry && !sentry.shielded);
  wire(s, "r1", sentry.id, "omega");
  install(s, "jammer", 2.5, 1.6);
  assert.ok(playGround(s, 0, -2.5, -2.4).ok);
  assert.ok(s.topology.nodes.at(-1)!.sentry && s.topology.nodes.at(-1)!.shielded, "Sentry Firewall+ is jam-proof");
  const quarantined = agree(s).preview;
  assert.deepEqual(quarantined.quarantine, [{ firewallId: sentry.id, installationId: "jammer1", damage: RULES.sentryQuarantine, destroys: true }]);
  assert.equal(quarantined.reclaim, RULES.reclaimShield + RULES.sentryReclaimBonus);
});

test("Bulkhead: 3 block and each online firewall blocks 1 more per attack this enemy phase (+: 5 block)", () => {
  const r = table("reaver", 0);
  wall(r);
  const firewalls = (p: ReturnType<typeof combatPreview>) => term(p.shieldTerms, "Online firewalls ×2 vs breach");
  const before = firewalls(combatPreview(r));
  r.hand = ["bulkhead", "bulkhead+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, values("bulkhead").block);
  assert.equal(firewalls(combatPreview(r))! - before!, 2 * values("bulkhead").firewallBonus!);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, values("bulkhead").block! + values("bulkhead+").block!);
  const { preview } = agree(r);
  assert.equal(firewalls(preview), 2 * (RULES.firewallBreachBlock + values("bulkhead").firewallBonus! + values("bulkhead+").firewallBonus!));
});

test("Perimeter: +2 damage this turn per online firewall (+: +3), counted when played", () => {
  const r = table("wraith", 1);
  wall(r);
  const base = combatPreview(r).packetDamage;
  r.hand = ["perimeter", "perimeter+"];
  const one = 2 * values("perimeter").perFirewall!, total = one + 2 * values("perimeter+").perFirewall!;
  assert.deepEqual(playInstant(r, 0), { ok: true, message: `Perimeter activated · +${one} damage (2 online firewalls).` });
  assert.equal(r.packetBoost, one);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, total);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Packet boost this turn"), total);
  assert.equal(preview.packetDamage, base + total);
  assert.equal(r.enemies[0].hp, hp - base - total);
  const none = table();
  route(none, "r1", 0);
  none.hand = ["perimeter"];
  assert.ok(playInstant(none, 0).ok, "no firewall: it plays for nothing");
  assert.equal(none.packetBoost, 0);
});

test("Bastion Firewall: a jam-proof firewall and 6 block (+: 9)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["bastion", "bastion+"];
  assert.ok(playGround(r, 0, 2.5, 0).ok);
  assert.ok(r.topology.nodes.at(-1)!.shielded && r.topology.nodes.at(-1)!.role === "firewall");
  assert.equal(r.block, values("bastion").block);
  assert.ok(playGround(r, 0, 2.5, 2.4).ok);
  assert.equal(r.block, values("bastion").block! + values("bastion+").block!);
  agree(r);
});

test("Defense in Depth: each online firewall blocks 1 more per attack; copies stack; the + runs beside the base", () => {
  const r = table("reaver", 0);
  wall(r);
  r.hand = ["defense-in-depth", "defense-in-depth", "defense-in-depth+"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("defense-in-depth"));
  assert.deepEqual(r.daemons, ["defense-in-depth"]);
  assert.equal(term(combatPreview(r).shieldTerms, "Defense in Depth · firewalls ×2"), 2 * values("defense-in-depth").firewallBonus!);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2 * cost("defense-in-depth") - cost("defense-in-depth+"));
  assert.deepEqual(runningDaemons(r).map(daemon => [daemon.id, daemon.count]), [["defense-in-depth", 2], ["defense-in-depth+", 1]]);
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Defense in Depth ×2 · firewalls ×2"), 2 * 2 * values("defense-in-depth").firewallBonus!);
  assert.equal(term(preview.shieldTerms, "Defense in Depth+ · firewalls ×2"), 2 * values("defense-in-depth+").firewallBonus!);
  assert.equal(preview.incoming, 0);
  // No online firewall, no term.
  const bare = table("reaver", 0);
  route(bare, "r1", 0);
  bare.daemons = ["defense-in-depth"];
  assert.ok(!combatPreview(bare).shieldTerms.some(item => item.label.startsWith("Defense in Depth")));
});

// ------------------------------------------------------------------ Fortress

test("Brace: 5 block now, 3 more next turn (+: 7 / 4); two Braces stack their next-turn block", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["brace", "brace+"];
  const brace = values("brace"), bracePlus = values("brace+");
  assert.deepEqual(playInstant(r, 0), { ok: true, message: `Brace activated · +${brace.nextBlock} block next turn.` });
  assert.equal(r.block, brace.block);
  assert.deepEqual(r.nextTurn, { block: brace.nextBlock });
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, brace.block! + bracePlus.block!);
  const next = brace.nextBlock! + bracePlus.nextBlock!;
  assert.deepEqual(r.nextTurn, { block: next });
  const { preview } = agree(r);
  assert.equal(preview.nextTurn.block, next);
  assert.equal(r.block, next, "this turn's block expired; next turn's arrived");
  assert.equal(r.nextTurn, undefined);
});

test("Pushback: 4 block and +2 backpressure, released by the next transmission (+: 6 / 3)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["pushback", "pushback+"];
  const push = values("pushback"), pushPlus = values("pushback+");
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.backpressure], [push.block, push.backpressure]);
  assert.ok(playInstant(r, 0).ok);
  const stored = push.backpressure! + pushPlus.backpressure!;
  assert.deepEqual([r.block, r.backpressure], [push.block! + pushPlus.block!, stored]);
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Backpressure"), stored);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + stored);
  assert.equal(r.backpressure, 0, "the transmission consumed it");
});

test("Stand Firm: 11 block for 2 energy (+: 15)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["stand-firm", "stand-firm+"];
  assert.ok(playInstant(r, 0).ok);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.energy], [values("stand-firm").block! + values("stand-firm+").block!, 20 - cost("stand-firm") - cost("stand-firm+")]);
  const { preview } = agree(r);
  assert.equal(preview.incoming, 0);
});

test("Vent: block equal to your backpressure, which stays stored (+: draw 1); at 0 it gains nothing", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.backpressure = 4;
  r.hand = ["vent", "vent+"];
  r.drawPile = ["pulse"];
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Vent activated · +4 block." });
  assert.deepEqual([r.block, r.backpressure, r.energy], [4, 4, 20]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.backpressure], [8, 4]);
  assert.deepEqual(r.hand, ["pulse"], "Vent+ drew 1");
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Backpressure"), 4, "the backpressure still rides the transmission");
  const empty = table();
  empty.hand = ["vent"];
  assert.ok(playInstant(empty, 0).ok);
  assert.equal(empty.block, 0);
});

test("Double Shift: Harden's block and repair without the console, draw 1 (+: cost 0); the console stays free", () => {
  const r = table("wraith", 1);
  wall(r);
  node(r, "r1")!.condition = 1;
  node(r, "r1")!.maxCondition = 2;
  r.hand = ["double-shift", "double-shift+"];
  r.drawPile = ["pulse", "guard"];
  const harden = hardenBlock(r);
  assert.equal(harden, RULES.hardenShield + 2 * RULES.hardenPerFirewall);
  const result = playInstant(r, 0);
  assert.deepEqual(result, { ok: true, message: `Double Shift activated · hardened +${harden} block · R1 repaired.` });
  assert.deepEqual([r.block, node(r, "r1")!.condition, r.consoleUses, r.energy], [harden, 2, 0, 20 - 1]);
  assert.deepEqual(r.hand, ["double-shift+", "pulse"]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.energy], [2 * harden, 20 - 1], "Double Shift+ costs 0");
  assert.ok(consoleState(r).usable);
  assert.ok(useConsole(r).ok, "Harden is still available");
  assert.equal(r.block, 3 * harden);
  agree(r);
});

test("Hardening Guide: Harden gains 3 more block, on the console and on Double Shift (+: cost 0); copies stack", () => {
  const r = table("wraith", 1); // a strike
  wall(r);
  const plain = hardenBlock(r);
  r.hand = ["hardening-guide", "hardening-guide", "hardening-guide+"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("hardening-guide"));
  assert.equal(hardenBlock(r), plain + values("hardening-guide").block!);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2 * cost("hardening-guide") - cost("hardening-guide+"), "Hardening Guide+ costs less");
  assert.deepEqual(runningDaemons(r).map(daemon => [daemon.id, daemon.count]), [["hardening-guide", 2], ["hardening-guide+", 1]]);
  const guided = plain + 3 * values("hardening-guide").block!;
  assert.equal(hardenBlock(r), guided);
  // The console: its block, then the forecast spends exactly that block.
  assert.ok(useConsole(r).ok);
  assert.equal(r.block, guided);
  const strike = combatPreview(r).incomingRaw;
  const hardened = agree(r).preview;
  assert.equal(term(hardened.shieldTerms, "Block this turn"), guided);
  assert.equal(hardened.incoming, Math.max(0, strike - guided - term(hardened.shieldTerms, "Online firewalls ×2 vs strike")!));
  // Double Shift: the same bonus, the console untouched.
  const d = table("wraith", 1);
  wall(d);
  d.daemons = ["hardening-guide"];
  d.hand = ["double-shift"];
  const guide = plain + values("hardening-guide").block!;
  assert.deepEqual(playInstant(d, 0), { ok: true, message: `Double Shift activated · hardened +${guide} block.` });
  assert.deepEqual([d.block, d.consoleUses], [guide, 0]);
  assert.equal(term(agree(d).preview.shieldTerms, "Block this turn"), guide);
  // Without a Harden, the daemon gives nothing.
  const idle = table("wraith", 1);
  route(idle, "r1", 0);
  idle.daemons = ["hardening-guide"];
  assert.equal(agree(idle).preview.shield, 0);
});

test("Entrench: double your block (+: cost 1); refused without block, nothing spent", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["entrench", "entrench+"];
  const before = structuredClone(r);
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "You have no block to double." });
  assert.deepEqual(r, before);
  r.block = 7;
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Entrench activated · +7 block." });
  assert.deepEqual([r.block, r.energy], [14, 20 - cost("entrench")]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.energy], [28, 20 - cost("entrench") - cost("entrench+")]);
  agree(r);
});

test("Persistent State: the block the attacks leave carries into the next turn, up to its cap; the highest cap counts", () => {
  const r = table("wraith", 1); // a strike
  route(r, "r1", 0);
  r.hand = ["persistent-state", "persistent-state+", "stand-firm"];
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("persistent-state") - cost("persistent-state+"));
  assert.ok(playInstant(r, 0).ok);
  const wall = values("stand-firm").block!;
  const strike = combatPreview(r).incomingRaw;
  assert.ok(strike > 0);
  const { preview } = agree(r);
  // The upgraded copy's cap is the higher one: it names the carry, and copies never add up.
  const cap = Math.max(values("persistent-state").amount!, values("persistent-state+").amount!);
  assert.ok(values("persistent-state+").amount! >= values("persistent-state").amount!);
  const carried = Math.min(wall - strike, cap);
  assert.ok(carried < wall - strike, "the cap binds against a Stand Firm wall");
  assert.deepEqual(preview.blockCarried, { amount: carried, by: CARDS["persistent-state+"].name });
  assert.equal(preview.nextTurn.block, carried);
  assert.equal(r.block, carried);
  // Without the daemon, block expires.
  const plain = table("wraith", 1);
  route(plain, "r1", 0);
  plain.block = 11;
  assert.equal(agree(plain).preview.blockCarried, null);
  assert.equal(plain.block, 0);
});

test("Flow Control: the Backpressure relic stores all the prevented damage, not half; copies add nothing", () => {
  const half = table("wraith", 1);
  half.relics = ["backpressure"];
  route(half, "r1", 0);
  half.block = 10;
  const strike = combatPreview(half).incomingRaw;
  assert.equal(agree(half).preview.backpressureGain, Math.ceil(strike * RULES.backpressureRatio));
  const r = table("wraith", 1);
  r.relics = ["backpressure"];
  route(r, "r1", 0);
  r.hand = ["flow-control", "flow-control", "guard"];
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playInstant(r, 0).ok);
  const { preview } = agree(r);
  assert.equal(preview.backpressureGain, Math.ceil(strike * Math.max(RULES.backpressureRatio, values("flow-control").amount!)));
  assert.ok(preview.backpressureGain > Math.ceil(strike * RULES.backpressureRatio), "it stores more than the relic alone");
  assert.equal(r.backpressure, preview.backpressureGain);
  // It changes the relic's share: without the relic nothing is stored.
  const bare = table("wraith", 1);
  route(bare, "r1", 0);
  bare.daemons = ["flow-control"];
  bare.block = 10;
  assert.equal(agree(bare).preview.backpressureGain, 0);
});

test("Reflect: Retain, double your backpressure, Exhaust (+: cost 0); refused without backpressure", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["reflect+", "reflect"];
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "No backpressure is stored yet." });
  r.backpressure = 3;
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.backpressure, r.energy], [6, 20]);
  assert.ok(r.exhaustPile.includes("reflect+"));
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Backpressure"), 6);
  assert.deepEqual(r.hand.slice(0, 1), ["reflect"], "the unplayed Reflect was retained");
});

// ------------------------------------------------------------------ Protocols

test("Tripwire: armed, the striker takes 5 in the trap step (+: 8); a striker it kills never acts", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["tripwire"];
  assert.deepEqual(playProtocol(r, 0), { ok: true, message: "Tripwire armed. It fires on the matching enemy action." });
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.deepEqual(preview.protocolTriggers.map(item => [item.card, item.effect]), [["tripwire", `The attacker takes ${values("tripwire").damage}.`]]);
  assert.equal(preview.hostiles[0].trapDamage, values("tripwire").damage);
  assert.ok(preview.incoming > 0, "the strike still lands");
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage - values("tripwire").damage!);
  assert.ok(r.discardPile.includes("tripwire"));
  const k = table("wraith", 1);
  k.enemies[0].hp = values("tripwire+").damage!;
  k.hand = ["tripwire+"];
  playProtocol(k, 0);
  assert.equal(combatPreview(k).enemyDefeatedByTraps, true);
  assert.equal(endTurn(k).defeated, true);
  // Not a breach trap.
  const b = table("reaver", 0);
  route(b, "r1", 0);
  b.hand = ["tripwire"];
  playProtocol(b, 0);
  assert.deepEqual(agree(b).preview.protocolTriggers, []);
});

test("Policy Engine: arm 1 more protocol per copy (+: cost 0)", () => {
  const r = table("wraith", 0);
  r.hand = ["policy-engine", "policy-engine+", "tripwire", "rate-limiter", "failover-policy", "null-route", "port-security"];
  assert.equal(protocolLimit(r), RULES.maxProtocols);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(protocolLimit(r), RULES.maxProtocols + 1);
  assert.equal(r.energy, 20 - 1);
  for (let i = 0; i < 3; i++) assert.ok(playProtocol(r, 1).ok);
  assert.deepEqual(playProtocol(r, 1), { ok: false, message: `Only ${RULES.maxProtocols + 1} protocols can be armed at once.` });
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 1 - 3, "Policy Engine+ cost 0");
  assert.equal(protocolLimit(r), RULES.maxProtocols + 2);
  assert.ok(playProtocol(r, 0).ok);
  assert.equal(r.protocols.length, 4);
  // Two copies of one id stack.
  const s = table();
  s.daemons = ["policy-engine", "policy-engine"];
  assert.equal(protocolLimit(s), RULES.maxProtocols + 2);
});

test("Rearm: the last discarded protocol returns to hand and costs 0 this turn (+: draw 1); refused with none", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["rearm", "rearm+"];
  r.discardPile = ["guard", "fiber"];
  const before = structuredClone(r);
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "No protocol is in your discard pile." });
  assert.deepEqual(r, before);
  r.discardPile = ["tripwire", "guard", "rate-limiter", "fiber"];
  r.drawPile = ["pulse"];
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Rearm activated · Rate Limiter returns for 0." });
  assert.deepEqual(r.hand, ["rearm+", "rate-limiter"]);
  assert.deepEqual(r.discardPile, ["tripwire", "guard", "fiber", "rearm"]);
  assert.equal(costFor(r, 1), 0);
  assert.ok(playProtocol(r, 1).ok);
  assert.equal(r.energy, 20, "Rearm and the protocol cost nothing");
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["tripwire", "pulse"], "Rearm+ found Tripwire and drew 1");
  assert.equal(costFor(r, 0), 0);
  // The discount lasts this turn only.
  const { preview } = agree(r);
  assert.equal(preview.protocolTriggers[0].card, "rate-limiter");
  r.hand = ["tripwire"];
  assert.equal(costFor(r, 0), CARDS.tripwire.cost);
});

test("Incident Response: whoever sets a protocol off takes 3 (+: 5); copies stack, base and + apart", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["incident-response", "incident-response", "incident-response+", "rate-limiter"];
  for (let i = 0; i < 3; i++) assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2 * cost("incident-response") - cost("incident-response+"));
  assert.ok(playProtocol(r, 0).ok);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  const [fired] = preview.protocolTriggers;
  const two = 2 * values("incident-response").damage!, upgradedHit = values("incident-response+").damage!;
  assert.deepEqual(fired.retaliation, [{ label: "Incident Response ×2", amount: two }, { label: "Incident Response+", amount: upgradedHit }]);
  assert.equal(fired.effect, `Reduces the strike by ${values("rate-limiter").reduce}. Incident Response ×2: it takes ${two}. Incident Response+: it takes ${upgradedHit}.`);
  assert.equal(preview.hostiles[0].trapDamage, two + upgradedHit);
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage - two - upgradedHit);
  // No protocol fires, no damage.
  const quiet = table("wraith", 1);
  route(quiet, "r1", 0);
  quiet.daemons = ["incident-response"];
  assert.equal(agree(quiet).preview.hostiles[0].trapDamage, 0);
});

test("Null Route: the breach deals 0, its riders still resolve (+: cost 1); a strike does not set it off", () => {
  const r = table("reaver", 0); // breach 3 + corrosion
  route(r, "r1", 0);
  r.hand = ["null-route", "null-route+"];
  assert.ok(playProtocol(r, 0).ok);
  assert.equal(r.energy, 20 - cost("null-route"));
  const { preview } = agree(r);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.hostiles[0].nullified, "Null Route");
  assert.deepEqual(preview.protocolTriggers.map(item => item.effect), ["Cancels the breach."]);
  assert.ok(preview.incomingTerms.some(item => item.label === "Null Route · breach cancelled"));
  assert.ok(r.zoneEffects.some(field => field.kind === "corrosion"), "the corrosion rider resolved");
  assert.equal(costFor(r, 0), CARDS["null-route+"].cost);
  const s = table("wraith", 1);
  route(s, "r1", 0);
  s.hand = ["null-route"];
  playProtocol(s, 0);
  const strike = agree(s).preview;
  assert.ok(strike.incoming > 0);
  assert.deepEqual(s.protocols, ["null-route"], "still armed");
});

// ------------------------------------------------------------------ the three build paths

test("Fortress path: Persistent State, Flow Control and Hardening Guide turn two turns of block into a doubled wall and a backpressure transmission", () => {
  const r = table("wraith", 1); // a strike, then a jam
  r.relics = ["backpressure"];
  route(r, "r1", 0);
  // Turn 1: the daemons, then 11 + 5 block, a guided Harden, and 3 more block next turn.
  r.hand = ["persistent-state", "flow-control", "hardening-guide", "stand-firm", "brace"];
  for (let i = 0; i < 3; i++) assert.ok(playDaemon(r, 0).ok);
  for (let i = 0; i < 2; i++) assert.ok(playInstant(r, 0).ok);
  const harden = RULES.hardenShield + values("hardening-guide").block!;
  assert.equal(hardenBlock(r), harden);
  assert.ok(useConsole(r).ok);
  const wall1 = values("stand-firm").block! + values("brace").block! + harden;
  assert.equal(r.block, wall1);
  const first = agree(r).preview;
  const strike = first.incomingRaw;
  assert.ok(strike > 0);
  assert.equal(first.incoming, 0);
  const gain = Math.ceil(strike * Math.max(RULES.backpressureRatio, values("flow-control").amount!));
  assert.equal(first.backpressureGain, gain, "Flow Control's share of it");
  const carried = Math.min(wall1 - strike, values("persistent-state").amount!);
  assert.deepEqual(first.blockCarried, { amount: carried, by: "Persistent State" });
  assert.deepEqual([r.block, r.backpressure], [carried + values("brace").nextBlock!, gain]);
  // Turn 2: Pushback, Vent and Entrench stack the kept block; the backpressure rides the route.
  r.energy = 20;
  r.hand = ["pushback", "vent", "entrench"];
  for (let i = 0; i < 3; i++) assert.ok(playInstant(r, 0).ok);
  const kept = carried + values("brace").nextBlock!, pushed = gain + values("pushback").backpressure!;
  assert.equal(r.block, 2 * (kept + values("pushback").block! + pushed));
  const hp = r.enemies[0].hp;
  const second = agree(r).preview;
  assert.equal(term(second.damageTerms, "Backpressure"), pushed);
  assert.equal(second.packetDamage, RULES.baseRouteDamage + pushed);
  assert.equal(r.enemies[0].hp, hp - RULES.baseRouteDamage - pushed);
  assert.equal(second.blockCarried?.amount, Math.min(2 * (kept + values("pushback").block! + pushed), values("persistent-state").amount!), "a jam spends no block: up to the cap carries");
});

test("Firewall wall path: ACL Gate and Trust Gate online, Defense in Depth and Bulkhead thicken them, DPI and Perimeter cash them in", () => {
  const r = table("reaver", 0); // breach 3 + corrosion
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "r1");
  r.hand = ["acl-gate", "fiber", "firewall", "fiber", "fiber", "defense-in-depth", "bulkhead", "deep-inspection", "perimeter"];
  assert.ok(playGround(r, 0, 2.5, 0).ok, "ACL Gate cables itself to r1");
  const gate = r.topology.nodes.at(-1)!.id;
  if (canLink(r.topology, gate, "omega")) assert.ok(playLink(r, r.hand.indexOf("fiber"), gate, "omega").ok);
  assert.ok(playGround(r, r.hand.indexOf("firewall"), -2.5, 2.4).ok, "Trust Gate");
  const trust = r.topology.nodes.at(-1)!.id;
  for (const [a, b] of [["alpha", trust], [trust, "r1"]]) if (canLink(r.topology, a, b)) assert.ok(playLink(r, r.hand.indexOf("fiber"), a, b).ok);
  assert.deepEqual(combatPreview(r).online.filter(id => node(r, id)!.role === "firewall").sort(), [gate, trust].sort());
  assert.ok(playDaemon(r, r.hand.indexOf("defense-in-depth")).ok);
  for (const id of ["bulkhead", "deep-inspection", "perimeter"] as CardId[]) assert.ok(playInstant(r, r.hand.indexOf(id)).ok);
  const dpi = values("deep-inspection"), firewalls = 2;
  assert.equal(r.block, values("bulkhead").block! + dpi.block! + firewalls * dpi.perFirewall!);
  assert.equal(r.packetBoost, firewalls * values("perimeter").perFirewall!);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Online firewalls ×2 vs breach"), firewalls * (RULES.firewallBreachBlock + values("bulkhead").firewallBonus!));
  assert.equal(term(preview.shieldTerms, "Defense in Depth · firewalls ×2"), firewalls * values("defense-in-depth").firewallBonus!);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + firewalls * values("perimeter").perFirewall!);
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage);
});

test("Protocols path: Policy Engine arms three, Tripwire and Incident Response kill the striker in the trap step, Null Route eats the breach, Rearm reloads", () => {
  const r = pack([["spark-mite", "left", "escort", 8, 0], ["reaver", "centre", "leader", 200, 0]]);
  r.enemyPhase = 0; // the escort acts on the next (odd) phase
  route(r, "r1", 0);
  r.hand = ["policy-engine", "incident-response", "tripwire", "null-route", "rate-limiter", "failover-policy"];
  for (let i = 0; i < 2; i++) assert.ok(playDaemon(r, 0).ok);
  for (let i = 0; i < 3; i++) assert.ok(playProtocol(r, 0).ok);
  assert.deepEqual(playProtocol(r, 0), { ok: false, message: `Only ${RULES.maxProtocols + 1} protocols can be armed at once.` });
  r.hand = [];
  const [mite, reaver] = r.enemies;
  const reaverHp = reaver.hp;
  const { preview } = agree(r);
  const retaliation = values("incident-response").damage!;
  assert.deepEqual(preview.protocolTriggers.map(item => [item.card, item.target]), [["tripwire", mite.uid], ["null-route", reaver.uid]]);
  assert.equal(preview.hostiles[0].trapDamage, values("tripwire").damage! + retaliation);
  assert.equal(preview.hostiles[1].trapDamage, retaliation);
  assert.equal(preview.hostiles[1].nullified, "Null Route");
  assert.equal(preview.incoming, 0, "the striker fell in the trap step and the breach was cancelled");
  assert.ok(mite.hp <= 0);
  assert.equal(reaver.hp, reaverHp - preview.ports.centre!.packet + preview.ports.centre!.overflowOut - retaliation);
  assert.deepEqual(r.protocols, ["rate-limiter"], "one strike trap per phase: Rate Limiter stays armed");
  assert.deepEqual(r.discardPile.slice(-2), ["tripwire", "null-route"]);
  // Next turn: Rearm reloads Null Route for free.
  r.hand = ["rearm"];
  const energy = r.energy;
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["null-route"]);
  assert.ok(playProtocol(r, 0).ok);
  assert.equal(r.energy, energy);
  assert.deepEqual(r.protocols, ["rate-limiter", "null-route"]);
});
