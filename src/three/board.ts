/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import * as THREE from "three";
import { ENEMIES } from "../core/enemies.ts";
import { STAGES } from "../core/stages.ts";
import type { RunState, Zone } from "../core/types.ts";
import { glow, mat } from "./materials.ts";
import { loadBoardModel, loadBoardTexture } from "./models.ts";

/**
 * The battle board: a Blender frame per stage or guardian, dressed by the leader's crest, around a
 * textured tabletop (blender/boards, blender/README.md is the contract). World.ts keeps its
 * code-built table until the chosen board has arrived.
 *
 *   public/models/boards/<board>.glb          the frame: copper, glass, blackout (stages I-III);
 *                                             regent, cantor, core (the guardians' own boards)
 *   public/models/boards/crests/<leader>.glb  a leader's crest and corner finials for a stage board
 *   public/models/boards/table-*.jpg          the tabletop: base colour per stage and guardian, normal, roughness/metal
 */
export const STAGE_BOARDS = ["copper", "glass", "blackout"] as const;
export const GUARDIAN_BOARDS = ["regent", "cantor", "core"] as const;
export type BoardName = (typeof STAGE_BOARDS)[number] | (typeof GUARDIAN_BOARDS)[number];
/** Leaders with a crest: every hostile that leads or fights alone, the guardians excepted. */
export const CREST_LEADERS: readonly string[] = [
  "leech", "wraith", "prophet", "serpent", "moth", "sentinel", "colossus", "weaver", "storm", "widow", "marshal", "choir",
  "reaver", "foreman", "nest", "demolition", "blight",
];
/** Each board's own accent (inlay lights, lamps), used when no leader brings its colour. */
export const BOARD_ACCENTS: Record<BoardName, number> = {
  copper: 0x62fce3, glass: 0xb69cff, blackout: 0xff6a4a, regent: 0x90d2a5, cantor: 0xc6a0ee, core: 0xff777e,
};

export interface BoardKey {
  /** The frame: the stage's board or a guardian's own. */
  board: BoardName;
  /** Zero-based stage: the tabletop textures. */
  stage: number;
  /** The leader whose crest dresses a stage board, or null. */
  crest: string | null;
  /** The accent colour of the board's inlay lights (the leader's, or a duo's first hostile's); null: the board's own. */
  accent: number | null;
}

const clampStage = (stage: number) => Math.min(STAGE_BOARDS.length - 1, Math.max(0, stage | 0));
const isGuardian = (id: string): id is (typeof GUARDIAN_BOARDS)[number] => (GUARDIAN_BOARDS as readonly string[]).includes(id);

/**
 * The board of the run's current encounter: its stage's board dressed by the leader's crest in the
 * leader's colour; a guardian's own board; for a leaderless duo the stage board in the first
 * hostile's colour; Field Training and anything without hostiles the plain stage board. It reads the
 * encounter's room first, so a death or a newcomer mid-battle never changes it.
 */
export function boardFor(run: Pick<RunState, "stage" | "map" | "currentRoom" | "enemies">): BoardKey {
  const stage = clampStage(run.stage);
  const plain: BoardKey = { board: STAGE_BOARDS[stage], stage, crest: null, accent: null };
  // Field Training's drills run in a room of their own (src/tutorial/lessons.ts).
  if (run.currentRoom === "training") return plain;
  const room = run.map.find(item => item.id === run.currentRoom);
  const lead = run.enemies.find(enemy => enemy.role === "leader" || enemy.role === "single");
  const leader = lead?.id ?? (room?.type === "boss" ? room.enemyId ?? STAGES[stage].boss : room?.enemyId) ?? null;
  if (leader && isGuardian(leader)) return { board: leader, stage, crest: null, accent: null };
  if (leader && ENEMIES[leader]) return { ...plain, crest: CREST_LEADERS.includes(leader) ? leader : null, accent: ENEMIES[leader].color };
  const first = room?.pack?.[0] ?? [...run.enemies].sort((a, b) => a.uid.localeCompare(b.uid, undefined, { numeric: true }))[0]?.id;
  return first && ENEMIES[first] ? { ...plain, accent: ENEMIES[first].color } : plain;
}

/** A board key from a preview spec: "glass", "regent", "copper:leech", or a leader id ("widow") on the stage's board. */
export function boardFromSpec(spec: string, stage = 0): BoardKey | null {
  const [name, leader] = spec.split(":");
  const at = clampStage(stage);
  if ((GUARDIAN_BOARDS as readonly string[]).includes(name)) return { board: name as BoardName, stage: at, crest: null, accent: null };
  const base = (STAGE_BOARDS as readonly string[]).indexOf(name);
  const id = base >= 0 ? leader ?? null : name;
  if (id !== null && !ENEMIES[id]) return null;
  const board = base >= 0 ? STAGE_BOARDS[base] : STAGE_BOARDS[at];
  return {
    board, stage: base >= 0 ? base : at,
    crest: id && CREST_LEADERS.includes(id) ? id : null, accent: id ? ENEMIES[id].color : null,
  };
}

export const boardId = (key: BoardKey) => `${key.board}:${key.stage}:${key.crest ?? "-"}:${key.accent ?? "-"}`;

/** The runtime-driven parts of a band: its stencilled name (lit, its emission lights) and rail lamps (unlit). */
export interface BoardBand {
  labels: THREE.MeshPhysicalMaterial[];
  lamps: THREE.MeshBasicMaterial[];
}
export interface Board {
  key: BoardKey;
  /** Add to the table group at the table surface (World.ts: y 0.6 in the group at -0.42). */
  root: THREE.Group;
  bands: Record<Zone, BoardBand>;
  spinners: { object: THREE.Object3D; speed: number; axis: "y" | "z" }[];
  blinkers: { material: THREE.MeshBasicMaterial; phase: number; speed: number; base: number }[];
  /** Everything this board owns (geometry and textures are shared caches). */
  materials: THREE.Material[];
}

/** The tabletop's size: the well inside every frame (blender/boards/surface.py). */
export const TABLETOP = { width: 16.5, depth: 10.7 };

type Extras = { hook?: string; slot?: string; speed?: number; axis?: "y" | "z"; phase?: number; base?: number; opacity?: number };

/**
 * Builds a board: the frame, the crest (a stage board's slots "crest" and "finial" give way to it)
 * and the tabletop. Without `textures` (the test renderer) the tabletop is plain metal. Resolves null
 * when the frame cannot load: keep the code-built table then.
 */
export async function buildBoard(key: BoardKey, options: { textures: boolean }): Promise<Board | null> {
  // A guardian's deck has its own tint; every other board its stage's.
  const deck = (GUARDIAN_BOARDS as readonly string[]).includes(key.board) ? key.board : STAGE_BOARDS[clampStage(key.stage)];
  const [frame, crest, albedo, normal, rm] = await Promise.all([
    loadBoardModel(`boards/${key.board}`),
    key.crest ? loadBoardModel(`boards/crests/${key.crest}`) : Promise.resolve(null),
    options.textures ? loadBoardTexture(`boards/table-${deck}.jpg`, true) : Promise.resolve(null),
    options.textures ? loadBoardTexture("boards/table-normal.jpg", false) : Promise.resolve(null),
    options.textures ? loadBoardTexture("boards/table-rm.jpg", false) : Promise.resolve(null),
  ]);
  if (!frame) return null;
  const accent = key.accent ?? BOARD_ACCENTS[key.board];
  const root = new THREE.Group();
  root.name = `board-${key.board}`;
  const shared = new Map<string, THREE.Material>();
  const board: Board = {
    key, root, spinners: [], blinkers: [], materials: [],
    bands: { north: { labels: [], lamps: [] }, center: { labels: [], lamps: [] }, south: { labels: [], lamps: [] } },
  };
  const body = frame.clone(true);
  root.add(body);
  if (crest) {
    const dressing = crest.clone(true);
    const slots = new Set<string>();
    dressing.traverse(object => { if ((object.userData as Extras).slot) slots.add((object.userData as Extras).slot!); });
    body.traverse(object => { if (slots.has((object.userData as Extras).slot ?? "")) object.visible = false; });
    root.add(dressing);
  }
  root.traverse(object => {
    const extras = object.userData as Extras;
    if (extras.hook === "spinner") board.spinners.push({ object, speed: extras.speed ?? 0.4, axis: extras.axis ?? "y" });
    const blinking = extras.hook === "blinker";
    if (!(object instanceof THREE.Mesh)) return;
    object.material = boardMaterial(object.material as THREE.MeshStandardMaterial, accent, blinking ? null : shared, board);
    const lit = object.material instanceof THREE.MeshPhysicalMaterial;
    object.castShadow = lit;
    object.receiveShadow = lit;
    if (blinking && object.material instanceof THREE.MeshBasicMaterial) {
      object.material.transparent = true;
      board.blinkers.push({ material: object.material, phase: extras.phase ?? 0, speed: extras.speed ?? 1.5, base: extras.base ?? 0.9 });
    }
  });
  const table = new THREE.MeshPhysicalMaterial({
    color: albedo ? 0xffffff : 0x34373a, map: albedo, normalMap: normal, roughnessMap: rm, metalnessMap: rm,
    metalness: rm ? 1 : 0.4, roughness: rm ? 1 : 0.6, envMapIntensity: 0.7,
  });
  board.materials.push(table);
  const tabletop = new THREE.Mesh(new THREE.PlaneGeometry(TABLETOP.width, TABLETOP.depth), table);
  tabletop.rotation.x = -Math.PI / 2;
  tabletop.receiveShadow = true;
  tabletop.name = "tabletop";
  root.add(tabletop);
  return board;
}

/** Board materials by name (blender/README.md): accent_* take the board's accent; band_<zone>_label and
 * band_<zone>_lamp are collected for World.ts to drive; glow_* are unlit; the rest is lit metal. */
function boardMaterial(source: THREE.MeshStandardMaterial, accent: number, shared: Map<string, THREE.Material> | null, board: Board) {
  const name = source.name;
  const known = shared?.get(name);
  if (known) return known;
  let result: THREE.Material;
  const opacity = (source.userData as Extras).opacity ?? 1;
  if (name.startsWith("accent_luminous")) result = mat(new THREE.Color(accent).multiplyScalar(0.4).getHex(), accent, 0.5);
  else if (name.startsWith("accent_glow")) result = glow(accent, opacity);
  else if (/^(glow|band_)/.test(name) && !name.endsWith("_label")) {
    const basic = glow(0xffffff, opacity);
    basic.color.copy(source.color);
    result = basic;
  } else {
    const lit = mat(0xffffff);
    lit.color.copy(source.color);
    lit.metalness = source.metalness;
    lit.roughness = source.roughness;
    lit.emissive.copy(source.emissive);
    lit.emissiveIntensity = 0;
    result = lit;
  }
  result.name = name;
  result.side = source.side;
  const band = /^band_(north|center|south)_(label|lamp)$/.exec(name);
  if (band) {
    const parts = board.bands[band[1] as Zone];
    if (band[2] === "label") parts.labels.push(result as THREE.MeshPhysicalMaterial);
    else parts.lamps.push(result as THREE.MeshBasicMaterial);
  }
  shared?.set(name, result);
  board.materials.push(result);
  return result;
}

/** Per-frame life: spinners turn, blinkers blink. */
export function animateBoard(board: Board, time: number, motion: number, reduced: boolean) {
  for (const spinner of board.spinners) spinner.object.rotation[spinner.axis] += motion * spinner.speed;
  for (const blinker of board.blinkers) {
    const on = reduced ? 1 : 0.35 + 0.65 * (Math.sin(time * blinker.speed + blinker.phase) > -0.2 ? 1 : 0.15);
    blinker.material.opacity = blinker.base * on;
  }
}

/** Frees the board's own materials (its geometry and textures stay cached for the next battle). */
export function disposeBoard(board: Board) {
  board.root.removeFromParent();
  (board.root.getObjectByName("tabletop") as THREE.Mesh | undefined)?.geometry.dispose();
  for (const material of board.materials) material.dispose();
}
