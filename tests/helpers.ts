/** Shared v3 browser-test helpers: deterministic saves, installation and state reads. */
import { expect, test as base, type Page } from "@playwright/test";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { chooseRoom, endTurn } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { EVENTS } from "../src/core/events.ts";
import type { Archetype, CardId, Malware, NetworkLink, NetworkNode, RoomType, RunState } from "../src/core/types.ts";

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
  malware?: Malware[];
  relics?: RunState["relics"];
  seed?: number;
}

/** A clean first-stage encounter: terminals only, no terrain, a chosen hostile and hand. */
export function battle(options: BattleOptions = {}): Expedition {
  const e = newExpedition(options.archetype ?? "architect", options.seed ?? 0x5eed1234);
  const r = e.run;
  const room = r.map.find(item => item.floor === 0 && item.type === "battle")!;
  expect(chooseRoom(r, room.id).ok).toBe(true);
  const id = options.enemy ?? "leech", definition = ENEMIES[id];
  const maxHp = options.maxHp ?? options.hp ?? 60;
  r.enemy = { id, name: definition.name, title: definition.title, color: definition.color, hp: options.hp ?? maxHp, maxHp, turn: options.turn ?? 0 };
  r.bossIntroSeen = true;
  r.terrain = null;
  r.zoneEffects = [];
  r.malware = options.malware ?? [];
  r.topology.nodes = [...r.topology.nodes.filter(node => node.fixed), ...(options.nodes ?? [])];
  r.topology.links = options.links ?? [];
  r.nextNodeId = 20;
  r.faultNode = r.faultLink = null;
  r.hand = options.hand ?? ["guard", "guard", "guard"];
  r.drawPile = options.draw ?? Array<CardId>(20).fill("guard");
  r.discardPile = options.discard ?? [];
  r.exhaustPile = [];
  r.energy = options.energy ?? 5;
  if (options.integrity !== undefined) r.integrity = r.maxIntegrity = Math.max(r.maxIntegrity, options.integrity);
  if (options.relics) r.relics = options.relics;
  r.log = ["Test encounter prepared."];
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
