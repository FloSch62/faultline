import type { Page } from "@playwright/test";
// Every test also fails on any page or console error (see helpers.ts).
import { expect, test } from "./helpers.ts";
import { newExpedition } from "../src/core/expedition.ts";
import { makeEnemy } from "../src/core/encounter.ts";
import { chooseRoom } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { encounterHealth } from "../src/core/map.ts";
import { EFFECTS } from "../src/audio-effects.ts";

const storage = "faultline-expedition-v2";
function fixture(id = "leech", hp = 40) {
  const e = newExpedition("architect", 924);
  chooseRoom(e.run, "0-1");
  e.run.enemies = [{ ...makeEnemy(id, "h1", "centre", "single", 40), hp }];
  e.run.focus = "centre";
  e.run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  e.run.topology.links.push({ a: "alpha", b: "router1" }, { a: "router1", b: "omega" });
  e.run.hand = ["guard", "guard", "guard"];
  e.run.block = 20;
  return e;
}
async function install(page: Page, e = fixture(), motion = true) {
  await page.addInitScript(({ e, storage, motion }) => {
    localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: .7, motion }));
    (window as any).__effects = [];
    (window as any).__voices = new Set();
    (window as any).__decoded = 0;
    // Name every decoded effect buffer by its file, so tests can assert which cue played.
    const fileOf = new WeakMap<ArrayBuffer, string>(), cueOf = new WeakMap<AudioBuffer, string>();
    const nativeArrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function (this: Response) {
      const data = await nativeArrayBuffer.call(this);
      const file = this.url.match(/audio\/effects\/([\w-]+)\.ogg/)?.[1];
      if (file) fileOf.set(data, file);
      return data;
    };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); (window as any).__audioContext = this; }
      createOscillator(): OscillatorNode { throw new Error("Oscillator effect should not be used"); }
      decodeAudioData(data: ArrayBuffer, ...rest: [DecodeSuccessCallback?, DecodeErrorCallback?]) {
        const file = fileOf.get(data);
        return super.decodeAudioData(data, ...rest).then(buffer => {
          if (file) { cueOf.set(buffer, file); (window as any).__decoded++; }
          return buffer;
        });
      }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args: Parameters<typeof start>) => {
          (window as any).__effects.push({ channels: source.buffer?.numberOfChannels, seconds: source.buffer?.duration, cue: source.buffer ? cueOf.get(source.buffer) : undefined });
          (window as any).__voices.add(source);
          start(...args);
        };
        source.stop = (...args: Parameters<typeof stop>) => { (window as any).__voices.delete(source); stop(...args); };
        source.addEventListener("ended", () => (window as any).__voices.delete(source));
        return source;
      }
    };
  }, { e, storage, motion });
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "idle");
}

test("the seeded chart scouts the enemy that actually appears and respects saved exits", async ({ page }) => {
  const e = newExpedition("architect", 392), r = e.run;
  r.floor = 1; r.lastRoom = "0-1";
  const destination = r.map.find(room => room.floor === 1 && room.type === "battle")!;
  r.map.find(room => room.id === "0-1")!.exits = [destination.id];
  await page.addInitScript(({ e, storage }) => {
    localStorage.setItem(storage, JSON.stringify(e));
    localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: false }));
  }, { e, storage });
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".route-room.available")).toHaveCount(1);
  const room = page.locator(`[data-room="${destination.id}"]`);
  await expect(room.locator(".room-scout")).toHaveText(ENEMIES[destination.enemyId!].name, { ignoreCase: true });
  const health = encounterHealth(0, destination, e.run.ascension);
  await expect(room).toHaveAttribute("data-tooltip", new RegExp(`${health} integrity`));
  for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const overlaps = await page.evaluate(() => {
      const labels = [...document.querySelectorAll(".room-label")].map(e => e.getBoundingClientRect());
      const symbols = [...document.querySelectorAll(".room-symbol")].map(e => e.getBoundingClientRect());
      const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return labels.flatMap((a, i) => [
        ...labels.flatMap((b, j) => i < j && intersects(a, b) ? [`labels ${i}/${j}`] : []),
        ...symbols.flatMap((b, j) => i !== j && intersects(a, b) ? [`label ${i}/symbol ${j}`] : []),
      ]);
    });
    expect(overlaps, `${width}x${height}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await room.click();
  await expect(page.getByRole("meter", { name: "Hostile integrity", exact: true })).toHaveAttribute("aria-valuenow", String(health));
  const actual = await page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run.enemies[0].id, storage);
  expect(actual).toBe(destination.enemyId);
});

test("all mastered effects decode as non-silent stereo recordings under the served base path", async ({ page }) => {
  // v4 moments (design 14.8) each have their own cue, so this decode covers them too.
  const v4 = ["arrive", "dormant", "aim", "install", "wear", "breakdown", "repair", "quarantine", "detonate", "crate", "message", "reveal", "warning", "signal"];
  expect(Object.keys(EFFECTS)).toEqual(expect.arrayContaining(v4));
  expect(EFFECTS.crate.variants, "crate: credits and cargo").toBeGreaterThanOrEqual(2);
  await page.goto("./");
  const files = Object.entries(EFFECTS).flatMap(([kind, cue]) => Array.from({ length: cue.variants }, (_, i) => `${kind}-${i + 1}.ogg`));
  const results = await page.evaluate(async files => {
    const ctx = new AudioContext();
    const results = await Promise.all(files.map(async file => {
      const response = await fetch(new URL(`audio/effects/${file}`, location.href));
      if (!response.ok) throw new Error(`Unavailable: ${file}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      const data = buffer.getChannelData(0);
      let peak = 0, energy = 0;
      for (const value of data) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      return { file, channels: buffer.numberOfChannels, peak, rms: Math.sqrt(energy / data.length) };
    }));
    await ctx.close();
    return results;
  }, files);
  for (const cue of results) {
    expect(cue.channels, cue.file).toBe(2);
    expect(cue.peak, cue.file).toBeLessThan(.98);
    expect(cue.rms, cue.file).toBeGreaterThan(.005);
  }
});

test("gameplay plays samples and effects volume and mute silence subsequent actions", async ({ page }) => {
  await install(page, fixture(), false);
  await page.locator('[data-hand="0"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__effects.length)).toBeGreaterThan(0);
  await page.locator('[data-action="settings"]').click();
  await page.getByRole("slider", { name: "Sound effects volume" }).fill("0");
  await page.locator('[data-action="close"]').last().click();
  let before = await page.evaluate(() => (window as any).__effects.length);
  await page.locator('[data-hand="0"]').click();
  expect(await page.evaluate(() => (window as any).__effects.length)).toBe(before);
  await page.locator('[data-action="settings"]').click();
  await page.getByRole("slider", { name: "Sound effects volume" }).fill("70");
  await page.locator('[data-action="close"]').last().click();
  await page.getByRole("button", { name: "Mute audio", exact: true }).click();
  before = await page.evaluate(() => (window as any).__effects.length);
  await page.locator('[data-hand="0"]').click();
  expect(await page.evaluate(() => (window as any).__effects.length)).toBe(before);
  expect(await page.evaluate(() => (window as any).__effects.every((cue: { channels: number }) => cue.channels === 2))).toBe(true);
});

test("cards sound like what they do: lifting never shuffles; a reshuffle is heard only when it happens", async ({ page }) => {
  const e = fixture();
  e.run.hand = ["router", "guard", "fiber"];
  // An empty draw pile forces a real reshuffle when the next hand is dealt.
  e.run.drawPile = [];
  e.run.discardPile = ["fiber", "fiber", "patch", "guard", "switch", "router", "inspect"];
  await install(page, e, false);
  // Continuing the expedition unlocked audio; wait until every cue is decoded and named.
  const files = Object.values(EFFECTS).reduce((sum, cue) => sum + cue.variants, 0);
  await expect.poll(() => page.evaluate(() => (window as any).__decoded)).toBe(files);
  const cues = () => page.evaluate(() => (window as any).__effects.map((effect: { cue?: string }) => effect.cue ?? "?") as string[]);
  // Hover cues are left out: after a play the fan closes up and the next card slides under the
  // pointer, which rises its zoomed copy (and its hover cue) after the play's own cue.
  const last = async () => (await cues()).filter(cue => !cue.startsWith("hover-")).at(-1);
  await page.locator('[data-hand="0"]').click();
  await expect.poll(last).toMatch(/^pickup-/);
  await page.locator('[data-hand="0"]').click();
  await expect.poll(last).toMatch(/^undo-/);
  await page.locator('[data-hand="1"]').click();
  await expect.poll(last).toMatch(/^block-/);
  expect((await cues()).filter(cue => /^(shuffle|deal|draw|select)-/.test(cue))).toEqual([]);
  const before = (await cues()).length;
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/);
  const turn = (await cues()).slice(before).filter(cue => !cue.startsWith("hover-"));
  expect(turn[0]).toMatch(/^transmit-/);
  expect(turn.findIndex(cue => /^shuffle-/.test(cue))).toBeGreaterThan(0);
  expect(turn.findIndex(cue => /^deal-/.test(cue))).toBeGreaterThan(turn.findIndex(cue => /^shuffle-/.test(cue)));
  expect(turn.filter(cue => /^turn-/.test(cue))).toEqual([]);
});

test("lethal hits finish the enemy's dissolution before presenting rewards", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  await install(page, fixture("moth", 1));
  // Record the table the instant the dissolution starts; a fast renderer can finish it
  // before a polling assertion looks.
  await page.evaluate(() => {
    const world = document.querySelector("#world")!;
    new MutationObserver(() => {
      if (world.getAttribute("data-enemy-state") !== "death" || (window as any).__death) return;
      (window as any).__death = {
        busy: document.querySelector(".game-root")!.classList.contains("busy"),
        meter: document.querySelector('[role="meter"][aria-label="Hostile integrity"]')?.getAttribute("aria-valuenow"),
        reward: !!document.querySelector(".reward-screen"),
      };
    }).observe(world, { attributes: true, attributeFilter: ["data-enemy-state"] });
  });
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => (window as any).__death)).toEqual({ busy: true, meter: "0", reward: false });
  const saved = await page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run, storage);
  expect(saved.enemies[0].hp).toBe(0);
  expect(saved.enemies[0].turn).toBe(0);
  expect(errors).toEqual([]);
});

test("visibility changes stop live recordings and suspend audio, then resume cleanly", async ({ page }) => {
  const e = fixture();
  e.run.hand = ["guard", "guard", "guard", "guard"];
  await install(page, e, false);
  await page.locator('[data-hand="0"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__effects.length)).toBeGreaterThan(0);
  const snapshot = await page.evaluate(() => {
    // Drive the browser visibility handler explicitly; native Web Audio sources
    // and context state remain real. Headless windows do not reliably background.
    document.querySelector<HTMLButtonElement>('[data-hand="0"]')!.click();
    const before = (window as any).__voices.size;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    return { before, after: (window as any).__voices.size, plays: (window as any).__effects.length };
  });
  expect(snapshot.before).toBeGreaterThan(0);
  expect(snapshot.after).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__audioContext.state)).toBe("suspended");
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-hand="0"]')!.click());
  expect(await page.evaluate(() => (window as any).__effects.length)).toBe(snapshot.plays);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__audioContext.state)).toBe("running");
  await page.locator('[data-hand="0"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__effects.length)).toBeGreaterThan(snapshot.plays);
});

test("a half-health crossing transforms the guardian before unlocking the next turn", async ({ page }) => {
  await install(page, fixture("core", 23));
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "enrage", { timeout: 15000 });
  await expect(page.locator(".game-root")).toHaveClass(/busy/);
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/);
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-enraged", "true");
  const saved = await page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run, storage);
  expect(saved.turn).toBe(2);
  expect(saved.enemies[0].hp).toBe(18);
});

test("reduced motion completes the same lethal turn without leaving controls locked", async ({ page }) => {
  await install(page, fixture("moth", 1), false);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/);
  await expect(page.locator("#world")).not.toHaveAttribute("data-enemy-action");
});
