"""Original instrumental YuE2 scores; vocal channel stays silent in the ABC plan.
Delivery uses Demucs' accompaniment stems to exclude accidental generated singing.
Native generations, removed vocal stems and mastered music remain separate.
"""
from pathlib import Path
import json, subprocess, gc
import torch, numpy as np, soundfile as sf
import imageio_ffmpeg
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
    destination=ROOT/'soundtrack'/'instrumental-v3'/name
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

from demucs.pretrained import get_model
from demucs.apply import apply_model
from demucs.audio import convert_audio
model=get_model('htdemucs_ft');model.to('cuda').eval()
for name,*_ in TRACKS:
    source=ROOT/'soundtrack'/'instrumental-v3'/name
    dest=ROOT/'soundtrack'/'masters-v3'/name;dest.mkdir(parents=True,exist_ok=True)
    instrumental=dest/'instrumental.wav'
    if not instrumental.exists():
        print('Separating instrumental stems: '+name,flush=True)
        data,sr=sf.read(source/'audio.flac',dtype='float32',always_2d=True)
        wav=convert_audio(torch.from_numpy(data.T),sr,model.samplerate,model.audio_channels)
        ref=wav.mean(0);mean,std=ref.mean(),ref.std();normalized=(wav-mean)/std
        with torch.inference_mode(): sources=apply_model(model,normalized[None],device='cuda',shifts=1,split=True,overlap=.25,progress=True)[0].cpu()*std
        vocals=model.sources.index('vocals')
        accompaniment=sum(sources[i] for i in range(len(model.sources)) if i!=vocals)
        sf.write(instrumental,accompaniment.T.numpy(),model.samplerate,subtype='PCM_24')
        sf.write(dest/'removed-vocals.wav',sources[vocals].T.numpy(),model.samplerate,subtype='PCM_24')
        stats={'source':'../../instrumental-v3/'+name+'/audio.flac','separation_model':'htdemucs_ft','included_stems':[s for s in model.sources if s!='vocals'],'excluded_stems':['vocals'],'instrumental_rms':float(accompaniment.square().mean().sqrt()),'removed_vocal_rms':float(sources[vocals].square().mean().sqrt()),'sample_rate':model.samplerate}
        (dest/'master.json').write_text(json.dumps(stats,indent=2)+'\n')
    duration=sf.info(instrumental).duration
    # New filenames invalidate a browser's cached first-pass score.
    output=ROOT/'public'/'audio'/f'{name}-instrumental.ogg'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-loglevel','error','-y','-i',str(instrumental),'-af',f'afade=t=in:d=1.5,afade=t=out:st={max(0,duration-3)}:d=3,loudnorm=I=-19:TP=-2:LRA=11','-ar','48000','-c:a','libvorbis','-q:a','5',str(output)],check=True)
    print('Master ready: '+str(output),flush=True)
