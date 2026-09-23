# Device models

Every device body on the table (router, switch, firewall, …) is modelled in
Blender by a Python script and exported to `public/models/<role>.glb`. The game
loads those files at startup; until they arrive (or if one fails) the role falls
back to the primitive body in `src/three/devices.ts`.

```
npm run models                          # rebuild every role that has a script
npm run models -- router switch         # rebuild some roles
npm run models -- router --render out   # also write out/router.png previews
npm run models -- router --render out --azimuth 0,35 --no-export
```

`npm run models` needs Blender 4.2 or newer. It finds a standard install on
Windows (also from WSL) and macOS; otherwise set `BLENDER=/path/to/blender`.
The scripts run with `--factory-startup`, so your Blender preferences are never
read or written. The GLBs are committed, so contributors without Blender can
still run the game.

To see models in the real renderer, open the dev harness gallery:
`/dev/world-preview.html?scene=gallery` (add `&cam=x,y,z&target=x,y,z` for a
close-up), or capture it with `dev/preview-shots.ts` and `QUERY=`.

## Layout

- `build.py`: entry point run inside Blender (`blender -b --python build.py -- <roles>`).
- `lib/faultline.py`: shared materials, primitives, hooks, consolidation, export and preview render.
- `devices/<role>.py`: one file per role, defining `build(role)`.

## The contract with `src/three/models.ts`

**Space.** Units are game units. Build Z-up, facing **-Y** (that side faces the
table camera, which looks down at about 34°). The origin is the device's centre
at the base of the shared plinth, which is built in code: the body starts at
`PLINTH_TOP` (z = 0.95). Keep the body inside radius `MAX_RADIUS` (0.72);
floating or spinning parts may reach `MAX_ORBIT` (0.9). Stay below `MAX_TOP`
(z = 2.45); the label floats at 2.86 (3.0 for client, 3.05 for power, whose
scripts may set a module-level `MAX_TOP` up to 2.55 / 2.6). `build.py` reports
anything outside this envelope.

**Materials** are matched by name at runtime and rebuilt per device, so offline
hardware can be greyed out on its own:

| Name | In game |
| --- | --- |
| `role_luminous` | the device's luminous metal (role colour × 0.4, glowing in the role colour) |
| `role_glow`, `role_glow_soft`, `role_glow_faint` | unlit role colour at opacity 1 / 0.45 / 0.12 |
| `role_wire` | unlit role-coloured wireframe |
| `glow_*` | unlit, fixed colour (opacity from the material's `opacity` custom property) |
| `wire_*` | unlit wireframe, fixed colour |
| anything else | lit metal (`MeshPhysicalMaterial`) with the exported colour, metalness and roughness |

Use the library in `lib/faultline.py` (`material(name, role)`), or `lit()` /
`unlit()` for one-off colours that follow the same naming (`unlit()` also takes
`role_glow*` / `role_wire*` names, e.g. for a double-sided role-coloured field). Role colours live in
`COLORS` in `src/three/devices.ts`; the copy in the library is only for previews.

**Hooks** are custom properties on an object (exported as glTF extras):

| Property | Effect |
| --- | --- |
| `hook = "floater"` | bobs and turns slowly (a crystal, an orb) |
| `hook = "spinner"`, `speed`, `axis` (`"y"` = up, default) | turns continuously |
| `hook = "blinker"`, `speed`, `phase`, `base` | an LED: its unlit material blinks (opacity `base` when on) |
| `variant = "<flag>"` | only exists when the node has that flag, e.g. `"stateful"` |

A hooked object turns about its own origin, so place the origin at the pivot.
`build.py` bakes rotation and scale into hooked meshes; a hooked parent with
children must keep identity rotation and scale (use `empty()` as a holder).
Children of hooked objects move with them.

**Building blocks.** `box`, `prism` (a flat side faces -Y; `polar(sides, r)` gives
the face centres), `cylinder`, `tube`, `torus` (dashed with `gaps`), `octahedron`,
`icosphere` and `sphere` cover most shapes. For custom geometry build a bmesh and
pass it to `from_bmesh()`, then `finish()` for bevels and shading.

**Budget.** Static parts are merged into one mesh per material (`consolidate()`),
so draw calls are roughly materials + hooked parts. A hooked part built from many
pieces should be merged too: `merge(name, parts, pivot)` joins same-material parts
with the origin at the pivot, and `merge_onto(holder, parts)` merges per material
under an `empty()` holder (a spinner's arms, an orbiting ring of slates). Aim for ≤ 6,000 triangles,
≤ 20 draw calls and ≤ 250 KB per device. There are no textures; detail comes
from bevels, panels, material contrast and light.

**Reproducible builds.** Rebuilding an unchanged script leaves its GLB untouched
(triangle order is canonicalised, and float noise below 1e-4 keeps the old file),
so `git diff` only shows models whose scripts changed.

**Shared overlays stay in code:** the plinth, selection skirt, shield bubble,
upgrade crown, amplifier ring, salvage scrap and the fault warning are added by
`World.ts` around whatever body the model provides.
