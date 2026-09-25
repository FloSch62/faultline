/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Shared deterministic helpers for combat and expedition rules. */
import type { RunState } from "./types.ts";

export function random(run: RunState): number {
  let x = run.rng || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  run.rng = x >>> 0;
  return run.rng / 0x100000000;
}
export function shuffle<T>(run: RunState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(run) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function log(run: RunState, message: string) {
  run.log = [message, ...run.log].slice(0, 40);
}
