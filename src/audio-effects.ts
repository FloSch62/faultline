/** Bundled, mastered material recordings. See soundtrack/effects/manifest.json. */
export const EFFECTS = {
  hover: { variants: 2, gain: .5, priority: 0 },
  select: { variants: 2, gain: .65, priority: 0 },
  card: { variants: 3, gain: .8, priority: 1 },
  draw: { variants: 1, gain: .55, priority: 0 },
  deploy: { variants: 2, gain: .9, priority: 1 },
  connect: { variants: 2, gain: .8, priority: 1 },
  hit: { variants: 3, gain: 1, priority: 2 },
  hurt: { variants: 2, gain: 1, priority: 3 },
  block: { variants: 2, gain: .85, priority: 2 },
  reward: { variants: 1, gain: .8, priority: 2 },
  error: { variants: 1, gain: .65, priority: 1 },
  turn: { variants: 2, gain: .85, priority: 1 },
  field: { variants: 1, gain: .8, priority: 1 },
  cleanse: { variants: 1, gain: .85, priority: 1 },
  corrupt: { variants: 2, gain: .85, priority: 2 },
  move: { variants: 2, gain: .75, priority: 1 },
  strike: { variants: 3, gain: 1, priority: 2 },
  breach: { variants: 2, gain: 1, priority: 3 },
  sever: { variants: 2, gain: .9, priority: 2 },
  jam: { variants: 2, gain: .9, priority: 2 },
  charge: { variants: 1, gain: .7, priority: 2 },
  boss: { variants: 1, gain: 1, priority: 3 },
  enrage: { variants: 1, gain: 1, priority: 3 },
  death: { variants: 1, gain: 1, priority: 3 },
  defeat: { variants: 1, gain: .95, priority: 3 },
} as const;
export type EffectKind = keyof typeof EFFECTS;
export interface EffectOptions { pan?: number; power?: number }
interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; priority: number }

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
    if (!this.volume || document.hidden || this.ctx.state !== "running") return;
    const now = performance.now();
    if (now - (this.lastAt.get(kind) ?? -Infinity) < (kind === "hover" ? 90 : 28)) return;
    this.lastAt.set(kind, now);
    const cue = EFFECTS[kind];
    const variant = (this.sequence.get(kind) ?? 0) % cue.variants;
    this.sequence.set(kind, variant + 1);
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
    source.start();
    if (cue.priority === 3) this.accent();
  }
}
