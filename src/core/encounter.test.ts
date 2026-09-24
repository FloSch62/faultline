import test from "node:test";
import assert from "node:assert/strict";
import { newExpedition } from "./expedition.ts";
import { createMap, encounterHealth, rollRoomContents } from "./map.ts";
import {
  addHealth, chooseOffer, crateFallbackCredits, crateText, encounterRoom, eventRoom, messageOffer, messageOptionText, planEncounter,
  roomScout, salvageRole, seededRandom, SALVAGE_ROLES,
} from "./encounter.ts";
import { CARDS, RULES } from "./cards.ts";
import { DESIGNATIONS, ENEMIES, ESCORT_THREAT, PACKS, REINFORCEMENT_ESCORTS, SHED_SPAWN, SIGNALS, compositionAllowed, threatBudget } from "./enemies.ts";
import { STAGES } from "./stages.ts";
import { ASCENSION_RULES } from "./ascension.ts";
import type { Archetype, CardId, MapRoom, RunState } from "./types.ts";

function expedition(stage = 0, seed = 7, ascension = 0, archetype: Archetype = "architect"): RunState {
  const run = newExpedition(archetype, seed, ascension).run;
  run.stage = stage;
  run.map = createMap(stage, seed, ascension);
  return run;
}
const room = (fields: Partial<MapRoom>): MapRoom => ({ id: "2-1", floor: 2, lane: 1, type: "battle", cleared: false, exits: [], ...fields });
/** Every fight room of many charts, for statistics. */
function* fights(stages = [0, 1, 2], seeds = 200, ascension = 0) {
  for (const stage of stages) for (let seed = 1; seed <= seeds; seed++) {
    const run = expedition(stage, Math.imul(seed, 0x9e3779b1) >>> 0, ascension);
    for (const item of run.map) if (["battle", "elite", "boss"].includes(item.type)) yield { run, room: item, plan: planEncounter(run, item) };
  }
}

test("a plan is pure: seeded by seed, stage and room, never by run.rng or the deck", () => {
  const run = expedition(2, 4242);
  let seeded = 0;
  for (const item of run.map.filter(r => r.type !== "cache" && r.type !== "forge" && r.type !== "shop" && r.type !== "event")) {
    const before = structuredClone(run);
    const plan = planEncounter(run, item);
    assert.deepEqual(run, before, "planning mutates nothing");
    const shuffled = structuredClone(run);
    shuffled.rng = 12345; shuffled.deck.reverse(); shuffled.hand = ["guard"]; shuffled.integrity = 1; shuffled.credits = 999;
    assert.deepEqual(planEncounter(shuffled, item), plan, `${item.id} ignores the card RNG and the deck`);
    const elsewhere = structuredClone(run);
    elsewhere.seed ^= 1;
    if (JSON.stringify(planEncounter(elsewhere, item)) !== JSON.stringify(plan)) seeded++;
  }
  assert.ok(seeded >= 3, "crates, arrivals and signals come from the seed");
});

test("ports, roles, cadence and uids follow the pack's shape", () => {
  const run = expedition(2, 9);
  const single = planEncounter(run, room({ enemyId: "serpent" }));
  assert.deepEqual(single.enemies.map(e => [e.uid, e.id, e.port, e.role, e.cadence]), [["h1", "serpent", "centre", "single", undefined]]);
  const pair = planEncounter(run, room({ enemyId: "widow", pack: ["ward-node"] }));
  assert.deepEqual(pair.enemies.map(e => [e.uid, e.id, e.port, e.role, e.cadence]),
    [["h1", "ward-node", "left", "escort", "odd"], ["h2", "widow", "centre", "leader", undefined]]);
  const trio = planEncounter(run, room({ enemyId: "choir", pack: ["glass-echo", "glass-echo"] }));
  assert.deepEqual(trio.enemies.map(e => [e.uid, e.port, e.role, e.cadence]),
    [["h1", "left", "escort", "odd"], ["h2", "centre", "leader", undefined], ["h3", "right", "escort", "even"]]);
  const stageOne = expedition(0, 9);
  const duo = planEncounter(stageOne, room({ pack: ["spark-mite", "splicer"] }));
  assert.deepEqual(duo.enemies.map(e => [e.id, e.port, e.role, e.cadence]),
    [["spark-mite", "left", "escort", "odd"], ["splicer", "right", "escort", "even"]]);
  const boss = planEncounter(run, room({ id: "6-1", floor: 6, type: "boss", enemyId: "core", pack: ["splicer"], designations: ["stoked"] }));
  assert.deepEqual(boss.enemies.map(e => [e.id, e.port, e.role, e.designations, e.crate]), [["core", "centre", "single", undefined, undefined]]);
  assert.equal(boss.reinforcement, null);
  assert.equal(boss.signal, null);
  for (const plan of [single, pair, trio, duo]) for (const enemy of plan.enemies) {
    assert.equal(enemy.hp, enemy.maxHp);
    assert.equal(enemy.turn, 0);
    assert.equal(!!enemy.crate, enemy.role === "escort", "every escort carries a crate; nothing else does");
    assert.equal(enemy.name, ENEMIES[enemy.id].name);
  }
});

test("pack health shares the room's single health, Hardened and the ascension health rule included", () => {
  const run = expedition(1, 3);
  const base = room({ floor: 2, enemyId: "nest", pack: ["tap-spinner"] });
  const single = encounterHealth(1, base, 0);
  const [start, perFloor, perStage] = RULES.normalHealth;
  assert.equal(single, start + 2 * perFloor + perStage, "RULES.normalHealth: base + per floor + per stage");
  const pair = planEncounter(run, base).enemies;
  assert.deepEqual(pair.map(e => e.maxHp), [Math.round(single * 0.40), Math.round(single * 0.75)], "escort 0.40 H, leader 0.75 H");
  const shares = RULES.packShares;
  for (const [pack, expected] of [[["glass-echo", "glass-echo"], shares.trio], [["relay-drone"], shares.pair]] as const) {
    const plan = planEncounter(expedition(2, 3), room({ floor: 4, enemyId: "choir", pack: [...pack] }));
    const h = encounterHealth(2, room({ floor: 4 }), 0);
    const total = plan.enemies.reduce((sum, e) => sum + e.maxHp, 0);
    assert.ok(Math.abs(total - h * RULES.packHealthScale) <= plan.enemies.length, `pack sums to ${RULES.packHealthScale} H`);
    assert.equal(plan.enemies.find(e => e.role === "leader")!.maxHp, Math.round(h * expected[0]));
  }
  const duo = planEncounter(expedition(0, 3), room({ floor: 3, pack: ["spark-mite", "spark-mite"] })).enemies;
  const duoH = encounterHealth(0, room({ floor: 3 }), 0), duoShare = Math.round(duoH * RULES.packHealthScale * 0.5);
  assert.deepEqual(duo.map(e => e.maxHp), [duoShare, duoShare], "a stage I floor-4 duo splits 1.15 H evenly");
  const hardened = planEncounter(run, { ...base, designations: ["hardened"] }).enemies;
  assert.equal(hardened[1].maxHp, Math.round(single * 0.75 * (1 + RULES.hardenedHealth)));
  assert.equal(hardened[0].maxHp, pair[0].maxHp, "Hardened touches only the designated hostile");
  // Hardened Quarantine (stubbornSignals) raises every member of a normal pack and its reinforcement.
  const level = ASCENSION_RULES.stubbornSignals;
  const stubborn = expedition(1, 3, level);
  const a2 = planEncounter(stubborn, base).enemies;
  assert.deepEqual(a2.map(e => e.maxHp), [Math.round(Math.round(single * 1.1) * 0.40), Math.round(Math.round(single * 1.1) * 0.75)]);
  for (let seed = 1; seed < 400; seed++) {
    const r = expedition(1, seed, level);
    const plan = planEncounter(r, room({ id: `x${seed}`, floor: 4, enemyId: "widow" }));
    if (!plan.reinforcement) continue;
    assert.equal(plan.reinforcement.hp, Math.round(encounterHealth(1, room({ floor: 4 }), level) * RULES.reinforcementShares.single));
  }
  // Ascension 6: adds × RULES.ascensionAddHealth (the design had 9 / 12 / 16; the ascension pass set 1).
  const adds = ["gate-warden", "chorister", "quarantine-drone"] as const;
  assert.deepEqual(adds.map(id => addHealth(expedition(0, 1, 6), id)), adds.map(id => Math.round(RULES.addHealth[id] * RULES.ascensionAddHealth)));
  assert.deepEqual(["gate-warden", "chorister", "quarantine-drone"].map(id => addHealth(expedition(0, 1, 5), id)), [8, 10, 14]);
});

test("reinforcements: rates by stage, the empty-port rule, the 1.45 band, counts, health and Shedding", () => {
  const tally: Record<string, [number, number]> = {};
  for (const { run, room: item, plan } of fights([0, 1, 2], 250)) {
    const r = plan.reinforcement;
    const trio = (item.pack?.length ?? 0) === 2 && !!item.enemyId;
    const key = `${run.stage}/${item.type}`;
    tally[key] ??= [0, 0];
    tally[key][0]++;
    if (r && !r.shed) tally[key][1]++;
    if (!r) continue;
    assert.ok(!trio, "a full rail never rolls an arrival");
    assert.notEqual(item.type, "boss", "guardians have adds instead");
    assert.equal(ENEMIES[r.enemyId].kind, "escort");
    assert.ok(r.crate, "a reinforcement carries a crate");
    const H = encounterHealth(run.stage, item, 0);
    if (r.shed) {
      assert.ok(item.designations?.includes("shedding"));
      assert.equal(r.after, -1);
      assert.equal(r.enemyId, SHED_SPAWN[run.stage]);
      assert.equal(r.hp, Math.round(H * RULES.reinforcementShares.pair));
      assert.ok(!plan.credits.some(line => line.label === "reinforced"));
      continue;
    }
    assert.notEqual(run.stage, 0, "stage I never rolls a reinforcement");
    assert.ok(REINFORCEMENT_ESCORTS[run.stage].includes(r.enemyId));
    assert.equal(r.after, item.type === "elite" && run.stage === 2 ? RULES.eliteReinforcementCount : RULES.reinforcementCount);
    assert.equal(r.hp, Math.round(H * (item.pack?.length ? RULES.reinforcementShares.pair : RULES.reinforcementShares.single)));
    assert.ok(compositionAllowed([...(item.pack ?? []), r.enemyId]));
    const template = PACKS.find(t => t.stage === run.stage && t.leader === item.enemyId && t.room === (item.type === "elite" ? "elite" : "battle") &&
      t.escorts.join() === (item.pack ?? []).join());
    if (item.pack?.length) assert.ok(template!.threat + ESCORT_THREAT[r.enemyId] <= threatBudget(run.stage, template!.room, true), "fits the 1.45 band");
    if (item.type === "elite") assert.ok(item.reinforced, "elite arrivals follow the chart");
    assert.deepEqual(plan.credits.find(line => line.label === "reinforced"), { label: "reinforced", amount: RULES.reinforcementCredits });
    assert.match(plan.entrance.at(-1)!, /^SIGNAL DETECTED · a .+ arrives in [23] actions$/);
  }
  const rate = (key: string) => tally[key][1] / tally[key][0];
  assert.equal(tally["0/battle"][1] + tally["0/elite"][1], 0);
  assert.ok(rate("1/battle") > 0.08 && rate("1/battle") < 0.16, `stage II ${rate("1/battle")}`);
  assert.ok(rate("2/battle") > 0.14 && rate("2/battle") < 0.25, `stage III ${rate("2/battle")}`);
  assert.ok(rate("2/elite") > 0.55, `stage III elites ${rate("2/elite")}`);
});

test("signals: stage II and III only, never guardians or the first fight, only good ones beside an arrival", () => {
  const counts = [0, 0, 0], rooms = [0, 0, 0];
  for (const { run, room: item, plan } of fights([0, 1, 2], 250)) {
    if (item.type !== "boss") rooms[run.stage]++;
    if (!plan.signal) continue;
    counts[run.stage]++;
    assert.notEqual(item.type, "boss");
    assert.ok(!(run.stage === 0 && item.floor === 0));
    if (plan.reinforcement) assert.equal(SIGNALS[plan.signal].kind, "good", "an arrival and a bad signal never stack");
  }
  assert.equal(counts[0], 0);
  assert.ok(counts[1] / rooms[1] > 0.07 && counts[1] / rooms[1] < 0.13, `stage II ${counts[1] / rooms[1]}`);
  assert.ok(counts[2] / rooms[2] > 0.11 && counts[2] / rooms[2] < 0.19, `stage III ${counts[2] / rooms[2]}`);
});

test("crates are fixed at the start: weights, stage salvage, two named cards, the message rider and Bill of Lading", () => {
  const kinds: Record<string, number> = {}, riders = [0, 0];
  for (const { run, plan } of fights([0, 1, 2], 150)) for (const crate of [...plan.enemies.map(e => e.crate), plan.reinforcement?.crate]) {
    if (!crate) continue;
    kinds[crate.kind] = (kinds[crate.kind] ?? 0) + 1;
    if (crate.kind !== "empty") { riders[0]++; if (crate.message) riders[1]++; }
    if (crate.kind === "salvage") assert.ok(SALVAGE_ROLES[run.stage].includes(crate.role), `stage ${run.stage} salvage ${crate.role}`);
    if (crate.kind === "credits") assert.ok(crate.amount >= RULES.crateCredits[0] && crate.amount <= RULES.crateCredits[1]);
    if (crate.kind === "card") {
      assert.equal(crate.cards.length, 2);
      assert.notEqual(crate.cards[0].replace("+", ""), crate.cards[1].replace("+", ""));
      for (const card of crate.cards) {
        const c = CARDS[card];
        assert.ok(c && !c.junk && !c.curse && c.rarity !== "basic" && (!c.archetype || c.archetype === run.archetype), card);
      }
    }
  }
  const total = Object.values(kinds).reduce((a, b) => a + b, 0);
  const share = (kind: string) => (kinds[kind] ?? 0) / total;
  assert.ok(Math.abs(share("salvage") - 0.30) < 0.04 && Math.abs(share("credits") - 0.25) < 0.04 &&
    Math.abs(share("card") - 0.20) < 0.04 && Math.abs(share("empty") - 0.25) < 0.04, JSON.stringify(kinds));
  assert.ok(Math.abs(riders[1] / riders[0] - RULES.crateMessageShare) < 0.04, "one in four non-empty crates carries a message");
  // Bill of Lading: the empty share becomes credits. Ascension 7: every crate credit is multiplied.
  const pack = room({ floor: 3, enemyId: "choir", pack: ["glass-echo", "glass-echo"] });
  for (let seed = 1; seed <= 200; seed++) {
    const plain = expedition(2, seed), lading = expedition(2, seed), lean = expedition(2, seed, 7);
    lading.relics.push("bill-of-lading");
    const a = planEncounter(plain, pack).enemies, b = planEncounter(lading, pack).enemies, c = planEncounter(lean, pack).enemies;
    for (let i = 0; i < a.length; i++) {
      assert.notEqual(b[i].crate?.kind, "empty");
      if (a[i].crate?.kind !== "empty") assert.deepEqual(b[i].crate, a[i].crate, "only empties change");
      const [base, leaner] = [a[i].crate, c[i].crate];
      if (base?.kind === "credits" && leaner?.kind === "credits") assert.equal(leaner.amount, Math.round(base.amount * 0.9));
    }
  }
  // Salvaged drops and COLD START landings are seeded too, from the stage's crate roles.
  const salvaged = expedition(2, 31);
  salvaged.currentRoom = "3-1";
  assert.equal(salvageRole(salvaged, "h2"), salvageRole(structuredClone(salvaged), "h2"));
  assert.ok(SALVAGE_ROLES[2].includes(salvageRole(salvaged, "cold-start")));
  assert.equal(crateText({ kind: "salvage", role: "switch" }), "Edge Switch salvaged");
  assert.equal(crateText({ kind: "credits", amount: 12, message: true }), "+12 credits · an undelivered message");
  assert.equal(crateText({ kind: "empty" }), "Empty crate.");
  assert.equal(crateFallbackCredits(expedition(0, 1)), RULES.crateFallbackCredits);
  assert.equal(crateFallbackCredits(expedition(0, 1, 7)), Math.round(RULES.crateFallbackCredits * 0.9));
});

test("credits and entrance lines: pack, designation and reinforced credits; hidden ribbons are revealed", () => {
  const run = expedition(1, 21);
  const plan = planEncounter(run, room({ enemyId: "widow", pack: ["ward-node"], designations: ["nesting"], designationHidden: true }));
  assert.deepEqual(plan.credits.filter(line => line.label !== "reinforced"), [{ label: "pack", amount: RULES.packCredits }, { label: "designation", amount: RULES.designationCredits }]);
  assert.equal(plan.entrance[0], "NESTING · its first action also plants a Siphon Tap at the forecast socket");
  assert.deepEqual(plan.revealed, ["nesting"]);
  assert.deepEqual(plan.enemies[1].designations, ["nesting"]);
  assert.equal(plan.enemies[1].designationHidden, undefined, "revealed at the entrance");
  const known = planEncounter(run, room({ enemyId: "widow", designations: ["laden", "armored"] }));
  assert.deepEqual(known.entrance.slice(0, 2).map(line => line.split(" · ")[0]), ["LADEN", "ARMORED"]);
  assert.deepEqual(known.revealed, []);
  const lean = planEncounter(expedition(1, 21, 7), room({ enemyId: "widow", pack: ["ward-node"], designations: ["laden"] }));
  assert.deepEqual(lean.credits.slice(0, 2), [{ label: "pack", amount: Math.round(RULES.packCredits * 0.9) }, { label: "designation", amount: Math.round(RULES.designationCredits * 0.9) }]);
  assert.deepEqual(planEncounter(run, room({ enemyId: "widow" })).credits.filter(line => line.label !== "reinforced"), []);
});

test("roomScout shows members leader first, hides an interference ribbon until entry and matches the plan's health", () => {
  const run = expedition(2, 5);
  const hidden = room({ enemyId: "blight", pack: ["rigger-drone", "glass-echo"], designations: ["hardened"], designationHidden: true });
  const scout = roomScout(run, hidden);
  assert.deepEqual(scout.members, ["blight", "rigger-drone", "glass-echo"]);
  assert.deepEqual(scout.designations, []);
  assert.equal(scout.hidden, true);
  const plan = planEncounter(run, hidden);
  assert.ok(plan.enemies.find(e => e.id === "blight")!.maxHp > scout.health[0], "a hidden Hardened is not leaked by the chart's health");
  run.currentRoom = hidden.id;
  const inside = roomScout(run, hidden);
  assert.deepEqual([inside.hidden, inside.designations], [false, ["hardened"]]);
  assert.deepEqual(inside.health, [plan.enemies[1].maxHp, plan.enemies[0].maxHp, plan.enemies[2].maxHp]);
  run.currentRoom = null;
  assert.equal(roomScout(run, { ...hidden, cleared: true }).hidden, false, "the record shows it after the room is cleared");
  const boss = roomScout(run, room({ type: "boss", floor: 6, enemyId: "core" }));
  assert.deepEqual(boss, { members: ["core"], designations: [], hidden: false, health: [RULES.guardianHealth[2]] });
});

test("Signal in the Static rolls like the stage's normals from the seed, at the event's health", () => {
  const run = expedition(2, 77);
  const event = room({ id: "1-1", floor: 1, type: "event" });
  run.map = run.map.map(item => item.id === event.id ? event : item);
  run.currentRoom = event.id;
  const fight = eventRoom(run, event, "serpent");
  assert.deepEqual(eventRoom(run, event, "serpent"), fight, "deterministic");
  assert.equal(fight.type, "event");
  assert.equal(encounterHealth(2, fight, 0), Math.round(encounterHealth(2, { ...fight, type: "battle" }, 0) * RULES.eventHealthScale));
  run.event = { id: "signal-in-the-static", resolved: false, enemyId: "serpent" };
  assert.deepEqual(encounterRoom(run), fight);
  let packs = 0, designated = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = expedition(2, seed);
    const f = eventRoom(r, event, "moth");
    if (f.pack) packs++;
    if (f.designations) designated++;
  }
  assert.ok(packs / 400 > 0.45 && packs / 400 < 0.65, `event packs ${packs / 400}`);
  assert.ok(designated / 400 > 0.4 && designated / 400 < 0.6, `event designations ${designated / 400}`);
  // The same roll without the seed's help: rollRoomContents is the chart's roll.
  const copy = { ...event, enemyId: "moth" };
  rollRoomContents(seededRandom("event", run.seed, run.stage, event.id), 2, copy, 0);
  assert.deepEqual(copy, eventRoom(run, event, "moth"));
});

test("undelivered messages: two named options (three with Bill of Lading), exact amounts, no coin flips", () => {
  const run = expedition(1, 88);
  run.phase = "battle";
  run.currentRoom = "0-0";
  run.enemies = planEncounter(run, room({ enemyId: "widow", pack: ["ward-node"] })).enemies;
  const rng = run.rng;
  const offer = messageOffer(run, "crate", "h1");
  assert.equal(run.rng, rng, "never touches run.rng");
  assert.deepEqual(messageOffer(run, "crate", "h1"), offer, "the same drop always offers the same choices");
  assert.equal(offer.kind, "message");
  if (offer.kind !== "message") return;
  assert.equal(offer.options.length, 2);
  assert.ok(offer.sender.length > 3 && offer.text.length > 20);
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (let salt = 0; salt < 600; salt++) {
    const next = messageOffer(run, "laden", `s${salt}`);
    if (next.kind !== "message") continue;
    assert.equal(new Set(next.options.map(option => option.id)).size, next.options.length, "drawn without replacement");
    for (const option of next.options) {
      counts[option.id] = (counts[option.id] ?? 0) + 1;
      seen.add(option.id);
      if (option.id === "credit") assert.equal(option.amount, RULES.messageCredits);
      if (option.id === "restore") assert.equal(option.amount, RULES.messageRestore);
      if (option.id === "recover") assert.equal(CARDS[option.card!].rarity, "rare");
      assert.ok(messageOptionText(option).length > 10);
    }
  }
  assert.equal(seen.size, 5);
  assert.ok(counts.reinforce < counts.restore && counts.reinforce < counts.credit, "Reinforce is the rarest");
  const lading = structuredClone(run);
  lading.relics.push("bill-of-lading");
  const three = messageOffer(lading, "crate", "h1");
  assert.equal(three.kind === "message" && three.options.length, 3);
  const lean = expedition(1, 88, 7);
  lean.phase = "battle"; lean.enemies = run.enemies;
  for (let salt = 0; salt < 80; salt++) {
    const next = messageOffer(lean, "laden", `s${salt}`);
    if (next.kind === "message") for (const option of next.options) if (option.id === "credit") assert.equal(option.amount, Math.round(RULES.messageCredits * 0.9));
  }
  // On the victory screen a card for "this encounter" is worthless: Recover is left out.
  const over = structuredClone(run);
  over.enemies.forEach(enemy => { enemy.hp = 0; });
  for (let salt = 0; salt < 80; salt++) {
    const next = messageOffer(over, "laden", `v${salt}`);
    assert.ok(next.kind === "message" && next.options.every(option => option.id !== "recover"));
  }
});

test("chooseOffer resolves the oldest offer exactly as named", () => {
  const fresh = () => {
    const run = expedition(1, 90);
    run.phase = "battle";
    run.hand = ["guard", "packet-loss"];
    run.drawPile = ["worm", "fiber", "cve"];
    run.discardPile = ["packet-loss"];
    run.exhaustPile = [];
    run.deck.push("cve");
    run.integrity = run.maxIntegrity - 5;
    run.offers = [];
    run.encounterCards = [];
    return run;
  };
  const message = (id: string, extra: object = {}) => ({ kind: "message" as const, sender: "Relay Seven", text: "Landed safe.", options: [{ id: id as never, ...extra }, { id: "purge" as never }] });
  const none = fresh();
  assert.equal(chooseOffer(none, 0).ok, false, "nothing waiting");
  const restore = fresh();
  restore.offers.push(message("restore", { amount: 2 }));
  assert.equal(chooseOffer(restore, 5).ok, false, "an option must exist");
  assert.ok(chooseOffer(restore, 0).ok);
  assert.equal(restore.integrity, restore.maxIntegrity - 3);
  assert.equal(restore.offers.length, 0);
  const reinforce = fresh();
  const max = reinforce.maxIntegrity;
  reinforce.offers.push(message("reinforce", { amount: 1 }));
  chooseOffer(reinforce, 0);
  assert.equal(reinforce.maxIntegrity, max + 1);
  const credit = fresh();
  const purse = credit.credits;
  credit.offers.push(message("credit", { amount: 12 }));
  chooseOffer(credit, 0);
  assert.equal(credit.credits, purse, "in a fight, credits are banked for the victory");
  assert.deepEqual(credit.creditLedger, [{ label: "message", amount: 12 }]);
  const onScreen = fresh();
  onScreen.phase = "reward";
  onScreen.creditsEarned = 20;
  onScreen.offers.push(message("credit", { amount: 11 }));
  chooseOffer(onScreen, 0);
  assert.equal(onScreen.credits, purse + 11);
  assert.equal(onScreen.creditsEarned, 31);
  const recover = fresh();
  recover.offers.push(message("recover", { card: "zero-day" }));
  chooseOffer(recover, 0);
  assert.deepEqual(recover.hand, ["guard", "packet-loss", "zero-day"]);
  assert.deepEqual(recover.encounterCards, ["zero-day"]);
  assert.ok(!recover.deck.includes("zero-day"), "never enters the deck");
  const purge = fresh();
  const deckSize = purge.deck.length;
  purge.offers.push(message("restore", { amount: 2 }));
  chooseOffer(purge, 1);
  assert.deepEqual([purge.hand, purge.drawPile, purge.discardPile], [["guard"], ["fiber"], []], "junk leaves every pile, and one CVE");
  assert.equal(purge.deck.length, deckSize - 1);
  assert.ok(!purge.deck.includes("cve"));
  const crate = fresh();
  crate.offers.push({ kind: "crate-card", cards: ["quorum", "bulkhead"] as CardId[] }, message("restore", { amount: 2 }));
  assert.ok(chooseOffer(crate, 1).ok);
  assert.ok(crate.hand.includes("bulkhead") && crate.encounterCards.includes("bulkhead"));
  assert.equal(crate.offers.length, 1, "the next offer waits its turn");
  const full = fresh();
  full.hand = Array(RULES.handLimit).fill("guard");
  full.offers.push({ kind: "crate-card", cards: ["quorum", "bulkhead"] as CardId[] });
  chooseOffer(full, 0);
  assert.equal(full.drawPile[0], "quorum", "a full hand puts it on top of the draw pile");
  const map = fresh();
  map.phase = "map";
  map.offers.push(message("restore", { amount: 2 }));
  assert.equal(chooseOffer(map, 0).ok, false);
  assert.ok(DESIGNATIONS.laden.rule.includes("message"));
});
