"""Phantom Node: the router's silhouette as a ghost. An open wireframe cage traces the hexagonal
chassis with its port bays, the collar, the deck, six leaning spires and the halo; a faint
shell gives it volume, and inside the crystal's outline a small solid core floats.

It never gets a plinth (World.ts skips it for this role) and has no skirt detail: the cage
hovers over the empty socket from the plinth line (z 0.95) to z 2.2, radius 0.5.
World.ts fades it out when it absorbs."""

import math

from lib import faultline as fl

PLINTH = False  # preview without the plinth, as in game
Z0 = fl.PLINTH_TOP
CORNERS = -math.pi / 2 + math.pi / 6  # hexagon corners half a step round from the -Y face


def hexagon(r, z):
    return [(x, y, z) for x, y, _ in fl.polar(6, r, start=CORNERS)]


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    segments = []

    # Chassis: bottom and top rings, corner edges, a waist ring and a port-bay frame per face.
    r_low, r_high, top = 0.5, 0.45, Z0 + 0.53
    low, high = hexagon(r_low, Z0), hexagon(r_high, top)
    segments += fl.loop(low) + fl.loop(high) + list(zip(low, high))
    for i, (x, y, a) in enumerate(fl.polar(6, 1.0)):
        ap = lambda z: ((r_low - (r_low - r_high) * (z - Z0) / (top - Z0)) * math.cos(math.pi / 6) + 0.004)  # noqa: E731
        t = (-math.sin(a), math.cos(a))
        bay = []
        for along, z in ((-0.17, Z0 + 0.16), (0.17, Z0 + 0.16), (0.17, Z0 + 0.38), (-0.17, Z0 + 0.38)):
            bay.append((x * ap(z) + t[0] * along, y * ap(z) + t[1] * along, z))
        segments += fl.loop(bay)
        # Two rows of port ticks inside the bay.
        for z in (Z0 + 0.23, Z0 + 0.31):
            for k in range(4):
                along = (k - 1.5) * 0.08
                c = (x * ap(z) + t[0] * along, y * ap(z) + t[1] * along)
                segments.append(((c[0] - t[0] * 0.025, c[1] - t[1] * 0.025, z), (c[0] + t[0] * 0.025, c[1] + t[1] * 0.025, z)))

    # Collar and deck.
    collar_top, deck_top = top + 0.07, top + 0.14
    segments += fl.loop(hexagon(0.47, collar_top)) + list(zip(high, hexagon(0.47, collar_top)))
    deck = hexagon(0.42, deck_top)
    segments += fl.loop(deck) + list(zip(hexagon(0.47, collar_top), deck))

    # Six leaning spires, each a thin diamond outline, cradling the crystal.
    for i, (x, y, a) in enumerate(fl.polar(6, 0.34, start=CORNERS)):
        foot, tip = (x, y, deck_top), (x * 0.74, y * 0.74, deck_top + 0.46)
        side = (-math.sin(a) * 0.03, math.cos(a) * 0.03)
        mid = [(x * 0.9 + side[0] * s, y * 0.9 + side[1] * s, deck_top + 0.14) for s in (-1, 1)]
        segments += [(foot, mid[0]), (mid[0], tip), (tip, mid[1]), (mid[1], foot)]

    # The crystal's outline (an octahedron stretched upright) and a dashed halo.
    cz, cr, stretch = 1.95, 0.19, 1.3
    ring = [(math.cos(a) * cr, math.sin(a) * cr, cz) for a in (k * math.pi / 2 for k in range(4))]
    apexes = [(0, 0, cz + cr * stretch), (0, 0, cz - cr * stretch)]
    segments += fl.loop(ring) + [(p, apex) for p in ring for apex in apexes]
    halo_r, halo_z = 0.5, 1.84
    for k in range(6):
        a0 = k * math.tau / 6
        arc = [(math.cos(a) * halo_r, math.sin(a) * halo_r, halo_z) for a in (a0 + j * math.tau / 6 * 0.78 / 5 for j in range(6))]
        segments += fl.loop(arc, closed=False)
    fl.lines("cage", segments, m("role_wire"))

    # A faint shell gives the ghost its volume at table distance.
    shell = fl.unlit("role_glow_ghost", fl.ROLE_COLORS[role], 0.08, double_sided=True)
    fl.prism("shell", 6, r_low - 0.01, r_high - 0.01, Z0 + 0.005, top, shell, rotation_z=math.pi + math.pi / 6, bevel=0, smooth=False)

    # The core floats inside the crystal outline: a soft glow around a small solid heart.
    core = fl.octahedron("core", 0.12, (0, 0, cz), m("role_glow_soft"), stretch=1.35)
    fl.hook(core, "floater")
    fl.parent(fl.octahedron("core_heart", 0.07, (0, 0, cz), m("role_glow"), stretch=1.35), core)
