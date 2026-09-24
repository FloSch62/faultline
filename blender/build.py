"""Build FAULTLINE models into public/models.

    blender -b --factory-startup --python blender/build.py -- router switch
    blender -b --factory-startup --python blender/build.py -- tap crate --render /tmp/shots --no-export

Five families, one script per name (crests share one), each defining build(name):
    devices        blender/devices/<role>.py        -> public/models/<role>.glb
    installations  blender/installations/<kind>.py  -> public/models/installations/<kind>.glb
    props          blender/props/<name>.py          -> public/models/props/<name>.glb
    boards         blender/boards/<name>.py         -> public/models/boards/<name>.glb
                   (table writes the tabletop textures, public/models/boards/table-*.jpg)
    crests         blender/boards/crests.py         -> public/models/boards/crests/<leader>.glb
`npm run models` wraps this and finds Blender for you.
"""

import argparse
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import faultline as fl  # noqa: E402

ROLES = ("client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom")
INSTALLATIONS = ("tap", "jammer", "spike", "anchor", "breaker")
PROPS = ("crate", "fragment")
BOARDS = ("table", "copper", "glass", "blackout", "regent", "cantor", "core")
# Every leader hostile except the guardians (they have boards of their own); ids from src/core/enemies.ts.
CRESTS = ("leech", "wraith", "prophet", "serpent", "moth", "sentinel", "colossus", "weaver", "storm", "widow", "marshal",
          "choir", "reaver", "foreman", "nest", "demolition", "blight")

# family -> (names, script folder, output subfolder of --out, one script for every name)
FAMILIES = {
    "device": (ROLES, "devices", "", None),
    "installation": (INSTALLATIONS, "installations", "installations", None),
    "prop": (PROPS, "props", "props", None),
    "board": (BOARDS, "boards", "boards", None),
    "crest": (CRESTS, "boards", "boards/crests", "crests"),
}


def family_of(name):
    for family, (names, _, _, _) in FAMILIES.items():
        if name in names:
            return family
    raise SystemExit(f"unknown model {name!r}; expected one of {', '.join(n for f in FAMILIES.values() for n in f[0])}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build.py")
    parser.add_argument("names", nargs="*", help="models to build (default: every name with a script)")
    parser.add_argument("--out", default=os.path.join(HERE, "..", "public", "models"))
    parser.add_argument("--render", help="also render a preview PNG per model into this directory")
    parser.add_argument("--azimuth", default="0", help="comma-separated preview angles in degrees")
    parser.add_argument("--no-export", action="store_true")
    parser.add_argument("--detail", action="store_true", help="list the largest parts by triangle count")
    args = parser.parse_args(argv)

    names = args.names or [
        name for names, folder, _, script in FAMILIES.values() for name in names
        if os.path.exists(os.path.join(HERE, folder, f"{script or name}.py"))
    ]
    failed = False
    for name in names:
        family = family_of(name)
        _, folder, subfolder, script = FAMILIES[family]
        fl.reset_scene()
        module = importlib.import_module(f"{folder}.{script or name}")
        if getattr(module, "TEXTURES", False):
            # A texture set (the tabletop): no mesh, the files are the export.
            report = {"role": name, "family": family, "triangles": 0, "draw_calls": 0, "problems": []}
            if not args.no_export:
                out = os.path.join(args.out, subfolder)
                os.makedirs(out, exist_ok=True)
                report["bytes"] = module.export(out)
            print("MODEL " + json.dumps(report), flush=True)
            continue
        module.build(name)
        # A script may move its ceiling (MAX_TOP) when its label floats higher (client, power, tap)
        # or its family entry is lower (the Breaker Charge), and loosen a budget key (BUDGET).
        top = getattr(module, "MAX_TOP", fl.ENVELOPES[family]["top"])
        problems = fl.check_bounds(name, max_top=top, family=family)
        detail = fl.part_triangles()[:14] if args.detail else None
        fl.bake_hook_transforms()
        fl.consolidate()
        report = {"role": name, "family": family, **fl.stats()}
        if not args.no_export:
            out = os.path.join(args.out, subfolder)
            os.makedirs(out, exist_ok=True)
            path = os.path.abspath(os.path.join(out, f"{name}.glb"))
            fl.export(path)
            report["bytes"] = os.path.getsize(path)
        problems += fl.check_budget(report, family, getattr(module, "BUDGET", None))
        report["problems"] = problems
        if detail:
            report["parts"] = detail
        if args.render:
            os.makedirs(args.render, exist_ok=True)
            for azimuth in args.azimuth.split(","):
                suffix = "" if azimuth == "0" else f"-{azimuth}"
                path = os.path.abspath(os.path.join(args.render, f"{name}{suffix}.png"))
                if hasattr(module, "render"):
                    # Boards and crests preview on the table under the game's own camera.
                    module.render(path, name, azimuth=float(azimuth), models=os.path.abspath(args.out))
                else:
                    fl.render_preview(path, name, azimuth=float(azimuth), family=family, plinth=getattr(module, "PLINTH", True))
        failed |= bool(problems)
        print("MODEL " + json.dumps(report), flush=True)
    sys.exit(1 if failed else 0)


main()
