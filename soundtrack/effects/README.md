# Material sound effects

FAULTLINE's effects use Kenney's [Impact Sounds](https://kenney.nl/assets/impact-sounds),
[Casino Audio](https://kenney.nl/assets/casino-audio),
[Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds),
[Interface Sounds](https://kenney.nl/assets/interface-sounds),
[UI Audio](https://kenney.nl/assets/ui-audio) and
[RPG Audio](https://kenney.nl/assets/rpg-audio), all CC0. Original selected
recordings and each pack's license are retained in `sources/`. None of the packs'
retro laser or tonal confirmation bleeps are used. The nine music tracks are unchanged.

Reproduce all 98 stereo Ogg masters for 58 cues:

```sh
uv run scripts/build_effects.py
```

The script has pinned Python dependencies. If the sources are absent, it fetches
the official Kenney archives and retains only the files the recipes use (unused
recordings are pruned). Production needs neither Python nor a network connection
to an asset service. The browser loads the finished `public/audio/effects/*.ogg`
files after the first interaction. The bank is approximately 1.3 MiB. A rebuild
keeps every master whose decoded audio is unchanged byte for byte (libsndfile
gives each Ogg stream a random serial), so only cues whose recipe changed differ.

## One cue per game moment

Every cue answers exactly one moment; `src/audio-effects.ts` opens with the
CUE GUIDE that states when each one plays. The palette is material:

| Moment | Cue | Material |
| --- | --- | --- |
| Lifting a card to target it | `pickup` | one short paper slide, faint click |
| Putting a card back, undo | `undo` | the reverse slide, soft switch |
| A non-card choice (device, archetype) | `select` | relay switch, light wood |
| Program card resolves | `instant` | card slap, glass tick, brief field swell |
| Mid-turn draw / new hand | `draw` / `deal` | two slides / six quick dealt slides |
| Discard reshuffled into draw pile | `shuffle` | riffle and squaring tap — only then |
| Device installed | `deploy` | metal thunk, latch, power-up hum |
| Cable connected | `connect` | connector snap, light metal, spark |
| A route or channel comes alive | `route` | field hum with a glass lock |
| Device relocated | `move` | rail slide seated with a metal tap |
| Protocol armed / fires | `protocol` / `trigger` | face-down card and latch / snapping trap |
| Console command | `console` | hardware toggle with a short hum |
| Transmit | `transmit` | trigger switch and packet launch |
| Ghost buffer stored / released | `buffer` / `release` | inhaled whoosh into a latch / discharge |
| Map room, onward | `navigate` | relay click, solid step, map paper |
| Battle begins | `turn` | low armored engage |
| Market, credits | `coins` | coins and chips |
| Card upgraded | `upgrade` | anvil strike with rising glass sparkle |
| Unknown signal | `event` | creak, radio static, reversed bell |
| Siphon Tap planted / installation scrubbed | `malware` / `scrub` | wet glitch / blade wipe and glass |
| Junk shuffled in | `junk` | shoved cards and a glitch |
| Escort, reinforcement or add takes a port | `arrive` | heavy metal engage, short field swell |
| Escort dormant for the phase | `dormant` | soft relay click, falling hum |
| Channel aimed, focus changed | `aim` | glass tick with a brass detent |
| Jammer, Spike, Anchor, Breaker Charge planted | `install` | iron driven into a plate, electric settle |
| Device loses a condition point | `wear` | stressed metal creak, glass crack |
| Device breaks, wreckage remains | `breakdown` | metal collapse, glass shatter, debris tail |
| Condition point restored | `repair` | ratchet turns, soft power-up, seated click |
| Firewall quarantine ticks | `quarantine` | brief hard beam, metal tick |
| Breaker Charge reaches zero | `detonate` | low explosion with metal debris |
| Crate opens (credits / anything else) | `crate` | wood-and-metal thud, latch, coins / paper |
| Message drops, choice resolves | `message` | capsule crack, paper unrolling, reversed bell |
| Hidden designation revealed | `reveal` | static clearing into an engraved plate strike |
| Reinforcement announced | `warning` | two low plate strikes over a short alarm bed |
| Mid-fight signal fires | `signal` | radio static resolving into a bell |

Hostile actions (`strike`, `breach`, `sever`, `jam`, `corrupt`, `charge`) land on
the animation's contact frame; `hit`, `hurt`, `block`, `boss`, `enrage`, `death`
and `defeat` punctuate combat.

## Loudness and mastering

Production trims leading silence, can slice a short window from a long bed,
resamples layers, applies optional per-layer filters (to remove pneumatic hiss),
filters subsonic/harsh frequencies and mixes deterministic stereo reflections.
Cues are matched on **short-term loudness** (the loudest 50 ms window), not
whole-file RMS, so a long tail never makes a short cue louder. Tiers:
interface −30…−23 dBFS, cards −21…−18, construction −18…−14, combat −14…−11.
Every master stays under a −3 dB sample peak; percussive cues may push up to a
few dB into a smooth soft knee for body. The generator checks the decoded Ogg
result for finite samples and clipping. `manifest.json` records source hashes,
recipes, durations, decoded peaks, short-term loudness, RMS and final hashes.
Browser tests decode every master, name each played cue, and exercise real
gameplay playback, volume and mute.

The runtime caps simultaneous voices at twelve, prioritizes combat cues over UI,
rate-limits hover, pickup and draw, schedules follow-up cues (a draw after a card,
a route locking after its cable, the new hand after the hit) a fraction of a
second apart, stops effects on mute/tab hiding, and briefly ducks music for major
impacts. Hover only sounds on meaningful controls. No oscillator fallback exists.
