import type { Archetype } from "./core/expedition.ts";
import type { Intent } from "./core/run.ts";

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

export type StoryEnemyId = "leech" | "wraith" | "storm" | "sentinel" | "core";

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
  leech: {
    name: "Packet Leech",
    title: "A collector with nowhere to deliver",
    motive:
      "Recovery drones once gathered stray traffic for the exchange. With no exchange answering, this one drains live connections to keep its overflowing buffer powered.",
    pattern: ["strike", "sever", "breach"],
    telegraphs: {
      strike: "Its intake opens. The collector is drawing power from your line.",
      sever: "A retrieval claw reaches for an exposed cable.",
      breach: "Its buffer spills toward your delivery port.",
    },
    counterplay:
      "Keep a live route: a transmission that deals no damage lets the Leech recover up to 3 health. Block its strikes and route through a firewall before the breach.",
    defeated: "The collector goes quiet. Its last packet joins your outbound queue.",
  },
  wraith: {
    name: "Cable Wraith",
    title: "The isolation crew never stood down",
    motive:
      "This cable-cutting machine severed damaged routes during the evacuation. It still treats every fresh connection as another path the storm could take.",
    pattern: ["sever", "strike", "jam"],
    telegraphs: {
      sever: "The isolation blade aligns with your longest unarmored cable.",
      strike: "The cutter turns its stored charge toward your terminals.",
      jam: "A suppression coil searches for unprotected hardware.",
    },
    counterplay:
      "Its blade always targets the longest unarmored cable; a span longer than 6 units also causes 1 damage. Armor that link, shorten exposed spans by repositioning routers, or keep an independent route ready.",
    defeated: "The blade folds away. For once, a new cable stays connected.",
  },
  storm: {
    name: "Null Storm",
    title: "A thousand unanswered retries",
    motive:
      "No one is sending this traffic anymore. Emergency packets circulate through broken return routes, feeding a storm that overwhelms any hardware still willing to listen.",
    pattern: ["jam", "strike", "sever"],
    telegraphs: {
      jam: "Duplicate requests concentrate in the announced table band.",
      strike: "The returning wave carries a surge toward your terminals.",
      sever: "A standing wave gathers along an exposed cable.",
    },
    counterplay:
      "Its jam band cycles North, Center, then South. Protect critical hardware or relocate it out of the marked band for 1 energy; independent routes through opposite outer bands also give 2 block.",
    defeated: "The echoes thin. One clean acknowledgement crosses the silence.",
  },
  sentinel: {
    name: "Gate Sentinel",
    title: "A checkpoint without a relief shift",
    motive:
      "The Sentinel guards the archive's trust boundary. Its operators are gone, its credentials have expired, and every returning engineer now arrives as an unknown sender.",
    pattern: ["breach", "sever", "strike"],
    telegraphs: {
      breach: "The plated gate issues its challenge directly into your route.",
      sever: "An isolation latch prepares to close an exposed connection.",
      strike: "The checkpoint commits its reserve power to a strike.",
    },
    counterplay:
      "A firewall on the live route bypasses the Sentinel's 2 plating and blocks up to 3 breach damage. Add temporary block, then prepare for the cable cut that follows.",
    defeated: "The checkpoint releases its lock. The archive remains intact.",
  },
  core: {
    name: "Blackout Core",
    title: "Keeper of the undelivered",
    motive:
      "The Core did not start the disaster; its quarantine stopped the retry storm from erasing the archive. With no safe-route acknowledgement, it has kept the backbone dark and the last messages alive.",
    pattern: ["sever", "breach", "jam", "strike"],
    telegraphs: {
      sever: "Quarantine shutters prepare to isolate an exposed cable.",
      breach: "The archive gate discharges into the incoming route.",
      jam: "Suppression coils seek hardware without jam protection.",
      strike: "The Core redirects its remaining reserve toward your terminals.",
    },
    counterplay:
      "Prepare for cut, breach, jam, then strike. At half integrity its emergency mode adds damage; finish decisively while keeping a protected route live.",
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
      "Your crew closed the backbone to save the archive. Carry its last Shield Array inside, and bring the messages home.",
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
