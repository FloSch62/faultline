"""The Hollow Choir's board (the stage II guardian, the silence behind every voice). The Glass
Cathedral's frame tuned into an instrument: the fascia's modules are ranks of silvered resonator
pipes against violet glass, the corner blocks carry glass bells, tuning rods run along the side
rails, and its crest is a low arch of pipes before a violet rose window. Accents in the Choir's violet."""

import math

from lib import faultline as fl

from . import kit


def resonator(face, name, u, w, width, height, p, index):
    """A rank of resonator pipes, longest in the middle, against violet glass."""
    kit._module_frame(face, name, u, w, width, height, p, p["enamel"])
    face.box(f"{name}_glass", u, w, width - 0.2, height - 0.2, 0.008, p["glass"], h=0.015, bevel=0)
    count = max(5, round(width / 0.17))
    inner = width - 0.22
    for k in range(count):
        t = (k + 0.5) / count
        length = (height - 0.2) * (0.55 + 0.4 * math.sin(math.pi * t))
        pu = u - inner / 2 + inner * t
        bottom = w - (height - 0.2) / 2
        face.pipe(f"{name}_pipe{k}", pu, bottom, bottom + length, 0.035, p["bright"], h=0.02, sides=8)
        face.box(f"{name}_mouth{k}", pu, bottom + length * 0.3, 0.045, 0.03, 0.01, p["enamel"], h=0.085, bevel=0)


kit.MODULES["resonator"] = resonator


def bell(p, x, y, z, far):
    """A glass bell on a corner block: a silvered frame round a violet glow."""
    height = 0.2 if far else 0.42
    fl.cylinder("bell_glow", 0.1, z, z + height * 0.8, p["glass"], xy=(x, y), sides=12, r_top=0.06)
    fl.cylinder("bell_lip", 0.17, z, z + 0.04, p["bright"], xy=(x, y), sides=16, r_top=0.14)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        top = (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, z + height)
        fl.sweep(f"bell_rib{k}", [(x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, z + 0.03), (x + math.cos(a) * 0.13, y + math.sin(a) * 0.13,
                                                                                          z + height * 0.5), top], 0.014, p["trim"], sides=5)
    fl.sphere("bell_crown", 0.04, (x, y, z + height + 0.02), p["accent_lum"], segments=8, rings=5)


def choir_arch(p):
    """Pipes rising in a low arch before a violet rose window."""
    face = kit.Face((0, kit.CREST_Y - 0.2, kit.RAIL_Z + 0.08), (1, 0, 0), (0, 0, 1), (0, -1, 0))
    face.disc("rose", 0, 0.36, 0.3, 0.02, p["glass"], sides=24)
    face.ring("rose_rim", 0, 0.36, 0.31, 0.03, p["trim"], h=0.02, segments=36)
    for k in range(8):
        a = math.tau * k / 8
        face.bar(f"rose_spoke{k}", (0, 0.36), (math.cos(a) * 0.3, 0.36 + math.sin(a) * 0.3), 0.018, 0.02, p["trim"], h=0.02)
    face.disc("rose_eye", 0, 0.36, 0.07, 0.03, p["accent_lum"], h=0.02, sides=12)
    for k in range(-5, 6):
        length = 0.62 - abs(k) * 0.08
        face.pipe(f"arch_pipe{k}", k * 0.13, 0.0, length, 0.045, p["bright"], h=0.06, sides=8)
        face.box(f"arch_mouth{k}", k * 0.13, length * 0.28, 0.055, 0.035, 0.01, p["enamel"], h=0.14, bevel=0)


def tuning_rods(p):
    """Tuning rods on short posts along both side rails, between the band lamps."""
    for s in (-1, 1):
        x = s * 8.62
        for y0, y1 in ((-4.9, -4.1), (-2.4, -1.5), (1.5, 2.4), (4.1, 4.9)):
            kit.rod(f"rod{s}_{y0}", (x, y0, kit.RAIL_Z + 0.07), (x, y1, kit.RAIL_Z + 0.07), 0.025, p["bright"], sides=8)
            for y in (y0 + 0.05, y1 - 0.05):
                fl.cylinder(f"rod_post{s}_{y}", 0.03, kit.RAIL_Z, kit.RAIL_Z + 0.07, p["trim"], xy=(x, y), sides=8)


def build(name):
    kit.build_base("cantor", corner=bell, crest=choir_arch, extras=(tuning_rods,))


def render(path, name, **options):
    kit.render_board(path, "glass", **options)
