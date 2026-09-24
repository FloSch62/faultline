/** v5 · Three Energy in the browser: the energy orb (current over the turn's base, temporary energy
 * as a rise), a Daemon on the daemon strip, a Payload token and Retain, played through the real
 * controls on the production build. Every number is read from RULES, CARDS and the forecast.
 * Every test also fails on any page or console error (see helpers.ts). */
import { CARDS, RULES } from "../src/core/cards.ts";
import { combatPreview } from "../src/core/run.ts";
import { ENERGY, battle, expect, idle, install, playCard, route, saved, test, transmit } from "./helpers.ts";

const orb = ".energy-orb";
const damage = ".transmit-power strong";

test("a Ghost turn: Power Surge rises over the base, a daemon runs, a Payload lands, a Retain card stays", { tag: "@smoke" }, async ({ page }) => {
  const e = battle({
    archetype: "ghost", enemy: "leech", hp: 100, integrity: 40, ...route("router1"),
    hand: ["surge", "exploit-kit", "shell-access", "replay-attack", "exfiltrate", "guard"],
    draw: Array(12).fill("pulse"),
  });
  const buffer = 4;
  e.run.buffer = buffer;
  await install(page, e);

  // The orb reads the turn's energy over its base: three, no rise.
  await expect(page.locator(`${orb} strong`)).toHaveText(String(ENERGY));
  await expect(page.locator(`${orb} .energy-base`)).toHaveText(`/${ENERGY}`);
  await expect(page.locator(orb)).not.toHaveClass(/is-risen/);
  await expect(page.locator(".daemon-seals")).toHaveCount(0);

  // Temporary energy sits on top of the base, uncapped: the orb rises and says by how much.
  const surge = CARDS.surge.values.energy ?? 0;
  await playCard(page, "surge");
  await expect(page.locator(`${orb} strong`)).toHaveText(String(ENERGY - CARDS.surge.cost + surge));
  await expect(page.locator(orb)).toHaveClass(/is-risen/);
  await expect(page.locator(`${orb} .energy-rise`)).toContainText(`+${surge}`);
  let energy = ENERGY - CARDS.surge.cost + surge;

  // A daemon: its card leaves the hand for a seal on the player plate, never the discard pile.
  const kit = page.locator('[data-hand][data-card-id="exploit-kit"]');
  await expect(kit.locator(".type-word.is-daemon")).toHaveText("Daemon");
  await playCard(page, "exploit-kit");
  energy -= CARDS["exploit-kit"].cost;
  await expect(page.locator(`${orb} strong`)).toHaveText(String(energy));
  const seal = page.locator('.daemon-seals [data-daemon="exploit-kit"]');
  await expect(seal).toBeVisible();
  await expect(seal).toHaveAttribute("aria-label", new RegExp(`Daemon running: ${CARDS["exploit-kit"].name}`));
  let run = await saved(page);
  expect(run.daemons).toEqual(["exploit-kit"]);
  expect(run.discardPile).not.toContain("exploit-kit");
  expect(run.hand).not.toContain("exploit-kit");

  // Shell Access makes a Payload token in hand; the Payload lands with the running Exploit Kit's bonus.
  await playCard(page, "shell-access");
  energy -= CARDS["shell-access"].cost;
  const payload = page.locator('[data-hand][data-card-id="payload"]');
  await expect(payload).toHaveCount(1);
  await expect(payload.locator(".type-word")).toHaveText("Token");
  const before = Number(await page.locator(damage).textContent());
  await playCard(page, "payload");
  energy -= CARDS.payload.cost;
  const bonus = CARDS["exploit-kit"].values.amount ?? 0;
  await expect(page.locator(damage)).toHaveText(String(before + RULES.payloadDamage + bonus));
  run = await saved(page);
  expect(run.exhaustPile).toContain("payload");
  expect(combatPreview(run).packetDamage).toBe(before + RULES.payloadDamage + bonus);
  await expect(page.locator(`${orb} strong`)).toHaveText(String(energy));

  // A Retain card played: Replay Attack doubles the buffer. The other (Exfiltrate) is kept for later.
  await expect(page.locator('[data-hand][data-card-id="exfiltrate"] [data-keyword="retain"]')).toHaveText("Retain");
  await playCard(page, "replay-attack");
  energy -= CARDS["replay-attack"].cost;
  run = await saved(page);
  expect(run.buffer).toBe(2 * buffer);
  await expect(page.locator(`${orb} strong`)).toHaveText(String(energy));
  expect(run.hand).toContain("guard");

  // End of turn: the Retain card stays in hand, the rest goes to discard; the daemon keeps running,
  // and the next turn starts at the base again.
  await transmit(page);
  await idle(page);
  run = await saved(page);
  expect(run.hand).toContain("exfiltrate");
  expect(run.hand).not.toContain("guard");
  expect(run.discardPile).toContain("guard");
  expect(run.daemons).toEqual(["exploit-kit"]);
  await expect(page.locator('.daemon-seals [data-daemon="exploit-kit"]')).toBeVisible();
  await expect(page.locator(`${orb} strong`)).toHaveText(String(ENERGY));
  await expect(page.locator(orb)).not.toHaveClass(/is-risen/);
});
