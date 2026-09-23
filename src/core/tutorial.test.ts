/** Field Training: every lesson setup must run on the real rules, and its intended
 * solution — played through the public API — must reach `complete`. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  combatPreview, endTurn, playGround, playInstant, playJunk, playLink, playProtocol, playZone,
  prepareCard, relocateNode, scrubMalware, signalPaths, useConsole, type TurnResult,
} from "./run.ts";
import { CARDS } from "./cards.ts";
import type { CardId, RunState } from "./types.ts";
import { LESSONS, createLessonRun, lessonGuard, lessonProgress, nextLesson, type LessonAction, type LessonId, type LessonProgress } from "../tutorial/lessons.ts";

type Result = { ok: boolean; message: string };

function index(run: RunState, card: string): number {
  const i = run.hand.findIndex(id => id === card || id === `${card}+`);
  assert.notEqual(i, -1, `${card} should be in hand: ${run.hand.join(", ")}`);
  return i;
}
function ok(result: Result, what: string) {
  assert.ok(result.ok, `${what}: ${result.message}`);
}
function newNode(run: RunState, before: RunState["topology"]["nodes"]) {
  return run.topology.nodes.find(node => !before.some(old => old.id === node.id))!;
}
function place(run: RunState, card: string, x: number, z: number) {
  const before = [...run.topology.nodes];
  ok(playGround(run, index(run, card), x, z), `place ${card}`);
  return newNode(run, before).id;
}
function cable(run: RunState, a: string, b: string, card = "fiber") {
  ok(playLink(run, index(run, card), a, b), `cable ${a}–${b}`);
}

class Session {
  readonly id: LessonId;
  readonly run: RunState;
  progress: LessonProgress;
  last?: TurnResult;
  constructor(id: LessonId) {
    this.id = id;
    this.run = createLessonRun(id);
    this.progress = lessonProgress(id, this.run);
  }
  update() {
    this.progress = lessonProgress(this.id, this.run, this.last, this.progress);
    return this.progress;
  }
  transmit() {
    this.last = endTurn(this.run);
    return this.update();
  }
  done(goal: string) {
    return this.update().goals.find(item => item.id === goal)!.done;
  }
}

test("every battle lesson builds a legal, clean training board", () => {
  for (const lesson of LESSONS.filter(item => item.kind === "battle")) {
    const run = createLessonRun(lesson.id);
    assert.equal(run.phase, "battle", lesson.id);
    assert.ok(run.enemy && run.enemy.hp > 0, lesson.id);
    assert.equal(run.terrain, null, `${lesson.id}: no random terrain`);
    for (const card of [...run.hand, ...run.drawPile]) assert.ok(CARDS[card as CardId], `${lesson.id}: unknown card ${card}`);
    const ids = run.topology.nodes.map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, `${lesson.id}: unique ids`);
    assert.ok(run.nextNodeId > Math.max(0, ...ids.map(id => Number(id.replace(/\D/g, "")) || 0)), `${lesson.id}: fresh ids`);
    const progress = lessonProgress(lesson.id, run);
    assert.equal(progress.complete, false, `${lesson.id} must not start complete`);
    assert.ok(progress.coach.length > 20, `${lesson.id}: coach text`);
    assert.ok(progress.hint.length > 10, `${lesson.id}: hint text`);
    if (lesson.archetype) assert.equal(run.archetype, lesson.archetype);
  }
});

test("lesson setups announce the intended enemy action", () => {
  const kind = (id: LessonId) => combatPreview(createLessonRun(id)).intent?.kind;
  assert.equal(kind("first-signal"), "strike");
  assert.equal(kind("read-the-enemy"), "strike");
  assert.equal(kind("reroute"), "sever");
  assert.equal(kind("online"), "breach");
  assert.equal(kind("bands"), "jam");
  assert.equal(combatPreview(createLessonRun("bands")).hazardZone, "north");
  assert.equal(kind("traps"), "jam");
  assert.equal(kind("console-ghost"), "strike");
  assert.equal(kind("danger"), "charge");
});

test("01 · first signal: router, two cables, transmit", () => {
  const s = new Session("first-signal");
  const router = place(s.run, "router", 0, 0);
  assert.ok(s.done("router"));
  cable(s.run, "alpha", router);
  assert.ok(s.done("source"));
  cable(s.run, router, "omega");
  assert.ok(s.done("route"));
  assert.ok(s.transmit().complete);
  assert.equal(s.last!.packetDamage, 5);
});

test("02 · read the enemy: cover the strike, burst, transmit safely", () => {
  const s = new Session("read-the-enemy");
  while (combatPreview(s.run).incoming > 0) ok(playInstant(s.run, index(s.run, "guard")), "guard");
  assert.ok(s.done("cover"));
  ok(playInstant(s.run, index(s.run, "pulse")), "pulse");
  assert.ok(s.done("burst"));
  assert.ok(s.transmit().complete);
  assert.equal(s.last!.integrityDamage, 0);
});

test("03 · reroute: second channel + Failover Policy survives the cut", () => {
  const s = new Session("reroute");
  const router = place(s.run, "router", 0, 2.6);
  cable(s.run, "alpha", router);
  cable(s.run, router, "omega");
  assert.ok(s.done("channel"));
  ok(playProtocol(s.run, index(s.run, "failover-policy")), "arm failover");
  const progress = s.transmit();
  assert.ok(progress.goals.find(goal => goal.id === "survive")!.done);
  assert.ok(progress.complete, "failover cancelled the cut: full bandwidth already");
});

test("03 · reroute: without the policy, the second channel survives and Hot Patch restores", () => {
  const s = new Session("reroute");
  const router = place(s.run, "router", 0, 2.6);
  cable(s.run, "alpha", router);
  cable(s.run, router, "omega");
  s.transmit();
  assert.ok(s.done("survive"));
  assert.ok(s.run.faultLink, "the cut landed");
  assert.equal(s.done("restore"), false);
  ok(playInstant(s.run, index(s.run, "patch")), "hot patch");
  assert.ok(s.update().complete);
});

test("04 · online devices: firewall online anywhere, then a cache server", () => {
  const s = new Session("online");
  cable(s.run, "alpha", "firewall2");
  cable(s.run, "firewall2", "router1");
  assert.ok(s.done("firewall"));
  const before = combatPreview(s.run);
  assert.ok(before.shieldTerms.some(term => /firewall/i.test(term.label)), "firewall counted against the breach");
  s.transmit();
  assert.ok(s.done("transmit"));
  if (s.run.faultLink || s.run.faultNode) ok(playInstant(s.run, index(s.run, "patch")), "patch the cut");
  const cache = place(s.run, "cache-server", -2.6, 2.6);
  cable(s.run, "alpha", cache);
  cable(s.run, cache, "router1");
  assert.ok(s.update().complete);
  assert.ok(combatPreview(s.run).nextTurn.draw > 6, "cache server draws next turn");
});

test("05 · bands: relocate out of the suppressed, marked band, then resonate", () => {
  const s = new Session("bands");
  assert.equal(s.done("suppression"), false);
  ok(relocateNode(s.run, "router1", 0, 0), "relocate to center");
  assert.ok(s.done("suppression"));
  assert.ok(s.done("jam"));
  ok(playZone(s.run, index(s.run, "resonance-field"), "center"), "resonance");
  assert.ok(s.done("resonance"));
  assert.ok(s.transmit().complete);
  assert.ok(signalPaths(s.run).length > 0, "the storm found nothing in NORTH");
});

test("05 · bands: Purge Field is the alternative answer to suppression", () => {
  const s = new Session("bands");
  ok(playZone(s.run, index(s.run, "purge-field"), "north"), "purge north");
  assert.ok(s.done("suppression"));
  assert.equal(s.done("jam"), false, "the router is still in the marked band");
});

test("06 · traps: honeypot decoy and an armed protocol spring", () => {
  const s = new Session("traps");
  const honeypot = place(s.run, "honeypot", -2.6, 2.6);
  cable(s.run, "alpha", honeypot);
  assert.ok(s.done("honeypot"));
  assert.equal(combatPreview(s.run).faultTarget, honeypot, "the jam now targets the decoy");
  ok(playProtocol(s.run, index(s.run, "port-security")), "arm port security");
  assert.ok(s.done("armed"));
  assert.ok(s.transmit().complete);
});

test("07 · architect console: Patch Cable, second channel, bandwidth", () => {
  const s = new Session("console-architect");
  assert.equal(signalPaths(s.run).length, 0);
  ok(useConsole(s.run, "router1", "omega"), "patch cable");
  assert.ok(s.done("patch"));
  const router = place(s.run, "router", 0, 2.6);
  cable(s.run, "alpha", router);
  cable(s.run, router, "omega");
  assert.ok(s.done("channels"));
  assert.ok(s.transmit().complete);
  assert.ok(s.last!.packetDamage >= 7);
});

test("07 · warden console: Harden stores backpressure, the next transmission releases it", () => {
  const s = new Session("console-warden");
  ok(useConsole(s.run), "harden");
  assert.ok(s.done("harden"));
  assert.ok(combatPreview(s.run).backpressureGain > 0);
  s.transmit();
  assert.ok(s.done("stored"));
  assert.ok(s.run.backpressure > 0);
  assert.ok(s.transmit().complete);
});

test("07 · ghost console: buffer, protect the line, stack, flush", () => {
  const s = new Session("console-ghost");
  ok(useConsole(s.run), "buffer on");
  assert.ok(s.done("buffer"));
  s.transmit();
  assert.ok(s.done("stored"));
  assert.equal(s.last!.packetDamage, 0);
  assert.equal(combatPreview(s.run).intent?.kind, "sever");
  assert.equal(combatPreview(s.run).bufferAtRisk, false, "a normal transmission flushes before the cut");
  ok(useConsole(s.run), "buffer again, unprotected");
  assert.equal(combatPreview(s.run).bufferAtRisk, true, "stacking into a cut on the only route loses the buffer");
  assert.equal(s.done("protect"), false);
  assert.ok(s.update().warning.length > 0, "packet loss warning");
  ok(playProtocol(s.run, index(s.run, "failover-policy")), "arm failover");
  assert.ok(s.done("protect"));
  s.transmit();
  const stacked = s.run.buffer;
  assert.ok(stacked > 7, "buffer stacked across two turns");
  assert.ok(s.transmit().complete);
  assert.equal(s.last!.bufferReleased, stacked);
});

test("08 · danger: scrub, delete the worm, prepare, interrupt the ultimate", () => {
  const s = new Session("danger");
  ok(scrubMalware(s.run, "malware1"), "scrub");
  assert.ok(s.done("scrub"));
  ok(playJunk(s.run, index(s.run, "worm")), "delete worm");
  assert.ok(s.done("worm"));
  assert.equal(s.progress.focus, ".prepared-pile", "the coach spotlights the Prepare slot");
  assert.match(s.progress.coach, /bottom left/, "and says where it is");
  ok(prepareCard(s.run, index(s.run, "zero-day")), "prepare zero day");
  assert.ok(s.done("prepare"));
  assert.notEqual(s.progress.focus, ".prepared-pile", "the spotlight moves on once prepared");
  s.transmit();
  assert.ok(s.done("charge"));
  assert.ok(combatPreview(s.run).intent?.ultimate, "the ultimate is next");
  ok(playInstant(s.run, index(s.run, "zero-day")), "zero day");
  ok(playInstant(s.run, index(s.run, "pulse")), "packet burst");
  assert.ok(combatPreview(s.run).interrupted, "burst reaches the break threshold");
  assert.ok(s.transmit().complete);
  assert.ok(s.last!.interrupted);
});

test("08 · danger: bracing the ultimate is the other valid answer", () => {
  const s = new Session("danger");
  ok(scrubMalware(s.run, "malware1"), "scrub");
  ok(playJunk(s.run, index(s.run, "worm")), "delete worm");
  ok(prepareCard(s.run, index(s.run, "zero-day")), "prepare");
  s.update();
  s.transmit();
  for (const card of ["barrier", "guard"]) if (combatPreview(s.run).incoming > 0) ok(playInstant(s.run, index(s.run, card)), card);
  assert.equal(combatPreview(s.run).incoming, 0);
  assert.ok(s.transmit().complete);
  assert.equal(s.last!.integrityDamage, 0);
});

function guard(s: Session, action: LessonAction) {
  return lessonGuard(s.id, s.run, s.update(), action);
}

test("training rails: lesson 1 blocks off-script cards, dead-end cables and empty transmissions", () => {
  const s = new Session("first-signal");
  assert.ok(guard(s, { kind: "card", card: "pulse" }), "burst has no place before the route");
  assert.ok(guard(s, { kind: "card", card: "fiber" }), "one step at a time: the router comes first");
  assert.equal(guard(s, { kind: "card", card: "router" }), null);
  assert.ok(guard(s, { kind: "transmit" }), "no route: the transmission would do nothing");
  const router = place(s.run, "router", 0, 0);
  assert.equal(guard(s, { kind: "card", card: "fiber" }), null, "the cabling step frees the fiber");
  assert.ok(guard(s, { kind: "link", card: "fiber", a: "alpha", b: "omega" }), "a straight ALPHA–OMEGA cable is stopped");
  assert.equal(guard(s, { kind: "link", card: "fiber", a: "alpha", b: router }), null);
  cable(s.run, "alpha", router);
  cable(s.run, router, "omega");
  assert.equal(guard(s, { kind: "transmit" }), null, "a live route may transmit");
  assert.ok(s.transmit().complete);
  assert.equal(guard(s, { kind: "card", card: "pulse" }), null, "a complete lesson plays free");
});

test("training rails: cables must serve the step in every cabling lesson", () => {
  const online = new Session("online");
  assert.ok(guard(online, { kind: "link", card: "fiber", a: "alpha", b: "router1" }), "the Trust Gate comes first");
  assert.equal(guard(online, { kind: "link", card: "fiber", a: "alpha", b: "firewall2" }), null);
  const reroute = new Session("reroute");
  const second = place(reroute.run, "router", 0, 2.6);
  assert.ok(guard(reroute, { kind: "link", card: "fiber", a: "alpha", b: "router1" }), "the first route's router is off limits");
  assert.equal(guard(reroute, { kind: "link", card: "fiber", a: "alpha", b: second }), null);
  const traps = new Session("traps");
  assert.ok(guard(traps, { kind: "link", card: "fiber", a: "alpha", b: "router1" }), "deploy the honeypot before cabling");
  const honeypot = place(traps.run, "honeypot", -2.6, 2.6);
  assert.ok(guard(traps, { kind: "link", card: "fiber", a: "alpha", b: "router1" }), "the cable must reach the decoy");
  assert.equal(guard(traps, { kind: "link", card: "fiber", a: "alpha", b: honeypot }), null);
});

test("training rails: ground is held in the bands lesson", () => {
  const s = new Session("bands");
  assert.ok(guard(s, { kind: "move", node: "router1", zone: "north" }), "never into the storm's band");
  assert.equal(guard(s, { kind: "move", node: "router1", zone: "center" }), null);
  assert.ok(guard(s, { kind: "ground", card: "router", zone: "north" }), "no new hardware in the marked band");
  assert.ok(guard(s, { kind: "zone", card: "purge-field", zone: "center" }), "purge belongs on the suppression");
  assert.equal(guard(s, { kind: "zone", card: "purge-field", zone: "north" }), null);
  ok(relocateNode(s.run, "router1", 0, 0), "relocate to center");
  assert.ok(guard(s, { kind: "zone", card: "resonance-field", zone: "south" }), "resonance belongs where the route runs");
  assert.equal(guard(s, { kind: "zone", card: "resonance-field", zone: "center" }), null);
});

test("training rails: the danger drill guards the prepare slot", () => {
  const s = new Session("danger");
  assert.ok(guard(s, { kind: "prepare", card: "guard" }), "the slot is for the burst answer");
  assert.equal(guard(s, { kind: "prepare", card: "zero-day" }), null);
});

test("training rails: junk is always deletable, and a lethal turn always frees the shield", () => {
  const s = new Session("danger");
  assert.equal(guard(s, { kind: "card", card: "worm" }), null);
  const covered = new Session("read-the-enemy");
  assert.ok(combatPreview(covered.run).incoming > 0);
  assert.equal(guard(covered, { kind: "card", card: "guard" }), null, "the cover step takes its shield");
  const warden = new Session("console-warden");
  assert.ok(guard(warden, { kind: "card", card: "guard" }), "outside its step even shield waits");
  warden.run.integrity = 1;
  assert.equal(guard(warden, { kind: "card", card: "guard" }), null, "unless the hit would end the drill");
});

test("training rails: a step the hand can no longer afford is not enforced", () => {
  const s = new Session("reroute");
  assert.ok(guard(s, { kind: "transmit" }), "the second channel comes first");
  s.run.hand = [];
  s.run.energy = 0;
  assert.equal(guard(s, { kind: "transmit" }), null, "nothing left to build with: the drill moves on");
});

test("training rails: the ghost cannot transmit into packet loss", () => {
  const s = new Session("console-ghost");
  ok(useConsole(s.run), "buffer on");
  s.transmit();
  ok(useConsole(s.run), "buffer again, unprotected");
  assert.ok(guard(s, { kind: "transmit" }), "packet loss ahead is stopped");
  ok(playProtocol(s.run, index(s.run, "failover-policy")), "arm failover");
  assert.equal(guard(s, { kind: "transmit" }), null);
});

test("training rails: a lethal transmission is stopped only while a shield answer remains", () => {
  const s = new Session("console-warden");
  s.run.integrity = 1;
  assert.ok(combatPreview(s.run).incoming >= 1, "the strike would finish the drill");
  assert.ok(guard(s, { kind: "transmit" }), "the coach stops the loss");
  s.run.hand = s.run.hand.filter(card => card !== "guard");
  assert.equal(guard(s, { kind: "transmit" }), null, "with no shield left the drill may play out");
});

test("progress is sticky and the menu order chains lessons", () => {
  const s = new Session("read-the-enemy");
  while (combatPreview(s.run).incoming > 0) ok(playInstant(s.run, index(s.run, "guard")), "guard");
  assert.ok(s.done("cover"));
  // A later state that no longer satisfies the predicate keeps the goal done.
  s.run.block = 0;
  assert.ok(s.done("cover"));
  assert.equal(nextLesson("first-signal")?.id, "read-the-enemy");
  assert.equal(nextLesson("console-architect")?.id, "danger", "console variants share chapter 7");
  assert.equal(nextLesson("expedition"), undefined);
});
