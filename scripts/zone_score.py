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
 ('the-copper-market',92,28,'Instrumental intimate science fiction merchant workshop soundtrack. Playful muted plucked strings, warm marimba melody, upright bass, brushed light percussion, soft analog sequencer, curious intricate clockwork atmosphere, welcoming and mysterious. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',918331),
 ('a-light-left-on',68,24,'Instrumental peaceful sanctuary soundtrack inside an abandoned orbital cathedral. Delicate felt piano, warm long cello notes, airy glass bells, very soft analog pads, long reverb, reassuring and contemplative, gentle bittersweet hope. No drums, spacious and quiet. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',918332),
 ('a-thousand-fractures',116,36,'Instrumental cinematic electronic orchestral elite battle soundtrack. Angular cello ostinatos, metallic found-object percussion, broken beat analog drums, dark pulsing bass, dissonant glass arpeggios, tense brass swells. Intricate urgent momentum with a memorable rising piano motif. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',918333),
]
# One 4/4 bar is 32 units at L:1/32. D minor motif develops over four harmonies.
MELODIES=[
 ['D4 F4 A8 f4 e4 d8','c4 e4 G8 c4 G4 E8','B,4 D4 F8 d4 c4 B8','A,4 E4 A8 ^c4 B4 A8'],
 ['D16 A8 d8','c16 G8 e8','B,16 F8 d8','A,16 E8 ^C8'],
 ['D4 A4 F4 A4 d4 A4 f4 e4','c4 G4 E4 G4 e4 G4 c8','B,4 F4 D4 F4 B4 F4 d4 c4','A,4 E4 ^C4 E4 A4 E4 ^c8'],
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
    request=dict(id=name+'-instrumental-v3',style=style+f' D minor, {bpm} BPM.',lyrics='',cot='full',abc=score,seed=seed)
    print('Rendering '+name,flush=True)
    with YuE2Pipeline.from_pretrained('m-a-p/YuE2-3B',vae='m-a-p/YuE2-Vae',device='cuda',memory_budget_gib=16,offload_ar=True) as pipe:
        song=pipe(**request);song.save_artifacts(destination)
        print(json.dumps({'track':name,'seconds':len(song.audio)/song.sample_rate,'truncated':song.truncated}),flush=True)
    del song;gc.collect();torch.cuda.empty_cache()

for name,*_ in TRACKS:
    master_track(name, "v3")
write_manifest()
