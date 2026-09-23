# Individual card paintings — September 23, 2026

This pass replaces reused paintings on 22 v3 cards and three earlier cards. All 25 paintings are installed in `public/art/cards/`; upgraded cards share their base card's painting.

Honeypot and Cache Server were generated with the built-in OpenAI image-generation tool. The remaining 23 were painted with local **Krea 2 Turbo**, following the user's choice to continue locally after the built-in generation limit. The final prompts, seeds, file paths, SHA-256 hashes and sampler settings are in [art-v3-manifest.json](art-v3-manifest.json). Each card has an independent generation.

## Art direction

Layered oil-paint brushwork, softly broken painted edges, chipped ivory and pitted dark brass in an atmospheric ruined orbital cathedral. Indigo shadows, restrained teal signals and amber light connect the set. Each scene shows the card's effect through a distinct artifact or action. Avoid smooth product rendering, studio staging and photorealistic surface detail. Artwork is opaque and contains no card frame or lettering; names, costs and rules remain accessible HTML.

## Card subjects

| Card | Visual meaning | Artwork |
| --- | --- | --- |
| Honeypot | A decoy attracts hostile jams and cuts and damages the attacker. | [honeypot.png](../public/art/cards/honeypot.png) |
| Cache Server | An online storage device supplies an extra card every turn. | [cache-server.png](../public/art/cards/cache-server.png) |
| PoE Injector | An online power injector adds energy every turn. | [poe-injector.png](../public/art/cards/poe-injector.png) |
| Load Balancer | A distribution device strengthens every live channel. | [load-balancer.png](../public/art/cards/load-balancer.png) |
| Failover Policy | An armed safeguard prevents a cable cut and gains shielding. | [failover-policy.png](../public/art/cards/failover-policy.png) |
| Port Security | An armed safeguard stops a jam and retaliates against the attacker. | [port-security.png](../public/art/cards/port-security.png) |
| Rate Limiter | An armed safeguard absorbs an incoming enemy strike. | [rate-limiter.png](../public/art/cards/rate-limiter.png) |
| IPS Signature | An intrusion-prevention signature shields against a breach. | [ips-signature.png](../public/art/cards/ips-signature.png) |
| Quarantine Rule | An armed containment rule cancels a hostile field. | [quarantine-rule.png](../public/art/cards/quarantine-rule.png) |
| Tarpit | A trap punishes a charging or ultimate attack. | [tarpit.png](../public/art/cards/tarpit.png) |
| Equal-Cost Multipath | Every live parallel route adds transmission damage. | [ecmp.png](../public/art/cards/ecmp.png) |
| Spine-Leaf | Deploys a switch connected to every router. | [spine-leaf.png](../public/art/cards/spine-leaf.png) |
| Mesh Weave | Connects a selected device to its two nearest unconnected devices. | [mesh-weave.png](../public/art/cards/mesh-weave.png) |
| Deep Packet Inspection | Online firewalls combine to provide block. | [deep-inspection.png](../public/art/cards/deep-inspection.png) |
| Stateful Firewall | A stronger firewall doubles protection against strikes and breaches. | [stateful-firewall.png](../public/art/cards/stateful-firewall.png) |
| Reflect | Doubles stored defensive backpressure. | [reflect.png](../public/art/cards/reflect.png) |
| Store and Forward | Adds damage to a buffer for a later transmission. | [store-forward.png](../public/art/cards/store-forward.png) |
| Replay Attack | Doubles the stored packet buffer. | [replay-attack.png](../public/art/cards/replay-attack.png) |
| Dark Fiber | An elusive protected cable resists cuts. | [dark-fiber.png](../public/art/cards/dark-fiber.png) |
| Packet Loss | Useless traffic fragments vanish at the end of the turn. | [packet-loss.png](../public/art/cards/packet-loss.png) |
| Worm | Malicious software in the hand increases incoming damage until deleted. | [worm.png](../public/art/cards/worm.png) |
| CVE | A persistent vulnerability weakens the deck until removed. | [cve.png](../public/art/cards/cve.png) |
| Emergency Rebuild | Deploys a new router already connected to both terminals. | [rebuild.png](../public/art/cards/rebuild.png) |
| Emergency Repair | Restores integrity and provides immediate block. | [emergency.png](../public/art/cards/emergency.png) |
| Link Recovery | Repairs jammed hardware and reconnects a severed cable. | [protocol.png](../public/art/cards/protocol.png) |

## Local production

- Model: [Krea 2 Turbo](https://huggingface.co/krea/Krea-2-Turbo).
- Runtime: [ComfyUI](https://github.com/Comfy-Org/ComfyUI), revision `b5cc8830279eae909a59de030af1e50761c36751`.
- Model packaging: [Comfy-Org/Krea-2](https://huggingface.co/Comfy-Org/Krea-2/tree/eb1eddd3983a54678545a9b2c178c5853b30f7be), revision `eb1eddd3983a54678545a9b2c178c5853b30f7be`.
- Diffusion weights: `diffusion_models/krea2_turbo_fp8_scaled.safetensors`.
- Encoder: `text_encoders/qwen3vl_4b_fp8_scaled.safetensors`.
- VAE: `vae/qwen_image_vae.safetensors`.
- Canvas: 1536 × 1024; 8 steps; Euler sampler; simple schedule; CFG 1; one image per prompt. No prompt rewriting.
- Style reference: the original Switch painting, cell 1 of the three-column `public/art/card-atlas.png` sheet, extracted into ComfyUI's `input/faultline-original-style.png`. Krea's `krea2_style_reference.safetensors` LoRA runs at strength 0.8. The prompts emphasize layered oil painting, broken painted edges and atmospheric ruined architecture. This direction was selected using a PoE sample compared with the original Switch and Capacitor paintings. Extract the 418 × 418 region from x=418, y=0 in the original atlas and save it with that input filename before generating.
- Hardware: NVIDIA GeForce RTX 4080 SUPER, 16 GB VRAM. The local runtime lives outside the game at `~/.local/share/faultline-imagegen/`.
- The model uses the [Krea 2 Community License](https://github.com/krea-ai/krea-2/blob/main/docs/KREA-2-COMMUNITY-LICENSE), copied to [the artwork license notice](../public/art/cards/KREA-2-COMMUNITY-LICENSE.txt). Its commercial-use terms include a company-wide annual revenue threshold below USD 1 million. Model weights and inference packages are not distributed with the game.

To reproduce candidates, start the installed runtime:

```sh
cd ~/.local/share/faultline-imagegen/ComfyUI
../.venv/bin/python main.py --listen 127.0.0.1 --port 8189 --disable-api-nodes --disable-all-custom-nodes --preview-method none --reserve-vram 4
```

From this repository, generate the local cards with:

```sh
python3 scripts/generate_card_art.py
# Or select an individual card:
python3 scripts/generate_card_art.py --card poe-injector
```

The script saves candidates and the submitted ComfyUI workflows in `artifacts/card-art/` and skips existing candidates. Use a separate `--output` directory for a fresh run. Review candidates at full size and inside the card crop before copying selected PNGs to `public/art/cards/`. The game needs no model, Python installation, server or API key at runtime.

To review the installed assets against the actual card renderer, run the game on a separate local port, then:

```sh
node --experimental-strip-types dev/review-card-art.ts http://127.0.0.1:5186/
```

This checks distinct base-card paintings, shared upgrade artwork and image decoding, and captures the replacement set and two desktop encounters in `artifacts/card-art-review/`.
