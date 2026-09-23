# Material sound effects

FAULTLINE's effects use Kenney's [Impact Sounds](https://kenney.nl/assets/impact-sounds),
[Casino Audio](https://kenney.nl/assets/casino-audio), and
[Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds), all CC0. Original selected
recordings and each pack's license are retained in `sources/`. None of the packs'
retro laser sounds are used. The nine music tracks are unchanged.

Reproduce all 43 stereo Ogg masters for 25 cues:

```sh
uv run scripts/build_effects.py
```

The script has pinned Python dependencies. If the sources are absent, it fetches
the official Kenney archives and retains only the files used by the recipes.
Production needs neither Python nor a network connection to an asset service.
The browser loads the finished `public/audio/effects/*.ogg` files after the first
interaction. The entire bank is approximately 867 KiB.

Card selections use paper slides and fans; card plays use paper and wood.
Construction uses metal latches, cables have a light metal contact, and defensive
hits use a ringing plate. Attacks combine an impact transient, lower material
resonance and short stereo reflections. Guardians use deeper bell, glass and
engine layers. Distinct transformation, charge, death and defeat cues provide
combat punctuation. Material variants rotate to avoid repeated identical hits.

Production trims leading silence, resamples layers, filters subsonic/harsh
frequencies and mixes deterministic stereo reflections. Masters retain dynamics
under a -3 dB sample-peak target. The generator checks the decoded Ogg result for
finite samples and clipping. `manifest.json` records source hashes, recipes,
durations, decoded peaks/RMS and final hashes. Browser tests decode every master
and exercise real gameplay playback, volume and mute.

The runtime caps simultaneous voices at twelve, prioritizes combat cues over UI,
limits repeated hover sounds, stops effects on mute/tab hiding, and briefly ducks
music for major impacts. No oscillator fallback can reintroduce the old beeps.
