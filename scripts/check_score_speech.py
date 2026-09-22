"""Optional speech regression check; recognition is not a substitute for listening."""
from pathlib import Path
import json
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parents[1]
model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=8)
report={}
for path in sorted((ROOT/'public'/'audio').glob('*-instrumental.ogg')):
    print('Checking '+path.name,flush=True)
    segments,info=model.transcribe(str(path),vad_filter=True,condition_on_previous_text=False,beam_size=5)
    entries=[{'start':s.start,'end':s.end,'text':s.text,'avg_logprob':s.avg_logprob,'no_speech_prob':s.no_speech_prob} for s in segments]
    report[path.name]={'model':'Systran/faster-whisper-small','language':info.language,'language_probability':info.language_probability,'segments':entries}
    print(json.dumps(report[path.name]),flush=True)
(ROOT/'soundtrack'/'masters-v3'/'speech-check.json').write_text(json.dumps(report,indent=2)+'\n')
