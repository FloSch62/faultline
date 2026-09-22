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
import type { Enemy, NetworkNode, Role, Topology, Zone } from "../core/types.ts";

export type WorldPoint = { x: number; z: number };
export type BoardZone = Zone;
export interface WorldCallbacks {
  onGround: (point: WorldPoint) => void;
  onNode: (id: string) => void;
  onLink: (key: string) => void;
  onMove: (id: string, point: WorldPoint, finished: boolean) => void;
}
type DeviceGroup = THREE.Group & {
  userData: {
    nodeId: string;
    rings: THREE.Object3D[];
    floaters: THREE.Object3D[];
  };
};
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
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  life: number;
  duration: number;
  scale: number;
}
interface CableVisual {
  body: THREE.MeshPhysicalMaterial;
  filament: THREE.MeshBasicMaterial;
  haze: THREE.MeshBasicMaterial;
  color: number;
  faulty: boolean;
  source: string;
}

const COLORS: Record<Role, number> = {
  client: 0xe2c184,
  router: 0x91c9bf,
  switch: 0xa0b8ca,
  firewall: 0xda9e69,
};
const snap = (n: number) => Math.round(n * 2) / 2;

function mat(
  color: number,
  emissive = 0x000000,
  intensity = 0,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.64,
    roughness: 0.53,
    clearcoat: 0.12,
    clearcoatRoughness: 0.48,
    emissive,
    emissiveIntensity: intensity,
  });
}
function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
}
function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  sides: number,
  material: THREE.Material,
  y: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides),
    material,
  );
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function ring(
  radius: number,
  tube: number,
  color: number,
  y: number,
  opacity = 1,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 64),
    glow(color, opacity),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly antialias: ShaderPass;
  private readonly environment: THREE.WebGLRenderTarget;
  private enemySprite!: THREE.Sprite;
  private enemyTexture!: THREE.Texture;
  private enemyAlphaTexture!: THREE.Texture;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: WorldCallbacks;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly board = new THREE.Group();
  private readonly dynamic = new THREE.Group();
  private readonly enemyGroup = new THREE.Group();
  private readonly ambiance = new THREE.Group();
  private readonly hitObjects: THREE.Object3D[] = [];
  private readonly devices = new Map<string, DeviceGroup>();
  private readonly cableCurves = new Map<string, THREE.Curve<THREE.Vector3>>();
  private readonly cableVisuals = new Map<string, CableVisual>();
  private readonly signalSources = new Map<string, string>();
  private readonly alternateSources = new Map<string, string>();
  private routeSignature = "";
  private forecastTarget: string | null = null;
  private readonly forecastMarker = new THREE.Group();
  private readonly zoneVisuals = new Map<BoardZone, {
    fill: THREE.MeshBasicMaterial;
    label: THREE.MeshBasicMaterial;
    warning: THREE.Mesh;
    color: number;
  }>();
  private forecastZone: BoardZone | null = null;
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
  private scanMaterial!: THREE.ShaderMaterial;
  private readonly enemyCore: THREE.Group;
  private readonly enemyShell: THREE.Group;
  private readonly light: THREE.PointLight;
  private packets: FlyingPacket[] = [];
  private sparks: Spark[] = [];
  private pulses: SignalPulse[] = [];
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

  constructor(canvas: HTMLCanvasElement, callbacks: WorldCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const backdrop = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}art/relay-interior.png`,
    );
    backdrop.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = backdrop;
    this.scene.backgroundIntensity = 0.65;
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
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.environment = pmrem.fromScene(roomEnvironment, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.35;
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
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.37, 0.28, 0.95),
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
    this.scene.add(this.dynamic);
    this.enemyCore = new THREE.Group();
    this.enemyShell = new THREE.Group();
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
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.44 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform float uTime; uniform float uAlpha; varying vec2 vUv;
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
    const points = new THREE.Points(
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
    this.ambiance.add(points);
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
    this.scene.add(this.ambiance);
  }

  private buildPlacement(): THREE.Group {
    const group = new THREE.Group();
    group.add(ring(0.84, 0.022, 0x80ffe6, 0.65, 0.9));
    group.add(ring(0.59, 0.012, 0x80ffe6, 0.67, 0.55));
    const disc = cylinder(0.57, 0.57, 0.015, 32, glow(0x72eedd, 0.1), 0.66);
    group.add(disc);
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
      group.add(dash);
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
    this.enemyGroup.position.set(0, 1.2, -6.4);
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
    this.enemySprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.enemyTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.enemySprite.scale.set(4.3, 4.3, 1);
    this.enemyGroup.add(this.enemySprite);
    const enemyLight = new THREE.PointLight(0xe9a05c, 20, 9, 2);
    this.enemyGroup.add(enemyLight);
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
    context.font = "600 32px Barlow Condensed, sans-serif";
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

  private createDevice(node: NetworkNode): DeviceGroup {
    const group = new THREE.Group() as DeviceGroup;
    group.userData = { nodeId: node.id, rings: [], floaters: [] };
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

    if (node.role === "client") {
      group.add(cylinder(0.46, 0.54, 0.48, 8, dark, 1.2));
      group.add(cylinder(0.49, 0.49, 0.07, 8, trim, 1.48));
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.54, 0.24),
          mat(0x5b7187),
        );
        const angle = (i * Math.PI) / 2;
        fin.position.set(Math.sin(angle) * 0.4, 1.29, Math.cos(angle) * 0.4);
        fin.rotation.y = angle;
        group.add(fin);
      }
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 1),
        luminous,
      );
      orb.position.y = 1.89;
      group.add(orb);
      group.userData.floaters.push(orb);
      const halo = ring(0.5, 0.023, color, 1.72, 0.75);
      group.add(halo);
      group.userData.rings.push(halo);
      group.add(cylinder(0.08, 0.08, 0.37, 8, luminous, 1.68));
    } else if (node.role === "router") {
      group.add(cylinder(0.53, 0.59, 0.5, 6, dark, 1.23));
      group.add(cylinder(0.51, 0.51, 0.075, 6, luminous, 1.52));
      const floatingRing = ring(0.62, 0.047, color, 1.85, 0.92);
      group.add(floatingRing);
      group.userData.rings.push(floatingRing);
      const spindle = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.25, 0),
        luminous,
      );
      spindle.position.y = 1.9;
      group.add(spindle);
      group.userData.floaters.push(spindle);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const port = new THREE.Mesh(
          new THREE.BoxGeometry(0.17, 0.09, 0.04),
          glow(i % 2 ? 0x62fce3 : 0x1f98ac),
        );
        port.position.set(Math.sin(angle) * 0.52, 1.22, Math.cos(angle) * 0.52);
        port.rotation.y = angle;
        group.add(port);
      }
    } else if (node.role === "switch") {
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.38, 0.68),
        dark,
      );
      chassis.position.y = 1.21;
      chassis.castShadow = true;
      group.add(chassis);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.7), trim);
      lip.position.y = 1.42;
      group.add(lip);
      for (let i = 0; i < 5; i++) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.055, 0.02),
          glow(i === 4 ? 0xf1b478 : color),
        );
        led.position.set(-0.35 + i * 0.175, 1.18, 0.35);
        group.add(led);
      }
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.018, 0.46),
        glow(color, 0.45),
      );
      plate.position.y = 1.46;
      group.add(plate);
    } else {
      const body = cylinder(0.48, 0.57, 0.61, 5, dark, 1.25);
      body.rotation.y = Math.PI / 5;
      group.add(body);
      const shield = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.48, 0),
        mat(0x593c39, color, 0.65),
      );
      shield.position.y = 1.73;
      group.add(shield);
      group.userData.floaters.push(shield);
      const field = new THREE.Mesh(
        new THREE.CylinderGeometry(0.63, 0.63, 1.18, 6, 1, true),
        glow(color, 0.11),
      );
      field.position.y = 1.43;
      group.add(field);
      group.add(ring(0.66, 0.035, color, 1.02, 0.65));
      group.add(ring(0.61, 0.03, color, 1.95, 0.65));
    }

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
    if (node.id === this.faultNode) {
      const warning = ring(1.07, 0.055, 0xff526b, 0.68, 1);
      group.add(warning);
      const red = new THREE.PointLight(0xff4366, 9, 3, 2);
      red.position.y = 1.5;
      group.add(red);
    }
    const label = this.makeLabel(
      `${node.id.toUpperCase()}${node.id === this.faultNode ? " · JAMMED" : node.upgraded ? " · UPGRADED" : node.amplified ? " · AMPLIFIED" : node.shielded ? " · GUARDED" : ""}`,
      node.id === this.faultNode ? 0xff6880 : color,
    );
    label.position.y = node.role === "client" ? 3.0 : 2.86;
    group.add(label);
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
    return group;
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
          if ("map" in material && material.map instanceof THREE.Texture)
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
    if (!sameBattle) this.deviceStates.clear();
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
      const expansion = enemy.id === "wraith" || enemy.id === "storm";
      const texture = expansion ? this.enemyAlphaTexture : this.enemyTexture;
      const variant = expansion ? Number(enemy.id === "storm") : enemy.id === "core" ? 2 : enemy.id === "sentinel" ? 1 : 0;
      texture.offset.x = variant / (expansion ? 2 : 3);
      if (this.enemySprite.material.map !== texture) {
        this.enemySprite.material.map = texture;
        this.enemySprite.material.needsUpdate = true;
      }
      this.enemySprite.scale.setScalar(enemy.id === "core" ? 5.0 : enemy.id === "storm" ? 4.6 : 4.3);
      (this.enemyGroup.children[1] as THREE.PointLight).color.setHex(
        enemy.color,
      );
    }
    this.refreshSelection();
    this.refreshSignalRoute();
    this.refreshForecastTarget();
  }

  /** Emphasizes the forecast's chosen routes without rebuilding cable geometry. */
  setSignalRoute(path: string[], alternate: string[] = []) {
    const signature = JSON.stringify([path, alternate]);
    if (signature === this.routeSignature) return;
    this.routeSignature = signature;
    this.signalSources.clear();
    this.alternateSources.clear();
    for (let index = 0; index < path.length - 1; index++)
      this.signalSources.set(linkKey(path[index], path[index + 1]), path[index]);
    for (let index = 0; index < alternate.length - 1; index++)
      this.alternateSources.set(linkKey(alternate[index], alternate[index + 1]), alternate[index]);
    this.refreshSignalRoute();
  }

  private refreshSignalRoute() {
    const hasRoute = this.signalSources.size > 0;
    for (const [key, visual] of this.cableVisuals) {
      const primary = this.signalSources.has(key);
      const alternate = this.alternateSources.has(key);
      const color = visual.faulty ? 0xec755d : primary ? 0x91e5ce : alternate ? 0x96accd : visual.color;
      visual.body.emissive.setHex(color);
      visual.body.emissiveIntensity = visual.faulty ? 0.18 : primary ? 0.75 : alternate ? 0.45 : hasRoute ? 0.15 : 0.34;
      visual.filament.color.setHex(color);
      visual.filament.opacity = visual.faulty ? 0.4 : primary ? 1 : alternate ? 0.85 : hasRoute ? 0.38 : 0.95;
      visual.haze.color.setHex(color);
      visual.haze.opacity = visual.faulty ? 0.075 : primary ? 0.13 : alternate ? 0.07 : hasRoute ? 0.025 : 0.055;
    }
    for (const item of this.cableBeads) {
      const visual = this.cableVisuals.get(item.key)!;
      const source = this.signalSources.get(item.key) ?? this.alternateSources.get(item.key);
      item.routed = source !== undefined;
      item.reversed = source !== undefined && source !== visual.source;
      item.bead.material.color.copy(visual.filament.color);
      item.bead.material.opacity = visual.faulty ? 0.12 : item.routed ? 0.95 : hasRoute ? 0.25 : 0.8;
    }
  }

  /** Static segmented coral marker: distinct from a fault that has already happened. */
  setForecastTarget(target: string | null) {
    if (target === this.forecastTarget) return;
    this.forecastTarget = target;
    this.refreshForecastTarget();
  }

  /** Marks the announced storm band without motion or geometry replacement. */
  setForecastZone(zone: BoardZone | null) {
    if (zone === this.forecastZone) return;
    this.forecastZone = zone;
    for (const [id, visual] of this.zoneVisuals) {
      const danger = id === zone;
      visual.fill.color.setHex(danger ? 0xc35e4d : visual.color);
      visual.fill.opacity = danger ? 0.18 : 0.045;
      visual.label.color.setHex(danger ? 0xffb39a : visual.color);
      visual.label.opacity = danger ? 1 : 0.72;
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

  private pulseAt(x: number, z: number, color: number, scale = 1) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.027, 6, 56),
      glow(color, 0.8),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.3, z);
    this.scene.add(mesh);
    const duration = this.reducedMotion() ? 0.2 : 0.85;
    this.pulses.push({ mesh, life: duration, duration, scale });
  }

  pulseNetwork(effect: "shield" | "repair" | "surge") {
    const color = effect === "shield" ? 0xffd590 : effect === "repair" ? 0x83eec7 : 0x8ce6ef;
    for (const node of this.topology.nodes) this.pulseAt(node.x, node.z, color);
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
    for (const [id, group] of this.devices) {
      const active = id === this.selected || id === this.linkSource;
      const skirt = group.userData.rings[0] as THREE.Mesh;
      if (skirt) {
        skirt.scale.setScalar(active ? 1.15 : 1);
        (skirt.material as THREE.MeshBasicMaterial).opacity = active ? 1 : 0.8;
      }
    }
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
  previewAt(clientX: number, clientY: number) {
    const point = this.pointFromScreen(clientX, clientY);
    this.placement.visible = Boolean(this.placementRole && point);
    if (point) this.placement.position.set(point.x, 0, point.z);
  }
  private hit(event: PointerEvent) {
    this.updateRay(event);
    const object = this.raycaster.intersectObjects(this.hitObjects, false)[0]
      ?.object;
    return {
      node: object?.userData.nodeId as string | undefined,
      link: object?.userData.linkKey as string | undefined,
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
    if (hit.node && !this.placementRole && !this.linkSource) {
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
    }
  };
  private onPointerMove = (event: PointerEvent) => {
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
        if (point) this.callbacks.onMove(this.pointerDown.id, point, false);
        this.canvas.style.cursor = "grabbing";
      }
      return;
    }
    this.previewAt(event.clientX, event.clientY);
    if (!this.placementRole && !this.linkSource)
      this.canvas.style.cursor = this.hit(event).node ? "pointer" : "grab";
  };
  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    this.controls.enabled = true;
    if (down?.moved && down.id) {
      const point = this.pointFromScreen(event.clientX, event.clientY);
      if (point) this.callbacks.onMove(down.id, point, true);
      return;
    }
    if (!down || (down.moved && !down.id)) return;
    const hit = this.hit(event);
    if (hit.node) this.callbacks.onNode(hit.node);
    else if (hit.link) this.callbacks.onLink(hit.link);
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

  playPacket(path: string[], onDone?: () => void, color = 0x8affea) {
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
    const count = reduced ? 1 : 4;
    for (let i = 0; i < count; i++) {
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
        done: i === count - 1 ? onDone : undefined,
      });
    }
  }
  impact(color = 0xff7c91, count = 28) {
    if (this.reducedMotion()) {
      this.pulseAt(0, -5.4, color, 1.7);
      return;
    }
    const origin = this.enemyGroup.position
      .clone()
      .add(new THREE.Vector3(0, 0.3, 0));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.035 + Math.random() * 0.065),
        glow(color),
      );
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 6,
      );
      this.sparks.push({ mesh, velocity, life: 0.55 + Math.random() * 0.45 });
    }
    this.light.color.setHex(color);
    this.light.intensity = 70;
    this.impactEndsAt = performance.now() + 280;
  }
  pulseThreat() {
    for (const node of this.topology.nodes)
      if (node.fixed) this.pulseAt(node.x, node.z, 0xff7869, 1.4);
  }
  setVisible(visible: boolean) {
    if (this.visible && !visible) this.clearTransientEffects();
    this.visible = visible;
  }

  private clearTransientEffects() {
    for (const effect of [...this.packets, ...this.sparks, ...this.pulses]) {
      this.scene.remove(effect.mesh);
      this.disposeObject(effect.mesh);
    }
    // Abandon callbacks with their encounter; they must not fire in a later battle.
    this.packets = [];
    this.sparks = [];
    this.pulses = [];
    this.impactEndsAt = 0;
    this.light.color.setHex(0x4be7cf);
    this.light.intensity = 24;
  }
  resetCamera() {
    this.camera.position.set(0, 12.8, 18.8);
    this.controls.target.set(0, 0.15, -0.3);
    this.controls.update();
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
    for (const group of this.devices.values()) {
      for (const [index, floater] of group.userData.floaters.entries()) {
        floater.rotation.y += motion * (index % 2 ? -0.5 : 0.65);
        floater.position.y +=
          Math.sin(time * 2 + group.position.x + index) * motion * 0.035;
      }
      for (const [index, decorativeRing] of group.userData.rings.entries()) {
        if (index > 0)
          decorativeRing.rotation.z += motion * (index % 2 ? -0.35 : 0.35);
      }
    }
    for (const item of this.cableBeads) {
      if (item.active && !reducedMotion) {
        const progress = (time * (item.routed ? 0.28 : 0.15) + item.offset) % 1;
        item.bead.position.copy(
          item.curve.getPoint(item.reversed ? 1 - progress : progress),
        );
      }
    }
    this.enemyShell.rotation.y += motion * 0.26;
    this.enemyShell.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.7) * 0.08;
    this.enemyCore.rotation.y -= motion * 0.7;
    this.enemyCore.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 3.3) * 0.055);
    this.enemyGroup.position.y =
      1.2 + (reducedMotion ? 0 : Math.sin(time * 1.2) * 0.09);
    this.enemySprite.material.rotation = reducedMotion
      ? 0
      : Math.sin(time * 0.7) * 0.015;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
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
    this.composer.render();
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
    this.disposeObject(this.scene);
    this.scene.clear();
    this.hitObjects.length = 0;
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
