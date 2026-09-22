# FAULTLINE

**A Containerlab odyssey. Every connection matters.**

A desktop deckbuilding roguelike set in a ruined orbital relay. Build a working signal path on a 3D table, survive network faults, and carry your deck through a branching expedition to the Blackout Core.

**[Play in your browser](https://flosch62.github.io/faultline/)** · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

An independent open-source fan game in the Containerlab universe. Work in progress.

![The relay](docs/screenshots/title.png)

## Play locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open **http://localhost:5174**. Music starts after the first interaction. Headphones recommended.

```sh
npm run build       # Type checking and production build in dist/
npm run preview     # Serve the production build
npm test            # Deterministic game rules and save migration
npx playwright install chromium
npm run test:e2e    # Actual browser gameplay, desktop layout and audio playback
```

Playing requires no API keys, GPU music model, Containerlab daemon, or external asset service. All artwork, fonts and playable music are bundled. Hardware-accelerated WebGL is recommended. Desktop is the primary target; this pass was checked at 1366×768, 1440×900 and 1920×1080.

## Inside the expedition

- One complete seven-sector act with branching routes, five hostile types, salvage, sanctuaries, elite encounters and a final boss.
- Three starting architects with distinct integrity, relics and decks.
- Eleven illustrated cards, five persistent relics, card rewards, undo before transmission, a card archive and field guide.
- Physical network building with draggable hardware, live cables, visible enemy intentions, packet animations, jammed nodes and severed links.
- Local autosave, continuation, a shared UTC daily seed and local run records.
- Three original YuE2 instrumental tracks with scene crossfades, sound effects, volume controls and reduced motion.
- A Containerlab topology exporter. Combat is a browser simulation; exported labs need suitable images and real device configuration before they can route traffic.

### The two signature cards

| Card | Energy | Effect |
| --- | --- | --- |
| Containerlab | 3 | Deploy an overclocked router linked to ALPHA and OMEGA. A fresh route deals 7 damage. |
| Clabernetes | 2 | Replicate a router with its existing links and overclock. Shield both routers from jams. Independent routes add 2 damage. |

Both are in starting decks and the reward pool. Containerlab appears in each opening hand alongside a router and two fibers. Existing saves receive the new cards in the deck and, during combat, the draw pile, without resetting progress. Cloning a router only creates an independent route when its surrounding topology permits one.

## Controls

| Action | Control |
| --- | --- |
| Play a card | Click, or press 1–9 |
| Place hardware | Click the table, drag its card, or use “Deploy in a free socket” |
| Connect devices | Play a link, then choose two devices on the table or in the target strip |
| Replicate / upgrade / shield | Play the card, then choose a valid device |
| Move hardware | Drag a placed device |
| Orbit the table | Drag empty table space |
| Transmit / end turn | Brass dial, Space or Enter; focused buttons retain normal keyboard behavior |
| Undo before transmitting | Z |
| Cancel selection / settings | Escape |

Faults last one player turn. Hot Patch clears them immediately. Energy returns to five and the hand is redrawn after each transmission; hardware remains until the encounter ends. Integrity carries between sectors.

## Project guide

- `src/core/` — deterministic rules, topology graph, expeditions, persistence and YAML export.
- `src/three/World.ts` — table, devices, cables, painted enemies, lighting and packet animation.
- `src/ui.ts`, `src/style.css` — illustrated cards, menus and painted battle controls.
- `src/main.ts` — input, view transitions, targeting, undo and autosave.
- `src/audio.ts` — music playback, crossfades and synthesized interaction effects.
- `public/art/` — finished game artwork; [prompts and art direction](docs/art-prompts.md).
- `public/audio/` — the three final instrumental Ogg masters.
- `soundtrack/` — prompts, original scores, generation metadata, provenance and licenses. Large production recordings and intermediate arrays are generated locally and ignored by Git.
- [Soundtrack production](soundtrack/README.md) — exact model versions and reproduction steps.
- [Third-party notices](THIRD_PARTY_NOTICES.md).

## GitHub Pages

The [Checks and Pages workflow](.github/workflows/pages.yml) runs rule tests, builds the game for its repository path, plays the production build in Chromium, and publishes successful pushes to `main`. Pull requests run the same checks without deploying.

To preview the Pages build locally:

```sh
VITE_BASE_PATH=/faultline/ npm run build
VITE_BASE_PATH=/faultline/ FAULTLINE_TEST_BUILD=true npm run test:e2e
```

To publish a fork, enable GitHub Pages with **GitHub Actions** as the source, then run the workflow. Its base path follows the repository name.

## License and credits

Project code and project-created assets are available under the [MIT license](LICENSE), to the extent of the contributors' licensable rights. Bundled fonts, the Containerlab mark and third-party libraries retain their [original licenses](THIRD_PARTY_NOTICES.md). YuE2 model weights are not included; their separate license is preserved with the soundtrack provenance.

Artwork was created with OpenAI image generation. The instrumental score was generated locally with YuE2, with vocal stems removed using Demucs. Prompts, score plans and production details are included.

![A live network encounter](docs/screenshots/battle.png)
