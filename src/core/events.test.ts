import test from "node:test";
import assert from "node:assert/strict";
import { EXPEDITION_VERSION, newExpedition, parseExpedition } from "./expedition.ts";
import { EVENTS, openEvent } from "./events.ts";
import { chooseRoom, chooseEvent, leaveEvent, eventView, eventCardChoices, grantVictory, chooseCardReward } from "./meta.ts";
import { encounterHealth } from "./map.ts";
import { eventRoom, planEncounter } from "./encounter.ts";
import { hostileName } from "./enemies.ts";
import { creditMultiplier } from "./ascension.ts";
import { CARDS, RELICS } from "./cards.ts";
import type { CardId, RunState } from "./types.ts";

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

test("every event offers two to four stated choices, and every available choice resolves", () => {
  const ids = Object.keys(EVENTS);
  assert.ok(ids.length >= 10);
  for (const id of ids) {
    const event = EVENTS[id];
    assert.ok(event.choices.length >= 2 && event.choices.length <= 4, id);
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
      assert.ok(parseExpedition(JSON.stringify({ version: EXPEDITION_VERSION, run, archetype: "architect", startedAt: 1, recorded: false })), `${id}/${choice} saves`);
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
  const picks = mirror.event!.picks!.slice(0, 2);
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
    if (EVENTS[id].story) story[stage] = (story[stage] ?? 0) + 1;
  }
  assert.ok(Object.keys(story).length === 3, "each stage has its story beat");
  assert.deepEqual([0, 1, 2].map(stage => Object.values(EVENTS).filter(event => event.story && event.stage === stage).length), [1, 1, 1]);
});

// ---------------------------------------------------------------- v5 · curses as a price (contract section 8)

const CURSE_NAMES = ["CVE", "Zombie Process", "Kernel Panic", "Backdoor", "Bitrot", "Memory Leak"];
/** Every choice that adds a curse names it; every curse choice resolves into exactly that curse. */
function takesCurse(id: string, choice: number, curse: CardId, seed = 12, stage = EVENTS[id].stage ?? 0) {
  const run = atEvent(seed, id, stage);
  const view = eventView(run)!;
  assert.match(view.choices[choice].detail, new RegExp(`Add an? ${CARDS[curse].name} curse\\.`), `${id}/${choice} names its curse`);
  assert.equal(view.choices[choice].disabled, undefined, `${id}/${choice} is open`);
  const deck = [...run.deck];
  const result = chooseEvent(run, choice);
  assert.ok(result.ok, result.message);
  assert.match(result.message, new RegExp(CARDS[curse].name));
  assert.equal(run.deck.filter(card => card === curse).length, deck.filter(card => card === curse).length + 1);
  return { run, view, deck };
}

test("The Firmware Mirror: the unsigned build upgrades three named cards and adds a Bitrot", () => {
  const { run, view, deck } = takesCurse("firmware-mirror", 2, "bitrot");
  assert.equal(view.choices.at(-1)!.label, "Walk on");
  const picks = [...run.event!.picks!].sort((a, b) => a - b);
  assert.equal(picks.length, 3);
  const names = picks.map(i => CARDS[deck[i]].name);
  assert.equal(view.choices[2].detail, `Upgrade ${names[0]}, ${names[1]} and ${names[2]}. Add a Bitrot curse.`);
  for (const i of picks) assert.equal(run.deck[i], `${deck[i]}+`);
  assert.equal(run.integrity, atEvent(12, "firmware-mirror").integrity, "no integrity cost");
  // Flash everything names (and upgrades) the first two of the same seeded picks.
  const flash = atEvent(12, "firmware-mirror");
  const two = flash.event!.picks!.slice(0, 2).sort((a, b) => a - b);
  assert.equal(eventView(flash)!.choices[0].detail, `Upgrade ${two.map(i => CARDS[flash.deck[i]].name).join(" and ")}. Lose 3 integrity.`);
  // Nothing to upgrade: closed, with the reason.
  const bare = atEvent(12, "firmware-mirror");
  bare.deck = bare.deck.map(id => CARDS[`${id}+` as CardId] ? `${id}+` as CardId : id);
  EVENTS["firmware-mirror"].prepare!(bare, bare.event!);
  assert.equal(eventView(bare)!.choices[2].disabled, "Nothing in your deck can be improved.");
});

test("The Quiet Broker: a named rare card for nothing, with a Backdoor in it", () => {
  const { run, view } = takesCurse("quiet-broker", 2, "backdoor");
  const [uncommon, rare] = run.event!.cards!;
  assert.equal(CARDS[uncommon].rarity, "uncommon");
  assert.equal(CARDS[rare].rarity, "rare");
  assert.equal(view.choices[2].label, `Take ${CARDS[rare].name} for nothing`);
  assert.equal(view.choices[1].label, `Buy ${CARDS[uncommon].name}`);
  assert.ok(run.deck.includes(rare));
  assert.equal(run.credits, 200, "it costs no credits");
});

test("Cold Storage: the named relic with a Memory Leak instead of maximum integrity", () => {
  const { run, view } = takesCurse("cold-storage", 1, "memory-leak");
  const relic = run.event!.relic!;
  assert.equal(view.choices[1].detail, `Gain ${RELICS[relic].name}. Add a Memory Leak curse.`);
  assert.ok(run.relics.includes(relic));
  assert.equal(run.maxIntegrity, atEvent(12, "cold-storage").maxIntegrity, "no integrity cost");
  const empty = atEvent(12, "cold-storage");
  empty.event!.relic = undefined;
  assert.equal(eventView(empty)!.choices[1].disabled, "The vault is empty.");
});

test("The Zombie Farm (stage II): credits with a Zombie Process, or integrity to kill a named curse", () => {
  const farm = EVENTS["zombie-farm"];
  assert.deepEqual([farm.stage, farm.story, farm.choices.length], [1, undefined, 3]);
  // Only in stage II, and never a story beat's triple weight.
  let met = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const stage = seed % 3;
    const run = atEvent(seed, undefined, stage);
    for (let i = 0; i < 6 && run.event!.id !== "zombie-farm"; i++) openEvent(run);
    if (run.event!.id === "zombie-farm") { assert.equal(stage, 1, `seed ${seed}`); met++; }
  }
  assert.ok(met > 0, "it does appear in stage II");
  const { run } = takesCurse("zombie-farm", 0, "zombie-process");
  assert.equal(run.credits, 200 + 60);
  const a2 = atEvent(12, "zombie-farm", 1);
  a2.ascension = 2;
  assert.match(eventView(a2)!.choices[0].detail, new RegExp(`Gain ${Math.round(60 * creditMultiplier(2))} credits`), "credits follow the ascension multiplier");
  // No curse: the kill is closed, with a reason.
  const clean = atEvent(12, "zombie-farm", 1);
  assert.equal(eventView(clean)!.choices[1].disabled, "You carry no curse.");
  assert.equal(chooseEvent(clean, 1).ok, false);
  // A curse: named in the label and detail, removed for 3 integrity.
  const cursed = atEvent(12, "zombie-farm", 1);
  cursed.deck.push("guard", "bitrot", "guard", "backdoor");
  EVENTS["zombie-farm"].prepare!(cursed, cursed.event!);
  const target = cursed.deck[cursed.event!.picks![0]];
  assert.ok(CARDS[target].curse);
  const view = eventView(cursed)!;
  assert.equal(view.choices[1].label, `Kill ${CARDS[target].name}`);
  assert.equal(view.choices[1].detail, `Lose 3 integrity. Remove ${CARDS[target].name} from your deck.`);
  const integrity = cursed.integrity, count = cursed.deck.length;
  const killed = chooseEvent(cursed, 1);
  assert.ok(killed.ok);
  assert.match(killed.message, new RegExp(`${CARDS[target].name} is gone from your deck`));
  assert.deepEqual([cursed.integrity, cursed.deck.length], [integrity - 3, count - 1]);
  assert.equal(cursed.deck.filter(id => CARDS[id].curse).length, 1);
  // Too damaged: closed.
  const weak = atEvent(12, "zombie-farm", 1);
  weak.deck.push("cve");
  EVENTS["zombie-farm"].prepare!(weak, weak.event!);
  weak.integrity = 3;
  assert.equal(eventView(weak)!.choices[1].disabled, "You are too damaged to fight it.");
  assert.equal(eventView(weak)!.choices[2].label, "Walk on");
});

test("every curse an event hands out is named where the choice is made", () => {
  for (const [id, event] of Object.entries(EVENTS)) {
    const run = atEvent(21, id, event.stage ?? 0);
    const view = eventView(run)!;
    event.choices.forEach((choice, i) => {
      const trial = structuredClone(run);
      if (view.choices[i].disabled || /^Answer/.test(view.choices[i].label)) return;
      const before = trial.deck.filter(card => CARDS[card].curse).length;
      assert.ok(chooseEvent(trial, i, view.choices[i].needsCard ? eventCardChoices(trial, i)[0] : undefined).ok, `${id}/${i}`);
      const gained = trial.deck.filter(card => CARDS[card].curse).length - before;
      if (gained > 0) assert.ok(CURSE_NAMES.some(name => view.choices[i].detail.includes(`${name} curse`)), `${id}/${i}: ${view.choices[i].detail}`);
    });
  }
});

test("The Echo Chamber: duplicate a card for nothing and take a Kernel Panic (the curse named in the label)", () => {
  const run = atEvent(14, "echo-chamber");
  const view = eventView(run)!;
  assert.deepEqual(view.choices.map(choice => choice.label), ["Make an echo", "Echo for nothing, take a Kernel Panic", "Listen"], "the safe choice stays last");
  assert.equal(view.choices[1].detail, "Duplicate a card in your deck for nothing. Add a Kernel Panic curse.");
  assert.equal(view.choices[1].needsCard, "duplicate", "the same picker as the paid echo");
  assert.equal(chooseEvent(run, 1).ok, false, "it needs a card");
  run.deck.push("backdoor");
  assert.equal(chooseEvent(run, 1, run.deck.length - 1).ok, false, "curses cannot be duplicated");
  run.deck.pop();
  const credits = run.credits, card = run.deck[0], copies = run.deck.filter(id => id === card).length;
  const result = chooseEvent(run, 1, 0);
  assert.ok(result.ok);
  assert.match(result.message, /Kernel Panic joins your deck/);
  assert.equal(run.deck.filter(id => id === card).length, copies + 1);
  assert.equal(run.deck.filter(id => id === "kernel-panic").length, 1);
  assert.equal(run.credits, credits, "for nothing");
  // Broke: the paid echo is closed, the free one is not.
  const broke = atEvent(14, "echo-chamber");
  broke.credits = 0;
  const closed = eventView(broke)!;
  assert.ok(closed.choices[0].disabled && !closed.choices[1].disabled);
});
