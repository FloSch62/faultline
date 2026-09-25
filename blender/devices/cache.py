# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Cache server: a tall storage tower. A brass frame holds a dark chassis with a
bay of hot-swap drive sleds (lever handles, activity LEDs), a segmented fill
meter and louvred side vents. The frame posts rise past the roof into a lantern
cage where the cached data cube spins around its floating luminous heart."""

import math

from mathutils import Matrix

from lib import faultline as fl

# Chassis footprint (x = width, y = depth) and heights.
W, D = 0.82, 0.62
POST = 0.08
Z0 = fl.PLINTH_TOP
BASE_TOP = Z0 + 0.1
ROOF = Z0 + 0.86
FRONT = -D / 2
CAGE_TOP = 2.35
CUBE_Z = 2.15
CUBE_HALF = 0.17


def data_cube(name, half, thickness, node, centre, mat):
    """A cube drawn as twelve glowing bars with a block on every corner, one mesh pivoting at its centre."""
    cx, cy, cz = centre
    span = 2 * half + thickness
    parts = []
    for axis in range(3):
        for a in (-half, half):
            for b in (-half, half):
                size = [thickness] * 3
                size[axis] = span
                loc = [0.0, 0.0, 0.0]
                others = [i for i in range(3) if i != axis]
                loc[others[0]], loc[others[1]] = a, b
                parts.append(fl.box(f"{name}_bar", size, (cx + loc[0], cy + loc[1], cz + loc[2]), mat, bevel=0))
    for dx in (-half, half):
        for dy in (-half, half):
            for dz in (-half, half):
                parts.append(fl.box(f"{name}_node", (node, node, node), (cx + dx, cy + dy, cz + dz), mat, bevel=0))
    return fl.merge(name, parts, centre)


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    hx, hy = W / 2, D / 2

    # Plinth skid and brass base band.
    fl.box("skid", (W + 0.14, D + 0.14, 0.05), (0, 0, Z0 + 0.025), graphite, bevel=0.014)
    fl.box("base_band", (W + 0.08, D + 0.08, 0.05), (0, 0, Z0 + 0.075), brass, bevel=0.012)

    # Dark chassis.
    fl.box("chassis", (W, D, ROOF - BASE_TOP), (0, 0, (BASE_TOP + ROOF) / 2), dark, bevel=0.018, segments=2)

    # Brass frame: full-width posts frame the chassis, slimmer shafts carry the cage above the
    # cornice, bright collars mark every joint and finials cap the shafts.
    joint = ROOF + 0.05
    shaft = 0.06
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x, y = sx * hx, sy * hy
        fl.box(f"post{i}", (POST, POST, joint - BASE_TOP), (x, y, (BASE_TOP + joint) / 2), brass, bevel=0.012)
        fl.box(f"shaft{i}", (shaft, shaft, CAGE_TOP - joint), (x, y, (joint + CAGE_TOP) / 2), brass, bevel=0.01)
        for k, (z, size) in enumerate(((BASE_TOP + 0.016, POST), (ROOF + 0.066, POST), (CAGE_TOP - 0.06, shaft))):
            fl.box(f"collar{i}_{k}", (size + 0.024, size + 0.024, 0.032), (x, y, z), bright, bevel=0.007, segments=1)
        fl.prism(f"finial{i}", 4, 0.044, 0.008, CAGE_TOP, CAGE_TOP + 0.075, bright, xy=(x, y),
                 rotation_z=math.pi / 4, bevel=0.005, segments=1)

    # Cornice, roof deck and a matte well under the cube.
    fl.box("cornice", (W + 0.08, D + 0.08, 0.05), (0, 0, ROOF + 0.025), brass, bevel=0.012)
    deck_top = ROOF + 0.08
    fl.box("deck", (W - 0.04, D - 0.04, 0.03), (0, 0, deck_top - 0.015), dark, bevel=0.01)
    fl.box("well", (W - 0.18, D - 0.16, 0.01), (0, 0, deck_top + 0.001), m("rubber"), bevel=0)

    # Emitter socket under the cube.
    fl.box("socket", (0.3, 0.3, 0.02), (0, 0, deck_top + 0.01), m("role_luminous"), bevel=0.007)
    fl.box("socket_glow", (0.2, 0.2, 0.008), (0, 0, deck_top + 0.021), m("role_glow_soft"), bevel=0)

    # Cage rails join the post tops; a crocket crowns the middle of each.
    rail = 0.04
    rz = CAGE_TOP - rail / 2
    fl.box("rail_front", (W, rail, rail), (0, -hy, rz), brass, bevel=0.008, segments=1)
    fl.box("rail_back", (W, rail, rail), (0, hy, rz), brass, bevel=0.008, segments=1)
    fl.box("rail_left", (rail, D, rail), (-hx, 0, rz), brass, bevel=0.008, segments=1)
    fl.box("rail_right", (rail, D, rail), (hx, 0, rz), brass, bevel=0.008, segments=1)
    for name, xy in (("front", (0, -hy)), ("back", (0, hy)), ("left", (-hx, 0)), ("right", (hx, 0))):
        fl.prism(f"crocket_{name}", 4, 0.032, 0.006, CAGE_TOP, CAGE_TOP + 0.055, bright, xy=xy, rotation_z=math.pi / 4,
                 bevel=0.004, segments=1)

    # Drive bay: a graphite frame around five hot-swap sleds.
    bay_x0, bay_x1 = -hx + 0.08, hx - 0.145
    bay_z0, bay_z1 = BASE_TOP + 0.055, ROOF - 0.05
    frame = 0.03
    fy = FRONT - 0.015
    bay_cx = (bay_x0 + bay_x1) / 2
    fl.box("bay_left", (frame, 0.03, bay_z1 - bay_z0 + frame * 2), (bay_x0 - frame / 2, fy, (bay_z0 + bay_z1) / 2), graphite, bevel=0.008, segments=1)
    fl.box("bay_right", (frame, 0.03, bay_z1 - bay_z0 + frame * 2), (bay_x1 + frame / 2, fy, (bay_z0 + bay_z1) / 2), graphite, bevel=0.008, segments=1)
    fl.box("bay_top", (bay_x1 - bay_x0, 0.03, frame), (bay_cx, fy, bay_z1 + frame / 2), graphite, bevel=0.008, segments=1)
    fl.box("bay_bottom", (bay_x1 - bay_x0, 0.03, frame), (bay_cx, fy, bay_z0 - frame / 2), graphite, bevel=0.008, segments=1)
    fl.box("bay_back", (bay_x1 - bay_x0, 0.01, bay_z1 - bay_z0), (bay_cx, FRONT - 0.004, (bay_z0 + bay_z1) / 2), m("rubber"), bevel=0)

    sleds = 5
    pitch = (bay_z1 - bay_z0) / sleds
    sled_w = bay_x1 - bay_x0 - 0.02
    left, right = bay_cx - sled_w / 2, bay_cx + sled_w / 2
    led_colors = ("glow_green", "role_glow", "glow_amber", "glow_green", "role_glow")
    for i in range(sleds):
        z = bay_z0 + pitch * (i + 0.5)
        fl.box(f"sled{i}", (sled_w, 0.04, pitch - 0.024), (bay_cx, FRONT - 0.02, z), graphite, bevel=0.01, segments=1)
        # Lever handle: hinge block, bar and latch tab.
        fl.box(f"hinge{i}", (0.042, 0.03, 0.066), (left + 0.045, FRONT - 0.05, z), brass, bevel=0.006, segments=1)
        fl.box(f"lever{i}", (0.28, 0.024, 0.034), (left + 0.19, FRONT - 0.055, z), bright, bevel=0.007, segments=1)
        fl.box(f"latch{i}", (0.03, 0.032, 0.066), (left + 0.34, FRONT - 0.05, z), bright, bevel=0.006, segments=1)
        # Perforated carrier face between the latch and the LED.
        for k in range(3):
            fl.box(f"slot{i}_{k}", (0.014, 0.004, 0.05), (left + 0.395 + k * 0.03, FRONT - 0.04, z), m("rubber"), bevel=0)
        led = fl.box(f"led{i}", (0.045, 0.014, 0.034), (right - 0.05, FRONT - 0.045, z), m(led_colors[i]), bevel=0)
        fl.hook(led, "blinker", speed=2.0 + i * 0.9, phase=i * 1.3, base=1.0)

    # Cache fill meter: a segmented light pipe beside the bay.
    mx = bay_x1 + frame + 0.035
    segments = 8
    step = (bay_z1 - bay_z0) / segments
    for i in range(segments):
        z = bay_z0 + step * (i + 0.5)
        fl.box(f"meter{i}", (0.03, 0.02, step - 0.018), (mx, FRONT - 0.01, z), m("role_glow" if i < 6 else "role_glow_soft"), bevel=0)

    # Uplink ports under the bay.
    for i in range(2):
        fl.box(f"port{i}", (0.07, 0.012, 0.03), (bay_cx - 0.06 + i * 0.1, FRONT - 0.005, BASE_TOP + 0.02), m("glow_teal"), bevel=0)

    # Side vents: louvres in a graphite frame, a dim role glow behind them.
    vz0, vz1 = BASE_TOP + 0.09, ROOF - 0.09
    vy = hy - 0.13
    for side in (-1, 1):
        x = side * hx
        fl.box(f"vent_glow{side}", (0.01, vy * 2, vz1 - vz0), (x + side * 0.002, 0, (vz0 + vz1) / 2), m("role_glow_soft"), bevel=0)
        fl.box(f"vent_top{side}", (0.03, vy * 2 + 0.06, 0.03), (x + side * 0.01, 0, vz1 + 0.015), graphite, bevel=0.008, segments=1)
        fl.box(f"vent_bot{side}", (0.03, vy * 2 + 0.06, 0.03), (x + side * 0.01, 0, vz0 - 0.015), graphite, bevel=0.008, segments=1)
        fl.box(f"vent_fr{side}", (0.03, 0.03, vz1 - vz0), (x + side * 0.01, -vy - 0.015, (vz0 + vz1) / 2), graphite, bevel=0.008, segments=1)
        fl.box(f"vent_bk{side}", (0.03, 0.03, vz1 - vz0), (x + side * 0.01, vy + 0.015, (vz0 + vz1) / 2), graphite, bevel=0.008, segments=1)
        slats = 7
        for i in range(slats):
            z = vz0 + (vz1 - vz0) * (i + 0.5) / slats
            fl.box(f"slat{side}_{i}", (0.012, vy * 2, 0.05), (x + side * 0.008, 0, z), dark,
                   rotation=(0, side * 0.6, 0), bevel=0)

    # The cached data cube turns against its floating heart.
    centre = (0, 0, CUBE_Z)
    cube = data_cube("data_cube", CUBE_HALF, 0.03, 0.056, centre, m("role_glow"))
    fl.hook(cube, "spinner", speed=-0.7, axis="y")
    # The heart stands on a corner, like a cut gem.
    # A hooked holder must keep identity rotation, so the tilt goes into the mesh.
    tilt = Matrix.Rotation(-math.atan(math.sqrt(2)), 4, "Y") @ Matrix.Rotation(-math.pi / 4, 4, "Z")
    heart = fl.box("heart", (0.17, 0.17, 0.17), centre, m("role_luminous"), bevel=0.014)
    heart.data.transform(tilt)
    fl.hook(heart, "floater")
    aura = fl.box("heart_aura", (0.21, 0.21, 0.21), centre, m("role_glow_soft"), bevel=0)
    aura.data.transform(tilt)
    fl.parent(aura, heart)
