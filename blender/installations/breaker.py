# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Breaker Charge: a low brass canister under a red glass cap, standing on four folded legs,
a rubber fuse wire coiled around its body. A short mast on the cap carries the countdown
lamp: a luminous housing with a lens that blinks (hook: blinker, speed 1.5, base 0.9).
World.ts sets that blinker's speed to 4 when the countdown reaches 1, puts the countdown
numeral above the lamp (top of the lamp 0.98), and draws the dashed 2.0 blast ring, the
detonation flash and the wreck ring.

MAX_TOP: the design caps the Breaker Charge at 1.0 including the lamp mast."""

import math

from lib import faultline as fl

MAX_TOP = 1.0
R = 0.35
BODY = (0.04, 0.5)
CAP_TOP = 0.63
LAMP_Z = 0.87


def build(kind):
    m = lambda name: fl.material(name, kind)  # noqa: E731
    brass, bright, rubber = m("metal_brass"), m("metal_brass_bright"), m("rubber")
    z0, z1 = BODY

    # Canister: a foot ring, the body with two bright bands and a row of rivets, a cap rim.
    fl.cylinder("foot", R - 0.02, 0.0, z0, bright, sides=20, r_top=R - 0.03)
    fl.cylinder("body", R - 0.02, z0, z1, brass, sides=20, bevel=0.012, segments=1)
    for i, (a, b) in enumerate(((z0 + 0.03, z0 + 0.08), (z1 - 0.07, z1 - 0.02))):
        fl.cylinder(f"band{i}", R, a, b, bright, sides=20, bevel=0.008, segments=1)
    for i, (x, y, _) in enumerate(fl.polar(10, R - 0.012, start=-math.pi / 2 + math.pi / 10)):
        fl.sphere(f"rivet{i}", 0.016, (x, y, z1 - 0.045), brass, segments=6, rings=4)
    fl.cylinder("cap_rim", R - 0.04, z1, z1 + 0.035, bright, sides=20, r_top=R - 0.06, bevel=0.006, segments=1)

    # The red glass cap: a shallow dome.
    fl.dome("cap", R - 0.07, CAP_TOP - z1 - 0.025, z1 + 0.025, m("glow_cap"), segments=20, rings=5)

    # Four folded legs hinged under the upper band, feet splayed on the table.
    for i, (x, y, a) in enumerate(fl.polar(4, 1.0, start=-math.pi / 4)):
        hinge, knee, toe = (x * (R + 0.01), y * (R + 0.01), z1 - 0.1), (x * (R + 0.06), y * (R + 0.06), 0.2), (x * 0.47, y * 0.47, 0.025)
        fl.box(f"hinge{i}", (0.07, 0.04, 0.05), hinge, bright, rotation=(0, 0, a + math.pi / 2), bevel=0.008, segments=1)
        fl.sweep(f"leg{i}", [hinge, knee, toe], 0.02, bright, sides=5, radii=[0.024, 0.02, 0.017])
        fl.cylinder(f"pad{i}", 0.045, 0.0, 0.025, bright, xy=(x * 0.47, y * 0.47), sides=8, r_top=0.035)

    # The fuse: a rubber wire coiled two and a half turns round the body, then up into the cap rim.
    turns, low, high = 2.5, z0 + 0.12, z1 - 0.1
    steps = 50
    coil = []
    for k in range(steps + 1):
        t = k / steps
        a = -math.pi / 2 + t * turns * math.tau
        coil.append((math.cos(a) * (R + 0.012), math.sin(a) * (R + 0.012), low + (high - low) * t))
    end = coil[-1]
    coil += [(end[0] * 0.97, end[1] * 0.97, z1 + 0.0), (end[0] * 0.86, end[1] * 0.86, z1 + 0.03)]
    fl.sweep("fuse", coil, 0.015, rubber, sides=4)

    # Lamp mast on the cap, the luminous housing and the blinking lens.
    fl.cylinder("mast", 0.025, CAP_TOP - 0.03, LAMP_Z - 0.06, bright, sides=8)
    fl.cylinder("mast_collar", 0.05, CAP_TOP - 0.035, CAP_TOP + 0.01, bright, sides=10)
    fl.cylinder("housing", 0.07, LAMP_Z - 0.08, LAMP_Z - 0.01, m("role_luminous"), sides=12, r_top=0.085)
    for i, (x, y, a) in enumerate(fl.polar(4, 0.082, start=-math.pi / 4)):
        fl.box(f"guard{i}", (0.016, 0.016, 0.1), (x, y, LAMP_Z + 0.045), bright, bevel=0)
    fl.torus("guard_ring", 0.082, 0.01, (0, 0, LAMP_Z + 0.095), bright, major_segments=12, minor_segments=4)
    lens = fl.sphere("lamp", 0.07, (0, 0, LAMP_Z + 0.02), m("role_glow"), segments=12, rings=8)
    fl.hook(lens, "blinker", speed=1.5, phase=0.0, base=0.9)
