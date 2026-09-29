// Starter scene: the current caption line set big in Archivo, sung/spoken words in bone,
// upcoming words dim, with a signal-orange rule that fills on each beat. It exists to prove the
// pipeline end to end; replace it with the plates described in docs/TREATMENT.md.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, fitSize, layout } from '../engine/type';
import { Lyrics } from '../engine/lyrics';
import { clamp, ease, prog } from '../engine/util';

export default class Title extends Scene {
  bg = new FSPass(
    `uniform float t;
     void main(){
       vec2 p = vUv - 0.5;
       float v = 1.0 - 0.35 * dot(p, p) * 2.0;
       fragColor = vec4(C_INK * v, 1.0);
     }`,
    { t: { value: 0 } },
  );
  text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    const line = lyrics.lastLine(f.t);
    if (line) {
      const fam = F.archivo(100, 900);
      const size = Math.min(180, fitSize(line.text, fam, W - 240, 180));
      const lay = layout(line.text, fam, size);
      const x0 = (W - lay.width) / 2, y = H * 0.5 + size * 0.34;
      // fade the line out a beat after it ends
      const alpha = 1 - prog(f.t, line.end + 0.6, line.end + 1.2, ease.inCubic);
      c.font = font(fam, size);
      let ci = 0;
      for (const w of line.words) {
        const k = Lyrics.wordProgress(w, f.t);
        const i0 = line.text.indexOf(w.w, ci);
        ci = i0 + w.w.length;
        const g = lay.glyphs[i0];
        if (!g) continue;
        const rise = (1 - ease.outExpo(clamp(k * 3))) * 24;
        c.fillStyle = rgba(k > 0 ? 'bone' : 'graphite', alpha * (k > 0 ? 1 : 0.5));
        c.fillText(w.w, x0 + g.x, y + rise);
      }
      // beat rule
      const ry = y + size * 0.35;
      c.fillStyle = rgba('graphite', alpha);
      c.fillRect(x0, ry, lay.width, 2);
      c.fillStyle = rgba('signal', alpha);
      c.fillRect(x0, ry, lay.width * ease.outCubic(f.beatPhase), 2);
    }
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.5 };
  }
}
