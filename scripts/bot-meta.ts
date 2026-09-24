/** Seeded, transparent decisions for everything between fights: route choice,
 * rewards, relics, sanctuaries, markets and events. A regression probe for the
 * balance harness, not an optimal player. Combat turns live in bot.ts.
 * v5: reward priorities per keeper and per build path (contract section 9; `--path=` in the
 * probe), the energy boss relics weighed with their drawbacks, curses removed first and the
 * starter's Packet Bursts and Guards trimmed StS-style, upgrades that lower a cost first, and
 * events answered by the choice's label (not its position). */
import { reachableRooms } from "../src/core/map.ts";
import {
  chooseRoom, chooseCardReward, chooseRelic, chooseForge, leaveForge, upgradeDeckCard, removeDeckCard,
  buyCard, buyRelic, shopRemoveCard, shopUpgradeCard, leaveShop, eventView, chooseEvent,
  leaveEvent, eventCardChoices, repairAmount, relicPool, upgradableIndices, removableIndices,
  SALVAGE_COST, SALVAGE_MIN_INTEGRITY,
} from "../src/core/meta.ts";
import { CARDS, baseCard, upgraded } from "../src/core/cards.ts";
import type { Archetype, BaseCardId, CardId, MapRoom, RelicId, RunState } from "../src/core/types.ts";

export interface MetaOptions {
  /** Seek elites on the map. */
  elite?: boolean;
  /** Card priorities, best first (base ids). Overrides the archetype default. */
  priorities?: CardId[];
  relicPriorities?: RelicId[];
  /** Never accept Containerlab or Clabernetes. */
  noSignature?: boolean;
  /** Probe experiments: never take these cards (base ids) from rewards, markets or events. */
  ban?: string[];
}

/** Build paths (contract section 9): each keeper's three, their cards and colorless partners,
 * best first. `power` favours the energy devices (the §11 energy-device measure). */
export const PATHS: Record<string, { keeper: Archetype | null; cards: BaseCardId[] }> = {
  mesh: { keeper: "architect", cards: ["fabric-controller", "spine-leaf", "ecmp", "standby-router", "mirror", "patch-panel", "load-balancer", "mesh-weave", "flood-fill", "peering-session", "redundant-paths", "linux-bridge", "crosslink", "duplex"] },
  backbone: { keeper: "architect", cards: ["carrier-grade", "line-rate", "deep-buffers", "splice", "trunk-line", "traceroute", "compression", "firmware", "wireshark"] },
  deployment: { keeper: "architect", cards: ["zero-touch", "datacenter", "provisioning-script", "rack-and-stack", "blueprint", "rapid-redeploy", "poe-injector", "cache-server", "containerlab", "rebuild", "clabernetes", "linux-bridge"] },
  fortress: { keeper: "warden", cards: ["persistent-state", "flow-control", "reflect", "entrench", "hardening-guide", "brace", "stand-firm", "pushback", "double-shift", "vent", "barrier", "aegis-field", "null-field", "quorum"] },
  firewall: { keeper: "warden", cards: ["defense-in-depth", "bastion", "stateful-firewall", "perimeter", "sentry-firewall", "acl-gate", "bulkhead", "firewall", "hardened-router", "server-rack", "duplex"] },
  protocols: { keeper: "warden", cards: ["null-route", "tripwire", "incident-response", "policy-engine", "rearm", "ips-signature", "rate-limiter", "port-security"] },
  buffer: { keeper: "ghost", cards: ["deep-queue", "replay-attack", "exfiltrate", "trickle", "flush", "spearhead", "jitter-buffer", "hold-queue", "diagnostic", "inspect", "traffic-shaping", "zero-day"] },
  evasion: { keeper: "ghost", cards: ["obfuscation", "ghost-protocol", "decoy-swarm", "spoof", "phantom-node", "dark-fiber", "armored-fiber", "shield", "failover-policy", "crosslink"] },
  payloads: { keeper: "ghost", cards: ["man-in-the-middle", "fork-bomb", "botnet", "exploit-kit", "side-channel", "shell-access", "cover-tracks", "ping", "hotfix", "crosslink", "inspect", "firmware-update"] },
  power: { keeper: null, cards: ["poe-injector", "cache-server", "load-balancer", "surge", "capacitor"] },
};
/** Colorless cards worth taking for any keeper, best first. */
const SHARED: BaseCardId[] = [
  "rebuild", "containerlab", "poe-injector", "zero-day", "surge", "barrier", "cache-server", "load-balancer", "packet-storm",
  "hardened-router", "diagnostic", "failover-policy", "rate-limiter", "ips-signature", "firmware", "compression",
  "startup-config", "wireshark", "traffic-shaping", "broadcast-storm", "inspect", "quorum", "duplex", "armored-fiber",
  "relay", "linux-bridge", "vxlan", "conduit", "reroute", "capacitor", "emergency", "keepalive", "ping", "crosslink",
  "honeypot", "shield", "aegis-field", "null-field", "resonance-field", "field-repair", "firmware-update", "rollback", "hotfix",
];
const KEEPER_PATHS: Record<Archetype, string[]> = {
  architect: ["mesh", "backbone", "deployment"],
  warden: ["fortress", "firewall", "protocols"],
  ghost: ["buffer", "evasion", "payloads"],
};
const unique = <T>(items: T[]) => [...new Set(items)];
/** A keeper's default list: the top of each of its paths interleaved, the shared colorless top,
 * then everything else of its paths and the shared list. */
/** Colorless cards a keeper's plan barely uses (one channel, no width): left to the rarity fallback. */
const SKIP: Record<Archetype, BaseCardId[]> = {
  architect: [],
  warden: ["load-balancer", "cache-server", "conduit", "vxlan"],
  ghost: ["load-balancer", "cache-server", "conduit", "vxlan"],
};
/** A generalist's keeper picks, best first (from the path probes' card records: the cards the
 * winning runs held, with the build-arounds first). */
const KEEPER_FIRST: Record<Archetype, BaseCardId[]> = {
  architect: ["provisioning-script", "zero-touch", "carrier-grade", "spine-leaf", "fabric-controller", "peering-session", "patch-panel",
    "standby-router", "datacenter", "splice", "traceroute", "trunk-line", "line-rate", "blueprint", "ecmp", "deep-buffers", "mirror",
    "rack-and-stack", "redundant-paths", "rapid-redeploy", "mesh-weave", "flood-fill"],
  warden: ["persistent-state", "flow-control", "hardening-guide", "reflect", "null-route", "bastion", "brace", "stand-firm", "pushback",
    "double-shift", "entrench", "defense-in-depth", "incident-response", "stateful-firewall", "vent", "acl-gate", "policy-engine",
    "perimeter", "sentry-firewall", "tripwire", "rearm", "bulkhead"],
  ghost: ["ghost-protocol", "deep-queue", "replay-attack", "trickle", "spoof", "side-channel", "obfuscation", "exploit-kit",
    "man-in-the-middle", "hold-queue", "shell-access", "exfiltrate", "decoy-swarm", "botnet", "jitter-buffer", "flush", "fork-bomb",
    "phantom-node", "spearhead", "cover-tracks"],
};
function defaultList(keeper: Archetype): CardId[] {
  const shared = SHARED.filter(id => !SKIP[keeper].includes(id));
  const paths = KEEPER_PATHS[keeper].flatMap(path => PATHS[path].cards);
  return unique([...shared.slice(0, 6), ...KEEPER_FIRST[keeper], ...shared, ...paths]) as CardId[];
}
export const DEFAULT_PRIORITIES: Record<Archetype, CardId[]> = {
  architect: defaultList("architect"),
  warden: defaultList("warden"),
  ghost: defaultList("ghost"),
};
/** Reward priorities: the path's cards first (then the keeper's default), or the default. */
export function cardPriorities(keeper: Archetype, path?: string): CardId[] {
  const chosen = path ? PATHS[path] : undefined;
  if (!chosen) return DEFAULT_PRIORITIES[keeper];
  return unique([...chosen.cards, ...DEFAULT_PRIORITIES[keeper]]) as CardId[];
}

/** Relics, best first. Boss relics (they are never offered beside commons): the energy relics lead,
 * ordered by what their drawback costs a bot (Air Gap's smaller rewards least, Overvolt's
 * Backdoors most); keeper-specific exclusions in relicScore. */
const RELIC_ORDER: RelicId[] = [
  "air-gap", "storm-control", "legacy-mainframe", "jumbo-frames", "overvolt", "anycast",
  "sdn-controller", "bgp-hijack", "spanning-tree", "scorched-earth", "zero-trust",
  "cold-start", "reserve-cell", "grounded-core", "ingress-filter", "repair-drone", "shield-array", "watchdog",
  "priority-queue", "parallel-core", "fanout", "packet-lens", "round-robin", "field-engineer", "reinforced-frame",
  "honeynet", "spare-parts", "credit-line", "bill-of-lading",
];
/** Cards worth thinning once better cards arrive, worst first (curses always go first). */
const TRIM: BaseCardId[] = ["pulse", "guard", "patch", "inspect", "purge-field", "resonance-field", "ping", "hotfix", "fiber"];

function priorities(run: RunState, options: MetaOptions): CardId[] {
  return options.priorities ?? DEFAULT_PRIORITIES[run.archetype];
}

/** Lower is better. Cards outside the list are judged by rarity. */
function cardScore(run: RunState, id: CardId, options: MetaOptions): number {
  const base = baseCard(id);
  if (options.noSignature && ["containerlab", "clabernetes"].includes(base)) return 999;
  if (options.ban?.includes(base)) return 999;
  const card = CARDS[id];
  if (card.junk || card.curse) return 999;
  const list = priorities(run, options);
  const index = list.indexOf(base);
  const upgradedBonus = id.endsWith("+") ? -3 : 0;
  if (index >= 0) return index + upgradedBonus;
  return ({ legendary: 25, rare: 30, uncommon: 45, common: 60 } as Record<string, number>)[card.rarity] ?? 90;
}
/** Upgrades: the best cards first, a cost cut counts double. */
function upgradeScore(run: RunState, id: CardId, options: MetaOptions): number {
  const cut = CARDS[id].cost - CARDS[upgraded(id)].cost;
  return Math.min(cardScore(run, id, options), 40) - 12 * cut;
}

function relicScore(id: RelicId, options: MetaOptions, run: RunState): number {
  if (id === "anycast" && (run.archetype === "warden" || run.deck.some(card => CARDS[card].role === "firewall"))) return 999;
  if (id === "spanning-tree" && run.archetype === "architect") return 999;
  if (id === "zero-trust" && run.archetype !== "warden") return 500;
  if (id === "sdn-controller" && run.archetype === "ghost") return 500;
  // Jumbo Frames' lost draw costs the Architect's cable-hungry turns most (probe: 28 % of runs with it won).
  if (id === "jumbo-frames" && run.archetype === "architect") return 8;
  const list = options.relicPriorities ?? RELIC_ORDER;
  const index = list.indexOf(id);
  const keeperBonus = run.archetype === "architect" && ["parallel-core", "fanout", "packet-lens"].includes(id) ? -8 : 0;
  return index < 0 ? 100 : index + keeperBonus;
}

function trimScore(run: RunState, index: number): number {
  const id = run.deck[index];
  const base = baseCard(id);
  if (CARDS[id].curse) return -100;
  const cables = run.deck.filter(card => CARDS[card].target === "link").length;
  if (base === "fiber" && cables <= 4) return 50;
  const order = TRIM.indexOf(base);
  return order < 0 ? 100 : order + (id.endsWith("+") ? 20 : 0);
}
/** A card worth removing (a curse, or a trimmable card while the deck is big enough). */
const trimmable = (run: RunState) => removableIndices(run).filter(i => trimScore(run, i) < 50);

const best = <T>(items: T[], score: (item: T) => number) =>
  [...items].sort((a, b) => score(a) - score(b))[0];

function roomScore(run: RunState, room: MapRoom, policy: string, options: MetaOptions): number {
  const health = run.integrity / run.maxIntegrity;
  switch (room.type) {
    case "elite": return options.elite ? 8 : policy === "tactical" && health >= 0.8 && !run.relics.includes("overvolt") ? 4 : 1;
    case "forge": return health < 0.7 ? 7 : 3;
    case "shop": return run.credits >= 70 ? 6 : 2;
    case "cache": return 5;
    case "event": return 4;
    case "battle": return 3;
    default: return 0;
  }
}

function pickCard(run: RunState, need: string, choices: number[], options: MetaOptions): number {
  if (need === "upgrade") return best(choices, i => upgradeScore(run, run.deck[i], options));
  if (need === "duplicate") return best(choices, i => cardScore(run, run.deck[i], options));
  return best(choices, i => trimScore(run, i));
}

/** Preferred choices per event, by the start of their label (fallback: every other choice, in
 * order, except that a curse-bearing choice is taken only when named here). */
function eventOrder(run: RunState, id: string, options: MetaOptions): string[] {
  const health = run.integrity / run.maxIntegrity;
  const missing = run.maxIntegrity - run.integrity;
  const cursed = run.deck.some(card => CARDS[card].curse);
  switch (id) {
    case "unpatched-server": return run.integrity > 8 ? ["Patch it by hand", "Walk on"] : ["Walk on"];
    case "abandoned-rack": return ["Take the device", "Strip it for parts"];
    case "firmware-mirror": return run.integrity > 7 ? ["Flash everything", "Flash one carefully", "Walk on"] : ["Flash one carefully", "Walk on"];
    case "operators-log": return missing >= 4 ? ["Read it to the end", "Follow its advice"] : ["Follow its advice", "Read it to the end"];
    case "rogue-dhcp": return ["Accept the lease", "Shut it down"];
    case "cold-storage": return run.maxIntegrity >= 12 ? ["Open the vault", "Walk on"] : ["Walk on"];
    case "echo-chamber": return ["Make an echo", "Listen"];
    case "quiet-broker": {
      const rare = run.event?.cards?.[1];
      const top = rare && cardScore(run, rare, options) < 10 && run.integrity > 8;
      return [...(run.credits >= 60 ? ["Buy"] : []), ...(top ? ["Take"] : []), "Walk on"];
    }
    case "signal-in-the-static": return health >= 0.7 ? ["Answer it", "Walk on"] : ["Walk on"];
    case "zombie-farm": return cursed && run.integrity > 6 ? ["Kill", "Walk on"] : ["Walk on"];
    case "copper-letters": return ["Read the one addressed to you", "Carry them with you"];
    case "bell-ringer": return missing >= 5 ? ["Rest a while", "Take the tuning fork"] : ["Take the tuning fork", "Rest a while"];
    case "last-acknowledgement": return ["Send the acknowledgement", "Take the reserve cell"];
    default: return [];
  }
}
/** Choices that add a curse (their detail names it): never a fallback. */
const addsCurse = (detail: string) => /Add an? [A-Z][\w ]* curse/.test(detail);

export function playMetaPhase(run: RunState, policy: string, options: MetaOptions = {}): void {
  const careless = policy === "careless";
  if (run.phase === "map") {
    const rooms = reachableRooms(run);
    const room = careless ? rooms[0]
      : best(rooms, item => -roomScore(run, item, policy, options) * 10 + Math.abs(item.lane - 1));
    chooseRoom(run, room.id);
    return;
  }
  if (run.phase === "reward") {
    const pick = best(run.cardRewards, id => cardScore(run, id, options));
    const worthIt = pick && cardScore(run, pick, options) < Math.min(900, run.deck.length >= 26 ? 10 : run.deck.length >= 20 ? 24 : 60);
    chooseCardReward(run, careless || !worthIt ? null : pick);
    return;
  }
  if (run.phase === "relic") {
    chooseRelic(run, careless ? run.relicRewards[0] : best(run.relicRewards, id => relicScore(id, options, run)));
    return;
  }
  if (run.phase === "forge") {
    const missing = run.maxIntegrity - run.integrity;
    // Legacy Mainframe refuses repair: fall through to the other services.
    if ((careless || missing >= Math.max(3, repairAmount(run) - 1) || run.integrity / run.maxIntegrity < 0.5) && chooseForge(run, "repair").ok) return;
    const curse = run.deck.findIndex(id => CARDS[id].curse);
    if (curse >= 0 && removeDeckCard(run, curse).ok) return;
    // Thin the starter's Packet Bursts and Guards while the deck is big enough, else upgrade.
    const trims = trimmable(run);
    const basics = run.deck.filter(id => ["pulse", "guard"].includes(baseCard(id))).length;
    if (!careless && trims.length && basics >= 2 && run.deck.length >= 15 && removeDeckCard(run, pickCard(run, "remove", trims, options)).ok) return;
    const upgrades = upgradableIndices(run);
    if (upgrades.length) {
      upgradeDeckCard(run, pickCard(run, "upgrade", upgrades, options));
      return;
    }
    const removable = removableIndices(run);
    if (removable.length && run.deck.length > 14) {
      removeDeckCard(run, pickCard(run, "remove", removable, options));
      return;
    }
    if (relicPool(run, "common").length && run.maxIntegrity - SALVAGE_COST >= SALVAGE_MIN_INTEGRITY && chooseForge(run, "relic").ok) return;
    if (chooseForge(run, "repair").ok) return;
    leaveForge(run);
    return;
  }
  if (run.phase === "shop") {
    const shop = run.shop!;
    if (!careless) {
      const curse = run.deck.findIndex(id => CARDS[id].curse);
      if (curse >= 0 && run.credits >= shop.removePrice) shopRemoveCard(run, curse);
      for (const [i, offer] of shop.relics.entries())
        if (!offer.sold && run.credits >= offer.price + 25 && relicScore(offer.id, options, run) < 16) buyRelic(run, i);
      const cards = shop.cards.map((offer, i) => ({ offer, i })).filter(({ offer }) => !offer.sold)
        .sort((a, b) => cardScore(run, a.offer.id, options) - cardScore(run, b.offer.id, options));
      for (const { offer, i } of cards)
        if (run.credits >= offer.price && cardScore(run, offer.id, options) < (run.deck.length >= 24 ? 10 : 20)) buyCard(run, i);
      const trims = trimmable(run);
      if (!shop.removed && trims.length && run.deck.length > 14 && run.credits >= shop.removePrice)
        shopRemoveCard(run, pickCard(run, "remove", trims, options));
      const upgrades = upgradableIndices(run);
      if (!shop.upgraded && upgrades.length && run.credits >= shop.upgradePrice)
        shopUpgradeCard(run, pickCard(run, "upgrade", upgrades, options));
    }
    leaveShop(run);
    return;
  }
  if (run.phase === "event") {
    const view = eventView(run)!;
    if (!view.resolved) {
      const labels = careless ? [] : eventOrder(run, view.id, options);
      const named = labels.flatMap(label => view.choices.map((choice, i) => choice.label.startsWith(label) ? i : -1).filter(i => i >= 0));
      const order = careless ? [view.choices.length - 1]
        : [...named, ...view.choices.keys()].filter((i, at, all) => all.indexOf(i) === at && (named.includes(i) || !addsCurse(view.choices[i].detail)));
      let answered = false;
      for (const index of [...order, ...view.choices.keys()]) {
        const choice = view.choices[index];
        if (!choice || choice.disabled) continue;
        const cards = choice.needsCard ? eventCardChoices(run, index) : [];
        if (choice.needsCard && !cards.length) continue;
        const deckIndex = choice.needsCard ? pickCard(run, choice.needsCard, cards, options) : undefined;
        if (chooseEvent(run, index, deckIndex).ok) { answered = true; break; }
      }
      if (!answered) throw new Error(`Event ${view.id} has no answer the bot can take`);
    }
    if (run.phase === "event") leaveEvent(run);
  }
}
