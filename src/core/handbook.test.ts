/** The Handbook: every chapter renders, the v4 chapters teach the v4 rules, and every
 * number and table row comes from RULES and the content tables, never from typed copy. */
import test from "node:test";
import assert from "node:assert/strict";
import { HANDBOOK_CHAPTERS, handbookMarkup } from "../tutorial/handbook.ts";
import { esc } from "../tutorial/icons.ts";
import { BASE_CARD_IDS, CARDS, ENERGY_RELICS, RELICS, RULES } from "./cards.ts";
import { DESIGNATIONS, ENEMIES, ESCORT_IDS, MESSAGE_OPTIONS, REACH_TEXT, SIGNALS, hostileName } from "./enemies.ts";
import { ASCENSION_LEVELS } from "./ascension.ts";
import { KEYWORDS } from "../card-marks.ts";
import { BUILD_PATHS } from "../tutorial/paths.ts";
import type { Archetype, BaseCardId } from "./types.ts";

const R = RULES;
/** Reading text: tags stripped, entities kept (the markup escapes names and rules). */
const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const chapter = (id: string) => handbookMarkup(id);

test("every Handbook chapter renders without holes", () => {
  assert.equal(new Set(HANDBOOK_CHAPTERS.map(c => c.id)).size, HANDBOOK_CHAPTERS.length);
  for (const { id } of HANDBOOK_CHAPTERS) {
    const html = chapter(id);
    assert.match(html, new RegExp(`data-chapter="${id}"`), id);
    assert.doesNotMatch(html, /undefined|NaN|\[object |Infinity/, id);
  }
});

test("the four Under Quarantine chapters sit in the book with their seals and figures", () => {
  const expected: [string, string, string][] = [
    ["packs", "sword", "Three channels deliver to your target"],
    ["front", "map", "The table front."],
    ["escalation", "elite", "Escalation levels over a leader's own actions"],
    ["surprises", "coins", ""],
  ];
  for (const [id, seal, figure] of expected) {
    const entry = HANDBOOK_CHAPTERS.find(c => c.id === id);
    assert.ok(entry, `chapter ${id}`);
    assert.equal(entry.icon, seal, `${id} seal`);
    if (figure) assert.ok(chapter(id).includes(figure), `${id} figure`);
  }
  // The designation figure: three plates, a bad, a good and a hidden ribbon.
  assert.match(chapter("escalation"), /hb-leader bad[\s\S]*hb-leader good[\s\S]*hb-leader unknown/);
});

test("no chapter still teaches v3 malware", () => {
  for (const { id } of HANDBOOK_CHAPTERS)
    assert.doesNotMatch(text(chapter(id)), /malware|infect/i, id);
  assert.match(text(chapter("routes")), /Siphon Tap/);
  assert.match(text(chapter("defense")), /Plants an installation/);
});

test("Packs & Ports lists every escort with its trait, and the delivery numbers from RULES", () => {
  const html = chapter("packs");
  for (const id of ESCORT_IDS) {
    assert.ok(html.includes(esc(hostileName(id))), `escort ${id}`);
    assert.ok(html.includes(esc(ENEMIES[id].trait)), `trait ${id}`);
  }
  const primary = R.baseRouteDamage + R.switchDamage;
  const total = primary + 2 * R.bandwidthPerChannel;
  assert.ok(html.includes(`land as one packet of ${total}`), "every channel lands on the target as one packet");
  assert.ok(html.includes(`overflow ${total - Math.max(1, total - 4)} →`), "the figure shows the overflow");
  assert.doesNotMatch(text(html), /\baim(ed|ing)?\b|\bfocus\b/i, "the chapter speaks of the target, not aims or focus");
  assert.ok(text(html).includes(`+${R.bandwidthPerChannel} (${R.parallelCorePerChannel} with Parallel Core)`));
  assert.ok(text(html).includes(`raises the break threshold by ${R.addBreakBonus}`));
});

test("The Table Front reads the installation table and the wear numbers from RULES", () => {
  const body = text(chapter("front"));
  assert.ok(body.includes(`At most ${R.maxInstallations} stand at once`));
  assert.ok(body.includes(`within ${REACH_TEXT}`));
  for (const [kind, integrity] of [["Siphon Tap", R.installationIntegrity.tap], ["Jammer", R.installationIntegrity.jammer], ["Anchor", R.installationIntegrity.anchor], ["Breaker Charge", R.installationIntegrity.breaker]] as const)
    assert.match(body, new RegExp(`${kind} ${integrity} `), kind);
  assert.ok(body.includes(`Counts down from ${R.breakerCountdown}`));
  assert.ok(body.includes(`condition of ${R.deviceCondition} (salvage ${R.salvageCondition})`));
  assert.ok(body.includes(`Repair: ${R.repairCost} energy per point`));
  assert.ok(body.includes(`gives ${R.reclaimShield} shield`));
  assert.ok(body.includes(`${R.quarantineScrubCost} per point while a Quarantine Drone lives`));
});

test("Escalation & Designations prints both cadences and every designation with its rule", () => {
  const html = chapter("escalation"), body = text(html);
  for (let level = 1; level <= 3; level++) {
    assert.ok(body.includes(`from action ${R.escalationStart + (level - 1) * R.escalationEvery}`), `I–II level ${level}`);
    assert.ok(body.includes(`from action ${R.escalationStartLate + (level - 1) * R.escalationEveryLate}`), `III level ${level}`);
  }
  for (const d of Object.values(DESIGNATIONS)) {
    assert.ok(html.includes(esc(d.ribbon)), d.id);
    assert.ok(html.includes(esc(d.rule)), `${d.id} rule`);
    assert.ok(html.includes(`designation-mark ${d.kind}`), `${d.id} mark`);
  }
  assert.ok(html.includes("designation-mark unknown"));
  for (const share of R.hiddenShare) assert.ok(body.includes(`${Math.round(share * 100)}%`));
});

test("Crates, Messages & Signals names every option and signal from the content tables", () => {
  const html = chapter("surprises"), body = text(html);
  for (const option of Object.values(MESSAGE_OPTIONS)) assert.ok(html.includes(esc(option.rule)), option.name);
  for (const signal of Object.values(SIGNALS)) assert.ok(html.includes(esc(signal.rule)), signal.name);
  assert.ok(body.includes(`${R.crateCredits[0]}–${R.crateCredits[1]} credits`));
  assert.ok(body.includes(`start of turn ${R.signalTurn}`));
  for (const share of Object.values(R.crateWeights)) assert.ok(body.includes(`${Math.round(share * 100)}%`));
});

test("the Danger Playbook gains the three Under Quarantine rows", () => {
  const body = text(chapter("danger"));
  for (const row of ["A Breaker Charge beside your router", "A Jammer you cannot reach", "A Spiteful hostile at lethal"])
    assert.ok(body.includes(row), row);
});

// ---------------------------------------------------------------------------- v5 · Three Energy

test("Your First Turn teaches the three-energy turn: base, relic cap, temporary energy, draw and the route's cost", () => {
  const body = text(chapter("start"));
  assert.ok(body.includes(`Every turn you get ${R.baseEnergy} energy and draw ${R.handDraw} cards`));
  const route = CARDS.router.cost + 2 * CARDS.fiber.cost;
  assert.ok(body.includes(`costs ${route}`), "the first route's cost");
  assert.ok(body.includes(`never above ${R.relicEnergyCap}`), "the relic cap");
  for (const id of ENERGY_RELICS) assert.ok(body.includes(esc(RELICS[id].name)), `energy relic ${id}`);
  assert.ok(body.includes("On top of the base, no cap"), "temporary energy is uncapped");
  assert.ok(body.includes(`${esc(CARDS["poe-injector"].name)}`));
});

test("Keywords & Daemons prints the cards' own glossary and every daemon with its running effect", () => {
  const html = chapter("keywords");
  for (const keyword of Object.values(KEYWORDS)) {
    assert.ok(html.includes(esc(keyword.name)), keyword.name);
    assert.ok(html.includes(esc(keyword.rule)), `${keyword.name} rule`);
  }
  const daemons = BASE_CARD_IDS.filter(id => CARDS[id].target === "daemon");
  assert.ok(daemons.length >= 10);
  for (const id of daemons) {
    assert.ok(html.includes(esc(CARDS[id].name)), id);
    assert.ok(html.includes(esc(CARDS[id].rules.replace(/^(?:(?:Daemon|Innate)\.\s*)+/, ""))), `${id} effect`);
  }
  assert.ok(html.includes(esc(CARDS.payload.rules)), "the Payload token");
});

test("Cards & Curses lists every curse with its face and where it comes from, and the v5 reward odds", () => {
  const html = chapter("cards"), body = text(html);
  for (const id of BASE_CARD_IDS.filter(id => CARDS[id].curse)) {
    assert.ok(html.includes(esc(CARDS[id].name)), id);
    assert.ok(html.includes(esc(CARDS[id].rules)), `${id} face`);
  }
  for (const odds of [R.rewardRarity.normal, R.rewardRarity.elite])
    assert.ok(body.includes(odds.map(share => `${Math.round(share * 100)}%`).join(" / ")), `odds ${odds}`);
  assert.ok(body.includes(`deck floor of ${R.deckFloor} cards`));
});

test("every keeper card sits on exactly one build path, and The Three Keepers shows all nine paths", () => {
  const html = chapter("archetypes");
  for (const keeper of ["architect", "warden", "ghost"] as Archetype[]) {
    const owned = BASE_CARD_IDS.filter(id => CARDS[id].archetype === keeper);
    const placed = BUILD_PATHS[keeper].flatMap(path => path.cards);
    assert.equal(BUILD_PATHS[keeper].length, 3, `${keeper}: three paths`);
    assert.deepEqual([...placed].sort(), [...owned].sort(), `${keeper}: every card on one path, none twice`);
    for (const path of BUILD_PATHS[keeper]) {
      assert.ok(html.includes(esc(path.name)), path.name);
      assert.ok(path.partners.length > 0, `${path.name}: a colorless partner`);
      for (const id of path.partners as BaseCardId[]) {
        assert.ok(CARDS[id] && !CARDS[id].archetype, `${path.name}: ${id} is colorless`);
        assert.ok(html.includes(esc(CARDS[id].name)), `${path.name}: ${id} shown`);
      }
      for (const id of path.cards.filter(id => !CARDS[id].token)) assert.ok(html.includes(esc(CARDS[id].name)), `${path.name}: ${id} shown`);
    }
  }
});

test("The Expedition names the four ascension levels and the energy boss relics' cap", () => {
  const body = text(chapter("expedition"));
  assert.equal(ASCENSION_LEVELS.length, 4);
  for (const level of ASCENSION_LEVELS) assert.ok(body.includes(level.name), level.name);
  assert.ok(body.includes(`from ${R.baseEnergy} up to ${R.relicEnergyCap}`));
  assert.doesNotMatch(body, /guaranteed rare/, "v5 elites offer uncommon or better first, not a guaranteed rare");
});
