# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Stage I, The Copper Reach: weathered steel and brass, container modules on the apron (every
third in rust red), amber lamps, teal accents. The base of every stage I leader's board."""

from . import kit


def build(name):
    kit.build_base("copper")


def render(path, name, **options):
    kit.render_board(path, "copper", **options)
