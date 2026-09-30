// The edit: which scene plays when. Anchor boundaries to caption lines and snap them to the
// beat grid (data/lyrics.json, data/audio.json) instead of hard-coding seconds.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before the first word of the matching line. */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };

  /** Cut on the beat at/before word `wi` of the matching line (for lines that open on a pickup). */
  const cutWord = (q: string, wi: number, nth = 0) => {
    const s = ly.get(q, nth).words[wi]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + 0.02)));
  };

  /** Start of the instrumental break after chorus 2 (a downbeat). */
  const brk = au.sections.find((s) => s.name === 'break')?.start ?? cut('OneKey Pro 2');

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  return [
    E('boot', 'boot', 0, cut('Glass on the front')),
    E('slab', 'slab', cut('Glass on the front'), cut('Quiet by design')),
    E('below', 'below', cut('Quiet by design'), cut('Scan it')),
    E('airgap', 'airgap', cut('Scan it'), cut('Keep your keys at home')),
    E('hook1', 'hook', cut('Keep your keys at home'), cut('Four secure elements'), { params: { n: 1 } }),
    E('vault', 'vault', cut('Four secure elements'), cutWord('A camera on the back', 1)), // "A" is a pickup: let "trust" land first
    E('lens', 'lens', cutWord('A camera on the back', 1), cut('Contract says')),
    E('guard', 'guard', cut('Contract says'), cut('Touch to unlock')),
    E('touch', 'touch', cut('Touch to unlock'), cut("It's not just your coins")),
    E('passkey', 'passkey', cut("It's not just your coins"), cut('Keep your keys at home', 1)),
    // the real device takes over from the break after chorus 2 to the end
    E('hook2', 'hook', cut('Keep your keys at home', 1), brk, { params: { n: 2 } }),
    E('end', 'end', brk, au.duration),
  ];
}
