/** One colour per channel, shared by the table (cables, device skirts, packet glyphs) and the
 * HUD (delivery rows, the channel chip). Index i is channel i of the forecast's channelPaths and
 * deliveries (0 is the primary channel). */
export const CHANNEL_PALETTE = [0xf2c46d, 0x6fe0f0, 0x9fe38a, 0xc3a6ff, 0xf6a36b, 0x7fb0ff] as const;

export function channelColor(index: number): number {
  return CHANNEL_PALETTE[((index % CHANNEL_PALETTE.length) + CHANNEL_PALETTE.length) % CHANNEL_PALETTE.length];
}

/** The same colour as a CSS hex string, for `--channel` on HUD rows. */
export function channelCss(index: number): string {
  return `#${channelColor(index).toString(16).padStart(6, "0")}`;
}
