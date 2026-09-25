# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Router: a hexagonal relay. Six port-bays ring an armoured chassis; a brass
crown cradles the floating route crystal inside a slowly turning halo, above a
deck carrying the router symbol (arrows in and out)."""

import math

import bmesh

from lib import faultline as fl


def arrow(name, angle, inward, r0, r1, z, mat, width=0.05, head=0.1, thickness=0.014):
    """A flat arrow along `angle` from radius r0 to r1, pointing in or out."""
    tail, tip = (r1, r0) if inward else (r0, r1)
    direction = 1 if tip > tail else -1
    neck = tip - direction * head
    outline = [(tail, -width / 2), (neck, -width / 2), (neck, -width * 1.3), (tip, 0.0),
               (neck, width * 1.3), (neck, width / 2), (tail, width / 2)]
    if direction < 0:
        outline.reverse()
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((along, across, 0)) for along, across in outline])
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[e for e in extruded["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, thickness))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return fl.finish(fl.from_bmesh(name, bm, mat, (0, 0, z), (0, 0, angle)), 0, smooth=False)


def build(role):
    m = lambda name: fl.material(name, role)  # noqa: E731
    dark, graphite, brass, bright = m("metal_dark"), m("metal_graphite"), m("metal_brass"), m("metal_brass_bright")
    z0 = fl.PLINTH_TOP

    # Foot and armoured chassis. Face centres sit on fl.polar(6, r); corners half a step round.
    corners = -math.pi / 2 + math.pi / 6
    fl.prism("foot", 6, 0.62, 0.6, z0, z0 + 0.07, brass, bevel=0.012)
    r_low, r_high, top = 0.57, 0.52, z0 + 0.53
    fl.prism("chassis", 6, r_low, r_high, z0 + 0.07, top, dark, bevel=0.022, segments=3)
    tilt = math.atan((r_low - r_high) * math.cos(math.pi / 6) / (top - z0 - 0.07))

    def radius_at(z):
        return r_low - (r_low - r_high) * (z - z0 - 0.07) / (top - z0 - 0.07)

    # Corner ribs catch the key light and outline the hexagon from above.
    for i, (x, y, a) in enumerate(fl.polar(6, 1.0, start=corners)):
        r = radius_at(z0 + 0.3)
        fl.box(f"rib{i}", (0.05, 0.05, top - z0 - 0.1), (x * (r + 0.004), y * (r + 0.004), z0 + 0.3), graphite,
               rotation=(0, 0, a + math.pi / 2), bevel=0.012)

    # Port bays: a smoked window framed in brass with two rows of lit ports.
    for i, (x, y, a) in enumerate(fl.polar(6, 1.0)):
        z = z0 + 0.27
        r = radius_at(z) * math.cos(math.pi / 6)
        rot = (-tilt, 0, a + math.pi / 2)
        out = lambda d: (x * (r + d), y * (r + d))  # noqa: E731
        fx, fy = out(0.008)
        fl.box(f"frame{i}", (0.42, 0.03, 0.26), (fx, fy, z), brass, rotation=rot, bevel=0.01)
        wx, wy = out(0.02)
        fl.box(f"window{i}", (0.36, 0.02, 0.2), (wx, wy, z), m("glass_smoke"), rotation=rot, bevel=0.006)
        for row, dz in enumerate((0.045, -0.045)):
            for col in range(4):
                along = (col - 1.5) * 0.08
                px = wx + math.cos(a + math.pi / 2) * along + x * 0.014
                py = wy + math.sin(a + math.pi / 2) * along + y * 0.014
                glow = "glow_teal" if (row + col + i) % 3 else "glow_teal_deep"
                fl.box(f"port{i}_{row}_{col}", (0.056, 0.012, 0.036), (px, py, z + dz), m(glow), rotation=rot, bevel=0)
        # One status LED per face, above the bay.
        lx, ly = out(0.012)
        led = fl.box(f"led{i}", (0.05, 0.02, 0.022), (lx, ly, z + 0.185), m("glow_green" if i % 2 else "glow_amber"),
                     rotation=rot, bevel=0)
        fl.hook(led, "blinker", speed=1.1 + i * 0.37, phase=i * 1.7, base=0.95)

    # Brass cornice, luminous collar and top deck.
    fl.prism("cornice", 6, r_high + 0.012, r_high + 0.03, top - 0.035, top, bright, bevel=0.008, segments=1)
    fl.prism("collar", 6, 0.535, 0.535, top, top + 0.07, m("role_luminous"), bevel=0.01)
    deck_top = top + 0.14
    fl.prism("deck", 6, 0.5, 0.44, top + 0.07, deck_top, graphite, bevel=0.014)

    # The router symbol on the deck: four arrows, two routed in and two out, between the spires.
    for i, (_, _, a) in enumerate(fl.polar(4, 1.0, start=-math.pi / 2 + math.pi / 4)):
        arrow(f"arrow{i}", a, inward=i % 2 == 1, r0=0.13, r1=0.34, z=deck_top - 0.004, mat=m("role_glow"))

    # Brass crown: six leaning spires, each tipped with a glowing bead, cradle the crystal.
    for i, (x, y, a) in enumerate(fl.polar(6, 0.36, start=corners)):
        height, lean = 0.48, math.radians(14)
        spire = fl.prism(f"spire{i}", 4, 0.058, 0.014, -height / 2, height / 2, bright,
                         rotation_z=math.pi / 4, bevel=0.006, segments=1)
        # Lean the tip inward: tilt about Y (top toward -X), then turn to face outward along `a`.
        inward = math.sin(lean) * height
        spire.location = (x - math.cos(a) * inward / 2, y - math.sin(a) * inward / 2,
                          deck_top - 0.02 + math.cos(lean) * height / 2)
        spire.rotation_euler = (0, -lean, a)
        fl.sphere(f"spire_tip{i}", 0.024, (x - math.cos(a) * inward, y - math.sin(a) * inward,
                                           deck_top - 0.02 + math.cos(lean) * height), m("role_glow"),
                  segments=8, rings=5)
    fl.cylinder("socket", 0.1, deck_top, deck_top + 0.08, brass, sides=12, r_top=0.06, bevel=0.008)

    # The route crystal: a luminous spindle inside a soft glass shell.
    crystal = fl.octahedron("crystal", 0.235, (0, 0, 1.99), m("role_luminous"), stretch=1.4)
    fl.hook(crystal, "floater")
    shell = fl.octahedron("crystal_shell", 0.285, (0, 0, 1.99), m("role_glow_faint"), stretch=1.38)
    fl.parent(shell, crystal)

    # Halo: a dashed ring, so its slow turn is visible.
    halo = fl.torus("halo", 0.64, 0.028, (0, 0, 1.9), m("role_glow"), gaps=6, gap_fraction=0.22, minor_segments=8)
    fl.hook(halo, "spinner", speed=0.35, axis="y")
