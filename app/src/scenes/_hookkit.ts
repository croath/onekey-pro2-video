// Helpers for `hook` (the choruses): the pieces of its one continuous 3D world around the real device.
//   - Look: the two choruses' palettes (n=1 bone on ink, n=2 ink on a bone studio cyclorama).
//   - Lines: two 3D LineBatches, one drawn behind the device and one in front, filled with
//     world-space segments that are sorted against the device by camera depth.
//   - smooth(): a monotone cubic through keyframes, for camera paths without velocity jumps.
//   - poseMix(): blend two device poses (camera moves between shots instead of cuts).
//   - slab3D(): Archivo set on a world plane with thickness (stacked layers), for type slabs in space.
//   - wireMark(): the "1" or the "O" of the key mark as an extruded hairline sculpture.
//   - fiber(): a signature leaving the device, a hairline travelling along a curve past the camera.
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { clamp, lerp } from '../engine/util';
import type { DevicePose, V3 } from './_device3d';
import { add, basis, dot, mul, onPlane, sub, text3D, type Plane } from './_space';
import { KEY } from './_motifs';

export type RGB = [number, number, number];

/** A chorus' palette. Lines are linear rgb (they may glow on ink; on bone they are ink and never glow). */
export type Look = {
  dark: boolean;
  bg: string;
  /** the pool of light behind the device (centre colour) */
  pool: string;
  fg: (a?: number) => string;
  dim: (a?: number) => string;
  /** hairlines, and the bright ones (signatures, pens) */
  line: RGB;
  hot: RGB;
  blend: 'add' | 'normal';
};
export const LOOK: Record<1 | 2, Look> = {
  1: {
    dark: true, bg: rgba('ink'), pool: 'rgba(30,34,31,1)',
    fg: (a = 1) => rgba('bone', a), dim: (a = 1) => rgba('graphite', a),
    line: [0.75, 0.8, 0.77], hot: [2.2, 2.4, 2.25], blend: 'add',
  },
  2: {
    dark: false, bg: rgba('bone'), pool: 'rgba(252,253,251,1)',
    fg: (a = 1) => rgba('ink', a), dim: (a = 1) => rgba('ash', a),
    line: [LIN.ink[0], LIN.ink[1], LIN.ink[2]], hot: [LIN.ink[0], LIN.ink[1], LIN.ink[2]], blend: 'normal',
  },
};

/** Monotone cubic (Fritsch–Carlson) through keyframes [t, v], clamped at the ends. */
export function smooth(t: number, k: [number, number][]): number {
  const n = k.length;
  if (t <= k[0]![0]) return k[0]![1];
  if (t >= k[n - 1]![0]) return k[n - 1]![1];
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((k[i + 1]![1] - k[i]![1]) / Math.max(1e-6, k[i + 1]![0] - k[i]![0]));
  m.push(0);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (2 * d[i - 1]! * d[i]!) / (d[i - 1]! + d[i]!));
  m.push(0);
  let i = 0;
  while (t > k[i + 1]![0]) i++;
  const h = k[i + 1]![0] - k[i]![0], s = (t - k[i]![0]) / h;
  const h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s;
  return h00 * k[i]![1] + h10 * h * m[i]! + h01 * k[i + 1]![1] + h11 * h * m[i + 1]!;
}

const mixV = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** Blend two poses (camera, device placement, lights). */
export function poseMix(a: DevicePose, b: DevicePose, k: number): DevicePose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    ...b,
    cam: mixV(a.cam, b.cam, k), tgt: mixV(a.tgt, b.tgt, k), fov: lerp(a.fov, b.fov, k),
    pos: mixV(a.pos ?? [0, 0, 0], b.pos ?? [0, 0, 0], k), rot: mixV(a.rot ?? [0, 0, 0], b.rot ?? [0, 0, 0], k),
    scale: lerp(a.scale ?? 1, b.scale ?? 1, k), gain: lerp(a.gain ?? 1, b.gain ?? 1, k),
    screen: lerp(a.screen ?? 0, b.screen ?? 0, k),
    sweep: k < 0.5 ? a.sweep : b.sweep,
  };
}

/** Two 3D line batches split at the device: segments farther from the camera than the device go behind it. */
export class Lines {
  back: LineBatch;
  front: LineBatch;
  private cam: V3 = [0, 0, 1];
  private fw: V3 = [0, 0, -1];
  private split = 0;
  constructor(look: Look, cap = 60000) {
    this.back = new LineBatch(cap, { screen2D: false, blend: look.blend });
    this.front = new LineBatch(cap, { screen2D: false, blend: look.blend });
  }
  begin(p: DevicePose) {
    this.back.clear(); this.front.clear();
    this.cam = p.cam; this.fw = basis(p).fw;
    this.split = dot(sub(p.pos ?? [0, 0, 0], p.cam), this.fw);
  }
  /** Camera depth of a world point. */
  depth(q: V3) { return dot(sub(q, this.cam), this.fw); }
  seg(a: V3, b: V3, w: number, c: RGB, al = 1, force?: 'back' | 'front') {
    if (al <= 0.003) return;
    const za = this.depth(a), zb = this.depth(b);
    if (za < 0.05 && zb < 0.05) return;
    const behind = force ? force === 'back' : (za + zb) / 2 > this.split;
    (behind ? this.back : this.front).seg(a[0], a[1], a[2], b[0], b[1], b[2], w, c[0], c[1], c[2], al);
  }
  poly(pts: V3[], w: number, c: RGB, al = 1, closed = false, force?: 'back' | 'front') {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1]!, pts[i]!, w, c, al, force);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1]!, pts[0]!, w, c, al, force);
  }
}

/**
 * Type with thickness on a world plane: `layers` copies stepped back along the plane's normal in the
 * side colour, then the face. `depth` in world units. The plane's normal points at the reader.
 */
export function slab3D(c: CanvasRenderingContext2D, pose: DevicePose, text: string, family: string, size: number, pl: Plane, x0: number, o: { depth: number; face: string; side: string; layers?: number; lift?: number }) {
  const n = o.layers ?? 7, z0 = o.lift ?? 0;
  c.fillStyle = o.side;
  for (let i = n; i >= 1; i--) text3D(c, pose, text, family, size, pl, x0, z0 - (o.depth * i) / n);
  c.fillStyle = o.face;
  text3D(c, pose, text, family, size, pl, x0, z0);
}

/** The "1" (part 0) or the "O" (part 1) of the key mark as a closed outline (mark units centred, y up), `h` = mark height. */
export function markOutline(part: 0 | 1, h: number): [number, number][][] {
  const k = h / KEY.height;
  const P = (x: number, y: number): [number, number] => [(x - KEY.centre.x) * k, -(y - KEY.centre.y) * k];
  if (part === 0) return [KEY.one.map(([x, y]) => P(x, y))];
  const ring = (r: number) => Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return P(KEY.ring.cx + Math.cos(a) * r, KEY.ring.cy + Math.sin(a) * r);
  });
  return [ring(KEY.ring.R), ring(KEY.ring.r)];
}

/**
 * An extruded hairline sculpture of a mark part on a plane: the outline at the face and `depth`
 * behind it, joined at every `rib`-th vertex.
 */
export function wireMark(L: Lines, part: 0 | 1, h: number, pl: Plane, cx: number, cy: number, depth: number, w: number, col: RGB, al: number, force?: 'back' | 'front') {
  const rib = part === 0 ? 1 : 6;
  for (const loop of markOutline(part, h)) {
    const A = loop.map(([x, y]) => onPlane(pl, cx + x, cy + y, 0));
    const B = loop.map(([x, y]) => onPlane(pl, cx + x, cy + y, -depth));
    L.poly(A, w, col, al, part === 0, force);
    L.poly(B, w * 0.7, col, al * 0.55, part === 0, force);
    for (let i = 0; i < A.length - (part === 0 ? 0 : 1); i += rib) L.seg(A[i]!, B[i]!, w * 0.7, col, al * 0.55, force);
  }
}

/** A quadratic Bézier in 3D. */
export const bez = (a: V3, b: V3, c: V3, u: number): V3 => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], v * v * a[2] + 2 * v * u * b[2] + u * u * c[2]];
};

/**
 * A signature leaving the device: a hairline whose head runs along a Bézier (from `a` via `b` to `c`)
 * from u = 0 at `k` = 0 to beyond the end, trailing `len` (in u). Brightest at the head.
 */
export function fiber(L: Lines, a: V3, b: V3, cc: V3, k: number, len: number, w: number, col: RGB, al: number, steps = 18) {
  if (k <= 0) return;
  const head = k * (1 + len), tail = head - len;
  const u0 = clamp(tail, 0, 1), u1 = clamp(head, 0, 1);
  if (u1 <= u0) return;
  let prev = bez(a, b, cc, u0);
  for (let i = 1; i <= steps; i++) {
    const u = lerp(u0, u1, i / steps);
    const q = bez(a, b, cc, u);
    const f = (u - tail) / len; // 0 at the tail, 1 at the head
    L.seg(prev, q, w, col, al * f * f);
    prev = q;
  }
}

export { add, mul, sub };
