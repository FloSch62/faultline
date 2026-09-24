/** v5 · Three Energy engine: economy, keywords, daemons and their hooks, the protocol table as
 * data, misses and dodges, curses in hand, relics, rewards, starters and the effect API.
 *
 * Test-only cards and hooks are registered at runtime under "engine-test-*" ids (each test file
 * runs in its own process, so nothing leaks into other suites); Keepalive and Branch Line are the
 * real worked examples. The pattern to copy for a new card: build a table, put the card in hand,
 * play it through the public play function, check its numbers, and for anything that acts in the
 * enemy phase `agree(run)`: the forecast is pure and equals the resolution. */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RELICS, RULES, STARTER_DECK, missingCards } from "./cards.ts";
import type { CardDefinition } from "./card-types.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition, starterDeck } from "./expedition.ts";
import {
  CARD_IDS_BY_OWNER, type Archetype, type BaseCardId, type CardId, type CardOwner, type HostileRole, type NetworkNode, type Port, type RunState,
} from "./types.ts";
import {
  addTokens, api, cardRewards, chooseCardReward, chooseForge, chooseRelic, chooseRoom, combatPreview, costFor, endTurn, grantVictory,
  hardenBlock, hardenOnce, leaveForge, openShop, playDaemon, playGround, playInstant, playJunk, playLink, playProtocol, protocolLimit,
  removeDeckCard, runningDaemons, strikeTarget, turnEnergyBase, useConsole,
} from "./run.ts";
import { DAEMON_HOOKS, HAND_HOOKS, CARD_EFFECTS } from "./effects/index.ts";
import { MARKET_SLOTS, pickCard, rollSlot, slotRarity } from "./rewards.ts";
import { socketNear } from "./combat/board.ts";

// ------------------------------------------------------------------ helpers

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
/** A test-only card definition (never offered: rarity special). */
function testCard(id: string, definition: Partial<CardDefinition>): CardId {
  const cardId = id as CardId;
  (CARDS as Record<string, CardDefinition>)[id] = {
    id: cardId, base: cardId as BaseCardId, upgraded: false, name: id, subtitle: "TEST / CARD", rules: "Test card.", cost: 0,
    rarity: "special", target: "instant", art: "program", color: "#ffffff", values: {}, ...definition,
  };
  return cardId;
}
const as = (id: CardId) => id as BaseCardId;
/** A deterministic random source for pure reward helpers. */
const sequence = (...rolls: number[]) => { let i = 0; return () => rolls[i++ % rolls.length]; };

// ------------------------------------------------------------------ economy

test("economy: 3 energy a turn, energy relics raise the base to at most 5, temporary energy comes on top uncapped; 5 cards", () => {
  assert.deepEqual([RULES.baseEnergy, RULES.relicEnergyCap, RULES.handDraw, RULES.handLimit, RULES.deckFloor], [3, 5, 5, 10, 8]);
  const r = table();
  assert.equal(turnEnergyBase(r), 3);
  r.relics = ["anycast"];
  assert.equal(turnEnergyBase(r), 4);
  r.relics = ["anycast", "jumbo-frames", "storm-control"];
  assert.equal(turnEnergyBase(r), 5, "three energy relics hit the cap");
  r.relics = ["anycast", "jumbo-frames", "storm-control", "air-gap", "legacy-mainframe", "overvolt"];
  assert.equal(turnEnergyBase(r), RULES.relicEnergyCap);
  assert.ok(["air-gap", "legacy-mainframe", "overvolt"].every(id => RELICS[id as keyof typeof RELICS].tier === "boss"));
  // An online PoE Injector and next-turn energy come on top of the capped base.
  r.enemies[0].turn = 1; // a strike: no disruption
  route(r, "r1", 0);
  device(r, "poe", "power", -2.5, 2.4);
  wire(r, "alpha", "poe", "r1");
  r.reserveEnergy = 1;
  const { preview } = agree(r);
  assert.equal(preview.nextTurn.energy, RULES.relicEnergyCap + 1 + 1);
  assert.equal(r.energy, RULES.relicEnergyCap + 2);
  // The opening hand holds five cards: the guaranteed router and two links among them.
  const w = newExpedition("warden", 11).run;
  chooseRoom(w, "0-1");
  assert.equal(w.energy, RULES.baseEnergy);
  assert.equal(w.hand.length, RULES.handDraw);
});

test("Hot Swap: the first link card each turn costs 0 (any link card; Patch Cable does not spend it)", () => {
  const r = table();
  r.relics = ["hot-swap"];
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  device(r, "r3", "router", 0, -2.4);
  r.hand = ["duplex", "fiber", "branch-line"];
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [0, 0, 0]);
  assert.ok(useConsole(r, "alpha", "r3").ok, "Patch Cable is not a card");
  assert.equal(costFor(r, 0), 0);
  assert.ok(playLink(r, 0, "alpha", "r2").ok);
  assert.equal(r.energy, 20 - 1, "only the console cost energy");
  assert.deepEqual(r.hand.map((_, i) => costFor(r, i)), [CARDS.fiber.cost, CARDS["branch-line"].cost]);
  r.enemies[0].turn = 1;
  endTurn(r);
  r.hand = ["fiber"];
  assert.equal(costFor(r, 0), 0, "a new turn, a new free link");
});

test("turn effects: free links, the hardware discount, free cards, Man-in-the-Middle and cards played this turn", () => {
  const r = table();
  r.relics = ["hot-swap"];
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  api.effects(r).freeLinks = 1;
  r.hand = ["fiber", "fiber", "fiber"];
  assert.ok(playLink(r, 0, "alpha", "r2").ok, "Hot Swap pays the first");
  assert.equal(r.turnEffects!.freeLinks, 1, "Hot Swap spent, the free link kept");
  assert.ok(playLink(r, 0, "r2", "omega").ok);
  assert.equal(r.turnEffects!.freeLinks, 0);
  assert.equal(costFor(r, 0), CARDS.fiber.cost);
  assert.equal(r.energy, 20);
  api.effects(r).hardwareDiscount = 1;
  r.hand = ["hardened-router", "hardened-router"];
  assert.equal(costFor(r, 0), CARDS["hardened-router"].cost - 1);
  assert.ok(playGround(r, 0, 2.5, -2.4).ok);
  assert.equal(costFor(r, 0), CARDS["hardened-router"].cost, "the discount is spent by one hardware card");
  api.effects(r).freeCards = ["barrier"];
  r.hand = ["barrier"];
  assert.equal(costFor(r, 0), 0);
  // Man-in-the-Middle: every card played after it adds to the buffer; cards played count per turn.
  const played = r.cardsPlayed;
  api.effects(r).mitm = 2;
  const buffer = r.buffer;
  r.hand = ["guard", "pulse"];
  playInstant(r, 0);
  playInstant(r, 0);
  assert.equal(r.buffer, buffer + 4);
  assert.equal(r.cardsPlayed, played + 2);
  assert.deepEqual(r.turnEffects!.cardsPlayed!.slice(-2), ["guard", "pulse"], "the cards played this turn, in order");
  r.enemies[0].turn = 1;
  endTurn(r);
  assert.equal(r.cardsPlayed, 0);
  assert.deepEqual(r.turnEffects, {});
});

// ------------------------------------------------------------------ keywords

test("Retain stays in hand, Volatile exhausts (Packet Loss), everything else is discarded", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  const exhausted: CardId[] = [];
  const LISTENER = testCard("engine-test-listener", { name: "Listener", target: "daemon" });
  DAEMON_HOOKS[as(LISTENER)] = { cardExhausted: ({ exhausted: id }) => { exhausted.push(id); } };
  r.daemons = [LISTENER];
  r.hand = ["reflect", "guard", "packet-loss"];
  assert.ok(CARDS.reflect.retain && CARDS["replay-attack"].retain && CARDS["packet-loss"].volatile);
  endTurn(r);
  assert.equal(r.hand[0], "reflect", "Retain keeps it first in the new hand");
  assert.equal(r.hand.length, 1 + RULES.handDraw, "retained cards do not replace draws");
  assert.ok(r.discardPile.includes("guard") && !r.discardPile.includes("reflect"));
  assert.ok(r.exhaustPile.includes("packet-loss"));
  assert.deepEqual(exhausted, ["packet-loss"], "cardExhausted hears Volatile");
});

test("Innate cards open the encounter in hand, before the guaranteed router and links, beyond the draw count, within the hand limit", () => {
  const INNATE = testCard("engine-test-innate", { name: "Innate", innate: true, target: "junk", unplayable: true, curse: true });
  const e = newExpedition("architect", 21).run;
  e.deck = [...starterDeck("architect"), INNATE, INNATE, INNATE];
  chooseRoom(e, "0-1");
  assert.equal(e.hand.filter(id => id === INNATE).length, 3);
  assert.ok(e.hand.some(id => CARDS[id].role === "router"));
  assert.ok(e.hand.filter(id => CARDS[id].target === "link").length >= 2);
  assert.equal(e.hand.length, 6, "three innate and three guaranteed: one beyond the draw count");
  const full = newExpedition("architect", 22).run;
  full.deck = [...starterDeck("architect"), ...Array<CardId>(12).fill(INNATE)];
  chooseRoom(full, "0-1");
  assert.equal(full.hand.length, RULES.handLimit);
  assert.ok(full.hand.every(id => id === INNATE), "innate first, and the limit holds");
});

test("Payload tokens: encounter-only cards into the hand (the overflow to discard), exhausted when played", () => {
  const r = table();
  r.hand = Array<CardId>(8).fill("fiber");
  assert.equal(addTokens(r, "pulse", 3), 2);
  assert.equal(r.hand.length, RULES.handLimit);
  assert.equal(r.discardPile.filter(id => id === "pulse").length, 1);
  assert.equal(r.encounterCards.filter(id => id === "pulse").length, 3);
  r.hand = ["pulse"];
  assert.ok(playInstant(r, 0).ok);
  assert.ok(r.exhaustPile.includes("pulse") && !r.discardPile.slice(1).includes("pulse"));
  // The resolver prints Payloads played this turn and the payloadBonus daemons as labelled terms.
  route(r, "r1", 0);
  api.effects(r).payloads = 2;
  api.effects(r).payloadDamage = 2 * RULES.payloadDamage;
  const KIT = testCard("engine-test-kit", { name: "Kit", target: "daemon" });
  DAEMON_HOOKS[as(KIT)] = { payloadBonus: ({ count }) => count };
  r.daemons = [KIT];
  const terms = combatPreview(r).damageTerms;
  assert.ok(terms.some(term => term.label === "Payload ×2" && term.amount === 2 * RULES.payloadDamage));
  assert.ok(terms.some(term => term.label === "Kit · Payloads ×2" && term.amount === 2));
});

test("next-turn gains: block and draw arrive with the next turn and are forecast", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.relics = ["grounded-core"];
  r.nextTurn = { block: 3, draw: 2 };
  const { preview } = agree(r);
  assert.deepEqual(preview.nextTurn, { energy: RULES.baseEnergy, draw: RULES.handDraw + 2, block: 1 + 3 });
  assert.equal(r.block, 4);
  assert.equal(r.hand.length, RULES.handDraw + 2);
  assert.equal(r.nextTurn, undefined);
});

// ------------------------------------------------------------------ daemons: the worked example

test("Keepalive (worked example): a daemon runs for the encounter, never goes to discard, and copies stack", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["keepalive", "keepalive", "keepalive+", "guard"];
  assert.equal(playInstant(r, 0).ok, false, "a daemon is not an instant");
  for (let i = 0; i < 3; i++) assert.ok(playDaemon(r, 0).ok);
  assert.equal(playDaemon(r, 0).ok, false, "a guard is not a daemon");
  assert.deepEqual(r.daemons, ["keepalive", "keepalive", "keepalive+"]);
  assert.equal(r.energy, 20 - 3 * CARDS.keepalive.cost);
  assert.ok(!r.discardPile.includes("keepalive") && !r.exhaustPile.includes("keepalive"));
  assert.deepEqual(runningDaemons(r).map(daemon => [daemon.id, daemon.count]), [["keepalive", 2], ["keepalive+", 1]]);
  endTurn(r);
  const perTurn = 2 * CARDS.keepalive.values.block! + CARDS["keepalive+"].values.block!;
  assert.equal(r.block, perTurn, "At the start of your turn: every copy adds its block");
  r.enemies[0].turn = 1;
  endTurn(r);
  assert.equal(r.block, perTurn, "block expires; the daemon renews it");
  // Victory clears the daemons; so does the next encounter.
  r.enemies[0].hp = 1;
  endTurn(r);
  assert.deepEqual(r.daemons, []);
  assert.ok(CARD_EFFECTS && DAEMON_HOOKS.keepalive?.turnStart);
});

test("a daemon hears later card plays, never its own", () => {
  const r = table();
  const heard: [CardId, number][] = [];
  const EAR = testCard("engine-test-ear", { name: "Ear", target: "daemon" });
  DAEMON_HOOKS[as(EAR)] = { cardPlayed: ({ played, count }) => { heard.push([played, count]); } };
  r.hand = [EAR, EAR, "guard"];
  playDaemon(r, 0);
  playDaemon(r, 0);
  playInstant(r, 0);
  // One call per running id with its copy count: the first copy hears the second; both hear the guard.
  assert.deepEqual(heard, [[EAR, 1], ["guard", 2]]);
});

test("deviceDeployed, linkPlaced, channelsGained and onDraw daemons hear the player's actions", () => {
  const r = table();
  const events: string[] = [];
  const EYE = testCard("engine-test-eye", { name: "Eye", target: "daemon" });
  DAEMON_HOOKS[as(EYE)] = {
    deviceDeployed: ({ node }) => { events.push(`deploy ${node.role}`); },
    linkPlaced: ({ link }) => { events.push(`link ${link.a}-${link.b}`); },
    channelsGained: ({ gained }) => { events.push(`channels +${gained}`); },
    onDraw: ({ drawn }) => { events.push(`draw ${drawn}`); },
  };
  r.daemons = [EYE];
  r.hand = ["router", "fiber", "fiber", "rebuild", "diagnostic"];
  r.drawPile = ["pulse", "guard", "barrier"];
  assert.ok(playGround(r, 0, 0, 0).ok);
  assert.ok(playLink(r, 0, "alpha", "router1").ok);
  assert.ok(playLink(r, 0, "router1", "omega").ok);
  assert.ok(playInstant(r, 0).ok, "Emergency Rebuild: a second router and channel");
  assert.ok(playInstant(r, 0).ok, "Deep Scan draws");
  assert.deepEqual(events, [
    "deploy router", "link alpha-router1", "link router1-omega", "channels +1",
    "deploy router", "link alpha-router2", "link router2-omega", "channels +1",
    "draw pulse", "draw guard", "draw barrier",
  ]);
});

// ------------------------------------------------------------------ the card-effect registry

test("Branch Line (registry example): draws only when its cable adds a channel; a refused play costs nothing", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  wire(r, "alpha", "r2");
  r.hand = ["branch-line", "branch-line+"];
  r.drawPile = ["pulse", "guard", "barrier"];
  assert.ok(playLink(r, 0, "r2", "omega").ok);
  assert.deepEqual(r.hand, ["branch-line+", "pulse"], "a new channel: it drew one");
  assert.ok(playLink(r, 0, "r1", "r2").ok);
  assert.deepEqual(r.hand, ["pulse"], "no new channel: no draw");
  // validate refuses before anything is spent; `manual` keeps a value from the generic step.
  const PICKY = testCard("engine-test-picky", { name: "Picky", values: { block: 5 } });
  CARD_EFFECTS[as(PICKY)] = {
    validate: run => run.buffer ? null : "Needs a buffer.",
    manual: ["block"],
    play: (run, { values }) => { run.buffer += values.block!; return " · stored"; },
  };
  r.hand = [PICKY];
  const before = structuredClone(r);
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "Needs a buffer." });
  assert.deepEqual(r, before);
  r.buffer = 1;
  const block = r.block;
  assert.deepEqual(playInstant(r, 0), { ok: true, message: "Picky activated · stored." });
  assert.deepEqual([r.buffer, r.block], [6, block], "the effect took `block` itself");
});

// ------------------------------------------------------------------ resolver hooks

test("resolver daemons appear in the forecast as labelled terms, and the forecast equals the resolution", () => {
  const r = table("wraith", 1); // a strike
  const DAEMON = testCard("engine-test-daemon", { name: "Test Daemon", target: "daemon" });
  DAEMON_HOOKS[as(DAEMON)] = {
    switchBonus: ({ count }) => count,
    bandwidthBonus: ({ count }) => 2 * count,
    clusterBonus: ({ count }) => 3 * count,
    routeTerms: ({ route, count }) => [{ label: "Test Daemon · devices", amount: route.length * count }],
    shieldTerms: ({ count }) => [{ label: "Test Daemon · shield", amount: 4 * count }],
    firewallBonus: ({ count }) => count,
    hardenBonus: ({ count }) => 5 * count,
    protocolSlots: ({ count }) => count,
  };
  r.daemons = [DAEMON, DAEMON];
  // Primary ALPHA → s1 → r1 → OMEGA (centre); second channel ALPHA → r2 → f1 → OMEGA; s1, r1, r2 cluster.
  device(r, "s1", "switch", -2.5, 0);
  device(r, "r1", "router", 0, 0);
  device(r, "r2", "router", 2.5, 0);
  device(r, "f1", "firewall", 2.5, 2.6);
  wire(r, "alpha", "s1", "r1", "omega");
  wire(r, "alpha", "r2", "f1", "omega");
  const p = combatPreview(r);
  assert.deepEqual(p.signalPath, ["alpha", "s1", "r1", "omega"]);
  assert.equal(p.channels, 2);
  const term = (label: string) => p.damageTerms.find(item => item.label === label)?.amount;
  assert.equal(term("Test Daemon ×2 · switches ×1"), 2);
  assert.equal(term("Test Daemon · devices"), 4);
  assert.equal(term("Test Daemon ×2 · 1 bandwidth delivery"), 4);
  assert.equal(term("Test Daemon ×2 · clusters ×1"), 6);
  assert.equal(p.packetDamage, p.damageTerms.reduce((sum, item) => sum + item.amount, 0));
  assert.ok(p.shieldTerms.some(item => item.label === "Test Daemon · shield" && item.amount === 8));
  assert.ok(p.shieldTerms.some(item => item.label === "Test Daemon ×2 · firewalls ×1" && item.amount === 2));
  assert.equal(hardenBlock(r), RULES.hardenShield + RULES.hardenPerFirewall + 10);
  assert.equal(protocolLimit(r), RULES.maxProtocols + 2);
  agree(r);
});

test("buffer multiplier, backpressure ratio and block carry: the highest daemon value wins, labelled", () => {
  const g = table("wraith", 1, "ghost");
  route(g, "r1", 0);
  const DEEP = testCard("engine-test-deep", { name: "Deep", target: "daemon" });
  DAEMON_HOOKS[as(DEEP)] = { bufferMultiplier: () => 3 };
  g.daemons = [DEEP];
  g.buffering = true;
  const stored = combatPreview(g);
  assert.equal(stored.bufferGain, RULES.baseRouteDamage * 3);
  assert.ok(stored.damageTerms.some(item => item.label.includes("(×3 · Deep)")));
  agree(g);
  const w = table("wraith", 1, "warden");
  w.relics = ["backpressure"];
  route(w, "r1", 0);
  const FLOW = testCard("engine-test-flow", { name: "Flow", target: "daemon" });
  const CARRY = testCard("engine-test-carry", { name: "Carry", target: "daemon" });
  DAEMON_HOOKS[as(FLOW)] = { backpressureRatio: () => 1 };
  DAEMON_HOOKS[as(CARRY)] = { blockCarry: () => true };
  w.daemons = [FLOW, CARRY];
  w.block = 10;
  const { preview } = agree(w);
  const strike = preview.incomingRaw;
  assert.equal(preview.backpressureGain, strike, "all of it, not half");
  assert.deepEqual(preview.blockCarried, { amount: 10 - strike, by: "Carry" });
  assert.equal(w.block, 10 - strike, "what the attack left of the block carries over");
});

test("misses: the next jams or cuts miss after protocols and before phantoms; forecast equals resolution", () => {
  const r = table("wraith", 0); // a cut on the primary route
  route(r, "r1", 0);
  device(r, "ph", "phantom", 2.5, 2.4, { absorbs: 1 });
  api.addMisses(r, 1, "Spoof");
  const { preview } = agree(r);
  assert.equal(preview.hostiles[0].missed, 1);
  assert.equal(preview.hostiles[0].absorbed, 0, "the phantom was not needed");
  assert.deepEqual(preview.evasions, [{ kind: "miss", source: "Spoof", by: "h1", target: "alpha::r1" }]);
  assert.deepEqual(r.faultLinks, []);
  assert.ok(r.topology.nodes.some(node => node.id === "ph"));
  // A missDisruptions daemon misses the first jam or cut of every phase.
  const q = table("wraith", 2); // a jam
  route(q, "r1", 0);
  const OBF = testCard("engine-test-obfuscation", { name: "Obfuscation", target: "daemon" });
  DAEMON_HOOKS[as(OBF)] = { missDisruptions: ({ count }) => count };
  q.daemons = [OBF];
  assert.deepEqual(agree(q).preview.evasions.map(item => [item.kind, item.source]), [["miss", "Obfuscation"]]);
  assert.deepEqual(q.faultNodes, []);
});

test("dodges: the first strikes or breaches in port order deal 0; riders and later attacks still land", () => {
  const r = pack([["spark-mite", "left", "escort", 50, 0], ["reaver", "centre", "leader", 200, 0]]);
  r.enemyPhase = 0; // the left escort acts on the next (odd) phase
  route(r, "r1", 0);
  api.addDodges(r, 1, "Ghost Protocol");
  const { preview } = agree(r);
  const [mite, reaver] = preview.hostiles;
  assert.equal(mite.dodged, "Ghost Protocol", "port order: the left escort's strike is dodged");
  assert.equal(mite.incoming, 0);
  assert.equal(reaver.dodged, null);
  assert.ok(reaver.incoming > 0, "the second attack lands");
  assert.ok(preview.incomingTerms.some(term => /Ghost Protocol · strike dodged/.test(term.label)));
  assert.ok(r.zoneEffects.some(field => field.kind === "corrosion"), "the reaver's corrosion rider resolved");
  const DODGE = testCard("engine-test-dodge", { name: "Blur", target: "daemon" });
  DAEMON_HOOKS[as(DODGE)] = { dodges: () => 1 };
  const s = table("wraith", 1);
  route(s, "r1", 0);
  s.daemons = [DODGE];
  assert.equal(agree(s).preview.incoming, 0);
  assert.equal(s.integrity, 100);
});

test("protocols are data: a strike trap hits the attacker (Tripwire), a breach cancel (Null Route) leaves the riders", () => {
  const TRIP = testCard("engine-test-tripwire", { name: "Tripwire", target: "protocol", protocol: "strike", values: { damage: 5 }, keyword: "ARMED" });
  const NULL = testCard("engine-test-null-route", { name: "Null Route", target: "protocol", protocol: "breach", cancels: true, keyword: "ARMED" });
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = [TRIP];
  assert.ok(playProtocol(r, 0).ok);
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.deepEqual(preview.protocolTriggers.map(item => item.effect), ["The attacker takes 5."]);
  assert.equal(preview.hostiles[0].trapDamage, 5);
  assert.ok(preview.incoming > 0, "Tripwire does not stop the strike");
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage - 5);
  assert.ok(r.discardPile.includes(TRIP), "a fired protocol goes to discard");
  // In the trap step: a striker Tripwire kills never acts.
  const k = table("wraith", 1);
  k.enemies[0].hp = 5;
  k.hand = [TRIP];
  playProtocol(k, 0);
  assert.equal(combatPreview(k).enemyDefeatedByTraps, true);
  assert.equal(endTurn(k).defeated, true);
  // Null Route: the breach deals 0; Grave Reaver's corrosion still lands.
  const n = table("reaver", 0);
  route(n, "r1", 0);
  n.hand = [NULL];
  playProtocol(n, 0);
  const cancelled = agree(n).preview;
  assert.equal(cancelled.incoming, 0);
  assert.equal(cancelled.hostiles[0].nullified, "Null Route");
  assert.deepEqual(cancelled.protocolTriggers.map(item => item.effect), ["Cancels the breach."]);
  assert.ok(cancelled.incomingTerms.some(term => term.label === "Null Route · breach cancelled"));
  assert.ok(n.zoneEffects.some(field => field.kind === "corrosion"));
  // A protocolFired daemon (Incident Response) hits whoever set a protocol off.
  const INCIDENT = testCard("engine-test-incident", { name: "Incident", target: "daemon" });
  DAEMON_HOOKS[as(INCIDENT)] = { protocolFired: ({ count }) => 3 * count };
  const i = table("wraith", 1);
  route(i, "r1", 0);
  i.daemons = [INCIDENT];
  i.hand = ["rate-limiter"];
  playProtocol(i, 0);
  const fired = agree(i).preview;
  assert.equal(fired.hostiles[0].trapDamage, 3);
  assert.deepEqual(fired.protocolTriggers[0].retaliation, [{ label: "Incident", amount: 3 }]);
  assert.match(fired.protocolTriggers[0].effect, /^Reduces the strike by 5\. Incident: it takes 3\.$/);
});

// ------------------------------------------------------------------ curses in hand

test("hand hooks: an end-of-turn integrity loss is unblockable, end-of-turn wear is a forecast record, both resolve as forecast", () => {
  const BACKDOOR = testCard("engine-test-backdoor", { name: "Backdoor", target: "junk", curse: true, unplayable: true });
  const BITROT = testCard("engine-test-bitrot", { name: "Bitrot", target: "junk", curse: true, unplayable: true });
  HAND_HOOKS[as(BACKDOOR)] = { endOfTurn: ({ count }) => ({ integrity: count }) };
  HAND_HOOKS[as(BITROT)] = {
    endOfTurn: ({ run, network, count }) => {
      const router = network.primary?.path.find(id => run.topology.nodes.find(node => node.id === id)?.role === "router");
      return router ? { wear: [{ nodeId: router, points: count }] } : {};
    },
  };
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.topology.nodes.find(node => node.id === "r1")!.condition = 2;
  r.block = 50;
  r.hand = [BACKDOOR, BACKDOOR, BITROT];
  const { preview } = agree(r);
  assert.equal(preview.incoming, 2, "the strike is blocked; the two Backdoors are not");
  assert.ok(preview.incomingTerms.some(term => term.label === "Backdoor ×2 · in hand" && term.amount === 2));
  assert.deepEqual(preview.wear, [{ nodeId: "r1", from: 2, to: 1, breaks: false, source: "Bitrot" }]);
  assert.deepEqual(preview.handEffects, [
    { id: BACKDOOR, name: "Backdoor", count: 2, integrity: 2, wear: [] },
    { id: BITROT, name: "Bitrot", count: 1, integrity: 0, wear: ["r1"] },
  ]);
  assert.equal(r.topology.nodes.find(node => node.id === "r1")!.condition, 1);
  // A lethal transmission ends the fight before the enemy phase: nothing resolves.
  const l = table("wraith", 1);
  route(l, "r1", 0);
  l.enemies[0].hp = 1;
  l.hand = [BACKDOOR];
  assert.equal(combatPreview(l).incoming, 0);
});

test("hand hooks: a play limit refuses the card after the limit; onDraw fires when the card is drawn", () => {
  const PANIC = testCard("engine-test-panic", { name: "Kernel Panic", target: "junk", curse: true, unplayable: true });
  HAND_HOOKS[as(PANIC)] = { playLimit: () => 3 };
  const r = table();
  r.hand = [PANIC, "guard", "guard", "guard", "guard"];
  for (let i = 0; i < 3; i++) assert.ok(playInstant(r, 1).ok);
  const refused = playInstant(r, 1);
  assert.deepEqual(refused, { ok: false, message: "Kernel Panic is in your hand: at most 3 cards this turn." });
  device(r, "r1", "router", 0, 0);
  assert.ok(useConsole(r, "alpha", "r1").ok, "the console is not a card play");
  const LEAK = testCard("engine-test-leak", { name: "Memory Leak", target: "junk", curse: true, unplayable: true });
  HAND_HOOKS[as(LEAK)] = { onDraw: ({ run }) => { run.energy = Math.max(0, run.energy - 1); } };
  const d = table();
  d.hand = ["diagnostic"];
  d.drawPile = [LEAK, "guard", LEAK];
  const energy = d.energy;
  playInstant(d, 0);
  assert.equal(d.energy, energy - CARDS.diagnostic.cost - 2);
});

// ------------------------------------------------------------------ relics

test("v5 relics: Air Gap shrinks rewards, Legacy Mainframe refuses repair, Overvolt adds its curse when it exists", () => {
  const r = table();
  r.relics.push("air-gap");
  r.enemies[0].hp = 1;
  route(r, "r1", 0);
  endTurn(r);
  assert.equal(r.cardRewards.length, 2);
  const s = newExpedition("warden", 4).run;
  s.relics.push("legacy-mainframe");
  s.phase = "forge";
  s.integrity = 5;
  const refused = chooseForge(s, "repair");
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Legacy Mainframe/);
  assert.equal(s.integrity, 5);
  assert.ok(leaveForge(s).ok);
  // Overvolt: nothing while Backdoor is undefined (phase C), then one now and one per elite.
  const o = newExpedition("ghost", 5).run;
  o.phase = "relic";
  o.relicRewards = ["overvolt"];
  const deck = o.deck.length;
  if (!CARDS.backdoor) {
    chooseRelic(o, "overvolt");
    assert.equal(o.deck.length, deck);
    testCard("backdoor", { name: "Backdoor", target: "junk", curse: true, unplayable: true });
    o.phase = "relic";
    o.relics = o.relics.filter(id => id !== "overvolt");
    o.relicRewards = ["overvolt"];
  }
  chooseRelic(o, "overvolt");
  assert.equal(o.deck.filter(id => id === "backdoor").length, 1);
  const elite = o.map.find(room => room.type === "elite")!;
  o.currentRoom = elite.id;
  grantVictory(o);
  assert.equal(o.deck.filter(id => id === "backdoor").length, 2, "and after every elite");
  assert.equal(RELICS["hot-swap"].rules, "The first link card you play each turn costs 0.");
});

// ------------------------------------------------------------------ rewards and the market

test("reward slots: pool, rarity and card, with the keeper share, the rarity tables, the elite and guardian rules", () => {
  const run = { archetype: "architect", stage: 0 } as RunState;
  // Pool roll < keeperShare → the keeper's pool; else colorless.
  const keeper = rollSlot(run, sequence(RULES.keeperShare - 0.01, 0.9, 0), "normal", 1)!;
  assert.equal(CARDS[keeper].archetype, "architect");
  assert.equal(CARDS[keeper].rarity, "uncommon");
  const colorless = rollSlot(run, sequence(RULES.keeperShare + 0.01, 0.1, 0), "normal", 1)!;
  assert.equal(CARDS[colorless].archetype, undefined);
  assert.equal(CARDS[colorless].rarity, "common");
  // Rarity tables: common / uncommon / rare, the legendary share carved from the rare band.
  const tally = (kind: "normal" | "elite" | "guardian", first = false) => {
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < 10000; i++) counts[slotRarity((i + 0.5) / 10000, kind, first)]++;
    return counts;
  };
  const normal = tally("normal");
  assert.deepEqual([normal.common, normal.uncommon, normal.rare + normal.legendary], RULES.rewardRarity.normal.map(share => share * 10000));
  assert.equal(normal.legendary, Math.round(RULES.rewardRarity.normal[2] * RULES.legendaryShare * 10000));
  const elite = tally("elite", true);
  assert.equal(elite.common, 0, "an elite's first slot is uncommon or better");
  assert.equal(tally("elite").common, RULES.rewardRarity.elite[0] * 10000);
  const guardian = tally("guardian");
  assert.equal(guardian.common + guardian.uncommon, 0, "guardians offer rares");
  // A legendary roll finds Clabernetes whichever pool the slot chose (the other pool fills in).
  assert.equal(pickCard(run, sequence(0), "keeper", "legendary"), "clabernetes");
  // Stage upgrades: the roll after the pick.
  const upgraded = rollSlot({ archetype: "ghost", stage: 2 } as RunState, sequence(0.9, 0.1, 0, RULES.upgradedOfferRate[2] - 0.01), "normal", 1)!;
  assert.ok(upgraded.endsWith("+"));
  // Never basics, curses, junk or tokens; keeper cards only for their keeper.
  for (let seed = 1; seed <= 60; seed++) for (const archetype of ["architect", "warden", "ghost"] as const) {
    const e = newExpedition(archetype, seed).run;
    e.currentRoom = e.map.find(room => room.type === "battle")!.id;
    for (const id of cardRewards(e)) {
      const card = CARDS[id];
      assert.ok(!["basic", "special"].includes(card.rarity) && !card.curse && !card.junk && !card.token, id);
      assert.ok(!card.archetype || card.archetype === archetype, id);
    }
  }
});

test("the market stocks keeper and colorless slots at their rarities, the router bench first", () => {
  assert.deepEqual(MARKET_SLOTS.map(slot => `${slot.pool} ${slot.rarity}`),
    ["keeper common", "colorless common", "keeper uncommon", "colorless uncommon", "keeper rare"]);
  const e = newExpedition("architect", 9).run;
  openShop(e);
  const cards = e.shop!.cards;
  assert.equal(cards[0].id, "router");
  assert.equal(cards.length, 1 + MARKET_SLOTS.length);
  assert.equal(CARDS[cards[2].id].archetype, undefined, "the colorless common slot");
  assert.ok(["common"].includes(CARDS[cards[2].id].rarity));
  assert.equal(CARDS[cards[3].id].archetype, "architect", "the keeper uncommon slot");
});

// ------------------------------------------------------------------ starters and removal

test("starter decks: the shared ten plus two signature cards; removal keeps the deck floor of 8", () => {
  assert.equal(STARTER_DECK.length, 10);
  for (const archetype of ["architect", "warden", "ghost"] as const) assert.equal(starterDeck(archetype).length, 12);
  const r = newExpedition("warden", 3).run;
  r.phase = "forge";
  r.deck = ["router", "fiber", "fiber", "guard", "guard", "pulse", "pulse", "patch", "cve"];
  assert.ok(removeDeckCard(r, r.deck.indexOf("pulse")).ok, "nine cards: one may go");
  r.phase = "forge";
  assert.equal(removeDeckCard(r, r.deck.indexOf("pulse")).ok, false, "eight is the floor");
  assert.ok(removeDeckCard(r, r.deck.indexOf("cve")).ok, "curses always go");
});

// ------------------------------------------------------------------ the effect API

test("effect API: socketNear, strike with overflow and armor, Harden without the console, unlink and deploy", () => {
  const r = table();
  route(r, "r1", 0);
  device(r, "r2", "router", 3, 0);
  wire(r, "r1", "r2");
  const socket = socketNear(r, { x: 1.5, z: 0 })!;
  assert.ok(socket && Math.hypot(socket.x - 1.5, socket.z) <= 0.36 * 10, "a legal socket near the midpoint");
  assert.ok(Math.hypot(socket.x, socket.z) >= RULES.deviceSpacing && Math.hypot(socket.x - 3, socket.z) >= RULES.deviceSpacing);
  assert.ok(api.unlink(r, "r1", "r2"));
  const node = api.deploy(r, "switch", socket)!;
  assert.equal(node.condition, RULES.deviceCondition);
  assert.ok(api.link(r, "r1", node.id) && api.link(r, node.id, "r2"));
  // Strike: the target first, the surplus to the next living port; armor per port unless ignored.
  const p = pack([["spark-mite", "left", "escort", 4], ["colossus", "centre", "leader", 30]]);
  p.focus = "left";
  const hit = strikeTarget(p, 10);
  assert.deepEqual(hit.killed, ["h1"]);
  assert.equal(hit.ports.left, 4);
  assert.ok((hit.ports.centre ?? 0) < 6, "the Colossus's armor takes its share of the overflow");
  const clean = pack([["spark-mite", "left", "escort", 4], ["colossus", "centre", "leader", 30]]);
  clean.focus = "left";
  assert.equal(strikeTarget(clean, 10, { ignoreArmor: true }).ports.centre, 6);
  // Harden once, the console untouched.
  const w = table("wraith", 1, "warden");
  route(w, "r1", 0);
  const uses = w.consoleUses;
  const block = hardenBlock(w);
  assert.equal(hardenOnce(w).block, block);
  assert.equal(w.block, block);
  assert.equal(w.consoleUses, uses);
  // Deleting a Worm is a card play, and its exhaust is heard.
  w.hand = ["worm"];
  assert.ok(playJunk(w, 0).ok);
  assert.ok(w.exhaustPile.includes("worm"));
});

// ------------------------------------------------------------------ completeness (phase C)

test("every v5 card id of the contract has a definition", { todo: "phase C fills the data files" }, () => {
  const missing = (Object.keys(CARD_IDS_BY_OWNER) as CardOwner[]).flatMap(owner => missingCards(owner).map(id => `${owner}:${id}`));
  assert.deepEqual(missing, []);
});
test("every defined keeper card carries its keeper; every colorless card none", () => {
  for (const owner of ["architect", "warden", "ghost"] as const)
    for (const id of CARD_IDS_BY_OWNER[owner]) if (CARDS[id]) assert.equal(CARDS[id].archetype, owner, id);
  for (const id of CARD_IDS_BY_OWNER.colorless) if (CARDS[id]) assert.equal(CARDS[id].archetype, undefined, id);
  assert.ok(CARD_IDS_BY_OWNER.curses.every(id => !CARDS[id] || CARDS[id].rarity === "special"));
  // chooseCardReward keeps its contract with fewer offers (Air Gap).
  assert.equal(typeof chooseCardReward, "function");
});
