"""The board kit: the battle table's frame, shared by the stage boards and the guardians' boards.

Industrial relay hardware first (machined steel, panel seams, cable troughs, container-like
modules on the apron, status lights, the ring gate round the containerlab mark), brass and
ivory as the accents that tie it to the devices. Ornament stays restrained.

Space (Blender, Z-up, facing -Y = the camera side = three.js +Z): the origin is the centre of the
tabletop; the table surface is z = 0 (World.ts places it at the board group's y 0.6, world 0.18).
The tabletop itself is not modelled: World.ts lays the shared textures of surface.py on a plane
that fills the well (TABLE_X x TABLE_Y). Everything else is here:

    well        x +-8.25, y +-5.35, ringed by a brass chamfer up to the rails (z 0.1)
    rails       near: accent lights, then the fascia; far: a cable trough; sides: a trough and consoles
    fascia      the near rail's slope toward the camera (y -5.82 .. -6.3): modules either side of the
                medallion, the part of the front the camera sees above the hand; the vertical
                apron below it stays plain
    corners     four machined blocks at (+-8.85, +-5.85) up to x 9.4, y 6.4; the far ones stay low
    bands       brass dividers at y +-1.3 across the table and the frame; NORTH / CENTER / SOUTH
                stencilled into the deck at each band's west end, a lamp strip in both side rails
    crest       the far rail's mount at (0, 5.95) and its emblem (slot "crest"); the corner
                beacons are slot "finial". A leader's crest model (crests.py) replaces both.

Runtime-controlled materials (see blender/README.md): band_<zone>_label (the deck stencil, lit
paint whose emission World.ts drives), band_<zone>_lamp (the band's rail lamps, unlit), accent_glow* and accent_luminous (the board's accent colour: the leader's
colour, or the stage's own).
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from lib import faultline as fl

from . import mark

TABLE_X, TABLE_Y = 8.25, 5.35
LIP = 0.1
RAIL_Z = 0.1
OUTER_X, OUTER_Y = 9.3, 6.3
BOTTOM = -1.0
CORNER_X, CORNER_Y, CORNER_HALF = 8.85, 5.85, 0.55
# The corner blocks' tops; beacons (or a leader's finials) stand on them. The far pair stays low:
# the hostile portraits are drawn above the far rail.
NEAR_TOP, FAR_TOP = 0.3, 0.16
FINIAL_HEIGHT = 0.3
BAND_Y = {"north": 3.25, "center": 0.0, "south": -3.25}
BAND_EDGES = {"north": 1.3, "center": -1.3, "south": -5.2}  # each band's near (south) edge
DIVIDER_Y = (1.3, -1.3)
CREST_Y = 5.95
# The near rail: a flat strip, then the fascia sloping toward the camera (the frame's face above the hand).
FASCIA_TOP_Y, FASCIA_BOTTOM = 5.82, -0.3
MEDALLION_RADIUS = 0.52
# The band names are stencilled into the deck from MARK_X, LETTER high, in each band's south-west corner.
MARK_X, LETTER = -7.72, 0.42
# The resting game camera in board space (three.js (0, 16.09, 21.17) with the table at world y 0.18).
CAMERA = Vector((0.0, -21.17, 15.91))

# Per-stage palette (sRGB hex) and apron module style. `accent` previews the default accent
# (World.ts uses the stage's accent unless a leader brings its own colour).
STYLES = {
    "copper": {
        "steel": 0x2A2C2C, "panel": 0x3E3F3C, "trim": 0x8A6841, "bright": 0xC49A5C, "ivory": 0xD6C8A6,
        "enamel": 0x14212A, "container": 0x5E3526, "lamp": 0xFFC27A, "strip": 0xFFB45C, "accent": 0x62FCE3,
        "modules": "container",
    },
    "glass": {
        "steel": 0x23252D, "panel": 0x383B47, "trim": 0x8D96A8, "bright": 0xCCD3E0, "ivory": 0xD9D4E4,
        "enamel": 0x181628, "container": 0x2E2B40, "lamp": 0xE2D2FF, "strip": 0xC8B4FF, "accent": 0xB69CFF,
        "glass": 0xA98BFF, "modules": "optical",
    },
    "blackout": {
        "steel": 0x1D1B1A, "panel": 0x2E2A28, "trim": 0x6B4430, "bright": 0xA3653F, "ivory": 0xCBB9A0,
        "enamel": 0x1E0D0C, "container": 0x3A2620, "lamp": 0xFF7A52, "strip": 0xFF6A45, "accent": 0xFF6A4A,
        "ember": 0xFF5A38, "modules": "hazard",
    },
    # The guardians' own boards (regent.py, cantor.py, core.py register their modules).
    "regent": {
        "steel": 0x2B2622, "panel": 0x453A30, "trim": 0xA0683A, "bright": 0xD29A60, "ivory": 0xD9C9A4,
        "enamel": 0x13231C, "container": 0x5A3A26, "lamp": 0xB8F0C8, "strip": 0x9FE4B4, "accent": 0x90D2A5,
        "modules": "gate",
    },
    "cantor": {
        "steel": 0x24232E, "panel": 0x3A3848, "trim": 0x9A9CB2, "bright": 0xD6D8EA, "ivory": 0xE0D8EC,
        "enamel": 0x1A1430, "container": 0x2E2842, "lamp": 0xE6D4FF, "strip": 0xD2B8FF, "accent": 0xC6A0EE,
        "glass": 0xB48CFF, "modules": "resonator",
    },
    "core": {
        "steel": 0x1A1717, "panel": 0x2C2524, "trim": 0x6E3E2E, "bright": 0xA95C3E, "ivory": 0xC9B6A0,
        "enamel": 0x220A0B, "container": 0x3A2020, "lamp": 0xFF8A7A, "strip": 0xFF6F6A, "accent": 0xFF777E,
        "ember": 0xFF4F4A, "modules": "reactor",
    },
}
ZONE_COLORS = {"north": 0x82AABF, "center": 0xC4AC7F, "south": 0x8AB7A4}  # previews only (World.ts drives them)


# ---------------------------------------------------------------------------
# Materials


def palette(style, accent=None):
    s = STYLES[style]
    accent = s["accent"] if accent is None else accent
    lit = fl.lit
    p = {
        "steel": lit("board_steel", s["steel"], 0.7, 0.5),
        "panel": lit("board_panel", s["panel"], 0.62, 0.55),
        "trim": lit("board_trim", s["trim"], 0.8, 0.38),
        "bright": lit("board_trim_bright", s["bright"], 0.88, 0.28),
        "ivory": lit("board_ivory", s["ivory"], 0.1, 0.62),
        "rubber": lit("board_rubber", 0x141618, 0.0, 0.78),
        "enamel": lit("board_enamel", s["enamel"], 0.3, 0.25),
        "container": lit("board_container", s["container"], 0.45, 0.62),
        "lamp": fl.unlit("glow_lamp", s["lamp"]),
        "strip": fl.unlit("glow_strip", s["strip"], 0.9),
        "mark": fl.unlit("glow_mark", 0x3CBEEF),
        "ring": fl.unlit("glow_ring", 0xFFC98A),
        "accent": fl.unlit("accent_glow", accent),
        "accent_soft": fl.unlit("accent_glow_soft", accent, 0.55),
        "accent_faint": fl.unlit("accent_glow_faint", accent, 0.2),
        "accent_lum": lit("accent_luminous", _scale(accent, 0.4), 0.64, 0.53, accent, 0.5),
    }
    if "glass" in s:
        p["glass"] = fl.unlit("glow_glass", s["glass"], 0.7)
    if "ember" in s:
        p["ember"] = fl.unlit("glow_ember", s["ember"])
    for zone, color in ZONE_COLORS.items():
        p[f"{zone}_label"] = lit(f"band_{zone}_label", _scale(s["ivory"], 0.78), 0.25, 0.58, color, 0.0)
        p[f"{zone}_lamp"] = fl.unlit(f"band_{zone}_lamp", color, 0.55)
    return p


def _scale(color, k):
    r, g, b = (color >> 16) & 255, (color >> 8) & 255, color & 255
    return (int(r * k) << 16) | (int(g * k) << 8) | int(b * k)


# ---------------------------------------------------------------------------
# Geometry helpers


def slab(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.012, segments=1):
    return fl.box(name, (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat,
                  bevel=bevel, segments=segments)


def rod(name, a, b, radius, mat, sides=8):
    return fl.sweep(name, [a, b], radius, mat, sides=sides)


def extrude(name, outline, axis, a0, a1, mat, bevel=0.0, smooth=False):
    """A cross-section polygon (in the two other axes, counter-clockwise) extruded along `axis`
    ("x", "y" or "z") from a0 to a1."""
    bm = bmesh.new()
    index = "xyz".index(axis)

    def point(p, a):
        v = [0.0, 0.0, 0.0]
        others = [i for i in range(3) if i != index]
        v[others[0]], v[others[1]], v[index] = p[0], p[1], a
        return bm.verts.new(v)

    ring0 = [point(p, a0) for p in outline]
    ring1 = [point(p, a1) for p in outline]
    count = len(outline)
    for k in range(count):
        bm.faces.new((ring0[k], ring0[(k + 1) % count], ring1[(k + 1) % count], ring1[k]))
    bm.faces.new(list(reversed(ring0)))
    bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), bevel, 1, smooth=smooth)


def tapered(name, bottom, top, z0, z1, mat, bevel=0.02):
    """A box whose top (x, y) differs from its bottom."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        sx, sy = top if v.co.z > 0 else bottom
        v.co = Vector((v.co.x * sx, v.co.y * sy, z1 if v.co.z > 0 else z0))
    return fl.finish(fl.from_bmesh(name, bm, mat), bevel, 1)


def curve_shape(name, polygons, depth, mat, matrix):
    """Filled flat shapes (even-odd, holes allowed) extruded `depth` along local z, placed by `matrix`."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = depth / 2
    for polygon in polygons:
        spline = curve.splines.new("POLY")
        spline.points.add(len(polygon) - 1)
        for point, (x, y) in zip(spline.points, polygon):
            point.co = (x, y, 0.0, 1.0)
        spline.use_cyclic_u = True
    curve.materials.append(mat)
    holder = bpy.data.objects.new(name + "_curve", curve)
    fl.device_collection().objects.link(holder)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
    bpy.data.objects.remove(holder, do_unlink=True)
    bpy.data.curves.remove(curve)
    mesh.transform(Matrix.Translation((0, 0, depth / 2)))
    obj = bpy.data.objects.new(name, mesh)
    fl.device_collection().objects.link(obj)
    obj.matrix_world = matrix
    return fl.finish(obj, 0, smooth=False)


class Face:
    """A frame on a face of the table: `u` runs across it, `w` up it, `n` out of it. Parts built on it
    are boxes and flat shapes standing out of the face along n."""

    def __init__(self, origin, u, w, n):
        self.origin, self.u, self.w, self.n = Vector(origin), Vector(u).normalized(), Vector(w).normalized(), Vector(n).normalized()

    def at(self, u, w, h=0.0):
        return self.origin + self.u * u + self.w * w + self.n * h

    def rotation(self, angle=0.0):
        # Box x -> u, box -y -> n (the family faces -Y), box z -> w; `angle` turns it in the face.
        basis = Matrix((self.u, -self.n, self.w)).transposed().to_4x4()
        return basis @ Matrix.Rotation(-angle, 4, "Y")

    def box(self, name, u, w, size_u, size_w, depth, mat, h=0.0, angle=0.0, bevel=0.006):
        obj = fl.box(name, (size_u, depth, size_w), (0, 0, 0), mat, bevel=bevel, segments=1)
        obj.matrix_world = Matrix.Translation(self.at(u, w, h + depth / 2)) @ self.rotation(angle)
        return obj

    def bar(self, name, a, b, thickness, depth, mat, h=0.0, bevel=0.0):
        """A flat bar from face point a to b (a stroke of a stencil letter, a strut)."""
        (au, aw), (bu, bw) = a, b
        length = math.hypot(bu - au, bw - aw)
        angle = math.atan2(bw - aw, bu - au)
        return self.box(name, (au + bu) / 2, (aw + bw) / 2, length + thickness, thickness, depth, mat, h, angle, bevel)

    def shape(self, name, polygons, depth, mat, h=0.0):
        matrix = Matrix.Translation(self.at(0, 0, h)) @ Matrix((self.u, self.w, self.n)).transposed().to_4x4()
        return curve_shape(name, polygons, depth, mat, matrix)

    def disc(self, name, u, w, radius, depth, mat, h=0.0, sides=24, bevel=0.0):
        obj = fl.prism(name, sides, radius, radius, 0, depth, mat, bevel=bevel, smooth=sides >= 12)
        basis = Matrix((self.u, self.w, self.n)).transposed().to_4x4()
        obj.matrix_world = Matrix.Translation(self.at(u, w, h + depth / 2)) @ basis
        return obj

    def pipe(self, name, u, w0, w1, radius, mat, h=0.0, sides=8, r_top=None):
        """A cylinder lying on the face along w, from w0 to w1."""
        obj = fl.cylinder(name, radius, 0, w1 - w0, mat, sides=sides, r_top=r_top)
        obj.matrix_world = Matrix.Translation(self.at(u, (w0 + w1) / 2, h + radius)) @ self.rotation()
        return obj

    def ring(self, name, u, w, radius, minor, mat, h=0.0, gaps=0, gap_fraction=0.18, segments=48):
        obj = fl.torus(name, radius, minor, (0, 0, 0), mat, major_segments=segments, minor_segments=8, gaps=gaps,
                       gap_fraction=gap_fraction)
        basis = Matrix((self.u, self.w, self.n)).transposed().to_4x4()
        obj.matrix_world = Matrix.Translation(self.at(u, w, h)) @ basis
        return obj


# ---------------------------------------------------------------------------
# Stencil letters (the band marks): condensed chamfered block strokes on a 0.5 x 1 cell, with stencil gaps.

_C, _G, _W = 0.15, 0.075, 0.5
GLYPHS = {
    "N": [[(0, 0), (0, 1)], [(_W, 0), (_W, 1)], [(0.02, 0.96), (_W - 0.02, 0.04)]],
    "O": [[(_W / 2 - _G, 1), (_C, 1), (0, 1 - _C), (0, _C), (_C, 0), (_W / 2 - _G, 0)],
          [(_W / 2 + _G, 1), (_W - _C, 1), (_W, 1 - _C), (_W, _C), (_W - _C, 0), (_W / 2 + _G, 0)]],
    "R": [[(0, 0), (0, 1)], [(_G + 0.03, 1), (_W - _C, 1), (_W, 1 - _C), (_W, 0.5 + _C * 0.6), (_W - _C * 0.6, 0.47), (_G + 0.03, 0.47)],
          [(_W * 0.42, 0.47), (_W, 0)]],
    "T": [[(0, 1), (_W, 1)], [(_W / 2, 0), (_W / 2, 1 - 2 * _G)]],
    "H": [[(0, 0), (0, 1)], [(_W, 0), (_W, 1)], [(_G, 0.5), (_W - _G, 0.5)]],
    "C": [[(_W, 1), (_C, 1), (0, 1 - _C), (0, _C), (_C, 0), (_W, 0)]],
    "E": [[(0, 0), (0, 1)], [(_G + 0.04, 1), (_W, 1)], [(_G + 0.04, 0.5), (_W * 0.86, 0.5)], [(_G + 0.04, 0), (_W, 0)]],
    "S": [[(_W, 1), (_C, 1), (0, 1 - _C), (0, 0.5 + _C * 0.6), (_C * 0.6, 0.5), (_W - _C * 0.6, 0.5), (_W, 0.5 - _C * 0.6), (_W, _C),
           (_W - _C, 0), (0, 0)]],
    "U": [[(0, 1), (0, _C), (_C, 0), (_W - _C, 0), (_W, _C), (_W, 1)]],
}
SPACING = 0.14
WEIGHT = 0.17


def text_width(text, height):
    return (len(text) * (_W + SPACING) - SPACING) * height


def stencil(face, name, text, height, mat, u=0.0, w=0.0, depth=0.012, h=0.0):
    """Raised stencil letters centred at face point (u, w); returns the stroke objects."""
    thickness = WEIGHT * height
    left = u - text_width(text, height) / 2
    parts = []
    for i, letter in enumerate(text):
        x0 = left + i * (_W + SPACING) * height
        for k, stroke in enumerate(GLYPHS[letter]):
            points = [(x0 + px * height, w - height / 2 + py * height) for px, py in stroke]
            for j, (a, b) in enumerate(zip(points, points[1:])):
                parts.append(face.bar(f"{name}_{i}_{k}_{j}", a, b, thickness, depth, mat, h))
    return parts


# ---------------------------------------------------------------------------
# The frame


def body(p, style):
    """The body under the rails and its foot; the underbody tapers away below."""
    # The body steps back under the near rail's fascia, which closes the front above FASCIA_BOTTOM.
    slab("body", -OUTER_X, OUTER_X, -OUTER_Y, OUTER_Y, BOTTOM + 0.12, FASCIA_BOTTOM - 0.06, p["steel"], bevel=0.02)
    slab("body_top", -OUTER_X, OUTER_X, -FASCIA_TOP_Y, OUTER_Y, FASCIA_BOTTOM - 0.07, -0.02, p["steel"], bevel=0.01)
    slab("foot", -OUTER_X - 0.02, OUTER_X + 0.02, -OUTER_Y - 0.05, OUTER_Y + 0.05, BOTTOM, BOTTOM + 0.12, p["panel"], bevel=0.02)
    tapered("underbody", (OUTER_X * 2 - 2.2, OUTER_Y * 2 - 2.2), (OUTER_X * 2 - 0.4, OUTER_Y * 2 - 0.4), BOTTOM - 0.6, BOTTOM,
            p["steel"], bevel=0.03)


def lip(p):
    """The brass chamfer from the tabletop's edge up to the rails: the play area's golden frame."""
    bm = bmesh.new()
    inner = [bm.verts.new((sx * TABLE_X, sy * TABLE_Y, 0.0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    outer = [bm.verts.new((sx * (TABLE_X + LIP), sy * (TABLE_Y + LIP), RAIL_Z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    skirt = [bm.verts.new((sx * TABLE_X, sy * TABLE_Y, -0.06)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for k in range(4):
        j = (k + 1) % 4
        bm.faces.new((inner[k], inner[j], outer[j], outer[k]))
        bm.faces.new((skirt[k], skirt[j], inner[j], inner[k]))
    bm.normal_update()
    for face in bm.faces:
        # Every face looks in toward the table (the chamfer also up).
        centre = face.calc_center_median()
        if face.normal.x * centre.x + face.normal.y * centre.y > 0:
            face.normal_flip()
    fl.finish(fl.from_bmesh("lip", bm, p["bright"]), 0, smooth=False)


def _trough(p, name, start, end, across, cables=3, clamps=2.8, seed=0):
    """A cable trough from `start` to `end` (x, y on the rail), `across` = its width's unit direction."""
    start, end, across = Vector(start), Vector(end), Vector(across)
    along = (end - start).normalized()
    length = (end - start).length
    width = 0.1 + 0.1 * cables
    mid = (start + end) / 2
    angle = math.atan2(along.y, along.x)
    fl.box(f"{name}_floor", (length, width, 0.04), (mid.x, mid.y, 0.0), p["steel"], rotation=(0, 0, angle), bevel=0)
    for side in (-1, 1):
        edge = mid + across * side * (width / 2 + 0.012)
        fl.box(f"{name}_edge{side}", (length, 0.026, 0.03), (edge.x, edge.y, RAIL_Z + 0.004), p["trim"], rotation=(0, 0, angle),
               bevel=0.006)
    radii = (0.048, 0.04, 0.045)[:cables]
    mats = (p["rubber"], p["ivory"], p["rubber"])[:cables]
    for k, (radius, mat) in enumerate(zip(radii, mats)):
        offset = (k - (cables - 1) / 2) * (width / (cables + 0.4))
        points = []
        steps = max(2, int(length / 1.1))
        for i in range(steps + 1):
            t = i / steps
            wobble = 0.016 * math.sin(t * 9.0 + k * 2.1 + seed) if 0 < i < steps else 0.0
            at = start + along * (length * t) + across * (offset + wobble)
            points.append((at.x, at.y, 0.02 + radius))
        fl.sweep(f"{name}_cable{k}", points, radius, mat, sides=6, caps=False)
    count = max(1, round(length / clamps))
    for i in range(count):
        at = start + along * (length * (i + 0.5) / count)
        fl.box(f"{name}_clamp{i}", (0.11, width + 0.1, 0.035), (at.x, at.y, RAIL_Z + 0.014), p["bright"], rotation=(0, 0, angle),
               bevel=0.01)


def rails(p, style):
    """The rail tops: the near one a flat strip of accent lights before the fascia (apron()); the far
    one a cable trough behind the crest mount; the sides a two-cable trough beside the consoles."""
    edge_x, edge_y = TABLE_X + LIP, TABLE_Y + LIP
    inner_x = CORNER_X - CORNER_HALF
    # Near: bolts and a row of accent lights (the leader's colour runs round the board here).
    slab("near_strip", -inner_x, inner_x, -edge_y, -FASCIA_TOP_Y, -0.02, RAIL_Z, p["panel"])
    for i in range(-8, 9):
        fl.sphere(f"near_bolt{i}", 0.02, (i * 0.98, -5.53, RAIL_Z + 0.004), p["bright"], segments=6, rings=3)
        if i < 8:
            fl.box(f"near_light{i}", (0.42, 0.07, 0.014), ((i + 0.5) * 0.98, -5.66, RAIL_Z + 0.005), p["accent"], bevel=0)
    # Far: inner strip, trough, outer strip with accent lights.
    slab("far_inner", -inner_x, inner_x, edge_y, 5.6, -0.02, RAIL_Z, p["panel"])
    slab("far_outer", -inner_x, inner_x, 6.04, OUTER_Y, -0.02, RAIL_Z, p["panel"])
    _trough(p, "far_trough", (-inner_x, 5.82), (inner_x, 5.82), (0, 1), seed=1)
    for i in range(-8, 9):
        fl.sphere(f"far_bolt{i}", 0.02, (i * 0.98, 5.525, RAIL_Z + 0.004), p["bright"], segments=6, rings=3)
        if i < 8 and abs(i + 0.5) > 1.2:
            fl.box(f"far_light{i}", (0.42, 0.07, 0.014), ((i + 0.5) * 0.98, 6.17, RAIL_Z + 0.005), p["accent"], bevel=0)
    span = CORNER_Y - CORNER_HALF
    for s, label in ((-1, "left"), (1, "right")):
        slab(f"{label}_rail", s * edge_x, s * 8.87, -span, span, -0.02, RAIL_Z, p["panel"])
        slab(f"{label}_rail_outer", s * 9.17, s * OUTER_X, -span, span, -0.02, RAIL_Z, p["panel"])
        _trough(p, f"{label}_trough", (s * 9.02, -span), (s * 9.02, span), (s, 0), cables=2, clamps=3.6, seed=2 + s)
        for i in range(-5, 6):
            fl.sphere(f"{label}_bolt{i}", 0.02, (s * (edge_x + 0.1), i * 0.96, RAIL_Z + 0.004), p["bright"], segments=6, rings=3)


def dividers(p):
    """The band edges: brass strips inlaid across the table, carried over the rails as brackets."""
    for k, y in enumerate(DIVIDER_Y):
        slab(f"divider{k}", -TABLE_X, TABLE_X, y - 0.024, y + 0.024, -0.004, 0.012, p["bright"], bevel=0.004)
        for i in range(-8, 9, 2):
            fl.sphere(f"divider{k}_stud{i}", 0.022, (i, y, 0.012), p["trim"], segments=6, rings=3)
        for s in (-1, 1):
            slab(f"divider{k}_bracket{s}", s * (TABLE_X - 0.05), s * OUTER_X, y - 0.06, y + 0.06, RAIL_Z - 0.01, RAIL_Z + 0.035,
                 p["bright"], bevel=0.008)


def _module_frame(face, name, u, w, width, height, p, fill, detail=True, t=0.06):
    """A recessed module: frame bars, a set-back panel and (in view of the camera) corner bolts."""
    bevel = 0.006 if detail else 0
    face.box(f"{name}_top", u, w + height / 2 - t / 2, width, t, 0.05, p["steel"], bevel=bevel)
    face.box(f"{name}_bottom", u, w - height / 2 + t / 2, width, t, 0.05, p["steel"], bevel=bevel)
    for side in (-1, 1):
        face.box(f"{name}_side{side}", u + side * (width / 2 - t / 2), w, t, height - 2 * t, 0.05, p["steel"], bevel=bevel)
    face.box(f"{name}_panel", u, w, width - 2 * t, height - 2 * t, 0.015, fill, bevel=0)
    if not detail:
        return
    for su in (-1, 1):
        for sw in (-1, 1):
            fl.sphere(f"{name}_bolt{su}{sw}", 0.016, face.at(u + su * (width / 2 - t / 2), w + sw * (height / 2 - t / 2), 0.05),
                      p["bright"], segments=6, rings=3)


def _container(face, name, u, w, width, height, p, index):
    """Copper Reach: a container end, corrugated, an ivory stencil plate and two status lamps."""
    fill = p["container"] if index % 3 == 1 else p["panel"]
    _module_frame(face, name, u, w, width, height, p, fill)
    ribs = max(5, round(width / 0.16))
    inner = width - 0.18
    for k in range(ribs):
        face.box(f"{name}_rib{k}", u - inner / 2 + inner * (k + 0.5) / ribs, w - 0.02, 0.055, height - 0.2, 0.03, fill, h=0.015,
                 bevel=0.008)
    face.box(f"{name}_plate", u - width / 2 + 0.22, w + height / 2 - 0.12, 0.22, 0.07, 0.01, p["ivory"], h=0.045, bevel=0.003)
    face.box(f"{name}_led0", u + width / 2 - 0.2, w + height / 2 - 0.12, 0.05, 0.035, 0.012, p["lamp"], h=0.045, bevel=0)
    face.box(f"{name}_led1", u + width / 2 - 0.13, w + height / 2 - 0.12, 0.05, 0.035, 0.012, p["accent"], h=0.045, bevel=0)


def _optical(face, name, u, w, width, height, p, index):
    """Glass Cathedral: three slim lancet lenses of violet glass behind silvered mullions."""
    _module_frame(face, name, u, w, width, height, p, p["enamel"])
    lens_w, lens_h = 0.15, height - 0.2
    count = max(3, round(width / 0.3))
    for k in range(count):
        cu = u + (k - (count - 1) / 2) * (width - 0.3) / (count - 1)
        bottom = w - lens_h / 2
        spring = bottom + lens_h - lens_w * 0.9
        lancet = [(cu - lens_w / 2, bottom), (cu + lens_w / 2, bottom), (cu + lens_w / 2, spring),
                  (cu + lens_w * 0.3, spring + lens_w * 0.55), (cu, spring + lens_w * 0.9),
                  (cu - lens_w * 0.3, spring + lens_w * 0.55), (cu - lens_w / 2, spring)]
        face.shape(f"{name}_lens{k}", [lancet], 0.01, p["glass"], h=0.016)
        face.box(f"{name}_mullion{k}", cu, w - 0.02, 0.02, lens_h * 0.8, 0.02, p["bright"], h=0.024, bevel=0)
    for k in (-1, 1):
        face.box(f"{name}_led{k}", u + k * (width / 2 - 0.13), w + height / 2 - 0.12, 0.05, 0.035, 0.012, p["lamp"], h=0.045, bevel=0)


def _hazard(face, name, u, w, width, height, p, index):
    """Blackout Heart: a containment hatch with hazard chevrons and an ember vent."""
    _module_frame(face, name, u, w, width, height, p, p["panel"])
    stripes = max(6, round(width / 0.2))
    band_h = 0.12
    bw = w + height / 2 - 0.06 - band_h / 2 - 0.02
    inner = width - 0.18
    for k in range(stripes):
        cu = u - inner / 2 + inner * (k + 0.5) / stripes
        poly = [(cu - 0.055, bw - band_h / 2), (cu + 0.015, bw - band_h / 2), (cu + 0.055, bw + band_h / 2), (cu - 0.015, bw + band_h / 2)]
        face.shape(f"{name}_stripe{k}", [poly], 0.008, p["ivory"], h=0.015)
    for k in range(2):
        vw = w - 0.07 - k * 0.1
        face.box(f"{name}_vent{k}", u, vw, width - 0.34, 0.03, 0.01, p["ember"], h=0.015, bevel=0)
        face.box(f"{name}_louvre{k}", u, vw + 0.03, width - 0.28, 0.026, 0.028, p["steel"], h=0.015, bevel=0.004)


MODULES = {"container": _container, "optical": _optical, "hazard": _hazard}


def fascia_face():
    """The near rail's sloped front: from its top edge (y FASCIA_TOP_Y, z RAIL_Z) down toward the
    camera to (y -OUTER_Y, z FASCIA_BOTTOM), seen almost face-on just above the hand."""
    bottom = Vector((0, -OUTER_Y, FASCIA_BOTTOM))
    top = Vector((0, -FASCIA_TOP_Y, RAIL_Z))
    w = (top - bottom).normalized()
    return Face(bottom, (1, 0, 0), w, Vector((1, 0, 0)).cross(w)), (top - bottom).length


def apron(p, style, modules=None, per_side=4, gap=0.5):
    """The front: the sloped fascia with modules either side of the medallion (the part the camera
    sees above the hand), and below it the vertical apron with plain plates and conduits."""
    inner_x = CORNER_X - CORNER_HALF
    extrude("fascia", [(-FASCIA_TOP_Y, RAIL_Z), (-OUTER_Y, FASCIA_BOTTOM), (-OUTER_Y, FASCIA_BOTTOM - 0.06), (-FASCIA_TOP_Y, FASCIA_BOTTOM - 0.06)],
            "x", -inner_x, inner_x, p["steel"], bevel=0.012)
    rod("fascia_edge", (-inner_x, -FASCIA_TOP_Y, RAIL_Z), (inner_x, -FASCIA_TOP_Y, RAIL_Z), 0.03, p["bright"], sides=8)
    for s in (-1, 1):  # the medallion stands between the halves
        rod(f"fascia_foot{s}", (s * (MEDALLION_RADIUS + 0.08), -OUTER_Y - 0.01, FASCIA_BOTTOM - 0.01),
            (s * inner_x, -OUTER_Y - 0.01, FASCIA_BOTTOM - 0.01), 0.035, p["trim"], sides=8)
    face, length = fascia_face()
    build = modules or MODULES[STYLES[style]["modules"]]
    span = inner_x - 0.02 - gap - MEDALLION_RADIUS
    pitch = span / per_side
    width, height = pitch - 0.08, length - 0.14
    for s in (-1, 1):
        for i in range(per_side):
            u = s * (gap + MEDALLION_RADIUS + pitch * (i + 0.5))
            build(face, f"module{s}_{i}", u, length / 2, width, height, p, i)
        for i in range(1, per_side):
            face.box(f"post{s}_{i}", s * (gap + MEDALLION_RADIUS + pitch * i), length / 2, 0.06, height, 0.06, p["steel"], bevel=0.008)
    # The vertical apron below, mostly behind the hand: plain plates, a brass rail, two conduits.
    lower = Face((0, -OUTER_Y, 0), (1, 0, 0), (0, 0, 1), (0, -1, 0))
    for s in (-1, 1):
        for i in range(4):
            u = s * (0.9 + 1.85 * (i + 0.5))
            _module_frame(lower, f"lower{s}_{i}", u, (FASCIA_BOTTOM + BOTTOM + 0.12) / 2 - 0.03, 1.75, FASCIA_BOTTOM - BOTTOM - 0.3, p,
                          p["panel"], detail=False)
    for k, (z, radius, mat) in enumerate(((-0.86, 0.045, p["trim"]), (-0.95, 0.04, p["rubber"]))):
        for s in (-1, 1):
            rod(f"conduit{k}_{s}", (s * 0.5, -OUTER_Y - 0.06, z), (s * inner_x, -OUTER_Y - 0.06, z), radius, mat, sides=8)


def sides(p, style):
    """The side and back faces (seen when the camera orbits): plain recessed plates and a conduit."""
    for s in (-1, 1):
        face = Face((s * OUTER_X, 0, 0), (0, s, 0), (0, 0, 1), (s, 0, 0))
        for i in range(6):
            u = -4.4 + i * 1.76
            _module_frame(face, f"side{s}_{i}", u, -0.44, 1.62, 0.7, p, p["panel"], detail=False)
        rod(f"side{s}_conduit", (s * (OUTER_X + 0.06), -OUTER_Y + 0.6, -0.9), (s * (OUTER_X + 0.06), OUTER_Y - 0.6, -0.9), 0.045,
            p["trim"])
    back = Face((0, OUTER_Y, 0), (-1, 0, 0), (0, 0, 1), (0, 1, 0))
    for i in range(8):
        _module_frame(back, f"back{i}", -7.35 + i * 2.1, -0.44, 1.9, 0.7, p, p["panel"], detail=False)


def corners(p, style, beacon=True):
    """Machined corner blocks: fins toward the camera, a brass band; a beacon on top (slot "finial")."""
    finials = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * CORNER_X, sy * CORNER_Y
            top = NEAR_TOP if sy < 0 else FAR_TOP
            name = f"corner{'n' if sy < 0 else 'f'}{'l' if sx < 0 else 'r'}"
            r = CORNER_HALF / math.cos(math.pi / 8)
            fl.prism(f"{name}_block", 8, r, r - 0.03, BOTTOM, top, p["steel"], xy=(cx, cy), bevel=0.02)
            fl.prism(f"{name}_band", 8, r + 0.02, r + 0.02, top - 0.14, top - 0.08, p["trim"], xy=(cx, cy), bevel=0.006)
            fl.prism(f"{name}_cap", 8, r - 0.06, r - 0.12, top, top + 0.06, p["panel"], xy=(cx, cy), bevel=0.01)
            fl.prism(f"{name}_foot", 8, r + 0.04, r + 0.03, BOTTOM, BOTTOM + 0.12, p["panel"], xy=(cx, cy), bevel=0.01)
            for k in range(5):
                z = -0.72 + k * 0.13
                if sy < 0:
                    fl.box(f"{name}_fin{k}", (0.5, 0.05, 0.05), (cx, cy - CORNER_HALF - 0.012, z), p["panel"], bevel=0.008)
                fl.box(f"{name}_sidefin{k}", (0.05, 0.5, 0.05), (cx + sx * (CORNER_HALF + 0.012), cy, z), p["panel"], bevel=0.008)
            if sy < 0:
                fl.box(f"{name}_plate", (0.26, 0.012, 0.08), (cx - 0.06 * sx, cy - CORNER_HALF - 0.01, -0.06), p["ivory"], bevel=0.003)
                fl.box(f"{name}_led", (0.05, 0.012, 0.04), (cx + 0.16 * sx, cy - CORNER_HALF - 0.01, -0.06), p["accent"], bevel=0)
            if beacon:
                finials += _beacon(p, name, cx, cy, top + 0.06)
    if finials:
        holder = fl.slot(fl.empty("finial"), "finial")
        fl.merge_onto(holder, finials)


def _beacon(p, name, x, y, z):
    """A short beacon: a ring-gate collar round an amber lamp in a brass cage."""
    parts = [
        fl.cylinder(f"{name}_beacon_base", 0.2, z, z + 0.05, p["trim"], xy=(x, y), sides=12),
        fl.torus(f"{name}_beacon_collar", 0.2, 0.035, (x, y, z + 0.08), p["bright"], major_segments=20, minor_segments=6),
        fl.cylinder(f"{name}_beacon_lamp", 0.09, z + 0.05, z + 0.2, p["lamp"], xy=(x, y), sides=10),
        fl.cylinder(f"{name}_beacon_cap", 0.13, z + 0.2, z + 0.24, p["panel"], xy=(x, y), sides=12, r_top=0.08),
    ]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append(fl.box(f"{name}_beacon_bar{k}", (0.025, 0.025, 0.16), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, z + 0.13),
                            p["trim"], bevel=0))
    return parts


def band_marks(p, style):
    """NORTH / CENTER / SOUTH stencilled into the deck at the west end of each band, like a hangar
    floor's markings (band_<zone>_label: worn ivory that lights in the band's state), and a lamp strip
    set into both side rails beside each band (band_<zone>_lamp)."""
    for zone, y in BAND_Y.items():
        # Along the band's near edge, in its south-west corner: in front of ALPHA, never under a device's label.
        deck = Face((0, BAND_EDGES[zone] + 0.23 + LETTER / 2, 0.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
        stencil(deck, f"mark_{zone}", zone.upper(), LETTER, p[f"{zone}_label"], u=MARK_X + text_width(zone.upper(), LETTER) / 2,
                w=0.0, depth=0.006)
        for s in (-1, 1):
            x = s * (TABLE_X + LIP + 0.26)
            rail = Face((x, y, RAIL_Z), (1, 0, 0), (0, 1, 0), (0, 0, 1))
            rail.box(f"lamp_{zone}{s}_bezel", 0, 0, 0.24, 1.2, 0.02, p["bright"], bevel=0.008)
            rail.box(f"lamp_{zone}{s}_lens", 0, 0, 0.13, 1.06, 0.03, p[f"{zone}_lamp"], bevel=0)
            for k in (-1, 1):
                fl.sphere(f"lamp_{zone}{s}_bolt{k}", 0.018, rail.at(0, k * 0.68, 0.004), p["bright"], segments=6, rings=3)


def medallion(p, style):
    """The fascia's centre: the containerlab mark in brass on dark enamel inside a ring gate."""
    face, length = fascia_face()
    # Whole on the fascia, standing a little proud of it: the ring gate's foot clears the fascia's
    # lower edge (the camera sees it just above the hand) and its crown rises over the rail.
    r, w, lift = MEDALLION_RADIUS, MEDALLION_RADIUS + 0.04, 0.03
    face.disc("medallion_back", 0, w, r + 0.04, 0.05 + lift, p["steel"], sides=16, bevel=0.012)
    face.ring("medallion_gate", 0, w, r - 0.07, 0.055, p["panel"], h=0.075 + lift, segments=40)
    face.ring("medallion_light", 0, w, r - 0.15, 0.018, p["ring"], h=0.09 + lift, gaps=16, gap_fraction=0.28, segments=56)
    face.disc("medallion_enamel", 0, w, r - 0.16, 0.04, p["enamel"], h=0.05 + lift, sides=28)
    for k in range(8):
        a = k * math.pi / 4
        face.box(f"medallion_clamp{k}", math.cos(a) * (r - 0.07), w + math.sin(a) * (r - 0.07), 0.13, 0.07, 0.07, p["bright"],
                 h=0.07 + lift, angle=a + math.pi / 2, bevel=0.008)
    size = (r - 0.19) * 2 * 0.95
    outline = [[(x * size, w + y * size) for x, y in mark.flatten(path, 6)] for path in mark.OUTLINE]
    liquid = [[(x * size, w + y * size) for x, y in mark.flatten(path, 6)] for path in mark.LIQUID]
    face.shape("medallion_mark", outline, 0.02, p["bright"], h=0.09 + lift)
    face.shape("medallion_liquid", liquid, 0.01, p["mark"], h=0.09 + lift)
    for k, (bx, by, radius, stroke) in enumerate(mark.BUBBLES):
        face.ring(f"medallion_bubble{k}", bx * size, w + by * size, radius * size, max(0.005, stroke * size / 2), p["bright"],
                  h=0.1 + lift, segments=14)


def crest_mount(p, style, emblem=True):
    """The far rail's crest mount; the default emblem (slot "crest") is a small ring gate."""
    slab("crest_mount", -0.85, 0.85, CREST_Y - 0.2, CREST_Y + 0.2, RAIL_Z - 0.02, RAIL_Z + 0.08, p["steel"], bevel=0.015)
    slab("crest_mount_trim", -0.9, 0.9, CREST_Y - 0.22, CREST_Y - 0.16, RAIL_Z - 0.02, RAIL_Z + 0.05, p["trim"], bevel=0.008)
    if not emblem:
        return
    face = Face((0, CREST_Y, RAIL_Z + 0.08), (1, 0, 0), (0, 0, 1), (0, -1, 0))
    centre = 0.3
    parts = [
        face.ring("crest_gate", 0, centre, 0.24, 0.045, p["panel"], segments=32),
        face.ring("crest_gate_light", 0, centre, 0.17, 0.018, p["accent"], gaps=8, gap_fraction=0.3, segments=32),
        face.disc("crest_core", 0, centre, 0.08, 0.04, p["accent_lum"], sides=12),
        face.box("crest_arm_l", -0.3, centre * 0.5, 0.05, 0.36, 0.06, p["trim"], angle=-0.5),
        face.box("crest_arm_r", 0.3, centre * 0.5, 0.05, 0.36, 0.06, p["trim"], angle=0.5),
    ]
    for k in range(4):
        a = k * math.pi / 2
        parts.append(face.box(f"crest_clamp{k}", math.cos(a) * 0.24, centre + math.sin(a) * 0.24, 0.08, 0.05, 0.08, p["bright"],
                              angle=a + math.pi / 2, bevel=0.006))
    holder = fl.slot(fl.empty("crest"), "crest")
    fl.merge_onto(holder, parts)


def build_base(style, corner=None, crest=None, extras=()):
    """A board: every part of the kit in the style's palette. A guardian's board passes its own
    corner dressing corner(p, x, y, top, far), its crest crest(p) (both then replace the slots) and
    extras(p); its fascia modules come from its style's "modules"."""
    p = palette(style)
    body(p, style)
    lip(p)
    rails(p, style)
    dividers(p)
    apron(p, style)
    sides(p, style)
    corners(p, style, beacon=corner is None)
    if corner:
        for sx in (-1, 1):
            for sy in (-1, 1):
                far = sy > 0
                corner(p, sx * CORNER_X, sy * CORNER_Y, (FAR_TOP if far else NEAR_TOP) + 0.06, far)
    band_marks(p, style)
    medallion(p, style)
    crest_mount(p, style, emblem=crest is None)
    if crest:
        crest(p)
    for extra in extras:
        extra(p)
    return p


# ---------------------------------------------------------------------------
# Preview render (never exported)


def render_board(filepath, style, azimuth=0.0, models=None, base=None, size=(1600, 900)):
    """Eevee render under the game's resting camera (turned by `azimuth` about the table), with the
    stage's tabletop textures from `models`/boards when they exist. `base` imports a board GLB
    first (a crest previews on its stage board)."""
    preview = bpy.data.collections.new("preview")
    bpy.context.scene.collection.children.link(preview)

    def link(obj):
        for collection in obj.users_collection:
            collection.objects.unlink(obj)
        preview.objects.link(obj)
        return obj

    folder = os.path.join(models, "boards") if models else None
    if base and folder and os.path.exists(os.path.join(folder, f"{base}.glb")):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(folder, f"{base}.glb"))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            link(obj)
        # The leader's crest replaces the base's own dressing.
        for obj in imported:
            if "slot" in obj:
                for child in [obj, *obj.children_recursive]:
                    child.hide_render = True

    # The tabletop, textured like World.ts does it.
    table = bpy.data.materials.new("preview_tabletop")
    bsdf = fl._principled(table)
    nodes, links = table.node_tree.nodes, table.node_tree.links

    def image(name, colour):
        path = os.path.join(folder, name) if folder else ""
        if not path or not os.path.exists(path):
            return None
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(path)
        node.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        return node

    albedo, normal, rm = image(f"table-{style}.jpg", True), image("table-normal.jpg", False), image("table-rm.jpg", False)
    if albedo:
        links.new(albedo.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = fl.rgba(0x2A2C2C)
    if normal:
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    if rm:
        split = nodes.new("ShaderNodeSeparateColor")
        links.new(rm.outputs["Color"], split.inputs["Color"])
        links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    bm = bmesh.new()
    corners = [bm.verts.new((x * TABLE_X, y * TABLE_Y, 0.0)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    face = bm.faces.new(corners)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, coords in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = coords
    link(fl.from_bmesh("preview_tabletop", bm, table))

    camera_data = bpy.data.cameras.new("preview_camera")
    camera_data.sensor_fit = "VERTICAL"
    camera_data.angle_y = math.radians(42)
    camera = link(bpy.data.objects.new("preview_camera", camera_data))
    target = Vector((0.0, 2.9, -0.03))
    turn = Matrix.Rotation(math.radians(azimuth), 3, "Z")
    camera.location = target + turn @ (CAMERA - target)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.camera = camera

    def sun(name, color, strength, three_position):
        data = bpy.data.lights.new(name, "SUN")
        data.color = fl.rgba(color)[:3]
        data.energy = strength
        data.angle = math.radians(6)
        obj = link(bpy.data.objects.new(name, data))
        x, y, z = three_position
        obj.rotation_euler = (-Vector((x, -z, y))).to_track_quat("-Z", "Y").to_euler()

    sun("preview_key", 0xFFDDA3, 3.2, (-8, 17, 9))
    sun("preview_rim", 0x89AEC9, 2.3, (7, 8, -8))
    point = bpy.data.lights.new("preview_teal", "POINT")
    point.color = fl.rgba(0x4BE7CF)[:3]
    point.energy = 600
    link(bpy.data.objects.new("preview_teal", point)).location = (0, 0, 3.0)
    world = scene.world or bpy.data.worlds.new("preview_world")
    scene.world = world
    if hasattr(world, "use_nodes") and not world.use_nodes:
        world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = fl.rgba(0x8FA3B0)
    background.inputs["Strength"].default_value = 0.35

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    bpy.data.collections.remove(preview)
