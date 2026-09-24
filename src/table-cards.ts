/** Hover cards for the network on the table: devices, cables and installations.
 * Owned by the table-readability work (channels, shared devices, amplified cables). Every number
 * is read from the forecast (`combatPreview`) or from RULES; nothing here computes a rule. */
import { CARDS, RULES, baseCard } from "./core/cards.ts";
import { INSTALLATION_NAMES, isWorn, scrubCost, zoneForNode, type CombatPreview } from "./core/run.ts";
import { contributionOf } from "./core/combat/network.ts";
import { linkKey } from "./core/graph.ts";
import { frayedLinks } from "./core/terrain.ts";
import type { Installation, NetworkLink, NetworkNode, Port, RunState } from "./core/types.ts";
import type { TableHover } from "./three/World.ts";
import { AMPLIFIED_CSS, channelCss } from "./channel-palette.ts";
import { ROLE_COPY, glyph as roleGlyph } from "./alpha-ui.ts";
import { conditionPips, glyph, installationEffectLine, integrityPips } from "./battle-ui.ts";
import { esc, icon } from "./ui.ts";

const up = (id: string) => esc(id.toUpperCase());
const band = (zone: string) => zone[0].toUpperCase() + zone.slice(1);
const PORT_NAMES: Record<Port, string> = { left: "left", centre: "centre", right: "right" };
const REACH = RULES.reach.toFixed(1);
/** "CABLE WRAITH" reads as a name in running text. */
const named = (text: string) => esc(text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()));
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The merge glyph of the junction seal on the table: two strands that join and leave as one. */
export const MERGE_GLYPH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6.5c4.5 0 6.5 5.5 10 5.5M3 17.5c4.5 0 6.5-5.5 10-5.5M13 12h8"/></svg>';

/** The card's inner markup for a device, cable or installation, or null for no card. */
export function hoverMarkup(run: RunState, preview: CombatPreview, target: TableHover): string | null {
  if (target.kind === "node") {
    const node = run.topology.nodes.find(item => item.id === target.id);
    return node ? deviceCard(run, preview, node) : null;
  }
  if (target.kind === "link") {
    const link = run.topology.links.find(item => linkKey(item.a, item.b) === target.id);
    return link ? cableCard(run, preview, target.id, link) : null;
  }
  if (target.kind === "installation") {
    const item = run.installations.find(entry => entry.id === target.id);
    return item ? installationCard(run, preview, item) : null;
  }
  return null;
}

// ------------------------------------------------------------------ channels

/** Channels that deliver (0 = primary). A primary route outside the maximum set lists one path
 * more in channelPaths; that path delivers nothing and gets no colour. */
const delivering = (preview: CombatPreview) => preview.channelPaths.slice(0, preview.channels);
function channelOfNode(preview: CombatPreview, id: string): number | null {
  const index = delivering(preview).findIndex(path => path.slice(1, -1).includes(id));
  return index < 0 ? null : index;
}
function channelOfLink(preview: CombatPreview, key: string): number | null {
  const index = delivering(preview).findIndex(path => path.some((id, i) => i > 0 && linkKey(path[i - 1], id) === key));
  return index < 0 ? null : index;
}
const onPrimary = (preview: CombatPreview, key: string) =>
  preview.signalPath.some((id, i) => i > 0 && linkKey(preview.signalPath[i - 1], id) === key);
const swatch = (css: string) => `<i class="tc-swatch" style="--swatch:${css}"></i>`;
const NEUTRAL = "#8f8a7c";
/** "Primary channel · delivers 9 to the centre" (the port only in a pack). */
function channelLine(run: RunState, preview: CombatPreview, index: number): string {
  const delivery = preview.deliveries[index];
  const pack = run.enemies.filter(enemy => enemy.hp > 0).length > 1;
  const what = delivery ? ` · delivers <b>${delivery.amount}</b>${pack ? ` to the ${PORT_NAMES[delivery.port]}` : ""}` : "";
  const name = index === 0 ? "Primary channel" : `Channel ${index + 1}`;
  return line(swatch(channelCss(index)), `<span class="tc-channel" style="--swatch:${channelCss(index)}">${name}</span>${what}`);
}

// ------------------------------------------------------------------ pieces

const line = (mark: string, body: string, cls = "") => `<p class="tc-line${cls ? ` ${cls}` : ""}"><span class="tc-mark">${mark}</span><span>${body}</span></p>`;
function head(mark: string, name: string, id: string, sub: string) {
  return `<header class="tc-head"><span class="tc-glyph">${mark}</span><span class="tc-title"><strong>${esc(name)}</strong>${id ? `<em>${up(id)}</em>` : ""}</span></header><p class="tc-sub">${sub}</p>`;
}
const enemyName = (run: RunState, uid: string) => named(run.enemies.find(enemy => enemy.uid === uid)?.name ?? "A hostile");

/** The device's name: the hardware card that deployed it, else its role. */
function deviceName(node: NetworkNode): string {
  const role = ROLE_COPY[node.role]?.[0] ?? node.role;
  if (node.fixed) return node.id === "alpha" ? "Alpha terminal" : node.id === "omega" ? "Omega terminal" : role;
  const card = node.deployedBy ? CARDS[baseCard(node.deployedBy)] : null;
  if (card?.target === "ground" && card.role === node.role) return card.name;
  return node.salvage ? `Salvaged ${role}` : role;
}

// ------------------------------------------------------------------ devices

function deviceCard(run: RunState, preview: CombatPreview, node: NetworkNode): string {
  if (node.fixed) return terminalCard(preview, node);
  const online = preview.online.includes(node.id);
  const jammed = run.faultNodes.includes(node.id);
  const cabled = run.topology.links.some(link => link.a === node.id || link.b === node.id);
  const standalone = node.role === "rack" || node.role === "phantom";
  const status = standalone ? "never cabled" : jammed ? "jammed" : online ? "online" : "offline";
  const pips = node.role !== "phantom" ? ` <i class="tc-pips${isWorn(node) ? " is-worn" : ""}" aria-label="condition">${conditionPips(node)}</i>` : "";
  const rows: string[] = [];
  // Offline: say why first, it is the one thing that matters.
  if (!online && !standalone) {
    const cut = run.topology.links.some(link => (link.a === node.id || link.b === node.id) && run.faultLinks.includes(linkKey(link.a, link.b)));
    const why = jammed ? "Jammed this turn: it carries nothing and does nothing."
      : !cabled ? "No cable: connect it to a live route."
        : cut ? "A cut cable leaves it off every live route."
          : "No live ALPHA → router → OMEGA route passes through it.";
    rows.push(line(icon("warning", 14), `<b>Offline.</b> ${why}`, "is-bad"));
  }
  const ability = abilityLine(run, preview, node, online, cabled);
  if (ability) rows.push(ability);
  // Channel membership and, where routes merge, why they count once.
  const channel = channelOfNode(preview, node.id);
  if (channel !== null) rows.push(channelLine(run, preview, channel));
  else if (online) rows.push(line(swatch(NEUTRAL), "On a route, not its own channel", "is-quiet"));
  const shared = preview.sharedDevices.find(item => item.id === node.id);
  if (shared) rows.push(line(MERGE_GLYPH, `<b>Shared:</b> ${shared.routes} routes pass through ${up(node.id)} · a device carries one channel`, "is-shared"));
  rows.push(...threatLines(run, preview, node));
  const upgrades = [
    node.configured ? `Startup Config +${RULES.configuredDamage}` : "", node.upgraded ? `Overclocked +${RULES.overclockDamage}` : "",
    node.role === "switch" && node.amplified ? `Compressed +${RULES.compressionDamage}` : "",
    node.stateful ? "Stateful" : "", node.sentry ? "Sentry" : "", node.shielded ? "Jam protected" : "", node.salvage ? "Salvaged" : "",
  ].filter(Boolean);
  if (upgrades.length) rows.push(`<p class="tc-tags">${upgrades.map(esc).join(" · ")}</p>`);
  const sub = `${band(zoneForNode(node))} band · <span class="${online || standalone ? "is-on" : "is-off"}">${status}</span>${pips}`;
  return `<div class="tc-card kind-device role-${node.role}${shared ? " is-shared" : ""}" data-card="device" data-id="${esc(node.id)}">${head(roleGlyph(node.role, 20), deviceName(node), node.id, sub)}${rows.join("")}</div>`;
}

/** What the device does right now, with the forecast's numbers. */
function abilityLine(run: RunState, preview: CombatPreview, node: NetworkNode, online: boolean, cabled: boolean): string {
  const primary = preview.signalPath.includes(node.id);
  switch (node.role) {
    case "router": {
      if (!primary) return line(icon("link", 14), online ? "Carries its routes. Its upgrades add damage only on the primary route." : "Every route needs a router.", "is-quiet");
      const own = contributionOf(run, node);
      return line(icon("bolt", 14), `Carries the primary route: base <b>+${RULES.baseRouteDamage}</b>${own ? ` · its upgrades <b>+${own}</b>` : ""}`);
    }
    case "switch": {
      const worth = contributionOf(run, node);
      return primary ? line(icon("bolt", 14), `On the primary route: <b>+${worth}</b>${node.amplified ? " (compressed)" : ""}`)
        : line(icon("bolt", 14), `+${worth} only while on the primary route`, "is-quiet");
    }
    case "firewall": {
      const rule = `blocks ${RULES.firewallBreachBlock} of each breach and ${RULES.firewallStrikeBlock} of each strike${node.stateful ? ", doubled" : ""}`;
      const quarantine = preview.quarantine.find(record => record.firewallId === node.id);
      const target = quarantine ? run.installations.find(item => item.id === quarantine.installationId) : null;
      const after = quarantine && target
        ? ` Quarantines the ${esc(INSTALLATION_NAMES[target.kind])} <b>−${quarantine.damage}</b>${quarantine.destroys ? ", destroying it" : ""}.`
        : ` Quarantines an installation within ${REACH}.`;
      return line(icon("shield", 14), `${online ? "Online: " : "While online: "}${rule}.${after}`);
    }
    case "honeypot": {
      if (!cabled) return line(icon("trap", 14), "Uncabled: it lures nothing until a cable reaches it.", "is-quiet");
      const lured = preview.hostiles.filter(hostile => hostile.jams.includes(node.id) || hostile.overload === node.id || hostile.cuts.some(key => key.split("::").includes(node.id)));
      return line(icon("trap", 14), `Lures jams, cuts and overloads; the attacker takes <b>${RULES.honeypotDamage}</b>.${lured.length ? ` This phase: ${lured.map(hostile => enemyName(run, hostile.uid)).join(", ")}.` : ""}`);
    }
    case "cache": return line(icon("deck", 14), online ? `Online: <b>+1</b> card next turn · next hand ${preview.nextTurn.draw}` : "While online: +1 card next turn.");
    case "power": return line(icon("bolt", 14), online ? `Online: <b>+1</b> energy next turn · next turn ${preview.nextTurn.energy} energy` : "While online: +1 energy next turn.");
    case "balancer": return line(icon("channels", 14), online ? `Online: <b>+${RULES.balancerPerChannel}</b> on each of ${count(preview.channels, "delivery", "deliveries")}` : `While online: +${RULES.balancerPerChannel} on every delivery.`);
    case "rack": {
      const sheltered = preview.wear.filter(record => record.nodeId === node.id && record.sheltered);
      return line(icon("shield", 14), `Takes the wear of every device within ${REACH}${sheltered.length ? `. This phase: ${sheltered.map(record => up(record.sheltered!)).join(", ")}` : ""}.`);
    }
    case "phantom": {
      const left = node.absorbs ?? 1, absorbing = preview.installTargets.filter(item => item.absorbed === node.id);
      return line(icon("eye", 14), `Absorbs the next ${left === 1 ? "disruption or installation" : `${left} disruptions or installations`} aimed near it${absorbing.length ? `. This phase: the ${absorbing.map(item => esc(INSTALLATION_NAMES[item.kind])).join(", ")}` : ""}.`);
    }
    default: return "";
  }
}

/** Forecast threats to a device: jams, overloads, wear, breakdowns, installations aimed beside it. */
function threatLines(run: RunState, preview: CombatPreview, node: NetworkNode): string[] {
  const threats: string[] = [];
  for (const hostile of preview.hostiles) {
    if (hostile.jams.includes(node.id)) threats.push(`${enemyName(run, hostile.uid)} jams it next phase`);
    if (hostile.overload === node.id) threats.push(`${enemyName(run, hostile.uid)} overloads it`);
  }
  for (const effect of preview.installationEffects)
    if (effect.effect === "jam" && effect.target === node.id && !effect.decoyed && !effect.absorbed && !effect.cancelled) threats.push("A Jammer jams it next phase");
  for (const record of preview.wear.filter(item => item.nodeId === node.id || item.sheltered === node.id)) {
    const source = esc(record.source.replace(/^([^·]+?)(?= ·|$)/, name => name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())));
    threats.push(record.sheltered === node.id ? `${source}: ${up(record.nodeId)} takes the wear for it`
      : `${source} ${record.breaks ? "breaks it" : `wears it ${record.from} → ${record.to}`}`);
  }
  if (preview.breakdowns.some(record => record.nodeId === node.id) && !preview.wear.some(record => record.nodeId === node.id && record.breaks))
    threats.push("Breaks this phase");
  for (const item of preview.installTargets.filter(entry => entry.aim === node.id && !entry.absorbed))
    threats.push(`${enemyName(run, item.owner)} plants a ${esc(INSTALLATION_NAMES[item.kind])} beside it`);
  return threats.map(text => line(icon("warning", 14), text, "is-threat"));
}

function terminalCard(preview: CombatPreview, node: NetworkNode): string {
  const alpha = node.id === "alpha";
  const rows = [
    line(icon("link", 14), alpha ? "Every route starts here." : "Every route ends here."),
    preview.routeCount
      ? line(icon("channels", 14), `<b>${count(preview.routeCount, "route")}</b> · <b>${count(preview.channels, "channel")}</b>. Routes through the same device count as one channel.`)
      : line(icon("warning", 14), "No live route yet: ALPHA → router → OMEGA.", "is-bad"),
  ];
  return `<div class="tc-card kind-terminal" data-card="terminal" data-id="${node.id}">${head(roleGlyph("client", 20), deviceName(node), "", "Fixed terminal")}${rows.join("")}</div>`;
}

// ------------------------------------------------------------------ cables

function cableCard(run: RunState, preview: CombatPreview, key: string, link: NetworkLink): string {
  const cut = run.faultLinks.includes(key);
  const frayed = !link.armored && (frayedLinks(run.topology, run.terrain).has(key) || (run.frayedByCut ?? []).includes(key));
  const primary = onPrimary(preview, key) && !cut;
  const kind = link.boosted && link.armored ? "Amplified armored cable" : link.boosted ? "Amplified cable" : link.armored ? "Armored cable" : "Cable";
  const rows: string[] = [];
  if (cut) rows.push(line(icon("warning", 14), "<b>Cut</b> this turn: it carries nothing.", "is-bad"));
  const channel = channelOfLink(preview, key);
  if (channel !== null) rows.push(channelLine(run, preview, channel));
  else if (!cut) rows.push(line(swatch(NEUTRAL), "Carries no channel", "is-quiet"));
  if (link.boosted) rows.push(line(swatch(AMPLIFIED_CSS), `<span class="tc-amplified">Amplified fibre</span> · <b>+${RULES.amplifiedCableDamage}</b> on the primary route${primary ? " · counting now" : cut ? "" : " · idle here"}`));
  if (link.armored) rows.push(line(icon("shield", 14), "Armored · cut-proof and fray-proof"));
  if (frayed) rows.push(line(icon("warning", 14), `Frayed · <b>−${RULES.frayedCableDamage}</b> on the primary route${primary ? " · counting now" : ""}`, "is-worn"));
  for (const hostile of preview.hostiles) {
    if (hostile.cuts.includes(key)) rows.push(line(icon("warning", 14), `${enemyName(run, hostile.uid)} cuts it next phase`, "is-threat"));
    if (hostile.frays.includes(key)) rows.push(line(icon("warning", 14), `${enemyName(run, hostile.uid)}'s cut frays it for a turn`, "is-threat"));
  }
  const [a, b] = [link.a, link.b];
  return `<div class="tc-card kind-cable${link.boosted ? " is-amplified" : ""}" data-card="cable" data-id="${esc(key)}">${head(roleGlyph("cable", 20), kind, "", `${up(a)} ↔ ${up(b)}`)}${rows.join("")}</div>`;
}

// ------------------------------------------------------------------ installations

function installationCard(run: RunState, preview: CombatPreview, item: Installation): string {
  const name = INSTALLATION_NAMES[item.kind], cost = scrubCost(run);
  const rows = [line(glyph(item.kind, 14), esc(installationEffectLine(run, preview, item)))];
  for (const record of preview.quarantine.filter(entry => entry.installationId === item.id))
    rows.push(line(icon("shield", 14), `${up(record.firewallId)} quarantines it <b>−${record.damage}</b>${record.destroys ? " · destroyed" : ""}`, "is-good"));
  rows.push(line(icon("scrub", 14), `Scrub · <b>${cost}</b> energy per point <kbd>S</kbd>`, "is-quiet"));
  const owner = run.enemies.find(enemy => enemy.uid === item.owner);
  const sub = `${band(zoneForNode(item))} band · <i class="tc-pips">${integrityPips(item)}</i>${item.kind === "breaker" && item.countdown !== undefined ? ` · detonates in ${item.countdown}` : ""}${owner ? ` · ${named(owner.name)}` : ""}`;
  return `<div class="tc-card kind-installation kind-${item.kind}" data-card="installation" data-id="${esc(item.id)}">${head(glyph(item.kind, 20), name, "", sub)}${rows.join("")}</div>`;
}
