# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.2.6", "scipy==1.15.3", "soundfile==0.13.1"]
# ///
"""Build the bundled Foley/cinematic effects: uv run scripts/build_effects.py.

Only this production tool downloads sources. The game is completely local.
Original selected CC0 recordings, licenses and per-master provenance are retained.

Every cue answers one game moment (see the CUE GUIDE in src/audio-effects.ts).
The palette is tactile and material: paper for cards, metal latches and relay
switches for hardware, glass and a soft electrical field for signal, low plates
and bells for danger. No chip-wave oscillators, retro lasers or tonal UI bleeps.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import urllib.request
import zipfile

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "soundtrack/effects/sources"
OUTPUT = ROOT / "public/audio/effects"
RATE = 44100
PEAK = .70  # -3.1 dBFS sample peak ceiling for every master
PACKS = {
    "impact": ("impact-sounds", "87b4ddecda-1677589768/kenney_impact-sounds.zip"),
    "casino": ("casino-audio", "2472606a04-1721639069/kenney_casino-audio.zip"),
    "scifi": ("sci-fi-sounds", "6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip"),
    "interface": ("interface-sounds", "fa43c1dd4d-1677589452/kenney_interface-sounds.zip"),
    "uiaudio": ("ui-audio", "490d233f68-1677590494/kenney_ui-audio.zip"),
    "rpg": ("rpg-audio", "8e99002d76-1677590336/kenney_rpg-audio.zip"),
}


def layer(pack, name, gain=1., speed=1., delay=0., reverse=False, start=0., length=None, lp=None, hp=None):
    """One recording in a cue.

    name   -- a file stem, or a tuple of stems rotated per variant (natural variation)
    start  -- seconds into the trimmed source (lets long beds contribute a short slice)
    length -- seconds kept after `start` (None keeps the whole recording)
    lp/hp  -- optional low/high-pass cutoffs in Hz, e.g. to tame pneumatic hiss
    """
    return dict(pack=pack, name=name, gain=gain, speed=speed, delay=delay, reverse=reverse,
                start=start, length=length, lp=lp, hp=hp)


def names(spec):
    return spec["name"] if isinstance(spec["name"], (list, tuple)) else (spec["name"],)


# cue: (layers, reflection seconds, short-term loudness target dBFS (50 ms), variants[, drive dB])
# Loudness tiers: whisper UI (-30…-23) < cards (-21…-18) < construction (-18…-14)
# < combat (-14…-11) < climax. Transients usually reach the -3 dB peak ceiling first.
RECIPES = {
    # ---- interface and cards -------------------------------------------------
    "hover": ([layer("uiaudio", ("rollover4", "rollover5"), .8)], .04, -30, 2),
    "pickup": ([layer("casino", ("card-slide-4", "card-slide-5", "card-slide-2"), .9, 1.05, lp=9500),
                layer("uiaudio", "click3", .12, 1.1, .015)], .05, -25, 3),
    "select": ([layer("uiaudio", ("switch23", "switch22"), .85),
                layer("impact", "impactWood_light_000", .25, 1.05)], .06, -23, 2),
    "undo": ([layer("casino", "card-slide-1", .8, .95, reverse=True),
              layer("uiaudio", "switch19", .3, .9, .06)], .05, -25, 1),
    "card": ([layer("casino", ("card-place-1", "card-place-3", "card-place-2")),
              layer("impact", "impactWood_light_000", .22, .85)], .08, -20, 3),
    "draw": ([layer("casino", "card-slide-2", .9, 1.04),
              layer("casino", "card-slide-5", .7, 1.08, .075)], .05, -23, 2),
    "deal": ([layer("casino", "card-slide-2", .9, 1.08),
              layer("casino", "card-slide-4", .8, 1.1, .055),
              layer("casino", "card-slide-1", .75, 1.06, .11),
              layer("casino", "card-slide-5", .7, 1.1, .165),
              layer("casino", "card-slide-6", .62, 1.08, .22),
              layer("casino", "card-slide-2", .55, 1.12, .275),
              layer("casino", "card-place-3", .3, 1.0, .33)], .07, -21, 2),
    "shuffle": ([layer("casino", "card-shuffle", .9, 1.0, length=1.15),
                 layer("casino", "card-place-1", .45, .95, 1.08)], .08, -21, 1, 1.5),
    "instant": ([layer("casino", "card-place-1", .8),
                 layer("impact", ("impactGlass_light_000", "impactGlass_light_001", "impactGlass_light_002"), .35, 1.25, .03),
                 layer("scifi", "forceField_002", .28, 1.6, .02, start=.05, length=.25, hp=300)], .12, -19, 3),
    "protocol": ([layer("casino", "card-place-2", .7, .95),
                  layer("uiaudio", "switch16", .3, 1.0, .02),
                  layer("rpg", "metalLatch", .55, 1.0, .06)], .1, -19, 2),
    "trigger": ([layer("rpg", "metalLatch", 1., .9),
                 layer("impact", "impactPlate_light_003", .6, 1.0, .01),
                 layer("scifi", "forceField_001", .45, 1.4, start=.05, length=.35),
                 layer("impact", "impactGlass_heavy_004", .3, 1.2, .03)], .22, -13, 2, 2.5),
    "console": ([layer("uiaudio", ("switch31", "switch30"), .9),
                 layer("scifi", "forceField_000", .35, 1.5, .03, start=.08, length=.3, hp=250),
                 layer("impact", "impactMetal_light_004", .2, 1.2)], .12, -18, 2, 1.5),
    "navigate": ([layer("uiaudio", ("switch23", "switch27"), .7),
                  layer("impact", "impactWood_heavy_001", .45, .9, .01),
                  layer("rpg", "bookFlip3", .35, 1.0, .03)], .12, -19, 2),
    "coins": ([layer("rpg", "handleCoins2", .7),
               layer("casino", ("chips-stack-3", "chips-stack-1"), .6, 1.0, .05),
               layer("casino", "chips-collide-1", .4, 1.0, .12)], .12, -19, 2, 3),
    "upgrade": ([layer("impact", "impactMetal_heavy_001", .9, .85),
                 layer("impact", "impactBell_heavy_002", .5, 1.25, .02),
                 layer("impact", "impactGlass_light_003", .4, 1.6, .15),
                 layer("impact", "impactGlass_light_004", .35, 2.0, .24)], .35, -16, 1),
    "event": ([layer("rpg", "creak1", .45, .8),
               layer("scifi", "computerNoise_003", .25, 1.0, start=.8, length=.7, lp=5000, hp=300),
               layer("impact", "impactBell_heavy_000", .35, .8, .2, reverse=True)], .45, -18, 1),
    "reward": ([layer("impact", "impactBell_heavy_000", .4, 1.35),
                layer("casino", "chips-handle-1", .45, 1., .15)], .55, -17, 1, 1.5),
    "error": ([layer("impact", "impactWood_medium_000", .65, .75),
               layer("impact", "impactWood_medium_000", .35, .65, .09)], .06, -19, 1),
    # ---- construction and signal --------------------------------------------
    "deploy": ([layer("impact", ("impactMetal_heavy_000", "impactMetal_heavy_003"), 1., .9),
                layer("rpg", "metalLatch", .55, 1.0, .06),
                layer("scifi", "forceField_000", .35, 1.2, .08, start=.05, length=.45, hp=200),
                layer("impact", "impactPlate_light_000", .25)], .22, -14, 2, 1.5),
    "connect": ([layer("uiaudio", ("switch20", "switch25"), .8),
                 layer("impact", "impactMetal_light_000", .45, 1.0, .01),
                 layer("scifi", "forceField_002", .25, 1.8, .04, start=.1, length=.25, hp=400)], .16, -16, 2),
    "route": ([layer("scifi", "forceField_004", .7, 1.15, length=.5),
               layer("impact", "impactGlass_light_003", .35, 1.5, .12),
               layer("impact", "impactBell_heavy_002", .2, 1.8, .1)], .35, -17, 1),
    "move": ([layer("scifi", ("doorOpen_000", "doorOpen_001"), .3, .9, length=.3, lp=5000),
              layer("impact", "impactMetal_medium_003", .6, 1.0, .2),
              layer("uiaudio", "switch17", .3, 1.0, .22)], .15, -18, 2),
    "field": ([layer("scifi", "forceField_003", .6, .85),
               layer("impact", "impactGlass_medium_000", .3, 1.2, .08)], .6, -16, 1),
    "cleanse": ([layer("impact", "impactGlass_heavy_002", .35, .85, 0, True),
                 layer("impact", "impactBell_heavy_002", .45, 1.5, .2)], .6, -16, 1),
    "scrub": ([layer("rpg", "knifeSlice", .6, 1.1, hp=500),
               layer("interface", "scratch_002", .25, 1.0, .02, lp=8000),
               layer("impact", "impactGlass_light_001", .4, 1.3, .08)], .2, -17, 1),
    "transmit": ([layer("uiaudio", ("switch18", "switch16"), .8),
                  layer("impact", "impactMetal_light_002", .3),
                  layer("scifi", "forceField_004", .35, 1.3, .02, length=.4),
                  layer("scifi", "thrusterFire_000", .45, 1.0, .03, start=1., length=.55, lp=7500)], .2, -15, 2),
    "buffer": ([layer("scifi", "thrusterFire_003", .5, 1.0, reverse=True, start=.9, length=.45, lp=6000),
                layer("scifi", "forceField_003", .3, .8, .3, length=.4),
                layer("rpg", "metalLatch", .7, .95, .42)], .2, -16, 1),
    "release": ([layer("scifi", "forceField_002", .6, .7, length=.5),
                 layer("impact", "impactPunch_medium_000", .5, 1.0, .02),
                 layer("scifi", "explosionCrunch_000", .35, 1.15, .05, length=.5),
                 layer("scifi", "thrusterFire_001", .6, 1.0, start=1., length=.6, lp=7000)], .3, -13, 1),
    "turn": ([layer("impact", "impactPlate_heavy_001", .7, .8),
              layer("scifi", "forceField_003", .5, .75, length=.6),
              layer("impact", "impactBell_heavy_003", .35, .7, .05),
              layer("scifi", "lowFrequency_explosion_001", .3, 1.2)], .45, -15, 1),
    # ---- hostile actions and combat -----------------------------------------
    "hit": ([layer("impact", "impactPunch_heavy_000", .8, .85), layer("impact", "impactGlass_heavy_000", .35, .8, .02)], .42, -12.5, 3),
    "hurt": ([layer("impact", "impactMetal_heavy_001", .7, .7), layer("scifi", "lowFrequency_explosion_000", .4, 1.2)], .42, -11.5, 2),
    "block": ([layer("impact", "impactPlate_heavy_000", .75), layer("scifi", "forceField_002", .18, 1.5)], .34, -13.5, 2),
    "strike": ([layer("impact", "impactPunch_heavy_003", 1., .68), layer("impact", "impactPlate_heavy_002", .35, .8, .02)], .5, -12, 3),
    "breach": ([layer("scifi", "explosionCrunch_001", .4, .8), layer("impact", "impactMetal_heavy_003", .8, .6),
                layer("scifi", "lowFrequency_explosion_001", .4, .8)], .7, -12.5, 2, 2.5),
    "sever": ([layer("impact", ("impactGlass_heavy_001", "impactGlass_heavy_003"), .9, .9),
               layer("impact", "impactMetal_light_003", .5, .75),
               layer("interface", "glitch_003", .35, 1.0, .01),
               layer("scifi", "thrusterFire_001", .3, 1.4, start=1., length=.3, lp=7000)], .4, -13, 2, 4),
    "jam": ([layer("impact", "impactMetal_medium_001", .5, .9),
             layer("scifi", "forceField_001", .5, .75),
             layer("interface", "glitch_004", .35, 1.0, .05),
             layer("scifi", "computerNoise_001", .3, 1.0, .05, start=2., length=.6, lp=6000, hp=400)], .45, -14.5, 2),
    "corrupt": ([layer("scifi", "slime_000", .45, .7),
                 layer("scifi", "spaceEngineLow_000", .35, 1.3, start=1.5, length=1.2)], .55, -17, 2),
    "malware": ([layer("scifi", "slime_000", .6, .85),
                 layer("interface", ("glitch_001", "glitch_002"), .5, 1.0, .02),
                 layer("impact", "impactSoft_medium_000", .4),
                 layer("scifi", "spaceEngineLow_002", .25, 1.4, start=.3, length=.6)], .35, -15, 2),
    "junk": ([layer("casino", ("card-shove-3", "card-shove-4"), .7),
              layer("interface", "glitch_002", .4, 1.0, .1),
              layer("scifi", "slime_000", .25, 1.2, .05)], .2, -17, 2, 2.5),
    "charge": ([layer("impact", "impactPlate_heavy_003", .4, .5, 0, True), layer("scifi", "spaceEngineLarge_000", .3, .8, length=2.0)], .6, -17, 1),
    "boss": ([layer("impact", "impactBell_heavy_003", .65, .5), layer("scifi", "lowFrequency_explosion_001", .6, .65),
              layer("impact", "impactMetal_heavy_003", .3, .6, .15)], 1.25, -11, 1),
    "enrage": ([layer("scifi", "spaceEngineLarge_003", .3, .7, length=2.0), layer("impact", "impactGlass_heavy_004", .55, .55, .1),
                layer("impact", "impactBell_heavy_003", .35, .6, .2)], 1.15, -13, 1),
    "death": ([layer("scifi", "explosionCrunch_004", .4, .65), layer("impact", "impactGlass_heavy_003", .6, .6, .1),
               layer("impact", "impactMetal_heavy_002", .5, .75)], .9, -12.5, 1),
    "defeat": ([layer("impact", "impactBell_heavy_001", .65, .48), layer("scifi", "spaceEngineLow_003", .3, .6, length=2.0)], 1.5, -15, 1),
}


def used_sources():
    wanted = {}
    for recipe, *_ in RECIPES.values():
        for spec in recipe:
            wanted.setdefault(spec["pack"], set()).update(f"{n}.ogg" for n in names(spec))
    return wanted


def obtain_sources():
    for pack, files in used_sources().items():
        slug, file = PACKS[pack]
        target = SOURCE / pack
        target.mkdir(parents=True, exist_ok=True)
        if all((target / name).exists() for name in files) and (target / "License.txt").exists():
            continue
        url = f"https://kenney.nl/media/pages/assets/{slug}/{file}"
        with urllib.request.urlopen(url, timeout=90) as response:
            archive = zipfile.ZipFile(BytesIO(response.read()))
        for name in sorted(files | {"License.txt"}):
            matches = [p for p in archive.namelist() if Path(p).name == name]
            if len(matches) != 1:
                raise ValueError(f"Missing or ambiguous source {pack}/{name}")
            (target / name).write_bytes(archive.read(matches[0]))


def prune_sources():
    """Keep exactly the recordings the recipes use, plus each pack's license."""
    wanted = used_sources()
    for path in SOURCE.rglob("*.ogg"):
        if path.name not in wanted.get(path.parent.name, set()):
            path.unlink()
    for pack_dir in SOURCE.iterdir():
        if pack_dir.is_dir() and pack_dir.name not in wanted:
            for path in pack_dir.iterdir():
                path.unlink()
            pack_dir.rmdir()


def filtered(data, lp, hp):
    if lp:
        data = sosfilt(butter(2, lp, btype="lowpass", fs=RATE, output="sos"), data)
    if hp:
        data = sosfilt(butter(2, hp, btype="highpass", fs=RATE, output="sos"), data)
    return data


def material(spec, variant_index, variation):
    choices = names(spec)
    name = choices[variant_index % len(choices)]
    path = SOURCE / spec["pack"] / (name + ".ogg")
    data, rate = sf.read(path, always_2d=True)
    data = data.mean(axis=1)
    # Trim source silence so feedback begins on the animation's contact frame.
    active = np.flatnonzero(abs(data) > max(abs(data).max() * .018, .0002))
    if not len(active):
        raise ValueError(f"Silent source: {path}")
    data = data[max(0, active[0] - int(rate * .003)):active[-1] + 1]
    sliced = spec["start"] > 0 or spec["length"] is not None
    if sliced:
        begin = int(spec["start"] * rate)
        end = len(data) if spec["length"] is None else begin + int(spec["length"] * rate)
        data = data[begin:end]
        if len(data) < rate * .02:
            raise ValueError(f"Slice too short: {path}")
    speed = spec["speed"] * (1 + variation * .045)
    data = np.interp(np.arange(0, len(data) - 1, rate * speed / RATE), np.arange(len(data)), data)
    data = data[:int(RATE * 2.4)]
    data = filtered(data, spec["lp"], spec["hp"])
    if spec["reverse"]:
        data = data[::-1].copy()
    # A slice cut from the middle of a bed needs a gentler entry and exit.
    rise = min(int(RATE * (.012 if sliced else .002)), len(data) // 4)
    fade = min(int(RATE * (.06 if sliced else .014)), len(data) // 2)
    data[:rise] *= np.linspace(0, 1, rise)
    data[-fade:] *= np.linspace(1, 0, fade)
    return data * spec["gain"]


def short_term_db(stereo, window=.05):
    mono = stereo.mean(axis=1)
    n = max(1, int(RATE * window))
    power = np.convolve(mono ** 2, np.ones(n) / n, mode="valid")
    return 10 * np.log10(max(power.max(), 1e-12))


def soft_limit(stereo, ceiling):
    """Smooth knee above 55 % of the ceiling; never exceeds the ceiling."""
    knee = ceiling * .55
    magnitude = abs(stereo)
    over = magnitude > knee
    shaped = knee + (ceiling - knee) * np.tanh((magnitude[over] - knee) / (ceiling - knee))
    out = stereo.copy()
    out[over] = np.sign(stereo[over]) * shaped
    return out


def master(recipe, tail, loudness, variant_index, variation, drive=0.):
    layers = [(material(spec, variant_index, variation), int(spec["delay"] * RATE)) for spec in recipe]
    length = max(len(data) + delay for data, delay in layers)
    dry = np.zeros(length)
    for data, delay in layers:
        dry[delay:delay + len(data)] += data
    dry = sosfilt(butter(2, [45, 11500], btype="bandpass", fs=RATE, output="sos"), dry)
    stereo = np.zeros((length + int(tail * RATE), 2))
    stereo[:length] = dry[:, None]
    # Deterministic asymmetric reflections give recorded materials depth without
    # turning every action into a musical note or a long, muddy reverb wash.
    for i in range(1, 15):
        for channel in range(2):
            delay = int(RATE * tail * (i / 16 + channel * .009))
            reflected = sosfilt(butter(1, max(800, 6500 - i * 370), fs=RATE, output="sos"), dry)
            stereo[delay:delay + length, channel] += reflected * (.19 * np.exp(-i * .27))
    # Match perceived punch (loudest 50 ms), not whole-file RMS: a long tail must
    # not make a short cue louder, and every tier stays under the same peak ceiling.
    desired = 10 ** ((loudness - short_term_db(stereo)) / 20)
    ceiling_gain = PEAK / max(abs(stereo).max(), 1e-8)
    if desired <= ceiling_gain or not drive:
        stereo *= min(desired, ceiling_gain)
    else:
        # Percussive cues may push up to `drive` dB into a soft knee for body.
        stereo = soft_limit(stereo * min(desired, ceiling_gain * 10 ** (drive / 20)), PEAK)
    stereo[-int(RATE * .03):] *= np.linspace(1, 0, int(RATE * .03))[:, None]
    return stereo


def main():
    obtain_sources()
    prune_sources()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT.glob("*.ogg"):
        stale.unlink()
    for stale in OUTPUT.glob("LICENSE-*.txt"):
        stale.unlink()
    packs = sorted(used_sources())
    for pack in packs:
        (OUTPUT / f"LICENSE-{pack}.txt").write_bytes((SOURCE / pack / "License.txt").read_bytes())
    manifest = {"license": "CC0-1.0", "author": "Kenney", "sampleRate": RATE, "peakCeiling": PEAK,
                "loudness": "short-term (50 ms) maximum, dBFS",
                "sources": {p: f"https://kenney.nl/assets/{PACKS[p][0]}" for p in packs}, "cues": {}}
    for cue, (recipe, tail, loudness, variants, *options) in RECIPES.items():
        drive = options[0] if options else 0.
        masters = []
        for variant in range(variants):
            data = master(recipe, tail, loudness, variant, variant - (variants - 1) / 2, drive)
            path = OUTPUT / f"{cue}-{variant + 1}.ogg"
            sf.write(path, data, RATE, format="OGG", subtype="VORBIS")
            decoded, _ = sf.read(path, always_2d=True)
            peak = float(abs(decoded).max())
            if not np.isfinite(decoded).all() or peak >= .98:
                raise ValueError(f"Invalid master: {path}, peak {peak}")
            masters.append({"file": path.name, "seconds": round(len(data) / RATE, 3), "peakDb": round(20 * np.log10(peak), 2),
                            "shortTermDb": round(short_term_db(decoded), 2),
                            "rmsDb": round(20 * np.log10(np.sqrt(np.mean(decoded ** 2))), 2), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        manifest["cues"][cue] = {"layers": recipe, "reflectionSeconds": tail, "targetShortTermDb": loudness, "masters": masters}
    source_hashes = {str(p.relative_to(SOURCE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCE.rglob("*.ogg"))}
    manifest["sourceHashes"] = source_hashes
    (SOURCE.parent / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(len(c["masters"]) for c in manifest["cues"].values())
    size = sum(p.stat().st_size for p in OUTPUT.glob("*.ogg")) / 1024
    print(f"Mastered {total} files for {len(RECIPES)} cues; {size:.0f} KiB.")
    for cue, entry in manifest["cues"].items():
        m = entry["masters"][0]
        print(f"  {cue:9} {m['seconds']:5.2f}s  short-term {m['shortTermDb']:6.1f} (target {entry['targetShortTermDb']})  peak {m['peakDb']:6.1f}")


if __name__ == "__main__":
    main()
