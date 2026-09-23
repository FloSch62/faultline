"""Load balancer: a gyroscopic distributor. One stream enters a heavy round hub
through the port that faces the camera, climbs the spindle to the core orb and
is flung out along three weighted governor arms (weights 3 : 2 : 1) that turn
together; a counter-rotating crown carries the three backends above a floating
tri-facet crest."""

import math

import bmesh
import bpy
from mathutils import Vector

from lib import faultline as fl

# Hub drum: a many-sided frustum.
DRUM_Z0, DRUM_Z1 = 1.0, 1.28
DRUM_R0, DRUM_R1 = 0.6, 0.55
SIDES = 24
DECK_TOP = 1.39
# The governor: arms hinge on a collar round the orb and sweep down to the flyballs.
ORB_Z = 1.78
TIP_R, TIP_Z = 0.76, 1.57
COLLAR_R = 0.205
WEIGHTS = (3, 2, 1)


# ---------------------------------------------------------------------------
# Role-local helpers


def drum_apothem(z):
    """Distance from the axis to a flat face of the drum at height z."""
    r = DRUM_R0 - (DRUM_R0 - DRUM_R1) * (z - DRUM_Z0) / (DRUM_Z1 - DRUM_Z0)
    return r * math.cos(math.pi / SIDES)


DRUM_TILT = math.atan((DRUM_R0 - DRUM_R1) * math.cos(math.pi / SIDES) / (DRUM_Z1 - DRUM_Z0))


def on_drum(angle, z, lift=0.0):
    """(x, y) of a point on the drum face at `angle`, pushed out by `lift`."""
    r = drum_apothem(z) + lift
    return math.cos(angle) * r, math.sin(angle) * r


def drum_rot(angle):
    """Rotation for a part built facing -Y to sit flat on the drum face at `angle`."""
    return (-DRUM_TILT, 0, angle + math.pi / 2)


def rod(name, p0, p1, width, height, mat, bevel=0.01, segments=1):
    """A beam from p0 to p1 (its width stays horizontal)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    yaw = math.atan2(d.y, d.x)
    pitch = math.atan2(d.z, math.hypot(d.x, d.y))
    return fl.box(name, (d.length, width, height), (p0 + p1) / 2, mat, rotation=(0, -pitch, yaw), bevel=bevel, segments=segments)


def axial(obj, at, direction):
    """Point a part built along +Z (centred on its origin) along `direction`, centred at `at`."""
    d = Vector(direction).normalized()
    obj.location = at
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def bipyramid(name, radius, half_height, location, mat, sides=3):
    """A faceted spindle: `sides`-gon waist, pointed top and bottom."""
    bm = bmesh.new()
    top = bm.verts.new((0, 0, half_height))
    bottom = bm.verts.new((0, 0, -half_height))
    ring = [bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, 0))
            for a in (-math.pi / 2 + i * math.tau / sides for i in range(sides))]
    for i in range(sides):
        bm.faces.new((ring[i], ring[(i + 1) % sides], top))
        bm.faces.new((ring[(i + 1) % sides], ring[i], bottom))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    fl.device_collection().objects.link(obj)
    obj.location = location
    return fl.finish(obj, 0, smooth=False)


# ---------------------------------------------------------------------------


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite = m("metal_dark"), m("metal_graphite")
    brass, bright = m("metal_brass"), m("metal_brass_bright")
    luminous, glow, soft, faint = m("role_luminous"), m("role_glow"), m("role_glow_soft"), m("role_glow_faint")
    z0 = fl.PLINTH_TOP

    # --- Heavy hub -------------------------------------------------------
    fl.prism("foot", 24, 0.64, 0.62, z0, DRUM_Z0, brass, bevel=0.012, segments=1)
    fl.prism("drum", SIDES, DRUM_R0, DRUM_R1, DRUM_Z0, DRUM_Z1, dark, bevel=0.022, segments=2)

    # Six buttress ribs between the six bay positions.
    for i, (_, _, a) in enumerate(fl.polar(6, 1.0, start=-math.pi / 2 + math.pi / 6)):
        z = (DRUM_Z0 + DRUM_Z1) / 2
        x, y = on_drum(a, z, 0.012)
        fl.box(f"rib{i}", (0.064, 0.05, DRUM_Z1 - DRUM_Z0 - 0.03), (x, y, z), brass, rotation=drum_rot(a), bevel=0.012, segments=1)

    # Input port facing the camera: a brass hex union with a glowing core.
    a_in = -math.pi / 2
    zp = 1.14
    normal = Vector((0, -math.cos(DRUM_TILT), math.sin(DRUM_TILT)))
    base = Vector((*on_drum(a_in, zp), zp))
    fl.box("port_plate", (0.3, 0.03, 0.24), (*on_drum(a_in, zp, 0.004), zp), brass, rotation=drum_rot(a_in), bevel=0.01, segments=1)
    nut = fl.prism("port_nut", 6, 0.105, 0.105, -0.03, 0.03, bright, rotation_z=0, bevel=0.008, segments=1)
    axial(nut, base + normal * 0.045, normal)
    sleeve = fl.cylinder("port_sleeve", 0.078, -0.02, 0.02, dark, sides=16, bevel=0.006, segments=1)
    axial(sleeve, base + normal * 0.085, normal)
    core = fl.cylinder("port_core", 0.052, -0.006, 0.006, glow, sides=16)
    axial(core, base + normal * 0.1, normal)
    for side in (-1, 1):
        x, y = on_drum(a_in, zp + 0.075, 0.028)
        led = fl.box(f"port_led{side}", (0.035, 0.02, 0.035), (x + side * 0.12, y, zp + 0.075), m("glow_green" if side < 0 else "glow_amber"),
                     rotation=drum_rot(a_in), bevel=0)
        fl.hook(led, "blinker", speed=1.3 + side * 0.4, phase=1.1 + side, base=0.95)

    # Stream line: from the port up the drum, over the collar and deck to the spindle.
    x, y = on_drum(a_in, 1.25, 0.012)
    fl.box("stream_up", (0.035, 0.012, 0.06), (x, y, 1.25), glow, rotation=drum_rot(a_in), bevel=0)
    fl.box("stream_deck", (0.035, 0.37, 0.03), (0, -0.325, DECK_TOP + 0.013), glow, bevel=0)

    # Three output bays, one per path; their LED stacks show the weights 3 : 2 : 1.
    for bay, a in enumerate((-math.pi / 2 - math.tau / 6, -math.pi / 2 + math.tau / 6, math.pi / 2)):
        zb = 1.14
        rot = drum_rot(a)
        fl.box(f"bay_frame{bay}", (0.2, 0.03, 0.21), (*on_drum(a, zb, 0.006), zb), brass, rotation=rot, bevel=0.01, segments=1)
        fl.box(f"bay_glass{bay}", (0.15, 0.02, 0.16), (*on_drum(a, zb, 0.018), zb), m("glass_smoke"), rotation=rot, bevel=0.005, segments=1)
        for step in range(3):
            zl = zb - 0.05 + step * 0.05
            lit = step < WEIGHTS[bay]
            x, y = on_drum(a, zl, 0.03)
            fl.box(f"bay_led{bay}_{step}", (0.11, 0.012, 0.03), (x, y, zl), glow if lit else faint, rotation=rot, bevel=0)

    # Luminous collar and the deck: a dial ring of glowing ticks around a brass bezel.
    fl.prism("collar", SIDES, 0.565, 0.565, DRUM_Z1, DRUM_Z1 + 0.05, luminous, bevel=0.01, segments=1)
    fl.prism("deck", SIDES, 0.545, 0.5, DRUM_Z1 + 0.05, DECK_TOP, graphite, bevel=0.014, segments=1)
    fl.cylinder("bezel", 0.375, DECK_TOP - 0.005, DECK_TOP + 0.016, bright, sides=24, bevel=0.008, segments=1)
    fl.cylinder("dial", 0.34, DECK_TOP, DECK_TOP + 0.02, soft, sides=24)
    for i, (x, y, a) in enumerate(fl.polar(12, 0.44, start=-math.pi / 2 + math.pi / 12)):
        fl.box(f"tick{i}", (0.07, 0.022, 0.01), (x, y, DECK_TOP + 0.004), glow, rotation=(0, 0, a), bevel=0)

    # Spindle: a bearing housing, the shaft, and the orb it carries.
    fl.cylinder("bearing", 0.15, DECK_TOP + 0.01, DECK_TOP + 0.08, bright, sides=16, r_top=0.1, bevel=0.01, segments=1)
    fl.cylinder("shaft", 0.048, DECK_TOP + 0.06, ORB_Z - 0.1, brass, sides=12)
    fl.cylinder("orb_seat", 0.08, ORB_Z - 0.16, ORB_Z - 0.11, bright, sides=12, r_top=0.1, bevel=0.006, segments=1)
    fl.sphere("orb", 0.145, (0, 0, ORB_Z), luminous, segments=14, rings=10)
    fl.sphere("orb_aura", 0.172, (0, 0, ORB_Z), faint, segments=14, rings=9)

    # --- The governor (spins as one) ------------------------------------------
    arms = fl.hook(fl.empty("arms", (0, 0, ORB_Z)), "spinner", speed=0.6, axis="y")
    parts = [fl.torus("arm_collar", COLLAR_R, 0.034, (0, 0, ORB_Z), bright, major_segments=18, minor_segments=6)]
    # Governor head: three quarter-arcs cage the orb and meet in a boss under a finial.
    head = ORB_Z + COLLAR_R
    parts.append(fl.cylinder("head_boss", 0.056, head - 0.03, head + 0.03, bright, sides=12, r_top=0.046, bevel=0.008, segments=1))
    parts.append(fl.cylinder("head_finial", 0.032, head + 0.03, head + 0.1, bright, sides=12, r_top=0.012))
    sleeve_z = 1.51
    parts.append(fl.cylinder("arm_sleeve", 0.085, sleeve_z - 0.04, sleeve_z + 0.04, bright, sides=16, bevel=0.01, segments=1))
    for i, (cx, cy, a) in enumerate(fl.polar(3, 1.0)):
        out = Vector((cx, cy, 0))
        root = out * 0.225 + Vector((0, 0, ORB_Z))
        tip = out * TIP_R + Vector((0, 0, TIP_Z))
        along = (tip - root).normalized()
        end = tip - along * 0.075
        parts.append(rod(f"arm{i}", root, end, 0.062, 0.062, brass, bevel=0.014))
        arc = fl.torus(f"arc{i}", COLLAR_R, 0.027, (0, 0, ORB_Z), brass, rotation=(math.pi / 2, 0, a),
                       major_segments=24, minor_segments=6, arc=math.pi / 2)
        parts.append(arc)
        # Hinge knuckle on the collar.
        knuckle = fl.cylinder(f"knuckle{i}", 0.04, -0.045, 0.045, bright, sides=12)
        parts.append(axial(knuckle, root, Vector((-cy, cx, 0))))
        # Stream inlay along the top of the arm.
        up = Vector((0, 0, 1)) - along * along.z
        parts.append(rod(f"inlay{i}", root + along * 0.05 + up.normalized() * 0.03, end - along * 0.02 + up.normalized() * 0.03,
                         0.022, 0.008, glow, bevel=0))
        # Weight plates: this path's share of the traffic.
        for k in range(WEIGHTS[i]):
            plate = fl.cylinder(f"weight{i}_{k}", 0.075, -0.017, 0.017, bright, sides=14)
            parts.append(axial(plate, end - along * (0.1 + k * 0.042), along))
        # Flyball: a glowing tip held in a brass cup, with a soft aura.
        cup = fl.cylinder(f"cup{i}", 0.042, -0.03, 0.03, bright, sides=12, r_top=0.075)
        parts.append(axial(cup, tip - along * 0.08, along))
        parts.append(fl.sphere(f"tip{i}", 0.095, tip, glow, segments=10, rings=7))
        parts.append(fl.sphere(f"tip_aura{i}", 0.125, tip, soft, segments=12, rings=8))
        # Lower link: sleeve up to the middle of the arm (the governor's rhombus).
        joint = root + (tip - root) * 0.5
        foot = out * 0.085 + Vector((0, 0, sleeve_z + 0.02))
        parts.append(rod(f"link{i}", foot, joint - Vector((0, 0, 0.02)), 0.04, 0.04, brass, bevel=0.008))
    fl.merge_onto(arms, parts)

    # --- Crown: a counter-rotating ring carrying the three backends ------------
    crown_z = 2.14
    crown = fl.hook(fl.empty("crown", (0, 0, crown_z)), "spinner", speed=-0.9, axis="y")
    parts = [fl.torus("crown_ring", 0.34, 0.02, (0, 0, crown_z), glow, major_segments=30, minor_segments=5)]
    for i, (x, y, _) in enumerate(fl.polar(3, 0.34, start=-math.pi / 2 + math.pi / 3)):
        parts.append(fl.icosphere(f"crown_bead{i}", 0.048, (x, y, crown_z), bright, subdivisions=1, smooth=True))
    fl.merge_onto(crown, parts)

    # Crest: a floating tri-facet spindle, three faces for three paths.
    crest = bipyramid("crest", 0.125, 0.15, (0, 0, 2.25), luminous)
    fl.hook(crest, "floater")
