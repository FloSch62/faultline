"""Original instrumental YuE2 scores; vocal channel stays silent in the ABC plan.
Delivery uses Demucs' accompaniment stems to exclude accidental generated singing.
Native generations, removed vocal stems and mastered music remain separate.
"""
from pathlib import Path
import json, subprocess, gc
import torch, soundfile as sf
import imageio_ffmpeg
from yue2 import YuE2Pipeline
ROOT=Path(__file__).resolve().parents[1]
TRACKS=[
 ('copperlight-pursuit',124,48,'Instrumental science fiction tactical battle soundtrack. Driving warm analog bass sequence, precise breakbeat drums, plucked cello counterpoint and a memorable rising arpeggiated synth lead. Nimble adventurous pursuit through copper ruins; urgent but hopeful, clear melodic structure, evolving instrumental arrangement. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',923041),
 ('ghosts-in-the-relay',104,44,'Instrumental dark atmospheric tactical combat soundtrack. Syncopated trip hop drums, deep sub bass, haunted prepared piano motif, icy glass mallets, tremolo strings, shifting electronic textures and carefully placed heavy percussion. Suspenseful stalking pulse with dynamic peaks, ominous broken orbital relay. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',923042),
 ('redline-protocol',138,52,'Instrumental intense electronic orchestral battle soundtrack. Fast motorik analog sequencers, aggressive low cello ostinato, tight punchy drums, metallic taiko impacts and a soaring brass melody. Defiant machine combat in the heart of a collapsing orbital station. Energetic developing arrangement, memorable rhythmic hook. Entirely instrumental, empty vocal part, no singing, no choir, no humming, no speech.',923043),
]
# One 4/4 bar is 32 units at L:1/32. D minor motif develops over four harmonies.
MELODIES=[
 ['D2 F2 A4 d4 A4 f4 e4 d8','c2 E2 G4 c4 G4 e4 d4 c8','B,2 D2 F4 B4 F4 d4 c4 B8','A,2 ^C2 E4 A4 E4 ^c4 B4 A8'],
 ['D8 z4 A4 F8 E4 D4','C8 z4 G4 E8 D4 C4','B,8 z4 F4 D8 C4 B,4','A,8 z4 E4 ^C8 B,4 A,4'],
 ['D2 A2 D2 A2 F4 A4 d4 c4 A4 F4','C2 G2 C2 G2 E4 G4 c4 B4 G4 E4','B,2 F2 B,2 F2 D4 F4 B4 A4 F4 D4','A,2 E2 A,2 E2 ^C4 E4 A4 G4 E4 ^C4'],
]
for index,(name,bpm,bars,style,seed) in enumerate(TRACKS):
    destination=ROOT/'soundtrack'/'instrumental-v4'/name
    if (destination/'result.json').exists() and (destination/'audio.flac').exists(): continue
    score=f'X:1\nT:\nM:4/4\nL:1/32\nQ:1/4={bpm}\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:Dm\n'
    for bar in range(0,bars,4):
        melody=MELODIES[index]
        # Intro and ending leave room for the arrangement to breathe.
        if bar==0: melody=['D16 A16','c16 G16','B,16 F16','A,16 E16']
        if bar==bars-4: melody=['D8 A8 d16','c8 G8 e16','B,8 F8 d16','D32']
        score+='% instrumental\nV: Vocal\n"Dm"z32|"C"z32|"Bb"z32|"A"z32|\nV: Ins\n'+'|'.join(melody)+'|\n'
    request=dict(id=name+'-instrumental-v4',style=style+f' D minor, {bpm} BPM.',lyrics='',cot='full',abc=score,seed=seed)
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
    source=ROOT/'soundtrack'/'instrumental-v4'/name
    dest=ROOT/'soundtrack'/'masters-v4'/name;dest.mkdir(parents=True,exist_ok=True)
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
        stats={'source':'../../instrumental-v4/'+name+'/audio.flac','separation_model':'htdemucs_ft','included_stems':[s for s in model.sources if s!='vocals'],'excluded_stems':['vocals'],'instrumental_rms':float(accompaniment.square().mean().sqrt()),'removed_vocal_rms':float(sources[vocals].square().mean().sqrt()),'sample_rate':model.samplerate}
        (dest/'master.json').write_text(json.dumps(stats,indent=2)+'\n')
    duration=sf.info(instrumental).duration
    # New filenames invalidate a browser's cached first-pass score.
    output=ROOT/'public'/'audio'/f'{name}-instrumental.ogg'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-loglevel','error','-y','-i',str(instrumental),'-af',f'afade=t=in:d=1.5,afade=t=out:st={max(0,duration-3)}:d=3,loudnorm=I=-19:TP=-2:LRA=11','-ar','48000','-c:a','libvorbis','-q:a','5',str(output)],check=True)
    print('Master ready: '+str(output),flush=True)
