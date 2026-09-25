/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** FAULTLINE v5 · the design document's generated blocks, read from the live data.
 *
 * Usage, from the repository root:
 *   npm run tables --            # print every block
 *   npm run tables -- --write    # splice them into docs/game-design.md
 *   npm run tables -- --check    # exit 1 when the document drifted
 *   options: --root=<checkout> (default: the working directory), --doc=<file> (default docs/game-design.md)
 *
 * Every block sits between `<!-- generated:NAME -->` and `<!-- /generated:NAME -->` in the document, so
 * a tuning pass regenerates the numbers and nothing typed by hand can drift from CARDS, RELICS, RULES
 * or the ascension table. Build paths come from src/tutorial/paths.ts (the Handbook reads the same). */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const root = resolve(option("root") ?? process.cwd());
const docPath = resolve(root, option("doc") ?? "docs/game-design.md");
const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);

const cards = await load("src/core/cards.ts");
const types = await load("src/core/types.ts");
const ascension = await load("src/core/ascension.ts");
const expedition = await load("src/core/expedition.ts");
const run = await load("src/core/run.ts");
const meta = await load("src/core/meta.ts");
const paths = await load("src/tutorial/paths.ts");

type Card = {
  id: string; base: string; name: string; rules: string; detail?: string; cost: number; rarity: string; target: string;
  role?: string; protocol?: string; archetype?: string; exhaust?: boolean; retain?: boolean; innate?: boolean; volatile?: boolean;
  token?: boolean; curse?: boolean; junk?: boolean; unplayable?: boolean; values: Record<string, number>;
};
const CARDS = cards.CARDS as Record<string, Card>;
const RULES = cards.RULES as Record<string, unknown>;
const RELICS = cards.RELICS as Record<string, { name: string; subtitle: string; rules: string; tier: string }>;
const ENERGY_RELICS = cards.ENERGY_RELICS as string[];
const BASE_CARD_IDS = cards.BASE_CARD_IDS as string[];
const STARTER_DECK = cards.STARTER_DECK as string[];
const STARTER_SIGNATURES = cards.STARTER_SIGNATURES as Record<string, string[]>;
const CARD_IDS_BY_OWNER = types.CARD_IDS_BY_OWNER as Record<string, string[]>;
const ASCENSION_LEVELS = ascension.ASCENSION_LEVELS as { level: number; name: string; rule: string }[];
const ASCENSION_RULES = ascension.ASCENSION_RULES as Record<string, number>;
const ARCHETYPES = expedition.ARCHETYPES as Record<string, { name: string; title: string; relic: string; console: string; integrity: number }>;
const CONSOLES = run.CONSOLES as Record<string, { name: string; cost: number; rules: string }>;
const BUILD_PATHS = paths.BUILD_PATHS as Record<string, { id: string; name: string; idea: string; play: string; cards: string[]; partners: string[] }[]>;
const KEEPERS = ["architect", "warden", "ghost"] as const;
const RARITY_ORDER = ["basic", "common", "uncommon", "rare", "legendary", "special"];

const cell = (text: string | number) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
const row = (cells: (string | number)[]) => `| ${cells.map(cell).join(" | ")} |`;
function table(head: string[], rows: (string | number)[][], align: ("l" | "r")[] = []) {
  const rule = head.map((_, i) => (align[i] === "r" ? "---:" : "---"));
  return [row(head), `| ${rule.join(" | ")} |`, ...rows.map(row)].join("\n");
}
const plus = (id: string): Card | undefined => CARDS[`${id}+`];
const counted = (ids: string[]) => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${CARDS[id]?.name ?? id}${n > 1 ? ` ×${n}` : ""}`).join(", ");
};
/** "ground · router", "protocol · strike", "link". */
function targetOf(card: Card) {
  if (card.target === "ground" && card.role) return `ground · ${card.role}`;
  if (card.target === "protocol" && card.protocol) return `protocol · ${card.protocol === "sever" ? "cut" : card.protocol}`;
  return card.target;
}
/** The upgrade as the design reads it: the cost change and, when the face changes, the + face. */
function upgradeOf(card: Card) {
  const up = plus(card.id);
  if (!up) return "—";
  const parts: string[] = [];
  if (up.cost !== card.cost) parts.push(`cost ${card.cost} → ${up.cost}`);
  if (up.rules !== card.rules) parts.push(up.rules);
  return parts.join(" · ") || "no change";
}
const sortCards = (ids: string[]) => [...ids].sort((a, b) =>
  RARITY_ORDER.indexOf(CARDS[a].rarity) - RARITY_ORDER.indexOf(CARDS[b].rarity) || CARDS[a].name.localeCompare(CARDS[b].name));
const cardRows = (ids: string[]) => ids.map(id => {
  const card = CARDS[id];
  return [card.name, card.cost, card.rarity, targetOf(card), card.rules, upgradeOf(card)];
});
const CARD_HEAD = ["Card", "Cost", "Rarity", "Target", "Face", "Upgrade (+)"];
const CARD_ALIGN: ("l" | "r")[] = ["l", "r"];
/** Edge cases shown on inspect (`detail`), one line per card that has any. */
function details(ids: string[]) {
  const lines = ids.flatMap(id => {
    const card = CARDS[id], up = plus(id);
    if (!card.detail && !up?.detail) return [];
    const extra = up?.detail && up.detail !== card.detail ? ` (+: ${up.detail})` : "";
    return [`- **${card.name}**: ${card.detail ?? ""}${extra}`];
  });
  return lines.length ? `\n\nEdge cases (\`detail\`, shown when the card is inspected):\n\n${lines.join("\n")}` : "";
}

const blocks: Record<string, () => string> = {
  counts() {
    const owner = (key: string) => BASE_CARD_IDS.filter(id => CARD_IDS_BY_OWNER[key].includes(id));
    const curses = owner("curses").filter(id => CARDS[id].curse), junk = owner("curses").filter(id => CARDS[id].junk && !CARDS[id].curse);
    const keeper = KEEPERS.map(k => owner(k).length);
    const tokens = BASE_CARD_IDS.filter(id => CARDS[id].token);
    const upgradable = BASE_CARD_IDS.filter(id => plus(id)).length;
    const pool = (cards.REWARD_POOL as string[]).length;
    return `**${BASE_CARD_IDS.length} cards**: ${owner("colorless").length} colorless, ${keeper.join(" / ")} for the Architect / Warden / Ghost (the Ghost's count includes the ${tokens.map(id => CARDS[id].name).join(", ")} token), ${curses.length} curses and ${junk.length} junk cards. ${upgradable} have an upgraded \`+\` version (every card but curses and junk). ${pool} can be offered as rewards (never basics, curses, junk or tokens; keeper cards only to their keeper).`;
  },
  rules() {
    const v = (key: string) => {
      const value = RULES[key];
      return Array.isArray(value) ? `[${value.join(", ")}]` : typeof value === "object" ? JSON.stringify(value).replace(/"/g, "").replace(/,/g, ", ").replace(/:/g, ": ") : String(value);
    };
    const keys: [string, string][] = [
      ["baseEnergy", "Energy every turn before relics"],
      ["relicEnergyCap", "Energy relics raise the turn base, never above this"],
      ["handDraw", "Cards drawn every turn"],
      ["handLimit", "Most cards in hand"],
      ["deckFloor", "Removal keeps at least this many cards (curses can always go)"],
      ["keeperShare", "A reward slot draws from the keeper pool at this share, else colorless"],
      ["rewardRarity", "[common, uncommon, rare] per reward kind"],
      ["legendaryShare", "Share of rare rolls that become legendary"],
      ["upgradedOfferRate", "Share of offered cards that arrive upgraded, per stage"],
      ["normalHealth", "Normal room: [base, per floor, per stage], floors and stages zero-based"],
      ["eliteHealth", "Elite room: [base, per floor, per stage]"],
      ["guardianHealth", "Guardian per stage"],
      ["eventHealthScale", "Signal in the Static: × a normal room"],
      ["payloadDamage", "Payload token: damage this turn"],
      ["maxProtocols", "Protocol slots (Policy Engine adds more)"],
      ["bufferMultiplier", "Buffer console: stored × this (Deep Queue raises it)"],
      ["backpressureRatio", "Backpressure relic: share of prevented damage stored (Flow Control raises it)"],
      ["hardenShield", "Harden console: block before its bonuses"],
      ["hardenPerFirewall", "Harden: block per online firewall"],
      ["hardenPerHostile", "Harden: block per hostile beyond the first (the v4 pack addition)"],
      ["hardenPerAdd", "Harden: block per living guardian add (the v4 pack addition)"],
    ];
    return table(["`RULES` key", "Value", "Meaning"], keys.map(([key, meaning]) => [`\`${key}\``, v(key), meaning]));
  },
  health() {
    const [nb, nf, ns] = RULES.normalHealth as number[];
    const [eb, ef, es] = RULES.eliteHealth as number[];
    const guardians = RULES.guardianHealth as number[];
    const scale = RULES.eventHealthScale as number;
    const rows = [0, 1, 2].map(stage => [
      ["I", "II", "III"][stage],
      [0, 1, 2, 3, 4].map(floor => nb + nf * floor + ns * stage).join(" / "),
      [3, 5].map(floor => eb + ef * floor + es * stage).join(" / "),
      guardians[stage],
      [1, 4].map(floor => Math.round((nb + nf * floor + ns * stage) * scale)).join(" / "),
    ]);
    return table(["Stage", "Normal, floors 1–5", "Elite, floors 4 / 6", "Guardian", "Signal in the Static, floors 2 / 5"], rows);
  },
  starters() {
    const rows = KEEPERS.map(k => {
      const a = ARCHETYPES[k];
      return [a.name.replace(/^The /, ""), a.integrity, RELICS[a.relic].name, `${CONSOLES[a.console].name} (${CONSOLES[a.console].cost})`, counted(STARTER_SIGNATURES[k])];
    });
    return `The shared ten: ${counted(STARTER_DECK)}.\n\n${table(["Keeper", "Integrity", "Starter relic", "Console (cost)", "Signature cards"], rows, ["l", "r"])}`;
  },
  ...Object.fromEntries(KEEPERS.map(k => [k, () => {
    const owned = BASE_CARD_IDS.filter(id => CARDS[id].archetype === k);
    const placed = BUILD_PATHS[k].flatMap(path => path.cards);
    const loose = owned.filter(id => !placed.includes(id));
    const sections = BUILD_PATHS[k].map(path => {
      const ids = sortCards(path.cards.filter(id => CARDS[id]));
      const partners = path.partners.filter(id => CARDS[id]).map(id => `${CARDS[id].name} (${CARDS[id].cost})`).join(", ");
      return `##### ${path.name}\n\n${path.idea} ${path.play}\n\n${table(CARD_HEAD, cardRows(ids), CARD_ALIGN)}\n\nColorless partners: ${partners}.${details(ids)}`;
    });
    if (loose.length) sections.push(`##### Other\n\n${table(CARD_HEAD, cardRows(sortCards(loose)), CARD_ALIGN)}${details(loose)}`);
    return sections.join("\n\n");
  }])),
  colorless() {
    const ids = sortCards(BASE_CARD_IDS.filter(id => CARD_IDS_BY_OWNER.colorless.includes(id)));
    return `${table(CARD_HEAD, cardRows(ids), CARD_ALIGN)}\n${details(ids)}`;
  },
  curses() {
    const ids = BASE_CARD_IDS.filter(id => CARD_IDS_BY_OWNER.curses.includes(id));
    const kind = (card: Card) => (card.curse ? "curse" : "junk");
    const flags = (card: Card) => [card.unplayable && "unplayable", card.innate && "innate", card.volatile && "volatile"].filter(Boolean).join(", ") || "—";
    const rows = [...ids].sort((a, b) => kind(CARDS[a]).localeCompare(kind(CARDS[b]))).map(id => {
      const card = CARDS[id];
      return [card.name, kind(card), card.cost, flags(card), card.rules, card.detail ?? ""];
    });
    return table(["Card", "Kind", "Cost", "Flags", "Face", "Detail (inspect)"], rows, ["l", "l", "r"]);
  },
  protocols() {
    const ids = BASE_CARD_IDS.filter(id => CARDS[id].target === "protocol");
    const owner = (card: Card) => (card.archetype ? card.archetype[0].toUpperCase() + card.archetype.slice(1) : "Colorless");
    return table(["Protocol", "Card", "Cost", "Rarity", "Trigger", "Face", "Upgrade (+)"],
      ids.map(id => { const card = CARDS[id]; return [card.name, owner(card), card.cost, card.rarity, card.protocol === "sever" ? "cut" : card.protocol ?? "", card.rules, upgradeOf(card)]; }),
      ["l", "l", "r"]);
  },
  daemons() {
    const ids = BASE_CARD_IDS.filter(id => CARDS[id].target === "daemon");
    const owner = (card: Card) => (card.archetype ? card.archetype[0].toUpperCase() + card.archetype.slice(1) : "Colorless");
    return table(["Daemon", "Card", "Cost", "Rarity", "Face", "Upgrade (+)"],
      ids.map(id => { const card = CARDS[id]; return [card.name, owner(card), card.cost, card.rarity, card.rules, upgradeOf(card)]; }),
      ["l", "l", "r"]);
  },
  tokens() {
    const ids = BASE_CARD_IDS.filter(id => CARDS[id].token);
    return `${table(CARD_HEAD, cardRows(ids), CARD_ALIGN)}\n${details(ids)}`;
  },
  relics() {
    const tiers = ["starter", "common", "boss"];
    const ids = Object.keys(RELICS).sort((a, b) => tiers.indexOf(RELICS[a].tier) - tiers.indexOf(RELICS[b].tier) || RELICS[a].name.localeCompare(RELICS[b].name));
    return table(["Relic", "Tier", "Energy base", "Rule"], ids.map(id => [RELICS[id].name, RELICS[id].tier, ENERGY_RELICS.includes(id) ? "+1" : "", RELICS[id].rules]));
  },
  ascension() {
    const named = (level: number) => Object.entries(ASCENSION_RULES).filter(([, at]) => at === level).map(([key]) => `\`${key}\``).join(", ");
    const levels = table(["Level", "Name", "Rules", "Named rules (`ASCENSION_RULES`)"], ASCENSION_LEVELS.map(l => [l.level, l.name, l.rule, named(l.level)]), ["r"]);
    // The riders the level texts read (RULES keys, read live; ascension.ts builds the texts from them).
    const riders: [string, string, string][] = [
      ["ascensionNormalHealth", "1", "Normal hostiles' integrity multiple"],
      ["ascensionEliteHealth", "1", "Elites' integrity multiple"],
      ["ascensionRepair", "2", "Sanctuary repair multiple"],
      ["ascensionPrices", "2", "Market price multiple"],
      ["ascensionCredits", "2", "Credits earned multiple (crates and messages included)"],
      ["ascensionAttackBonus", "3", "Extra damage on hostile strikes and breaches"],
      ["ascensionAttackFromStage", "3", "…from this zero-based stage on"],
      ["ascensionAttackRoles", "3", "…for every hostile (0) or leaders, singles and guardians only (1)"],
      ["ascensionFieldTurns", "3", "Hostile fields last this many turns more"],
      ["packRateAscensionBonus", "3", "Added to every stage's pack rate"],
      ["eliteSecondDesignation", "3", "Chance an elite carries a second designation"],
      ["ascensionInstallationIntegrity", "3", "Extra integrity every installation arrives with"],
      ["ascensionGuardianHealth", "4", "Guardians' integrity multiple"],
      ["ascensionAddHealth", "4", "Guardian adds' integrity multiple"],
      ["ascensionUltimateBonus", "4", "Extra damage on guardian ultimates"],
      ["ascensionEnrageThreshold", "4", "Share of integrity at which guardians enrage"],
      ["addBreakBonusLate", "4", "Break threshold per living add (instead of `addBreakBonus`)"],
      ["ascensionRiderWear", "4", "Wear Close the Gates and Stolen Voice add"],
      ["ascensionChargeBreaker", "4", "Breaker Charges a guardian's charge plants beside your primary router"],
      ["normalSecondDesignation", "4", "Share of a normal room's designation chance that rolls a second"],
      ["ascensionIntegrityLoss", "4", "Maximum integrity lost at the start"],
    ];
    const present = riders.filter(([key]) => key in RULES);
    return `${levels}\n\n${table(["`RULES` key", "Level", "Value", "Meaning"], present.map(([key, level, meaning]) => [`\`${key}\``, level, String(RULES[key]), meaning]), ["l", "r", "r"])}`;
  },
  market() {
    const prices = meta.CARD_PRICES as Record<string, number>;
    return `Card prices: ${Object.entries(prices).map(([rarity, price]) => `${rarity} ${price}`).join(", ")} (\`CARD_PRICES\`), each with a seeded −5 / 0 / +5; a pre-upgraded card costs +${meta.UPGRADED_PREMIUM}. Relics ${meta.RELIC_PRICE.min}–${meta.RELIC_PRICE.max} in steps of 5. Removal ${meta.REMOVE_PRICE.base}, +${meta.REMOVE_PRICE.step} for every earlier market removal. Upgrade ${meta.UPGRADE_PRICE}. The bench's Core Router ${meta.ROUTER_PRICE}.`;
  },
};

const generated = (name: string) => `<!-- generated:${name} -->\n${blocks[name]()}\n<!-- /generated:${name} -->`;
if (args.includes("--write") || args.includes("--check")) {
  const before = readFileSync(docPath, "utf8");
  const missing: string[] = [];
  let after = before;
  for (const name of Object.keys(blocks)) {
    const pattern = new RegExp(`<!-- generated:${name} -->[\\s\\S]*?<!-- /generated:${name} -->`);
    if (!pattern.test(after)) { missing.push(name); continue; }
    after = after.replace(pattern, () => generated(name));
  }
  if (missing.length) console.error(`No marker in ${docPath} for: ${missing.join(", ")}`);
  if (args.includes("--check")) {
    console.log(after === before ? "The generated blocks match the data." : "The generated blocks drifted: run with --write.");
    process.exit(after === before && !missing.length ? 0 : 1);
  }
  writeFileSync(docPath, after);
  console.log(`Wrote ${Object.keys(blocks).length - missing.length} blocks into ${docPath}.`);
} else {
  const only = args.filter(arg => !arg.startsWith("--"));
  for (const name of only.length ? only : Object.keys(blocks)) console.log(`${generated(name)}\n`);
}
