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

Playing requires no API keys, GPU music model, Containerlab daemon, or external asset service. All artwork, fonts and playable music are bundled. Hardware-accelerated WebGL is recommended. Desktop is the primary target. The game defaults to 110% interface scale while browser zoom stays at 100%; compact windows scroll instead of cropping essential controls.

## Inside the alpha

- Three seven-sector stages with seeded, scouted route maps, 16 hostiles, elite rewards and sanctuaries. Every route crosses at least five fights per stage; recovery and reward rooms compete for your route. The Iron Regent, Hollow Choir and Blackout Core guard the stage exits, with cinematic introductions and enraged second phases. Painted enemies have individual wing, limb, coil, spectral and armored motion, attack anticipation, hit reactions, transformations and dissolving defeats.
- Guardian charge turns announce **Crownfall, Requiem and Total Blackout**. Meet the damage threshold on the attack turn to interrupt and expose the boss, or brace with shields. Prepare one card for next turn in place of one draw.
- Sanctuaries offer repair, deck refinement, or a relic at the permanent cost of two maximum integrity. Elite and guardian relics are earned without that cost.
- Three distinct starter decks: the Architect builds efficient routes, the Warden absorbs mistakes, and the Ghost trades protection for card flow and bursts.
- **39 cards and nine persistent relics.** Common through legendary rewards support redundant networks, fortified circuits, persistent zone fields and burst turns. Powerful effects exhaust until the next encounter.
- Router placement matters. Independent north/south circuits grant shield; moving installed hardware costs energy. A Wraith hunts your longest exposed cable; a Null Storm threatens a visible band.
- Exact damage and shield calculations, signed enemy armor modifiers, displayed fault targets, highlighted signal routes and a combat journal. Forecast and resolution use the same rules.
- An optional seven-step practice encounter that never replaces your expedition. Undo, card inspection, searchable rarity filters, starting-deck previews, quick transmissions, reduced motion and keyboard device management.
- Local autosave, continuation, a shared UTC daily seed and local run records. Existing version-2 saves retain their progress and receive defaults for the new combat resources.
- Distinct painted player and enemy frames. Player integrity, shield, damage, burst and every carried relic stay together; enemy health and next intent live opposite. Card rules have reserved space, with a scrollable hand and arrow controls for more than six cards.
- Four field cards: Resonance, Aegis, Purge and Null. Allied fields last three transmissions; enemy corrosion and suppression last two. Cleanse a hostile band or relocate your hardware, with a destination and damage/shield forecast before dropping. Field actions have sound and table effects.
- Six additional roaming enemies: Coil Serpent, Ash Moth, Null Marshal, Glass Choir, Wire Weaver and Grave Reaver. Several hostiles combine device attacks and zone effects. Every threat is forecast, and new hostile fields activate next turn. New expeditions include Resonance Field and Purge Field.
- **25 material sound cues with 43 stereo masters:** card Foley, metal, glass, layered combat impacts, shields, faults, guardian transformations and defeats. Bundled CC0 sources, recipes and licenses are included; music ducks briefly under major impacts.
- Expanded painted artwork, a sanctuary, the Copper Market salvage exchange, and **nine original instrumental tracks**, including dedicated music for sanctuary, salvage and elite encounters. Four battle tracks rotate without immediate repeats; card plays and turns preserve the current song.
- A Containerlab topology exporter. Combat is a browser simulation; exported labs need suitable images and real device configuration before they can route traffic.

Read the [complete implemented game design](docs/game-design.md), [story and world](docs/narrative.md), and [current tactics balance probe](docs/balance-tactics.json). Simulated win rates are regression probes; human playtesting remains necessary to tune difficulty and enjoyment.

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
| Apply a field | Play a field card, then click a band on the table or its field seal |
| Browse a large hand | Hand arrows or horizontal scrolling; 1–0 still selects any card |
| Transmit / end turn | Brass dial, Space or Enter; focused buttons retain normal keyboard behavior |
| Prepare / return a card | Prepare control or P; keep one card for next turn in place of one draw |
| Undo before transmitting | Z |
| Cancel selection / settings | Escape |

Faults last one player turn. Hot Patch clears them immediately. Energy returns to five plus reserves and the hand is redrawn after each transmission. Temporary shield and burst expire; hardware remains until the encounter ends. Exhausted cards return next encounter. Integrity carries between sectors.

Fields belong to the ground: moving hardware changes which effects apply immediately. Each band holds one allied and one hostile field; another allied field replaces yours. Corrosion adds 2 incoming damage while any deployed hardware occupies its band. Suppression removes 3 damage from a route through its band. Fixed ALPHA/OMEGA terminals do not activate fields. Purge Field removes hostile fields and device jams in the chosen band, preserves allied fields, draws one card and exhausts.

## Project guide

- `src/core/` — deterministic rules, topology graph, expeditions, persistence and YAML export.
- `src/three/World.ts` — table, devices, cables, painted enemies, lighting and packet animation.
- `src/ui.ts`, `src/alpha-ui.ts`, `src/style.css`, `src/alpha.css`, `src/polish.css` — illustrated cards, painted instruments, inspection and tutorials.
- `src/story.ts` — chapters, enemy motivations, sanctuary discoveries and endings.
- `src/main.ts` — input, view transitions, targeting, undo and autosave.
- `src/audio.ts`, `src/audio-effects.ts` — music playback, crossfades, sampled effects, voice priority and combat ducking.
- `public/art/` — finished game artwork; [original art direction](docs/art-prompts.md) and [fieldcraft artwork prompts](docs/art-polish-prompts.md), and [expedition artwork prompts](docs/art-expedition-prompts.md).
- `public/audio/` — nine instrumental Ogg masters and the material effects bank.
- `soundtrack/` — prompts, original scores, generation metadata, provenance and licenses. Large production recordings and intermediate arrays are generated locally and ignored by Git.
- [Soundtrack production](soundtrack/README.md) and [effects production](soundtrack/effects/README.md) — source material, licenses and reproduction steps.
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

![Battle layout with active fields](docs/screenshots/battle.png)

The presentation fixture above displays all nine relics to exercise the crowded layout. [View the Copper Market](docs/screenshots/market.png). The [validation notes](docs/polish-validation.md) record the tested sizes and balance scenarios. To reproduce the layout audit against the dev server: `FAULTLINE_ORIGIN=http://127.0.0.1:5174 node --experimental-strip-types scripts/audit-layout.mjs`.
