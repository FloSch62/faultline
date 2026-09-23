"""Six original YuE2 stage themes; masters preserve the complete native recording."""
import argparse
import gc
import json
from pathlib import Path
from master_score import master_track, write_manifest

ROOT = Path(__file__).resolve().parents[1]
VERSION = "v5"
INSTRUMENTAL = " Entirely instrumental: empty vocal part, no lyrics, singing, choir, humming or speech. Evolving instrumental arrangement, clear melodic development, spacious ending."
TRACKS = [
    dict(id="paths-of-copper", title="Paths of Copper", stage=1, scene="explore", bpm=78, bars=40, key="Dm", seed=923051,
         style="Atmospheric science fiction exploration score in an ancient copper relay kingdom. Intimate felt piano melody, warm plucked cello, delicate hammered dulcimer, worn analog pads and a soft irregular clockwork pulse. Curious, hopeful and weathered, expansive orbital ruins. Restrained dynamics and generous silence between phrases.",
         chords=["Dm", "Bb", "F", "A"],
         melody=["D8 F8 A8 E8", "F8 D8 B,16", "A8 c8 A8 F8", "E8 ^C8 A,16"],
         development=["D4 F4 A8 d8 c8", "B8 A8 F8 D8", "F8 A8 c8 a8", "e8 ^c8 A16"]),
    dict(id="the-second-way-home", title="The Second Way Home", stage=1, scene="battle", bpm=118, bars=48, key="Dm", seed=923052,
         style="Instrumental tactical battle score for copper machinery and an iron gatekeeper. Driving warm analog bass, nimble plucked cello ostinato, hammered metal percussion, tight broken-beat drums and a bold rising French horn motif. Mechanical swing, adventurous defiance, earthy brass and copper tones, clear melodic hook without harsh distortion.",
         chords=["Dm", "Bb", "F", "A"],
         melody=["D4 F4 A4 D4 d8 A8", "B,4 D4 F4 B,4 B8 F8", "F4 A4 c4 F4 a8 c8", "A,4 ^C4 E4 A,4 A8 E8"],
         development=["d4 A4 F4 A4 d4 e4 f8", "B4 F4 D4 F4 B4 c4 d8", "a4 c4 A4 c4 f4 e4 c8", "e4 ^c4 A4 E4 ^c4 B4 A8"]),
    dict(id="prismatic-silence", title="Prismatic Silence", stage=2, scene="explore", bpm=72, bars=36, key="Am", seed=923053,
         style="Quiet mysterious science fiction exploration inside a vast ruined glass cathedral. Isolated celesta and glass-marimba melody, bowed vibraphone, soft viola harmonics, distant breathless analog pads and sparse resonant bell overtones. Cold violet light, fragile reflections and long empty reverberation. No drums; delicate instrumental wonder and unease, never choral or vocal.",
         chords=["Am", "F", "C", "E"],
         melody=["A8 e8 c8 B8", "A8 F8 E16", "G8 c8 e8 d8", "B8 ^G8 E16"],
         development=["a8 e4 c4 B8 A8", "f8 c4 A4 G8 F8", "e8 d4 c4 G8 E8", "B8 ^G4 E4 B,8 E8"]),
    dict(id="shatter-the-choir", title="Shatter the Choir", stage=2, scene="battle", bpm=112, bars=48, key="Am", seed=923054,
         style="Dark elegant instrumental tactical combat in a fractured glass cathedral. Interlocking crystalline mallets and prepared piano arpeggios, agile staccato viola, deep restrained sub bass, precise syncopated electronic drums and sharp struck-glass percussion. Rising spirals of tension, an incisive melodic refrain, cold violet energy, detailed rhythmic interplay. Instruments only, absolutely no choir despite the title.",
         chords=["Am", "F", "C", "E"],
         melody=["A2 c2 e4 B4 c4 A8 E8", "F2 A2 c4 G4 A4 F8 C8", "C2 E2 G4 D4 E4 c8 G8", "E2 ^G2 B4 F4 ^G4 E8 B,8"],
         development=["a4 e4 c4 e4 B4 c4 A8", "f4 c4 A4 c4 G4 A4 F8", "e4 G4 c4 e4 d4 c4 G8", "e4 B4 ^G4 B4 ^d4 B4 E8"]),
    dict(id="messages-in-the-dark", title="Messages in the Dark", stage=3, scene="explore", bpm=76, bars=40, key="Cm", seed=923055,
         style="Ominous bittersweet science fiction exploration in the failing heart of a quarantined orbital network. A lonely low piano repeats an undelivered message above warm bowed bass, slowly beating analog sub pulses, distant metallic resonance and restrained cello swells. Deep charcoal atmosphere with a small persistent hopeful melody; patient, intimate, no pounding battle drums.",
         chords=["Cm", "Ab", "Fm", "G"],
         melody=["C8 G8 E8 D8", "A,8 C8 E16", "F8 C8 A,8 G,8", "G,8 =B,8 D16"],
         development=["C8 E8 G8 c8", "A8 G8 E8 C8", "F8 A8 c8 B8", "G8 =B8 d8 G8"]),
    dict(id="deliver-the-dawn", title="Deliver the Dawn", stage=3, scene="battle", bpm=132, bars=56, key="Cm", seed=923056,
         style="Urgent cinematic electronic orchestral tactical battle inside a collapsing transmission engine. Fast dark analog sequencers, relentless low cello ostinato, weighty industrial drums, dry metallic impacts and a defiant soaring brass and piano theme. Ember-red machinery and the final push to deliver a lost signal. Strong momentum, controlled powerful dynamics, minor-key tension resolving into hard-won hope.",
         chords=["Cm", "Ab", "Fm", "G"],
         melody=["C2 G2 C2 G2 E4 G4 c8 G8", "A,2 E2 A,2 E2 C4 E4 A8 E8", "F,2 C2 F,2 C2 A,4 C4 F8 C8", "G,2 D2 G,2 D2 =B,4 D4 G8 D8"],
         development=["c4 G4 c4 d4 e4 d4 c8", "A4 E4 A4 B4 c4 B4 A8", "F4 C4 F4 G4 A4 G4 F8", "G4 D4 G4 A4 =B4 A4 G8"]),
]


def score_for(track):
    score = f'X:1\nT:\nM:4/4\nL:1/32\nQ:1/4={track["bpm"]}\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:{track["key"]}\n'
    for bar in range(0, track["bars"], 4):
        melody = track["development"] if (bar // 8) % 2 else track["melody"]
        # Sustained opening and coda leave space around the central arrangement.
        if bar in (0, track["bars"] - 4):
            root = track["key"][0]
            melody = [f"{root}16 z16", *track["melody"][1:3], f"{root}32"]
        score += "% instrumental\nV: Vocal\n" + "|".join(f'"{chord}"z32' for chord in track["chords"]) + "|\nV: Ins\n" + "|".join(melody) + "|\n"
    return score


def generate(tracks):
    import torch
    from yue2 import YuE2Pipeline
    for track in tracks:
        destination = ROOT / "soundtrack" / "tracks" / track["id"]
        if (destination / "result.json").exists() and (destination / "audio.flac").exists():
            print("Already generated: " + track["id"], flush=True)
            continue
        request = dict(id=track["id"] + "-instrumental-" + VERSION,
                       style=track["style"] + INSTRUMENTAL + f' {track["key"]}, {track["bpm"]} BPM.',
                       lyrics="", cot="full", abc=score_for(track), seed=track["seed"])
        print("Rendering " + track["id"], flush=True)
        with YuE2Pipeline.from_pretrained("m-a-p/YuE2-3B", vae="m-a-p/YuE2-Vae", device="cuda",
                                         memory_budget_gib=16, offload_ar=True) as pipe:
            song = pipe(**request)
            song.save_artifacts(destination)
            print(json.dumps({"track": track["id"], "seconds": len(song.audio) / song.sample_rate,
                              "truncated": song.truncated}), flush=True)
            if any(song.truncated.values()):
                raise RuntimeError("Truncated generation: " + track["id"])
        del song
        gc.collect()
        torch.cuda.empty_cache()


def master(tracks):
    for track in tracks:
        master_track(track["id"], VERSION)
    write_manifest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", action="append", choices=[t["id"] for t in TRACKS])
    parser.add_argument("--phase", choices=["all", "generate", "master"], default="all")
    args = parser.parse_args()
    tracks = [t for t in TRACKS if not args.track or t["id"] in args.track]
    if args.phase in ("all", "generate"):
        generate(tracks)
    if args.phase in ("all", "master"):
        master(tracks)


if __name__ == "__main__":
    main()
