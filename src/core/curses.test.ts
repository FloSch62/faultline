/** v5 · Three Energy curses (contract section 8): Zombie Process, Kernel Panic, Backdoor, Bitrot,
 * Memory Leak and CVE. Faces, the hand hooks through the public play functions, the forecast equal
 * to the resolution for the end-of-turn curses, removal at the deck floor, and Overvolt's Backdoor. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, REWARD_POOL, RULES, missingCards, offeredTo } from "./cards.ts";
import { newExpedition, starterDeck } from "./expedition.ts";
import { CURSE_CARD_IDS, type Archetype, type CardId, type NetworkNode, type RunState } from "./types.ts";
import {
  beginBattle, chooseRelic, chooseRoom, combatPreview, endTurn, grantVictory, openShop, playGround, playInstant, playJunk, playLink,
  prepareCard, removeDeckCard, removalBlocker, shopRemoveCard, useConsole,
} from "./run.ts";
import { chooseOffer, messageOffer, messageOptionText, purgeCurse } from "./encounter.ts";
import { PURGE_ORDER } from "./cards/curses.ts";
import { EVENTS } from "./events.ts";
import { bitrotTarget } from "./effects/curses.ts";
import { HAND_HOOKS } from "./effects/index.ts";

// ------------------------------------------------------------------ helpers (engine-v5.test.ts pattern)

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
  assert.equal(result.integrityDamage, preview.incoming);
  assert.equal(run.integrity, Math.max(0, integrity - preview.incoming));
  return { preview, result };
}
const node = (run: RunState, id: string) => run.topology.nodes.find(item => item.id === id)!;
const CURSES = ["cve", "zombie-process", "kernel-panic", "backdoor", "bitrot", "memory-leak"] as const;

// ------------------------------------------------------------------ definitions

test("the curse table is complete: unplayable, special, never offered, with the contract's faces", () => {
  assert.deepEqual(missingCards("curses"), []);
  assert.deepEqual(CURSE_CARD_IDS.filter(id => CARDS[id].curse), [...CURSES]);
  const faces: Record<(typeof CURSES)[number], string> = {
    cve: "Unplayable.",
    "zombie-process": "Unplayable. Innate.",
    "kernel-panic": "Unplayable. While it is in your hand, you can play at most 3 cards.",
    backdoor: "Unplayable. End of turn in hand: lose 1 integrity.",
    bitrot: "Unplayable. End of turn in hand: the first router on your primary route loses 1 condition.",
    "memory-leak": "Unplayable. When you draw it, lose 1 energy.",
  };
  for (const id of CURSES) {
    const card = CARDS[id];
    assert.equal(card.rules, faces[id], id);
    assert.deepEqual([card.rarity, card.target, card.curse, card.unplayable, card.junk], ["special", "junk", true, true, undefined], id);
    assert.ok(!CARDS[`${id}+` as CardId], `${id} has no upgrade`);
    assert.ok(!REWARD_POOL.includes(id) && !offeredTo(id, "architect"), `${id} is never offered`);
    assert.match(card.detail ?? "", /Remove it at a Sanctuary or Market, whatever the size of your deck\.$/, `${id} says how to be rid of it`);
  }
  assert.equal(CARDS.cve.detail, "A permanent vulnerability. Remove it at a Sanctuary or Market, whatever the size of your deck.");
  assert.equal(CARDS["zombie-process"].innate, true);
  // Their numbers come from values: tuning one changes the face.
  for (const id of ["kernel-panic", "backdoor", "bitrot", "memory-leak"] as const)
    assert.ok(CARDS[id].rules.includes(String(CARDS[id].values.amount)), id);
  assert.ok(HAND_HOOKS["kernel-panic"]?.playLimit && HAND_HOOKS["memory-leak"]?.onDraw && HAND_HOOKS.backdoor?.endOfTurn && HAND_HOOKS.bitrot?.endOfTurn);
});

test("a curse cannot be played", () => {
  const r = table();
  r.hand = [...CURSES];
  for (let i = 0; i < CURSES.length; i++) {
    const refused = playJunk(r, i);
    assert.equal(refused.ok, false, CURSES[i]);
    assert.match(refused.message, /cannot be played/);
  }
  assert.equal(r.hand.length, CURSES.length);
  assert.equal(r.energy, 20);
});

// ------------------------------------------------------------------ Zombie Process

test("Zombie Process is Innate: it opens every battle in hand and takes one of the opening draws", () => {
  for (const seed of [3, 17, 29]) {
    const e = newExpedition("warden", seed).run;
    e.deck = [...starterDeck("warden"), "zombie-process"];
    chooseRoom(e, "0-1");
    assert.equal(e.hand[0], "zombie-process", `seed ${seed}: drawn first`);
    assert.equal(e.hand.length, RULES.handDraw, "it counts toward the opening draws");
    assert.ok(e.hand.some(id => CARDS[id].role === "router") && e.hand.filter(id => CARDS[id].target === "link").length >= 2, "the guaranteed router and links still come");
    // Every battle: the next one deals it into the opening hand again.
    beginBattle(e, e.map.find(room => room.id === "0-1")!);
    assert.equal(e.hand[0], "zombie-process");
  }
});

// ------------------------------------------------------------------ Kernel Panic

test("Kernel Panic: while it is in hand, the 4th card play of the turn is refused with its reason; the console is not a card", () => {
  const r = table("wraith", 1);
  device(r, "r1", "router", 0, 0);
  device(r, "r2", "router", 0, 2.4);
  r.hand = ["kernel-panic", "fiber", "fiber", "switch", "guard", "guard"];
  assert.ok(playLink(r, 1, "alpha", "r1").ok);
  assert.ok(playLink(r, 1, "r1", "omega").ok);
  assert.ok(playGround(r, 1, 2.5, -2.4).ok);
  const before = structuredClone(r);
  const refused = playInstant(r, 1);
  assert.deepEqual(refused, { ok: false, message: "Kernel Panic is in your hand: at most 3 cards this turn." });
  assert.deepEqual(r, before, "a refused play spends nothing");
  assert.ok(useConsole(r, "alpha", "r2").ok, "Patch Cable is not a card play");
  // Cards played before it arrived count too.
  const d = table();
  d.hand = ["guard", "guard", "diagnostic", "guard"];
  d.drawPile = ["kernel-panic", "pulse", "pulse"];
  assert.ok(playInstant(d, 0).ok);
  assert.ok(playInstant(d, 0).ok);
  assert.ok(playInstant(d, 0).ok, "Deep Scan is the third card and draws Kernel Panic");
  assert.equal(playInstant(d, 0).ok, false);
  // Out of your hand, no limit: the next turn discards it and plays freely.
  const n = table("wraith", 1);
  route(n, "r1", 0);
  n.hand = ["kernel-panic"];
  endTurn(n);
  assert.ok(n.discardPile.includes("kernel-panic") && !n.hand.includes("kernel-panic"));
  n.energy = 20;
  for (let i = 0; i < 4; i++) assert.ok(playInstant(n, 0).ok, `play ${i + 1}`);
  // Two copies: the limit does not stack below 3.
  const two = table();
  two.hand = ["kernel-panic", "kernel-panic", "guard", "guard", "guard", "guard"];
  for (let i = 0; i < 3; i++) assert.ok(playInstant(two, 2).ok);
  assert.equal(playInstant(two, 2).ok, false);
});

// ------------------------------------------------------------------ Backdoor

test("Backdoor: at the end of the turn in hand, lose 1 integrity, unblockable, a forecast term that equals the resolution", () => {
  const r = table("wraith", 1); // a strike
  route(r, "r1", 0);
  r.block = 50;
  r.hand = ["backdoor", "guard", "backdoor"];
  const { preview } = agree(r);
  assert.equal(preview.incoming, 2, "the strike is blocked; the two Backdoors are not");
  assert.ok(preview.incomingTerms.some(term => term.label === "Backdoor ×2 · in hand" && term.amount === 2));
  assert.deepEqual(preview.handEffects, [{ id: "backdoor", name: "Backdoor", count: 2, integrity: 2, wear: [] }]);
  assert.equal(r.integrity, 98);
  assert.ok(r.discardPile.filter(id => id === "backdoor").length === 2, "then it is discarded like any card");
  // Shield from protocols and fields does not stop it either; with no attack at all it still lands.
  const q = table("wraith", 2); // a jam: no strike
  route(q, "r1", 0);
  q.block = 10;
  q.hand = ["backdoor"];
  assert.equal(agree(q).preview.incoming, 1);
  // Not in hand (discarded, drawn later): nothing.
  const s = table("wraith", 2);
  route(s, "r1", 0);
  s.discardPile = ["backdoor"];
  assert.equal(agree(s).preview.incoming, 0);
  // A transmission that ends the battle spares you.
  const l = table("wraith", 1);
  route(l, "r1", 0);
  l.enemies[0].hp = 1;
  l.hand = ["backdoor"];
  const lethal = combatPreview(l);
  assert.equal(lethal.incoming, 0);
  assert.deepEqual(lethal.handEffects, []);
  const integrity = l.integrity;
  assert.equal(endTurn(l).defeated, true);
  assert.equal(l.integrity, integrity);
});

// ------------------------------------------------------------------ Bitrot

test("Bitrot: the first router on the primary route loses 1 condition in the table-front step; forecast equals resolution", () => {
  const r = table("wraith", 1);
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0, { condition: 3, maxCondition: 3 });
  device(r, "r2", "router", 2.5, 0, { condition: 3, maxCondition: 3 });
  wire(r, "alpha", "s1", "r1", "r2", "omega");
  r.hand = ["bitrot"];
  const network = { primary: { path: combatPreview(r).signalPath } };
  assert.deepEqual(network.primary.path, ["alpha", "s1", "r1", "r2", "omega"]);
  assert.equal(bitrotTarget(r, network as never), "r1", "the router nearest ALPHA");
  const { preview } = agree(r);
  assert.deepEqual(preview.wear, [{ nodeId: "r1", from: 3, to: 2, breaks: false, source: "Bitrot" }]);
  assert.deepEqual(preview.handEffects, [{ id: "bitrot", name: "Bitrot", count: 1, integrity: 0, wear: ["r1"] }]);
  assert.deepEqual([node(r, "r1").condition, node(r, "r2").condition], [2, 3]);
  // Two copies wear it twice; at 0 it breaks.
  const b = table("wraith", 1);
  route(b, "r1", 0);
  node(b, "r1").condition = 2;
  b.hand = ["bitrot", "bitrot"];
  const broken = agree(b).preview;
  assert.deepEqual(broken.wear.map(item => [item.nodeId, item.from, item.to, item.breaks]), [["r1", 2, 0, true]]);
  assert.ok(broken.breakdowns.some(item => item.nodeId === "r1"));
  assert.ok(!b.topology.nodes.some(item => item.id === "r1"), "the router broke");
  // No primary route: nothing happens.
  const n = table("wraith", 1);
  device(n, "r1", "router", 0, 0, { condition: 3, maxCondition: 3 });
  wire(n, "alpha", "r1");
  n.hand = ["bitrot"];
  const idle = agree(n).preview;
  assert.deepEqual(idle.wear, []);
  assert.deepEqual(idle.handEffects, [{ id: "bitrot", name: "Bitrot", count: 1, integrity: 0, wear: [] }]);
  assert.equal(node(n, "r1").condition, 3);
  // A Server Rack's ring takes the wear instead.
  const k = table("wraith", 1);
  route(k, "r1", 0);
  node(k, "r1").condition = 3;
  device(k, "rack1", "rack", 1.6, 0, { condition: RULES.rackCondition, maxCondition: RULES.rackCondition });
  k.hand = ["bitrot"];
  const sheltered = agree(k).preview;
  assert.deepEqual(sheltered.wear, [{ nodeId: "rack1", from: RULES.rackCondition, to: RULES.rackCondition - 1, breaks: false, source: "Bitrot", sheltered: "r1" }]);
  assert.equal(node(k, "r1").condition, 3);
});

// ------------------------------------------------------------------ Memory Leak

test("Memory Leak: drawing it loses 1 energy, never below 0; in the opening hand it drains the first turn", () => {
  const r = table();
  r.energy = 3;
  r.hand = ["diagnostic"];
  r.drawPile = ["memory-leak", "guard", "memory-leak"];
  assert.ok(playInstant(r, 0).ok);
  assert.equal(r.energy, 3 - CARDS.diagnostic.cost - 2);
  assert.ok(r.log.some(line => line === "Memory Leak drains 1 energy."));
  const z = table();
  z.energy = 0;
  z.hand = ["ping"];
  z.drawPile = ["memory-leak"];
  assert.ok(playInstant(z, 0).ok);
  assert.equal(z.energy, 0, "never below 0");
  // In the opening hand: the first turn starts 1 short.
  let found = false;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const e = newExpedition("ghost", seed).run;
    e.deck = [...starterDeck("ghost"), "memory-leak", "memory-leak", "memory-leak"];
    chooseRoom(e, "0-1");
    const leaks = e.hand.filter(id => id === "memory-leak").length;
    assert.equal(e.energy, Math.max(0, RULES.baseEnergy - leaks), `seed ${seed}`);
    found = leaks > 0;
  }
  assert.ok(found, "some opening hand held a Memory Leak");
  // At the start of a turn: the new turn's energy pays for it.
  const t = table("wraith", 1);
  route(t, "r1", 0);
  t.drawPile = ["memory-leak", ...Array<CardId>(10).fill("guard")];
  const next = combatPreview(t).nextTurn.energy;
  endTurn(t);
  assert.ok(t.hand.includes("memory-leak"));
  assert.equal(t.energy, next - 1);
});

// ------------------------------------------------------------------ removal

test("curses can always be removed at a Sanctuary or Market, even at the deck floor", () => {
  const floor: CardId[] = ["router", "fiber", "fiber", "guard", "guard", "pulse", "pulse", "patch"];
  assert.equal(floor.length, RULES.deckFloor);
  for (const curse of CURSES) {
    const f = newExpedition("warden", 3).run;
    f.deck = [...floor, curse];
    f.phase = "forge";
    assert.equal(removalBlocker(f, f.deck.indexOf("pulse")) === null, true, "nine cards: one may go");
    f.deck = [...floor.slice(0, -1), curse];
    assert.match(removalBlocker(f, f.deck.indexOf("pulse")) ?? "", /Keep at least/, "eight is the floor");
    assert.equal(removalBlocker(f, f.deck.indexOf(curse)), null);
    assert.ok(removeDeckCard(f, f.deck.indexOf(curse)).ok, `${curse} leaves at a Sanctuary`);
    assert.ok(!f.deck.includes(curse));
    const m = newExpedition("ghost", 4).run;
    m.deck = [...floor.slice(0, -1), curse];
    m.credits = 500;
    openShop(m);
    assert.ok(shopRemoveCard(m, m.deck.indexOf(curse)).ok, `${curse} leaves at a Market`);
    assert.equal(m.deck.length, RULES.deckFloor - 1);
  }
});

// ------------------------------------------------------------------ Overvolt

test("Overvolt: a Backdoor when you take it and after every elite you defeat, none after other fights", () => {
  const o = newExpedition("ghost", 5).run;
  o.phase = "relic";
  o.relicRewards = ["overvolt"];
  const deck = o.deck.length;
  assert.ok(chooseRelic(o, "overvolt").ok);
  assert.deepEqual([o.deck.length, o.deck.filter(id => id === "backdoor").length], [deck + 1, 1]);
  assert.ok(o.log.includes("Backdoor joins your deck."));
  const elite = o.map.find(room => room.type === "elite")!;
  o.currentRoom = elite.id;
  grantVictory(o);
  assert.equal(o.deck.filter(id => id === "backdoor").length, 2, "after an elite");
  const battle = o.map.find(room => room.type === "battle")!;
  o.currentRoom = battle.id;
  grantVictory(o);
  assert.equal(o.deck.filter(id => id === "backdoor").length, 2, "a normal fight adds none");
  // Without Overvolt, elites add nothing.
  const p = newExpedition("ghost", 6).run;
  p.currentRoom = p.map.find(room => room.type === "elite")!.id;
  grantVictory(p);
  assert.ok(!p.deck.includes("backdoor"));
});

// ------------------------------------------------------------------ the Prepare slot

test("curses cannot be prepared: Backdoor, Bitrot and Kernel Panic cannot dodge the hand", () => {
  for (const curse of CURSES) {
    const r = table("wraith", 1);
    route(r, "r1", 0);
    r.hand = ["guard", curse];
    const before = structuredClone(r);
    assert.deepEqual(prepareCard(r, 1), { ok: false, message: "Curses cannot be prepared." }, curse);
    assert.deepEqual(r, before, "nothing moves");
  }
  const r = table("wraith", 1);
  r.hand = ["packet-loss", "guard"];
  assert.equal(prepareCard(r, 0).message, "Junk cannot be prepared.");
  assert.ok(prepareCard(r, 1).ok, "other cards still can");
  // So a Backdoor in hand still costs its integrity.
  const b = table("wraith", 2);
  route(b, "r1", 0);
  b.hand = ["backdoor"];
  prepareCard(b, 0);
  assert.equal(agree(b).preview.incoming, 1);
});

// ------------------------------------------------------------------ the message Purge

test("an undelivered message's Purge removes any curse, CVE first then a fixed order, and names it", () => {
  assert.deepEqual([...PURGE_ORDER].sort(), [...CURSES].sort(), "every curse, once");
  assert.equal(PURGE_ORDER[0], "cve");
  assert.equal(purgeCurse(["guard", "memory-leak", "backdoor", "cve"]), "cve");
  assert.equal(purgeCurse(["memory-leak", "guard", "backdoor"]), "backdoor", "the order, not the deck position");
  assert.equal(purgeCurse(["guard", "fiber"]), null);
  // The offer names the curse; the answer removes exactly that one from the deck and this battle's piles.
  const r = table();
  r.deck = [...starterDeck("ghost"), "memory-leak", "bitrot"];
  r.hand = ["guard", "packet-loss", "bitrot"];
  let offer = messageOffer(r, "laden", "s0");
  for (let salt = 1; !(offer.kind === "message" && offer.options.some(option => option.id === "purge")); salt++) offer = messageOffer(r, "laden", `s${salt}`);
  assert.equal(offer.kind, "message");
  const options = offer.kind === "message" ? offer.options : [];
  const index = options.findIndex(option => option.id === "purge");
  assert.equal(options[index].card, "bitrot");
  assert.equal(messageOptionText(options[index]), "Every junk card leaves your piles for this encounter, and Bitrot leaves your deck permanently.");
  r.offers = [offer];
  const result = chooseOffer(r, index);
  assert.deepEqual(result, { ok: true, message: "The message purges 1 junk card and a Bitrot from your deck." });
  assert.deepEqual([r.deck.includes("bitrot"), r.deck.includes("memory-leak"), r.hand], [false, true, ["guard"]]);
  // No curse carried: the option says so, and removes only junk.
  const clean = table();
  clean.deck = starterDeck("warden");
  assert.equal(messageOptionText({ id: "purge" }), "Every junk card leaves your piles for this encounter.");
  clean.offers = [{ kind: "message", sender: "Relay Seven", text: "Landed safe.", options: [{ id: "purge" }] }];
  assert.equal(chooseOffer(clean, 0).message, "The message purges 0 junk cards.");
  assert.equal(clean.deck.length, starterDeck("warden").length);
  // Kernel Panic now has a source (The Echo Chamber); every curse can be gained and purged.
  assert.ok(EVENTS["echo-chamber"].choices.some(choice => /Kernel Panic/.test(typeof choice.label === "string" ? choice.label : "")));
});
