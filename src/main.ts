import "./style.css";
import { Soundscape, TRACK_NAMES, type ScoreScene } from "./audio.ts";
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
  signalPaths,
  type ActionResult,
} from "./core/run.ts";
import type { CardId, RelicId, RunState } from "./core/types.ts";
import { World, type WorldPoint } from "./three/World.ts";
import * as ui from "./ui.ts";

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
let beforeDrag: RunState | null = null;
let tutorial = true;
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
const undoStack: RunState[] = [];
try {
  tutorial = localStorage.getItem("faultline-guide-dismissed") !== "true";
} catch {
  /* Show first-run guide. */
}

$("#app").innerHTML =
  `<main class="game-root"><div class="scene-backdrop"></div><div class="scene-shade"></div><div class="motes" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 47) % 100}%;--duration:${14 + (i % 8) * 3}s;--delay:-${i * 2.7}s;--size:${(i % 3) + 1}px"></i>`).join("")}</div><div class="world-stage"><canvas id="world" aria-label="Network battlefield. Use cards and the device targeting controls to build your route."></canvas></div><div class="texture"></div><header id="header" class="game-header"></header><div id="screen"></div><div id="battle-hud"></div><div id="hand-zone"></div><div id="target-dock"></div><div id="impact-layer" aria-hidden="true"></div><div id="battle-flash"></div><div id="toast" role="status" aria-live="polite"></div><div class="now-playing" id="now-playing"></div></main><dialog id="dialog"><div class="dialog-surface"><button class="dialog-close" data-action="close" aria-label="Close dialog">${ui.icon("close", 22)}</button><div id="dialog-content"></div></div></dialog>`;
const root = $(".game-root"),
  dialog = $<HTMLDialogElement>("#dialog");
sound.update({});
sound.onUnavailable = () => {
  $("#now-playing").textContent = "Music could not load";
};
function save() {
  if (!expedition) return;
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
  return view === "run" && run.phase === "battle"
    ? run.enemy?.id === "core"
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
  selected = null;
  source = null;
  selectedNode = null;
  world?.setPlacement(null);
  world?.setSelected(null);
}
function playable() {
  return view === "run" && run.phase === "battle" && !busy && !dialog.open;
}
function render(rebuild = true) {
  const battle = view === "run" && run.phase === "battle";
  root.dataset.view = view === "run" ? run.phase : view;
  root.classList.toggle("is-battle", battle);
  root.classList.toggle("busy", busy);
  $("#header").innerHTML = ui.headerMarkup(
    expedition,
    view === "title" || view === "select",
    sound.settings,
  );
  if (battle) {
    ensureWorld();
    if (rebuild)
      world?.setBattle(run.topology, run.enemy, run.faultNode, run.faultLink);
  }
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
  $("#battle-hud").innerHTML = battle
    ? ui.battleMarkup(
        expedition!,
        selected,
        source,
        busy,
        tutorial,
        undoStack.length > 0,
      )
    : "";
  const signature = battle
    ? `${run.currentRoom}|${run.turn}|${run.energy}|${run.firstFiberPlayed}|${run.hand.join(",")}`
    : "";
  if (signature !== handKey) {
    $("#hand-zone").innerHTML = battle ? ui.handMarkup(run, selected) : "";
    handKey = signature;
  } else if (battle)
    document
      .querySelectorAll<HTMLElement>("[data-hand]")
      .forEach((el) =>
        el.classList.toggle("selected", Number(el.dataset.hand) === selected),
      );
  renderTargetDock();
  if (selected !== null && run.hand[selected])
    world?.setPlacement(CARDS[run.hand[selected]].role ?? null, source);
  else world?.setPlacement(null);
  world?.setSelected(source ?? selectedNode);
  const scene = audioScene();
  sound.setScene(scene);
  $("#now-playing").innerHTML =
    `<span class="music-bars"><i></i><i></i><i></i></span><span>${TRACK_NAMES[scene]}<small>ORIGINAL SCORE · YuE2</small></span>`;
  $("#now-playing").classList.toggle("muted", sound.settings.muted);
  if (
    expedition &&
    ["won", "lost"].includes(run.phase) &&
    !expedition.recorded
  ) {
    expedition.recorded = true;
    records.unshift({
      seed: run.seed,
      archetype: expedition.archetype,
      won: run.phase === "won",
      score: run.score,
      floor: run.floor,
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
}
function renderTargetDock() {
  let markup = "";
  if (view === "run" && run.phase === "battle") {
    if (selected !== null) {
      const c = CARDS[run.hand[selected]];
      if (c?.target === "ground")
        markup = `<div class="target-options"><span>PLACE ON THE TABLE OR</span><button data-action="auto-place">${ui.icon("cache", 14)} Deploy in a free socket</button></div>`;
      else if (c?.target === "link" || c?.target === "node")
        markup = `<div class="target-options"><span>${source ? "CONNECT TO" : "CHOOSE DEVICE"}</span>${run.topology.nodes
          .filter(
            (n) =>
              !["clabernetes", "firmware"].includes(c.id) ||
              n.role === "router",
          )
          .map(
            (n) =>
              `<button data-node="${n.id}" class="${source === n.id ? "active" : ""}">${n.id === "alpha" ? "ALPHA" : n.id === "omega" ? "OMEGA" : n.id.toUpperCase()}</button>`,
          )
          .join("")}</div>`;
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
  if (type === "settings")
    content.innerHTML = ui.settingsMarkup(sound.settings, view === "run");
  else if (type === "help") content.innerHTML = ui.helpMarkup();
  else if (["deck", "collection", "draw-pile", "discard-pile"].includes(type))
    content.innerHTML = ui.deckMarkup(run, type as "deck");
  else if (type === "credits")
    content.innerHTML = `<span class="eyebrow">THE PEOPLE & TOOLS BEHIND THE SIGNAL</span><h2>From an idea to an odyssey.</h2><div class="credits-copy"><h3>The Containerlab universe</h3><p>Inspired by Containerlab and the networks we build together. FAULTLINE is an independent fan project. The Containerlab mark is used under its original license.</p><h3>Original art</h3><p>Relay cathedral, ruined chamber and eleven card illustrations, hostile creatures and painted interface pieces created for this game using OpenAI image generation. Typography: Cinzel and Barlow, under the SIL Open Font License.</p><h3>Original score · YuE2</h3><p>The Last Relay · Signal & Steel · The Blackout Core. Generated locally with the official YuE2 model and listening decoder. The score uses instrumental arrangements; vocal stems were removed with Demucs. Generation prompts and provenance are included in the project.</p><h3>A real network, in miniature</h3><p>Packets and faults are simulated in your browser. You can export the topology to Containerlab; real routing requires device configuration and container images.</p></div>`;
  else if (type === "replace")
    content.innerHTML = `<span class="eyebrow">AN EXPEDITION IS ALREADY IN PROGRESS</span><h2>Leave this route behind?</h2><p class="modal-intro">Beginning a new expedition replaces your current saved run in sector ${run.floor + 1}.</p><div class="confirm-actions"><button class="gold-button" data-action="confirm-replace">Begin a new expedition ${ui.icon("arrow")}</button><button class="text-button" data-action="close">Keep my current expedition</button></div>`;
  dialog.className = [
    "deck",
    "collection",
    "draw-pile",
    "discard-pile",
    "help",
  ].includes(type)
    ? "wide"
    : "";
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  modal = "";
  dialog.close();
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
function playAction(action: () => ActionResult) {
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
  clearSelection();
  save();
  render();
  sound.effect(connected ? "connect" : "card");
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
  if (c.target === "instant") {
    playAction(() => playInstant(run, index));
    return;
  }
  selected = selected === index ? null : index;
  source = null;
  selectedNode = null;
  render(false);
  sound.effect("card");
}
function onGround(point: WorldPoint) {
  if (!playable() || selected === null) return;
  const index = selected;
  if (CARDS[run.hand[index]]?.target === "ground")
    playAction(() => playGround(run, index, point.x, point.z));
}
function onNode(id: string) {
  if (!playable()) return;
  if (selected !== null) {
    const index = selected,
      c = CARDS[run.hand[index]];
    if (!c) return;
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
  world?.setSelected(id);
}
function onMove(id: string, point: WorldPoint, finished: boolean) {
  if (!playable() || selected !== null) return;
  const n = run.topology.nodes.find((n) => n.id === id);
  if (!n || n.fixed) return;
  if (
    run.topology.nodes.some(
      (n) => n.id !== id && Math.hypot(n.x - point.x, n.z - point.z) < 1.55,
    )
  )
    return;
  beforeDrag ??= structuredClone(run);
  n.x = point.x;
  n.z = point.z;
  world?.setBattle(run.topology, run.enemy, run.faultNode, run.faultLink);
  if (finished) {
    undoStack.push(beforeDrag);
    beforeDrag = null;
    save();
    render(false);
  }
}
function autoPlace() {
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
      !run.topology.nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 1.55),
  );
  if (point) onGround(point);
  else toast("Place this hardware in an empty space on the table.");
}
function undo() {
  if (!playable() || !undoStack.length) return;
  const prev = undoStack.pop()!;
  if (prev.currentRoom !== run.currentRoom || prev.turn !== run.turn) return;
  run = prev;
  expedition!.run = run;
  clearSelection();
  save();
  render();
  sound.effect("card");
}
function floatText(text: string, good: boolean) {
  const el = document.createElement("span");
  el.className = `damage-number ${good ? "outgoing" : "incoming"}`;
  el.textContent = text;
  $("#impact-layer").append(el);
  window.setTimeout(() => el.remove(), 1500);
}
function transmit() {
  if (!playable()) return;
  const generation = ++battleGeneration;
  clearSelection();
  busy = true;
  undoStack.length = 0;
  const next = structuredClone(run),
    result = endTurn(next);
  sound.effect("turn");
  render(false);
  const finish = () => {
    if (generation !== battleGeneration) return;
    if (result.packetDamage) {
      world?.impact(0xfbd69a, 36);
      sound.effect("hit");
      floatText(`−${result.packetDamage}`, true);
    } else toast("No live route. The signal could not reach OMEGA.", "error");
    window.setTimeout(() => {
      if (generation !== battleGeneration) return;
      run = next;
      expedition!.run = run;
      busy = false;
      save();
      render();
      if (result.defeated) {
        sound.effect("reward");
        return;
      }
      if (result.integrityDamage) {
        world?.pulseThreat();
        sound.effect("hurt");
        floatText(`−${result.integrityDamage}`, false);
        root.classList.remove("shake");
        void root.offsetWidth;
        if (sound.settings.motion) root.classList.add("shake");
      } else if (result.enemyAction) {
        world?.pulseThreat();
        toast(result.enemyAction);
      }
      const flash = $("#battle-flash");
      flash.classList.remove("active");
      void flash.offsetWidth;
      flash.classList.add("active");
    }, 600);
  };
  if (result.signalPath.length && world) {
    world.playPacket(result.signalPath, finish);
    if (result.alternatePath.length)
      world.playPacket(result.alternatePath, undefined, 0xb3d8e3);
  } else window.setTimeout(finish, 550);
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
  if (
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
    tutorial = false;
    try {
      localStorage.setItem("faultline-guide-dismissed", "true");
    } catch {
      /* Optional preference. */
    }
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
    document.body.append(cardDrag.ghost);
    world?.setPlacement(CARDS[run.hand[cardDrag.index]].role ?? null);
  }
  if (cardDrag.ghost) {
    cardDrag.ghost.style.left = `${event.clientX}px`;
    cardDrag.ghost.style.top = `${event.clientY}px`;
    world?.previewAt(event.clientX, event.clientY);
  }
});
function cancelDrag() {
  cardDrag?.ghost?.remove();
  cardDrag = null;
  world?.setPlacement(null);
}
window.addEventListener("pointercancel", cancelDrag);
window.addEventListener("blur", cancelDrag);
window.addEventListener("pointerup", (event) => {
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
  if (event.target instanceof HTMLInputElement || dialog.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (selected !== null) {
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
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    chooseCard(Number(event.key) - 1);
  }
});
document.addEventListener("pointerover", (event) => {
  const el = (event.target as HTMLElement).closest("button");
  if (el && !el.contains((event as PointerEvent).relatedTarget as Node | null))
    sound.effect("hover");
});
window.addEventListener("pagehide", () => {
  save();
  world?.dispose();
});
render();
