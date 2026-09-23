import { test, expect, type Page } from "@playwright/test";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { EFFECTS } from "../src/audio-effects.ts";

const storage = "faultline-expedition-v2";
function fixture(id = "leech", hp = 40) {
  const e = newExpedition("architect", 924);
  chooseRoom(e.run, "0-1");
  const d = ENEMIES[id];
  e.run.enemy = { id, name: d.name, title: d.title, color: d.color, hp, maxHp: 40, turn: 0 };
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
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); (window as any).__audioContext = this; }
      createOscillator(): OscillatorNode { throw new Error("Oscillator effect should not be used"); }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args: Parameters<typeof start>) => {
          (window as any).__effects.push({ channels: source.buffer?.numberOfChannels, seconds: source.buffer?.duration });
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
  await expect(room.locator(".room-scout")).toHaveText(ENEMIES[destination.enemyId!].name);
  await expect(room).toHaveAttribute("title", /13 integrity/);
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
  await expect(page.getByRole("meter", { name: "Hostile integrity", exact: true })).toHaveAttribute("aria-valuenow", "13");
  const actual = await page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run.enemy.id, storage);
  expect(actual).toBe(destination.enemyId);
});

test("all mastered effects decode as non-silent stereo recordings under the served base path", async ({ page }) => {
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

test("lethal hits finish the enemy's dissolution before presenting rewards", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  await install(page, fixture("moth", 1));
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator("#world")).toHaveAttribute("data-enemy-state", "death", { timeout: 15000 });
  await expect(page.locator(".game-root")).toHaveClass(/busy/);
  await expect(page.getByRole("meter", { name: "Hostile integrity", exact: true })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".reward-screen")).toBeVisible();
  const saved = await page.evaluate(storage => JSON.parse(localStorage.getItem(storage)!).run, storage);
  expect(saved.enemy.hp).toBe(0);
  expect(saved.enemy.turn).toBe(0);
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
  expect(saved.enemy.hp).toBe(18);
});

test("reduced motion completes the same lethal turn without leaving controls locked", async ({ page }) => {
  await install(page, fixture("moth", 1), false);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".reward-screen")).toBeVisible();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/);
  await expect(page.locator("#world")).not.toHaveAttribute("data-enemy-action");
});
