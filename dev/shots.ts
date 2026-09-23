// Dev-only screenshot driver for visual review. Not shipped.
// Usage: node --experimental-strip-types dev/shots.ts <outDir> [enemyIds] [WxH,...]
import { chromium } from "@playwright/test";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import { ENEMIES } from "../src/core/enemies.ts";

const out = process.argv[2] ?? ".";
const enemies = (process.argv[3] ?? "leech").split(",");
const sizes = (process.argv[4] ?? "1280x720,1440x900,1920x1080,1366x768").split(",").map(s => s.split("x").map(Number));
const base = process.env.BASE ?? "http://127.0.0.1:5191/";
const wait = Number(process.env.WAIT ?? 1200);
const browser = await chromium.launch({ args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
for (const id of enemies) {
  for (const [width, height] of sizes) {
    const e = newExpedition("architect", 924);
    chooseRoom(e.run, "0-1");
    const d = ENEMIES[id];
    const boss = !!d.boss;
    e.run.enemy = { id, name: d.name, title: d.title, color: d.color, hp: boss ? 112 : 38, maxHp: boss ? 112 : 40, turn: 0 };
    e.run.bossIntroSeen = true;
    e.run.topology.nodes.push(
      { id: "router1", role: "router", x: 0, z: 0 },
      { id: "switch2", role: "switch", x: -2.5, z: -2.4 },
      { id: "firewall3", role: "firewall", x: 2.5, z: 2.4 },
    );
    e.run.topology.links.push(
      { a: "alpha", b: "router1" }, { a: "router1", b: "omega" },
      { a: "alpha", b: "switch2" }, { a: "switch2", b: "router1" },
    );
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", error => console.error(`pageerror ${id} ${width}x${height}:`, error.message));
    await page.addInitScript(({ e }) => {
      localStorage.setItem("faultline-expedition-v2", JSON.stringify(e));
      localStorage.setItem("faultline-settings-v2", JSON.stringify({ music: 0, effects: 0, motion: true }));
      localStorage.setItem("faultline-preferences-v1", JSON.stringify({ tips: false, fast: false }));
    }, { e });
    await page.goto(base);
    await page.locator('[data-action="continue"]').click();
    await page.waitForSelector('#world[data-enemy-state="idle"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(wait);
    if (process.env.FPS) {
      const fps = await page.evaluate(() => new Promise<number>(resolve => {
        let frames = 0; const start = performance.now();
        const step = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(step); else resolve(frames / ((performance.now() - start) / 1000)); };
        requestAnimationFrame(step);
      }));
      console.log(`${id} ${width}x${height} fps≈${fps.toFixed(1)}`);
    }
    if (process.env.METRICS) {
      const boxes = await page.evaluate(() => Object.fromEntries([".brand", ".run-stats", ".encounter-heading", ".header-actions", ".game-header", ".enemy-plate", ".battle-left"].map(selector => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return [selector, box ? [Math.round(box.left), Math.round(box.top), Math.round(box.right), Math.round(box.bottom)] : null];
      })));
      console.log(`${id} ${width}x${height}`, JSON.stringify(boxes));
    }
    await page.screenshot({ path: `${out}/${id}-${width}x${height}.png` });
    await page.close();
  }
}
await browser.close();
