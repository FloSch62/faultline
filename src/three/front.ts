/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import * as THREE from "three";
import type { Installation, InstallationKind } from "../core/types.ts";
import { box, cylinder, dashedRing, decal, glow, mat, ring } from "./materials.ts";
import { INSTALLATION_COLORS, addInstallationBody, addPropBody, type ModelBody, type PropModel } from "./models.ts";
import { KIND_GLYPH, TABLE_LABEL_ORDER, glyphTexture, makeLabel, numeralSprite } from "./plates.ts";
import { MALWARE_COLOR, TABLE_Y, addTapBody, beamTexture, infectionTexture, prop, stellated, tintTexture, type PropGroup } from "./props.ts";

/**
 * The table front (design 13.3): installations with their Blender bodies and the code overlays the
 * player reads (magenta tag with integrity pips, countdown numeral, blast ring, reach ring), the
 * forecast ghost with the kind's glyph, and the crate and message-fragment props.
 */

export const INSTALLATION_LABELS: Record<InstallationKind, string> = {
  tap: "SIPHON TAP", jammer: "JAMMER", spike: "SPIKE", anchor: "ANCHOR", breaker: "BREAKER CHARGE",
};
/** Installations whose effect reaches 2.0 units (their reach ring shows on hover). */
export const REACH_KINDS: ReadonlySet<InstallationKind> = new Set(["jammer", "spike", "breaker"]);
/** Pips on the magenta tag: a pale rose so they read against the iron. */
const PIP_COLOR = "#ff9cc8";
export const BLAST_COLOR = 0xf29a81;
export const REACH = 2.0;

export interface InstallationData {
  id: string;
  kind: InstallationKind;
  body: ModelBody | null;
  label: THREE.Sprite;
  hit: THREE.Mesh;
  numeral: THREE.Sprite | null;
  countdown: number | null;
  integrity: number;
  pips: number;
  blast: THREE.Group | null;
  /** The Anchor's lantern (its tether starts here). */
  lantern: THREE.Object3D | null;
  /** Soft pulse ring under the body; brightens while targeted. */
  pulse: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}
export type InstallationGroup = PropGroup & { userData: PropGroup["userData"] & { installation: InstallationData } };

/** The five-arc segmented ring (the forecast marker's language) at `radius`. */
export function segmentedRing(radius: number, color: number, y: number, opacity = 0.85, tube = 0.037): THREE.Group {
  const group = new THREE.Group();
  for (let index = 0; index < 4; index++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 32, Math.PI / 3), glow(color, opacity));
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = index * Math.PI / 2 + Math.PI / 12;
    arc.material.toneMapped = false;
    arc.renderOrder = 3;
    group.add(arc);
  }
  group.position.y = y;
  return group;
}

/** Code-built stand-ins until the Blender bodies stream in (never shown once they have loaded). */
function fallbackBody(group: InstallationGroup, kind: InstallationKind, x: number) {
  const color = INSTALLATION_COLORS[kind];
  const brass = mat(0x8a6a3e, color, 0.06);
  const dark = mat(0x23282b, color, 0.06);
  const lit = mat(new THREE.Color(color).multiplyScalar(0.4).getHex(), color, 0.6);
  if (kind === "tap") addTapBody(group, x);
  else if (kind === "jammer") {
    for (let i = 0; i < 3; i++) {
      const leg = cylinder(0.03, 0.04, 0.9, 5, brass, TABLE_Y + 0.4);
      const angle = (i / 3) * Math.PI * 2;
      leg.position.x = Math.cos(angle) * 0.28;
      leg.position.z = Math.sin(angle) * 0.28;
      leg.rotation.set(Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35);
      group.add(leg);
    }
    group.add(cylinder(0.26, 0.26, 0.4, 12, dark, TABLE_Y + 0.9));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), lit);
    dish.rotation.x = Math.PI + 0.35;
    dish.position.y = TABLE_Y + 1.45;
    group.add(dish);
  } else if (kind === "spike") {
    group.add(cylinder(0.5, 0.5, 0.06, 8, dark, TABLE_Y + 0.03));
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.44, 4), dark);
    spike.position.y = TABLE_Y + 0.78;
    group.add(spike);
    group.add(cylinder(0.1, 0.1, 0.06, 4, lit, TABLE_Y + 1.12));
  } else if (kind === "anchor") {
    group.add(box(0.9, 0.5, 0.6, brass, 0, TABLE_Y + 0.25, 0));
    group.add(box(0.06, 1.2, 0.06, brass, 0.3, TABLE_Y + 1.1, 0));
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), lit);
    lantern.position.set(0, TABLE_Y + 1.55, 0);
    group.add(lantern);
    group.userData.installation.lantern = lantern;
  } else {
    group.add(cylinder(0.35, 0.35, 0.55, 14, brass, TABLE_Y + 0.28));
    group.add(cylinder(0.3, 0.33, 0.12, 14, glow(0xff5a4a, 0.9), TABLE_Y + 0.6));
    group.add(cylinder(0.05, 0.05, 0.3, 6, dark, TABLE_Y + 0.8));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(color, 1));
    lamp.position.y = TABLE_Y + 0.96;
    group.add(lamp);
  }
}

/** An installation on the table: its body (GLB or stand-in), the stain and pulse ring in the kind's
 * colour, the magenta tag with integrity pips, a Breaker Charge's countdown numeral and blast ring,
 * and an invisible hit volume. */
export function buildInstallation(item: Installation, pips: number): InstallationGroup {
  const group = prop("installation", item.x, item.z) as InstallationGroup;
  group.userData.id = item.id;
  const color = INSTALLATION_COLORS[item.kind];
  const pulse = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 6, 48), glow(item.kind === "tap" ? MALWARE_COLOR : color, 0.7));
  pulse.rotation.x = Math.PI / 2;
  pulse.position.y = TABLE_Y + 0.03;
  const data: InstallationData = {
    id: item.id, kind: item.kind, body: null, label: new THREE.Sprite(), hit: new THREE.Mesh(), numeral: null,
    countdown: item.countdown ?? null, integrity: item.integrity, pips, blast: null, lantern: null, pulse,
  };
  group.userData.installation = data;
  if (item.kind === "tap") group.add(decal(infectionTexture(), 2.4, TABLE_Y + 0.014, 0.8));
  else {
    const stain = decal(tintTexture(), 2.1, TABLE_Y + 0.014, 0.42);
    (stain.material as THREE.MeshBasicMaterial).color.setHex(color);
    group.add(stain);
  }
  group.add(pulse);
  group.userData.flickers.push({ material: pulse.material, base: 0.75, speed: 3.2, phase: item.x });
  const body = addInstallationBody(group, item.kind);
  if (body) {
    data.body = body;
    if (item.kind === "anchor") data.lantern = body.floaters[0]?.object ?? null;
    if (item.kind === "breaker" && body.blinkers[0] && (item.countdown ?? 2) <= 1) body.blinkers[0].speed = 4;
  } else fallbackBody(group, item.kind, item.x);
  const label = makeLabel(INSTALLATION_LABELS[item.kind], MALWARE_COLOR, { pips: { filled: item.integrity, total: pips, color: PIP_COLOR } });
  // Below the device nameplates (2.86), so a tag beside a device never hides behind it.
  label.position.y = item.kind === "breaker" ? TABLE_Y + 1.78 : TABLE_Y + 2.02;
  label.scale.multiplyScalar(0.9);
  // Drawn after the device nameplates: where two tags meet, the threat reads on top.
  label.renderOrder = TABLE_LABEL_ORDER + 1;
  group.add(label);
  data.label = label;
  if (item.kind === "breaker") {
    const numeral = numeralSprite(item.countdown ?? 2);
    numeral.position.y = TABLE_Y + 1.36;
    group.add(numeral);
    data.numeral = numeral;
    const blast = segmentedRing(REACH, BLAST_COLOR, TABLE_Y + 0.04, 0.78);
    group.add(blast);
    data.blast = blast;
  }
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 1.9, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.position.y = 1.3;
  hit.visible = false;
  hit.userData.installationId = item.id;
  group.add(hit);
  data.hit = hit;
  return group;
}

/** Redraws the tag (integrity pips) and the countdown numeral in place. */
export function refreshInstallation(group: InstallationGroup, item: Installation, pips: number, dispose: (object: THREE.Object3D) => void) {
  const data = group.userData.installation;
  if (data.integrity !== item.integrity || data.pips !== pips) {
    data.integrity = item.integrity;
    data.pips = pips;
    const label = makeLabel(INSTALLATION_LABELS[item.kind], MALWARE_COLOR, { pips: { filled: item.integrity, total: pips, color: PIP_COLOR } });
    label.position.copy(data.label.position);
    label.scale.copy(data.label.scale);
    label.renderOrder = data.label.renderOrder;
    group.remove(data.label);
    dispose(data.label);
    group.add(label);
    data.label = label;
  }
  const countdown = item.countdown ?? null;
  if (data.numeral && countdown !== null && countdown !== data.countdown) {
    data.countdown = countdown;
    const numeral = numeralSprite(countdown);
    numeral.position.copy(data.numeral.position);
    group.remove(data.numeral);
    dispose(data.numeral);
    group.add(numeral);
    data.numeral = numeral;
    if (data.body?.blinkers[0]) data.body.blinkers[0].speed = countdown <= 1 ? 4 : 1.5;
  }
}

/** Where a hostile will plant next: its body as a translucent outline, the kind's glyph on a
 * descending beam, and for reach installations the dashed 2.0 ring of what it will touch. */
export function buildInstallationGhost(kind: InstallationKind, x: number, z: number): PropGroup {
  const group = prop("ghost", x, z);
  const color = kind === "tap" ? MALWARE_COLOR : INSTALLATION_COLORS[kind];
  const outline = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false });
  const body = addInstallationBody(group, kind, undefined, { material: outline });
  if (!body) {
    const core = stellated(kind === "tap" ? 0.36 : 0.3, outline);
    core.position.y = kind === "breaker" ? 0.95 : 1.38;
    group.add(core);
    group.userData.spinners.push({ object: core, speed: 0.6, axis: "y" });
  }
  const boundary = dashedRing(0.9, 0.028, color, TABLE_Y + 0.03, 0.8, 14);
  group.add(boundary);
  group.userData.spinners.push({ object: boundary, speed: 0.5, axis: "y" });
  if (REACH_KINDS.has(kind)) {
    const reach = dashedRing(REACH, 0.02, MALWARE_COLOR, TABLE_Y + 0.025, 0.55, 30);
    group.add(reach);
    group.userData.spinners.push({ object: reach, speed: -0.12, axis: "y" });
  }
  const beamMaterial = new THREE.SpriteMaterial({
    color, map: beamTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Sprite(beamMaterial);
  beam.center.set(0.5, 0);
  beam.scale.set(1.3, 3.4, 1);
  beam.position.y = TABLE_Y + 0.05;
  group.add(beam);
  const glyphMaterial = new THREE.SpriteMaterial({ color, map: glyphTexture(KIND_GLYPH[kind]), transparent: true, opacity: 0.9, depthWrite: false });
  const glyph = new THREE.Sprite(glyphMaterial);
  glyph.renderOrder = TABLE_LABEL_ORDER;
  glyph.scale.set(0.62, 0.62, 1);
  glyph.position.y = TABLE_Y + 2.55;
  group.add(glyph);
  group.userData.bobbers.push({ object: glyph, base: TABLE_Y + 2.55, amount: 0.07, speed: 1.8, phase: x });
  group.userData.flickers.push({ material: beamMaterial, base: 0.55, speed: 3, phase: 0 });
  group.userData.flickers.push({ material: outline, base: 0.5, speed: 3, phase: 0.5 });
  group.traverse(child => { child.renderOrder = Math.max(child.renderOrder, 3); });
  return group;
}

/** A crate or a message fragment on the table (World animates the arc, the lid and the fade). */
export function buildTableProp(name: PropModel): { group: PropGroup; body: ModelBody | null; lid: THREE.Object3D | null } {
  const group = prop("prop", 0, 0);
  const body = addPropBody(group, name);
  let lid: THREE.Object3D | null = body?.parts.lid ?? null;
  if (!body) {
    const brass = mat(0x9a7442, 0x3a2410, 0.08);
    if (name === "crate") {
      group.add(box(0.7, 0.36, 0.5, brass, 0, TABLE_Y + 0.18, 0));
      const hinge = new THREE.Group();
      hinge.position.set(0, TABLE_Y + 0.36, -0.25);
      const top = box(0.72, 0.09, 0.52, brass, 0, 0.045, 0.25);
      hinge.add(top);
      group.add(hinge);
      lid = hinge;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), glow(0xffb45a, 0.85));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = TABLE_Y + 0.33;
      group.add(inner);
    } else {
      const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 4, 10), brass);
      capsule.rotation.z = Math.PI / 2;
      capsule.position.y = TABLE_Y + 0.16;
      group.add(capsule);
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24, Math.PI * 1.5), glow(0xffe0a0, 0.7));
      ribbon.position.y = TABLE_Y + 0.62;
      group.add(ribbon);
      group.userData.spinners.push({ object: ribbon, speed: 0.8, axis: "y" });
    }
  }
  return { group, body, lid };
}

export { ring };
