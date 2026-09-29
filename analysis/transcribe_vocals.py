"""Whisper large-v3 transcription of the Demucs vocal stem -> analysis/work/whisper.json.

Used to find what is actually sung and roughly where (align_lyrics.py does the precise timing).
Apple Silicon: mlx-whisper. Elsewhere swap in faster-whisper with word_timestamps=True.

Run:  analysis/.venv/bin/python analysis/transcribe_vocals.py [analysis/stems/htdemucs_ft/track/vocals.wav]
"""
import json
import os
import sys

import mlx_whisper

import librosa

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}
stem = args[0] if args else 'analysis/stems/htdemucs_ft/track/vocals.wav'
# --clip=t0,t1 transcribes a window only (Whisper sometimes skips a whole 30 s window of a song;
# re-running the window on its own recovers it). Times in the output stay absolute.
t0, t1 = (float(x) for x in opt['--clip'].split(',')) if '--clip' in opt else (0.0, None)
y, _ = librosa.load(stem, sr=16000, mono=True, offset=t0, duration=None if t1 is None else t1 - t0)
os.makedirs('analysis/work', exist_ok=True)
r = mlx_whisper.transcribe(
    y,
    path_or_hf_repo='mlx-community/whisper-large-v3-mlx',
    language='en',
    word_timestamps=True,
    condition_on_previous_text=False,
    no_speech_threshold=0.5,
    hallucination_silence_threshold=2.0,
)
out = [{'start': round(s['start'] + t0, 3), 'end': round(s['end'] + t0, 3), 'text': s['text'].strip(),
        'words': [{'w': w['word'].strip(), 'start': round(w['start'] + t0, 3), 'end': round(w['end'] + t0, 3),
                   'p': round(w['probability'], 3)} for w in s.get('words', [])]} for s in r['segments']]
name = 'whisper.json' if '--clip' not in opt else f'whisper_{int(t0)}_{int(t1)}.json'
json.dump(out, open(f'analysis/work/{name}', 'w'), indent=1)
for s in out:
    print(f"{s['start']:7.2f}-{s['end']:7.2f}  " + ' '.join(f"{w['w']}@{w['start']:.2f}({w['p']:.2f})" for w in s['words']))
