# OneKey Pro 2 — intro video

A code-rendered product video for OneKey Pro 2. The renderer is adapted from [croath/pdoom-video](https://github.com/croath/pdoom-video) (MIT): every frame is a deterministic function of time, so the live preview and the 1080p60 / 4K60 export are identical.

Status: soundtrack and timings done; plates to build. The concept and plates are in [`docs/TREATMENT.md`](docs/TREATMENT.md); only the starter `title` scene exists so far.

## Layout

- `audio/track.wav` — the soundtrack as edited (2:38.3); `audio/full/track.wav` — the full Suno take (3:01). See [`docs/SONG.md`](docs/SONG.md).
- `data/lyrics.json`, `data/audio.json` — word-level lyric timings and the music analysis (beats, downbeats, sections, onsets, envelopes) for the edit; `data/full/` — the same for the full take.
- `analysis/` — `analyze_audio.py` (librosa), `transcribe_vocals.py` + `align_lyrics.py` (Demucs, Whisper, CTC alignment; need the models, see their headers), `cut_track.py` (makes the edit).
- `app/src/engine/` — renderer core (post, typography, GPU lines, timing). See [`docs/ENGINE.md`](docs/ENGINE.md).
- `app/src/scenes/` — one module per plate. `app/src/timeline.ts` — the edit.
- `app/scripts/render.ts` — offline renderer (headless Chrome → ffmpeg).
- `out/` — renders (not committed).

## Preview

```sh
cd app
bun install
bunx vite
```

Open http://localhost:5173 (space play/pause, ←/→ seek, `[`/`]` previous/next scene, `h` hide UI). `?t=10` starts at 10 s.

## Render

```sh
cd app
bun scripts/render.ts stills --t 2.8,9.5 --out ../out/wip/title    # check frames
bun scripts/render.ts video --samples auto --shutter 0.2 --out ../out/onekey-pro2.mp4
```

Needs bun, Google Chrome (or `CHROME_PATH=/path/to/chromium`) and ffmpeg with libx264.

## License

Code: MIT (see [LICENSE](LICENSE)). Fonts in `app/public/fonts/` keep their own licenses (SIL OFL; Hershey/EMS stroke fonts OFL / public domain).
