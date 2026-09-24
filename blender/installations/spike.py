"""Spike: an iron spike driven into a cracked deck plate. The octagonal plate is split along
three radial cracks into buckled shards pushed apart by the blow; the grooves between them
show the hot underlay. A tapering four-sided spike, leaning a little, carries two ivory
hazard bands and a rust heat slit near its tip. A static threat: no hooks.

World.ts draws the reach ring, the wear pulse toward its target and the integrity pips."""

import math

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

PLATE_R = 0.5
PLATE_T = 0.055
SPIKE_R = 0.23  # circumradius of the square base (a flat face toward -Y)
SPIKE_Z = (0.06, 1.5)
CRACKS = (-58, 72, 196)  # degrees


def octagon_radius(angle):
    """Distance from the centre to the octagon's edge along `angle` (flat side toward -Y)."""
    apothem = PLATE_R * math.cos(math.pi / 8)
    face = -math.pi / 2 + round((angle + math.pi / 2) / (math.pi / 4)) * (math.pi / 4)
    return apothem / math.cos(angle - face)


def crack_path(angle, jitter):
    """Jagged crack from the centre to the rim along `angle`."""
    d = Vector((math.cos(angle), math.sin(angle), 0))
    t = Vector((-d.y, d.x, 0))
    end = octagon_radius(angle)
    return [d * (end * f) + t * j for f, j in zip((0.3, 0.5, 0.72), jitter)] + [d * end]


def shard(name, outline, mat, lift, bisector):
    """Extrude a plate shard and buckle it: the inner end rises as if the spike drove it down."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((p.x, p.y, 0)) for p in outline])
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[e for e in extruded["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, PLATE_T))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = fl.finish(fl.from_bmesh(name, bm, mat), 0.008, segments=1)
    d = Vector((math.cos(bisector), math.sin(bisector), 0))
    pivot = d * octagon_radius(bisector)
    axis = Vector((-d.y, d.x, 0))
    matrix = Matrix.Translation(d * 0.022) @ Matrix.Translation(pivot) @ Matrix.Rotation(lift, 4, axis) @ Matrix.Translation(-pivot)
    return fl.transform([obj], matrix)[0]


def build(kind):
    m = lambda name: fl.material(name, kind)  # noqa: E731
    iron, graphite, hot = m("metal_steel"), m("metal_graphite"), m("role_luminous")

    # The underlay glows through the cracks (recessed grooves).
    fl.prism("underlay", 8, PLATE_R - 0.03, PLATE_R - 0.05, 0.0, 0.018, hot, rotation_z=math.pi / 8, bevel=0)

    # Three shards between the cracks, each pushed out and buckled.
    angles = [math.radians(a) for a in CRACKS]
    jitters = [(0.03, -0.035, 0.02), (-0.03, 0.03, -0.025), (0.025, -0.02, 0.035)]
    paths = [crack_path(a, j) for a, j in zip(angles, jitters)]
    corners = [-math.pi / 2 + math.pi / 8 + k * math.pi / 4 for k in range(8)]
    for i in range(3):
        a0, a1 = angles[i], angles[(i + 1) % 3]
        span = (a1 - a0) % math.tau
        rim = sorted(((c - a0) % math.tau, c) for c in corners if 0 < (c - a0) % math.tau < span)
        outline = [Vector((0, 0, 0))] + paths[i] + \
            [Vector((math.cos(c), math.sin(c), 0)) * PLATE_R for _, c in rim] + list(reversed(paths[(i + 1) % 3]))
        shard(f"shard{i}", outline, iron, math.radians(4 + i), a0 + span / 2)

    # A square collar where the spike bit in, with four rivets.
    fl.prism("collar", 4, 0.33, 0.29, 0.03, 0.13, graphite, bevel=0.012, segments=1)
    for i, (x, y, _) in enumerate(fl.polar(4, 0.21, start=-math.pi / 4)):
        fl.sphere(f"rivet{i}", 0.02, (x, y, 0.13), graphite, segments=8, rings=4)

    # The spike, its bands and slits, built upright and then leaned together.
    z0, z1 = SPIKE_Z
    spike = [fl.prism("spike", 4, SPIKE_R, 0.006, z0, z1, iron, bevel=0.006, segments=1)]

    def radius(z):
        return SPIKE_R + (0.006 - SPIKE_R) * (z - z0) / (z1 - z0)

    slope = math.atan((radius(z0) - radius(z1)) * math.cos(math.pi / 4) / (z1 - z0))
    for i, (za, zb) in enumerate(((0.44, 0.5), (0.56, 0.62))):
        spike.append(fl.prism(f"band{i}", 4, radius(za) + 0.012, radius(zb) + 0.012, za, zb, m("glow_band"), bevel=0))
    for i, (_, _, a) in enumerate(fl.polar(4, 1.0)):
        z = 1.16
        ap = radius(z) * math.cos(math.pi / 4) + 0.004
        spike.append(fl.box(f"slit{i}", (0.03, 0.012, 0.2), (math.cos(a) * ap, math.sin(a) * ap, z), hot,
                            rotation=(-slope, 0, a + math.pi / 2), bevel=0))
    lean = Matrix.Translation((0, 0, z0)) @ Matrix.Rotation(math.radians(6), 4, Vector((0.6, -1, 0)).normalized()) @ \
        Matrix.Translation((0, 0, -z0))
    fl.transform(spike, lean)

    # Chips of plate thrown out by the blow.
    for i, (r, a, s) in enumerate(((0.54, 0.3, 0.05), (0.5, 2.2, 0.04), (0.56, 3.9, 0.045), (0.47, 5.0, 0.035))):
        fl.rest_on(fl.tetrahedron(f"chip{i}", s, (math.cos(a) * r, math.sin(a) * r, 0), iron, rotation=(a, a * 1.7, a * 0.4)))
