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
import { linkKey } from "../core/graph.ts";
import type { Enemy, Malware, NetworkNode, Role, Terrain, Topology, Zone, ZoneEffect } from "../core/types.ts";
import type { Intent } from "../core/run.ts";
import { ENEMIES } from "../core/enemies.ts";
import { EnemyActor } from "./EnemyActor.ts";
import { cylinder, glow, mat, ring } from "./materials.ts";
import { COLORS, addRoleBody, addSalvageScrap, animateDevice, newDeviceGroup, type DeviceGroup } from "./devices.ts";
import { MALWARE_COLOR, animateProp, buildDebris, buildMalware, buildMalwareGhost, type PropGroup } from "./props.ts";

export type WorldPoint = { x: number; z: number };
export type BoardZone = Zone;
export interface WorldCallbacks {
  onGround: (point: WorldPoint) => void;
  onNode: (id: string) => void;
  onLink: (key: string) => void;
  onMove: (id: string, point: WorldPoint | null, finished: boolean) => void;
  /** A planted malware node was clicked (scrub it). */
  onMalware?: (id: string) => void;
}
/** Anything that may appear in an enemy intent, including kinds added by later rules. */
type ActionKind = Intent["kind"] | "infect";
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
interface CableVisual {
  body: THREE.MeshPhysicalMaterial;
  filament: THREE.MeshBasicMaterial;
  haze: THREE.MeshBasicMaterial;
  color: number;
  faulty: boolean;
  source: string;
}

/** Primary route is gold; every other independent channel is cyan. */
export const CHANNEL_COLORS = { primary: 0xf2c46d, secondary: 0x6fe0f0 } as const;
/** The hostile rises from behind the far rail: the table hides its lower body and its
 * crown reaches the header band. Sized so the head stays on screen from 1280×720 up. */
const ENEMY_HOME = new THREE.Vector3(0, 0.7, -10.6);
const enemyHome = (size: number) => ENEMY_HOME.clone().setY(ENEMY_HOME.y - (size - 10.5) * 0.3);
const snap = (n: number) => Math.round(n * 2) / 2;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly antialias: ShaderPass;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly enemyActor = new EnemyActor();
  private readonly enemySprite = this.enemyActor.mesh;
  private enemyTexture!: THREE.Texture;
  private enemyAlphaTexture!: THREE.Texture;
  private enemyFieldTexture!: THREE.Texture;
  private enemyExpeditionTexture!: THREE.Texture;
  private guardianTexture!: THREE.Texture;
  private enemyLight!: THREE.PointLight;
  private enemyUnderLight!: THREE.PointLight;
  private enemySize = 10.5;
  /** World units the hostile sinks behind the far rail so its head stays in frame. */
  private enemyDrop = 0;
  private enemyBoss = false;
  private enemyHitAt = 0;
  private enemyAction: {
    kind: ActionKind; start: number; duration: number;
    effect: THREE.Group; target: THREE.Vector3; origin: THREE.Vector3;
    impacted: boolean; done: () => void; onImpact: () => void;
  } | null = null;
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
  private readonly malwareGroup = new THREE.Group();
  private readonly enemyGroup = new THREE.Group();
  private readonly ambiance = new THREE.Group();
  private motes!: THREE.Points;
  private readonly shafts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly hitObjects: THREE.Object3D[] = [];
  private readonly malwareHits: THREE.Object3D[] = [];
  private readonly devices = new Map<string, DeviceGroup>();
  private readonly cableCurves = new Map<string, THREE.Curve<THREE.Vector3>>();
  private readonly cableVisuals = new Map<string, CableVisual>();
  /** linkKey → { travel direction source, channel index (0 = primary) } */
  private readonly channelSources = new Map<string, { source: string; channel: number }>();
  private readonly channelNodes = new Map<string, number>();
  private channelPaths: string[][] = [];
  private routeSignature = "";
  private online: Set<string> | null = null;
  private terrainSignature = "";
  private malwareSignature = "";
  private terrain: Terrain | null = null;
  private malware: Malware[] = [];
  private malwareForecast: { x: number; z: number } | null = null;
  /** Last known malware positions, so a scrub effect can play after removal. */
  private readonly malwareSpots = new Map<string, WorldPoint>();
  private forecastTarget: string | null = null;
  private readonly forecastMarker = new THREE.Group();
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
  private readonly placement: THREE.Group;
  private placementMaterials: THREE.MeshBasicMaterial[] = [];
  private scanMaterial!: THREE.ShaderMaterial;
  private readonly light: THREE.PointLight;
  private packets: FlyingPacket[] = [];
  private sparks: Spark[] = [];
  private pulses: SignalPulse[] = [];
  private bolts: Bolt[] = [];
  private readonly deviceStates = new Map<string, string>();
  private battleIdentity: string | null = null;
  private topology: Topology = { nodes: [], links: [] };
  private enemy: Enemy | null = null;
  private faultNode: string | null = null;
  private faultLink: string | null = null;
  private selected: string | null = null;
  private placementRole: Role | null = null;
  private linkSource: string | null = null;
  private pointerDown: {
    id: string | null;
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;
  private active = true;
  private visible = true;
  private frame = 0;
  private impactEndsAt = 0;
  private shake = { until: 0, power: 0, duration: 1 };
  private readonly cameraRest = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, callbacks: WorldCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const backdrop = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}art/relay-interior.png`,
    );
    backdrop.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = backdrop;
    this.scene.backgroundIntensity = 0.62;
    this.camera.position.set(0, 12.8, 18.8);
    this.camera.lookAt(0, 0.2, -0.4);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
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
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.3, 0.95),
    );
    this.composer.addPass(new OutputPass());
    this.antialias = new ShaderPass(FXAAShader);
    this.composer.addPass(this.antialias);

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
    this.buildTable();
    this.buildAmbiance();
    this.placement = this.buildPlacement();
    this.scene.add(this.placement);
    this.buildForecastMarker();
    this.scene.add(this.forecastMarker);
    this.scene.add(this.terrainGroup);
    this.scene.add(this.malwareGroup);
    this.scene.add(this.dynamic);
    this.buildEnemy();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.onPointerDown, true);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.tick();
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
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = "600 88px Barlow Condensed, sans-serif";
    context.fillText(text, 256, 64, 488);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
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

  private buildForecastMarker() {
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
      this.forecastMarker.add(arc);
    }
    this.forecastMarker.visible = false;
  }

  private buildEnemy() {
    this.enemyGroup.position.copy(ENEMY_HOME);
    this.enemyTexture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}art/hostiles.png`,
    );
    this.enemyTexture.colorSpace = THREE.SRGBColorSpace;
    this.enemyTexture.repeat.set(1 / 3, 1);
    this.enemyTexture.offset.set(0, 0);
    this.enemyAlphaTexture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}art/hostiles-alpha.png`,
    );
    this.enemyAlphaTexture.colorSpace = THREE.SRGBColorSpace;
    this.enemyAlphaTexture.repeat.set(1 / 2, 1);
    this.enemyAlphaTexture.offset.set(0, 0);
    this.enemyFieldTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/hostiles-zones.png`);
    this.enemyFieldTexture.colorSpace = THREE.SRGBColorSpace;
    this.enemyFieldTexture.repeat.set(1 / 3, 1);
    this.enemyExpeditionTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/hostiles-expedition.png`);
    this.enemyExpeditionTexture.colorSpace = THREE.SRGBColorSpace;
    this.guardianTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/stage-guardians.png`);
    this.guardianTexture.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [this.enemyTexture, this.enemyAlphaTexture, this.enemyFieldTexture, this.enemyExpeditionTexture, this.guardianTexture])
      texture.anisotropy = 4;
    this.enemySprite.material.map = this.enemyTexture;
    this.enemySprite.scale.setScalar(this.enemySize);
    this.enemyGroup.add(this.enemySprite);
    this.enemyGroup.add(this.enemyActor.embers);
    // A coloured spill across the far rail, and a low glow that lifts the body from below.
    this.enemyLight = new THREE.PointLight(0xe9a05c, 26, 13, 1.6);
    this.enemyLight.position.set(0, 0.2, 3.8);
    this.enemyGroup.add(this.enemyLight);
    this.enemyUnderLight = new THREE.PointLight(0xe9a05c, 18, 8, 2);
    this.enemyUnderLight.position.set(0, -1.6, 1.4);
    this.enemyGroup.add(this.enemyUnderLight);
    this.scene.add(this.enemyGroup);
    this.enemyGroup.visible = false;
  }

  private makeLabel(name: string, color: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(12, 17, 20, .93)";
    context.beginPath();
    context.moveTo(34, 22);
    context.lineTo(478, 22);
    context.lineTo(490, 34);
    context.lineTo(490, 78);
    context.lineTo(478, 90);
    context.lineTo(34, 90);
    context.lineTo(22, 78);
    context.lineTo(22, 34);
    context.closePath();
    context.fill();
    context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#effcff";
    context.font = "600 44px Barlow Condensed, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name.slice(0, 26), 256, 57, 428);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.scale.set(2.5, 0.57, 1);
    return sprite;
  }

  private isOnline(node: NetworkNode) {
    // A honeypot works offline: any cable makes it a live decoy.
    if (node.role === "honeypot") return this.isCabled(node);
    return node.fixed || !this.online || this.online.has(node.id);
  }

  private isCabled(node: NetworkNode) {
    return this.topology.links.some((link) => link.a === node.id || link.b === node.id);
  }

  private deviceLabel(node: NetworkNode): THREE.Sprite {
    const online = this.isOnline(node);
    const jammed = node.id === this.faultNode;
    const status = jammed ? " · JAMMED"
      : !online && node.salvage ? " · SALVAGE"
      : node.role === "honeypot" ? online ? " · DECOY" : " · UNCABLED"
      : !online ? " · OFFLINE"
      : node.upgraded ? " · UPGRADED"
      : node.amplified ? " · AMPLIFIED"
      : node.stateful ? " · STATEFUL"
      : node.shielded ? " · GUARDED" : "";
    const color = jammed ? 0xff6880 : !online ? node.salvage ? 0xc9874a : 0x7f898d : COLORS[node.role];
    const label = this.makeLabel(`${node.id.toUpperCase()}${status}`, color);
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
    const skirt = ring(node.fixed ? 0.98 : 0.81, 0.028, color, 0.78, 0.8);
    group.add(skirt);
    group.userData.rings.push(skirt);
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.91, 1.12, 0.7, 20, 1, true),
      glow(color, 0.06),
    );
    aura.position.y = 0.78;
    group.add(aura);

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
    if (node.id === this.faultNode) {
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
    const skirt = group.userData.rings[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (!skirt) return;
    const id = group.userData.nodeId;
    const active = id === this.selected || id === this.linkSource;
    const channel = this.channelNodes.get(id);
    const color = channel === undefined || group.userData.role === "client"
      ? group.userData.skirtColor
      : channel === 0 ? CHANNEL_COLORS.primary : CHANNEL_COLORS.secondary;
    skirt.material.color.setHex(color);
    skirt.scale.setScalar(active ? 1.15 : 1);
    skirt.material.opacity = active ? 1 : group.userData.online ? channel === undefined ? 0.8 : 1 : 0.35;
  }

  private addCable(a: string, b: string) {
    const from = this.topology.nodes.find((node) => node.id === a);
    const to = this.topology.nodes.find((node) => node.id === b);
    if (!from || !to) return;
    const start = new THREE.Vector3(from.x, 0.62, from.z);
    const end = new THREE.Vector3(to.x, 0.62, to.z);
    const center = start.clone().add(end).multiplyScalar(0.5);
    center.y += Math.min(0.38 + start.distanceTo(end) * 0.07, 1.13);
    const curve = new THREE.QuadraticBezierCurve3(start, center, end);
    const key = linkKey(a, b);
    const link = this.topology.links.find((edge) => linkKey(edge.a, edge.b) === key);
    const faulty = key === this.faultLink;
    const color = faulty ? 0xec755d : link?.boosted ? 0x8ce6ef : link?.armored ? 0xf5d196 : 0xe4c58f;
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
    this.dynamic.add(cable);
  }

  private disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Points || child instanceof THREE.Line) {
        // Sprite geometry is shared internally by Three.js; its material is owned here.
        if (!(child instanceof THREE.Sprite)) geometries.add(child.geometry);
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

  setBattle(
    topology: Topology,
    enemy: Enemy | null,
    faultNode: string | null,
    faultLink: string | null,
  ) {
    const identity = enemy ? `${enemy.id}:${enemy.maxHp}` : null;
    const sameBattle = this.battleIdentity === identity && enemy !== null;
    const previousFault = this.faultNode;
    if (!sameBattle) {
      this.deviceStates.clear();
      this.online = null;
    }
    this.battleIdentity = identity;
    this.topology = topology;
    this.enemy = enemy;
    this.faultNode = faultNode;
    this.faultLink = faultLink;
    for (const item of [...this.dynamic.children]) {
      this.dynamic.remove(item);
      this.disposeObject(item);
    }
    this.hitObjects.length = 0;
    this.devices.clear();
    this.cableCurves.clear();
    this.cableVisuals.clear();
    this.cableBeads.length = 0;
    for (const link of topology.links) this.addCable(link.a, link.b);
    for (const node of topology.nodes) {
      const group = this.createDevice(node);
      this.devices.set(node.id, group);
      this.dynamic.add(group);
      const state = `${Boolean(node.shielded)}:${Boolean(node.upgraded)}:${Boolean(node.amplified)}`;
      const previous = this.deviceStates.get(node.id);
      if (sameBattle && previous === undefined && !node.fixed)
        this.pulseAt(node.x, node.z, COLORS[node.role]);
      else if (sameBattle && previous !== undefined && previous !== state)
        this.pulseAt(node.x, node.z, node.upgraded ? 0xffd590 : 0x8ce6ef);
      if (sameBattle && node.id === faultNode && node.id !== previousFault)
        this.pulseAt(node.x, node.z, 0xff7869);
      this.deviceStates.set(node.id, state);
    }
    for (const id of this.deviceStates.keys())
      if (!topology.nodes.some((node) => node.id === id)) this.deviceStates.delete(id);
    this.enemyGroup.visible = Boolean(enemy);
    if (enemy) {
      const { art, boss } = ENEMIES[enemy.id];
      if (!sameBattle) this.enemyActor.enter(enemy.id, !!boss);
      const texture = ({ "hostiles": this.enemyTexture, "hostiles-alpha": this.enemyAlphaTexture,
        "hostiles-zones": this.enemyFieldTexture, "hostiles-expedition": this.enemyExpeditionTexture,
        "stage-guardians": this.guardianTexture })[art.file]!;
      texture.repeat.set(1 / art.columns, 1 / art.rows);
      texture.offset.set((art.index % art.columns) / art.columns, 1 - (Math.floor(art.index / art.columns) + 1) / art.rows);
      if (this.enemySprite.material.map !== texture) {
        this.enemySprite.material.map = texture;
        this.enemySprite.material.needsUpdate = true;
      }
      this.enemyBoss = !!boss;
      // Hostiles loom over the far rail; guardians fill the hall.
      this.enemySize = boss ? 11.6 : enemy.id === "storm" || enemy.id === "moth" ? 10.9 : 10.5;
      this.enemySprite.scale.setScalar(this.enemySize);
      this.frameEnemy();
      this.enemyLight.color.setHex(enemy.color);
      this.enemyUnderLight.color.setHex(enemy.color);
      this.scene.backgroundIntensity = boss ? 0.48 : 0.6;
      for (const shaft of this.shafts) shaft.material.color.setHex(enemy.color).lerp(new THREE.Color(0xffe3b0), 0.6);
      (this.scanMaterial.uniforms.uThreat.value as THREE.Color).setHex(enemy.color).multiplyScalar(boss ? 0.075 : 0.05);
    } else {
      (this.scanMaterial.uniforms.uThreat.value as THREE.Color).setHex(0x000000);
    }
    this.refreshSelection();
    this.refreshSignalRoute();
    this.refreshForecastTarget();
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

  /** Wreckage in blocked sockets. Rebuilt only when the layout changes. */
  setTerrain(terrain: Terrain | null) {
    const signature = JSON.stringify(terrain?.debris ?? null);
    this.terrain = terrain;
    if (signature === this.terrainSignature) return;
    this.terrainSignature = signature;
    for (const item of [...this.terrainGroup.children]) {
      this.terrainGroup.remove(item);
      this.disposeObject(item);
    }
    terrain?.debris.forEach((spot, index) => this.terrainGroup.add(buildDebris(spot.x, spot.z, index + 1 + Math.round(spot.x * 7 + spot.z * 13))));
  }

  /** Planted malware and the forecast socket where the enemy will plant next. */
  setMalware(malware: Malware[], forecast: { x: number; z: number } | null) {
    const signature = JSON.stringify([malware, forecast]);
    if (signature === this.malwareSignature) return;
    const previous = new Set(this.malware.map((item) => item.id));
    this.malwareSignature = signature;
    this.malware = malware.map((item) => ({ ...item }));
    this.malwareForecast = forecast ? { ...forecast } : null;
    for (const item of [...this.malwareGroup.children]) {
      this.malwareGroup.remove(item);
      this.disposeObject(item);
    }
    this.malwareHits.length = 0;
    for (const item of malware) {
      this.malwareSpots.set(item.id, { x: item.x, z: item.z });
      const { group, hit } = buildMalware(item.x, item.z, item.id, this.makeLabel("MALWARE · SCRUB", MALWARE_COLOR));
      this.malwareGroup.add(group);
      this.malwareHits.push(hit);
      if (this.visible && this.battleIdentity && !previous.has(item.id)) {
        this.pulseAt(item.x, item.z, MALWARE_COLOR, 1.6);
        this.burst(new THREE.Vector3(item.x, 1, item.z), MALWARE_COLOR, 14, 3);
      }
    }
    if (forecast) this.malwareGroup.add(buildMalwareGhost(forecast.x, forecast.z));
  }

  /** Static segmented coral marker: distinct from a fault that has already happened. */
  setForecastTarget(target: string | null) {
    if (target === this.forecastTarget) return;
    this.forecastTarget = target;
    this.refreshForecastTarget();
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

  private refreshForecastTarget() {
    this.forecastMarker.visible = false;
    if (!this.forecastTarget || !this.enemy) return;
    const device = this.topology.nodes.find((node) => node.id === this.forecastTarget);
    const cable = this.cableCurves.get(this.forecastTarget);
    if (device) {
      this.forecastMarker.position.set(device.x, 0.3, device.z);
      this.forecastMarker.scale.setScalar(1);
    } else if (cable) {
      this.forecastMarker.position.copy(cable.getPoint(0.5));
      this.forecastMarker.position.y += 0.12;
      this.forecastMarker.scale.setScalar(0.5);
    } else return;
    this.forecastMarker.visible = true;
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

  pulseNetwork(effect: "shield" | "repair" | "surge") {
    const color = effect === "shield" ? 0xffd590 : effect === "repair" ? 0x83eec7 : 0x8ce6ef;
    for (const node of this.topology.nodes) this.pulseAt(node.x, node.z, color);
  }

  /**
   * Local event on one device (or a malware id for "scrub"):
   * - trap: a honeypot absorbed a disruption; an amber bolt strikes the hostile.
   * - trigger: an armed protocol fired from this device.
   * - scrub: malware dissolves.
   */
  pulseNode(id: string, kind: "trap" | "trigger" | "scrub") {
    const node = this.topology.nodes.find((item) => item.id === id);
    const spot = node ? { x: node.x, z: node.z } : this.malwareSpots.get(id);
    if (!spot) return;
    const color = { trap: 0xffa640, trigger: 0x9ff3ff, scrub: 0xb8ffd9 }[kind];
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
    } else {
      this.pulseAt(spot.x, spot.z, color, 1.6);
      this.pulseAt(spot.x, spot.z, 0xffe0a0, 1.1, 0.14);
      this.burst(origin, color, 16, 3);
      this.launchBolt(origin, color, () => this.impact(color, 16));
    }
  }

  /** An arcing projectile from the table into the hostile's body. */
  private launchBolt(from: THREE.Vector3, color: number, done: () => void) {
    if (this.reducedMotion() || !this.enemy) { done(); return; }
    const to = this.enemyGroup.position.clone().add(new THREE.Vector3(0, this.enemySize * 0.08, 0));
    const middle = from.clone().lerp(to, 0.5);
    middle.y += 4.5;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glow(0xfff1d0)));
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), glow(color, 0.3)));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.bolts.push({ mesh, curve: new THREE.QuadraticBezierCurve3(from, middle, to), start: performance.now(), duration: 520, done });
  }

  setPlacement(role: Role | null, linkSource: string | null = null) {
    this.placementRole = role;
    this.linkSource = linkSource;
    this.placement.visible = false;
    this.refreshSelection();
    this.canvas.style.cursor = role
      ? "crosshair"
      : linkSource
        ? "cell"
        : "grab";
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
  /** Mirrors the placement rules: device spacing 1.55, wreckage and malware 1.3. */
  private socketBlocked(point: WorldPoint) {
    return this.topology.nodes.some((node) => Math.hypot(node.x - point.x, node.z - point.z) < 1.55) ||
      (this.terrain?.debris ?? []).some((spot) => Math.hypot(spot.x - point.x, spot.z - point.z) < 1.3) ||
      this.malware.some((item) => Math.hypot(item.x - point.x, item.z - point.z) < 1.3);
  }
  previewAt(clientX: number, clientY: number) {
    const point = this.pointFromScreen(clientX, clientY);
    this.placement.visible = Boolean(this.placementRole && point);
    if (point) {
      this.placement.position.set(point.x, 0, point.z);
      const blocked = this.socketBlocked(point);
      for (const material of this.placementMaterials) material.color.setHex(blocked ? 0xf07a64 : 0x80ffe6);
    }
  }
  private hit(event: PointerEvent) {
    this.updateRay(event);
    const object = this.raycaster.intersectObjects([...this.malwareHits, ...this.hitObjects], false)[0]
      ?.object;
    return {
      node: object?.userData.nodeId as string | undefined,
      link: object?.userData.linkKey as string | undefined,
      malware: object?.userData.malwareId as string | undefined,
    };
  }
  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const hit = this.hit(event);
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
    if (this.targetingZone) {
      const point = this.pointFromScreen(event.clientX,event.clientY);
      this.setZonePreview(point ? point.z < -1.3 ? "north" : point.z > 1.3 ? "south" : "center" : null);
      this.canvas.style.cursor = point ? "crosshair" : "default";
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
        this.canvas.style.cursor = "grabbing";
      }
      return;
    }
    this.previewAt(event.clientX, event.clientY);
    if (!this.placementRole && !this.linkSource) {
      const hit = this.hit(event);
      this.canvas.style.cursor = hit.node || hit.malware ? "pointer" : "grab";
    }
  };
  private onPointerUp = (event: PointerEvent) => {
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
    if (hit.malware && !this.placementRole && !this.linkSource && this.callbacks.onMalware) this.callbacks.onMalware(hit.malware);
    else if (hit.node) this.callbacks.onNode(hit.node);
    else if (hit.link && !this.targetingZone) this.callbacks.onLink(hit.link);
    else {
      const point = this.pointFromScreen(event.clientX, event.clientY);
      if (point) this.callbacks.onGround(point);
    }
  };
  private onPointerCancel = () => {
    this.cancelInteraction();
  };

  /** Ends an interrupted drag without committing a placement or movement. */
  cancelInteraction() {
    const pointerId = this.pointerDown?.pointerId;
    this.pointerDown = null;
    this.controls.enabled = true;
    this.placement.visible = false;
    this.canvas.style.cursor = "grab";
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId))
      this.canvas.releasePointerCapture(pointerId);
  }
  private onPointerLeave = () => {
    this.placement.visible = false;
  };

  playPacket(path: string[], onDone?: () => void, color = 0x8affea, count?: number) {
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

  impact(color = 0xff7c91, count = 28) {
    this.enemyHitAt = performance.now();
    if (this.reducedMotion()) {
      this.pulseAt(0, -5.4, color, 1.7);
      return;
    }
    const origin = this.enemyGroup.position
      .clone()
      .add(new THREE.Vector3(0, this.enemySize * 0.08, 1.2));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.09),
        glow(color),
      );
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.3) * 7,
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
  /** A wind-up, an action-specific projectile, and an impact at the real target. */
  playEnemyAction(kind: ActionKind, targetId: string | null, zone: Zone | null, done: () => void, quick = false, onImpact: () => void = () => {}) {
    if (this.enemyAction) return;
    const targetNode = this.topology.nodes.find(node => node.id === targetId);
    const cable = targetId ? this.cableCurves.get(targetId) : undefined;
    const target = cable ? cable.getPoint(.5) : targetNode ? new THREE.Vector3(targetNode.x, 1.2, targetNode.z)
      : kind === "infect" && this.malwareForecast ? new THREE.Vector3(this.malwareForecast.x, 1.2, this.malwareForecast.z)
      : kind === "strike" || kind === "breach" ? new THREE.Vector3(kind === "breach" ? 6 : -6, 1.2, 0)
      : zone ? new THREE.Vector3(0, .8, zone === "north" ? -2.5 : zone === "south" ? 2.5 : 0)
      : new THREE.Vector3(0, 1.2, 0);
    const colors: Record<string, number> = { strike: 0xf0ad76, breach: 0xf57968, sever: 0xf1d5a0, jam: 0xb59cec, corrupt: 0xb980c6, charge: 0xf6c486, infect: MALWARE_COLOR };
    const color = colors[kind] ?? 0xf0ad76;
    const effect = new THREE.Group();
    if (kind === "sever") {
      for (const angle of [-.65, .65]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(.1, 2.2, .08), glow(color));
        blade.rotation.z = angle; effect.add(blade);
      }
    } else if (kind === "jam" || kind === "corrupt" || kind === "charge") {
      for (let i = 0; i < 3; i++) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(.26 + i * .16, .03, 6, 40), glow(color, .85));
        halo.rotation.set(i * .6, i * .7, 0); effect.add(halo);
      }
    } else if (kind === "infect") {
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
    const origin = this.enemyGroup.position.clone(); origin.y += this.enemySize * .06; origin.z += 1.4;
    if (kind === "charge") target.copy(origin);
    effect.position.copy(origin); effect.visible = false;
    this.scene.add(effect);
    this.enemyAction = { kind, target, origin, effect, start: performance.now(), duration: quick || this.reducedMotion() ? 160 : kind === "breach" ? 1150 : 920, impacted: false, done, onImpact };
    this.canvas.dataset.enemyAction = kind;
  }

  private animateEnemy(now: number, time: number, reduced: boolean) {
    const action = this.enemyAction;
    const hurt = this.enemyHitAt ? Math.max(0, 1 - (now - this.enemyHitAt) / 420) : 0;
    const attack = action ? Math.min(1, (now - action.start) / action.duration) : null;
    const enraged = !!this.enemy && !!ENEMIES[this.enemy.id].enrages && this.enemy.hp <= this.enemy.maxHp / 2;
    this.enemyGroup.position.copy(enemyHome(this.enemySize));
    this.enemyGroup.position.y -= this.enemyDrop;
    if (!reduced) this.enemyGroup.position.z -= hurt * .7;
    const state = this.enemyActor.update(this.camera, now, time, reduced, this.enemySize,
      this.enemy?.color ?? 0xffffff, enraged, hurt, attack, action?.kind);
    if (this.visible) this.canvas.dataset.enemyState = state;
    if (enraged) this.canvas.dataset.enemyEnraged = "true";
    else delete this.canvas.dataset.enemyEnraged;
    // A slow heartbeat in its light; guardians beat harder.
    const heartbeat = reduced ? 0 : Math.pow(Math.max(0, Math.sin(time * (this.enemyBoss ? 1.6 : 1.3))), 8);
    this.enemyLight.intensity = (this.enemyBoss ? 34 : 24) * (1 + heartbeat * .6 + (enraged ? .35 : 0));
    this.enemyUnderLight.intensity = (this.enemyBoss ? 26 : 18) * (1 + heartbeat * .4);
    if (!action) return;
    const t = Math.min(1, (now - action.start) / action.duration);
    const charge = Math.sin(Math.min(1, t / .5) * Math.PI / 2);
    // Anticipation: it rears back and rises before committing.
    const rear = Math.sin(Math.min(1, t / .36) * Math.PI);
    const lunge = Math.sin(Math.max(0, (t - .36) / .64) * Math.PI);
    if (!reduced) {
      const heavy = action.kind === "breach" ? 1.35 : 1;
      this.enemyGroup.position.z -= rear * .9 * heavy;
      this.enemyGroup.position.y += rear * .45 * heavy;
      if (action.kind === "strike" || action.kind === "breach") {
        this.enemyGroup.position.z += lunge * (action.kind === "breach" ? 3.4 : 2.5);
        this.enemyGroup.position.y -= lunge * .55;
      } else if (action.kind === "sever") {
        this.enemyGroup.position.z += lunge * 1.6;
        this.enemyGroup.position.x += Math.sin(Math.max(0, (t - .36) / .64) * Math.PI * 2) * .7;
      } else this.enemyGroup.position.y += Math.sin(t * Math.PI) * .6;
      action.effect.visible = t > .28 && t < .86;
      action.effect.position.lerpVectors(action.origin, action.target, Math.min(1, Math.max(0, (t - .28) / .5)));
      action.effect.rotation.set(t * 5, t * 7, action.kind === "sever" ? t * 2 : t * 6);
      action.effect.scale.setScalar(.6 + charge * .8);
    }
    this.enemySprite.material.color.lerp(new THREE.Color(this.enemy?.color ?? 0xff9999), Math.sin(t * Math.PI) * .3);
    if (t >= .78 && !action.impacted) {
      action.impacted = true;
      action.onImpact();
      if (action.kind !== "charge") {
        this.pulseAt(action.target.x, action.target.z, this.enemy?.color ?? 0xff9999, action.kind === "breach" ? 2 : 1.4);
        this.burst(action.target.clone(), ({ strike: 0xf0ad76, breach: 0xf57968 } as Record<string, number>)[action.kind] ?? this.enemy?.color ?? 0xff9999, action.kind === "breach" ? 18 : 10, 2.6);
      }
      if (action.kind === "strike" || action.kind === "breach") this.shakeCamera(action.kind === "breach" ? .2 : .12, action.kind === "breach" ? 420 : 280);
      if (action.kind === "corrupt" && this.forecastZone) this.pulseZone(this.forecastZone, "corrupt");
    }
    if (t >= 1) {
      this.scene.remove(action.effect); this.disposeObject(action.effect);
      this.enemyAction = null;
      delete this.canvas.dataset.enemyAction;
      action.done();
    }
  }
  playEnemyTransition(kind: "enrage" | "death" | "break", done: () => void, quick = false) {
    if (!this.enemy) { done(); return; }
    this.canvas.dataset.enemyState = kind;
    this.pulseAt(0, -5.3, this.enemy.color, kind === "death" ? 3.4 : 2.4);
    if (kind === "enrage") this.shakeCamera(.14, 600);
    if (kind === "death") {
      this.shakeCamera(.1, 500);
      this.burst(this.enemyGroup.position.clone().add(new THREE.Vector3(0, this.enemySize * .1, 1)), this.enemy.color, 36, 4);
    }
    this.enemyActor.transitionTo(kind, done, quick || this.reducedMotion());
  }
  setVisible(visible: boolean) {
    if (this.visible && !visible) {
      this.clearTransientEffects();
      this.battleIdentity = null;
    }
    this.visible = visible;
  }

  private clearTransientEffects() {
    if (this.enemyAction) {
      this.scene.remove(this.enemyAction.effect);
      this.disposeObject(this.enemyAction.effect);
      this.enemyAction = null;
    }
    delete this.canvas.dataset.enemyAction;
    this.enemyHitAt = 0;
    this.enemyActor.clear();
    delete this.canvas.dataset.enemyState;
    delete this.canvas.dataset.enemyEnraged;
    for (const effect of [...this.packets, ...this.sparks, ...this.pulses, ...this.bolts]) {
      this.scene.remove(effect.mesh);
      this.disposeObject(effect.mesh);
    }
    // Abandon callbacks with their encounter; they must not fire in a later battle.
    this.packets = [];
    this.sparks = [];
    this.pulses = [];
    this.bolts = [];
    this.impactEndsAt = 0;
    this.shake = { until: 0, power: 0, duration: 1 };
    this.light.color.setHex(0x4be7cf);
    this.light.intensity = 24;
  }
  resetCamera() {
    this.camera.position.set(0, 12.8, 18.8);
    this.controls.target.set(0, 0.15, -0.3);
    this.controls.update();
  }

  /** Short, wide tables crop the top of the canvas (it starts above the viewport and
   * under the header). Lower the hostile just enough that its head stays visible. */
  private frameEnemy() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.height) return;
    const limit = Math.max(0, -rect.top) / rect.height + 0.06;
    const home = enemyHome(this.enemySize);
    const crown = home.y + this.enemySize * 0.44;
    this.camera.updateMatrixWorld();
    const at = (y: number) => (1 - new THREE.Vector3(0, y, home.z).project(this.camera).y) / 2;
    const top = at(crown), perUnit = at(crown - 1) - top;
    this.enemyDrop = top >= limit || perUnit <= 0 ? 0 : Math.min(2.6, (limit - top) / perUnit);
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
    this.frameEnemy();
    const ratio = this.renderer.getPixelRatio();
    this.antialias.material.uniforms.resolution.value.set(
      1 / (width * ratio),
      1 / (height * ratio),
    );
  }
  private tick = () => {
    if (!this.active) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.impactEndsAt && performance.now() >= this.impactEndsAt) {
      this.impactEndsAt = 0;
      this.light.color.setHex(0x4be7cf);
      this.light.intensity = 24;
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
    for (const group of this.malwareGroup.children) animateProp(group as PropGroup, time, motion, reducedMotion);
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
    this.animateEnemy(performance.now(), time, reducedMotion);
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
      const elapsed = (performance.now() - packet.start) / 1000;
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
      const t = Math.min(1, (performance.now() - bolt.start) / bolt.duration);
      bolt.mesh.position.copy(bolt.curve.getPoint(t * t));
      bolt.mesh.rotation.y += dt * 9;
      if (t >= 1) {
        this.scene.remove(bolt.mesh);
        this.disposeObject(bolt.mesh);
        this.bolts.splice(i, 1);
        bolt.done();
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
    const now = performance.now();
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
    // Both atlases are owned by World, including whichever is not currently bound.
    this.enemySprite.material.map = null;
    this.enemyTexture.dispose();
    this.enemyAlphaTexture.dispose();
    this.enemyFieldTexture.dispose();
    this.enemyExpeditionTexture.dispose();
    this.guardianTexture.dispose();
    this.enemyGroup.remove(this.enemySprite, this.enemyActor.embers);
    this.enemyActor.dispose();
    this.disposeObject(this.scene);
    this.scene.clear();
    this.hitObjects.length = 0;
    this.malwareHits.length = 0;
    this.devices.clear();
    this.deviceStates.clear();
    this.cableCurves.clear();
    this.cableVisuals.clear();
    this.cableBeads.length = 0;
    this.zoneVisuals.clear();
    this.environment.dispose();
    if (this.scene.background instanceof THREE.Texture)
      this.scene.background.dispose();
    this.controls.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
