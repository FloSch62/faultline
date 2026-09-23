import "./style.css";
import "./alpha.css";
import "./polish.css";
import "./battle.css";
import { Soundscape, type ScoreScene } from "./audio.ts";
import type { EffectKind } from "./audio-effects.ts";
import { ENEMIES } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { TRACK_TITLES } from "./core/music.ts";
import { CARDS, RULES } from "./core/cards.ts";
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
  playProtocol,
  playJunk,
  scrubMalware,
  useConsole,
  consoleState,
  isBlocked,
  cableFrays,
  laysArmoredCable,
  type ActionResult,
  type TurnResult,
} from "./core/run.ts";
import type { CardId, RelicId, RunState, Zone } from "./core/types.ts";
import { World, type WorldPoint } from "./three/World.ts";
import { loadDeviceModels } from "./three/models.ts";
import * as ui from "./ui.ts";
import * as battleUi from "./battle-ui.ts";
import * as screens from "./screens.ts";
import * as alpha from "./alpha-ui.ts";
import * as training from "./tutorial.ts";
import { loadPreferences, storePreferences } from "./preferences.ts";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const STORAGE = "faultline-expedition-v2";
const sound = new Soundscape();
// Fetch the device models behind the title screen so the first table is built with them.
void loadDeviceModels();
/** Enemy intent → the cue heard on its contact frame. */
const INTENT_CUES: Record<string, EffectKind> = {
  strike: "strike", breach: "breach", sever: "sever", jam: "jam", corrupt: "corrupt", charge: "charge", infect: "malware",
};
/** Controls whose hover deserves a whisper; icon buttons and toolbars stay silent. */
const HOVER_CUES = ".game-card:not(.drag-ghost), .route-room:not([disabled]), .archetype, .relic-option, [data-forge], .transmit-button, .console-button, .title-menu button, .gold-button, .field-seal.targetable, .lesson-card";
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
/** A running Field Training lesson. The real expedition is parked and restored on exit. */
let practice: {
  id: training.LessonId;
  expedition: Expedition | null;
  run: RunState;
  view: "title" | "select" | "run";
  undo: RunState[];
  progress: training.LessonProgress | null;
  last?: TurnResult;
  showHint: boolean;
  collapsed: boolean;
} | null = null;
let hintTimer = 0;
/** Patch Cable (Architect console) is choosing its two devices. */
let consoleTargeting = false;
/** The encounter whose terrain title card has already been shown. */
let terrainShown = "";
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
  `<main class="game-root"><div class="scene-backdrop"></div><div class="scene-shade"></div><div class="motes" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 47) % 100}%;--duration:${14 + (i % 8) * 3}s;--delay:-${i * 2.7}s;--size:${(i % 3) + 1}px"></i>`).join("")}</div><div class="world-stage"><canvas id="world" aria-label="Network battlefield. Use cards and the device targeting controls to build your route."></canvas></div><div class="texture"></div><header id="header" class="game-header"></header><div id="screen"></div><div id="battle-hud"></div><div id="hand-zone"></div><div id="target-dock"></div><div id="lesson-spotlight" aria-hidden="true"><i></i></div><div id="lesson-layer"></div><div id="game-tooltip" role="tooltip"></div><div id="impact-layer" aria-hidden="true"></div><div id="battle-flash"></div><div id="toast" role="status" aria-live="polite"></div><div class="now-playing" id="now-playing"></div></main><dialog id="dialog" aria-label="Field journal"><div class="dialog-surface"><button class="dialog-close" data-action="close" aria-label="Close dialog">${ui.icon("close", 22)}</button><div id="dialog-content"></div></div></dialog>`;
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
  if (view === "run" && run.phase === "shop") return "shop";
  if (view === "run" && run.phase === "event") return "sanctuary";
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
      onMalware: scrub,
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
  consoleTargeting = false;
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
  // A finished training battle stays on its board: the coach panel carries the debrief.
  const debrief = !!practice && view === "run" && run.phase !== "battle" && !!run.enemy;
  const battle = view === "run" && (run.phase === "battle" || debrief);
  root.dataset.view = view === "run" ? (debrief ? "battle" : run.phase) : view;
  const stage = STAGES[view === "run" ? run.stage : 0];
  root.dataset.stage = view === "run" ? String(run.stage + 1) : "";
  root.style.setProperty("--stage-panorama", `url("${import.meta.env.BASE_URL}art/${stage.art.panorama}")`);
  root.style.setProperty("--stage-interior", `url("${import.meta.env.BASE_URL}art/${stage.art.battle}")`);
  root.classList.toggle("lesson-debrief", debrief);
  root.classList.toggle("is-battle", battle);
  root.classList.toggle("in-market", view === "run" && run.phase === "reward" && run.map.find(room=>room.id===run.currentRoom)?.type === "cache");
  root.classList.toggle("busy", busy);
  root.classList.toggle("is-practice", !!practice);
  root.dataset.training = practice ? practice.id : "";
  patchLessonLayer(practice && battle && practice.progress
    ? training.lessonPanelMarkup(practice.progress, { showHint: practice.showHint, collapsed: practice.collapsed })
    : "");
  $("#header").innerHTML = screens.headerMarkup(
    expedition,
    view === "title" || view === "select",
    sound.settings,
  );
  if (battle) {
    ensureWorld();
    world?.setStage(run.stage);
    // Terrain first: cables read the wreckage to know whether they fray.
    world?.setTerrain?.(run.terrain);
    if (rebuild)
      world?.setBattle(run.topology, debrief ? null : run.enemy, run.faultNode, run.faultLink);
    const forecast = combatPreview(run);
    root.dataset.guardianWindow = forecast.lethal ? "" : forecast.interrupted ? "break" : forecast.intent?.ultimate ? "ultimate" : forecast.intent?.kind === "charge" ? "charge" : run.enemy?.exposed ? "exposed" : "";
    root.classList.toggle("is-buffering", run.buffering);
    world?.setMalware?.(run.malware, forecast.malwareTarget);
    world?.setOnline?.(forecast.online);
    if (world?.setChannels) world.setChannels(forecast.channelPaths);
    else world?.setSignalRoute(forecast.signalPath, forecast.alternatePath);
    world?.setForecastTarget(forecast.faultTarget);
    world?.setForecastZone(forecast.hazardZone);
    world?.setZoneEffects(run.zoneEffects);
    showTerrainTitle();
  }
  if (!battle) delete root.dataset.guardianWindow;
  world?.setVisible(battle);
  let screen = "";
  if (debrief) screen = "";
  else if (view === "title") screen = screens.titleMarkup(expedition, records);
  else if (view === "select")
    screen = screens.selectMarkup(
      archetype,
      daily,
      Boolean(expedition && !["won", "lost"].includes(run.phase)),
    );
  else if (run.phase === "map") screen = screens.mapMarkup(expedition!);
  else if (run.phase === "reward") screen = screens.rewardMarkup(run);
  else if (run.phase === "relic") screen = screens.relicMarkup(run);
  else if (run.phase === "forge") screen = screens.forgeMarkup(run);
  else if (run.phase === "shop") screen = screens.shopMarkup(run);
  else if (run.phase === "event") screen = screens.eventMarkup(run);
  else if (run.phase === "won" || run.phase === "lost")
    screen = screens.outcomeMarkup(expedition!);
  $("#screen").innerHTML = screen;
  if (view === "run" && run.phase === "map") {
    const chart = $<HTMLElement>(".route-scroll"), nextRoom = chart.querySelector<HTMLElement>(".route-room.available");
    if (nextRoom) {
      chart.scrollTop = Math.max(0, nextRoom.offsetTop - chart.clientHeight * .68);
      chart.scrollLeft = Math.max(0, nextRoom.offsetLeft - chart.clientWidth / 2);
    }
  }
  $("#battle-hud").innerHTML = battle
    ? battleUi.battleMarkup(run, {
        selected,
        source,
        busy,
        tips: tutorial && !practice,
        undo: undoStack.length > 0,
        consoleTargeting,
        training: !!practice,
      })
    : "";
  const signature = battle
    ? `${run.currentRoom}|${run.turn}|${run.energy}|${run.firstFiberPlayed}|${run.hand.join(",")}`
    : "";
  // Leaving a battle must clear the DOM even when practice reset the cache key.
  $("#hand-zone").hidden = !battle;
  if (!battle || signature !== handKey) {
    const scroll = document.querySelector(".card-fan")?.scrollLeft ?? 0;
    $("#hand-zone").innerHTML = battle ? battleUi.handMarkup(run, selected) : "";
    document.querySelector(".card-fan")?.scrollTo({left:scroll});
    handKey = signature;
  } else if (battle)
    document
      .querySelectorAll<HTMLElement>("[data-hand]")
      .forEach((el) =>
        el.classList.toggle("selected", Number(el.dataset.hand) === selected),
      );
  if (selected !== null) document.querySelector(`[data-hand="${selected}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});
  if (practice && battle) fitLesson();
  spotlightLesson();
  if (practice && battle) railHand();
  renderTargetDock();
  if (selected !== null && run.hand[selected])
    world?.setPlacement(CARDS[run.hand[selected]].role ?? null, source, laysArmoredCable(run.hand[selected]));
  else if (consoleTargeting) world?.setPlacement(null, source);
  else world?.setPlacement(null);
  world?.setSelected(source ?? selectedNode);
  world?.setZoneTargeting(selected !== null && CARDS[run.hand[selected]]?.target === "zone");
  const scene = audioScene();
  sound.setScene(scene, `${run.seed}:${run.stage}:${run.currentRoom}:${practice ? "practice" : "expedition"}`, view === "run" ? run.stage : null);
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
      ascension: run.ascension,
    });
    // A win unlocks the next ascension for this archetype; show it at once.
    if (screens.recordOutcome(expedition) !== null) $("#screen").innerHTML = screens.outcomeMarkup(expedition);
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
    $("#dialog-content").innerHTML = screens.bossIntroMarkup(run);
    hideTooltip();
    dialog.showModal();
    sound.effect("boss");
  }
}
/** Cable target button: warns before a new cable would fray over wreckage. */
function cableTarget(id: string, cardId: CardId | null) {
  const frayed = !!source && source !== id && cableFrays(run, source, id, cardId);
  return `<button data-node="${id}" class="${source === id ? "active" : ""}${frayed ? " frays" : ""}"${frayed ? ` data-tooltip="Crosses wreckage: frayed, −${RULES.frayedCableDamage} damage on your primary route. Armored cables don't fray."` : ""}>${id.toUpperCase()}${frayed ? " · FRAYS" : ""}</button>`;
}
function renderTargetDock() {
  let markup = "";
  if (view === "run" && run.phase === "battle") {
    if (consoleTargeting) {
      markup = `<div class="target-options console-targets"><span>PATCH CABLE · ${source ? "CONNECT TO" : "CHOOSE DEVICE"}</span>${run.topology.nodes
        .map(n => cableTarget(n.id, null))
        .join("")}<button data-action="cancel">CANCEL ×</button></div>`;
    } else if (selected !== null) {
      const c = CARDS[run.hand[selected]];
      if (c?.target === "ground")
        markup = `<div class="target-options"><span>PLACE ON THE TABLE OR</span><button data-action="auto-place">${ui.icon("cache", 14)} Deploy in a free socket</button>${(["north", "center", "south"] as const).map(zone => `<button data-deploy-zone="${zone}">${zone.toUpperCase()} BAND</button>`).join("")}</div>`;
      else if (c?.target === "zone")
        markup = `<div class="target-options"><span>${ui.esc(c.name.toUpperCase())} · SELECT A FIELD SEAL</span></div>`;
      else if (c?.target === "link" || c?.target === "node")
        markup = `<div class="target-options"><span>${source ? "CONNECT TO" : "CHOOSE DEVICE"}</span>${run.topology.nodes
          .filter(
            (n) =>
              c.target === "link" || canTargetNode(run, selected!, n.id),
          )
          .map((n) =>
            c.target === "link"
              ? cableTarget(n.id, run.hand[selected!])
              : `<button data-node="${n.id}" class="${source === n.id ? "active" : ""}">${n.id.toUpperCase()}</button>`,
          )
          .join("")}</div>`;
    }
    if (selected === null && selectedNode) {
      const node = run.topology.nodes.find(n => n.id === selectedNode);
      const online = node && !node.fixed && combatPreview(run).online.includes(node.id);
      if (node) markup = `<div class="target-options device-controls"><span>${ui.esc(node.id.toUpperCase())} · ${zoneForNode(node).toUpperCase()}${node.fixed ? "" : online ? " · ONLINE" : " · OFFLINE"}${node.configured ? " · CONFIGURED" : ""}${node.upgraded ? " · OVERCLOCKED" : ""}${node.shielded ? " · JAM PROTECTED" : ""}${node.salvage ? " · SALVAGED" : ""}</span>${node.fixed ? "" : `<span>RELOCATE · ${RULES.relocateCost} ENERGY</span>${(["north", "center", "south"] as const).map(zone => `<button data-relocate-zone="${zone}" ${run.energy < RULES.relocateCost ? "disabled" : ""}>${zone.toUpperCase()}</button>`).join("")}`}<button data-action="cancel">CLOSE ×</button></div>`;
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
    content.innerHTML = screens.settingsMarkup(sound.settings, view === "run", preferences);
  else if (type === "help") content.innerHTML = training.handbookMarkup();
  else if (type === "training") content.innerHTML = training.lessonMenuMarkup(training.loadCompletedLessons());
  else if (type === "combat-details") content.innerHTML = alpha.combatDetailsMarkup(run);
  else if (type === "enemy-dossier") content.innerHTML = alpha.enemyDossierMarkup(run);
  else if (type === "combat-log") content.innerHTML = alpha.historyMarkup(run);
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
    content.innerHTML = `<span class="eyebrow">THE PEOPLE & TOOLS BEHIND THE SIGNAL</span><h2>From an idea to an odyssey.</h2><div class="credits-copy"><h3>The Containerlab universe</h3><p>Inspired by Containerlab and the networks we build together. FAULTLINE is an independent fan project. The Containerlab mark is used under its original license.</p><h3>Original art</h3><p>Relay cathedral, the Glass Cathedral and Blackout Heart environments, sanctuary, an expanded illustrated card collection, hostile creatures and painted interface pieces created for this game using OpenAI image generation and local Krea 2 Turbo. Artwork prompts and production details are included in the project. Typography: Cinzel and Barlow, under the SIL Open Font License.</p><h3>Original score · YuE2</h3><p>${Object.values(TRACK_TITLES).join(" · ")}. Generated locally with the official YuE2 model and listening decoder. Original instrumental arrangements retain their complete generated mix. Generation prompts and provenance are included in the project.</p><h3>Sound effects · Kenney</h3><p>Recorded card Foley, metal, glass and impact materials from Kenney’s CC0 Casino Audio, Impact Sounds and Sci-fi Sounds packs. Layered and mastered for FAULTLINE; source recordings, licenses and recipes are included.</p><h3>A real network, in miniature</h3><p>Packets and faults are simulated in your browser. You can export the topology to Containerlab; real routing requires device configuration and container images.</p></div>`;
  else if (type === "replace")
    content.innerHTML = `<span class="eyebrow">AN EXPEDITION IS ALREADY IN PROGRESS</span><h2>Leave this route behind?</h2><p class="modal-intro">Beginning a new expedition replaces your current saved run in stage ${run.stage + 1}, sector ${run.floor + 1}.</p><div class="confirm-actions"><button class="gold-button" data-action="confirm-replace">Begin a new expedition ${ui.icon("arrow")}</button><button class="text-button" data-action="close">Keep my current expedition</button></div>`;
  dialog.className = [
    "deck",
    "collection",
    "draw-pile",
    "discard-pile",
    "exhaust-pile",
    "combat-details",
    "loadout",
    "help",
    "training",
  ].includes(type)
    ? `wide${type === "help" ? " handbook-dialog" : type === "training" ? " training-dialog" : ""}`
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
    screens.chosenAscension(archetype),
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
  sound.effect("navigate");
}
/** Log lines added between two states; the log is newest-first and capped. */
function newLogLines(before: RunState, after: RunState): string[] {
  if (!before.log.length) return after.log;
  for (let n = 0; n <= after.log.length; n++)
    if (before.log.slice(0, 3).every((line, i) => after.log[n + i] === line)) return after.log.slice(0, n);
  return after.log;
}
/** True only when the discard pile was actually shuffled back into the draw pile. */
function reshuffled(before: RunState, after: RunState) {
  return newLogLines(before, after).some(line => /reshuffl/i.test(line));
}
function liveChannels(state: RunState) {
  return state.phase === "battle" && state.enemy ? combatPreview(state).channels : 0;
}
/** The primary cue for a successful card or board action, chosen by its real effect. */
function actionCue(before: RunState, after: RunState, card?: CardId): EffectKind {
  if (after.topology.nodes.length > before.topology.nodes.length) return "deploy";
  if (after.topology.links.length > before.topology.links.length) return "connect";
  if (card && CARDS[card]?.target === "protocol") return "protocol";
  if (after.malware.length < before.malware.length) return "scrub";
  if (after.integrity > before.integrity || after.faultNode !== before.faultNode || after.faultLink !== before.faultLink) return "cleanse";
  if (after.block > before.block) return "block";
  if (card && (CARDS[card]?.junk || CARDS[card]?.curse)) return "scrub";
  return card ? "instant" : "card";
}
function playAction(action: () => ActionResult, cue?: EffectKind, card?: CardId) {
  if (!playable()) return false;
  const before = structuredClone(run),
    result = action();
  if (!result.ok) {
    toast(result.message, "error");
    sound.effect("error");
    if (practice) { practice.showHint = true; renderLesson(); }
    return false;
  }
  undoStack.push(before);
  if (undoStack.length > 20) undoStack.shift();
  if (run.block > before.block) world?.pulseNetwork("shield");
  else if (run.faultNode !== before.faultNode || run.faultLink !== before.faultLink || run.integrity > before.integrity) world?.pulseNetwork("repair");
  else if (run.energy > before.energy || run.packetBoost > before.packetBoost || run.buffer > before.buffer) world?.pulseNetwork("surge");
  if (run.block > before.block) floatText(`+${run.block - before.block} shield`, false, "shield");
  if (run.packetBoost > before.packetBoost) floatText(`+${run.packetBoost - before.packetBoost} burst`, true, "burst");
  if (run.buffer > before.buffer) floatText(`+${run.buffer - before.buffer} buffered`, true, "buffer");
  if (run.backpressure > before.backpressure) floatText(`+${run.backpressure - before.backpressure} backpressure`, true, "burst");
  clearSelection();
  updateLesson();
  save();
  render();
  if (cue === "field" || cue === "cleanse") toast(result.message);
  sound.effect(cue ?? actionCue(before, run, card));
  // Follow-ups land just after the action itself: cards arriving, then the signal locking.
  // A played card leaves the hand; anything beyond that arrived from the piles.
  const arrived = card ? run.hand.length - (before.hand.length - 1) : 0;
  if (reshuffled(before, run)) sound.effect("shuffle", { delay: .08 });
  else if (arrived > 0) sound.effect("draw", { delay: .1 });
  if (liveChannels(run) > liveChannels(before)) sound.effect("route", { delay: .18 });
  return true;
}
/** Field Training rails: the coach stops a wrong move and points at the right one. */
function lessonBlocks(action: training.LessonAction): boolean {
  if (!practice?.progress) return false;
  const objection = training.lessonGuard(practice.id, run, practice.progress, action);
  if (!objection) return false;
  toast(objection, "coach");
  practice.showHint = true;
  renderLesson();
  sound.effect("error");
  return true;
}
function chooseCard(index: number) {
  if (!playable() || !run.hand[index]) return;
  const id = run.hand[index], c = CARDS[id];
  if (lessonBlocks({ kind: "card", card: id })) return;
  if (c.unplayable) {
    toast(c.curse ? `${c.name} is a curse: unplayable. Remove it at a Sanctuary or Market.` : `${c.name} is junk: unplayable. It vanishes at the end of your turn.`, "error");
    sound.effect("error");
    return;
  }
  if (costFor(run, index) > run.energy) {
    toast("Not enough energy. Transmit to recharge.", "error");
    sound.effect("error");
    return;
  }
  consoleTargeting = false;
  if (c.target === "instant") {
    playAction(() => playInstant(run, index), undefined, id);
    return;
  }
  if (c.target === "protocol") {
    if (playAction(() => playProtocol(run, index), "protocol", id)) toast(`${c.name} armed. It fires on ${c.protocol === "ultimate" ? "a charge or ultimate" : `the next matching ${c.protocol === "field" ? "hostile field" : c.protocol}`}.`);
    return;
  }
  if (c.target === "junk") {
    playAction(() => playJunk(run, index), "scrub", id);
    return;
  }
  selected = selected === index ? null : index;
  source = null;
  selectedNode = null;
  render(false);
  // Lifting a card is a single quiet paper gesture; putting it back is the reverse.
  sound.effect(selected === null ? "undo" : "pickup");
}
/** Console command: Patch Cable enters link targeting; Harden and Buffer resolve at once. */
function activateConsole() {
  if (!playable()) return;
  const state = consoleState(run);
  if (consoleTargeting) { clearSelection(); render(false); sound.effect("undo"); return; }
  if (!state.usable) { toast(state.reason || "Console unavailable.", "error"); sound.effect("error"); return; }
  if (state.target === "link") {
    selected = null;
    source = null;
    selectedNode = null;
    consoleTargeting = true;
    render(false);
    sound.effect("console");
    return;
  }
  const wasBuffering = run.buffering;
  if (playAction(() => useConsole(run), "console")) {
    if (state.id === "harden") sound.effect("block", { delay: .12 });
    if (state.id === "buffer") toast(wasBuffering ? "Buffer cancelled. This turn transmits normally." : `Buffering: this transmission is stored ×${RULES.bufferMultiplier}. Transmit to store it.`);
  }
}
function scrub(id: string) {
  if (!playable()) return;
  const target = run.malware.find(m => m.id === id);
  if (playAction(() => scrubMalware(run, id), "scrub") && target) {
    world?.pulseNode?.(id, "scrub");
    floatText(`malware scrubbed`, true, "scrub");
  }
}
function onGround(point: WorldPoint) {
  if (!playable() || selected === null) return;
  const index = selected;
  if (CARDS[run.hand[index]]?.target === "ground") {
    if (lessonBlocks({ kind: "ground", card: run.hand[index], zone: zoneForNode(point) })) return;
    playAction(() => playGround(run, index, point.x, point.z), undefined, run.hand[index]);
  } else if (CARDS[run.hand[index]]?.target === "zone") castZone(zoneForNode(point));
}
function castZone(zone: Zone) {
  if (!playable() || selected === null || CARDS[run.hand[selected]]?.target !== "zone") {
    if (playable()) toast(`${zone.toUpperCase()} · ${zoneDescription(run,zone)}`);
    return;
  }
  const index = selected, cleanse = run.hand[index] === "purge-field";
  if (lessonBlocks({ kind: "zone", card: run.hand[index], zone })) return;
  if (playAction(() => playZone(run,index,zone),cleanse ? "cleanse" : "field")) world?.pulseZone(zone,cleanse ? "cleanse" : "field");
}
function onNode(id: string) {
  if (!playable()) return;
  if (consoleTargeting) {
    if (source === id) { source = null; render(false); sound.effect("undo"); }
    else if (!source) { source = id; render(false); sound.effect("select"); }
    else {
      const from = source;
      if (lessonBlocks({ kind: "link", a: from, b: id })) return;
      if (playAction(() => useConsole(run, from, id), "connect")) sound.effect("console", { delay: .05 });
    }
    return;
  }
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
        sound.effect("undo");
      } else if (!source) {
        source = id;
        render(false);
        sound.effect("select");
      } else {
        const from = source;
        if (lessonBlocks({ kind: "link", card: run.hand[index], a: from, b: id })) return;
        playAction(() => playLink(run, index, from, id), undefined, run.hand[index]);
      }
      return;
    }
    if (c.target === "node") {
      playAction(() => playNode(run, index, id), undefined, run.hand[index]);
      return;
    }
  }
  if (selectedNode !== id) sound.effect("select");
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
  if (finished) {
    deviceDragging = false;
    const destination = zoneForNode(point), origin = zoneForNode(node);
    if (lessonBlocks({ kind: "move", node: id, zone: destination })) { clearSelection(); render(); return; }
    // One cue per drop: a real relocation slides the device; dropping it back in place is a soft return.
    const moved = Math.hypot(node.x - point.x, node.z - point.z) >= .01;
    if (!playAction(() => relocateNode(run, id, point.x, point.z), moved ? "move" : "undo")) { clearSelection(); render(); }
    else if (origin !== destination) { world?.pulseZone(destination,"move"); toast(`${id.toUpperCase()} · ${origin.toUpperCase()} → ${destination.toUpperCase()} · ${RULES.relocateCost} energy`); }
    return;
  }
  const blocked = run.energy < RULES.relocateCost ? "Not enough energy" : isBlocked(run, point.x, point.z, id) ?? "";
  const origin = zoneForNode(node), destination = zoneForNode(point);
  const next = structuredClone(run);
  const nextNode = next.topology.nodes.find(n=>n.id===id)!;
  nextNode.x=point.x; nextNode.z=point.z;
  const before = combatPreview(run), after = combatPreview(next);
  let preview = document.getElementById("movement-preview");
  if (!preview) { preview = document.createElement("div"); preview.id="movement-preview"; preview.setAttribute("role","status"); root.append(preview); }
  preview.className=blocked ? "blocked" : "";
  preview.innerHTML=`<span class="move-caption">RELOCATE ${ui.esc(id.toUpperCase())}</span><strong>${origin.toUpperCase()} ${ui.icon("arrow",16)} ${destination.toUpperCase()}</strong><span>${ui.esc(blocked || `Release to move · ${RULES.relocateCost} energy`)}</span><div><span>Damage <b>${before.packetDamage} → ${after.packetDamage}</b></span><span>Shield <b>${before.shield} → ${after.shield}</b></span><span>Life lost <b>${before.incoming} → ${after.incoming}</b></span>${after.channels !== before.channels ? `<span>Channels <b>${before.channels} → ${after.channels}</b></span>` : ""}</div><small>${ui.esc(zoneDescription(run,destination))}</small>`;
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
  if (!selectedNode || !playable()) return;
  const id = selectedNode;
  const node = run.topology.nodes.find(n => n.id === id)!;
  if (zoneForNode(node) === zone) { toast(`${id.toUpperCase()} is already in ${zone.toUpperCase()}.`); return; }
  if (lessonBlocks({ kind: "move", node: id, zone })) return;
  let spot: WorldPoint | undefined;
  for (const z of { north: [-2.5, -3.6, -1.8], center: [0, 0.9, -0.9], south: [2.5, 3.6, 1.8] }[zone])
    for (const x of [node.x, 0, -1.25, 1.25, -2.5, 2.5, -3.75, 3.75, -4.5, 4.5])
      if (!spot && !isBlocked(run, x, z, id)) spot = { x, z };
  if (!spot) { toast("No free socket in that band.", "error"); return; }
  const { x, z } = spot;
  if (!playAction(() => relocateNode(run, id, x, z), "move")) return;
  world?.pulseZone(zone,"move");
  toast(`${id.toUpperCase()} → ${zone.toUpperCase()} · ${RULES.relocateCost} energy · ${zoneDescription(run,zone)}`);
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
    { x: -1.25, z: 1.2 },
    { x: 1.25, z: -1.2 },
    { x: -4, z: -3 },
    { x: 4, z: 3 },
    { x: -4, z: 3 },
    { x: 4, z: -3 },
    { x: -2.5, z: 0 },
    { x: 2.5, z: 0 },
  ];
  // Wreckage and malware block sockets too: ask the rules, not a local distance check.
  const point = spaces.find((p) => (!zone || zoneForNode(p) === zone) && !isBlocked(run, p.x, p.z));
  if (point) onGround(point);
  else toast(zone ? `No free socket in ${zone.toUpperCase()}. Choose one on the table.` : "Place this hardware in an empty space on the table.", "error");
}
function undo() {
  if (!playable() || !undoStack.length) return;
  cancelDrag();
  const prev = undoStack.pop()!;
  if (prev.currentRoom !== run.currentRoom || prev.turn !== run.turn) return;
  run = prev;
  expedition!.run = run;
  clearSelection();
  save();
  render();
  sound.effect("undo");
}
function floatText(text: string, good: boolean, kind = "") {
  const el = document.createElement("span");
  el.className = `damage-number ${good ? "outgoing" : "incoming"} ${kind}`;
  el.textContent = text;
  $("#impact-layer").append(el);
  window.setTimeout(() => el.remove(), 1500);
}
/** Where a honeypot or protocol answered the forecast action, for the trap flash. */
function trapFocus(forecast: ReturnType<typeof combatPreview>): { id: string; kind: "trap" | "trigger" } | null {
  const target = forecast.faultTarget;
  const role = (id: string) => run.topology.nodes.find(n => n.id === id)?.role;
  if (target) {
    const ends = target.split("::");
    const decoy = ends.find(id => role(id) === "honeypot");
    if (decoy && forecast.enemyDamage) return { id: decoy, kind: "trap" };
    if (forecast.protocolTriggers.length) return { id: ends.find(id => !["alpha", "omega"].includes(id)) ?? ends[0], kind: "trigger" };
  }
  if (forecast.protocolTriggers.length) {
    const firewall = run.topology.nodes.find(n => n.role === "firewall" && forecast.online.includes(n.id));
    return { id: firewall?.id ?? "omega", kind: "trigger" };
  }
  return null;
}
function transmit() {
  if (!playable()) return;
  if (lessonBlocks({ kind: "transmit" })) return;
  const generation = ++battleGeneration;
  const forecast = combatPreview(run);
  clearSelection();
  busy = true;
  undoStack.length = 0;
  const next = structuredClone(run),
    result = endTurn(next);
  const becomesEnraged = !result.defeated && next.enemy && ENEMIES[next.enemy.id].enrages && run.enemy!.hp > run.enemy!.maxHp / 2 && next.enemy.hp <= next.enemy.maxHp / 2;
  const reshuffle = reshuffled(run, next);
  const trap = trapFocus(forecast);
  if (result.buffered) sound.effect("buffer");
  else {
    sound.effect("transmit");
    if (result.bufferReleased) sound.effect("release", { delay: .12 });
  }
  render(false);
  const finish = () => {
    if (generation !== battleGeneration) return;
    if (result.packetDamage) {
      world?.impact(0xfbd69a, 36);
      sound.effect("hit", { power: Math.min(1.2, .7 + result.packetDamage / 12) });
      floatText(`−${result.packetDamage}`, true);
      // Show contact immediately while the already forecast enemy action remains
      // committed. The rule state advances only when the sequence completes.
      const hp = Math.max(0, run.enemy!.hp - result.packetDamage);
      const health = $(".enemy-health");
      health.setAttribute("aria-valuenow", String(hp));
      health.querySelector<HTMLElement>("span")!.style.width = `${hp / run.enemy!.maxHp * 100}%`;
      health.querySelector(".health-risk")?.remove();
      $(".enemy-health-label strong").innerHTML = `${hp}<small> / ${run.enemy!.maxHp}</small>`;
    } else if (result.buffered) floatText(`+${result.buffered} buffered`, true, "buffer");
    else if (!result.enemyDamage) toast(result.signalPath.length ? "The signal was absorbed. Check armor, malware and hostile fields." : "No live route. The signal could not reach OMEGA.", "error");
    const resolve = () => {
      if (generation !== battleGeneration) return;
      run = next;
      expedition!.run = run;
      busy = false;
      delete root.dataset.enemyAction;
      if (practice) practice.last = result;
      updateLesson();
      save();
      render();
      if (forecast.zoneThreat && !result.defeated) { world?.pulseZone(forecast.zoneThreat.zone,"corrupt"); if (forecast.intent?.kind !== "corrupt") sound.effect("corrupt", { delay: .1 }); }
      if (result.junkAdded.length && !result.defeated) {
        sound.effect("junk", { delay: .25 });
        toast(`${result.junkAdded.length} ${CARDS[result.junkAdded[0]].name} shuffled into your draw pile.`, "error");
      }
      if (result.malwarePlanted && !result.defeated) floatText("malware planted", false, "malware");
      if (result.backpressureStored) floatText(`+${result.backpressureStored} backpressure`, true, "burst");
      if (result.defeated) {
        sound.effect("reward");
        return;
      }
      if (result.bufferLost) toast("Packet loss: no live route at the start of your turn. The buffer was lost.", "error");
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
      // The new hand arrives after the hit has landed; a reshuffle is heard only when it happened.
      if (!result.lost) {
        const delay = result.integrityDamage ? .45 : .15;
        if (reshuffle) sound.effect("shuffle", { delay });
        sound.effect("deal", { delay: reshuffle ? delay + .75 : delay });
      }
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
      // Countermeasures fire on the same contact frame as the attack they answer.
      const springTraps = () => {
        if (!trap && !result.enemyDamage && !result.protocolsTriggered.length) return;
        sound.effect("trigger", { delay: .06 });
        if (trap) world?.pulseNode?.(trap.id, trap.kind);
        if (result.enemyDamage) floatText(`−${result.enemyDamage} trap`, true, "trap");
        if (result.protocolsTriggered.length) floatText(result.protocolsTriggered.map(id => CARDS[id].name).join(" · "), true, "protocol");
      };
      if (result.interrupted) {
        root.dataset.enemyAction = "break";
        sound.effect("trigger");
        floatText("INTERRUPTED", true, "burst");
        if (world) world.playEnemyTransition("break", afterEnemy, preferences.fast);
        else afterEnemy();
      } else if (!result.defeated && forecast.intent) {
        const kind = forecast.intent.kind;
        root.dataset.enemyAction = kind;
        if (kind === "breach" || kind === "charge") sound.effect("charge");
        const impact = () => {
          if (kind !== "charge") sound.effect(INTENT_CUES[kind] ?? "strike", { pan: kind === "breach" ? .35 : kind === "strike" ? -.35 : 0, power: forecast.intent?.ultimate ? 1.2 : 1 });
          if (forecast.intent?.infect && kind !== "infect") sound.effect("malware", { delay: .1 });
          springTraps();
        };
        if (world) world.playEnemyAction(kind, forecast.faultTarget, forecast.hazardZone, afterEnemy, preferences.fast, impact);
        else { impact(); window.setTimeout(afterEnemy, 160); }
      } else {
        // Traps can finish the hostile as it moves: show them before it falls.
        if (!result.packetDamage || result.enemyDamage) springTraps();
        sound.effect("death");
        if (world) world.playEnemyTransition("death", resolve, preferences.fast);
        else resolve();
      }
    }, preferences.fast || !sound.settings.motion ? 80 : 350);
  };
  const channels = result.channelPaths.length ? result.channelPaths : [result.signalPath].filter(path => path.length);
  if (channels.length && world && !preferences.fast && sound.settings.motion) {
    if (world.playChannels) world.playChannels(channels, finish);
    else world.playPacket(channels[0], finish);
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
    sound.effect("select");
    return;
  }
  if (name === "lesson-collapse" && practice) {
    practice.collapsed = !practice.collapsed;
    renderLesson();
    return;
  }
  if (name === "lesson-hint" && practice) {
    practice.showHint = true;
    renderLesson();
    sound.effect("select");
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
  if (name === "prepare" && run.phase !== "battle") return;
  if (name === "release-prepared" && modal === "prepare") {
    closeModal();
    playAction(() => releasePreparedCard(run), "undo");
    return;
  }
  if (name === "console") { activateConsole(); return; }
  if (name === "tutorial" || name === "lesson-menu") { openModal("training"); sound.effect("navigate"); return; }
  if (name === "lesson-restart" && practice) { startLesson(practice.id); return; }
  if (name === "lesson-next" && practice) {
    const next = training.nextLesson(practice.id);
    if (next) openLesson(next.id);
    else finishPractice();
    return;
  }
  if (name === "lesson-exit") { finishPractice(); return; }
  if (name === "lesson-finish") {
    training.markLessonComplete(training.WALKTHROUGH_LESSON);
    sound.effect("reward");
    openModal("training");
    return;
  }
  if (name === "inspect-back" && inspectReturn) {
    modal = inspectReturn;
    $("#dialog-content").innerHTML = alpha.libraryMarkup(libraryRun ?? run, inspectReturn, libraryRarity, libraryQuery);
    dialog.className = "wide";
    return;
  }
  if (
    name === "devices" ||
    name === "loadout" ||
    name === "prepare" ||
    name === "enemy-dossier" ||
    name === "combat-details" ||
    name === "combat-log" ||
    name === "relic-journal" ||
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
    sound.effect("navigate");
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
  if (preparedIndex !== undefined && modal === "prepare") {
    closeModal();
    const chosen = run.hand[Number(preparedIndex)];
    if (chosen && lessonBlocks({ kind: "prepare", card: chosen })) return;
    playAction(() => prepareCard(run, Number(preparedIndex)), "card");
    return;
  }
  // Field Training: lesson menu, walkthrough pages and Handbook chapters live in the dialog.
  const lessonId = target.closest<HTMLElement>("button[data-lesson]")?.dataset.lesson;
  if (lessonId && training.lessonById(lessonId) && !busy) { openLesson(lessonId as training.LessonId); return; }
  const page = target.closest<HTMLElement>("[data-walkthrough]")?.dataset.walkthrough;
  if (page !== undefined && modal === "walkthrough") {
    $("#dialog-content").innerHTML = training.walkthroughMarkup(Number(page));
    resetDialogScroll();
    sound.effect("select");
    return;
  }
  const chapter = target.closest<HTMLElement>("[data-handbook]")?.dataset.handbook;
  if (chapter && modal === "help") {
    $("#dialog-content").innerHTML = training.handbookMarkup(chapter);
    resetDialogScroll();
    sound.effect("select");
    return;
  }
  const scrubId = target.closest<HTMLElement>("[data-scrub]")?.dataset.scrub;
  if (scrubId) {
    if (modal === "devices") closeModal();
    scrub(scrubId);
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
  if (dialog.open || busy) return;
  const character = target.closest<HTMLElement>("[data-archetype]")?.dataset
    .archetype as Archetype | undefined;
  if (character) {
    archetype = character;
    render(false);
    sound.effect("pickup");
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
      // The route cue first, then the room announces itself.
      sound.effect("navigate");
      const arrival = screens.roomArrivalCue(run);
      if (arrival) window.setTimeout(() => sound.effect(arrival), 170);
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
  // Expedition screens (sanctuary, market, events, deck pickers, ascension).
  const screenControl = target.closest<HTMLElement>("[data-screen]");
  if (screenControl) {
    const outcome = screens.screenAction(run, screenControl.dataset);
    if (outcome.result) toast(outcome.result.message, outcome.result.ok ? "normal" : "error");
    if (outcome.cue) sound.effect(outcome.cue);
    if (outcome.battle) {
      clearSelection();
      undoStack.length = 0;
      handKey = "";
      world?.resetCamera();
    }
    if (outcome.changed !== false) save();
    render();
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
  // In training a guarded card doesn't lift; the click on it explains why.
  if (practice?.progress && training.lessonGuard(practice.id, run, practice.progress, { kind: "card", card: run.hand[index] })) return;
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
  if (point && lessonBlocks({ kind: "ground", card: run.hand[d.index], zone: zoneForNode(point) })) render(false);
  else if (point) playAction(() => playGround(run, d.index, point.x, point.z), undefined, run.hand[d.index]);
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
    if (selected !== null || selectedNode || deviceDragging || cardDrag || consoleTargeting) {
      clearSelection();
      render(false);
      sound.effect("undo");
    } else if (view === "run") openModal("settings");
    else if (view === "select") {
      view = "title";
      render();
    }
    return;
  }
  if (!playable()) return;
  if (event.key.toLowerCase() === "p") {
    event.preventDefault();
    openModal("prepare");
    return;
  }
  if (event.key.toLowerCase() === "c") {
    event.preventDefault();
    activateConsole();
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
  const el = (event.target as HTMLElement).closest<HTMLElement>(HOVER_CUES);
  if (el && !(el as HTMLButtonElement).disabled && !el.contains((event as PointerEvent).relatedTarget as Node | null))
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
/** A new chapter or page starts at its top, whichever element of the dialog scrolls. */
function resetDialogScroll() {
  for (const el of [dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>("*"))]) if (el.scrollTop) el.scrollTop = 0;
}
/** Lesson menu entry: battle lessons start a practice battle; the expedition guide is a dialog. */
function openLesson(id: training.LessonId) {
  const lesson = training.lessonById(id);
  if (!lesson) return;
  if (lesson.kind === "walkthrough") {
    modal = "walkthrough";
    $("#dialog-content").innerHTML = training.walkthroughMarkup(0);
    dialog.className = "wide walkthrough-dialog";
    hideTooltip();
    if (!dialog.open) dialog.showModal();
    sound.effect("navigate");
    return;
  }
  startLesson(id);
}
/** Park the real expedition (once) and start a fresh lesson battle. Nothing here is saved. */
function startLesson(id: training.LessonId) {
  if (dialog.open) dialog.close();
  modal = "";
  cancelDrag();
  clearTimeout(hintTimer);
  const parked = practice
    ? { expedition: practice.expedition, run: practice.run, view: practice.view, undo: practice.undo }
    : { expedition, run, view, undo: undoStack.map(state => structuredClone(state)) };
  const lessonRun = training.createLessonRun(id);
  // Short screens start with the coach folded to its current goal; it expands on demand.
  const short = root.getBoundingClientRect().height / interfaceScale() < 780;
  practice = { id, ...parked, progress: null, showHint: false, collapsed: practice?.collapsed ?? short };
  expedition = { version: 3, run: lessonRun, archetype: lessonRun.archetype, daily: false, startedAt: Date.now(), recorded: true };
  run = lessonRun;
  view = "run";
  busy = false;
  battleGeneration++;
  undoStack.length = 0;
  clearSelection();
  handKey = "";
  world?.resetCamera();
  practice.progress = training.lessonProgress(id, run);
  render();
  armHint();
  sound.effect("turn");
}
function finishPractice() {
  if (!practice) { if (dialog.open) closeModal(); return; }
  cancelDrag();
  clearTimeout(hintTimer);
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
  sound.effect("navigate");
}
/** Recompute lesson goals after every action and transmission. */
function updateLesson() {
  if (!practice) return;
  const before = practice.progress;
  const progress = training.lessonProgress(practice.id, run, practice.last, before ?? undefined);
  const done = (p: training.LessonProgress | null) => p ? p.goals.filter(goal => goal.done).length : -1;
  practice.progress = progress;
  if (done(progress) > done(before)) { practice.showHint = false; armHint(); }
  if (progress.complete && !before?.complete) {
    training.markLessonComplete(practice.id);
    clearTimeout(hintTimer);
    sound.effect("reward", { delay: .35 });
  }
}
/** Offer the hint after a stretch of inactivity (the lesson owns the delay). */
function armHint() {
  clearTimeout(hintTimer);
  if (!practice || practice.progress?.complete) return;
  hintTimer = window.setTimeout(() => {
    if (!practice || practice.progress?.complete || practice.showHint) return;
    practice.showHint = true;
    renderLesson();
  }, training.HINT_DELAY_MS);
}
function renderLesson() {
  if (!practice?.progress) return;
  patchLessonLayer(view === "run" && root.classList.contains("is-battle")
    ? training.lessonPanelMarkup(practice.progress, { showHint: practice.showHint, collapsed: practice.collapsed })
    : "");
  fitLesson();
  spotlightLesson();
}
let lessonLayerHtml = "";
/** Update #lesson-layer in place. Rebuilding it with innerHTML on every render replayed
 * the panel's entrance animation each click — a constant flicker. Morphing touches only
 * the nodes whose content changed, so animations play once, when their content arrives. */
function patchLessonLayer(markup: string) {
  if (markup === lessonLayerHtml) return;
  lessonLayerHtml = markup;
  const template = document.createElement("template");
  template.innerHTML = markup;
  morphChildren($("#lesson-layer"), template.content);
}
function morphChildren(from: ParentNode & Node, to: ParentNode) {
  const wanted = Array.from(to.childNodes);
  for (let i = 0; i < wanted.length; i++) {
    const next = wanted[i];
    const current = from.childNodes[i];
    if (!current) { from.appendChild(next.cloneNode(true)); continue; }
    const matches = current.nodeType === next.nodeType &&
      (current.nodeType !== Node.ELEMENT_NODE || (current as Element).tagName === (next as Element).tagName);
    if (!matches) { (current as ChildNode).replaceWith(next.cloneNode(true)); continue; }
    if (current.nodeType === Node.ELEMENT_NODE) {
      const target = current as Element, source = next as Element;
      for (const name of source.getAttributeNames())
        if (target.getAttribute(name) !== source.getAttribute(name)) target.setAttribute(name, source.getAttribute(name)!);
      for (const name of target.getAttributeNames()) if (!source.hasAttribute(name)) target.removeAttribute(name);
      morphChildren(target, source);
    } else if (current.textContent !== next.textContent) current.textContent = next.textContent;
  }
  while (from.childNodes.length > wanted.length) from.lastChild!.remove();
}
// Window size changes move the vitals card and the spotlit control.
window.addEventListener("resize", () => { if (practice) { fitLesson(); spotlightLesson(); } });
/** The coach panel fills the left column down to the compact vitals card. */
/** Field Training points at the control its current step needs (e.g. the Prepare slot). */
function spotlightLesson() {
  const focus = (!busy && root.classList.contains("is-battle") && practice?.progress?.focus) || "";
  let targets: Element[] = [];
  try { if (focus) targets = Array.from(document.querySelectorAll(focus)); }
  catch { /* A malformed selector must never break the lesson. */ }
  // Leave elements that keep the spotlight untouched: re-adding the class would not
  // restart the pulse, but removing and re-adding it every render did.
  document.querySelectorAll(".lesson-focus").forEach(el => { if (!targets.includes(el)) el.classList.remove("lesson-focus"); });
  for (const el of targets) el.classList.add("lesson-focus");
  // The dimmer cuts a hole around the one control the step needs. It rests while the
  // player is mid-action — targeting, dragging or reading a dialog — and glides when
  // the step moves on.
  const overlay = $("#lesson-spotlight"), hole = overlay.firstElementChild as HTMLElement;
  const target = targets.find((el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null);
  const resting = selected !== null || consoleTargeting || !!cardDrag || deviceDragging || dialog.open;
  if (!target || resting) { overlay.classList.remove("active"); return; }
  const fresh = !overlay.classList.contains("active");
  if (fresh) hole.style.transition = "none";
  const scale = interfaceScale(), origin = root.getBoundingClientRect(), rect = target.getBoundingClientRect(), pad = 9;
  hole.style.left = `${(rect.left - origin.left) / scale - pad}px`;
  hole.style.top = `${(rect.top - origin.top) / scale - pad}px`;
  hole.style.width = `${rect.width / scale + pad * 2}px`;
  hole.style.height = `${rect.height / scale + pad * 2}px`;
  if (fresh) { void hole.offsetWidth; hole.style.transition = ""; }
  overlay.classList.add("active");
}
/** In training, cards outside the current step rest visibly parked in the hand. */
function railHand() {
  const progress = practice?.progress;
  document.querySelectorAll<HTMLElement>("#hand-zone [data-hand]").forEach(el => {
    const index = Number(el.dataset.hand);
    const parked = !!progress && !progress.complete && !!run.hand[index] &&
      !!training.lessonGuard(practice!.id, run, progress, { kind: "card", card: run.hand[index] });
    el.classList.toggle("lesson-parked", parked);
  });
}
function fitLesson() {
  const plate = document.querySelector<HTMLElement>(".is-practice .battle-left");
  if (!plate) return;
  const scale = interfaceScale(), top = (plate.getBoundingClientRect().top - root.getBoundingClientRect().top) / scale;
  root.style.setProperty("--training-room", `${Math.max(120, Math.round(top - 84 - 12))}px`);
}
/** A brief title card naming the encounter ground, once per fresh battle. */
function showTerrainTitle() {
  if (practice || !run.terrain || run.phase !== "battle") return;
  const key = `${run.seed}:${run.stage}:${run.currentRoom}`;
  if (terrainShown === key) return;
  terrainShown = key;
  if (run.turn !== 1 || run.cardsPlayed) return;
  document.querySelector(".terrain-title")?.remove();
  const el = document.createElement("div");
  el.className = "terrain-title";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>${ui.icon("terrain", 14)} ENCOUNTER GROUND</span><strong>${ui.esc(run.terrain.name)}</strong><p>${ui.esc(run.terrain.description)}</p>`;
  root.append(el);
  // A short beat: it leaves on its own, or the moment the player acts.
  const dismiss = () => { el.classList.add("leaving"); window.setTimeout(() => el.remove(), 260); };
  const timer = window.setTimeout(dismiss, 3600);
  const early = () => { window.clearTimeout(timer); dismiss(); };
  document.addEventListener("pointerdown", early, { once: true, capture: true });
  document.addEventListener("keydown", early, { once: true, capture: true });
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
