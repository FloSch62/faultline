import { expect, test, type Page } from "@playwright/test";
import { newExpedition, type Expedition } from "../src/core/expedition.ts";
import { CARDS } from "../src/core/cards.ts";
import { chooseRoom } from "../src/core/run.ts";

const SAVE = "faultline-expedition-v2";
const RECORDS = "faultline-records-v2";

function fixture(): Expedition {
  const expedition = newExpedition("architect", 12345);
  chooseRoom(expedition.run, "0-1");
  return expedition;
}

async function installSave(page: Page, expedition = fixture()) {
  for (const card of expedition.run.hand) {
    if (!expedition.run.deck.includes(card)) expedition.run.deck.push(card);
  }
  await page.addInitScript(
    ({ key, value }) => {
      // Seed once so a reload exercises the real persistence path.
      if (sessionStorage.getItem("alpha-fixture-installed")) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem("alpha-fixture-installed", "yes");
    },
    { key: SAVE, value: JSON.stringify(expedition) },
  );
  await page.goto("./");
}

async function saved(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), SAVE);
}

async function choose(page: Page, id: string) {
  await page.locator(`[data-hand][data-card-id="${id}"]`).first().click();
}

async function connect(page: Page, a: string, b: string) {
  await choose(page, "fiber");
  await page.locator(`[data-node="${a}"]`).click();
  await page.locator(`[data-node="${b}"]`).click();
}

test("practice is optional and exiting it preserves the expedition and history", async ({
  page,
}) => {
  await installSave(page);
  const before = await saved(page);
  const history = await page.evaluate(
    (key) => localStorage.getItem(key),
    RECORDS,
  );
  await page.locator('[data-action="tutorial"]').first().click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "battle",
  );
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await connect(page, "alpha", "router1");
  await connect(page, "router1", "omega");
  await expect(page.locator(".transmit-power strong")).toHaveText("5");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, {
    timeout: 15_000,
  });
  expect(await saved(page)).toBe(before);
  await page.locator('[data-action="tutorial-exit"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "title",
  );
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), RECORDS)).toBe(
    history,
  );
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "battle",
  );
  expect(JSON.parse((await saved(page))!).run.topology.nodes).toHaveLength(2);
});

test("inspection exposes readable card rules without playing a card", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="continue"]').click();
  const before = await saved(page);
  const card = page.locator('[data-hand][data-card-id="router"]').first();
  await card.click({ button: "right" });
  await expect(page.locator("dialog .card-inspect")).toBeVisible();
  await expect(page.locator("dialog")).toContainText(CARDS.router.name);
  await expect(page.locator("dialog")).toContainText(CARDS.router.rules);
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await card.focus();
  await page.keyboard.press("i");
  await expect(page.locator("dialog .card-inspect")).toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("browser shortcut modifiers never select, play, or undo a card", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="continue"]').click();
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  const afterDeploy = await saved(page);
  await page.locator("body").focus();
  for (const key of ["Control+z", "Meta+z", "Alt+1"]) {
    await page.keyboard.press(key);
    expect(await saved(page)).toBe(afterDeploy);
    await expect(page.locator("[data-hand].selected")).toHaveCount(0);
  }
});

test("comfort settings persist and the field notes can be enabled again", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByText("Quick transmissions", { exact: true }).click();
  await page.getByText("Contextual field notes", { exact: true }).click();
  await page.getByText("Motion & screen shake", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tutorial-callout")).toHaveCount(0);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.locator('[data-preference="fast"]')).toBeChecked();
  await expect(page.locator('[data-preference="tips"]')).not.toBeChecked();
  await expect(page.locator('[data-setting="motion"]')).not.toBeChecked();
  await page.getByText("Contextual field notes", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tutorial-callout")).toBeVisible();
});

test("a damaged save cannot prevent starting a new expedition", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{invalid-save"),
    SAVE,
  );
  await page.goto("./");
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  await page.getByRole("button", { name: /New expedition/ }).click();
  await page.getByRole("button", { name: "Enter the Faultline" }).click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "map");
  expect(JSON.parse((await saved(page))!).run.phase).toBe("map");
  expect(errors).toEqual([]);
});

test("the full card archive is inspectable and renders without failed artwork", async ({
  page,
}) => {
  const failedAssets: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/(art|fonts)\//.test(response.url()))
      failedAssets.push(response.url());
  });
  await page.goto("./");
  await page.locator('[data-action="collection"]').click();
  const entries = page.locator("dialog [data-collection]");
  await expect(entries).toHaveCount(Object.keys(CARDS).length);
  expect(Object.keys(CARDS).length).toBeGreaterThanOrEqual(30);
  for (const rarity of ["rare", "legendary"]) {
    await page.locator(`[data-rarity="${rarity}"]`).click();
    await expect(entries).toHaveCount(
      Object.values(CARDS).filter((card) => card.rarity === rarity).length,
    );
  }
  await page.locator('[data-rarity="all"]').click();
  await page
    .getByRole("searchbox", { name: "Search cards" })
    .fill("Optic Fiber");
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toHaveAttribute("data-card-id", "fiber");
  await page.getByRole("searchbox", { name: "Search cards" }).fill("");
  await expect(entries).toHaveCount(Object.keys(CARDS).length);
  const artwork = await page
    .locator("dialog .card-image")
    .evaluateAll(async (elements) => {
      const urls = [
        ...new Set(
          elements.map((element) => {
            const background = getComputedStyle(element).backgroundImage;
            return background.match(/url\(["']?(.*?)["']?\)/)?.[1] || "";
          }),
        ),
      ];
      return Promise.all(
        urls.map(async (url) => {
          const art = new Image();
          art.src = url;
          try {
            await art.decode();
            return {
              url,
              width: art.naturalWidth,
              height: art.naturalHeight,
              decoded: true,
            };
          } catch {
            return { url, width: 0, height: 0, decoded: false };
          }
        }),
      );
    });
  for (const asset of artwork) {
    expect(asset.decoded, `Artwork failed to decode: ${asset.url}`).toBe(true);
    expect(asset.width).toBeGreaterThan(100);
    expect(asset.height).toBeGreaterThan(100);
  }
  await entries.last().scrollIntoViewIfNeeded();
  await entries.last().click();
  await expect(page.locator("dialog .card-inspect")).toBeVisible();
  expect(failedAssets).toEqual([]);
});

test("battle controls remain reachable on laptop and desktop displays", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="continue"]').click();
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.mouse.move(0, 0);
    const transmit = page.locator('[data-action="transmit"]');
    await expect(transmit).toBeInViewport();
    const hittable = await transmit.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return target === button || button.contains(target);
    });
    expect(hittable).toBe(true);
    const guide = page.locator(".battle-guide");
    if (await guide.isVisible()) {
      const dialBox = await transmit.boundingBox();
      const guideBox = await guide.boundingBox();
      const overlap =
        dialBox!.x < guideBox!.x + guideBox!.width &&
        guideBox!.x < dialBox!.x + dialBox!.width &&
        dialBox!.y < guideBox!.y + guideBox!.height &&
        guideBox!.y < dialBox!.y + dialBox!.height;
      expect(overlap).toBe(false);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.locator('[data-action="combat-details"]').first().click();
    await expect(page.locator("dialog")).toBeVisible();
    const dialogBox = await page.locator("dialog").boundingBox();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    const history = page.locator('[data-action="combat-log"]');
    await expect(history).toBeInViewport();
    expect(
      await history.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return target === button || button.contains(target);
      }),
    ).toBe(true);
    await history.click();
    await expect(page.locator(".history-list")).toBeVisible();
    expect(await page.locator(".history-list li").count()).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await choose(page, "router");
    const deploy = page.getByRole("button", {
      name: /Deploy in a free socket/,
    });
    await expect(deploy).toBeInViewport();
    await page.keyboard.press("Escape");
  }
});

test("damage and shield calculations predict the actual transmission", async ({
  page,
}) => {
  const expedition = fixture();
  expedition.run.hand = ["router", "fiber", "fiber", "guard", "pulse"];
  expedition.run.enemy!.hp = expedition.run.enemy!.maxHp = 100;
  expedition.run.enemy!.id = "leech";
  expedition.run.enemy!.turn = 0;
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await connect(page, "alpha", "router1");
  await connect(page, "router1", "omega");
  await choose(page, "guard");
  await choose(page, "pulse");
  await page.locator('[data-action="combat-details"]').first().click();
  const attack = page.locator(".calculation-grid section").nth(0);
  const defense = page.locator(".calculation-grid section").nth(1);
  const damage = Number(
    await attack.locator(".calculation-total strong").textContent(),
  );
  const incoming = Number(
    await defense.locator(".calculation-total strong").textContent(),
  );
  const terms = await attack.locator(".calculation-term b").allTextContents();
  expect(terms.reduce((sum, amount) => sum + Number(amount), 0)).toBe(damage);
  expect(damage).toBeGreaterThan(5);
  expect(incoming).toBeLessThan(
    Number(await defense.locator(".calculation-term b").first().textContent()),
  );
  await expect(attack.locator(".route-trace")).toContainText("ALPHA");
  await expect(attack.locator(".route-trace")).toContainText("ROUTER1");
  await expect(attack.locator(".route-trace")).toContainText("OMEGA");
  await page.keyboard.press("Escape");
  await expect(page.locator(".transmit-power strong")).toHaveText(
    String(damage),
  );
  const before = JSON.parse((await saved(page))!);
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, {
    timeout: 15_000,
  });
  const after = JSON.parse((await saved(page))!);
  expect(after.run.enemy.hp).toBe(before.run.enemy.hp - damage);
  expect(after.run.integrity).toBe(before.run.integrity - incoming);
  expect(after.run.block).toBe(0);
});

test("the guided lesson can be completed without creating an expedition save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.locator('[data-action="tutorial"]').first().click();
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await page.keyboard.press("z");
  await expect(page.locator(".practice-lesson")).toContainText(
    "A router gives the signal",
  );
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await connect(page, "alpha", "router1");
  await connect(page, "router1", "omega");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, {
    timeout: 15_000,
  });
  await choose(page, "guard");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator('[data-action="tutorial-finish"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('[data-action="tutorial-finish"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "title",
  );
  expect(await saved(page)).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RECORDS),
  ).toBeNull();
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sanctuary refinement removes the selected card and spends its service", async ({
  page,
}) => {
  const expedition = fixture();
  expedition.run.phase = "forge";
  expedition.run.floor = 2;
  expedition.run.currentRoom = "2-0";
  expedition.run.lastRoom = "1-0";
  expedition.run.enemy = null;
  const index = expedition.run.deck.indexOf("guard");
  const previousDeck = [...expedition.run.deck];
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await page.locator('[data-action="refine"]').click();
  await page.locator(`[data-remove-card="${index}"]`).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "map");
  const state = JSON.parse((await saved(page))!).run;
  previousDeck.splice(index, 1);
  expect(state.deck).toEqual(previousDeck);
  expect(state.floor).toBe(3);
  expect(
    state.map.find((room: { id: string }) => room.id === "2-0").cleared,
  ).toBe(true);
});

test("a full ten-card hand supports the final shortcut without covering transmit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const expedition = fixture();
  expedition.run.hand = [
    "router",
    "fiber",
    "fiber",
    "containerlab",
    "patch",
    "pulse",
    "shield",
    "firmware",
    "surge",
    "guard",
  ];
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await page.mouse.move(500, 60);
  await expect(page.locator("[data-hand]")).toHaveCount(10);
  const dial = await page.locator('[data-action="transmit"]').boundingBox();
  const hand = await page.locator("#hand-zone").boundingBox();
  expect(hand!.x + hand!.width).toBeLessThan(dial!.x);
  await page.getByRole("button", { name: "Next cards", exact: true }).click();
  await expect.poll(() => page.locator(".card-fan").evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await page.locator("body").press("0");
  await expect(page.locator("[data-hand]")).toHaveCount(9);
  expect(JSON.parse((await saved(page))!).run.block).toBe(4);
  await page.keyboard.press("z");
  await expect(page.locator("[data-hand]")).toHaveCount(10);
  expect(JSON.parse((await saved(page))!).run.block).toBe(0);
});

test("separated circuits defend even when a central route is first, and relocation is paid and undoable", async ({
  page,
}) => {
  const expedition = fixture();
  const run = expedition.run;
  run.topology.nodes.push(
    { id: "router1", role: "router", x: 0, z: 0 },
    { id: "router2", role: "router", x: 0, z: -2.5 },
    { id: "router3", role: "router", x: 0, z: 2.5 },
  );
  for (const id of ["router1", "router2", "router3"]) {
    run.topology.links.push({ a: "alpha", b: id }, { a: id, b: "omega" });
  }
  run.nextNodeId = 4;
  run.enemy!.id = "leech";
  run.enemy!.hp = run.enemy!.maxHp = 100;
  run.enemy!.turn = 0;
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".forecast-net b")).toHaveText("0");
  await expect(page.locator(".shield-resource strong")).toHaveText("2");
  await page.locator('[data-action="combat-details"]').first().click();
  await expect(page.locator(".calculation-grid section").nth(1)).toContainText(
    "Separated circuits · north + south",
  );
  await page.keyboard.press("Escape");
  await page.locator('[data-action="devices"]').click();
  await page.locator('[data-manage-node="router3"]').click();
  await page.locator('[data-relocate-zone="center"]').click();
  await expect(page.locator(".energy-orb strong")).toHaveText("4");
  await expect(page.locator(".forecast-net b")).toHaveText("2");
  await expect(page.locator(".shield-resource strong")).toHaveText("0");
  const moved = JSON.parse((await saved(page))!).run.topology.nodes.find(
    (node: { id: string }) => node.id === "router3",
  );
  expect(Math.abs(moved.z)).toBeLessThanOrEqual(1.3);
  await page.keyboard.press("z");
  await expect(page.locator(".energy-orb strong")).toHaveText("5");
  await expect(page.locator(".forecast-net b")).toHaveText("0");
  await expect(page.locator(".shield-resource strong")).toHaveText("2");
  const restored = JSON.parse((await saved(page))!).run;
  expect(restored.topology).toEqual(run.topology);
});

test("Sentinel armor is explained and routing through a firewall visibly bypasses it", async ({
  page,
}) => {
  const expedition = fixture();
  const run = expedition.run;
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  run.nextNodeId = 2;
  run.hand = ["firewall", "fiber", "fiber"];
  run.enemy!.id = "sentinel";
  run.enemy!.hp = run.enemy!.maxHp = 100;
  run.enemy!.turn = 0;
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".transmit-power strong")).toHaveText("3");
  await page.locator('[data-action="combat-details"]').first().click();
  const armor = page
    .locator(".calculation-grid section")
    .first()
    .locator(".calculation-term")
    .filter({ hasText: "Sentinel plating" });
  await expect(armor.locator("b")).toHaveText(/[−-]2/);
  await page.keyboard.press("Escape");
  await choose(page, "firewall");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await connect(page, "router1", "firewall2");
  await connect(page, "firewall2", "omega");
  await expect(page.locator(".transmit-power strong")).toHaveText("6");
  await expect(page.locator(".forecast-net b")).toHaveText("1");
  await page.locator('[data-action="combat-details"]').first().click();
  await expect(
    page.locator(".calculation-grid section").first(),
  ).not.toContainText("Sentinel plating");
  await expect(page.locator(".route-trace")).toContainText("FIREWALL2");
});

test("Wireshark captures the active route, draws, boosts its transmission, and exhausts", async ({
  page,
}) => {
  const expedition = fixture();
  const run = expedition.run;
  run.topology.nodes.push(
    { id: "router1", role: "router", x: -2.5, z: 0 },
    { id: "switch2", role: "switch", x: 0, z: 0 },
    { id: "firewall3", role: "firewall", x: 2.5, z: 0 },
  );
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "switch2" },
    { a: "switch2", b: "firewall3" },
    { a: "firewall3", b: "omega" },
  );
  run.nextNodeId = 4;
  run.hand = ["wireshark"];
  run.drawPile = ["guard", "pulse", "patch"];
  run.enemy!.id = "leech";
  run.enemy!.hp = run.enemy!.maxHp = 100;
  run.enemy!.turn = 0;
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".transmit-power strong")).toHaveText("7");
  await choose(page, "wireshark");
  await expect(page.locator("[data-hand]")).toHaveCount(2);
  await expect(page.locator(".energy-orb strong")).toHaveText("4");
  await expect(page.locator(".transmit-power strong")).toHaveText("10");
  const captured = JSON.parse((await saved(page))!).run;
  expect(captured.hand).toEqual(["guard", "pulse"]);
  expect(captured.exhaustPile).toContain("wireshark");
  expect(captured.packetBoost).toBe(3);
  await page.locator('[data-action="exhaust-pile"]').click();
  await expect(
    page.locator('dialog [data-collection="wireshark"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).not.toHaveClass(/busy/, {
    timeout: 15_000,
  });
  const resolved = JSON.parse((await saved(page))!).run;
  expect(resolved.enemy.hp).toBe(90);
  expect(resolved.packetBoost).toBe(0);
  expect(resolved.hand).not.toContain("wireshark");
});

test("leaving practice preserves the real expedition's undo history", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="continue"]').click();
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  await expect(page.locator(".energy-orb strong")).toHaveText("3");
  const before = await saved(page);
  await page.locator('[data-action="enemy-dossier"]').first().click();
  await page.locator('dialog [data-action="help"]').click();
  await page.locator('dialog [data-action="tutorial"]').click();
  await page.locator('[data-action="tutorial-exit"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "battle",
  );
  expect(await saved(page)).toBe(before);
  await expect(page.locator(".energy-orb strong")).toHaveText("3");
  await page.keyboard.press("z");
  await expect(page.locator(".energy-orb strong")).toHaveText("5");
  expect(JSON.parse((await saved(page))!).run.topology.nodes).toHaveLength(2);
});

test("undo cancels a dragged hardware card so its later release cannot deploy stale state", async ({
  page,
}) => {
  const expedition = fixture();
  expedition.run.hand = [
    "router",
    "router",
    "fiber",
    "fiber",
    "guard",
    "patch",
  ];
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await choose(page, "router");
  await page.getByRole("button", { name: /Deploy in a free socket/ }).click();
  const card = page.locator('[data-hand][data-card-id="router"]').first();
  const box = await card.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(720, 410, { steps: 6 });
  await expect(page.locator(".drag-ghost")).toHaveCount(1);
  await page.keyboard.press("z");
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await expect(page.locator(".energy-orb strong")).toHaveText("5");
  const afterUndo = await saved(page);
  await page.mouse.up();
  expect(await saved(page)).toBe(afterUndo);
  expect(JSON.parse(afterUndo!).run.topology.nodes).toHaveLength(2);
  const nextBox = await page
    .locator('[data-hand][data-card-id="router"]')
    .first()
    .boundingBox();
  await page.mouse.move(
    nextBox!.x + nextBox!.width / 2,
    nextBox!.y + nextBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(720, 410, { steps: 6 });
  await expect(page.locator(".drag-ghost")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  expect(await saved(page)).toBe(afterUndo);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});

test("the Core's final reward completes the story and records victory exactly once", async ({
  page,
}) => {
  const expedition = fixture();
  const run = expedition.run;
  run.floor = 6;
  run.currentRoom = "6-1";
  run.lastRoom = "5-1";
  run.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  run.nextNodeId = 2;
  run.enemy = {
    id: "core",
    name: "BLACKOUT CORE",
    title: "The sealed relay",
    hp: 5,
    maxHp: 80,
    turn: 7,
    color: 0xff0000,
  };
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator(".forecast-net b")).toHaveText("0");
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "reward",
    { timeout: 15_000 },
  );
  await page.locator('[data-action="skip-reward"]').click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-view", "won");
  const state = JSON.parse((await saved(page))!);
  expect(state.run.floor).toBe(7);
  expect(state.recorded).toBe(true);
  let history = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "[]"),
    RECORDS,
  );
  expect(history).toHaveLength(1);
  expect(history[0].won).toBe(true);
  await page.reload();
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-view",
    "title",
  );
  history = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "[]"),
    RECORDS,
  );
  expect(history).toHaveLength(1);
});

test("a physical device drag cancelled by blur never spends energy or commits its position", async ({
  page,
}) => {
  const expedition = fixture();
  expedition.run.topology.nodes.push({
    id: "router1",
    role: "router",
    x: 0,
    z: 0,
  });
  expedition.run.topology.links.push(
    { a: "alpha", b: "router1" },
    { a: "router1", b: "omega" },
  );
  expedition.run.nextNodeId = 2;
  await installSave(page, expedition);
  await page.locator('[data-action="continue"]').click();
  const canvas = page.locator("#world");
  const bounds = await canvas.boundingBox();
  const x = bounds!.x + bounds!.width / 2;
  let hitY: number | null = null;
  // Ask the live battlefield's hit testing to find the centered router. This avoids
  // reproducing Three.js projection math or depending on a fixed camera pixel.
  for (
    let y = bounds!.y + bounds!.height * 0.35;
    y < bounds!.y + bounds!.height * 0.6;
    y += 8
  ) {
    await page.mouse.move(x, y);
    if (
      await canvas.evaluate((element) => element.style.cursor === "pointer")
    ) {
      hitY = y;
      break;
    }
  }
  expect(
    hitY,
    "The centered router should be selectable on the table",
  ).not.toBeNull();
  await page.mouse.click(x, hitY!);
  await expect(page.locator('[data-relocate-zone="north"]')).toBeVisible();
  const before = await saved(page);
  await page.mouse.move(x, hitY!);
  await page.mouse.down();
  await page.mouse.move(x + 90, hitY! + 35, { steps: 6 });
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await expect(page.locator("#movement-preview")).toContainText("RELOCATE ROUTER1");
  await expect(page.locator("#movement-preview")).toContainText("Shield");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(canvas).toHaveCSS("cursor", "grab");
  await expect(page.locator("#movement-preview")).toHaveCount(0);
  await page.mouse.move(x + 110, hitY! + 45);
  await page.mouse.up();
  expect(await saved(page)).toBe(before);
  await expect(page.locator(".energy-orb strong")).toHaveText("5");
  await page.locator('[data-relocate-zone="north"]').click();
  await expect(page.locator(".energy-orb strong")).toHaveText("4");
});

test("all card rules fit above the footer at supported desktop sizes without clipping", async ({
  page,
}) => {
  await installSave(page);
  await page.locator('[data-action="collection"]').click();
  const cards = await page
    .locator("dialog [data-collection]")
    .evaluateAll((elements) =>
      elements.map((element, index) => {
        const card = element.cloneNode(true) as HTMLElement;
        const handIndex = index % 10;
        card.dataset.hand = String(handIndex);
        delete card.dataset.collection;
        card.style.setProperty("--order", String(handIndex));
        card.querySelector(".card-footer > span:last-child")!.innerHTML =
          `<kbd>${handIndex === 9 ? "0" : handIndex + 1}</kbd>`;
        return { id: card.dataset.cardId!, html: card.outerHTML };
      }),
    );
  expect(cards).toHaveLength(Object.keys(CARDS).length);
  await page.keyboard.press("Escape");
  await page.locator('[data-action="continue"]').click();
  // Rotation and hover lift change screen bounds, not the available text box.
  // Disable only those effects to measure each card in its local coordinates.
  await page.addStyleTag({
    content:
      ".card-fan .game-card { transform: none !important; animation: none !important; transition: none !important; }",
  });
  await page.mouse.move(10, 10);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (let index = 0; index < cards.length; index += 10) {
      const batch = cards.slice(index, index + 10);
      await page.locator(".card-fan").evaluate((fan, batch) => {
        (fan as HTMLElement).style.setProperty(
          "--hand-size",
          String(batch.length),
        );
        fan.innerHTML = batch.map((card) => card.html).join("");
      }, batch);
      await page.evaluate(() => document.fonts.ready);
      const measurements = await page
        .locator(".card-fan .game-card")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const card = element as HTMLElement;
            const rule = card.querySelector<HTMLElement>(".card-rule")!;
            const copy = card.querySelector<HTMLElement>(".card-copy")!;
            const footer = card.querySelector<HTMLElement>(".card-footer")!;
            const bounds = card.getBoundingClientRect();
            return {
              id: card.dataset.cardId!,
              text: rule.textContent,
              ruleBottom: rule.getBoundingClientRect().bottom - bounds.top,
              footerTop: footer.getBoundingClientRect().top - bounds.top,
              ruleScroll: rule.scrollHeight,
              ruleHeight: rule.clientHeight,
              copyScroll: copy.scrollHeight,
              copyHeight: copy.clientHeight,
              fontSize: parseFloat(getComputedStyle(rule).fontSize),
            };
          }),
        );
      for (const card of measurements) {
        const label = `${card.id} at ${viewport.width}×${viewport.height}`;
        expect(card.text, label).toBe(
          CARDS[card.id as keyof typeof CARDS].rules,
        );
        expect(
          card.fontSize,
          `${label}: readable rule font`,
        ).toBeGreaterThanOrEqual(11);
        expect(
          card.ruleBottom,
          `${label}: rules cross the footer`,
        ).toBeLessThanOrEqual(card.footerTop - 2);
        expect(
          card.ruleScroll,
          `${label}: clipped rule text`,
        ).toBeLessThanOrEqual(card.ruleHeight + 1);
        expect(
          card.copyScroll,
          `${label}: copy exceeds its reserved space`,
        ).toBeLessThanOrEqual(card.copyHeight + 1);
      }
    }
  }
});
