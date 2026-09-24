/**
 * The table's side of a battle (world agent): the World sync every render, and the enemy phase
 * played back from the forecast the turn resolved (design 13.1–13.3, 13.9, 13.12).
 *
 *   syncWorld(world, run, preview, view, options)   render() → the 3D table and rail
 *   playTurn(playback)                               transmit() → the choreography, then commit()
 *
 * The playback reads only `result.forecast` and the TurnResult: every number shown mid-animation is
 * the number the rules resolved. DOM work goes through PlaybackHooks (main.ts builds them).
 */
import type { EffectKind, EffectOptions } from "./audio-effects.ts";
import type { CombatPreview, HostileForecast, InstallationEffect, TurnResult } from "./core/run.ts";
import { INSTALLATION_NAMES } from "./core/run.ts";
import { forecastTargets } from "./core/combat/resolve.ts";
import { CARDS } from "./core/cards.ts";
import { ENEMIES } from "./core/enemies.ts";
import { crateText } from "./core/encounter.ts";
import type { Enemy, Port, RunState } from "./core/types.ts";
import type { ActionKind, RailReadout, RailState, World, WorldPoint } from "./three/World.ts";

/** The hud's view state the table mirrors (main.ts worldView()). */
export interface WorldView {
  /** The port whose details the right plate shows (a dimmer crest when it is not the focus). */
  selectedPort: Port | null;
  /** The delivery row selected with [ ] (its packet glyph and aim line brighten). */
  selectedDelivery: string | null;
  /** The installation whose plate is open (its reach ring shows). */
  selectedInstallation: string | null;
  /** An installation-target card is selected (Demolition Charge): installations light as targets. */
  targetingInstallation: boolean;
}

/** Pushes the run and its forecast to the table. `rebuild` rebuilds devices and cables (setBattle);
 * `debrief` keeps a finished lesson's board without hostiles. */
export function syncWorld(world: World | null, run: RunState, preview: CombatPreview, view: WorldView, options: { rebuild: boolean; debrief?: boolean }) {
  if (!world) return;
  world.setStage(run.stage);
  // Terrain first: cables read the wreckage to know whether they fray.
  world.setTerrain(run.terrain);
  if (options.rebuild) world.setBattle(run.topology, options.debrief ? null : run.enemies, run.faultNodes, run.faultLinks);
  world.setInstallations(run.installations, { installs: preview.installTargets });
  world.setInstallationFocus(view.selectedInstallation, view.targetingInstallation);
  world.setOnline(preview.online);
  world.setChannels(preview.channelPaths);
  world.setForecastTarget(tableTargets(preview));
  world.setForecastZone(preview.hazardZone);
  world.setZoneEffects(run.zoneEffects);
  world.setRail(options.debrief ? { focus: null, selected: null, readouts: {} } : railState(run, preview, view));
  world.setDeliveries(preview.deliveries.map(delivery => ({
    key: delivery.channelKey, primary: delivery.primary, path: delivery.path, port: delivery.port, aimed: delivery.aimed, amount: delivery.amount,
  })), view.selectedDelivery);
}

/** Every forecast disruption target: each hostile's jams, cuts and overload, and each Jammer's jam. */
function tableTargets(preview: CombatPreview): string[] {
  if (preview.hostiles.length <= 1 && !preview.installationEffects.some(effect => effect.effect === "jam"))
    return preview.faultTarget ? [preview.faultTarget, ...forecastTargets(preview).filter(id => id !== preview.faultTarget)] : forecastTargets(preview);
  const jammers = preview.installationEffects
    .filter(effect => effect.effect === "jam" && effect.target && !effect.decoyed && !effect.cancelled && !effect.absorbed)
    .map(effect => effect.target!);
  return [...forecastTargets(preview), ...jammers];
}

/** What each rail plate reads: the damage it takes, LETHAL, overflow, this phase's intent. */
export function railState(run: RunState, preview: CombatPreview, view: WorldView): RailState {
  const readouts: Partial<Record<Port, RailReadout>> = {};
  for (const hostile of preview.hostiles) {
    const port = preview.ports[hostile.port];
    const enemy = run.enemies.find(item => item.uid === hostile.uid);
    if (!enemy) continue;
    const intent = hostile.intent;
    const leads = hostile.role === "leader" || hostile.role === "single";
    readouts[hostile.port] = {
      hpAfter: port?.hpAfter ?? enemy.hp,
      damage: port ? Math.max(0, port.packet - port.overflowOut) : 0,
      overflowIn: port?.overflowIn ?? 0,
      lethal: !!port?.lethal,
      intent: hostile.state === "dormant" ? "dormant" : intent?.kind ?? null,
      amount: hostile.state === "dormant" ? 0 : hostile.raw || intent?.amount || 0,
      state: hostile.state,
      escalation: leads ? hostile.escalation : null,
    };
  }
  return { focus: preview.focus, selected: view.selectedPort, readouts };
}

// ------------------------------------------------------------------ playback

export interface PlaybackHooks {
  sound(kind: EffectKind, options?: EffectOptions): void;
  toast(message: string, kind?: string): void;
  /** A number in #impact-layer; with `port` it rises over that hostile (fast mode stacks them by port). */
  floatText(text: string, good: boolean, kind?: string, port?: Port): void;
  render(rebuild?: boolean): void;
  /** (hud, battle-ui.ts) A port's packet landed: its health drops in place before the rules advance. */
  showPortHit(port: Port, hp: number, maxHp: number): void;
  /** root.dataset[key]; null deletes. */
  data(key: string, value: string | null): void;
  /** The battle root's shake (only with motion on). */
  shake(): void;
  /** The red edge flash at the start of the new turn. */
  flash(): void;
}
export interface Playback {
  world: World | null;
  /** The run as transmitted (still on screen until commit). */
  before: RunState;
  /** The resolved run. */
  next: RunState;
  result: TurnResult;
  /** Fast mode: quick animations, one combined impact. */
  fast: boolean;
  /** Motion setting (off = reduced motion). */
  motion: boolean;
  /** The discard pile was shuffled back this turn (the shuffle cue before the deal). */
  reshuffle: boolean;
  /** False once another battle generation started: every callback stops. */
  alive(): boolean;
  /** run = next, busy = false, save, render (main.ts). */
  commit(): void;
  hooks: PlaybackHooks;
}

/** Enemy intent → the cue heard on its contact frame. */
const INTENT_CUES: Partial<Record<ActionKind, EffectKind>> = {
  strike: "strike", breach: "breach", sever: "sever", jam: "jam", corrupt: "corrupt", charge: "charge", install: "install", infect: "malware",
  overload: "wear",
};
type Step = (next: () => void) => void;

/** Plays the whole enemy phase in port order, then commits the resolved state. */
export function playTurn(p: Playback) {
  const { world, before, next, result, hooks } = p;
  const forecast = result.forecast;
  const quick = p.fast || !p.motion;
  const steps: Step[] = [];
  const advance = () => {
    if (!p.alive()) return;
    const step = steps.shift();
    if (step) step(advance);
  };
  const wait = (ms: number): Step => proceed => window.setTimeout(() => { if (p.alive()) proceed(); }, ms);
  /** A table beat (not a hostile's action): the root says which, and no hostile is acting. */
  const stage = (name: string) => { hooks.data("playback", name); hooks.data("enemyAction", null); };
  const enemyOf = (uid: string): Enemy | undefined => before.enemies.find(enemy => enemy.uid === uid);
  const living = forecast.hostiles.map(hostile => hostile.port);
  const pack = before.enemies.length > 1;
  const split = pack && living.length > 1;
  const role = (id: string) => before.topology.nodes.find(node => node.id === id)?.role;
  const shownDeaths = new Set<string>();
  const shownBreakdowns = new Set<string>();

  if (result.buffered) hooks.sound("buffer");
  else {
    hooks.sound("transmit");
    if (result.bufferReleased) hooks.sound("release", { delay: .12 });
  }

  // ---- 1 · the transmission, per port
  const ports = forecast.ports;
  const hpAt = (port: Port, stage: "own" | "final") => {
    const entry = ports[port];
    if (!entry) return 0;
    const own = Math.max(0, entry.packet - entry.overflowOut - (stage === "own" ? entry.overflowIn : 0));
    return Math.max(0, entry.hpBefore - own);
  };
  const portHit = (port: Port, combined = false) => {
    const entry = ports[port];
    const enemy = entry && enemyOf(entry.uid);
    if (!entry || !enemy) return;
    const own = Math.max(0, entry.packet - entry.overflowOut - entry.overflowIn);
    if (!own) return;
    if (!combined) {
      world?.impact(0xfbd69a, 30, port);
      hooks.sound("hit", { power: Math.min(1.2, .7 + own / 12), pan: port === "left" ? -.35 : port === "right" ? .35 : 0 });
    }
    hooks.floatText(`−${own}`, true, "", port);
    const hp = hpAt(port, "own");
    hooks.showPortHit(port, hp, enemy.maxHp);
    world?.setPortHealth(port, hp);
  };
  /** Today's single-hostile contact frame: one impact, the total, the plate's health. */
  const singleHit = () => {
    if (result.packetDamage) {
      world?.impact(0xfbd69a, 36);
      hooks.sound("hit", { power: Math.min(1.2, .7 + result.packetDamage / 12) });
      hooks.floatText(`−${result.packetDamage}`, true, "", pack ? living[0] : undefined);
      for (const port of living) {
        const entry = ports[port], enemy = entry && enemyOf(entry.uid);
        if (!entry || !enemy) continue;
        const hp = Math.max(0, enemy.hp - (result.portDamage[port] ?? 0));
        hooks.showPortHit(port, hp, enemy.maxHp);
        world?.setPortHealth(port, hp);
      }
    }
  };
  const noDamage = () => {
    if (result.packetDamage) return;
    if (result.buffered) hooks.floatText(`+${result.buffered} buffered`, true, "buffer");
    else if (!result.enemyDamage) hooks.toast(result.signalPath.length ? "The signal was absorbed. Check armor, installations and hostile fields." : "No live route. The signal could not reach OMEGA.", "error");
  };
  const deliveries = forecast.deliveries.filter(delivery => delivery.path.length > 1);
  const channels = result.channelPaths.length ? result.channelPaths : [result.signalPath].filter(path => path.length);
  steps.push(proceed => {
    hooks.data("playback", "transmit");
    if (!split) {
      const finish = () => { if (!p.alive()) return; singleHit(); noDamage(); proceed(); };
      if (channels.length && world && !quick) world.playChannels(channels, finish);
      else window.setTimeout(finish, quick ? 80 : 550);
      return;
    }
    if (world && !quick && result.buffered && channels.length) {
      world.playChannels(channels, () => { if (!p.alive()) return; noDamage(); proceed(); });
      return;
    }
    if (world && !quick && deliveries.length && !result.buffered) {
      world.playTransmission(deliveries, port => { if (p.alive()) portHit(port); }, () => { if (!p.alive()) return; noDamage(); proceed(); });
      return;
    }
    // Fast mode and reduced motion: one combined impact, the numbers stacked by port.
    window.setTimeout(() => {
      if (!p.alive()) return;
      if (result.packetDamage) {
        world?.impact(0xfbd69a, 36, living.find(port => (result.portDamage[port] ?? 0) > 0));
        hooks.sound("hit", { power: Math.min(1.2, .7 + result.packetDamage / 12) });
        for (const port of living) portHit(port, true);
      }
      noDamage();
      proceed();
    }, quick ? 80 : 550);
  });
  // Overflow leaps to its second port.
  for (const port of living) {
    const entry = ports[port];
    if (!split || !entry || !entry.overflowOut || !entry.overflowTo) continue;
    const to = entry.overflowTo, amount = entry.overflowOut;
    steps.push(proceed => {
      const land = () => {
        if (!p.alive()) return;
        const target = ports[to], enemy = target && enemyOf(target.uid);
        world?.impact(0xf2c46d, 14, to);
        hooks.sound("hit", { power: .7, pan: to === "left" ? -.35 : to === "right" ? .35 : 0 });
        hooks.floatText(`+${amount} overflow`, true, "burst", to);
        if (enemy) {
          hooks.showPortHit(to, hpAt(to, "final"), enemy.maxHp);
          world?.setPortHealth(to, hpAt(to, "final"));
        }
        proceed();
      };
      if (world && !quick) world.playOverflow(port, to, land);
      else land();
    });
  }
  steps.push(wait(quick ? 80 : 350));

  // ---- 2 · hostiles felled by the transmission fall now (a Spiteful one acts first)
  const felled = forecast.hostiles.filter(hostile => ports[hostile.port]?.lethal && hostile.state !== "spiteful");
  const death = (hostiles: HostileForecast[]): Step => proceed => {
    const falling = hostiles.filter(hostile => !shownDeaths.has(hostile.uid));
    if (!falling.length) { proceed(); return; }
    hooks.sound("death");
    let remaining = falling.length;
    for (const hostile of falling) {
      shownDeaths.add(hostile.uid);
      const done = () => { if (--remaining === 0 && p.alive()) proceed(); };
      if (world) world.playEnemyTransition("death", done, p.fast, hostile.port);
      else done();
    }
  };
  if (felled.length) steps.push(death(felled));

  // ---- 3 · traps and quarantine: firewall beams into installations in reach
  for (const record of forecast.quarantine) {
    steps.push(proceed => {
      stage("traps");
      const item = before.installations.find(entry => entry.id === record.installationId);
      world?.playQuarantine(record.firewallId, record.installationId, record.destroys);
      hooks.sound("quarantine");
      if (item) world?.damageInstallation(item.id, record.destroys ? 0 : item.integrity - record.damage);
      wait(quick ? 90 : 420)(proceed);
    });
  }

  // ---- 4 · each hostile in port order
  const lateDeaths = new Set(result.deaths.filter(uid => !felled.some(hostile => hostile.uid === uid)));
  const springTraps = (hostile: HostileForecast) => {
    const triggers = forecast.protocolTriggers.filter(trigger => trigger.target === hostile.uid);
    if (!hostile.trapDamage && !triggers.length) return;
    hooks.sound("trigger", { delay: .06 });
    const touched = [...hostile.jams, ...hostile.cuts.flatMap(key => key.split("::")), ...(hostile.overload ? [hostile.overload] : [])];
    const decoy = hostile.decoyed ? touched.find(id => role(id) === "honeypot") : undefined;
    if (decoy) world?.pulseNode(decoy, "trap", hostile.port);
    else if (triggers.length) {
      const firewall = before.topology.nodes.find(node => node.role === "firewall" && forecast.online.includes(node.id));
      world?.pulseNode(touched.find(id => !["alpha", "omega"].includes(id)) ?? firewall?.id ?? "omega", "trigger");
    }
    if (hostile.trapDamage) hooks.floatText(`−${hostile.trapDamage} trap`, true, "trap", pack ? hostile.port : undefined);
    if (triggers.length) hooks.floatText(triggers.map(trigger => CARDS[trigger.card].name).join(" · "), true, "protocol");
  };
  const wearAt = (nodeId: string, source?: WorldPoint) => {
    const breaks = forecast.breakdowns.some(record => record.nodeId === nodeId);
    if (breaks && !shownBreakdowns.has(nodeId)) {
      shownBreakdowns.add(nodeId);
      world?.playWear(nodeId, source);
      world?.playBreakdown(nodeId);
      world?.setTerrain(next.terrain);
      hooks.sound("breakdown");
    } else if (!breaks) {
      world?.playWear(nodeId, source);
      hooks.sound("wear");
    }
  };
  for (const hostile of forecast.hostiles) {
    const enemy = enemyOf(hostile.uid);
    if (!enemy || shownDeaths.has(hostile.uid)) continue;
    const port = hostile.port;
    const trapKill = lateDeaths.has(hostile.uid);
    const fall = (proceed: () => void) => {
      if (trapKill && !shownDeaths.has(hostile.uid)) death([hostile])(proceed);
      else proceed();
    };
    if (hostile.state === "dormant" || hostile.state === "skipped") {
      steps.push(proceed => {
        hooks.data("playback", port);
        hooks.data("enemyAction", null);
        if (hostile.state === "dormant") hooks.sound("dormant");
        world?.dimPort(port, quick ? 260 : 760);
        wait(quick ? 120 : 520)(proceed);
      });
      continue;
    }
    if (hostile.interrupted) {
      steps.push(proceed => {
        hooks.data("playback", port);
        hooks.data("enemyAction", "break");
        hooks.sound("trigger");
        hooks.floatText("INTERRUPTED", true, "burst");
        if (world) world.playEnemyTransition("break", () => fall(proceed), p.fast, port);
        else fall(proceed);
      });
      continue;
    }
    if (hostile.state === "cancelled") {
      if (trapKill) steps.push(proceed => { hooks.data("playback", port); springTraps(hostile); fall(proceed); });
      continue;
    }
    const intent = hostile.intent;
    if (!intent) continue;
    steps.push(proceed => {
      hooks.data("playback", port);
      const kind = intent.kind;
      hooks.data("enemyAction", kind);
      if (kind === "breach" || kind === "charge") hooks.sound("charge");
      const installs = (hostile.installs?.length ? hostile.installs : hostile.install ? [hostile.install] : []).filter(item => !item.absorbed);
      const socket = installs.find(item => !item.boosts && !item.destroyed) ?? installs[0];
      const target = hostile.jams[0] ?? hostile.cuts[0] ?? hostile.overload ?? null;
      const tap = socket?.kind === "tap";
      const actionKind: ActionKind = kind === "install" && tap ? "infect" : kind;
      const impact = () => {
        if (!p.alive()) return;
        if (kind === "overload" && hostile.overload) wearAt(hostile.overload);
        // An overload a phantom or a honeypot took wears nothing: no wear cue (the trap has its own).
        else if (kind !== "charge" && kind !== "dormant" && kind !== "overload") hooks.sound(INTENT_CUES[actionKind] ?? "strike", {
          pan: kind === "breach" ? .35 : kind === "strike" ? -.35 : 0, power: intent.ultimate ? 1.2 : 1,
        });
        if (hostile.overload && kind !== "overload") wearAt(hostile.overload);
        for (const item of result.planted.filter(entry => entry.owner === hostile.uid)) world?.plantInstallation(item);
        if (installs.length && kind !== "install") hooks.sound(tap ? "malware" : "install", { delay: .1 });
        springTraps(hostile);
      };
      const after = () => { if (p.alive()) fall(proceed); };
      if (world) world.playEnemyAction(actionKind, target, hostile.field?.zone ?? (hostile.role === "leader" || hostile.role === "single" ? forecast.hazardZone : null), after, p.fast, impact,
        { port, point: socket && !socket.boosts ? { x: socket.x, z: socket.z } : null, color: ENEMY_ACTION_COLOR(kind, socket?.kind) });
      else { impact(); window.setTimeout(after, 160); }
    });
  }
  // A Phantom Node that absorbed this phase flickers; its last absorption fades it.
  const phantoms = before.topology.nodes.filter(node => node.role === "phantom").map(node => {
    const after = next.topology.nodes.find(entry => entry.id === node.id);
    return { id: node.id, fades: !after, used: !after || (after.absorbs ?? 0) < (node.absorbs ?? 0) };
  }).filter(item => item.used);
  if (phantoms.length) steps.push(proceed => {
    for (const phantom of phantoms) world?.playPhantom(phantom.id, phantom.fades);
    wait(quick ? 80 : 360)(proceed);
  });

  // The leader awakens (it crossed half health this turn).
  const leaderBefore = before.enemies.find(enemy => enemy.port === "centre" && enemy.hp > 0) ?? before.enemies.find(enemy => enemy.hp > 0);
  const leaderAfter = leaderBefore && next.enemies.find(enemy => enemy.uid === leaderBefore.uid);
  const becomesEnraged = !result.defeated && !!leaderAfter && leaderAfter.hp > 0 && !!ENEMIES[leaderAfter.id].enrages
    && leaderBefore!.hp > leaderBefore!.maxHp / 2 && leaderAfter.hp <= leaderAfter.maxHp / 2;
  if (becomesEnraged && !result.lost) steps.push(proceed => {
    hooks.sound("enrage");
    if (world) world.playEnemyTransition("enrage", proceed, p.fast, leaderBefore!.port);
    else proceed();
  });

  // ---- 5 · installations act, in placement order
  for (const effect of forecast.installationEffects) {
    if (effect.effect === "idle" || effect.effect === "siphon" || effect.effect === "anchor") continue;
    if ((effect.effect === "jam" || effect.effect === "wear") && !effect.target) continue;
    steps.push(proceed => {
      stage("installations");
      playInstallation(effect);
      wait(quick ? 90 : effect.effect === "detonate" ? 700 : 460)(proceed);
    });
  }
  function playInstallation(effect: InstallationEffect) {
    const spot = before.installations.find(item => item.id === effect.id) ?? next.installations.find(item => item.id === effect.id);
    if (effect.effect === "wear" && effect.target) {
      world?.playInstallationEffect({ ...effect, effect: "tick", countdown: undefined });
      wearAt(effect.target, spot);
      return;
    }
    world?.playInstallationEffect(effect);
    if (effect.effect === "jam") hooks.sound("jam");
    else if (effect.effect === "tick") hooks.sound("aim", { power: .8 });
    else if (effect.effect === "detonate") {
      hooks.sound("detonate");
      hooks.shake();
      for (const record of forecast.wear.filter(item => item.source === INSTALLATION_NAMES.breaker && item.breaks))
        if (!shownBreakdowns.has(record.nodeId)) {
          shownBreakdowns.add(record.nodeId);
          world?.playBreakdown(record.nodeId);
        }
      world?.setTerrain(next.terrain);
    }
  }

  // ---- 6 · breakdowns not shown yet (Total Blackout, a signal). Decided when the step plays: the
  // wear and detonation beats before it mark what they already broke.
  if (forecast.breakdowns.length) steps.push(proceed => {
    const remaining = forecast.breakdowns.filter(record => !shownBreakdowns.has(record.nodeId));
    if (!remaining.length) { proceed(); return; }
    stage("breakdowns");
    for (const record of remaining) {
      shownBreakdowns.add(record.nodeId);
      world?.playBreakdown(record.nodeId);
    }
    world?.setTerrain(next.terrain);
    hooks.sound("breakdown");
    wait(quick ? 90 : 520)(proceed);
  });

  // ---- 7 · arrivals: a reinforcement or a guardian's adds take their ports
  for (const arrival of result.arrived ?? []) {
    steps.push(proceed => {
      stage("arrivals");
      const enemy = next.enemies.find(item => item.uid === arrival.uid);
      if (enemy) world?.arrive(enemy);
      hooks.sound("arrive");
      if (enemy) hooks.toast(`${enemy.name} takes the ${arrival.port.toUpperCase()} port.`, "error");
      wait(quick ? 120 : 650)(proceed);
    });
  }
  // (A Shedding spawn armed this turn is announced by the HUD with the `warning` cue once the phase resolves.)

  // ---- 8 · what the fallen leave: crates, message fragments
  for (const record of result.fallen ?? []) {
    const enemy = enemyOf(record.uid);
    if (!enemy) continue;
    const port = enemy.port;
    const message = !!(record.crate && record.crate.kind !== "empty" && record.crate.message) || !!enemy.designations?.includes("laden");
    if (record.crate) {
      const crate = record.crate;
      const spot: WorldPoint = record.placed ? { x: record.placed.x, z: record.placed.z } : crateSpot(port, before);
      const text = crate.kind === "salvage" && !record.placed ? `+${record.credits ?? 0} credits` : crateText(crate);
      steps.push(proceed => {
        stage("crates");
        // The phase moves on once the lid is open (cue and toast with it), never before; a slow
        // frame rate cannot push the crate's moment past the next hand.
        let moved = false;
        const next = () => { if (!moved) { moved = true; proceed(); } };
        const open = () => {
          if (!p.alive()) return;
          hooks.sound("crate", { variant: crate.kind === "credits" || (crate.kind === "salvage" && !record.placed) ? 1 : 2 });
          hooks.toast(`Crate · ${text}`);
          wait(quick ? 60 : 420)(next);
        };
        if (world) world.dropCrate(port, spot, open, undefined, quick);
        else open();
        wait(quick ? 1400 : 3200)(next);
      });
    }
    if (message) steps.push(proceed => {
      // The fragment hovers for one beat; the message dialog opens once the phase has resolved.
      if (world) world.dropFragment(port);
      wait(quick ? 120 : 900)(proceed);
    });
  }

  // ---- 9 · a signal fires (or is announced)
  if (result.signalFired) steps.push(proceed => {
    stage("signal");
    hooks.sound("signal");
    hooks.toast(result.signalFired!, "error");
    wait(quick ? 120 : 700)(proceed);
  });

  // ---- 10 · resolve
  steps.push(() => {
    hooks.data("playback", null);
    p.commit();
    afterCommit(p, becomesEnraged, leaderBefore ?? null);
  });
  advance();
}

/** Crates without salvage land on the far edge of the table in front of their port. */
function crateSpot(port: Port, run: RunState): WorldPoint {
  const x = port === "left" ? -4.5 : port === "right" ? 4.5 : 0;
  const taken = (spot: WorldPoint) => run.topology.nodes.some(node => Math.hypot(node.x - spot.x, node.z - spot.z) < 1.2)
    || run.installations.some(item => Math.hypot(item.x - spot.x, item.z - spot.z) < 1.2);
  for (const dx of [0, 1.2, -1.2, 2.4, -2.4]) {
    const spot = { x: x + dx, z: -4.4 };
    if (!taken(spot)) return spot;
  }
  return { x, z: -4.4 };
}

const ENEMY_ACTION_COLOR = (kind: string, install?: string): number | undefined => {
  if (kind === "install" && install && install !== "tap") return ({ jammer: 0x87b5ff, spike: 0xe49b72, anchor: 0xbba0e8, breaker: 0xff777e } as Record<string, number>)[install];
  return undefined;
};

/** Today's resolve beat: the new turn's numbers, toasts and cues once the state has advanced. */
function afterCommit(p: Playback, becomesEnraged: boolean, leader: Enemy | null) {
  const { result, hooks, world } = p;
  const forecast = result.forecast;
  if (forecast.zoneThreat && !result.defeated) {
    world?.pulseZone(forecast.zoneThreat.zone, "corrupt");
    if (forecast.intent?.kind !== "corrupt") hooks.sound("corrupt", { delay: .1 });
  }
  if (result.junkAdded.length && !result.defeated) {
    hooks.sound("junk", { delay: .25 });
    hooks.toast(`${result.junkAdded.length} ${CARDS[result.junkAdded[0]].name} shuffled into your draw pile.`, "error");
  }
  if (result.malwarePlanted && !result.defeated) hooks.floatText("installation planted", false, "malware");
  if (result.backpressureStored) hooks.floatText(`+${result.backpressureStored} backpressure`, true, "burst");
  if (result.defeated) {
    hooks.sound("reward");
    return;
  }
  if (result.bufferLost) hooks.toast("Packet loss: no live route at the start of your turn. The buffer was lost.", "error");
  if (result.integrityDamage) {
    world?.pulseThreat();
    hooks.sound(result.lost ? "defeat" : "hurt");
    hooks.floatText(`−${result.integrityDamage}`, false);
    hooks.shake();
  } else if (result.enemyAction) {
    if (!result.interrupted && forecast.intent?.kind !== "charge") world?.pulseThreat();
    if (forecast.shield && forecast.incomingRaw) {
      hooks.floatText(`${Math.min(forecast.shield, forecast.incomingRaw)} blocked`, false, "shield");
      hooks.sound("block");
    }
    hooks.toast(result.enemyAction);
  }
  // Healing rises over the hostile that healed (a pack's ports), not over the toast.
  const healers = forecast.hostiles.filter(hostile => hostile.heal > 0);
  if (healers.length) for (const hostile of healers) hooks.floatText(`+${hostile.heal} siphoned`, true, "enemy-heal", hostile.port);
  else if (forecast.enemyHealing) hooks.floatText(`+${forecast.enemyHealing} siphoned`, true, "enemy-heal");
  if (result.interrupted) hooks.toast("Ultimate interrupted. The guardian is exposed for one transmission.");
  else if (becomesEnraged && leader) hooks.toast(`${leader.name} awakens. Its attacks grow stronger.`, "error");
  if (result.signalAnnounced) hooks.toast(result.signalAnnounced, "error");
  // The new hand arrives after the hit has landed; a reshuffle is heard only when it happened.
  if (!result.lost) {
    const delay = result.integrityDamage ? .45 : .15;
    if (p.reshuffle) hooks.sound("shuffle", { delay });
    hooks.sound("deal", { delay: p.reshuffle ? delay + .75 : delay });
  }
  hooks.flash();
}
