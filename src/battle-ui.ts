/** The v3 battle HUD: plates, console command, protocol dock, network ledger,
 * field seals, energy and transmit controls. Every number shown here is read from
 * the same pure forecast (`combatPreview`) that resolves the turn. */
import { DESIGNATIONS, ENEMIES, SIGNALS, designationRule } from "./core/enemies.ts";
import { STAGES } from "./core/stages.ts";
import { CARDS, RELICS, RULES, type ProtocolTrigger } from "./core/cards.ts";
import { ARCHETYPES } from "./core/expedition.ts";
import {
  combatPreview,
  consoleState,
  intentFor,
  leaderOf,
  livingEnemies,
  effectiveFocus,
  PORTS,
  scrubCost,
  repairCost,
  isWorn,
  conditionOf,
  maxConditionOf,
  INSTALLATION_NAMES,
  FIELD_RULES,
  hardenBlock,
  ZONES,
  zoneDescription,
  zoneForNode,
  type CombatPreview,
  type HostileForecast,
  type Intent,
} from "./core/run.ts";
import type { CardId, DesignationId, Enemy, Installation, Port, RunState, Zone } from "./core/types.ts";
import { enemyStory } from "./story.ts";
import { cardMarkup, esc, icon } from "./ui.ts";
import { channelCss } from "./channel-palette.ts";
import { relicEmblem } from "./screens.ts";
import { designationGlyph } from "./tutorial/icons.ts";
import { levelRule } from "./core/combat/intent.ts";

/** What the player is looking at on the far rail and the table front. Reading only:
 * none of it changes a number (the focus and the aims live in RunState). */
export interface HudView {
  /** Port whose hostile the right plate details; null follows the focus. */
  port: Port | null;
  /** Delivery row chosen with [ ] (a channelKey). */
  delivery: string | null;
  /** Installation whose plate is open in the target dock. */
  installation: string | null;
  /** Demolition Charge is choosing the installation it destroys. */
  demolition: boolean;
}

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
  /** Port, delivery and installation selection (defaults: nothing selected). */
  hud?: HudView;
  /** A hidden designation is being revealed this render: its ribbon re-engraves. */
  revealing?: boolean;
}

export const INTENT_NAMES: Record<Intent["kind"], string> = {
  strike: "Integrity strike", sever: "Cut a cable", jam: "Jam a device", breach: "Security breach",
  corrupt: "Corrupt a band", charge: "Charging ultimate", install: "Plant an installation",
  overload: "Overload a device", dormant: "Dormant",
};
export const INTENT_ICONS: Record<Intent["kind"], string> = {
  strike: "sword", breach: "sword", sever: "link", jam: "bolt", corrupt: "field", charge: "bolt", install: "malware",
  overload: "warning", dormant: "next",
};
const TRIGGER_WORDS: Record<ProtocolTrigger, string> = {
  sever: "a cable cut", jam: "a jam", strike: "a strike", breach: "a breach", field: "a hostile field", ultimate: "a charge or ultimate",
};
const TRIGGER_ICONS: Record<ProtocolTrigger, string> = {
  sever: "link", jam: "bolt", strike: "sword", breach: "shield", field: "field", ultimate: "boss",
};
/** Plate glyphs the shared icon set lacks: the focus crest, the delivery marks (the
 * table's channel colours), installation kinds and the cracked plate of an overload. */
const GLYPHS: Record<string, string> = {
  crest: '<path d="M12 1.6 22.4 12 12 22.4 1.6 12Z"/><path d="m12 6.6 1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5Z" fill="currentColor" stroke="none"/>',
  hexagon: '<path d="M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3Z" fill="currentColor"/>',
  diamond: '<path d="M12 3.2 20.8 12 12 20.8 3.2 12Z" fill="currentColor"/>',
  cracked: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="m12.5 5-2.2 4.2 3.2 2.6-2.4 3.1 1 4.1M6.5 8h2m7 8h2"/>',
  tap: '<path d="M4.5 4h15l-5.5 7.5V17l-4 3v-8.5Z"/><path d="M8 7.5h8"/>',
  jammer: '<path d="M4 8.5a8 8 0 0 0 16 0Z"/><path d="M12 13v6.5m-4 0h8M12 8.5 16 4"/><circle cx="16.8" cy="3.4" r="1.1"/>',
  spike: '<path d="M12 2.5 16.2 19H7.8Z"/><path d="M5.5 19.5h13M12 8v7"/>',
  anchor: '<path d="M12 7v14M3 13l2 5 7 4 7-4 2-5M7 10h10"/><circle cx="12" cy="4" r="3"/>',
  breaker: '<rect x="4.5" y="9" width="15" height="11" rx="1"/><path d="M9 9V6.5h6V9M12 6.5c0-2.2 1.6-3.5 4.2-3.5M8 14.5h8"/>',
  crate: '<rect x="3" y="5" width="18" height="15" rx="1"/><path d="M3 9.5h18M3 15.5h18M7 9.5l10 6M9.5 7.2h5"/>',
  signal: '<path d="M12 21v-6"/><circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6m7.6 0a5.4 5.4 0 0 0 0-7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2m13.2 0a9.3 9.3 0 0 0 0-13.2"/>',
  wrench: '<path d="M13.4 10.6 4.3 19.7a1.6 1.6 0 0 0 2.3 2.3l9.1-9.1"/><path d="M13.4 10.6a4.8 4.8 0 0 1 6-6.5l-3 3 .4 2.6 2.6.4 3-3a4.8 4.8 0 0 1-6.7 6"/>',
};
/** A plate glyph (falls back to the shared icon set). */
export function glyph(name: string, size = 16): string {
  const path = GLYPHS[name];
  if (!path) return icon(name, size);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
/** The glyph an intent wears on the plate: the installation's own kind, a cracked plate for an overload. */
export function intentGlyph(intent: Pick<Intent, "kind" | "install">, size = 16): string {
  if (intent.kind === "install") return glyph(intent.install ?? "tap", size);
  if (intent.kind === "overload") return glyph("cracked", size);
  return icon(INTENT_ICONS[intent.kind], size);
}
/** "a Jammer", "an Anchor". */
const aName = (kind: keyof typeof INSTALLATION_NAMES) => `${/^[AEIOU]/i.test(INSTALLATION_NAMES[kind]) ? "an" : "a"} ${INSTALLATION_NAMES[kind]}`;
const PORT_LETTER: Record<Port, string> = { left: "L", centre: "C", right: "R" };
const PORT_NAME: Record<Port, string> = { left: "Left", centre: "Centre", right: "Right" };
/** Integrity or condition as engraved diamonds: "◆◆◇". */
const pips = (now: number, max: number) => `${"◆".repeat(Math.max(0, now))}${"◇".repeat(Math.max(0, max - now))}`;
/** The three escalation levels (section 6.1), one sentence each, as the engine words them. */
const levelRules = (r: RunState) => ([1, 2, 3] as const).map(level => {
  const rule = levelRule(r, level);
  return `${rule.charAt(0).toUpperCase()}${rule.slice(1)}.`;
});
const grows = (enemy: Pick<Enemy, "role">) => enemy.role === "leader" || enemy.role === "single";
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

/** The guardian's break threshold: the forecast's own on the ultimate turn; on the charge turn the
 * threshold the ultimate will carry, from the adds this transmission leaves standing. */
function breakAhead(r: RunState, p: CombatPreview, guardian: Enemy): number {
  const own = p.ports[guardian.port]?.breakThreshold;
  if (own !== null && own !== undefined) return own;
  return (ENEMIES[guardian.id].boss?.breakDamage ?? p.breakDamage ?? 0) + standingAdds(r, p).length * addBonus(r);
}
const addBonus = (r: RunState) => r.ascension >= 10 ? RULES.addBreakBonusLate : RULES.addBreakBonus;
/** Adds alive after this transmission (a lethal delivery fells them before the ultimate). */
const standingAdds = (r: RunState, p: CombatPreview) => r.enemies.filter(add => add.role === "add" && add.hp > 0
  && !(p.ports[add.port]?.uid === add.uid && p.ports[add.port]?.lethal && !p.buffering));
/** A breakdown leaves wreckage unless the device was a rack or a phantom (the forecast says which). */
export const leavesWreck = (p: CombatPreview, nodeId: string) => p.breakdowns.some(record => record.nodeId === nodeId && record.wreck);
/** What the forecast enemy action will do to your network, in one or two sentences. */
export function intentCopy(r: RunState, p: CombatPreview): string {
  const intent = p.intent!;
  const enemy = leaderOf(r)!;
  if (p.lethal) return "Your transmission defeats it before it can act.";
  if (p.enemyDefeatedByTraps) return "Your traps finish it as it moves. Its action never lands.";
  if (p.interrupted) return `Ultimate interrupted. Existing fields still resolve. Exposed next turn: armor bypassed, +${RULES.exposedBonus} damage.`;
  if (intent.kind === "charge") {
    const next = intentFor(r, { ...enemy, hp: Math.max(0, enemy.hp - (p.ports[enemy.port]?.packet ?? 0)) }, 1);
    return `${p.incomingRaw ? `Fields: ${p.incomingRaw} damage now. ` : ""}Ultimate: ${next?.amount ?? 0} damage next turn. Prepare a burst (P); deal ${breakAhead(r, p, enemy)} then to interrupt, or brace.`;
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
  for (const planted of p.installTargets) parts.push(planted.boosts ? `Reinforces ${pretty(planted.boosts)} (+1 integrity): the table is full.`
    : planted.destroyed ? `Plants ${aName(planted.kind)} your honeypot destroys on arrival.`
      : `Plants ${aName(planted.kind)} in ${zoneForNode(planted).toUpperCase()}${planted.kind === "tap" ? ` (−${RULES.malwarePenalty} damage until scrubbed)` : ""}.`);
  for (const worn of p.wear) parts.push(worn.breaks ? `Breaks ${pretty(worn.nodeId)}${leavesWreck(p, worn.nodeId) ? " · wreckage remains" : ""}.` : `Wears ${pretty(worn.nodeId)} to condition ${worn.to}.`);
  if (p.zoneThreat) parts.push(`${FIELD_RULES[p.zoneThreat.kind].name} in ${p.zoneThreat.zone.toUpperCase()} for ${p.zoneThreat.turns} turns, starting next turn.`);
  if (p.junk) parts.push(`Shuffles ${p.junk.count} ${CARDS[p.junk.card].name} into your draw pile.`);
  // Damage that is not the attack itself (fields, a Worm in hand, exposed cables) is named.
  const extra = p.incomingTerms.filter(term => term.amount > 0 && term.label !== intent.label);
  const sources = extra.length ? ` (${extra.map(term => `${term.label} +${term.amount}`).join(", ")})` : "";
  if (intent.kind === "strike" || intent.kind === "breach" || (p.incomingRaw && (extra.length || !parts.length)))
    parts.push(`${p.incomingRaw} damage after your transmission${sources}.`);
  return parts.join(" ") || "It gathers itself.";
}

/** The same sentences for one hostile of a pack, read from its own forecast entry. */
export function hostileCopy(r: RunState, p: CombatPreview, h: HostileForecast): string {
  const enemy = r.enemies.find(item => item.uid === h.uid);
  const intent = h.intent;
  const port = p.ports[h.port];
  if (h.state === "dormant") return "Dormant this phase: it acts next phase.";
  if (h.state === "skipped") return "Resynced: it skips this action and its counter holds.";
  if (h.state === "cancelled" || !intent) {
    if (port?.lethal || (enemy && enemy.hp <= 0)) return "Your transmission defeats it before it can act.";
    if (h.interrupted) return `Ultimate interrupted. Exposed next turn: armor bypassed, +${RULES.exposedBonus} damage.`;
    return "Your traps finish it as it moves. Its action never lands.";
  }
  const parts: string[] = [];
  if (h.state === "spiteful") parts.push("It falls to this transmission and resolves its action anyway.");
  if (intent.kind === "charge" && enemy) {
    const next = intentFor(r, { ...enemy, hp: Math.max(0, enemy.hp - (port?.packet ?? 0)) }, 1);
    return `${h.raw ? `Fields: ${h.raw} damage now. ` : ""}Ultimate: ${next?.amount ?? 0} damage next turn. Prepare a burst (P); deal ${breakAhead(r, p, enemy)} then to interrupt, or brace.`;
  }
  const isPot = (id: string) => r.topology.nodes.find(n => n.id === id)?.role === "honeypot";
  for (const cut of h.cuts) parts.push(cut.split("::").some(isPot) ? `Cuts ${pretty(cut)} — your honeypot draws the blade.` : `Cuts ${pretty(cut)} for one turn.`);
  for (const jam of h.jams) parts.push(isPot(jam) ? `Jams ${pretty(jam)} — your honeypot takes it.` : `Jams ${pretty(jam)} for one turn.`);
  if ((intent.kind === "jam" || intent.kind === "sever") && !h.cuts.length && !h.jams.length)
    parts.push(h.cancelled ? "Your protocol cancels the disruption." : h.absorbed ? "Your Phantom Node absorbs the disruption." : "No exposed device or cable to disrupt.");
  if (h.overload) {
    const worn = p.wear.find(item => (item.nodeId === h.overload || item.sheltered === h.overload) && item.source !== INSTALLATION_NAMES.spike);
    parts.push(worn?.breaks ? `Overloads ${pretty(worn.nodeId)}: it breaks${leavesWreck(p, worn.nodeId) ? " · wreckage remains" : ""}.` : worn ? `Overloads ${pretty(worn.nodeId)}: condition ${worn.from} → ${worn.to}.` : `Overloads ${pretty(h.overload)}.`);
  } else if (intent.kind === "overload") parts.push(h.absorbed ? "Your Phantom Node absorbs the overload." : h.decoyed ? "Your honeypot takes the overload." : "No device it can wear.");
  if (h.install) {
    const planted = h.install;
    parts.push(planted.absorbed ? `Its ${INSTALLATION_NAMES[planted.kind]} fades into your Phantom Node.`
      : planted.boosts ? `Reinforces ${pretty(planted.boosts)} (+1 integrity): the table is full.`
        : planted.destroyed ? `Plants ${aName(planted.kind)} your honeypot destroys on arrival.`
          : `Plants ${aName(planted.kind)} in ${zoneForNode(planted).toUpperCase()}${planted.aim ? ` beside ${pretty(planted.aim)}` : ""}${planted.kind === "tap" ? ` (−${RULES.malwarePenalty} damage until scrubbed)` : ""}.`);
  }
  if (h.field) parts.push(`${FIELD_RULES[h.field.kind].name} in ${h.field.zone.toUpperCase()} for ${h.field.turns} turns, starting next turn${h.fieldReplaced ? " (a later caster replaces it)" : ""}.`);
  if (h.junk) parts.push(`Shuffles ${h.junk.count} ${CARDS[h.junk.card].name} into your draw pile.`);
  if (h.heal) parts.push(`Restores ${h.heal} health after acting.`);
  const extra = h.terms.filter(term => term.amount > 0 && term.label !== intent.label);
  const sources = extra.length ? ` (${extra.map(term => `${term.label} +${term.amount}`).join(", ")})` : "";
  if (intent.kind === "strike" || intent.kind === "breach" || (h.raw && (extra.length || !parts.length)))
    parts.push(`${h.raw} damage after your transmission${sources}.`);
  return parts.join(" ") || "It gathers itself.";
}

/** The coral warning two actions before a level: "Level 2 in 2 actions: jams hit two devices." */
function levelWarning(r: RunState, h: HostileForecast | undefined): string {
  const next = h?.nextLevel;
  if (!next || next.inActions > 2 || next.inActions < 1) return "";
  const rule = (next.rule || levelRule(r, next.level)).replace(/\.$/, "");
  return `Level ${next.level} in ${plural(next.inActions, "action")}: ${rule.charAt(0).toLowerCase()}${rule.slice(1)}.`;
}
/** Three diamonds beside the pressure warning, filled per level reached; the tooltip lists the levels. */
function escalationGauge(r: RunState, enemy: Enemy, h: HostileForecast | undefined): string {
  if (!grows(enemy)) return "";
  const level = h?.escalation ?? 0;
  const tip = `Escalation: level ${level} of 3. ${levelRules(r).map((rule, i) => `Level ${i + 1}: ${rule}`).join(" ")}${h?.nextLevel ? ` Next: level ${h.nextLevel.level} in ${plural(h.nextLevel.inActions, "action")}.` : ""}`;
  return `<span class="escalation-gauge level-${level}" tabindex="0" role="img" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}">${[1, 2, 3].map(n => `<i class="${n <= level ? "on" : ""}"></i>`).join("")}</span>`;
}
/** The engraved band under a hostile's name: coral bad, teal good, static until revealed. */
function designationRibbon(r: RunState, enemy: Enemy, revealing: boolean): string {
  const ids = enemy.designations ?? [];
  if (!ids.length) return "";
  if (enemy.designationHidden) {
    const tip = "Unknown designation. Revealed on entry.";
    return `<span class="designation-ribbons"><span class="designation-ribbon unknown" tabindex="0" data-tooltip="${tip}" aria-label="${tip}">${designationGlyph("unknown", 18)}<b>UNKNOWN</b></span></span>`;
  }
  return `<span class="designation-ribbons">${ids.map((id: DesignationId) => {
    const d = DESIGNATIONS[id], rule = designationRule(id, r.stage);
    return `<span class="designation-ribbon ${d.kind}${revealing ? " is-revealing" : ""}" data-designation="${id}" tabindex="0" data-tooltip="${esc(`${d.ribbon}: ${rule}`)}" aria-label="${esc(`${d.ribbon} designation: ${rule}`)}">${designationGlyph(id, 18, d.kind)}<b>${esc(d.ribbon)}</b></span>`;
  }).join("")}</span>`;
}
/** The number a medallion shows for an action, with the level's effect written in ("JAM ×2"). */
function medallionNumber(intent: Intent, h: HostileForecast | undefined, fallback: number): string {
  const jams = h?.jams.length ?? intent.targets?.length ?? 0, cuts = h?.cuts.length ?? intent.cutTargets?.length ?? 0;
  if (intent.kind === "jam" && jams > 1) return `JAM ×${jams}`;
  if (intent.kind === "sever" && cuts > 1) return `CUT ×${cuts}`;
  if (intent.kind === "charge") return "CHARGE";
  if (intent.kind === "dormant") return "—";
  return fallback ? String(fallback) : "";
}
/** Plate name of an intent: the ultimate's own name, the planted kind, or the generic name. */
function intentNameFor(enemy: Enemy, intent: Intent): string {
  if (intent.ultimate) {
    const pattern = ENEMIES[enemy.id].pattern;
    return pattern[(enemy.step ?? enemy.turn) % pattern.length]?.label ?? intent.label;
  }
  if (intent.kind === "install" && intent.install) return `Plant ${aName(intent.install)}`;
  return INTENT_NAMES[intent.kind];
}

/** A strip row names the hostile without its article ("Iron Regent"); the tooltip, the
 * aria-label and the detail below keep the full name. */
const stripName = (name: string) => title(name).replace(/^The /, "");
/** One row of the port strip: who stands there, its health, what it does this phase. */
function portRow(r: RunState, p: CombatPreview, enemy: Enemy, h: HostileForecast | undefined, focus: Port | null, shown: Port): string {
  const port = p.ports[enemy.port];
  const loss = port && !p.buffering ? Math.min(enemy.hp, port.packet) + (h?.trapDamage ?? 0) : h?.trapDamage ?? 0;
  const intent = h?.intent ?? intentFor(r, enemy);
  const state = h?.state ?? (intent.kind === "dormant" ? "dormant" : "acts");
  const lethal = !!port?.lethal && !p.buffering;
  const isFocus = enemy.port === focus, isShown = enemy.port === shown;
  // Attacks show their number; other actions their glyph alone (×2 when a level doubles them).
  const number = intent.kind === "strike" || intent.kind === "breach" ? String(h?.raw ?? intent.amount) : medallionNumber(intent, h, 0).replace(/^(JAM|CUT) /, "").replace(/^(CHARGE|—)$/, "");
  const act = state === "dormant" ? `<span class="row-state is-dormant">dormant</span>`
    : state === "cancelled" ? `<span class="row-state is-cancelled">${h?.interrupted ? "Broken" : "Cancelled"}</span>`
      : state === "skipped" ? `<span class="row-state is-dormant">skips</span>`
        : `<span class="row-intent">${intentGlyph(intent, 14)}<b>${esc(number)}</b></span>`;
  const level = grows(enemy) && (h?.escalation ?? 0) > 0 ? `<i class="row-level" aria-hidden="true">${[1, 2, 3].map(n => `<i class="${n <= (h?.escalation ?? 0) ? "on" : ""}"></i>`).join("")}</i>` : "";
  const ribbon = (enemy.designations ?? []).length ? `<i class="row-ribbon" aria-hidden="true">${enemy.designationHidden ? designationGlyph("unknown", 12) : (enemy.designations ?? []).map(id => designationGlyph(id, 12, DESIGNATIONS[id].kind)).join("")}</i>` : "";
  const spite = state === "spiteful" ? `<i class="row-spite" aria-hidden="true">acts anyway</i>` : "";
  const what = state === "dormant" ? "dormant, acts next phase" : state === "cancelled" ? "cancelled by your forecast" : state === "skipped" ? "skips this action"
    : `${intentNameFor(enemy, intent)}${intent.kind === "strike" || intent.kind === "breach" ? ` ${h?.raw ?? intent.amount}` : ""}${state === "spiteful" ? ", Spiteful: acts anyway" : ""}`;
  const label = `${PORT_NAME[enemy.port]} port, ${title(enemy.name)}, ${enemy.hp} of ${enemy.maxHp} integrity${loss ? `, takes ${loss}${lethal ? ", lethal" : ""}` : ""}${port?.overflowIn ? ` including ${port.overflowIn} overflow` : ""}. ${what}.${isFocus ? " Focus." : ""}${enemy.crate ? " Carries a crate." : ""}`;
  const tip = `${title(enemy.name)} · ${enemy.hp} / ${enemy.maxHp}${loss ? ` · takes ${loss}${lethal ? " · LETHAL" : ""}` : ""}${port?.overflowIn ? ` (+${port.overflowIn} overflow)` : ""} · ${what}${enemy.crate ? " · carries a crate" : ""}`;
  // The focus crest is the port's own stud: a brass diamond engraved with the port letter, lit on
  // the focus, dim on a selected row (click it, or press F, to make that port the focus).
  const crest = isFocus || isShown;
  return `<div class="port-row-slot${isShown ? " is-selected" : ""}${isFocus ? " is-focus" : ""}">
    <button class="port-row state-${state}${isShown ? " is-selected" : ""}${isFocus ? " is-focus" : ""}${lethal ? " is-lethal" : ""}${crest ? " has-crest" : ""}" data-port="${enemy.port}" aria-pressed="${isShown}" aria-label="${esc(label)}" data-tooltip="${esc(tip)}" style="--hostile:#${enemy.color.toString(16).padStart(6, "0")}">
      <span class="port-letter${enemy.crate ? " has-crate" : ""}" aria-hidden="true">${PORT_LETTER[enemy.port]}</span>
      <span class="port-name"><span>${esc(stripName(enemy.name))}</span>${ribbon}<b>${enemy.hp}</b></span>
      ${level}${act}${spite}
      <i class="port-bar" aria-hidden="true"><i style="width:${enemy.hp / enemy.maxHp * 100}%"></i>${loss ? `<i class="health-risk" style="left:${Math.max(0, enemy.hp - loss) / enemy.maxHp * 100}%;width:${Math.min(enemy.hp, loss) / enemy.maxHp * 100}%"></i>` : ""}</i>
    </button>
    ${crest ? `<button class="port-crest${isFocus ? " is-on" : ""}" data-focus-port="${enemy.port}" aria-pressed="${isFocus}" aria-label="${esc(isFocus ? `${title(enemy.name)} is the focus: unaimed deliveries and overflow go here` : `Set the focus on ${title(enemy.name)}, ${PORT_NAME[enemy.port].toLowerCase()} port · F`)}" data-tooltip="${esc(isFocus ? "Focus: every unaimed delivery and all overflow land here." : "Make this the focus · F")}"><b aria-hidden="true">${PORT_LETTER[enemy.port]}</b></button>` : ""}
  </div>`;
}
/** An announced arrival holds its empty port with a dashed row. */
function arrivalRow(p: CombatPreview, follows: boolean): string {
  const a = p.arrivals;
  if (!a) return "";
  const name = title(ENEMIES[a.enemyId]?.name ?? a.enemyId);
  const when = a.inPhases <= 1 ? "arrives after this action" : `arrives in ${a.inPhases} actions`;
  const text = `${a.port ? `${PORT_NAME[a.port]} · ` : ""}signal detected · ${name} ${when}`;
  return `<div class="port-row-slot is-arrival${follows ? " is-following" : ""}"><div class="port-row state-arrival" role="note" aria-label="${esc(text)}" data-tooltip="${esc(`SIGNAL DETECTED · ${name} ${when}${a.port ? ` at the ${a.port} port` : ""}. It takes the port with a crate and acts as an escort.`)}"><span class="port-letter" aria-hidden="true">${a.port ? PORT_LETTER[a.port] : "·"}</span><span class="port-name"><span>${esc(stripName(name))}</span></span><span class="row-state is-arrival">${a.inPhases <= 1 ? "next" : `in ${a.inPhases}`}</span></div></div>`;
}

/** Deliveries: one row per live channel, three port studs each; the footer totals each port. */
function deliveriesMarkup(r: RunState, p: CombatPreview, v: BattleView): string {
  if (!p.deliveries.length || p.buffering) return "";
  const living = new Set(livingEnemies(r).map(enemy => enemy.port));
  const selected = v.hud?.delivery ?? null;
  const rows = p.deliveries.map(d => {
    const name = d.primary ? "Primary" : `Channel ${d.index + 1}`;
    const studs = PORTS.map(port => {
      const enemy = living.has(port) ? r.enemies.find(item => item.port === port && item.hp > 0) : null;
      const current = d.port === port;
      const label = enemy ? `${current ? "Aimed at" : "Aim"} the ${name.toLowerCase()} delivery, ${d.amount} damage, ${current ? "" : "at "}the ${port} port, ${title(enemy.name)}` : `${PORT_NAME[port]} port is empty`;
      return `<button class="port-stud${current ? " is-current" : ""}" data-aim="${esc(d.channelKey)}" data-aim-port="${port}" aria-pressed="${current}" aria-label="${esc(label)}" ${enemy ? "" : "disabled"} ${enemy ? `data-tooltip="${esc(`${enemy ? title(enemy.name) : ""}${current ? " · receives it" : " · aim here"}`)}"` : ""}>${PORT_LETTER[port]}</button>`;
    }).join("");
    const tip = `${name}: ${d.amount} damage → ${d.port.toUpperCase()}${d.aimed ? " (aimed)" : " (follows the focus)"}. ${d.terms.map(t => `${t.label} ${t.amount >= 0 ? "+" : ""}${t.amount}`).join("; ")}`;
    return `<div class="delivery-row${d.primary ? " is-primary" : ""}${selected === d.channelKey ? " is-selected" : ""}${d.aimed ? " is-aimed" : ""}" data-delivery="${esc(d.channelKey)}" role="group" aria-label="${esc(`${name}, ${d.amount} damage, aimed at the ${d.port} port`)}"><span class="delivery-mark" data-tooltip="${esc(tip)}">${glyph(d.primary ? "hexagon" : "diamond", 12)}<span>${d.primary ? "Primary" : `Ch ${d.index + 1}`}</span></span><b class="delivery-amount">${d.amount}</b><span class="delivery-studs">${studs}</span></div>`;
  }).join("");
  // Footer: overflow first, then what lands on each port (gold when lethal).
  const landing = PORTS.flatMap(port => {
    const forecast = p.ports[port];
    return forecast && (forecast.packet || forecast.merged) ? [{ port, packet: forecast.packet, lethal: forecast.lethal }] : [];
  });
  const overflow = PORTS.flatMap(port => {
    const forecast = p.ports[port];
    return forecast?.overflowOut && forecast.overflowTo ? [`overflow ${forecast.overflowOut} → ${forecast.overflowTo.toUpperCase()}`] : [];
  });
  const foot = [...overflow, ...landing.map(item => `${item.port.toUpperCase()} ${item.packet}${item.lethal ? " lethal" : ""}`)].join(" · ");
  // The foot is the ledger's totals line: what lands on each port, set under that port's stud
  // column (the frame's bottom crest owns the plate's centre), and any overflow on its own line.
  const cells = PORTS.map(port => {
    const item = landing.find(entry => entry.port === port);
    return item ? `<b class="${item.lethal ? "is-lethal" : ""}"><span class="visually-hidden">${PORT_LETTER[port]} </span>${item.packet}</b>` : `<b class="is-empty" aria-hidden="true">·</b>`;
  }).join("");
  const footMarkup = `${overflow.map(text => `<span class="foot-overflow">${esc(text)}</span>`).join("")}<span class="foot-totals"><span class="foot-label">lands</span><span class="foot-cells">${cells}</span></span>`;
  return `<section class="deliveries" aria-label="Deliveries: ${esc(foot)}"><div class="deliveries-head"><span>Deliveries</span><span class="deliveries-keys" aria-hidden="true"><kbd>[</kbd><kbd>]</kbd><kbd>T</kbd><kbd>F</kbd></span></div>${rows}${foot ? `<div class="deliveries-foot" data-tooltip="${esc(`Lands: ${foot}. [ ] choose a delivery · T aims it at the next port · F sets the focus`)}">${footMarkup}</div>` : ""}</section>`;
}

/** Extras for the shown hostile: one line each, in the hazard-caption voice. */
function extrasMarkup(r: RunState, p: CombatPreview, enemy: Enemy, h: HostileForecast | undefined, pack: boolean): string {
  const intent = h?.intent ?? p.intent;
  const lines: string[] = [];
  const traps = pack ? (h?.trapDamage ?? 0) + (h?.scorched ?? 0) : p.enemyDamage;
  if (traps) lines.push(`<span class="hazard-caption is-trap">${icon("trap", 13)} TRAPS · ${pack ? "IT TAKES" : "ENEMY TAKES"} ${traps}${!pack && p.enemyDefeatedByTraps ? " · LETHAL" : ""}</span>`);
  const triggers = pack ? p.protocolTriggers.filter(t => !t.target || t.target === enemy.uid) : p.protocolTriggers;
  if (triggers.length) lines.push(`<span class="hazard-caption is-counter">${icon("trigger", 13)} COUNTERED · ${esc(triggers.map(t => t.name).join(" + "))}</span>`);
  if (pack) {
    if (h?.field) lines.push(`<span class="hazard-caption">${icon("field", 13)} ${FIELD_RULES[h.field.kind].name.toUpperCase()} · ${h.field.zone.toUpperCase()}</span>`);
  } else if (p.hazardZone) lines.push(`<span class="hazard-caption" ${intent?.field ? 'data-combined-intent="true"' : ""}>${icon("field", 13)} ${p.zoneThreat ? `${FIELD_RULES[p.zoneThreat.kind].name.toUpperCase()} · ` : ""}${p.hazardZone.toUpperCase()}</span>`);
  const installs = pack ? (h?.install && !h.install.absorbed ? [h.install] : []) : p.installTargets;
  for (const planted of installs) lines.push(`<span class="hazard-caption is-install is-infect${pack ? " is-echo" : ""}">${glyph(planted.kind, 13)} ${INSTALLATION_NAMES[planted.kind].toUpperCase()} · ${planted.boosts ? `+1 ${pretty(planted.boosts)}` : planted.destroyed ? "BITTEN ON ARRIVAL" : `${zoneForNode(planted).toUpperCase()}${planted.bitten ? " · BITTEN" : ""}`}</span>`);
  const wear = p.wear.filter(item => item.source !== INSTALLATION_NAMES.spike && (!pack || item.source.toLowerCase().startsWith(title(enemy.name).toLowerCase())));
  for (const worn of wear) {
    const node = r.topology.nodes.find(n => n.id === worn.nodeId);
    lines.push(`<span class="hazard-caption is-wear">${glyph("cracked", 13)} ${worn.breaks ? "BREAKS" : "WEARS"} ${esc(pretty(worn.nodeId))}${worn.breaks ? leavesWreck(p, worn.nodeId) ? " · WRECKAGE" : "" : ` · ${pips(worn.to, node ? maxConditionOf(node) : worn.from)}`}</span>`);
  }
  const junk = pack ? h?.junk : p.junk;
  if (junk) lines.push(`<span class="hazard-caption is-junk">${icon("deck", 13)} +${junk.count} ${esc(CARDS[junk.card].name.toUpperCase())}</span>`);
  const heal = pack ? h?.heal ?? 0 : p.enemyHealing;
  if (heal) lines.push(`<span class="hazard-caption">Restores ${heal} health this turn</span>`);
  if (h?.state === "spiteful") lines.push(`<span class="hazard-caption is-spite">${designationGlyph("spiteful", 13)} SPITEFUL · ACTS ANYWAY</span>`);
  const carriers = pack ? livingEnemies(r).filter(item => item.crate) : [];
  if (carriers.length) lines.push(`<span class="hazard-caption is-crate is-echo" data-tooltip="A crate rides on ${esc(carriers.map(item => title(item.name)).join(" and "))}: defeat it to open it.">${glyph("crate", 13)} CRATE · ${carriers.map(item => item.port.toUpperCase()).join(", ")}</span>`);
  if (p.signal) {
    const signal = SIGNALS[p.signal.id as keyof typeof SIGNALS];
    lines.push(`<span class="hazard-caption is-signal ${signal?.kind ?? ""}" data-tooltip="${esc(`${signal?.name ?? "Signal"}: ${p.signal.text || signal?.rule || ""}`)}">${glyph("signal", 13)} ${esc(signal?.name ?? "SIGNAL")} · TURN ${p.signal.firesOnTurn}</span>`);
  }
  // A pack's strip already holds the announced port with a dashed row.
  if (p.arrivals && !pack) {
    const name = ENEMIES[p.arrivals.enemyId]?.name ?? p.arrivals.enemyId.toUpperCase();
    lines.push(`<span class="hazard-caption is-arrival">${icon("warning", 13)} SIGNAL DETECTED · ${esc(title(name))} ${p.arrivals.inPhases <= 1 ? "arrives after this action" : `arrives in ${p.arrivals.inPhases} actions`}</span>`);
  }
  return lines.join("");
}

/** The guardian's window: "12 / 18 damage · +4 per living add", one meter segment per add. On the
 * charge turn it names the threshold the ultimate will carry next turn against this turn's packet;
 * on the ultimate turn, the interrupt itself. */
function bossWindowMarkup(r: RunState, p: CombatPreview, enemy: Enemy, intent: Intent): string {
  if (p.lethal) return "";
  const charging = intent.kind === "charge" && !!ENEMIES[enemy.id].boss;
  if (!intent.ultimate && !charging) return enemy.exposed ? `<div class="boss-window broken"><span>EXPOSED THIS TURN</span><strong>+${RULES.exposedBonus} damage · armor bypassed</strong></div>` : "";
  const port = p.ports[enemy.port];
  const threshold = breakAhead(r, p, enemy);
  const packet = p.buffering ? 0 : port?.packet ?? p.packetDamage;
  const adds = r.enemies.filter(item => item.role === "add");
  const bonus = addBonus(r);
  const base = ENEMIES[enemy.id].boss?.breakDamage ?? threshold;
  const most = Math.max(threshold, base + adds.length * bonus, 1);
  const standing = new Set(standingAdds(r, p).map(add => add.uid));
  const segments = adds.length ? `<span class="break-segments" aria-hidden="true"><b style="width:${base / most * 100}%"></b>${adds.map(add => `<b class="${standing.has(add.uid) ? "is-lit" : ""}" style="width:${bonus / most * 100}%"></b>`).join("")}</span>` : "";
  const interrupted = !charging && (!!port?.breaks || p.interrupted);
  const head = charging ? "INTERRUPT NEXT TURN" : interrupted ? "INTERRUPT READY" : "INTERRUPT THIS TURN";
  const label = charging ? `Break next turn at ${threshold} damage; your transmission now: ${packet}` : "Damage to interrupt ultimate";
  return `<div class="boss-window ${interrupted ? "broken" : charging ? "charging" : "ultimate"}${adds.length ? " has-adds" : ""}" role="status" data-tooltip="${esc(`${head.charAt(0)}${head.slice(1).toLowerCase()}: ${packet} of ${threshold} damage.${adds.length ? ` Each living add raises the threshold by ${bonus} (${standing.size} standing; base ${base}).` : ""}`)}"><span>${head}</span><strong>${packet} / ${threshold} damage</strong>${adds.length ? `<small class="break-adds">+${bonus} per living add · ${standing.size} standing</small>` : ""}<div class="break-meter" role="meter" aria-label="${esc(label)}" aria-valuenow="${Math.min(packet, threshold)}" aria-valuemin="0" aria-valuemax="${threshold}"><i style="width:${Math.min(100, packet / (adds.length ? most : threshold || 1) * 100)}%"></i>${adds.length ? `<em class="break-mark" style="left:${threshold / most * 100}%"></em>` : ""}${segments}</div></div>`;
}

/** The hostile plate. One hostile: today's plate. A pack: the port strip, then the chosen port's detail. */
function enemyPlate(r: RunState, p: CombatPreview, v: BattleView, stage: (typeof STAGES)[number]): string {
  const living = livingEnemies(r);
  const focus = p.focus ?? effectiveFocus(r);
  const pack = living.length > 1;
  const chosen = (v.hud?.port && living.find(enemy => enemy.port === v.hud!.port)) || living.find(enemy => enemy.port === focus) || leaderOf(r)!;
  const enemy = pack ? chosen : leaderOf(r)!;
  const h = p.hostiles.find(item => item.uid === enemy.uid);
  const definition = ENEMIES[enemy.id];
  const intent = pack ? h?.intent ?? intentFor(r, enemy) : p.intent ?? intentFor(r, enemy);
  const buffering = p.buffering;
  const port = p.ports[enemy.port];
  const hit = buffering ? 0 : Math.min(enemy.hp, port?.packet ?? 0);
  const trapped = h?.trapDamage ?? 0;
  const intentName = intentNameFor(enemy, intent);
  // Defeated before it acts: CANCELLED; an interrupted ultimate: BROKEN (as today for one hostile).
  const defeated = pack ? h?.state === "cancelled" && (!h.interrupted || !!port?.lethal) : p.lethal || p.enemyDefeatedByTraps;
  const broken = pack ? !!h?.interrupted && !defeated : p.interrupted && !defeated;
  const cancelled = defeated || broken;
  const raw = pack ? h?.raw ?? 0 : p.incomingRaw;
  const number = defeated ? "CANCELLED" : broken ? "BROKEN" : medallionNumber(intent, h, raw);
  const warning = levelWarning(r, h);
  const copy = pack && h ? hostileCopy(r, p, h) : intentCopy(r, p);
  const states = `${intent.label.startsWith("ENRAGED") ? '<b class="enrage-warning">Enraged</b>' : ""}${intent.pressure ? `<span class="pressure-warning">Pressure +${intent.pressure}</span>` : ""}${escalationGauge(r, enemy, h)}`;
  const dormant = h?.state === "dormant";
  const medallion = dormant
    ? `<div class="intent-medallion intent-dormant is-small"><span class="intent-emblem">${icon("next", 20)}</span><strong><small>Dormant · acts next phase</small></strong></div>`
    : `<div class="intent-medallion intent-${intent.kind}${intent.install ? ` install-${intent.install}` : ""} ${cancelled ? "lethal" : ""}${h?.state === "spiteful" ? " is-spiteful" : ""}" data-tooltip="${esc(`${intentName}: ${copy}${warning ? ` ${warning}` : ""}`)}"><span class="intent-emblem">${intentGlyph(intent, 30)}</span><strong>${esc(number)}<small>${esc(intentName)}</small></strong></div>`;
  const description = `<p class="intent-description" data-tooltip="${esc(`${copy}${warning ? ` ${warning}` : ""}`)}">${esc(copy)}${warning ? ` <span class="escalation-next">${esc(warning)}</span>` : ""}</p>`;
  const guardian = pack ? living.find(item => ENEMIES[item.id].boss) : undefined;
  const guardianIntent = guardian ? p.hostiles.find(item => item.uid === guardian.uid)?.intent ?? intentFor(r, guardian) : null;
  const tools = `${medallion}${pack ? "" : bossWindowMarkup(r, p, enemy, intent)}${description}<div class="intent-extras">${extrasMarkup(r, p, enemy, h, pack)}</div>`;
  const ribbon = designationRibbon(r, enemy, !!v.revealing);
  if (!pack) {
    // With one hostile nothing moves: today's plate, plus the ribbon, the gauge and any announcement.
    return `<aside class="battle-right battle-plate enemy-plate" aria-label="Enemy intent">
      <div class="combatant-identity"><span class="combatant-seal">${icon(definition.boss ? "boss" : "sword", 25)}</span><div>${kicker(definition.boss ? `Stage ${stage.numeral} · Guardian` : v.training ? "Training Signal" : "Hostile Signal")}<h2>${esc(title(enemy.name))}</h2></div></div>
      ${ribbon}
      <span class="enemy-flavor">${esc(enemyStory(enemy.id)?.title ?? enemy.title)}</span>
      <div class="vital-heading enemy-health-label"><span>Integrity</span><strong>${enemy.hp}<small> / ${enemy.maxHp}</small></strong></div>
      <div class="enemy-health vital-bar" data-port="${enemy.port}" role="meter" aria-label="Hostile integrity" aria-valuenow="${enemy.hp}" aria-valuemin="0" aria-valuemax="${enemy.maxHp}" data-tooltip="${buffering ? `Buffering: no damage this turn, +${p.bufferGain} stored` : `${hit} damage on your next transmission`}${trapped ? ` · traps +${trapped}` : ""}"><span style="width:${enemy.hp / enemy.maxHp * 100}%"></span>${hit + trapped ? `<i class="health-risk" style="left:${Math.max(0, enemy.hp - hit - trapped) / enemy.maxHp * 100}%;width:${Math.min(enemy.hp, hit + trapped) / enemy.maxHp * 100}%"></i>` : ""}</div>
      <button class="trait-badge" data-action="enemy-dossier" data-tooltip="${esc(p.traitDescription)}">${icon("elite", 13)} ${esc(definition.badge)}</button>
      <div class="intent-heading"><span>Next intent</span><span class="intent-states">${states}</span></div>
      ${tools}
    </aside>`;
  }
  // An announced arrival holds its port with a dashed row; when the port's hostile falls to this
  // transmission, the arrival row follows it (the newcomer takes the port it leaves).
  const rows = PORTS.map(slot => {
    const standing = living.find(item => item.port === slot);
    const arriving = p.arrivals?.port === slot ? arrivalRow(p, !!standing) : "";
    if (standing) return portRow(r, p, standing, p.hostiles.find(item => item.uid === standing.uid), focus, enemy.port) + arriving;
    return arriving;
  }).join("") + (p.arrivals && !p.arrivals.port ? arrivalRow(p, false) : "");
  const leader = living.find(grows);
  // Short tables carry the ribbon as glyphs beside the name (the word and rule in the tooltip).
  const marks = (enemy.designations ?? []).length ? `<span class="detail-marks">${enemy.designationHidden
    ? `<span class="designation-ribbon-mark" tabindex="0" data-tooltip="Unknown designation. Revealed on entry.">${designationGlyph("unknown", 16)}</span>`
    : (enemy.designations ?? []).map(id => `<span class="designation-ribbon-mark ${DESIGNATIONS[id].kind}" tabindex="0" data-designation="${id}" data-tooltip="${esc(`${DESIGNATIONS[id].ribbon}: ${designationRule(id, r.stage)}`)}" aria-label="${esc(`${DESIGNATIONS[id].ribbon} designation: ${designationRule(id, r.stage)}`)}">${designationGlyph(id, 16, DESIGNATIONS[id].kind)}</span>`).join("")}</span>` : "";
  const kick = definition.boss || (leader && ENEMIES[leader.id].boss) ? `Stage ${stage.numeral} · Guardian` : v.training ? "Training Signal" : "Hostile Pack";
  return `<aside class="battle-right battle-plate enemy-plate is-pack" aria-label="Hostiles, ${living.length} standing">
      <div class="combatant-identity pack-identity"><span class="combatant-seal">${icon(definition.boss ? "boss" : "sword", 25)}</span><div>${kicker(kick)}</div></div>
      <div class="port-strip" role="group" aria-label="Hostiles in phase order: left, centre, right">${rows}</div>
      ${guardian && guardianIntent ? bossWindowMarkup(r, p, guardian, guardianIntent) : ""}
      <div class="port-detail" aria-label="${esc(`Selected: ${title(enemy.name)}`)}">
        <div class="port-detail-head"><h2>${esc(title(enemy.name))}</h2>${marks}<button class="trait-badge" data-action="enemy-dossier" data-tooltip="${esc(`${definition.badge}: ${definition.trait}`)}" aria-label="${esc(`${definition.badge}: ${definition.trait}`)}">${icon("elite", 13)}<span>${esc(definition.badge)}</span></button></div>
        ${ribbon}
        ${states ? `<div class="intent-heading"><span>Next<span class="wide-only"> intent</span></span><span class="intent-states">${states}</span></div>` : ""}
        ${tools}
      </div>
      ${deliveriesMarkup(r, p, v)}
    </aside>`;
}

/** Playback hook (the world agent's transmit choreography): a port's packet has landed.
 * Updates that port's health wherever the HUD shows it, in place, without a re-render. */
export function showPortHit(port: Port, hp: number, maxHp: number): void {
  const width = `${Math.max(0, hp) / Math.max(1, maxHp) * 100}%`;
  const row = document.querySelector<HTMLElement>(`.port-row[data-port="${port}"]`);
  if (row) {
    const bar = row.querySelector<HTMLElement>(".port-bar > i:first-child");
    if (bar) bar.style.width = width;
    row.querySelector(".port-bar .health-risk")?.remove();
    const number = row.querySelector(".port-name > b");
    if (number) number.textContent = String(Math.max(0, hp));
  }
  const health = document.querySelector<HTMLElement>(`.enemy-health[data-port="${port}"]`)
    ?? (document.querySelector(".enemy-plate.is-pack") ? null : document.querySelector<HTMLElement>(".enemy-health"));
  if (!health) return;
  health.setAttribute("aria-valuenow", String(Math.max(0, hp)));
  const fill = health.querySelector<HTMLElement>("span");
  if (fill) fill.style.width = width;
  health.querySelector(".health-risk")?.remove();
  const label = document.querySelector(".enemy-health-label strong");
  if (label) label.innerHTML = `${Math.max(0, hp)}<small> / ${maxHp}</small>`;
}

/** Condition pips of a device for plates and tags: "◆◇". */
export function conditionPips(node: Parameters<typeof conditionOf>[0]): string {
  return pips(conditionOf(node), maxConditionOf(node));
}
/** Integrity pips of an installation (max 3). */
export function integrityPips(item: Pick<Installation, "integrity" | "kind">): string {
  return pips(item.integrity, Math.max(item.integrity, RULES.installationIntegrity[item.kind] ?? item.integrity));
}
/** One line naming what an installation does next, from the forecast. */
export function installationEffectLine(r: RunState, p: CombatPreview, item: Installation): string {
  const effect = p.installationEffects.find(entry => entry.id === item.id);
  const reach = RULES.reach.toFixed(1);
  if (item.kind === "tap") return `Siphons ${RULES.malwarePenalty} damage from every transmission while it stands.`;
  if (item.kind === "anchor") return `Holds every hostile field in ${zoneForNode(item).toUpperCase()}: they do not tick down.`;
  if (!effect || effect.effect === "idle")
    return item.kind === "breaker" ? `Armed: counts down from ${item.countdown ?? RULES.breakerCountdown} starting with the next hostile action.` : `Acts from the next hostile action (reach ${reach}).`;
  const target = effect.target ? pretty(effect.target) : null;
  if (effect.effect === "jam") return effect.decoyed ? `Its jam goes to your honeypot ${target}, which bites back.` : effect.cancelled ? "Port Security cancels its jam." : effect.absorbed ? "Your Phantom Node absorbs its jam." : target ? `Jams ${target} at the next enemy action.` : `Nothing unprotected within ${reach}.`;
  if (effect.effect === "wear") {
    const worn = p.wear.find(record => record.source === INSTALLATION_NAMES.spike && (record.nodeId === effect.target || record.sheltered === effect.target));
    return worn ? `Wears ${pretty(worn.nodeId)}: condition ${worn.from} → ${worn.to}${worn.breaks ? " · it breaks" : ""}.` : `Wears ${target} at the next enemy action.`;
  }
  if (effect.effect === "tick") return `Counts down to ${effect.countdown}: detonates after ${plural(effect.countdown ?? 1, "more action")}.`;
  if (effect.effect === "detonate") return `Detonates this phase: every device within ${reach} breaks.`;
  return "";
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
      label: risk ? "AT RISK" : "Buffer", value: String(r.buffer), state: risk ? "at-risk" : p.buffering || r.buffer ? "is-active" : "",
      tip: `Buffer: ${r.buffer} stored. ${state} Buffering stores a transmission ×${RULES.bufferMultiplier}; the next normal transmission releases it all. No live route at the start of a turn loses the whole buffer.${risk ? " Warning: the forecast enemy action leaves you without a live route." : ""}`,
    };
  }
  if (r.archetype === "warden") return {
    label: "Pressure", value: String(r.backpressure), state: r.backpressure || p.backpressureGain ? "is-active" : "",
    tip: `Backpressure: ${Math.round(RULES.backpressureRatio * 100)}% of the damage your shield prevents is stored and added to your next transmission. ${r.backpressure} rides this transmission; +${p.backpressureGain} will be stored after this enemy action.`,
  };
  const per = r.relics.includes("parallel-core") ? RULES.parallelCorePerChannel : RULES.bandwidthPerChannel;
  const bandwidth = r.relics.includes("spanning-tree") ? 0 : Math.max(0, p.channels - 1) * per;
  return {
    label: plural(p.channels, "channel"), value: `+${bandwidth}`, state: p.channels > 1 ? "is-active" : "",
    tip: `Bandwidth: +${per} damage for every channel beyond the first (${p.channels} now). Every device carries one channel: routes through the same device are one channel. A cut on one channel leaves the others transmitting.`,
  };
}

function consoleMarkup(r: RunState, p: CombatPreview, v: BattleView): string {
  const c = consoleState(r), engine = engineFor(r, p);
  const brief = c.id === "patch" ? (v.consoleTargeting ? (v.source ? "Pick the second device" : "Pick the first device") : "Connect two devices")
    : c.id === "harden" ? `+${hardenBlock(r)} block now`
    : c.active ? `Storing +${p.bufferGain}` : `Store this turn ×${RULES.bufferMultiplier}`;
  const state = v.consoleTargeting ? "targeting" : c.active ? "active" : c.usable ? "ready" : c.uses >= c.limit ? "spent" : "blocked";
  const status = state === "targeting" ? "Select" : state === "active" ? "On" : state === "spent" ? "Used" : state === "blocked" ? "No energy" : c.limit > 1 ? `${c.limit - c.uses} left` : "Ready";
  const glyph = c.id === "patch" ? "link" : c.id === "harden" ? "shield" : "buffer";
  return `<div class="console-control">
    <button class="console-button console-${c.id} is-${state}" data-action="console" aria-pressed="${c.active || v.consoleTargeting}" ${(!c.usable && !v.consoleTargeting) || v.busy ? "disabled" : ""} data-tooltip="${esc(`${c.name} · ${c.cost} energy. ${c.rules}${c.reason && !c.active ? ` ${c.reason}` : ""}`)}" aria-label="${esc(`Console command ${c.name}, ${c.cost} energy. ${c.rules} ${c.reason}`)}">
      <span class="console-glyph">${icon(glyph, 20)}</span>
      <span class="console-copy"><small>Console <kbd>C</kbd> · ${status}</small><strong>${esc(c.name)}</strong><em>${esc(brief)}</em></span>
      <span class="console-cost"><b>${c.cost}</b></span>
    </button>
    <span class="engine-badge ${engine.state}" tabindex="0" data-tooltip="${esc(engine.tip)}" aria-label="${esc(engine.tip)}"><strong>${esc(engine.value)}</strong><small>${engine.state === "at-risk" ? icon("warning", 9) : ""}${esc(engine.label)}</small></span>
  </div>`;
}

function protocolDock(r: RunState, p: CombatPreview): string {
  const slots = Array.from({ length: RULES.maxProtocols }, (_, i) => {
    const id = r.protocols[i];
    if (!id) return `<span class="protocol-slot empty" aria-label="Empty protocol slot"><i>${icon("protocol", 15)}</i><small>Protocol slot<br><span>Arm a protocol card</span></small></span>`;
    const c = CARDS[id], trigger = p.protocolTriggers.find(t => t.card === id);
    return `<button class="protocol-slot armed ${trigger ? "will-trigger" : ""}" data-card-id="${id}" data-tooltip="${esc(`${c.name}: ${c.rules}${trigger ? ` — fires this turn: ${trigger.effect}` : ""}`)}" aria-label="${esc(`${c.name}, armed. ${trigger ? `Will fire this turn: ${trigger.effect}` : `Waits for ${TRIGGER_WORDS[c.protocol!]}`}`)}"><i>${icon(TRIGGER_ICONS[c.protocol!] ?? "protocol", 15)}</i><span><strong>${esc(c.name)}</strong><small>${trigger ? `${icon("trigger", 10)} Fires · ${esc(trigger.effect)}` : `Armed · waits for ${TRIGGER_WORDS[c.protocol!]}`}</small></span></button>`;
  }).join("");
  return `<section class="protocol-dock ${p.protocolTriggers.length ? "has-trigger" : ""}" aria-label="Armed protocols, ${r.protocols.length} of ${RULES.maxProtocols}"><div class="protocol-slots">${slots}</div></section>`;
}

function ledgerMarkup(r: RunState, p: CombatPreview, v: BattleView): string {
  const devices = r.topology.nodes.filter(n => !n.fixed);
  const chips: string[] = [];
  for (const fault of [...r.faultNodes, ...r.faultLinks])
    chips.push(`<span class="ledger-chip is-fault" data-tooltip="Faults last for this player turn. Hot Patch, Link Recovery or Fast Reroute clear every one; a second channel keeps transmitting.">${icon("link", 13)} Fault · <b>${esc(pretty(fault))}</b></span>`);
  if (!p.signalPath.length) chips.push(`<span class="ledger-chip is-offline" data-tooltip="A route runs ALPHA → router → OMEGA through live cables.">${icon("online", 13)} No live route</span>`);
  else {
    // "3 routes · 2 channels": every live route counts, and routes through one device are one channel.
    // A diamond per channel in its table colour; the tooltip names the devices where routes merge.
    const shared = p.sharedDevices.map(item => `${item.id.toUpperCase()} (${item.routes} routes)`).join(", ");
    const tip = `${plural(p.routeCount, "route")} from ALPHA to OMEGA make ${plural(p.channels, "channel")}. Every device carries one channel: when two routes go through the same device, they are one channel, not two.${shared ? ` Shared here: ${shared}.` : ""} Each channel is a delivery, and every channel beyond the first adds bandwidth.`;
    const swatches = Array.from({ length: p.channels }, (_, i) => `<i style="--channel:${channelCss(i)}"></i>`).join("");
    chips.push(`<span class="ledger-chip is-channels ${p.channels > 1 ? "is-strong" : ""}" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}">${icon("channels", 13)} <b>${p.routeCount}</b> route${p.routeCount === 1 ? "" : "s"} · <b>${p.channels}</b> channel${p.channels === 1 ? "" : "s"}<i class="channel-swatches" aria-hidden="true">${swatches}</i></span>`);
  }
  if (devices.length) chips.push(`<span class="ledger-chip is-online ${p.online.length < devices.length ? "has-offline" : ""}" data-tooltip="${esc(`Online devices sit on at least one live route; offline devices do nothing. ${devices.filter(n => !p.online.includes(n.id)).map(n => n.id.toUpperCase()).join(", ") || "Everything is online."}`)}">${icon("online", 13)} <b>${p.online.length}/${devices.length}</b> online</span>`);
  for (const zone of p.clusters) chips.push(`<span class="ledger-chip is-cluster" data-tooltip="${esc(`${zone.toUpperCase()} holds ${RULES.clusterThreshold}+ online devices: +${RULES.clusterDamage} damage. Clustered bands are also easier for band attacks to hit.`)}">${icon("cluster", 13)} ${title(zone)} cluster <b>+${RULES.clusterDamage}</b></span>`);
  const scrub = scrubCost(r);
  // One iron tag per installation (kind and integrity pips); a click scrubs one point, or, while
  // Demolition Charge is choosing, names the installation it destroys.
  for (const m of r.installations) {
    const name = INSTALLATION_NAMES[m.kind], next = installationEffectLine(r, p, m);
    const aim = v.hud?.demolition
      ? `data-demolish="${m.id}" aria-label="${esc(`Destroy the ${name} in ${zoneForNode(m).toUpperCase()} with the Demolition Charge`)}"`
      : `data-scrub="${m.id}" aria-label="${esc(`Scrub the ${name}, ${scrub} energy, ${m.integrity} integrity left`)}" ${r.energy < scrub ? "disabled" : ""}`;
    chips.push(`<button class="ledger-chip is-malware is-installation kind-${m.kind}${v.hud?.installation === m.id ? " is-selected" : ""}${v.hud?.demolition ? " is-target" : ""}" ${aim} data-tooltip="${esc(`${name} in ${zoneForNode(m).toUpperCase()}, integrity ${m.integrity}. ${next} Scrub one point for ${scrub} energy (S), or Purge Field its band.`)}">${glyph(m.kind, 13)}<i class="tag-name">${name}</i><i class="tag-pips">${integrityPips(m)}</i>${m.kind === "breaker" && m.countdown !== undefined ? `<i class="tag-count" aria-label="detonates in ${m.countdown}">${m.countdown}</i>` : ""}<em>${v.hud?.demolition ? "Destroy" : `<b>${scrub}</b>${icon("bolt", 12)}`}</em></button>`);
  }
  // One wear tag names every worn device; each device inside it is its own repair button.
  const repair = repairCost(r), worn = r.topology.nodes.filter(isWorn);
  if (worn.length) chips.push(`<span class="ledger-chip is-wear" data-tooltip="${esc(`Worn devices break at condition 0 with their cables and leave wreckage. Repair one point for ${repair} energy each (R).`)}">${glyph("cracked", 13)} Worn${worn.map(n => `<button class="is-worn" data-repair="${n.id}" aria-label="${esc(`Repair ${n.id.toUpperCase()}, ${repair} energy, condition ${conditionOf(n)} of ${maxConditionOf(n)}`)}" ${r.energy < repair ? "disabled" : ""}>${esc(pretty(n.id))}<i class="tag-pips">${conditionPips(n)}</i></button>`).join("")}<em><b>${repair}</b>${icon("bolt", 12)}</em></span>`);
  if (r.terrain) chips.push(`<span class="ledger-chip is-terrain" data-tooltip="${esc(`${r.terrain.name}: ${r.terrain.description}`)}">${icon("terrain", 13)} ${esc(r.terrain.name)}</span>`);
  const base = RULES.handDraw;
  chips.push(`<span class="ledger-chip is-next" data-tooltip="${esc(`Next turn after the forecast enemy action: ${p.nextTurn.energy} energy and ${p.nextTurn.draw} cards. Online PoE Injectors add energy; online Cache Servers add draws. A cut or jam can take them offline first.`)}">${icon("next", 13)} Next · <b>${p.nextTurn.energy}</b>${icon("bolt", 12)} · <b>${p.nextTurn.draw}</b> card${p.nextTurn.draw === 1 ? "" : "s"}${p.nextTurn.draw > base ? `<i class="ledger-rise" aria-label="more than usual">${icon("rise", 12)}</i>` : ""}</span>`);
  return `<div class="network-status network-ledger" aria-label="Network status">${chips.join("")}</div>`;
}

function fieldStrip(r: RunState, p: CombatPreview, targeting: boolean): string {
  return `<div class="field-strip" aria-label="Battlefield bands">${ZONES.map((zone: Zone) => {
    const effects = r.zoneEffects.filter(effect => effect.zone === zone);
    const threatened = p.hazardZone === zone;
    const inBand = r.topology.nodes.filter(n => !n.fixed && zoneForNode(n) === zone);
    const online = inBand.filter(n => p.online.includes(n.id)).length;
    const cluster = p.clusters.includes(zone);
    const installed = r.installations.filter(m => zoneForNode(m) === zone);
    const anchored = installed.some(m => m.kind === "anchor");
    const description = `${zoneDescription(r, zone)}${cluster ? `. Cluster: +${RULES.clusterDamage} damage` : ""}${installed.length ? `. ${installed.map(m => `${INSTALLATION_NAMES[m.kind]} ${integrityPips(m)}`).join(", ")}` : ""}${anchored ? ". Anchored: hostile fields here do not tick down" : ""}${threatened ? ". Enemy targets this band next." : ""}`;
    return `<button class="field-seal ${effects.some(effect => FIELD_RULES[effect.kind].hostile) ? "corrupted" : effects.length ? "empowered" : ""} ${threatened ? "threatened" : ""} ${cluster ? "clustered" : ""} ${targeting ? "targetable" : ""}" data-field-zone="${zone}" data-tooltip="${esc(description)}" aria-label="${zone} band: ${esc(description)}"><span class="field-name">${icon("field", 16)} ${zone.toUpperCase()} ${threatened ? `<i class="threat-mark">${icon("warning", 15)}</i>` : ""}${cluster ? `<i class="cluster-mark">Cluster +${RULES.clusterDamage}</i>` : ""}</span><span class="field-effects">${effects.length ? effects.map(effect => `<span class="${FIELD_RULES[effect.kind].hostile ? "hostile-field" : "allied-field"}">${FIELD_RULES[effect.kind].name} <b>${effect.permanent ? "∞" : anchored && FIELD_RULES[effect.kind].hostile ? `<i class="anchor-mark" aria-label="anchored: it does not tick down">${glyph("anchor", 12)}</i>` : `${effect.turns}t`}</b></span>`).join("") : `<span>${threatened ? "Threat inbound" : "Clear ground"}</span>`}</span><span class="band-meta">${inBand.length ? `${online}/${inBand.length} online` : "empty"}${installed.length ? ` · <span class="band-installs" aria-label="${installed.length} installation${installed.length === 1 ? "" : "s"}">${glyph(installed.length === 1 ? installed[0].kind : "malware", 11)} ${installed.length}</span>` : ""}</span></button>`;
  }).join("")}</div>`;
}

/** The battle HUD in two parts, so keyboard focus follows the design's order (13.8): `hud` (plates,
 * seals, console, protocols, hostile plate, ledger) renders before the hand, `foot` (piles, prepare,
 * transmit) after it, in a layer beneath the HUD's so the plates still lie over the dial's shade. */
export function battleMarkup(r: RunState, v: BattleView): { hud: string; foot: string } {
  const stage = STAGES[r.stage], p = combatPreview(r), enemy = leaderOf(r)!, intent = p.intent ?? intentFor(r, enemy);
  const target = v.selected === null ? null : CARDS[r.hand[v.selected]];
  const hint = v.consoleTargeting ? `Patch Cable · ${v.source ? "choose the second device" : "choose the first device"}`
    : v.hud?.demolition ? `${target?.name ?? "Demolition Charge"} · choose an installation on the table or a tag below`
    : !target ? "Choose your next move" : target.target === "zone" ? "Choose a band on the table or a field seal below" : target.target === "ground" ? "Choose an empty socket on the table" : target.target === "link" ? v.source ? "Choose the second device" : "Choose the first device" : "Choose a device";
  const intentName = intent.ultimate ? ENEMIES[enemy.id].pattern[enemy.turn % ENEMIES[enemy.id].pattern.length].label : INTENT_NAMES[intent.kind];
  const heading = intent.ultimate ? `${intentName} · ${p.interrupted ? "Break ready" : "Inbound"}` : intent.kind === "charge" ? "The guardian gathers power" : enemy.exposed ? "The guardian is exposed" : v.training ? "Field Training" : stage.chapters[r.floor] ?? "";
  const buffering = p.buffering;
  const shownDamage = buffering ? p.bufferGain : p.packetDamage;
  // The dial keeps the total; a second line says when the packet is divided or ends the fight.
  const ports = new Set([...p.deliveries.map(d => d.port), ...PORTS.filter(port => p.ports[port]?.overflowIn)]).size;
  const finishing = !buffering && p.lethal;
  const dialNote = v.busy || buffering ? "" : [finishing ? "finishing blow" : "", ports > 1 ? `${ports} ports` : ""].filter(Boolean).join(" · ");
  const note = !p.signalPath.length ? "Build ALPHA → router → OMEGA, then transmit."
    : p.channels < 2 ? `Your route is alive. A second channel adds +${RULES.bandwidthPerChannel} and keeps transmitting through a cut.`
    : "Two channels: bandwidth is flowing and one cut can't silence you. Arm a protocol for what's coming.";

  // Keyboard order (13.8): player plate, field seals, console, protocols, hostile plate, then (after
  // the hand, in #battle-foot) piles, prepare and transmit.
  const hud = `
    <div class="encounter-heading"><span class="eyebrow">${esc(heading)}</span><span class="round-banner"><i></i> TURN ${String(r.turn).padStart(2, "0")} <i></i></span></div>
    <aside class="battle-left battle-plate player-plate" aria-label="Your network">
      <div class="combatant-identity"><span class="combatant-seal">${icon("shield", 25)}</span><div>${kicker(v.training ? "Field Training" : "Signal Keeper")}<span class="plate-heading">${ARCHETYPES[r.archetype].name}</span></div></div>
      <div class="vital-heading"><span>${icon("heart", 15)} Integrity</span><strong>${r.integrity}<small> / ${r.maxIntegrity}</small></strong></div>
      <div class="vital-bar player-health" role="meter" aria-label="Your integrity" aria-valuenow="${r.integrity}" aria-valuemin="0" aria-valuemax="${r.maxIntegrity}"><i style="width:${r.integrity / r.maxIntegrity * 100}%"></i>${p.incoming ? `<span class="health-risk" style="left:${Math.max(0, r.integrity - p.incoming) / r.maxIntegrity * 100}%;width:${Math.min(r.integrity, p.incoming) / r.maxIntegrity * 100}%"></span>` : ""}</div>
      <div class="survival-forecast forecast-net ${p.incoming ? "danger" : "safe"}"><b>${p.incoming}</b> ${p.incoming ? "integrity at risk" : p.lethal || p.enemyDefeatedByTraps ? "retaliation · finishing blow" : "integrity lost · protected"}</div>
      <div class="player-resources">
        <div class="shield-resource" tabindex="0" data-tooltip="Available shield: ${esc(p.shieldTerms.map(t => `${t.label} +${t.amount}`).join("; ") || "Play defense cards, keep a firewall online or route through protected fields.")}">${icon("shield", 22)}<strong>${p.shield}</strong><span>Shield</span></div>
        <div class="signal-readout ${p.packetDamage ? "online" : ""}" tabindex="0" data-tooltip="${esc(p.damageTerms.map(t => `${t.label} ${t.amount >= 0 ? "+" : ""}${t.amount}`).join("; ") || "No live route yet.")}">${icon("sword", 22)}<strong>${p.packetDamage}<small>signal damage</small></strong><span>Damage</span></div>
        <div class="burst-resource" tabindex="0" data-tooltip="Extra transmission damage from cards this turn. Burst expires after your turn.">${icon("bolt", 22)}<strong>+${r.packetBoost}</strong><span>Burst</span></div>
      </div>
      <div class="player-tools"><button class="formula-button" data-action="combat-details">${icon("book", 14)} Details</button><button class="formula-button devices-button" data-action="devices" aria-label="Devices & placement" data-tooltip="Devices & placement">${icon("map", 14)}<span>Devices</span></button><button class="text-button undo-button" data-action="undo" aria-label="Undo last action · Z" data-tooltip="Undo last action · Z" ${!v.undo || v.busy ? "disabled" : ""}>${icon("undo", 14)}<span>Undo</span><kbd>Z</kbd></button></div>
      <div class="perk-heading"><span>Relics & perks</span><small>${r.relics.length} carried</small></div>
      <div class="battle-relics">${relicTokens(r)}</div>
      ${r.reserveEnergy ? `<span class="reserve-note">${icon("bolt", 12)} +${r.reserveEnergy} energy next turn</span>` : ""}
    </aside>
    ${v.tips && !v.training ? `<div class="tutorial-callout"><span>Field note</span><p>${esc(note)}</p><button data-action="dismiss-tutorial" aria-label="Dismiss field note">${icon("close", 10)}</button></div>` : ""}
    ${fieldStrip(r, p, target?.target === "zone")}
    <div class="command-dock command-left">${consoleMarkup(r, p, v)}</div>
    <div class="command-dock command-right">${protocolDock(r, p)}</div>
    ${enemyPlate(r, p, v, stage)}
    ${ledgerMarkup(r, p, v)}
    <button class="combat-log" data-action="combat-log" aria-label="Open combat history">${icon("book", 13)}<span>${esc(r.log[0] || "")}</span></button>`;
  const foot = `
    <div class="battle-bottom battle-shade" aria-hidden="true"></div>
    <div class="battle-bottom battle-controls">
      <div class="energy-orb" aria-label="${r.energy} energy available" data-tooltip="${esc(`${r.energy} energy now. Next turn: ${p.nextTurn.energy}.`)}"><strong>${r.energy}</strong><span>Energy</span></div>
      <div class="draw-piles">${([["draw-pile", r.drawPile.length, "Draw"], ["discard-pile", r.discardPile.length, "Discard"], ["exhaust-pile", r.exhaustPile.length, "Exhaust"]] as const).map(([action, count, label]) => `<button data-action="${action}" class="${action}" data-tooltip="${label === "Exhaust" ? "Exhausted cards return next encounter" : `Inspect your ${label.toLowerCase()} pile`}">${icon("deck", 18)}<span>${count}<small>${label}</small></span></button>`).join("")}<button data-action="prepare" class="prepared-pile ${r.preparedCard ? "occupied" : ""}" aria-label="${r.preparedCard ? `Prepared: ${esc(CARDS[r.preparedCard].name)}` : "Prepare a card for next turn"}" data-tooltip="${r.preparedCard ? `${esc(CARDS[r.preparedCard].name)} is held for next turn` : "Hold one card for next turn, replacing one draw · P"}" ${v.busy ? "disabled" : ""}>${icon("battery", 18)}<span>${r.preparedCard ? "1" : "+"}<small>${r.preparedCard ? "Ready" : "Prepare"}</small></span></button></div>
      <div class="target-hint ${v.selected !== null || v.consoleTargeting ? "active" : ""}">${esc(hint)}${v.selected !== null || v.consoleTargeting ? '<button data-action="cancel">Cancel <kbd>Esc</kbd></button>' : `<span class="hint-keys"><span><kbd>1</kbd>–<kbd>0</kbd> Play</span><span><kbd>C</kbd> Console</span><span>${icon("mouse", 14)} Inspect</span></span>`}</div>
      <button class="transmit-button ${shownDamage ? "ready" : ""} ${buffering ? "buffering" : ""} ${v.busy ? "transmitting" : ""}${dialNote ? " has-note" : ""}${finishing ? " is-finishing" : ""}" data-action="transmit" aria-label="${buffering ? `Store · ${p.bufferGain} into the buffer · End turn` : `Transmit · ${p.packetDamage} damage${dialNote ? ` · ${dialNote}` : ""} · End turn`}" ${v.busy ? "disabled" : ""}><span class="transmit-dial" aria-hidden="true"></span><span class="transmit-power" aria-hidden="true"><strong>${v.busy ? "· · ·" : buffering ? `+${p.bufferGain}` : p.packetDamage}</strong><small>${v.busy ? "sending" : buffering ? "to buffer" : "damage"}</small></span><span class="transmit-label">${v.busy ? "Transmitting" : buffering ? "Store" : "Transmit"}${dialNote ? `<small class="transmit-note">${esc(dialNote)}</small>` : ""}</span><span class="transmit-shortcut">End turn <kbd>Space</kbd></span></button>
    </div>`;
  return { hud, foot };
}

export function handMarkup(run: RunState, selected: number | null) {
  return `${run.hand.length > 6 ? `<button class="hand-scroll hand-scroll-left" data-action="hand-left" aria-label="Previous cards">${icon("chevron-left", 16)}</button><button class="hand-scroll hand-scroll-right" data-action="hand-right" aria-label="Next cards">${icon("chevron-right", 16)}</button>` : ""}<div class="card-fan" data-count="${run.hand.length}" style="--hand-size:${run.hand.length}">${run.hand.map((id: CardId, i) => cardMarkup(id, i, "hand", run, selected === i)).join("")}</div>`;
}

/** Plain-text summary of the next turn for tooltips and the training coach. */
export function nextTurnSummary(p: CombatPreview): string {
  return `${p.nextTurn.energy} energy · ${plural(p.nextTurn.draw, "card")}`;
}
