"""Jammer: a brass surveying tripod carrying a copper-wound coil drum ringed with six cold
emitter studs. On top a small ivory-rimmed dish on a yoke looks out toward the camera,
tilted 20 degrees up; the yoke turns slowly so the dish sweeps the table.

World.ts draws the 2.0 reach ring on hover, the jam beam and the integrity pips."""

import math

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

DRUM = (0.7, 1.1)
YOKE_Z = 1.17
DISH_Z = 1.4
DISH_R = 0.2
# The dish axis leans 20 degrees from straight up toward -Y (the camera), so the bowl reads from the table camera.
TILT = math.radians(70)


def dish_surface(name, radius, depth, mat, offset=0.0, rings=4, segments=16):
    """Shallow paraboloid facing +Z (concave up), centred at the origin; `offset` pushes it back."""
    bm = bmesh.new()
    centre = bm.verts.new((0, 0, -offset))
    previous = None
    for k in range(1, rings + 1):
        r = radius * k / rings
        z = depth * (r / radius) ** 2 - offset
        ring = [bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in (math.tau * i / segments for i in range(segments))]
        for i in range(segments):
            j = (i + 1) % segments
            if previous is None:
                bm.faces.new((centre, ring[i], ring[j]))
            else:
                bm.faces.new((previous[i], ring[i], ring[j], previous[j]))
        previous = ring
    if offset:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=True, angle=60, weighted=False)


def build(kind):
    m = lambda name: fl.material(name, kind)  # noqa: E731
    brass, bright, copper = m("metal_brass"), m("metal_brass_bright"), m("metal_copper")

    # Tripod: three legs from under the drum to feet at radius 0.53, a centre pole and spreaders.
    legs = list(fl.polar(3, 1.0, start=-math.pi / 2 + math.pi / 3))
    for i, (x, y, a) in enumerate(legs):
        top, foot = Vector((x * 0.13, y * 0.13, DRUM[0] + 0.02)), Vector((x * 0.53, y * 0.53, 0.035))
        knee = top.lerp(foot, 0.5) + Vector((x, y, 0)) * 0.03
        fl.sweep(f"leg{i}", [top, knee, foot], 0.028, brass, sides=6, radii=[0.034, 0.03, 0.024])
        fl.cylinder(f"foot{i}", 0.05, 0.0, 0.035, bright, xy=(x * 0.53, y * 0.53), sides=10, r_top=0.04)
        fl.box(f"clamp{i}", (0.07, 0.07, 0.07), (x * 0.14, y * 0.14, DRUM[0] - 0.01), bright,
               rotation=(0, 0, a), bevel=0.01, segments=1)
        # A spreader bar from the pole collar to the leg.
        at = top.lerp(foot, 0.62)
        fl.sweep(f"spreader{i}", [(x * 0.04, y * 0.04, 0.3), (at.x, at.y, at.z)], 0.012, bright, sides=5)
    fl.cylinder("pole", 0.03, 0.26, DRUM[0], brass, sides=10)
    fl.cylinder("pole_collar", 0.05, 0.27, 0.33, bright, sides=10)

    # Coil drum: brass core, bright flanges, copper windings above and below a stud band.
    z0, z1 = DRUM
    fl.cylinder("drum_core", 0.2, z0, z1, brass, sides=16)
    fl.cylinder("flange_low", 0.27, z0, z0 + 0.04, bright, sides=16, bevel=0.008, segments=1)
    fl.cylinder("flange_high", 0.27, z1 - 0.04, z1, bright, sides=16, bevel=0.008, segments=1)
    fl.cylinder("stud_band", 0.24, 0.88, 0.94, bright, sides=16, bevel=0.006, segments=1)
    for i, z in enumerate((0.775, 0.83, 0.99, 1.045)):
        fl.torus(f"winding{i}", 0.222, 0.026, (0, 0, z), copper, major_segments=16, minor_segments=4)
    for i, (x, y, a) in enumerate(fl.polar(6, 0.25)):
        stud = fl.cylinder(f"stud{i}", 0.04, -0.035, 0.035, m("role_luminous"), sides=8, bevel=0.012, segments=1)
        stud.location = (x, y, 0.91)
        stud.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
    fl.cylinder("turntable", 0.1, z1, YOKE_Z, bright, sides=16, r_top=0.075)

    # The yoke turns; it carries a fork, the dish (tilted 20 degrees up from facing -Y) and its feed.
    yoke = fl.empty("yoke", (0, 0, YOKE_Z))
    fl.hook(yoke, "spinner", speed=0.35, axis="y")
    arm_x = DISH_R + 0.035
    parts = [
        fl.cylinder("yoke_base", 0.075, YOKE_Z, YOKE_Z + 0.04, bright, sides=12),
        fl.box("yoke_bar", (arm_x * 2 + 0.04, 0.05, 0.035), (0, 0, YOKE_Z + 0.055), bright, bevel=0.008, segments=1),
    ]
    for side in (-1, 1):
        parts.append(fl.box(f"yoke_arm{side}", (0.035, 0.05, DISH_Z - YOKE_Z - 0.02), (side * arm_x, 0, (YOKE_Z + DISH_Z) / 2 + 0.03),
                            bright, bevel=0.008, segments=1))
        parts.append(fl.cylinder(f"trunnion{side}", 0.03, -0.025, 0.025, bright, sides=10))
        parts[-1].location = (side * (arm_x - 0.012), 0, DISH_Z)
        parts[-1].rotation_euler = (0, math.pi / 2, 0)

    # Dish local +Z (its axis) turned toward (0, -cos 20, sin 20).
    turn = Matrix.Translation((0, 0, DISH_Z)) @ Matrix.Rotation(math.pi / 2 - TILT, 4, "X")
    depth = 0.085
    face = dish_surface("dish_face", DISH_R, depth, m("role_glow_soft"))
    back = dish_surface("dish_back", DISH_R + 0.012, depth, bright, offset=0.018)
    rim = fl.torus("dish_rim", DISH_R + 0.004, 0.015, (0, 0, depth), m("glow_band"), major_segments=20, minor_segments=4)
    focus = 0.2
    struts = [fl.sweep(f"feed_strut{i}", [(math.cos(a) * DISH_R * 0.92, math.sin(a) * DISH_R * 0.92, depth * 0.85), (0, 0, focus)],
                       0.007, bright, sides=4, caps=False)
              for i, a in enumerate((math.pi / 2, math.pi / 2 + math.tau / 3, math.pi / 2 - math.tau / 3))]
    feed = fl.octahedron("feed", 0.03, (0, 0, focus), m("role_glow"), stretch=1.3)
    fl.transform([face, back, rim, feed, *struts], turn)
    fl.merge_onto(yoke, parts + [face, back, rim, feed, *struts])
