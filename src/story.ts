import type { Archetype } from "./core/expedition.ts";
import { RULES } from "./core/cards.ts";
import type { Intent } from "./core/run.ts";
import { ENEMIES } from "./core/enemies.ts";

export interface ChapterStory {
  title: string;
  description: string;
  /** A short recovered fragment; optional secondary copy, never an objective. */
  fragment: string;
}

/** Indexed by the expedition's zero-based floor. */
export const CHAPTERS: readonly ChapterStory[] = [
  {
    title: "The Sunken Relay",
    description:
      "The orbital backbone fell silent when its outer relays broke apart. Beneath the wreckage, one delivery light is still blinking; someone left a message waiting.",
    fragment: "Delivery pending. Keep the line open.",
  },
  {
    title: "Fractured Frequencies",
    description:
      "Broken routes sent emergency traffic back to its source, again and again, until every working relay drowned in retries. The echoes are still here, following anything that transmits.",
    fragment: "If you hear this twice, the return route has failed.",
  },
  {
    title: "The Hollow Exchange",
    description:
      "The exchange was never emptied: arrival notices, repair requests, a promise to call after landing. Its caches hold the ordinary lives the Blackout interrupted.",
    fragment: "Made it down. Your turn.",
  },
  {
    title: "Beyond the Firewall",
    description:
      "The isolation order bears a human signature: close the backbone before the storm erases the archive. The wardens saved what they could, then lost the route that would tell the Core it was safe to reopen.",
    fragment: "Quarantine until a safe delivery is confirmed.",
  },
  {
    title: "Echoes in the Copper",
    description:
      "Deeper in the copper, every surviving message has a destination and no acknowledgement. The Core has been holding them all this time, spending the station's last power to keep them intact.",
    fragment: "Retained. Not delivered. Not discarded.",
  },
  {
    title: "The Last Safe Port",
    description:
      "A maintenance lamp still warms the last working bench before the quarantine gate. Choose what will carry you through: a repaired backbone, something worth keeping, or less weight in the deck.",
    fragment: "Leave the lamp on for the next shift.",
  },
  {
    title: "The Blackout Core",
    description:
      "The Core is still obeying the last order it received: keep the archive safe behind closed routes. Break its isolation shell, and the waiting messages will finally have a way out.",
    fragment: "No safe route acknowledged. Hold all deliveries.",
  },
];

export function chapterForFloor(floor: number): ChapterStory {
  const index = Number.isFinite(floor) ? Math.trunc(floor) : 0;
  return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, index))];
}

export type StoryEnemyId = "leech" | "wraith" | "storm" | "sentinel" | "core" | "prophet" | "widow" | "colossus" | "serpent" | "moth" | "marshal" | "choir" | "weaver" | "reaver" | "regent" | "cantor";

export interface EnemyStory {
  name: string;
  title: string;
  motive: string;
  pattern: readonly Intent["kind"][];
  /** Short anticipatory lines, selected by the real combat intent. */
  telegraphs: Partial<Record<Intent["kind"], string>>;
  counterplay: string;
  defeated: string;
}

export const ENEMY_STORIES: Record<StoryEnemyId, EnemyStory> = {
  serpent: {
    name: "Coil Serpent", title: "One route is a perfect snare",
    motive: "A cable-recovery coil has learned to tighten around anything that still carries a signal. It follows a single route all the way to its heart.",
    pattern: ENEMIES.serpent.pattern.map(p => p.kind),
    telegraphs: { strike: "The copper spine draws tight. A second channel would loosen its grip.", sever: "A hooked fang settles over a live cable.", corrupt: "Emerald venom beads against the table." },
    counterplay: ENEMIES.serpent.trait, defeated: "The coils open. There is more than one way home.",
  },
  moth: {
    name: "Ash Moth", title: "Cold wings over a living signal",
    motive: "A maintenance drone follows the warmth of working relays. Its ruined cooling wings shed conductive ash over everything it tries to save.",
    pattern: ENEMIES.moth.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Fine ash settles along your primary route.", jam: "Its wings turn toward the marked band.", strike: "The lantern in its chest burns cold blue." },
    counterplay: ENEMIES.moth.trait, defeated: "The wings fold around a lantern that no longer needs tending.",
  },
  marshal: {
    name: "Null Marshal", title: "No passage without a firewall",
    motive: "It once escorted engineers safely through the trust boundary. With every credential expired, its shield now bars the very people it was built to protect.",
    pattern: ENEMIES.marshal.pattern.map(p => p.kind),
    telegraphs: { breach: "The Marshal raises its final warrant.", jam: "A blue eye fixes on your firewall first.", strike: "The great shield turns edge-on." },
    counterplay: ENEMIES.marshal.trait, defeated: "The warrant expires. The road belongs to the living.",
  },
  choir: {
    name: "Glass Choir", title: "Three voices, one broken note",
    motive: "Three announcement bells repeat different fragments of the same evacuation order. Their incompatible frequencies turn the ground to rust and silence.",
    pattern: ENEMIES.choir.pattern.map(p => p.kind),
    telegraphs: { corrupt: "A different bell begins the refrain. Watch which field it casts, and for the static it scatters into your deck.", strike: "Three glass faces draw breath together.", breach: "A single sharp note searches for an open boundary." },
    counterplay: ENEMIES.choir.trait, defeated: "For a moment, all three bells agree on silence.",
  },
  weaver: {
    name: "Wire Weaver", title: "Every extra thread tightens the trap",
    motive: "The old exchange's wiring automaton cannot distinguish a repair from a snare. It keeps adding tension until every connected line is ready to snap.",
    pattern: ENEMIES.weaver.pattern.map(p => p.kind),
    telegraphs: { sever: "A hooked limb plucks at a live thread.", jam: "Gold filaments close around unprotected hardware.", strike: "The web tightens. Six cables give it something to pull against." },
    counterplay: ENEMIES.weaver.trait, defeated: "The threads slacken. Your connections are yours again.",
  },
  reaver: {
    name: "Grave Reaver", title: "A failing heart strikes twice as hard",
    motive: "Built to dismantle dead reactors, it now hears every weak signal as permission to begin. Its own heart is the last machine it will ever take apart.",
    pattern: ENEMIES.reaver.pattern.map(p => p.kind),
    telegraphs: { breach: "The red heart tolls beneath its ribs.", strike: "Both scythes rise. The dying light makes them faster.", corrupt: "Ash from a thousand dismantled relays falls to the ground." },
    counterplay: ENEMIES.reaver.trait, defeated: "The scythes lower. Its last task is finally over.",
  },
  regent: {
    name: "The Iron Regent", title: "Keeper of the copper gates",
    motive: "When the ring broke, the gatekeeper sealed the outer relays behind its own armor. It will only open for a network resilient enough to survive the road beyond.",
    pattern: ENEMIES.regent.pattern.map(p => p.kind),
    telegraphs: { breach: "The crown burns green. The gate issues its challenge.", sever: "An iron gauntlet closes on the strongest line.", strike: "The Regent draws back its great armored hand.", corrupt: "Centuries of tarnish spill from the opened plates.", charge: "The crown rises. Crownfall comes next turn: interrupt it or brace." },
    counterplay: ENEMIES.regent.trait, defeated: "The copper gates open. Beyond them, glass bells are ringing.",
  },
  cantor: {
    name: "The Hollow Choir", title: "The silence behind every voice",
    motive: "The cathedral gathered every voice the Blackout left unanswered. Its keeper cannot bear to let even one escape, so every new connection becomes another sealed bell.",
    pattern: ENEMIES.cantor.pattern.map(p => p.kind),
    telegraphs: { corrupt: "A ring of masks begins a new refrain.", jam: "One porcelain face turns toward your living route.", breach: "The great bell swings. The whole cathedral answers.", charge: "The Choir draws its last breath. Requiem comes next turn." },
    counterplay: ENEMIES.cantor.trait, defeated: "The masks open their mouths. This time, the voices leave.",
  },
  prophet: {
    name: "Rust Prophet", title: "The ground remembers every failure",
    motive: "Once a maintenance beacon, it now broadcasts the corrosion it was built to prevent. Every answered signal spreads another bloom of rust.",
    pattern: ENEMIES.prophet.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Its censer tilts toward your busiest band. Rust is taking root.", strike: "Oxide gathers at the transmitter's eye.", breach: "The beacon discharges its poisoned reserve." },
    counterplay: `Corrosion lasts two turns and adds ${RULES.corrosionDamage} incoming damage while your hardware occupies the band. Purge Field cleanses it; a Quarantine Rule cancels the next field; relocating every device out of the band also avoids the damage — but splitting a cluster costs its +${RULES.clusterDamage}.`,
    defeated: "The censer cools. Clean light returns to the copper.",
  },
  widow: {
    name: "Prism Widow", title: "A beautiful silence, carefully woven",
    motive: "An optical repair automaton keeps weaving isolation webs around the last working signals. Its glass threads are flawless. Nothing gets through.",
    pattern: ENEMIES.widow.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Violet threads converge on a band in your strongest route.", sever: "A glass limb draws tight against an exposed cable.", strike: "The prism gathers a painful flash of stored light." },
    counterplay: `Suppression costs your primary route ${RULES.suppressionPenalty} damage for each suppressed band it crosses, for two turns. Reroute: build a stronger channel through another band and it becomes the primary route. Or cleanse the band with Purge Field.`,
    defeated: "The glass web unravels. Light takes the long way home.",
  },
  colossus: {
    name: "Ferric Colossus", title: "The furnace that never stopped",
    motive: "A smelter guardian still protects its cold industrial heart. It trusts only the iron around it and the redundant safety circuits its makers left behind.",
    pattern: ENEMIES.colossus.pattern.map(p => p.kind),
    telegraphs: { strike: "A vast iron fist rises above the table.", corrupt: "The furnace vents over your busiest band.", breach: "Its armored gates open on a final surge of heat." },
    counterplay: `Its armor absorbs ${RULES.gradedArmorBase}, minus ${RULES.gradedArmorPerChannel} for every channel beyond the first — build width, or hit hard enough that the armor stops mattering. Cleanse scorched ground or evacuate the band; online firewalls and shields soften its heavy attacks.`,
    defeated: "The furnace door settles. Even iron can learn to rest.",
  },
  leech: {
    name: "Packet Leech",
    title: "A collector with nowhere to deliver",
    motive:
      "Recovery drones once gathered stray traffic for the exchange. With no exchange answering, this one drains live connections to keep its overflowing buffer powered.",
    pattern: ENEMIES.leech.pattern.map(p => p.kind),
    telegraphs: {
      strike: "Its intake opens. The collector is drawing power from your line.",
      sever: "A retrieval claw reaches for an exposed cable.",
      breach: "Its buffer spills toward your delivery port.",
      infect: "A siphon tap uncoils toward an empty socket on your table.",
    },
    counterplay:
      `Keep damage flowing: a transmission that deals nothing lets the Leech recover ${RULES.leechHeal} health, and each siphon tap it plants feeds it ${RULES.leechTapHeal} more after it acts. Scrub taps for ${RULES.scrubCost} energy. Block its strikes; an online firewall softens the breach.`,
    defeated: "The collector goes quiet. Its last packet joins your outbound queue.",
  },
  wraith: {
    name: "Cable Wraith",
    title: "The isolation crew never stood down",
    motive:
      "This cable-cutting machine severed damaged routes during the evacuation. It still treats every fresh connection as another path the storm could take.",
    pattern: ENEMIES.wraith.pattern.map(p => p.kind),
    telegraphs: {
      sever: "The isolation blade aligns with your longest unarmored cable.",
      strike: "The cutter turns its stored charge toward your terminals.",
      jam: "A suppression coil searches for unprotected hardware.",
    },
    counterplay:
      `Its blade always takes the longest unarmored cable — honeypots don't fool it — and a span longer than ${RULES.cableExposureLength} units also causes 1 damage. Armor that link, shorten spans by relocating, arm a Failover Policy, or keep a second channel so the cut can't silence you.`,
    defeated: "The blade folds away. For once, a new cable stays connected.",
  },
  storm: {
    name: "Null Storm",
    title: "A thousand unanswered retries",
    motive:
      "No one is sending this traffic anymore. Emergency packets circulate through broken return routes, feeding a storm that overwhelms any hardware still willing to listen.",
    pattern: ENEMIES.storm.pattern.map(p => p.kind),
    telegraphs: {
      jam: "Duplicate requests concentrate in the announced table band.",
      strike: "The returning wave carries a surge toward your terminals.",
      sever: "A standing wave gathers along an exposed cable.",
    },
    counterplay:
      `Its jam band cycles North, Center, then South. Protect critical hardware, relocate it out of the marked band for ${RULES.relocateCost} energy, or put a honeypot there to take the jam. Channels with routers in opposite outer bands also give ${RULES.separatedCircuitShield} shield.`,
    defeated: "The echoes thin. One clean acknowledgement crosses the silence.",
  },
  sentinel: {
    name: "Gate Sentinel",
    title: "A checkpoint without a relief shift",
    motive:
      "The Sentinel guards the archive's trust boundary. Its operators are gone, its credentials have expired, and every returning engineer now arrives as an unknown sender.",
    pattern: ENEMIES.sentinel.pattern.map(p => p.kind),
    telegraphs: {
      breach: "The plated gate issues its challenge directly into your route.",
      sever: "An isolation latch prepares to close an exposed connection.",
      strike: "The checkpoint commits its reserve power to a strike.",
    },
    counterplay:
      `Any online firewall bypasses the Sentinel's plating and blocks ${RULES.firewallBreachBlock} of each breach — it only has to sit on some live route. Add block or arm an IPS Signature for the breach, then a Failover Policy for the cut that follows.`,
    defeated: "The checkpoint releases its lock. The archive remains intact.",
  },
  core: {
    name: "Blackout Core",
    title: "Keeper of the undelivered",
    motive:
      "The Core did not start the disaster; its quarantine stopped the retry storm from erasing the archive. With no safe-route acknowledgement, it has kept the backbone dark and the last messages alive.",
    pattern: ENEMIES.core.pattern.map(p => p.kind),
    telegraphs: {
      sever: "Quarantine shutters prepare to isolate an exposed cable.",
      breach: "The archive gate discharges into the incoming route.",
      jam: "Suppression coils seek hardware without jam protection.",
      strike: "The Core redirects its remaining reserve toward your terminals.",
      infect: "A quarantine seed drifts down toward an open socket.",
      charge: "Event Horizon: the shell draws every light in the room inward.",
    },
    counterplay:
      "Prepare for cut, breach, jam, then strike. Its cut also slips a Worm into your draw pile. At half integrity its emergency mode adds damage and every jam plants malware; keep a second channel live, scrub what it plants, and buffer or burst through Total Blackout.",
    defeated: "The isolation shell falls silent. Inside it, the delivery lights are still on.",
  },
};

export function enemyStory(id: string): EnemyStory | undefined {
  return Object.hasOwn(ENEMY_STORIES, id)
    ? ENEMY_STORIES[id as StoryEnemyId]
    : undefined;
}

export interface ArchetypeStory {
  title: string;
  story: string;
  epilogue: string;
}

export const ARCHETYPE_STORIES: Record<Archetype, ArchetypeStory> = {
  architect: {
    title: "MAKE A WAY THROUGH",
    story:
      "You built the return routes before the ring broke. With your Hot Swap kit and the old plans, you have come back to give the waiting traffic somewhere to go.",
    epilogue: "This time, your route carries a reply all the way home.",
  },
  warden: {
    title: "HOLD WHAT REMAINS",
    story:
      "Your crew closed the backbone to save the archive. Every blow the boundary absorbs now becomes pressure you can send back. Bring the messages home.",
    epilogue: "The boundary opens. Everything you stayed to protect passes through.",
  },
  ghost: {
    title: "FIND THE HIDDEN PATH",
    story:
      "You recovered messages from the relays everyone else abandoned. One in your Deep Cache is addressed to you; first, you must find a way to deliver the rest.",
    epilogue: "At the end of the queue, your own message arrives: Made it down. Your turn.",
  },
};

export interface SanctuaryStory {
  title: string;
  description: string;
  fragment: string;
}

export const SANCTUARY_STORIES: readonly SanctuaryStory[] = [
  {
    title: "The warming bench",
    description:
      "A work lamp shines on a repair left half finished. The tools are still laid out in order, as if their owner might return for the next shift.",
    fragment: "Use what you need. Leave a working lamp.",
  },
  {
    title: "The keeper's drawer",
    description:
      "Someone sorted the spare parts by what they could still save. Beside the drawer, a maintenance log ends with a list of names and the words: all accounted for.",
    fragment: "A useful thing deserves another journey.",
  },
  {
    title: "The last lamp",
    description:
      "Through the glass, the quarantine gate turns without a sound. You clear a little space on the bench; whatever you leave here may help whoever follows.",
    fragment: "There is room for one more at the bench.",
  },
];

/** The current map has one early sanctuary and two late sanctuary branches. */
export function sanctuaryStory(floor: number, lane = 0): SanctuaryStory {
  return SANCTUARY_STORIES[floor < 5 ? 0 : lane < 1 ? 1 : 2];
}

export interface OutcomeStory {
  eyebrow: string;
  title: string;
  description: string;
}

export const OUTCOMES: Record<"won" | "lost", OutcomeStory> = {
  won: {
    eyebrow: "THE BACKBONE LIVES AGAIN",
    title: "And then, an answer.",
    description:
      "The isolation shell opens. Across the relays, the messages it sheltered begin their final journey: arrivals, apologies, a promise kept late. From somewhere below the broken ring, a new acknowledgement returns. Someone is still there.",
  },
  lost: {
    eyebrow: "THIS ROUTE GOES DARK",
    title: "Not every route makes it home.",
    description:
      "Your transmission fades before the last gate opens. Behind it, the Core keeps the undelivered messages safe. They are still waiting; another expedition may yet find a way through.",
  },
};
