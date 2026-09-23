/** The v3 battle HUD: plates, console command, protocol dock, network ledger,
 * field seals, energy and transmit controls. Every number shown here is read from
 * the same pure forecast (`combatPreview`) that resolves the turn. */
import { ENEMIES } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { CARDS, RELICS, RULES, type ProtocolTrigger } from "./core/cards.ts";
import { ARCHETYPES } from "./core/expedition.ts";
import {
  combatPreview,
  consoleState,
  intentFor,
  FIELD_RULES,
  ZONES,
  zoneDescription,
  zoneForNode,
  type CombatPreview,
  type Intent,
} from "./core/run.ts";
import type { CardId, RunState, Zone } from "./core/types.ts";
import { enemyStory } from "./story.ts";
import { cardMarkup, esc, icon } from "./ui.ts";
import { relicEmblem } from "./screens.ts";

export interface BattleView {
  selected: number | null;
  source: string | null;
  busy: boolean;
  /** Show the dismissible field note (tips preference). */
  tips: boolean;
  undo: boolean;
  /** Patch Cable is choosing its two devices. */
  consoleTargeting: boolean;
  /** A Field Training lesson is running. */
  training: boolean;
}

export const INTENT_NAMES: Record<Intent["kind"], string> = {
  strike: "Integrity strike", sever: "Cut a cable", jam: "Jam a device", breach: "Security breach",
  corrupt: "Corrupt a band", charge: "Charging ultimate", infect: "Plant malware",
};
export const INTENT_ICONS: Record<Intent["kind"], string> = {
  strike: "sword", breach: "sword", sever: "link", jam: "bolt", corrupt: "field", charge: "bolt", infect: "malware",
};
const TRIGGER_WORDS: Record<ProtocolTrigger, string> = {
  sever: "a cable cut", jam: "a jam", strike: "a strike", breach: "a breach", field: "a hostile field", ultimate: "a charge or ultimate",
};
const TRIGGER_ICONS: Record<ProtocolTrigger, string> = {
  sever: "link", jam: "bolt", strike: "sword", breach: "shield", field: "field", ultimate: "boss",
};
const title = (name: string) => name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
/** Plate kickers part around the frame's crest jewel: "HOSTILE ◆ SIGNAL". */
function kicker(text: string): string {
  const cut = text.includes(" · ") ? text.indexOf(" · ") : text.indexOf(" ");
  if (cut < 0) return `<span class="plate-kicker"><span>${esc(text)}</span></span>`;
  const separator = text.slice(cut).startsWith(" · ") ? " · " : " ";
  // The separator stays in the text for readers and copy; the jewel stands in for it visually.
  return `<span class="plate-kicker"><span>${esc(text.slice(0, cut))}</span><span class="visually-hidden">${separator}</span><span>${esc(text.slice(cut + separator.length))}</span></span>`;
}
const pretty = (id: string) => id.toUpperCase().replaceAll("::", " ↔ ");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : word === word.toUpperCase() ? "S" : "s"}`;

/** What the forecast enemy action will do to your network, in one or two sentences. */
export function intentCopy(r: RunState, p: CombatPreview): string {
  const intent = p.intent!;
  const enemy = r.enemy!;
  if (p.lethal) return "Your transmission defeats it before it can act.";
  if (p.enemyDefeatedByTraps) return "Your traps finish it as it moves. Its action never lands.";
  if (p.interrupted) return `Ultimate interrupted. Existing fields still resolve. Exposed next turn: armor bypassed, +${RULES.exposedBonus} damage.`;
  if (intent.kind === "charge") {
    const next = intentFor({ ...r, enemy: { ...enemy, hp: Math.max(0, enemy.hp - p.packetDamage) } }, 1);
    return `${p.incomingRaw ? `Fields: ${p.incomingRaw} damage now. ` : ""}Ultimate: ${next?.amount ?? 0} damage next turn. Prepare a burst (P); deal ${p.breakDamage} then to interrupt, or brace.`;
  }
  const parts: string[] = [];
  const target = p.faultTarget;
  if (target && intent.kind === "sever") {
    const decoy = target.split("::").some(id => r.topology.nodes.find(n => n.id === id)?.role === "honeypot");
    parts.push(decoy ? `Cuts ${pretty(target)} — your honeypot draws the blade.` : `Cuts ${pretty(target)} for one turn.`);
  } else if (target && intent.kind === "jam") {
    const decoy = r.topology.nodes.find(n => n.id === target)?.role === "honeypot";
    parts.push(decoy ? `Jams ${pretty(target)} — your honeypot takes it.` : `Jams ${pretty(target)} for one turn.`);
  } else if (["jam", "sever"].includes(intent.kind)) parts.push(p.protocolTriggers.length ? "Your protocol cancels the disruption." : "No exposed device or cable to disrupt.");
  if (p.malwareTarget) parts.push(`Plants malware in ${zoneForNode(p.malwareTarget).toUpperCase()} (−${RULES.malwarePenalty} damage each until scrubbed).`);
  if (p.zoneThreat) parts.push(`${FIELD_RULES[p.zoneThreat.kind].name} in ${p.zoneThreat.zone.toUpperCase()} for ${p.zoneThreat.turns} turns, starting next turn.`);
  if (p.junk) parts.push(`Shuffles ${p.junk.count} ${CARDS[p.junk.card].name} into your draw pile.`);
  // Damage that is not the attack itself (fields, a Worm in hand, exposed cables) is named.
  const extra = p.incomingTerms.filter(term => term.amount > 0 && term.label !== intent.label);
  const sources = extra.length ? ` (${extra.map(term => `${term.label} +${term.amount}`).join(", ")})` : "";
  if (intent.kind === "strike" || intent.kind === "breach" || (p.incomingRaw && (extra.length || !parts.length)))
    parts.push(`${p.incomingRaw} damage after your transmission${sources}.`);
  return parts.join(" ") || "It gathers itself.";
}

/** Two rows of five fit the plate's frame; a longer collection folds into a "+N" token
 * that opens the relic journal, where every relic is listed. */
const RELIC_SLOTS = 10;
function relicTokens(r: RunState) {
  const overflow = r.relics.length > RELIC_SLOTS;
  const shown = overflow ? r.relics.slice(0, RELIC_SLOTS - 1) : r.relics;
  const more = r.relics.slice(shown.length);
  return shown.map(id => `<button class="relic-token tier-${RELICS[id].tier}" data-action="relic-journal" data-tooltip="${esc(`${RELICS[id].name}: ${RELICS[id].rules}`)}" aria-label="${esc(`${RELICS[id].name}: ${RELICS[id].rules}`)}" style="--relic-color:${RELICS[id].color}">${relicEmblem(id, 18)}<small>${esc(RELICS[id].name)}</small></button>`).join("")
    + (overflow ? `<button class="relic-token relic-more" data-action="relic-journal" data-tooltip="${esc(`${more.length} more: ${more.map(id => RELICS[id].name).join(", ")}`)}" aria-label="${esc(`${more.length} more relics: ${more.map(id => RELICS[id].name).join(", ")}. Open the relic journal.`)}" style="--relic-color:#e9d7a6"><strong>+${more.length}</strong><small>more</small></button>` : "");
}

interface Engine { label: string; value: string; tip: string; state: "" | "is-active" | "at-risk" }
/** The keeper's engine, shown as a badge on the console command it belongs to. */
function engineFor(r: RunState, p: CombatPreview): Engine {
  if (r.archetype === "ghost") {
    const risk = p.bufferAtRisk && (r.buffer > 0 || p.buffering);
    const state = p.buffering ? `Storing +${p.bufferGain} this turn.` : r.buffer ? `This transmission releases +${p.bufferRelease}.` : "The buffer is empty.";
    return {
      label: risk ? "AT RISK" : "BUFFER", value: String(r.buffer), state: risk ? "at-risk" : p.buffering || r.buffer ? "is-active" : "",
      tip: `Buffer: ${r.buffer} stored. ${state} Buffering stores a transmission ×${RULES.bufferMultiplier}; the next normal transmission releases it all. No live route at the start of a turn loses the whole buffer.${risk ? " Warning: the forecast enemy action leaves you without a live route." : ""}`,
    };
  }
  if (r.archetype === "warden") return {
    label: "PRESSURE", value: String(r.backpressure), state: r.backpressure || p.backpressureGain ? "is-active" : "",
    tip: `Backpressure: ${Math.round(RULES.backpressureRatio * 100)}% of the damage your shield prevents is stored and added to your next transmission. ${r.backpressure} rides this transmission; +${p.backpressureGain} will be stored after this enemy action.`,
  };
  const per = r.relics.includes("parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel;
  const bandwidth = r.relics.includes("spanning-tree") ? 0 : Math.max(0, p.channels - 1) * per;
  return {
    label: `${plural(p.channels, "CHANNEL")}`, value: `+${bandwidth}`, state: p.channels > 1 ? "is-active" : "",
    tip: `Bandwidth: +${per} damage for every channel beyond the first (${p.channels} now). Channels are routes that share no device between ALPHA and OMEGA; a cut on one leaves the others transmitting.`,
  };
}

function consoleMarkup(r: RunState, p: CombatPreview, v: BattleView): string {
  const c = consoleState(r), engine = engineFor(r, p);
  const firewalls = r.topology.nodes.filter(n => n.role === "firewall" && p.online.includes(n.id)).length;
  const brief = c.id === "patch" ? (v.consoleTargeting ? (v.source ? "Pick the second device" : "Pick the first device") : "Connect two devices")
    : c.id === "harden" ? `+${RULES.hardenShield + RULES.hardenPerFirewall * firewalls} block now`
    : c.active ? `Storing +${p.bufferGain}` : `Store this turn ×${RULES.bufferMultiplier}`;
  const state = v.consoleTargeting ? "targeting" : c.active ? "active" : c.usable ? "ready" : c.uses >= c.limit ? "spent" : "blocked";
  const status = state === "targeting" ? "SELECT" : state === "active" ? "ON" : state === "spent" ? "USED" : state === "blocked" ? "NEEDS ⚡" : c.limit > 1 ? `${c.limit - c.uses}× LEFT` : "READY";
  const glyph = c.id === "patch" ? "link" : c.id === "harden" ? "shield" : "buffer";
  return `<div class="console-control">
    <button class="console-button console-${c.id} is-${state}" data-action="console" aria-pressed="${c.active || v.consoleTargeting}" ${(!c.usable && !v.consoleTargeting) || v.busy ? "disabled" : ""} data-tooltip="${esc(`${c.name} · ${c.cost} energy. ${c.rules}${c.reason && !c.active ? ` ${c.reason}` : ""}`)}" aria-label="${esc(`Console command ${c.name}, ${c.cost} energy. ${c.rules} ${c.reason}`)}">
      <span class="console-glyph">${icon(glyph, 20)}</span>
      <span class="console-copy"><small>CONSOLE <kbd>C</kbd> · ${status}</small><strong>${esc(c.name)}</strong><em>${esc(brief)}</em></span>
      <span class="console-cost"><b>${c.cost}</b><small>⚡</small></span>
    </button>
    <span class="engine-badge ${engine.state}" tabindex="0" data-tooltip="${esc(engine.tip)}" aria-label="${esc(engine.tip)}"><strong>${esc(engine.value)}</strong><small>${engine.state === "at-risk" ? icon("warning", 9) : ""}${esc(engine.label)}</small></span>
  </div>`;
}

function protocolDock(r: RunState, p: CombatPreview): string {
  const slots = Array.from({ length: RULES.maxProtocols }, (_, i) => {
    const id = r.protocols[i];
    if (!id) return `<span class="protocol-slot empty" aria-label="Empty protocol slot"><i>${icon("protocol", 15)}</i><small>PROTOCOL SLOT<br><span>Arm a protocol card</span></small></span>`;
    const c = CARDS[id], trigger = p.protocolTriggers.find(t => t.card === id);
    return `<button class="protocol-slot armed ${trigger ? "will-trigger" : ""}" data-card-id="${id}" data-tooltip="${esc(`${c.name}: ${c.rules}${trigger ? ` — fires this turn: ${trigger.effect}` : ""}`)}" aria-label="${esc(`${c.name}, armed. ${trigger ? `Will fire this turn: ${trigger.effect}` : `Waits for ${TRIGGER_WORDS[c.protocol!]}`}`)}"><i>${icon(TRIGGER_ICONS[c.protocol!] ?? "protocol", 15)}</i><span><strong>${esc(c.name)}</strong><small>${trigger ? `${icon("trigger", 10)} WILL FIRE · ${esc(trigger.effect)}` : `ARMED · waits for ${TRIGGER_WORDS[c.protocol!]}`}</small></span></button>`;
  }).join("");
  return `<section class="protocol-dock ${p.protocolTriggers.length ? "has-trigger" : ""}" aria-label="Armed protocols, ${r.protocols.length} of ${RULES.maxProtocols}"><div class="protocol-slots">${slots}</div></section>`;
}

function ledgerMarkup(r: RunState, p: CombatPreview): string {
  const devices = r.topology.nodes.filter(n => !n.fixed);
  const chips: string[] = [];
  if (r.faultNode || r.faultLink)
    chips.push(`<span class="ledger-chip is-fault" data-tooltip="Faults last for this player turn. Hot Patch, Link Recovery or Fast Reroute clear them; a second channel keeps transmitting.">${icon("link", 12)} FAULT · ${esc(pretty(r.faultNode || r.faultLink || ""))}</span>`);
  if (!p.signalPath.length) chips.push(`<span class="ledger-chip is-offline" data-tooltip="A route runs ALPHA → router → OMEGA through live cables.">${icon("online", 12)} NO LIVE ROUTE</span>`);
  else chips.push(`<span class="ledger-chip is-channels ${p.channels > 1 ? "is-strong" : ""}" data-tooltip="${esc(`${plural(p.channels, "channel")}: routes that share no device between the terminals. Each channel beyond the first adds bandwidth damage, and a cut on one channel leaves the others transmitting.`)}">${icon("channels", 12)} ${plural(p.channels, "CHANNEL")}${p.channels > 1 ? ` · CUT-PROOF` : ""}</span>`);
  if (devices.length) chips.push(`<span class="ledger-chip ${p.online.length < devices.length ? "has-offline" : ""}" data-tooltip="${esc(`Online devices sit on at least one live route; offline devices do nothing. ${devices.filter(n => !p.online.includes(n.id)).map(n => n.id.toUpperCase()).join(", ") || "Everything is online."}`)}">${icon("online", 12)} ${p.online.length}/${devices.length} ONLINE</span>`);
  for (const zone of p.clusters) chips.push(`<span class="ledger-chip is-cluster" data-tooltip="${esc(`${zone.toUpperCase()} holds ${RULES.clusterThreshold}+ online devices: +${RULES.clusterDamage} damage. Clustered bands are also easier for band attacks to hit.`)}">${icon("cluster", 12)} ${zone.toUpperCase()} CLUSTER +${RULES.clusterDamage}</span>`);
  for (const m of r.malware) chips.push(`<button class="ledger-chip is-malware" data-scrub="${m.id}" data-tooltip="${esc(`Malware in ${zoneForNode(m).toUpperCase()}: −${RULES.malwarePenalty} transmission damage. Scrub it for ${RULES.scrubCost} energy (or click it on the table), or Purge Field its band.`)}" ${r.energy < RULES.scrubCost ? "disabled" : ""}>${icon("malware", 12)} MALWARE · ${zoneForNode(m).toUpperCase()} <b>SCRUB ${RULES.scrubCost}⚡</b></button>`);
  if (r.terrain) chips.push(`<span class="ledger-chip is-terrain" data-tooltip="${esc(`${r.terrain.name}: ${r.terrain.description}`)}">${icon("terrain", 12)} ${esc(r.terrain.name)}</span>`);
  const base = RULES.handDraw;
  chips.push(`<span class="ledger-chip is-next" data-tooltip="${esc(`Next turn after the forecast enemy action: ${p.nextTurn.energy} energy and ${p.nextTurn.draw} cards. Online PoE Injectors add energy; online Cache Servers add draws. A cut or jam can take them offline first.`)}">${icon("next", 12)} NEXT · ${p.nextTurn.energy}⚡ · ${p.nextTurn.draw} CARD${p.nextTurn.draw === 1 ? "" : "S"}${p.nextTurn.draw > base ? " ▲" : ""}</span>`);
  return `<div class="network-status network-ledger" aria-label="Network status">${chips.join("")}</div>`;
}

function fieldStrip(r: RunState, p: CombatPreview, targeting: boolean): string {
  return `<div class="field-strip" aria-label="Battlefield bands">${ZONES.map((zone: Zone) => {
    const effects = r.zoneEffects.filter(effect => effect.zone === zone);
    const threatened = p.hazardZone === zone;
    const inBand = r.topology.nodes.filter(n => !n.fixed && zoneForNode(n) === zone);
    const online = inBand.filter(n => p.online.includes(n.id)).length;
    const cluster = p.clusters.includes(zone);
    const malware = r.malware.filter(m => zoneForNode(m) === zone).length;
    const description = `${zoneDescription(r, zone)}${cluster ? `. Cluster: +${RULES.clusterDamage} damage` : ""}${threatened ? ". Enemy targets this band next." : ""}`;
    return `<button class="field-seal ${effects.some(effect => FIELD_RULES[effect.kind].hostile) ? "corrupted" : effects.length ? "empowered" : ""} ${threatened ? "threatened" : ""} ${cluster ? "clustered" : ""} ${targeting ? "targetable" : ""}" data-field-zone="${zone}" data-tooltip="${esc(description)}" aria-label="${zone} band: ${esc(description)}"><span class="field-name">${icon("field", 16)} ${zone.toUpperCase()} ${threatened ? '<i class="threat-mark">!</i>' : ""}${cluster ? `<i class="cluster-mark">CLUSTER +${RULES.clusterDamage}</i>` : ""}</span><span class="field-effects">${effects.length ? effects.map(effect => `<span class="${FIELD_RULES[effect.kind].hostile ? "hostile-field" : "allied-field"}">${FIELD_RULES[effect.kind].name} <b>${effect.permanent ? "∞" : `${effect.turns}t`}</b></span>`).join("") : `<span>${threatened ? "THREAT INBOUND" : "CLEAR GROUND"}</span>`}</span><span class="band-meta">${inBand.length ? `${online}/${inBand.length} online` : "empty"}${malware ? ` · ${icon("malware", 10)} ${malware}` : ""}</span></button>`;
  }).join("")}</div>`;
}

export function battleMarkup(r: RunState, v: BattleView) {
  const stage = STAGES[r.stage], enemy = r.enemy!, intent = intentFor(r)!, p = combatPreview(r);
  const definition = ENEMIES[enemy.id];
  const target = v.selected === null ? null : CARDS[r.hand[v.selected]];
  const hint = v.consoleTargeting ? `Patch Cable · ${v.source ? "choose the second device" : "choose the first device"}`
    : !target ? "Choose your next move" : target.target === "zone" ? "Choose a band on the table or a field seal below" : target.target === "ground" ? "Choose an empty socket on the table" : target.target === "link" ? v.source ? "Choose the second device" : "Choose the first device" : "Choose a device";
  const intentName = intent.ultimate ? definition.pattern[enemy.turn % definition.pattern.length].label : INTENT_NAMES[intent.kind];
  const bossWindow = !p.lethal && intent.ultimate ? `<div class="boss-window ${p.interrupted ? "broken" : "ultimate"}" role="status"><span>${p.interrupted ? "INTERRUPT READY" : "INTERRUPT THIS TURN"}</span><strong>${p.packetDamage} / ${p.breakDamage} damage</strong><div class="break-meter" role="meter" aria-label="Damage to interrupt ultimate" aria-valuenow="${Math.min(p.packetDamage, p.breakDamage!)}" aria-valuemin="0" aria-valuemax="${p.breakDamage}"><i style="width:${Math.min(100, p.packetDamage / p.breakDamage! * 100)}%"></i></div></div>`
    : enemy.exposed ? `<div class="boss-window broken"><span>EXPOSED THIS TURN</span><strong>+${RULES.exposedBonus} damage · armor bypassed</strong></div>` : "";
  const heading = intent.ultimate ? `${intentName} · ${p.interrupted ? "BREAK READY" : "INBOUND"}` : intent.kind === "charge" ? "THE GUARDIAN IS GATHERING POWER" : enemy.exposed ? "THE GUARDIAN IS EXPOSED" : v.training ? "FIELD TRAINING" : stage.chapters[r.floor]?.toUpperCase() ?? "";
  const buffering = p.buffering;
  const shownDamage = buffering ? p.bufferGain : p.packetDamage;
  const extras = [
    p.enemyDamage ? `<span class="hazard-caption is-trap">${icon("trap", 13)} TRAPS · ENEMY TAKES ${p.enemyDamage}${p.enemyDefeatedByTraps ? " · LETHAL" : ""}</span>` : "",
    p.protocolTriggers.length ? `<span class="hazard-caption is-counter">${icon("trigger", 13)} COUNTERED · ${esc(p.protocolTriggers.map(t => t.name).join(" + "))}</span>` : "",
    p.hazardZone ? `<span class="hazard-caption" ${intent.field ? 'data-combined-intent="true"' : ""}>${icon("field", 13)} ${p.zoneThreat ? `${FIELD_RULES[p.zoneThreat.kind].name.toUpperCase()} · ` : ""}${p.hazardZone.toUpperCase()}</span>` : "",
    p.malwareTarget ? `<span class="hazard-caption is-infect">${icon("malware", 13)} MALWARE · ${zoneForNode(p.malwareTarget).toUpperCase()}</span>` : "",
    p.junk ? `<span class="hazard-caption is-junk">${icon("deck", 13)} +${p.junk.count} ${esc(CARDS[p.junk.card].name.toUpperCase())}</span>` : "",
    p.enemyHealing ? `<span class="hazard-caption">Restores ${p.enemyHealing} health this turn</span>` : "",
  ].join("");
  const note = !p.signalPath.length ? "Build ALPHA → router → OMEGA, then transmit."
    : p.channels < 2 ? `Your route is alive. A second channel adds +${RULES.bandwidthPerChannel} and keeps transmitting through a cut.`
    : "Two channels: bandwidth is flowing and one cut can't silence you. Arm a protocol for what's coming.";

  return `
    <div class="encounter-heading"><span class="eyebrow">${esc(heading)}</span><span class="round-banner"><i></i> TURN ${String(r.turn).padStart(2, "0")} <i></i></span></div>
    <aside class="battle-left battle-plate player-plate" aria-label="Your network">
      <div class="combatant-identity"><span class="combatant-seal">${icon("shield", 25)}</span><div>${kicker(v.training ? "FIELD TRAINING" : "SIGNAL KEEPER")}<span class="plate-heading">${ARCHETYPES[r.archetype].name}</span></div></div>
      <div class="vital-heading"><span>${icon("heart", 15)} Integrity</span><strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></div>
      <div class="vital-bar player-health" role="meter" aria-label="Your integrity" aria-valuenow="${r.integrity}" aria-valuemin="0" aria-valuemax="${r.maxIntegrity}"><i style="width:${r.integrity / r.maxIntegrity * 100}%"></i>${p.incoming ? `<span class="health-risk" style="left:${Math.max(0, r.integrity - p.incoming) / r.maxIntegrity * 100}%;width:${Math.min(r.integrity, p.incoming) / r.maxIntegrity * 100}%"></span>` : ""}</div>
      <div class="survival-forecast forecast-net ${p.incoming ? "danger" : "safe"}"><b>${p.incoming}</b> ${p.incoming ? "integrity at risk" : p.lethal || p.enemyDefeatedByTraps ? "retaliation · finishing blow" : "integrity lost · protected"}</div>
      <div class="player-resources">
        <div class="shield-resource" tabindex="0" data-tooltip="Available shield: ${esc(p.shieldTerms.map(t => `${t.label} +${t.amount}`).join("; ") || "Play defense cards, keep a firewall online or route through protected fields.")}">${icon("shield", 22)}<strong>${p.shield}</strong><span>SHIELD</span></div>
        <div class="signal-readout ${p.packetDamage ? "online" : ""}" tabindex="0" data-tooltip="${esc(p.damageTerms.map(t => `${t.label} ${t.amount >= 0 ? "+" : ""}${t.amount}`).join("; ") || "No live route yet.")}">${icon("sword", 22)}<strong>${p.packetDamage}<small>signal damage</small></strong><span>DAMAGE</span></div>
        <div class="burst-resource" tabindex="0" data-tooltip="Extra transmission damage from cards this turn. Burst expires after your turn.">${icon("bolt", 22)}<strong>+${r.packetBoost}</strong><span>BURST</span></div>
      </div>
      <div class="player-tools"><button class="formula-button" data-action="combat-details">${icon("book", 14)} Details</button><button class="formula-button devices-button" data-action="devices" aria-label="Devices & placement" data-tooltip="Devices & placement">${icon("map", 14)}<span>Devices</span></button><button class="text-button undo-button" data-action="undo" aria-label="Undo last action · Z" data-tooltip="Undo last action · Z" ${!v.undo || v.busy ? "disabled" : ""}>${icon("undo", 14)}<span>Undo</span><kbd>Z</kbd></button></div>
      <div class="perk-heading"><span>RELICS & PERKS</span><small>${r.relics.length} carried</small></div>
      <div class="battle-relics">${relicTokens(r)}</div>
      ${r.reserveEnergy ? `<span class="reserve-note">${icon("bolt", 12)} +${r.reserveEnergy} energy next turn</span>` : ""}
    </aside>
    <aside class="battle-right battle-plate enemy-plate" aria-label="Enemy intent">
      <div class="combatant-identity"><span class="combatant-seal">${icon(definition.boss ? "boss" : "sword", 25)}</span><div>${kicker(definition.boss ? `STAGE ${stage.numeral} · GUARDIAN` : v.training ? "TRAINING SIGNAL" : "HOSTILE SIGNAL")}<h2>${esc(title(enemy.name))}</h2></div></div>
      <span class="enemy-flavor">${esc(enemyStory(enemy.id)?.title ?? enemy.title)}</span>
      <div class="vital-heading enemy-health-label"><span>Hostile integrity</span><strong>${enemy.hp}<small> / ${enemy.maxHp}</small></strong></div>
      <div class="enemy-health vital-bar" role="meter" aria-label="Hostile integrity" aria-valuenow="${enemy.hp}" aria-valuemin="0" aria-valuemax="${enemy.maxHp}" data-tooltip="${buffering ? `Buffering: no damage this turn, +${p.bufferGain} stored` : `${p.packetDamage} damage on your next transmission`}${p.enemyDamage ? ` · traps +${p.enemyDamage}` : ""}"><span style="width:${enemy.hp / enemy.maxHp * 100}%"></span>${p.packetDamage + p.enemyDamage ? `<i class="health-risk" style="left:${Math.max(0, enemy.hp - p.packetDamage - p.enemyDamage) / enemy.maxHp * 100}%;width:${Math.min(enemy.hp, p.packetDamage + p.enemyDamage) / enemy.maxHp * 100}%"></i>` : ""}</div>
      <button class="trait-badge" data-action="enemy-dossier" data-tooltip="${esc(p.traitDescription)}">${icon("elite", 13)} ${esc(definition.badge)}</button>
      <div class="intent-heading"><span>NEXT INTENT</span><span class="intent-states">${intent.label.startsWith("ENRAGED") ? '<b class="enrage-warning">ENRAGED</b>' : ""}${intent.pressure ? `<span class="pressure-warning">PRESSURE +${intent.pressure}</span>` : ""}</span></div>
      <div class="intent-medallion intent-${intent.kind} ${p.lethal || p.interrupted || p.enemyDefeatedByTraps ? "lethal" : ""}"><span class="intent-emblem">${icon(INTENT_ICONS[intent.kind], 30)}</span><strong>${p.lethal || p.enemyDefeatedByTraps ? "CANCELLED" : p.interrupted ? "BROKEN" : intent.kind === "charge" ? "CHARGE" : p.incomingRaw || ""}<small>${esc(intentName)}</small></strong></div>
      ${bossWindow}
      <p class="intent-description">${esc(intentCopy(r, p))}</p>
      <div class="intent-extras">${extras}</div>
    </aside>
    ${v.tips && !v.training ? `<div class="tutorial-callout"><span>FIELD NOTE</span><p>${esc(note)}</p><button data-action="dismiss-tutorial" aria-label="Dismiss field note">${icon("close", 12)}</button></div>` : ""}
    ${fieldStrip(r, p, target?.target === "zone")}
    <div class="command-dock command-left">${consoleMarkup(r, p, v)}</div>
    <div class="command-dock command-right">${protocolDock(r, p)}</div>
    <div class="battle-bottom">
      <div class="energy-orb" aria-label="${r.energy} energy available" data-tooltip="${esc(`${r.energy} energy now. Next turn: ${p.nextTurn.energy}.`)}"><strong>${r.energy}</strong><span>ENERGY</span></div>
      <div class="draw-piles">${([["draw-pile", r.drawPile.length, "DRAW"], ["discard-pile", r.discardPile.length, "DISCARD"], ["exhaust-pile", r.exhaustPile.length, "EXHAUST"]] as const).map(([action, count, label]) => `<button data-action="${action}" class="${action}" data-tooltip="${label === "EXHAUST" ? "Exhausted cards return next encounter" : `Inspect your ${label.toLowerCase()} pile`}">${icon("deck", 18)}<span>${count}<small>${label}</small></span></button>`).join("")}<button data-action="prepare" class="prepared-pile ${r.preparedCard ? "occupied" : ""}" aria-label="${r.preparedCard ? `Prepared: ${esc(CARDS[r.preparedCard].name)}` : "Prepare a card for next turn"}" data-tooltip="${r.preparedCard ? `${esc(CARDS[r.preparedCard].name)} is held for next turn` : "Hold one card for next turn, replacing one draw · P"}" ${v.busy ? "disabled" : ""}>${icon("battery", 18)}<span>${r.preparedCard ? "1" : "+"}<small>${r.preparedCard ? "READY" : "PREPARE"}</small></span></button></div>
      <div class="target-hint ${v.selected !== null || v.consoleTargeting ? "active" : ""}">${esc(hint)}${v.selected !== null || v.consoleTargeting ? '<button data-action="cancel">CANCEL · ESC</button>' : `<span>1–0 to play · C console · Right-click to inspect</span>`}</div>
      <button class="transmit-button ${shownDamage ? "ready" : ""} ${buffering ? "buffering" : ""} ${v.busy ? "transmitting" : ""}" data-action="transmit" aria-label="${buffering ? `Store · ${p.bufferGain} into the buffer · End turn` : `Transmit · ${p.packetDamage} damage · End turn`}" ${v.busy ? "disabled" : ""}><span class="transmit-dial" aria-hidden="true"></span><span class="transmit-power" aria-hidden="true"><strong>${v.busy ? "· · ·" : buffering ? `+${p.bufferGain}` : p.packetDamage}</strong><small>${v.busy ? "sending" : buffering ? "to buffer" : "damage"}</small></span><span class="transmit-label">${v.busy ? "Transmitting" : buffering ? "Store" : "Transmit"}</span><span class="transmit-shortcut">End turn · <kbd>SPACE</kbd></span></button>
    </div>
    ${ledgerMarkup(r, p)}
    <button class="combat-log" data-action="combat-log" aria-label="Open combat history">${icon("book", 12)} ${esc(r.log[0] || "")} <span>↗</span></button>`;
}

export function handMarkup(run: RunState, selected: number | null) {
  return `${run.hand.length > 6 ? `<button class="hand-scroll hand-scroll-left" data-action="hand-left" aria-label="Previous cards">${icon("back", 18)}</button><button class="hand-scroll hand-scroll-right" data-action="hand-right" aria-label="Next cards">${icon("arrow", 18)}</button>` : ""}<div class="card-fan" data-count="${run.hand.length}" style="--hand-size:${run.hand.length}">${run.hand.map((id: CardId, i) => cardMarkup(id, i, "hand", run, selected === i)).join("")}</div>`;
}

/** Plain-text summary of the next turn for tooltips and the training coach. */
export function nextTurnSummary(p: CombatPreview): string {
  return `${p.nextTurn.energy} energy · ${plural(p.nextTurn.draw, "card")}`;
}
