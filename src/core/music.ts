/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import { STAGES } from "./stages.ts";

export type ScoreScene = "explore" | "battle" | "boss" | "shop" | "sanctuary" | "elite";
export const TRACK_TITLES: Record<string, string> = {
  "the-last-relay": "The Last Relay", "signal-and-steel": "Signal & Steel",
  "the-blackout-core": "The Blackout Core", "the-copper-market": "The Copper Market",
  "a-light-left-on": "A Light Left On", "a-thousand-fractures": "A Thousand Fractures",
  "copperlight-pursuit": "Copperlight Pursuit", "ghosts-in-the-relay": "Ghosts in the Relay",
  "redline-protocol": "Redline Protocol", "paths-of-copper": "Paths of Copper",
  "the-second-way-home": "The Second Way Home", "prismatic-silence": "Prismatic Silence",
  "shatter-the-choir": "Shatter the Choir", "messages-in-the-dark": "Messages in the Dark",
  "deliver-the-dawn": "Deliver the Dawn", "kingdom-of-rust": "Kingdom of Rust",
  "sparks-on-the-wire": "Sparks on the Wire", "refraction": "Refraction",
  "bells-of-broken-glass": "Bells of Broken Glass", "quarantine-breach": "Quarantine Breach",
  "hold-the-line": "Hold the Line",
};

/** A null stage is the title/character-selection screen, outside the expedition. */
export function sceneTrack(scene: Exclude<ScoreScene, "battle">, stage: number | null): string {
  if (scene === "shop") return "the-copper-market";
  if (scene === "sanctuary") return "a-light-left-on";
  if (stage === null && scene === "explore") return "the-last-relay";
  return (STAGES[stage ?? 0] ?? STAGES[0]).music[scene];
}

/** Hear the whole set before a repeat; bag boundaries cannot repeat either. */
export class MusicRotation {
  private remaining: string[] = [];
  private last = "";
  private readonly tracks: readonly string[];
  private readonly random: () => number;
  constructor(tracks: readonly string[], random: () => number = Math.random) {
    if (!tracks.length) throw new Error("A music rotation needs at least one track");
    this.tracks = tracks;
    this.random = random;
  }
  next(): string {
    if (!this.remaining.length) {
      this.remaining = [...this.tracks];
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      if (this.remaining.at(-1) === this.last)
        [this.remaining[0], this.remaining[this.remaining.length - 1]] = [this.remaining.at(-1)!, this.remaining[0]];
    }
    return this.last = this.remaining.pop()!;
  }
}
