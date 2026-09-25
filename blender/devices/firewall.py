# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Firewall: a pentagonal bastion. Battered armour walls run between five crowned
corner towers with watch-fires. The camera face holds the gate (an ember passage
behind a portcullis) under permit / deny lamps; the other faces carry armour plates
with lancet firing slits. In the courtyard a grated fire pit feeds a faint curtain
of fire along the ramparts, and above it floats the ward: an ember icosahedron
crystal behind a wall of five brass-rimmed heater shields.
Stateful firewalls add a counter-turning gold lattice and an orbiting state table
of six brass slates, each listing glowing connection rows.
Sentry firewalls (variant "sentry") raise a searchlight turret on a mast from the back-right
rampart: a brass lamp housing with a glowing lens (z 2.0-2.4) on a yoke that turns slowly.
The empty "sentry_beam" at the lens is where World.ts starts the quarantine beam."""

import math

import bmesh
from mathutils import Matrix

from lib import faultline as fl

FACES = 5
C36 = math.cos(math.pi / FACES)
# bmesh create_cone puts its first vertex on +Y; this turn puts a flat face toward -Y (the camera)
# and the corners at -54° + k * 72°, where the towers stand. Pinned on every pentagon.
FLAT_FRONT = math.pi + math.pi / FACES


# ---------------------------------------------------------------------------
# Role-local geometry


def arch(name, width, height, depth, mat, location, rotation, rise=None, steps=4, bevel=0.006, segments=1):
    """Pointed (gothic) arch slab facing -Y. Origin at the bottom centre of its front face's midplane."""
    r = width if rise is None else rise  # arc radius; r = width is the equilateral arch
    apex_rise = math.sqrt(r * r - (r - width / 2) ** 2)
    spring = height - apex_rise
    end = math.acos((width / 2 - r) / r)
    profile = [(-width / 2, 0.0)]
    for i in range(steps):
        phi = math.pi + (end - math.pi) * i / steps
        profile.append((-width / 2 + r + r * math.cos(phi), spring + r * math.sin(phi)))
    profile.append((0.0, height))
    profile += [(-x, z) for x, z in reversed(profile[1:-1])]
    profile.append((width / 2, 0.0))
    bm = bmesh.new()
    verts = [bm.verts.new((x, -depth / 2, z)) for x, z in profile]
    face = bm.faces.new(verts)
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in extruded["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, location, rotation), bevel, segments)


def open_prism(name, sides, r_bottom, r_top, z0, z1, mat, rotation_z=None):
    """Open-ended prism wall (an energy field), flat side toward -Y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=sides, radius1=r_bottom, radius2=r_top, depth=z1 - z0)
    if rotation_z is None:
        rotation_z = math.pi + math.pi / sides
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rotation_z, 3, "Z"))
    return fl.finish(fl.from_bmesh(name, bm, mat, (0, 0, (z0 + z1) / 2)), 0, smooth=False)


def icosahedron_faces(radius):
    """Vertex-up icosahedron (pentagonal symmetry about Z) as a list of triangles."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    assert len(bm.faces) == 20, len(bm.faces)
    tris = [[v.co.copy() for v in face.verts] for face in bm.faces]
    bm.free()
    return tris


def heater(name, width, height, depth, mat, location, rotation, bevel=0.006, segments=1):
    """A heater shield slab facing -Y: straight top, straight upper sides, curving to a point."""
    shoulder = height * 0.32
    profile = [(-width / 2, height / 2), (width / 2, height / 2)]
    for t in (0.0, 0.3, 0.55, 0.78):
        profile.append((width / 2 * (1 - t * t), height / 2 - shoulder - t * (height - shoulder)))
    profile.append((0.0, -height / 2))
    profile += [(-x, z) for x, z in reversed(profile[2:-1])]
    bm = bmesh.new()
    verts = [bm.verts.new((x, -depth / 2, z)) for x, z in profile]
    face = bm.faces.new(verts)
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in extruded["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, location, rotation), bevel, segments)


def ward_core(name, radius, stretch, mat, location, gap_angle):
    """Vertex-up icosahedron stretched along Z, turned so its upper ring vertices point at gap_angle (+ k * 72°)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    upper = next(v.co for v in bm.verts if 0.2 * radius < v.co.z < 0.8 * radius)
    turn = gap_angle - math.atan2(upper.y, upper.x)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(turn, 3, "Z"))
    bmesh.ops.scale(bm, vec=(1, 1, stretch), verts=bm.verts)
    return fl.finish(fl.from_bmesh(name, bm, mat, location), 0, smooth=False)


# ---------------------------------------------------------------------------


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    ember = m("glow_ember")
    z0 = fl.PLINTH_TOP

    # --- Footing: a brass glacis.
    fl.prism("foot", FACES, 0.65, 0.63, z0, z0 + 0.05, brass, rotation_z=FLAT_FRONT, bevel=0.012)

    # --- Battered curtain wall.
    wz0, wz1 = z0 + 0.05, z0 + 0.5
    rb, rt = 0.59, 0.51
    fl.prism("wall", FACES, rb, rt, wz0, wz1, dark, rotation_z=FLAT_FRONT, bevel=0.02, segments=2)
    tilt = math.atan((rb - rt) * C36 / (wz1 - wz0))

    def apothem(z):
        return (rb - (rb - rt) * (z - wz0) / (wz1 - wz0)) * C36

    def on_face(a, z, along=0.0, out=0.0):
        ap = apothem(z) + out
        return (math.cos(a) * ap - math.sin(a) * along, math.sin(a) * ap + math.cos(a) * along, z)

    for i, (_, _, a) in enumerate(fl.polar(FACES, 1.0)):
        rot = (-tilt, 0, a + math.pi / 2)
        if i == 0:
            # The gate: a brass pointed arch, an ember passage, a graphite portcullis.
            gz = wz0 + 0.004
            arch("gate_frame", 0.25, 0.31, 0.04, brass, on_face(a, gz, out=0.004), rot, bevel=0.008)
            arch("gate_glow", 0.18, 0.255, 0.02, ember, on_face(a, gz, out=0.022), rot, bevel=0)
            for k, along in enumerate((-0.05, 0.0, 0.05)):
                fl.box(f"bar_v{k}", (0.03, 0.03, 0.25), on_face(a, gz + 0.125, along, 0.035), graphite, rotation=rot,
                       bevel=0.006, segments=1)
            for k, dz in enumerate((0.08, 0.165)):
                fl.box(f"bar_h{k}", (0.19, 0.03, 0.03), on_face(a, gz + dz, 0, 0.04), graphite, rotation=rot, bevel=0.006,
                       segments=1)
            # Permit / deny lamps on a brass lintel above the gate.
            lz = gz + 0.355
            fl.box("lintel", (0.22, 0.03, 0.065), on_face(a, lz, 0, 0.01), brass, rotation=rot, bevel=0.008, segments=1)
            for k, (along, glow) in enumerate(((-0.05, "glow_green"), (0.05, "glow_red"))):
                lamp = fl.box(f"lamp{k}", (0.05, 0.02, 0.04), on_face(a, lz, along, 0.03), m(glow), rotation=rot, bevel=0)
                fl.hook(lamp, "blinker", speed=1.3 + k * 0.9, phase=k * 2.1, base=0.95)
        else:
            # Armour plate with two lancet firing slits.
            pz = wz0 + 0.2
            fl.box(f"plate{i}", (0.36, 0.03, 0.3), on_face(a, pz, out=0.008), graphite, rotation=rot, bevel=0.012, segments=1)
            for k, along in enumerate((-0.07, 0.07)):
                arch(f"slit{i}_{k}", 0.055, 0.2, 0.02, ember, on_face(a, pz - 0.1, along, 0.026), rot, steps=3, bevel=0)

    # --- Corbelled parapet with battlements.
    fl.prism("corbel", FACES, rt, 0.55, wz1 - 0.02, wz1 + 0.03, brass, rotation_z=FLAT_FRONT, bevel=0.008)
    pz0, pz1 = wz1 + 0.03, wz1 + 0.09
    fl.prism("parapet", FACES, 0.55, 0.55, pz0, pz1, graphite, rotation_z=FLAT_FRONT, bevel=0.012)
    for i, (_, _, a) in enumerate(fl.polar(FACES, 1.0)):
        ap = 0.55 * C36 - 0.028
        for k, along in enumerate((-0.12, 0.0, 0.12)):
            x = math.cos(a) * ap - math.sin(a) * along
            y = math.sin(a) * ap + math.cos(a) * along
            fl.box(f"merlon{i}_{k}", (0.08, 0.05, 0.07), (x, y, pz1 + 0.035), graphite, rotation=(0, 0, a + math.pi / 2),
                   bevel=0.008, segments=1)

    # --- Corner towers: shaft, brass footing, corbelled crown, merlons and a watch-fire.
    tr = 0.545
    for i, (x, y, a) in enumerate(fl.polar(FACES, tr, start=-math.pi / 2 + math.pi / FACES)):
        fl.cylinder(f"tower{i}", 0.12, z0 + 0.05, pz1 + 0.02, dark, xy=(x, y), sides=12, r_top=0.105)
        fl.cylinder(f"tower_band{i}", 0.128, z0 + 0.04, z0 + 0.09, brass, xy=(x, y), sides=12)
        fl.cylinder(f"tower_corbel{i}", 0.105, pz1 - 0.04, pz1 + 0.02, brass, xy=(x, y), sides=12, r_top=0.145)
        crown_top = pz1 + 0.08
        fl.cylinder(f"tower_crown{i}", 0.145, pz1 + 0.02, crown_top, graphite, xy=(x, y), sides=12, bevel=0.008, segments=1)
        for k in range(4):
            b = a + k * math.pi / 2
            mx, my = x + math.cos(b) * 0.12, y + math.sin(b) * 0.12
            fl.box(f"tower_merlon{i}_{k}", (0.07, 0.045, 0.06), (mx, my, crown_top + 0.03), graphite,
                   rotation=(0, 0, b + math.pi / 2), bevel=0)
        fl.octahedron(f"watchfire{i}", 0.045, (x, y, crown_top + 0.05), ember, stretch=1.5)
        # An outward firing slit on each tower.
        sx, sy = x + math.cos(a) * 0.118, y + math.sin(a) * 0.118
        fl.box(f"tower_slit{i}", (0.035, 0.02, 0.13), (sx, sy, z0 + 0.3), ember, rotation=(0, 0, a + math.pi / 2), bevel=0)

    # --- Courtyard keep with a brass-rimmed fire pit.
    keep_top = pz1 + 0.08
    fl.prism("keep", FACES, 0.31, 0.28, pz1 - 0.02, keep_top, graphite, rotation_z=FLAT_FRONT, bevel=0.014)
    fl.prism("pit_rim", FACES, 0.285, 0.275, keep_top, keep_top + 0.03, bright, rotation_z=FLAT_FRONT, bevel=0.008)
    fl.prism("embers", FACES, 0.2, 0.2, keep_top + 0.02, keep_top + 0.034, ember, rotation_z=FLAT_FRONT, bevel=0)
    # A five-spoke brass grate over the embers.
    for i, (x, y, a) in enumerate(fl.polar(FACES, 0.1, start=-math.pi / 2 + math.pi / FACES)):
        fl.box(f"grate{i}", (0.2, 0.034, 0.032), (x, y, keep_top + 0.044), bright, rotation=(0, 0, a), bevel=0)
    fl.cylinder("grate_hub", 0.05, keep_top + 0.03, keep_top + 0.06, bright, sides=12)

    # --- The ward: an ember crystal behind a floating wall of five heater shields, above the fire pit.
    wc, wr, stretch = (0, 0, 2.07), 0.2, 1.75
    crystal = fl.lit("crystal_ember", 0x8A3A12, 0.35, 0.22, emission=0xFF8A33, strength=0.85)
    ward = ward_core("ward", wr, stretch, crystal, wc, gap_angle=-math.pi / 2 + math.pi / FACES)
    fl.hook(ward, "floater")
    armour = fl.lit("metal_ward", 0x4A1C18, 0.62, 0.32, emission=0xDA9E69, strength=0.12)
    rims, fields = [], []
    lean = math.radians(12)
    for i, (_, _, a) in enumerate(fl.polar(FACES, 1.0)):
        rot = (-lean, 0, a + math.pi / 2)
        at = lambda out, dz=0.0: (math.cos(a) * out, math.sin(a) * out, wc[2] + dz)  # noqa: E731
        rims.append(heater(f"shield_rim{i}", 0.265, 0.355, 0.03, bright, at(0.2), rot, bevel=0.008))
        fields.append(heater(f"shield_field{i}", 0.2, 0.29, 0.02, armour, at(0.215), rot, bevel=0.006))
        # A brass boss on each shield catches the key light.
        boss = fl.octahedron(f"shield_boss{i}", 0.034, at(0.233 + 0.02 * math.sin(lean), 0.02), bright, stretch=1.0)
        boss.rotation_euler = rot
        boss.scale = (1, 0.55, 1)
        rims.append(boss)
    fl.parent(fl.merge("ward_shield_rims", rims), ward)
    fl.parent(fl.merge("ward_shield_fields", fields), ward)

    # --- Protective field: a curtain of fire rising from the battlements, fading (stacked bands)
    # before it reaches the ward so the shields keep their contrast.
    field_mat = fl.unlit("role_glow_field", fl.ROLE_COLORS[role], 0.06, double_sided=True)
    fz0, fz1, fr0, fr1 = pz1, 1.9, 0.47, 0.45

    def field_r(z):
        return fr0 + (fr1 - fr0) * (z - fz0) / (fz1 - fz0)

    for k, top in enumerate((fz1, 1.75, 1.64)):
        inset = 0.006 * k
        open_prism(f"field{k}", FACES, fr0 - inset, field_r(top) - inset, fz0, top, field_mat)

    # --- Stateful: a counter-turning gold lattice and an orbiting state table.
    lattice = fl.icosphere("lattice", 0.69, (0, 0, 1.74), m("wire_gold"), subdivisions=2)
    fl.hook(lattice, "spinner", speed=-0.25, axis="y")
    fl.variant(lattice, "stateful")

    table = fl.empty("state_table", (0, 0, 1.5))
    fl.hook(table, "spinner", speed=0.55, axis="y")
    fl.variant(table, "stateful")
    frames, rows_a, rows_b = [], [], []
    for i, (x, y, a) in enumerate(fl.polar(6, 0.84)):
        rot = (0, 0, a + math.pi / 2)
        frames.append(fl.box(f"slate{i}", (0.18, 0.025, 0.25), (x, y, 1.5), brass, rotation=rot, bevel=0.008, segments=1))
        for k, dz in enumerate((0.07, 0.0, -0.07)):
            ox, oy = x + math.cos(a) * 0.016, y + math.sin(a) * 0.016
            width = 0.13 if k != 1 else 0.1
            row = fl.box(f"row{i}_{k}", (width, 0.01, 0.045), (ox, oy, 1.5 + dz), m("glow_gold" if (i + k) % 2 else "glow_ember"),
                         rotation=rot, bevel=0)
            (rows_a if (i + k) % 2 else rows_b).append(row)
    for name, parts in (("state_slates", frames), ("state_rows_gold", rows_a), ("state_rows_ember", rows_b)):
        fl.parent(fl.merge(name, parts), table)

    # --- Sentry: a searchlight turret on the back-right rampart, sweeping on its yoke.
    angle = math.radians(54)  # the rampart face behind and right of the ward
    mx, my = math.cos(angle) * 0.47, math.sin(angle) * 0.47
    mast_top = 2.04
    mast = [
        fl.prism("sentry_bracket", 4, 0.075, 0.06, pz1, pz1 + 0.06, bright, xy=(mx, my), rotation_z=angle + math.pi / 4, bevel=0),
        fl.cylinder("sentry_mast", 0.026, pz1 + 0.06, mast_top, bright, xy=(mx, my), sides=8),
        fl.cylinder("sentry_ring", 0.045, mast_top - 0.03, mast_top, bright, xy=(mx, my), sides=10),
    ]
    fl.variant(fl.merge("sentry_mast", mast, pivot=(mx, my, pz1)), "sentry")

    yoke = fl.empty("sentry_yoke", (mx, my, mast_top))
    fl.hook(yoke, "spinner", speed=0.5, axis="y")
    fl.variant(yoke, "sentry")
    # Built at the origin looking along +X, then set on the mast looking front-right (the yoke turns it).
    pivot_z, arm = 0.17, 0.115
    parts = [fl.cylinder("sentry_turntable", 0.055, 0.0, 0.03, bright, sides=10),
             fl.box("sentry_fork", (0.03, arm * 2 + 0.03, 0.03), (0, 0, 0.045), bright, bevel=0.006, segments=1)]
    for side in (-1, 1):
        parts.append(fl.box(f"sentry_arm{side}", (0.024, 0.024, pivot_z - 0.03), (0, side * arm, pivot_z / 2 + 0.02), bright, bevel=0))
    housing = [
        fl.cylinder("sentry_housing", 0.08, -0.13, 0.11, brass, sides=12, r_top=0.097),
        fl.cylinder("sentry_bezel", 0.108, 0.11, 0.145, bright, sides=12),
        fl.cylinder("sentry_cap", 0.055, -0.165, -0.13, bright, sides=8),
    ]
    for k, z in enumerate((-0.07, 0.02)):
        housing.append(fl.cylinder(f"sentry_fin{k}", 0.1, z - 0.01, z + 0.01, bright, sides=12))
    lens = fl.dome("sentry_lens", 0.09, 0.04, 0.14, m("role_glow"), segments=12, rings=2)
    for trunnion in (-1, 1):
        stub = fl.cylinder(f"sentry_trunnion{trunnion}", 0.022, -0.02, 0.02, bright, sides=6)
        stub.location = (0, trunnion * (arm - 0.02), 0)
        stub.rotation_euler = (math.pi / 2, 0, 0)
        housing.append(stub)
    beam = fl.empty("sentry_beam", (0, 0, 0.19))
    # The housing's axis (+Z) turned to +X and dipped 14 degrees toward the table.
    fl.transform(housing + [lens, beam], Matrix.Translation((0, 0, pivot_z)) @ Matrix.Rotation(math.radians(90 + 14), 4, "Y"))
    fl.transform(parts + housing + [lens, beam], Matrix.Translation((mx, my, mast_top)) @ Matrix.Rotation(math.radians(-40), 4, "Z"))
    fl.merge_onto(yoke, parts + housing + [lens])
    fl.parent(beam, yoke)
