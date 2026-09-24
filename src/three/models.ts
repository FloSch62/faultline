import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { InstallationKind, NetworkNode, Role } from "../core/types.ts";
import type { DeviceGroup, Palette } from "./devices.ts";
import { glow, mat } from "./materials.ts";
import { TABLE_Y } from "./props.ts";

/**
 * Blender bodies, three families (blender/README.md is the contract):
 *   devices        blender/devices/<role>.py        → public/models/<role>.glb
 *   installations  blender/installations/<kind>.py  → public/models/installations/<kind>.glb
 *   props          blender/props/<name>.py          → public/models/props/<name>.glb
 * A device body stands on the code-built plinth (origin at the plinth base); installations and
 * props stand on the table (origin at the table surface).
 */
const MODEL_ROLES: readonly Role[] = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom"];
export const INSTALLATION_KINDS: readonly InstallationKind[] = ["tap", "jammer", "spike", "anchor", "breaker"];
export type PropModel = "crate" | "fragment";
export const PROP_MODELS: readonly PropModel[] = ["crate", "fragment"];

/** Per-kind colours: those of the hostiles that plant them (the Tap keeps MALWARE_COLOR). */
export const INSTALLATION_COLORS: Record<InstallationKind, number> = {
  tap: 0xff3f8e,
  jammer: 0x87b5ff,
  spike: 0xe49b72,
  anchor: 0xbba0e8,
  breaker: 0xff777e,
};
/** Props have no role colour; their faint lit-metal tint is brass. */
const PROP_COLOR = 0xe0b872;

function modelFamily<K extends string>(label: string, names: readonly K[], file: (name: K) => string) {
  const templates = new Map<K, THREE.Object3D>();
  let loading: Promise<boolean> | null = null;
  let settled = false;
  const load = (): Promise<boolean> => {
    loading ??= (async () => {
      const loader = new GLTFLoader();
      await Promise.all(names.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${file(name)}.glb`);
          // Every instance shares the template's geometry; World.disposeObject skips it.
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) child.geometry.userData.shared = true;
          });
          templates.set(name, gltf.scene);
        } catch (error) {
          console.warn(`${label} model for ${name} is unavailable; using the built-in body.`, error);
        }
      }));
      settled = true;
      return templates.size > 0;
    })();
    return loading;
  };
  return { templates, load, settled: () => settled };
}

const devices = modelFamily("Device", MODEL_ROLES, (role) => role);
const installations = modelFamily("Installation", INSTALLATION_KINDS, (kind) => `installations/${kind}`);
const props = modelFamily("Prop", PROP_MODELS, (name) => `props/${name}`);

/** True once loading has finished (successfully or not), so new devices already get their final body. */
export const deviceModelsSettled = devices.settled;
/** Loads every device model once. Resolves true when at least one arrived; roles that fail keep their built-in body. */
export const loadDeviceModels = devices.load;
/** True once the installation GLBs have arrived or failed; before that addInstallationBody returns null. */
export const installationModelsSettled = installations.settled;
/** Loads the five installation bodies once. Resolves true when at least one arrived. */
export const loadInstallationModels = installations.load;
/** True once the prop GLBs (crate, fragment) have arrived or failed. */
export const propModelsSettled = props.settled;
/** Loads the prop bodies once. Resolves true when at least one arrived. */
export const loadPropModels = props.load;
/** Loads all three families; resolves when every file has arrived or failed. */
export const loadAllModels = (): Promise<void> =>
  Promise.all([devices.load(), installations.load(), props.load()]).then(() => undefined);
/** True once every family has settled (a body built now is final). */
export const modelsSettled = () => devices.settled() && installations.settled() && props.settled();

type Extras = { hook?: string; variant?: keyof NetworkNode; part?: string; speed?: number; axis?: "y" | "z"; phase?: number; base?: number };
export type Spinner = { object: THREE.Object3D; speed: number; axis: "y" | "z" };
export type Blinker = { material: THREE.MeshBasicMaterial; phase: number; speed: number; base: number };

/** A cloned body with its hooks wired, for installations and props (devices use their DeviceGroup). */
export interface ModelBody {
  /** The clone added to the group; its origin is the table point. */
  root: THREE.Object3D;
  /** hook "floater": bob, a slow sway about the object's origin and a slow turn (animateModelBody). */
  floaters: { object: THREE.Object3D; base: THREE.Vector3; phase: number }[];
  spinners: Spinner[];
  /** hook "blinker": LEDs and lamps. The Breaker Charge has one (its lamp): set its speed to 4 at countdown 1. */
  blinkers: Blinker[];
  /** Named parts World.ts drives (glTF extra `part`). Crate: `lid`, hinged at the back edge; open with rotation.x → -1.9. */
  parts: Record<string, THREE.Object3D>;
  /** Every material this body owns (fresh per body): fade or dissolve them freely. */
  materials: THREE.Material[];
}

export interface BodyOptions {
  /** Height of the table surface inside the group. Default TABLE_Y: the device/prop group convention (group at y = -0.42). */
  y?: number;
  /** Use this one material for every mesh (e.g. a wireframe for the forecast ghost); lamps then do not blink. */
  material?: THREE.Material;
}

/** Clone a template and wire its glTF extras. `keep` drops variant parts the node does not have. */
function instantiate(template: THREE.Object3D, palette: Palette, keep: (extras: Extras) => boolean, override?: THREE.Material) {
  const root = template.clone(true);
  const floaters: THREE.Object3D[] = [];
  const spinners: Spinner[] = [];
  const blinkers: Blinker[] = [];
  const parts: Record<string, THREE.Object3D> = {};
  const materials = new Set<THREE.Material>();
  const converted = new Map<THREE.Material, THREE.Material>();
  const material = (source: THREE.Material, own: boolean) => {
    if (override) return override;
    if (own) return convert(source, palette);
    let result = converted.get(source);
    if (!result) converted.set(source, (result = convert(source, palette)));
    return result;
  };
  const unwanted: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (!keep(object.userData as Extras)) unwanted.push(object);
  });
  for (const object of unwanted) object.removeFromParent();
  root.traverse((object) => {
    const extras = object.userData as Extras;
    if (extras.part) parts[extras.part] = object;
    if (extras.hook === "floater") floaters.push(object);
    else if (extras.hook === "spinner") spinners.push({ object, speed: extras.speed ?? 0.5, axis: extras.axis ?? "y" });
    const blinker = extras.hook === "blinker" && !override;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.converted) return;
      child.userData.converted = true;
      child.material = material(child.material as THREE.Material, blinker);
      materials.add(child.material as THREE.Material);
      const lit = child.material instanceof THREE.MeshPhysicalMaterial;
      child.castShadow = lit;
      child.receiveShadow = lit;
      if (blinker && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.transparent = true;
        blinkers.push({ material: child.material, phase: extras.phase ?? 0, speed: extras.speed ?? 1.5, base: extras.base ?? 0.9 });
      }
    });
  });
  if (palette.luminous && !override) materials.add(palette.luminous);
  return { root, floaters, spinners, blinkers, parts, materials: [...materials] };
}

/**
 * Adds the Blender body for this role, wiring glTF extras to the device's animation hooks:
 *   hook: "floater" | "spinner" (speed, axis) | "blinker" (speed, phase, base)
 *   variant: a NetworkNode flag that must be set for the part to exist (e.g. "stateful", "sentry")
 * Materials are rebuilt per device so offline hardware can be tinted without touching other devices.
 * A sentry firewall's searchlight has an empty named "sentry_beam" at its lens (it turns with the
 * yoke): `group.getObjectByName("sentry_beam")` is where the quarantine beam starts.
 */
export function addModelBody(group: DeviceGroup, node: NetworkNode, palette: Palette): boolean {
  const template = devices.templates.get(node.role);
  if (!template) return false;
  const body = instantiate(template, palette, (extras) => !extras.variant || !!node[extras.variant]);
  const data = group.userData;
  data.floaters.push(...body.floaters);
  data.spinners.push(...body.spinners);
  data.blinkers.push(...body.blinkers);
  group.add(body.root);
  return true;
}

/** Palette for a body tinted by `color`: role_* materials take it, lit metal gets a faint tint of it. */
export function bodyPalette(color: number): Palette {
  return {
    color,
    dark: mat(0x242c2f, color, 0.06),
    trim: mat(0x776044, color, 0.08),
    luminous: mat(new THREE.Color(color).multiplyScalar(0.4).getHex(), color, 0.5),
  };
}
/** The palette of an installation kind (INSTALLATION_COLORS). Build one per installation so it can fade alone. */
export const installationPalette = (kind: InstallationKind) => bodyPalette(INSTALLATION_COLORS[kind]);

function place(group: THREE.Object3D, body: ReturnType<typeof instantiate>, y: number): ModelBody {
  body.root.position.y = y;
  group.add(body.root);
  return {
    ...body,
    floaters: body.floaters.map((object, index) => ({ object, base: object.position.clone(), phase: index * 1.9 + group.position.x })),
  };
}

/**
 * Adds the Blender body of an installation to `group` (a prop group, table at TABLE_Y by default).
 * role_luminous and role_glow* take the palette colour (default: the kind's colour). Returns null
 * until loadInstallationModels() has delivered that kind: keep the code-built body then.
 * Hooks: tap core floater + star spinner (1.1) + shards spinner (-1.6); jammer dish yoke spinner
 * (0.35); anchor lantern floater (origin at its hook: sway swings it); breaker lamp blinker
 * (speed 1.5, base 0.9; top of the lamp at 0.98 above the table). The spike has none.
 */
export function addInstallationBody(group: THREE.Object3D, kind: InstallationKind, palette: Palette = installationPalette(kind),
  options: BodyOptions = {}): ModelBody | null {
  const template = installations.templates.get(kind);
  if (!template) return null;
  return place(group, instantiate(template, palette, () => true, options.material), options.y ?? TABLE_Y);
}

/**
 * Adds a prop body (crate or message fragment) to `group`, table at TABLE_Y by default.
 * Crate: `parts.lid` pivots on the back edge; rotation.x from 0 (shut) to about -1.9 (open)
 * uncovers the amber interior. Fragment: the ribbon is a floater turning about its root.
 * Returns null until loadPropModels() has delivered it.
 */
export function addPropBody(group: THREE.Object3D, name: PropModel, options: BodyOptions = {}): ModelBody | null {
  const template = props.templates.get(name);
  if (!template) return null;
  return place(group, instantiate(template, bodyPalette(PROP_COLOR), () => true, options.material), options.y ?? TABLE_Y);
}

/** Per-frame life of an installation or prop body: floaters bob, sway and turn; spinners turn; lamps blink. */
export function animateModelBody(body: ModelBody, time: number, motion: number, reduced: boolean) {
  for (const floater of body.floaters) {
    const wave = reduced ? 0 : Math.sin(time * 1.6 + floater.phase);
    floater.object.position.y = floater.base.y + wave * 0.03;
    floater.object.rotation.x = reduced ? 0 : Math.sin(time * 0.9 + floater.phase) * 0.045;
    floater.object.rotation.z = reduced ? 0 : Math.cos(time * 0.7 + floater.phase) * 0.035;
    floater.object.rotation.y += motion * 0.45;
  }
  for (const spinner of body.spinners) spinner.object.rotation[spinner.axis] += motion * spinner.speed;
  for (const blinker of body.blinkers) {
    const on = reduced ? 1 : 0.35 + 0.65 * (Math.sin(time * blinker.speed + blinker.phase) > -0.2 ? 1 : 0.15);
    blinker.material.opacity = blinker.base * on;
  }
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
