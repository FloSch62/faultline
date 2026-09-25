# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Seven cinematic YuE2 battle themes: Copperlight Pursuit's orchestral rework and two more
pieces for each stage's rotation. Plans are written as named four-bar sections and a form."""
import argparse
import re
from master_score import master_track, write_manifest
from stage_score import generate

VERSION = "v6"
TRACKS = [
    dict(id="copperlight-pursuit", title="Copperlight Pursuit", stage=1, bpm=124, key="Dm", seed=923061,
         style="Driving cinematic electronic orchestral pursuit through sunlit copper ruins. Galloping warm analog bass and low string ostinato, punchy live drums with taiko and hammered metal percussion, plucked cello counterpoint and a bold heroic French horn and string theme answered by bright piano. Nimble, urgent and hopeful; orchestral weight carried by electronic momentum, strong melodic hook.",
         sections=dict(
             intro=(["Dm", "C", "Bb", "A"], ["D16 A16", "C16 G16", "B,16 F16", "A,16 E16"]),
             drive=(["Dm", "C", "Bb", "A"], ["D2 D2 D4 D2 D2 D4 F2 F2 F4 A2 A2 A4", "C2 C2 C4 C2 C2 C4 E2 E2 E4 G2 G2 G4",
                                              "B,2 B,2 B,4 B,2 B,2 B,4 D2 D2 D4 F2 F2 F4", "A,2 A,2 A,4 A,2 A,2 A,4 ^C2 ^C2 ^C4 E2 E2 E4"]),
             theme=(["Dm", "C", "Bb", "A"], ["A,4 D4 E4 F4 A12 G4", "G6 F2 E8 C8 E8", "F4 D4 B,4 D4 F8 B8", "A12 G4 E8 ^C8"]),
             rise=(["Bb", "F", "Gm", "A"], ["d12 c4 B8 F8", "c12 A4 F8 A8", "B8 d8 g12 f4", "e16 ^c8 A8"]),
             hush=(["Dm", "C", "Bb", "A"], ["D16 F16", "C16 E16", "B,16 D16", "A,16 ^C16"]),
             coda=(["Dm", "C", "Bb", "Dm"], ["D8 A8 d16", "C8 G8 e16", "B,8 F8 d16", "D32"])),
         form=["intro", "drive", "theme", "theme", "drive", "rise", "rise", "theme", "hush", "drive", "rise", "theme", "coda"]),
    dict(id="kingdom-of-rust", title="Kingdom of Rust", stage=1, bpm=108, key="Dm", seed=927068,
         style="Powerful strategic cinematic battle score for a war of wits in a kingdom of rust. Deliberate heavy taiko and orchestral bass drum hits, ticking clockwork and metal percussion, relentless low string and cello ostinato, massive low brass and trombone chords, a commanding French horn theme doubled by strings, deep warm analog bass. Calculated, confident and weighty; slow-building tactical tension that lands with full orchestral power, earthy copper tones.",
         sections=dict(
             intro=(["Dm", "Gm", "Bb", "A"], ["D32", "G,32", "B,32", "A,32"]),
             tick=(["Dm", "Gm", "Bb", "A"], ["D4 A,4 D4 F4 D4 A,4 D4 F4", "G,4 D4 G4 B4 G,4 D4 G4 B4",
                                            "B,4 F4 B,4 D4 B,4 F4 B,4 D4", "A,4 E4 A,4 ^C4 A,4 E4 A4 E4"]),
             theme=(["Dm", "Gm", "Bb", "A"], ["D12 A4 A8 G4 F4", "G12 B4 d8 c4 B4", "F12 D4 B,8 D8", "A24 E8"]),
             build=(["Bb", "C", "Dm", "A"], ["B,8 D8 F8 B8", "C8 E8 G8 c8", "D8 F8 A8 d8", "^C8 E8 A8 ^c8"]),
             power=(["Gm", "Dm", "Bb", "A"], ["d16 B8 G8", "A16 F8 D8", "B8 d8 f16", "e16 ^c16"]),
             coda=(["Dm", "Gm", "A", "Dm"], ["D16 A16", "G,16 D16", "A,16 E16", "D32"])),
         form=["intro", "tick", "theme", "theme", "build", "power", "power", "tick", "theme", "build", "power", "coda"]),
    dict(id="sparks-on-the-wire", title="Sparks on the Wire", stage=1, bpm=130, key="Dm", seed=924063,
         style="Fast propulsive cinematic folk-orchestral battle as sparks fly from old copper lines. Syncopated low string and analog bass ostinato, pounding taiko and frame drums, spiccato violins, hammered dulcimer and a fiery solo violin melody answered by bold brass. Energetic, bright and adventurous, acoustic warmth with electronic drive.",
         sections=dict(
             intro=(["Dm", "Bb", "Gm", "A"], ["D32", "B,32", "G,32", "A,16 ^C16"]),
             ostinato=(["Dm", "Bb", "Gm", "A"], ["D6 D6 D4 A,6 A,6 D4", "B,6 B,6 B,4 F6 F6 B,4", "G,6 G,6 G,4 D6 D6 G,4", "A,6 A,6 A,4 E6 E6 ^C4"]),
             fiddle=(["Dm", "Bb", "Gm", "A"], ["d4 A4 d4 e4 f8 e4 d4", "d4 B4 F4 B4 d8 c4 B4", "B4 G4 D4 G4 B4 c4 d8", "^c4 e4 a8 g4 f4 e8"]),
             lift=(["F", "C", "Bb", "A"], ["f8 a8 f4 e4 c8", "e8 g8 e4 d4 c8", "d8 f8 d4 c4 B8", "^c8 e8 a16"]),
             coda=(["Dm", "Bb", "A", "Dm"], ["d8 A8 F16", "d8 B8 F16", "e8 ^c8 A16", "D32"])),
         form=["intro", "ostinato", "ostinato", "fiddle", "fiddle", "lift", "lift", "ostinato", "fiddle", "fiddle", "lift", "lift", "fiddle", "coda"]),
    dict(id="refraction", title="Refraction", stage=2, bpm=120, key="Am", seed=924064,
         style="Driving elegant cinematic battle in a cathedral of fractured glass. Baroque harpsichord and prepared piano ostinato, pizzicato and spiccato strings, deep taiko and orchestral percussion, struck-glass bells, a soaring solo violin and cello theme and cold shimmering synth pads. Tense, relentless and graceful, baroque motion meeting modern cinematic drums, cold violet light.",
         sections=dict(
             intro=(["Am", "G", "F", "E"], ["A32", "G32", "F32", "E32"]),
             spiral=(["Am", "G", "F", "E"], ["A2 c2 e2 a2 e2 c2 A2 c2 A2 c2 e2 a2 e2 c2 A2 c2", "G2 B2 d2 g2 d2 B2 G2 B2 G2 B2 d2 g2 d2 B2 G2 B2",
                                             "F2 A2 c2 f2 c2 A2 F2 A2 F2 A2 c2 f2 c2 A2 F2 A2", "E2 ^G2 B2 e2 B2 ^G2 E2 ^G2 E2 ^G2 B2 e2 B2 ^G2 E2 ^G2"]),
             lament=(["Am", "G", "F", "E"], ["e12 d4 c8 B8", "d12 c4 B8 G8", "c12 B4 A8 F8", "^G8 B8 e16"]),
             ascent=(["Dm", "Am", "F", "E"], ["f8 a8 f8 d8", "e8 a8 e8 c8", "c8 f8 a8 f8", "e8 ^g8 b16"]),
             still=(["Am", "G", "F", "E"], ["a16 e16", "g16 d16", "f16 c16", "e32"]),
             coda=(["Am", "G", "F", "Am"], ["A8 e8 a16", "G8 d8 g16", "F8 c8 f16", "A32"])),
         form=["intro", "spiral", "lament", "lament", "spiral", "ascent", "ascent", "lament", "still", "spiral", "ascent", "lament", "coda"]),
    dict(id="bells-of-broken-glass", title="Bells of Broken Glass", stage=2, bpm=92, key="Am", seed=926065,
         style="Heavy slow cinematic battle beneath a shattered glass dome. Massive half-time orchestral drums and taiko, tolling tubular bells and glass bells, dark low brass and cello chords, tremolo violins, a lonely piano motif growing into a grand string and horn theme, deep sub bass swells. Ominous and majestic, cold violet grandeur, crushing weight.",
         sections=dict(
             toll=(["Am", "F", "Dm", "E"], ["A16 E16", "F16 C16", "D16 A,16", "E16 B,16"]),
             theme=(["Am", "F", "Dm", "E"], ["A4 B4 c8 e16", "f8 e8 c16", "d4 e4 f8 a16", "^g16 e16"]),
             pulse=(["Am", "F", "Dm", "E"], ["A,4 A,4 A,4 A,4 A,4 A,4 C4 E4", "F,4 F,4 F,4 F,4 F,4 F,4 A,4 C4",
                                             "D4 D4 D4 D4 D4 D4 F4 A4", "E4 E4 E4 E4 ^G4 ^G4 B4 B4"]),
             grand=(["C", "G", "Am", "E"], ["c8 e8 g16", "d8 g8 b16", "a16 e8 c8", "B8 ^G8 E16"]),
             coda=(["Am", "F", "E", "Am"], ["A32", "F32", "E32", "A32"])),
         form=["toll", "theme", "pulse", "theme", "grand", "grand", "pulse", "theme", "grand", "coda"]),
    dict(id="quarantine-breach", title="Quarantine Breach", stage=3, bpm=126, key="Cm", seed=925069,
         style="Dark driving cinematic electronic orchestral battle breaching a quarantine shell. Pulsing low string ostinato and deep analog bass, thunderous taiko and industrial drums, heavy brass chords and a bold, memorable heroic horn and string melody over powerful minor-key harmony. Menacing but melodic, ember-red machinery, controlled power.",
         sections=dict(
             intro=(["Cm", "Fm", "Ab", "G"], ["C32", "F,32", "A,32", "G,32"]),
             riff=(["Cm", "Fm", "Ab", "G"], ["C4 C2 C2 G,4 C4 C2 C2 E4 G4 C4", "F,4 F,2 F,2 C4 F,4 F,2 F,2 A,4 C4 F4",
                                            "A,4 A,2 A,2 E4 A,4 A,2 A,2 C4 E4 A4", "G,4 G,2 G,2 D4 G,4 G,2 G,2 =B,4 D4 G4"]),
             theme=(["Cm", "Fm", "Ab", "G"], ["G8 c8 e12 d4", "c12 A4 F16", "E8 A8 c12 e4", "d16 =B8 G8"]),
             answer=(["Ab", "Bb", "Cm", "G"], ["e8 c8 A16", "d8 B8 F16", "G8 c8 e8 g8", "=B16 d16"]),
             defiance=(["Ab", "Bb", "Cm", "G"], ["c8 e8 a16", "B8 d8 f16", "g12 f4 e8 c8", "d8 =B8 G16"]),
             hold=(["Cm", "Ab", "Fm", "G"], ["C32", "A,32", "F,32", "G,16 =B,16"]),
             coda=(["Cm", "Fm", "G", "Cm"], ["C8 G8 c16", "F8 A8 c16", "=B,8 D8 G16", "C32"])),
         form=["intro", "riff", "theme", "answer", "riff", "defiance", "defiance", "hold", "theme", "answer", "defiance", "defiance", "coda"]),
    dict(id="hold-the-line", title="Hold the Line", stage=3, bpm=108, key="Cm", seed=923067,
         style="Emotional heroic cinematic battle theme at the edge of the blackout. Steady driving eighth-note piano and low strings, big tom and taiko grooves, soaring cello and violin melody, swelling French horns and warm glowing analog pads beneath the darkness. Determined and bittersweet, building to a triumphant hopeful climax that breaks into dawn.",
         sections=dict(
             intro=(["Cm", "Ab", "Eb", "Bb"], ["C32", "A,32", "E32", "B,32"]),
             pulse=(["Cm", "Ab", "Eb", "Bb"], ["C4 G4 c4 G4 C4 G4 c4 G4", "A,4 E4 A4 E4 A,4 E4 A4 E4",
                                               "E4 B4 e4 B4 E4 B4 e4 B4", "B,4 F4 B4 F4 B,4 F4 B4 F4"]),
             theme=(["Cm", "Ab", "Eb", "Bb"], ["G8 c8 d8 e8", "e12 d4 c16", "B8 e8 g8 f8", "f16 d16"]),
             climb=(["Fm", "Ab", "Bb", "Cm"], ["c8 f8 a16", "a12 g4 e16", "f8 d8 B8 d8", "e8 d8 c16"]),
             dawn=(["Ab", "Bb", "C", "C"], ["A,8 E8 A16", "B,8 F8 B16", "C8 =E8 G8 c8", "c32"])),
         form=["intro", "theme", "pulse", "theme", "climb", "climb", "pulse", "theme", "theme", "climb", "climb", "dawn"]),
]
NOTE = re.compile(r"[=^_]*[A-Ga-gz][,']*(\d*)")


def score_for(track):
    score = f'X:1\nT:\nM:4/4\nL:1/32\nQ:1/4={track["bpm"]}\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:{track["key"]}\n'
    for name in track["form"]:
        chords, bars = track["sections"][name]
        for bar in bars:
            # Every bar is exactly one 4/4 measure of 32 units, or YuE2 drifts off the plan.
            if sum(int(length or 1) for length in NOTE.findall(bar)) != 32:
                raise ValueError(f'{track["id"]} {name}: bar is not 4/4: {bar}')
        score += "% instrumental\nV: Vocal\n" + "|".join(f'"{chord}"z32' for chord in chords) + "|\nV: Ins\n" + "|".join(bars) + "|\n"
    return score


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", action="append", choices=[t["id"] for t in TRACKS])
    parser.add_argument("--phase", choices=["all", "generate", "master"], default="all")
    args = parser.parse_args()
    tracks = [t for t in TRACKS if not args.track or t["id"] in args.track]
    if args.phase in ("all", "generate"):
        generate(tracks, VERSION, score_for)
    if args.phase in ("all", "master"):
        for track in tracks:
            master_track(track["id"], VERSION)
        write_manifest()


if __name__ == "__main__":
    main()
