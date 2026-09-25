# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pillow==12.3.0",
#   "numpy==2.5.3",
#   "scipy==1.18.1",
# ]
# ///
"""Cut every hostile out of its art sheet into its own portrait for the rail.

    uv run scripts/cut_hostiles.py                      # writes public/art/hostiles/<id>.webp
    uv run scripts/cut_hostiles.py --contact artifacts/hostile-cut   # plus before/after contact sheets

The sheets in public/art/ stay the sources: the script never writes them, so it can be run again
at any time and gives the same portraits. Each cell becomes one square WebP at its native
resolution: the painted body, centred, with a transparent margin wide enough for the rail's rim
light and shadow (the rail draws each portrait on its own quad, so no neighbouring cell can bleed
into it at any mip level).

The v4 sheets (escorts, v4 leaders, adds) were cut out by scripts/compose_sheet.py and only need
the crop. The older sheets were painted with transparency and carry defects the rail's rim light
and post-processing made visible, so their cells are also cleaned:

1. slivers of a neighbouring cell's painting that reach over the cell edge are removed (a
   component that touches the edge, is not the body and is small);
2. the faint alpha haze around the body (alpha 1-47 over up to a fifth of the cell) is cut: alpha
   is kept within a few pixels of the painted silhouette, faded out beyond and cleared further out,
   and the near-opaque paint inside the body (alpha 0.9-0.99) becomes solid;
3. limbs the painting cut at the cell edge fade out over the last few percent of the cell instead
   of ending in a straight line;
4. dark halos are defringed: a soft edge pixel that is darker than the body next to it takes that
   body colour in proportion to its transparency;

then every sheet's cells get the edge colour bled under their transparent pixels, so bilinear
filtering and mipmaps never pull black into the silhouette.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public" / "art"
OUT = ART / "hostiles"

# sheet, ids in cell order, columns, rows, cleaned (see the docstring); mirrors src/core/enemies.ts.
SHEETS = [
    ("hostiles", ["leech", "sentinel", "core"], 3, 1, True),
    ("hostiles-alpha", ["wraith", "storm"], 2, 1, True),
    ("hostiles-zones", ["prophet", "widow", "colossus"], 3, 1, True),
    ("hostiles-expedition", ["serpent", "moth", "marshal", "choir", "weaver", "reaver"], 3, 2, True),
    ("stage-guardians", ["regent", "cantor"], 2, 1, True),
    ("hostiles-escorts", ["spark-mite", "splicer", "relay-drone", "ward-node", "tap-spinner", "glass-echo", "rigger-drone"], 4, 2, False),
    ("hostiles-front", ["foreman", "nest", "demolition", "blight"], 4, 1, False),
    ("hostiles-adds", ["gate-warden", "chorister", "quarantine-drone"], 3, 1, False),
]
STAGES = ["relay-interior.png", "stages/glass-interior.png", "stages/blackout-interior.png"]

SOLID = 0.1         # alpha that counts as painted (the body's components)
SLIVER_AREA = 0.02  # an edge-touching component below this fraction of the cell is a neighbour's
KEEP_NEAR = 0.08    # components further than this (fraction of the cell) from the body are specks
HAZE_KEEP = 1.5     # px around the silhouette where soft alpha stays as painted
HAZE_FADE = 5.0     # px where it has faded to nothing
FLOOR = 4 / 255     # alpha below this is cleared
FEATHER = 0.03      # fraction of the cell over which cut limbs fade toward the cell edge
MARGIN = 0.07       # transparent margin around the body, fraction of its larger side
BLEED = 24          # px of edge colour kept under transparent pixels


def cells():
    for sheet, ids, columns, rows, cleaned in SHEETS:
        image = Image.open(ART / f"{sheet}.png").convert("RGBA")
        width, height = image.width // columns, image.height // rows
        for index, hostile in enumerate(ids):
            x, y = index % columns * width, index // columns * height
            yield hostile, sheet, cleaned, np.asarray(image.crop((x, y, x + width, y + height))).astype(np.float32) / 255


def clean(cell: np.ndarray) -> np.ndarray:
    rgb, alpha = cell[..., :3].copy(), cell[..., 3].copy()
    size = alpha.shape[0]
    # 1. The body and its near parts; neighbours' slivers and far specks go.
    labels, count = ndimage.label(alpha >= SOLID, structure=np.ones((3, 3)))
    if count:
        areas = ndimage.sum(np.ones_like(alpha), labels, range(1, count + 1))
        body = labels == 1 + int(np.argmax(areas))
        near = ndimage.distance_transform_edt(~body) <= KEEP_NEAR * size
        border = np.zeros_like(body)
        border[0], border[-1], border[:, 0], border[:, -1] = True, True, True, True
        edge_labels = set(np.unique(labels[border])) - {0}
        keep = body.copy()
        for label in range(1, count + 1):
            part = labels == label
            if (part & body).any():
                continue
            if label in edge_labels and areas[label - 1] < SLIVER_AREA * size * size:
                continue
            if (part & near).any():
                keep |= part
        # 2. Haze: soft alpha stays only close to what is kept.
        distance = ndimage.distance_transform_edt(~keep)
        alpha *= np.clip((HAZE_FADE - distance) / (HAZE_FADE - HAZE_KEEP), 0, 1)
    alpha[alpha < FLOOR] = 0
    # The body itself is solid: near-opaque paint inside the silhouette (0.9-0.99) becomes opaque.
    inside = ndimage.distance_transform_edt(alpha >= 0.5) > 3
    alpha[inside & (alpha >= 0.9)] = 1
    # 3. Limbs cut by the cell edge fade out instead of ending in a straight line.
    ramp = np.minimum.reduce(np.meshgrid(np.arange(size), np.arange(size)) + np.meshgrid(np.arange(size)[::-1], np.arange(size)[::-1]))
    alpha *= np.clip(ramp / (FEATHER * size), 0, 1) ** 0.8
    # 4. Defringe: a soft edge darker than the body beside it takes the body's colour as it thins.
    opaque = alpha >= 0.9
    if opaque.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~opaque, return_indices=True)
        inner = rgb[iy, ix]
        weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
        own, body = rgb @ weights, inner @ weights
        darker = np.clip((body - own) / np.maximum(body, 0.05) * 4, 0, 1)
        mix = ((1 - alpha) * darker * (alpha > 0))[..., None]
        rgb = rgb * (1 - mix) + inner * mix
    return np.dstack([rgb, alpha])


def bleed(cell: np.ndarray) -> np.ndarray:
    """Edge colour under the transparent pixels (nearest visible pixel, within BLEED px)."""
    rgb, alpha = cell[..., :3], cell[..., 3]
    visible = alpha >= 0.02
    if not visible.any():
        return cell
    distance, (iy, ix) = ndimage.distance_transform_edt(~visible, return_indices=True)
    fill = (~visible) & (distance <= BLEED)
    out = rgb.copy()
    out[fill] = rgb[iy[fill], ix[fill]]
    out[(~visible) & ~fill] = rgb[iy, ix][(~visible) & ~fill] * 0.5
    return np.dstack([out, alpha])


def frame(cell: np.ndarray) -> np.ndarray:
    """The body centred on a square canvas with a transparent margin."""
    alpha = cell[..., 3]
    ys, xs = np.nonzero(alpha > 0)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(bottom - top, right - left)
    side += 2 * int(round(side * MARGIN))
    canvas = np.zeros((side, side, 4), dtype=np.float32)
    y0, x0 = (side - (bottom - top)) // 2, (side - (right - left)) // 2
    canvas[y0:y0 + bottom - top, x0:x0 + right - left] = cell[top:bottom, left:right]
    return canvas


def save(cell: np.ndarray, path: Path):
    image = Image.fromarray(np.clip(np.round(cell * 255), 0, 255).astype(np.uint8), "RGBA")
    # Lossy colour (visually lossless at 92), lossless alpha; exact keeps the bled colour under
    # transparent pixels that filtering relies on.
    image.save(path, "WEBP", quality=92, alpha_quality=100, method=6, exact=True)


def composite(cell: np.ndarray, backdrop: Image.Image, size: int) -> Image.Image:
    shown = Image.fromarray(np.clip(np.round(cell * 255), 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    tile = backdrop.resize((size, size), Image.LANCZOS).convert("RGBA")
    tile.alpha_composite(shown)
    return tile.convert("RGB")


def contact(pairs: list[tuple[str, np.ndarray, np.ndarray]], output: Path, size: int = 200):
    """Before and after of every cleaned hostile over the three stage backdrops, and its haze (alpha x 40)."""
    backdrops = []
    for stage in STAGES:
        image = Image.open(ART / stage).convert("RGB")
        # The band above the table: the upper middle of the battle painting.
        w, h = image.size
        backdrops.append(image.crop((int(w * 0.34), int(h * 0.05), int(w * 0.66), int(h * 0.05) + int(w * 0.32))))
    columns = 2 * (len(STAGES) + 1)
    sheet = Image.new("RGB", (columns * size + 12, len(pairs) * (size + 22) + 26), (12, 12, 14))
    draw = ImageDraw.Draw(sheet)
    headings = [f"before · stage {i + 1}" for i in range(len(STAGES))] + ["before · haze"] + [f"after · stage {i + 1}" for i in range(len(STAGES))] + ["after · haze"]
    for column, heading in enumerate(headings):
        draw.text((column * size + (12 if column >= columns // 2 else 0) + 6, 6), heading, fill=(230, 210, 170))
    for row, (hostile, before, after) in enumerate(pairs):
        y = 26 + row * (size + 22)
        draw.text((6, y), hostile, fill=(255, 225, 170))
        for half, cell in enumerate([before, after]):
            x0 = half * (columns // 2) * size + half * 12
            for column, backdrop in enumerate(backdrops):
                sheet.paste(composite(cell, backdrop, size), (x0 + column * size, y + 16))
            haze = np.clip(cell[..., 3] * 40, 0, 1)
            sheet.paste(Image.fromarray((haze * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS).convert("RGB"), (x0 + len(STAGES) * size, y + 16))
    output.mkdir(parents=True, exist_ok=True)
    sheet.save(output / "hostile-cut-contact.png")
    print(f"contact sheet: {output / 'hostile-cut-contact.png'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--contact", type=Path, help="also write before/after contact sheets here")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = []
    for hostile, sheet, cleaned, cell in cells():
        after = bleed(clean(cell) if cleaned else cell)
        portrait = frame(after)
        save(portrait, OUT / f"{hostile}.webp")
        size = (OUT / f"{hostile}.webp").stat().st_size
        print(f"{hostile:17s} {sheet:20s} {cell.shape[0]:4d} px cell -> {portrait.shape[0]:4d} px, {size / 1024:6.1f} KiB{'  cleaned' if cleaned else ''}")
        if cleaned:
            pairs.append((hostile, frame(cell), portrait))
    if args.contact:
        contact(pairs, args.contact)


if __name__ == "__main__":
    main()
