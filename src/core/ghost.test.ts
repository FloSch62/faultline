/** The Ghost's cards (contract section 9.3): every card plays through the public play functions,
 * prints its numbers, improves with its upgrade; daemons stack; everything that acts in the enemy
 * phase is checked with `agree` (the forecast is pure and equals the resolution). The last three
 * tests play one scripted sequence per build path (Buffer, Evasion, Payloads). */
import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, RULES, REWARD_POOL, STARTER_SIGNATURES, missingCards, offeredTo } from "./cards.ts";
import { makeEnemy } from "./encounter.ts";
import { newExpedition, starterDeck } from "./expedition.ts";
import { GHOST_CARD_IDS, type Archetype, type CardId, type HostileRole, type NetworkNode, type Port, type RunState } from "./types.ts";
import {
  api, chooseRoom, combatPreview, costFor, endTurn, playDaemon, playGround, playInstant, playLink, runningDaemons, useConsole,
} from "./run.ts";
import { DAEMON_HOOKS } from "./effects/index.ts";

// ------------------------------------------------------------------ helpers (engine-v5.test.ts pattern)

/** A clean first-fight table: terminals, one hostile at a chosen intent, energy to spare. */
function table(enemy = "wraith", turn = 0, archetype: Archetype = "ghost"): RunState {
  const run = newExpedition(archetype, 0x5eed1234).run;
  chooseRoom(run, "0-1");
  const foe = run.enemies[0];
  foe.id = enemy;
  foe.hp = foe.maxHp = 200;
  foe.turn = turn;
  run.integrity = run.maxIntegrity = 100;
  run.energy = 20;
  run.relics = [];
  run.topology.nodes = run.topology.nodes.filter(node => node.fixed);
  run.topology.links = [];
  run.zoneEffects = [];
  run.hand = [];
  run.drawPile = Array(30).fill("guard");
  run.discardPile = [];
  run.nextNodeId = 1;
  return run;
}
type Member = [id: string, port: Port, role?: HostileRole, hp?: number, turn?: number];
/** A table with a pack in port order (escorts act on their parity: phase 1 is odd). */
function pack(members: Member[]): RunState {
  const run = table();
  run.enemies = members.map(([id, port, role = "single", hp = 200, turn = 0], i) => makeEnemy(id, `h${i + 1}`, port, role, hp, { turn }));
  run.focus = "centre";
  return run;
}
function device(run: RunState, id: string, role: NetworkNode["role"], x: number, z: number, extra: Partial<NetworkNode> = {}) {
  run.topology.nodes.push({ id, role, x, z, ...extra });
}
function wire(run: RunState, ...chain: string[]) {
  for (let i = 1; i < chain.length; i++) run.topology.links.push({ a: chain[i - 1], b: chain[i] });
}
function route(run: RunState, id: string, z: number, x = 0) {
  device(run, id, "router", x, z);
  wire(run, "alpha", id, "omega");
}
/** The forecast is pure and is exactly what the enemy phase resolves. */
function agree(run: RunState) {
  const snapshot = structuredClone(run);
  const preview = combatPreview(run);
  assert.deepEqual(run, snapshot, "combatPreview mutates nothing");
  const integrity = run.integrity;
  const result = endTurn(run);
  assert.deepEqual(result.forecast, preview, "the forecast equals the resolution");
  assert.equal(result.integrityDamage, preview.incoming);
  assert.equal(run.integrity, Math.max(0, integrity - preview.incoming));
  return { preview, result };
}
/** Plays the hand card `id` with the play function its target needs (instants and daemons here). */
function play(run: RunState, id: CardId) {
  const index = run.hand.indexOf(id);
  assert.ok(index >= 0, `${id} is in hand`);
  const result = CARDS[id].target === "daemon" ? playDaemon(run, index) : playInstant(run, index);
  assert.ok(result.ok, `${id}: ${result.message}`);
  return result;
}
const term = (terms: { label: string; amount: number }[], label: string) => terms.find(item => item.label === label)?.amount;
const plus = (id: CardId) => `${id}+` as CardId;

// ------------------------------------------------------------------ the collection

test("Ghost collection: every card of 9.3 is defined, keeps its archetype, prints its numbers, stays short and improves", () => {
  assert.deepEqual(missingCards("ghost"), []);
  const spec: Record<string, [cost: number, rarity: string, target: string, plusCost: number]> = {
    "store-forward": [1, "basic", "instant", 1], "jitter-buffer": [1, "common", "instant", 1], "hold-queue": [1, "common", "instant", 1],
    flush: [0, "common", "instant", 0], spearhead: [1, "uncommon", "instant", 0], trickle: [1, "uncommon", "daemon", 1],
    "replay-attack": [1, "rare", "instant", 0], "deep-queue": [2, "rare", "daemon", 1], exfiltrate: [1, "rare", "instant", 0],
    spoof: [1, "common", "instant", 1], "phantom-node": [0, "uncommon", "ground", 0], "dark-fiber": [0, "uncommon", "link", 0],
    "decoy-swarm": [1, "uncommon", "instant", 1], "ghost-protocol": [2, "rare", "instant", 1], obfuscation: [2, "rare", "daemon", 1],
    "fork-bomb": [1, "common", "instant", 1], "shell-access": [1, "common", "instant", 1], "side-channel": [1, "common", "instant", 0],
    payload: [0, "special", "instant", 0], "exploit-kit": [1, "uncommon", "daemon", 1], botnet: [1, "uncommon", "daemon", 1],
    "cover-tracks": [1, "uncommon", "daemon", 1], "man-in-the-middle": [1, "rare", "instant", 1],
  };
  assert.deepEqual(Object.keys(spec).sort(), [...GHOST_CARD_IDS].sort());
  for (const id of GHOST_CARD_IDS) {
    const card = CARDS[id], upgraded = CARDS[plus(id)];
    const [cost, rarity, target, plusCost] = spec[id];
    assert.deepEqual([card.cost, card.rarity, card.target, upgraded.cost], [cost, rarity, target, plusCost], id);
    assert.equal(card.archetype, "ghost", id);
    assert.match(card.subtitle, /^GHOST \/ [A-Z ]+$/, id);
    assert.ok(card.rules.length <= 90 && upgraded.rules.length <= 90, `${id}: a short face (${card.rules.length}, ${upgraded.rules.length})`);
    assert.ok(upgraded.cost < card.cost || upgraded.rules !== card.rules, `${id}+ improves`);
    // Keywords are on the face; the numbers a face mentions come from its values.
    for (const [flag, word] of [["exhaust", "Exhaust."], ["retain", "Retain."], ["innate", "Innate."]] as const) {
      assert.equal(!!card[flag], card.rules.includes(word), `${id} ${flag}`);
      assert.equal(!!upgraded[flag], upgraded.rules.includes(word), `${id}+ ${flag}`);
    }
    if (target === "daemon") assert.ok(card.rules.startsWith("Daemon."), id);
    // (Counts of one read as words: "a Payload", "The next jam or cut"; Deep Queue prints its multiplier.)
    for (const face of [card, upgraded])
      for (const [key, value] of Object.entries(face.values)) {
        if (typeof value !== "number" || (value === 1 && ["tokens", "misses", "dodges", "absorbs"].includes(key))) continue;
        const printed = id === "deep-queue" && key === "amount" ? RULES.bufferMultiplier + value : value;
        if (key !== "absorbs" || value > 2) assert.ok(face.rules.includes(String(printed)), `${face.id} prints ${key} ${printed}`);
      }
    // Keeper cards are offered only to the Ghost; the token, the basic and nothing else never.
    const offered = !["basic", "special"].includes(rarity);
    assert.equal(REWARD_POOL.includes(id), offered, id);
    assert.equal(offeredTo(id, "architect"), false);
  }
  assert.ok(CARDS.payload.token && !offeredTo("payload", "ghost"));
  assert.deepEqual(STARTER_SIGNATURES.ghost, ["store-forward", "dark-fiber"]);
  assert.equal(starterDeck("ghost").length, 12);
  assert.equal(CARDS.payload.values.damage, RULES.payloadDamage);
});

// ------------------------------------------------------------------ Buffer

test("Store and Forward adds 4 to the buffer (6 upgraded)", () => {
  const r = table();
  r.hand = ["store-forward", "store-forward+"];
  play(r, "store-forward");
  assert.equal(r.buffer, 4);
  play(r, "store-forward+");
  assert.equal(r.buffer, 4 + 6);
  assert.equal(r.energy, 20 - 2);
});

test("Jitter Buffer adds 3 to the buffer and draws 1 (5 upgraded)", () => {
  const r = table();
  r.hand = ["jitter-buffer", "jitter-buffer+"];
  r.drawPile = ["pulse", "patch"];
  play(r, "jitter-buffer");
  assert.equal(r.buffer, 3);
  assert.deepEqual(r.hand, ["jitter-buffer+", "pulse"]);
  play(r, "jitter-buffer+");
  assert.equal(r.buffer, 3 + 5);
  assert.deepEqual(r.hand, ["pulse", "patch"]);
});

test("Hold Queue: 4 block; while buffering it also adds 4 to the buffer (6 / 6 upgraded)", () => {
  const r = table();
  route(r, "r1", 0);
  r.hand = ["hold-queue", "hold-queue", "hold-queue+"];
  play(r, "hold-queue");
  assert.deepEqual([r.block, r.buffer], [4, 0], "not buffering: block only");
  assert.ok(useConsole(r).ok, "the Buffer console arms buffering");
  assert.ok(r.buffering);
  play(r, "hold-queue");
  assert.deepEqual([r.block, r.buffer], [8, 4]);
  play(r, "hold-queue+");
  assert.deepEqual([r.block, r.buffer], [14, 10]);
});

test("Flush needs a buffer (refused at no cost) and adds +4 damage this turn without spending it (+6 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["flush", "flush+"];
  const before = structuredClone(r);
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "Your buffer is empty." });
  assert.deepEqual(r, before, "nothing spent");
  r.buffer = 3;
  play(r, "flush");
  play(r, "flush+");
  assert.equal(r.packetBoost, 4 + 6);
  assert.equal(r.buffer, 3, "the buffer stays");
  const { preview } = agree(r);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 10 + 3);
});

test("Spearhead: the buffer release ignores armor this turn; the rest of the packet still pays it (cost 0 upgraded)", () => {
  // The Colossus's graded armor plus ARMORED plating outweigh the route's own damage.
  const armor = RULES.gradedArmorBase + RULES.armoredPlating;
  assert.ok(armor > RULES.baseRouteDamage);
  const armored = () => {
    const r = table("colossus", 0);
    r.enemies[0].designations = ["armored"];
    route(r, "r1", 0);
    r.buffer = 10;
    return r;
  };
  const plain = combatPreview(armored());
  assert.equal(plain.packetDamage, RULES.baseRouteDamage + 10 - armor);
  const r = armored();
  r.hand = ["spearhead+"];
  play(r, "spearhead+");
  assert.equal(r.energy, 20);
  const { preview } = agree(r);
  assert.equal(preview.packetDamage, 10 + Math.max(0, RULES.baseRouteDamage - armor), "the release lands in full");
  assert.equal(term(preview.damageTerms, "Spearhead · the release ignores armor"), preview.packetDamage - plain.packetDamage);
});

test("Trickle: at the start of your turn it adds 2 to the buffer; copies stack (3 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["trickle", "trickle", "trickle+"];
  for (let i = 0; i < 3; i++) play(r, r.hand[0]);
  assert.deepEqual(runningDaemons(r).map(daemon => [daemon.id, daemon.count]), [["trickle", 2], ["trickle+", 1]]);
  assert.equal(r.buffer, 0, "nothing until the next turn");
  useConsole(r); // buffer this turn so the next transmission does not release it
  const stored = combatPreview(r).bufferGain;
  agree(r);
  assert.equal(r.buffer, stored + 2 * 2 + 3);
});

test("Replay Attack: Retain, doubles the buffer, needs one (cost 0 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["replay-attack"];
  assert.equal(playInstant(r, 0).ok, false, "an empty buffer");
  r.buffer = 7;
  r.hand = ["replay-attack+"];
  play(r, "replay-attack+");
  assert.equal(r.buffer, 14);
  assert.ok(r.exhaustPile.includes("replay-attack+"));
  assert.equal(r.energy, 20);
  assert.ok(CARDS["replay-attack"].retain);
});

test("Deep Queue: buffering stores ×3, labelled in the forecast; copies stack (cost 1 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["deep-queue", "deep-queue+"];
  play(r, "deep-queue");
  assert.equal(r.energy, 20 - 2);
  useConsole(r);
  const one = combatPreview(r);
  assert.equal(one.bufferGain, RULES.baseRouteDamage * (RULES.bufferMultiplier + 1));
  assert.ok(one.damageTerms.some(item => item.label === `Stored in buffer · +${one.bufferGain} (×3 · Deep Queue)`));
  play(r, "deep-queue+");
  assert.equal(r.energy, 20 - 2 - 1);
  const { preview } = agree(r);
  assert.equal(preview.bufferGain, RULES.baseRouteDamage * (RULES.bufferMultiplier + 2), "Deep Queue and Deep Queue+ stack");
  assert.equal(r.buffer, preview.bufferGain);
  assert.ok(DAEMON_HOOKS["deep-queue"]?.bufferMultiplier, "a pure resolver hook");
});

test("Exfiltrate: Retain; deals the buffer to the target now, ignoring armor, with overflow; empties it (cost 0 upgraded)", () => {
  const r = pack([["spark-mite", "left", "escort", 4], ["colossus", "centre", "leader", 30]]);
  r.focus = "left";
  r.energy = 20;
  r.hand = ["exfiltrate"];
  assert.deepEqual(playInstant(r, 0), { ok: false, message: "Your buffer is empty." });
  r.buffer = 10;
  const result = play(r, "exfiltrate");
  assert.match(result.message, /10 dealt · 1 down/);
  assert.equal(r.enemies[0].hp, 0);
  assert.equal(r.enemies[1].hp, 30 - 6, "the overflow ignores the Colossus's armor too");
  assert.equal(r.buffer, 0);
  assert.ok(r.exhaustPile.includes("exfiltrate"));
  assert.equal(r.energy, 20 - 1);
  assert.ok(CARDS.exfiltrate.retain && CARDS["exfiltrate+"].retain);
  assert.equal(CARDS["exfiltrate+"].cost, 0);
});

// ------------------------------------------------------------------ Evasion

test("Spoof: 3 block and the next cut misses; the forecast names it (5 block upgraded)", () => {
  const r = table("wraith", 0); // a cut
  route(r, "r1", 0);
  r.hand = ["spoof"];
  play(r, "spoof");
  assert.equal(r.block, 3);
  const { preview } = agree(r);
  assert.deepEqual(preview.evasions.map(item => [item.kind, item.source]), [["miss", "Spoof"]]);
  assert.equal(preview.hostiles[0].missed, 1);
  assert.deepEqual(r.faultLinks, []);
  assert.equal(CARDS["spoof+"].values.block, 5);
  assert.match(CARDS["spoof+"].rules, /^Gain 5 block\. The next jam or cut this enemy phase misses\.$/);
});

test("Phantom Node: a phantom absorbs the next jam (two upgraded), then fades", () => {
  const r = table("wraith", 2); // a jam
  route(r, "r1", 0);
  r.hand = ["phantom-node", "phantom-node+"];
  assert.ok(playGround(r, 0, 2.5, 2.4).ok);
  assert.ok(playGround(r, 0, -2.5, 2.4).ok);
  const phantoms = r.topology.nodes.filter(node => node.role === "phantom");
  assert.deepEqual(phantoms.map(node => node.absorbs), [1, 2]);
  const { preview } = agree(r);
  assert.equal(preview.hostiles[0].absorbed, 1);
  assert.deepEqual(r.faultNodes, []);
  assert.equal(r.topology.nodes.filter(node => node.role === "phantom").length, 1, "the spent phantom fades");
});

test("Dark Fiber: a cut-proof cable the Wraith cannot cut; Exhaust (draws 1 upgraded)", () => {
  const r = table("wraith", 0); // a cut
  device(r, "r1", "router", 0, 0);
  r.hand = ["dark-fiber", "dark-fiber+"];
  r.drawPile = ["pulse"];
  assert.ok(playLink(r, 0, "alpha", "r1").ok);
  assert.ok(playLink(r, 0, "r1", "omega").ok);
  assert.ok(r.topology.links.every(link => link.armored));
  assert.deepEqual(r.hand, ["pulse"], "Dark Fiber+ drew 1");
  assert.deepEqual(r.exhaustPile, ["dark-fiber", "dark-fiber+"]);
  agree(r);
  assert.deepEqual(r.faultLinks, []);
});

test("Decoy Swarm: 2 phantoms on free sockets, each absorbing one disruption (3 upgraded); refused on a full table", () => {
  const r = table("wraith", 2); // a jam
  route(r, "r1", 0);
  r.hand = ["decoy-swarm"];
  const result = play(r, "decoy-swarm");
  assert.match(result.message, /2 phantoms deployed/);
  const phantoms = r.topology.nodes.filter(node => node.role === "phantom");
  assert.equal(phantoms.length, 2);
  assert.ok(phantoms.every(node => node.absorbs === 1 && node.deployedBy === "decoy-swarm"));
  assert.ok(r.exhaustPile.includes("decoy-swarm"));
  const { preview } = agree(r);
  assert.equal(preview.hostiles[0].absorbed, 1);
  assert.deepEqual(r.faultNodes, []);
  assert.equal(r.topology.nodes.filter(node => node.role === "phantom").length, 1);
  const u = table();
  u.hand = ["decoy-swarm+"];
  play(u, "decoy-swarm+");
  assert.equal(u.topology.nodes.filter(node => node.role === "phantom").length, 3);
  const full = table();
  for (let i = full.topology.nodes.length; i < RULES.maxDevices; i++) device(full, `x${i}`, "switch", 0, 0);
  full.hand = ["decoy-swarm"];
  assert.deepEqual(playInstant(full, 0), { ok: false, message: "The table has no free socket for a phantom." });
  assert.equal(full.energy, 20);
});

test("Ghost Protocol: the first strike this enemy phase deals 0; Exhaust (cost 1 upgraded)", () => {
  const r = table("wraith", 1); // a strike
  route(r, "r1", 0);
  r.hand = ["ghost-protocol"];
  play(r, "ghost-protocol");
  assert.equal(r.energy, 20 - 2);
  const { preview } = agree(r);
  assert.equal(preview.incoming, 0);
  assert.equal(preview.hostiles[0].dodged, "Ghost Protocol");
  assert.deepEqual(preview.evasions.map(item => [item.kind, item.source]), [["dodge", "Ghost Protocol"]]);
  assert.equal(r.integrity, 100);
  assert.ok(r.exhaustPile.includes("ghost-protocol"));
  // This enemy phase only: the next strike lands.
  r.enemies[0].turn = 1;
  assert.ok(agree(r).preview.incoming > 0);
  assert.equal(CARDS["ghost-protocol+"].cost, 1);
});

test("Obfuscation: the first jam or cut of every enemy phase misses (cost 1 upgraded)", () => {
  const r = table("wraith", 2); // jam, then cut
  route(r, "r1", 0);
  r.hand = ["obfuscation+"];
  play(r, "obfuscation+");
  assert.equal(r.energy, 20 - 1);
  assert.deepEqual(agree(r).preview.evasions.map(item => [item.kind, item.source]), [["miss", "Obfuscation+"]]);
  assert.deepEqual(r.faultNodes, []);
  r.enemies[0].turn = 0; // the next action cuts
  assert.deepEqual(agree(r).preview.evasions.map(item => [item.kind, item.source]), [["miss", "Obfuscation+"]], "every phase");
  assert.deepEqual(r.faultLinks, []);
});

test("Obfuscation copies stack: two miss the Splicer's twin cut", () => {
  const r = pack([["splicer", "left", "escort", 50, 0], ["wraith", "centre", "leader", 200, 1]]);
  r.enemyPhase = 0; // the escort acts on the next (odd) phase
  route(r, "r1", 0);
  device(r, "r2", "router", 0, 2.4);
  wire(r, "alpha", "r2", "omega");
  r.daemons = ["obfuscation", "obfuscation"];
  const bare = combatPreview({ ...structuredClone(r), daemons: [] });
  assert.equal(bare.hostiles[0].cuts.length, 2, "a twin cut while the leader lives");
  const { preview } = agree(r);
  assert.deepEqual(preview.evasions.map(item => [item.kind, item.source]), [["miss", "Obfuscation ×2"], ["miss", "Obfuscation ×2"]]);
  assert.deepEqual(r.faultLinks, []);
});

// ------------------------------------------------------------------ Payloads

test("Payload: a token for +2 damage this turn, printed as a labelled term (never burst); Exhaust (+3 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  api.addTokens(r, "payload", 2);
  r.hand.push("payload+");
  play(r, "payload");
  play(r, "payload");
  play(r, "payload+");
  assert.equal(r.packetBoost, 0, "no burst");
  assert.deepEqual([r.turnEffects!.payloads, r.turnEffects!.payloadDamage], [3, 2 * RULES.payloadDamage + 3]);
  assert.deepEqual(r.exhaustPile, ["payload", "payload", "payload+"]);
  assert.ok(!r.discardPile.includes("payload"));
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Payload ×3"), 2 * RULES.payloadDamage + 3);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 2 * RULES.payloadDamage + 3);
});

test("Fork Bomb adds 3 Payloads (4 upgraded); a full hand sends the rest to discard", () => {
  const r = table();
  r.hand = ["fork-bomb", "fork-bomb+"];
  play(r, "fork-bomb");
  assert.deepEqual(r.hand, ["fork-bomb+", "payload", "payload", "payload"]);
  const result = play(r, "fork-bomb+");
  assert.match(result.message, /4 Payloads in hand/);
  assert.equal(r.hand.filter(id => id === "payload").length, 7);
  r.hand.push("fork-bomb", "guard");
  const full = play(r, "fork-bomb");
  assert.match(full.message, /2 Payloads in hand, 1 to discard/);
  assert.equal(r.hand.length, RULES.handLimit);
  assert.equal(r.discardPile.filter(id => id === "payload").length, 1);
  assert.equal(r.encounterCards.filter(id => id === "payload").length, 10, "all of them are encounter-only");
});

test("Shell Access: 4 block and a Payload (6 block upgraded)", () => {
  const r = table();
  r.hand = ["shell-access", "shell-access+"];
  play(r, "shell-access");
  play(r, "shell-access+");
  assert.equal(r.block, 4 + 6);
  assert.deepEqual(r.hand, ["payload", "payload"]);
});

test("Side Channel: +1 damage per card played this turn, itself included (cost 0 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["guard", "guard", "side-channel", "side-channel+"];
  play(r, "guard");
  play(r, "guard");
  play(r, "side-channel");
  assert.equal(r.packetBoost, 3);
  play(r, "side-channel+");
  assert.equal(r.packetBoost, 3 + 4);
  assert.equal(r.energy, 20 - 3);
  const { preview } = agree(r);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 7);
});

test("Exploit Kit: Payloads deal +1 more, per Payload and per copy, labelled; played after them it still counts (+2 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  api.addTokens(r, "payload", 2);
  play(r, "payload");
  play(r, "payload");
  r.hand = ["exploit-kit", "exploit-kit", "exploit-kit+"];
  for (let i = 0; i < 3; i++) play(r, r.hand[0]);
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Exploit Kit ×2 · Payloads ×2"), 2 * 1 * 2);
  assert.equal(term(preview.damageTerms, "Exploit Kit+ · Payloads ×2"), 2 * 2);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 2 * RULES.payloadDamage + 4 + 4);
  assert.equal(r.daemons.length, 3, "daemons run on into the next turn");
});

test("Botnet: a Payload at the start of every turn; copies stack; Botnet+ is Innate", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["botnet", "botnet"];
  play(r, "botnet");
  play(r, "botnet");
  agree(r);
  assert.equal(r.hand.filter(id => id === "payload").length, 2);
  assert.equal(r.encounterCards.filter(id => id === "payload").length, 2);
  assert.equal(r.hand.length, RULES.handDraw + 2, "after the draw");
  assert.ok(CARDS["botnet+"].innate && !CARDS.botnet.innate);
  assert.equal(CARDS["botnet+"].rules, "Daemon. Innate. At the start of your turn, add a Payload to your hand.");
  const e = newExpedition("ghost", 31).run;
  e.deck = [...starterDeck("ghost"), "botnet+"];
  chooseRoom(e, "0-1");
  assert.ok(e.hand.includes("botnet+"), "Innate: in the opening hand");
});

test("Cover Tracks: 1 block whenever a card exhausts (played Exhaust cards, Payloads, Volatile); copies stack (2 upgraded)", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["cover-tracks", "cover-tracks+", "ghost-protocol", "guard"];
  play(r, "cover-tracks");
  play(r, "cover-tracks+");
  assert.equal(r.block, 0, "a daemon never exhausts");
  play(r, "ghost-protocol");
  assert.equal(r.block, 1 + 2);
  api.addTokens(r, "payload", 1);
  play(r, "payload");
  assert.equal(r.block, 2 * 3);
  play(r, "guard");
  assert.equal(r.block, 2 * 3 + CARDS.guard.values.block!, "a discarded card is not exhausted");
  r.hand = ["packet-loss"];
  const { preview } = agree(r);
  assert.equal(r.block, preview.nextTurn.block + 3, "Volatile exhausts at the end of the turn");
});

test("Man-in-the-Middle: every card played after it this turn adds 2 to the buffer, Payloads included (3 upgraded)", () => {
  const r = table();
  r.hand = ["man-in-the-middle", "guard", "man-in-the-middle+", "guard"];
  play(r, "man-in-the-middle");
  assert.equal(r.buffer, 0, "it does not feed itself");
  play(r, "guard");
  assert.equal(r.buffer, 2);
  play(r, "man-in-the-middle+");
  assert.equal(r.buffer, 4, "the first still hears the second");
  play(r, "guard");
  assert.equal(r.buffer, 4 + 2 + 3);
  api.addTokens(r, "payload", 1);
  play(r, "payload");
  assert.equal(r.buffer, 9 + 5);
  assert.deepEqual(r.exhaustPile.filter(id => id.startsWith("man")), ["man-in-the-middle", "man-in-the-middle+"]);
  r.enemies[0].turn = 1;
  endTurn(r);
  r.buffer = 0;
  r.hand = ["guard"];
  play(r, "guard");
  assert.equal(r.buffer, 0, "this turn only");
});

// ------------------------------------------------------------------ build paths

test("Buffer path: Deep Queue and Trickle running, Hold Queue and Store and Forward on a buffered turn, then a Spearhead release through armor", () => {
  // The Colossus's armor (graded + ARMORED plating) swallows a plain route whole.
  const armor = RULES.gradedArmorBase + RULES.armoredPlating;
  const r = table("colossus", 0);
  r.enemies[0].designations = ["armored"];
  r.enemies[0].hp = r.enemies[0].maxHp = 300;
  route(r, "r1", 0);
  r.hand = ["deep-queue", "trickle", "store-forward", "hold-queue"];
  r.drawPile = Array(30).fill("spearhead");
  // Turn 1: two daemons, arm the buffer, then feed it.
  play(r, "deep-queue");
  play(r, "trickle");
  assert.ok(useConsole(r).ok);
  play(r, "hold-queue");
  play(r, "store-forward");
  assert.deepEqual([r.buffer, r.block], [4 + 4, 4]);
  const stored = agree(r).preview;
  assert.equal(stored.bufferGain, RULES.baseRouteDamage * 3, "the route stored ×3");
  assert.equal(stored.packetDamage, 0);
  // Turn 2: Trickle tops it up at the start of the turn; Spearhead lets it all through the plating.
  const buffer = 8 + 15 + 2;
  assert.equal(r.buffer, buffer);
  r.energy = 20;
  play(r, "spearhead");
  const hp = r.enemies[0].hp;
  const { preview } = agree(r);
  assert.equal(preview.bufferRelease, buffer);
  assert.equal(preview.packetDamage, buffer + Math.max(0, RULES.baseRouteDamage - armor), "every stored point lands");
  assert.equal(r.enemies[0].hp, hp - preview.packetDamage);
  assert.equal(r.buffer, 2, "released, then Trickle starts a new one");
});

test("Evasion path: Obfuscation and Spoof miss the Splicer's twin cut, Ghost Protocol dodges the Wraith's strike, Dark Fiber holds", () => {
  // The Splicer (escort) twin-cuts while the Wraith (leader) lives; the Wraith strikes. The primary
  // channel runs on Dark Fiber (cut-proof), the second on plain cable (the Splicer's targets).
  const r = pack([["splicer", "left", "escort", 50, 0], ["wraith", "centre", "leader", 200, 1]]);
  r.enemyPhase = 0; // the escort acts on the next (odd) phase
  r.energy = 20;
  device(r, "r1", "router", 0, 0);
  device(r, "r2", "router", 0, 2.4);
  wire(r, "alpha", "r2", "omega");
  r.hand = ["obfuscation", "dark-fiber", "dark-fiber", "spoof", "ghost-protocol"];
  play(r, "obfuscation");
  assert.ok(playLink(r, r.hand.indexOf("dark-fiber"), "alpha", "r1").ok);
  assert.ok(playLink(r, r.hand.indexOf("dark-fiber"), "r1", "omega").ok);
  play(r, "spoof");
  play(r, "ghost-protocol");
  // Without the Ghost's evasion the plain channel falls and the strike lands.
  const bare = combatPreview({ ...structuredClone(r), daemons: [], turnEffects: {}, block: 0 });
  assert.deepEqual(bare.faultTargets.sort(), ["alpha::r2", "omega::r2"].sort());
  assert.ok(bare.incoming > 0);
  const { preview } = agree(r);
  assert.deepEqual(preview.evasions.map(item => [item.kind, item.source]), [["miss", "Spoof"], ["miss", "Obfuscation"], ["dodge", "Ghost Protocol"]]);
  assert.deepEqual(preview.faultTargets, []);
  assert.equal(preview.hostiles[1].dodged, "Ghost Protocol");
  assert.equal(preview.incoming, 0);
  assert.deepEqual(r.faultLinks, []);
  assert.equal(r.integrity, 100);
  assert.equal(combatPreview(r).channels, 2, "both channels live for the next turn");
});

test("Payloads path: Botnet, Exploit Kit and Cover Tracks running, a Fork Bomb, then Side Channel counts the chain", () => {
  const r = table("wraith", 1);
  route(r, "r1", 0);
  r.hand = ["botnet", "exploit-kit", "cover-tracks", "fork-bomb", "side-channel"];
  for (const id of ["botnet", "exploit-kit", "cover-tracks", "fork-bomb"] as CardId[]) play(r, id);
  for (let i = 0; i < 3; i++) play(r, "payload");
  play(r, "side-channel");
  assert.equal(r.block, 3, "Cover Tracks: three Payloads exhausted");
  assert.equal(r.packetBoost, 8, "Side Channel: eight cards this turn");
  const { preview } = agree(r);
  assert.equal(term(preview.damageTerms, "Payload ×3"), 3 * RULES.payloadDamage);
  assert.equal(term(preview.damageTerms, "Exploit Kit · Payloads ×3"), 3);
  assert.equal(preview.packetDamage, RULES.baseRouteDamage + 3 * RULES.payloadDamage + 3 + 8);
  // The next turn Botnet hands over a fresh Payload.
  assert.equal(r.hand.filter(id => id === "payload").length, 1);
});
