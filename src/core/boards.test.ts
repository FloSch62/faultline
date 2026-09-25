/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { makeEnemy } from "./encounter.ts";
import { ENEMIES, PACKS } from "./enemies.ts";
import { createRun } from "./run.ts";
import { STAGES } from "./stages.ts";
import type { MapRoom, RunState } from "./types.ts";
import { BOARD_ACCENTS, CREST_LEADERS, GUARDIAN_BOARDS, STAGE_BOARDS, boardFor, boardFromSpec } from "../three/board.ts";

// The battle board's choice (src/three/board.ts) and the board-model contract from blender/README.md,
// checked on the committed GLBs and tabletop textures.

function battle(stage: number, room: Partial<MapRoom>, members: [string, "left" | "centre" | "right", "single" | "leader" | "escort" | "add"][]): RunState {
  const run = createRun(11);
  run.stage = stage;
  run.map = [{ id: "3-1", floor: 3, lane: 1, type: "battle", cleared: false, exits: [], ...room }];
  run.currentRoom = "3-1";
  run.enemies = members.map(([id, port, role], i) => makeEnemy(id, `h${i + 1}`, port, role, 30));
  return run;
}

test("a leader dresses its stage's board in its crest and colour", () => {
  const key = boardFor(battle(1, { enemyId: "widow", pack: ["ward-node"] }, [["widow", "centre", "leader"], ["ward-node", "left", "escort"]]));
  assert.deepEqual(key, { board: "glass", stage: 1, crest: "widow", accent: ENEMIES.widow.color });
  const single = boardFor(battle(2, { enemyId: "colossus" }, [["colossus", "centre", "single"]]));
  assert.deepEqual(single, { board: "blackout", stage: 2, crest: "colossus", accent: ENEMIES.colossus.color });
});

test("guardians fight on their own boards", () => {
  STAGES.forEach((stage, index) => {
    const run = battle(index, { type: "boss", enemyId: undefined }, [[stage.boss, "centre", "single"], ["gate-warden", "left", "add"]]);
    assert.deepEqual(boardFor(run), { board: stage.boss, stage: index, crest: null, accent: null });
    // Before the guardian has entered, the room already names it.
    run.enemies = [];
    assert.equal(boardFor(run).board, stage.boss);
  });
});

test("a duo takes its first hostile's colour; training and an empty table take the plain stage board", () => {
  const duo = battle(0, { pack: ["splicer", "spark-mite"] }, [["splicer", "left", "escort"], ["spark-mite", "right", "escort"]]);
  assert.deepEqual(boardFor(duo), { board: "copper", stage: 0, crest: null, accent: ENEMIES.splicer.color });
  const training = battle(0, { id: "training", enemyId: "leech" }, [["leech", "centre", "single"]]);
  training.currentRoom = "training";
  assert.deepEqual(boardFor(training), { board: "copper", stage: 0, crest: null, accent: null });
  assert.deepEqual(boardFor({ stage: 2, map: [], currentRoom: null, enemies: [] }), { board: "blackout", stage: 2, crest: null, accent: null });
});

test("the board never changes mid-battle: a death or a newcomer in the leader's port keeps it", () => {
  const run = battle(1, { enemyId: "choir", pack: ["glass-echo"] }, [["glass-echo", "left", "escort"], ["choir", "centre", "leader"]]);
  const before = boardFor(run);
  run.enemies[1].hp = 0;
  assert.deepEqual(boardFor(run), before, "the fallen leader stays on the rail");
  run.enemies[1] = makeEnemy("relay-drone", "h4", "centre", "escort", 16);
  assert.deepEqual(boardFor(run), before, "a newcomer took the port: the room still names the leader");
});

test("every hostile that can lead has a crest; guardians have boards", () => {
  const leaders = new Set(PACKS.map(pack => pack.leader).filter((id): id is string => !!id));
  for (const stage of STAGES) for (const id of [...stage.encounters, ...stage.elites]) leaders.add(id);
  for (const id of leaders) assert.ok(CREST_LEADERS.includes(id), `${id} leads but has no crest`);
  for (const id of CREST_LEADERS) assert.ok(ENEMIES[id]?.kind === "hostile" && !ENEMIES[id].boss, `${id} is not a leader hostile`);
  for (const stage of STAGES) assert.ok((GUARDIAN_BOARDS as readonly string[]).includes(stage.boss));
  assert.deepEqual(boardFromSpec("glass:weaver"), { board: "glass", stage: 1, crest: "weaver", accent: ENEMIES.weaver.color });
  assert.deepEqual(boardFromSpec("cantor"), { board: "cantor", stage: 0, crest: null, accent: null });
  assert.equal(boardFromSpec("nobody"), null);
});

async function load(file: string) {
  const bytes = readFileSync(new URL(`../../public/models/${file}.glb`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  let triangles = 0;
  const materials = new Set<string>();
  const slots = new Set<string>();
  gltf.scene.traverse((object) => {
    const slot = (object.userData as { slot?: string }).slot;
    if (slot) slots.add(slot);
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    materials.add((object.material as THREE.Material).name);
  });
  return { bytes: bytes.byteLength, triangles, materials, slots, bounds: new THREE.Box3().setFromObject(gltf.scene) };
}
const NAMES = /^(board_|glow_|accent_(glow|luminous)|band_(north|center|south)_(label|lamp)$)/;

for (const board of [...STAGE_BOARDS, ...GUARDIAN_BOARDS]) {
  test(`${board} board follows the board-model contract`, async () => {
    const model = await load(`boards/${board}`);
    assert.ok(model.bytes <= 1100 * 1024, `${board}.glb is ${Math.round(model.bytes / 1024)} KB`);
    assert.ok(model.triangles <= 36000, `${board}: ${model.triangles} triangles`);
    for (const name of model.materials) assert.match(name, NAMES, `${board}: unknown material ${name}`);
    for (const zone of ["north", "center", "south"])
      for (const part of ["label", "lamp"]) assert.ok(model.materials.has(`band_${zone}_${part}`), `${board}: no band_${zone}_${part}`);
    // A stage board leaves slots for a leader's crest; a guardian's board is complete.
    const stage = (STAGE_BOARDS as readonly string[]).includes(board);
    assert.deepEqual([...model.slots].sort(), stage ? ["crest", "finial"] : []);
    // Y-up: the table surface is y 0; the frame stays within x 9.45, z 6.45 and low on the far side.
    const { min, max } = model.bounds;
    assert.ok(Math.max(-min.x, max.x) <= 9.46 && Math.max(-min.z, max.z) <= 6.46, `${board}: ${min.x.toFixed(2)}..${max.x.toFixed(2)} x ${min.z.toFixed(2)}..${max.z.toFixed(2)}`);
    assert.ok(max.y <= 1.01 && min.y >= -1.71, `${board}: height ${min.y.toFixed(2)}..${max.y.toFixed(2)}`);
    assert.ok(BOARD_ACCENTS[board] > 0);
  });
}

test("every crest dresses both slots within its budget; a battle downloads at most 3 MB of board", async () => {
  const table = (name: string) => statSync(new URL(`../../public/models/boards/table-${name}.jpg`, import.meta.url)).size;
  const shared = table("normal") + table("rm");
  let largest = 0;
  for (const leader of CREST_LEADERS) {
    const model = await load(`boards/crests/${leader}`);
    assert.deepEqual([...model.slots].sort(), ["crest", "finial"], leader);
    assert.ok(model.triangles <= 8000 && model.bytes <= 240 * 1024, `${leader}: ${model.triangles} triangles, ${model.bytes} bytes`);
    for (const name of model.materials) assert.match(name, /^(board_|accent_(glow|luminous))/, `${leader}: material ${name}`);
    largest = Math.max(largest, model.bytes);
  }
  for (const board of [...STAGE_BOARDS, ...GUARDIAN_BOARDS]) {
    const frame = statSync(new URL(`../../public/models/boards/${board}.glb`, import.meta.url)).size;
    const total = frame + table(board) + shared + ((STAGE_BOARDS as readonly string[]).includes(board) ? largest : 0);
    assert.ok(total <= 3 * 1024 * 1024, `${board}: ${Math.round(total / 1024)} KB per battle`);
  }
});
