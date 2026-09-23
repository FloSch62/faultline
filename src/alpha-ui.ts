import "./journals.css";
import { CARD_INSIGHTS } from "./card-insights.ts";
import { CARDS, RELICS, RULES, baseCard, canUpgrade, isUpgraded, upgraded, BASE_CARD_IDS } from "./core/cards.ts";
import { ENEMIES } from "./core/enemies.ts";
import { ARCHETYPES } from "./core/expedition.ts";
import { enemyStory } from "./story.ts";
import { combatPreview, consoleState, FIELD_RULES, zoneForNode } from "./core/run.ts";
import { frayedLinks } from "./core/terrain.ts";
import { linkKey } from "./core/graph.ts";
import type { CardId, RelicId, RunState } from "./core/types.ts";
import { cardMarkup, esc, icon } from "./ui.ts";
import { INTENT_ICONS, INTENT_NAMES } from "./battle-ui.ts";
import { relicEmblem } from "./screens.ts";

/* The field journal: every dialog body a player reads during an expedition.
   Titles name the thing (.panel-head), numbers are Grenze, reading text Alegreya. */

const head = (title: string, sub = "") => `<header class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</header>`;
const plural = (n: number, word: string) => `<b>${n}</b> ${word}${n === 1 ? "" : "s"}`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
const upper = (id: string) => esc(id.toUpperCase());
const band = (zone: string) => esc(zone[0].toUpperCase() + zone.slice(1));
/** "PACKET LEECH" and "CROWNFALL" read as names in running text. */
const named = (text: string) => esc(text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()));

/** Glyphs only the journal needs, drawn like ui.icon; device roles follow the handbook diagrams. */
const GLYPHS: Record<string, [string, string]> = {
  search: ["0 0 24 24", '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'],
  client: ["-15 -15 30 30", '<rect x="-12" y="-11" width="24" height="16" rx="2"/><path d="M-5 11h10M0 5v6M-7-5l3 2.5L-7 0m5 0h6"/>'],
  router: ["-15 -15 30 30", '<circle r="13"/><path d="M-6 0h12M0-6v12M-6 0l3-3m-3 3 3 3M6 0 3-3m3 3-3 3"/>'],
  switch: ["-15 -15 30 30", '<rect x="-11" y="-11" width="22" height="22" rx="3"/><path d="M-6-3h12M-6 3h12"/>'],
  firewall: ["-15 -15 30 30", '<path d="M0-14 11-9v6c0 8-11 15-11 15S-11 5-11-3v-6Z"/><path d="M-5 0l4 4 6-7"/>'],
  honeypot: ["-15 -15 30 30", '<path d="M-8-9h16l-2 5c5 3 6 9 1 14h-14c-5-5-4-11 1-14Z"/><path d="M-4 1h8"/>'],
  cache: ["-15 -15 30 30", '<rect x="-11" y="-13" width="22" height="26" rx="2"/><path d="M-7-6h14M-7 0h14M-7 6h14"/>'],
  power: ["-15 -15 30 30", '<circle r="13"/><path d="m2-8-7 9h5l-2 7 7-9h-5Z"/>'],
  balancer: ["-15 -15 30 30", '<path d="M0-13 13 0 0 13-13 0Z"/><path d="M-6 0h4m0 0 5-5m-5 5 5 5"/>'],
  cable: ["0 0 24 24", '<circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><path d="M6 12c3-5 9 5 12 0"/>'],
};
function glyph(name: string, size = 18) {
  const [box, path] = GLYPHS[name] ?? GLYPHS.router;
  const stroke = box.startsWith("-15") ? 1.9 : 1.5;
  return `<svg width="${size}" height="${size}" viewBox="${box}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ------------------------------------------------------------------ prepare */

const costGem = (id: CardId) => `<span class="prepare-cost">${CARDS[id].unplayable ? icon("close", 14) : CARDS[id].cost}</span>`;
export function prepareMarkup(run: RunState) {
  const ready = run.preparedCard, full = run.hand.length >= RULES.handLimit;
  const body = ready
    ? `<div class="prepared-summary inlay"><span class="lit-stone"></span><span class="journal-label">Held for next turn</span><div class="prepare-row is-held">${costGem(ready)}<span><strong>${esc(CARDS[ready].name)}</strong><small>${esc(CARDS[ready].rules)}</small></span></div><button class="plate-button" data-action="release-prepared" ${full ? "disabled" : ""}>Return to hand</button>${full ? '<p class="journal-note">Your hand is full. Play a card first.</p>' : ""}</div>`
    : `<div class="prepare-options">${run.hand.map((id, index) => {
      const junk = CARDS[id].junk || CARDS[id].curse;
      return `<button class="prepare-row inlay${junk ? " is-junk" : ""}" data-prepare-card="${index}" ${junk ? "disabled" : ""}>${costGem(id)}<span><strong>${esc(CARDS[id].name)}</strong><small>${junk ? "Junk cannot be prepared." : esc(CARDS[id].rules)}</small></span></button>`;
    }).join("") || '<p class="empty-pile">Your hand is empty.</p>'}</div>`;
  return `${head("Prepare a Card", "Hold one card for next turn at no energy cost. It replaces one normal draw.")}${body}<p class="journal-note">Keep a burst for an ultimate, a protocol for a known cut, a shield for a heavy strike.</p><div class="journal-actions"><button class="plate-button" data-action="close">Back</button></div>`;
}

/* ------------------------------------------------------------------ forecast */

const term = (label: string, amount: number | string, extra = "") =>
  `<div class="calculation-term${typeof amount === "number" && amount < 0 ? " is-negative" : ""}${extra}"><span>${label}</span><i></i><b>${typeof amount === "number" ? signed(amount) : amount}</b></div>`;
const terms = (items: { label: string; amount: number }[]) => items.map(t => term(esc(t.label), t.amount)).join("");
const ledgerHead = (glyphMarkup: string, title: string) => `<h3><span class="ledger-sigil">${glyphMarkup}</span>${title}</h3>`;
function routeTrace(path: string[], label: string, primary: boolean) {
  return `<p class="route-trace ${primary ? "is-primary" : "is-secondary"}"><b>${label}</b>${path.map(id => `<span class="route-node">${upper(id).replaceAll("::", " ↔ ")}</span>`).join('<i aria-hidden="true"></i>')}</p>`;
}

export function combatDetailsMarkup(run: RunState) {
  const p = combatPreview(run), c = consoleState(run);
  const engineName = run.archetype === "ghost" ? "Buffer" : run.archetype === "warden" ? "Backpressure" : "Bandwidth";
  const perChannel = run.relics.includes("parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel;
  const routes = p.channelPaths.map((path, i) => routeTrace(path, i ? `Channel ${i + 1}` : "Primary", !i)).join("") || '<p class="route-trace is-offline"><b>Signal offline</b></p>';
  const engine = run.archetype === "ghost"
    ? `${term("Buffer stored", run.buffer)}${p.buffering ? term(`Buffering this turn (×${RULES.bufferMultiplier})`, p.bufferGain) : p.bufferRelease ? term("Released this turn", p.bufferRelease) : ""}${p.bufferAtRisk && (run.buffer || p.buffering) ? `<p class="danger-note">${icon("warning", 15)} After this enemy action you would have no live route: the buffer would be lost at the start of your turn.</p>` : ""}`
    : run.archetype === "warden"
      ? `${term("Backpressure in this transmission", run.backpressure)}${term(`Stored for next turn (${Math.round(RULES.backpressureRatio * 100)}% of prevented)`, p.backpressureGain)}`
      : term("Channels (routes sharing no device)", String(p.channels));
  const outcome = p.lethal ? "Your transmission defeats the hostile, so its intent never resolves."
    : p.enemyDefeatedByTraps ? "Your traps defeat the hostile as it moves; the rest of its action is cancelled."
    : p.faultTarget ? `Next fault: ${esc(p.faultTarget.toUpperCase().replaceAll("::", " ↔ "))}. It lasts for your next player turn.`
    : "Shields reduce damage to a minimum of zero.";
  const threat = [
    p.zoneThreat ? `<p>Next field: <strong>${FIELD_RULES[p.zoneThreat.kind].name} · ${band(p.zoneThreat.zone)}</strong> for ${p.zoneThreat.turns} turns, starting next turn${p.faultTarget ? " alongside the advertised fault" : ""}. Cleanse it, protect the band, or relocate exposed devices before it deals damage.</p>`
      : p.hazardZone ? `<p>Threatened band: <strong>${band(p.hazardZone)}</strong>. Deploy elsewhere or spend ${RULES.relocateCost} energy to relocate an installed device.</p>` : "",
    p.malwareTarget ? `<p>Malware will be planted in <strong>${band(zoneForNode(p.malwareTarget))}</strong>.</p>` : "",
    p.junk ? `<p><strong>${p.junk.count} ${esc(CARDS[p.junk.card].name)}</strong> will be shuffled into your draw pile.</p>` : "",
    p.enemyHealing ? `<p>The lost transmission lets the enemy restore <strong>${p.enemyHealing} integrity</strong>.</p>` : "",
  ].join("");
  return `${head("Forecast", `Turn ${run.turn}${run.enemy ? ` · ${named(run.enemy.name)}` : ""}`)}
    <div class="calculation-grid"><section class="ledger">${ledgerHead(icon("bolt", 17), "Signal Damage")}${terms(p.damageTerms)}${!p.signalPath.length ? '<p class="ledger-note">No live ALPHA → router → OMEGA route. Route bonuses cannot activate.</p>' : ""}<div class="calculation-total"><span>${p.buffering ? "Stored in the buffer" : "Damage to hostile"}</span><strong>${p.buffering ? `+${p.bufferGain}` : p.packetDamage}</strong></div>${p.enemyDamage ? term("Traps during its action", p.enemyDamage, " trap-term") : ""}${routes}<p class="ledger-note">Your <b>primary route</b> is the strongest live route; only its devices add route damage. Every other <b>channel</b> (a route sharing no device with the others) adds +${perChannel} bandwidth and keeps you transmitting through a cut. Devices on any live route are <b>online</b>: firewalls block, balancers and caches work.</p></section>
    <section class="ledger">${ledgerHead(icon("shield", 17), "Defenses")}${term("Incoming before shields", String(p.incomingRaw))}${p.incomingTerms.length ? `<div class="incoming-sources">${terms(p.incomingTerms)}</div>` : ""}${terms(p.shieldTerms)}${term("Total prevented", String(Math.min(p.incomingRaw, p.shield)))}<div class="calculation-total ${p.incoming ? "danger" : "safe"}"><span>Integrity lost</span><strong>${p.incoming}</strong></div>${p.protocolTriggers.map(t => `<p class="protocol-note">${icon("trigger", 15)} <span><b>${esc(t.name)}</b> fires: ${esc(t.effect)}</span></p>`).join("")}<p class="ledger-note">${outcome}</p></section></div>
    <div class="calculation-grid v3-grid"><section class="ledger">${ledgerHead(icon("console", 17), esc(c.name === engineName ? c.name : `${c.name} · ${engineName}`))}${engine}<p class="ledger-note">${esc(c.rules)}</p></section>
    <section class="ledger">${ledgerHead(icon("next", 17), "Next Turn")}${term("Energy", String(p.nextTurn.energy))}${term("Cards drawn", String(p.nextTurn.draw))}${run.malware.length ? `<p class="danger-note">${icon("malware", 15)} <span>${run.malware.length} malware on the table: −${RULES.malwarePenalty} damage each. Scrub for ${RULES.scrubCost} energy.</span></p>` : ""}${p.clusters.length ? `<p class="protocol-note">${icon("cluster", 15)} <span>Clusters: ${p.clusters.map(band).join(", ")} (+${RULES.clusterDamage} each).</span></p>` : ""}<p class="ledger-note">Evaluated after the forecast enemy action: a cut or jam can take a PoE Injector or Cache Server offline before your turn starts.</p></section></div>
    <div class="trait-explanation inlay"><h4>${icon("eye", 16)} Hostile Trait</h4><p>${esc(p.traitDescription)}</p>${threat}</div>
    <ol class="turn-sequence" aria-label="Order of resolution"><li><b>1</b>Your signal strikes</li><li><b>2</b>Traps &amp; protocols fire</li><li><b>3</b>Surviving enemy acts</li><li><b>4</b>Recharge &amp; draw</li></ol>
    <div class="journal-actions"><button class="plate-button" data-action="close">Back</button></div>`;
}

/* ------------------------------------------------------------------ card inspect */

const TARGET_COPY: Record<string, string> = {
  ground: "Free table socket", link: "Two devices", node: "A valid device", instant: "Immediate",
  zone: "North, Center or South", protocol: "Armed until it fires", junk: "Clutter · delete or endure",
};
const rarityName = (id: CardId) => CARDS[id].rarity === "special" ? (CARDS[id].curse ? "Curse" : "Junk") : CARDS[id].rarity[0].toUpperCase() + CARDS[id].rarity.slice(1);
const fact = (label: string, value: string | number) => `<div><dt>${label}</dt><i></i><dd>${value}</dd></div>`;
/** `from` is the library the player came from; Back returns there. */
export function inspectMarkup(id: CardId, run: RunState, from: LibraryMode | null = null) {
  const c = CARDS[id], base = baseCard(id);
  const other = canUpgrade(id) ? upgraded(id) : isUpgraded(id) ? base : null;
  const owned = run.deck.filter(x => x === id).length;
  const kind = [rarityName(id), named(c.subtitle.split(" / ").at(-1) ?? ""), c.archetype ? `${esc(ARCHETYPES[c.archetype].name)} only` : ""].filter(Boolean).join(" · ");
  const after = c.protocol ? "Armed · discard when it fires" : c.junk ? "Removed after the encounter" : c.curse ? "Stays in your deck" : c.exhaust ? "Exhaust until next encounter" : "Discard, then reshuffle";
  return `<div class="card-inspect"><div class="inspect-card">${cardMarkup(id, 0, "collection")}</div><section class="inspect-body"><header class="inspect-head"><h2>${esc(c.name)}</h2><p class="inspect-kind">${kind}</p></header><p class="inspect-rules">${esc(c.rules)}</p><dl class="inspect-facts">${fact("Energy", c.unplayable ? "Unplayable" : c.cost)}${fact("Target", TARGET_COPY[c.target] ?? esc(c.target))}${fact("After playing", after)}${from === "collection" ? "" : fact("In your deck", owned)}</dl>${other ? `<div class="upgrade-compare inlay ${isUpgraded(id) ? "is-base" : ""}"><span class="journal-label">${isUpgraded(id) ? "Before the upgrade" : "Upgraded"}</span><div class="prepare-row">${costGem(other)}<span><strong>${esc(CARDS[other].name)}</strong><small>${esc(CARDS[other].rules)}</small></span></div></div>` : ""}<div class="synergy-note"><span class="journal-label">Synergy</span><p>${esc(CARD_INSIGHTS[base] ?? "Hardware stays for the encounter. Temporary shield and burst expire after transmission.")}</p></div><div class="journal-actions"><button class="plate-button" data-action="${from ? "inspect-back" : "close"}">Back</button></div></section></div>`;
}

/* ------------------------------------------------------------------ card library */

export type LibraryMode = "deck" | "loadout" | "draw-pile" | "discard-pile" | "exhaust-pile" | "collection";
export const LIBRARY_MODES: readonly string[] = ["deck", "loadout", "draw-pile", "discard-pile", "exhaust-pile", "collection"];
const FILTERS: [string, string][] = [["all", "All"], ["basic", "Basic"], ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["legendary", "Legendary"], ["special", "Junk & Curses"], ["upgraded", "Upgraded"]];
const LIBRARY_TITLES: Record<LibraryMode, string> = {
  deck: "Deck", loadout: "Starting Deck", "draw-pile": "Draw Pile", "discard-pile": "Discard Pile", "exhaust-pile": "Exhausted", collection: "Card Archive",
};
export function libraryMarkup(run: RunState, mode: LibraryMode, rarity = "all", query = "") {
  const archive: CardId[] = rarity === "upgraded" ? BASE_CARD_IDS.filter(id => canUpgrade(id)).map(id => upgraded(id)) : [...BASE_CARD_IDS];
  const pile = mode === "collection" ? archive : mode === "draw-pile" ? run.drawPile : mode === "discard-pile" ? run.discardPile : mode === "exhaust-pile" ? run.exhaustPile : run.deck;
  const counts = new Map<CardId, number>();
  pile.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  const matches = (id: CardId) => rarity === "all" || (rarity === "upgraded" ? isUpgraded(id) : CARDS[id].rarity === rarity);
  const entries = [...counts].filter(([id]) => matches(id) && `${CARDS[id].name} ${CARDS[id].rules} ${CARDS[id].subtitle}`.toLowerCase().includes(query.toLowerCase())).sort(([a], [b]) => CARDS[a].name.localeCompare(CARDS[b].name));
  const sub = {
    collection: `${plural(BASE_CARD_IDS.length, "card")}, each with an upgraded (+) form`,
    deck: plural(pile.length, "card"),
    loadout: `${esc(ARCHETYPES[run.archetype].name)} · ${plural(pile.length, "card")}`,
    "draw-pile": `${plural(pile.length, "card")} · draw order hidden`,
    "discard-pile": `${plural(pile.length, "card")} · reshuffled when the draw pile runs dry`,
    "exhaust-pile": `${plural(pile.length, "card")} · back in your deck next encounter`,
  }[mode];
  const toolbar = ["collection", "deck", "loadout"].includes(mode)
    ? `<div class="archive-toolbar"><div class="game-tabs archive-tabs" role="group" aria-label="Filter cards">${FILTERS.map(([r, name]) => `<button data-rarity="${r}" class="${rarity === r ? "active" : ""}" aria-pressed="${rarity === r}">${name}</button>`).join("")}</div><div class="archive-find">${glyph("search", 16)}<input class="archive-search game-field" type="search" aria-label="Search cards" placeholder="Search" spellcheck="false" autocomplete="off" value="${esc(query)}"/></div></div>`
    : "";
  const empty = pile.length ? "No cards match." : "Empty.";
  return `${head(LIBRARY_TITLES[mode], sub)}${toolbar}
    <div class="collection-grid">${entries.map(([id, n], i) => `<div class="collection-entry${n > 1 ? " is-stacked" : ""}">${cardMarkup(id, i, "collection")}${n > 1 && mode !== "collection" ? `<span class="pile-count" aria-label="${n} copies">×${n}</span>` : ""}</div>`).join("") || `<p class="empty-pile">${empty}</p>`}</div>`;
}

/* ------------------------------------------------------------------ relics and the combat log */

function relicRow(id: RelicId) {
  const relic = RELICS[id], tier = relic.tier === "boss" ? "Boss" : relic.tier === "starter" ? "Starter" : "";
  return `<p class="relic-row tier-${relic.tier}">${relicEmblem(id, 30)}<span class="relic-copy"><b>${esc(relic.name)}${tier ? `<small>${tier}</small>` : ""}</b><span>${esc(relic.rules)}</span></span></p>`;
}
export function relicJournalMarkup(run: RunState) {
  const boss = run.relics.some(id => RELICS[id].tier === "boss");
  return `${head("Relics", `${plural(run.relics.length, "relic")} carried${boss ? " · boss relics bend a rule at a price" : ""}`)}<div class="relic-ledger">${run.relics.map(relicRow).join("") || '<p class="empty-pile">No relics yet.</p>'}</div>`;
}

const TRANSMISSION = /^(Signal dealt|The live signal was absorbed|No live router route|Transmission buffered)/;
const START = / enters the grid\./;
/** The log is newest first. Each resolved turn logs exactly one transmission line,
 *  followed by the hostile's answer; counting transmissions places every entry in its turn. */
function turnsOf(run: RunState) {
  const enemy = run.enemy?.name ?? "";
  const start = run.log.findIndex(line => START.test(line));
  const current = (start < 0 ? run.log : run.log.slice(0, start + 1)).slice().reverse();
  const answer = (line: string) => (!!enemy && line.startsWith(enemy)) || /^(Traps dealt|Protocols fired)/.test(line);
  let turn = Math.max(1, run.turn - current.filter(line => TRANSMISSION.test(line)).length), resolved = false;
  const turns: { label: string; lines: string[] }[] = [];
  for (const line of current) {
    if (resolved && !answer(line)) { turn++; resolved = false; }
    if (turns.at(-1)?.label !== `Turn ${turn}`) turns.push({ label: `Turn ${turn}`, lines: [] });
    turns.at(-1)!.lines.unshift(line);
    if (TRANSMISSION.test(line)) resolved = true;
  }
  turns.reverse();
  if (start >= 0 && start < run.log.length - 1) turns.push({ label: "Earlier", lines: run.log.slice(start + 1) });
  return turns;
}
export function historyMarkup(run: RunState) {
  const enemy = run.enemy?.name ?? "";
  const entry = (line: string) => {
    const kind = TRANSMISSION.test(line) ? "is-signal" : START.test(line) ? "is-start" : enemy && line.startsWith(enemy) ? "is-hostile" : "";
    const mark = kind === "is-signal" ? icon("bolt", 14) : kind === "is-hostile" ? icon("sword", 14) : kind === "is-start" ? icon("eye", 14) : "";
    const text = enemy && line.startsWith(enemy) ? named(enemy) + esc(line.slice(enemy.length)) : esc(line);
    return `<li class="log-entry ${kind}"><span class="log-mark">${mark}</span><span>${text}</span></li>`;
  };
  const rows = turnsOf(run).map(t => `<li class="log-turn"><span>${t.label}</span></li>${t.lines.map(entry).join("")}`).join("");
  return `${head("Combat Log", enemy ? `${named(enemy)} · Turn ${run.turn}` : "")}<ol class="history-list">${rows}</ol><section class="journal-section"><h3 class="journal-head">Relics</h3><div class="relic-ledger is-compact">${run.relics.map(relicRow).join("")}</div></section>`;
}

/* ------------------------------------------------------------------ enemy dossier */

export function enemyDossierMarkup(run: RunState) {
  const story = run.enemy ? enemyStory(run.enemy.id) : null;
  if (!story || !run.enemy) return `${head("Field Journal", "No hostile on the grid.")}<div class="journal-actions"><button class="plate-button" data-action="help">${icon("book", 16)} Handbook</button></div>`;
  const definition = ENEMIES[run.enemy.id], forecast = combatPreview(run), intent = forecast.intent, pattern = definition.pattern;
  const now = run.enemy.turn % pattern.length;
  const steps = pattern.map(({ kind, field, ultimate, junk, label }, i) => `<li class="intent-step inlay${i === now ? " is-lit" : ""}${ultimate ? " is-ultimate" : ""}"${i === now ? ' aria-current="step"' : ""}>${i === now ? '<span class="lit-stone"></span>' : ""}<b>${i + 1}</b><span class="intent-glyph">${icon(INTENT_ICONS[kind], 20)}</span><span class="intent-name">${ultimate ? named(label) : esc(INTENT_NAMES[kind])}</span>${ultimate ? "<small>Ultimate</small>" : ""}${field ? `<small>+ ${FIELD_RULES[field].name}</small>` : ""}${junk ? `<small>+ ${junk.count} ${esc(CARDS[junk.card].name)}</small>` : ""}</li>`).join("");
  const telegraph = intent ? story.telegraphs[intent.kind] ?? "" : "";
  return `${head(esc(story.name), `<span class="dossier-title">${esc(story.title)}</span>`)}<p class="dossier-motive">${esc(story.motive)}</p>
    <section class="journal-section"><h3 class="journal-head">Pattern</h3><ol class="enemy-pattern">${steps}</ol>${telegraph ? `<p class="enemy-telegraph">${esc(telegraph)}</p>` : ""}</section>
    <section class="journal-section"><h3 class="journal-head">Countermeasure</h3><p class="dossier-counter">${esc(story.counterplay)}</p>${story.counterplay !== forecast.traitDescription ? `<div class="trait-explanation inlay"><h4>${icon("eye", 16)} Hostile Trait</h4><p>${esc(forecast.traitDescription)}</p></div>` : ""}${definition.boss ? `<div class="trait-explanation inlay is-guardian"><h4>${icon("boss", 16)} Guardian</h4><p>${esc(definition.boss.warning)} Breaking an ultimate cancels its attack and new field, then exposes the guardian for one turn: ignore armor and deal +${RULES.exposedBonus} damage. Existing fields still resolve.</p></div>` : ""}</section>
    <p class="journal-note">The pattern repeats. Pressure adds 1 damage to strikes and breaches every three completed enemy actions. Stage II adds 1 attack damage; stage III adds 2. New hostile fields begin on the following player turn.</p><div class="journal-actions"><button class="text-button" data-action="help">${icon("book", 16)} Handbook</button></div>`;
}

/* ------------------------------------------------------------------ devices */

const ROLE_COPY: Record<string, [string, string]> = {
  client: ["Terminal", "Every route starts or ends here"],
  router: ["Router", "Every route needs one"],
  switch: ["Switch", `+${RULES.switchDamage} on the primary route`],
  firewall: ["Firewall", `Online: blocks ${RULES.firewallBreachBlock} breach / ${RULES.firewallStrikeBlock} strike`],
  honeypot: ["Honeypot", `Draws jams and cuts; the attacker takes ${RULES.honeypotDamage}`],
  cache: ["Cache Server", "Online: draw +1 next turn"],
  power: ["PoE Injector", "Online: +1 energy next turn"],
  balancer: ["Load Balancer", `Online: +${RULES.balancerPerChannel} per channel`],
};
export function devicesMarkup(run: RunState) {
  const p = combatPreview(run);
  const frayed = frayedLinks(run.topology, run.terrain);
  const wraith = run.enemy?.id === "wraith";
  const tiles = run.topology.nodes.map(n => {
    const online = n.fixed || p.online.includes(n.id);
    const [role, ability] = ROLE_COPY[n.role] ?? [n.role, ""];
    const mods = [n.shielded ? "Jam protected" : "", n.upgraded ? `Overclocked +${RULES.overclockDamage}` : "", n.configured ? `Startup Config +${RULES.configuredDamage}` : "", n.amplified ? `Compressed +${RULES.compressionDamage}` : "", n.stateful ? "Stateful · blocks double" : "", n.salvage ? "Salvaged" : ""].filter(Boolean);
    const state = n.fixed ? "Fixed" : online ? "Online" : "Offline";
    return `<button class="device-tile inlay ${online ? "is-online" : "is-offline"}${n.fixed ? " is-fixed" : ""}" data-manage-node="${n.id}"><span class="device-glyph">${glyph(n.role, 24)}</span><span class="device-copy"><strong>${upper(n.id)}</strong><span class="device-role">${esc(role)} · ${band(zoneForNode(n))}</span><span class="device-ability">${esc(ability)}</span>${mods.length ? `<span class="device-mods">${mods.map(esc).join(" · ")}</span>` : ""}${!online ? '<span class="device-hint">Connect it to a live route</span>' : ""}</span><span class="device-state"><i></i>${state}</span></button>`;
  }).join("");
  const cables = run.topology.links.map(l => {
    const a = run.topology.nodes.find(n => n.id === l.a)!, b = run.topology.nodes.find(n => n.id === l.b)!;
    const length = Math.hypot(a.x - b.x, a.z - b.z), worn = frayed.has(linkKey(l.a, l.b));
    const exposed = wraith && length > RULES.cableExposureLength && !l.armored;
    const tags = [l.armored ? '<span class="cable-tag is-good">Cut-proof</span>' : "", l.boosted ? `<span class="cable-tag is-good">+${RULES.amplifiedCableDamage} signal</span>` : "", worn ? `<span class="cable-tag is-bad">Frayed −${RULES.frayedCableDamage}</span>` : "", wraith ? `<span class="cable-tag${exposed ? " is-bad" : ""}">Span ${length.toFixed(1)}${exposed ? " · exposed" : ""}</span>` : ""].join("");
    return `<li><span class="cable-ends">${glyph("cable", 16)}${upper(l.a)}<i>↔</i>${upper(l.b)}</span>${tags ? `<span class="cable-tags">${tags}</span>` : ""}</li>`;
  }).join("");
  const malware = run.malware.length ? `<section class="journal-section malware-inventory"><h3 class="journal-head">Malware</h3><ul class="cable-list">${run.malware.map(m => `<li><span class="cable-ends">${icon("malware", 16)}${upper(m.id)} · ${band(zoneForNode(m))}<small>−${RULES.malwarePenalty} damage</small></span><button class="plate-button" data-scrub="${m.id}" ${run.energy < RULES.scrubCost ? "disabled" : ""}>Scrub · ${RULES.scrubCost} energy</button></li>`).join("")}</ul></section>` : "";
  const terrain = run.terrain ? `<p class="terrain-note">${icon("terrain", 16)}<span><b>${esc(run.terrain.name)}</b> ${esc(run.terrain.description)}${run.terrain.debris.length ? ` ${run.terrain.debris.length} wreck${run.terrain.debris.length === 1 ? "" : "s"} block${run.terrain.debris.length === 1 ? "s" : ""} placement. Unarmored cables that cross a scorched ring fray: −${RULES.frayedCableDamage} damage each on your primary route.` : ""}</span></p>` : "";
  return `${head("Devices", `Select a device to relocate it for ${RULES.relocateCost} energy.`)}<div class="device-inventory">${tiles}</div>${malware}<section class="journal-section cable-inventory"><h3 class="journal-head">Connections</h3>${cables ? `<ul class="cable-list">${cables}</ul>` : '<p class="empty-pile">No cables yet.</p>'}</section>${terrain}<p class="journal-note">Bands with ${RULES.clusterThreshold}+ online devices form a cluster (+${RULES.clusterDamage}). Routers in opposite outer bands on separate channels grant ${RULES.separatedCircuitShield} shield.</p>`;
}
