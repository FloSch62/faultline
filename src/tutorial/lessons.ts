/** Field Training: scripted lessons built on the real combat rules.
 *
 * Everything here is pure: lesson setups use the public core API, and every goal
 * is a predicate over RunState, the pure combat forecast and the last TurnResult.
 * Progress is sticky: pass the previous progress back in and completed goals stay done.
 * No DOM, no import.meta — this module runs in node tests. */
import { ENEMIES, hostileName } from "../core/enemies.ts";
import { makeEnemy } from "../core/encounter.ts";
import { raiseAdds } from "../core/combat/surprises.ts";
import { CARDS, RULES } from "../core/cards.ts";
import {
  beginBattle, combatPreview, conditionOf, CONSOLES, costFor, createRun, hardenBlock, INSTALLATION_NAMES, isWorn, maxConditionOf, PORTS,
  repairCost, scrubCost, signalPaths, zoneForNode, type TurnResult,
} from "../core/run.ts";
import type { Archetype, CardId, Enemy, MapRoom, NetworkLink, NetworkNode, Port, RelicId, RunState, Zone } from "../core/types.ts";

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
  | "expedition"
  | "aim-signal"
  | "clear-ground"
  | "wardens";

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
  /** Goals follow the board: an undone aim reopens its step (Z never strands the drill).
   * Only `sticky` goals stay done once met. Without `live`, every goal is sticky. */
  live?: boolean;
  sticky?: readonly string[];
  /** Goals met by reading: the panel offers "Got it", and a click on the spotlit control counts. */
  reading?: readonly string[];
}
/** Interface state the lessons read: selection is reading, never a move, so it is not in RunState. */
export interface LessonView {
  /** The port whose hostile the right plate shows (the HUD's selection). */
  port?: Port | null;
  /** Reading steps the player acknowledged. */
  read?: readonly string[];
  /** The hand card lifted for targeting (a field choosing its band), or null. */
  selected?: CardId | null;
}
/** A small break meter the coach draws while the plate shows none (the charge turn). */
export interface LessonMeter {
  /** The guardian's own threshold, and what each living add adds to it. */
  base: number;
  bonus: number;
  /** Adds raised, and how many of them stand. */
  adds: number;
  standing: number;
  /** What the transmission would deal to the guardian's port with everything on it. */
  packet: number;
  /** The add's name in the meter's line ("Warden"). */
  add?: string;
}
export interface LessonProgress {
  id: LessonId;
  goals: (LessonGoal & { done: boolean })[];
  /** Index of the first unfinished goal, or goals.length when complete. */
  current: number;
  /** The move to make now, one short sentence. `**text**` marks key terms. */
  coach: string;
  /** Why the move matters — secondary reading below the instruction. */
  detail: string;
  hint: string;
  /** Short warning when the player is about to make a costly mistake. */
  warning: string;
  /** CSS selector of the on-screen control the current step needs, or "". Every match glows.
   * `A || B` is a fallback: B is used only while nothing matching A is on screen. */
  focus: string;
  /** The current step is met by reading: the panel shows "Got it". */
  reading: boolean;
  /** A figure the coach draws for the step (the break meter), when the step needs one. */
  meter?: LessonMeter;
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
    title: "Danger & Guardians", kicker: "ULTIMATES · INSTALLATIONS · JUNK",
    summary: "A guardian is charging. Clean up, prepare an answer, then interrupt or brace.",
    goals: [
      { id: "scrub", label: "Scrub the Siphon Tap (1 energy)" },
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
  {
    id: "aim-signal", chapter: 10, kind: "battle", icon: "sword", minutes: 3,
    title: "Aim the Signal", kicker: "PORTS · FOCUS · AIM",
    summary: "A Relay Drone feeds the Leech. Aim one channel at it, then move the focus.",
    live: true, sticky: ["select"],
    goals: [
      { id: "select", label: "Select the left port" },
      { id: "aim", label: "Aim channel 2 at the Relay Drone" },
      { id: "strike", label: "Transmit: the Drone falls" },
      { id: "focus", label: "Focus the new Drone with F" },
      { id: "transmit", label: "Transmit: the overflow carries on" },
    ],
    takeaway: "Every channel is a delivery. The focus sets where all of them go; aim moves one. A kill's surplus overflows to the focus or the next port, so nothing is wasted. Kill the escort that makes the leader stronger.",
  },
  {
    id: "clear-ground", chapter: 11, kind: "battle", icon: "cleanse", minutes: 3,
    title: "Clear the Ground", kicker: "SCRUB · REPAIR · PURGE",
    summary: "A Static Nest has seeded your table. Scrub, repair, then purge a band.",
    live: true,
    goals: [
      { id: "scrub1", label: "Scrub the Jammer once" },
      { id: "scrub2", label: "Scrub it again" },
      { id: "repair", label: "Repair the worn router" },
      { id: "transmit", label: "Transmit" },
      { id: "purge", label: "Purge Field the band where the new Jammer landed" },
    ],
    takeaway: `Installations have integrity: scrubbing costs ${RULES.scrubCost} energy a point, and each one destroyed returns ${RULES.reclaimShield} shield. Wear is a warning: the forecast names a breakdown a turn ahead, and a repair costs ${RULES.repairCost}. Purge Field clears a whole band at once.`,
  },
  {
    id: "wardens", chapter: 12, kind: "battle", icon: "crown", minutes: 4,
    title: "The Crown and Its Wardens", kicker: "CHARGE TURN · ADDS · BREAK",
    summary: "The Regent charges behind two Gate Wardens. Lower the threshold, then break the crown.",
    live: true, sticky: ["read"], reading: ["read"],
    goals: [
      { id: "read", label: "Read the break meter" },
      { id: "aim", label: "Aim both bandwidth channels at the left Warden" },
      { id: "prepare", label: "Prepare Packet Burst (P)" },
      { id: "charge", label: "Transmit: the Warden falls" },
      { id: "break", label: "Break Crownfall on the ultimate turn" },
    ],
    takeaway: "Adds raise the threshold while they live: kill one on the charge turn and the break comes back within reach. Spread your channels on the charge turn, or brace for the blow. A prepared burst is the difference.",
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
  /** The hostile at the centre port: a single, or the leader of `escorts`. */
  enemy: { id: string; turn: number; hp: number; name?: string; title?: string };
  /** A pack: escorts at the outer ports (the centre hostile becomes their leader). */
  escorts?: { id: string; port: Port; hp: number }[];
  nodes: NetworkNode[];
  links: NetworkLink[];
  hand: CardId[];
  draw: CardId[];
  integrity?: number;
  energy?: number;
  fields?: RunState["zoneEffects"];
  installations?: RunState["installations"];
  nextNodeId: number;
  /** Deterministic finishing touches on the built board (health read from the forecast,
   * an announced arrival, raised adds). Never RNG. */
  finish?: (run: RunState) => void;
}

const portOrder = (a: Enemy, b: Enemy) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port);

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
  run.enemies = [makeEnemy(template.id, "h1", "centre", setup.escorts?.length ? "leader" : "single", setup.enemy.hp, {
    turn: setup.enemy.turn,
    name: setup.enemy.name ?? template.name,
    title: setup.enemy.title ?? template.title,
  })];
  (setup.escorts ?? []).forEach((escort, i) => run.enemies.push(makeEnemy(escort.id, `h${i + 2}`, escort.port, "escort", escort.hp)));
  run.enemies.sort(portOrder);
  run.focus = "centre";
  run.aims = {};
  // No rolled surprises in a drill: every arrival is placed by the lesson itself.
  run.reinforcement = null;
  run.signal = null;
  run.offers = [];
  run.entrance = [];
  run.creditLedger = [];
  run.bossIntroSeen = true;
  run.integrity = run.maxIntegrity = setup.integrity ?? 20;
  run.energy = setup.energy ?? 5;
  // Training boards are hand-arranged: no random terrain, salvage or leftovers.
  run.topology = { nodes: [...terminals(), ...setup.nodes], links: setup.links };
  run.nextNodeId = setup.nextNodeId;
  run.terrain = null;
  run.installations = setup.installations ?? [];
  run.zoneEffects = setup.fields ?? [];
  run.faultNodes = [];
  run.faultLinks = [];
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
  setup.finish?.(run);
  return run;
}

/** A training hostile's health, fixed after the board is built. */
function setHealth(enemy: Enemy | undefined, hp: number) {
  if (enemy) enemy.hp = enemy.maxHp = Math.max(1, Math.round(hp));
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
        installations: [{ id: "tap1", kind: "tap", x: 2.6, z: 0, integrity: 1, activeFrom: 0, owner: "h1" }],
        hand: ["worm", "zero-day", "guard", "pulse", "patch"],
        draw: ["pulse", "barrier", "guard", "patch", "fiber", "guard"],
        integrity: 20,
        nextNodeId: 3,
      });
    }
    case "aim-signal":
      return buildRun({
        enemy: { id: "leech", turn: 0, hp: 24, title: "A drill in divided fire" },
        escorts: [{ id: "relay-drone", port: "left", hp: 1 }],
        // North and Center routers: two channels without the separated-circuit shield, so the
        // Drone's uplink shows in full on the incoming number.
        nodes: [device("router1", "router", 0, -2.4), device("router2", "router", 0, 0.6)],
        links: [cable("alpha", "router1"), cable("router1", "omega"), cable("alpha", "router2"), cable("router2", "omega")],
        hand: ["guard", "pulse", "fiber", "patch"],
        draw: ["guard", "fiber", "pulse", "fiber", "guard", "patch"],
        nextNodeId: 3,
        finish: run => {
          const [primary, second] = combatPreview(run).deliveries;
          // Channel 2 alone is exactly lethal to the Drone; the Drone the Leech calls next needs
          // both deliveries, and what is left of them overflows into the Leech.
          setHealth(run.enemies.find(enemy => enemy.id === "relay-drone"), second.amount);
          run.reinforcement = {
            enemyId: "relay-drone", after: 1, crate: { kind: "empty" },
            hp: Math.max(second.amount + 1, Math.min(second.amount + 2, primary.amount + second.amount - 1)),
          };
        },
      });
    case "clear-ground": {
      // The router is one wear from breaking; the Nest seeded a Jammer at the first reach socket
      // (north of it) and a Spike beside it, both in NORTH, where its next Jammer lands too.
      const router = { x: 0, z: -2.4 };
      return buildRun({
        enemy: { id: "nest", turn: 0, hp: 30, title: "A drill on seeded ground" },
        nodes: [device("router1", "router", router.x, router.z, { condition: 1, maxCondition: RULES.deviceCondition })],
        links: [cable("alpha", "router1"), cable("router1", "omega")],
        installations: [
          { id: "jammer1", kind: "jammer", x: router.x, z: router.z - RULES.reachRings[0], integrity: RULES.installationIntegrity.jammer, activeFrom: 0, owner: "h1", aim: "router1" },
          { id: "spike1", kind: "spike", x: router.x + RULES.reachRings[0], z: router.z, integrity: RULES.installationIntegrity.spike, activeFrom: 0, owner: "h1", aim: "router1" },
        ],
        hand: ["guard", "pulse", "fiber"],
        draw: ["purge-field", "guard", "pulse", "fiber", "guard", "patch"],
        // Two scrubs and a repair fit in the first turn, whatever the costs are tuned to.
        energy: Math.max(RULES.baseEnergy, 2 * RULES.scrubCost + RULES.repairCost),
        nextNodeId: 2,
      });
    }
    case "wardens": {
      const turn = Math.max(0, ENEMIES.regent.pattern.findIndex(step => step.kind === "charge"));
      return buildRun({
        enemy: { id: "regent", turn, hp: 60, title: "A drill: the crown and its wardens" },
        nodes: [
          device("router1", "router", 0, -2.4), device("balancer2", "balancer", -2.5, 0),
          device("router3", "router", 1.25, 0), device("router4", "router", 0, 2.4),
        ],
        links: [
          cable("alpha", "router1"), cable("router1", "omega"),
          cable("alpha", "balancer2"), cable("balancer2", "router3"), cable("router3", "omega"),
          cable("alpha", "router4"), cable("router4", "omega"),
        ],
        hand: ["pulse", "guard", "fiber"],
        draw: ["guard", "fiber", "barrier", "guard", "patch", "fiber"],
        nextNodeId: 5,
        finish: run => {
          // The crown is announced: two Gate Wardens stand at the outer ports (RISING until the ultimate).
          raiseAdds(run);
          run.enemies.sort(portOrder);
          // Both bandwidth deliveries together are enough for the left Warden, however balance tunes them.
          const bandwidth = combatPreview(run).deliveries.filter(item => !item.primary).reduce((sum, item) => sum + item.amount, 0);
          const left = run.enemies.find(enemy => enemy.port === "left" && enemy.role === "add");
          if (left && left.hp > bandwidth) setHealth(left, bandwidth);
        },
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
  view: LessonView;
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
const isCard = (id: CardId | null | undefined, base: string) => !!id && CARDS[id]?.base === base;

// ---- the table-front drills (chapters 10–12): what their steps read from the board
/** The v4 drills: packs, the table front and the charge turn. Their rails also guard aim,
 * focus, scrub and repair, and they never cable, deploy or relocate. */
const FRONT_LESSONS: readonly LessonId[] = ["aim-signal", "clear-ground", "wardens"];
/** The bandwidth deliveries (every channel after the primary). */
const bandwidthOf = (preview: Preview | null) => preview?.deliveries.filter(item => !item.primary) ?? [];
const livingAt = (run: RunState, port: Port) => run.enemies.some(enemy => enemy.port === port && enemy.hp > 0);
/** The living Relay Drone (the first, then the one the Leech calls in). */
const droneOf = (run: RunState) => run.enemies.find(enemy => enemy.id === "relay-drone" && enemy.hp > 0);
/** The installation the Clear the Ground drill scrubs: the standing Jammer. */
const jammerOf = (run: RunState) => run.installations.find(item => item.kind === "jammer");
/** The Wardens drill: the guardian, its adds, and the threshold of its coming ultimate. */
const regentOf = (run: RunState) => run.enemies.find(enemy => !!ENEMIES[enemy.id]?.boss);
const addBonus = (run: RunState) => run.ascension >= 10 ? RULES.addBreakBonusLate : RULES.addBreakBonus;
/** Break threshold of the ultimate after this transmission: base + bonus per add still standing. */
function nextThreshold(run: RunState, preview: Preview | null): number {
  const regent = regentOf(run);
  const base = regent ? ENEMIES[regent.id].boss?.breakDamage ?? 0 : 0;
  const standing = run.enemies.filter(enemy => enemy.role === "add" && enemy.hp > 0 && (preview?.ports[enemy.port]?.uid !== enemy.uid || !preview?.ports[enemy.port]?.lethal)).length;
  return base + standing * addBonus(run);
}

function goalChecks(id: LessonId, ctx: Context): Record<string, boolean> {
  const { run, preview, last, view } = ctx;
  switch (id) {
    case "aim-signal": {
      const second = bandwidthOf(preview)[0];
      return {
        select: view.port === "left" || transmitted(run),
        aim: transmitted(run) || (!!second && second.aimed && second.port === "left"),
        strike: transmitted(run),
        focus: transmitted(run, 2) || (run.turn === 2 && !!droneOf(run) && run.focus === droneOf(run)!.port),
        transmit: transmitted(run, 2),
      };
    }
    case "clear-ground": {
      const jammer = jammerOf(run);
      const router = run.topology.nodes.find(node => node.id === "router1");
      return {
        scrub1: transmitted(run) || !jammer || jammer.integrity < RULES.installationIntegrity.jammer,
        scrub2: transmitted(run) || !jammer,
        repair: transmitted(run) || (!!router && !isWorn(router)),
        transmit: transmitted(run),
        purge: transmitted(run) && !jammerOf(run) && run.exhaustPile.some(card => isCard(card, "purge-field")),
      };
    }
    case "wardens": {
      const bandwidth = bandwidthOf(preview);
      return {
        read: !!view.read?.includes("read") || transmitted(run),
        aim: transmitted(run) || (bandwidth.length >= 2 && bandwidth.every(item => item.aimed && item.port === "left")),
        prepare: transmitted(run) || isCard(run.preparedCard, "pulse"),
        charge: transmitted(run),
        break: transmitted(run, 2) && !!last?.interrupted,
      };
    }
    case "first-signal":
      return {
        router: hasRole(run, "router"),
        source: linked(run, "alpha", other => roleOf(run, other) === "router"),
        route: routeLive(run),
        transmit: transmitted(run) && (!!last?.packetDamage || (run.enemies[0] ? run.enemies[0].hp < run.enemies[0].maxHp : true)),
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
        restore: transmitted(run) && routeLive(run) && !run.faultLinks.length && !run.faultNodes.length && channels(ctx) >= 2,
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
        scrub: run.installations.length === 0,
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
  /** The move to make now — one short imperative sentence. `**text**` marks key terms. */
  coach: string;
  /** Why the move matters, or what to read while making it. */
  detail?: string;
  hint: string;
  warning?: string;
  /** CSS selector of the control this step is about; the UI spotlights it. */
  focus?: string;
  /** A reading step: the panel offers "Got it". */
  read?: boolean;
  meter?: LessonMeter;
}

const card = (base: string) => `#hand-zone [data-card-id="${base}"], #hand-zone [data-card-id="${base}+"]`;
const TRANSMIT = ".transmit-button";
const CONSOLE = ".console-button";

const TRANSMIT_HINT = "Press Transmit or the Space bar.";
const stud = (key: string, port: Port) => `[data-aim="${key}"][data-aim-port="${port}"]`;
const sumOf = (items: readonly { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

/** Coach lines of the table-front drills. Every number is read from the forecast or RULES. */
function frontCoach(id: LessonId, ctx: Context, done: Record<string, boolean>): Coach {
  const { run, preview } = ctx;
  const ports = preview?.ports;
  const left = ports?.left, centre = ports?.centre;
  switch (id) {
    case "aim-signal": {
      const drone = droneOf(run);
      const leech = preview?.hostiles.find(item => item.id === "leech");
      const [primary, second] = preview?.deliveries ?? [];
      if (!done.select) return {
        coach: "Select the **left port**: click the **Relay Drone**'s row on the enemy plate.",
        detail: `Two hostiles, two ports. While the Drone lives, its uplink adds +${RULES.uplinkBonus} to every strike the Leech makes: ${leech?.raw ?? 0} this phase instead of ${Math.max(0, (leech?.raw ?? 0) - RULES.uplinkBonus)}. Selecting a port only reads it; nothing changes.`,
        hint: "The rows on the enemy plate are the ports in phase order: L, C, R. Click L, or the Drone on the far rail.",
        focus: `.port-row[data-port="left"]`,
      };
      if (!done.aim) return {
        coach: "Aim **channel 2** at the Drone: click the **L** stud on its delivery row.",
        detail: `Every channel is a delivery, and right now both go to the focus, the Leech: the primary's ${primary?.amount ?? 0} and channel 2's ${second?.amount ?? 0}. Channel 2 alone matches the Drone's ${drone?.hp ?? 0} integrity; the primary keeps its ${primary?.amount ?? 0} on the Leech.`,
        hint: "The Deliveries ledger sits under the enemy plate. On the Ch 2 row, click L. Keyboard: ] steps through the rows, T moves the chosen one to the next port.",
        focus: second ? stud(second.channelKey, "left") : "",
      };
      if (!done.strike) {
        const arrival = preview?.arrivals;
        return {
          coach: "**Transmit**: channel 2 downs the Drone, the primary strikes the Leech.",
          detail: `Forecast: LEFT ${left?.packet ?? 0}${left?.lethal ? " (lethal)" : ""}, CENTRE ${centre?.packet ?? 0}. The Drone falls before it acts, so the Leech strikes for ${leech?.raw ?? 0}: a dead hostile does nothing, and neither does its uplink.${arrival ? ` Signal detected: another ${hostileName(arrival.enemyId)} arrives after this action.` : ""}`,
          hint: TRANSMIT_HINT,
          focus: TRANSMIT,
        };
      }
      if (!done.focus) {
        const port = drone?.port ?? "left";
        const kept = !!second && second.aimed && second.port === port;
        return {
          coach: `A second **Relay Drone** holds the ${port} port. Put the **focus** on it: press **F**.`,
          detail: `The focus sets the default: every delivery you have not aimed goes there, and overflow lands there. ${kept ? `Your aim stayed on the ${port} port, so channel 2 already hits the new Drone for ${second.amount}` : `Channel 2 hits the Leech`}, short of its ${drone?.hp ?? 0}. Focus it and the primary's ${primary?.amount ?? 0} joins.`,
          hint: "F cycles the focus through the living ports. Or select the Drone's row and click the crest at its right edge.",
          focus: `[data-focus-port="${port}"] || .port-row[data-port="${port}"]`,
        };
      }
      if (!done.transmit) {
        const port = drone ? ports?.[drone.port] : null;
        return {
          coach: "**Transmit**: the Drone falls and the surplus flows on to the Leech.",
          detail: `Forecast: ${drone?.port.toUpperCase() ?? "LEFT"} ${port?.packet ?? 0} against ${drone?.hp ?? 0}${port?.overflowOut ? `, overflow ${port.overflowOut} → ${port.overflowTo?.toUpperCase()}` : ""}. Overflow still pays the receiving port's armor; nothing else is lost.`,
          hint: TRANSMIT_HINT,
          focus: TRANSMIT,
        };
      }
      return { coach: "Aimed, focused, overflowed. The Leech fights alone now.", hint: "" };
    }
    case "clear-ground": {
      const jammer = jammerOf(run);
      const router = run.topology.nodes.find(node => node.id === "router1");
      const name = router?.id.toUpperCase() ?? "ROUTER1";
      const wear = preview?.wear.find(item => item.nodeId === "router1");
      const scrubAt = (key: string) => `#target-dock .scrub-button[data-scrub="${key}"] || .ledger-chip.is-installation[data-scrub="${key}"]`;
      const cost = scrubCost(run);
      if (!done.scrub1) return {
        coach: `Scrub the **Jammer**: click its tag in the ledger (${cost} energy).`,
        detail: `Installations have integrity: this one has ${jammer?.integrity ?? 0}. After your transmission it jams the nearest device within ${RULES.reach.toFixed(1)}, your router, and a jammed router carries no signal next turn. Each scrub removes one point for ${cost} energy.`,
        hint: "Every installation has an iron tag in the ledger beside your hand. Click the Jammer's tag, or press S.",
        focus: jammer ? scrubAt(jammer.id) : "",
      };
      if (!done.scrub2) return {
        coach: "Scrub it **again**: one point left.",
        detail: `At 0 it is destroyed, and Reclaim adds ${RULES.reclaimShield} shield to this enemy phase.`,
        hint: "Click the Jammer's tag once more, or press S.",
        focus: jammer ? scrubAt(jammer.id) : "",
      };
      if (!done.repair) return {
        coach: `**Repair** your router: click it in the **Worn** tag (${repairCost(run)} energy).`,
        detail: `${name} is worn: condition ${router ? conditionOf(router) : 0} of ${router ? maxConditionOf(router) : 0}. The Spike beside it wears the nearest device every enemy phase, and the forecast already says it: ${wear?.breaks ? `breaks ${name} · wreckage remains` : `wears ${name} to ${wear?.to ?? 0}`}. A breakdown takes the device and its cables. The warning comes a turn ahead; one repair answers it.`,
        hint: `Click ${name} inside the Worn tag, or press R.`,
        focus: `#target-dock .repair-button[data-repair="router1"] || .ledger-chip.is-wear [data-repair="router1"]`,
      };
      if (!done.transmit) {
        const hatched = preview?.installTargets.find(item => item.kind === "jammer" && !item.boosts);
        return {
          coach: "**Transmit**.",
          detail: `Repaired to ${router ? conditionOf(router) : 0}, the router survives the Spike this phase (${router ? conditionOf(router) : 0} → ${wear?.to ?? 0}).${hatched ? ` The Static Nest hatches a new Jammer in ${zoneForNode(hatched).toUpperCase()}: watch where it lands.` : ""}`,
          hint: TRANSMIT_HINT,
          focus: TRANSMIT,
        };
      }
      if (!done.purge) {
        const band = jammer ? zoneForNode(jammer) : null;
        const there = band ? run.installations.filter(item => zoneForNode(item) === band).map(item => INSTALLATION_NAMES[item.kind]) : [];
        const purge = run.hand.findIndex(card => isCard(card, "purge-field"));
        // Lifted, the card is choosing its band: the spotlight moves to the band's seal.
        if (band && isCard(ctx.view.selected, "purge-field")) return {
          coach: `Now click **${band.toUpperCase()}**: its field seal, or the band on the table.`,
          detail: `${there.map(kind => `the ${kind}`).join(" and ").replace(/^t/, "T")} stand${there.length === 1 ? "s" : ""} in ${band.toUpperCase()}. The purge destroys ${there.length === 1 ? "it" : "both"}; the other bands keep what they hold.`,
          hint: `The seals under the table are the three bands. ${band.toUpperCase()} is lit. Esc puts the card back.`,
          focus: `[data-field-zone="${band}"]`,
        };
        return {
          coach: `Play **Purge Field** on **${band?.toUpperCase() ?? "the Jammer's band"}**: ${there.length > 1 ? `the new Jammer and the ${there.filter(kind => kind !== "Jammer")[0] ?? "Spike"} both stand there` : "the new Jammer stands there"}.`,
          detail: `Purge Field costs ${purge >= 0 ? costFor(run, purge) : CARDS["purge-field"].cost}: it destroys every installation in one band (Reclaim ${RULES.reclaimShield} shield each) and clears the band's jams and hostile fields. Left standing, the Jammer jams your router next phase${wear?.breaks ? ` and the Spike breaks it` : ""}.`,
          hint: `Select Purge Field, then click the ${band?.toUpperCase() ?? "marked"} band on the table or its field seal.`,
          focus: card("purge-field"),
        };
      }
      return { coach: "Scrubbed, repaired, purged. The ground is yours again.", hint: "" };
    }
    case "wardens": {
      const regent = regentOf(run);
      const base = regent ? ENEMIES[regent.id].boss?.breakDamage ?? 0 : 0;
      const bonus = addBonus(run);
      const standing = run.enemies.filter(enemy => enemy.role === "add" && enemy.hp > 0).length;
      const now = base + standing * bonus;
      const after = nextThreshold(run, preview);
      const deliveries = preview?.deliveries ?? [];
      const bandwidth = bandwidthOf(preview);
      const primary = deliveries.find(item => item.primary);
      const total = sumOf(deliveries);
      const burst = CARDS[run.preparedCard ?? run.hand.find(card => isCard(card, "pulse")) ?? "pulse"]?.values.burst ?? CARDS.pulse.values.burst ?? 0;
      const warden = run.enemies.find(enemy => enemy.port === "left" && enemy.role === "add" && enemy.hp > 0);
      if (!done.read) return {
        coach: `Read the **break meter**: each living Warden adds **${bonus}** to it.`,
        detail: `Next turn Crownfall breaks at ${now}: ${base}, plus ${bonus} for each Warden. The Regent is charging: THE CROWN RISES. ${standing === 2 ? "Both Gate Wardens hold" : `${standing} Gate Warden${standing === 1 ? " holds" : "s hold"}`} the outer ports, rising: they act from the ultimate turn. All your channels together deal ${total}, short of ${now}. Every Warden that falls takes ${bonus} off the threshold.`,
        hint: "Click the break meter, or Got it in this panel, once you have read it.",
        focus: `.boss-window || .coach-break || .port-row[data-port="${regent?.port ?? "centre"}"]`,
        read: true,
        meter: { base, bonus, adds: run.enemies.filter(enemy => enemy.role === "add").length, standing, packet: total, add: "Warden" },
      };
      if (!done.aim) {
        const next = bandwidth.find(item => !(item.aimed && item.port === "left"));
        return {
          coach: `Aim **channel ${(next?.index ?? 1) + 1}** at the left **Gate Warden**: its **L** stud.`,
          detail: `Channels ${bandwidth.map(item => item.index + 1).join(" and ")} carry ${bandwidth.map(item => item.amount).join(" + ")} = ${sumOf(bandwidth)}, and the Warden has ${warden?.hp ?? 0}. The primary keeps its ${primary?.amount ?? 0} on the Regent.`,
          hint: "In the Deliveries ledger, click L on each bandwidth row (Ch 2, then Ch 3). Keyboard: ] steps through the rows, T moves the chosen one.",
          focus: next ? stud(next.channelKey, "left") : "",
        };
      }
      if (!done.prepare) return {
        coach: "Prepare **Packet Burst**: press **P**, or click **+ PREPARE** at the bottom left.",
        detail: `A prepared card skips this turn and waits in next turn's hand. With the Warden gone the break is ${after}, and your channels deal ${total} to the Regent: the burst's +${burst} is the difference.`,
        hint: "Press P, or click + PREPARE under your energy, then choose Packet Burst.",
        focus: ".prepared-pile",
      };
      if (!done.charge) return {
        coach: `**Transmit**: the Warden falls, and the break drops to **${after}**.`,
        detail: `Forecast: LEFT ${left?.packet ?? 0}${left?.lethal ? " (lethal)" : ""}, CENTRE ${centre?.packet ?? 0}. The Regent only gathers power this turn, and the right Warden is still rising.`,
        hint: TRANSMIT_HINT,
        focus: TRANSMIT,
      };
      if (!done.break) {
        const port = regent ? ports?.[regent.port] : null;
        const threshold = port?.breakThreshold ?? after;
        const packet = port?.packet ?? 0;
        const crown = preview?.hostiles.find(item => item.uid === regent?.uid);
        if (transmitted(run, 2) || !crown?.intent?.ultimate) return {
          coach: "Crownfall has passed unbroken. **Restart** the lesson and bring the prepared burst.",
          hint: "Restart sits at the foot of this panel.",
        };
        if (port?.breaks) return {
          coach: `**Transmit**: ${packet} of ${threshold}. Crownfall breaks.`,
          detail: `An interrupted ultimate lands nothing and exposes the Regent: armor bypassed and +${RULES.exposedBonus} next turn. The right Warden still strikes.`,
          hint: TRANSMIT_HINT,
          focus: TRANSMIT,
        };
        return {
          coach: `Play the prepared **Packet Burst**: ${packet} becomes ${packet + burst}, and the break is ${threshold}.`,
          detail: `One Warden fell, so the threshold is ${threshold}: ${base} plus ${bonus} for the Warden still standing. Otherwise CROWNFALL lands for ${crown.raw}.`,
          hint: "Packet Burst is back in your hand: click it, then Transmit.",
          focus: card("pulse"),
        };
      }
      return { coach: "The crown fell on your terms.", hint: "" };
    }
    default:
      return { coach: "", hint: "" };
  }
}

function coachFor(id: LessonId, ctx: Context, done: Record<string, boolean>): Coach {
  if (FRONT_LESSONS.includes(id)) return frontCoach(id, ctx, done);
  const { run, preview } = ctx;
  const intent = preview?.intent;
  const incoming = preview?.incoming ?? 0;
  const damage = preview?.packetDamage ?? 0;
  const noEnergy = run.energy <= 0;
  switch (id) {
    case "first-signal":
      if (!done.router) return {
        coach: "Play the **Core Router** card and set it near the middle of the table.",
        detail: "Every signal needs a router between ALPHA and OMEGA. Hardware stays on the table for the whole battle.",
        hint: "Click the Core Router card, then click an empty spot on the table — or use “Deploy in a free socket”.",
        focus: card("router"),
      };
      if (!done.source) return {
        coach: "Play an **Optic Fiber**, then click **ALPHA** and then your **router**.",
        detail: "Cables are undirected and stay for the encounter. This one lights the router's uplink.",
        hint: "Select Optic Fiber, then click ALPHA and your router — on the table or in the device strip below.",
        focus: card("fiber"),
      };
      if (!done.route) return {
        coach: "Run the second **Optic Fiber** from your **router** to **OMEGA**.",
        detail: "That closes the path ALPHA → router → OMEGA: your first live route.",
        hint: "Select the other Optic Fiber, then your router, then OMEGA.",
        focus: card("fiber"),
      };
      if (!done.transmit) return {
        coach: "Press **Transmit** to send the signal.",
        detail: `The number on the button is your damage: ${damage}. Transmitting ends your turn — then the hostile acts, exactly as its intent announced.`,
        hint: "Press Transmit or the Space bar.",
        focus: TRANSMIT,
      };
      return { coach: "Signal delivered. Your router and cables stay: next turn the same route fires again for free.", hint: "" };
    case "read-the-enemy":
      if (!done.cover) return {
        coach: "Play **Packet Guard** until your plate reads **0 integrity at risk**.",
        detail: `The right plate announces the hostile's move: ${intent?.kind === "strike" ? "STRIKE" : intent?.kind?.toUpperCase() ?? "act"} for ${preview?.incomingRaw ?? 0} after your transmission. Right now ${incoming} would get through.`,
        hint: "Packet Guard gives 4 shield for this turn only. Watch “integrity at risk” drop as you play it.",
        warning: noEnergy && incoming > 0 ? "Out of energy with damage still coming — undo (Z) and try a different order." : undefined,
        focus: card("guard"),
      };
      if (!done.burst) return {
        coach: "Play **Packet Burst** — put the spare energy into damage.",
        detail: "Shield beyond the forecast is wasted: it expires after the enemy acts. Burst adds 3 to this transmission.",
        hint: "Play Packet Burst. Burst lasts only for this transmission.",
        focus: card("pulse"),
      };
      if (!done.safe) return {
        coach: "**Transmit** when ready.",
        detail: `Forecast: you deal ${damage}, you lose ${incoming}. Every number has a cause — open Details for the exact terms.`,
        hint: "Press Transmit (Space).",
        warning: incoming > 0 ? `This transmission still lets ${incoming} through.` : undefined,
        focus: TRANSMIT,
      };
      return { coach: "Clean exchange: damage out, nothing in. That is the rhythm of every fight.", hint: "" };
    case "reroute":
      if (!done.channel) return {
        coach: "Build a **second channel**: deploy the new **Core Router**, then fiber **ALPHA → router → OMEGA**.",
        detail: `The hostile will CUT a cable on your only route — a broken route deals nothing. Channels share no device, and each extra one adds +${RULES.bandwidthPerChannel} bandwidth damage.`,
        hint: "Deploy the Core Router (the South band is open), then Fiber ALPHA → router and router → OMEGA.",
        focus: run.topology.nodes.filter(node => node.role === "router").length < 2 ? card("router") : card("fiber"),
      };
      if (!run.protocols.length && !transmitted(run)) return {
        coach: "Optional: arm **Failover Policy**, then **Transmit**.",
        detail: `Two channels (${channels(ctx)}): the cut can only take one, and bandwidth raised your damage to ${damage}. Protocols fire on their own — this one cancels the cut entirely.`,
        hint: "Play Failover Policy to arm it, then Transmit.",
        focus: card("failover-policy"),
      };
      if (!done.survive) return {
        coach: "**Transmit** — your channels carry the signal.",
        detail: "The enemy swings at a cable; the other channel keeps the route alive.",
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      if (!done.restore) return {
        coach: "Play **Hot Patch** to reconnect the cut line.",
        detail: `The cut landed on ${String(run.faultLinks[0] ?? run.faultNodes[0] ?? "a cable").toUpperCase().replace("::", " ↔ ")}, but your other channel kept the signal alive. A jammed device can also be routed around: relocate it for 1 energy.`,
        hint: "Play Hot Patch — it clears the active cut or jam and draws a card.",
        focus: card("patch"),
      };
      return { coach: "Rerouted. Redundancy turned a silenced turn into a small dent.", hint: "" };
    case "online":
      if (!done.firewall) return {
        coach: "Cable the **Trust Gate** into your route: fiber **ALPHA → firewall**, then **firewall → router**.",
        detail: "A device only works while a live route passes through it. The firewall in the South is dark — online, it blocks the incoming breach, wherever it sits on the route.",
        hint: "Fiber ALPHA → firewall, then Fiber firewall → router. A route needs a router; the firewall can be anywhere on it.",
        focus: card("fiber"),
      };
      if (!done.transmit) return {
        coach: "**Transmit**.",
        detail: `The shield forecast now counts the firewall against the breach — incoming ${incoming}. Online firewalls also get past hostile plating.`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      if (!done.cache) return run.faultLinks.length || run.faultNodes.length ? {
        coach: "Play **Hot Patch** first, then cable the **Cache Server** into a route.",
        detail: "The hostile's cut is still in place — and a device is only online if a live route passes through it.",
        hint: "Hot Patch clears the cut. Then deploy Cache Server and cable it between ALPHA and your router.",
        focus: card("patch"),
      } : {
        coach: "Deploy the **Cache Server** and cable it into a route.",
        detail: "Online, it draws +1 card at the start of your turn; the forecast shows next turn's draw. PoE Injectors (+1 energy) and Load Balancers (+1 damage per channel) follow the same rule.",
        hint: "Deploy Cache Server, then cable it between ALPHA and your router (two Fibers).",
        focus: hasRole(run, "cache") ? card("fiber") : card("cache-server"),
      };
      return { coach: "Online devices are your engine: firewall defending, cache drawing. A cut can take them offline — protect what matters.", hint: "" };
    case "bands":
      if (!done.suppression && !done.jam) return {
        coach: "Move your **router** out of NORTH: drag it to CENTER, or click it and pick a band (1 energy).",
        detail: "It sits under a Suppression field (−3 damage), and the storm will jam every unprotected device in NORTH next. One move answers both; Purge Field would only clear the suppression.",
        hint: "Click your router on the table, then pick CENTER in the device bar — or drag it across the band line.",
      };
      if (!done.suppression) return {
        coach: "Play **Purge Field** on NORTH — or move the hardware out.",
        detail: "Suppression weakens every route through the band. Purge cleanses a band's hostile fields and draws a card.",
        hint: "Play Purge Field on NORTH, or relocate the router.",
        focus: card("purge-field"),
      };
      if (!done.jam) return {
        coach: `Get your route out of **${String(preview?.hazardZone ?? "the marked band").toUpperCase()}** — or give it a second channel elsewhere.`,
        detail: "The storm strikes every unprotected device in the band it marked.",
        hint: "Relocate the router to another band for 1 energy.",
      };
      if (!done.resonance) return {
        coach: "Play **Resonance Field** on the band your route crosses.",
        detail: "+3 damage for 3 turns to routes crossing that band. Claim the ground you stand on.",
        hint: "Play Resonance Field, then click the field seal of your router's band.",
        focus: card("resonance-field"),
      };
      if (!done.transmit) return {
        coach: "**Transmit**.",
        detail: "Tip: three online devices in one band form a cluster (+2 damage), but crowded bands feed corrosion and band attacks. Routers spread North and South on separate channels earn separated-circuit shield instead.",
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      return { coach: "You read the ground and moved before the storm. That is zone play.", hint: "" };
    case "traps":
      if (!done.honeypot) return {
        coach: "Deploy a **Honeypot** and fiber it to any device.",
        detail: "The hostile will JAM a device next — your router, unless it sees something tastier. A cabled honeypot draws jams and cable cuts first, and each one it absorbs hurts the attacker.",
        hint: "Deploy Honeypot, then Fiber it to any device.",
        focus: hasRole(run, "honeypot") ? card("fiber") : card("honeypot"),
      };
      if (!done.armed) return {
        coach: "Arm a protocol: **Port Security** or **Rate Limiter**.",
        detail: "Protocols are armed face-down (up to 2) and fire by themselves in the enemy's turn when their trigger happens. Port Security cancels a jam and deals 4; Rate Limiter cuts a strike by 5.",
        hint: "Play Port Security or Rate Limiter — it moves to your armed protocol slots.",
        focus: `${card("port-security")}, ${card("rate-limiter")}`,
      };
      if (!done.sprung) return {
        coach: "**Transmit** and watch the trap spring.",
        detail: `${preview?.protocolTriggers?.length ? `${preview.protocolTriggers.map(trigger => trigger.name).join(" + ")} will fire — the` : "The"} forecast already includes it.`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      return { coach: "Sprung. You answered the attack before it happened.", hint: "" };
    case "console-architect":
      if (!done.patch) return {
        coach: "Use **Patch Cable** to finish the route: your **router → OMEGA**.",
        detail: "Your console command sits beside your hand: 1 energy, once per turn, and it connects two devices without a card.",
        hint: "Click Patch Cable, then your router, then OMEGA.",
        focus: CONSOLE,
      };
      if (!done.channels) return {
        coach: "Go wide: deploy the second **Core Router** and cable it on both sides.",
        detail: `Hot Swap makes your first Fiber each turn free, and every extra channel adds +${RULES.bandwidthPerChannel} bandwidth.`,
        hint: "Deploy the Core Router, then two Fibers: ALPHA → router → OMEGA.",
        focus: run.topology.nodes.filter(node => node.role === "router").length < 2 ? card("router") : card("fiber"),
      };
      if (!done.transmit) return {
        coach: "**Transmit**.",
        detail: `Two channels: ${damage} damage.`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      return { coach: `Width is power. Three channels would add +${RULES.bandwidthPerChannel * 2}, Load Balancers +1 per channel each.`, hint: "" };
    case "console-warden":
      if (!done.harden) return {
        coach: "Use **Harden**, the console command beside your hand.",
        detail: `${CONSOLES.harden.cost} energy: ${hardenBlock(run)} shield now (${RULES.hardenShield}, +${RULES.hardenPerFirewall} per online firewall${RULES.hardenPerHostile ? `, +${RULES.hardenPerHostile} per hostile beyond the first` : ""}${RULES.hardenPerAdd ? `, +${RULES.hardenPerAdd} per living guardian add` : ""}). With Backpressure, ${Number(RULES.backpressureRatio) === 1 ? "every point" : "half (rounded up)"} of the damage you prevent is stored and returns in your next transmission.`,
        hint: "Click Harden beside your hand.",
        focus: CONSOLE,
      };
      if (!done.stored) return {
        coach: "**Transmit** and absorb the hit.",
        detail: `Shield ${preview?.shield ?? 0} against ${preview?.incomingRaw ?? 0} incoming: the prevented part becomes backpressure (+${preview?.backpressureGain ?? 0}).`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      if (!done.release) return {
        coach: "**Transmit** again to release it.",
        detail: `Backpressure stored: +${run.backpressure}. It joins your next transmission automatically — look for the Backpressure term. Harden again to keep the cycle going.`,
        hint: "Transmit again to release it.",
        focus: TRANSMIT,
      };
      return { coach: "Defense became damage. The more the enemy hits your wall, the harder you hit back.", hint: "" };
    case "console-ghost":
      if (!done.buffer) return {
        coach: "Switch on **Buffer**, the console command beside your hand.",
        detail: `Free, once per turn: this turn's transmission is stored ×${RULES.bufferMultiplier} instead of dealt. Your next normal transmission releases the whole buffer.`,
        hint: "Click Buffer beside your hand. Click again to cancel before transmitting.",
        focus: CONSOLE,
      };
      if (!done.stored) return {
        coach: "**Transmit** into the buffer.",
        detail: `+${preview?.bufferGain ?? 0} will be stored, and burst played now is buffered too. The hostile's next move is not a cut — a safe turn to hold.`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      if (!done.protect) {
        if (run.buffering && preview?.bufferAtRisk) return {
          coach: "Protect the line: arm **Failover Policy**, or build a second channel.",
          detail: `The hostile will CUT your only route. A turn that starts with no live route loses the whole buffer — all ${preview.bufferGain + run.buffer} of it.`,
          hint: "Arm Failover Policy (1), or deploy a router with two Fibers for a second channel.",
          warning: "Packet loss ahead: the coming cut leaves you with no live route.",
          focus: card("failover-policy"),
        };
        return {
          coach: "Protect the line — arm **Failover Policy** — then switch **Buffer** on again.",
          detail: `Buffer: ${run.buffer}. A normal transmission now would flush it safely before the cut — the simple answer. The Ghost's real game is stacking a second buffered turn behind a protected line.`,
          hint: "Arm Failover Policy (or build a second channel), then click Buffer.",
          focus: card("failover-policy"),
        };
      }
      if (!done.release) return run.buffering ? {
        coach: "**Transmit** — protected, the buffer stacks.",
        detail: `+${preview?.bufferGain ?? 0} more goes into the buffer. Flush it all next turn.`,
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      } : {
        coach: "Flush it: make sure **Buffer** is off, then **Transmit**.",
        detail: `A normal transmission adds everything stored (${run.buffer}) to this hit.`,
        hint: "Make sure Buffer is off, then Transmit.",
        focus: TRANSMIT,
      };
      return { coach: "Held, protected, released. The Ghost's rhythm: wait for a safe window, then strike once.", hint: "" };
    case "danger": {
      const ultimateTurn = !!intent?.ultimate;
      if (!done.scrub) return {
        coach: `Scrub the **Siphon Tap**: click its tag in the ledger (${scrubCost(run)} energy).`,
        detail: `The Regent is charging its ultimate — you have one turn to prepare. A Siphon Tap on your table costs −${RULES.malwarePenalty} damage every transmission.`,
        hint: "Click the Siphon Tap's iron tag in the ledger or press S — or click the Tap on the table and use Scrub.",
        focus: `#target-dock .scrub-button[data-scrub="tap1"] || .ledger-chip.is-installation[data-scrub="tap1"]`,
      };
      if (!done.worm) return {
        coach: "Play the **Worm** to delete it (1 energy).",
        detail: "If it is still in your hand when you transmit, it deals 2 to you. Junk like this is injected by enemies and disappears after the encounter.",
        hint: "Play the Worm card to delete it.",
        focus: card("worm"),
      };
      if (!done.prepare) return {
        coach: "Prepare **Zero Day**: press **P**, or click **+ PREPARE** at the bottom left.",
        detail: "The Prepare slot — beside your Draw and Discard piles — holds one card for next turn, free; it replaces a draw. Next turn is the ultimate: hold your biggest burst.",
        hint: "Press P, or click + PREPARE at the bottom left under your energy, then choose Zero Day.",
        focus: ".prepared-pile",
      };
      if (!done.charge) return {
        coach: "Spend what's left on damage or shield, then **Transmit**.",
        detail: "Charge turns deal no direct damage — the blow comes next turn.",
        hint: "Press Transmit (Space).",
        focus: TRANSMIT,
      };
      if (!done.ultimate) return ultimateTurn ? {
        coach: `**Interrupt**: deal ${preview?.breakDamage ?? 12} this transmission (now ${damage}) — or **brace** with enough shield. Your call.`,
        detail: `CROWNFALL lands for ${preview?.incomingRaw ?? 0} otherwise. Interrupting with your prepared burst also exposes the guardian (+3, armor bypassed). If the forecast reads CANCELLED, your transmission kills first and nothing lands.`,
        hint: "Zero Day + Packet Burst reaches the threshold. Or: Aegis Protocol + Packet Guard covers the whole hit.",
        warning: incoming > 0 && !preview?.interrupted ? `${incoming} damage will get through as things stand.` : undefined,
        focus: `${card("zero-day")}, ${card("pulse")}`,
      } : {
        coach: "Survive the next exchange without losing integrity.",
        hint: "Zero Day + Packet Burst reaches the threshold. Or: Aegis Protocol + Packet Guard covers the whole hit.",
        warning: incoming > 0 && !preview?.interrupted ? `${incoming} damage will get through as things stand.` : undefined,
      };
      return { coach: "The crown fell — on your terms. Every guardian gives you this warning; use it.", hint: "" };
    }
    case "expedition":
    default:
      return { coach: "", hint: "" };
  }
}

export function lessonProgress(
  id: LessonId,
  run: RunState,
  lastResult?: TurnResult,
  previous?: LessonProgress,
  view: LessonView = {},
): LessonProgress {
  const lesson = lessonById(id)!;
  const preview = run.phase === "battle" && run.enemies.length ? combatPreview(run) : null;
  const ctx: Context = { run, preview, last: lastResult, view };
  const now = lesson.kind === "battle" ? goalChecks(id, ctx) : { read: false };
  const done: Record<string, boolean> = {};
  for (const goal of lesson.goals) {
    // Live drills follow the board (Z reopens a step); the rest keep a met goal met.
    const keep = !lesson.live || !!lesson.sticky?.includes(goal.id);
    done[goal.id] = (keep && !!previous?.goals.find(item => item.id === goal.id)?.done) || !!now[goal.id];
  }
  // A defeated training enemy ends the drill: remaining transmit goals count as met.
  if (run.phase === "reward" || (run.enemies.length > 0 && run.enemies.every(enemy => enemy.hp <= 0))) {
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
    detail: complete ? "" : coach.detail ?? "",
    hint: complete ? "" : coach.hint,
    warning,
    focus: complete ? "" : coach.focus ?? "",
    reading: !complete && !!coach.read,
    ...(!complete && coach.meter ? { meter: coach.meter } : {}),
    complete,
  };
}

// ---------------------------------------------------------------------------
// Guard rails: in training the coach stops a clearly wrong move before it lands.

export type LessonAction =
  | { kind: "card"; card: CardId }
  /** A cable between two devices — a link card, or the Architect's Patch Cable (no card). */
  | { kind: "link"; a: string; b: string; card?: CardId }
  | { kind: "ground"; card: CardId; zone: Zone }
  | { kind: "zone"; card: CardId; zone: Zone }
  | { kind: "move"; node: string; zone: Zone }
  | { kind: "prepare"; card: CardId }
  | { kind: "transmit" }
  /** Re-aim one channel's delivery at a port (null: follow the focus). */
  | { kind: "aim"; key: string; port: Port | null }
  /** Make a port the focus. */
  | { kind: "focus"; port: Port }
  /** Restore one condition point of a device. */
  | { kind: "repair"; node: string }
  /** Scrub one integrity point off an installation. */
  | { kind: "scrub"; installation: string };

/** Cards (base ids) the CURRENT goal allows — one step at a time, nothing else lifts.
 * "any" marks a step that is the player's own call; a goal missing from its lesson's
 * map needs no cards at all. */
const GOAL_CARDS: Partial<Record<LessonId, Record<string, readonly string[] | "any">>> = {
  "first-signal": { router: ["router"], source: ["fiber"], route: ["fiber"] },
  "read-the-enemy": { cover: ["guard"], burst: ["pulse"] },
  reroute: { channel: ["router", "switch", "fiber"], survive: ["failover-policy"], restore: ["patch", "fiber", "router", "switch"] },
  online: { firewall: ["fiber"], cache: ["cache-server", "fiber", "patch"] },
  bands: { suppression: ["purge-field"], jam: ["router", "fiber"], resonance: ["resonance-field"] },
  traps: { honeypot: ["honeypot", "fiber"], armed: ["port-security", "rate-limiter", "failover-policy"] },
  "console-architect": { channels: ["router", "fiber", "load-balancer"] },
  "console-warden": { release: ["pulse"] },
  "console-ghost": { stored: ["pulse"], protect: ["failover-policy", "router", "fiber"], release: ["pulse"] },
  danger: { charge: "any", ultimate: "any" },
  // The table-front drills: every step is a move on the board except these two.
  "aim-signal": {},
  "clear-ground": { purge: ["purge-field"] },
  wardens: { break: ["pulse"] },
};
/** Shield is an emergency exit: allowed whenever the coming hit would end the drill. */
const DEFENSE = ["guard", "barrier"];

const affordable = (run: RunState, bases: readonly string[]) =>
  run.hand.some((id, index) => bases.includes(CARDS[id].base) && costFor(run, index) <= run.energy);

/** Whether a player action is off the drill's script. Returns the coach's objection —
 * with the way forward — or null to allow it. Every block leaves an affordable way to
 * continue, so the guard can never strand a lesson. */
export function lessonGuard(id: LessonId, run: RunState, progress: LessonProgress, action: LessonAction): string | null {
  if (progress.complete || run.phase !== "battle" || !run.enemies.length) return null;
  const done: Record<string, boolean> = {};
  for (const goal of progress.goals) done[goal.id] = goal.done;
  const preview = combatPreview(run);

  if (action.kind === "card") {
    const definition = CARDS[action.card];
    if (!definition || definition.junk || definition.curse) return null;
    const goals = GOAL_CARDS[id];
    if (!goals) return null;
    const current = progress.goals[progress.current];
    const allowed = current ? goals[current.id] ?? [] : [];
    if (allowed === "any" || allowed.includes(definition.base)) return null;
    if (preview.incoming >= run.integrity && DEFENSE.includes(definition.base)) return null;
    return `Keep ${definition.name} for later — the current step: ${current?.label ?? "finish the drill"}.`;
  }

  if (FRONT_LESSONS.includes(id)) return frontGuard(id, run, progress, action, preview);
  if (action.kind === "aim" || action.kind === "focus" || action.kind === "repair") return null;
  if (action.kind === "scrub") {
    const current = progress.goals[progress.current];
    return id !== "danger" || current?.id === "scrub" ? null : `Not now — the current step: ${current?.label ?? "finish the drill"}.`;
  }

  if (action.kind === "link") {
    const role = (end: string) => run.topology.nodes.find(node => node.id === end)?.role;
    const touches = (wanted: NetworkNode["role"]) => role(action.a) === wanted || role(action.b) === wanted;
    switch (id) {
      case "first-signal":
      case "console-architect": {
        // The classic dead end: a cable that touches no router carries nothing.
        const building = id === "first-signal" ? !done.route : !done.patch;
        if (building && !touches("router"))
          return "A route needs a router in the middle — a straight ALPHA → OMEGA cable carries no signal. Connect to your router.";
        if (id === "console-architect" && !done.channels) {
          const taken = new Set(signalPaths(run).flat());
          if ([action.a, action.b].some(end => taken.has(end) && !["alpha", "omega"].includes(end)))
            return "An independent channel shares no device with your first route. Cable ALPHA to the new router, then the new router to OMEGA.";
        }
        return null;
      }
      case "reroute": {
        if (done.channel) return null;
        const taken = new Set(signalPaths(run).flat());
        if ([action.a, action.b].some(end => taken.has(end) && !["alpha", "omega"].includes(end)))
          return "An independent channel shares no device with your first route. Cable ALPHA to the new router, then the new router to OMEGA.";
        return null;
      }
      case "online":
        if (!done.firewall && !touches("firewall"))
          return "Cable the Trust Gate first: ALPHA → firewall, then firewall → router.";
        if (done.firewall && done.transmit && !done.cache) {
          if (!hasRole(run, "cache")) return "Deploy the Cache Server first — then cable it into a route.";
          if (!touches("cache")) return "Cable the Cache Server into a route: ALPHA → cache → router works.";
        }
        return null;
      case "traps":
        if (!done.honeypot) {
          if (!hasRole(run, "honeypot")) return "Deploy the Honeypot first — then cable it.";
          if (!touches("honeypot")) return "Cable the Honeypot, so the jam finds the decoy instead of your router.";
        }
        return null;
      default:
        return null;
    }
  }

  if (action.kind === "ground" || action.kind === "move") {
    // Holding the ground is lesson five's whole point: never into the storm's band.
    if (id === "bands" && !done.jam) {
      const marked = preview.hazardZone;
      if (marked && action.zone === marked)
        return `The storm strikes ${marked.toUpperCase()} next — put your hardware in another band.`;
    }
    return null;
  }

  if (action.kind === "zone") {
    if (id !== "bands") return null;
    const base = CARDS[action.card].base;
    if (base === "purge-field" && !run.zoneEffects.some(effect => effect.zone === action.zone))
      return "Purge cleanses a hostile field — cast it on the band where the suppression sits.";
    if (base === "resonance-field") {
      const crossed = new Set(signalPaths(run).flat()
        .map(end => run.topology.nodes.find(node => node.id === end))
        .filter(node => !!node)
        .map(node => zoneForNode(node)));
      if (crossed.size && !crossed.has(action.zone))
        return "Your route doesn't cross that band — cast Resonance where your signal runs.";
    }
    return null;
  }

  if (action.kind === "prepare") {
    if (id === "danger" && !done.prepare && !["zero-day", "pulse"].includes(CARDS[action.card].base))
      return "Hold your answer to the ultimate: prepare Zero Day, your biggest burst.";
    return null;
  }

  // Transmissions that would waste the drill's setup, each with an affordable escape.
  switch (id) {
    case "first-signal":
      if (!done.route && affordable(run, hasRole(run, "router") ? ["fiber"] : ["router"]))
        return "Not yet — without a live route the transmission does nothing. Finish ALPHA → router → OMEGA first.";
      break;
    case "read-the-enemy":
      if (!done.cover && preview.incoming > 0 && affordable(run, ["guard"]))
        return `You would lose ${preview.incoming} integrity. Play Packet Guard until the forecast reads 0, then transmit.`;
      break;
    case "reroute":
      if (!done.channel && affordable(run, ["router", "switch", "fiber"]))
        return "The coming cut would silence your only route. Build the second channel first, then transmit.";
      break;
    case "online":
      if (!done.firewall && affordable(run, ["fiber"]))
        return "The Trust Gate is still offline, so the breach will land. Cable it into your route first.";
      break;
    case "bands":
      if (!done.jam && run.energy >= RULES.relocateCost)
        return "The storm would jam your route where it stands. Move your router out of the marked band first (1 energy).";
      break;
    case "traps":
      if ((!done.honeypot && affordable(run, ["honeypot", "fiber"])) || (!done.armed && affordable(run, ["port-security", "rate-limiter", "failover-policy"])))
        return "Set the trap before the attack: a cabled Honeypot and an armed protocol. Then transmit.";
      break;
    case "console-architect":
      if (!done.patch && run.consoleUses === 0 && run.energy >= 1)
        return "The route is unfinished, so a transmission does nothing. Use Patch Cable beside your hand to close it first.";
      break;
    case "console-ghost":
      if (run.buffering && preview.bufferAtRisk)
        return "Packet loss ahead: the coming cut would spill the whole buffer. Protect the line first — or click Buffer again to cancel and flush now.";
      break;
  }
  return lethalTransmission(run, preview);
}

/** Every rail's last word on a transmission: never walk into a loss while a shield answer remains. */
function lethalTransmission(run: RunState, preview: Preview): string | null {
  if (preview.incoming >= run.integrity && !preview.lethal && !preview.enemyDefeatedByTraps && affordable(run, DEFENSE))
    return `That transmission would end the drill: ${preview.incoming} incoming against ${run.integrity} integrity. Shield first, or undo (Z).`;
  return null;
}

/** Rails of the table-front drills (chapters 10–12), for every move but cards: only the current
 * step's move is playable. Aim, focus, scrub and repair are free or cheap and always available
 * while their step is open, so blocking the rest never strands the drill; each objection names
 * the way forward. Transmit is free once the step's goal is met. */
function frontGuard(id: LessonId, run: RunState, progress: LessonProgress, action: LessonAction, preview: Preview): string | null {
  const step = progress.goals[progress.current];
  const now = step?.id ?? "";
  const next = `the current step: ${step?.label ?? "finish the drill"}.`;
  const bandwidth = bandwidthOf(preview);
  switch (action.kind) {
    case "aim": {
      if (id === "aim-signal" && now === "aim") {
        const second = bandwidth[0];
        if (second && action.key === second.channelKey && action.port === "left") return null;
        return second && action.key !== second.channelKey
          ? "Leave the primary on the Leech. Aim channel 2, the second delivery row, at the Drone."
          : "Channel 2 goes to the left port: the Relay Drone.";
      }
      if (id === "wardens" && now === "aim") {
        const bandwidthKey = bandwidth.some(item => item.channelKey === action.key);
        if (bandwidthKey && action.port === "left") return null;
        return bandwidthKey ? "Both bandwidth channels go to the left port: the Gate Warden." : "Keep the primary on the Regent. The two bandwidth channels are enough for the Warden.";
      }
      return id === "aim-signal" && now === "focus"
        ? "This time move them all: press F to put the focus on the new Drone."
        : `Leave your deliveries where they are — ${next}`;
    }
    case "focus": {
      const drone = droneOf(run);
      if (id === "aim-signal" && now === "focus" && drone && action.port === drone.port) return null;
      if (id === "aim-signal" && now === "focus") return "Focus the new Relay Drone: it feeds the Leech again.";
      return id === "aim-signal" && (now === "select" || now === "aim")
        ? "Leave the focus on the Leech. Aim moves one delivery; this step needs only channel 2."
        : `Leave the focus where it is — ${next}`;
    }
    case "scrub": {
      const item = run.installations.find(entry => entry.id === action.installation);
      if (id === "clear-ground" && (now === "scrub1" || now === "scrub2")) {
        if (item?.kind === "jammer") return null;
        return `Leave the ${item ? INSTALLATION_NAMES[item.kind] : "installation"} for now: Purge Field takes it next turn. Scrub the Jammer.`;
      }
      if (id === "clear-ground" && now === "purge") return "Don't scrub point by point here: Purge Field clears the whole band for less.";
      return `Not now — ${next}`;
    }
    case "repair": {
      const node = run.topology.nodes.find(entry => entry.id === action.node);
      if (id === "clear-ground" && now === "repair" && node && node.id === "router1") return null;
      return `Not now — ${next}`;
    }
    case "prepare":
      if (id === "wardens" && now === "prepare") return CARDS[action.card]?.base === "pulse" ? null : "Hold Packet Burst: next turn it is the difference.";
      return `Keep your hand as it is — ${next}`;
    case "zone": {
      if (id === "clear-ground" && now === "purge" && CARDS[action.card]?.base === "purge-field") {
        const jammer = jammerOf(run);
        if (!jammer || zoneForNode(jammer) === action.zone) return null;
        return `Purge ${zoneForNode(jammer).toUpperCase()}: the Jammer stands there.`;
      }
      return `Not now — ${next}`;
    }
    case "link":
    case "ground":
    case "move":
      return `Your network is already built: this drill needs no new cables, hardware or moves. ${next[0].toUpperCase()}${next.slice(1)}`;
    case "card":
      return null;
    case "transmit":
      break;
  }
  // Transmit: only when it is the step, or the step can no longer be made.
  switch (id) {
    case "aim-signal":
      if ((now === "select" || now === "aim") && bandwidth.length && livingAt(run, "left"))
        return "Not yet: aim channel 2 at the Drone first, or the whole transmission lands on the Leech.";
      if (now === "focus" && droneOf(run)) return "Not yet: put the focus on the new Drone first (F).";
      break;
    case "clear-ground":
      if ((now === "scrub1" || now === "scrub2") && jammerOf(run) && run.energy >= scrubCost(run))
        return "The Jammer would jam your router after this transmission. Scrub it first.";
      if (now === "repair" && run.energy >= repairCost(run) && run.topology.nodes.some(node => node.id === "router1" && isWorn(node)))
        return "The Spike would break your worn router this phase. Repair it first.";
      if (now === "purge" && jammerOf(run) && affordable(run, ["purge-field"]))
        return "Purge the Jammer's band first: next phase it jams your router.";
      break;
    case "wardens": {
      if (now === "read") return "Read the break meter first: click it, or Got it in the coach panel.";
      if (now === "aim" && bandwidth.length >= 2 && livingAt(run, "left")) return "Aim both bandwidth channels at the left Warden first.";
      if (now === "prepare" && affordable(run, ["pulse"])) return "Prepare Packet Burst first (P): it arrives next turn, when it counts.";
      const regent = regentOf(run);
      const port = regent ? preview.ports[regent.port] : null;
      if (now === "break" && port?.breakThreshold && !port.breaks && affordable(run, ["pulse"]))
        return `${port.packet} of ${port.breakThreshold}: Crownfall would land. Play the prepared Packet Burst first.`;
      break;
    }
  }
  return lethalTransmission(run, preview);
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
