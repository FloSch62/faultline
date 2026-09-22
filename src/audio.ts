export type ScoreScene = "explore" | "battle" | "boss" | "shop" | "sanctuary" | "elite";
const tracks: Record<ScoreScene, string> = {
  explore: "the-last-relay",
  battle: "signal-and-steel",
  boss: "the-blackout-core",
  shop: "the-copper-market",
  sanctuary: "a-light-left-on",
  elite: "a-thousand-fractures",
};
export const TRACK_NAMES: Record<ScoreScene, string> = {
  explore: "The Last Relay",
  battle: "Signal & Steel",
  boss: "The Blackout Core",
  shop: "The Copper Market",
  sanctuary: "A Light Left On",
  elite: "A Thousand Fractures",
};
export interface AudioSettings {
  music: number;
  effects: number;
  muted: boolean;
  motion: boolean;
}
export class Soundscape {
  settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private players = [new Audio(), new Audio()];
  private active = 0;
  private scene: ScoreScene = "explore";
  private ready = false;
  private fade = 0;
  private transitioning = false;
  onUnavailable: (() => void) | null = null;
  constructor() {
    const defaults = { music: 0.5, effects: 0.65, muted: false, motion: true };
    try {
      const stored = JSON.parse(
        localStorage.getItem("faultline-settings-v2") || "{}",
      );
      this.settings = {
        music:
          typeof stored.music === "number"
            ? Math.max(0, Math.min(1, stored.music))
            : defaults.music,
        effects:
          typeof stored.effects === "number"
            ? Math.max(0, Math.min(1, stored.effects))
            : defaults.effects,
        muted: stored.muted === true,
        motion: stored.motion !== false,
      };
    } catch {
      this.settings = defaults;
    }
    for (const player of this.players) {
      player.loop = true;
      player.preload = "none";
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.players.forEach((p) => p.pause());
      else if (this.ready && !this.settings.muted)
        void this.players[this.active].play().catch(() => {});
    });
  }
  async unlock() {
    this.ctx ??= new AudioContext();
    await this.ctx.resume().catch(() => {});
    if (!this.ready) {
      this.ready = true;
      this.switchTrack(this.scene, true);
    }
  }
  setScene(scene: ScoreScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    if (this.ready) this.switchTrack(scene);
  }
  private switchTrack(scene: ScoreScene, initial = false) {
    cancelAnimationFrame(this.fade);
    const previous = this.players[this.active];
    if (!initial) this.active = 1 - this.active;
    const next = this.players[this.active];
    next.src = `${import.meta.env.BASE_URL}audio/${tracks[scene]}-instrumental.ogg`;
    next.volume = 0;
    if (!this.settings.muted && !document.hidden)
      void next.play().catch(() => this.onUnavailable?.());
    const start = performance.now();
    const oldVolume = previous.volume;
    this.transitioning = true;
    const fade = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / 1600));
      const volume = this.settings.muted ? 0 : this.settings.music * 0.65;
      next.volume = volume * t;
      if (previous !== next) previous.volume = oldVolume * (1 - t);
      if (t < 1) this.fade = requestAnimationFrame(fade);
      else {
        this.transitioning = false;
        if (previous !== next) previous.pause();
      }
    };
    this.fade = requestAnimationFrame(fade);
  }
  update(settings: Partial<AudioSettings>) {
    Object.assign(this.settings, settings);
    try {
      localStorage.setItem(
        "faultline-settings-v2",
        JSON.stringify(this.settings),
      );
    } catch {
      /* Optional browser storage. */
    }
    document.documentElement.classList.toggle(
      "reduced-motion",
      !this.settings.motion,
    );
    if (this.settings.muted)
      this.players.forEach((p) => {
        p.volume = 0;
        p.pause();
      });
    else if (this.ready) {
      if (!this.transitioning)
        this.players[this.active].volume = this.settings.music * 0.65;
      void this.players[this.active].play().catch(() => {});
    }
  }
  effect(
    kind:
      | "hover"
      | "card"
      | "connect"
      | "hit"
      | "hurt"
      | "reward"
      | "error"
      | "turn"
      | "field"
      | "cleanse"
      | "corrupt"
      | "move",
  ) {
    if (!this.ctx || this.settings.muted || !this.settings.effects) return;
    const ctx = this.ctx,
      now = ctx.currentTime;
    const tones: Record<typeof kind, number[]> = {
      hover: [260],
      card: [330, 494],
      connect: [392, 588, 784],
      hit: [73, 110],
      hurt: [52, 61],
      reward: [294, 440, 587, 880],
      error: [130, 123],
      turn: [147, 220, 294],
      field: [196, 294, 392, 588],
      cleanse: [523, 659, 784, 1047],
      corrupt: [65, 69, 98, 103],
      move: [220, 330, 440],
    };
    const duration =
      ["reward", "field", "cleanse"].includes(kind) ? 0.9 : ["hit", "hurt", "corrupt"].includes(kind) ? 0.5 : 0.18;
    tones[kind].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "hurt" || kind === "corrupt" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(
        frequency * (kind === "hit" ? 0.3 : 1),
        now + duration,
      );
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        (this.settings.effects * (kind === "hover" ? 0.014 : 0.07)) / (i + 1),
        now + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.022);
      osc.stop(now + duration + 0.05);
    });
    if (kind === "card" || kind === "hit" || kind === "hurt") {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length / 6));
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = kind === "card" ? 1800 : 400;
      gain.gain.value = this.settings.effects * 0.11;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    }
  }
}
