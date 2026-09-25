# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""The tabletop's textures, drawn by surface.py and written as JPEGs next to the board models:
table-<deck>.jpg (base colour: copper, glass, blackout per stage; regent, cantor, core per guardian),
table-normal.jpg and table-rm.jpg (G roughness, B metalness), shared by every board. No mesh: World.ts lays them
on the plane that fills each board's well."""

import os

import bpy
import numpy as np

from . import surface

TEXTURES = True
QUALITY = {"table-normal.jpg": 92}


def _save(path, rgb, quality):
    height, width, _ = rgb.shape
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=False)
    image.colorspace_settings.name = "Non-Color"  # store the values as drawn
    rgba = np.ones((height, width, 4), np.float32)
    rgba[..., :3] = rgb[::-1]  # Blender stores rows bottom-up
    image.pixels.foreach_set(rgba.ravel())
    image.file_format = "JPEG"
    image.save(filepath=path, quality=quality)
    bpy.data.images.remove(image)


def images():
    layers = surface.draw()
    files = {f"table-{stage}.jpg": surface.albedo(layers, stage) for stage in surface.STAGES}
    files["table-normal.jpg"] = surface.normal(layers)
    files["table-rm.jpg"] = surface.roughness_metal(layers)
    return files


def export(out_dir):
    """Write every texture into out_dir; returns their total size in bytes."""
    total = 0
    for name, rgb in images().items():
        path = os.path.join(out_dir, name)
        _save(path, rgb, QUALITY.get(name, 88))
        total += os.path.getsize(path)
    return total
