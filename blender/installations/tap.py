"""Siphon Tap: the malware prop rebuilt as a model. A seven-sided dark pedestal with glowing
seams and three claw prongs draws a thin stream up into a floating stellated dodecahedral
core (it spins inside its bob); five tetrahedral shards orbit it the other way, and a narrow
uplink funnel above reports back to its owner.

World.ts keeps the stain decal, the pulse ring, the point light, the flicker, the label,
the forecast ghost and the scrub dissolve.

MAX_TOP: the design's uplink funnel reaches z 2.2 (installation envelope 1.9); it is a faint
double-sided glow under the label at 2.3, so the ceiling is raised for this kind only."""

import math

from mathutils import Vector

from lib import faultline as fl

import bmesh

MAX_TOP = 2.2
CORE_Z = 1.38
PHI = (1 + 5 ** 0.5) / 2


def stellated_dodecahedron(name, inner, outer, location, mat):
    """Twelve pentagonal spikes on a dodecahedron (circumradius `inner`), apexes at `outer`."""
    raw = [Vector((x, y, z)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for a in (-1, 1):
        for b in (-1, 1):
            raw += [Vector((0, a / PHI, b * PHI)), Vector((a / PHI, b * PHI, 0)), Vector((a * PHI, 0, b / PHI))]
    points = [v * (inner / 3 ** 0.5) for v in raw]
    normals = []
    for a in (-1, 1):
        for b in (-1, 1):
            normals += [Vector((0, a, b * PHI)), Vector((a, b * PHI, 0)), Vector((a * PHI, 0, b))]
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in points]
    for normal in normals:
        normal.normalize()
        face = sorted(range(len(points)), key=lambda i: -points[i].dot(normal))[:5]
        centre = sum((points[i] for i in face), Vector()) / 5
        axis_u = (points[face[0]] - centre).normalized()
        axis_v = normal.cross(axis_u)
        face.sort(key=lambda i: math.atan2((points[i] - centre).dot(axis_v), (points[i] - centre).dot(axis_u)))
        apex = bm.verts.new(normal * outer)
        for k in range(5):
            bm.faces.new((verts[face[k]], verts[face[(k + 1) % 5]], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, location), 0, smooth=False)


def build(kind):
    m = lambda name: fl.material(name, kind)  # noqa: E731
    dark, glow = m("metal_dark"), m("role_glow")

    # Pedestal: seven sides, a stepped top plate and a glowing seam on every face.
    fl.prism("pedestal", 7, 0.5, 0.36, 0.0, 0.18, dark, bevel=0.02)
    fl.prism("plate", 7, 0.33, 0.29, 0.18, 0.23, dark, bevel=0.012, segments=1)
    for i, (x, y, a) in enumerate(fl.polar(7, 0.43)):
        # A slit on the sloped face, leaning back with it.
        slope = math.atan((0.5 - 0.36) / 0.18)
        fl.box(f"seam{i}", (0.16, 0.012, 0.035), (x, y, 0.085), glow, rotation=(-slope, 0, a + math.pi / 2), bevel=0)

    # Three claw prongs grip the stream at its root; their tips glow.
    for i, (x, y, a) in enumerate(fl.polar(3, 1.0, start=-math.pi / 2 + math.pi / 3)):
        path = [(x * r, y * r, z) for r, z in ((0.22, 0.2), (0.27, 0.36), (0.25, 0.52), (0.17, 0.66), (0.1, 0.72))]
        fl.sweep(f"prong{i}", path, 0.03, dark, sides=5, radii=[0.04, 0.036, 0.03, 0.022, 0.012])
        fl.octahedron(f"prong_tip{i}", 0.026, (x * 0.1, y * 0.1, 0.73), glow, stretch=1.4)

    # The siphoned stream: glowing packets climbing from the claws into the core, shrinking as they go.
    for i, (z, r) in enumerate(((0.8, 0.045), (0.9, 0.038), (0.985, 0.03), (1.055, 0.023))):
        fl.octahedron(f"packet{i}", r, (0, 0, z), glow, stretch=1.5)

    # The core: a floating holder (bob) carrying the spinning star and its glowing heart.
    core = fl.empty("core", (0, 0, CORE_Z))
    fl.hook(core, "floater")
    star = stellated_dodecahedron("core_star", 0.14, 0.36, (0, 0, CORE_Z), m("role_luminous"))
    fl.hook(star, "spinner", speed=1.1, axis="y")
    fl.parent(star, core)
    fl.parent(fl.icosphere("core_heart", 0.152, (0, 0, CORE_Z), glow, subdivisions=1), core)

    # Five shards orbit the other way, rising and falling around the core.
    shards = fl.empty("shards", (0, 0, CORE_Z))
    fl.hook(shards, "spinner", speed=-1.6, axis="y")
    parts = []
    for i in range(5):
        a = i / 5 * math.tau
        parts.append(fl.tetrahedron(f"shard{i}", 0.075, (math.cos(a) * 0.62, math.sin(a) * 0.62, CORE_Z + math.sin(a * 2) * 0.12),
                                    glow, rotation=(a, a * 0.7, a * 1.3)))
    fl.merge_onto(shards, parts)

    # The uplink: a narrow open funnel above the core.
    funnel(0.035, 0.11, 1.6, 2.2, m("glow_uplink"))


def funnel(r0, r1, z0, z1, mat, sides=6):
    """Open frustum (no caps), smooth, for a double-sided glow."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=sides, radius1=r0, radius2=r1, depth=z1 - z0)
    return fl.finish(fl.from_bmesh("uplink", bm, mat, (0, 0, (z0 + z1) / 2)), 0, smooth=True)
