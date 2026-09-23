import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { NetworkNode, Role } from "../core/types.ts";
import type { DeviceGroup, Palette } from "./devices.ts";
import { glow, mat } from "./materials.ts";

/** Every role's body is built in Blender (blender/devices/<role>.py → public/models/<role>.glb). */
const MODEL_ROLES: readonly Role[] = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer"];

const templates = new Map<Role, THREE.Object3D>();
let loading: Promise<boolean> | null = null;
let settled = false;

/** True once loading has finished (successfully or not), so new devices already get their final body. */
export const deviceModelsSettled = () => settled;

/** Loads every device model once. Resolves true when at least one arrived; roles that fail keep their built-in body. */
export function loadDeviceModels(): Promise<boolean> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    await Promise.all(MODEL_ROLES.map(async (role) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${role}.glb`);
        // Every device instance shares the template's geometry; World.disposeObject skips it.
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.userData.shared = true;
        });
        templates.set(role, gltf.scene);
      } catch (error) {
        console.warn(`Device model for ${role} is unavailable; using the built-in body.`, error);
      }
    }));
    settled = true;
    return templates.size > 0;
  })();
  return loading;
}

/**
 * Adds the Blender body for this role, wiring glTF extras to the device's animation hooks:
 *   hook: "floater" | "spinner" (speed, axis) | "blinker" (speed, phase, base)
 *   variant: a NetworkNode flag that must be set for the part to exist (e.g. "stateful")
 * Materials are rebuilt per device so offline hardware can be tinted without touching other devices.
 */
export function addModelBody(group: DeviceGroup, node: NetworkNode, palette: Palette): boolean {
  const template = templates.get(node.role);
  if (!template) return false;
  const body = template.clone(true);
  const data = group.userData;
  const converted = new Map<THREE.Material, THREE.Material>();
  const material = (source: THREE.Material, own: boolean) => {
    if (own) return convert(source, palette);
    let result = converted.get(source);
    if (!result) converted.set(source, (result = convert(source, palette)));
    return result;
  };
  const unwanted: THREE.Object3D[] = [];
  body.traverse((object) => {
    const extras = object.userData as { hook?: string; variant?: keyof NetworkNode; speed?: number; axis?: "y" | "z"; phase?: number; base?: number };
    if (extras.variant && !node[extras.variant]) unwanted.push(object);
    if (extras.hook === "floater") data.floaters.push(object);
    else if (extras.hook === "spinner") data.spinners.push({ object, speed: extras.speed ?? 0.5, axis: extras.axis ?? "y" });
    const blinker = extras.hook === "blinker";
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.converted) return;
      child.userData.converted = true;
      child.material = material(child.material as THREE.Material, blinker);
      const lit = child.material instanceof THREE.MeshPhysicalMaterial;
      child.castShadow = lit;
      child.receiveShadow = lit;
      if (blinker && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.transparent = true;
        data.blinkers.push({ material: child.material, phase: extras.phase ?? 0, speed: extras.speed ?? 1.5, base: extras.base ?? 0.9 });
      }
    });
  });
  for (const object of unwanted) object.removeFromParent();
  group.add(body);
  return true;
}

/**
 * Material names follow blender/lib/faultline.py: role_luminous is the device's luminous metal;
 * role_glow*, role_wire*, glow_* and wire_* are unlit (wire = wireframe; role = role colour);
 * everything else is lit metal.
 */
function convert(source: THREE.Material, { color, luminous }: Palette): THREE.Material {
  const standard = source as THREE.MeshStandardMaterial;
  const name = source.name;
  if (name.startsWith("role_luminous")) return luminous;
  if (/^(role_|glow|wire)/.test(name)) {
    const role = name.startsWith("role_");
    const basic = glow(role ? color : 0xffffff, (source.userData.opacity as number | undefined) ?? 1);
    if (!role) basic.color.copy(standard.color);
    basic.wireframe = /^(role_)?wire/.test(name);
    basic.side = source.side;
    return basic;
  }
  const lit = mat(0xffffff);
  lit.side = source.side;
  lit.color.copy(standard.color);
  lit.metalness = standard.metalness;
  lit.roughness = standard.roughness;
  if (standard.emissiveIntensity > 0 && standard.emissive.getHex() !== 0) {
    lit.emissive.copy(standard.emissive);
    lit.emissiveIntensity = standard.emissiveIntensity;
  } else {
    // The same faint role tint the built-in palette gives dark metal.
    lit.emissive.setHex(color);
    lit.emissiveIntensity = 0.06;
  }
  return lit;
}
