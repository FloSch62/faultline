import { CARD_INSIGHTS } from "./card-insights.ts";
import { CARDS, RELICS, RULES, baseCard, canUpgrade, isUpgraded, upgraded, BASE_CARD_IDS } from "./core/cards.ts";
import { ENEMIES } from "./core/enemies.ts";
import { enemyStory } from "./story.ts";
import { combatPreview, consoleState, FIELD_RULES, zoneForNode } from "./core/run.ts";
import type { CardId, RunState } from "./core/types.ts";
import { cardMarkup, esc, icon } from "./ui.ts";
import { INTENT_NAMES } from "./battle-ui.ts";

const terms = (items: { label: string; amount: number }[]) => items.map(t => `<div class="calculation-term"><span>${esc(t.label)}</span><b>${t.amount >= 0 ? "+" : ""}${t.amount}</b></div>`).join("");
const pretty = (id: string) => esc(id.toUpperCase().replaceAll("::", " ↔ "));

export function prepareMarkup(run: RunState) {
  const ready = run.preparedCard;
  return `<span class="eyebrow">PLAN YOUR NEXT TRANSMISSION</span><h2>Keep an answer in reserve.</h2><p class="modal-intro">Set aside one card for next turn, at no energy cost. It replaces one normal draw. You can return it to your hand before transmitting.</p>${ready ? `<div class="prepared-summary"><span>PREPARED FOR NEXT TURN</span><h3>${esc(CARDS[ready].name)}</h3><p>${esc(CARDS[ready].rules)}</p><button class="gold-button" data-action="release-prepared" ${run.hand.length >= RULES.handLimit ? "disabled" : ""}>Return to hand</button>${run.hand.length >= RULES.handLimit ? "<p>Your hand is full. Play a card first.</p>" : ""}</div>` : `<div class="prepare-options">${run.hand.map((id, index) => {
    const junk = CARDS[id].junk || CARDS[id].curse;
    return `<button data-prepare-card="${index}" ${junk ? "disabled" : ""}><span class="prepare-cost">${CARDS[id].unplayable ? "✕" : CARDS[id].cost}</span><span><strong>${esc(CARDS[id].name)}</strong><small>${junk ? "Junk cannot be prepared." : esc(CARDS[id].rules)}</small></span>${icon("arrow", 16)}</button>`;
  }).join("") || "<p>Your hand is empty.</p>"}</div>`}<p class="modal-intro">Save a burst for an ultimate, a protocol for a known cut, a shield for a heavy strike, or a repair for a coming fault.</p><button class="text-button" data-action="close">Back to the table</button>`;
}

export function combatDetailsMarkup(run: RunState) {
  const p = combatPreview(run), c = consoleState(run);
  const engineName = run.archetype === "ghost" ? "Buffer" : run.archetype === "warden" ? "Backpressure" : "Bandwidth";
  const channelRows = p.channelPaths.map((path, i) => `<p class="route-trace ${i ? "is-secondary" : "is-primary"}"><b>${i ? `CHANNEL ${i + 1}` : "PRIMARY"}</b> ${path.map(id => pretty(id)).join(" <i>→</i> ")}</p>`).join("");
  const engine = run.archetype === "ghost"
    ? `<div class="calculation-term"><span>Buffer stored</span><b>${run.buffer}</b></div>${p.buffering ? `<div class="calculation-term"><span>Buffering this turn (×${RULES.bufferMultiplier})</span><b>+${p.bufferGain}</b></div>` : p.bufferRelease ? `<div class="calculation-term"><span>Released this turn</span><b>+${p.bufferRelease}</b></div>` : ""}${p.bufferAtRisk && (run.buffer || p.buffering) ? `<p class="danger-note">${icon("warning", 13)} After this enemy action you would have no live route: the buffer would be lost at the start of your turn.</p>` : ""}`
    : run.archetype === "warden"
      ? `<div class="calculation-term"><span>Backpressure in this transmission</span><b>+${run.backpressure}</b></div><div class="calculation-term"><span>Stored for next turn (${Math.round(RULES.backpressureRatio * 100)}% of prevented)</span><b>+${p.backpressureGain}</b></div>`
      : `<div class="calculation-term"><span>Channels (routes sharing no device)</span><b>${p.channels}</b></div>`;
  return `<span class="eyebrow">TRANSMISSION FORECAST · TURN ${run.turn}</span><h2>Every point has a source.</h2>
    <div class="calculation-grid"><section><h3>${icon("bolt")} Signal damage</h3>${terms(p.damageTerms)}${!p.signalPath.length ? '<p>No live ALPHA → router → OMEGA route. Route bonuses cannot activate.</p>' : ""}<div class="calculation-total"><span>${p.buffering ? "Stored in the buffer" : "Damage to hostile"}</span><strong>${p.buffering ? `+${p.bufferGain}` : p.packetDamage}</strong></div>${p.enemyDamage ? `<div class="calculation-term trap-term"><span>Traps during its action (honeypots, protocols)</span><b>+${p.enemyDamage}</b></div>` : ""}${channelRows || '<p class="route-trace">SIGNAL OFFLINE</p>'}<p>Your <b>primary route</b> is the strongest live route; only its devices add route damage. Every other <b>channel</b> — a route sharing no device with the others — adds +${run.relics.includes("parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel} bandwidth and keeps you transmitting through a cut. Devices on any live route are <b>online</b>: firewalls block, balancers and caches work.</p></section>
    <section><h3>${icon("shield")} Your defenses</h3><div class="calculation-term"><span>Incoming before shields</span><b>${p.incomingRaw}</b></div><div class="incoming-sources">${terms(p.incomingTerms)}</div>${terms(p.shieldTerms)}<div class="calculation-term"><span>Total prevented</span><b>${Math.min(p.incomingRaw, p.shield)}</b></div><div class="calculation-total ${p.incoming ? "danger" : "safe"}"><span>Integrity lost</span><strong>${p.incoming}</strong></div>${p.protocolTriggers.map(t => `<p class="protocol-note">${icon("trigger", 13)} <b>${esc(t.name)}</b> fires: ${esc(t.effect)}</p>`).join("")}<p>${p.lethal ? "Your transmission defeats the hostile, so its intent never resolves." : p.enemyDefeatedByTraps ? "Your traps defeat the hostile as it moves; the rest of its action is cancelled." : p.faultTarget ? `Next fault: ${pretty(p.faultTarget)}. It lasts for your next player turn.` : "Shields reduce damage to a minimum of zero."}</p></section></div>
    <div class="calculation-grid v3-grid"><section><h3>${icon("console")} ${esc(c.name === engineName ? c.name : `${c.name} · ${engineName}`)}</h3>${engine}<p>${esc(c.rules)}</p></section>
    <section><h3>${icon("next")} Next turn</h3><div class="calculation-term"><span>Energy</span><b>${p.nextTurn.energy}</b></div><div class="calculation-term"><span>Cards drawn</span><b>${p.nextTurn.draw}</b></div><p>Evaluated after the forecast enemy action: a cut or jam can take a PoE Injector or Cache Server offline before your turn starts.</p>${run.malware.length ? `<p class="danger-note">${icon("malware", 13)} ${run.malware.length} malware on the table: −${RULES.malwarePenalty} damage each. Scrub for ${RULES.scrubCost} energy.</p>` : ""}${p.clusters.length ? `<p>${icon("cluster", 13)} Clusters: ${p.clusters.map(z => z.toUpperCase()).join(", ")} (+${RULES.clusterDamage} each).</p>` : ""}</section></div>
    <div class="trait-explanation"><b>Hostile trait</b><p>${esc(p.traitDescription)}</p>${p.zoneThreat ? `<p>Next field: <strong>${FIELD_RULES[p.zoneThreat.kind].name} · ${p.zoneThreat.zone.toUpperCase()}</strong> for ${p.zoneThreat.turns} turns, starting next turn${p.faultTarget ? " alongside the advertised fault" : ""}. Cleanse it, protect the band, or relocate exposed devices before it deals damage.</p>` : p.hazardZone ? `<p>Threatened band: <strong>${p.hazardZone.toUpperCase()}</strong>. Deploy elsewhere or spend ${RULES.relocateCost} energy to relocate an installed device.</p>` : ""}${p.malwareTarget ? `<p>Malware will be planted in <strong>${zoneForNode(p.malwareTarget).toUpperCase()}</strong>.</p>` : ""}${p.junk ? `<p><strong>${p.junk.count} ${esc(CARDS[p.junk.card].name)}</strong> will be shuffled into your draw pile.</p>` : ""}${p.enemyHealing ? `<p>The lost transmission lets the enemy restore <strong>${p.enemyHealing} integrity</strong>.</p>` : ""}</div><div class="turn-sequence"><span><b>1</b> Your signal strikes</span><span><b>2</b> Traps & protocols fire</span><span><b>3</b> Surviving enemy acts</span><span><b>4</b> Recharge & draw</span></div>
    <button class="gold-button" data-action="close">Back to the table ${icon("arrow")}</button>`;
}

const TARGET_COPY: Record<string, string> = {
  ground: "Free table socket", link: "Two devices", node: "A valid device", instant: "Immediate",
  zone: "North, Center or South", protocol: "Armed until it fires", junk: "Clutter · delete or endure",
};
export function inspectMarkup(id: CardId, run: RunState, returnToArchive = false) {
  const c = CARDS[id], base = baseCard(id);
  const other = canUpgrade(id) ? CARDS[upgraded(id)] : isUpgraded(id) ? CARDS[base] : null;
  const owned = run.deck.filter(x => x === id).length;
  return `<div class="card-inspect"><div>${cardMarkup(id, 0, "collection")}</div><section><span class="eyebrow">${c.rarity.toUpperCase()} · ${esc(c.subtitle.split(" / ").at(-1) ?? "")}${c.archetype ? ` · ${c.archetype.toUpperCase()} ONLY` : ""}</span><h2>${esc(c.name)}</h2><p class="inspect-rules">${esc(c.rules)}</p><div class="inspect-facts"><span>Energy cost <b>${c.unplayable ? "Unplayable" : c.cost}</b></span><span>Target <b>${TARGET_COPY[c.target] ?? c.target}</b></span><span>After playing <b>${c.protocol ? "Armed · discard when it fires" : c.junk ? "Removed after the encounter" : c.curse ? "Stays in your deck" : c.exhaust ? "Exhaust until next encounter" : "Discard, then reshuffle"}</b></span><span>In your deck <b>${owned}</b></span></div>${other ? `<div class="upgrade-compare ${isUpgraded(id) ? "is-base" : ""}"><span class="eyebrow">${isUpgraded(id) ? "BEFORE THE UPGRADE" : "UPGRADED (+)"}</span><p><b>${esc(other.name)}</b> · ${other.cost} energy · ${esc(other.rules)}</p></div>` : ""}<div class="synergy-note"><span class="eyebrow">BUILD CONNECTIONS</span><p>${esc(CARD_INSIGHTS[base] ?? "Hardware stays for the encounter. Temporary shield and burst expire after transmission.")}</p></div><button class="text-button" data-action="${returnToArchive ? "inspect-back" : "close"}">${returnToArchive ? "Back to cards" : "Return"} ${icon("arrow", 14)}</button></section></div>`;
}

export type LibraryMode = "deck" | "draw-pile" | "discard-pile" | "exhaust-pile" | "collection";
const FILTERS = ["all", "basic", "common", "uncommon", "rare", "legendary", "special", "upgraded"];
export function libraryMarkup(run: RunState, mode: LibraryMode, rarity = "all", query = "") {
  const archive: CardId[] = rarity === "upgraded" ? BASE_CARD_IDS.filter(id => canUpgrade(id)).map(id => upgraded(id)) : [...BASE_CARD_IDS];
  const pile = mode === "collection" ? archive : mode === "draw-pile" ? run.drawPile : mode === "discard-pile" ? run.discardPile : mode === "exhaust-pile" ? run.exhaustPile : run.deck;
  const counts = new Map<CardId, number>();
  pile.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  const matches = (id: CardId) => rarity === "all" || (rarity === "upgraded" ? isUpgraded(id) : CARDS[id].rarity === rarity);
  const entries = [...counts].filter(([id]) => matches(id) && `${CARDS[id].name} ${CARDS[id].rules} ${CARDS[id].subtitle}`.toLowerCase().includes(query.toLowerCase())).sort(([a], [b]) => CARDS[a].name.localeCompare(CARDS[b].name));
  return `<span class="eyebrow">${mode === "collection" ? "THE COMPLETE CARD ARCHIVE" : "YOUR EXPEDITION"}</span><h2>${{ deck: "What you carry.", "draw-pile": "The next possibilities.", "discard-pile": "Ready for another circuit.", "exhaust-pile": "Resting until the next encounter.", collection: "Tools of the last architects." }[mode]}</h2><p class="modal-intro">${pile.length} cards · ${mode === "draw-pile" ? "Grouped by name. Draw order is hidden." : mode === "exhaust-pile" ? "Exhausted cards return to your deck at the next encounter." : mode === "collection" ? "Every card has an upgraded (+) version: choose Upgraded to compare. Right-click or select a card to inspect it." : "Select a card to inspect its rules."}</p>
    <div class="archive-toolbar"><div class="rarity-filters" aria-label="Filter cards">${FILTERS.map(r => `<button data-rarity="${r}" class="${rarity === r ? "active" : ""}" aria-pressed="${rarity === r}">${r === "special" ? "junk & curses" : r}</button>`).join("")}</div><input class="archive-search" type="search" aria-label="Search cards" placeholder="Find a card or effect…" value="${esc(query)}"/></div>
    <div class="collection-grid">${entries.map(([id, n], i) => `<div class="collection-entry">${cardMarkup(id, i, "collection")}<span>${mode === "collection" ? `${CARDS[id].rarity === "special" ? (CARDS[id].curse ? "curse" : "junk") : CARDS[id].rarity}${CARDS[id].archetype ? ` · ${CARDS[id].archetype}` : ""}` : `× ${n} IN PILE`}</span></div>`).join("") || '<p class="empty-pile">No cards match this filter.</p>'}</div>`;
}

export function relicJournalMarkup(run: RunState) {
  return `<span class="eyebrow">THE KEEPER'S RELICS</span><h2>Power that stays with you.</h2><p class="modal-intro">Every relic you carry, and what it lends to your network. Boss relics bend a rule — read their drawback.</p><div class="relic-ledger">${run.relics.map(id => `<p class="tier-${RELICS[id].tier}"><b style="color:${RELICS[id].color}">${esc(RELICS[id].name)}${RELICS[id].tier === "boss" ? " · BOSS" : RELICS[id].tier === "starter" ? " · STARTER" : ""}</b><span>${esc(RELICS[id].rules)}</span></p>`).join("")}</div>`;
}

export function historyMarkup(run: RunState) {
  return `<span class="eyebrow">ENCOUNTER RECORD</span><h2>The signal leaves a trace.</h2><ol class="history-list">${run.log.map(line => `<li>${esc(line)}</li>`).join("")}</ol><h3>Relics carried</h3><div class="relic-ledger">${run.relics.map(id => `<p><b>${esc(RELICS[id].name)}</b><span>${esc(RELICS[id].rules)}</span></p>`).join("")}</div>`;
}

export function enemyDossierMarkup(run: RunState) {
  const story = run.enemy ? enemyStory(run.enemy.id) : null;
  if (!story || !run.enemy) return `<span class="eyebrow">THE FIELD JOURNAL</span><h2>No hostile on the grid.</h2><button class="text-button" data-action="help">Open the Handbook →</button>`;
  const definition = ENEMIES[run.enemy.id], forecast = combatPreview(run), intent = forecast.intent, pattern = definition.pattern;
  return `<span class="eyebrow">THE FIELD JOURNAL · HOSTILE SIGNAL</span><h2>${esc(story.name)}</h2><p class="dossier-title">${esc(story.title)}</p><p>${esc(story.motive)}</p><div class="enemy-pattern">${pattern.map(({ kind, field, ultimate, junk }, i) => `<span class="${i === run.enemy!.turn % pattern.length ? "current" : ""}"><b>${i + 1}</b>${INTENT_NAMES[kind]}${ultimate ? "<small>ULTIMATE</small>" : ""}${field ? `<small>+ ${FIELD_RULES[field].name}</small>` : ""}${junk ? `<small>+ ${junk.count} ${esc(CARDS[junk.card].name)}</small>` : ""}</span>`).join("")}</div><p class="enemy-telegraph">${intent ? esc(story.telegraphs[intent.kind] ?? "") : ""}</p><h3>Build a countermeasure</h3><p>${esc(story.counterplay)}</p>${story.counterplay !== forecast.traitDescription ? `<p class="trait-explanation">${esc(forecast.traitDescription)}</p>` : ""}${definition.boss ? `<p class="trait-explanation">${esc(definition.boss.warning)} Breaking an ultimate cancels its attack and new field, then exposes the guardian for one turn: ignore armor and deal +${RULES.exposedBonus} damage. Existing fields still resolve.</p>` : ""}<p class="modal-intro">Each cycle repeats. Pressure adds 1 damage to strikes and breaches every three completed enemy actions. Stage II adds 1 attack damage; stage III adds 2. New hostile fields begin on the following player turn.</p><button class="text-button" data-action="help">Open the Handbook →</button>`;
}

const ROLE_COPY: Record<string, string> = {
  client: "Terminal",
  router: "Router · every route needs one",
  switch: `Switch · +${RULES.switchDamage} on the primary route`,
  firewall: `Firewall · online: blocks ${RULES.firewallBreachBlock} breach / ${RULES.firewallStrikeBlock} strike`,
  honeypot: `Honeypot · draws jams and cuts; the attacker takes ${RULES.honeypotDamage}`,
  cache: "Cache Server · online: draw +1 next turn",
  power: "PoE Injector · online: +1 energy next turn",
  balancer: `Load Balancer · online: +${RULES.balancerPerChannel} per channel`,
};
export function devicesMarkup(run: RunState) {
  const p = combatPreview(run);
  return `<span class="eyebrow">CONTAINERLAB · DEVICE INVENTORY</span><h2>A place for every device.</h2><p class="modal-intro">Select hardware to relocate it for ${RULES.relocateCost} energy. <b>Online</b> devices sit on a live route and use their ability; offline devices do nothing. Bands with ${RULES.clusterThreshold}+ online devices form a cluster (+${RULES.clusterDamage}); routers in opposite outer bands on separate channels grant ${RULES.separatedCircuitShield} shield.</p><div class="device-inventory">${run.topology.nodes.map(n => {
    const online = n.fixed || p.online.includes(n.id);
    return `<button data-manage-node="${n.id}" class="${online ? "is-online" : "is-offline"}"><strong>${esc(n.id.toUpperCase())}</strong><span>${esc(ROLE_COPY[n.role] ?? n.role)} · ${zoneForNode(n).toUpperCase()}</span><small>${[n.fixed ? "Fixed terminal" : online ? "ONLINE" : "OFFLINE · connect it to a live route", n.fixed ? "" : `Relocate: ${RULES.relocateCost} energy`, n.shielded ? "Jam protected" : "", n.upgraded ? `Overclocked +${RULES.overclockDamage}` : "", n.configured ? `Startup Config +${RULES.configuredDamage}` : "", n.amplified ? `Compressed +${RULES.compressionDamage}` : "", n.stateful ? "Stateful · blocks double" : "", n.salvage ? "Salvaged" : ""].filter(Boolean).join(" · ")}</small></button>`;
  }).join("")}</div>${run.malware.length ? `<div class="cable-inventory malware-inventory"><h3>${icon("malware", 16)} Malware</h3>${run.malware.map(m => `<p><span>${esc(m.id.toUpperCase())} · ${zoneForNode(m).toUpperCase()} · −${RULES.malwarePenalty} damage</span><button class="text-button" data-scrub="${m.id}" ${run.energy < RULES.scrubCost ? "disabled" : ""}>Scrub · ${RULES.scrubCost} energy</button></p>`).join("")}</div>` : ""}<div class="cable-inventory"><h3>Connections</h3>${run.topology.links.map(l => {
    const a = run.topology.nodes.find(n => n.id === l.a)!, b = run.topology.nodes.find(n => n.id === l.b)!;
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    return `<p><span>${esc(l.a.toUpperCase())} ↔ ${esc(l.b.toUpperCase())}</span><b class="${length > RULES.cableExposureLength && !l.armored ? "danger" : ""}">${length.toFixed(1)} units${l.armored ? " · CUT-PROOF" : ""}${l.boosted ? ` · +${RULES.amplifiedCableDamage} SIGNAL` : ""}</b></p>`;
  }).join("") || "<p>No cables yet.</p>"}</div>${run.terrain ? `<p class="modal-intro">${icon("terrain", 14)} <b>${esc(run.terrain.name)}</b> · ${esc(run.terrain.description)}${run.terrain.debris.length ? ` ${run.terrain.debris.length} wrecked socket${run.terrain.debris.length === 1 ? "" : "s"} block placement.` : ""}</p>` : ""}`;
}
