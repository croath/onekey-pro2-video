// scratch: look at the 3D device in a few poses (t = 0.5, 1.5, ... picks one). Not in the edit.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Device3D, orbit, SCREEN, type DevicePose } from './_device3d';
import { keyMarkPath } from './_motifs';

export default class DevTest extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const i = Math.floor(f.t), k = f.t - i;
    const s = this.dev.screen.ctx;
    this.dev.screen.clear(rgba('ink'));
    s.fillStyle = rgba('signal');
    s.fill(keyMarkPath(SCREEN.w / 2, SCREEN.h * 0.4, 160), 'evenodd');
    s.font = font(F.archivo(100, 800), 60); s.fillStyle = rgba('bone');
    s.fillText('Confirm', 150, SCREEN.h * 0.75);
    const T: [number, number, number] = [0, 0, 0];
    const poses: DevicePose[] = [
      { cam: orbit(T, 4.2, 0.45, 0.12), tgt: T, fov: 0.62, screen: 1, sweep: 0.3 },
      { cam: orbit(T, 4.0, 0.1, 0.08), tgt: T, fov: 0.62, rot: [Math.PI, 0, 0], sweep: -0.4 },
      { cam: [0.9, -0.3, 0.35], tgt: [0.5, 0.1, 0], fov: 0.55, rot: [0, 0, 0], screen: 1, sweep: 0.2 },
      { cam: orbit(T, 5.2, 0.8, 0.5), tgt: T, fov: 0.62, rot: [0, 0, 0], explode: 1, screen: 1, se: [1, 0.3, 0, 0] },
      { cam: orbit([0, -0.1, 0.3], 1.3, 0.3, 0.7), tgt: [0, -0.12, 0.3], fov: 0.6, explode: 1, show: [0, 0, 1, 0, 0, 0], se: [1, 1, 0.5, 0] },
      { cam: orbit(T, 4.4, 0, 0.1), tgt: T, fov: 0.62, rot: [2.3 + k, 0.1, 0.15], screen: 1 },
      { cam: orbit(T, 4.4, 0, 0.1), tgt: T, fov: 0.62, rot: [0.9, -0.2, 0.1], screen: 1 },
    ];
    const p = poses[Math.min(i, poses.length - 1)]!;
    const tex = this.dev.render(renderer, p);
    this.bg.clear(rgba('ink'));
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, tex, out);
    void W; void H;
    return { bloom: 0.45, vignette: 0.4 };
  }
}
