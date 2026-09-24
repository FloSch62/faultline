/** Self-contained icon and escaping helpers for the training and handbook markup.
 * Same line icons as the game interface, duplicated so these modules stay
 * independent of ui.ts while the interface is being rebuilt. */
export const esc = (value: unknown) =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const PATHS: Record<string, string> = {
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  back: '<path d="M21 12H4m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  heart: '<path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 8-7 5.3 5.3 0 0 1 9 6L12 21Z"/>',
  bolt: '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
  deck: '<rect x="5" y="5" width="13" height="16" rx="1"/><path d="M9 2h12v15M9 12l3-3 3 3-3 3-3-3Z"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  link: '<path d="m10 8 4-4a5 5 0 0 1 7 7l-4 4m-3 1-4 4a5 5 0 0 1-7-7l4-4m1 7 8-8"/>',
  sword: '<path d="m5 20 5-5m-4-3 6 6m-4-4L19 3l2 0 0 2-11 11"/>',
  elite: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>',
  cache: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11"/>',
  forge: '<path d="m4 3 5 5-1 4-5-1a6 6 0 0 0 8 6l5 5 5-5-5-5a6 6 0 0 0-8-8l3 4-3 3-4-4Z"/>',
  boss: '<path d="m12 1 3 6 7 2-4 6 1 7-7-3-7 3 1-7-4-6 7-2 3-6Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  book: '<path d="M12 5C8 2 4 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v16"/>',
  undo: '<path d="M4 4v7h7M4 11c3-9 16-7 16 2a7 7 0 0 1-7 7"/>',
  play: '<path d="m7 4 13 8-13 8V4Z"/>',
  field: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 5 3v5l-5 3-5-3v-5l5-3Z"/><path d="M12 2v5m9 0-4 3m4 7-4-2m-5 7v-4m-9-1 4-2M3 7l4 3"/>',
  cleanse: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  eye: '<circle cx="11" cy="10" r="7"/><circle cx="11" cy="10" r="3"/><path d="m16 15 5 6M11 1v3M2 10h3m12 0h3"/>',
  battery: '<path d="M8 3h8v3h3v15H5V6h3V3Z"/><path d="m13 8-4 6h4l-1 4 4-6h-4l1-4Z"/>',
  coins: '<path d="m12 3 8 5v8l-8 5-8-5V8l8-5Z"/><path d="m12 7 4 3v4l-4 3-4-3v-4l4-3Z"/>',
  crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 14H5L2 6Z"/>',
  hint: '<path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  warning: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4m0 3v.5"/>',
  // Route-chart rooms, as drawn on the real map.
  stall: '<path d="M3 9h18l-2-5H5L3 9Zm0 0v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 14v7h14v-7M10 21v-4h4v4"/>',
  unknown: '<path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.1v.7"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/><path d="m12 2 10 10-10 10L2 12 12 2Z"/>',
};

export function icon(name: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? PATHS.bolt}</svg>`;
}

/** Static speckles inside the 16-unit diamond: fixed positions, so every UNKNOWN glyph reads the same. */
const STATIC = [
  [7.2, 3.6, .9], [5.1, 6.2, .5], [8.8, 5.4, .7], [10.6, 7.4, .45], [3.8, 8.1, .8], [6.6, 8.6, .35], [9.2, 9.1, .9],
  [11.4, 8.9, .55], [5.4, 10.2, .6], [7.8, 11, .75], [9.6, 11.6, .4], [7.4, 6.8, .6], [8.1, 13, .5], [12.3, 7.6, .35],
] as const;
/** The designation mark: a small engraved diamond, coral for a bad ribbon, teal for a good one,
 * and for a hidden ribbon the UNKNOWN glyph, a diamond filled with static. Colours live in CSS
 * (.designation-mark.bad / .good / .unknown), so the chart, the plates and the Handbook share it. */
export function designationMark(kind: "bad" | "good" | "unknown", size = 14): string {
  const core = kind === "unknown"
    ? `<path class="dm-well" d="M8 2.6 13.4 8 8 13.4 2.6 8Z"/>${STATIC.map(([x, y, o]) => `<rect class="dm-static" x="${x}" y="${y}" width="${o > .6 ? 1.5 : 1.1}" height=".8" opacity="${o}"/>`).join("")}`
    : `<path class="dm-core" d="M8 4.2 11.8 8 8 11.8 4.2 8Z"/>`;
  return `<svg class="designation-mark ${kind}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path class="dm-rim" d="M8 .8 15.2 8 8 15.2.8 8Z"/>${core}</svg>`;
}

/** Engraved motifs of the ten designation ribbons, drawn inside the 16-unit diamond (radius ≤ 5
 * around 8,8) so they read at 14 px on the chart and 18 px on the plates. Filled parts use
 * `dg-fill`, engraved lines `dg-line`; colours come from CSS (coral bad, teal good). */
const DESIGNATION_MOTIFS: Record<string, string> = {
  // Three eggs in a cradle: it seeds the ground.
  nesting: '<path class="dg-line" d="M4.6 8.6q3.4 3.2 6.8 0"/><circle class="dg-fill" cx="6.4" cy="7.4" r="1.05"/><circle class="dg-fill" cx="9.6" cy="7.4" r="1.05"/><circle class="dg-fill" cx="8" cy="5.6" r="1.05"/>',
  // A riveted plate across the diamond.
  armored: '<path class="dg-fill" d="M4.2 6.6h7.6v2.8H4.2Z"/><circle class="dg-well" cx="5.4" cy="8" r=".45"/><circle class="dg-well" cx="10.6" cy="8" r=".45"/>',
  // A flame: its governor is stuck open.
  stoked: '<path class="dg-fill" d="M8 3.6c1.9 1.9 2.9 3.4 2.9 5.1A2.9 2.9 0 0 1 5.1 8.7c0-1.1.5-1.9 1.3-2.6.1.9.5 1.4 1 1.6-.3-1.4.1-2.8.6-4.1Z"/>',
  // A diamond cast off in two halves.
  shedding: '<path class="dg-fill" d="M7.3 4.4v7.2L3.7 8Z"/><path class="dg-fill" d="M8.7 4.4 12.3 8 8.7 11.6Z"/>',
  // A hexagonal bolt head.
  hardened: '<path class="dg-fill" d="M8 4.3 11.2 6.1v3.8L8 11.7 4.8 9.9V6.1Z"/><circle class="dg-well" cx="8" cy="8" r="1.1"/>',
  // A spike driven into a rail.
  rigged: '<path class="dg-fill" d="M8 3.8 10 10.2H6Z"/><path class="dg-line" d="M4.6 11.4h6.8"/>',
  // Open jaws.
  hungry: '<path class="dg-line" d="M4.6 6.2 8 9.6l3.4-3.4M5.8 10.6 8 12l2.2-1.4"/>',
  // A thorn crossed through: it answers after death.
  spiteful: '<path class="dg-line" d="M5.4 5.4l5.2 5.2m0-5.2-5.2 5.2"/><circle class="dg-fill" cx="8" cy="8" r="1.1"/>',
  // A sealed letter.
  laden: '<path class="dg-fill" d="M4.4 6h7.2v4.4H4.4Z"/><path class="dg-well-line" d="m4.4 6 3.6 2.6L11.6 6"/>',
  // A cog of spare parts.
  salvaged: '<circle class="dg-line" cx="8" cy="8" r="2.3"/><path class="dg-line" d="M8 4.2v1.3m0 5v1.3M4.2 8h1.3m5 0h1.3M5.3 5.3l.9.9m3.6 3.6.9.9m0-5.4-.9.9M6.2 9.8l-.9.9"/>',
};
/** A designation's ribbon glyph: the engraved diamond with its own motif, coral for a bad
 * designation, teal for a good one; "unknown" is the static-filled UNKNOWN glyph. */
export function designationGlyph(id: string, size = 18, kind?: "bad" | "good"): string {
  if (id === "unknown" || !DESIGNATION_MOTIFS[id]) return designationMark("unknown", size).replace('class="designation-mark unknown"', 'class="designation-mark designation-glyph unknown"');
  const tone = kind ?? (id === "laden" || id === "salvaged" ? "good" : "bad");
  return `<svg class="designation-mark designation-glyph ${tone} dg-${id}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path class="dm-rim" d="M8 .8 15.2 8 8 15.2.8 8Z"/><path class="dg-inlay" d="M8 2.4 13.6 8 8 13.6 2.4 8Z"/>${DESIGNATION_MOTIFS[id]}</svg>`;
}

/** The same icon nested inside an SVG diagram, centred on (x, y). */
export function glyph(name: string, size: number, x = 0, y = 0): string {
  return `<svg class="hb-glyph" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? PATHS.bolt}</svg>`;
}
