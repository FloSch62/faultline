# Stage environments

The Glass Cathedral and Blackout Heart each have a separate route panorama and battle interior. The Copper Reach retains the original `relay-cathedral.png` and `relay-interior.png` paintings. Market and sanctuary scenes retain their dedicated paintings.

| Stage | Route panorama | Battle interior |
| --- | --- | --- |
| II · The Glass Cathedral | `public/art/stages/glass-cathedral.png` | `public/art/stages/glass-interior.png` |
| III · The Blackout Heart | `public/art/stages/blackout-heart.png` | `public/art/stages/blackout-interior.png` |

The visual target is the finished detail of the original [relay cathedral](../public/art/relay-cathedral.png): intricate engineered structures, convincing colossal scale, atmospheric depth, worn brass and ivory machinery, cold shadows and small warm practical lights. Stage II adds fractured violet optical glass; stage III introduces blackened containment machinery and restrained ember-red seams. The battle interiors leave a broad central platform for the board and hostile.

All four images were generated locally with **Krea 2 Turbo**, using the original cathedral as an image reference through the Krea 2 style-reference adapter at **0.45** strength for the Glass Cathedral and **0.30** for the Blackout Heart. These are new generated environments, not color-filtered copies. Final images are opaque PNGs, **1920 × 1088**. Generation uses 8 Euler steps, the simple scheduler, CFG 1 (no classifier-free guidance), and constant timestep shift 1.15. Model/runtime revisions, exact prompts, seeds, reference paths and final hashes are in [art-stage-manifest.json](art-stage-manifest.json).

The adapter's [model card](https://huggingface.co/ostris/krea2_turbo_style_reference) describes image-reference conditioning; the [official Krea repository](https://github.com/krea-ai/krea-2) documents Turbo sampling. ComfyUI's built-in `Image Style Reference (Krea-2 Turbo)` workflow supplies reference conditioning and latents. Krea's Community License is retained at [KREA-2-COMMUNITY-LICENSE.txt](../public/art/cards/KREA-2-COMMUNITY-LICENSE.txt).

With the project's local ComfyUI installation listening on port 8189:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/generate_stage_art.py \
  --comfy-input /home/clab/.local/share/faultline-imagegen/ComfyUI/input
```

The script writes candidates and exact workflow records to `artifacts/stage-art/`. Inspect candidates before copying their unmodified PNG bytes into the manifest's delivery paths. Use a new output directory for a new prompt or seed; existing candidates are skipped. The in-game selection is defined in `src/core/stages.ts` and shared by the CSS backdrop and the Three.js battlefield.
