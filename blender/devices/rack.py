"""Server Rack: a squat two-bay brass cabinet on a bright skid. Louvred side plates and iron
corner posts carry an overhanging riveted roof; the open front shows two dark slots, each
holding a sled with two amber status lamps that blink slowly out of step. A brass condition
dial with a luminous face sits in the header under the roof.

World.ts adds the plinth, the 2.0 shelter ring on hover and the condition pips."""

import math

from lib import faultline as fl

W, D = 0.9, 0.7  # cabinet width (x) and depth (y)
BASE = fl.PLINTH_TOP
BODY_TOP = 1.9
ROOF_TOP = 2.0  # the hipped roof rises a little above it to its ridge (2.1)
SLOTS = ((1.1, 1.38), (1.45, 1.73))


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    brass, bright, iron, dark = m("metal_brass"), m("metal_brass_bright"), m("metal_graphite"), m("metal_dark")
    x2, y2 = W / 2, D / 2

    # Skid and floor.
    fl.box("skid", (W + 0.04, D + 0.04, 0.06), (0, 0, BASE + 0.03), bright, bevel=0.012, segments=1)
    fl.box("floor", (W - 0.04, D - 0.04, 0.04), (0, 0, BASE + 0.08), iron, bevel=0.008, segments=1)

    # Back and side plates; the sides carry louvres.
    height = BODY_TOP - BASE - 0.06
    zc = BASE + 0.06 + height / 2
    fl.box("back", (W - 0.06, 0.04, height), (0, y2 - 0.02, zc), brass, bevel=0.01, segments=1)
    for side in (-1, 1):
        fl.box(f"side{side}", (0.04, D - 0.06, height), (side * (x2 - 0.02), 0, zc), brass, bevel=0.01, segments=1)
        for k in range(6):
            z = BASE + 0.26 + k * 0.1
            fl.box(f"louvre{side}_{k}", (0.03, D - 0.22, 0.04), (side * (x2 + 0.004), 0, z), iron,
                   rotation=(0, side * math.radians(35), 0), bevel=0)
    # Dark interior behind the slots.
    fl.box("interior", (W - 0.12, 0.02, height - 0.04), (0, y2 - 0.05, zc), dark, bevel=0)

    # Corner posts with rivets.
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        fl.box(f"post{i}", (0.07, 0.07, height + 0.02), (sx * (x2 - 0.02), sy * (y2 - 0.02), zc), iron, bevel=0.012, segments=1)
        if sy < 0:
            for k in range(4):
                fl.sphere(f"post_rivet{i}_{k}", 0.012, (sx * (x2 - 0.02), -y2 - 0.017, BASE + 0.2 + k * 0.22), bright, segments=6, rings=4)

    # Two slots: a shelf under each, a recessed sled with vents and two blinking amber lamps.
    for i, (z0, z1) in enumerate(SLOTS):
        fl.box(f"shelf{i}", (W - 0.08, D - 0.1, 0.03), (0, 0.0, z0 - 0.015), bright, bevel=0.006, segments=1)
        fl.box(f"sled{i}", (W - 0.18, D - 0.28, z1 - z0 - 0.04), (0, 0.02, (z0 + z1) / 2), iron, bevel=0.012, segments=1)
        face_y = 0.02 - (D - 0.28) / 2 - 0.004
        for k in range(5):
            fl.box(f"vent{i}_{k}", (0.3, 0.008, 0.016), (-0.12, face_y, z0 + 0.06 + k * 0.042), dark, bevel=0)
        fl.box(f"handle{i}", (0.03, 0.03, 0.18), (-0.33, face_y - 0.015, (z0 + z1) / 2), bright, bevel=0.006, segments=1)
        for k, x in enumerate((0.16, 0.26)):
            lamp = fl.box(f"lamp{i}_{k}", (0.05, 0.02, 0.05), (x, face_y - 0.006, (z0 + z1) / 2 + 0.04), m("glow_amber"), bevel=0)
            fl.hook(lamp, "blinker", speed=round(0.55 + 0.17 * (i * 2 + k), 2), phase=round(1.3 * (i * 2 + k), 2), base=0.95)

    # Header: a brass plate with the condition dial.
    hz = (SLOTS[1][1] + BODY_TOP) / 2
    fl.box("header", (W - 0.06, 0.04, BODY_TOP - SLOTS[1][1]), (0, -y2 + 0.03, hz), brass, bevel=0.008, segments=1)
    dial = (0, -y2 - 0.005, hz)
    bezel = fl.cylinder("dial_bezel", 0.075, -0.02, 0.02, bright, sides=20, bevel=0.006, segments=1)
    bezel.location, bezel.rotation_euler = dial, (math.pi / 2, 0, 0)
    face = fl.cylinder("dial_face", 0.058, -0.004, 0.004, m("role_luminous"), sides=20)
    face.location, face.rotation_euler = (dial[0], dial[1] - 0.02, dial[2]), (math.pi / 2, 0, 0)
    fl.box("dial_needle", (0.01, 0.006, 0.05), (0.012, dial[1] - 0.027, dial[2] + 0.012), dark, rotation=(0, math.radians(-35), 0), bevel=0)
    for k, a in enumerate((-50, 0, 50)):
        r = math.radians(a)
        fl.box(f"dial_tick{k}", (0.006, 0.006, 0.014), (math.sin(r) * 0.048, dial[1] - 0.026, dial[2] + math.cos(r) * 0.048), dark,
               rotation=(0, -r, 0), bevel=0)

    # The overhanging roof: a hipped brass roof on a bright cornice, riveted along its eaves and hips,
    # with a luminous ridge (what the table camera sees first).
    fl.box("cornice", (W + 0.08, D + 0.08, 0.04), (0, 0, BODY_TOP + 0.02), bright, bevel=0.01, segments=1)
    eave_x, eave_y = (W + 0.12) / 2, (D + 0.12) / 2
    top_x, top_y = eave_x - 0.2, eave_y - 0.2
    r0, r1 = BODY_TOP + 0.04, ROOF_TOP + 0.06
    roof = fl.prism("roof", 4, 1.0, 1.0, r0, r1, brass, rotation_z=math.pi / 4, bevel=0.01, segments=1)
    for v in roof.data.vertices:
        # create_cone puts the corners on the diagonals; stretch each to the eave or the ridge footprint.
        sx, sy = (eave_x, eave_y) if v.co.z < 0 else (top_x, top_y)
        v.co.x, v.co.y = math.copysign(sx, v.co.x), math.copysign(sy, v.co.y)
    for i in range(7):
        x = -x2 - 0.02 + i * (W + 0.04) / 6
        for sy in (-1, 1):
            fl.sphere(f"eave_rivet{i}_{sy}", 0.014, (x, sy * (y2 + 0.045), BODY_TOP + 0.045), bright, segments=6, rings=4)
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        for k in range(1, 4):
            t = k / 4
            x = sx * (eave_x + (top_x - eave_x) * t)
            y = sy * (eave_y + (top_y - eave_y) * t)
            fl.sphere(f"hip_rivet{i}_{k}", 0.016, (x, y, r0 + (r1 - r0) * t + 0.01), bright, segments=6, rings=4)
    fl.box("ridge", (top_x * 2 + 0.04, 0.07, 0.035), (0, 0, r1 + 0.012), iron, bevel=0.008, segments=1)
    fl.box("ridge_light", (top_x * 2 - 0.06, 0.03, 0.02), (0, 0, r1 + 0.034), m("role_luminous"), bevel=0)
