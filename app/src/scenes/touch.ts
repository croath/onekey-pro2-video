// `touch` (verse 2, lines 7–8) — docs/TREATMENT.md, ink ground, inside the device outline:
//   "Touch to unlock it": a fingerprint drawn as contour lines, ring by ring from the centre, the
//     centre glowing green; `unlocked`.
//   "a PIN if you must": six PIN dots fill, one per word.
//   "Too many wrong guesses": a counter 1/10 … 10/10, one per beat, the frame jolts on each.
//   "it wipes itself to dust": on "wipes" everything inside turns to fine grains and scatters, leaving
//     the empty outline.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { DEVICE, devicePath, keyHead2D, lyricLine } from './_motifs';

const bone = (a = 1) => rgba('bone', a);
const DX = W * 0.36, DY = H * 0.42, DWD = 380;

export default class Touch extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Touch to unlock', 'Too many wrong guesses'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wipes = wd(l2, 'wipes');
    const wipe = prog(t, wipes.start - 0.02, wipes.start + 1.5, ease.outCubic);
    const alive = 1 - prog(t, wipes.start - 0.02, wipes.start + 0.12);

    // the wrong-guess jolt
    let shake: [number, number] = [0, 0];

    const dev = devicePath(DX, DY, DWD);
    c.strokeStyle = bone(0.95);
    c.lineWidth = 2;
    c.stroke(dev);
    c.save();
    c.clip(dev);

    // ---- fingerprint
    const fx = DX, fy = DY - DWD * 0.2;
    const unlock = wd(l1, 'unlock');
    const kf = prog(t, l1.words[0]!.start - 0.1, unlock.end, ease.outCubic);
    const rings = 13;
    c.lineWidth = 2.2;
    for (let k = 0; k < rings; k++) {
      const a = clamp(kf * rings - k);
      if (a <= 0) continue;
      const r = 12 + k * 9.5;
      const gap = 0.5 + 0.3 * hash(k, 2), th0 = Math.PI / 2 + (hash(k, 3) - 0.5) * 0.8;
      c.strokeStyle = k < 2 ? rgba('signal', a * alive) : bone(0.85 * a * alive);
      c.beginPath();
      const n = 90;
      for (let i = 0; i <= n * a; i++) {
        const th = th0 + gap / 2 + (i / n) * (TAU - gap);
        const rr = r * (1 + 0.07 * Math.sin(2 * th + k * 0.4)) * (1 + 0.18 * Math.max(0, Math.sin(th)));
        const x = fx + Math.cos(th) * rr * 0.82, y = fy - Math.sin(th) * rr;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    if (kf >= 1) keyHead2D(c, fx, fy, 0.6, alive);
    const ku = prog(t, unlock.start, unlock.start + 0.25, ease.outExpo);
    if (ku > 0) {
      c.font = font(F.mono(500), 24);
      c.fillStyle = bone(ku * alive);
      c.fillText('unlocked', fx - 52, fy + 175);
    }

    // ---- PIN
    const pinWords = l1.words.slice(l1.words.findIndex((w) => w.w === 'a'));
    const pinY = DY + DWD * 0.52;
    for (let i = 0; i < 6; i++) {
      const w = pinWords[Math.min(pinWords.length - 1, Math.floor((i * pinWords.length) / 6))]!;
      const on = t >= w.start + (i % 2) * 0.12;
      const x = DX + (i - 2.5) * 44;
      c.strokeStyle = bone(0.8 * alive);
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(x, pinY, 11, 0, TAU); c.stroke();
      if (on) { c.fillStyle = bone(alive); c.fill(); }
    }

    // ---- wrong guesses: the PIN row flashes and a counter climbs 1/10..10/10, one per half beat
    const bW = audio.beatAt(l2.words[0]!.start);
    const guesses = t >= l2.words[0]!.start ? Math.min(10, 1 + Math.floor((f.beat - bW) * 2 + 1e-4)) : 0;
    if (guesses > 0 && alive > 0) {
      const tg = audio.timeOfBeat(bW + (guesses - 1) / 2);
      const j = Math.pow(0.5, (t - tg) / 0.05);
      shake = [Math.sin(guesses * 12.9) * 9 * j, Math.cos(guesses * 7.3) * 5 * j];
      c.strokeStyle = rgba('bone', 0.9 * j);
      c.lineWidth = 3;
      c.beginPath(); c.roundRect(DX - 150, pinY - 26, 300, 52, 26); c.stroke();
    }

    // ---- dust: grains scatter from where the drawing was, inside the outline only
    if (wipe > 0 && wipe < 1) {
      const n = 900;
      for (let i = 0; i < n; i++) {
        const ang = hash(i, 1) * TAU, r0 = Math.sqrt(hash(i, 2)) * 150;
        const bx = i % 3 === 0 ? DX + (hash(i, 5) - 0.5) * 280 : fx + Math.cos(ang) * r0 * 0.82;
        const by = i % 3 === 0 ? pinY + (hash(i, 6) - 0.5) * 30 : fy - Math.sin(ang) * r0;
        const v = 80 + 260 * hash(i, 3), va = hash(i, 4) * TAU;
        const x = bx + Math.cos(va) * v * wipe, y = by + Math.sin(va) * v * wipe - 120 * wipe * wipe;
        c.fillStyle = bone(0.9 * Math.sqrt(1 - wipe) * (0.4 + 0.6 * hash(i, 7)));
        c.fillRect(x, y, 3, 3);
      }
    }
    c.restore();

    // counter, outside the device (it is the attacker's count)
    if (guesses > 0) {
      c.font = font(F.archivo(100, 900), 200);
      c.fillStyle = guesses >= 10 ? rgba('bone') : bone(0.85);
      c.fillText(`${guesses}/10`, W * 0.56, H * 0.48);
      c.font = font(F.mono(500), 26);
      c.fillStyle = bone(0.6);
      c.fillText(guesses >= 10 ? 'wrong PIN · wiping' : 'wrong PIN', W * 0.56 + 6, H * 0.48 + 60);
    }
    if (wipe >= 1) {
      c.font = font(F.mono(500), 24);
      c.fillStyle = bone(0.6 * prog(t, wipes.start + 1.5, wipes.start + 1.8));
      c.fillText('empty', DX - 36, DY + 8);
    }
    void DEVICE; void lerp;

    const line = t < c2 ? l1 : l2;
    lyricLine(c, line, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: bone(), off: bone(0.3) });
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.35, vignette: 0.35, shake };
  }
}
