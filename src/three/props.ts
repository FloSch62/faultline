import * as THREE from "three";
import { box, cylinder, dashedRing, decal, glow, mat, radialTexture } from "./materials.ts";

/** Local y of the tabletop inside a group positioned at y = -0.42 (the device convention). */
export const TABLE_Y = 0.62;
export const MALWARE_COLOR = 0xff3f8e;
export const MALWARE_ACCENT = 0x9d5bff;

export interface Animated {
  spinners: { object: THREE.Object3D; speed: number; axis: "x" | "y" | "z" }[];
  flickers: { material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.SpriteMaterial; base: number; speed: number; phase: number }[];
  bobbers: { object: THREE.Object3D; base: number; amount: number; speed: number; phase: number }[];
}
export type PropGroup = THREE.Group & { userData: Animated & { kind: "debris" | "malware" | "ghost" | "installation" | "prop"; id?: string } };

export function prop(kind: PropGroup["userData"]["kind"], x: number, z: number): PropGroup {
  const group = new THREE.Group() as PropGroup;
  group.position.set(x, -0.42, z);
  group.userData = { kind, spinners: [], flickers: [], bobbers: [] };
  return group;
}

let scorch: THREE.CanvasTexture | null = null;
let fadeBeam: THREE.CanvasTexture | null = null;
let infection: THREE.CanvasTexture | null = null;
/** Shared decal textures are created lazily and owned by the module for the page lifetime. */
function shared(texture: THREE.CanvasTexture) {
  texture.userData.shared = true;
  return texture;
}
function scorchTexture() {
  return scorch ??= shared(radialTexture([[0, "rgba(10,6,4,.95)"], [.45, "rgba(24,14,8,.7)"], [.8, "rgba(40,24,12,.25)"], [1, "rgba(0,0,0,0)"]], 0));
}
function infectionTexture() {
  return infection ??= shared(radialTexture([[0, "rgba(255,70,150,.95)"], [.25, "rgba(170,40,160,.55)"], [.6, "rgba(90,20,120,.22)"], [1, "rgba(0,0,0,0)"]], 9, 3));
}

/** Soft light column: horizontal falloff times a vertical fade, bright at the table. */
function beamTexture() {
  if (fadeBeam) return fadeBeam;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  const across = c.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = across;
  c.fillRect(0, 0, 64, 128);
  c.globalCompositeOperation = "destination-in";
  const down = c.createLinearGradient(0, 0, 0, 128);
  down.addColorStop(0, "rgba(0,0,0,0)");
  down.addColorStop(0.6, "rgba(0,0,0,.4)");
  down.addColorStop(1, "rgba(0,0,0,1)");
  c.fillStyle = down;
  c.fillRect(0, 0, 64, 128);
  fadeBeam = shared(new THREE.CanvasTexture(canvas));
  return fadeBeam;
}

let tint: THREE.CanvasTexture | null = null;
/** A soft white radial decal, tinted by its material: a fresh wreck's role-coloured scorch. */
export function tintTexture() {
  return tint ??= shared(radialTexture([[0, "rgba(255,255,255,.9)"], [.35, "rgba(255,255,255,.45)"], [.75, "rgba(255,255,255,.12)"], [1, "rgba(0,0,0,0)"]], 6, 5));
}

/** Wreckage blocking a socket: a toppled rack, a split router husk, shards and a live stub.
 * A fresh wreck (a breakdown or a detonation this encounter) burns brighter, and its scorch is
 * tinted in the broken device's role colour for the rest of the encounter. */
export function buildDebris(x: number, z: number, seed: number, fresh?: { color: number | null }): PropGroup {
  const group = prop("debris", x, z);
  let s = (seed * 2654435761) >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  group.rotation.y = rand() * Math.PI * 2;
  group.add(decal(scorchTexture(), 2.3, TABLE_Y + 0.012, 0.85));
  if (fresh) {
    const scorch = decal(tintTexture(), 2.0, TABLE_Y + 0.016, 0.34, true);
    (scorch.material as THREE.MeshBasicMaterial).color.setHex(fresh.color ?? 0xff7a3a);
    group.add(scorch);
    group.userData.flickers.push({ material: scorch.material as THREE.MeshBasicMaterial, base: 0.34, speed: 1.3, phase: rand() * 6 });
    // Live embers still glowing in the fresh wreck.
    for (let i = 0; i < 4; i++) {
      const ember = glow(i % 2 ? 0xffb066 : 0xff7a3a, 0.95);
      ember.transparent = true;
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.045 + rand() * 0.035, 8, 6), ember);
      const angle = rand() * Math.PI * 2, distance = 0.2 + rand() * 0.55;
      mote.position.set(Math.cos(angle) * distance, TABLE_Y + 0.05 + rand() * 0.12, Math.sin(angle) * distance);
      group.add(mote);
      group.userData.flickers.push({ material: ember, base: 1, speed: 6 + rand() * 9, phase: rand() * 6 });
    }
  }
  const hull = mat(0x2d2a27, 0x1a0d06, 0.05);
  hull.roughness = 0.8;
  const rust = mat(0x5e3b25, 0x2e1407, 0.08);
  rust.roughness = 0.92;
  rust.metalness = 0.4;
  // Toppled rack with a cracked, dying status strip.
  const rack = box(1.05, 0.34, 0.58, hull, 0.05, TABLE_Y + 0.2, 0.05);
  rack.rotation.set(0.12, 0.3, 0.32);
  group.add(rack);
  const strip = glow(0xff6a3a, 0.8);
  strip.transparent = true;
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.02), strip);
  crack.position.set(0.05, TABLE_Y + 0.26, 0.36);
  crack.rotation.copy(rack.rotation);
  group.add(crack);
  group.userData.flickers.push({ material: strip, base: 0.85, speed: 7 + rand() * 5, phase: rand() * 6 });
  for (let i = 0; i < 3; i++) {
    const bay = box(0.26, 0.06, 0.02, rust, -0.25 + i * 0.26, TABLE_Y + 0.13, 0.34);
    bay.rotation.copy(rack.rotation);
    group.add(bay);
  }
  // Split router husk lying on its side.
  const husk = cylinder(0.32, 0.36, 0.42, 6, rust, TABLE_Y + 0.22);
  husk.position.set(-0.55, TABLE_Y + 0.2, -0.35);
  husk.rotation.set(Math.PI / 2, 0, 0.8);
  group.add(husk);
  const bare = cylinder(0.2, 0.2, 0.05, 6, glow(0x3a2014, 1), 0);
  bare.position.set(-0.37, TABLE_Y + 0.2, -0.53);
  bare.rotation.copy(husk.rotation);
  group.add(bare);
  for (let i = 0; i < 7; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + rand() * 0.08), i % 3 ? hull : rust);
    const angle = rand() * Math.PI * 2, distance = 0.45 + rand() * 0.55;
    shard.position.set(Math.cos(angle) * distance, TABLE_Y + 0.04, Math.sin(angle) * distance);
    shard.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    shard.castShadow = true;
    group.add(shard);
  }
  // A torn cable still arcing with the last of its charge.
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0.45, TABLE_Y + 0.05, -0.45), new THREE.Vector3(0.6, TABLE_Y + 0.5, -0.5),
    new THREE.Vector3(0.75, TABLE_Y + 0.55, -0.2), new THREE.Vector3(0.82, TABLE_Y + 0.3, -0.05),
  );
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6, false), mat(0x2a3b46, 0x5b2a18, 0.2));
  group.add(cable);
  const sparkMaterial = glow(fresh ? 0xffe0a0 : 0xffc27a, 1);
  sparkMaterial.transparent = true;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(fresh ? 0.085 : 0.06, 8, 6), sparkMaterial);
  spark.position.copy(curve.getPoint(1));
  group.add(spark);
  group.userData.flickers.push({ material: sparkMaterial, base: 1, speed: 13 + rand() * 6, phase: rand() * 6 });
  // Blocked boundary: nothing can be installed inside this ring.
  const boundary = dashedRing(1.3, 0.018, 0xc98556, TABLE_Y + 0.02, 0.5, 20);
  group.add(boundary);
  return group;
}

function stellated(radius: number, material: THREE.Material): THREE.Group {
  const core = new THREE.Group();
  const a = new THREE.Mesh(new THREE.TetrahedronGeometry(radius), material);
  const b = new THREE.Mesh(new THREE.TetrahedronGeometry(radius), material);
  b.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.62), material);
  core.add(a, b, c);
  core.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
  return core;
}

/** The Siphon Tap's code body: a stellated core, a heart, orbiting shards and an uplink beam
 * (the fallback until the Blender body loads, and the v3 malware prop). */
export function addTapBody(group: PropGroup, x: number) {
  const pedestal = cylinder(0.34, 0.5, 0.18, 7, mat(0x1d0a16, MALWARE_COLOR, 0.25), TABLE_Y + 0.09);
  group.add(pedestal);
  const shell = mat(0x1a0612, MALWARE_COLOR, 0.95);
  shell.roughness = 0.25;
  shell.metalness = 0.8;
  shell.clearcoat = 1;
  const core = stellated(0.36, shell);
  core.position.y = 1.38;
  group.add(core);
  group.userData.spinners.push({ object: core, speed: 1.1, axis: "y" });
  group.userData.bobbers.push({ object: core, base: 1.38, amount: 0.08, speed: 2.2, phase: x });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glow(0xffb3d6, 1));
  heart.position.y = 1.38;
  group.add(heart);
  group.userData.bobbers.push({ object: heart, base: 1.38, amount: 0.08, speed: 2.2, phase: x });
  const orbit = new THREE.Group();
  orbit.position.y = 1.38;
  for (let i = 0; i < 5; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07), glow(i % 2 ? MALWARE_ACCENT : MALWARE_COLOR, 1));
    const angle = (i / 5) * Math.PI * 2;
    shard.position.set(Math.cos(angle) * 0.62, Math.sin(angle * 2) * 0.12, Math.sin(angle) * 0.62);
    orbit.add(shard);
  }
  group.add(orbit);
  group.userData.spinners.push({ object: orbit, speed: -1.6, axis: "y" });
  const beamMaterial = glow(MALWARE_ACCENT, 0.35);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.6, 6, 1, true), beamMaterial);
  beam.position.y = 2.2;
  group.add(beam);
  group.userData.flickers.push({ material: beamMaterial, base: 0.45, speed: 11, phase: 1.3 });
}

export { stellated, infectionTexture, beamTexture };

/** Hostile code planted on the table. Pulsing, spiked and unmistakably not yours. */
export function buildMalware(x: number, z: number, id: string, label: THREE.Sprite): { group: PropGroup; hit: THREE.Mesh } {
  const group = prop("malware", x, z);
  group.userData.id = id;
  const stain = decal(infectionTexture(), 2.4, TABLE_Y + 0.014, 0.8);
  group.add(stain);
  const pulse = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 6, 48), glow(MALWARE_COLOR, 0.7));
  pulse.rotation.x = Math.PI / 2;
  pulse.position.y = TABLE_Y + 0.03;
  group.add(pulse);
  group.userData.flickers.push({ material: pulse.material as THREE.MeshBasicMaterial, base: 0.75, speed: 3.2, phase: 0 });
  const pedestal = cylinder(0.34, 0.5, 0.18, 7, mat(0x1d0a16, MALWARE_COLOR, 0.25), TABLE_Y + 0.09);
  group.add(pedestal);
  const shell = mat(0x1a0612, MALWARE_COLOR, 0.95);
  shell.roughness = 0.25;
  shell.metalness = 0.8;
  shell.clearcoat = 1;
  const core = stellated(0.36, shell);
  core.position.y = 1.38;
  group.add(core);
  group.userData.spinners.push({ object: core, speed: 1.1, axis: "y" });
  group.userData.bobbers.push({ object: core, base: 1.38, amount: 0.08, speed: 2.2, phase: x });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glow(0xffb3d6, 1));
  heart.position.y = 1.38;
  group.add(heart);
  group.userData.bobbers.push({ object: heart, base: 1.38, amount: 0.08, speed: 2.2, phase: x });
  const orbit = new THREE.Group();
  orbit.position.y = 1.38;
  for (let i = 0; i < 5; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07), glow(i % 2 ? MALWARE_ACCENT : MALWARE_COLOR, 1));
    const angle = (i / 5) * Math.PI * 2;
    shard.position.set(Math.cos(angle) * 0.62, Math.sin(angle * 2) * 0.12, Math.sin(angle) * 0.62);
    orbit.add(shard);
  }
  group.add(orbit);
  group.userData.spinners.push({ object: orbit, speed: -1.6, axis: "y" });
  // A glitching uplink: it reports back to its owner.
  const beamMaterial = glow(MALWARE_ACCENT, 0.35);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.6, 6, 1, true), beamMaterial);
  beam.position.y = 2.2;
  group.add(beam);
  group.userData.flickers.push({ material: beamMaterial, base: 0.45, speed: 11, phase: 1.3 });
  const light = new THREE.PointLight(MALWARE_COLOR, 7, 3.2, 2);
  light.position.y = 1.3;
  group.add(light);
  label.position.y = 2.72;
  group.add(label);
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 1.9, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.position.y = 1.3;
  hit.userData.malwareId = id;
  group.add(hit);
  return { group, hit };
}

/** Where the enemy will plant next: a translucent outline and a descending beam. */
export function buildMalwareGhost(x: number, z: number): PropGroup {
  const group = prop("ghost", x, z);
  const outline = new THREE.MeshBasicMaterial({ color: MALWARE_COLOR, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false });
  const core = stellated(0.36, outline);
  core.position.y = 1.38;
  group.add(core);
  group.userData.spinners.push({ object: core, speed: 0.6, axis: "y" });
  const boundary = dashedRing(0.9, 0.028, MALWARE_COLOR, TABLE_Y + 0.03, 0.8, 14);
  group.add(boundary);
  group.userData.spinners.push({ object: boundary, speed: 0.5, axis: "y" });
  const beamMaterial = new THREE.SpriteMaterial({
    color: MALWARE_COLOR, map: beamTexture(), transparent: true, opacity: 0.55, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Sprite(beamMaterial);
  beam.center.set(0.5, 0);
  beam.scale.set(1.3, 3.4, 1);
  beam.position.y = TABLE_Y + 0.05;
  group.add(beam);
  group.userData.flickers.push({ material: beamMaterial, base: 0.55, speed: 3, phase: 0 });
  group.userData.flickers.push({ material: outline, base: 0.5, speed: 3, phase: 0.5 });
  group.traverse(child => { child.renderOrder = Math.max(child.renderOrder, 3); });
  return group;
}

export function animateProp(group: PropGroup, time: number, motion: number, reduced: boolean) {
  const data = group.userData;
  for (const spinner of data.spinners) spinner.object.rotation[spinner.axis] += motion * spinner.speed;
  for (const bobber of data.bobbers)
    bobber.object.position.y = bobber.base + (reduced ? 0 : Math.sin(time * bobber.speed + bobber.phase) * bobber.amount);
  for (const flicker of data.flickers) {
    const wave = reduced ? 1 : 0.55 + 0.45 * Math.sin(time * flicker.speed + flicker.phase) * (0.7 + 0.3 * Math.sin(time * flicker.speed * 2.7));
    flicker.material.opacity = flicker.base * Math.max(0.15, wave);
  }
}
