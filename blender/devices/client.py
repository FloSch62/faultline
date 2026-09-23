"""Client: the signal terminals ALPHA and OMEGA. An octagonal pulpit with a lectern
console facing the table; four steel buttresses rise into brass arms that cradle
the floating signal orb inside a turning dashed halo. Each flank carries a NIC."""

import math

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

# The client label floats at 3.0, so the orb may sit a little higher than other roles.
MAX_TOP = 2.55

ORB_Z = 1.97
ORB_R = 0.30
HALO_Z = 1.80
HALO_R = 0.68
HALO_TUBE = 0.026


# ---------------------------------------------------------------------------
# Role-local shapes


def slab(name, profile, thickness, angle, mat, bevel=0.01, segments=2):
    """A plate whose convex outline [(radial, z), ...] is extruded `thickness` sideways,
    then turned to point outward along `angle`."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -thickness / 2, z)) for x, z in profile]
    back = [bm.verts.new((x, thickness / 2, z)) for x, z in profile]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(len(profile)):
        j = (i + 1) % len(profile)
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = fl.from_bmesh(name, bm, mat, (0, 0, 0), (0, 0, angle))
    return fl.finish(obj, bevel, segments)


def sweep(name, points, radii, mat, side, sides=8):
    """A tapered tube along `points`; `side` is the normal of the plane the curve lies in."""
    bm = bmesh.new()
    rings = []
    last = len(points) - 1
    for i, point in enumerate(points):
        tangent = (points[min(i + 1, last)] - points[max(i - 1, 0)]).normalized()
        normal = side.cross(tangent).normalized()
        binormal = tangent.cross(normal)
        rings.append([bm.verts.new(point + radii[i] * (math.cos(a) * normal + math.sin(a) * binormal))
                      for a in (math.tau * k / sides for k in range(sides))])
    for a_ring, b_ring in zip(rings, rings[1:]):
        for k in range(sides):
            n = (k + 1) % sides
            bm.faces.new((a_ring[k], b_ring[k], b_ring[n], a_ring[n]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=True, angle=60)


def bezier(p0, p1, p2, p3, steps):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        points.append(tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d
                            for a, b, c, d in zip(p0, p1, p2, p3)))
    return points


def geo_orb(name, radius, location, mat, cuts=1):
    """A once-subdivided octahedron pushed onto a sphere: a faceted signal gem."""
    bm = bmesh.new()
    top = bm.verts.new((0, 0, radius))
    bottom = bm.verts.new((0, 0, -radius))
    ring = [bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, 0))
            for a in (math.pi / 4 + i * math.pi / 2 for i in range(4))]
    for i in range(4):
        bm.faces.new((ring[i], ring[(i + 1) % 4], top))
        bm.faces.new((ring[(i + 1) % 4], ring[i], bottom))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for vert in bm.verts:
        vert.co = vert.co.normalized() * radius
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, location), 0, smooth=False)


def on_plane(origin, across, up, normal, u, v, lift):
    """World point on a tilted panel: `u` across, `v` up the slope, `lift` off the face."""
    return tuple(origin[i] + across[i] * u + up[i] * v + normal[i] * lift for i in range(3))


def panel(name, outline, depth, location, rotation, mat, bevel=0.008, segments=2):
    """A plate with a convex `outline` [(across, up), ...], built facing -Y like box()."""
    bm = bmesh.new()
    front = [bm.verts.new((u, -depth / 2, v)) for u, v in outline]
    back = [bm.verts.new((u, depth / 2, v)) for u, v in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, location, rotation), bevel, segments)


# ---------------------------------------------------------------------------


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    steel, rubber = m("metal_steel"), m("rubber")
    amber, green = m("glow_amber"), m("glow_green")
    # A dark, faintly lit amber phosphor: glass would mirror the sky at this slope.
    phosphor = fl.lit("screen_phosphor", 0x0F1311, 0.0, 0.55, 0x6E4816, 1.0)
    z0 = fl.PLINTH_TOP

    # Foot and octagonal pulpit.
    fl.prism("foot", 8, 0.63, 0.61, z0, z0 + 0.05, graphite, bevel=0.012)
    r_low, r_high, p0, p1 = 0.57, 0.50, z0 + 0.05, 1.40
    fl.prism("pulpit", 8, r_low, r_high, p0, p1, dark, bevel=0.022, segments=3)
    fl.prism("moulding", 8, r_low + 0.018, r_low + 0.008, p0, p0 + 0.035, brass, bevel=0.01, segments=1)
    ap = lambda z: (r_low - (r_low - r_high) * (z - p0) / (p1 - p0)) * math.cos(math.pi / 8)  # noqa: E731
    tilt = math.atan((ap(p0) - ap(p1)) / (p1 - p0))
    fl.prism("trim", 8, 0.525, 0.525, p1, p1 + 0.06, brass, bevel=0.012)
    deck_top = p1 + 0.13
    fl.prism("deck", 8, 0.47, 0.41, p1 + 0.06, deck_top, graphite, bevel=0.014)

    # Four buttresses on the diagonals, each ending in a brass knuckle that carries an arm.
    for i, (cx, cy, a) in enumerate(fl.polar(4, 1.0, start=-math.pi / 4)):
        slab(f"buttress{i}", [(0.40, z0), (0.645, z0), (0.645, z0 + 0.07), (0.535, 1.47), (0.40, 1.47)],
             0.075, a, steel, bevel=0.012)
        # A brass shoe grounds each buttress on the plinth.
        shoe = fl.box(f"shoe{i}", (0.2, 0.105, 0.045), (cx * 0.55, cy * 0.55, z0 + 0.0225), brass, bevel=0.008,
                      segments=1)
        shoe.rotation_euler = (0, 0, a)
        knuckle = fl.cylinder(f"knuckle{i}", 0.05, -0.06, 0.06, brass, sides=10, bevel=0.008, segments=1)
        knuckle.location = (cx * 0.53, cy * 0.53, 1.49)
        knuckle.rotation_euler = (math.pi / 2, 0, a)
        # The arm sweeps up and inward to hold the orb just above its equator.
        path = bezier((0.53, 1.50), (0.61, 1.70), (0.60, 2.02), (0.40, 2.12), 10)
        points = [Vector((cx * r, cy * r, z)) for r, z in path]
        radii = [0.036 - 0.016 * (k / (len(points) - 1)) for k in range(len(points))]
        sweep(f"arm{i}", points, radii, bright, side=Vector((-cy, cx, 0)))
        # A graphite clamp band a third of the way up each arm.
        k = len(points) // 3
        clamp = fl.cylinder(f"clamp{i}", radii[k] + 0.012, -0.022, 0.022, graphite, sides=8)
        clamp.location = points[k]
        clamp.rotation_euler = (points[k + 1] - points[k - 1]).to_track_quat("Z", "Y").to_euler()
        tip = points[-1] + (points[-1] - points[-2]).normalized() * 0.02
        fl.octahedron(f"emitter{i}", 0.036, tuple(tip), m("role_glow"), stretch=1.3)
        # The halo turns between the arms and must never touch them.
        assert all(math.hypot(q.x, q.y) + 0.04 < HALO_R - HALO_TUBE for q in points if abs(q.z - HALO_Z) < 0.1)

    # Emitter post under the orb: a stepped dais ringed by a glowing seam, a brass socket,
    # a luminous stem and a coil.
    dais_top = deck_top + 0.045
    fl.prism("dais", 8, 0.3, 0.27, deck_top - 0.01, dais_top, dark, bevel=0.012)
    fl.torus("seam", 0.315 / math.cos(math.pi / 8), 0.016, (0, 0, deck_top + 0.002), m("role_glow"),
             rotation=(0, 0, math.pi / 8), major_segments=8, minor_segments=4)
    fl.cylinder("socket", 0.13, dais_top, dais_top + 0.045, brass, sides=12, r_top=0.1, bevel=0.008, segments=1)
    fl.cylinder("stem", 0.045, dais_top + 0.045, dais_top + 0.1, m("role_luminous"), sides=12)
    fl.torus("coil", 0.065, 0.013, (0, 0, dais_top + 0.075), bright, major_segments=12, minor_segments=6)

    # Lectern console on the table side: a sloped amber terminal over a brass-keyed shelf.
    housing = [(0.40, 1.04), (0.55, 1.05), (0.60, 1.12), (0.595, 1.19), (0.445, 1.43), (0.40, 1.43)]
    slab("lectern", housing, 0.34, -math.pi / 2, graphite, bevel=0.012)
    shelf = [(0.56, 1.10), (0.685, 1.115), (0.69, 1.145), (0.598, 1.185), (0.56, 1.185)]
    slab("keyshelf", shelf, 0.3, -math.pi / 2, dark, bevel=0.01)

    def plane(start, end):
        """Frame of the sloped face from `start` to `end` (radial, z) on the -Y side."""
        slope = math.atan2(end[1] - start[1], start[0] - end[0])
        mid = (0.0, -(start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        up = (0.0, math.cos(slope), math.sin(slope))
        normal = (0.0, -math.sin(slope), math.cos(slope))
        at = lambda u, v, lift: on_plane(mid, (1.0, 0.0, 0.0), up, normal, u, v, lift)  # noqa: E731
        return at, (-(math.pi / 2 - slope), 0, 0), math.hypot(end[0] - start[0], end[1] - start[1])

    at, face, length = plane(housing[3], housing[4])
    fl.box("bezel", (0.3, 0.024, length - 0.03), at(0, 0, 0.004), brass, rotation=face, bevel=0.008)
    fl.box("screen", (0.25, 0.02, length - 0.08), at(0, 0.004, 0.012), phosphor, rotation=face, bevel=0.004)
    for row, (v, width) in enumerate(((0.068, 0.13), (0.038, 0.08), (0.008, 0.11), (-0.022, 0.05))):
        fl.box(f"text{row}", (width, 0.012, 0.015), at(-0.1 + width / 2, v, 0.022), amber, rotation=face, bevel=0)
    # Signal-strength bars in the corner: this end of the line is listening.
    for k in range(4):
        height = 0.02 + 0.015 * k
        fl.box(f"bar{k}", (0.012, 0.012, height), at(0.058 + 0.016 * k, -0.01 + height / 2, 0.022), amber,
               rotation=face, bevel=0)
    # Prompt chevron and a blinking cursor on the last line.
    for k, sign in enumerate((1, -1)):
        spin = Matrix.Rotation(face[0], 4, "X") @ Matrix.Rotation(sign * math.radians(40), 4, "Y")
        fl.box(f"chevron{k}", (0.028, 0.012, 0.011), at(-0.093, -0.06 + sign * 0.0085, 0.022), amber,
               rotation=spin.to_euler("XYZ"), bevel=0)
    cursor = fl.box("cursor", (0.028, 0.012, 0.018), at(-0.058, -0.062, 0.022), amber, rotation=face, bevel=0)
    fl.hook(cursor, "blinker", speed=4.2, phase=0.0, base=1.0)
    # Two rows of brass typewriter keys on the shelf.
    at, face, length = plane(shelf[2], shelf[3])
    for row, v in enumerate((0.022, -0.02)):
        for col in range(7):
            u = (col - 3) * 0.038 + (0.012 if row else 0)
            fl.box(f"key{row}_{col}", (0.03, 0.016, 0.026), at(u, v, 0.006), bright, rotation=face, bevel=0)

    # A network port on each flank: a lancet plate with a brass-framed RJ45 jack and link/activity LEDs.
    for i, a in enumerate((0.0, math.pi)):
        z = 1.2
        r = ap(z)
        ox, oy = math.cos(a), math.sin(a)
        rot = (-tilt, 0, a + math.pi / 2)

        def at(d, along=0.0, dz=0.0):
            reach = r + d - dz * math.tan(tilt)
            return (ox * reach - oy * along, oy * reach + ox * along, z + dz)

        panel(f"lancet{i}", [(-0.125, -0.14), (0.125, -0.14), (0.125, 0.09), (0.0, 0.17), (-0.125, 0.09)], 0.03,
              at(0.0), rot, graphite, bevel=0.008, segments=1)
        fl.box(f"nic{i}", (0.19, 0.03, 0.17), at(0.012, 0, -0.02), brass, rotation=rot, bevel=0.01)
        fl.box(f"jack{i}", (0.13, 0.02, 0.085), at(0.024, 0, -0.03), rubber, rotation=rot, bevel=0)
        fl.box(f"latch{i}", (0.05, 0.02, 0.03), at(0.024, 0, -0.085), rubber, rotation=rot, bevel=0)
        fl.box(f"pins{i}", (0.1, 0.01, 0.014), at(0.03, 0, 0.0), bright, rotation=rot, bevel=0)
        fl.box(f"link{i}", (0.035, 0.012, 0.024), at(0.026, -0.05, 0.042), green, rotation=rot, bevel=0)
        activity = fl.box(f"activity{i}", (0.035, 0.012, 0.024), at(0.026, 0.05, 0.042), amber, rotation=rot, bevel=0)
        fl.hook(activity, "blinker", speed=5.3 + i * 1.7, phase=i * 2.1, base=0.95)
        fl.box(f"slot{i}", (0.03, 0.02, 0.07), at(0.012, 0, 0.13), m("role_glow_soft"), rotation=rot, bevel=0)

    # The signal orb and its soft aura.
    orb = geo_orb("orb", ORB_R, (0, 0, ORB_Z), m("role_luminous"))
    fl.hook(orb, "floater")
    aura = geo_orb("orb_aura", ORB_R + 0.05, (0, 0, ORB_Z), m("role_glow_faint"))
    fl.parent(aura, orb)

    # Halo: a dashed ring (eight dashes for the octagon), so its turn reads.
    halo = fl.torus("halo", HALO_R, HALO_TUBE, (0, 0, HALO_Z), m("role_glow"), gaps=8, gap_fraction=0.3,
                    major_segments=40, minor_segments=8)
    fl.hook(halo, "spinner", speed=0.4, axis="y")
