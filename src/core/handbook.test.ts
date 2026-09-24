/** The Handbook: every chapter renders, the v4 chapters teach the v4 rules, and every
 * number and table row comes from RULES and the content tables, never from typed copy. */
import test from "node:test";
import assert from "node:assert/strict";
import { HANDBOOK_CHAPTERS, handbookMarkup } from "../tutorial/handbook.ts";
import { esc } from "../tutorial/icons.ts";
import { RULES } from "./cards.ts";
import { DESIGNATIONS, ENEMIES, ESCORT_IDS, MESSAGE_OPTIONS, REACH_TEXT, SIGNALS, hostileName } from "./enemies.ts";

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
