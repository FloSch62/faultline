# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""The containerlab mark (public/containerlab-mark.svg, MIT, see its LICENSE file) read as geometry.

No bpy: the tabletop surface (numpy) and the Blender medallion both use it. Coordinates are
normalised: centred on the SVG's viewBox, y up, the mark's height is 1.

    outline   the hexagon-and-flask ring: two closed paths, filled even-odd
    liquid    the liquid in the flask: one closed path
    bubbles   three stroked circles (cx, cy, r, stroke width)
"""

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "..", "..", "public", "containerlab-mark.svg")


def _numbers(text):
    return [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?(?:e-?\d+)?", text)]


def _parse_path(d):
    """Absolute M/L/C/Z paths (all the mark uses) as closed subpaths of segments:
    ("L", p0, p1) or ("C", p0, c1, c2, p3)."""
    subpaths, current, start, point = [], None, None, None
    for command, args in re.findall(r"([MLCZmlcz])([^MLCZmlcz]*)", d):
        values = _numbers(args)
        if command == "M":
            point = start = (values[0], values[1])
            current = []
            subpaths.append(current)
            for i in range(2, len(values), 2):  # implicit lineto
                current.append(("L", point, (values[i], values[i + 1])))
                point = (values[i], values[i + 1])
        elif command == "L":
            for i in range(0, len(values), 2):
                current.append(("L", point, (values[i], values[i + 1])))
                point = (values[i], values[i + 1])
        elif command == "C":
            for i in range(0, len(values), 6):
                c1, c2, end = (values[i], values[i + 1]), (values[i + 2], values[i + 3]), (values[i + 4], values[i + 5])
                current.append(("C", point, c1, c2, end))
                point = end
        elif command in "Zz":
            if point != start:
                current.append(("L", point, start))
            point = start
        else:
            raise ValueError(f"unsupported path command {command}")
    return subpaths


def _load():
    with open(SVG, encoding="utf-8") as fh:
        svg = fh.read()
    x, y, w, h = _numbers(re.search(r'viewBox="([^"]+)"', svg).group(1))
    cx, cy, scale = x + w / 2, y + h / 2, 1 / h

    def norm(p):
        return ((p[0] - cx) * scale, -(p[1] - cy) * scale)

    def normalise(subpaths):
        return [[(kind, *[norm(p) for p in points]) for kind, *points in path] for path in subpaths]

    paths = re.findall(r'<path[^>]*?\sd="([^"]+)"[^>]*?>', svg)
    liquid = normalise(_parse_path(paths[0]))
    outline = normalise(_parse_path(paths[1]))
    bubbles = []
    for attrs in re.findall(r"<circle([^>]*)>", svg):
        get = lambda key: float(re.search(rf'\s{key}="([^"]+)"', attrs).group(1))  # noqa: E731
        stroke = float(re.search(r"stroke-width:\s*([\d.]+)", attrs).group(1))
        (bx, by) = norm((get("cx"), get("cy")))
        bubbles.append((bx, by, get("r") * scale, stroke * scale))
    return outline, liquid, bubbles


OUTLINE, LIQUID, BUBBLES = _load()


def flatten(subpath, steps=10):
    """A subpath's points (closed; the last point is not repeated)."""
    points = []
    for kind, *p in subpath:
        if kind == "L":
            points.append(p[0])
        else:
            p0, c1, c2, p3 = p
            for k in range(steps):
                t = k / steps
                u = 1 - t
                points.append((u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p3[0],
                               u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p3[1]))
    # Drop repeated points (the path repeats some) so edges never have zero length.
    clean = []
    for point in points:
        if not clean or abs(point[0] - clean[-1][0]) + abs(point[1] - clean[-1][1]) > 1e-6:
            clean.append(point)
    if len(clean) > 1 and abs(clean[0][0] - clean[-1][0]) + abs(clean[0][1] - clean[-1][1]) < 1e-6:
        clean.pop()
    return clean
