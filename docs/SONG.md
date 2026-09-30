# Song — "Keep Your Keys at Home"

The soundtrack is a song generated with Suno from the lyrics and style prompt below. The video is cut to it the way pdoom-video was: once the track exists, its beats and word timings are analysed into `data/audio.json` and `data/lyrics.json`, and every plate is anchored to those.

## Target

- **Length:** about 2:00 (64 bars at 120 BPM = 2:08; trim the outro if needed).
- **Tempo:** 120 BPM, 4/4, steady (no tempo changes, no half-time chorus). A constant grid makes the beat analysis exact and the edit simple.
- **Language:** English (global launch). A Chinese version can be written from the same structure.

## Suno: style prompt

Paste into **Style of Music**:

```
minimal electronic pop, 120 BPM, 4/4, confident and cool, crisp punchy kick, tight snare on 2 and 4, glassy plucked synths, deep clean sub bass, airy female lead vocal, close-mic, clear diction, sleek modern product launch, precise, polished, bright chorus with stacked harmonies, short tight outro
```

**Exclude styles** (if your Suno version has the field):

```
rock, orchestral, dubstep, lo-fi, trap hi-hat rolls, heavy distortion, tempo change, long fade out
```

**Title:** Keep Your Keys at Home

## Suno: lyrics

Paste into **Lyrics** exactly (the bracketed tags steer the structure):

```
[Intro]
[4 bars instrumental, a single synth pulse, a soft click like a latch]

[Verse 1]
Glass on the front and glass on the back
A ribbon of metal, graphite and black
Thin as a card, it slips out of sight
One little key mark catching the light
Quiet by design, no edges to show
Everything that matters stays down below

[Pre-Chorus]
Scan it, sign it, send it
Not a single wire
Read it before you mean it
Every word in plain type

[Chorus]
Keep your keys at home
Only the signatures go
Twenty-four words the internet will never know
One key (OneKey), all yours
Hold it, sign it, go

[Verse 2]
Four secure elements, EAL six plus
Bank-card silicon, so you don't have to trust
A camera on the back that only reads light
QR in, QR out, and nothing online
The contract says "approve all"? SignGuard says wait
Clear signing in words, not hex on a plate
Touch to unlock it, a PIN if you must
Too many wrong guesses, it wipes itself to dust

[Bridge]
It's not just your coins anymore
It's the key to every door
FIDO in your pocket, passkeys, no passwords to type
Tap it once and you're in, no phishing link tonight

[Final Chorus]
Keep your keys at home
Only the signatures go
Twenty-four words the internet will never know
Open source, read every line
One key (OneKey), all yours
Hold it, sign it, go

[Outro]
[2 bars instrumental]
OneKey Pro 2
[end on a clean hit, no fade]
```

## Planned structure (at 120 BPM; see the edit above for the real times)

| section | bars | time | plates (see TREATMENT.md) |
|---|---|---|---|
| Intro | 4 | 0:00–0:08 | `boot` |
| Verse 1 | 12 | 0:08–0:32 | `slab`, `below` |
| Pre-Chorus | 4 | 0:32–0:40 | `airgap` |
| Chorus | 8 | 0:40–0:56 | `hook` (n=1) |
| Verse 2 | 16 | 0:56–1:28 | `vault`, `lens`, `guard`, `touch` |
| Bridge | 8 | 1:28–1:44 | `passkey` |
| Final Chorus | 8 | 1:44–2:00 | `hook` (n=2) |
| Outro | 4 | 2:00–2:08 | `end` |

Suno won't hit these bars exactly; the edit follows the real track once it is analysed.

## The take we use, and the edit

Suno's take runs 3:01 at a tempo that drifts from about 123 to 128 BPM (median 126.5). Every lyric line is sung once, in order; "The contract says" is sung as "Contract says". The extra length is wordless: vocal chops in the intro, a "Hold it, sign it, go" echo after chorus 1, an "ooh" lift before chorus 2, and an 18 s break before the outro.

- Full take: `audio/full/track.wav`, analysis in `data/full/` (word timings from `analysis/align_lyrics.py`, run on Croath's Mac because the cloud container cannot download the speech models).
- Edit: `analysis/cut_track.py` keeps five downbeat-aligned regions and writes `audio/track.wav`, `data/lyrics.json`, `data/audio.json` (**2:36.5**). Removed: the intro's vocal chops before 10.4 s (the soft opening build is kept, so the song doesn't start cold), the echo, most of the lift, and the middle of the break. Chorus 2's held "go" / "oh" runs 2 more bars with the lead vocal faded out over the second one (mix minus the Demucs vocal stem, excerpt in `audio/full/`), so the splice into the breakdown doesn't chop the melody. The ending runs to the end of the take and rings out on the last hit.

| section | edit time | source time |
|---|---|---|
| intro | 0:00.0–0:12.7 | 0.0–4.6 (soft build) + 10.4–18.6 |
| verse 1 | 0:12.7–0:44.6 | 18.6–50.4 |
| pre-chorus | 0:44.6–0:52.8 | 50.4–58.6 |
| chorus 1 | 0:52.8–1:10.0 | 58.6–75.9 |
| (pickup) | 1:10.0–1:11.4 | 79.7–81.0 |
| verse 2 | 1:11.4–1:41.5 | 81.0–111.1 |
| bridge | 1:41.5–1:55.5 | 111.1–125.1 |
| (lift) | 1:55.5–1:57.3 | 128.9–130.7 |
| chorus 2 | 1:57.3–2:14.3 | 130.7–147.7 |
| (break) | 2:14.3–2:21.5 | 147.7–151.5 (vocal fades) + 162.7–166.2 |
| outro | 2:21.5–2:36.5 | 166.2–181.2, rings out |

## Generating it

1. Generate several takes (at least 4) and pick on: the tempo feels steady, every word is intelligible, the chorus hook "Keep your keys at home" lands hard, and nothing is sung that isn't in the lyrics.
2. If the take runs long, crop or fade in Suno (or send the full take and the edit will trim it).
3. Download the **WAV** (not MP3 if you can), plus stems if your plan offers them (vocals separately make the word alignment better).
4. Put it in the project or send it in the thread. Next step: `audio/track.wav` ← the song, then run the analysis (Demucs stems, forced alignment, beat grid) to regenerate `data/*.json`.

## Claims check

Every product claim in the lyrics comes from the OneKey Pro (gen 1) product page or from Croath's brief for Pro 2 (design, FIDO, passkeys). Confirm each still holds for Pro 2 before release: four EAL 6+ secure elements, the rear camera for QR air-gap signing, SignGuard, clear signing, fingerprint unlock, wipe after too many wrong PINs, open source.
