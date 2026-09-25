# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Switch: a wide, low 2U rack switch. Two line cards share a brass-bound chassis,
split by a glowing backplane seam; each carries two rows of RJ45 sockets with
flickering link LEDs and a brass uplink cage, and a glowing stacking cable loops
between the cages. Brass rack ears with D-handles flank the faceplate. The vented
top deck carries the network-diagram switch symbol: four glowing arrows, two each way."""

import math
import random

import bmesh
from mathutils import Matrix, Vector

from lib import faultline as fl

# Chassis: wide and low, two line cards stacked in one 2U frame.
WIDTH, DEPTH = 1.1, 0.6
HALF_W, FRONT, BACK = WIDTH / 2, -DEPTH / 2, DEPTH / 2
FOOT_TOP = fl.PLINTH_TOP + 0.04
UNIT_H, SEAM = 0.18, 0.016
UNITS = (FOOT_TOP + UNIT_H / 2, FOOT_TOP + UNIT_H * 1.5 + SEAM)  # centre z of each line card
CHASSIS_TOP = FOOT_TOP + UNIT_H * 2 + SEAM

# Faceplate
PLATE_Y = FRONT - 0.006  # faceplate front surface
PORT_PITCH, PORT_W, PORT_H = 0.068, 0.05, 0.032
BAR, MID_BAR = 0.012, 0.012
CAGE_FRONT = PLATE_Y - 0.016  # port housings stand proud of the faceplate
LED = (0.042, 0.012, 0.021)


def _cubes(name, boxes, mat):
    """One mesh made of several unbevelled boxes: (size, centre) pairs."""
    bm = bmesh.new()
    for size, centre in boxes:
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0)))
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=False)


def _rounded(corners, radius, steps=4):
    """Polyline through `corners`, each inner corner replaced by an arc of `radius`."""
    points = [Vector(corners[0])]
    for i in range(1, len(corners) - 1):
        p0, p1, p2 = (Vector(c) for c in corners[i - 1 : i + 2])
        d0, d1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        turn = d0.angle(d1)
        if turn < 1e-4:
            points.append(p1)
            continue
        cut = radius * math.tan(turn / 2)
        a, b = p1 - d0 * cut, p1 + d1 * cut
        inward = (d1 - d0 * d0.dot(d1)).normalized()
        centre = a + inward * radius
        va, vb = a - centre, b - centre
        points.extend(centre + va.slerp(vb, s / steps).normalized() * radius for s in range(steps + 1))
    points.append(Vector(corners[-1]))
    return points


def _pipe(name, points, radius, mat, sides=8):
    """Sweep a round section along `points` (parallel-transported frames, capped ends)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    normal = (pts[1] - pts[0]).normalized().orthogonal().normalized()
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            tangent = ((pts[i + 1] - p).normalized() + (p - pts[i - 1]).normalized()).normalized()
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal)
        rings.append([bm.verts.new(p + (normal * math.cos(a) + binormal * math.sin(a)) * radius)
                      for a in (math.tau * k / sides for k in range(sides))])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=True, angle=50)


def _stud(name, radius, depth, location, mat, sides=8, taper=0.7):
    """A short cylinder facing -Y (screw head, boss): its crown looks at the camera."""
    obj = fl.cylinder(name, radius, -depth / 2, depth / 2, mat, sides=sides, r_top=radius * taper)
    obj.location = location
    obj.rotation_euler = (math.pi / 2, 0, 0)
    return obj


def _arrow(name, x_tail, x_tip, y, shaft, head_w, head_l, z0, z1, mat):
    """A flat arrow extruded from z0 to z1, pointing along X from x_tail to x_tip."""
    d = 1 if x_tip > x_tail else -1
    xb = x_tip - d * head_l
    outline = [(x_tail, y - shaft / 2), (xb, y - shaft / 2), (xb, y - head_w / 2), (x_tip, y),
               (xb, y + head_w / 2), (xb, y + shaft / 2), (x_tail, y + shaft / 2)]
    bm = bmesh.new()
    low = [bm.verts.new((x, yy, z0)) for x, yy in outline]
    high = [bm.verts.new((x, yy, z1)) for x, yy in outline]
    bm.faces.new(high)
    bm.faces.new(list(reversed(low)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((low[i], low[j], high[j], high[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat), 0, smooth=False)


def _grid(name, x0, cols, pitch, hole_w, zc, hole_h, mid, mat):
    """Port housing: bars around 2 rows x `cols` holes, standing proud of the faceplate."""
    bar_w = pitch - hole_w
    width = cols * pitch + bar_w
    height = hole_h * 2 + mid + BAR * 2
    depth = PLATE_Y - CAGE_FRONT + 0.006
    y = CAGE_FRONT + depth / 2
    boxes = []
    for c in range(cols + 1):
        boxes.append(((bar_w, depth, height), (x0 + c * pitch + bar_w / 2, y, zc)))
    for dz, h in ((height / 2 - BAR / 2, BAR), (0, mid), (-height / 2 + BAR / 2, BAR)):
        boxes.append(((width, depth, h), (x0 + width / 2, y, zc + dz)))
    _cubes(name, boxes, mat)
    return width, height


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    steel, rubber, glow = m("metal_steel"), m("rubber"), m("role_glow")
    z0 = fl.PLINTH_TOP
    mid_z = (FOOT_TOP + CHASSIS_TOP) / 2

    # Foot, two line cards and the glowing backplane seam between them.
    fl.box("foot", (WIDTH - 0.1, DEPTH - 0.08, FOOT_TOP - z0 + 0.01), (0, 0, (z0 + FOOT_TOP) / 2 - 0.005), brass,
           bevel=0.012)
    for u, zc in enumerate(UNITS):
        fl.box(f"card{u}", (WIDTH, DEPTH, UNIT_H), (0, 0, zc), dark, bevel=0.016, segments=2)
    fl.box("seam", (WIDTH - 0.016, DEPTH - 0.016, SEAM + 0.02), (0, 0, FOOT_TOP + UNIT_H + SEAM / 2), glow, bevel=0)

    # Back corners: brass guards run the full height, like an instrument case.
    for side in (-1, 1):
        fl.box(f"guard{side}", (0.05, 0.05, CHASSIS_TOP - FOOT_TOP + 0.01),
               (side * (HALF_W - 0.012), BACK - 0.012, mid_z), brass, bevel=0.01, segments=1)

    # Brass top trim around a dark deck carrying the switch symbol: four glowing arrows, two each way,
    # in softly lit channels, with vent slots at either end.
    cap_top = CHASSIS_TOP + 0.022
    fl.box("cap", (WIDTH + 0.026, DEPTH + 0.026, cap_top - CHASSIS_TOP + 0.01),
           (0, 0, (CHASSIS_TOP + cap_top) / 2 - 0.005), brass, bevel=0.01)
    deck_w, deck_d, deck_top = WIDTH - 0.03, DEPTH - 0.034, cap_top + 0.024
    fl.box("deck", (deck_w, deck_d, deck_top - cap_top + 0.01), (0, 0, (cap_top + deck_top) / 2 - 0.005), graphite,
           bevel=0.012, segments=2)
    for i, y in enumerate((-0.15, -0.05, 0.05, 0.15)):
        d = 1 if i % 2 else -1
        shift = d * 0.03
        tail, tip = -d * 0.31 + shift, d * 0.31 + shift
        _arrow(f"arrow_well{i}", tail - d * 0.014, tip + d * 0.022, y, 0.058, 0.108, 0.102, deck_top - 0.004,
               deck_top + 0.002, m("role_glow_soft"))
        _arrow(f"arrow{i}", tail, tip, y, 0.034, 0.08, 0.078, deck_top - 0.002, deck_top + 0.006, glow)

    # Brass corner caps bind the top like an instrument case.
    for sx in (-1, 1):
        for sy in (-1, 1):
            fl.box(f"corner{sx}{sy}", (0.07, 0.07, deck_top - CHASSIS_TOP + 0.03),
                   (sx * (HALF_W + 0.003), sy * (DEPTH / 2 + 0.003), (CHASSIS_TOP + deck_top) / 2 - 0.004), bright,
                   bevel=0.014, segments=2)
    slots = [((0.024, 0.32, 0.01), (side * (0.425 + k * 0.04), 0, deck_top)) for side in (-1, 1) for k in range(3)]
    _cubes("deck_vents", slots, rubber)
    # A brass frame sets the symbol apart from the vents, like the router's bay frames.
    fw, fd, bar = 0.8, 0.47, 0.022
    _cubes("symbol_frame", [((fw, bar, 0.012), (0, sy * (fd - bar) / 2, deck_top + 0.002)) for sy in (-1, 1)]
           + [((bar, fd, 0.012), (sx * (fw - bar) / 2, 0, deck_top + 0.002)) for sx in (-1, 1)], brass)

    # Faceplates: status column, two port banks, the uplink cage.
    leds = {"static": [], "amber": []}
    blink = [[] for _ in range(6)]

    def place(key, centre):
        (blink[key % 6] if isinstance(key, int) else leds[key]).append((LED, centre))

    # A port's link LED: mostly lit, many flickering with traffic, a few idle or amber (PoE).
    traffic = random.Random(5)
    deal = iter(traffic.sample(range(6), 6) * 8)

    def link(centre):
        roll = traffic.random()
        if roll < 0.14:
            return
        if roll < 0.2:
            place("amber", centre)
        elif roll < 0.5:
            place("static", centre)
        else:
            place(next(deal), centre)

    stack_ends = []
    for u, zc in enumerate(UNITS):
        fl.box(f"plate{u}", (WIDTH - 0.06, 0.02, UNIT_H - 0.026), (0, PLATE_Y + 0.012, zc), graphite, bevel=0.006,
               segments=1)
        fl.box(f"window{u}", (WIDTH - 0.09, 0.01, UNIT_H - 0.05), (0.004, PLATE_Y + 0.002, zc), m("glass_smoke"),
               bevel=0.003, segments=1)
        # Two banks of 2 x 4 RJ45 sockets: graphite housings over dark wells, a link LED at each port.
        for bank, x0 in enumerate((-0.37, -0.055)):
            width, height = _grid(f"ports{u}_{bank}", x0, 4, PORT_PITCH, PORT_W, zc, PORT_H, MID_BAR, graphite)
            fl.box(f"wells{u}_{bank}", (width - 0.004, 0.012, height - 0.004), (x0 + width / 2, PLATE_Y - 0.004, zc),
                   rubber, bevel=0)
            for col in range(4):
                x = x0 + col * PORT_PITCH + (PORT_PITCH - PORT_W) + PORT_W / 2
                for row, sign in enumerate((1, -1)):
                    link((x, PLATE_Y - 0.004, zc + sign * (height / 2 + 0.014)))

        # Uplink cage: brass housing, 2 x 2 SFP slots, three modules with brass bail latches.
        x0, pitch, hole = 0.265, 0.1, 0.082
        width, height = _grid(f"sfp{u}", x0, 2, pitch, hole, zc, PORT_H, MID_BAR, brass)
        fl.box(f"sfp_wells{u}", (width - 0.004, 0.012, height - 0.004), (x0 + width / 2, PLATE_Y - 0.004, zc), rubber,
               bevel=0)
        for col in range(2):
            x = x0 + col * pitch + (pitch - hole) + hole / 2
            for row, sign in enumerate((1, -1)):
                z = zc + sign * (MID_BAR / 2 + PORT_H / 2)
                lamp = (x, PLATE_Y - 0.004, zc + sign * (height / 2 + 0.014))
                if (u, col, row) == (0, 0, 1):
                    continue
                if col == 1 and (u, row) in ((1, 0), (0, 1)):
                    # Stacking cable ends: steel boots, the cable itself is swept below.
                    fl.box(f"dac{u}", (0.07, 0.046, 0.028), (x, CAGE_FRONT - 0.016, z), steel, bevel=0.005, segments=1)
                    stack_ends.append(Vector((x, CAGE_FRONT - 0.039, z)))
                    place(next(deal), lamp)
                    continue
                fl.box(f"sfp{u}_{col}_{row}", (0.07, 0.03, 0.024), (x, CAGE_FRONT - 0.004, z), graphite, bevel=0.004,
                       segments=1)
                fl.box(f"sfp_tab{u}_{col}_{row}", (0.034, 0.012, 0.008), (x - 0.012, CAGE_FRONT - 0.022, z - 0.007),
                       bright, bevel=0)
                link(lamp)

        # Status column: a smoked window with a glowing card number, and three status LEDs.
        wx = -0.462
        fl.box(f"badge{u}", (0.058, 0.014, 0.1), (wx, PLATE_Y - 0.004, zc), m("glass_smoke"), bevel=0.004, segments=1)
        w, h, t, yy = 0.026, 0.034, 0.008, PLATE_Y - 0.012
        if u == 0:  # "1"
            seg = [((t, 0.004, h + t), (wx + w / 2 - t / 2, yy, zc + h / 2)),
                   ((t, 0.004, h + t), (wx + w / 2 - t / 2, yy, zc - h / 2))]
        else:  # "2"
            seg = [((w, 0.004, t), (wx, yy, zc + h)), ((t, 0.004, h), (wx + w / 2 - t / 2, yy, zc + h / 2)),
                   ((w, 0.004, t), (wx, yy, zc)), ((t, 0.004, h), (wx - w / 2 + t / 2, yy, zc - h / 2)),
                   ((w, 0.004, t), (wx, yy, zc - h))]
        _cubes(f"digit{u}", seg, glow)
        # System, stack and alarm (the old body's amber LED lives on as card 1's alarm).
        for i, key in enumerate(("static", next(deal), "amber" if u == 0 else next(deal))):
            place(key, (-0.405, PLATE_Y - 0.004, zc + (1 - i) * 0.04))

    # The stacking cable: a glowing loop from the upper card's uplink down into the lower card's.
    top_end, low_end = sorted(stack_ends, key=lambda v: -v.z)
    reach, bulge = Vector((0.012, -0.11, 0)), Vector((0.03, 0, 0))
    p0, p1, p2, p3 = top_end, top_end + reach + bulge, low_end + reach + bulge, low_end
    curve = [p0 * (1 - t) ** 3 + p1 * 3 * (1 - t) ** 2 * t + p2 * 3 * (1 - t) * t ** 2 + p3 * t ** 3
             for t in (i / 12 for i in range(13))]
    _pipe("stack_loop", curve, 0.016, m("role_luminous"), sides=8)

    # Rack ears: brass flanges spanning both cards, four screws each, with a D-handle between them.
    for side in (-1, 1):
        ex = side * (HALF_W + 0.027)
        fl.box(f"ear{side}", (0.062, 0.02, CHASSIS_TOP - FOOT_TOP - 0.004), (ex, FRONT - 0.003, mid_z), brass,
               bevel=0.008, segments=2)
        fl.box(f"ear_wrap{side}", (0.014, 0.14, CHASSIS_TOP - FOOT_TOP - 0.03),
               (side * (HALF_W + 0.007), FRONT + 0.07, mid_z), brass, bevel=0.005, segments=1)
        for zc in UNITS:
            for dz in (-0.058, 0.058):
                _stud(f"screw{side}_{zc:.2f}_{dz}", 0.012, 0.012, (ex, FRONT - 0.018, zc + dz), bright)
        z_lo, z_hi = UNITS[0] - 0.012, UNITS[1] + 0.012
        y_ear, y_grip = FRONT - 0.012, FRONT - 0.064
        path = _rounded([(ex, y_ear, z_lo), (ex, y_grip, z_lo), (ex, y_grip, z_hi), (ex, y_ear, z_hi)], 0.032, steps=4)
        _pipe(f"handle{side}", path, 0.023, bright, sides=8)
        for z in (z_lo, z_hi):
            _stud(f"boss{side}_{z:.2f}", 0.027, 0.012, (ex, FRONT - 0.016, z), brass, sides=10, taper=0.8)

    # Rear (rarely seen, kept cheap): two power supplies and a fan tray behind brass guards.
    for i, x in enumerate((-0.28, 0.02)):
        fl.box(f"psu{i}", (0.26, 0.02, UNIT_H - 0.05), (x, BACK + 0.006, UNITS[0]), graphite, bevel=0.005, segments=1)
        fl.box(f"psu_grille{i}", (0.09, 0.01, 0.09), (x - 0.06, BACK + 0.017, UNITS[0]), rubber, bevel=0)
    for i, x in enumerate((-0.3, -0.1, 0.1)):
        fan = fl.cylinder(f"fan{i}", 0.062, -0.006, 0.006, rubber, sides=12)
        fan.location, fan.rotation_euler = (x, BACK + 0.004, UNITS[1]), (math.pi / 2, 0, 0)
        _cubes(f"fan_guard{i}", [((0.13, 0.008, 0.016), (x, BACK + 0.012, UNITS[1])),
                                 ((0.016, 0.008, 0.13), (x, BACK + 0.012, UNITS[1]))], brass)

    # Side vents: graphite louvres over a softly glowing well on each card.
    for side in (-1, 1):
        for zc in UNITS:
            fl.box(f"side_vent{side}_{zc:.2f}", (0.006, 0.3, 0.09), (side * (HALF_W + 0.002), 0.04, zc),
                   m("role_glow_soft"), bevel=0)
            _cubes(f"side_louvres{side}_{zc:.2f}",
                   [((0.012, 0.024, 0.1), (side * (HALF_W + 0.004), -0.08 + k * 0.06, zc)) for k in range(5)], graphite)

    # Lights: steady link LEDs merge with the static body; blinkers are grouped so they cost one draw each.
    _cubes("links", leds["static"], glow)
    fl.hook(_cubes("amber_links", leds["amber"], m("glow_amber")), "blinker", speed=0.9, phase=2.2, base=0.95)
    for i, group in enumerate(blink):
        if group:
            obj = _cubes(f"activity{i}", group, glow)
            fl.hook(obj, "blinker", speed=(1.1, 1.7, 2.4, 3.1, 3.9, 4.7)[i], phase=i * 1.7, base=0.95)
