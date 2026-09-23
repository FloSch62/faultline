# FAULTLINE — original score

Nine original instrumental pieces, generated locally with **YuE2-3B** and **YuE2-Vae**, then mastered for the game. The active player only uses the `*-instrumental.ogg` files.

| Track | Scene | Length | Score |
| --- | --- | --- | --- |
| The Last Relay | Title, map, rewards | 2:35.6 | D minor, 78 BPM; piano, cello, analog ambience |
| Signal & Steel | Encounters | 1:58.0 | D minor, 108 BPM; electronic pulse, strings, industrial percussion |
| The Blackout Core | Boss | 2:22.8 | D minor, 120 BPM; low drums, brass, urgent piano |
| The Copper Market | Salvage exchange / shop scene | 1:08.9 | D minor, 92 BPM; plucked strings, marimba, brushed percussion |
| A Light Left On | Sanctuary, relic discovery | 1:40.4 | D minor, 68 BPM; felt piano, cello, glass bells |
| A Thousand Fractures | Elite encounters | 1:23.6 | D minor, 116 BPM; angular cello, broken beats, brass |
| Copperlight Pursuit | Battle rotation | 1:40.6 | D minor, 124 BPM; analog bass, breakbeats, plucked cello |
| Ghosts in the Relay | Battle rotation | 1:40.0 | D minor, 104 BPM; haunted piano, glass mallets, trip-hop drums |
| Redline Protocol | Battle rotation | 1:31.0 | D minor, 138 BPM; sequencers, cello ostinato, brass |

## Instrumental revision

The first prompt-only drafts sometimes generated vocals. They were replaced after listening feedback. The new score plans leave the entire vocal part silent and contain no lyrics. Since a score alone does not guarantee instrumental output, the generated recordings were additionally separated with Demucs `htdemucs_ft`; only **drums + bass + other** were included in the final mix. The vocal stem is excluded and preserved separately in the local production workspace.

An optional local Faster Whisper small check with voice activity detection returned no speech segments for all nine delivered masters. The latest results are in `masters-v4/speech-check.json` for the battle additions and `masters-v3/speech-check.json` for the other six; the original check remains in `masters-v2/speech-check.json`. This is an automated check, not a claim that a human audition or perfect removal of every vocal timbre has been performed.

The game crossfades tracks over 1.6 seconds. Battle music uses a shuffled four-track bag: each piece plays once before reshuffling, without repeating at a bag boundary. It changes between encounters and when a track ends, while card plays and turns preserve playback. Other scenes loop their dedicated piece. Files use brief entrance/exit fades. These are full musical tracks, not sample-perfect seamless loops.

## Reproduction

Upstream: [official YuE repository](https://github.com/multimodal-art-projection/YuE).

- Inference package: `yue2-infer 0.1.6`.
- Source commit: `3968a270be318e5fb74d27dabc0add2ebb07e77f`.
- Generator: [`m-a-p/YuE2-3B`](https://huggingface.co/m-a-p/YuE2-3B).
- Listening decoder: [`m-a-p/YuE2-Vae`](https://huggingface.co/m-a-p/YuE2-Vae).
- Unquantized inference; 32 synthesis steps; CUDA with AR offloading and a 16 GiB memory budget.
- Generated on an NVIDIA RTX 4080 SUPER with 16 GB VRAM. The model is **not needed to play the game**.
- Separation: [`demucs 4.0.1`, `htdemucs_ft`](https://github.com/facebookresearch/demucs); all four fine-tuned models, one shift, 25% overlap.
- Mastering: FFmpeg fades and loudness normalization targeting −19 LUFS / −2 dBTP; stereo 48 kHz Vorbis, quality 5.

From the project root, using a CUDA-capable machine with enough free model cache space:

```sh
uv venv .venv-score --python 3.12
uv pip install --python .venv-score/bin/python \
  'git+https://github.com/multimodal-art-projection/YuE.git@3968a270be318e5fb74d27dabc0add2ebb07e77f' \
  'demucs==4.0.1' 'torchaudio==2.10.0' imageio-ffmpeg
.venv-score/bin/python scripts/instrumental_score.py
.venv-score/bin/python scripts/zone_score.py
.venv-score/bin/python scripts/battle_score.py
```

The exact prompts, original ABC music and seeds are in `scripts/instrumental_score.py`, `scripts/zone_score.py`, and `scripts/battle_score.py`. It resumes when both native generation metadata and audio exist, or when separated WAV files already exist. The repository includes scores and metadata; native FLAC/WAV recordings and NumPy intermediates are created on the machine running the script. To make a new version, choose a new output directory and seeds rather than mixing new music with old intermediates. A fixed seed is recorded for traceability; output need not be bit-identical across different hardware or runtime versions.

Optional speech regression check:

```sh
uv pip install --python .venv-score/bin/python 'faster-whisper==1.2.1'
.venv-score/bin/python scripts/check_score_speech.py
```

## Files

- `manifest.json` — delivered filenames, durations, sample format, source versions and SHA-256 hashes.
- `instrumental-v2/<track>/` — original score, request and result metadata are tracked. Native YuE2 audio and NumPy arrays are generated locally and ignored.
- `masters-v2/<track>/instrumental.wav` — locally generated accompaniment-only master before delivery encoding; ignored by Git.
- `masters-v2/<track>/removed-vocals.wav` — locally generated excluded vocal stem; ignored by Git.
- `masters-v2/<track>/master.json` — stem selection and measured RMS values.
- `generated/` and `rejected-v1/` — local first-pass drafts; excluded from the repository and never loaded by the game.
- `instrumental-v3/` and `masters-v3/` — fieldcraft score plans, generation metadata and accompaniment-only masters for the three additional scenes.
- `instrumental-v4/` and `masters-v4/` — the three battle variations, their scores, seeds, generation metadata, mastering details and automated speech check.
- `scripts/battle_score.py` — reproduces Copperlight Pursuit, Ghosts in the Relay, and Redline Protocol.
- `scripts/zone_score.py` — reproduces the three new tracks using separate seeds, arrangements and output paths.
- `scripts/instrumental_score.py` — the current, reproducible score-production workflow.

## License provenance

The official YuE2 model-weight license and its September 16, 2026 additional permissions are preserved verbatim in `licenses/YuE2-MODEL_LICENSE`. Code licensing and third-party notices are also included. Model weights are not shipped in this project. Consult those source terms for the applicable use of the model; the code license and model-weight terms are separate.
