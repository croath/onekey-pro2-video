// The main board of the exploded device (_device3d, PARTS build): its layout, and the fine detail
// the raymarcher samples instead of modelling.
//   - CHIPS / FENCE / HOLES: the packages the SDF models (secure elements, the processor on its BGA
//     substrate, memory, power, crystal can, connectors, USB-C), the shield fence round the secure
//     zone, the mounting holes. Board-local space: x right, y up, origin at the board's centre, z up
//     from its mid-plane (top face at BOARD.top). Units: device widths (53.1 mm).
//   - passives: 0402/0201 capacitors and resistors on a 1.3 mm grid, as a small data texture (one
//     texel per grid cell: type, offset, orientation); the SDF repeats one box per cell from it.
//   - boardTexture(): a high-res material map painted once in Canvas2D: R = copper under the solder
//     mask (0.45 ground pour, 1 traces and via rings), G = exposed gold (pads, test points, fiducials),
//     B = silkscreen. 45° routing, buses, differential pairs with a length-matching serpentine, via
//     stitching, fan-outs, refdes and hairline courtyards. Sampled with mipmaps (cheap fine detail).
//   - LidAtlas: the laser-etched markings on the package lids (R = etch, G = green glow through the
//     etch). Cells 0–3 are the secure elements, which scenes draw into (the sung word on a lid).
import * as THREE from 'three';
import { F, font } from '../engine/type';
import { mulberry32 } from '../engine/util';

export const BOARD = { hx: 0.43, hy: 0.7, corner: 0.12, cy: 0.02, th: 0.005, top: 0.005 };

export const K_SE = 0, K_EPOXY = 1, K_SUB = 2, K_METAL = 3, K_CONN = 4;
/** A package: centre, half size, height above the board's top face, kind, lid atlas cell, edge radius. */
export type Chip = { x: number; y: number; hx: number; hy: number; h: number; kind: number; cell: number; r: number; ref: string; leads?: 'qfn' | 'sop' | 'none' };
export const SE_XY: [number, number][] = [[-0.27, -0.12], [-0.09, -0.12], [0.09, -0.12], [0.27, -0.12]];
export const SE_HALF_B = 0.058;
export const SE_H = 0.016;
export const CHIPS: Chip[] = [
  ...SE_XY.map(([x, y], i): Chip => ({ x, y, hx: SE_HALF_B, hy: SE_HALF_B, h: SE_H, kind: K_SE, cell: i, r: 0.0025, ref: `SE${i + 1}`, leads: 'qfn' })),
  { x: 0.1, y: 0.36, hx: 0.126, hy: 0.126, h: 0.005, kind: K_SUB, cell: -1, r: 0.002, ref: 'U1', leads: 'none' },
  { x: 0.1, y: 0.36, hx: 0.108, hy: 0.108, h: 0.021, kind: K_EPOXY, cell: 4, r: 0.003, ref: '', leads: 'none' },
  { x: -0.255, y: 0.43, hx: 0.092, hy: 0.06, h: 0.016, kind: K_EPOXY, cell: 5, r: 0.0025, ref: 'U2', leads: 'sop' },
  { x: -0.255, y: 0.215, hx: 0.05, hy: 0.05, h: 0.012, kind: K_EPOXY, cell: 6, r: 0.002, ref: 'U3', leads: 'qfn' },
  { x: 0.335, y: 0.12, hx: 0.036, hy: 0.023, h: 0.013, kind: K_METAL, cell: -1, r: 0.004, ref: 'Y1', leads: 'none' },
  { x: 0.33, y: 0.535, hx: 0.04, hy: 0.04, h: 0.01, kind: K_EPOXY, cell: 6, r: 0.002, ref: 'U4', leads: 'qfn' },
  { x: -0.3, y: 0.07, hx: 0.036, hy: 0.026, h: 0.01, kind: K_EPOXY, cell: 6, r: 0.002, ref: 'U5', leads: 'sop' },
  { x: -0.2, y: -0.49, hx: 0.11, hy: 0.03, h: 0.018, kind: K_CONN, cell: 7, r: 0.003, ref: 'J1', leads: 'none' },
  { x: 0.23, y: -0.49, hx: 0.075, hy: 0.03, h: 0.018, kind: K_CONN, cell: 7, r: 0.003, ref: 'J2', leads: 'none' },
  { x: 0.0, y: -0.642, hx: 0.07, hy: 0.042, h: 0.04, kind: K_METAL, cell: -1, r: 0.014, ref: 'J3', leads: 'none' },
];
/** The shield fence round the secure zone (a thin stamped wall). */
export const FENCE = { x: 0, y: -0.12, hx: 0.37, hy: 0.1, r: 0.024, t: 0.0028, h: 0.02 };
export const HOLES: [number, number][] = [[-0.36, 0.63], [0.36, 0.63], [-0.36, -0.63], [0.36, -0.63]];
export const HOLE_R = 0.017;
/** Tallest thing on the board, above its top face. */
export const BOARD_HMAX = 0.042;

// ---- passives
export const PCELL = 0.026;
export const PGX = Math.ceil((2 * BOARD.hx) / PCELL), PGY = Math.ceil((2 * BOARD.hy) / PCELL);
/** Passive types 1..4: [length, width, height] (du). 0402 C, 0402 R, 0201 C, 0201 R. */
export const PTYPE: [number, number, number][] = [[0, 0, 0], [0.0188, 0.0094, 0.0062], [0.0188, 0.0094, 0.0045], [0.0113, 0.0056, 0.0042], [0.0113, 0.0056, 0.0036]];
type Passive = { ix: number; iy: number; type: number; rot: number; dx: number; dy: number };

const sdRR = (px: number, py: number, hx: number, hy: number, r: number) => {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const chipDist = (x: number, y: number, c: Chip) => sdRR(x - c.x, y - c.y, c.hx, c.hy, 0);


// ---- the routed buses (board-local centrelines). Top-layer routes that would cross dive to an inner
// layer through a row of vias instead, as on a real board.
type P2 = [number, number];
export type Route = { pts: P2[]; n: number; pitch: number; w: number; viaStart?: boolean; key?: boolean };
/** Octilinear path from a to b: `first` leg axis ('v' or 'h'), one 45° jog, then the other axis. */
function oct(a: P2, b: P2, first: 'v' | 'h' = 'v', at = 0.5): P2[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (first === 'v') {
    const run = Math.abs(dy) - Math.abs(dx);
    if (run <= 0) return [a, b];
    const y1 = a[1] + Math.sign(dy) * run * at;
    return [a, [a[0], y1], [b[0], y1 + Math.sign(dy) * Math.abs(dx)], b];
  }
  const run = Math.abs(dx) - Math.abs(dy);
  if (run <= 0) return [a, b];
  const x1 = a[0] + Math.sign(dx) * run * at;
  return [a, [x1, a[1]], [x1 + Math.sign(dx) * Math.abs(dy), b[1]], b];
}
/** A square serpentine (45° chamfers) on a straight vertical run from y0 to y1 at x, bulging right. */
function meander(x: number, y0: number, y1: number, amp: number, period: number): P2[] {
  const pts: P2[] = [[x, y0]];
  const dir = Math.sign(y1 - y0), n = Math.floor(Math.abs(y1 - y0) / period), c = period * 0.1, h = period / 2;
  let y = y0;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? -1 : 1;
    pts.push([x + s * (amp - c), y], [x + s * amp, y + dir * c], [x + s * amp, y + dir * (h - c)], [x + s * (amp - c), y + dir * h], [x, y + dir * h]);
    y += dir * period;
    pts.push([x, y]);
  }
  pts.push([x, y1]);
  return pts;
}
const MCU = CHIPS[4]!, MEM = CHIPS[6]!, PMIC = CHIPS[7]!;
const SE_TOP = -0.12 + SE_HALF_B + 0.004, MCU_B = MCU.y - MCU.hy - 0.002, MCU_L = MCU.x - MCU.hx - 0.008, MCU_R = MCU.x + MCU.hx + 0.008;
export const ROUTES: Route[] = [
  // processor -> each secure element: four-wire buses dropping through the fence
  { pts: [[-0.27, SE_TOP], [-0.27, -0.053], [-0.015, 0.202], [-0.015, MCU_B]], n: 4, pitch: 0.0046, w: 0.0019, key: true },
  { pts: [[-0.09, SE_TOP], [-0.09, 0.0], [0.035, 0.125], [0.035, MCU_B]], n: 4, pitch: 0.0046, w: 0.0019, key: true },
  { pts: [[0.09, SE_TOP], [0.09, MCU_B]], n: 4, pitch: 0.0046, w: 0.0019, key: true },
  { pts: [[0.27, SE_TOP], [0.27, 0.02], [0.16, 0.13], [0.16, MCU_B]], n: 4, pitch: 0.0046, w: 0.0019, key: true },
  // the secure element chain
  ...[0, 1, 2].map((i): Route => ({ pts: [[SE_XY[i]![0] + SE_HALF_B + 0.004, -0.12], [SE_XY[i + 1]![0] - SE_HALF_B - 0.004, -0.12]], n: 3, pitch: 0.0046, w: 0.0019 })),
  // processor <-> memory: a wide parallel bus, and a second one with a 45° jog
  { pts: [[MCU_L, 0.445], [MEM.x + MEM.hx + 0.004, 0.445]], n: 12, pitch: 0.0042, w: 0.0017 },
  { pts: oct([MCU_L, 0.335], [MEM.x + MEM.hx + 0.004, 0.4], 'h', 0.6), n: 6, pitch: 0.0042, w: 0.0017 },
  // processor -> power
  { pts: oct([MCU_L, 0.27], [PMIC.x + PMIC.hx + 0.004, 0.225], 'h', 0.5), n: 4, pitch: 0.006, w: 0.0026 },
  { pts: oct([-0.3, 0.098], [-0.255, PMIC.y - PMIC.hy - 0.004], 'v', 0.5), n: 3, pitch: 0.0046, w: 0.0017 },
  // display connector: up the left edge from an inner layer
  { pts: [[-0.4, 0.02], [-0.4, -0.25], [-0.25, -0.4], [-0.25, -0.445]], n: 5, pitch: 0.0042, w: 0.0017, viaStart: true },
  // USB-C -> processor: a differential pair, length-matched with a serpentine, up the right edge
  { pts: [[0.02, -0.598], [0.02, -0.59], [0.035, -0.575], [0.33, -0.575], [0.4, -0.505], ...meander(0.4, -0.45, -0.28, 0.0085, 0.028), [0.4, 0.24], [0.33, 0.31], [MCU_R, 0.31]], n: 2, pitch: 0.0034, w: 0.0017 },
  // battery connector -> power rails into a via field
  { pts: [[0.23, -0.455], [0.23, -0.4], [0.16, -0.33]], n: 2, pitch: 0.012, w: 0.0065 },
  // crystal, and the small chip top right
  { pts: oct([0.335 - 0.036 - 0.004, 0.12], [MCU_R, 0.17], 'h', 0.5), n: 2, pitch: 0.006, w: 0.0017 },
  { pts: [[0.33, 0.495 - 0.004], [0.33, 0.47], [0.3, 0.44], [MCU_R, 0.44]], n: 4, pitch: 0.0046, w: 0.0017 },
];
/** Distance from a board point to the nearest bus (to its outer edge). */
export function routeDist(x: number, y: number): number {
  let best = 9;
  for (const r of ROUTES) {
    const half = ((r.n - 1) / 2) * r.pitch + r.w / 2 + (r.pts.length > 12 ? 0.0085 : 0);
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1]!, b = r.pts[i]!;
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
      best = Math.min(best, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t) - half);
    }
  }
  return best;
}

function layoutPassives(): Passive[] {
  const rnd = mulberry32(4242);
  const out: Passive[] = [];
  for (let iy = 0; iy < PGY; iy++) for (let ix = 0; ix < PGX; ix++) {
    const x = -BOARD.hx + (ix + 0.5) * PCELL, y = -BOARD.hy + (iy + 0.5) * PCELL;
    if (sdRR(x, y, BOARD.hx, BOARD.hy, BOARD.corner) > -0.03) continue;
    if (HOLES.some(([hx, hy]) => Math.hypot(x - hx, y - hy) < 0.045)) continue;
    const fd = Math.abs(sdRR(x - FENCE.x, y - FENCE.y, FENCE.hx, FENCE.hy, FENCE.r));
    if (fd < 0.02) continue;
    let dmin = 9, near: Chip | null = null;
    for (const c of CHIPS) { const d = chipDist(x, y, c); if (d < dmin) { dmin = d; near = c; } }
    if (dmin < 0.02) continue;
    if (routeDist(x, y) < 0.016) continue;
    // the board text strip along the bottom edge, and the secure zone's label
    if (y < -0.575 && Math.abs(x) > 0.1) continue;
    const p = dmin < 0.045 ? 0.82 : dmin < 0.09 ? 0.4 : 0.08;
    if (rnd() > p) continue;
    const small = rnd() < (dmin < 0.045 ? 0.35 : 0.6);
    const type = (small ? 3 : 1) + (rnd() < 0.35 ? 1 : 0);
    // perpendicular to the nearest package edge (decoupling caps line up along it)
    let rot = rnd() < 0.5 ? 1 : 0;
    if (near && dmin < 0.06) {
      const ex = Math.abs(x - near.x) - near.hx, ey = Math.abs(y - near.y) - near.hy;
      rot = ex > ey ? 0 : 1;
    }
    const L = PTYPE[type]![0], Wd = PTYPE[type]![1];
    const roomL = Math.max(0, (PCELL - L) / 2 - 0.0032), roomW = Math.max(0, (PCELL - Wd) / 2 - 0.0032);
    const jl = (rnd() - 0.5) * 2 * roomL * 0.6, jw = (rnd() - 0.5) * 2 * roomW * 0.5;
    out.push({ ix, iy, type, rot, dx: rot ? jw : jl, dy: rot ? jl : jw });
  }
  return out;
}
export const PASSIVES = layoutPassives();

/** The passives grid as a texture: R type/255, G, B offset ((v/255 - 0.5) * 0.01 du), A orientation. */
export function passTexture(): THREE.DataTexture {
  const d = new Uint8Array(PGX * PGY * 4);
  for (const p of PASSIVES) {
    const i = (p.iy * PGX + p.ix) * 4;
    d[i] = p.type; d[i + 1] = Math.round((p.dx / 0.01 + 0.5) * 255); d[i + 2] = Math.round((p.dy / 0.01 + 0.5) * 255); d[i + 3] = p.rot ? 255 : 0;
  }
  const tex = new THREE.DataTexture(d, PGX, PGY, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---- the painted material map
export const BTEX_W = 3584;
export const BTEX_S = BTEX_W / (2 * BOARD.hx); // px per du
export const BTEX_H = Math.round(2 * BOARD.hy * BTEX_S);
/** Parallel offset of a polyline (mitred joins), + to the left of travel. */
function offsetPath(pts: P2[], d: number): P2[] {
  const n = pts.length, out: P2[] = [];
  const nrm = (a: P2, b: P2): P2 => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      const m = i === 0 ? nrm(pts[0]!, pts[1]!) : nrm(pts[n - 2]!, pts[n - 1]!);
      out.push([pts[i]![0] + m[0] * d, pts[i]![1] + m[1] * d]);
      continue;
    }
    const a = nrm(pts[i - 1]!, pts[i]!), b = nrm(pts[i]!, pts[i + 1]!);
    const mx = a[0] + b[0], my = a[1] + b[1], ml = Math.hypot(mx, my) || 1;
    const k = d / ((mx / ml) * a[0] + (my / ml) * a[1]);
    out.push([pts[i]![0] + (mx / ml) * k, pts[i]![1] + (my / ml) * k]);
  }
  return out;
}
export type BoardPaint = { canvas: HTMLCanvasElement };

/** Paint the board's material map (once). */
export function paintBoard(): BoardPaint {
  const cv = document.createElement('canvas');
  cv.width = BTEX_W; cv.height = BTEX_H;
  const c = cv.getContext('2d')!;
  const S = BTEX_S;
  const X = (x: number) => (x + BOARD.hx) * S, Y = (y: number) => (BOARD.hy - y) * S;
  const rnd = mulberry32(77);
  c.fillStyle = '#000';
  c.fillRect(0, 0, BTEX_W, BTEX_H);
  const mode = (ch: 'R' | 'G' | 'B', v: number, clear = false) => {
    c.globalCompositeOperation = clear ? 'multiply' : 'lighter';
    const k = Math.round(v * 255);
    const col = clear ? (ch === 'R' ? `rgb(${255 - k},255,255)` : ch === 'G' ? `rgb(255,${255 - k},255)` : `rgb(255,255,${255 - k})`)
      : ch === 'R' ? `rgb(${k},0,0)` : ch === 'G' ? `rgb(0,${k},0)` : `rgb(0,0,${k})`;
    c.fillStyle = col; c.strokeStyle = col;
  };
  const rrect = (x: number, y: number, hx: number, hy: number, r: number) => { c.beginPath(); c.roundRect(X(x - hx), Y(y + hy), 2 * hx * S, 2 * hy * S, r * S); };
  const circle = (x: number, y: number, r: number) => { c.beginPath(); c.arc(X(x), Y(y), r * S, 0, Math.PI * 2); };
  const poly = (pts: P2[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); };
  c.lineCap = 'round'; c.lineJoin = 'round';

  // ---------------- routing (collected first: the pour needs their clearances)
  type Tr = { pts: P2[]; w: number };
  const traces: Tr[] = [];
  const vias: { x: number; y: number; r: number }[] = [];
  for (const r of ROUTES) {
    for (let i = 0; i < r.n; i++) traces.push({ pts: offsetPath(r.pts, (i - (r.n - 1) / 2) * r.pitch), w: r.w });
    // a bus that comes up from an inner layer starts at a row of vias
    if (r.viaStart) for (let i = 0; i < r.n; i++) { const q = offsetPath(r.pts, (i - (r.n - 1) / 2) * r.pitch)[0]!; vias.push({ x: q[0], y: q[1], r: 0.0026 }); }
  }
  const nearBus = (x: number, y: number, d: number) => routeDist(x, y) < d;
  // BGA fan-out: short escapes from every side of the substrate to a ring of vias
  {
    const sub = CHIPS[4]!;
    for (let s = 0; s < 4; s++) for (let i = 0; i < 18; i++) {
      const u = (i - 8.5) * 0.0118;
      if (rnd() < 0.2) continue;
      const out = 0.012 + (i % 3) * 0.008;
      const dia = (i % 2 ? 1 : -1) * 0.005;
      const pts: P2[] = s === 0 ? [[sub.x + u, sub.y - sub.hy], [sub.x + u, sub.y - sub.hy - out], [sub.x + u + dia, sub.y - sub.hy - out - Math.abs(dia)]]
        : s === 1 ? [[sub.x + u, sub.y + sub.hy], [sub.x + u, sub.y + sub.hy + out], [sub.x + u + dia, sub.y + sub.hy + out + Math.abs(dia)]]
        : s === 2 ? [[sub.x - sub.hx, sub.y + u], [sub.x - sub.hx - out, sub.y + u], [sub.x - sub.hx - out - Math.abs(dia), sub.y + u + dia]]
        : [[sub.x + sub.hx, sub.y + u], [sub.x + sub.hx + out, sub.y + u], [sub.x + sub.hx + out + Math.abs(dia), sub.y + u + dia]];
      const e = pts[2]!;
      if (nearBus(e[0], e[1], 0.008) || nearBus(pts[1]![0], pts[1]![1], 0.006)) continue;
      traces.push({ pts, w: 0.0015 });
      vias.push({ x: e[0], y: e[1], r: 0.0034 });
    }
  }
  // passives: a short stub from one pad to a via, 45° or straight
  for (const p of PASSIVES) {
    if (rnd() < 0.45) continue;
    const x = -BOARD.hx + (p.ix + 0.5) * PCELL + p.dx, y = -BOARD.hy + (p.iy + 0.5) * PCELL + p.dy;
    const L = PTYPE[p.type]![0];
    const s = rnd() < 0.5 ? -1 : 1;
    const a: P2 = p.rot ? [x, y + s * L / 2] : [x + s * L / 2, y];
    const len = 0.006 + rnd() * 0.01;
    const dg = rnd() < 0.5 ? (rnd() < 0.5 ? -1 : 1) : 0;
    const b: P2 = p.rot ? [a[0] + dg * len * 0.7, a[1] + s * len * (dg ? 0.7 : 1)] : [a[0] + s * len * (dg ? 0.7 : 1), a[1] + dg * len * 0.7];
    if (nearBus(b[0], b[1], 0.007) || CHIPS.some((ch) => chipDist(b[0], b[1], ch) < 0.012)) continue;
    traces.push({ pts: [a, b], w: 0.0017 });
    vias.push({ x: b[0], y: b[1], r: 0.003 });
  }
  // stitching vias along the board edge and a guard ring round the fence (gaps where buses cross)
  {
    const n = 170;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const hx = BOARD.hx - 0.012, hy = BOARD.hy - 0.012, r = BOARD.corner - 0.012;
      const dx = Math.cos(a), dy = Math.sin(a);
      let lo = 0, hi = 2;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (sdRR(dx * m, dy * m, hx, hy, r) < 0) lo = m; else hi = m; }
      const x = dx * lo, y = dy * lo;
      if (HOLES.some(([qx, qy]) => Math.hypot(x - qx, y - qy) < 0.035)) continue;
      if (Math.abs(y + 0.66) < 0.06 && Math.abs(x) < 0.11) continue;
      if (y > 0.62 && Math.abs(x) < 0.21) continue;
      if (nearBus(x, y, 0.007)) continue;
      vias.push({ x, y, r: 0.0034 });
    }
    const f = FENCE, g = 0.016;
    const ax = 2 * (f.hx + g), ay = 2 * (f.hy + g), per = 2 * (ax + ay);
    const m = Math.floor(per / 0.013);
    for (let i = 0; i < m; i++) {
      let s = (i / m) * per;
      let x: number, y: number;
      if (s < ax) { x = -f.hx - g + s; y = f.y + f.hy + g; }
      else if ((s -= ax) < ay) { x = f.hx + g; y = f.y + f.hy + g - s; }
      else if ((s -= ay) < ax) { x = f.hx + g - s; y = f.y - f.hy - g; }
      else { s -= ax; x = -f.hx - g; y = f.y - f.hy - g + s; }
      if (Math.abs(Math.abs(x) - f.hx - g) < 0.004 && Math.abs(Math.abs(y - f.y) - f.hy - g) < 0.004) continue;
      if (nearBus(x, y, 0.009)) continue;
      vias.push({ x, y, r: 0.003 });
    }
  }
  // a few via fields (ground) in the open areas
  for (const [cx, cy, nx, ny] of [[0.3, 0.36, 3, 6], [-0.13, 0.31, 3, 3], [0.1, -0.33, 9, 2], [-0.3, -0.33, 3, 3], [0.06, 0.6, 7, 2]] as [number, number, number, number][])
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = cx + (i - (nx - 1) / 2) * 0.012, y = cy + (j - (ny - 1) / 2) * 0.012;
      if (!nearBus(x, y, 0.008) && !CHIPS.some((ch) => chipDist(x, y, ch) < 0.01)) vias.push({ x, y, r: 0.003 });
    }


  // ---------------- pads (gold)
  type Pad = { x: number; y: number; hx: number; hy: number; r: number };
  const pads: Pad[] = [];
  for (const ch of CHIPS) {
    if (ch.leads === 'qfn' || ch.leads === 'sop') {
      const pitch = 0.0094, ext = 0.0045, pl = 0.009, pw = 0.0024;
      const sides = ch.leads === 'qfn' ? [0, 1, 2, 3] : [0, 1];
      for (const s of sides) {
        const along = s < 2 ? ch.hx : ch.hy;
        const n = Math.floor((2 * along - 0.02) / pitch);
        for (let i = 0; i < n; i++) {
          const u = (i - (n - 1) / 2) * pitch;
          if (s === 0) pads.push({ x: ch.x + u, y: ch.y - ch.hy + ext - pl / 2 + 0.002, hx: pw / 2, hy: pl / 2, r: pw / 2 });
          if (s === 1) pads.push({ x: ch.x + u, y: ch.y + ch.hy - ext + pl / 2 - 0.002, hx: pw / 2, hy: pl / 2, r: pw / 2 });
          if (s === 2) pads.push({ x: ch.x - ch.hx + ext - pl / 2 + 0.002, y: ch.y + u, hx: pl / 2, hy: pw / 2, r: pw / 2 });
          if (s === 3) pads.push({ x: ch.x + ch.hx - ext + pl / 2 - 0.002, y: ch.y + u, hx: pl / 2, hy: pw / 2, r: pw / 2 });
        }
      }
    }
    if (ch.kind === K_CONN) {
      const n = Math.floor((2 * ch.hx - 0.02) / 0.0075);
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) pads.push({ x: ch.x + (i - (n - 1) / 2) * 0.0075, y: ch.y + s * (ch.hy + 0.006), hx: 0.0016, hy: 0.0055, r: 0.0012 });
      for (const s of [-1, 1]) pads.push({ x: ch.x + s * (ch.hx + 0.008), y: ch.y, hx: 0.005, hy: 0.012, r: 0.002 });
    }
    if (ch.ref === 'J3') for (const s of [-1, 1]) pads.push({ x: ch.x + s * (ch.hx + 0.01), y: ch.y + 0.01, hx: 0.008, hy: 0.018, r: 0.003 });
  }
  for (const p of PASSIVES) {
    const [L, Wd] = PTYPE[p.type]!;
    const x = -BOARD.hx + (p.ix + 0.5) * PCELL + p.dx, y = -BOARD.hy + (p.iy + 0.5) * PCELL + p.dy;
    const cl = L * 0.3 + 0.0015, cw = Wd / 2 + 0.0012;
    for (const s of [-1, 1]) {
      const o = s * (L / 2 - L * 0.15 + 0.0008);
      pads.push(p.rot ? { x, y: y + o, hx: cw, hy: cl / 2, r: 0.0006 } : { x: x + o, y, hx: cl / 2, hy: cw, r: 0.0006 });
    }
  }
  // test points and fiducials
  const tps: [number, number][] = [[-0.36, 0.3], [-0.36, 0.26], [0.2, -0.3], [0.24, -0.3], [0.28, -0.3], [-0.12, -0.3], [0.38, 0.62 - 0.1], [-0.1, 0.56], [-0.06, 0.56]];
  const fids: [number, number][] = [[-0.39, 0.52], [0.39, -0.52], [-0.39, -0.52]];

  // ---------------- R: copper under the mask: the ground pour, cleared round everything, then traces
  mode('R', 0.42);
  rrect(0, 0, BOARD.hx - 0.012, BOARD.hy - 0.012, BOARD.corner - 0.012); c.fill();
  mode('R', 1, true);
  for (const t of traces) { c.lineWidth = (t.w + 0.0055) * S; poly(t.pts); c.stroke(); }
  for (const v of vias) { circle(v.x, v.y, v.r + 0.003); c.fill(); }
  for (const p of pads) { rrect(p.x, p.y, p.hx + 0.0028, p.hy + 0.0028, p.r + 0.002); c.fill(); }
  for (const [x, y] of fids) { circle(x, y, 0.016); c.fill(); }
  for (const [x, y] of HOLES) { circle(x, y, HOLE_R + 0.012); c.fill(); }
  // a hatched keep-out under the secure elements' antenna-free strip (reads as a finer texture)
  mode('R', 1);
  for (const t of traces) { c.lineWidth = t.w * S; poly(t.pts); c.stroke(); }
  // under the fence: its copper footprint
  c.lineWidth = (FENCE.t * 2 + 0.004) * S;
  rrect(FENCE.x, FENCE.y, FENCE.hx, FENCE.hy, FENCE.r); c.stroke();
  for (const v of vias) { circle(v.x, v.y, v.r); c.fill(); }
  // via holes (tented): a dimple in the ring
  mode('R', 0.55, true);
  for (const v of vias) { circle(v.x, v.y, v.r * 0.5); c.fill(); }

  // ---------------- G: gold (ENIG) pads, test points, fiducials, mounting rings
  mode('G', 1);
  for (const p of pads) { rrect(p.x, p.y, p.hx, p.hy, p.r); c.fill(); }
  for (const [x, y] of tps) { circle(x, y, 0.0075); c.fill(); }
  for (const [x, y] of fids) { circle(x, y, 0.0055); c.fill(); }
  for (const [x, y] of HOLES) { circle(x, y, HOLE_R + 0.007); c.fill(); }
  // the fence's solder land
  c.lineWidth = (FENCE.t * 2 + 0.0016) * S;
  rrect(FENCE.x, FENCE.y, FENCE.hx, FENCE.hy, FENCE.r); c.stroke();
  // thermal pads under the QFNs peek out between the leads: no; the SE ground tabs at the corners
  for (const [x, y] of SE_XY) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { rrect(x + sx * (SE_HALF_B + 0.0005), y + sy * (SE_HALF_B + 0.0005), 0.0035, 0.0035, 0.001); c.fill(); }
  // gold edge contacts for the test jig along the top edge
  for (let i = 0; i < 10; i++) { rrect(-0.18 + i * 0.022, 0.655, 0.0065, 0.018, 0.002); c.fill(); }

  // ---------------- B: silkscreen hairlines and refdes
  mode('B', 1);
  const hair = 0.0011;
  c.lineWidth = hair * S;
  const corner = (x: number, y: number, hx: number, hy: number, arm: number) => {
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * hx, cy = y + sy * hy;
      c.moveTo(X(cx - sx * arm), Y(cy)); c.lineTo(X(cx), Y(cy)); c.lineTo(X(cx), Y(cy - sy * arm));
    }
    c.stroke();
  };
  const txt = (s: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left', weight = 500) => {
    c.font = font(F.mono(weight), size * S);
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(s, X(x), Y(y));
  };
  for (const ch of CHIPS) {
    if (ch.kind === K_EPOXY && ch.ref === '') continue;
    const m = ch.kind === K_SE ? 0.012 : 0.01;
    corner(ch.x, ch.y, ch.hx + m, ch.hy + m, Math.min(ch.hx, ch.hy) * 0.35);
    if (ch.leads === 'qfn' || ch.kind === K_SE) { circle(ch.x - ch.hx - m - 0.005, ch.y + ch.hy + m + 0.005, 0.0024); c.fill(); }
    const lx = ch.kind === K_SE ? ch.x : ch.x - ch.hx - m, ly = ch.kind === K_SE ? ch.y - ch.hy - 0.024 : ch.y + ch.hy + m + 0.012;
    txt(ch.ref, lx, ly, ch.kind === K_SE ? 0.013 : 0.012, ch.kind === K_SE ? 'center' : 'left', 600);
  }
  // refdes on a scatter of passives
  let nc = 1, nr = 1;
  for (const p of PASSIVES) {
    if (rnd() > 0.16) continue;
    const x = -BOARD.hx + (p.ix + 0.5) * PCELL, y = -BOARD.hy + (p.iy + 0.5) * PCELL;
    const cap = p.type === 1 || p.type === 3;
    txt(cap ? `C${nc++ + 100}` : `R${nr++ + 20}`, x, y + (p.rot ? 0 : -0.0105), 0.0052, 'center', 500);
  }
  // the secure zone: a label on the fence, and a dashed hairline inside it
  txt('SECURE ZONE  ·  4 × SE  ·  EAL 6+', FENCE.x - FENCE.hx + 0.012, FENCE.y + FENCE.hy - 0.012, 0.0085, 'left', 600);
  c.setLineDash([0.006 * S, 0.004 * S]);
  rrect(FENCE.x, FENCE.y, FENCE.hx - 0.008, FENCE.hy - 0.008, FENCE.r - 0.008); c.stroke();
  c.setLineDash([]);
  // board marks
  txt('ONEKEY PRO 2', -0.36, -0.6, 0.018, 'left', 700);
  txt('MAIN BOARD  REV A3  ·  2426', -0.36, -0.625, 0.0085, 'left', 500);
  txt('KEYS STAY HERE', 0.36, -0.6, 0.0105, 'right', 600);
  txt('94V-0  ▲  E1', 0.36, -0.622, 0.0075, 'right', 500);
  for (const [x, y] of tps) txt(`TP${Math.round((x + 1) * 7 + (y + 1) * 3)}`, x + 0.011, y, 0.0048, 'left');
  // board outline hairline
  c.lineWidth = hair * S;
  rrect(0, 0, BOARD.hx - 0.006, BOARD.hy - 0.006, BOARD.corner - 0.006); c.stroke();
  // component outlines of the connectors and the USB-C
  for (const ch of CHIPS.filter((k) => k.kind === K_CONN || k.kind === K_METAL)) { rrect(ch.x, ch.y, ch.hx + 0.014, ch.hy + 0.014, 0.004); c.stroke(); }

  c.globalCompositeOperation = 'source-over';
  return { canvas: cv };
}

export function boardTexture(p: BoardPaint): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(p.canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

// ---- the battery's label: G = the black label film, R = its white print (a made-up label, no specs)
export function paintBattery(): THREE.CanvasTexture {
  const w = 1024, h = 1280;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgb(0,255,0)';
  c.beginPath(); c.roundRect(46, 70, w - 92, h - 180, 18); c.fill();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgb(255,0,0)'; c.strokeStyle = 'rgb(255,0,0)';
  const t = (s: string, x: number, y: number, px: number, wt = 500) => { c.font = font(F.mono(wt), px); c.fillText(s, x, y); };
  c.lineWidth = 2;
  c.strokeRect(96, 120, w - 192, h - 280);
  t('Li-ion POLYMER', 140, 220, 64, 700);
  t('RECHARGEABLE CELL', 140, 280, 34, 500);
  c.beginPath(); c.moveTo(140, 320); c.lineTo(w - 140, 320); c.stroke();
  t('OneKey Pro 2', 140, 400, 44, 600);
  t('PACK  OKP2-B1   LOT 2426A', 140, 460, 26);
  t('DO NOT PUNCTURE · DO NOT HEAT', 140, 520, 26);
  t('DO NOT SHORT CIRCUIT', 140, 560, 26);
  // a barcode and hairline icons
  const rnd = mulberry32(9);
  let x = 140;
  while (x < 640) { const bw = 3 + Math.floor(rnd() * 3) * 3; if (rnd() > 0.35) c.fillRect(x, 640, bw, 160); x += bw + 3 + Math.floor(rnd() * 3) * 3; }
  t('0 426 1133 0271 8', 140, 840, 24);
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(720 + i * 90, 720, 32, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(692, 692); c.lineTo(748, 748); c.moveTo(748, 692); c.lineTo(692, 748); c.stroke();
  t('+', 800, 735, 40, 600); t('Li', 882, 732, 30, 600);
  t('MADE FOR ONEKEY', 140, h - 200, 24);
  // the two terminal tabs (bare metal: no film)
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000';
  c.fillRect(w * 0.3, 0, 90, 70); c.fillRect(w * 0.6, 0, 90, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

// ---- lid markings
export const LID = { cell: 640, cols: 4, rows: 2 };
/**
 * The package lids' laser markings. Draw into a cell with `draw(i, fn)`: fn gets the context set up in
 * lid units (the package's longer side = 100 units, origin top-left, y down) and the lid's width and
 * height in those units. Fill with `LidAtlas.ETCH` for the laser etch, `LidAtlas.GLOW` for etch that
 * glows green (from the die) when its secure element is lit.
 */
export class LidAtlas {
  static ETCH = 'rgb(255,0,0)';
  static GLOW = 'rgb(255,255,0)';
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  dirty = true;
  constructor() {
    this.canvas.width = LID.cell * LID.cols; this.canvas.height = LID.cell * LID.rows;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = 1;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let i = 0; i < LID.cols * LID.rows; i++) this.draw(i, (c, w, h) => defaultLid(c, i, w, h));
  }
  /** Size of cell i's lid in lid units. */
  size(i: number): [number, number] {
    const ch = CHIPS.find((k) => k.cell === i)!;
    const m = Math.max(ch.hx, ch.hy);
    return [(100 * ch.hx) / m, (100 * ch.hy) / m];
  }
  draw(i: number, fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = this.ctx, s = LID.cell;
    const col = i % LID.cols, row = Math.floor(i / LID.cols);
    const [w, h] = this.size(i);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(col * s, row * s, s, s);
    c.beginPath(); c.rect(col * s, row * s, s, s); c.clip();
    c.setTransform(s / w, 0, 0, s / h, col * s, row * s);
    c.globalCompositeOperation = 'lighter';
    fn(c, w, h);
    c.restore();
    this.dirty = true;
  }
  upload() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; } return this.tex; }
}

/** The factory markings (made-up part codes, no real brands). */
export function defaultLid(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
  c.fillStyle = LidAtlas.ETCH;
  const mono = (wt: number, px: number) => font(F.mono(wt), px);
  const dot = (x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  if (i < 4) {
    dot(12, 12, 4.2);
    c.font = mono(500, 7.5);
    c.fillText(`OK-SE${i + 1}  A7`, 12, h - 20);
    c.fillText('2426  TW  E6+', 12, h - 10);
  } else if (i === 4) {
    dot(10, 10, 3.2);
    c.font = mono(600, 11);
    c.fillText('OK-X2', 16, 44);
    c.font = mono(500, 7);
    c.fillText('M-SEC  1.2GHz', 16, 58);
    c.fillText('2426  A3  TW', 16, 69);
  } else if (i === 5) {
    c.font = mono(600, 10);
    c.fillText('KM8G', 10, 30);
    c.font = mono(500, 7);
    c.fillText('LP 8Gb  2418', 10, 44);
    dot(8, h - 8, 2.5);
  } else if (i === 6) {
    dot(12, 12, 6);
    c.font = mono(600, 17);
    c.fillText('P21', 14, 58);
    c.font = mono(500, 12);
    c.fillText('4A7', 14, 78);
  } else {
    // connector top: a row of gold contacts either side (R = metal on a connector)
    const n = 26;
    for (let k = 0; k < n; k++) {
      const x = 4 + (k + 0.5) * ((w - 8) / n);
      c.fillRect(x - 0.7, 1, 1.4, h * 0.2);
      c.fillRect(x - 0.7, h * 0.8 - 1, 1.4, h * 0.2);
    }
  }
}

/** GLSL constants for the board: packages, fence, holes, passives, texture scale. */
export function boardGLSL(f4: (x: number) => string): string {
  const v4 = (a: number, b: number, c: number, d: number) => `vec4(${f4(a)}, ${f4(b)}, ${f4(c)}, ${f4(d)})`;
  const v2 = (x: number, y: number) => `vec2(${f4(x)}, ${f4(y)})`;
  // everything unrolled with literal constants: SwiftShader rebuilds a const array on every dynamic index
  const sdf = CHIPS.map((k) => `  c = min(c, sdBox3(vec3(xy - ${v2(k.x, k.y)}, qz - ${f4(k.h / 2)}), vec3(${f4(k.hx - k.r)}, ${f4(k.hy - k.r)}, ${f4(k.h / 2 - k.r)})) - ${f4(k.r)});`).join('\n');
  const ao = CHIPS.map((k) => `  ao *= 1.0 - 0.7 * exp(-max(sdRoundRect(xy - ${v2(k.x, k.y)}, ${v2(k.hx, k.hy)}, 0.003), 0.0) / ${f4(0.35 * k.h + 0.0015)});`).join('\n');
  const at = CHIPS.map((k) => `  d = sdBox3(vec3(xy - ${v2(k.x, k.y)}, qz - ${f4(k.h / 2)}), vec3(${f4(k.hx)}, ${f4(k.hy)}, ${f4(k.h / 2)})); if (d < bd) { bd = d; a = ${v4(k.x, k.y, k.hx, k.hy)}; b = ${v4(k.h, k.kind, k.cell, k.r)}; }`).join('\n');
  return `
const vec2 BH = vec2(${f4(BOARD.hx)}, ${f4(BOARD.hy)});
const float BCORNER = ${f4(BOARD.corner)}, BCY = ${f4(BOARD.cy)}, BTH = ${f4(BOARD.th)}, BHMAX = ${f4(BOARD_HMAX)};
const vec4 FEN = ${v4(FENCE.x, FENCE.y, FENCE.hx, FENCE.hy)};
const vec3 FEN2 = vec3(${f4(FENCE.r)}, ${f4(FENCE.t)}, ${f4(FENCE.h)});
const float HOLER = ${f4(HOLE_R)};
const float PCELL = ${f4(PCELL)};
const ivec2 PGRID = ivec2(${PGX}, ${PGY});
const vec2 BTEXEL = vec2(${f4(1 / BTEX_W)}, ${f4(1 / BTEX_H)});
const vec2 LIDG = vec2(${LID.cols}.0, ${LID.rows}.0);
float holesSDF(vec2 xy) { return HOLER - min(min(length(xy - ${v2(...HOLES[0]!)}), length(xy - ${v2(...HOLES[1]!)})), min(length(xy - ${v2(...HOLES[2]!)}), length(xy - ${v2(...HOLES[3]!)}))); }
float chipsSDF(vec2 xy, float qz) {
  float c = 1e3;
${sdf}
  return c;
}
float chipsAO(vec2 xy) {
  float ao = 1.0;
${ao}
  return ao;
}
void chipAt(vec2 xy, float qz, out vec4 a, out vec4 b, out float bd) {
  float d; bd = 1e3; a = vec4(0.0); b = vec4(0.0);
${at}
}
vec3 ptSize(int t) { return ${PTYPE.slice(1).map(([l, w, h], i) => `t == ${i + 1} ? vec3(${f4(l / 2)}, ${f4(w / 2)}, ${f4(h / 2)}) : `).join('')}vec3(0.0); }
`;
}
