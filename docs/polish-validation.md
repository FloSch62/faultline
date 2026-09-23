# Expedition polish validation

Validated locally on September 23, 2026. The game uses a 110% interface scale at 100% browser zoom. Desktop and laptop remain the primary targets; narrow and short windows preserve access with scrolling.

## Presentation

The layout audit passed **75 scene/viewport measurements**, with no detected text overflow, panel/control collisions or JavaScript page errors. Battle fixtures include all nine relics, a ten-card hand with long descriptions, shield, burst, reserve energy, allied and hostile fields, and an enraged guardian advertising a combined attack.

| Battle viewport | Battle viewport | Battle viewport |
| --- | --- | --- |
| 320 × 740 | 390 × 844 | 768 × 1024 |
| 900 × 700 | 1024 × 600 | 1164 × 655 |
| 1242 × 698 | 1280 × 720 | 1366 × 768 |
| 1440 × 900 | 1745 × 982 | 1920 × 1080 |
| 2560 × 1440 | | |

The audit also covers selected field instructions; all three guardian introductions; settings, damage details, the enemy journal and device controls; the title and character-selection screens; and maps, card rewards, sanctuaries and relic rewards. Those scenes use four or five representative sizes from the same matrix. Generated sprites were inspected in the real WebGL scene for all six new roaming enemies and all three guardians.

Geometry checks measure card rules against their footer, player controls against the painted frame's interior, combatant names against the frame crest, the hand against combatant panels, field controls against both panels, and card piles against the Transmit control. Menu copy is checked against its footer and music credit. A crowded hand intentionally scrolls horizontally, with visible arrows; short windows can scroll vertically. Decorative artwork may extend beyond its box, while essential text and controls remain accessible.

Screenshots: [battle](screenshots/battle.png), [title](screenshots/title.png), [guardian entrance](screenshots/guardian.png).

Reproduce against a running local server:

```sh
FAULTLINE_ORIGIN=http://127.0.0.1:5174 node --experimental-strip-types scripts/audit-layout.mjs
```

Screenshots and the measured report are written to `artifacts/layout-audit/`. These checks establish the tested Chromium layouts, rather than a guarantee about every browser, font override or possible screen size.

## Rules and interactions

`npm test` passes **79 deterministic rule tests**. Coverage includes all three stage transitions, final victory, old-save migration, secondary fields, exact forecast/resolution agreement, cancellation on lethal damage, delayed enrage, enemy counters and the four-track shuffle bag.

The complete **45-test Chromium production suite passed in 11.9 minutes**, served under the `/faultline/` GitHub Pages path. Both root-path and Pages production builds passed TypeScript checking and bundling. Vite reports a large application-chunk advisory; the build succeeds.

Browser regressions cover all 39 card descriptions at eleven window sizes, all nine equipped relics, card inspection, drag/drop and tooltip positioning at the default scale, menu cleanup, a centered Transmit dial throughout animation, action-specific enemy animations, three guardian entrances with saved dismissal, stage progression, zone relocation/cleansing, audio decoding and music continuity.

Reproduce the production checks:

```sh
npm test
VITE_BASE_PATH=/faultline/ npm run build
VITE_BASE_PATH=/faultline/ FAULTLINE_TEST_BUILD=true npm run test:e2e
```

## Difficulty

The [recorded balance probe](balance-expedition.json) contains **6,300 complete simulated expeditions**. The balanced safe-route profile uses 300 seeds for each of three archetypes and three policies. Elite-route and mesh, fortress and burst reward preferences each use 100 seeds per archetype/policy combination.

Adaptive policy win rates:

| Route / build | Architect | Warden | Ghost |
| --- | ---: | ---: | ---: |
| Safe / balanced | 64% | 86% | 65% |
| Elite / balanced | 45% | 79% | 41% |
| Safe / mesh | 45% | 74% | 45% |
| Safe / fortress | 75% | 94% | 82% |
| Safe / burst | 51% | 82% | 47% |

Careless policies won no runs in these scenarios. The aggressive safe-route policy won 25%, 58% and 23% respectively. The Warden remains the most forgiving starter; its new-run integrity is 15 and it trades an early burst card for another guard. Existing saves retain their health and deck.

Boss health is 56 / 80 / 110. Later stages increase attack strength; extended fights build visible pressure. Some enemies combine a device or cable attack with corrosion or suppression. Both effects are forecast. A newly cast field starts affecting the following player turn, and crossing a guardian's enrage threshold strengthens its next advertised action. Players can protect, cleanse, reroute, relocate or finish the enemy before retaliation.

The bots know the rules and use deterministic heuristics. Their results measure regressions and compare strategies, not expected first-time human win rates. Fortress Warden is the strongest measured combination and remains a useful focus for human playtesting; no claim of final human difficulty calibration is made.

Reproduce representative probes:

```sh
npm run balance -- 300
npm run balance -- 100 --elite
npm run balance -- 100 --build=mesh
npm run balance -- 100 --build=fortress
npm run balance -- 100 --build=burst
```

## Artwork and audio

Six roaming enemy sprites and two new guardian sprites use generated transparent atlases. Their exact built-in image-generation prompts are in [the artwork record](art-expedition-prompts.md). The Blackout Core retains its existing artwork.

Three additional battle tracks were generated locally with YuE2 and delivered as accompaniment-only, mastered Ogg files. Together with Signal & Steel they rotate without immediate repetition, while turns and card plays preserve the current track. Dedicated shop, sanctuary, elite and guardian pieces remain in use. All nine files have recorded durations and hashes; the three additions returned no speech segments in the automated check. [Score provenance and reproduction](../soundtrack/README.md) distinguish those checks from human listening.

Those separated deliveries have since been superseded: the current fifteen-track soundtrack preserves the complete native recordings, and the production scripts no longer perform vocal separation. Each stage now has its own exploration theme and battle pool. See the current [score record](../soundtrack/README.md) and [stage artwork record](art-stage-prompts.md).
