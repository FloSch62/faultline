/** Bundled, mastered material recordings. See soundtrack/effects/manifest.json.
 *
 * CUE GUIDE — play exactly one cue per game moment. Masters are loudness matched
 * in scripts/build_effects.py, so runtime gains stay near 1.
 *
 * Interface and cards (quiet, never masks combat)
 *   hover     Pointer enters a meaningful control: hand card, map room, reward, relic,
 *             service, archetype, Transmit, primary menu. Not for every icon button.
 *   pickup    A hand card is lifted to choose its target (ground/link/node/zone cards).
 *   select    A non-card choice: archetype, a device on the table, the first end of a cable.
 *   undo      Undo, cancel/deselect a lifted card, return a prepared card to hand.
 *   card      A card is set aside or placed without an effect of its own (Prepare).
 *   draw      1–3 cards drawn mid-turn (Deep Scan, Clab Inspect, Hot Patch, Wireshark…).
 *   deal      The new hand is dealt at the start of your turn.
 *   shuffle   ONLY when the discard pile is reshuffled into the draw pile.
 *   instant   A program card resolves (burst, energy, draw, upgrades applied to a device).
 *   protocol  A protocol card is armed face down.
 *   trigger   An armed protocol or a honeypot fires during the enemy action, or a
 *             guardian's ultimate is interrupted.
 *   console   The archetype console command is used (Patch Cable, Harden, Buffer toggle).
 *   navigate  A map room is chosen, an expedition starts, or a screen advances onward.
 *   coins     Credits are spent at the Market or gained from a room.
 *   upgrade   A card is upgraded (Sanctuary, Market, event).
 *   event     An Unknown Signal event opens or an event choice resolves.
 *   reward    A card/relic reward is taken, a relic is installed, a sanctuary service ends.
 *   error     An action is refused (not enough energy, illegal target, occupied socket).
 *
 * Construction and signal
 *   deploy    A device lands on the table (hardware cards, Containerlab, clones, salvage).
 *   connect   A cable is connected (cable cards, Patch Cable console, Mesh Weave).
 *   route     A live route or an additional channel comes online after an action.
 *   move      A device is relocated (drop or band buttons). Replaces any card cue.
 *   field     An allied field is cast on a band.
 *   cleanse   Faults/fields are cleared, integrity is repaired.
 *   scrub     An installation loses a point to Scrub, or a card is removed from the deck.
 *   transmit  Transmit / End Turn is pressed: the packet launches.
 *   buffer    Ghost: a transmission is stored in the buffer instead of dealt.
 *   release   Ghost: the buffer is released with a transmission (before `hit`).
 *   turn      An encounter begins (battle or elite entered from the map).
 *
 * Hostile actions and combat (play on the animation's contact frame)
 *   hit       Your packet reaches the hostile (power scales with damage).
 *   hurt      Integrity damage lands on you.
 *   block     Shield is raised by a card or console, or absorbs part of an attack.
 *   strike / breach / sever / jam   The announced enemy action lands.
 *   corrupt   A hostile field is installed on a band.
 *   malware   A Siphon Tap is planted on your table (every other installation: install).
 *   junk      Junk cards (Packet Loss, Worm) are shuffled into your piles.
 *   charge    A guardian charges its ultimate (or a breach winds up).
 *   boss      A guardian is introduced.
 *   enrage    A hostile crosses its half-health threshold.
 *   death     The hostile is defeated.
 *   defeat    The expedition is lost.
 *
 * Ports, table front and surprises (v4 · Under Quarantine)
 *   arrive     An escort or reinforcement takes a port (also the guardian's adds rising).
 *   dormant    An escort goes dormant for the phase.
 *   aim        The target changes (a hostile clicked, or F).
 *   install    A Jammer, Spike, Anchor or Breaker Charge is planted (Taps keep malware).
 *   wear       An overload or a Spike removes a condition point.
 *   breakdown  A device breaks and leaves wreckage.
 *   repair     A condition point is restored (click repair, Harden, a repair card).
 *   quarantine A firewall degrades an installation in the trap phase.
 *   detonate   A Breaker Charge reaches zero.
 *   crate      A crate lands and opens on an escort's death. Pick the master by contents:
 *              { variant: 1 } credits (coins), { variant: 2 } anything else (paper).
 *   message    A message fragment drops, and again when a choice resolves.
 *   reveal     A hidden designation is revealed at the entrance line.
 *   warning    A reinforcement is announced.
 *   signal     A mid-fight signal fires (good or bad share the cue; the text carries the meaning).
 */
export const EFFECTS = {
  hover: { variants: 2, gain: 1, priority: 0 },
  pickup: { variants: 3, gain: 1, priority: 0 },
  select: { variants: 2, gain: 1, priority: 0 },
  undo: { variants: 1, gain: 1, priority: 0 },
  card: { variants: 3, gain: 1, priority: 1 },
  draw: { variants: 2, gain: 1, priority: 0 },
  deal: { variants: 2, gain: 1, priority: 1 },
  shuffle: { variants: 1, gain: 1, priority: 1 },
  instant: { variants: 3, gain: 1, priority: 1 },
  protocol: { variants: 2, gain: 1, priority: 1 },
  trigger: { variants: 2, gain: 1, priority: 2 },
  console: { variants: 2, gain: 1, priority: 1 },
  navigate: { variants: 2, gain: 1, priority: 1 },
  coins: { variants: 2, gain: 1, priority: 1 },
  upgrade: { variants: 1, gain: 1, priority: 2 },
  event: { variants: 1, gain: 1, priority: 1 },
  reward: { variants: 1, gain: 1, priority: 2 },
  error: { variants: 1, gain: .9, priority: 1 },
  deploy: { variants: 2, gain: 1, priority: 1 },
  connect: { variants: 2, gain: 1, priority: 1 },
  route: { variants: 1, gain: 1, priority: 1 },
  move: { variants: 2, gain: 1, priority: 1 },
  field: { variants: 1, gain: 1, priority: 1 },
  cleanse: { variants: 1, gain: 1, priority: 1 },
  scrub: { variants: 1, gain: 1, priority: 1 },
  transmit: { variants: 2, gain: 1, priority: 2 },
  buffer: { variants: 1, gain: 1, priority: 2 },
  release: { variants: 1, gain: 1, priority: 2 },
  turn: { variants: 1, gain: 1, priority: 2 },
  hit: { variants: 3, gain: 1, priority: 2 },
  hurt: { variants: 2, gain: 1, priority: 3 },
  block: { variants: 2, gain: 1, priority: 2 },
  strike: { variants: 3, gain: 1, priority: 2 },
  breach: { variants: 2, gain: 1, priority: 3 },
  sever: { variants: 2, gain: 1, priority: 2 },
  jam: { variants: 2, gain: 1, priority: 2 },
  corrupt: { variants: 2, gain: 1, priority: 2 },
  malware: { variants: 2, gain: 1, priority: 2 },
  junk: { variants: 2, gain: 1, priority: 2 },
  charge: { variants: 1, gain: 1, priority: 2 },
  boss: { variants: 1, gain: 1, priority: 3 },
  enrage: { variants: 1, gain: 1, priority: 3 },
  death: { variants: 1, gain: 1, priority: 3 },
  defeat: { variants: 1, gain: 1, priority: 3 },
  arrive: { variants: 2, gain: 1, priority: 2 },
  dormant: { variants: 2, gain: 1, priority: 1 },
  aim: { variants: 2, gain: 1, priority: 0 },
  install: { variants: 2, gain: 1, priority: 2 },
  wear: { variants: 2, gain: 1, priority: 2 },
  breakdown: { variants: 1, gain: 1, priority: 3 },
  repair: { variants: 2, gain: 1, priority: 1 },
  quarantine: { variants: 2, gain: 1, priority: 1 },
  detonate: { variants: 1, gain: 1, priority: 3 },
  crate: { variants: 2, gain: 1, priority: 2 },
  message: { variants: 2, gain: 1, priority: 2 },
  reveal: { variants: 1, gain: 1, priority: 2 },
  warning: { variants: 1, gain: 1, priority: 3 },
  signal: { variants: 1, gain: 1, priority: 2 },
} as const;
export type EffectKind = keyof typeof EFFECTS;
/** pan −1…1 (clamped to ±.65), power scales gain (.5–1.2), delay in seconds (≤ 1),
 * variant picks a master (1-based) instead of the rotation, e.g. crate by contents. */
export interface EffectOptions { pan?: number; power?: number; delay?: number; variant?: number }
interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; priority: number }

/** Minimum spacing between two plays of the same cue. Hover, pickup and aim are
 * rate-limited harder so sweeping across a hand or re-aiming never becomes a rattle. */
const SPACING: Partial<Record<EffectKind, number>> = { hover: 110, pickup: 60, select: 60, draw: 60, aim: 110 };

export class EffectsPlayer {
  private readonly bus: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Set<Voice>();
  private readonly sequence = new Map<EffectKind, number>();
  private readonly lastAt = new Map<EffectKind, number>();
  private volume = 0;
  private unavailableReported = false;
  constructor(private readonly ctx: AudioContext, private readonly unavailable: () => void,
    private readonly accent: () => void) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = .003;
    this.limiter.release.value = .18;
    this.bus.connect(this.limiter).connect(ctx.destination);
  }
  preload() {
    return Promise.all(Object.entries(EFFECTS).flatMap(([kind, cue]) =>
      Array.from({ length: cue.variants }, (_, i) => this.load(`${kind}-${i + 1}`))));
  }
  private load(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(key);
    if (pending) return pending;
    const request = fetch(`${import.meta.env.BASE_URL}audio/effects/${key}.ogg`)
      .then(response => {
        if (!response.ok) throw new Error(`Effect unavailable: ${key}`);
        return response.arrayBuffer();
      }).then(data => this.ctx.decodeAudioData(data)).then(buffer => {
        this.buffers.set(key, buffer);
        return buffer;
      }).catch(() => {
        if (!this.unavailableReported) { this.unavailableReported = true; this.unavailable(); }
        return null;
      }).finally(() => this.loading.delete(key));
    this.loading.set(key, request);
    return request;
  }
  setVolume(volume: number) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    this.bus.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .015);
    if (!this.volume) this.stop();
  }
  stop() {
    for (const voice of this.voices) {
      voice.source.stop();
      this.release(voice);
    }
  }
  private release(voice: Voice) {
    voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect();
    this.voices.delete(voice);
  }
  play(kind: EffectKind, options: EffectOptions = {}) {
    // An unknown kind (e.g. a new intent without a mapped cue) must stay silent, never throw.
    const cue = EFFECTS[kind] as (typeof EFFECTS)[EffectKind] | undefined;
    if (!cue || !this.volume || document.hidden || this.ctx.state !== "running") return;
    const now = performance.now();
    if (now - (this.lastAt.get(kind) ?? -Infinity) < (SPACING[kind] ?? 28)) return;
    this.lastAt.set(kind, now);
    const chosen = Number.isFinite(options.variant) ? Math.max(1, Math.floor(options.variant!)) : 0;
    const variant = chosen ? (chosen - 1) % cue.variants : (this.sequence.get(kind) ?? 0) % cue.variants;
    if (!chosen) this.sequence.set(kind, variant + 1);
    const key = `${kind}-${variant + 1}`;
    const buffer = this.buffers.get(key);
    if (buffer) this.start(buffer, kind, options);
    else void this.load(key).then(loaded => {
      // A slow connection must never replay a stale hit in another scene.
      if (loaded && performance.now() - now < 250) this.start(loaded, kind, options);
    });
  }
  private start(buffer: AudioBuffer, kind: EffectKind, options: EffectOptions) {
    if (!this.volume || document.hidden || this.ctx.state !== "running") return;
    const cue = EFFECTS[kind];
    if (this.voices.size >= 12) {
      const quietest = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
      if (quietest.priority > cue.priority) return;
      quietest.source.stop(); this.release(quietest);
    }
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), pan = this.ctx.createStereoPanner();
    source.buffer = buffer;
    gain.gain.value = cue.gain * Math.max(.5, Math.min(1.2, options.power ?? 1));
    pan.pan.value = Math.max(-.65, Math.min(.65, options.pan ?? 0));
    source.connect(gain).connect(pan).connect(this.bus);
    const voice = { source, gain, pan, priority: cue.priority };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    const delay = Math.max(0, Math.min(1, options.delay ?? 0));
    source.start(this.ctx.currentTime + delay);
    if (cue.priority === 3) {
      if (delay) window.setTimeout(this.accent, delay * 1000);
      else this.accent();
    }
  }
}
