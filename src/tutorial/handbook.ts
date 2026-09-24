/** The Signal Keeper's Handbook: an illustrated rules reference.
 * Every number is read from the live rules (RULES, CARDS, RELICS, ENEMIES,
 * ascension and market constants), so the handbook cannot drift from balance. */
import { CARDS, RELICS, RULES } from "../core/cards.ts";
import { DESIGNATIONS, ENEMIES, ESCORT_IDS, MESSAGE_OPTIONS, REACH_TEXT, SIGNALS, hostileName } from "../core/enemies.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "../core/ascension.ts";
import { CARD_PRICES, RELIC_PRICE, REMOVE_PRICE, UPGRADE_PRICE, SALVAGE_COST } from "../core/meta.ts";
import { CONSOLES } from "../core/run.ts";
import type { BaseCardId, ConsoleId, DesignationId, InstallationKind, RelicId } from "../core/types.ts";
import { bandsDiagram, bottleneckDiagram, bufferDiagram, designationDiagram, escalationDiagram, installationDiagram, loopDiagram, mapDiagram, onlineDiagram, portsDiagram, rerouteDiagram, routesDiagram } from "./diagrams.ts";
import { designationMark, esc, icon } from "./icons.ts";

export interface HandbookChapter {
  id: string;
  title: string;
  icon: string;
}
export const HANDBOOK_CHAPTERS: readonly HandbookChapter[] = [
  { id: "start", title: "Your First Turn", icon: "play" },
  { id: "routes", title: "Routes & Channels", icon: "link" },
  { id: "devices", title: "Online Devices", icon: "field" },
  { id: "defense", title: "Intents & Shield", icon: "shield" },
  { id: "zones", title: "Bands & Fields", icon: "map" },
  { id: "rerouting", title: "Rerouting", icon: "undo" },
  { id: "tools", title: "Protocols & Console", icon: "eye" },
  { id: "packs", title: "Packs & Ports", icon: "sword" },
  { id: "front", title: "The Table Front", icon: "map" },
  { id: "escalation", title: "Escalation & Designations", icon: "elite" },
  { id: "surprises", title: "Crates, Messages & Signals", icon: "coins" },
  { id: "archetypes", title: "The Three Keepers", icon: "crown" },
  { id: "danger", title: "Danger Playbook", icon: "heart" },
  { id: "guardians", title: "Guardians", icon: "boss" },
  { id: "cards", title: "Cards & Keywords", icon: "deck" },
  { id: "expedition", title: "The Expedition", icon: "coins" },
];
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];

const R = RULES;
const card = (id: BaseCardId) => CARDS[id];
const name = (id: BaseCardId) => esc(card(id)?.name ?? id);
const rules = (id: BaseCardId) => esc(card(id)?.rules ?? "");
const strong = (text: string | number) => `<strong>${text}</strong>`;
/** Distances read as the table measures them: "2.0". */
const reach = REACH_TEXT;
const pct = (share: number) => `${Math.round(share * 100)}%`;
const title = (text: string) => text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Integrity each installation arrives with (design 5.2). */
const INSTALL_INTEGRITY: Record<InstallationKind, number> = R.installationIntegrity;
const INSTALLATION_ROWS = () => {
  const i = INSTALL_INTEGRITY;
  return [
    { name: "Siphon Tap", integrity: String(i.tap), effect: `−${R.malwarePenalty} transmission damage while it stands. Packet Leech, Tap Spinner and Static Nest heal ${R.leechTapHeal} per Tap after acting.`, placed: "The busiest band" },
    { name: "Jammer", integrity: String(i.jammer), effect: `At each hostile action, jams the nearest unprotected device within ${reach}. A cabled Honeypot decoys it and bites for ${R.honeypotDamage}.`, placed: "Beside its target" },
    { name: "Spike", integrity: `${i.spike} (${R.riggedSpikeIntegrity} from a Rigger Drone with a living leader)`, effect: `At each hostile action, 1 wear to the nearest device within ${reach}, a Honeypot included (no bite).`, placed: "Beside its target" },
    { name: "Anchor", integrity: String(i.anchor), effect: "Hostile fields in its band do not tick down. Purge Field destroys the Anchor and nothing else; the fields need a second purge.", placed: "A band socket" },
    { name: "Breaker Charge", integrity: String(i.breaker), effect: `Counts down from ${R.breakerCountdown}, once per hostile action. At 0 every device within ${reach} breaks, whatever its condition, and its socket becomes wreckage.`, placed: "Beside its target" },
  ];
};
/** How to answer each designation (design 12.1); the rule itself is content's. */
const COUNTERPLAY: Record<DesignationId, string> = {
  nesting: `Scrub the first Tap (${R.scrubCost}) · ${name("purge-field")} · a cabled honeypot within ${reach} kills it on arrival`,
  armored: `Any online firewall bypasses the plating · ${name("spearhead")} · merge deliveries so it is paid once`,
  stoked: `Kill faster: burst and width · ${name("patch")} clears every fault · ${name("failover-policy")} or ${name("port-security")}`,
  shedding: "Cross half health on a turn with block up · kill the new escort with overflow · a full rail makes it wait",
  hardened: `One more turn of damage · its strikes deal ${R.hardenedStrike} less`,
  rigged: `${name("failover-policy")} cancels the cut and its Spike · armored cables · keep cables away from your router`,
  hungry: "Never transmit zero at it: aim at least one delivery its way · do not buffer twice in a row",
  spiteful: `Cover its last announced action as if it lived · ${name("failover-policy")} or ${name("port-security")} cancel it · kill it on a harmless turn`,
  laden: "Defeat it for an undelivered message",
  salvaged: `Defeat it for salvage hardware on your table (condition ${R.salvageCondition})`,
};

/** Condition or integrity pips as the nameplates engrave them: filled ◆, spent ◇. */
function pipRow(filled: number, total: number, kind: "device" | "install" = "device") {
  return `<span class="hb-pips ${kind}" aria-label="${filled} of ${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < filled ? "on" : "off"}"></i>`).join("")}</span>`;
}
/** A ledger: engraved header, banded rows, the first column a nameplate. */
function table(headers: string[], rows: string[][], cls = "") {
  return `<div class="hb-table-wrap"><table class="hb-table ${cls}"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
/** An inlaid plate: a seal for its kind, a nameplate, the note. */
function tip(title: string, body: string, kind: "tip" | "warn" | "rule" = "tip") {
  return `<aside class="hb-note ${kind}"><span class="hb-note-seal" aria-hidden="true">${icon(kind === "warn" ? "warning" : kind === "rule" ? "book" : "hint", 18)}</span><div><b>${title}</b><p>${body}</p></div></aside>`;
}
function figure(svg: string, caption: string) {
  return `<figure class="hb-figure">${svg}<figcaption>${caption}</figcaption></figure>`;
}
function lead(text: string) {
  return `<p class="hb-lead">${text}</p>`;
}

const CHAPTER_BODIES: Record<string, () => string> = {
  start: () => `
    ${lead(`Every turn you get ${strong(R.baseEnergy)} energy and draw ${strong(R.handDraw)} cards (hand limit ${R.handLimit}). You build a network between the terminals ${strong("ALPHA")} and ${strong("OMEGA")}, then press ${strong("Transmit")}: your network deals damage, and every hostile answers with the move it announced.`)}
    ${figure(loopDiagram(), "One turn. Hardware and cables stay on the table for the whole encounter; block and burst last one turn.")}
    <div class="hb-columns">
      <section><h4>${icon("bolt", 16)} Energy & cards</h4><p>Cards cost the number in their corner. Unspent energy is lost unless a relic says otherwise. Played cards go to discard; ${strong("Exhaust")} cards leave for the rest of the encounter. When your draw pile runs out, the discard pile is shuffled back in.</p></section>
      <section><h4>${icon("eye", 16)} Everything is forecast</h4><p>Before you transmit, both plates show the exact outcome: your damage with every term and where it lands, each hostile's action and its target, and the integrity you will lose. What you see is what resolves. Open ${strong("Details")} for the full calculation.</p></section>
      <section><h4>${icon("deck", 16)} Prepare</h4><p>Press ${strong("P")}, or click the ${strong("+ PREPARE")} slot at the bottom left beside your Draw, Discard and Exhaust piles, to set one card aside for free. It becomes the first card of your next hand, replacing a draw. Use it to hold an answer for a turn you can already see coming.</p></section>
      <section><h4>${icon("undo", 16)} Undo & inspect</h4><p>${strong("Z")} undoes the last action this turn. Right-click any card, or press ${strong("I")}, to inspect it. Relocating a placed device costs ${strong(R.relocateCost)} energy.</p></section>
    </div>
    ${tip("Integrity is your life", "Integrity carries over between rooms. At zero the expedition ends. Winning a battle never heals by itself — sanctuaries, events and a few relics do.", "rule")}`,

  routes: () => `
    ${lead(`A ${strong("route")} is a path of live cables from ALPHA to OMEGA through at least one router, and every one counts. ${strong("Every device carries one channel")}: when two routes go through the same device, they are one channel, not two. Your ${strong("primary route")} — the strongest one — carries the damage; every extra channel adds bandwidth.`)}
    ${figure(routesDiagram(), `Two channels: ${R.baseRouteDamage} + ${R.switchDamage} (switch) on the primary route, +${R.bandwidthPerChannel} bandwidth for the second channel.`)}
    ${table(["Damage term", "Amount", "Where it counts"], [
      ["Live router route", `+${R.baseRouteDamage}`, "Primary route"],
      ["Edge Switch", `+${R.switchDamage} each`, "Each switch on the primary route"],
      ["Startup Config · Overclock", `+${R.configuredDamage} · +${R.overclockDamage} per router`, "Routers on the primary route"],
      ["Packet Compression", `+${R.compressionDamage} per switch`, "Compressed switches on the primary route"],
      ["Amplified cable (violet fibre)", `+${R.amplifiedCableDamage} each`, "Amplified cables on the primary route"],
      ["Frayed cable", `−${R.frayedCableDamage} each`, "Unarmored primary-route cables crossing wreckage"],
      ["Resonance · Suppression", `+${R.resonanceDamage} · −${R.suppressionPenalty} per band`, "Bands crossed by primary-route hardware"],
      ["Bandwidth", `+${R.bandwidthPerChannel} per channel beyond the first`, "Whole network"],
      ["Load Balancer", `+${R.balancerPerChannel} per channel, each`, "Online balancers"],
      ["Cluster", `+${R.clusterDamage} per band`, `Bands with ${R.clusterThreshold}+ online devices`],
      ["Siphon Tap", `−${R.malwarePenalty} each`, "Every Tap on the table, taken from the primary delivery first"],
      ["Burst · Buffer · Backpressure", "as shown", "This transmission"],
      ["Exposed guardian", `+${R.exposedBonus}`, "After an interrupted ultimate"],
    ])}
    ${figure(bottleneckDiagram(), "Two routes through one switch: the ledger reads 2 routes · 1 channel, and the switch wears a brass seal.")}
    ${tip("Reading the table", "Each channel glows in its own colour: gold for the primary, then cyan, green, blue, silver and rose, the same colours as its delivery. A cable wound with violet fibre is amplified, whichever channel it carries. A brass seal with a number marks a device that many routes pass through. Rest the pointer on any device, cable or installation for its card.")}
    ${tip("No hidden caps", "Every switch, every channel and every balancer counts. The limits are physical: 14 sockets on the table, your energy, and what the enemy can cut.", "rule")}`,

  devices: () => `
    ${lead(`A device is ${strong("online")} while at least one live route passes through it — not only your primary route. Offline devices do nothing. A cut cable or a jam can take a whole branch offline, which is why redundancy protects your engine.`)}
    ${figure(onlineDiagram(), "The firewall is online on a live route. A dead-end branch and an uncabled server stay offline.")}
    ${table(["Device", "Card", "Cost", "While online"], [
      ["Router", name("router"), String(card("router").cost), "Required for any route."],
      ["Switch", name("switch"), String(card("switch").cost), `+${R.switchDamage} damage on the primary route.`],
      ["Firewall", name("firewall"), String(card("firewall").cost), `Blocks ${R.firewallBreachBlock} of a breach or ${R.firewallStrikeBlock} of a strike. Firewalls stack. Also gets past hostile plating.`],
      ["Honeypot", name("honeypot"), String(card("honeypot").cost), `Works even offline: while cabled, jams, cuts and overloads hit it first (one per hostile action); the attacker takes ${R.honeypotDamage}. Installations planted within ${reach} arrive bitten.`],
      ["Cache Server", name("cache-server"), String(card("cache-server").cost), "Online at the start of your turn: draw 1 more."],
      ["PoE Injector", name("poe-injector"), String(card("poe-injector").cost), "Online at the start of your turn: +1 energy."],
      ["Load Balancer", name("load-balancer"), String(card("load-balancer").cost), `+${R.balancerPerChannel} damage per live channel.`],
    ])}
    ${tip("“Start of your turn” means after the enemy acts", "The hostile's cut or jam lands first. If it takes your Cache Server or PoE Injector offline, that bonus is lost for the turn. The forecast shows next turn's energy and draw.", "warn")}
    ${tip("Salvage", `Some battlefields start with a weathered device already on the table, and crates can drop one. Cable it into a route and it is yours. Salvage arrives worn: condition ${R.salvageCondition} of ${R.deviceCondition}.`)}`,

  defense: () => `
    ${lead("Every hostile shows its next action before you commit. The right plate names it, its target and its damage, one row per port in a pack; your plate shows what gets through after your shield.")}
    <div class="hb-intents">
      ${[
        ["sword", "Strike", "Direct integrity damage. Shield, Rate Limiter, firewalls (1 each)."],
        ["sword", "Breach", `Heavy damage through your boundary. Online firewalls block ${R.firewallBreachBlock} each; IPS Signature.`],
        ["link", "Sever", "Cuts a cable for your next turn. Second channel, Failover Policy, armored cables, honeypot."],
        ["bolt", "Jam", "Disables a device for your next turn. Faraday Shell, Port Security, honeypot, relocate."],
        ["field", "Corrupt", "Casts a hostile field on a band for two turns. Purge Field, Quarantine Rule, move out."],
        ["cleanse", "Install", `Plants an installation: a Siphon Tap (−${R.malwarePenalty} damage), a Jammer, a Spike, an Anchor or a Breaker Charge. Scrub it for ${R.scrubCost} energy per integrity point, or Purge its band.`],
        ["heart", "Overload", "Wears a device by 1 condition; at 0 it breaks and leaves wreckage. Repair it, rack it, or let a honeypot take it."],
        ["deck", "Inject", "Shuffles junk into your draw pile: Packet Loss clogs a hand, a Worm bites if kept."],
        ["boss", "Charge → Ultimate", "A guardian's climax. Interrupt with a big transmission, or brace."],
        ["undo", "Dormant", "An escort resting on its off phase. It does nothing and acts next phase."],
      ].map(([i, t, d]) => `<div class="hb-intent"><span>${icon(i, 20)}</span><b>${t}</b><p>${d}</p></div>`).join("")}
    </div>
    ${table(["Shield source", "Amount", "Lasts"], [
      ["Block cards (Packet Guard, Aegis Protocol…)", "as printed", "This enemy phase, shared by every attack in port order"],
      ["Online firewall", `${R.firewallBreachBlock} vs breach · ${R.firewallStrikeBlock} vs strike, each`, "Every enemy attack"],
      ["Aegis Field", `${R.aegisShield} with a live route through the band`, `${R.alliedFieldTurns} turns`],
      ["Null Field", `${R.nullFieldShield} while your hardware occupies the band`, `${R.alliedFieldTurns} turns`],
      ["Separated circuits", `${R.separatedCircuitShield}: channels with a North router and a South router`, "While both are live"],
      ["Reclaim", `${R.reclaimShield} for each installation you destroy`, "This enemy phase"],
      ["Protocols", "cancel or reduce the first matching attack of a phase", "Until they trigger"],
    ])}
    ${tip("Spend exactly enough", "Shield beyond the forecast is wasted: it expires after the enemy phase. Cover the number, then spend the rest on damage or on your network.")}`,

  zones: () => `
    ${lead(`The table has three bands: ${strong("North")}, ${strong("Center")} and ${strong("South")}. Fields, band attacks and clusters make every placement a decision. Each band holds one allied and one hostile field; recasting replaces your own.`)}
    ${figure(bandsDiagram(), "Fields shape the bands; clusters reward crowding, separated circuits reward spreading.")}
    ${table(["Field", "Effect", "Duration"], [
      [name("resonance-field"), `+${R.resonanceDamage} damage to routes whose hardware crosses the band`, `${R.alliedFieldTurns} turns`],
      [name("aegis-field"), `+${R.aegisShield} shield with a live route through the band`, `${R.alliedFieldTurns} turns`],
      [name("null-field"), `+${R.nullFieldShield} shield while your hardware occupies it`, `${R.alliedFieldTurns} turns`],
      [name("purge-field"), "Cleanses hostile fields, jams and installations in the band; draws a card", "Instant"],
      ["Corrosion (hostile)", `+${R.corrosionDamage} incoming damage while your hardware occupies the band`, `${R.hostileFieldTurns} turns`],
      ["Suppression (hostile)", `−${R.suppressionPenalty} damage to routes crossing the band`, `${R.hostileFieldTurns} turns`],
      ["Terrain field", "Crystal veins (resonance) or interference (suppression) that last the whole battle", "Encounter"],
    ])}
    <div class="hb-columns">
      <section><h4>${icon("field", 16)} Crowd: clusters</h4><p>A band with ${strong(R.clusterThreshold)} or more online devices is a cluster: ${strong(`+${R.clusterDamage}`)} damage per clustered band. But crowded bands are what corrosion, storms and ash target first.</p></section>
      <section><h4>${icon("shield", 16)} Spread: separated circuits</h4><p>Channels with a router in the North and a different channel with a router in the South grant ${strong(`+${R.separatedCircuitShield}`)} shield every enemy phase — and a band attack can only reach one of them.</p></section>
      <section><h4>${icon("bolt", 16)} Band attacks</h4><p>Null Storm and Ash Moth announce a band and jam unprotected hardware inside it, cycling North → Center → South. Empty bands dodge for free. Widow suppresses the busiest band of your route.</p></section>
      <section><h4>${icon("map", 16)} Moving</h4><p>Drag a placed device, or select it and choose a band: ${strong(R.relocateCost)} energy. The preview shows damage, shield and life lost before you drop it. Wreckage blocks some sockets on most battlefields, and an unarmored cable across its scorched ring frays: ${strong(`−${R.frayedCableDamage}`)} damage on your primary route. Move a device and its cables fray or mend with it.</p></section>
    </div>`,

  rerouting: () => `
    ${lead("A broken route deals nothing, and a cut can take a whole branch offline. You can see every cut coming — plan the answer before it lands.")}
    <div class="hb-reroute-grid">
      ${figure(rerouteDiagram("silent"), "One route is a single point of failure.")}
      ${figure(rerouteDiagram("second"), `A second channel keeps the signal alive and adds +${R.bandwidthPerChannel} while both stand.`)}
      ${figure(rerouteDiagram("patch"), `${name("patch")} clears every active cut and jam and draws. ${name("failover-policy")} cancels the next cut before it happens.`)}
      ${figure(rerouteDiagram("move"), `Relocate hardware out of a marked jam band for ${R.relocateCost} energy.`)}
    </div>
    <ol class="hb-steps">
      <li><b>Read the target.</b> The marked cable or device on the table is exactly what will be hit. Hostiles aim at your primary route; the Cable Wraith always takes the longest unarmored cable.</li>
      <li><b>Is it your only route?</b> If yes, you need a second channel, a protocol, a decoy or a repair next turn.</li>
      <li><b>Cheapest answers first.</b> ${name("failover-policy")} (arm it once, it waits), a cabled ${name("honeypot")} to pull the cut away, or ${name("armored-fiber")} for cables that cannot be cut.</li>
      <li><b>Build width when you can.</b> A second channel answers every future cut at once — and pays bandwidth every turn.</li>
      <li><b>After a cut:</b> ${name("patch")} or ${name("reroute")} reconnect; relocating a device can bridge around a jam.</li>
    </ol>
    ${tip("Avoid bottlenecks", "A device carries one channel: two routes through one shared switch or firewall are one channel. Give each channel its own devices.", "warn")}
    ${tip("Short spans", `Cables longer than ${R.cableExposureLength} units draw extra damage from the Cable Wraith. Keep routers near the middle or split long spans.`, "warn")}`,

  tools: () => {
    const c = CONSOLES;
    const protocols: BaseCardId[] = ["failover-policy", "port-security", "rate-limiter", "ips-signature", "quarantine-rule", "tarpit"];
    return `
    ${lead(`${strong("Protocols")} are armed face-down (up to ${R.maxProtocols}) and trigger by themselves during the enemy's action when their condition happens, then go to your discard. The forecast already counts them. Because intents are visible, you can arm tomorrow's answer today.`)}
    ${table(["Protocol", "Cost", "Trigger → effect"], protocols.map(id => [name(id), String(card(id)?.cost ?? ""), rules(id).replace(/^Arm\.\s*/, "")]))}
    <h4 class="hb-subhead">${icon("play", 16)} Console commands</h4>
    <p>Every keeper has a command beside the hand: no card needed, once per turn.</p>
    <div class="hb-console-row">
      ${(["patch", "harden", "buffer"] as ConsoleId[]).map(id => `<div class="hb-console ${id}"><span class="hb-console-cost">${c[id].cost}</span><b>${esc(c[id].name)}</b><small>${id === "patch" ? "Architect" : id === "harden" ? "Warden" : "Ghost"}</small><p>${esc(c[id].rules)}</p></div>`).join("")}
    </div>
    ${tip("Honeypot", `A cabled honeypot pulls jams, cable cuts and overloads onto itself, at most one per hostile action; each one it absorbs deals ${R.honeypotDamage} to the attacker. It works even when offline, and an installation planted within ${reach} of it arrives with ${R.honeypotBite} less integrity. (The Cable Wraith is not fooled — it hunts long cables.)`)}`;
  },

  packs: () => {
    const primary = R.baseRouteDamage + R.switchDamage;
    const escorts = ESCORT_IDS.map(id => ENEMIES[id]);
    return `
    ${lead(`An encounter holds one to three hostiles at three ${strong("ports")}: ${strong("Left")}, ${strong("Centre")} and ${strong("Right")}. A leader or a single hostile stands at the centre; escorts take the left, then the right. Every phase they act in port order, left to right, and the fight ends when the last of them falls.`)}
    ${figure(portsDiagram(), `Every live channel is a delivery. Here the primary delivery (${primary}) and one bandwidth delivery (+${R.bandwidthPerChannel}) go to the focus and merge into one packet; the third is aimed at the left escort.`)}
    ${table(["Delivery", "Carries", "Goes to"], [
      ["Primary", `The primary route's terms (base ${R.baseRouteDamage}, switches, routers, cables, bands, clusters), burst cards, the Ghost's buffer release, Backpressure, BGP Hijack, the exposed bonus, +${R.balancerPerChannel} per online Load Balancer`, "The focus, unless aimed"],
      ["Bandwidth", `One for each further channel: +${R.bandwidthPerChannel} (${R.parallelCorePerChannel} with Parallel Core), +${R.balancerPerChannel} per online Load Balancer`, "The focus, unless aimed"],
      ["Siphon Taps", `−${R.malwarePenalty} each, taken from the primary delivery first, then from bandwidth deliveries in port order`, "—"],
    ])}
    <div class="hb-columns">
      <section><h4>${icon("elite", 16)} Focus</h4><p>One port is the ${strong("focus")}: every delivery you have not aimed goes there, and overflow lands there. It starts on the leader. Select a port by its plate or its row, then press ${strong("F")} or its crest to focus it. Selecting only reads; focusing decides.</p></section>
      <section><h4>${icon("link", 16)} Aim</h4><p>Click a delivery's L · C · R stud, drag its packet on the table, or pick its row with ${strong("[ ]")} and press ${strong("T")}. Aiming is free and ${strong("Z")} undoes it. An aim holds between turns while its channel stands; a cut, jam or breakdown that removes the channel clears it.</p></section>
      <section><h4>${icon("shield", 16)} One packet per port</h4><p>Deliveries at the same port merge into one packet. Armor and plating are paid once per port, then the packet is clamped at 0. Spread thin against an armored port and each delivery pays for nothing.</p></section>
      <section><h4>${icon("arrow", 16)} Overflow</h4><p>Damage beyond a hostile's remaining health flows on: to the focus if that is another living hostile, otherwise to the next living port, left to right. It pays the receiving port's armor. The forecast prints it: “overflow 3 → CENTRE”.</p></section>
    </div>
    ${table(["Hostile", "Acts", "Escalates"], [
      ["Leader or single", "Every phase", "Yes: the leader is the clock (next chapter)"],
      ["Left escort", "Odd phases (1, 3, 5…). Otherwise DORMANT", "Never"],
      ["Right escort", "Even phases (2, 4, 6…). Otherwise DORMANT", "Never"],
      ["Guardian add", `Every phase. Each living add raises the break threshold by ${R.addBreakBonus}`, "Never"],
    ])}
    ${escorts.length ? `<h4 class="hb-subhead">${icon("sword", 16)} Escorts and their pack traits</h4>
    ${table(["Escort", "Badge", "Pack trait"], escorts.map(enemy => [esc(hostileName(enemy.id)), esc(enemy.badge), esc(enemy.trait)]), "hb-playbook")}` : ""}
    ${tip("Kill order is the decision", "Every escort's trait needs another living hostile: kill the Relay Drone and the leader's strikes lose their uplink; kill the leader and a Splicer cuts one cable, not two. A hostile the forecast shows as defeated does nothing this phase (CANCELLED); the others still act. Every escort carries a sealed crate.")}
    ${tip("One hostile, nothing changes", "Against a single hostile every delivery merges at the centre, and the transmission is exactly the sum it always was.", "rule")}`;
  },

  front: () => {
    const scrub = `${R.scrubCost} energy per point`;
    return `
    ${lead(`Some hostiles build on your table. An ${strong("installation")} is a hostile permanent at a socket: it has a kind, an integrity of one to three ${pipRow(3, 3, "install")} and an effect that resolves at every hostile action after the one that planted it. It carries no signal and blocks placement like wreckage. At most ${strong(R.maxInstallations)} stand at once; an install against a full table gives the oldest one +1 integrity instead (at most ${R.maxInstallationIntegrity}).`)}
    ${figure(installationDiagram(), `One radius for everything: ${reach} units. Diagonal neighbours sit inside a ring, straight neighbours outside it, so spacing is a decision.`)}
    ${table(["Installation", "Integrity", "Effect", "Planted"], INSTALLATION_ROWS().map(row => [row.name, row.integrity, row.effect, row.placed]))}
    <h4 class="hb-subhead">${icon("cleanse", 16)} Taking it down</h4>
    ${table(["Answer", "Cost", "What it does"], [
      ["Scrub", scrub, `Click the installation or its ledger tag, or press S: 1 integrity per point, destroyed at 0. ${R.quarantineScrubCost} per point while a Quarantine Drone lives.`],
      [name("purge-field"), String(card("purge-field").cost), "Destroys every installation in the band, whatever its integrity. An Anchor takes the purge instead of its fields."],
      ["Firewall quarantine", "Free", `In the trap phase every online firewall deals ${R.quarantineDamage} to the nearest installation within ${reach} (Sentry Firewall ${R.sentryQuarantine}). Place firewalls where installations land.`],
      ["Honeypot bite", "Free", `An installation planted within ${reach} of a cabled Honeypot arrives with ${R.honeypotBite} less integrity. Taps and Breaker Charges arrive destroyed.`],
      [name("demolition-charge"), card("demolition-charge") ? String(card("demolition-charge").cost) : "—", "Destroys one installation outright."],
      ["Reclaim", "—", `Every installation destroyed by any of these gives ${R.reclaimShield} shield for the coming enemy phase.`],
    ])}
    <h4 class="hb-subhead">${icon("heart", 16)} Condition, wear and breakdown</h4>
    ${lead(`Every device you deploy has a condition of ${strong(R.deviceCondition)} (salvage ${R.salvageCondition}); terminals never break. ${strong("Overloads")} and Spikes remove 1, the Blackout Core's Total Blackout wears the whole primary route by ${R.blackoutWear}, and a Breaker Charge breaks everything in its ring outright. At 0 the device breaks.`)}
    ${table(["State", "On the table", "Answer"], [
      [`Intact ${pipRow(2, 2)}`, "Two brass diamonds on its nameplate", "Nothing to do."],
      [`Worn ${pipRow(1, 2)}`, "A hollow diamond, the rim turns rust-orange, sparks", `Repair: ${R.repairCost} energy per point (R). ${name("patch")}, ${name("reroute")}, ${name("protocol")} and Harden also restore ${R.faultClearRepair} on the most worn device.`],
      ["Broken", "Removed with its cables; its socket becomes wreckage", `Routes, channels and aims are recomputed at once. Wreckage never exceeds ${R.wreckCap} points.`],
    ])}
    ${tip("What a breakdown costs", `Your hardware card already went to the discard pile when you played it, so it comes back with the next shuffle. Its upgrades (Startup Config, Overclock, Packet Compression, Faraday Shell) are lost, and a device deployed by ${name("containerlab")}, ${name("rebuild")} or ${name("clabernetes")} is gone for the encounter. Condition resets when the encounter ends.`, "rule")}
    ${tip("Wear ignores jam protection", `Faraday Shell, Hardened Router, Signal Relay and Bastion stop jams, not wear. A ${name("server-rack")} takes the wear for every device within ${reach} (rack condition ${R.rackCondition}); ${name("redundant-psu")} raises a device to ${R.psuCondition}. A second channel means a breakdown never silences the transmission.`, "warn")}`;
  },

  escalation: () => {
    const levels = [
      `A cut also frays the next primary-route cable for one turn (−${R.frayedCableDamage}; armored cables are immune). A jam lasts two player turns.`,
      "A jam hits two devices and a cut two cables. Hostile fields last one more turn.",
      "Strikes and breaches +1 more. The first action of every pattern cycle also plants a Siphon Tap (stage III: a Jammer).",
    ];
    const from = (start: number, every: number, level: number) => String(start + (level - 1) * every);
    const designations = Object.values(DESIGNATIONS);
    return `
    ${lead(`Pressure still adds +1 to strikes and breaches for every three of a hostile's own actions. On the same counter, leaders, singles and guardians also climb ${strong("three levels of disruption")}. Escorts and adds never escalate: in a pack, the leader is the clock.`)}
    ${figure(escalationDiagram(), "The gauge on the enemy plate fills one diamond per level. Two actions before a level, the intent panel names it in coral.")}
    ${table(["Level", "Stages I\u2060–\u2060II", "Stage III", "Adds (cumulative)"], levels.map((rule, i) => [
      `Level ${i + 1}`, `from action ${from(R.escalationStart, R.escalationEvery, i + 1)}`, `from action ${from(R.escalationStartLate, R.escalationEveryLate, i + 1)}`, rule,
    ]))}
    <div class="hb-columns">
      <section><h4>${icon("boss", 16)} Guardians</h4><p>A guardian charges on its fifth action or on its first action after falling to half health, whichever comes first; the ultimate follows on the next action. Its escalation counter keeps running through both.</p></section>
      <section><h4>${icon("bolt", 16)} Faster clocks</h4><p>A ${strong("Stoked")} hostile reaches every level ${R.stokedAdvance} action sooner (stage III: ${R.stokedAdvanceLate}). The ${strong("SURGE")} signal advances the leader one level at once. A reinforcement arrives at level 0 and, as an escort, never climbs.</p></section>
    </div>
    <h4 class="hb-subhead">${icon("elite", 16)} Designations</h4>
    <p>A designation is one modifier on a leader or single hostile, never on an escort, an add or a guardian: one ribbon word on its plate and one line in the forecast. From sector ${R.designationFromFloor + 1} of stage I, ${pct(R.designationRate[0])} of them carry one; ${pct(R.designationRate[1])} in stage II and ${pct(R.designationRate[2])} in stage III, and every elite from stage II. A designated room pays +${R.designationCredits} credits.</p>
    ${figure(designationDiagram(DESIGNATIONS.nesting.ribbon, DESIGNATIONS.laden.ribbon), "Bad ribbons are coral, good ones teal. A hidden ribbon reads UNKNOWN until the entrance line.")}
    ${table(["Ribbon", "Rule", "Answer"], designations.map(d => [
      `<span class="hb-ribbon-inline ${d.kind}">${designationMark(d.kind, 13)}${esc(d.ribbon)}</span>`, esc(d.rule), COUNTERPLAY[d.id] ?? "",
    ]), "hb-playbook")}
    ${tip(`${designationMark("unknown", 16)} Unknown designation`, `In an interference room the chart shows a diamond filled with static instead of the ribbon: ${pct(R.hiddenShare[0])} of designated rooms in stage I, ${pct(R.hiddenShare[1])} in stage II, ${pct(R.hiddenShare[2])} in stage III. Good and bad ribbons hide equally; Spiteful never hides. The entrance line reveals it before your first turn, and your first forecast already counts it.`, "rule")}`;
  },

  surprises: () => {
    const w = R.crateWeights;
    return `
    ${lead(`Four kinds of surprise, two bad and two good, under one promise: ${strong("bad surprises are announced ahead")}, good ones are revealed on a death or offered as named choices. Nothing is rolled after you choose.`)}
    <h4 class="hb-subhead">${icon("cache", 16)} Crates</h4>
    <p>Every escort, reinforcement and shed escort carries a sealed crate glyph on its plate. The plate tells you it carries something, not what: the contents are fixed when the fight begins and revealed when the escort dies. A card choice or a message opens before your next hand is dealt, or on the victory screen.</p>
    ${table(["Contents", "Share", "Exact effect"], [
      ["Salvage hardware", pct(w.salvage), `A device lands unconnected at the first legal socket with condition ${R.salvageCondition}; yours once cabled. No legal socket: ${R.crateFallbackCredits} credits instead.`],
      ["Credits", pct(w.credits), `${R.crateCredits[0]}–${R.crateCredits[1]} credits, banked at once and listed as “crates” on the reward screen.`],
      ["Encounter card", pct(w.card), "Choose one of two named cards. It enters your hand, exhausts when played and vanishes when the encounter ends."],
      ["Empty", pct(w.empty), "Nothing. Bill of Lading turns it into credits."],
    ])}
    <p>${pct(R.crateMessageShare)} of the crates that hold something also hold an undelivered message.</p>
    <h4 class="hb-subhead">${icon("book", 16)} Undelivered messages</h4>
    <p>Laden hostiles and some crates carry a fragment of the archive's queue. It offers two named choices (three with Bill of Lading), and every choice states its exact result.</p>
    ${table(["Choice", "Exact result"], Object.values(MESSAGE_OPTIONS).map(option => [esc(option.name), esc(option.rule)]))}
    <h4 class="hb-subhead">${icon("warning", 16)} Reinforcements</h4>
    <p>From stage II a pack or single with an empty port may be reinforced: ${pct(R.reinforcementRate[1])} of fights in stage II, ${pct(R.reinforcementRate[2])} in stage III, and every stage III elite. The entrance line names the escort and its count in enemy phases (${R.reinforcementCount}; elites ${R.eliteReinforcementCount}), and every forecast repeats it until it lands. It takes the first empty port, left before right, carries a crate, and never escalates. A full rail makes it wait. At most one per fight; a Shedding hostile's escort is that one. A reinforced fight pays +${R.reinforcementCredits} credits.</p>
    <h4 class="hb-subhead">${icon("eye", 16)} Signals</h4>
    <p>${pct(R.signalRate[1])} of stage II fights and ${pct(R.signalRate[2])} of stage III fights hold one signal. It is announced at the start of turn ${R.signalTurn - 1}, naming its band, socket, device or level, and fires at the start of turn ${R.signalTurn} before the hand is dealt. A fight that ends first never fires it. Never in a guardian fight or in the first fight of an expedition; a fight with a reinforcement rolls only good signals.</p>
    ${table(["Signal", "Kind", "Effect"], Object.values(SIGNALS).map(signal => [esc(title(signal.name)), `<span class="hb-ribbon-inline ${signal.kind}">${designationMark(signal.kind, 12)}${signal.kind === "good" ? "Good" : "Bad"}</span>`, esc(signal.rule)]))}
    ${table(["Surprise", "What the forecast promises"], [
      ["Hidden designation", "Revealed on the entrance line before your first turn; the first forecast already includes it."],
      ["Reinforcement", "Named with its count on the entrance line and in every forecast until it arrives."],
      ["Signal", "Announced a full turn ahead with its exact target; the target never changes."],
      ["Crate", "Never forecast. It opens on the escort's death and never changes a number resolving against you that phase."],
      ["Message", "Never forecast. It opens before your next hand, never during the enemy phase."],
    ])}
    ${tip("The worst case", "A hidden ribbon, one announced arrival and the escalation clock. Never three unannounced problems in one fight.", "rule")}`;
  },

  archetypes: () => `
    <div class="hb-keepers">
      <article class="hb-keeper architect"><header><h4>Architect</h4><p class="hb-motto">Make a way through</p></header><div>
        <p><b>Engine:</b> width. Hot Swap makes your first Fiber each turn free and Patch Cable runs a cable without a card, so every router quickly becomes another channel (+${R.bandwidthPerChannel} each). Load Balancers and clusters multiply it.</p>
        <p><b>Play:</b> open with a route, then add a channel every turn you can. Spread routers North and South for separated-circuit shield.</p>
        <p><b>Risk:</b> many cables — Wire Weaver punishes ${R.weaverCables}+ cables, and long spans feed the Wraith.</p></div></article>
      <article class="hb-keeper warden"><header><h4>Warden</h4><p class="hb-motto">Hold what remains</p></header><div>
        <p><b>Engine:</b> Backpressure. Every point of damage your shield prevents is stored and added to your next transmission. Harden and stacked firewalls turn every enemy attack into your next hit.</p>
        <p><b>Play:</b> put firewalls online early, Harden on attack turns, then release the stored damage.</p>
        <p><b>Risk:</b> it only charges when the enemy attacks — fields, cuts and charges give nothing to reflect.</p></div></article>
      <article class="hb-keeper ghost"><header><h4>Ghost</h4><p class="hb-motto">Find the hidden path</p></header><div>
        <p><b>Engine:</b> Buffer. Store a transmission at ×${R.bufferMultiplier} and release everything at once. Store and Forward and Replay Attack grow it further. It counts toward interrupting ultimates.</p>
        <p><b>Play:</b> buffer when the enemy isn't cutting you, flush when it matters — charge turns are perfect.</p>
        <p><b>Risk:</b> packet loss. If a turn starts with no live route, the whole buffer is lost. Buffered turns deal nothing (Packet Leech heals).</p></div></article>
    </div>
    ${figure(bufferDiagram(R.bufferMultiplier), `Ghost: a buffered 8 becomes ${Math.floor(8 * R.bufferMultiplier)}, released on top of the next transmission.`)}
    ${tip("Archetype cards", "Some rewards belong to one keeper only — ECMP and Spine-Leaf for the Architect, Deep Packet Inspection and Reflect for the Warden, Store and Forward and Replay Attack for the Ghost.")}`,

  danger: () => `
    ${lead("When the forecast turns red, work down the list. Several answers exist for every threat; the cheapest one that fully covers it is usually right.")}
    ${table(["When…", "Look at", "Answers, cheapest first"], [
      ["Your only route will be cut", "The marked cable on the table", `Arm ${name("failover-policy")} · cable a ${name("honeypot")} · build a second channel · ${name("armored-fiber")} · patch next turn`],
      ["A breach is coming", "Right plate · shield forecast", `Bring a firewall online (${R.firewallBreachBlock} each) · ${name("ips-signature")} · block cards · Harden`],
      ["A device will be jammed", "The marked device", `${name("port-security")} · honeypot · ${name("shield")} · relocate out of a marked band · second channel`],
      ["A band is corrupted", "Field seals under the table", `${name("purge-field")} · move hardware out · route through another band · ${name("quarantine-rule")} before it lands`],
      ["An installation lands", `The magenta tag and its ${pipRow(2, 2, "install")} pips`, `Scrub it (${R.scrubCost} energy per point) · ${name("purge-field")} on its band · a firewall within ${reach} quarantines it for free · move its target out of the ring (${R.relocateCost})`],
      ["A Breaker Charge beside your router", "The countdown numeral and its ring", `Scrub it (${R.scrubCost}: it has ${INSTALL_INTEGRITY.breaker} integrity) · relocate the router out of the ${reach} ring (${R.relocateCost}) · ${name("demolition-charge")} · a ${name("server-rack")} in reach takes the blast`],
      ["A Jammer you cannot reach", "Its magenta ring and the jammed device", `Move its target out of the ring (${R.relocateCost}) · jam protection: ${name("shield")}, ${name("hardened-router")}, ${name("bastion")} · a cabled honeypot in reach decoys it and bites · ${name("purge-field")} on its band · a firewall within ${reach} wears it down`],
      ["A Spiteful hostile at lethal", "LETHAL with the coral SPITEFUL ribbon", `Its last announced action resolves anyway: cover it as if it lived · ${name("failover-policy")} or ${name("port-security")} cancel it · ${name("quarantine-rule")} if it is a field · kill it on a turn its action is harmless`],
      ["A device is worn", `A hollow pip ${pipRow(1, 2)} and a rust-orange nameplate`, `Repair it (${R.repairCost} energy per point) · ${name("patch")} restores ${R.faultClearRepair} · move it out of a Spike's ring · a second channel so a breakdown never silences you`],
      ["Junk in your hand", "Grey cards", `Delete a Worm (1) before transmitting (${R.wormDamage} damage otherwise) · Packet Loss vanishes at end of turn`],
      ["An ultimate is charging", "The guardian banner and break meter", "Prepare your biggest burst (P) · arm Tarpit · plan shield for the hit · Ghost: buffer now, flush next turn"],
      ["You are low on integrity", "“integrity at risk” on your plate", "Cover the forecast fully first · check the lethal preview — CANCELLED means you kill first · take the sanctuary's repair"],
      ["Your hand is bad", "Energy vs. options", "Use your console command · strengthen the network for later turns · Prepare the one card you need next turn · cycle with draw cards"],
    ], "hb-playbook")}
    ${tip("The lethal check", "If a port reads CANCELLED, your transmission defeats that hostile before it acts: its attack, fault, field and installation all vanish, while the others still act. Never spend shield on a turn you can end. A Spiteful hostile is the one exception.", "rule")}
    ${tip("Pressure grows", `After every three of its actions, a hostile's strikes and breaches grow by 1, and leaders climb three levels of disruption (from action ${R.escalationStart}; stage III from action ${R.escalationStartLate}). Long fights get more dangerous; an efficient network ends them first.`, "warn")}`,

  guardians: () => {
    const guardians = Object.values(ENEMIES).filter(enemy => enemy.boss);
    return `
    ${lead("Each stage ends at a guardian. It charges on its fifth action, or on its first action after falling to half health, whichever comes first; then it unleashes its ultimate. The warning comes one full turn ahead.")}
    ${table(["Guardian", "Stage trait", "Interrupt threshold"], guardians.map(enemy => [esc(enemy.name.replace(/^THE /, "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())), esc(enemy.trait), `${strong(enemy.boss!.breakDamage)} damage on the ultimate turn, +${R.addBreakBonus} per living add`]))}
    <ol class="hb-steps">
      <li><b>Charge turn.</b> No direct damage, but the guardian raises two adds at the outer ports. Each add alive when the ultimate resolves raises the threshold by ${R.addBreakBonus}. Spread deliveries onto the adds now, prepare your biggest burst (P), or arm Tarpit. Ghosts can buffer.</li>
      <li><b>Ultimate turn — interrupt.</b> Deal the threshold in one transmission (after armor and suppression). The attack and its field are cancelled, and the guardian is ${strong("exposed")}: next transmission +${R.exposedBonus}, armor ignored.</li>
      <li><b>…or brace.</b> Shield, firewalls and protocols can absorb the whole ultimate, and the adds' attacks with it. Interrupting cancels only the guardian's action: the adds still act. The meter shows which line is closer.</li>
      <li><b>Half health.</b> Guardians enrage: stronger attacks, and extra damage alongside faults and fields. The next intent shows it.</li>
    </ol>
    ${tip("Armor is a question", `Iron armor absorbs ${R.gradedArmorBase} minus ${R.gradedArmorPerChannel} per channel beyond the first — width answers it, and so does one very large hit. Plating is bypassed by any online firewall.`, "rule")}`;
  },

  cards: () => `
    <div class="hb-glossary">
      ${[
        ["Exhaust", "Removed for the rest of the encounter after you play it. Returns next battle."],
        ["Protocol · Armed", `Played face-down into your protocol slots (max ${R.maxProtocols}). Fires automatically on its trigger during the enemy's action, then discards.`],
        ["Burst", "Extra damage for this transmission only."],
        ["Block · Shield", "Protection against the coming enemy phase, shared by every attack in it. Expires afterwards."],
        ["Jam protection", "Faraday Shell, Hardened Router, Signal Relay and Bastion hardware cannot be jammed. Not the same as shield."],
        ["Armored cable", "Armored Fiber, VXLAN and Dark Fiber cannot be cut."],
        ["Upgrade (+)", "An improved version: lower cost, bigger numbers or extra draw. Upgrade at sanctuaries, markets and some events; later rewards sometimes come upgraded."],
        ["Prepare", "Hold one card for next turn for free; it replaces a draw."],
        ["Junk", "Injected by hostiles, removed after the encounter. Packet Loss is unplayable; a Worm costs 1 to delete and bites if kept."],
        ["Condition · Wear", `Every deployed device has ${R.deviceCondition} condition (salvage ${R.salvageCondition}). Overloads and Spikes wear it; at 0 it breaks. Repair costs ${R.repairCost} energy per point.`],
        ["Installation", `A hostile permanent on your table with 1–3 integrity. Scrub costs ${R.scrubCost} energy per point.`],
        ["Encounter card", "Offered by a crate or a message. It enters your hand for this encounter only and exhausts when played."],
        ["Curse", "A permanent unplayable card (CVE). Remove it at a sanctuary or market."],
        ["Archetype card", "Offered only to one keeper."],
        ["Rarity", "Common, uncommon, rare, legendary. Elites guarantee a rare choice. Rarity is power, not obligation — skipping a reward keeps your deck sharp."],
      ].map(([term, text]) => `<div class="hb-term"><dt>${term}</dt><dd>${text}</dd></div>`).join("")}
    </div>
    ${tip("A lean deck", "Every card you add is a card you draw less often. Skip rewards that don't fit, and remove weak basics at sanctuaries and markets.")}`,

  expedition: () => {
    const boss = (Object.keys(RELICS) as RelicId[]).filter(id => RELICS[id].tier === "boss");
    return `
    ${lead("An expedition crosses three stages of seven sectors. Choose one lit room per sector; only drawn connections can be followed. Every route crosses several fights and ends at the stage guardian.")}
    ${figure(mapDiagram(), "Scout the chart before you commit: enemies are named, rooms are marked.")}
    <p>A pack room shows ${strong("×2")} or ${strong("×3")} beside its symbol, its members listed leader first. A designated leader carries a small diamond under its name: ${designationMark("bad", 13)} coral for a bad ribbon, ${designationMark("good", 13)} teal for a good one, ${designationMark("unknown", 13)} static while it stays hidden until you enter. Reinforcements are never on the chart.</p>
    ${table(["Room", "What happens"], [
      ["Hostile signal", `A battle. Win credits and choose one of three cards (or skip). A pack pays +${R.packCredits}, a designated hostile +${R.designationCredits}, a reinforced fight +${R.reinforcementCredits}.`],
      ["Elite threat", "A tougher battle with a guaranteed rare card option and a relic."],
      ["Unknown signal", "An event: a choice with a visible trade-off."],
      ["Market", `Spend credits: cards (${CARD_PRICES.common}–${CARD_PRICES.legendary}), relics (${RELIC_PRICE.min}–${RELIC_PRICE.max}), removal (${REMOVE_PRICE.base}, +${REMOVE_PRICE.step} each time), upgrade (${UPGRADE_PRICE}).`],
      ["Salvage cache", "Choose one of three cards, plus a few credits."],
      ["Sanctuary", `One service: repair, upgrade a card, remove a card, or salvage a relic for ${SALVAGE_COST} maximum integrity.`],
      ["Stage guardian", "The climax. Defeat it for a card, a boss relic and a partial repair before the next stage."],
    ])}
    <h4 class="hb-subhead">${icon("crown", 16)} Boss relics</h4>
    <p>After the first two guardians you choose a boss relic: a powerful rule with a real drawback.</p>
    <div class="hb-relics">${boss.map(id => `<div class="hb-relic" style="--relic:${RELICS[id].color}"><b>${esc(RELICS[id].name)}</b><p>${esc(RELICS[id].rules)}</p></div>`).join("")}</div>
    <h4 class="hb-subhead">${icon("elite", 16)} Ascension</h4>
    <p>Win an expedition to unlock the next ascension level for that keeper (up to ${MAX_ASCENSION}). Levels stack.</p>
    <ol class="hb-ascension">${ASCENSION_LEVELS.map(level => `<li><b>${level.level}</b><span>${esc(level.name)}</span><p>${esc(level.rule)}</p></li>`).join("")}</ol>`;
  },
};

export function handbookMarkup(chapter = "start"): string {
  const current = HANDBOOK_CHAPTERS.find(item => item.id === chapter) ?? HANDBOOK_CHAPTERS[0];
  const index = HANDBOOK_CHAPTERS.indexOf(current);
  const previous = HANDBOOK_CHAPTERS[index - 1], next = HANDBOOK_CHAPTERS[index + 1];
  return `<div class="handbook" data-chapter="${current.id}">
    <div class="hb-layout">
      <nav class="hb-nav" aria-label="Handbook chapters">
        <h2 class="hb-book-title">Handbook</h2>
        ${HANDBOOK_CHAPTERS.map((item, i) => `<button data-handbook="${item.id}" class="${item.id === current.id ? "current" : ""}" ${item.id === current.id ? 'aria-current="page"' : ""}><b>${NUMERALS[i]}</b><span>${item.title}</span></button>`).join("")}
        <button class="plate-button hb-training" data-action="tutorial">${icon("play", 14)} Field Training</button>
      </nav>
      <article class="hb-chapter" aria-labelledby="hb-title">
        <header class="hb-chapter-head"><span class="hb-seal" aria-hidden="true">${icon(current.icon, 22)}</span><span class="hb-numeral">Chapter ${NUMERALS[index]}</span><h3 id="hb-title">${current.title}</h3></header>
        ${CHAPTER_BODIES[current.id]()}
        <footer class="hb-pager">${previous ? `<button class="text-button" data-handbook="${previous.id}">${icon("back", 15)} ${previous.title}</button>` : "<span></span>"}${next ? `<button class="text-button" data-handbook="${next.id}">${next.title} ${icon("arrow", 15)}</button>` : ""}</footer>
      </article>
    </div>
  </div>`;
}
