# Alpha development audit

Objective: a complete, demanding and enjoyable FAULTLINE alpha, with substantial
sound effects, living enemies, and better combat, routes and balance.

## Design direction

Keep the distinctive tabletop network. The valuable lessons from deckbuilders
are legible threats, scarce resources, committing to an identity, meaningful
short-term versus long-term choices, and earned moments of overwhelming power.
More health alone does not produce those decisions.

Acceptance work:

- Replace oscillator effects with bundled, licensed material recordings and
  layered cinematic cues. Cover construction, cards, faults, defense, enemy
  actions, transformations, victory and defeat. Verify real decoding, settings,
  rapid actions, mute, tab visibility and the production base path.
- Complete enemy entrance, individual idle, anticipation, attack, recoil,
  transformation and defeat animation. Preserve the forecast's real target and
  reduced-motion/fast-mode behavior. Inspect the rendered game.
- Remove chains of free map rewards and predictable identical route charts.
  Offer visible risks, persistent route commitments and useful elite rewards.
  Validate every generated path and deterministic saves.
- Give guardian fights climaxes and counterplay that reward planning a burst
  window or defense. Forecast and resolution must agree even on phase changes,
  lethal hits, faults and fields.
- Strengthen deck decisions and eliminate dominant free scaling. Measure
  multiple archetypes and strategies; retain viable paths to victory without
  requiring a specific rare card.
- Verify complete expeditions, reloads, controls, desktop layout, production
  build and browser errors. Update design, balance evidence and player help.

## Baseline (2026-09-23)

Commit `9019d77`, clean worktree. All 79 existing rule tests pass. Nine music
tracks are already bundled, but all interaction/combat effects use oscillators.
Enemies currently bob as single sprites, share five attack animations, and have
no defeat animation. Maps use three fixed charts and adjacent-lane traversal.

100 seeds per profile, full three-stage baseline: adaptive Architect 66%,
Warden 78%, Ghost 61% wins; aggressive 24%, 57%, 17%; careless 0% for all.
These lightweight policies are regression probes, not human enjoyment measures.

Completion remains unproven until all acceptance work above has current evidence.

## First implementation pass

- Built 43 stereo Ogg masters for 25 material cues, with selected CC0 Kenney
  sources, original licenses and reproducible recipes. Replaced the oscillator
  effects with decoded samples, rotating variants, voice priorities, mute/hidden
  cleanup and brief music ducking. Enemy attack samples land on contact.
- Added individual deforming rigs for all sixteen painted enemies. Wings,
  scuttling limbs, coils, spectral bodies, choirs and armored bodies use different
  movement. Entrance, recoil, wind-up, attack, recovery, enrage and dissolving death
  now form a complete visual sequence; controls remain locked until it resolves.
- Seeded maps now commit to five or more fights per stage. Enemies are scouted
  before entry, connections restrict travel, and free rooms cannot be chained.
  Generation does not consume card RNG. Existing saved charts keep their exits.
- Verified 1,500 generated maps for reachability, bounded forward routes, the
  fight minimum and recovery spacing. Save round trips and scouted encounters
  match. Individual rigs are finite and become stationary under reduced motion.
- Browser checks decode every effect and verify sampled gameplay audio, mute,
  volume, death before rewards, transformation before the next turn, and reduced
  motion. Actual Moth, Regent, Core and route screenshots were inspected. The
  transitional screenshots freeze the visual clock halfway through dissolution;
  the tests use real timing and verify completion.

Current verification for this pass:

- `npm test`: 84 passing rule and animation tests.
- `npm run test:e2e`: all 50 tests passed before the final immediate-health and
  map-spacing refinements.
- `VITE_BASE_PATH=/faultline/ npm run build`: type checking and production build
  pass. Vite reports its existing single-bundle size advisory and the public
  font stylesheet is resolved at runtime.
- `VITE_BASE_PATH=/faultline/ FAULTLINE_TEST_BUILD=true npm run test:e2e -- tests/presentation.spec.ts`:
  all six cases pass against the production build, including immediate hit
  health, all 43 effect decodes, volume/mute, enrage, death, reduced motion,
  actual scouting/exits and the map-label layout regression.
- Additional actual map renders at 1024×600, 1280×720, 1440×900, 1920×1080,
  390×844 and 320×740 have no label/label or label/neighbor-symbol collisions.
  A collision found in the initial scouting layout was fixed with chart spacing
  and scrolling to the current available rooms.
- `git diff --check` passes. Changes remain local and uncommitted.

The current balance report is `docs/balance-routes.json` (500 distributed seeds
per archetype/policy, each on safe and elite routes: 9,000 complete simulations).
The map changes alone are insufficient: Warden's defensive engine still wins
too reliably. Isolated probes reducing sustain, Shield Array, or its rare starter
did not solve that imbalance without harming other builds. Those experiments
have **not** been applied to the game.

## Combat and economy pass

- Guardians now follow four normal actions with a charge and a named ultimate.
  The threshold is 12 / 15 / 18 actual damage for Regent / Choir / Core. The
  forecast updates before transmission; a break cancels the attack and its new
  field, then exposes the guardian for one transmission (+3 damage, no armor).
  Existing corrosion still resolves. Charge, break and exposed states have
  matching text, sound and animation, with restrained danger lighting.
- Prepare holds one card for the next turn in place of one draw. It is free to
  set aside or return before transmission, obeys the hand cap, and supports
  undo, keyboard control and saved games. Victory clears the slot.
- Reduced free sustain: Shield Array prevents 2, Grounded Core renews 1 block,
  and Repair Drone heals 1. Sanctuary salvage sacrifices 2 maximum integrity
  for a relic; repair and refinement remain alternatives. The limit is shown
  before payment, cannot fall below 6, and is charged only once across reloads.
- The balance player now has a tactical policy using prepared answers, timely
  bursts and selective refinement. Its shared command recorder drives actual
  browser controls for whole-expedition audits.
- `docs/balance-tactics.json` records 21,600 full expeditions across six scenarios.
  Tactical wins avoiding elites: Architect 34%, Warden 56%, Ghost 36%; the
  defensive policy without preparation/refinement wins 15% / 34% / 13%.
  Every archetype wins with mesh, fortress and burst priorities, and without
  accepting either orchestration signature card. Careless play always loses.
  Fortress and elite rewards remain strong; these are human-playtest watchpoints.
- All 91 rule/animation tests pass. The six focused tactical browser cases pass:
  prepare/return/undo/reload, charge to interrupted ultimate to exposure, every
  unbroken guardian ultimate at three viewport sizes, and permanent salvage cost.
  Production build and the separate QA-script type check pass.

## Final audit complete

- Completed a fresh Architect expedition, seed 2654435761: all 21 sectors,
  221 card/build actions, 71 transmissions, victory at 2/12 integrity. The Regent
  was interrupted, the Choir's ultimate was fully shielded, and the Core's was
  survived with 2 damage. The final Core fight lasted 11 turns. No page or asset
  response errors occurred. A reload during the run preserved the exact state.
- An earlier Warden run lost to the Choir's second Requiem with that boss at
  4 health. It resumed a saved checkpoint after a development hot reload, with
  no edited battle state. Both reports are summarized in `docs/playthrough-alpha.json`.
- Inspected actual Regent, Choir and Core charge/ultimate/exposure screens and
  the victory ending. Current field damage and next-turn ultimate damage are
  now explicitly separated; a broken breach no longer lends firewall defense
  to existing corrosion.
- Final `npm test`: all 91 rule and animation cases pass.
- Final `VITE_BASE_PATH=/faultline/ npm run build`: type checking and production
  build pass. The existing bundle-size advisory remains; fonts resolve and load
  correctly at runtime.
- Final `VITE_BASE_PATH=/faultline/ FAULTLINE_TEST_BUILD=true npx playwright test`:
  all 58 cases pass against the finished build. This includes actual stereo audio
  decoding, settings, visibility suspension/resumption, every guardian sequence,
  preparation, salvage, layout, persistence, tutorial and completion/record flows.
  A timing assertion found during the earlier full run now waits for controls to
  unlock after packet, attack and enrage; the final suite records all 58 cases
  passing without retries (`status: passed`, no failed tests). The long-running
  command wrapper subsequently reported exit 143; no test failure was recorded,
  and its preview/browser processes had exited.
- QA scripts pass a separate strict TypeScript check. `git diff --check` passes.
- The completed playthrough and test jobs have exited. The intended development
  preview remains at `http://127.0.0.1:5174/`; the pre-existing test-server was left
  untouched. All source changes remain local and uncommitted.

The implementation objective is complete and the alpha is ready for playtesting.

Human sessions are still needed to assess comprehension and enjoyment; automated
win rates and successful scripted expeditions cannot establish those properties.

## v3 redesign: the network is your army

### Why

Playtesting the alpha exposed a structural problem rather than a tuning one. Only
the single strongest route transmitted; a second route added a flat +2 and a third
router added nothing, so alternative routes and extra hardware were rarely worth
their energy. Nine of nineteen starter cards were routers or cables that went dead
once the first route stood, every fight opened with the same router-plus-two-fibers
turn, "once / max +2" caps prevented any build from scaling, several enemy traits
were single-answer taxes, and the run layer offered no upgrades, market or events.

### What changed

- **Combat model.** Any live route counts toward **channels** (maximum routes sharing
  no device); each extra channel adds **bandwidth**. Devices work while **online**
  (on any live route): firewalls block from any route and stack. Caps are gone;
  sockets, energy and disruption bound the ceiling. `RULES` in `cards.ts` holds every
  tunable number and feeds card text, the HUD and the Handbook.
- **New devices**: Honeypot (decoy), Cache Server (+draw), PoE Injector (+energy),
  Load Balancer (+damage per channel). **Protocols** arm face down and fire on the
  matching enemy action. **Clusters** versus **separated circuits** give bands a
  crowd-or-spread tension.
- **Archetype identity**: a console command per keeper (Patch Cable, Harden,
  Buffer), Warden's **Backpressure** and Ghost's **buffer with packet loss**,
  archetype-only cards, a 17-card starter deck with fewer cables.
- **Encounter terrain** (wreckage, salvage devices, crystal veins, interference),
  **malware** nodes, **junk** cards and **curses**; enemy rework (graded armor,
  firewall-anywhere plating, Lockdown targeting firewalls, Leech taps, Choir and Core
  injections).
- **Card upgrades** for 58 of 61 cards; **credits**, a **market**, twelve
  **events**, a four-service **sanctuary**, **boss relics** with drawbacks after the
  first two guardians, and **ascension 0–10**.
- **Save version 3.** Older expeditions are not continued.
- **Presentation**: a battle HUD for channels, consoles, protocols, buffer and
  backpressure; a 3D table with larger, more threatening hostiles, new device
  models, online/offline states, channel colours, wreckage and malware; a rebuilt
  expedition screen set; **Field Training** (11 interactive lessons) and an
  illustrated **Handbook** with a Danger Playbook; a rebuilt 44-cue sound palette
  in which lifting a card no longer sounds like a shuffle.

### How it was verified

- Core rule, meta and tutorial unit tests (`npm test`), including a randomized
  160-board check that the forecast is pure and equals resolution, a forecast
  timing test, map invariants over 2,400 maps, market/sanctuary/event flows, save
  validation, and every Field Training lesson played to completion through the
  real rules.
- Seeded full-expedition bot probes recorded in `docs/balance-v3.json` (150 seeds
  per archetype and policy, shipped numbers): tactical bots win 39 % / 35 % / 39 %
  (Architect / Warden / Ghost) at ascension 0, careless bots never win. See the
  game design's balance section.
- Browser checks by the individual workstreams: audio decoding and cue order,
  3D captures at 1280×720 through 1920×1080 (including the hostile-integrity
  overlap fix), expedition screens at 390×844 through 1920×1080.

### Open watchpoints

- Ghost normal fights last about three turns, and Architect/Ghost guardian fights
  five to seven, below the targets; guardian health was raised 20 % so more
  fights reach the ultimate.
- The browser e2e suite (`tests/*.spec.ts`) and `scripts/playthrough.ts` still
  target pre-v3 selectors and bot actions and must be updated.
- Human sessions must confirm comprehension of channels, online devices and
  protocols, and whether the new systems stay readable at a glance.

## v4 · Under Quarantine

### Why

v3 made the network the player's army, but the enemy still stood alone at the far
rail and never touched the table: every transmission had one destination, and the
ground belonged to the player. v4 gives the quarantine numbers, ground and a clock,
and adds surprises that never break the exact forecast.

### What changed

- **Packs and ports.** Up to three hostiles (leader, escorts, guardian adds) at three
  ports; every channel is a delivery the player aims; per-port armor and overflow.
  A single undesignated hostile that never installs or overloads is numerically v3.
- **The table front.** Malware became the Siphon Tap, one of five installations with
  integrity; devices have condition and can break into wreckage; repair, scrub,
  firewall quarantine, honeypot bites and Reclaim answer.
- **Escalation**, **designations** and **surprises** (reinforcements, crates,
  undelivered messages, signals); four new leaders, seven escorts, three add types,
  fourteen cards and eight relics.
- **Save version 4.** Version 3 expeditions now migrate in memory (the v3 section's
  "older expeditions are not continued" applies only to saves before version 3).

The rules, the interface contract and the balance targets are in
[game-design.md](game-design.md); probe results in [balance-v4.json](balance-v4.json)
(tactical bots at ascension 0, 600 seeds: Architect 36 %, Warden 36 %, Ghost 30 %; the
Warden reaches the band only with a Harden addition that is pending approval). Every
layer can be switched off by its `RULES` flag for A/B probes (game design, "Phase flags").
