/** Hover cards for the far rail: hostiles (by port) and delivery packet glyphs.
 * Owned by the targeting work (click to target, readable intents). */
import type { CombatPreview } from "./core/run.ts";
import type { RunState } from "./core/types.ts";
import type { TableHover } from "./three/World.ts";

/** The card's inner markup for a hostile or a delivery, or null for no card. */
export function hoverMarkup(_run: RunState, _preview: CombatPreview, _target: TableHover): string | null {
  return null;
}
