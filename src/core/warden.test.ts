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
const term = (terms: { label: string; amount: number }[], label: string) => terms.find(item => item.label === label)?.amount;

// ------------------------------------------------------------------ the card list

test("the Warden's data is complete: every card of 9.2 at its cost, rarity and target, with an upgrade", () => {
  assert.deepEqual(missingCards("warden"), []);
  const spec: Record<string, [cost: number, rarity: string, target: string, plusCost: number]> = {
    "deep-inspection": [1, "basic", "instant", 1],
    brace: [1, "common", "instant", 1],
    pushback: [1, "common", "instant", 1],
    "stand-firm": [2, "common", "instant", 2],
    vent: [0, "common", "instant", 0],
    "double-shift": [1, "common", "instant", 0],
    "hardening-guide": [1, "uncommon", "daemon", 0],
    entrench: [2, "uncommon", "instant", 1],
    "persistent-state": [2, "rare", "daemon", 1],
    "flow-control": [2, "rare", "daemon", 1],
    reflect: [1, "rare", "instant", 0],
    "acl-gate": [1, "common", "ground", 1],
    "stateful-firewall": [2, "uncommon", "ground", 2],
    "sentry-firewall": [1, "uncommon", "ground", 1],
    bulkhead: [1, "uncommon", "instant", 1],
    perimeter: [1, "uncommon", "instant", 1],
    bastion: [2, "rare", "ground", 2],
    "defense-in-depth": [2, "rare", "daemon", 1],
    tripwire: [1, "common", "protocol", 1],
    "policy-engine": [1, "uncommon", "daemon", 0],
    rearm: [0, "uncommon", "instant", 0],
    "incident-response": [1, "rare", "daemon", 1],
    "null-route": [2, "rare", "protocol", 1],
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
  assert.equal(r.block, 3 + 2 * 2);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, 7 + 5 + 2 * 3);
  assert.equal(r.energy, 20 - 2);
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
  assert.ok(playLink(r, 0, gate.id, "omega").ok);
  assert.ok(combatPreview(r).online.includes(gate.id));
  assert.ok(playGround(r, 0, -2.5, 2.4).ok);
  assert.equal(r.block, values("acl-gate+").block);
  assert.equal(r.topology.links.filter(link => link.a === r.topology.nodes.at(-1)!.id).length, values("acl-gate+").links);
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Online firewalls ×1 vs breach"), RULES.firewallBreachBlock);
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
  assert.equal(r.block, 3 + 5);
  const { preview } = agree(r);
  assert.equal(firewalls(preview), 2 * (RULES.firewallBreachBlock + 2));
});

test("Perimeter: +2 damage this turn per online firewall (+: +3), counted when played", () => {
  const r = table("wraith", 1);
  wall(r);
  const base = combatPreview(r).packetDamage;
  r.hand = ["perimeter", "perimeter+"];
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Perimeter activated · +4 damage (2 online firewalls)." });
  assert.equal(r.packetBoost, 2 * values("perimeter").perFirewall!);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 4 + 2 * 3);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Packet boost this turn"), 10);
  assert.equal(preview.packetDamage, base + 10);
  assert.equal(r.enemies[0].hp, hp - base - 10);
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
  assert.equal(r.block, 6);
  assert.ok(playGround(r, 0, 2.5, 2.4).ok);
  assert.equal(r.block, 6 + 9);
  agree(r);
});

test("Defense in Depth: each online firewall blocks 1 more per attack; copies stack; the + runs beside the base", () => {
  const r = table("reaver", 0);
  wall(r);
  r.hand = ["defense-in-depth", "defense-in-depth", "defense-in-depth+"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2);
  assert.deepEqual(r.daemons, ["defense-in-depth"]);
  assert.equal(term(combatPreview(r).shieldTerms, "Defense in Depth · firewalls ×2"), 2);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2 - 2 - 1);
  assert.deepEqual(runningDaemons(r).map(daemon => [daemon.id, daemon.count]), [["defense-in-depth", 2], ["defense-in-depth+", 1]]);
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Defense in Depth ×2 · firewalls ×2"), 2 * 2 * values("defense-in-depth").firewallBonus!);
  assert.equal(term(preview.shieldTerms, "Defense in Depth+ · firewalls ×2"), 2);
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
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Brace activated · +3 block next turn." });
  assert.equal(r.block, 5);
  assert.deepEqual(r.nextTurn, { block: 3 });
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, 5 + 7);
  assert.deepEqual(r.nextTurn, { block: 3 + 4 });
  const { preview } = agree(r);
  assert.equal(preview.nextTurn.block, 7);
  assert.equal(r.block, 7, "this turn's block expired; next turn's arrived");
  assert.equal(r.nextTurn, undefined);
});

test("Pushback: 4 block and +2 backpressure, released by the next transmission (+: 6 / 3)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["pushback", "pushback+"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.backpressure], [4, 2]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.backpressure], [4 + 6, 2 + 3]);
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Backpressure"), 5);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 5);
  assert.equal(r.backpressure, 0, "the transmission consumed it");
});

test("Stand Firm: 11 block for 2 energy (+: 15)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["stand-firm", "stand-firm+"];
  assert.ok(playInstant(r, 0).ok);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.energy], [11 + 15, 20 - 4]);
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
  assert.equal(r.energy, 20 - 1);
  assert.equal(hardenBlock(r), plain + values("hardening-guide").block!);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2, "Hardening Guide+ costs 0");
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
  assert.deepEqual(playInstant(d, 0), { ok: true, message: `Double Shift activated · hardened +${plain + 3} block.` });
  assert.deepEqual([d.block, d.consoleUses], [plain + 3, 0]);
  assert.equal(term(agree(d).preview.shieldTerms, "Block this turn"), plain + 3);
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
  assert.deepEqual([r.block, r.energy], [14, 18]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.block, r.energy], [28, 17]);
  agree(r);
});

test("Persistent State: the block the attacks leave carries into the next turn; copies add nothing", () => {
  const r = table("wraith", 1); // a strike
  route(r, "r1", 0);
  r.hand = ["persistent-state", "persistent-state+", "stand-firm"];
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - 2 - 1);
  assert.ok(playInstant(r, 0).ok);
  const strike = combatPreview(r).incomingRaw;
  assert.ok(strike > 0);
  const { preview } = agree(r);
  assert.deepEqual(preview.blockCarried, { amount: 11 - strike, by: "Persistent State" }, "the first running daemon names it; two copies carry once");
  assert.equal(preview.nextTurn.block, 11 - strike);
  assert.equal(r.block, 11 - strike);
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
  assert.equal(preview.backpressureGain, strike * values("flow-control").amount!);
  assert.equal(r.backpressure, strike);
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
  assert.deepEqual(preview.protocolTriggers.map(item => [item.card, item.effect]), [["tripwire", "The attacker takes 5."]]);
  assert.equal(preview.hostiles[0].trapDamage, values("tripwire").damage);
  assert.ok(preview.incoming > 0, "the strike still lands");
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage - 5);
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
  assert.equal(r.energy, 20 - 3);
  assert.ok(playProtocol(r, 0).ok);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  const [fired] = preview.protocolTriggers;
  assert.deepEqual(fired.retaliation, [{ label: "Incident Response ×2", amount: 6 }, { label: "Incident Response+", amount: 5 }]);
  assert.equal(fired.effect, `Reduces the strike by ${values("rate-limiter").reduce}. Incident Response ×2: it takes 6. Incident Response+: it takes 5.`);
  assert.equal(preview.hostiles[0].trapDamage, 11);
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage - 11);
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
  assert.equal(r.energy, 18);
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
  const wall1 = 11 + 5 + harden;
  assert.equal(r.block, wall1);
  const first = agree(r).preview;
  const strike = first.incomingRaw;
  assert.ok(strike > 0);
  assert.equal(first.incoming, 0);
  assert.equal(first.backpressureGain, strike, "Flow Control: all of it");
  assert.deepEqual(first.blockCarried, { amount: wall1 - strike, by: "Persistent State" });
  assert.deepEqual([r.block, r.backpressure], [wall1 - strike + 3, strike]);
  // Turn 2: Pushback, Vent and Entrench stack the kept block; the backpressure rides the route.
  r.energy = 20;
  r.hand = ["pushback", "vent", "entrench"];
  for (let i = 0; i < 3; i++) assert.ok(playInstant(r, 0).ok);
  const kept = wall1 - strike + 3, pushed = strike + values("pushback").backpressure!;
  assert.equal(r.block, 2 * (kept + values("pushback").block! + pushed));
  const hp = r.enemies[0].hp;
  const second = agree(r).preview;
  assert.equal(term(second.damageTerms, "Backpressure"), pushed);
  assert.equal(second.packetDamage, RULES.baseRouteDamage + pushed);
  assert.equal(r.enemies[0].hp, hp - RULES.baseRouteDamage - pushed);
  assert.equal(second.blockCarried?.amount, 2 * (kept + values("pushback").block! + pushed), "a jam spends no block: all of it carries");
});

test("Firewall wall path: ACL Gate and Trust Gate online, Defense in Depth and Bulkhead thicken them, DPI and Perimeter cash them in", () => {
  const r = table("reaver", 0); // breach 3 + corrosion
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "r1");
  r.hand = ["acl-gate", "fiber", "firewall", "fiber", "fiber", "defense-in-depth", "bulkhead", "deep-inspection", "perimeter"];
  assert.ok(playGround(r, 0, 2.5, 0).ok, "ACL Gate cables itself to r1");
  const gate = r.topology.nodes.at(-1)!.id;
  assert.ok(playLink(r, 0, gate, "omega").ok);
  assert.ok(playGround(r, 0, -2.5, 2.4).ok, "Trust Gate");
  const trust = r.topology.nodes.at(-1)!.id;
  assert.ok(playLink(r, 0, "alpha", trust).ok);
  assert.ok(playLink(r, 0, trust, "r1").ok);
  assert.deepEqual(combatPreview(r).online.filter(id => node(r, id)!.role === "firewall").sort(), [gate, trust].sort());
  assert.ok(playDaemon(r, 0).ok);
  for (let i = 0; i < 3; i++) assert.ok(playInstant(r, 0).ok);
  const dpi = values("deep-inspection"), firewalls = 2;
  assert.equal(r.block, values("bulkhead").block! + dpi.block! + firewalls * dpi.perFirewall!);
  assert.equal(r.packetBoost, firewalls * values("perimeter").perFirewall!);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.equal(term(preview.shieldTerms, "Online firewalls ×2 vs breach"), firewalls * (RULES.firewallBreachBlock + values("bulkhead").firewallBonus!));
  assert.equal(term(preview.shieldTerms, "Defense in Depth · firewalls ×2"), firewalls * values("defense-in-depth").firewallBonus!);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 4);
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
