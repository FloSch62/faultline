# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Crate: a brass-bound dark iron box (0.7 x 0.5 x 0.45) with ivory hazard stripes round its
waist and a hinged brass lid. Under the lid the box glows amber from inside.

The lid is a separate object named "crate_lid" (glTF extra part = "lid") whose origin is the
hinge on the back edge (0, +0.25, 0.36): World.ts opens it by turning it about its X axis.
In three.js the lid opens with a negative rotation.x (about -1.9 fully open).

BUDGET: 5 draw calls, not the prop family's 4 - the four named materials (brass, dark iron,
ivory bands, amber interior) already fill the body, and the lid must be its own mesh."""

import math

import bmesh
from mathutils import Vector

from lib import faultline as fl

BUDGET = {"draw_calls": 5}
W, D, H = 0.7, 0.5, 0.45
RIM = 0.36  # the lid sits on the rim here
LID = "crate_lid"


def stripes(name, face, count, mat, z0=0.13, z1=0.23, depth=0.006):
    """Slanted hazard stripes on one side of the box. `face` = (centre, outward axis, along axis, half width)."""
    centre, out, along, half = face
    bm = bmesh.new()
    pitch = half * 2 / count
    width = pitch * 0.45
    slant = (z1 - z0) * 0.8
    for k in range(count):
        a = -half + k * pitch + pitch * 0.2
        quad = [(a, z0), (a + width, z0), (min(half, a + width + slant), z1), (min(half, a + slant), z1)]
        if quad[2][0] - quad[3][0] < 0.005:
            continue
        verts = [bm.verts.new(centre + along * u + out * depth + Vector((0, 0, z))) for u, z in quad]
        bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for face_ in bm.faces:
        if face_.normal.dot(out) < 0:
            face_.normal_flip()
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=False)


def build(name):
    m = lambda material: fl.material(material, name)  # noqa: E731
    brass, dark = m("metal_brass"), m("metal_dark")

    # Body: dark iron box, its top recessed under a brass rim; the amber interior fills the opening.
    fl.box("body", (W - 0.04, D - 0.04, RIM - 0.04), (0, 0, (RIM - 0.04) / 2), dark, bevel=0.01, segments=1)
    fl.box("interior", (W - 0.1, D - 0.1, 0.01), (0, 0, RIM - 0.045), m("glow_inner"), bevel=0)
    for i, (size, at) in enumerate((((W, 0.04, 0.05), (0, -(D - 0.04) / 2, RIM - 0.025)), ((W, 0.04, 0.05), (0, (D - 0.04) / 2, RIM - 0.025)),
                                    ((0.04, D, 0.05), (-(W - 0.04) / 2, 0, RIM - 0.025)), ((0.04, D, 0.05), ((W - 0.04) / 2, 0, RIM - 0.025)))):
        fl.box(f"rim{i}", size, at, brass, bevel=0.006, segments=1)
    fl.box("sole", (W, D, 0.04), (0, 0, 0.02), brass, bevel=0.008, segments=1)
    # Brass corner bindings.
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        fl.box(f"corner{i}", (0.06, 0.06, RIM - 0.02), (sx * (W / 2 - 0.028), sy * (D / 2 - 0.028), (RIM - 0.02) / 2), brass,
               bevel=0.008, segments=1)

    # Ivory hazard stripes on all four sides.
    band = m("glow_band")
    for i, (centre, out, along, half) in enumerate((
        (Vector((0, -(D - 0.04) / 2, 0)), Vector((0, -1, 0)), Vector((1, 0, 0)), W / 2 - 0.06),
        (Vector((0, (D - 0.04) / 2, 0)), Vector((0, 1, 0)), Vector((-1, 0, 0)), W / 2 - 0.06),
        (Vector((-(W - 0.04) / 2, 0, 0)), Vector((-1, 0, 0)), Vector((0, -1, 0)), D / 2 - 0.06),
        (Vector(((W - 0.04) / 2, 0, 0)), Vector((1, 0, 0)), Vector((0, 1, 0)), D / 2 - 0.06),
    )):
        stripes(f"stripes{i}", (centre, out, along, half), 6 if abs(out.y) else 4, band)

    # The lid: one brass piece (plate, raised ribs, a hasp at the front), hinged at the back edge.
    hinge = (0, D / 2, RIM)
    lid_parts = [
        fl.box("lid_plate", (W, D, 0.05), (0, 0, RIM + 0.025), brass, bevel=0.01, segments=1),
        fl.box("lid_top", (W - 0.1, D - 0.1, 0.04), (0, 0, RIM + 0.06), brass, bevel=0.01, segments=1),
        fl.box("hasp", (0.08, 0.02, 0.08), (0, -D / 2 - 0.005, RIM - 0.01), brass, bevel=0.006, segments=1),
    ]
    for k, x in enumerate((-0.2, 0.2)):
        lid_parts.append(fl.box(f"lid_rib{k}", (0.06, D + 0.01, 0.02), (x, 0, RIM + 0.085), brass, bevel=0.006, segments=1))
    for k, x in enumerate((-0.22, 0.22)):
        knuckle = fl.cylinder(f"hinge_knuckle{k}", 0.018, -0.05, 0.05, brass, sides=8)
        knuckle.location = (x, D / 2 + 0.005, RIM + 0.005)
        knuckle.rotation_euler = (0, math.pi / 2, 0)
        lid_parts.append(knuckle)
    lid = fl.merge(LID, lid_parts, pivot=hinge)
    fl.part(lid, "lid")
