"""Optional speech regression check; recognition is not a substitute for listening."""
from pathlib import Path
import json, argparse, hashlib
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--report',default='soundtrack/native-mix-speech-check.json')
parser.add_argument('--tracks',nargs='*')
args=parser.parse_args()
model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=8)
report={}
for path in sorted((ROOT/'public'/'audio').glob('*-instrumental.ogg')):
    if args.tracks and path.stem.removesuffix('-instrumental') not in args.tracks: continue
    print('Checking '+path.name,flush=True)
    segments,info=model.transcribe(str(path),vad_filter=True,condition_on_previous_text=False,beam_size=5)
    entries=[{'start':s.start,'end':s.end,'text':s.text,'avg_logprob':s.avg_logprob,'no_speech_prob':s.no_speech_prob} for s in segments]
    report[path.name]={'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'model':'Systran/faster-whisper-small','language':info.language,'language_probability':info.language_probability,'segments':entries}
    print(json.dumps(report[path.name]),flush=True)
(ROOT/args.report).write_text(json.dumps(report,indent=2)+'\n')
