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

/** The same icon nested inside an SVG diagram, centred on (x, y). */
export function glyph(name: string, size: number, x = 0, y = 0): string {
  return `<svg class="hb-glyph" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? PATHS.bolt}</svg>`;
}
