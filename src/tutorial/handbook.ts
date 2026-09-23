/** The Signal Keeper's Handbook: an illustrated rules reference.
 * Every number is read from the live rules (RULES, CARDS, RELICS, ENEMIES,
 * ascension and market constants), so the handbook cannot drift from balance. */
import { CARDS, RELICS, RULES } from "../core/cards.ts";
import { ENEMIES } from "../core/enemies.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "../core/ascension.ts";
import { CARD_PRICES, RELIC_PRICE, REMOVE_PRICE, UPGRADE_PRICE, SALVAGE_COST } from "../core/meta.ts";
import { CONSOLES } from "../core/run.ts";
import type { BaseCardId, ConsoleId, RelicId } from "../core/types.ts";
import { bandsDiagram, bottleneckDiagram, bufferDiagram, loopDiagram, mapDiagram, onlineDiagram, rerouteDiagram, routesDiagram } from "./diagrams.ts";
import { esc, icon } from "./icons.ts";

export interface HandbookChapter {
  id: string;
  title: string;
  kicker: string;
  icon: string;
}
export const HANDBOOK_CHAPTERS: readonly HandbookChapter[] = [
  { id: "start", title: "Your First Turn", kicker: "THE LOOP", icon: "play" },
  { id: "routes", title: "Routes & Channels", kicker: "DAMAGE", icon: "link" },
  { id: "devices", title: "Online Devices", kicker: "THE NETWORK IS YOUR ARMY", icon: "field" },
  { id: "defense", title: "Intents & Shield", kicker: "READING THE ENEMY", icon: "shield" },
  { id: "zones", title: "Bands & Fields", kicker: "NORTH · CENTER · SOUTH", icon: "map" },
  { id: "rerouting", title: "Rerouting", kicker: "WHEN THE LINE IS CUT", icon: "undo" },
  { id: "tools", title: "Protocols & Console", kicker: "ANSWERS IN ADVANCE", icon: "eye" },
  { id: "archetypes", title: "The Three Keepers", kicker: "ARCHITECT · WARDEN · GHOST", icon: "crown" },
  { id: "danger", title: "Danger Playbook", kicker: "WHAT TO DO WHEN…", icon: "heart" },
  { id: "guardians", title: "Guardians", kicker: "CHARGE · ULTIMATE · EXPOSED", icon: "boss" },
  { id: "cards", title: "Cards & Keywords", kicker: "GLOSSARY", icon: "deck" },
  { id: "expedition", title: "The Expedition", kicker: "MAP · MARKET · RELICS", icon: "coins" },
];

const R = RULES;
const card = (id: BaseCardId) => CARDS[id];
const name = (id: BaseCardId) => esc(card(id)?.name ?? id);
const rules = (id: BaseCardId) => esc(card(id)?.rules ?? "");
const strong = (text: string | number) => `<strong>${text}</strong>`;

function table(headers: string[], rows: string[][], cls = "") {
  return `<div class="hb-table-wrap"><table class="hb-table ${cls}"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function tip(title: string, body: string, kind: "tip" | "warn" | "rule" = "tip") {
  return `<aside class="hb-note ${kind}"><b>${title}</b><p>${body}</p></aside>`;
}
function figure(svg: string, caption: string) {
  return `<figure class="hb-figure">${svg}<figcaption>${caption}</figcaption></figure>`;
}
function lead(text: string) {
  return `<p class="hb-lead">${text}</p>`;
}

const CHAPTER_BODIES: Record<string, () => string> = {
  start: () => `
    ${lead(`Every turn you get ${strong(R.baseEnergy)} energy and draw ${strong(R.handDraw)} cards (hand limit ${R.handLimit}). You build a network between the terminals ${strong("ALPHA")} and ${strong("OMEGA")}, then press ${strong("Transmit")}: your network deals damage, and the hostile answers with the move it announced.`)}
    ${figure(loopDiagram(), "One turn. Hardware and cables stay on the table for the whole encounter; block and burst last one turn.")}
    <div class="hb-columns">
      <section><h4>${icon("bolt", 16)} Energy & cards</h4><p>Cards cost the number in their corner. Unspent energy is lost unless a relic says otherwise. Played cards go to discard; ${strong("Exhaust")} cards leave for the rest of the encounter. When your draw pile runs out, the discard pile is shuffled back in.</p></section>
      <section><h4>${icon("eye", 16)} Everything is forecast</h4><p>Before you transmit, both plates show the exact outcome: your damage with every term, the hostile's action, its target and the integrity you will lose. What you see is what resolves. Open ${strong("Details")} for the full calculation.</p></section>
      <section><h4>${icon("deck", 16)} Prepare</h4><p>Press ${strong("P")}, or click the ${strong("+ PREPARE")} slot at the bottom left beside your Draw, Discard and Exhaust piles, to set one card aside for free. It becomes the first card of your next hand, replacing a draw. Use it to hold an answer for a turn you can already see coming.</p></section>
      <section><h4>${icon("undo", 16)} Undo & inspect</h4><p>${strong("Z")} undoes the last action this turn. Right-click any card, or press ${strong("I")}, to inspect it. Relocating a placed device costs ${strong(R.relocateCost)} energy.</p></section>
    </div>
    ${tip("Integrity is your life", "Integrity carries over between rooms. At zero the expedition ends. Winning a battle never heals by itself — sanctuaries, events and a few relics do.", "rule")}`,

  routes: () => `
    ${lead(`A ${strong("route")} is a path of live cables from ALPHA to OMEGA through at least one router. ${strong("Channels")} are routes that share no device between the terminals. Your ${strong("primary route")} — the strongest one — carries the damage; every extra channel adds bandwidth.`)}
    ${figure(routesDiagram(), `Two channels: ${R.baseRouteDamage} + ${R.switchDamage} (switch) on the primary route, +${R.bandwidthPerChannel} bandwidth for the second channel.`)}
    ${table(["Damage term", "Amount", "Where it counts"], [
      ["Live router route", `+${R.baseRouteDamage}`, "Primary route"],
      ["Edge Switch", `+${R.switchDamage} each`, "Each switch on the primary route"],
      ["Startup Config · Overclock", `+${R.configuredDamage} · +${R.overclockDamage} per router`, "Routers on the primary route"],
      ["Packet Compression", `+${R.compressionDamage} per switch`, "Compressed switches on the primary route"],
      ["Amplified cable", `+${R.amplifiedCableDamage} each`, "Amplified cables on the primary route"],
      ["Resonance · Suppression", `+${R.resonanceDamage} · −${R.suppressionPenalty} per band`, "Bands crossed by primary-route hardware"],
      ["Bandwidth", `+${R.bandwidthPerChannel} per channel beyond the first`, "Whole network"],
      ["Load Balancer", `+${R.balancerPerChannel} per channel, each`, "Online balancers"],
      ["Cluster", `+${R.clusterDamage} per band`, `Bands with ${R.clusterThreshold}+ online devices`],
      ["Malware", `−${R.malwarePenalty} each`, "Every malware node on the table"],
      ["Burst · Buffer · Backpressure", "as shown", "This transmission"],
      ["Exposed guardian", `+${R.exposedBonus}`, "After an interrupted ultimate"],
    ])}
    ${figure(bottleneckDiagram(), "Two paths through one shared switch are a single channel.")}
    ${tip("No hidden caps", "Every switch, every channel and every balancer counts. The limits are physical: 14 sockets on the table, your energy, and what the enemy can cut.", "rule")}`,

  devices: () => `
    ${lead(`A device is ${strong("online")} while at least one live route passes through it — not only your primary route. Offline devices do nothing. A cut cable or a jam can take a whole branch offline, which is why redundancy protects your engine.`)}
    ${figure(onlineDiagram(), "The firewall is online on a live route. A dead-end branch and an uncabled server stay offline.")}
    ${table(["Device", "Card", "Cost", "While online"], [
      ["Router", name("router"), String(card("router").cost), "Required for any route."],
      ["Switch", name("switch"), String(card("switch").cost), `+${R.switchDamage} damage on the primary route.`],
      ["Firewall", name("firewall"), String(card("firewall").cost), `Blocks ${R.firewallBreachBlock} of a breach or ${R.firewallStrikeBlock} of a strike. Firewalls stack. Also gets past hostile plating.`],
      ["Honeypot", name("honeypot"), String(card("honeypot").cost), `Works even offline: while cabled, jams and cuts hit it first; the attacker takes ${R.honeypotDamage}.`],
      ["Cache Server", name("cache-server"), String(card("cache-server").cost), "Online at the start of your turn: draw 1 more."],
      ["PoE Injector", name("poe-injector"), String(card("poe-injector").cost), "Online at the start of your turn: +1 energy."],
      ["Load Balancer", name("load-balancer"), String(card("load-balancer").cost), `+${R.balancerPerChannel} damage per live channel.`],
    ])}
    ${tip("“Start of your turn” means after the enemy acts", "The hostile's cut or jam lands first. If it takes your Cache Server or PoE Injector offline, that bonus is lost for the turn. The forecast shows next turn's energy and draw.", "warn")}
    ${tip("Salvage", "Some battlefields start with a weathered device already on the table. Cable it into a route and it is yours.")}`,

  defense: () => `
    ${lead("Hostiles show their next action before you commit. The right plate names it, its target and its damage; your plate shows what gets through after your shield.")}
    <div class="hb-intents">
      ${[
        ["sword", "Strike", "Direct integrity damage. Shield, Rate Limiter, firewalls (1 each)."],
        ["sword", "Breach", `Heavy damage through your boundary. Online firewalls block ${R.firewallBreachBlock} each; IPS Signature.`],
        ["link", "Sever", "Cuts a cable for your next turn. Second channel, Failover Policy, armored cables, honeypot."],
        ["bolt", "Jam", "Disables a device for your next turn. Faraday Shell, Port Security, honeypot, relocate."],
        ["field", "Corrupt", "Casts a hostile field on a band for two turns. Purge Field, Quarantine Rule, move out."],
        ["cleanse", "Infect", `Plants malware (−${R.malwarePenalty} damage each). Scrub it for ${R.scrubCost} energy, or Purge its band.`],
        ["deck", "Inject", "Shuffles junk into your draw pile: Packet Loss clogs a hand, a Worm bites if kept."],
        ["boss", "Charge → Ultimate", "A guardian's climax. Interrupt with a big transmission, or brace."],
      ].map(([i, t, d]) => `<div class="hb-intent"><span>${icon(i, 20)}</span><b>${t}</b><p>${d}</p></div>`).join("")}
    </div>
    ${table(["Shield source", "Amount", "Lasts"], [
      ["Block cards (Packet Guard, Aegis Protocol…)", "as printed", "This enemy action"],
      ["Online firewall", `${R.firewallBreachBlock} vs breach · ${R.firewallStrikeBlock} vs strike, each`, "Every enemy attack"],
      ["Aegis Field", `${R.aegisShield} with a live route through the band`, `${R.alliedFieldTurns} turns`],
      ["Null Field", `${R.nullFieldShield} while your hardware occupies the band`, `${R.alliedFieldTurns} turns`],
      ["Separated circuits", `${R.separatedCircuitShield}: channels with a North router and a South router`, "While both are live"],
      ["Protocols", "cancel or reduce the matching attack", "Until they trigger"],
    ])}
    ${tip("Spend exactly enough", "Shield beyond the forecast is wasted: it expires after the hostile acts. Cover the number, then spend the rest on damage or on your network.")}`,

  zones: () => `
    ${lead(`The table has three bands: ${strong("North")}, ${strong("Center")} and ${strong("South")}. Fields, band attacks and clusters make every placement a decision. Each band holds one allied and one hostile field; recasting replaces your own.`)}
    ${figure(bandsDiagram(), "Fields shape the bands; clusters reward crowding, separated circuits reward spreading.")}
    ${table(["Field", "Effect", "Duration"], [
      [name("resonance-field"), `+${R.resonanceDamage} damage to routes whose hardware crosses the band`, `${R.alliedFieldTurns} turns`],
      [name("aegis-field"), `+${R.aegisShield} shield with a live route through the band`, `${R.alliedFieldTurns} turns`],
      [name("null-field"), `+${R.nullFieldShield} shield while your hardware occupies it`, `${R.alliedFieldTurns} turns`],
      [name("purge-field"), "Cleanses hostile fields, jams and malware in the band; draws a card", "Instant"],
      ["Corrosion (hostile)", `+${R.corrosionDamage} incoming damage while your hardware occupies the band`, `${R.hostileFieldTurns} turns`],
      ["Suppression (hostile)", `−${R.suppressionPenalty} damage to routes crossing the band`, `${R.hostileFieldTurns} turns`],
      ["Terrain field", "Crystal veins (resonance) or interference (suppression) that last the whole battle", "Encounter"],
    ])}
    <div class="hb-columns">
      <section><h4>${icon("field", 16)} Crowd: clusters</h4><p>A band with ${strong(R.clusterThreshold)} or more online devices is a cluster: ${strong(`+${R.clusterDamage}`)} damage per clustered band. But crowded bands are what corrosion, storms and ash target first.</p></section>
      <section><h4>${icon("shield", 16)} Spread: separated circuits</h4><p>Channels with a router in the North and a different channel with a router in the South grant ${strong(`+${R.separatedCircuitShield}`)} shield every enemy action — and a band attack can only reach one of them.</p></section>
      <section><h4>${icon("bolt", 16)} Band attacks</h4><p>Null Storm and Ash Moth announce a band and jam unprotected hardware inside it, cycling North → Center → South. Empty bands dodge for free. Widow suppresses the busiest band of your route.</p></section>
      <section><h4>${icon("map", 16)} Moving</h4><p>Drag a placed device, or select it and choose a band: ${strong(R.relocateCost)} energy. The preview shows damage, shield and life lost before you drop it. Wreckage blocks some sockets on most battlefields.</p></section>
    </div>`,

  rerouting: () => `
    ${lead("A broken route deals nothing, and a cut can take a whole branch offline. You can see every cut coming — plan the answer before it lands.")}
    <div class="hb-reroute-grid">
      ${figure(rerouteDiagram("silent"), "One route is a single point of failure.")}
      ${figure(rerouteDiagram("second"), `A second channel keeps the signal alive and adds +${R.bandwidthPerChannel} while both stand.`)}
      ${figure(rerouteDiagram("patch"), `${name("patch")} clears the active cut or jam and draws. ${name("failover-policy")} cancels the next cut before it happens.`)}
      ${figure(rerouteDiagram("move"), `Relocate hardware out of a marked jam band for ${R.relocateCost} energy.`)}
    </div>
    <ol class="hb-steps">
      <li><b>Read the target.</b> The marked cable or device on the table is exactly what will be hit. Hostiles aim at your primary route; the Cable Wraith always takes the longest unarmored cable.</li>
      <li><b>Is it your only route?</b> If yes, you need a second channel, a protocol, a decoy or a repair next turn.</li>
      <li><b>Cheapest answers first.</b> ${name("failover-policy")} (arm it once, it waits), a cabled ${name("honeypot")} to pull the cut away, or ${name("armored-fiber")} for cables that cannot be cut.</li>
      <li><b>Build width when you can.</b> A second channel answers every future cut at once — and pays bandwidth every turn.</li>
      <li><b>After a cut:</b> ${name("patch")} or ${name("reroute")} reconnect; relocating a device can bridge around a jam.</li>
    </ol>
    ${tip("Avoid bottlenecks", "Two routes through one shared switch or firewall are one channel. Give each channel its own devices.", "warn")}
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
      ${(["patch", "harden", "buffer"] as ConsoleId[]).map(id => `<div class="hb-console ${id}"><span class="hb-console-cost">${c[id].cost}</span><b>${esc(c[id].name)}</b><small>${id === "patch" ? "ARCHITECT" : id === "harden" ? "WARDEN" : "GHOST"}</small><p>${esc(c[id].rules)}</p></div>`).join("")}
    </div>
    ${tip("Honeypot", `A cabled honeypot pulls jams and cable cuts onto itself; each one it absorbs deals ${R.honeypotDamage} to the attacker. It works even when offline. (The Cable Wraith is not fooled — it hunts long cables.)`)}`;
  },

  archetypes: () => `
    <div class="hb-keepers">
      <article class="hb-keeper architect"><span class="eyebrow">ARCHITECT · MESH</span><h4>Make a way through</h4>
        <p><b>Engine:</b> width. Hot Swap makes your first Fiber each turn free and Patch Cable runs a cable without a card, so every router quickly becomes another channel (+${R.bandwidthPerChannel} each). Load Balancers and clusters multiply it.</p>
        <p><b>Play:</b> open with a route, then add a channel every turn you can. Spread routers North and South for separated-circuit shield.</p>
        <p><b>Risk:</b> many cables — Wire Weaver punishes ${R.weaverCables}+ cables, and long spans feed the Wraith.</p></article>
      <article class="hb-keeper warden"><span class="eyebrow">WARDEN · FORTRESS</span><h4>Hold what remains</h4>
        <p><b>Engine:</b> Backpressure. Every point of damage your shield prevents is stored and added to your next transmission. Harden and stacked firewalls turn every enemy attack into your next hit.</p>
        <p><b>Play:</b> put firewalls online early, Harden on attack turns, then release the stored damage.</p>
        <p><b>Risk:</b> it only charges when the enemy attacks — fields, cuts and charges give nothing to reflect.</p></article>
      <article class="hb-keeper ghost"><span class="eyebrow">GHOST · BUFFER</span><h4>Find the hidden path</h4>
        <p><b>Engine:</b> Buffer. Store a transmission at ×${R.bufferMultiplier} and release everything at once. Store and Forward and Replay Attack grow it further. It counts toward interrupting ultimates.</p>
        <p><b>Play:</b> buffer when the enemy isn't cutting you, flush when it matters — charge turns are perfect.</p>
        <p><b>Risk:</b> packet loss. If a turn starts with no live route, the whole buffer is lost. Buffered turns deal nothing (Packet Leech heals).</p></article>
    </div>
    ${figure(bufferDiagram(R.bufferMultiplier), "Ghost: a buffered 8 becomes 12, released on top of the next transmission.")}
    ${tip("Archetype cards", "Some rewards belong to one keeper only — ECMP and Spine-Leaf for the Architect, Deep Packet Inspection and Reflect for the Warden, Store and Forward and Replay Attack for the Ghost.")}`,

  danger: () => `
    ${lead("When the forecast turns red, work down the list. Several answers exist for every threat; the cheapest one that fully covers it is usually right.")}
    ${table(["When…", "Look at", "Answers, cheapest first"], [
      ["Your only route will be cut", "The marked cable on the table", `Arm ${name("failover-policy")} · cable a ${name("honeypot")} · build a second channel · ${name("armored-fiber")} · patch next turn`],
      ["A breach is coming", "Right plate · shield forecast", `Bring a firewall online (${R.firewallBreachBlock} each) · ${name("ips-signature")} · block cards · Harden`],
      ["A device will be jammed", "The marked device", `${name("port-security")} · honeypot · ${name("shield")} · relocate out of a marked band · second channel`],
      ["A band is corrupted", "Field seals under the table", `${name("purge-field")} · move hardware out · route through another band · ${name("quarantine-rule")} before it lands`],
      ["Malware appears", "Red crystals on the table", `Scrub it (${R.scrubCost} energy) · ${name("purge-field")} on its band`],
      ["Junk in your hand", "Grey cards", `Delete a Worm (1) before transmitting (${R.wormDamage} damage otherwise) · Packet Loss vanishes at end of turn`],
      ["An ultimate is charging", "The guardian banner and break meter", "Prepare your biggest burst (P) · arm Tarpit · plan shield for the hit · Ghost: buffer now, flush next turn"],
      ["You are low on integrity", "“integrity at risk” on your plate", "Cover the forecast fully first · check the lethal preview — CANCELLED means you kill first · take the sanctuary's repair"],
      ["Your hand is bad", "Energy vs. options", "Use your console command · strengthen the network for later turns · Prepare the one card you need next turn · cycle with draw cards"],
    ], "hb-playbook")}
    ${tip("The lethal check", "If the intent medallion reads CANCELLED, your transmission defeats the hostile before it acts: its attack, fault and field all vanish. Never spend shield on a turn you can end.", "rule")}
    ${tip("Pressure grows", "After every three enemy actions, strikes and breaches grow by 1. Long fights get more dangerous; an efficient network ends them first.", "warn")}`,

  guardians: () => {
    const guardians = Object.values(ENEMIES).filter(enemy => enemy.boss);
    return `
    ${lead("Each stage ends at a guardian. After four ordinary actions it spends a turn charging, then unleashes its ultimate. The warning comes one full turn ahead.")}
    ${table(["Guardian", "Stage trait", "Interrupt threshold"], guardians.map(enemy => [esc(enemy.name.replace(/^THE /, "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())), esc(enemy.trait), `${strong(enemy.boss!.breakDamage)} damage on the ultimate turn`]))}
    <ol class="hb-steps">
      <li><b>Charge turn.</b> No direct damage. Prepare your biggest burst (P), arm Tarpit, and set up the network for next turn. Ghosts can buffer now.</li>
      <li><b>Ultimate turn — interrupt.</b> Deal the threshold in one transmission (after armor and suppression). The attack and its field are cancelled, and the guardian is ${strong("exposed")}: next transmission +${R.exposedBonus}, armor ignored.</li>
      <li><b>…or brace.</b> Shield, firewalls and protocols can absorb the whole ultimate. Both lines are valid; the meter shows which is closer.</li>
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
        ["Block · Shield", "Protection against the coming enemy action. Expires afterwards."],
        ["Jam protection", "Faraday Shell, Hardened Router, Signal Relay and Bastion hardware cannot be jammed. Not the same as shield."],
        ["Armored cable", "Armored Fiber, VXLAN and Dark Fiber cannot be cut."],
        ["Upgrade (+)", "An improved version: lower cost, bigger numbers or extra draw. Upgrade at sanctuaries, markets and some events; later rewards sometimes come upgraded."],
        ["Prepare", "Hold one card for next turn for free; it replaces a draw."],
        ["Junk", "Injected by hostiles, removed after the encounter. Packet Loss is unplayable; a Worm costs 1 to delete and bites if kept."],
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
    ${table(["Room", "What happens"], [
      ["Hostile signal", "A battle. Win credits and choose one of three cards (or skip)."],
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
    <header class="hb-header"><span class="eyebrow">THE SIGNAL KEEPER'S HANDBOOK</span><h2>Your network is your weapon.</h2>
      <button class="gold-button hb-training" data-action="tutorial">${icon("play", 16)} Field training</button></header>
    <div class="hb-layout">
      <nav class="hb-nav" aria-label="Handbook chapters">${HANDBOOK_CHAPTERS.map((item, i) => `<button data-handbook="${item.id}" class="${item.id === current.id ? "current" : ""}" ${item.id === current.id ? 'aria-current="page"' : ""}><b>${String(i + 1).padStart(2, "0")}</b><span>${item.title}</span></button>`).join("")}</nav>
      <article class="hb-chapter" aria-labelledby="hb-title">
        <span class="hb-kicker">${icon(current.icon, 14)} ${current.kicker}</span>
        <h3 id="hb-title">${current.title}</h3>
        ${CHAPTER_BODIES[current.id]()}
        <footer class="hb-pager">${previous ? `<button data-handbook="${previous.id}">${icon("back", 14)} ${previous.title}</button>` : "<span></span>"}${next ? `<button data-handbook="${next.id}">${next.title} ${icon("arrow", 14)}</button>` : ""}</footer>
      </article>
    </div>
  </div>`;
}
