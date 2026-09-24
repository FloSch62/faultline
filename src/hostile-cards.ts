/** The far rail in the DOM (targeting): one intent badge per living hostile, hung over the table
 * above its rail plate (#intent-layer; main.ts places the badges every frame), and the hover cards
 * for hostiles and for the channels of the right plate's landing breakdown. Every number is read
 * from the forecast (combatPreview). */
import { CARDS } from "./core/cards.ts";
import { DESIGNATIONS, ENEMIES, designationRule } from "./core/enemies.ts";
import {
  INSTALLATION_NAMES, livingEnemies, zoneForNode,
  type CombatPreview, type Delivery, type HostileForecast, type InstallForecast,
} from "./core/run.ts";
import type { Enemy, Port, RunState } from "./core/types.ts";
import type { TableHover } from "./three/World.ts";
import { channelCss } from "./channel-palette.ts";
import { esc, icon } from "./ui.ts";
import { INTENT_NAMES, glyph, hostileCopy, intentCopy, intentGlyph } from "./battle-ui.ts";
import { designationGlyph } from "./tutorial/icons.ts";

const pretty = (id: string) => id.toUpperCase().replaceAll("::", " ↔ ");
const title = (name: string) => name.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
const hexOf = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A field names its verb: a band corroded or suppressed. */
const FIELD_VERB: Record<string, string> = { corrosion: "CORRODE", suppression: "SUPPRESS" };
const ROLE_NAME: Record<Enemy["role"], string> = { leader: "Leader", single: "Hostile", escort: "Escort", add: "Add" };

/** A delivery's name as the HUD writes it: "Primary", "Ch 2" ("Channel 2" long). */
export const deliveryName = (d: Pick<Delivery, "primary" | "index">, long = false) => d.primary ? "Primary" : `${long ? "Channel" : "Ch"} ${d.index + 1}`;

/** What one hostile does this phase, read for its badge: a big glyph and number, a short verb and
 * its target, riders, and the state (acts, rests, falls, acts anyway, broken, skips). */
export interface IntentRead {
  /** Colour key: an intent kind, "install-<kind>" or "dormant". */
  kind: string;
  glyph: string;
  value: string;
  verb: string;
  target: string;
  state: "acts" | "rests" | "falls" | "spiteful" | "broken" | "skips";
  riders: { glyph: string; text: string; kind: string }[];
  /** Leaders: escalation reached (0–3), and the next level when it is two actions away or closer. */
  level: { now: number; next: { level: number; inActions: number } | null } | null;
  enraged: boolean;
}

function installWords(planted: InstallForecast): string {
  return planted.absorbed ? "absorbed" : planted.boosts ? `+1 ${pretty(planted.boosts)}` : planted.destroyed ? "bitten on arrival" : zoneForNode(planted).toUpperCase();
}

/** The badge's reading of one hostile's forecast entry. */
export function readIntent(r: RunState, p: CombatPreview, h: HostileForecast): IntentRead {
  const enemy = r.enemies.find(item => item.uid === h.uid);
  const port = p.ports[h.port];
  const intent = h.intent;
  const grows = h.role === "leader" || h.role === "single";
  const next = h.nextLevel && h.nextLevel.inActions >= 1 && h.nextLevel.inActions <= 2 ? { level: h.nextLevel.level, inActions: h.nextLevel.inActions } : null;
  const level = grows && (h.escalation > 0 || next) ? { now: h.escalation, next } : null;
  const base = { riders: [] as IntentRead["riders"], level, enraged: !!intent?.label.startsWith("ENRAGED") };
  if (h.state === "dormant") return { ...base, kind: "dormant", glyph: icon("next", 26), value: "", verb: "RESTS", target: "acts next phase", state: "rests" };
  if (h.state === "skipped" || !intent) return { ...base, kind: "dormant", glyph: icon("next", 26), value: "", verb: "SKIPS", target: "resynced", state: "skips" };
  const lethal = !!port?.lethal && !p.buffering;
  const state: IntentRead["state"] = h.state === "spiteful" ? "spiteful"
    : h.state === "cancelled" ? (h.interrupted && !lethal ? "broken" : "falls") : "acts";
  const attack = intent.kind === "strike" || intent.kind === "breach";
  // Attacks show their number after every term the forecast applied (uplinks, swarm, echoes…);
  // a cancelled attack keeps its printed amount, struck through.
  const value = attack ? String(state === "acts" || state === "spiteful" ? h.raw : intent.amount) : "";
  let kind: string = intent.kind, verb = "", target = "";
  const jams = h.jams.length ? h.jams : intent.targets ?? [];
  const cuts = h.cuts.length ? h.cuts : intent.cutTargets ?? [];
  const riders: IntentRead["riders"] = [];
  if (intent.ultimate) {
    const pattern = enemy ? ENEMIES[enemy.id].pattern : [];
    verb = (enemy && pattern[(enemy.step ?? enemy.turn) % pattern.length]?.label) || intent.label;
  } else if (intent.kind === "strike") verb = "STRIKE";
  else if (intent.kind === "breach") verb = "BREACH";
  else if (intent.kind === "sever") {
    verb = cuts.length > 1 ? `CUT ×${cuts.length}` : "CUT";
    target = cuts.length ? cuts.map(pretty).join(" · ") : h.cancelled ? "countered" : h.absorbed ? "absorbed" : "nothing exposed";
  } else if (intent.kind === "jam") {
    verb = jams.length > 1 ? `JAM ×${jams.length}` : "JAM";
    target = jams.length ? jams.map(pretty).join(" · ") : h.cancelled ? "countered" : h.absorbed ? "absorbed" : "nothing exposed";
  } else if (intent.kind === "corrupt") {
    verb = h.field ? FIELD_VERB[h.field.kind] ?? "FIELD" : "FIELD";
    target = h.field ? h.field.zone.toUpperCase() : "";
  } else if (intent.kind === "charge") { verb = "CHARGE"; target = "ultimate next turn"; }
  else if (intent.kind === "install") {
    const planted = h.install;
    const plantKind = planted?.kind ?? intent.install ?? "tap";
    kind = `install-${plantKind}`;
    verb = `PLANT ${INSTALLATION_NAMES[plantKind].toUpperCase()}`;
    target = planted ? installWords(planted) : "";
  } else if (intent.kind === "overload") {
    verb = "OVERLOAD";
    const worn = h.overload ? p.wear.find(item => (item.nodeId === h.overload || item.sheltered === h.overload) && item.source !== INSTALLATION_NAMES.spike) : undefined;
    target = h.overload ? `${pretty(h.overload)}${worn?.breaks ? " · breaks" : ""}` : h.absorbed ? "absorbed" : h.decoyed ? "decoyed" : "nothing to wear";
  }
  // Riders: a field beside another action, extra plantings, junk, healing.
  if (h.field && intent.kind !== "corrupt") riders.push({ glyph: icon("field", 13), text: `${FIELD_VERB[h.field.kind] ?? "FIELD"} ${h.field.zone.toUpperCase()}`, kind: "corrupt" });
  for (const planted of h.installs.slice(intent.kind === "install" ? 1 : 0))
    if (!planted.absorbed) riders.push({ glyph: glyph(planted.kind, 13), text: `PLANTS ${INSTALLATION_NAMES[planted.kind].toUpperCase()}`, kind: `install-${planted.kind}` });
  if (h.junk) riders.push({ glyph: icon("deck", 13), text: `+${h.junk.count} ${CARDS[h.junk.card].name.toUpperCase()}`, kind: "junk" });
  if (h.heal) riders.push({ glyph: icon("heart", 13), text: `HEALS ${h.heal}`, kind: "heal" });
  return { ...base, kind, glyph: intentGlyph(intent, 26), value, verb: verb.toUpperCase(), target, state, riders };
}

/** The badges: one per living hostile (the target's with a lit crest while there is a choice), and
 * a dashed one holding an empty port for an announced arrival. `armed`: a picked-up delivery. */
export function intentBadges(r: RunState, p: CombatPreview, options: { armed: string | null }): string {
  const living = livingEnemies(r);
  const pack = living.length > 1;
  const armed = options.armed && pack ? p.deliveries.find(item => item.channelKey === options.armed) : undefined;
  const badges = p.hostiles.flatMap(h => {
    const enemy = living.find(item => item.uid === h.uid);
    if (!enemy) return [];
    const read = readIntent(r, p, h);
    const target = pack && enemy.port === p.focus;
    const pips = read.level ? `<span class="hi-level" aria-hidden="true">${[1, 2, 3].map(n => `<i class="${n <= read.level!.now ? "on" : read.level!.next?.level === n ? "next" : ""}"></i>`).join("")}</span>` : "";
    const note = read.state === "falls" ? "FALLS THIS TURN" : read.state === "spiteful" ? "FALLS · ACTS ANYWAY" : read.state === "broken" ? "BROKEN" : read.enraged ? "ENRAGED" : "";
    const riders = read.riders.slice(0, 2).map(rider => `<span class="hi-rider kind-${rider.kind}">${rider.glyph}${esc(rider.text)}</span>`).join("");
    const classes = ["hostile-intent", `kind-${read.kind}`, `state-${read.state}`, target ? "is-target" : "", armed ? "is-aiming" : "", read.enraged ? "is-enraged" : ""].filter(Boolean).join(" ");
    return [`<div class="${classes}" data-port="${enemy.port}" data-hover-port="${enemy.port}" style="--hostile:${hexOf(enemy.color)}${armed ? `;--channel:${channelCss(armed.index)}` : ""}">${target ? `<span class="hi-tag" aria-hidden="true"><i class="hi-crest">${glyph("crest", 14)}</i>TARGET</span>` : ""}<span class="hi-main"><span class="hi-glyph">${read.glyph}</span>${read.value ? `<b class="hi-value">${esc(read.value)}</b>` : ""}<span class="hi-words"><span class="hi-verb">${esc(read.verb)}</span>${read.target ? `<span class="hi-target">${esc(read.target)}</span>` : ""}</span>${pips}</span>${riders ? `<span class="hi-riders">${riders}</span>` : ""}${note ? `<span class="hi-note">${esc(note)}</span>` : ""}</div>`];
  });
  // An announced reinforcement holds its empty port with a dashed badge.
  const a = p.arrivals;
  if (a?.port && !living.some(enemy => enemy.port === a.port)) {
    const name = title(ENEMIES[a.enemyId]?.name ?? a.enemyId);
    badges.push(`<div class="hostile-intent kind-arrival state-arriving" data-arrival="${a.port}"><span class="hi-main"><span class="hi-glyph">${icon("warning", 22)}</span><span class="hi-words"><span class="hi-verb">ARRIVES</span><span class="hi-target">${esc(name)} · ${a.inPhases <= 1 ? "after this action" : `in ${a.inPhases} actions`}</span></span></span></div>`);
  }
  return badges.join("");
}

// ------------------------------------------------------------------ hover cards

function portCard(r: RunState, p: CombatPreview, port: Port): string | null {
  const living = livingEnemies(r);
  const enemy = living.find(item => item.port === port);
  const h = enemy && p.hostiles.find(item => item.uid === enemy.uid);
  if (!enemy || !h) return null;
  const definition = ENEMIES[enemy.id];
  const pack = living.length > 1;
  const read = readIntent(r, p, h);
  const landing = p.ports[port];
  const buffering = p.buffering;
  const target = pack && p.focus === port;
  const ribbons = enemy.designationHidden
    ? `<span class="hc-ribbon unknown">${designationGlyph("unknown", 14)}<b>Unknown designation</b> Revealed on entry.</span>`
    : (enemy.designations ?? []).map(id => `<span class="hc-ribbon ${DESIGNATIONS[id].kind}">${designationGlyph(id, 14, DESIGNATIONS[id].kind)}<b>${esc(DESIGNATIONS[id].ribbon)}</b> ${esc(designationRule(id, r.stage))}</span>`).join("");
  // What it does: the badge's line, its own name for the action, then the forecast's sentences.
  const copy = pack ? hostileCopy(r, p, h) : intentCopy(r, p);
  const flavour = h.intent && !h.intent.ultimate && h.state !== "dormant" ? title(h.intent.label.replace(/^ENRAGED\s*/, "")) : "";
  const lines = read.riders.map(rider => `<li class="kind-${rider.kind}">${rider.glyph}${esc(rider.text)}</li>`);
  const terms = h.terms.filter(term => term.amount);
  if (h.raw && terms.length > 1) lines.push(`<li class="hc-terms">${icon("sword", 13)}${esc(terms.map(term => `${term.label} ${term.amount >= 0 ? "+" : ""}${term.amount}`).join(" · "))}</li>`);
  if (h.raw && h.incoming < h.raw) lines.push(`<li>${icon("shield", 13)}${esc(`${h.incoming} of ${h.raw} gets through your shield`)}</li>`);
  if (h.intent?.pressure) lines.push(`<li>${icon("warning", 13)}${esc(`Pressure +${h.intent.pressure}`)}</li>`);
  if (read.enraged) lines.push(`<li class="kind-strike">${icon("warning", 13)}Enraged</li>`);
  if (read.level) lines.push(`<li class="hc-level">${esc(`Escalation level ${read.level.now} of 3${read.level.next ? ` · level ${read.level.next.level} in ${plural(read.level.next.inActions, "action")}` : ""}`)}</li>`);
  if (h.state === "dormant" && h.upcoming) lines.push(`<li>${intentGlyph(h.upcoming, 13)}${esc(`Next phase: ${INTENT_NAMES[h.upcoming.kind]}${h.upcoming.amount ? ` ${h.upcoming.amount}` : ""}`)}</li>`);
  if (enemy.crate) lines.push(`<li class="kind-crate">${glyph("crate", 13)}Carries a crate: defeat it to open it</li>`);
  // Health now → after this transmission, and what lands on it.
  const hpAfter = buffering ? enemy.hp : landing?.hpAfter ?? enemy.hp;
  const lethal = !!landing?.lethal && !buffering;
  const health = `<div class="hc-health"><span>Integrity</span><b>${enemy.hp}</b><small>/ ${enemy.maxHp}</small>${hpAfter !== enemy.hp ? `<i aria-hidden="true">→</i><b class="${lethal ? "is-lethal" : ""}">${hpAfter}</b>` : ""}${lethal ? "<em class=\"is-lethal\">falls this turn</em>" : hpAfter !== enemy.hp ? "<em>after this transmission</em>" : ""}</div>`;
  const lands = buffering ? [] : p.deliveries.filter(d => d.port === port);
  const packets = lands.map(d => `<span class="hc-packet" style="--channel:${channelCss(d.index)}">${glyph(d.primary ? "hexagon" : "diamond", 11)}${esc(deliveryName(d))} <b>${d.amount}</b></span>`);
  const extra: string[] = [];
  if (landing?.bonus) extra.push(`bonus +${landing.bonus}`);
  if (landing?.armor) extra.push(`armor −${landing.armor}`);
  if (landing?.overflowIn) extra.push(`overflow +${landing.overflowIn} in`);
  if (landing?.overflowOut && landing.overflowTo) extra.push(`overflow ${landing.overflowOut} → ${landing.overflowTo.toUpperCase()}`);
  const landsLine = buffering ? `<div class="hc-lands"><span>Buffering: nothing lands this turn</span></div>`
    : packets.length || extra.length ? `<div class="hc-lands"><span>Lands</span>${packets.join("")}${extra.map(text => `<i>${esc(text)}</i>`).join("")}${landing ? `<b class="hc-total${lethal ? " is-lethal" : ""}">= ${landing.packet}</b>` : ""}</div>`
      : `<div class="hc-lands"><span>Nothing lands here</span></div>`;
  const hint = target ? "Your target: every channel lands here" : pack ? "Click to target it: every channel lands there" : "";
  return `<div class="hostile-card kind-${read.kind} state-${read.state}${target ? " is-target" : ""}" style="--hostile:${hexOf(enemy.color)}">
    <div class="hc-head">${target ? `<i class="hc-crest" aria-hidden="true">${glyph("crest", 16)}</i>` : ""}<b>${esc(title(enemy.name))}</b><span>${esc(`${ROLE_NAME[enemy.role]} · ${port} port`)}</span></div>
    ${ribbons ? `<div class="hc-ribbons">${ribbons}</div>` : ""}
    <div class="hc-intent"><span class="hc-glyph">${read.glyph}</span>${read.value ? `<b>${esc(read.value)}</b>` : ""}<span><strong>${esc(read.verb)}</strong>${read.target ? ` <small>${esc(read.target)}</small>` : ""}${flavour ? `<em>${esc(flavour)}</em>` : ""}</span></div>
    <p class="hc-copy">${esc(copy)}</p>
    ${lines.length ? `<ul class="hc-lines">${lines.join("")}</ul>` : ""}
    ${health}
    ${landsLine}
    <div class="hc-trait"><b>${esc(definition.badge)}</b> ${esc(definition.trait)}</div>
    ${hint ? `<div class="hc-hint">${esc(hint)}</div>` : ""}
  </div>`;
}

/** One channel of the landing breakdown, read only: its terms, its route, and the packet it joins. */
function deliveryCard(r: RunState, p: CombatPreview, key: string): string | null {
  const d = p.deliveries.find(item => item.channelKey === key);
  if (!d) return null;
  const enemy = livingEnemies(r).find(item => item.port === d.port);
  const landing = p.ports[d.port];
  const merged = p.deliveries.filter(item => item.channelKey !== key);
  const terms = d.terms.filter(term => term.amount !== 0 || d.terms.length === 1);
  const after = landing ? `${landing.packet} lands${landing.armor ? ` after armor −${landing.armor}` : ""}${landing.lethal ? ", lethal" : ""}${landing.overflowOut && landing.overflowTo ? `, and ${landing.overflowOut} overflows → ${landing.overflowTo.toUpperCase()}` : ""}.` : "";
  return `<div class="delivery-card${d.primary ? " is-primary" : ""}" style="--channel:${channelCss(d.index)}">
    <div class="hc-head"><i class="dc-swatch" aria-hidden="true">${glyph(d.primary ? "hexagon" : "diamond", 16)}</i><b>${esc(d.primary ? "Primary channel" : `Channel ${d.index + 1}`)}</b><strong class="dc-amount">${d.amount}</strong></div>
    <div class="dc-lands">${icon("arrow", 13)}<span>Lands on your target, <b>${esc(enemy ? title(enemy.name) : d.port.toUpperCase())}</b></span></div>
    ${terms.length ? `<ul class="dc-terms">${terms.map(term => `<li><span>${esc(term.label)}</span><b>${term.amount >= 0 ? "+" : ""}${term.amount}</b></li>`).join("")}</ul>` : ""}
    ${landing ? `<p class="hc-copy">${merged.length ? `One packet with ${esc(merged.map(item => deliveryName(item)).join(" and "))}: ` : ""}${esc(after)}</p>` : ""}
    <div class="dc-path">${esc(d.path.map(id => id.toUpperCase()).join(" → "))}</div>
  </div>`;
}

/** The card's inner markup for a hostile or a channel of the landing breakdown, or null for no card. */
export function hoverMarkup(run: RunState, preview: CombatPreview, target: TableHover): string | null {
  if (target.kind === "port") return portCard(run, preview, target.id as Port);
  if (target.kind === "delivery") return deliveryCard(run, preview, target.id);
  return null;
}
