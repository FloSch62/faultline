/** Shared table rules (v4 · Under Quarantine): ports and hostiles, bands and fields,
 * sockets, installations, condition, wear and breakdown. Pure helpers over RunState;
 * nothing here consumes the RNG, so the forecast can run every one of them. */
import { CARDS, RULES, type CardDefinition } from "../cards.ts";
import { ENEMIES } from "../enemies.ts";
import { ascends } from "../ascension.ts";
import { linkKey } from "../graph.ts";
import { addWreck } from "../terrain.ts";
import type {
  CardId, Enemy, Installation, InstallationKind, NetworkNode, Port, RelicId, Role, RunState, Zone, ZoneEffect, ZoneEffectKind,
} from "../types.ts";

export const has = (run: Pick<RunState, "relics">, relic: RelicId) => run.relics.includes(relic);
export const card = (id: CardId): CardDefinition => CARDS[id];
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Adjacency (section 5.1): one radius for every reach effect. */
export const within = (a: { x: number; z: number }, b: { x: number; z: number }) => distance(a, b) <= RULES.reach + 1e-9;

// ------------------------------------------------------------------ ports and hostiles

/** The three stands on the far rail, in the order hostiles act (rule 3). */
export const PORTS: readonly Port[] = ["left", "centre", "right"];
export const byPort = (a: Enemy, b: Enemy) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port);
const leads = (enemy: Enemy) => enemy.role === "leader" || enemy.role === "single";

/** Living hostiles in port order. */
export function livingEnemies(run: RunState): Enemy[] {
  return run.enemies.filter(enemy => enemy.hp > 0).sort(byPort);
}
/** The living hostile standing at a port. */
export function enemyAt(run: RunState, port: Port | null | undefined): Enemy | null {
  return port ? run.enemies.find(enemy => enemy.port === port && enemy.hp > 0) ?? null : null;
}
/** The living leader or single: escort traits couple to it ("while a leader lives").
 * `other` excludes one hostile, so an escort never couples to itself. */
export function livingLeader(run: RunState, other?: Enemy): Enemy | null {
  return run.enemies.find(enemy => enemy.hp > 0 && leads(enemy) && enemy !== other) ?? null;
}
/** The hostile a one-enemy view shows: the centre (leader, single or guardian), else the
 * first living one; after the fight, the fallen centre. */
export function leaderOf(run: RunState): Enemy | null {
  const living = livingEnemies(run);
  return living.find(enemy => enemy.port === "centre") ?? living[0]
    ?? run.enemies.find(enemy => enemy.port === "centre") ?? run.enemies[0] ?? null;
}
/** Rule 15, at the start of a fight: the leader; without one, the hostile with the most health. */
export function startingFocus(run: RunState): Port | null {
  const living = livingEnemies(run);
  return (living.find(leads) ?? [...living].sort((a, b) => b.hp - a.hp || byPort(a, b))[0])?.port ?? null;
}
/** Rule 15, whenever the focus is not a living hostile: the leader if alive, otherwise
 * the living hostile with the lowest health (ties: port order). */
export function effectiveFocus(run: RunState): Port | null {
  if (enemyAt(run, run.focus)) return run.focus;
  const living = livingEnemies(run);
  return (living.find(leads) ?? [...living].sort((a, b) => a.hp - b.hp || byPort(a, b))[0])?.port ?? null;
}
/** Short name for pack lines: "SPARK MITE" → "Spark Mite". */
export const hostileLabel = (enemy: Enemy) => enemy.name.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, space: string, letter: string) => space + letter.toUpperCase());

/** Damage to a hostile from any source. Death side effects live here so every source
 * (transmission, traps, Scorched Earth, Round Robin) triggers them alike. */
export function damageEnemy(run: RunState, enemy: Enemy, amount: number) {
  if (amount <= 0 || enemy.hp <= 0) return;
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  // Shedding: falling to half health (and surviving) arms its spawn; it arrives at the end of
  // this enemy phase, before the next one begins (sections 7 and 8.1, count 1).
  const half = enemy.maxHp / 2;
  if (enemy.hp > 0 && before > half && enemy.hp <= half && !enemy.shed && enemy.designations?.includes("shedding")
    && run.reinforcement?.shed && run.reinforcement.after < 0) {
    enemy.shed = true;
    run.reinforcement.after = 1;
  }
  if (enemy.hp > 0) return;
  // Glass Echo · last echo: the leader's next strike or breach deals +3.
  if (enemy.id === "glass-echo") {
    const leader = livingLeader(run);
    if (leader) leader.echo = (leader.echo ?? 0) + RULES.lastEchoBonus;
  }
}

// ------------------------------------------------------------------ bands and fields

export function zoneForNode(node: Pick<NetworkNode, "z">): Zone {
  return node.z < -1.3 ? "north" : node.z > 1.3 ? "south" : "center";
}
export const ZONES: readonly Zone[] = ["north", "center", "south"];
/** Tie order for "busiest band" choices: Center, then North, then South. */
export const BAND_TIES: readonly Zone[] = ["center", "north", "south"];
export const FIELD_RULES: Record<ZoneEffectKind, { name: string; rules: string; hostile: boolean }> = {
  resonance: { name: "Resonance", rules: `+${RULES.resonanceDamage} damage when your primary route crosses this band`, hostile: false },
  aegis: { name: "Aegis", rules: `+${RULES.aegisShield} shield while an online device sits in this band`, hostile: false },
  stasis: { name: "Null field", rules: `+${RULES.nullFieldShield} shield while your hardware occupies this band`, hostile: false },
  corrosion: { name: "Corrosion", rules: `+${RULES.corrosionDamage} incoming damage while your hardware occupies this band`, hostile: true },
  suppression: { name: "Suppression", rules: `−${RULES.suppressionPenalty} damage when your primary route crosses this band`, hostile: true },
};
export function zoneDescription(run: RunState, zone: Zone): string {
  const fields = run.zoneEffects.filter(effect => effect.zone === zone);
  const anchored = run.installations.some(item => item.kind === "anchor" && zoneForNode(item) === zone);
  return fields.map(effect => `${FIELD_RULES[effect.kind].name}: ${FIELD_RULES[effect.kind].rules} · ${effect.permanent ? "terrain" : anchored && FIELD_RULES[effect.kind].hostile ? "anchored" : `${effect.turns} turn${effect.turns === 1 ? "" : "s"}`}`).join(". ") || "Clear ground · no active fields";
}
export function installField(run: RunState, effect: ZoneEffect) {
  // Each band holds one temporary allied and one temporary hostile field. Terrain
  // fields keep their own slot. Recasting replaces that side's temporary field (rule 22).
  // Signal fields are terrain-style too: they keep their own slot and stack with a cast field.
  run.zoneEffects = run.zoneEffects.filter(existing => existing.permanent || existing.signal || existing.zone !== effect.zone || FIELD_RULES[existing.kind].hostile !== FIELD_RULES[effect.kind].hostile);
  run.zoneEffects.push(effect);
}
export function hostileFieldTurns(run: RunState) {
  return RULES.hostileFieldTurns + (ascends(run.ascension, "lingeringCorruption") ? 1 : 0);
}
/** Fields of one kind per band. A cast field and a permanent terrain field stack. */
export function fieldBands(run: RunState, kind: ZoneEffectKind): Map<Zone, number> {
  const bands = new Map<Zone, number>();
  for (const field of run.zoneEffects)
    if (field.kind === kind) bands.set(field.zone, (bands.get(field.zone) ?? 0) + 1);
  return bands;
}
/** Deployed hardware for bands, corrosion and clusters: never terminals or phantoms (a
 * phantom is a decoy, not hardware). Racks count (the Server Rack card says so). */
export const isHardware = (node: NetworkNode) => !node.fixed && node.role !== "phantom";

// ------------------------------------------------------------------ sockets

export const GRID = { x: 7.25, z: 4.7 };
export const insideGrid = (x: number, z: number) => Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= GRID.x && Math.abs(z) <= GRID.z;
/** Why a socket is illegal, or null. `ignore` skips one device (relocation). */
export function isBlocked(run: RunState, x: number, z: number, ignore?: string): string | null {
  if (!insideGrid(x, z)) return "Keep hardware inside the build grid.";
  if (run.topology.nodes.some((node) => node.id !== ignore && Math.hypot(node.x - x, node.z - z) < RULES.deviceSpacing))
    return "Device sockets need more space.";
  if (run.terrain?.debris.some((spot) => Math.hypot(spot.x - x, spot.z - z) < RULES.debrisClearance))
    return "Wreckage blocks this socket.";
  if (run.installations.some((spot) => Math.hypot(spot.x - x, spot.z - z) < RULES.debrisClearance))
    return "A hostile installation occupies this socket. Scrub it first.";
  return null;
}
/** Auto-deploy socket order (rule 60): deterministic, readable, collision free. */
export const AUTO_SOCKETS: readonly { x: number; z: number }[] = [0, -2.5, 2.5, -5, 5, -1.25, 1.25, -3.75, 3.75, -7, 7]
  .flatMap(x => [0, 2.4, -2.4, 4.2, -4.2, 1.2, -1.2].map(z => ({ x, z })));
export function freeSocket(run: RunState): { x: number; z: number } | null {
  if (run.topology.nodes.length >= RULES.maxDevices) return null;
  return AUTO_SOCKETS.find(({ x, z }) => !isBlocked(run, x, z)) ?? null;
}
/** v5 · the legal socket nearest a point (Splice: the midpoint of a cable): the point itself, then
 * rings of twelve compass points every 0.35 out to 3.5, nearest first (ties: ring order, then the
 * point facing the far rail, clockwise). Deterministic; null when the table is full. */
export function socketNear(run: RunState, point: { x: number; z: number }): { x: number; z: number } | null {
  if (run.topology.nodes.length >= RULES.maxDevices) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  const candidates = [{ x: round(point.x), z: round(point.z) }];
  for (let ring = 1; ring <= 10; ring++)
    for (let k = 0; k < 12; k++) {
      const angle = (k * Math.PI) / 6, radius = ring * 0.35;
      candidates.push({ x: round(point.x + radius * Math.sin(angle)), z: round(point.z - radius * Math.cos(angle)) });
    }
  return candidates.find(({ x, z }) => !isBlocked(run, x, z)) ?? null;
}
/** Band sockets (Siphon Tap, Anchor; the v3 malware rule): the free socket nearest the
 * centre of the busiest band, Center then North then South on ties. `band` forces one band. */
export function bandSocket(run: RunState, band?: Zone): { x: number; z: number } | null {
  const counts = ZONES.map(zone => ({ zone, count: run.topology.nodes.filter(node => isHardware(node) && zoneForNode(node) === zone).length }));
  const order = band ? [{ zone: band, count: 0 }] : [...counts].sort((a, b) => b.count - a.count || BAND_TIES.indexOf(a.zone) - BAND_TIES.indexOf(b.zone));
  const rows: Record<Zone, number[]> = { north: [-2.6, -3.8, -1.8], center: [0, 0.8, -0.8], south: [2.6, 3.8, 1.8] };
  for (const { zone } of order)
    for (const z of rows[zone])
      for (const x of [0, 1.3, -1.3, 2.6, -2.6, 3.9, -3.9])
        if (!isBlocked(run, x, z)) return { x, z };
  return null;
}
/** Reach sockets (rule 31): twelve compass points around the target at the first ring,
 * then the second, starting at the point facing the far rail (north, −z) and turning
 * clockwise as seen from above (north → east → south → west). */
export function reachSocket(run: RunState, target: { x: number; z: number }): { x: number; z: number } | null {
  for (const radius of RULES.reachRings)
    for (let k = 0; k < 12; k++) {
      const angle = (k * Math.PI) / 6;
      const x = Math.round((target.x + radius * Math.sin(angle)) * 100) / 100;
      const z = Math.round((target.z - radius * Math.cos(angle)) * 100) / 100;
      if (!isBlocked(run, x, z)) return { x, z };
    }
  return null;
}

// ------------------------------------------------------------------ condition, wear, breakdown

/** Condition a device deploys with (rule 40; Reinforced Frame +1, Scorched Earth −1). */
export function deployCondition(run: RunState, salvage = false): number {
  const base = salvage ? RULES.salvageCondition : RULES.deviceCondition;
  return Math.max(1, base + (has(run, "reinforced-frame") ? RULES.reinforcedFrameCondition : 0) - (has(run, "scorched-earth") ? RULES.scorchedEarthCondition : 0));
}
/** Terminals and phantoms have no condition and never break. */
export const wearable = (node: NetworkNode) => !node.fixed && node.role !== "phantom";
export function maxConditionOf(node: NetworkNode): number {
  return node.maxCondition ?? (node.role === "rack" ? RULES.rackCondition : node.salvage ? RULES.salvageCondition : RULES.deviceCondition);
}
/** Current condition; a device without the field is intact. */
export function conditionOf(node: NetworkNode): number {
  return node.condition ?? maxConditionOf(node);
}
export const isWorn = (node: NetworkNode) => wearable(node) && conditionOf(node) < maxConditionOf(node);
/** The most worn device (lowest condition; ties: primary route first, then earliest installed). */
export function mostWorn(run: RunState, primary: readonly string[]): NetworkNode | null {
  const worn = run.topology.nodes.filter(isWorn);
  return worn.sort((a, b) => conditionOf(a) - conditionOf(b)
    || Number(!primary.includes(a.id)) - Number(!primary.includes(b.id))
    || run.topology.nodes.indexOf(a) - run.topology.nodes.indexOf(b))[0] ?? null;
}
/** Restores condition; returns the points restored. */
export function repairDevice(node: NetworkNode, points: number): number {
  const before = conditionOf(node), after = Math.min(maxConditionOf(node), before + points);
  node.condition = after;
  return after - before;
}
/** The Server Rack whose ring shelters a device (nearest; ties: earliest installed). */
export function shelterOf(run: RunState, node: NetworkNode): NetworkNode | null {
  if (node.role === "rack" || !wearable(node)) return null;
  return run.topology.nodes.filter(rack => rack.role === "rack" && rack.id !== node.id && within(rack, node))
    .sort((a, b) => distance(a, node) - distance(b, node) || run.topology.nodes.indexOf(a) - run.topology.nodes.indexOf(b))[0] ?? null;
}

export interface WearRecord { nodeId: string; from: number; to: number; breaks: boolean; source: string; sheltered?: string }
export interface BreakRecord { nodeId: string; role: Role; x: number; z: number; wreck: boolean }
export interface TableLog { wear: WearRecord[]; breakdowns: BreakRecord[] }

/** Rule 43: the device is removed with every cable, its upgrades and its jams; its socket
 * becomes wreckage (shared cap) unless it was a rack or a phantom. */
export function breakDevice(run: RunState, node: NetworkNode, log: TableLog) {
  const index = run.topology.nodes.indexOf(node);
  if (index < 0 || node.fixed) return;
  run.topology.nodes.splice(index, 1);
  run.topology.links = run.topology.links.filter(link => link.a !== node.id && link.b !== node.id);
  run.faultNodes = run.faultNodes.filter(id => id !== node.id);
  run.faultLinks = run.faultLinks.filter(key => !key.split("::").includes(node.id));
  const wreck = node.role !== "rack" && node.role !== "phantom" && !!run.terrain
    && addWreck(run.terrain, { x: node.x, z: node.z, fresh: true, role: node.role });
  log.breakdowns.push({ nodeId: node.id, role: node.role, x: node.x, z: node.z, wreck });
}
/** One point of wear (overload, Spike, Total Blackout). A rack's ring shelters: the rack
 * takes the wear instead. Condition 0 breaks the device at once. */
export function wearDevice(run: RunState, target: NetworkNode, source: string, log: TableLog, points = 1) {
  const rack = shelterOf(run, target);
  const node = rack ?? target;
  if (!wearable(node) || !run.topology.nodes.includes(node)) return;
  const from = conditionOf(node), to = Math.max(0, from - points);
  node.condition = to;
  log.wear.push({ nodeId: node.id, from, to, breaks: to <= 0, source, ...(rack ? { sheltered: target.id } : {}) });
  if (to <= 0) breakDevice(run, node, log);
}

// ------------------------------------------------------------------ installations

export const INSTALLATION_NAMES: Record<InstallationKind, string> = {
  tap: "Siphon Tap", jammer: "Jammer", spike: "Spike", anchor: "Anchor", breaker: "Breaker Charge",
};
/** Order of danger for "scrub the most dangerous" (13.8): charge, Jammer, Spike, Anchor, Tap. */
export const INSTALLATION_DANGER: readonly InstallationKind[] = ["breaker", "jammer", "spike", "anchor", "tap"];
export function mostDangerous(run: RunState): Installation | null {
  return [...run.installations].sort((a, b) => INSTALLATION_DANGER.indexOf(a.kind) - INSTALLATION_DANGER.indexOf(b.kind))[0] ?? null;
}
/** First free id of a kind: "jammer1", "tap2", … */
export function installationId(run: RunState, kind: InstallationKind): string {
  const used = new Set(run.installations.map(item => item.id));
  let n = 1;
  while (used.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}
/** Cabled honeypots: they decoy disruptions and bite installations planted within reach. */
export function cabledHoneypots(run: RunState): NetworkNode[] {
  return run.topology.nodes.filter(node => node.role === "honeypot" && run.topology.links.some(link => link.a === node.id || link.b === node.id));
}
/** While a Quarantine Drone lives, every scrubbed point costs more (rule 34). */
export function scrubCost(run: RunState): number {
  return run.enemies.some(enemy => enemy.id === "quarantine-drone" && enemy.hp > 0) ? RULES.quarantineScrubCost : RULES.scrubCost;
}
/** The standing Anchor bands (hostile fields there do not tick). */
export function anchoredBands(run: RunState, activeBy = Infinity): Set<Zone> {
  return new Set(run.installations.filter(item => item.kind === "anchor" && item.activeFrom <= activeBy).map(zoneForNode));
}

export interface DestroyRecord { id: string; kind: InstallationKind; cause: string; reclaim: number; scorched: string | null }
/** Removes a destroyed installation: Reclaim shield (rule 39) and Scorched Earth (the planter
 * takes 4, the focus if the planter is dead). Returns the Reclaim it grants. A detonating
 * charge is not "destroyed" and never comes through here. */
export function destroyInstallation(run: RunState, item: Installation, cause: string, bonus = 0, log?: DestroyRecord[]): number {
  const index = run.installations.indexOf(item);
  if (index >= 0) run.installations.splice(index, 1);
  const reclaim = RULES.reclaimShield + bonus;
  let scorched: string | null = null;
  if (has(run, "scorched-earth")) {
    const planter = run.enemies.find(enemy => enemy.uid === item.owner && enemy.hp > 0) ?? enemyAt(run, effectiveFocus(run));
    if (planter) {
      damageEnemy(run, planter, RULES.scorchedEarthDamage);
      scorched = planter.uid;
    }
  }
  log?.push({ id: item.id, kind: item.kind, cause, reclaim, scorched });
  return reclaim;
}

/** Enemy definition helper (content owns the table). */
export const definitionOf = (enemy: Pick<Enemy, "id">) => ENEMIES[enemy.id];
/** Link key helper re-export for the resolver. */
export { linkKey };
