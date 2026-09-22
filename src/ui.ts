import { CARDS, RELICS } from "./core/cards.ts";
import {
  ARCHETYPES,
  type Archetype,
  type Expedition,
  type RunRecord,
} from "./core/expedition.ts";
import { reachableRooms } from "./core/map.ts";
import { combatPreview, costFor, intentFor, signalPaths } from "./core/run.ts";
import type { CardId, MapRoom, RunState } from "./core/types.ts";
import type { AudioSettings } from "./audio.ts";
import type { Preferences } from "./preferences.ts";
import { chapterForFloor, enemyStory, ARCHETYPE_STORIES, sanctuaryStory, OUTCOMES } from "./story.ts";
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
  if (id === "containerlab" || id === "clabernetes" || id === "wireshark")
    return `--card-image:url('${asset(`art/${id}.png`)}');--art-size:cover;--art-x:50%;--art-y:50%`;
  const toolsAtlas: Record<string, number> = { "startup-config": 0, "linux-bridge": 1, vxlan: 2, inspect: 3 };
  if (id in toolsAtlas) {
    const i = toolsAtlas[id];
    return `--card-image:url('${asset("art/containerlab-tools-atlas.png")}');--art-size:200% 200%;--art-x:${(i % 2) * 100}%;--art-y:${Math.floor(i / 2) * 100}%`;
  }
  const expansion: Record<string, number> = { guard: 0, pulse: 1, diagnostic: 2, reroute: 3, barrier: 4, capacitor: 5, relay: 6, "hardened-router": 7, bastion: 8, duplex: 9, "armored-fiber": 10, conduit: 11, salvage: 12, mirror: 13, "zero-day": 14, compression: 15, rebuild: 3, emergency: 12, protocol: 4 };
  if (id in expansion) {
    const i = expansion[id];
    return `--card-image:url('${asset("art/alpha-card-atlas.png")}');--art-size:400% 400%;--art-x:${(i % 4) * 100 / 3}%;--art-y:${Math.floor(i / 4) * 100 / 3}%`;
  }
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
  return `<button class="game-card rarity-${c.rarity} ${selected ? "selected" : ""} ${run && cost > run.energy && variant === "hand" ? "unplayable" : ""}" data-${variant}="${variant === "hand" ? index : id}" data-card-id="${id}" style="${artStyle(id)};--card-color:${c.color};--angle:${Math.max(-10, Math.min(10, central * 3))}deg;--lift:${Math.min(15, Math.abs(central) * 5)}px;--order:${index}" aria-label="${c.name}, ${cost} energy. ${c.rules}" ><span class="card-image"></span><span class="card-etch"></span><span class="card-cost">${cost}</span><span class="card-heading">${c.name}</span><span class="card-copy"><span class="card-type">${c.subtitle.split(" / ")[1]}${c.exhaust ? " · EXHAUST" : ""}</span><span class="card-rule">${c.rules}</span></span><span class="card-footer"><span>${c.rarity}</span><span class="card-gem">◆</span><span>${variant === "hand" ? `<kbd>${index === 9 ? "0" : index + 1}</kbd>` : "CLAB"}</span></span></button>`;
}
export function titleMarkup(saved: Expedition | null, records: RunRecord[]) {
  const canContinue = saved && !["won", "lost"].includes(saved.run.phase);
  return `<section class="title-screen"><div class="title-copy"><div class="eyebrow title-eyebrow"><i></i>A CONTAINERLAB ODYSSEY</div><h1>FAULTLINE</h1><div class="title-subtitle"><span></span>Every connection matters.<span></span></div><p>At the edge of a silent world,<br>one signal is still alive.</p><nav class="title-menu" aria-label="Main menu">${canContinue ? `<button class="menu-primary" data-action="continue"><span><small>SECTOR ${saved.run.floor + 1} · ${ARCHETYPES[saved.archetype].name.toUpperCase()}</small>Continue expedition</span>${icon("arrow", 22)}</button>` : ""}<button class="${canContinue ? "menu-link" : "menu-primary"}" data-action="new"><span>${canContinue ? "" : "<small>THE SIGNAL IS CALLING</small>"}New expedition</span>${icon("arrow", 22)}</button><button class="menu-link" data-action="daily"><span>Daily expedition</span><small>A NEW SIGNAL. EVERY DAY.</small></button><button class="menu-link" data-action="collection"><span>Card archive</span><small>${String(Object.keys(CARDS).length).padStart(2, "0")} DISCOVERIES</small></button><button class="menu-link" data-action="tutorial"><span>Learn to play</span><small>OPTIONAL · 3 MINUTES</small></button><button class="menu-link" data-action="help"><span>Field guide</span>${icon("book", 16)}</button></nav><div class="title-progress">${records.length ? `${records.filter((r) => r.won).length} BACKBONES RESTORED <span>·</span> BEST ${Math.max(...records.map((r) => r.score))}` : "BUILD YOUR DECK <span>·</span> DEFEND THE NETWORK"}</div></div><div class="world-caption"><span>01 / THE SUNKEN RELAY</span><p>Some things are worth reconnecting.</p><i></i></div><div class="title-bottom"><span>ALPHA 0.3 · STRATEGY. CONSEQUENCE. CONNECTION.</span><span>HEADPHONES RECOMMENDED ${icon("sound", 14)}</span></div></section>`;
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
      return `<button class="archetype ${selected === id ? "chosen" : ""}" data-archetype="${id}" aria-pressed="${selected === id}" style="${artStyle(a.art)};--accent:${a.color}"><span class="archetype-art"></span><span class="archetype-number">0${i + 1}</span><span class="archetype-copy"><small>${a.title}</small><strong>${a.name}</strong><span>${ARCHETYPE_STORIES[id].story}</span><span class="archetype-relic">${icon("elite", 18)} ${RELICS[a.relic].name}</span><em>${RELICS[a.relic].rules}</em><span class="archetype-health">${icon("heart", 14)} ${a.integrity} INTEGRITY</span></span><span class="selection-tick">${icon("check", 16)}</span></button>`;
    })
    .join(
      "",
    )}</div><button class="text-button loadout-button" data-action="loadout">Examine starting deck ${icon("deck", 14)}</button><button class="gold-button embark" data-action="embark">Enter the Faultline ${icon("arrow", 20)}</button><p class="selection-note">${replace ? "Starting this expedition replaces your current saved run." : daily ? "A shared daily seed. Progress saves automatically." : "Seven sectors. A branching route. Progress saves automatically."}</p></section>`;
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
  return `<section class="map-screen"><aside class="map-story"><span class="eyebrow">ACT I · THE FRACTURED BACKBONE</span><div class="chapter-sigil">${icon("map", 46)}</div><h1>${chapters[Math.min(r.floor, 6)]}</h1><p>${chapterForFloor(r.floor).description}</p><blockquote class="story-fragment">“${chapterForFloor(r.floor).fragment}”</blockquote><div class="map-condition"><span>${icon("heart")} Integrity <strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></span><span>${icon("deck")} Your deck <strong>${r.deck.length}<small> cards</small></strong></span></div><div class="map-relics"><span class="eyebrow">RELICS CARRIED</span>${r.relics.map((id) => `<span class="carried-relic" data-tooltip="${RELICS[id].rules}">${icon("elite", 16)} ${RELICS[id].name}</span>`).join("")}</div><button class="text-button" data-action="deck">Examine deck ${icon("arrow", 16)}</button></aside><div class="route-scroll"><div class="route-chart"><div class="map-rings" aria-hidden="true"></div><svg class="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${r.map
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
  return `<div class="brand"><img src="${asset("containerlab-mark.svg")}" alt="Containerlab"/><span>${inTitle ? "CONTAINERLAB" : "FAULTLINE"}<small>${inTitle ? "TRANSMISSIONS FROM THE EDGE" : "A CONTAINERLAB ODYSSEY"}</small></span></div>${!inTitle && e ? `<div class="run-stats"><span class="integrity-stat" data-tooltip="Integrity persists between encounters">${icon("heart", 17)} <b>${e.run.integrity}</b><small>/${e.run.maxIntegrity}</small></span><span class="stat-divider"></span><button data-action="deck" data-tooltip="View your deck">${icon("deck", 17)} ${e.run.deck.length}</button><span class="stat-divider"></span><span class="sector-stat">SECTOR <b>${String(Math.min(e.run.floor + 1, 7)).padStart(2, "0")}</b> / 07</span></div>` : ""}<nav class="header-controls" aria-label="Game controls"><button data-action="sound" aria-label="${settings.muted ? "Enable" : "Mute"} audio" data-tooltip="${settings.muted ? "Enable" : "Mute"} audio">${icon(settings.muted ? "mute" : "sound")}</button><button data-action="fullscreen" aria-label="Toggle fullscreen" data-tooltip="Fullscreen">${icon("full")}</button><button data-action="settings" aria-label="Open settings" data-tooltip="Settings">${icon("settings", 20)}</button></nav>`;
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
    preview = combatPreview(r),
    damage = preview.packetDamage,
    enraged = enemy.id === "core" && enemy.hp <= enemy.maxHp / 2;
  const target = selected === null ? null : CARDS[r.hand[selected]];
  const hint = !target
    ? "Choose a card · Right-click to inspect its rules."
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
      ? "Place a Core Router. Connect ALPHA → router → OMEGA with two links."
      : r.topology.links.length < 2
        ? "Play Optic Fiber. Connect ALPHA → router → OMEGA."
        : paths.length
          ? "Your route is alive. Transmit to strike the threat."
          : r.faultNode || r.faultLink ? "Your route has a fault. Use Hot Patch, or build another path." : "Complete ALPHA → router → OMEGA. Every section needs a link.";
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
      <span class="enemy-flavor">${esc(enemy.name === "TRAINING ECHO" ? enemy.title : enemyStory(enemy.id)?.title ?? enemy.title)}</span>
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
        ${damage ? `<div class="damage-equation" aria-label="Damage calculation">${preview.damageTerms.slice(0, 4).map(t => `<span><span>${esc(t.label)}</span><b>${t.amount >= 0 ? "+" : ""}${t.amount}</b></span>`).join("")}${preview.damageTerms.length > 4 ? `<span class="equation-extra">${preview.damageTerms.length - 4} more modifiers · inspect</span>` : ""}</div>` : `<p>Connect ALPHA to OMEGA through a router.</p>`}
        <button class="formula-button" data-action="combat-details">${icon("book", 12)} Inspect calculation</button>
      </div>
      <div class="battle-relics">${r.relics.slice(0, 3).map((id) => `<span tabindex="0" data-tooltip="${RELICS[id].name}: ${RELICS[id].rules}">${icon("elite", 15)}<small>${RELICS[id].name}</small></span>`).join("")}</div>
      <button class="formula-button devices-button" data-action="devices">${icon("map", 12)} Devices & placement</button>
      <button class="text-button undo-button" data-action="undo" ${!undo || busy ? "disabled" : ""}>${icon("undo", 14)} Undo last action <kbd>Z</kbd></button>
    ${tutorial ? `<div class="tutorial-callout"><span>${icon("book", 15)} Field note</span><p>${guide}</p><button data-action="dismiss-tutorial" aria-label="Dismiss field note">${icon("close", 14)}</button></div>` : ""}
    </aside>
    <aside class="battle-right battle-plate" aria-label="Enemy intent">
      <span class="plate-heading">Enemy intent</span><button class="trait-badge" data-action="enemy-dossier" data-tooltip="${esc(preview.traitDescription)}">${({leech:"SIPHON",wraith:"CABLE HUNTER",storm:"BAND SUPPRESSION",sentinel:"ARMORED GATE",core:"QUARANTINE"} as Record<string,string>)[enemy.id]}</button>
      <div class="intent-emblem">${icon(intent.kind === "strike" || intent.kind === "breach" ? "sword" : intent.kind === "jam" ? "bolt" : "link", 28)}</div>
      <strong>${intentName}</strong>
      ${intent.pressure || enraged ? `<span class="pressure-warning">${enraged ? "ENRAGED" : ""}${enraged && intent.pressure ? " · " : ""}${intent.pressure ? `PRESSURE +${intent.pressure}` : ""}</span>` : ""}
      <p class="intent-description">${preview.lethal ? "Defeated before it can act." : preview.faultTarget ? `${intent.kind === "sever" ? "Severs" : "Jams"} ${esc(preview.faultTarget.toUpperCase().replaceAll("::", " ↔ "))} for one turn.${preview.incomingRaw ? ` Also deals ${preview.incomingRaw} damage.` : ""}` : ["jam", "sever"].includes(intent.kind) ? preview.incomingRaw ? `No fault target. ${preview.incomingRaw} damage to the backbone.` : preview.hazardZone ? "No eligible device in the targeted band. The jam will fail." : "Protected network. This fault will fail." : `${preview.incomingRaw} damage after your transmission.`}</p>
      ${preview.hazardZone ? `<span class="hazard-caption">${preview.hazardZone.toUpperCase()} BAND TARGETED</span>` : ""}${preview.enemyHealing ? `<span class="hazard-caption">Restores ${preview.enemyHealing} health this turn</span>` : ""}
      <div class="defense-equation" aria-label="Incoming damage forecast"><span>Incoming <b>${preview.incomingRaw}</b></span><span class="shield-value">${icon("shield", 12)} Blocked <b>${Math.min(preview.incomingRaw, preview.shield)}</b></span><span class="forecast-net ${preview.incoming ? "danger" : "safe"}">Integrity loss <b>${preview.incoming}</b></span></div>
      <button class="formula-button" data-action="combat-details">Why this damage? ${icon("arrow", 12)}</button>
      <div class="plate-divider" aria-hidden="true"><span>◆</span></div>
      <span class="intent-caption">Your next strike</span>
      <span class="intent-preview ${damage >= enemy.hp ? "lethal" : ""}">${damage ? `${damage} damage` : "No live route"}</span>
      ${damage >= enemy.hp ? '<span class="lethal-caption">A finishing blow</span>' : ""}
    </aside>
    <div class="battle-bottom">
      <div class="energy-orb"><strong>${r.energy}</strong><span>ENERGY</span></div>
      <div class="draw-piles"><button data-action="draw-pile">${icon("deck", 22)}<span>${r.drawPile.length}<small>DRAW</small></span></button><button data-action="discard-pile">${icon("deck", 19)}<span>${r.discardPile.length}<small>DISCARD</small></span></button><button data-action="exhaust-pile" class="exhaust-pile" data-tooltip="Exhausted cards return next encounter">${icon("bolt", 16)}<span>${r.exhaustPile.length}<small>EXHAUST</small></span></button></div>
      <div class="target-hint ${selected !== null ? "active" : ""}">${selected !== null ? icon("arrow", 15) : ""}${hint}${selected !== null ? '<button data-action="cancel">ESC ×</button>' : ""}</div>
      <button class="transmit-button ${damage ? "ready" : ""} ${busy ? "transmitting" : ""}" data-action="transmit" aria-label="Transmit · ${damage} damage · End turn" ${busy ? "disabled" : ""}>
        <span class="transmit-dial" aria-hidden="true"></span>
        <span class="transmit-power" aria-hidden="true"><strong>${busy ? "· · ·" : damage}</strong><small>${busy ? "sending" : "damage"}</small></span>
        <span class="transmit-label">${busy ? "Transmitting" : "Transmit"}</span>
        <span class="transmit-shortcut">End turn <span>·</span> <kbd>SPACE</kbd></span>
      </button>
      <button class="battle-guide" data-action="enemy-dossier">${icon("book", 14)} Know your enemy</button>
    </div>
    <div class="network-status"><span>${icon("shield", 12)} ${preview.shield} shield available</span><span>${icon("bolt", 12)} +${r.packetBoost} burst</span>${r.reserveEnergy ? `<span>+${r.reserveEnergy} energy next turn</span>` : ""}${r.faultNode || r.faultLink ? `<span class="status-fault">${icon("link", 12)} Active fault · ${esc((r.faultNode || r.faultLink || "").toUpperCase().replaceAll("::", " ↔ "))}</span>` : `<span>${preview.independent ? "Independent routes" : preview.signalPath.length ? "Single route" : "No live route"}</span>`}</div>
    <button class="combat-log" data-action="combat-log" aria-label="Open combat history" aria-live="polite">${esc(r.log[0] || "")} <span>↗</span></button>`;
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
  const story = sanctuaryStory(r.floor, r.map.find(n => n.id === r.currentRoom)?.lane);
  return `<section class="forge-screen full-screen"><div class="reward-emblem">${icon("forge", 34)}</div><span class="eyebrow">SANCTUARY · NO HOSTILE SIGNALS</span><h1>${story.title}.</h1><p>${story.description}</p><div class="forge-options"><button data-forge="repair" style="${artStyle("patch")}"><span class="forge-art"></span><span class="eyebrow">REPAIR</span><strong>Mend the backbone</strong><span>Restore ${Math.min(4, r.maxIntegrity - r.integrity)} integrity.</span><small>${r.integrity} / ${r.maxIntegrity} CURRENT INTEGRITY</small></button><button data-forge="relic" style="${artStyle("firmware")}"><span class="forge-art"></span><span class="eyebrow">SALVAGE</span><strong>Unearth a relic</strong><span>Discover a permanent upgrade.</span><small>CHOOSE ONE OF THREE RELICS</small></button><button data-action="refine" style="${artStyle("crosslink")}"><span class="forge-art"></span><span class="eyebrow">REFINE</span><strong>Travel a little lighter</strong><span>Remove one card from your deck.</span><small>ONE SERVICE · CHOOSE CAREFULLY</small></button></div></section>`;
}
export function outcomeMarkup(e: Expedition) {
  const r = e.run,
    won = r.phase === "won", story = OUTCOMES[won ? "won" : "lost"];
  return `<section class="outcome-screen full-screen ${won ? "victory" : ""}"><div class="outcome-symbol">${icon(won ? "crown" : "link", 54)}</div><span class="eyebrow">${story.eyebrow}</span><h1>${story.title}</h1><p>${story.description}${won ? ` ${ARCHETYPE_STORIES[e.archetype].epilogue}` : ""}</p><div class="outcome-stats"><span><strong>${r.score.toLocaleString()}</strong>SCORE</span><span><strong>${r.floor} / 7</strong>SECTORS</span><span><strong>${r.deck.length}</strong>CARDS</span></div><button class="gold-button" data-action="new">Another expedition ${icon("arrow")}</button><button class="text-button" data-action="title">Return to the relay</button></section>`;
}
export function settingsMarkup(s: AudioSettings, inRun: boolean, preferences: Preferences) {
  return `<div class="settings-content"><span class="eyebrow">TAKE A BREATH</span><h2>At your frequency.</h2><label class="setting-slider"><span>Music <output>${Math.round(s.music * 100)}%</output></span><input type="range" min="0" max="100" value="${s.music * 100}" data-setting="music" aria-label="Music volume"/></label><label class="setting-slider"><span>Sound effects <output>${Math.round(s.effects * 100)}%</output></span><input type="range" min="0" max="100" value="${s.effects * 100}" data-setting="effects" aria-label="Sound effects volume"/></label><label class="setting-toggle"><span>Motion & screen shake</span><input type="checkbox" data-setting="motion" ${s.motion ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Contextual field notes</span><input type="checkbox" data-preference="tips" ${preferences.tips ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Quick transmissions</span><input type="checkbox" data-preference="fast" ${preferences.fast ? "checked" : ""}/><i></i></label><div class="settings-actions"><button class="gold-button" data-action="close">${inRun ? "Return to expedition" : "Return"} ${icon("arrow")}</button>${inRun ? '<button class="text-button" data-action="save-exit">Save & return to title</button>' : ""}<button class="text-button" data-action="credits">Art & soundtrack credits</button></div></div>`;
}
