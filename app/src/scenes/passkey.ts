// `passkey` (bridge + lift) — docs/TREATMENT.md, ink ground, hairlines:
//   "It's not just your coins anymore": the empty outline (after `touch`) relights its key; coin
//     glyphs drift out of the outline and fade.
//   "It's the key to every door": a corridor of sign-in doors (each a `Sign in` panel with two fields);
//     the camera pushes through, a door swinging open on each downbeat.
//   "FIDO in your pocket, passkeys, no passwords to type": in the nearest door's password field the
//     dots drop out one by one and a key takes their place, `FIDO2 · passkey`.
//   "Tap it once and you're in, no phishing link tonight": the device (bottom right) springs on "Tap";
//     the last door opens on "in"; a hook on a hairline drops towards the device and bounces off its
//     boundary, the line going slack and falling away. The lift holds the key, bright, for chorus 2.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, springStep, TAU } from '../engine/util';
import { DEVICE, devicePath, keyHead2D, keyMarkPath, lyricLine } from './_motifs';

const bone = (a = 1) => rgba('bone', a);
const CX = W / 2, CY = H * 0.43;

export default class Passkey extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ["It's not just your coins", "It's the key to every door", 'FIDO in your pocket', 'Tap it once'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const cutAt = (l: Line) => audio.timeOfBeat(Math.floor(audio.beatAt(l.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const c2 = cutAt(l2);
    const inW = l4.words.find((w) => w.w.startsWith('in,'))!; // "you're in"

    // door open times: each downbeat from line 2 on, and the last one on "in"
    const opens = audio.downbeats.filter((d) => d > l2.words[0]!.start - 0.1 && d < inW.start - 0.3);
    opens.push(inW.start);

    if (t < c2) {
      // ---- the empty outline relights; coins leave
      const DW = 380;
      c.strokeStyle = bone(0.95);
      c.lineWidth = 2;
      c.stroke(devicePath(CX, CY, DW));
      const kk = prog(t, l1.words[0]!.start, l1.words[0]!.start + 0.6, ease.outCubic);
      keyHead2D(c, CX, CY, lerp(0.2, 0.9, kk), kk * (0.8 + 0.2 * f.a.kick));
      const coins = wd(l1, 'coins');
      const glyphs = ['BTC', 'ETH', 'SOL', 'BTC', 'ETH', 'USDT']; // tickers as type, no logos
      glyphs.forEach((g, i) => {
        const t0 = coins.start + i * 0.18 - 0.4;
        const k = prog(t, t0, t0 + 2.2, ease.outCubic);
        if (k <= 0) return;
        const a = (i / glyphs.length) * TAU + 0.4;
        const r = lerp(40, 520, k);
        c.font = font(F.mono(500), 44);
        c.fillStyle = bone(0.85 * Math.min(1, k * 4) * (1 - k));
        c.fillText(g, CX + Math.cos(a) * r * 1.3 - 20, CY + Math.sin(a) * r * 0.8 + 22);
      });
      lyricLine(c, l1, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: bone(), off: bone(0.3) });
    } else if (t < inW.start + 0.6) {
      // ---- the corridor
      // camera depth: door i at z = i + 1 reaches s = 1 when it opens
      const T = opens, n = T.length;
      let d: number;
      if (t <= T[0]!) d = lerp(-1.2, 0, prog(t, c2, T[0]!, ease.outCubic));
      else if (t >= T[n - 1]!) d = n - 1 + prog(t, T[n - 1]!, T[n - 1]! + 0.6, ease.inCubic) * 1.2;
      else {
        let i = 0;
        while (i < n - 2 && t >= T[i + 1]!) i++;
        d = i + prog(t, T[i]!, T[i + 1]!, ease.inOutCubic);
      }
      const DWp = 560, DHp = 720;
      for (let i = n + 2; i >= 0; i--) {
        const z = i + 1 - d;
        if (z <= 0.35) continue;
        const s = 1 / z;
        const w = DWp * s, h = DHp * s;
        const x0 = CX - w / 2, y0 = CY - h / 2;
        const a = clamp((z - 0.35) / 0.4) * clamp(s * 2.5);
        const openK = i < n ? prog(t, T[i]! - 0.05, T[i]! + 0.35, ease.outCubic) : 0;
        // the door frame
        c.strokeStyle = bone(0.35 * a);
        c.lineWidth = 1;
        c.strokeRect(x0, y0, w, h);
        // the door panel, swinging open about its left edge
        const sw = Math.cos(openK * Math.PI * 0.46);
        const pw = w * sw;
        c.save();
        c.globalAlpha = a;
        c.strokeStyle = bone(0.9);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x0, y0); c.lineTo(x0 + pw, y0 + h * 0.06 * (1 - sw)); c.lineTo(x0 + pw, y0 + h - h * 0.06 * (1 - sw)); c.lineTo(x0, y0 + h); c.closePath();
        c.fillStyle = rgba('ink');
        c.fill();
        c.stroke();
        if (sw > 0.25) {
          // the sign-in panel on the door
          c.transform(sw, 0, 0, 1, x0 * (1 - sw), 0);
          c.font = font(F.archivo(100, 700), Math.max(6, 44 * s));
          c.fillStyle = bone(0.95);
          c.fillText('Sign in', x0 + 50 * s, y0 + 110 * s);
          c.lineWidth = Math.max(0.6, 1.4 * s);
          for (let k = 0; k < 2; k++) {
            c.strokeStyle = bone(0.7);
            c.beginPath(); c.roundRect(x0 + 50 * s, y0 + (190 + k * 130) * s, w - 100 * s, 76 * s, 10 * s); c.stroke();
            c.font = font(F.mono(400), Math.max(5, 20 * s));
            c.fillStyle = bone(0.6);
            c.fillText(k === 0 ? 'email' : 'password', x0 + 50 * s, y0 + (176 + k * 130) * s);
          }
          // the password field: dots, or (after "passkeys") dropping out for a key
          const pk = wd(l3, 'passkeys'), ty = wd(l3, 'type');
          const drop = prog(t, pk.start, ty.end, ease.linear);
          const fy = y0 + (320 + 38) * s;
          for (let j = 0; j < 8; j++) {
            const tj = j / 8;
            const kd = clamp((drop - tj) * 8);
            const x = x0 + (84 + j * 34) * s;
            const y = fy + 400 * s * kd * kd;
            c.fillStyle = bone(0.9 * (1 - kd));
            c.beginPath(); c.arc(x, y, 7 * s, 0, TAU); c.fill();
          }
          const kk = prog(t, ty.start, ty.start + 0.3, ease.outExpo);
          if (kk > 0 && s > 0.5) {
            c.save();
            c.globalAlpha = a * kk;
            c.fillStyle = rgba('signal');
            c.fill(keyMarkPath(x0 + 110 * s, fy, 56 * s), 'evenodd');
            c.font = font(F.mono(500), Math.max(6, 22 * s));
            c.fillStyle = bone();
            c.fillText('FIDO2 · passkey', x0 + 160 * s, fy + 8 * s);
            c.restore();
          }
          // the button
          c.fillStyle = bone(0.9);
          c.beginPath(); c.roundRect(x0 + 50 * s, y0 + 470 * s, w - 100 * s, 70 * s, 35 * s); c.fill();
          c.font = font(F.archivo(100, 700), Math.max(6, 26 * s));
          c.fillStyle = rgba('ink');
          c.fillText('Continue', x0 + w / 2 - 55 * s, y0 + 514 * s);
        }
        c.restore();
      }
      const line = t < cutAt(l3) ? l2 : t < cutAt(l4) ? l3 : l4;
      lyricLine(c, line, t, 120, H - 90, { family: F.archivo(100, 800), size: 64, on: bone(), off: bone(0.3) });
    } else {
      // ---- the hook, and the lift
      const DW = 300, dy = CY + 60;
      c.strokeStyle = bone(0.95);
      c.lineWidth = 2;
      c.stroke(devicePath(CX, dy, DW));
      const lift = prog(t, l4.words[l4.words.length - 1]!.end, this.ctx.end, ease.inCubic);
      keyHead2D(c, CX, dy, 0.9 + 1.4 * lift, 0.85 + 0.15 * f.a.kick + lift);
      const ph = wd(l4, 'phishing'), link = wd(l4, 'link');
      const top = dy - (DW * DEVICE.h) / 2;
      const kDown = prog(t, ph.start - 0.2, link.start, ease.inCubic);
      const bounce = t > link.start ? Math.abs(springStep(t - link.start, 3, 0.45) - 1) : 0;
      const slack = prog(t, link.end, link.end + 0.9, ease.inCubic);
      const hy = lerp(-120, top - 10, kDown) - bounce * 160 + slack * 900;
      const hx = CX + 30;
      c.strokeStyle = bone(0.9 * (1 - slack));
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(hx, -20);
      // the line goes slack after the bounce
      c.bezierCurveTo(hx + slack * 200, hy * 0.3, hx - slack * 160, hy * 0.7, hx, hy - 60);
      c.stroke();
      // the hook
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(hx, hy - 60); c.lineTo(hx, hy);
      c.arc(hx - 22, hy, 22, 0, Math.PI * 0.95);
      c.stroke();
      c.beginPath(); c.moveTo(hx - 44, hy); c.lineTo(hx - 36, hy - 12); c.stroke();
      if (t > link.start && t < link.start + 0.25) {
        c.strokeStyle = bone(0.9 * (1 - (t - link.start) / 0.25));
        c.lineWidth = 3;
        c.stroke(devicePath(CX, dy, DW));
      }
      lyricLine(c, l4, t, 120, H - 90, { family: F.archivo(100, 800), size: 64, on: bone(), off: bone(0.3) });
    }

    // the device in the corner during the corridor: springs on "Tap"
    if (t >= c2 && t < inW.start + 0.6) {
      const tap = wd(l4, 'tap');
      const sp = t > tap.start ? springStep(t - tap.start, 4, 0.3) : 0;
      const sc = 1 - 0.12 * Math.sin(Math.min(1, t > tap.start ? (t - tap.start) / 0.12 : 0) * Math.PI) + (sp - 1) * 0.02 * (t > tap.start ? 1 : 0);
      const x = W - 200, y = H - 360;
      c.save();
      c.translate(x, y); c.scale(sc, sc); c.translate(-x, -y);
      c.fillStyle = rgba('ink');
      c.fill(devicePath(x, y, 140));
      c.strokeStyle = bone(0.95);
      c.lineWidth = 1.6;
      c.stroke(devicePath(x, y, 140));
      keyHead2D(c, x, y, 0.4, 0.9);
      c.restore();
    }
    void hash;

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.4, vignette: 0.4 };
  }
}
