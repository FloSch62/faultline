/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** One colour per channel, shared by the table (cables, device skirts, packet glyphs) and the
 * HUD (delivery rows, the channel chip). Index i is channel i of the forecast's channelPaths and
 * deliveries (0 is the primary channel). Gold and cyan stay the first two, as in v3; the rest
 * keep clear of the table's warning colours (Siphon magenta, fray amber, fault red, armor brass)
 * and of the amplified fibre below. */
export const CHANNEL_PALETTE = [0xf2c46d, 0x6fe0f0, 0x9fe38a, 0x7f9dff, 0xe9edf2, 0xff9fc4] as const;

export function channelColor(index: number): number {
  return CHANNEL_PALETTE[((index % CHANNEL_PALETTE.length) + CHANNEL_PALETTE.length) % CHANNEL_PALETTE.length];
}

/** The same colour as a CSS hex string, for `--channel` on HUD rows. */
export function channelCss(index: number): string {
  return `#${channelColor(index).toString(16).padStart(6, "0")}`;
}

/** The fibre of an amplified cable (Amplified Fiber, VXLAN Tunnel) and the amplifier ring of a
 * compressed switch: an electric violet no channel uses, so an amplified span reads as amplified
 * whichever channel's colour its sheath carries. */
export const AMPLIFIED_COLOR = 0x9b5cff;
export const AMPLIFIED_CSS = `#${AMPLIFIED_COLOR.toString(16).padStart(6, "0")}`;
