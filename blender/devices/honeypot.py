"""Honeypot: a lure. A geodesic honeycomb hive, every cell glowing with honey,
sits in a brass-lipped cup held by six brass claws. Honey overflows the cup and
drips down a dark pedestal whose front carries a fake login port (a terminal
prompt and an open RJ45 jack). A beacon blinks on its mast, and a nectar drop
floats above the hive inside a turning hex lure ring, circled by the motes it
has already caught."""

import math
import random
from collections import defaultdict

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

# Hive: an ellipsoid of honeycomb cells.
HIVE_Z, HIVE_R, HIVE_H = 1.66, 0.47, 0.38
# Pedestal (hexagonal, tapering), a brass band, then the cup that holds the hive.
PED_Z0, PED_Z1 = 1.01, 1.28
PED_R0, PED_R1 = 0.57, 0.525
BAND_Z1 = PED_Z1 + 0.045
CUP_R0, CUP_R1, CUP_Z1 = 0.45, 0.385, 1.42
FRONT = -math.pi / 2
# bmesh create_cone starts on +Y, so a hexagon needs a 30° turn to put a flat face on -Y.
# (fl.prism's default assumes +X and leaves a corner facing the camera.)
HEX = math.pi / 6


# ---------------------------------------------------------------------------
# Role-local geometry helpers


def mesh_object(name, verts, faces, mat, smooth=True, angle=30):
    bm = bmesh.new()
    bverts = [bm.verts.new(v) for v in verts]
    for face in faces:
        bm.faces.new([bverts[i] for i in face])
    bm.normal_update()
    obj = fl.from_bmesh(name, bm, mat)
    return fl.finish(obj, 0, smooth=smooth, angle=angle)


def oriented(face, verts, want):
    """Wind `face` so its normal points along `want`."""
    a, b, c = (verts[i] for i in face[:3])
    return face if (b - a).cross(c - a).dot(want) >= 0 else list(reversed(face))


def geodesic(freq):
    """Frequency-`freq` geodesic sphere (unit radius) with a vertex on each pole."""
    s = 1 / math.sqrt(5)
    base = [Vector((0, 0, 1)), Vector((0, 0, -1))]
    base += [Vector((2 * s * math.cos(k * math.tau / 5), 2 * s * math.sin(k * math.tau / 5), s)) for k in range(5)]
    base += [Vector((2 * s * math.cos((k + 0.5) * math.tau / 5), 2 * s * math.sin((k + 0.5) * math.tau / 5), -s)) for k in range(5)]
    faces = []
    for k in range(5):
        k1 = (k + 1) % 5
        faces += [(0, 2 + k, 2 + k1), (2 + k, 7 + k, 2 + k1), (2 + k1, 7 + k, 7 + k1), (1, 7 + k1, 7 + k)]
    points, index, tris = [], {}, []

    def vid(p):
        p = p.normalized()
        key = (round(p.x, 4), round(p.y, 4), round(p.z, 4))
        if key not in index:
            index[key] = len(points)
            points.append(p)
        return index[key]

    for a, b, c in faces:
        A, B, C = base[a], base[b], base[c]
        grid = {}
        for i in range(freq + 1):
            for j in range(freq + 1 - i):
                grid[i, j] = vid(A + (B - A) * (i / freq) + (C - A) * (j / freq))
        for i in range(freq):
            for j in range(freq - i):
                tris.append((grid[i, j], grid[i + 1, j], grid[i, j + 1]))
                if i + j < freq - 1:
                    tris.append((grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))
    return points, tris


def honeycomb_cells(freq, turn):
    """Dual of the geodesic sphere: hexagonal cells (and 12 pentagons) on the unit sphere.
    Returns (corner points, [(cell centre, [corner indices in order])])."""
    points, tris = geodesic(freq)
    rot = Matrix.Rotation(turn, 3, "Z")
    points = [rot @ p for p in points]
    corners = [((points[a] + points[b] + points[c]) / 3).normalized() for a, b, c in tris]
    around = defaultdict(list)
    for t, tri in enumerate(tris):
        for v in tri:
            around[v].append(t)
    cells = []
    for v, ts in around.items():
        n = points[v]
        ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
        e1 = n.cross(ref).normalized()
        e2 = n.cross(e1)
        ts.sort(key=lambda t: math.atan2(corners[t].dot(e2), corners[t].dot(e1)))
        cells.append((n, ts))
    return corners, cells


def hive_point(p, lift=0.0):
    """Unit-sphere direction -> point on the hive ellipsoid, `lift` above its surface."""
    return Vector((p.x * (HIVE_R + lift), p.y * (HIVE_R + lift), HIVE_Z + p.z * (HIVE_H + lift)))


def hive_normal(p):
    return Vector((p.x / HIVE_R, p.y / HIVE_R, p.z / HIVE_H)).normalized()


def build_hive(m):
    """Brass lattice with recessed cells; each cell floor is a pool of lit honey."""
    corners, cells = honeycomb_cells(3, turn=-math.pi / 2 + math.pi / 5)
    rng = random.Random(11)
    lattice_v, lattice_f = [], []
    corner_index = {}

    def shared(t):
        if t not in corner_index:
            corner_index[t] = len(lattice_v)
            lattice_v.append(hive_point(corners[t]))
        return corner_index[t]

    floors = defaultdict(lambda: ([], []))  # material key -> (verts, faces)
    bar = 0.015  # corner inset; the bars between cells come out about twice this wide
    for n, ts in cells:
        sides = len(ts)
        if hive_point(n).z < CUP_Z1 - 0.03 or n.z > 0.99:
            continue  # hidden in the cup, or under the finial
        normal = hive_normal(n)
        outer = [shared(t) for t in ts]
        centre = sum((lattice_v[i] for i in outer), Vector()) / sides
        inner = []
        for i in outer:
            p = lattice_v[i]
            inner.append(len(lattice_v))
            lattice_v.append(p + (centre - p).normalized() * bar)
        depth = rng.uniform(0.026, 0.05)
        floor_c = centre - normal * depth
        bottom = []
        for i in inner:
            bottom.append(len(lattice_v))
            lattice_v.append(floor_c + (lattice_v[i] - centre) * 0.86)
        for k in range(sides):
            k1 = (k + 1) % sides
            lattice_f.append(oriented([outer[k], outer[k1], inner[k1], inner[k]], lattice_v, normal))
            wall_mid = (lattice_v[inner[k]] + lattice_v[bottom[k1]]) / 2
            toward_axis = (floor_c - wall_mid) - normal * (floor_c - wall_mid).dot(normal)
            lattice_f.append(oriented([inner[k], inner[k1], bottom[k1], bottom[k]], lattice_v, toward_axis))
        # Brighter honey gathers toward the crown and the camera side.
        warm = 0.2 + 0.4 * max(0.0, n.z) + 0.25 * max(0.0, -n.y)
        key = "honey_hot" if rng.random() < warm * 0.6 else "honey"
        fv, ff = floors[key]
        start = len(fv)
        fv.extend(lattice_v[i] for i in bottom)
        ff.append(oriented(list(range(start, start + sides)), fv, normal))

    mesh_object("hive_lattice", lattice_v, lattice_f, m("metal_brass"), smooth=True, angle=40)
    materials = {
        "honey": fl.lit("honey", 0x6A2F06, 0.1, 0.3, 0xE8801C, 1.35),
        "honey_hot": fl.lit("honey_hot", 0x8A4A10, 0.1, 0.26, 0xFFA838, 1.9),
    }
    for key, (fv, ff) in floors.items():
        mesh_object(f"hive_{key}", fv, ff, materials[key], smooth=False)


def claw(name, angle, t0, t1, width, thick, mat, samples=6):
    """A brass strap hugging the hive along its meridian at `angle`, tapering to a point.
    t0/t1 are latitudes (radians) on the unit sphere."""
    verts, faces = [], []
    for s in range(samples):
        f = s / (samples - 1)
        lat = t0 + (t1 - t0) * f
        p = Vector((math.cos(angle) * math.cos(lat), math.sin(angle) * math.cos(lat), math.sin(lat)))
        normal = hive_normal(p)
        side = Vector((-math.sin(angle), math.cos(angle), 0))
        taper = 1.0 if f < 0.6 else 1.0 - 0.4 * (f - 0.6) / 0.4
        w, th = width * taper / 2, thick * (0.55 + 0.45 * taper)
        base = hive_point(p, 0.004)
        verts += [base - side * w, base + side * w, base + side * w + normal * th, base - side * w + normal * th]
    for s in range(samples - 1):
        a, b = s * 4, s * 4 + 4
        for k in range(4):
            k1 = (k + 1) % 4
            quad = [a + k, a + k1, b + k1, b + k]
            mid = sum((verts[i] for i in quad), Vector()) / 4
            ring_mid = sum((verts[i] for i in range(a, a + 8)), Vector()) / 8
            faces.append(oriented(quad, verts, mid - ring_mid))
    last = (samples - 1) * 4
    tip = [last, last + 1, last + 2, last + 3]
    faces.append(oriented(tip, verts, verts[last] - verts[last - 4]))
    obj = mesh_object(name, verts, faces, mat, smooth=True, angle=40)
    # A bead caps the prong, sitting on the strap's outer face.
    p = Vector((math.cos(angle) * math.cos(t1), math.sin(angle) * math.cos(t1), math.sin(t1)))
    r = width * 0.5
    lathe(f"{name}_bead", [(0, -r), (r * 0.8, -r * 0.55), (r, 0), (r * 0.8, r * 0.55), (0, r)], 8,
          hive_point(p, 0.004 + thick * 0.8), mat, angle=60)
    return obj


def lathe(name, profile, sides, location, mat, smooth=True, angle=50):
    """Revolve (radius, z) points about Z; the first and last points sit on the axis."""
    verts, faces, rings = [], [], []
    for r, z in profile:
        if r == 0:
            rings.append([len(verts)])
            verts.append(Vector((0, 0, z)))
        else:
            ids = []
            for s in range(sides):
                a = s * math.tau / sides
                ids.append(len(verts))
                verts.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
            rings.append(ids)
    for lo, hi in zip(rings, rings[1:]):
        for s in range(sides):
            s1 = (s + 1) % sides
            if len(lo) == 1:
                faces.append([lo[0], hi[s], hi[s1]])
            elif len(hi) == 1:
                faces.append([lo[s], hi[0], lo[s1]])
            else:
                faces.append([lo[s], lo[s1], hi[s1], hi[s]])
    out = []
    for f in faces:
        mid = sum((verts[i] for i in f), Vector()) / len(f)
        out.append(oriented(f, verts, Vector((mid.x, mid.y, 0)) + Vector((0, 0, mid.z)) * 0.2))
    obj = mesh_object(name, verts, out, mat, smooth=smooth, angle=angle)
    obj.location = location
    return obj


def apothem(z):
    return (PED_R0 - (PED_R0 - PED_R1) * (z - PED_Z0) / (PED_Z1 - PED_Z0)) * math.cos(math.pi / 6)


TILT = math.atan((PED_R0 - PED_R1) * math.cos(math.pi / 6) / (PED_Z1 - PED_Z0))


def on_face(a, u, z, d=0.0):
    """Point on the pedestal face whose outward normal points along angle `a`;
    `u` runs along the face (to the right when facing it), `d` out of it."""
    r = apothem(z) + d
    return Vector((math.cos(a) * r + math.cos(a + math.pi / 2) * u, math.sin(a) * r + math.sin(a + math.pi / 2) * u, z))


def face_rotation(a, spin=0.0):
    """Rotation for a part built facing -Y: spin in its own plane, lean with the face, turn to `a`."""
    rot = Matrix.Rotation(a + math.pi / 2, 3, "Z") @ Matrix.Rotation(-TILT, 3, "X") @ Matrix.Rotation(spin, 3, "Y")
    return rot.to_euler("XYZ")


def face_box(name, size, a, u, z, d, mat, spin=0.0, bevel=0.0):
    return fl.box(name, size, on_face(a, u, z, d), mat, rotation=face_rotation(a, spin), bevel=bevel)


def drip_coat(name, a, drips, mat, half_width=0.235, z_top=PED_Z1 + 0.004, seed=0):
    """Honey seeping from under the band: a scalloped glowing coat with drips, flat on the face.
    `drips` = [(u, length)]; each drip ends in a round bulb."""
    tongue, fillet, bulb = 0.014, 0.02, 0.021

    def sag(u):
        h = 0.02 + 0.007 * (1 + math.cos(u * 57 + seed))
        for uc, length in drips:
            d = abs(u - uc)
            if d <= tongue:
                h += length
            elif d < tongue + fillet:
                h += length * (1 - (d - tongue) / fillet) ** 2.2
        return h

    us = {round(-half_width + i * (2 * half_width) / 16, 4) for i in range(17)}
    for uc, _ in drips:
        us |= {round(uc + o, 4) for o in (-tongue - fillet, -tongue - fillet * 0.45, -tongue, 0, tongue, tongue + fillet * 0.45, tongue + fillet)}
    us = sorted(u for u in us if -half_width <= u <= half_width)
    d = 0.006
    verts, faces = [], []
    for u in us:
        verts += [on_face(a, u, z_top, d), on_face(a, u, z_top - sag(u), d)]
    outward = Vector((math.cos(a), math.sin(a), 0))
    for i in range(len(us) - 1):
        faces.append(oriented([2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1], verts, outward))
    for uc, length in drips:
        zc = z_top - 0.02 - length - bulb * 0.55
        start = len(verts)
        for k in range(8):
            b = k * math.tau / 8
            verts.append(on_face(a, uc + math.cos(b) * bulb, zc + math.sin(b) * bulb * 1.15, d + 0.001))
        faces.append(oriented(list(range(start, start + 8)), verts, outward))
    return mesh_object(name, verts, faces, mat, smooth=False)


def cup_run(name, angle, width, reach, mat):
    """Honey spilling over the cup lip: a drip running `reach` (0..1) of the way down the
    cup's slope, narrowing to a tongue that ends in a bulb."""
    length = math.hypot(CUP_R0 - CUP_R1, CUP_Z1 - BAND_Z1)
    down = Vector((CUP_R0 - CUP_R1, -(CUP_Z1 - BAND_Z1))) / length  # (dr, dz) per unit of slope
    lift = Vector((-down.y, down.x)) * 0.006  # off the surface, outward-up

    def at(s, t):
        """Lateral arc offset `s`, slope distance `t` below the lip."""
        r = CUP_R1 + 0.014 + down.x * t
        b = angle + s / r
        return Vector((math.cos(b) * (r + lift.x), math.sin(b) * (r + lift.x), CUP_Z1 - 0.004 + down.y * t + lift.y))

    tongue, bulb = width * 0.26, width * 0.36
    end = max(0.03, reach * (length - 0.01) - bulb)
    rows = [(0.0, width / 2), (0.022, tongue * 1.25), (end, tongue)]
    verts, faces = [], []
    for t, half in rows:
        verts += [at(-half, t), at(half, t)]
    out = Vector((math.cos(angle), math.sin(angle), 1.2))
    for i in range(len(rows) - 1):
        faces.append(oriented([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2], verts, out))
    first = len(verts)
    for k in range(8):
        b = k * math.tau / 8
        verts.append(at(math.cos(b) * bulb, end + math.sin(b) * bulb * 1.1))
    faces.append(oriented(list(range(first, first + 8)), verts, out))
    return mesh_object(name, verts, faces, mat, smooth=False)


# ---------------------------------------------------------------------------


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    honey_glow = m("role_glow")
    z0 = fl.PLINTH_TOP

    # Foot, pedestal, brass band and the cup that cradles the hive.
    fl.prism("foot", 6, 0.62, 0.6, z0, PED_Z0, brass, rotation_z=HEX, bevel=0.012)
    fl.prism("pedestal", 6, PED_R0, PED_R1, PED_Z0, PED_Z1, dark, rotation_z=HEX, bevel=0.02, segments=2)
    for i in range(6):
        a = FRONT + math.pi / 6 + i * math.pi / 3
        r = (PED_R0 + PED_R1) / 2 + 0.004
        rib = fl.box(f"rib{i}", (0.05, 0.05, PED_Z1 - PED_Z0 - 0.02), (math.cos(a) * r, math.sin(a) * r, (PED_Z0 + PED_Z1) / 2),
                     graphite, rotation=(0, 0, a + math.pi / 2), bevel=0.01, segments=1)
        rib.rotation_euler = (Matrix.Rotation(a + math.pi / 2, 3, "Z") @ Matrix.Rotation(-TILT / math.cos(math.pi / 6), 3, "X")).to_euler("XYZ")
    fl.prism("band", 6, 0.55, 0.545, PED_Z1, BAND_Z1, brass, rotation_z=HEX, bevel=0.012, segments=1)
    fl.cylinder("cup", CUP_R0, BAND_Z1 - 0.005, CUP_Z1, graphite, sides=24, r_top=CUP_R1, bevel=0.01, segments=1)
    fl.torus("cup_lip", CUP_R1, 0.018, (0, 0, CUP_Z1), bright, major_segments=24, minor_segments=5)
    # Honey pooled where the hive meets the cup, spilling over the lip.
    fl.torus("meniscus", 0.36, 0.028, (0, 0, CUP_Z1 + 0.004), honey_glow, major_segments=24, minor_segments=3)
    spills = ((FRONT + 0.12, 0.07, 0.95), (FRONT + 0.78, 0.055, 0.55), (FRONT - 0.62, 0.06, 0.8), (FRONT - 1.35, 0.05, 0.45),
              (FRONT + 1.5, 0.05, 0.7), (FRONT + 2.35, 0.055, 0.9), (FRONT - 2.3, 0.05, 0.6))
    for i, (angle, width, reach) in enumerate(spills):
        cup_run(f"cup_run{i}", angle, width, reach, honey_glow)

    build_hive(m)
    # Six brass claws grip the hive from the cup, leaving the front open.
    lat0 = math.asin((CUP_Z1 - 0.02 - HIVE_Z) / HIVE_H)
    lat1 = math.asin((1.86 - HIVE_Z) / HIVE_H)
    for i in range(6):
        claw(f"claw{i}", FRONT + math.pi / 6 + i * math.pi / 3, lat0, lat1, 0.05, 0.026, bright)
    # Finial: a brass boss on the crown of the hive.
    top = HIVE_Z + HIVE_H
    fl.prism("finial", 6, 0.1, 0.07, top - 0.03, top + 0.02, bright, rotation_z=HEX, bevel=0.01, segments=1)
    fl.prism("finial_pin", 6, 0.035, 0.012, top + 0.02, top + 0.06, bright, rotation_z=HEX, bevel=0.004, segments=1)

    # Honey seeping from under the band and dripping down the pedestal.
    coats = {
        FRONT: [],
        FRONT + math.pi / 3: [(-0.13, 0.16), (0.03, 0.06), (0.15, 0.11)],
        FRONT - math.pi / 3: [(-0.14, 0.09), (0.0, 0.18), (0.13, 0.05)],
        FRONT + 2 * math.pi / 3: [(-0.05, 0.12)],
        FRONT - 2 * math.pi / 3: [(0.08, 0.1)],
    }
    for i, (a, drips) in enumerate(coats.items()):
        drip_coat(f"coat{i}", a, drips, honey_glow, seed=i * 1.7)

    # Login port on the front face: a terminal prompt beside an open RJ45 jack.
    zp = 1.14
    face_box("port_bezel", (0.4, 0.024, 0.18), FRONT, 0, zp, 0.006, brass, bevel=0.01)
    face_box("port_screen", (0.22, 0.02, 0.135), FRONT, -0.075, zp, 0.016, m("glass_smoke"), bevel=0.006)
    for j, (u, w) in enumerate(((-0.155, 0.05), (-0.1, 0.04), (-0.052, 0.03))):
        face_box(f"prompt_text{j}", (w, 0.01, 0.014), FRONT, u + w / 2 - 0.02, zp + 0.035, 0.026, honey_glow)
    for j, spin in enumerate((math.radians(40), -math.radians(40))):
        face_box(f"prompt_chevron{j}", (0.034, 0.01, 0.013), FRONT, -0.152, zp - 0.02 + (0.011 if j == 0 else -0.011), 0.026, honey_glow, spin=spin)
    cursor = face_box("prompt_cursor", (0.042, 0.01, 0.015), FRONT, -0.1, zp - 0.036, 0.026, m("glow_amber"))
    fl.hook(cursor, "blinker", speed=3.4, phase=0.0, base=1.0)
    face_box("jack_socket", (0.115, 0.02, 0.12), FRONT, 0.105, zp - 0.006, 0.016, graphite, bevel=0.006)
    face_box("jack_open", (0.08, 0.01, 0.05), FRONT, 0.105, zp + 0.004, 0.026, honey_glow)
    face_box("jack_key", (0.038, 0.01, 0.022), FRONT, 0.105, zp - 0.031, 0.026, honey_glow)
    face_box("jack_act", (0.022, 0.01, 0.016), FRONT, 0.14, zp + 0.043, 0.026, honey_glow)
    link = face_box("jack_link", (0.022, 0.01, 0.016), FRONT, 0.07, zp + 0.043, 0.026, m("glow_green"))
    fl.hook(link, "blinker", speed=6.3, phase=0.4, base=1.0)

    # Antenna mast with a blinking beacon, rising from the band between two claws.
    am = math.radians(26)
    base = Vector((math.cos(am) * 0.49, math.sin(am) * 0.49, BAND_Z1 - 0.01))
    tip = Vector((math.cos(am) * 0.6, math.sin(am) * 0.6, 2.25))
    axis = tip - base
    lean = axis.to_track_quat("Z", "Y").to_euler()
    fl.cylinder("mast_socket", 0.042, BAND_Z1 - 0.02, BAND_Z1 + 0.06, graphite, xy=base.xy, sides=10, r_top=0.032, bevel=0.006, segments=1)
    mast = fl.cylinder("mast", 0.02, -axis.length / 2, axis.length / 2, bright, sides=8)
    mast.location = (base + tip) / 2
    mast.rotation_euler = lean
    for j, t in enumerate((0.42, 0.78)):
        collar = fl.cylinder(f"mast_collar{j}", 0.031, -0.018, 0.018, brass, sides=8)
        collar.location = base + axis * t
        collar.rotation_euler = lean
    fl.cylinder("beacon_cup", 0.03, tip.z - 0.03, tip.z + 0.03, graphite, xy=tip.xy, sides=10, r_top=0.052)
    lamp_at = (tip.x, tip.y, tip.z + 0.075)
    lamp = fl.sphere("beacon", 0.056, lamp_at, m("glow_ember"), segments=10, rings=6)
    fl.hook(lamp, "blinker", speed=3.1, phase=0.0, base=1.0)
    halo = fl.sphere("beacon_halo", 0.1, lamp_at, fl.unlit("glow_beacon_halo", 0xFF9A3C, 0.3), segments=10, rings=6)
    fl.hook(halo, "blinker", speed=3.1, phase=0.0, base=0.3)
    fl.torus("beacon_cage", 0.062, 0.015, lamp_at, bright, major_segments=12, minor_segments=5)
    fl.cylinder("beacon_cap", 0.056, tip.z + 0.125, tip.z + 0.15, graphite, xy=tip.xy, sides=10, r_top=0.012)

    # Bait: a faceted nectar drop floating over the hive inside a soft glow.
    orb_z = 2.22
    drop = lathe("bait", [(0, -0.12), (0.075, -0.105), (0.12, -0.05), (0.13, 0.0), (0.105, 0.06), (0.058, 0.12), (0, 0.18)],
                 8, (0, 0, orb_z), fl.lit("nectar", 0xA86A1C, 0.1, 0.22, 0xFFB84A, 3.0), smooth=False)
    fl.hook(drop, "floater")
    aura = fl.sphere("bait_aura", 0.2, (0, 0, orb_z + 0.02), m("role_glow_faint"), segments=12, rings=8)
    fl.parent(aura, drop)

    # Lure ring: one honeycomb cell outline, turning, with caught motes on three corners.
    ring_z = orb_z - 0.03
    ring = fl.torus("lure", 0.27, 0.015, (0, 0, ring_z), honey_glow, major_segments=6, minor_segments=6)
    fl.hook(ring, "spinner", speed=0.6, axis="y")
    verts, faces = [], []
    for j in range(3):
        a = j * math.tau / 3
        c = Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, ring_z + 0.03))
        start = len(verts)
        r = 0.032
        verts += [c + Vector((0, 0, r * 1.3)), c - Vector((0, 0, r * 1.3))]
        verts += [c + Vector((math.cos(b) * r, math.sin(b) * r, 0)) for b in (a, a + math.pi / 2, a + math.pi, a + 3 * math.pi / 2)]
        for k in range(4):
            e0, e1 = start + 2 + k, start + 2 + (k + 1) % 4
            for pole in (start, start + 1):
                tri = [e0, e1, pole]
                faces.append(oriented(tri, verts, sum((verts[i] for i in tri), Vector()) / 3 - c))
    motes = mesh_object("motes", verts, faces, m("glow_white"), smooth=False)
    fl.parent(motes, ring)
