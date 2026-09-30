// `below`, first line — "Quiet by design, no edges to show" (docs/TREATMENT.md, 边界 first seen):
//   the real device, front, screen off, on the right of the frame under the studio's pool of light;
//   the camera drifts round it slowly. A white 3D hairline traces its outline (the BOUNDARY) from
//   "Quiet" to "show", a bright pen at its head; on "edges" a leader runs out of the right edge to a
//   `boundary` label set in the world. The sung line stands to the left in the device's space
//   (two rows, right-aligned), word by word. Once the trace closes, the outline echoes backwards
//   into depth, ring after ring of hairlines receding behind the device, until the cut to the
//   exploded view.
// Kept in its own file so `below.ts` only calls it from its first branch.
import type * as THREE from 'three';
import type { Frame } from '../engine/scene';
import type { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F } from '../engine/type';
import type { Line } from '../engine/lyrics';
import type { Compositor } from '../engine/gl';
import { ease, lerp, prog } from '../engine/util';
import { DEVICE } from './_motifs';
import { orbit, outline, type Device3D, type DevicePose, type V3 } from './_device3d';
import { glow3D, lyric3D, path3D, plane, studio, text3D, toW, camera3 } from './_space';

let LB: LineBatch | null = null;
const OUTL = outline(160, 0.03);
/** Where the top centre sits along the outline (fraction of its length, walking it reversed). */
const F0 = (() => {
  const P = [...OUTL].reverse(), L = [0];
  for (let i = 1; i <= P.length; i++) { const a = P[i - 1]!, b = P[i % P.length]!; L.push(L[i - 1]! + Math.hypot(a[0] - b[0], a[1] - b[1])); }
  let best = 0;
  P.forEach((q, i) => { if (q[1] - Math.abs(q[0]) > P[best]![1] - Math.abs(P[best]![0])) best = i; });
  return L[best]! / L[P.length]!;
})();

export function quiet(
  o: { dev: Device3D; bg: Layer2D; text: Layer2D; renderer: THREE.WebGLRenderer; comp: Compositor; start: number },
  f: Frame, out: THREE.WebGLRenderTarget, l1: Line, cB: number,
) {
  const lb = (LB ??= new LineBatch(6000, { screen2D: false, blend: 'add' }));
  const { dev, renderer, comp } = o;
  const t = f.t;
  const k = prog(t, o.start, cB);
  const T: V3 = [0.2, 0.03, 0];
  const pose: DevicePose = {
    cam: orbit(T, lerp(4.4, 3.95, ease.inOutQuad(k)), lerp(0.32, 0.08, ease.inOutQuad(k)), lerp(0.12, 0.06, k)), tgt: T, fov: 0.6,
    pos: [0.62, 0, 0], rot: [-0.12, 0, 0], sweep: lerp(-1.4, 1.4, prog(t, o.start + 0.5, cB, ease.inOutCubic)),
  };
  const cam = camera3(pose);
  const b = o.bg.ctx;
  const gc = dev.project(pose, [0, 0, 0]);
  studio(b, gc.x, gc.y);
  comp.draw(renderer, o.bg.upload(), out, { mode: 'replace' });

  const bone = LIN.bone;
  const w0 = l1.words[0]!, wEnd = l1.words[l1.words.length - 1]!;
  const kk = prog(t, w0.start - 0.1, wEnd.end, ease.inOutCubic);
  const f0 = F0; // trace from the top centre
  // ---- behind: the outline echoes into depth once it has closed
  const ke = prog(t, wEnd.end - 0.1, cB, ease.outCubic);
  lb.clear();
  if (ke > 0) {
    // a tunnel of outlines flowing slowly back from the device, as if its edge were a sound
    const N = 12, gap = 0.5, flow = (t - wEnd.end) * 0.3;
    for (let j = 0; j < N; j++) {
      const d = (j + (flow % 1)) * gap; // depth behind the device
      const born = prog(ke * (N + 3), j, j + 3, ease.outCubic);
      if (born <= 0) continue;
      const pts = toW(dev, pose, outline(96, 0.03 + d * 0.16 * born).map((q) => [q[0], q[1], -0.05 - d * born] as V3));
      const a = born * Math.exp(-d / 2.2) * 0.7 * Math.min(1, d / gap);
      path3D(lb, pts, 0, 1, 1.1, [bone[0] * a, bone[1] * a, bone[2] * a], 1, true);
    }
    lb.render(renderer, out, cam);
  }
  comp.draw(renderer, dev.render(renderer, pose), out);

  // ---- front: the boundary trace, and the leader on "edges"
  lb.clear();
  const pts = toW(dev, pose, OUTL);
  if (kk > 0) {
    // traced clockwise on screen (the outline runs anticlockwise): walk it reversed from the top
    const rev = [...pts].reverse();
    const head = path3D(lb, rev, f0, f0 + kk, 1.6, [bone[0] * 1.1, bone[1] * 1.1, bone[2] * 1.1], 1, true);
    if (kk < 1 && head) glow3D(lb, head, 3, LIN.bone, 1.2);
  }
  const edges = l1.words.find((w) => w.w.startsWith('edges'))!;
  const kc = prog(t, edges.start - 0.05, edges.start + 0.45, ease.outExpo);
  const a0 = dev.toWorld(pose, [DEVICE.w / 2 + 0.03, 0.34, 0]);
  const a1: V3 = [a0[0] + 0.55 * kc, a0[1], a0[2]];
  if (kc > 0) {
    lb.seg(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], 1.1, bone[0] * 0.8, bone[1] * 0.8, bone[2] * 0.8, 1);
    glow3D(lb, a0, 1.6, LIN.bone, 0.5);
  }
  if (lb.count) lb.render(renderer, out, cam);

  // ---- type in the world: the sung line on the left, the label at the leader's end
  const c = o.text.ctx;
  o.text.clear();
  const fam = F.archivo(100, 800);
  lyric3D(c, pose, l1, t, plane([-0.06, 0.2, 0.1], 0.2), {
    family: fam, size: 0.17, on: rgba('bone'), off: rgba('bone', 0.2), rows: [3], leading: 0.23, align: 'right',
    alpha: prog(t, o.start, o.start + 0.5),
  });
  if (kc > 0) {
    c.fillStyle = rgba('bone', 0.9 * kc);
    text3D(c, pose, 'boundary', F.mono(400), 0.06, plane([a1[0] + 0.05, a1[1] - 0.018, a1[2]], 0.15));
    c.fillStyle = rgba('bone', 0.5 * kc);
    text3D(c, pose, 'green stays inside', F.mono(400), 0.04, plane([a1[0] + 0.05, a1[1] - 0.09, a1[2]], 0.15));
  }
  comp.draw(renderer, o.text.upload(), out);
  return { bloom: 0.45, vignette: 0.42 };
}
