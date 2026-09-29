// `vault` (verse 2, lines 1–2) — docs/TREATMENT.md, bone paper and ink lines:
//   "Four secure elements, EAL six plus": four chips land on four beats, each marked SE; on "EAL"
//     a certification stamp `EAL 6+` comes down across them. The key lives in the first one.
//   "Bank-card silicon, so you don't have to trust": a bank card's contact pad appears and hairlines
//     tie its contacts to the chips; in the sung line, "trust" is struck through and `verify` written.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { chip, keyHead2D, lyricLine, paper } from './_motifs';

const ink = (a = 1) => rgba('ink', a);

export default class Vault extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Four secure elements', 'Bank-card silicon'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear();
    paper(c, W, H);
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;

    // chips: a row of four, rising a little when the card arrives
    const up = prog(t, c2 - 0.1, c2 + 0.5, ease.inOutCubic);
    const S = lerp(300, 200, up), gap = lerp(70, 80, up);
    const rowY = lerp(H * 0.4, H * 0.27, up);
    const x0 = W / 2 - (4 * S + 3 * gap) / 2 + S / 2;
    const b0 = Math.round(audio.beatAt(l1.words[0]!.start));
    const centres: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const tl = audio.timeOfBeat(b0 + i);
      const k = prog(t, tl - 0.04, tl + 0.18, ease.outExpo);
      const x = x0 + i * (S + gap), y = rowY - (1 - k) * 90;
      centres.push({ x, y: rowY });
      if (k <= 0) continue;
      c.globalAlpha = clamp(k * 2);
      chip(c, x, y, S, `SE-${i + 1}`, ink(0.95), rgba('bone'));
      c.font = font(F.mono(700), Math.round(S * 0.16));
      c.fillStyle = ink(0.9);
      c.fillText('SE', x - S * 0.1, y + S * 0.06);
      c.globalAlpha = 1;
    }
    // the key lives in SE-1
    if (t >= audio.timeOfBeat(b0) - 0.04) keyHead2D(c, centres[0]!.x + S * 0.3, rowY - S * 0.3, 0.45, 0.8 + 0.2 * f.a.kick);

    // the EAL 6+ stamp
    const eal = wd(l1, 'eal');
    const ks = prog(t, eal.start - 0.03, eal.start + 0.12, ease.outExpo);
    if (ks > 0) {
      const s = lerp(1.6, 1, ks);
      c.save();
      c.translate(W / 2 + S * 0.6, rowY + S * 0.55);
      c.rotate(-0.12);
      c.scale(s, s);
      c.globalAlpha = clamp(ks * 3) * (1 - 0.6 * up);
      c.strokeStyle = ink(0.95);
      c.lineWidth = 5;
      c.strokeRect(-190, -62, 380, 124);
      c.lineWidth = 1.5;
      c.strokeRect(-178, -50, 356, 100);
      c.font = font(F.archivo(100, 900), 84);
      c.fillStyle = ink(0.95);
      const tw = c.measureText('EAL 6+').width;
      c.fillText('EAL 6+', -tw / 2, 30);
      c.restore();
      c.globalAlpha = 1;
    }

    // line 2: the bank card's contact pad, tied to the chips
    if (up > 0) {
      const cw = 360, ch = 227, cx = W / 2, cy = H * 0.66;
      const k = prog(t, c2, c2 + 0.5, ease.outExpo);
      const x = lerp(-cw, cx - cw / 2, k), y = cy - ch / 2;
      c.strokeStyle = ink(0.95);
      c.lineWidth = 1.6;
      c.beginPath(); c.roundRect(x, y, cw, ch, 14); c.stroke();
      // EMV contact pad
      const px = x + 48, py = y + 70, pw = 72, ph = 56;
      c.beginPath(); c.roundRect(px, py, pw, ph, 8); c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + pw / 2, py); c.lineTo(px + pw / 2, py + ph);
      for (const yy of [py + ph / 3, py + (2 * ph) / 3]) { c.moveTo(px, yy); c.lineTo(px + pw * 0.38, yy); c.moveTo(px + pw * 0.62, yy); c.lineTo(px + pw, yy); }
      c.stroke();
      c.font = font(F.mono(400), 18);
      c.fillStyle = ink(0.8);
      c.fillText('bank card · EMV secure element', x + 48, y + ch - 30);
      // hairlines from the pad to each chip, drawn in over the line's words
      const kl = prog(t, wd(l2, 'bank').start + 0.2, wd(l2, 'silicon').end, ease.inOutCubic);
      c.strokeStyle = ink(0.7);
      c.setLineDash([6, 5]);
      centres.forEach((q, i) => {
        const kk = clamp(kl * 4 - i);
        if (kk <= 0) return;
        const ax = px + pw / 2, ay = py, bx = q.x, by = q.y + S / 2 + S * 0.1;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(lerp(ax, bx, kk), lerp(ay, by, kk)); c.stroke();
      });
      c.setLineDash([]);
    }

    // the sung line; in line 2 "trust" is struck through and `verify` is written over it
    const line = t < c2 ? l1 : l2;
    const fam = F.archivo(100, 800), size = 72, lx = 120, ly = H - 90;
    lyricLine(c, line, t, lx, ly, { family: fam, size, on: ink(), off: ink(0.28) });
    if (line === l2) {
      const tr = wd(l2, 'trust');
      const k = prog(t, tr.start + 0.05, tr.start + 0.2, ease.inOutCubic);
      if (k > 0) {
        const lay = layout(l2.text, fam, size);
        const i0 = l2.text.indexOf('trust');
        const g0 = lay.glyphs[i0]!, g1 = lay.glyphs[i0 + 4]!;
        const xa = lx + g0.x - 6, xb = lx + g1.x + g1.w + 6;
        c.strokeStyle = ink();
        c.lineWidth = 7;
        c.beginPath(); c.moveTo(xa, ly - size * 0.3); c.lineTo(lerp(xa, xb, k), ly - size * 0.3); c.stroke();
        const kv = prog(t, tr.start + 0.15, tr.start + 0.35, ease.outExpo);
        c.globalAlpha = kv;
        c.font = font(F.mono(700), 56);
        c.fillStyle = ink();
        c.fillText('verify', xa, ly - size - 18);
        c.globalAlpha = 1;
      }
    }

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.1, vignette: 0.18, halation: 0 };
  }
}
