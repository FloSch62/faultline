# Models

Every 3D body on the table, and the table itself, is modelled in Blender by a Python script and
exported to a GLB under `public/models`. There are five families:

| Family | Scripts | Exported to | Names |
| --- | --- | --- | --- |
| Device | `devices/<role>.py` | `public/models/<role>.glb` | client, router, switch, firewall, honeypot, cache, power, balancer, rack, phantom |
| Installation | `installations/<kind>.py` | `public/models/installations/<kind>.glb` | tap, jammer, spike, anchor, breaker |
| Prop | `props/<name>.py` | `public/models/props/<name>.glb` | crate, fragment |
| Board | `boards/<name>.py` | `public/models/boards/<name>.glb` | table (the tabletop textures), copper, glass, blackout, regent, cantor, core |
| Crest | `boards/crests.py` | `public/models/boards/crests/<leader>.glb` | leech, wraith, prophet, serpent, moth, sentinel, colossus, weaver, storm, widow, marshal, choir, reaver, foreman, nest, demolition, blight |

The game loads devices, installations and props at startup (`src/three/models.ts`); until a file
arrives (or if one fails) a device falls back to the primitive body in `src/three/devices.ts`, and
an installation or prop to the code-built body World.ts keeps for it. Boards and crests load on
demand, one battle's board at a time (see [The battle board](#the-battle-board)).

```
npm run models                          # rebuild every model that has a script
npm run models -- router tap crate      # rebuild some (names are unique across families)
npm run models -- router --render out   # also write out/router.png previews
npm run models -- jammer --render out --azimuth 0,35 --no-export
npm run models -- jammer --no-export --detail   # list the largest parts by triangle count
npm run models -- copper --render out           # a board, previewed under the game's camera
```

`npm run models` needs Blender 4.2 or newer. It finds a standard install on
Windows (also from WSL) and macOS; otherwise set `BLENDER=/path/to/blender`.
The scripts run with `--factory-startup`, so your Blender preferences are never
read or written. The GLBs are committed, so contributors without Blender can
still run the game. Each build prints one `MODEL {…}` report line (triangles,
draw calls, bytes and any problems); the command fails if any model leaves its
envelope or budget.

`npm run models` runs up to six Blender processes at once; name one model per command to build one
at a time. To see models in the real renderer, open the dev harness gallery:
`/dev/world-preview.html?scene=gallery` (add `&cam=x,y,z&target=x,y,z` for a
close-up, `&lid=-1.9` to open the crate), or capture it with `dev/preview-shots.ts`
and `QUERY=`. Its back rows hold one of every device (with the stateful and sentry
firewalls, the rack and the phantom); the front row holds the five installations in
their kind colours and the two props.

## Layout

- `build.py`: entry point run inside Blender (`blender -b --python build.py -- <names>`); the
  `ROLES`, `INSTALLATIONS`, `PROPS`, `BOARDS` and `CRESTS` tuples (kept in step with `scripts/models.ts`).
- `lib/faultline.py`: shared materials, primitives, hooks, envelopes and budgets, consolidation,
  export and preview render.
- `devices/<role>.py`, `installations/<kind>.py`, `props/<name>.py`: one file per model, each
  defining `build(name)`.
- `boards/kit.py`: the board frame every board is built from; `boards/<board>.py` one per stage and
  guardian; `boards/crests.py` every leader's crest; `boards/surface.py` (numpy, no bpy) draws the
  tabletop, `boards/table.py` writes it; `boards/mark.py` reads the containerlab mark from
  `public/containerlab-mark.svg`.

## The contract with `src/three/models.ts`

**Space.** Units are game units. Build Z-up, facing **-Y** (that side faces the
table camera, which looks down at about 34°).

| Family | Origin | Envelope | Budget | Label |
| --- | --- | --- | --- | --- |
| Device | centre of the plinth base; the body starts at `PLINTH_TOP` (z = 0.95), the plinth is built in code | z 0.95–2.45, radius 0.72, moving parts 0.9 | ≤ 6,000 triangles, ≤ 20 draw calls, ≤ 250 KB | 2.86 |
| Installation | the table point (z = 0), no plinth | z 0–1.9, footprint radius 0.6, moving parts 0.75 | ≤ 3,000 triangles, ≤ 8 draw calls, ≤ 120 KB | 2.3 |
| Prop | the table point (z = 0), no plinth | z 0–1.2, radius 0.5 | ≤ 1,500 triangles, ≤ 4 draw calls, ≤ 60 KB | none |

`build.py` reports anything outside the family's envelope or budget (`ENVELOPES`
and `BUDGETS` in the library). A script may move its own ceiling with a
module-level `MAX_TOP` and loosen a budget key with a module-level `BUDGET` dict;
each such exception is explained in the script's docstring:

| Script | Exception | Why |
| --- | --- | --- |
| `devices/client.py`, `devices/power.py` | `MAX_TOP` 2.55 / 2.6 | their labels float at 3.0 / 3.05 |
| `installations/tap.py` | `MAX_TOP` 2.2 | the faint uplink funnel rises to 2.2, under the label at 2.3 |
| `installations/breaker.py` | `MAX_TOP` 1.0 | the Breaker Charge stays low (lamp included) |
| `props/crate.py` | `BUDGET` 5 draw calls | four named materials fill the body and the lid must be its own mesh |
| `devices/phantom.py` | `PLINTH = False` | previewed without the plinth, as World.ts draws it |

**Materials** are matched by name at runtime and rebuilt per body, so offline
hardware can be greyed out and a scrubbed installation can dissolve on its own:

| Name | In game |
| --- | --- |
| `role_luminous` | the body's luminous metal (colour × 0.4, glowing in the colour) |
| `role_glow`, `role_glow_soft`, `role_glow_faint` | unlit in the colour at opacity 1 / 0.45 / 0.12 |
| `role_wire` | unlit wireframe in the colour |
| `glow_*` | unlit, fixed colour (opacity from the material's `opacity` custom property) |
| `wire_*` | unlit wireframe, fixed colour |
| anything else | lit metal (`MeshPhysicalMaterial`) with the exported colour, metalness and roughness |

"The colour" is the device's role colour (`COLORS` in `src/three/devices.ts`) or, for an
installation, its kind's colour: World.ts passes a per-kind palette
(`INSTALLATION_COLORS` in `src/three/models.ts`: tap 0xff3f8e, jammer 0x87b5ff, spike 0xe49b72,
anchor 0xbba0e8, breaker 0xff777e, the colours of the hostiles that plant them). Props use a
brass palette. `ROLE_COLORS` in the library is only the preview copy of all of these.

Shared fixed colours for the new families: `glow_uplink` (violet, 0.35, double-sided),
`glow_band` (ivory hazard bands), `glow_cap` (red glass, 0.9), `glow_inner` (amber interior),
`glow_ribbon` (pale amber, 0.7, double-sided) and `wire_chain` (brass chain line art).
Use the library in `lib/faultline.py` (`material(name, role)`), or `lit()` /
`unlit()` for one-off colours that follow the same naming (`unlit()` also takes
`role_glow*` / `role_wire*` names, e.g. for a double-sided role-coloured field). No textures.

**Hooks and parts** are custom properties on an object (exported as glTF extras):

| Property | Effect |
| --- | --- |
| `hook = "floater"` | devices: bobs and turns slowly; installations and props: bobs, sways about its origin and turns |
| `hook = "spinner"`, `speed`, `axis` (`"y"` = up, default) | turns continuously |
| `hook = "blinker"`, `speed`, `phase`, `base` | an LED or lamp: its unlit material blinks (opacity `base` when on) |
| `variant = "<flag>"` | devices only: exists only when the node has that flag, e.g. `"stateful"`, `"sentry"` |
| `part = "<name>"` (`fl.part()`) | a moving part World.ts drives itself, e.g. the crate's `"lid"`; never merged, identity rotation, origin at its pivot |

A hooked object turns about its own origin, so place the origin at the pivot.
`build.py` bakes rotation and scale into hooked meshes; a hooked parent with
children must keep identity rotation and scale (use `empty()` as a holder).
Children of hooked objects move with them. A named empty (e.g. `sentry_beam` at
the sentry searchlight's lens) is exported as a node World.ts can find by name.

Hooks and parts per model (what World.ts drives):

| Model | Hooks and parts |
| --- | --- |
| tap | `core` floater with the `core_star` spinner (1.1) inside; `shards` spinner (−1.6) |
| jammer | `yoke` spinner (0.35): the dish sweeps |
| spike | none (a static threat) |
| anchor | `lantern` floater, origin at its hook (0.12, −0.14, 1.8), so the sway swings it |
| breaker | `lamp` blinker (speed 1.5, base 0.9); World.ts sets its speed to 4 at countdown 1; lamp top at 0.98 |
| rack | four `lamp*` blinkers (slow, staggered) |
| phantom | `core` floater |
| firewall | variant `sentry`: `sentry_mast` and the `sentry_yoke` spinner (0.5); `sentry_beam` empty at the lens |
| crate | `crate_lid` part `"lid"`, hinged on the back edge (0, 0.25, 0.36); three.js opens it with `rotation.x` → −1.9 |
| fragment | `ribbon` floater, turning about its root on the crack |

**Building blocks.** `box`, `prism` (a flat side faces -Y; `polar(sides, r)` gives
the face centres), `cylinder`, `tube`, `torus` (dashed with `gaps`), `dome`, `octahedron`,
`tetrahedron`, `icosphere` and `sphere` cover most shapes; `sweep` runs a tube along a
polyline (cables, legs, a fuse coil), `strip` a flat ribbon, and `lines` draws line art for
`wire_*` / `role_wire` materials (one sliver triangle per segment, so a wireframe shows clean
edges without quad diagonals; `loop()` turns a polyline into segments). `transform` moves
built parts together, `rest_on` drops a loose chip onto the table. For custom geometry
build a bmesh and pass it to `from_bmesh()`, then `finish()` for bevels and shading.

**Budget.** Static parts are merged into one mesh per material (`consolidate()`),
so draw calls are roughly materials + hooked parts. A hooked part built from many
pieces should be merged too: `merge(name, parts, pivot)` joins same-material parts
with the origin at the pivot, and `merge_onto(holder, parts)` merges per material
under an `empty()` holder (a spinner's arms, an orbiting ring of slates). A variant
part is never merged into the body, so merge its static pieces into one mesh yourself.
There are no textures; detail comes from bevels, panels, material contrast and light.

**Reproducible builds.** Rebuilding an unchanged script leaves its GLB untouched
(triangle order is canonicalised, and float noise below 1e-4 keeps the old file),
so `git diff` only shows models whose scripts changed.

**Shared overlays stay in code:** for devices the plinth (not for the phantom),
selection skirt, shield bubble, upgrade crown, amplifier ring, salvage scrap, condition
pips and the fault warning; for installations the stain decal, pulse ring, light, label and
integrity pips, reach and blast rings, countdown numeral, beams and the scrub dissolve; for
props the landing arc, lid animation and callouts. `World.ts` adds them around whatever
body the model provides.

## The battle board

The table is a Blender board chosen once per battle (`boardFor` in `src/three/board.ts`, called from
`syncWorld`): the stage's board (I copper, II glass, III blackout) dressed by the leader's crest in
the leader's colour; a guardian's own board (regent, cantor, core); for a leaderless duo the stage's
board in its first hostile's colour; Field Training and an empty table the plain stage board. It
reads the encounter's room first, so a death or a newcomer never swaps it. World.ts keeps its
code-built table until the board has loaded (`World.setBoard`), and the test renderer skips the
tabletop textures. Preview any board with `/dev/world-preview.html?board=<spec>`: `glass`, `regent`,
`copper:leech`, or a leader id on the stage's board (`widow&stage=1`).

**Space.** Z-up, facing -Y as for every family; the origin is the centre of the table surface
(z = 0, placed at y 0.6 in World.ts's table group, world y 0.18). The play area is x -8..8,
y -5.2..5.2 with the bands at y 3.25 (north), 0 (center) and -3.25 (south), dividers at y ±1.3.

| Part | Where |
| --- | --- |
| Tabletop | not modelled: World.ts lays the textures on a 16.5 × 10.7 plane filling the well (x ±8.25, y ±5.35) |
| Lip | a brass chamfer from the well's edge up to the rails (z 0.1) |
| Rails | near: accent lights, then the fascia sloping toward the camera (the front the camera sees above the hand, with the medallion); far: a cable trough and the crest mount at (0, 5.95); sides: a trough and the band lamps |
| Corners | machined blocks at (±8.85, ±5.85), tops at z 0.3 (near) and 0.16 (far: the hostile portraits stand above the far rail) |
| Bands | brass dividers across table and rails; NORTH / CENTER / SOUTH stencilled into the deck in each band's south-west corner; a lamp strip in both side rails |

| Family | Envelope | Budget |
| --- | --- | --- |
| Board | x ±9.45, y ±6.45, z -1.7..1.0 | ≤ 36,000 triangles, ≤ 28 draw calls, ≤ 1,100 KB |
| Crest | the same box; sigil within 1.7 × 0.8 on the mount, finials within 0.46 (near) and 0.28 (far) of their block | ≤ 5,000 triangles, ≤ 10 draw calls, ≤ 200 KB |

A whole board stays within 40,000 triangles and 30 draw calls: a stage board's slots are hidden
when its crest replaces them. Per battle the download is one frame (~0.9 MB), one crest (≤ 0.1 MB)
and three tabletop textures (~0.8 MB), well under 3 MB; `src/core/boards.test.ts` checks all of it.

**Tabletop textures** (`npm run models -- table`, drawn by `boards/surface.py`): `table-<deck>.jpg`
(base colour, sRGB: copper, glass, blackout per stage; regent, cantor, core per guardian),
`table-normal.jpg` (OpenGL/glTF tangent space) and `table-rm.jpg` (G roughness, B metalness), 2048 ×
1328, row 0 = north. Every board shares the normal and roughness maps. The deck: machined plates with
seams and screws, a faint etched grid, an etched border with brass brackets and network traces in
each band, and the containerlab mark inlaid in the centre inside an etched ring gate.

**Materials** (matched by name in `src/three/board.ts`; a crest's `board_*` materials take the board's
instances, so one crest dresses any stage):

| Name | In game |
| --- | --- |
| `board_steel`, `board_panel`, `board_trim`, `board_trim_bright`, `board_ivory`, `board_rubber`, `board_enamel`, `board_container` | lit metal in the board's palette (`STYLES` in `boards/kit.py`) |
| `accent_glow`, `accent_glow_soft`, `accent_glow_faint`, `accent_luminous` | the board's accent colour: the leader's colour (`src/core/enemies.ts`), else the board's own (`BOARD_ACCENTS`) |
| `glow_*` | unlit, fixed colour (`glow_lamp`, `glow_ring`, `glow_mark` the containerlab blue, `glow_glass`, `glow_ember`) |
| `band_<zone>_label` | the band's stencilled name: lit worn ivory; World.ts sets its emission to the band's state colour (targeted, field, INCOMING) |
| `band_<zone>_lamp` | the band's rail lamps: unlit, World.ts sets colour and opacity; they blink under an INCOMING warning |

**Slots** (glTF extra `slot` on an empty, `fl.slot()`): a stage board's `crest` (the ring-gate emblem
on the far rail) and `finial` (the four corner beacons). A crest model brings both; the board hides
its own. Hooks as elsewhere: `spinner` (the colossus cog, the storm rings) and `blinker` (the Blackout
Core's reactor core).

**Guardians** build on the kit with their own fascia modules, corner dressing, crest and extras
(`kit.build_base(style, corner, crest, extras)`): the Iron Regent's gatehouse (gate leaves, crenellated
towers, copper armour, a crown over a barred arch), the Hollow Choir's instrument (resonator pipes,
glass bells, tuning rods, pipes before a rose window), the Blackout Core's containment (shielded
portholes, coils round a red core, coolant pipes, a pulsing reactor ring).

**Crests** come in motif families, each leader its own arrangement: maw (leech), hook (wraith), halo
(prophet), coil (serpent), wing (moth), gate (sentinel), weight (marshal), gear (colossus), hammer
(foreman), web (weaver), reactor (storm), dial (demolition), shard (widow), bell (choir), blade
(reaver), pod (nest), root (blight).

The containerlab mark (`public/containerlab-mark.svg`, MIT, `public/containerlab-mark.LICENSE.txt`)
is inlaid in the tabletop and set in brass on the fascia's medallion; both are drawn from the SVG's
own paths.
