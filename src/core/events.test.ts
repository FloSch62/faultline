import test from "node:test";
import assert from "node:assert/strict";
import { EXPEDITION_VERSION, newExpedition, parseExpedition } from "./expedition.ts";
import { EVENTS, openEvent } from "./events.ts";
import { chooseRoom, chooseEvent, leaveEvent, eventView, eventCardChoices, grantVictory, chooseCardReward } from "./meta.ts";
import { encounterHealth } from "./map.ts";
import { eventRoom, planEncounter } from "./encounter.ts";
import { hostileName } from "./enemies.ts";
import { CARDS } from "./cards.ts";
import type { RunState } from "./types.ts";

/** Enters the floor-1 Unknown signal, optionally forcing a specific event. */
function atEvent(seed: number, id?: string, stage = 0): RunState {
  const run = newExpedition("architect", Math.imul(seed, 0x9e3779b1) >>> 0).run;
  run.stage = stage;
  run.credits = 200;
  run.floor = 1;
  const room = run.map.find(item => item.floor === 1 && item.type === "event")!;
  assert.ok(chooseRoom(run, room.id).ok);
  assert.equal(run.phase, "event");
  if (id) {
    run.event = { id, resolved: false };
    EVENTS[id].prepare?.(run, run.event);
  }
  return run;
}

test("every event offers two or three stated choices, and every available choice resolves", () => {
  const ids = Object.keys(EVENTS);
  assert.ok(ids.length >= 10);
  for (const id of ids) {
    const event = EVENTS[id];
    assert.ok(event.choices.length >= 2 && event.choices.length <= 3, id);
    for (let choice = 0; choice < event.choices.length; choice++) {
      const run = atEvent(40 + choice, id, event.stage ?? 0);
      run.relics.push("cold-start");
      if (id === "quiet-broker") EVENTS[id].prepare?.(run, run.event!);
      const view = eventView(run)!;
      assert.equal(view.title, event.title);
      assert.ok(view.text.length > 60);
      const option = view.choices[choice];
      assert.ok(option.label && option.detail, `${id}/${choice} is described`);
      if (option.disabled) continue;
      const cards = eventCardChoices(run, choice);
      if (option.needsCard) {
        assert.ok(cards.length > 0, `${id}/${choice} has a valid card`);
        assert.equal(chooseEvent(run, choice).ok, false, "a card choice needs a card");
      }
      const result = chooseEvent(run, choice, option.needsCard ? cards[0] : undefined);
      assert.ok(result.ok, `${id}/${choice}: ${result.message}`);
      assert.ok(run.integrity >= 0 && run.integrity <= run.maxIntegrity);
      assert.ok(run.deck.every(card => Object.hasOwn(CARDS, card)));
      if (run.phase === "battle") continue;
      assert.equal(run.event!.resolved, true);
      assert.equal(run.event!.outcome, result.message);
      assert.equal(chooseEvent(run, choice).ok, false, "an answered event cannot be answered again");
      assert.ok(parseExpedition(JSON.stringify({ version: EXPEDITION_VERSION, run, archetype: "architect", daily: false, startedAt: 1, recorded: false })), `${id}/${choice} saves`);
      assert.ok(leaveEvent(run).ok);
      assert.equal(run.phase, "map");
      assert.equal(run.event, null);
    }
  }
});

test("choices state exactly what they give", () => {
  const server = atEvent(3, "unpatched-server");
  const card = server.event!.cards![0];
  assert.equal(CARDS[card].rarity, "rare");
  assert.match(eventView(server)!.choices[0].detail, new RegExp(CARDS[card].name));
  chooseEvent(server, 0);
  assert.ok(server.deck.includes(card) && server.deck.includes("cve"));

  const mirror = atEvent(4, "firmware-mirror");
  const picks = mirror.event!.picks!;
  const before = picks.map(i => mirror.deck[i]);
  chooseEvent(mirror, 0);
  assert.deepEqual(picks.map(i => mirror.deck[i]), before.map(id => `${id}+`));

  const storage = atEvent(5, "cold-storage");
  const relic = storage.event!.relic!;
  const max = storage.maxIntegrity;
  chooseEvent(storage, 0);
  assert.equal(storage.maxIntegrity, max - 2);
  assert.ok(storage.relics.includes(relic));

  const echo = atEvent(6, "echo-chamber");
  const credits = echo.credits;
  assert.equal(chooseEvent(echo, 0, echo.deck.length + 3).ok, false);
  echo.deck.push("cve");
  assert.equal(chooseEvent(echo, 0, echo.deck.length - 1).ok, false, "curses cannot be duplicated");
  assert.ok(chooseEvent(echo, 0, 0).ok);
  assert.equal(echo.credits, credits - 30);
  assert.equal(echo.deck.filter(id => id === echo.deck[0]).length >= 2, true);
});

test("Signal in the Static is an optional empowered fight with an elite-like reward", () => {
  const run = atEvent(7, "signal-in-the-static");
  const enemyId = run.event!.enemyId!;
  const credits = run.credits;
  const room = run.map.find(item => item.id === run.currentRoom)!;
  assert.match(eventView(run)!.choices[0].detail, new RegExp(`Fight ${hostileName(enemyId)} with 40% more integrity`));
  assert.ok(chooseEvent(run, 0).ok);
  assert.equal(run.phase, "battle");
  // Stage I, floor 2: too early for a pack or a ribbon, so the event's hostile fights alone.
  assert.deepEqual(run.enemies.map(enemy => enemy.id), [enemyId]);
  assert.equal(run.enemies[0].maxHp, Math.round(encounterHealth(0, { ...room, type: "battle" }) * 1.4));
  grantVictory(run);
  assert.equal(run.credits, credits + 40);
  assert.notEqual(CARDS[run.cardRewards[0]].rarity, "common", "an event fight rewards like an elite: uncommon or better first");
  chooseCardReward(run, null);
  assert.equal(run.phase, "map", "event fights never offer a relic");
  assert.equal(run.event, null);
});

test("Signal in the Static rolls packs and designations like the stage's normals", () => {
  let packs = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const run = atEvent(seed, "signal-in-the-static", 2);
    const room = run.map.find(item => item.id === run.currentRoom)!;
    const fight = eventRoom(run, room, run.event!.enemyId!);
    const plan = planEncounter(run, fight);
    const detail = eventView(run)!.choices[0].detail;
    for (const id of [fight.enemyId, ...(fight.pack ?? [])].filter(Boolean)) assert.match(detail, new RegExp(hostileName(id!)), "the choice names every member");
    if (fight.designationHidden) assert.match(detail, /unknown designation/);
    const credits = run.credits;
    assert.ok(chooseEvent(run, 0).ok);
    assert.deepEqual(run.enemies.map(enemy => [enemy.id, enemy.port, enemy.maxHp]), plan.enemies.map(enemy => [enemy.id, enemy.port, enemy.maxHp]));
    const total = plan.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0);
    assert.equal(encounterHealth(2, fight), Math.round(encounterHealth(2, { ...room, type: "battle" }) * 1.4), "event fights carry 40% more health");
    if (!fight.pack) assert.equal(total, Math.round(encounterHealth(2, fight) * (fight.designations?.includes("hardened") ? 1.2 : 1)));
    if (fight.pack) packs++;
    grantVictory(run);
    assert.equal(run.credits, credits + 40 + plan.credits.reduce((sum, line) => sum + line.amount, 0), "pack and ribbon credits are paid too");
  }
  assert.ok(packs >= 10, `${packs} of 40 event fights were packs`);
});

test("events never repeat within an expedition and story beats stay in their stage", () => {
  const run = atEvent(9);
  const seen = new Set<string>([run.event!.id]);
  for (let i = 0; i < 12; i++) {
    run.stage = i % 3;
    openEvent(run);
    const event = EVENTS[run.event!.id];
    assert.ok(event.stage === undefined || event.stage === run.stage, `${event.id} in stage ${run.stage}`);
    if (seen.size < Object.keys(EVENTS).length - 2) assert.ok(!seen.has(event.id), `${event.id} repeated`);
    seen.add(event.id);
  }
  assert.ok(run.seenEvents!.length >= 10);
  const story: Record<number, number> = {};
  for (let seed = 1; seed <= 90; seed++) {
    const stage = seed % 3;
    const id = atEvent(seed, undefined, stage).event!.id;
    if (EVENTS[id].stage !== undefined) story[stage] = (story[stage] ?? 0) + 1;
  }
  assert.ok(Object.keys(story).length === 3, "each stage has its story beat");
});
