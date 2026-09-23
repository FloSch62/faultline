import { CARDS, baseCard, isUpgraded } from "./core/cards.ts";
import { costFor } from "./core/run.ts";
import type { BaseCardId, CardId, RunState } from "./core/types.ts";
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function icon(name: string, size = 18): string {
  const p: Record<string, string> = {
    arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
    back: '<path d="M21 12H4m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    heart:
      '<path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 8-7 5.3 5.3 0 0 1 9 6L12 21Z"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
    deck: '<rect x="5" y="5" width="13" height="16" rx="1"/><path d="M9 2h12v15M9 12l3-3 3 3-3 3-3-3Z"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
    sound:
      '<path d="M3 9v6h4l5 4V5L7 9H3Zm12 0a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
    mute: '<path d="M3 9v6h4l5 4V5L7 9H3Zm13 0 5 6m0-6-5 6"/>',
    full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    shield:
      '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    link: '<path d="m10 8 4-4a5 5 0 0 1 7 7l-4 4m-3 1-4 4a5 5 0 0 1-7-7l4-4m1 7 8-8"/>',
    sword: '<path d="m5 20 5-5m-4-3 6 6m-4-4L19 3l2 0 0 2-11 11"/>',
    elite: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>',
    cache: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11"/>',
    forge:
      '<path d="m4 3 5 5-1 4-5-1a6 6 0 0 0 8 6l5 5 5-5-5-5a6 6 0 0 0-8-8l3 4-3 3-4-4Z"/>',
    boss: '<path d="m12 1 3 6 7 2-4 6 1 7-7-3-7 3 1-7-4-6 7-2 3-6Z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    download: '<path d="M12 2v14m-5-5 5 5 5-5M4 17v5h16v-5"/>',
    book: '<path d="M12 5C8 2 4 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v16"/>',
    undo: '<path d="M4 4v7h7M4 11c3-9 16-7 16 2a7 7 0 0 1-7 7"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    field: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 5 3v5l-5 3-5-3v-5l5-3Z"/><path d="M12 2v5m9 0-4 3m4 7-4-2m-5 7v-4m-9-1 4-2M3 7l4 3"/>',
    cleanse: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    eye: '<circle cx="11" cy="10" r="7"/><circle cx="11" cy="10" r="3"/><path d="m16 15 5 6M11 1v3M2 10h3m12 0h3"/>',
    battery: '<path d="M8 3h8v3h3v15H5V6h3V3Z"/><path d="m13 8-4 6h4l-1 4 4-6h-4l1-4Z"/>',
    anchor: '<path d="M12 7v14M3 13l2 5 7 4 7-4 2-5M7 10h10"/><circle cx="12" cy="4" r="3"/>',
    coins: '<path d="m12 3 8 5v8l-8 5-8-5V8l8-5Z"/><path d="m12 7 4 3v4l-4 3-4-3v-4l4-3Z"/>',
    crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 14H5L2 6Z"/>',
    // v3 battle HUD
    console: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m7 9 3 2.5L7 14m5 0h5M8 21h8"/>',
    protocol: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="M12 7v5l3 2"/>',
    trigger: '<path d="m13 2-8 11h6l-1 9 9-12h-6l0-8Z"/><path d="M3 7h3M18 17h3"/>',
    malware: '<path d="M12 3 20 8v8l-8 5-8-5V8l8-5Z"/><path d="M9 10h.01M15 10h.01M9 15c2-1.5 4-1.5 6 0M4 8 1 6m22 0-3 2M4 16l-3 2m22 0-3-2"/>',
    channels: '<circle cx="3.5" cy="12" r="2"/><circle cx="20.5" cy="12" r="2"/><path d="M5.5 11c4-6 9-6 13 0M5.5 13c4 6 9 6 13 0M5.5 12h13"/>',
    online: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8m12.8 0a9 9 0 0 0 0-12.8M8.5 8.5a5 5 0 0 0 0 7m7 0a5 5 0 0 0 0-7"/>',
    terrain: '<path d="m2 20 6-9 4 5 3-4 7 8H2Z"/><path d="m8 11 2-7 2 4"/>',
    buffer: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    pressure: '<path d="M4 20V10l8-6 8 6v10"/><path d="M8 20v-6h8v6M12 4v6"/>',
    trap: '<path d="M4 18h16M6 18l2-6h8l2 6"/><path d="M9 12 7 6m8 6 2-6M12 12V4"/>',
    cluster: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="15" r="3"/><path d="M4 21h16"/>',
    next: '<path d="M4 12h12m-4-5 5 5-5 5M20 5v14"/>',
    scrub: '<path d="m4 20 8-8m2-6 4 4-7 7-4-4 7-7Z"/><path d="M15 3l6 6"/>',
    warning: '<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.bolt}</svg>`;
}
/* ------------------------------------------------------------------ card art

Painted art comes from the illustrated atlases. The v3 cards reuse a deliberate
crop of an existing painting, colour-graded to their role, under an etched sigil
drawn for that card; the sigil carries the meaning, the painting the material. */

type Atlas = "base" | "alpha" | "tools" | "zones";
const ATLAS: Record<Atlas, { file: string; grid: number }> = {
  base: { file: "art/card-atlas.png", grid: 3 },
  alpha: { file: "art/alpha-card-atlas.png", grid: 4 },
  tools: { file: "art/containerlab-tools-atlas.png", grid: 2 },
  zones: { file: "art/zone-card-atlas.png", grid: 2 },
};
const PAINTED: Partial<Record<BaseCardId, [Atlas, number]>> = {
  router: ["base", 0], switch: ["base", 1], firewall: ["base", 2], fiber: ["base", 3], crosslink: ["base", 4],
  shield: ["base", 5], patch: ["base", 6], surge: ["base", 7], firmware: ["base", 8],
  guard: ["alpha", 0], pulse: ["alpha", 1], diagnostic: ["alpha", 2], reroute: ["alpha", 3], barrier: ["alpha", 4],
  capacitor: ["alpha", 5], relay: ["alpha", 6], "hardened-router": ["alpha", 7], bastion: ["alpha", 8],
  duplex: ["alpha", 9], "armored-fiber": ["alpha", 10], conduit: ["alpha", 11], salvage: ["alpha", 12],
  mirror: ["alpha", 13], "zero-day": ["alpha", 14], compression: ["alpha", 15], rebuild: ["alpha", 3],
  emergency: ["alpha", 12], protocol: ["alpha", 4],
  "startup-config": ["tools", 0], "linux-bridge": ["tools", 1], vxlan: ["tools", 2], inspect: ["tools", 3],
  "resonance-field": ["zones", 0], "aegis-field": ["zones", 1], "purge-field": ["zones", 2], "null-field": ["zones", 3],
};
const SOLO = new Set<BaseCardId>(["containerlab", "clabernetes", "wireshark"]);

/** v3 cards: [atlas, cell, colour grade, sigil]. */
const SIGILS: Partial<Record<BaseCardId, [Atlas, number, string, string]>> = {
  honeypot: ["alpha", 5, "sepia(.55) hue-rotate(-18deg) saturate(1.7) brightness(.9)",
    '<path d="M22 27h20l4 6v13a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V33l4-6Z"/><path d="M20 27h24M26 21h12v6H26z"/><path d="M26 38c2 4 10 4 12 0"/><circle cx="12" cy="16" r="1.8"/><circle cx="52" cy="14" r="1.8"/><circle cx="54" cy="40" r="1.8"/><path d="M13 18c4 4 8 6 12 8M51 16c-3 4-5 7-7 10M52 40h-6" stroke-dasharray="2 3"/>'],
  "cache-server": ["base", 1, "hue-rotate(185deg) saturate(1.2) brightness(.9)",
    '<ellipse cx="32" cy="17" rx="16" ry="5"/><path d="M16 17v10c0 3 7 5 16 5s16-2 16-5V17M16 27v10c0 3 7 5 16 5s16-2 16-5V27M16 37v9c0 3 7 5 16 5s16-2 16-5v-9"/><path d="M40 25h3M40 35h3M40 45h3"/>'],
  "poe-injector": ["base", 7, "hue-rotate(-12deg) saturate(1.35)",
    '<path d="M25 9v10M39 9v10"/><path d="M18 19h28v11a14 14 0 0 1-28 0V19Z"/><path d="M32 44v11"/><path d="m35 23-7 10h6l-2 7 8-11h-6l1-6Z"/>'],
  "load-balancer": ["alpha", 11, "hue-rotate(-40deg) saturate(1.2)",
    '<circle cx="14" cy="32" r="5"/><path d="M19 32h9"/><path d="M28 32c7 0 9-14 17-14M28 32h17M28 32c7 0 9 14 17 14"/><circle cx="49" cy="18" r="3.6"/><circle cx="49" cy="32" r="3.6"/><circle cx="49" cy="46" r="3.6"/>'],
  "failover-policy": ["alpha", 3, "hue-rotate(95deg) saturate(.9)",
    '<path d="m32 8 18 7v13c0 12-18 22-18 22S14 40 14 28V15l18-7Z"/><path d="M24 31a8 8 0 1 1 3 6"/><path d="M22 37h5v-5"/>'],
  "port-security": ["alpha", 7, "hue-rotate(150deg) saturate(1.1) brightness(.92)",
    '<rect x="14" y="28" width="36" height="21" rx="2"/><path d="M20 37h5M29 37h6M39 37h5"/><path d="M24 28v-6a8 8 0 0 1 16 0v6"/><circle cx="32" cy="43" r="2.4"/>'],
  "rate-limiter": ["alpha", 15, "hue-rotate(160deg) saturate(1.1)",
    '<path d="M12 42a20 20 0 1 1 40 0"/><path d="m32 42 10-15"/><circle cx="32" cy="42" r="3"/><path d="m16 30 3 2M24 21l2 3M40 21l-2 3M48 30l-3 2"/><path d="M20 51h24"/>'],
  "ips-signature": ["base", 2, "hue-rotate(-70deg) saturate(1.15)",
    '<path d="m32 8 18 7v13c0 12-18 22-18 22S14 40 14 28V15l18-7Z"/><path d="M20 29s5-7 12-7 12 7 12 7-5 7-12 7-12-7-12-7Z"/><circle cx="32" cy="29" r="3"/>'],
  "quarantine-rule": ["alpha", 0, "hue-rotate(-95deg) saturate(1.2)",
    '<circle cx="32" cy="32" r="21" stroke-dasharray="4 3"/><path d="m32 17 13 7.5v15L32 47l-13-7.5v-15L32 17Z"/><path d="m27 27 10 10M37 27 27 37"/>'],
  tarpit: ["base", 8, "hue-rotate(-18deg) saturate(1.2) brightness(.8)",
    '<path d="M32 32a3 3 0 1 1 3 3 7 7 0 1 1-8-8 11 11 0 1 1 13 13 15 15 0 1 1-18-18"/><path d="m12 52 6-6M52 52l-6-6"/>'],
  ecmp: ["base", 3, "hue-rotate(10deg) saturate(1.25)",
    '<circle cx="11" cy="32" r="4"/><circle cx="53" cy="32" r="4"/><path d="M15 30c8-13 26-13 34 0M15 34c8 13 26 13 34 0M15 32h34"/><path d="m43 19 5 3-5 3M43 40l5 3-5 3"/>'],
  "spine-leaf": ["alpha", 6, "hue-rotate(12deg) saturate(1.2)",
    '<rect x="15" y="10" width="11" height="8" rx="1"/><rect x="38" y="10" width="11" height="8" rx="1"/><rect x="8" y="46" width="11" height="8" rx="1"/><rect x="26.5" y="46" width="11" height="8" rx="1"/><rect x="45" y="46" width="11" height="8" rx="1"/><path d="M20.5 18 13.5 46M20.5 18 32 46M20.5 18l30 28M43.5 18l-30 28M43.5 18 32 46M43.5 18l7 28"/>'],
  "mesh-weave": ["alpha", 9, "hue-rotate(25deg) saturate(1.1)",
    '<circle cx="32" cy="11" r="3.2"/><circle cx="13" cy="28" r="3.2"/><circle cx="51" cy="28" r="3.2"/><circle cx="21" cy="51" r="3.2"/><circle cx="43" cy="51" r="3.2"/><path d="M29.6 13.2 15.4 25.8M34.4 13.2l14.2 12.6M14 31.2l5.8 16.6M50 31.2l-5.8 16.6M24.2 51h15.6M16.2 28h31.6M31 14.2l-8.6 33.6M33 14.2l8.6 33.6"/>'],
  "deep-inspection": ["alpha", 2, "hue-rotate(-150deg) saturate(1.3)",
    '<rect x="10" y="12" width="26" height="19" rx="2"/><path d="M15 19h16M15 24h10"/><circle cx="39" cy="37" r="11"/><path d="m47 45 8 8M35 37h8M39 33v8"/>'],
  "stateful-firewall": ["alpha", 8, "hue-rotate(-8deg) saturate(1.35)",
    '<path d="M11 53V19l8-6 8 6v34M37 53V19l8-6 8 6v34"/><path d="M27 30h10M27 41h10"/><path d="M15 26h8M15 34h8M15 42h8M41 26h8M41 34h8M41 42h8"/>'],
  reflect: ["alpha", 13, "hue-rotate(-160deg) saturate(1.3)",
    '<path d="M47 8v48"/><path d="M11 23h26l6 6"/><path d="m43 35-6 6H11"/><path d="m16 18-5 5 5 5M16 36l-5 5 5 5"/>'],
  "store-forward": ["alpha", 10, "hue-rotate(40deg) saturate(1.1)",
    '<rect x="17" y="31" width="30" height="20" rx="2"/><path d="m17 33 15 9 15-9"/><path d="M21 25h22M25 19h14"/><path d="M32 5v9m-4-4 4 4 4-4"/>'],
  "replay-attack": ["alpha", 14, "hue-rotate(-110deg) saturate(1.1)",
    '<path d="M17 27a16 16 0 0 1 29-7"/><path d="m47 12-1 8-8-1"/><path d="M47 37a16 16 0 0 1-29 7"/><path d="m17 52 1-8 8 1"/><path d="m28 26 10 6-10 6Z"/>'],
  "dark-fiber": ["alpha", 10, "grayscale(.7) brightness(.62) contrast(1.2)",
    '<circle cx="32" cy="32" r="14"/><path d="M27 21a14 14 0 0 0 0 22"/><path d="M5 32h13M46 32h13"/><path d="M18 32h28" stroke-dasharray="3 4"/>'],
  "packet-loss": ["base", 4, "grayscale(.85) brightness(.6) contrast(1.25)",
    '<path d="M10 20h15l4 6-4 6H10z"/><path d="M35 32h15l4 6-4 6H35z" stroke-dasharray="3 3"/><path d="m27 46 5-7 5 7"/><path d="M20 52h7M38 12h9" stroke-dasharray="2 3"/>'],
  worm: ["alpha", 12, "hue-rotate(60deg) saturate(1.6) brightness(.75)",
    '<circle cx="15" cy="42" r="5.2"/><circle cx="24.5" cy="36" r="5.2"/><circle cx="34" cy="31.5" r="5.2"/><circle cx="43.5" cy="27" r="5.2"/><circle cx="50.5" cy="18" r="4.4"/><path d="m53 13.5 3.5-3.5M48.5 13l-1-4.5"/>'],
  cve: ["base", 8, "hue-rotate(-30deg) saturate(1.4) brightness(.62)",
    '<path d="M32 8 57 53H7L32 8Z"/><path d="M32 24v15"/><circle cx="32" cy="46" r="1.9"/>'],
};

function atlasStyle(atlas: Atlas, cell: number) {
  const { file, grid } = ATLAS[atlas], step = 100 / (grid - 1);
  return `--card-image:url('${asset(file)}');--art-size:${grid * 100}% ${grid * 100}%;--art-x:${(cell % grid) * step}%;--art-y:${Math.floor(cell / grid) * step}%`;
}
/** CSS custom properties that paint a card's picture (upgraded ids share the base art). */
export function artStyle(id: string) {
  const base = (id.endsWith("+") ? id.slice(0, -1) : id) as BaseCardId;
  if (SOLO.has(base)) return `--card-image:url('${asset(`art/${base}.png`)}');--art-size:cover;--art-x:50%;--art-y:50%`;
  const sigil = SIGILS[base];
  if (sigil) return `${atlasStyle(sigil[0], sigil[1])};--art-filter:${sigil[2]}`;
  const painted = PAINTED[base];
  return painted ? atlasStyle(painted[0], painted[1]) : atlasStyle("base", 0);
}
/** The etched sigil over a v3 card's picture, or "" for fully painted cards. */
export function cardSigil(id: CardId): string {
  const sigil = SIGILS[baseCard(id)];
  return sigil ? `<span class="card-sigil" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${sigil[3]}</svg></span>` : "";
}

const ARCHETYPE_MARK: Record<string, string> = { architect: "ARCHITECT", warden: "WARDEN", ghost: "GHOST" };
export function cardMarkup(
  id: CardId,
  index = 0,
  variant: "hand" | "reward" | "collection" = "hand",
  run?: RunState,
  selected = false,
) {
  const c = CARDS[id];
  const inHand = variant === "hand" && !!run;
  const cost = inHand ? costFor(run!, index) : c.cost;
  const central = inHand ? index - (run!.hand.length - 1) / 2 : 0;
  const junk = !!(c.junk || c.curse);
  const upgradedCard = isUpgraded(id);
  const blocked = inHand && (c.unplayable || cost > run!.energy);
  const kind = c.protocol ? "protocol" : junk ? "junk" : c.target;
  const type = junk
    ? `${c.curse ? "CURSE" : "JUNK"}${c.unplayable ? " · UNPLAYABLE" : " · DELETE IT"}`
    : `${c.subtitle.split(" / ").at(-1)}${c.protocol ? " · ARMED" : ""}${c.exhaust ? " · EXHAUST" : ""}`;
  const label = `${c.name}, ${c.unplayable ? "unplayable" : `${cost} energy`}. ${c.rules}`;
  return `<button class="game-card rarity-${c.rarity} kind-${kind} ${upgradedCard ? "upgraded" : ""} ${junk ? "junk-card" : ""} ${c.curse ? "curse-card" : ""} ${selected ? "selected" : ""} ${blocked ? "unplayable" : ""}" data-${variant}="${variant === "hand" ? index : id}" data-card-id="${id}" style="${artStyle(id)};--card-color:${c.color};--angle:${Math.max(-10, Math.min(10, central * 3))}deg;--lift:${Math.min(15, Math.abs(central) * 5)}px;--order:${index}" aria-label="${esc(label)}"><span class="card-image"></span>${cardSigil(id)}<span class="card-etch"></span><span class="card-cost ${c.unplayable ? "no-cost" : ""}">${c.unplayable ? "✕" : cost}</span>${upgradedCard ? '<span class="card-upgrade-mark" aria-hidden="true">+</span>' : ""}<span class="card-heading">${esc(c.name)}</span><span class="card-copy"><span class="card-type">${type}</span><span class="card-rule">${esc(c.rules)}</span></span><span class="card-footer"><span>${c.rarity === "special" ? (c.curse ? "curse" : "junk") : c.rarity}${c.archetype ? ` · ${ARCHETYPE_MARK[c.archetype]}` : ""}</span><span class="card-gem">${c.protocol ? "⌁" : "◆"}</span><span>${variant === "hand" ? `<kbd>${index === 9 ? "0" : index + 1}</kbd>` : upgradedCard ? "UPGRADED" : "CLAB"}</span></span></button>`;
}
