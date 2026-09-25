# FAULTLINE — original score

Twenty-one original instrumental pieces, generated locally with **YuE2-3B** and **YuE2-Vae**, then mastered for the game. Each expedition stage has its own exploration theme and a rotation of combat pieces. The active player only uses the `*-instrumental.ogg` files.

| Track | Scene | Length | Score |
| --- | --- | --- | --- |
| The Last Relay | Title and character selection | 2:35.6 | D minor, 78 BPM; piano, cello, analog ambience |
| Signal & Steel | Copper Reach battle rotation | 1:57.9 | D minor, 108 BPM; electronic pulse, strings, industrial percussion |
| The Blackout Core | Final guardian | 2:22.8 | D minor, 120 BPM; low drums, brass, urgent piano |
| The Copper Market | Salvage exchange / shop scene | 1:08.8 | D minor, 92 BPM; plucked strings, marimba, brushed percussion |
| A Light Left On | Sanctuary, relic discovery | 1:40.4 | D minor, 68 BPM; felt piano, cello, glass bells |
| A Thousand Fractures | Copper Reach elites | 1:23.6 | D minor, 116 BPM; angular cello, broken beats, brass |
| Copperlight Pursuit | Copper Reach battle rotation | 2:00.0 | D minor, 124 BPM; galloping strings and analog bass, taiko, French horn theme, piano |
| Ghosts in the Relay | Glass Cathedral battle rotation | 1:39.9 | D minor, 104 BPM; haunted piano, glass mallets, trip-hop drums |
| Redline Protocol | Blackout Heart battle rotation | 1:30.9 | D minor, 138 BPM; sequencers, cello ostinato, brass |
| Paths of Copper | Stage I exploration and rewards | 2:06.8 | D minor, 78 BPM; felt piano, plucked cello, dulcimer, clockwork pulse |
| The Second Way Home | Stage I battles and Iron Regent | 1:47.2 | D minor, 118 BPM; analog bass, cello, metal percussion, French horn |
| Prismatic Silence | Stage II exploration and rewards | 2:10.0 | A minor, 72 BPM; celesta, glass marimba, vibraphone, viola harmonics |
| Shatter the Choir | Stage II battles, elites and Hollow Choir | 1:51.6 | A minor, 112 BPM; crystalline mallets, prepared piano, syncopated drums |
| Messages in the Dark | Stage III exploration and rewards | 2:10.4 | C minor, 76 BPM; low piano, bowed bass, analog pulses, cello |
| Deliver the Dawn | Stage III battles and elites | 1:56.3 | C minor, 132 BPM; sequencers, cello ostinato, industrial drums, brass |
| Kingdom of Rust | Copper Reach battle rotation | 1:54.9 | D minor, 108 BPM; clockwork ostinato, taiko, massive low brass, commanding horn theme |
| Sparks on the Wire | Copper Reach battle rotation | 1:45.0 | D minor, 130 BPM; 3-3-2 string ostinato, taiko, dulcimer, solo violin, brass |
| Refraction | Glass Cathedral battle rotation | 2:17.5 | A minor, 120 BPM; harpsichord ostinato, spiccato strings, taiko, glass bells, violin |
| Bells of Broken Glass | Glass Cathedral battle rotation | 1:43.4 | A minor, 92 BPM; half-time drums, tubular bells, low brass, piano, strings |
| Quarantine Breach | Blackout Heart battle rotation | 1:39.3 | C minor, 126 BPM; low string riff, taiko and industrial drums, heavy brass, horn and string theme |
| Hold the Line | Blackout Heart battle rotation | 1:47.2 | C minor, 108 BPM; driving piano and strings, taiko, cello and violin theme, horns |

## Native mix masters

The score plans leave the entire vocal part silent and contain no lyrics. All twenty-one masters preserve the **complete native YuE2 recording**. Each song has one folder under `tracks/<track>/`: `instrumental.wav` is a lossless decode of the adjacent `audio.flac`, at the same 48 kHz stereo, 24-bit resolution. The production script verifies exact equality of every decoded PCM sample before installing the master.

The previous Demucs vocal-separation step damaged the music and was removed from all four production scripts after listening feedback. No stem removal, denoising, dynamic compression or resampling is applied to the WAV masters. Superseded local masters and stems are archived under the ignored `artifacts/rejected-audio-separation/`; they are never used by the game or the production scripts.

Browser copies add a 1.5-second fade in, a 3-second fade out and a constant gain adjustment, then encode to Vorbis. Gain aims for −19 LUFS while keeping the encoded true peak at or below −2 dBTP. Tracks remain quieter if reaching the loudness target would require compression. The per-track metadata records the actual delivery gain and measured levels.

Optional Faster Whisper checks can flag recognized speech for listening review; they never change the audio. Superseded reports and draft recordings are archived locally under the ignored `artifacts/soundtrack-archive/`, outside the active soundtrack folders. Speech recognition cannot certify that music is free of singing or other vocal timbres.

The current `native-mix-speech-check.json` records zero recognized speech segments for the fourteen earlier delivery files still in use, with SHA-256 hashes tying the report to those exact encodes. The seven v6 pieces were not speech-checked: choir-like textures are acceptable in the battle score.

The game crossfades tracks over 1.6 seconds. Battle music uses a separate shuffled pool for each stage: each piece plays once before reshuffling, without repeating at a pool boundary. The Copper Reach has five battle tracks; the Glass Cathedral and Blackout Heart have four each. Music changes between encounters and when a battle track ends, while card plays and turns preserve playback. Stage exploration themes begin on the map after a guardian's relic is claimed, and saved runs restore the correct stage's score. Title, shop, sanctuary and guardian scenes loop their selected piece. Files use brief entrance/exit fades. These are full musical tracks, not sample-perfect seamless loops.

## Reproduction

Upstream: [official YuE repository](https://github.com/multimodal-art-projection/YuE).

- Inference package: `yue2-infer 0.1.6`.
- Source commit: `3968a270be318e5fb74d27dabc0add2ebb07e77f`.
- Generator: [`m-a-p/YuE2-3B`](https://huggingface.co/m-a-p/YuE2-3B).
- Listening decoder: [`m-a-p/YuE2-Vae`](https://huggingface.co/m-a-p/YuE2-Vae).
- Unquantized inference; 32 synthesis steps; CUDA with AR offloading and a 16 GiB memory budget.
- Generated on an NVIDIA RTX 4080 SUPER with 16 GB VRAM. The model is **not needed to play the game**.
- Masters: lossless native FLAC-to-WAV decoding with exact PCM verification. No source separation.
- Delivery: FFmpeg fades and constant gain toward −19 LUFS with a −2 dBTP ceiling; stereo 48 kHz Vorbis, quality 5.

From the project root, using a CUDA-capable machine with enough free model cache space:

```sh
uv venv .venv-score --python 3.12
uv pip install --python .venv-score/bin/python \
  'git+https://github.com/multimodal-art-projection/YuE.git@3968a270be318e5fb74d27dabc0add2ebb07e77f' \
  'torchaudio==2.10.0' imageio-ffmpeg soundfile numpy
.venv-score/bin/python scripts/instrumental_score.py
.venv-score/bin/python scripts/zone_score.py
.venv-score/bin/python scripts/battle_score.py
.venv-score/bin/python scripts/stage_score.py
.venv-score/bin/python scripts/variety_score.py
```

The exact prompts, original ABC music and seeds are in `scripts/instrumental_score.py`, `scripts/zone_score.py`, `scripts/battle_score.py`, `scripts/stage_score.py` and `scripts/variety_score.py`. They reuse existing native generation metadata and audio from `tracks/<track>/`, then rebuild delivery files from the original recording through `scripts/master_score.py`. Existing WAV files are never treated as an authoritative source. The repository includes scores and metadata; native FLAC/WAV recordings and NumPy intermediates are created on the machine running the script. For a new take, archive the previous track folder under `artifacts/` and choose a new seed. Keep one accepted take per track instead of adding versioned folder trees. A fixed seed is recorded for traceability; output need not be bit-identical across different hardware or runtime versions.

Rebuild all twenty-one existing recordings without loading YuE2 or using the GPU:

```sh
.venv-score/bin/python scripts/master_score.py
# One track, using its original FLAC:
.venv-score/bin/python scripts/master_score.py --track paths-of-copper
```

The stage score uses six distinct ABC plans in D, A and C minor, with separate development sections, silent vocal voices and seeds 923051–923056. Generation and mastering can be resumed separately using `scripts/stage_score.py --phase generate` or `--phase master`; `--track <id>` selects a single piece. Release GPU memory from the image generator before running YuE2 on a 16 GB card.

The variety score (`scripts/variety_score.py`, generation v6) adds two battle pieces per stage and replaces the v4 Copperlight Pursuit, which listening feedback found too close to techno; the new take keeps its drive under a cinematic orchestral arrangement. Its plans are named four-bar sections arranged by a form, and every bar is checked to fill one 4/4 measure. Each seed was chosen from five takes (the base seed plus 0, 1000, 2000, 3000 and 4000). The v4 recording is archived under the ignored `artifacts/soundtrack-archive/generated/copperlight-pursuit/`.

Optional speech regression check:

```sh
uv pip install --python .venv-score/bin/python 'faster-whisper==1.2.1'
.venv-score/bin/python scripts/check_score_speech.py
```

## Files

The three top-level folders are `tracks/`, `effects/` and `licenses/`.

```text
soundtrack/
  tracks/<track>/
    score.abc             Original instrumental score
    request.json          Prompt and seed
    config.json           Generation settings
    plan.json             Score plan
    plan_manifest.json    Plan hashes
    result.json           Generation result and artifact hashes
    master.json           Source and delivery hashes, PCM verification and levels
    audio.flac            Native recording (local, ignored)
    instrumental.wav      Lossless master (local, ignored)
    *.npy                 Generation intermediates (local, ignored)
  effects/                Effect recipes, licensed sources and provenance
  licenses/               YuE2 license texts
  manifest.json           All twenty-one delivered tracks and their source paths
  native-mix-speech-check.json
  README.md
```

The original generation IDs retain their revision labels for traceability; they do not determine folder names. Browser-ready music lives in `public/audio/`.

Production entry points:

- `scripts/master_score.py` — shared lossless mastering and browser delivery for all twenty-one recordings.
- `scripts/stage_score.py` — reproduces the three exploration themes and three combat themes.
- `scripts/variety_score.py` — reproduces Copperlight Pursuit and the six added battle pieces.
- `scripts/battle_score.py` — reproduces Ghosts in the Relay and Redline Protocol.
- `scripts/zone_score.py` — reproduces the three new tracks using separate seeds, arrangements and output paths.
- `scripts/instrumental_score.py` — the current, reproducible score-production workflow.

## License provenance

The official YuE2 model-weight license and its September 16, 2026 additional permissions are preserved verbatim in `licenses/YuE2-MODEL_LICENSE`. Code licensing and third-party notices are also included. Model weights are not shipped in this project. Consult those source terms for the applicable use of the model; the code license and model-weight terms are separate.
