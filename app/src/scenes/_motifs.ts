// Shared motifs, so recurring things look identical in every plate (docs/TREATMENT.md, 母题):
//  - the KEY: one OneKey-green point of light with a hot core, dragging a hairline
//  - the KEY MARK: the "1O" logo (a "1" for the key's bit over an "O" for its bow)
//  - the DEVICE: proportions of the OneKey Pro 2, taken from the reference photos
// Read-only for scene agents; ask the lead for changes.
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { clamp, ease, hash, TAU } from '../engine/util';
import { font, layout } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';

type P2 = { x: number; y: number };

// ---------------------------------------------------------------- the key (spark)
/**
 * Sputtering particles for a key light whose head position over time is `headAt(t)`.
 * Deterministic: particles are born at fixed times (rate per second) with hashed velocities.
 * Drawn into a 2D LineBatch as short streaks (motion-blurred), additive.
 */
export function keyParticles(lb: LineBatch, t: number, headAt: (t: number) => P2 | null, o: { rate?: number; life?: number; speed?: number; gravity?: number; intensity?: number; seed?: number; width?: number } = {}) {
  const life = o.life ?? 0.4, speed = o.speed ?? 200, g = o.gravity ?? 0, I = o.intensity ?? 1, seed = o.seed ?? 1;
  const rate = o.rate ?? 70;
  if (!(rate > 0)) return;
  const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
  for (let n = n0; n <= n1; n++) {
    const tb = n / rate;
    if (tb > t) continue;
    const age = t - tb;
    const h = headAt(tb);
    if (!h) continue;
    const a = hash(n, seed) * TAU, sp = speed * (0.2 + hash(n, seed + 1) ** 2 * 1.1);
    const lf = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
    const x = h.x + vx * age, y = h.y + vy * age + 0.5 * g * age * age;
    const a0 = Math.max(0, age - 0.016);
    const x0 = h.x + vx * a0, y0 = h.y + vy * a0 + 0.5 * g * a0 * a0;
    const k = 1 - age / lf;
    const heat = k * k;
    const col: [number, number, number] = [
      (LIN.signal[0] + (LIN.ember[0] - LIN.signal[0]) * heat) * 2.0 * I,
      (LIN.signal[1] + (LIN.ember[1] - LIN.signal[1]) * heat) * 2.0 * I,
      (LIN.signal[2] + (LIN.ember[2] - LIN.signal[2]) * heat) * 2.0 * I,
    ];
    lb.seg2(x0, y0, x, y, (o.width ?? 1.4) * (0.5 + k * 0.7), col, Math.min(1, k * 1.4));
  }
}

/** The key light's head: a hot pale-green core and a green halo (draw after the line it drags). 2D LineBatch. */
export function keyHead(lb: LineBatch, x: number, y: number, t: number, scale = 1, intensity = 1) {
  const flick = 0.9 + 0.1 * Math.sin(t * 71.3) * Math.sin(t * 43.1);
  const I = intensity * flick;
  const s = LIN.signal, e = LIN.ember;
  lb.seg2(x, y, x + 0.01, y, 30 * scale, [s[0] * 0.45 * I, s[1] * 0.45 * I, s[2] * 0.45 * I], 0.35);
  lb.seg2(x, y, x + 0.01, y, 13 * scale, [e[0] * 2.2 * I, e[1] * 2.2 * I, e[2] * 2.2 * I], 0.85);
  lb.seg2(x, y, x + 0.01, y, 5 * scale, [4.5 * I, 5 * I, 4.5 * I], 1);
}

/** Canvas2D version of the key head (for scenes drawing in 2D layers). */
export function keyHead2D(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, alpha = 1) {
  const r = 24 * scale;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(240,255,236,${alpha})`);
  g.addColorStop(0.18, rgba('ember', 0.95 * alpha));
  g.addColorStop(0.45, rgba('signal', 0.45 * alpha));
  g.addColorStop(1, rgba('signal', 0));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- the key mark "1O"
/**
 * The OneKey key mark in its SVG units (assets/brand/onekey-key-green.svg, viewBox 88.2 x 83.9).
 * `one` is the filled outline of the "1"; `oneStroke` its centreline, the order a pen writes it
 * (flag, then down the stem); the "O" is a ring (outer R, inner r) and `ringMid`/`ringW` its
 * centreline radius and width.
 */
export const KEY = {
  one: [[30.9, 18.1], [33.6, 9.8], [49.1, 9.8], [49.1, 35.4], [39.5, 35.4], [39.5, 18.1]] as [number, number][],
  oneStroke: [[31.9, 13.95], [44.3, 13.95], [44.3, 35.4]] as [number, number][],
  oneW: 8.3,
  ring: { cx: 44.1, cy: 56.3, R: 17.6, r: 9.7 },
  ringMid: 13.65,
  ringW: 7.9,
  /** Bounding box of the whole mark and its centre. */
  box: { x0: 26.5, y0: 9.8, x1: 61.7, y1: 73.9 },
  centre: { x: 44.1, y: 41.85 },
  height: 64.1,
};

/** Map a key-mark point (SVG units) to canvas px: mark centred at (cx, cy), `h` px tall. */
export function keyPt(p: [number, number], cx: number, cy: number, h: number): P2 {
  const k = h / KEY.height;
  return { x: cx + (p[0] - KEY.centre.x) * k, y: cy + (p[1] - KEY.centre.y) * k };
}

/** Fill the solid key mark (both parts) into a Canvas2D path at (cx, cy), `h` px tall. */
export function keyMarkPath(cx: number, cy: number, h: number): Path2D {
  const k = h / KEY.height, p = new Path2D();
  KEY.one.forEach((q, i) => {
    const { x, y } = keyPt(q, cx, cy, h);
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  });
  p.closePath();
  const c = keyPt([KEY.ring.cx, KEY.ring.cy], cx, cy, h);
  p.moveTo(c.x + KEY.ring.R * k, c.y);
  p.arc(c.x, c.y, KEY.ring.R * k, 0, TAU);
  p.moveTo(c.x + KEY.ring.r * k, c.y);
  p.arc(c.x, c.y, KEY.ring.r * k, 0, TAU, true);
  return p;
}

// ---------------------------------------------------------------- the device
/**
 * OneKey Pro 2 proportions (from assets/reference/, NDA: reference only), in units of the
 * device width. Portrait slab: y up, z out of the screen.
 */
export const DEVICE = {
  w: 1,
  h: 1.599, // 53.1 x 84.9 x 6.2 mm (Croath, 2026-09-29)
  /** total thickness: 6.2 mm / 53.1 mm */
  t: 0.1168,
  /** corner radius of the outline (big, card-like) */
  corner: 0.16,
  /** rear camera: centre (from the back, top-left) and ring radius */
  cam: { x: -0.30, y: 0.635, r: 0.054 },
  /** key mark on the back: centre and height */
  mark: { x: 0, y: 0.024, h: 0.14 },
};

/** The device's front outline (rounded rect) as a Path2D: centred at (cx, cy), `w` px wide. */
export function devicePath(cx: number, cy: number, w: number): Path2D {
  const h = w * DEVICE.h, p = new Path2D();
  p.roundRect(cx - w / 2, cy - h / 2, w, h, DEVICE.corner * w);
  return p;
}
/** Perimeter length of devicePath (for tracing it with a dash). */
export function devicePerimeter(w: number): number {
  const h = w * DEVICE.h, r = DEVICE.corner * w;
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + TAU * r;
}

// ---------------------------------------------------------------- the sung line
/**
 * One lyric line set word by word (TREATMENT 歌词规则): sung words in `on`, the rest in `off`,
 * each word lifting into place as it starts. Left-aligned at (x, baseline y).
 */
export function lyricLine(c: CanvasRenderingContext2D, line: Line, t: number, x: number, y: number, o: { family: string; size: number; on: string; off: string; alpha?: number }) {
  const lay = layout(line.text, o.family, o.size);
  c.font = font(o.family, o.size);
  const A = o.alpha ?? 1;
  let ci = 0;
  for (const w of line.words) {
    const k = Lyrics.wordProgress(w, t);
    const i0 = line.text.indexOf(w.w, ci);
    ci = i0 + w.w.length;
    const g = lay.glyphs[i0];
    if (!g) continue;
    c.globalAlpha = A;
    c.fillStyle = k > 0 ? o.on : o.off;
    c.fillText(w.w, x + g.x, y - (k > 0 ? (1 - ease.outExpo(clamp(k * 4))) * 10 : 0));
  }
  c.globalAlpha = 1;
  return lay.width;
}

// ---------------------------------------------------------------- QR codes
/**
 * A QR-looking module matrix (n x n, n = 25): real finder and timing patterns, hashed data modules.
 * It encodes nothing (no real address or payload ever appears on screen).
 */
export function qrMatrix(seed = 1, n = 25): boolean[][] {
  const m: boolean[][] = [];
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
      const u = x - fx, v = y - fy;
      if (u >= -1 && u <= 7 && v >= -1 && v <= 7) {
        if (u < 0 || v < 0 || u > 6 || v > 6) return 0; // quiet separator
        const r = Math.max(Math.abs(u - 3), Math.abs(v - 3));
        return r === 2 ? 0 : 1;
      }
    }
    return -1;
  };
  for (let y = 0; y < n; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      if (f >= 0) row.push(f === 1);
      else if (y === 6 || x === 6) row.push((x + y) % 2 === 0);
      else row.push(hash(x, y, seed) > 0.52);
    }
    m.push(row);
  }
  return m;
}

// ---------------------------------------------------------------- paper
/** Bone blueprint paper: fill and a faint 48 px grid (used by the paper plates). */
export function paper(c: CanvasRenderingContext2D, W: number, H: number, ox = 0, oy = 12) {
  c.fillStyle = rgba('bone');
  c.fillRect(0, 0, W, H);
  c.strokeStyle = rgba('ash', 0.18);
  c.lineWidth = 1;
  c.beginPath();
  for (let x = ox; x < W; x += 48) { c.moveTo(x, 0); c.lineTo(x, H); }
  for (let y = oy; y < H; y += 48) { c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();
}

/** A chip in line drawing: square package with pins on four sides, a die, a label. */
export function chip(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, label: string, col: string, bg: string) {
  c.fillStyle = bg;
  c.fillRect(cx - s / 2, cy - s / 2, s, s);
  c.strokeStyle = col;
  c.lineWidth = 1.6;
  c.strokeRect(cx - s / 2, cy - s / 2, s, s);
  c.lineWidth = 1;
  const np = 8, L = s * 0.09;
  c.beginPath();
  for (let i = 0; i < np; i++) {
    const u = -s / 2 + (s * (i + 0.5)) / np;
    c.moveTo(cx + u, cy - s / 2); c.lineTo(cx + u, cy - s / 2 - L);
    c.moveTo(cx + u, cy + s / 2); c.lineTo(cx + u, cy + s / 2 + L);
    c.moveTo(cx - s / 2, cy + u); c.lineTo(cx - s / 2 - L, cy + u);
    c.moveTo(cx + s / 2, cy + u); c.lineTo(cx + s / 2 + L, cy + u);
  }
  c.stroke();
  c.strokeRect(cx - s * 0.22, cy - s * 0.22, s * 0.44, s * 0.44);
  c.beginPath(); c.arc(cx - s / 2 + s * 0.1, cy - s / 2 + s * 0.1, s * 0.025, 0, TAU); c.stroke();
  c.fillStyle = col;
  c.font = font('Plex-500', Math.round(s * 0.1));
  c.fillText(label, cx - s / 2 + s * 0.08, cy + s / 2 - s * 0.08);
}
