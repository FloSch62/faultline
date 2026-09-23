"""Build FAULTLINE device models into public/models/<role>.glb.

    blender -b --factory-startup --python blender/build.py -- router switch
    blender -b --factory-startup --python blender/build.py -- router --render /tmp/shots --no-export

Every role lives in blender/devices/<role>.py and defines build(role).
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

ROLES = ("client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build.py")
    parser.add_argument("roles", nargs="*", help="roles to build (default: every role with a script)")
    parser.add_argument("--out", default=os.path.join(HERE, "..", "public", "models"))
    parser.add_argument("--render", help="also render a preview PNG per role into this directory")
    parser.add_argument("--azimuth", default="0", help="comma-separated preview angles in degrees")
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args(argv)

    roles = args.roles or [role for role in ROLES if os.path.exists(os.path.join(HERE, "devices", f"{role}.py"))]
    failed = False
    for role in roles:
        fl.reset_scene()
        module = importlib.import_module(f"devices.{role}")
        module.build(role)
        # A role script may raise its ceiling (MAX_TOP) when its label floats higher.
        problems = fl.check_bounds(role, max_top=getattr(module, "MAX_TOP", fl.MAX_TOP))
        fl.bake_hook_transforms()
        fl.consolidate()
        report = {"role": role, **fl.stats(), "problems": problems}
        if not args.no_export:
            os.makedirs(args.out, exist_ok=True)
            path = os.path.abspath(os.path.join(args.out, f"{role}.glb"))
            fl.export(path)
            report["bytes"] = os.path.getsize(path)
        if args.render:
            os.makedirs(args.render, exist_ok=True)
            for azimuth in args.azimuth.split(","):
                suffix = "" if azimuth == "0" else f"-{azimuth}"
                fl.render_preview(os.path.abspath(os.path.join(args.render, f"{role}{suffix}.png")), role, azimuth=float(azimuth))
        failed |= bool(problems)
        print("MODEL " + json.dumps(report), flush=True)
    sys.exit(1 if failed else 0)


main()
