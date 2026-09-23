/** Field Training: scripted lessons built on the real combat rules.
 *
 * Everything here is pure: lesson setups use the public core API, and every goal
 * is a predicate over RunState, the pure combat forecast and the last TurnResult.
 * Progress is sticky: pass the previous progress back in and completed goals stay done.
 * No DOM, no import.meta — this module runs in node tests. */
import { ENEMIES } from "../core/enemies.ts";
import { RULES } from "../core/cards.ts";
import { beginBattle, combatPreview, createRun, signalPaths, zoneForNode, type TurnResult } from "../core/run.ts";
import type { Archetype, CardId, MapRoom, NetworkLink, NetworkNode, RelicId, RunState, Zone } from "../core/types.ts";

export type LessonId =
  | "first-signal"
  | "read-the-enemy"
  | "reroute"
  | "online"
  | "bands"
  | "traps"
  | "console-architect"
  | "console-warden"
  | "console-ghost"
  | "danger"
  | "expedition";

export interface LessonGoal {
  id: string;
  label: string;
}
export interface LessonDefinition {
  id: LessonId;
  /** Chapter number shown in the menu; the three console lessons share chapter 07. */
  chapter: number;
  title: string;
  kicker: string;
  summary: string;
  icon: string;
  minutes: number;
  kind: "battle" | "walkthrough";
  archetype?: Archetype;
  goals: LessonGoal[];
  /** Shown when the lesson is complete: why this matters in a real expedition. */
  takeaway: string;
}
export interface LessonProgress {
  id: LessonId;
  goals: (LessonGoal & { done: boolean })[];
  /** Index of the first unfinished goal, or goals.length when complete. */
  current: number;
  coach: string;
  hint: string;
  /** Short warning when the player is about to make a costly mistake. */
  warning: string;
  /** CSS selector of the on-screen control the current step needs, or "". */
  focus: string;
  complete: boolean;
}

/** Show the hint after this much inactivity (the UI owns the timer). */
export const HINT_DELAY_MS = 12_000;
export const TRAINING_STORAGE = "faultline-training-v1";

export const LESSONS: readonly LessonDefinition[] = [
  {
    id: "first-signal", chapter: 1, kind: "battle", icon: "link", minutes: 2,
    title: "The First Signal", kicker: "ROUTES",
    summary: "Build ALPHA → router → OMEGA and send your first transmission.",
    goals: [
      { id: "router", label: "Deploy a Core Router" },
      { id: "source", label: "Cable ALPHA to your router" },
      { id: "route", label: "Cable your router to OMEGA" },
      { id: "transmit", label: "Transmit the signal" },
    ],
    takeaway: "A route is ALPHA → router → OMEGA. It deals 5 every transmission, and your hardware stays on the table for the whole encounter — every device you place keeps paying off, turn after turn.",
  },
  {
    id: "read-the-enemy", chapter: 2, kind: "battle", icon: "eye", minutes: 2,
    title: "Read the Enemy", kicker: "INTENTS & SHIELD",
    summary: "Hostiles announce their next move. Cover the forecast, then strike.",
    goals: [
      { id: "cover", label: "Shield the whole incoming strike" },
      { id: "burst", label: "Add burst damage with Packet Burst" },
      { id: "safe", label: "Transmit without losing integrity" },
    ],
    takeaway: "Every enemy shows its exact next action. Spend just enough shield to cover the forecast — shield expires after the enemy acts — and put the rest of your energy into damage or into your network.",
  },
  {
    id: "reroute", chapter: 3, kind: "battle", icon: "link", minutes: 3,
    title: "When the Line Is Cut", kicker: "REROUTING & BANDWIDTH",
    summary: "A cut on your only route silences it. Build a second channel, arm a failover, patch.",
    goals: [
      { id: "channel", label: "Build a second, independent channel" },
      { id: "survive", label: "Transmit — keep a live route through the enemy's cut" },
      { id: "restore", label: "Restore full bandwidth (clear the cut or keep both channels)" },
    ],
    takeaway: "Channels are routes that share no device. Each extra channel adds bandwidth damage and survives a cut on the other. When a line does fall: Hot Patch reconnects it, a Failover Policy cancels the cut in advance, and relocating a device (1 energy) can reroute around a jam.",
  },
  {
    id: "online", chapter: 4, kind: "battle", icon: "shield", minutes: 3,
    title: "Online Devices", kicker: "THE NETWORK IS YOUR ARMY",
    summary: "Devices only work while they sit on a live route. Wire a firewall and a Cache Server in.",
    goals: [
      { id: "firewall", label: "Bring the Trust Gate firewall online" },
      { id: "transmit", label: "Transmit into the breach" },
      { id: "cache", label: "Bring a Cache Server online" },
    ],
    takeaway: "A device is online when any live route passes through it — not only your strongest one. Online firewalls block breaches and strikes, Cache Servers draw, PoE Injectors add energy and Load Balancers add damage per channel. Offline hardware does nothing, and a cut can take it offline.",
  },
  {
    id: "bands", chapter: 5, kind: "battle", icon: "field", minutes: 3,
    title: "Hold the Ground", kicker: "ZONES & FIELDS",
    summary: "North, Center and South are battlegrounds. Escape suppression, dodge a band jam, empower a band.",
    goals: [
      { id: "suppression", label: "Free your route from the suppression field" },
      { id: "jam", label: "Keep your route out of the storm's marked band" },
      { id: "resonance", label: "Empower a band your route crosses with Resonance" },
      { id: "transmit", label: "Transmit" },
    ],
    takeaway: "Where you build matters. Hostile fields and band attacks punish crowded ground; clusters of 3 online devices in one band add damage, while channels with routers in North and South earn separated-circuit shield. Purge cleanses a band; moving a device (1 energy) escapes one.",
  },
  {
    id: "traps", chapter: 6, kind: "battle", icon: "eye", minutes: 2,
    title: "Traps & Decoys", kicker: "PROTOCOLS & HONEYPOTS",
    summary: "Set answers before the attack lands. A honeypot draws jams; a protocol fires on its own.",
    goals: [
      { id: "honeypot", label: "Deploy a Honeypot and cable it" },
      { id: "armed", label: "Arm a protocol" },
      { id: "sprung", label: "Transmit and spring the trap" },
    ],
    takeaway: "Protocols are armed face-down and trigger by themselves during the enemy's turn, then return to your discard. Because intents are visible, you can arm the exact answer a turn early. A cabled honeypot pulls jams and cuts away from your real hardware and hurts the attacker.",
  },
  {
    id: "console-architect", chapter: 7, kind: "battle", archetype: "architect", icon: "link", minutes: 2,
    title: "The Architect's Console", kicker: "PATCH CABLE · BANDWIDTH",
    summary: "Once per turn, run a cable without a card. Width is your weapon.",
    goals: [
      { id: "patch", label: "Use Patch Cable to finish your route" },
      { id: "channels", label: "Build a second channel" },
      { id: "transmit", label: "Transmit with bandwidth" },
    ],
    takeaway: "The Architect wins wide: cheap cables (Hot Swap and Patch Cable) turn every router into another channel, and every channel adds bandwidth. Load Balancers and clusters scale it further. The risk: more cables for the enemy to cut.",
  },
  {
    id: "console-warden", chapter: 7, kind: "battle", archetype: "warden", icon: "shield", minutes: 2,
    title: "The Warden's Console", kicker: "HARDEN · BACKPRESSURE",
    summary: "Shield becomes a weapon: every point you prevent returns in your next transmission.",
    goals: [
      { id: "harden", label: "Use Harden" },
      { id: "stored", label: "Transmit and store backpressure" },
      { id: "release", label: "Release it with your next transmission" },
    ],
    takeaway: "The Warden turns defense into offense. Harden and online firewalls prevent damage; Backpressure stores whatever you prevented and adds it to your next transmission. The risk: it only charges when the enemy actually attacks.",
  },
  {
    id: "console-ghost", chapter: 7, kind: "battle", archetype: "ghost", icon: "bolt", minutes: 3,
    title: "The Ghost's Console", kicker: "BUFFER · PACKET LOSS",
    summary: `Hold a transmission ×${RULES.bufferMultiplier}, then flush it all at once — if the line survives.`,
    goals: [
      { id: "buffer", label: "Switch on Buffer" },
      { id: "stored", label: "Transmit into the buffer" },
      { id: "protect", label: "Protect the line, then buffer again" },
      { id: "release", label: "Flush everything in one transmission" },
    ],
    takeaway: "The Ghost trades tempo for a decisive strike: a buffered turn deals nothing now and more later. If a turn starts with no live route, the whole buffer is lost — so buffer when the enemy isn't about to cut you, or when you have a second channel or a Failover Policy.",
  },
  {
    id: "danger", chapter: 8, kind: "battle", icon: "boss", minutes: 4,
    title: "Danger & Guardians", kicker: "ULTIMATES · MALWARE · JUNK",
    summary: "A guardian is charging. Clean up, prepare an answer, then interrupt or brace.",
    goals: [
      { id: "scrub", label: "Scrub the malware (1 energy)" },
      { id: "worm", label: "Delete the Worm before you transmit" },
      { id: "prepare", label: "Prepare a burst card for next turn (P)" },
      { id: "charge", label: "Transmit through the charge turn" },
      { id: "ultimate", label: "Interrupt the ultimate — or brace and take no damage" },
    ],
    takeaway: "Guardians telegraph their ultimate a full turn ahead. Clear what drags your damage down, hold your best burst in the Prepare slot, then either hit the interrupt threshold (it also exposes the guardian) or shield the whole blow. If the forecast says CANCELLED, your transmission kills first and nothing lands.",
  },
  {
    id: "expedition", chapter: 9, kind: "walkthrough", icon: "map", minutes: 3,
    title: "The Expedition", kicker: "MAP · MARKET · RELICS",
    summary: "Routes, rooms, credits, events, upgrades, relics and ascension.",
    goals: [{ id: "read", label: "Read the expedition guide" }],
    takeaway: "Every room is a trade: risk for power, credits for cards, integrity for relics. Plan a route on the chart that feeds the deck you are building.",
  },
];

export function lessonById(id: string): LessonDefinition | undefined {
  return LESSONS.find(lesson => lesson.id === id);
}
/** The lesson after this one in menu order, skipping sibling console lessons. */
export function nextLesson(id: LessonId): LessonDefinition | undefined {
  const lesson = lessonById(id);
  if (!lesson) return undefined;
  return LESSONS.find(other => other.chapter > lesson.chapter);
}

// ---------------------------------------------------------------------------
// Board building

function device(id: string, role: NetworkNode["role"], x: number, z: number, extra: Partial<NetworkNode> = {}): NetworkNode {
  return { id, role, x, z, ...extra };
}
function terminals(): NetworkNode[] {
  return [
    { id: "alpha", role: "client", x: -5.3, z: 0, fixed: true },
    { id: "omega", role: "client", x: 5.3, z: 0, fixed: true },
  ];
}
function cable(a: string, b: string, extra: Partial<NetworkLink> = {}): NetworkLink {
  return { a, b, ...extra };
}

/** Find an enemy whose repeating pattern contains `kinds` in order; returns the
 * enemy id and the pattern index of the first kind. Robust to pattern rework. */
export function findIntentSequence(
  kinds: string[],
  candidates: string[],
  accept: (step: { kind: string; field?: string; junk?: unknown; ultimate?: boolean }) => boolean = () => true,
  acceptEnemy: (id: string) => boolean = () => true,
): { id: string; turn: number } {
  const pool = [...candidates, ...Object.keys(ENEMIES).filter(id => !candidates.includes(id) && !ENEMIES[id].boss)];
  for (const id of pool) {
    if (!acceptEnemy(id)) continue;
    const pattern = ENEMIES[id]?.pattern as unknown as { kind: string; field?: string; junk?: unknown; ultimate?: boolean }[] | undefined;
    if (!pattern) continue;
    // Stay in the first cycle: no pressure bonus, predictable numbers.
    for (let turn = 0; turn < pattern.length; turn++) {
      const fits = kinds.every((kind, offset) => {
        const step = pattern[(turn + offset) % pattern.length];
        return step.kind === kind && (offset > 0 || accept(step));
      });
      if (fits) return { id, turn };
    }
  }
  throw new Error(`No enemy pattern contains ${kinds.join(" → ")}`);
}

interface LessonSetup {
  archetype?: Archetype;
  relics?: RelicId[];
  enemy: { id: string; turn: number; hp: number; name?: string; title?: string };
  nodes: NetworkNode[];
  links: NetworkLink[];
  hand: CardId[];
  draw: CardId[];
  integrity?: number;
  energy?: number;
  fields?: RunState["zoneEffects"];
  malware?: RunState["malware"];
  nextNodeId: number;
}

function buildRun(setup: LessonSetup): RunState {
  const run = createRun(0x5eed_7a11);
  const archetype = setup.archetype ?? "architect";
  run.archetype = archetype;
  run.ascension = 0;
  run.relics = setup.relics ?? [];
  run.stage = 0;
  run.deck = [...setup.hand, ...setup.draw];
  const room: MapRoom = { id: "training", floor: 0, lane: 1, type: "battle", cleared: false, enemyId: setup.enemy.id, exits: [] };
  run.map = [room];
  run.currentRoom = room.id;
  run.phase = "map";
  beginBattle(run, room);
  const template = ENEMIES[setup.enemy.id];
  run.enemy = {
    id: template.id,
    name: setup.enemy.name ?? template.name,
    title: setup.enemy.title ?? template.title,
    color: template.color,
    hp: setup.enemy.hp,
    maxHp: setup.enemy.hp,
    turn: setup.enemy.turn,
  };
  run.bossIntroSeen = true;
  run.integrity = run.maxIntegrity = setup.integrity ?? 20;
  run.energy = setup.energy ?? 5;
  // Training boards are hand-arranged: no random terrain, salvage or leftovers.
  run.topology = { nodes: [...terminals(), ...setup.nodes], links: setup.links };
  run.nextNodeId = setup.nextNodeId;
  run.terrain = null;
  run.malware = setup.malware ?? [];
  run.zoneEffects = setup.fields ?? [];
  run.faultNode = null;
  run.faultLink = null;
  run.hand = [...setup.hand];
  run.drawPile = [...setup.draw];
  run.discardPile = [];
  run.exhaustPile = [];
  run.preparedCard = null;
  run.protocols = [];
  run.consoleUses = 0;
  run.buffer = 0;
  run.buffering = false;
  run.backpressure = 0;
  run.block = 0;
  run.packetBoost = 0;
  run.reserveEnergy = 0;
  run.cardsPlayed = 0;
  run.firstFiberPlayed = false;
  run.shieldArrayUsed = false;
  run.shop = null;
  run.event = null;
  run.credits = 0;
  run.log = ["Field training · a practice signal. Your expedition is safe."];
  return run;
}

const TRAINING_TITLE = "A harmless memory of the first signal";

export function createLessonRun(id: LessonId): RunState {
  switch (id) {
    case "first-signal": {
      const enemy = findIntentSequence(["strike"], ["leech", "storm", "wraith"]);
      return buildRun({
        enemy: { ...enemy, hp: 30, name: "TRAINING ECHO", title: TRAINING_TITLE },
        nodes: [], links: [],
        hand: ["router", "fiber", "fiber", "guard"],
        draw: ["router", "fiber", "fiber", "guard", "pulse", "patch"],
        nextNodeId: 1,
      });
    }
    case "read-the-enemy": {
      const enemy = findIntentSequence(["strike"], ["wraith", "marshal", "sentinel", "leech"]);
      return buildRun({
        enemy: { ...enemy, hp: 40, name: "TRAINING ECHO", title: TRAINING_TITLE },
        nodes: [device("router1", "router", 0, 0)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["guard", "guard", "pulse", "patch", "fiber"],
        draw: ["guard", "pulse", "guard", "fiber", "patch", "pulse"],
        integrity: 14,
        nextNodeId: 2,
      });
    }
    case "reroute": {
      const enemy = findIntentSequence(["sever"], ["widow", "storm", "leech", "sentinel"], step => !step.field && !step.junk,
        enemyId => enemyId !== "wraith");
      return buildRun({
        enemy: { ...enemy, hp: 45, name: "TRAINING ECHO", title: "A memory of the night the lines were cut" },
        nodes: [device("router1", "router", 0, -2.6)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["router", "fiber", "fiber", "failover-policy", "guard"],
        draw: ["patch", "fiber", "guard", "pulse", "switch", "fiber"],
        nextNodeId: 2,
      });
    }
    case "online": {
      const enemy = findIntentSequence(["breach"], ["sentinel", "leech", "marshal", "prophet"], step => !step.field && !step.junk);
      return buildRun({
        enemy: { ...enemy, hp: 45, name: ENEMIES[enemy.id].name, title: "A drill at the trust boundary" },
        nodes: [device("router1", "router", 0, -2.6), device("firewall2", "firewall", 0, 2.6)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["fiber", "fiber", "guard", "pulse"],
        draw: ["cache-server", "fiber", "fiber", "patch", "guard", "poe-injector"],
        nextNodeId: 3,
      });
    }
    case "bands": {
      return buildRun({
        // Null Storm's first jam marks NORTH (bands cycle North → Center → South).
        enemy: { id: "storm", turn: 0, hp: 45, name: "NULL STORM", title: "A drill in the marked bands" },
        nodes: [device("router1", "router", 0, -2.6)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["purge-field", "resonance-field", "guard", "fiber", "router"],
        draw: ["guard", "fiber", "pulse", "router", "fiber", "patch"],
        fields: [{ zone: "north", kind: "suppression", turns: 2 }],
        nextNodeId: 2,
      });
    }
    case "traps": {
      // Band jams (Storm, Moth) ignore devices outside their band; use a hunter that picks targets.
      const enemy = findIntentSequence(["jam"], ["wraith", "marshal", "leech", "sentinel"],
        step => !step.field && !step.junk, enemyId => !ENEMIES[enemyId].jamBands);
      return buildRun({
        enemy: { ...enemy, hp: 45, name: "TRAINING ECHO", title: "It always reaches for the same hardware" },
        nodes: [device("router1", "router", 0, 0)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["honeypot", "fiber", "port-security", "rate-limiter", "guard"],
        draw: ["guard", "fiber", "failover-policy", "pulse", "fiber", "patch"],
        nextNodeId: 2,
      });
    }
    case "console-architect": {
      const enemy = findIntentSequence(["strike"], ["leech", "storm", "wraith"]);
      return buildRun({
        archetype: "architect", relics: ["hot-swap"],
        enemy: { ...enemy, hp: 45, name: "TRAINING ECHO", title: TRAINING_TITLE },
        nodes: [device("router1", "router", 0, -2.6)],
        links: [cable("alpha", "router1")],
        hand: ["router", "fiber", "fiber", "guard"],
        draw: ["fiber", "guard", "load-balancer", "fiber", "pulse", "router"],
        nextNodeId: 2,
      });
    }
    case "console-warden": {
      const enemy = findIntentSequence(["strike"], ["wraith", "marshal", "leech", "storm"], step => !step.field && !step.junk);
      return buildRun({
        archetype: "warden", relics: ["backpressure"],
        enemy: { ...enemy, hp: 45, name: "TRAINING ECHO", title: "It tests every wall it meets" },
        nodes: [device("router1", "router", -1.5, 0), device("firewall2", "firewall", 1.8, 0)],
        links: [cable("alpha", "router1"), cable("router1", "firewall2"), cable("firewall2", "omega")],
        hand: ["guard", "pulse", "fiber", "patch"],
        draw: ["guard", "pulse", "guard", "fiber", "patch", "pulse"],
        integrity: 16,
        nextNodeId: 3,
      });
    }
    case "console-ghost": {
      const enemy = findIntentSequence(["strike", "sever"], ["storm", "leech", "sentinel", "widow"], () => true,
        enemyId => enemyId !== "wraith");
      return buildRun({
        archetype: "ghost", relics: ["deep-cache"],
        enemy: { ...enemy, hp: 50, name: "TRAINING ECHO", title: "It listens for a silent line" },
        nodes: [device("router1", "router", 0, 0)],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        hand: ["guard", "store-forward", "pulse", "fiber"],
        draw: ["failover-policy", "router", "fiber", "fiber", "guard", "patch", "pulse", "guard"],
        nextNodeId: 2,
      });
    }
    case "danger": {
      const pattern = ENEMIES.regent.pattern;
      const turn = pattern.findIndex(step => step.kind === "charge");
      return buildRun({
        enemy: { id: "regent", turn: Math.max(0, turn), hp: 60, name: "THE IRON REGENT", title: "A drill — the crown is rising" },
        nodes: [device("router1", "router", -0.5, -2.6), device("router2", "router", -0.5, 2.6)],
        links: [cable("alpha", "router1"), cable("router1", "omega"), cable("alpha", "router2"), cable("router2", "omega")],
        malware: [{ id: "malware1", x: 2.6, z: 0 }],
        hand: ["worm", "zero-day", "guard", "pulse", "patch"],
        draw: ["pulse", "barrier", "guard", "patch", "fiber", "guard"],
        integrity: 20,
        nextNodeId: 3,
      });
    }
    case "expedition":
      throw new Error("The expedition lesson is a walkthrough, not a battle.");
  }
}

// ---------------------------------------------------------------------------
// Progress

type Preview = ReturnType<typeof combatPreview>;
interface Context {
  run: RunState;
  preview: Preview | null;
  last?: TurnResult;
}
const roleOf = (run: RunState, id: string) => run.topology.nodes.find(node => node.id === id)?.role;
const hasRole = (run: RunState, role: NetworkNode["role"]) => run.topology.nodes.some(node => node.role === role);
const online = (ctx: Context) => ctx.preview?.online ?? [];
const channels = (ctx: Context) => ctx.preview?.channels ?? (ctx.preview?.signalPath.length ? 1 : 0);
const routeLive = (run: RunState) => signalPaths(run).length > 0;
const linked = (run: RunState, a: string, predicate: (id: string) => boolean) =>
  run.topology.links.some(link => (link.a === a && predicate(link.b)) || (link.b === a && predicate(link.a)));
const inHand = (run: RunState, base: string) => run.hand.some(card => card === base || card === `${base}+`);
const termLabel = (preview: Preview | null, text: string) =>
  preview?.damageTerms.some(term => term.label.toLowerCase().includes(text.toLowerCase())) ?? false;
const transmitted = (run: RunState, times = 1) => run.turn > times;

function goalChecks(id: LessonId, ctx: Context): Record<string, boolean> {
  const { run, preview, last } = ctx;
  switch (id) {
    case "first-signal":
      return {
        router: hasRole(run, "router"),
        source: linked(run, "alpha", other => roleOf(run, other) === "router"),
        route: routeLive(run),
        transmit: transmitted(run) && (!!last?.packetDamage || (run.enemy ? run.enemy.hp < run.enemy.maxHp : true)),
      };
    case "read-the-enemy":
      return {
        cover: !!preview && !preview.lethal && preview.incomingRaw > 0 && preview.incoming === 0,
        burst: run.packetBoost > 0 || (!!last && last.packetDamage > 5),
        safe: transmitted(run) && !!last && last.integrityDamage === 0 && last.packetDamage > 0,
      };
    case "reroute":
      return {
        channel: channels(ctx) >= 2,
        survive: transmitted(run) && routeLive(run),
        restore: transmitted(run) && routeLive(run) && !run.faultLink && !run.faultNode && channels(ctx) >= 2,
      };
    case "online": {
      const firewall = run.topology.nodes.find(node => node.role === "firewall");
      return {
        firewall: !!firewall && online(ctx).includes(firewall.id),
        transmit: transmitted(run),
        cache: run.topology.nodes.some(node => node.role === "cache" && online(ctx).includes(node.id)),
      };
    }
    case "bands": {
      const intent = preview?.intent;
      const marked = preview?.hazardZone ?? null;
      const routeOutOfBand = !!preview?.signalPath.length && !preview.signalPath.some(nodeId => {
        const node = run.topology.nodes.find(n => n.id === nodeId);
        return !!node && !node.fixed && !node.shielded && marked !== null && zoneForNode(node) === marked;
      });
      return {
        suppression: !!preview?.signalPath.length && !termLabel(preview, "suppression"),
        jam: (intent?.kind === "jam" && (routeOutOfBand || channels(ctx) >= 2)) || (transmitted(run) && routeLive(run)),
        resonance: termLabel(preview, "resonance"),
        transmit: transmitted(run),
      };
    }
    case "traps": {
      const honeypot = run.topology.nodes.find(node => node.role === "honeypot");
      return {
        honeypot: !!honeypot && run.topology.links.some(link => link.a === honeypot.id || link.b === honeypot.id),
        armed: run.protocols.length > 0,
        sprung: transmitted(run) && !!last && ((last.enemyDamage ?? 0) > 0 || (last.protocolsTriggered?.length ?? 0) > 0),
      };
    }
    case "console-architect":
      return {
        patch: run.consoleUses > 0 && routeLive(run),
        channels: channels(ctx) >= 2,
        transmit: transmitted(run) && !!last && last.packetDamage >= 7,
      };
    case "console-warden":
      return {
        harden: run.consoleUses > 0,
        stored: run.backpressure > 0,
        release: transmitted(run, 2) && !!last && last.packetDamage > 5,
      };
    case "console-ghost":
      return {
        buffer: run.buffering || run.buffer > 0,
        stored: run.buffer > 0,
        protect: transmitted(run) && run.buffering && run.buffer > 0 && !!preview && !preview.bufferAtRisk,
        release: !!last && (last.bufferReleased ?? 0) > 0,
      };
    case "danger":
      return {
        scrub: run.malware.length === 0,
        worm: !inHand(run, "worm"),
        prepare: !!run.preparedCard && ["zero-day", "pulse"].some(card => run.preparedCard === card || run.preparedCard === `${card}+`),
        charge: transmitted(run),
        ultimate: transmitted(run, 2) && !!last && (last.interrupted || last.integrityDamage === 0),
      };
    case "expedition":
      return { read: false };
  }
}

interface Coach {
  coach: string;
  hint: string;
  warning?: string;
  /** CSS selector of the control this step is about; the UI spotlights it. */
  focus?: string;
}

function coachFor(id: LessonId, ctx: Context, done: Record<string, boolean>): Coach {
  const { run, preview } = ctx;
  const intent = preview?.intent;
  const incoming = preview?.incoming ?? 0;
  const damage = preview?.packetDamage ?? 0;
  const noEnergy = run.energy <= 0;
  switch (id) {
    case "first-signal":
      if (!done.router) return {
        coach: "Every signal needs a router. Play Core Router (2 energy) and place it on the table — the centre sits close to both terminals.",
        hint: "Click the Core Router card, then click an empty spot on the table or use “Deploy in a free socket”.",
      };
      if (!done.source) return {
        coach: "Your router is dark. Play an Optic Fiber: select ALPHA, then your router. Cables are undirected and stay for the encounter.",
        hint: "Select Optic Fiber, then click ALPHA and your router — on the table or in the device strip below.",
      };
      if (!done.route) return {
        coach: "One cable to go. Run the second Optic Fiber from your router to OMEGA and the route comes alive.",
        hint: "Select the other Optic Fiber, then your router, then OMEGA.",
      };
      if (!done.transmit) return {
        coach: `The route is live. The number on Transmit is your damage: ${damage}. Transmitting ends your turn — then the hostile acts, exactly as its intent announced.`,
        hint: "Press Transmit or the Space bar.",
        focus: ".transmit-button",
      };
      return { coach: "Signal delivered. Your router and cables stay: next turn the same route fires again for free.", hint: "" };
    case "read-the-enemy":
      if (!done.cover) return {
        coach: `Read the right plate: the hostile will ${intent?.kind === "strike" ? "STRIKE" : intent?.kind?.toUpperCase() ?? "act"} for ${preview?.incomingRaw ?? 0} after your transmission. Your plate forecasts ${incoming} integrity lost. Play Packet Guard until that reads 0.`,
        hint: "Packet Guard gives 4 shield for this turn only. Watch “integrity at risk” drop as you play it.",
        warning: noEnergy && incoming > 0 ? "Out of energy with damage still coming — undo (Z) and try a different order." : undefined,
      };
      if (!done.burst) return {
        coach: "Covered. Shield beyond the forecast is wasted — it expires after the enemy acts. Put spare energy into damage instead: Packet Burst adds 3 to this transmission.",
        hint: "Play Packet Burst. Burst lasts only for this transmission.",
      };
      if (!done.safe) return {
        coach: `Forecast: you deal ${damage}, you lose ${incoming}. Every number has a cause — open Details for the exact terms. Transmit when ready.`,
        hint: "Press Transmit (Space).",
        warning: incoming > 0 ? `This transmission still lets ${incoming} through.` : undefined,
      };
      return { coach: "Clean exchange: damage out, nothing in. That is the rhythm of every fight.", hint: "" };
    case "reroute":
      if (!done.channel) return {
        coach: `The hostile will CUT a cable on your only route — a broken route deals nothing. Build a second channel: a new router with its own two cables. It must share no device with the first route; each extra channel also adds +${RULES.bandwidthPerChannel} bandwidth damage.`,
        hint: "Deploy the Core Router (the South band is open), then Fiber ALPHA → router and router → OMEGA.",
      };
      if (!run.protocols.length && !transmitted(run)) return {
        coach: `Two channels (${channels(ctx)}): the cut can only take one, and bandwidth raised your damage to ${damage}. Optional: arm Failover Policy (1) — protocols trigger on their own and this one cancels the cut entirely.`,
        hint: "Play Failover Policy to arm it, then Transmit.",
        focus: "#hand-zone [data-card-id=\"failover-policy\"]",
      };
      if (!done.survive) return {
        coach: "Ready. Transmit — your channels carry the signal while the enemy swings at a cable.",
        hint: "Press Transmit (Space).",
      };
      if (!done.restore) return {
        coach: `The cut landed on ${String(run.faultLink ?? run.faultNode ?? "a cable").toUpperCase().replace("::", " ↔ ")}, but your other channel kept the signal alive. Play Hot Patch to reconnect it and restore full bandwidth. A jammed device can also be routed around: relocate it for 1 energy.`,
        hint: "Play Hot Patch — it clears the active cut or jam and draws a card.",
      };
      return { coach: "Rerouted. Redundancy turned a silenced turn into a small dent.", hint: "" };
    case "online":
      if (!done.firewall) return {
        coach: "The Trust Gate in the South is offline: no live route passes through it, so it does nothing. Cable it into a route — ALPHA → firewall → router — and it will block the incoming breach, wherever it sits.",
        hint: "Fiber ALPHA → firewall, then Fiber firewall → router. A route needs a router; the firewall can be anywhere on it.",
      };
      if (!done.transmit) return {
        coach: `Online. The shield forecast now counts the firewall against the breach — incoming ${incoming}. Online firewalls also get past hostile plating. Transmit.`,
        hint: "Press Transmit (Space).",
      };
      if (!done.cache) return {
        coach: run.faultLink || run.faultNode
          ? "The breach was blocked, but the hostile's cut is still in place — and a device is only online if a live route passes through it. Hot Patch first, then deploy the Cache Server and cable it into a route."
          : "New hardware arrived. A Cache Server draws +1 card at the start of your turn — but only while online. Deploy it and cable it into a route; the forecast shows next turn's draw. PoE Injectors (+1 energy) and Load Balancers (+1 damage per channel) follow the same rule.",
        hint: "Deploy Cache Server, then cable it between ALPHA and your router (two Fibers).",
      };
      return { coach: "Online devices are your engine: firewall defending, cache drawing. A cut can take them offline — protect what matters.", hint: "" };
    case "bands":
      if (!done.suppression && !done.jam) return {
        coach: "Your router sits in NORTH, under a Suppression field (−3 damage), and the storm will jam every unprotected device in NORTH next. Two problems, one answer: move the router out. Drag it to CENTER, or select it and choose a band (1 energy). Purge Field would only clear the suppression.",
        hint: "Click your router on the table, then pick CENTER in the device bar — or drag it across the band line.",
      };
      if (!done.suppression) return {
        coach: "Suppression still weakens your route. Purge Field cleanses a band's hostile fields (and draws a card), or move the hardware out.",
        hint: "Play Purge Field on NORTH, or relocate the router.",
      };
      if (!done.jam) return {
        coach: `The storm has marked ${String(preview?.hazardZone ?? "a band").toUpperCase()}. Get your route out of it, or give it a second channel elsewhere.`,
        hint: "Relocate the router to another band for 1 energy.",
      };
      if (!done.resonance) return {
        coach: "Now claim ground: Resonance Field adds +3 for 3 turns to routes crossing that band. Cast it on the band your route passes through.",
        hint: "Play Resonance Field, then click the field seal of your router's band.",
      };
      if (!done.transmit) return {
        coach: "Tip: three online devices in one band form a cluster (+2 damage) — but crowded bands feed corrosion and band attacks. Spreading routers North and South on separate channels earns separated-circuit shield instead. Transmit.",
        hint: "Press Transmit (Space).",
      };
      return { coach: "You read the ground and moved before the storm. That is zone play.", hint: "" };
    case "traps":
      if (!done.honeypot) return {
        coach: "The hostile will JAM a device next — your router, unless it sees something tastier. Deploy a Honeypot and cable it: while cabled, it draws jams and cable cuts first, and each one it absorbs hurts the attacker.",
        hint: "Deploy Honeypot, then Fiber it to any device.",
      };
      if (!done.armed) return {
        coach: "Now set a protocol. Protocols are armed face-down (up to 2) and fire by themselves in the enemy's turn when their trigger happens. Port Security cancels a jam and deals 4; Rate Limiter cuts a strike by 5.",
        hint: "Play Port Security or Rate Limiter — it moves to your armed protocol slots.",
        focus: "#hand-zone [data-card-id=\"port-security\"], #hand-zone [data-card-id=\"rate-limiter\"]",
      };
      if (!done.sprung) return {
        coach: `Trap set${preview?.protocolTriggers?.length ? `: ${preview.protocolTriggers.map(trigger => trigger.name).join(" + ")} will fire` : ""}. The forecast already includes it. Transmit and watch.`,
        hint: "Press Transmit (Space).",
      };
      return { coach: "Sprung. You answered the attack before it happened.", hint: "" };
    case "console-architect":
      if (!done.patch) return {
        coach: "Your console command sits beside your hand: Patch Cable (1 energy, once per turn) connects two devices without a card. Finish the route: router → OMEGA.",
        hint: "Click Patch Cable, then your router, then OMEGA.",
        focus: ".console-button",
      };
      if (!done.channels) return {
        coach: `Now go wide. Deploy the second router and cable it on both sides — Hot Swap makes your first Fiber each turn free. Every extra channel adds +${RULES.bandwidthPerChannel} bandwidth.`,
        hint: "Deploy the Core Router, then two Fibers: ALPHA → router → OMEGA.",
      };
      if (!done.transmit) return { coach: `Two channels: ${damage} damage. Transmit.`, hint: "Press Transmit (Space)." };
      return { coach: `Width is power. Three channels would add +${RULES.bandwidthPerChannel * 2}, Load Balancers +1 per channel each.`, hint: "" };
    case "console-warden":
      if (!done.harden) return {
        coach: `Your console command is Harden (1 energy): ${RULES.hardenShield} shield, +${RULES.hardenPerFirewall} per online firewall. With Backpressure, ${Number(RULES.backpressureRatio) === 1 ? "every point" : "half (rounded up)"} of the damage you prevent is stored and returns in your next transmission.`,
        hint: "Click Harden beside your hand.",
        focus: ".console-button",
      };
      if (!done.stored) return {
        coach: `Shield ${preview?.shield ?? 0} against ${preview?.incomingRaw ?? 0} incoming: the prevented part becomes backpressure (+${preview?.backpressureGain ?? 0}). Transmit to absorb the hit.`,
        hint: "Press Transmit (Space).",
      };
      if (!done.release) return {
        coach: `Backpressure stored: +${run.backpressure}. It joins your next transmission automatically — look for the Backpressure term. Harden again to keep the cycle going.`,
        hint: "Transmit again to release it.",
      };
      return { coach: "Defense became damage. The more the enemy hits your wall, the harder you hit back.", hint: "" };
    case "console-ghost":
      if (!done.buffer) return {
        coach: `Your console command is Buffer (free, once per turn): this turn's transmission is stored ×${RULES.bufferMultiplier} instead of dealt. Your next normal transmission releases the whole buffer. Switch it on.`,
        hint: "Click Buffer beside your hand. Click again to cancel before transmitting.",
        focus: ".console-button",
      };
      if (!done.stored) return {
        coach: `Buffering: +${preview?.bufferGain ?? 0} will be stored. Burst played now is buffered too. The hostile's next move is not a cut — a safe turn to hold. Transmit.`,
        hint: "Press Transmit (Space).",
      };
      if (!done.protect) {
        if (run.buffering && preview?.bufferAtRisk) return {
          coach: `Buffering again with an unprotected line: the hostile will CUT your only route, your next turn would start with no live route, and all ${preview.bufferGain + run.buffer} buffered damage would be lost. Arm Failover Policy or build a second channel first.`,
          hint: "Arm Failover Policy (1), or deploy a router with two Fibers for a second channel.",
          warning: "Packet loss ahead: the coming cut leaves you with no live route.",
        };
        return {
          coach: `Buffer: ${run.buffer}. A normal transmission now would flush it safely before the cut — the simple answer. The Ghost's real game is stacking: but the hostile will CUT your only route, and a turn that starts with no live route loses the whole buffer. Protect the line, then switch Buffer on again.`,
          hint: "Arm Failover Policy (or build a second channel), then click Buffer.",
        };
      }
      if (!done.release) return run.buffering ? {
        coach: `Protected and stacking: +${preview?.bufferGain ?? 0} more goes into the buffer. Transmit, then flush it all next turn.`,
        hint: "Press Transmit (Space).",
      } : {
        coach: `Buffer: ${run.buffer}. Now flush: a normal transmission (Buffer off) adds everything stored to this hit.`,
        hint: "Make sure Buffer is off, then Transmit.",
      };
      return { coach: "Held, protected, released. The Ghost's rhythm: wait for a safe window, then strike once.", hint: "" };
    case "danger": {
      const ultimateTurn = !!intent?.ultimate;
      if (!done.scrub) return {
        coach: `The Regent is charging its ultimate — you have one turn to prepare. First, clean up: malware on your table costs −2 damage every transmission. Click it and scrub it (1 energy).`,
        hint: "Click the malware crystal on the table.",
      };
      if (!done.worm) return {
        coach: "A Worm is in your hand: if it is still there when you transmit, it deals 2 to you. Delete it (1 energy). Junk like this is injected by enemies and disappears after the encounter.",
        hint: "Play the Worm card to delete it.",
        focus: "#hand-zone [data-card-id=\"worm\"]",
      };
      if (!done.prepare) return {
        coach: "Next turn is the ultimate. Hold your answer: the Prepare slot (+ PREPARE, bottom left, beside your Draw and Discard piles) sets one card aside for free — it replaces a draw next turn. Prepare Zero Day, your biggest burst.",
        hint: "Press P, or click + PREPARE at the bottom left under your energy, then choose Zero Day.",
        focus: ".prepared-pile",
      };
      if (!done.charge) return {
        coach: "Charge turns deal no direct damage. Spend what's left on damage or shield, then transmit.",
        hint: "Press Transmit (Space).",
      };
      if (!done.ultimate) return {
        coach: ultimateTurn
          ? `CROWNFALL: ${preview?.incomingRaw ?? 0} damage unless you deal ${preview?.breakDamage ?? 12} this transmission (now ${damage}). Interrupt with your prepared burst — it also exposes the guardian (+3, armor bypassed) — or brace with enough shield. Your call.`
          : "Survive the next exchange without losing integrity.",
        hint: "Zero Day + Packet Burst reaches the threshold. Or: Aegis Protocol + Packet Guard covers the whole hit.",
        warning: incoming > 0 && !preview?.interrupted ? `${incoming} damage will get through as things stand.` : undefined,
      };
      return { coach: "The crown fell — on your terms. Every guardian gives you this warning; use it.", hint: "" };
    }
    case "expedition":
      return { coach: "", hint: "" };
  }
}

export function lessonProgress(
  id: LessonId,
  run: RunState,
  lastResult?: TurnResult,
  previous?: LessonProgress,
): LessonProgress {
  const lesson = lessonById(id)!;
  const preview = run.phase === "battle" && run.enemy ? combatPreview(run) : null;
  const ctx: Context = { run, preview, last: lastResult };
  const now = lesson.kind === "battle" ? goalChecks(id, ctx) : { read: false };
  const done: Record<string, boolean> = {};
  for (const goal of lesson.goals) {
    done[goal.id] = !!previous?.goals.find(item => item.id === goal.id)?.done || !!now[goal.id];
  }
  // A defeated training enemy ends the drill: remaining transmit goals count as met.
  if (run.phase === "reward" || (run.enemy && run.enemy.hp <= 0)) {
    for (const goal of lesson.goals) if (["transmit", "safe", "sprung", "charge"].includes(goal.id)) done[goal.id] = true;
  }
  const goals = lesson.goals.map(goal => ({ ...goal, done: done[goal.id] }));
  const complete = lesson.kind === "battle" && goals.every(goal => goal.done);
  const coach = lesson.kind === "battle" ? coachFor(id, ctx, done) : { coach: "", hint: "" };
  let warning = coach.warning ?? "";
  if (!complete && run.phase === "lost") warning = "The drill signal went dark. Restart the lesson — nothing is lost.";
  else if (!complete && !warning && preview && run.integrity - preview.incoming <= 4 && preview.incoming > 0)
    warning = `Low integrity: this transmission would leave you at ${run.integrity - preview.incoming}.`;
  const current = goals.findIndex(goal => !goal.done);
  return {
    id,
    goals,
    current: current === -1 ? goals.length : current,
    coach: complete ? lesson.takeaway : coach.coach,
    hint: complete ? "" : coach.hint,
    warning,
    focus: complete ? "" : coach.focus ?? "",
    complete,
  };
}

// ---------------------------------------------------------------------------
// Completion state (tiny localStorage helper; safe in node and private windows)

export function loadCompletedLessons(): LessonId[] {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(TRAINING_STORAGE) || "[]");
    return Array.isArray(value) ? value.filter((id): id is LessonId => !!lessonById(id)) : [];
  } catch {
    return [];
  }
}
export function markLessonComplete(id: LessonId): LessonId[] {
  const completed = loadCompletedLessons();
  if (!completed.includes(id)) completed.push(id);
  try {
    globalThis.localStorage?.setItem(TRAINING_STORAGE, JSON.stringify(completed));
  } catch {
    /* Training progress is optional. */
  }
  return completed;
}
export function resetTrainingProgress() {
  try {
    globalThis.localStorage?.removeItem(TRAINING_STORAGE);
  } catch {
    /* Optional. */
  }
}

/** Which band a point is in, for coach text and tests. */
export function bandOf(z: number): Zone {
  return zoneForNode({ z });
}
