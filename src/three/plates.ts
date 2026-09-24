import * as THREE from "three";
import type { InstallationKind } from "../core/types.ts";

/**
 * Canvas-drawn table furniture: device nameplates, installation tags, the rail plates under each
 * hostile, the target reticle, the countdown numeral, packet glyphs and kind glyphs. Everything is an
 * engraved iron or brass object in the game's faces (Grenze numerals and names), never a web label.
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
  // Table labels draw after the hostiles' bodies and the rail plates (renderOrder 40): a far device's
  // nameplate reads on top of the rail instead of disappearing behind a body or a plate.
  const label = sprite(texture(canvas), TABLE_LABEL_ORDER);
  label.scale.set(2.5, 0.57, 1);
  return label;
}

export interface RailPlateData {
  name: string;
  color: number;
  hp: number;
  maxHp: number;
  /** Health after this transmission's forecast (the loss band spans hpAfter → hp). */
  hpAfter: number;
  /** Damage this port takes from the transmission (overflow included). */
  damage: number;
  overflowIn: number;
  lethal: boolean;
  /** This phase's state (the intent itself is the DOM badge above the plate). */
  state: "acts" | "dormant" | "cancelled" | "spiteful" | "skipped" | "dead";
  /** Leaders: escalation level reached (0–3); null hides the pips. */
  escalation: number | null;
  /** The artwork is a stand-in until the painted sheet lands. */
  placeholder?: boolean;
}

/** The rail plate under a hostile (1024 × 320): name (leaders: three escalation pips after it),
 * health bar in the hostile's colour with the forecast loss as the HUD's striped risk band, and the
 * damage it takes (or LETHAL in gold). Its intent hangs above it as a DOM badge (#intent-layer). */
export function drawRailPlate(canvas: HTMLCanvasElement, data: RailPlateData) {
  const c = canvas.getContext("2d")!;
  const W = 1024, H = 320;
  c.clearRect(0, 0, W, H);
  const tone = hex(data.color);
  const fill = c.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, "rgba(36, 31, 25, .95)");
  fill.addColorStop(0.5, "rgba(12, 14, 16, .95)");
  fill.addColorStop(1, "rgba(19, 18, 17, .95)");
  clipped(c, 10, 10, W - 10, H - 10, 34);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = data.state === "dead" ? "#4a4540" : tone;
  c.stroke();
  clipped(c, 28, 28, W - 28, H - 28, 24);
  c.lineWidth = 2.5;
  c.strokeStyle = "rgba(201, 162, 99, .42)";
  c.stroke();
  const dim = data.state === "dormant" || data.state === "dead";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  const shadow = () => { c.lineWidth = 9; c.strokeStyle = "rgba(0, 0, 0, .78)"; };

  // Row 1: the name, centred, with a leader's three escalation pips after it.
  const pipsWidth = data.escalation !== null ? 150 : 0;
  let size = 124;
  const name = data.name.toUpperCase();
  c.font = `600 ${size}px Grenze, serif`;
  while (c.measureText(name).width > W - 116 - pipsWidth && size > 64) c.font = `600 ${(size -= 4)}px Grenze, serif`;
  const nameWidth = c.measureText(name).width;
  const left = Math.max(54, (W - nameWidth - pipsWidth) / 2);
  c.textAlign = "left";
  shadow();
  c.strokeText(name, left, 104);
  c.fillStyle = dim ? "#a9a192" : IVORY;
  c.fillText(name, left, 104);
  if (data.escalation !== null) {
    const start = left + nameWidth + 50;
    for (let i = 0; i < 3; i++) pip(c, start + i * 44, 104, 16, i < data.escalation, "#e08a6b");
  }

  // Row 2: the health bar (the number inside it) with the loss band; the damage, LETHAL or SILENCED.
  const hp = Math.max(0, Math.min(data.maxHp, data.hp));
  const after = Math.max(0, Math.min(hp, data.hpAfter));
  const verdict = data.state === "dead" ? "SILENCED" : data.lethal ? "LETHAL" : data.damage > 0 ? `−${data.damage}` : "";
  c.font = data.lethal || data.state === "dead" ? `700 92px Grenze, serif` : `700 112px Grenze, serif`;
  const verdictWidth = verdict ? c.measureText(verdict).width + 44 : 0;
  const bar = { l: 54, r: W - 54 - verdictWidth, t: 184, b: 282 };
  const span = bar.r - bar.l;
  c.fillStyle = "rgba(6, 6, 7, .94)";
  c.fillRect(bar.l, bar.t, span, bar.b - bar.t);
  const bright = new THREE.Color(data.color);
  // A deep fill with a lit upper edge in the hostile's colour: the white numeral reads on any hue.
  const filled = span * after / data.maxHp;
  c.fillStyle = dim ? "#4a4640" : `#${bright.clone().multiplyScalar(0.58).getHexString()}`;
  c.fillRect(bar.l, bar.t, filled, bar.b - bar.t);
  c.fillStyle = dim ? "#6d675e" : `#${bright.clone().multiplyScalar(0.95).getHexString()}`;
  c.fillRect(bar.l, bar.t, filled, 22);
  if (hp > after) {
    const x = bar.l + span * after / data.maxHp, w = span * (hp - after) / data.maxHp;
    c.save();
    c.beginPath();
    c.rect(x, bar.t, w, bar.b - bar.t);
    c.clip();
    c.fillStyle = "#ba755b";
    c.fillRect(x, bar.t, w, bar.b - bar.t);
    c.strokeStyle = "#f7c4a7";
    c.lineWidth = 8;
    for (let s = x - 80; s < x + w + 80; s += 20) {
      c.beginPath();
      c.moveTo(s, bar.b);
      c.lineTo(s + 50, bar.t);
      c.stroke();
    }
    c.restore();
  }
  c.strokeStyle = "rgba(201, 162, 99, .75)";
  c.lineWidth = 4;
  c.strokeRect(bar.l, bar.t, span, bar.b - bar.t);
  c.textAlign = "left";
  c.font = `700 96px Grenze, serif`;
  shadow();
  c.lineWidth = 13;
  c.strokeText(String(hp), bar.l + 20, 238);
  c.fillStyle = "#fff6e2";
  c.fillText(String(hp), bar.l + 20, 238);
  if (data.overflowIn > 0 && data.state !== "dead") {
    c.textAlign = "right";
    c.font = `italic 600 54px Alegreya, serif`;
    shadow();
    c.strokeText(`+${data.overflowIn} overflow`, bar.r - 16, 238);
    c.fillStyle = "#f2d9a0";
    c.fillText(`+${data.overflowIn} overflow`, bar.r - 16, 238);
  }
  if (verdict) {
    c.textAlign = "right";
    c.font = data.lethal || data.state === "dead" ? `700 92px Grenze, serif` : `700 112px Grenze, serif`;
    shadow();
    c.strokeText(verdict, W - 54, 240);
    c.fillStyle = data.state === "dead" ? "#8f8570" : data.lethal ? "#f2cf73" : `#${bright.clone().lerp(new THREE.Color(0xffffff), 0.3).getHexString()}`;
    c.fillText(verdict, W - 54, 240);
  }
  if (data.state === "spiteful") {
    // Lethal, and it acts anyway: a coral ribbon across the plate's crown.
    const text = "SPITEFUL · ACTS ANYWAY";
    c.font = `700 40px "Alegreya Sans SC", Alegreya, serif`;
    const width = c.measureText(text).width + 56;
    clipped(c, W - 54 - width, 4, W - 54, 50, 10);
    c.fillStyle = "#7a2f25";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = "#f08a74";
    c.stroke();
    c.textAlign = "center";
    c.fillStyle = "#ffd9cc";
    c.fillText(text, W - 54 - width / 2, 29);
  }
  if (data.placeholder) {
    // The painted body has not landed yet: a small hollow diamond marks the stand-in.
    c.globalAlpha = 0.7;
    pip(c, W - 42, 42, 11, false, "#9a958a");
    c.globalAlpha = 1;
  }
}

export function railPlateSprite(): { sprite: THREE.Sprite; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  // Depth-tested: hardware standing on the table's far sockets is nearer than the rail and hides
  // the plate where they cross, instead of vanishing under it. Drawn after the hostiles' bodies.
  const item = sprite(texture(canvas), 40);
  return { sprite: item, canvas };
}

let reticle: THREE.CanvasTexture | null = null;
/** The target marker (768 × 320): four brass corner brackets with an ember glow and a small lit
 * diamond on each flank, drawn once and framed around the target's rail plate. */
export function reticleTexture(): THREE.CanvasTexture {
  if (reticle) return reticle;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 320;
  const c = canvas.getContext("2d")!;
  const l = 26, t = 26, r = 742, b = 294, arm = 124, rise = 88;
  const brackets = () => {
    c.beginPath();
    c.moveTo(l, t + rise); c.lineTo(l, t); c.lineTo(l + arm, t);
    c.moveTo(r - arm, t); c.lineTo(r, t); c.lineTo(r, t + rise);
    c.moveTo(r, b - rise); c.lineTo(r, b); c.lineTo(r - arm, b);
    c.moveTo(l + arm, b); c.lineTo(l, b); c.lineTo(l, b - rise);
  };
  c.lineCap = "square";
  c.lineJoin = "miter";
  // Ember halo, the brass bar, then a pale hairline on its inner edge.
  c.shadowColor = "#ff9a3c";
  c.shadowBlur = 22;
  brackets();
  c.lineWidth = 20;
  c.strokeStyle = "#ffb04a";
  c.stroke();
  c.shadowBlur = 0;
  brackets();
  c.lineWidth = 13;
  c.strokeStyle = "#e8c47c";
  c.stroke();
  brackets();
  c.lineWidth = 3;
  c.strokeStyle = "#fff2c9";
  c.stroke();
  for (const x of [l, r]) {
    c.shadowColor = "#ff9a3c";
    c.shadowBlur = 16;
    pip(c, x, 160, 20, true, "#ffd98a");
    c.shadowBlur = 0;
  }
  reticle = texture(canvas);
  reticle.userData.shared = true;
  return reticle;
}

let halo: THREE.CanvasTexture | null = null;
/** A soft white ring (tinted by its sprite): the selected packet glyph's lit halo. */
export function haloTexture(): THREE.CanvasTexture {
  if (halo) return halo;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.shadowColor = "#ffffff";
  c.shadowBlur = 14;
  c.lineWidth = 7;
  c.strokeStyle = "rgba(255, 255, 255, .95)";
  c.beginPath();
  c.arc(64, 64, 44, 0, Math.PI * 2);
  c.stroke();
  c.shadowBlur = 0;
  c.lineWidth = 2;
  c.strokeStyle = "rgba(255, 255, 255, .7)";
  c.beginPath();
  c.arc(64, 64, 54, 0, Math.PI * 2);
  c.stroke();
  halo = texture(canvas);
  halo.userData.shared = true;
  return halo;
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

/** A packet glyph: a lit hexagon (the primary delivery) or diamond (a bandwidth delivery). */
export function packetTexture(primary: boolean): THREE.CanvasTexture {
  const key = primary ? "packet-primary" : "packet-bandwidth";
  let map = glyphTextures.get(key);
  if (map) return map;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  const halo = c.createRadialGradient(64, 64, 8, 64, 64, 62);
  halo.addColorStop(0, "rgba(255,255,255,.55)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, 128, 128);
  c.beginPath();
  if (primary) for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    c[i ? "lineTo" : "moveTo"](64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36);
  }
  else { c.moveTo(64, 26); c.lineTo(94, 64); c.lineTo(64, 102); c.lineTo(34, 64); }
  c.closePath();
  c.fillStyle = "rgba(255,255,255,.92)";
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = "rgba(40, 30, 16, .75)";
  c.stroke();
  c.beginPath();
  c.arc(64, 64, 9, 0, Math.PI * 2);
  c.fillStyle = "rgba(40, 30, 16, .55)";
  c.fill();
  map = texture(canvas);
  map.userData.shared = true;
  glyphTextures.set(key, map);
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
