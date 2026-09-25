/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** v5 · Three Energy: the Architect's cards (contract section 9.1). One test per card at least (it
 * plays, its numbers, its upgrade), stacking for the daemons, forecast-equals-resolution for every
 * card that acts in the transmission or the enemy phase, and one scripted integration test per build
 * path (Mesh, Backbone, Deployment). The helpers follow src/core/engine-v5.test.ts. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES, missingCards } from "./cards.ts";
import { newExpedition } from "./expedition.ts";
import { ARCHITECT_CARD_IDS, type CardId, type NetworkNode, type RunState } from "./types.ts";
import {
  api, chooseRoom, combatPreview, costFor, endTurn, playDaemon, playGround, playInstant, playLink, playNode, runningDaemons,
} from "./run.ts";
import { linkKey } from "./graph.ts";
import { ARCHITECT_EFFECTS } from "./effects/architect.ts";

// ------------------------------------------------------------------ helpers

/** A clean first-fight table: terminals only, no wreckage, one Cable Wraith at a chosen intent
 * (0 cut, 1 strike 3, 2 jam), 20 energy, 100 integrity, guards to draw. */
function table(turn = 1): RunState {
  const run = newExpedition("architect", 0x5eed1234).run;
  chooseRoom(run, "0-1");
  const foe = run.enemies[0];
  foe.id = "wraith";
  foe.hp = foe.maxHp = 200;
  foe.turn = turn;
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = [];
  run.block = 0;
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  if (run.terrain) run.terrain.debris = [];
  run.hand = [];
  run.drawPile = Array<CardId>(30).fill("guard");
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
const node = (run: RunState, id: string) => run.topology.nodes.find(item => item.id === id);
const linked = (run: RunState, a: string, b: string) => run.topology.links.find(link => linkKey(link.a, link.b) === linkKey(a, b));
/** The forecast is pure and is exactly what the enemy phase resolves. */
function agree(run: RunState) {
  const snapshot = structuredClone(run);
  const preview = combatPreview(run);
  assert.deepEqual(run, snapshot, "combatPreview mutates nothing");
  const integrity = run.integrity, hp = run.enemies[0].hp;
  const result = endTurn(run);
  assert.deepEqual(result.forecast, preview, "the forecast equals the resolution");
  assert.equal(result.integrityDamage, preview.incoming);
  assert.equal(run.integrity, Math.max(0, integrity - preview.incoming));
  assert.equal(run.enemies[0].hp, Math.max(0, hp - preview.packetDamage), "the transmission dealt what the forecast said");
  return { preview, result };
}
const term = (preview: ReturnType<typeof combatPreview>, label: string) => preview.damageTerms.find(item => item.label === label)?.amount;
const plus = (id: CardId) => `${id}+` as CardId;
/** Tuned numbers are read from the data (balance may change them). */
const V = (id: CardId) => CARDS[id].values as Required<(typeof CARDS)[CardId]["values"]>;
const cost = (id: CardId) => CARDS[id].cost;
/** A play that must be refused without changing anything. */
function refused(run: RunState, play: () => { ok: boolean; message: string }, message: string) {
  const before = structuredClone(run);
  assert.deepEqual(play(), { ok: false, message });
  assert.deepEqual(run, before, "a refused play spends nothing");
}

// ------------------------------------------------------------------ the set

test("the Architect's set is complete: 23 cards of section 9.1 with their costs, rarities, targets and upgrades", () => {
  assert.deepEqual(missingCards("architect"), []);
  // [cost, rarity, target, role, cost of the + version]
  const spec: Record<(typeof ARCHITECT_CARD_IDS)[number], [number, string, string, string | undefined, number]> = {
    "branch-line": [1, "basic", "link", undefined, 1],
    "patch-panel": [1, "common", "link", undefined, 1],
    "redundant-paths": [1, "common", "instant", undefined, 1],
    "standby-router": [1, "common", "ground", "router", 1],
    ecmp: [1, "uncommon", "instant", undefined, 1],
    "flood-fill": [1, "uncommon", "instant", undefined, 1],
    mirror: [1, "uncommon", "instant", undefined, 1],
    "mesh-weave": [cost("mesh-weave"), "uncommon", "node", undefined, cost("mesh-weave+")],
    "peering-session": [1, "uncommon", "daemon", undefined, 1],
    "spine-leaf": [1, "rare", "ground", "switch", 0],
    "fabric-controller": [cost("fabric-controller"), "rare", "daemon", undefined, cost("fabric-controller+")],
    "trunk-line": [1, "common", "instant", undefined, 1],
    splice: [1, "common", "instant", undefined, 0],
    traceroute: [0, "common", "instant", undefined, 0],
    "deep-buffers": [1, "uncommon", "daemon", undefined, 0],
    "line-rate": [cost("line-rate"), "rare", "instant", undefined, cost("line-rate+")],
    "carrier-grade": [cost("carrier-grade"), "rare", "daemon", undefined, cost("carrier-grade+")],
    "rack-and-stack": [1, "common", "ground", "switch", 0],
    blueprint: [1, "common", "instant", undefined, 1],
    "rapid-redeploy": [1, "uncommon", "instant", undefined, 1],
    "provisioning-script": [1, "uncommon", "daemon", undefined, 1],
    "zero-touch": [1, "rare", "daemon", undefined, 0],
    datacenter: [cost("datacenter"), "rare", "daemon", undefined, cost("datacenter+")],
  };
  assert.deepEqual(Object.keys(spec), [...ARCHITECT_CARD_IDS]);
  const tally: Record<string, number> = {};
  for (const id of ARCHITECT_CARD_IDS) {
    const card = CARDS[id], upgraded = CARDS[plus(id)];
    const [cost, rarity, target, role, plusCost] = spec[id];
    assert.deepEqual([card.cost, card.rarity, card.target, card.role, upgraded?.cost], [cost, rarity, target, role, plusCost], id);
    assert.equal(card.archetype, "architect", id);
    assert.match(card.subtitle, /^ARCHITECT \/ [A-Z -]+$/, id);
    assert.ok(upgraded.cost < card.cost || upgraded.rules !== card.rules, `${id}+ improves the card`);
    // Short faces: at most 90 characters where possible, never above 130.
    for (const face of [card.rules, upgraded.rules]) assert.ok(face.length <= 130, `${id}: ${face}`);
    if (id !== "rapid-redeploy") assert.ok(upgraded.rules.length <= 90 && card.rules.length <= 90, `${id} fits 90`);
    // Daemons say so; exhaust cards say so.
    if (card.target === "daemon") assert.match(card.rules, /^Daemon\. /, id);
    assert.equal(/Exhaust\.$/.test(card.rules), !!card.exhaust, id);
    // Every number the effect reads is printed on the face (counts in words and cost cuts aside).
    for (const version of [card, upgraded])
      for (const [key, value] of Object.entries(version.values))
        if (!["links", "freeLinks", "recover"].includes(key)) assert.ok(version.rules.includes(String(value)), `${version.id} prints ${key} ${value}`);
    tally[card.rarity] = (tally[card.rarity] ?? 0) + 1;
  }
  assert.deepEqual(tally, { basic: 1, common: 8, uncommon: 8, rare: 6 });
  // The registry holds the new cards' rules (Standby Router is data: a ground card with values.links).
  assert.deepEqual(Object.keys(ARCHITECT_EFFECTS.cards ?? {}).sort(),
    ["blueprint", "branch-line", "line-rate", "patch-panel", "rack-and-stack", "redundant-paths", "splice", "trunk-line", "traceroute"].sort());
  assert.deepEqual(Object.keys(ARCHITECT_EFFECTS.daemons ?? {}).sort(),
    ["carrier-grade", "datacenter", "deep-buffers", "fabric-controller", "peering-session", "provisioning-script", "zero-touch"].sort());
});

// ------------------------------------------------------------------ Mesh

test("Branch Line: draws only when its cable adds a channel; Branch Line+ draws 2", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  device(r, "r3", "router", 0, -2.4);
  wire(r, "alpha", "r2");
  wire(r, "alpha", "r3");
  r.hand = ["branch-line", "branch-line+", "branch-line"];
  r.drawPile = ["pulse", "guard", "barrier", "fiber"];
  assert.ok(playLink(r, 0, "r2", "omega").ok);
  assert.deepEqual(r.hand, ["branch-line+", "branch-line", "pulse"], "a new channel: it drew 1");
  assert.ok(playLink(r, 0, "r3", "omega").ok);
  assert.deepEqual(r.hand, ["branch-line", "pulse", "guard", "barrier"], "Branch Line+ drew 2");
  assert.ok(playLink(r, 0, "r1", "r2").ok);
  assert.deepEqual(r.hand, ["pulse", "guard", "barrier"], "no new channel: no draw");
  assert.equal(r.energy, 20 - 3 * CARDS["branch-line"].cost);
});

test("Patch Panel: the next link card this turn costs 0; Hot Swap pays first; Patch Panel+ draws 1", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  r.hand = ["patch-panel", "fiber", "fiber"];
  assert.ok(playLink(r, 0, "alpha", "r2").ok);
  assert.equal(r.energy, 20 - CARDS["patch-panel"].cost);
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [0, 0], "every link card in hand is the next one");
  assert.ok(playLink(r, 0, "r2", "omega").ok);
  assert.equal(r.energy, 20 - CARDS["patch-panel"].cost, "the free link was spent");
  assert.equal(costFor(r, 0), CARDS.fiber.cost);
  // The free link lasts only this turn.
  api.effects(r).freeLinks = 1;
  r.enemies[0].turn = 1;
  endTurn(r);
  r.hand = ["fiber"];
  assert.equal(costFor(r, 0), CARDS.fiber.cost);
  // The next link card uses it even when it already costs 0 (Crosslink).
  const c = table();
  route(c, "r1", 0);
  device(c, "r2", "router", 0, 2.4);
  c.hand = ["patch-panel", "crosslink", "fiber"];
  assert.ok(playLink(c, 0, "alpha", "r2").ok);
  assert.ok(playLink(c, 0, "r2", "omega").ok);
  assert.equal(costFor(c, c.hand.indexOf("fiber")), CARDS.fiber.cost);
  // With Hot Swap: Hot Swap pays for Patch Panel itself, then the next link card is free, then full price.
  const h = table();
  h.relics = ["hot-swap"];
  device(h, "r1", "router", 0, 0);
  device(h, "r2", "router", 0, 2.4);
  h.hand = ["patch-panel+", "fiber", "fiber"];
  h.drawPile = ["pulse"];
  assert.ok(playLink(h, 0, "alpha", "r1").ok);
  assert.equal(h.energy, 20, "Hot Swap paid for it");
  assert.deepEqual(h.hand, ["fiber", "fiber", "pulse"], "Patch Panel+ drew 1");
  assert.ok(playLink(h, 0, "r1", "omega").ok);
  assert.equal(h.energy, 20);
  assert.ok(playLink(h, 0, "alpha", "r2").ok);
  assert.equal(h.energy, 20 - CARDS.fiber.cost);
});

test("Redundant Paths: block per live channel (none without a route); + gives 3 per channel", () => {
  const r = table();
  route(r, "r1", 0);
  route(r, "r2", 2.4);
  r.hand = ["redundant-paths", "redundant-paths+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, 2 * CARDS["redundant-paths"].values.perChannel!);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, 2 * V("redundant-paths").perChannel + 2 * V("redundant-paths+").perChannel);
  const empty = table();
  empty.hand = ["redundant-paths"];
  assert.ok(playInstant(empty, 0).ok);
  assert.equal(empty.block, 0);
});

test("Standby Router: a router linked to its nearest device; Standby Router+ links two and can make a route by itself", () => {
  const r = table();
  r.hand = ["standby-router"];
  assert.ok(playGround(r, 0, -3.5, 0).ok);
  assert.equal(node(r, "router1")!.role, "router");
  assert.deepEqual(r.topology.links, [{ a: "router1", b: "alpha" }]);
  assert.equal(r.energy, 20 - CARDS["standby-router"].cost);
  // Upgraded, in the middle of an empty table: ALPHA and OMEGA are its two nearest devices.
  const u = table();
  u.hand = ["standby-router+"];
  assert.ok(playGround(u, 0, 0, 0).ok);
  assert.ok(linked(u, "router1", "alpha") && linked(u, "router1", "omega"));
  assert.deepEqual(combatPreview(u).signalPath, ["alpha", "router1", "omega"]);
});

test("Equal-Cost Multipath: +2 per live channel (0 without a route); + gives 3", () => {
  const r = table();
  route(r, "r1", 0);
  route(r, "r2", 2.4);
  r.hand = ["ecmp", "ecmp+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 2 * V("ecmp").perChannel);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 2 * V("ecmp").perChannel + 2 * V("ecmp+").perChannel);
  const empty = table();
  empty.hand = ["ecmp"];
  assert.ok(playInstant(empty, 0).ok, "no live-route check any more");
  assert.equal(empty.packetBoost, 0);
});

test("Flood Fill: every hostile per live channel, needs a live route; + gives 2", () => {
  const empty = table();
  empty.hand = ["flood-fill"];
  refused(empty, () => playInstant(empty, 0), "Flood Fill needs a live route.");
  const r = table();
  route(r, "r1", 0);
  route(r, "r2", 2.4);
  r.hand = ["flood-fill", "flood-fill+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.turnEffects!.everyPort, 2 * V("flood-fill").perChannelEveryPort);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.turnEffects!.everyPort, 2 * V("flood-fill").perChannelEveryPort + 2 * V("flood-fill+").perChannelEveryPort);
});

test("Mirror Protocol: needs 2 channels, then damage and block per channel; + gives 3 and 3", () => {
  const r = table();
  route(r, "r1", 0);
  r.hand = ["mirror"];
  refused(r, () => playInstant(r, 0), "Mirror Protocol needs two or more live channels.");
  route(r, "r2", 2.4);
  r.hand = ["mirror", "mirror+"];
  assert.ok(playInstant(r, 0).ok);
  const m = 2 * V("mirror").perChannel, mp = 2 * V("mirror+").perChannel;
  assert.deepEqual([r.packetBoost, r.block], [m, m]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.packetBoost, r.block], [m + mp, m + mp]);
});

test("Mesh Weave: links a device to its two nearest unlinked devices; + three", () => {
  const layout = () => {
    const r = table();
    route(r, "r1", 0);
    device(r, "s1", "switch", 2.5, 2.4);
    device(r, "s2", "switch", -2.5, 2.4);
    device(r, "s3", "switch", 2.5, -2.4);
    return r;
  };
  const r = layout();
  r.hand = ["mesh-weave"];
  assert.ok(playNode(r, 0, "r1").ok);
  assert.ok(linked(r, "r1", "s1") && linked(r, "r1", "s2") && !linked(r, "r1", "s3"));
  const u = layout();
  u.hand = ["mesh-weave+"];
  assert.ok(playNode(u, 0, "r1").ok);
  assert.ok(linked(u, "r1", "s1") && linked(u, "r1", "s2") && linked(u, "r1", "s3"));
});

test("Peering Session: block per channel any action of yours adds; copies stack; + gives 4", () => {
  const r = table();
  device(r, "r1", "router", 2.5, -2.4);
  device(r, "r2", "router", 2.5, 2.4);
  wire(r, "alpha", "r1");
  wire(r, "alpha", "r2");
  r.hand = ["peering-session", "fiber", "mesh-weave"];
  assert.ok(playDaemon(r, 0).ok);
  assert.deepEqual(r.daemons, ["peering-session"]);
  assert.equal(r.energy, 20 - CARDS["peering-session"].cost);
  assert.ok(playLink(r, 0, "r1", "r2").ok);
  assert.equal(r.block, 0, "no channel added: nothing");
  // Mesh Weave on OMEGA cables it to both routers at once: two channels, two gains.
  assert.ok(playNode(r, 0, "omega").ok);
  assert.equal(combatPreview(r).channels, 2);
  assert.equal(r.block, 2 * CARDS["peering-session"].values.block!);
  // Clearing a cut that restores a channel counts too; every copy adds its block.
  const s = table();
  route(s, "r1", 0);
  s.faultLinks = [linkKey("alpha", "r1")];
  s.daemons = ["peering-session", "peering-session", "peering-session+"];
  s.hand = ["patch"];
  assert.ok(playInstant(s, 0).ok);
  assert.equal(s.block, 2 * V("peering-session").block + V("peering-session+").block);
  assert.deepEqual(runningDaemons(s).map(daemon => [daemon.id, daemon.count]), [["peering-session", 2], ["peering-session+", 1]]);
});

test("Spine-Leaf: a switch linked to every router; + costs 0", () => {
  const r = table();
  device(r, "r1", "router", 0, -2.4);
  device(r, "r2", "router", 0, 2.4);
  r.hand = ["spine-leaf", "spine-leaf+"];
  assert.ok(playGround(r, 0, -2.5, 0).ok);
  assert.ok(linked(r, "switch1", "r1") && linked(r, "switch1", "r2"));
  assert.equal(r.energy, 20 - 1);
  assert.ok(playGround(r, 0, 2.5, 0).ok);
  assert.equal(r.energy, 20 - 1, "Spine-Leaf+ is free");
});

test("Fabric Controller: every bandwidth delivery deals more, copies stack, labelled; forecast equals resolution", () => {
  const r = table();
  route(r, "r1", 0);
  route(r, "r2", 2.4);
  route(r, "r3", -2.4);
  r.hand = ["fabric-controller"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("fabric-controller"));
  r.daemons.push("fabric-controller", "fabric-controller+");
  const p = combatPreview(r);
  const fc = V("fabric-controller").perChannel, fcp = V("fabric-controller+").perChannel;
  assert.equal(p.channels, 3);
  assert.equal(term(p, "Fabric Controller ×2 · 2 bandwidth deliveries"), 2 * fc * 2);
  assert.equal(term(p, "Fabric Controller+ · 2 bandwidth deliveries"), fcp * 2);
  assert.equal(p.packetDamage, RULES.baseRouteDamage + 2 * RULES.bandwidthPerChannel + 2 * fc * 2 + fcp * 2);
  assert.ok(p.deliveries.slice(1).every(delivery => delivery.amount === RULES.bandwidthPerChannel + 2 * fc + fcp), "each bandwidth delivery carries it");
  agree(r);
  // One channel: no bandwidth delivery, nothing. Spanning Tree: bandwidth gives nothing, nor does this.
  const one = table();
  route(one, "r1", 0);
  one.daemons = ["fabric-controller"];
  assert.ok(!combatPreview(one).damageTerms.some(item => item.label.startsWith("Fabric Controller")));
  const spanning = table();
  spanning.relics = ["spanning-tree"];
  route(spanning, "r1", 0);
  route(spanning, "r2", 2.4);
  spanning.daemons = ["fabric-controller"];
  assert.ok(!combatPreview(spanning).damageTerms.some(item => item.label.startsWith("Fabric Controller")));
  assert.equal(CARDS["fabric-controller+"].cost, Math.max(0, cost("fabric-controller") - 1));
});

// ------------------------------------------------------------------ Backbone

test("Trunk Line: +1 per device on the primary route when played (terminals excluded); + draws 1", () => {
  const r = table();
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "s1", "r1", "omega");
  r.hand = ["trunk-line", "trunk-line+"];
  r.drawPile = ["pulse"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 2 * V("trunk-line").perDevice);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 2 * V("trunk-line").perDevice + 2 * V("trunk-line+").perDevice);
  assert.deepEqual(r.hand, ["pulse"]);
  const empty = table();
  empty.hand = ["trunk-line"];
  assert.ok(playInstant(empty, 0).ok);
  assert.equal(empty.packetBoost, 0);
});

test("Splice: a switch into the longest primary cable, both halves keep armor and amplification; refusals cost nothing; + costs 0", () => {
  const r = table();
  device(r, "r1", "router", 1, 0);
  r.topology.links.push({ a: "alpha", b: "r1", armored: true, boosted: true }, { a: "r1", b: "omega" });
  const before = combatPreview(r).packetDamage;
  assert.equal(before, RULES.baseRouteDamage + RULES.amplifiedCableDamage);
  r.hand = ["splice"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.energy, 20 - CARDS.splice.cost);
  const spliced = node(r, "switch1")!;
  assert.deepEqual([spliced.role, spliced.x, spliced.z], ["switch", -2.15, 0], "at the middle of ALPHA–R1 (6.3 long)");
  assert.equal(linked(r, "alpha", "r1"), undefined);
  assert.deepEqual(linked(r, "alpha", "switch1"), { a: "alpha", b: "switch1", armored: true, boosted: true });
  assert.deepEqual(linked(r, "switch1", "r1"), { a: "switch1", b: "r1", armored: true, boosted: true });
  const { preview } = agree(r);
  assert.deepEqual(preview.signalPath, ["alpha", "switch1", "r1", "omega"]);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + RULES.switchDamage + 2 * RULES.amplifiedCableDamage);
  // Ties: the cable nearest ALPHA.
  const t = table();
  route(t, "r1", 0);
  t.hand = ["splice+"];
  assert.ok(playInstant(t, 0).ok);
  assert.equal(t.energy, 20, "Splice+ is free");
  assert.ok(linked(t, "alpha", "switch1") && linked(t, "switch1", "r1") && linked(t, "r1", "omega"));
  // No primary route; no free socket.
  const empty = table();
  empty.hand = ["splice"];
  refused(empty, () => playInstant(empty, 0), "Splice needs a live primary route.");
  const full = table();
  route(full, "r1", 0);
  for (let i = 0; full.topology.nodes.length < RULES.maxDevices; i++) device(full, `ph${i}`, "phantom", -6 + i, 4.5, { absorbs: 1 });
  full.hand = ["splice"];
  refused(full, () => playInstant(full, 0), "The table has no free socket for a spliced switch.");
});

test("Traceroute: draw 1 and +1 per switch on the primary route, for 0; + draws 2", () => {
  const r = table();
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  device(r, "s2", "switch", 2.5, 0);
  wire(r, "alpha", "s1", "r1", "s2", "omega");
  r.hand = ["traceroute", "traceroute+"];
  r.drawPile = ["pulse", "guard", "barrier"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.energy, 20 - cost("traceroute"));
  assert.equal(r.packetBoost, 2 * V("traceroute").perSwitch);
  assert.deepEqual(r.hand, ["traceroute+", "pulse"]);
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.packetBoost, 2 * V("traceroute").perSwitch + 2 * V("traceroute+").perSwitch);
  assert.deepEqual(r.hand, ["pulse", "guard", "barrier"]);
});

test("Deep Buffers: switches on the primary route deal more, scored into the route choice, copies stack; forecast equals resolution", () => {
  // A: ALPHA → R1 (overclocked) → OMEGA deals 7 with one device; B: three devices with two switches, 7 too.
  const layout = () => {
    const r = table();
    route(r, "r1", 0);
    node(r, "r1")!.upgraded = true;
    device(r, "s1", "switch", -2.5, 2.2);
    device(r, "r2", "router", 0, 2.2);
    device(r, "s2", "switch", 2.5, 2.2);
    wire(r, "alpha", "s1", "r2", "s2", "omega");
    return r;
  };
  const plain = layout();
  assert.deepEqual(combatPreview(plain).signalPath, ["alpha", "r1", "omega"], "a tie: fewer devices");
  const r = layout();
  r.hand = ["deep-buffers"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("deep-buffers"));
  const p = combatPreview(r);
  const db = V("deep-buffers").perSwitch, dbp = V("deep-buffers+").perSwitch;
  assert.deepEqual(p.signalPath, ["alpha", "s1", "r2", "s2", "omega"], "the switches now make B the primary route");
  assert.equal(term(p, "Deep Buffers · switches ×2"), 2 * db);
  agree(r);
  const stacked = layout();
  stacked.daemons = ["deep-buffers", "deep-buffers", "deep-buffers+"];
  const s = combatPreview(stacked);
  assert.equal(term(s, "Deep Buffers ×2 · switches ×2"), 2 * 2 * db);
  assert.equal(term(s, "Deep Buffers+ · switches ×2"), 2 * dbp);
  agree(stacked);
  assert.equal(CARDS["deep-buffers+"].cost, 0);
});

test("Line Rate: overclocks every router and compresses every switch on the primary route, exhausts; refusals; + costs 1", () => {
  const r = table();
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  wire(r, "alpha", "s1", "r1", "omega");
  device(r, "r2", "router", 0, 2.4);
  device(r, "s2", "switch", 2.5, 2.4);
  r.hand = ["line-rate", "line-rate+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.energy, 20 - cost("line-rate"));
  assert.deepEqual([node(r, "r1")!.upgraded, node(r, "s1")!.amplified], [true, true]);
  assert.deepEqual([node(r, "r2")!.upgraded, node(r, "s2")!.amplified], [undefined, undefined], "off the primary route: untouched");
  assert.deepEqual(r.exhaustPile, ["line-rate"]);
  refused(r, () => playInstant(r, 0), "Every router and switch on your primary route is already upgraded.");
  const { preview } = agree(r);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + RULES.switchDamage + RULES.compressionDamage + RULES.overclockDamage);
  const empty = table();
  empty.hand = ["line-rate+"];
  refused(empty, () => playInstant(empty, 0), "Line Rate needs a live primary route.");
  assert.equal(CARDS["line-rate+"].cost, Math.max(0, cost("line-rate") - 1));
});

test("Carrier Grade: +1 per device on the primary route, scored into the route choice, copies stack; forecast equals resolution", () => {
  const layout = () => {
    const r = table();
    route(r, "r1", 0);
    node(r, "r1")!.upgraded = true;
    device(r, "s1", "switch", -2.5, 2.2);
    device(r, "r2", "router", 0, 2.2);
    device(r, "s2", "switch", 2.5, 2.2);
    wire(r, "alpha", "s1", "r2", "s2", "omega");
    return r;
  };
  const r = layout();
  r.hand = ["carrier-grade"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("carrier-grade"));
  const p = combatPreview(r);
  const cg = V("carrier-grade").perDevice, cgp = V("carrier-grade+").perDevice;
  assert.deepEqual(p.signalPath, ["alpha", "s1", "r2", "s2", "omega"], "three devices now outscore one overclocked router");
  assert.equal(term(p, "Carrier Grade · devices ×3"), 3 * cg);
  agree(r);
  const stacked = layout();
  stacked.daemons = ["carrier-grade", "carrier-grade", "carrier-grade+"];
  const s = combatPreview(stacked);
  assert.equal(term(s, "Carrier Grade ×2 · devices ×3"), 2 * 3 * cg);
  assert.equal(term(s, "Carrier Grade+ · devices ×3"), 3 * cgp);
  agree(stacked);
  const none = table();
  none.daemons = ["carrier-grade"];
  assert.equal(combatPreview(none).packetDamage, 0, "no route, no term");
});

// ------------------------------------------------------------------ Deployment

test("Rack and Stack: a switch, and the next hardware card this turn costs 1 less (never a link); + costs 0", () => {
  const r = table();
  r.hand = ["rack-and-stack", "router", "fiber", "router"];
  assert.ok(playGround(r, 0, -2.5, 0).ok);
  assert.equal(node(r, "switch1")!.role, "switch");
  assert.equal(r.energy, 20 - 1);
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [0, CARDS.fiber.cost, 0]);
  assert.ok(playGround(r, 0, 0, 0).ok);
  assert.equal(r.energy, 20 - 1, "the router was free");
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [CARDS.fiber.cost, CARDS.router.cost], "spent by one hardware card");
  // Chained: the second Rack and Stack uses the first one's discount and leaves its own.
  const c = table();
  c.hand = ["rack-and-stack", "rack-and-stack", "router"];
  assert.ok(playGround(c, 0, -2.5, 0).ok);
  assert.ok(playGround(c, 0, 0, 0).ok);
  assert.equal(c.energy, 20 - 1);
  assert.equal(costFor(c, 0), CARDS.router.cost - 1);
  const u = table();
  u.hand = ["rack-and-stack+", "switch", "router"];
  assert.ok(playGround(u, 0, 0, 0).ok);
  assert.equal(u.energy, 20);
  // The detail's warning: the next hardware card uses the discount even when it already costs 0.
  assert.ok(playGround(u, 0, -2.5, 0).ok);
  assert.equal(costFor(u, 0), CARDS.router.cost);
});

test("Blueprint: draws 2, the hardware drawn costs 1 less this turn; + draws 3", () => {
  const r = table();
  r.hand = ["blueprint"];
  r.drawPile = ["router", "fiber", "hardened-router", "guard"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["router", "fiber"]);
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [CARDS.router.cost - CARDS.blueprint.values.discount!, CARDS.fiber.cost],
    "the printed discount is the engine's");
  const u = table();
  u.hand = ["blueprint+"];
  u.drawPile = ["router", "fiber", "hardened-router", "guard"];
  assert.ok(playInstant(u, 0).ok);
  assert.deepEqual(u.hand, ["router", "fiber", "hardened-router"]);
  assert.deepEqual(u.hand.map((_, i) => costFor(u, i)), [0, 1, 0]);
  u.enemies[0].turn = 1;
  endTurn(u);
  u.hand = ["router"];
  assert.equal(costFor(u, 0), CARDS.router.cost, "this turn only");
});

test("Rapid Redeploy: the last discarded hardware card returns 1 cheaper, exhausts; + draws 1", () => {
  const r = table();
  r.hand = ["rapid-redeploy+"];
  r.discardPile = ["switch", "router", "fiber"];
  r.drawPile = ["pulse"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["router", "pulse"]);
  assert.equal(costFor(r, 0), CARDS.router.cost - 1);
  assert.deepEqual(r.exhaustPile, ["rapid-redeploy+"]);
  const empty = table();
  empty.hand = ["rapid-redeploy"];
  refused(empty, () => playInstant(empty, 0), "No hardware card is in your discard pile.");
});

test("Provisioning Script: block whenever you deploy a device (auto-deploys too), copies stack; + gives 3", () => {
  const r = table();
  r.hand = ["provisioning-script", "switch", "rebuild", "fiber"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.block, 0, "starting it deploys nothing");
  const ps = V("provisioning-script").block;
  assert.ok(playGround(r, 0, 0, 2.4).ok);
  assert.equal(r.block, ps);
  assert.ok(playInstant(r, 0).ok, "Emergency Rebuild deploys a router");
  assert.equal(r.block, 2 * ps);
  assert.ok(playLink(r, 0, "switch1", "router2").ok);
  assert.equal(r.block, 2 * ps, "a cable is not a device");
  const s = table();
  s.daemons = ["provisioning-script", "provisioning-script+"];
  s.hand = ["router"];
  assert.ok(playGround(s, 0, 0, 0).ok);
  assert.equal(s.block, V("provisioning-script").block + V("provisioning-script+").block);
});

test("Zero-Touch Provisioning: draw whenever you deploy a device, copies stack; + costs 0", () => {
  const r = table();
  r.hand = ["zero-touch", "switch", "standby-router"];
  r.drawPile = ["pulse", "guard", "barrier", "fiber"];
  assert.ok(playDaemon(r, 0).ok);
  assert.deepEqual(r.hand, ["switch", "standby-router"]);
  assert.ok(playGround(r, 0, 0, 2.4).ok);
  assert.deepEqual(r.hand, ["standby-router", "pulse"]);
  r.daemons.push("zero-touch+");
  assert.ok(playGround(r, 0, 0, -2.4).ok);
  assert.deepEqual(r.hand, ["pulse", "guard", "barrier"], "two copies: two cards");
  assert.equal(CARDS["zero-touch+"].cost, 0);
});

test("Datacenter: every cluster deals more, copies stack, labelled; forecast equals resolution", () => {
  const r = table();
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  device(r, "s2", "switch", 2.5, 0);
  wire(r, "alpha", "s1", "r1", "s2", "omega");
  r.hand = ["datacenter"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.energy, 20 - cost("datacenter"));
  const p = combatPreview(r);
  const dc = V("datacenter").perCluster, dcp = V("datacenter+").perCluster;
  assert.equal(term(p, "CENTER · Cluster"), RULES.clusterDamage);
  assert.equal(term(p, "Datacenter · clusters ×1"), dc);
  agree(r);
  // Two clusters, three copies.
  const two = table();
  device(two, "s1", "switch", -2.5, 0);
  device(two, "r1", "router", 0, 0);
  device(two, "s2", "switch", 2.5, 0);
  wire(two, "alpha", "s1", "r1", "s2", "omega");
  device(two, "r2", "router", -2.5, -2.6);
  device(two, "s3", "switch", 0, -2.6);
  device(two, "r3", "router", 2.5, -2.6);
  wire(two, "alpha", "r2", "s3", "r3", "omega");
  two.daemons = ["datacenter", "datacenter", "datacenter+"];
  const q = combatPreview(two);
  assert.deepEqual(q.clusters, ["north", "center"]);
  assert.equal(term(q, "Datacenter ×2 · clusters ×2"), 2 * dc * 2);
  assert.equal(term(q, "Datacenter+ · clusters ×2"), dcp * 2);
  agree(two);
  const none = table();
  route(none, "r1", 0);
  none.daemons = ["datacenter"];
  assert.ok(!combatPreview(none).damageTerms.some(item => item.label.startsWith("Datacenter")), "no cluster, nothing");
  assert.equal(CARDS["datacenter+"].cost, Math.max(0, cost("datacenter") - 1));
});

// ------------------------------------------------------------------ the three build paths, played together

test("Mesh path: Peering Session and Fabric Controller pay off Standby Router, Branch Line, ECMP and Redundant Paths", () => {
  const r = table();
  route(r, "r1", 0);
  r.hand = ["peering-session", "fabric-controller", "standby-router+", "branch-line", "ecmp", "redundant-paths"];
  r.drawPile = ["pulse", ...r.drawPile];
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  // A standby router behind R1: cabled to R1 and ALPHA, still one channel (they share R1).
  assert.ok(playGround(r, 0, 0, -2.4).ok);
  assert.ok(linked(r, "router1", "r1") && linked(r, "router1", "alpha"));
  assert.equal(combatPreview(r).channels, 1);
  assert.equal(r.block, 0);
  // Branch Line to OMEGA: a second channel. It draws, and the session pays its block.
  assert.ok(playLink(r, 0, "router1", "omega").ok);
  assert.equal(combatPreview(r).channels, 2);
  assert.ok(r.hand.includes("pulse"), "Branch Line drew");
  assert.equal(r.block, CARDS["peering-session"].values.block);
  assert.ok(playInstant(r, r.hand.indexOf("ecmp")).ok);
  assert.ok(playInstant(r, r.hand.indexOf("redundant-paths")).ok);
  assert.equal(r.block, V("peering-session").block + 2 * V("redundant-paths").perChannel);
  assert.equal(r.energy, 20 - (["peering-session", "fabric-controller", "standby-router+", "branch-line", "ecmp", "redundant-paths"] as CardId[]).reduce((sum, id) => sum + cost(id), 0));
  const { preview } = agree(r);
  assert.equal(term(preview, "Fabric Controller · 1 bandwidth delivery"), V("fabric-controller").perChannel);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + RULES.bandwidthPerChannel + V("fabric-controller").perChannel + 2 * V("ecmp").perChannel, "5 + bandwidth + Fabric + ECMP per channel");
  assert.equal(preview.incoming, 0, "the strike of 3 meets the block");
});

test("Backbone path: Splice, Line Rate, Trunk Line and Traceroute under Deep Buffers and Carrier Grade", () => {
  const r = table();
  device(r, "r1", "router", 1, 0);
  wire(r, "alpha", "r1", "omega");
  r.hand = ["deep-buffers", "carrier-grade", "splice", "line-rate", "trunk-line", "traceroute"];
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playDaemon(r, 0).ok);
  assert.ok(playInstant(r, 0).ok, "Splice: a switch into ALPHA–R1");
  assert.ok(playInstant(r, 0).ok, "Line Rate: R1 overclocked, the new switch compressed");
  assert.deepEqual([node(r, "r1")!.upgraded, node(r, "switch1")!.amplified], [true, true]);
  assert.ok(playInstant(r, 0).ok, "Trunk Line: two devices");
  assert.ok(playInstant(r, 0).ok, "Traceroute: one switch");
  const boost = 2 * V("trunk-line").perDevice + V("traceroute").perSwitch;
  assert.equal(r.packetBoost, boost);
  assert.equal(r.energy, 20 - (["deep-buffers", "carrier-grade", "splice", "line-rate", "trunk-line", "traceroute"] as CardId[]).reduce((sum, id) => sum + cost(id), 0));
  const { preview } = agree(r);
  assert.deepEqual(preview.signalPath, ["alpha", "switch1", "r1", "omega"]);
  assert.equal(term(preview, "Deep Buffers · switches ×1"), V("deep-buffers").perSwitch);
  assert.equal(term(preview, "Carrier Grade · devices ×2"), 2 * V("carrier-grade").perDevice);
  assert.equal(preview.packetDamage,
    RULES.baseRouteDamage + RULES.switchDamage + RULES.compressionDamage + RULES.overclockDamage + V("deep-buffers").perSwitch + 2 * V("carrier-grade").perDevice + boost,
    "5 + switch + compression + overclock + Deep Buffers + Carrier Grade + burst");
});

test("Deployment path: Provisioning Script, Zero-Touch and Datacenter pay off Rack and Stack and Blueprint", () => {
  const r = table();
  r.hand = ["provisioning-script", "zero-touch", "datacenter", "rack-and-stack", "router", "switch", "blueprint"];
  r.drawPile = ["fiber", "fiber", "fiber", "fiber", "hardened-router", "guard", "guard"];
  for (let i = 0; i < 3; i++) assert.ok(playDaemon(r, 0).ok);
  const daemons = cost("provisioning-script") + cost("zero-touch") + cost("datacenter");
  assert.equal(r.energy, 20 - daemons);
  // Three devices in the centre band: each gives 2 block and draws 1; Rack and Stack makes the router free.
  assert.ok(playGround(r, 0, -2.5, 0).ok);
  assert.equal(costFor(r, 0), 0, "the router after Rack and Stack");
  assert.ok(playGround(r, 0, 0, 0).ok);
  assert.ok(playGround(r, 0, 2.5, 0).ok);
  assert.equal(r.block, 3 * V("provisioning-script").block);
  assert.deepEqual(r.hand, ["blueprint", "fiber", "fiber", "fiber"], "Zero-Touch drew one per device");
  // Blueprint: a fiber and the Hardened Router, which now costs 0.
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["fiber", "fiber", "fiber", "fiber", "hardened-router"]);
  assert.equal(costFor(r, 4), CARDS["hardened-router"].cost - 1);
  const cables: [string, string][] = [["alpha", "switch1"], ["switch1", "router2"], ["router2", "switch3"], ["switch3", "omega"]];
  for (const [a, b] of cables) assert.ok(playLink(r, 0, a, b).ok);
  assert.ok(playGround(r, 0, 0, 2.6).ok, "the Hardened Router, free");
  assert.equal(r.block, 4 * V("provisioning-script").block + CARDS["hardened-router"].values.block!, "four deploys, and the Hardened Router's own block");
  assert.deepEqual(r.hand, ["guard"], "and one more draw");
  assert.equal(r.energy, 20 - (daemons + 1 + 0 + 0 + 1 + 4 + 0));
  const { preview } = agree(r);
  assert.deepEqual(preview.signalPath, ["alpha", "switch1", "router2", "switch3", "omega"]);
  assert.deepEqual(preview.clusters, ["center"]);
  assert.equal(term(preview, "Datacenter · clusters ×1"), V("datacenter").perCluster);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 2 * RULES.switchDamage + RULES.clusterDamage + V("datacenter").perCluster, "5 + switches + cluster + Datacenter");
  assert.equal(preview.incoming, 0, "the strike of 3 meets 11 block");
});
