#!/usr/bin/env python3
"""Render the keeper portraits for the selection screen with the local Krea 2 workflow."""
import argparse
import hashlib
import json
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from generate_card_art import ROOT, request, workflow

MANIFEST = ROOT / "docs/art-keepers-manifest.json"


def prepare_reference(reference, comfy_input):
    """Copy (and crop, when the manifest asks) a reference image into ComfyUI's input folder."""
    from PIL import Image

    with Image.open(ROOT / reference["source"]) as image:
        if crop := reference.get("crop"):
            x, y, width, height = crop
            image = image.crop((x, y, x + width, y + height))
        image.convert("RGB").save(comfy_input / reference["inputName"])


def generate(server, client, keeper, settings, output):
    """Submit one portrait, wait for it and save the PNG plus its workflow record."""
    graph = workflow(keeper, settings)
    if second := settings.get("secondReference"):
        graph["15"] = {"class_type": "LoadImage", "inputs": {"image": second["inputName"]}}
        graph["4"]["inputs"]["image2"] = ["15", 0]
    if shift := settings.get("shift"):
        graph["14"]["inputs"].update(max_shift=shift, base_shift=shift)
    submitted = request(server, "/prompt", {"prompt": graph, "client_id": client})
    if submitted.get("node_errors"):
        raise RuntimeError(submitted["node_errors"])
    prompt_id = submitted["prompt_id"]
    started = time.monotonic()
    print(f"Generating {keeper['id']} (seed {keeper['seed']}, prompt {prompt_id})", flush=True)
    while time.monotonic() - started < 1800:
        history = request(server, "/history/" + prompt_id).get(prompt_id)
        if history:
            if history["status"]["status_str"] != "success":
                raise RuntimeError(json.dumps(history["status"]))
            image = history["outputs"]["10"]["images"][0]
            query = urllib.parse.urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
            with urllib.request.urlopen(server + "/view?" + query, timeout=60) as response:
                output.write_bytes(response.read())
            record = {"keeper": keeper["id"], "prompt_id": prompt_id, "seed": keeper["seed"],
                      "seconds": round(time.monotonic() - started, 1), "workflow": graph}
            output.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n")
            print(f"Ready: {output} ({record['seconds']} s)", flush=True)
            return
        time.sleep(2)
    raise TimeoutError(f"Generation timed out for {keeper['id']}; inspect ComfyUI before retrying")


def export_webp(source, target, size, quality=88, max_bytes=400_000):
    """Scale the chosen PNG to the delivery size and save it as WebP within the byte budget."""
    from PIL import Image

    with Image.open(source) as image:
        image = image.convert("RGB").resize(size, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    while True:
        image.save(target, "WEBP", quality=quality, method=6)
        if target.stat().st_size <= max_bytes or quality <= 60:
            break
        quality -= 4
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(f"Exported: {target} {size[0]}x{size[1]} q{quality} {target.stat().st_size} bytes sha256 {digest}",
          flush=True)
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8189")
    parser.add_argument("--comfy-input", type=Path,
                        default=Path.home() / ".local/share/faultline-imagegen/ComfyUI/input")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--keeper", action="append", help="Keeper ID; repeat to select a subset")
    parser.add_argument("--seed", type=int, action="append",
                        help="Candidate seed overriding the manifest seed; repeat for several "
                             "candidates. Outputs are named <id>@<seed>.png")
    parser.add_argument("--strength", type=float,
                        help="Style-reference LoRA strength overriding the manifest (candidate runs only)")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/keeper-art/manifest")
    parser.add_argument("--webp", action="store_true",
                        help="Export each selected keeper's chosen PNG (<id>@<manifest seed>.png in "
                             "--output, generated first when missing) to public/art/keepers/<id>.webp")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    settings = manifest["local"]
    available = {k["id"]: k for k in manifest["keepers"]}
    selected = args.keeper or list(available)
    if missing := set(selected) - available.keys():
        parser.error("Unknown keeper IDs: " + ", ".join(sorted(missing)))
    if args.webp and (args.seed or args.strength is not None):
        parser.error("--webp exports the manifest recipe; record the chosen seed and strength there instead")
    if args.strength is not None:
        settings["styleReference"]["strength"] = args.strength
    args.output.mkdir(parents=True, exist_ok=True)
    for reference in ("styleReference", "secondReference"):
        if reference in settings:
            prepare_reference(settings[reference], args.comfy_input)
    client = str(uuid.uuid4())
    for keeper_id in selected:
        keeper = available[keeper_id]
        for seed in [keeper["seed"]] if args.webp else args.seed or [keeper["seed"]]:
            output = args.output / f"{keeper_id}@{seed}.png"
            if output.exists():
                print(f"Already generated: {output}", flush=True)
            else:
                generate(args.server, client, {**keeper, "seed": seed}, settings, output)
            if args.webp:
                delivery = manifest["delivery"]
                export_webp(output, ROOT / keeper["file"], tuple(delivery["size"]), delivery["quality"],
                            delivery["maxBytes"])


if __name__ == "__main__":
    main()
