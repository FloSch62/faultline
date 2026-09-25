# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""The Iron Regent's board (the stage I guardian, keeper of the copper gates). The Copper Reach's
frame turned into a gatehouse: heavy copper, the fascia's modules are riveted gate leaves under
portcullis bars, the corner blocks are crenellated gate towers with patina-green lamps, copper
armour is riveted over the side rails, and a low crown over a barred gate arch is its crest.
Accents in the Regent's green."""

import math

from lib import faultline as fl

from . import kit


def gate(face, name, u, w, width, height, p, index):
    """Two riveted gate leaves under portcullis bars, a lock plate at the seam."""
    kit._module_frame(face, name, u, w, width, height, p, p["steel"])
    inner_w, inner_h = width - 0.14, height - 0.14
    for s in (-1, 1):
        face.box(f"{name}_leaf{s}", u + s * inner_w / 4, w, inner_w / 2 - 0.025, inner_h, 0.03, p["trim"], h=0.015, bevel=0.008)
        for k in range(3):
            fl.sphere(f"{name}_rivet{s}{k}", 0.016, face.at(u + s * 0.05, w - inner_h / 2 + inner_h * (k + 0.5) / 3, 0.048), p["bright"],
                      segments=6, rings=3)
    for k in range(2):
        face.box(f"{name}_bar{k}", u, w - inner_h / 2 + inner_h * (k + 1) / 3, inner_w, 0.028, 0.02, p["steel"], h=0.045, bevel=0.004)
    face.box(f"{name}_lock", u, w, 0.07, 0.1, 0.02, p["accent_lum"], h=0.05, bevel=0.004)


kit.MODULES["gate"] = gate


def tower(p, x, y, z, far):
    """A gate tower's crown on a corner block: merlons round a green lamp."""
    height = 0.14 if far else 0.3
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        merlon = fl.box(f"merlon{k}", (0.16, 0.1, height), (x + math.cos(a) * 0.38, y + math.sin(a) * 0.38, z + height / 2), p["steel"],
                        rotation=(0, 0, a + math.pi / 2), bevel=0.01)
        merlon.name = f"tower_merlon{k}"
    fl.cylinder("tower_lamp", 0.11, z, z + height * 0.9, p["lamp"], xy=(x, y), sides=12)
    fl.dome("tower_dome", 0.13, 0.08, z + height * 0.9, p["accent_lum"], xy=(x, y), segments=14, rings=4)
    fl.torus("tower_ring", 0.44, 0.03, (x, y, z + 0.01), p["bright"], major_segments=24, minor_segments=5)


def crown(p):
    """A low crown over a barred gate arch; a green gem at its brow."""
    face = kit.Face((0, kit.CREST_Y - 0.2, kit.RAIL_Z + 0.08), (1, 0, 0), (0, 0, 1), (0, -1, 0))
    arch = [(-0.34, 0.0), (0.34, 0.0), (0.34, 0.3)] + [(math.cos(t) * 0.34, 0.3 + math.sin(t) * 0.2)
                                                       for t in (math.pi * k / 10 for k in range(1, 10))] + [(-0.34, 0.3)]
    inner = [(u * 0.76, w * 0.84) for u, w in arch]
    face.shape("gate_arch", [arch, inner], 0.07, p["steel"])
    for k in range(-2, 3):
        face.box(f"gate_bar{k}", k * 0.1, 0.22, 0.03, 0.42, 0.03, p["trim"], h=0.02, bevel=0.004)
    face.box("crown_band", 0, 0.52, 0.86, 0.08, 0.08, p["trim"], h=0.02)
    for k in range(5):
        u = -0.36 + k * 0.18
        tall = 0.2 if k == 2 else 0.14 if k % 2 == 0 else 0.1
        face.shape(f"crown_spike{k}", [[(u - 0.06, 0.56), (u + 0.06, 0.56), (u, 0.56 + tall)]], 0.05, p["bright"], h=0.03)
    fl.octahedron("crown_gem", 0.07, face.at(0, 0.52, 0.12), p["accent_lum"], stretch=1.3)


def armour(p):
    """Copper armour plates riveted over the side rails between the band lamps."""
    for s in (-1, 1):
        for y in (-4.6, -1.95, 1.95, 4.6):
            fl.box(f"armour{s}_{y}", (0.36, 0.9, 0.035), (s * 8.62, y, kit.RAIL_Z + 0.017), p["trim"], bevel=0.01)
            for k in (-1, 1):
                fl.sphere(f"armour_rivet{s}_{y}_{k}", 0.018, (s * 8.62, y + k * 0.36, kit.RAIL_Z + 0.036), p["bright"], segments=6, rings=3)


def build(name):
    kit.build_base("regent", corner=tower, crest=crown, extras=(armour,))


def render(path, name, **options):
    kit.render_board(path, "copper", **options)
