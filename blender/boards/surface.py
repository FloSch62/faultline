# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""The tabletop: a machined deck plate, drawn with numpy (no bpy, so it also runs outside Blender).

The textured tabletop fills the well inside every board frame (TABLE_X x TABLE_Y, Blender x and y,
north = +y = the hostile side). Row 0 of every image is the north edge, column 0 the west edge,
so the images read as the table seen from above. World.ts lays them on a plane at the table
surface (src/three/board.ts); every board of a stage shares them:

    table-<deck>.jpg    base colour (sRGB) per stage (copper, glass, blackout) and guardian (regent,
                        cantor, core)
    table-normal.jpg    tangent-space normal map (OpenGL / glTF convention), shared
    table-rm.jpg        G roughness, B metalness (glTF packing), shared

What is drawn, from the bottom up:
  deck plates   seams at x = -4, 0 (outer bands only), 4 and along the band edges, a
                countersunk screw in every plate corner; mottling, brushed grain, scratches
  bands         an etched border with cut corners inside each band, brass registration brackets
                in the corners and short network traces running out of them to via pads
  grid          faint etched hairlines every unit, small crosses every two units
  centre        the containerlab mark inlaid in brass inside an etched ring gate (segmented,
                four clamps), the liquid in dark enamel
Nothing here may compete with the devices: every line is a hairline or a faint inlay.
"""

import math

import numpy as np

from . import mark

TABLE_X = (-8.25, 8.25)
TABLE_Y = (-5.35, 5.35)
WIDTH = 2048
HEIGHT = int(round(WIDTH * (TABLE_Y[1] - TABLE_Y[0]) / (TABLE_X[1] - TABLE_X[0]) / 8)) * 8  # 1328
PX = WIDTH / (TABLE_X[1] - TABLE_X[0])  # pixels per unit

# The play bands (Blender y ranges; north = +y) inside x -8..8.
PLAY_X = 8.0
BANDS = {"north": (1.3, 5.2), "center": (-1.3, 1.3), "south": (-5.2, -1.3)}
MARK_HEIGHT = 1.72
GATE_RADIUS = 1.06

# sRGB colours per deck: plate, grime, inlay (the metal), enamel (the mark's liquid), stain. One deck
# per stage, and one per guardian (its board's own tint over the same etching).
STAGES = {
    "copper": {"plate": (0.12, 0.108, 0.094), "grime": (0.05, 0.044, 0.038), "inlay": (0.7, 0.53, 0.32),
               "enamel": (0.09, 0.2, 0.21), "stain": (0.27, 0.16, 0.09)},
    "glass": {"plate": (0.1, 0.098, 0.14), "grime": (0.04, 0.038, 0.06), "inlay": (0.74, 0.76, 0.84),
              "enamel": (0.2, 0.14, 0.3), "stain": (0.2, 0.15, 0.3)},
    "blackout": {"plate": (0.1, 0.078, 0.072), "grime": (0.036, 0.026, 0.024), "inlay": (0.62, 0.37, 0.24),
                 "enamel": (0.26, 0.07, 0.06), "stain": (0.24, 0.08, 0.05)},
    "regent": {"plate": (0.105, 0.115, 0.1), "grime": (0.04, 0.05, 0.042), "inlay": (0.74, 0.47, 0.28),
               "enamel": (0.1, 0.24, 0.17), "stain": (0.16, 0.26, 0.2)},
    "cantor": {"plate": (0.11, 0.096, 0.15), "grime": (0.045, 0.036, 0.066), "inlay": (0.8, 0.8, 0.9),
               "enamel": (0.26, 0.16, 0.36), "stain": (0.26, 0.17, 0.36)},
    "core": {"plate": (0.105, 0.07, 0.068), "grime": (0.04, 0.02, 0.02), "inlay": (0.66, 0.33, 0.22),
             "enamel": (0.34, 0.06, 0.06), "stain": (0.3, 0.06, 0.05)},
}


def to_px(x, y):
    return (x - TABLE_X[0]) * PX, (TABLE_Y[1] - y) * PX


class Sheet:
    """Height and masks, all HEIGHT x WIDTH float32.
    depth  how deep a cut goes (pixels; the normal map's slope comes from it)
    inlay  brass (stage metal) coverage, 0..1
    enamel the mark's liquid, 0..1
    cut    how much of a pixel is cut into (dirt collects there), 0..1
    """

    def __init__(self):
        shape = (HEIGHT, WIDTH)
        self.depth = np.zeros(shape, np.float32)
        self.inlay = np.zeros(shape, np.float32)
        self.enamel = np.zeros(shape, np.float32)
        self.cut = np.zeros(shape, np.float32)

    def _window(self, x0, y0, x1, y1, pad):
        c0, c1 = max(0, int(math.floor(min(x0, x1) - pad))), min(WIDTH, int(math.ceil(max(x0, x1) + pad)) + 1)
        r0, r1 = max(0, int(math.floor(min(y0, y1) - pad))), min(HEIGHT, int(math.ceil(max(y0, y1) + pad)) + 1)
        if c0 >= c1 or r0 >= r1:
            return None
        rows, cols = np.mgrid[r0:r1, c0:c1].astype(np.float32) + 0.5
        return (slice(r0, r1), slice(c0, c1)), cols, rows

    def segment(self, a, b, width, depth, inlay=0.0, cut=1.0):
        """A V-cut from world point a to b, `width` wide (units): its bottom is `depth` pixels deep."""
        (ax, ay), (bx, by) = to_px(*a), to_px(*b)
        half = max(0.5, width * PX / 2)
        window = self._window(ax, ay, bx, by, half + 2)
        if window is None:
            return
        where, cols, rows = window
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        t = np.clip(((cols - ax) * dx + (rows - ay) * dy) / length2, 0, 1) if length2 > 1e-9 else 0
        d = np.hypot(cols - (ax + t * dx), rows - (ay + t * dy))
        coverage = np.clip(half + 0.5 - d, 0, 1)
        profile = np.clip((half + 0.5 - d) / (half + 0.5), 0, 1)
        np.maximum(self.depth[where], depth * profile, out=self.depth[where])
        np.maximum(self.cut[where], coverage * cut, out=self.cut[where])
        if inlay:
            np.maximum(self.inlay[where], coverage * inlay, out=self.inlay[where])

    def polyline(self, points, width, depth, inlay=0.0, closed=False, cut=1.0):
        points = list(points)
        pairs = list(zip(points, points[1:])) + ([(points[-1], points[0])] if closed else [])
        for a, b in pairs:
            self.segment(a, b, width, depth, inlay, cut)

    def circle(self, centre, radius, width, depth, inlay=0.0, steps=None, start=0.0, end=math.tau, cut=1.0):
        steps = steps or max(12, int(abs(end - start) * radius * PX / 3))
        points = [(centre[0] + math.cos(start + (end - start) * k / steps) * radius,
                   centre[1] + math.sin(start + (end - start) * k / steps) * radius) for k in range(steps + 1)]
        self.polyline(points, width, depth, inlay, cut=cut)

    def fill(self, polygons, depth, inlay=0.0, enamel=0.0, bevel=1.5):
        """Fill polygons (world points) even-odd: sunk `depth` pixels with a `bevel`-pixel slope."""
        pixel_polys = [np.array([to_px(*p) for p in poly], np.float32) for poly in polygons]
        every = np.concatenate(pixel_polys)
        window = self._window(every[:, 0].min(), every[:, 1].min(), every[:, 0].max(), every[:, 1].max(), bevel + 2)
        if window is None:
            return
        where, cols, rows = window
        inside = np.zeros(cols.shape, bool)
        nearest = np.full(cols.shape, np.inf, np.float32)
        for poly in pixel_polys:
            for (ax, ay), (bx, by) in zip(poly, np.roll(poly, -1, axis=0)):
                # Even-odd crossing test and distance to the edge.
                crosses = ((ay > rows) != (by > rows)) & (cols < (bx - ax) * (rows - ay) / (by - ay + 1e-12) + ax)
                inside ^= crosses
                dx, dy = bx - ax, by - ay
                length2 = dx * dx + dy * dy
                if length2 < 1e-9:
                    continue
                t = np.clip(((cols - ax) * dx + (rows - ay) * dy) / length2, 0, 1)
                np.minimum(nearest, np.hypot(cols - (ax + t * dx), rows - (ay + t * dy)), out=nearest)
        signed = np.where(inside, nearest, -nearest)
        coverage = np.clip(signed + 0.5, 0, 1)
        profile = np.clip((signed + 0.5) / bevel, 0, 1)
        np.maximum(self.depth[where], depth * profile, out=self.depth[where])
        np.maximum(self.cut[where], coverage, out=self.cut[where])
        if inlay:
            np.maximum(self.inlay[where], coverage * inlay, out=self.inlay[where])
        if enamel:
            np.maximum(self.enamel[where], coverage * enamel, out=self.enamel[where])


# ---------------------------------------------------------------------------
# Noise and filters


def value_noise(cell, seed, octaves=1, persistence=0.5):
    """Smooth value noise in -1..1 with features about `cell` pixels wide."""
    rng = np.random.default_rng(seed)
    total = np.zeros((HEIGHT, WIDTH), np.float32)
    amplitude, weight = 1.0, 0.0
    for _ in range(octaves):
        gh, gw = HEIGHT // cell + 3, WIDTH // cell + 3
        grid = rng.uniform(-1, 1, (gh, gw)).astype(np.float32)
        ys = (np.arange(HEIGHT, dtype=np.float32) + 0.5) / cell
        xs = (np.arange(WIDTH, dtype=np.float32) + 0.5) / cell
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = ys - y0, xs - x0
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        top = grid[y0][:, x0] * (1 - fx) + grid[y0][:, x0 + 1] * fx
        bottom = grid[y0 + 1][:, x0] * (1 - fx) + grid[y0 + 1][:, x0 + 1] * fx
        total += amplitude * (top * (1 - fy)[:, None] + bottom * fy[:, None])
        weight += amplitude
        amplitude *= persistence
        cell = max(2, cell // 2)
    return total / weight


def box_blur(image, radius, axis=None):
    """Separable box blur (radius in pixels), edges clamped."""
    if radius < 1:
        return image
    out = image.astype(np.float32)
    for ax in ((0, 1) if axis is None else (axis,)):
        pad = [(0, 0), (0, 0)]
        pad[ax] = (radius + 1, radius)
        padded = np.pad(out, pad, mode="edge")
        summed = np.cumsum(padded, axis=ax, dtype=np.float64)
        size = 2 * radius + 1
        if ax == 0:
            out = ((summed[size:] - summed[:-size]) / size).astype(np.float32)
        else:
            out = ((summed[:, size:] - summed[:, :-size]) / size).astype(np.float32)
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# The drawing


def _screw(sheet, x, y, rng):
    sheet.circle((x, y), 0.055, 0.018, 1.4)
    sheet.fill([[(x + math.cos(a) * 0.04, y + math.sin(a) * 0.04) for a in np.linspace(0, math.tau, 14, endpoint=False)]],
               0.5, inlay=0.35, bevel=1.2)
    angle = rng.uniform(0, math.pi)
    dx, dy = math.cos(angle) * 0.032, math.sin(angle) * 0.032
    sheet.segment((x - dx, y - dy), (x + dx, y + dy), 0.012, 1.6)


def _plates(sheet, rng):
    """Deck-plate seams and their corner screws."""
    columns = {"north": (-8, -4, 0, 4, 8), "center": (-8, -4, 4, 8), "south": (-8, -4, 0, 4, 8)}
    for name, (y0, y1) in BANDS.items():
        xs = columns[name]
        for x in xs[1:-1]:
            sheet.segment((x, y0), (x, y1), 0.028, 2.2, cut=0.9)
        for xa, xb in zip(xs, xs[1:]):
            for sx, sy in ((xa + 0.2, y0 + 0.2), (xb - 0.2, y0 + 0.2), (xa + 0.2, y1 - 0.2), (xb - 0.2, y1 - 0.2)):
                _screw(sheet, sx, sy, rng)
    # The outer edge of the play area: a seam where the deck meets the frame's margin.
    sheet.polyline([(-PLAY_X, -5.2), (PLAY_X, -5.2), (PLAY_X, 5.2), (-PLAY_X, 5.2)], 0.026, 2.0, closed=True, cut=0.9)


def _grid(sheet):
    """Faint hairlines every unit, crosses every two (inside the bands, clear of the ring gate)."""
    clear = GATE_RADIUS + 0.06

    def hairline(a, b):
        # Split a straight hairline where it would cross the ring gate.
        (ax, ay), (bx, by) = a, b
        if ax == bx and abs(ax) < clear and min(ay, by) < 0 < max(ay, by):
            gap = math.sqrt(clear * clear - ax * ax)
            pieces = [((ax, min(ay, by)), (ax, -gap)), ((ax, gap), (ax, max(ay, by)))]
        elif ay == by and abs(ay) < clear and min(ax, bx) < 0 < max(ax, bx):
            gap = math.sqrt(clear * clear - ay * ay)
            pieces = [((min(ax, bx), ay), (-gap, ay)), ((gap, ay), (max(ax, bx), ay))]
        else:
            pieces = [(a, b)]
        for p, q in pieces:
            sheet.segment(p, q, 0.008, 0.35, cut=0.28)

    for x in range(-7, 8):
        for name, (y0, y1) in BANDS.items():
            if x % 4 == 0 and not (name == "center" and x == 0):
                continue  # a seam already runs here
            hairline((x, y0 + 0.02), (x, y1 - 0.02))
    for y in range(-5, 6):
        hairline((-PLAY_X + 0.02, y), (PLAY_X - 0.02, y))
    for x in range(-6, 7, 2):
        for y in range(-4, 5, 2):
            if math.hypot(x, y) < clear + 0.3:
                continue
            for dx, dy in ((0.11, 0), (0, 0.11)):
                sheet.segment((x - dx, y - dy), (x + dx, y + dy), 0.016, 0.9, cut=0.6)


def _band_frame(sheet, rng, name, y0, y1):
    """An etched border with cut corners, brass brackets in the corners, network traces."""
    inset, chamfer = 0.16, 0.34
    x0, x1 = -PLAY_X + inset, PLAY_X - inset
    b0, b1 = y0 + inset, y1 - inset
    border = [(x0 + chamfer, b0), (x1 - chamfer, b0), (x1, b0 + chamfer), (x1, b1 - chamfer), (x1 - chamfer, b1),
              (x0 + chamfer, b1), (x0, b1 - chamfer), (x0, b0 + chamfer)]
    sheet.polyline(border, 0.02, 1.3, inlay=0.55, closed=True)
    inner = 0.07
    sheet.polyline([(x0 + chamfer + inner * 0.4, b0 + inner), (x1 - chamfer - inner * 0.4, b0 + inner),
                    (x1 - inner, b0 + chamfer + inner * 0.4), (x1 - inner, b1 - chamfer - inner * 0.4),
                    (x1 - chamfer - inner * 0.4, b1 - inner), (x0 + chamfer + inner * 0.4, b1 - inner),
                    (x0 + inner, b1 - chamfer - inner * 0.4), (x0 + inner, b0 + chamfer + inner * 0.4)],
                   0.009, 0.5, closed=True, cut=0.5)
    # Corner brackets: a brass bracket following each cut corner, a chevron pointing in. The
    # south-west corner carries the band's stencilled name instead (a board model, boards/kit.py).
    for sx, sy, cx, cy in ((-1, 1, x1, b0), (1, -1, x0, b1), (-1, -1, x1, b1)):
        arm, cut = 0.68, 0.22
        ox, oy = cx + sx * 0.12, cy + sy * 0.12
        sheet.polyline([(ox + sx * arm, oy), (ox + sx * cut, oy), (ox, oy + sy * cut), (ox, oy + sy * arm)], 0.045, 1.4, inlay=0.75)
        sheet.polyline([(ox + sx * 0.2, oy + sy * 0.3), (ox + sx * 0.3, oy + sy * 0.3), (ox + sx * 0.3, oy + sy * 0.2)],
                       0.024, 1.0, inlay=0.6)
        _traces(sheet, rng, ox, oy, sx, sy, arm)
    # Ticks at the middle of the long edges and at the plate seams.
    for x in (-4, 0, 4):
        for y, s in ((b0, 1), (b1, -1)):
            sheet.segment((x, y), (x, y + s * 0.16), 0.022, 1.0, inlay=0.6)


def _traces(sheet, rng, ox, oy, sx, sy, arm):
    """Network traces from a corner bracket: run along the border, bend 45 degrees, end in a via."""
    for k in range(3):
        along = arm + 0.12 + k * 0.16
        horizontal = k % 2 == 0
        run = rng.uniform(0.25, 0.7)
        bend = rng.uniform(0.12, 0.3)
        if horizontal:
            start = (ox + sx * along, oy + sy * 0.0)
            points = [start, (start[0] + sx * run, start[1]), (start[0] + sx * (run + bend), start[1] + sy * bend)]
        else:
            start = (ox + sx * 0.0, oy + sy * along)
            points = [start, (start[0], start[1] + sy * run), (start[0] + sx * bend, start[1] + sy * (run + bend))]
        sheet.polyline(points, 0.014, 0.8, inlay=0.35)
        end = points[-1]
        sheet.circle(end, 0.035, 0.014, 0.8, inlay=0.35)
    # A short bus of three parallel traces off the corner.
    for k in range(3):
        offset = 0.08 + k * 0.05
        sheet.polyline([(ox + sx * offset, oy + sy * offset), (ox + sx * (offset + 0.22), oy + sy * (offset + 0.22)),
                        (ox + sx * (offset + 0.22 + 0.3), oy + sy * (offset + 0.22))], 0.01, 0.6, inlay=0.25)


def _ring_gate(sheet):
    """The ring gate round the mark: two rings, segment ticks, four clamps."""
    r = GATE_RADIUS
    for radius, width, depth, inlay in ((r, 0.024, 1.4, 0.6), (r - 0.09, 0.012, 0.8, 0.3)):
        for q in range(4):
            start, end = math.radians(q * 90 + 9), math.radians(q * 90 + 81)
            sheet.circle((0, 0), radius, width, depth, inlay, start=start, end=end)
    for k in range(72):
        a = math.radians(k * 5)
        if abs((k * 5 + 45) % 90 - 45) < 9:
            continue  # the clamps sit here
        r0, r1 = r - 0.075, r - 0.035 if k % 2 else r - 0.02
        sheet.segment((math.cos(a) * r0, math.sin(a) * r0), (math.cos(a) * r1, math.sin(a) * r1), 0.009, 0.6, cut=0.6)
    for q in range(4):
        a = math.radians(q * 90)
        c, s = math.cos(a), math.sin(a)
        # A clamp: a small brass block across the ring.
        corners = [(-0.1, -0.055), (0.1, -0.055), (0.1, 0.055), (-0.1, 0.055)]
        poly = [((r - 0.045 + u) * c - v * s, (r - 0.045 + u) * s + v * c) for u, v in corners]
        sheet.fill([poly], 1.2, inlay=0.75, bevel=1.5)


def _mark(sheet):
    """The containerlab mark, inlaid in brass, the liquid in enamel."""
    scale = MARK_HEIGHT
    to_world = lambda p: (p[0] * scale, p[1] * scale)  # noqa: E731
    sheet.fill([[to_world(p) for p in mark.flatten(path)] for path in mark.OUTLINE], 1.3, inlay=0.8, bevel=1.4)
    sheet.fill([[to_world(p) for p in mark.flatten(path)] for path in mark.LIQUID], 1.0, enamel=1.0, bevel=2.0)
    for bx, by, r, stroke in mark.BUBBLES:
        sheet.circle(to_world((bx, by)), r * scale, max(0.016, stroke * scale), 1.0, inlay=0.8)


def _scratches(sheet, rng, count=260):
    for _ in range(count):
        x, y = rng.uniform(-8.2, 8.2), rng.uniform(-5.3, 5.3)
        angle = rng.normal(0.25, 0.5)
        length = rng.uniform(0.08, 0.5)
        sheet.segment((x, y), (x + math.cos(angle) * length, y + math.sin(angle) * length), 0.006, 0.25, cut=0.12)


def draw(seed=7):
    """Every layer of the tabletop (masks and height), deterministic for a seed."""
    rng = np.random.default_rng(seed)
    sheet = Sheet()
    _plates(sheet, rng)
    _grid(sheet)
    for name, (y0, y1) in BANDS.items():
        _band_frame(sheet, rng, name, y0, y1)
    _ring_gate(sheet)
    _mark(sheet)
    _scratches(sheet, rng)
    layers = {
        "depth": sheet.depth, "inlay": sheet.inlay, "enamel": sheet.enamel, "cut": sheet.cut,
        "mottle": value_noise(170, seed + 1, octaves=4),
        "stain": np.clip(value_noise(260, seed + 2, octaves=3) * 1.8 - 0.55, 0, 1),
        "grain": box_blur(np.random.default_rng(seed + 3).normal(0, 1, (HEIGHT, WIDTH)).astype(np.float32), 18, axis=1),
        "pits": (np.random.default_rng(seed + 4).random((HEIGHT, WIDTH)) > 0.9985).astype(np.float32),
    }
    # Grime settles into and around every cut, and toward the frame.
    rows = (np.arange(HEIGHT, dtype=np.float32) + 0.5) / PX
    cols = (np.arange(WIDTH, dtype=np.float32) + 0.5) / PX
    edge = np.minimum(np.minimum(rows, rows[::-1])[:, None], np.minimum(cols, cols[::-1])[None, :])
    layers["grime"] = np.clip(box_blur(sheet.cut, 5) * 1.2 + (1 - smoothstep(0.0, 0.55, edge)) * 0.8, 0, 1)
    layers["pits"] = box_blur(layers["pits"], 1)
    return layers


def albedo(layers, stage):
    colours = {key: np.array(value, np.float32) for key, value in STAGES[stage].items()}
    shade = 0.84 + 0.2 * layers["mottle"][..., None] + 0.035 * np.clip(layers["grain"], -2, 2)[..., None]
    base = colours["plate"] * shade
    base = base * (1 - 0.35 * layers["stain"][..., None]) + colours["stain"] * 0.35 * layers["stain"][..., None]
    grime = layers["grime"][..., None] * 0.55
    base = base * (1 - grime) + colours["grime"] * grime
    base *= 1 - 0.35 * layers["cut"][..., None] * (1 - layers["inlay"][..., None])
    base *= 1 - 0.5 * layers["pits"][..., None]
    enamel = layers["enamel"][..., None]
    base = base * (1 - enamel) + colours["enamel"] * (0.85 + 0.25 * layers["mottle"][..., None]) * enamel
    inlay = layers["inlay"][..., None]
    metal = colours["inlay"] * (0.78 + 0.25 * layers["mottle"][..., None])
    return np.clip(base * (1 - inlay) + metal * inlay, 0, 1)


def normal(layers, strength=0.55):
    height = -layers["depth"] + 0.18 * layers["grain"] - 0.8 * layers["pits"]
    height = box_blur(height, 1) * 0.5 + height * 0.5
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    # Rows run south (down the image) while tangent-space +Y is up the image: flip dy.
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(dx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / length, ny / length, nz / length], axis=-1) * 0.5 + 0.5


def roughness_metal(layers):
    rough = 0.7 + 0.08 * layers["mottle"] + 0.12 * layers["grime"] - 0.05 * np.clip(layers["grain"], -1, 1)
    rough = rough * (1 - layers["inlay"]) + (0.34 + 0.06 * layers["mottle"]) * layers["inlay"]
    rough = rough * (1 - layers["enamel"]) + 0.22 * layers["enamel"]
    metal = 0.4 - 0.2 * layers["grime"] - 0.15 * layers["stain"]
    metal = metal * (1 - layers["inlay"]) + 0.92 * layers["inlay"]
    metal = metal * (1 - layers["enamel"]) + 0.1 * layers["enamel"]
    ones = np.ones_like(rough)
    return np.clip(np.stack([ones, rough, metal], axis=-1), 0, 1)
