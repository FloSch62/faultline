"""The Blackout Core's board (the stage III guardian, the source of the signal collapse). The
Blackout Heart's frame as a reactor's containment: the fascia's modules are shielded portholes
over hazard bands, the corner blocks are wound with containment coils round a red core, coolant
pipes with valve wheels run along the far rail, and its crest is a reactor ring whose core pulses.
Accents in the Core's red."""

import math

from lib import faultline as fl

from . import kit


def reactor(face, name, u, w, width, height, p, index):
    """Two shielded portholes glowing red over a hazard band."""
    kit._module_frame(face, name, u, w, width, height, p, p["panel"])
    for k in (-1, 1):
        cu = u + k * width * 0.22
        face.disc(f"{name}_port{k}", cu, w + 0.04, 0.12, 0.012, p["ember"], h=0.015, sides=16)
        face.ring(f"{name}_bezel{k}", cu, w + 0.04, 0.13, 0.025, p["bright"], h=0.03, segments=20)
        face.bar(f"{name}_guard{k}", (cu - 0.12, w + 0.04), (cu + 0.12, w + 0.04), 0.022, 0.02, p["steel"], h=0.04)
    band_w = w - height / 2 + 0.11
    inner = width - 0.18
    stripes = max(6, round(width / 0.2))
    for k in range(stripes):
        cu = u - inner / 2 + inner * (k + 0.5) / stripes
        face.shape(f"{name}_stripe{k}", [[(cu - 0.05, band_w - 0.04), (cu + 0.01, band_w - 0.04), (cu + 0.05, band_w + 0.04),
                                          (cu - 0.01, band_w + 0.04)]], 0.008, p["ivory"], h=0.015)


kit.MODULES["reactor"] = reactor


def coils(p, x, y, z, far):
    """Containment coils wound round a red core on a corner block."""
    height = 0.18 if far else 0.4
    fl.cylinder("coil_core", 0.1, z, z + height, p["ember"], xy=(x, y), sides=12)
    for k in range(3):
        fl.torus(f"coil{k}", 0.2 - k * 0.025, 0.035, (x, y, z + 0.04 + k * (height - 0.06) / 2), p["trim"], major_segments=16, minor_segments=5)
    fl.cylinder("coil_cap", 0.14, z + height, z + height + 0.04, p["steel"], xy=(x, y), sides=12, r_top=0.1)


def reactor_ring(p):
    """A reactor ring on the far rail: clamps round a thick ring, a core that pulses."""
    face = kit.Face((0, kit.CREST_Y - 0.2, kit.RAIL_Z + 0.08), (1, 0, 0), (0, 0, 1), (0, -1, 0))
    face.box("reactor_foot", 0, 0.06, 0.9, 0.12, 0.12, p["steel"])
    face.ring("reactor_ring", 0, 0.38, 0.3, 0.07, p["panel"], h=0.02, segments=40)
    face.disc("reactor_well", 0, 0.38, 0.24, 0.03, p["enamel"], sides=24)
    for k in range(6):
        a = math.tau * k / 6 + math.pi / 6
        face.box(f"reactor_clamp{k}", math.cos(a) * 0.3, 0.38 + math.sin(a) * 0.3, 0.12, 0.08, 0.11, p["bright"], h=0.02,
                 angle=a + math.pi / 2, bevel=0.008)
    core = face.disc("reactor_core", 0, 0.38, 0.14, 0.05, p["accent"], h=0.02, sides=16)
    fl.hook(core, "blinker", speed=1.3, phase=0.0, base=1.0)
    face.ring("reactor_halo", 0, 0.38, 0.19, 0.015, p["accent_soft"], h=0.05, gaps=6, gap_fraction=0.3, segments=30)


def coolant(p):
    """Coolant pipes with valve wheels along the far rail's outer strip."""
    for k, (y, radius) in enumerate(((6.12, 0.06), (6.24, 0.045))):
        for s in (-1, 1):
            kit.rod(f"coolant{k}{s}", (s * 1.0, y, kit.RAIL_Z + radius), (s * 8.2, y, kit.RAIL_Z + radius), radius, p["trim"], sides=8)
    for x in (-6.5, -3.5, 3.5, 6.5):
        fl.torus(f"valve{x}", 0.1, 0.018, (x, 6.12, kit.RAIL_Z + 0.2), p["accent_lum"], rotation=(math.pi / 2, 0, 0), major_segments=16,
                 minor_segments=4)
        fl.cylinder(f"valve_stem{x}", 0.02, kit.RAIL_Z + 0.1, kit.RAIL_Z + 0.2, p["steel"], xy=(x, 6.12), sides=6)


def build(name):
    kit.build_base("core", corner=coils, crest=reactor_ring, extras=(coolant,))


def render(path, name, **options):
    kit.render_board(path, "blackout", **options)
