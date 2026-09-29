"""Forced alignment of the sung lyrics -> data/full/lyrics.json (word-level, engine format).

Input: analysis/sung_lyrics.txt (the lyrics as actually sung: sections, search windows, optional
alternatives and manual line starts) and the Demucs vocal stem.

Pipeline (CTC forced alignment, torchaudio.functional.forced_align, 20 ms frames):
  pass 1  each section as one CTC problem -> rough line starts; Whisper's start for the same line
          (analysis/work/whisper*.json) is taken too, and the earlier of the two opens the line window
  pass 2  each line alone in its own window (from its start to the next line's), so a drift in one
          line (backing vocals, held notes) cannot push the others around; alternatives are picked
          here by path score
  ends    CTC spans stop at a character's peak while sung vowels hold on, so word ends are extended
          along the vocal envelope, never into the next word
Word starts are the first frame of the word's first character, so the highlight does not run
ahead of the voice. Whisper is only used for line windows and as a cross-check.

Acoustic model: --model=lv60k (default; English wav2vec2 LV-60k fine-tuned on LibriSpeech 960 h)
or --model=mms (torchaudio MMS_FA, multilingual, with <star> tokens). On this track MMS mostly hears
noise in the choruses (stacked harmonies) and places them 0.5-1 s late; LV-60k reads them clearly.

Run (after demucs + transcribe_vocals.py):
  analysis/.venv/bin/python analysis/align_lyrics.py [vocals.wav] [--model=lv60k|mms] [--nohints]
Check with analysis/qa_plot.py.
"""
import glob
import json
import os
import re
import sys

os.environ.setdefault('TORCH_HOME', 'analysis/.cache/torch')

import numpy as np
import torch
import torchaudio
import torchaudio.functional as AF

SR = 16000
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}
stem = args[0] if args else 'analysis/stems/htdemucs_ft/track/vocals.wav'
MODEL = opt.get('--model', 'lv60k')


# ---------------------------------------------------------------- transcript
# A line is a list of slots; a slot is a list of alternatives; an alternative is a list of
# (display, align) words. Plain words are single-alternative slots.
def parse_word(tok):
    disp, _, alt = tok.partition('=')
    alt = alt.replace('_', ' ') if alt else disp
    alt = re.sub(r"[^a-z' ]", ' ', alt.lower().replace('-', ' ')).split()
    return disp, alt


sections = []
for raw in open('analysis/sung_lyrics.txt'):
    s = raw.strip()
    if not s or s.startswith('#'):
        continue
    m = re.match(r'\[(\w+)\s+([\d.]+)\s+([\d.]+)\]', s)
    if m:
        sections.append({'name': m[1], 't0': float(m[2]), 't1': float(m[3]), 'lines': [], 'hints': []})
        continue
    hint = None
    if s.startswith('@'):
        h, s = s.split(None, 1)
        hint = None if '--nohints' in sys.argv else float(h[1:])
    sections[-1]['hints'].append(hint)
    slots = []
    for tok in re.findall(r'\{[^}]*\}|\S+', s):
        if tok.startswith('{'):
            slots.append([[parse_word(w) for w in alt.split()] for alt in tok[1:-1].split('|')])
        else:
            slots.append([[parse_word(tok)]])
    sections[-1]['lines'].append(slots)

# ---------------------------------------------------------------- audio + model
wav, sr = torchaudio.load(stem)
wav = torchaudio.functional.resample(wav.mean(0, keepdim=True), sr, SR)
dur = wav.shape[1] / SR
if MODEL == 'mms':
    # <star> around each line soaks up held notes, ad-libs and backing vocals not in the transcript
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).eval()
    DICT = bundle.get_dict(star='*')
    STAR, SEP = DICT['*'], None
else:
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_LARGE_LV60K_960H
    model = bundle.get_model().eval()
    DICT = {c.lower(): i for i, c in enumerate(bundle.get_labels())}
    STAR, SEP = None, DICT['|']

# vocal envelope, 10 ms, dB
hop = SR // 100
x = wav[0].numpy()
rms = np.sqrt(np.convolve(x ** 2, np.ones(hop * 3) / (hop * 3), 'same')[::hop] + 1e-12)
env_db = 20 * np.log10(rms)


def realize(sec, choice):
    """Concrete lines [(display, align)...] for one choice index per alternative slot."""
    it = iter(choice)
    return [[w for slot in line for w in (slot[next(it)] if len(slot) > 1 else slot[0])] for line in sec['lines']]


def n_alts(lines):
    return sum(len(slot) > 1 for line in lines for slot in line)


def align(emission, ratio, lines):
    """Force-align lines on an emission window. Returns (path log-likelihood, words with start/end/conf)."""
    words = [w for line in lines for w in line]
    first = {sum(len(l) for l in lines[:i]) for i in range(len(lines))}
    seq, owner = [], []  # target tokens, and the word each belongs to (-1: star / word separator)

    def put(tok, wi):
        seq.append(tok)
        owner.append(wi)

    for wi, (_, parts) in enumerate(words):
        if STAR is not None and wi in first:
            put(STAR, -1)
        if SEP is not None:
            put(SEP, -1)
        for pi, part in enumerate(parts):
            if pi and SEP is not None:
                put(SEP, -1)
            for c in part:
                put(DICT[c], wi)
    put(STAR if STAR is not None else SEP, -1)
    ali, scores = AF.forced_align(emission[None], torch.tensor([seq], dtype=torch.int32), blank=0)
    spans = AF.merge_tokens(ali[0], scores[0].exp())  # one span per target token, in order
    out = []
    for wi, (disp, _) in enumerate(words):
        sp = [s for s, o in zip(spans, owner) if o == wi]
        out.append({'w': disp, 'start': sp[0].start * ratio, 'end': sp[-1].end * ratio,
                    'conf': float(np.mean([t.score for t in sp]))})
    return float(scores.sum()), out


def emit(t0, t1):
    a, b = int(max(t0, 0) * SR), int(min(t1, dur) * SR)
    with torch.inference_mode():
        emission, _ = model(wav[:, a:b])
    emission = torch.log_softmax(emission[0], dim=-1)
    return emission, (b - a) / emission.shape[0] / SR


# ---------------------------------------------------------------- whisper words (line windows, cross-check)
wh = []
for f in sorted(glob.glob('analysis/work/whisper*.json')):
    for s in json.load(open(f)):
        wh += s['words']
wh.sort(key=lambda w: w['start'])
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())


def whisper_start(words, t0, t1):
    """Whisper's start for a line: its first matching word within [t0, t1], less ~0.4 s per word before it."""
    for i, (d, _) in enumerate(words):
        c = [v for v in wh if norm(v['w']) == norm(d) and t0 <= v['start'] <= t1]
        if c:
            return c[0]['start'] - 0.4 * i
    return None


INS_BONUS = 1.0  # nats per character: a CTC path score alone favours dropping weakly-heard words (blank absorbs them)


def best_alternatives(emission, ratio, sec):
    """Coordinate ascent over the alternative slots on the CTC path log-likelihood (same frames, so
    comparable) plus a per-character insertion bonus."""
    k = n_alts(sec['lines'])
    if not k:
        return realize(sec, [])

    def score(c):
        lines = realize(sec, c)
        sc, _ = align(emission, ratio, lines)
        return sc + INS_BONUS * sum(len(''.join(a)) for l in lines for _, a in l), lines

    alts = [len(slot) for line in sec['lines'] for slot in line if len(slot) > 1]
    choice = [0] * k
    best, _ = score(choice)
    for i in range(k):
        for j in range(alts[i]):
            c = choice[:i] + [j] + choice[i + 1:]
            sc, lines = score(c)
            report.append(f'  {sec["name"]}: {" ".join(d for d, _ in lines[0])!r}: {sc:.1f}')
            if sc > best + 1e-6:
                best, choice = sc, c
    return realize(sec, choice)


result, report = [], []
for sec in sections:
    # pass 1: rough line starts
    emission, ratio = emit(sec['t0'], sec['t1'])
    first = [realize({'lines': [l]}, [0] * n_alts([l]))[0] for l in sec['lines']]
    _, w1 = align(emission, ratio, first)
    k, lo = 0, []
    for lw, hint in zip(first, sec['hints']):
        c = w1[k]['start'] + sec['t0']
        w = whisper_start(lw, max(sec['t0'], c - 2.0), c + 1.0)
        lo.append(hint if hint is not None else max(sec['t0'], min(c, w if w is not None else c) - 0.4))
        k += len(lw)
    # pass 2: each line in [its start, the next line's start + 0.8 s (+ 0.1 s after a checked manual start)]
    for i, line in enumerate(sec['lines']):
        t0 = lo[i]
        t1 = (lo[i + 1] + (0.1 if sec['hints'][i + 1] is not None else 0.8)) if i + 1 < len(lo) else sec['t1']
        emission, ratio = emit(t0, t1)
        lw = best_alternatives(emission, ratio, {'name': sec['name'], 'lines': [line]})[0]
        _, words = align(emission, ratio, [lw])
        for w in words:
            w['start'] += t0
            w['end'] += t0
        result.append({'text': ' '.join(w['w'] for w in words), 'section': sec['name'], 'words': words})

# ---------------------------------------------------------------- ends
# extend along the vocal envelope (within 18 dB of the line's loud part, and above -45 dBFS), at most
# 1.5 s past the CTC end, never into the next word; then clip any overlap left by the line windows
allw = [w for l in result for w in l['words']]
for l in result:
    lw = l['words']
    f0, f1 = int(lw[0]['start'] * 100), int(lw[-1]['end'] * 100) + 1
    thr = max(np.percentile(env_db[f0:f1], 90) - 18, -45)
    for w in lw:
        gi = allw.index(w)
        nxt = allw[gi + 1]['start'] - 0.02 if gi + 1 < len(allw) else dur
        e = int(w['end'] * 100)
        while e / 100 < min(nxt, w['end'] + 1.5) and e < len(env_db) and env_db[e] > thr:
            e += 1
        w['end'] = max(w['end'], min(e / 100, nxt))
for a, b in zip(allw, allw[1:]):
    if b['start'] < a['start'] + 0.04:
        report.append(f'  ORDER: {a["w"]} @ {a["start"]:.2f} / {b["w"]} @ {b["start"]:.2f}')
    a['end'] = min(a['end'], b['start'] - 0.02)
for l in result:
    l['start'], l['end'] = l['words'][0]['start'], l['words'][-1]['end']

# ---------------------------------------------------------------- whisper cross-check
dev = []  # same token within 1.5 s
for w in allw:
    cands = [v for v in wh if norm(v['w']) == norm(w['w']) and abs(v['start'] - w['start']) < 1.5]
    if cands:
        v = min(cands, key=lambda v: abs(v['start'] - w['start']))
        dev.append((w['start'] - v['start'], w))
d = np.array([x for x, _ in dev])

# ---------------------------------------------------------------- write
r3 = lambda t: round(float(t), 3)
lines_out = [{'text': l['text'], 'start': r3(l['start']), 'end': r3(l['end']),
              'words': [{'w': w['w'], 'start': r3(w['start']), 'end': r3(w['end']), 'conf': round(w['conf'], 3)}
                        for w in l['words']]} for l in result]
json.dump({'lines': lines_out,
           'notes': 'Word timings for audio/full/track.wav (seconds from file start). Vocals separated with Demucs '
                    'htdemucs_ft; lyrics as actually sung (analysis/sung_lyrics.txt, reconciled from Whisper '
                    'large-v3 against docs/SONG.md) force-aligned by CTC (torchaudio forced_align, '
                    f'{"MMS_FA" if MODEL == "mms" else "wav2vec2 LV-60k 960h"}, 20 ms frames), per line, with '
                    'line windows from a whole-section pass and Whisper plus 3 manual line starts checked on '
                    'the spectrogram. Word start = first frame of its first character; word end extended '
                    'along the vocal-stem envelope, never past the next word. conf = mean CTC posterior of '
                    'the word\'s characters (sung vowels score low; < 0.1 is worth a look). Wordless vocals '
                    '(intro 5.5-16.5 s, pad before chorus 2, 147-164 s) are not lines. '
                    'Regenerate: analysis/align_lyrics.py.'},
          open('data/full/lyrics.json', 'w'), indent=1)

print('\n'.join(report))
for l in result:
    print(f"{l['start']:7.3f}-{l['end']:7.3f} [{l['section']}] {l['text']}")
print(f'\nwhisper cross-check: {len(d)}/{len(allw)} words matched; CTC-whisper start median {np.median(d):+.3f}s, '
      f'p10 {np.percentile(d, 10):+.3f}, p90 {np.percentile(d, 90):+.3f}')
for x, w in sorted(dev, key=lambda t: -abs(t[0]))[:12]:
    print(f'  {x:+.2f}s  {w["w"]} @ {w["start"]:.2f} (conf {w["conf"]:.2f})')
print('lowest confidence:')
for l in lines_out:
    for w in l['words']:
        if w['conf'] < 0.1:
            print(f'  {w["conf"]:.3f}  {w["w"]!r} @ {w["start"]:.2f}  ({l["text"]})')
