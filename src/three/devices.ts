import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { NetworkNode, Role } from "../core/types.ts";
import { box, cylinder, glow, mat, ring } from "./materials.ts";

export const COLORS: Record<Role, number> = {
  client: 0xe2c184,
  router: 0x91c9bf,
  switch: 0xa0b8ca,
  firewall: 0xda9e69,
  honeypot: 0xf0a33c,
  cache: 0x7fb0f2,
  power: 0xf4d25c,
  balancer: 0xb69cff,
};

export interface Tinted {
  material: THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial;
  color: THREE.Color;
  emissive: THREE.Color | null;
  emissiveIntensity: number;
  opacity: number;
}
export type DeviceGroup = THREE.Group & {
  userData: {
    nodeId: string;
    /** Index 0 is the skirt: it carries selection and channel colour. */
    rings: THREE.Object3D[];
    floaters: THREE.Object3D[];
    spinners: { object: THREE.Object3D; speed: number; axis: "y" | "z" }[];
    blinkers: { material: THREE.MeshBasicMaterial; phase: number; speed: number; base: number }[];
    tinted: Tinted[];
    /** Wreckage scattered around salvage hardware; hidden once it is brought online. */
    scrap: THREE.Object3D[];
    label: THREE.Sprite | null;
    skirtColor: number;
    online: boolean;
    role: Role;
    salvage: boolean;
  };
};

export function newDeviceGroup(node: NetworkNode): DeviceGroup {
  const group = new THREE.Group() as DeviceGroup;
  group.userData = {
    nodeId: node.id, rings: [], floaters: [], spinners: [], blinkers: [], tinted: [], scrap: [],
    label: null, skirtColor: COLORS[node.role], online: true, role: node.role, salvage: !!node.salvage,
  };
  return group;
}

interface Palette { color: number; dark: THREE.Material; trim: THREE.Material; luminous: THREE.Material }

function led(group: DeviceGroup, color: number, w: number, h: number, d: number, x: number, y: number, z: number, speed: number, phase: number, base = .9) {
  const material = glow(color, base);
  material.transparent = true;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  group.userData.blinkers.push({ material, phase, speed, base });
  return mesh;
}

/** Builds the role-specific body above the shared base plinth. */
export function addRoleBody(group: DeviceGroup, node: NetworkNode, { color, dark, trim, luminous }: Palette) {
  const data = group.userData;
  if (node.role === "client") {
    group.add(cylinder(0.46, 0.54, 0.48, 8, dark, 1.2));
    group.add(cylinder(0.49, 0.49, 0.07, 8, trim, 1.48));
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.54, 0.24), mat(0x5b7187));
      const angle = (i * Math.PI) / 2;
      fin.position.set(Math.sin(angle) * 0.4, 1.29, Math.cos(angle) * 0.4);
      fin.rotation.y = angle;
      group.add(fin);
    }
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 1), luminous);
    orb.position.y = 1.89;
    group.add(orb);
    data.floaters.push(orb);
    const halo = ring(0.5, 0.023, color, 1.72, 0.75);
    group.add(halo);
    data.rings.push(halo);
    group.add(cylinder(0.08, 0.08, 0.37, 8, luminous, 1.68));
  } else if (node.role === "router") {
    group.add(cylinder(0.53, 0.59, 0.5, 6, dark, 1.23));
    group.add(cylinder(0.51, 0.51, 0.075, 6, luminous, 1.52));
    const floatingRing = ring(0.62, 0.047, color, 1.85, 0.92);
    group.add(floatingRing);
    data.rings.push(floatingRing);
    const spindle = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), luminous);
    spindle.position.y = 1.9;
    group.add(spindle);
    data.floaters.push(spindle);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.04), glow(i % 2 ? 0x62fce3 : 0x1f98ac));
      port.position.set(Math.sin(angle) * 0.52, 1.22, Math.cos(angle) * 0.52);
      port.rotation.y = angle;
      group.add(port);
    }
  } else if (node.role === "switch") {
    const chassis = box(1.0, 0.38, 0.68, dark, 0, 1.21, 0);
    group.add(chassis);
    group.add(box(1.02, 0.05, 0.7, trim, 0, 1.42, 0));
    for (let i = 0; i < 5; i++)
      led(group, i === 4 ? 0xf1b478 : color, 0.1, 0.055, 0.02, -0.35 + i * 0.175, 1.18, 0.35, 1.3 + i * .37, i * 1.7, .95);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.018, 0.46), glow(color, 0.45));
    plate.position.y = 1.46;
    group.add(plate);
  } else if (node.role === "firewall") {
    const body = cylinder(0.48, 0.57, 0.61, 5, dark, 1.25);
    body.rotation.y = Math.PI / 5;
    group.add(body);
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 0), mat(0x593c39, color, 0.65));
    shield.position.y = 1.73;
    group.add(shield);
    data.floaters.push(shield);
    const field = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 1.18, 6, 1, true), glow(color, 0.11));
    field.position.y = 1.43;
    group.add(field);
    group.add(ring(0.66, 0.035, color, 1.02, 0.65));
    group.add(ring(0.61, 0.03, color, 1.95, 0.65));
    if (node.stateful) {
      // A second lattice and an orbiting state table: it remembers every connection.
      const lattice = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.7, 1),
        new THREE.MeshBasicMaterial({ color: 0xffd6a4, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      lattice.position.y = 1.73;
      group.add(lattice);
      data.spinners.push({ object: lattice, speed: -0.25, axis: "y" });
      const table = new THREE.Group();
      table.position.y = 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const slate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), glow(i % 2 ? 0xffc88f : 0xf09a5a, 0.85));
        slate.position.set(Math.cos(angle) * 0.86, 0, Math.sin(angle) * 0.86);
        slate.rotation.y = -angle + Math.PI / 2;
        table.add(slate);
      }
      group.add(table);
      data.spinners.push({ object: table, speed: 0.55, axis: "y" });
    }
  } else if (node.role === "honeypot") {
    // A honeycomb lure: warm, bright and a little too inviting.
    group.add(cylinder(0.5, 0.58, 0.36, 6, dark, 1.1));
    group.add(cylinder(0.53, 0.53, 0.06, 6, trim, 1.3));
    const hive = new THREE.IcosahedronGeometry(0.5, 1);
    const shell = new THREE.Mesh(hive, mat(0x4a2c0c, color, 0.35));
    shell.scale.set(1, 0.82, 1);
    shell.position.y = 1.68;
    (shell.material as THREE.MeshPhysicalMaterial).flatShading = true;
    group.add(shell);
    const comb = new THREE.LineSegments(new THREE.EdgesGeometry(hive), new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85 }));
    comb.scale.set(1.01, 0.83, 1.01);
    comb.position.y = 1.68;
    group.add(comb);
    const nectar = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glow(0xffc25c, 0.95));
    nectar.position.y = 2.28;
    group.add(nectar);
    data.floaters.push(nectar);
    const lure = ring(0.3, 0.02, 0xffc25c, 2.28, 0.8);
    group.add(lure);
    data.rings.push(lure);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.4;
      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(0xffb13d, 0.9));
      drip.position.set(Math.cos(angle) * 0.47, 1.3 - (i % 2) * 0.05, Math.sin(angle) * 0.47);
      drip.scale.y = 1.6;
      group.add(drip);
    }
    const mast = cylinder(0.018, 0.018, 0.5, 5, trim, 2.02);
    mast.position.x = 0.36;
    mast.rotation.z = -0.25;
    group.add(mast);
    led(group, 0xff9a3c, 0.07, 0.07, 0.07, 0.43, 2.27, 0, 3.1, 0, 1);
  } else if (node.role === "cache") {
    // A drive-bay tower: blinking sleds are the only moving part.
    const tower = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1.02, 0.62, 2, 0.05), dark);
    tower.position.y = 1.36;
    tower.castShadow = true;
    group.add(tower);
    group.add(box(0.82, 0.05, 0.66, trim, 0, 1.89, 0));
    group.add(box(0.82, 0.05, 0.66, trim, 0, 0.87, 0));
    for (let i = 0; i < 5; i++) {
      const y = 1.05 + i * 0.17;
      group.add(box(0.6, 0.11, 0.02, mat(0x39454c, color, 0.08), -0.04, y, 0.32));
      led(group, [0x71f0c8, color, 0xf2c16c][i % 3], 0.05, 0.05, 0.02, 0.3, y, 0.33, 2 + i * 0.9, i * 1.3, 1);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.02), glow(color, 0.9));
    strip.position.set(0.4, 1.36, 0.3);
    group.add(strip);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.8 }));
    cube.position.y = 2.28;
    group.add(cube);
    data.spinners.push({ object: cube, speed: 0.7, axis: "y" });
    const heart = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), luminous);
    heart.position.y = 2.28;
    group.add(heart);
    data.floaters.push(heart);
  } else if (node.role === "power") {
    // PoE injector: a charged column wrapped in copper coils.
    group.add(cylinder(0.3, 0.38, 0.95, 12, dark, 1.35));
    const copper = mat(0xa8703a, color, 0.3);
    for (const y of [1.08, 1.33, 1.58]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.055, 8, 32), copper);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = y;
      group.add(coil);
    }
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.25, 8), glow(0xfff0a0, 1));
    column.position.y = 1.85;
    group.add(column);
    const haze = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.2, 12, 1, true), glow(color, 0.16));
    haze.position.y = 1.85;
    group.add(haze);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), luminous);
    cap.position.y = 2.5;
    group.add(cap);
    data.floaters.push(cap);
    const orbit = new THREE.Group();
    orbit.position.y = 1.95;
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0xfff4b8, 1));
      const angle = (i / 3) * Math.PI * 2;
      spark.position.set(Math.cos(angle) * 0.34, (i - 1) * 0.22, Math.sin(angle) * 0.34);
      orbit.add(spark);
    }
    group.add(orbit);
    data.spinners.push({ object: orbit, speed: 2.4, axis: "y" });
    group.add(ring(0.45, 0.02, color, 2.28, 0.7));
  } else if (node.role === "balancer") {
    // A hub splitting one stream into three weighted arms.
    group.add(cylinder(0.5, 0.57, 0.3, 16, dark, 1.14));
    group.add(cylinder(0.46, 0.46, 0.04, 16, luminous, 1.31));
    const arms = new THREE.Group();
    arms.position.y = 1.58;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.rotation.y = angle;
      const beam = box(0.62, 0.07, 0.09, trim, 0.36, 0, 0);
      arm.add(beam);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), glow(color, 1));
      tip.position.x = 0.7;
      arm.add(tip);
      const trail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.012), glow(0xe6dcff, 0.9));
      trail.position.set(0.38, 0.05, 0);
      arm.add(trail);
      arms.add(arm);
    }
    group.add(arms);
    data.spinners.push({ object: arms, speed: 0.6, axis: "y" });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 14), luminous);
    orb.position.y = 1.62;
    group.add(orb);
    const crown = ring(0.34, 0.025, color, 2.12, 0.85);
    group.add(crown);
    data.rings.push(crown);
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), luminous);
    crest.position.y = 2.12;
    group.add(crest);
    data.floaters.push(crest);
  }
}

/** Wreckage and grime for salvage hardware found on the table. */
export function addSalvageScrap(group: DeviceGroup) {
  const rust = mat(0x5b3a26, 0x3b1d0c, 0.1);
  rust.roughness = 0.92;
  rust.metalness = 0.35;
  const pieces = [
    { w: 0.22, h: 0.06, d: 0.14, x: 0.72, z: 0.38, r: 0.6 },
    { w: 0.16, h: 0.05, d: 0.3, x: -0.66, z: 0.5, r: -0.3 },
    { w: 0.12, h: 0.12, d: 0.12, x: 0.28, z: -0.78, r: 1.1 },
  ];
  for (const piece of pieces) {
    const mesh = box(piece.w, piece.h, piece.d, rust, piece.x, 0.9, piece.z);
    mesh.rotation.set(piece.r * 0.3, piece.r, piece.r * 0.5);
    group.add(mesh);
    group.userData.scrap.push(mesh);
  }
  const tag = ring(0.9, 0.02, 0xc9874a, 0.8, 0.55);
  tag.scale.set(1, 1, 1);
  group.add(tag);
  group.userData.scrap.push(tag);
}

/** Per-frame life: floaters bob, spinners turn, LEDs blink. Offline hardware idles slowly. */
export function animateDevice(group: DeviceGroup, time: number, motion: number, reduced: boolean) {
  const data = group.userData;
  const pace = data.online ? 1 : 0.25;
  for (const [index, floater] of data.floaters.entries()) {
    floater.rotation.y += motion * pace * (index % 2 ? -0.5 : 0.65);
    floater.position.y += Math.sin(time * 2 + group.position.x + index) * motion * pace * 0.035;
  }
  for (const [index, decorativeRing] of data.rings.entries())
    if (index > 0) decorativeRing.rotation.z += motion * pace * (index % 2 ? -0.35 : 0.35);
  for (const spinner of data.spinners)
    spinner.object.rotation[spinner.axis] += motion * pace * spinner.speed;
  for (const blinker of data.blinkers) {
    const on = reduced ? 1 : 0.35 + 0.65 * (Math.sin(time * blinker.speed + blinker.phase) > -0.2 ? 1 : 0.15);
    blinker.material.opacity = blinker.base * (data.online ? on : 0.18);
  }
}
