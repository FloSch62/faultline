import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { linkKey } from "../core/graph.ts";
import { wreckCrossings } from "../core/terrain.ts";
import { conditionOf, maxConditionOf } from "../core/combat/board.ts";
import type {
  Enemy, Installation, InstallationKind, IntentKind, NetworkNode, Port, Role, Terrain, Topology, Zone, ZoneEffect,
} from "../core/types.ts";
import { ENEMIES } from "../core/enemies.ts";
import { STAGES } from "../core/stages.ts";
import { EnemyActor } from "./EnemyActor.ts";
import { cylinder, dashedRing, glow, mat, ring } from "./materials.ts";
import { COLORS, addRoleBody, addSalvageScrap, animateDevice, newDeviceGroup, type DeviceGroup } from "./devices.ts";
import {
  INSTALLATION_COLORS, animateModelBody, deviceModelsSettled, installationModelsSettled, loadDeviceModels, loadInstallationModels,
  loadPropModels, propModelsSettled,
} from "./models.ts";
import { MALWARE_COLOR, TABLE_Y, animateProp, buildDebris, type PropGroup } from "./props.ts";
import {
  BLAST_COLOR, REACH, REACH_KINDS, buildInstallation, buildInstallationGhost, buildTableProp, refreshInstallation, segmentedRing,
  type InstallationGroup,
} from "./front.ts";
import {
  brassRingTexture, drawRailPlate, haloTexture, makeLabel, packetTexture, railPlateSprite, reticleTexture, TABLE_LABEL_ORDER, type RailPlateData,
} from "./plates.ts";
import { channelColor } from "../channel-palette.ts";

export type WorldPoint = { x: number; z: number };
export type BoardZone = Zone;
/** What the pointer rests on over the table: a device, a cable (its linkKey), an installation,
 * a hostile (its port) or a delivery's packet glyph (its channelKey). */
export type TableHover = { kind: "node" | "link" | "installation" | "port" | "delivery"; id: string };
export interface WorldCallbacks {
  onGround: (point: WorldPoint) => void;
  onNode: (id: string) => void;
  onLink: (key: string) => void;
  onMove: (id: string, point: WorldPoint | null, finished: boolean) => void;
  /** A hostile's sprite or rail plate was clicked: target it (or aim the selected delivery there). */
  onPort?: (port: Port) => void;
  /** A packet glyph was dropped on a port. */
  onAim?: (channelKey: string, port: Port | null) => void;
  /** A packet glyph was clicked (select that delivery), or the empty table while one is selected (null). */
  onDelivery?: (channelKey: string | null) => void;
  /** After every drawn frame: DOM overlays that follow the table (the intent badges) re-anchor. */
  onFrame?: () => void;
  /** An installation was clicked: its plate, or a Demolition Charge's target. */
  onInstallation?: (id: string) => void;
  /** The pointer rests on something on the table (null: on nothing, dragging, placing or
   * cabling). Client coordinates, for the hover card. */
  onHover?: (target: TableHover | null, clientX: number, clientY: number) => void;
}
/** Anything that may appear in an enemy intent, including the v3 name of an install. */
export type ActionKind = IntentKind | "infect";

/** What a rail plate reads for its port this phase, all from the forecast. */
export interface RailReadout {
  hpAfter: number;
  damage: number;
  overflowIn: number;
  lethal: boolean;
  intent: IntentKind | null;
  amount: number;
  state: RailPlateData["state"];
  /** Leaders: escalation level (0–3); null for escorts, adds and singles. */
  escalation: number | null;
}
export interface RailState {
  /** The target: its rail plate wears the reticle. */
  focus: Port | null;
  /** The port the right plate details (the table marks only the target). */
  selected: Port | null;
  readouts: Partial<Record<Port, RailReadout>>;
}
/** One delivery of this transmission, as the table shows it. */
export interface DeliveryView {
  key: string;
  primary: boolean;
  path: string[];
  port: Port;
  aimed: boolean;
  amount: number;
}
/** What the table front forecasts: the next installations (ghosts) and each installation's effect. */
export interface TableForecast {
  installs: { kind: InstallationKind; x: number; z: number; destroyed?: boolean; boosts?: string; absorbed?: string }[];
}
/** One installation effect as the playback shows it (the forecast's record). */
export interface InstallationEffectView {
  id: string;
  kind: InstallationKind;
  effect: "jam" | "wear" | "tick" | "detonate" | "idle" | "anchor" | "siphon";
  target: string | null;
  countdown?: number;
  decoyed?: boolean;
  absorbed?: boolean;
  cancelled?: boolean;
  destroyed?: boolean;
}

interface FlyingPacket {
  mesh: THREE.Group;
  routes: THREE.Curve<THREE.Vector3>[];
  speed: number;
  start: number;
  done?: () => void;
}
interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}
interface SignalPulse {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  duration: number;
  scale: number;
  delay: number;
}
interface Bolt {
  mesh: THREE.Group;
  curve: THREE.Curve<THREE.Vector3>;
  start: number;
  duration: number;
  done: () => void;
}
/** A straight glowing beam between two points that fades out (quarantine, jam, wear). */
interface Beam {
  mesh: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  start: number;
  duration: number;
}
/** Something leaving the table: its materials fade while it lifts (scrub dissolve, phantom fade). */
interface Fading {
  object: THREE.Object3D;
  materials: { material: THREE.Material; opacity: number }[];
  start: number;
  duration: number;
  rise: number;
  baseY: number;
}
/** A crate or a message fragment in flight, landing, opening and fading. */
interface TableProp {
  group: THREE.Group;
  body: ReturnType<typeof buildTableProp>["body"];
  lid: THREE.Object3D | null;
  curve: THREE.Curve<THREE.Vector3> | null;
  start: number;
  flight: number;
  hold: number;
  landed: boolean;
  opened: boolean;
  onLand: () => void;
  done: () => void;
  float: boolean;
  /** How long the lid takes to open (ms). */
  open?: number;
}
interface CableVisual {
  body: THREE.MeshPhysicalMaterial;
  filament: THREE.MeshBasicMaterial;
  haze: THREE.MeshBasicMaterial;
  color: number;
  faulty: boolean;
  source: string;
}
interface EnemyAction {
  kind: ActionKind;
  start: number;
  duration: number;
  effect: THREE.Group;
  target: THREE.Vector3;
  origin: THREE.Vector3;
  impacted: boolean;
  color: number;
  done: () => void;
  onImpact: () => void;
}
/** One stand on the far rail: its sprite rig, embers, light, rail plate and target reticle. */
interface PortVisual {
  port: Port;
  group: THREE.Group;
  actor: EnemyActor;
  light: THREE.PointLight;
  under: THREE.PointLight | null;
  enemy: Enemy | null;
  uid: string | null;
  /** `${file}:${index}` of the bound cell; the port's own clone of the sheet texture. */
  art: string;
  texture: THREE.Texture | null;
  placeholder: boolean;
  size: number;
  drop: number;
  boss: boolean;
  hitAt: number;
  /** Its death transition finished: hidden until a newcomer takes the port. */
  dead: boolean;
  dying: boolean;
  /** Waiting for its sheet: not drawn yet. */
  ready: boolean;
  dimFrom: number;
  dimUntil: number;
  action: EnemyAction | null;
  state: string;
  plate: THREE.Sprite;
  plateCanvas: HTMLCanvasElement;
  plateKey: string;
  reticle: THREE.Sprite;
  highlight: THREE.Sprite;
  hit: THREE.Sprite;
  readout: RailReadout | null;
  /** A mid-playback health (the packet landed; the rules advance at the end). */
  shownHp: number | null;
}
interface DeliveryGlyph {
  view: DeliveryView;
  glyph: THREE.Sprite;
  /** The selected delivery's lit ring in its channel colour. */
  halo: THREE.Sprite | null;
  line: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  base: THREE.Vector3;
  toward: THREE.Vector3;
  phase: number;
}

/** Primary route is gold; every other independent channel is cyan. */
export const CHANNEL_COLORS = { primary: 0xf2c46d, secondary: 0x6fe0f0 } as const;
/** Unarmored cable crossing wreckage, and a worn device's rim. */
const FRAYED_COLOR = 0xd08a52;
const REPAIR_COLOR = 0x83eec7;
const BRASS_COLOR = 0xe2bd76;
const SHELTER_COLOR = 0xb5cf7a;
const BITE_COLOR = 0x8fd49f;
/** Cable spans arc over the table; the xz projection stays linear in t, so a
 * span fraction from the rules maps straight onto the curve. */
function cableCurve(from: WorldPoint, to: WorldPoint) {
  const start = new THREE.Vector3(from.x, 0.62, from.z);
  const end = new THREE.Vector3(to.x, 0.62, to.z);
  const center = start.clone().add(end).multiplyScalar(0.5);
  center.y += Math.min(0.38 + start.distanceTo(end) * 0.07, 1.13);
  return new THREE.QuadraticBezierCurve3(start, center, end);
}
/** The hostile rises from behind the far rail: the table hides its lower body and its
 * crown reaches the header band. Sized so the head stays on screen from 1280×720 up. */
const ENEMY_HOME = new THREE.Vector3(0, 0.7, -10.6);
const enemyHome = (size: number) => ENEMY_HOME.clone().setY(ENEMY_HOME.y - (size - 10.5) * 0.3);
export const PORT_ORDER: readonly Port[] = ["left", "centre", "right"];
/** Escorts and adds stand at x ±6.6, one unit nearer the table so they read in front of the
 * leader's shoulders; their feet hide behind the same far rail. */
const SIDE_X = 6.6;
const SIDE_Z = -9.6;
function portHome(port: Port, size: number) {
  if (port === "centre") return enemyHome(size);
  return new THREE.Vector3(port === "left" ? -SIDE_X : SIDE_X, -1.55 + size * 0.3, SIDE_Z);
}
/** Rail plates hang just behind the far rail, under their hostile as the default camera sees it. */
const PLATE_Z = -6.1;
const PLATE_SIZE = { leader: [5.4, 1.6875], side: [4.3, 1.34375] } as const;
/** Plates hang with their foot on the far rail, in front of their hostile's lower body. */
const PLATE_FOOT = 0.06;
const CAMERA_HOME = new THREE.Vector3(0, 12.8, 18.8);
const plateX = (port: Port) => port === "centre" ? 0 : (port === "left" ? -SIDE_X : SIDE_X) * (CAMERA_HOME.z - PLATE_Z) / (CAMERA_HOME.z - SIDE_Z);
const snap = (n: number) => Math.round(n * 2) / 2;
/** The v4 art sheets may still be in the paint shop: a stand-in cell of a kindred body is tinted
 * toward the hostile's colour until the painted cell lands. */
const STAND_INS: Record<string, { file: string; columns: number; rows: number; index: number }> = {
  foreman: { file: "hostiles-zones", columns: 3, rows: 1, index: 2 },
  nest: { file: "hostiles-zones", columns: 3, rows: 1, index: 1 },
  demolition: { file: "hostiles-expedition", columns: 3, rows: 2, index: 2 },
  blight: { file: "hostiles-expedition", columns: 3, rows: 2, index: 0 },
  "gate-warden": { file: "hostiles", columns: 3, rows: 1, index: 1 },
  chorister: { file: "hostiles-expedition", columns: 3, rows: 2, index: 3 },
  "quarantine-drone": { file: "hostiles", columns: 3, rows: 1, index: 2 },
};
const STAND_IN_DEFAULT = { file: "hostiles", columns: 3, rows: 1, index: 0 };
/** Sheets the table uses from the first battle on; the v4 leaders and adds load on demand. */
const PRELOADED_SHEETS = ["hostiles", "hostiles-alpha", "hostiles-zones", "hostiles-expedition", "stage-guardians", "hostiles-escorts"];
const ZONE_OF = (z: number): Zone => z < -1.3 ? "north" : z > 1.3 ? "south" : "center";
const ZONE_Z: Record<Zone, number> = { north: -3.25, center: 0, south: 3.25 };

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  /** Minimum ms between frames; 0 draws every animation frame. */
  private readonly frameInterval: number;
  private lastFrame = 0;
  private readonly antialias: ShaderPass;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly sheets = new Map<string, { texture: THREE.Texture; status: "loading" | "ready" | "missing"; waiters: (() => void)[] }>();
  private readonly ports: PortVisual[];
  private readonly rail = new THREE.Group();
  private readonly stageBackdrops = new Map<string, THREE.Texture>();
  private backdropPath = "";
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: WorldCallbacks;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly board = new THREE.Group();
  private readonly dynamic = new THREE.Group();
  private readonly terrainGroup = new THREE.Group();
  private readonly frontGroup = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();
  private readonly deliveryGroup = new THREE.Group();
  private readonly ambiance = new THREE.Group();
  private motes!: THREE.Points;
  private readonly shafts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly hitObjects: THREE.Object3D[] = [];
  private readonly devices = new Map<string, DeviceGroup>();
  private readonly cableCurves = new Map<string, THREE.Curve<THREE.Vector3>>();
  private readonly cableVisuals = new Map<string, CableVisual>();
  private readonly cableGroups = new Map<string, THREE.Group>();
  /** linkKey → { travel direction source, channel index (0 = primary) } */
  private readonly channelSources = new Map<string, { source: string; channel: number }>();
  private readonly channelNodes = new Map<string, number>();
  private channelPaths: string[][] = [];
  private routeSignature = "";
  private online: Set<string> | null = null;
  private terrainSignature = "";
  private terrain: Terrain | null = null;
  // ---- the table front
  private readonly installations = new Map<string, InstallationGroup>();
  private installationList: Installation[] = [];
  /** Highest integrity seen per installation: spent points show as hollow pips. */
  private readonly pipMax = new Map<string, number>();
  private readonly phantomMax = new Map<string, number>();
  private ghostSignature = "";
  private ghostSockets: { kind: InstallationKind; x: number; z: number }[] = [];
  /** Last known installation positions, so an effect can play after removal. */
  private readonly installationSpots = new Map<string, WorldPoint>();
  private selectedInstallation: string | null = null;
  private targetingInstallations = false;
  private readonly frontLights: THREE.PointLight[] = [];
  private readonly tethers = new THREE.Group();
  private hoverRing!: THREE.Group;
  private selectRing!: THREE.Group;
  private hovered: { kind: "node" | "installation"; id: string } | null = null;
  // ---- forecast
  private forecastTargets: string[] = [];
  private readonly forecastMarkers: THREE.Group[] = [];
  private readonly zoneVisuals = new Map<BoardZone, {
    fill: THREE.MeshBasicMaterial;
    label: THREE.MeshBasicMaterial;
    warning: THREE.Mesh;
    color: number;
  }>();
  private forecastZone: BoardZone | null = null;
  private zoneEffects: ZoneEffect[] = [];
  private previewZone: BoardZone | null = null;
  private previewZoneBlocked = false;
  private targetingZone = false;
  private readonly cableBeads: {
    bead: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    curve: THREE.Curve<THREE.Vector3>;
    key: string;
    offset: number;
    active: boolean;
    reversed: boolean;
    routed: boolean;
  }[] = [];
  /** Embers where frayed cables cross wreckage; they flicker. */
  private readonly frayEmbers: { material: THREE.MeshBasicMaterial; phase: number; base: number }[] = [];
  private readonly placement: THREE.Group;
  private placementMaterials: THREE.MeshBasicMaterial[] = [];
  private scanMaterial!: THREE.ShaderMaterial;
  private readonly light: THREE.PointLight;
  private packets: FlyingPacket[] = [];
  private sparks: Spark[] = [];
  private pulses: SignalPulse[] = [];
  private bolts: Bolt[] = [];
  private beams: Beam[] = [];
  private fading: Fading[] = [];
  private props: TableProp[] = [];
  private readonly deviceStates = new Map<string, string>();
  private battleIdentity: string | null = null;
  private topology: Topology = { nodes: [], links: [] };
  /** Every hostile on the rail (the dead included until a newcomer takes the port). */
  private enemies: Enemy[] = [];
  private pack = false;
  private railState: RailState = { focus: null, selected: null, readouts: {} };
  private deliveries: DeliveryView[] = [];
  private selectedDelivery: string | null = null;
  private readonly glyphs: DeliveryGlyph[] = [];
  private deliverySignature = "";
  private faultNodes: string[] = [];
  private faultLinks: string[] = [];
  private selected: string | null = null;
  private placementRole: Role | null = null;
  private linkSource: string | null = null;
  /** The pending cable is armored and cannot fray. */
  private linkArmored = false;
  /** Ghost cable from the link source to the hovered device. */
  private linkGhost: THREE.Group | null = null;
  private linkGhostTarget: string | null = null;
  private pointerDown: {
    id: string | null;
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;
  /** A packet glyph being dragged toward a port. */
  private aimDrag: { key: string; pointerId: number; x: number; y: number; moved: boolean; over: Port | null } | null = null;
  /** While a delivery is selected: a lit line from its glyph to the pointer. */
  private tether: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private active = true;
  private visible = true;
  private frame = 0;
  private impactEndsAt = 0;
  private shake = { until: 0, power: 0, duration: 1 };
  private readonly cameraRest = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, callbacks: WorldCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.setStage(0);
    this.scene.backgroundIntensity = 0.62;
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(0, 0.2, -0.4);
    // Browser tests set __faultlineTestRender: the same scene and rules, drawn without bloom,
    // shadows or full resolution at 20 fps, so a software-rendered suite can run in parallel.
    const cheap = (globalThis as { __faultlineTestRender?: boolean }).__faultlineTestRender === true;
    this.frameInterval = cheap ? 50 : 0;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !cheap,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(cheap ? 0.5 : Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = !cheap;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.environment = pmrem.fromScene(roomEnvironment, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.38;
    roomEnvironment.dispose();
    pmrem.dispose();
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = 13.5;
    this.controls.maxDistance = 31;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.37;
    this.controls.target.set(0, 0.15, -0.3);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!cheap) this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.3, 0.95),
    );
    this.composer.addPass(new OutputPass());
    this.antialias = new ShaderPass(FXAAShader);
    if (!cheap) this.composer.addPass(this.antialias);

    this.scene.add(new THREE.HemisphereLight(0xb7cad6, 0x31251c, 1.0));
    const key = new THREE.DirectionalLight(0xffdda3, 2.4);
    key.position.set(-8, 17, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x89aec9, 1.7);
    rim.position.set(7, 8, -8);
    this.scene.add(rim);
    this.light = new THREE.PointLight(0x4be7cf, 24, 18, 2);
    this.light.position.set(0, 3.2, 0);
    this.scene.add(this.light);
    // Two fixed table-front lights (never added or removed, so no shader rebuilds when
    // installations come and go): they glow under the first two installations.
    for (let i = 0; i < 2; i++) {
      const glowLight = new THREE.PointLight(MALWARE_COLOR, 0, 3.2, 2);
      this.frontLights.push(glowLight);
      this.scene.add(glowLight);
    }
    this.buildTable();
    this.buildAmbiance();
    this.placement = this.buildPlacement();
    this.scene.add(this.placement);
    this.scene.add(this.terrainGroup);
    this.scene.add(this.frontGroup);
    this.scene.add(this.ghostGroup);
    this.scene.add(this.tethers);
    this.scene.add(this.dynamic);
    this.scene.add(this.deliveryGroup);
    this.hoverRing = dashedRing(REACH, 0.034, MALWARE_COLOR, 0.24, 0.85, 32);
    this.selectRing = dashedRing(REACH, 0.038, MALWARE_COLOR, 0.25, 0.95, 32);
    for (const reach of [this.hoverRing, this.selectRing]) {
      reach.visible = false;
      this.scene.add(reach);
    }
    for (const file of PRELOADED_SHEETS) this.sheet(file);
    this.ports = PORT_ORDER.map(port => this.buildPort(port));
    this.scene.add(this.rail);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.onPointerDown, true);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.tick();
    // Blender bodies stream in; anything built before they land is rebuilt once.
    if (!deviceModelsSettled())
      void loadDeviceModels().then((loaded) => {
        if (loaded && this.active) this.rebuildDevices();
      });
    if (!installationModelsSettled() || !propModelsSettled())
      void Promise.all([loadInstallationModels(), loadPropModels()]).then(([loaded]) => {
        if (loaded && this.active) this.rebuildInstallations();
      });
  }

  private buildTable() {
    this.board.position.y = -0.42;
    const outer = new THREE.Mesh(
      new RoundedBoxGeometry(17.6, 0.75, 11.65, 3, 0.18),
      mat(0x383733),
    );
    outer.castShadow = true;
    outer.receiveShadow = true;
    this.board.add(outer);
    const side = new THREE.Mesh(
      new RoundedBoxGeometry(17.23, 0.22, 11.3, 3, 0.08),
      mat(0x675840),
    );
    side.position.y = 0.43;
    side.castShadow = true;
    side.receiveShadow = true;
    this.board.add(side);
    const inset = new THREE.Mesh(
      new THREE.BoxGeometry(16.6, 0.08, 10.75),
      mat(0x171d20, 0x1a2428, 0.25),
    );
    inset.position.y = 0.56;
    inset.receiveShadow = true;
    this.board.add(inset);

    // Four separate frames make the table read like a manufactured instrument.
    const rails = [
      { x: 0, z: -5.72, w: 17.55, d: 0.2 },
      { x: 0, z: 5.72, w: 17.55, d: 0.2 },
      { x: -8.69, z: 0, w: 0.2, d: 11.35 },
      { x: 8.69, z: 0, w: 0.2, d: 11.35 },
    ];
    for (const rail of rails) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(rail.w, 0.16, rail.d),
        mat(0x756043, 0x241f16, 0.1),
      );
      mesh.position.set(rail.x, 0.47, rail.z);
      mesh.castShadow = true;
      this.board.add(mesh);
    }
    const edgeMaterial = glow(0xbb9e6c, 0.65);
    for (const z of [-5.59, 5.59]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(17.2, 0.018, 0.025),
        edgeMaterial,
      );
      strip.position.set(0, 0.57, z);
      this.board.add(strip);
    }
    for (const x of [-8.55, 8.55]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.018, 11.1),
        edgeMaterial,
      );
      strip.position.set(x, 0.57, 0);
      this.board.add(strip);
    }

    this.scanMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.44 }, uThreat: { value: new THREE.Color(0x000000) } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform float uTime; uniform float uAlpha; uniform vec3 uThreat; varying vec2 vUv;
        float line(vec2 p){ vec2 g=abs(fract(p)-.5); vec2 w=fwidth(p)*1.2; return 1.-min(1.,min(g.x/w.x,g.y/w.y)); }
        void main(){
          vec2 uv=vUv; vec2 centered=(uv-.5)*vec2(1.62,1.0);
          float grid=line(uv*vec2(32.,20.));
          float major=line(uv*vec2(8.,5.));
          float sweep=pow(max(0.,1.-abs(fract(atan(centered.y,centered.x)/6.283+uTime*.055)-.5)*8.),2.);
          float lane=exp(-abs(uv.y-.5)*18.)*.12;
          float rings=pow(max(0.,1.-abs(fract(length(centered)*4.-uTime*.55)-.5)*8.),2.)*.26;
          vec3 base=vec3(.023,.030,.033);
          vec3 teal=vec3(.25,.25,.19);
          vec3 color=base+teal*(grid*.14+major*.15+sweep*.015+rings*.01+lane*.2);
          // The hostile's presence bleeds across the far rail of the table.
          float far=smoothstep(.55,1.,uv.y);
          color+=uThreat*far*far*(.55+.45*sin(uTime*1.3));
          float fade=smoothstep(0.,.06,uv.x)*smoothstep(0.,.06,uv.y)*smoothstep(0.,.06,1.-uv.x)*smoothstep(0.,.06,1.-uv.y);
          gl_FragColor=vec4(color,fade*uAlpha);
        }`,
    });
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(16.25, 10.45),
      this.scanMaterial,
    );
    scan.rotation.x = -Math.PI / 2;
    scan.position.y = 0.614;
    scan.renderOrder = 1;
    this.board.add(scan);
    this.buildTableZones();

    // Alternating signal bays and bolts break up the silhouette on every edge.
    for (let i = -8; i <= 8; i++) {
      for (const z of [-5.77, 5.77]) {
        const bay = new THREE.Mesh(
          new THREE.BoxGeometry(i % 2 ? 0.34 : 0.52, 0.065, 0.052),
          glow(i % 3 ? 0x214f65 : 0x63eedc, i % 3 ? 0.65 : 0.95),
        );
        bay.position.set(i, 0.52, z);
        this.board.add(bay);
      }
    }
    for (const x of [-8.28, 8.28])
      for (const z of [-5.21, 5.21]) {
        const fixture = new THREE.Group();
        fixture.position.set(x, 0.62, z);
        fixture.add(cylinder(0.22, 0.26, 0.18, 8, mat(0x526677), 0.07));
        fixture.add(cylinder(0.12, 0.12, 0.08, 8, glow(0x9cf7e8), 0.19));
        fixture.add(ring(0.19, 0.018, 0x55e4d6, 0.18));
        this.board.add(fixture);
      }
    // Machinery under the deck creates layered mechanical depth.
    for (const z of [-4.5, -2.3, 0, 2.3, 4.5]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(16.9, 0.11, 0.16),
        mat(0x253347),
      );
      rib.position.set(0, -0.46, z);
      this.board.add(rib);
    }
    for (const x of [-7, 7]) {
      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.65, 1.8, 10),
        mat(0x17283d),
      );
      support.position.set(x, -1.23, 0);
      this.board.add(support);
      const lamp = ring(0.48, 0.06, 0x286d83, -2.06);
      lamp.position.x = x;
      this.board.add(lamp);
    }
    // Containerlab flask insignia engraved into the central tabletop.
    const logoTexture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}containerlab-mark.svg`,
    );
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    const insignia = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.7),
      new THREE.MeshBasicMaterial({
        map: logoTexture,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
      }),
    );
    insignia.rotation.x = -Math.PI / 2;
    insignia.position.set(0, 0.624, 0);
    this.board.add(insignia);
    this.scene.add(this.board);
  }

  private tableInscription(text: string, width: number, color: number) {
    // Drawn at twice the size so the engraving stays sharp on large, oblique views.
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.scale(2, 2);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = "700 78px Cinzel, serif";
    context.fillText(text, 256, 66, 488);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({
      color, map: texture, transparent: true, opacity: 0.72, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2.5), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  private buildTableZones() {
    const zones: { id: BoardZone; name: string; z: number; depth: number; color: number }[] = [
      { id: "north", name: "NORTH", z: -3.25, depth: 3.9, color: 0x82aabf },
      { id: "center", name: "CENTER", z: 0, depth: 2.6, color: 0xc4ac7f },
      { id: "south", name: "SOUTH", z: 3.25, depth: 3.9, color: 0x8ab7a4 },
    ];
    for (const zone of zones) {
      const fill = glow(zone.color, 0.045);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(16.12, zone.depth), fill);
      field.rotation.x = -Math.PI / 2;
      field.position.set(0, 0.619, zone.z);
      field.renderOrder = 1;
      this.board.add(field);
      const label = this.tableInscription(zone.name, 1.45, zone.color);
      label.position.set(-7.22, 0.638, zone.z);
      this.board.add(label);
      const warning = this.tableInscription("INCOMING", 1.58, 0xf29a81);
      warning.position.set(7.12, 0.64, zone.z);
      warning.visible = false;
      this.board.add(warning);
      this.zoneVisuals.set(zone.id, { fill, label: label.material, warning, color: zone.color });
    }
    for (const z of [-1.3, 1.3]) {
      const divider = new THREE.Mesh(new THREE.BoxGeometry(16.12, 0.006, 0.014), glow(0xa7a48b, 0.4));
      divider.position.set(0, 0.637, z);
      divider.renderOrder = 2;
      this.board.add(divider);
      for (let x = -8; x <= 8; x += 2) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.18), glow(0xa7a48b, 0.5));
        tick.position.set(x, 0.638, z);
        this.board.add(tick);
      }
    }
  }

  private buildAmbiance() {
    const motes: number[] = [];
    for (let i = 0; i < 270; i++) {
      const x = (Math.random() - 0.5) * 45;
      const y = Math.random() * 19 - 2;
      const z = (Math.random() - 0.5) * 38;
      motes.push(x, y, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(motes, 3),
    );
    this.motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x9fc7e1,
        size: 0.04,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.ambiance.add(this.motes);
    const under = new THREE.PointLight(0x52c6ef, 42, 16, 2);
    under.position.set(0, -2.1, 0);
    this.ambiance.add(under);
    for (const side of [-1, 1]) {
      const tower = new THREE.Group();
      tower.position.set(side * 10.3, -0.6, -5.7);
      tower.add(cylinder(0.42, 0.6, 3.7, 8, mat(0x152335), 0));
      tower.add(
        cylinder(0.19, 0.3, 0.7, 8, mat(0x40546b, 0x0f3340, 0.4), 2.15),
      );
      tower.add(ring(0.37, 0.035, 0x6cdef2, 1.6, 0.8));
      const antenna = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 2.0, 7),
        mat(0x839caf, 0x20546c, 0.2),
      );
      antenna.position.y = 3.3;
      tower.add(antenna);
      this.ambiance.add(tower);
    }
    // Faint light shafts fall through the relay hall behind the hostile.
    const shaftCanvas = document.createElement("canvas");
    shaftCanvas.width = 64;
    shaftCanvas.height = 256;
    const shaft = shaftCanvas.getContext("2d")!;
    const across = shaft.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    shaft.fillStyle = across;
    shaft.fillRect(0, 0, 64, 256);
    shaft.globalCompositeOperation = "destination-in";
    const down = shaft.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, "rgba(0,0,0,.9)");
    down.addColorStop(0.7, "rgba(0,0,0,.35)");
    down.addColorStop(1, "rgba(0,0,0,0)");
    shaft.fillStyle = down;
    shaft.fillRect(0, 0, 64, 256);
    const shaftTexture = new THREE.CanvasTexture(shaftCanvas);
    shaftTexture.colorSpace = THREE.SRGBColorSpace;
    for (const [x, width, tilt] of [[-6.5, 3.2, 0.2], [-1.2, 4.6, 0.08], [5.4, 3.6, -0.16]] as const) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 19),
        new THREE.MeshBasicMaterial({
          map: shaftTexture, color: 0xffe3b0, transparent: true, opacity: 0.06,
          depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        }),
      );
      mesh.position.set(x, 6.5, -15.5);
      mesh.rotation.z = tilt;
      mesh.renderOrder = -1;
      this.shafts.push(mesh);
      this.ambiance.add(mesh);
    }
    this.scene.add(this.ambiance);
  }

  private buildPlacement(): THREE.Group {
    const group = new THREE.Group();
    const add = (mesh: THREE.Mesh) => {
      this.placementMaterials.push(mesh.material as THREE.MeshBasicMaterial);
      group.add(mesh);
    };
    add(ring(0.84, 0.022, 0x80ffe6, 0.65, 0.9));
    add(ring(0.59, 0.012, 0x80ffe6, 0.67, 0.55));
    add(cylinder(0.57, 0.57, 0.015, 32, glow(0x72eedd, 0.1), 0.66));
    for (let i = 0; i < 4; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.025, 0.04),
        glow(0xa7ffef, 0.8),
      );
      dash.position.set(
        Math.cos((i * Math.PI) / 2) * 0.97,
        0.67,
        Math.sin((i * Math.PI) / 2) * 0.97,
      );
      dash.rotation.y = (-i * Math.PI) / 2;
      add(dash);
    }
    group.visible = false;
    return group;
  }

  /** Static segmented coral marker: distinct from a fault that has already happened. */
  private forecastMarker(): THREE.Group {
    const marker = new THREE.Group();
    for (let index = 0; index < 4; index++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(1.07, 0.037, 6, 24, Math.PI / 3),
        glow(0xf29a81, 0.9),
      );
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = index * Math.PI / 2 + Math.PI / 12;
      arc.material.toneMapped = false;
      arc.material.depthTest = false;
      arc.renderOrder = 3;
      marker.add(arc);
    }
    marker.visible = false;
    this.scene.add(marker);
    return marker;
  }

  // ================================================================ the far rail

  /** An art sheet, loaded once; a sheet that fails (not painted yet) is "missing". */
  private sheet(file: string) {
    let entry = this.sheets.get(file);
    if (entry) return entry;
    const created: { texture: THREE.Texture; status: "loading" | "ready" | "missing"; waiters: (() => void)[] } = {
      texture: null as unknown as THREE.Texture, status: "loading", waiters: [],
    };
    const settle = (status: "ready" | "missing") => {
      created.status = status;
      for (const waiter of created.waiters.splice(0)) waiter();
    };
    created.texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/${file}.png`, () => settle("ready"), undefined, () => {
      console.info(`Hostile sheet ${file}.png is not available yet; a stand-in body is shown.`);
      settle("missing");
    });
    created.texture.colorSpace = THREE.SRGBColorSpace;
    created.texture.anisotropy = 4;
    this.sheets.set(file, created);
    entry = created;
    return entry;
  }

  private buildPort(port: Port): PortVisual {
    const centre = port === "centre";
    const actor = new EnemyActor(centre ? 0 : 1);
    const group = new THREE.Group();
    group.position.copy(centre ? ENEMY_HOME : portHome(port, 7.14));
    group.add(actor.mesh);
    group.add(actor.embers);
    // A coloured spill across the far rail, and (the leader) a low glow that lifts the body from below.
    const light = new THREE.PointLight(0xe9a05c, centre ? 26 : 0, centre ? 13 : 10, 1.6);
    light.position.set(0, 0.2, centre ? 3.8 : 3.2);
    if (centre) group.add(light);
    let under: THREE.PointLight | null = null;
    if (centre) {
      under = new THREE.PointLight(0xe9a05c, 18, 8, 2);
      under.position.set(0, -1.6, 1.4);
      group.add(under);
    }
    group.visible = false;
    this.scene.add(group);
    const { sprite: plate, canvas: plateCanvas } = railPlateSprite();
    const [width, height] = centre ? PLATE_SIZE.leader : PLATE_SIZE.side;
    plate.scale.set(width, height, 1);
    plate.position.set(plateX(port), PLATE_FOOT + height / 2, PLATE_Z);
    plate.userData.port = port;
    plate.visible = false;
    // The target's reticle: brass corner brackets framing the plate, drawn over nearer hardware.
    const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), transparent: true, depthWrite: false, depthTest: false }));
    reticle.renderOrder = 41;
    reticle.scale.set(width * 1.13, height * 1.62, 1);
    reticle.position.set(plate.position.x, plate.position.y, PLATE_Z + 0.05);
    reticle.userData.base = reticle.scale.clone();
    reticle.visible = false;
    const highlight = new THREE.Sprite(new THREE.SpriteMaterial({ map: brassRingTexture(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    highlight.renderOrder = 39;
    highlight.scale.set(width * 1.28, height * 2.1, 1);
    highlight.position.copy(plate.position);
    highlight.visible = false;
    const hit = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 }));
    hit.visible = false;
    hit.userData.port = port;
    this.rail.add(plate, reticle, highlight, hit);
    // Escort lights live on the always-visible rail: the light count never changes when a pack
    // arrives, so no material has to recompile mid-fight.
    if (!centre) this.rail.add(light);
    return {
      port, group, actor, light, under, enemy: null, uid: null, art: "", texture: null, placeholder: false,
      size: centre ? 10.5 : 7.14, drop: 0, boss: false, hitAt: 0, dead: false, dying: false, ready: false,
      dimFrom: 0, dimUntil: 0, action: null, state: "idle",
      plate, plateCanvas, plateKey: "", reticle, highlight, hit, readout: null, shownHp: null,
    };
  }

  private portOf(port: Port | null | undefined): PortVisual | null {
    return port ? this.ports[PORT_ORDER.indexOf(port)] ?? null : null;
  }
  /** The port whose state the canvas reports and whose light sets the room: the centre hostile,
   * else the first standing one. */
  private leaderPort(): PortVisual {
    const standing = (visual: PortVisual) => !!visual.enemy && !visual.dead;
    return [this.ports[1], this.ports[0], this.ports[2]].find(visual => standing(visual) && visual.enemy!.hp > 0)
      ?? [this.ports[1], this.ports[0], this.ports[2]].find(standing) ?? this.ports[1];
  }

  /** Binds a port's sheet cell (a clone of the sheet texture, so ports never share an offset). */
  private bindArt(visual: PortVisual, enemy: Enemy, entering: boolean) {
    const uid = enemy.uid;
    const apply = () => {
      if (visual.uid !== uid || !this.active) return;
      let art = ENEMIES[enemy.id]?.art ?? STAND_IN_DEFAULT;
      let stand = false;
      if (this.sheet(art.file).status === "missing") {
        art = STAND_INS[enemy.id] ?? STAND_IN_DEFAULT;
        stand = true;
      }
      const entry = this.sheet(art.file);
      if (entry.status === "loading") { entry.waiters.push(apply); return; }
      const key = `${art.file}:${art.index}`;
      if (visual.art !== key) {
        visual.texture?.dispose();
        const texture = entry.texture.clone();
        texture.repeat.set(1 / art.columns, 1 / art.rows);
        texture.offset.set((art.index % art.columns) / art.columns, 1 - (Math.floor(art.index / art.columns) + 1) / art.rows);
        texture.needsUpdate = true;
        visual.texture = texture;
        visual.art = key;
        visual.actor.mesh.material.map = texture;
        visual.actor.mesh.material.needsUpdate = true;
      }
      visual.placeholder = stand;
      visual.actor.stand = stand ? 0.4 : 0;
      if (!visual.ready || entering) {
        visual.ready = true;
        visual.actor.enter(enemy.id, !!ENEMIES[enemy.id]?.boss);
      }
      visual.group.visible = this.showPort(visual);
      visual.plateKey = "";
      this.refreshRail();
    };
    visual.ready = false;
    visual.group.visible = false;
    apply();
  }
  private showPort(visual: PortVisual) {
    return !!visual.enemy && visual.ready && !visual.dead;
  }

  /** Hostile sizes: the leader keeps today's; escorts 0.68 ×, adds 0.6 × the leader's sprite. */
  private sizeOf(enemy: Enemy, leaderSize: number) {
    const definition = ENEMIES[enemy.id];
    if (enemy.role === "escort") return leaderSize * 0.68;
    if (enemy.role === "add") return leaderSize * 0.6;
    return definition?.boss ? 11.6 : enemy.id === "storm" || enemy.id === "moth" ? 10.9 : 10.5;
  }

  private syncRail(roster: readonly Enemy[], sameBattle: boolean) {
    this.enemies = roster.map(enemy => ({ ...enemy }));
    this.pack = roster.length > 1;
    const centre = roster.find(enemy => enemy.port === "centre" && (enemy.role === "leader" || enemy.role === "single"));
    const leaderSize = centre ? this.sizeOf(centre, 10.5) : 10.5;
    for (const visual of this.ports) {
      const here = roster.filter(enemy => enemy.port === visual.port);
      const enemy = here.find(item => item.hp > 0) ?? here[here.length - 1] ?? null;
      if (!enemy) {
        visual.enemy = null;
        visual.uid = null;
        visual.group.visible = false;
        visual.readout = null;
        visual.light.intensity = 0;
        continue;
      }
      const newcomer = visual.uid !== enemy.uid;
      visual.enemy = { ...enemy };
      visual.boss = !!ENEMIES[enemy.id]?.boss;
      visual.size = this.sizeOf(enemy, leaderSize);
      visual.light.color.setHex(enemy.color);
      visual.under?.color.setHex(enemy.color);
      if (enemy.hp <= 0 && !visual.dying) {
        visual.dead = true;
        visual.group.visible = false;
      }
      if (newcomer || !sameBattle) {
        const arriving = sameBattle && newcomer && enemy.hp > 0;
        visual.uid = enemy.uid;
        visual.dead = enemy.hp <= 0;
        visual.dying = false;
        visual.action = null;
        visual.shownHp = null;
        this.bindArt(visual, enemy, true);
        if (arriving) this.arrivalFlourish(visual);
      } else visual.group.visible = this.showPort(visual);
      this.frameEnemy(visual);
    }
    const leader = this.leaderPort();
    const lead = leader.enemy;
    if (lead) {
      this.scene.backgroundIntensity = leader.boss ? 0.48 : 0.6;
      for (const shaft of this.shafts) shaft.material.color.setHex(lead.color).lerp(new THREE.Color(0xffe3b0), 0.6);
      (this.scanMaterial.uniforms.uThreat.value as THREE.Color).setHex(lead.color).multiplyScalar(leader.boss ? 0.075 : 0.05);
    } else (this.scanMaterial.uniforms.uThreat.value as THREE.Color).setHex(0x000000);
    this.canvas.dataset.ports = this.ports.filter(visual => visual.enemy && visual.enemy.hp > 0).map(visual => visual.port).join(",");
    this.refreshRail();
  }

  /** A reinforcement or an add takes its port: a pulse on the rail and embers (reduced motion: the pulse). */
  private arrivalFlourish(visual: PortVisual) {
    if (!this.visible || !visual.enemy) return;
    const x = visual.port === "centre" ? 0 : plateX(visual.port);
    this.pulseAt(x, -5.4, visual.enemy.color, 2.2);
    this.burst(new THREE.Vector3(x, 1.2, -6), visual.enemy.color, 22, 3.2);
  }

  /** Rail plates and the target reticle (packs only: a single hostile is today's rail, untouched). */
  setRail(state: RailState) {
    this.railState = { focus: state.focus, selected: state.selected, readouts: { ...state.readouts } };
    for (const visual of this.ports) {
      visual.readout = state.readouts[visual.port] ?? null;
      visual.shownHp = null;
    }
    this.canvas.dataset.focus = state.focus ?? "";
    this.refreshRail();
  }
  /** A packet landed mid-playback: the plate shows the new health before the rules advance. */
  setPortHealth(port: Port, hp: number) {
    const visual = this.portOf(port);
    if (!visual) return;
    visual.shownHp = hp;
    this.refreshRail();
  }
  private refreshRail() {
    const standing = this.ports.filter(visual => visual.enemy && visual.enemy.hp > 0 && !visual.dead && !visual.dying).length;
    for (const visual of this.ports) {
      const enemy = visual.enemy;
      const show = this.pack && !!enemy && this.visible && (!visual.dead || visual.dying) && visual.ready;
      visual.plate.visible = show;
      // The reticle marks the target while there is a choice (two or more standing).
      visual.reticle.visible = show && standing > 1 && this.railState.focus === visual.port && enemy!.hp > 0 && !visual.dying;
      if (!show || !enemy) continue;
      const readout = visual.readout;
      const hp = visual.shownHp ?? enemy.hp;
      const midPlayback = visual.shownHp !== null;
      const data: RailPlateData = {
        name: enemy.name, color: enemy.color, hp, maxHp: enemy.maxHp,
        hpAfter: midPlayback ? hp : readout?.hpAfter ?? hp,
        damage: midPlayback ? 0 : readout?.damage ?? 0,
        overflowIn: midPlayback ? 0 : readout?.overflowIn ?? 0,
        lethal: !midPlayback && !!readout?.lethal,
        state: enemy.hp <= 0 || visual.dying ? "dead" : readout?.state ?? "acts",
        escalation: readout?.escalation ?? null,
        placeholder: visual.placeholder,
      };
      const key = JSON.stringify(data);
      if (key === visual.plateKey) continue;
      visual.plateKey = key;
      drawRailPlate(visual.plateCanvas, data);
      (visual.plate.material.map as THREE.CanvasTexture).needsUpdate = true;
      visual.plate.material.opacity = data.state === "dormant" ? 0.8 : data.state === "dead" ? 0.62 : 1;
    }
  }

  // ================================================================ devices and cables

  private isOnline(node: NetworkNode) {
    // A honeypot works offline: any cable makes it a live decoy.
    if (node.role === "honeypot") return this.isCabled(node);
    if (node.role === "rack" || node.role === "phantom") return true;
    return node.fixed || !this.online || this.online.has(node.id);
  }

  private isCabled(node: NetworkNode) {
    return this.topology.links.some((link) => link.a === node.id || link.b === node.id);
  }

  /** Condition pips for wearable hardware (a Phantom Node shows the absorptions it has left). */
  private pipsOf(node: NetworkNode): { filled: number; total: number; color?: string } | undefined {
    if (node.fixed) return undefined;
    if (node.role === "phantom") {
      const left = node.absorbs ?? 1;
      const total = Math.max(left, this.phantomMax.get(node.id) ?? left);
      this.phantomMax.set(node.id, total);
      return total > 0 && total <= 3 ? { filled: left, total, color: "#9ff5ea" } : undefined;
    }
    const total = maxConditionOf(node);
    if (total > 3 || total < 1) return undefined;
    return { filled: Math.max(0, Math.min(total, conditionOf(node))), total };
  }
  private isWorn(node: NetworkNode) {
    return !node.fixed && node.role !== "phantom" && maxConditionOf(node) <= 3 && conditionOf(node) < maxConditionOf(node);
  }

  private deviceLabel(node: NetworkNode): THREE.Sprite {
    const online = this.isOnline(node);
    const jammed = this.faultNodes.includes(node.id);
    const worn = this.isWorn(node);
    const status = jammed ? " · JAMMED"
      : !online && node.salvage ? " · SALVAGE"
      : node.role === "honeypot" ? online ? " · DECOY" : " · UNCABLED"
      : !online ? " · OFFLINE"
      : node.upgraded ? " · UPGRADED"
      : node.amplified ? " · AMPLIFIED"
      : node.stateful ? " · STATEFUL"
      : node.sentry ? " · SENTRY"
      : node.shielded ? " · GUARDED" : "";
    const color = jammed ? 0xff6880 : worn ? FRAYED_COLOR : !online ? node.salvage ? 0xc9874a : 0x7f898d : COLORS[node.role];
    const label = makeLabel(`${node.id.toUpperCase()}${status}`, color, { pips: this.pipsOf(node) });
    label.position.y = node.role === "client" ? 3.0 : node.role === "power" ? 3.05 : 2.86;
    if (!online) label.material.opacity = 0.78;
    return label;
  }

  private createDevice(node: NetworkNode): DeviceGroup {
    const group = newDeviceGroup(node);
    group.position.set(node.x, -0.42, node.z);
    const color = COLORS[node.role];
    const dark = mat(0x242c2f, color, 0.06);
    const trim = mat(0x776044, color, 0.08);
    const luminous = mat(
      new THREE.Color(color).multiplyScalar(0.4).getHex(),
      color,
      0.5,
    );
    // A Phantom Node floats bare: no plinth, skirt or aura (it is a decoy, not hardware).
    const phantom = node.role === "phantom";
    let skirt: THREE.Mesh | null = null;
    if (!phantom) {
      const base = cylinder(
        node.fixed ? 0.95 : 0.79,
        node.fixed ? 1.03 : 0.87,
        0.22,
        10,
        dark,
        0.75,
      );
      group.add(base);
      group.add(
        cylinder(
          node.fixed ? 0.76 : 0.65,
          node.fixed ? 0.8 : 0.68,
          0.08,
          10,
          trim,
          0.91,
        ),
      );
      skirt = ring(node.fixed ? 0.98 : 0.81, 0.028, color, 0.78, 0.8);
      group.add(skirt);
      group.userData.rings.push(skirt);
      const aura = new THREE.Mesh(
        new THREE.CylinderGeometry(0.91, 1.12, 0.7, 20, 1, true),
        glow(color, 0.06),
      );
      aura.position.y = 0.78;
      group.add(aura);
    }

    addRoleBody(group, node, { color, dark, trim, luminous });

    if (node.shielded) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.92, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xfedb9f,
          wireframe: true,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      shell.position.y = 1.3;
      group.add(shell);
      group.userData.floaters.push(shell);
    }
    if (node.upgraded) {
      const crown = ring(0.39, 0.035, 0xffd590, 2.19, 0.9);
      group.add(crown);
      group.userData.rings.push(crown);
    }
    if (node.amplified) {
      const amplifier = ring(0.72, 0.034, 0x8ce6ef, 2.05, 0.85);
      amplifier.rotation.x = Math.PI / 3;
      group.add(amplifier);
      group.userData.rings.push(amplifier);
    }
    if (node.salvage) addSalvageScrap(group);
    if (this.faultNodes.includes(node.id)) {
      const warning = ring(1.07, 0.055, 0xff526b, 0.68, 1);
      group.add(warning);
      const red = new THREE.PointLight(0xff4366, 9, 3, 2);
      red.position.y = 1.5;
      group.add(red);
    }
    // Remember every material's lit state so offline hardware can dim without a rebuild.
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments) || child === skirt) return;
      const material = child.material as THREE.Material;
      if (material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.MeshBasicMaterial)
        group.userData.tinted.push({
          material,
          color: material.color.clone(),
          emissive: material instanceof THREE.MeshPhysicalMaterial ? material.emissive.clone() : null,
          emissiveIntensity: material instanceof THREE.MeshPhysicalMaterial ? material.emissiveIntensity : 0,
          opacity: material.opacity,
        });
    });
    const label = this.deviceLabel(node);
    group.add(label);
    group.userData.label = label;
    group.userData.worn = this.isWorn(node);
    group.userData.nextSpark = 0;
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.94, 0.94, 1.85, 12),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    hit.position.y = 1.35;
    hit.userData.nodeId = node.id;
    group.add(hit);
    this.hitObjects.push(hit);
    this.applyOnline(group, node);
    return group;
  }

  /** Swaps every device for a fresh build in place, e.g. once the Blender models have loaded. */
  private rebuildDevices() {
    for (const [id, old] of this.devices) {
      const node = this.topology.nodes.find((candidate) => candidate.id === id);
      if (!node) continue;
      const next = this.createDevice(node);
      next.position.copy(old.position);
      const stale = this.hitObjects.findIndex((hit) => hit.parent === old);
      if (stale >= 0) this.hitObjects.splice(stale, 1);
      this.dynamic.remove(old);
      this.disposeObject(old);
      this.dynamic.add(next);
      this.devices.set(id, next);
    }
  }

  /** Offline hardware is desaturated and quiet; salvage stays weathered until it joins a route. */
  private applyOnline(group: DeviceGroup, node: NetworkNode) {
    const online = this.isOnline(node);
    const data = group.userData;
    const changed = data.online !== online;
    data.online = online;
    const gray = new THREE.Color();
    const rust = new THREE.Color(0x6b4a33);
    for (const entry of data.tinted) {
      const material = entry.material;
      if (online) {
        material.color.copy(entry.color);
        if (material instanceof THREE.MeshPhysicalMaterial && entry.emissive) {
          material.emissive.copy(entry.emissive);
          material.emissiveIntensity = entry.emissiveIntensity;
        }
        if (material.transparent || entry.opacity < 1) material.opacity = entry.opacity;
      } else {
        const luminance = entry.color.r * 0.3 + entry.color.g * 0.59 + entry.color.b * 0.11;
        gray.setRGB(luminance, luminance, luminance).multiplyScalar(0.62);
        material.color.copy(entry.color).lerp(node.salvage ? rust : gray, node.salvage ? 0.55 : 0.72);
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.emissiveIntensity = entry.emissiveIntensity * 0.12;
        } else {
          material.transparent = true;
          material.opacity = entry.opacity * 0.38;
        }
      }
    }
    for (const scrap of data.scrap) scrap.visible = !online;
    if (changed && data.label) {
      group.remove(data.label);
      this.disposeObject(data.label);
      data.label = this.deviceLabel(node);
      group.add(data.label);
    }
    this.refreshSkirt(group);
  }

  private refreshSkirt(group: DeviceGroup) {
    if (group.userData.role === "phantom") return;
    const skirt = group.userData.rings[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (!skirt) return;
    const id = group.userData.nodeId;
    const active = id === this.selected || id === this.linkSource;
    const channel = this.channelNodes.get(id);
    const color = channel === undefined || group.userData.role === "client"
      ? group.userData.worn ? FRAYED_COLOR : group.userData.skirtColor
      : channel === 0 ? CHANNEL_COLORS.primary : CHANNEL_COLORS.secondary;
    skirt.material.color.setHex(color);
    skirt.scale.setScalar(active ? 1.15 : 1);
    skirt.material.opacity = active ? 1 : group.userData.online ? channel === undefined ? 0.8 : 1 : 0.35;
  }

  private addCable(a: string, b: string) {
    const from = this.topology.nodes.find((node) => node.id === a);
    const to = this.topology.nodes.find((node) => node.id === b);
    if (!from || !to) return;
    const curve = cableCurve(from, to);
    const key = linkKey(a, b);
    const link = this.topology.links.find((edge) => linkKey(edge.a, edge.b) === key);
    const faulty = this.faultLinks.includes(key);
    const crossings = link && !link.armored && this.terrain ? wreckCrossings(from, to, this.terrain.debris) : [];
    const color = faulty ? 0xec755d : link?.boosted ? 0x8ce6ef : link?.armored ? 0xf5d196 : crossings.length ? FRAYED_COLOR : 0xe4c58f;
    const cable = new THREE.Group();
    const geometry = new THREE.TubeGeometry(curve, 48, 0.055, 8, false);
    const body = new THREE.Mesh(
      geometry,
      mat(faulty ? 0x733044 : 0x294c61, color, faulty ? 0.18 : 0.34),
    );
    cable.add(body);
    const filament = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.017, 6, false),
      glow(color, faulty ? 0.4 : 0.95),
    );
    cable.add(filament);
    const haze = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.145, 6, false),
      glow(color, faulty ? 0.075 : 0.055),
    );
    cable.add(haze);
    if (link?.armored) {
      for (let index = 1; index < 12; index++) {
        const collar = new THREE.Mesh(
          new THREE.SphereGeometry(0.092, 6, 4),
          mat(0x9c8054, 0x695431, 0.16),
        );
        collar.position.copy(curve.getPoint(index / 12));
        cable.add(collar);
      }
    }
    for (const t of crossings) cable.add(this.frayMark(curve, t, true));
    const hit = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.17, 5, false),
      glow(0x000000, 0),
    );
    hit.userData.linkKey = key;
    hit.material.depthWrite = false;
    cable.add(hit);
    this.hitObjects.push(hit);
    for (let i = 0; i < 3; i++) {
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        glow(color, faulty ? 0.12 : 0.8),
      );
      bead.position.copy(curve.getPoint(i / 3));
      cable.add(bead);
      this.cableBeads.push({ bead, curve, key, offset: i / 3, active: !faulty, reversed: false, routed: false });
    }
    this.cableCurves.set(key, curve);
    this.cableVisuals.set(key, { body: body.material, filament: filament.material, haze: haze.material, color, faulty, source: a });
    this.cableGroups.set(key, cable);
    this.dynamic.add(cable);
  }

  /** Split sheath over a wreck: splayed strands around a live ember. */
  private frayMark(curve: THREE.Curve<THREE.Vector3>, t: number, flicker: boolean) {
    const mark = new THREE.Group();
    mark.position.copy(curve.getPoint(t));
    const phase = t * 17 + mark.position.x;
    const ember = glow(0xffa05a, 0.95);
    ember.transparent = true;
    mark.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), ember));
    const halo = glow(0xff7a3a, 0.24);
    mark.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), halo));
    if (flicker) this.frayEmbers.push({ material: ember, phase, base: 0.95 }, { material: halo, phase, base: 0.24 });
    const tangent = curve.getTangent(t);
    const strand = glow(0xffc88a, 0.9);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + t * 5;
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.8 + 0.25, Math.sin(angle * 1.7))
        .addScaledVector(tangent, i % 2 ? 0.7 : -0.7).normalize();
      const length = 0.22 + (i % 3) * 0.07;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.017, length, 4), strand);
      wire.position.copy(direction).multiplyScalar(length / 2);
      wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      mark.add(wire);
    }
    return mark;
  }

  private disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Points || child instanceof THREE.Line) {
        // Sprite geometry is shared internally by Three.js (its material is owned here);
        // device models share their geometry across every instance.
        if (!(child instanceof THREE.Sprite) && !child.geometry.userData.shared) geometries.add(child.geometry);
        const childMaterials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of childMaterials) {
          // Shared decal textures (scorch, infection) outlive any single prop.
          if ("map" in material && material.map instanceof THREE.Texture && !material.map.userData.shared)
            textures.add(material.map);
          materials.add(material);
        }
      }
      if (child instanceof THREE.DirectionalLight || child instanceof THREE.PointLight || child instanceof THREE.SpotLight)
        child.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  /** CSS and WebGL use the same stage interior, including when resuming a save. */
  setStage(stage: number) {
    const path = (STAGES[stage] ?? STAGES[0]).art.battle;
    if (path === this.backdropPath) return;
    let backdrop = this.stageBackdrops.get(path);
    if (!backdrop) {
      backdrop = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/${path}`);
      backdrop.colorSpace = THREE.SRGBColorSpace;
      this.stageBackdrops.set(path, backdrop);
    }
    this.backdropPath = path;
    this.scene.background = backdrop;
    this.canvas.dataset.backdrop = path;
  }

  /**
   * The table and the rail. `enemies` is every hostile of the encounter in port order (the fallen
   * included until a newcomer takes their port); faults are every jammed node and cut cable.
   * Legacy single-hostile calls (a drag preview passing only the leader) keep the current rail.
   */
  setBattle(
    topology: Topology,
    enemies: readonly Enemy[] | Enemy | null,
    faultNodes: readonly string[] | string | null = [],
    faultLinks: readonly string[] | string | null = [],
  ) {
    const single = enemies !== null && "uid" in enemies ? enemies as Enemy : null;
    const list: readonly Enemy[] = enemies === null ? [] : single ? [single] : enemies as readonly Enemy[];
    const keepRail = !!single && this.enemies.length > 1 && this.enemies.some(enemy => enemy.uid === single.uid);
    const roster = keepRail ? this.enemies : list;
    const first = roster.find(enemy => enemy.uid === "h1") ?? roster[0];
    const identity = first ? `${first.id}:${first.maxHp}` : null;
    const sameBattle = this.battleIdentity === identity && identity !== null;
    const previousFaults = new Set(this.faultNodes);
    if (!sameBattle) {
      this.deviceStates.clear();
      this.online = null;
      this.pipMax.clear();
      this.phantomMax.clear();
    }
    this.battleIdentity = identity;
    this.topology = topology;
    this.faultNodes = faultNodes === null ? [] : typeof faultNodes === "string" ? [faultNodes] : [...faultNodes];
    this.faultLinks = faultLinks === null ? [] : typeof faultLinks === "string" ? [faultLinks] : [...faultLinks];
    this.rebuildTable(sameBattle, previousFaults);
    if (!keepRail) this.syncRail(roster, sameBattle);
    this.refreshSelection();
    this.refreshSignalRoute();
    this.refreshForecastTargets();
    this.refreshDeliveries(true);
  }

  private rebuildTable(sameBattle: boolean, previousFaults: Set<string>) {
    const topology = this.topology;
    for (const item of [...this.dynamic.children]) {
      this.dynamic.remove(item);
      this.disposeObject(item);
    }
    this.hitObjects.length = 0;
    this.devices.clear();
    this.cableCurves.clear();
    this.cableVisuals.clear();
    this.cableGroups.clear();
    this.cableBeads.length = 0;
    this.frayEmbers.length = 0;
    this.showLinkGhost(null);
    for (const link of topology.links) this.addCable(link.a, link.b);
    for (const node of topology.nodes) {
      const group = this.createDevice(node);
      this.devices.set(node.id, group);
      this.dynamic.add(group);
      const state = `${Boolean(node.shielded)}:${Boolean(node.upgraded)}:${Boolean(node.amplified)}:${conditionOf(node)}`;
      const previous = this.deviceStates.get(node.id);
      if (sameBattle && previous === undefined && !node.fixed)
        this.pulseAt(node.x, node.z, COLORS[node.role]);
      else if (sameBattle && previous !== undefined && previous !== state) {
        const [, , , condition] = previous.split(":");
        const repaired = conditionOf(node) > Number(condition);
        this.pulseAt(node.x, node.z, repaired ? REPAIR_COLOR : node.upgraded ? 0xffd590 : 0x8ce6ef);
      }
      if (sameBattle && this.faultNodes.includes(node.id) && !previousFaults.has(node.id))
        this.pulseAt(node.x, node.z, 0xff7869);
      this.deviceStates.set(node.id, state);
    }
    for (const id of this.deviceStates.keys())
      if (!topology.nodes.some((node) => node.id === id)) this.deviceStates.delete(id);
  }

  /** A drag preview: the table with one device moved; the rail and the front are untouched. */
  previewTopology(topology: Topology) {
    this.topology = topology;
    this.rebuildTable(true, new Set(this.faultNodes));
    this.refreshSelection();
    this.refreshSignalRoute();
    this.refreshForecastTargets();
    this.refreshDeliveries(true);
  }

  /** Emphasizes the forecast's chosen routes without rebuilding cable geometry. */
  setSignalRoute(path: string[], alternate: string[] = []) {
    this.setChannels([path, alternate].filter((route) => route.length > 1));
  }

  /** Every live channel: paths[0] is the primary (gold) route, the rest are cyan. */
  setChannels(paths: string[][]) {
    const signature = JSON.stringify(paths);
    if (signature === this.routeSignature) return;
    this.routeSignature = signature;
    this.channelPaths = paths.map((path) => [...path]);
    this.channelSources.clear();
    this.channelNodes.clear();
    paths.forEach((path, channel) => {
      for (let index = 0; index < path.length - 1; index++) {
        const key = linkKey(path[index], path[index + 1]);
        if (!this.channelSources.has(key)) this.channelSources.set(key, { source: path[index], channel });
      }
      for (const id of path.slice(1, -1))
        if (!this.channelNodes.has(id)) this.channelNodes.set(id, channel);
    });
    this.refreshSignalRoute();
  }

  private refreshSignalRoute() {
    const hasRoute = this.channelSources.size > 0;
    for (const [key, visual] of this.cableVisuals) {
      const route = this.channelSources.get(key);
      const primary = route?.channel === 0;
      const secondary = route !== undefined && !primary;
      const color = visual.faulty ? 0xec755d : primary ? CHANNEL_COLORS.primary : secondary ? CHANNEL_COLORS.secondary : visual.color;
      visual.body.emissive.setHex(color);
      visual.body.emissiveIntensity = visual.faulty ? 0.18 : primary ? 0.85 : secondary ? 0.6 : hasRoute ? 0.15 : 0.34;
      visual.filament.color.setHex(color);
      visual.filament.opacity = visual.faulty ? 0.4 : primary ? 1 : secondary ? 0.92 : hasRoute ? 0.38 : 0.95;
      visual.haze.color.setHex(color);
      visual.haze.opacity = visual.faulty ? 0.075 : primary ? 0.16 : secondary ? 0.1 : hasRoute ? 0.025 : 0.055;
    }
    for (const item of this.cableBeads) {
      const visual = this.cableVisuals.get(item.key)!;
      const route = this.channelSources.get(item.key);
      item.routed = route !== undefined;
      item.reversed = route !== undefined && route.source !== visual.source;
      item.bead.material.color.copy(visual.filament.color);
      item.bead.material.opacity = visual.faulty ? 0.12 : item.routed ? 0.95 : hasRoute ? 0.25 : 0.8;
    }
    for (const group of this.devices.values()) this.refreshSkirt(group);
  }

  /** Devices on at least one live route. Terminals are always lit. `null` restores "all online". */
  setOnline(ids: string[] | null) {
    const next = ids ? new Set(ids) : null;
    const previous = this.online;
    const same = previous === next || (!!previous && !!next && previous.size === next.size && [...next].every((id) => previous.has(id)));
    if (same) return;
    this.online = next;
    for (const node of this.topology.nodes) {
      const group = this.devices.get(node.id);
      if (!group) continue;
      const wasOnline = group.userData.online;
      this.applyOnline(group, node);
      // Coming online is a small event: the device lights up with a gold ring.
      if (!wasOnline && group.userData.online && previous) this.pulseAt(node.x, node.z, CHANNEL_COLORS.primary, 1.1);
    }
  }

  /** Wreckage in blocked sockets. Rebuilt only when the layout changes. Call it
   * before setBattle: cables read the wreckage to know whether they fray. */
  setTerrain(terrain: Terrain | null) {
    const signature = JSON.stringify(terrain?.debris ?? null);
    this.terrain = terrain;
    // Tests read the table through these attributes instead of the scene graph.
    this.canvas.dataset.wrecks = String(terrain?.debris.length ?? 0);
    if (signature === this.terrainSignature) return;
    this.terrainSignature = signature;
    for (const item of [...this.terrainGroup.children]) {
      this.terrainGroup.remove(item);
      this.disposeObject(item);
    }
    terrain?.debris.forEach((spot, index) => this.terrainGroup.add(buildDebris(spot.x, spot.z, index + 1 + Math.round(spot.x * 7 + spot.z * 13),
      spot.fresh ? { color: spot.role ? COLORS[spot.role] : null } : undefined)));
  }

  // ================================================================ the table front

  /** Planted installations (integrity pips, countdowns, blast rings) and the forecast ghosts of the
   * next plantings. A v3 caller may pass the single malware socket ({x, z}) as the forecast. */
  setInstallations(list: readonly Installation[], forecast: TableForecast | WorldPoint | null = null) {
    const previous = new Set(this.installations.keys());
    this.installationList = list.map(item => ({ ...item }));
    const live = new Set(list.map(item => item.id));
    for (const [id, group] of this.installations) {
      if (live.has(id)) continue;
      this.installations.delete(id);
      this.frontGroup.remove(group);
      this.dissolve(group, 0.6);
    }
    for (const item of list) {
      this.installationSpots.set(item.id, { x: item.x, z: item.z });
      const pips = Math.min(3, Math.max(item.integrity, this.pipMax.get(item.id) ?? 0, this.basePips(item.kind)));
      this.pipMax.set(item.id, pips);
      const existing = this.installations.get(item.id);
      if (existing) {
        const before = existing.userData.installation.countdown;
        refreshInstallation(existing, item, pips, object => this.disposeObject(object));
        if (before !== null && item.countdown !== undefined && item.countdown !== before && !this.reducedMotion())
          this.pulseAt(item.x, item.z, BLAST_COLOR, 1.2);
        continue;
      }
      const group = buildInstallation(item, pips);
      this.frontGroup.add(group);
      this.installations.set(item.id, group);
      if (this.visible && this.battleIdentity && !previous.has(item.id)) {
        const color = item.kind === "tap" ? MALWARE_COLOR : INSTALLATION_COLORS[item.kind];
        this.pulseAt(item.x, item.z, color, 1.6);
        this.burst(new THREE.Vector3(item.x, 1, item.z), color, 14, 3);
      }
    }
    this.frontLights.forEach((light, index) => {
      const item = list[index];
      light.intensity = item ? 7 : 0;
      if (item) {
        light.color.setHex(item.kind === "tap" ? MALWARE_COLOR : INSTALLATION_COLORS[item.kind]);
        light.position.set(item.x, 0.9, item.z);
      }
    });
    const sockets = !forecast ? [] : "installs" in forecast
      ? forecast.installs.filter(item => !item.boosts && !item.absorbed && !item.destroyed).map(({ kind, x, z }) => ({ kind, x, z }))
      : [{ kind: "tap" as InstallationKind, x: forecast.x, z: forecast.z }];
    const signature = JSON.stringify(sockets);
    if (signature !== this.ghostSignature) {
      this.ghostSignature = signature;
      this.ghostSockets = sockets;
      for (const item of [...this.ghostGroup.children]) {
        this.ghostGroup.remove(item);
        this.disposeObject(item);
      }
      for (const socket of sockets) this.ghostGroup.add(buildInstallationGhost(socket.kind, socket.x, socket.z));
    }
    this.refreshTethers();
    this.refreshInstallationFocus();
    this.declutterTags();
    this.canvas.dataset.installations = String(list.length);
    this.canvas.dataset.ghosts = String(this.ghostSockets.length);
  }
  /** A tag that lands on a device nameplate slides sideways, away from it, until both read (at most
   * 1.6 units, so it stays over its own body). Screen space from the resting camera. */
  private declutterTags() {
    if (!this.installations.size || !this.devices.size) return;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const centre = new THREE.Vector3(), scale = new THREE.Vector3();
    // The iron plate fills 91 % of a label canvas's width and 61 % of its height.
    const rect = (label: THREE.Sprite) => {
      label.updateWorldMatrix(true, false);
      label.getWorldPosition(centre);
      label.getWorldScale(scale);
      const a = centre.clone().addScaledVector(right, -scale.x * .455).addScaledVector(up, scale.y * .305).project(this.camera);
      const b = centre.clone().addScaledVector(right, scale.x * .455).addScaledVector(up, -scale.y * .305).project(this.camera);
      return { l: a.x, r: b.x, t: a.y, b: b.y, width: scale.x * .91 };
    };
    const plates = [...this.devices.values()].map(group => group.userData.label as THREE.Sprite | undefined).filter((label): label is THREE.Sprite => !!label).map(rect);
    const gap = 0.012;
    for (const group of this.installations.values()) {
      const label = group.userData.installation.label;
      label.position.x = 0;
      for (let pass = 0; pass < 3; pass++) {
        const own = rect(label);
        const hit = plates.find(other => own.l < other.r && own.r > other.l && own.b < other.t && own.t > other.b);
        if (!hit) break;
        const push = (own.l + own.r) / 2 >= (hit.l + hit.r) / 2 ? hit.r - own.l + gap : hit.l - own.r - gap;
        const next = label.position.x + push * own.width / Math.max(1e-4, own.r - own.l);
        if (Math.abs(next) > 1.6) break;
        label.position.x = next;
      }
    }
  }
  /** v3 name, kept for callers that have not moved yet. */
  setMalware(list: readonly Installation[], forecast: WorldPoint | null) {
    this.setInstallations(list, forecast);
  }
  private basePips(kind: InstallationKind) {
    return ({ tap: 1, jammer: 2, spike: 2, anchor: 3, breaker: 1 } as Record<InstallationKind, number>)[kind];
  }
  /** Rebuilds every body once the Blender installations land. */
  private rebuildInstallations() {
    for (const [id, group] of this.installations) {
      this.frontGroup.remove(group);
      this.disposeObject(group);
      this.installations.delete(id);
    }
    const list = this.installationList;
    this.installationList = [];
    const ghosts = this.ghostSockets;
    this.ghostSignature = "";
    const identity = this.battleIdentity;
    this.battleIdentity = null;
    this.setInstallations(list, { installs: ghosts });
    this.battleIdentity = identity;
  }
  /** The installation whose plate is open (its reach ring), and Demolition Charge targeting. */
  setInstallationFocus(selected: string | null, targeting: boolean) {
    this.selectedInstallation = selected;
    this.targetingInstallations = targeting;
    this.refreshInstallationFocus();
  }
  private refreshInstallationFocus() {
    const item = this.installationList.find(entry => entry.id === this.selectedInstallation);
    this.selectRing.visible = !!item;
    this.canvas.dataset.selectedInstallation = item?.id ?? "";
    if (item) {
      this.selectRing.position.set(item.x, 0.25, item.z);
      this.tintRing(this.selectRing, MALWARE_COLOR);
    }
    for (const group of this.installations.values()) {
      const data = group.userData.installation;
      const lit = this.targetingInstallations || data.id === this.selectedInstallation;
      data.pulse.scale.setScalar(lit ? 1.25 : 1);
      data.pulse.material.color.setHex(this.targetingInstallations ? BLAST_COLOR : data.kind === "tap" ? MALWARE_COLOR : INSTALLATION_COLORS[data.kind]);
    }
  }
  private tintRing(reach: THREE.Group, color: number) {
    reach.traverse(child => {
      if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).color.setHex(color);
    });
  }
  /** Anchors pin their band's hostile field: a violet tether from the lantern to the band's inscription. */
  private tetherSignature = "";
  private refreshTethers() {
    const signature = JSON.stringify(this.installationList.filter(item => item.kind === "anchor").map(item => [item.x, item.z]));
    if (signature === this.tetherSignature) return;
    this.tetherSignature = signature;
    for (const item of [...this.tethers.children]) {
      this.tethers.remove(item);
      this.disposeObject(item);
    }
    for (const item of this.installationList) {
      if (item.kind !== "anchor") continue;
      const from = new THREE.Vector3(item.x, 1.35, item.z);
      const to = new THREE.Vector3(-7.22, 0.3, ZONE_Z[ZONE_OF(item.z)]);
      const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(1.9), to);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.018, 5, false), glow(INSTALLATION_COLORS.anchor, 0.45));
      tube.renderOrder = 3;
      this.tethers.add(tube);
    }
  }

  /** Static segmented coral markers on every forecast disruption target (a device or a cable). */
  setForecastTarget(target: string | readonly string[] | null) {
    const list = target === null ? [] : typeof target === "string" ? [target] : [...new Set(target)];
    if (JSON.stringify(list) === JSON.stringify(this.forecastTargets)) return;
    this.forecastTargets = list;
    this.refreshForecastTargets();
  }

  /** Marks the announced storm band without motion or geometry replacement. */
  setForecastZone(zone: BoardZone | null) {
    this.forecastZone = zone;
    this.refreshZones();
  }
  setZoneEffects(effects: ZoneEffect[]) {
    this.zoneEffects = effects;
    this.refreshZones();
  }
  setZonePreview(zone: BoardZone | null, blocked = false) {
    this.previewZone = zone;
    this.previewZoneBlocked = blocked;
    this.refreshZones();
  }
  setZoneTargeting(enabled: boolean) {
    this.targetingZone = enabled;
    if (!enabled) this.setZonePreview(null);
  }
  pulseZone(zone: BoardZone, kind: "field" | "cleanse" | "corrupt" | "move") {
    const color = { field: 0xe5c581, cleanse: 0xb9ffdf, corrupt: 0xd97780, move: 0x8bd5c5 }[kind];
    const z = { north: -3, center: 0, south: 3 }[zone];
    for (const x of [-5, 0, 5]) this.pulseAt(x, z, color, 2.2);
  }
  private refreshZones() {
    const colors = { resonance: 0xddb46b, aegis: 0x65c8b4, stasis: 0xab98df, corrosion: 0xd96755, suppression: 0xa77cdb };
    for (const [id, visual] of this.zoneVisuals) {
      const danger = id === this.forecastZone;
      const fields = this.zoneEffects.filter(effect=>effect.zone === id);
      const field = fields.find(effect=>effect.kind === "corrosion" || effect.kind === "suppression") ?? fields[0];
      const preview = id === this.previewZone;
      const color = preview ? this.previewZoneBlocked ? 0xe66455 : 0x9edde0 : field ? colors[field.kind] : danger ? 0xc35e4d : visual.color;
      visual.fill.color.setHex(color);
      visual.fill.opacity = preview ? 0.28 : field ? 0.18 : danger ? 0.14 : 0.045;
      visual.label.color.setHex(color);
      visual.label.opacity = preview || danger || field ? 1 : 0.72;
      visual.warning.visible = danger;
    }
  }

  private refreshForecastTargets() {
    const spots: { position: THREE.Vector3; scale: number }[] = [];
    if (this.enemies.length)
      for (const target of this.forecastTargets) {
        const device = this.topology.nodes.find((node) => node.id === target);
        const cable = this.cableCurves.get(target);
        if (device) spots.push({ position: new THREE.Vector3(device.x, 0.3, device.z), scale: 1 });
        else if (cable) spots.push({ position: cable.getPoint(0.5).add(new THREE.Vector3(0, 0.12, 0)), scale: 0.5 });
      }
    while (this.forecastMarkers.length < spots.length) this.forecastMarkers.push(this.forecastMarker());
    this.forecastMarkers.forEach((marker, index) => {
      const spot = spots[index];
      marker.visible = !!spot;
      if (!spot) return;
      marker.position.copy(spot.position);
      marker.scale.setScalar(spot.scale);
    });
  }

  private reducedMotion() {
    return document.documentElement.classList.contains("reduced-motion") ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  private pulseAt(x: number, z: number, color: number, scale = 1, delay = 0, geometry?: THREE.BufferGeometry) {
    const mesh = new THREE.Mesh(
      geometry ?? new THREE.TorusGeometry(0.7, 0.027, 6, 56),
      glow(color, 0.8),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.3, z);
    mesh.visible = delay <= 0;
    this.scene.add(mesh);
    const duration = this.reducedMotion() ? 0.2 : 0.85;
    this.pulses.push({ mesh, life: duration, duration, scale, delay: this.reducedMotion() ? 0 : delay });
  }

  /** Sparks thrown from a point; the shared language for impacts, traps and scrubs. */
  private burst(origin: THREE.Vector3, color: number, count: number, speed: number) {
    if (this.reducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.035 + Math.random() * 0.065),
        glow(color),
      );
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * speed * 2,
        Math.random() * speed * 1.2 + speed * 0.3,
        (Math.random() - 0.5) * speed * 2,
      );
      this.sparks.push({ mesh, velocity, life: 0.45 + Math.random() * 0.45 });
    }
  }

  private shakeCamera(power: number, milliseconds: number) {
    if (this.reducedMotion()) return;
    const now = performance.now();
    if (now + milliseconds > this.shake.until || power > this.shake.power)
      this.shake = { until: now + milliseconds, power: Math.max(power, now < this.shake.until ? this.shake.power : 0), duration: milliseconds };
  }

  /** A glowing beam between two points that fades (quarantine, jam, the Spike's wear). */
  private beam(from: THREE.Vector3, to: THREE.Vector3, color: number, duration = 560, width = 0.075) {
    const group = new THREE.Group();
    const length = from.distanceTo(to);
    const core = glow(0xffffff, 0.95);
    core.transparent = true;
    const halo = glow(color, 0.45);
    halo.blending = THREE.AdditiveBlending;
    halo.toneMapped = false;
    const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.4, width * 0.4, length, 6, 1, true), core);
    const haloMesh = new THREE.Mesh(new THREE.CylinderGeometry(width * 2.4, width * 2.4, length, 8, 1, true), halo);
    group.add(coreMesh, haloMesh);
    group.position.copy(from).lerp(to, 0.5);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    group.renderOrder = 4;
    this.scene.add(group);
    this.beams.push({ mesh: group, materials: [core, halo], start: performance.now(), duration: this.reducedMotion() ? 260 : duration });
  }

  /** Fades an object out as it lifts, then disposes it (scrub dissolve, phantom fade). */
  private dissolve(object: THREE.Object3D, seconds: number, rise = 0.5) {
    const materials: Fading["materials"] = [];
    const seen = new Set<THREE.Material>();
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Points)) return;
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (seen.has(material)) continue;
        seen.add(material);
        material.transparent = true;
        materials.push({ material, opacity: material.opacity });
      }
    });
    if (!object.parent) this.scene.add(object);
    this.fading.push({ object, materials, start: performance.now(), duration: (this.reducedMotion() ? 0.2 : seconds) * 1000, rise, baseY: object.position.y });
  }

  pulseNetwork(effect: "shield" | "repair" | "surge") {
    const color = effect === "shield" ? 0xffd590 : effect === "repair" ? 0x83eec7 : 0x8ce6ef;
    for (const node of this.topology.nodes) this.pulseAt(node.x, node.z, color);
  }

  /**
   * Local event on one device (or an installation id for "scrub"):
   * - trap: a honeypot absorbed a disruption; an amber bolt strikes the hostile (at `port`).
   * - trigger: an armed protocol fired from this device.
   * - scrub: an installation loses a point (it dissolves when the last goes).
   * - repair: a condition point is restored.
   */
  pulseNode(id: string, kind: "trap" | "trigger" | "scrub" | "repair", port?: Port) {
    const node = this.topology.nodes.find((item) => item.id === id);
    const spot = node ? { x: node.x, z: node.z } : this.installationSpots.get(id);
    if (!spot) return;
    const color = { trap: 0xffa640, trigger: 0x9ff3ff, scrub: 0xb8ffd9, repair: REPAIR_COLOR }[kind];
    const origin = new THREE.Vector3(spot.x, 1.3, spot.z);
    if (kind === "trigger") {
      // A hexagonal protocol seal expands twice.
      this.pulseAt(spot.x, spot.z, color, 1.2, 0, new THREE.TorusGeometry(0.8, 0.035, 4, 6));
      this.pulseAt(spot.x, spot.z, 0xffffff, 1.6, 0.12, new THREE.TorusGeometry(0.8, 0.02, 4, 6));
      this.burst(origin, color, 10, 2.4);
    } else if (kind === "scrub") {
      this.pulseAt(spot.x, spot.z, color, 1.4);
      this.pulseAt(spot.x, spot.z, MALWARE_COLOR, 0.9, 0.1);
      this.burst(origin, color, 20, 3.2);
      this.burst(origin, MALWARE_COLOR, 10, 2.2);
    } else if (kind === "repair") {
      // Ratchet and settle: two tight rings and a few warm motes.
      this.pulseAt(spot.x, spot.z, color, 1.1);
      this.pulseAt(spot.x, spot.z, 0xe7fff4, 0.8, 0.14);
      this.burst(origin, color, 8, 1.6);
    } else {
      this.pulseAt(spot.x, spot.z, color, 1.6);
      this.pulseAt(spot.x, spot.z, 0xffe0a0, 1.1, 0.14);
      this.burst(origin, color, 16, 3);
      const target = this.portOf(port) ?? this.leaderPort();
      this.launchBolt(origin, color, () => this.impact(color, 16, target.port), target);
    }
  }

  /** An arcing projectile from the table into a hostile's body. */
  private launchBolt(from: THREE.Vector3, color: number, done: () => void, visual: PortVisual = this.leaderPort()) {
    if (this.reducedMotion() || !visual.enemy) { done(); return; }
    const to = visual.group.position.clone().add(new THREE.Vector3(0, visual.size * 0.08, 0));
    const middle = from.clone().lerp(to, 0.5);
    middle.y += 4.5;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glow(0xfff1d0)));
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), glow(color, 0.3)));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.bolts.push({ mesh, curve: new THREE.QuadraticBezierCurve3(from, middle, to), start: performance.now(), duration: 520, done });
  }

  // ================================================================ deliveries

  /** Packet glyphs parked at each channel's OMEGA end with a faint dashed line to their port's rail
   * plate (packs with two or more standing hostiles; otherwise every delivery goes to the one). */
  setDeliveries(list: readonly DeliveryView[], selected: string | null = null) {
    this.deliveries = list.map(item => ({ ...item, path: [...item.path] }));
    this.selectedDelivery = selected;
    this.refreshDeliveries(false);
  }
  private refreshDeliveries(force: boolean) {
    const standing = this.ports.filter(visual => visual.enemy && visual.enemy.hp > 0).length;
    const show = this.pack && standing > 1;
    const signature = JSON.stringify([show, this.deliveries, this.selectedDelivery, this.routeSignature]);
    if (!force && signature === this.deliverySignature) return;
    this.deliverySignature = signature;
    for (const glyph of this.glyphs) {
      this.deliveryGroup.remove(glyph.glyph, glyph.line);
      glyph.line.geometry.dispose();
      glyph.line.material.dispose();
      glyph.glyph.material.dispose();
      if (glyph.halo) { this.deliveryGroup.remove(glyph.halo); glyph.halo.material.dispose(); }
    }
    this.glyphs.length = 0;
    this.canvas.dataset.deliveries = show ? String(this.deliveries.length) : "0";
    this.canvas.dataset.armed = show && this.selectedDelivery && this.deliveries.some(view => view.key === this.selectedDelivery) ? this.selectedDelivery : "";
    if (!this.canvas.dataset.armed) this.showTether(null);
    if (!show) return;
    const lastSpan = new Map<string, number>();
    this.deliveries.forEach((view, index) => {
      const path = view.path;
      if (path.length < 2) return;
      const key = linkKey(path[path.length - 2], path[path.length - 1]);
      const curve = this.cableCurves.get(key);
      const end = this.topology.nodes.find(node => node.id === path[path.length - 1]);
      const before = this.topology.nodes.find(node => node.id === path[path.length - 2]);
      if (!curve || !end || !before) return;
      // Several channels may share the last span: fan their glyphs out along it.
      const shared = lastSpan.get(key) ?? 0;
      lastSpan.set(key, shared + 1);
      // The curve runs from the link's first device; the glyph sits toward OMEGA's end of the span.
      const startsAtEnd = Math.hypot(end.x - curve.getPoint(0).x, end.z - curve.getPoint(0).z) < 0.01;
      const t = Math.max(0.3, 0.6 - shared * 0.18);
      const base = curve.getPoint(startsAtEnd ? 1 - t : t).add(new THREE.Vector3(0, 0.42, 0));
      const plate = this.portOf(view.port)!.plate.position;
      const toward = new THREE.Vector3(plate.x - base.x, 0, plate.z - base.z).normalize();
      // Channel i wears colour i of the shared palette, as its delivery row in the HUD does.
      const color = channelColor(index);
      const selectedGlyph = view.key === this.selectedDelivery;
      const glyph = new THREE.Sprite(new THREE.SpriteMaterial({
        map: packetTexture(view.primary), color, transparent: true, depthWrite: false, toneMapped: false,
      }));
      glyph.scale.setScalar(selectedGlyph ? 1.4 : 0.98);
      glyph.position.copy(base);
      // Over the table's labels and the rail plates it drifts toward (still hidden by nearer hardware).
      glyph.renderOrder = TABLE_LABEL_ORDER + 3;
      glyph.userData.deliveryKey = view.key;
      // The selected delivery: a lit ring in its channel colour around the glyph.
      let halo: THREE.Sprite | null = null;
      if (selectedGlyph) {
        halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending }));
        halo.renderOrder = TABLE_LABEL_ORDER + 2;
        halo.scale.setScalar(1.9);
        halo.position.copy(base);
        this.deliveryGroup.add(halo);
      }
      const line = this.aimLine(base, new THREE.Vector3(plate.x, plate.y - 0.35, plate.z + 0.05), color, selectedGlyph ? 0.95 : view.aimed ? 0.7 : 0.5);
      this.deliveryGroup.add(glyph, line);
      this.glyphs.push({ view, glyph, halo, line, base, toward, phase: index * 1.7 });
    });
  }
  /** A faint dashed arc from a packet glyph up to its port's rail plate (one draw call). */
  private aimLine(from: THREE.Vector3, to: THREE.Vector3, color: number, opacity: number) {
    const middle = from.clone().lerp(to, 0.5);
    middle.y += 1.6 + from.distanceTo(to) * 0.08;
    const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
    const dashes: THREE.BufferGeometry[] = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = i / count, b = a + 0.55 / count;
      const piece = new THREE.CatmullRomCurve3([curve.getPoint(a), curve.getPoint((a + b) / 2), curve.getPoint(b)]);
      dashes.push(new THREE.TubeGeometry(piece, 3, 0.04, 5, false));
    }
    const geometry = mergeGeometries(dashes)!;
    for (const dash of dashes) dash.dispose();
    const material = glow(color, opacity);
    material.transparent = true;
    material.depthWrite = false;
    material.toneMapped = false;
    material.blending = THREE.AdditiveBlending;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 11;
    return mesh;
  }

  // ================================================================ input

  setPlacement(role: Role | null, linkSource: string | null = null, linkArmored = false) {
    if (linkSource !== this.linkSource || linkArmored !== this.linkArmored) this.showLinkGhost(null);
    this.placementRole = role;
    this.linkSource = linkSource;
    this.linkArmored = linkArmored;
    this.placement.visible = false;
    this.refreshSelection();
    this.canvas.dataset.cursor = role || linkSource ? "target" : "grab";
  }
  setSelected(id: string | null) {
    this.selected = id;
    this.refreshSelection();
  }
  private refreshSelection() {
    for (const group of this.devices.values()) this.refreshSkirt(group);
  }

  private updateRay(
    event: PointerEvent | { clientX: number; clientY: number },
  ) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
  pointFromScreen(clientX: number, clientY: number): WorldPoint | null {
    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    )
      return null;
    this.updateRay({ clientX, clientY });
    const position = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, position)) return null;
    if (Math.abs(position.x) > 7.35 || Math.abs(position.z) > 4.85) return null;
    return { x: snap(position.x), z: snap(position.z) };
  }
  /** Mirrors the placement rules: device spacing 1.55, wreckage and installations 1.3. */
  private socketBlocked(point: WorldPoint) {
    return this.topology.nodes.some((node) => Math.hypot(node.x - point.x, node.z - point.z) < 1.55) ||
      (this.terrain?.debris ?? []).some((spot) => Math.hypot(spot.x - point.x, spot.z - point.z) < 1.3) ||
      this.installationList.some((item) => Math.hypot(item.x - point.x, item.z - point.z) < 1.3);
  }
  previewAt(clientX: number, clientY: number) {
    if (this.aimDrag) {
      this.highlightPort(this.portAt({ clientX, clientY }));
      return;
    }
    const point = this.pointFromScreen(clientX, clientY);
    this.placement.visible = Boolean(this.placementRole && point);
    if (point) {
      this.placement.position.set(point.x, 0, point.z);
      const blocked = this.socketBlocked(point);
      for (const material of this.placementMaterials) material.color.setHex(blocked ? 0xf07a64 : 0x80ffe6);
    }
  }
  /** The standing port under the pointer: its intent badge (the DOM layer over the canvas, which a
   * captured drag still passes over), its sprite or its rail plate. */
  private portAt(event: { clientX: number; clientY: number }): Port | null {
    const badge = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(".hostile-intent[data-port]");
    const badgePort = badge?.dataset.port as Port | undefined;
    if (badgePort && this.ports.some(visual => visual.port === badgePort && visual.enemy && visual.enemy.hp > 0 && !visual.dead)) return badgePort;
    this.updateRay(event);
    const targets: THREE.Object3D[] = [];
    for (const visual of this.ports) {
      if (!visual.enemy || visual.enemy.hp <= 0 || visual.dead || !visual.ready) continue;
      if (visual.plate.visible) targets.push(visual.plate);
      // The body's hit area: the upper, painted part of the sprite (not its transparent margin).
      const home = visual.group.position;
      visual.hit.position.set(home.x, home.y + visual.size * 0.14 + visual.actor.mesh.position.y, home.z + 0.2);
      visual.hit.scale.set(visual.size * 0.5, visual.size * 0.62, 1);
      visual.hit.updateMatrixWorld();
      targets.push(visual.hit);
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0]?.object;
    return (hit?.userData.port as Port | undefined) ?? null;
  }
  private highlightPort(port: Port | null) {
    if (this.aimDrag) this.aimDrag.over = port;
    for (const visual of this.ports) visual.highlight.visible = visual.port === port && visual.plate.visible;
    if (this.aimDrag) this.canvas.dataset.cursor = port ? "target" : "grabbing";
  }
  /** Where the pointer is over the table for a glyph or a tether: a hand above the deck, and past
   * the far rail in front of the plates. */
  private pointerPoint(event: { clientX: number; clientY: number }) {
    this.updateRay(event);
    const point = new THREE.Vector3();
    const deck = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1), point);
    if (!deck || point.z < -5.6) this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 5.6), point);
    return new THREE.Vector3(THREE.MathUtils.clamp(point.x, -9, 9), THREE.MathUtils.clamp(point.y, 0.6, 6), THREE.MathUtils.clamp(point.z, -5.6, 5));
  }
  /** The selected delivery's tether: its glyph to the pointer, or (over a hostile) to that hostile's
   * plate, in the channel's colour. null removes it. */
  private showTether(event: { clientX: number; clientY: number } | null) {
    const glyph = event && this.glyphs.find(item => item.view.key === this.selectedDelivery && item.halo);
    if (!glyph || !event || this.placementRole || this.linkSource || this.aimDrag) {
      if (this.tether) {
        this.deliveryGroup.remove(this.tether);
        this.tether.geometry.dispose();
        this.tether.material.dispose();
        this.tether = null;
      }
      if (!this.aimDrag) for (const visual of this.ports) visual.highlight.visible = false;
      return;
    }
    const port = this.portAt(event);
    this.highlightPort(port);
    const plate = port ? this.portOf(port)!.plate.position : null;
    const to = plate ? new THREE.Vector3(plate.x, plate.y + 0.2, plate.z + 0.05) : this.pointerPoint(event);
    const from = glyph.glyph.position;
    const middle = from.clone().lerp(to, 0.5);
    middle.y += 0.6 + from.distanceTo(to) * 0.12;
    const geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from.clone(), middle, to), 24, 0.05, 5, false);
    if (this.tether) {
      this.tether.geometry.dispose();
      this.tether.geometry = geometry;
      return;
    }
    const material = glow(glyph.glyph.material.color.getHex(), 0.8);
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = false;
    material.toneMapped = false;
    material.blending = THREE.AdditiveBlending;
    this.tether = new THREE.Mesh(geometry, material);
    this.tether.renderOrder = TABLE_LABEL_ORDER + 1;
    this.deliveryGroup.add(this.tether);
  }
  private hit(event: PointerEvent) {
    this.updateRay(event);
    const glyphs = this.glyphs.map(item => item.glyph);
    const fronts = [...this.installations.values()].map(group => group.userData.installation.hit);
    const object = this.raycaster.intersectObjects([...glyphs, ...fronts, ...this.hitObjects], false)[0]
      ?.object;
    const port = object ? null : this.portAt(event);
    return {
      node: object?.userData.nodeId as string | undefined,
      link: object?.userData.linkKey as string | undefined,
      installation: object?.userData.installationId as string | undefined,
      delivery: object?.userData.deliveryKey as string | undefined,
      port: port ?? undefined,
    };
  }
  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.callbacks.onHover?.(null, event.clientX, event.clientY);
    const hit = this.hit(event);
    if (hit.delivery && !this.placementRole && !this.linkSource && this.callbacks.onAim) {
      this.aimDrag = { key: hit.delivery, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, over: null };
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.dataset.cursor = "grabbing";
      return;
    }
    this.pointerDown = {
      id: hit.node ?? null,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    if ((hit.node || this.targetingZone) && !this.placementRole && !this.linkSource) {
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
    }
  };
  private onPointerMove = (event: PointerEvent) => {
    if (this.aimDrag) {
      if (Math.hypot(event.clientX - this.aimDrag.x, event.clientY - this.aimDrag.y) > 5) this.aimDrag.moved = true;
      const glyph = this.glyphs.find(item => item.view.key === this.aimDrag!.key);
      if (glyph && this.aimDrag.moved) {
        // The glyph follows the pointer over the table, lifted toward the rail.
        glyph.glyph.position.copy(this.pointerPoint(event));
        glyph.halo?.position.copy(glyph.glyph.position);
        this.showTether(null);
      }
      this.highlightPort(this.portAt(event));
      return;
    }
    if (this.targetingZone) {
      const point = this.pointFromScreen(event.clientX,event.clientY);
      this.setZonePreview(point ? point.z < -1.3 ? "north" : point.z > 1.3 ? "south" : "center" : null);
      this.canvas.dataset.cursor = point ? "target" : "default";
      return;
    }
    if (
      this.pointerDown &&
      Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y,
      ) > 5
    )
      this.pointerDown.moved = true;
    if (this.pointerDown?.id && !this.placementRole && !this.linkSource) {
      const distance = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y,
      );
      if (distance > 5) this.pointerDown.moved = true;
      if (this.pointerDown.moved) {
        const point = this.pointFromScreen(event.clientX, event.clientY);
        this.callbacks.onMove(this.pointerDown.id, point, false);
        this.canvas.dataset.cursor = "grabbing";
        this.hover(null);
        this.callbacks.onHover?.(null, event.clientX, event.clientY);
      }
      return;
    }
    this.previewAt(event.clientX, event.clientY);
    if (this.linkSource) {
      const target = this.hit(event).node;
      this.showLinkGhost(target && target !== this.linkSource ? target : null);
      this.callbacks.onHover?.(null, event.clientX, event.clientY);
    } else if (!this.placementRole) {
      const hit = this.hit(event);
      const armed = !!this.canvas.dataset.armed;
      if (armed) this.showTether(event);
      this.canvas.dataset.cursor = hit.delivery ? "grab"
        : hit.installation && this.targetingInstallations ? "target"
        : hit.port && armed ? "target"
        : hit.node || hit.installation || hit.port ? "pointer" : "grab";
      this.hover(hit.installation ? { kind: "installation", id: hit.installation } : hit.node ? { kind: "node", id: hit.node } : null);
      const target: TableHover | null = hit.delivery ? { kind: "delivery", id: hit.delivery }
        : hit.installation ? { kind: "installation", id: hit.installation }
        : hit.node ? { kind: "node", id: hit.node }
        : hit.port ? { kind: "port", id: hit.port }
        : hit.link ? { kind: "link", id: hit.link } : null;
      this.callbacks.onHover?.(target, event.clientX, event.clientY);
    } else this.callbacks.onHover?.(null, event.clientX, event.clientY);
  };
  /** Hover reach rings: an installation's reach (magenta), a firewall's quarantine reach (brass),
   * a Server Rack's shelter (sage), a cabled Honeypot's bite (green). Static under reduced motion. */
  private hover(target: { kind: "node" | "installation"; id: string } | null) {
    if (target?.id === this.hovered?.id && target?.kind === this.hovered?.kind) return;
    this.hovered = target;
    let spot: WorldPoint | null = null, color = MALWARE_COLOR;
    if (target?.kind === "installation") {
      const item = this.installationList.find(entry => entry.id === target.id);
      if (item && REACH_KINDS.has(item.kind) && item.kind !== "breaker") spot = item;
    } else if (target?.kind === "node") {
      const node = this.topology.nodes.find(entry => entry.id === target.id);
      if (node?.role === "firewall") { spot = node; color = BRASS_COLOR; }
      else if (node?.role === "rack") { spot = node; color = SHELTER_COLOR; }
      else if (node?.role === "honeypot" && this.isCabled(node)) { spot = node; color = BITE_COLOR; }
    }
    this.hoverRing.visible = !!spot;
    if (spot) {
      this.hoverRing.position.set(spot.x, 0.24, spot.z);
      this.tintRing(this.hoverRing, color);
    }
  }

  /** Previews the pending cable to `target`: cyan when clean, amber with an
   * ember at each wreck it would fray over. Existing cables show nothing. */
  private showLinkGhost(target: string | null) {
    if (target === this.linkGhostTarget) return;
    this.linkGhostTarget = target;
    if (this.linkGhost) {
      this.scene.remove(this.linkGhost);
      this.disposeObject(this.linkGhost);
      this.linkGhost = null;
    }
    const from = this.topology.nodes.find((node) => node.id === this.linkSource);
    const to = this.topology.nodes.find((node) => node.id === target);
    if (!from || !to || this.topology.links.some((link) => linkKey(link.a, link.b) === linkKey(from.id, to.id))) return;
    const curve = cableCurve(from, to);
    const crossings = this.linkArmored || !this.terrain ? [] : wreckCrossings(from, to, this.terrain.debris);
    const color = crossings.length ? 0xffa860 : 0x80ffe6;
    const ghost = new THREE.Group();
    ghost.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.035, 6, false), glow(color, 0.75)));
    ghost.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.12, 6, false), glow(color, 0.12)));
    for (const t of crossings) ghost.add(this.frayMark(curve, t, false));
    this.linkGhost = ghost;
    this.scene.add(ghost);
  }
  private onPointerUp = (event: PointerEvent) => {
    const aim = this.aimDrag;
    if (aim) {
      this.aimDrag = null;
      this.controls.enabled = true;
      if (this.canvas.hasPointerCapture(aim.pointerId)) this.canvas.releasePointerCapture(aim.pointerId);
      const port = aim.moved ? this.portAt(event) : null;
      this.highlightPort(null);
      this.canvas.dataset.cursor = "grab";
      this.refreshDeliveries(true);
      if (port) this.callbacks.onAim?.(aim.key, port);
      // A click (no drag) picks the delivery up: the next hostile clicked receives it.
      else if (!aim.moved) this.callbacks.onDelivery?.(aim.key);
      return;
    }
    const down = this.pointerDown;
    this.pointerDown = null;
    this.controls.enabled = true;
    if (down?.moved && down.id) {
      const point = this.pointFromScreen(event.clientX, event.clientY);
      this.callbacks.onMove(down.id, point, true);
      return;
    }
    if (!down || (down.moved && !down.id)) return;
    const hit = this.hit(event);
    if (hit.installation && !this.placementRole && !this.linkSource && this.callbacks.onInstallation) this.callbacks.onInstallation(hit.installation);
    else if (hit.node) this.callbacks.onNode(hit.node);
    else if (hit.link && !this.targetingZone) this.callbacks.onLink(hit.link);
    else if (hit.port && !this.placementRole && !this.linkSource && this.callbacks.onPort) this.callbacks.onPort(hit.port);
    else if (this.canvas.dataset.armed && !this.placementRole && !this.linkSource && !this.targetingZone) this.callbacks.onDelivery?.(null);
    else {
      const point = this.pointFromScreen(event.clientX, event.clientY);
      if (point) this.callbacks.onGround(point);
    }
  };
  private onPointerCancel = () => {
    this.cancelInteraction();
  };

  /** Ends an interrupted drag without committing a placement, movement or aim. */
  cancelInteraction() {
    const pointerId = this.pointerDown?.pointerId ?? this.aimDrag?.pointerId;
    const aimed = !!this.aimDrag;
    this.pointerDown = null;
    this.aimDrag = null;
    this.controls.enabled = true;
    this.placement.visible = false;
    this.canvas.dataset.cursor = "grab";
    for (const visual of this.ports) visual.highlight.visible = false;
    this.showTether(null);
    if (aimed) this.refreshDeliveries(true);
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId))
      this.canvas.releasePointerCapture(pointerId);
  }
  private onPointerLeave = (event: PointerEvent) => {
    this.placement.visible = false;
    // Onto a hostile's intent badge the tether follows (it reaches that hostile); elsewhere it goes.
    if (!this.aimDrag) this.showTether((event.relatedTarget as HTMLElement | null)?.closest?.(".hostile-intent[data-port]") ? event : null);
    this.showLinkGhost(null);
    this.hover(null);
    this.callbacks.onHover?.(null, event.clientX, event.clientY);
  };

  // ================================================================ playback primitives

  /** Where a port's intent badge hangs (client pixels): the top centre of its rail plate, which is
   * also where a lone hostile's lower body meets the far rail. `width` is the plate's width on screen.
   * null while the table is hidden, or for a port without a standing hostile (unless `empty`: an
   * announced arrival's badge holds its empty port). */
  portAnchor(port: Port, empty = false): { x: number; y: number; width: number } | null {
    const visual = this.portOf(port);
    if (!visual || !this.visible) return null;
    if (!empty && (!visual.enemy || visual.enemy.hp <= 0 || visual.dead || !visual.ready)) return null;
    const rect = this.canvas.getBoundingClientRect();
    const [width, height] = port === "centre" ? PLATE_SIZE.leader : PLATE_SIZE.side;
    const at = (point: THREE.Vector3) => {
      point.project(this.camera);
      return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height };
    };
    // A plate is a sprite: it faces the camera, so its crown lies along the camera's up axis (the
    // drawn plate leaves a 1/32 margin inside the sprite).
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const crown = new THREE.Vector3(plateX(port), PLATE_FOOT + height / 2, PLATE_Z).addScaledVector(up, height / 2 * (30 / 32));
    const centre = at(crown.clone()), left = at(crown.clone().addScaledVector(side, -width / 2)), right = at(crown.clone().addScaledVector(side, width / 2));
    return { x: centre.x, y: centre.y, width: right.x - left.x };
  }
  /** Where a port's hostile is on screen (client pixels), for numbers that rise over it. */
  portScreen(port: Port): { x: number; y: number } | null {
    const visual = this.portOf(port);
    if (!visual?.enemy) return null;
    const rect = this.canvas.getBoundingClientRect();
    const point = (this.pack && visual.plate.visible ? visual.plate.position.clone().setY(visual.plate.position.y + 1.4)
      : visual.group.position.clone().add(new THREE.Vector3(0, visual.size * 0.12, 0))).project(this.camera);
    return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height };
  }
  private portTarget(visual: PortVisual) {
    return visual.group.position.clone().add(new THREE.Vector3(0, visual.size * 0.08, 1.2));
  }

  playPacket(path: string[], onDone?: () => void, color = 0x8affea, count?: number, air?: THREE.Vector3) {
    if (!this.active) return;
    const routes: THREE.Curve<THREE.Vector3>[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const key = linkKey(path[i], path[i + 1]);
      const source = this.cableCurves.get(key);
      const edge = this.topology.links.find(
        (link) => linkKey(link.a, link.b) === key,
      );
      if (!source || !edge) continue;
      routes.push(
        edge.a === path[i]
          ? source
          : ({
              getPoint: (t: number) => source.getPoint(1 - t),
            } as THREE.Curve<THREE.Vector3>),
      );
    }
    if (!routes.length) {
      onDone?.();
      return;
    }
    if (air) {
      // Across the air to its port: a high arc from OMEGA into the hostile.
      const from = routes[routes.length - 1].getPoint(1);
      const middle = from.clone().lerp(air, 0.5);
      middle.y += 3.4;
      routes.push(new THREE.QuadraticBezierCurve3(from, middle, air));
    }
    const reduced = this.reducedMotion();
    const total = reduced ? 1 : count ?? 4;
    for (let i = 0; i < total; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.12 : 0.085, 12, 12),
        glow(color),
      );
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.31 : 0.2, 12, 12),
        glow(color, 0.16),
      );
      group.add(core, aura);
      group.position.copy(routes[0].getPoint(0));
      this.scene.add(group);
      this.packets.push({
        mesh: group,
        routes,
        speed: reduced ? routes.length / 0.2 : 2.3,
        start: performance.now() + i * 170,
        done: i === total - 1 ? onDone : undefined,
      });
    }
  }

  /** Packets race along every channel at once; `done` fires when the last one lands. */
  playChannels(paths: string[][], done?: () => void) {
    const routes = paths.filter((path) => path.length > 1);
    if (!routes.length || !this.active) {
      done?.();
      return;
    }
    let remaining = routes.length;
    const finished = () => { if (--remaining === 0) done?.(); };
    routes.forEach((path, channel) =>
      this.playPacket(path, finished, channel === 0 ? CHANNEL_COLORS.primary : CHANNEL_COLORS.secondary, channel === 0 ? 4 : 3));
  }

  /**
   * A split transmission: each delivery runs its channel, then crosses the air to its port.
   * `onPort` fires when the last packet of a port lands (its impact); `done` after every port.
   */
  playTransmission(deliveries: readonly { path: string[]; port: Port; primary: boolean }[], onPort: (port: Port) => void, done: () => void) {
    const live = deliveries.filter(delivery => delivery.path.length > 1);
    if (!live.length || !this.active) { done(); return; }
    const remaining = new Map<Port, number>();
    for (const delivery of live) remaining.set(delivery.port, (remaining.get(delivery.port) ?? 0) + 1);
    let ports = remaining.size;
    for (const delivery of live) {
      const visual = this.portOf(delivery.port)!;
      this.playPacket(delivery.path, () => {
        const left = (remaining.get(delivery.port) ?? 1) - 1;
        remaining.set(delivery.port, left);
        if (left > 0) return;
        onPort(delivery.port);
        if (--ports === 0) done();
      }, delivery.primary ? CHANNEL_COLORS.primary : CHANNEL_COLORS.secondary, delivery.primary ? 4 : 3, this.portTarget(visual));
    }
  }

  /** Overflow: the surplus leaps from one hostile to the next port. */
  playOverflow(from: Port, to: Port, done: () => void) {
    const source = this.portOf(from), target = this.portOf(to);
    if (!source || !target || this.reducedMotion()) { done(); return; }
    const start = this.portTarget(source), end = this.portTarget(target);
    const middle = start.clone().lerp(end, 0.5);
    middle.y += 2.2;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.14), glow(0xfff1d0)));
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), glow(CHANNEL_COLORS.primary, 0.3)));
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.bolts.push({ mesh, curve: new THREE.QuadraticBezierCurve3(start, middle, end), start: performance.now(), duration: 420, done });
  }

  impact(color = 0xff7c91, count = 28, port?: Port) {
    const visual = this.portOf(port) ?? this.leaderPort();
    visual.hitAt = performance.now();
    if (this.reducedMotion()) {
      this.pulseAt(visual.port === "centre" ? 0 : plateX(visual.port), -5.4, color, 1.7);
      return;
    }
    const origin = this.portTarget(visual);
    const scale = visual.size / 10.5;
    for (let i = 0; i < Math.round(count * (0.6 + scale * 0.4)); i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry((0.05 + Math.random() * 0.09) * Math.max(0.75, scale)),
        glow(color),
      );
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 9 * scale,
        (Math.random() - 0.5) * 7 * scale,
        (Math.random() - 0.3) * 7 * scale,
      );
      this.sparks.push({ mesh, velocity, life: 0.55 + Math.random() * 0.45 });
    }
    this.light.color.setHex(color);
    this.light.intensity = 70;
    this.impactEndsAt = performance.now() + 280;
    this.shakeCamera(0.06, 180);
  }
  pulseThreat() {
    for (const node of this.topology.nodes)
      if (node.fixed) this.pulseAt(node.x, node.z, 0xff7869, 1.4);
  }
  /** A dormant escort's phase passes: it dims for a beat. */
  dimPort(port: Port, milliseconds = 700) {
    const visual = this.portOf(port);
    if (!visual) return;
    visual.dimFrom = performance.now();
    visual.dimUntil = visual.dimFrom + milliseconds;
  }

  /** A wind-up, an action-specific projectile, and an impact at the real target. */
  playEnemyAction(kind: ActionKind, targetId: string | null, zone: Zone | null, done: () => void, quick = false, onImpact: () => void = () => {},
    options: { port?: Port; point?: WorldPoint | null; color?: number } = {}) {
    const visual = this.portOf(options.port) ?? this.leaderPort();
    if (visual.action) return;
    if (!visual.enemy || !visual.ready || visual.dead) {
      // Nothing drawn at that port (its sheet is still loading): the beat still lands.
      onImpact();
      window.setTimeout(done, quick ? 80 : 300);
      return;
    }
    const targetNode = this.topology.nodes.find(node => node.id === targetId);
    const cable = targetId ? this.cableCurves.get(targetId) : undefined;
    const socket = options.point ?? (kind === "infect" || kind === "install" ? this.ghostSockets[0] ?? null : null);
    const target = cable ? cable.getPoint(.5) : targetNode ? new THREE.Vector3(targetNode.x, 1.2, targetNode.z)
      : socket ? new THREE.Vector3(socket.x, 1.2, socket.z)
      : kind === "strike" || kind === "breach" ? new THREE.Vector3(kind === "breach" ? 6 : -6, 1.2, 0)
      : zone ? new THREE.Vector3(0, .8, zone === "north" ? -2.5 : zone === "south" ? 2.5 : 0)
      : new THREE.Vector3(0, 1.2, 0);
    const colors: Record<string, number> = {
      strike: 0xf0ad76, breach: 0xf57968, sever: 0xf1d5a0, jam: 0xb59cec, corrupt: 0xb980c6, charge: 0xf6c486,
      infect: MALWARE_COLOR, install: MALWARE_COLOR, overload: FRAYED_COLOR,
    };
    const color = options.color ?? colors[kind] ?? 0xf0ad76;
    const effect = new THREE.Group();
    if (kind === "sever") {
      for (const angle of [-.65, .65]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(.1, 2.2, .08), glow(color));
        blade.rotation.z = angle; effect.add(blade);
      }
    } else if (kind === "jam" || kind === "corrupt" || kind === "charge" || kind === "overload") {
      for (let i = 0; i < 3; i++) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(.26 + i * .16, .03, kind === "overload" ? 3 : 6, 40), glow(color, .85));
        halo.rotation.set(i * .6, i * .7, 0); effect.add(halo);
      }
    } else if (kind === "infect" || kind === "install") {
      const shell = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      const a = new THREE.Mesh(new THREE.TetrahedronGeometry(.3), shell);
      const b = new THREE.Mesh(new THREE.TetrahedronGeometry(.3), shell);
      b.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      effect.add(a, b, new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 10), glow(color, .25)));
    } else {
      effect.add(new THREE.Mesh(new THREE.OctahedronGeometry(kind === "breach" ? .46 : .3), glow(color)));
      effect.add(new THREE.Mesh(new THREE.SphereGeometry(kind === "breach" ? .9 : .6, 12, 10), glow(color, .18)));
      for (let i = 0; i < (kind === "breach" ? 3 : 1); i++) {
        const trail = new THREE.Mesh(new THREE.TorusGeometry(.3 + i * .12, .035, 5, 32), glow(color, .6));
        trail.position.z = i * .26; effect.add(trail);
      }
    }
    const origin = visual.group.position.clone(); origin.y += visual.size * .06; origin.z += 1.4;
    if (kind === "charge") target.copy(origin);
    effect.position.copy(origin); effect.visible = false;
    effect.scale.setScalar(visual.size / 10.5);
    this.scene.add(effect);
    visual.action = { kind, target, origin, effect, color, start: performance.now(), duration: quick || this.reducedMotion() ? 160 : kind === "breach" ? 1150 : 920, impacted: false, done, onImpact };
    this.canvas.dataset.enemyAction = kind === "infect" ? "install" : kind;
  }

  private animatePorts(now: number, time: number, reduced: boolean) {
    for (const visual of this.ports) this.animatePort(visual, now, time, reduced);
    const report = this.ports.find(visual => visual.actor.transitioning() && visual.enemy)
      ?? this.ports.find(visual => visual.action)
      ?? this.leaderPort();
    const state = report.enemy ? report.state : "idle";
    if (this.visible && this.canvas.dataset.enemyState !== state) this.canvas.dataset.enemyState = state;
    const enraged = this.ports.some(visual => visual.enemy && this.enraged(visual));
    if (enraged && !this.canvas.dataset.enemyEnraged) this.canvas.dataset.enemyEnraged = "true";
    else if (!enraged && this.canvas.dataset.enemyEnraged) delete this.canvas.dataset.enemyEnraged;
  }
  private enraged(visual: PortVisual) {
    const enemy = visual.enemy;
    return !!enemy && !!ENEMIES[enemy.id]?.enrages && enemy.hp <= enemy.maxHp / 2 && enemy.hp > 0;
  }

  private animatePort(visual: PortVisual, now: number, time: number, reduced: boolean) {
    const enemy = visual.enemy;
    if (!enemy || !visual.ready || (visual.dead && !visual.dying)) {
      visual.state = "idle";
      visual.light.intensity = 0;
      if (visual.under) visual.under.intensity = 0;
      return;
    }
    const action = visual.action;
    const hurt = visual.hitAt ? Math.max(0, 1 - (now - visual.hitAt) / 420) : 0;
    const attack = action ? Math.min(1, (now - action.start) / action.duration) : null;
    const enraged = this.enraged(visual);
    const centre = visual.port === "centre";
    visual.group.position.copy(portHome(visual.port, visual.size));
    if (!centre) visual.light.position.copy(visual.group.position).add(new THREE.Vector3(0, 0.2, 3.2));
    visual.group.position.y -= visual.drop;
    if (!reduced) visual.group.position.z -= hurt * .7;
    const dim = visual.dimUntil > now ? Math.sin(Math.min(1, (now - visual.dimFrom) / (visual.dimUntil - visual.dimFrom)) * Math.PI) : 0;
    visual.actor.dim = dim;
    visual.state = visual.actor.update(this.camera, now, time, reduced, visual.size,
      enemy.color, enraged, hurt, attack, action?.kind);
    // A slow heartbeat in its light; guardians beat harder. Escorts carry a smaller spill.
    const heartbeat = reduced ? 0 : Math.pow(Math.max(0, Math.sin(time * (visual.boss ? 1.6 : 1.3) + (centre ? 0 : visual.port === "left" ? 1.1 : 2.3))), 8);
    const strength = centre ? 1 : 0.5;
    visual.light.intensity = (visual.boss ? 34 : 24) * strength * (1 + heartbeat * .6 + (enraged ? .35 : 0)) * (1 - dim * .5);
    if (visual.under) visual.under.intensity = (visual.boss ? 26 : 18) * (1 + heartbeat * .4);
    if (!action) return;
    const t = Math.min(1, (now - action.start) / action.duration);
    const charge = Math.sin(Math.min(1, t / .5) * Math.PI / 2);
    // Anticipation: it rears back and rises before committing.
    const rear = Math.sin(Math.min(1, t / .36) * Math.PI);
    const lunge = Math.sin(Math.max(0, (t - .36) / .64) * Math.PI);
    const size = visual.size / 10.5;
    if (!reduced) {
      const heavy = action.kind === "breach" ? 1.35 : 1;
      visual.group.position.z -= rear * .9 * heavy * size;
      visual.group.position.y += rear * .45 * heavy * size;
      if (action.kind === "strike" || action.kind === "breach") {
        visual.group.position.z += lunge * (action.kind === "breach" ? 3.4 : 2.5) * size;
        visual.group.position.y -= lunge * .55 * size;
      } else if (action.kind === "sever") {
        visual.group.position.z += lunge * 1.6 * size;
        visual.group.position.x += Math.sin(Math.max(0, (t - .36) / .64) * Math.PI * 2) * .7 * size;
      } else visual.group.position.y += Math.sin(t * Math.PI) * .6 * size;
      action.effect.visible = t > .28 && t < .86;
      action.effect.position.lerpVectors(action.origin, action.target, Math.min(1, Math.max(0, (t - .28) / .5)));
      action.effect.rotation.set(t * 5, t * 7, action.kind === "sever" ? t * 2 : t * 6);
      action.effect.scale.setScalar((.6 + charge * .8) * Math.max(0.7, size));
    }
    visual.actor.mesh.material.color.lerp(new THREE.Color(enemy.color), Math.sin(t * Math.PI) * .3);
    if (t >= .78 && !action.impacted) {
      action.impacted = true;
      action.onImpact();
      if (action.kind !== "charge") {
        this.pulseAt(action.target.x, action.target.z, enemy.color, action.kind === "breach" ? 2 : 1.4);
        this.burst(action.target.clone(), ({ strike: 0xf0ad76, breach: 0xf57968 } as Record<string, number>)[action.kind] ?? action.color ?? enemy.color, action.kind === "breach" ? 18 : 10, 2.6);
      }
      if (action.kind === "strike" || action.kind === "breach") this.shakeCamera(action.kind === "breach" ? .2 : .12, action.kind === "breach" ? 420 : 280);
      if (action.kind === "corrupt" && this.forecastZone) this.pulseZone(this.forecastZone, "corrupt");
    }
    if (t >= 1) {
      this.scene.remove(action.effect); this.disposeObject(action.effect);
      visual.action = null;
      if (!this.ports.some(other => other.action)) delete this.canvas.dataset.enemyAction;
      action.done();
    }
  }
  playEnemyTransition(kind: "enrage" | "death" | "break", done: () => void, quick = false, port?: Port) {
    const visual = this.portOf(port) ?? this.leaderPort();
    const enemy = visual.enemy;
    if (!enemy || !visual.ready) {
      if (kind === "death") { visual.dead = true; visual.group.visible = false; this.refreshRail(); }
      done();
      return;
    }
    this.canvas.dataset.enemyState = kind;
    const x = visual.port === "centre" ? 0 : plateX(visual.port);
    this.pulseAt(x, -5.3, enemy.color, (kind === "death" ? 3.4 : 2.4) * (visual.size / 10.5));
    if (kind === "enrage") this.shakeCamera(.14, 600);
    if (kind === "death") {
      visual.dying = true;
      this.shakeCamera(.1, 500);
      this.burst(visual.group.position.clone().add(new THREE.Vector3(0, visual.size * .1, 1)), enemy.color, 36, 4);
    }
    visual.actor.transitionTo(kind, () => {
      if (kind === "death") {
        visual.dying = false;
        visual.dead = true;
        visual.group.visible = false;
        this.refreshRail();
        this.refreshDeliveries(true);
      }
      done();
    }, quick || this.reducedMotion());
    this.refreshRail();
  }
  /** A reinforcement or an add takes its port now (the playback's arrival beat). */
  arrive(enemy: Enemy) {
    const visual = this.portOf(enemy.port);
    if (!visual) return;
    const roster = this.enemies.filter(other => other.port !== enemy.port).concat({ ...enemy });
    roster.sort((a, b) => PORT_ORDER.indexOf(a.port) - PORT_ORDER.indexOf(b.port));
    this.syncRail(roster, true);
    this.refreshDeliveries(true);
  }

  /** Trap phase: a firewall's quarantine beam (from a Sentry's searchlight) into an installation. */
  playQuarantine(firewallId: string, installationId: string, destroys: boolean) {
    const firewall = this.devices.get(firewallId);
    const spot = this.installationSpots.get(installationId);
    if (!firewall || !spot) return;
    const lens = firewall.getObjectByName("sentry_beam");
    const from = new THREE.Vector3();
    if (lens) lens.getWorldPosition(from);
    else from.set(firewall.position.x, 1.95, firewall.position.z);
    const to = new THREE.Vector3(spot.x, 1.0, spot.z);
    this.beam(from, to, BRASS_COLOR, 680, 0.09);
    this.pulseAt(spot.x, spot.z, BRASS_COLOR, destroys ? 1.6 : 1.1);
    this.burst(to, destroys ? 0xffe0a0 : BRASS_COLOR, destroys ? 18 : 8, 2.4);
  }

  /** One installation effect of the enemy phase, in placement order. */
  playInstallationEffect(effect: InstallationEffectView) {
    const spot = this.installationSpots.get(effect.id);
    if (!spot) return;
    const target = effect.target ? this.topology.nodes.find(node => node.id === effect.target) : undefined;
    const color = INSTALLATION_COLORS[effect.kind];
    if (effect.effect === "jam" && target) {
      const from = new THREE.Vector3(spot.x, 1.55, spot.z), to = new THREE.Vector3(target.x, 1.35, target.z);
      this.beam(from, to, effect.cancelled ? 0x9ff3ff : color, 640, 0.08);
      this.pulseAt(target.x, target.z, effect.decoyed ? 0xffa640 : effect.cancelled ? 0x9ff3ff : 0xb59cec, 1.2);
      if (effect.decoyed || effect.cancelled) this.pulseAt(spot.x, spot.z, 0xffa640, 1.2, 0.12);
    } else if (effect.effect === "wear" && target) {
      this.playWear(target.id, spot);
    } else if (effect.effect === "tick") {
      if (!this.reducedMotion()) this.pulseAt(spot.x, spot.z, BLAST_COLOR, 1.3);
      const group = this.installations.get(effect.id);
      const item = this.installationList.find(entry => entry.id === effect.id);
      if (group && item && effect.countdown !== undefined)
        refreshInstallation(group, { ...item, countdown: effect.countdown }, group.userData.installation.pips, object => this.disposeObject(object));
    } else if (effect.effect === "detonate") this.playDetonation(effect.id);
  }
  /** Wear: a fray-coloured pulse on the device (from a Spike, a travelling spark). */
  playWear(nodeId: string, from?: WorldPoint) {
    const node = this.topology.nodes.find(entry => entry.id === nodeId);
    if (!node) return;
    if (from && !this.reducedMotion()) this.beam(new THREE.Vector3(from.x, 1.1, from.z), new THREE.Vector3(node.x, 1.2, node.z), INSTALLATION_COLORS.spike, 460, 0.06);
    this.pulseAt(node.x, node.z, FRAYED_COLOR, 1.25, from ? 0.15 : 0);
    this.burst(new THREE.Vector3(node.x, 1.4, node.z), 0xffa05a, 8, 1.8);
  }
  /** Breakdown: a coral pulse and a heavy burst; the device and its cables leave the table. */
  playBreakdown(nodeId: string) {
    const node = this.topology.nodes.find(entry => entry.id === nodeId);
    const group = this.devices.get(nodeId);
    if (!node || !group) return;
    this.pulseAt(node.x, node.z, 0xf27a64, 1.8);
    this.pulseAt(node.x, node.z, COLORS[node.role], 1.2, 0.12);
    this.burst(new THREE.Vector3(node.x, 1.3, node.z), COLORS[node.role], 26, 3.6);
    this.burst(new THREE.Vector3(node.x, 1.0, node.z), 0xffa05a, 16, 2.6);
    this.shakeCamera(0.08, 260);
    this.devices.delete(nodeId);
    const stale = this.hitObjects.findIndex(hit => hit.parent === group);
    if (stale >= 0) this.hitObjects.splice(stale, 1);
    this.dynamic.remove(group);
    this.dissolve(group, 0.45, -0.2);
    for (const [key, cable] of this.cableGroups)
      if (key.split("::").includes(nodeId)) {
        this.cableGroups.delete(key);
        this.dynamic.remove(cable);
        this.dissolve(cable, 0.35, 0);
      }
  }
  /** A Phantom Node absorbs a disruption: it flickers, and fades when its last absorption is spent. */
  playPhantom(nodeId: string, fades: boolean) {
    const node = this.topology.nodes.find(entry => entry.id === nodeId);
    const group = this.devices.get(nodeId);
    if (!node || !group) return;
    this.pulseAt(node.x, node.z, COLORS.phantom, 1.4);
    this.burst(new THREE.Vector3(node.x, 1.6, node.z), COLORS.phantom, 12, 2);
    if (!fades) return;
    this.devices.delete(nodeId);
    this.dynamic.remove(group);
    this.dissolve(group, 0.9, 0.6);
  }
  /** A Breaker Charge reaches zero: a flash, the blast ring expanding, a heavy shake. */
  playDetonation(id: string) {
    const spot = this.installationSpots.get(id);
    if (!spot) return;
    const origin = new THREE.Vector3(spot.x, 0.9, spot.z);
    this.pulseAt(spot.x, spot.z, 0xffd2a0, 2.9);
    this.pulseAt(spot.x, spot.z, BLAST_COLOR, 3.2, 0.1);
    this.burst(origin, 0xffc27a, 34, 4.6);
    this.burst(origin, BLAST_COLOR, 18, 3.2);
    this.light.color.setHex(0xffa060);
    this.light.position.set(spot.x, 2.4, spot.z);
    this.light.intensity = 110;
    this.impactEndsAt = performance.now() + 360;
    this.shakeCamera(0.24, 520);
    const group = this.installations.get(id);
    if (group) {
      this.installations.delete(id);
      this.frontGroup.remove(group);
      this.dissolve(group, 0.25, 0.3);
    }
  }
  /** An installation arrives at its socket (the hostile's projectile landed): the body appears now. */
  plantInstallation(item: Installation) {
    if (this.installations.has(item.id)) return;
    this.setInstallations([...this.installationList, item], { installs: this.ghostSockets.filter(socket => socket.x !== item.x || socket.z !== item.z) });
  }
  /** Quarantine or a bite takes points mid-playback (the pips update before the rules advance). */
  damageInstallation(id: string, integrity: number) {
    const item = this.installationList.find(entry => entry.id === id);
    if (!item) return;
    if (integrity <= 0) {
      this.pulseNode(id, "scrub");
      this.setInstallations(this.installationList.filter(entry => entry.id !== id), { installs: this.ghostSockets });
      return;
    }
    this.setInstallations(this.installationList.map(entry => entry.id === id ? { ...entry, integrity } : entry), { installs: this.ghostSockets });
  }

  /**
   * A crate drops from a fallen escort's port onto the table, lands with a burst, and opens.
   * `onOpen` fires when the lid lifts (the toast and the cue); the crate fades after a beat.
   * Reduced motion: it appears in place with a single pulse.
   */
  dropCrate(port: Port, spot: WorldPoint, onOpen: () => void, done: () => void = () => {}, fast = false) {
    const visual = this.portOf(port);
    const { group, body, lid } = buildTableProp("crate");
    const scale = 1.35;
    group.scale.setScalar(scale);
    const reduced = this.reducedMotion();
    // Scaled about the group origin: sink it so the crate still stands on the deck.
    const land = new THREE.Vector3(spot.x, -0.42 - TABLE_Y * (scale - 1), spot.z);
    const from = visual ? visual.group.position.clone().add(new THREE.Vector3(0, visual.size * 0.1, 1.5)) : land.clone().setY(4);
    group.position.copy(reduced ? land : from);
    this.scene.add(group);
    const middle = from.clone().lerp(land, 0.5);
    middle.y += 3.2;
    this.props.push({
      group, body, lid, curve: reduced ? null : new THREE.QuadraticBezierCurve3(from, middle, land),
      // Quick transmissions keep the arc but halve it, so the crate opens inside the phase's beat.
      start: performance.now(), flight: reduced ? 0 : fast ? 380 : 760, hold: 2400, landed: false, opened: false, float: false, open: fast ? 240 : 520,
      onLand: () => {
        this.pulseAt(spot.x, spot.z, 0xe0b872, 1.5);
        this.burst(new THREE.Vector3(spot.x, 0.5, spot.z), 0xffd290, 14, 2.4);
        if (!reduced) this.shakeCamera(0.05, 160);
      },
      done: () => { onOpen(); done(); },
    });
  }
  /** A message fragment hovers over the fallen port for one beat (then the dialog opens). */
  dropFragment(port: Port, done: () => void = () => {}) {
    const visual = this.portOf(port);
    const { group, body } = buildTableProp("fragment");
    const x = visual ? (visual.port === "centre" ? 0 : plateX(visual.port)) : 0;
    group.position.set(x, 1.6, -5.2);
    group.scale.setScalar(1.6);
    this.scene.add(group);
    this.pulseAt(x, -5.2, 0xffe0a0, 1.4);
    this.props.push({
      group, body, lid: null, curve: null, start: performance.now(), flight: 0, hold: this.reducedMotion() ? 500 : 1200,
      landed: true, opened: true, float: true, onLand: () => {}, done,
    });
  }

  setVisible(visible: boolean) {
    if (this.visible && !visible) {
      this.clearTransientEffects();
      this.battleIdentity = null;
    }
    this.visible = visible;
    this.refreshRail();
  }

  private clearTransientEffects() {
    for (const visual of this.ports) {
      if (visual.action) {
        this.scene.remove(visual.action.effect);
        this.disposeObject(visual.action.effect);
        visual.action = null;
      }
      visual.hitAt = 0;
      visual.dying = false;
      visual.dimUntil = 0;
      visual.actor.clear();
    }
    delete this.canvas.dataset.enemyAction;
    delete this.canvas.dataset.enemyState;
    delete this.canvas.dataset.enemyEnraged;
    for (const effect of [...this.packets, ...this.sparks, ...this.pulses, ...this.bolts, ...this.beams]) {
      this.scene.remove(effect.mesh);
      this.disposeObject(effect.mesh);
    }
    for (const item of this.fading) { item.object.removeFromParent(); this.disposeObject(item.object); }
    for (const item of this.props) { this.scene.remove(item.group); this.disposeObject(item.group); }
    // Abandon callbacks with their encounter; they must not fire in a later battle.
    this.packets = [];
    this.sparks = [];
    this.pulses = [];
    this.bolts = [];
    this.beams = [];
    this.fading = [];
    this.props = [];
    this.impactEndsAt = 0;
    this.shake = { until: 0, power: 0, duration: 1 };
    this.light.color.setHex(0x4be7cf);
    this.light.intensity = 24;
    this.light.position.set(0, 3.2, 0);
  }
  resetCamera() {
    this.camera.position.copy(CAMERA_HOME);
    this.controls.target.set(0, 0.15, -0.3);
    this.controls.update();
  }

  /** Short, wide tables crop the top of the canvas (it starts above the viewport and
   * under the header). Lower a hostile just enough that its head stays visible. */
  private frameEnemy(visual: PortVisual) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.height) return;
    const limit = Math.max(0, -rect.top) / rect.height + 0.06;
    const home = portHome(visual.port, visual.size);
    const crown = home.y + visual.size * 0.44;
    this.camera.updateMatrixWorld();
    const at = (y: number) => (1 - new THREE.Vector3(home.x, y, home.z).project(this.camera).y) / 2;
    const top = at(crown), perUnit = at(crown - 1) - top;
    visual.drop = top >= limit || perUnit <= 0 ? 0 : Math.min(2.6, (limit - top) / perUnit);
  }

  private resize() {
    const element = this.canvas.parentElement ?? this.canvas;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    for (const visual of this.ports) this.frameEnemy(visual);
    this.declutterTags();
    const ratio = this.renderer.getPixelRatio();
    this.antialias.material.uniforms.resolution.value.set(
      1 / (width * ratio),
      1 / (height * ratio),
    );
  }

  private animateFront(time: number, motion: number, reduced: boolean) {
    for (const group of this.installations.values()) {
      animateProp(group, time, motion, reduced);
      const body = group.userData.installation.body;
      if (body) animateModelBody(body, time, motion, reduced);
    }
    for (const group of this.ghostGroup.children) animateProp(group as PropGroup, time, motion, reduced);
    for (const reach of [this.hoverRing, this.selectRing]) if (reach.visible) reach.rotation.y += motion * 0.18;
    // Worn hardware throws a sparse burst of three embers every few seconds.
    if (!reduced)
      for (const group of this.devices.values()) {
        if (!group.userData.worn) continue;
        if (!group.userData.nextSpark) group.userData.nextSpark = time + 1 + Math.random() * 3;
        if (time < group.userData.nextSpark) continue;
        group.userData.nextSpark = time + 2.6 + Math.random() * 2.4;
        this.burst(new THREE.Vector3(group.position.x, 1.5, group.position.z), 0xffa05a, 3, 0.9);
      }
    const glyphPulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(time * 3);
    for (const item of this.glyphs) {
      const dragged = this.aimDrag?.key === item.view.key && this.aimDrag.moved;
      if (!dragged) {
        // Each glyph drifts a hand's width toward its port and eases back (static under reduced motion);
        // the selected one holds still and lit, so its tether has a fixed end.
        const drift = reduced || item.halo ? 0 : (0.5 - 0.5 * Math.cos(time * 1.3 + item.phase)) * 0.42;
        item.glyph.position.copy(item.base).addScaledVector(item.toward, drift);
        item.glyph.material.opacity = item.halo ? 1 : glyphPulse;
      }
      if (item.halo) {
        item.halo.position.copy(item.glyph.position);
        item.halo.material.opacity = reduced ? 0.9 : 0.7 + 0.3 * Math.sin(time * 4);
        item.halo.scale.setScalar(reduced ? 1.9 : 1.8 + 0.18 * Math.sin(time * 4));
      }
    }
    // The target's reticle breathes (still under reduced motion).
    for (const visual of this.ports) {
      if (!visual.reticle.visible) continue;
      const base = visual.reticle.userData.base as THREE.Vector3;
      const breath = reduced ? 1 : 1 + 0.035 * (0.5 + 0.5 * Math.sin(time * 2.4));
      visual.reticle.scale.set(base.x * breath, base.y * breath, 1);
      visual.reticle.material.opacity = reduced ? 1 : 0.82 + 0.18 * Math.sin(time * 2.4);
    }
    if (this.tether) this.tether.material.opacity = reduced ? 0.85 : 0.6 + 0.3 * Math.sin(time * 5);
  }

  private animateProps(now: number, time: number, motion: number, reduced: boolean) {
    for (let i = this.props.length - 1; i >= 0; i--) {
      const item = this.props[i];
      const elapsed = now - item.start;
      if (item.body) animateModelBody(item.body, time, motion, reduced);
      if (!item.landed) {
        const t = item.flight ? Math.min(1, elapsed / item.flight) : 1;
        if (item.curve) item.group.position.copy(item.curve.getPoint(t * t));
        item.group.rotation.y = reduced ? 0 : t * 4.2;
        if (t >= 1) { item.landed = true; item.onLand(); }
        continue;
      }
      const after = elapsed - item.flight;
      if (item.float) item.group.position.y = 1.6 + (reduced ? 0 : Math.sin(time * 2.4) * 0.12);
      if (!item.opened && item.lid) {
        const open = Math.min(1, after / (reduced ? 1 : item.open ?? 520));
        item.lid.rotation.x = -1.9 * (1 - Math.pow(1 - open, 3));
        if (open >= 1) { item.opened = true; item.done(); }
      } else if (!item.opened) { item.opened = true; item.done(); }
      else if (item.float && after >= item.hold && !item.group.userData.finished) { item.group.userData.finished = true; item.done(); }
      if (after >= item.hold + (item.float ? 0 : 200)) {
        this.props.splice(i, 1);
        this.dissolve(item.group, 0.5, item.float ? 0.4 : 0.1);
      }
    }
  }

  private tick = () => {
    if (!this.active) return;
    this.frame = requestAnimationFrame(this.tick);
    if (this.frameInterval) {
      const now = performance.now();
      if (now - this.lastFrame < this.frameInterval) return;
      this.lastFrame = now;
    }
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.impactEndsAt && performance.now() >= this.impactEndsAt) {
      this.impactEndsAt = 0;
      this.light.color.setHex(0x4be7cf);
      this.light.intensity = 24;
      this.light.position.set(0, 3.2, 0);
    }
    if (!this.visible || document.hidden) return;
    const time = this.clock.elapsedTime;
    const reducedMotion = this.reducedMotion();
    const motion = reducedMotion ? 0 : dt;
    this.controls.update();
    this.scanMaterial.uniforms.uTime.value = reducedMotion ? 0 : time;
    this.placement.rotation.y += motion * 0.55;
    for (const group of this.devices.values()) animateDevice(group, time, motion, reducedMotion);
    for (const group of this.terrainGroup.children) animateProp(group as PropGroup, time, motion, reducedMotion);
    this.animateFront(time, motion, reducedMotion);
    for (const { material, phase, base } of this.frayEmbers)
      material.opacity = base * (reducedMotion ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(time * 6 + phase) * Math.sin(time * 17 + phase * 2)));
    for (const item of this.cableBeads) {
      if (item.active && !reducedMotion) {
        const progress = (time * (item.routed ? 0.28 : 0.15) + item.offset) % 1;
        item.bead.position.copy(
          item.curve.getPoint(item.reversed ? 1 - progress : progress),
        );
      }
    }
    this.motes.rotation.y += motion * 0.012;
    this.motes.position.y = reducedMotion ? 0 : Math.sin(time * 0.17) * 0.35;
    this.shafts.forEach((shaft, index) => {
      shaft.material.opacity = reducedMotion ? 0.06 : 0.045 + Math.sin(time * 0.23 + index * 2.1) * 0.02;
    });
    const now = performance.now();
    this.animatePorts(now, time, reducedMotion);
    this.animateProps(now, time, motion, reducedMotion);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      if (pulse.delay > 0) {
        pulse.delay -= dt;
        pulse.mesh.visible = pulse.delay <= 0;
        continue;
      }
      pulse.life -= dt;
      const progress = 1 - Math.max(0, pulse.life) / pulse.duration;
      pulse.mesh.material.opacity = (1 - progress) * 0.8;
      pulse.mesh.scale.setScalar(pulse.scale * (reducedMotion ? 1 : 0.8 + progress * 2.4));
      if (pulse.life <= 0) {
        this.scene.remove(pulse.mesh);
        this.disposeObject(pulse.mesh);
        this.pulses.splice(i, 1);
      }
    }
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const packet = this.packets[i];
      const elapsed = (now - packet.start) / 1000;
      if (elapsed < 0) continue;
      const position = elapsed * packet.speed;
      const step = Math.floor(position);
      if (step >= packet.routes.length) {
        this.scene.remove(packet.mesh);
        this.disposeObject(packet.mesh);
        this.packets.splice(i, 1);
        packet.done?.();
        continue;
      }
      packet.mesh.position.copy(
        packet.routes[step].getPoint(Math.min(1, position - step)),
      );
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      const t = Math.min(1, (now - bolt.start) / bolt.duration);
      bolt.mesh.position.copy(bolt.curve.getPoint(t * t));
      bolt.mesh.rotation.y += dt * 9;
      if (t >= 1) {
        this.scene.remove(bolt.mesh);
        this.disposeObject(bolt.mesh);
        this.bolts.splice(i, 1);
        bolt.done();
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      const t = Math.min(1, (now - beam.start) / beam.duration);
      const fade = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      beam.materials[0].opacity = 0.95 * fade;
      beam.materials[1].opacity = 0.45 * fade;
      if (t >= 1) {
        this.scene.remove(beam.mesh);
        this.disposeObject(beam.mesh);
        this.beams.splice(i, 1);
      }
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const item = this.fading[i];
      const t = Math.min(1, (now - item.start) / item.duration);
      for (const entry of item.materials) entry.material.opacity = entry.opacity * (1 - t);
      item.object.position.y = item.baseY + item.rise * t;
      if (t >= 1) {
        item.object.removeFromParent();
        this.disposeObject(item.object);
        this.fading.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life -= dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.velocity.y -= dt * 3;
      spark.mesh.scale.setScalar(Math.max(0.01, spark.life));
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
        this.disposeObject(spark.mesh);
        this.sparks.splice(i, 1);
      }
    }
    // Camera shake is an offset applied only for this frame's render.
    const shaking = !reducedMotion && now < this.shake.until;
    if (shaking) {
      const fall = (this.shake.until - now) / this.shake.duration;
      const power = this.shake.power * fall * fall;
      this.cameraRest.copy(this.camera.position);
      this.camera.position.x += (Math.random() - 0.5) * power * 2;
      this.camera.position.y += (Math.random() - 0.5) * power * 2;
    }
    this.composer.render();
    if (shaking) this.camera.position.copy(this.cameraRest);
    this.callbacks.onFrame?.();
  };
  dispose() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.cancelInteraction();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.clearTransientEffects();
    // Every sheet and each port's clone are owned by World.
    for (const visual of this.ports) {
      visual.actor.mesh.material.map = null;
      visual.texture?.dispose();
      visual.group.remove(visual.actor.mesh, visual.actor.embers);
      visual.actor.dispose();
    }
    for (const entry of this.sheets.values()) entry.texture.dispose();
    this.sheets.clear();
    this.disposeObject(this.scene);
    this.scene.clear();
    this.hitObjects.length = 0;
    this.installations.clear();
    this.devices.clear();
    this.deviceStates.clear();
    this.cableCurves.clear();
    this.cableVisuals.clear();
    this.cableGroups.clear();
    this.cableBeads.length = 0;
    this.frayEmbers.length = 0;
    this.glyphs.length = 0;
    this.linkGhost = null;
    this.zoneVisuals.clear();
    this.environment.dispose();
    this.scene.background = null;
    for (const backdrop of this.stageBackdrops.values()) backdrop.dispose();
    this.stageBackdrops.clear();
    this.controls.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
