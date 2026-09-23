import { ENEMIES } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { CARDS, RELICS } from "./core/cards.ts";
import {
  ARCHETYPES,
  type Archetype,
  type Expedition,
  type RunRecord,
} from "./core/expedition.ts";
import { reachableRooms, connectsTo, encounterHealth } from "./core/map.ts";
import { combatPreview, costFor, intentFor, signalPaths, FIELD_RULES, ZONES, zoneDescription, SALVAGE_COST, SALVAGE_MIN_INTEGRITY } from "./core/run.ts";
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
    field: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 5 3v5l-5 3-5-3v-5l5-3Z"/><path d="M12 2v5m9 0-4 3m4 7-4-2m-5 7v-4m-9-1 4-2M3 7l4 3"/>',
    cleanse: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    eye: '<circle cx="11" cy="10" r="7"/><circle cx="11" cy="10" r="3"/><path d="m16 15 5 6M11 1v3M2 10h3m12 0h3"/>',
    battery: '<path d="M8 3h8v3h3v15H5V6h3V3Z"/><path d="m13 8-4 6h4l-1 4 4-6h-4l1-4Z"/>',
    anchor: '<path d="M12 7v14M3 13l2 5 7 4 7-4 2-5M7 10h10"/><circle cx="12" cy="4" r="3"/>',
    coins: '<path d="m12 3 8 5v8l-8 5-8-5V8l8-5Z"/><path d="m12 7 4 3v4l-4 3-4-3v-4l4-3Z"/>',
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
  const fields = ["resonance-field", "aegis-field", "purge-field", "null-field"];
  if (fields.includes(id)) {
    const i = fields.indexOf(id);
    return `--card-image:url('${asset("art/zone-card-atlas.png")}');--art-size:200% 200%;--art-x:${i % 2 * 100}%;--art-y:${Math.floor(i / 2) * 100}%`;
  }
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
  return `<section class="title-screen"><div class="title-copy"><div class="eyebrow title-eyebrow"><i></i>A CONTAINERLAB ODYSSEY</div><h1>FAULTLINE</h1><div class="title-subtitle"><span></span>Every connection matters.<span></span></div><p>At the edge of a silent world,<br>one signal is still alive.</p><nav class="title-menu" aria-label="Main menu">${canContinue ? `<button class="menu-primary" data-action="continue"><span><small>STAGE ${STAGES[saved.run.stage].numeral} · SECTOR ${saved.run.floor + 1} · ${ARCHETYPES[saved.archetype].name.toUpperCase()}</small>Continue expedition</span>${icon("arrow", 22)}</button>` : ""}<button class="${canContinue ? "menu-link" : "menu-primary"}" data-action="new"><span>${canContinue ? "" : "<small>THE SIGNAL IS CALLING</small>"}New expedition</span>${icon("arrow", 22)}</button><button class="menu-link" data-action="daily"><span>Daily expedition</span><small>A NEW SIGNAL. EVERY DAY.</small></button><button class="menu-link" data-action="collection"><span>Card archive</span><small>${String(Object.keys(CARDS).length).padStart(2, "0")} DISCOVERIES</small></button><button class="menu-link" data-action="tutorial"><span>Learn to play</span><small>OPTIONAL · 3 MINUTES</small></button><button class="menu-link" data-action="help"><span>Field guide</span>${icon("book", 16)}</button></nav><div class="title-progress">${records.length ? `${records.filter((r) => r.won).length} BACKBONES RESTORED <span>·</span> BEST ${Math.max(...records.map((r) => r.score))}` : "BUILD YOUR DECK <span>·</span> DEFEND THE NETWORK"}</div></div><div class="world-caption"><span>01 / THE SUNKEN RELAY</span><p>Some things are worth reconnecting.</p><i></i></div><div class="title-bottom"><span>ALPHA 0.3 · STRATEGY. CONSEQUENCE. CONNECTION.</span><span>HEADPHONES RECOMMENDED ${icon("sound", 14)}</span></div></section>`;
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
    )}</div><button class="text-button loadout-button" data-action="loadout">Examine starting deck ${icon("deck", 14)}</button><button class="gold-button embark" data-action="embark">Enter the Faultline ${icon("arrow", 20)}</button><p class="selection-note">${replace ? "Starting this expedition replaces your current saved run." : daily ? "A shared daily seed. Progress saves automatically." : "Three stages. Three guardians. Progress saves automatically."}</p></section>`;
}
export const roomNames: Record<MapRoom["type"], string> = {
  battle: "Hostile signal",
  elite: "Elite threat",
  cache: "Salvage cache",
  forge: "Sanctuary",
  boss: "Stage guardian",
};
const roomIcons = {
  battle: "sword",
  elite: "elite",
  cache: "cache",
  forge: "forge",
  boss: "boss",
};
export function mapMarkup(e: Expedition) {
  const r = e.run, stage = STAGES[r.stage],
    reachable = new Set(reachableRooms(r).map((n) => n.id));
  const pos = (n: MapRoom) => ({
    x: 18 + n.lane * 30 + (n.floor % 2 ? 3 : -3),
    y: 86 - n.floor * 12,
  });
  const lines = r.map
    .flatMap((n) =>
      r.map
        .filter(
          (t) => connectsTo(n, t),
        )
        .map((t) => {
          const a = pos(n),
            b = pos(t);
          const active = n.cleared && (t.cleared || reachable.has(t.id));
          return `<path d="M ${a.x} ${a.y} C ${a.x} ${a.y - 6},${b.x} ${b.y + 6},${b.x} ${b.y}" class="${active ? "traversed" : ""}"/>`;
        }),
    )
    .join("");
  return `<section class="map-screen"><aside class="map-story"><span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}</span><div class="chapter-sigil">${icon("map", 46)}</div><h1>${stage.chapters[Math.min(r.floor, 6)]}</h1><p>${r.stage === 0 && r.floor < 3 ? chapterForFloor(r.floor).description : stage.description}</p><blockquote class="story-fragment">“${stage.fragment}”</blockquote><div class="map-condition"><span>${icon("heart")} Integrity <strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></span><span>${icon("deck")} Your deck <strong>${r.deck.length}<small> cards</small></strong></span></div><div class="map-relics"><span class="eyebrow">RELICS CARRIED</span>${r.relics.map((id) => `<span class="carried-relic" data-tooltip="${RELICS[id].rules}">${icon("elite", 16)} ${RELICS[id].name}</span>`).join("")}</div><button class="text-button" data-action="deck">Examine deck ${icon("arrow", 16)}</button></aside><div class="route-scroll" role="region" tabindex="0" aria-label="Route chart. Scroll to scout future sectors."><div class="route-chart"><div class="map-rings" aria-hidden="true"></div><svg class="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${r.map
    .map((n) => {
      const p = pos(n),
        available = reachable.has(n.id);
      const scout = n.enemyId ? ENEMIES[n.enemyId] : null;
      const detail = scout ? `${scout.name} · ${encounterHealth(r.stage, n)} integrity. ${scout.trait}`
        : n.type === "forge" ? "Choose repair, card removal, or sacrifice 2 maximum integrity for a relic. One service only."
        : n.type === "cache" ? "Choose one card or skip. No integrity recovery." : "A hostile encounter.";
      return `<button class="route-room type-${n.type} ${available ? "available" : ""} ${n.cleared ? "cleared" : ""}" data-room="${n.id}" title="${esc(detail)}" data-tooltip="${esc(detail)}" style="left:${p.x}%;top:${p.y}%" ${available ? "" : "disabled"} aria-label="Sector ${n.floor + 1}: ${n.type === "boss" ? stage.chapters[6] : roomNames[n.type]}${scout ? `, ${scout.name}, ${encounterHealth(r.stage, n)} integrity` : ""}"><span class="room-orbit"></span><span class="room-symbol">${icon(n.cleared ? "check" : roomIcons[n.type], n.type === "boss" ? 28 : 20)}</span><span class="room-label">${n.type === "boss" ? stage.chapters[6] : roomNames[n.type]}${scout && n.type !== "boss" ? `<small class="room-scout">${scout.name.replace(/^THE /, "")}</small>` : ""}</span>${available ? '<span class="room-enter">ENTER</span>' : ""}</button>`;
    })
    .join(
      "",
    )}<div class="chart-start">${icon("arrow", 16)} YOUR JOURNEY</div></div></div><div class="map-bottom"><span>SCROLL TO SCOUT · CHOOSE A LIT RELAY</span><div class="map-legend">${Object.entries(
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
  return `<div class="brand"><img src="${asset("containerlab-mark.svg")}" alt="Containerlab"/><span>${inTitle ? "CONTAINERLAB" : "FAULTLINE"}<small>${inTitle ? "TRANSMISSIONS FROM THE EDGE" : "A CONTAINERLAB ODYSSEY"}</small></span></div>${!inTitle && e ? `<div class="run-stats"><span class="integrity-stat" data-tooltip="Integrity persists between encounters">${icon("heart", 17)} <b>${e.run.integrity}</b><small>/${e.run.maxIntegrity}</small></span><span class="stat-divider"></span><button data-action="deck" data-tooltip="View your deck">${icon("deck", 17)} ${e.run.deck.length}</button><span class="stat-divider"></span><span class="stage-stat" data-tooltip="${STAGES[e.run.stage].name}">STAGE <b>${STAGES[e.run.stage].numeral}</b><small> / III</small></span><span class="stat-divider"></span><span class="sector-stat">SECTOR <b>${String(Math.min(e.run.floor + 1, 7)).padStart(2, "0")}</b> / 07</span></div>` : ""}<nav class="header-controls" aria-label="Game controls"><button data-action="sound" aria-label="${settings.muted ? "Enable" : "Mute"} audio" data-tooltip="${settings.muted ? "Enable" : "Mute"} audio">${icon(settings.muted ? "mute" : "sound")}</button><button data-action="fullscreen" aria-label="Toggle fullscreen" data-tooltip="Fullscreen">${icon("full")}</button><button data-action="settings" aria-label="Open settings" data-tooltip="Settings">${icon("settings", 20)}</button></nav>`;
}
export function battleMarkup(
  e: Expedition, selected: number | null, source: string | null,
  busy: boolean, tutorial: boolean, undo: boolean,
) {
  const r = e.run, stage = STAGES[r.stage], enemy = r.enemy!, intent = intentFor(r)!, p = combatPreview(r);
  const target = selected === null ? null : CARDS[r.hand[selected]];
  const hint = !target ? "Choose your next move" : target.target === "zone" ? "Choose a band on the table or a field seal below" : target.target === "ground" ? "Choose an empty socket on the table" : target.target === "link" ? source ? "Choose the second device" : "Choose the first device" : "Choose a device";
  const intentName = intent.ultimate ? ENEMIES[enemy.id].pattern[enemy.turn % ENEMIES[enemy.id].pattern.length].label : { strike: "Integrity strike", sever: "Sever a cable", jam: "Jam a device", breach: "Security breach", corrupt: "Corrupt a zone", charge: "Charging ultimate" }[intent.kind];
  const trait = ENEMIES[enemy.id].badge;
  const faultCopy = p.faultTarget ? `${intent.kind === "sever" ? "Severs" : "Jams"} ${p.faultTarget.toUpperCase().replaceAll("::", " ↔ ")} for one turn.` : ["jam", "sever"].includes(intent.kind) ? "No exposed device or cable to disrupt." : "";
  const fieldCopy = p.zoneThreat ? `${FIELD_RULES[p.zoneThreat.kind].name} in ${p.zoneThreat.zone.toUpperCase()} for 2 turns, starting next turn.` : "";
  const nextIntent = intent.kind === "charge" ? intentFor({ ...r, enemy: { ...enemy, hp: Math.max(0, enemy.hp - p.packetDamage) } }, 1) : null;
  const intentCopy = p.lethal ? "Your transmission defeats it before it can act."
    : p.interrupted ? "Ultimate interrupted. Existing fields still resolve. Exposed next turn: armor bypassed, +3 damage."
    : nextIntent ? `${p.incomingRaw ? `Fields: ${p.incomingRaw} damage now. ` : ""}Ultimate: ${nextIntent.amount} damage next turn. Prepare a burst (P); deal ${p.breakDamage} then to interrupt, or brace.`
    : [faultCopy, fieldCopy, !faultCopy && !fieldCopy ? `${p.incomingRaw} damage after your transmission.` : ""].filter(Boolean).join(" ");
  const bossWindow = !p.lethal && intent.ultimate ? `<div class="boss-window ${p.interrupted ? "broken" : "ultimate"}" role="status"><span>${p.interrupted ? "INTERRUPT READY" : "INTERRUPT THIS TURN"}</span><strong>${p.packetDamage} / ${p.breakDamage} damage</strong><div class="break-meter" role="meter" aria-label="Damage to interrupt ultimate" aria-valuenow="${Math.min(p.packetDamage, p.breakDamage!)}" aria-valuemin="0" aria-valuemax="${p.breakDamage}"><i style="width:${Math.min(100, p.packetDamage / p.breakDamage! * 100)}%"></i></div></div>`
    : enemy.exposed ? '<div class="boss-window broken"><span>EXPOSED THIS TURN</span><strong>+3 damage · armor bypassed</strong></div>' : "";
  const heading = intent.ultimate ? `${intentName} · ${p.interrupted ? "BREAK READY" : "INBOUND"}` : intent.kind === "charge" ? "THE GUARDIAN IS GATHERING POWER" : enemy.exposed ? "THE GUARDIAN IS EXPOSED" : stage.chapters[r.floor].toUpperCase();

  return `
    <div class="encounter-heading"><span class="eyebrow">${heading}</span><span class="round-banner"><i></i> TURN ${String(r.turn).padStart(2,"0")} <i></i></span></div>
    <aside class="battle-left battle-plate player-plate" aria-label="Your network">
      <div class="combatant-identity"><span class="combatant-seal">${icon("shield", 25)}</span><div><span class="plate-kicker">SIGNAL KEEPER</span><span class="plate-heading">${ARCHETYPES[e.archetype].name}</span></div></div>
      <div class="vital-heading"><span>${icon("heart", 15)} Integrity</span><strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></div>
      <div class="vital-bar player-health" role="meter" aria-label="Your integrity" aria-valuenow="${r.integrity}" aria-valuemin="0" aria-valuemax="${r.maxIntegrity}"><i style="width:${r.integrity / r.maxIntegrity * 100}%"></i>${p.incoming ? `<span class="health-risk" style="left:${Math.max(0,r.integrity-p.incoming)/r.maxIntegrity*100}%;width:${Math.min(r.integrity,p.incoming)/r.maxIntegrity*100}%"></span>` : ""}</div>
      <div class="survival-forecast forecast-net ${p.incoming ? "danger" : "safe"}"><b>${p.incoming}</b> ${p.incoming ? "integrity at risk" : p.lethal ? "retaliation · finishing blow" : "integrity lost · protected"}</div>
      <div class="player-resources">
        <div class="shield-resource" tabindex="0" data-tooltip="Available shield: ${esc(p.shieldTerms.map(t=>`${t.label} +${t.amount}`).join("; ") || "Play defense cards or route through protected fields.")}">${icon("shield", 22)}<strong>${p.shield}</strong><span>SHIELD</span></div>
        <div class="signal-readout ${p.packetDamage ? "online" : ""}">${icon("sword", 22)}<strong>${p.packetDamage}<small>signal damage</small></strong><span>DAMAGE</span></div>
        <div class="burst-resource" tabindex="0" data-tooltip="Extra route damage for this transmission. Burst expires after your turn.">${icon("bolt", 22)}<strong>+${r.packetBoost}</strong><span>BURST</span></div>
      </div>

      <div class="player-tools"><button class="formula-button" data-action="combat-details">${icon("book",14)} Details</button><button class="formula-button devices-button" data-action="devices" aria-label="Devices & placement" data-tooltip="Devices & placement">${icon("map",14)}<span>Devices</span></button><button class="text-button undo-button" data-action="undo" aria-label="Undo last action · Z" data-tooltip="Undo last action · Z" ${!undo || busy ? "disabled" : ""}>${icon("undo",14)}<span>Undo</span><kbd>Z</kbd></button></div>
      <div class="perk-heading"><span>RELICS & PERKS</span><small>${r.relics.length} carried</small></div>
      <div class="battle-relics">${r.relics.map(id=>`<button class="relic-token" data-action="relic-journal" data-tooltip="${esc(RELICS[id].name+": "+RELICS[id].rules)}" aria-label="${esc(RELICS[id].name+": "+RELICS[id].rules)}" style="--relic-color:${RELICS[id].color}">${icon(({"hot-swap":"link","cold-start":"bolt","shield-array":"shield","deep-cache":"deck","parallel-core":"field","grounded-core":"anchor","packet-lens":"eye","repair-drone":"heart","reserve-cell":"battery"} as Record<string,string>)[id],20)}<small>${RELICS[id].name}</small></button>`).join("")}</div>
      ${r.reserveEnergy ? `<span class="reserve-note">${icon("bolt",12)} +${r.reserveEnergy} energy next turn</span>` : ""}


    </aside>
    <aside class="battle-right battle-plate enemy-plate" aria-label="Enemy intent">
      <div class="combatant-identity"><span class="combatant-seal">${icon(ENEMIES[enemy.id].boss ? "boss" : "sword",25)}</span><div><span class="plate-kicker">${ENEMIES[enemy.id].boss ? `STAGE ${stage.numeral} · GUARDIAN` : "HOSTILE SIGNAL"}</span><h2>${esc(enemy.name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()))}</h2></div></div>
      <span class="enemy-flavor">${esc(enemyStory(enemy.id)?.title ?? enemy.title)}</span>
      <div class="vital-heading enemy-health-label"><span>Hostile integrity</span><strong>${enemy.hp}<small> / ${enemy.maxHp}</small></strong></div>
      <div class="enemy-health vital-bar" role="meter" aria-label="Hostile integrity" aria-valuenow="${enemy.hp}" aria-valuemin="0" aria-valuemax="${enemy.maxHp}" data-tooltip="${p.packetDamage} damage on your next transmission"><span style="width:${enemy.hp/enemy.maxHp*100}%"></span>${p.packetDamage ? `<i class="health-risk" style="left:${Math.max(0,enemy.hp-p.packetDamage)/enemy.maxHp*100}%;width:${Math.min(enemy.hp,p.packetDamage)/enemy.maxHp*100}%"></i>` : ""}</div>
      <button class="trait-badge" data-action="enemy-dossier" data-tooltip="${esc(p.traitDescription)}">${icon("elite",13)} ${trait}</button>
      <div class="intent-heading"><span>NEXT INTENT</span><span class="intent-states">${intent.label.startsWith("ENRAGED") ? '<b class="enrage-warning">ENRAGED</b>' : ""}${intent.pressure ? `<span class="pressure-warning">PRESSURE +${intent.pressure}</span>` : ""}</span></div>
      <div class="intent-medallion ${p.lethal || p.interrupted ? "lethal" : ""}"><span class="intent-emblem">${icon(intent.kind === "corrupt" ? "field" : intent.kind === "jam" || intent.kind === "charge" ? "bolt" : intent.kind === "sever" ? "link" : "sword",30)}</span><strong>${p.lethal ? "CANCELLED" : p.interrupted ? "BROKEN" : intent.kind === "charge" ? "CHARGE" : p.incomingRaw || ""}<small>${intentName}</small></strong></div>
      ${bossWindow}
      <p class="intent-description">${esc(intentCopy)}</p>
      ${p.hazardZone ? `<span class="hazard-caption" ${intent.field ? 'data-combined-intent="true"' : ""}>${icon("field",13)} ${p.zoneThreat ? FIELD_RULES[p.zoneThreat.kind].name.toUpperCase()+" · " : ""}${p.hazardZone.toUpperCase()}</span>` : ""}${p.enemyHealing ? `<span class="hazard-caption">Restores ${p.enemyHealing} health this turn</span>` : ""}
    </aside>
      ${tutorial ? `<div class="tutorial-callout"><span>FIELD NOTE</span><p>${p.signalPath.length ? "Your route is alive. Fields and independent circuits make it stronger." : "Build ALPHA → router → OMEGA, then transmit."}</p><button data-action="dismiss-tutorial" aria-label="Dismiss field note">${icon("close",12)}</button></div>` : ""}
    <div class="field-strip" aria-label="Battlefield zones">${ZONES.map(zone=>{
      const effects = r.zoneEffects.filter(effect=>effect.zone===zone);
      const threatened = p.hazardZone === zone;
      return `<button class="field-seal ${effects.some(effect=>FIELD_RULES[effect.kind].hostile) ? "corrupted" : effects.length ? "empowered" : ""} ${threatened ? "threatened" : ""} ${target?.target === "zone" ? "targetable" : ""}" data-field-zone="${zone}" data-tooltip="${esc(zoneDescription(r,zone))}${threatened ? ". Enemy targets this band next." : ""}" aria-label="${zone} zone: ${esc(zoneDescription(r,zone))}${threatened ? ". Threatened next turn" : ""}"><span class="field-name">${icon("field",16)} ${zone.toUpperCase()} ${threatened ? '<i class="threat-mark">!</i>' : ""}</span><span class="field-effects">${effects.length ? effects.map(effect=>`<span class="${FIELD_RULES[effect.kind].hostile ? "hostile-field" : "allied-field"}">${FIELD_RULES[effect.kind].name} <b>${effect.turns}t</b></span>`).join("") : `<span>${threatened ? "THREAT INBOUND" : "CLEAR GROUND"}</span>`}</span></button>`;
    }).join("")}</div>
    <div class="battle-bottom">
      <div class="energy-orb" aria-label="${r.energy} energy available"><strong>${r.energy}</strong><span>ENERGY</span></div>
      <div class="draw-piles">${([['draw-pile',r.drawPile.length,'DRAW'],['discard-pile',r.discardPile.length,'DISCARD'],['exhaust-pile',r.exhaustPile.length,'EXHAUST']] as const).map(([action,count,label])=>`<button data-action="${action}" class="${action}" data-tooltip="${label === 'EXHAUST' ? 'Exhausted cards return next encounter' : `Inspect your ${label.toLowerCase()} pile`}">${icon("deck",18)}<span>${count}<small>${label}</small></span></button>`).join("")}<button data-action="prepare" class="prepared-pile ${r.preparedCard ? "occupied" : ""}" aria-label="${r.preparedCard ? `Prepared: ${CARDS[r.preparedCard].name}` : "Prepare a card for next turn"}" data-tooltip="${r.preparedCard ? `${CARDS[r.preparedCard].name} is held for next turn` : "Hold one card for next turn, replacing one draw · P"}" ${busy ? "disabled" : ""}>${icon("battery",18)}<span>${r.preparedCard ? "1" : "+"}<small>${r.preparedCard ? "READY" : "PREPARE"}</small></span></button></div>
      <div class="target-hint ${selected !== null ? "active" : ""}">${hint}${selected !== null ? '<button data-action="cancel">CANCEL · ESC</button>' : `<span>1–0 to play · Right-click to inspect${r.hand.length > 6 ? " · Scroll to see your hand" : ""}</span>`}</div>
      <button class="transmit-button ${p.packetDamage ? "ready" : ""} ${busy ? "transmitting" : ""}" data-action="transmit" aria-label="Transmit · ${p.packetDamage} damage · End turn" ${busy ? "disabled" : ""}><span class="transmit-dial" aria-hidden="true"></span><span class="transmit-power" aria-hidden="true"><strong>${busy ? "· · ·" : p.packetDamage}</strong><small>${busy ? "sending" : "damage"}</small></span><span class="transmit-label">${busy ? "Transmitting" : "Transmit"}</span><span class="transmit-shortcut">End turn · <kbd>SPACE</kbd></span></button>
    </div>
    <div class="network-status">${r.faultNode || r.faultLink ? `<span class="status-fault">${icon("link",12)} Active fault · ${esc((r.faultNode || r.faultLink || "").toUpperCase().replaceAll("::"," ↔ "))}</span>` : `<span>${icon("link",12)} ${p.independent ? "Independent circuits" : p.signalPath.length ? "Signal connected" : "Awaiting a live route"}</span>`}</div>
    <button class="combat-log" data-action="combat-log" aria-label="Open combat history">${icon("book",12)} ${esc(r.log[0] || "")} <span>↗</span></button>`;
}
export function handMarkup(run: RunState, selected: number | null) {
  return `${run.hand.length > 6 ? `<button class="hand-scroll hand-scroll-left" data-action="hand-left" aria-label="Previous cards">${icon("back",18)}</button><button class="hand-scroll hand-scroll-right" data-action="hand-right" aria-label="Next cards">${icon("arrow",18)}</button>` : ""}<div class="card-fan" data-count="${run.hand.length}" style="--hand-size:${run.hand.length}">${run.hand.map((id, i) => cardMarkup(id, i, "hand", run, selected === i)).join("")}</div>`;
}
export function rewardMarkup(r: RunState) {
  const room = r.map.find(room => room.id === r.currentRoom);
  const cache = room?.type === "cache", boss = room?.type === "boss";
  const description = cache ? "A tool for the road, signal keeper. Take one with you."
    : boss ? r.stage === 2 ? "Claim your last discovery. The backbone is waiting."
      : "Choose a card, then claim a relic and enter the next stage with up to 6 integrity restored."
    : "Choose a card to carry into the next sector.";
  return `<section class="reward-screen full-screen"><div class="reward-emblem">${icon(cache ? "cache" : "crown", 36)}</div><span class="eyebrow">${cache ? "THE SALVAGE EXCHANGE" : boss ? `STAGE ${STAGES[r.stage].numeral} · GUARDIAN DEFEATED` : "HOSTILE SIGNAL SILENCED"}</span><h1>${cache ? "The Copper Market." : boss ? "The gate stands open." : "A connection restored."}</h1><p>${description}</p><div class="reward-cards">${r.cardRewards.map((id, i) => cardMarkup(id, i, "reward")).join("")}</div><button class="text-button" data-action="skip-reward">Leave these behind ${icon("arrow", 16)}</button><span class="reward-footer">YOUR DECK · ${r.deck.length} CARDS</span></section>`;
}
export function relicMarkup(r: RunState) {
  return `<section class="relic-screen full-screen"><span class="eyebrow">A FRAGMENT OF THE OLD WORLD</span><h1>${r.map.find(room => room.id === r.currentRoom)?.type === "boss" ? "A guardian falls. A passage opens." : "Power that stays with you."}</h1><p>Choose one relic. Its effect lasts for the expedition.${r.map.find(room => room.id === r.currentRoom)?.type === "boss" ? " Restore up to 6 integrity on entering the next stage." : ""}</p><div class="relic-options">${r.relicRewards.map((id, i) => `<button class="relic-option" data-relic="${id}" style="--accent:${RELICS[id].color};${artStyle(["firmware", "shield", "surge"][i])}"><span class="relic-art"></span><small>${RELICS[id].subtitle}</small><strong>${RELICS[id].name}</strong><span>${RELICS[id].rules}</span>${icon("arrow", 18)}</button>`).join("")}</div></section>`;
}
export function forgeMarkup(r: RunState) {
  const story = sanctuaryStory(r.floor, r.map.find(n => n.id === r.currentRoom)?.lane);
  const salvageDisabled = r.maxIntegrity - SALVAGE_COST < SALVAGE_MIN_INTEGRITY || r.relics.length >= Object.keys(RELICS).length;
  return `<section class="forge-screen full-screen"><div class="reward-emblem">${icon("forge", 34)}</div><span class="eyebrow">SANCTUARY · NO HOSTILE SIGNALS</span><h1>${story.title}.</h1><p>${story.description}</p><div class="forge-options"><button data-forge="repair" style="${artStyle("patch")}"><span class="forge-art"></span><span class="eyebrow">REPAIR</span><strong>Mend the backbone</strong><span>Restore ${Math.min(4, r.maxIntegrity - r.integrity)} integrity.</span><small>${r.integrity} / ${r.maxIntegrity} CURRENT INTEGRITY</small></button><button data-forge="relic" style="${artStyle("firmware")}" ${salvageDisabled ? "disabled" : ""}><span class="forge-art"></span><span class="eyebrow">SALVAGE</span><strong>Bind a relic</strong><span>Sacrifice ${SALVAGE_COST} maximum integrity for a permanent upgrade.</span><small>${r.relics.length >= Object.keys(RELICS).length ? "ALL RELICS RECOVERED" : salvageDisabled ? `REQUIRES ${SALVAGE_MIN_INTEGRITY + SALVAGE_COST}+ MAXIMUM INTEGRITY` : `MAX INTEGRITY ${r.maxIntegrity} → ${r.maxIntegrity - SALVAGE_COST} · CHOOSE ONE OF THREE`}</small></button><button data-action="refine" style="${artStyle("crosslink")}"><span class="forge-art"></span><span class="eyebrow">REFINE</span><strong>Travel a little lighter</strong><span>Remove one card from your deck.</span><small>ONE SERVICE · CHOOSE CAREFULLY</small></button></div></section>`;
}
export function bossIntroMarkup(r: RunState) {
  const enemy = ENEMIES[r.enemy!.id], stage = STAGES[r.stage], art = enemy.art;
  const x = art.columns === 1 ? 0 : art.index % art.columns / (art.columns - 1) * 100;
  const y = art.rows === 1 ? 0 : Math.floor(art.index / art.columns) / (art.rows - 1) * 100;
  return `<section class="guardian-entrance guardian-${enemy.id}" aria-labelledby="guardian-name" style="--guardian-color:#${enemy.color.toString(16).padStart(6,"0")}">
    <div class="guardian-portrait" aria-hidden="true"><i></i><span style="background-image:url('${asset(`art/${art.file}.png`)}');background-size:${art.columns * 100}% ${art.rows * 100}%;background-position:${x}% ${y}%"></span></div>
    <div class="guardian-introduction"><div class="guardian-stages">${STAGES.map((s,i)=>`<span class="${i === r.stage ? "current" : i < r.stage ? "cleared" : ""}">${i < r.stage ? icon("check",14) : s.numeral}</span>`).join('<i></i>')}</div>
    <span class="eyebrow">STAGE ${stage.numeral} · ${stage.name.toUpperCase()}</span><p class="guardian-arrival">${enemy.boss!.entrance}</p>
    <h1 id="guardian-name">${enemy.name.replace(/^THE /,"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</h1><span class="guardian-subtitle">${enemy.title}</span>
    <div class="guardian-challenge"><span>${icon("heart",18)} ${r.enemy!.maxHp} INTEGRITY</span><span>${icon("elite",18)} STAGE GUARDIAN</span></div>
    <p class="guardian-warning">${enemy.boss!.warning}</p><button class="gold-button" data-action="close" autofocus>Face the guardian ${icon("arrow",20)}</button><small class="guardian-skip">ENTER TO BEGIN · ESC TO SKIP</small></div>
  </section>`;
}
export function outcomeMarkup(e: Expedition) {
  const r = e.run,
    won = r.phase === "won", story = OUTCOMES[won ? "won" : "lost"];
  return `<section class="outcome-screen full-screen ${won ? "victory" : ""}"><div class="outcome-symbol">${icon(won ? "crown" : "link", 54)}</div><span class="eyebrow">${story.eyebrow}</span><h1>${story.title}</h1><p>${story.description}${won ? ` ${ARCHETYPE_STORIES[e.archetype].epilogue}` : ""}</p><div class="outcome-stats"><span><strong>${r.score.toLocaleString()}</strong>SCORE</span><span><strong>${r.stage * 7 + r.floor} / 21</strong>SECTORS</span><span><strong>${r.deck.length}</strong>CARDS</span></div><button class="gold-button" data-action="new">Another expedition ${icon("arrow")}</button><button class="text-button" data-action="title">Return to the relay</button></section>`;
}
export function settingsMarkup(s: AudioSettings, inRun: boolean, preferences: Preferences) {
  return `<div class="settings-content"><span class="eyebrow">TAKE A BREATH</span><h2>At your frequency.</h2><label class="setting-slider"><span>Music <output>${Math.round(s.music * 100)}%</output></span><input type="range" min="0" max="100" value="${s.music * 100}" data-setting="music" aria-label="Music volume"/></label><label class="setting-slider"><span>Sound effects <output>${Math.round(s.effects * 100)}%</output></span><input type="range" min="0" max="100" value="${s.effects * 100}" data-setting="effects" aria-label="Sound effects volume"/></label><label class="setting-toggle"><span>Motion & screen shake</span><input type="checkbox" data-setting="motion" ${s.motion ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Contextual field notes</span><input type="checkbox" data-preference="tips" ${preferences.tips ? "checked" : ""}/><i></i></label><label class="setting-toggle"><span>Quick transmissions</span><input type="checkbox" data-preference="fast" ${preferences.fast ? "checked" : ""}/><i></i></label><div class="settings-actions"><button class="gold-button" data-action="close">${inRun ? "Return to expedition" : "Return"} ${icon("arrow")}</button>${inRun ? '<button class="text-button" data-action="save-exit">Save & return to title</button>' : ""}<button class="text-button" data-action="credits">Art & soundtrack credits</button></div></div>`;
}
