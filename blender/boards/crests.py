"""Leader crests: what a leader brings to its stage's board (boards/kit.py), one GLB per leader.

    crest    (slot "crest")  the leader's sigil on the far rail's mount, behind which it stands
    finial   (slot "finial") the sigil again, smaller, on the two near corner blocks (where the
                             camera sees it large), and a low finial on each far one

The stage board's own emblem and beacons give way to them (src/three/board.ts), and the board's
accent lights take the leader's colour. Materials are the board's by name (board_steel,
board_trim, board_trim_bright take the stage's metal) plus accent_* in the leader's colour, so one
crest dresses any stage. Each sigil stays within 1.7 x 0.8 on the mount (1.16 x 0.55 at the near
corners); the far finials within 0.28 of their block's top.

Motif families (shared shapes, each leader its own arrangement):
    maw leech · hook wraith · halo prophet · coil serpent, blight · wing moth · gate sentinel, marshal
    gear colossus, foreman · web weaver · reactor storm, demolition · shard widow · bell choir
    blade reaver · pod nest
"""

import math

from mathutils import Matrix, Vector

from lib import faultline as fl

from . import kit

MOUNT = (0, kit.CREST_Y - 0.2, kit.RAIL_Z + 0.08)  # the front edge of the far rail's crest mount
# Finials are drawn for a 0.34 envelope: larger on the near blocks (in full view beside the hand),
# smaller on the far ones (under the portraits).
NEAR_SCALE, FAR_SCALE = 1.35, 0.8
NEAR_SIGIL = 0.68
# Preview colours (World.ts uses the hostile's colour from src/core/enemies.ts).
COLORS = {
    "leech": 0x6EE4D4, "wraith": 0xAB8CFF, "prophet": 0xE49B72, "serpent": 0x73C9A3, "moth": 0x91D2E4, "sentinel": 0xFFAD79,
    "colossus": 0xD9B079, "weaver": 0xE3BD70, "storm": 0x87B5FF, "widow": 0xBBA0E8, "marshal": 0xA6C5E7, "choir": 0xCF9FE7,
    "reaver": 0xEA837B, "foreman": 0xD9A45C, "nest": 0xD46FC8, "demolition": 0xF0725E, "blight": 0xE8874A,
}


def _face(origin):
    return kit.Face(origin, (1, 0, 0), (0, 0, 1), (0, -1, 0))


def _arc(cu, cw, r, a0, a1, steps=12):
    return [(cu + math.cos(a0 + (a1 - a0) * k / steps) * r, cw + math.sin(a0 + (a1 - a0) * k / steps) * r) for k in range(steps + 1)]


def _crescent(cu, cw, r, thickness, a0, a1, steps=12):
    """A blade: the outer arc and an inner arc offset toward its hollow, meeting at both tips."""
    outer = _arc(cu, cw, r, a0, a1, steps)
    mid = (a0 + a1) / 2
    inner = _arc(cu + math.cos(mid) * thickness, cw + math.sin(mid) * thickness, r, a1, a0, steps)[1:-1]
    return outer + inner


def _scaled(points, k, centre):
    return [(centre[0] + (u - centre[0]) * k, centre[1] + (w - centre[1]) * k) for u, w in points]


def _polygon(cu, cw, r, sides, start=math.pi / 2):
    return [(cu + math.cos(start + math.tau * k / sides) * r, cw + math.sin(start + math.tau * k / sides) * r) for k in range(sides)]


def _lens(cu, cw, width, height, steps=10):
    """An eye / leaf: two arcs meeting at the ends."""
    half = width / 2
    r = (half * half + height * height / 4) / height
    a = math.asin(half / r)
    top = [(cu + math.sin(t) * r, cw - (r - height / 2) + math.cos(t) * r) for t in (-a + 2 * a * k / steps for k in range(steps + 1))]
    bottom = [(u, 2 * cw - w) for u, w in reversed(top[1:-1])]
    return top + bottom


def _bars(face, name, points, thickness, depth, mat, h=0.0, closed=False):
    pairs = list(zip(points, points[1:])) + ([(points[-1], points[0])] if closed else [])
    return [face.bar(f"{name}{i}", a, b, thickness, depth, mat, h) for i, (a, b) in enumerate(pairs)]


def _spin(parts, name, centre, speed):
    """Merge `parts` onto a spinner empty at `centre` turning about the face normal (three.js z)."""
    holder = fl.hook(fl.empty(name, centre), "spinner", speed=speed, axis="z")
    fl.merge_onto(holder, parts)
    return holder


# ---------------------------------------------------------------------------
# Sigils: each takes the palette and the mount's face, returns (static parts, spinners)


def leech(p, f):
    parts = [f.disc("plate", 0, 0.34, 0.3, 0.05, p["steel"], sides=20),
             f.ring("maw", 0, 0.34, 0.3, 0.04, p["trim"], h=0.05, segments=32),
             f.disc("gullet", 0, 0.34, 0.11, 0.04, p["accent_lum"], h=0.03, sides=16)]
    for k in range(10):
        a = math.tau * k / 10
        tooth = [(math.cos(a - 0.16) * 0.27, 0.34 + math.sin(a - 0.16) * 0.27), (math.cos(a) * 0.13, 0.34 + math.sin(a) * 0.13),
                 (math.cos(a + 0.16) * 0.27, 0.34 + math.sin(a + 0.16) * 0.27)]
        parts.append(f.shape(f"tooth{k}", [tooth], 0.03, p["bright"], h=0.04))
    for s in (-1, 1):
        path = [f.at(s * 0.29, 0.3, 0.03), f.at(s * 0.48, 0.28, 0.03), f.at(s * 0.62, 0.14, 0.03), f.at(s * 0.66, 0.0, 0.03)]
        parts.append(fl.sweep(f"siphon{s}", path, 0.035, p["trim"], sides=6))
        parts.append(fl.sphere(f"siphon_bulb{s}", 0.06, f.at(s * 0.66, 0.05, 0.03), p["accent_lum"], segments=10, rings=6))
    return parts, []


def leech_finial(p, f, s):
    return [fl.cylinder("stem", 0.05 * s, *_z(f, 0, 0.12 * s), p["trim"], xy=_xy(f), sides=8),
            fl.sphere("bulb", 0.1 * s, f.at(0, 0.2 * s), p["accent_lum"], segments=10, rings=6),
            fl.torus("collar", 0.08 * s, 0.022, f.at(0, 0.12 * s), p["bright"], major_segments=16, minor_segments=5)]


def wraith(p, f):
    # A pointed hood: straight sides, then two arcs meeting at the apex.
    outer = [(-0.26, 0.0), (0.26, 0.0)] + _arc(-0.26, 0.22, 0.52, 0, math.radians(60), 6) + \
        _arc(0.26, 0.22, 0.52, math.radians(120), math.pi, 6)[1:]
    hood = [outer, _scaled(outer, 0.72, (0, 0.28))]
    parts = [f.shape("hood", hood, 0.05, p["steel"]),
             f.box("slit", 0, 0.3, 0.05, 0.3, 0.02, p["accent"], h=0.02, bevel=0)]
    for s in (-1, 1):
        path = [f.at(s * 0.75, 0.05, 0.08), f.at(s * 0.4, 0.2, 0.08), f.at(-s * 0.05, 0.42, 0.08)]
        parts.append(fl.sweep(f"cable{s}", path, 0.035, p["trim"], sides=6))
        parts.append(fl.sphere(f"fray{s}", 0.05, f.at(-s * 0.08, 0.44, 0.08), p["accent_lum"], segments=8, rings=5))
    parts.append(f.shape("sickle", [_crescent(0.0, 0.18, 0.42, 0.12, math.radians(25), math.radians(155))], 0.03, p["bright"], h=0.06))
    return parts, []


def wraith_finial(p, f, s):
    return [f.box("post", 0, 0.06 * s, 0.07, 0.12 * s, 0.07, p["steel"]),
            f.shape("hook", [_crescent(-0.1 * s, 0.14 * s, 0.18 * s, 0.07 * s, math.radians(-10), math.radians(100))], 0.04, p["bright"]),
            fl.sphere("tip", 0.035, f.at(0.07 * s, 0.31 * s, 0.02), p["accent"], segments=8, rings=5)]


def prophet(p, f):
    cw = 0.3
    eye = _lens(0, cw, 0.5, 0.24)
    parts = [f.ring("halo", 0, cw, 0.36, 0.03, p["trim"], segments=40),
             f.shape("lid", [_lens(0, cw, 0.6, 0.3), eye], 0.05, p["steel"], h=0.02),
             f.shape("iris", [eye], 0.02, p["accent_lum"], h=0.02),
             f.disc("pupil", 0, cw, 0.06, 0.03, p["steel"], h=0.04, sides=14)]
    for k in range(9):
        a = math.radians(10 + k * 20)
        parts.append(f.bar(f"ray{k}", (math.cos(a) * 0.41, cw + math.sin(a) * 0.41), (math.cos(a) * (0.52 if k % 2 else 0.47), cw + math.sin(a) * (0.52 if k % 2 else 0.47)),
                           0.025, 0.03, p["bright"]))
    return parts, []


def prophet_finial(p, f, s):
    return [f.box("post", 0, 0.06 * s, 0.05, 0.12 * s, 0.05, p["steel"]),
            f.ring("halo", 0, 0.2 * s, 0.09 * s, 0.018, p["trim"], segments=20),
            fl.sphere("orb", 0.05 * s, f.at(0, 0.2 * s), p["accent_lum"], segments=10, rings=6)]


def serpent(p, f):
    cw = 0.32
    coil = [f.at(math.cos(t) * (0.1 + 0.25 * t / (math.tau * 2.2)), cw + math.sin(t) * (0.1 + 0.25 * t / (math.tau * 2.2)), 0.05)
            for t in (math.tau * 2.2 * k / 44 for k in range(45))]
    parts = [f.disc("plate", 0, cw, 0.36, 0.04, p["steel"], sides=20),
             fl.sweep("coil", coil, 0.032, p["trim"], sides=6, radii=[0.018 + 0.02 * k / 44 for k in range(45)])]
    end = coil[-1]
    parts.append(fl.sphere("head", 0.07, end, p["bright"], segments=10, rings=6))
    parts.append(fl.sphere("eye", 0.028, end + Vector((0, -0.06, 0.02)), p["accent"], segments=8, rings=5))
    parts.append(f.ring("rim", 0, cw, 0.37, 0.025, p["bright"], h=0.03, segments=36))
    return parts, []


def serpent_finial(p, f, s):
    helix = [f.at(math.cos(t) * 0.08 * s, 0.03 + 0.24 * s * t / (math.tau * 3), 0) for t in (math.tau * 3 * k / 36 for k in range(37))]
    return [fl.sweep("spring", helix, 0.022, p["trim"], sides=5),
            fl.sphere("cap", 0.05 * s, f.at(0, 0.3 * s), p["accent_lum"], segments=10, rings=6)]


def moth(p, f):
    cw = 0.3
    parts = [f.disc("body", 0, cw, 0.07, 0.08, p["steel"], sides=12), f.box("thorax", 0, cw - 0.12, 0.08, 0.26, 0.07, p["steel"])]
    for s in (-1, 1):
        upper = [(s * 0.06, cw + 0.02), (s * 0.42, cw + 0.32), (s * 0.68, cw + 0.26), (s * 0.6, cw + 0.02)]
        lower = [(s * 0.06, cw - 0.04), (s * 0.5, cw - 0.04), (s * 0.44, cw - 0.24), (s * 0.18, cw - 0.28)]
        for poly, key in ((upper, "up"), (lower, "low")):
            if s < 0:
                poly = list(reversed(poly))
            parts.append(f.shape(f"wing_{key}{s}", [poly, _scaled(poly, 0.7, (sum(u for u, _ in poly) / 4, sum(w for _, w in poly) / 4))],
                                 0.03, p["trim"], h=0.02))
        parts.append(f.disc(f"spot{s}", s * 0.42, cw + 0.18, 0.06, 0.02, p["accent_lum"], h=0.02, sides=12))
        parts.append(f.bar(f"antenna{s}", (s * 0.03, cw + 0.06), (s * 0.18, cw + 0.34), 0.02, 0.02, p["bright"], h=0.05))
    return parts, []


def moth_finial(p, f, s):
    parts = [f.box("post", 0, 0.05 * s, 0.05, 0.1 * s, 0.05, p["steel"])]
    for k in (-1, 1):
        wing = [(0, 0.08 * s), (k * 0.16 * s, 0.3 * s), (k * 0.05 * s, 0.3 * s)]
        parts.append(f.shape(f"wing{k}", [wing if k > 0 else list(reversed(wing))], 0.03, p["trim"]))
    parts.append(fl.sphere("dot", 0.035, f.at(0, 0.12 * s, 0.02), p["accent"], segments=8, rings=5))
    return parts


def sentinel(p, f):
    cw = 0.32
    side = [(0.26, cw + 0.02), (0.245, cw - 0.09), (0.2, cw - 0.18), (0.12, cw - 0.25), (0.0, cw - 0.3)]
    shield = [(-0.26, cw + 0.26), (0.26, cw + 0.26)] + side + [(-u, w) for u, w in reversed(side[:-1])]
    parts = [f.shape("shield", [shield], 0.05, p["steel"]),
             f.shape("rim", [_scaled(shield, 1.12, (0, cw)), shield], 0.035, p["bright"], h=0.01),
             f.disc("keyhole", 0, cw + 0.06, 0.05, 0.02, p["accent"], h=0.05, sides=12),
             f.shape("keyslot", [[(-0.025, cw + 0.05), (0.025, cw + 0.05), (0.045, cw - 0.12), (-0.045, cw - 0.12)]], 0.02, p["accent"], h=0.05)]
    for s in (-1, 1):
        parts.append(f.box(f"post{s}", s * 0.55, 0.22, 0.1, 0.44, 0.1, p["steel"]))
        parts.append(f.box(f"cap{s}", s * 0.55, 0.47, 0.14, 0.05, 0.14, p["trim"]))
        parts.append(f.box(f"band{s}", s * 0.55, 0.3, 0.11, 0.035, 0.11, p["accent_lum"], bevel=0))
    return parts, []


def sentinel_finial(p, f, s):
    return [f.box("post", 0, 0.12 * s, 0.1, 0.24 * s, 0.1, p["steel"]),
            fl.prism("cap", 4, 0.1, 0.0, f.origin.z + 0.24 * s, f.origin.z + 0.32 * s, p["trim"], xy=_xy(f), rotation_z=math.pi / 4),
            f.box("band", 0, 0.16 * s, 0.105, 0.03, 0.105, p["accent_lum"], bevel=0)]


def _cog(f, name, cu, cw, r, teeth, depth, mat, h=0.0):
    outline = []
    for k in range(teeth):
        a = math.tau * k / teeth
        step = math.tau / teeth
        for t, radius in ((-0.3, r * 0.8), (-0.18, r), (0.18, r), (0.3, r * 0.8)):
            outline.append((cu + math.cos(a + t * step) * radius, cw + math.sin(a + t * step) * radius))
    return f.shape(name, [outline, _polygon(cu, cw, r * 0.42, 12)], depth, mat, h)


def colossus(p, f):
    cw = 0.36
    parts = [f.box("wall", 0, 0.12, 1.3, 0.24, 0.08, p["steel"])]
    for k in range(5):
        parts.append(f.box(f"course{k}", -0.52 + k * 0.26, 0.12, 0.02, 0.2, 0.012, p["trim"], h=0.08, bevel=0))
    gear = [_cog(f, "cog", 0, cw, 0.3, 12, 0.06, p["trim"], h=0.08), f.disc("hub", 0, cw, 0.12, 0.08, p["steel"], h=0.08, sides=12),
            f.disc("core", 0, cw, 0.06, 0.04, p["accent_lum"], h=0.14, sides=10)]
    return parts, [(gear, f.at(0, cw, 0.1), 0.25)]


def colossus_finial(p, f, s):
    return [f.box("post", 0, 0.05 * s, 0.08, 0.1 * s, 0.08, p["steel"]), _cog(f, "cog", 0, 0.2 * s, 0.12 * s, 8, 0.05, p["trim"]),
            f.disc("hub", 0, 0.2 * s, 0.04, 0.04, p["accent_lum"], h=0.03, sides=8)]


def weaver(p, f):
    cw, r = 0.34, 0.36
    parts = []
    for k in range(8):
        a = math.tau * k / 8
        parts.append(f.bar(f"spoke{k}", (0, cw), (math.cos(a) * r, cw + math.sin(a) * r), 0.018, 0.03, p["trim"]))
    for j, radius in enumerate((0.14, 0.24, 0.34)):
        ring = _polygon(0, cw, radius, 8, start=0)
        parts += _bars(f, f"thread{j}_", ring, 0.012, 0.02, p["accent"] if j == 1 else p["bright"], h=0.01, closed=True)
    parts.append(f.disc("spindle", 0, cw, 0.07, 0.05, p["accent_lum"], h=0.01, sides=12))
    return parts, []


def weaver_finial(p, f, s):
    z0 = f.origin.z
    return [fl.prism("spindle", 8, 0.07 * s, 0.015, z0, z0 + 0.3 * s, p["steel"], xy=_xy(f)),
            *[fl.torus(f"wind{k}", (0.055 - 0.012 * k) * s, 0.014, f.at(0, (0.08 + 0.06 * k) * s), p["accent"], major_segments=12,
                       minor_segments=4) for k in range(3)]]


def storm(p, f):
    cw = 0.34
    parts = [f.disc("eye", 0, cw, 0.09, 0.05, p["accent_lum"], h=0.04, sides=14)]
    for k in range(4):
        a = math.radians(45 + 90 * k)
        zig = [(math.cos(a) * r + math.cos(a + math.pi / 2) * off, cw + math.sin(a) * r + math.sin(a + math.pi / 2) * off)
               for r, off in ((0.12, 0.0), (0.2, 0.05), (0.26, -0.04), (0.36, 0.02))]
        parts += _bars(f, f"bolt{k}_", zig, 0.024, 0.02, p["accent"], h=0.05)
    rings = [f.ring("ring_outer", 0, cw, 0.36, 0.03, p["trim"], gaps=6, gap_fraction=0.25, segments=42),
             f.ring("ring_inner", 0, cw, 0.22, 0.022, p["bright"], gaps=4, gap_fraction=0.3, segments=30)]
    return parts, [(rings, f.at(0, cw, 0.0), 0.5)]


def storm_finial(p, f, s):
    return [fl.cylinder("post", 0.03, *_z(f, 0, 0.26 * s), p["steel"], xy=_xy(f), sides=8),
            *[fl.torus(f"coil{k}", (0.1 - 0.025 * k) * s, 0.018, f.at(0, (0.07 + 0.07 * k) * s), p["trim"], major_segments=14,
                       minor_segments=4) for k in range(3)],
            fl.sphere("spark", 0.045 * s, f.at(0, 0.29 * s), p["accent_lum"], segments=8, rings=5)]


def widow(p, f):
    cw = 0.32
    parts = [f.ring("web", 0, cw, 0.3, 0.012, p["bright"], segments=36),
             fl.octahedron("prism", 0.13, f.at(0, cw, 0.08), p["accent_lum"], stretch=1.7)]
    for s in (-1, 1):
        for k in range(4):
            a = math.radians(-50 + k * 33)
            knee = (s * (0.14 + math.cos(a) * 0.2), cw + 0.12 + math.sin(a) * 0.18)
            foot = (s * (0.2 + math.cos(a) * 0.46), cw - 0.1 + math.sin(a) * 0.36)
            parts += _bars(f, f"leg{s}{k}_", [(s * 0.06, cw), knee, foot], 0.022, 0.03, p["trim"], h=0.03)
    return parts, []


def widow_finial(p, f, s):
    return [fl.cylinder("socket", 0.07 * s, *_z(f, 0, 0.05), p["trim"], xy=_xy(f), sides=8),
            fl.octahedron("shard", 0.07 * s, f.at(0, 0.17 * s), p["accent_lum"], stretch=1.8)]


def marshal(p, f):
    parts = [f.shape("fulcrum", [[(-0.14, 0.0), (0.14, 0.0), (0.0, 0.34)]], 0.06, p["trim"]),
             f.box("beam", 0, 0.36, 1.3, 0.06, 0.06, p["steel"], h=0.01),
             f.disc("pivot", 0, 0.36, 0.05, 0.04, p["accent_lum"], h=0.07, sides=10)]
    for s in (-1, 1):
        parts.append(f.bar(f"hanger{s}", (s * 0.58, 0.36), (s * 0.58, 0.24), 0.02, 0.03, p["bright"], h=0.02))
        parts.append(f.disc(f"weight{s}", s * 0.58, 0.14, 0.11, 0.08, p["steel"], sides=6))
        parts.append(f.ring(f"weight_band{s}", s * 0.58, 0.14, 0.07, 0.015, p["accent"], h=0.08, segments=14))
    return parts, []


def marshal_finial(p, f, s):
    z0 = f.origin.z
    return [fl.prism("weight", 6, 0.1 * s, 0.08 * s, z0, z0 + 0.18 * s, p["steel"], xy=_xy(f)),
            fl.prism("band", 6, 0.105 * s, 0.105 * s, z0 + 0.08 * s, z0 + 0.11 * s, p["accent_lum"], xy=_xy(f), bevel=0),
            fl.cylinder("ring", 0.03, z0 + 0.18 * s, z0 + 0.24 * s, p["trim"], xy=_xy(f), sides=8)]


def _bell(name, at, r, height, p):
    x, y, z = at
    return [fl.cylinder(f"{name}_body", r * 0.55, z - height, z, p["trim"], xy=(x, y), sides=14, r_top=r * 0.35),
            fl.cylinder(f"{name}_flare", r, z - height - 0.02, z - height + 0.04, p["trim"], xy=(x, y), sides=14, r_top=r * 0.6),
            fl.sphere(f"{name}_clapper", r * 0.3, (x, y, z - height - 0.02), p["accent_lum"], segments=8, rings=5)]


def choir(p, f):
    parts = [f.box("yoke", 0, 0.6, 1.1, 0.06, 0.07, p["steel"]), f.box("post_l", -0.55, 0.3, 0.06, 0.6, 0.06, p["steel"]),
             f.box("post_r", 0.55, 0.3, 0.06, 0.6, 0.06, p["steel"])]
    for k, (u, r, height) in enumerate(((-0.32, 0.12, 0.22), (0.0, 0.16, 0.3), (0.32, 0.12, 0.22))):
        parts += _bell(f"bell{k}", f.at(u, 0.57, 0.04), r, height, p)
    parts.append(f.ring("note", 0, 0.6, 0.05, 0.015, p["accent"], h=0.04, segments=12))
    return parts, []


def choir_finial(p, f, s):
    return [fl.cylinder("post", 0.025, *_z(f, 0, 0.3 * s), p["steel"], xy=_xy(f), sides=6),
            *_bell("bell", f.at(0, 0.3 * s), 0.08 * s, 0.15 * s, p)]


def reaver(p, f):
    cw = 0.32
    heart = []
    for k in range(24):
        t = math.tau * k / 24
        heart.append((0.016 * 16 * math.sin(t) ** 3, cw + 0.016 * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))))
    parts = [f.shape("heart", [heart], 0.05, p["accent_lum"], h=0.05),
             f.shape("heart_rim", [_scaled(heart, 1.25, (0, cw)), heart], 0.04, p["steel"], h=0.04)]
    for s in (-1, 1):
        blade = _crescent(s * 0.05, cw - 0.1, 0.5, 0.14, math.radians(90 - s * 70), math.radians(90 - s * 10), 10)
        parts.append(f.shape(f"scythe{s}", [blade if s > 0 else list(reversed(blade))], 0.03, p["bright"]))
        parts.append(f.bar(f"haft{s}", (s * 0.05, cw + 0.38), (-s * 0.4, 0.02), 0.03, 0.04, p["trim"]))
    return parts, []


def reaver_finial(p, f, s):
    return [f.box("post", 0, 0.05 * s, 0.05, 0.1 * s, 0.05, p["steel"]),
            f.shape("blade", [_crescent(-0.06 * s, 0.1 * s, 0.2 * s, 0.07 * s, math.radians(0), math.radians(85), 8)], 0.03, p["bright"]),
            fl.sphere("drop", 0.035, f.at(0, 0.1 * s, 0.03), p["accent_lum"], segments=8, rings=5)]


def foreman(p, f):
    cw = 0.32
    parts = [f.disc("stamp", 0, cw, 0.24, 0.05, p["steel"], sides=20),
             f.ring("stamp_rim", 0, cw, 0.24, 0.022, p["accent"], h=0.05, segments=32)]
    for s in (-1, 1):
        parts.append(f.bar(f"cross{s}", (-0.12, cw - s * 0.12), (0.12, cw + s * 0.12), 0.04, 0.02, p["accent"], h=0.05))
        a = math.radians(90 + s * 38)
        grip, head = (math.cos(a + math.pi) * 0.46, cw + math.sin(a + math.pi) * 0.46), (math.cos(a) * 0.38, cw + math.sin(a) * 0.38)
        parts.append(f.bar(f"handle{s}", grip, head, 0.04, 0.04, p["trim"], h=0.06))
        parts.append(f.box(f"head{s}", head[0], head[1], 0.24, 0.1, 0.1, p["steel"], h=0.05, angle=a + math.pi / 2))
    return parts, []


def foreman_finial(p, f, s):
    return [f.bar("handle", (0, 0.0), (0, 0.24 * s), 0.035, 0.035, p["trim"]), f.box("head", 0, 0.26 * s, 0.22 * s, 0.08, 0.08, p["steel"]),
            f.box("band", 0, 0.26 * s, 0.03, 0.085, 0.085, p["accent_lum"], bevel=0)]


def nest(p, f):
    cells = [(0, 0.34), (-0.19, 0.23), (0.19, 0.23), (-0.19, 0.45), (0.19, 0.45), (0, 0.12), (0, 0.56)]
    parts = []
    for k, (u, w) in enumerate(cells):
        hexagon = _polygon(u, w, 0.11, 6, start=0)
        parts.append(f.shape(f"cell{k}", [hexagon, _scaled(hexagon, 0.7, (u, w))], 0.05, p["trim"]))
        if k in (0, 2, 3):
            parts.append(fl.sphere(f"egg{k}", 0.065, f.at(u, w, 0.02), p["accent_lum"], segments=10, rings=6))
        else:
            parts.append(f.disc(f"floor{k}", u, w, 0.08, 0.02, p["steel"], sides=6))
    return parts, []


def nest_finial(p, f, s):
    z0 = f.origin.z
    egg = fl.sphere("egg", 0.08 * s, f.at(0, 0.17 * s), p["accent_lum"], segments=10, rings=6)
    egg.scale = (1, 1, 1.35)
    return [fl.cylinder("cup", 0.08 * s, z0, z0 + 0.1 * s, p["trim"], xy=_xy(f), sides=6, r_top=0.1 * s), egg]


def demolition(p, f):
    cw = 0.3
    parts = [f.disc("dial", 0, cw, 0.25, 0.05, p["steel"], sides=24), f.ring("bezel", 0, cw, 0.25, 0.028, p["bright"], h=0.05, segments=36)]
    for k in range(5):
        a0, a1 = math.radians(200 - k * 32), math.radians(200 - k * 32 - 22)
        wedge = _arc(0, cw, 0.21, a0, a1, 4) + list(reversed(_arc(0, cw, 0.15, a0, a1, 4)))
        parts.append(f.shape(f"segment{k}", [wedge], 0.02, p["accent"] if k >= 3 else p["trim"], h=0.05))
    parts.append(f.bar("needle", (0, cw), (math.cos(math.radians(60)) * 0.18, cw + math.sin(math.radians(60)) * 0.18), 0.025, 0.02, p["bright"], h=0.07))
    for s in (-1, 1):
        base = f.at(s * 0.5, 0.0)
        parts.append(fl.cylinder(f"charge{s}", 0.09, base.z, base.z + 0.34, p["steel"], xy=(base.x, base.y), sides=12))
        for k in range(2):
            parts.append(fl.cylinder(f"charge_band{s}{k}", 0.095, base.z + 0.08 + k * 0.14, base.z + 0.11 + k * 0.14, p["trim"],
                                     xy=(base.x, base.y), sides=12))
        parts.append(fl.cylinder(f"charge_cap{s}", 0.06, base.z + 0.34, base.z + 0.4, p["accent_lum"], xy=(base.x, base.y), sides=10))
    return parts, []


def demolition_finial(p, f, s):
    z0 = f.origin.z
    return [fl.cylinder("charge", 0.08 * s, z0, z0 + 0.22 * s, p["steel"], xy=_xy(f), sides=10),
            fl.cylinder("band", 0.085 * s, z0 + 0.1 * s, z0 + 0.13 * s, p["trim"], xy=_xy(f), sides=10),
            fl.cylinder("cap", 0.05 * s, z0 + 0.22 * s, z0 + 0.28 * s, p["accent_lum"], xy=_xy(f), sides=8)]


def blight(p, f):
    knot = f.at(0, 0.36, 0.04)
    parts = [fl.icosphere("knot", 0.13, knot, p["steel"], subdivisions=1)]
    for k, (u, w, depth) in enumerate(((-0.7, 0.0, 0.0), (-0.45, 0.02, 0.08), (-0.22, 0.0, 0.1), (0.25, 0.0, 0.1), (0.5, 0.02, 0.06),
                                       (0.72, 0.0, 0.0), (-0.3, 0.62, 0.02), (0.34, 0.58, 0.02))):
        mid = f.at(u * 0.5, (0.36 + w) / 2 + 0.06, 0.04 + depth / 2)
        end = f.at(u, w, 0.04 + depth)
        mat = p["accent"] if k in (1, 4) else p["trim"]
        parts.append(fl.sweep(f"root{k}", [knot, mid, end], 0.04, mat, sides=6, radii=[0.05, 0.03, 0.012]))
    parts.append(fl.sphere("heart", 0.05, knot + Vector((0, -0.11, 0)), p["accent_lum"], segments=8, rings=5))
    return parts, []


def blight_finial(p, f, s):
    knot = f.at(0, 0.16 * s)
    parts = [fl.icosphere("knot", 0.08 * s, knot, p["steel"], subdivisions=1),
             fl.sphere("ember", 0.03, knot + Vector((0, -0.07 * s, 0.02)), p["accent_lum"], segments=8, rings=5)]
    for k in range(3):
        a = math.tau * k / 3 + 0.4
        end = f.origin + Vector((math.cos(a) * 0.2 * s, math.sin(a) * 0.2 * s, 0.0))
        parts.append(fl.sweep(f"root{k}", [knot, (knot + end) / 2 + Vector((0, 0, 0.03)), end], 0.03, p["trim"], sides=5,
                              radii=[0.035, 0.022, 0.01]))
    return parts


def _xy(f):
    return (f.origin.x, f.origin.y)


def _z(f, a, b):
    return (f.origin.z + a, f.origin.z + b)


SIGILS = {name: (globals()[name], globals()[f"{name}_finial"]) for name in COLORS}


def near_sigil(p, sigil, x, y, z):
    """The sigil at NEAR_SIGIL of its size on a small mount on a near corner block."""
    mount = [fl.box("corner_mount", (0.74, 0.32, 0.08), (x, y, z + 0.04), p["steel"], bevel=0.012),
             fl.box("corner_mount_trim", (0.78, 0.05, 0.05), (x, y - 0.16, z + 0.025), p["trim"], bevel=0.006)]
    origin = Vector((x, y - 0.1, z + 0.08))
    static, spinning = sigil(p, _face(origin))
    parts = static + [part for group, _, _ in spinning for part in group]
    fl.transform(parts, Matrix.Translation(origin) @ Matrix.Scale(NEAR_SIGIL, 4) @ Matrix.Translation(-origin))
    return mount + parts


def build(name):
    sigil, finial = SIGILS[name]
    p = kit.palette("copper", COLORS[name])
    static, spinning = sigil(p, _face(MOUNT))
    crest = fl.slot(fl.empty("crest"), "crest")
    fl.merge_onto(crest, static)
    for k, (parts, centre, speed) in enumerate(spinning):
        fl.parent(_spin(parts, f"crest_spin{k}", centre, speed), crest)
    corners = []
    for sx in (-1, 1):
        # Near: the leader's sigil again, smaller, on a mount facing the player (in full view
        # beside the hand). Far: a low finial (the portraits stand above the far rail).
        corners += near_sigil(p, sigil, sx * kit.CORNER_X, -kit.CORNER_Y, kit.NEAR_TOP + 0.06)
        corners += finial(p, _face((sx * kit.CORNER_X, kit.CORNER_Y, kit.FAR_TOP + 0.06)), FAR_SCALE)
    holder = fl.slot(fl.empty("finial"), "finial")
    fl.merge_onto(holder, corners)


def render(path, name, **options):
    kit.render_board(path, "copper", base="copper", **options)
