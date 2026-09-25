/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { EXPEDITION_VERSION, newExpedition, parseExpedition } from "./expedition.ts";
import { createMap } from "./map.ts";
import { CARDS, RELICS, baseCard, isUpgraded } from "./cards.ts";
import {
  chooseRoom, chooseCardReward, chooseRelic, chooseForge, upgradeDeckCard, removeDeckCard,
  buyCard, buyRelic, shopRemoveCard, shopUpgradeCard, leaveShop, grantVictory, cardRewards,
  repairAmount, CARD_PRICES, REMOVE_PRICE, UPGRADE_PRICE, ROUTER_PRICE, SALVAGE_COST, openShop,
} from "./meta.ts";
import { planEncounter } from "./encounter.ts";
import { RULES } from "./cards.ts";
import type { Archetype, MapRoom, RoomType, RunState } from "./types.ts";

/** Enters the first room of a type on the current stage, jumping to its floor. */
function enter(run: RunState, type: RoomType): RunState {
  const room = run.map.find(item => item.type === type)!;
  run.floor = room.floor;
  run.lastRoom = null;
  assert.equal(chooseRoom(run, room.id).ok, true, `enter ${type}`);
  return run;
}
const fresh = (archetype: Archetype = "architect", seed = 11, ascension = 0) => newExpedition(archetype, seed, ascension).run;
const createStageMap = (run: RunState, stage: number) => createMap(stage, run.seed, run.ascension);

test("victories pay seeded credits by room type, with Credit Line and ascension", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = enter(fresh("architect", seed), "battle");
    grantVictory(r);
    assert.equal(r.phase, "reward");
    assert.ok(r.credits >= 14 && r.credits <= 18, `battle credits ${r.credits}`);
    assert.equal(r.creditsEarned, r.credits);
    assert.equal(r.cardRewards.length, 3);
  }
  const planned = (run: RunState) => planEncounter(run, run.map.find(room => room.id === run.currentRoom)!).credits.reduce((sum, line) => sum + line.amount, 0);
  const elite = enter(fresh("warden", 3), "elite");
  const eliteBonus = planned(elite);
  grantVictory(elite);
  assert.equal(elite.credits, 30 + eliteBonus);
  const boss = enter(fresh("ghost", 3), "boss");
  boss.relics.push("credit-line");
  grantVictory(boss);
  assert.equal(boss.credits, 50 + 15);
  assert.deepEqual(boss.creditLedger, [{ label: "guardian", amount: 50 }, { label: "credit line", amount: 15 }]);
  const lean = enter(fresh("warden", 3, 7), "elite");
  const leanBonus = planned(lean);
  grantVictory(lean);
  assert.equal(lean.credits, 27 + leanBonus);
});

/** Stands in a fight room without starting the fight: grantVictory only reads the room and the ledger. */
function standIn(run: RunState, match: (room: MapRoom) => boolean): MapRoom {
  const room = run.map.find(match)!;
  run.currentRoom = room.id;
  run.floor = room.floor;
  run.phase = "battle";
  return room;
}

test("the victory ledger itemises room, pack, designation, reinforcement, crates and messages", () => {
  let packs = 0, designations = 0, reinforced = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const run = fresh("architect", seed);
    run.stage = 2;
    run.map = createStageMap(run, 2);
    const room = standIn(run, item => item.type === "battle" && !!item.pack);
    const plan = planEncounter(run, room);
    // Crates and messages bank their credits during the fight; the victory pays them.
    run.creditLedger = [{ label: "crates", amount: 12 }, { label: "message", amount: 11 }, { label: "crates", amount: 9 }];
    run.offers = [{ kind: "crate-card", cards: ["quorum", "bulkhead"] }, { kind: "message", sender: "Relay Seven", text: "Landed safe.", options: [{ id: "restore", amount: 2 }, { id: "purge" }] }];
    const before = run.credits;
    grantVictory(run);
    const ledger = run.creditLedger!;
    const labels = ledger.map(line => line.label);
    assert.equal(labels[0], "room");
    assert.ok(ledger[0].amount >= 14 + 3 * 2 && ledger[0].amount <= 18 + 3 * 2);
    assert.deepEqual(ledger.find(line => line.label === "pack"), { label: "pack", amount: RULES.packCredits });
    assert.deepEqual(ledger.find(line => line.label === "crates"), { label: "crates", amount: 21 }, "crate lines merge");
    assert.deepEqual(ledger.find(line => line.label === "message"), { label: "message", amount: 11 });
    for (const line of plan.credits) assert.deepEqual(ledger.find(item => item.label === line.label), line);
    const total = ledger.reduce((sum, line) => sum + line.amount, 0);
    assert.equal(run.credits, before + total);
    assert.equal(run.creditsEarned, total);
    assert.deepEqual(run.offers.map(offer => offer.kind), ["message"], "crate cards fade with the fight; messages wait on the reward screen");
    packs++;
    if (labels.includes("designation")) designations++;
    if (labels.includes("reinforced")) reinforced++;
  }
  assert.equal(packs, 120);
  assert.ok(designations > 20 && reinforced > 5, `${designations} designated, ${reinforced} reinforced`);
  // Ascension 7 applies to every line.
  const lean = fresh("architect", 5, 7);
  lean.stage = 1;
  lean.map = createStageMap(lean, 1);
  standIn(lean, item => item.type === "elite");
  grantVictory(lean);
  assert.deepEqual(lean.creditLedger!.slice(0, 2), [{ label: "elite", amount: Math.round(35 * 0.9) }, { label: "pack", amount: Math.round(RULES.packCredits * 0.9) }]);
});

test("leaving a room clears every v4 encounter field", () => {
  const run = fresh("ghost", 14);
  const room = standIn(run, item => item.type === "battle" && item.floor === 0);
  run.enemies = planEncounter(run, room).enemies;
  run.installations = [{ id: "i1", kind: "jammer", x: 1, z: 1, integrity: 2, activeFrom: 1, owner: "h1" }];
  run.faultNodes = ["router1"]; run.faultLinks = ["alpha::router1"];
  run.focus = "centre"; run.enemyPhase = 3; run.hostileActions = 4;
  run.reinforcement = { enemyId: "splicer", after: 1, hp: 10, crate: { kind: "empty" } };
  run.signal = { id: "surge", firesOnTurn: 3, resolved: false };
  run.offers = [{ kind: "crate-card", cards: ["quorum", "bulkhead"] }];
  run.encounterCards = ["quorum"];
  run.turnEffects = { everyPort: 2 }; run.lingeringJams = { router1: 1 }; run.frayedByCut = ["alpha::router1"]; run.repairsThisTurn = 1;
  run.creditLedger = [{ label: "crates", amount: 9 }];
  grantVictory(run);
  chooseCardReward(run, null);
  assert.equal(run.phase, "map");
  assert.deepEqual([run.enemies, run.installations, run.faultNodes, run.faultLinks, run.focus, run.enemyPhase, run.hostileActions,
    run.reinforcement, run.signal, run.offers, run.encounterCards], [[], [], [], [], null, 0, 0, null, null, [], []]);
  assert.deepEqual([run.turnEffects, run.lingeringJams, run.frayedByCut, run.repairsThisTurn, run.creditLedger], [undefined, undefined, undefined, undefined, undefined]);
});

test("relic offers include the v4 commons after elites and the v4 boss relics after guardians", () => {
  const commons = new Set<string>(), bosses = new Set<string>();
  for (let seed = 1; seed <= 150; seed++) {
    const elite = enter(fresh("architect", seed), "elite");
    grantVictory(elite);
    chooseCardReward(elite, null);
    elite.relicRewards.forEach(id => commons.add(id));
    const boss = enter(fresh("warden", seed), "boss");
    grantVictory(boss);
    chooseCardReward(boss, null);
    boss.relicRewards.forEach(id => bosses.add(id));
  }
  for (const id of ["round-robin", "ingress-filter", "priority-queue", "reinforced-frame", "field-engineer", "bill-of-lading"]) assert.ok(commons.has(id), id);
  for (const id of ["storm-control", "scorched-earth"]) assert.ok(bosses.has(id), id);
});

test("entering a fight room begins the planned encounter; the next stage's chart carries the ascension", () => {
  const run = fresh("warden", 61, 9);
  const room = run.map.find(item => item.type === "battle" && item.floor === 0)!;
  const plan = planEncounter(run, room);
  enter(run, "battle");
  assert.deepEqual(run.enemies.map(enemy => [enemy.id, enemy.hp]), plan.enemies.map(enemy => [enemy.id, enemy.hp]));
  const boss = enter(fresh("warden", 61, 9), "boss");
  grantVictory(boss);
  chooseCardReward(boss, null);
  chooseRelic(boss, boss.relicRewards[0]);
  assert.equal(boss.stage, 1);
  assert.deepEqual(boss.map, createMap(1, boss.seed, 9), "advanceRoom passes the ascension to the chart");
});

test("caches grant credits and a card choice; rewards respect the archetype and never offer junk", () => {
  const r = enter(fresh("ghost", 5), "cache");
  assert.equal(r.phase, "reward");
  assert.equal(r.credits, 15);
  assert.equal(r.cardRewards.length, 3);
  for (const archetype of ["architect", "warden", "ghost"] as Archetype[]) {
    for (let seed = 1; seed <= 120; seed++) {
      const run = enter(fresh(archetype, seed), "elite");
      const offers = cardRewards(run);
      assert.equal(new Set(offers.map(baseCard)).size, 3, "no duplicate offers");
      assert.notEqual(CARDS[offers[0]].rarity, "common", "an elite's first slot is uncommon or better");
      for (const id of offers) {
        const card = CARDS[id];
        assert.ok(!card.junk && !card.curse && card.rarity !== "basic", `${id} is offerable`);
        assert.ok(!card.archetype || card.archetype === archetype, `${id} belongs to ${card.archetype}`);
        assert.ok(!isUpgraded(id), "stage I offers are never pre-upgraded");
      }
    }
  }
  let upgradedOffers = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const run = fresh("architect", seed);
    run.stage = 2;
    upgradedOffers += cardRewards(enter(run, "battle")).filter(isUpgraded).length;
  }
  assert.ok(upgradedOffers > 40 && upgradedOffers < 200, `stage III upgraded offers ${upgradedOffers}`);
});

test("elites offer common relics; stage guardians offer boss relics; the final guardian ends the run", () => {
  const elite = enter(fresh("architect", 8), "elite");
  grantVictory(elite);
  chooseCardReward(elite, null);
  assert.equal(elite.phase, "relic");
  assert.ok(elite.relicRewards.every(id => RELICS[id].tier === "common"));
  assert.ok(chooseRelic(elite, elite.relicRewards[0]).ok);
  assert.equal(elite.phase, "map");
  const boss = enter(fresh("warden", 8), "boss");
  grantVictory(boss);
  chooseCardReward(boss, boss.cardRewards[0]);
  assert.equal(boss.phase, "relic");
  assert.equal(boss.relicRewards.length, 3);
  assert.ok(boss.relicRewards.every(id => RELICS[id].tier === "boss"));
  const credits = boss.credits;
  chooseRelic(boss, boss.relicRewards[0]);
  assert.equal(boss.stage, 1);
  assert.equal(boss.phase, "map");
  assert.equal(boss.credits, credits, "credits carry into the next stage");
  const last = fresh("ghost", 8);
  last.stage = 2;
  enter(last, "boss");
  grantVictory(last);
  chooseCardReward(last, null);
  assert.equal(last.phase, "won");
});

test("sanctuaries offer repair, upgrade, removal or salvage, one service each", () => {
  const r = enter(fresh("architect", 21), "forge");
  r.integrity = 3;
  assert.equal(repairAmount(r), 4);
  assert.ok(chooseForge(r, "repair").ok);
  assert.equal(r.integrity, 7);
  assert.equal(r.phase, "map");
  const big = enter(fresh("warden", 21), "forge");
  big.maxIntegrity = 20; big.integrity = 5;
  assert.equal(repairAmount(big), 6);
  big.ascension = 3;
  assert.equal(repairAmount(big), 4);

  const up = enter(fresh("architect", 22), "forge");
  assert.ok(chooseForge(up, "upgrade").ok);
  assert.equal(up.phase, "forge", "choosing upgrade waits for a card");
  const index = up.deck.indexOf("router");
  assert.ok(upgradeDeckCard(up, index).ok);
  assert.equal(up.deck[index], "router+");
  assert.equal(up.phase, "map");
  const again = enter(fresh("architect", 22), "forge");
  again.deck[0] = "router+";
  assert.equal(upgradeDeckCard(again, 0).ok, false, "an upgraded card cannot be upgraded again");

  const trim = enter(fresh("architect", 23), "forge");
  trim.deck = ["router", "fiber", "fiber", "guard", "guard", "patch", "pulse", "inspect", "switch", "firewall", "cve"];
  assert.ok(removeDeckCard(trim, trim.deck.indexOf("cve")).ok, "curses are always removable");
  const keep = enter(fresh("architect", 23), "forge");
  keep.deck = ["router", "fiber", "fiber", "guard", "guard", "patch", "pulse", "inspect", "switch", "firewall", "resonance-field"];
  assert.equal(removeDeckCard(keep, keep.deck.indexOf("router")).ok, false, "keep one router");
  assert.equal(removeDeckCard(keep, keep.deck.indexOf("fiber")).ok, false, "keep two cabling cards");
  assert.ok(removeDeckCard(keep, keep.deck.indexOf("pulse")).ok);

  const salvage = enter(fresh("ghost", 24), "forge");
  const max = salvage.maxIntegrity;
  assert.ok(chooseForge(salvage, "relic").ok);
  assert.equal(salvage.maxIntegrity, max - SALVAGE_COST);
  assert.equal(salvage.phase, "relic");
  assert.ok(salvage.relicRewards.every(id => RELICS[id].tier === "common"));
});

test("the market sells priced cards and relics, and removes or upgrades once per visit", () => {
  const r = enter(fresh("architect", 31), "shop");
  const shop = r.shop!;
  assert.equal(r.phase, "shop");
  assert.equal(shop.cards.length, 6);
  assert.equal(shop.relics.length, 2);
  assert.deepEqual(shop.cards[0], { id: "router", price: ROUTER_PRICE, sold: false }, "the hardware bench stocks a Core Router");
  assert.equal(new Set(shop.cards.map(offer => baseCard(offer.id))).size, 6);
  for (const offer of shop.cards.slice(1)) {
    const base = CARDS[baseCard(offer.id)];
    const expected = CARD_PRICES[base.rarity as keyof typeof CARD_PRICES] + (isUpgraded(offer.id) ? 20 : 0);
    assert.ok(Math.abs(offer.price - expected) <= 5, `${offer.id} costs ${offer.price}`);
    assert.ok(!base.archetype || base.archetype === "architect");
  }
  assert.ok(shop.relics.every(offer => RELICS[offer.id].tier === "common" && offer.price >= 100 && offer.price <= 130));
  assert.equal(shop.removePrice, REMOVE_PRICE.base);
  assert.equal(shop.upgradePrice, UPGRADE_PRICE);

  r.credits = 10;
  assert.equal(buyCard(r, 0).ok, false, "credits are required");
  r.credits = 1000;
  const deck = r.deck.length;
  assert.ok(buyCard(r, 0).ok);
  assert.equal(r.deck.length, deck + 1);
  assert.equal(buyCard(r, 0).ok, false, "a sold card cannot be bought twice");
  assert.ok(buyRelic(r, 0).ok);
  assert.ok(r.relics.includes(shop.relics[0].id));
  const guard = r.deck.indexOf("guard");
  assert.ok(shopRemoveCard(r, guard).ok);
  assert.equal(r.removals, 1);
  assert.equal(shopRemoveCard(r, r.deck.indexOf("guard")).ok, false, "one removal per visit");
  const router = r.deck.indexOf("router");
  assert.ok(shopUpgradeCard(r, router).ok);
  assert.equal(r.deck[router], "router+");
  assert.equal(shopUpgradeCard(r, r.deck.indexOf("pulse")).ok, false, "one upgrade per visit");
  assert.ok(parseExpedition(JSON.stringify({ version: EXPEDITION_VERSION, run: r, archetype: "architect", startedAt: 1, recorded: false })));
  assert.ok(leaveShop(r).ok);
  assert.equal(r.phase, "map");
  assert.equal(r.shop, null);

  // A later market charges more for removal; Lean Markets raises every price.
  r.phase = "shop";
  openShop(r);
  assert.equal(r.shop!.removePrice, REMOVE_PRICE.base + REMOVE_PRICE.step);
  const lean = enter(fresh("warden", 31, 7), "shop");
  assert.equal(lean.shop!.upgradePrice, 50);
  assert.equal(lean.shop!.removePrice, 60);
});
