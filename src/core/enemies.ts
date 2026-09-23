import type { Enemy } from "./types.ts";
import type { Intent } from "./run.ts";
import { RULES } from "./cards.ts";

const TEMPLATES: Record<string, Omit<Enemy, "hp" | "maxHp" | "turn">> = {
  serpent: { id: "serpent", name: "COIL SERPENT", title: "One route is a perfect snare", color: 0x73c9a3 },
  moth: { id: "moth", name: "ASH MOTH", title: "Cold wings over a living signal", color: 0x91d2e4 },
  marshal: { id: "marshal", name: "NULL MARSHAL", title: "No passage without a firewall", color: 0xa6c5e7 },
  choir: { id: "choir", name: "GLASS CHOIR", title: "Three voices, one broken note", color: 0xcf9fe7 },
  weaver: { id: "weaver", name: "WIRE WEAVER", title: "Every extra thread tightens the trap", color: 0xe3bd70 },
  reaver: { id: "reaver", name: "GRAVE REAVER", title: "Most dangerous when its heart is failing", color: 0xea837b },
  regent: { id: "regent", name: "THE IRON REGENT", title: "Keeper of the copper gates", color: 0x90d2a5 },
  cantor: { id: "cantor", name: "THE HOLLOW CHOIR", title: "The silence behind every voice", color: 0xc6a0ee },
  prophet: { id: "prophet", name: "RUST PROPHET", title: "Corrupts the ground beneath you", color: 0xe49b72 },
  widow: { id: "widow", name: "PRISM WIDOW", title: "Silences your strongest circuit", color: 0xbba0e8 },
  colossus: { id: "colossus", name: "FERRIC COLOSSUS", title: "An iron wall against a single route", color: 0xd9b079 },
  leech: {
    id: "leech",
    name: "PACKET LEECH",
    title: "Feeds on lost traffic",
    color: 0x6ee4d4,
  },
  wraith: {
    id: "wraith",
    name: "CABLE WRAITH",
    title: "Cuts exposed links",
    color: 0xab8cff,
  },
  storm: {
    id: "storm",
    name: "NULL STORM",
    title: "Disrupts active hardware",
    color: 0x87b5ff,
  },
  sentinel: {
    id: "sentinel",
    name: "GATE SENTINEL",
    title: "Tests your trust boundary",
    color: 0xffad79,
  },
  core: {
    id: "core",
    name: "BLACKOUT CORE",
    title: "The source of the signal collapse",
    color: 0xff777e,
  },
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
      { kind: "jam", label: "BIND HARDWARE", amount: 0 },
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
      { kind: "infect", label: "SIPHON TAP", amount: 0 },
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
  };

const TRAITS: Record<string, string> = {
  serpent: `Coil Serpent strikes deal +${RULES.serpentBonus} while you have only one channel. A second route that shares no device loosens its grip. Its venom leaves corrosion.`,
  moth: "Ash Moth suppresses your busiest routed band, then jams and suppresses its announced band together. Protect hardware or move it before the jam. New fields start next turn.",
  marshal: "Null Marshal absorbs 3 packet damage unless a firewall is online. Its Lockdown jams an online firewall first — keep a second firewall, a Faraday Shell or a honeypot ready.",
  choir: "Glass Choir alternates suppression and corrosion, and one refrain injects 2 Packet Loss into your draw pile. Cleanse or relocate before transmitting.",
  weaver: `Wire Weaver cuts a cable and suppresses a routed band together. ${RULES.weaverCables} or more cables add +${RULES.weaverBonus} strike damage. Armor key cables and keep a compact route.`,
  reaver: "Grave Reaver breaches and seeds corrosion together. At half health: +2 strike and breach damage. New fields start next turn; cleanse, move or plan a finishing burst.",
  regent: `Iron Regent's armor absorbs ${RULES.gradedArmorBase}, minus ${RULES.gradedArmorPerChannel} for every channel beyond the first. Gate closure cuts a cable and seeds corrosion. At half health: +2 strike/breach damage and 1 alongside faults and fields.`,
  cantor: "Hollow Choir absorbs 2 damage unless a firewall is online. Its jams suppress a band and inject Packet Loss; breaches seed corrosion. At half health: +2 breach damage and 1 alongside fields and jams.",
  prophet: `Rust Prophet corrupts the busiest band for 2 turns. Hardware in that band adds ${RULES.corrosionDamage} incoming damage. Cleanse the field or relocate to clear ground.`,
  widow: `Prism Widow suppresses a band on your primary route for 2 turns: routes through it lose ${RULES.suppressionPenalty}. Cleanse it or reroute through another band.`,
  colossus: `Ferric Colossus armor absorbs ${RULES.gradedArmorBase}, minus ${RULES.gradedArmorPerChannel} for every channel beyond the first — build width or hit hard. It also scorches occupied ground with corrosion.`,
  leech: `Packet Leech plants a siphon tap (malware: −${RULES.malwarePenalty} damage) and heals ${RULES.leechTapHeal} per malware after it acts. A transmission that deals no damage lets it recover ${RULES.leechHeal}. Scrub taps for ${RULES.scrubCost} energy.`,
  wraith: `Cable Wraith cuts the longest unarmored cable — it ignores honeypots. A target longer than ${RULES.cableExposureLength} units also deals 1 damage.`,
  storm: "Null Storm jams only its announced band. Keep critical hardware outside it or protect it from jams.",
  sentinel: "Gate Sentinel plating absorbs 2 packet damage unless a firewall is online.",
  core: "Blackout Core cuts with corrosion and injects a Worm, jams with suppression. At half health: +2 strike/breach damage, jam and cut deal 1 damage, and its jam also plants malware.",
};

export interface EnemyDefinition extends Omit<Enemy, "hp" | "maxHp" | "turn"> {
  pattern: Omit<Intent, "pressure">[];
  trait: string;
  badge: string;
  art: { file: string; columns: number; rows: number; index: number };
  /** "channels": graded, absorbs amount − perChannel × (channels − 1). "firewall": bypassed by any online firewall. */
  armor?: { amount: number; bypass: "channels" | "firewall"; perChannel?: number };
  /** Its jam prefers an online firewall (after honeypots). */
  jamsFirewalls?: boolean;
  /** When enraged, its jam also plants malware. */
  enragedInfect?: boolean;
  corruption?: "corrosion" | "suppression" | "alternating";
  jamBands?: boolean;
  enrages?: { attacks: number; faults: number };
  boss?: { entrance: string; warning: string; breakDamage: number };
}

const properties: Record<string, Partial<EnemyDefinition>> = {
  leech: { badge: "SIPHON TAP" }, wraith: { badge: "CABLE HUNTER" },
  storm: { badge: "BAND SUPPRESSION", jamBands: true },
  sentinel: { badge: "ARMORED GATE", armor: { amount: 2, bypass: "firewall" } },
  prophet: { badge: "CORROSION", corruption: "corrosion" },
  widow: { badge: "NULL WEAVER", corruption: "suppression" },
  colossus: { badge: "FERRIC ARMOR", armor: { amount: RULES.gradedArmorBase, bypass: "channels", perChannel: RULES.gradedArmorPerChannel }, corruption: "corrosion" },
  serpent: { badge: "COIL PRESSURE", corruption: "corrosion" },
  moth: { badge: "ASHEN WINGS", corruption: "suppression", jamBands: true },
  marshal: { badge: "COUNTERWEIGHT", armor: { amount: 3, bypass: "firewall" }, jamsFirewalls: true },
  choir: { badge: "DISSONANCE", corruption: "alternating" },
  weaver: { badge: "TENSION TRAP" },
  reaver: { badge: "BLOOD PRICE", corruption: "corrosion", enrages: { attacks: 2, faults: 0 } },
  regent: {
    badge: "SOVEREIGN ARMOR", armor: { amount: RULES.gradedArmorBase, bypass: "channels", perChannel: RULES.gradedArmorPerChannel }, corruption: "corrosion", enrages: { attacks: 2, faults: 1 },
    boss: { entrance: "The copper gates close. Their keeper rises.", warning: "Every extra channel strips 2 of its armor. After the crown rises, deal 12 damage in one transmission to interrupt Crownfall. At half health, its attacks grow stronger.", breakDamage: 12 },
  },
  cantor: {
    badge: "THE FINAL REFRAIN", armor: { amount: 2, bypass: "firewall" }, corruption: "alternating", enrages: { attacks: 2, faults: 1 },
    boss: { entrance: "Every bell falls silent. One voice remains.", warning: "Keep a firewall online. When the Choir draws its last breath, prepare 15 damage for the next transmission to interrupt Requiem.", breakDamage: 15 },
  },
  core: {
    badge: "QUARANTINE", enrages: { attacks: 2, faults: 1 }, enragedInfect: true,
    boss: { entrance: "At the heart of the Blackout, the last light opens its eye.", warning: "At half health, the Core enters emergency mode. Event Horizon warns of Total Blackout: deal 18 damage on the following transmission to interrupt it, or build enough shield to survive.", breakDamage: 18 },
  },
};

function artFor(id: string): EnemyDefinition["art"] {
  for (const [file, ids, columns, rows] of [
    ["hostiles-expedition", ["serpent", "moth", "marshal", "choir", "weaver", "reaver"], 3, 2],
    ["stage-guardians", ["regent", "cantor"], 2, 1],
    ["hostiles-zones", ["prophet", "widow", "colossus"], 3, 1],
    ["hostiles-alpha", ["wraith", "storm"], 2, 1],
    ["hostiles", ["leech", "sentinel", "core"], 3, 1],
  ] as const) {
    const index = (ids as readonly string[]).indexOf(id);
    if (index >= 0) return { file, columns, rows, index };
  }
  throw new Error(`Missing enemy artwork: ${id}`);
}

export const ENEMIES: Record<string, EnemyDefinition> = Object.fromEntries(
  Object.entries(TEMPLATES).map(([id, template]) => [id, {
    ...template, pattern: PATTERNS[id], trait: TRAITS[id], badge: "HOSTILE", art: artFor(id), ...properties[id],
  }]),
);
