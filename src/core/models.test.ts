/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { NetworkNode, Role } from "./types.ts";

// The device-model contract from blender/README.md, checked on the committed GLBs.
const ROLES: Role[] = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom"];
const FLAGS = new Set<keyof NetworkNode>(["fixed", "shielded", "upgraded", "amplified", "configured", "salvage", "stateful", "sentry"]);

async function load(role: Role) {
  const bytes = readFileSync(new URL(`../../public/models/${role}.glb`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  return { bytes: bytes.byteLength, scene: gltf.scene };
}

for (const role of ROLES) {
  test(`${role} model follows the device-model contract`, async () => {
    const { bytes, scene } = await load(role);
    assert.ok(bytes <= 300 * 1024, `${role}.glb is ${Math.round(bytes / 1024)} KB`);
    let triangles = 0;
    const hooks = new Set<string>();
    scene.traverse((object) => {
      const { hook, variant, axis } = object.userData as { hook?: string; variant?: keyof NetworkNode; axis?: string };
      if (variant !== undefined) assert.ok(FLAGS.has(variant), `${object.name}: unknown variant ${variant}`);
      if (hook !== undefined) {
        hooks.add(hook);
        assert.ok(["floater", "spinner", "blinker"].includes(hook), `${object.name}: unknown hook ${hook}`);
        // Hooks animate by adding to rotation, so they must start unrotated.
        assert.ok(object.quaternion.equals(new THREE.Quaternion()), `${object.name}: hooked part is rotated`);
        if (hook === "spinner") assert.ok(axis === undefined || axis === "y" || axis === "z", `${object.name}: axis ${axis}`);
      }
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      const name = (object.material as THREE.Material).name;
      if (name.startsWith("role_")) assert.match(name, /^role_(luminous|glow|wire)/, `${object.name}: unknown role material ${name}`);
      let parent: THREE.Object3D | null = object;
      while (parent && parent.userData.hook !== "blinker") parent = parent.parent;
      if (parent) assert.match(name, /^(role_glow|glow)/, `${object.name}: a blinker needs an unlit glow material, not ${name}`);
    });
    assert.ok(triangles > 200 && triangles <= 8000, `${role}: ${triangles} triangles`);
    assert.ok(hooks.size > 0, `${role}: no animated parts`);
    const bounds = new THREE.Box3().setFromObject(scene);
    // Y-up in three.js: the body stands on the plinth and stays under its label.
    assert.ok(bounds.min.y > 0.7 && bounds.max.y < 2.65, `${role}: height ${bounds.min.y.toFixed(2)}..${bounds.max.y.toFixed(2)}`);
    assert.ok(Math.max(-bounds.min.x, bounds.max.x, -bounds.min.z, bounds.max.z) < 0.95, `${role}: too wide`);
  });
}
