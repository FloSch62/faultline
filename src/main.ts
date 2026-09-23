import "./style.css";
import "./alpha.css";
import "./polish.css";
import { Soundscape, type ScoreScene } from "./audio.ts";
import { ENEMIES } from "./core/enemies.ts";
import { CARDS } from "./core/cards.ts";
import {
  ARCHETYPES,
  dailySeed,
  newExpedition,
  parseExpedition,
  type Archetype,
  type Expedition,
  type RunRecord,
} from "./core/expedition.ts";
import { topologyYaml } from "./core/export.ts";
import {
  relocateNode,
  playZone,
  zoneDescription,
  zoneForNode,
  canTargetNode,
  combatPreview,
  removeDeckCard,
  chooseCardReward,
  chooseForge,
  chooseRelic,
  chooseRoom,
  costFor,
  createRun,
  endTurn,
  playGround,
  playInstant,
  playLink,
  playNode,
  prepareCard,
  releasePreparedCard,
  signalPaths,
  type ActionResult,
} from "./core/run.ts";
import type { CardId, RelicId, RunState, Zone } from "./core/types.ts";
import { World, type WorldPoint } from "./three/World.ts";
import * as ui from "./ui.ts";
import * as alpha from "./alpha-ui.ts";
import { loadPreferences, storePreferences } from "./preferences.ts";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const STORAGE = "faultline-expedition-v2";
const sound = new Soundscape();
let expedition: Expedition | null = null;
let records: RunRecord[] = [];
try {
  expedition = parseExpedition(localStorage.getItem(STORAGE));
  records = JSON.parse(localStorage.getItem("faultline-records-v2") || "[]");
  if (!Array.isArray(records)) records = [];
  records = records
    .filter((r) => r && Number.isFinite(r.score) && typeof r.won === "boolean")
    .slice(0, 30);
} catch {
  /* Saves are optional. */
}
let run = expedition?.run ?? createRun();
let view: "title" | "select" | "run" = "title";
let archetype: Archetype = "architect";
let daily = false;
let selected: number | null = null;
let source: string | null = null;
let selectedNode: string | null = null;
let busy = false;
let world: World | null = null;
let webglFailed = false;
let handKey = "";
let modal = "";
let toastTimer = 0;
const preferences = loadPreferences();
let tutorial = preferences.tips;
let libraryMode: alpha.LibraryMode = "collection";
let libraryRun: RunState | null = null;
let libraryRarity = "all";
let libraryQuery = "";
let inspectReturn: alpha.LibraryMode | null = null;
let practice: { step: number; expedition: Expedition | null; run: RunState; view: "title" | "select" | "run"; undo: RunState[] } | null = null;
let discardArmed = false;
let battleGeneration = 0;
let cardDrag: {
  index: number;
  x: number;
  y: number;
  ghost: HTMLElement | null;
  moved: boolean;
} | null = null;
let ignoreClick = false;
let deviceDragging = false;
const undoStack: RunState[] = [];


$("#app").innerHTML =
  `<main class="game-root"><div class="scene-backdrop"></div><div class="scene-shade"></div><div class="motes" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 47) % 100}%;--duration:${14 + (i % 8) * 3}s;--delay:-${i * 2.7}s;--size:${(i % 3) + 1}px"></i>`).join("")}</div><div class="world-stage"><canvas id="world" aria-label="Network battlefield. Use cards and the device targeting controls to build your route."></canvas></div><div class="texture"></div><header id="header" class="game-header"></header><div id="screen"></div><div id="battle-hud"></div><div id="hand-zone"></div><div id="target-dock"></div><div id="lesson-layer"></div><div id="game-tooltip" role="tooltip"></div><div id="impact-layer" aria-hidden="true"></div><div id="battle-flash"></div><div id="toast" role="status" aria-live="polite"></div><div class="now-playing" id="now-playing"></div></main><dialog id="dialog" aria-label="Field journal"><div class="dialog-surface"><button class="dialog-close" data-action="close" aria-label="Close dialog">${ui.icon("close", 22)}</button><div id="dialog-content"></div></div></dialog>`;
const root = $(".game-root"),
  dialog = $<HTMLDialogElement>("#dialog");
sound.update({});
sound.onUnavailable = () => {
  $("#now-playing").textContent = "Some audio could not load";
};
function renderTrack() {
  $("#now-playing").innerHTML = `<span class="music-bars"><i></i><i></i><i></i></span><span>${sound.trackTitle}<small>ORIGINAL SOUNDTRACK</small></span>`;
  $("#now-playing").classList.toggle("muted", sound.settings.muted);
}
sound.onTrackChange = renderTrack;
function save() {
  if (!expedition || practice) return;
  expedition.run = run;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(expedition));
  } catch {
    toast("Progress could not be saved in this browser.");
  }
}
function toast(message: string, kind = "normal") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.className = ""), 3500);
}
function audioScene(): ScoreScene {
  if (view === "run" && (run.phase === "forge" || run.phase === "relic")) return "sanctuary";
  if (view === "run" && run.phase === "reward" && run.map.find(room => room.id === run.currentRoom)?.type === "cache") return "shop";
  if (view === "run" && run.phase === "battle" && run.map.find(room => room.id === run.currentRoom)?.type === "elite") return "elite";
  return view === "run" && run.phase === "battle"
    ? run.enemy && ENEMIES[run.enemy.id].boss
      ? "boss"
      : "battle"
    : "explore";
}
function ensureWorld() {
  if (world || webglFailed) return;
  try {
    world = new World($("#world"), {
      onGround,
      onNode,
      onLink: () => {},
      onMove,
    });
    world.setBattle(run.topology, run.enemy, run.faultNode, run.faultLink);
  } catch (error) {
    webglFailed = true;
    console.error("Could not create battlefield", error);
    toast(
      "3D rendering is unavailable. Use the deployment and device controls below.",
      "error",
    );
  }
}
function clearSelection() {
  cancelDrag();
  selected = null;
  source = null;
  selectedNode = null;
  world?.setPlacement(null);
  world?.setSelected(null);
  world?.setZoneTargeting(false);
  world?.setZonePreview(null);
  document.getElementById("movement-preview")?.remove();
}
function playable() {
  return view === "run" && run.phase === "battle" && !busy && !dialog.open;
}
function interfaceScale() { return Number.parseFloat(getComputedStyle($("#app")).zoom) || 1; }
function render(rebuild = true) {
  const battle = view === "run" && run.phase === "battle";
  root.dataset.view = view === "run" ? run.phase : view;
  root.classList.toggle("is-battle", battle);
  root.classList.toggle("in-market", view === "run" && run.phase === "reward" && run.map.find(room=>room.id===run.currentRoom)?.type === "cache");
  root.classList.toggle("busy", busy);
  root.classList.toggle("is-practice", !!practice);
  root.dataset.lesson = practice ? String(practice.step) : "";
  $("#lesson-layer").innerHTML = practice && battle ? alpha.lessonMarkup(practice.step) : "";
  $("#header").innerHTML = ui.headerMarkup(
    expedition,
    view === "title" || view === "select",
    sound.settings,
  );
  if (battle) {
    ensureWorld();
    if (rebuild)
      world?.setBattle(run.topology, run.enemy, run.faultNode, run.faultLink);
    const forecast = combatPreview(run);
    root.dataset.guardianWindow = forecast.lethal ? "" : forecast.interrupted ? "break" : forecast.intent?.ultimate ? "ultimate" : forecast.intent?.kind === "charge" ? "charge" : run.enemy?.exposed ? "exposed" : "";
    world?.setSignalRoute(forecast.signalPath, forecast.alternatePath);
    world?.setForecastTarget(forecast.faultTarget);
    world?.setForecastZone(forecast.hazardZone);
    world?.setZoneEffects(run.zoneEffects);
  }
  if (!battle) delete root.dataset.guardianWindow;
  world?.setVisible(battle);
  let screen = "";
  if (view === "title") screen = ui.titleMarkup(expedition, records);
  else if (view === "select")
    screen = ui.selectMarkup(
      archetype,
      daily,
      Boolean(expedition && !["won", "lost"].includes(run.phase)),
    );
  else if (run.phase === "map") screen = ui.mapMarkup(expedition!);
  else if (run.phase === "reward") screen = ui.rewardMarkup(run);
  else if (run.phase === "relic") screen = ui.relicMarkup(run);
  else if (run.phase === "forge") screen = ui.forgeMarkup(run);
  else if (run.phase === "won" || run.phase === "lost")
    screen = ui.outcomeMarkup(expedition!);
  $("#screen").innerHTML = screen;
  if (view === "run" && run.phase === "map") {
    const chart = $<HTMLElement>(".route-scroll"), nextRoom = chart.querySelector<HTMLElement>(".route-room.available");
    if (nextRoom) {
      chart.scrollTop = Math.max(0, nextRoom.offsetTop - chart.clientHeight * .68);
      chart.scrollLeft = Math.max(0, nextRoom.offsetLeft - chart.clientWidth / 2);
    }
  }
  $("#battle-hud").innerHTML = battle
    ? ui.battleMarkup(
        expedition!,
        selected,
        source,
        busy,
        tutorial && !practice,
        undoStack.length > 0,
      )
    : "";
  const signature = battle
    ? `${run.currentRoom}|${run.turn}|${run.energy}|${run.firstFiberPlayed}|${run.hand.join(",")}`
    : "";
  // Leaving a battle must clear the DOM even when practice reset the cache key.
  $("#hand-zone").hidden = !battle;
  if (!battle || signature !== handKey) {
    const scroll = document.querySelector(".card-fan")?.scrollLeft ?? 0;
    $("#hand-zone").innerHTML = battle ? ui.handMarkup(run, selected) : "";
    document.querySelector(".card-fan")?.scrollTo({left:scroll});
    handKey = signature;
  } else if (battle)
    document
      .querySelectorAll<HTMLElement>("[data-hand]")
      .forEach((el) =>
        el.classList.toggle("selected", Number(el.dataset.hand) === selected),
      );
  if (selected !== null) document.querySelector(`[data-hand="${selected}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});
  renderTargetDock();
  if (selected !== null && run.hand[selected])
    world?.setPlacement(CARDS[run.hand[selected]].role ?? null, source);
  else world?.setPlacement(null);
  world?.setSelected(source ?? selectedNode);
  world?.setZoneTargeting(selected !== null && CARDS[run.hand[selected]]?.target === "zone");
  const scene = audioScene();
  sound.setScene(scene, `${run.seed}:${run.stage}:${run.currentRoom}:${practice ? "practice" : "expedition"}`);
  renderTrack();
  if (
    expedition &&
    !practice &&
    ["won", "lost"].includes(run.phase) &&
    !expedition.recorded
  ) {
    expedition.recorded = true;
    records.unshift({
      seed: run.seed,
      archetype: expedition.archetype,
      won: run.phase === "won",
      score: run.score,
      floor: run.stage * 7 + run.floor,
      at: Date.now(),
    });
    records = records.slice(0, 30);
    try {
      localStorage.setItem("faultline-records-v2", JSON.stringify(records));
    } catch {
      /* Optional history. */
    }
    save();
  }
  if (battle && !practice && !run.bossIntroSeen && run.enemy && ENEMIES[run.enemy.id].boss && !dialog.open) {
    modal = "boss-intro";
    dialog.className = "boss-intro";
    $("#dialog-content").innerHTML = ui.bossIntroMarkup(run);
    hideTooltip();
    dialog.showModal();
    sound.effect("boss");
  }
}
function renderTargetDock() {
  let markup = "";
  if (view === "run" && run.phase === "battle") {
    if (selected !== null) {
      const c = CARDS[run.hand[selected]];
      if (c?.target === "ground")
        markup = `<div class="target-options"><span>PLACE ON THE TABLE OR</span><button data-action="auto-place">${ui.icon("cache", 14)} Deploy in a free socket</button>${practice ? "" : (["north", "center", "south"] as const).map(zone => `<button data-deploy-zone="${zone}">${zone.toUpperCase()} BAND</button>`).join("")}</div>`;
      else if (c?.target === "zone")
        markup = `<div class="target-options"><span>${ui.esc(c.name.toUpperCase())} · SELECT A FIELD SEAL</span></div>`;
      else if (c?.target === "link" || c?.target === "node")
        markup = `<div class="target-options"><span>${source ? "CONNECT TO" : "CHOOSE DEVICE"}</span>${run.topology.nodes
          .filter(
            (n) =>
              c.target === "link" || canTargetNode(run, selected!, n.id),
          )
          .map(
            (n) =>
              `<button data-node="${n.id}" class="${source === n.id ? "active" : ""}">${n.id === "alpha" ? "ALPHA" : n.id === "omega" ? "OMEGA" : n.id.toUpperCase()}</button>`,
          )
          .join("")}</div>`;
    }
    if (selected === null && selectedNode) {
      const node = run.topology.nodes.find(n => n.id === selectedNode);
      if (node) markup = `<div class="target-options device-controls"><span>${ui.esc(node.id.toUpperCase())} · ${zoneForNode(node).toUpperCase()}${node.configured ? " · CONFIGURED" : ""}${node.shielded ? " · JAM PROTECTED" : ""}</span>${node.fixed || practice ? "" : `<span>RELOCATE · 1 ENERGY</span>${(["north", "center", "south"] as const).map(zone => `<button data-relocate-zone="${zone}" ${run.energy < 1 ? "disabled" : ""}>${zone.toUpperCase()}</button>`).join("")}`}<button data-action="cancel">CLOSE ×</button></div>`;
    }
    if (webglFailed)
      markup += `<div class="fallback-network">${run.topology.links.map((l) => `${ui.esc(l.a)} ↔ ${ui.esc(l.b)}`).join(" · ") || "ALPHA · No connections · OMEGA"}</div>`;
  }
  $("#target-dock").innerHTML = markup;
}
function openModal(type: string) {
  if (busy) return;
  modal = type;
  clearSelection();
  render(false);
  const content = $("#dialog-content");
  if (type === "relic-journal") content.innerHTML = alpha.relicJournalMarkup(run);
  else if (type === "settings")
    content.innerHTML = ui.settingsMarkup(sound.settings, view === "run", preferences);
  else if (type === "help") content.innerHTML = alpha.guideMarkup();
  else if (type === "combat-details") content.innerHTML = alpha.combatDetailsMarkup(run);
  else if (type === "enemy-dossier") content.innerHTML = alpha.enemyDossierMarkup(run);
  else if (type === "combat-log") content.innerHTML = alpha.historyMarkup(run);
  else if (type === "refine") content.innerHTML = alpha.refineMarkup(run);
  else if (type === "devices") content.innerHTML = alpha.devicesMarkup(run);
  else if (type === "prepare") content.innerHTML = alpha.prepareMarkup(run);
  else if (["deck", "collection", "draw-pile", "discard-pile", "exhaust-pile", "loadout"].includes(type)) {
    libraryMode = type === "loadout" ? "deck" : type as alpha.LibraryMode;
    libraryRun = type === "loadout" ? newExpedition(archetype, 1).run : run;
    libraryRarity = "all";
    libraryQuery = "";
    content.innerHTML = alpha.libraryMarkup(libraryRun, libraryMode);
  }
  else if (type === "credits")
    content.innerHTML = `<span class="eyebrow">THE PEOPLE & TOOLS BEHIND THE SIGNAL</span><h2>From an idea to an odyssey.</h2><div class="credits-copy"><h3>The Containerlab universe</h3><p>Inspired by Containerlab and the networks we build together. FAULTLINE is an independent fan project. The Containerlab mark is used under its original license.</p><h3>Original art</h3><p>Relay cathedral, sanctuary, ruined chamber, an expanded illustrated card collection, hostile creatures and painted interface pieces created for this game using OpenAI image generation. Typography: Cinzel and Barlow, under the SIL Open Font License.</p><h3>Original score · YuE2</h3><p>The Last Relay · Signal & Steel · The Blackout Core · The Copper Market · A Light Left On · A Thousand Fractures · Copperlight Pursuit · Ghosts in the Relay · Redline Protocol. Generated locally with the official YuE2 model and listening decoder. The score uses instrumental arrangements; vocal stems were removed with Demucs. Generation prompts and provenance are included in the project.</p><h3>Sound effects · Kenney</h3><p>Recorded card Foley, metal, glass and impact materials from Kenney’s CC0 Casino Audio, Impact Sounds and Sci-fi Sounds packs. Layered and mastered for FAULTLINE; source recordings, licenses and recipes are included.</p><h3>A real network, in miniature</h3><p>Packets and faults are simulated in your browser. You can export the topology to Containerlab; real routing requires device configuration and container images.</p></div>`;
  else if (type === "replace")
    content.innerHTML = `<span class="eyebrow">AN EXPEDITION IS ALREADY IN PROGRESS</span><h2>Leave this route behind?</h2><p class="modal-intro">Beginning a new expedition replaces your current saved run in stage ${run.stage + 1}, sector ${run.floor + 1}.</p><div class="confirm-actions"><button class="gold-button" data-action="confirm-replace">Begin a new expedition ${ui.icon("arrow")}</button><button class="text-button" data-action="close">Keep my current expedition</button></div>`;
  dialog.className = [
    "deck",
    "collection",
    "draw-pile",
    "discard-pile",
    "exhaust-pile",
    "combat-details",
    "refine",
    "loadout",
    "help",
  ].includes(type)
    ? "wide"
    : "";
  hideTooltip();
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  if (modal === "boss-intro") {
    run.bossIntroSeen = true;
    save();
  }
  modal = "";
  dialog.close();
  dialog.className = "";
  render(false);
}
function begin() {
  if (expedition && !["won", "lost"].includes(run.phase) && !discardArmed) {
    openModal("replace");
    return;
  }
  discardArmed = false;
  expedition = newExpedition(
    archetype,
    daily
      ? dailySeed()
      : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
    daily,
  );
  run = expedition.run;
  view = "run";
  busy = false;
  battleGeneration++;
  undoStack.length = 0;
  clearSelection();
  handKey = "";
  save();
  render();
  sound.effect("reward");
}
function playAction(action: () => ActionResult, cue?: "field" | "cleanse") {
  if (!playable()) return false;
  const before = structuredClone(run),
    result = action();
  if (!result.ok) {
    toast(result.message, "error");
    sound.effect("error");
    return false;
  }
  undoStack.push(before);
  if (undoStack.length > 20) undoStack.shift();
  const connected = run.topology.links.length > before.topology.links.length;
  if (run.block > before.block) world?.pulseNetwork("shield");
  else if (run.faultNode !== before.faultNode || run.faultLink !== before.faultLink || run.integrity > before.integrity) world?.pulseNetwork("repair");
  else if (run.energy > before.energy || run.packetBoost > before.packetBoost) world?.pulseNetwork("surge");
  if (run.block > before.block) floatText(`+${run.block - before.block} shield`, false, "shield");
  if (run.packetBoost > before.packetBoost) floatText(`+${run.packetBoost - before.packetBoost} burst`, true, "burst");
  updateLesson();
  clearSelection();
  save();
  render();
  if (cue) {
    sound.effect(cue);
    toast(result.message);
  } else sound.effect(run.topology.nodes.length > before.topology.nodes.length ? "deploy"
    : connected ? "connect" : run.block > before.block ? "block"
    : run.integrity > before.integrity || run.faultNode !== before.faultNode || run.faultLink !== before.faultLink ? "cleanse" : "card");
  return true;
}
function chooseCard(index: number) {
  if (!playable() || !run.hand[index]) return;
  if (costFor(run, index) > run.energy) {
    toast("Not enough energy. Transmit to recharge.", "error");
    sound.effect("error");
    return;
  }
  const c = CARDS[run.hand[index]];
  if (practice) {
    const expected = practice.step === 0 ? "router" : practice.step <= 2 ? "fiber" : practice.step === 4 ? "guard" : null;
    if (c.id !== expected) { toast("Follow the field lesson, or leave practice to play freely."); return; }
  }
  if (c.target === "instant") {
    playAction(() => playInstant(run, index));
    return;
  }
  selected = selected === index ? null : index;
  source = null;
  selectedNode = null;
  render(false);
  sound.effect("select");
}
function onGround(point: WorldPoint) {
  if (!playable() || selected === null) return;
  const index = selected;
  if (CARDS[run.hand[index]]?.target === "ground")
    playAction(() => playGround(run, index, point.x, point.z));
  else if (CARDS[run.hand[index]]?.target === "zone") castZone(zoneForNode(point));
}
function castZone(zone: Zone) {
  if (!playable() || selected === null || CARDS[run.hand[selected]]?.target !== "zone") {
    if (playable()) toast(`${zone.toUpperCase()} · ${zoneDescription(run,zone)}`);
    return;
  }
  const index = selected, cleanse = run.hand[index] === "purge-field";
  if (playAction(() => playZone(run,index,zone),cleanse ? "cleanse" : "field")) world?.pulseZone(zone,cleanse ? "cleanse" : "field");
}
function onNode(id: string) {
  if (!playable()) return;
  if (selected !== null) {
    const index = selected,
      c = CARDS[run.hand[index]];
    if (!c) return;
    if (c.target === "zone") {
      const node = run.topology.nodes.find(n=>n.id===id);
      if (node) castZone(zoneForNode(node));
      return;
    }
    if (c.target === "link") {
      if (source === id) {
        source = null;
        render(false);
      } else if (!source) {
        source = id;
        render(false);
        sound.effect("hover");
      } else {
        const from = source;
        if (practice) {
          const router = run.topology.nodes.find(n => n.role === "router")!.id;
          const expected = practice.step === 1 ? ["alpha", router] : [router, "omega"];
          if (![from, id].every(n => expected.includes(n))) { toast(`Connect ${expected.join(" → ").toUpperCase()} for this lesson.`); return; }
        }
        playAction(() => playLink(run, index, from, id));
      }
      return;
    }
    if (c.target === "node") {
      playAction(() => playNode(run, index, id));
      return;
    }
  }
  selectedNode = id;
  render(false);
}
function onMove(id: string, point: WorldPoint | null, finished: boolean) {
  if (!playable() || selected !== null) return;
  const node = run.topology.nodes.find(n => n.id === id);
  if (!node || node.fixed) return;
  if (!point) {
    if (finished) { deviceDragging = false; clearSelection(); render(); }
    else {
      const preview=document.getElementById("movement-preview");
      if(preview) { preview.className="blocked"; preview.textContent="Outside the build grid · release to cancel"; }
      world?.setZonePreview(null);
    }
    return;
  }
  if (practice) { if (finished) { render(); toast("Keep the training router in place for this lesson."); } return; }
  if (finished) {
    deviceDragging = false;
    const destination = zoneForNode(point), origin = zoneForNode(node);
    if (!playAction(() => relocateNode(run, id, point.x, point.z))) { clearSelection(); render(); }
    else if (origin !== destination) { sound.effect("move"); world?.pulseZone(destination,"move"); toast(`${id.toUpperCase()} · ${origin.toUpperCase()} → ${destination.toUpperCase()} · 1 energy`); }
    return;
  }
  const blocked = run.energy < 1 ? "Not enough energy" : run.topology.nodes.some(n => n.id !== id && Math.hypot(n.x - point.x, n.z - point.z) < 1.55) ? "Socket occupied" : "";
  const origin = zoneForNode(node), destination = zoneForNode(point);
  const next = structuredClone(run);
  const nextNode = next.topology.nodes.find(n=>n.id===id)!;
  nextNode.x=point.x; nextNode.z=point.z;
  const before = combatPreview(run), after = combatPreview(next);
  let preview = document.getElementById("movement-preview");
  if (!preview) { preview = document.createElement("div"); preview.id="movement-preview"; preview.setAttribute("role","status"); root.append(preview); }
  preview.className=blocked ? "blocked" : "";
  preview.innerHTML=`<span class="move-caption">RELOCATE ${ui.esc(id.toUpperCase())}</span><strong>${origin.toUpperCase()} ${ui.icon("arrow",16)} ${destination.toUpperCase()}</strong><span>${blocked || "Release to move · 1 energy"}</span><div><span>Damage <b>${before.packetDamage} → ${after.packetDamage}</b></span><span>Shield <b>${before.shield} → ${after.shield}</b></span><span>Life lost <b>${before.incoming} → ${after.incoming}</b></span></div><small>${ui.esc(zoneDescription(run,destination))}</small>`;
  world?.setZonePreview(destination, !!blocked);
  deviceDragging = true;
  if (blocked) return;
  // A drag previews geometry; only the drop pays energy and mutates the run.
  deviceDragging = true;
  const topology = structuredClone(run.topology);
  const moved = topology.nodes.find(n => n.id === id)!;
  moved.x = point.x; moved.z = point.z;
  world?.setBattle(topology, run.enemy, run.faultNode, run.faultLink);
}
function relocateToZone(zone: "north" | "center" | "south") {
  if (!selectedNode || !playable() || practice) return;
  const id = selectedNode;
  const node = run.topology.nodes.find(n => n.id === id)!;
  const z = { north: -2.5, center: 0, south: 2.5 }[zone];
  const x = [node.x, 0, -2.5, 2.5, -4.5, 4.5].find(x => run.topology.nodes.every(n => n.id === id || Math.hypot(n.x - x, n.z - z) >= 1.55));
  if (x === undefined) { toast("No free socket in that band.", "error"); return; }
  if (Math.hypot(node.x-x,node.z-z) < 0.01) { toast(`${id.toUpperCase()} is already in this socket.`); return; }
  if (!playAction(() => relocateNode(run, id, x, z))) return;
  sound.effect("move");
  world?.pulseZone(zone,"move");
  toast(`${id.toUpperCase()} → ${zone.toUpperCase()} · 1 energy · ${zoneDescription(run,zone)}`);
}

function autoPlace(zone?: "north" | "center" | "south") {
  if (selected === null || !playable()) return;
  const spaces = [
    { x: 0, z: 0 },
    { x: -2, z: -2 },
    { x: 2, z: -2 },
    { x: -2, z: 2 },
    { x: 2, z: 2 },
    { x: 0, z: -3.5 },
    { x: 0, z: 3.5 },
    { x: -4, z: 0 },
    { x: 4, z: 0 },
    { x: -4, z: -3 },
    { x: 4, z: 3 },
  ];
  const point = spaces.find(
    (p) =>
      (!zone || zoneForNode(p) === zone) && !run.topology.nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 1.55),
  );
  if (point) onGround(point);
  else toast("Place this hardware in an empty space on the table.");
}
function undo() {
  if (!playable() || !undoStack.length) return;
  cancelDrag();
  const prev = undoStack.pop()!;
  if (prev.currentRoom !== run.currentRoom || prev.turn !== run.turn) return;
  run = prev;
  if (practice) practice.step = run.turn > 1 ? (run.block >= 4 ? 5 : 4) : run.topology.nodes.length < 3 ? 0 : run.topology.links.length === 0 ? 1 : signalPaths(run).length ? 3 : 2;
  expedition!.run = run;
  clearSelection();
  save();
  render();
  sound.effect("card");
}
function floatText(text: string, good: boolean, kind = "") {
  const el = document.createElement("span");
  el.className = `damage-number ${good ? "outgoing" : "incoming"} ${kind}`;
  el.textContent = text;
  $("#impact-layer").append(el);
  window.setTimeout(() => el.remove(), 1500);
}
function transmit() {
  if (!playable()) return;
  if (practice && ![3, 5].includes(practice.step)) { toast("Complete the current lesson before transmitting."); return; }
  const generation = ++battleGeneration;
  const forecast = combatPreview(run);
  clearSelection();
  busy = true;
  undoStack.length = 0;
  const next = structuredClone(run),
    result = endTurn(next);
  const becomesEnraged = !result.defeated && next.enemy && ENEMIES[next.enemy.id].enrages && run.enemy!.hp > run.enemy!.maxHp / 2 && next.enemy.hp <= next.enemy.maxHp / 2;
  sound.effect("turn");
  render(false);
  const finish = () => {
    if (generation !== battleGeneration) return;
    if (result.packetDamage) {
      world?.impact(0xfbd69a, 36);
      sound.effect("hit", { power: Math.min(1.2, .7 + result.packetDamage / 12) });
      floatText(`−${result.packetDamage}`, true);
      // Show contact immediately while the already forecast enemy action remains
      // committed. The rule state advances only when the sequence completes.
      const health = $(".enemy-health");
      health.setAttribute("aria-valuenow", String(next.enemy!.hp));
      health.querySelector<HTMLElement>("span")!.style.width = `${next.enemy!.hp / next.enemy!.maxHp * 100}%`;
      health.querySelector(".health-risk")?.remove();
      $(".enemy-health-label strong").innerHTML = `${next.enemy!.hp}<small> / ${next.enemy!.maxHp}</small>`;
    } else toast(result.signalPath.length ? "The signal was absorbed. Check armor and hostile fields." : "No live route. The signal could not reach OMEGA.", "error");
    const resolve = () => {
      if (generation !== battleGeneration) return;
      run = next;
      expedition!.run = run;
      busy = false;
      delete root.dataset.enemyAction;
      if (practice) {
        if (practice.step === 3) {
          practice.step = 4;
          run.hand = ["guard", "pulse", "patch"];
          run.enemy!.turn = 0;
        } else if (practice.step === 5) practice.step = 6;
      }
      save();
      render();
      if (forecast.zoneThreat && !result.defeated) { world?.pulseZone(forecast.zoneThreat.zone,"corrupt"); sound.effect("corrupt"); }
      if (result.defeated) {
        sound.effect("reward");
        return;
      }
      if (result.integrityDamage) {
        world?.pulseThreat();
        sound.effect(result.lost ? "defeat" : "hurt");
        floatText(`−${result.integrityDamage}`, false);
        root.classList.remove("shake");
        void root.offsetWidth;
        if (sound.settings.motion) root.classList.add("shake");
      } else if (result.enemyAction) {
        if (!result.interrupted && forecast.intent?.kind !== "charge") world?.pulseThreat();
        if (forecast.shield && forecast.incomingRaw) {
          floatText(`${Math.min(forecast.shield, forecast.incomingRaw)} blocked`, false, "shield");
          sound.effect("block");
        }
        toast(result.enemyAction);
      }
      if (forecast.enemyHealing) floatText(`+${forecast.enemyHealing} siphoned`, true, "enemy-heal");
      if (result.interrupted) toast("Ultimate interrupted. The guardian is exposed for one transmission.");
      else if (becomesEnraged) toast(`${run.enemy!.name} awakens. Its attacks grow stronger.`, "error");
      if (!result.lost) sound.effect("draw");
      const flash = $("#battle-flash");
      flash.classList.remove("active");
      void flash.offsetWidth;
      flash.classList.add("active");
    };
    const afterEnemy = () => {
      if (generation !== battleGeneration) return;
      if (becomesEnraged && !result.lost) {
        sound.effect("enrage");
        if (world) world.playEnemyTransition("enrage", resolve, preferences.fast);
        else resolve();
      } else resolve();
    };
    window.setTimeout(() => {
      if (generation !== battleGeneration) return;
      if (result.interrupted) {
        root.dataset.enemyAction = "break";
        sound.effect("cleanse");
        floatText("INTERRUPTED", true, "burst");
        if (world) world.playEnemyTransition("break", afterEnemy, preferences.fast);
        else afterEnemy();
      } else if (!result.defeated && forecast.intent) {
        const kind = forecast.intent.kind;
        root.dataset.enemyAction = kind;
        if (kind === "breach" || kind === "charge") sound.effect("charge");
        const impact = () => { if (kind !== "charge") sound.effect(kind, { pan: kind === "breach" ? .35 : kind === "strike" ? -.35 : 0, power: forecast.intent?.ultimate ? 1.2 : 1 }); };
        if (world) world.playEnemyAction(kind, forecast.faultTarget, forecast.hazardZone, afterEnemy, preferences.fast, impact);
        else { impact(); window.setTimeout(afterEnemy, 160); }
      } else {
        sound.effect("death");
        if (world) world.playEnemyTransition("death", resolve, preferences.fast);
        else resolve();
      }
    }, preferences.fast || !sound.settings.motion ? 80 : 350);
  };
  if (result.signalPath.length && world && !preferences.fast && sound.settings.motion) {
    world.playPacket(result.signalPath, finish);
    if (result.alternatePath.length)
      world.playPacket(result.alternatePath, undefined, 0xb3d8e3);
  } else window.setTimeout(finish, preferences.fast || !sound.settings.motion ? 80 : 550);
}
function exportNetwork() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob(
      [topologyYaml(run.topology, `faultline-${run.seed.toString(16)}`)],
      { type: "application/yaml" },
    ),
  );
  link.download = "faultline.clab.yml";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
  toast("Containerlab topology exported.");
}
async function action(name: string) {
  if (name === "hand-left" || name === "hand-right") {
    document.querySelector(".card-fan")?.scrollBy({left:(name === "hand-left" ? -1 : 1) * 340,behavior:sound.settings.motion ? "smooth" : "instant"});
    sound.effect("hover");
    return;
  }
  if (name === "close") {
    closeModal();
    return;
  }
  if (name === "sound") {
    await sound.unlock();
    sound.update({ muted: !sound.settings.muted });
    render(false);
    return;
  }
  if (name === "fullscreen") {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
    return;
  }
  if (busy) return;
  if (name === "prepare" && (run.phase !== "battle" || practice)) return;
  if (name === "release-prepared" && modal === "prepare" && !practice) {
    closeModal();
    playAction(() => releasePreparedCard(run));
    return;
  }
  if (name === "inspect-back" && inspectReturn) {
    modal = inspectReturn;
    $("#dialog-content").innerHTML = alpha.libraryMarkup(libraryRun ?? run, inspectReturn, libraryRarity, libraryQuery);
    dialog.className = "wide";
    return;
  }
  if (name === "tutorial") { startPractice(); return; }
  if (name === "tutorial-exit" || name === "tutorial-finish") { finishPractice(); return; }
  if (
    name === "devices" ||
    name === "loadout" ||
    name === "prepare" ||
    name === "enemy-dossier" ||
    name === "combat-details" ||
    name === "combat-log" ||
    name === "relic-journal" ||
    name === "refine" ||
    name === "exhaust-pile" ||
    name === "settings" ||
    name === "help" ||
    name === "credits" ||
    name === "collection" ||
    name === "deck" ||
    name === "draw-pile" ||
    name === "discard-pile"
  ) {
    openModal(name);
    return;
  }
  if (name === "confirm-replace") {
    discardArmed = true;
    closeModal();
    begin();
    return;
  }
  if (dialog.open && name !== "save-exit" && name !== "export") return;
  if (name === "new" || name === "daily") {
    clearSelection();
    daily = name === "daily";
    archetype = "architect";
    view = "select";
    render();
    return;
  }
  if (name === "title" || name === "save-exit") {
    if (practice) { finishPractice(); return; }
    if (dialog.open) dialog.close();
    modal = "";
    save();
    view = "title";
    clearSelection();
    render();
    return;
  }
  if (name === "embark") {
    begin();
    return;
  }
  if (name === "continue" && expedition) {
    run = expedition.run;
    view = "run";
    render();
    return;
  }
  if (name === "cancel") {
    clearSelection();
    render(false);
    return;
  }
  if (name === "auto-place") {
    autoPlace();
    return;
  }
  if (name === "transmit") {
    transmit();
    return;
  }
  if (name === "undo") {
    undo();
    return;
  }
  if (name === "export") {
    exportNetwork();
    return;
  }
  if (name === "skip-reward") {
    chooseCardReward(run, null);
    save();
    render();
    return;
  }
  if (name === "dismiss-tutorial") {
    tutorial = preferences.tips = false;
    storePreferences(preferences);
    render(false);
  }
}
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  void sound.unlock();
  const button = target.closest<HTMLButtonElement>("button");
  if (button?.disabled) return;
  const name = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (name) {
    void action(name);
    return;
  }
  const managedNode = target.closest<HTMLElement>("[data-manage-node]")?.dataset.manageNode;
  if (managedNode && modal === "devices") { closeModal(); onNode(managedNode); return; }
  const preparedIndex = target.closest<HTMLElement>("[data-prepare-card]")?.dataset.prepareCard;
  if (preparedIndex !== undefined && modal === "prepare" && !practice) {
    closeModal();
    playAction(() => prepareCard(run, Number(preparedIndex)));
    return;
  }
  const fieldZone = target.closest<HTMLElement>("[data-field-zone]")?.dataset.fieldZone as Zone | undefined;
  if (fieldZone && !dialog.open && !busy) { castZone(fieldZone); return; }
  const deployZone = target.closest<HTMLElement>("[data-deploy-zone]")?.dataset.deployZone as "north" | "center" | "south" | undefined;
  if (deployZone) { autoPlace(deployZone); return; }
  const relocateZone = target.closest<HTMLElement>("[data-relocate-zone]")?.dataset.relocateZone as "north" | "center" | "south" | undefined;
  if (relocateZone) { relocateToZone(relocateZone); return; }
  const collection = target.closest<HTMLElement>("[data-collection]")?.dataset.collection as CardId | undefined;
  if (collection && modal !== "inspect") { inspectCard(collection); return; }
  const rarity = target.closest<HTMLElement>("[data-rarity]")?.dataset.rarity;
  if (rarity) {
    libraryRarity = rarity;
    $("#dialog-content").innerHTML = alpha.libraryMarkup(libraryRun ?? run, libraryMode, libraryRarity, libraryQuery);
    return;
  }
  const removal = target.closest<HTMLElement>("[data-remove-card]")?.dataset.removeCard;
  if (removal !== undefined && modal === "refine") {
    const result = removeDeckCard(run, Number(removal));
    if (result.ok) { closeModal(); save(); render(); sound.effect("reward"); }
    toast(result.message, result.ok ? "normal" : "error");
    return;
  }
  if (dialog.open || busy) return;
  const character = target.closest<HTMLElement>("[data-archetype]")?.dataset
    .archetype as Archetype | undefined;
  if (character) {
    archetype = character;
    render(false);
    sound.effect("card");
    return;
  }
  const room = target.closest<HTMLElement>("[data-room]")?.dataset.room;
  if (room) {
    const result = chooseRoom(run, room);
    if (result.ok) {
      clearSelection();
      undoStack.length = 0;
      handKey = "";
      world?.resetCamera();
      save();
      render();
      sound.effect("turn");
    }
    return;
  }
  const reward = target.closest<HTMLElement>("[data-reward]")?.dataset
    .reward as CardId | undefined;
  if (reward) {
    const result = chooseCardReward(run, reward);
    if (result.ok) {
      save();
      render();
      sound.effect("reward");
    }
    return;
  }
  const relic = target.closest<HTMLElement>("[data-relic]")?.dataset.relic as
    | RelicId
    | undefined;
  if (relic) {
    const result = chooseRelic(run, relic);
    if (result.ok) {
      save();
      render();
      sound.effect("reward");
    }
    return;
  }
  const forge = target.closest<HTMLElement>("[data-forge]")?.dataset.forge as
    | "repair"
    | "relic"
    | undefined;
  if (forge) {
    chooseForge(run, forge);
    save();
    render();
    sound.effect("reward");
    return;
  }
  const hand = target.closest<HTMLElement>("[data-hand]")?.dataset.hand;
  if (hand !== undefined) {
    if (ignoreClick) {
      ignoreClick = false;
      return;
    }
    chooseCard(Number(hand));
    return;
  }
  const node = target.closest<HTMLElement>("[data-node]")?.dataset.node;
  if (node) onNode(node);
});
document.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.matches(".archive-search")) {
    libraryQuery = input.value;
    const holder = document.createElement("div");
    holder.innerHTML = alpha.libraryMarkup(libraryRun ?? run, libraryMode, libraryRarity, libraryQuery);
    $("#dialog-content .collection-grid").replaceWith(holder.querySelector(".collection-grid")!);
    return;
  }
  if (input.dataset.preference) {
    if (input.dataset.preference === "tips") tutorial = preferences.tips = input.checked;
    if (input.dataset.preference === "fast") preferences.fast = input.checked;
    storePreferences(preferences);
    return;
  }
  if (
    input.dataset.setting === "music" ||
    input.dataset.setting === "effects"
  ) {
    sound.update({ [input.dataset.setting]: Number(input.value) / 100 });
    input.closest("label")!.querySelector("output")!.textContent =
      `${input.value}%`;
  }
  if (input.dataset.setting === "motion")
    sound.update({ motion: input.checked });
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeModal();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeModal();
});
// Drag hardware cards directly onto the table; cables and upgrades use explicit targeting.
document.addEventListener("pointerdown", (event) => {
  if (!playable() || event.button !== 0) return;
  const el = (event.target as HTMLElement).closest<HTMLElement>("[data-hand]");
  if (!el) return;
  const index = Number(el.dataset.hand);
  if (
    CARDS[run.hand[index]]?.target !== "ground" ||
    costFor(run, index) > run.energy
  )
    return;
  cardDrag = {
    index,
    x: event.clientX,
    y: event.clientY,
    ghost: null,
    moved: false,
  };
});
window.addEventListener("pointermove", (event) => {
  if (!cardDrag) return;
  if (
    !cardDrag.moved &&
    Math.hypot(event.clientX - cardDrag.x, event.clientY - cardDrag.y) > 9
  ) {
    cardDrag.moved = true;
    const original = $<HTMLElement>(`[data-hand="${cardDrag.index}"]`);
    cardDrag.ghost = original.cloneNode(true) as HTMLElement;
    cardDrag.ghost.className += " drag-ghost";
    cardDrag.ghost.removeAttribute("data-hand");
    const style = getComputedStyle(original);
    cardDrag.ghost.style.width = style.width;
    cardDrag.ghost.style.height = style.height;
    cardDrag.ghost.style.setProperty("--picture-height", style.getPropertyValue("--picture-height"));
    root.append(cardDrag.ghost);
    world?.setPlacement(CARDS[run.hand[cardDrag.index]].role ?? null);
  }
  if (cardDrag.ghost) {
    const origin = root.getBoundingClientRect(), scale = interfaceScale();
    cardDrag.ghost.style.left = `${(event.clientX - origin.left) / scale}px`;
    cardDrag.ghost.style.top = `${(event.clientY - origin.top) / scale}px`;
    world?.previewAt(event.clientX, event.clientY);
  }
});
function cancelDrag() {
  document.getElementById("movement-preview")?.remove();
  world?.setZonePreview(null);
  const restorePreview = deviceDragging;
  deviceDragging = false;
  cardDrag?.ghost?.remove();
  cardDrag = null;
  world?.cancelInteraction?.();
  world?.setPlacement(null);
  if (restorePreview) world?.setBattle(run.topology, run.enemy, run.faultNode, run.faultLink);
}
window.addEventListener("pointercancel", cancelDrag);
window.addEventListener("blur", cancelDrag);
window.addEventListener("pointerup", (event) => {
  if (deviceDragging) { deviceDragging = false; document.getElementById("movement-preview")?.remove(); world?.setZonePreview(null); render(); }
  if (!cardDrag) return;
  const d = cardDrag;
  cardDrag = null;
  if (!d.moved) return;
  d.ghost?.remove();
  ignoreClick = true;
  world?.setPlacement(null);
  const point = world?.pointFromScreen(event.clientX, event.clientY);
  if (point) playAction(() => playGround(run, d.index, point.x, point.z));
  else render(false);
  setTimeout(() => (ignoreClick = false), 0);
});
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.target instanceof HTMLInputElement || dialog.open) return;
  if (event.key.toLowerCase() === "i") {
    const card = ((event.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId ?? (selected !== null ? run.hand[selected] : undefined)) as CardId | undefined;
    if (card) { event.preventDefault(); inspectCard(card); return; }
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (selected !== null || selectedNode || deviceDragging || cardDrag) {
      clearSelection();
      render(false);
    } else if (view === "run") openModal("settings");
    else if (view === "select") {
      view = "title";
      render();
    }
    return;
  }
  if (!playable()) return;
  if (event.key.toLowerCase() === "p" && !practice) {
    event.preventDefault();
    openModal("prepare");
    return;
  }
  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }
  if (
    (event.key === "Enter" || event.code === "Space") &&
    !(event.target instanceof HTMLButtonElement)
  ) {
    event.preventDefault();
    transmit();
  }
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    chooseCard(event.key === "0" ? 9 : Number(event.key) - 1);
  }
});
document.addEventListener("pointerover", (event) => {
  const el = (event.target as HTMLElement).closest("button");
  if (el && !el.contains((event as PointerEvent).relatedTarget as Node | null))
    sound.effect("hover");
});
window.addEventListener("pagehide", (event) => {
  save();
  if (!event.persisted) world?.dispose();
});
function inspectCard(id: CardId) {
  if (busy || !CARDS[id]) return;
  clearSelection();
  render(false);
  if (modal !== "inspect") inspectReturn = modal === "loadout" ? "deck" : ["collection", "deck", "draw-pile", "discard-pile", "exhaust-pile"].includes(modal) ? modal as alpha.LibraryMode : null;
  modal = "inspect";
  $("#dialog-content").innerHTML = alpha.inspectMarkup(id, inspectReturn ? libraryRun ?? run : run, !!inspectReturn);
  dialog.className = "wide inspect-dialog";
  hideTooltip();
  if (!dialog.open) dialog.showModal();
}
function startPractice() {
  if (practice) { closeModal(); return; }
  if (dialog.open) dialog.close();
  modal = "";
  practice = { step: 0, expedition, run, view, undo: undoStack.map(state => structuredClone(state)) };
  expedition = newExpedition("architect", 8841);
  run = expedition.run;
  chooseRoom(run, "0-1");
  run.enemy = { id: "leech", name: "TRAINING ECHO", title: "A harmless memory of the first signal", hp: 50, maxHp: 50, turn: 0, color: 0x79ceb9 };
  run.hand = ["router", "fiber", "fiber"];
  run.energy = 5;
  run.integrity = run.maxIntegrity = 20;
  view = "run";
  undoStack.length = 0;
  clearSelection();
  handKey = "";
  render();
}
function finishPractice() {
  if (!practice) return;
  cancelDrag();
  const previous = practice;
  practice = null;
  expedition = previous.expedition;
  run = previous.run;
  view = previous.view;
  if (dialog.open) dialog.close();
  modal = "";
  busy = false;
  battleGeneration++;
  undoStack.splice(0, undoStack.length, ...previous.undo);
  clearSelection();
  handKey = "";
  render();
}
function updateLesson() {
  if (!practice) return;
  if (practice.step === 0 && run.topology.nodes.some(n => n.role === "router")) practice.step = 1;
  else if (practice.step === 1 && run.topology.links.some(l => l.a === "alpha" || l.b === "alpha")) practice.step = 2;
  else if (practice.step === 2 && signalPaths(run).length) practice.step = 3;
  else if (practice.step === 4 && run.block >= 4) practice.step = 5;
}
document.addEventListener("contextmenu", event => {
  const id = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId as CardId | undefined;
  if (id) { event.preventDefault(); inspectCard(id); }
});
function hideTooltip() { $("#game-tooltip").className = ""; }
function showTooltip(target: HTMLElement) {
  const tip = target.closest<HTMLElement>("[data-tooltip]");
  if (!tip || dialog.open) { hideTooltip(); return; }
  const el = $("#game-tooltip");
  el.textContent = tip.dataset.tooltip || "";
  el.className = "visible";
  const box = tip.getBoundingClientRect();
  const scale = interfaceScale(), width = window.innerWidth / scale, height = window.innerHeight / scale;
  const origin = root.getBoundingClientRect();
  el.style.left = `${Math.max(10, Math.min(width - el.offsetWidth - 10, (box.x + box.width / 2) / scale - el.offsetWidth / 2)) - origin.left / scale}px`;
  el.style.top = `${Math.max(10, Math.min(height - el.offsetHeight - 10, box.bottom / scale + 12)) - origin.top / scale}px`;
}
$("#app").addEventListener("scroll", hideTooltip);
document.addEventListener("pointerover", e => showTooltip(e.target as HTMLElement));
document.addEventListener("focusin", e => showTooltip(e.target as HTMLElement));
document.addEventListener("pointerdown", hideTooltip);
document.addEventListener("focusout", hideTooltip);

render();
