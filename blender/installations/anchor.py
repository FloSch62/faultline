# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Anchor: a heavy brass anchor block strapped in bright brass, its two iron claws hooked
over the ends and into the table. A gibbet post rises from the back of the block; its short
arm holds a violet lantern out toward the camera, and a chain from the block's mooring eye
rises to the lantern's foot, pinning it: the lantern is the field it holds down.

World.ts draws the violet tether from the lantern to the band's field seal and the pips.
The lantern holder's origin is its hanging point (0.12, -0.14, 1.8): a sway turns about it."""

import math

import bmesh
from mathutils import Vector

from lib import faultline as fl

BLOCK = (0.9, 0.6, 0.5)  # x, y, z
LANTERN = Vector((0.12, -0.14, 1.8))  # hanging point under the arm tip
POST = (-0.24, 0.1)


def tapered_block(name, bottom, top, z0, z1, mat, bevel=0.02):
    """A box whose top face is smaller than its base (bottom/top = (x, y) sizes)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        sx, sy = top if v.co.z > 0 else bottom
        v.co = Vector((v.co.x * sx, v.co.y * sy, z0 if v.co.z < 0 else z1))
    return fl.finish(fl.from_bmesh(name, bm, mat), bevel, 2)


def build(kind):
    m = lambda name: fl.material(name, kind)  # noqa: E731
    brass, bright, iron = m("metal_brass"), m("metal_brass_bright"), m("metal_graphite")
    bx, by, bz = BLOCK

    # The block and its straps.
    tapered_block("block", (bx, by), (bx - 0.1, by - 0.08), 0.0, bz, brass, bevel=0.03)
    for i, x in enumerate((-0.24, 0.24)):
        # A strap hugging the tapered block: slightly larger than the block at its height.
        tapered_block(f"strap{i}", (0.09, by + 0.02), (0.09, by - 0.06), 0.0, bz + 0.012, bright, bevel=0.008).location.x = x
    for i, (x, z) in enumerate(((-0.34, 0.12), (-0.34, 0.36), (0.34, 0.12), (0.34, 0.36), (-0.1, 0.25), (0.1, 0.25))):
        y = -(by / 2 - (by - (by - 0.08)) / 2 * z / bz) - 0.006
        fl.sphere(f"rivet{i}", 0.022, (x, y, z), bright, segments=8, rings=4)
    fl.box("cap_plate", (bx - 0.26, by - 0.22, 0.04), (0, 0, bz + 0.02), iron, bevel=0.01, segments=1)

    # A luminous anchor sigil on the front face, leaning back with it.
    lean = math.atan(0.04 / bz)
    front = lambda z: -(by / 2 - 0.04 * z / bz) - 0.008  # noqa: E731
    glyph = m("role_luminous")
    fl.torus("sigil_ring", 0.03, 0.009, (0, front(0.39) - 0.002, 0.39), glyph, rotation=(math.pi / 2 - lean, 0, 0),
             major_segments=10, minor_segments=4)
    fl.box("sigil_shank", (0.02, 0.012, 0.22), (0, front(0.25), 0.25), glyph, rotation=(-lean, 0, 0), bevel=0)
    fl.box("sigil_stock", (0.12, 0.012, 0.02), (0, front(0.33), 0.33), glyph, rotation=(-lean, 0, 0), bevel=0)
    fl.torus("sigil_arms", 0.085, 0.01, (0, front(0.2), 0.2), glyph, rotation=(math.pi / 2 - lean, 0, 0),
             major_segments=16, minor_segments=4, arc=math.pi).rotation_euler = (math.pi / 2 - lean, math.pi, 0)

    # Two iron claws: talons that grip over each end of the block and bite into the table.
    for side in (-1, 1):
        for k, y in enumerate((-0.13, 0.13)):
            path = [(side * x, y, z) for x, z in ((0.28, bz + 0.03), (0.42, bz + 0.07), (0.5, bz - 0.02), (0.525, 0.3), (0.51, 0.14), (0.46, 0.03), (0.41, 0.0))]
            fl.sweep(f"claw{side}_{k}", path, 0.05, iron, sides=5, radii=[0.05, 0.055, 0.052, 0.045, 0.036, 0.02, 0.004])
        fl.box(f"knuckle{side}", (0.12, 0.36, 0.07), (side * 0.36, 0, bz + 0.03), iron, bevel=0.015, segments=1)

    # Mooring eye on the front edge of the block top, where the chain starts.
    eye_at = Vector((0, -(by - 0.08) / 2 + 0.07, bz + 0.05))
    fl.torus("eye", 0.045, 0.014, eye_at, bright, rotation=(0, math.pi / 2, 0), major_segments=12, minor_segments=5)

    # The gibbet: post, arm toward the camera, a brace and the hanging hook.
    px, py = POST
    top = LANTERN.z + 0.045
    fl.prism("post_foot", 4, 0.1, 0.08, bz + 0.04, bz + 0.12, bright, xy=(px, py), bevel=0.01, segments=1)
    fl.prism("post", 4, 0.045, 0.04, bz + 0.12, top + 0.015, bright, xy=(px, py), bevel=0.008, segments=1)
    reach = Vector((LANTERN.x - px, LANTERN.y - py, 0))
    tip = Vector((px, py, top)) + reach * (1 + 0.06 / reach.length)
    fl.sweep("arm", [(px, py, top), tuple(tip)], 0.03, bright, sides=4)
    fl.sweep("brace", [(px, py, top - 0.28), tuple(Vector((px, py, top - 0.02)) + reach * 0.5)], 0.015, bright, sides=4)
    fl.box("post_cap", (0.1, 0.1, 0.03), (px, py, top + 0.03), iron, bevel=0.008, segments=1)
    fl.torus("hook", 0.025, 0.008, (LANTERN.x, LANTERN.y, LANTERN.z + 0.02), bright, rotation=(math.pi / 2, 0, 0),
             major_segments=10, minor_segments=4)

    # The chain: brass links as line art, alternating planes, from the eye to the lantern's foot.
    foot = LANTERN + Vector((0, 0, -0.5))
    links, count = [], 12
    for k in range(count):
        centre = eye_at.lerp(foot, (k + 0.5) / count)
        direction = (foot - eye_at).normalized()
        across = Vector((1, 0, 0)) if k % 2 else direction.cross(Vector((1, 0, 0))).normalized()
        half = (foot - eye_at).length / count * 0.62
        oval = [centre + direction * math.cos(a) * half + across * math.sin(a) * 0.024 for a in (math.tau * i / 8 for i in range(8))]
        links += fl.loop(oval)
    fl.lines("chain", links, m("wire_chain"))

    # The lantern: a hexagonal brass cage with violet glass and a luminous core, hung from its hook.
    holder = fl.empty("lantern", tuple(LANTERN))
    fl.hook(holder, "floater")
    lz0, lz1 = LANTERN.z - 0.46, LANTERN.z - 0.1
    x, y = LANTERN.x, LANTERN.y
    parts = [
        fl.prism("lantern_base", 6, 0.12, 0.14, lz0 - 0.04, lz0, bright, xy=(x, y), bevel=0.008, segments=1),
        fl.prism("lantern_roof", 6, 0.16, 0.03, lz1, lz1 + 0.08, bright, xy=(x, y), bevel=0.006, segments=1),
        fl.cylinder("lantern_ring", 0.02, lz1 + 0.08, LANTERN.z, bright, xy=(x, y), sides=6),
        fl.prism("lantern_glass", 6, 0.12, 0.12, lz0, lz1, m("role_glow_faint"), xy=(x, y), bevel=0),
        fl.octahedron("lantern_core", 0.075, (x, y, (lz0 + lz1) / 2), m("role_luminous"), stretch=1.9),
        fl.cylinder("lantern_foot", 0.03, lz0 - 0.08, lz0 - 0.04, bright, xy=(x, y), sides=8),
    ]
    for i, (cx, cy, _) in enumerate(fl.polar(6, 0.125, start=-math.pi / 2 + math.pi / 6)):
        parts.append(fl.box(f"lantern_bar{i}", (0.022, 0.022, lz1 - lz0), (x + cx, y + cy, (lz0 + lz1) / 2), bright, bevel=0))
    fl.merge_onto(holder, parts)
