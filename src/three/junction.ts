/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Table furniture for readable channels: the brass junction seal on a device where routes merge
 * (so they count as one channel), and the violet fibre wound around an amplified cable. Both are
 * engraved or lit objects in the table's own language, never web labels.
 */

const BRASS = "#e2bd76";
const IVORY = "#f6eedb";

/** The merge glyph (24 units): two strands that join and leave as one. */
const MERGE = ["M3 6.5c4.5 0 6.5 5.5 10 5.5", "M3 17.5c4.5 0 6.5-5.5 10-5.5", "M13 12h8"];

const seals = new Map<number, THREE.CanvasTexture>();
function sealTexture(routes: number): THREE.CanvasTexture {
  const cached = seals.get(routes);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 144;
  const c = canvas.getContext("2d")!;
  c.scale(2, 2);
  // A clipped iron tag with a brass rim and hairline, like the device nameplates.
  const tag = (inset: number) => {
    const l = 6 + inset, t = 8 + inset, r = 122 - inset, b = 64 - inset, cut = 9 - inset * 0.5;
    c.beginPath();
    c.moveTo(l + cut, t); c.lineTo(r - cut, t); c.lineTo(r, t + cut); c.lineTo(r, b - cut);
    c.lineTo(r - cut, b); c.lineTo(l + cut, b); c.lineTo(l, b - cut); c.lineTo(l, t + cut);
    c.closePath();
  };
  const fill = c.createLinearGradient(0, 8, 0, 64);
  fill.addColorStop(0, "rgba(58, 45, 26, .97)");
  fill.addColorStop(0.55, "rgba(20, 17, 13, .97)");
  fill.addColorStop(1, "rgba(34, 27, 18, .97)");
  tag(0);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = BRASS;
  c.lineWidth = 2.6;
  c.stroke();
  tag(4);
  c.strokeStyle = "rgba(226, 189, 118, .42)";
  c.lineWidth = 1;
  c.stroke();
  // The merge glyph on the left, the number of routes it carries on the right.
  c.save();
  c.translate(12, 18);
  c.scale(36 / 24, 36 / 24);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "rgba(0, 0, 0, .55)";
  c.lineWidth = 4.2;
  for (const path of MERGE) c.stroke(new Path2D(path));
  c.strokeStyle = BRASS;
  c.lineWidth = 2.3;
  for (const path of MERGE) c.stroke(new Path2D(path));
  c.fillStyle = BRASS;
  for (const [x, y] of [[3, 6.5], [3, 17.5]]) { c.beginPath(); c.arc(x, y, 1.9, 0, Math.PI * 2); c.fill(); }
  c.restore();
  const text = String(routes);
  c.font = `600 ${text.length > 2 ? 30 : 38}px Grenze, serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = 4;
  c.strokeStyle = "rgba(0, 0, 0, .7)";
  c.strokeText(text, 88, 37);
  c.fillStyle = IVORY;
  c.fillText(text, 88, 37);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.userData.shared = true;
  seals.set(routes, map);
  return map;
}

/** The junction seal hung on the left end of a device's nameplate: `routes` routes pass through
 * this device and count as one channel. Screen-anchored, so it stays beside the plate as the
 * table orbits. Its texture is shared per number (userData.shared keeps it alive on dispose). */
export function junctionSeal(routes: number, renderOrder: number): THREE.Sprite {
  const seal = new THREE.Sprite(new THREE.SpriteMaterial({ map: sealTexture(routes), transparent: true, depthWrite: false }));
  seal.renderOrder = renderOrder;
  seal.scale.set(0.84, 0.47, 1);
  // It hangs off the plate's lower-left corner (the plate spans ±1.14 of the 2.5-wide label).
  seal.center.set(2.15, 0.72);
  seal.userData.junction = routes;
  return seal;
}

/** A strand wound around a cable's curve at `radius`, `turns` times, starting at `phase`. */
class Winding extends THREE.Curve<THREE.Vector3> {
  private readonly frames: { normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
  constructor(private readonly path: THREE.Curve<THREE.Vector3>, private readonly radius: number, private readonly turns: number, private readonly phase: number, private readonly steps: number) {
    super();
    this.frames = path.computeFrenetFrames(steps, false);
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const i = Math.min(this.steps, Math.round(t * this.steps));
    const angle = this.phase + t * this.turns * Math.PI * 2;
    return target.copy(this.path.getPoint(t))
      .addScaledVector(this.frames.normals[i], Math.cos(angle) * this.radius)
      .addScaledVector(this.frames.binormals[i], Math.sin(angle) * this.radius);
  }
}

/** The amplified fibre: two violet strands wound around the sheath, one turn per 0.9 units, thick
 * enough to read as stripes at 1280 × 720. One geometry for both strands (one draw call). */
export function amplifiedWinding(curve: THREE.Curve<THREE.Vector3>, radius: number): THREE.BufferGeometry {
  const length = curve.getLength();
  const turns = Math.max(2, Math.round(length / 0.9));
  const steps = Math.max(48, turns * 16);
  const strands = [0, Math.PI].map(phase => new THREE.TubeGeometry(new Winding(curve, radius, turns, phase, steps), steps, 0.023, 6, false));
  const merged = mergeGeometries(strands)!;
  for (const strand of strands) strand.dispose();
  return merged;
}
