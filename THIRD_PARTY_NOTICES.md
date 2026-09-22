# Third-party notices

Project code and project-created assets are released under the root MIT `LICENSE`, to the extent of the contributors' licensable rights. The following third-party materials retain their original terms.

`public/containerlab-mark.svg` is copied from `containerlab-app/apps/web-public/resources/containerlab.svg` in the adjacent Containerlab app repository. That repository is published under the MIT License, copyright (c) 2026 SRL Labs. The license text is included in `public/containerlab-mark.LICENSE.txt`.

The `.clab.yml` exporter follows the topology structure shown in the adjacent Containerlab examples. Runtime behavior is not embedded or copied into the game.

## Prototype

The deterministic network game rules and the initial Three.js scene were adapted from the user-provided adjacent `network-architect-game` project. This project has independent assets, presentation, progression, audio, persistence keys, dependencies and build outputs.

## Typography

Cinzel, Barlow and Barlow Condensed are bundled locally. The fonts were obtained from Google Fonts and are distributed under the SIL Open Font License 1.1. Their license texts are in `public/fonts/Cinzel-OFL.txt`, `public/fonts/Barlow-OFL.txt` and `public/fonts/BarlowCondensed-OFL.txt`.

## Artwork

The environment paintings, card illustrations, hostile sprites and interface textures in `public/art/` were generated for this game using OpenAI image generation. The final refinement prompts and asset paths are documented in `docs/art-prompts.md`. No Slay the Spire art, music, characters or code is bundled.

## Soundtrack

The music was generated locally with the official `m-a-p/YuE2-3B` model and `m-a-p/YuE2-Vae` listening decoder, using original instrumental score plans. Demucs `htdemucs_ft` was used to exclude vocal stems; FFmpeg was used for delivery mastering. See `soundtrack/README.md` for source versions, the production pipeline and limitations of automated speech checks. The prompts, score files and master metadata are published in `soundtrack/`. Native recordings and separated stems are generated locally and excluded from Git.

YuE inference code is Apache-2.0. The official model-weight license is preserved separately in `soundtrack/licenses/YuE2-MODEL_LICENSE`, including its additional permissions; the model weights are not distributed with the game. Demucs code is MIT licensed. Their runtime tools are used during asset production, not embedded in the browser bundle.

## Runtime libraries

Three.js is MIT licensed. Its license is supplied by the npm package. Vite, TypeScript and Playwright are development dependencies with their respective package license files. Versions and transitive dependencies are recorded in `package-lock.json`.
