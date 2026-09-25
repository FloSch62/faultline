# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Master the complete native YuE2 mix without source separation or denoising."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TRACKS = {
    "the-last-relay": ("v2", "Title and character selection"),
    "signal-and-steel": ("v2", "Copper Reach battle rotation"),
    "the-blackout-core": ("v2", "Final guardian"),
    "the-copper-market": ("v3", "Salvage exchange"),
    "a-light-left-on": ("v3", "Sanctuary and relics"),
    "a-thousand-fractures": ("v3", "Copper Reach elites"),
    "copperlight-pursuit": ("v4", "Copper Reach battle rotation"),
    "ghosts-in-the-relay": ("v4", "Glass Cathedral battle rotation"),
    "redline-protocol": ("v4", "Blackout Heart battle rotation"),
    "paths-of-copper": ("v5", "Copper Reach exploration and rewards"),
    "the-second-way-home": ("v5", "Copper Reach battles and Iron Regent"),
    "prismatic-silence": ("v5", "Glass Cathedral exploration and rewards"),
    "shatter-the-choir": ("v5", "Glass Cathedral battles, elites and Hollow Choir"),
    "messages-in-the-dark": ("v5", "Blackout Heart exploration and rewards"),
    "deliver-the-dawn": ("v5", "Blackout Heart battles and elites"),
}


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def loudness(path, filters=""):
    # This is a measurement pass. Its normalized output is discarded.
    analysis = "loudnorm=I=-19:TP=-2:LRA=11:print_format=json"
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-nostats",
                             "-i", str(path), "-af", filters + "," + analysis if filters else analysis,
                             "-f", "null", "-"], capture_output=True, text=True, check=True)
    values, _ = json.JSONDecoder().raw_decode(result.stderr[result.stderr.rindex("{"):])
    return {key: float(values["input_" + field]) for key, field in
            (("integrated_lufs", "i"), ("true_peak_dbtp", "tp"), ("range_lu", "lra"))}


def write_json(path, value):
    temporary = path.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def master_track(name, version):
    if TRACKS[name][0] != version:
        raise ValueError(f"Unexpected source version for {name}: {version}")
    dest = ROOT / "soundtrack" / "tracks" / name
    source = dest / "audio.flac"
    dest.mkdir(parents=True, exist_ok=True)
    info = sf.info(source)
    if info.samplerate != 48000 or info.channels != 2 or info.subtype != "PCM_24":
        raise ValueError(f"Unexpected native format: {source}: {info}")
    pcm, sample_rate = sf.read(source, dtype="int32", always_2d=True)
    master = dest / "instrumental.wav"
    temporary_master = dest / "instrumental.tmp.wav"
    # Preserve every original sample: no resampling, stem removal or filtering.
    sf.write(temporary_master, pcm, sample_rate, subtype=info.subtype)
    restored, restored_rate = sf.read(temporary_master, dtype="int32", always_2d=True)
    if restored_rate != sample_rate or not np.array_equal(pcm, restored):
        raise RuntimeError(f"Native PCM verification failed: {name}")

    fades = f"afade=t=in:d=1.5,afade=t=out:st={max(0, info.duration - 3):.9f}:d=3"
    levels = loudness(temporary_master, fades)
    if not all(math.isfinite(v) for v in levels.values()):
        raise RuntimeError(f"Invalid source levels: {name}")
    # A constant gain retains the arrangement's dynamics. Never compress it to
    # reach a loudness target when its peaks require a quieter delivery level.
    gain = min(-19 - levels["integrated_lufs"], -2 - levels["true_peak_dbtp"])
    output = ROOT / "public" / "audio" / f"{name}-instrumental.ogg"
    temporary_output = output.with_suffix(".tmp.ogg")
    for attempt in range(3):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-y",
                        "-i", str(temporary_master), "-map_metadata", "-1", "-af",
                        f"{fades},volume={gain:.8f}dB", "-ar", "48000", "-c:a", "libvorbis",
                        "-q:a", "5", str(temporary_output)], check=True)
        delivered_levels = loudness(temporary_output)
        if delivered_levels["true_peak_dbtp"] <= -2:
            break
        gain -= delivered_levels["true_peak_dbtp"] + 2.05
    else:
        raise RuntimeError(f"Delivery peak check failed: {name}")
    decoded, decoded_rate = sf.read(temporary_output, dtype="float32", always_2d=True)
    if decoded_rate != sample_rate or decoded.shape != pcm.shape or not np.isfinite(decoded).all():
        raise RuntimeError(f"Delivery decode verification failed: {name}")
    temporary_master.replace(master)
    temporary_output.replace(output)
    stats = {
        "source": "audio.flac",
        "generation_version": version,
        "source_sha256": sha256(source),
        "mix": "complete native YuE2 recording",
        "processing": "lossless FLAC decode to WAV; no source separation or denoising",
        "sample_rate": sample_rate, "channels": info.channels, "subtype": info.subtype,
        "frames": info.frames, "duration_seconds": info.duration,
        "instrumental_sha256": sha256(master),
        "verification": {"decoded_pcm_equal_to_source": True, "max_abs_pcm_error": 0},
        "delivery": {"file": str(output.relative_to(ROOT)), "sha256": sha256(output),
                     "bytes": output.stat().st_size, "codec": "Vorbis", "quality": 5,
                     "fade_in_seconds": 1.5, "fade_out_seconds": 3,
                     "constant_gain_db": gain, "target_lufs": -19, "peak_ceiling_dbtp": -2,
                     **delivered_levels},
    }
    write_json(dest / "master.json", stats)
    print(f"Restored {name}: exact native PCM, {info.duration:.1f}s, "
          f"delivery {delivered_levels['integrated_lufs']:.1f} LUFS", flush=True)


def write_manifest():
    tracks = []
    for name, (version, scene) in TRACKS.items():
        path = ROOT / "soundtrack" / "tracks" / name / "master.json"
        if not path.exists():
            continue
        master = json.loads(path.read_text())
        if not master.get("verification", {}).get("decoded_pcm_equal_to_source"):
            raise RuntimeError(f"Master must be rebuilt from native audio: {name}")
        delivery = master["delivery"]
        tracks.append({"file": delivery["file"], "scene": scene,
                       "source": f"soundtrack/tracks/{name}/audio.flac",
                       "source_sha256": master["source_sha256"],
                       "master": str(path.relative_to(ROOT)),
                       "duration_seconds": master["duration_seconds"],
                       "sample_rate": master["sample_rate"], "channels": master["channels"],
                       "bytes": delivery["bytes"], "sha256": delivery["sha256"]})
    write_json(ROOT / "soundtrack" / "manifest.json", {
        "generation_model": "m-a-p/YuE2-3B", "decoder": "m-a-p/YuE2-Vae",
        "source_commit": "3968a270be318e5fb74d27dabc0add2ebb07e77f",
        "mix": "complete native recordings; no source separation or denoising",
        "mastering": "Exact native PCM WAV; delivery fades and constant gain toward -19 LUFS "
                     "with a -2 dBTP ceiling; 48 kHz stereo Vorbis quality 5",
        "tracks": tracks,
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", action="append", choices=list(TRACKS))
    args = parser.parse_args()
    for name in args.track or TRACKS:
        master_track(name, TRACKS[name][0])
    write_manifest()
