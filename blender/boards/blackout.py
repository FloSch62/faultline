# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Stage III, The Blackout Heart: blackened steel and copper, containment hatches with ivory
hazard chevrons and ember vents on the apron, ember lamps and accents. The base of every
stage III leader's board."""

from . import kit


def build(name):
    kit.build_base("blackout")


def render(path, name, **options):
    kit.render_board(path, "blackout", **options)
