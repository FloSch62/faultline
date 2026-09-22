import { CARD_INSIGHTS } from "./card-insights.ts";
import { CARDS, RELICS } from "./core/cards.ts";
import { enemyStory } from "./story.ts";
import { combatPreview, zoneForNode } from "./core/run.ts";
import type { CardId, RunState } from "./core/types.ts";
import { cardMarkup, esc, icon } from "./ui.ts";

const terms = (items: { label: string; amount: number }[]) => items.map(t => `<div class="calculation-term"><span>${esc(t.label)}</span><b>${t.amount >= 0 ? "+" : ""}${t.amount}</b></div>`).join("");
export function combatDetailsMarkup(run: RunState) {
  const p = combatPreview(run);
  return `<span class="eyebrow">TRANSMISSION FORECAST · TURN ${run.turn}</span><h2>Every point has a source.</h2>
    <div class="calculation-grid"><section><h3>${icon("bolt")} Signal damage</h3>${terms(p.damageTerms)}${!p.signalPath.length ? '<p>No live ALPHA → router → OMEGA route. Route bonuses cannot activate.</p>' : ""}<div class="calculation-total"><span>Damage to hostile</span><strong>${p.packetDamage}</strong></div><p class="route-trace">${p.signalPath.map(id => esc(id.toUpperCase())).join(" <i>→</i> ") || "SIGNAL OFFLINE"}</p><p>The strongest live route is chosen automatically. Equal damage favors the better protected route. Independent routes must share no intermediate devices.</p></section>
    <section><h3>${icon("shield")} Your defenses</h3><div class="calculation-term"><span>Incoming before shields</span><b>${p.incomingRaw}</b></div><div class="incoming-sources">${terms(p.incomingTerms)}</div>${terms(p.shieldTerms)}<div class="calculation-term"><span>Total prevented</span><b>${Math.min(p.incomingRaw, p.shield)}</b></div><div class="calculation-total ${p.incoming ? "danger" : "safe"}"><span>Integrity lost</span><strong>${p.incoming}</strong></div><p>${p.lethal ? "Your transmission defeats the hostile, so its intent never resolves." : p.faultTarget ? `Next fault: ${esc(p.faultTarget.toUpperCase().replaceAll("::", " ↔ "))}. It will last for your next player turn.` : "Shields reduce damage to a minimum of zero."}</p><p>Stored shield and burst power expire after transmission. Hardware and jam protection last for this encounter. Enemy pressure rises every three completed turns.</p></section></div>
    <div class="trait-explanation"><b>Hostile trait</b><p>${esc(p.traitDescription)}</p>${p.hazardZone ? `<p>Threatened band: <strong>${p.hazardZone.toUpperCase()}</strong>. Deploy elsewhere or spend 1 energy to relocate an installed device.</p>` : ""}${p.enemyHealing ? `<p>The lost transmission lets the enemy restore <strong>${p.enemyHealing} integrity</strong>.</p>` : ""}</div><div class="turn-sequence"><span><b>1</b> Your signal strikes</span><span><b>2</b> Surviving enemy acts</span><span><b>3</b> Temporary effects expire</span><span><b>4</b> Recharge & draw</span></div>
    <button class="gold-button" data-action="close">Back to the table ${icon("arrow")}</button>`;
}

export function inspectMarkup(id: CardId, run: RunState, returnToArchive = false) {
  const c = CARDS[id];
  return `<div class="card-inspect"><div>${cardMarkup(id, 0, "collection")}</div><section><span class="eyebrow">${c.rarity.toUpperCase()} · ${c.subtitle.split(" / ").at(-1)}</span><h2>${esc(c.name)}</h2><p class="inspect-rules">${esc(c.rules)}</p><div class="inspect-facts"><span>Energy cost <b>${c.cost}</b></span><span>Target <b>${{ground: "Free table socket", link: "Two devices", node: "A valid device", instant: "Immediate", zone: "North, Center, or South"}[c.target]}</b></span><span>After playing <b>${c.exhaust ? "Exhaust until next encounter" : "Discard, then reshuffle"}</b></span><span>In your deck <b>${run.deck.filter(x => x === id).length}</b></span></div><div class="synergy-note"><span class="eyebrow">BUILD CONNECTIONS</span><p>${esc(CARD_INSIGHTS[id] ?? "Hardware stays for the encounter. Temporary shield and burst expire after transmission.")}</p></div><button class="text-button" data-action="${returnToArchive ? "inspect-back" : "close"}">${returnToArchive ? "Back to cards" : "Return"} ${icon("arrow", 14)}</button></section></div>`;
}

export type LibraryMode = "deck" | "draw-pile" | "discard-pile" | "exhaust-pile" | "collection";
export function libraryMarkup(run: RunState, mode: LibraryMode, rarity = "all", query = "") {
  const pile = mode === "collection" ? Object.keys(CARDS) as CardId[] : mode === "draw-pile" ? run.drawPile : mode === "discard-pile" ? run.discardPile : mode === "exhaust-pile" ? run.exhaustPile : run.deck;
  const counts = new Map<CardId, number>();
  pile.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  const entries = [...counts].filter(([id]) => (rarity === "all" || CARDS[id].rarity === rarity) && `${CARDS[id].name} ${CARDS[id].rules} ${CARDS[id].subtitle}`.toLowerCase().includes(query.toLowerCase())).sort(([a], [b]) => CARDS[a].name.localeCompare(CARDS[b].name));
  return `<span class="eyebrow">${mode === "collection" ? "THE COMPLETE ALPHA CARD ARCHIVE" : "YOUR EXPEDITION"}</span><h2>${{ deck: "What you carry.", "draw-pile": "The next possibilities.", "discard-pile": "Ready for another circuit.", "exhaust-pile": "Resting until the next encounter.", collection: "Tools of the last architects." }[mode]}</h2><p class="modal-intro">${pile.length} cards · ${mode === "draw-pile" ? "Grouped by name. Draw order is hidden." : mode === "exhaust-pile" ? "Exhausted cards return to your deck at the next encounter." : "Select a card to inspect its rules."}</p>
    <div class="archive-toolbar"><div class="rarity-filters" aria-label="Filter by rarity">${["all", "basic", "common", "uncommon", "rare", "legendary"].map(r => `<button data-rarity="${r}" class="${rarity === r ? "active" : ""}" aria-pressed="${rarity === r}">${r}</button>`).join("")}</div><input class="archive-search" type="search" aria-label="Search cards" placeholder="Find a card or effect…" value="${esc(query)}"/></div>
    <div class="collection-grid">${entries.map(([id,n],i) => `<div class="collection-entry">${cardMarkup(id,i,"collection")}<span>${mode === "collection" ? CARDS[id].rarity : `× ${n} IN PILE`}</span></div>`).join("") || '<p class="empty-pile">No cards match this filter.</p>'}</div>`;
}

export function relicJournalMarkup(run: RunState) {
  return `<span class="eyebrow">THE KEEPER'S RELICS</span><h2>Power that stays with you.</h2><p class="modal-intro">Every relic you carry, and what it lends to your network.</p><div class="relic-ledger">${run.relics.map(id => `<p><b style="color:${RELICS[id].color}">${RELICS[id].name}</b><span>${RELICS[id].rules}</span></p>`).join("")}</div>`;
}

export function historyMarkup(run: RunState) {
  return `<span class="eyebrow">ENCOUNTER RECORD</span><h2>The signal leaves a trace.</h2><ol class="history-list">${run.log.map(line => `<li>${esc(line)}</li>`).join("")}</ol><h3>Relics carried</h3><div class="relic-ledger">${run.relics.map(id => `<p><b>${RELICS[id].name}</b><span>${RELICS[id].rules}</span></p>`).join("")}</div>`;
}

export function refineMarkup(run: RunState) {
  return `<span class="eyebrow">SANCTUARY · REFINE YOUR DECK</span><h2>Leave one thing behind.</h2><p class="modal-intro">Removing a card spends this sanctuary's service. A smaller deck finds its key cards sooner. Your essential opening route is protected.</p><div class="refine-grid">${run.deck.map((id,i) => {
    const protectedCard = run.deck.length <= 10 || (id === "router" && run.deck.filter(c => c === id).length <= 1) || (id === "fiber" && run.deck.filter(c => c === id).length <= 2);
    return `<button data-remove-card="${i}" class="refine-card" ${protectedCard ? "disabled" : ""}><span>${esc(CARDS[id].name)}</span><small>${protectedCard ? "Protected · essential opening route" : `${CARDS[id].cost} energy · ${CARDS[id].rarity}`}</small>${icon(protectedCard ? "shield" : "close",14)}</button>`;
  }).join("")}</div>`;
}

export function guideMarkup() {
  return `<span class="eyebrow">THE ARCHITECT'S FIELD GUIDE</span><h2>Your network is your weapon.</h2><p class="modal-intro">Seven sectors. One backbone to restore. A deck shaped by your decisions.</p><button class="gold-button guide-tutorial" data-action="tutorial">Play the optional tutorial ${icon("play",16)}</button><div class="guide-grid">
    <div><b>01</b><h3>Build a living route</h3><p>Connect <strong>ALPHA → router → OMEGA</strong> with hardware and links, or discover rare <strong>Containerlab</strong> for a complete overclocked route. Devices remain for the encounter. The strongest live path transmits automatically.</p></div>
    <div><b>02</b><h3>Understand every point</h3><p>A route starts at <strong>5 damage</strong>. Overclock adds <strong>2</strong>, a firewall <strong>1</strong>, routed switches up to <strong>2</strong>. Independent routes add <strong>2</strong>. Startup Config adds <strong>1</strong>. Relics and burst cards add their printed bonuses. Select <strong>Inspect calculation</strong> for the exact forecast.</p></div>
    <div><b>03</b><h3>Defend deliberately</h3><p><strong>Stored shield</strong> blocks incoming damage this turn. A routed firewall blocks <strong>3 breach</strong> or <strong>1 strike</strong>. <strong>Faraday Shell</strong> prevents jams; it is different from damage shield. Read the marked fault target, then patch or build a second route.</p></div>
    <div><b>04</b><h3>Claim the ground</h3><p>Field cards strengthen a band for 3 turns. Hostile corrosion adds 2 incoming damage in an occupied band; suppression takes 3 damage from a route through it. Both last 2 turns. Cleanse with Purge Field or move your hardware. One allied and one hostile field fit in each band; recasting replaces your field. After transmission, the surviving enemy acts. Faults last one player turn. Temporary shield and burst expire; energy resets to <strong>5</strong> plus reserves, and you draw <strong>6</strong>. Enemy pressure grows every three turns, and the Core enrages at half integrity: +3 to strikes/breaches, and 2 damage alongside its faults.</p></div>
    <div><b>05</b><h3>Shape your deck</h3><p>Rewards offer three distinct cards; taking one is optional. Common cards support your plan, uncommon cards connect synergies, and rare cards create powerful turns. <strong>Containerlab is rare; Clabernetes is legendary</strong> and appears less often. Neither begins in your deck. Elites guarantee a rare option and grant a relic. Sanctuaries offer repair, a relic, or card removal.</p></div>
    <div><b>06</b><h3>Placement is a decision</h3><p>Independent routes with routers in both <strong>north and south</strong> grant <strong>2 shield</strong>. Relocating installed hardware costs <strong>1 energy</strong>. Watch the Storm's marked band and the Wraith's longest-cable target. Select <strong>Devices & placement</strong> to move hardware without dragging.</p></div><div><b>07</b><h3>Three ways to survive</h3><p><strong>Architect:</strong> inexpensive links and independent routes. <strong>Warden:</strong> shields and fortified paths. <strong>Ghost:</strong> card flow and explosive turns. <strong>Exhaust</strong> removes a card for this encounter; it returns next battle. Maximum hand size: <strong>10</strong>.</p></div><div><b>08</b><h3>Claim the ground</h3><p><strong>Resonance</strong> adds route damage; <strong>Aegis</strong> and <strong>Null Field</strong> protect occupied bands. Allied fields last <strong>3 turns</strong>. Hostile <strong>Corrosion</strong> adds incoming damage; <strong>Suppression</strong> weakens routes for <strong>2 turns</strong>. Play <strong>Purge Field</strong> to cleanse a band or move your hardware away. One allied and one hostile field may share a band. Hover a field seal to read its effect and remaining turns.</p></div></div>
    <div class="control-legend"><span><kbd>1–9 / 0</kbd> Play card</span><span><kbd>Space</kbd> Transmit</span><span><kbd>Z</kbd> Undo</span><span><kbd>I</kbd> Inspect focused card</span><span><kbd>Esc</kbd> Cancel / pause</span><span>Right-click a card to inspect · Drag hardware to place · Drag empty table to orbit</span></div><button class="text-button" data-action="export">${icon("download",16)} Export this network for Containerlab</button>`;
}

const lessons = [
  ["A router gives the signal a way through.", "Play Core Router, then choose ‘Deploy in a free socket’ or click the table."],
  ["Give your router a source.", "Play Optic Fiber. Select ALPHA, then your router in the device strip."],
  ["Complete the circuit.", "Play the other Optic Fiber. Select your router, then OMEGA."],
  ["A complete route deals 5 damage.", "Read the damage calculation on the left and the incoming forecast on the right. Transmit when ready."],
  ["Your network persists. Protect it.", "Play Packet Guard. It stores 4 shield for this transmission. Watch the incoming forecast change."],
  ["Shield now, then recharge.", "Transmit again. Your route attacks, shield absorbs the reply, and temporary shield expires."],
  ["You are ready to carry the signal.", "Build redundant routes, use bursts at the right moment, and read enemy intent. Your expedition is waiting, exactly where you left it."],
];
export function lessonMarkup(step: number) {
  const [title, body] = lessons[step];
  return `<aside class="practice-lesson" aria-label="Tutorial lesson" aria-live="polite"><div class="lesson-progress">${lessons.map((_,i) => `<i class="${i <= step ? "complete" : ""}"></i>`).join("")}<span>${Math.min(step + 1,7)} / 7</span></div><span class="eyebrow">PRACTICE SIGNAL · YOUR SAVE IS SAFE</span><h3>${title}</h3><p>${body}</p>${step === 6 ? '<button class="gold-button" data-action="tutorial-finish">Finish tutorial →</button>' : '<button class="text-button" data-action="tutorial-exit">Leave tutorial</button>'}</aside>`;
}

export function enemyDossierMarkup(run: RunState) {
  const story = run.enemy ? enemyStory(run.enemy.id) : null;
  if (!story) return guideMarkup();
  const intent = combatPreview(run).intent;
  return `<span class="eyebrow">THE FIELD JOURNAL · HOSTILE SIGNAL</span><h2>${story.name}</h2><p class="dossier-title">${story.title}</p><p>${story.motive}</p><div class="enemy-pattern">${story.pattern.map((kind,i) => `<span class="${i === run.enemy!.turn % story.pattern.length ? "current" : ""}"><b>${i + 1}</b>${{strike: "Strike", breach: "Breach", jam: "Jam", sever: "Sever", corrupt: "Corrupt zone"}[kind]}</span>`).join("")}</div><p class="enemy-telegraph">${intent ? story.telegraphs[intent.kind] ?? "" : ""}</p><h3>Build a countermeasure</h3><p>${story.counterplay}</p><p class="trait-explanation">${esc(combatPreview(run).traitDescription)}</p><p class="modal-intro">Each cycle repeats. Pressure adds 1 damage to strikes and breaches every three completed enemy actions.${run.enemy?.id === "core" ? " At or below half integrity: +3 to strikes/breaches and 2 damage alongside faults, starting with the next displayed intent." : ""}</p><button class="text-button" data-action="help">Read the complete field guide →</button>`;
}

export function devicesMarkup(run: RunState) {
  return `<span class="eyebrow">CONTAINERLAB · DEVICE INVENTORY</span><h2>A place for every device.</h2><p class="modal-intro">Select hardware to relocate it for 1 energy. Independent routes in opposite outer bands grant 2 shield. A Wraith punishes exposed cables longer than 6 units.</p><div class="device-inventory">${run.topology.nodes.map(n => `<button data-manage-node="${n.id}"><strong>${esc(n.id.toUpperCase())}</strong><span>${n.role.toUpperCase()} · ${zoneForNode(n).toUpperCase()}</span><small>${[n.fixed ? "Fixed terminal" : "Relocate: 1 energy",n.shielded ? "Jam protected" : "",n.upgraded ? "Overclocked +2" : "",n.configured ? "Startup Config +1" : ""].filter(Boolean).join(" · ")}</small></button>`).join("")}</div><div class="cable-inventory"><h3>Connections</h3>${run.topology.links.map(l => {
    const a=run.topology.nodes.find(n=>n.id===l.a)!,b=run.topology.nodes.find(n=>n.id===l.b)!;
    const length=Math.hypot(a.x-b.x,a.z-b.z);
    return `<p><span>${esc(l.a.toUpperCase())} ↔ ${esc(l.b.toUpperCase())}</span><b class="${length > 6 && !l.armored ? "danger" : ""}">${length.toFixed(1)} units${l.armored ? " · ARMORED" : ""}${l.boosted ? " · +1 SIGNAL" : ""}</b></p>`;
  }).join("") || '<p>No cables yet.</p>'}</div>`;
}
