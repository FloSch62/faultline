import "./style.css";
import "./alpha.css";
import "./polish.css";
import "./battle.css";
import "./game-ui.css";
import "./table-ux.css";
import "./targeting.css";
import "./relocate.css";
import { Soundscape, type ScoreScene } from "./audio.ts";
import type { EffectKind } from "./audio-effects.ts";
import { ENEMIES } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { TRACK_TITLES } from "./core/music.ts";
import { CARDS, RULES, baseCard } from "./core/cards.ts";
import {
  ARCHETYPES,
  EXPEDITION_VERSION,
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
  scrubInstallation,
  repairNode,
  leaderOf,
  livingEnemies,
  effectiveFocus,
  setFocus,
  mostDangerous,
  isWorn,
  conditionOf,
  maxConditionOf,
  repairCost,
  scrubCost,
  INSTALLATION_NAMES,
  PORTS,
  useConsole,
  consoleState,
  isBlocked,
  cableFrays,
  laysArmoredCable,
  playDaemon,
  bufferMultiplierOf,
  type ActionResult,
  type CombatPreview,
  type TurnResult,
} from "./core/run.ts";
import type { CardId, Port, RelicId, RunState, Zone } from "./core/types.ts";
import { chooseOffer } from "./core/encounter.ts";
import { World, type TableHover, type WorldPoint } from "./three/World.ts";
import { hideHoverCard, hoverCardKey, moveHoverCard, showHoverCard } from "./hover-card.ts";
import * as tableCards from "./table-cards.ts";
import * as hostileCards from "./hostile-cards.ts";
import { playTurn, syncWorld } from "./battle-playback.ts";
import { loadAllModels } from "./three/models.ts";
import * as ui from "./ui.ts";
import * as battleUi from "./battle-ui.ts";
import * as screens from "./screens.ts";
import * as alpha from "./alpha-ui.ts";
import * as training from "./tutorial.ts";
import { loadPreferences, storePreferences } from "./preferences.ts";
import type { DevTools } from "./dev/panel.ts";
// v5 · Three Energy: card marks, the daemon strip and the v5 screens, over every earlier sheet.
import "./three-energy.css";
// The card's one layout, the hand fan and the scale per view, last of all.
import "./card-layout.css";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
// Vite's SPA fallback serves the root entry for /dev without its trailing slash.
// Static hosts serve dev/index.html; recognize both forms under any public base.
const playgroundPath = `${import.meta.env.BASE_URL}dev`;
const IS_PLAYGROUND = document.documentElement.dataset.playground === "true" || location.pathname === playgroundPath;
const STORAGE = IS_PLAYGROUND ? "faultline-dev-expedition-v1" : "faultline-expedition-v2";
let devTools: DevTools | null = null;
const sound = new Soundscape();
// Fetch the device models behind the title screen so the first table is built with them.
void loadAllModels();
/** Faults as one comparable signature (v4 lists). */
const faultKey = (state: RunState) => `${state.faultNodes.join(",")}|${state.faultLinks.join(",")}`;
const installationPoints = (state: RunState) => state.installations.reduce((sum, item) => sum + item.integrity, 0);
/** Controls whose hover deserves a whisper; icon buttons and toolbars stay silent. */
const HOVER_CUES = ".game-card:not(.drag-ghost), .route-room:not([disabled]), .archetype, .relic-option, [data-forge], .transmit-button, .console-button, .title-menu button, .gold-button, #target-dock [data-field-zone], .lesson-card, button.port-row, .hostile-plate[data-plate]";
let expedition: Expedition | null = null;
let records: RunRecord[] = [];
try {
  expedition = parseExpedition(localStorage.getItem(STORAGE));
  records = IS_PLAYGROUND ? [] : JSON.parse(localStorage.getItem("faultline-records-v2") || "[]");
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
let selected: number | null = null;
let source: string | null = null;
let selectedNode: string | null = null;
/** Far rail and table-front selection (reading only; the target lives in the run). */
const hud: battleUi.HudView = { port: null, installation: null, demolition: false };
/** Encounters whose hidden designation was already re-engraved, and arrivals already announced. */
let revealedKey = "", announcedKey = "", hudRoom = "";
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
/** Where the player was in a library when they opened a card, restored by Back. */
let libraryScroll = 0;
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
  /** Reading steps the player acknowledged (Got it, or a click on the spotlit control). */
  read: string[];
  /** The finished lesson's completion plate is up (it rises a beat after the last goal). */
  plate: boolean;
} | null = null;
let hintTimer = 0;
/** The beat between a lesson's last goal and its completion plate. */
let lessonEndTimer = 0;
/** The spotlight's hole follows moving targets (badges over the rail) frame by frame. */
let spotlightFrame = 0;
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
/** A relocation waiting on its plate: the table shows the device at (x, z); nothing is paid until Relocate. */
let pendingMove: { id: string; x: number; z: number; origin: Zone; destination: Zone } | null = null;
let relocateFrame = 0;
const undoStack: RunState[] = [];
/** The screen last shown, so a new one can fade up instead of swapping like a page. */
let lastScreen = "";


$("#app").innerHTML =
  `<main class="game-root"><div class="scene-backdrop"></div><div class="scene-shade"></div><div class="motes" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 47) % 100}%;--duration:${14 + (i % 8) * 3}s;--delay:-${i * 2.7}s;--size:${(i % 3) + 1}px"></i>`).join("")}</div><div class="world-stage"><canvas id="world" aria-label="Network battlefield. Use cards and the device targeting controls to build your route."></canvas></div><div id="intent-layer" aria-hidden="true"></div><div class="texture"></div><header id="header" class="game-header"></header><div id="screen"></div><div id="battle-hud"></div><div id="hand-zone"></div><div id="target-dock"></div><div id="battle-foot"></div><div id="lesson-spotlight" aria-hidden="true"><i></i></div><div id="lesson-layer"></div><div id="game-tooltip" role="tooltip"></div><div id="hover-card" role="tooltip" aria-hidden="true"></div><div id="card-zoom" aria-hidden="true"></div><div id="impact-layer" aria-hidden="true"></div><div id="battle-flash"></div><div id="toast" role="status" aria-live="polite"></div><div class="now-playing" id="now-playing"></div></main><dialog id="dialog" aria-label="Field journal"><button class="dialog-close" data-action="close" aria-label="Close dialog">${ui.icon("close", 16)}</button><div class="dialog-surface"><div id="dialog-content"></div></div></dialog>`;
const root = $(".game-root"),
  dialog = $<HTMLDialogElement>("#dialog");
sound.update({});
/** The soundtrack notice names each new track for a few seconds once the score is audible.
 *  The current title always stays in the element; a load failure shows over it for longer. */
let trackShown = "", trackTimer = 0, audioStarted = false;
function noticeTrack(ms = 5000) {
  const el = $("#now-playing");
  clearTimeout(trackTimer);
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  trackTimer = window.setTimeout(() => el.classList.remove("show", "failed"), ms);
}
sound.onUnavailable = () => {
  const el = $("#now-playing");
  el.dataset.alert = "Some audio could not load";
  el.classList.add("failed");
  noticeTrack(8000);
};
/** Name the track whenever the score becomes audible: first sound, unmute, or music raised from silence. */
function announceTrack() {
  if (audioStarted && !sound.settings.muted && sound.settings.music > 0) noticeTrack();
}
function renderTrack() {
  const el = $("#now-playing");
  if (sound.trackTitle === trackShown) return;
  trackShown = sound.trackTitle;
  el.innerHTML = screens.trackMarkup(trackShown);
  if (el.classList.contains("failed")) return;
  el.classList.remove("show");
  announceTrack();
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
    ? leaderOf(run) && ENEMIES[leaderOf(run)!.id].boss
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
      onPort: clickHostile,
      onFrame: placeIntents,
      onInstallation: selectInstallation,
      onHover: hoverTable,
    });
    world.setBattle(run.topology, run.enemies, run.faultNodes, run.faultLinks);
  } catch (error) {
    webglFailed = true;
    console.error("Could not create battlefield", error);
    toast(
      "3D rendering is unavailable. Use the deployment and device controls below.",
      "error",
    );
  }
}
/** Test hooks: on the dev server, and on a production build under the browser suite's render flag. */
const testHooks = import.meta.env.DEV || (globalThis as { __faultlineTestRender?: boolean }).__faultlineTestRender === true;
/** Hover cards on the table: devices, cables and installations (table-cards.ts), hostiles
 * (hostile-cards.ts). The same target only moves the card; render() hides it. */
function hoverTable(target: TableHover | null, x: number, y: number) {
  if (!target || view !== "run" || run.phase !== "battle" || dialog.open || pendingMove) { hideHoverCard(); return; }
  // A zone card choosing its band names itself on every band's card.
  const aiming = selected !== null && CARDS[run.hand[selected]]?.target === "zone" ? CARDS[run.hand[selected]].name : null;
  const key = `${target.kind}:${target.id}${aiming ? ":aim" : ""}`;
  if (hoverCardKey() === key) { moveHoverCard(x, y); return; }
  const preview = combatPreview(run);
  const html = target.kind === "port" || target.kind === "delivery"
    ? hostileCards.hoverMarkup(run, preview, target)
    : tableCards.hoverMarkup(run, preview, target, aiming);
  if (html) showHoverCard(key, html, x, y);
  else hideHoverCard();
}
function clearSelection() {
  dropRelocation();
  cancelDrag();
  selected = null;
  source = null;
  selectedNode = null;
  consoleTargeting = false;
  hud.installation = null;
  hud.demolition = false;
  world?.setPlacement(null);
  world?.setSelected(null);
  world?.setZoneTargeting(false);
  world?.setZonePreview(null);
  document.getElementById("movement-preview")?.remove();
}
function playable() {
  // A finished lesson is over: its board stays on screen, frozen, until the player moves on.
  return view === "run" && run.phase === "battle" && !busy && !dialog.open && !practice?.progress?.complete;
}
function interfaceScale() { return Number.parseFloat(getComputedStyle($("#app")).zoom) || 1; }
function render(rebuild = true) {
  // Numbers may have changed under the pointer: the next pointer move rebuilds the hover card.
  hideHoverCard();
  // A training battle that ended (every hostile down, or the drill lost) stays on its board, frozen:
  // the completion plate or the coach's restart note carries the debrief.
  const debrief = !!practice && view === "run" && run.phase !== "battle" && run.enemies.length > 0;
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
  root.classList.toggle("lesson-over", !!practice?.progress?.complete && battle);
  patchLessonLayer(battle ? lessonMarkup() : "");
  $("#header").innerHTML = screens.headerMarkup(
    expedition,
    view === "title" || view === "select",
    sound.settings,
  );
  settleHud();
  if (battle) {
    ensureWorld();
    const forecast = combatPreview(run);
    // The table and the rail mirror the run, its forecast and the HUD's selections (battle-playback.ts).
    syncWorld(world, run, forecast, worldView(), { rebuild, debrief });
    renderIntents(debrief ? null : forecast);
    root.dataset.guardianWindow = forecast.lethal ? "" : forecast.interrupted ? "break" : forecast.intent?.ultimate ? "ultimate" : forecast.intent?.kind === "charge" ? "charge" : leaderOf(run)?.exposed ? "exposed" : "";
    root.classList.toggle("is-buffering", run.buffering);
    showTerrainTitle();
    announceArrival(forecast);
  }
  if (!battle) { delete root.dataset.guardianWindow; renderIntents(null); }
  world?.setVisible(battle);
  let screen = "";
  if (debrief) screen = "";
  else if (view === "title") screen = screens.titleMarkup(expedition);
  else if (view === "select")
    screen = screens.selectMarkup(archetype);
  else if (run.phase === "map") screen = screens.mapMarkup(expedition!);
  else if (run.phase === "reward") screen = screens.rewardMarkup(run);
  else if (run.phase === "relic") screen = screens.relicMarkup(run);
  else if (run.phase === "forge") screen = screens.forgeMarkup(run);
  else if (run.phase === "shop") screen = screens.shopMarkup(run);
  else if (run.phase === "event") screen = screens.eventMarkup(run);
  else if (run.phase === "won" || run.phase === "lost")
    screen = screens.outcomeMarkup(expedition!);
  $("#screen").innerHTML = screen;
  const screenKey = debrief ? "" : `${view}|${view === "run" ? `${run.phase}|${run.currentRoom}` : ""}`;
  if (screenKey !== lastScreen) {
    lastScreen = screenKey;
    const el = $("#screen");
    el.classList.remove("screen-enter");
    if (screen) {
      void el.offsetWidth;
      el.classList.add("screen-enter");
    }
  }
  if (view === "run" && run.phase === "map") {
    const chart = $<HTMLElement>(".route-scroll"), nextRoom = chart.querySelector<HTMLElement>(".route-room.available");
    if (nextRoom) {
      chart.scrollTop = Math.max(0, nextRoom.offsetTop - chart.clientHeight * .68);
      chart.scrollLeft = Math.max(0, nextRoom.offsetLeft - chart.clientWidth / 2);
    }
  }
  const revealing = battle && !debrief && revealDesignation();
  const hudMarkup = battle
    ? battleUi.battleMarkup(run, {
        selected,
        source,
        busy,
        tips: tutorial && !practice,
        undo: undoStack.length > 0,
        consoleTargeting,
        training: !!practice,
        hud,
        revealing,
      })
    : null;
  // The foot (piles, prepare, transmit) follows the hand in the DOM so Tab reaches the cards first.
  $("#battle-hud").innerHTML = hudMarkup?.hud ?? "";
  $("#battle-foot").innerHTML = hudMarkup?.foot ?? "";
  if (battle) fitEnemyPlate();
  const signature = battle
    ? `${run.currentRoom}|${run.turn}|${run.energy}|${run.firstFiberPlayed}|${run.hand.join(",")}|${run.cardsPlayed}|${run.hand.map((_, i) => costFor(run, i)).join(",")}`
    : "";
  // Leaving a battle must clear the DOM even when practice reset the cache key.
  $("#hand-zone").hidden = !battle;
  if (!battle || signature !== handKey) {
    const scroll = document.querySelector(".card-fan")?.scrollLeft ?? 0;
    $("#hand-zone").innerHTML = battle ? battleUi.handMarkup(run, selected) : "";
    document.querySelector(".card-fan")?.scrollTo({left:scroll});
    handKey = signature;
    // The rail measures the hand it stands over: the table may stand lower in a tall window.
    if (battle) measureRail();
  } else if (battle)
    document
      .querySelectorAll<HTMLElement>("[data-hand]")
      .forEach((el) =>
        el.classList.toggle("selected", Number(el.dataset.hand) === selected),
      );
  if (selected !== null) document.querySelector(`[data-hand="${selected}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});
  // The large copy follows the hand: rebuilt, chosen or played cards, a busy table.
  syncCardZoom();
  if (practice && battle) fitLesson();
  renderTargetDock();
  // After the dock: a step may point at one of its controls (a relocation band, a scrub plate).
  spotlightLesson();
  if (practice && battle) railHand();
  if (selected !== null && run.hand[selected])
    world?.setPlacement(CARDS[run.hand[selected]].role ?? null, source, laysArmoredCable(run.hand[selected]));
  else if (consoleTargeting) world?.setPlacement(null, source);
  else world?.setPlacement(null);
  world?.setSelected(source ?? selectedNode);
  world?.setZoneTargeting(selected !== null && CARDS[run.hand[selected]]?.target === "zone");
  showRelocation();
  const scene = audioScene();
  sound.setScene(scene, `${run.seed}:${run.stage}:${run.currentRoom}:${practice ? "practice" : "expedition"}`, view === "run" ? run.stage : null);
  renderTrack();
  if (
    expedition &&
    !IS_PLAYGROUND &&
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
  if (battle && !practice && !run.bossIntroSeen && leaderOf(run) && ENEMIES[leaderOf(run)!.id].boss && !dialog.open) {
    modal = "boss-intro";
    dialog.className = "boss-intro";
    $("#dialog-content").innerHTML = screens.bossIntroMarkup(run);
    hideTooltip();
    dialog.showModal();
    sound.effect("boss");
  }
  // A choice waiting for the player (a message, a crate's cards) opens before the next hand
  // is played, and on the victory screen.
  if (view === "run" && !busy && !dialog.open && run.offers?.length && (run.phase === "battle" || run.phase === "reward")) openOffer();
  devTools?.render(run, busy || !!practice || dialog.open);
}
/** The hostile plate must end above the Transmit dial (or the hand): long forecasts fold step
 * by step — the description to fewer lines, then the ledger footer, then the description into
 * the medallion's tooltip, then extras another element already shows. Every folded line stays
 * in a tooltip and in Details. */
function fitEnemyPlate() {
  const plate = document.querySelector<HTMLElement>(".enemy-plate");
  if (!plate) return;
  // A port-strip name that folds onto a second line sets a little smaller, so both lines sit in the row.
  plate.querySelectorAll<HTMLElement>(".port-name > span").forEach(name =>
    name.classList.toggle("is-folded", name.offsetHeight > Number.parseFloat(getComputedStyle(name).fontSize) * 1.5));
  // The chosen port's name sets a size smaller rather than lose letters beside its marks.
  const head = plate.querySelector<HTMLElement>(".port-detail-head h2");
  if (head && head.scrollWidth > head.clientWidth) head.classList.add("is-long");
  clearFrame(plate);
  const box = () => plate.getBoundingClientRect();
  const dial = document.querySelector<HTMLElement>(".transmit-button")?.getBoundingClientRect();
  const gems = document.querySelector<HTMLElement>(".protocol-ring")?.getBoundingClientRect();
  const hand = document.querySelector<HTMLElement>(".card-fan")?.getBoundingClientRect();
  const below = [dial, gems, hand].filter((rect): rect is DOMRect => !!rect && rect.width > 0 && rect.left < box().right && rect.right > box().left && rect.top > box().top);
  if (!below.length) return;
  const limit = Math.min(...below.map(rect => rect.top)) - 2 * interfaceScale();
  let clear = true;
  for (const level of ["fold-1", "fold-2", "fold-3", "fold-4", "fold-5", "fold-6", "fold-7"]) {
    if (box().bottom <= limit) return;
    // Past the prose folds the frame's clearance gives way before any more content does.
    if (clear && level === "fold-5") {
      clear = false;
      plate.style.paddingTop = plate.style.paddingBottom = "";
      if (box().bottom <= limit) return;
    }
    plate.classList.add(level);
    if (clear) clearFrame(plate);
  }
  // Still too tall: the dial matters more than the frame's clearance.
  if (box().bottom > limit) plate.style.paddingTop = plate.style.paddingBottom = "";
}
/** The painted thorn frame stretches with the plate, so a tall plate's crest and corner spikes reach
 * further in: the plate pads its first and last lines past them (measured from combat-frames.png:
 * the top rail and crest arms end at 13.8 % of the frame's height beside the kicker's words, the
 * bottom rail and corner spikes at 13.2 % above its foot). */
function clearFrame(plate: HTMLElement) {
  plate.style.paddingTop = plate.style.paddingBottom = "";
  const frame = getComputedStyle(plate, "::before");
  if (!frame.backgroundImage.includes("combat-frames")) return;
  const style = getComputedStyle(plate);
  const baseTop = Number.parseFloat(style.paddingTop), baseBottom = Number.parseFloat(style.paddingBottom);
  const over = -Number.parseFloat(frame.top) || 0, under = -Number.parseFloat(frame.bottom) || 0;
  for (let pass = 0; pass < 3; pass++) {
    const height = plate.offsetHeight + over + under;
    plate.style.paddingTop = `${Math.max(baseTop, Math.ceil(.138 * height - over + 3))}px`;
    plate.style.paddingBottom = `${Math.max(baseBottom, Math.ceil(.132 * height - under + 3))}px`;
  }
}
/** Encounter-scoped HUD moments: a hidden designation re-engraves once, an announced arrival rings once. */
function revealDesignation(): boolean {
  const key = `${run.seed}:${run.stage}:${run.currentRoom}`;
  if (key !== hudRoom) { hudRoom = key; hud.port = hud.installation = null; hud.demolition = false; }
  const room = run.map.find(item => item.id === run.currentRoom);
  if (practice || revealedKey === key || !room?.designationHidden || run.turn !== 1 || run.cardsPlayed) return false;
  revealedKey = key;
  // The strike of the cue lands as the ribbon's static clears.
  sound.effect("reveal", { delay: .35 });
  return true;
}
function announceArrival(forecast: ReturnType<typeof combatPreview>) {
  const arrival = forecast.arrivals;
  if (!arrival || practice) return;
  const key = `${run.seed}:${run.stage}:${run.currentRoom}:${arrival.enemyId}`;
  if (announcedKey === key) return;
  announcedKey = key;
  sound.effect("warning", { delay: .2 });
}
/** The message / crate-card dialog: no close stud, keys 1–3 choose. */
function openOffer() {
  const markup = alpha.offerDialogMarkup(run);
  if (!markup) return;
  cancelDrag();
  modal = "offer";
  $("#dialog-content").innerHTML = markup;
  dialog.className = alpha.OFFER_DIALOG_CLASS;
  hideTooltip();
  if (!dialog.open) dialog.showModal();
  resetDialogScroll();
  sound.effect(alpha.offerKind(run) === "message" ? "message" : "pickup");
}
function answerOffer(index: number) {
  if (modal !== "offer" || busy) return;
  const kind = alpha.offerKind(run);
  modal = "";
  dialog.close();
  dialog.className = "";
  const cue = kind === "message" ? "message" : "draw";
  if (run.phase === "battle") {
    let message = "";
    if (!playAction(() => { const result = chooseOffer(run, index); message = result.message; return result; }, cue)) { render(false); return; }
    toast(message);
    return;
  }
  const result = chooseOffer(run, index);
  if (result.ok) {
    toast(result.message);
    sound.effect(cue);
  } else {
    toast(result.message, "error");
    sound.effect("error");
  }
  save();
  render();
}
/** Cable target button: warns before a new cable would fray over wreckage. */
function cableTarget(id: string, cardId: CardId | null) {
  const frayed = !!source && source !== id && cableFrays(run, source, id, cardId);
  return `<button data-node="${id}" class="${source === id ? "active" : ""}${frayed ? " frays" : ""}"${frayed ? ` data-tooltip="Crosses wreckage: frayed, −${RULES.frayedCableDamage} damage on your primary route. Armored cables don't fray."` : ""}>${id.toUpperCase()}${frayed ? " · frays" : ""}</button>`;
}
const bandName = (zone: string) => zone[0].toUpperCase() + zone.slice(1);
function renderTargetDock() {
  let markup = "", front = false;
  if (view === "run" && run.phase === "battle") {
    if (consoleTargeting) {
      markup = `<div class="target-options console-targets"><span>Patch Cable · ${source ? "connect to" : "choose a device"}</span>${run.topology.nodes
        .map(n => cableTarget(n.id, null))
        .join("")}<button data-action="cancel" class="target-cancel">Cancel <kbd>Esc</kbd></button></div>`;
    } else if (selected !== null) {
      const c = CARDS[run.hand[selected]];
      if (c?.target === "ground")
        markup = `<div class="target-options"><span>Place on the table, or</span><button data-action="auto-place">${ui.icon("cache", 14)} Deploy in a free socket</button>${(["north", "center", "south"] as const).map(zone => `<button data-deploy-zone="${zone}">${bandName(zone)} band</button>`).join("")}</div>`;
      else if (c?.target === "zone")
        // The bands light on the table; these three answer the keyboard (and name what each band holds).
        markup = `<div class="target-options zone-targets"><span>${ui.esc(c.name)} · choose a band</span>${(["north", "center", "south"] as const).map(zone => `<button data-field-zone="${zone}" aria-label="${ui.esc(`${c.name} on the ${bandName(zone)} band: ${zoneDescription(run, zone)}`)}" data-tooltip="${ui.esc(zoneDescription(run, zone))}">${bandName(zone)}</button>`).join("")}<button data-action="cancel" class="target-cancel">Cancel <kbd>Esc</kbd></button></div>`;
      else if (hud.demolition)
        markup = `<div class="target-options installation-targets"><span>${ui.esc(c.name)} · destroy an installation</span>${run.installations.map(item => `<button data-demolish="${item.id}" aria-label="${ui.esc(`Destroy the ${INSTALLATION_NAMES[item.kind]} in ${zoneForNode(item).toUpperCase()}`)}">${battleUi.glyph(item.kind, 14)} ${ui.esc(INSTALLATION_NAMES[item.kind])} <i class="plate-pips">${battleUi.integrityPips(item)}</i> · ${bandName(zoneForNode(item))}</button>`).join("")}<button data-action="cancel" class="target-cancel">Cancel <kbd>Esc</kbd></button></div>`;
      else if (c?.target === "link" || c?.target === "node")
        markup = `<div class="target-options"><span>${source ? "Connect to" : "Choose a device"}</span>${run.topology.nodes
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
      const forecast = combatPreview(run);
      const online = node && !node.fixed && forecast.online.includes(node.id);
      if (node) {
        // Condition pips in the header; Repair beside the relocation bands (disabled with its reason).
        const wearable = !node.fixed && node.role !== "phantom";
        const condition = wearable ? conditionOf(node) : 0, max = wearable ? maxConditionOf(node) : 0;
        const cost = repairCost(run), worn = wearable && isWorn(node);
        const reason = !wearable ? "" : !worn ? `${node.id.toUpperCase()} is at full condition.` : run.energy < cost ? `Repair costs ${cost} energy.` : "";
        const threat = forecast.wear.find(record => record.nodeId === node.id || record.sheltered === node.id);
        const pip = (now: number) => `${"◆".repeat(now)}${"◇".repeat(Math.max(0, max - now))}`;
        const repairButton = wearable ? `<button class="repair-button" data-repair="${node.id}" ${reason ? "disabled" : ""} data-tooltip="${ui.esc(reason || `Restore one condition point for ${cost} energy.`)}" aria-label="${ui.esc(`Repair ${node.id.toUpperCase()}, ${cost} energy, condition ${condition} of ${max}${reason ? `. ${reason}` : ""}`)}">${battleUi.glyph("wrench", 14)} Repair · ${cost}${ui.icon("bolt", 12)} · ${pip(condition)} → ${pip(Math.min(max, condition + 1))} <kbd>R</kbd></button>` : "";
        const source = (text: string) => text.replace(/^([^·]+?)(?= ·|$)/, name => name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
        // One row where it fits (who, what threatens it, relocation, repair), wrapping to two.
        // A band awaiting its answer on the relocation plate stays lit.
        const asking = (zone: Zone) => pendingMove?.id === node.id && pendingMove.destination === zone;
        markup = `<div class="target-options device-controls"><span><b>${ui.esc(node.id.toUpperCase())}</b>${wearable ? ` <i class="plate-pips${worn ? " is-worn" : ""}" aria-label="condition ${condition} of ${max}">${pip(condition)}</i>` : ""} · ${bandName(zoneForNode(node))}${node.fixed ? "" : online ? " · online" : " · offline"}${worn ? " · worn" : ""}${node.configured ? " · configured" : ""}${node.upgraded ? " · overclocked" : ""}${node.shielded ? " · jam protected" : ""}${node.salvage ? " · salvaged" : ""}${threat ? ` <em class="device-threat">${ui.esc(`${source(threat.source)} ${threat.breaks ? "breaks it" : `wears it ${threat.from} → ${threat.to}`}${threat.sheltered ? ` (${threat.nodeId.toUpperCase()} shelters it)` : ""}`)}</em>` : ""}</span><button data-action="cancel" class="target-cancel plate-close" aria-label="Close · Esc" data-tooltip="Close · Esc">${ui.icon("close", 11)}</button>${node.fixed && !repairButton ? "" : `<span class="dock-actions">${node.fixed ? "" : `<span class="dock-label">Relocate · ${RULES.relocateCost}${ui.icon("bolt", 12)}</span>${(["north", "center", "south"] as const).map(zone => `<button data-relocate-zone="${zone}"${asking(zone) ? ` class="active" aria-pressed="true"` : ""} ${run.energy < RULES.relocateCost ? "disabled" : ""}>${bandName(zone)}</button>`).join("")}`}${repairButton}</span>`}</div>`;
      }
    }
    if (selected === null && !selectedNode && hud.installation) {
      const item = run.installations.find(entry => entry.id === hud.installation);
      if (item) {
        const forecast = combatPreview(run), cost = scrubCost(run), name = INSTALLATION_NAMES[item.kind];
        const base = Math.max(item.integrity, RULES.installationIntegrity[item.kind] ?? item.integrity);
        const pip = (now: number) => `${"◆".repeat(Math.max(0, now))}${"◇".repeat(Math.max(0, base - now))}`;
        const reason = run.energy < cost ? `Scrubbing costs ${cost} energy per point${cost > RULES.scrubCost ? " while a Quarantine Drone lives" : ""}.` : "";
        markup = `<div class="target-options installation-controls kind-${item.kind}"><span><b>${ui.esc(name.toUpperCase())}</b> <i class="plate-pips" aria-label="integrity ${item.integrity}">${pip(item.integrity)}</i> · ${bandName(zoneForNode(item))}${item.kind === "breaker" && item.countdown !== undefined ? ` · <i class="plate-count">${item.countdown}</i>` : ""}</span><span class="installation-effect">${ui.esc(battleUi.installationEffectLine(run, forecast, item))}</span><button class="scrub-button" data-scrub="${item.id}" ${reason ? "disabled" : ""} data-tooltip="${ui.esc(reason || `Remove one integrity point for ${cost} energy; at 0 it is destroyed and Reclaim adds ${RULES.reclaimShield} shield.`)}" aria-label="${ui.esc(`Scrub the ${name}, ${cost} energy, ${item.integrity} integrity left${reason ? `. ${reason}` : ""}`)}">${battleUi.glyph("scrub", 14)} Scrub · ${cost} energy · ${pip(item.integrity)} → ${pip(item.integrity - 1)} <kbd>S</kbd></button><button data-action="cancel" class="target-cancel plate-close" aria-label="Close · Esc" data-tooltip="Close · Esc">${ui.icon("close", 11)}</button></div>`;
      }
    }
    // The table-front plates (a device, an installation) take the field seals' row, so they
    // never cover the table they describe; card targeting keeps its place above the seals.
    front = /device-controls|installation-controls/.test(markup);
    if (webglFailed)
      markup += `<div class="fallback-network">${run.topology.links.map((l) => `${ui.esc(l.a)} ↔ ${ui.esc(l.b)}`).join(" · ") || "ALPHA · No connections · OMEGA"}</div>`;
  }
  $("#target-dock").innerHTML = markup;
  $("#target-dock").classList.toggle("is-front", front);
}
function openModal(type: string) {
  if (busy) return;
  modal = type;
  clearSelection();
  render(false);
  const content = $("#dialog-content");
  if (type === "relic-journal") content.innerHTML = alpha.relicJournalMarkup(run);
  else if (type === "settings")
    content.innerHTML = screens.settingsMarkup(sound.settings, view === "run", preferences, !!document.fullscreenElement);
  else if (type === "help") content.innerHTML = training.handbookMarkup();
  else if (type === "training") content.innerHTML = training.lessonMenuMarkup(training.loadCompletedLessons());
  else if (type === "combat-details") content.innerHTML = alpha.combatDetailsMarkup(run);
  else if (type === "enemy-dossier") content.innerHTML = alpha.enemyDossierMarkup(run, hud.port ?? effectiveFocus(run) ?? undefined);
  else if (type === "combat-log") content.innerHTML = alpha.historyMarkup(run);
  else if (type === "devices") content.innerHTML = alpha.devicesMarkup(run);
  else if (type === "prepare") content.innerHTML = alpha.prepareMarkup(run);
  else if (["deck", "collection", "draw-pile", "discard-pile", "exhaust-pile", "loadout"].includes(type)) {
    libraryMode = type as alpha.LibraryMode;
    libraryRun = type === "loadout" ? newExpedition(archetype, 1).run : run;
    libraryRarity = "all";
    libraryQuery = "";
    content.innerHTML = alpha.libraryMarkup(libraryRun, libraryMode);
  }
  else if (type === "credits") content.innerHTML = screens.creditsMarkup();
  else if (type === "replace") content.innerHTML = screens.replaceMarkup(run);
  else if (type === "training-offer") content.innerHTML = training.trainingOfferMarkup();
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
    : type === "devices" || type === "enemy-dossier" ? "medium" : "";
  hideTooltip();
  if (!dialog.open) dialog.showModal();
  resetDialogScroll();
}
function closeModal() {
  // A message was already opened: it is answered, never dismissed.
  if (modal === "offer") return;
  if (modal === "boss-intro") {
    run.bossIntroSeen = true;
    save();
  }
  modal = "";
  dialog.close();
  dialog.className = "";
  render(false);
}
/** A new player (no expedition, record or lesson yet, field notes on) is asked once whether to
 * take Field Training before the first expedition. */
function firstExpedition() {
  return preferences.tips && !preferences.trainingOffered && !expedition && !records.length && !training.loadCompletedLessons().length;
}
function chooseKeeper() {
  clearSelection();
  archetype = "architect";
  view = "select";
  render();
}
function begin() {
  if (expedition && !["won", "lost"].includes(run.phase) && !discardArmed) {
    openModal("replace");
    return;
  }
  discardArmed = false;
  expedition = newExpedition(
    archetype,
    (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
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
  return state.phase === "battle" && state.enemies.length ? combatPreview(state).channels : 0;
}
/** The primary cue for a successful card or board action, chosen by its real effect. */
function actionCue(before: RunState, after: RunState, card?: CardId): EffectKind {
  if (after.topology.nodes.length > before.topology.nodes.length) return "deploy";
  if (after.topology.links.length > before.topology.links.length) return "connect";
  if (card && CARDS[card]?.target === "protocol") return "protocol";
  if (installationPoints(after) < installationPoints(before)) return "scrub";
  if (after.integrity > before.integrity || faultKey(after) !== faultKey(before)) return "cleanse";
  // A repair card restored a condition point (design 13.12: a device is repaired).
  const condition = (r: RunState) => r.topology.nodes.reduce((sum, node) => sum + (isWorn(node) ? conditionOf(node) - maxConditionOf(node) : 0), 0);
  if (after.topology.nodes.length === before.topology.nodes.length && condition(after) > condition(before)) return "repair";
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
  if (!practice) devTools?.afterAction(run, before, card ?? (selected !== null ? before.hand[selected] : undefined));
  undoStack.push(before);
  if (undoStack.length > 20) undoStack.shift();
  if (run.block > before.block) world?.pulseNetwork("shield");
  else if (faultKey(run) !== faultKey(before) || run.integrity > before.integrity) world?.pulseNetwork("repair");
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
    // Demolition Charge chooses the installation it destroys (click one, its tag, or the table).
    if (baseCard(id) === "demolition-charge" && run.installations.length) {
      const lifting = !(selected === index && hud.demolition);
      clearSelection();
      if (lifting) { selected = index; hud.demolition = true; }
      render(false);
      sound.effect(lifting ? "pickup" : "undo");
      return;
    }
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
  // A daemon starts at once: it joins the daemon strip for the rest of the encounter.
  if (c.target === "daemon") {
    if (playAction(() => playDaemon(run, index), "protocol", id)) toast(`${c.name} is running for the rest of this encounter.`);
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
    if (state.id === "buffer") toast(wasBuffering ? "Buffer cancelled. This turn transmits normally." : `Buffering: this transmission is stored ×${bufferMultiplierOf(run)}. Transmit to store it.`);
  }
}
function scrub(id: string) {
  if (!playable()) return;
  const target = run.installations.find(m => m.id === id);
  if (target && lessonMove({ kind: "scrub", installation: id })) return;
  const open = hud.installation === id;
  if (playAction(() => scrubInstallation(run, id), "scrub") && target) {
    world?.pulseNode?.(id, "scrub");
    const standing = run.installations.some(m => m.id === id);
    floatText(standing ? "scrubbed −1" : "installation destroyed", true, "scrub");
    // The plate stays open on a standing installation, so a second point is one more press.
    if (open && standing) { hud.installation = id; render(false); }
  }
}
function repair(id: string) {
  if (!playable()) return;
  if (lessonMove({ kind: "repair", node: id })) return;
  const open = selectedNode === id;
  if (playAction(() => repairNode(run, id), "repair")) {
    world?.pulseNode?.(id, "repair");
    if (open && run.topology.nodes.some(n => n.id === id)) { selectedNode = id; render(false); }
  }
}
/** Run a table-front move from inside the Devices journal: the dialog steps aside for the action
 * (playAction needs a closed dialog), then the journal returns with the new state and focus. */
function journalAction(move: () => void) {
  const scroll = dialog.querySelector(".dialog-surface")?.scrollTop ?? 0;
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset;
  const again = focusKey?.scrub ? `[data-scrub="${focusKey.scrub}"]` : focusKey?.repair ? `[data-repair="${focusKey.repair}"]` : "";
  modal = "";
  dialog.close();
  move();
  if (run.phase !== "battle" || dialog.open) return;
  modal = "devices";
  $("#dialog-content").innerHTML = alpha.devicesMarkup(run);
  dialog.className = "medium";
  dialog.showModal();
  const surface = dialog.querySelector(".dialog-surface");
  if (surface) surface.scrollTop = scroll;
  if (again) dialog.querySelector<HTMLElement>(again)?.focus();
}
/** Rails for the v4 moves (target, repair, scrub): the lesson guard refuses them outside their step. */
function lessonMove(action: Extract<training.LessonAction, { kind: "focus" | "repair" | "scrub" }>): boolean {
  return lessonBlocks(action);
}
/** A click on a hostile (its body, rail plate, intent badge or port-strip row) targets it. */
function clickHostile(port: Port) {
  focusPort(port);
}
/** Make a port the target (the rules' focus): every delivery lands there and overflow carries the
 * surplus on (free, undoable). The right plate details the target. Targeting the target changes nothing. */
function focusPort(port: Port) {
  if (!playable() || !livingEnemies(run).some(enemy => enemy.port === port)) return;
  if (effectiveFocus(run) === port && run.focus === port) { hud.port = port; render(false); return; }
  if (lessonMove({ kind: "focus", port })) return;
  hud.port = port;
  playAction(() => setFocus(run, port), "aim");
}
let intentMarkup = "";
/** The rail's plates (hostile-cards.ts): content on render, position on every drawn frame. */
function renderIntents(forecast: ReturnType<typeof combatPreview> | null) {
  const layer = document.getElementById("intent-layer");
  if (!layer) return;
  // Without a table (WebGL unavailable) there are no portraits to hang plates under: the HUD reads.
  const markup = world && forecast && view === "run" && run.phase === "battle" ? hostileCards.intentBadges(run, forecast) + tableAnchors() : "";
  if (markup !== intentMarkup) {
    intentMarkup = markup;
    layer.innerHTML = markup;
  }
  measureRail();
  placeIntents();
}
/** Invisible marks over the table's installations and worn devices: they follow the camera like the
 * plates, so Field Training's spotlight can ring a thing that lives only on the table. */
function tableAnchors(): string {
  return run.installations.map(item => `<i class="table-anchor" data-anchor-installation="${item.id}" data-x="${item.x}" data-z="${item.z}"></i>`).join("")
    + run.topology.nodes.filter(node => !node.fixed && isWorn(node)).map(node => `<i class="table-anchor" data-anchor-node="${node.id}" data-x="${node.x}" data-z="${node.z}"></i>`).join("");
}
/** The rail's frame (client pixels): the span between the side plates, the band's top (the game's
 * top edge: the portraits have their own layer), the header's items the portraits stay clear of, the
 * plates' size (the tallest plate is reserved under every portrait, so all feet stand on one line)
 * and the lowest the table may stand over the hand. */
let handTop: { size: string; top: number } | null = null;
function measureRail() {
  const layer = document.getElementById("intent-layer");
  if (!world || !layer || !root.classList.contains("is-battle")) return;
  const scale = interfaceScale(), canvas = $("#world").getBoundingClientRect(), box = root.getBoundingClientRect();
  const rect = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map(el => el.getBoundingClientRect()).filter(item => item.width && item.height);
  const left = Math.max(canvas.left, box.left, ...rect(".is-battle .battle-left, .is-practice #lesson-layer .training-panel").map(item => item.right)) + 10 * scale;
  const right = Math.min(canvas.right, box.right, ...rect(".is-battle .battle-right").map(item => item.left)) - 10 * scale;
  // The leader's plate is the widest; the side plates are narrower, so escorts stand nearer the
  // middle, clear of the header's items. Both shrink together on a narrow rail.
  const short = root.getBoundingClientRect().height / scale <= 760;
  const gap = 7 * scale, fit = Math.min(1, (right - left - gap * 4) / ((short ? 200 + 2 * 170 : 216 + 2 * 182) * scale));
  const width = Math.round((short ? 200 : 216) * scale * fit), side = Math.round((short ? 170 : 182) * scale * fit);
  layer.style.setProperty("--plate", `${(width / scale).toFixed(1)}px`);
  layer.style.setProperty("--plate-side", `${(side / scale).toFixed(1)}px`);
  const plates = Array.from(layer.querySelectorAll<HTMLElement>(".hostile-plate"));
  const height = Math.max(58 * scale, ...plates.map(plate => plate.getBoundingClientRect().height));
  // The table may stand lower in a tall window, its front edge 40 px over the resting hand (an empty
  // hand is not drawn: the last measure at this size holds).
  const [hand] = rect("#hand-zone"), size = `${box.width}x${box.height}`;
  if (hand) handTop = { size, top: hand.top - box.top };
  world.setRailFrame({
    left, right, top: box.top + 4 * scale, table: handTop?.size === size ? box.top + handTop.top - 40 * scale : undefined,
    obstacles: rect(".game-header .run-stats, .game-header .header-controls, .is-battle .encounter-heading")
      .map(item => ({ left: item.left, top: item.top, right: item.right, bottom: item.bottom })),
    plate: { width, side, height: Math.ceil(height), gap },
  });
}
addEventListener("resize", () => { measureRail(); placeIntents(); });
// The plates' type may land after the first render: measure their height again once it has.
void document.fonts?.ready.then(() => { measureRail(); placeIntents(); });
/** Hangs each plate under its portrait (the rail stands still when the table's camera moves; the
 * table anchors follow it). Positions are client pixels, the layer lives inside #app's interface zoom. */
function placeIntents() {
  const layer = document.getElementById("intent-layer");
  if (!layer?.firstElementChild || !world) return;
  const scale = interfaceScale(), origin = root.getBoundingClientRect();
  let shown = false;
  for (const plate of Array.from(layer.children) as HTMLElement[]) {
    if (plate.classList.contains("table-anchor")) {
      const at = world.screenFromPoint(Number(plate.dataset.x), Number(plate.dataset.z), 0.45);
      const place = `translate(${((at.x - origin.left) / scale).toFixed(1)}px, ${((at.y - origin.top) / scale).toFixed(1)}px)`;
      if (plate.dataset.place !== place) { plate.dataset.place = place; plate.style.transform = `${place} translate(-50%, -50%)`; }
      continue;
    }
    const port = (plate.dataset.plate ?? plate.dataset.arrival) as Port;
    const at = world.portAnchor(port, !!plate.dataset.arrival);
    if (plate.hidden && at) shown = true;
    plate.hidden = !at;
    if (!at) continue;
    const place = `translate(${((at.x - origin.left) / scale).toFixed(1)}px, ${((at.y - origin.top) / scale).toFixed(1)}px)`;
    if (plate.dataset.place !== place) { plate.dataset.place = place; plate.style.transform = `${place} translateX(-50%)`; }
  }
  // Plates wait for their portraits (a hostile's entrance): a lesson spotlight that fell back to the
  // port strip moves onto them as soon as they stand.
  if (shown && practice) spotlightLesson();
}
/** Hover cards off the canvas: an intent badge or a port-strip row shows its hostile's card, a
 * channel of the landing breakdown its channel's card (the canvas raises its own through hoverTable). */
document.addEventListener("pointermove", event => {
  const el = event.target as HTMLElement;
  if (el.id === "world") return;
  const spot = el.closest?.<HTMLElement>("[data-hover-port], [data-hover-delivery]");
  if (!spot || view !== "run" || run.phase !== "battle" || dialog.open) {
    if (hoverCardKey().startsWith("dom:")) hideHoverCard();
    return;
  }
  const target: TableHover = spot.dataset.hoverPort ? { kind: "port", id: spot.dataset.hoverPort } : { kind: "delivery", id: spot.dataset.hoverDelivery! };
  const key = `dom:${target.kind}:${target.id}`;
  // A row of the right plate keeps its card beside the plate, clear of the rows it reads.
  const plate = spot.closest(".battle-right")?.getBoundingClientRect();
  const x = plate ? plate.left : event.clientX;
  if (hoverCardKey() === key) { moveHoverCard(x, event.clientY); return; }
  const html = hostileCards.hoverMarkup(run, combatPreview(run), target);
  if (html) showHoverCard(key, html, x, event.clientY);
  else hideHoverCard();
});
document.addEventListener("pointerout", event => {
  if (!event.relatedTarget && hoverCardKey().startsWith("dom:")) hideHoverCard();
});
/** Select an installation (table click, ledger or journal): its scrub plate opens in the dock.
 * While Demolition Charge is choosing, the installation is its target instead. */
function selectInstallation(id: string) {
  if (!playable() || !run.installations.some(item => item.id === id)) return;
  if (hud.demolition && selected !== null) { demolish(id); return; }
  if (selected !== null || consoleTargeting) return;
  hud.installation = hud.installation === id ? null : id;
  selectedNode = null;
  render(false);
  sound.effect(hud.installation ? "select" : "undo");
}
/** Demolition Charge on the chosen installation. */
function demolish(id: string) {
  if (selected === null || baseCard(run.hand[selected]) !== "demolition-charge") return;
  const index = selected, card = run.hand[index], item = run.installations.find(entry => entry.id === id);
  if (!item) return;
  if (playAction(() => playInstant(run, index, id), undefined, card)) {
    world?.pulseNode?.(id, "scrub");
    floatText(`${INSTALLATION_NAMES[item.kind]} destroyed`, true, "scrub");
  }
}
/** The device the R key repairs without a selection: the most worn (ties: primary route, then earliest). */
function mostWornDevice() {
  const primary = combatPreview(run).signalPath;
  return run.topology.nodes.filter(isWorn)
    .sort((a, b) => conditionOf(a) - maxConditionOf(a) - (conditionOf(b) - maxConditionOf(b)) || Number(!primary.includes(a.id)) - Number(!primary.includes(b.id)))[0] ?? null;
}
/** The view the table mirrors: selected port and installation, and installation targeting. */
function worldView() {
  return {
    selectedPort: hud.port,
    selectedInstallation: hud.installation,
    targetingInstallation: hud.demolition,
  };
}
// Browser tests reach the table's click targets without the canvas (dev server only).
if (testHooks) (globalThis as { __faultlineHud?: unknown }).__faultlineHud = { selectPort: clickHostile, clickHostile, selectInstallation, focusPort, selectNode: onNode };
// …and the rail's portraits: each painted box on screen (client pixels) as drawn this frame.
if (testHooks) (globalThis as { __faultlineRail?: unknown }).__faultlineRail = { portrait: (port: Port) => world?.portraitRect(port) ?? null };
/** Forget selections that no longer point at anything (a fallen hostile, a scrubbed installation). */
function settleHud() {
  if (view !== "run" || run.phase !== "battle") { hud.port = hud.installation = null; hud.demolition = false; return; }
  if (hud.port && !livingEnemies(run).some(enemy => enemy.port === hud.port)) hud.port = null;
  if (hud.installation && !run.installations.some(item => item.id === hud.installation)) hud.installation = null;
  if (hud.demolition && (selected === null || baseCard(run.hand[selected] ?? "guard") !== "demolition-charge")) hud.demolition = false;
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
  hud.installation = null;
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
      if (preview) { preview.className = "relocate-plate blocked"; preview.innerHTML = `<p class="relocate-hint">Outside the build grid · release to cancel</p>`; }
      world?.setZonePreview(null);
    }
    return;
  }
  if (finished) {
    deviceDragging = false;
    // Dropped back in its own socket: nothing moves, nothing to ask (a soft return).
    if (atHome(node, point)) { clearSelection(); render(); sound.effect("undo"); return; }
    if (lessonBlocks({ kind: "move", node: id, zone: zoneForNode(point) })) { clearSelection(); render(); return; }
    // The drop only proposes: the plate beside the device asks before any energy is spent.
    clearSelection();
    proposeRelocation(id, point);
    return;
  }
  const home = atHome(node, point);
  const blocked = home ? "" : run.energy < RULES.relocateCost ? "Not enough energy" : isBlocked(run, point.x, point.z, id) ?? "";
  const next = home ? run : movedRun(id, point.x, point.z), destination = zoneForNode(home ? node : point);
  let preview = document.getElementById("movement-preview");
  if (!preview) { preview = document.createElement("div"); preview.id="movement-preview"; preview.setAttribute("role","status"); root.append(preview); }
  preview.className = `relocate-plate${blocked ? " blocked" : ""}`;
  preview.innerHTML = relocationMarkup(id, zoneForNode(node), destination, combatPreview(run), combatPreview(next), true)
    + `<p class="relocate-hint">${ui.esc(blocked || (home ? "Release to leave it in place" : "Release to choose this socket"))}</p><small>${ui.esc(zoneDescription(run, destination))}</small>`;
  placeRelocationPlate(preview, point.x, point.z);
  world?.setZonePreview(destination, !!blocked);
  deviceDragging = true;
  // A drag previews geometry; only a confirmed drop pays energy and mutates the run.
  if (!blocked) world?.previewTopology(next.topology);
}
/** Device dock bands: the same plate asks, with the chosen socket shown on the table. Choosing the
 * band the device stands in withdraws a pending move. */
function relocateToZone(zone: "north" | "center" | "south") {
  if (!selectedNode || !playable()) return;
  const id = selectedNode;
  const node = run.topology.nodes.find(n => n.id === id)!;
  if (zoneForNode(node) === zone) {
    if (pendingMove?.id === id) cancelRelocation();
    else toast(`${id.toUpperCase()} is already in ${zone.toUpperCase()}.`);
    return;
  }
  if (pendingMove?.id === id && pendingMove.destination === zone) { document.querySelector<HTMLElement>("[data-relocate-confirm]")?.focus({ preventScroll: true }); return; }
  if (lessonBlocks({ kind: "move", node: id, zone })) return;
  let spot: WorldPoint | undefined;
  for (const z of { north: [-2.5, -3.6, -1.8], center: [0, 0.9, -0.9], south: [2.5, 3.6, 1.8] }[zone])
    for (const x of [node.x, 0, -1.25, 1.25, -2.5, 2.5, -3.75, 3.75, -4.5, 4.5])
      if (!spot && !isBlocked(run, x, z, id)) spot = { x, z };
  if (!spot) { toast("No free socket in that band.", "error"); return; }
  proposeRelocation(id, spot);
}
/** A drop on its own snap cell leaves a device where it stands: drops snap to half units, and a device
 * placed off that grid (a band's socket at x 1.25, z 1.8) is up to half a cell's diagonal from it. */
const atHome = (node: WorldPoint, point: WorldPoint) => Math.hypot(node.x - point.x, node.z - point.z) < .36;
/** The run with one device standing at (x, z): what the drag and the plate preview. */
function movedRun(id: string, x: number, z: number) {
  const next = structuredClone(run);
  const node = next.topology.nodes.find(n => n.id === id);
  if (node) { node.x = x; node.z = z; }
  return next;
}
/** The relocation plate's reading: the move, its cost, and before → after from the forecast. The drag
 * lists shield and life lost even when they hold (it explores); the confirm plate keeps what changes. */
function relocationMarkup(id: string, origin: Zone, destination: Zone, before: CombatPreview, after: CombatPreview, every: boolean) {
  const line = (label: string, from: number, to: number, better: number, always = every) => always || from !== to
    ? `<span class="${from === to ? "" : (to - from) * better > 0 ? "is-better" : "is-worse"}">${label}<b>${from} → <i>${to}</i></b></span>` : "";
  const bands = origin === destination ? `${bandName(origin)} · new socket` : `${bandName(origin)} ${ui.icon("arrow", 13)} ${bandName(destination)}`;
  return `<div class="relocate-head"><b>${ui.esc(id.toUpperCase())}</b><span>${bands}</span><em aria-label="${RULES.relocateCost} energy">${RULES.relocateCost}${ui.icon("bolt", 13)}</em></div>`
    + `<div class="relocate-lines">${line("Damage", before.packetDamage, after.packetDamage, 1, true)}${line("Shield", before.shield, after.shield, 1)}${line("Life lost", before.incoming, after.incoming, -1)}${line("Channels", before.channels, after.channels, 1, false)}</div>`;
}
/** The plate stands beside the device's socket, on the side with room, inside the table's column (clear
 * of the side plates, the header, the device dock and the hand); its stud points at the device. */
function placeRelocationPlate(plate: HTMLElement, x: number, z: number) {
  if (!world) return;
  const scale = interfaceScale(), box = root.getBoundingClientRect();
  const edge = (selector: string) => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect?.width ? rect : null; };
  const left = edge(".battle-left"), right = edge(".battle-right"), header = edge("#header");
  const floor = edge("#target-dock:not(:empty)") ?? edge("#hand-zone .card-fan");
  const width = plate.offsetWidth, height = plate.offsetHeight, gap = 46;
  let minX = left ? (left.right - box.left) / scale + 10 : 10, maxX = (right ? (right.left - box.left) / scale : box.width / scale) - 10;
  let minY = header ? (header.bottom - box.top) / scale + 8 : 10, maxY = (floor ? (floor.top - box.top) / scale : box.height / scale) - 10;
  // A narrow layout stacks its plates: then the whole window is the room.
  if (maxX - minX < width) { minX = 10; maxX = box.width / scale - 10; }
  if (maxY - minY < height) { minY = 10; maxY = box.height / scale - 10; }
  // The stud points at the device's body, a little above the table.
  const at = world.screenFromPoint(x, z, .8), px = (at.x - box.left) / scale, py = (at.y - box.top) / scale;
  const east = px + gap + width <= maxX || px - gap - width < minX;
  const leftAt = Math.max(minX, Math.min(maxX - width, east ? px + gap : px - gap - width));
  const topAt = Math.max(minY, Math.min(maxY - height, py - height / 2));
  plate.dataset.side = east ? "east" : "west";
  plate.style.left = `${Math.round(leftAt)}px`;
  plate.style.top = `${Math.round(topAt)}px`;
  plate.style.setProperty("--stud", `${Math.round(Math.max(14, Math.min(height - 14, py - topAt)))}px`);
}
/** Ask before a relocation. The rules vet it on a copy (energy, grid, wreckage), so a refused move never
 * asks; an accepted one shows on the table beside its plate until Relocate or Cancel. */
function proposeRelocation(id: string, spot: WorldPoint) {
  const node = run.topology.nodes.find(n => n.id === id);
  if (!node || !playable()) return;
  const trial = relocateNode(structuredClone(run), id, spot.x, spot.z);
  if (!trial.ok) {
    dropRelocation();
    toast(trial.message, "error");
    sound.effect("error");
    render();
    return;
  }
  pendingMove = { id, x: spot.x, z: spot.z, origin: zoneForNode(node), destination: zoneForNode(spot) };
  render(false);
  document.querySelector<HTMLElement>("[data-relocate-confirm]")?.focus({ preventScroll: true });
  sound.effect("select");
}
let relocationHtml = "";
/** While a relocation waits, the table shows the run with the device moved (routes, channels, forecast
 * marks), its band lights, and the plate asks beside it. render() calls this; it never half-keeps a move. */
function showRelocation() {
  const move = pendingMove;
  if (!move) return;
  if (!playable() || !run.topology.nodes.some(n => n.id === move.id)) { dropRelocation(); return; }
  const next = movedRun(move.id, move.x, move.z), after = combatPreview(next);
  if (world) { syncWorld(world, next, after, worldView(), { rebuild: true }); world.setZonePreview(move.destination); }
  let plate = document.getElementById("relocate-confirm");
  if (!plate) {
    plate = document.createElement("div");
    plate.id = "relocate-confirm";
    plate.className = "relocate-plate";
    plate.setAttribute("role", "dialog");
    root.append(plate);
  }
  plate.setAttribute("aria-label", `Relocate ${move.id.toUpperCase()} from ${bandName(move.origin)} to ${bandName(move.destination)} for ${RULES.relocateCost} energy`);
  const html = relocationMarkup(move.id, move.origin, move.destination, combatPreview(run), after, false)
    + `<div class="relocate-actions"><button data-relocate-confirm>Relocate <kbd>Enter</kbd></button><button data-relocate-cancel>Cancel <kbd>Esc</kbd></button></div>`;
  // Rewritten only when the reading changes, so a focused button keeps its focus.
  if (html !== relocationHtml) { plate.innerHTML = html; relocationHtml = html; }
  // A faint ring keeps the socket it would leave: Cancel puts it back there.
  let mark = document.getElementById("relocate-origin");
  if (!mark) { mark = document.createElement("div"); mark.id = "relocate-origin"; mark.setAttribute("aria-hidden", "true"); root.append(mark); }
  const place = () => {
    const from = run.topology.nodes.find(n => n.id === pendingMove?.id);
    if (from) placeOriginMark(mark, from.x, from.z);
    if (pendingMove) placeRelocationPlate(plate, pendingMove.x, pendingMove.z);
  };
  place();
  // The plate follows its device while the camera settles or zooms.
  if (!relocateFrame) {
    const follow = () => {
      if (!pendingMove || !plate.isConnected) { relocateFrame = 0; return; }
      place();
      relocateFrame = requestAnimationFrame(follow);
    };
    relocateFrame = requestAnimationFrame(follow);
  }
}
/** The origin ring: the socket's footprint projected onto the table (a perspective ellipse). */
function placeOriginMark(mark: HTMLElement, x: number, z: number) {
  if (!world) return;
  const scale = interfaceScale(), box = root.getBoundingClientRect(), r = .72;
  const [west, east, north, south] = [[x - r, z], [x + r, z], [x, z - r], [x, z + r]].map(([px, pz]) => world!.screenFromPoint(px, pz, 0));
  const width = Math.hypot(east.x - west.x, east.y - west.y) / scale, height = Math.abs(south.y - north.y) / scale;
  mark.style.left = `${Math.round(((west.x + east.x) / 2 - box.left) / scale - width / 2)}px`;
  mark.style.top = `${Math.round(((north.y + south.y) / 2 - box.top) / scale - height / 2)}px`;
  mark.style.width = `${Math.round(width)}px`;
  mark.style.height = `${Math.round(height)}px`;
}
function closeRelocationPlate() {
  document.getElementById("relocate-confirm")?.remove();
  document.getElementById("relocate-origin")?.remove();
  relocationHtml = "";
  cancelAnimationFrame(relocateFrame);
  relocateFrame = 0;
}
/** Forget the pending relocation: the plate goes and the table shows the run again. */
function dropRelocation() {
  if (!pendingMove) return;
  pendingMove = null;
  closeRelocationPlate();
  world?.setZonePreview(null);
  if (world && view === "run" && run.phase === "battle") syncWorld(world, run, combatPreview(run), worldView(), { rebuild: true });
}
/** Cancel (Esc, Z, right-click, a click elsewhere): the device stays where it stood. */
function cancelRelocation(audible = true) {
  if (!pendingMove) return;
  dropRelocation();
  render(false);
  if (audible) sound.effect("undo");
}
/** Relocate: the rules check the move again (energy included); it lands like any action — undoable,
 * with the move cue, the band's pulse and the toast. */
function confirmRelocation() {
  const move = pendingMove;
  if (!move || !playable()) return;
  pendingMove = null;
  closeRelocationPlate();
  if (!playAction(() => relocateNode(run, move.id, move.x, move.z), "move")) { clearSelection(); render(); return; }
  if (move.origin === move.destination) return;
  world?.pulseZone(move.destination, "move");
  toast(`${move.id.toUpperCase()} · ${move.origin.toUpperCase()} → ${move.destination.toUpperCase()} · ${RULES.relocateCost} energy · ${zoneDescription(run, move.destination)}`);
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
function floatText(text: string, good: boolean, kind = "", anchored = false) {
  const el = document.createElement("span");
  el.className = `damage-number ${good ? "outgoing" : "incoming"} ${kind}`;
  el.textContent = text;
  const layer = $("#impact-layer");
  // Numbers born in the same beat at the same spot ("2 blocked", "installation planted") stack
  // one under the other instead of printing over each other.
  if (!anchored) {
    const now = performance.now(), side = good ? "outgoing" : "incoming";
    const recent = Array.from(layer.querySelectorAll<HTMLElement>(`.damage-number.${side}[data-born]`)).filter(item => now - Number(item.dataset.born) < 900).length;
    el.dataset.born = String(now);
    if (recent) el.style.marginTop = `${recent * 1.05}em`;
  }
  layer.append(el);
  window.setTimeout(() => el.remove(), 1500);
}
/** Transmit: resolve the turn on a copy, play the enemy phase from its forecast (battle-playback.ts),
 * then commit. The generation guard abandons a playback when the battle changes under it. */
function transmit(instant = false) {
  if (!playable()) return;
  if (lessonBlocks({ kind: "transmit" })) return;
  const generation = ++battleGeneration;
  clearSelection();
  busy = true;
  undoStack.length = 0;
  const before = run, next = structuredClone(run),
    result = endTurn(next);
  if (!practice) devTools?.afterTurn(next, result);
  const reshuffle = reshuffled(run, next);
  render(false);
  const commit = () => {
    run = next;
    expedition!.run = run;
    busy = false;
    delete root.dataset.enemyAction;
    if (practice) practice.last = result;
    updateLesson();
    save();
    render();
  };
  if (instant && IS_PLAYGROUND) { commit(); return; }
  playTurn({
    world, before, next, result, reshuffle,
    fast: devTools?.settings.fast ?? preferences.fast,
    motion: sound.settings.motion,
    alive: () => generation === battleGeneration,
    commit,
    hooks: {
      sound: (kind, options) => sound.effect(kind, options),
      toast,
      floatText: (text, good, kind = "", port) => {
        const at = port ? world?.portScreen(port) : null;
        floatText(text, good, kind, !!at);
        const layer = $("#impact-layer"), number = layer.lastElementChild as HTMLElement | null;
        if (!at || !number) return;
        // Over its hostile: numbers for several ports stack side by side instead of on one spot.
        const box = layer.getBoundingClientRect();
        number.style.left = `${(at.x - box.left) / box.width * 100}%`;
        number.style.top = `${(at.y - box.top) / box.height * 100}%`;
        number.style.marginLeft = `${-number.offsetWidth / 2}px`;
      },
      render: rebuild => render(rebuild),
      showPortHit: (port, hp, maxHp) => { battleUi.showPortHit(port, hp, maxHp); hostileCards.showPlateHit(port, hp, maxHp); },
      data: (key, value) => { if (value === null) delete root.dataset[key]; else root.dataset[key] = value; },
      shake: () => {
        root.classList.remove("shake");
        void root.offsetWidth;
        if (sound.settings.motion) root.classList.add("shake");
      },
      flash: () => {
        const flash = $("#battle-flash");
        flash.classList.remove("active");
        void flash.offsetWidth;
        flash.classList.add("active");
      },
    },
  });
}

/** Playground transactions stay at the application boundary; combat rules never
 * read a dev flag and the regular expedition/records keys are never written here. */
function devMutate(change: (state: RunState) => void, message: string): boolean {
  if (!IS_PLAYGROUND || busy || practice || dialog.open) return false;
  const next = structuredClone(run);
  try { change(next); }
  catch (error) { toast((error as Error).message, "error"); return false; }
  if (run.phase === "battle") {
    undoStack.push(structuredClone(run));
    if (undoStack.length > 20) undoStack.shift();
  }
  run = next;
  expedition!.run = run;
  clearSelection();
  save();
  render();
  toast(message);
  return true;
}
function devReplace(next: Expedition): boolean {
  if (!IS_PLAYGROUND || busy || practice || dialog.open) return false;
  battleGeneration++;
  clearSelection();
  expedition = next;
  run = next.run;
  view = "run";
  undoStack.length = 0;
  handKey = "";
  hudRoom = "";
  terrainShown = "";
  revealedKey = "";
  announcedKey = "";
  hud.port = null;
  save();
  render();
  return true;
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
  if (name === "lesson-read" && practice) { acknowledgeLesson(); return; }
  if (name === "close") {
    closeModal();
    return;
  }
  if (name === "sound") {
    await sound.unlock();
    sound.update({ muted: !sound.settings.muted });
    render(false);
    announceTrack();
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
    // A guide opens in the dialog: leave the finished board first, so nothing of it waits behind.
    if (!next || next.kind === "walkthrough") finishPractice();
    if (next) openLesson(next.id);
    return;
  }
  if (name === "lesson-exit") { finishPractice(); return; }
  // The completion plate's Training menu leaves the lesson; the menu opens over what was parked.
  if (name === "lesson-training") { finishPractice(); openModal("training"); return; }
  if (name === "lesson-finish" || name === "lesson-finish-next") {
    training.markLessonComplete(training.WALKTHROUGH_LESSON);
    sound.effect("reward");
    const next = name === "lesson-finish-next" ? training.nextLesson(training.WALKTHROUGH_LESSON) : undefined;
    if (next) openLesson(next.id);
    else openModal("training");
    return;
  }
  if (name === "inspect-back" && inspectReturn) {
    modal = inspectReturn;
    $("#dialog-content").innerHTML = alpha.libraryMarkup(libraryRun ?? run, inspectReturn, libraryRarity, libraryQuery);
    dialog.className = "wide";
    dialog.querySelector(".dialog-surface")!.scrollTop = libraryScroll;
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
  if (name === "training-first" || name === "skip-training") {
    preferences.trainingOffered = true;
    storePreferences(preferences);
    closeModal();
    if (name === "training-first") openLesson(training.LESSONS[0].id);
    else chooseKeeper();
    return;
  }
  if (dialog.open && name !== "save-exit" && name !== "export") return;
  if (name === "new") {
    if (firstExpedition()) openModal("training-offer");
    else chooseKeeper();
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
  void sound.unlock().then(() => {
    if (audioStarted) return;
    audioStarted = true;
    announceTrack();
  });
  const button = target.closest<HTMLButtonElement>("button");
  if (button?.disabled) return;
  // The relocation plate answers its own buttons (and the dock's bands re-choose); any other click
  // withdraws the pending move first, and a click on Undo only withdraws it, like Z. The table answers
  // at pointerdown (below): the click that ends the drop itself must not cancel it.
  if (target.closest("[data-relocate-confirm]")) { confirmRelocation(); return; }
  if (target.closest("[data-relocate-cancel]")) { cancelRelocation(); return; }
  if (pendingMove && !target.closest("#relocate-confirm, [data-relocate-zone], #world")) {
    cancelRelocation(false);
    if (target.closest('[data-action="undo"]')) return;
  }
  const name = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (name) {
    void action(name);
    return;
  }
  const offer = target.closest<HTMLElement>("[data-offer]")?.dataset.offer;
  if (offer !== undefined && modal === "offer") { answerOffer(Number(offer)); return; }
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
  // The far rail: a hostile's plate or strip row targets it.
  if (!dialog.open) {
    const hostile = (target.closest<HTMLElement>(".hostile-plate[data-plate]")?.dataset.plate ?? target.closest<HTMLElement>(".port-row[data-port]")?.dataset.port) as Port | undefined;
    if (hostile) { clickHostile(hostile); return; }
    const demolishId = target.closest<HTMLElement>("[data-demolish]")?.dataset.demolish;
    if (demolishId) { selectInstallation(demolishId); return; }
  }
  // The dossier's rail: each hostile's plate opens its page in place.
  const dossierPort = target.closest<HTMLElement>("[data-dossier-port]")?.dataset.dossierPort as Port | undefined;
  if (dossierPort && modal === "enemy-dossier") {
    hud.port = livingEnemies(run).some(enemy => enemy.port === dossierPort) ? dossierPort : hud.port;
    $("#dialog-content").innerHTML = alpha.enemyDossierMarkup(run, dossierPort);
    sound.effect("select");
    return;
  }
  // From the Devices journal, scrub and repair keep the journal open (keyboard-only play can
  // scrub twice or repair then scrub); it re-renders with the new pips.
  // Field Training's lit mark over a thing on the table answers like the thing itself.
  const mark = target.closest<HTMLElement>("#intent-layer .table-anchor");
  if (mark) {
    if (mark.dataset.anchorInstallation) selectInstallation(mark.dataset.anchorInstallation);
    else if (mark.dataset.anchorNode) onNode(mark.dataset.anchorNode);
    return;
  }
  const scrubId = target.closest<HTMLElement>("[data-scrub]")?.dataset.scrub;
  const repairId = target.closest<HTMLElement>("[data-repair]")?.dataset.repair;
  if ((scrubId || repairId) && modal === "devices") {
    journalAction(() => scrubId ? scrub(scrubId) : repair(repairId!));
    return;
  }
  if (scrubId) {
    scrub(scrubId);
    return;
  }
  if (repairId) {
    repair(repairId);
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
    $("#dialog-content .collection-body").replaceWith(holder.querySelector(".collection-body")!);
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
    const silent = sound.settings.music === 0;
    sound.update({ [input.dataset.setting]: Number(input.value) / 100 });
    if (silent && sound.settings.music > 0) announceTrack();
    input.closest("label")!.querySelector("output")!.textContent =
      `${input.value}%`;
    input.style.setProperty("--value", `${input.value}%`);
  }
  if (input.dataset.setting === "motion")
    sound.update({ motion: input.checked });
  if (input.dataset.setting === "sound") {
    void sound.unlock();
    sound.update({ muted: !input.checked });
    render(false);
    announceTrack();
  }
  if (input.dataset.setting === "fullscreen")
    void action("fullscreen").then(() => { input.checked = !!document.fullscreenElement; });
});
// The Options switch follows fullscreen however it changed (Esc, F11, the switch itself).
document.addEventListener("fullscreenchange", () => {
  const toggle = document.querySelector<HTMLInputElement>('[data-setting="fullscreen"]');
  if (toggle) toggle.checked = !!document.fullscreenElement;
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeModal();
});
// Only a click on the darkened backdrop closes a panel; its painted frame belongs to the panel.
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeModal();
});
// While the relocation plate asks, a press on the table (either button) answers "no" and starts nothing:
// no second drag, click or orbit.
document.addEventListener("pointerdown", (event) => {
  if (!pendingMove || !(event.target as HTMLElement).closest?.("#world")) return;
  event.stopPropagation();
  event.preventDefault();
  cancelRelocation();
}, true);
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
    cardDrag.ghost.className = cardDrag.ghost.className.replace(/\b(is-zoomed|selected)\b/g, "") + " drag-ghost";
    cardDrag.ghost.removeAttribute("data-hand");
    root.append(cardDrag.ghost);
    hideCardZoom();
    world?.setPlacement(CARDS[run.hand[cardDrag.index]].role ?? null);
  }
  if (cardDrag.ghost) {
    // The ghost is drawn at the hand's card scale (CSS zoom), which also scales its own offsets.
    const origin = root.getBoundingClientRect(), scale = interfaceScale() * (Number.parseFloat(getComputedStyle(cardDrag.ghost).zoom) || 1);
    cardDrag.ghost.style.left = `${(event.clientX - origin.left) / scale}px`;
    cardDrag.ghost.style.top = `${(event.clientY - origin.top) / scale}px`;
    world?.previewAt(event.clientX, event.clientY);
  }
});
function cancelDrag() {
  document.getElementById("movement-preview")?.remove();
  world?.setZonePreview(pendingMove?.destination ?? null);
  const restorePreview = deviceDragging;
  deviceDragging = false;
  cardDrag?.ghost?.remove();
  cardDrag = null;
  world?.cancelInteraction?.();
  world?.setPlacement(null);
  if (restorePreview) world?.setBattle(run.topology, run.enemies, run.faultNodes, run.faultLinks);
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

// ------------------------------------------------------------ the pointed card, large
/* The pointed or keyboard-focused card in hand shows at about the reward size above the fan (Slay
 * the Spire style), as a copy in #card-zoom that takes no pointer: the fan's hit areas never move, so
 * the next card is always where it looks. The card rests unseen in its slot meanwhile. Its keyword,
 * cost and play-limit notes stand beside the copy (the fan's own parts carry no tooltips). */
let zoomCard: HTMLElement | null = null;
let zoomPointer: { x: number; y: number } | null = null;
/** The copy came from the keyboard (Tab onto a card): only then does a render bring it back for focus. */
let zoomByKeys = false;
const handCard = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>("#hand-zone [data-hand]") ?? null;
function hideCardZoom() {
  const layer = document.getElementById("card-zoom");
  zoomCard?.classList.remove("is-zoomed");
  zoomCard = null;
  zoomByKeys = false;
  if (layer?.classList.contains("is-shown")) { layer.classList.remove("is-shown"); layer.replaceChildren(); }
}
/** The card's own tooltips (keywords, a modified cost, Kernel Panic's limit) as plates. */
function zoomNotes(card: HTMLElement): string {
  return Array.from(card.querySelectorAll<HTMLElement>("[data-tooltip]")).filter(el => !el.closest(".card-footer")).map(el => {
    const text = el.dataset.tooltip ?? "", named = /^([^:.]{2,24}): (.+)$/s.exec(text);
    const keyword = Array.from(el.classList).find(name => name.startsWith("kw-")) ?? "";
    const tone = el.classList.contains("card-cost") ? ` is-cost${el.classList.contains("is-up") ? " is-up" : ""}` : el.classList.contains("card-limit") ? " is-limit" : "";
    const title = named?.[1] ?? (el.classList.contains("card-cost") ? "Cost this turn" : ""), body = named?.[2] ?? text;
    return `<p class="zoom-tip ${keyword}${tone}">${title ? `<b>${ui.esc(title)}</b>` : ""}${ui.esc(body)}</p>`;
  }).join("");
}
function showCardZoom(card: HTMLElement, keyboard = false) {
  const layer = document.getElementById("card-zoom");
  if (!layer || !card.isConnected || busy || cardDrag || deviceDragging || dialog.open || card.classList.contains("selected")) { hideCardZoom(); return; }
  const fresh = !layer.classList.contains("is-shown");
  if (card !== zoomCard || fresh) {
    zoomCard?.classList.remove("is-zoomed");
    // The same face as a silent plate: no hand index, no tooltips, not a button.
    const copy = document.createElement("div");
    copy.className = card.className.replace(/\b(is-zoomed|selected)\b/g, "").trim();
    copy.setAttribute("style", card.getAttribute("style") ?? "");
    copy.dataset.cardId = card.dataset.cardId;
    copy.innerHTML = card.innerHTML;
    copy.querySelectorAll("[data-tooltip]").forEach(el => el.removeAttribute("data-tooltip"));
    const notes = zoomNotes(card);
    layer.replaceChildren(copy);
    if (notes) layer.insertAdjacentHTML("beforeend", `<div class="zoom-tips">${notes}</div>`);
    layer.classList.add("is-shown");
    zoomCard = card;
  }
  // Over its slot with its foot on the hand band, inside the visible part of the table (a short
  // window scrolls the table), shrunk only if the window is shorter than the card.
  const scale = interfaceScale(), origin = root.getBoundingClientRect(), app = $("#app").getBoundingClientRect();
  const view = {
    left: (Math.max(app.left, 0) - origin.left) / scale, right: (Math.min(app.right, innerWidth) - origin.left) / scale,
    top: (Math.max(app.top, 0) - origin.top) / scale, bottom: (Math.min(app.bottom, innerHeight) - origin.top) / scale,
  };
  layer.style.removeProperty("--card-scale");
  const edge = 8, wanted = Number.parseFloat(getComputedStyle(layer).getPropertyValue("--card-scale")) || 1;
  const size = Math.min(wanted, (view.bottom - view.top - 2 * edge) / 355);
  layer.style.setProperty("--card-scale", size.toFixed(3));
  const w = 230 * size, h = 355 * size, box = card.getBoundingClientRect();
  const band = $("#hand-zone").getBoundingClientRect();
  const slot = { left: (box.left - origin.left) / scale, top: (box.top - origin.top) / scale, width: box.width / scale };
  const left = Math.max(view.left + edge, Math.min(view.right - edge - w, slot.left + slot.width / 2 - w / 2));
  const top = Math.max(view.top + edge, Math.min(view.bottom - edge, (band.bottom - origin.top) / scale) - h);
  layer.style.left = `${left}px`;
  layer.style.top = `${top}px`;
  layer.classList.toggle("tips-left", left + w + 256 > view.right && left - 256 >= view.left);
  layer.classList.toggle("via-keyboard", keyboard);
  zoomByKeys = keyboard;
  card.classList.add("is-zoomed");
  if (fresh && sound.settings.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    layer.animate([
      { transform: `translate(${slot.left - left}px, ${slot.top - top}px) scale(${(slot.width / w).toFixed(3)})`, opacity: 0.5 },
      { transform: "none", opacity: 1 },
    ], { duration: 130, easing: "cubic-bezier(.2,.8,.3,1)" });
}
/** After a render (the hand may be rebuilt, a card chosen or played): show the card now under the
 * pointer or holding the keyboard focus, or nothing. */
function syncCardZoom() {
  const pointed = zoomPointer ? handCard(document.elementFromPoint(zoomPointer.x, zoomPointer.y)) : null;
  const focused = zoomByKeys ? handCard(document.activeElement) : null;
  const card = pointed ?? (focused?.matches(":focus-visible") ? focused : null);
  if (card) showCardZoom(card, !pointed);
  else hideCardZoom();
}
document.addEventListener("pointerover", (event) => {
  const card = event.pointerType === "touch" ? null : handCard(event.target);
  zoomPointer = card ? { x: event.clientX, y: event.clientY } : null;
  if (card) { if (card !== zoomCard) showCardZoom(card); }
  else if (zoomCard) syncCardZoom();
});
document.addEventListener("pointermove", (event) => { if (zoomPointer) zoomPointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
document.addEventListener("mouseout", (event) => { if (!event.relatedTarget) { zoomPointer = null; syncCardZoom(); } });
document.addEventListener("pointerdown", (event) => { if (handCard(event.target)) { zoomPointer = null; hideCardZoom(); } }, true);
document.addEventListener("focusin", (event) => {
  const card = handCard(event.target);
  if (card?.matches(":focus-visible")) showCardZoom(card, true);
  else if (zoomCard && !zoomPointer) hideCardZoom();
});
document.addEventListener("focusout", (event) => { if (handCard(event.target) === zoomCard && !zoomPointer) hideCardZoom(); });
$("#app").addEventListener("scroll", () => { if (zoomCard) syncCardZoom(); }, { passive: true });
window.addEventListener("resize", () => { if (zoomCard) syncCardZoom(); });
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
  // A message waits for its answer: 1, 2, 3 choose.
  if (dialog.open && modal === "offer") {
    if (/^[1-9]$/.test(event.key) && dialog.querySelector(`[data-offer="${Number(event.key) - 1}"]`)) {
      event.preventDefault();
      answerOffer(Number(event.key) - 1);
    }
    return;
  }
  if (event.target instanceof HTMLInputElement || dialog.open) return;
  // The relocation plate asks first: Enter relocates, Esc or Z cancels. A focused button keeps Enter and
  // Space (the plate's own answer it); any other command key withdraws the move and goes on.
  if (pendingMove) {
    const key = event.key.toLowerCase(), el = event.target as HTMLElement;
    if (key === "escape" || key === "z") { event.preventDefault(); cancelRelocation(); return; }
    if (key === "enter" && !(el instanceof HTMLButtonElement)) { event.preventDefault(); confirmRelocation(); return; }
    if ((key === "enter" || key === " ") && el.closest?.("#relocate-confirm")) return;
    if (key === "enter" || key.length === 1) cancelRelocation(false);
  }
  if (event.key.toLowerCase() === "i") {
    const card = ((event.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId ?? (selected !== null ? run.hand[selected] : undefined)) as CardId | undefined;
    if (card) { event.preventDefault(); inspectCard(card); return; }
  }
  // Menus answer the arrow keys: up/down walks the main menu, left/right turns the keepers.
  if (view === "title" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>(".title-menu button"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
    return;
  }
  if (view === "select" && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !(event.target as HTMLElement).closest(".ascension-panel")) {
    const ids = Object.keys(ARCHETYPES) as Archetype[];
    const next = ids[(ids.indexOf(archetype) + (event.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length];
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-archetype="${next}"]`)?.click();
    document.querySelector<HTMLElement>(`[data-archetype="${next}"]`)?.focus();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (selected !== null || selectedNode || deviceDragging || cardDrag || consoleTargeting || hud.installation || hud.demolition) {
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
  if (tableKey(event)) return;
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
/** Targeting and table-front keys (13.8): F cycles the target, R repair, S scrub. */
function tableKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  if (!["f", "r", "s"].includes(key)) return false;
  event.preventDefault();
  const living = livingEnemies(run).map(enemy => enemy.port);
  if (key === "f") {
    if (living.length > 1) {
      const focus = effectiveFocus(run);
      focusPort(living[(living.indexOf(focus ?? living[0]) + 1) % living.length]);
    }
    return true;
  }
  if (key === "r") {
    const chosen = selectedNode && run.topology.nodes.find(node => node.id === selectedNode);
    const node = chosen && isWorn(chosen) ? chosen : chosen ? null : mostWornDevice();
    if (chosen && !node) { toast(`${chosen.id.toUpperCase()} is at full condition.`); sound.effect("error"); return true; }
    if (!node) { toast("Nothing on the table is worn."); return true; }
    if (!chosen) toast(`Repair · ${node.id.toUpperCase()} (most worn) · ${repairCost(run)} energy · Z undoes`);
    repair(node.id);
    return true;
  }
  const item = (hud.installation && run.installations.find(entry => entry.id === hud.installation)) || mostDangerous(run);
  if (!item) { toast("No installation stands on the table."); return true; }
  if (!hud.installation) toast(`Scrub · ${INSTALLATION_NAMES[item.kind]} in ${zoneForNode(item).toUpperCase()} (most dangerous) · ${scrubCost(run)} energy · Z undoes`);
  scrub(item.id);
  return true;
}
function inspectCard(id: CardId) {
  if (busy || !CARDS[id]) return;
  clearSelection();
  render(false);
  if (modal !== "inspect") {
    inspectReturn = alpha.LIBRARY_MODES.includes(modal) ? modal as alpha.LibraryMode : null;
    libraryScroll = inspectReturn ? dialog.querySelector(".dialog-surface")!.scrollTop : 0;
  }
  modal = "inspect";
  $("#dialog-content").innerHTML = alpha.inspectMarkup(id, inspectReturn ? libraryRun ?? run : run, inspectReturn);
  dialog.className = "wide inspect-dialog";
  resetDialogScroll();
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
    resetDialogScroll();
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
  clearTimeout(lessonEndTimer);
  const parked = practice
    ? { expedition: practice.expedition, run: practice.run, view: practice.view, undo: practice.undo }
    : { expedition, run, view, undo: undoStack.map(state => structuredClone(state)) };
  const lessonRun = training.createLessonRun(id);
  // Short screens start with the coach folded to its current goal; it expands on demand.
  const short = root.getBoundingClientRect().height / interfaceScale() < 780;
  practice = { id, ...parked, progress: null, showHint: false, collapsed: practice?.collapsed ?? short, read: [], plate: false };
  expedition = { version: EXPEDITION_VERSION, run: lessonRun, archetype: lessonRun.archetype, startedAt: Date.now(), recorded: true };
  run = lessonRun;
  view = "run";
  busy = false;
  battleGeneration++;
  undoStack.length = 0;
  clearSelection();
  // A drill starts unread: no port carried over from another board.
  hud.port = null;
  lessonViewKey = "";
  handKey = "";
  world?.resetCamera();
  practice.progress = training.lessonProgress(id, run, undefined, undefined, lessonView());
  render();
  armHint();
  sound.effect("turn");
}
function finishPractice() {
  if (!practice) { if (dialog.open) closeModal(); return; }
  cancelDrag();
  clearTimeout(hintTimer);
  clearTimeout(lessonEndTimer);
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
  const progress = training.lessonProgress(practice.id, run, practice.last, before ?? undefined, lessonView());
  const done = (p: training.LessonProgress | null) => p ? p.goals.filter(goal => goal.done).length : -1;
  practice.progress = progress;
  if (done(progress) > done(before)) {
    practice.showHint = false;
    armHint();
    // An objection belongs to the step it stopped: once the drill moves on, it goes.
    const note = document.getElementById("toast");
    if (note?.classList.contains("coach")) note.className = "";
  }
  if (progress.complete && !before?.complete) {
    training.markLessonComplete(practice.id);
    clearTimeout(hintTimer);
    endLesson();
  }
}
/** The last goal is met: the lesson is over. The board freezes at once (playable() refuses every
 * move, the scrim takes the pointer, nothing can be undone into it), and after a beat, so the final
 * transmission's numbers or the last card's effect can land, the completion plate rises. */
function endLesson() {
  if (!practice) return;
  undoStack.length = 0;
  root.classList.add("lesson-over");
  sound.effect("reward", { delay: .35 });
  const lesson = practice, generation = battleGeneration;
  clearTimeout(lessonEndTimer);
  lessonEndTimer = window.setTimeout(() => {
    if (practice !== lesson || generation !== battleGeneration || !lesson.progress?.complete) return;
    lesson.plate = true;
    renderLesson();
    document.querySelector<HTMLElement>(".lesson-end [data-autofocus]")?.focus({ preventScroll: true });
  }, sound.settings.motion && !preferences.fast ? 1100 : 300);
}
/** The lesson layer: the coach panel, and once the lesson is over the scrim and its completion plate. */
function lessonMarkup(): string {
  if (!practice?.progress) return "";
  return training.lessonPanelMarkup(practice.progress, { showHint: practice.showHint, collapsed: practice.collapsed })
    + training.lessonEndMarkup(practice.progress, practice.plate);
}
// Browser tests read the drill's state (lesson runs are never saved). Dev server only.
if (testHooks) (globalThis as { __faultlineLesson?: unknown }).__faultlineLesson = () => practice && {
  id: practice.id, turn: run.turn, focus: effectiveFocus(run),
  deliveries: run.phase === "battle" && run.enemies.length ? combatPreview(run).deliveries.map(item => ({ key: item.channelKey, port: item.port })) : [],
  step: practice.progress?.current ?? 0, complete: !!practice.progress?.complete, plate: practice.plate,
};
/** What the lessons read beyond the run: the selected port, the lifted card and the reading steps acknowledged. */
function lessonView(): training.LessonView {
  return { port: hud.port, read: practice?.read ?? [], selected: selected !== null ? run.hand[selected] ?? null : null };
}
let lessonViewKey = "";
/** Selection is reading, not a move, so no action recomputes the lesson: a step met by
 * selecting (or reading) moves on here, on the render that shows the selection. */
function syncLessonView() {
  if (!practice?.progress || view !== "run") return;
  const key = `${practice.id}|${hud.port}|${practice.read.join(",")}|${selected !== null ? run.hand[selected] : ""}`;
  if (key === lessonViewKey) return;
  lessonViewKey = key;
  const before = practice.progress;
  updateLesson();
  if (practice.progress !== before && root.classList.contains("is-battle")) patchLessonLayer(lessonMarkup());
}
/** A reading step is done: "Got it" in the panel, or a click on the spotlit control. */
function acknowledgeLesson() {
  const progress = practice?.progress;
  const goal = progress?.goals[progress.current];
  if (!practice || !progress?.reading || !goal || busy || practice.read.includes(goal.id)) return;
  practice.read.push(goal.id);
  updateLesson();
  renderLesson();
  railHand();
  sound.effect("select");
}
// A click on the spotlit control of a reading step reads it, and does nothing else: captured before
// the table's own handlers, so clicking a spotlit hostile never also tries to target it.
document.addEventListener("click", event => {
  if (!practice?.progress?.reading || dialog.open || busy) return;
  const target = event.target as HTMLElement;
  if (!target.closest(".lesson-focus") || target.closest("#lesson-layer")) return;
  event.stopPropagation();
  acknowledgeLesson();
}, { capture: true });
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
  patchLessonLayer(view === "run" && root.classList.contains("is-battle") ? lessonMarkup() : "");
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
// A relocation's confirm plate is a step's control too (drag, then confirm): when it opens or
// closes, the spotlight moves to it or back, whoever rendered it.
let relocateAsking = false;
new MutationObserver(() => {
  const asking = !!document.getElementById("relocate-confirm");
  if (asking === relocateAsking) return;
  relocateAsking = asking;
  if (practice) spotlightLesson();
}).observe(root, { childList: true, subtree: true });
/** The coach panel fills the left column down to the compact vitals card. */
/** Field Training points at the control its current step needs (e.g. the Prepare slot).
 * `A || B` falls back to B while nothing matching A is on screen. */
function spotlightLesson() {
  syncLessonView();
  const focus = (!busy && root.classList.contains("is-battle") && practice?.progress?.focus) || "";
  let targets: Element[] = [];
  try {
    for (const tier of focus.split("||").map(part => part.trim()).filter(Boolean)) {
      targets = Array.from(document.querySelectorAll(tier));
      if (targets.some(onScreen)) break;
    }
  } catch { targets = []; /* A malformed selector must never break the lesson. */ }
  // Leave elements that keep the spotlight untouched: re-adding the class would not
  // restart the pulse, but removing and re-adding it every render did.
  document.querySelectorAll(".lesson-focus").forEach(el => { if (!targets.includes(el)) el.classList.remove("lesson-focus"); });
  for (const el of targets) el.classList.add("lesson-focus");
  // The dimmer cuts a hole around the one control the step needs. It rests while the
  // player is mid-action — targeting, dragging or reading a dialog — and glides when
  // the step moves on.
  const overlay = $("#lesson-spotlight"), hole = overlay.firstElementChild as HTMLElement;
  const shown = targets.filter(onScreen);
  // One control, or (a spread step) every match: the three hostiles' badges in one band.
  const lit = practice?.progress?.spread ? shown : shown.slice(0, 1);
  const target = lit[0];
  // A lifted card rests the dimmer, unless the step points past the hand at what the card targets.
  const resting = (selected !== null && !!target?.closest("#hand-zone")) || consoleTargeting || !!cardDrag || deviceDragging || dialog.open;
  cancelAnimationFrame(spotlightFrame);
  if (!target || resting) { overlay.classList.remove("active"); return; }
  const fresh = !overlay.classList.contains("active");
  if (fresh) hole.style.transition = "none";
  placeSpotlight(hole, lit);
  if (fresh) { void hole.offsetWidth; hole.style.transition = ""; }
  overlay.classList.add("active");
  // Badges over the rail follow the 3D table every frame; the hole follows them while they are lit.
  if (lit.some(el => el.closest("#intent-layer"))) {
    const follow = () => {
      if (!overlay.classList.contains("active") || !lit.every(el => el.isConnected)) return;
      placeSpotlight(hole, lit);
      spotlightFrame = requestAnimationFrame(follow);
    };
    spotlightFrame = requestAnimationFrame(follow);
  }
}
/** Laid out and visible (fixed-position overlays included, which have no offsetParent). */
function onScreen(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}
/** Cut the dimmer's hole around the lit controls (their joint box). */
function placeSpotlight(hole: HTMLElement, lit: readonly HTMLElement[]) {
  const scale = interfaceScale(), origin = root.getBoundingClientRect();
  // A hostile's next move lights its whole plate (name and health with it).
  const boxes = lit.map(el => (el.closest("#intent-layer .hostile-plate") ?? el).getBoundingClientRect());
  const rect = {
    left: Math.min(...boxes.map(box => box.left)), top: Math.min(...boxes.map(box => box.top)),
    right: Math.max(...boxes.map(box => box.right)), bottom: Math.max(...boxes.map(box => box.bottom)),
  };
  const width = rect.right - rect.left, height = rect.bottom - rect.top;
  // A tiny control still gets a hole the eye finds: at least 40 px a side.
  const padX = Math.max(9, (40 - width / scale) / 2), padY = Math.max(9, (40 - height / scale) / 2);
  hole.style.left = `${(rect.left - origin.left) / scale - padX}px`;
  hole.style.top = `${(rect.top - origin.top) / scale - padY}px`;
  hole.style.width = `${width / scale + padX * 2}px`;
  hole.style.height = `${height / scale + padY * 2}px`;
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
/** The title card sits in the band between the header and the hand (its target hint), centred in
 * it, and tightens (smaller type, closer lines) when that band is short, so it never covers them. */
function placeTerrainTitle(el: HTMLElement) {
  const hand = document.querySelector<HTMLElement>(".is-battle .target-hint, .is-battle #hand-zone")?.getBoundingClientRect();
  const header = document.querySelector<HTMLElement>("#header")?.getBoundingClientRect();
  if (!hand?.height) return;
  const scale = interfaceScale(), box = root.getBoundingClientRect();
  const ceiling = Math.max(0, ((header?.bottom ?? box.top) - box.top) / scale) + 6;
  const floor = (hand.top - box.top) / scale - 10;
  el.classList.add("is-placed");
  if (el.offsetHeight > floor - ceiling) el.classList.add("is-compact");
  if (el.offsetHeight > floor - ceiling) el.classList.add("is-tight");
  el.style.top = `${Math.round(Math.max(ceiling, ceiling + (floor - ceiling - el.offsetHeight) / 2))}px`;
}
/** A brief title card naming the encounter ground, once per fresh battle, with the
 *  entrance lines beneath it: the revealed designation and an announced reinforcement. */
function showTerrainTitle() {
  if (practice || run.phase !== "battle") return;
  const title = screens.terrainTitleMarkup(run);
  if (!title) return;
  const key = `${run.seed}:${run.stage}:${run.currentRoom}`;
  if (terrainShown === key) return;
  terrainShown = key;
  if (run.turn !== 1 || run.cardsPlayed) return;
  document.querySelector(".terrain-title")?.remove();
  const el = document.createElement("div");
  el.className = `terrain-title${title.lines ? " has-entrance" : ""}`;
  el.setAttribute("role", "status");
  el.innerHTML = title.html;
  root.append(el);
  // Placed once the HUD of this render exists (the seals it must clear), before the frame paints.
  queueMicrotask(() => placeTerrainTitle(el));
  // A short beat: it leaves on its own, or the moment the player acts. Entrance lines hold it longer.
  const dismiss = () => { el.classList.add("leaving"); window.setTimeout(() => el.remove(), 260); };
  const timer = window.setTimeout(dismiss, title.lines ? 5600 : 3600);
  const early = () => { window.clearTimeout(timer); dismiss(); };
  document.addEventListener("pointerdown", early, { once: true, capture: true });
  document.addEventListener("keydown", early, { once: true, capture: true });
}
// No browser menu anywhere in the game: right-click inspects a card, and does nothing elsewhere.
document.addEventListener("contextmenu", event => {
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea")) return;
  event.preventDefault();
  cancelRelocation();
  const id = target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId as CardId | undefined;
  if (id) inspectCard(id);
});
// Artwork is part of the table, not a draggable web image.
document.addEventListener("dragstart", event => event.preventDefault());
function hideTooltip() { $("#game-tooltip").className = ""; }
/** "Name: rules" tips get a nameplate line; everything else is plain reading text. */
function tooltipMarkup(text: string) {
  const named = /^([^:.]{2,30}): (.+)$/s.exec(text);
  return named ? `<b>${ui.esc(named[1])}</b>${ui.esc(named[2])}` : ui.esc(text);
}
function showTooltip(target: HTMLElement) {
  const tip = target.closest<HTMLElement>("[data-tooltip]");
  if (!tip || dialog.open) { hideTooltip(); return; }
  const el = $("#game-tooltip");
  el.innerHTML = tooltipMarkup(tip.dataset.tooltip || "");
  el.className = "visible";
  // Below the control when it fits, otherwise above it; always inside the window.
  const box = tip.getBoundingClientRect(), gap = 12, edge = 10;
  const scale = interfaceScale(), width = window.innerWidth / scale, height = window.innerHeight / scale;
  const origin = root.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, centre = (box.x + box.width / 2) / scale;
  const below = box.bottom / scale + gap, above = box.top / scale - gap - h;
  const flip = below + h > height - edge && above >= edge;
  const left = Math.max(edge, Math.min(width - w - edge, centre - w / 2));
  const top = flip ? above : Math.max(edge, Math.min(height - h - edge, below));
  el.dataset.side = flip ? "above" : "below";
  el.style.setProperty("--arrow-x", `${Math.max(12, Math.min(w - 12, centre - left))}px`);
  el.style.left = `${left - origin.left / scale}px`;
  el.style.top = `${top - origin.top / scale}px`;
}
$("#app").addEventListener("scroll", hideTooltip);
document.addEventListener("pointerover", e => showTooltip(e.target as HTMLElement));
document.addEventListener("focusin", e => showTooltip(e.target as HTMLElement));
document.addEventListener("pointerdown", hideTooltip);
document.addEventListener("focusout", hideTooltip);

/** Boot: the veil in index.html holds until the typefaces and the first panorama
 *  are ready, so no text ever appears in a fallback face and no art pops in.
 *  It never waits longer than a moment. */
async function boot() {
  if (IS_PLAYGROUND) {
    const playground = await import("./dev/panel.ts");
    const fresh = !expedition;
    expedition ??= playground.loadScenario("parallel");
    run = expedition.run;
    view = "run";
    tutorial = false;
    devTools = playground.mountDevTools({
      current: () => expedition!, mutate: devMutate, replace: devReplace,
      selectCard: chooseCard, selectNode: onNode, step: () => transmit(true), notify: message => toast(message, "error"),
    });
    if (fresh) { devTools.afterAction(run); devTools.checkpoint(); }
    save();
  }
  const faces = ["500 16px Cinzel", "600 16px Grenze", "16px Alegreya", "italic 16px Alegreya", "700 12px 'Alegreya Sans SC'"];
  const panorama = new Image();
  panorama.src = `${import.meta.env.BASE_URL}art/${STAGES[0].art.panorama}`;
  await Promise.race([
    Promise.allSettled([...faces.map(face => document.fonts.load(face)), panorama.decode()]),
    new Promise(resolve => window.setTimeout(resolve, 2500)),
  ]);
  render();
  const veil = document.getElementById("boot");
  if (veil) {
    veil.classList.add("done");
    window.setTimeout(() => veil.remove(), 700);
  }
}
void boot();
