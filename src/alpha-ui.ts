/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import "./journals.css";
import { CARD_INSIGHTS } from "./card-insights.ts";
import { CARDS, RELICS, RULES, baseCard, canUpgrade, isUpgraded, upgraded, BASE_CARD_IDS } from "./core/cards.ts";
import { DESIGNATIONS, ENEMIES, MESSAGE_OPTIONS, designationRule } from "./core/enemies.ts";
import { addHealth, messageOptionText } from "./core/encounter.ts";
import { ARCHETYPES } from "./core/expedition.ts";
import { enemyStory } from "./story.ts";
import {
  combatPreview, consoleState, FIELD_RULES, INSTALLATION_NAMES, PORTS, conditionOf, intentFor, isWorn, leaderOf, maxConditionOf,
  repairCost, scrubCost, zoneForNode, runningDaemons, daemonLabel,
  type CombatPreview, type CombatTerm, type HostileForecast, type InstallForecast, type PortForecast,
} from "./core/run.ts";
import { hostileLabel } from "./core/combat/board.ts";
import { backpressureRatio, bufferMultiplier } from "./core/combat/resolve.ts";
import { addBreakBonus } from "./core/ascension.ts";
import { frayedLinks } from "./core/terrain.ts";
import { linkKey } from "./core/graph.ts";
import type {
  CardId, DesignationId, Enemy, HostileRole, Installation, InstallationKind, MessageOption, NetworkNode, Port, RelicId, RunState,
} from "./core/types.ts";
import { asset, cardMarkup, esc, icon } from "./ui.ts";
import { INTENT_ICONS, INTENT_NAMES, nextTurnParts } from "./battle-ui.ts";
import { hostilePortrait, relicEmblem, sicon } from "./screens.ts";
import { designationMark } from "./tutorial/icons.ts";
import { HOUSE_COLORS, KEYWORDS, cardHouse, cardKeywords, daemonLine, houseSigil, ownerWords, type CardHouse, type KeywordId } from "./card-marks.ts";
import { channelCss } from "./channel-palette.ts";

/* The field journal: every dialog body a player reads during an expedition.
   Titles name the thing (.panel-head), numbers are Grenze, reading text Alegreya. */

const head = (title: string, sub = "") => `<header class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</header>`;
const plural = (n: number, word: string) => `<b>${n}</b> ${word}${n === 1 ? "" : "s"}`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
const upper = (id: string) => esc(id.toUpperCase());
const pretty = (id: string) => upper(id).replaceAll("::", " ↔ ");
const band = (zone: string) => esc(zone[0].toUpperCase() + zone.slice(1));
/** "PACKET LEECH" and "CROWNFALL" read as names in running text. */
const named = (text: string) => esc(text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()));
const PORT_NAMES: Record<Port, string> = { left: "Left", centre: "Centre", right: "Right" };
const portTag = (port: Port) => `<span class="port-tag" data-port="${port}">${PORT_NAMES[port]}</span>`;
const R = RULES;
const REACH = R.reach.toFixed(1);

/** Engraved diamonds: filled points, then spent ones (hollow). */
function pips(filled: number, total: number, label = `${filled} of ${total}`) {
  const count = Math.max(total, filled);
  return `<span class="pips" role="img" aria-label="${esc(label)}">${Array.from({ length: count }, (_, i) => `<i class="${i < filled ? "is-full" : ""}"></i>`).join("")}</span>`;
}

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
  rack: ["-15 -15 30 30", '<rect x="-10" y="-13" width="20" height="26" rx="1.5"/><path d="M-6-8h12M-6-3h12M-6 2h12M-6 7h12"/><circle cx="-7.5" cy="10.5" r=".9"/>'],
  phantom: ["-15 -15 30 30", '<path d="M-9 12V-2a9 9 0 0 1 18 0v14l-3-3-3 3-3-3-3 3-3-3Z"/><path d="M-4-2h.01M4-2h.01"/>'],
  cable: ["0 0 24 24", '<circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><path d="M6 12c3-5 9 5 12 0"/>'],
  // Installations: a siphon funnel, a dish, a driven spike, an anchor, a charge with its fuse.
  tap: ["-15 -15 30 30", '<path d="M-11-11h22l-8 10v10l-6 4V-1Z"/><path d="M-6-6h12"/>'],
  jammer: ["-15 -15 30 30", '<path d="M-11 4a11 11 0 0 1 16-14"/><path d="M-6 9 6-3"/><circle cx="-6" cy="9" r="2.4"/><path d="M4-12a9 9 0 0 1 8 8M4-7a4 4 0 0 1 3 3"/>'],
  spike: ["-15 -15 30 30", '<path d="M-6-12h12M-3-12v9l3 15 3-15v-9"/><path d="M-9 12h18"/>'],
  anchor: ["-15 -15 30 30", '<circle cy="-10" r="3"/><path d="M0-7v19M-7-3h14M-11 3c1 6 5 9 11 9s10-3 11-9"/>'],
  breaker: ["-15 -15 30 30", '<circle cy="3" r="9"/><path d="M4-5 7-9M7-9c2-2 4-3 6-2"/><path d="M-4 1v4h4"/>'],
};
export function glyph(name: string, size = 18) {
  const [box, path] = GLYPHS[name] ?? GLYPHS.router;
  const stroke = box.startsWith("-15") ? 1.9 : 1.5;
  return `<svg width="${size}" height="${size}" viewBox="${box}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ------------------------------------------------------------------ prepare */

/** A list row's cost gem, ringed in the owner's frame colour for a keeper card (the owner shows in every view). */
const costGem = (id: CardId) => {
  const c = CARDS[id];
  const owner = c.archetype ? ` is-owned" style="--house:${HOUSE_COLORS[c.archetype]}" data-tooltip="${esc(ownerWords(c))}` : "";
  return `<span class="prepare-cost${owner}">${c.unplayable ? icon("close", 14) : c.cost}${c.archetype ? `<span class="visually-hidden"> energy, ${esc(ownerWords(c))}.</span>` : ""}</span>`;
};
export function prepareMarkup(run: RunState) {
  const ready = run.preparedCard, full = run.hand.length >= RULES.handLimit;
  const body = ready
    ? `<div class="prepared-summary inlay"><span class="lit-stone"></span><span class="journal-label">Held for next turn</span><div class="prepare-row is-held">${costGem(ready)}<span><strong>${esc(CARDS[ready].name)}</strong><small>${esc(CARDS[ready].rules)}</small></span></div><button class="plate-button" data-action="release-prepared" ${full ? "disabled" : ""}>Return to hand</button>${full ? '<p class="journal-note">Your hand is full. Play a card first.</p>' : ""}</div>`
    : `<div class="prepare-options">${run.hand.map((id, index) => {
      const junk = CARDS[id].junk || CARDS[id].curse;
      return `<button class="prepare-row inlay${junk ? " is-junk" : ""}" data-prepare-card="${index}" ${junk ? "disabled" : ""}>${costGem(id)}<span><strong>${esc(CARDS[id].name)}</strong><small>${junk ? (CARDS[id].curse ? "Curses cannot be prepared." : "Junk cannot be prepared.") : esc(CARDS[id].rules)}</small></span></button>`;
    }).join("") || '<p class="empty-pile">Your hand is empty.</p>'}</div>`;
  return `${head("Prepare a Card", "Hold one card for next turn at no energy cost. It replaces one normal draw.")}${body}<p class="journal-note">Keep a burst for an ultimate, a protocol for a known cut, a shield for a heavy strike.</p><div class="journal-actions"><button class="plate-button" data-action="close">Back</button></div>`;
}

/* ------------------------------------------------------------------ forecast */

const term = (label: string, amount: number | string, extra = "") =>
  `<div class="calculation-term${typeof amount === "number" && amount < 0 ? " is-negative" : ""}${extra}"><span>${label}</span><i></i><b>${typeof amount === "number" ? signed(amount) : amount}</b></div>`;
/** Terms a running daemon added carry its process mark (the resolver labels them "<Daemon> · …"). */
let daemonNames: string[] = [];
const isDaemonTerm = (label: string) => daemonNames.some(name => label === name || label.startsWith(`${name} `) || label.includes(` · ${name}`) || label.includes(`(${name})`));
const terms = (items: readonly CombatTerm[]) => items.map(t => term(esc(t.label), t.amount, isDaemonTerm(t.label) ? " is-daemon" : "")).join("");
const ledgerHead = (glyphMarkup: string, title: string) => `<h3><span class="ledger-sigil">${glyphMarkup}</span>${title}</h3>`;
function routeTrace(path: string[], label: string, primary: boolean, tail = "") {
  return `<p class="route-trace ${primary ? "is-primary" : "is-secondary"}"><b>${label}</b>${path.map(id => `<span class="route-node">${pretty(id)}</span>`).join('<i aria-hidden="true"></i>')}${tail}</p>`;
}
const hostileAt = (run: RunState, uid: string) => run.enemies.find(enemy => enemy.uid === uid);
const nameOf = (run: RunState, uid: string) => named(hostileAt(run, uid)?.name ?? uid);

/** Deliveries (13.7): one trace per channel with its amount (every one lands on the target), then
 * each port's merged packet and the overflow. Every number is a forecast field; nothing is added up here. */
function deliveriesMarkup(run: RunState, p: CombatPreview) {
  if (!p.deliveries.length) return '<p class="route-trace is-offline"><b>Signal offline</b></p>';
  const traces = p.deliveries.map(delivery => routeTrace(delivery.path, delivery.primary ? "Primary" : `Channel ${delivery.index + 1}`, delivery.primary,
    `<span class="route-port" data-port="${delivery.port}"><small>target</small>${PORT_NAMES[delivery.port]}<b>${delivery.amount}</b></span>`)).join("");
  const lines = PORTS.map(port => {
    const forecast = p.ports[port];
    return forecast ? portLine(run, p, port, forecast) : "";
  }).join("");
  const overflow = PORTS.map(port => {
    const forecast = p.ports[port];
    return forecast?.overflowOut && forecast.overflowTo ? `<p class="overflow-line">${icon("arrow", 15)}<span>overflow <b>${forecast.overflowOut}</b> → ${PORT_NAMES[forecast.overflowTo].toUpperCase()}</span></p>` : "";
  }).join("");
  return `<div class="deliveries-ledger">${traces}${lines ? `<div class="port-totals">${lines}</div>` : ""}${overflow}</div>`;
}
function portLine(run: RunState, p: CombatPreview, port: Port, f: PortForecast) {
  const amounts = p.deliveries.filter(delivery => delivery.port === port).map(delivery => delivery.amount);
  const math = [
    amounts.length ? amounts.map(amount => `<b>${amount}</b>`).join(" + ") : "<b>0</b>",
    amounts.length > 1 ? `= <b>${f.merged}</b>` : "",
    f.bonus ? `+ <b>${f.bonus}</b> bonus` : "",
    `− armor <b>${f.armor}</b>`,
    f.overflowIn ? `+ <b>${f.overflowIn}</b> overflow` : "",
    `= <strong>${f.packet}</strong>`,
  ].filter(Boolean).join(" ");
  const state = p.buffering ? '<em class="is-stored">stored</em>'
    : f.lethal ? `<em class="is-lethal">lethal${p.hostiles.find(hostile => hostile.uid === f.uid)?.note ? ` · ${esc(p.hostiles.find(hostile => hostile.uid === f.uid)!.note!)}` : ""}</em>`
      : f.breakThreshold !== null ? `<em class="${f.breaks ? "is-lethal" : ""}">break ${f.breakThreshold}${f.breaks ? " · breaks" : ""}</em>`
        : `<em>${f.hpBefore} → ${f.hpAfter}</em>`;
  return `<div class="port-total" data-port="${port}">${portTag(port)}<span class="port-total-name">${nameOf(run, f.uid)}</span><span class="port-total-math">${math}</span>${state}</div>`;
}

/** What a hostile's action does to the table, from its forecast targets: "cuts ALPHA ↔ ROUTER1 · plants a Jammer". */
function actionSummary(hostile: HostileForecast) {
  const parts = [
    hostile.cuts.length ? `cuts ${hostile.cuts.map(pretty).join(", ")}` : "",
    hostile.jams.length ? `jams ${hostile.jams.map(pretty).join(", ")}` : "",
    hostile.overload ? `overloads ${pretty(hostile.overload)}` : "",
    ...hostile.installs.map(item => item.absorbed ? `its ${INSTALLATION_NAMES[item.kind]} is absorbed` : item.boosts ? `boosts ${upper(item.boosts)}` : `plants a ${INSTALLATION_NAMES[item.kind]}`),
    hostile.field ? `casts ${FIELD_RULES[hostile.field.kind].name} on ${band(hostile.field.zone)}` : "",
    hostile.decoyed ? `a honeypot decoys ${hostile.decoyed}` : "",
    hostile.absorbed ? `a phantom absorbs ${hostile.absorbed}` : "",
    hostile.cancelled ? `a protocol cancels ${hostile.cancelled}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
/** An intent's name without the forecast's riders: "ENRAGED · SCYTHE SWEEP +2 STAGE THREAT" → "SCYTHE SWEEP". */
const plainLabel = (label: string) => label.replace(/^ENRAGED · /, "").replace(/ \+\d+ (STAGE THREAT|PRESSURE|ASCENSION)/g, "");
const STATE_WORDS: Record<HostileForecast["state"], string> = {
  acts: "", dormant: "dormant this phase", cancelled: "cancelled", spiteful: "resolves anyway", skipped: "skips its action",
};
/** Defenses in a pack (13.7): the shared pool, then each attack in port order with its own
 * firewall and protocol terms and what lands. Labels partition the forecast's flat lists. */
function packDefenses(run: RunState, p: CombatPreview) {
  const labelOf = (hostile: HostileForecast, item: CombatTerm) => {
    const enemy = hostileAt(run, hostile.uid);
    return `${enemy ? hostileLabel(enemy) : hostile.uid} · ${item.label}`;
  };
  const perAttack = new Set(p.hostiles.flatMap(hostile => hostile.shieldTerms.map(item => labelOf(hostile, item))));
  const ownTerms = new Set(p.hostiles.flatMap(hostile => hostile.terms.map(item => labelOf(hostile, item))));
  const pool = p.shieldTerms.filter(item => !perAttack.has(item.label));
  const orphans = p.incomingTerms.filter(item => !ownTerms.has(item.label));
  const attacks = p.hostiles.map(hostile => {
    const intent = hostile.intent;
    const action = intent ? (intent.kind === "dormant" ? "Dormant" : named(plainLabel(intent.label))) : "";
    const quiet = hostile.state !== "acts" && hostile.state !== "spiteful";
    const upcoming = hostile.state === "dormant" && hostile.upcoming ? ` · then ${named(plainLabel(hostile.upcoming.label))}` : "";
    const detail = quiet ? `<p class="attack-note">${STATE_WORDS[hostile.state]}${hostile.state === "cancelled" && !hostile.interrupted ? " · your transmission defeats it" : hostile.interrupted ? " · ultimate broken" : ""}${upcoming}</p>`
      : hostile.terms.length || hostile.shieldTerms.length
        ? `<div class="incoming-sources">${terms(hostile.terms)}${hostile.shieldTerms.map(item => term(esc(item.label), -item.amount, " is-guard")).join("")}</div>`
        : `<p class="attack-note">${actionSummary(hostile) || "no attack"}</p>`;
    const pooled = (hostile as HostileForecast & { pooled?: number }).pooled;
    return `<div class="attack-entry${quiet ? " is-quiet" : ""}${hostile.note ? " is-spiteful" : ""}" data-port="${hostile.port}"><div class="attack-head">${portTag(hostile.port)}<span>${nameOf(run, hostile.uid)}${action ? ` · <i>${action}</i>` : ""}${hostile.note ? ` <em class="attack-spite">${esc(hostile.note)}</em>` : ""}</span>${quiet ? "" : `<b>${hostile.raw}</b>`}</div>${detail}${quiet ? "" : `<p class="attack-lands">${pooled !== undefined ? `pool −${pooled} · ` : ""}lands <b>${hostile.incoming}</b></p>`}</div>`;
  }).join("");
  return `${pool.length ? `<h4 class="ledger-sub">Shared shield pool</h4>${terms(pool)}` : '<p class="ledger-note">No shield in the pool this phase.</p>'}
    <h4 class="ledger-sub">Each attack, in port order</h4><div class="attack-list">${attacks}</div>${orphans.length ? `<h4 class="ledger-sub">Also this phase</h4><div class="incoming-sources">${terms(orphans)}</div>` : ""}`;
}

const INSTALL_SOURCES: Record<NonNullable<InstallForecast["source"]>, string> = {
  intent: "its action", nesting: "Nesting", escalation: "level 3", charge: "its charge", rigged: "Rigged",
};
/** The table front (13.7): installations with pips and next effect, worn devices with their
 * repair cost, each online firewall's quarantine target, and the phase's wear and breakdowns. */
function frontMarkup(run: RunState, p: CombatPreview) {
  const effectText = (id: string) => {
    const effect = p.installationEffects.find(item => item.id === id);
    if (!effect) return "";
    const target = effect.target ? pretty(effect.target) : "";
    const tail = effect.destroyed ? " · destroyed in the act" : "";
    switch (effect.effect) {
      case "jam": return effect.missed ? `its jam on ${target} misses (${esc(effect.missed)})` : !effect.target ? "reaches no device"
        : effect.decoyed ? `your honeypot ${target} decoys its jam and bites${tail}`
          : effect.absorbed ? `jams ${target}: the phantom absorbs it`
            : effect.cancelled ? `Port Security cancels its jam on ${target}${tail}` : `jams ${target}`;
      case "wear": return `wears ${target}`;
      case "tick": return `counts down to ${effect.countdown}`;
      case "detonate": return `detonates · every device within ${REACH} breaks`;
      case "anchor": return `holds the ${band(effect.target ?? "center")} band's hostile fields`;
      case "siphon": return `−${R.malwarePenalty} on your transmission`;
      default: return effect.countdown !== undefined ? `not armed yet · countdown ${effect.countdown}` : "not active until the next hostile action";
    }
  };
  const installations = run.installations.map(item => {
    const hits = p.quarantine.filter(record => record.installationId === item.id)
      .map(record => `${pretty(record.firewallId)} quarantines it −${record.damage}${record.destroys ? " · destroyed" : ""}`);
    const gone = p.destroyed.find(record => record.id === item.id);
    const next = gone ? `destroyed (${esc(gone.cause)})${gone.reclaim ? ` · Reclaim +${gone.reclaim} shield` : ""}` : effectText(item.id);
    return `<li class="front-row"><span class="front-name">${glyph(item.kind, 17)}${esc(INSTALLATION_NAMES[item.kind])}${pips(item.integrity, R.installationIntegrity[item.kind], `${item.integrity} integrity`)}</span><i></i><span class="front-value">${band(zoneForNode(item))}${item.countdown !== undefined ? ` · <b>${item.countdown}</b>` : ""}</span><small>${[...hits, next].filter(Boolean).join(" · ")}</small></li>`;
  });
  const planted = p.installTargets.map(item => {
    const what = item.boosts ? `table full: ${upper(item.boosts)} gains 1 integrity`
      : `planted in ${band(zoneForNode(item))}${item.aim ? ` beside ${pretty(item.aim)}` : ""}${item.destroyed ? " · your honeypot destroys it on arrival" : item.bitten ? " · bitten by your honeypot" : ""}`;
    const why = item.source && item.source !== "intent" ? ` (${INSTALL_SOURCES[item.source]})` : "";
    return `<li class="front-row is-new"><span class="front-name">${glyph(item.kind, 17)}${esc(INSTALLATION_NAMES[item.kind])}${item.integrity ? pips(item.integrity, R.installationIntegrity[item.kind], `${item.integrity} integrity`) : ""}</span><i></i><span class="front-value">new</span><small>${nameOf(run, item.owner)}${why} · ${what}</small></li>`;
  });
  const repair = repairCost(run);
  const worn = run.topology.nodes.filter(isWorn).map(node =>
    `<li class="front-row"><span class="front-name">${glyph(node.role, 17)}${upper(node.id)}${pips(conditionOf(node), maxConditionOf(node), `condition ${conditionOf(node)} of ${maxConditionOf(node)}`)}</span><i></i><span class="front-value">Repair <b>${repair}</b></span><small>worn · repair costs ${repair} energy</small></li>`);
  const wear = p.wear.map(record => `<li class="front-row is-threat"><span class="front-name">${upper(record.nodeId)}</span><i></i><span class="front-value">${record.breaks ? "breaks" : `<b>${record.from}</b> → <b>${record.to}</b>`}</span><small>${esc(record.source)}${record.breaks && p.breakdowns.some(item => item.nodeId === record.nodeId && item.wreck) ? " · wreckage remains" : ""}${record.sheltered ? ` · sheltered by ${upper(record.sheltered)}` : ""}</small></li>`);
  const firewalls = run.topology.nodes.filter(node => node.role === "firewall" && p.online.includes(node.id)).map(node => {
    const records = p.quarantine.filter(record => record.firewallId === node.id);
    const target = records.length ? records.map(record => `${upper(record.installationId)} −${record.damage}${record.destroys ? " · destroyed" : ""}`).join(", ") : `no installation within ${REACH}`;
    return `<li class="front-row"><span class="front-name">${glyph("firewall", 17)}${upper(node.id)}</span><i></i><span class="front-value">${records.length ? "quarantine" : "idle"}</span><small>${node.sentry ? "Sentry · " : ""}${target}</small></li>`;
  });
  const left = [...installations, ...planted];
  const right = [...worn, ...wear, ...firewalls];
  if (!left.length && !right.length) return `<section class="ledger front-ledger is-clear">${ledgerHead(icon("malware", 17), "The Table Front")}<p class="ledger-note">No installation stands, every device is intact and no firewall is online to quarantine.</p></section>`;
  return `<section class="ledger front-ledger">${ledgerHead(icon("malware", 17), "The Table Front")}<div class="front-columns"><div><h4 class="ledger-sub">Installations</h4>${left.length ? `<ul class="front-list is-installations">${left.join("")}</ul>` : '<p class="ledger-note">None stands, and none is planted this phase.</p>'}${p.reclaim ? `<p class="protocol-note">${icon("shield", 15)}<span>Reclaim: <b>+${p.reclaim}</b> shield joins the pool this phase.</span></p>` : ""}</div><div><h4 class="ledger-sub">Your devices</h4>${right.length ? `<ul class="front-list">${right.join("")}</ul>` : '<p class="ledger-note">Every device is intact.</p>'}</div></div></section>`;
}

/** v5 · the phase's evasions (dodges, misses), the curses acting from your hand, and the daemons running. */
function evasionMarkup(run: RunState, p: CombatPreview) {
  const rows = p.evasions.map(item => {
    const who = hostileAt(run, item.by) ? nameOf(run, item.by) : named(INSTALLATION_NAMES[run.installations.find(entry => entry.id === item.by)?.kind ?? "jammer"] ?? item.by);
    return item.kind === "dodge"
      ? `<p class="protocol-note is-evasion">${icon("shield", 15)}<span><b>${esc(item.source)}</b>: ${who}'s ${esc(p.hostiles.find(h => h.uid === item.by)?.intent?.kind ?? "attack")} deals 0.</span></p>`
      : `<p class="protocol-note is-evasion">${icon("link", 15)}<span><b>${esc(item.source)}</b>: ${who}'s ${item.target?.includes("::") ? "cut" : "jam"}${item.target ? ` on ${pretty(item.target)}` : ""} misses.</span></p>`;
  });
  const nulls = p.hostiles.filter(h => h.nullified).map(h => `<p class="protocol-note is-evasion">${icon("protocol", 15)}<span><b>${esc(h.nullified!)}</b>: ${nameOf(run, h.uid)}'s ${esc(h.intent?.kind ?? "attack")} is cancelled; its riders still resolve.</span></p>`);
  return [...rows, ...nulls].join("");
}
function handEffectsMarkup(p: CombatPreview) {
  if (!p.handEffects.length) return "";
  return `<h4 class="ledger-sub">Curses in your hand at the end of the turn</h4>${p.handEffects.map(effect => `<p class="danger-note is-omen">${icon("warning", 15)}<span><b>${esc(effect.name)}${effect.count > 1 ? ` ×${effect.count}` : ""}</b>: ${[effect.integrity ? `−${effect.integrity} integrity, unblockable` : "", effect.wear.length ? `wears ${effect.wear.map(pretty).join(", ")} in the table-front step` : ""].filter(Boolean).join("; ") || "no effect this turn"}.</span></p>`).join("")}`;
}
function daemonsMarkup(run: RunState) {
  const running = runningDaemons(run);
  if (!running.length) return "";
  return `<section class="ledger daemon-ledger">${ledgerHead(icon("console", 17), "Running Daemons")}<ul class="front-list">${running.map(daemon => `<li class="front-row"><span class="front-name">${esc(daemon.card.name)}${daemon.count > 1 ? ` <b class="daemon-count">×${daemon.count}</b>` : ""}</span><i></i><span class="front-value">running</span><small>${esc(daemonLine(daemon.card))}</small></li>`).join("")}</ul><p class="ledger-note">Daemons run until the encounter ends; copies stack. Their terms in this forecast carry the process mark.</p></section>`;
}

export function combatDetailsMarkup(run: RunState) {
  const p = combatPreview(run), c = consoleState(run);
  daemonNames = runningDaemons(run).flatMap(daemon => [daemonLabel(daemon), daemon.card.name]);
  const pack = p.hostiles.length > 1;
  const engineName = run.archetype === "ghost" ? "Buffer" : run.archetype === "warden" ? "Backpressure" : "Bandwidth";
  const perChannel = run.relics.includes("parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel;
  const engine = run.archetype === "ghost"
    ? `${term("Buffer stored", run.buffer)}${p.buffering ? term(`Buffering this turn (×${bufferMultiplier(run).value}${bufferMultiplier(run).label ? ` · ${esc(bufferMultiplier(run).label!)}` : ""})`, p.bufferGain) : p.bufferRelease ? term("Released this turn", p.bufferRelease) : ""}${p.bufferAtRisk && (run.buffer || p.buffering) ? `<p class="danger-note">${icon("warning", 15)} After this enemy action you would have no live route: the buffer would be lost at the start of your turn.</p>` : ""}`
    : run.archetype === "warden"
      ? `${term("Backpressure in this transmission", run.backpressure)}${term(`Stored for next turn (${Math.round(backpressureRatio(run).value * 100)}% of prevented${backpressureRatio(run).label ? ` · ${esc(backpressureRatio(run).label!)}` : ""})`, p.backpressureGain)}`
      : `${term("Live routes", String(p.routeCount))}${term("Channels (routes through one device count once)", String(p.channels))}`;
  const spite = p.hostiles.some(hostile => hostile.state === "spiteful");
  const outcome = p.lethal && spite ? `Your transmission defeats ${pack ? "every hostile" : "the hostile"}, but a Spiteful action resolves anyway.`
    : p.lethal ? `Your transmission defeats ${pack ? "every hostile" : "the hostile"}, so no enemy action resolves.`
    : p.enemyDefeatedByTraps ? "Your traps defeat the last hostile as it moves; the rest of the phase is cancelled."
    : p.faultTarget ? `Next fault: ${pretty(p.faultTarget)}. It lasts for your next player turn.`
    : "Shields reduce damage to a minimum of zero.";
  const living = run.enemies.filter(enemy => enemy.hp > 0);
  const threat = [
    ...p.hostiles.filter(hostile => hostile.field).map(hostile => `<p>${pack ? `${PORT_NAMES[hostile.port]} · ${nameOf(run, hostile.uid)}: ` : ""}Next field <strong>${FIELD_RULES[hostile.field!.kind].name} · ${band(hostile.field!.zone)}</strong> for ${hostile.field!.turns} turns, starting next turn${hostile.fieldReplaced ? ", replaced by a later caster on the same band" : ""}. Cleanse it, protect the band, or relocate exposed devices before it deals damage.</p>`),
    !p.zoneThreat && p.hazardZone ? `<p>Threatened band: <strong>${band(p.hazardZone)}</strong>. Deploy elsewhere or spend ${RULES.relocateCost} energy to relocate an installed device.</p>` : "",
    ...p.hostiles.filter(hostile => hostile.junk).map(hostile => `<p><strong>${hostile.junk!.count} ${esc(CARDS[hostile.junk!.card].name)}</strong> will be shuffled into your draw pile${pack ? ` by ${nameOf(run, hostile.uid)}` : ""}.</p>`),
    ...p.hostiles.filter(hostile => hostile.heal).map(hostile => `<p>${nameOf(run, hostile.uid)} restores <strong>${hostile.heal} integrity</strong> after it acts.</p>`),
    ...p.hostiles.filter(hostile => hostile.frays.length).map(hostile => `<p>${nameOf(run, hostile.uid)}'s cut also frays <strong>${hostile.frays.map(pretty).join(", ")}</strong> for one turn (level 1).</p>`),
    p.arrivals ? `<p class="is-warning">${icon("warning", 15)}<span>${p.arrivals.shed ? "SHEDDING" : "SIGNAL DETECTED"} · <strong>${named(ENEMIES[p.arrivals.enemyId]?.name ?? p.arrivals.enemyId)}</strong> ${p.arrivals.inPhases <= 1 ? "arrives after this action" : `arrives in ${p.arrivals.inPhases} actions`}${p.arrivals.port ? ` at the ${PORT_NAMES[p.arrivals.port].toLowerCase()} port` : ""}.</span></p>` : "",
    p.risingAdds.length ? `<p class="is-warning">${icon("boss", 15)}<span>The charge raises ${p.risingAdds.map(add => `<strong>${named(ENEMIES[add.enemyId]?.name ?? add.enemyId)}</strong> at the ${PORT_NAMES[add.port].toLowerCase()} port`).join(" and ")} at the end of this phase; each one alive raises the break.</span></p>` : "",
    p.signal ? `<p class="is-warning">${icon("bolt", 15)}<span>${esc(p.signal.text)}</span></p>` : "",
  ].join("");
  const traits = pack
    ? living.filter((enemy, i) => living.findIndex(other => other.id === enemy.id) === i).map(enemy => `<p><strong>${named(enemy.name)}</strong> · ${esc(ENEMIES[enemy.id]?.trait ?? "")}</p>`).join("")
    : `<p>${esc(p.traitDescription)}</p>`;
  const leader = leaderOf(run);
  const sub = `Turn ${run.turn}${leader ? ` · ${named(leader.name)}` : ""}${pack ? ` and ${living.length - 1} more` : ""}`;
  const defenses = pack
    ? `${term("Incoming before shields", String(p.incomingRaw))}${packDefenses(run, p)}`
    : `${term("Incoming before shields", String(p.incomingRaw))}${p.incomingTerms.length ? `<div class="incoming-sources">${terms(p.incomingTerms)}</div>` : ""}${terms(p.shieldTerms)}`;
  return `${head("Forecast", sub)}
    <div class="calculation-grid"><section class="ledger">${ledgerHead(icon("bolt", 17), "Signal Damage")}${terms(p.damageTerms)}${!p.signalPath.length ? '<p class="ledger-note">No live ALPHA → router → OMEGA route. Route bonuses cannot activate.</p>' : ""}<div class="calculation-total"><span>${p.buffering ? "Stored in the buffer" : pack ? "Damage to hostiles" : "Damage to hostile"}</span><strong>${p.buffering ? `+${p.bufferGain}` : p.packetDamage}</strong></div>${p.enemyDamage ? term("Traps during the enemy phase", p.enemyDamage, " trap-term") : ""}<h4 class="ledger-sub">Deliveries</h4>${deliveriesMarkup(run, p)}<p class="ledger-note">Your <b>primary route</b> is the strongest live route; only its devices add route damage. Every device carries one channel: routes through the same device are one <b>channel</b>. Every other channel delivers +${perChannel} bandwidth. Every channel lands on your <b>target</b> as one packet, so its armor is paid once; what a kill does not need <b>overflows</b> to the next hostile.</p></section>
    <section class="ledger">${ledgerHead(icon("shield", 17), "Defenses")}${defenses}${term("Total prevented", String(Math.min(p.incomingRaw, p.shield)))}<div class="calculation-total ${p.incoming ? "danger" : "safe"}"><span>Integrity lost</span><strong>${p.incoming}</strong></div>${p.protocolTriggers.map(t => `<p class="protocol-note">${icon("trigger", 15)} <span><b>${esc(t.name)}</b> fires: ${esc(t.effect)}</span></p>`).join("")}${evasionMarkup(run, p)}${handEffectsMarkup(p)}${p.blockCarried?.amount ? `<p class="protocol-note">${icon("shield", 15)}<span><b>${esc(p.blockCarried.by)}</b>: ${p.blockCarried.amount} block survives the enemy phase.</span></p>` : ""}<p class="ledger-note">${outcome}</p></section></div>
    ${daemonsMarkup(run)}
    ${frontMarkup(run, p)}
    <div class="calculation-grid v3-grid"><section class="ledger">${ledgerHead(icon("console", 17), esc(c.name === engineName ? c.name : `${c.name} · ${engineName}`))}${engine}<p class="ledger-note">${esc(c.rules)}</p></section>
    <section class="ledger">${ledgerHead(icon("next", 17), "Next Turn")}${nextTurnTerms(run, p)}${run.installations.length ? `<p class="danger-note">${icon("malware", 15)} <span>${run.installations.length} installation${run.installations.length === 1 ? "" : "s"} on the table. Scrub for ${scrubCost(run)} energy per integrity point.</span></p>` : ""}${p.clusters.length ? `<p class="protocol-note">${icon("cluster", 15)} <span>Clusters: ${p.clusters.map(band).join(", ")} (+${RULES.clusterDamage} each).</span></p>` : ""}<p class="ledger-note">Evaluated on the table as the enemy phase leaves it: a jam, a cut or a breakdown can take a PoE Injector or Cache Server offline before your turn starts.</p></section></div>
    <div class="trait-explanation inlay"><h4>${icon("eye", 16)} ${pack ? "Hostile Traits" : "Hostile Trait"}</h4>${traits}${threat}</div>
    <ol class="turn-sequence" aria-label="Order of resolution"><li><b>1</b>Your signal, per port</li><li><b>2</b>Traps &amp; quarantine</li><li><b>3</b>Hostiles act in port order</li><li><b>4</b>Installations act</li><li><b>5</b>Recharge &amp; draw</li></ol>
    <div class="journal-actions"><button class="plate-button" data-action="close">Back</button></div>`;
}

/** Next turn's energy, draw and block, each with its sources. */
function nextTurnTerms(run: RunState, p: CombatPreview) {
  const next = nextTurnParts(run, p);
  const row = (label: string, total: number, parts: string[]) => `${term(label, String(total))}${parts.length > 1 ? `<p class="term-parts">${esc(parts.join(" · "))}</p>` : ""}`;
  return `${row("Energy", next.energy.total, next.energy.parts)}${row("Cards drawn", next.draw.total, next.draw.parts)}${next.block.total ? row("Block", next.block.total, next.block.parts) : ""}`;
}

/* ------------------------------------------------------------------ offers: messages and crate cards */

/** The dialog class for an offer: the painted frame without its close stud (13.6). */
export const OFFER_DIALOG_CLASS = "offer-dialog";
export function offerKind(run: RunState): "message" | "crate-card" | null {
  return run.offers?.[0]?.kind ?? null;
}
function optionName(option: MessageOption) {
  return option.id === "credit" && option.amount !== undefined ? `${MESSAGE_OPTIONS.credit.name} · ${option.amount}` : MESSAGE_OPTIONS[option.id].name;
}
/** The oldest waiting offer as a journal page: an undelivered message (two named choices, three
 * with Bill of Lading) or a crate's two named cards. Keys 1–3 press `data-offer` 0–2. */
export function offerDialogMarkup(run: RunState): string {
  const offer = run.offers?.[0];
  if (!offer) return "";
  const waiting = run.offers.length - 1;
  const queue = waiting ? `<p class="offer-queue">${plural(waiting, "more offer")} waiting</p>` : "";
  if (offer.kind === "message") {
    const rows = offer.options.map((option, i) => {
      const name = optionName(option), text = messageOptionText(option);
      return `<button class="offer-row inlay" data-offer="${i}" aria-label="${i + 1}: ${esc(name)}. ${esc(text)}"><span class="offer-stone" aria-hidden="true"></span><span class="offer-copy"><strong>${esc(name)}</strong><small>${esc(text)}</small></span><kbd aria-hidden="true">${i + 1}</kbd></button>`;
    }).join("");
    return `<div class="offer-page is-message">${head("An Undelivered Message", esc(offer.sender))}<blockquote class="offer-fragment">${esc(offer.text)}</blockquote><div class="offer-plate is-message" style="--offer-art:url('${asset("art/message-fragment.png")}')"><div class="offer-options" role="group" aria-label="Answer the message">${rows}</div></div>${queue}</div>`;
  }
  const cards = offer.cards.map((id, i) => `<div class="offer-card">${cardMarkup(id, i, "collection")
    .replace(/ data-collection="[^"]*"/, ` data-offer="${i}"`)
    .replace(' aria-label="', ` aria-label="${i + 1}: `)}<kbd aria-hidden="true">${i + 1}</kbd></div>`).join("");
  return `<div class="offer-page is-crate">${head("A Crate Opens", "Choose one card for this encounter. It exhausts when played.")}<div class="offer-plate is-crate"><span class="offer-crate-art" style="--offer-art:url('${asset("art/crate.png")}')" aria-hidden="true"></span><div class="offer-cards" role="group" aria-label="Choose a card">${cards}</div></div>${queue}</div>`;
}

/* ------------------------------------------------------------------ card inspect */

const TARGET_COPY: Record<string, string> = {
  ground: "Free table socket", link: "Two devices", node: "A valid device", instant: "Immediate",
  zone: "North, Center or South", protocol: "Armed until it fires", daemon: "Starts a process", junk: "Clutter · delete or endure",
};
/** The inspect view's glossary: every keyword and kind the card carries, from its flags. */
function keywordRows(c: (typeof CARDS)[CardId]): string {
  const ids: KeywordId[] = [
    ...(c.target === "daemon" ? ["daemon" as const] : []),
    ...(c.curse ? ["curse" as const] : []),
    ...(c.unplayable ? ["unplayable" as const] : []),
    ...cardKeywords(c),
  ];
  if (!ids.length) return "";
  return `<dl class="inspect-keywords">${ids.map(id => `<div class="kw-${id}"><dt>${KEYWORDS[id].name}</dt><dd>${esc(KEYWORDS[id].rule)}</dd></div>`).join("")}</dl>`;
}
/** A card without its own insight reads its kind's. */
function insightFor(id: CardId): string {
  const c = CARDS[id], own = CARD_INSIGHTS[baseCard(id)];
  if (own) return own;
  if (c.curse) return "A curse: it clogs your draws for as long as it stays. A Sanctuary or a Market removes it, even when your deck is at its floor.";
  if (c.token) return "Made for this encounter only. Play it while it is in your hand: it exhausts and never enters your deck.";
  if (c.target === "daemon") return "A daemon pays off the longer the encounter runs: start it early. It keeps running after a reshuffle and stacks with its copies.";
  if (c.protocol) return "Arm it the turn before the matching hostile action; the forecast counts it as soon as it is armed.";
  return "Hardware stays for the encounter. Temporary shield and burst expire after transmission.";
}
const rarityName = (id: CardId) => CARDS[id].rarity === "special" ? (CARDS[id].curse ? "Curse" : "Junk") : CARDS[id].rarity[0].toUpperCase() + CARDS[id].rarity.slice(1);
const fact = (label: string, value: string | number) => `<div><dt>${label}</dt><i></i><dd>${value}</dd></div>`;
/** `from` is the library the player came from; Back returns there. */
export function inspectMarkup(id: CardId, run: RunState, from: LibraryMode | null = null) {
  const c = CARDS[id], base = baseCard(id);
  const other = canUpgrade(id) ? upgraded(id) : isUpgraded(id) ? base : null;
  const owned = run.deck.filter(x => x === id).length;
  const house = cardHouse(c);
  const kind = [rarityName(id), c.target === "daemon" ? "Daemon" : named(c.subtitle.split(" / ").at(-1) ?? ""), c.archetype ? `${esc(ARCHETYPES[c.archetype].name)} only` : c.curse || c.junk || c.token ? "" : "Colorless"].filter(Boolean).join(" · ");
  const after = c.protocol ? "Armed · discard when it fires" : c.target === "daemon" ? "Runs until the encounter ends" : c.token ? "Exhausts · never enters your deck" : c.junk ? "Removed after the encounter" : c.curse ? "Stays in your deck" : c.exhaust ? "Exhaust until next encounter" : c.retain ? "Discard · Retain keeps it in hand" : "Discard, then reshuffle";
  const detail = c.detail ? `<div class="inspect-detail inlay"><span class="journal-label">Details</span><p>${esc(c.detail)}</p></div>` : "";
  return `<div class="card-inspect house-${house}"><div class="inspect-card">${cardMarkup(id, 0, "collection")}</div><section class="inspect-body"><header class="inspect-head"><h2>${esc(c.name)}</h2><p class="inspect-kind">${kind}</p></header><p class="inspect-rules">${esc(c.rules)}</p>${keywordRows(c)}${detail}<dl class="inspect-facts">${fact("Energy", c.unplayable ? "Unplayable" : c.cost)}${fact("Target", c.curse ? "None · it cannot be played" : TARGET_COPY[c.target] ?? esc(c.target))}${fact("After playing", after)}${from === "collection" ? "" : fact("In your deck", owned)}</dl>${other ? `<div class="upgrade-compare inlay ${isUpgraded(id) ? "is-base" : ""}"><span class="journal-label">${isUpgraded(id) ? "Before the upgrade" : "Upgraded"}</span><div class="prepare-row">${costGem(other)}<span><strong>${esc(CARDS[other].name)}</strong><small>${esc(CARDS[other].rules)}</small></span></div></div>` : ""}<div class="synergy-note"><span class="journal-label">Synergy</span><p>${esc(insightFor(id))}</p></div><div class="journal-actions"><button class="plate-button" data-action="${from ? "inspect-back" : "close"}">Back</button></div></section></div>`;
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
    collection: `${plural(BASE_CARD_IDS.length, "card")} by keeper, most with an upgraded (+) form`,
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
  const tile = ([id, n]: [CardId, number], i: number) => `<div class="collection-entry${n > 1 ? " is-stacked" : ""}">${cardMarkup(id, i, "collection")}${n > 1 && mode !== "collection" ? `<span class="pile-count" aria-label="${n} copies">×${n}</span>` : ""}</div>`;
  if (mode !== "collection" || !entries.length)
    return `${head(LIBRARY_TITLES[mode], sub)}${toolbar}<div class="collection-body"><div class="collection-grid">${entries.map(tile).join("") || `<p class="empty-pile">${empty}</p>`}</div></div>`;
  // The archive (v5) lists every card by house: each keeper's cards, the shared colorless pool,
  // then the curses and the encounter clutter. Within a house: rarity, then name.
  const sections = ARCHIVE_HOUSES.map(({ houses, title }) => {
    const own = entries.filter(([id]) => houses.includes(cardHouse(CARDS[id])))
      .sort(([a], [b]) => RARITY_ORDER.indexOf(CARDS[a].rarity) - RARITY_ORDER.indexOf(CARDS[b].rarity) || CARDS[a].name.localeCompare(CARDS[b].name));
    if (!own.length) return "";
    const house = houses[0];
    return `<section class="archive-house house-${house}" style="--house:${HOUSE_COLOR_OF(house)}" aria-label="${esc(`${title}, ${own.length} card${own.length === 1 ? "" : "s"}`)}"><h3 class="archive-house-head"><i class="house-seal" aria-hidden="true">${houseSigil(house, 22)}</i><span>${esc(title)}</span><b>${own.length}</b></h3><div class="collection-grid">${own.map(tile).join("")}</div></section>`;
  }).join("");
  return `${head(LIBRARY_TITLES[mode], sub)}${toolbar}<div class="collection-body is-sectioned">${sections}</div>`;
}
const RARITY_ORDER = ["basic", "common", "uncommon", "rare", "legendary", "special"];
const ARCHIVE_HOUSES: { houses: CardHouse[]; title: string }[] = [
  { houses: ["architect"], title: "The Architect" },
  { houses: ["warden"], title: "The Warden" },
  { houses: ["ghost"], title: "The Ghost" },
  { houses: ["colorless"], title: "Colorless" },
  { houses: ["curse"], title: "Curses" },
  { houses: ["junk", "token"], title: "Junk & Tokens" },
];
const HOUSE_COLOR_OF = (house: CardHouse) => HOUSE_COLORS[house];

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
const hostileNames = (run: RunState) => run.enemies.map(enemy => enemy.name);
function turnsOf(run: RunState) {
  const names = hostileNames(run);
  const start = run.log.findIndex(line => START.test(line));
  const current = (start < 0 ? run.log : run.log.slice(0, start + 1)).slice().reverse();
  const answer = (line: string) => names.some(name => line.startsWith(name)) || /^(Traps dealt|Protocols fired|Enemy phase)/.test(line);
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
  const enemy = leaderOf(run)?.name ?? "";
  const names = hostileNames(run);
  const entry = (line: string) => {
    const speaker = START.test(line) ? "" : names.find(name => line.startsWith(name)) ?? "";
    const kind = TRANSMISSION.test(line) ? "is-signal" : START.test(line) ? "is-start" : speaker ? "is-hostile" : "";
    const mark = kind === "is-signal" ? icon("bolt", 14) : kind === "is-hostile" ? icon("sword", 14) : kind === "is-start" ? icon("eye", 14) : "";
    const text = speaker ? named(speaker) + esc(line.slice(speaker.length)) : esc(line);
    return `<li class="log-entry ${kind}"><span class="log-mark">${mark}</span><span>${text}</span></li>`;
  };
  const rows = turnsOf(run).map(t => `<li class="log-turn"><span>${t.label}</span></li>${t.lines.map(entry).join("")}`).join("");
  return `${head("Combat Log", enemy ? `${named(enemy)} · Turn ${run.turn}` : "")}<ol class="history-list">${rows}</ol><section class="journal-section"><h3 class="journal-head">Relics</h3><div class="relic-ledger is-compact">${run.relics.map(relicRow).join("")}</div></section>`;
}

/* ------------------------------------------------------------------ enemy dossier */

const ROLE_WORDS: Record<HostileRole, string> = { single: "Hostile", leader: "Leader", escort: "Escort", add: "Guardian add" };
const roleWord = (enemy: Enemy) => ENEMIES[enemy.id]?.boss ? "Guardian" : ROLE_WORDS[enemy.role];
function cadence(enemy: Enemy) {
  if (enemy.role !== "escort") return "acts every phase";
  return enemy.cadence === "even" ? "acts on even phases" : "acts on odd phases";
}
/** Level rules of section 6.1, cumulative; stage III plants a Jammer where I–II plant a Tap. */
function levelRules(stage: number): string[] {
  return [
    `A cut also frays the next primary-route cable for one turn (−${R.frayedCableDamage}; armored cables are immune). A jam lasts two player turns.`,
    "A jam hits two devices and a cut two cables. Hostile fields last one more turn.",
    `Strikes and breaches +1 more. The first action of every pattern cycle also plants ${stage >= 2 ? "a Jammer" : "a Siphon Tap"}.`,
  ];
}
function ribbon(id: DesignationId) {
  const d = DESIGNATIONS[id];
  return `<span class="dossier-ribbon ${d.kind}">${designationMark(d.kind, 13)}${esc(d.ribbon)}</span>`;
}
function designationsMarkup(run: RunState, enemy: Enemy) {
  const ids = enemy.designations ?? [];
  if (enemy.designationHidden) return `<span class="dossier-designation is-unknown"><span class="dossier-ribbon unknown">${designationMark("unknown", 13)}UNKNOWN</span><span>Revealed at the entrance line.</span></span>`;
  return ids.map(id => `<span class="dossier-designation ${DESIGNATIONS[id].kind}">${ribbon(id)}<span>${esc(designationRule(id, run.stage))}${id === "spiteful" ? " The forecast prints “resolves anyway”." : ""}</span></span>`).join("");
}
function crateLine(enemy: Enemy) {
  return enemy.crate ? `<span class="dossier-crate">${sicon("crate", 16)}<span>Carries something: a sealed crate, opened when it falls.</span></span>` : "";
}
function patternMarkup(run: RunState, enemy: Enemy) {
  const definition = ENEMIES[enemy.id];
  const pattern = definition.pattern;
  const now = enemy.role === "add" ? Math.min(enemy.turn, pattern.length - 1) : enemy.turn % pattern.length;
  const intent = intentFor(run, enemy);
  const dormant = intent.kind === "dormant";
  return pattern.map(({ kind, field, ultimate, junk, install, label }, i) => {
    const lit = i === now && !dormant;
    return `<li class="intent-step inlay${lit ? " is-lit" : ""}${ultimate ? " is-ultimate" : ""}"${lit ? ' aria-current="step"' : ""}>${lit ? '<span class="lit-stone"></span>' : ""}<b>${i + 1}</b><span class="intent-glyph">${icon(INTENT_ICONS[kind], 20)}</span><span class="intent-name">${ultimate || install || enemy.role !== "single" && enemy.role !== "leader" ? named(label) : esc(INTENT_NAMES[kind])}</span>${ultimate ? "<small>Ultimate</small>" : ""}${install && INSTALLATION_NAMES[install].toUpperCase() !== label ? `<small>${esc(INSTALLATION_NAMES[install])}</small>` : ""}${field ? `<small>+ ${FIELD_RULES[field].name}</small>` : ""}${junk ? `<small>+ ${junk.count} ${esc(CARDS[junk.card].name)}</small>` : ""}</li>`;
  }).join("");
}
function escalationMarkup(run: RunState, enemy: Enemy, forecast: HostileForecast | undefined) {
  if (enemy.role !== "leader" && enemy.role !== "single") return "";
  const late = run.stage >= 2;
  const start = late ? R.escalationStartLate : R.escalationStart, every = late ? R.escalationEveryLate : R.escalationEvery;
  const sooner = enemy.designations?.includes("stoked") ? (late ? R.stokedAdvanceLate : R.stokedAdvance) : 0;
  const level = forecast?.escalation ?? 0;
  const rows = levelRules(run.stage).map((rule, i) => {
    const reached = level > i;
    return `<li class="level-row${reached ? " is-reached" : ""}"><span class="level-pip" aria-hidden="true"></span><b>Level ${i + 1}</b><small>from its action ${Math.max(1, start + i * every - sooner)}</small><p>${esc(rule)}</p></li>`;
  }).join("");
  const next = forecast?.nextLevel;
  return `<section class="journal-section"><h3 class="journal-head">Escalation</h3><p class="dossier-counter">Its own actions so far: <b class="numeral">${enemy.turn}</b>${sooner ? ` · Stoked: every level ${sooner} action${sooner === 1 ? "" : "s"} sooner` : ""}${enemy.surge ? ` · SURGE +${enemy.surge}` : ""}. Levels add disruption, cumulatively; escorts and adds never climb.</p><ol class="level-list">${rows}</ol>${next ? `<p class="danger-note">${icon("warning", 15)}<span>Level ${next.level} in ${next.inActions} action${next.inActions === 1 ? "" : "s"}: ${esc(next.rule)}</span></p>` : ""}</section>`;
}
function addsMarkup(run: RunState, guardian: Enemy) {
  const adds = Object.values(ENEMIES).filter(definition => definition.addOf === guardian.id);
  if (!adds.length) return "";
  const bonus = addBreakBonus(run.ascension);
  return `<section class="journal-section"><h3 class="journal-head">Its Adds</h3><p class="dossier-counter">Its charge raises two at the outer ports. They act every phase, carry no crate and never escalate; each one alive when the ultimate resolves adds ${bonus} to the break.</p><div class="dossier-adds">${adds.map(add => `<div class="dossier-add inlay">${hostilePortrait(add.id, "dossier-portrait")}<span class="dossier-add-copy"><strong>${named(add.name)}</strong><span class="dossier-role">Add · health <b>${addHealth(run, add.id)}</b></span><span>${add.pattern.map(step => named(step.label)).join(" → ")}</span><small>${esc(add.trait)}</small></span></div>`).join("")}</div></section>`;
}
/** One rail row: port, portrait, name, role and cadence, trait, designations, crate, health. */
function railRow(run: RunState, enemy: Enemy, forecast: HostileForecast | undefined, selected: boolean) {
  const definition = ENEMIES[enemy.id];
  const intent = forecast?.intent;
  const upcoming = forecast?.upcoming;
  const next = !intent ? "" : intent.kind === "dormant" ? `Dormant this phase${upcoming ? ` · then ${named(plainLabel(upcoming.label))}${upcoming.amount ? ` <b>${upcoming.amount}</b>` : ""}` : ""}`
    : `Next: ${named(plainLabel(intent.label))}${forecast?.raw ? ` <b>${forecast.raw}</b>` : ""}${forecast?.note ? ` · ${esc(forecast.note)}` : ""}`;
  return `<button class="dossier-port inlay${selected ? " is-lit" : ""}" data-dossier-port="${enemy.port}" aria-pressed="${selected}">${selected ? '<span class="lit-stone"></span>' : ""}${portTag(enemy.port)}${hostilePortrait(enemy.id, "dossier-portrait")}<span class="dossier-port-copy"><strong>${named(enemy.name)}</strong><span class="dossier-role">${roleWord(enemy)} · ${cadence(enemy)}</span>${next ? `<span class="dossier-next${intent?.kind === "dormant" ? " is-dormant" : ""}">${next}</span>` : ""}${selected
    ? `${(enemy.designations ?? []).length ? `<span class="dossier-ribbons">${(enemy.designations ?? []).map(ribbon).join("")}</span>` : ""}`
    : `<span class="dossier-trait"><b>${esc(definition.badge)}</b> ${esc(definition.trait)}</span>${designationsMarkup(run, enemy)}`}${crateLine(enemy)}</span><span class="dossier-health"><span><b>${enemy.hp}</b>/${enemy.maxHp}</span><small>health</small></span></button>`;
}
function arrivalRow(run: RunState, p: CombatPreview, port: Port) {
  const arrival = p.arrivals ?? (run.reinforcement && !run.reinforcement.shed && run.reinforcement.after > 0
    ? { kind: "reinforcement" as const, enemyId: run.reinforcement.enemyId, port: null, inPhases: run.reinforcement.after } : null);
  if (!arrival) return "";
  const definition = ENEMIES[arrival.enemyId];
  if (!definition) return "";
  return `<div class="dossier-port inlay is-arrival">${portTag(arrival.port ?? port)}${hostilePortrait(arrival.enemyId, "dossier-portrait")}<span class="dossier-port-copy"><strong>${named(definition.name)}</strong><span class="dossier-role">Reinforcement · ${arrival.inPhases <= 1 ? "arrives after this action" : `arrives in ${arrival.inPhases} actions`}</span><span class="dossier-trait"><b>${esc(definition.badge)}</b> ${esc(definition.trait)}</span><span class="dossier-crate">${sicon("crate", 16)}<span>Carries something: a sealed crate.</span></span></span><span class="dossier-health">${run.reinforcement?.enemyId === arrival.enemyId ? `<span><b>${run.reinforcement.hp}</b></span><small>health</small>` : ""}</span></div>`;
}
/** The field journal for the encounter: the rail (every hostile with port, role, trait,
 * designations and crate, and the announced arrival), then one hostile's folio. `port`
 * picks the folio (the HUD's selected port); default: the leader. */
export function enemyDossierMarkup(run: RunState, port?: Port) {
  const living = run.enemies.filter(enemy => enemy.hp > 0);
  const leader = leaderOf(run);
  const chosen = (port && living.find(enemy => enemy.port === port)) || leader || living[0];
  const story = chosen ? enemyStory(chosen.id) : null;
  if (!story || !chosen) return `${head("Field Journal", "No hostile on the grid.")}<div class="journal-actions"><button class="plate-button" data-action="help">${icon("book", 16)} Handbook</button></div>`;
  const forecast = combatPreview(run);
  const hostileForecast = (enemy: Enemy) => forecast.hostiles.find(item => item.uid === enemy.uid);
  const definition = ENEMIES[chosen.id];
  const mine = hostileForecast(chosen);
  const intent = mine?.intent ?? null;
  const telegraph = intent ? story.telegraphs[intent.kind] ?? "" : "";
  const empty = PORTS.find(item => !living.some(enemy => enemy.port === item) && item !== "centre") ?? "left";
  const arrival = arrivalRow(run, forecast, empty);
  const pack = living.length > 1 || !!arrival;
  const railNote = [
    "Hostiles act left, centre, right.",
    living.some(enemy => enemy.role === "escort") || arrival ? "Escorts alternate phases and never escalate; the leader is the clock." : "",
    living.some(enemy => enemy.role === "add") ? "Adds act every phase and never escalate; each one alive raises the break." : "",
  ].filter(Boolean).join(" ");
  const rail = pack
    ? `<section class="journal-section dossier-rail"><h3 class="journal-head">The Rail</h3><div class="dossier-ports">${[...living].sort((a, b) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port)).map(enemy => railRow(run, enemy, hostileForecast(enemy), enemy === chosen)).join("")}${arrival}</div><p class="journal-note">${railNote}</p></section>`
    : "";
  const headMarkup = pack
    ? head("Field Journal", `${living.length} hostile${living.length === 1 ? "" : "s"} on the rail · Turn ${run.turn}`)
    : head(esc(story.name), `<span class="dossier-title">${esc(story.title)}</span>`);
  const folioHead = pack
    ? `<header class="folio-head">${hostilePortrait(chosen.id, "folio-portrait")}<span><strong>${esc(story.name)}</strong><em>${esc(story.title)}</em><small>${PORT_NAMES[chosen.port]} port · ${roleWord(chosen)} · ${cadence(chosen)}</small></span></header>`
    : "";
  const designations = designationsMarkup(run, chosen);
  const dormantNote = chosen.role === "escort" ? `<p class="journal-note">It ${cadence(chosen)} and is dormant on the others; its pattern advances only when it acts.</p>` : chosen.role === "add" ? '<p class="journal-note">Its first step is its ultimate-turn action; afterwards it repeats its last step every phase.</p>' : "";
  return `${headMarkup}${rail}<article class="dossier-folio">${folioHead}<p class="dossier-motive">${esc(story.motive)}</p>
    ${designations || (!pack && chosen.crate) ? `<section class="journal-section"><h3 class="journal-head">${designations ? "Designation" : "Cargo"}</h3>${designations}${pack ? "" : crateLine(chosen)}</section>` : ""}
    <section class="journal-section"><h3 class="journal-head">Pattern</h3><ol class="enemy-pattern">${patternMarkup(run, chosen)}</ol>${telegraph ? `<p class="enemy-telegraph">${esc(telegraph)}</p>` : ""}${dormantNote}</section>
    ${escalationMarkup(run, chosen, mine)}
    <section class="journal-section"><h3 class="journal-head">Countermeasure</h3><p class="dossier-counter">${esc(story.counterplay)}</p>${story.counterplay !== definition.trait ? `<div class="trait-explanation inlay"><h4>${icon("eye", 16)} ${definition.badge === "HOSTILE" ? "Hostile Trait" : named(definition.badge)}</h4><p>${esc(definition.trait)}</p></div>` : ""}${definition.boss ? `<div class="trait-explanation inlay is-guardian"><h4>${icon("boss", 16)} Guardian</h4><p>${esc(definition.boss.warning)} Breaking an ultimate cancels its attack and new field, then exposes the guardian for one turn: ignore armor and deal +${RULES.exposedBonus} damage. Existing fields still resolve.</p></div>` : ""}</section>
    ${definition.boss ? addsMarkup(run, chosen) : ""}</article>
    <p class="journal-note">Patterns repeat. Pressure adds 1 damage to strikes and breaches every three of a hostile's own actions (leaders and singles only). Stage II adds 1 attack damage; stage III adds 2. New hostile fields begin on the following player turn.</p><div class="journal-actions"><button class="text-button" data-action="help">${icon("book", 16)} Handbook</button></div>`;
}

/* ------------------------------------------------------------------ devices */

export const ROLE_COPY: Record<string, [string, string]> = {
  client: ["Terminal", "Every route starts or ends here"],
  router: ["Router", "Every route needs one"],
  switch: ["Switch", `+${RULES.switchDamage} on the primary route`],
  firewall: ["Firewall", `Online: blocks ${RULES.firewallBreachBlock} breach / ${RULES.firewallStrikeBlock} strike; quarantines the nearest installation within ${REACH}`],
  honeypot: ["Honeypot", `Draws jams, cuts and overloads; the attacker takes ${RULES.honeypotDamage}`],
  cache: ["Cache Server", "Online: draw +1 next turn"],
  power: ["PoE Injector", "Online: +1 energy next turn"],
  balancer: ["Load Balancer", `Online: +${RULES.balancerPerChannel} per channel`],
  rack: ["Server Rack", `Takes the wear for devices within ${REACH}; never cabled`],
  phantom: ["Phantom Node", "Absorbs the next disruption or installation"],
};
const INSTALLATION_COPY: Record<InstallationKind, string> = {
  tap: `−${R.malwarePenalty} transmission damage while it stands.`,
  jammer: `Each enemy phase it jams the nearest unprotected device within ${REACH}.`,
  spike: `Each enemy phase it wears the nearest device within ${REACH} by 1 condition.`,
  anchor: "Hostile fields in its band do not tick down. Purge Field on the band destroys it.",
  breaker: `Counts down each enemy phase; at 0 every device within ${REACH} breaks.`,
};
function deviceTile(run: RunState, n: NetworkNode, p: CombatPreview) {
  const online = n.fixed || p.online.includes(n.id);
  const [role, ability] = ROLE_COPY[n.role] ?? [n.role, ""];
  const shared = p.sharedDevices.find(item => item.id === n.id);
  const mods = [n.shielded ? "Jam protected" : "", n.upgraded ? `Overclocked +${RULES.overclockDamage}` : "", n.configured ? `Startup Config +${RULES.configuredDamage}` : "", n.amplified ? `Compressed +${RULES.compressionDamage}` : "", n.stateful ? "Stateful · blocks double" : "", n.sentry ? `Sentry · quarantine ${R.sentryQuarantine}` : "", n.salvage ? "Salvaged" : "", n.role === "phantom" && n.absorbs ? `Absorbs ${n.absorbs}` : "", shared ? `Shared · ${shared.routes} routes, one channel` : ""].filter(Boolean);
  const state = n.fixed ? "Fixed" : online ? "Online" : "Offline";
  const wearable = !n.fixed && n.role !== "phantom";
  const condition = wearable ? conditionOf(n) : 0, max = wearable ? maxConditionOf(n) : 0;
  const worn = wearable && isWorn(n);
  const cost = repairCost(run);
  const repair = worn
    ? `<button class="plate-button tile-action" data-repair="${n.id}" aria-label="Repair ${upper(n.id)}, ${cost} energy, condition ${condition} of ${max}" ${run.energy < cost ? "disabled" : ""}>Repair · ${cost} energy</button>`
    : "";
  const conditionRow = worn ? `<span class="tile-condition is-worn"><span>Worn · condition <b>${condition}</b>/${max}${run.energy < cost ? " · needs energy" : ""}</span>${repair}</span>` : "";
  return `<div class="device-tile inlay ${online ? "is-online" : "is-offline"}${n.fixed ? " is-fixed" : ""}${worn ? " is-worn" : ""}"><button class="device-main" data-manage-node="${n.id}" aria-label="${upper(n.id)}, ${esc(role)}, ${state}${wearable ? `, condition ${condition} of ${max}` : ""}${n.fixed ? "" : `. Relocate for ${RULES.relocateCost} energy`}"><span class="device-glyph">${glyph(n.role, 24)}</span><span class="device-copy"><strong>${upper(n.id)}${wearable ? pips(condition, max, `condition ${condition} of ${max}`) : ""}</strong><span class="device-role">${esc(role)} · ${band(zoneForNode(n))}</span><span class="device-ability">${esc(ability)}</span>${mods.length ? `<span class="device-mods">${mods.map(esc).join(" · ")}</span>` : ""}${!online && n.role !== "rack" && n.role !== "phantom" ? '<span class="device-hint">Connect it to a live route</span>' : ""}</span><span class="device-state"><i></i>${state}</span></button>${conditionRow}</div>`;
}
function installationTile(run: RunState, item: Installation, p: CombatPreview) {
  const name = INSTALLATION_NAMES[item.kind];
  const cost = scrubCost(run);
  const total = Math.max(R.installationIntegrity[item.kind], item.integrity);
  const effect = p.installationEffects.find(entry => entry.id === item.id);
  const quarantine = p.quarantine.filter(record => record.installationId === item.id);
  const owner = run.enemies.find(enemy => enemy.uid === item.owner);
  const next = p.destroyed.some(record => record.id === item.id) ? "Destroyed during the coming phase."
    : !effect ? ""
      : effect.effect === "jam" ? (effect.target ? `Next phase: jams ${pretty(effect.target)}${effect.missed ? ` (it misses: ${effect.missed})` : effect.decoyed ? " (your honeypot decoys it)" : effect.absorbed ? " (the phantom absorbs it)" : effect.cancelled ? " (Port Security cancels it)" : ""}.` : "Next phase: reaches no device.")
        : effect.effect === "wear" ? `Next phase: wears ${pretty(effect.target ?? "")}.`
          : effect.effect === "tick" ? `Next phase: counts down to ${effect.countdown}.`
            : effect.effect === "detonate" ? "Next phase: detonates." : effect.effect === "idle" ? "Not active until the next hostile action."
              : effect.effect === "anchor" ? `Holding the ${band(effect.target ?? zoneForNode(item))} band's hostile fields.` : "";
  const after = `<span class="pips-pair">${pips(item.integrity, total)}${icon("arrow", 13)}${pips(Math.max(0, item.integrity - 1), total)}</span>`;
  return `<div class="device-tile inlay installation-tile kind-${item.kind}"><div class="device-main"><span class="device-glyph">${glyph(item.kind, 24)}</span><span class="device-copy"><strong>${esc(name)}${pips(item.integrity, total, `${item.integrity} integrity`)}</strong><span class="device-role">Installation · ${band(zoneForNode(item))}${owner ? ` · ${named(owner.name)}` : ""}</span><span class="device-ability">${esc(INSTALLATION_COPY[item.kind])}</span>${next ? `<span class="device-hint">${esc(next)}</span>` : ""}${quarantine.map(record => `<span class="device-mods">${pretty(record.firewallId)} quarantines it −${record.damage}${record.destroys ? " · destroyed" : ""}</span>`).join("")}</span>${item.countdown !== undefined ? `<span class="tile-countdown" aria-label="countdown ${item.countdown}"><b>${item.countdown}</b></span>` : ""}</div><span class="tile-condition"><button class="plate-button tile-action" data-scrub="${item.id}" aria-label="Scrub the ${esc(name)}, ${cost} energy, ${item.integrity} integrity left" ${run.energy < cost ? "disabled" : ""}>Scrub · ${cost} energy · ${after}</button></span></div>`;
}
export function devicesMarkup(run: RunState) {
  const p = combatPreview(run);
  const frayed = frayedLinks(run.topology, run.terrain);
  const wraith = run.enemies.some(enemy => enemy.id === "wraith" && enemy.hp > 0);
  const tiles = run.topology.nodes.map(n => deviceTile(run, n, p)).join("");
  const cables = run.topology.links.map(l => {
    const a = run.topology.nodes.find(n => n.id === l.a)!, b = run.topology.nodes.find(n => n.id === l.b)!;
    const length = Math.hypot(a.x - b.x, a.z - b.z), worn = frayed.has(linkKey(l.a, l.b));
    const exposed = wraith && length > RULES.cableExposureLength && !l.armored;
    // The channel it carries, in that channel's table colour.
    const channel = p.channelPaths.slice(0, p.channels).findIndex(path => path.some((id, i) => i > 0 && linkKey(path[i - 1], id) === linkKey(l.a, l.b)));
    const tags = [channel >= 0 ? `<span class="cable-tag is-channel" style="--channel:${channelCss(channel)}">${channel ? `Channel ${channel + 1}` : "Primary channel"}</span>` : "", l.armored ? '<span class="cable-tag is-good">Cut-proof</span>' : "", l.boosted ? `<span class="cable-tag is-good is-amplified">Amplified · violet fibre · +${RULES.amplifiedCableDamage} signal</span>` : "", worn ? `<span class="cable-tag is-bad">Frayed −${RULES.frayedCableDamage}</span>` : "", wraith ? `<span class="cable-tag${exposed ? " is-bad" : ""}">Span ${length.toFixed(1)}${exposed ? " · exposed" : ""}</span>` : ""].join("");
    return `<li><span class="cable-ends">${glyph("cable", 16)}${upper(l.a)}<i>↔</i>${upper(l.b)}</span>${tags ? `<span class="cable-tags">${tags}</span>` : ""}</li>`;
  }).join("");
  const scrub = scrubCost(run);
  const installations = run.installations.length
    ? `<section class="journal-section"><h3 class="journal-head">Installations</h3><div class="device-inventory">${run.installations.map(item => installationTile(run, item, p)).join("")}</div><p class="journal-note">Scrubbing costs ${scrub} energy per integrity point${scrub > R.scrubCost ? " while a Quarantine Drone lives" : ""}; a destroyed installation adds ${R.reclaimShield} Reclaim shield to the coming phase.</p></section>`
    : "";
  const terrain = run.terrain ? `<p class="terrain-note">${icon("terrain", 16)}<span><b>${esc(run.terrain.name)}</b> ${esc(run.terrain.description)}${run.terrain.debris.length ? ` ${run.terrain.debris.length} wreck${run.terrain.debris.length === 1 ? "" : "s"} block${run.terrain.debris.length === 1 ? "s" : ""} placement. Unarmored cables that cross a scorched ring fray: −${RULES.frayedCableDamage} damage each on your primary route.` : ""}</span></p>` : "";
  const worn = run.topology.nodes.filter(isWorn).length;
  const sub = `Select a device to relocate it for ${RULES.relocateCost} energy.${worn ? ` Repair a worn device for ${repairCost(run)} energy.` : ""}`;
  return `${head("Devices", sub)}${installations}<section class="journal-section"><h3 class="journal-head">Your Devices</h3><div class="device-inventory">${tiles}</div></section><section class="journal-section cable-inventory"><h3 class="journal-head">Connections</h3>${cables ? `<ul class="cable-list">${cables}</ul>` : '<p class="empty-pile">No cables yet.</p>'}</section>${terrain}<p class="journal-note">Bands with ${RULES.clusterThreshold}+ online devices form a cluster (+${RULES.clusterDamage}). Routers in opposite outer bands on separate channels grant ${RULES.separatedCircuitShield} shield. Every deployed device has ${R.deviceCondition} condition; at 0 it breaks and leaves wreckage.</p>`;
}
