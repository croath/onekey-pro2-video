// `guard` (verse 2, lines 5–6) — docs/TREATMENT.md, ink ground:
//   "Contract says "approve all"?": a wall of calldata hex scrolls fast, unreadable.
//   "SignGuard says wait": the scroll stops dead on the beat; an inverted bone label slams down,
//     `WAIT`, with `unlimited approval · unknown contract`.
//   "Clear signing in words, not hex on a plate": the hex decodes, chunk by chunk, into one plain line
//     (`Approve UNLIMITED USDT to 0x9f…e21c`); the sung words go green; the hex is pushed off frame
//     like a metal nameplate.
// Everything shown is made up (no real contract or address).
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { lyricLine } from './_motifs';

const bone = (a = 1) => rgba('bone', a);
const HEXD = '0123456789abcdef';
/** One row of fake calldata: approve(spender, uint256.max) style. */
function hexRow(i: number): string {
  if (i % 7 === 0) return '0x095ea7b3' + '000000000000000000000000' + '9f3c1d0e7b2a44c1e21c';
  if (i % 7 === 1) return 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  let s = '';
  for (let k = 0; k < 64; k++) s += HEXD[Math.floor(hash(i, k, 9) * 16)];
  return s;
}
const PLAIN = ['Approve', 'UNLIMITED', 'USDT', 'to', '0x9f…e21c'];

export default class Guard extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Contract says', 'Clear signing in words'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const wait = wd(l1, 'wait'), sg = wd(l1, 'signguard');
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    // the stop lands on the beat at/before "wait"
    const stopT = audio.timeOfBeat(Math.round(audio.beatAt(sg.start)));

    // ---- the hex wall: scroll speed high until the stop, then frozen
    const lh = 44, size = 30;
    const tt = Math.min(t, stopT);
    const scroll = (tt - this.ctx.start) * 900;
    const decode = t >= c2 ? prog(t, c2, wd(l2, 'words').end, ease.inOutCubic) : 0;
    const push = prog(t, wd(l2, 'not').start, wd(l2, 'plate').end, ease.inCubic); // the plate slides away
    c.save();
    c.beginPath(); c.rect(0, 0, W, H - 230); c.clip(); // keep the sung line clear
    c.translate(-push * W * 1.1, 0);
    c.font = font(F.mono(400), size);
    const first = Math.floor(scroll / lh);
    for (let r = -1; r < H / lh + 2; r++) {
      const i = first + r;
      const y = r * lh - (scroll % lh) + 40;
      const row = hexRow(i);
      const hot = i % 7 === 0 || i % 7 === 1;
      c.fillStyle = hot && t >= stopT ? bone(0.85 * (1 - decode)) : bone((0.22 + 0.1 * hash(i, 3)) * (1 - decode * 0.7));
      c.fillText(row, 100, y);
    }
    c.restore();

    // motion blur feel before the stop: a few bright streak bars
    if (t < stopT) {
      for (let k = 0; k < 4; k++) {
        const y = ((hash(k, Math.floor(t * 20)) * H) | 0);
        c.fillStyle = bone(0.05);
        c.fillRect(0, y, W, 2);
      }
    }

    // ---- WAIT
    const kw = prog(t, stopT - 0.02, stopT + 0.12, ease.outExpo);
    const kwOut = prog(t, c2 - 0.02, c2 + 0.05);
    if (kw > 0 && kwOut < 1) {
      const s = lerp(1.5, 1, kw);
      c.save();
      c.globalAlpha = clamp(kw * 3) * (1 - kwOut);
      c.translate(W / 2, H * 0.42);
      c.scale(s, s);
      c.fillStyle = bone();
      c.fillRect(-340, -150, 680, 300);
      c.font = font(F.archivo(112, 900), 230);
      c.fillStyle = rgba('ink');
      const tw = c.measureText('WAIT').width;
      c.fillText('WAIT', -tw / 2, 82);
      c.restore();
      c.globalAlpha = clamp(kw * 3) * (1 - kwOut);
      c.font = font(F.mono(500), 26);
      c.fillStyle = bone();
      c.fillText('SignGuard · unlimited approval · unknown contract', W / 2 - 340, H * 0.42 + 200);
      c.globalAlpha = 1;
    }

    // ---- line 2: the plain sentence decodes; sung words go green
    if (t >= c2) {
      const fam = F.archivo(100, 800), sz = 96;
      c.font = font(fam, sz);
      const widths = PLAIN.map((w) => c.measureText(w + ' ').width);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = (W - total) / 2;
      const y = H * 0.44;
      PLAIN.forEach((w, i) => {
        const k = clamp(decode * (PLAIN.length + 1) - i);
        // scrambled hex resolving into letters
        let s = '';
        for (let j = 0; j < w.length; j++) s += j / w.length < k ? w[j] : HEXD[Math.floor(hash(i, j, Math.floor(t * 24)) * 16)];
        const hl = i === 1 ? rgba('signal') : bone();
        c.fillStyle = k >= 1 ? hl : bone(0.5);
        c.fillText(s, x, y);
        x += widths[i]!;
      });
      c.font = font(F.mono(400), 24);
      c.fillStyle = bone(0.7 * decode);
      c.fillText('clear signing · what you sign is what you read', (W - total) / 2, y + 70);
    }

    const line = t < c2 ? l1 : l2;
    lyricLine(c, line, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: line === l2 ? rgba('signal') : bone(), off: bone(0.3) });

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.3, vignette: 0.35, flash: 0.06 * Math.pow(0.5, Math.max(0, t - stopT) / 0.03) * (t >= stopT ? 1 : 0) };
  }
}
