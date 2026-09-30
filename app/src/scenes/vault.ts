// `vault` (verse 2, lines 1–2) — docs/TREATMENT.md, the real main board on ink:
//   "Four secure elements, EAL six plus": a low macro glides along the board's four secure elements;
//     each lights green on its beat and the sung word is laser-etched on its lid ("Four", "secure",
//     "elements"); on "EAL" the fourth reads `EAL 6+` and a certification stamp comes down.
//   "Bank-card silicon, so you don't have to trust": the camera rises to see all four from above; a
//     bank card's outline slides in beneath with its EMV contact pad, hairlines tie the pad to the
//     chips; in the sung line "trust" is struck through and `verify` written over it.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { lyricLine } from './_motifs';
import { Device3D, SE_HALF, SE_POS, mapQuad, orbit, type DevicePose, type V3 } from './_device3d';

const bone = (a = 1) => rgba('bone', a);
const EXP = 0.001; // "exploded" so only the board is drawn, but in place
const TOP = 0.006 + 0.28 * EXP + 0.025; // the chips' lids (device z)
const se = (i: number, dx = 0, dy = 0): V3 => [SE_POS[i]![0] + dx, SE_POS[i]![1] + 0.02 + dy, TOP];

export default class Vault extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Four secure elements', 'Bank-card silicon'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const eal = wd(l1, 'eal');
    // the chips light on the line's words: Four, secure, elements, EAL
    const lightT = [l1.words[0]!.start, wd(l1, 'secure').start, wd(l1, 'elements').start, eal.start];
    const lit = lightT.map((x) => prog(t, x - 0.04, x + 0.12, ease.outCubic));

    // ---- camera: a low macro gliding along the row, then up and back to see all four
    const up = prog(t, c2 - 0.2, c2 + 0.9, ease.inOutCubic);
    const glide = prog(t, this.ctx.start, c2, ease.inOutQuad);
    const rot: V3 = [0, -Math.PI / 2, 0]; // lying flat, display side up
    const p0: DevicePose = { cam: [0, 0, 1], tgt: [0, 0, 0], fov: 0.5, rot };
    const along = this.dev.toWorld(p0, se(0, lerp(0, SE_POS[3]![0] - SE_POS[0]![0], glide)));
    const mid = this.dev.toWorld(p0, [0, SE_POS[0]![1] - 0.02, TOP]);
    const tgt: V3 = [lerp(along[0], mid[0], up), lerp(along[1], mid[1], up), lerp(along[2], mid[2], up) + up * 0.12];
    const cam = orbit(tgt, lerp(0.62, 1.55, up), lerp(0.5 - glide * 0.25, 0, up), lerp(0.42, 1.0, up));
    const pose: DevicePose = {
      cam, tgt, fov: 0.55, rot, explode: EXP, show: [0, 0, 1, 0, 0, 0],
      se: lit.map((k) => k) as [number, number, number, number], sweep: lerp(-1.3, 1.3, glide),
    };

    this.bg.clear(rgba('ink'));
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    const c = this.text.ctx;
    this.text.clear();

    // ---- etched lids: the sung word on each chip, then SE-n
    const etch = ['Four', 'secure', 'elements', 'EAL 6+'];
    for (let i = 0; i < 4; i++) {
      const h = SE_HALF * 0.86;
      c.save();
      mapQuad(c, this.dev, pose, se(i, -h, h), se(i, h, h), se(i, -h, -h));
      c.globalAlpha = 0.35 + 0.65 * lit[i]!;
      c.fillStyle = lit[i]! > 0.5 ? rgba('signal') : bone(0.45);
      c.font = font(F.archivo(100, 800), i === 3 ? 22 : etch[i]!.length > 6 ? 17 : 22);
      c.fillText(lit[i]! > 0 ? etch[i]! : '', 8, 56);
      c.font = font(F.mono(500), 11);
      c.fillText(`SE-${i + 1}`, 8, 90);
      c.restore();
    }

    // ---- the EAL 6+ stamp
    const ks = prog(t, eal.start - 0.03, eal.start + 0.12, ease.outExpo) * (1 - up);
    if (ks > 0) {
      const s = lerp(1.6, 1, ks);
      c.save();
      c.translate(W * 0.74, H * 0.24);
      c.rotate(-0.1);
      c.scale(s, s);
      c.globalAlpha = clamp(ks * 3);
      c.strokeStyle = rgba('signal');
      c.lineWidth = 5;
      c.strokeRect(-190, -62, 380, 124);
      c.lineWidth = 1.5;
      c.strokeRect(-178, -50, 356, 100);
      c.font = font(F.archivo(100, 900), 84);
      c.fillStyle = rgba('signal');
      const tw = c.measureText('EAL 6+').width;
      c.fillText('EAL 6+', -tw / 2, 30);
      c.restore();
    }

    // ---- line 2: the bank card, tied to the chips
    if (up > 0) {
      const cw = 440, ch = 277, cx = W / 2, cy = H * 0.66;
      const k = prog(t, c2 + 0.2, c2 + 0.8, ease.outExpo);
      const x = lerp(-cw, cx - cw / 2, k), y = cy - ch / 2;
      c.strokeStyle = bone(0.95);
      c.lineWidth = 1.6;
      c.fillStyle = rgba('ink', 0.85);
      c.beginPath(); c.roundRect(x, y, cw, ch, 16); c.fill(); c.stroke();
      // EMV contact pad
      const px = x + 52, py = y + 86, pw = 80, ph = 62;
      c.fillStyle = 'rgba(40,44,41,1)';
      c.beginPath(); c.roundRect(px, py, pw, ph, 9); c.fill(); c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + pw / 2, py); c.lineTo(px + pw / 2, py + ph);
      for (const yy of [py + ph / 3, py + (2 * ph) / 3]) { c.moveTo(px, yy); c.lineTo(px + pw * 0.38, yy); c.moveTo(px + pw * 0.62, yy); c.lineTo(px + pw, yy); }
      c.stroke();
      c.font = font(F.mono(400), 18);
      c.fillStyle = bone(0.75);
      c.fillText('bank card', x + 52, y + ch - 56);
      c.fillText('EMV secure element', x + 52, y + ch - 30);
      // hairlines from the pad to each chip
      const kl = prog(t, wd(l2, 'bank').start + 0.3, wd(l2, 'silicon').end, ease.inOutCubic);
      c.strokeStyle = bone(0.6);
      c.setLineDash([6, 5]);
      for (let i = 0; i < 4; i++) {
        const kk = clamp(kl * 4 - i);
        if (kk <= 0) continue;
        const q = this.dev.project(pose, se(i, 0, -SE_HALF));
        const ax = px + pw / 2, ay = py;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(lerp(ax, q.x, kk), lerp(ay, q.y, kk)); c.stroke();
      }
      c.setLineDash([]);
    }

    // ---- the sung line: line 1 lives on the chips; line 2 at the bottom with "trust" struck
    if (t >= c2) {
      const fam = F.archivo(100, 800), size = 72, lx = 120, ly = H - 90;
      lyricLine(c, l2, t, lx, ly, { family: fam, size, on: bone(), off: bone(0.28) });
      const tr = wd(l2, 'trust');
      const k = prog(t, tr.start + 0.05, tr.start + 0.2, ease.inOutCubic);
      if (k > 0) {
        const lay = layout(l2.text, fam, size);
        const i0 = l2.text.indexOf('trust');
        const g0 = lay.glyphs[i0]!, g1 = lay.glyphs[i0 + 4]!;
        const xa = lx + g0.x - 6, xb = lx + g1.x + g1.w + 6;
        c.strokeStyle = bone();
        c.lineWidth = 7;
        c.beginPath(); c.moveTo(xa, ly - size * 0.3); c.lineTo(lerp(xa, xb, k), ly - size * 0.3); c.stroke();
        const kv = prog(t, tr.start + 0.15, tr.start + 0.35, ease.outExpo);
        c.globalAlpha = kv;
        c.font = font(F.mono(700), 56);
        c.fillStyle = rgba('signal');
        c.fillText('verify', xa, ly - size - 18);
        c.globalAlpha = 1;
      }
    } else {
      // a small running caption so the line still reads, dim
      lyricLine(c, l1, t, 120, H - 90, { family: F.archivo(100, 800), size: 44, on: bone(0.8), off: bone(0.2) });
    }

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4 };
  }
}
