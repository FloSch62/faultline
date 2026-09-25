# FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md.
"""Original instrumental YuE2 scores; vocal channel stays silent in the ABC plan.
Masters preserve the complete native recording, without source separation.
"""
from pathlib import Path
import json, gc
import torch
from master_score import master_track, write_manifest
from yue2 import YuE2Pipeline
ROOT=Path(__file__).resolve().parents[1]
TRACKS=[
 ('the-last-relay',78,44,'Instrumental atmospheric science fiction exploration soundtrack. Felt piano melody, soft cello, analog synth pads, delicate metallophone, distant soft drum pulse, spacious cathedral reverb, melancholic and mysterious. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no spoken words.',918321),
 ('signal-and-steel',108,56,'Instrumental dark electronic orchestral tactical combat soundtrack. Driving analog arpeggiator, punchy industrial drums, low cellos, brass accents, deep pulsing bass, glass percussion. Intricate rhythmic momentum, warm weathered machines, powerful but restrained. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',918322),
 ('the-blackout-core',120,64,'Instrumental cinematic dark orchestral boss battle soundtrack. Relentless low taiko drums, staccato cellos, ominous brass chords, distorted analog bass, urgent piano motif and shimmering metallic synths. Monumental tension and a heroic dark finale. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',918323),
]
# One 4/4 bar is 32 units at L:1/32. D minor motif develops over four harmonies.
MELODIES=[
 ['D8 A8 d8 f8','e8 d8 c16','B,8 F8 B8 d8','A8 G8 E8 ^C8'],
 ['D4 A4 d4 A4 f4 d4 A8','c4 G4 e4 G4 e8 d8','B,4 F4 B4 F4 d8 c8','A,4 E4 A4 E4 ^C8 E8'],
 ['D4 F4 A4 d4 f8 e8','c4 e4 g4 e4 c8 G8','B,4 D4 F4 B4 d8 c8','A,4 ^C4 E4 A4 ^c8 A8'],
]
for index,(name,bpm,bars,style,seed) in enumerate(TRACKS):
    destination=ROOT/'soundtrack'/'tracks'/name
    if (destination/'result.json').exists() and (destination/'audio.flac').exists(): continue
    score=f'X:1\nT:\nM:4/4\nL:1/32\nQ:1/4={bpm}\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:Dm\n'
    for bar in range(0,bars,4):
        melody=MELODIES[index]
        # Intro and ending leave room for the arrangement to breathe.
        if bar==0: melody=['D16 A16','c16 G16','B,16 F16','A,16 E16']
        if bar==bars-4: melody=['D8 A8 d16','c8 G8 e16','B,8 F8 d16','D32']
        score+='% instrumental\nV: Vocal\n"Dm"z32|"C"z32|"Bb"z32|"A"z32|\nV: Ins\n'+'|'.join(melody)+'|\n'
    request=dict(id=name+'-instrumental-v2',style=style+f' D minor, {bpm} BPM.',lyrics='',cot='full',abc=score,seed=seed)
    print('Rendering '+name,flush=True)
    with YuE2Pipeline.from_pretrained('m-a-p/YuE2-3B',vae='m-a-p/YuE2-Vae',device='cuda',memory_budget_gib=16,offload_ar=True) as pipe:
        song=pipe(**request);song.save_artifacts(destination)
        print(json.dumps({'track':name,'seconds':len(song.audio)/song.sample_rate,'truncated':song.truncated}),flush=True)
    del song;gc.collect();torch.cuda.empty_cache()

for name,*_ in TRACKS:
    master_track(name, "v2")
write_manifest()
