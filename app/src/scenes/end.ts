// `end` (break + outro) — docs/TREATMENT.md: the real device, turning in the studio.
//   break (after chorus 2's "go"): a slow turntable, back, edge, front; a light bar crosses on each
//     downbeat.
//   "OneKey Pro 2": it settles three-quarter front and slides left; the screen wakes with the green
//     "1O" and the name is set on the right, one word per sung word.
//   The outro plays on; when the band drops out the lights go down slowly, the name fades, and on the
//   last hit the screen goes dark: only the green standby light is left, as in the first frame of
//   `boot` (so the film can loop), fading with the ring-out.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE, keyHead2D, keyMarkPath } from './_motifs';
import { Device3D, SCREEN, type DevicePose } from './_device3d';

export default class End extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  L!: Line;
  drop = 0;
  last = 0;

  override init() {
    const { audio } = this.ctx;
    this.L = this.ctx.lyrics.get('OneKey Pro 2');
    // the band drops out a few bars after the name; then one last hit rings out (the loudest moment after)
    const t1 = this.ctx.end;
    this.drop = audio.downbeats.find((d) => d > this.L.words[2]!.end + 6) ?? t1 - 5;
    let last = this.drop + 2;
    for (let x = this.drop + 1, best = 0; x < t1 - 0.5; x += 1 / 50) { const v = audio.sample(x).rms; if (v > best) { best = v; last = x; } }
    this.last = audio.timeOfBeat(Math.round(audio.beatAt(last)));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, t0 = this.ctx.start, t1 = this.ctx.end;
    const words = this.L.words;
    const name = audio.timeOfBeat(Math.floor(audio.beatAt(words[0]!.start + 0.02)));
    const { drop, last } = this;

    // ---- the turntable: one slow turn over the break, easing into a three-quarter front on "OneKey"
    const k = prog(t, t0, name, ease.inOutCubic);
    const settle = prog(t, name - 0.3, name + 1.4, ease.inOutCubic);
    const drift = prog(t, name, last, ease.linear);
    const yaw = lerp(-Math.PI * 1.35, 0.38, k) - drift * 0.28;
    const pitch = lerp(0.18, 0.1, k);
    const pos: [number, number, number] = [lerp(0, -0.95, settle), lerp(0, 0.05, settle), 0];
    const dist = lerp(4.3, 4.7, settle) - prog(t, name, t1) * 0.3;
    // a light bar on each downbeat of the break
    const db = audio.downbeats.filter((d) => d >= t0 - 0.01 && d < name);
    let sweep = 9;
    for (const d of db) if (t >= d && t < d + 1.2) sweep = lerp(1.6, -1.6, prog(t, d, d + 1.2, ease.inOutQuad));
    const fadeIn = 1; // hook2 hands over this exact pose, lit: no fade from black
    const lightsDown = 1 - prog(t, drop, last, ease.inOutQuad) * 0.75 - prog(t, last, last + 0.25) * 0.25;
    const wake = prog(t, words[0]!.start - 0.25, words[0]!.start + 0.15, ease.outCubic);
    const screenOff = t >= last;

    // screen: the mark
    const s = this.dev.screen.ctx;
    this.dev.screen.clear(rgba('ink'));
    s.fillStyle = rgba('signal');
    s.fill(keyMarkPath(SCREEN.w / 2, SCREEN.h * 0.46, lerp(150, 200, ease.outCubic(wake))), 'evenodd');

    const pose: DevicePose = {
      cam: [0, 0.35, dist], tgt: [0, 0, 0], fov: 0.55, pos, rot: [yaw, pitch, 0.04],
      sweep, screen: screenOff ? 0 : wake, gain: fadeIn * lightsDown,
    };

    const b = this.bg.ctx;
    this.bg.clear(rgba('ink'));
    const gc = this.dev.project(pose, [0, 0, 0]);
    const g = b.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, H * 0.8);
    g.addColorStop(0, `rgba(28,31,29,${fadeIn * lightsDown})`);
    g.addColorStop(1, 'rgba(10,11,10,0)');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, this.dev.render(renderer, pose), out, { opacity: 1 - prog(t, last, last + 0.5, ease.outCubic) });

    // ---- the name, right of the device; the standby light when the screen goes dark
    const c = this.text.ctx;
    this.text.clear();
    const nameOut = 1 - prog(t, drop, last, ease.inOutQuad);
    if (!screenOff && nameOut > 0) {
      const labels = ['OneKey', 'Pro', '2'];
      const x0 = W * 0.54, y0 = H * 0.5 + 40;
      c.font = font(F.archivo(100, 900), 150);
      let x = x0;
      labels.forEach((l, i) => {
        const kk = prog(t, words[i]!.start - 0.02, words[i]!.start + 0.16, ease.outExpo);
        const w = c.measureText(l).width;
        if (kk > 0) {
          c.globalAlpha = clamp(kk * 3) * nameOut;
          c.fillStyle = i === 2 ? rgba('signal') : rgba('bone');
          c.fillText(l, i === 0 ? x0 : x, (i === 0 ? y0 - 150 : y0) + (1 - kk) * 30);
        }
        if (i > 0) x += w + 40;
      });
      // what it is, then the credit
      c.globalAlpha = nameOut * prog(t, words[2]!.end, words[2]!.end + 0.6);
      c.font = font(F.archivo(100, 500), 58);
      c.fillStyle = rgba('bone', 0.85);
      c.fillText('Hardware Wallet', x0 + 4, y0 + 88);
      c.globalAlpha = nameOut * prog(t, words[2]!.end + 1.2, words[2]!.end + 2);
      // 小鱼 in Chinese (Croath): Plex has no CJK, so it falls back to the system's Chinese sans
      // (PingFang on a Mac, WenQuanYi in the export container)
      c.font = `${font(F.mono(400), 24)}, "PingFang SC", "Hiragino Sans GB", "WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif`;
      c.fillStyle = rgba('bone', 0.45);
      c.fillText('Video by Croath 小鱼 & Claude', x0 + 6, y0 + 190);
      c.globalAlpha = 1;
    }
    if (screenOff) {
      const p = this.dev.project(pose, [0, 0, DEVICE.t / 2]);
      const ring = 1 - prog(t, last + 0.3, t1, ease.inQuad) * 0.6;
      keyHead2D(c, p.x, p.y, 1, ring * (0.8 + 0.2 * f.a.kick));
    }
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.45, flash: screenOff ? 0.12 * Math.pow(0.5, (t - last) / 0.05) : 0 };
  }
}
