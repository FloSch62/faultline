export const BATTLE_TRACKS = [
  "signal-and-steel", "copperlight-pursuit", "ghosts-in-the-relay", "redline-protocol",
] as const;

/** Hear the whole set before a repeat; bag boundaries cannot repeat either. */
export class MusicRotation {
  private remaining: string[] = [];
  private last = "";
  private readonly random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  next(): string {
    if (!this.remaining.length) {
      this.remaining = [...BATTLE_TRACKS];
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
