/**
 * Dev-only harness for the 3D battlefield (not part of the game build).
 * Open /dev/world-preview.html?enemy=core&scene=devices
 *   enemy   any hostile id (default leech) — the centre hostile of the devices/terrain/front scenes
 *   scene   devices | terrain | gallery | empty | trio | guardian | front (default devices)
 *           gallery: one of every role (and variants: stateful, sentry) in two rows, and a front row
 *           with the five installation bodies and the two props (crate lid ajar), for model review
 *           trio: a leader and two escorts on the rail, three channels aimed at three ports
 *           guardian: a guardian at its charge with two adds at the outer ports
 *           front: the whole table front (a Jammer, a Spike beside a worn router, a Breaker Charge at
 *           countdown 1 with its blast ring, a Siphon Tap, the ghost of the next Jammer, a fresh wreck,
 *           a Server Rack, a Sentry Firewall, a Phantom Node, a landed crate)
 *   online  0 disables the online/offline pass (everything lit)
 *   reduced 1 reduced motion
 *   focus   left | centre | right (trio/guardian)       select  a selected port (a dimmer crest)
 *   cam     x,y,z camera position and target x,y,z orbit target, for close-ups
 * `window.__world` exposes the World and `window.__preview` scripted beats for captures:
 *   __preview.transmit(), .act(port, kind), .quarantine(), .detonate(), .crate(port), .fragment(port),
 *   .arrive(), .dormant(port), .death(port), .hover(id)
 */
import * as THREE from "three";
import { World, type DeliveryView, type RailState } from "../src/three/World.ts";
import { COLORS } from "../src/three/devices.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import type { Enemy, Installation, InstallationKind, NetworkNode, Port, Terrain, Topology } from "../src/core/types.ts";
import {
  INSTALLATION_KINDS, PROP_MODELS, addInstallationBody, addPropBody, animateModelBody, loadInstallationModels, loadPropModels,
  type ModelBody,
} from "../src/three/models.ts";

const params = new URLSearchParams(location.search);
const enemyId = params.get("enemy") ?? (params.get("scene") === "front" ? "nest" : "leech");
const scene = params.get("scene") ?? "devices";
if (params.get("reduced") === "1") document.documentElement.classList.add("reduced-motion");

const reduced = params.get("reduced") === "1";

const makeHostile = (id: string, uid: string, port: Port, role: Enemy["role"], hp: number, maxHp = hp): Enemy => {
  const definition = ENEMIES[id];
  return { id, uid, name: definition.name, title: definition.title, color: definition.color, hp, maxHp, turn: 0, port, role };
};
const definition = ENEMIES[enemyId];
let enemies: Enemy[] = [makeHostile(enemyId, "h1", "centre", "single", definition.boss ? 60 : 30, definition.boss ? 110 : 40)];

const node = (id: string, role: NetworkNode["role"], x: number, z: number, extra: Partial<NetworkNode> = {}): NetworkNode =>
  ({ id, role, x, z, ...extra });
let topology: Topology = {
  nodes: [
    { id: "alpha", role: "client", x: -5.3, z: 0, fixed: true },
    { id: "omega", role: "client", x: 5.3, z: 0, fixed: true },
  ],
  links: [],
};
let terrain: Terrain | null = null;
let installations: Installation[] = [];
let forecast: { installs: { kind: InstallationKind; x: number; z: number }[] } | null = null;
let channels: string[][] = [];
let online: string[] = [];
let deliveries: DeliveryView[] = [];
let rail: RailState = { focus: "centre", selected: null, readouts: {} };
const link = (a: string, b: string, extra: object = {}) => topology.links.push({ a, b, ...extra });

if (scene === "devices" || scene === "terrain") {
  topology.nodes.push(
    node("router1", "router", -2.5, 0, { configured: true }),
    node("switch2", "switch", 0, 0, { amplified: true }),
    node("balancer3", "balancer", 2.5, 0),
    node("router4", "router", -2.5, -3.2, { upgraded: true, shielded: true }),
    node("firewall5", "firewall", 0, -3.4, { stateful: true }),
    node("power6", "power", 2.5, -3.2),
    node("router7", "router", -2.5, 3.2),
    node("cache8", "cache", 0.2, 3.4),
    node("honeypot9", "honeypot", 2.6, 3.0),
    node("switch10", "switch", 5.2, -3.6, { salvage: true }),
    node("firewall11", "firewall", -5.4, 3.7),
  );
  link("alpha", "router1"); link("router1", "switch2", { boosted: true }); link("switch2", "balancer3"); link("balancer3", "omega");
  link("alpha", "router4", { armored: true }); link("router4", "firewall5"); link("firewall5", "power6"); link("power6", "omega");
  link("alpha", "router7"); link("router7", "cache8"); link("cache8", "honeypot9");
  channels = [
    ["alpha", "router1", "switch2", "balancer3", "omega"],
    ["alpha", "router4", "firewall5", "power6", "omega"],
  ];
  online = ["router1", "switch2", "balancer3", "router4", "firewall5", "power6"];
}
if (scene === "gallery") {
  const back: [string, NetworkNode["role"], Partial<NetworkNode>][] = [
    ["router", "router", {}], ["switch", "switch", {}], ["firewall", "firewall", {}], ["stateful", "firewall", { stateful: true }],
    ["sentry", "firewall", { sentry: true }], ["rack", "rack", {}], ["phantom", "phantom", {}],
  ];
  const front: [string, NetworkNode["role"], Partial<NetworkNode>][] = [
    ["client", "client", {}], ["honeypot", "honeypot", {}], ["cache", "cache", {}], ["power", "power", {}], ["balancer", "balancer", {}],
  ];
  back.forEach(([id, role, extra], i) => topology.nodes.push(node(id, role, -6.6 + i * 2.2, -2.2, extra)));
  front.forEach(([id, role, extra], i) => topology.nodes.push(node(id, role, -4.4 + i * 2.2, 1.2, extra)));
  online = topology.nodes.map(item => item.id);
}
if (scene === "terrain") {
  terrain = { name: "Collapsed rack row", description: "Wreckage blocks two sockets.", debris: [{ x: -1.2, z: -1.6 }, { x: 4, z: 1.6 }] };
  // Two unarmored spans across the wrecks: they fray.
  topology.links.push({ a: "router1", b: "firewall5" }, { a: "honeypot9", b: "omega" });
  installations = [{ id: "malware1", kind: "tap", x: 0.8, z: 1.7, integrity: 2, activeFrom: 0, owner: "h1" }];
  forecast = { installs: [{ kind: "tap", x: -4.1, z: -1.4 }] };
}
/** Three channels: gold through R1 and SW2, cyan through R3 (north) and R4 (south). */
function threeChannels() {
  topology.nodes.push(node("r1", "router", -1.5, 0, { condition: 2 }), node("sw2", "switch", 1.5, 0, { condition: 2 }),
    node("r3", "router", 0, -2.8, { condition: 2 }), node("r4", "router", 0, 2.8, { condition: 1 }));
  link("alpha", "r1"); link("r1", "sw2"); link("sw2", "omega"); link("alpha", "r3"); link("r3", "omega"); link("alpha", "r4"); link("r4", "omega");
  channels = [["alpha", "r1", "sw2", "omega"], ["alpha", "r3", "omega"], ["alpha", "r4", "omega"]];
  online = ["r1", "sw2", "r3", "r4"];
}
const focus = (params.get("focus") as Port | null) ?? "centre";
if (scene === "trio") {
  threeChannels();
  enemies = [makeHostile("spark-mite", "h1", "left", "escort", 15), makeHostile("nest", "h2", "centre", "leader", 34), makeHostile("splicer", "h3", "right", "escort", 16)];
  deliveries = [
    { key: "r1|sw2", primary: true, path: channels[0], port: focus, aimed: false, amount: 7 },
    { key: "r3", primary: false, path: channels[1], port: "left", aimed: true, amount: 4 },
    { key: "r4", primary: false, path: channels[2], port: "right", aimed: true, amount: 4 },
  ];
  rail = {
    focus, selected: (params.get("select") as Port | null) ?? null, readouts: {
      left: { hpAfter: 11, damage: 4, overflowIn: 0, lethal: false, intent: "strike", amount: 3, state: "acts", escalation: null },
      centre: { hpAfter: 27, damage: 7, overflowIn: 0, lethal: false, intent: "install", amount: 0, state: "acts", escalation: 1 },
      right: { hpAfter: 12, damage: 4, overflowIn: 0, lethal: false, intent: "dormant", amount: 0, state: "dormant", escalation: null },
    },
  };
}
if (scene === "guardian") {
  threeChannels();
  enemies = [makeHostile("gate-warden", "h2", "left", "add", 9), makeHostile("regent", "h1", "centre", "leader", 70, 110), makeHostile("gate-warden", "h3", "right", "add", 9)];
  deliveries = [
    { key: "r1|sw2", primary: true, path: channels[0], port: "centre", aimed: false, amount: 7 },
    { key: "r3", primary: false, path: channels[1], port: "left", aimed: true, amount: 4 },
    { key: "r4", primary: false, path: channels[2], port: "left", aimed: true, amount: 4 },
  ];
  rail = {
    focus: "centre", selected: "left", readouts: {
      left: { hpAfter: 0, damage: 9, overflowIn: 0, lethal: true, intent: "strike", amount: 2, state: "cancelled", escalation: null },
      centre: { hpAfter: 63, damage: 7, overflowIn: 1, lethal: false, intent: "charge", amount: 0, state: "acts", escalation: 2 },
      right: { hpAfter: 9, damage: 0, overflowIn: 0, lethal: false, intent: "jam", amount: 0, state: "acts", escalation: null },
    },
  };
}
if (scene === "front") {
  topology.nodes.push(
    node("r1", "router", -2, 0, { condition: 1 }), node("sw2", "switch", 1.5, 0, { condition: 2 }),
    node("fw3", "firewall", 3, -3, { condition: 2, sentry: true }), node("rk4", "rack", -4, 2.8, { condition: 3 }),
    node("ph5", "phantom", 4, 3, { absorbs: 1 }), node("hp6", "honeypot", -0.5, 3.4, { condition: 2 }),
  );
  link("alpha", "r1"); link("r1", "sw2"); link("sw2", "omega"); link("sw2", "hp6");
  channels = [["alpha", "r1", "sw2", "omega"]];
  online = ["r1", "sw2", "fw3"];
  terrain = { name: "Front", description: "", debris: [{ x: -4.5, z: -3.5, fresh: true, role: "switch" }, { x: 5.5, z: -2 }] };
  installations = [
    { id: "jammer1", kind: "jammer", x: -1, z: -2.2, integrity: 2, activeFrom: 0, owner: "h1", aim: "r1" },
    { id: "spike2", kind: "spike", x: -3.4, z: 0.9, integrity: 1, activeFrom: 0, owner: "h1", aim: "r1" },
    { id: "breaker3", kind: "breaker", x: 1.2, z: 2, integrity: 1, countdown: 1, activeFrom: 0, owner: "h1", aim: "sw2" },
    { id: "tap4", kind: "tap", x: 3.6, z: -1.2, integrity: 1, activeFrom: 0, owner: "h1" },
  ];
  forecast = { installs: [{ kind: "jammer", x: 1.5, z: -2.2 }] };
}

const world = new World(document.querySelector<HTMLCanvasElement>("#world")!, {
  onGround: point => caption(`ground ${point.x}, ${point.z}`),
  onNode: id => caption(`node ${id}`),
  onLink: key => caption(`link ${key}`),
  onMove: () => {},
  onInstallation: id => { caption(`installation ${id}`); world.setInstallationFocus(id, false); },
  onPort: port => { caption(`port ${port}`); rail = { ...rail, selected: port }; world.setRail(rail); },
  onAim: (key, port) => {
    caption(`aim ${key} → ${port}`);
    deliveries = deliveries.map(item => item.key === key && port ? { ...item, port, aimed: true } : item);
    world.setDeliveries(deliveries, key);
  },
});

function caption(text: string) { document.querySelector("#caption")!.textContent = text; }
function apply() {
  world.setTerrain(terrain);
  world.setBattle(topology, scene === "empty" && params.get("enemy") === null ? null : enemies, params.get("fault") ? [params.get("fault")!] : [], []);
  world.setInstallations(installations, forecast);
  if (params.get("online") !== "0") world.setOnline(online);
  world.setChannels(channels);
  world.setZoneEffects([]);
  world.setRail(rail);
  world.setDeliveries(deliveries, null);
  if (scene === "front") world.setForecastTarget(["r1"]);
}
apply();
const vector = (value: string | null) => value?.split(",").map(Number) as [number, number, number] | undefined;
const cam = vector(params.get("cam"));
if (cam) {
  // The game keeps the camera 13.5+ away; close-ups for model review need to get nearer.
  world.controls.minDistance = 0.5;
  world.camera.position.set(...cam);
  world.controls.target.set(...(vector(params.get("target")) ?? [0, 0.8, 0]));
  world.controls.update();
}
caption(`${enemies.map(item => item.name).join(" · ")} · scene ${scene}`);
if (scene === "front") {
  // A crate that has landed beside the far rail (its lid opening).
  window.setTimeout(() => world.dropCrate("centre", { x: -1.6, z: -4.4 }, () => caption("crate open")), 600);
}
Object.assign(window, {
  __world: world,
  __preview: {
    apply,
    get topology() { return topology; }, set topology(value: Topology) { topology = value; },
    setOnline(ids: string[]) { online = ids; world.setOnline(ids); },
    setInstallations(items: Installation[], next: typeof forecast) { installations = items; forecast = next; world.setInstallations(items, next); },
    channels: () => channels,
    transmit() {
      if (enemies.length > 1) world.playTransmission(deliveries, port => world.impact(0xfbd69a, 30, port), () => caption("transmitted"));
      else world.playChannels(channels, () => world.impact(0xfbd69a, 36));
    },
    act(port: Port = "centre", kind: "strike" | "jam" | "install" | "overload" | "sever" = "strike") {
      world.playEnemyAction(kind, kind === "jam" || kind === "overload" ? "r1" : null, null, () => caption(`${port} acted`), false, () => {}, { port, point: kind === "install" ? { x: 2, z: 2.5 } : null });
    },
    quarantine() { world.playQuarantine("fw3", "tap4", false); },
    detonate() { world.playInstallationEffect({ id: "breaker3", kind: "breaker", effect: "detonate", target: null, countdown: 0 }); },
    tick() { world.playInstallationEffect({ id: "breaker3", kind: "breaker", effect: "tick", target: null, countdown: 1 }); },
    wear() { world.playInstallationEffect({ id: "spike2", kind: "spike", effect: "wear", target: "r1" }); },
    jam() { world.playInstallationEffect({ id: "jammer1", kind: "jammer", effect: "jam", target: "r1" }); },
    breakdown(id = "sw2") { world.playBreakdown(id); },
    crate(port: Port = "left") { world.dropCrate(port, { x: port === "left" ? -3 : 3, z: -4.4 }, () => caption("crate open")); },
    fragment(port: Port = "left") { world.dropFragment(port, () => caption("fragment")); },
    dormant(port: Port = "right") { world.dimPort(port); },
    death(port: Port = "left") { world.playEnemyTransition("death", () => caption(`${port} fell`), false, port); },
    arrive() { world.arrive(makeHostile("relay-drone", "h4", "left", "escort", 16)); },
    phantom() { world.playPhantom("ph5", true); },
  },
});

// Gallery front row: the installation and prop bodies straight from src/three/models.ts, each in its
// kind's palette, on the table (the code overlays of the game - pips, rings, labels - are World's).
const bodies: ModelBody[] = [];
if (scene === "gallery") {
  const shelf = new THREE.Group();
  world.scene.add(shelf);
  const spot = (index: number) => ({ x: -5.7 + index * 1.9, z: 4.3 });
  void Promise.all([loadInstallationModels(), loadPropModels()]).then(() => {
    INSTALLATION_KINDS.forEach((kind: InstallationKind, index) => {
      const group = new THREE.Group();
      const { x, z } = spot(index);
      group.position.set(x, -0.42, z);
      group.name = `installation-${kind}`;
      const body = addInstallationBody(group, kind);
      if (body) bodies.push(body);
      shelf.add(group);
    });
    PROP_MODELS.forEach((name, index) => {
      const group = new THREE.Group();
      const { x, z } = spot(INSTALLATION_KINDS.length + index);
      group.position.set(x, -0.42, z);
      group.name = `prop-${name}`;
      const body = addPropBody(group, name);
      if (body?.parts.lid) body.parts.lid.rotation.x = Number(params.get("lid") ?? -0.7);
      if (body) bodies.push(body);
      shelf.add(group);
    });
    document.querySelector("#world")?.setAttribute("data-bodies", String(bodies.length));
  });
  let last = performance.now();
  const animate = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const body of bodies) animateModelBody(body, now / 1000, reduced ? 0 : dt, reduced);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
void COLORS;
