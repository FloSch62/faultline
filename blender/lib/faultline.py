"""Shared building blocks for FAULTLINE models: devices, installations and props.

Units are game units. Blender is Z-up; the glTF export turns the model Y-up and
Blender's -Y becomes three.js +Z, the side that faces the table camera. Build
every body facing -Y.

Three families share the materials, hooks and export:
  device        origin at the plinth base, body from PLINTH_TOP (the plinth is built in code)
  installation  origin at the table surface, no plinth (hostile permanents: tap, jammer, ...)
  prop          origin at the table surface, no plinth (crate, message fragment)

The contract with src/three/models.ts lives in blender/README.md.
"""

import array
import json
import math
import os
import struct
from collections import defaultdict

import bmesh
import bpy
from mathutils import Matrix, Vector

# The shared plinth (built in code) tops out here; role bodies stand on it.
PLINTH_TOP = 0.95
# Body footprint. Floaters and spinners may reach 0.9 from the axis.
MAX_RADIUS = 0.72
MAX_ORBIT = 0.9
# The device label hovers at 2.86.
MAX_TOP = 2.45

# Per-family envelope (world space, metres) and budget. A script may raise its own ceiling with a
# module-level MAX_TOP (client, power, tap) or lower it (breaker), and loosen a budget key with a
# module-level BUDGET dict (documented in its docstring).
ENVELOPES = {
    "device": {"bottom": PLINTH_TOP - 0.2, "top": MAX_TOP, "radius": MAX_RADIUS, "orbit": MAX_ORBIT},
    # Installations stand on the table (z 0) beside devices >= 1.55 away; their label floats at 2.3.
    "installation": {"bottom": 0.0, "top": 1.9, "radius": 0.6, "orbit": 0.75},
    # Props: small table objects without a label (World.ts labels the crate).
    "prop": {"bottom": 0.0, "top": 1.2, "radius": 0.5, "orbit": 0.5},
}
BUDGETS = {
    "device": {"triangles": 6000, "draw_calls": 20, "bytes": 250 * 1024},
    "installation": {"triangles": 3000, "draw_calls": 8, "bytes": 120 * 1024},
    "prop": {"triangles": 1500, "draw_calls": 4, "bytes": 60 * 1024},
}

# Preview-only copy of COLORS in src/three/devices.ts. The game recolours every
# role_* material at runtime, so these values only affect Blender renders.
ROLE_COLORS = {
    "client": 0xE2C184,
    "router": 0x91C9BF,
    "switch": 0xA0B8CA,
    "firewall": 0xDA9E69,
    "honeypot": 0xF0A33C,
    "cache": 0x7FB0F2,
    "power": 0xF4D25C,
    "balancer": 0xB69CFF,
    "rack": 0xB5CF7A,
    "phantom": 0x7EF5E6,
    # Installations: the colour of the hostiles that plant them (World.ts passes the same palette).
    "tap": 0xFF3F8E,
    "jammer": 0x87B5FF,
    "spike": 0xE49B72,
    "anchor": 0xBBA0E8,
    "breaker": 0xFF777E,
    # Props carry no role colour; their role_* accents (if any) preview in brass.
    "crate": 0xE0B872,
    "fragment": 0xE0B872,
}

# Lit materials: (base colour, metallic, roughness, emission colour, emission strength).
# The first three match mat() in src/three/materials.ts ("brushed instrument metal").
LIT = {
    "metal_dark": (0x242C2F, 0.64, 0.53, 0x000000, 0.0),
    "metal_graphite": (0x3A4448, 0.7, 0.42, 0x000000, 0.0),
    "metal_brass": (0x776044, 0.72, 0.4, 0x000000, 0.0),
    "metal_brass_bright": (0xB08A4E, 0.85, 0.3, 0x000000, 0.0),
    "metal_steel": (0x5B7187, 0.7, 0.38, 0x000000, 0.0),
    "metal_copper": (0xA8703A, 0.8, 0.35, 0x000000, 0.0),
    "metal_rust": (0x5B3A26, 0.35, 0.92, 0x000000, 0.0),
    "rubber": (0x121517, 0.0, 0.85, 0x000000, 0.0),
    "glass_smoke": (0x1A2226, 0.2, 0.12, 0x000000, 0.0),
}

# Unlit materials become THREE.MeshBasicMaterial. Value: (colour, opacity[, double_sided]).
GLOW = {
    "glow_teal": (0x62FCE3, 1.0),
    "glow_teal_deep": (0x1F98AC, 1.0),
    "glow_amber": (0xF1B478, 1.0),
    "glow_ember": (0xFF9A3C, 1.0),
    "glow_red": (0xFF526B, 1.0),
    "glow_white": (0xFFF4DE, 1.0),
    "glow_green": (0x71F0C8, 1.0),
    "glow_gold": (0xFFD28A, 1.0),
    # Installations and props.
    "glow_uplink": (0x9D5BFF, 0.35, True),  # the Tap's uplink funnel (today's MALWARE_ACCENT), double-sided
    "glow_band": (0xF2E4C4, 1.0),  # ivory hazard bands
    "glow_cap": (0xFF4B4B, 0.9),  # red glass (the Breaker Charge's cap)
    "glow_inner": (0xFFB15C, 1.0),  # amber light inside the crate
    "glow_ribbon": (0xFFE0A6, 0.7, True),  # the message fragment's pale amber ribbon, double-sided
}

# Unlit wireframes (THREE.MeshBasicMaterial with wireframe: true). Value: (colour, opacity).
WIRE = {
    "wire_gold": (0xFFD6A4, 0.3),
    "wire_white": (0xE8F4FF, 0.5),
    "wire_chain": (0xE2BE82, 0.95),  # brass chain links drawn as line art (see lines())
}

# Role-tinted materials: the runtime swaps in the role colour.
#   role_glow*      unlit, role colour
#   role_wire*      unlit wireframe, role colour
#   role_luminous   lit, colour * 0.4 with role-coloured emission (the old "luminous")
ROLE = {
    "role_glow": 1.0,
    "role_glow_soft": 0.45,
    "role_glow_faint": 0.12,
    "role_wire": 0.8,
    "role_luminous": None,
}


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def rgba(hex_color, alpha=1.0):
    r, g, b = ((hex_color >> 16) & 255) / 255, ((hex_color >> 8) & 255) / 255, (hex_color & 255) / 255
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


# ---------------------------------------------------------------------------
# Scene


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for block in list(collection):
            collection.remove(block)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    device = bpy.data.collections.new("device")
    scene.collection.children.link(device)
    return device


def device_collection():
    return bpy.data.collections["device"]


# ---------------------------------------------------------------------------
# Materials


def _principled(material):
    if hasattr(material, "use_nodes") and not material.use_nodes:
        material.use_nodes = True
    return next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")


def material(name, role="router"):
    """Library material by name, created on first use."""
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    if name in LIT:
        return lit(name, *LIT[name])
    if name in GLOW:
        color, opacity, *sided = GLOW[name]
        return unlit(name, color, opacity, double_sided=bool(sided and sided[0]))
    if name in WIRE:
        return unlit(name, *WIRE[name])
    if name == "role_luminous":
        color = ROLE_COLORS[role]
        dim = tuple(channel * 0.4 for channel in rgba(color)[:3])
        mat = _lit(name, rgba(color)[:3], 0.64, 0.53, rgba(color)[:3], 0.5)
        _principled(mat).inputs["Base Color"].default_value = dim + (1.0,)
        return mat
    if name in ROLE:
        return _unlit(name, ROLE_COLORS[role], ROLE[name])
    raise KeyError(f"unknown material {name!r}; use lit()/unlit() or add it to blender/lib/faultline.py")


def lit(name, base, metallic, roughness, emission=0x000000, strength=0.0):
    """A one-off lit material. Any name without a glow/wire/role prefix is lit metal in the game."""
    assert not name.startswith(("glow", "wire", "role_")), name
    return _lit(name, rgba(base)[:3], metallic, roughness, rgba(emission)[:3], strength)


def unlit(name, color, opacity=1.0, double_sided=False):
    """A one-off unlit colour. `name` starts with glow_ (solid) or wire_ (wireframe), or with
    role_glow / role_wire to take the role colour in game (`color` is then only for previews)."""
    assert name.startswith(("glow_", "wire_", "role_glow", "role_wire")), name
    return _unlit(name, color, opacity, double_sided)


def _lit(name, base, metallic, roughness, emission, strength):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_backface_culling = True
    bsdf = _principled(mat)
    bsdf.inputs["Base Color"].default_value = tuple(base) + (1.0,)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = tuple(emission) + (1.0,)
    bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = tuple(base) + (1.0,)
    return mat


def _unlit(name, color, opacity=1.0, double_sided=False):
    """Emission-only in Blender so previews read like THREE.MeshBasicMaterial; opacity travels as an extra."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_backface_culling = not double_sided
    bsdf = _principled(mat)
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Emission Color"].default_value = rgba(color)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    if opacity < 1:
        bsdf.inputs["Alpha"].default_value = opacity
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
    mat["opacity"] = opacity
    mat.diffuse_color = rgba(color)
    return mat


# ---------------------------------------------------------------------------
# Geometry


def from_bmesh(name, bm, mat, location=(0, 0, 0), rotation=(0, 0, 0)):
    """Turn a bmesh (freed here) into a device object with one material. Follow with finish()."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    device_collection().objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    mesh.materials.append(mat)
    return obj


def finish(obj, bevel=0.0, segments=2, angle=30, smooth=True, weighted=True):
    """Hard-surface finish: angle-limited bevel, weighted normals, sharp flats.
    Evenly curved parts (spheres, tori) skip weighted normals: they gain nothing, and
    their float noise makes the export differ from build to build."""
    mesh = obj.data
    if smooth:
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(angle + 5))
    else:
        mesh.shade_flat()
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(angle)
        mod.miter_outer = "MITER_ARC"
        # No harden_normals: it varies from run to run, and the weighted-normal pass redoes shading anyway.
        mod.use_clamp_overlap = True
    if smooth and weighted:
        mod = obj.modifiers.new("normals", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        mod.mode = "FACE_AREA"
    return obj


def box(name, size, location, mat, rotation=(0, 0, 0), bevel=0.012, segments=2):
    """size = (x, y, z) extents; location is the box centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return finish(from_bmesh(name, bm, mat, location, rotation), bevel, segments)


def prism(name, sides, r_bottom, r_top, z0, z1, mat, xy=(0, 0), rotation_z=None, bevel=0.012, segments=2, smooth=None):
    """Upright prism/frustum from z0 to z1. By default a flat side faces -Y (the camera), so
    fl.polar(sides, r) gives the face centres and polar(sides, r, start=-pi/2 + pi/sides) the corners."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r_bottom, radius2=r_top, depth=z1 - z0)
    if rotation_z is None:
        # create_cone puts its first vertex on +Y; turn so a flat face looks at -Y.
        rotation_z = math.pi + math.pi / sides
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rotation_z, 3, "Z"))
    obj = from_bmesh(name, bm, mat, (xy[0], xy[1], (z0 + z1) / 2))
    round_sided = sides >= 12
    return finish(obj, 0 if round_sided and not bevel else bevel, segments, smooth=True if smooth is None else smooth)


def cylinder(name, radius, z0, z1, mat, xy=(0, 0), sides=32, bevel=0.0, segments=2, r_top=None):
    return prism(name, sides, radius, radius if r_top is None else r_top, z0, z1, mat, xy, 0, bevel, segments)


def tube(name, radius, thickness, z0, z1, mat, xy=(0, 0), sides=32):
    """Open-ended cylinder wall (a sleeve or a field), smooth shaded."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=sides, radius1=radius, radius2=radius, depth=z1 - z0)
    if thickness > 0:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thickness)
    obj = from_bmesh(name, bm, mat, (xy[0], xy[1], (z0 + z1) / 2))
    return finish(obj, 0, smooth=True)


def torus(name, major, minor, location, mat, rotation=(0, 0, 0), major_segments=48, minor_segments=10, arc=math.tau, gaps=0, gap_fraction=0.18):
    """Torus lying in the XY plane. `gaps` > 0 cuts it into dashed segments so spinning reads."""
    bm = bmesh.new()
    pieces = max(1, gaps)
    span = arc / pieces
    solid = span * (1 - gap_fraction) if gaps else span
    for piece in range(pieces):
        start = piece * span
        steps = max(2, int(major_segments * solid / math.tau) + 1)
        closed = not gaps and math.isclose(arc, math.tau)
        rings = []
        count = steps if closed else steps + 1
        for i in range(count):
            a = start + solid * i / steps
            centre = Vector((math.cos(a) * major, math.sin(a) * major, 0))
            outward = Vector((math.cos(a), math.sin(a), 0))
            ring = []
            for j in range(minor_segments):
                b = math.tau * j / minor_segments
                ring.append(bm.verts.new(centre + outward * math.cos(b) * minor + Vector((0, 0, math.sin(b) * minor))))
            rings.append(ring)
        for i in range(len(rings) - (0 if closed else 1)):
            a_ring, b_ring = rings[i], rings[(i + 1) % len(rings)]
            for j in range(minor_segments):
                k = (j + 1) % minor_segments
                bm.faces.new((a_ring[j], b_ring[j], b_ring[k], a_ring[k]))
        if not closed:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bmesh(name, bm, mat, location, rotation)
    return finish(obj, 0, smooth=True, angle=60, weighted=False)


def octahedron(name, radius, location, mat, stretch=1.0):
    bm = bmesh.new()
    top = bm.verts.new((0, 0, radius * stretch))
    bottom = bm.verts.new((0, 0, -radius * stretch))
    ring = [bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, 0)) for a in (i * math.pi / 2 for i in range(4))]
    for i in range(4):
        bm.faces.new((ring[i], ring[(i + 1) % 4], top))
        bm.faces.new((ring[(i + 1) % 4], ring[i], bottom))
    return finish(from_bmesh(name, bm, mat, location), 0, smooth=False)


def icosphere(name, radius, location, mat, subdivisions=1, smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    return finish(from_bmesh(name, bm, mat, location), 0, smooth=smooth, angle=45)


def sphere(name, radius, location, mat, segments=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    return finish(from_bmesh(name, bm, mat, location), 0, smooth=True, angle=89, weighted=False)


def lines(name, segments, mat, location=(0, 0, 0), offset=0.003):
    """Line art for wire_* / role_wire materials. three.js draws every triangle edge of a
    wireframe material, so a quad would show its diagonal; here each segment (a, b) becomes one
    sliver triangle that reads as a single clean line. Use it for cages, chains and outlines."""
    bm = bmesh.new()
    up = Vector((0, 0, 1))
    for a, b in segments:
        a, b = Vector(a), Vector(b)
        side = (b - a).cross(up)
        if side.length < 1e-6:
            side = (b - a).cross(Vector((1, 0, 0)))
        side.normalize()
        bm.faces.new((bm.verts.new(a), bm.verts.new(b), bm.verts.new((a + b) / 2 + side * offset)))
    return finish(from_bmesh(name, bm, mat, location), 0, smooth=False)


def loop(points, closed=True):
    """Consecutive (a, b) segments along a polyline, for lines()."""
    points = [tuple(p) for p in points]
    pairs = list(zip(points, points[1:]))
    return pairs + [(points[-1], points[0])] if closed else pairs


def _frames(points):
    """Parallel-transport frames (tangent, normal) along a polyline: no sudden twists."""
    points = [Vector(p) for p in points]
    count = len(points)
    tangents = [(points[min(i + 1, count - 1)] - points[max(i - 1, 0)]).normalized() for i in range(count)]
    normal = tangents[0].cross(Vector((0, 0, 1)))
    if normal.length < 1e-6:
        normal = tangents[0].cross(Vector((1, 0, 0)))
    normal.normalize()
    frames = []
    for i, tangent in enumerate(tangents):
        if i:
            normal = tangents[i - 1].rotation_difference(tangent) @ normal
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        frames.append((points[i], tangent, normal))
    return frames


def sweep(name, points, radius, mat, sides=6, caps=True, radii=None, bevel=0.0):
    """A tube of `sides` along a polyline (a cable, a fuse coil, a bent strut). `radii` tapers it."""
    bm = bmesh.new()
    rings = []
    for i, (point, tangent, normal) in enumerate(_frames(points)):
        binormal = tangent.cross(normal)
        r = radii[i] if radii else radius
        rings.append([bm.verts.new(point + (normal * math.cos(a) + binormal * math.sin(a)) * r)
                      for a in (math.tau * k / sides for k in range(sides))])
    for ring_a, ring_b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((ring_a[k], ring_a[(k + 1) % sides], ring_b[(k + 1) % sides], ring_b[k]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(from_bmesh(name, bm, mat), bevel, smooth=True, angle=60, weighted=False)


def strip(name, points, widths, mat, twist=0.0, location=(0, 0, 0)):
    """A flat ribbon along a polyline (use a double-sided material). `widths` per point (or one
    number); `twist` turns the ribbon about its path by that many radians from start to end."""
    bm = bmesh.new()
    frames = _frames(points)
    pairs = []
    for i, (point, tangent, normal) in enumerate(frames):
        width = widths[i] if isinstance(widths, (list, tuple)) else widths
        angle = twist * i / max(1, len(frames) - 1)
        across = Matrix.Rotation(angle, 3, tangent) @ normal
        pairs.append((bm.verts.new(point - across * width / 2), bm.verts.new(point + across * width / 2)))
    for (a0, a1), (b0, b1) in zip(pairs, pairs[1:]):
        bm.faces.new((a0, a1, b1, b0))
    return finish(from_bmesh(name, bm, mat, location), 0, smooth=True, angle=80, weighted=False)


def tetrahedron(name, radius, location, mat, rotation=(0, 0, 0)):
    bm = bmesh.new()
    verts = [bm.verts.new(Vector(v).normalized() * radius) for v in ((1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1))]
    for face in ((0, 1, 2), (0, 3, 1), (0, 2, 3), (1, 3, 2)):
        bm.faces.new([verts[i] for i in face])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(from_bmesh(name, bm, mat, location, rotation), 0, smooth=False)


def dome(name, radius, height, z, mat, xy=(0, 0), segments=20, rings=6, cap=True):
    """A spherical cap standing on z with its rim at `radius` and its crown `height` above it."""
    bm = bmesh.new()
    rows = []
    for k in range(rings):
        t = k / rings * math.pi / 2
        r, h = math.cos(t) * radius, math.sin(t) * height
        rows.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, h)) for a in (math.tau * i / segments for i in range(segments))])
    top = bm.verts.new((0, 0, height))
    for row_a, row_b in zip(rows, rows[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((row_a[i], row_a[j], row_b[j], row_b[i]))
    for i in range(segments):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % segments], top))
    if cap:
        bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(from_bmesh(name, bm, mat, (xy[0], xy[1], z)), 0, smooth=True, angle=60, weighted=False)


def polar(count, radius, start=-math.pi / 2):
    """(x, y, angle) around the axis; the first item sits on -Y (the camera side)."""
    for i in range(count):
        a = start + i * math.tau / count
        yield math.cos(a) * radius, math.sin(a) * radius, a


def face_frame(angle):
    """Rotation that turns a part built facing -Y to face outward along `angle`."""
    return (0, 0, angle + math.pi / 2)


# ---------------------------------------------------------------------------
# Runtime hooks (exported as glTF extras on the node)


def hook(obj, kind, **params):
    """kind: floater | spinner (speed, axis) | blinker (speed, phase, base)."""
    obj["hook"] = kind
    for key, value in params.items():
        obj[key] = value
    return obj


def variant(obj, flag):
    """Only shown when the NetworkNode has this boolean flag set (e.g. "stateful")."""
    obj["variant"] = flag
    return obj


def part(obj, name):
    """A named moving part that World.ts drives itself (the crate's lid). Like a hooked part it is
    never merged into the static body and keeps identity rotation; its origin is the pivot."""
    obj["part"] = name
    return obj


def parent(child, holder):
    """Parent while keeping the child's world transform."""
    # New objects have a stale matrix_world until the view layer re-evaluates.
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = holder
    child.matrix_world = world
    return child


def transform(objects, matrix):
    """Move already-built parts together by a world-space matrix (e.g. tilt a whole dish)."""
    bpy.context.view_layer.update()
    for obj in objects:
        obj.matrix_world = matrix @ obj.matrix_world
    return objects


def rest_on(obj, z=0.0):
    """Lift or drop a part so its lowest vertex touches `z` (a chip lying on the table)."""
    bpy.context.view_layer.update()
    lowest = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    obj.location.z += z - lowest
    return obj


def empty(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.2
    obj.location = location
    device_collection().objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# Consolidation and export


def bake_hook_transforms():
    """Hooked parts animate by adding to rotation.x/y/z in three.js, so they must start
    with identity rotation and unit scale: bake both into the mesh."""
    for obj in list(device_collection().all_objects):
        if "hook" not in obj and "part" not in obj:
            continue
        if obj.type == "MESH" and not obj.children:
            obj.data.transform(Matrix.LocRotScale(None, obj.rotation_euler, obj.scale))
            obj.rotation_euler = (0, 0, 0)
            obj.scale = (1, 1, 1)
        elif any(abs(v) > 1e-6 for v in obj.rotation_euler) or any(abs(v - 1) > 1e-6 for v in obj.scale):
            raise ValueError(f"{obj.name}: a hooked (or part) holder with children needs identity rotation and scale")


def _lineage(obj):
    while obj:
        yield obj
        obj = obj.parent


def _is_static(obj):
    if any("hook" in node or "variant" in node or "part" in node for node in _lineage(obj)):
        return False
    return obj.type == "MESH" and not obj.children


def merge(name, parts, pivot=(0, 0, 0)):
    """Bake modifiers and join parts that share a material into one mesh (one draw call) whose
    origin sits at `pivot`. Static parts are merged by consolidate(); use this for a hooked
    part built from many pieces, with the pivot where it should turn."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = []
    for obj in parts:
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
        copy = bpy.data.objects.new(obj.name, mesh)
        copy.matrix_world = obj.matrix_world
        device_collection().objects.link(copy)
        baked.append(copy)
    for obj in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
    target = baked[0]
    if len(baked) > 1:
        with bpy.context.temp_override(active_object=target, object=target, selected_objects=baked, selected_editable_objects=baked):
            bpy.ops.object.join()
    target.name = name
    target.data.name = name
    target.data.transform(Matrix.Translation(-Vector(pivot)) @ target.matrix_world)
    target.matrix_world = Matrix.Translation(Vector(pivot))
    return target


def merge_onto(holder, parts):
    """Merge `parts` per material and hang the results on `holder` (e.g. a spinner's empty)."""
    groups = defaultdict(list)
    for obj in parts:
        groups[obj.data.materials[0].name].append(obj)
    return [parent(merge(f"{holder.name}_{mat_name}", objs), holder) for mat_name, objs in groups.items()]


def consolidate(prefix="body"):
    """Bake modifiers and merge static parts into one mesh per material (fewer draw calls)."""
    groups = defaultdict(list)
    for obj in list(device_collection().objects):
        if _is_static(obj):
            groups[obj.data.materials[0].name].append(obj)
    for mat_name, parts in groups.items():
        merge(f"{prefix}_{mat_name}", parts)


def stats():
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    draws = 0
    for obj in device_collection().all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        draws += len({poly.material_index for poly in mesh.polygons})
        evaluated.to_mesh_clear()
    return {"triangles": triangles, "draw_calls": draws}


def part_triangles():
    """Triangles per object (before consolidation), largest first: where to trim a model."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    counts = []
    for obj in device_collection().all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        counts.append((obj.name, len(mesh.loop_triangles)))
        evaluated.to_mesh_clear()
    return sorted(counts, key=lambda item: -item[1])


def check_bounds(role, max_top=MAX_TOP, family="device"):
    """Report geometry that leaves the family's envelope (evaluated vertices, world space).
    Moving parts (hooked, or a named part) may reach the orbit radius."""
    envelope = ENVELOPES[family]
    problems = []
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in device_collection().all_objects:
        if obj.type != "MESH":
            continue
        orbit = any("hook" in node or "part" in node for node in _lineage(obj))
        limit = envelope["orbit"] if orbit else envelope["radius"]
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        radius = top = 0.0
        bottom = math.inf
        for vertex in mesh.vertices:
            world = obj.matrix_world @ vertex.co
            radius = max(radius, math.hypot(world.x, world.y))
            top, bottom = max(top, world.z), min(bottom, world.z)
        evaluated.to_mesh_clear()
        if radius > limit + 0.01:
            problems.append(f"{obj.name}: radius {radius:.3f} > {limit}")
        if top > max_top + 0.01 or bottom < envelope["bottom"] - 0.01:
            problems.append(f"{obj.name}: z {bottom:.2f}..{top:.2f} outside {envelope['bottom']:g}..{max_top:g}")
    return problems


def check_budget(report, family="device", overrides=None):
    """Report a model over its family's triangle, draw-call or byte budget (bytes only once exported)."""
    budget = {**BUDGETS[family], **(overrides or {})}
    problems = []
    for key in ("triangles", "draw_calls", "bytes"):
        if key in report and report[key] > budget[key]:
            problems.append(f"{key.replace('_', ' ')} {report[key]} > budget {budget[key]}")
    return problems


def export(filepath):
    """Export the device as GLB. An unchanged model keeps its existing file, so rebuilding
    never produces a diff from float noise in Blender's normal computation."""
    objects = list(device_collection().all_objects)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj in objects)
    fresh = filepath + ".new.glb"
    bpy.ops.export_scene.gltf(
        filepath=fresh,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_vertex_color="NONE",
    )
    _canonical_triangle_order(fresh)
    if os.path.exists(filepath) and _equivalent(filepath, fresh):
        os.remove(fresh)
    else:
        os.replace(fresh, filepath)


def _read_glb(filepath):
    with open(filepath, "rb") as fh:
        data = fh.read()
    json_length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + json_length]), data[20 + json_length + 8 :]


def _equivalent(path_a, path_b, tolerance=1e-4):
    """Same structure and integer data, and floats within `tolerance`."""
    (gltf_a, bin_a), (gltf_b, bin_b) = _read_glb(path_a), _read_glb(path_b)
    if gltf_a != gltf_b or len(bin_a) != len(bin_b):
        return False
    for accessor in gltf_a.get("accessors", []):
        view = gltf_a["bufferViews"][accessor["bufferView"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        end = view.get("byteOffset", 0) + view["byteLength"]
        a, b = bin_a[start:end], bin_b[start:end]
        if accessor["componentType"] != 5126:
            if a != b:
                return False
        elif any(abs(x - y) > tolerance for x, y in zip(array.array("f", a), array.array("f", b))):
            return False
    return True


def _canonical_triangle_order(filepath):
    """The exporter's triangle order can vary from run to run. Sort every triangle list
    (keeping each triangle's winding) so unchanged geometry always exports the same bytes."""
    with open(filepath, "rb") as fh:
        data = bytearray(fh.read())
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20 : 20 + json_length])
    binary = 20 + json_length + 8
    formats = {5121: "B", 5123: "H", 5125: "I"}
    for mesh in gltf.get("meshes", []):
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4 or "indices" not in primitive:
                continue
            accessor = gltf["accessors"][primitive["indices"]]
            view = gltf["bufferViews"][accessor["bufferView"]]
            layout = f"<{accessor['count']}{formats[accessor['componentType']]}"
            offset = binary + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            values = struct.unpack_from(layout, data, offset)
            triangles = []
            for i in range(0, len(values), 3):
                triangle = values[i : i + 3]
                lead = triangle.index(min(triangle))
                triangles.append(triangle[lead:] + triangle[:lead])
            triangles.sort()
            struct.pack_into(layout, data, offset, *(index for triangle in triangles for index in triangle))
    with open(filepath, "wb") as fh:
        fh.write(data)


# ---------------------------------------------------------------------------
# Preview render (never exported)


def _preview_plinth(role, collection, plinth=True):
    """Stand-in for the code-built plinth so renders show the device in context."""
    def add(obj):
        device_collection().objects.unlink(obj)
        collection.objects.link(obj)
        return obj

    table = bpy.data.materials.new("preview_table")
    bsdf = _principled(table)
    bsdf.inputs["Base Color"].default_value = rgba(0x1E3033)
    bsdf.inputs["Roughness"].default_value = 0.6
    add(cylinder("preview_table", 3.5, 0.5, 0.64, table, sides=48))
    if not plinth:
        return
    dark, trim = material("metal_dark", role), material("metal_brass", role)
    add(cylinder("preview_base", 0.87, 0.64, 0.86, dark, sides=10, r_top=0.79))
    add(cylinder("preview_trim", 0.68, 0.87, 0.95, trim, sides=10, r_top=0.65))
    skirt = bpy.data.materials.new("preview_skirt")
    bsdf = _principled(skirt)
    bsdf.inputs["Emission Color"].default_value = rgba(ROLE_COLORS[role])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    add(torus("preview_skirt", 0.81, 0.028, (0, 0, 0.78), skirt, minor_segments=6))


def _preview_table(role, collection):
    """Installations and props stand straight on the table (z 0)."""
    table = bpy.data.materials.new("preview_table")
    bsdf = _principled(table)
    bsdf.inputs["Base Color"].default_value = rgba(0x1E3033)
    bsdf.inputs["Roughness"].default_value = 0.6
    obj = cylinder("preview_table", 3.5, -0.14, 0.0, table, sides=48)
    device_collection().objects.unlink(obj)
    collection.objects.link(obj)


# Camera distance and look-at height per family (devices keep the original framing).
PREVIEW_FRAMING = {"device": (4.3, 1.5), "installation": (4.4, 0.95), "prop": (2.8, 0.45)}


def render_preview(filepath, role, size=720, distance=None, elevation=34, azimuth=0, target_z=None, family="device",
                   plinth=True):
    """Eevee render from the table camera's angle (from +Z in three.js = -Y here)."""
    distance = distance or PREVIEW_FRAMING[family][0]
    target_z = PREVIEW_FRAMING[family][1] if target_z is None else target_z
    preview = bpy.data.collections.new("preview")
    bpy.context.scene.collection.children.link(preview)
    if family != "device":
        _preview_table(role, preview)
    else:
        # A device without a plinth (the phantom) still floats over the table top.
        _preview_plinth(role, preview, plinth)
    for obj in device_collection().all_objects:
        # Once per object: a second preview angle must not wireframe the wireframe.
        if "preview_wire" in obj.modifiers:
            continue
        if obj.type == "MESH" and obj.data.materials and obj.data.materials[0].name.startswith(("wire", "role_wire")):
            wires = obj.modifiers.new("preview_wire", "WIREFRAME")
            wires.thickness = 0.005

    def link(obj):
        preview.objects.link(obj)
        return obj

    camera_data = bpy.data.cameras.new("preview_camera")
    camera_data.lens = 50
    camera = link(bpy.data.objects.new("preview_camera", camera_data))
    e, a = math.radians(elevation), math.radians(azimuth)
    camera.location = (math.sin(a) * math.cos(e) * distance, -math.cos(a) * math.cos(e) * distance, target_z + math.sin(e) * distance)
    direction = Vector((0, 0, target_z)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.camera = camera

    # three.js lights converted to Blender axes: (x, y, z)three -> (x, -z, y).
    def sun(name, color, strength, three_position):
        data = bpy.data.lights.new(name, "SUN")
        data.color = rgba(color)[:3]
        data.energy = strength
        data.angle = math.radians(6)
        obj = link(bpy.data.objects.new(name, data))
        x, y, z = three_position
        obj.rotation_euler = (-Vector((x, -z, y))).to_track_quat("-Z", "Y").to_euler()

    sun("preview_key", 0xFFDDA3, 3.2, (-8, 17, 9))
    sun("preview_rim", 0x89AEC9, 2.3, (7, 8, -8))
    point = bpy.data.lights.new("preview_teal", "POINT")
    point.color = rgba(0x4BE7CF)[:3]
    point.energy = 60
    link(bpy.data.objects.new("preview_teal", point)).location = (0, 0.5, 3.4)

    world = scene.world or bpy.data.worlds.new("preview_world")
    scene.world = world
    if hasattr(world, "use_nodes") and not world.use_nodes:
        world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    # Stands in for the game's hemisphere light and room environment.
    background.inputs["Color"].default_value = rgba(0x8FA3B0)
    background.inputs["Strength"].default_value = 0.35

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    if hasattr(scene.eevee, "use_bloom"):
        scene.eevee.use_bloom = True
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    bpy.data.collections.remove(preview)
