/** Shared deterministic QA player. It only makes decisions from visible cards,
 * board state and intent; its optional command stream drives browser playthroughs. */
import { CARDS } from "../src/core/cards.ts";
import { ENEMIES } from "../src/core/enemies.ts";
import { canLink } from "../src/core/graph.ts";
import * as rules from "../src/core/run.ts";
import { ZONES, costFor, combatPreview, zoneForNode, intentFor } from "../src/core/run.ts";
import type { CardId, RunState, Zone } from "../src/core/types.ts";
export type Policy = "careless" | "adaptive" | "aggressive" | "tactical";
export type BotAction =
  | { kind: "instant" | "prepare"; index: number }
  | { kind: "ground"; index: number; x: number; z: number }
  | { kind: "node"; index: number; id: string }
  | { kind: "link"; index: number; a: string; b: string }
  | { kind: "zone"; index: number; zone: Zone }
  | { kind: "move"; id: string; x: number; z: number };
const balancedPriorities: CardId[] = [
  "clabernetes",
  "containerlab",
  "startup-config",
  "resonance-field",
  "aegis-field",
  "purge-field",
  "null-field",
  "wireshark",
  "zero-day",
  "protocol",
  "guard",
  "rebuild",
  "pulse",
  "emergency",
  "surge",
  "mirror",
  "duplex",
  "reroute",
  "barrier",
  "armored-fiber",
  "firmware",
  "capacitor",
  "conduit",
  "crosslink",
  "diagnostic",
  "containerlab",
  "compression",
  "bastion",
  "relay",
  "salvage",
  "shield",
  "hardened-router",
];
const buildPriorities: Record<string, CardId[]> = {
  mesh: [
    "clabernetes",
    "rebuild",
    "armored-fiber",
    "conduit",
    "mirror",
    "duplex",
    "compression",
    "relay",
  ],
  fortress: [
    "bastion",
    "barrier",
    "protocol",
    "emergency",
    "guard",
    "hardened-router",
    "capacitor",
  ],
  burst: [
    "zero-day",
    "pulse",
    "surge",
    "firmware",
    "diagnostic",
    "wireshark",
    "containerlab",
    "crosslink",
  ],
};
export const rewardPriorities = (build = "balanced"): CardId[] => [...(buildPriorities[build] ?? []), ...balancedPriorities];


const sockets = [
  { x: 0, z: 0 },
  { x: 0, z: -2.4 },
  { x: 0, z: 2.4 },
  { x: -2.5, z: 2.4 },
  { x: 2.5, z: 2.4 },
  { x: -2.5, z: -2.4 },
  { x: 2.5, z: -2.4 },
];

export function playBotTurn(run: RunState, policy: Policy, observe?: (action: BotAction) => void) {
  const record = (action: BotAction, result: rules.ActionResult) => { if (result.ok) observe?.(action); return result; };
  const playInstant = (r: RunState, index: number) => record({kind: "instant", index}, rules.playInstant(r, index));
  const prepareCard = (r: RunState, index: number) => record({kind: "prepare", index}, rules.prepareCard(r, index));
  const playGround = (r: RunState, index: number, x: number, z: number) => record({kind: "ground", index, x, z}, rules.playGround(r, index, x, z));
  const playNode = (r: RunState, index: number, id: string) => record({kind: "node", index, id}, rules.playNode(r, index, id));
  const playLink = (r: RunState, index: number, a: string, b: string) => record({kind: "link", index, a, b}, rules.playLink(r, index, a, b));
  const playZone = (r: RunState, index: number, zone: Zone) => record({kind: "zone", index, zone}, rules.playZone(r, index, zone));
  const relocateNode = (r: RunState, id: string, x: number, z: number) => record({kind: "move", id, x, z}, rules.relocateNode(r, id, x, z));
  function indexOf(r: RunState, id: CardId) {
    const index = r.hand.indexOf(id);
    return index >= 0 && costFor(r, index) <= r.energy ? index : -1;
  }
  function instant(r: RunState, id: CardId) {
    const index = indexOf(r, id);
    return index >= 0 && playInstant(r, index).ok;
  }
  function nodeCard(r: RunState, card: CardId, id: string) {
    const index = indexOf(r, card);
    return index >= 0 && playNode(r, index, id).ok;
  }
  function turn(r: RunState, policy: Policy) {
    const defensive = policy === "adaptive" || policy === "tactical";
    for (let action = 0; action < 40; action++) {
      const p = combatPreview(r);
      if (p.lethal) return;
      if (
        !r.topology.nodes.some((n) => n.role === "router") &&
        instant(r, "containerlab")
      )
        continue;
      // Every policy builds the guaranteed manual opener. A careless policy then
      // ignores faults, rewards, upgrades and defense rather than doing nothing.
      if (!r.topology.nodes.some((n) => n.role === "router")) {
        const index = indexOf(r, "router");
        if (index >= 0 && playGround(r, index, 0, 0).ok) continue;
      }
      const firstRouter = r.topology.nodes.find((n) => n.role === "router");
      if (firstRouter) {
        const missing = ["alpha", "omega"].find((end) =>
          canLink(r.topology, firstRouter.id, end),
        );
        const cable = r.hand.findIndex(
          (id, i) => CARDS[id].target === "link" && costFor(r, i) <= r.energy,
        );
        if (
          missing &&
          cable >= 0 &&
          playLink(r, cable, firstRouter.id, missing).ok
        )
          continue;
      }
      if (policy === "careless") return;
      // Only use public intent and hand information. The tactical probe saves an
      // answer to a charge and attempts a break before spending energy on shields.
      if (policy === "tactical" && p.intent?.kind === "charge" && !r.preparedCard && p.incoming < r.integrity) {
        const answer = ["zero-day", "pulse", "mirror", "barrier", "guard"].find(id => r.hand.includes(id as CardId));
        if (answer && prepareCard(r, r.hand.indexOf(answer as CardId)).ok) continue;
      }
      if (policy === "tactical" && p.intent?.ultimate && !p.interrupted && p.packetDamage) {
        const burst = ["zero-day", "pulse", "mirror"].find(id => {
          const index = indexOf(r, id as CardId);
          if (index < 0) return false;
          const copy = structuredClone(r);
          return rules.playInstant(copy, index).ok && combatPreview(copy).packetDamage > p.packetDamage;
        });
        if (burst && instant(r, burst as CardId)) continue;
      }
      // Evaluate field cards with the same forecast as the player. Avoid replacing
      // an existing allied field unless this transmission improves.
      const fieldOptions = r.hand.flatMap((id,index) => CARDS[id].target === "zone" && costFor(r,index) <= r.energy ? ZONES.map(zone => {
        const copy = structuredClone(r);
        const result = rules.playZone(copy,index,zone);
        const after = combatPreview(copy);
        const benefit = result.ok ? after.packetDamage - p.packetDamage + (defensive ? (p.incoming - after.incoming) * 2 : 0) : -1;
        return { index, zone, benefit };
      }) : []).sort((a,b)=>b.benefit-a.benefit);
      if (fieldOptions[0]?.benefit > 0 && playZone(r,fieldOptions[0].index,fieldOptions[0].zone).ok) continue;
      if ((r.energy <= 3 || (policy === "tactical" && r.hand.length <= 8 && (p.intent?.ultimate || p.incoming >= r.integrity))) && instant(r, "surge")) continue;
      if (r.hand.length <= 7 && instant(r, "inspect")) continue;
      if (r.maxIntegrity - r.integrity >= 3 && instant(r, "emergency")) continue;
      if (!p.packetDamage && (r.faultNode || r.faultLink)) {
        if (
          instant(r, "reroute") ||
          instant(r, "protocol") ||
          instant(r, "patch")
        )
          continue;
      }
      const router = r.topology.nodes.find(
        (n) =>
          n.role === "router" &&
          r.topology.links.filter((l) => l.a === n.id || l.b === n.id).length >=
            2,
      );
      if (!p.independent && router && nodeCard(r, "clabernetes", router.id))
        continue;
      if (p.packetDamage && !p.independent && instant(r, "rebuild")) continue;
      if (p.independent && instant(r, "mirror")) continue;
      if (
        defensive &&
        p.independent &&
        !p.shieldTerms.some((term) => term.label.startsWith("Separated")) &&
        r.energy > 0
      ) {
        const centered = r.topology.nodes.find(
          (node) => node.role === "router" && zoneForNode(node) === "center",
        );
        if (centered) {
          const z = r.topology.nodes.some(
            (node) => node.role === "router" && zoneForNode(node) === "north",
          )
            ? 2.4
            : -2.4;
          if (relocateNode(r, centered.id, 0, z).ok) continue;
        }
      }
      if (
        defensive &&
        r.enemy && ENEMIES[r.enemy.id].jamBands &&
        p.intent?.kind === "jam" &&
        p.hazardZone &&
        p.faultTarget &&
        r.energy > 0
      ) {
        const endangered = r.topology.nodes.find(
          (node) => node.id === p.faultTarget,
        );
        const safe = sockets.find(
          (socket) =>
            zoneForNode(socket) !== p.hazardZone &&
            r.topology.nodes.every(
              (other) =>
                other.id === endangered?.id ||
                Math.hypot(other.x - socket.x, other.z - socket.z) >= 1.55,
            ),
        );
        if (
          endangered && zoneForNode(endangered) === p.hazardZone &&
          safe &&
          relocateNode(r, endangered.id, safe.x, safe.z).ok
        )
          continue;
      }
      if (p.incoming > 0 && defensive) {
        if (
          instant(r, "guard") ||
          instant(r, "barrier") ||
          instant(r, "protocol") ||
          instant(r, "capacitor")
        )
          continue;
      }
      if (
        router &&
        !router.configured &&
        nodeCard(r, "startup-config", router.id)
      )
        continue;
      if (router && !router.upgraded && nodeCard(r, "firmware", router.id))
        continue;
      const amplifier = r.topology.nodes.find(
        (n) => n.role === "switch" && !n.amplified && p.signalPath.includes(n.id),
      );
      if (amplifier && nodeCard(r, "compression", amplifier.id)) continue;
      if (p.packetDamage && r.hand.length <= 8 && instant(r, "wireshark"))
        continue;
      if (p.packetDamage && (instant(r, "zero-day") || instant(r, "pulse")))
        continue;
      if (
        router &&
        !router.shielded &&
        p.intent?.kind === "jam" &&
        nodeCard(r, "shield", router.id)
      )
        continue;
      if (r.energy >= 2 && r.hand.length <= 5 && instant(r, "diagnostic"))
        continue;
      // Build one purposeful extra route or a firewall branch; avoid filling sockets with dead hardware.
      const linkIndices = r.hand
        .map((id, i) => (CARDS[id].target === "link" ? i : -1))
        .filter((i) => i >= 0);
      const idle = r.topology.nodes.find(
        (n) =>
          !n.fixed &&
          r.topology.links.filter((l) => l.a === n.id || l.b === n.id).length < 2,
      );
      let linked = false;
      if (idle && linkIndices.length) {
        const ends =
          idle.role === "router"
            ? ["alpha", "omega"]
            : ["alpha", router?.id ?? "omega"];
        for (const target of ends) {
          if (!canLink(r.topology, idle.id, target)) continue;
          const index = linkIndices.find((i) => costFor(r, i) <= r.energy);
          if (index !== undefined && playLink(r, index, idle.id, target).ok) {
            linked = true;
            break;
          }
        }
      }
      if (linked) continue;
      if (!idle && linkIndices.length >= 2 && r.topology.nodes.length < 6) {
        const desired: CardId[] =
          p.independent ||
          (r.enemy?.id === "sentinel" &&
            !r.topology.nodes.some((node) => node.role === "firewall"))
            ? ["bastion", "firewall", "linux-bridge", "relay", "switch"]
            : ["hardened-router", "router"];
        const hardware = desired
          .map((card) => indexOf(r, card))
          .find((i) => i >= 0 && costFor(r, i) + 2 <= r.energy);
        const socket = sockets.find((s) =>
          r.topology.nodes.every((n) => Math.hypot(n.x - s.x, n.z - s.z) >= 1.55),
        );
        if (
          hardware !== undefined &&
          socket &&
          playGround(r, hardware, socket.x, socket.z).ok
        )
          continue;
      }
      if (
        p.incoming > 0 &&
        (instant(r, "guard") || instant(r, "protocol") || instant(r, "barrier"))
      )
        continue;
      if (instant(r, "capacitor")) continue;
      if (policy === "tactical" && !r.preparedCard) {
        const next = intentFor(r, 1);
        const preferred: CardId[] = next?.kind === "sever" || next?.kind === "jam"
          ? ["patch", "protocol", "reroute", "guard", "pulse"]
          : ["barrier", "guard", "pulse", "zero-day", "surge"];
        const card = preferred.find(id => r.hand.includes(id));
        if (card) prepareCard(r, r.hand.indexOf(card));
      }
      return;
    }
    throw new Error(`Action limit exceeded: ${JSON.stringify({policy, seed:r.seed, stage:r.stage, enemy:r.enemy, energy:r.energy, hand:r.hand, log:r.log})}`);
  }

  turn(run, policy);
}
