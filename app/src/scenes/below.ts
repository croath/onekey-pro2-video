// `below` (verse 1, lines 5–6) — docs/TREATMENT.md, the real device on ink:
//   "Quiet by design, no edges to show": the front, screen off, turning slowly; a white hairline
//     traces its outline — the first appearance of the BOUNDARY motif — and a `boundary` callout lands
//     on "edges".
//   "Everything that matters stays down below": the device lies down and comes apart, layer by layer
//     (cover glass, display, main board, frame, battery, back glass), labelled on the right; the sung
//     line is set down the stack on the left, "stays down below" level with the main board. The top
//     layers lift away and the camera drops onto the board: four secure elements light up, the green
//     key sits in one of them: `private key · never leaves`. It ends with the key at frame centre for
//     the hand-off to `airgap`.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { Lyrics } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE, keyHead2D, lyricLine } from './_motifs';
import { Device3D, EXPLODE_Z, PART_Z, SE_POS, orbit, outline, type DevicePose, type V3 } from './_device3d';

const PARTS = ['cover glass', 'display', 'main board', 'battery', 'frame', 'back glass'];
/** Draw order of the labels, top of the stack down (by explode offset). */
const ORDER = [0, 1, 2, 4, 3, 5];
const KEY_SE = 1; // the secure element that holds the key

export default class Below extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  L: Line[] = [];
  outl = outline(160, 0.035);

  override init() {
    this.L = ['Quiet by design', 'Everything that matters'].map((q) => this.ctx.lyrics.get(q));
  }

  /** Part i's centre (device space) at a given explode and lift. */
  partAt(i: number, explode: number, lift: number): V3 {
    return [0, i === 2 ? 0.02 : 0, PART_Z[i]! + EXPLODE_Z[i]! * explode + (i < 2 ? lift : 0)];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const cB = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const c = this.text.ctx;
    this.text.clear();
    this.bg.clear(rgba('ink'));
    const b = this.bg.ctx;
    const g = b.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.85);
    g.addColorStop(0, 'rgba(24,27,25,1)');
    g.addColorStop(1, rgba('ink'));
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });

    if (t < cB) {
      // ---------------------------------------------------------------- the front, screen off
      const k = prog(t, this.ctx.start, cB);
      const T: V3 = [0, 0.05, 0];
      const pose: DevicePose = { cam: orbit(T, lerp(4.3, 4.0, k), lerp(0.34, 0.12, ease.inOutQuad(k)), 0.1), tgt: T, fov: 0.6, rot: [0, 0, 0], sweep: lerp(-1.4, 1.4, k) };
      comp.draw(renderer, this.dev.render(renderer, pose), out);
      // the boundary: a white hairline traces the outline from "Quiet" to "show"
      const w0 = l1.words[0]!, wEnd = l1.words[l1.words.length - 1]!;
      const kk = prog(t, w0.start, wEnd.end, ease.inOutCubic);
      const pts = this.outl.map((q) => this.dev.project(pose, q));
      if (kk > 0) {
        const n = Math.floor(kk * pts.length);
        c.strokeStyle = rgba('bone', 0.95);
        c.lineWidth = 1.6;
        c.beginPath();
        // start at the top centre, clockwise on screen
        const i0 = Math.floor(pts.length * 0.125);
        for (let j = 0; j <= n && j <= pts.length; j++) {
          const p = pts[(i0 - j + pts.length * 4) % pts.length]!;
          if (j === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.stroke();
      }
      // callout on "edges": from the right edge
      const edges = l1.words.find((w) => w.w.startsWith('edges'))!;
      const kc = prog(t, edges.start - 0.05, edges.start + 0.4, ease.outExpo);
      if (kc > 0) {
        const a = this.dev.project(pose, [DEVICE.w / 2 + 0.01, 0.3, 0]);
        const bx = a.x + lerp(0, 160, kc);
        c.strokeStyle = rgba('bone', 0.8);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(a.x + 8, a.y); c.lineTo(bx, a.y); c.stroke();
        c.fillStyle = rgba('bone', 0.9 * kc);
        c.beginPath(); c.arc(a.x, a.y, 3, 0, Math.PI * 2); c.fill();
        c.font = font(F.mono(400), 24);
        c.fillText('boundary', bx + 14, a.y + 8);
      }
      lyricLine(c, l1, t, 120, H - 110, { family: F.archivo(100, 800), size: 72, on: rgba('bone'), off: rgba('bone', 0.3) });
      comp.draw(renderer, this.text.upload(), out);
      return { bloom: 0.45, vignette: 0.4 };
    }

    // ---------------------------------------------------------------- exploded, then down to the board
    const bar = f.bar - audio.barAt(cB);
    const lie = prog(bar, 0, 0.7, ease.inOutCubic); // the device lies down, display up
    const explode = 1.7 * prog(bar, 0.35, 2.1, ease.inOutCubic);
    const dive = prog(bar, 2.6, 4.1, ease.inOutCubic);
    const lift = dive * 2.2;
    const rot: V3 = [lerp(0, 0.5, lie), lerp(0, -Math.PI / 2, lie), 0];
    // the key's secure element, in device space, and where the camera ends up
    const seP: V3 = [SE_POS[KEY_SE]![0], SE_POS[KEY_SE]![1] + 0.02, PART_Z[2]! + EXPLODE_Z[2]! * explode + 0.024];
    const baseT: V3 = [0, 0.05, 0];
    const seW = this.worldOf(rot, seP);
    const tgt: V3 = [lerp(baseT[0], seW[0], dive), lerp(baseT[1], seW[1], dive), lerp(baseT[2], seW[2], dive)];
    const cam = orbit(tgt, lerp(6.4, 0.95, dive), lerp(0.55, 0.25, dive), lerp(lerp(0.1, 0.36, lie), 1.05, dive));
    const seOn = (i: number) => prog(bar, 2.9 + i * 0.25, 3.1 + i * 0.25, ease.outCubic) * (i === KEY_SE ? 0.7 : 0.35);
    const pose: DevicePose = {
      cam, tgt, fov: 0.6, rot, explode, lift, sweep: lerp(1.5, -1.5, prog(bar, 0.3, 2.3)),
      se: [seOn(0), seOn(1), seOn(2), seOn(3)],
    };
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // part labels on the right, while the stack is apart and the camera is back
    const la = prog(bar, 0.8, 1.6) * (1 - prog(bar, 2.5, 2.8));
    if (la > 0) {
      ORDER.forEach((i, j) => {
        const kj = prog(bar, 0.8 + j * 0.18, 1.1 + j * 0.18, ease.outCubic) * (1 - prog(bar, 2.5, 2.8));
        if (kj <= 0) return;
        const pc = this.partAt(i, explode, lift);
        const a = this.dev.project(pose, [DEVICE.w / 2 + 0.02, 0, pc[2]]);
        const x1 = W * 0.7;
        c.globalAlpha = kj;
        c.strokeStyle = rgba('bone', 0.6);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(a.x + 10, a.y); c.lineTo(lerp(a.x + 10, x1, kj), a.y); c.stroke();
        c.fillStyle = rgba('bone', 0.9);
        c.beginPath(); c.arc(a.x + 6, a.y, 2.5, 0, Math.PI * 2); c.fill();
        c.font = font(F.mono(400), 22);
        c.fillStyle = i === 2 ? rgba('signal') : rgba('bone', 0.85);
        c.fillText(`0${j + 1}  ${PARTS[i]}`, x1 + 14, a.y + 7);
        c.globalAlpha = 1;
      });
    }

    // the sung line, set down the stack on the left: "Everything" / "that matters" / "stays down below"
    const groups = [[0], [1, 2], [3, 4, 5]];
    const anchor = [0, 1, 2];
    const words = l2.words;
    const stack = prog(explode, 0.5, 1.1);
    const wa = (1 - prog(bar, 2.6, 3.0)) * stack;
    if (stack < 1) lyricLine(c, l2, t, 120, H - 110, { family: F.archivo(100, 800), size: 72, on: rgba('bone'), off: rgba('bone', 0.3), alpha: 1 - stack });
    if (wa > 0) {
      c.font = font(F.archivo(100, 800), 64);
      groups.forEach((gi, j) => {
        const pc = this.partAt(anchor[j]!, explode, lift);
        const a = this.dev.project(pose, [-DEVICE.w / 2 - 0.02, 0, pc[2]]);
        const txt = gi.map((i) => words[i]!.w).join(' ');
        const tw = c.measureText(txt).width;
        let x = Math.min(a.x - 60, W * 0.36) - tw;
        const y = a.y + 22;
        gi.forEach((i) => {
          const w = words[i]!;
          const k = Lyrics.wordProgress(w, t);
          c.globalAlpha = wa;
          c.fillStyle = k > 0 ? (j === 2 ? rgba('signal') : rgba('bone')) : rgba('bone', 0.28);
          const y2 = y - (k > 0 ? (1 - ease.outExpo(clamp(k * 4))) * 10 : 0);
          c.fillText(w.w, x, y2);
          x += c.measureText(w.w + ' ').width;
        });
        c.globalAlpha = 1;
      });
    }

    // the key: in its secure element, green, once the chips light
    const kp = this.dev.project(pose, seP);
    const kOn = prog(bar, 3.1, 3.5, ease.outCubic);
    if (kOn > 0) {
      const kk = 0.7 + 0.3 * f.a.kick;
      keyHead2D(c, kp.x, kp.y, lerp(1.2, 3.2, dive), kk * kOn);
      keyHead2D(c, kp.x, kp.y, 1.0, kk * kOn);
      keyHead2D(c, kp.x, kp.y, 0.5, kk * kOn);
      const kc = prog(bar, 3.7, 4.1, ease.outExpo);
      if (kc > 0) {
        const ax = kp.x + 60, ay = kp.y - 190, bx = ax + 170 * kc;
        c.strokeStyle = rgba('bone', 0.85);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, ay); c.stroke();
        c.fillStyle = rgba('bone', 0.95 * kc);
        c.font = font(F.mono(500), 26);
        c.fillText('private key · never leaves', bx + 14, ay + 8);
      }
    }
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4 };
  }

  /** Device-space point to world, for a rotation (scale 1, at the origin). */
  worldOf(rot: V3, q: V3): V3 {
    const [yaw, pitch, roll] = rot;
    // R = Ry * Rx * Rz
    let [x, y, z] = q;
    [x, y] = [Math.cos(roll) * x - Math.sin(roll) * y, Math.sin(roll) * x + Math.cos(roll) * y];
    [y, z] = [Math.cos(pitch) * y - Math.sin(pitch) * z, Math.sin(pitch) * y + Math.cos(pitch) * z];
    [x, z] = [Math.cos(yaw) * x + Math.sin(yaw) * z, -Math.sin(yaw) * x + Math.cos(yaw) * z];
    return [x, y, z];
  }
}
