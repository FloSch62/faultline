/** v5 · Three Energy colorless cards (contract section 7): the table is complete, every face is short
 * and speaks one vocabulary, and the five new cards (Ping, Hotfix, Keepalive, Rollback, Firmware
 * Update) do what their faces say through the public play functions. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, REWARD_POOL, RULES, missingCards } from "./cards.ts";
import type { CardRarity, CardTarget } from "./card-types.ts";
import { newExpedition } from "./expedition.ts";
import { COLORLESS_CARD_IDS, type Archetype, type CardId, type ColorlessCardId, type NetworkNode, type RunState } from "./types.ts";
import {
  addTokens, api, beginBattle, canTargetNode, chooseRoom, combatPreview, costFor, endTurn, playDaemon, playInstant, playLink, playNode,
  playProtocol,
} from "./run.ts";
import { rollbackTarget } from "./effects/colorless.ts";

// ------------------------------------------------------------------ helpers (engine-v5.test.ts pattern)

/** A clean first-fight table: terminals, one hostile at a chosen intent, energy to spare. */
function table(enemy = "wraith", turn = 0, archetype: Archetype = "architect"): RunState {
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
function route(run: RunState, id: string, z: number, x = 0) {
  device(run, id, "router", x, z);
  wire(run, "alpha", id, "omega");
}
/** The forecast is pure and is exactly what the enemy phase resolves. */
function agree(run: RunState) {
  const snapshot = structuredClone(run);
  const preview = combatPreview(run);
  assert.deepEqual(run, snapshot, "combatPreview mutates nothing");
  const integrity = run.integrity;
  const result = endTurn(run);
  assert.deepEqual(result.forecast, preview, "the forecast equals the resolution");
  assert.equal(run.integrity, Math.max(0, integrity - preview.incoming));
  return { preview, result };
}
const node = (run: RunState, id: string) => run.topology.nodes.find(item => item.id === id)!;

// ------------------------------------------------------------------ the table

/** Contract section 7: rarity, cost, target and the upgraded cost of every colorless card. The
 * balance phase updates this table with any cost it tunes. */
/** Costs the balance pass tuned (docs/balance-v5.json): read from the data. */
const tuned = (id: string) => CARDS[id as CardId].cost;
const SPEC: Record<ColorlessCardId, [CardRarity, number, CardTarget, number]> = {
  "resonance-field": ["common", 1, "zone", 0], "aegis-field": ["uncommon", 1, "zone", 0], "null-field": ["uncommon", 1, "zone", 0],
  "purge-field": ["common", 0, "zone", 0],
  router: ["basic", 1, "ground", 1], switch: ["basic", 0, "ground", 0], firewall: ["common", 1, "ground", 1], honeypot: ["common", 1, "ground", 0],
  "cache-server": ["uncommon", 2, "ground", 1], "poe-injector": ["rare", tuned("poe-injector"), "ground", tuned("poe-injector+")], "load-balancer": ["uncommon", 2, "ground", 1],
  relay: ["common", 1, "ground", 0], "hardened-router": ["uncommon", 1, "ground", 1], "linux-bridge": ["common", 1, "ground", 0],
  "server-rack": ["uncommon", 1, "ground", 0],
  fiber: ["basic", 1, "link", 1], crosslink: ["uncommon", 0, "link", 0], duplex: ["common", 1, "link", 1], "armored-fiber": ["common", 1, "link", 0],
  conduit: ["common", 1, "link", 0], vxlan: ["uncommon", 1, "link", 0],
  shield: ["uncommon", 1, "node", 0], firmware: ["rare", 1, "node", 0], compression: ["uncommon", 1, "node", 0], "startup-config": ["common", 0, "node", 0],
  clabernetes: ["legendary", 2, "node", 1], "redundant-psu": ["common", 1, "node", 0],
  patch: ["basic", 1, "instant", 1], surge: ["rare", 0, "instant", 0], containerlab: ["rare", tuned("containerlab"), "instant", tuned("containerlab+")], guard: ["basic", 1, "instant", 1],
  pulse: ["basic", 1, "instant", 1], diagnostic: ["common", 1, "instant", 1], reroute: ["uncommon", 0, "instant", 0], barrier: ["uncommon", 2, "instant", 2],
  capacitor: ["common", 0, "instant", 0], salvage: ["common", 0, "instant", 0], rebuild: ["uncommon", tuned("rebuild"), "instant", tuned("rebuild+")], "zero-day": ["rare", 2, "instant", 2],
  emergency: ["rare", 2, "instant", 2], protocol: ["common", 1, "instant", 1], inspect: ["common", 0, "instant", 0], wireshark: ["uncommon", 1, "instant", 1],
  "broadcast-storm": ["uncommon", 1, "instant", 1], "traffic-shaping": ["common", 0, "instant", 0], "packet-storm": ["rare", 2, "instant", 2],
  quorum: ["common", 1, "instant", 1], "demolition-charge": ["common", 1, "instant", 1], "field-repair": ["common", 0, "instant", 0],
  "failover-policy": ["common", 1, "protocol", 1], "port-security": ["uncommon", 1, "protocol", 1], "rate-limiter": ["common", 1, "protocol", 1],
  "ips-signature": ["uncommon", 1, "protocol", 1], "quarantine-rule": ["uncommon", 1, "protocol", 0], tarpit: ["rare", 1, "protocol", 1],
  ping: ["common", 0, "instant", 0], hotfix: ["common", 0, "node", 0], keepalive: ["uncommon", 1, "daemon", 1], rollback: ["uncommon", 1, "instant", 0],
  "firmware-update": ["rare", 1, "instant", 0],
};

test("the colorless table is complete and matches the contract's rarity, cost, target and upgrade cost", () => {
  assert.deepEqual(missingCards("colorless"), []);
  assert.deepEqual(Object.keys(SPEC).sort(), [...COLORLESS_CARD_IDS].sort());
  for (const id of COLORLESS_CARD_IDS) {
    const card = CARDS[id], plus = CARDS[`${id}+` as CardId];
    assert.ok(plus, `${id} has a + version`);
    assert.deepEqual([card.rarity, card.cost, card.target, plus.cost], SPEC[id], id);
    assert.equal(card.archetype, undefined, `${id} is colorless`);
    assert.ok(card.rules !== plus.rules || card.cost !== plus.cost, `${id}+ improves the card`);
    // Basics are never offered; every other colorless card is.
    assert.equal(REWARD_POOL.includes(id), card.rarity !== "basic", `${id} reward pool`);
  }
});

test("colorless faces are short and speak one vocabulary; the exceptions are in the detail", () => {
  for (const id of COLORLESS_CARD_IDS) for (const card of [CARDS[id], CARDS[`${id}+` as CardId]]) {
    assert.ok(card.rules.length <= 130, `${card.id}: ${card.rules.length} characters`);
    assert.ok(/[.)]$/.test(card.rules), `${card.id} ends a sentence`);
    assert.ok(!/protected from|cable cards|\bburst\b|\{|undefined|NaN/i.test(card.rules), `${card.id}: ${card.rules}`);
    if (card.exhaust) assert.match(card.rules, /Exhaust\.$/, `${card.id} names Exhaust last`);
    if (card.target === "daemon") assert.match(card.rules, /^Daemon\. /, card.id);
    if (card.target === "protocol") assert.match(card.rules, /^Armed\. /, card.id);
    if (card.target === "link") assert.match(card.rules, /^Link two devices/, card.id);
    if (card.target === "ground" && card.role) assert.match(card.rules, /^Deploy /, card.id);
    // Every generic number is printed on the face.
    for (const key of ["block", "burst", "draw", "energy", "nextEnergy", "heal"] as const)
      if (card.values[key]) assert.ok(card.rules.includes(String(card.values[key])), `${card.id} prints its ${key}`);
  }
  // One wording for "while on your primary route" (switch, relay, amplified cables).
  for (const id of ["switch", "relay", "conduit", "vxlan", "firmware", "compression", "startup-config"] as const)
    assert.match(CARDS[id].rules, new RegExp(`\\+\\d damage while on your primary route`), id);
  assert.equal(CARDS.relay.rules, `Deploy a jam-proof switch: +${RULES.switchDamage} damage while on your primary route. Draw 1.`);
  assert.equal(CARDS.vxlan.rules, `Link two devices with a cut-proof cable: +${RULES.amplifiedCableDamage} damage while on your primary route.`);
  assert.equal(CARDS.salvage.rules, "Return your 2 most recent link cards from discard to hand. Exhaust.");
  // The long parts moved to the detail.
  for (const id of ["honeypot", "server-rack", "purge-field", "armored-fiber", "rollback", "firmware-update", "hotfix"] as const)
    assert.ok(CARDS[id].detail && CARDS[id].detail!.length > 30, `${id} has a detail`);
  assert.ok(CARDS["server-rack"].detail!.includes(String(RULES.rackCondition)));
});

test("the new colorless faces and upgrades read exactly as the contract", () => {
  const faces: [CardId, string, number][] = [
    ["ping", "+1 damage this turn. Draw 1.", 0],
    ["ping+", "+2 damage this turn. Draw 1.", 0],
    ["hotfix", "Repair a device by 1. Draw 1.", 0],
    ["hotfix+", "Repair a device by 2. Draw 1.", 0],
    ["keepalive", "Daemon. At the start of your turn, gain 2 block.", 1],
    ["keepalive+", "Daemon. At the start of your turn, gain 3 block.", 1],
    ["rollback", "Return the last non-Exhaust card you played this turn to your hand. Exhaust.", 1],
    ["rollback+", "Return the last non-Exhaust card you played this turn to your hand. Exhaust.", 0],
    ["firmware-update", "Upgrade every card in your hand for this battle. Exhaust.", 1],
    ["firmware-update+", "Upgrade every card in your hand for this battle. Exhaust.", 0],
  ];
  for (const [id, face, cost] of faces) assert.deepEqual([CARDS[id].rules, CARDS[id].cost], [face, cost], id);
  assert.deepEqual(["ping", "hotfix", "keepalive", "rollback", "firmware-update"].filter(id => CARDS[id as CardId].exhaust), ["rollback", "firmware-update"]);
});

// ------------------------------------------------------------------ the new cards in play

test("Ping: +1 damage this turn and a draw, for 0 energy; Ping+ adds 2", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  const base = combatPreview(r).packetDamage;
  r.hand = ["ping", "ping+"];
  r.drawPile = ["pulse", "barrier"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.energy, r.packetBoost, r.hand], [20, 1, ["ping+", "pulse"]]);
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual([r.energy, r.packetBoost, r.hand], [20, 3, ["pulse", "barrier"]]);
  assert.deepEqual(r.discardPile, ["ping", "ping+"], "Ping is not an Exhaust card");
  const { preview } = agree(r);
  assert.equal(preview.packetDamage, base + 3);
});

test("Hotfix: targets only a worn device, repairs it by 1 (Hotfix+ by 2, never above its maximum) and draws", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "s1", "switch", 2.5, 0, { condition: 1, maxCondition: 3 });
  device(r, "s2", "switch", -2.5, 0, { condition: 3, maxCondition: 3 });
  r.hand = ["hotfix", "hotfix+"];
  r.drawPile = ["pulse", "barrier"];
  assert.equal(canTargetNode(r, 0, "s1"), true);
  assert.equal(canTargetNode(r, 0, "s2"), false, "an intact device is not a target");
  assert.equal(canTargetNode(r, 0, "alpha"), false, "terminals never wear");
  const before = structuredClone(r);
  assert.equal(playNode(r, 0, "s2").ok, false);
  assert.deepEqual(r, before, "a refused play spends nothing");
  const played = playNode(r, 0, "s1");
  assert.deepEqual(played, { ok: true, message: "Hotfix applied · +1 condition." });
  assert.deepEqual([node(r, "s1").condition, r.energy, r.hand], [2, 20, ["hotfix+", "pulse"]]);
  assert.ok(playNode(r, 0, "s1").ok);
  assert.equal(node(r, "s1").condition, 3, "Hotfix+ repairs by 2, capped at the maximum");
  assert.deepEqual(r.hand, ["pulse", "barrier"]);
  // A jammed worn device can be repaired; the jam stays.
  const j = table();
  route(j, "r1", 0);
  node(j, "r1").condition = 1;
  j.faultNodes = ["r1"];
  j.hand = ["hotfix"];
  assert.ok(playNode(j, 0, "r1").ok);
  assert.deepEqual([node(j, "r1").condition, j.faultNodes], [2, ["r1"]]);
});

test("Keepalive: the block arrives at the start of your next turn and meets that enemy phase (forecast = resolution)", () => {
  const r = table("wraith", 1); // a strike
  route(r, "r1", 0);
  r.hand = ["keepalive+"];
  assert.ok(playDaemon(r, 0).ok);
  assert.equal(r.block, 0, "nothing on the turn it starts");
  assert.equal(combatPreview(r).nextTurn.block, 0, "the daemon's turn-start block is not in the next-turn forecast");
  endTurn(r);
  const block = CARDS["keepalive+"].values.block!;
  assert.equal(r.block, block);
  r.enemies[0].turn = 1; // the strike again
  const { preview } = agree(r);
  assert.ok(preview.shieldTerms.some(term => term.label === "Block this turn" && term.amount === block));
  assert.equal(preview.incoming, Math.max(0, preview.incomingRaw - block));
  assert.equal(r.block, block, "renewed at the start of the next turn");
});

test("Rollback: returns the most recent non-Exhaust card played this turn from the discard pile; nothing to return, no play", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  r.hand = ["fiber", "zero-day", "keepalive", "rate-limiter", "rollback", "guard"];
  const before = structuredClone(r);
  assert.deepEqual(playInstant(r, 4), { ok: false, message: "Nothing to roll back: no card you played this turn is in your discard pile." });
  assert.deepEqual(r, before, "a refused play spends nothing");
  assert.ok(playLink(r, 0, "alpha", "r2").ok); // fiber → discard
  assert.ok(playInstant(r, 0).ok); // Zero Day → exhausted
  assert.ok(playDaemon(r, 0).ok); // Keepalive → running
  assert.ok(playProtocol(r, 0).ok); // Rate Limiter → armed
  assert.equal(rollbackTarget(r), "fiber", "Exhaust cards, daemons and armed protocols are passed over");
  const energy = r.energy;
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Rollback activated · Optic Fiber returns to your hand." });
  assert.equal(r.energy, energy - CARDS.rollback.cost);
  assert.deepEqual(r.hand, ["guard", "fiber"]);
  assert.ok(!r.discardPile.includes("fiber") && r.exhaustPile.includes("rollback"));
  assert.equal(costFor(r, 1), CARDS.fiber.cost, "it costs its energy again");
  assert.ok(playLink(r, 1, "r2", "omega").ok);
  // The most recent one: Packet Guard after the fiber.
  r.hand = ["guard", "rollback+"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(costFor(r, 0), 0, "Rollback+ costs 0");
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["guard"]);
  // A card reshuffled into the draw pile is gone from the discard: the one before it returns.
  const s = table();
  s.hand = ["pulse", "diagnostic", "rollback"];
  s.drawPile = [];
  assert.ok(playInstant(s, 0).ok);
  assert.ok(playInstant(s, 0).ok, "Deep Scan reshuffles the discard, Packet Burst and itself, and draws them");
  assert.equal(s.discardPile.length, 0);
  assert.equal(playInstant(s, s.hand.indexOf("rollback")).ok, false);
  // The next turn starts a new list.
  const t = table("wraith", 1);
  route(t, "r1", 0);
  t.hand = ["guard"];
  playInstant(t, 0);
  endTurn(t);
  assert.equal(rollbackTarget(t), null);
});

test("Firmware Update: every card in hand becomes its + version for this battle; the deck keeps the originals", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  const deck = [...r.deck];
  r.hand = ["firmware-update", "guard", "fiber+", "cve", "pulse", "guard", "keepalive"];
  api.effects(r).discounted = ["guard"];
  addTokens(r, "diagnostic", 1); // an encounter-only card
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["guard+", "fiber+", "cve", "pulse+", "guard+", "keepalive+", "diagnostic+"]);
  assert.deepEqual(r.deck, deck, "the deck is untouched");
  assert.ok(r.exhaustPile.includes("firmware-update"));
  assert.deepEqual(r.turnEffects!.discounted, ["guard+"], "a discount stays on its card");
  assert.deepEqual(r.encounterCards, ["diagnostic+"], "an encounter-only card stays encounter-only");
  assert.equal(costFor(r, 0), CARDS["guard+"].cost - 1);
  const block = r.block;
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.block, block + CARDS["guard+"].values.block!, "the upgraded numbers apply");
  assert.ok(playInstant(r, r.hand.indexOf("diagnostic+")).ok);
  assert.ok(r.exhaustPile.includes("diagnostic+") && !r.discardPile.includes("diagnostic+"));
  // Upgraded cards cycle for the rest of the battle; the next battle deals the deck again.
  endTurn(r);
  assert.ok(r.discardPile.includes("pulse+"));
  // Nothing to upgrade: refused, nothing spent. The card itself does not count.
  const n = table();
  n.hand = ["firmware-update", "cve", "guard+", "firmware-update+"];
  const before = structuredClone(n);
  assert.deepEqual(playInstant(n, 0), { ok: false, message: "No card in your hand can be upgraded." });
  assert.deepEqual(n, before);
  n.hand = ["firmware-update", "firmware-update"];
  assert.ok(playInstant(n, 0).ok, "another copy can be upgraded");
  assert.deepEqual(n.hand, ["firmware-update+"]);
  assert.equal(costFor(n, 0), 0, "Firmware Update+ costs 0");
});

test("a fresh battle deals the deck again: Firmware Update's upgrades end with the battle", () => {
  const e = newExpedition("architect", 31).run;
  chooseRoom(e, "0-1");
  e.energy = 10;
  e.hand.push("firmware-update");
  assert.ok(playInstant(e, e.hand.length - 1).ok);
  assert.ok(e.hand.some(id => id.endsWith("+")));
  assert.ok(e.deck.every(id => !id.endsWith("+")), "the starter deck has no upgraded cards");
  beginBattle(e, e.map.find(room => room.id === "0-1")!);
  assert.ok([...e.hand, ...e.drawPile].every(id => !id.endsWith("+")));
});

test("Salvage Cycle refuses in its own words: link cards", () => {
  const r = table();
  r.hand = ["salvage"];
  r.discardPile = ["guard"];
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "No link cards are in your discard pile." });
  r.discardPile = ["fiber", "guard", "crosslink"];
  assert.ok(playInstant(r, 0).ok);
  assert.deepEqual(r.hand, ["crosslink", "fiber"], "the most recent first");
});
