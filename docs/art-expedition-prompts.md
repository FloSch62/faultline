# Expedition artwork

Generated with the built-in imagegen tool. Final RGBA assets are copied into `public/art/` and sampled as atlases without altering their pixels.

## public/art/hostiles-expedition.png

Three columns by two rows: Coil Serpent, Ash Moth, Null Marshal, Glass Choir, Wire Weaver, Grave Reaver.

Generation prompt:

Use case: stylized-concept. Asset type: single transparent game sprite atlas for FAULTLINE, a painterly dark science fiction card battler. Create ONE landscape atlas with exactly six isolated full-body hostile machines in a precise 3-column by 2-row grid, equal square cells, no borders or writing. Each figure entirely inside its own cell with generous 12% transparent padding, all figures similar height. Original silhouettes, exquisite hand-painted brass, oxidized copper, cracked porcelain and luminous crystal, warm chiaroscuro with restrained colored glow. Row one left: COIL SERPENT, a floating coiled mechanical cobra of copper ribs with an emerald energy spine; row one middle: ASH MOTH, a symmetrical moth drone with long torn ivory metal wings and cyan lenses; row one right: NULL MARSHAL, a broad floating armored lawkeeper with a great shield, a single blue eye, and weathered ivory plating. Row two left: GLASS CHOIR, three small violet glass bell faces suspended together inside an intricate floating brass cage, one unified creature; row two middle: WIRE WEAVER, a lean dark bronze spider machine with six angular hooked legs and glowing golden thread; row two right: GRAVE REAVER, a tall skeletal rust-red machine with two curved scythe forearms, a crimson heart and trailing chain ribbons. Centered front three-quarter view, readable at small sizes. No environment, no ground shadows, no text, no labels, no UI, no extra characters. Genuinely transparent RGBA background. A cohesive production sprite sheet, no cell overlaps or cropped appendages.

Final edit prompt (transparent background and cell containment):

Edit this sprite atlas for actual in-game use. Preserve all six creature designs and their painted detail. Remove ALL background haze, brown atmosphere, gradients and shadows so EVERY pixel outside the creature silhouettes is fully transparent alpha zero. Do not replace with checkerboard, black, gray or any other background. Keep only the opaque creatures and a tight few-pixel glow along luminous parts. Keep a precise 3 columns by 2 rows grid with equal square cells, and shrink each creature slightly inside its cell so no part crosses cell boundaries. Especially reduce the top-middle moth's width to fit within the middle third. Each figure must have at least 8 percent clear transparent padding on all four sides within its own cell. No labels, text, outlines, grids, or additional objects.

## public/art/stage-guardians.png

Two horizontal cells: Iron Regent, Hollow Choir. Blackout Core retains its original artwork in `public/art/hostiles.png`.

Final prompt:

Use case: stylized-concept. Asset type: ONE transparent PNG sprite atlas containing two original final-stage guardians for a painterly dark science fiction deckbuilding game. Exact 2-column by 1-row grid, equal square cells. Isolated full body creatures, no scenery, no text. Left cell: THE IRON REGENT, an imposing ancient floating machine king, massive layered ivory and brass armor, tall crowned helmet with a small green eye, two enormous armored gauntlets flanking a luminous emerald reactor, broken copper halo behind its head, regal and intimidating silhouette, like an ornate mobile fortress. Right cell: THE HOLLOW CHOIR, an enormous floating violet crystal cathedral bell with a porcelain mask, multiple small faceless masks orbiting its shoulders, a complex gilded mechanical ribcage and flowing purple glass ribbon tendrils; eerie, majestic, symmetrical silhouette with violet inner light. Intricately hand-painted aged metal and crystalline detail, dramatic restrained lighting, readable at thumbnail size, cohesive style. Each subject entirely within its own cell, centered with 10 percent transparent margin on every side, no appendages crossing center line, same visual height. Actual alpha transparency: pixels outside each silhouette must be fully transparent including between parts. No environment, no colored background haze, no floors, no labels, no grid, no borders. High quality game-ready cutout sprites.

