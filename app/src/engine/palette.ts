import { hexToLinear } from './util';

// The whole video lives in a restrained palette: graphite black, bone, and one signal colour,
// OneKey green (#44D62C, the logo's green; tints from OneKeyHQ/app-monorepo colors/primitive/brand.ts).
// Keys keep their upstream names so the engine and GLSL (C_SIGNAL, C_EMBER…) work unchanged.
// See docs/TREATMENT.md.
export const HEX = {
  ink: '#0A0B0A', // background black (the device's graphite, slightly green-neutral)
  ink2: '#141614', // raised black (panels, the screen when off)
  graphite: '#5B5F5B', // dim lines, secondary text, the metal frame
  ash: '#9A9F9A', // mid grey
  bone: '#EEF0EC', // paper white, primary text
  signal: '#44D62C', // OneKey green: the key, highlights, the sung word
  ember: '#B1F4A9', // hot light green for cores/highlights (brand12, dark theme)
  blood: '#108303', // deep green for shadows of signal (brand11)
  acid: '#FFFFFF', // unused: reserved for one moment if the treatment ever needs it
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
