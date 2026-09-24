/** Inline SVG diagrams for the handbook and training walkthrough.
 * Pure strings; colours and type come from CSS classes in tutorial.css, so every
 * label uses the game's bundled faces and every symbol is a drawn icon. Numbers
 * are read from the live rules. */
import { RULES } from "../core/cards.ts";
import { glyph } from "./icons.ts";

const R = RULES;
type Role = "router" | "switch" | "firewall" | "honeypot" | "cache" | "power" | "balancer";
type State = "primary" | "channel" | "online" | "offline" | "danger" | "worn";

const GLYPHS: Record<Role, string> = {
  router: '<circle r="13"/><path d="M-6 0h12M0-6v12M-6 0l3-3m-3 3 3 3M6 0 3-3m3 3-3 3"/>',
  switch: '<rect x="-11" y="-11" width="22" height="22" rx="3"/><path d="M-6-3h12M-6 3h12"/>',
  firewall: '<path d="M0-14 11-9v6c0 8-11 15-11 15S-11 5-11-3v-6Z"/><path d="M-5 0l4 4 6-7"/>',
  honeypot: '<path d="M-8-9h16l-2 5c5 3 6 9 1 14h-14c-5-5-4-11 1-14Z"/><path d="M-4 1h8"/>',
  cache: '<rect x="-11" y="-13" width="22" height="26" rx="2"/><path d="M-7-6h14M-7 0h14M-7 6h14"/>',
  power: '<circle r="13"/><path d="m2-8-7 9h5l-2 7 7-9h-5Z"/>',
  balancer: '<path d="M0-13 13 0 0 13-13 0Z"/><path d="M-6 0h4m0 0 5-5m-5 5 5 5"/>',
};

function device(x: number, y: number, role: Role, state: State = "online", label = "") {
  return `<g class="hb-device ${role} ${state}" transform="translate(${x} ${y})">${GLYPHS[role]}${label ? `<text y="31">${label}</text>` : ""}</g>`;
}
function terminal(x: number, y: number, label: string, small = false) {
  const w = small ? 50 : 62;
  return `<g class="hb-terminal" transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="2"/><text y="5">${label}</text></g>`;
}
function wire(x1: number, y1: number, x2: number, y2: number, kind: "primary" | "channel" | "idle" | "dead" | "cut" = "idle") {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `<line class="hb-wire ${kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${kind === "cut" ? `<g class="hb-cut" transform="translate(${mx} ${my})"><path d="M-7-7 7 7M7-7-7 7"/></g>` : ""}`;
}
function tag(x: number, y: number, text: string, kind = "", anchor: "start" | "middle" | "end" = "middle") {
  return `<text class="hb-tag ${kind}" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
}
function svg(viewBox: string, label: string, body: string, cls = "") {
  return `<svg class="hb-diagram ${cls}" viewBox="${viewBox}" role="img" aria-label="${label}"><defs><filter id="hb-glow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="900" height="600"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${body}</svg>`;
}

/** Two channels: a gold primary route and a cyan second channel. */
export function routesDiagram(): string {
  return svg("0 0 560 234", "Two channels from ALPHA to OMEGA. The primary route passes a router and a switch; a second channel passes another router.", [
    wire(70, 115, 205, 55, "primary"), wire(205, 55, 345, 55, "primary"), wire(345, 55, 490, 115, "primary"),
    wire(70, 115, 280, 180, "channel"), wire(280, 180, 490, 115, "channel"),
    terminal(40, 115, "Alpha"), terminal(520, 115, "Omega"),
    device(205, 55, "router", "primary", "Router"), device(345, 55, "switch", "primary", "Switch"),
    device(280, 180, "router", "channel", "Router"),
    tag(275, 18, `Primary route · ${R.baseRouteDamage} + ${R.switchDamage} switch`, "gold"),
    tag(280, 230, `Second channel · +${R.bandwidthPerChannel} bandwidth`, "cyan"),
  ].join(""));
}

/** Two routes through one device are one channel: the shared switch carries the table's brass
 * junction seal (the merge glyph and the number of routes through it). */
export function bottleneckDiagram(): string {
  return svg("0 0 560 214", "Two routes pass through one switch: 2 routes, 1 channel. A brass seal on the switch shows the 2 routes that merge there.", [
    wire(70, 104, 190, 48, "primary"), wire(190, 48, 330, 104, "primary"),
    wire(70, 104, 190, 160, "idle"), wire(190, 160, 330, 104, "idle"),
    wire(330, 104, 490, 104, "primary"),
    terminal(40, 104, "Alpha"), terminal(520, 104, "Omega"),
    device(190, 48, "router", "primary"), device(190, 160, "router", "online"),
    device(330, 104, "switch", "primary", "Switch"),
    junctionSeal(372, 72, 2),
    tag(280, 18, "2 routes · 1 channel", "gold"),
    tag(280, 206, "A device carries one channel: jam the switch and both routes go dark", "muted"),
  ].join(""));
}
/** The table's junction seal: a clipped brass tag with the merge glyph and a number. */
function junctionSeal(x: number, y: number, routes: number) {
  return `<g class="hb-junction" transform="translate(${x} ${y})"><path class="hb-junction-plate" d="M-21-13h42l5 5v16l-5 5h-42l-5-5v-16Z"/><path class="hb-junction-glyph" transform="translate(-23 -9) scale(0.75)" d="M3 6.5c4.5 0 6.5 5.5 10 5.5M3 17.5c4.5 0 6.5-5.5 10-5.5M13 12h8"/><text x="11" y="5.5">${routes}</text></g>`;
}

/** Online vs offline hardware. */
export function onlineDiagram(): string {
  return svg("0 0 560 244", "A firewall on a live route is online. A cache server with no route through it is offline.", [
    wire(70, 80, 200, 80, "primary"), wire(200, 80, 340, 80, "primary"), wire(340, 80, 490, 80, "primary"),
    wire(70, 80, 175, 162, "dead"),
    terminal(40, 80, "Alpha"), terminal(520, 80, "Omega"),
    device(200, 80, "router", "primary", "Router"), device(340, 80, "firewall", "online", "Online"),
    device(175, 162, "power", "offline", "Dead end"), device(395, 162, "cache", "offline", "No cable"),
    tag(340, 32, "Any live route counts", "cyan"),
    tag(280, 238, "Offline devices do nothing", "muted"),
  ].join(""));
}

/** The three bands with fields, a cluster and separated circuits. */
export function bandsDiagram(): string {
  const band = (y: number, h: number, name: string, cls: string, field: string, effect: string) =>
    `<g class="hb-band ${cls}"><rect x="10" y="${y}" width="430" height="${h}" rx="2"/><text class="hb-band-name" x="22" y="${y + 21}">${name}</text>` +
    `<line class="hb-band-rule" x1="452" y1="${y + 6}" x2="452" y2="${y + h - 6}"/><text class="hb-band-field" x="464" y="${y + h / 2 - 4}">${field}</text><text class="hb-band-note" x="464" y="${y + h / 2 + 14}">${effect}</text></g>`;
  return svg("0 0 640 322", "The table has three bands: North, Center and South, each with a field.", [
    band(10, 82, "North", "suppressed", "Suppression", `−${R.suppressionPenalty} to routes crossing`),
    band(96, 90, "Center", "resonant", "Resonance", `+${R.resonanceDamage} to routes crossing`),
    band(190, 82, "South", "corroded", "Corrosion", `+${R.corrosionDamage} incoming if occupied`),
    wire(64, 141, 175, 50, "channel"), wire(175, 50, 386, 141, "channel"),
    wire(64, 141, 175, 232, "channel"), wire(175, 232, 386, 141, "channel"),
    wire(64, 141, 225, 141, "primary"), wire(225, 141, 305, 141, "primary"), wire(305, 141, 386, 141, "primary"),
    wire(225, 141, 265, 168, "idle"), wire(265, 168, 305, 141, "idle"),
    terminal(46, 141, "Alpha", true), terminal(404, 141, "Omega", true),
    device(175, 50, "router", "channel"), device(175, 232, "router", "channel"),
    device(225, 141, "router", "primary"), device(305, 141, "switch", "primary"), device(265, 170, "balancer", "online"),
    `<g class="hb-legend"><line class="hb-wire channel" x1="14" y1="293" x2="44" y2="293"/>${tag(54, 297, `North and South channel routers · separated circuits +${R.separatedCircuitShield} shield`, "cyan", "start")}` +
    `<line class="hb-wire primary" x1="14" y1="314" x2="44" y2="314"/>${tag(54, 318, `${R.clusterThreshold} online devices in Center · cluster +${R.clusterDamage} damage`, "gold", "start")}</g>`,
  ].join(""));
}

/** Rerouting: four small panels. */
export function rerouteDiagram(kind: "silent" | "second" | "patch" | "move"): string {
  const base = (body: string, caption: string, cls = "") => svg("0 0 260 152", caption, `${body}${tag(130, 144, caption, cls)}`, "hb-mini");
  const ends = (y: number) => terminal(28, y, "Alpha", true) + terminal(232, y, "Omega", true);
  if (kind === "silent") return base([
    wire(40, 70, 130, 70, "primary"), wire(130, 70, 220, 70, "cut"),
    ends(70), device(130, 70, "router", "offline"),
  ].join(""), "One route, one cut: silence", "danger");
  if (kind === "second") return base([
    wire(40, 70, 130, 35, "primary"), wire(130, 35, 220, 70, "cut"),
    wire(40, 70, 130, 105, "channel"), wire(130, 105, 220, 70, "channel"),
    ends(70), device(130, 35, "router", "offline"), device(130, 105, "router", "channel"),
  ].join(""), "A second channel keeps talking", "cyan");
  if (kind === "patch") return base([
    wire(40, 70, 130, 70, "primary"), wire(130, 70, 220, 70, "primary"),
    `<path class="hb-spark" d="M168 58 175 70 168 82"/>`,
    ends(70), device(130, 70, "router", "primary"),
  ].join(""), "Hot Patch or Failover: reconnect", "gold");
  return base([
    `<rect class="hb-jam-band" x="6" y="8" width="248" height="42" rx="2"/>`,
    tag(242, 25, "Jam band", "danger", "end"),
    device(130, 30, "router", "offline"),
    `<path class="hb-move" d="M130 48 V 76"/>`,
    wire(40, 95, 130, 95, "primary"), wire(130, 95, 220, 95, "primary"),
    ends(95), device(130, 95, "router", "primary"),
  ].join(""), `Relocate out (${R.relocateCost} energy)`, "gold");
}

/** Ghost buffer: store at ×multiplier, then release. */
export function bufferDiagram(multiplier: number): string {
  const store = Math.floor(8 * multiplier), unit = 110 / (8 + store);
  const bar = (x: number, value: number, cls: string, label: string, text: string) => {
    const h = Math.round(value * unit);
    return `<g class="hb-bar ${cls}"><rect x="${x}" y="${150 - h}" width="64" height="${h}" rx="1"/><text class="hb-bar-value" x="${x + 32}" y="${141 - h}" text-anchor="middle">${text}</text><text class="hb-bar-label" x="${x + 32}" y="172" text-anchor="middle">${label}</text></g>`;
  };
  return svg("0 0 560 190", `Buffer stores a transmission at ${multiplier} times its damage and releases it later.`, [
    `<line class="hb-axis" x1="20" y1="150" x2="540" y2="150"/>`,
    bar(40, 8, "muted", "Normal", "8"),
    bar(140, 0, "muted", "Buffered turn", "0 now"),
    bar(220, store, "cyan", `Stored ×${multiplier}`, `+${store}`),
    bar(340, 8, "gold", "Next turn", "8"),
    bar(420, 8 + store, "gold strong", "+ Release", String(8 + store)),
    tag(290, 18, "Packet loss: start a turn with no live route and the buffer is gone", "danger"),
  ].join(""));
}

/** A miniature route chart with room types, drawn with the real map's room icons. */
export function mapDiagram(): string {
  const room = (x: number, y: number, cls: string, icon: string) =>
    `<g class="hb-room ${cls}" transform="translate(${x} ${y})"><circle r="${cls === "boss" ? 21 : 16}"/>${glyph(icon, cls === "boss" ? 24 : 18)}</g>`;
  const path = (a: [number, number], b: [number, number], lit = false) =>
    `<path class="hb-route ${lit ? "lit" : ""}" d="M${a[0]} ${a[1]} C ${a[0]} ${a[1] - 22}, ${b[0]} ${b[1] + 22}, ${b[0]} ${b[1]}"/>`;
  const rows: [number, number, string, string][] = [
    [120, 250, "battle", "sword"], [280, 250, "battle", "sword"], [440, 250, "battle", "sword"],
    [120, 190, "event", "unknown"], [280, 190, "elite", "elite"], [440, 190, "battle", "sword"],
    [120, 130, "forge", "forge"], [280, 130, "battle", "sword"], [440, 130, "shop", "stall"],
    [280, 55, "boss", "boss"],
  ];
  return svg("0 0 560 290", "A route chart: battles, elites, events, sanctuaries, markets and a guardian.", [
    path([120, 250], [120, 190], true), path([120, 190], [120, 130], true), path([120, 130], [280, 55]),
    path([280, 250], [280, 190]), path([280, 250], [120, 190]), path([280, 190], [280, 130]), path([280, 130], [280, 55]),
    path([440, 250], [440, 190]), path([440, 190], [440, 130]), path([440, 190], [280, 130]), path([440, 130], [280, 55]),
    ...rows.map(([x, y, cls, icon]) => room(x, y, cls, icon)),
    tag(280, 20, "Guardian", "gold"),
    tag(40, 284, "Your path", "cyan", "start"),
  ].join(""));
}

/** The turn loop as a ring of five steps. */
export function loopDiagram(): string {
  const steps = [
    ["Draw", `${R.handDraw} cards · ${R.baseEnergy} energy`], ["Read", "the hostile's intent"], ["Build", "devices & cables"],
    ["Defend", "cover the forecast"], ["Transmit", "then the hostile acts"],
  ];
  const cx = 280, cy = 146, r = 88;
  return svg("0 0 560 282", "The turn: draw, read the intent, build, defend, transmit.", [
    `<circle class="hb-ring" cx="${cx}" cy="${cy}" r="${r}"/>`,
    ...steps.map(([name, note], i) => {
      const angle = -Math.PI / 2 + (i / steps.length) * Math.PI * 2;
      const cos = Math.cos(angle), x = cx + cos * r, y = cy + Math.sin(angle) * r;
      // Side steps read away from their marker; top and bottom steps sit clear above or below it.
      const side = Math.abs(cos) > 0.4;
      const anchor = side ? (cos > 0 ? "start" : "end") : "middle";
      const lx = side ? x + Math.sign(cos) * 26 : x, ly = side ? y - 2 : cy + Math.sin(angle) * (r + 46);
      return `<g class="hb-step"><path d="M${x.toFixed(1)} ${(y - 17).toFixed(1)} l17 17 -17 17 -17 -17Z"/><text class="hb-step-number" x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle">${i + 1}</text><text class="hb-step-name" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${name}</text><text class="hb-step-note" x="${lx.toFixed(1)}" y="${(ly + 16).toFixed(1)}" text-anchor="${anchor}">${note}</text></g>`;
    }),
    `<text class="hb-ring-core" x="${cx}" y="${cy - 4}" text-anchor="middle">One</text><text class="hb-ring-core" x="${cx}" y="${cy + 15}" text-anchor="middle">Turn</text>`,
  ].join(""));
}

// ---------------------------------------------------------------- v4 · Under Quarantine

/** A small engraved diamond pip, filled (intact) or hollow (spent). */
function pips(x: number, y: number, filled: number, total: number, cls = "") {
  return Array.from({ length: total }, (_, i) =>
    `<path class="hb-pip ${i < filled ? "on" : "off"} ${cls}" d="M${x + i * 11} ${y - 4.5} l4.5 4.5 -4.5 4.5 -4.5 -4.5Z"/>`).join("");
}
/** A hostile's plate on the far rail, drawn as the port strip reads it. */
function port(y: number, name: string, role: string, amount: string, cls = "") {
  return `<g class="hb-port ${cls}" transform="translate(500 ${y})"><rect x="-72" y="-25" width="144" height="50" rx="2"/>` +
    `<text class="hb-port-name" x="-60" y="-4">${name}</text><text class="hb-port-role" x="-60" y="14">${role}</text>` +
    `<text class="hb-port-amount" x="60" y="8" text-anchor="end">${amount}</text></g>`;
}
/** A delivery's packet glyph: the gold hexagon for the primary, a cyan diamond for bandwidth. */
function packet(x: number, y: number, primary: boolean, amount: number) {
  const shape = primary ? '<path d="M-9 0-4.5-7.8h9L9 0l-4.5 7.8h-9Z"/>' : '<path d="M0-8 8 0 0 8-8 0Z"/>';
  return `<g class="hb-packet ${primary ? "primary" : "channel"}" transform="translate(${x} ${y})">${shape}<text y="24" text-anchor="middle">${amount}</text></g>`;
}

/** Packs & Ports: three channels become three deliveries; two merge on the focus. */
export function portsDiagram(): string {
  const primary = R.baseRouteDamage + R.switchDamage, band = R.bandwidthPerChannel;
  const flight = (d: string, kind: "primary" | "channel") => `<path class="hb-flight ${kind}" d="${d}"/>`;
  return svg("0 0 600 300", `Three channels deliver to the ports. The primary delivery and one bandwidth delivery merge at the centre into one packet of ${primary + band}; the third delivery is aimed at the left escort.`, [
    wire(58, 150, 130, 72, "primary"), wire(130, 72, 212, 72, "primary"), wire(212, 72, 290, 150, "primary"),
    wire(58, 150, 175, 150, "channel"), wire(175, 150, 290, 150, "channel"),
    wire(58, 150, 175, 228, "channel"), wire(175, 228, 290, 150, "channel"),
    terminal(40, 150, "Alpha", true), terminal(304, 150, "Omega", true),
    device(130, 72, "router", "primary"), device(212, 72, "switch", "primary"),
    device(175, 150, "router", "channel"), device(175, 228, "router", "channel"),
    flight("M322 142 C 350 100, 380 52, 426 52", "channel"), flight("M322 150 H 426", "primary"), flight("M322 158 C 350 200, 400 200, 426 166", "channel"),
    packet(367, 81, false, band), packet(376, 150, true, primary), packet(375, 190, false, band),
    port(52, "Left", "Escort · aimed", String(band)),
    port(150, "Centre", "Leader · focus", `${primary} + ${band}`, "focus"),
    port(248, "Right", "Escort · dormant", "—", "dormant"),
    `<path class="hb-crest" d="M500 115 l6 6 -6 6 -6 -6Z"/>`,
    tag(170, 22, `Primary delivery · ${R.baseRouteDamage} + ${R.switchDamage} switch`, "gold"),
    tag(170, 292, `Each further channel · +${band} bandwidth`, "cyan"),
    tag(500, 292, `One packet of ${primary + band} · armor paid once`, "gold"),
  ].join(""));
}

const INSTALL_GLYPHS: Record<"tap" | "jammer" | "spike" | "anchor" | "breaker", string> = {
  tap: '<path d="M0-8 6 2a6 6 0 0 1-12 0Z"/>',
  jammer: '<path d="M0 8V-3"/><path d="M-5-5a7 7 0 0 1 10 0M-8-9a11 11 0 0 1 16 0"/>',
  spike: '<path d="M-6-8h12L0 9Z"/><path d="M-3-3h6"/>',
  anchor: '<circle cy="-6" r="2.4"/><path d="M0-3.6V8M-4-1h8M-7 3a7 6 0 0 0 14 0"/>',
  breaker: '<circle r="7"/>',
};
/** A hostile installation seen from above: its magenta base, its glyph, its integrity pips. */
function installation(x: number, y: number, kind: keyof typeof INSTALL_GLYPHS, integrity: number, label: string, countdown?: number) {
  const numeral = countdown === undefined ? "" : `<text class="hb-countdown" y="5" text-anchor="middle">${countdown}</text>`;
  return `<g class="hb-install ${kind}" transform="translate(${x} ${y})"><path class="hb-install-base" d="M-8-14h16l6 6v16l-6 6h-16l-6-6v-16Z"/>${INSTALL_GLYPHS[kind]}${numeral}` +
    `<text class="hb-install-name" y="-22" text-anchor="middle">${label}</text></g>${pips(x - (integrity - 1) * 5.5, y + 25, integrity, integrity, "install")}`;
}

/** The Table Front: a Spike and a Jammer with their reach rings, a worn router, a firewall's
 * quarantine ring and a Breaker Charge counting down beside an injector. Scale: 1 unit = 32 px. */
export function installationDiagram(): string {
  const reach = R.reach * 32;
  const ring = (x: number, y: number, cls: string) => `<circle class="hb-reach ${cls}" cx="${x}" cy="${y}" r="${reach}"/>`;
  return svg("0 0 600 322", `The table front. Every reach effect uses one radius of ${R.reach.toFixed(1)} units. A Spike wears the router beside it, a Jammer jams the switch, a firewall's quarantine reaches the Jammer, and a Breaker Charge counts down beside an injector.`, [
    ring(170, 102, "install"), ring(362, 106, "install"), ring(410, 150, "quarantine"), ring(250, 238, "charge"),
    wire(58, 150, 196, 150, "primary"), wire(196, 150, 318, 150, "primary"), wire(318, 150, 410, 150, "primary"), wire(410, 150, 542, 150, "primary"),
    wire(318, 150, 300, 252, "idle"),
    terminal(40, 150, "Alpha", true), terminal(560, 150, "Omega", true),
    device(196, 150, "router", "worn", "Router"), pips(191, 196, 1, 2, "device"),
    device(318, 150, "switch", "danger", "Jammed"), device(410, 150, "firewall", "online", "Firewall"),
    device(300, 252, "power", "danger"),
    installation(170, 102, "spike", 2, "Spike"), installation(362, 106, "jammer", 2, "Jammer"),
    installation(250, 238, "breaker", 1, "Charge", R.breakerCountdown),
    `<path class="hb-measure" d="M378 106 H ${362 + reach}"/>`, tag(362 + reach / 2 + 8, 98, R.reach.toFixed(1), "install"),
    tag(40, 24, `Spike · wears the router 1 each action`, "install", "start"),
    tag(40, 44, `Worn router · repair ${R.repairCost} energy`, "fray", "start"),
    tag(560, 24, `Jammer · jams the nearest device`, "install", "end"),
    tag(560, 44, `Firewall quarantine · −${R.quarantineDamage} each phase`, "gold", "end"),
    tag(300, 318, `Charge · ${R.breakerCountdown} actions, then everything in its ring breaks`, "danger"),
  ].join(""));
}

/** Escalation: the three-pip gauge over a leader's own actions, both cadences. */
export function escalationDiagram(): string {
  const cadences = [
    { name: "Stages I–II", start: R.escalationStart, every: R.escalationEvery, y: 96 },
    { name: "Stage III", start: R.escalationStartLate, every: R.escalationEveryLate, y: 176 },
  ];
  const span = Math.max(...cadences.map(c => c.start + 2 * c.every));
  const x0 = 170, x1 = 570, step = (x1 - x0) / (span - 1), at = (action: number) => x0 + (action - 1) * step;
  const rows = cadences.map(({ name, start, every, y }) => {
    const levelAt = (action: number) => action < start ? 0 : Math.min(3, 1 + Math.floor((action - start) / every));
    const segments = Array.from({ length: span - 1 }, (_, i) =>
      `<line class="hb-level l${levelAt(i + 1)}" x1="${at(i + 1)}" y1="${y}" x2="${at(i + 2)}" y2="${y}"/>`).join("");
    const ticks = Array.from({ length: span }, (_, i) => {
      const action = i + 1, level = levelAt(action), rises = level > levelAt(action - 1);
      return rises
        ? `<g class="hb-rise l${level}" transform="translate(${at(action)} ${y})"><path d="M0-12 12 0 0 12-12 0Z"/><text y="5" text-anchor="middle">${level}</text></g>`
        : `<circle class="hb-tick l${level}" cx="${at(action)}" cy="${y}" r="3.5"/>`;
    }).join("");
    const warn = start + every;
    return `<text class="hb-row-name" x="${x0 - 22}" y="${y + 5}" text-anchor="end">${name}</text>${segments}${ticks}` +
      `<path class="hb-warn-bracket" d="M${at(warn - 2)} ${y + 22} v6 H ${at(warn)} v-6"/>${tag((at(warn - 2) + at(warn)) / 2, y + 44, "named 2 actions ahead", "danger")}`;
  }).join("");
  const numbers = Array.from({ length: span }, (_, i) => tag(at(i + 1), 50, String(i + 1), "muted")).join("");
  return svg("0 0 600 236", `Escalation levels over a leader's own actions: from action ${R.escalationStart} every ${R.escalationEvery} in stages I and II, from action ${R.escalationStartLate} every ${R.escalationEveryLate} in stage III.`, [
    tag(x0 - 22, 50, "Its own action", "muted", "end"), numbers,
    `<g class="hb-gauge" transform="translate(40 136)"><rect x="-24" y="-44" width="48" height="88" rx="2"/>${[0, 1, 2].map(i => `<path class="hb-pip ${i < 2 ? "on" : "off"} gauge" d="M0 ${-30 + i * 26} l9 9 -9 9 -9 -9Z"/>`).join("")}</g>`,
    tag(40, 202, "Gauge", "gold"),
    rows,
  ].join(""));
}

/** Designations: a bad ribbon, a good ribbon and a hidden one on three leader plates. */
export function designationDiagram(bad: string, good: string): string {
  const plate = (x: number, name: string, ribbon: string, kind: "bad" | "good" | "unknown", note: string) => {
    const speckles = kind === "unknown"
      ? Array.from({ length: 22 }, (_, i) => `<rect class="hb-static" x="${-50 + ((i * 37) % 100)}" y="${4 + ((i * 11) % 13)}" width="${i % 3 ? 3 : 5}" height="1.4"/>`).join("")
      : "";
    return `<g class="hb-leader ${kind}" transform="translate(${x} 86)"><rect class="hb-leader-plate" x="-84" y="-44" width="168" height="88" rx="2"/>` +
      `<text class="hb-leader-name" y="-18" text-anchor="middle">${name}</text>` +
      `<path class="hb-ribbon" d="M-58 0h116l-6 11 6 11h-116l6-11Z"/>${speckles}<text class="hb-ribbon-word" y="15" text-anchor="middle">${ribbon}</text></g>` +
      tag(x, 158, note, kind === "bad" ? "danger" : kind === "good" ? "teal" : "muted");
  };
  return svg("0 0 600 176", "Three leader plates: a bad designation ribbon in coral, a good one in teal, and an unknown ribbon filled with static until the entrance line reveals it.", [
    plate(106, "Coil Serpent", bad, "bad", "Bad · coral"),
    plate(300, "Prism Widow", good, "good", "Good · teal"),
    plate(494, "Null Storm", "Unknown", "unknown", "Revealed on entry"),
  ].join(""));
}
