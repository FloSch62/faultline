#!/usr/bin/env python3
# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Generate review candidates with a local ComfyUI Krea 2 Turbo installation."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/art-v3-manifest.json"


def request(server, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        server + path, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


def workflow(card, settings):
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": settings["diffusionModel"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": settings["textEncoder"], "type": "krea2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": settings["vae"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {
            "clip": ["2", 0], "text": card["prompt"]}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {
            "conditioning": ["4", 0]}},
        "7": {"class_type": "EmptyLatentImage", "inputs": {
            "width": settings["width"], "height": settings["height"], "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["4", 0], "negative": ["6", 0],
            "latent_image": ["7", 0], "seed": card["seed"], "steps": settings["steps"],
            "cfg": settings["cfg"], "sampler_name": settings["sampler"],
            "scheduler": settings["scheduler"], "denoise": 1}},
        "9": {"class_type": "VAEDecode", "inputs": {
            "samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {
            "images": ["9", 0], "filename_prefix": "faultline/" + card["id"]}},
    }
    if reference := settings.get("styleReference"):
        graph["11"] = {"class_type": "LoadImage", "inputs": {"image": reference["inputName"]}}
        graph["12"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["1", 0], "lora_name": reference["lora"],
            "strength_model": card.get("referenceStrength", reference["strength"])}}
        graph["4"] = {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {
            "clip": ["2", 0], "vae": ["3", 0], "image1": ["11", 0], "prompt": card["prompt"]}}
        graph["13"] = {"class_type": "FluxKontextMultiReferenceLatentMethod", "inputs": {
            "conditioning": ["4", 0], "reference_latents_method": "index_timestep_zero"}}
        graph["14"] = {"class_type": "ModelSamplingFlux", "inputs": {
            "model": ["12", 0], "max_shift": 1.15, "base_shift": 0.5,
            "width": settings["width"], "height": settings["height"]}}
        graph["8"]["inputs"].update(model=["14", 0], positive=["13", 0])
    return graph


def generate(server, client, card, settings, output):
    """Submit one card to ComfyUI, wait for it and save the PNG plus its workflow record."""
    graph = workflow(card, settings)
    submitted = request(server, "/prompt", {"prompt": graph, "client_id": client})
    if submitted.get("node_errors"):
        raise RuntimeError(submitted["node_errors"])
    prompt_id = submitted["prompt_id"]
    started = time.monotonic()
    print(f"Generating {card['id']} (seed {card['seed']}, prompt {prompt_id})", flush=True)
    while time.monotonic() - started < 1800:
        history = request(server, "/history/" + prompt_id).get(prompt_id)
        if history:
            if history["status"]["status_str"] != "success":
                raise RuntimeError(json.dumps(history["status"]))
            image = history["outputs"]["10"]["images"][0]
            query = urllib.parse.urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
            with urllib.request.urlopen(server + "/view?" + query, timeout=60) as response:
                output.write_bytes(response.read())
            record = {"card": card["id"], "prompt_id": prompt_id, "seed": card["seed"],
                      "seconds": round(time.monotonic() - started, 1), "workflow": graph}
            output.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n")
            print(f"Ready: {output} ({record['seconds']} s)", flush=True)
            return
        time.sleep(2)
    raise TimeoutError(f"Generation timed out for {card['id']}; inspect ComfyUI before retrying")


def export_webp(source, target, quality=86, max_bytes=350_000, fallback=(1200, 800)):
    """Convert a chosen PNG to WebP; downscale to the fallback size when the file is too large."""
    from PIL import Image  # only needed for the export

    with Image.open(source) as image:
        image = image.convert("RGB")
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=quality, method=6)
        if target.stat().st_size > max_bytes and image.size[0] > fallback[0]:
            image.resize(fallback, Image.LANCZOS).save(target, "WEBP", quality=quality, method=6)
        size = Image.open(target).size
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(f"Exported: {target} {size[0]}x{size[1]} {target.stat().st_size} bytes sha256 {digest}", flush=True)
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8189")
    parser.add_argument("--manifest", type=Path, default=MANIFEST,
                        help="Card manifest (default docs/art-v3-manifest.json)")
    parser.add_argument("--card", "--only", dest="card", action="append",
                        help="Card ID; repeat to select a subset")
    parser.add_argument("--seed", type=int, action="append",
                        help="Candidate seed overriding the manifest seed; repeat for several "
                             "candidates. Outputs are named <id>@<seed>.png")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/card-art")
    parser.add_argument("--webp", action="store_true",
                        help="Export each selected card's chosen PNG (<id>@<manifest seed>.png in "
                             "--output, generated first when missing) to public/art/cards/<id>.webp")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    available = {c["id"]: c for c in manifest["cards"] if c["engine"] == "local-krea-2-turbo"}
    selected = args.card or list(available)
    if missing := set(selected) - available.keys():
        parser.error("Unknown local card IDs: " + ", ".join(sorted(missing)))
    if args.webp and args.seed:
        parser.error("--webp exports the manifest seed; record the chosen seed there instead of --seed")
    args.output.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())
    for card_id in selected:
        card = available[card_id]
        seeds = args.seed or [None]
        if args.webp:
            seeds = [card["seed"]]
        for seed in seeds:
            job = card if seed is None else {**card, "seed": seed}
            name = card_id if seed is None else f"{card_id}@{seed}"
            output = args.output / (name + ".png")
            if output.exists():
                print(f"Already generated: {output}", flush=True)
            else:
                generate(args.server, client, job, manifest["local"], output)
            if args.webp:
                export_webp(output, ROOT / "public/art/cards" / (card_id + ".webp"))


if __name__ == "__main__":
    main()
