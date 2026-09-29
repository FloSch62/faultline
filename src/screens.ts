/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Expedition screens: title, archetype selection, map, rewards, relics,
 * sanctuary, market, events and outcomes. Battle UI lives in ui.ts.
 * Screens emit `data-screen` controls; main.ts forwards them to screenAction. */
import "./screens.css";
import "./shell.css";
import { DESIGNATIONS, ENEMIES, designationRule, hostileName } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { TRACK_TITLES } from "./core/music.ts";
import { CARDS, RELICS, RULES, STARTER_SIGNATURES, canUpgrade, upgraded } from "./core/cards.ts";
import {
  ARCHETYPES,
  starterDeck,
  type Archetype,
  type Expedition,
} from "./core/expedition.ts";
import { reachableRooms, connectsTo, encounterHealth } from "./core/map.ts";
import {
  CONSOLES,
  SALVAGE_COST,
  SALVAGE_MIN_INTEGRITY,
  buyCard,
  buyRelic,
  cardChoiceBlocker,
  chooseEvent,
  chooseForge,
  eventView,
  leaveEvent,
  leaveForge,
  leaveShop,
  relicPool,
  removalBlocker,
  removeDeckCard,
  repairAmount,
  shopRemoveCard,
  shopUpgradeCard,
  upgradeBlocker,
  upgradeDeckCard,
  type ActionResult,
} from "./core/run.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "./core/ascension.ts";
import type { CardId, Enemy, MapRoom, RelicId, RunState } from "./core/types.ts";
import type { AudioSettings } from "./audio.ts";
import type { EffectKind } from "./audio-effects.ts";
import type { Preferences } from "./preferences.ts";
import { chapterForFloor, ARCHETYPE_STORIES, sanctuaryStory, OUTCOMES, enemyStory, designationEntranceLine, reinforcementEntranceLine } from "./story.ts";
import { encounterRoom, roomScout } from "./core/encounter.ts";
import { asset, esc, icon, artStyle, cardMarkup } from "./ui.ts";
import { HOUSE_COLORS, HOUSE_NAMES, houseSigil } from "./card-marks.ts";
import { designationGlyph, designationMark } from "./tutorial/icons.ts";

// ------------------------------------------------------------------ helpers

const EXTRA_ICONS: Record<string, string> = {
  signal: '<path d="M12 21v-6"/><circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6m7.6 0a5.4 5.4 0 0 0 0-7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2m13.2 0a9.3 9.3 0 0 0 0-13.2"/>',
  unknown: '<path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.1v.7"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/><path d="m12 2 10 10-10 10L2 12 12 2Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  console: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="m7 9 3 3-3 3m5 0h5"/>',
  engine: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1"/>',
  upgrade: '<path d="m12 3 8 8h-5v10H9V11H4l8-8Z"/>',
  remove: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
  ascend: '<path d="m6 13 6-6 6 6M6 19l6-6 6 6"/>',
  stall: '<path d="M3 9h18l-2-5H5L3 9Zm0 0v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 14v7h14v-7M10 21v-4h4v4"/>',
  tree: '<circle cx="12" cy="4.5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 6.5V17m0-6-7 6m7-6 7 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  hive: '<path d="m12 2 4 2.3v4.6L12 11 8 8.9V4.3L12 2Zm-5 9 4 2.3v4.6L7 20l-4-2.1v-4.6L7 11Zm10 0 4 2.3v4.6L17 20l-4-2.1v-4.6L17 11Z"/>',
  fanout: '<circle cx="4.5" cy="12" r="2"/><path d="M6.5 12H11m0 0 8-6.5M11 12h8m-8 0 8 6.5"/><circle cx="19.5" cy="5.5" r="1.5"/><circle cx="19.5" cy="12" r="1.5"/><circle cx="19.5" cy="18.5" r="1.5"/>',
  frames: '<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M7 7v10m5-10v10m5-10v10"/>',
  warn: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  spark: '<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3.5 3.5m7 7L19 19M5 19l3.5-3.5m7-7L19 5"/>',
  severed: '<path d="M10 8l4-4a5 5 0 0 1 7 7l-4 4M14 16l-4 4a5 5 0 0 1-7-7l4-4M12 8.5V6.5M8.5 12h-2M15.5 12h2M12 15.5v2"/>',
  // v4 relics: a queue ordered toward its weakest entry, a wrench, a braced crate, a storm cell.
  queue: '<path d="M3 5h11M3 10h8M3 15h5M3 20h2"/><path d="M19 4v14m-3.2-3.2L19 18l3.2-3.2"/><circle cx="19" cy="21" r=".6" fill="currentColor"/>',
  wrench: '<path d="M13.4 10.6 4.3 19.7a1.6 1.6 0 0 0 2.3 2.3l9.1-9.1"/><path d="M13.4 10.6a4.8 4.8 0 0 1 6-6.5l-3 3 .4 2.6 2.6.4 3-3a4.8 4.8 0 0 1-6.7 6"/>',
  crate: '<rect x="3" y="5" width="18" height="15" rx="1"/><path d="M3 9.5h18M3 15.5h18M7 9.5l10 6M9.5 7.2h5"/>',
  storm: '<path d="M7.5 16.5H6.2a4.2 4.2 0 0 1-.5-8.4 6 6 0 0 1 11.6-.9 4.6 4.6 0 0 1 .9 9.1"/><path d="m13.2 11.5-3 5h3.6l-2.6 5"/>',
  // v5 boss relics: two plugs held apart by a gap, a mainframe cabinet with tape reels, a bolt jumping a rail.
  airgap: '<path d="M1.8 12h4.4M17.8 12h4.4"/><rect x="6.2" y="8" width="4" height="8" rx="1"/><rect x="13.8" y="8" width="4" height="8" rx="1"/><path d="M10.2 10h1M10.2 14h1M12.8 10h1M12.8 14h1"/><path d="M12 3.5v2.5M12 18v2.5" stroke-dasharray="1.2 1.6"/>',
  mainframe: '<rect x="4" y="2.8" width="16" height="18.4" rx="1"/><circle cx="8.8" cy="8.2" r="2.6"/><circle cx="15.2" cy="8.2" r="2.6"/><path d="M8.8 8.2h.01M15.2 8.2h.01M7 14h10M7 17.2h6M16 17.2h1"/>',
  overvolt: '<path d="M2.5 19.5h19"/><path d="m13.6 2.5-6.4 9.4h4.9l-2.4 7.6 7.6-11h-5Z"/><path d="M3.5 6.5 5.6 8M20.5 6.5 18.4 8M3.5 13.5l2.1-.9M20.5 13.5l-2.1-.9"/>',
};
/** ui.icon plus the expedition-only glyphs. */
export function sicon(name: string, size = 18): string {
  const path = EXTRA_ICONS[name];
  if (!path) return icon(name, size);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** A non-interactive card face with the battle card's exact look. */
function cardFace(id: CardId): string {
  return cardMarkup(id, 0, "reward")
    .replace(/^<button/, "<div")
    .replace(/<\/button>$/, "</div>")
    .replace(/ data-reward="[^"]*"/, "")
    .replace(/ aria-label="[^"]*"/, ' aria-hidden="true"');
}

const title = (text: string) => text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const credits = (amount: number, size = 16) =>
  `<span class="credit-amount">${sicon("coins", size)}<b>${amount}</b></span>`;

/** The cue a room plays as it opens, after the shared navigate cue. */
export function roomArrivalCue(run: RunState): EffectKind | null {
  if (run.phase === "battle") return "turn";
  if (run.phase === "event") return "event";
  if (run.phase === "shop") return "coins";
  return null;
}

const RELIC_GLYPHS: Record<RelicId, string> = {
  "cold-start": "bolt", "hot-swap": "link", "parallel-core": "field", "shield-array": "shield",
  "deep-cache": "deck", "grounded-core": "anchor", "packet-lens": "eye", "repair-drone": "heart",
  "reserve-cell": "battery", backpressure: "shield", honeynet: "hive", fanout: "fanout",
  "spare-parts": "cache", "credit-line": "coins", watchdog: "eye", "spanning-tree": "tree",
  anycast: "target", "jumbo-frames": "frames", "bgp-hijack": "sword", "sdn-controller": "console",
  "zero-trust": "lock",
  // v4 · Under Quarantine
  "round-robin": "fanout", "ingress-filter": "lock", "priority-queue": "queue", "reinforced-frame": "frames",
  "field-engineer": "wrench", "bill-of-lading": "crate", "storm-control": "storm", "scorched-earth": "sword",
  // v5 · Three Energy
  "air-gap": "airgap", "legacy-mainframe": "mainframe", overvolt: "overvolt",
};
export function relicEmblem(id: RelicId, size = 30): string {
  return `<span class="relic-emblem tier-${RELICS[id].tier}" style="--relic-color:${RELICS[id].color}">${sicon(RELIC_GLYPHS[id] ?? "elite", size)}</span>`;
}
/** Boss relics state their power first and their price second. */
function relicTerms(id: RelicId): { boon: string; cost: string } {
  const [boon, ...rest] = RELICS[id].rules.split(/(?<=\.)\s+/);
  return { boon, cost: rest.join(" ") };
}

const ENGINES: Record<Archetype, { name: string; rules: string }> = {
  architect: {
    name: "Mesh",
    rules: `Every channel beyond the first adds +${RULES.bandwidthPerChannel}. Load Balancers and clusters turn width into damage.`,
  },
  warden: {
    name: "Fortress",
    rules: "Online firewalls block anywhere on the network. Backpressure turns blocked damage into your next strike.",
  },
  ghost: {
    name: "Surge",
    rules: `Hold a transmission ×${RULES.bufferMultiplier}, then release it in one surge. Keep a live route or lose the buffer.`,
  },
};

// ------------------------------------------------------------------ progress

const PROGRESS_KEY = "faultline-progress-v1";
interface Progress {
  /** Highest ascension won per archetype; winning at N unlocks N + 1. */
  cleared: Partial<Record<Archetype, number>>;
  lastUnlock?: { seed: number; archetype: Archetype; level: number };
}
export function loadProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    const cleared: Progress["cleared"] = {};
    for (const id of Object.keys(ARCHETYPES) as Archetype[]) {
      const level = value?.cleared?.[id];
      // v5: ascension has four levels; a record from the ten-level game is clamped, never migrated.
      if (Number.isInteger(level) && level >= 0) cleared[id] = Math.min(MAX_ASCENSION, level);
    }
    const unlock = value?.lastUnlock;
    return {
      cleared,
      ...(unlock && Object.hasOwn(ARCHETYPES, unlock.archetype) && Number.isInteger(unlock.level) && Number.isFinite(unlock.seed)
        ? { lastUnlock: unlock } : {}),
    };
  } catch {
    return { cleared: {} };
  }
}
function storeProgress(progress: Progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Optional. */ }
}
export function unlockedAscension(archetype: Archetype): number {
  const cleared = loadProgress().cleared[archetype];
  return cleared === undefined ? 0 : Math.min(MAX_ASCENSION, cleared + 1);
}
/** Records a finished expedition. Returns the newly unlocked level, if any. */
export function recordOutcome(e: Expedition): number | null {
  if (e.run.phase !== "won") return null;
  const progress = loadProgress();
  const before = unlockedAscension(e.archetype);
  const previous = progress.cleared[e.archetype] ?? -1;
  progress.cleared[e.archetype] = Math.max(previous, e.run.ascension);
  const after = Math.min(MAX_ASCENSION, progress.cleared[e.archetype]! + 1);
  const unlocked = after > before ? after : null;
  if (unlocked !== null) progress.lastUnlock = { seed: e.run.seed, archetype: e.archetype, level: unlocked };
  storeProgress(progress);
  return unlocked;
}

// ------------------------------------------------------------------ screen state

const chosen: Partial<Record<Archetype, number>> = {};
/** The ascension selected for a new expedition, clamped to what is unlocked. */
export function chosenAscension(archetype: Archetype): number {
  const unlocked = unlockedAscension(archetype);
  return Math.max(0, Math.min(unlocked, chosen[archetype] ?? unlocked));
}

type PickerMode = "forge-upgrade" | "forge-remove" | "shop-upgrade" | "shop-remove" | "event";
interface Picker { mode: PickerMode; room: string | null; choice?: number }
let picker: Picker | null = null;
const pickerPhase = (mode: PickerMode) => mode.startsWith("forge") ? "forge" : mode.startsWith("shop") ? "shop" : "event";
function eventNeed(run: RunState, active: Picker) {
  return eventView(run)?.choices[active.choice ?? -1]?.needsCard;
}
function activePicker(run: RunState): Picker | null {
  if (picker && (picker.room !== run.currentRoom || pickerPhase(picker.mode) !== run.phase)) picker = null;
  return picker;
}

// Escape closes an open deck picker before the global handler opens settings.
if (typeof document !== "undefined")
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const cancel = document.querySelector<HTMLButtonElement>('.picker-layer [data-screen="pick-cancel"]');
    if (!cancel || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel.click();
  }, true);

// ------------------------------------------------------------------ actions

export interface ScreenOutcome {
  result?: ActionResult;
  cue?: EffectKind;
  /** The action began a battle (an event fight): reset battle view state. */
  battle?: boolean;
  /** False when only presentation state changed; nothing to save. */
  changed?: boolean;
}
const fail = (message: string): ScreenOutcome => ({ result: { ok: false, message }, cue: "error", changed: false });

export function screenAction(run: RunState, data: DOMStringMap): ScreenOutcome {
  const index = Number(data.index);
  switch (data.screen) {
    case "ascension": {
      const archetype = data.for as Archetype;
      if (!Object.hasOwn(ARCHETYPES, archetype)) return { changed: false };
      const level = Math.max(0, Math.min(unlockedAscension(archetype), Number(data.level) || 0));
      chosen[archetype] = level;
      return { cue: "pickup", changed: false };
    }
    case "forge-repair":
    case "forge-salvage": {
      const repair = data.screen === "forge-repair";
      const result = chooseForge(run, repair ? "repair" : "relic");
      return { result, cue: result.ok ? (repair ? "reward" : "navigate") : "error" };
    }
    case "forge-leave": {
      const result = leaveForge(run);
      return { result: result.ok ? undefined : result, cue: result.ok ? "navigate" : "error" };
    }
    case "forge-upgrade":
    case "forge-remove": {
      const result = chooseForge(run, data.screen === "forge-upgrade" ? "upgrade" : "remove");
      if (!result.ok) return fail(result.message);
      picker = { mode: data.screen, room: run.currentRoom };
      return { cue: "navigate", changed: false };
    }
    case "shop-upgrade":
    case "shop-remove": {
      const shop = run.shop;
      if (run.phase !== "shop" || !shop) return fail("No market is open.");
      const remove = data.screen === "shop-remove";
      if (remove ? shop.removed : shop.upgraded)
        return fail(`The market ${remove ? "removes" : "upgrades"} one card per visit.`);
      const price = remove ? shop.removePrice : shop.upgradePrice;
      if (run.credits < price) return fail(`You need ${price} credits; you have ${run.credits}.`);
      picker = { mode: data.screen, room: run.currentRoom };
      return { cue: "navigate", changed: false };
    }
    case "pick-cancel":
      picker = null;
      return { cue: "select", changed: false };
    case "pick": {
      const active = activePicker(run);
      if (!active || !Number.isInteger(index)) return { changed: false };
      const result = active.mode === "forge-upgrade" ? upgradeDeckCard(run, index)
        : active.mode === "forge-remove" ? removeDeckCard(run, index)
          : active.mode === "shop-upgrade" ? shopUpgradeCard(run, index)
            : active.mode === "shop-remove" ? shopRemoveCard(run, index)
              : chooseEvent(run, active.choice ?? -1, index);
      if (!result.ok) return { result, cue: "error", changed: false };
      picker = null;
      const upgrade = active.mode.endsWith("upgrade");
      return {
        result,
        cue: upgrade || (active.mode === "event" && eventNeed(run, active) === "upgrade") ? "upgrade"
          : active.mode === "event" && eventNeed(run, active) !== "remove" ? "event" : "scrub",
        battle: run.phase === "battle",
      };
    }
    case "buy-card":
    case "buy-relic": {
      const result = data.screen === "buy-card" ? buyCard(run, index) : buyRelic(run, index);
      return result.ok ? { result, cue: "coins" } : { result, cue: "error", changed: false };
    }
    case "leave-shop": {
      const result = leaveShop(run);
      return { result: result.ok ? undefined : result, cue: result.ok ? "navigate" : "error" };
    }
    case "event-choice": {
      const view = eventView(run);
      const choice = view?.choices[index];
      if (!view || !choice || view.resolved) return { changed: false };
      if (choice.disabled) return fail(choice.disabled);
      if (choice.needsCard) {
        picker = { mode: "event", room: run.currentRoom, choice: index };
        return { cue: "navigate", changed: false };
      }
      const result = chooseEvent(run, index);
      return { result: result.ok ? undefined : result, cue: result.ok ? (run.phase === "battle" ? "turn" : "event") : "error", battle: run.phase === "battle" };
    }
    case "event-leave": {
      const result = leaveEvent(run);
      return { result: result.ok ? undefined : result, cue: result.ok ? "navigate" : "error" };
    }
  }
  return { changed: false };
}

// ------------------------------------------------------------------ deck picker

const PICKER_COPY: Record<PickerMode, { heading: string; detail: string; verb: string; icon: string }> = {
  "forge-upgrade": { heading: "Upgrade a Card", detail: "The change is permanent.", verb: "Upgrade", icon: "upgrade" },
  "forge-remove": { heading: "Remove a Card", detail: "A lighter deck draws its best cards more often.", verb: "Remove", icon: "remove" },
  "shop-upgrade": { heading: "Upgrade a Card", detail: "One upgrade per visit.", verb: "Upgrade", icon: "upgrade" },
  "shop-remove": { heading: "Remove a Card", detail: "One removal per visit.", verb: "Remove", icon: "remove" },
  event: { heading: "Choose a Card", detail: "", verb: "Choose", icon: "check" },
};
const NEED_VERB = { upgrade: "Upgrade", remove: "Remove", transform: "Transform", duplicate: "Duplicate" } as const;
const NEED_ICON = { upgrade: "upgrade", remove: "remove", transform: "spark", duplicate: "deck" } as const;

const VALUE_NAMES: Record<string, string> = {
  block: "Block", burst: "Burst", draw: "Draw", drawOffline: "Draw without a route", energy: "Energy", nextEnergy: "Energy next turn",
  heal: "Heal", shield: "Shield", reduce: "Reduction", damage: "Damage", links: "Links", recover: "Recover",
  buffer: "Buffer", perChannel: "Per channel", perFirewall: "Per firewall", minimum: "Minimum",
};
/** A short, concrete description of what an upgrade changes. */
function upgradeSummary(id: CardId): string {
  if (!canUpgrade(id)) return "";
  const before = CARDS[id], after = CARDS[upgraded(id)];
  const changes: string[] = [];
  if (after.cost !== before.cost) changes.push(`Cost ${before.cost} → ${after.cost}`);
  for (const key of Object.keys({ ...before.values, ...after.values }) as (keyof typeof before.values)[]) {
    const a = before.values[key] ?? 0, b = after.values[key] ?? 0;
    if (a !== b) changes.push(a ? `${VALUE_NAMES[key] ?? key} ${a} → ${b}` : `+${b} ${VALUE_NAMES[key] ?? key}`);
  }
  if (!!after.exhaust !== !!before.exhaust) changes.push(after.exhaust ? "Gains Exhaust" : "No Exhaust");
  return changes.slice(0, 2).join(" · ") || "Improved effect";
}

function deckPickerMarkup(run: RunState, active: Picker): string {
  const copy = PICKER_COPY[active.mode];
  let heading = copy.heading, verb = copy.verb, detail = esc(copy.detail), kicker = "", glyph = copy.icon;
  let blocker: (i: number) => string | null;
  let kind: "upgrade" | "remove" | "transform" | "duplicate";
  if (active.mode === "event") {
    const choice = eventView(run)?.choices[active.choice ?? -1];
    kind = choice?.needsCard ?? "remove";
    verb = NEED_VERB[kind];
    glyph = NEED_ICON[kind];
    heading = `${verb} a Card`;
    kicker = choice?.label ?? "";
    detail = esc(choice?.detail ?? "");
    blocker = i => cardChoiceBlocker(run, kind, i);
  } else if (active.mode.endsWith("upgrade")) {
    kind = "upgrade";
    blocker = i => upgradeBlocker(run, i);
  } else {
    kind = "remove";
    blocker = i => removalBlocker(run, i);
  }
  const price = active.mode === "shop-upgrade" ? run.shop?.upgradePrice : active.mode === "shop-remove" ? run.shop?.removePrice : undefined;
  if (price !== undefined) detail = `${credits(price, 15)} <span>${detail}</span>`;
  const order = run.deck.map((id, i) => ({ id, i })).sort((a, b) =>
    CARDS[a.id].name.localeCompare(CARDS[b.id].name) || a.i - b.i);
  const available = order.filter(({ i }) => !blocker(i)).length;
  const tiles = order.map(({ id, i }) => {
    const blocked = blocker(i);
    const preview = kind === "upgrade" && !blocked;
    const label = `${verb} ${CARDS[id].name}${blocked ? `. Unavailable: ${blocked}` : preview ? `. ${upgradeSummary(id)}. After: ${CARDS[upgraded(id)].rules}` : ""}`;
    const caption = blocked ? `${sicon("lock", 13)} ${esc(blocked)}` : preview ? `${sicon("upgrade", 13)} ${esc(upgradeSummary(id))}` : "";
    return `<button class="pick-tile pick-${kind} ${blocked ? "blocked" : ""}" data-screen="pick" data-index="${i}" ${blocked ? `disabled data-tooltip="${esc(blocked)}"` : ""} aria-label="${esc(label)}">
      <span class="pick-face pick-before">${cardFace(id)}</span>
      ${preview ? `<span class="pick-face pick-after">${cardFace(upgraded(id))}</span>` : ""}
      <span class="pick-stamp">${sicon(glyph, 15)} ${verb}</span>
      ${caption ? `<span class="pick-caption">${caption}</span>` : ""}
    </button>`;
  }).join("");
  return `<div class="picker-layer" role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <div class="picker-panel">
      <header class="picker-head"><div class="picker-title">${kicker ? `<span class="eyebrow">${esc(kicker)}</span>` : ""}<h2 id="picker-title">${heading}</h2>${detail ? `<p>${detail}</p>` : ""}</div>
      <div class="picker-meta"><span class="picker-count"><b>${available}</b> of ${run.deck.length} eligible</span><button class="plate-button" data-screen="pick-cancel">Back <kbd>Esc</kbd></button></div></header>
      <div class="picker-grid">${tiles}</div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ title & selection

/** The main menu: the logotype, a vertical list of engraved items, a version mark. */
export function titleMarkup(saved: Expedition | null) {
  const canContinue = saved && !["won", "lost"].includes(saved.run.phase);
  const where = canContinue
    ? `Stage ${STAGES[saved.run.stage].numeral} · Sector ${Math.min(7, saved.run.floor + 1)} · ${ARCHETYPES[saved.archetype].name.replace(/^The /, "")}${saved.run.ascension ? ` · Ascension ${saved.run.ascension}` : ""}`
    : "";
  const item = (action: string, label: string, extra = "") =>
    `<button class="menu-item" data-action="${action}"><span>${label}</span>${extra}</button>`;
  return `<section class="title-screen"><div class="title-copy"><h1 class="logotype">FAULTLINE</h1><p class="logo-subtitle"><i></i><span>A Containerlab Odyssey</span><i></i></p>
    <nav class="title-menu" aria-label="Main menu">${canContinue ? item("continue", "Continue expedition", `<small>${where}</small>`) : ""}${item("new", "New expedition")}<i class="menu-gap" aria-hidden="true"></i>${item("tutorial", "Field training")}${item("help", "Handbook")}${item("collection", "Card archive")}${item("lore", "Lore")}${item("settings", "Options")}</nav>
  </div><span class="version-mark">v${__APP_VERSION__}</span></section>`;
}

/** The ascension picker (v5, contract 6b): five rungs, 0 (the standard expedition) and the four named
 * levels, read from ASCENSION_LEVELS. Every rung carries its rules in its tooltip; the chosen level's
 * rules read in full below, with the earlier levels it includes named beside them. */
function ascensionPanel(archetype: Archetype): string {
  const unlocked = unlockedAscension(archetype), level = chosenAscension(archetype);
  const rungs = Array.from({ length: MAX_ASCENSION + 1 }, (_, n) => {
    const locked = n > unlocked, info = n ? ASCENSION_LEVELS[n - 1] : null;
    const name = info?.name ?? "Standard";
    const rule = info?.rule ?? "The standard expedition: no ascension rules.";
    const tip = `${n ? `Ascension ${n} · ${name}` : "Ascension 0 · Standard"}: ${rule}${locked ? ` Locked: win at ascension ${n - 1} with ${ARCHETYPES[archetype].name} to unlock it.` : n > 1 ? " Includes every earlier level." : ""}`;
    return `<span class="asc-rung-slot" data-tooltip="${esc(tip)}"><button class="asc-rung ${n === level ? "current" : ""} ${n < level ? "included" : ""} ${locked ? "locked" : ""}" data-screen="ascension" data-for="${archetype}" data-level="${n}" ${locked ? "disabled" : ""} aria-pressed="${n === level}" aria-label="${esc(tip)}"><span class="asc-gem">${locked ? sicon("lock", 12) : `<span>${n}</span>`}</span><span class="asc-name">${esc(name)}</span></button></span>`;
  }).join('<i class="asc-link" aria-hidden="true"></i>');
  const current = level ? ASCENSION_LEVELS[level - 1] : null;
  const earlier = ASCENSION_LEVELS.slice(0, Math.max(0, level - 1));
  const includes = earlier.length
    ? `<span class="asc-includes">Includes ${earlier.map(item => `<span class="asc-earlier" tabindex="0" data-tooltip="${esc(`${item.level} · ${item.name}: ${item.rule}`)}">${esc(item.name)}</span>`).join(earlier.length > 1 ? ", " : "")}</span>` : "";
  const summary = current
    ? `<strong>${esc(current.name)}</strong><span class="asc-rule">${esc(current.rule)}</span>${includes}`
    : `<strong>Standard expedition</strong><span class="asc-rule">${unlocked ? `Ascension 1–${unlocked} unlocked for ${ARCHETYPES[archetype].name}. Each level adds its rules to every level before it.` : `Win an expedition with ${ARCHETYPES[archetype].name} to unlock ascension 1. Each level adds its rules to every level before it.`}</span>`;
  return `<div class="ascension-panel inlay" role="group" aria-label="Ascension">
    <div class="asc-label">${sicon("ascend", 20)}<span><small>Ascension</small><strong>${level}</strong></span></div>
    <div class="asc-body"><div class="asc-track" role="group" aria-label="Choose ascension level">${rungs}</div>
    <p class="asc-summary">${summary}</p></div>
  </div>`;
}

/** The keeper's twelve starting cards: the two signature cards lit first, then the shared ten. */
function starterRow(id: Archetype): string {
  const deck = starterDeck(id), signature = STARTER_SIGNATURES[id];
  const counts = new Map<CardId, number>();
  for (const card of [...signature, ...deck.filter(card => !signature.includes(card))]) counts.set(card, (counts.get(card) ?? 0) + 1);
  const names = [...counts].map(([card, n]) => `<span class="starter-card${signature.includes(card) ? " is-signature" : ""}" data-tooltip="${esc(`${CARDS[card].name}${n > 1 ? ` ×${n}` : ""}: ${CARDS[card].rules}${signature.includes(card) ? ` ${ARCHETYPES[id].name}'s signature card.` : ""}`)}">${esc(CARDS[card].name)}${n > 1 ? `<b>×${n}</b>` : ""}</span>`).join("");
  return `<span class="kit-row kit-deck"><i>${icon("deck", 15)}</i><span><em>Starting deck · ${deck.length} cards</em><span class="starter-list">${names}</span></span></span>`;
}

/** The chosen keeper's leaf, unfolded beside the portrait: their story, then the kit (console, relic,
 * engine, starting deck). */
function keeperKit(id: Archetype): string {
  const a = ARCHETYPES[id], consoleDef = CONSOLES[a.console], engine = ENGINES[id], relic = RELICS[a.relic];
  // Short console rules read in full; a long one keeps its first sentence (the engine row explains the rest).
  const consoleSummary = consoleDef.rules.length < 80 ? consoleDef.rules : consoleDef.rules.split(/(?<=\.)\s+/)[0];
  return `<span class="keeper-kit">
      <span class="keeper-story">${esc(ARCHETYPE_STORIES[id].story)}</span>
      <span class="kit">
        <span class="kit-row"><i>${sicon("console", 16)}</i><span><em>Console · ${consoleDef.cost} energy</em><b>${consoleDef.name}</b><span>${esc(consoleSummary)}</span></span></span>
        <span class="kit-row"><i>${relicEmblem(a.relic, 15)}</i><span><em>Starting relic</em><b>${relic.name}</b><span>${esc(relic.rules)}</span></span></span>
        <span class="kit-row"><i>${sicon("engine", 16)}</i><span><em>Engine</em><b>${engine.name}</b><span>${esc(engine.rules)}</span></span></span>
        ${starterRow(id)}
      </span>
    </span>`;
}

/** Chooses a keeper on the open selection screen in place, so the portraits stay loaded and the
 * plates keep their focus and hover: the lit stone and the kit leaf move to the chosen plate and the
 * ascension panel follows that keeper. False when no selection screen is open. */
export function chooseKeeperInPlace(selected: Archetype): boolean {
  const plates = Array.from(document.querySelectorAll<HTMLElement>(".selection-screen [data-archetype]"));
  if (!plates.length || !document.querySelector(".selection-screen .ascension-panel")) return false;
  for (const plate of plates) {
    const chosen = plate.dataset.archetype === selected;
    if (plate.classList.contains("chosen") === chosen) continue;
    plate.classList.toggle("chosen", chosen);
    plate.setAttribute("aria-pressed", String(chosen));
    plate.querySelector(".lit-stone")?.remove();
    plate.querySelector(".keeper-kit")?.remove();
    if (!chosen) continue;
    plate.querySelector(".keeper-portrait")?.insertAdjacentHTML("afterend", '<span class="lit-stone"></span>');
    plate.insertAdjacentHTML("beforeend", keeperKit(selected));
  }
  return refreshAscension(selected);
}
/** Redraws the selection screen's ascension panel for a keeper in place (the focused rung keeps focus). */
export function refreshAscension(archetype: Archetype): boolean {
  const panel = document.querySelector(".selection-screen .ascension-panel");
  if (!panel) return false;
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".asc-rung")?.dataset.level;
  panel.outerHTML = ascensionPanel(archetype);
  if (focused !== undefined) document.querySelector<HTMLElement>(`.selection-screen .asc-rung[data-level="${focused}"]`)?.focus();
  return true;
}

const sentence = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
/** Choose Your Keeper: three tall portrait plates, the keeper's name and integrity on the painting's
 * lower edge. The chosen plate is lit and unfolds its kit; the others stay dim until hovered. */
export function selectMarkup(selected: Archetype) {
  const ids = Object.keys(ARCHETYPES) as Archetype[];
  const cards = ids.map(id => {
    const a = ARCHETYPES[id], consoleDef = CONSOLES[a.console], engine = ENGINES[id], relic = RELICS[a.relic];
    const deck = starterDeck(id), chosen = selected === id;
    return `<button class="archetype ${chosen ? "chosen" : ""}" data-archetype="${id}" aria-pressed="${chosen}" style="--portrait:url('${asset(a.art)}');--accent:${a.color}" aria-label="${esc(`${a.name}. ${a.title}. Console: ${consoleDef.name}, ${consoleDef.rules} Relic: ${relic.name}, ${relic.rules} Engine: ${engine.name}. Starting deck, ${deck.length} cards: ${STARTER_SIGNATURES[id].map(card => CARDS[card].name).join(" and ")} with the shared ten. ${a.integrity} integrity.`)}">
      <span class="keeper-portrait" aria-hidden="true"></span>${chosen ? '<span class="lit-stone"></span>' : ""}
      <span class="keeper-name"><strong>${a.name}</strong><em class="archetype-epithet">${sentence(a.title)}</em><span class="archetype-health">${icon("heart", 16)}<b>${a.integrity}</b><small>Integrity</small></span></span>
      ${chosen ? keeperKit(id) : ""}</button>`;
  }).join("");
  return `<section class="selection-screen full-screen"><button class="back-control text-button" data-action="title"><kbd>Esc</kbd>Return</button><button class="plate-button deck-plate" data-action="loadout">${icon("deck", 16)}Starting deck</button><div class="screen-heading"><h1>Choose Your Keeper</h1></div><div class="archetypes">${cards}</div><div class="selection-footer">${ascensionPanel(selected)}<button class="gold-button embark" data-action="embark">Enter the Faultline</button></div></section>`;
}

// ------------------------------------------------------------------ header & map

/** The in-run HUD bar: expedition vitals on the left, brass studs for sound, fullscreen and Options on the right.
 *  The title and keeper select wear no bar; the logotype is the brand. */
export function headerMarkup(e: Expedition | null, inTitle: boolean, settings: AudioSettings) {
  const r = e?.run;
  if (inTitle || !r) return "";
  const gem = '<i class="stat-divider" aria-hidden="true"></i>';
  return `<div class="run-stats"><span class="integrity-stat" data-tooltip="Integrity persists between encounters" aria-label="Integrity ${r.integrity} of ${r.maxIntegrity}">${icon("heart", 18)}<b>${r.integrity}</b><small>/${r.maxIntegrity}</small></span>${gem}<span class="credits-stat" data-tooltip="Credits: spend them at a Market" aria-label="${r.credits} credits">${sicon("coins", 18)}<b>${r.credits}</b></span>${gem}<button class="deck-stat" data-action="deck" data-tooltip="View your deck" aria-label="View your deck, ${r.deck.length} cards">${icon("deck", 18)}<b>${r.deck.length}</b></button>${gem}<span class="stage-stat" data-tooltip="${STAGES[r.stage].name}"><small>Stage</small><b>${STAGES[r.stage].numeral}</b></span><span class="sector-stat"><small>Sector</small><b>${Math.min(r.floor + 1, 7)}</b><small>/ 7</small></span>${r.ascension ? `${gem}<span class="ascension-stat" data-tooltip="${esc(ASCENSION_LEVELS.slice(0, r.ascension).map(a => `${a.level}. ${a.rule}`).join(" "))}">${sicon("ascend", 17)}<b>${r.ascension}</b></span>` : ""}</div><nav class="header-controls" aria-label="Game controls"><button class="icon-button" data-action="sound" aria-label="${settings.muted ? "Enable" : "Mute"} audio" data-tooltip="${settings.muted ? "Enable" : "Mute"} audio">${icon(settings.muted ? "mute" : "sound")}</button><button class="icon-button" data-action="fullscreen" aria-label="Toggle fullscreen" data-tooltip="Fullscreen">${icon("full")}</button><button class="icon-button" data-action="settings" aria-label="Open settings" data-tooltip="Options">${icon("settings", 19)}</button></nav>`;
}

export const roomNames: Record<MapRoom["type"], string> = {
  battle: "Hostile Signal",
  elite: "Elite Threat",
  cache: "Salvage Cache",
  forge: "Sanctuary",
  boss: "Stage Guardian",
  shop: "Market",
  event: "Unknown Signal",
};
const roomIcons: Record<MapRoom["type"], string> = {
  battle: "sword",
  elite: "elite",
  cache: "cache",
  forge: "forge",
  boss: "boss",
  shop: "stall",
  event: "unknown",
};
/** What the chart knows about a fight room (content's roomScout): its hostiles leader first
 * with their health, its designations, and whether interference still hides them (a cleared
 * room shows its designation for the record, design 8.5). Reinforcements are never scouted. */
type RoomScout = ReturnType<typeof roomScout>;
const scoutRoom = (r: RunState, n: MapRoom): RoomScout => roomScout(r, n);
/** The designation line of a room's tooltip: the ribbon word and its rule, or only the static. */
function designationDetail(r: RunState, scout: RoomScout): string {
  if (scout.hidden) return " Unknown designation. Revealed on entry.";
  if (!scout.designations.length) return "";
  return scout.designations.map(id => ` ${DESIGNATIONS[id].ribbon}: ${designationRule(id, r.stage)}`).join("");
}
function roomDetail(r: RunState, n: MapRoom): string {
  const scout = scoutRoom(r, n);
  if (scout.members.length === 1) {
    const [id] = scout.members;
    return `${title(ENEMIES[id].name)} · ${scout.health[0] ?? encounterHealth(r.stage, n, r.ascension)} integrity. ${ENEMIES[id].trait}${designationDetail(r, scout)}`;
  }
  if (scout.members.length > 1) {
    const health = scout.health, leader = n.enemyId ? scout.members[0] : null;
    const roster = scout.members.map((id, i) => `${hostileName(id)}${id === leader && i === 0 ? " (leader)" : ""} ${health[i]}`).join(" · ");
    const traits = scout.members.map((id, i) => id === leader && i === 0
      ? ` ${ENEMIES[id].trait}`
      : leader ? ` ${hostileName(id)}, ${ENEMIES[id].badge}.` : ` ${hostileName(id)}, ${ENEMIES[id].badge}: ${ENEMIES[id].trait}`).join("");
    return `Pack of ${scout.members.length} · ${roster} integrity.${traits}${designationDetail(r, scout)}`;
  }
  return {
    forge: `Sanctuary · one service: repair ${repairAmount(r)} integrity, upgrade a card, remove a card, or trade ${SALVAGE_COST} maximum integrity for a relic.`,
    cache: "Salvage cache · choose one card, and recover a few credits.",
    shop: `Market · spend credits on cards, relics, a Core Router, card removal or upgrades. You carry ${r.credits} credits.`,
    event: "Unknown signal · a short encounter. Every answer states its price before you choose.",
  }[n.type as "forge" | "cache" | "shop" | "event"] ?? "A hostile encounter.";
}
/** A hostile's portrait (its square cut-out, the rail's own image), as on the guardian entrance.
 * An unknown hostile leaves an empty, sized disc. */
export function hostilePortrait(id: string, cls = "hostile-portrait"): string {
  const art = ENEMIES[id]?.art;
  const attr = cls ? ` class="${cls}"` : "";
  if (!art) return `<span${attr}></span>`;
  return `<span${attr} style="background-image:url('${asset(`art/${art}`)}');background-size:contain;background-position:center"></span>`;
}
/** The chart's designation glyphs for a room: one diamond per ribbon, or the UNKNOWN static. */
function roomDesignations(scout: RoomScout): string {
  if (!scout.hidden && !scout.designations.length) return "";
  const marks = scout.hidden ? designationGlyph("unknown", 14)
    : scout.designations.map(id => designationGlyph(id, 14, DESIGNATIONS[id].kind)).join("");
  return `<span class="room-designation">${marks}</span>`;
}

export function mapMarkup(e: Expedition) {
  const r = e.run, stage = STAGES[r.stage],
    reachable = new Set(reachableRooms(r).map((n) => n.id));
  const pos = (n: MapRoom) => ({ x: 18 + n.lane * 30 + (n.floor % 2 ? 3 : -3), y: 90 - n.floor * 13.4 });
  const lines = r.map.flatMap((n) => r.map.filter((t) => connectsTo(n, t)).map((t) => {
    const a = pos(n), b = pos(t);
    const active = n.cleared && (t.cleared || reachable.has(t.id));
    return `<path d="M ${a.x} ${a.y} C ${a.x} ${a.y - 6},${b.x} ${b.y + 6},${b.x} ${b.y}" class="${active ? "traversed" : ""}"/>`;
  })).join("");
  const rooms = r.map.map((n) => {
    const p = pos(n), available = reachable.has(n.id);
    const scout = scoutRoom(r, n), lead = scout.members[0], pack = scout.members.length > 1;
    const detail = roomDetail(r, n);
    const name = n.type === "boss" ? stage.chapters[6] : lead ? title(ENEMIES[lead].name) : roomNames[n.type];
    // The icon and its colour carry the room type; the caption names what waits there,
    // the ordinal counts a pack, and the diamonds carry its designations.
    const caption = lead && n.type !== "boss" ? `<span class="room-scout">${esc(name)}</span>${roomDesignations(scout)}` : esc(name);
    const ordinal = pack ? `<span class="room-pack" aria-hidden="true">×${scout.members.length}</span>` : "";
    const cameos = lead && n.type !== "boss" && !n.cleared
      ? `<span class="room-cameos" aria-hidden="true">${scout.members.map(id => hostilePortrait(id, "room-cameo")).join("")}</span>` : "";
    const summary = !lead ? "" : pack
      ? `, ${esc(scout.members.map(hostileName).join(", "))}`
      : `, ${esc(name)}, ${scout.health[0] ?? encounterHealth(r.stage, n, r.ascension)} integrity`;
    return `<button class="route-room type-${n.type} ${available ? "available" : ""} ${n.cleared ? "cleared" : ""} ${pack ? "is-pack" : ""}" data-room="${n.id}" data-tooltip="${esc(detail)}" style="left:${p.x}%;top:${p.y}%" ${available ? "" : "disabled"} aria-label="Sector ${n.floor + 1}: ${esc(roomNames[n.type])}${summary}. ${esc(detail)}"><span class="room-orbit"></span>${cameos}<span class="room-symbol">${sicon(n.cleared ? "check" : roomIcons[n.type], n.type === "boss" ? 28 : 20)}</span>${ordinal}<span class="room-label">${caption}</span></button>`;
  }).join("");
  const legend = (["battle", "elite", "event", "shop", "cache", "forge"] as const)
    .map((k) => `<span class="legend-${k}"><i>${sicon(roomIcons[k], 13)}</i>${roomNames[k]}</span>`).join("") +
    `<span class="legend-pack"><b>×2</b>Pack</span>` +
    `<span class="legend-mark">${designationMark("bad", 13)}Bad designation</span>` +
    `<span class="legend-mark">${designationMark("good", 13)}Good designation</span>` +
    `<span class="legend-mark">${designationMark("unknown", 13)}Unknown</span>`;
  const relics = r.relics.map((id) => `<span class="carried-relic" data-tooltip="${esc(RELICS[id].rules)}" tabindex="0" aria-label="${esc(`${RELICS[id].name}: ${RELICS[id].rules}`)}">${relicEmblem(id, 13)}<span>${RELICS[id].name}</span></span>`).join("");
  return `<section class="map-screen"><aside class="map-story"><span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}${r.ascension ? ` · ASCENSION ${r.ascension}` : ""}</span><div class="chapter-sigil">${icon("map", 40)}</div><h1>${stage.chapters[Math.min(r.floor, 6)]}</h1><p>${r.stage === 0 && r.floor < 3 ? chapterForFloor(r.floor).description : stage.description}</p><blockquote class="story-fragment">“${stage.fragment}”</blockquote><div class="map-condition" role="group" aria-label="Expedition status"><span class="map-stat map-integrity">${icon("heart", 17)}<strong>${r.integrity}<small>/${r.maxIntegrity}</small></strong><small>Integrity</small></span><span class="map-stat map-credits">${sicon("coins", 17)}<strong>${r.credits}</strong><small>Credits</small></span><span class="map-stat">${icon("deck", 17)}<strong>${r.deck.length}</strong><small>Cards</small></span></div><div class="map-relics"><h2 class="map-section">Relics</h2><div class="relic-list">${relics}</div></div><div class="map-actions"><button class="plate-button" data-action="deck">${icon("deck", 16)} Examine deck</button><span class="map-seed">Seed <b>${r.seed.toString(16).toUpperCase()}</b></span></div></aside><div class="map-main"><div class="route-scroll" role="region" tabindex="0" aria-label="Route chart. Scroll to scout future sectors."><div class="route-chart"><div class="map-rings" aria-hidden="true"></div><svg class="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${rooms}</div></div><footer class="map-bottom"><div class="map-legend" aria-label="Map key">${legend}</div></footer></div></section>`;
}

// ------------------------------------------------------------------ rewards & relics

/** A screen's heading: the name of the place or choice, an optional line of flavour. */
const screenHead = (heading: string, flavour = "", kicker = "") =>
  `<header class="panel-head screen-head">${kicker ? `<span class="eyebrow">${kicker}</span>` : ""}<h1>${heading}</h1>${flavour ? `<p>${flavour}</p>` : ""}</header>`;
/** A hostile's proper name: its story name when it has one ("The Iron Regent"). */
const properName = (id: string) => enemyStory(id)?.name ?? hostileName(id);
/** The encounter's leader: the centre port (leader, single or guardian), else the first hostile. */
function leaderOf(enemies: readonly Enemy[]): Enemy | null {
  return enemies.find(enemy => enemy.port === "centre" && enemy.role !== "escort" && enemy.role !== "add") ?? enemies[0] ?? null;
}
/** The Victory kicker names the pack: "Coil Serpent silenced", "Static Nest and escort
 * silenced", "Spark Mite and Splicer silenced" (a duo has no leader to name first). */
function silencedLine(r: RunState, room?: MapRoom): string {
  const ids = r.enemies.length ? null : room ? scoutRoom(r, room).members : [];
  const leader = ids ? null : leaderOf(r.enemies);
  const leaderId = ids ? (room?.enemyId ?? null) : leader && leader.role !== "escort" ? leader.id : null;
  const members = ids ?? r.enemies.map(enemy => enemy.id);
  if (!members.length) return "Hostile silenced";
  if (!leaderId) return `${members.slice(0, 2).map(properName).join(" and ")}${members.length > 2 ? " and escort" : ""} silenced`;
  const escorts = members.length - 1;
  return `${properName(leaderId)}${escorts ? ` and escort${escorts > 1 ? "s" : ""}` : ""} silenced`;
}
/** The spoils plate: the total, then, when more than the room paid, its itemised ledger. */
function spoilsMarkup(r: RunState): string {
  const ledger = (r.creditLedger ?? []).filter(item => item.amount);
  const earned = r.creditsEarned ?? ledger.reduce((sum, item) => sum + item.amount, 0);
  if (!earned) return "";
  const items = ledger.length > 1
    ? `<span class="spoils-ledger">${ledger.map(item => `<span><b>${item.amount}</b> ${esc(item.label.toLowerCase())}</span>`).join('<i aria-hidden="true">·</i>')}</span>` : "";
  const label = `+${earned} credits${ledger.length > 1 ? `: ${ledger.map(item => `${item.amount} ${item.label.toLowerCase()}`).join(", ")}` : ""}`;
  return `<div class="spoils ${items ? "itemised" : ""}" role="status" aria-label="${esc(label)}">${sicon("coins", 20)}<b>+${earned}</b><span>credits</span>${items}</div>`;
}

export function rewardMarkup(r: RunState) {
  const room = r.map.find(room => room.id === r.currentRoom);
  const cache = room?.type === "cache", boss = room?.type === "boss", elite = room?.type === "elite";
  const final = boss && r.stage === STAGES.length - 1;
  const kicker = cache ? "" : boss ? `STAGE ${STAGES[r.stage].numeral} · GUARDIAN DEFEATED` : esc(silencedLine(r, encounterRoom(r) ?? room));
  const cue = boss ? final ? "Choose your last card" : "Choose a card, then a guardian's relic"
    : elite ? "Choose a card, then a relic" : "Choose a card";
  // Air Gap takes one card from every reward: the plate says so where the missing card would be.
  const gap = r.relics.includes("air-gap")
    ? `<div class="reward-gap" tabindex="0" data-tooltip="${esc(`${RELICS["air-gap"].name}: ${RELICS["air-gap"].rules}`)}" aria-label="${esc(`${RELICS["air-gap"].name}: every card reward offers one card fewer.`)}">${relicEmblem("air-gap", 22)}<strong>${esc(RELICS["air-gap"].name)}</strong><span>One card fewer</span></div>` : "";
  const cards = r.cardRewards.map((id, i) => cardMarkup(id, i, "reward")).join("");
  return `<section class="reward-screen full-screen v3"><div class="reward-emblem">${icon(cache ? "cache" : boss ? "crown" : "sword", 30)}</div>${screenHead(cache ? "Salvage Cache" : "Victory", "", kicker)}<p class="screen-cue">${cue}</p>${spoilsMarkup(r)}<div class="reward-cards${gap ? " has-gap" : ""}" data-count="${r.cardRewards.length}">${cards}${gap}</div><button class="plate-button reward-skip" data-action="skip-reward">Skip</button></section>`;
}

export function relicMarkup(r: RunState) {
  const room = r.map.find(room => room.id === r.currentRoom);
  const boss = r.relicRewards.some(id => RELICS[id].tier === "boss");
  const options = r.relicRewards.map((id, i) => {
    const relic = RELICS[id];
    const kind = `<small class="relic-kind">${relic.subtitle.replace(/^BOSS · /, "")}</small>`;
    if (boss) {
      const { boon, cost } = relicTerms(id);
      return `<button class="relic-option boss-relic" data-relic="${id}" style="--accent:${relic.color};--order:${i}" aria-label="${esc(`${relic.name}. ${relic.rules}`)}"><span class="relic-halo">${relicEmblem(id, 40)}</span>${kind}<strong>${relic.name}</strong><span class="relic-boon">${sicon("spark", 15)}<span>${esc(boon)}</span></span>${cost ? `<span class="relic-cost">${sicon("warn", 15)}<span>${esc(cost)}</span></span>` : ""}</button>`;
    }
    return `<button class="relic-option" data-relic="${id}" style="--accent:${relic.color};--order:${i}" aria-label="${esc(`${relic.name}. ${relic.rules}`)}"><span class="relic-halo">${relicEmblem(id, 36)}</span>${kind}<strong>${relic.name}</strong><span class="relic-rules">${esc(relic.rules)}</span></button>`;
  }).join("");
  // Clearing a guardian carries the expedition into the next stage with some integrity back.
  const mend = room?.type === "boss" && r.stage < STAGES.length - 1 ? Math.min(6, r.maxIntegrity - r.integrity) : 0;
  return `<section class="relic-screen full-screen v3 ${boss ? "boss-offer" : ""}">${screenHead("Choose a Relic", boss ? "Its power is yours. So is its price." : "")}<p class="screen-cue">${boss ? "Each rewrites a rule of your network for the rest of the expedition" : "Its effect lasts for the whole expedition"}</p>${mend ? `<div class="spoils" role="status">${icon("heart", 18)}<b>+${mend}</b><span>integrity on entering Stage ${STAGES[r.stage + 1].numeral}</span></div>` : ""}<div class="relic-options">${options}</div></section>`;
}

// ------------------------------------------------------------------ sanctuary

export function forgeMarkup(r: RunState) {
  const story = sanctuaryStory(r.floor, r.map.find(n => n.id === r.currentRoom)?.lane);
  const repair = Math.min(repairAmount(r), r.maxIntegrity - r.integrity);
  const noRelics = !relicPool(r, "common").length;
  const salvageBlocked = noRelics ? "All relics recovered"
    : r.maxIntegrity - SALVAGE_COST < SALVAGE_MIN_INTEGRITY ? `Requires <b>${SALVAGE_MIN_INTEGRITY + SALVAGE_COST}</b> max integrity` : "";
  const upgradable = r.deck.filter(id => canUpgrade(id)).length;
  const removable = r.deck.filter((_, i) => !removalBlocker(r, i)).length;
  const service = (verb: string, art: string, heading: string, text: string, note: string, disabled: boolean, glyph: string) =>
    `<button class="service-card" data-screen="${verb}" style="${artStyle(art)}" ${disabled ? "disabled" : ""}><span class="service-art"></span><span class="service-glyph">${sicon(glyph, 22)}</span><strong>${heading}</strong><span class="service-text">${text}</span><span class="service-note">${note}</span></button>`;
  const cards = (n: number) => `<b>${n}</b> card${n === 1 ? "" : "s"}`;
  // The first sentence of the sanctuary's story is what you find as you step in.
  const discovery = story.description.split(/(?<=\.)\s+/)[0];
  // Legacy Mainframe (boss relic): the sanctuary cannot repair; with nothing else to take, you move on.
  const mainframe = r.relics.includes("legacy-mainframe");
  const stuck = mainframe && !upgradable && !removable && !!salvageBlocked;
  const leave = stuck ? `<button class="plate-button forge-leave" data-screen="forge-leave">${sicon("arrow", 15)} Move on</button>` : "";
  return `<section class="forge-screen full-screen v3"><div class="reward-emblem">${icon("forge", 30)}</div>${screenHead("Sanctuary", esc(discovery))}<p class="screen-cue">${stuck ? "No service can help you here" : "Choose one service"}</p><div class="service-row">${[
    mainframe
      ? service("forge-repair", "patch", "Repair", `${esc(RELICS["legacy-mainframe"].name)}: sanctuaries cannot repair.`, `${relicEmblem("legacy-mainframe", 14)} <b>${r.integrity} / ${r.maxIntegrity}</b>`, true, "heart")
      : service("forge-repair", "patch", "Repair", repair ? `Restore ${repair} integrity.` : "Your integrity is already full.", `${icon("heart", 14)} <b>${r.integrity} / ${r.maxIntegrity}</b>`, false, "heart"),
    service("forge-upgrade", "startup-config", "Upgrade", "One card becomes its upgraded version, for good.", `${cards(upgradable)} can improve`, !upgradable, "upgrade"),
    service("forge-remove", "crosslink", "Remove", "Leave one card behind. Curses too.", `${cards(removable)} can go`, !removable, "remove"),
    service("forge-salvage", "firmware", "Salvage", `Sacrifice ${SALVAGE_COST} maximum integrity for one of three relics.`, salvageBlocked || `Max integrity <b>${r.maxIntegrity} → ${r.maxIntegrity - SALVAGE_COST}</b>`, !!salvageBlocked, "elite"),
  ].join("")}</div>${leave}${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ market

/** Each stage's market takes its name from the stage: The Copper Market, The Glass Market… */
const marketName = (stage: number) => `The ${STAGES[stage].name.split(" ")[1]} Market`;

export function shopMarkup(r: RunState) {
  const shop = r.shop;
  if (!shop) return "";
  const cards = shop.cards.map((offer, i) => {
    const card = CARDS[offer.id], afford = r.credits >= offer.price;
    const bench = i === 0 && offer.id === "router";
    // Each slot names its shelf: the hardware bench, the keeper's own cards, or the shared colorless pool.
    const house = card.archetype ?? "colorless";
    const shelf = bench ? `<span class="market-house is-bench" data-tooltip="The hardware bench: a Core Router, always in stock.">${sicon("stall", 13)}<span>Bench</span></span>`
      : `<span class="market-house house-${house}" style="--house:${HOUSE_COLORS[house]}" data-tooltip="${esc(card.archetype ? `${ARCHETYPES[card.archetype].name}'s shelf: cards only this keeper is offered.` : "Colorless shelf: cards every keeper can take.")}">${houseSigil(house, 13)}<span>${card.archetype ? HOUSE_NAMES[house] : "Colorless"}</span></span>`;
    return `<div class="market-offer ${offer.sold ? "sold" : ""} ${!offer.sold && !afford ? "short" : ""} ${bench ? "bench" : ""} house-${bench ? "bench" : house}" style="--order:${i}">${shelf}${cardFace(offer.id)}${offer.sold ? '<span class="sold-stamp">Sold</span>' : ""}<button class="price-button" data-screen="buy-card" data-index="${i}" ${offer.sold ? "disabled" : ""} aria-label="${esc(offer.sold ? `${card.name}, sold` : `Buy ${card.name} for ${offer.price} credits${afford ? "" : ", not enough credits"}. ${card.rules}`)}">${offer.sold ? "Sold" : credits(offer.price, 15)}</button></div>`;
  }).join("");
  const relics = shop.relics.map((offer, i) => {
    const relic = RELICS[offer.id], afford = r.credits >= offer.price;
    return `<div class="market-relic ${offer.sold ? "sold" : ""} ${!offer.sold && !afford ? "short" : ""}" style="--accent:${relic.color}">${relicEmblem(offer.id, 24)}<span class="market-relic-copy"><strong>${relic.name}</strong><span>${esc(relic.rules)}</span></span><button class="price-button" data-screen="buy-relic" data-index="${i}" ${offer.sold ? "disabled" : ""} aria-label="${esc(offer.sold ? `${relic.name}, sold` : `Buy ${relic.name} for ${offer.price} credits${afford ? "" : ", not enough credits"}. ${relic.rules}`)}">${offer.sold ? "Sold" : credits(offer.price, 15)}</button></div>`;
  }).join("");
  const service = (verb: "shop-remove" | "shop-upgrade", used: boolean, price: number, glyph: string, heading: string, text: string) =>
    `<button class="market-service ${used ? "sold" : ""} ${!used && r.credits < price ? "short" : ""}" data-screen="${verb}" ${used ? "disabled" : ""}><span class="service-glyph">${sicon(glyph, 18)}</span><span class="market-service-copy"><strong>${heading}</strong><span>${used ? "Done for this visit." : text}</span></span><span class="price-tag">${used ? "Used" : credits(price, 15)}</span></button>`;
  return `<section class="market-screen full-screen"><header class="market-head"><div><h1>${marketName(r.stage)}</h1><p>Salvage, sold by lantern light.</p></div><div class="purse" role="status" aria-label="${r.credits} credits">${sicon("coins", 24)}<strong>${r.credits}</strong><small>Credits</small></div></header><div class="market-shelf" aria-label="Cards for sale">${cards}</div><div class="market-lower"><section class="market-relics" aria-label="Relics for sale"><h2 class="market-section">Relics</h2>${relics || '<p class="market-empty">No relics left to trade.</p>'}</section><section class="market-services" aria-label="Services"><h2 class="market-section">Services <small>Once per visit</small></h2>${service("shop-remove", shop.removed, shop.removePrice, "remove", "Remove a card", "Curses and dead weight, gone.")}${service("shop-upgrade", shop.upgraded, shop.upgradePrice, "upgrade", "Upgrade a card", "One card becomes its + version.")}</section><div class="market-exit"><button class="gold-button" data-screen="leave-shop">Leave market</button><button class="plate-button" data-action="deck">${icon("deck", 15)} Examine deck</button></div></div>${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ events

export function eventMarkup(r: RunState) {
  const view = eventView(r);
  if (!view) return "";
  const art = asset(`art/${view.art ?? "relay-interior"}.png`);
  const choices = view.choices.map((choice, i) => `<button class="event-choice ${choice.disabled ? "disabled" : ""}" data-screen="event-choice" data-index="${i}" ${choice.disabled ? `aria-disabled="true"` : ""} style="--order:${i}"><span class="choice-mark"><span>${i + 1}</span></span><span class="choice-copy"><strong>${esc(choice.label)}</strong><span>${esc(choice.detail)}</span>${choice.disabled ? `<small class="choice-blocked">${sicon("lock", 13)} ${esc(choice.disabled)}</small>` : choice.needsCard ? `<small class="choice-needs">${sicon("deck", 13)} ${NEED_VERB[choice.needsCard]} a card from your deck</small>` : ""}</span></button>`).join("");
  return `<section class="event-screen full-screen ${view.resolved ? "resolved" : ""}"><div class="event-frame"><figure class="event-art" aria-hidden="true" style="background-image:url('${art}')"><i></i></figure><div class="event-copy"><span class="eyebrow">${sicon("signal", 14)} ${esc(view.kicker)}</span><h1>${esc(view.title)}</h1><p class="event-text">${esc(view.text)}</p>${view.resolved ? `<div class="event-outcome" role="status"><p>${esc(view.outcome ?? "")}</p><button class="gold-button" data-screen="event-leave">Continue</button></div>` : `<div class="event-choices" role="group" aria-label="Your answer">${choices}</div>`}</div></div>${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ entrance

/** The entrance lines of a fresh encounter (design 13.5), in content's words so the title card
 * and the combat log agree: each designation the leader carries ("NESTING · its first action also
 * plants a Siphon Tap"), marked when interference hid it on the chart, and an announced
 * reinforcement in coral ("SIGNAL DETECTED · a Splicer arrives in 2 actions"). A Shedding
 * escort is announced when it sheds, not here. */
export interface EntranceLine { kind: "bad" | "good" | "arrival"; word: string; text: string; revealed?: boolean }
export function entranceLines(r: RunState): EntranceLine[] {
  const split = (line: string) => {
    const at = line.indexOf(" · ");
    return { word: line.slice(0, at), text: line.slice(at + 3).replace(/\.$/, "") };
  };
  const leader = leaderOf(r.enemies);
  const room = encounterRoom(r);
  const lines: EntranceLine[] = [];
  if (leader && leader.role !== "escort" && leader.role !== "add")
    for (const id of leader.designations ?? [])
      lines.push({ kind: DESIGNATIONS[id].kind, ...split(designationEntranceLine(id, r.stage)), revealed: !!room?.designationHidden });
  const arrival = r.reinforcement;
  if (arrival && !arrival.shed && arrival.after > 0)
    lines.push({ kind: "arrival", ...split(reinforcementEntranceLine(hostileName(arrival.enemyId), arrival.after)) });
  return lines;
}
/** The title card that names the encounter ground, with the entrance lines beneath it. */
export function terrainTitleMarkup(r: RunState): { html: string; lines: number } | null {
  const lines = entranceLines(r);
  if (!r.terrain && !lines.length) return null;
  const ground = r.terrain
    ? `<span>${icon("terrain", 15)} Encounter ground</span><strong>${esc(r.terrain.name)}</strong><i class="ornament-rule"></i><p>${esc(r.terrain.description)}</p>`
    : `<span>${icon("terrain", 15)} Encounter</span>`;
  // A ribbon that was hidden on the chart shows its static glyph giving way to its colour.
  const mark = (line: EntranceLine) => line.kind === "arrival" ? sicon("signal", 15)
    : line.revealed ? `<span class="entrance-reveal">${designationMark("unknown", 15)}${designationMark(line.kind, 15)}</span>` : designationMark(line.kind, 15);
  const entrance = lines.map(line => `<div class="entrance-line is-${line.kind}${line.revealed ? " is-revealed" : ""}">${mark(line)}<b>${esc(line.word)}</b><em>${esc(line.text)}</em></div>`).join("");
  return { html: `${ground}${entrance ? `<div class="entrance-lines">${entrance}</div>` : ""}`, lines: lines.length };
}

// ------------------------------------------------------------------ guardian intro, outcome, settings

/** The guardian's adds, in one sentence: what the charge raises and what each costs the break. */
function guardianAdds(guardianId: string, warning: string): string {
  const adds = Object.values(ENEMIES).filter(enemy => enemy.kind === "add" && enemy.addOf === guardianId);
  if (!adds.length || !RULES.addBreakBonus) return "";
  const names = `${hostileName(adds[0].id)}s`;
  // Content's warning may already name them; the sentence is never said twice.
  if (warning.includes(names)) return "";
  return ` Its charge raises two ${names} at the outer ports; each one alive when the ultimate resolves raises the break threshold by ${RULES.addBreakBonus}.`;
}
export function bossIntroMarkup(r: RunState) {
  const guardian = leaderOf(r.enemies)!;
  const enemy = ENEMIES[guardian.id], stage = STAGES[r.stage];
  return `<section class="guardian-entrance guardian-${enemy.id}" aria-labelledby="guardian-name" style="--guardian-color:#${enemy.color.toString(16).padStart(6,"0")}">
    <div class="guardian-portrait" aria-hidden="true"><i></i>${hostilePortrait(enemy.id, "")}</div>
    <div class="guardian-introduction"><div class="guardian-stages" aria-label="Stage ${stage.numeral} of ${STAGES.length}">${STAGES.map((s,i)=>`<span class="${i === r.stage ? "current" : i < r.stage ? "cleared" : ""}"><b>${i < r.stage ? icon("check",13) : s.numeral}</b></span>`).join('<i></i>')}</div>
    <span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}</span><p class="guardian-arrival">${enemy.boss!.entrance}</p>
    <h1 id="guardian-name">${title(enemy.name.replace(/^THE /,""))}</h1><span class="guardian-subtitle">${enemy.title}</span>
    <div class="guardian-challenge"><span>${icon("heart",17)}<b>${guardian.maxHp}</b> Integrity</span><span>${icon("boss",17)} Stage guardian</span></div>
    <p class="guardian-warning">${enemy.boss!.warning}${guardianAdds(enemy.id, enemy.boss!.warning)}</p><div class="guardian-actions"><button class="gold-button" data-action="close" autofocus>Face the guardian</button><small class="guardian-skip"><kbd>Enter</kbd> Begin <i></i> <kbd>Esc</kbd> Skip</small></div></div>
  </section>`;
}

export function outcomeMarkup(e: Expedition) {
  const r = e.run, won = r.phase === "won", story = OUTCOMES[won ? "won" : "lost"];
  const progress = loadProgress();
  const unlock = won && progress.lastUnlock && progress.lastUnlock.seed === r.seed && progress.lastUnlock.archetype === e.archetype ? progress.lastUnlock.level : null;
  const sectors = Math.min(21, r.stage * 7 + r.floor);
  const stat = (value: string | number, label: string) => `<span><strong>${value}</strong><small>${label}</small></span>`;
  return `<section class="outcome-screen full-screen v3 ${won ? "victory" : "defeat"}"><div class="outcome-symbol">${sicon(won ? "crown" : "severed", 46)}</div>${screenHead(won ? "Backbone Restored" : "Signal Lost", story.title, ARCHETYPES[e.archetype].name.toUpperCase())}<p class="outcome-story">${story.description}${won ? ` ${ARCHETYPE_STORIES[e.archetype].epilogue}` : ""}</p>${unlock !== null ? `<div class="unlock-moment" role="status">${sicon("ascend", 22)}<span><strong>Ascension ${unlock} unlocked</strong><em>${esc(ASCENSION_LEVELS[unlock - 1]?.name ?? "")} · ${esc(ASCENSION_LEVELS[unlock - 1]?.rule ?? "")}</em></span></div>` : ""}<div class="outcome-stats">${stat(r.score.toLocaleString(), "Score")}${stat(`${sectors}<small>/21</small>`, "Sectors")}${stat(r.deck.length, "Cards")}${stat(r.relics.length, "Relics")}${r.ascension ? stat(r.ascension, "Ascension") : ""}</div><div class="button-row outcome-actions"><button class="gold-button" data-action="new">New expedition</button><button class="plate-button" data-action="title">Return to title</button></div></section>`;
}

const NOTE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5.5l11-2.5v12.5"/><ellipse cx="6.5" cy="18" rx="2.5" ry="2"/><ellipse cx="17.5" cy="15.5" rx="2.5" ry="2"/><path d="m9 9 11-2.5"/></svg>';
/** The soundtrack notice: an engraved plate that names a new track, then fades. */
export function trackMarkup(title: string) {
  return `${NOTE}${sicon("warn", 16)}<span class="track-title">${esc(title)}</span>`;
}

/** The battle's keys (main.ts keydown): the table carries no legend, Options lists them. */
const KEY_LEGEND: [string, string][] = [
  ["<kbd>1</kbd>–<kbd>0</kbd>", "Play or choose a card in hand"],
  ["<kbd>C</kbd>", "Console command"],
  ["<kbd>Space</kbd> <kbd>Enter</kbd>", "Transmit and end the turn"],
  ["<kbd>P</kbd>", "Prepare a card for next turn"],
  ["<kbd>Z</kbd>", "Undo"],
  ["<kbd>Esc</kbd>", "Put a card back · Options"],
  ["<kbd>F</kbd>", "Target the next hostile"],
  ["<kbd>S</kbd> · <kbd>R</kbd>", "Scrub an installation · repair a worn device"],
  ["<kbd>I</kbd> · right-click", "Inspect a card"],
  ["Point · <kbd>Tab</kbd>", "Read a card in hand, large"],
];
export function settingsMarkup(s: AudioSettings, inRun: boolean, preferences: Preferences, fullscreen: boolean) {
  const volume = (key: "music" | "effects", label: string) => {
    const value = Math.round(s[key] * 100);
    return `<label class="setting-row setting-slider"><span>${label}</span><input type="range" min="0" max="100" value="${value}" style="--value:${value}%" data-setting="${key}" aria-label="${label} volume"/><output>${value}%</output></label>`;
  };
  const toggle = (label: string, attr: string, on: boolean) =>
    `<label class="setting-row setting-toggle"><span>${label}</span><input type="checkbox" ${attr} ${on ? "checked" : ""}/><i></i></label>`;
  return `<div class="settings-content"><div class="panel-head"><h2>Options</h2></div>
    <section class="settings-group"><h3>Audio</h3>${toggle("Sound", 'data-setting="sound"', !s.muted)}${volume("music", "Music")}${volume("effects", "Sound effects")}</section>
    <section class="settings-group"><h3>Gameplay</h3>${toggle("Motion & screen shake", 'data-setting="motion"', s.motion)}${toggle("Contextual field notes", 'data-preference="tips"', preferences.tips)}${toggle("Quick transmissions", 'data-preference="fast"', preferences.fast)}</section>
    <section class="settings-group"><h3>Display</h3>${toggle("Fullscreen", 'data-setting="fullscreen"', fullscreen)}</section>
    <section class="settings-group controls-group"><h3>Controls</h3><dl class="key-legend">${KEY_LEGEND.map(([keys, what]) => `<div><dt>${keys}</dt><dd>${what}</dd></div>`).join("")}</dl></section>
    <div class="settings-actions button-row"><button class="gold-button" data-action="close">Return</button>${inRun ? '<button class="plate-button" data-action="save-exit">Save & return to title</button>' : ""}<button class="text-button" data-action="credits">Credits</button></div></div>`;
}

export function creditsMarkup() {
  const section = (head: string, body: string) => `<section><h3>${head}</h3><p>${body}</p></section>`;
  return `<div class="panel-head"><h2>Credits</h2></div><div class="credits-copy">${[
    section("Created by Florian Schwarz", 'Original FAULTLINE created by Florian Schwarz — <a href="https://flosch.me/" target="_blank" rel="noopener noreferrer">flosch.me</a>'),
    section("The Containerlab universe", "Inspired by Containerlab and the networks we build together. FAULTLINE is an independent fan project. The Containerlab mark is used under its original license."),
    section("Original art", "Relay cathedral, the Glass Cathedral and Blackout Heart environments, sanctuary, an expanded illustrated card collection, hostile creatures and painted interface pieces created for this game using OpenAI image generation and local Krea 2 Turbo. Artwork prompts and production details are included in the project."),
    section("Typography", "Cinzel, Grenze, Alegreya and Alegreya Sans SC, under the SIL Open Font License."),
    section("Original score · YuE2", `${Object.values(TRACK_TITLES).join(" · ")}. Generated locally with the official YuE2 model and listening decoder. Original instrumental arrangements retain their complete generated mix. Generation prompts and provenance are included in the project.`),
    section("Lore films", "The Night of the Fault and Whoever Answers: 130 paintings made with local Krea 2 Turbo, each film scored with one continuous piece generated with YuE2, composited in the browser."),
    section("Sound effects · Kenney", "Recorded card Foley, metal, glass and impact materials from Kenney’s CC0 Casino Audio, Impact Sounds and Sci-fi Sounds packs. Layered and mastered for FAULTLINE; source recordings, licenses and recipes are included."),
    section("License &amp; source", `Copyright © 2026 Florian Schwarz and FAULTLINE contributors. You may redistribute and modify this work under <a href="${import.meta.env.BASE_URL}LICENSE.txt" target="_blank" rel="noopener noreferrer">GNU GPLv3</a> with <a href="${import.meta.env.BASE_URL}ATTRIBUTION.txt" target="_blank" rel="noopener noreferrer">section 7(b) attribution terms</a>. Distributed without any warranty. <a href="https://github.com/FloSch62/faultline" target="_blank" rel="noopener noreferrer">Source code</a>. Separately licensed materials retain their <a href="${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">original terms</a>.`),
    section("A real network, in miniature", "Packets and faults are simulated in your browser. You can export the topology to Containerlab; real routing requires device configuration and container images."),
  ].join("")}</div><div class="button-row credits-actions"><button class="plate-button" data-action="settings">Back</button></div>`;
}

/** Starting over asks once, plainly. */
export function replaceMarkup(run: RunState) {
  return `<div class="panel-head"><h2>Abandon expedition?</h2></div><p class="confirm-copy">Your saved expedition in Stage ${STAGES[run.stage].numeral}, Sector ${Math.min(7, run.floor + 1)} will be lost.</p><div class="confirm-actions button-row"><button class="gold-button" data-action="confirm-replace">Begin anew</button><button class="plate-button" data-action="close">Keep current</button></div>`;
}
