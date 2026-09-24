/** Shared browser-test helpers: deterministic saves, installation and state reads.
 * v4: a battle() fixture is a single hostile at the centre port (the v3 table). */
import { expect, test as base, type Page } from "@playwright/test";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { chooseRoom, endTurn } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { EVENTS } from "../src/core/events.ts";
import { makeEnemy } from "../src/core/encounter.ts";
import { RULES } from "../src/core/cards.ts";
import type { Archetype, CardId, Enemy, HostileRole, Installation, NetworkLink, NetworkNode, Port, RoomType, RunState } from "../src/core/types.ts";

/** v3 malware in a fixture: a Siphon Tap at that socket. */
type Malware = { id: string; x: number; z: number };

export const STORAGE = "faultline-expedition-v2";
export const SETTINGS = "faultline-settings-v2";
export const PREFERENCES = "faultline-preferences-v1";

export interface BattleOptions {
  archetype?: Archetype;
  enemy?: string;
  hp?: number;
  maxHp?: number;
  /** Enemy pattern index (which intent is next). */
  turn?: number;
  hand?: CardId[];
  draw?: CardId[];
  discard?: CardId[];
  energy?: number;
  integrity?: number;
  nodes?: NetworkNode[];
  links?: NetworkLink[];
  /** v3 fixtures: each entry becomes a Siphon Tap. */
  malware?: Malware[];
  installations?: Installation[];
  relics?: RunState["relics"];
  seed?: number;
}

/** Energy of a v5 turn with no energy relic: every fixture's default (tests read it, never a literal). */
export const ENERGY = RULES.baseEnergy;

/** A clean first-stage encounter: terminals only, no terrain, a chosen hostile and hand. */
export function battle(options: BattleOptions = {}): Expedition {
  const e = newExpedition(options.archetype ?? "architect", options.seed ?? 0x5eed1234);
  const r = e.run;
  const room = r.map.find(item => item.floor === 0 && item.type === "battle")!;
  expect(chooseRoom(r, room.id).ok).toBe(true);
  const id = options.enemy ?? "leech";
  const maxHp = options.maxHp ?? options.hp ?? 60;
  r.enemies = [{ ...makeEnemy(id, "h1", "centre", "single", maxHp, { turn: options.turn ?? 0 }), hp: options.hp ?? maxHp }];
  r.focus = "centre";
  void ENEMIES;
  r.bossIntroSeen = true;
  r.terrain = null;
  r.zoneEffects = [];
  r.installations = options.installations ?? (options.malware ?? []).map(({ id, x, z }) => ({ id, kind: "tap" as const, x, z, integrity: 1, activeFrom: 0, owner: "h1" }));
  r.topology.nodes = [...r.topology.nodes.filter(node => node.fixed), ...(options.nodes ?? [])];
  r.topology.links = options.links ?? [];
  r.nextNodeId = 20;
  r.faultNodes = [];
  r.faultLinks = [];
  r.hand = options.hand ?? ["guard", "guard", "guard"];
  r.drawPile = options.draw ?? Array<CardId>(20).fill("guard");
  r.discardPile = options.discard ?? [];
  r.exhaustPile = [];
  r.energy = options.energy ?? ENERGY;
  if (options.integrity !== undefined) r.integrity = r.maxIntegrity = Math.max(r.maxIntegrity, options.integrity);
  if (options.relics) r.relics = options.relics;
  r.log = ["Test encounter prepared."];
  return e;
}

export interface PackMember {
  id: string;
  port: Port;
  hp?: number;
  maxHp?: number;
  /** Default: the centre leads a pack (a lone hostile is a single); the sides are escorts. */
  role?: HostileRole;
  /** Pattern index (which intent is next). */
  turn?: number;
  /** Any other Enemy field: crate, designations, cadence, … */
  extra?: Partial<Enemy>;
}
const PORT_ORDER: readonly Port[] = ["left", "centre", "right"];
/** battle() with a pack on the far rail: uids h1, h2, … in port order, focus on the leader
 * (else the first member), the first enemy phase ahead (odd: the left escort acts). */
export function pack(members: PackMember[], options: BattleOptions = {}): Expedition {
  const e = battle(options);
  const r = e.run;
  const sorted = [...members].sort((a, b) => PORT_ORDER.indexOf(a.port) - PORT_ORDER.indexOf(b.port));
  r.enemies = sorted.map((member, i) => {
    const role = member.role ?? (member.port === "centre" ? (sorted.length > 1 ? "leader" : "single") : "escort");
    const maxHp = member.maxHp ?? member.hp ?? 30;
    return { ...makeEnemy(member.id, `h${i + 1}`, member.port, role, maxHp, { turn: member.turn ?? 0, ...member.extra }), hp: member.hp ?? maxHp };
  });
  r.focus = r.enemies.find(enemy => enemy.port === "centre")?.port ?? r.enemies[0].port;
  r.enemyPhase = 0;
  r.hostileActions = 0;
  r.reinforcement = null;
  r.signal = null;
  r.offers = [];
  return e;
}

/** A router route ALPHA → id → OMEGA. */
export function route(id: string, x = 0, z = 0): { nodes: NetworkNode[]; links: NetworkLink[] } {
  return { nodes: [{ id, role: "router", x, z }], links: [{ a: "alpha", b: id }, { a: id, b: "omega" }] };
}

/** An expedition standing in front of a chosen room type on a given floor. */
export function atRoom(type: RoomType, archetype: Archetype = "architect", seed = 0x5eed1234): Expedition {
  const e = newExpedition(archetype, seed);
  const room = e.run.map.find(item => item.type === type)!;
  e.run.floor = room.floor;
  e.run.lastRoom = null;
  expect(chooseRoom(e.run, room.id).ok).toBe(true);
  return e;
}

/** An expedition inside a specific event, prepared exactly as the game prepares it. */
export function atEvent(id: string, archetype: Archetype = "architect"): Expedition {
  const e = atRoom("event", archetype);
  const state = { id, resolved: false } as NonNullable<RunState["event"]>;
  EVENTS[id].prepare?.(e.run, state);
  e.run.event = state;
  e.run.phase = "event";
  return e;
}

export interface InstallOptions {
  motion?: boolean;
  fast?: boolean;
  effects?: number;
  /** Extra localStorage entries, written before the page loads. */
  storage?: Record<string, string>;
  /** Click Continue after loading (default true when a save is given). */
  enter?: boolean;
}

/** Load the game with a save (or none) and, by default, continue into it. */
export async function install(page: Page, e: Expedition | null, options: InstallOptions = {}) {
  await page.addInitScript(({ e, storage, settings, preferences, options }) => {
    // Only on the first load: a reload must read what the game itself saved.
    if (sessionStorage.getItem("faultline-test-installed")) return;
    sessionStorage.setItem("faultline-test-installed", "1");
    localStorage.clear();
    if (e) localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem(settings, JSON.stringify({ music: 0, effects: options.effects ?? 0, muted: false, motion: options.motion ?? false }));
    localStorage.setItem(preferences, JSON.stringify({ tips: false, fast: options.fast ?? false }));
    for (const [key, value] of Object.entries(options.storage ?? {})) localStorage.setItem(key, value);
  }, { e, storage: STORAGE, settings: SETTINGS, preferences: PREFERENCES, options: { ...options, storage: options.storage ?? {} } });
  await page.goto("./");
  if (e && options.enter !== false) {
    await page.locator('[data-action="continue"]').click();
    if (e.run.phase === "battle") await idle(page);
  }
}

/** Page errors and console errors seen since the call. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  return errors;
}

// ------------------------------------------------------------------ the 3D table, read from the page

/** What the table shows, read from the three.js scene (see watchTable). */
export interface TableState {
  /** Forecast ghosts (the next plantings): `beam` when the descending beam is drawn, `reach` when
   * the dashed 2.0 reach ring is. */
  ghosts: { x: number; z: number; beam: boolean; reach: boolean }[];
  /** Planted installations with their countdown numeral and blast ring. */
  installations: { id: string; kind: string; x: number; z: number; countdown: number | null; blast: boolean }[];
  /** Wreckage rings on the table. */
  debris: { x: number; z: number }[];
  /** Crates and message fragments standing on the table (y is the prop's height). */
  props: { x: number; y: number; z: number }[];
  /** The selected installation's reach ring (radius 2.0), when shown. */
  selectRing: { x: number; z: number; radius: number } | null;
  /** Visible rail plates (world position of the plate's centre). */
  plates: { port: string; x: number; y: number; z: number }[];
  /** Cables: the channel drawn on the sheath (null: none), the sheath colour and an amplified
   * cable's fibre colour (hex numbers). */
  cables: { key: string; channel: number | null; sheath: number; fibre: number | null; amplified: boolean }[];
  /** Devices: the channel their skirt shows (null: none) and the routes on their junction seal. */
  devices: { id: string; channel: number | null; junction: number | null }[];
}

/**
 * A read-only window into the 3D table that also works on the production build: three.js
 * announces every Scene and WebGLRenderer to `window.__THREE_DEVTOOLS__`, so an init script keeps
 * the renderer and learns, from its render calls, the scene and camera that draw the table.
 * Call before install(); then tableState() / tablePoint().
 */
export async function watchTable(page: Page) {
  await page.addInitScript(() => {
    type Probe = { scene: unknown; camera: unknown };
    const w = window as unknown as { __THREE_DEVTOOLS__?: EventTarget; __table?: Probe };
    const probe: Probe = w.__table = { scene: null, camera: null };
    const hub = new EventTarget();
    hub.addEventListener("observe", event => {
      const renderer = (event as CustomEvent).detail as { isWebGLRenderer?: boolean; render?: (scene: unknown, camera: unknown) => void };
      if (!renderer?.isWebGLRenderer) return;
      // The constructor announces itself before it returns; wrap render once it exists.
      queueMicrotask(() => {
        const render = renderer.render!.bind(renderer);
        renderer.render = (scene: unknown, camera: unknown) => {
          if ((scene as { isScene?: boolean })?.isScene && (camera as { isPerspectiveCamera?: boolean })?.isPerspectiveCamera) {
            probe.scene = scene;
            probe.camera = camera;
          }
          render(scene, camera);
        };
      });
    });
    w.__THREE_DEVTOOLS__ = hub;
  });
}

/** The table as drawn right now (waits for the first rendered frame). */
export async function tableState(page: Page): Promise<TableState> {
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __table?: { scene: unknown } }).__table?.scene)).toBe(true);
  return page.evaluate(() => {
    // Plain object walk: the page has no THREE import, only the scene graph.
    type Node = {
      children: Node[]; parent: Node | null; visible: boolean; isGroup?: boolean; isSprite?: boolean; isScene?: boolean; scale: { y: number };
      position: { x: number; y: number; z: number }; userData: Record<string, any>; matrixWorld: { elements: number[] };
      geometry?: { type?: string; parameters?: { radius?: number; tube?: number } };
    };
    const scene = (window as unknown as { __table: { scene: Node } }).__table.scene;
    const round = (n: number) => Math.round(n * 100) / 100;
    const ringRadius = (group: Node) => group.isGroup && group.children.length >= 8 && group.children[0].geometry?.type === "TorusGeometry"
      ? group.children[0].geometry.parameters?.radius ?? null : null;
    const shown = (node: Node) => { for (let at: Node | null = node; at; at = at.parent) if (!at.visible) return false; return true; };
    const state = {
      ghosts: [] as { x: number; z: number; beam: boolean; reach: boolean }[],
      installations: [] as { id: string; kind: string; x: number; z: number; countdown: number | null; blast: boolean }[],
      debris: [] as { x: number; z: number }[],
      props: [] as { x: number; y: number; z: number }[],
      selectRing: null as { x: number; z: number; radius: number } | null,
      plates: [] as { port: string; x: number; y: number; z: number }[],
      cables: [] as TableState["cables"],
      devices: [] as TableState["devices"],
    };
    const walk = (node: Node) => {
      const kind = node.userData?.kind;
      const live = node.parent && !node.parent.isScene; // dissolving leftovers are re-parented to the scene
      if (kind === "ghost" && live)
        state.ghosts.push({
          x: round(node.position.x), z: round(node.position.z),
          beam: node.children.some(child => child.isSprite && child.scale.y > 3),
          reach: node.children.some(child => ringRadius(child) === 2),
        });
      else if (kind === "installation" && live) {
        const data = node.userData.installation;
        state.installations.push({ id: data.id, kind: data.kind, x: round(node.position.x), z: round(node.position.z), countdown: data.countdown, blast: !!data.blast });
      } else if (kind === "debris" && live) state.debris.push({ x: round(node.position.x), z: round(node.position.z) });
      else if (kind === "prop" && shown(node)) state.props.push({ x: round(node.position.x), y: round(node.position.y), z: round(node.position.z) });
      else if (kind === "cable" && live) {
        const data = node.userData;
        state.cables.push({ key: data.key, channel: data.channel, sheath: data.sheath, fibre: data.fibre, amplified: data.amplified });
      } else if (node.userData?.nodeId && Array.isArray(node.userData.rings) && live) {
        const seal = node.children.find(child => child.isSprite && typeof child.userData?.junction === "number");
        state.devices.push({ id: node.userData.nodeId, channel: node.userData.rings[0]?.userData?.channel ?? null, junction: seal ? seal.userData.junction : null });
      }
      if (node.isSprite && node.userData?.port && shown(node)) {
        const [x, y, z] = node.matrixWorld.elements.slice(12, 15);
        state.plates.push({ port: node.userData.port, x: round(x), y: round(y), z: round(z) });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    // The select ring is the thicker of the two table-wide dashed 2.0 rings (hover is 0.034).
    for (const child of scene.children) {
      if (ringRadius(child) !== 2 || child.children[0].geometry?.parameters?.tube !== 0.038 || !child.visible) continue;
      state.selectRing = { x: round(child.position.x), z: round(child.position.z), radius: 2 };
    }
    return state;
  });
}

/** Screen position of a table point (world units; y is height above the floor). */
export async function tablePoint(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __table?: { camera: unknown } }).__table?.camera)).toBe(true);
  return page.evaluate(([x, y, z]) => {
    type Vector = { x: number; y: number; set(x: number, y: number, z: number): Vector; clone(): Vector; project(camera: unknown): Vector };
    const probe = (window as unknown as { __table: { scene: { position: Vector }; camera: unknown } }).__table;
    const at = probe.scene.position.clone().set(x, y, z).project(probe.camera);
    const box = document.querySelector("#world")!.getBoundingClientRect();
    return { x: box.left + (at.x + 1) / 2 * box.width, y: box.top + (1 - at.y) / 2 * box.height };
  }, [x, y, z] as const);
}

/** Starts recording, every frame, where crates and fragments stand (window.__propTrail). */
export function trackProps(page: Page): Promise<void> {
  return page.evaluate(() => {
    type Node = { children: Node[]; userData: Record<string, unknown>; position: { x: number; y: number; z: number } };
    const w = window as unknown as { __table: { scene: Node }; __propTrail: { x: number; y: number; z: number }[] };
    w.__propTrail = [];
    const sample = () => {
      for (const child of w.__table.scene.children)
        if (child.userData?.kind === "prop") w.__propTrail.push({ x: child.position.x, y: child.position.y, z: child.position.z });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
export function propTrail(page: Page): Promise<{ x: number; y: number; z: number }[]> {
  return page.evaluate(() => (window as unknown as { __propTrail: { x: number; y: number; z: number }[] }).__propTrail);
}

// ------------------------------------------------------------------ toasts and effect cues

/** Keeps every toast the game shows (a later toast replaces the visible one). */
export async function recordToasts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver(records => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (target.id === "toast" && record.type === "childList" && target.textContent) w.__toasts.push(target.textContent);
      }
    }).observe(document, { subtree: true, childList: true });
  });
}
export function toastsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
}

/** Names every effect the game starts ("reveal-1", "crate-2", …) in window.__cues. Install with
 * effects above 0; audio unlocks with the first click (Continue). */
export async function recordCues(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cues: string[]; __decoded: number };
    w.__cues = [];
    w.__decoded = 0;
    const fileOf = new WeakMap<ArrayBuffer, string>(), cueOf = new WeakMap<AudioBuffer, string>();
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function (this: Response) {
      const data = await arrayBuffer.call(this);
      const file = this.url.match(/audio\/effects\/([\w-]+)\.ogg/)?.[1];
      if (file) fileOf.set(data, file);
      return data;
    };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      decodeAudioData(data: ArrayBuffer, ...rest: [DecodeSuccessCallback?, DecodeErrorCallback?]) {
        const file = fileOf.get(data);
        return super.decodeAudioData(data, ...rest).then(buffer => {
          if (file) { cueOf.set(buffer, file); w.__decoded++; }
          return buffer;
        });
      }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args: Parameters<typeof start>) => {
          const cue = source.buffer ? cueOf.get(source.buffer) : undefined;
          if (cue) w.__cues.push(cue);
          start(...args);
        };
        return source;
      }
    };
  });
}
/** Cue names played so far, without the variant ("reveal", "crate", …). */
export function cuesPlayed(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cues: string[] }).__cues.map(cue => cue.replace(/-\d+$/, "")));
}

/** Every test fails on any page error or console error, wherever it happened. */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    // Cheaper 3D table: no bloom or shadows, half resolution, 20 fps (see World.ts).
    await page.addInitScript(() => { (globalThis as { __faultlineTestRender?: boolean }).__faultlineTestRender = true; });
    const errors = watchErrors(page);
    await use(errors);
    expect(errors, "page and console errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Battle controls are unlocked and the hostile is idle. */
export async function idle(page: Page) {
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/, { timeout: 20000 });
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "idle", { timeout: 20000 });
}

/** The saved expedition's run, exactly as the game persisted it. */
export function saved(page: Page): Promise<RunState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run, STORAGE);
}

/** Hand index of the first card whose id (or upgraded id) matches. */
export async function handIndex(page: Page, card: CardId | ((id: string) => boolean)): Promise<number> {
  const ids = await page.locator("[data-hand]").evaluateAll(els => els.map(el => (el as HTMLElement).dataset.cardId!));
  const index = ids.findIndex(id => typeof card === "function" ? card(id) : id === card || id === `${card}+`);
  expect(index, `${String(card)} in hand ${ids.join(", ")}`).toBeGreaterThanOrEqual(0);
  return index;
}

export async function playCard(page: Page, card: CardId | ((id: string) => boolean)) {
  await page.locator(`[data-hand="${await handIndex(page, card)}"]`).click();
}

/** Play a cable card (or the Patch Cable console, when already targeting) between two devices via the dock. */
export async function connect(page: Page, a: string, b: string, card?: CardId | ((id: string) => boolean)) {
  if (card) await playCard(page, card);
  await page.locator(`#target-dock [data-node="${a}"]`).click();
  await page.locator(`#target-dock [data-node="${b}"]`).click();
}

/** Play a hardware card into a band's first free socket (or any free socket). */
export async function deploy(page: Page, card: CardId | ((id: string) => boolean), zone?: "north" | "center" | "south") {
  await playCard(page, card);
  await page.locator(zone ? `#target-dock [data-deploy-zone="${zone}"]` : '#target-dock [data-action="auto-place"]').click();
}

export async function transmit(page: Page) {
  await page.locator('[data-action="transmit"]').click();
  await idleOrScreen(page);
}

/** After a transmission: either the battle is ready again or another screen took over. */
export async function idleOrScreen(page: Page) {
  await expect(page.locator(".game-root")).not.toHaveClass(/\bbusy\b/, { timeout: 25000 });
}

/** What the rules say a transmission from this exact saved state resolves to. */
export function resolved(run: RunState): RunState {
  const next = JSON.parse(JSON.stringify(run)) as RunState;
  endTurn(next);
  return JSON.parse(JSON.stringify(next));
}

/** The pattern index of the first intent of a kind (optionally without an add-on field). */
export function turnOf(enemy: string, kind: string, plain = false): number {
  const index = ENEMIES[enemy].pattern.findIndex(intent => intent.kind === kind && (!plain || (!intent.field && !intent.junk)));
  expect(index, `${enemy} has a ${kind} intent`).toBeGreaterThanOrEqual(0);
  return index;
}

export async function viewOf(page: Page): Promise<string> {
  return (await page.locator(".game-root").getAttribute("data-view")) ?? "";
}
