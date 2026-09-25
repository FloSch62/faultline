# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "rembg==2.0.85",
#   "onnxruntime==1.30.0",
#   "pillow==12.3.0",
#   "numpy==2.5.3",
#   "scipy==1.18.1",
# ]
# ///
"""Cut painted hostile bodies out of their flat backdrop and compose game atlases.

    uv run scripts/compose_sheet.py --manifest docs/art-v4-bodies-manifest.json \
        --input artifacts/v4-bodies-02 --sheet hostiles-escorts --output artifacts/v4-sheets-01

Krea 2 paints opaque squares on a uniform very dark charcoal backdrop (design 14.3).
For each cell this script

1. removes the backdrop with rembg (isnet-general-use, alpha matting),
2. erodes the matte by one pixel,
3. un-premultiplies colour under the soft edge against the measured backdrop colour,
   so no dark halo survives, and bleeds edge colour into the transparent pixels so
   bilinear filtering and mipmaps never pull backdrop colour back in,
4. trims to the subject, scales its taller side to 80 % of the cell and centres it
   (10 % padding, the same as the existing sheets),

then writes the RGBA sheet, a contact sheet (every cell over the amber rail glow, the
deep indigo stage panorama and neutral grey, at cell size and at the 96-pixel sprite
height), per-cell masks and a JSON report of the sprite-edge checks.

Sources per cell: --cell id=path, else <input>/<id>.png, else the manifest entry's
"file". The chosen sheet is copied into public/art/ by hand, like a card.

Single cut-outs (the warning plate) use --asset ID with --canvas WxH, optional
--fill-holes (keeps a dark enclosed centre opaque) and --format webp.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
FILL = 0.8          # taller side of the subject, as a fraction of the cell
ALPHA_FLOOR = 8     # alpha below this (of 255) is treated as empty when trimming/measuring
SPRITE_HEIGHT = 96  # escort height on a 1280 x 720 window (design 14.3)
BLEED_BAND = 16     # px of edge colour kept under transparent pixels around the subject (covers mip levels 1-4)


# ------------------------------------------------------------------ cut-out

_session = None


def remove_backdrop(rgb: Image.Image, matting: bool) -> np.ndarray:
    """rembg alpha (float 0..1) for an opaque painting."""
    global _session
    from rembg import new_session, remove
    if _session is None:
        _session = new_session("isnet-general-use")
    cut = remove(rgb, session=_session, alpha_matting=matting,
                 alpha_matting_foreground_threshold=240,
                 alpha_matting_background_threshold=12,
                 alpha_matting_erode_size=8,
                 post_process_mask=True)
    return np.asarray(cut.convert("RGBA"))[..., 3].astype(np.float32) / 255.0


def backdrop_colour(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Median colour of the clearly empty backdrop (falls back to the border ring)."""
    empty = alpha <= 0.0
    if empty.sum() < 1000:
        empty = np.zeros_like(alpha, dtype=bool)
        empty[:8], empty[-8:], empty[:, :8], empty[:, -8:] = True, True, True, True
    return np.median(rgb[empty], axis=0)


def drop_specks(alpha: np.ndarray, min_area: int) -> np.ndarray:
    """Remove tiny disconnected islands (dust, stray sparks the matte half-caught)."""
    labels, count = ndimage.label(alpha > ALPHA_FLOOR / 255.0)
    if count <= 1:
        return alpha
    areas = ndimage.sum(np.ones_like(alpha), labels, index=np.arange(1, count + 1))
    keep = np.zeros(count + 1, dtype=bool)
    keep[1:] = areas >= min_area
    keep[1 + int(np.argmax(areas))] = True
    return alpha * keep[labels]


def fill_holes(alpha: np.ndarray, keyed: np.ndarray | None = None) -> np.ndarray:
    """Make every region enclosed by the subject opaque (a plate's dark centre).

    A dark frame on a dark backdrop can come out of the matte with gaps; the colour key
    (brass is far from the charcoal backdrop, a shadow is not) closes the outline first."""
    solid = alpha > 0.5
    if keyed is not None:
        solid |= keyed > 0.35
    solid = ndimage.binary_closing(solid, iterations=3)
    solid = ndimage.binary_fill_holes(solid)
    solid = ndimage.binary_opening(solid, iterations=2)  # no specks or hairline strands outside
    soft = ndimage.gaussian_filter(solid.astype(np.float32), 0.8)
    return np.where(solid, np.maximum(alpha, soft), np.minimum(alpha, soft))


def unpremultiply(rgb: np.ndarray, alpha: np.ndarray, backdrop: np.ndarray) -> np.ndarray:
    """Recover the subject colour under a soft edge: I = a*C + (1-a)*B  =>  C = (I - (1-a)B) / a.

    Where alpha is too small for a stable division the colour comes from the nearest
    solid pixel instead, so the edge keeps the subject's own colour, never the backdrop's."""
    a = alpha[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        recovered = (rgb - (1.0 - a) * backdrop) / np.maximum(a, 1e-3)
    recovered = np.clip(recovered, 0, 255)
    solid = alpha >= 0.9
    if solid.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
        nearest = rgb[iy, ix]
    else:
        nearest = rgb
    # Trust the division fully from alpha 0.5 up; blend to the nearest solid colour below.
    t = np.clip((alpha - 0.15) / 0.35, 0, 1)[..., None]
    out = np.where(a >= 0.999, rgb, t * recovered + (1 - t) * nearest)
    return out


def bleed(rgb: np.ndarray, alpha: np.ndarray, band: float | None = None) -> np.ndarray:
    """Copy the nearest visible colour into transparent pixels (no dark mip/filter halo).

    With `band`, only pixels within that distance of the subject get colour; the rest of the
    cell stays black, which keeps the file small and the sheet readable in RGB-only viewers."""
    visible = alpha > ALPHA_FLOOR / 255.0
    if not visible.any():
        return np.zeros_like(rgb)
    distance, (iy, ix) = ndimage.distance_transform_edt(~visible, return_indices=True)
    out = np.where(visible[..., None], rgb, rgb[iy, ix])
    if band is not None:
        out = np.where((distance > band)[..., None], 0.0, out)
    return out


def colour_key(rgb: np.ndarray, backdrop: np.ndarray, low=8.0, high=70.0) -> np.ndarray:
    """Alpha from the distance to the backdrop colour: keeps emissive glow (sparks, lamps)
    at the strength it was painted with and drops the dark backdrop between its strands."""
    distance = np.abs(rgb - backdrop).max(axis=2)
    return np.clip((distance - low) / (high - low), 0, 1)


def cutout(path: Path, *, matting=True, holes=False, min_area=200, erode=1, keys=()):
    """Return (RGBA float image, report) for one opaque painting.

    `keys` are manual mask boxes (x0, y0, x1, y1 in source pixels, design 14.3 allows manual
    masking): inside them the matte is replaced by a colour key against the backdrop, for
    glow strands or glass that a segmentation matte fills or eats. `holes` (plates) makes
    everything inside the closed outline opaque."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    alpha = remove_backdrop(Image.fromarray(rgb.astype(np.uint8)), matting)
    if holes:
        # Plates: the key only closes the outline; the matte keeps the soft outer edge.
        alpha = fill_holes(alpha, colour_key(rgb, backdrop_colour(rgb, alpha)))
    elif keys:
        backdrop = backdrop_colour(rgb, alpha)
        keyed = colour_key(rgb, backdrop)
        weight = np.zeros_like(alpha)
        for x0, y0, x1, y1 in keys:
            weight[y0:y1, x0:x1] = 1.0
        weight = ndimage.gaussian_filter(weight, 3.0)  # feathered box edge, no visible seam
        alpha = weight * keyed + (1.0 - weight) * alpha
    if erode:
        eroded = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * erode + 1))
        alpha = np.asarray(eroded).astype(np.float32) / 255.0
    alpha = drop_specks(alpha, min_area)
    backdrop = backdrop_colour(rgb, alpha)
    colour = bleed(unpremultiply(rgb, alpha, backdrop), alpha)
    rgba = np.dstack([colour, alpha * 255.0])
    return rgba, {"backdrop": [round(float(v), 1) for v in backdrop], "keys": [list(k) for k in keys]}


# ------------------------------------------------------------------ fitting


def trim(rgba: np.ndarray):
    ys, xs = np.nonzero(rgba[..., 3] > ALPHA_FLOOR)
    if len(xs) == 0:
        raise ValueError("empty cut-out")
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def resize_rgba(rgba: np.ndarray, size) -> np.ndarray:
    """Resample in premultiplied space so transparent colour never bleeds into the edge."""
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA").convert("RGBa")
    img = img.resize(size, Image.LANCZOS).convert("RGBA")
    return np.asarray(img).astype(np.float32)


def fit(rgba: np.ndarray, width: int, height: int, fill: float) -> np.ndarray:
    """Scale the trimmed subject so its taller side fills `fill` of the box and centre it."""
    sub = trim(rgba)
    h, w = sub.shape[:2]
    scale = min(width * fill / w, height * fill / h) if width != height else width * fill / max(w, h)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    sub = resize_rgba(sub, size)
    out = np.zeros((height, width, 4), np.float32)
    x, y = (width - size[0]) // 2, (height - size[1]) // 2
    out[y:y + size[1], x:x + size[0]] = sub
    out[..., :3] = bleed(out[..., :3], out[..., 3] / 255.0, band=BLEED_BAND)
    return out


# ------------------------------------------------------------------ checks


def checks(cell: np.ndarray) -> dict:
    """Numbers behind the sprite-edge checklist (design 14.3). The eye decides; these flag."""
    a = cell[..., 3] / 255.0
    n = cell.shape[0]
    ring = np.concatenate([a[:2].ravel(), a[-2:].ravel(), a[:, :2].ravel(), a[:, -2:].ravel()])
    ys, xs = np.nonzero(a > ALPHA_FLOOR / 255.0)
    y0, y1 = ys.min(), ys.max()
    band = a[y1 - max(2, (y1 - y0) // 7):y1 + 1]
    soft = (band > 0.03) & (band < 0.6)
    edge = (a > 0.03) & (a < 0.97)
    lum = cell[..., :3] @ np.array([0.299, 0.587, 0.114])
    solid = a >= 0.97
    near_solid = ndimage.binary_dilation(edge, iterations=2) & solid
    return {
        "touchesEdge": bool((ring > ALPHA_FLOOR / 255.0).any()),
        "bbox": [int(xs.min()), int(y0), int(xs.max()), int(y1)],
        "softPixelsInBottomBand": round(float(soft.mean()), 4),
        "semiTransparentShare": round(float(edge.sum() / max(1, (a > 0.03).sum())), 4),
        "edgeLuminance": round(float(lum[edge].mean()) if edge.any() else 0.0, 1),
        "innerEdgeLuminance": round(float(lum[near_solid].mean()) if near_solid.any() else 0.0, 1),
        "cellSize": n,
    }


# ------------------------------------------------------------------ review backdrops


def amber_glow(w: int, h: int) -> Image.Image:
    """The rail's warm under-glow: dark umber with an amber radial bloom low in the frame."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w * 0.55)) ** 2 + ((yy - h * 0.72) / (h * 0.5)) ** 2)
    t = np.clip(1 - d, 0, 1) ** 1.6
    base = np.array([28, 18, 12], np.float32)
    glow = np.array([255, 170, 70], np.float32)
    img = base + t[..., None] * (glow - base)
    return Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")


def indigo_panorama(w: int, h: int) -> Image.Image:
    for name in ("public/art/relay-interior.png", "public/art/stages/glass-interior.png"):
        path = ROOT / name
        if path.exists():
            src = Image.open(path).convert("RGB")
            side = min(src.width, src.height)
            box = ((src.width - side) // 2, 0, (src.width + side) // 2, side)
            return src.crop(box).resize((w, h), Image.LANCZOS).convert("RGBA")
    return Image.new("RGBA", (w, h), (18, 20, 44, 255))


def contact_sheet(cells: list[tuple[str, np.ndarray]], out: Path, tile=384):
    backs = [("amber rail glow", amber_glow), ("indigo panorama", indigo_panorama),
             ("neutral grey", lambda w, h: Image.new("RGBA", (w, h), (128, 128, 128, 255)))]
    label_w, gap = 150, 6
    row_h = tile + round(SPRITE_HEIGHT / FILL) + gap * 3
    W = label_w + len(backs) * (tile + gap)
    sheet = Image.new("RGBA", (W, row_h * len(cells)), (12, 12, 14, 255))
    draw = ImageDraw.Draw(sheet)
    for r, (name, cell) in enumerate(cells):
        y = r * row_h
        draw.text((8, y + 8), name, fill=(230, 220, 200, 255))
        img = Image.fromarray(np.clip(cell, 0, 255).astype(np.uint8), "RGBA")
        big = img.resize((tile, tile), Image.LANCZOS)
        # Sprite size: the cell is drawn so the subject (80 % of the cell) stands ~96 px tall.
        small_side = round(SPRITE_HEIGHT / FILL)
        small = img.convert("RGBa").resize((small_side, small_side), Image.LANCZOS).convert("RGBA")
        for c, (_, make) in enumerate(backs):
            x = label_w + c * (tile + gap)
            back = make(tile, tile)
            back.alpha_composite(big)
            sheet.alpha_composite(back, (x, y))
            strip = make(tile, small_side)
            strip.alpha_composite(small, ((tile - small_side) // 2, 0))
            sheet.alpha_composite(strip, (x, y + tile + gap))
        draw.text((8, y + tile + gap + 4), "96 px sprite", fill=(160, 150, 130, 255))
    for c, (label, _) in enumerate(backs):
        draw.text((label_w + c * (tile + gap) + 6, 4), label, fill=(200, 190, 170, 255))
    sheet.convert("RGB").save(out)


# ------------------------------------------------------------------ main


def sha256(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_for(entry, args) -> Path:
    if entry["id"] in args.overrides:
        return Path(args.overrides[entry["id"]])
    for folder in args.input or []:
        candidate = Path(folder) / (entry["id"] + ".png")
        if candidate.exists():
            return candidate
    if entry.get("file"):
        return ROOT / entry["file"]
    raise FileNotFoundError(f"No source painting for {entry['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--input", action="append", help="Folder of candidate PNGs named <id>.png; repeatable")
    parser.add_argument("--cell", action="append", default=[], help="id=path override for one cell")
    parser.add_argument("--sheet", help="Sheet name from the manifest's sheets block")
    parser.add_argument("--asset", help="Single cut-out instead of a sheet")
    parser.add_argument("--canvas", default=None, help="WxH for --asset (default: the painting's size)")
    parser.add_argument("--fill", type=float, default=None, help="Subject fill (default 0.8 for sheets, 0.96 for assets)")
    parser.add_argument("--fill-holes", action="store_true")
    parser.add_argument("--no-matting", action="store_true")
    parser.add_argument("--min-area", type=int, default=200, help="Smallest island kept, in source pixels")
    parser.add_argument("--key", action="append", default=[],
                        help="id=x0,y0,x1,y1: colour-key box (source pixels) replacing the matte; repeatable")
    parser.add_argument("--format", choices=("png", "webp"), default="png")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.overrides = dict(item.split("=", 1) for item in args.cell)
    args.keys = {}
    for item in args.key:
        id_, box = item.split("=", 1)
        args.keys.setdefault(id_, []).append(tuple(int(v) for v in box.split(",")))
    manifest = json.loads(args.manifest.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "cells").mkdir(exist_ok=True)
    matting = not args.no_matting

    if args.asset:
        entry = next(e for e in manifest["images"] if e["id"] == args.asset)
        src = source_for(entry, args)
        rgba, info = cutout(src, matting=matting, holes=args.fill_holes, min_area=args.min_area,
                            keys=args.keys.get(args.asset) or [tuple(k) for k in entry.get("cutoutKeys") or ()])
        w, h = (map(int, args.canvas.split("x")) if args.canvas else (rgba.shape[1], rgba.shape[0]))
        out = fit(rgba, w, h, args.fill or 0.96)
        img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
        target = args.output / f"{args.asset}.{args.format}"
        img.save(target, **({"lossless": False, "quality": 92, "method": 6, "exact": True} if args.format == "webp" else {}))
        square = np.zeros((max(w, h), max(w, h), 4), np.float32)
        square[(max(w, h) - h) // 2:(max(w, h) - h) // 2 + h, (max(w, h) - w) // 2:(max(w, h) - w) // 2 + w] = out
        contact_sheet([(args.asset, square)], args.output / f"{args.asset}-contact.png")
        report = {"asset": args.asset, "source": str(src), "sourceSha256": sha256(src), **info,
                  "checks": checks(out), "output": str(target)}
        (args.output / f"{args.asset}-report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return

    spec = manifest["sheets"][args.sheet]
    cols, rows, cell = spec["columns"], spec["rows"], spec["cell"]
    entries = sorted((e for e in manifest["images"] if (e.get("sheet") or {}).get("file") == spec["file"]),
                     key=lambda e: e["sheet"]["index"])
    sheet = np.zeros((rows * cell, cols * cell, 4), np.float32)
    cells, report = [], {"sheet": args.sheet, "file": spec["file"], "size": [cols * cell, rows * cell], "cells": []}
    for entry in entries:
        src = source_for(entry, args)
        print(f"Cutting {entry['id']} from {src}", flush=True)
        keys = args.keys.get(entry["id"]) or [tuple(k) for k in entry.get("cutoutKeys") or ()]
        rgba, info = cutout(src, matting=matting, min_area=args.min_area, keys=keys)
        out = fit(rgba, cell, cell, args.fill or FILL)
        i = entry["sheet"]["index"]
        x, y = (i % cols) * cell, (i // cols) * cell
        sheet[y:y + cell, x:x + cell] = out
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").save(args.output / "cells" / f"{entry['id']}.png")
        cells.append((f"{i} {entry['id']}", out))
        report["cells"].append({"index": i, "id": entry["id"], "source": str(src), "sourceSha256": sha256(src),
                                **info, "checks": checks(out)})
    target = args.output / f"{args.sheet}.png"
    Image.fromarray(np.clip(sheet, 0, 255).astype(np.uint8), "RGBA").save(target, optimize=True)
    contact_sheet(cells, args.output / f"{args.sheet}-contact.png")
    report["output"] = str(target)
    report["sha256"] = sha256(target)
    (args.output / f"{args.sheet}-report.json").write_text(json.dumps(report, indent=2) + "\n")
    for c in report["cells"]:
        flags = [k for k in ("touchesEdge",) if c["checks"][k]]
        print(f"{c['index']} {c['id']}: {c['checks']} {'FLAG ' + ','.join(flags) if flags else ''}")
    print(f"Wrote {target} ({report['size'][0]} x {report['size'][1]})")


if __name__ == "__main__":
    main()
