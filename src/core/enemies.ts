import type { DesignationId, Intent, InstallationKind, MessageOptionId, SignalId } from "./types.ts";
import { RULES } from "./cards.ts";

const R = RULES;
const REACH = R.reach.toFixed(1);

/** Hostiles lead or fight alone; escorts ride beside a leader (or in a stage I duo, or
 * arrive as a reinforcement); adds are raised by a guardian's charge. */
export type EnemyKind = "hostile" | "escort" | "add";

export interface EnemyDefinition {
  id: string;
  name: string;
  title: string;
  color: number;
  kind: EnemyKind;
  /** Hostiles and escorts cycle their pattern on their own actions (escorts only count
   * their active phases; DORMANT is produced by the engine, never listed here).
   * Adds: pattern[0] is the ultimate-turn action; the last step repeats afterwards. */
  pattern: Omit<Intent, "pressure">[];
  trait: string;
  badge: string;
  art: { file: string; columns: number; rows: number; index: number };
  /** "channels": graded, absorbs amount − perChannel × (channels − 1). "firewall": bypassed by any online firewall. */
  armor?: { amount: number; bypass: "channels" | "firewall"; perChannel?: number };
  /** Its jam prefers an online firewall (after honeypots). */
  jamsFirewalls?: boolean;
  /** When enraged, its jam also plants this installation (Blackout Core: a Siphon Tap). */
  enragedInstall?: InstallationKind;
  corruption?: "corrosion" | "suppression" | "alternating";
  jamBands?: boolean;
  enrages?: { attacks: number; faults: number };
  boss?: { entrance: string; warning: string; breakDamage: number };
  /** Hostiles only: designations this machine may carry (section 9.4 and the 12.3 exclusions).
   * Stage rules (Spiteful III only, Stoked and Rigged from II, Shedding needs an empty port)
   * are applied by `eligibleDesignations`. */
  allowedDesignations?: DesignationId[];
  /** Heavy machines lead packs only in elite rooms. */
  heavy?: boolean;
  /** Adds: the guardian that raises it and its health before ascension 6. */
  addOf?: string;
  addHealth?: number;
}

type Template = Pick<EnemyDefinition, "id" | "name" | "title" | "color" | "kind">;
const TEMPLATES: Record<string, Template> = {
  serpent: { id: "serpent", name: "COIL SERPENT", title: "One route is a perfect snare", color: 0x73c9a3, kind: "hostile" },
  moth: { id: "moth", name: "ASH MOTH", title: "Cold wings over a living signal", color: 0x91d2e4, kind: "hostile" },
  marshal: { id: "marshal", name: "NULL MARSHAL", title: "No passage without a firewall", color: 0xa6c5e7, kind: "hostile" },
  choir: { id: "choir", name: "GLASS CHOIR", title: "Three voices, one broken note", color: 0xcf9fe7, kind: "hostile" },
  weaver: { id: "weaver", name: "WIRE WEAVER", title: "Every extra thread tightens the trap", color: 0xe3bd70, kind: "hostile" },
  reaver: { id: "reaver", name: "GRAVE REAVER", title: "Most dangerous when its heart is failing", color: 0xea837b, kind: "hostile" },
  regent: { id: "regent", name: "THE IRON REGENT", title: "Keeper of the copper gates", color: 0x90d2a5, kind: "hostile" },
  cantor: { id: "cantor", name: "THE HOLLOW CHOIR", title: "The silence behind every voice", color: 0xc6a0ee, kind: "hostile" },
  prophet: { id: "prophet", name: "RUST PROPHET", title: "Corrupts the ground beneath you", color: 0xe49b72, kind: "hostile" },
  widow: { id: "widow", name: "PRISM WIDOW", title: "Silences your strongest circuit", color: 0xbba0e8, kind: "hostile" },
  colossus: { id: "colossus", name: "FERRIC COLOSSUS", title: "An iron wall against a single route", color: 0xd9b079, kind: "hostile" },
  leech: { id: "leech", name: "PACKET LEECH", title: "Feeds on lost traffic", color: 0x6ee4d4, kind: "hostile" },
  wraith: { id: "wraith", name: "CABLE WRAITH", title: "Cuts exposed links", color: 0xab8cff, kind: "hostile" },
  storm: { id: "storm", name: "NULL STORM", title: "Disrupts active hardware", color: 0x87b5ff, kind: "hostile" },
  sentinel: { id: "sentinel", name: "GATE SENTINEL", title: "Tests your trust boundary", color: 0xffad79, kind: "hostile" },
  core: { id: "core", name: "BLACKOUT CORE", title: "The source of the signal collapse", color: 0xff777e, kind: "hostile" },
  // v4 leaders: the table front
  foreman: { id: "foreman", name: "SCRAP FOREMAN", title: "Condemns what it cannot cut", color: 0xd9a45c, kind: "hostile" },
  nest: { id: "nest", name: "STATIC NEST", title: "Every hatchling holds a line down", color: 0xd46fc8, kind: "hostile" },
  demolition: { id: "demolition", name: "DEMOLITION ENGINE", title: "Counts down while you build", color: 0xf0725e, kind: "hostile" },
  blight: { id: "blight", name: "ROOT BLIGHT", title: "Anchors the rust where it grew", color: 0xe8874a, kind: "hostile" },
  // v4 escorts
  "spark-mite": { id: "spark-mite", name: "SPARK MITE", title: "Bites whatever the others bite", color: 0x7ee8d0, kind: "escort" },
  splicer: { id: "splicer", name: "SPLICER", title: "Still cuts cables to repair them", color: 0x8fb4ff, kind: "escort" },
  "relay-drone": { id: "relay-drone", name: "RELAY DRONE", title: "Amplifies the nearest authority", color: 0xf2c46a, kind: "escort" },
  "ward-node": { id: "ward-node", name: "WARD NODE", title: "Guards a machine that needs no guarding", color: 0xb9a6f0, kind: "escort" },
  "tap-spinner": { id: "tap-spinner", name: "TAP SPINNER", title: "Taps the lines it once tested", color: 0xe07ad8, kind: "escort" },
  "glass-echo": { id: "glass-echo", name: "GLASS ECHO", title: "Repeats the last order it heard", color: 0xc9b4f5, kind: "escort" },
  "rigger-drone": { id: "rigger-drone", name: "RIGGER DRONE", title: "Braces nothing now but its spikes", color: 0xe8925a, kind: "escort" },
  // v4 guardian adds
  "gate-warden": { id: "gate-warden", name: "GATE WARDEN", title: "A piece of the gate that answers the crown", color: 0x8fd49f, kind: "add" },
  chorister: { id: "chorister", name: "CHORISTER", title: "One voice the Choir keeps", color: 0xc39ff0, kind: "add" },
  "quarantine-drone": { id: "quarantine-drone", name: "QUARANTINE DRONE", title: "Finishes the shell the Core began", color: 0xff8a7a, kind: "add" },
};

const PATTERNS: Record<string, Omit<Intent, "pressure">[]> = {
  serpent: [
    { kind: "strike", label: "COIL CRUSH", amount: 2 },
    { kind: "sever", label: "FANG CUT", amount: 0 },
    { kind: "corrupt", label: "VENOM FIELD", amount: 0 },
  ],
  moth: [
    { kind: "corrupt", label: "ASHFALL", amount: 0 },
    { kind: "jam", label: "COLD WINGS", amount: 0, field: "suppression" },
    { kind: "strike", label: "LANTERN FLARE", amount: 2 },
  ],
  marshal: [
    { kind: "breach", label: "FINAL WARRANT", amount: 3 },
    { kind: "jam", label: "LOCKDOWN", amount: 0 },
    { kind: "strike", label: "SHIELD HAMMER", amount: 3 },
  ],
  choir: [
    { kind: "corrupt", label: "DISSONANT REFRAIN", amount: 0 },
    { kind: "strike", label: "SHATTER NOTE", amount: 2 },
    { kind: "corrupt", label: "DISSONANT REFRAIN", amount: 0, junk: { card: "packet-loss", count: 2 } },
    { kind: "breach", label: "RESONANT BREACH", amount: 3 },
  ],
  weaver: [
    { kind: "sever", label: "SNAP A THREAD", amount: 0, field: "suppression" },
    // v4: BIND HARDWARE (jam) became OVERTENSION (overload).
    { kind: "overload", label: "OVERTENSION", amount: 0 },
    { kind: "strike", label: "TENSION RELEASE", amount: 3 },
  ],
  reaver: [
    { kind: "breach", label: "GRAVE TOLL", amount: 3, field: "corrosion" },
    { kind: "strike", label: "SCYTHE SWEEP", amount: 3 },
    { kind: "corrupt", label: "ASHEN GROUND", amount: 0 },
  ],
  regent: [
    { kind: "breach", label: "ROYAL DECREE", amount: 4 },
    { kind: "sever", label: "CLOSE THE GATES", amount: 0, field: "corrosion" },
    { kind: "strike", label: "IRON JUDGEMENT", amount: 3 },
    { kind: "corrupt", label: "TARNISHED EARTH", amount: 0 },
    { kind: "charge", label: "THE CROWN RISES", amount: 0 },
    { kind: "breach", label: "CROWNFALL", amount: 7, ultimate: true },
  ],
  cantor: [
    { kind: "corrupt", label: "THE SILENCING", amount: 0 },
    { kind: "jam", label: "STOLEN VOICE", amount: 0, field: "suppression", junk: { card: "packet-loss", count: 2 } },
    { kind: "corrupt", label: "THE SILENCING", amount: 0 },
    { kind: "breach", label: "CATHEDRAL FALL", amount: 4, field: "corrosion" },
    { kind: "charge", label: "ONE LAST BREATH", amount: 0 },
    { kind: "breach", label: "REQUIEM", amount: 8, ultimate: true, field: "suppression" },
  ],
  prophet: [
    { kind: "corrupt", label: "SEED CORROSION", amount: 0 },
    { kind: "strike", label: "RUST STRIKE", amount: 2 },
    { kind: "breach", label: "OXIDE BREACH", amount: 3 },
  ],
  widow: [
    { kind: "corrupt", label: "WEAVE NULL FIELD", amount: 0 },
    { kind: "sever", label: "CUT A CABLE", amount: 0 },
    { kind: "strike", label: "PRISM STRIKE", amount: 3 },
  ],
  colossus: [
    { kind: "strike", label: "IRON FIST", amount: 3 },
    { kind: "corrupt", label: "SCORCH THE GROUND", amount: 0 },
    { kind: "breach", label: "FURNACE BREACH", amount: 4 },
  ],
  leech: [
    { kind: "strike", label: "INTEGRITY STRIKE", amount: 2 },
    // v4: the v3 "infect" is the Siphon Tap installation.
    { kind: "install", install: "tap", label: "SIPHON TAP", amount: 0 },
    { kind: "breach", label: "BREACH", amount: 3 },
  ],
  wraith: [
    { kind: "sever", label: "CUT A CABLE", amount: 0 },
    { kind: "strike", label: "INTEGRITY STRIKE", amount: 3 },
    { kind: "jam", label: "JAM A DEVICE", amount: 0 },
  ],
  storm: [
    { kind: "jam", label: "JAM A DEVICE", amount: 0 },
    { kind: "strike", label: "INTEGRITY STRIKE", amount: 2 },
    { kind: "sever", label: "CUT A CABLE", amount: 0 },
  ],
  sentinel: [
    { kind: "breach", label: "SECURITY BREACH", amount: 4 },
    { kind: "sever", label: "CUT A CABLE", amount: 0 },
    { kind: "strike", label: "INTEGRITY STRIKE", amount: 3 },
  ],
  core: [
    { kind: "sever", label: "CUT A CABLE", amount: 0, field: "corrosion", junk: { card: "worm", count: 1 } },
    { kind: "breach", label: "SECURITY BREACH", amount: 4 },
    { kind: "jam", label: "JAM A DEVICE", amount: 0, field: "suppression" },
    { kind: "strike", label: "INTEGRITY STRIKE", amount: 4 },
    { kind: "charge", label: "EVENT HORIZON", amount: 0 },
    { kind: "breach", label: "TOTAL BLACKOUT", amount: 10, ultimate: true, field: "corrosion" },
  ],
  // ---- v4 leaders
  foreman: [
    { kind: "overload", label: "CONDEMN", amount: 0 },
    { kind: "install", install: "spike", label: "DRIVE A SPIKE", amount: 0 },
    { kind: "strike", label: "HAMMER FALL", amount: 3 },
  ],
  nest: [
    { kind: "install", install: "jammer", label: "HATCH A JAMMER", amount: 0 },
    { kind: "strike", label: "STATIC BITE", amount: 2 },
    { kind: "install", install: "tap", label: "LAY A TAP", amount: 0 },
  ],
  demolition: [
    { kind: "install", install: "breaker", label: "SET A CHARGE", amount: 0 },
    { kind: "strike", label: "PISTON STRIKE", amount: 3 },
    { kind: "overload", label: "CRUSH", amount: 0 },
  ],
  blight: [
    { kind: "corrupt", label: "CORRODE", amount: 0 },
    { kind: "install", install: "anchor", label: "SINK AN ANCHOR", amount: 0 },
    { kind: "breach", label: "OXIDE BREACH", amount: 3 },
    { kind: "corrupt", label: "SPREAD", amount: 0 },
  ],
  // ---- v4 escorts (active steps; they are dormant on the other phase)
  "spark-mite": [
    { kind: "strike", label: "SPARK BITE", amount: 1 },
    { kind: "sever", label: "GNAW", amount: 0 },
  ],
  splicer: [
    { kind: "sever", label: "SPLICE", amount: 0 },
    { kind: "strike", label: "LASH", amount: 2 },
  ],
  "relay-drone": [
    { kind: "strike", label: "STATIC JAB", amount: 1 },
  ],
  "ward-node": [
    { kind: "jam", label: "SEAL", amount: 0 },
  ],
  "tap-spinner": [
    { kind: "install", install: "tap", label: "SPIN A TAP", amount: 0 },
    { kind: "strike", label: "BARB", amount: 1 },
  ],
  "glass-echo": [
    { kind: "corrupt", label: "REFRAIN", amount: 0 },
    { kind: "strike", label: "SHARD", amount: 1 },
  ],
  "rigger-drone": [
    { kind: "install", install: "spike", label: "RIG A SPIKE", amount: 0 },
    { kind: "strike", label: "PRY", amount: 1 },
  ],
  // ---- v4 guardian adds (first step on the ultimate turn; the last step repeats)
  "gate-warden": [
    { kind: "strike", label: "IRON STEP", amount: 2 },
  ],
  chorister: [
    { kind: "strike", label: "DESCANT", amount: 2, junk: { card: "packet-loss", count: 1 } },
    { kind: "strike", label: "HELD NOTE", amount: 2 },
  ],
  "quarantine-drone": [
    { kind: "install", install: "jammer", label: "ISOLATE", amount: 0 },
    { kind: "strike", label: "SEAL THE SHELL", amount: 3 },
  ],
};

const ADD_BREAK = `${R.addBreakBonus}`;
const TRAITS: Record<string, string> = {
  serpent: `Coil Serpent strikes deal +${R.serpentBonus} while you have only one channel. A second route that shares no device loosens its grip. Its venom leaves corrosion.`,
  moth: "Ash Moth suppresses your busiest routed band, then jams and suppresses its announced band together. Protect hardware or move it before the jam. New fields start next turn.",
  marshal: "Null Marshal absorbs 3 packet damage unless a firewall is online. Its Lockdown jams an online firewall first — keep a second firewall, a Faraday Shell or a honeypot ready.",
  choir: "Glass Choir alternates suppression and corrosion, and one refrain injects 2 Packet Loss into your draw pile. Cleanse or relocate before transmitting.",
  weaver: `Wire Weaver cuts a cable and suppresses a routed band together, and its Overtension wears a device down by 1 condition. ${R.weaverCables} or more cables add +${R.weaverBonus} strike damage. Armor key cables, keep a compact route and repair between overloads.`,
  reaver: "Grave Reaver breaches and seeds corrosion together. At half health: +2 strike and breach damage. New fields start next turn; cleanse, move or plan a finishing burst.",
  regent: `Iron Regent's armor absorbs ${R.gradedArmorBase}, minus ${R.gradedArmorPerChannel} for every channel beyond the first. Gate closure cuts a cable and seeds corrosion. At half health: +2 strike/breach damage and 1 alongside faults and fields. The crown raises two Gate Wardens; each one alive adds ${ADD_BREAK} to the break.`,
  cantor: `Hollow Choir absorbs 2 damage unless a firewall is online (${R.choirAddPlating} while a Chorister lives). Its jams suppress a band and inject Packet Loss; breaches seed corrosion. At half health: +2 breach damage and 1 alongside fields and jams. Its last breath raises two Choristers; each one alive adds ${ADD_BREAK} to the break.`,
  prophet: `Rust Prophet corrupts the busiest band for 2 turns. Hardware in that band adds ${R.corrosionDamage} incoming damage. Cleanse the field or relocate to clear ground.`,
  widow: `Prism Widow suppresses a band on your primary route for 2 turns: routes through it lose ${R.suppressionPenalty}. Cleanse it or reroute through another band.`,
  colossus: `Ferric Colossus armor absorbs ${R.gradedArmorBase}, minus ${R.gradedArmorPerChannel} for every channel beyond the first — build width or hit hard. It also scorches occupied ground with corrosion.`,
  leech: `Packet Leech plants a Siphon Tap (−${R.malwarePenalty} damage while it stands) and heals ${R.leechTapHeal} per Tap after it acts. A transmission that deals no damage lets it recover ${R.leechHeal}. Scrub a Tap for ${R.scrubCost} energy.`,
  wraith: `Cable Wraith cuts the longest unarmored cable — it ignores honeypots. A target longer than ${R.cableExposureLength} units also deals 1 damage.`,
  storm: "Null Storm jams only its announced band. Keep critical hardware outside it or protect it from jams.",
  sentinel: "Gate Sentinel plating absorbs 2 packet damage unless a firewall is online.",
  core: `Blackout Core cuts with corrosion and injects a Worm, jams with suppression. At half health: +2 strike/breach damage, jam and cut deal 1 damage, its jam also plants a Siphon Tap, and Total Blackout wears every primary-route device by ${R.blackoutWear}. Event Horizon raises two Quarantine Drones; each one alive adds ${ADD_BREAK} to the break.`,
  // ---- v4 leaders
  foreman: `Scrap Foreman's overload prefers your most worn primary-route device. While a Spike stands, its strikes deal +${R.foremanSpikeBonus}.`,
  nest: `Static Nest heals ${R.nestHeal} per installation on the table after it acts, and its strike deals +${R.nestStrikeBonus} per installation.`,
  demolition: `Demolition Engine aims its Breaker Charge at the device with the most cables. While a charge is armed, its strikes deal +${R.demolitionArmedBonus}.`,
  blight: `Root Blight sinks its Anchor in the band it corroded, so that corrosion never ticks down. While an Anchor stands, its breaches deal +${R.blightAnchorBonus} per corroded band.`,
  // ---- v4 escorts (one line each; the pack trait needs another living hostile)
  "spark-mite": `Swarm: its strike deals +${R.swarmBonus} for every other living hostile.`,
  splicer: `Twin cut: while a leader lives, its cut severs ${R.twinCut} cables (a honeypot absorbs one). In a duo it cuts one.`,
  "relay-drone": `Uplink: while it lives, the leader's strikes deal +${R.uplinkBonus}.`,
  "ward-node": `Plating link: while it lives, the leader has plating ${R.wardPlating} (bypassed by an online firewall), on top of its own armor.`,
  "tap-spinner": `Web: after it acts, it heals ${R.webHeal} per Siphon Tap on the table.`,
  "glass-echo": `Last echo: when it dies, the leader's next strike or breach deals +${R.lastEchoBonus}.`,
  "rigger-drone": `Rigging: while a leader lives, its Spikes arrive with integrity ${R.riggedSpikeIntegrity} instead of ${R.installationIntegrity.spike}.`,
  // ---- v4 adds
  "gate-warden": `Each living Gate Warden raises the Regent's break threshold by ${ADD_BREAK}. No armor.`,
  chorister: `Each living Chorister raises the Choir's break threshold by ${ADD_BREAK}. While any lives, the Choir's plating is ${R.choirAddPlating}.`,
  "quarantine-drone": `Each living Quarantine Drone raises the Core's break threshold by ${ADD_BREAK}. While one lives, scrubbing any installation costs ${R.quarantineScrubCost} per point.`,
};

/** Section 9.4 plus the three 12.3 exclusions (no Hungry on Static Nest, no Shedding on Grave Reaver;
 * Stoked and Rigged from stage II is a stage rule in `eligibleDesignations`). */
const ALLOWED: Record<string, DesignationId[]> = {
  leech: ["armored", "stoked", "shedding", "hardened", "laden", "salvaged"],
  wraith: ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "laden", "salvaged"],
  prophet: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "laden", "salvaged"],
  serpent: ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "spiteful", "laden", "salvaged"],
  moth: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  sentinel: ["nesting", "stoked", "shedding", "hardened", "rigged", "hungry", "spiteful", "laden", "salvaged"],
  colossus: ["nesting", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  weaver: ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "spiteful", "laden", "salvaged"],
  storm: ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "laden", "salvaged"],
  widow: ["nesting", "armored", "stoked", "shedding", "hardened", "rigged", "hungry", "spiteful", "laden", "salvaged"],
  marshal: ["nesting", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  choir: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  reaver: ["nesting", "armored", "stoked", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  foreman: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  nest: ["armored", "stoked", "shedding", "hardened", "spiteful", "laden", "salvaged"],
  demolition: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
  blight: ["nesting", "armored", "stoked", "shedding", "hardened", "hungry", "spiteful", "laden", "salvaged"],
};

const properties: Record<string, Partial<EnemyDefinition>> = {
  leech: { badge: "SIPHON TAP" }, wraith: { badge: "CABLE HUNTER" },
  storm: { badge: "BAND SUPPRESSION", jamBands: true },
  sentinel: { badge: "ARMORED GATE", armor: { amount: 2, bypass: "firewall" }, heavy: true },
  prophet: { badge: "CORROSION", corruption: "corrosion" },
  widow: { badge: "NULL WEAVER", corruption: "suppression" },
  colossus: { badge: "FERRIC ARMOR", armor: { amount: R.gradedArmorBase, bypass: "channels", perChannel: R.gradedArmorPerChannel }, corruption: "corrosion", heavy: true },
  serpent: { badge: "COIL PRESSURE", corruption: "corrosion" },
  moth: { badge: "ASHEN WINGS", corruption: "suppression", jamBands: true },
  marshal: { badge: "COUNTERWEIGHT", armor: { amount: 3, bypass: "firewall" }, jamsFirewalls: true, heavy: true },
  choir: { badge: "DISSONANCE", corruption: "alternating" },
  weaver: { badge: "TENSION TRAP" },
  reaver: { badge: "BLOOD PRICE", corruption: "corrosion", enrages: { attacks: 2, faults: 0 }, heavy: true },
  regent: {
    badge: "SOVEREIGN ARMOR", armor: { amount: R.gradedArmorBase, bypass: "channels", perChannel: R.gradedArmorPerChannel }, corruption: "corrosion", enrages: { attacks: 2, faults: 1 },
    boss: {
      entrance: "The copper gates close. Their keeper rises.",
      warning: `Every extra channel strips 2 of its armor. The crown rises on its fifth action, or sooner once it falls to half health: two Gate Wardens take the outer ports, and each one alive adds ${ADD_BREAK} to the break. Deal 12 damage (plus ${ADD_BREAK} per living Warden) in one transmission to interrupt Crownfall. At half health, its attacks grow stronger.`,
      breakDamage: 12,
    },
  },
  cantor: {
    badge: "THE FINAL REFRAIN", armor: { amount: 2, bypass: "firewall" }, corruption: "alternating", enrages: { attacks: 2, faults: 1 },
    boss: {
      entrance: "Every bell falls silent. One voice remains.",
      warning: `Keep a firewall online. The Choir draws its last breath on its fifth action, or sooner once it falls to half health: two Choristers take the outer ports, and each one alive adds ${ADD_BREAK} to the break. Prepare 15 damage (plus ${ADD_BREAK} per living Chorister) for the next transmission to interrupt Requiem.`,
      breakDamage: 15,
    },
  },
  core: {
    badge: "QUARANTINE", enrages: { attacks: 2, faults: 1 }, enragedInstall: "tap",
    boss: {
      entrance: "At the heart of the Blackout, the last light opens its eye.",
      warning: `At half health, the Core enters emergency mode. Event Horizon raises two Quarantine Drones, each adding ${ADD_BREAK} to the break, and warns of Total Blackout: deal 18 damage (plus ${ADD_BREAK} per living Drone) on the following transmission to interrupt it, or build enough shield to survive — and repair what it wears down.`,
      breakDamage: 18,
    },
  },
  // ---- v4 leaders: installation is the trait; none has armor or enrage.
  foreman: { badge: "FOREMAN'S MARK", heavy: true },
  nest: { badge: "BROOD" },
  demolition: { badge: "DEMOLITION", heavy: true },
  blight: { badge: "ROOT ROT", corruption: "corrosion" },
  // ---- v4 escorts
  "spark-mite": { badge: "SWARM" },
  splicer: { badge: "TWIN CUT" },
  "relay-drone": { badge: "UPLINK" },
  "ward-node": { badge: "PLATING LINK" },
  "tap-spinner": { badge: "WEB" },
  "glass-echo": { badge: "LAST ECHO", corruption: "suppression" },
  "rigger-drone": { badge: "RIGGING" },
  // ---- v4 adds
  "gate-warden": { badge: "GATE WARD", addOf: "regent", addHealth: R.addHealth["gate-warden"] },
  chorister: { badge: "HELD NOTE", addOf: "cantor", addHealth: R.addHealth.chorister },
  "quarantine-drone": { badge: "ISOLATION", addOf: "core", addHealth: R.addHealth["quarantine-drone"] },
};

function artFor(id: string): EnemyDefinition["art"] {
  for (const [file, ids, columns, rows] of [
    ["hostiles-expedition", ["serpent", "moth", "marshal", "choir", "weaver", "reaver"], 3, 2],
    ["stage-guardians", ["regent", "cantor"], 2, 1],
    ["hostiles-zones", ["prophet", "widow", "colossus"], 3, 1],
    ["hostiles-alpha", ["wraith", "storm"], 2, 1],
    ["hostiles", ["leech", "sentinel", "core"], 3, 1],
    // v4 sheets (section 14.4). Cell 7 of the escort sheet is a reserved spare.
    ["hostiles-escorts", ["spark-mite", "splicer", "relay-drone", "ward-node", "tap-spinner", "glass-echo", "rigger-drone"], 4, 2],
    ["hostiles-front", ["foreman", "nest", "demolition", "blight"], 4, 1],
    ["hostiles-adds", ["gate-warden", "chorister", "quarantine-drone"], 3, 1],
  ] as const) {
    const index = (ids as readonly string[]).indexOf(id);
    if (index >= 0) return { file, columns, rows, index };
  }
  throw new Error(`Missing enemy artwork: ${id}`);
}

export const ENEMIES: Record<string, EnemyDefinition> = Object.fromEntries(
  Object.entries(TEMPLATES).map(([id, template]) => [id, {
    ...template, pattern: PATTERNS[id], trait: TRAITS[id], badge: "HOSTILE", art: artFor(id),
    ...(ALLOWED[id] ? { allowedDesignations: ALLOWED[id] } : {}),
    ...properties[id],
  }]),
);

export const ESCORT_IDS = Object.keys(ENEMIES).filter(id => ENEMIES[id].kind === "escort");
export const ADD_IDS = Object.keys(ENEMIES).filter(id => ENEMIES[id].kind === "add");

/** "SCRAP FOREMAN" → "Scrap Foreman"; "THE IRON REGENT" → "The Iron Regent". */
export function hostileName(id: string): string {
  const name = ENEMIES[id]?.name ?? id;
  return name.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
}

// ---------------------------------------------------------------- designations (section 7)

export interface DesignationDefinition {
  id: DesignationId;
  /** The badge word engraved on the ribbon. */
  ribbon: string;
  /** One line, as printed on the plate and in the forecast. */
  rule: string;
  kind: "bad" | "good";
  /** Added to the fight's threat score (section 11.3). */
  threat: number;
  /** Roll weight: every bad designation 1, Laden and Salvaged 1.5 (rule 66). */
  weight: number;
  /** One sentence in the archive's voice: firmware revisions and cargo manifests. */
  flavour: string;
}

export const SHED_SPAWN: readonly string[] = ["spark-mite", "splicer", "ward-node"];

export const DESIGNATIONS: Record<DesignationId, DesignationDefinition> = {
  nesting: {
    id: "nesting", ribbon: "NESTING", kind: "bad", threat: 1.5, weight: 1,
    rule: "Its first action also plants a Siphon Tap at the forecast socket (stage III: a Jammer beside the primary router).",
    flavour: "A deployment script older than the Blackout still runs at boot: seed the ground, then guard it.",
  },
  armored: {
    id: "armored", ribbon: "ARMORED", kind: "bad", threat: 1.5, weight: 1,
    rule: `Plating absorbs ${R.armoredPlating} of the merged packet unless a firewall is online.`,
    flavour: "Someone bolted a second hull over the first and signed the work order in grease pencil.",
  },
  stoked: {
    id: "stoked", ribbon: "STOKED", kind: "bad", threat: 2, weight: 1,
    rule: `Every escalation level arrives ${R.stokedAdvance} action sooner (stage III: ${R.stokedAdvanceLate} sooner).`,
    flavour: "Its governor was flashed for an emergency that ended years ago, and nobody flashed it back.",
  },
  shedding: {
    id: "shedding", ribbon: "SHEDDING", kind: "bad", threat: 2, weight: 1,
    rule: "Below half health it raises one escort, with a crate, at an empty port at the start of the next enemy phase.",
    flavour: "Its manifest lists a crew of drones, and it will not report for duty without one.",
  },
  hardened: {
    id: "hardened", ribbon: "HARDENED", kind: "bad", threat: 1.5, weight: 1,
    rule: `+${Math.round(R.hardenedHealth * 100)} % health; its strikes deal ${R.hardenedStrike} less.`,
    flavour: "Refitted for a longer shift than any engineer ever worked: slower to fall, softer in the hand.",
  },
  rigged: {
    id: "rigged", ribbon: "RIGGED", kind: "bad", threat: 1.5, weight: 1,
    rule: `Each of its cuts also leaves a Spike (integrity ${R.installationIntegrity.spike}) at a reach socket beside the cut cable's nearer device.`,
    flavour: "Its cutter was retrofitted with a rigging arm, so every severed line is also marked for demolition.",
  },
  hungry: {
    id: "hungry", ribbon: "HUNGRY", kind: "bad", threat: 1.5, weight: 1,
    rule: `Heals ${R.hungryHeal} after any transmission that dealt it no damage.`,
    flavour: "Its reserve cells were never replaced; it drinks from any silence you leave it.",
  },
  spiteful: {
    id: "spiteful", ribbon: "SPITEFUL", kind: "bad", threat: 1.5, weight: 1,
    rule: "Its last announced action resolves even if it dies that turn.",
    flavour: "A dead-man switch wired into its last order: the command goes out whether or not it survives to send it.",
  },
  laden: {
    id: "laden", ribbon: "LADEN", kind: "good", threat: 0, weight: 1.5,
    rule: "Carries an undelivered message: defeating it drops a message you answer with a named choice.",
    flavour: "Somewhere in its hold a packet from the archive's queue is still waiting for an address.",
  },
  salvaged: {
    id: "salvaged", ribbon: "SALVAGED", kind: "good", threat: 0, weight: 1.5,
    rule: `On defeat it drops salvage hardware onto the table at the first free socket, condition ${R.salvageCondition}.`,
    flavour: "It was hauling spare parts to a bench that closed long ago; the crate is still strapped to its back.",
  },
};
export const DESIGNATION_IDS = Object.keys(DESIGNATIONS) as DesignationId[];

/** The designation's plate line, with the stage's Shedding escort named. */
export function designationRule(id: DesignationId, stage?: number): string {
  if (id === "nesting" && stage !== undefined)
    return stage >= 2 ? "Its first action also plants a Jammer beside your primary router."
      : "Its first action also plants a Siphon Tap at the forecast socket.";
  if (id === "stoked" && stage !== undefined)
    return `Every escalation level arrives ${stage >= 2 ? R.stokedAdvanceLate : R.stokedAdvance} action${(stage >= 2 ? R.stokedAdvanceLate : R.stokedAdvance) === 1 ? "" : "s"} sooner.`;
  if (id === "shedding" && stage !== undefined) {
    const spawn = SHED_SPAWN[Math.max(0, Math.min(2, stage))];
    return `Below half health it raises one ${hostileName(spawn)}, with a crate, at an empty port at the start of the next enemy phase.`;
  }
  return DESIGNATIONS[id].rule;
}

/** Designations a hostile may carry here. `emptyPort`: a port is free at roll time
 * (a single or a leader with one escort), which Shedding needs. */
export function eligibleDesignations(enemyId: string, stage: number, emptyPort: boolean): DesignationId[] {
  const definition = ENEMIES[enemyId];
  if (!definition || definition.kind !== "hostile" || definition.boss) return [];
  return (definition.allowedDesignations ?? []).filter(id =>
    (id !== "spiteful" || stage >= 2) &&
    ((id !== "stoked" && id !== "rigged") || stage >= 1) &&
    (id !== "shedding" || emptyPort));
}

/** Two designations never repeat, never pair Stoked with Shedding, and are never both good. */
export function designationsCompatible(first: DesignationId, second: DesignationId): boolean {
  if (first === second) return false;
  if ([first, second].includes("stoked") && [first, second].includes("shedding")) return false;
  return DESIGNATIONS[first].kind === "bad" || DESIGNATIONS[second].kind === "bad";
}

// ---------------------------------------------------------------- packs and threat (sections 9.5, 11.3)

export interface PackTemplate {
  /** The centre hostile, or null for a stage I escort duo. */
  leader: string | null;
  /** Escorts in port order: left, then right. */
  escorts: string[];
  /** Zero-based stage. */
  stage: number;
  room: "battle" | "elite";
  /** Threat score per three-action cycle (section 11.3). */
  threat: number;
  /** Bad-designation weight the template can still carry within the budget (good ones weigh 0). */
  headroom: number;
}

const pack = (stage: number, room: PackTemplate["room"], leader: string | null, escorts: string[], threat: number, headroom: number): PackTemplate =>
  ({ leader, escorts, stage, room, threat, headroom });

/** Every template, stage by stage. Stage I elites fight alone; guardians never lead packs. */
export const PACKS: readonly PackTemplate[] = [
  // Stage I: escort duos from the third floor. Duos carry no designation.
  pack(0, "battle", null, ["spark-mite", "spark-mite"], 6, 0),
  pack(0, "battle", null, ["spark-mite", "splicer"], 6.75, 0),
  // Stage II normals: leader + one escort.
  pack(1, "battle", "leech", ["relay-drone"], 10.5, 0),
  pack(1, "battle", "storm", ["splicer"], 10.75, 0),
  pack(1, "battle", "widow", ["ward-node"], 10, 0.5),
  pack(1, "battle", "choir", ["glass-echo"], 9, 1.5),
  pack(1, "battle", "weaver", ["tap-spinner"], 10.5, 0),
  pack(1, "battle", "nest", ["tap-spinner"], 9.5, 1),
  // Stage II elites: every elite leads an escort.
  pack(1, "elite", "marshal", ["glass-echo"], 11.5, 0),
  pack(1, "elite", "widow", ["glass-echo"], 8.5, 2),
  pack(1, "elite", "colossus", ["tap-spinner"], 11.5, 0),
  pack(1, "elite", "foreman", ["tap-spinner"], 11.5, 0),
  // Stage III normals: pairs…
  pack(2, "battle", "serpent", ["splicer"], 10.75, 1.5),
  pack(2, "battle", "moth", ["tap-spinner"], 9.5, 2),
  pack(2, "battle", "widow", ["ward-node"], 10, 2),
  pack(2, "battle", "weaver", ["rigger-drone"], 12, 0.5),
  pack(2, "battle", "choir", ["relay-drone"], 11.25, 1.5),
  pack(2, "battle", "nest", ["tap-spinner"], 10.5, 2),
  pack(2, "battle", "blight", ["ward-node"], 10.5, 2),
  // …and trios (left escort, right escort).
  pack(2, "battle", "choir", ["glass-echo", "glass-echo"], 12, 0.5),
  pack(2, "battle", "serpent", ["splicer", "tap-spinner"], 12.25, 0),
  pack(2, "battle", "moth", ["spark-mite", "tap-spinner"], 12.5, 0),
  pack(2, "battle", "widow", ["ward-node", "glass-echo"], 12.5, 0),
  pack(2, "battle", "weaver", ["rigger-drone", "spark-mite"], 12.5, 0),
  pack(2, "battle", "blight", ["rigger-drone", "glass-echo"], 11.5, 1),
  // Stage III elites: every elite leads an escort and is reinforced (chart permitting).
  pack(2, "elite", "reaver", ["relay-drone"], 14.5, 1.5),
  pack(2, "elite", "colossus", ["ward-node"], 15, 1),
  pack(2, "elite", "sentinel", ["glass-echo"], 14.5, 1.5),
  pack(2, "elite", "foreman", ["rigger-drone"], 13.5, 2),
  pack(2, "elite", "demolition", ["glass-echo"], 14.5, 1.5),
];

/** Escort threat per three-action cycle (1.5 active actions). The Relay Drone's uplink
 * (+1 per leader strike) is already inside each template's score. */
export const ESCORT_THREAT: Record<string, number> = {
  "spark-mite": 3, splicer: 3.75, "relay-drone": 1.5, "ward-node": 3, "tap-spinner": 1.5, "glass-echo": 1.5, "rigger-drone": 2.5,
};

/** The stage's average single-hostile threat by room (section 11.3). Stage I elites never lead packs. */
export const AVERAGE_SINGLE_THREAT: Record<"battle" | "elite", readonly (number | null)[]> = {
  battle: [6.2, 8.1, 9.75],
  elite: [null, 9.0, 12.3],
};

/** Pack budget (× 1.3) or reinforced band (× 1.45) for a stage and room type; Infinity where unpriced. */
export function threatBudget(stage: number, room: "battle" | "elite", reinforced = false): number {
  const average = AVERAGE_SINGLE_THREAT[room][stage];
  return average == null ? Infinity : average * (reinforced ? R.reinforcedThreatBudget : R.threatBudget);
}

/** Composition rules (9.5): an escort at most twice; never two Splicers; a trio never
 * holds a Splicer and a Ward Node together. */
export function compositionAllowed(escorts: readonly string[]): boolean {
  const count = (id: string) => escorts.filter(item => item === id).length;
  if (escorts.some(id => count(id) > 2) || count("splicer") > 1) return false;
  return !(escorts.length >= 2 && escorts.includes("splicer") && escorts.includes("ward-node"));
}

/** Escorts a reinforcement may bring, by stage (section 8.1). */
export const REINFORCEMENT_ESCORTS: readonly (readonly string[])[] = [
  [],
  ["spark-mite", "splicer", "relay-drone"],
  ["splicer", "ward-node", "tap-spinner", "glass-echo", "rigger-drone"],
];

// ---------------------------------------------------------------- signals (section 8.4)

export interface SignalDefinition {
  name: string;
  kind: "good" | "bad";
  /** The exact effect, one line. */
  rule: string;
  /** Turn-2 announcement; `{target}` is replaced by the named band, socket, device or hostile. */
  announce: string;
}

const turns = R.signalFieldTurns;
export const SIGNALS: Record<SignalId, SignalDefinition> = {
  "relay-flicker": {
    name: "RELAY FLICKER", kind: "good",
    rule: `The named band gains a resonance field for ${turns} turns: +${R.resonanceDamage} when your primary route crosses it (it stacks with a cast Resonance Field).`,
    announce: `NEXT TURN: the relays flicker and the {target} band resonates for ${turns} turns, if the fight lasts.`,
  },
  "cold-start": {
    name: "COLD START", kind: "good",
    rule: `A salvage device on the table powers up: it is cabled to its nearest device at no cost and its condition becomes ${R.deviceCondition}. If none stands, one lands at the first legal socket, uncabled.`,
    announce: "NEXT TURN: a cold start powers up {target}, if the fight lasts.",
  },
  resync: {
    name: "RESYNC", kind: "good",
    rule: "The leader's next action is skipped and its counter does not advance. Escorts act as normal.",
    announce: "NEXT TURN: a resync makes {target} skip its next action, if the fight lasts.",
  },
  interference: {
    name: "INTERFERENCE", kind: "bad",
    rule: `The named band is suppressed for ${turns} turns: −${R.suppressionPenalty} when your primary route crosses it. Purge Field clears it.`,
    announce: `NEXT TURN: interference suppresses the {target} band for ${turns} turns, if the fight lasts.`,
  },
  collapse: {
    name: "COLLAPSE", kind: "bad",
    rule: "The named free socket becomes wreckage for the encounter; unarmored cables crossing it fray at once.",
    announce: "NEXT TURN: the floor gives way at {target} and becomes wreckage, if the fight lasts.",
  },
  surge: {
    name: "SURGE", kind: "bad",
    rule: "The leader's escalation advances one level at once.",
    announce: "NEXT TURN: a surge drives {target} one escalation level higher, if the fight lasts.",
  },
};
export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];

export function signalAnnouncement(id: SignalId, target: string): string {
  return SIGNALS[id].announce.replace("{target}", target);
}

// ---------------------------------------------------------------- undelivered messages (section 8.3)

export interface MessageOptionDefinition {
  weight: number;
  name: string;
  rule: string;
}
export const MESSAGE_OPTIONS: Record<MessageOptionId, MessageOptionDefinition> = {
  restore: { weight: 3, name: "Restore", rule: `Restore ${R.messageRestore} integrity now.` },
  reinforce: { weight: 1, name: "Reinforce", rule: `+${R.messageMaxIntegrity} maximum integrity, permanently.` },
  credit: { weight: 3, name: "Credit", rule: `${R.messageCredits} credits (ascension 7 multiplier applies).` },
  recover: { weight: 2, name: "Recover", rule: "A named rare card from the stage pool enters your hand for this encounter only; it exhausts when played." },
  purge: { weight: 2, name: "Purge", rule: "Every junk card leaves your piles for this encounter, and one CVE leaves your deck permanently if you carry one." },
};

/** Reach radius as printed on plates ("2.0"). */
export const REACH_TEXT = REACH;
