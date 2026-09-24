import * as THREE from "three";
import type { InstallationKind } from "../core/types.ts";

/**
 * Canvas-drawn table furniture: device nameplates, installation tags, the countdown numeral, packet
 * glyphs and kind glyphs. Everything is an engraved iron or brass object in the game's faces (Grenze
 * numerals and names), never a web label. (The hostiles' plates are DOM: hostile-cards.ts.)
 */

export const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const FRAY = "#d08a52";
const BRASS = "#c9a263";
const IVORY = "#f6eedb";

/** Line icons in the game's 24-unit language (the same paths as ui.ts), drawn with Path2D. */
const GLYPHS: Record<string, string[]> = {
  sword: ["m5 20 5-5m-4-3 6 6m-4-4L19 3l2 0 0 2-11 11"],
  link: ["m10 8 4-4a5 5 0 0 1 7 7l-4 4m-3 1-4 4a5 5 0 0 1-7-7l4-4m1 7 8-8"],
  bolt: ["m14 2-9 12h6l-1 8 9-13h-6l1-7Z"],
  field: ["m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 5 3v5l-5 3-5-3v-5l5-3Z", "M12 2v5m9 0-4 3m4 7-4-2m-5 7v-4m-9-1 4-2M3 7l4 3"],
  malware: ["M12 3 20 8v8l-8 5-8-5V8l8-5Z", "M9 10h.01M15 10h.01M9 15c2-1.5 4-1.5 6 0M4 8 1 6m22 0-3 2M4 16l-3 2m22 0-3-2"],
  warning: ["M12 3 2 20h20L12 3Z", "M12 10v4m0 3v.5"],
  next: ["M4 12h12m-4-5 5 5-5 5M20 5v14"],
  boss: ["m12 1 3 6 7 2-4 6 1 7-7-3-7 3 1-7-4-6 7-2 3-6Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  shield: ["m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z", "m8 12 3 3 5-6"],
  anchor: ["M12 7v14M3 13l2 5 7 4 7-4 2-5M7 10h10", "M15 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  // Installation kinds (table glyphs): a dish for the Jammer, a driven spike, a lit charge.
  jammer: ["M4 9a8 8 0 0 0 16 0Z", "M12 17v5M8 22h8M12 9 17 3"],
  spike: ["M12 2 15 16H9L12 2Z", "M5 21h14M8 18l-2 3m10-3 2 3"],
  breaker: ["M7 9h10v11H7Z", "M9 9V6h6v3M12 6c0-2 2-3 4-3", "M10 14h4"],
};
export const KIND_GLYPH: Record<InstallationKind, string> = { tap: "malware", jammer: "jammer", spike: "spike", anchor: "anchor", breaker: "breaker" };

/** Strokes a 24-unit glyph centred on (x, y) at `size` pixels. */
export function drawGlyph(c: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, width = 1.7) {
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 24, size / 24);
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = color;
  for (const path of GLYPHS[name] ?? GLYPHS.bolt) c.stroke(new Path2D(path));
  c.restore();
}

function clipped(c: CanvasRenderingContext2D, l: number, t: number, r: number, b: number, cut: number) {
  c.beginPath();
  c.moveTo(l + cut, t);
  c.lineTo(r - cut, t);
  c.lineTo(r, t + cut);
  c.lineTo(r, b - cut);
  c.lineTo(r - cut, b);
  c.lineTo(l + cut, b);
  c.lineTo(l, b - cut);
  c.lineTo(l, t + cut);
  c.closePath();
}

/** An engraved diamond pip: filled while intact, hollow when spent. */
function pip(c: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean, color: string) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.lineWidth = Math.max(1.4, r * 0.28);
  c.strokeStyle = color;
  if (filled) {
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = "rgba(20, 14, 8, .55)";
    c.lineWidth = Math.max(1, r * 0.16);
    c.stroke();
  } else {
    c.fillStyle = "rgba(10, 10, 12, .8)";
    c.fill();
    c.stroke();
  }
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
/** Render order of the table's labels (device nameplates 42, installation tags 43, countdowns 44). */
export const TABLE_LABEL_ORDER = 42;
function sprite(map: THREE.Texture, renderOrder = 0): THREE.Sprite {
  const item = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  item.renderOrder = renderOrder;
  return item;
}

export interface LabelOptions {
  /** Engraved diamonds after the name: condition or integrity. */
  pips?: { filled: number; total: number; color?: string };
}

/** A device nameplate: an iron tag with clipped corners, a rim in the device's colour, a brass
 * hairline inside it and the name in Grenze, sized to fit. Pips (condition, integrity) sit at its
 * right end in brass. Without pips it is exactly the v3 plate. */
export function makeLabel(name: string, color: number, options: LabelOptions = {}): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 224;
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  const plate = (inset: number) => clipped(context, 22 + inset, 22 + inset, 490 - inset, 90 - inset, 12);
  const fill = context.createLinearGradient(0, 22, 0, 90);
  fill.addColorStop(0, "rgba(34, 30, 24, .95)");
  fill.addColorStop(0.55, "rgba(13, 15, 17, .95)");
  fill.addColorStop(1, "rgba(20, 20, 20, .95)");
  plate(0);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = hex(color);
  context.lineWidth = 3;
  context.stroke();
  plate(6);
  context.strokeStyle = "rgba(201, 162, 99, .38)";
  context.lineWidth = 1.2;
  context.stroke();
  const pips = options.pips && options.pips.total > 0 && options.pips.total <= 3 ? options.pips : null;
  const room = pips ? 26 * pips.total + 10 : 0;
  const text = name.slice(0, 26);
  let size = 56;
  const width = 424 - room;
  context.font = `600 ${size}px Grenze, serif`;
  while (context.measureText(text).width > width && size > 30) context.font = `600 ${(size -= 2)}px Grenze, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(0, 0, 0, .7)";
  const centre = 256 - room / 2;
  context.strokeText(text, centre, 58);
  context.fillStyle = IVORY;
  context.fillText(text, centre, 58);
  if (pips) {
    const start = 468 - (pips.total - 1) * 26;
    for (let i = 0; i < pips.total; i++) pip(context, start + i * 26, 56, 9.5, i < pips.filled, pips.color ?? BRASS);
  }
  // Table labels draw after the hostiles' bodies: a far device's nameplate reads on top of the rail
  // instead of disappearing behind a body.
  const label = sprite(texture(canvas), TABLE_LABEL_ORDER);
  label.scale.set(2.5, 0.57, 1);
  return label;
}

/** The Breaker Charge countdown: a Grenze numeral on a small obsidian disc, ember-lit. */
export function numeralSprite(value: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const ember = c.createRadialGradient(128, 128, 60, 128, 128, 128);
  ember.addColorStop(0, "rgba(255, 110, 60, .6)");
  ember.addColorStop(1, "rgba(255, 90, 40, 0)");
  c.fillStyle = ember;
  c.fillRect(0, 0, 256, 256);
  c.beginPath();
  c.arc(128, 128, 88, 0, Math.PI * 2);
  const stone = c.createRadialGradient(110, 100, 10, 128, 128, 90);
  stone.addColorStop(0, "#2d2528");
  stone.addColorStop(1, "#0a0809");
  c.fillStyle = stone;
  c.fill();
  c.lineWidth = 9;
  c.strokeStyle = value <= 1 ? "#ff6a4a" : "#e0874e";
  c.stroke();
  c.lineWidth = 2.5;
  c.strokeStyle = "rgba(240, 200, 140, .6)";
  c.beginPath();
  c.arc(128, 128, 74, 0, Math.PI * 2);
  c.stroke();
  c.font = "700 132px Grenze, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = value <= 1 ? "#ffd2b4" : "#ffe3c2";
  c.shadowColor = "#ff5a2a";
  c.shadowBlur = 24;
  c.fillText(String(value), 128, 136);
  const item = sprite(texture(canvas), TABLE_LABEL_ORDER + 2);
  item.scale.set(0.62, 0.62, 1);
  return item;
}

const glyphTextures = new Map<string, THREE.CanvasTexture>();
/** A white line glyph with a soft halo, tinted by its sprite material (kind glyph on the ghost beam). */
export function glyphTexture(name: string): THREE.CanvasTexture {
  let map = glyphTextures.get(name);
  if (map) return map;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.shadowColor = "#ffffff";
  c.shadowBlur = 14;
  drawGlyph(c, name, 64, 64, 92, "#ffffff", 2.4);
  c.shadowBlur = 0;
  drawGlyph(c, name, 64, 64, 92, "#ffffff", 1.6);
  map = texture(canvas);
  map.userData.shared = true;
  glyphTextures.set(name, map);
  return map;
}

let ringMap: THREE.CanvasTexture | null = null;
/** A brass ring, drawn once: the port highlight while a packet glyph is dragged over it. */
export function brassRingTexture(): THREE.CanvasTexture {
  if (ringMap) return ringMap;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.shadowColor = "#ffb45a";
  c.shadowBlur = 18;
  c.lineWidth = 9;
  c.strokeStyle = "#e7c27a";
  c.beginPath();
  c.ellipse(256, 128, 236, 108, 0, 0, Math.PI * 2);
  c.stroke();
  c.shadowBlur = 0;
  c.lineWidth = 2.5;
  c.strokeStyle = "rgba(255, 240, 200, .8)";
  c.beginPath();
  c.ellipse(256, 128, 222, 96, 0, 0, Math.PI * 2);
  c.stroke();
  ringMap = texture(canvas);
  ringMap.userData.shared = true;
  return ringMap;
}

export { FRAY as FRAY_HEX, clipped };
