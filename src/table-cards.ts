/** Hover cards for the network on the table: devices, cables and installations.
 * Owned by the table-readability work (channels, shared devices, amplified cables). */
import type { CombatPreview } from "./core/run.ts";
import type { RunState } from "./core/types.ts";
import type { TableHover } from "./three/World.ts";

/** The card's inner markup for a device, cable or installation, or null for no card. */
export function hoverMarkup(_run: RunState, _preview: CombatPreview, _target: TableHover): string | null {
  return null;
}
