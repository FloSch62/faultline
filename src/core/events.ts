/** Unknown signals: short encounters between fights. Every choice states its
 * trade-off; seeded results are rolled when the event opens and named up front.
 * v5: some choices take a curse as their price (contract section 8), and every such
 * choice names its curse: The Firmware Mirror (Bitrot), The Quiet Broker (Backdoor),
 * Cold Storage (Memory Leak), The Echo Chamber (Kernel Panic), The Zombie Farm (Zombie
 * Process; it can also remove one). */
import { CARDS, RELICS, RULES, canUpgrade, upgraded, baseCard } from "./cards.ts";
import { DESIGNATIONS, hostileName } from "./enemies.ts";
import { STAGES } from "./stages.ts";
import { beginBattle } from "./run.ts";
import { random, shuffle } from "./util.ts";
import { eventRoom, roomScout } from "./encounter.ts";
import { creditMultiplier, priceMultiplier } from "./ascension.ts";
import { rollCard, rollRelics, upgradableIndices, SALVAGE_MIN_INTEGRITY, type Rarity } from "./meta.ts";
import type { CardId, EventState, RelicId, RunState } from "./types.ts";

export type CardNeed = "upgrade" | "remove" | "transform" | "duplicate";
type Text = string | ((run: RunState, state: EventState) => string);

export interface EventChoiceDefinition {
  label: Text;
  detail: (run: RunState, state: EventState) => string;
  /** A reason the choice is unavailable, or undefined. */
  disabled?: (run: RunState, state: EventState) => string | undefined;
  needsCard?: CardNeed;
  /** Applies the choice; returns the outcome line. */
  resolve: (run: RunState, state: EventState, deckIndex?: number) => string;
}

export interface EventDefinition {
  id: string;
  title: string;
  kicker: string;
  text: string;
  /** Painted backdrop under public/art (without extension). */
  art?: string;
  /** Appears only in this stage (story beats, and stage signals like The Zombie Farm). */
  stage?: number;
  /** A story beat: three times as likely as any other signal in its stage. */
  story?: boolean;
  prepare?: (run: RunState, state: EventState) => void;
  choices: EventChoiceDefinition[];
}

// ---------------------------------------------------------------- helpers

const name = (id: CardId | undefined) => (id && CARDS[id] ? CARDS[id].name : "nothing");
const relicName = (id: RelicId | undefined) => (id && RELICS[id] ? RELICS[id].name : "nothing");
const credits = (run: RunState, amount: number) => Math.round(amount * creditMultiplier(run.ascension));
const price = (run: RunState, amount: number) => Math.round(amount * priceMultiplier(run.ascension) / 5) * 5;
const heal = (run: RunState, amount: number) => {
  const restored = Math.min(amount, run.maxIntegrity - run.integrity);
  run.integrity += restored;
  return restored;
};
const leave = (detail: string, outcome: string): EventChoiceDefinition => ({
  label: "Walk on", detail: () => detail, resolve: () => outcome,
});
const RARITY_STEP: Record<string, Rarity> = { basic: "common", common: "uncommon", uncommon: "rare", rare: "rare", legendary: "rare" };
/** "A", "A and B", "A, B and C". */
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "nothing";
/** Deck indices of curses. */
const curseIndices = (run: RunState) => run.deck.map((_, i) => i).filter(i => CARDS[run.deck[i]]?.curse);
/** v5 curse prices: what the curse-bearing choices give and cost. */
const CURSE_DEALS = {
  /** The Firmware Mirror: the unsigned build upgrades this many named cards (Flash everything: two). */
  unsignedUpgrades: 3,
  /** The Zombie Farm: credits for carrying a Zombie Process out; integrity to kill a curse. */
  farmCredits: 60,
  farmKillIntegrity: 3,
} as const;
/** The Firmware Mirror's named cards: the first `count` seeded picks, in deck order. */
const mirrorPicks = (state: EventState, count: number) => (state.picks ?? []).slice(0, count).sort((a, b) => a - b);

/** Replaces a deck card with a random offerable card one rarity higher. */
export function transformCard(run: RunState, index: number): { from: CardId; to: CardId } {
  const from = run.deck[index];
  const rarity = CARDS[from].curse ? "common" : RARITY_STEP[CARDS[from].rarity] ?? "uncommon";
  const rolled = rollCard(run, rarity, [baseCard(from) as CardId]) ?? from;
  const to = from.endsWith("+") && canUpgrade(rolled) ? upgraded(rolled) : rolled;
  run.deck[index] = to;
  return { from, to };
}

const DEVICE_CARDS: CardId[] = ["honeypot", "cache-server", "poe-injector", "load-balancer"];

/** Signal in the Static: the fight the event would start, rolled like the stage's
 * normals (packs and designations) from the seed. Null outside an event room. */
function staticFight(run: RunState, state: EventState) {
  const room = run.map.find(item => item.id === run.currentRoom);
  const enemyId = state.enemyId ?? STAGES[run.stage].encounters[0];
  return room ? eventRoom(run, room, enemyId) : null;
}
/** "Static Nest and a Tap Spinner" / "a hidden-designated Coil Serpent" — what answers. */
function staticFoes(run: RunState, state: EventState): string {
  const room = staticFight(run, state);
  if (!room) return "the hostile";
  const scout = roomScout({ ...run, currentRoom: null }, room);
  const names = scout.members.map(hostileName);
  const pack = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "the hostile";
  const ribbon = scout.hidden ? " (unknown designation)"
    : scout.designations.length ? ` (${scout.designations.map(id => DESIGNATIONS[id].ribbon).join(", ")})` : "";
  return `${pack}${ribbon}`;
}

// ---------------------------------------------------------------- events

export const EVENTS: Record<string, EventDefinition> = {
  "unpatched-server": {
    id: "unpatched-server", title: "The Unpatched Server", kicker: "UNKNOWN SIGNAL · A RACK STILL ANSWERING", art: "relay-interior",
    text: "Behind a cracked panel, one server still answers every request with firmware older than the Blackout. Its administrator left a toolkit clipped to the door, and a note taped beneath it: known issue, do not expose.",
    prepare: (run, state) => { const card = rollCard(run, "rare"); state.cards = card ? [card] : []; },
    choices: [
      {
        label: "Take the toolkit",
        detail: (_, s) => `Add ${name(s.cards?.[0])} to your deck. Add a CVE curse.`,
        disabled: (_, s) => s.cards?.length ? undefined : "The toolkit is empty.",
        resolve: (run, s) => { run.deck.push(s.cards![0], "cve"); return `${name(s.cards![0])} joins your deck. So does the vulnerability it came with.`; },
      },
      {
        label: "Patch it by hand",
        detail: () => "Lose 3 integrity. Upgrade a card of your choice.",
        disabled: run => run.integrity <= 3 ? "You are too damaged to work on it." : upgradableIndices(run).length ? undefined : "Nothing in your deck can be improved.",
        needsCard: "upgrade",
        resolve: (run, _, i) => { run.integrity -= 3; const card = run.deck[i!]; run.deck[i!] = upgraded(card); return `Your hands shake, but the patch holds. ${name(card)} upgraded.`; },
      },
      leave("Leave it answering into the dark.", "You close the panel. Somewhere, the server keeps saying yes."),
    ],
  },
  "abandoned-rack": {
    id: "abandoned-rack", title: "The Abandoned Rack", kicker: "UNKNOWN SIGNAL · SALVAGE", art: "relay-bazaar",
    text: "A rack stands alone at the end of a flooded aisle, still bolted to the floor, still warm. Someone labelled it by hand: back soon.",
    prepare: (run, state) => {
      const devices = DEVICE_CARDS.filter(id => CARDS[id]);
      state.cards = devices.length ? [devices[Math.floor(random(run) * devices.length)]] : [];
    },
    choices: [
      {
        label: "Take the device",
        detail: (_, s) => `Add ${name(s.cards?.[0])} to your deck.`,
        disabled: (_, s) => s.cards?.length ? undefined : "The rack is empty.",
        resolve: (run, s) => { run.deck.push(s.cards![0]); return `${name(s.cards![0])} is yours now. Back soon, it said.`; },
      },
      {
        label: "Strip it for parts",
        detail: run => `Gain ${credits(run, 45)} credits.`,
        resolve: run => { const gain = credits(run, 45); run.credits += gain; return `You salvage what still works. +${gain} credits.`; },
      },
    ],
  },
  "firmware-mirror": {
    id: "firmware-mirror", title: "The Firmware Mirror", kicker: "UNKNOWN SIGNAL · A FLASHING TERMINAL", art: "relay-interior",
    text: "A maintenance terminal mirrors firmware to anything that connects. Its progress bar never stopped moving; it has been flashing an empty room for years.",
    // Seeded picks in shuffle order: Flash everything takes the first two, the unsigned build three.
    prepare: (run, state) => { state.picks = shuffle(run, upgradableIndices(run)).slice(0, CURSE_DEALS.unsignedUpgrades); },
    choices: [
      {
        label: "Flash everything",
        detail: (run, s) => s.picks?.length ? `Upgrade ${list(mirrorPicks(s, 2).map(i => name(run.deck[i])))}. Lose 3 integrity.` : "Nothing in your deck can be improved.",
        disabled: (run, s) => !s.picks?.length ? "Nothing in your deck can be improved." : run.integrity <= 3 ? "The surge would overwhelm you." : undefined,
        resolve: (run, s) => {
          run.integrity -= 3;
          const names = mirrorPicks(s, 2).map(i => { const card = run.deck[i]; run.deck[i] = upgraded(card); return name(card); });
          return `The surge burns through you and into your tools. ${list(names)} upgraded.`;
        },
      },
      {
        label: "Flash one carefully",
        detail: run => `Pay ${price(run, 25)} credits. Upgrade a card of your choice.`,
        disabled: run => run.credits < price(run, 25) ? `You need ${price(run, 25)} credits.` : upgradableIndices(run).length ? undefined : "Nothing in your deck can be improved.",
        needsCard: "upgrade",
        resolve: (run, _, i) => { run.credits -= price(run, 25); const card = run.deck[i!]; run.deck[i!] = upgraded(card); return `One clean write. ${name(card)} upgraded.`; },
      },
      {
        label: "Install the unsigned build",
        detail: (run, s) => s.picks?.length ? `Upgrade ${list(mirrorPicks(s, CURSE_DEALS.unsignedUpgrades).map(i => name(run.deck[i])))}. Add a Bitrot curse.` : "Nothing in your deck can be improved.",
        disabled: (_, s) => s.picks?.length ? undefined : "Nothing in your deck can be improved.",
        resolve: (run, s) => {
          const names = mirrorPicks(s, CURSE_DEALS.unsignedUpgrades).map(i => { const card = run.deck[i]; run.deck[i] = upgraded(card); return name(card); });
          run.deck.push("bitrot");
          return `Nobody signed this build, and it shows. ${list(names)} upgraded. A Bitrot joins your deck.`;
        },
      },
      leave("Disconnect and let it keep mirroring nothing.", "You pull the cable. The progress bar keeps moving anyway."),
    ],
  },
  "operators-log": {
    id: "operators-log", title: "The Operator's Log", kicker: "UNKNOWN SIGNAL · A CONSOLE LEFT OPEN", art: "relay-sanctuary",
    text: "The last shift's log is still open. Most entries are ordinary: a fan replaced, a coffee spilled, a relay rerouted around a storm. The final line reads: going home now. leaving the light on.",
    choices: [
      {
        label: "Read it to the end",
        detail: run => `Restore ${Math.min(5, run.maxIntegrity - run.integrity)} integrity.`,
        resolve: run => `You read every entry. It helps more than it should. +${heal(run, 5)} integrity.`,
      },
      {
        label: "Follow its advice",
        detail: () => "\"Travel light.\" Remove a card from your deck.",
        needsCard: "remove",
        resolve: (run, _, i) => { const [card] = run.deck.splice(i!, 1); return `You leave ${name(card)} beside the console, for the next shift.`; },
      },
    ],
  },
  "rogue-dhcp": {
    id: "rogue-dhcp", title: "Rogue DHCP", kicker: "UNKNOWN SIGNAL · AN UNINVITED SERVER", art: "relay-cathedral",
    text: "An old server hands out addresses no one asked for, to devices that are no longer there. Accept a lease, and it will gladly rename whatever you give it.",
    choices: [
      {
        label: "Accept the lease",
        detail: () => "Transform a card into a random card one rarity higher. Curses become commons.",
        needsCard: "transform",
        resolve: (run, _, i) => { const { from, to } = transformCard(run, i!); return `${name(from)} answers to a new name now: ${name(to)}.`; },
      },
      {
        label: "Shut it down",
        detail: run => `Reclaim its reserve. Gain ${credits(run, 20)} credits.`,
        resolve: run => { const gain = credits(run, 20); run.credits += gain; return `The leases expire one by one. +${gain} credits.`; },
      },
    ],
  },
  "cold-storage": {
    id: "cold-storage", title: "Cold Storage", kicker: "UNKNOWN SIGNAL · A SEALED VAULT", art: "relay-sanctuary",
    text: "The vault's cooling still runs. Behind frost-blind glass, one module has been kept exactly as it was the night the backbone fell. Opening the door will let the cold out, and some of your warmth with it.",
    prepare: (run, state) => { state.relic = rollRelics(run, "common", 1)[0]; },
    choices: [
      {
        label: "Open the vault",
        detail: (_, s) => `Lose 2 maximum integrity. Gain ${relicName(s.relic)}.`,
        disabled: (run, s) => !s.relic ? "The vault is empty." : run.maxIntegrity - 2 < SALVAGE_MIN_INTEGRITY ? `You must keep at least ${SALVAGE_MIN_INTEGRITY} maximum integrity.` : undefined,
        resolve: (run, s) => {
          run.maxIntegrity -= 2;
          run.integrity = Math.min(run.integrity, run.maxIntegrity);
          run.relics.push(s.relic!);
          return `The cold follows you out. ${relicName(s.relic)} installed.`;
        },
      },
      {
        label: "Cut the cooling first",
        detail: (_, s) => `Gain ${relicName(s.relic)}. Add a Memory Leak curse.`,
        disabled: (_, s) => s.relic ? undefined : "The vault is empty.",
        resolve: (run, s) => {
          run.relics.push(s.relic!);
          run.deck.push("memory-leak");
          return `The frost melts and the door gives without a fight. The module still works; it just never lets go of anything. ${relicName(s.relic)} installed. A Memory Leak joins your deck.`;
        },
      },
      leave("Leave it sealed and keep your warmth.", "Some things are better kept exactly as they were."),
    ],
  },
  "echo-chamber": {
    id: "echo-chamber", title: "The Echo Chamber", kicker: "UNKNOWN SIGNAL · A HALL THAT ANSWERS", art: "relay-cathedral",
    text: "Every sound in this hall returns a moment later, exactly the same. Hold something up to the walls and they will give it back to you twice.",
    choices: [
      {
        label: "Make an echo",
        detail: run => `Pay ${price(run, 30)} credits. Duplicate a card in your deck.`,
        disabled: run => run.credits < price(run, 30) ? `You need ${price(run, 30)} credits.` : undefined,
        needsCard: "duplicate",
        resolve: (run, _, i) => { run.credits -= price(run, 30); const card = run.deck[i!]; run.deck.push(card); return `The walls return ${name(card)}. Now there are two.`; },
      },
      {
        label: "Echo for nothing, take a Kernel Panic",
        detail: () => "Duplicate a card in your deck for nothing. Add a Kernel Panic curse.",
        needsCard: "duplicate",
        resolve: (run, _, i) => {
          const card = run.deck[i!];
          run.deck.push(card, "kernel-panic");
          return `The walls return ${name(card)}, then keep returning everything, faster and faster, until something in you locks up. A Kernel Panic joins your deck.`;
        },
      },
      {
        label: "Listen",
        detail: run => `Restore ${Math.min(2, run.maxIntegrity - run.integrity)} integrity.`,
        resolve: run => `For a while, the hall only repeats your breathing. +${heal(run, 2)} integrity.`,
      },
    ],
  },
  "quiet-broker": {
    id: "quiet-broker", title: "The Quiet Broker", kicker: "UNKNOWN SIGNAL · A TRADER IN THE DARK", art: "relay-bazaar",
    text: "A figure in a maintenance coat trades in things that still work. They do not ask where you found them. They do not say who buys them.",
    prepare: (run, state) => {
      state.relic = [...run.relics].reverse().find(id => RELICS[id]?.tier !== "starter");
      const card = rollCard(run, "uncommon");
      // The rare the broker lends (after the uncommon, so the uncommon keeps its seed).
      const rare = rollCard(run, "rare", card ? [card] : []);
      state.cards = card ? [card, ...(rare ? [rare] : [])] : [];
    },
    choices: [
      {
        label: (_, s) => s.relic ? `Sell ${relicName(s.relic)}` : "Sell a relic",
        detail: (run, s) => s.relic ? `Lose ${relicName(s.relic)}. Gain ${credits(run, 80)} credits.` : "You carry nothing the broker wants.",
        disabled: (run, s) => s.relic && run.relics.includes(s.relic) ? undefined : "You carry nothing the broker wants.",
        resolve: (run, s) => {
          run.relics = run.relics.filter(id => id !== s.relic);
          const gain = credits(run, 80);
          run.credits += gain;
          return `${relicName(s.relic)} disappears into the coat. +${gain} credits.`;
        },
      },
      {
        label: (_, s) => `Buy ${name(s.cards?.[0])}`,
        detail: (run, s) => `Pay ${price(run, 45)} credits. Add ${name(s.cards?.[0])} to your deck.`,
        disabled: (run, s) => !s.cards?.length ? "The broker has nothing to sell." : run.credits < price(run, 45) ? `You need ${price(run, 45)} credits.` : undefined,
        resolve: (run, s) => { run.credits -= price(run, 45); run.deck.push(s.cards![0]); return `No receipt. ${name(s.cards![0])} added to your deck.`; },
      },
      {
        label: (_, s) => s.cards?.[1] ? `Take ${name(s.cards[1])} for nothing` : "Take something for nothing",
        detail: (_, s) => `Add ${name(s.cards?.[1])} to your deck. Add a Backdoor curse.`,
        disabled: (_, s) => s.cards?.[1] ? undefined : "The broker has nothing to lend.",
        resolve: (run, s) => {
          run.deck.push(s.cards![1], "backdoor");
          return `"Free," the broker says, "this once." ${name(s.cards![1])} joins your deck, and so does the Backdoor someone left inside it.`;
        },
      },
      leave("Nod, and keep walking.", "The broker is gone before you look back."),
    ],
  },
  "signal-in-the-static": {
    id: "signal-in-the-static", title: "Signal in the Static", kicker: "UNKNOWN SIGNAL · SOMETHING ANSWERS BACK", art: "relay-interior",
    text: "Something in the static is transmitting back, louder than anything you have heard since the Blackout. It will not stop until it is answered.",
    prepare: (run, state) => {
      const pool = STAGES[run.stage].encounters;
      state.enemyId = pool[Math.floor(random(run) * pool.length)];
    },
    choices: [
      {
        label: "Answer it",
        detail: (run, s) => `Fight ${staticFoes(run, s)} with ${Math.round((RULES.eventHealthScale - 1) * 100)}% more integrity. Victory: ${credits(run, 40)} credits and an elite card reward (uncommon or better first).`,
        resolve: (run, s) => {
          const fight = staticFight(run, s)!;
          const names = [fight.enemyId, ...(fight.pack ?? [])].filter((id): id is string => !!id).map(hostileName);
          // encounterHealth scales "event" rooms by RULES.eventHealthScale; planEncounter shares it out.
          beginBattle(run, fight);
          return names.length > 1 ? `${names.join(" and ")} tear free of the static.` : `${names[0]} tears free of the static.`;
        },
      },
      leave("Let it rage and go around.", "You leave it shouting at no one."),
    ],
  },
  "zombie-farm": {
    id: "zombie-farm", stage: 1, title: "The Zombie Farm", kicker: "UNKNOWN SIGNAL · A HALL OF DEAD PROCESSES", art: "relay-interior",
    text: "Row after row of racks, every one of them busy. Nothing they run has had a parent in years: orphaned processes still holding their memory, still answering to their names. A broker's tag on the door pays for any you carry out.",
    // A seeded curse in your deck, named by the kill choice (none: the choice is closed).
    prepare: (run, state) => { state.picks = shuffle(run, curseIndices(run)).slice(0, 1); },
    choices: [
      {
        label: "Carry one out",
        detail: run => `Gain ${credits(run, CURSE_DEALS.farmCredits)} credits. Add a Zombie Process curse.`,
        resolve: run => {
          const gain = credits(run, CURSE_DEALS.farmCredits);
          run.credits += gain;
          run.deck.push("zombie-process");
          return `It follows you without being asked. +${gain} credits. A Zombie Process joins your deck.`;
        },
      },
      {
        label: (run, s) => s.picks?.length ? `Kill ${name(run.deck[s.picks[0]])}` : "Kill a process",
        detail: (run, s) => s.picks?.length ? `Lose ${CURSE_DEALS.farmKillIntegrity} integrity. Remove ${name(run.deck[s.picks[0]])} from your deck.` : "Lose integrity to remove a curse from your deck.",
        disabled: (run, s) => !s.picks?.length || !CARDS[run.deck[s.picks[0]]]?.curse ? "You carry no curse."
          : run.integrity <= CURSE_DEALS.farmKillIntegrity ? "You are too damaged to fight it." : undefined,
        resolve: (run, s) => {
          run.integrity -= CURSE_DEALS.farmKillIntegrity;
          const [card] = run.deck.splice(s.picks![0], 1);
          return `It takes more out of you than it should, but the signal stops mid-reply. ${name(card)} is gone from your deck.`;
        },
      },
      leave("Leave the farm to its work.", "Behind you, every rack keeps answering."),
    ],
  },
  // ------------------------------------------------------------ story beats
  "copper-letters": {
    id: "copper-letters", stage: 0, story: true, title: "The Copper Letters", kicker: "STAGE I · A SORTING ROOM", art: "relay-interior",
    text: "The pneumatic tubes are still full: letters printed the night the backbone fell and never sent. Most are addressed to the same few streets. One is addressed to whoever finds it.",
    prepare: (run, state) => { state.picks = shuffle(run, upgradableIndices(run)).slice(0, 1); },
    choices: [
      {
        label: "Carry them with you",
        detail: () => "Gain 1 maximum integrity. Restore 3 integrity.",
        resolve: run => { run.maxIntegrity += 1; const restored = heal(run, 3); return `The letters weigh almost nothing. +1 maximum integrity, +${restored} integrity.`; },
      },
      {
        label: "Read the one addressed to you",
        detail: (run, s) => s.picks?.length ? `It describes a better way to build. Upgrade ${name(run.deck[s.picks[0]])}.` : "It describes a better way to build, but you already know it.",
        disabled: (_, s) => s.picks?.length ? undefined : "Nothing in your deck can be improved.",
        resolve: (run, s) => { const card = run.deck[s.picks![0]]; run.deck[s.picks![0]] = upgraded(card); return `Keep going, it says. It was written for you. ${name(card)} upgraded.`; },
      },
    ],
  },
  "bell-ringer": {
    id: "bell-ringer", stage: 1, story: true, title: "The Bell-Ringer's Rest", kicker: "STAGE II · THE FOOT OF THE TOWER", art: "relay-cathedral",
    text: "Someone made a bed here from cable spools and a signal blanket. The bell-ringer is long gone. Their tuning fork still hums when you pick it up, tuned to a rule no attacker has heard.",
    prepare: (run, state) => {
      const card = rollCard(run, "uncommon", [], id => CARDS[id].target === "protocol");
      state.cards = card ? [canUpgrade(card) ? upgraded(card) : card] : [];
    },
    choices: [
      {
        label: "Take the tuning fork",
        detail: (_, s) => `Add ${name(s.cards?.[0])} to your deck.`,
        disabled: (_, s) => s.cards?.length ? undefined : "The fork has fallen silent.",
        resolve: (run, s) => { run.deck.push(s.cards![0]); return `The fork's note settles into your kit. ${name(s.cards![0])} added.`; },
      },
      {
        label: "Rest a while",
        detail: run => `Restore ${Math.min(6, run.maxIntegrity - run.integrity)} integrity.`,
        resolve: run => `The bells are quiet. You sleep. +${heal(run, 6)} integrity.`,
      },
    ],
  },
  "last-acknowledgement": {
    id: "last-acknowledgement", stage: 2, story: true, title: "The Last Acknowledgement", kicker: "STAGE III · THE EDGE OF THE QUARANTINE", art: "relay-sanctuary",
    text: "A single terminal at the edge of the quarantine has been waiting to send one word: ACK. It needs a little power to reach the other side. So do you.",
    choices: [
      {
        label: "Send the acknowledgement",
        detail: () => "Give it your spare power. Gain 2 maximum integrity. Restore 2 integrity.",
        resolve: run => { run.maxIntegrity += 2; const restored = heal(run, 2); return `Far away, something receives it. +2 maximum integrity, +${restored} integrity.`; },
      },
      {
        label: "Take the reserve cell",
        detail: run => `Gain ${credits(run, 60)} credits.`,
        resolve: run => { const gain = credits(run, 60); run.credits += gain; return `The terminal dims. It can wait a little longer. +${gain} credits.`; },
      },
    ],
  },
};

export function eventDefinition(id: string): EventDefinition {
  return EVENTS[id];
}

/** Seeded selection of an unseen event for this stage (stage signals only in their
 * stage). The stage's story beat is three times as likely as any other signal.
 * Installs `run.event`. */
export function openEvent(run: RunState) {
  const seen = run.seenEvents ?? [];
  const eligible = Object.values(EVENTS).filter(event => (event.stage === undefined || event.stage === run.stage) && !seen.includes(event.id));
  const pool = eligible.length ? eligible : Object.values(EVENTS).filter(event => event.stage === undefined);
  const weighted = pool.flatMap(event => event.story && event.stage === run.stage ? [event, event, event] : [event]);
  const event = weighted[Math.floor(random(run) * weighted.length)];
  const state: EventState = { id: event.id, resolved: false };
  event.prepare?.(run, state);
  run.event = state;
  run.seenEvents = [...seen, event.id];
  run.phase = "event";
}
