# Painted artwork

The final PNG assets are in `public/art/`. They were created with OpenAI image generation, then copied into this project. No external asset service is needed to run the game.

## Card and interface prompts

These are the final prompts for the September 22 refinement pass.

### containerlab.png

Use case: stylized-concept. Asset: a final square full-bleed illustrated legendary card artwork for CONTAINERLAB, in FAULTLINE's hand-painted orbital-cathedral sci-fi game world. Central subject: a magnificent weathered brass alchemist's laboratory flask shaped like a hexagonal lantern, containing a luminous living miniature network: several tiny modular shipping containers and router towers interconnected by fine glowing teal and gold optical paths. The central flask rests on an ancient engineering workbench, with tiny energy connectors and thick worn cables leading to the edges. A circular copper armillary frame arches around the flask like a holy relic. Visual storytelling: a whole intricate working network brought to life inside one vessel. Deep indigo mechanical cathedral backdrop, warm amber dust, pale teal glass, carved tarnished metal, realistic intricate detailing with rich oil-paint brushwork and restrained magical illumination, premium collectible card game illustration. Strong readable central silhouette, square composition, no text, no card frame, no UI, no lettering, no watermarks. This must look like a lovingly painted, powerful rare artifact, coherent with the abandoned gothic orbital station theme.

### clabernetes.png

Use case: stylized-concept. Asset: final square full-bleed illustrated legendary card artwork for CLABERNETES, in FAULTLINE's hand-painted orbital-cathedral sci-fi game. Subject: a majestic cluster of three floating miniature industrial citadels built from weathered modular shipping containers and intricate router towers, each with a glowing pale cyan energy core. They orbit a large ancient seven-spoked brass ship's wheel held vertically in the center, like a sacred navigational relic. Golden optical threads arc between the three citadels and the wheel, making their redundant connections visually clear. Clouds and mist curl below, with a ruined orbital cathedral behind. Premium collectible card illustration, rich oil-paint brushwork, carved tarnished brass, worn ivory metal, deep indigo shadows, restrained amber and teal illumination, intricate tangible engineering detail. Strong central silhouette and clean square composition. NO text, NO lettering, NO UI, NO card border, NO watermark. Match a dark atmospheric fantasy-meets-network-engineering game rather than flat corporate illustration.

### transmit-dial.png

Use case: stylized-concept. Asset type: a single finished raster game UI activation dial, isolated on a genuinely transparent alpha background. Primary subject: an exquisitely hand-painted circular brass astrolabe control for a dark orbital-cathedral tactical card game. Perfect front-facing orthographic view, circular and symmetrical, no perspective tilt. Weathered antique gold and dark gunmetal concentric rings, fine engraved calibration ticks, beautifully intricate mechanical filigree, three tiny pale amber light stones at the rim, very restrained orange backlight in cracks. Thin pointed compass ornaments at north south east west. The interior central disc, roughly the central half of the diameter, is near-black worn obsidian and stays EMPTY so a game can place its own number there. Outer diameter fills 90 percent of a square image, all space outside the clean intricate silhouette is genuinely transparent; no background, no backdrop, no checkerboard baked in, no shadow rectangle. Premium painterly collectible game interface asset, tactile irregular worn metal, muted ivory highlights. NO words, NO letters, NO numbers, NO symbols in central disc. A beautiful physical ancient transmission switch that belongs in a gothic science fiction painting.

### readout-frame.png

Use case: stylized-concept. Asset: finished painted UI frame for a premium dark sci-fi fantasy card game. One tall narrow upright rectangular information plaque, width to height ratio approximately 2:3, perfectly front-facing orthographic. A beautiful subtle antique brass frame with worn engraved edges and tiny geometric filigree in its corners, dark brushed obsidian and midnight indigo enamel on the large blank interior. Top center has a small diamond-shaped amber glass jewel set in an understated arch, matching the fine mechanical details of an abandoned gothic orbital cathedral. Bottom corners have tiny tarnished brass wings and fine copper wiring. Restrained, aged, elegant, premium, tactile hand-painted realism. The center must be EMPTY and VERY DARK, an even charcoal indigo, and occupies at least 80 percent of the width and height, ready for readable game information later. No divisions or internal decorations. All background outside the plaque silhouette is GENUINELY TRANSPARENT alpha, no rectangular background shadow, no checkerboard baked into the image. NO words, NO letters, NO numbers. The plaque fills 95 percent of image. Portrait composition, finely detailed worn metal, no bulky armor, no bright glowing neon.

## Environment and original deck direction

These briefs describe the original art direction; they are not exact generation transcripts.

- `relay-cathedral.png`: derelict orbital gothic relay, monumental amber armillary ring on the right, lone engineer, deep indigo shadows, clear dark space for the title on the left.
- `relay-interior.png`: ruined mechanical cathedral, atmospheric light, dark empty center for the 3D network table, intricate worn machinery around the sides.
- `card-atlas.png`: a 3 × 3 illustration sheet. Router / switch / firewall; optical cable / crosslink / shield; welding repair / energy turbine / firmware. Weathered brass, pale teal, muted amber.
- `hostiles.png`: three individually readable creatures on transparent alpha: brass insect drone, ivory armored sentinel, molten red-black core.

The UI uses real HTML text above these assets. The world, circuit table, hardware, cables, particles and packet motion are rendered in Three.js. Icons are inline SVG.
