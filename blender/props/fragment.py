# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Message fragment: a brass message capsule lying on the table, cracked open along a jagged
seam that glows from inside. A curl of pale amber ribbon (the undelivered message) rises
0.8 above it, twisting as it climbs; the ribbon is a floater that turns about its root.

World.ts drops it from the hostile's port to the table edge and opens the dialog on click."""

import math

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

R = 0.2  # capsule radius
HALF = 0.12  # half-length of the straight section
SEAM = 0.03
SEGMENTS = 14
ROOT = Vector((0.02, -0.02, 2 * R - 0.02))  # where the ribbon leaves the crack


def profile():
    """(x, r) along the capsule axis from the left pole to the right pole."""
    left = [(-HALF - R * math.cos(a), R * math.sin(a)) for a in (math.pi / 2 * k / 4 for k in range(5))]
    return left + [(-x, r) for x, r in reversed(left)]


def seam_offset(i):
    return SEAM + (0.024 if i % 2 else -0.018) * (1 if i % 4 < 2 else 0.6)


def half(name, side, shell_mat, glow_mat):
    """One half of the capsule, open at the jagged seam, its seam face glowing."""
    bm = bmesh.new()
    angles = [math.tau * i / SEGMENTS for i in range(SEGMENTS)]
    stations = [(x, r) for x, r in profile() if (x < SEAM - 0.03 if side < 0 else x > SEAM + 0.03)]
    if side > 0:
        stations.reverse()  # always walk from the pole toward the seam
    rings = []
    pole = None
    for x, r in stations:
        if r < 1e-6:
            pole = bm.verts.new((x, 0, R))
            continue
        rings.append([bm.verts.new((x, math.cos(a) * r, R + math.sin(a) * r)) for a in angles])
    rings.append([bm.verts.new((seam_offset(i), math.cos(a) * R, R + math.sin(a) * R)) for i, a in enumerate(angles)])
    for i in range(SEGMENTS):
        j = (i + 1) % SEGMENTS
        bm.faces.new((pole, rings[0][i], rings[0][j]))
    for ring_a, ring_b in zip(rings, rings[1:]):
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            bm.faces.new((ring_a[i], ring_b[i], ring_b[j], ring_a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    shell = fl.finish(fl.from_bmesh(f"{name}_shell", bm, shell_mat), 0, smooth=True, angle=50, weighted=False)
    # The seam face: the same jagged ring, a hair inside, glowing.
    bm = bmesh.new()
    inset = [bm.verts.new((seam_offset(i) - side * 0.004, math.cos(a) * (R - 0.01), R + math.sin(a) * (R - 0.01)))
             for i, a in enumerate(angles)]
    bm.faces.new(inset)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for face in bm.faces:
        if face.normal.x * side > 0:
            face.normal_flip()
    seam = fl.finish(fl.from_bmesh(f"{name}_seam", bm, glow_mat), 0, smooth=False)
    return [shell, seam]


def build(name):
    m = lambda material: fl.material(material, name)  # noqa: E731
    brass, bright, glow = m("metal_brass"), m("metal_brass_bright"), m("glow_ribbon")

    left = half("left", -1, brass, glow)
    right = half("right", 1, brass, glow)
    # Bands near each end.
    for side in (-1, 1):
        band = fl.cylinder(f"band{side}", R + 0.008, -0.022, 0.022, bright, sides=SEGMENTS)
        band.location = (side * (HALF - 0.005), 0, R)
        band.rotation_euler = (0, math.pi / 2, 0)
        (left if side < 0 else right).append(band)
        cap = fl.cylinder(f"endcap{side}", 0.06, -0.02, 0.02, bright, sides=10)
        cap.location = (side * (HALF + R - 0.01), 0, R)
        cap.rotation_euler = (0, math.pi / 2, 0)
        (left if side < 0 else right).append(cap)
    # The right half lies turned away, so the crack opens a lit wedge toward the camera.
    hinge = Vector((SEAM, R * 0.9, 0))
    fl.transform(right, Matrix.Translation(hinge + Vector((0.035, 0, 0))) @ Matrix.Rotation(math.radians(18), 4, "Z") @ Matrix.Translation(-hinge))

    # The ribbon: a widening, twisting curl rising 0.8 above the capsule.
    points, widths = [], []
    steps = 26
    for k in range(steps + 1):
        t = k / steps
        a = -math.pi / 2 + t * math.tau * 1.15
        r = 0.02 + 0.2 * t ** 0.8
        points.append(ROOT + Vector((math.cos(a) * r, math.sin(a) * r, 0.78 * t)))
        widths.append(0.075 * (1 - t) + 0.035)
    ribbon = fl.strip("ribbon", points, widths, glow, twist=math.pi * 0.9)
    ribbon.data.transform(Matrix.Translation(-ROOT))
    ribbon.location = ROOT
    fl.hook(ribbon, "floater")
