/** Expedition screens: title, archetype selection, map, rewards, relics,
 * sanctuary, market, events and outcomes. Battle UI lives in ui.ts.
 * Screens emit `data-screen` controls; main.ts forwards them to screenAction. */
import "./screens.css";
import { ENEMIES } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { BASE_CARD_IDS, CARDS, RELICS, RULES, canUpgrade, upgraded } from "./core/cards.ts";
import {
  ARCHETYPES,
  type Archetype,
  type Expedition,
  type RunRecord,
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
import type { CardId, MapRoom, RelicId, RunState } from "./core/types.ts";
import type { AudioSettings } from "./audio.ts";
import type { EffectKind } from "./audio-effects.ts";
import type { Preferences } from "./preferences.ts";
import { chapterForFloor, ARCHETYPE_STORIES, sanctuaryStory, OUTCOMES } from "./story.ts";
import { asset, esc, icon, artStyle, cardMarkup } from "./ui.ts";

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
      if (Number.isInteger(level) && level >= 0 && level <= MAX_ASCENSION) cleared[id] = level;
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

const PICKER_COPY: Record<PickerMode, { eyebrow: string; heading: string; verb: string; icon: string }> = {
  "forge-upgrade": { eyebrow: "SANCTUARY · THE WORKBENCH", heading: "Improve one card, for good.", verb: "Upgrade", icon: "upgrade" },
  "forge-remove": { eyebrow: "SANCTUARY · TRAVEL LIGHTER", heading: "Leave one card behind.", verb: "Remove", icon: "remove" },
  "shop-upgrade": { eyebrow: "THE MARKET · FIRMWARE BENCH", heading: "Pay to improve one card.", verb: "Upgrade", icon: "upgrade" },
  "shop-remove": { eyebrow: "THE MARKET · SCRAP DEALER", heading: "Pay to remove one card.", verb: "Remove", icon: "remove" },
  event: { eyebrow: "UNKNOWN SIGNAL", heading: "Choose a card.", verb: "Choose", icon: "check" },
};
const NEED_VERB = { upgrade: "Upgrade", remove: "Remove", transform: "Transform", duplicate: "Duplicate" } as const;

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
  let heading = copy.heading, verb = copy.verb, detail = "";
  let blocker: (i: number) => string | null;
  let kind: "upgrade" | "remove" | "transform" | "duplicate";
  if (active.mode === "event") {
    const choice = eventView(run)?.choices[active.choice ?? -1];
    kind = choice?.needsCard ?? "remove";
    verb = NEED_VERB[kind];
    heading = choice ? choice.label : heading;
    detail = choice?.detail ?? "";
    blocker = i => cardChoiceBlocker(run, kind, i);
  } else if (active.mode.endsWith("upgrade")) {
    kind = "upgrade";
    blocker = i => upgradeBlocker(run, i);
    detail = active.mode === "shop-upgrade" ? `Costs ${run.shop?.upgradePrice ?? 0} credits. One upgrade per visit.` : "This is your sanctuary service. The change is permanent.";
  } else {
    kind = "remove";
    blocker = i => removalBlocker(run, i);
    detail = active.mode === "shop-remove" ? `Costs ${run.shop?.removePrice ?? 0} credits. One removal per visit.` : "This is your sanctuary service. A lighter deck draws its best cards more often.";
  }
  const order = run.deck.map((id, i) => ({ id, i })).sort((a, b) =>
    CARDS[a.id].name.localeCompare(CARDS[b.id].name) || a.i - b.i);
  const available = order.filter(({ i }) => !blocker(i)).length;
  const tiles = order.map(({ id, i }) => {
    const blocked = blocker(i);
    const preview = kind === "upgrade" && !blocked;
    const label = `${verb} ${CARDS[id].name}${blocked ? `. Unavailable: ${blocked}` : preview ? `. ${upgradeSummary(id)}. After: ${CARDS[upgraded(id)].rules}` : ""}`;
    return `<button class="pick-tile pick-${kind} ${blocked ? "blocked" : ""}" data-screen="pick" data-index="${i}" ${blocked ? `disabled data-tooltip="${esc(blocked)}"` : ""} aria-label="${esc(label)}">
      <span class="pick-face pick-before">${cardFace(id)}</span>
      ${preview ? `<span class="pick-face pick-after">${cardFace(upgraded(id))}</span>` : ""}
      <span class="pick-stamp">${sicon(copy.icon, 16)} ${verb.toUpperCase()}</span>
      <span class="pick-caption">${blocked ? `${sicon("lock", 12)} ${esc(blocked)}` : preview ? `${sicon("upgrade", 12)} ${esc(upgradeSummary(id))}` : esc(CARDS[id].subtitle.split(" / ")[1] ?? "")}</span>
    </button>`;
  }).join("");
  return `<div class="picker-layer" role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <div class="picker-panel">
      <header class="picker-head"><div><span class="eyebrow">${copy.eyebrow}</span><h2 id="picker-title">${esc(heading)}</h2><p>${esc(detail)}</p></div>
      <div class="picker-meta"><span>${available} of ${run.deck.length} cards eligible</span>${kind === "upgrade" ? "<small>Hover or focus a card to preview its upgrade.</small>" : ""}<button class="text-button" data-screen="pick-cancel">${icon("back", 14)} Back · Esc</button></div></header>
      <div class="picker-grid">${tiles}</div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ title & selection

export function titleMarkup(saved: Expedition | null, records: RunRecord[]) {
  const canContinue = saved && !["won", "lost"].includes(saved.run.phase);
  const progress = loadProgress();
  const highest = Math.max(-1, ...Object.values(progress.cleared).map(v => v ?? -1));
  const discoveries = BASE_CARD_IDS.filter(id => !CARDS[id].junk && !CARDS[id].curse).length;
  const wins = records.filter(r => r.won).length;
  const ascension = canContinue && saved.run.ascension ? ` · A${saved.run.ascension}` : "";
  return `<section class="title-screen"><div class="title-copy"><div class="eyebrow title-eyebrow"><i></i>A CONTAINERLAB ODYSSEY</div><h1>FAULTLINE</h1><div class="title-subtitle"><span></span>Every connection matters.<span></span></div><p>At the edge of a silent world,<br>one signal is still alive.</p><nav class="title-menu" aria-label="Main menu">${canContinue ? `<button class="menu-primary" data-action="continue"><span><small>STAGE ${STAGES[saved.run.stage].numeral} · SECTOR ${Math.min(7, saved.run.floor + 1)} · ${ARCHETYPES[saved.archetype].name.replace(/^The /, "").toUpperCase()}${ascension}</small>Continue expedition</span>${icon("arrow", 22)}</button>` : ""}<button class="${canContinue ? "menu-link" : "menu-primary"}" data-action="new"><span>${canContinue ? "" : "<small>THE SIGNAL IS CALLING</small>"}New expedition</span>${canContinue ? "<small>THREE STAGES · THREE GUARDIANS</small>" : icon("arrow", 22)}</button><button class="menu-link" data-action="daily"><span>Daily expedition</span><small>ONE SHARED SIGNAL · EVERY DAY</small></button><button class="menu-link" data-action="tutorial"><span>Field training</span><small>LEARN EVERY SYSTEM · PLAY IT</small></button><button class="menu-link" data-action="help"><span>Handbook</span><small>RULES · DANGER PLAYBOOK</small></button><button class="menu-link" data-action="collection"><span>Card archive</span><small>${discoveries} DISCOVERIES</small></button></nav><div class="title-progress">${records.length ? `${wins} BACKBONE${wins === 1 ? "" : "S"} RESTORED <span>·</span> BEST ${Math.max(...records.map((r) => r.score)).toLocaleString()}${highest >= 0 ? ` <span>·</span> ASCENSION ${highest} CLEARED` : ""}` : "BUILD YOUR NETWORK <span>·</span> DEFEND THE SIGNAL"}</div></div><div class="world-caption"><span>01 / THE SUNKEN RELAY</span><p>Some things are worth reconnecting.</p><i></i></div><div class="title-bottom"><span>ALPHA · STRATEGY. CONSEQUENCE. CONNECTION.</span><span>HEADPHONES RECOMMENDED ${icon("sound", 14)}</span></div></section>`;
}

function ascensionPanel(archetype: Archetype): string {
  const unlocked = unlockedAscension(archetype), level = chosenAscension(archetype);
  const pips = Array.from({ length: MAX_ASCENSION + 1 }, (_, n) => {
    const locked = n > unlocked;
    const rule = n === 0 ? "The standard expedition." : ASCENSION_LEVELS[n - 1].rule;
    return `<button class="asc-pip ${n === level ? "current" : ""} ${n < level ? "included" : ""} ${locked ? "locked" : ""}" data-screen="ascension" data-for="${archetype}" data-level="${n}" ${locked ? "disabled" : ""} aria-pressed="${n === level}" aria-label="Ascension ${n}${locked ? ", locked. Win at ascension " + (n - 1) + " to unlock" : ": " + rule}" data-tooltip="${esc(locked ? `Locked · win with ${ARCHETYPES[archetype].name} at ascension ${n - 1}` : n === 0 ? "Ascension 0 · the standard expedition" : `Ascension ${n} · ${ASCENSION_LEVELS[n - 1].name}: ${rule}`)}">${locked ? sicon("lock", 11) : `<span>${n}</span>`}</button>`;
  }).join("");
  const earlier = ASCENSION_LEVELS.slice(0, Math.max(0, level - 1));
  const current = level ? ASCENSION_LEVELS[level - 1] : null;
  const summary = current
    ? `<strong>${esc(current.name)}</strong> <span>${esc(current.rule)}</span>${earlier.length ? ` <span class="asc-more" tabindex="0" data-tooltip="${esc(earlier.map(a => `${a.level} · ${a.rule}`).join("  "))}" aria-label="${esc(`Also in effect: ${earlier.map(a => a.rule).join(" ")}`)}">+ ${earlier.length} earlier rule${earlier.length > 1 ? "s" : ""}</span>` : ""}`
    : `<strong>Standard expedition.</strong> <span>${unlocked ? `Ascension 1–${unlocked} unlocked for ${ARCHETYPES[archetype].name}.` : `Win with ${ARCHETYPES[archetype].name} to unlock ascension 1.`}</span>`;
  return `<div class="ascension-panel" role="group" aria-label="Ascension">
    <div class="asc-label">${sicon("ascend", 18)}<span><small>ASCENSION</small><strong>${level}</strong></span></div>
    <div class="asc-track" role="group" aria-label="Choose ascension level">${pips}</div>
    <p class="asc-summary">${summary}</p>
  </div>`;
}

export function selectMarkup(selected: Archetype, daily: boolean, replace: boolean) {
  const ids = Object.keys(ARCHETYPES) as Archetype[];
  const cards = ids.map((id, i) => {
    const a = ARCHETYPES[id], consoleDef = CONSOLES[a.console], engine = ENGINES[id], relic = RELICS[a.relic];
    const consoleSummary = consoleDef.rules.split(/(?<=\.)\s+/)[0];
    return `<button class="archetype v3 ${selected === id ? "chosen" : ""}" data-archetype="${id}" aria-pressed="${selected === id}" style="${artStyle(a.art)};--accent:${a.color}" aria-label="${esc(`${a.name}. ${a.title}. Console: ${consoleDef.name}, ${consoleDef.rules} Relic: ${relic.name}, ${relic.rules} Engine: ${engine.name}. ${a.integrity} integrity.`)}">
      <span class="archetype-art"></span><span class="archetype-number">0${i + 1}</span><span class="selection-tick">${icon("check", 16)}</span>
      <span class="archetype-copy"><small>${a.title}</small><strong>${a.name}</strong>
        <span class="kit">
          <span class="kit-row" data-tooltip="${esc(consoleDef.rules)}"><i>${sicon("console", 15)}</i><span><em>CONSOLE · ${consoleDef.cost} ENERGY</em><b>${consoleDef.name}</b><span>${esc(consoleSummary)}</span></span></span>
          <span class="kit-row"><i>${relicEmblem(a.relic, 14)}</i><span><em>STARTING RELIC</em><b>${relic.name}</b><span>${esc(relic.rules)}</span></span></span>
          <span class="kit-row"><i>${sicon("engine", 15)}</i><span><em>ENGINE</em><b>${engine.name}</b><span>${esc(engine.rules)}</span></span></span>
        </span>
        <span class="archetype-health">${icon("heart", 13)} ${a.integrity} INTEGRITY</span>
      </span></button>`;
  }).join("");
  return `<section class="selection-screen full-screen v3"><button class="back-link" data-action="title">${icon("back")} RETURN</button><button class="deck-link" data-action="loadout">${icon("deck", 14)} STARTING DECK</button><div class="screen-heading"><span class="eyebrow">${daily ? "THE DAILY EXPEDITION" : "A NEW EXPEDITION"}</span><h1>Who carries the signal?</h1><p class="chosen-story">${esc(ARCHETYPE_STORIES[selected].story)}</p></div><div class="archetypes">${cards}</div><div class="selection-footer">${ascensionPanel(selected)}<button class="gold-button embark" data-action="embark">Enter the Faultline ${icon("arrow", 20)}</button></div><p class="selection-note">${replace ? "Starting this expedition replaces your current saved run." : daily ? "A shared daily seed. Progress saves automatically." : "Three stages. Three guardians. Progress saves automatically."}</p></section>`;
}

// ------------------------------------------------------------------ header & map

export function headerMarkup(e: Expedition | null, inTitle: boolean, settings: AudioSettings) {
  const r = e?.run;
  return `<div class="brand"><img src="${asset("containerlab-mark.svg")}" alt="Containerlab"/><span>${inTitle ? "CONTAINERLAB" : "FAULTLINE"}<small>${inTitle ? "TRANSMISSIONS FROM THE EDGE" : "A CONTAINERLAB ODYSSEY"}</small></span></div>${!inTitle && r ? `<div class="run-stats"><span class="integrity-stat" data-tooltip="Integrity persists between encounters">${icon("heart", 17)} <b>${r.integrity}</b><small>/${r.maxIntegrity}</small></span><span class="stat-divider"></span><span class="credits-stat" data-tooltip="Credits: spend them at a Market" aria-label="${r.credits} credits">${sicon("coins", 17)} <b>${r.credits}</b></span><span class="stat-divider"></span><button data-action="deck" data-tooltip="View your deck" aria-label="View your deck, ${r.deck.length} cards">${icon("deck", 17)} ${r.deck.length}</button><span class="stat-divider"></span><span class="stage-stat" data-tooltip="${STAGES[r.stage].name}">STAGE <b>${STAGES[r.stage].numeral}</b><small> / III</small></span><span class="stat-divider"></span><span class="sector-stat">SECTOR <b>${String(Math.min(r.floor + 1, 7)).padStart(2, "0")}</b> / 07</span>${r.ascension ? `<span class="stat-divider"></span><span class="ascension-stat" data-tooltip="${esc(ASCENSION_LEVELS.slice(0, r.ascension).map(a => `${a.level}. ${a.rule}`).join(" "))}">${sicon("ascend", 15)} <b>${r.ascension}</b></span>` : ""}</div>` : ""}<nav class="header-controls" aria-label="Game controls"><button data-action="sound" aria-label="${settings.muted ? "Enable" : "Mute"} audio" data-tooltip="${settings.muted ? "Enable" : "Mute"} audio">${icon(settings.muted ? "mute" : "sound")}</button><button data-action="fullscreen" aria-label="Toggle fullscreen" data-tooltip="Fullscreen">${icon("full")}</button><button data-action="settings" aria-label="Open settings" data-tooltip="Settings">${icon("settings", 20)}</button></nav>`;
}

export const roomNames: Record<MapRoom["type"], string> = {
  battle: "Hostile signal",
  elite: "Elite threat",
  cache: "Salvage cache",
  forge: "Sanctuary",
  boss: "Stage guardian",
  shop: "Market",
  event: "Unknown signal",
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
function roomDetail(r: RunState, n: MapRoom): string {
  const scout = n.enemyId ? ENEMIES[n.enemyId] : null;
  if (scout) return `${scout.name} · ${encounterHealth(r.stage, n, r.ascension)} integrity. ${scout.trait}`;
  return {
    forge: `Sanctuary · one service: repair ${repairAmount(r)} integrity, upgrade a card, remove a card, or trade ${SALVAGE_COST} maximum integrity for a relic.`,
    cache: "Salvage cache · choose one card, and recover a few credits.",
    shop: `Market · spend credits on cards, relics, a Core Router, card removal or upgrades. You carry ${r.credits} credits.`,
    event: "Unknown signal · a short encounter. Every answer states its price before you choose.",
  }[n.type as "forge" | "cache" | "shop" | "event"] ?? "A hostile encounter.";
}

export function mapMarkup(e: Expedition) {
  const r = e.run, stage = STAGES[r.stage],
    reachable = new Set(reachableRooms(r).map((n) => n.id));
  const pos = (n: MapRoom) => ({ x: 18 + n.lane * 30 + (n.floor % 2 ? 3 : -3), y: 86 - n.floor * 12 });
  const lines = r.map.flatMap((n) => r.map.filter((t) => connectsTo(n, t)).map((t) => {
    const a = pos(n), b = pos(t);
    const active = n.cleared && (t.cleared || reachable.has(t.id));
    return `<path d="M ${a.x} ${a.y} C ${a.x} ${a.y - 6},${b.x} ${b.y + 6},${b.x} ${b.y}" class="${active ? "traversed" : ""}"/>`;
  })).join("");
  const rooms = r.map.map((n) => {
    const p = pos(n), available = reachable.has(n.id);
    const scout = n.enemyId ? ENEMIES[n.enemyId] : null;
    const detail = roomDetail(r, n);
    const name = n.type === "boss" ? stage.chapters[6] : roomNames[n.type];
    return `<button class="route-room type-${n.type} ${available ? "available" : ""} ${n.cleared ? "cleared" : ""}" data-room="${n.id}" data-tooltip="${esc(detail)}" style="left:${p.x}%;top:${p.y}%" ${available ? "" : "disabled"} aria-label="Sector ${n.floor + 1}: ${esc(name)}${scout ? `, ${esc(scout.name)}, ${encounterHealth(r.stage, n, r.ascension)} integrity` : ""}. ${esc(detail)}"><span class="room-orbit"></span><span class="room-symbol">${sicon(n.cleared ? "check" : roomIcons[n.type], n.type === "boss" ? 28 : 20)}</span><span class="room-label">${esc(name)}${scout && n.type !== "boss" ? `<small class="room-scout">${esc(scout.name.replace(/^THE /, ""))}</small>` : ""}</span>${available ? '<span class="room-enter">ENTER</span>' : ""}</button>`;
  }).join("");
  const legend = (["battle", "elite", "event", "shop", "cache", "forge"] as const)
    .map((k) => `<span class="legend-${k}">${sicon(roomIcons[k], 13)} ${roomNames[k]}</span>`).join("");
  return `<section class="map-screen"><aside class="map-story"><span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}${r.ascension ? ` · ASCENSION ${r.ascension}` : ""}</span><div class="chapter-sigil">${icon("map", 46)}</div><h1>${stage.chapters[Math.min(r.floor, 6)]}</h1><p>${r.stage === 0 && r.floor < 3 ? chapterForFloor(r.floor).description : stage.description}</p><blockquote class="story-fragment">“${stage.fragment}”</blockquote><div class="map-condition"><span>${icon("heart")} Integrity <strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></span><span class="map-credits">${sicon("coins")} Credits <strong>${r.credits}</strong></span><span>${icon("deck")} Your deck <strong>${r.deck.length}<small> cards</small></strong></span></div><div class="map-relics"><span class="eyebrow">RELICS CARRIED</span>${r.relics.map((id) => `<span class="carried-relic" data-tooltip="${esc(RELICS[id].rules)}" tabindex="0" aria-label="${esc(`${RELICS[id].name}: ${RELICS[id].rules}`)}">${relicEmblem(id, 13)} ${RELICS[id].name}</span>`).join("")}</div><button class="text-button" data-action="deck">Examine deck ${icon("arrow", 16)}</button></aside><div class="route-scroll" role="region" tabindex="0" aria-label="Route chart. Scroll to scout future sectors."><div class="route-chart"><div class="map-rings" aria-hidden="true"></div><svg class="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${rooms}<div class="chart-start">${icon("arrow", 16)} YOUR JOURNEY</div></div></div><div class="map-bottom"><span>SCROLL TO SCOUT · CHOOSE A LIT RELAY</span><div class="map-legend">${legend}</div><span>SEED ${r.seed.toString(16).toUpperCase()}</span></div></section>`;
}

// ------------------------------------------------------------------ rewards & relics

export function rewardMarkup(r: RunState) {
  const room = r.map.find(room => room.id === r.currentRoom);
  const cache = room?.type === "cache", boss = room?.type === "boss", elite = room?.type === "elite", event = room?.type === "event";
  const description = cache ? "A tool for the road, signal keeper. Take one with you."
    : boss ? r.stage === STAGES.length - 1 ? "Claim your last discovery. The backbone is waiting."
      : "Choose a card. Then choose a guardian's relic: great power, with a price."
      : elite ? "Choose a card. A relic waits for you after this choice."
        : event ? "The static clears. Choose a card to carry onward."
          : "Choose a card to carry into the next sector.";
  const earned = r.creditsEarned ?? 0;
  return `<section class="reward-screen full-screen v3"><div class="reward-emblem">${icon(cache ? "cache" : "crown", 36)}</div><span class="eyebrow">${cache ? "THE SALVAGE CACHE" : boss ? `STAGE ${STAGES[r.stage].numeral} · GUARDIAN DEFEATED` : elite ? "ELITE THREAT SILENCED" : "HOSTILE SIGNAL SILENCED"}</span><h1>${cache ? "Something worth carrying." : boss ? "The gate stands open." : "A connection restored."}</h1><p>${description}</p>${earned ? `<div class="spoils" role="status">${sicon("coins", 18)}<span><b>+${earned}</b> credits recovered</span><small>${r.credits} carried</small></div>` : ""}<div class="reward-cards">${r.cardRewards.map((id, i) => cardMarkup(id, i, "reward")).join("")}</div><button class="text-button" data-action="skip-reward">Leave these behind ${icon("arrow", 16)}</button><span class="reward-footer">YOUR DECK · ${r.deck.length} CARDS</span></section>`;
}

export function relicMarkup(r: RunState) {
  const room = r.map.find(room => room.id === r.currentRoom);
  const boss = r.relicRewards.some(id => RELICS[id].tier === "boss");
  const options = r.relicRewards.map((id, i) => {
    const relic = RELICS[id];
    if (boss) {
      const { boon, cost } = relicTerms(id);
      return `<button class="relic-option boss-relic" data-relic="${id}" style="--accent:${relic.color};--order:${i}" aria-label="${esc(`${relic.name}. ${relic.rules}`)}"><span class="relic-halo">${relicEmblem(id, 40)}</span><small>${relic.subtitle}</small><strong>${relic.name}</strong><span class="relic-boon">${sicon("spark", 14)} ${esc(boon)}</span>${cost ? `<span class="relic-cost">${sicon("warn", 14)} ${esc(cost)}</span>` : ""}<span class="relic-claim">CLAIM ${icon("arrow", 16)}</span></button>`;
    }
    return `<button class="relic-option" data-relic="${id}" style="--accent:${relic.color};--order:${i}" aria-label="${esc(`${relic.name}. ${relic.rules}`)}"><span class="relic-halo">${relicEmblem(id, 36)}</span><small>${relic.subtitle}</small><strong>${relic.name}</strong><span class="relic-rules">${esc(relic.rules)}</span><span class="relic-claim">TAKE ${icon("arrow", 16)}</span></button>`;
  }).join("");
  const guardian = room?.type === "boss";
  return `<section class="relic-screen full-screen v3 ${boss ? "boss-offer" : ""}"><span class="eyebrow">${boss ? "A GUARDIAN'S RELIC · POWER WITH A PRICE" : room?.type === "forge" ? "SALVAGED FROM THE SANCTUARY" : "A FRAGMENT OF THE OLD WORLD"}</span><h1>${boss ? "Its power is yours. So is its price." : "Power that stays with you."}</h1><p>${boss ? "Choose one boss relic. Each rewrites a rule of your network for the rest of the expedition." : "Choose one relic. Its effect lasts for the expedition."}${guardian ? " Enter the next stage with up to 6 integrity restored." : ""}</p><div class="relic-options">${options}</div></section>`;
}

// ------------------------------------------------------------------ sanctuary

export function forgeMarkup(r: RunState) {
  const story = sanctuaryStory(r.floor, r.map.find(n => n.id === r.currentRoom)?.lane);
  const repair = Math.min(repairAmount(r), r.maxIntegrity - r.integrity);
  const noRelics = !relicPool(r, "common").length;
  const salvageBlocked = noRelics ? "ALL RELICS RECOVERED"
    : r.maxIntegrity - SALVAGE_COST < SALVAGE_MIN_INTEGRITY ? `REQUIRES ${SALVAGE_MIN_INTEGRITY + SALVAGE_COST}+ MAXIMUM INTEGRITY` : "";
  const upgradable = r.deck.filter(id => canUpgrade(id)).length;
  const removable = r.deck.filter((_, i) => !removalBlocker(r, i)).length;
  const service = (verb: string, art: string, eyebrow: string, heading: string, text: string, note: string, disabled = false, glyph = "") =>
    `<button class="service-card" data-screen="${verb}" style="${artStyle(art)}" ${disabled ? "disabled" : ""}><span class="service-art"></span>${glyph ? `<span class="service-glyph">${sicon(glyph, 22)}</span>` : ""}<span class="eyebrow">${eyebrow}</span><strong>${heading}</strong><span class="service-text">${text}</span><small>${note}</small></button>`;
  return `<section class="forge-screen full-screen v3"><div class="reward-emblem">${icon("forge", 34)}</div><span class="eyebrow">SANCTUARY · NO HOSTILE SIGNALS · ONE SERVICE</span><h1>${story.title}.</h1><p>${story.description}</p><div class="service-row">${[
    service("forge-repair", "patch", "REPAIR", "Mend the backbone", repair ? `Restore ${repair} integrity.` : "Your integrity is already full.", `${r.integrity} / ${r.maxIntegrity} INTEGRITY`, false, "heart"),
    service("forge-upgrade", "startup-config", "UPGRADE", "Refine a card", "One card becomes its upgraded version, for good.", `${upgradable} CARD${upgradable === 1 ? "" : "S"} CAN IMPROVE`, !upgradable, "upgrade"),
    service("forge-remove", "crosslink", "REMOVE", "Travel lighter", "Leave one card behind. Curses too.", `${removable} CARD${removable === 1 ? "" : "S"} CAN GO`, !removable, "remove"),
    service("forge-salvage", "firmware", "SALVAGE", "Bind a relic", `Sacrifice ${SALVAGE_COST} maximum integrity for one of three relics.`, salvageBlocked || `MAX INTEGRITY ${r.maxIntegrity} → ${r.maxIntegrity - SALVAGE_COST}`, !!salvageBlocked, "elite"),
  ].join("")}</div><span class="reward-footer">YOUR DECK · ${r.deck.length} CARDS</span>${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ market

export function shopMarkup(r: RunState) {
  const shop = r.shop;
  if (!shop) return "";
  const cards = shop.cards.map((offer, i) => {
    const card = CARDS[offer.id], afford = r.credits >= offer.price;
    const bench = i === 0 && offer.id === "router";
    return `<div class="market-offer ${offer.sold ? "sold" : ""} ${!offer.sold && !afford ? "short" : ""} ${bench ? "bench" : ""}" style="--order:${i}">${bench ? `<span class="offer-tag">HARDWARE BENCH</span>` : offer.id.endsWith("+") ? `<span class="offer-tag upgraded">${sicon("upgrade", 11)} UPGRADED</span>` : `<span class="offer-tag rarity-${card.rarity}">${card.rarity.toUpperCase()}</span>`}${cardFace(offer.id)}${offer.sold ? '<span class="sold-stamp">SOLD</span>' : ""}<button class="price-button" data-screen="buy-card" data-index="${i}" ${offer.sold ? "disabled" : ""} aria-label="${esc(offer.sold ? `${card.name}, sold` : `Buy ${card.name} for ${offer.price} credits${afford ? "" : ", not enough credits"}. ${card.rules}`)}">${offer.sold ? "Sold" : credits(offer.price, 14)}</button></div>`;
  }).join("");
  const relics = shop.relics.map((offer, i) => {
    const relic = RELICS[offer.id], afford = r.credits >= offer.price;
    return `<div class="market-relic ${offer.sold ? "sold" : ""} ${!offer.sold && !afford ? "short" : ""}" style="--accent:${relic.color}">${relicEmblem(offer.id, 26)}<span class="market-relic-copy"><small>${relic.subtitle}</small><strong>${relic.name}</strong><span>${esc(relic.rules)}</span></span><button class="price-button" data-screen="buy-relic" data-index="${i}" ${offer.sold ? "disabled" : ""} aria-label="${esc(offer.sold ? `${relic.name}, sold` : `Buy ${relic.name} for ${offer.price} credits${afford ? "" : ", not enough credits"}. ${relic.rules}`)}">${offer.sold ? "Sold" : credits(offer.price, 14)}</button></div>`;
  }).join("");
  const service = (verb: "shop-remove" | "shop-upgrade", used: boolean, price: number, glyph: string, heading: string, text: string) =>
    `<button class="market-service ${used ? "sold" : ""} ${!used && r.credits < price ? "short" : ""}" data-screen="${verb}" ${used ? "disabled" : ""}><span class="service-glyph">${sicon(glyph, 20)}</span><span><strong>${heading}</strong><span>${used ? "Done for this visit." : text}</span></span><span class="price-tag">${used ? "Used" : credits(price, 14)}</span></button>`;
  return `<section class="market-screen full-screen"><header class="market-head"><div><span class="eyebrow">THE MARKET · ${STAGES[r.stage].name.toUpperCase()}</span><h1>Salvage, sold by lantern light.</h1><p>Every price is fixed. Every credit spent here is a turn you will not have to survive.</p></div><div class="purse" role="status" aria-label="${r.credits} credits">${sicon("coins", 26)}<span><strong>${r.credits}</strong><small>CREDITS</small></span></div></header><div class="market-shelf" aria-label="Cards for sale">${cards}</div><div class="market-lower"><section class="market-relics" aria-label="Relics for sale"><span class="eyebrow">RELICS</span>${relics || '<p class="market-empty">No relics left to trade.</p>'}</section><section class="market-services" aria-label="Services"><span class="eyebrow">SERVICES · ONCE PER VISIT</span>${service("shop-remove", shop.removed, shop.removePrice, "remove", "Remove a card", "Curses and dead weight, gone.")}${service("shop-upgrade", shop.upgraded, shop.upgradePrice, "upgrade", "Upgrade a card", "One card becomes its + version.")}</section><div class="market-exit"><button class="gold-button" data-screen="leave-shop">Leave the market ${icon("arrow", 18)}</button><button class="text-button" data-action="deck">Examine deck · ${r.deck.length} cards</button></div></div>${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ events

export function eventMarkup(r: RunState) {
  const view = eventView(r);
  if (!view) return "";
  const art = asset(`art/${view.art ?? "relay-interior"}.png`);
  const choices = view.choices.map((choice, i) => `<button class="event-choice ${choice.disabled ? "disabled" : ""}" data-screen="event-choice" data-index="${i}" ${choice.disabled ? `aria-disabled="true"` : ""} style="--order:${i}"><span class="choice-mark">${choice.needsCard ? sicon("deck", 15) : `<span>${i + 1}</span>`}</span><span class="choice-copy"><strong>${esc(choice.label)}</strong><span>${esc(choice.detail)}</span>${choice.disabled ? `<small class="choice-blocked">${sicon("lock", 12)} ${esc(choice.disabled)}</small>` : choice.needsCard ? `<small class="choice-needs">${NEED_VERB[choice.needsCard].toUpperCase()} A CARD FROM YOUR DECK</small>` : ""}</span>${choice.disabled ? "" : icon("arrow", 16)}</button>`).join("");
  return `<section class="event-screen full-screen ${view.resolved ? "resolved" : ""}"><div class="event-frame"><figure class="event-art" aria-hidden="true" style="background-image:url('${art}')"><i></i></figure><div class="event-copy"><span class="eyebrow">${sicon("signal", 14)} ${esc(view.kicker)}</span><h1>${esc(view.title)}</h1><p class="event-text">${esc(view.text)}</p>${view.resolved ? `<div class="event-outcome" role="status"><span class="eyebrow">WHAT REMAINS</span><p>${esc(view.outcome ?? "")}</p><button class="gold-button" data-screen="event-leave">Continue ${icon("arrow", 18)}</button></div>` : `<div class="event-choices" role="group" aria-label="Your answer">${choices}</div>`}<div class="event-status">${icon("heart", 13)} ${r.integrity}/${r.maxIntegrity} <span></span>${sicon("coins", 13)} ${r.credits} <span></span>${icon("deck", 13)} ${r.deck.length} cards</div></div></div>${activePicker(r) ? deckPickerMarkup(r, activePicker(r)!) : ""}</section>`;
}

// ------------------------------------------------------------------ guardian intro, outcome, settings

export function bossIntroMarkup(r: RunState) {
  const enemy = ENEMIES[r.enemy!.id], stage = STAGES[r.stage], art = enemy.art;
  const x = art.columns === 1 ? 0 : art.index % art.columns / (art.columns - 1) * 100;
  const y = art.rows === 1 ? 0 : Math.floor(art.index / art.columns) / (art.rows - 1) * 100;
  return `<section class="guardian-entrance guardian-${enemy.id}" aria-labelledby="guardian-name" style="--guardian-color:#${enemy.color.toString(16).padStart(6,"0")}">
    <div class="guardian-portrait" aria-hidden="true"><i></i><span style="background-image:url('${asset(`art/${art.file}.png`)}');background-size:${art.columns * 100}% ${art.rows * 100}%;background-position:${x}% ${y}%"></span></div>
    <div class="guardian-introduction"><div class="guardian-stages">${STAGES.map((s,i)=>`<span class="${i === r.stage ? "current" : i < r.stage ? "cleared" : ""}">${i < r.stage ? icon("check",14) : s.numeral}</span>`).join('<i></i>')}</div>
    <span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}</span><p class="guardian-arrival">${enemy.boss!.entrance}</p>
    <h1 id="guardian-name">${title(enemy.name.replace(/^THE /,""))}</h1><span class="guardian-subtitle">${enemy.title}</span>
    <div class="guardian-challenge"><span>${icon("heart",18)} ${r.enemy!.maxHp} INTEGRITY</span><span>${icon("elite",18)} STAGE GUARDIAN</span></div>
    <p class="guardian-warning">${enemy.boss!.warning}</p><button class="gold-button" data-action="close" autofocus>Face the guardian ${icon("arrow",20)}</button><small class="guardian-skip">ENTER TO BEGIN · ESC TO SKIP</small></div>
  </section>`;
}

export function outcomeMarkup(e: Expedition) {
  const r = e.run, won = r.phase === "won", story = OUTCOMES[won ? "won" : "lost"];
  const progress = loadProgress();
  const unlock = won && progress.lastUnlock && progress.lastUnlock.seed === r.seed && progress.lastUnlock.archetype === e.archetype ? progress.lastUnlock.level : null;
  const sectors = Math.min(21, r.stage * 7 + r.floor);
  return `<section class="outcome-screen full-screen v3 ${won ? "victory" : ""}"><div class="outcome-symbol">${icon(won ? "crown" : "link", 54)}</div><span class="eyebrow">${story.eyebrow}</span><h1>${story.title}</h1><p>${story.description}${won ? ` ${ARCHETYPE_STORIES[e.archetype].epilogue}` : ""}</p>${unlock !== null ? `<div class="unlock-moment" role="status">${sicon("ascend", 22)}<span><small>${ARCHETYPES[e.archetype].name.toUpperCase()}</small><strong>Ascension ${unlock} unlocked</strong><em>${esc(ASCENSION_LEVELS[unlock - 1]?.name ?? "")} · ${esc(ASCENSION_LEVELS[unlock - 1]?.rule ?? "")}</em></span></div>` : ""}<div class="outcome-stats"><span><strong>${r.score.toLocaleString()}</strong>SCORE</span><span><strong>${sectors} / 21</strong>SECTORS</span><span><strong>${r.deck.length}</strong>CARDS</span><span><strong>${r.relics.length}</strong>RELICS</span><span><strong>${r.ascension}</strong>ASCENSION</span></div><button class="gold-button" data-action="new">Another expedition ${icon("arrow")}</button><button class="text-button" data-action="title">Return to the relay</button></section>`;
}

export function settingsMarkup(s: AudioSettings, inRun: boolean, preferences: Preferences) {
  return `<div class="settings-content"><span class="eyebrow">TAKE A BREATH</span><h2>At your frequency.</h2><label class="setting-slider"><span>Music <output>${Math.round(s.music * 100)}%</output></span><input type="range" min="0" max="100" value="${s.music * 100}" data-setting="music" aria-label="Music volume"/></label><label class="setting-slider"><span>Sound effects <output>${Math.round(s.effects * 100)}%</output></span><input type="range" min="0" max="100" value="${s.effects * 100}" data-setting="effects" aria-label="Sound effects volume"/></label><label class="setting-toggle"><span>Motion & screen shake</span><input type="checkbox" data-setting="motion" ${s.motion ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Contextual field notes</span><input type="checkbox" data-preference="tips" ${preferences.tips ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Quick transmissions</span><input type="checkbox" data-preference="fast" ${preferences.fast ? "checked" : ""}/><i></i></label><div class="settings-actions"><button class="gold-button" data-action="close">${inRun ? "Return to expedition" : "Return"} ${icon("arrow")}</button>${inRun ? '<button class="text-button" data-action="save-exit">Save & return to title</button>' : ""}<button class="text-button" data-action="credits">Art & soundtrack credits</button></div></div>`;
}
