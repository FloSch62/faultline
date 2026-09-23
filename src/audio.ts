import { MusicRotation } from "./core/music.ts";
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
const battleTitles: Record<string, string> = {
  "signal-and-steel": "Signal & Steel", "copperlight-pursuit": "Copperlight Pursuit",
  "ghosts-in-the-relay": "Ghosts in the Relay", "redline-protocol": "Redline Protocol",
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
  private track = tracks.explore;
  private readonly rotation = new MusicRotation();
  private encounter = "";
  private battleTrack = "";
  private ready = false;
  private fade = 0;
  private transitioning = false;
  onUnavailable: (() => void) | null = null;
  onTrackChange: (() => void) | null = null;
  get trackTitle() { return this.scene === "battle" ? battleTitles[this.track] : TRACK_NAMES[this.scene]; }
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
      player.addEventListener("ended", () => {
        if (player !== this.players[this.active] || this.scene !== "battle") return;
        this.battleTrack = this.track = this.rotation.next();
        this.switchTrack();
        this.onTrackChange?.();
      });
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
      this.switchTrack(true);
    }
  }
  setScene(scene: ScoreScene, encounter = "") {
    if (scene === "battle" && (encounter !== this.encounter || !this.battleTrack)) {
      this.encounter = encounter;
      this.battleTrack = this.rotation.next();
    }
    const track = scene === "battle" ? this.battleTrack : tracks[scene];
    if (this.scene === scene && this.track === track) return;
    this.scene = scene;
    this.track = track;
    if (this.ready) this.switchTrack();
    this.onTrackChange?.();
  }
  private switchTrack(initial = false) {
    cancelAnimationFrame(this.fade);
    const previous = this.players[this.active];
    if (!initial) this.active = 1 - this.active;
    const next = this.players[this.active];
    next.src = `${import.meta.env.BASE_URL}audio/${this.track}-instrumental.ogg`;
    next.loop = this.scene !== "battle";
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
      | "strike" | "breach" | "sever" | "jam" | "boss" | "enrage"
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
      strike: [82, 123, 164], breach: [49, 73, 98, 147],
      sever: [880, 440, 110], jam: [185, 196, 207],
      boss: [49, 73, 110, 147], enrage: [55, 58, 82, 110],
    };
    const duration =
      ["boss", "enrage"].includes(kind) ? 1.8 : ["reward", "field", "cleanse"].includes(kind) ? 0.9 : ["hit", "hurt", "corrupt", "strike", "breach", "sever", "jam"].includes(kind) ? 0.5 : 0.18;
    tones[kind].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = ["hurt", "corrupt", "sever", "jam", "breach", "enrage"].includes(kind) ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(
        frequency * (["hit", "strike", "sever", "breach"].includes(kind) ? 0.3 : kind === "boss" ? 1.5 : 1),
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
