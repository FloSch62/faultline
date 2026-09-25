# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Power: a PoE injector built as a Tesla coil. A heavy copper winding climbs a
dark core between porcelain standoffs; a porcelain bushing lifts the crackling
plasma column into the floating toroidal terminal, while sparks race around it.
The RJ45 pair on the front takes power in and sends data+power out."""

import math
import random

import bmesh
from mathutils import Euler, Vector

from lib import faultline as fl

# The power label floats at 3.05, so the terminal may ride a little higher.
MAX_TOP = 2.6


# ---------------------------------------------------------------------------
# Role-local geometry


def helix(name, radius, thickness, z0, z1, turns, mat, start=-math.pi / 2, per_turn=30, sides=8):
    """A round wire wound `turns` times around the Z axis, rising from z0 to z1."""
    bm = bmesh.new()
    steps = max(2, int(per_turn * turns))
    rise = z1 - z0
    rings = []
    for i in range(steps + 1):
        t = i / steps
        a = start + math.tau * turns * t
        centre = Vector((math.cos(a) * radius, math.sin(a) * radius, z0 + rise * t))
        tangent = Vector((-math.sin(a) * radius * math.tau * turns, math.cos(a) * radius * math.tau * turns, rise)).normalized()
        normal = Vector((math.cos(a), math.sin(a), 0))
        binormal = tangent.cross(normal)
        rings.append([bm.verts.new(centre + (normal * math.cos(k * math.tau / sides) + binormal * math.sin(k * math.tau / sides)) * thickness)
                      for k in range(sides)])
    for i in range(steps):
        for k in range(sides):
            kk = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][kk], rings[i][kk]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=True, angle=60)


def strand(name, points, width, mat, taper=0.6, sides=4):
    """A thin tube along a polyline (arcs, leads). Tapers toward the last point."""
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == len(pts) - 1:
            d = pts[-1] - pts[-2]
        else:
            d = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        d.normalize()
        ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        n = d.cross(ref).normalized()
        b = d.cross(n)
        w = width * (1 - taper * i / (len(pts) - 1))
        rings.append([bm.verts.new(p + (n * math.cos(k * math.tau / sides + math.pi / 4) + b * math.sin(k * math.tau / sides + math.pi / 4)) * w)
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            kk = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][kk], rings[i][kk]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=False)


def jagged(start, end, count, jitter, rng):
    """Points of a lightning path from start to end with sideways kicks."""
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    side_a = axis.cross(ref).normalized()
    side_b = axis.cross(side_a)
    points = [start]
    for i in range(1, count):
        t = i / count
        kick = side_a * rng.uniform(-jitter, jitter) + side_b * rng.uniform(-jitter, jitter)
        points.append(start.lerp(end, t) + kick * math.sin(t * math.pi) ** 0.5)
    points.append(end)
    return points


def insulator(name, xy, z0, z1, sheds, r_core, r_shed, porcelain, cap, sides=10):
    """A porcelain post: a core rod ringed with flat umbrella sheds, brass caps at both ends."""
    cap_h = 0.035
    fl.cylinder(f"{name}_foot", r_core + 0.02, z0, z0 + cap_h, cap, xy=xy, sides=sides, r_top=r_core + 0.01)
    fl.cylinder(f"{name}_head", r_core + 0.01, z1 - cap_h, z1, cap, xy=xy, sides=sides, r_top=r_core + 0.02)
    fl.cylinder(f"{name}_core", r_core, z0 + cap_h, z1 - cap_h, porcelain, xy=xy, sides=sides)
    span = (z1 - z0 - 2 * cap_h) / sheds
    for i in range(sheds):
        zb = z0 + cap_h + span * (i + 0.5) - 0.018
        fl.prism(f"{name}_shed{i}", sides, r_shed, r_shed * 0.55, zb, zb + 0.036, porcelain, xy=xy, rotation_z=0,
                 bevel=0, smooth=True)


def facing(obj, angle, tilt=0.0):
    """Turn a part built along +Z (a disc) to face outward along `angle`, leaning back by `tilt`."""
    obj.rotation_euler = (math.pi / 2 - tilt, 0, angle + math.pi / 2)
    return obj


# ---------------------------------------------------------------------------


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright, steel = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright"), m("metal_steel")
    rubber = m("rubber")
    porcelain = fl.lit("porcelain", 0x8C846F, 0.1, 0.32)
    copper = fl.lit("copper_live", 0xB8733A, 0.85, 0.3, emission=0xF4C050, strength=0.22)
    plasma = fl.unlit("glow_plasma", 0xFFF0A0)
    arc = fl.unlit("glow_arc", 0xFFEFA6)
    z0 = fl.PLINTH_TOP

    # Foot and the injector housing (a tapered octagon, flat face to the camera).
    fl.prism("foot", 8, 0.62, 0.6, z0, z0 + 0.06, brass, bevel=0.012, segments=1)
    h0, h1 = z0 + 0.06, z0 + 0.30
    r_low, r_high = 0.58, 0.54
    fl.prism("housing", 8, r_low, r_high, h0, h1, dark, bevel=0.02, segments=2)
    tilt = math.atan((r_low - r_high) * math.cos(math.pi / 8) / (h1 - h0))
    fl.prism("deck", 8, 0.52, 0.5, h1, h1 + 0.04, graphite, bevel=0.012, segments=1)
    deck = h1 + 0.04

    def apothem(z):
        return (r_low - (r_low - r_high) * (z - h0) / (h1 - h0)) * math.cos(math.pi / 8)

    # RJ45 jack module on the front: power in (left), data+power out (right).
    jz = (h0 + h1) / 2 + 0.005
    front = -apothem(jz)
    fl.box("jack_block", (0.38, 0.1, 0.17), (0, front - 0.012, jz), graphite, bevel=0.012)
    face = front - 0.062
    for side, x in (("in", -0.09), ("out", 0.09)):
        fl.box(f"jack_{side}_shield", (0.14, 0.02, 0.115), (x, face, jz), steel, bevel=0.006, segments=1)
        fl.box(f"jack_{side}_socket", (0.1, 0.02, 0.07), (x, face - 0.006, jz - 0.005), rubber, bevel=0.004, segments=1)
        # The RJ45 latch keyway below the contacts.
        fl.box(f"jack_{side}_latch", (0.044, 0.02, 0.02), (x, face - 0.006, jz - 0.044), rubber, bevel=0)
        fl.box(f"jack_{side}_pins", (0.07, 0.012, 0.014), (x, face - 0.012, jz + 0.01), plasma, bevel=0)
        led = fl.box(f"jack_{side}_led", (0.034, 0.012, 0.02), (x + 0.042, face - 0.012, jz + 0.042),
                     m("glow_ember") if side == "in" else m("role_glow"), bevel=0)
        fl.hook(led, "blinker", speed=1.3 if side == "in" else 3.1, phase=0.0 if side == "in" else 1.9, base=0.95)
    # A chevron between the jacks: power flows in on the left, data+power leaves on the right.
    chevron = [(-0.012, face - 0.012, jz + 0.02), (0.012, face - 0.012, jz), (-0.012, face - 0.012, jz - 0.02)]
    strand("jack_chevron", chevron, 0.008, plasma, taper=0)

    # Meters on the two front diagonals: a glowing dial behind a brass bezel.
    for i, a in enumerate((-3 * math.pi / 4, -math.pi / 4)):
        z = jz + 0.005
        r = apothem(z)
        ca, sa = math.cos(a), math.sin(a)
        bezel = fl.cylinder(f"meter{i}_bezel", 0.078, -0.016, 0.016, bright, sides=12, bevel=0.006, segments=1)
        bezel.location = (ca * (r + 0.006), sa * (r + 0.006), z)
        facing(bezel, a, tilt)
        dial = fl.cylinder(f"meter{i}_dial", 0.06, -0.004, 0.004, m("role_glow_soft"), sides=12)
        dial.location = (ca * (r + 0.021), sa * (r + 0.021), z)
        facing(dial, a, tilt)
        # The needle pivots from the dial centre and leans toward the load side.
        lean = 0.55 if i else -0.35
        turn = Euler((-tilt, lean, a + math.pi / 2), "YXZ")
        pivot = Vector((ca * (r + 0.027), sa * (r + 0.027), z))
        needle = fl.box(f"meter{i}_needle", (0.016, 0.008, 0.046), (0, 0, 0), rubber, bevel=0)
        needle.rotation_mode = "YXZ"
        needle.rotation_euler = turn
        needle.location = pivot + turn.to_matrix() @ Vector((0, 0, 0.018))

    # Coil former and the heavy copper primary.
    c0, c1 = deck, deck + 0.47
    fl.cylinder("core", 0.25, c0, c1, dark, sides=12)  # mostly hidden by the winding
    helix("primary", 0.355, 0.043, c0 + 0.065, c1 - 0.065, 3, copper, start=math.radians(40), per_turn=22)
    a = math.radians(40)
    lx, ly = math.cos(a) * 0.355, math.sin(a) * 0.355
    fl.cylinder("lead_low", 0.028, deck, c0 + 0.07, bright, xy=(lx, ly), sides=8)
    fl.cylinder("lead_high", 0.028, c1 - 0.07, c1 + 0.01, bright, xy=(lx, ly), sides=8)

    # Porcelain standoffs frame the coil and carry the grading ring.
    for i, (x, y, _a) in enumerate(fl.polar(4, 0.49, start=-math.pi / 2 + math.pi / 4)):
        insulator(f"post{i}", (x, y), deck, c1 + 0.025, 3, 0.024, 0.062, porcelain, brass, sides=8)
    fl.torus("grading_ring", 0.49, 0.024, (0, 0, c1 + 0.04), bright, minor_segments=6, major_segments=32)

    # Top plate with a luminous band.
    fl.cylinder("top_plate", 0.3, c1, c1 + 0.05, graphite, sides=16, bevel=0.01)
    fl.cylinder("top_band", 0.305, c1 + 0.013, c1 + 0.037, m("role_luminous"), sides=16)
    fl.cylinder("top_boss", 0.2, c1 + 0.05, c1 + 0.078, brass, sides=16, r_top=0.18, bevel=0.008, segments=1)
    t1 = c1 + 0.078

    # Porcelain bushing lifting the electrode.
    b0, b1 = t1, t1 + 0.15
    fl.cylinder("bushing_core", 0.065, b0, b1, porcelain, sides=12)
    for i in range(2):
        zb = b0 + 0.025 + i * 0.065
        fl.prism(f"bushing_shed{i}", 14, 0.15 - i * 0.025, 0.08 - i * 0.012, zb, zb + 0.04, porcelain, rotation_z=0, bevel=0, smooth=True)
    fl.cylinder("electrode", 0.08, b1, b1 + 0.035, bright, sides=12, r_top=0.055, bevel=0.006, segments=1)
    e1 = b1 + 0.035

    # Plasma column rising into the terminal: a jagged white-hot arc inside a flickering sheath and a faint haze.
    tz = 2.47
    rng = random.Random(11)
    core = [(0, 0, e1 - 0.01)]
    steps = 7
    for i in range(1, steps):
        t = i / steps
        ang = rng.uniform(0, math.tau)
        r = rng.uniform(0.012, 0.03)
        core.append((math.cos(ang) * r, math.sin(ang) * r, e1 + (tz - e1) * t))
    core.append((0, 0, tz))
    strand("plasma_core", core, 0.042, plasma, taper=0.25, sides=6)
    sheath = fl.tube("plasma_sheath", 0.085, 0, e1, tz - 0.05, m("role_glow_soft"), sides=14)
    fl.hook(sheath, "blinker", speed=11.0, phase=0.7, base=0.6)
    fl.tube("plasma_haze", 0.15, 0, e1 + 0.02, tz - 0.07, m("role_glow_faint"), sides=18)

    # Top terminal: a luminous toroid banded in brass, on brass spokes, with a breakout point
    # and a white-hot hub. The whole terminal floats.
    major, minor = 0.25, 0.066
    terminal = fl.torus("terminal_ring", major, minor, (0, 0, tz), m("role_luminous"), major_segments=32, minor_segments=9)
    spike = fl.prism("terminal_spike", 6, 0.02, 0.0, -0.05, 0.05, m("role_luminous"), bevel=0, smooth=False)
    spike.location = (major + minor + 0.04, 0, tz)
    spike.rotation_euler = (0, math.pi / 2, 0)
    terminal = fl.merge("terminal", [terminal, spike], pivot=(0, 0, tz))
    fl.hook(terminal, "floater")
    frame = [
        fl.cylinder("terminal_collar", 0.066, tz - 0.03, tz + 0.04, bright, sides=12, bevel=0.006, segments=1),
        fl.torus("terminal_band", major + minor - 0.006, 0.017, (0, 0, tz), bright, major_segments=40, minor_segments=5),
    ]
    for i, (x, y, a) in enumerate(fl.polar(4, 0.135, start=-math.pi / 4)):
        frame.append(fl.box(f"terminal_spoke{i}", (0.16, 0.03, 0.024), (x, y, tz + 0.03), bright, rotation=(0, 0, a),
                            bevel=0.006, segments=1))
    frame = fl.merge("terminal_frame", frame, pivot=(0, 0, tz))
    hub = fl.sphere("terminal_hub", 0.058, (0, 0, tz + 0.04), plasma, segments=10, rings=7)
    fl.parent(frame, terminal)
    fl.parent(hub, terminal)

    # Spark orbit: three sparks on jagged streamers, racing around the column.
    orbit_z = 2.24
    parts = []
    rng = random.Random(3)
    for i, (x, y, a) in enumerate(fl.polar(3, 0.44, start=-math.pi / 2 + 0.5)):
        dz = (i - 1) * 0.1
        parts.append(fl.octahedron(f"spark{i}", 0.042, (x, y, orbit_z + dz), arc, stretch=1.6))
        path = jagged((math.cos(a) * 0.07, math.sin(a) * 0.07, orbit_z + dz * 0.2), (x, y, orbit_z + dz), 5, 0.05, rng)
        parts.append(strand(f"streamer{i}", path, 0.017, arc, taper=0.45))
    sparks = fl.merge("sparks", parts, pivot=(0, 0, orbit_z))
    fl.hook(sparks, "spinner", speed=2.4, axis="y")
