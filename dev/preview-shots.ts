/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
// Dev-only captures of dev/world-preview.html. Not shipped.
// Usage: node --experimental-strip-types dev/preview-shots.ts <outDir> <enemyIds> [scene] [WxH] [action]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? ".";
const enemies = (process.argv[3] ?? "leech").split(",");
const scene = process.argv[4] ?? "devices";
const [width, height] = (process.argv[5] ?? "1440x900").split("x").map(Number);
const action = process.argv[6] ?? "";
const base = process.env.BASE ?? "http://127.0.0.1:5191/";
const browser = await chromium.launch({ args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
for (const id of enemies) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", error => console.error("pageerror", error.message));
  page.on("console", message => { if (message.type() === "error") console.error("console", message.text()); });
  const clock = !!process.env.CLOCK;
  if (clock) await page.clock.install({ time: 1_000_000 });
  // QUERY adds harness parameters, e.g. QUERY='cam=0,5,7&target=0,1,0'.
  await page.goto(`${base}dev/world-preview.html?enemy=${id}&scene=${scene}${process.env.QUERY ? `&${process.env.QUERY}` : ""}`);
  if (clock) await page.clock.runFor(1600);
  await page.waitForSelector('#world[data-enemy-state="idle"]', { timeout: 20000 }).catch(() => console.error("no idle state"));
  if (!clock) await page.waitForTimeout(Number(process.env.WAIT ?? 900));
  if (action) {
    await page.evaluate(kind => {
      const world = (window as any).__world;
      if (kind === "channels") world.playChannels((window as any).__preview.channels(), () => {});
      else if (kind === "honeypot") world.pulseNode("honeypot9", "trap");
      else if (kind === "trigger") world.pulseNode("firewall5", "trigger");
      else if (kind === "scrub") world.pulseNode("malware1", "scrub");
      else world.playEnemyAction(kind, kind === "jam" ? "router1" : null, null, () => {}, false, () => {});
    }, action);
    if (clock) await page.clock.runFor(Number(process.env.AT ?? 520));
    else await page.waitForTimeout(Number(process.env.AT ?? 520));
    console.log(id, action, await page.evaluate(() => JSON.stringify({ ...(document.querySelector("#world") as HTMLElement).dataset })));
  }
  if (process.env.FPS) {
    const fps = await page.evaluate(() => new Promise<number>(resolve => {
      let frames = 0; const start = performance.now();
      const step = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(step); else resolve(frames / ((performance.now() - start) / 1000)); };
      requestAnimationFrame(step);
    }));
    console.log(`${id} fps≈${fps.toFixed(1)}`);
  }
  await page.screenshot({ path: `${out}/preview-${scene}-${id}${action ? `-${action}` : ""}${process.env.TAG ?? ""}-${width}x${height}.png` });
  await page.close();
}
await browser.close();
