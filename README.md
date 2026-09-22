# FAULTLINE

**A Containerlab odyssey. Every connection matters.**

A desktop deckbuilding roguelike set in a ruined orbital relay. Build a working signal path on a 3D table, survive network faults, and carry your deck through a branching expedition to the Blackout Core.

**[Play in your browser](https://flosch62.github.io/faultline/)** · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

An independent open-source fan game in the Containerlab universe. **Playable alpha 0.3**, focused on laptop and desktop.

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
npm run balance -- 500 # Reproducible seeded balance probe
npx playwright install chromium
npm run test:e2e    # Actual browser gameplay, desktop layout and audio playback
```

Playing requires no API keys, GPU music model, Containerlab daemon, or external asset service. All artwork, fonts and playable music are bundled. Hardware-accelerated WebGL is recommended. Desktop is the primary target; this pass was checked at 1366×768, 1440×900 and 1920×1080.

## Inside the alpha

- One complete seven-sector act with a branching route, recovered messages, five distinct hostile mechanics, elite rewards, sanctuaries and a two-phase Blackout Core.
- Three distinct starter decks: the Architect builds efficient routes, the Warden absorbs mistakes, and the Ghost trades protection for card flow and bursts.
- **35 cards and nine persistent relics.** Common through legendary rewards support redundant networks, fortified circuits and burst turns. Powerful effects exhaust until the next encounter.
- Router placement matters. Independent north/south circuits grant shield; moving installed hardware costs energy. A Wraith hunts your longest exposed cable; a Null Storm threatens a visible band.
- Exact damage and shield calculations, signed enemy armor modifiers, displayed fault targets, highlighted signal routes and a combat journal. Forecast and resolution use the same rules.
- An optional seven-step practice encounter that never replaces your expedition. Undo, card inspection, searchable rarity filters, starting-deck previews, quick transmissions, reduced motion and keyboard device management.
- Local autosave, continuation, a shared UTC daily seed and local run records. Existing version-2 saves retain their progress and receive defaults for the new combat resources.
- Expanded painted artwork, a new sanctuary scene, device deployment and shield effects, and three original instrumental tracks.
- A Containerlab topology exporter. Combat is a browser simulation; exported labs need suitable images and real device configuration before they can route traffic.

Read the [complete implemented game design](docs/game-design.md), [story and world](docs/narrative.md), and [measured balance results](docs/balance-alpha.json). Simulated win rates are regression probes; human playtesting remains necessary to tune difficulty and enjoyment.

### Discover the signature cards

| Card | Rarity | Energy | Effect |
| --- | --- | --- | --- |
| Containerlab | Rare | 3 | Deploy an overclocked router linked to ALPHA and OMEGA. A fresh route deals 7 damage. Exhaust. |
| Clabernetes | Legendary | 2 | Replicate a router and its links/configuration. Protect both from jams. Independent routes add 2 damage. Exhaust. |

These are discoveries, **not starter cards**. Opening hands provide a Core Router and two Optic Fibers so every deck can build its own route. Clabernetes has a lower individual reward chance than Containerlab. Startup Config, Linux Bridge, VXLAN Tunnel and Clab Inspect bring more of Containerlab's vocabulary into everyday builds.

**Wireshark** is an uncommon, one-energy packet capture. It draws two cards and adds one temporary damage for each distinct hardware type on the live route, up to three. A mixed router, switch and firewall circuit earns the full burst. The card exhausts for the encounter, and its journal entry shows exactly what it captured.

[See Wireshark's card and synergy explanation](docs/screenshots/wireshark.png).

## Controls

| Action | Control |
| --- | --- |
| Play a card | Click, or press 1–9; 0 selects the tenth card |
| Inspect a card | Right-click, press I on a focused/selected card, or select it in the archive |
| Place hardware | Click the table, drag its card, or use “Deploy in a free socket” |
| Connect devices | Play a link, then choose two devices on the table or in the target strip |
| Replicate / upgrade / shield | Play the card, then choose a valid device |
| Relocate hardware | Drag a placed device, or use Devices & placement; costs 1 energy |
| Orbit the table | Drag empty table space |
| Transmit / end turn | Brass dial, Space or Enter; focused buttons retain normal keyboard behavior |
| Undo before transmitting | Z |
| Cancel selection / settings | Escape |

Faults last one player turn. Hot Patch clears them immediately. Energy returns to five plus reserves and the hand is redrawn after each transmission. Temporary shield and burst expire; hardware remains until the encounter ends. Exhausted cards return next encounter. Integrity carries between sectors.

## Project guide

- `src/core/` — deterministic rules, topology graph, expeditions, persistence and YAML export.
- `src/three/World.ts` — table, devices, cables, painted enemies, lighting and packet animation.
- `src/ui.ts`, `src/alpha-ui.ts`, `src/style.css`, `src/alpha.css` — illustrated cards, painted instruments, inspection and tutorials.
- `src/story.ts` — chapters, enemy motivations, sanctuary discoveries and endings.
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
