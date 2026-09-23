#!/usr/bin/env python3
"""Generate review candidates with a local ComfyUI Krea 2 Turbo installation."""
import argparse
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8189")
    parser.add_argument("--card", action="append", help="Card ID; repeat to select a subset")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/card-art")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    available = {c["id"]: c for c in manifest["cards"] if c["engine"] == "local-krea-2-turbo"}
    selected = args.card or list(available)
    if missing := set(selected) - available.keys():
        parser.error("Unknown local card IDs: " + ", ".join(sorted(missing)))
    args.output.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())
    for card_id in selected:
        card = available[card_id]
        output = args.output / (card_id + ".png")
        if output.exists():
            print(f"Already generated: {output}", flush=True)
            continue
        graph = workflow(card, manifest["local"])
        submitted = request(args.server, "/prompt", {"prompt": graph, "client_id": client})
        if submitted.get("node_errors"):
            raise RuntimeError(submitted["node_errors"])
        prompt_id = submitted["prompt_id"]
        started = time.monotonic()
        print(f"Generating {card_id} (seed {card['seed']}, prompt {prompt_id})", flush=True)
        while time.monotonic() - started < 1800:
            history = request(args.server, "/history/" + prompt_id).get(prompt_id)
            if history:
                if history["status"]["status_str"] != "success":
                    raise RuntimeError(json.dumps(history["status"]))
                image = history["outputs"]["10"]["images"][0]
                query = urllib.parse.urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
                with urllib.request.urlopen(args.server + "/view?" + query, timeout=60) as response:
                    output.write_bytes(response.read())
                record = {"card": card_id, "prompt_id": prompt_id, "seed": card["seed"],
                          "seconds": round(time.monotonic() - started, 1), "workflow": graph}
                output.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n")
                print(f"Ready: {output} ({record['seconds']} s)", flush=True)
                break
            time.sleep(2)
        else:
            raise TimeoutError(f"Generation timed out for {card_id}; inspect ComfyUI before retrying")


if __name__ == "__main__":
    main()
