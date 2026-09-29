// `end` (outro) — docs/TREATMENT.md: the device's front; the screen wakes with the green "1O" mark,
// and `OneKey Pro 2` is set under it one word per sung word (Archivo). On the last hit the screen goes
// dark and only the green standby light is left, as in the first frame of `boot` (so it can loop).
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE, devicePath, keyHead2D, keyMarkPath } from './_motifs';

const CX = W / 2, CY = H * 0.44, DW = 360;

export default class End extends Scene {
  text = new Layer2D();
  L!: Line;

  override init() {
    this.L = this.ctx.lyrics.get('OneKey Pro 2');
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const words = this.L.words;
    // the last hit: the downbeat four bars after "2" (the outro's closing hit), before the fade-out
    const off = Math.min(audio.timeOfBeat(Math.round(audio.beatAt(words[2]!.start)) + 16), this.ctx.end - 1.6);
    const dark = t >= off;

    // a slow push-in while the name holds
    const z = lerp(1, 1.07, prog(t, this.ctx.start, off, ease.inOutQuad));
    c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
    const h = DW * DEVICE.h;
    const dev = devicePath(CX, CY, DW);
    const kin = prog(t, this.ctx.start, this.ctx.start + 0.5, ease.outCubic);
    // the slab: black glass with a soft diagonal sheen, a thin metal edge
    c.globalAlpha = kin * (dark ? 1 - prog(t, off, off + 0.25) : 1);
    const g = c.createLinearGradient(CX - DW / 2, CY - h / 2, CX + DW / 2, CY + h / 2);
    g.addColorStop(0, rgba('ink2'));
    g.addColorStop(0.36, rgba('ink2'));
    g.addColorStop(0.42, 'rgba(36,40,37,1)');
    g.addColorStop(0.5, rgba('ink2'));
    g.addColorStop(1, 'rgba(12,13,12,1)');
    c.fillStyle = g;
    c.fill(dev);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(92,96,93,1)';
    c.stroke(dev);
    c.globalAlpha = 1;

    // the screen wakes: the mark, then the name
    const wake = prog(t, words[0]!.start - 0.25, words[0]!.start + 0.15, ease.outCubic);
    if (!dark && wake > 0) {
      c.save();
      c.clip(devicePath(CX, CY, DW - 16));
      c.globalAlpha = wake;
      c.fillStyle = rgba('signal');
      c.fill(keyMarkPath(CX, CY - h * 0.04, lerp(120, 170, ease.outCubic(wake))), 'evenodd');
      c.restore();
    }
    if (!dark) {
      const fam = F.archivo(100, 900), size = 110;
      c.font = font(fam, size);
      const labels = ['OneKey', 'Pro', '2'];
      const widths = labels.map((l) => c.measureText(l).width);
      const gap = 34, total = widths.reduce((a, b) => a + b, 0) + gap * 2;
      let x = CX - total / 2;
      const y = CY + h / 2 + 140;
      labels.forEach((l, i) => {
        const k = prog(t, words[i]!.start - 0.02, words[i]!.start + 0.14, ease.outExpo);
        if (k > 0) {
          c.globalAlpha = clamp(k * 3);
          c.fillStyle = i === 2 ? rgba('signal') : rgba('bone');
          c.fillText(l, x, y + (1 - k) * 30);
        }
        x += widths[i]! + gap;
      });
      c.globalAlpha = 1;
    } else {
      // only the standby light is left
      keyHead2D(c, CX, CY, 1, 0.55 + 0.45 * f.a.kick);
    }

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4, flash: dark ? 0.2 * Math.pow(0.5, (t - off) / 0.04) : 0 };
  }
}
