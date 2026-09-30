// The OneKey Pro 2 as a 3D object, shared by every plate that shows the real device (docs/TREATMENT.md,
// 实物). A raymarched SDF of the slab from the proportions in _motifs DEVICE (53.1 × 84.9 × 6.2 mm):
// fully rounded edges, a polished metal band, black cover glass with a near-borderless display (no
// front camera), and a frosted back with the "1O" mark and the camera ring. `explode` pulls it apart
// along its thickness into cover glass, display, main board (four secure elements, `se` lights each),
// battery, frame and back glass.
//
// Usage: `dev.render(renderer, pose)` draws into `dev.rt` with a transparent background (premultiplied);
// composite it with `comp.draw(renderer, dev.rt.texture, out)`. Draw the screen's content into
// `dev.screen` (a Layer2D the size of the display, SCREEN px) before rendering and set `pose.screen`.
// `dev.project(pose, [x, y, z])` gives a device-space point's position in logical px (for labels).
//
// Device space: x right, y up, z out of the display (units: device widths). World lights are fixed, so
// highlights travel over the device as it turns; the key light and the sweep bar follow the camera.
import * as THREE from 'three';
import { FSPass, Layer2D, W, H, SS_TAP, SS_TAP_GLSL, makeRT, clearRT } from '../engine/gl';
import { DEVICE, KEY } from './_motifs';
import { BOARD, SE_H, LidAtlas, boardGLSL, boardTexture, paintBattery, paintBoard, passTexture } from './_board';

export type V3 = [number, number, number];
export type DevicePose = {
  cam: V3;
  tgt: V3;
  fov: number;
  /** Device centre (world), rotation (radians: yaw about y, pitch about x, roll about z; applied roll, pitch, yaw), scale. */
  pos?: V3;
  rot?: V3;
  scale?: number;
  /** Sweep bar across the camera's view (-1.5..1.5, off beyond), mark glint 0..1, display brightness 0..1. */
  sweep?: number;
  glint?: number;
  screen?: number;
  /** 0 assembled .. 1 fully exploded; part visibility (cover, display, board, battery, frame, back). */
  explode?: number;
  /** Extra lift of the cover glass and display above the board (device units), to open the stack up. */
  lift?: number;
  show?: [number, number, number, number, number, number];
  /** Glow of each of the four secure elements, 0..1. */
  se?: [number, number, number, number];
  /** Extra z offset of each part (device units), on top of `explode` (staggered, overshooting separations). */
  offs?: [number, number, number, number, number, number];
  /** Overall brightness. */
  gain?: number;
};

const D = DEVICE;
/** Display bezel (device units) and the display's size. */
export const BEZEL = 0.032;
export const SCREEN_DU = { w: D.w - 2 * BEZEL, h: D.h - 2 * BEZEL, r: D.corner - BEZEL };
/** Screen layer size in logical px. */
export const SCREEN = { w: 560, h: Math.round((560 * SCREEN_DU.h) / SCREEN_DU.w) };
/** Secure element centres on the main board (device units) and half size. */
export const SE_POS: [number, number][] = [[-0.27, -0.12], [-0.09, -0.12], [0.09, -0.12], [0.27, -0.12]];
export const SE_HALF = 0.058;
/** Explode offsets along z (device units at explode = 1): cover, display, board, battery, frame, back. */
export const EXPLODE_Z = [0.84, 0.56, 0.28, -0.28, 0, -0.56];
/** z of the top face of each part when assembled. */
const TH = D.t / 2;
export const PART_Z = [TH, TH - 0.012, 0.012, -0.012, TH, -TH + 0.012];

const f4 = (x: number) => x.toFixed(5);
const v2 = (x: number, y: number) => `vec2(${f4(x)}, ${f4(y)})`;
// the "1O" mark on the back, seen from behind (x mirrored in device space)
const MK = D.mark.h / KEY.height;
const onePoly = KEY.one.map(([x, y]) => v2(-(x - KEY.centre.x) * MK - D.mark.x, -(y - KEY.centre.y) * MK + D.mark.y));
const ringC = v2(-(KEY.ring.cx - KEY.centre.x) * MK - D.mark.x, -(KEY.ring.cy - KEY.centre.y) * MK + D.mark.y);

const FRAG = (parts: boolean) => /* glsl */ `
${parts ? '#define PARTS' : ''}
${SS_TAP_GLSL}
uniform vec3 camPos, camTgt, devPos;
uniform mat3 devRot; // world -> device
uniform float fov, devScale, sweep, glint, screenOn, explode, lift, gain, reach;
uniform float show[6];
uniform vec4 se;
uniform sampler2D screenTex;
#ifdef PARTS
uniform sampler2D boardTex, passTex, lidTex, batTex;
uniform float pOff[6];
#endif

const vec2 HALF = vec2(${f4(D.w / 2)}, ${f4(D.h / 2)});
const float TH = ${f4(TH)}, CORNER = ${f4(D.corner)}, RE = 0.046;
const vec2 SHALF = vec2(${f4(SCREEN_DU.w / 2)}, ${f4(SCREEN_DU.h / 2)});
const float SCORNER = ${f4(SCREEN_DU.r)};
const float EZ[6] = float[6](${EXPLODE_Z.map(f4).join(', ')});
const vec2 SEP[4] = vec2[4](${SE_POS.map(([x, y]) => v2(x, y)).join(', ')});
const float SEH = ${f4(SE_HALF)};

vec3 fw, rt, up; // camera basis
vec3 gPw; // the world point being shaded
float gMinR, gMinT, gMinId; // the march's closest approach (distance / t), where, and to what

float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// a rounded-rect plate of half thickness th, its edges rounded by re (re <= th)
float sdPlate(vec3 p, vec2 hs, float corner, float th, float re) {
  float d2 = sdRoundRect(p.xy, hs - re, max(corner - re, 0.0));
  vec2 w = vec2(d2, abs(p.z) - (th - re));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - re;
}

#ifdef PARTS
${boardGLSL(f4)}
// ---- parts (ids: 0 cover, 1 display, 2 board, 3 chip, 4 battery, 5 frame, 6 back, 9 whole device)
float zOff(int i) { return (i == 0 ? ${f4(EXPLODE_Z[0]!)} : i == 1 ? ${f4(EXPLODE_Z[1]!)} : i == 2 ? ${f4(EXPLODE_Z[2]!)} : i == 3 ? ${f4(EXPLODE_Z[3]!)} : i == 4 ? ${f4(EXPLODE_Z[4]!)} : ${f4(EXPLODE_Z[5]!)}) * explode + (i < 2 ? lift : 0.0) + pOff[i]; }
// the display's flex: a U-bend round the display's bottom edge and a tail back under it to its connector
const float FLX = -0.2, FLR = 0.0055, FLT = 0.0011, FLW = 0.058;
float sdFlex(vec3 p) {
  float yc = -SHALF.y - 0.006, zc = TH - 0.018 + zOff(1) - 0.006 - FLT - FLR;
  vec3 f = p - vec3(FLX, yc, zc);
  float arc = max(abs(length(f.yz) - FLR) - FLT, f.y);
  float top = sdBox(f.yz - vec2(0.02, FLR), vec2(0.02, FLT));
  float L = 0.29;
  float bot = sdBox(f.yz - vec2(L * 0.5, -FLR), vec2(L * 0.5, FLT));
  float d = max(min(arc, min(top, bot)), abs(f.x) - FLW);
  // the board-to-board plug at its end
  return min(d, sdBox3(f - vec3(0.0, L - 0.02, -FLR - 0.0045), vec3(FLW + 0.008, 0.022, 0.0035)) - 0.001);
}
vec2 mapParts(vec3 p, bool noCover) {
  vec2 r = vec2(1e3, -1.0);
  float d;
  if (show[0] > 0.5 && !noCover) { d = sdPlate(p - vec3(0, 0, TH - 0.006 + zOff(0)), HALF - 0.004, CORNER - 0.004, 0.006, 0.005); if (d < r.x) r = vec2(d, 0.0); }
  if (show[1] > 0.5) {
    d = sdPlate(p - vec3(0, 0, TH - 0.018 + zOff(1)), SHALF + 0.008, SCORNER + 0.008, 0.006, 0.003); if (d < r.x) r = vec2(d, 1.0);
    d = sdFlex(p); if (d < r.x) r = vec2(d, 8.0);
  }
  if (show[2] > 0.5) {
    vec3 q = p - vec3(0, BCY, 0.006 + zOff(2));
    d = sdPlate(q, BH, BCORNER, BTH, 0.0015);
    d = max(d, holesSDF(q.xy));
    if (d < r.x) r = vec2(d, 2.0);
    float qz = q.z - BTH;
    if (qz < BHMAX + 0.004 && abs(q.x) < BH.x + 0.01 && abs(q.y) < BH.y + 0.01) {
    // the packages (boxes with rounded edges) and the stamped fence round the secure zone
    float c = chipsSDF(q.xy, qz);
    float fw = abs(sdRoundRect(q.xy - FEN.xy, FEN.zw, FEN2.x)) - FEN2.y;
    c = min(c, max(fw, abs(qz - FEN2.z * 0.5) - FEN2.z * 0.5));
    if (c < r.x) r = vec2(c, 3.0);
    // passives: one box per grid cell, looked up in the layout texture; bounded by the cell's walls
    vec2 g = (q.xy + BH) / PCELL;
    vec4 pc = texelFetch(passTex, clamp(ivec2(floor(g)), ivec2(0), PGRID - 1), 0);
    int ty = int(pc.x * 255.0 + 0.5);
    vec2 lc = (fract(g) - 0.5) * PCELL - (pc.yz - 0.5) * 0.01;
    if (pc.w > 0.5) lc = lc.yx;
    vec3 hs = ptSize(ty);
    float dpb = ty > 0 ? sdBox3(vec3(lc, qz - hs.z), hs - 0.0007) - 0.0007 : 1e3;
    vec2 cw = (0.5 - abs(fract(g) - 0.5)) * PCELL;
    // (the cell walls only bound the march inside the thin layer the passives occupy)
    float dp = max(max(abs(qz - 0.0038) - 0.0038, sdRoundRect(q.xy, BH, BCORNER)), min(dpb, min(cw.x, cw.y) + 0.003));
    if (dp < r.x) r = vec2(dp, 7.0);
    } else {
      // outside that box the parts are at least this far away; without it the board's own distance
      // overshoots the packages from above and rays land inside them (their tops spilled over their sides)
      float bb = max(max(qz - BHMAX, max(abs(q.x) - BH.x - 0.01, abs(q.y) - BH.y - 0.01)), 0.003);
      if (bb < r.x) r = vec2(bb, 2.0);
    }
  }
  if (show[3] > 0.5) { d = sdPlate(p - vec3(0, -0.06, -0.018 + zOff(3)), vec2(0.4, 0.5), 0.06, 0.016, 0.01); if (d < r.x) r = vec2(d, 4.0); }
  if (show[4] > 0.5) {
    vec3 q = p - vec3(0, 0, zOff(4));
    d = max(sdPlate(q, HALF, CORNER, TH, RE), -sdRoundRect(q.xy, HALF - 0.03, CORNER - 0.03));
    if (d < r.x) r = vec2(d, 5.0);
  }
  if (show[5] > 0.5) { d = sdPlate(p - vec3(0, 0, -TH + 0.006 + zOff(5)), HALF - 0.004, CORNER - 0.004, 0.006, 0.005); if (d < r.x) r = vec2(d, 6.0); }
  return r;
}
#endif
vec2 mapDev(vec3 p, bool noCover) {
#ifdef PARTS
  return mapParts(p, noCover);
#else
  return vec2(sdPlate(p, HALF, CORNER, TH, RE), 9.0);
#endif
}
vec3 toDev(vec3 pw) { return devRot * (pw - devPos) / devScale; }
vec2 map(vec3 pw, bool noCover) { vec2 r = mapDev(toDev(pw), noCover); r.x *= devScale; return r; }
vec3 normalAt(vec3 pw, bool noCover) {
  // tetrahedral differences: four map() calls instead of six
  const vec2 k = vec2(1.0, -1.0);
  float h = 0.0005 * devScale;
  return normalize(k.xyy * map(pw + k.xyy * h, noCover).x + k.yyx * map(pw + k.yyx * h, noCover).x + k.yxy * map(pw + k.yxy * h, noCover).x + k.xxx * map(pw + k.xxx * h, noCover).x);
}

// ---- the studio. Sharp version for polished surfaces: a big top softbox, a tall strip left, a thin rim
// right (world-fixed); a large panel behind the camera with one diagonal edge and the sweep bar
// (camera-relative), so glossy faces towards the camera always mirror something.
vec3 env(vec3 r) {
  float top = smoothstep(0.5, 0.62, r.y) * smoothstep(0.75, 0.6, abs(r.x + 0.15)) * smoothstep(0.8, 0.6, abs(r.z + 0.05));
  // a real softbox falls off from its centre: flat metal mirrors a gradient, not a white slab
  top *= 0.25 + 0.75 * exp(-(r.x + 0.15) * (r.x + 0.15) * 9.0 - (r.z + 0.05) * (r.z + 0.05) * 7.0);
  float left = smoothstep(-0.78, -0.86, r.x) * smoothstep(0.55, 0.45, abs(r.y - 0.1)) * smoothstep(-0.3, 0.1, r.z);
  float rim = smoothstep(0.9, 0.95, r.x) * smoothstep(0.5, 0.35, abs(r.y));
  float a = dot(r, rt), b = dot(r, up), c = -dot(r, fw);
  float bar = smoothstep(0.09, 0.03, abs(a - sweep)) * smoothstep(-0.2, 0.3, c) * smoothstep(0.9, 0.5, abs(b));
  float e = (a + 0.38) + (b + 0.08) * 1.3;
  float panel = smoothstep(0.3, 0.6, c) * smoothstep(0.03, -0.03, e) * smoothstep(-0.9, -0.3, e) * smoothstep(-0.9, -0.4, a);
  float amb = mix(0.012, 0.05, smoothstep(-0.6, 0.8, r.y));
  return vec3(0.93, 1.0, 0.96) * (top * 3.0 + left * 1.6 + rim * 2.0 + bar * 3.5 + panel * 0.9 + amb);
}
// The same lights seen through a rough surface: wide lobes (k: 1 for a sheen, lower is broader).
vec3 envRough(vec3 r, float k) {
  float top = pow(max(dot(r, normalize(vec3(-0.15, 1.0, -0.05))), 0.0), 5.0 * k) * 1.4;
  float left = pow(max(dot(r, normalize(vec3(-1.0, 0.1, 0.2))), 0.0), 7.0 * k) * 0.7;
  float rim = pow(max(dot(r, vec3(1.0, 0.0, 0.0)), 0.0), 9.0 * k) * 0.6;
  vec3 key = normalize(-fw - rt * 0.55 + up * 0.45);
  float kl = pow(max(dot(r, key), 0.0), 4.0 * k) * 0.5;
  // a soft hotspot just off the lens axis: the blurred highlight a frosted face shows head-on
  vec3 hot = normalize(-fw - rt * 0.14 + up * 0.12);
  kl += pow(max(dot(r, hot), 0.0), 40.0 * k) * 1.2;
  vec3 sw = normalize(rt * sweep - fw * sqrt(max(1.0 - sweep * sweep, 0.05)));
  float bar = pow(max(dot(r, sw), 0.0), 14.0 * k) * 2.2 * step(abs(sweep), 1.4);
  float amb = mix(0.02, 0.06, smoothstep(-0.6, 0.8, r.y));
  return vec3(0.93, 1.0, 0.96) * (top + left + rim + kl + bar + amb);
}

// ---- the "1O" mark
float sdPoly6(vec2 p) {
  vec2 v[6] = vec2[6](${onePoly.join(', ')});
  float d = dot(p - v[0], p - v[0]); float s = 1.0;
  for (int i = 0, j = 5; i < 6; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}
float sdMark(vec2 p) {
  float r = length(p - ${ringC});
  return min(sdPoly6(p), max(r - ${f4(KEY.ring.R * MK)}, ${f4(KEY.ring.r * MK)} - r));
}

// ---- materials
vec3 matMetal(vec3 r, float fres) {
  // polished graphite metal: a bright, crisp mirror of the studio with a cool tint
  vec3 tint = mix(C_GRAPHITE, C_BONE, 0.55);
  return tint * 0.02 + env(r) * tint * mix(0.75, 1.0, fres) + envRough(r, 1.0) * tint * 0.12;
}
vec3 matFrosted(vec3 p, vec3 nw, vec3 r, float fres) {
  // frosted glass: no mirror image, just broad soft sheens that roll over it as it turns, a fine grain,
  // and a sharper reflection only at grazing angles
  float g = smoothstep(-HALF.y, HALF.y, p.y);
  vec3 base = mix(C_GRAPHITE * 0.3, C_ASH * 0.5, g * g);
  vec3 diff = envRough(nw, 0.3);
  vec3 sheen = envRough(r, 1.0);
  float grain = hash12(floor(p.xy * 2400.0)) - 0.5;
  // a near softbox up-left of the camera: its blurred highlight drifts across the face as it turns
  vec3 L = camPos + (-rt * 1.3 + up * 1.5 + fw * 0.3) * length(camPos - devPos) * 0.45;
  vec3 ld = normalize(L - gPw), hv = normalize(ld - normalize(gPw - camPos) * 1.0);
  float near = max(dot(nw, ld), 0.0) * 0.35 + pow(max(dot(nw, hv), 0.0), 26.0) * 0.9;
  vec3 col = base * (0.05 + 0.18 * diff + near * 0.6) + sheen * 0.1 + near * vec3(0.93, 1.0, 0.96) * 0.18 + env(r) * 0.2 * fres;
  return col * (1.0 + 0.1 * grain);
}
vec3 matScreen(vec3 p, vec3 r, float fres) {
  vec3 col = C_INK * 0.12;
  vec2 uv = p.xy / (SHALF * 2.0) + 0.5;
  float ds = sdRoundRect(p.xy, SHALF, SCORNER);
  float px = fwidth(ds) + 1e-5;
  float inS = 1.0 - smoothstep(-px, px, ds);
  vec3 img = texture(screenTex, uv).rgb;
  col += img * screenOn * inS * 1.15;
  return col;
}
vec3 matFrontGlass(vec3 p, vec3 r, float fres) {
  return matScreen(p, r, fres) + env(r) * mix(0.07, 1.0, fres);
}
vec3 matBack(vec3 p, vec3 nw, vec3 r, float fres, float px) {
  vec3 col = matFrosted(p, nw, r, fres);
  float dm = sdMark(p.xy);
  float m = 1.0 - smoothstep(-px, px, dm);
  col = mix(col, mix(C_INK * 0.5 + env(r) * 0.15, C_SIGNAL * 2.5, glint), m);
  col += C_SIGNAL * glint * 0.35 * exp(-max(dm, 0.0) * 60.0);
  vec2 cc = vec2(${f4(-D.cam.x)}, ${f4(D.cam.y)});
  float dc = length(p.xy - cc), R = ${f4(D.cam.r)}, R2 = ${f4(D.cam.r * 0.62)};
  float ring = smoothstep(R + px, R - px, dc) * smoothstep(R2 - px, R2 + px, dc);
  float lens = smoothstep(R2 + px, R2 - px, dc);
  // the machined ring: a conic, anisotropic sheen (as boot draws it) over the mirror
  float ca = fract((atan(-(p.y - cc.y), -(p.x - cc.x)) + 0.6) / 6.2831853);
  float cs = pow(0.5 + 0.5 * cos((ca - 0.18) * 6.2831853), 4.0) + 0.8 * pow(0.5 + 0.5 * cos((ca - 0.86) * 6.2831853), 4.0);
  col = mix(col, matMetal(r, fres) * 0.5 + mix(C_GRAPHITE * 0.4, C_BONE * 0.9, cs) * 0.55, ring);
  col = mix(col, vec3(0.004) + env(r) * 0.3 * fres + vec3(0.02, 0.03, 0.025) * smoothstep(0.03, 0.0, length(p.xy - cc + 0.012)), lens);
  return col;
}
vec3 matBand(vec3 p, vec3 r, float fres) {
  vec3 col = matMetal(r, fres);
  // antenna breaks, USB-C and speaker holes on the bottom edge, the side button on the right
  float br = min(abs(abs(p.y) - 0.60), abs(abs(p.x) - 0.33) + step(0.1, HALF.y - abs(p.y)) * 9.0);
  col = mix(col, C_INK * 0.4, (1.0 - smoothstep(0.0025, 0.0045, br)) * step(abs(p.z), TH * 0.8));
  if (p.y < -HALF.y + 0.05) {
    float slot = sdRoundRect(vec2(p.x, p.z), vec2(0.062, 0.017), 0.017);
    col = mix(col, vec3(0.002), 1.0 - smoothstep(-0.002, 0.002, slot));
    for (int i = 0; i < 3; i++) {
      float dh = length(vec2(p.x - (0.15 + 0.03 * float(i)), p.z)) - 0.008;
      col = mix(col, vec3(0.002), 1.0 - smoothstep(-0.0015, 0.0015, dh));
    }
  }
  if (p.x > HALF.x - 0.05) {
    float bt = sdRoundRect(vec2(p.y - 0.33, p.z), vec2(0.075, 0.022), 0.02);
    col = mix(col, col * 1.5 + 0.02, 1.0 - smoothstep(-0.002, 0.002, bt));
    col = mix(col, C_INK * 0.3, 1.0 - smoothstep(0.0, 0.0025, abs(bt)));
  }
  return col;
}
#ifdef PARTS
// ---- the main board. Materials: near-black satin solder mask over copper (the pour and the traces
// lift it slightly and their edges catch the light), ENIG gold pads, white silkscreen hairlines; the
// fine detail comes from the painted map (boardTex), bumped from its own gradient.
// The studio is looked up once per hit and shared by the materials (E: sharp mirror, R: satin lobe,
// D: diffuse), because the software GPU pays for every env call on every pixel.
const vec3 GOLD = vec3(1.0, 0.66, 0.3);
float boardTop() { return 0.006 + zOff(2) + BTH; }
vec3 toWorldN(vec3 n) { return normalize(transpose(devRot) * n); }
vec3 matBoard(vec3 p, vec3 n, vec3 rd, float fres, vec3 E, vec3 R, vec3 D, float ao) {
  vec3 q = p - vec3(0, BCY, 0);
  vec2 uv = (q.xy + BH) / (2.0 * BH);
  vec4 T = texture(boardTex, uv);
  // bump from the copper (and the silkscreen's ink) under the mask
  vec2 e = max(fwidth(uv) * 0.75, BTEXEL);
  float h0 = T.r * 0.8 + T.b * 0.25;
  float hx = dot(texture(boardTex, uv + vec2(e.x, 0.0)).rb, vec2(0.8, 0.25));
  float hy = dot(texture(boardTex, uv + vec2(0.0, e.y)).rb, vec2(0.8, 0.25));
  vec2 grad = vec2(hx - h0, hy - h0) / (e * 2.0 * BH) * 0.0007;
  grad = grad / max(1.0, length(grad) / 1.2);
  vec3 nb = toWorldN(normalize(vec3(-grad, 1.0)));
  vec3 rb = reflect(rd, nb);
  vec3 Eb = env(rb), Rb = envRough(rb, 1.8), Db = envRough(nb, 0.35);
  vec3 mask = mix(vec3(0.0052, 0.006, 0.0058), vec3(0.034, 0.03, 0.022), T.r * T.r);
  vec3 col = mask * (Db * 0.55 + 0.06) * ao;
  col += (Rb * (0.028 + 0.05 * T.r) + Eb * (0.014 + 0.012 * T.r + 0.3 * fres)) * mix(0.5, 1.0, ao);
  vec3 gold = GOLD * (Eb * 0.3 + Rb * 0.36 + 0.012) * mix(0.4, 1.0, ao);
  vec3 silk = vec3(0.6, 0.62, 0.58) * (Db * 0.3 + 0.035) * ao + Rb * 0.03;
  col = mix(col, silk, T.b * (1.0 - T.g));
  col = mix(col, gold, T.g);
  // the secure elements' light, spilling onto the board and catching their pads
${SE_POS.map(([x, y], i) => `  { float dd = max(sdRoundRect(q.xy - ${v2(x, y)}, vec2(SEH), 0.004), 0.0);
    col += C_SIGNAL * se[${i}] * (0.016 * exp(-dd * 80.0) + 0.004 * exp(-dd * 14.0) + T.g * 0.4 * exp(-dd * 160.0)); }`).join('\n')}
  // the board's edge: FR-4, dark
  return n.z < 0.7 ? vec3(0.02, 0.019, 0.013) * (0.4 + D * 0.5) + R * 0.02 : col;
}
float seGlow(float i) { return i < 0.5 ? se.x : i < 1.5 ? se.y : i < 2.5 ? se.z : se.w; }
vec3 matChip(vec3 p, vec3 n, float fres, vec3 E, vec3 R, vec3 D, vec4 a, vec4 b, float bd) {
  vec3 q = p - vec3(0, BCY, 0);
  float qz = p.z - boardTop();
  float kind = b.y;
  float fd = max(abs(sdRoundRect(q.xy - FEN.xy, FEN.zw, FEN2.x)) - FEN2.y, abs(qz - FEN2.z * 0.5) - FEN2.z * 0.5);
  // stamped nickel silver (fence, crystal can, USB-C shell): a bright satin metal with a fine grain
  float gr = hash12(floor(p.xy * vec2(6000.0, 300.0))) - 0.5;
  vec3 metal = vec3(0.72, 0.73, 0.71) * (E * 0.42 + R * 0.3 + D * 0.04) * (1.0 + 0.08 * gr);
  vec2 uv = clamp((q.xy - a.xy) / (2.0 * a.zw) + 0.5, 0.0, 1.0);
  float cell = b.z;
  vec2 cr = vec2(mod(cell, LIDG.x), floor(cell / LIDG.x));
  vec4 M = texture(lidTex, vec2((cr.x + uv.x) / LIDG.x, (LIDG.y - 1.0 - cr.y + uv.y) / LIDG.y));
  float top = smoothstep(0.6, 0.9, n.z), side = 1.0 - top;
  // mould compound: semi-gloss black lid, laser marking (matte, lighter). Only the flat top mirrors the
  // studio sharply: on the tiny rounded edge a sharp reflection breaks into steps where the softbox
  // edges cross it (it read as a lens warping the package), so the edge and sides take the soft lobes.
  float flt = smoothstep(0.97, 0.995, n.z);
  vec3 lid = vec3(0.0105, 0.011, 0.0115) * (D * 0.5 + 0.1) + R * 0.06 + mix(R * 0.05 + E * 0.02 * fres, E * (0.035 + 0.5 * fres), flt);
  vec3 etch = vec3(0.07, 0.072, 0.07) * (D * 0.7 + 0.12) + R * 0.015;
  vec3 col = mix(lid, etch, M.r * top);
  // tin leads peeking out along the bottom of the package sides
  float along = abs(n.x) > abs(n.y) ? q.y : q.x;
  col = mix(col, vec3(0.7) * (E * 0.4 + R * 0.3), step(fract(along / 0.0094), 0.32) * step(qz, 0.0022) * side);
  // a secure element: the die's green light through the marking and round the lid's edge
  float g = kind < 0.5 ? seGlow(cell) : 0.0;
  float edge = 1.0 - smoothstep(0.0, 0.01, min(a.z - abs(q.x - a.x), a.w - abs(q.y - a.y)));
  col += C_SIGNAL * g * (M.g * top * 1.6 + edge * top * 0.12 + side * 0.035);
  // BGA substrate: dark laminate with a satin top
  vec3 subs = vec3(0.02, 0.018, 0.011) * (D * 0.6 + 0.1) + R * 0.04 + E * 0.03 * fres;
  // connector: black LCP housing, gold contacts along its top
  vec3 conn = mix(vec3(0.012) * (D * 0.6 + 0.08) + R * 0.035, GOLD * (E * 0.3 + R * 0.35), M.r * top);
  col = kind > 3.5 ? conn : kind > 2.5 ? metal : kind > 1.5 ? subs : col;
  return fd < bd ? metal : col;
}
// passives: tan ceramic capacitors, black-topped resistors, bright tinned end caps
vec3 matPassive(vec3 p, vec3 n, vec3 E, vec3 R, vec3 D) {
  vec3 q = p - vec3(0, BCY, 0);
  vec2 g = (q.xy + BH) / PCELL;
  vec4 pc = texelFetch(passTex, clamp(ivec2(floor(g)), ivec2(0), PGRID - 1), 0);
  int ty = int(pc.x * 255.0 + 0.5);
  vec2 lc = (fract(g) - 0.5) * PCELL - (pc.yz - 0.5) * 0.01;
  if (pc.w > 0.5) lc = lc.yx;
  vec3 hs = ptSize(ty);
  bool cap = ty == 1 || ty == 3;
  vec3 body = cap ? vec3(0.1, 0.075, 0.045) : (n.z > 0.7 ? vec3(0.008) : vec3(0.3, 0.3, 0.28));
  vec3 col = body * (D * 0.6 + 0.06) + R * (cap ? 0.02 : 0.04);
  vec3 tin = vec3(0.75, 0.76, 0.74) * (E * 0.35 + R * 0.35 + 0.01);
  return mix(col, tin, step(hs.x * 0.56, abs(lc.x)));
}
vec3 matBattery(vec3 p, vec3 n, float fres, vec3 E, vec3 R, vec3 D) {
  // an aluminium-laminate pouch (satin), a black label film printed in white
  vec3 pouch = vec3(0.5, 0.51, 0.5) * (R * 0.3 + D * 0.08 + 0.01) + E * 0.08 * fres;
  vec2 uv = (p.xy - vec2(0.0, -0.06)) / vec2(0.8, 1.0) + 0.5;
  vec4 B = texture(batTex, uv) * step(0.7, n.z);
  vec3 film = vec3(0.008) * (D * 0.5 + 0.1) + R * 0.04 + E * (0.03 + 0.4 * fres);
  vec3 ink = vec3(0.5, 0.52, 0.5) * (D * 0.35 + 0.05) + R * 0.03;
  return mix(pouch, mix(film, ink, B.r), B.g);
}
vec3 matFlex(vec3 p, float fres, vec3 E, vec3 R, vec3 D) {
  // amber polyimide over fine copper lines, glossy; the plug at its end is black
  float plug = step(p.z, TH - 0.018 + zOff(1) - 0.006 - 2.0 * FLT - 2.0 * FLR - 0.001);
  float ln = step(0.55, fract((p.x - FLX) / 0.0042));
  vec3 pim = mix(vec3(0.13, 0.05, 0.008), vec3(0.3, 0.14, 0.03), ln) * (D * 0.6 + 0.08) + E * (0.06 + 0.4 * fres) + R * 0.04;
  return mix(pim, vec3(0.012) * (D * 0.6 + 0.08) + R * 0.035, plug);
}
#endif
vec3 matCover(vec3 r, float fres) { return env(r) * mix(0.06, 1.0, fres); }

// shade a hit (world point, ray dir); returns colour and, for the cover glass, its opacity
vec4 shade(vec3 pw, vec3 rd, float id, bool noCover) {
  gPw = pw;
  vec3 p = toDev(pw);
  vec3 nw = normalAt(pw, noCover);
  vec3 n = normalize(devRot * nw);
  vec3 r = reflect(rd, nw);
  float fres = pow(1.0 - max(dot(nw, -rd), 0.0), 5.0);
  float px = fwidth(p.x) + fwidth(p.y) + 1e-5;
#ifndef PARTS
  if (id > 8.5) {
    // the metal frame wraps round the rounded edge and the glass sits flat on it: blend over the
    // roundover so the edge reads as one continuous curve (SwiftShader runs every branch anyway)
    float wf = smoothstep(0.955, 0.995, n.z), wb = smoothstep(0.955, 0.995, -n.z);
    vec3 band = matBand(p, r, fres);
    vec3 face = n.z > 0.0 ? matFrontGlass(p, r, fres) : matBack(p, nw, r, fres, px);
    return vec4(mix(band, face, wf + wb), 1.0);
  }
#endif
#ifdef PARTS
  vec3 E = env(r), R = envRough(r, 1.6), D = envRough(nw, 0.35);
  vec3 q = p - vec3(0, BCY, 0);
  vec4 ca, cb; float bd;
  chipAt(q.xy, p.z - boardTop(), ca, cb, bd);
  if (id < 1.5) return vec4(n.z > 0.8 ? matScreen(p, r, fres) + E * (0.05 + 0.3 * fres) : vec3(0.6, 0.61, 0.6) * (E * 0.22 + R * 0.12), 1.0);
  if (id < 2.5) {
    // contact shadow from the nearest package (and the fence)
    float ao = 1.0 - 0.7 * exp(-max(sdRoundRect(q.xy - ca.xy, ca.zw, 0.003), 0.0) / (0.35 * cb.x + 0.0015));
    ao *= 1.0 - 0.5 * exp(-max(abs(sdRoundRect(q.xy - FEN.xy, FEN.zw, FEN2.x)) - FEN2.y, 0.0) / 0.005);
    return vec4(matBoard(p, n, rd, fres, E, R, D, ao), 1.0);
  }
  if (id < 3.5) return vec4(matChip(p, n, fres, E, R, D, ca, cb, bd), 1.0);
  if (id < 4.5) return vec4(matBattery(p, n, fres, E, R, D), 1.0);
  if (id < 5.5) return vec4(matBand(p, r, fres), 1.0);
  if (id > 6.5 && id < 7.5) return vec4(matPassive(p, n, E, R, D), 1.0);
  if (id > 7.5) return vec4(matFlex(p, fres, E, R, D), 1.0);
  if (n.z < -0.8) return vec4(matBack(p, nw, r, fres, px), 1.0);
  return vec4(matFrosted(p, nw, r, fres) * 0.5, 1.0);
#else
  return vec4(0.0);
#endif
}

// march; returns t (or -1) and the part id. Tracks the closest approach for silhouette antialiasing.
// With PARTS the cover glass is see-through: on hitting it the march notes where (gCoverT) and carries on.
float gCoverT;
vec2 march(vec3 ro, vec3 rd, float t0, float t1) {
  float t = t0;
  bool noCover = false;
  gMinR = 1e3; gMinT = t0; gMinId = 9.0; gCoverT = -1.0;
#ifdef PARTS
  for (int i = 0; i < 128; i++) {
#else
  for (int i = 0; i < 80; i++) {
#endif
    vec3 p = ro + rd * t;
    vec2 d = map(p, noCover);
    if (d.x < 0.0003 * t) {
#ifdef PARTS
      if (d.y < 0.5) { gCoverT = t; noCover = true; t += 0.014 * devScale; continue; }
#endif
      return vec2(t, d.y);
    }
    float ratio = d.x / t;
    if (ratio < gMinR) { gMinR = ratio; gMinT = t; gMinId = d.y; }
    t += d.x * 0.9;
    if (t > t1) break;
  }
  return vec2(-1.0, 0.0);
}

vec4 trace(vec2 px) {
  vec2 uv = (px - vec2(${(W / 2).toFixed(1)}, ${(H / 2).toFixed(1)})) / ${(H / 2).toFixed(1)};
  float tf = tan(fov * 0.5);
  vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) * tf);
  // bounding sphere
  float R = devScale * (0.96 + reach); // reach: the farthest any part sits from the device's centre plane
  vec3 oc = camPos - devPos;
  float b = dot(oc, rd), c = dot(oc, oc) - R * R, h = b * b - c;
  if (h < 0.0) return vec4(0.0);
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = -b + h;
  vec2 hit = march(camPos, rd, t0, t1);
  float cov = 1.0, tt = hit.x, id = hit.y;
  if (hit.x < 0.0) {
    // a near miss: partial coverage over about a pixel, shaded at the closest approach
    cov = 1.0 - smoothstep(0.0, tf / ${(H / 2).toFixed(1)} * 1.2, gMinR);
    tt = gMinT; id = gMinId;
  }
  vec4 col = cov > 0.0 ? vec4(shade(camPos + rd * tt, rd, id, true).rgb * cov, cov) : vec4(0.0);
#ifdef PARTS
  if (gCoverT > 0.0) {
    // the cover glass over what lies beneath: its normal is the device's z axis
    vec3 nz = normalize(transpose(devRot) * vec3(0.0, 0.0, 1.0));
    vec3 nw = dot(nz, rd) < 0.0 ? nz : -nz;
    float fres = pow(1.0 - max(dot(nw, -rd), 0.0), 5.0);
    // a smoked sheet with a polished rim, so it reads as glass from its first separation, head-on too
    vec3 pc = toDev(camPos + rd * gCoverT);
    float rim = exp(-max(-sdRoundRect(pc.xy, HALF - 0.004, CORNER - 0.004), 0.0) / 0.006);
    float a = 0.28 + 0.72 * fres;
    vec3 g = env(reflect(rd, nw)) * mix(0.08, 1.0, fres) + vec3(0.012, 0.013, 0.012);
    col = vec4(g * a + vec3(0.93, 1.0, 0.96) * rim * 0.35, a) + col * (1.0 - a);
  }
#endif
  return col;
}

void main() {
  fw = normalize(camTgt - camPos); rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))); up = cross(rt, fw);
  // one ray per pixel (silhouettes are antialiased in the march); on export the engine cycles the
  // rotated-grid taps over the motion-blur sub-frames
  vec4 acc = trace(FRAG_PX + (ssTap >= 0 ? rgss(ssTap) : vec2(0.0)));
  fragColor = vec4(acc.rgb * gain, acc.a);
}`;

/** Rotation matrix (device -> world) from [yaw, pitch, roll]: R = Ry * Rx * Rz. Row-major 3x3. */
function rotMat([yaw, pitch, roll]: V3): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]) => {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k]! * b[k * 3 + j]!;
    return o;
  };
  return mul(Ry, mul(Rx, Rz));
}

export class Device3D {
  rt = makeRT();
  screen = new Layer2D(SCREEN.w, SCREEN.h);
  private uniforms: Record<string, THREE.IUniform> = {
    ssTap: SS_TAP,
    camPos: { value: new THREE.Vector3() }, camTgt: { value: new THREE.Vector3() }, devPos: { value: new THREE.Vector3() },
    devRot: { value: new THREE.Matrix3() }, fov: { value: 0.6 }, devScale: { value: 1 }, sweep: { value: 9 }, glint: { value: 0 },
    screenOn: { value: 0 }, explode: { value: 0 }, lift: { value: 0 }, reach: { value: 0 }, gain: { value: 1 }, show: { value: [1, 1, 1, 1, 1, 1] },
    se: { value: new THREE.Vector4() }, screenTex: { value: null },
    boardTex: { value: null }, passTex: { value: null }, lidTex: { value: null }, batTex: { value: null }, pOff: { value: [0, 0, 0, 0, 0, 0] },
  };
  private _lids: LidAtlas | null = null;
  /** The package lids' laser markings (cells 0–3: the secure elements); draw with `lids.draw(i, fn)`. */
  get lids() { return (this._lids ??= new LidAtlas()); }
  // two builds of the shader: the whole device, and (only when exploded) its parts. The software GPU
  // runs every branch of a shader, so the solid build leaves the parts out entirely.
  private solid: FSPass | null = null;
  private parts: FSPass | null = null;
  pass(explode: boolean) {
    if (explode) {
      if (!this.parts) {
        // the board's painted material map, the passives layout and the battery label: built once
        const u = this.uniforms;
        u.boardTex!.value = boardTexture(paintBoard());
        u.passTex!.value = passTexture();
        u.batTex!.value = paintBattery();
        this.parts = new FSPass(FRAG(true), this.uniforms);
      }
      return this.parts;
    }
    return (this.solid ??= new FSPass(FRAG(false), this.uniforms));
  }

  render(renderer: THREE.WebGLRenderer, p: DevicePose, uploadScreen = (p.screen ?? 0) > 0) {
    const u = this.uniforms;
    (u.camPos!.value as THREE.Vector3).set(...p.cam);
    (u.camTgt!.value as THREE.Vector3).set(...p.tgt);
    (u.devPos!.value as THREE.Vector3).set(...(p.pos ?? [0, 0, 0]));
    const m = rotMat(p.rot ?? [0, 0, 0]);
    // world -> device is the transpose; Matrix3.set takes row-major
    (u.devRot!.value as THREE.Matrix3).set(m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!);
    u.fov!.value = p.fov;
    u.devScale!.value = p.scale ?? 1;
    u.sweep!.value = p.sweep ?? 9;
    u.glint!.value = p.glint ?? 0;
    u.screenOn!.value = p.screen ?? 0;
    u.explode!.value = p.explode ?? 0;
    u.lift!.value = p.lift ?? 0;
    u.gain!.value = p.gain ?? 1;
    u.show!.value = p.show ?? [1, 1, 1, 1, 1, 1];
    (u.se!.value as THREE.Vector4).set(...(p.se ?? [0, 0, 0, 0]));
    u.pOff!.value = p.offs ?? [0, 0, 0, 0, 0, 0];
    // the bounding sphere must hold every part, overshoots and drops included (a tight one clips the
    // plates into discs)
    u.reach!.value = Math.max(0.06, ...EXPLODE_Z.map((z, i) => Math.abs(z * (p.explode ?? 0) + (i < 2 ? p.lift ?? 0 : 0) + (p.offs?.[i] ?? 0)))) + 0.02;
    if ((p.explode ?? 0) > 0) u.lidTex!.value = this.lids.upload();
    if (uploadScreen) u.screenTex!.value = this.screen.upload();
    else if (!u.screenTex!.value) u.screenTex!.value = this.screen.texture;
    clearRT(renderer, this.rt, [0, 0, 0], 0);
    this.pass((p.explode ?? 0) > 0).render(renderer, this.rt);
    return this.rt.texture;
  }

  /** World position of a device-space point under a pose. */
  toWorld(p: DevicePose, q: V3): V3 {
    const m = rotMat(p.rot ?? [0, 0, 0]);
    const s = p.scale ?? 1, o = p.pos ?? [0, 0, 0];
    return [0, 1, 2].map((i) => o[i]! + s * (m[i * 3]! * q[0] + m[i * 3 + 1]! * q[1] + m[i * 3 + 2]! * q[2])) as V3;
  }

  /** Logical px (x right, y down) and camera depth of a device-space point under a pose. */
  project(p: DevicePose, q: V3): { x: number; y: number; z: number } {
    const w = this.toWorld(p, q);
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fw = norm(sub(p.tgt, p.cam)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
    const d = sub(w, p.cam), z = dot(d, fw), tf = Math.tan(p.fov / 2);
    return { x: W / 2 + (dot(d, rt) / z / tf) * (H / 2), y: H / 2 - (dot(d, up) / z / tf) * (H / 2), z };
  }
}

/** The device's outline (the silhouette at mid-thickness) in device space, as a closed polyline. */
export function outline(n = 96, grow = 0): V3[] {
  const hw = DEVICE.w / 2 + grow, hh = DEVICE.h / 2 + grow, r = DEVICE.corner + grow;
  const pts: V3[] = [];
  const corners: [number, number, number][] = [[hw - r, hh - r, 0], [-(hw - r), hh - r, Math.PI / 2], [-(hw - r), -(hh - r), Math.PI], [hw - r, -(hh - r), Math.PI * 1.5]];
  const per = n / 4;
  for (const [cx, cy, a0] of corners) for (let i = 0; i < per; i++) {
    const a = a0 + (i / (per - 1)) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]);
  }
  return pts;
}

/**
 * Set `c`'s transform so that drawing in a 100 × 100 box lands on a device-space quad: (0,0) at `a`,
 * (100,0) at `b`, (0,100) at `d` (an affine approximation of the perspective; fine for small quads).
 */
export function mapQuad(c: CanvasRenderingContext2D, dev: Device3D, pose: DevicePose, a: V3, b: V3, d: V3) {
  const A = dev.project(pose, a), B = dev.project(pose, b), D = dev.project(pose, d);
  c.setTransform((B.x - A.x) / 100, (B.y - A.y) / 100, (D.x - A.x) / 100, (D.y - A.y) / 100, A.x, A.y);
}

/** A camera orbiting `tgt` at distance `dist`: yaw about y (0 = looking at the display), pitch up. */
export function orbit(tgt: V3, dist: number, yaw: number, pitch: number): V3 {
  return [tgt[0] + Math.sin(yaw) * Math.cos(pitch) * dist, tgt[1] + Math.sin(pitch) * dist, tgt[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
}

/** Device z of the main board's top face under a pose (see PART_Z / EXPLODE_Z; the board is part 2). */
export function boardTopZ(p: DevicePose): number {
  return 0.006 + EXPLODE_Z[2]! * (p.explode ?? 0) + (p.offs?.[2] ?? 0) + BOARD.th;
}
/** Device-space centre of secure element i's lid (its top face) under a pose. */
export function seLid(p: DevicePose, i: number, dx = 0, dy = 0): V3 {
  return [SE_POS[i]![0] + dx, SE_POS[i]![1] + BOARD.cy + dy, boardTopZ(p) + SE_H];
}
