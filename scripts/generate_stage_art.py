#!/usr/bin/env python3
# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Render the stage painting manifest with the installed local Krea 2 workflow."""
import argparse
import json
import shutil
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from generate_card_art import ROOT, request, workflow


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8189")
    parser.add_argument("--comfy-input", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, default=ROOT / "docs/art-stage-manifest.json")
    parser.add_argument("--asset", action="append")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/stage-art")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    available = {entry["id"]: entry for entry in manifest["images"]}
    selected = args.asset or list(available)
    if missing := set(selected) - available.keys():
        parser.error("Unknown assets: " + ", ".join(sorted(missing)))
    args.output.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())
    for asset_id in selected:
        asset = available[asset_id]
        output = args.output / (asset_id + ".png")
        if output.exists():
            print(f"Already generated: {output}", flush=True)
            continue
        settings = dict(manifest["local"])
        if asset.get("useReference", True):
            reference = dict(settings["styleReference"], source=asset["reference"])
            reference["inputName"] = "faultline-stage-" + Path(asset["reference"]).name
            settings["styleReference"] = reference
            shutil.copyfile(ROOT / reference["source"], args.comfy_input / reference["inputName"])
        else:
            settings.pop("styleReference", None)
        graph = workflow(asset, settings)
        if second := asset.get("secondReference"):
            second_name = "faultline-stage-" + Path(second).name
            shutil.copyfile(ROOT / second, args.comfy_input / second_name)
            graph["15"] = {"class_type": "LoadImage", "inputs": {"image": second_name}}
            graph["4"]["inputs"]["image2"] = ["15", 0]
        if shift := settings.get("shift"):
            if "14" not in graph:
                graph["14"] = {"class_type": "ModelSamplingFlux", "inputs": {
                    "model": ["1", 0], "width": settings["width"], "height": settings["height"]}}
                graph["8"]["inputs"]["model"] = ["14", 0]
            graph["14"]["inputs"].update(max_shift=shift, base_shift=shift)
        submitted = request(args.server, "/prompt", {"prompt": graph, "client_id": client})
        if submitted.get("node_errors"):
            raise RuntimeError(submitted["node_errors"])
        prompt_id = submitted["prompt_id"]
        started = time.monotonic()
        print(f"Generating {asset_id}: {prompt_id}", flush=True)
        while time.monotonic() - started < 1800:
            history = request(args.server, "/history/" + prompt_id).get(prompt_id)
            if history:
                if history["status"]["status_str"] != "success":
                    raise RuntimeError(json.dumps(history["status"]))
                image = history["outputs"]["10"]["images"][0]
                query = urllib.parse.urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
                with urllib.request.urlopen(args.server + "/view?" + query, timeout=60) as response:
                    output.write_bytes(response.read())
                record = {"asset": asset_id, "prompt_id": prompt_id, "seed": asset["seed"],
                          "seconds": round(time.monotonic() - started, 1), "workflow": graph}
                output.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n")
                print(f"Ready: {output} ({record['seconds']} s)", flush=True)
                break
            time.sleep(2)
        else:
            raise TimeoutError(f"Generation timed out for {asset_id}; inspect ComfyUI before retrying")


if __name__ == "__main__":
    main()
