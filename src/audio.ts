/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import { MusicRotation, sceneTrack, TRACK_TITLES, type ScoreScene } from "./core/music.ts";
import { STAGES } from "./core/stages.ts";
import { EffectsPlayer, type EffectKind, type EffectOptions } from "./audio-effects.ts";
export type { ScoreScene } from "./core/music.ts";
export interface AudioSettings {
  music: number;
  effects: number;
  muted: boolean;
  motion: boolean;
}
export class Soundscape {
  settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private effects: EffectsPlayer | null = null;
  private musicBus: GainNode | null = null;
  private players = [new Audio(), new Audio()];
  private active = 0;
  private scene: ScoreScene = "explore";
  private track = sceneTrack("explore", null);
  private readonly rotations = STAGES.map(stage => new MusicRotation(stage.music.battle));
  private battleStage = 0;
  private encounter = "";
  private battleTrack = "";
  private ready = false;
  private fade = 0;
  private transitioning = false;
  onUnavailable: (() => void) | null = null;
  onTrackChange: (() => void) | null = null;
  get trackTitle() { return TRACK_TITLES[this.track]; }
  constructor() {
    const defaults = { music: 0.5, effects: 0.65, muted: false, motion: true };
    try {
      const stored = JSON.parse(
        localStorage.getItem("faultline-settings-v2") || "{}",
      );
      this.settings = {
        music:
          typeof stored.music === "number" && Number.isFinite(stored.music)
            ? Math.max(0, Math.min(1, stored.music))
            : defaults.music,
        effects:
          typeof stored.effects === "number" && Number.isFinite(stored.effects)
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
        this.battleTrack = this.track = this.rotations[this.battleStage].next();
        this.switchTrack();
        this.onTrackChange?.();
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.players.forEach((p) => p.pause());
        this.effects?.stop();
        void this.ctx?.suspend().catch(() => {});
      } else if (this.ready) {
        void this.ctx?.resume().catch(() => {});
        if (!this.settings.muted) void this.players[this.active].play().catch(() => {});
      }
    });
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      for (const player of this.players) this.ctx.createMediaElementSource(player).connect(this.musicBus);
      this.effects = new EffectsPlayer(this.ctx, () => this.onUnavailable?.(), () => {
        const now = this.ctx!.currentTime, gain = this.musicBus!.gain;
        gain.cancelScheduledValues(now);
        gain.setTargetAtTime(.58, now, .035);
        gain.setTargetAtTime(1, now + .6, .3);
      });
      this.effects.setVolume(this.settings.muted ? 0 : this.settings.effects);
      void this.effects.preload();
    }
    await this.ctx.resume().catch(() => {});
    if (!this.ready) {
      this.ready = true;
      this.switchTrack(true);
    }
  }
  setScene(scene: ScoreScene, encounter = "", stage: number | null = null) {
    const battleStage = stage !== null && STAGES[stage] ? stage : 0;
    if (scene === "battle" && (encounter !== this.encounter || battleStage !== this.battleStage || !this.battleTrack)) {
      this.encounter = encounter;
      this.battleStage = battleStage;
      this.battleTrack = this.rotations[battleStage].next();
    }
    const track = scene === "battle" ? this.battleTrack : sceneTrack(scene, stage);
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
    for (const key of ["music", "effects"] as const) {
      const value = settings[key];
      if (typeof value === "number" && Number.isFinite(value)) this.settings[key] = Math.max(0, Math.min(1, value));
    }
    if (typeof settings.muted === "boolean") this.settings.muted = settings.muted;
    if (typeof settings.motion === "boolean") this.settings.motion = settings.motion;
    this.effects?.setVolume(this.settings.muted ? 0 : this.settings.effects);
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
  effect(kind: EffectKind, options?: EffectOptions) {
    if (!this.settings.muted) this.effects?.play(kind, options);
  }
}
