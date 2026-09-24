import test from "node:test";
import assert from "node:assert/strict";
import { CARDS, RELICS, REWARD_POOL, RULES, offeredTo } from "./cards.ts";
import {
  ADD_IDS, DESIGNATIONS, DESIGNATION_IDS, ENEMIES, ESCORT_IDS, ESCORT_THREAT, MESSAGE_OPTIONS, PACKS, REINFORCEMENT_ESCORTS,
  SHED_SPAWN, SIGNALS, SIGNAL_IDS, compositionAllowed, designationRule, eligibleDesignations, hostileName, threatBudget,
} from "./enemies.ts";
import { STAGES } from "./stages.ts";
import { ASCENSION_LEVELS } from "./ascension.ts";
import { enemyStory, MESSAGE_FRAGMENTS, designationEntranceLine, reinforcementEntranceLine } from "../story.ts";
import { CARD_INSIGHTS } from "../card-insights.ts";
import type { BaseCardId, CardId, IntentKind } from "./types.ts";

const KINDS: IntentKind[] = ["strike", "sever", "jam", "breach", "corrupt", "charge", "overload", "install", "dormant"];
const INSTALLS = ["tap", "jammer", "spike", "anchor", "breaker"];
const NEW_LEADERS = ["foreman", "nest", "demolition", "blight"];
const NEW_CARDS: BaseCardId[] = [
  "broadcast-storm", "traffic-shaping", "flood-fill", "bulkhead", "spearhead", "packet-storm", "quorum",
  "server-rack", "redundant-psu", "sentry-firewall", "demolition-charge", "field-repair", "rapid-redeploy", "phantom-node",
];
const reach = RULES.reach.toFixed(1);

test("the v4 roster: seven escorts, three adds and four leaders, each with art, story, pattern, trait and badge", () => {
  assert.deepEqual(ESCORT_IDS, ["spark-mite", "splicer", "relay-drone", "ward-node", "tap-spinner", "glass-echo", "rigger-drone"]);
  assert.deepEqual(ADD_IDS, ["gate-warden", "chorister", "quarantine-drone"]);
  const sheets: Record<string, [string, number, number, string[]]> = {
    escort: ["hostiles-escorts", 4, 2, ESCORT_IDS],
    add: ["hostiles-adds", 3, 1, ADD_IDS],
    hostile: ["hostiles-front", 4, 1, NEW_LEADERS],
  };
  for (const [kind, [file, columns, rows, ids]] of Object.entries(sheets)) ids.forEach((id, index) => {
    const definition = ENEMIES[id];
    assert.equal(definition.kind, kind, id);
    assert.deepEqual(definition.art, { file, columns, rows, index }, `${id} art`);
  });
  for (const [id, definition] of Object.entries(ENEMIES)) {
    assert.equal(definition.id, id);
    assert.ok(definition.pattern.length >= 1, `${id} pattern`);
    for (const step of definition.pattern) {
      assert.ok(KINDS.includes(step.kind) && step.kind !== "dormant", `${id} ${step.kind}: DORMANT comes from the engine`);
      assert.equal(step.kind === "install", !!step.install && INSTALLS.includes(step.install), `${id} ${step.label} install kind`);
      assert.ok(step.label.length > 2 && step.label === step.label.toUpperCase(), `${id} label`);
    }
    assert.ok(definition.trait.length > 20, `${id} trait`);
    assert.ok(definition.badge && definition.badge !== "HOSTILE", `${id} badge`);
    const story = enemyStory(id);
    assert.ok(story, `${id} has a story`);
    assert.equal(story!.name, hostileName(id), `${id} story name`);
    assert.ok(story!.motive.length > 60 && story!.counterplay.length > 40 && story!.defeated.length > 20, `${id} story copy`);
    for (const kind of new Set(definition.pattern.map(step => step.kind)))
      assert.ok(story!.telegraphs[kind], `${id} telegraphs ${kind}`);
    if (definition.kind === "escort") assert.ok(story!.telegraphs.dormant, `${id} telegraphs its dormant phase`);
    if (definition.kind !== "hostile") {
      assert.ok(!definition.boss && !definition.enrages && !definition.allowedDesignations, `${id} never escalates or carries designations`);
      assert.ok(definition.pattern.every(step => !step.ultimate && step.kind !== "charge"), `${id} has no charge`);
    }
  }
  // Adds: raised by their guardian, fixed health.
  assert.deepEqual(ADD_IDS.map(id => [ENEMIES[id].addOf, ENEMIES[id].addHealth]), [["regent", 8], ["cantor", 10], ["core", 14]]);
  // Changes to existing hostiles.
  assert.deepEqual(ENEMIES.weaver.pattern.map(step => step.kind), ["sever", "overload", "strike"]);
  assert.equal(ENEMIES.weaver.pattern[1].label, "OVERTENSION");
  assert.deepEqual(ENEMIES.leech.pattern[1], { kind: "install", install: "tap", label: "SIPHON TAP", amount: 0 });
  assert.equal(ENEMIES.core.enragedInstall, "tap");
  assert.ok(Object.values(ENEMIES).every(definition => !definition.pattern.some(step => (step.kind as string) === "infect")));
  // Heavy machines lead packs only in elite rooms.
  assert.deepEqual(Object.keys(ENEMIES).filter(id => ENEMIES[id].heavy).sort(), ["colossus", "demolition", "foreman", "marshal", "reaver", "sentinel"]);
});

test("stage pools gain the table-front leaders and every pooled hostile can be scouted", () => {
  assert.ok(STAGES[1].encounters.includes("nest") && STAGES[1].elites.includes("foreman"));
  assert.ok(STAGES[2].encounters.includes("nest") && STAGES[2].encounters.includes("blight"));
  assert.ok(STAGES[2].elites.includes("foreman") && STAGES[2].elites.includes("demolition"));
  for (const stage of STAGES) for (const id of [...stage.encounters, ...stage.elites, stage.boss]) {
    assert.equal(ENEMIES[id].kind, "hostile", id);
    assert.ok(enemyStory(id), id);
  }
});

test("pack templates fit the threat budget, follow the composition rules and name real leaders", () => {
  for (const template of PACKS) {
    const where = `${template.stage}/${template.room}/${template.leader}+${template.escorts.join("+")}`;
    assert.ok(template.escorts.every(id => ENEMIES[id].kind === "escort"), where);
    assert.ok(compositionAllowed(template.escorts), `${where} composition`);
    if (template.leader) {
      const leader = ENEMIES[template.leader];
      assert.ok(leader.kind === "hostile" && !leader.boss, `${where} leader`);
      if (leader.heavy) assert.equal(template.room, "elite", `${where}: heavy machines lead only elites`);
      assert.ok(template.escorts.length === 1 || (template.escorts.length === 2 && template.stage === 2 && template.room === "battle"), `${where} shape`);
    } else assert.ok(template.stage === 0 && template.escorts.length === 2, `${where}: only stage I duos have no leader`);
    if (template.stage === 0) assert.ok(template.escorts.every(id => ["spark-mite", "splicer"].includes(id)));
    if (template.stage === 1) assert.ok(template.escorts.every(id => !["rigger-drone"].includes(id)), `${where}: Rigger Drones are stage III`);
    const budget = threatBudget(template.stage, template.room);
    // Null Storm + Splicer is the design's one template over budget (10.75 against 10.5, "the first tuning candidate").
    const over = template.leader === "storm" && template.escorts[0] === "splicer" ? 0.25 : 0;
    assert.ok(template.threat <= budget + over, `${where} threat ${template.threat} > ${budget}`);
    assert.ok(template.headroom >= 0 && template.headroom <= 2, `${where} headroom`);
    // Headroom is the bad weight the template can still carry (rounded to the design's half steps).
    assert.ok(template.threat + template.headroom <= budget + over + 0.1, `${where} headroom fits`);
  }
  // Every stage II and III elite in the pools leads exactly one elite template.
  for (const stage of [1, 2]) for (const id of STAGES[stage].elites)
    assert.equal(PACKS.filter(item => item.stage === stage && item.room === "elite" && item.leader === id).length, 1, `${stage}/${id}`);
  assert.equal(PACKS.filter(item => item.stage === 0 && item.room === "elite").length, 0, "stage I elites fight alone");
  // Escort threat scores and the reinforcement tables.
  assert.deepEqual(Object.keys(ESCORT_THREAT).sort(), [...ESCORT_IDS].sort());
  assert.deepEqual(REINFORCEMENT_ESCORTS.map(list => list.length), [0, 3, 5]);
  assert.deepEqual(SHED_SPAWN, ["spark-mite", "splicer", "ward-node"]);
  // Composition: never two Splicers, a trio never pairs a Splicer with a Ward Node, an escort at most twice.
  assert.equal(compositionAllowed(["splicer", "splicer"]), false);
  assert.equal(compositionAllowed(["splicer", "ward-node"]), false);
  assert.equal(compositionAllowed(["glass-echo", "glass-echo"]), true);
  assert.equal(compositionAllowed(["glass-echo", "glass-echo", "glass-echo"]), false);
});

test("designations: ten ribbons, eligibility by section 9.4 and the 12.3 exclusions", () => {
  assert.equal(DESIGNATION_IDS.length, 10);
  assert.deepEqual(DESIGNATION_IDS.filter(id => DESIGNATIONS[id].kind === "good"), ["laden", "salvaged"]);
  for (const id of DESIGNATION_IDS) {
    const designation = DESIGNATIONS[id];
    assert.equal(designation.ribbon, id.toUpperCase());
    assert.ok(designation.rule.length > 20 && designation.flavour.length > 30, id);
    assert.equal(designation.weight, designation.kind === "good" ? 1.5 : 1);
    assert.equal(designation.threat, designation.kind === "good" ? 0 : ["stoked", "shedding"].includes(id) ? 2 : 1.5);
  }
  const hostiles = Object.keys(ENEMIES).filter(id => ENEMIES[id].kind === "hostile" && !ENEMIES[id].boss);
  for (const id of hostiles) {
    const allowed = ENEMIES[id].allowedDesignations!;
    assert.ok(allowed.includes("laden") && allowed.includes("salvaged"), `${id} can carry cargo`);
    assert.equal(allowed.includes("armored"), !ENEMIES[id].armor, `${id}: Armored only without armor or plating`);
    const cuts = ENEMIES[id].pattern.some(step => step.kind === "sever");
    if (allowed.includes("rigged")) assert.ok(cuts, `${id}: Rigged needs a cut`);
  }
  for (const [id, designation] of [["leech", "nesting"], ["nest", "nesting"], ["leech", "hungry"], ["nest", "hungry"], ["reaver", "shedding"]] as const)
    assert.ok(!ENEMIES[id].allowedDesignations!.includes(designation), `${id} never ${designation}`);
  for (const id of ["regent", "cantor", "core", ...ESCORT_IDS, ...ADD_IDS]) assert.deepEqual(eligibleDesignations(id, 2, true), [], `${id} carries none`);
  // Stage rules: Spiteful stage III only, Stoked and Rigged from stage II, Shedding needs an empty port.
  assert.ok(!eligibleDesignations("serpent", 0, true).some(id => ["spiteful", "stoked", "rigged"].includes(id)));
  assert.ok(eligibleDesignations("serpent", 1, true).includes("stoked") && eligibleDesignations("serpent", 1, true).includes("rigged"));
  assert.ok(!eligibleDesignations("serpent", 1, true).includes("spiteful"));
  assert.ok(eligibleDesignations("serpent", 2, true).includes("spiteful"));
  assert.ok(!eligibleDesignations("serpent", 2, false).includes("shedding"));
  // Plate lines read RULES and name the stage's details.
  assert.match(DESIGNATIONS.hardened.rule, new RegExp(`\\+${Math.round(RULES.hardenedHealth * 100)} % health; its strikes deal ${RULES.hardenedStrike} less`));
  assert.match(DESIGNATIONS.armored.rule, new RegExp(`absorbs ${RULES.armoredPlating} `));
  assert.match(DESIGNATIONS.hungry.rule, new RegExp(`Heals ${RULES.hungryHeal} `));
  assert.match(designationRule("shedding", 0), /Spark Mite/);
  assert.match(designationRule("shedding", 1), /Splicer/);
  assert.match(designationRule("shedding", 2), /Ward Node/);
  assert.match(designationRule("nesting", 2), /Jammer/);
  assert.match(designationRule("stoked", 2), new RegExp(`${RULES.stokedAdvanceLate} actions sooner`));
  assert.equal(designationEntranceLine("nesting", 0), "NESTING · its first action also plants a Siphon Tap at the forecast socket");
  assert.match(designationEntranceLine("laden", 1), /^LADEN · carries an undelivered message/);
  assert.equal(reinforcementEntranceLine("Splicer", 2), "SIGNAL DETECTED · a Splicer arrives in 2 actions");
});

test("signals, message options and message fragments are complete", () => {
  assert.deepEqual(SIGNAL_IDS, ["relay-flicker", "cold-start", "resync", "interference", "collapse", "surge"]);
  assert.equal(SIGNAL_IDS.filter(id => SIGNALS[id].kind === "good").length, 3);
  for (const id of SIGNAL_IDS) {
    assert.ok(SIGNALS[id].announce.includes("{target}") && SIGNALS[id].announce.includes("if the fight lasts"), id);
    assert.ok(SIGNALS[id].rule.length > 20);
  }
  assert.match(SIGNALS.interference.rule, new RegExp(`−${RULES.suppressionPenalty} `));
  assert.match(SIGNALS["relay-flicker"].rule, new RegExp(`\\+${RULES.resonanceDamage} `));
  assert.deepEqual(Object.fromEntries(Object.entries(MESSAGE_OPTIONS).map(([id, option]) => [id, option.weight])),
    { restore: 3, reinforce: 1, credit: 3, recover: 2, purge: 2 });
  assert.match(MESSAGE_OPTIONS.restore.rule, new RegExp(`Restore ${RULES.messageRestore} integrity`));
  assert.match(MESSAGE_OPTIONS.credit.rule, new RegExp(`${RULES.messageCredits} credits`));
  assert.ok(MESSAGE_FRAGMENTS.length >= 12);
  assert.equal(new Set(MESSAGE_FRAGMENTS.map(fragment => fragment.text)).size, MESSAGE_FRAGMENTS.length);
  assert.ok(MESSAGE_FRAGMENTS.every(fragment => fragment.sender.length > 3 && fragment.text.length > 20));
});

test("the fourteen v4 cards (v5 costs): cost, rarity, target, pool, upgrade, values and insight", () => {
  const spec: Record<string, [cost: number, rarity: string, target: string, archetype: string | undefined, plusCost: number]> = {
    "broadcast-storm": [1, "uncommon", "instant", undefined, 1],
    "traffic-shaping": [0, "common", "instant", undefined, 0],
    "flood-fill": [1, "uncommon", "instant", "architect", 1],
    bulkhead: [1, "uncommon", "instant", "warden", 1],
    spearhead: [1, "uncommon", "instant", "ghost", 0],
    "packet-storm": [2, "rare", "instant", undefined, 2],
    quorum: [1, "common", "instant", undefined, 1],
    "server-rack": [1, "uncommon", "ground", undefined, 0],
    "redundant-psu": [1, "common", "node", undefined, 0],
    "sentry-firewall": [1, "uncommon", "ground", "warden", 1],
    "demolition-charge": [1, "common", "instant", undefined, 1],
    "field-repair": [0, "common", "instant", undefined, 0],
    "rapid-redeploy": [1, "uncommon", "instant", "architect", 1],
    "phantom-node": [0, "uncommon", "ground", "ghost", 0],
  };
  assert.deepEqual(Object.keys(spec), NEW_CARDS);
  for (const id of NEW_CARDS) {
    const [cost, rarity, target, archetype, plusCost] = spec[id];
    const card = CARDS[id], plus = CARDS[`${id}+` as CardId];
    assert.ok(card && plus, `${id} has a + version`);
    assert.deepEqual([card.cost, card.rarity, card.target, card.archetype, plus.cost], [cost, rarity, target, archetype, plusCost], id);
    assert.ok(REWARD_POOL.includes(id), `${id} is a reward`);
    assert.ok(CARD_INSIGHTS[id] && CARD_INSIGHTS[id]!.length > 40, `${id} insight`);
    assert.ok(card.rules !== plus.rules || card.cost !== plus.cost, `${id}+ improves the card`);
    // Every card-specific number the engine reads is printed on the card.
    for (const [key, value] of Object.entries(plus.values))
      if (!["recover", "discount", "absorbs"].includes(key) && typeof value === "number")
        assert.ok(plus.rules.includes(String(value)), `${id}+ prints ${key} ${value}`);
    for (const [key, value] of Object.entries(card.values))
      if (!["recover", "discount", "absorbs"].includes(key) && typeof value === "number")
        assert.ok(card.rules.includes(String(value)), `${id} prints ${key} ${value}`);
  }
  assert.deepEqual([CARDS["server-rack"].role, CARDS["phantom-node"].role, CARDS["sentry-firewall"].role], ["rack", "phantom", "firewall"]);
  assert.ok(offeredTo("flood-fill", "architect") && !offeredTo("flood-fill", "ghost"));
  assert.ok(offeredTo("phantom-node", "ghost") && !offeredTo("phantom-node", "warden"));
  // Exhaust exactly where the design says.
  assert.deepEqual(NEW_CARDS.filter(id => CARDS[id].exhaust),
    ["traffic-shaping", "packet-storm", "redundant-psu", "demolition-charge", "field-repair", "rapid-redeploy", "phantom-node"]);
  // The values the engine keys on.
  assert.deepEqual(CARDS["broadcast-storm"].values, { everyPort: 2 });
  assert.deepEqual(CARDS["packet-storm+"].values, { everyPort: 7 });
  assert.deepEqual(Object.keys(CARDS["flood-fill+"].values), ["perChannelEveryPort"]);
  assert.ok(CARDS["flood-fill+"].values.perChannelEveryPort! > CARDS["flood-fill"].values.perChannelEveryPort!, "the upgrade hits harder (tuned numbers: docs/balance-v5.json)");
  assert.deepEqual(CARDS["traffic-shaping"].values, { focusBonus: 2, draw: 1 });
  assert.deepEqual(CARDS["traffic-shaping+"].values, { focusBonus: 4, draw: 1 });
  assert.deepEqual(CARDS["demolition-charge+"].values, { focusBonus: 4 });
  assert.deepEqual(CARDS.quorum.values, { block: 3, perHostile: 2, draw: 1 });
  assert.deepEqual(CARDS.bulkhead.values, { block: 3, firewallBonus: 1 });
  assert.deepEqual(CARDS["phantom-node+"].values, { absorbs: 2 });
  assert.deepEqual(CARDS["rapid-redeploy+"].values, { recover: 1, discount: 1, draw: 1 });
});

test("card, relic, trait and plate text read the numbers from RULES", () => {
  // v5: a face stays short; the rest of a card's numbers are in its detail.
  const text = (id: CardId) => `${CARDS[id].rules} ${CARDS[id].detail ?? ""}`;
  const reads: [string, (string | number)[]][] = [
    [text("server-rack"), [reach, RULES.rackCondition]],
    [text("redundant-psu"), [RULES.psuCondition]],
    [text("sentry-firewall"), [RULES.sentryQuarantine, RULES.quarantineDamage, RULES.sentryReclaimBonus, RULES.firewallBreachBlock]],
    [text("honeypot"), [RULES.honeypotDamage, reach, RULES.honeypotBite]],
    [CARDS.patch.rules, [RULES.faultClearRepair]],
    [CARDS.reroute.rules, [RULES.faultClearRepair]],
    [CARDS.protocol.rules, [RULES.faultClearRepair]],
    [RELICS["round-robin"].rules, [RULES.roundRobinDamage]],
    [RELICS["ingress-filter"].rules, [RULES.ingressFilterReduce]],
    [RELICS["priority-queue"].rules, [RULES.priorityQueueBonus]],
    [RELICS["reinforced-frame"].rules, [RULES.reinforcedFrameCondition, RULES.deviceCondition + RULES.reinforcedFrameCondition]],
    [RELICS["storm-control"].rules, [RULES.stormControlDamage]],
    [RELICS["scorched-earth"].rules, [RULES.scorchedEarthDamage, RULES.scorchedEarthCondition]],
    [ENEMIES["spark-mite"].trait, [RULES.swarmBonus]],
    [ENEMIES.splicer.trait, [RULES.twinCut]],
    [ENEMIES["relay-drone"].trait, [RULES.uplinkBonus]],
    [ENEMIES["ward-node"].trait, [RULES.wardPlating]],
    [ENEMIES["tap-spinner"].trait, [RULES.webHeal]],
    [ENEMIES["glass-echo"].trait, [RULES.lastEchoBonus]],
    [ENEMIES["rigger-drone"].trait, [RULES.riggedSpikeIntegrity, RULES.installationIntegrity.spike]],
    [ENEMIES.foreman.trait, [RULES.foremanSpikeBonus]],
    [ENEMIES.nest.trait, [RULES.nestHeal, RULES.nestStrikeBonus]],
    [ENEMIES.demolition.trait, [RULES.demolitionArmedBonus]],
    [ENEMIES.blight.trait, [RULES.blightAnchorBonus]],
    [ENEMIES["gate-warden"].trait, [RULES.addBreakBonus]],
    [ENEMIES.chorister.trait, [RULES.addBreakBonus, RULES.choirAddPlating]],
    [ENEMIES["quarantine-drone"].trait, [RULES.addBreakBonus, RULES.quarantineScrubCost]],
    [ENEMIES.leech.trait, [RULES.malwarePenalty, RULES.leechTapHeal, RULES.leechHeal, RULES.scrubCost]],
    [ENEMIES.core.trait, [RULES.blackoutWear, RULES.addBreakBonus]],
    [ASCENSION_LEVELS[2].rule, [Math.round(RULES.packRateAscensionBonus * 100)]],
    [ASCENSION_LEVELS[3].rule, [RULES.addBreakBonusLate, RULES.addBreakBonus]],
  ];
  for (const [text, numbers] of reads) for (const number of numbers)
    assert.ok(text.includes(String(number)), `"${text.slice(0, 60)}…" prints ${number}`);
  // v4 relics: six commons and two boss relics.
  assert.deepEqual(["round-robin", "ingress-filter", "priority-queue", "reinforced-frame", "field-engineer", "bill-of-lading"].map(id => RELICS[id as keyof typeof RELICS].tier), Array(6).fill("common"));
  assert.deepEqual([RELICS["storm-control"].tier, RELICS["scorched-earth"].tier], ["boss", "boss"]);
  // No card, relic, trait or story still speaks of malware or infection.
  const texts = [
    ...Object.values(CARDS).map(card => card.rules), ...Object.values(RELICS).map(relic => relic.rules),
    ...Object.values(ENEMIES).map(definition => definition.trait), ...Object.values(CARD_INSIGHTS),
    ...Object.keys(ENEMIES).flatMap(id => { const story = enemyStory(id)!; return [story.counterplay, ...Object.values(story.telegraphs)]; }),
  ];
  for (const text of texts) assert.ok(!/malware|infect/i.test(text!), `stale copy: ${text}`);
});
