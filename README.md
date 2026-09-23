# FAULTLINE

**A Containerlab odyssey. Every connection matters.**

A desktop deckbuilding roguelike set in a ruined orbital relay. Build a living network on a 3D table: every independent channel adds bandwidth, every device works while it is reachable, and every enemy is trying to cut it apart. Carry your deck through a branching expedition to the Blackout Core.

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
npm run test:smoke  # A quick @smoke subset of the browser suite
```

Playing requires no API keys, GPU music model, Containerlab daemon, or external asset service. All artwork, fonts and playable music are bundled. Hardware-accelerated WebGL is recommended. Desktop is the primary target. The game defaults to 110% interface scale while browser zoom stays at 100%; compact windows scroll instead of cropping essential controls.

## Inside the game

- **The network is your army.** Every live ALPHA → router → OMEGA route counts. Routes that share no device form **channels**, and every channel beyond the first adds bandwidth. Devices work while they are **online** on any live route: firewalls block from any branch and stack, Cache Servers draw, PoE Injectors add energy, Load Balancers multiply bandwidth, and a cabled **Honeypot** lures jams and cuts and bites back. A cut cable takes everything behind it offline, so redundancy protects your engine.
- **Three keepers, three engines.** The Architect goes wide with Hot Swap and the **Patch Cable** console. The Warden fortifies with **Harden** and **Backpressure**: shield that stops damage turns into damage. The Ghost **buffers** a transmission for double and releases it in one spike, unless a cut leaves no live route and the packets are lost. Each has archetype-only cards.
- **Protocols** arm face down and fire on the enemy's matching action: Failover Policy, Port Security, Rate Limiter, IPS Signature, Quarantine Rule and Tarpit. Every forecast shows which will trigger.
- **Bands matter.** Crowd three online devices into one band for a cluster, or split routers North and South for separated-circuit shield. Fields, corrosion, suppression, band jams and malware make you decide where to build. Every battle starts on its own terrain: wreckage, salvage hardware, crystal veins or interference.
- Three seven-sector stages with seeded, scouted route maps, **16 hostiles**, elites, sanctuaries, a **market**, **Unknown-signal events** and three guardians: the Iron Regent, the Hollow Choir and the Blackout Core, with charge turns announcing **Crownfall, Requiem and Total Blackout**. Deal the break threshold on the ultimate turn to interrupt and expose them, or brace.
- Enemies ask questions with more than one answer: graded armor that falls with every extra channel, plating that an online firewall ignores, Lockdown jams that hunt firewalls, siphon taps, junk cards and malware to scrub.
- **61 cards, 58 with an upgraded `+` version**, and **21 relics** including six **boss relics** that bend the rules at a price. Credits buy cards, relics, removals and upgrades; sanctuaries repair, upgrade, remove or salvage; twelve events trade integrity, credits and cards.
- **Ascension 0–10** per archetype, unlocked by winning.
- Exact, pure forecasts: every damage, shield and trap term is listed, and resolution uses the same numbers.
- **Field Training**: 11 short interactive lessons (routes, reading intents, rerouting, online devices, zones, traps, each console, danger and guardians, the expedition) plus an illustrated **Handbook** with a Danger Playbook. Lessons never touch your expedition.
- Larger, more threatening painted hostiles with anticipation, lunges, embers and guardian presence; distinct device models; gold primary route and cyan channels; offline, salvage, wreckage and malware states on the table.
- **44 material sound cues with 75 stereo masters** from six CC0 Kenney packs, loudness-matched: card Foley, metal, glass, signal and layered combat impacts, each tied to one game moment. **Nine original instrumental tracks.**
- Local autosave (version 3; pre-v3 expeditions are not continued), a shared UTC daily seed, local run records, undo, card inspection, keyboard play and reduced motion.
- A Containerlab topology exporter. Combat is a browser simulation; exported labs need suitable images and real device configuration before they can route traffic.

Read the [complete implemented game design](docs/game-design.md), [story and world](docs/narrative.md), and the [v3 balance probe](docs/balance-v3.json). Simulated win rates are regression probes; human playtesting remains necessary to tune difficulty and enjoyment.

### Discover the signature cards

| Card | Rarity | Energy | Effect |
| --- | --- | --- | --- |
| Containerlab | Rare | 3 | Deploy an overclocked router cabled to ALPHA and OMEGA: a fresh 7-damage route. Exhaust. |
| Clabernetes | Legendary | 2 | Clone a router with its cables and upgrades. Both become jam-protected; the new disjoint path is instant bandwidth. Exhaust. |

These are discoveries, **not starter cards**. Opening hands provide a router and two cabling cards so every deck can build its own route. Clabernetes has a lower individual reward chance than Containerlab. Startup Config, Linux Bridge, VXLAN Tunnel and Clab Inspect bring more of Containerlab's vocabulary into everyday builds.

**Wireshark** is an uncommon, one-energy packet capture. It draws two cards and adds one burst damage for each distinct device type on your primary route, with no cap: a router, switch, firewall and load balancer circuit earns four. The card exhausts for the encounter, and its journal entry shows exactly what it captured.

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
| Console command | Console control in the command dock, or C (Patch Cable then asks for two devices) |
| Arm a protocol | Play the protocol card; it waits face down and fires on the matching enemy action |
| Scrub malware | Click the malware node on the table; costs 1 energy |
| Delete a Worm | Play it for 1 energy before you transmit |
| Browse a large hand | Hand arrows or horizontal scrolling; 1–0 still selects any card |
| Transmit / end turn | Brass dial, Space or Enter; focused buttons retain normal keyboard behavior |
| Prepare / return a card | Prepare control or P; keep one card for next turn in place of one draw |
| Undo before transmitting | Z |
| Cancel selection / settings | Escape |

Faults last one player turn. Hot Patch clears them immediately; a second channel keeps you transmitting through them. Energy returns to five plus reserves and online PoE Injectors, and the hand is redrawn after each transmission (plus online Cache Servers). Temporary shield and burst expire; hardware remains until the encounter ends. Exhausted cards return next encounter. Integrity, credits and your deck carry between sectors.

Fields belong to the ground: moving hardware changes which effects apply immediately. Each band holds one allied and one hostile field, plus any terrain field; another allied field replaces yours. Corrosion adds 2 incoming damage while any deployed hardware occupies its band. Suppression removes 3 damage when your primary route crosses its band. Fixed ALPHA/OMEGA terminals do not activate fields. Purge Field removes hostile fields, device jams and malware in the chosen band, preserves allied fields, draws one card and exhausts.

## Project guide

- `src/core/` — deterministic rules: `cards.ts` (`RULES`, cards, upgrades, relics), `run.ts` (combat and forecast), `graph.ts` (routes and channels), `terrain.ts`, `enemies.ts`, `meta.ts` (rooms, rewards, market, sanctuary), `events.ts`, `ascension.ts`, `map.ts`, `expedition.ts` (archetypes and save validation) and YAML export.
- `src/three/` — table, device models, terrain props, cables, painted enemies, lighting and packet animation.
- `src/ui.ts`, `src/alpha-ui.ts`, `src/screens.ts` and their stylesheets — illustrated cards, the battle HUD, inspection and every expedition screen.
- `src/tutorial.ts`, `src/tutorial/` — Field Training lessons and the illustrated Handbook.
- `src/story.ts` — chapters, enemy motivations, sanctuary discoveries and endings.
- `src/main.ts` — input, view transitions, targeting, undo and autosave.
- `src/audio.ts`, `src/audio-effects.ts` — music playback, crossfades, sampled effects, voice priority and combat ducking. The CUE GUIDE in `audio-effects.ts` lists exactly when each of the 44 cues plays.
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
