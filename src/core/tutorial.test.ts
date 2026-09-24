/** Field Training: every lesson setup must run on the real rules, and its intended
 * solution — played through the public API — must reach `complete`. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  aimChannel, combatPreview, endTurn, isWorn, livingEnemies, playGround, playInstant, playJunk, playLink, playProtocol, playZone,
  prepareCard, relocateNode, repairNode, scrubInstallation, setFocus, signalPaths, useConsole, zoneForNode, type TurnResult,
} from "./run.ts";
import { CARDS, RULES } from "./cards.ts";
import { ENEMIES } from "./enemies.ts";
import type { CardId, Port, RunState, Zone } from "./types.ts";
import {
  LESSONS, createLessonRun, lessonById, lessonGuard, lessonProgress, nextLesson,
  type LessonAction, type LessonId, type LessonProgress, type LessonView,
} from "../tutorial/lessons.ts";

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
  run: RunState;
  progress: LessonProgress;
  last?: TurnResult;
  /** The interface state a lesson reads: the selected port and acknowledged reading steps. */
  view: LessonView = { port: null, read: [] };
  constructor(id: LessonId) {
    this.id = id;
    this.run = createLessonRun(id);
    this.progress = lessonProgress(id, this.run, undefined, undefined, this.view);
  }
  update() {
    this.progress = lessonProgress(this.id, this.run, this.last, this.progress, this.view);
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
    assert.ok(run.enemies[0] && run.enemies[0].hp > 0, lesson.id);
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
  assert.equal(kind("aim-signal"), "strike", "the leader strikes, fed by the Drone's uplink");
  assert.equal(kind("clear-ground"), "install", "the Nest hatches its next Jammer");
  assert.equal(kind("wardens"), "charge", "the Regent's charge turn");
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
  assert.match(lessonById("reroute")!.takeaway, /Every device carries one channel: two routes through the same router or switch count as one channel/);
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
  assert.ok(s.run.faultLinks.length, "the cut landed");
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
  if (s.run.faultLinks.length || s.run.faultNodes.length) ok(playInstant(s.run, index(s.run, "patch")), "patch the cut");
  const cache = place(s.run, "cache-server", -2.6, 2.6);
  cable(s.run, "alpha", cache);
  cable(s.run, cache, "router1");
  assert.ok(s.update().complete);
  assert.ok(combatPreview(s.run).nextTurn.draw > 6, "cache server draws next turn");
});

test("05 · bands: relocate out of the suppressed, marked band, then resonate", () => {
  const s = new Session("bands");
  assert.equal(s.done("suppression"), false);
  // A move asks for confirmation: the step says so, and its confirm plate is the lit control
  // (before it opens, a band button of the chosen router, never NORTH).
  assert.match(s.progress.coach, /then \*\*confirm\*\*/);
  assert.deepEqual(s.progress.focus.split("||").map(tier => tier.trim()), ["#relocate-confirm", '#target-dock [data-relocate-zone]:not([data-relocate-zone="north"])']);
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
  ok(scrubInstallation(s.run, "tap1"), "scrub");
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
  ok(scrubInstallation(s.run, "tap1"), "scrub");
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
  assert.match(guard(reroute, { kind: "link", card: "fiber", a: "alpha", b: "router1" }) ?? "", /Every device carries one channel/, "the first route's router is off limits");
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
  assert.equal(nextLesson("danger")?.id, "expedition");
  assert.equal(nextLesson("expedition")?.id, "aim-signal", "the table-front drills follow the guide");
  assert.equal(nextLesson("aim-signal")?.id, "clear-ground");
  assert.equal(nextLesson("clear-ground")?.id, "wardens");
  assert.equal(nextLesson("wardens"), undefined);
  assert.deepEqual(["aim-signal", "clear-ground", "wardens"].map(id => lessonById(id)?.chapter), [10, 11, 12]);
  assert.deepEqual(LESSONS.slice(-3).map(lesson => lesson.id), ["aim-signal", "clear-ground", "wardens"], "menu order");
});

// ---------------------------------------------------------------------------
// The table-front drills (chapters 10–12): packs, installations, the charge turn with adds.

const bandwidth = (run: RunState) => combatPreview(run).deliveries.filter(item => !item.primary);
const burstOf = (card: string) => CARDS[card as CardId].values.burst ?? 0;

test("10 · aim the signal: read the three ports, target the Drone, transmit; aim channel 2 at the Mite, overflow", () => {
  const s = new Session("aim-signal");
  const at = (port: Port) => s.run.enemies.find(enemy => enemy.port === port)!;
  // A full rail: an escort at each outer port, the leader at the centre.
  assert.deepEqual((["left", "centre", "right"] as Port[]).map(port => [at(port).id, at(port).role]),
    [["relay-drone", "escort"], [at("centre").id, "leader"], ["spark-mite", "escort"]]);
  assert.equal(s.run.reinforcement, null, "nothing arrives: every hostile of the drill is on the rail from the start");
  assert.equal(s.run.focus, "centre", "rule 15: the leader is the default focus");
  const drone = at("left"), mite = at("right"), leader = at("centre"), miteHp = mite.hp;
  const start = combatPreview(s.run);
  const [primary, second] = start.deliveries;
  assert.equal(start.deliveries.length, 2, "two channels, two deliveries");
  assert.ok(start.deliveries.every(item => item.port === "centre"), "both land on the target");
  const forecast = (uid: string) => combatPreview(s.run).hostiles.find(item => item.uid === uid)!;
  assert.ok(forecast(leader.uid).terms.some(term => /uplink/i.test(term.label)), "the Drone feeds the leader's strike");
  assert.equal(forecast(drone.uid).state, "acts", "the left escort acts on the first phase");
  assert.equal(forecast(mite.uid).state, "dormant", "the right escort rests on it: escorts take turns");
  const fed = forecast(leader.uid).raw;

  // Step 1 reads the rail: every hostile's badge, lit together.
  assert.ok(s.progress.reading, "step 1 is a reading step");
  assert.equal(s.progress.focus.split("||")[0].trim(), "#intent-layer .hostile-intent");
  assert.equal(s.progress.spread, true, "the spotlight spans the three badges");
  assert.match(s.progress.hint, /the Spark Mite rests this phase/, "the hint names every move, the resting escort too");
  assert.ok(guard(s, { kind: "transmit" }) && guard(s, { kind: "focus", port: "left" }), "nothing plays before the rail is read");
  s.view.read = ["read"];
  assert.ok(s.done("read"));

  // Step 2: click the Drone to target it: its badge, else its row on the enemy plate.
  const tiers = s.progress.focus.split("||").map(tier => tier.trim());
  assert.equal(tiers[0], '#intent-layer .hostile-intent[data-port="left"]');
  assert.equal(tiers[tiers.length - 1], '.port-row[data-port="left"]');
  assert.match(s.progress.coach, /Click the \*\*Relay Drone\*\* to \*\*target\*\* it/);
  assert.equal(drone.hp, primary.amount + second.amount, "together the deliveries are exactly the Drone's health");
  assert.ok(guard(s, { kind: "focus", port: "right" }), "another hostile is not the step");
  assert.equal(guard(s, { kind: "focus", port: "left" }), null);
  ok(setFocus(s.run, "left"), "target the Drone");
  assert.ok(s.done("target"));
  const targeted = combatPreview(s.run);
  assert.ok(targeted.deliveries.every(item => item.port === "left"), "every delivery follows the target");
  assert.equal(targeted.ports.left?.lethal, true);
  assert.equal(targeted.ports.left?.overflowOut, 0, "nothing overflows yet");
  assert.equal(forecast(leader.uid).raw, fed - RULES.uplinkBonus, "the uplink falls with the Drone");
  assert.equal(s.progress.focus, ".transmit-button");

  s.transmit();
  assert.ok(s.done("strike"));
  assert.equal(at("left").hp, 0, "the Drone fell");
  assert.equal(s.run.focus, "centre", "the target returns to the leader");
  assert.equal(forecast(mite.uid).state, "acts", "the Mite acts on the second phase");

  // Step 4: pick up channel 2, then click the Mite.
  const ch2 = combatPreview(s.run).deliveries[1];
  assert.equal(s.progress.focus, `.delivery-row[data-delivery="${ch2.channelKey}"]`, "the spotlight is channel 2's row");
  assert.match(s.progress.coach, /Pick up \*\*channel 2\*\*/);
  s.view.delivery = combatPreview(s.run).deliveries[0].channelKey;
  assert.match(s.update().coach, /That is the primary/, "the wrong delivery gets the coach's word, not a move");
  assert.equal(s.progress.focus, `.delivery-row[data-delivery="${ch2.channelKey}"]`);
  s.view.delivery = ch2.channelKey;
  const picked = s.update().focus.split("||").map(tier => tier.trim());
  assert.equal(picked[0], '#intent-layer .hostile-intent[data-port="right"]', "picked up: the spotlight moves to the Mite");
  assert.ok(picked.includes(`.delivery-row[data-delivery="${ch2.channelKey}"] [data-aim-port="right"]`), "or channel 2's R stud");
  assert.match(s.progress.coach, /click the \*\*Spark Mite\*\*/);
  assert.ok(guard(s, { kind: "aim", key: combatPreview(s.run).deliveries[0].channelKey, port: "right" }), "the primary stays on the target");
  assert.ok(guard(s, { kind: "focus", port: "right" }), "moving the target is not the step");
  ok(aimChannel(s.run, ch2.channelKey, "right"), "aim channel 2");
  s.view.delivery = null;
  assert.ok(s.done("aim"));
  const aimed = combatPreview(s.run);
  assert.equal(aimed.ports.right?.lethal, true, "channel 2 alone downs the Mite");
  assert.equal(aimed.ports.right?.overflowOut, ch2.amount - miteHp, "its spare overflows");
  assert.equal(aimed.ports.right?.overflowTo, "centre", "to the target");
  assert.equal(aimed.ports.centre?.packet, primary.amount + ch2.amount - miteHp, "the leader takes the primary and the overflow");
  assert.match(s.progress.coach, /overflows to your target/);
  const before = at("centre").hp;
  assert.ok(s.transmit().complete);
  assert.equal(livingEnemies(s.run).length, 1, "only the leader stands");
  assert.equal(at("centre").hp, before - (primary.amount + ch2.amount - miteHp));
  assert.equal(s.progress.focus, "", "a finished drill spotlights nothing");
});

test("11 · clear the ground: scrub twice, repair ahead of the telegraphed breakdown, purge the band", () => {
  const s = new Session("clear-ground");
  const jammer = s.run.installations.find(item => item.kind === "jammer")!;
  const spike = s.run.installations.find(item => item.kind === "spike")!;
  const router = () => s.run.topology.nodes.find(node => node.id === "router1")!;
  assert.equal(signalPaths(s.run).length, 1, "one route");
  assert.ok(isWorn(router()), "the router is worn");
  assert.equal(combatPreview(s.run).intent?.install, "jammer", "the Nest hatches a Jammer next");
  // The telegraphed breakdown: the forecast names it a turn ahead.
  const start = combatPreview(s.run);
  assert.ok(start.wear.some(item => item.nodeId === "router1" && item.breaks), "the Spike would break the worn router");
  assert.ok(start.installationEffects.some(item => item.id === jammer.id && item.effect === "jam" && item.target === "router1"), "the Jammer jams the router");
  assert.match(s.progress.focus, /\.ledger-chip\.is-installation\[data-scrub="jammer1"\]/, "the spotlight is the Jammer's ledger tag");

  ok(scrubInstallation(s.run, jammer.id), "scrub 1");
  assert.ok(s.done("scrub1"));
  assert.equal(s.done("scrub2"), false);
  ok(scrubInstallation(s.run, jammer.id), "scrub 2");
  assert.ok(s.done("scrub2"));
  assert.equal(s.run.installations.some(item => item.kind === "jammer"), false, "destroyed at 0");
  assert.ok((s.run.reclaim ?? 0) >= RULES.reclaimShield, "Reclaim shield");
  assert.match(s.progress.focus, /\[data-repair="router1"\]/, "the spotlight is the Repair plate");
  assert.match(s.progress.detail, /breaks ROUTER1/, "the coach quotes the breakdown line");

  ok(repairNode(s.run, "router1"), "repair");
  assert.ok(s.done("repair"));
  assert.equal(combatPreview(s.run).breakdowns.length, 0, "repaired: no breakdown this phase");
  s.transmit();
  assert.ok(s.done("transmit"));
  assert.ok(s.run.topology.nodes.some(node => node.id === "router1"), "the router stands");
  assert.equal(signalPaths(s.run).length, 1, "and carries the signal: nothing jammed it");

  const second = s.run.installations.find(item => item.kind === "jammer")!;
  assert.ok(second, "the second Jammer landed");
  const band = zoneForNode(second);
  assert.equal(zoneForNode(spike), band, "the Spike shares its band: one purge answers both");
  const threat = combatPreview(s.run);
  assert.ok(threat.wear.some(item => item.nodeId === "router1" && item.breaks), "worn again: the forecast warns of the breakdown");
  assert.ok(s.progress.coach.includes(band.toUpperCase()));
  ok(playZone(s.run, index(s.run, "purge-field"), band), "purge");
  assert.equal(s.run.installations.length, 0, "the band is clear");
  assert.ok(s.update().complete);
  assert.equal(combatPreview(s.run).breakdowns.length, 0);
});

test("12 · the crown and its wardens: read, aim both bandwidth channels, prepare, break Crownfall", () => {
  const s = new Session("wardens");
  const regent = s.run.enemies.find(enemy => enemy.id === "regent")!;
  const adds = () => s.run.enemies.filter(enemy => enemy.role === "add" && enemy.hp > 0);
  const base = ENEMIES.regent.boss!.breakDamage, bonus = RULES.addBreakBonus;
  assert.equal(regent.port, "centre");
  assert.deepEqual(adds().map(add => [add.id, add.port]), [["gate-warden", "left"], ["gate-warden", "right"]], "two Gate Wardens at the outer ports");
  const start = combatPreview(s.run);
  assert.equal(start.intent?.kind, "charge");
  assert.ok(start.hostiles.filter(item => item.id === "gate-warden").every(item => item.state === "dormant"), "rising: they act from the ultimate");
  assert.equal(start.deliveries.length, 3, "three channels");
  assert.ok(s.run.topology.nodes.some(node => node.role === "balancer") && start.online.some(id => id.startsWith("balancer")), "a Load Balancer online");
  const total = start.deliveries.reduce((sum, item) => sum + item.amount, 0);
  const burst = burstOf("pulse");
  // The drill's arithmetic: both Wardens alive, not even the burst breaks; one down, it does.
  assert.ok(total + burst < base + 2 * bonus, "with both Wardens the break is out of reach");
  assert.ok(total < base + bonus && total + burst >= base + bonus, "one Warden down: the prepared burst is the difference");

  assert.ok(s.progress.reading, "step 1 is a reading step");
  assert.equal(s.progress.focus.split("||")[0].trim(), ".boss-window");
  assert.ok(s.progress.detail.includes(String(base + 2 * bonus)), "the coach reads the threshold with both adds");
  assert.deepEqual(s.progress.meter, { base, bonus, adds: 2, standing: 2, packet: total, add: "Warden" }, "and draws it");
  s.view.read = ["read"];
  assert.ok(s.done("read"));
  assert.equal(s.progress.reading, false);

  // Aiming is two clicks: pick a delivery up (its row), then click the Warden. The spotlight follows.
  for (const item of bandwidth(s.run)) {
    s.view.delivery = null;
    assert.equal(s.update().focus, `.delivery-row[data-delivery="${item.channelKey}"]`, `channel ${item.index + 1}'s row first`);
    s.view.delivery = item.channelKey;
    assert.equal(s.update().focus.split("||")[0].trim(), '#intent-layer .hostile-intent[data-port="left"]', "then the Warden");
    assert.ok(guard(s, { kind: "focus", port: "left" }), "a click on the Warden without a delivery would move the target: refused");
    ok(aimChannel(s.run, item.channelKey, "left"), `aim channel ${item.index + 1}`);
  }
  s.view.delivery = null;
  assert.ok(s.done("aim"));
  const aimed = combatPreview(s.run);
  assert.equal(aimed.ports.left?.lethal, true, "both bandwidth deliveries kill the left Warden");
  ok(prepareCard(s.run, index(s.run, "pulse")), "prepare Packet Burst");
  assert.ok(s.done("prepare"));
  assert.ok(s.progress.coach.includes(String(base + bonus)), "the coach names the lower threshold");
  s.transmit();
  assert.ok(s.done("charge"));
  assert.equal(adds().length, 1, "the left Warden fell");
  const ultimate = combatPreview(s.run);
  assert.ok(ultimate.intent?.ultimate, "Crownfall comes now");
  assert.equal(ultimate.ports.centre?.breakThreshold, base + bonus, "the threshold fell with the Warden");
  assert.ok(ultimate.deliveries.every(item => item.port === "centre"), "aims at the fallen port return to the focus");
  assert.equal(ultimate.ports.centre?.breaks, false, "without the burst it lands");
  ok(playInstant(s.run, index(s.run, "pulse")), "the prepared burst");
  assert.equal(combatPreview(s.run).ports.centre?.breaks, true);
  assert.ok(s.transmit().complete);
  assert.ok(s.last!.interrupted);
  assert.equal(s.last!.integrityDamage, 0);
});

/** Every move a player could try on a drill board right now. */
function candidates(run: RunState): LessonAction[] {
  const preview = combatPreview(run);
  const actions: LessonAction[] = [{ kind: "transmit" }];
  for (const card of new Set(run.hand)) actions.push({ kind: "card", card }, { kind: "prepare", card });
  const ports: (Port | null)[] = ["left", "centre", "right", null];
  for (const item of preview.deliveries) for (const port of ports) actions.push({ kind: "aim", key: item.channelKey, port });
  for (const enemy of livingEnemies(run)) actions.push({ kind: "focus", port: enemy.port });
  for (const item of run.installations) actions.push({ kind: "scrub", installation: item.id });
  for (const node of run.topology.nodes.filter(node => !node.fixed)) actions.push({ kind: "repair", node: node.id });
  const zones: Zone[] = ["north", "center", "south"];
  for (const card of new Set(run.hand.filter(card => CARDS[card].target === "zone"))) for (const zone of zones) actions.push({ kind: "zone", card, zone });
  const device = run.topology.nodes.find(node => !node.fixed)!;
  actions.push({ kind: "link", card: "fiber", a: "alpha", b: device.id }, { kind: "link", a: "alpha", b: device.id });
  actions.push({ kind: "ground", card: "router", zone: "center" }, { kind: "move", node: device.id, zone: "south" });
  return actions;
}
const describe = (action: LessonAction) => JSON.stringify(action);
/** At every step, exactly the step's own moves pass the rails. */
function railsHold(s: Session, allowed: (action: LessonAction) => boolean) {
  const progress = s.update();
  const step = progress.goals[progress.current]?.id;
  for (const action of candidates(s.run)) {
    const objection = lessonGuard(s.id, s.run, progress, action);
    if (allowed(action)) assert.equal(objection, null, `${s.id} · ${step}: ${describe(action)} should be playable`);
    else assert.ok(objection && objection.length > 10, `${s.id} · ${step}: ${describe(action)} must be blocked`);
  }
}

test("training rails: the aim drill plays only the current step's move", () => {
  const s = new Session("aim-signal");
  railsHold(s, () => false);
  s.view.read = ["read"];
  railsHold(s, action => action.kind === "focus" && action.port === "left");
  ok(setFocus(s.run, "left"), "target");
  railsHold(s, action => action.kind === "transmit");
  s.transmit();
  const key = bandwidth(s.run)[0].channelKey;
  const aimMite = (action: LessonAction) => action.kind === "aim" && action.key === key && action.port === "right";
  railsHold(s, aimMite);
  s.view.delivery = key;
  railsHold(s, aimMite);
  ok(aimChannel(s.run, key, "right"), "aim");
  railsHold(s, action => action.kind === "transmit");
});

test("training rails: the table-front drill plays only the current step's move", () => {
  const s = new Session("clear-ground");
  const scrubJammer = (action: LessonAction) => action.kind === "scrub" && action.installation === "jammer1";
  railsHold(s, scrubJammer);
  ok(scrubInstallation(s.run, "jammer1"), "scrub");
  railsHold(s, scrubJammer);
  ok(scrubInstallation(s.run, "jammer1"), "scrub");
  railsHold(s, action => action.kind === "repair" && action.node === "router1");
  ok(repairNode(s.run, "router1"), "repair");
  railsHold(s, action => action.kind === "transmit");
  s.transmit();
  const band = zoneForNode(s.run.installations.find(item => item.kind === "jammer")!);
  railsHold(s, action => (action.kind === "card" && action.card === "purge-field") || (action.kind === "zone" && action.card === "purge-field" && action.zone === band));
});

test("training rails: the wardens drill plays only the current step's move", () => {
  const s = new Session("wardens");
  railsHold(s, () => false);
  s.view.read = ["read"];
  const keys = bandwidth(s.run).map(item => item.channelKey);
  railsHold(s, action => action.kind === "aim" && keys.includes(action.key) && action.port === "left");
  ok(aimChannel(s.run, keys[0], "left"), "aim one");
  railsHold(s, action => action.kind === "aim" && keys.includes(action.key) && action.port === "left");
  ok(aimChannel(s.run, keys[1], "left"), "aim both");
  railsHold(s, action => action.kind === "prepare" && CARDS[action.card].base === "pulse");
  ok(prepareCard(s.run, index(s.run, "pulse")), "prepare");
  railsHold(s, action => action.kind === "transmit");
  s.transmit();
  railsHold(s, action => action.kind === "card" && CARDS[action.card].base === "pulse");
  ok(playInstant(s.run, index(s.run, "pulse")), "burst");
  railsHold(s, action => action.kind === "transmit");
});

test("training rails: undo (Z) reopens a drill step instead of stranding it", () => {
  const s = new Session("aim-signal");
  s.view.read = ["read"];
  const before = structuredClone(s.run);
  ok(setFocus(s.run, "left"), "target");
  assert.ok(s.done("target"));
  s.run = before;
  assert.equal(s.done("target"), false, "the undone target reopens its step");
  assert.ok(s.done("read"), "a reading step stays met");
  assert.ok(guard(s, { kind: "transmit" }), "and the transmission waits for it again");
  ok(setFocus(s.run, "left"), "target");
  s.transmit();
  const key = bandwidth(s.run)[0].channelKey;
  const turn = structuredClone(s.run);
  ok(aimChannel(s.run, key, "right"), "aim");
  assert.ok(s.done("aim"));
  s.run = turn;
  assert.equal(s.done("aim"), false, "the undone aim reopens its step");
  assert.ok(guard(s, { kind: "transmit" }), "and the Mite's bite waits for it again");

  const w = new Session("wardens");
  w.view.read = ["read"];
  for (const item of bandwidth(w.run)) ok(aimChannel(w.run, item.channelKey, "left"), "aim");
  ok(prepareCard(w.run, index(w.run, "pulse")), "prepare");
  assert.ok(w.done("prepare"));
  w.run.hand.push(w.run.preparedCard!);
  w.run.preparedCard = null;
  assert.equal(w.done("prepare"), false, "a released card reopens the prepare step");
  assert.ok(guard(w, { kind: "transmit" }), "Crownfall is not faced without the burst");
});

test("training rails: the drills keep their escapes — shield at lethal, transmit once the goal is met", () => {
  const s = new Session("aim-signal");
  assert.ok(guard(s, { kind: "card", card: "guard" }), "shield waits outside its step");
  s.run.integrity = 1;
  assert.ok(combatPreview(s.run).incoming >= 1);
  assert.equal(guard(s, { kind: "card", card: "guard" }), null, "unless the hit would end the drill");
  const w = new Session("wardens");
  w.view.read = ["read"];
  for (const item of bandwidth(w.run)) ok(aimChannel(w.run, item.channelKey, "left"), "aim");
  ok(prepareCard(w.run, index(w.run, "pulse")), "prepare");
  w.transmit();
  ok(playInstant(w.run, index(w.run, "pulse")), "burst");
  assert.equal(guard(w, { kind: "transmit" }), null, "the break is forecast: Transmit is free");
  const c = new Session("clear-ground");
  c.run.energy = 0;
  assert.equal(guard(c, { kind: "transmit" }), null, "no energy left to scrub: the drill moves on");
});
