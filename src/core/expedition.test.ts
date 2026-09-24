import assert from "node:assert/strict";
import test from "node:test";
import { ARCHETYPES, newExpedition, parseExpedition, dailySeed, starterDeck, type Expedition } from "./expedition.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "./ascension.ts";
import { CARDS, STARTER_DECK } from "./cards.ts";
import { chooseRoom } from "./run.ts";
import { createMap } from "./map.ts";
import { messageOffer, planEncounter } from "./encounter.ts";
import type { CardId, MapRoom, RunState } from "./types.ts";

const count = (deck: CardId[], id: CardId) => deck.filter(card => card === id).length;

test("each archetype has its promised deck, relic, console and integrity, and survives a save round trip", () => {
  assert.equal(STARTER_DECK.length, 17);
  for (const id of ["architect", "warden", "ghost"] as const) {
    const e = newExpedition(id, 1234);
    const deck = e.run.deck;
    assert.equal(e.version, 4);
    assert.equal(e.run.archetype, id);
    assert.equal(e.run.ascension, 0);
    assert.equal(e.run.credits, 0);
    assert.deepEqual(e.run.relics, [ARCHETYPES[id].relic]);
    assert.equal(deck.length, 17);
    assert.deepEqual(deck, starterDeck(id));
    if (id === "architect") {
      assert.deepEqual([count(deck, "duplex"), count(deck, "relay"), count(deck, "load-balancer")], [1, 1, 1]);
      assert.deepEqual([count(deck, "fiber"), count(deck, "switch"), count(deck, "guard")], [3, 0, 1]);
      assert.equal(ARCHETYPES[id].console, "patch");
    }
    if (id === "warden") {
      assert.deepEqual([count(deck, "hardened-router"), count(deck, "router"), count(deck, "bastion"), count(deck, "firewall"), count(deck, "pulse")], [1, 1, 1, 1, 0]);
      assert.equal(ARCHETYPES[id].relic, "backpressure");
      assert.equal(ARCHETYPES[id].console, "harden");
    }
    if (id === "ghost") {
      assert.deepEqual([count(deck, "crosslink"), count(deck, "fiber"), count(deck, "diagnostic"), count(deck, "patch"), count(deck, "store-forward"), count(deck, "guard")], [2, 2, 1, 0, 1, 1]);
      assert.equal(ARCHETYPES[id].console, "buffer");
    }
    assert.equal(e.run.integrity, { architect: 14, warden: 15, ghost: 12 }[id]);
    assert.ok(deck.every(card => !CARDS[card].archetype || CARDS[card].archetype === id));
    assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
    assert.equal(chooseRoom(e.run, "0-1").ok, true);
    assert.ok(e.run.hand.some(card => CARDS[card].role === "router" && CARDS[card].target === "ground"));
    assert.ok(e.run.hand.filter(card => CARDS[card].target === "link").length >= 2);
    assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  }
});

test("ascension levels are cumulative expedition rules", () => {
  assert.equal(MAX_ASCENSION, 10);
  assert.deepEqual(ASCENSION_LEVELS.map(level => level.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const four = newExpedition("warden", 5, false, 4).run;
  assert.equal(four.ascension, 4);
  assert.ok(!four.deck.includes("cve"));
  const five = newExpedition("warden", 5, false, 5).run;
  assert.equal(count(five.deck, "cve"), 1);
  assert.equal(five.maxIntegrity, 15);
  const eight = newExpedition("warden", 5, false, 8).run;
  assert.equal(eight.maxIntegrity, 13);
  assert.equal(eight.integrity, 13);
  assert.equal(newExpedition("ghost", 5, false, 99).run.ascension, 10);
  assert.equal(newExpedition("ghost", 5, false, -3).run.ascension, 0);
});

test("daily expeditions repeat card draws and threats for the same date and loadout", () => {
  const seed = dailySeed(new Date("2026-09-22T04:00:00Z"));
  assert.equal(seed, 20260922);
  const a = newExpedition("ghost", seed, true),
    b = newExpedition("ghost", seed, true);
  b.startedAt = a.startedAt;
  chooseRoom(a.run, "0-0");
  chooseRoom(b.run, "0-0");
  assert.deepEqual(a, b);
});

/** A mid-fight v4 state with every new field in use: three hostiles, four installations,
 * worn devices, aims, a pending message, an arrival, a signal and banked credits. */
function fullBattle(seed = 555): ReturnType<typeof newExpedition> {
  const e = newExpedition("architect", seed);
  const r = e.run;
  r.stage = 2;
  r.map = createMap(2, r.seed);
  const room = r.map.find(item => item.type === "battle")!;
  r.currentRoom = room.id;
  r.floor = room.floor;
  r.phase = "battle";
  const trio: MapRoom = { ...room, enemyId: "choir", pack: ["glass-echo", "glass-echo"], designations: ["laden", "hardened"] };
  r.enemies = planEncounter(r, trio).enemies;
  r.enemies[0].hp = 3;
  r.enemies[1].turn = 4; r.enemies[1].surge = 1; r.enemies[1].echo = 3; r.enemies[1].skipNext = true;
  r.enemies[2].hp = 0;
  r.topology.nodes.push(
    { id: "router1", role: "router", x: 0, z: 0, condition: 1, maxCondition: 2, deployedBy: "router", configured: true },
    { id: "switch2", role: "switch", x: 2.5, z: 0, condition: 3, maxCondition: 3, deployedBy: "switch" },
    { id: "rack3", role: "rack", x: -2.5, z: 2.4, condition: 3, deployedBy: "server-rack" },
    { id: "firewall4", role: "firewall", x: 0, z: -2.4, condition: 2, sentry: true, deployedBy: "sentry-firewall" },
    { id: "phantom5", role: "phantom", x: 2.5, z: 2.4, condition: 2, absorbs: 1, deployedBy: "phantom-node" },
    { id: "cache6", role: "cache", x: -2.5, z: -2.4, condition: 1, salvage: true },
  );
  r.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "switch2", armored: true }, { a: "switch2", b: "omega" }, { a: "router1", b: "firewall4" });
  r.nextNodeId = 7;
  r.installations = [
    { id: "i1", kind: "tap", x: 0, z: 1.2, integrity: 1, activeFrom: 0, owner: "h2" },
    { id: "i2", kind: "jammer", x: 1.6, z: 0.9, integrity: 2, activeFrom: 2, owner: "h2", aim: "router1" },
    { id: "i3", kind: "spike", x: -1.6, z: -0.9, integrity: 3, activeFrom: 3, owner: "h1", aim: "router1" },
    { id: "i4", kind: "breaker", x: 4.1, z: -1.2, integrity: 1, countdown: 2, activeFrom: 4, owner: "h2", aim: "switch2" },
  ];
  r.faultNodes = ["switch2"];
  r.faultLinks = ["alpha::router1"];
  r.focus = "centre";
  r.aims = { "router1|switch2": "left", router1: "centre" };
  r.enemyPhase = 4;
  r.hostileActions = 7;
  r.reinforcement = { enemyId: "ward-node", after: 1, hp: 11, crate: { kind: "credits", amount: 12, message: true } };
  r.signal = { id: "interference", firesOnTurn: 3, resolved: false, zone: "north" };
  r.offers = [messageOffer(r, "crate", "h1"), { kind: "crate-card", cards: ["quorum", "bulkhead+"] }];
  r.encounterCards = ["zero-day"];
  r.creditLedger = [{ label: "crates", amount: 12 }];
  r.terrain = { name: "Collapsed rack row", description: "Wreckage blocks the north aisle.", debris: [{ x: 1, z: -3 }, { x: -4.1, z: 2.4, fresh: true, role: "router" }] };
  r.turnEffects = { everyPort: 2, forceFocus: true, discounted: ["router"] };
  r.lingeringJams = { switch2: 1 };
  r.frayedByCut = ["router1::switch2"];
  r.repairsThisTurn = 1;
  return e;
}

test("a v4 battle state survives the save round trip exactly", () => {
  const e = fullBattle();
  assert.equal(e.run.enemies.length, 3);
  assert.equal(e.run.installations.length, 4);
  assert.deepEqual(parseExpedition(JSON.stringify(e)), e);
  // A stage I duo room (no leader) is a legal fight room.
  const duo = newExpedition("ghost", 8);
  duo.run.map[0] = { ...duo.run.map[0], pack: ["spark-mite", "splicer"] };
  delete duo.run.map[0].enemyId;
  assert.ok(parseExpedition(JSON.stringify(duo)));
});

test("a v3 save migrates in memory: the hostile stands at the centre, malware becomes Taps, faults become lists", () => {
  const e = newExpedition("warden", 77);
  const r = e.run as unknown as Record<string, unknown> & RunState;
  const room = r.map.find(item => item.floor === 0)!;
  // A v3 chart: singles only, no ribbons.
  for (const item of r.map) {
    if (item.pack && !item.enemyId) item.enemyId = "wraith";
    delete item.pack; delete item.designations; delete item.designationHidden; delete item.reinforced;
  }
  if (!room.enemyId) room.enemyId = "leech";
  r.phase = "battle";
  r.currentRoom = room.id;
  r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 }, { id: "switch2", role: "switch", x: 2.6, z: -3.4, salvage: true });
  r.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "omega" });
  const v3 = {
    ...e, version: 3,
    run: {
      ...Object.fromEntries(Object.entries(r).filter(([key]) =>
        !["enemies", "faultNodes", "faultLinks", "installations", "focus", "aims", "enemyPhase", "hostileActions", "reinforcement", "signal", "offers", "encounterCards"].includes(key))),
      enemy: { id: "leech", name: "PACKET LEECH", title: "Feeds on lost traffic", color: 0x6ee4d4, hp: 15, maxHp: 21, turn: 4 },
      malware: [{ id: "malware1", x: 0, z: 2.4 }, { id: "malware2", x: 2.5, z: 2.4 }],
      faultNode: "router1",
      faultLink: "alpha::router1",
    },
  };
  const parsed = parseExpedition(JSON.stringify(v3)) as Expedition;
  assert.ok(parsed, "v3 saves are migrated, not refused");
  const m = parsed.run;
  assert.equal(parsed.version, 4);
  assert.deepEqual(m.enemies, [{ id: "leech", name: "PACKET LEECH", title: "Feeds on lost traffic", color: 0x6ee4d4, hp: 15, maxHp: 21, turn: 4, uid: "h1", port: "centre", role: "single" }]);
  assert.deepEqual(m.installations, [
    { id: "malware1", kind: "tap", x: 0, z: 2.4, integrity: 1, activeFrom: 0, owner: "h1" },
    { id: "malware2", kind: "tap", x: 2.5, z: 2.4, integrity: 1, activeFrom: 0, owner: "h1" },
  ]);
  assert.deepEqual([m.faultNodes, m.faultLinks], [["router1"], ["alpha::router1"]]);
  assert.deepEqual(m.topology.nodes.map(node => [node.id, node.condition]),
    [["alpha", undefined], ["omega", undefined], ["router1", 2], ["switch2", 1]], "deployed devices 2, salvage 1, terminals none");
  assert.deepEqual([m.focus, m.aims, m.enemyPhase, m.hostileActions, m.reinforcement, m.signal, m.offers, m.encounterCards],
    ["centre", {}, 4, 4, null, null, [], []]);
  for (const key of ["enemy", "malware", "faultNode", "faultLink"]) assert.ok(!(key in m), `${key} is gone`);
  // A v3 save between rooms migrates to an empty rail; malformed v3 values are still rejected.
  const between = { ...v3, run: { ...v3.run, phase: "map", currentRoom: null, enemy: null, malware: [], faultNode: null, faultLink: null } };
  const mapSave = parseExpedition(JSON.stringify(between))!;
  assert.deepEqual([mapSave.run.enemies, mapSave.run.focus, mapSave.run.installations], [[], null, []]);
  assert.equal(parseExpedition(JSON.stringify({ ...v3, run: { ...v3.run, malware: [1, 2, 3, 4, 5].map(i => ({ id: `m${i}`, x: 0, z: i / 2 })) } })), null, "five Taps exceed the cap");
  assert.equal(parseExpedition(JSON.stringify({ ...v3, run: { ...v3.run, enemy: { ...v3.run.enemy, id: "nobody" } } })), null);
  assert.equal(parseExpedition(JSON.stringify({ ...v3, run: { ...v3.run, faultNode: "missing" } })), null);
  // A v4 state that is merely labelled 3 keeps everything it carries.
  const labelled = fullBattle();
  const relabelled = parseExpedition(JSON.stringify({ ...labelled, version: 3 }));
  assert.deepEqual(relabelled, labelled);
});

test("invalid, tampered and pre-redesign saves fall back to a fresh menu", () => {
  assert.equal(parseExpedition("{broken"), null);
  assert.equal(parseExpedition("{}"), null);
  assert.equal(parseExpedition("[]"), null);
  const tamper = (edit: (e: ReturnType<typeof newExpedition>) => void) => {
    const e = newExpedition("architect", 31);
    edit(e);
    return parseExpedition(JSON.stringify(e));
  };
  assert.ok(tamper(() => {}), "an untouched save loads");
  assert.equal(tamper(e => { (e as { version: number }).version = 2; }), null, "v2 saves predate the redesign");
  assert.equal(tamper(e => { (e as { version: number }).version = 5; }), null, "future saves are refused");
  assert.equal(tamper(e => e.run.deck.push("bad-card" as never)), null);
  assert.equal(tamper(e => { e.run.integrity = -1; }), null);
  assert.equal(tamper(e => e.run.topology.links.push({ a: "alpha", b: "missing" })), null);
  assert.equal(tamper(e => { e.run.archetype = "ghost"; }), null, "run and expedition archetype agree");
  assert.equal(tamper(e => { e.run.ascension = 11; }), null);
  assert.equal(tamper(e => { e.run.credits = -5; }), null);
  assert.equal(tamper(e => { e.run.credits = 1.5; }), null);
  assert.equal(tamper(e => { e.run.protocols = ["failover-policy", "rate-limiter", "tarpit"]; }), null);
  assert.equal(tamper(e => { e.run.protocols = ["nonsense" as never]; }), null);
  assert.equal(tamper(e => { e.run.consoleUses = 3; }), null);
  assert.equal(tamper(e => { e.run.buffer = -1; }), null);
  assert.equal(tamper(e => { e.run.terrain = { name: "x", description: "y", debris: [{ x: Number.NaN, z: 0 }] }; }), null);
  assert.equal(tamper(e => { e.run.phase = "shop"; }), null, "a market phase needs a market");
  assert.equal(tamper(e => { e.run.phase = "event"; e.run.event = { id: "not-an-event", resolved: false }; }), null);
  assert.equal(tamper(e => { e.run.shop = { cards: [{ id: "router", price: -1, sold: false }], relics: [], removePrice: 50, upgradePrice: 40, removed: false, upgraded: false }; }), null);
  assert.equal(tamper(e => { e.run.topology.nodes.push({ id: "x", role: "mainframe" as never, x: 0, z: 0 }); }), null);
  assert.ok(tamper(e => {
    e.run.terrain = { name: "Collapsed rack row", description: "Wreckage blocks the north aisle.", debris: [{ x: 1, z: -3 }] };
    e.run.topology.nodes.push({ id: "cache1", role: "cache", x: 2, z: 2, salvage: true, condition: 1 });
    e.run.zoneEffects = [{ zone: "north", kind: "resonance", turns: 99, permanent: true }, { zone: "north", kind: "resonance", turns: 3 }];
  }), "terrain, salvage devices and permanent fields load");

  // v4 bounds, on a full battle state.
  const bad = (what: string, edit: (r: RunState) => void) => {
    const e = fullBattle();
    edit(e.run);
    assert.equal(parseExpedition(JSON.stringify(e)), null, what);
  };
  const enemy = (r: RunState) => r.enemies[1] as unknown as Record<string, unknown>;
  bad("four hostiles", r => r.enemies.push({ ...r.enemies[0], uid: "h9", port: "left" }));
  bad("two hostiles share a port", r => { r.enemies[2].port = "left"; });
  bad("two hostiles share a uid", r => { r.enemies[2].uid = "h1"; });
  bad("two leaders", r => { r.enemies[0] = { ...r.enemies[1], uid: "h1", port: "left" }; });
  bad("a battle with no hostile", r => { r.enemies = []; });
  bad("an unknown hostile", r => { r.enemies[0].id = "nobody"; });
  bad("an escort standing as a leader", r => { r.enemies[0].role = "leader"; r.enemies[1].role = "escort"; });
  bad("health above its maximum", r => { r.enemies[0].hp = r.enemies[0].maxHp + 1; });
  bad("a malformed uid", r => { r.enemies[0].uid = "hostile-1"; });
  bad("a malformed cadence", r => { enemy(r).cadence = "sometimes"; });
  bad("an unknown designation", r => { enemy(r).designations = ["cursed"]; });
  bad("three designations", r => { r.enemies[1].designations = ["laden", "hardened", "stoked"]; });
  bad("a repeated designation", r => { r.enemies[1].designations = ["laden", "laden"]; });
  bad("negative crate credits", r => { r.enemies[0].crate = { kind: "credits", amount: -1 }; });
  bad("an unknown crate", r => { (r.enemies[0] as unknown as Record<string, unknown>).crate = { kind: "treasure" }; });
  bad("a one-card crate", r => { (r.enemies[0] as unknown as Record<string, unknown>).crate = { kind: "card", cards: ["quorum"] }; });
  bad("a surge beyond level 3", r => { r.enemies[1].surge = 4; });
  bad("five installations", r => r.installations.push({ id: "i5", kind: "tap", x: -4, z: 1.2, integrity: 1, activeFrom: 0, owner: "h2" }));
  bad("integrity 0", r => { r.installations[1].integrity = 0; });
  bad("integrity 4", r => { r.installations[1].integrity = 4; });
  bad("a countdown on a Tap", r => { r.installations[0].countdown = 1; });
  bad("a Breaker Charge without a countdown", r => { delete r.installations[3].countdown; });
  bad("a countdown of 3", r => { r.installations[3].countdown = 3; });
  bad("an installation outside the grid", r => { r.installations[1].x = 9; });
  bad("an unknown installation", r => { (r.installations[1] as unknown as Record<string, unknown>).kind = "mine"; });
  bad("two installations share an id", r => { r.installations[1].id = "i1"; });
  bad("condition 5", r => { r.topology.nodes.find(node => node.id === "router1")!.condition = 5; });
  bad("condition above its maximum", r => { r.topology.nodes.find(node => node.id === "router1")!.condition = 3; });
  bad("a fractional condition", r => { r.topology.nodes.find(node => node.id === "router1")!.condition = 1.5; });
  bad("a terminal with condition", r => { r.topology.nodes[0].condition = 2; });
  bad("an unknown role", r => { r.topology.nodes.find(node => node.id === "rack3")!.role = "tower" as never; });
  bad("an aim naming a missing device", r => { r.aims = { "router1|ghost9": "left" }; });
  bad("an aim at no port", r => { (r.aims as Record<string, string>).router1 = "up"; });
  bad("a jam on a missing device", r => { r.faultNodes = ["ghost9"]; });
  bad("a focus that is not a port", r => { (r as unknown as Record<string, unknown>).focus = "middle"; });
  bad("seven wrecks", r => { r.terrain!.debris = Array.from({ length: 7 }, (_, i) => ({ x: -6 + 2 * i, z: 4 })); });
  bad("a wreck outside the grid", r => { r.terrain!.debris[0].z = 9; });
  bad("a reinforcement four phases away", r => { r.reinforcement!.after = 4; });
  bad("an armed arrival without Shedding", r => { r.reinforcement!.after = -1; });
  bad("a leader as reinforcement", r => { r.reinforcement!.enemyId = "serpent"; });
  bad("an unknown signal", r => { (r.signal as unknown as Record<string, unknown>).id = "meteor"; });
  bad("a signal naming no band", r => { (r.signal as unknown as Record<string, unknown>).zone = "west"; });
  // A trio's crates (card + message each) and a Laden message can queue up to seven at once.
  bad("nine offers", r => { while (r.offers.length < 9) r.offers.push(r.offers[0]); });
  bad("an unknown message option", r => { (r.offers[0] as { options: unknown[] }).options.push({ id: "jackpot" }); });
  bad("a crate offer with three cards", r => { r.offers[1] = { kind: "crate-card", cards: ["quorum", "bulkhead", "spearhead"] }; });
  bad("an unknown encounter card", r => { r.encounterCards.push("bad-card" as never); });
  bad("a negative phase count", r => { r.enemyPhase = -1; });
  bad("negative banked credits", r => { r.creditLedger = [{ label: "crates", amount: -3 }]; });
  bad("a malformed turn effect", r => { (r.turnEffects as Record<string, unknown>).everyPort = "lots"; });
  bad("a lingering jam on a missing device", r => { r.lingeringJams = { ghost9: 1 }; });
  bad("a room with an unknown designation", r => { (r.map[0] as unknown as Record<string, unknown>).designations = ["cursed"]; });
  bad("a pack led by a leader in the escort slots", r => { r.map.find(room => room.type === "battle")!.pack = ["serpent"]; });
  bad("a fight room with nobody in it", r => { const room = r.map.find(item => item.type === "battle")!; delete room.enemyId; delete room.pack; });
  bad("a room reinforced by a word", r => { (r.map[0] as unknown as Record<string, unknown>).reinforced = "yes"; });
  bad("an escort as a room's leader", r => { r.map.find(room => room.type === "battle")!.enemyId = "splicer"; });
});
