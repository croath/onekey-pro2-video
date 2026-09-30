// Shared 3D space for the device's scenes: the world the raymarched device (_device3d) lives in, so
// type and lines can sit in it rather than over it.
//   - projW / camera3: the device camera (a DevicePose) as a projection and as a three.js camera, for
//     LineBatch 3D lines drawn in the same world as the device.
//   - text3D / lyric3D: Archivo type set on a plane in the world (true perspective, glyph outlines
//     projected point by point), so a lyric can lie on the floor, stand behind the device, or ride a
//     surface, and parallax with the camera.
//   - stroke3D: a single-stroke font written by a moving point on a plane in the world (LineBatch).
import * as THREE from 'three';
import type { PathCommand } from 'opentype.js';
import { W, H } from '../engine/gl';
import type { LineBatch } from '../engine/lines';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import type { StrokeText } from '../engine/stroke';
import { layout, textPathCommands } from '../engine/type';
import { clamp, ease, prog } from '../engine/util';
import type { AudioData } from '../engine/audio';
import type { DevicePose, V3 } from './_device3d';
import { DEVICE, KEY } from './_motifs';

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The camera basis of a pose. */
export function basis(p: DevicePose) {
  const fw = norm(sub(p.tgt, p.cam)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
  return { fw, rt, up };
}

/** Logical px (x right, y down) and camera depth of a WORLD point. */
export function projW(p: DevicePose, w: V3): { x: number; y: number; z: number } {
  const { fw, rt, up } = basis(p);
  const d = sub(w, p.cam), z = dot(d, fw), tf = Math.tan(p.fov / 2);
  return { x: W / 2 + (dot(d, rt) / z / tf) * (H / 2), y: H / 2 - (dot(d, up) / z / tf) * (H / 2), z };
}

/** The pose's camera as a three.js camera (for LineBatch in 3D). */
const cam3 = new THREE.PerspectiveCamera(40, W / H, 0.01, 200);
export function camera3(p: DevicePose): THREE.PerspectiveCamera {
  cam3.fov = (p.fov * 180) / Math.PI;
  cam3.aspect = W / H;
  cam3.near = 0.01; cam3.far = 200;
  cam3.position.set(...p.cam);
  cam3.up.set(0, 1, 0);
  cam3.lookAt(...p.tgt);
  cam3.updateProjectionMatrix();
  cam3.updateMatrixWorld(true);
  return cam3;
}

/** A plane in the world: origin (text's left baseline), right (u) and up (v) unit vectors. */
export type Plane = { o: V3; u: V3; v: V3 };
/** A plane facing the camera direction `yaw` (0 = facing +z), tilted back by `pitch`. */
export function plane(o: V3, yaw = 0, pitch = 0): Plane {
  const u: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const v: V3 = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
  return { o, u, v };
}
/** A floor plane (lying flat, text reading away from a viewer at +z): v points into the scene (-z). */
export function floor(o: V3, yaw = 0): Plane {
  return { o, u: [Math.cos(yaw), 0, -Math.sin(yaw)], v: [-Math.sin(yaw), 0, -Math.cos(yaw)] };
}
export const onPlane = (pl: Plane, x: number, y: number, z = 0): V3 => {
  const n = cross(pl.u, pl.v);
  return [pl.o[0] + pl.u[0] * x + pl.v[0] * y + n[0] * z, pl.o[1] + pl.u[1] * x + pl.v[1] * y + n[1] * z, pl.o[2] + pl.u[2] * x + pl.v[2] * y + n[2] * z];
};

const REF = 100; // glyph outlines are cached at 100 px and scaled
const cmdCache = new Map<string, PathCommand[]>();
function cmds(text: string, family: string) {
  const k = family + '\u0000' + text;
  let c = cmdCache.get(k);
  if (!c) { c = textPathCommands(text, family, REF); cmdCache.set(k, c); }
  return c;
}

/**
 * Fill `text` on a world plane, `size` = em size in world units, starting `x0` (world units) along u
 * and lifted `z` off the plane. Returns false if any of it is behind the camera (then nothing is drawn).
 */
export function text3D(c: CanvasRenderingContext2D, pose: DevicePose, text: string, family: string, size: number, pl: Plane, x0 = 0, z = 0): boolean {
  const s = size / REF;
  const P = (x: number, y: number) => projW(pose, onPlane(pl, x0 + x * s, -y * s, z));
  const path = new Path2D();
  for (const cm of cmds(text, family)) {
    if (cm.type === 'M') { const a = P(cm.x, cm.y); if (a.z <= 0.02) return false; path.moveTo(a.x, a.y); }
    else if (cm.type === 'L') { const a = P(cm.x, cm.y); if (a.z <= 0.02) return false; path.lineTo(a.x, a.y); }
    else if (cm.type === 'Q') { const a = P(cm.x1, cm.y1), b = P(cm.x, cm.y); if (b.z <= 0.02) return false; path.quadraticCurveTo(a.x, a.y, b.x, b.y); }
    else if (cm.type === 'C') { const a = P(cm.x1, cm.y1), b = P(cm.x2, cm.y2), d = P(cm.x, cm.y); if (d.z <= 0.02) return false; path.bezierCurveTo(a.x, a.y, b.x, b.y, d.x, d.y); }
    else path.closePath();
  }
  c.fill(path);
  return true;
}

/** Width of `text` in world units at em size `size`. */
export const width3D = (text: string, family: string, size: number) => (layout(text, family, REF).width * size) / REF;

export type Lyric3DOpts = {
  family: string; size: number; on: string; off: string; alpha?: number;
  /** colour for particular words (by index), e.g. the one the scene is about */
  accent?: Map<number, string>;
  /** sung words rise out of the plane by this much (world units) as they land */
  pop?: number;
  /** only these word indices (default all) */
  only?: number[];
  /** break the line before these word indices; rows step down by `leading` (default 1.1 em) */
  rows?: number[];
  leading?: number;
  /** horizontal alignment of each row about the plane's origin */
  align?: 'left' | 'center' | 'right';
};
/**
 * A lyric line set on a world plane, word by word: unsung words dim, each sung word lands (a small
 * rise out of the plane). The line starts at the plane's origin. Returns its width (world units).
 */
export function lyric3D(c: CanvasRenderingContext2D, pose: DevicePose, line: Line, t: number, pl: Plane, o: Lyric3DOpts): number {
  const s = o.size / REF;
  const A = o.alpha ?? 1;
  // split into rows of word indices
  const rows: number[][] = [[]];
  line.words.forEach((_, i) => { if (o.rows?.includes(i) && rows[rows.length - 1]!.length) rows.push([]); rows[rows.length - 1]!.push(i); });
  const lead = o.leading ?? o.size * 1.1;
  let widest = 0;
  rows.forEach((row, r) => {
    const txt = row.map((i) => line.words[i]!.w).join(' ');
    const lay = layout(txt, o.family, REF);
    const rw = lay.width * s;
    widest = Math.max(widest, rw);
    const x0 = o.align === 'center' ? -rw / 2 : o.align === 'right' ? -rw : 0;
    const rp: Plane = { o: onPlane(pl, 0, -r * lead), u: pl.u, v: pl.v };
    let ci = 0;
    for (const i of row) {
      const w: Word = line.words[i]!;
      const i0 = txt.indexOf(w.w, ci);
      ci = i0 + w.w.length;
      if (o.only && !o.only.includes(i)) continue;
      const g = lay.glyphs[i0];
      if (!g) continue;
      const k = Lyrics.wordProgress(w, t);
      const land = k > 0 ? ease.outExpo(clamp(k * 4)) : 0;
      c.globalAlpha = A;
      c.fillStyle = k > 0 ? o.accent?.get(i) ?? o.on : o.off;
      text3D(c, pose, w.w, o.family, o.size, rp, x0 + g.x * s, (o.pop ?? o.size * 0.25) * (k > 0 ? 1 - land : 0));
    }
  });
  c.globalAlpha = 1;
  return widest;
}

/**
 * Write the first `len` (stroke-font px) of a StrokeText on a world plane: `scale` world units per
 * px. Lines go into a 3D LineBatch (world coordinates; render it with camera3). Returns the pen's world
 * position, or null.
 */
export function stroke3D(b: LineBatch, st: StrokeText, len: number, pl: Plane, scale: number, width: number, rgb: [number, number, number], alpha = 1): V3 | null {
  const P = (x: number, y: number) => onPlane(pl, x * scale, -y * scale);
  let head: V3 | null = null;
  for (let i = 0; i < st.strokes.length; i++) {
    const s0 = st.startLen[i]!;
    if (s0 >= len) break;
    const pts = st.strokes[i]!, L = st.lens[i]!;
    const remain = len - s0;
    let prev = P(pts[0]!.x, pts[0]!.y);
    for (let j = 1; j < pts.length; j++) {
      if (L[j - 1]! >= remain) break;
      const u = Math.min(1, (remain - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!));
      const a = pts[j - 1]!, q = pts[j]!;
      const cur = P(a.x + (q.x - a.x) * u, a.y + (q.y - a.y) * u);
      b.seg(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], width, rgb[0], rgb[1], rgb[2], alpha);
      prev = cur;
      head = cur;
    }
  }
  return head;
}

/**
 * The opening's one continuous camera move (boot -> slab): `boot` dives into the "O" until it is the
 * rear camera's metal ring (centre `at` px, outer radius `rPx`); from there (k = 0) the camera pulls
 * back (k = 1) to a three-quarter view of the whole back. The device lies back-to-camera (`rot`).
 */
export function lensPull(k: number, o: { at: [number, number]; rPx: number; fov: number; pos: V3; rot: V3; tgt: V3; dist: number; yaw: number; pitch: number }): DevicePose {
  const m = [Math.cos(o.rot[0]), Math.sin(o.rot[0])];
  // the lens in the world (yaw only: device x, z turn about y)
  const L: V3 = [-DEVICE.cam.x, DEVICE.cam.y, -DEVICE.t / 2];
  const lw: V3 = [o.pos[0] + m[0]! * L[0] + m[1]! * L[2], o.pos[1] + L[1], o.pos[2] - m[1]! * L[0] + m[0]! * L[2]];
  const tf = Math.tan(o.fov / 2);
  const d0 = (DEVICE.cam.r * (H / 2)) / (o.rPx * tf);
  const e = ease.inOutCubic(clamp(k));
  const dist = Math.exp(Math.log(d0) + (Math.log(o.dist) - Math.log(d0)) * e);
  const yaw = o.yaw * e, pitch = o.pitch * e;
  const dir: V3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  // where the lens sits on screen: from `at` (boot's ring) to where the wide framing puts it; the
  // target is solved so the lens is exactly there at every step
  const wDir: V3 = [Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)];
  const wide = projW({ cam: add(o.tgt, mul(wDir, o.dist)), tgt: o.tgt, fov: o.fov }, lw);
  const sx = o.at[0] + (wide.x - o.at[0]) * e, sy = o.at[1] + (wide.y - o.at[1]) * e;
  const fw = mul(dir, -1), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
  // lens depth along the view axis at this distance ~ dist (target sits in the lens's depth plane)
  const ox = ((sx - W / 2) / (H / 2)) * dist * tf, oy = ((H / 2 - sy) / (H / 2)) * dist * tf;
  const tgt = sub(sub(lw, mul(rt, ox)), mul(up, oy));
  // the macro sits right under the softbox: the exposure opens as the camera pulls back
  return { cam: add(tgt, mul(dir, dist)), tgt, fov: o.fov, pos: o.pos, rot: o.rot, gain: 0.5 + 0.5 * e };
}

/** boot's mark (height px) and where its dive leaves the ring; slab's framing once pulled back. */
export const OPENING = {
  markH: 460,
  zoom: 3.6,
  at: [W * 0.36, H * 0.42] as [number, number],
  pull: { fov: 0.55, pos: [0.62, 0, 0] as V3, rot: [Math.PI, 0, 0] as V3, tgt: [0.32, -0.02, 0] as V3, dist: 4.5, yaw: 0.34, pitch: 0.09 },
};
export const openingPose = (k: number) =>
  lensPull(k, { ...OPENING.pull, at: OPENING.at, rPx: KEY.ring.R * (OPENING.markH / KEY.height) * OPENING.zoom });

/** The pull-back's progress: from boot's last downbeat (the dive has landed on the ring) until just
 * before "front", when slab turns the device round. */
export function pullK(audio: AudioData, lyrics: { get(q: string, nth?: number): Line }, t: number) {
  const front = lyrics.get('Glass on the front').words.find((w) => w.w.startsWith('front'))!;
  // boot's choreography lands on the ring (its bar 4) on the song's 7th downbeat
  return prog(t, audio.downbeats[6]!, front.start - 0.15);
}

// ---------------------------------------------------------------- stage and line helpers
// (appended for airgap / lens / guard / touch / passkey / below's first line)

/** The studio ground of `end`: ink with a soft pool of light centred at (x, y) px. `a` dims it. */
export function studio(c: CanvasRenderingContext2D, x: number, y: number, a = 1, r = H * 0.85, core = [26, 29, 27]) {
  c.fillStyle = '#0A0B0A';
  c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${core[0]},${core[1]},${core[2]},${a})`);
  g.addColorStop(1, 'rgba(10,11,10,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

/** Device-space points to world under a pose (anything with `toWorld`, i.e. a Device3D). */
export const toW = (dev: { toWorld(p: DevicePose, q: V3): V3 }, pose: DevicePose, pts: V3[]): V3[] => pts.map((q) => dev.toWorld(pose, q));

/**
 * A world polyline into a 3D LineBatch, drawn from `from` (fraction of its length) up to `to`; a
 * closed loop wraps round. Returns the pen's world position (the end of what is drawn), or null.
 */
export function path3D(b: LineBatch, pts: V3[], from: number, to: number, width: number, rgb: [number, number, number], alpha = 1, closed = false): V3 | null {
  const P = closed ? [...pts, pts[0]!] : pts;
  const n = P.length;
  if (n < 2 || to <= from) return null;
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1]! + Math.hypot(...sub(P[i]!, P[i - 1]!)));
  const tot = L[n - 1]!;
  const at = (s: number): V3 => {
    s = ((s % tot) + tot) % tot;
    let i = 1;
    while (i < n - 1 && L[i]! < s) i++;
    const u = (s - L[i - 1]!) / Math.max(1e-9, L[i]! - L[i - 1]!);
    return mix3(P[i - 1]!, P[i]!, clamp(u));
  };
  const s0 = from * tot, s1 = to * tot;
  // walk the vertices between s0 and s1 (possibly wrapping)
  let prev = at(s0), s = s0;
  const base = Math.floor(s0 / tot) * tot;
  let i = 1;
  while (i < n && base + L[i]! <= s0) i++;
  let lap = base;
  for (;;) {
    if (i >= n) { lap += tot; i = 1; }
    const sv = lap + L[i]!;
    if (sv >= s1) break;
    const q = P[i]!;
    b.seg(prev[0], prev[1], prev[2], q[0], q[1], q[2], width, rgb[0], rgb[1], rgb[2], alpha);
    prev = q; s = sv; i++;
    if (s - s0 > tot * 4) break;
  }
  const e = at(s1);
  b.seg(prev[0], prev[1], prev[2], e[0], e[1], e[2], width, rgb[0], rgb[1], rgb[2], alpha);
  return e;
}

/** A glowing point in 3D (the pen head of a traced line): stacked short fat segments, px widths. */
export function glow3D(b: LineBatch, p: V3, size: number, rgb: [number, number, number], I = 1) {
  const e = 1e-4;
  b.seg(p[0], p[1], p[2], p[0] + e, p[1], p[2], size * 5, rgb[0] * 0.35 * I, rgb[1] * 0.35 * I, rgb[2] * 0.35 * I, 0.35);
  b.seg(p[0], p[1], p[2], p[0] + e, p[1], p[2], size * 2.2, rgb[0] * 1.6 * I, rgb[1] * 1.6 * I, rgb[2] * 1.6 * I, 0.8);
  b.seg(p[0], p[1], p[2], p[0] + e, p[1], p[2], size, 4 * I, 4 * I, 4 * I, 1);
}

/** Fill a world polygon (projected) on a Canvas2D; false if any vertex is behind the camera. */
export function fill3D(c: CanvasRenderingContext2D, pose: DevicePose, pts: V3[]): boolean {
  const path = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    const a = projW(pose, pts[i]!);
    if (a.z <= 0.02) return false;
    if (i) path.lineTo(a.x, a.y); else path.moveTo(a.x, a.y);
  }
  path.closePath();
  c.fill(path);
  return true;
}

/** A rounded rectangle on a plane (centre cx, cy in plane units), as a closed world polyline. */
export function rrect3D(pl: Plane, cx: number, cy: number, w: number, h: number, r: number, n = 8, z = 0): V3[] {
  const pts: V3[] = [];
  const cs: [number, number, number][] = [[w / 2 - r, h / 2 - r, 0], [-(w / 2 - r), h / 2 - r, Math.PI / 2], [-(w / 2 - r), -(h / 2 - r), Math.PI], [w / 2 - r, -(h / 2 - r), Math.PI * 1.5]];
  for (const [x, y, a0] of cs) for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI / 2);
    pts.push(onPlane(pl, cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r, z));
  }
  return pts;
}
