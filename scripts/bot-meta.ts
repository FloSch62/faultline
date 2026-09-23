/** Seeded, transparent decisions for everything between fights: route choice,
 * rewards, relics, sanctuaries, markets and events. A regression probe for the
 * balance harness, not an optimal player. Combat turns live in bot.ts. */
import { reachableRooms } from "../src/core/map.ts";
import {
  chooseRoom, chooseCardReward, chooseRelic, chooseForge, upgradeDeckCard, removeDeckCard,
  buyCard, buyRelic, shopRemoveCard, shopUpgradeCard, leaveShop, eventView, chooseEvent,
  leaveEvent, eventCardChoices, repairAmount, relicPool, upgradableIndices, removableIndices,
  SALVAGE_COST, SALVAGE_MIN_INTEGRITY,
} from "../src/core/meta.ts";
import { CARDS, baseCard } from "../src/core/cards.ts";
import type { Archetype, BaseCardId, CardId, MapRoom, RelicId, RunState } from "../src/core/types.ts";

export interface MetaOptions {
  /** Seek elites on the map. */
  elite?: boolean;
  /** Card priorities, best first (base ids). Overrides the archetype default. */
  priorities?: CardId[];
  relicPriorities?: RelicId[];
  /** Never accept Containerlab or Clabernetes. */
  noSignature?: boolean;
}

const SHARED: BaseCardId[] = [
  "poe-injector", "cache-server", "zero-day", "barrier", "failover-policy", "ips-signature",
  "rate-limiter", "port-security", "tarpit", "quarantine-rule", "honeypot", "load-balancer",
  "firmware", "containerlab", "clabernetes", "compression", "vxlan", "conduit", "mirror",
  "hardened-router", "relay", "wireshark", "surge", "reroute", "capacitor", "diagnostic",
  "startup-config", "pulse", "guard", "emergency", "armored-fiber", "linux-bridge",
  "aegis-field", "resonance-field", "null-field", "shield", "rebuild", "duplex", "crosslink",
];
const ARCHETYPE_FIRST: Record<Archetype, BaseCardId[]> = {
  architect: ["load-balancer", "ecmp", "spine-leaf", "mesh-weave", "relay", "linux-bridge", "conduit", "vxlan"],
  warden: ["stateful-firewall", "deep-inspection", "reflect", "bastion", "ips-signature", "rate-limiter", "barrier"],
  ghost: ["store-forward", "replay-attack", "dark-fiber", "zero-day", "pulse", "surge", "diagnostic"],
};
const RELIC_ORDER: RelicId[] = [
  "jumbo-frames", "bgp-hijack", "sdn-controller", "anycast", "zero-trust", "spanning-tree",
  "cold-start", "grounded-core", "repair-drone", "reserve-cell", "parallel-core", "fanout",
  "watchdog", "shield-array", "packet-lens", "honeynet", "spare-parts", "credit-line",
];
/** Cards worth thinning once an engine exists, worst first. */
const TRIM: BaseCardId[] = ["cve", "fiber", "guard", "inspect", "patch", "purge-field", "pulse", "resonance-field"];

function priorities(run: RunState, options: MetaOptions): CardId[] {
  return options.priorities ?? [...ARCHETYPE_FIRST[run.archetype], ...SHARED];
}

/** Lower is better. Cards outside the list are judged by rarity. */
function cardScore(run: RunState, id: CardId, options: MetaOptions): number {
  const base = baseCard(id);
  if (options.noSignature && ["containerlab", "clabernetes"].includes(base)) return 999;
  const card = CARDS[id];
  if (card.junk || card.curse) return 999;
  const list = priorities(run, options);
  const index = list.indexOf(base);
  const upgradedBonus = id.endsWith("+") ? -3 : 0;
  if (index >= 0) return index + upgradedBonus;
  return ({ legendary: 25, rare: 30, uncommon: 45, common: 60 } as Record<string, number>)[card.rarity] ?? 90;
}

function relicScore(id: RelicId, options: MetaOptions, run: RunState): number {
  if (id === "anycast" && run.archetype === "warden") return 999;
  if (id === "spanning-tree" && run.archetype === "architect") return 999;
  if (id === "zero-trust" && run.archetype !== "warden") return 500;
  const list = options.relicPriorities ?? RELIC_ORDER;
  const index = list.indexOf(id);
  return index < 0 ? 100 : index;
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

const best = <T>(items: T[], score: (item: T) => number) =>
  [...items].sort((a, b) => score(a) - score(b))[0];

function roomScore(run: RunState, room: MapRoom, policy: string, options: MetaOptions): number {
  const health = run.integrity / run.maxIntegrity;
  switch (room.type) {
    case "elite": return options.elite ? 8 : policy === "tactical" && health >= 0.8 ? 4 : 1;
    case "forge": return health < 0.7 ? 7 : 3;
    case "shop": return run.credits >= 70 ? 6 : 2;
    case "cache": return 5;
    case "event": return 4;
    case "battle": return 3;
    default: return 0;
  }
}

function pickCard(run: RunState, need: string, choices: number[], options: MetaOptions): number {
  if (need === "upgrade" || need === "duplicate") return best(choices, i => cardScore(run, run.deck[i], options));
  return best(choices, i => trimScore(run, i));
}

/** Preferred choice order per event, falling back through unavailable answers. */
function eventOrder(run: RunState, id: string): number[] {
  const health = run.integrity / run.maxIntegrity;
  const missing = run.maxIntegrity - run.integrity;
  switch (id) {
    case "unpatched-server": return run.integrity > 8 ? [1, 0, 2] : [0, 2];
    case "abandoned-rack": return [0, 1];
    case "firmware-mirror": return run.integrity > 7 ? [0, 1, 2] : [1, 2];
    case "operators-log": return missing >= 4 ? [0, 1] : [1, 0];
    case "rogue-dhcp": return [0, 1];
    case "cold-storage": return run.maxIntegrity >= 12 ? [0, 1] : [1];
    case "echo-chamber": return [0, 1];
    case "quiet-broker": return run.credits >= 60 ? [1, 2] : [2];
    case "signal-in-the-static": return health >= 0.7 ? [0, 1] : [1];
    case "copper-letters": return [1, 0];
    case "bell-ringer": return missing >= 5 ? [1, 0] : [0, 1];
    case "last-acknowledgement": return [0, 1];
    default: return [0, 1, 2];
  }
}

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
    const worthIt = pick && cardScore(run, pick, options) < (run.deck.length >= 24 ? 12 : 60);
    chooseCardReward(run, careless || !worthIt ? null : pick);
    return;
  }
  if (run.phase === "relic") {
    chooseRelic(run, careless ? run.relicRewards[0] : best(run.relicRewards, id => relicScore(id, options, run)));
    return;
  }
  if (run.phase === "forge") {
    const missing = run.maxIntegrity - run.integrity;
    if (careless || missing >= Math.max(3, repairAmount(run) - 1) || run.integrity / run.maxIntegrity < 0.5) {
      chooseForge(run, "repair");
      return;
    }
    const curse = run.deck.findIndex(id => CARDS[id].curse);
    if (curse >= 0 && removeDeckCard(run, curse).ok) return;
    const upgrades = upgradableIndices(run);
    if (upgrades.length) {
      upgradeDeckCard(run, pickCard(run, "upgrade", upgrades, options));
      return;
    }
    const removable = removableIndices(run);
    if (removable.length && run.deck.length > 16) {
      removeDeckCard(run, pickCard(run, "remove", removable, options));
      return;
    }
    if (relicPool(run, "common").length && run.maxIntegrity - SALVAGE_COST >= SALVAGE_MIN_INTEGRITY) chooseForge(run, "relic");
    else chooseForge(run, "repair");
    return;
  }
  if (run.phase === "shop") {
    const shop = run.shop!;
    if (!careless) {
      const curse = run.deck.findIndex(id => CARDS[id].curse);
      if (curse >= 0 && run.credits >= shop.removePrice) shopRemoveCard(run, curse);
      for (const [i, offer] of shop.relics.entries())
        if (!offer.sold && run.credits >= offer.price + 25 && relicScore(offer.id, options, run) < 12) buyRelic(run, i);
      const cards = shop.cards.map((offer, i) => ({ offer, i })).filter(({ offer }) => !offer.sold)
        .sort((a, b) => cardScore(run, a.offer.id, options) - cardScore(run, b.offer.id, options));
      for (const { offer, i } of cards)
        if (run.credits >= offer.price && cardScore(run, offer.id, options) < 25) buyCard(run, i);
      const upgrades = upgradableIndices(run);
      if (!shop.upgraded && upgrades.length && run.credits >= shop.upgradePrice)
        shopUpgradeCard(run, pickCard(run, "upgrade", upgrades, options));
      const removable = removableIndices(run);
      if (!shop.removed && removable.length && run.deck.length > 16 && run.credits >= shop.removePrice)
        shopRemoveCard(run, pickCard(run, "remove", removable, options));
    }
    leaveShop(run);
    return;
  }
  if (run.phase === "event") {
    const view = eventView(run)!;
    if (!view.resolved) {
      const order = careless ? [view.choices.length - 1] : eventOrder(run, view.id);
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
