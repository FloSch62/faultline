/** Arrivals and surprises (sections 4.5 and 8): reinforcements and Shedding spawns, guardian
 * adds, signals (announced a full turn ahead, fired at the start of the turn they name), and what
 * a fallen hostile leaves behind (crates, Laden messages, Salvaged hardware). Everything here is
 * deterministic: plans, crates, messages and roles are seeded by the chart, never run.rng. */
import { RULES } from "../cards.ts";
import { ADD_IDS, ENEMIES, signalAnnouncement } from "../enemies.ts";
import { addHealth, crateFallbackCredits, makeEnemy, messageOffer, nextUid, roleName, salvageRole } from "../encounter.ts";
import { addWreck } from "../terrain.ts";
import type { CrateContents, Enemy, NetworkNode, Port, Role, RunState, Zone } from "../types.ts";
import {
  AUTO_SOCKETS, BAND_TIES, breakDevice, damageEnemy, definitionOf, deployCondition, enemyAt, freeSocket, has, isBlocked,
  isHardware, livingLeader, zoneForNode, type TableLog,
} from "./board.ts";
import { cableable, linkKey } from "../graph.ts";
import { intentFor } from "./intent.ts";

const SIDE_PORTS: readonly Port[] = ["left", "right"];
export interface ArrivalRecord { uid: string; id: string; port: Port; kind: "reinforcement" | "add"; hp: number; shed?: boolean }

/** The first empty port, left before right (rule 71). */
export function emptySidePort(run: RunState): Port | null {
  return SIDE_PORTS.find(port => !enemyAt(run, port)) ?? null;
}
/** A newcomer takes a port; a fallen body there leaves the rail. */
function takePort(run: RunState, enemy: Enemy) {
  const index = run.enemies.findIndex(other => other.port === enemy.port);
  if (index >= 0) run.enemies[index] = enemy;
  else run.enemies.push(enemy);
}

/** End of an enemy phase: an armed reinforcement counts down in enemy phases; at zero it takes the
 * first empty port (else it waits another phase) and acts from the next phase on its port's parity. */
export function reinforce(run: RunState): ArrivalRecord | null {
  const coming = run.reinforcement;
  if (!coming || coming.after < 0) return null;
  if (coming.after > 0) coming.after--;
  if (coming.after > 0) return null;
  const port = emptySidePort(run);
  if (!port) return null;
  const enemy = makeEnemy(coming.enemyId, nextUid(run), port, "escort", coming.hp, { crate: coming.crate });
  takePort(run, enemy);
  run.reinforcement = null;
  // Round Robin: reinforcements take its damage on arrival.
  if (has(run, "round-robin")) damageEnemy(run, enemy, Math.min(RULES.roundRobinDamage, enemy.hp - 1));
  return { uid: enemy.uid, id: enemy.id, port, kind: "reinforcement", hp: enemy.hp, ...(coming.shed ? { shed: true } : {}) };
}

/** A guardian raises its adds at the empty outer ports when its charge is announced (the charge
 * turn): their health and intents show at once, they act from the ultimate turn (rule 25, 28). */
export function raiseAdds(run: RunState): ArrivalRecord[] {
  if (!RULES.addBreakBonus) return [];
  const raised: ArrivalRecord[] = [];
  for (const guardian of run.enemies.filter(enemy => enemy.hp > 0 && definitionOf(enemy).boss)) {
    if (intentFor(run, guardian).kind !== "charge") continue;
    const id = ADD_IDS.find(add => ENEMIES[add].addOf === guardian.id);
    if (!id) continue;
    for (const port of SIDE_PORTS) {
      if (enemyAt(run, port)) continue;
      const add = makeEnemy(id, nextUid(run), port, "add", addHealth(run, id), { wakes: run.enemyPhase + 2 });
      takePort(run, add);
      raised.push({ uid: add.uid, id, port, kind: "add", hp: add.hp });
    }
  }
  return raised;
}

// ------------------------------------------------------------------ signals

const bandName = (zone: Zone) => zone.toUpperCase();
const socketName = (socket: { x: number; z: number }) => `the ${bandName(zoneForNode(socket))} socket (${socket.x}, ${socket.z})`;
/** The band holding the most of the given nodes (Center on ties). */
function busiest(nodes: readonly NetworkNode[]): Zone {
  return [...BAND_TIES].sort((a, b) => nodes.filter(node => zoneForNode(node) === b).length - nodes.filter(node => zoneForNode(node) === a).length)[0];
}

/** Turn-2 announcement: the signal names its band, socket, device or hostile, which never changes. */
export function announceSignal(run: RunState, primaryPath: readonly string[]): string | null {
  const signal = run.signal;
  if (!signal || signal.announced || signal.resolved) return null;
  const nodes = run.topology.nodes;
  const onPath = nodes.filter(node => primaryPath.includes(node.id) && !node.fixed);
  let target = "";
  if (signal.id === "relay-flicker") target = bandName(signal.zone = busiest(nodes.filter(isHardware)));
  else if (signal.id === "interference") target = bandName(signal.zone = busiest(onPath));
  else if (signal.id === "collapse") {
    const path = nodes.filter(node => primaryPath.includes(node.id));
    const mid = path.length ? { x: path.reduce((sum, node) => sum + node.x, 0) / path.length, z: path.reduce((sum, node) => sum + node.z, 0) / path.length } : { x: 0, z: 0 };
    const socket = AUTO_SOCKETS.filter(spot => !isBlocked(run, spot.x, spot.z))
      .sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z))[0];
    if (socket) {
      signal.socket = socket;
      target = socketName(socket);
    }
  } else if (signal.id === "cold-start") {
    const salvage = nodes.find(node => node.salvage && !node.fixed);
    if (salvage) {
      signal.nodeId = salvage.id;
      target = salvage.id.toUpperCase();
    } else {
      const socket = freeSocket(run);
      signal.role = salvageRole(run, "cold-start");
      if (socket) signal.socket = socket;
      target = `a salvaged ${roleName(signal.role)}${socket ? ` at ${socketName(socket)}` : ""}`;
    }
  } else {
    const leader = livingLeader(run);
    if (leader) {
      signal.enemyUid = leader.uid;
      target = leader.name;
    }
  }
  signal.announced = true;
  signal.text = signalAnnouncement(signal.id, target || "the table");
  return signal.text;
}

/** Start of the named turn: the signal fires exactly as announced (section 8.4). */
export function fireSignal(run: RunState, log: TableLog): string | null {
  const signal = run.signal;
  if (!signal || !signal.announced || signal.resolved) return null;
  signal.resolved = true;
  const turns = RULES.signalFieldTurns;
  switch (signal.id) {
    case "relay-flicker":
      if (signal.zone) run.zoneEffects.push({ zone: signal.zone, kind: "resonance", turns, signal: true });
      return signal.zone ? `RELAY FLICKER · ${bandName(signal.zone)} resonates for ${turns} turns.` : null;
    case "interference":
      if (signal.zone) run.zoneEffects.push({ zone: signal.zone, kind: "suppression", turns, signal: true });
      return signal.zone ? `INTERFERENCE · ${bandName(signal.zone)} is suppressed for ${turns} turns.` : null;
    case "collapse": {
      if (!signal.socket || !run.terrain) return null;
      const socket = signal.socket;
      // Whatever stands on the named socket falls with it.
      for (const node of run.topology.nodes.filter(item => !item.fixed && Math.hypot(item.x - socket.x, item.z - socket.z) < RULES.debrisClearance))
        breakDevice(run, node, log);
      addWreck(run.terrain, { x: socket.x, z: socket.z, fresh: true });
      return `COLLAPSE · ${socketName(socket)} becomes wreckage.`;
    }
    case "cold-start": {
      const node = signal.nodeId ? run.topology.nodes.find(item => item.id === signal.nodeId) : null;
      if (node) {
        const linked = (other: NetworkNode) => run.topology.links.some(link => linkKey(link.a, link.b) === linkKey(node.id, other.id));
        const nearest = run.topology.nodes.filter(other => other !== node && cableable(other) && !linked(other))
          .sort((a, b) => Math.hypot(a.x - node.x, a.z - node.z) - Math.hypot(b.x - node.x, b.z - node.z) || a.id.localeCompare(b.id))[0];
        if (nearest) run.topology.links.push({ a: node.id, b: nearest.id });
        node.condition = Math.max(node.condition ?? 0, RULES.deviceCondition);
        node.maxCondition = Math.max(node.maxCondition ?? 0, RULES.deviceCondition);
        return `COLD START · ${node.id.toUpperCase()} powers up${nearest ? ` and is cabled to ${nearest.id.toUpperCase()}` : ""}.`;
      }
      // The named socket, or the next free one if something was built there since the announcement.
      const socket = signal.socket && !isBlocked(run, signal.socket.x, signal.socket.z) ? signal.socket : freeSocket(run);
      if (!socket || !signal.role || run.topology.nodes.length >= RULES.maxDevices) return null;
      const condition = deployCondition(run, true);
      run.topology.nodes.push({ id: `${signal.role}${run.nextNodeId++}`, role: signal.role, ...socket, salvage: true, condition, maxCondition: condition });
      return `COLD START · a salvaged ${roleName(signal.role)} lands at ${socketName(socket)}.`;
    }
    case "resync": {
      const leader = run.enemies.find(enemy => enemy.uid === signal.enemyUid && enemy.hp > 0);
      if (leader) leader.skipNext = true;
      return leader ? `RESYNC · ${leader.name} skips its next action.` : null;
    }
    case "surge": {
      const leader = run.enemies.find(enemy => enemy.uid === signal.enemyUid && enemy.hp > 0);
      if (leader) leader.surge = Math.min(3, (leader.surge ?? 0) + 1);
      return leader ? `SURGE · ${leader.name} escalates.` : null;
    }
  }
}

// ------------------------------------------------------------------ what the fallen leave behind

export interface FallenRecord {
  uid: string;
  /** Crate contents revealed at death (escorts and reinforcements). */
  crate?: CrateContents;
  /** Credits banked ("crates"): a credits crate, or salvage with no legal socket. */
  credits?: number;
  /** Hardware placed on the table (a crate's salvage, a Salvaged drop). */
  placed?: { nodeId: string; role: Role; x: number; z: number; source: "crate" | "salvaged" };
  /** Offers queued (card choice, crate message, Laden message). */
  offers: number;
}

function bank(run: RunState, amount: number) {
  const ledger = run.creditLedger ?? (run.creditLedger = []);
  const line = ledger.find(item => item.label === "crates");
  if (line) line.amount += amount; else ledger.push({ label: "crates", amount });
}
/** Salvage hardware at the first legal auto-deploy socket (rule 60), condition 1; else credits. */
function dropSalvage(run: RunState, role: Role, source: "crate" | "salvaged", onTable: boolean, record: FallenRecord) {
  const socket = onTable ? freeSocket(run) : null;
  if (!socket) {
    const credits = crateFallbackCredits(run);
    bank(run, credits);
    record.credits = (record.credits ?? 0) + credits;
    return;
  }
  const condition = deployCondition(run, true);
  const node: NetworkNode = { id: `${role}${run.nextNodeId++}`, role, ...socket, salvage: true, condition, maxCondition: condition };
  run.topology.nodes.push(node);
  record.placed = { nodeId: node.id, role, ...socket, source };
}

/** Opens what fallen hostiles carry: crates (credits banked, a card choice or a message queued,
 * salvage placed at the end of the enemy phase), Laden messages and Salvaged drops. `onTable`
 * is false once the fight is over: salvage then yields its credits instead. */
export function openFallen(run: RunState, uids: readonly string[], onTable: boolean): FallenRecord[] {
  const records: FallenRecord[] = [];
  for (const uid of uids) {
    const enemy = run.enemies.find(item => item.uid === uid);
    if (!enemy || enemy.hp > 0 || enemy.looted) continue;
    enemy.looted = true;
    const record: FallenRecord = { uid, offers: 0 };
    const crate = enemy.crate;
    if (crate) {
      delete enemy.crate;
      record.crate = crate;
      if (crate.kind === "credits") {
        bank(run, crate.amount);
        record.credits = crate.amount;
      } else if (crate.kind === "card") {
        run.offers.push({ kind: "crate-card", cards: crate.cards });
        record.offers++;
      } else if (crate.kind === "salvage") dropSalvage(run, crate.role, "crate", onTable, record);
      if (crate.kind !== "empty" && crate.message) {
        run.offers.push(messageOffer(run, "crate", uid));
        record.offers++;
      }
    }
    if (enemy.designations?.includes("laden")) {
      run.offers.push(messageOffer(run, "laden", uid));
      record.offers++;
    }
    if (enemy.designations?.includes("salvaged")) dropSalvage(run, salvageRole(run, uid), "salvaged", onTable, record);
    if (record.crate || record.offers || record.placed || record.credits) records.push(record);
  }
  return records;
}
