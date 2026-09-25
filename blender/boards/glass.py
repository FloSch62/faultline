"""Stage II, The Glass Cathedral: blue-black steel and silvered trims; the apron's modules hold
slim lancet lenses of violet optical glass (the only cathedral shape on the board). Pale violet
lamps and accents. The base of every stage II leader's board."""

from . import kit


def build(name):
    kit.build_base("glass")


def render(path, name, **options):
    kit.render_board(path, "glass", **options)
