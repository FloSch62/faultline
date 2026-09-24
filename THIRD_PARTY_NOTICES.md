# Third-party notices

Project code and project-created assets are released under the root MIT `LICENSE`, to the extent of the contributors' licensable rights. The following third-party materials retain their original terms.

`public/containerlab-mark.svg` is copied from `containerlab-app/apps/web-public/resources/containerlab.svg` in the adjacent Containerlab app repository. That repository is published under the MIT License, copyright (c) 2026 SRL Labs. The license text is included in `public/containerlab-mark.LICENSE.txt`. The battle board models in `public/models/boards/` and their tabletop textures include artwork derived from this mark under the same license.

The `.clab.yml` exporter follows the topology structure shown in the adjacent Containerlab examples. Runtime behavior is not embedded or copied into the game.

## Prototype

The deterministic network game rules and the initial Three.js scene were adapted from the user-provided adjacent `network-architect-game` project. This project has independent assets, presentation, progression, audio, persistence keys, dependencies and build outputs.

## Typography

Cinzel, Grenze, Grenze Gotisch, Alegreya and Alegreya Sans SC are bundled locally as Latin WOFF2 subsets. The fonts were obtained from the Google Fonts repository and are distributed under the SIL Open Font License 1.1. The subsets map digits to each face's own lining figures; no glyphs were redrawn. Their license texts are in `public/fonts/Cinzel-OFL.txt`, `public/fonts/Grenze-OFL.txt`, `public/fonts/GrenzeGotisch-OFL.txt`, `public/fonts/Alegreya-OFL.txt` and `public/fonts/AlegreyaSansSC-OFL.txt`.

## Artwork

The original environment paintings, original card illustrations, hostile sprites and interface textures in `public/art/` were generated for this game using OpenAI image generation. The individual paintings in `public/art/cards/` use OpenAI image generation for Honeypot and Cache Server, and local Krea 2 Turbo for the other 37 cards. The four later-stage environments in `public/art/stages/` were generated with local Krea 2 Turbo, guided by the original relay cathedral painting. The escort, leader and guardian-add sheets (`public/art/hostiles-escorts.png`, `public/art/hostiles-front.png`, `public/art/hostiles-adds.png`), the message fragment and crate illustrations (`public/art/message-fragment.png`, `public/art/crate.png`) and the warning plate (`public/art/ui/warning-plate.webp`) were generated with local Krea 2 Turbo, guided by existing game art, and cut out with `scripts/compose_sheet.py` (rembg, isnet-general-use) where they need transparency. The three keeper portraits in `public/art/keepers/` were generated with local Krea 2 Turbo, guided by the original Switch card painting. Prompts, seeds, production settings and asset paths are documented in `docs/art-prompts.md`, `docs/art-v3-prompts.md`, `docs/art-v3-manifest.json`, `docs/art-stage-manifest.json` the `docs/art-v4-*-manifest.json` files and `docs/art-keepers-manifest.json`. No Slay the Spire art, music, characters or code is bundled.

Krea 2 is provided under the Krea 2 Community License, preserved in `public/art/cards/KREA-2-COMMUNITY-LICENSE.txt`. Its commercial-use terms for the model and its outputs include a company-wide annual revenue threshold below USD 1 million. Those terms remain applicable to Krea-generated artwork. The model weights and the ComfyUI production environment are not distributed with this game.

## Soundtrack

The music was generated locally with the official `m-a-p/YuE2-3B` model and `m-a-p/YuE2-Vae` listening decoder, using original instrumental score plans. The complete native recordings are preserved; FFmpeg applies delivery fades, a constant volume adjustment and browser encoding. No source separation or denoising is applied. See `soundtrack/README.md` for source versions, the production pipeline and limitations of automated speech checks. The prompts, score files and master metadata are published in `soundtrack/`. Native recordings and lossless WAV masters are generated locally and excluded from Git.

YuE inference code is Apache-2.0. The official model-weight license is preserved separately in `soundtrack/licenses/YuE2-MODEL_LICENSE`, including its additional permissions; the model weights are not distributed with the game. Production tools are used during asset creation, not embedded in the browser bundle.

## Sound effects

Kenney's [Impact Sounds](https://kenney.nl/assets/impact-sounds),
[Casino Audio](https://kenney.nl/assets/casino-audio),
[Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds),
[Interface Sounds](https://kenney.nl/assets/interface-sounds),
[UI Audio](https://kenney.nl/assets/ui-audio), and
[RPG Audio](https://kenney.nl/assets/rpg-audio) are Creative Commons Zero
(CC0-1.0). Selected source recordings and original licenses are retained in
`soundtrack/effects/sources/`. The layered delivery masters are bundled in
`public/audio/effects/`. Recipes, hashes and measured levels are recorded in
`soundtrack/effects/manifest.json`; reproduce them with `scripts/build_effects.py`.

## Runtime libraries

Three.js is MIT licensed. Its license is supplied by the npm package. Vite, TypeScript and Playwright are development dependencies with their respective package license files. Versions and transitive dependencies are recorded in `package-lock.json`.
