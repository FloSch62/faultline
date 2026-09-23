/**
 * Dev-only harness for the 3D battlefield (not part of the game build).
 * Open /dev/world-preview.html?enemy=core&scene=devices
 *   enemy   any hostile id (default leech)
 *   scene   devices | terrain | empty (default devices)
 *   online  0 disables the online/offline pass (everything lit)
 * `window.__world` exposes the World for scripted captures.
 */
import { World } from "../src/three/World.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import type { Enemy, Malware, NetworkNode, Terrain, Topology } from "../src/core/types.ts";

const params = new URLSearchParams(location.search);
const enemyId = params.get("enemy") ?? "leech";
const scene = params.get("scene") ?? "devices";
if (params.get("reduced") === "1") document.documentElement.classList.add("reduced-motion");

const definition = ENEMIES[enemyId];
const enemy: Enemy = {
  id: enemyId, name: definition.name, title: definition.title, color: definition.color,
  hp: definition.boss ? 60 : 30, maxHp: definition.boss ? 110 : 40, turn: 0,
};

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
let malware: Malware[] = [];
let forecast: { x: number; z: number } | null = null;
let channels: string[][] = [];
let online: string[] = [];

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
  const link = (a: string, b: string, extra: object = {}) => topology.links.push({ a, b, ...extra });
  link("alpha", "router1"); link("router1", "switch2", { boosted: true }); link("switch2", "balancer3"); link("balancer3", "omega");
  link("alpha", "router4", { armored: true }); link("router4", "firewall5"); link("firewall5", "power6"); link("power6", "omega");
  link("alpha", "router7"); link("router7", "cache8"); link("cache8", "honeypot9");
  channels = [
    ["alpha", "router1", "switch2", "balancer3", "omega"],
    ["alpha", "router4", "firewall5", "power6", "omega"],
  ];
  online = ["router1", "switch2", "balancer3", "router4", "firewall5", "power6"];
}
if (scene === "terrain") {
  terrain = { name: "Collapsed rack row", description: "Wreckage blocks two sockets.", debris: [{ x: -1.2, z: -1.6 }, { x: 4, z: 1.6 }] };
  // Two unarmored spans across the wrecks: they fray.
  topology.links.push({ a: "router1", b: "firewall5" }, { a: "honeypot9", b: "omega" });
  malware = [{ id: "malware1", x: 0.8, z: 1.7 }];
  forecast = { x: -4.1, z: -1.4 };
}

const world = new World(document.querySelector<HTMLCanvasElement>("#world")!, {
  onGround: point => caption(`ground ${point.x}, ${point.z}`),
  onNode: id => caption(`node ${id}`),
  onLink: key => caption(`link ${key}`),
  onMove: () => {},
  onMalware: id => { caption(`malware ${id} → scrub`); world.pulseNode(id, "scrub"); },
});
function caption(text: string) { document.querySelector("#caption")!.textContent = text; }
function apply() {
  world.setTerrain(terrain);
  world.setBattle(topology, scene === "empty" && params.get("enemy") === null ? null : enemy, params.get("fault") ?? null, null);
  world.setMalware(malware, forecast);
  if (params.get("online") !== "0") world.setOnline(online);
  world.setChannels(channels);
  world.setZoneEffects([]);
}
apply();
caption(`${definition.name} · scene ${scene}`);
Object.assign(window, {
  __world: world,
  __preview: {
    apply,
    get topology() { return topology; }, set topology(value: Topology) { topology = value; },
    setOnline(ids: string[]) { online = ids; world.setOnline(ids); },
    setMalware(items: Malware[], next: { x: number; z: number } | null) { malware = items; forecast = next; world.setMalware(items, next); },
    channels: () => channels,
  },
});
