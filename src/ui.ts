import { CARDS, RELICS } from "./core/cards.ts";
import {
  ARCHETYPES,
  type Archetype,
  type Expedition,
  type RunRecord,
} from "./core/expedition.ts";
import { reachableRooms } from "./core/map.ts";
import { costFor, damageFromPath, intentFor, signalPaths } from "./core/run.ts";
import type { CardId, MapRoom, RunState } from "./core/types.ts";
import type { AudioSettings } from "./audio.ts";
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function icon(name: string, size = 18): string {
  const p: Record<string, string> = {
    arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
    back: '<path d="M21 12H4m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    heart:
      '<path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 8-7 5.3 5.3 0 0 1 9 6L12 21Z"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
    deck: '<rect x="5" y="5" width="13" height="16" rx="1"/><path d="M9 2h12v15M9 12l3-3 3 3-3 3-3-3Z"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
    sound:
      '<path d="M3 9v6h4l5 4V5L7 9H3Zm12 0a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
    mute: '<path d="M3 9v6h4l5 4V5L7 9H3Zm13 0 5 6m0-6-5 6"/>',
    full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    shield:
      '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    link: '<path d="m10 8 4-4a5 5 0 0 1 7 7l-4 4m-3 1-4 4a5 5 0 0 1-7-7l4-4m1 7 8-8"/>',
    sword: '<path d="m5 20 5-5m-4-3 6 6m-4-4L19 3l2 0 0 2-11 11"/>',
    elite: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>',
    cache: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11"/>',
    forge:
      '<path d="m4 3 5 5-1 4-5-1a6 6 0 0 0 8 6l5 5 5-5-5-5a6 6 0 0 0-8-8l3 4-3 3-4-4Z"/>',
    boss: '<path d="m12 1 3 6 7 2-4 6 1 7-7-3-7 3 1-7-4-6 7-2 3-6Z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    download: '<path d="M12 2v14m-5-5 5 5 5-5M4 17v5h16v-5"/>',
    book: '<path d="M12 5C8 2 4 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v16"/>',
    undo: '<path d="M4 4v7h7M4 11c3-9 16-7 16 2a7 7 0 0 1-7 7"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 14H5L2 6Z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.bolt}</svg>`;
}
const artIds: CardId[] = [
  "router",
  "switch",
  "firewall",
  "fiber",
  "crosslink",
  "shield",
  "patch",
  "surge",
  "firmware",
];
export function artStyle(id: string) {
  if (id === "containerlab" || id === "clabernetes")
    return `--card-image:url('${asset(`art/${id}.png`)}');--art-size:cover;--art-x:50%;--art-y:50%`;
  const i = Math.max(0, artIds.indexOf(id as CardId));
  return `--art-x:${(i % 3) * 50}%;--art-y:${Math.floor(i / 3) * 50}%`;
}
export function cardMarkup(
  id: CardId,
  index = 0,
  variant: "hand" | "reward" | "collection" = "hand",
  run?: RunState,
  selected = false,
) {
  const c = CARDS[id],
    cost = variant === "hand" && run ? costFor(run, index) : c.cost;
  const central =
    variant === "hand" && run ? index - (run.hand.length - 1) / 2 : 0;
  return `<button class="game-card rarity-${c.rarity} ${selected ? "selected" : ""} ${run && cost > run.energy && variant === "hand" ? "unplayable" : ""}" data-${variant}="${variant === "hand" ? index : id}" data-card-id="${id}" style="${artStyle(id)};--card-color:${c.color};--angle:${Math.max(-10, Math.min(10, central * 3))}deg;--lift:${Math.min(15, Math.abs(central) * 5)}px;--order:${index}" aria-label="${c.name}, ${cost} energy. ${c.rules}" ${variant === "collection" ? 'tabindex="-1"' : ""}><span class="card-image"></span><span class="card-etch"></span><span class="card-cost">${cost}</span><span class="card-heading">${c.name}</span><span class="card-copy"><span class="card-type">${c.subtitle.split(" / ")[1]}</span><span class="card-rule">${c.rules}</span></span><span class="card-footer"><span>${c.rarity}</span><span class="card-gem">◆</span><span>${variant === "hand" ? `<kbd>${index + 1}</kbd>` : "CLAB"}</span></span></button>`;
}
export function titleMarkup(saved: Expedition | null, records: RunRecord[]) {
  const canContinue = saved && !["won", "lost"].includes(saved.run.phase);
  return `<section class="title-screen"><div class="title-copy"><div class="eyebrow title-eyebrow"><i></i>A CONTAINERLAB ODYSSEY</div><h1>FAULTLINE</h1><div class="title-subtitle"><span></span>Every connection matters.<span></span></div><p>At the edge of a silent world,<br>one signal is still alive.</p><nav class="title-menu" aria-label="Main menu">${canContinue ? `<button class="menu-primary" data-action="continue"><span><small>SECTOR ${saved.run.floor + 1} · ${ARCHETYPES[saved.archetype].name.toUpperCase()}</small>Continue expedition</span>${icon("arrow", 22)}</button>` : ""}<button class="${canContinue ? "menu-link" : "menu-primary"}" data-action="new"><span>${canContinue ? "" : "<small>THE SIGNAL IS CALLING</small>"}New expedition</span>${icon("arrow", 22)}</button><button class="menu-link" data-action="daily"><span>Daily expedition</span><small>A NEW SIGNAL. EVERY DAY.</small></button><button class="menu-link" data-action="collection"><span>Card archive</span><small>${String(Object.keys(CARDS).length).padStart(2, "0")} DISCOVERIES</small></button><button class="menu-link" data-action="help"><span>Field guide</span>${icon("book", 16)}</button></nav><div class="title-progress">${records.length ? `${records.filter((r) => r.won).length} BACKBONES RESTORED <span>·</span> BEST ${Math.max(...records.map((r) => r.score))}` : "BUILD YOUR DECK <span>·</span> DEFEND THE NETWORK"}</div></div><div class="world-caption"><span>01 / THE SUNKEN RELAY</span><p>Some things are worth reconnecting.</p><i></i></div><div class="title-bottom"><span>STRATEGY. CONSEQUENCE. CONNECTION.</span><span>HEADPHONES RECOMMENDED ${icon("sound", 14)}</span></div></section>`;
}
export function selectMarkup(
  selected: Archetype,
  daily: boolean,
  replace: boolean,
) {
  return `<section class="selection-screen full-screen"><button class="back-link" data-action="title">${icon("back")} RETURN</button><div class="screen-heading"><span class="eyebrow">${daily ? "THE DAILY EXPEDITION" : "A NEW EXPEDITION"}</span><h1>Who carries the signal?</h1><p>One journey. Three ways to survive it.</p></div><div class="archetypes">${(
    Object.keys(ARCHETYPES) as Archetype[]
  )
    .map((id, i) => {
      const a = ARCHETYPES[id];
      return `<button class="archetype ${selected === id ? "chosen" : ""}" data-archetype="${id}" aria-pressed="${selected === id}" style="${artStyle(a.art)};--accent:${a.color}"><span class="archetype-art"></span><span class="archetype-number">0${i + 1}</span><span class="archetype-copy"><small>${a.title}</small><strong>${a.name}</strong><span>${a.story}</span><span class="archetype-relic">${icon("elite", 18)} ${RELICS[a.relic].name}</span><em>${RELICS[a.relic].rules}</em><span class="archetype-health">${icon("heart", 14)} ${a.integrity} INTEGRITY</span></span><span class="selection-tick">${icon("check", 16)}</span></button>`;
    })
    .join(
      "",
    )}</div><button class="gold-button embark" data-action="embark">Enter the Faultline ${icon("arrow", 20)}</button><p class="selection-note">${replace ? "Starting this expedition replaces your current saved run." : daily ? "A shared daily seed. Progress saves automatically." : "Seven sectors. A branching route. Progress saves automatically."}</p></section>`;
}
export const roomNames: Record<MapRoom["type"], string> = {
  battle: "Hostile signal",
  elite: "Elite threat",
  cache: "Salvage cache",
  forge: "Sanctuary",
  boss: "The Blackout Core",
};
const roomIcons = {
  battle: "sword",
  elite: "elite",
  cache: "cache",
  forge: "forge",
  boss: "boss",
};
const chapters = [
  "The Sunken Relay",
  "Fractured Frequencies",
  "The Hollow Exchange",
  "Beyond the Firewall",
  "Echoes in the Copper",
  "The Last Safe Port",
  "The Blackout Core",
];
export function mapMarkup(e: Expedition) {
  const r = e.run,
    reachable = new Set(reachableRooms(r).map((n) => n.id));
  const pos = (n: MapRoom) => ({
    x: 18 + n.lane * 30 + (n.floor % 2 ? 3 : -3),
    y: 86 - n.floor * 12,
  });
  const lines = r.map
    .flatMap((n) =>
      r.map
        .filter(
          (t) => t.floor === n.floor + 1 && Math.abs(t.lane - n.lane) <= 1,
        )
        .map((t) => {
          const a = pos(n),
            b = pos(t);
          const active = n.cleared && (t.cleared || reachable.has(t.id));
          return `<path d="M ${a.x} ${a.y} C ${a.x} ${a.y - 6},${b.x} ${b.y + 6},${b.x} ${b.y}" class="${active ? "traversed" : ""}"/>`;
        }),
    )
    .join("");
  return `<section class="map-screen"><aside class="map-story"><span class="eyebrow">ACT I · THE FRACTURED BACKBONE</span><div class="chapter-sigil">${icon("map", 46)}</div><h1>${chapters[Math.min(r.floor, 6)]}</h1><p>The old routes have gone dark. Follow the surviving relays. Choose what is worth the risk.</p><div class="map-condition"><span>${icon("heart")} Integrity <strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></span><span>${icon("deck")} Your deck <strong>${r.deck.length}<small> cards</small></strong></span></div><div class="map-relics"><span class="eyebrow">RELICS CARRIED</span>${r.relics.map((id) => `<span class="carried-relic" title="${RELICS[id].rules}">${icon("elite", 16)} ${RELICS[id].name}</span>`).join("")}</div><button class="text-button" data-action="deck">Examine deck ${icon("arrow", 16)}</button></aside><div class="route-scroll"><div class="route-chart"><div class="map-rings" aria-hidden="true"></div><svg class="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${r.map
    .map((n) => {
      const p = pos(n),
        available = reachable.has(n.id);
      return `<button class="route-room type-${n.type} ${available ? "available" : ""} ${n.cleared ? "cleared" : ""}" data-room="${n.id}" style="left:${p.x}%;top:${p.y}%" ${available ? "" : "disabled"} aria-label="Sector ${n.floor + 1}: ${roomNames[n.type]}"><span class="room-orbit"></span><span class="room-symbol">${icon(n.cleared ? "check" : roomIcons[n.type], n.type === "boss" ? 28 : 20)}</span><span class="room-label">${roomNames[n.type]}</span>${available ? '<span class="room-enter">ENTER</span>' : ""}</button>`;
    })
    .join(
      "",
    )}<div class="chart-start">${icon("arrow", 16)} YOUR JOURNEY</div></div></div><div class="map-bottom"><span>CHOOSE A LIT RELAY TO CONTINUE</span><div class="map-legend">${Object.entries(
    roomIcons,
  )
    .filter(([k]) => k !== "boss")
    .map(
      ([k, v]) =>
        `<span>${icon(v, 13)} ${roomNames[k as MapRoom["type"]]}</span>`,
    )
    .join(
      "",
    )}</div><span>SEED ${r.seed.toString(16).toUpperCase()}</span></div></section>`;
}
export function headerMarkup(
  e: Expedition | null,
  inTitle: boolean,
  settings: AudioSettings,
) {
  return `<div class="brand"><img src="${asset("containerlab-mark.svg")}" alt="Containerlab"/><span>${inTitle ? "CONTAINERLAB" : "FAULTLINE"}<small>${inTitle ? "TRANSMISSIONS FROM THE EDGE" : "A CONTAINERLAB ODYSSEY"}</small></span></div>${!inTitle && e ? `<div class="run-stats"><span class="integrity-stat" title="Integrity persists between encounters">${icon("heart", 17)} <b>${e.run.integrity}</b><small>/${e.run.maxIntegrity}</small></span><span class="stat-divider"></span><button data-action="deck" title="View your deck">${icon("deck", 17)} ${e.run.deck.length}</button><span class="stat-divider"></span><span class="sector-stat">SECTOR <b>${String(Math.min(e.run.floor + 1, 7)).padStart(2, "0")}</b> / 07</span></div>` : ""}<nav class="header-controls" aria-label="Game controls"><button data-action="sound" aria-label="${settings.muted ? "Enable" : "Mute"} audio" title="${settings.muted ? "Enable" : "Mute"} audio">${icon(settings.muted ? "mute" : "sound")}</button><button data-action="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">${icon("full")}</button><button data-action="settings" aria-label="Open settings" title="Settings">${icon("settings", 20)}</button></nav>`;
}
export function battleMarkup(
  e: Expedition,
  selected: number | null,
  source: string | null,
  busy: boolean,
  tutorial: boolean,
  undo: boolean,
) {
  const r = e.run,
    enemy = r.enemy!,
    intent = intentFor(r)!,
    paths = signalPaths(r),
    damage = paths[0] ? damageFromPath(r, paths[0]) : 0;
  const target = selected === null ? null : CARDS[r.hand[selected]];
  const hint = !target
    ? "Choose a card to shape the network."
    : target.target === "ground"
      ? "Choose an empty point on the table."
      : target.target === "link"
        ? source
          ? "Choose the second device."
          : "Choose the first device."
        : target.id === "clabernetes"
          ? "Choose a router to replicate."
          : "Choose a device to upgrade.";
  const guide =
    r.topology.nodes.length < 3
      ? "Play Containerlab for a ready route, or build one with a router and two links."
      : r.topology.links.length < 2
        ? "Play Optic Fiber. Connect ALPHA → router → OMEGA."
        : paths.length
          ? "Your route is alive. Transmit to strike the threat."
          : "Your route has a fault. Use Hot Patch, or build another path.";
  const intentName = {
    strike: "Integrity strike",
    sever: "Sever a cable",
    jam: "Jam a device",
    breach: "Security breach",
  }[intent.kind];
  return `
    <div class="encounter-heading">
      <span class="eyebrow">${chapters[r.floor].toUpperCase()}</span>
      <h2>${esc(enemy.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))}</h2>
      <span class="enemy-flavor">${esc(enemy.title)}</span>
      <div class="enemy-health"><span style="width:${(enemy.hp / enemy.maxHp) * 100}%"></span></div>
      <div class="enemy-health-label"><span>HOSTILE INTEGRITY</span><strong>${enemy.hp} <small>/ ${enemy.maxHp}</small></strong></div>
    </div>
    <aside class="battle-left battle-plate" aria-label="Your network">
      <span class="plate-heading">${ARCHETYPES[e.archetype].name}</span>
      <div class="turn-label">Turn <strong>${String(r.turn).padStart(2, "0")}</strong></div>
      <div class="plate-divider" aria-hidden="true"><span>◆</span></div>
      <div class="signal-readout ${damage ? "online" : ""}">
        <span>${damage ? "A living connection" : "The signal sleeps"}</span>
        <strong>${damage}<small>signal damage</small></strong>
        <p>${damage ? "Your packets are ready. Make the connection count." : "Connect both terminals through a router."}</p>
      </div>
      <div class="battle-relics">${r.relics.map((id) => `<span title="${RELICS[id].name}: ${RELICS[id].rules}">${icon("elite", 15)}<small>${RELICS[id].name}</small></span>`).join("")}</div>
      <button class="text-button undo-button" data-action="undo" ${!undo || busy ? "disabled" : ""}>${icon("undo", 14)} Undo last card <kbd>Z</kbd></button>
    ${tutorial ? `<div class="tutorial-callout"><span>${icon("book", 15)} Field note</span><p>${guide}</p><button data-action="dismiss-tutorial" aria-label="Dismiss field note">${icon("close", 14)}</button></div>` : ""}
    </aside>
    <aside class="battle-right battle-plate" aria-label="Enemy intent">
      <span class="plate-heading">Enemy intent</span>
      <div class="intent-emblem">${icon(intent.kind === "strike" || intent.kind === "breach" ? "sword" : intent.kind === "jam" ? "bolt" : "link", 28)}</div>
      <strong>${intentName}</strong>
      <p>${intent.amount ? `Deals ${intent.amount} integrity damage after you transmit.` : intent.kind === "sever" ? "One cable falls silent for your next turn." : "One unshielded device falls silent for your next turn."}</p>
      <div class="plate-divider" aria-hidden="true"><span>◆</span></div>
      <span class="intent-caption">Your next strike</span>
      <span class="intent-preview ${damage >= enemy.hp ? "lethal" : ""}">${damage ? `${damage} damage` : "No live route"}</span>
      ${damage >= enemy.hp ? '<span class="lethal-caption">A finishing blow</span>' : ""}
    </aside>
    <div class="battle-bottom">
      <div class="energy-orb"><strong>${r.energy}</strong><span>ENERGY</span></div>
      <div class="draw-piles"><button data-action="draw-pile">${icon("deck", 22)}<span>${r.drawPile.length}<small>DRAW</small></span></button><button data-action="discard-pile">${icon("deck", 19)}<span>${r.discardPile.length}<small>DISCARD</small></span></button></div>
      <div class="target-hint ${selected !== null ? "active" : ""}">${selected !== null ? icon("arrow", 15) : ""}${hint}${selected !== null ? '<button data-action="cancel">ESC ×</button>' : ""}</div>
      <button class="transmit-button ${damage ? "ready" : ""} ${busy ? "transmitting" : ""}" data-action="transmit" aria-label="Transmit · ${damage} damage · End turn" ${busy ? "disabled" : ""}>
        <span class="transmit-dial" aria-hidden="true"></span>
        <span class="transmit-power" aria-hidden="true"><strong>${busy ? "· · ·" : damage}</strong><small>${busy ? "sending" : "damage"}</small></span>
        <span class="transmit-label">${busy ? "Transmitting" : "Transmit"}</span>
        <span class="transmit-shortcut">End turn <span>·</span> <kbd>SPACE</kbd></span>
      </button>
      <button class="battle-guide" data-action="help">${icon("book", 14)} Field guide</button>
    </div>
    <div class="combat-log" aria-live="polite">${esc(r.log[0] || "")}</div>`;
}
export function handMarkup(run: RunState, selected: number | null) {
  return `<div class="card-fan" style="--hand-size:${run.hand.length}">${run.hand.map((id, i) => cardMarkup(id, i, "hand", run, selected === i)).join("")}</div>`;
}
export function rewardMarkup(r: RunState) {
  const cache = r.map.find((n) => n.id === r.currentRoom)?.type === "cache";
  return `<section class="reward-screen full-screen"><div class="reward-emblem">${icon(cache ? "cache" : "crown", 36)}</div><span class="eyebrow">${cache ? "A SIGNAL FROM THE PAST" : "HOSTILE SIGNAL SILENCED"}</span><h1>${cache ? "Something worth salvaging." : "A connection restored."}</h1><p>Choose a card to carry into the next sector.</p><div class="reward-cards">${r.cardRewards.map((id, i) => cardMarkup(id, i, "reward")).join("")}</div><button class="text-button" data-action="skip-reward">Leave these behind ${icon("arrow", 16)}</button><span class="reward-footer">YOUR DECK · ${r.deck.length} CARDS</span></section>`;
}
export function relicMarkup(r: RunState) {
  return `<section class="relic-screen full-screen"><span class="eyebrow">A FRAGMENT OF THE OLD WORLD</span><h1>Power that stays with you.</h1><p>Choose one relic. Its effect lasts for the expedition.</p><div class="relic-options">${r.relicRewards.map((id, i) => `<button class="relic-option" data-relic="${id}" style="--accent:${RELICS[id].color};${artStyle(["firmware", "shield", "surge"][i])}"><span class="relic-art"></span><small>${RELICS[id].subtitle}</small><strong>${RELICS[id].name}</strong><span>${RELICS[id].rules}</span>${icon("arrow", 18)}</button>`).join("")}</div></section>`;
}
export function forgeMarkup(r: RunState) {
  return `<section class="forge-screen full-screen"><div class="reward-emblem">${icon("forge", 34)}</div><span class="eyebrow">SANCTUARY · NO HOSTILE SIGNALS</span><h1>Even the signal needs rest.</h1><p>A forgotten maintenance bay. The lights still work.</p><div class="forge-options"><button data-forge="repair" style="${artStyle("patch")}"><span class="forge-art"></span><span class="eyebrow">REPAIR</span><strong>Mend the backbone</strong><span>Restore ${Math.min(4, r.maxIntegrity - r.integrity)} integrity.</span><small>${r.integrity} / ${r.maxIntegrity} CURRENT INTEGRITY</small></button><button data-forge="relic" style="${artStyle("firmware")}"><span class="forge-art"></span><span class="eyebrow">SALVAGE</span><strong>Unearth a relic</strong><span>Discover a permanent upgrade.</span><small>CHOOSE ONE OF THREE RELICS</small></button></div></section>`;
}
export function outcomeMarkup(e: Expedition) {
  const r = e.run,
    won = r.phase === "won";
  return `<section class="outcome-screen full-screen ${won ? "victory" : ""}"><div class="outcome-symbol">${icon(won ? "crown" : "link", 54)}</div><span class="eyebrow">${won ? "THE BACKBONE LIVES AGAIN" : "THE LAST SIGNAL FADES"}</span><h1>${won ? "And then, an answer." : "Not every route makes it home."}</h1><p>${won ? "Across the broken relays, a thousand little lights return. You were never the only one listening." : "The Faultline keeps its secrets. There is another route. There is always another route."}</p><div class="outcome-stats"><span><strong>${r.score.toLocaleString()}</strong>SCORE</span><span><strong>${r.floor} / 7</strong>SECTORS</span><span><strong>${r.deck.length}</strong>CARDS</span></div><button class="gold-button" data-action="new">Another expedition ${icon("arrow")}</button><button class="text-button" data-action="title">Return to the relay</button></section>`;
}
export function settingsMarkup(s: AudioSettings, inRun: boolean) {
  return `<div class="settings-content"><span class="eyebrow">TAKE A BREATH</span><h2>At your frequency.</h2><label class="setting-slider"><span>Music <output>${Math.round(s.music * 100)}%</output></span><input type="range" min="0" max="100" value="${s.music * 100}" data-setting="music" aria-label="Music volume"/></label><label class="setting-slider"><span>Sound effects <output>${Math.round(s.effects * 100)}%</output></span><input type="range" min="0" max="100" value="${s.effects * 100}" data-setting="effects" aria-label="Sound effects volume"/></label><label class="setting-toggle"><span>Motion & screen shake</span><input type="checkbox" data-setting="motion" ${s.motion ? "checked" : ""}/><i></i></label><div class="settings-actions"><button class="gold-button" data-action="close">${inRun ? "Return to expedition" : "Return"} ${icon("arrow")}</button>${inRun ? '<button class="text-button" data-action="save-exit">Save & return to title</button>' : ""}<button class="text-button" data-action="credits">Art & soundtrack credits</button></div></div>`;
}
export function helpMarkup() {
  return `<span class="eyebrow">THE ARCHITECT'S FIELD GUIDE</span><h2>Your network is your weapon.</h2><p class="modal-intro">Build a route. Read the threat. Keep the signal alive.</p><div class="guide-grid"><div><b>01</b><h3>Build the backbone</h3><p>Play a <strong>Core Router</strong> on the table. Play two <strong>Optic Fiber</strong> cards to connect <strong>ALPHA → router → OMEGA</strong>. Click each end of a cable. Or play <strong>Containerlab</strong> to deploy an overclocked route in one card.</p></div><div><b>02</b><h3>Transmit the signal</h3><p>A live route deals <strong>5 damage</strong> each transmission. End your turn to strike. If the enemy survives, its displayed intent executes.</p></div><div><b>03</b><h3>Design for failure</h3><p>Faults last one turn. <strong>Hot Patch</strong> clears them. <strong>Clabernetes</strong> copies a router and its links, then shields both routers. Independent router paths add <strong>2 damage</strong>. Overclock adds <strong>2</strong>; a firewall adds <strong>1</strong> and blocks up to <strong>3 breach damage</strong>.</p></div><div><b>04</b><h3>Keep something for later</h3><p>Energy resets to <strong>5</strong>; your hand is discarded and redrawn. Hardware stays for the battle. Deck, relics and integrity carry between sectors.</p></div></div><div class="control-legend"><span><kbd>1–9</kbd> Select card</span><span><kbd>Space / Enter</kbd> Transmit</span><span><kbd>Z</kbd> Undo</span><span><kbd>Esc</kbd> Cancel / pause</span><span>Drag hardware to place · Drag devices to move · Drag empty table to orbit</span></div><button class="text-button" data-action="export">${icon("download", 16)} Export this network for Containerlab</button>`;
}
export function deckMarkup(
  r: RunState,
  mode: "deck" | "draw-pile" | "discard-pile" | "collection",
) {
  const cards =
    mode === "collection"
      ? (Object.keys(CARDS) as CardId[])
      : mode === "draw-pile"
        ? r.drawPile
        : mode === "discard-pile"
          ? r.discardPile
          : r.deck;
  const counts = new Map<CardId, number>();
  for (const id of cards) counts.set(id, (counts.get(id) || 0) + 1);
  return `<span class="eyebrow">${mode === "collection" ? "THE CARD ARCHIVE" : "EVERY CARD IS A POSSIBILITY"}</span><h2>${{ deck: "What you carry.", "draw-pile": "Waiting in the draw pile.", "discard-pile": "Spent, but not forgotten.", collection: "Tools of the last architects." }[mode]}</h2><p class="modal-intro">${cards.length} cards${mode === "draw-pile" ? " · Grouped by type; draw order is hidden." : mode === "discard-pile" ? " · These return when your draw pile runs out." : ""}</p><div class="collection-grid">${[...counts].map(([id, n], i) => `<div class="collection-entry">${cardMarkup(id, i, "collection")}<span>${mode === "collection" ? CARDS[id].rarity : `× ${n} IN ${mode === "deck" ? "DECK" : "PILE"}`}</span></div>`).join("") || '<p class="empty-pile">Nothing here yet.</p>'}</div>`;
}
