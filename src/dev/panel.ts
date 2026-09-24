import "./playground.css";
import { CARDS, RELICS, RULES } from "../core/cards.ts";
import { ENEMIES } from "../core/enemies.ts";
import { ARCHETYPES, parseExpedition, type Expedition } from "../core/expedition.ts";
import { canLink, linkKey } from "../core/graph.ts";
import { grantVictory } from "../core/meta.ts";
import { STAGES } from "../core/stages.ts";
import { MAX_ASCENSION } from "../core/ascension.ts";
import type { CardId, RelicId, RunState } from "../core/types.ts";
import type { TurnResult } from "../core/run.ts";
import { esc } from "../ui.ts";
import {
  DEV_CHECKPOINT, DEV_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SETUP, SCENARIOS,
  clearFaults, clearTable, createSandbox, finishSandboxTurn, giveCard,
  inspectChannels, loadScenario, refillSandbox, removeDevice, repairAll, skipSector, toggleRelic,
  type EncounterSetup, type SandboxSettings,
} from "./sandbox.ts";

export { loadScenario } from "./sandbox.ts";
export interface PlaygroundApi {
  current(): Expedition;
  /** Transactional: failed operations leave the game untouched. */
  mutate(change: (run: RunState) => void, message: string): boolean;
  replace(expedition: Expedition): boolean;
  selectCard(index: number): void;
  selectNode(id: string): void;
  step(): void;
  notify(message: string): void;
}
export interface DevTools {
  settings: SandboxSettings;
  checkpoint(): void;
  render(run: RunState, locked: boolean): void;
  afterAction(run: RunState, before?: RunState, card?: CardId): void;
  afterTurn(run: RunState, result: TurnResult): void;
}

const option = (value: string | number, label: string | number) => `<option value="${esc(String(value))}">${esc(String(label))}</option>`;
const button = (action: string, label: string, battle = false) => `<button type="button" data-dev-button="${action}"${battle ? " data-battle-only" : ""}>${label}</button>`;
const pathText = (path: string[]) => esc(path.join(" → ").toUpperCase());

function diagram(run: RunState, channels: string[][]) {
  const colours = ["#edd29a", "#7ed1c1", "#a7bafa", "#d5a5d9"];
  const px = (x: number) => 22 + (x + 7.3) / 14.6 * 280;
  const py = (z: number) => 20 + (z + 4.7) / 9.4 * 122;
  const lines = run.topology.links.map(link => {
    const a = run.topology.nodes.find(node => node.id === link.a), b = run.topology.nodes.find(node => node.id === link.b);
    if (!a || !b) return "";
    const key = linkKey(link.a, link.b), cut = run.faultLinks.includes(key);
    const channel = channels.findIndex(path => path.slice(1).some((id, i) => linkKey(path[i], id) === key));
    return `<line x1="${px(a.x)}" y1="${py(a.z)}" x2="${px(b.x)}" y2="${py(b.z)}" stroke="${cut ? "#ed8787" : channel < 0 ? "#657481" : colours[channel % colours.length]}" stroke-width="${channel < 0 ? 1.5 : 2.5}"${cut ? ' stroke-dasharray="5 4"' : ""}/>`;
  }).join("");
  const nodes = run.topology.nodes.map(node => `<g><title>${esc(`${node.id.toUpperCase()} · ${node.role}${run.faultNodes.includes(node.id) ? " · jammed" : ""}`)}</title><circle cx="${px(node.x)}" cy="${py(node.z)}" r="${node.fixed ? 8 : 6}" fill="#0b1820" stroke="${run.faultNodes.includes(node.id) ? "#ed8787" : "#e5d7b7"}" stroke-width="2"/><text x="${px(node.x)}" y="${py(node.z) + 19}" text-anchor="middle">${esc(node.id.toUpperCase())}</text></g>`).join("");
  return `<svg class="dev-diagram" viewBox="0 0 324 168" role="img" aria-label="Current network. Independent channels use different colours; cut cables are dashed red.">${lines}${nodes}</svg>`;
}

function analysisMarkup(run: RunState, analysis: ReturnType<typeof inspectChannels>) {
  const limit = 8;
  return `${diagram(run, analysis.independent)}
    <p class="dev-rule">Channels share only ALPHA and OMEGA. Every route must contain a router.</p>
    <ol class="dev-routes">${analysis.independent.map((path, i) => `<li class="dev-independent"><b>Independent channel ${i + 1}</b><code>${pathText(path)}</code></li>`).join("")}</ol>
    ${analysis.count === 0 ? '<p class="dev-warning">No live router route reaches OMEGA.</p>' : ""}
    ${analysis.alternatives.slice(0, limit).map(route => `<div class="dev-route"><b>Alternative · no extra channel</b><code>${pathText(route.path)}</code><p>Shares ${esc(route.shared.join(", ").toUpperCase())} with the independent set above. It cannot be added alongside those routes.</p></div>`).join("")}
    ${analysis.alternatives.length > limit ? `<p>${analysis.alternatives.length - limit} more overlapping variants.</p>` : ""}
    ${analysis.invalid.slice(0, limit).map(path => `<div class="dev-route dev-warning"><b>No router · does not count</b><code>${pathText(path)}</code></div>`).join("")}
    ${analysis.blocked.slice(0, limit).map(path => `<div class="dev-route dev-warning"><b>Cut or jammed · does not count while faulted</b><code>${pathText(path)}</code></div>`).join("")}
    ${analysis.offline.length ? `<p class="dev-warning">Offline devices: ${esc(analysis.offline.join(", ").toUpperCase())}. They are not on any live router route.</p>` : ""}
    <p class="dev-note">Route variants group paths that visit the same devices. This is not a count of every cable permutation. An alternative may replace a displayed channel; it does not increase the maximum. The strongest primary damage route can differ from this independent set.</p>`;
}

export function mountDevTools(api: PlaygroundApi): DevTools {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(DEV_SETTINGS) || "null");
    for (const key of Object.keys(settings) as (keyof SandboxSettings)[]) if (typeof saved?.[key] === "boolean") settings[key] = saved[key];
  } catch { /* Optional preferences. */ }
  let checkpoint: Expedition = structuredClone(api.current());
  try { checkpoint = parseExpedition(localStorage.getItem(DEV_CHECKPOINT)) ?? checkpoint; } catch { /* Optional checkpoint. */ }
  let scenarioId = SCENARIOS.find(item => api.current().run.log.includes(`Playground: ${item.name}.`))?.id ?? "";
  let analysisKey = "";
  let locked = false;
  document.body.classList.add("dev-playground");
  const bar = document.createElement("header");
  bar.className = "dev-bar";
  bar.innerHTML = `<span class="dev-badge">DEV</span><strong>FAULTLINE <span>PLAYGROUND</span></strong><span class="dev-save-note">Separate sandbox save</span><a href="${import.meta.env.BASE_URL}">Return to game</a><button type="button" id="dev-toggle" aria-expanded="true" aria-controls="dev-panel">Hide tools</button>`;
  const panel = document.createElement("aside");
  panel.id = "dev-panel";
  panel.setAttribute("aria-label", "Playground tools");
  const enemies = Object.entries(ENEMIES).filter(([, enemy]) => enemy.kind === "hostile");
  const escorts = Object.entries(ENEMIES).filter(([, enemy]) => enemy.kind === "escort");
  panel.innerHTML = `
    <div id="dev-live" class="dev-live" aria-live="polite"></div>
    <div class="dev-tabs" role="tablist" aria-label="Playground sections">${["Scenarios", "Build", "Encounter", "Cheats"].map((name, i) => `<button type="button" role="tab" id="dev-tab-${name.toLowerCase()}" data-dev-tab="${name.toLowerCase()}" aria-selected="${i === 0}" aria-controls="dev-${name.toLowerCase()}" tabindex="${i === 0 ? 0 : -1}">${name}</button>`).join("")}</div>
    <div class="dev-scroll">
    <section id="dev-scenarios" role="tabpanel" aria-labelledby="dev-tab-scenarios">
      <h2>Why does this count?</h2>
      <fieldset class="dev-controls"><label>Channel scenario<select id="dev-scenario">${SCENARIOS.map(item => option(item.id, item.name)).join("")}</select></label>
      ${button("scenario", "Load scenario")}</fieldset>
      <div id="dev-scenario-story" class="dev-story"><p>Load an example, edit its wiring, and watch the channel proof below change with the board.</p></div>
      <div id="dev-analysis"></div>
    </section>
    <section id="dev-build" role="tabpanel" aria-labelledby="dev-tab-build" hidden>
      <h2>Build without the wait</h2>
      <fieldset class="dev-controls">
      <label class="dev-check"><input type="checkbox" data-dev-setting="freeBuild" ${settings.freeBuild ? "checked" : ""}>Free cards & energy</label>
      <p class="dev-note">Refill to 99 energy and return played cards while there is hand space. Placement, device limits and channel rules still apply.</p>
      <div class="dev-grid">${["router", "fiber", "switch", "firewall"].map(id => `<button type="button" data-dev-card="${id}" data-battle-only>${esc(CARDS[id as CardId].name)}</button>`).join("")}</div>
      <label>Find a card<input id="dev-card-search" type="search" placeholder="Name, type or rule…"></label>
      <label>Card<select id="dev-card"></select></label><p id="dev-card-rule" class="dev-note"></p>
      <div class="dev-grid">${button("play-card", "Play selected", true)}${button("deck-card", "Add to deck")}${button("clear-hand", "Clear hand", true)}${button("draw", "Draw 5", true)}</div>
      <h3>Wire the table</h3>
      <div class="dev-grid"><label>From<select id="dev-wire-a"></select></label><label>To<select id="dev-wire-b"></select></label></div>
      ${button("wire", "Connect · free cable", true)}
      <h3>Devices & faults</h3>
      <label>Device<select id="dev-node"></select></label>
      <div class="dev-grid">${button("inspect-node", "Select on table", true)}${button("jam-node", "Jam / restore", true)}${button("remove-node", "Remove device", true)}${button("repair", "Repair all", true)}</div>
      <label>Cable<select id="dev-link"></select></label>
      <div class="dev-grid">${button("cut-link", "Cut / restore", true)}${button("remove-link", "Remove cable", true)}${button("faults", "Clear faults", true)}${button("clear-table", "Clear table", true)}</div>
      <p class="dev-note">Board edits can be undone using the game's Undo control.</p>
      </fieldset>
    </section>
    <section id="dev-encounter" role="tabpanel" aria-labelledby="dev-tab-encounter" hidden>
      <h2>Go anywhere</h2>
      <fieldset class="dev-controls">
      <label>Stage<select id="dev-stage">${STAGES.map((stage, i) => option(i, `${stage.numeral} · ${stage.name}`)).join("")}</select></label>
      <div class="dev-grid"><label>Sector<select id="dev-floor">${Array.from({ length: 7 }, (_, i) => option(i, `Sector ${i + 1}`)).join("")}</select></label><label>Room<select id="dev-room">${["battle", "elite", "boss", "shop", "forge", "cache", "event"].map(type => option(type, { forge: "Sanctuary", cache: "Supply cache", event: "Unknown signal" }[type] ?? type.toUpperCase())).join("")}</select></label></div>
      <label>Keeper<select id="dev-archetype">${Object.entries(ARCHETYPES).map(([id, a]) => option(id, a.name)).join("")}</select></label>
      <div class="dev-grid"><label>Ascension<select id="dev-ascension">${Array.from({ length: MAX_ASCENSION + 1 }, (_, i) => option(i, i)).join("")}</select></label><label>Seed<input id="dev-seed" type="number" min="0" max="4294967295" step="1" value="${DEFAULT_SETUP.seed}"></label></div>
      <label>Enemy<select id="dev-enemy">${option("", "Seeded encounter / stage guardian")}${enemies.map(([id, enemy]) => option(id, enemy.name)).join("")}</select></label>
      <div class="dev-grid"><label>First escort<select id="dev-escort-a">${option("", "None")}${escorts.map(([id, enemy]) => option(id, enemy.name)).join("")}</select></label><label>Second escort<select id="dev-escort-b">${option("", "None")}${escorts.map(([id, enemy]) => option(id, enemy.name)).join("")}</select></label></div>
      <p class="dev-note">Escorts apply to a chosen enemy in battle or elite rooms. Guardians summon their own adds. A seeded encounter uses the stage's full encounter rules.</p>
      <label class="dev-check"><input id="dev-terrain" type="checkbox">Use generated terrain</label>
      <label class="dev-check"><input id="dev-keep-loadout" type="checkbox" checked>Keep deck & relics with the same keeper</label>
      ${button("encounter", "Enter selected room")}
      <p class="dev-note">Entering a room starts a fresh board and replaces the restart point. Scenarios have their own fixed teaching setup.</p>
      </fieldset>
    </section>
    <section id="dev-cheats" role="tabpanel" aria-labelledby="dev-tab-cheats" hidden>
      <h2>Test the limits</h2>
      <fieldset class="dev-controls">
      <label class="dev-check"><input type="checkbox" data-dev-setting="immortal" ${settings.immortal ? "checked" : ""}>Immortal keeper</label>
      <p class="dev-note">Damage still resolves and appears in the forecast. Integrity is restored after each transmission, including fatal hits.</p>
      <label class="dev-check"><input type="checkbox" data-dev-setting="fast" ${settings.fast ? "checked" : ""}>Fast playback</label>
      <div class="dev-grid">${button("step", "Step turn instantly", true)}${button("win", "Win encounter", true)}${button("skip", "Skip sector")}${button("heal", "Full heal")}${button("energy", "+10 energy", true)}${button("credits", "+1,000 credits")}${button("shield", "+25 shield", true)}${button("burst", "+25 burst", true)}</div>
      <h3>Player state</h3>
      <div class="dev-grid"><label>Keeper integrity<input id="dev-integrity" type="number" value="14" min="1" max="99999" step="1"></label><label>Energy<input id="dev-energy" type="number" value="5" min="0" max="999" step="1"></label></div>
      ${button("player", "Apply player state")}
      <h3>Hostile state</h3>
      <label>Hostile<select id="dev-hostile"></select></label>
      <div class="dev-grid"><label>Integrity<input id="dev-hp" type="number" value="50" min="1" max="99999" step="1"></label><label>Pattern index<input id="dev-intent" type="number" value="0" min="0" max="99" step="1"></label></div>
      ${button("hostile", "Apply hostile state", true)}
      <p class="dev-note">Pattern index starts at 0. Applying it also clears the guardian's current charge and exposure.</p>
      <h3>Relics</h3><label>Relic<select id="dev-relic">${Object.entries(RELICS).map(([id, relic]) => option(id, relic.name)).join("")}</select></label>
      <p id="dev-relic-rule" class="dev-note"></p>${button("relic", "Give / remove relic")}<p id="dev-relics" class="dev-note"></p>
      </fieldset>
    </section>
    </div>
    <footer class="dev-footer"><fieldset class="dev-controls"><div class="dev-grid">${button("checkpoint", "Save restart point")}${button("restart", "Restart setup")}${button("export", "Export setup")}${button("import", "Import setup")}</div><input id="dev-import" type="file" accept="application/json,.json" hidden></fieldset><p id="dev-status" role="status">Local playground · normal expedition progress is separate.</p></footer>`;
  document.body.prepend(bar);
  document.body.append(panel);
  // Keep control names stable when a select's current option changes.
  for (const label of Array.from(panel.querySelectorAll("label"))) {
    const control = label.querySelector("input, select");
    const name = Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim();
    if (control && name) control.setAttribute("aria-label", name);
  }
  const get = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`#dev-${id}`)!;
  const value = (id: string) => get<HTMLInputElement | HTMLSelectElement>(id).value;
  const number = (id: string, min: number, max: number) => {
    const n = Number(value(id));
    if (!value(id).trim() || !Number.isInteger(n) || n < min || n > max) throw new Error(`Enter a whole number from ${min} to ${max}.`);
    return n;
  };
  const checked = (id: string) => get<HTMLInputElement>(id).checked;
  const status = (message: string) => { get("status").textContent = message; };
  function rememberPoint() {
    checkpoint = structuredClone(api.current());
    try { localStorage.setItem(DEV_CHECKPOINT, JSON.stringify(checkpoint)); } catch { api.notify("Restart point kept for this session; browser storage is unavailable."); }
  }
  function replace(next: Expedition, label: string, fresh = false) {
    if (fresh) refillSandbox(next.run, settings);
    if (!api.replace(next)) return;
    rememberPoint();
    status(label);
  }
  function playCard(id: CardId) {
    const existing = api.current().run.hand.indexOf(id);
    if (existing >= 0) { api.selectCard(existing); return; }
    if (api.mutate(run => giveCard(run, id, "hand"), `${CARDS[id].name} added to hand.`)) api.selectCard(api.current().run.hand.length - 1);
  }
  function updateCards() {
    const query = value("card-search").trim().toLowerCase(), select = get<HTMLSelectElement>("card"), previous = select.value;
    const cards = Object.entries(CARDS).filter(([id, card]) => `${id} ${card.name} ${card.target} ${card.rules}`.toLowerCase().includes(query)).sort(([, a], [, b]) => a.name.localeCompare(b.name));
    select.innerHTML = cards.map(([id, card]) => option(id, `${card.name} · ${card.cost} energy`)).join("");
    if (cards.some(([id]) => id === previous)) select.value = previous;
    updateCardRule();
  }
  function updateCardRule() { get("card-rule").textContent = CARDS[value("card") as CardId]?.rules ?? "No matching cards."; }
  function updateRelicRule() { get("relic-rule").textContent = RELICS[value("relic") as RelicId]?.rules ?? ""; }
  function options(id: string, entries: [string, string][]) {
    const select = get<HTMLSelectElement>(id), html = entries.map(([key, label]) => option(key, label)).join("");
    if (select.dataset.options === html) return;
    const previous = select.value;
    select.innerHTML = html;
    select.dataset.options = html;
    if (entries.some(([key]) => key === previous)) select.value = previous;
  }
  function activateTab(name: string, focus = false) {
    for (const tab of Array.from(panel.querySelectorAll<HTMLElement>("[data-dev-tab]"))) {
      const selected = tab.dataset.devTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      get(tab.dataset.devTab!).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    panel.querySelector(".dev-scroll")!.scrollTop = 0;
  }
  panel.addEventListener("keydown", event => {
    // Game shortcuts must never fire while typing or navigating the tools.
    event.stopPropagation();
    const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-dev-tab]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const names = ["scenarios", "build", "encounter", "cheats"], index = names.indexOf(tab.dataset.devTab!);
    activateTab(names[event.key === "Home" ? 0 : event.key === "End" ? 3 : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4], true);
  });
  bar.addEventListener("keydown", event => event.stopPropagation());
  document.getElementById("dev-toggle")!.addEventListener("click", event => {
    const hidden = document.body.classList.toggle("dev-tools-hidden");
    panel.hidden = hidden;
    const toggle = event.currentTarget as HTMLButtonElement;
    toggle.textContent = hidden ? "Show tools" : "Hide tools";
    toggle.setAttribute("aria-expanded", String(!hidden));
  });
  panel.addEventListener("input", event => {
    if (event.target === get("card-search")) updateCards();
  });
  panel.addEventListener("change", async event => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.devSetting && !locked) {
      const key = target.dataset.devSetting as keyof SandboxSettings;
      settings[key] = target.checked;
      try { localStorage.setItem(DEV_SETTINGS, JSON.stringify(settings)); } catch { /* Optional preferences. */ }
      if (key === "freeBuild" && target.checked) api.mutate(run => refillSandbox(run, settings), "Free build enabled.");
    }
    if (target === get("card")) updateCardRule();
    if (target === get("relic")) updateRelicRule();
    if (target === get("import") && target.files?.[0]) {
      try {
        const file = target.files[0];
        if (file.size > 2_000_000) throw new Error("That setup is too large (maximum 2 MB).");
        const next = parseExpedition(await file.text());
        if (!next) throw new Error("That file is not a valid FAULTLINE expedition setup.");
        scenarioId = "";
        replace(next, "Imported setup. Your normal expedition is untouched.");
      } catch (error) { api.notify((error as Error).message); }
      target.value = "";
    }
  });
  panel.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>("[data-dev-tab]")?.dataset.devTab;
    if (tab) { activateTab(tab); return; }
    const control = target.closest<HTMLButtonElement>("button");
    if (!control || control.disabled || locked) return;
    try {
      if (control.dataset.devCard) { playCard(control.dataset.devCard as CardId); return; }
      const action = control.dataset.devButton;
      if (!action) return;
      if (action === "scenario") {
        scenarioId = value("scenario");
        replace(loadScenario(scenarioId, api.current()), "Scenario loaded. Restart setup returns to this board.", true);
        return;
      }
      if (action === "encounter") {
        const setup: EncounterSetup = {
          stage: number("stage", 0, 2), floor: number("floor", 0, 6), type: value("room") as EncounterSetup["type"],
          archetype: value("archetype") as EncounterSetup["archetype"], ascension: number("ascension", 0, MAX_ASCENSION), seed: number("seed", 0, 0xffffffff),
          enemy: value("enemy"), escorts: [value("escort-a"), value("escort-b")].filter(Boolean), terrain: checked("terrain"), keepLoadout: checked("keep-loadout"),
        };
        scenarioId = "";
        replace(createSandbox(setup, api.current()), "Selected room loaded. Restart setup returns to this room.", true);
        return;
      }
      if (action === "play-card") { if (value("card")) playCard(value("card") as CardId); return; }
      if (action === "inspect-node") { if (value("node")) api.selectNode(value("node")); return; }
      if (action === "step") { api.step(); return; }
      if (action === "checkpoint") { rememberPoint(); status("Restart point saved, including this board, hand and hostile state."); return; }
      if (action === "restart") { if (api.replace(structuredClone(checkpoint))) status("Restart point restored."); return; }
      if (action === "import") { get<HTMLInputElement>("import").click(); return; }
      if (action === "export") {
        const blob = new Blob([JSON.stringify(api.current(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "faultline-dev-setup.json"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status("Setup exported. Import it here to replay the same state.");
        return;
      }
      const ok = api.mutate(run => {
        switch (action) {
          case "deck-card": giveCard(run, value("card") as CardId, "deck"); break;
          case "clear-hand": run.discardPile.push(...run.hand); run.hand = []; break;
          case "draw": for (let i = 0; i < 5 && run.hand.length < RULES.handLimit && run.drawPile.length; i++) run.hand.push(run.drawPile.shift()!); break;
          case "wire": {
            const a = value("wire-a"), b = value("wire-b");
            if (!canLink(run.topology, a, b)) throw new Error("Choose two different cableable devices without an existing cable.");
            run.topology.links.push({ a, b }); break;
          }
          case "jam-node": {
            const id = value("node");
            if (!id) throw new Error("Build a device first.");
            run.faultNodes = run.faultNodes.includes(id) ? run.faultNodes.filter(item => item !== id) : [...run.faultNodes, id];
            delete run.lingeringJams?.[id]; break;
          }
          case "remove-node": removeDevice(run, value("node")); break;
          case "cut-link": {
            const key = value("link");
            if (!key) throw new Error("Build a cable first.");
            if (!run.faultLinks.includes(key) && run.faultLinks.length >= 20) throw new Error("Restore a cable first; a saved setup supports at most 20 simultaneous cuts.");
            run.faultLinks = run.faultLinks.includes(key) ? run.faultLinks.filter(item => item !== key) : [...run.faultLinks, key]; break;
          }
          case "remove-link": {
            const key = value("link");
            run.topology.links = run.topology.links.filter(link => linkKey(link.a, link.b) !== key);
            run.faultLinks = run.faultLinks.filter(item => item !== key);
            run.frayedByCut = run.frayedByCut?.filter(item => item !== key); break;
          }
          case "clear-table": clearTable(run); break;
          case "faults": clearFaults(run); break;
          case "repair": repairAll(run); break;
          case "heal": run.integrity = run.maxIntegrity; break;
          case "energy": run.energy += 10; break;
          case "credits": run.credits += 1000; break;
          case "shield": run.block += 25; break;
          case "burst": run.packetBoost += 25; break;
          case "player": run.integrity = number("integrity", 1, 99999); run.maxIntegrity = Math.max(run.maxIntegrity, run.integrity); run.energy = number("energy", 0, 999); break;
          case "win": run.enemies.forEach(enemy => { enemy.hp = 0; }); run.offers = []; grantVictory(run); break;
          case "skip": skipSector(run); break;
          case "relic": toggleRelic(run, value("relic") as RelicId); break;
          case "hostile": {
            const enemy = run.enemies.find(enemy => enemy.uid === value("hostile"));
            if (!enemy) throw new Error("Choose a living hostile.");
            enemy.hp = number("hp", 1, 99999); enemy.maxHp = Math.max(enemy.maxHp, enemy.hp);
            enemy.turn = number("intent", 0, 99);
            delete enemy.step; delete enemy.resume; delete enemy.chargedEarly; delete enemy.skipCharge;
            delete enemy.exposed; delete enemy.skipNext; break;
          }
          default: throw new Error("Unknown playground control.");
        }
      }, `${control.textContent?.trim()} applied.`);
      if (ok) status(`${control.textContent?.trim()} applied. Channel analysis is live.`);
    } catch (error) { api.notify((error as Error).message); }
  });
  updateCards();
  updateRelicRule();
  get<HTMLSelectElement>("scenario").value = scenarioId || "empty";
  return {
    settings,
    checkpoint: rememberPoint,
    afterAction: (run, before, card) => refillSandbox(run, settings, before, card),
    afterTurn: (run, result) => finishSandboxTurn(run, settings, result),
    render(run, disabled) {
      locked = disabled;
      for (const fieldset of Array.from(panel.querySelectorAll<HTMLFieldSetElement>(".dev-controls"))) fieldset.disabled = disabled;
      for (const control of Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-battle-only]"))) control.disabled = run.phase !== "battle";
      const key = JSON.stringify([run.topology, run.faultNodes, run.faultLinks, run.zoneEffects, run.relics, run.frayedByCut, run.terrain]);
      if (analysisKey !== key) {
        const analysis = inspectChannels(run);
        get("analysis").innerHTML = analysisMarkup(run, analysis);
        panel.dataset.channels = String(analysis.count);
        panel.dataset.variants = String(analysis.variants);
        analysisKey = key;
      }
      get("live").innerHTML = `<div><strong>${panel.dataset.channels}</strong><span>live channels</span></div><div><strong>${panel.dataset.variants}</strong><span>route variants</span></div><small>${esc(STAGES[run.stage].name)} · sector ${run.floor + 1} · ${esc(run.phase)}${run.phase === "battle" ? ` · turn ${run.turn}` : ""}${disabled ? " · controls paused" : ""}</small>`;
      const scenario = SCENARIOS.find(item => item.id === scenarioId);
      get("scenario-story").innerHTML = scenario ? `<h3>${esc(scenario.name)}</h3><p>${esc(scenario.explanation)}</p><p class="dev-experiment"><b>Try it:</b> ${esc(scenario.experiment)}</p><small>Preset explanation. The live proof below follows your edits.</small>` : "<p>Load an example, edit its wiring, and watch the channel proof below change with the board.</p>";
      const devices: [string, string][] = run.topology.nodes.map(node => [node.id, `${node.id.toUpperCase()} · ${node.role}${run.faultNodes.includes(node.id) ? " · jammed" : ""}`]);
      options("wire-a", devices); options("wire-b", devices);
      options("node", devices.filter(([id]) => !run.topology.nodes.find(node => node.id === id)?.fixed));
      options("link", run.topology.links.map(link => [linkKey(link.a, link.b), `${link.a.toUpperCase()} ↔ ${link.b.toUpperCase()}${run.faultLinks.includes(linkKey(link.a, link.b)) ? " · CUT" : ""}`]));
      options("hostile", run.enemies.filter(enemy => enemy.hp > 0).map(enemy => [enemy.uid, `${enemy.port} · ${enemy.name} · ${enemy.hp} HP`]));
      get("relics").textContent = `Equipped: ${run.relics.map(id => RELICS[id].name).join(", ") || "none"}.`;
    },
  };
}
