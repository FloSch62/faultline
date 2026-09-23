/** Inline SVG diagrams for the handbook and training walkthrough.
 * Pure strings; colours come from CSS classes in tutorial.css so the
 * diagrams follow the game's gold-on-dark palette. */

type Role = "router" | "switch" | "firewall" | "honeypot" | "cache" | "power" | "balancer";
type State = "primary" | "channel" | "online" | "offline" | "danger";

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
  return `<g class="hb-device ${role} ${state}" transform="translate(${x} ${y})">${GLYPHS[role]}${label ? `<text y="30">${label}</text>` : ""}</g>`;
}
function terminal(x: number, y: number, label: string) {
  return `<g class="hb-terminal" transform="translate(${x} ${y})"><rect x="-30" y="-15" width="60" height="30" rx="4"/><text y="4">${label}</text></g>`;
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
  return svg("0 0 560 230", "Two channels from ALPHA to OMEGA. The primary route passes a router and a switch; a second channel passes another router.", [
    wire(70, 115, 205, 55, "primary"), wire(205, 55, 345, 55, "primary"), wire(345, 55, 490, 115, "primary"),
    wire(70, 115, 280, 180, "channel"), wire(280, 180, 490, 115, "channel"),
    terminal(40, 115, "ALPHA"), terminal(520, 115, "OMEGA"),
    device(205, 55, "router", "primary", "ROUTER"), device(345, 55, "switch", "primary", "SWITCH"),
    device(280, 180, "router", "channel", "ROUTER"),
    tag(275, 20, "PRIMARY ROUTE · 5 + 1 SWITCH", "gold"),
    tag(280, 225, "CHANNEL 2 · +2 BANDWIDTH", "cyan"),
  ].join(""));
}

/** Two paths that share a device are one channel: a bottleneck. */
export function bottleneckDiagram(): string {
  return svg("0 0 560 200", "Two paths share one switch, so they count as a single channel.", [
    wire(70, 100, 190, 45, "primary"), wire(190, 45, 330, 100, "primary"),
    wire(70, 100, 190, 155, "idle"), wire(190, 155, 330, 100, "idle"),
    wire(330, 100, 490, 100, "primary"),
    terminal(40, 100, "ALPHA"), terminal(520, 100, "OMEGA"),
    device(190, 45, "router", "primary"), device(190, 155, "router", "online"),
    `<circle class="hb-warning-ring" cx="330" cy="100" r="24"/>`,
    device(330, 100, "switch", "danger", "SHARED"),
    tag(280, 196, "ONE CHANNEL — CUT THE SWITCH AND BOTH GO DARK", "danger"),
  ].join(""));
}

/** Online vs offline hardware. */
export function onlineDiagram(): string {
  return svg("0 0 560 240", "A firewall on a live route is online. A cache server with no route through it is offline.", [
    wire(70, 80, 200, 80, "primary"), wire(200, 80, 340, 80, "primary"), wire(340, 80, 490, 80, "primary"),
    wire(70, 80, 175, 162, "dead"),
    terminal(40, 80, "ALPHA"), terminal(520, 80, "OMEGA"),
    device(200, 80, "router", "primary", "ROUTER"), device(340, 80, "firewall", "online", "ONLINE"),
    device(175, 162, "power", "offline", "DEAD END"), device(395, 162, "cache", "offline", "NO CABLE"),
    tag(340, 30, "ANY LIVE ROUTE COUNTS", "cyan"),
    tag(280, 232, "OFFLINE DEVICES DO NOTHING", "muted"),
  ].join(""));
}

/** The three bands with fields, a cluster and separated circuits. */
export function bandsDiagram(): string {
  const band = (y: number, h: number, name: string, cls: string, field: string, effect: string) =>
    `<g class="hb-band ${cls}"><rect x="10" y="${y}" width="430" height="${h}" rx="3"/><text class="hb-band-name" x="22" y="${y + 19}">${name}</text>` +
    `<line class="hb-band-rule" x1="452" y1="${y + 6}" x2="452" y2="${y + h - 6}"/><text class="hb-band-field" x="464" y="${y + h / 2 - 3}">${field}</text><text class="hb-band-note" x="464" y="${y + h / 2 + 13}">${effect}</text></g>`;
  return svg("0 0 640 318", "The table has three bands: North, Center and South, each with a field.", [
    band(10, 82, "NORTH", "suppressed", "SUPPRESSION", "−3 to routes crossing"),
    band(96, 90, "CENTER", "resonant", "RESONANCE", "+3 to routes crossing"),
    band(190, 82, "SOUTH", "corroded", "CORROSION", "+2 incoming if occupied"),
    wire(64, 141, 175, 50, "channel"), wire(175, 50, 386, 141, "channel"),
    wire(64, 141, 175, 232, "channel"), wire(175, 232, 386, 141, "channel"),
    wire(64, 141, 225, 141, "primary"), wire(225, 141, 305, 141, "primary"), wire(305, 141, 386, 141, "primary"),
    wire(225, 141, 265, 168, "idle"), wire(265, 168, 305, 141, "idle"),
    terminal(46, 141, "ALPHA"), terminal(404, 141, "OMEGA"),
    device(175, 50, "router", "channel"), device(175, 232, "router", "channel"),
    device(225, 141, "router", "primary"), device(305, 141, "switch", "primary"), device(265, 170, "balancer", "online"),
    `<g class="hb-legend"><line class="hb-wire channel" x1="14" y1="292" x2="44" y2="292"/>${tag(54, 296, "NORTH + SOUTH CHANNEL ROUTERS · SEPARATED CIRCUITS +2 SHIELD", "cyan", "start")}` +
    `<line class="hb-wire primary" x1="14" y1="311" x2="44" y2="311"/>${tag(54, 315, "3 ONLINE DEVICES IN CENTER · CLUSTER +2 DAMAGE", "gold", "start")}</g>`,
  ].join(""));
}

/** Rerouting: four small panels. */
export function rerouteDiagram(kind: "silent" | "second" | "patch" | "move"): string {
  const base = (body: string, caption: string, cls = "") => svg("0 0 260 150", caption, `${body}${tag(130, 142, caption.toUpperCase(), cls)}`, "hb-mini");
  if (kind === "silent") return base([
    wire(40, 70, 130, 70, "primary"), wire(130, 70, 220, 70, "cut"),
    terminal(28, 70, "α"), terminal(232, 70, "Ω"), device(130, 70, "router", "offline"),
  ].join(""), "One route, one cut: silence", "danger");
  if (kind === "second") return base([
    wire(40, 70, 130, 35, "primary"), wire(130, 35, 220, 70, "cut"),
    wire(40, 70, 130, 105, "channel"), wire(130, 105, 220, 70, "channel"),
    terminal(28, 70, "α"), terminal(232, 70, "Ω"), device(130, 35, "router", "offline"), device(130, 105, "router", "channel"),
  ].join(""), "A second channel keeps talking", "cyan");
  if (kind === "patch") return base([
    wire(40, 70, 130, 70, "primary"), wire(130, 70, 220, 70, "primary"),
    `<path class="hb-spark" d="M168 58 175 70 168 82"/>`,
    terminal(28, 70, "α"), terminal(232, 70, "Ω"), device(130, 70, "router", "primary"),
  ].join(""), "Hot Patch or Failover: reconnect", "gold");
  return base([
    `<rect class="hb-jam-band" x="6" y="8" width="248" height="42" rx="3"/>`,
    tag(242, 24, "JAM BAND", "danger", "end"),
    device(130, 30, "router", "offline"),
    `<path class="hb-move" d="M130 48 V 76"/>`,
    wire(40, 95, 130, 95, "primary"), wire(130, 95, 220, 95, "primary"),
    terminal(28, 95, "α"), terminal(232, 95, "Ω"), device(130, 95, "router", "primary"),
  ].join(""), "Relocate out (1 energy)", "gold");
}

/** Ghost buffer: store at ×multiplier, then release. */
export function bufferDiagram(multiplier: number): string {
  const store = Math.floor(8 * multiplier);
  const bar = (x: number, h: number, cls: string, label: string, value: string) =>
    `<g class="hb-bar ${cls}"><rect x="${x}" y="${150 - h}" width="64" height="${h}" rx="2"/><text class="hb-bar-value" x="${x + 32}" y="${142 - h}" text-anchor="middle">${value}</text><text class="hb-bar-label" x="${x + 32}" y="172" text-anchor="middle">${label}</text></g>`;
  return svg("0 0 560 190", `Buffer stores a transmission at ${multiplier} times its damage and releases it later.`, [
    `<line class="hb-axis" x1="20" y1="150" x2="540" y2="150"/>`,
    bar(40, 40, "muted", "NORMAL", "8"),
    bar(140, 0, "muted", "BUFFERED TURN", "0 now"),
    bar(220, Math.min(130, store * 4), "cyan", `STORED ×${multiplier}`, `+${store}`),
    bar(340, 32, "gold", "NEXT TURN", "8"),
    bar(420, (8 + store) * 4 > 130 ? 130 : (8 + store) * 4, "gold strong", "+ RELEASE", String(8 + store)),
    tag(290, 22, "PACKET LOSS: START A TURN WITH NO LIVE ROUTE AND THE BUFFER IS GONE", "danger"),
  ].join(""));
}

/** A miniature route chart with room types. */
export function mapDiagram(): string {
  const room = (x: number, y: number, cls: string, glyph: string) =>
    `<g class="hb-room ${cls}" transform="translate(${x} ${y})"><circle r="15"/><text y="5">${glyph}</text></g>`;
  const path = (a: [number, number], b: [number, number], lit = false) =>
    `<path class="hb-route ${lit ? "lit" : ""}" d="M${a[0]} ${a[1]} C ${a[0]} ${a[1] - 22}, ${b[0]} ${b[1] + 22}, ${b[0]} ${b[1]}"/>`;
  const rows: [number, number, string, string][] = [
    [120, 250, "battle", "⚔"], [280, 250, "battle", "⚔"], [440, 250, "battle", "⚔"],
    [120, 190, "event", "?"], [280, 190, "elite", "✦"], [440, 190, "battle", "⚔"],
    [120, 130, "forge", "☗"], [280, 130, "battle", "⚔"], [440, 130, "shop", "¢"],
    [280, 55, "boss", "♛"],
  ];
  return svg("0 0 560 290", "A route chart: battles, elites, events, sanctuaries, markets and a guardian.", [
    path([120, 250], [120, 190], true), path([120, 190], [120, 130], true), path([120, 130], [280, 55]),
    path([280, 250], [280, 190]), path([280, 250], [120, 190]), path([280, 190], [280, 130]), path([280, 130], [280, 55]),
    path([440, 250], [440, 190]), path([440, 190], [440, 130]), path([440, 190], [280, 130]), path([440, 130], [280, 55]),
    ...rows.map(([x, y, cls, glyph]) => room(x, y, cls, glyph)),
    tag(280, 22, "GUARDIAN", "gold"),
    tag(40, 283, "YOUR PATH", "cyan", "start"),
  ].join(""));
}

/** The turn loop as a ring of five steps. */
export function loopDiagram(): string {
  const steps = [
    ["DRAW", "6 cards · 5 energy"], ["READ", "the hostile's intent"], ["BUILD", "devices & cables"],
    ["DEFEND", "cover the forecast"], ["TRANSMIT", "then the hostile acts"],
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
      const lx = side ? x + Math.sign(cos) * 26 : x, ly = side ? y - 2 : cy + Math.sin(angle) * (r + 44);
      return `<g class="hb-step"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16"/><text class="hb-step-number" x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${i + 1}</text><text class="hb-step-name" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${name}</text><text class="hb-step-note" x="${lx.toFixed(1)}" y="${(ly + 14).toFixed(1)}" text-anchor="${anchor}">${note}</text></g>`;
    }),
    `<text class="hb-ring-core" x="${cx}" y="${cy - 4}" text-anchor="middle">ONE</text><text class="hb-ring-core" x="${cx}" y="${cy + 14}" text-anchor="middle">TURN</text>`,
  ].join(""));
}
