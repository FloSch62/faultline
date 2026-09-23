# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.2.6", "scipy==1.15.3", "soundfile==0.13.1"]
# ///
"""Build the bundled Foley/cinematic effects: uv run scripts/build_effects.py.

Only this production tool downloads sources. The game is completely local.
Original selected CC0 recordings, licenses and per-master provenance are retained.
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
PACKS = {
    "impact": ("impact-sounds", "87b4ddecda-1677589768/kenney_impact-sounds.zip"),
    "casino": ("casino-audio", "2472606a04-1721639069/kenney_casino-audio.zip"),
    "scifi": ("sci-fi-sounds", "6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip"),
}


def layer(pack, name, gain=1., speed=1., delay=0., reverse=False):
    return dict(pack=pack, name=name, gain=gain, speed=speed, delay=delay, reverse=reverse)


# Material attacks have a clear transient, body and an airy tail. No chip-wave
# oscillators, retro lasers or tonal UI bleeps are used in any recipe.
RECIPES = {
    "hover": ([layer("casino", "card-slide-1", .5)], .07, -26, 2),
    "select": ([layer("casino", "card-fan-1", .8)], .06, -22, 2),
    "card": ([layer("casino", "card-place-1"), layer("impact", "impactWood_light_000", .25, .85)], .10, -20, 3),
    "draw": ([layer("casino", "card-shuffle", .8)], .06, -23, 1),
    "deploy": ([layer("scifi", "doorClose_000", .45, .8), layer("impact", "impactMetal_medium_000", .8)], .28, -19, 2),
    "connect": ([layer("impact", "impactMetal_light_000", .6), layer("scifi", "forceField_000", .18, 1.3, .04)], .22, -21, 2),
    "hit": ([layer("impact", "impactPunch_heavy_000", .8, .85), layer("impact", "impactGlass_heavy_000", .35, .8, .02)], .42, -17, 3),
    "hurt": ([layer("impact", "impactMetal_heavy_001", .7, .7), layer("scifi", "lowFrequency_explosion_000", .4, 1.2)], .42, -18, 2),
    "block": ([layer("impact", "impactPlate_heavy_000", .75), layer("scifi", "forceField_002", .18, 1.5)], .34, -18, 2),
    "reward": ([layer("impact", "impactBell_heavy_000", .4, 1.35), layer("casino", "chips-handle-1", .45, 1., .15)], .65, -21, 1),
    "error": ([layer("impact", "impactWood_medium_000", .65, .75), layer("impact", "impactWood_medium_000", .35, .65, .09)], .06, -24, 1),
    "turn": ([layer("scifi", "thrusterFire_000", .35, 1.3), layer("impact", "impactMetal_light_002", .5, .8)], .25, -22, 2),
    "field": ([layer("scifi", "forceField_003", .6, .85), layer("impact", "impactGlass_medium_000", .3, 1.2, .08)], .65, -22, 1),
    "cleanse": ([layer("impact", "impactGlass_heavy_002", .35, .85, 0, True), layer("impact", "impactBell_heavy_002", .45, 1.5, .2)], .7, -21, 1),
    "corrupt": ([layer("scifi", "slime_000", .45, .7), layer("scifi", "spaceEngineLow_000", .35, 1.3)], .65, -22, 2),
    "move": ([layer("scifi", "doorOpen_000", .25, 1.5), layer("impact", "impactMetal_light_002", .55, .9, .1)], .15, -22, 2),
    "strike": ([layer("impact", "impactPunch_heavy_003", 1., .68), layer("impact", "impactPlate_heavy_002", .35, .8, .02)], .5, -17, 3),
    "breach": ([layer("scifi", "explosionCrunch_001", .4, .8), layer("impact", "impactMetal_heavy_003", .8, .6), layer("scifi", "lowFrequency_explosion_001", .4, .8)], .7, -17, 2),
    "sever": ([layer("impact", "impactGlass_heavy_001", .8, .9), layer("impact", "impactMetal_light_003", .5, .75), layer("scifi", "thrusterFire_001", .2, 1.4)], .45, -18, 2),
    "jam": ([layer("scifi", "doorClose_002", .6, .65), layer("scifi", "forceField_001", .3, .75)], .6, -21, 2),
    "charge": ([layer("impact", "impactPlate_heavy_003", .4, .5, 0, True), layer("scifi", "spaceEngineLarge_000", .3, .8)], .6, -24, 1),
    "boss": ([layer("impact", "impactBell_heavy_003", .65, .5), layer("scifi", "lowFrequency_explosion_001", .6, .65), layer("impact", "impactMetal_heavy_003", .3, .6, .15)], 1.25, -19, 1),
    "enrage": ([layer("scifi", "spaceEngineLarge_003", .3, .7), layer("impact", "impactGlass_heavy_004", .55, .55, .1), layer("impact", "impactBell_heavy_003", .35, .6, .2)], 1.15, -19, 1),
    "death": ([layer("scifi", "explosionCrunch_004", .4, .65), layer("impact", "impactGlass_heavy_003", .6, .6, .1), layer("impact", "impactMetal_heavy_002", .5, .75)], .9, -19, 1),
    "defeat": ([layer("impact", "impactBell_heavy_001", .65, .48), layer("scifi", "spaceEngineLow_003", .3, .6)], 1.5, -23, 1),
}


def obtain_sources():
    for pack, (slug, file) in PACKS.items():
        names = {l["name"] + ".ogg" for recipe, *_ in RECIPES.values() for l in recipe if l["pack"] == pack}
        target = SOURCE / pack
        target.mkdir(parents=True, exist_ok=True)
        if all((target / name).exists() for name in names) and (target / "License.txt").exists():
            continue
        url = f"https://kenney.nl/media/pages/assets/{slug}/{file}"
        with urllib.request.urlopen(url, timeout=45) as response:
            archive = zipfile.ZipFile(BytesIO(response.read()))
        for name in sorted(names | {"License.txt"}):
            matches = [p for p in archive.namelist() if Path(p).name == name]
            if len(matches) != 1:
                raise ValueError(f"Missing or ambiguous source {pack}/{name}")
            (target / name).write_bytes(archive.read(matches[0]))


def material(spec, variation):
    path = SOURCE / spec["pack"] / (spec["name"] + ".ogg")
    data, rate = sf.read(path, always_2d=True)
    data = data.mean(axis=1)
    # Trim source silence so feedback begins on the animation's contact frame.
    active = np.flatnonzero(abs(data) > max(abs(data).max() * .018, .0002))
    if not len(active):
        raise ValueError(f"Silent source: {path}")
    data = data[max(0, active[0] - int(rate * .003)):active[-1] + 1]
    speed = spec["speed"] * (1 + variation * .045)
    data = np.interp(np.arange(0, len(data) - 1, rate * speed / RATE), np.arange(len(data)), data)
    data = data[:int(RATE * 2.4)]
    if spec["reverse"]:
        data = data[::-1].copy()
    fade = min(int(RATE * .014), len(data) // 2)
    data[:min(88, len(data))] *= np.linspace(0, 1, min(88, len(data)))
    data[-fade:] *= np.linspace(1, 0, fade)
    return data * spec["gain"]


def master(recipe, tail, loudness, variation):
    layers = [(material(spec, variation), int(spec["delay"] * RATE)) for spec in recipe]
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
    rms = np.sqrt(np.mean(stereo ** 2))
    gain = min(10 ** (loudness / 20) / max(rms, 1e-8), .70 / max(abs(stereo).max(), 1e-8))
    stereo *= gain
    stereo[-int(RATE * .03):] *= np.linspace(1, 0, int(RATE * .03))[:, None]
    return stereo


def main():
    obtain_sources()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for pack in PACKS:
        (OUTPUT / f"LICENSE-{pack}.txt").write_bytes((SOURCE / pack / "License.txt").read_bytes())
    manifest = {"license": "CC0-1.0", "author": "Kenney", "sampleRate": RATE,
                "sources": {p: f"https://kenney.nl/assets/{slug}" for p, (slug, _) in PACKS.items()}, "cues": {}}
    for cue, (recipe, tail, loudness, variants) in RECIPES.items():
        masters = []
        for variant in range(variants):
            data = master(recipe, tail, loudness, variant - (variants - 1) / 2)
            path = OUTPUT / f"{cue}-{variant + 1}.ogg"
            sf.write(path, data, RATE, format="OGG", subtype="VORBIS")
            decoded, _ = sf.read(path, always_2d=True)
            peak = float(abs(decoded).max())
            if not np.isfinite(decoded).all() or peak >= .98:
                raise ValueError(f"Invalid master: {path}, peak {peak}")
            masters.append({"file": path.name, "seconds": round(len(data) / RATE, 3), "peakDb": round(20 * np.log10(peak), 2),
                            "rmsDb": round(20 * np.log10(np.sqrt(np.mean(decoded ** 2))), 2), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        manifest["cues"][cue] = {"layers": recipe, "reflectionSeconds": tail, "masters": masters}
    source_hashes = {str(p.relative_to(SOURCE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCE.rglob("*.ogg"))}
    manifest["sourceHashes"] = source_hashes
    (SOURCE.parent / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Mastered {sum(len(c['masters']) for c in manifest['cues'].values())} files for {len(RECIPES)} cues; {sum(p.stat().st_size for p in OUTPUT.glob('*.ogg')) / 1024:.0f} KiB.")


if __name__ == "__main__":
    main()
